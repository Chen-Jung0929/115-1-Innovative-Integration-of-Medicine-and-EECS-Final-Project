import {expect,it} from 'vitest';
import {createRoiController,boundedFollow,FOLLOW_POLICY} from './controller';
import {humanPose,selection} from '../test/fixtures';
const roi={x:150,y:20,width:300,height:320};
const key={id:'manual-0',timeMs:0,roi,source:'manual-target-confirmation' as const};
const adaptive={...selection,roi,method:'adaptive-roi' as const,keyframes:[key]};
const make=()=>createRoiController(adaptive,640,360);
it('follows gradual subject and mild camera displacement with bounded center/scale changes',()=>{
 const c=make();let prior=roi;let moved=false;
 for(let i=0;i<8;i++){
  const plan=c.propose(i*200);const p=humanPose(i*.005).map(p=>({...p,y:p.y+i*.002}));
  const q=c.observe([p],i*200,plan).tracking;expect(q.accepted).toBe(true);
  expect(Math.abs(plan.roi.x+plan.roi.width/2-prior.x-prior.width/2)).toBeLessThanOrEqual(prior.width*FOLLOW_POLICY.maxShiftFraction+2);
  expect(Math.abs(plan.roi.width-prior.width)).toBeLessThanOrEqual(prior.width*FOLLOW_POLICY.maxSizeFraction+1);
  expect(plan.roi.x+plan.roi.width).toBeLessThanOrEqual(640);expect(plan.roi.y+plan.roi.height).toBeLessThanOrEqual(360);
  moved ||= plan.roi.x!==roi.x;prior=plan.roi;
 }
 expect(moved).toBe(true);
});
it('holds ROI after rejected identity jump rather than following untrusted points',()=>{
 const c=make();let plan=c.propose(0);c.observe([humanPose()],0,plan);plan=c.propose(200);
 expect(c.observe([humanPose(.2)],200,plan).tracking.state).toBe('MANUAL_REVIEW_REQUIRED');
 const next=c.propose(400);expect(next.roi).toEqual(plan.roi);expect(next.roiSource).toBe('held-invalid');
});
it('short disappearance has invalid samples then needs two consistent observations to recover',()=>{
 const c=make();c.observe([humanPose()],0,c.propose(0));
 expect(c.observe([],200,c.propose(200)).tracking.state).toBe('LOST');
 expect(c.observe([humanPose()],400,c.propose(400)).tracking.accepted).toBe(false);
 expect(c.observe([humanPose()],600,c.propose(600)).tracking.state).toBe('TRACKING');
});
it('prolonged loss does not auto-attach a person later',()=>{
 const c=make();c.observe([humanPose()],0,c.propose(0));
 for(const t of [200,400,600,800])c.observe([],t,c.propose(t));
 expect(c.observe([humanPose()],1000,c.propose(1000)).tracking.state).toBe('MANUAL_REVIEW_REQUIRED');
});
it('full-frame ambiguous nearby people reject a plausible single primary pose',()=>{
 const c=make();const plan=c.propose(0);
 const result=c.observe([humanPose()],0,plan,[humanPose(),humanPose(.05)]);
 expect(result.tracking.accepted).toBe(false);expect(result.tracking.state).toBe('MANUAL_REVIEW_REQUIRED');expect(result.search?.status).toBe('ambiguous-manual-review');
});
it('ignores far unrelated full-frame people but does not call a unique candidate verified identity',()=>{
 const c=make();const result=c.observe([humanPose()],0,c.propose(0),[humanPose(),humanPose(.4)]);
 expect(result.tracking.accepted).toBe(true);expect(result.tracking.identity).toBe('consistent-unverified');
 expect(result.search?.status).toContain('not-identity-proof');
});
it('a full-frame suggestion is retained but not automatically used as a valid measurement',()=>{
 const c=make();c.observe([humanPose()],0,c.propose(0));
 const result=c.observe([],200,c.propose(200),[humanPose(.01)]);
 expect(result.tracking.accepted).toBe(false);expect(result.search?.suggestedRoi).not.toBeNull();expect(result.search?.candidates).toHaveLength(1);
});
it('manual keyframe explicitly resets uncertain identity at a new source region',()=>{
 const correction={id:'manual-400',timeMs:400,roi:{...roi,x:260},source:'manual-target-confirmation' as const};
 const c=createRoiController({...adaptive,keyframes:[key,correction]},640,360);
 c.observe([humanPose()],0,c.propose(0));expect(c.observe([humanPose(.2)],200,c.propose(200)).tracking.accepted).toBe(false);
 const plan=c.propose(400);expect(plan.resetModel).toBe(true);expect(plan.previousState).toBe('MANUAL_REVIEW_REQUIRED');
 expect(c.observe([humanPose(.2)],400,plan).tracking.accepted).toBe(true);
});
it('bounded follow clamps even extreme suggestions without changing its seed',()=>{
 const seed={roi,body:{x:320,y:126,torso:108}};const before=structuredClone(seed);
 const next=boundedFollow(roi,humanPose(.3),seed,640,360);
 expect(next.width).toBeLessThanOrEqual(Math.round(roi.width*1.05));expect(seed).toEqual(before);
 expect(boundedFollow(roi,[],seed,640,360)).toEqual(roi);
});
it('fixed mode remains fixed and does not request periodic search',()=>{
 const c=createRoiController(selection,320,180);expect(c.propose(0).searchDue).toBe(false);expect(c.propose(200).roi).toEqual(selection.roi);
});
it('full-frame inference failure is recorded and cannot certify target identity',()=>{
 const c=make();const result=c.observe([humanPose()],0,c.propose(0),undefined,'synthetic search unavailable');
 expect(result.tracking.state).toBe('MANUAL_REVIEW_REQUIRED');expect(result.tracking.accepted).toBe(false);expect(result.search?.error).toBe('synthetic search unavailable');
});
it('target briefly outside the crop can be suggested globally but only recovers on consistent return',()=>{
 const c=make();c.observe([humanPose()],0,c.propose(0));
 const outside=humanPose(.12);expect(outside[28]!.x*640).toBeGreaterThan(roi.x+roi.width);
 const lost=c.observe([],200,c.propose(200),[outside]);expect(lost.tracking.state).toBe('LOST');expect(lost.search?.suggestedRoi).not.toBeNull();
 expect(c.observe([humanPose()],400,c.propose(400)).tracking.accepted).toBe(false);
 expect(c.observe([humanPose()],600,c.propose(600)).tracking.accepted).toBe(true);
});
it('permanent manual-review state limits full-frame search to the periodic budget',()=>{
 const c=make();c.observe([humanPose()],0,c.propose(0),[humanPose(),humanPose(.05)]);
 expect(c.propose(200).searchDue).toBe(false);expect(c.propose(1000).searchDue).toBe(true);
});
it('local knee failure holds crop updates without turning torso continuity into an identity lock',()=>{
 const c=make();c.observe([humanPose()],0,c.propose(0));
 const plan=c.propose(200),bad=humanPose();bad[25]!.y=.57;
 const q=c.observe([bad],200,plan).tracking;expect(q.accepted).toBe(true);expect(q.joints!.left.valid).toBe(false);
 const held=c.propose(400);expect(held.roi).toEqual(plan.roi);expect(held.roiSource).toBe('held-invalid');
});
