import { expect,it } from 'vitest';
import { createTargetTracker } from './target';
import { gateAngle } from './gate';
import { humanPose } from '../test/fixtures';
const roi={x:0,y:0,width:640,height:360};
const tracker=()=>createTargetTracker(roi,640,360);
it('accepts stable single-person consistency without claiming verified identity',()=>{
 const t=tracker();expect(t.assess([humanPose()],0).identity).toBe('consistent-unverified');
 const q=t.assess([humanPose(.005)],200);expect(q.accepted).toBe(true);expect(q.continuity).toBe('continuous');
});
it('target disappearance latches invalidity rather than auto-attaching another person',()=>{
 const t=tracker();t.assess([humanPose()],0);
 const lost=t.assess([],200);expect(lost.identity).toBe('target-lost');expect(gateAngle({valid:true,rawAngleDeg:180,invalidReasons:[]},lost).rawAngleDeg).toBeNull();
 expect(t.assess([humanPose()],400).state).toBe('UNCERTAIN');expect(t.assess([humanPose()],600).accepted).toBe(true);
});
it('rejects high-visibility sudden subject switching',()=>{
 const t=tracker();t.assess([humanPose()],0);const q=t.assess([humanPose(.3)],200);
 expect(q.accepted).toBe(false);expect(q.identity).toBe('identity-uncertain');expect(q.continuity).toBe('discontinuous');
});
it('does not rank ambiguous people by candidate order or visibility',()=>{
 const q=tracker().assess([humanPose(-.1),humanPose(.1)],0);expect(q.accepted).toBe(false);expect(q.reasons).toContain('ambiguous-candidates');
});
it('reselection creates an independent track even when subjects cross',()=>{
 const t=tracker();t.assess([humanPose(-.1)],0);expect(t.assess([humanPose(.2)],200).accepted).toBe(false);
 expect(tracker().assess([humanPose(.2)],0).accepted).toBe(true);
});
it('separates limb occlusion confidence from torso identity consistency',()=>{
 const p=humanPose();p[25]!.visibility=.1;const q=tracker().assess([p],0);
 expect(q.landmarkConfidence).toBe('insufficient');expect(q.accepted).toBe(true);
});
it('missing torso anchor makes identity uncertain even if the knee points look good',()=>{
 const p=humanPose();p[11]!.visibility=.1;const q=tracker().assess([p],0);
 expect(q.accepted).toBe(false);expect(q.reasons).toContain('unreliable-torso-anchors');
});
it('extrapolated target outside selected ROI is invalid',()=>{
 const p=humanPose();p[27]!.x=1.1;const q=tracker().assess([p],0);expect(q.accepted).toBe(false);expect(q.reasons).toContain('roi-boundary-or-extrapolation');
});
it('rejects degenerate or implausible mixed projected geometry',()=>{
 const p=humanPose();p[25]={...p[23]!};const q=tracker().assess([p],0);expect(q.plausibility).toBe('implausible');expect(q.accepted).toBe(false);
});
it('rejects sudden limb length change and non-monotonic timestamps',()=>{
 const t=tracker();t.assess([humanPose()],0);const p=humanPose();p[27]!.y=.73;
 expect(t.assess([p],200).reasons).toContain('temporal-jump-or-scale-change');
 const other=tracker();other.assess([humanPose()],0);expect(other.assess([humanPose()],0).accepted).toBe(false);
});
it('documents the limit: a similar wrong person with no detectable jump can pass heuristics',()=>{
 const t=tracker();t.assess([humanPose()],0);expect(t.assess([humanPose(.002)],200).identity).toBe('consistent-unverified');
});

it('before/after synthetic regression: suppresses false-valid angles after a subject switch',async()=>{
 const {kneeAngle}=await import('../biomechanics/knee');
 const frames=[humanPose(),humanPose(.3),humanPose(.3)];const t=tracker();
 const old=frames.map(p=>kneeAngle(p,'left',640,360));
 const next=frames.map((p,i)=>gateAngle(kneeAngle(p,'left',640,360),t.assess([p],i*200)));
 expect(old.filter(a=>a.valid)).toHaveLength(3);expect(next.filter(a=>a.valid)).toHaveLength(1);
 expect(next[1]!.invalidReasons).toContain('identity-uncertain');expect(frames[1]![25]!.visibility).toBe(1);
});
