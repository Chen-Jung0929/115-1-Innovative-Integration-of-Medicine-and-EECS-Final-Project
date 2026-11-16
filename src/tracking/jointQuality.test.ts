import {expect,it} from 'vitest';
import {createFullFrameIdentity} from './identity';
import {createTargetTracker} from './target';
import {humanPose} from '../test/fixtures';
import {gateAngle} from './gate';
import {kneeAngle} from '../biomechanics/knee';
const roi={x:0,y:0,width:640,height:360};
const anomaly=()=>{const p=humanPose();p[25]!.y=.57;return p;};
it('one-side segment jump cannot lock identity or invalidate the other side; requires stable confirmations',()=>{
 const t=createFullFrameIdentity(640,360);
 t.observe([humanPose()],0,roi);
 const bad=t.observe([anomaly()],200,roi).tracking;
 expect(bad.accepted).toBe(true);expect(bad.state).toBe('TRACKING');expect(bad.joints!.left.valid).toBe(false);expect(bad.joints!.right.valid).toBe(true);
 expect(gateAngle(kneeAngle(anomaly(),'left',640,360),bad,'left').rawAngleDeg).toBeNull();
 expect(gateAngle(kneeAngle(anomaly(),'left',640,360),bad).valid).toBe(false);
 expect(t.observe([humanPose()],400,roi).tracking.joints!.left.state).toBe('RECOVERING');
 expect(t.observe([humanPose()],600,roi).tracking.joints!.left.valid).toBe(true);
});
it('stable post-anomaly lengths can form a new tentative baseline only after confirmation',()=>{
 const t=createFullFrameIdentity(640,360);t.observe([humanPose()],0,roi);
 expect(t.observe([anomaly()],200,roi).tracking.joints!.left.valid).toBe(false);
 expect(t.observe([anomaly()],400,roi).tracking.joints!.left.valid).toBe(false);
 expect(t.observe([anomaly()],600,roi).tracking.joints!.left.valid).toBe(true);
});
it('alternating or low confidence observations never satisfy joint recovery',()=>{
 const t=createFullFrameIdentity(640,360);t.observe([humanPose()],0,roi);t.observe([anomaly()],200,roi);
 for(let i=2;i<12;i++){
  const q=t.observe([i%2?anomaly():humanPose()],i*200,roi).tracking;
  expect(q.accepted).toBe(true);expect(q.joints!.left.valid).toBe(false);expect(q.state).toBe('TRACKING');
 }
 const low=humanPose();low[25]!.visibility=.1;
 const q=t.observe([low],2400,roi).tracking;expect(q.joints!.left.reasons).toContain('low-confidence');expect(q.joints!.left.confirmationCount).toBe(0);
});
it('confirmation streak resets on gaps and unreliability; strict variant needs three returns',()=>{
 const t=createFullFrameIdentity(640,360,{jointConfirmations:3});t.observe([humanPose()],0,roi);t.observe([anomaly()],200,roi);
 expect(t.observe([humanPose()],400,roi).tracking.joints!.left.confirmationCount).toBe(1);
 expect(t.observe([humanPose()],800,roi).tracking.joints!.left.confirmationCount).toBe(1);
 expect(t.observe([humanPose()],1000,roi).tracking.joints!.left.valid).toBe(false);
 expect(t.observe([humanPose()],1200,roi).tracking.joints!.left.valid).toBe(true);
});
it('joint confidence failure cannot make prolonged torso loss recover automatically',()=>{
 const t=createFullFrameIdentity(640,360);t.observe([humanPose()],0,roi);t.observe([anomaly()],200,roi);
 for(const time of [400,600,800,1000])t.observe([],time,roi);
 for(const time of [1200,1400,1600])expect(t.observe([humanPose()],time,roi).tracking.state).toBe('MANUAL_REVIEW_REQUIRED');
});
it('ambiguity and torso jump remain persistent manual locks despite healthy legs',()=>{
 for(const caseName of ['ambiguity','torso-jump']){
  const t=createFullFrameIdentity(640,360);t.observe([humanPose()],0,roi);
  const p=caseName==='ambiguity'?[humanPose(),humanPose(.01)]:[humanPose(.3)];
  expect(t.observe(p,200,roi).tracking.state).toBe('MANUAL_REVIEW_REQUIRED');
  for(const time of [400,600,800])expect(t.observe([humanPose()],time,roi).tracking.accepted).toBe(false);
 }
});
it('B uses torso-only crop identity while preserving local leg bounds',()=>{
 const t=createTargetTracker(roi,640,360);t.assess([humanPose()],0);
 const p=humanPose();p[27]!.x=.99;
 const q=t.assess([p],200);expect(q.accepted).toBe(true);expect(q.joints!.left.valid).toBe(false);expect(q.joints!.right.valid).toBe(true);
 const torso=humanPose();torso[11]!.x=.01;
 expect(t.assess([torso],400).accepted).toBe(false);
});
it('persistent degenerate legs do not update local baseline or produce confirmed angles',()=>{
 const t=createFullFrameIdentity(640,360);t.observe([humanPose()],0,roi);
 for(let i=1;i<8;i++){const p=humanPose();p[25]={...p[23]!};const q=t.observe([p],i*200,roi).tracking;expect(q.accepted).toBe(true);expect(q.joints!.left.valid).toBe(false);expect(q.joints!.left.state).toBe('INVALID');}
});
it('strict recovery cannot accumulate scale drift across a sequence of individually small changes',()=>{
 const t=createFullFrameIdentity(640,360,{jointConfirmations:3});t.observe([humanPose()],0,roi);t.observe([anomaly()],200,roi);
 for(const [i,scale] of [.8,.96,1.152].entries()){
  const p=humanPose();p[25]!.y=.5+.2*scale;p[27]!.y=.5+.4*scale;
  expect(t.observe([p],400+i*200,roi).tracking.joints!.left.valid).toBe(false);
 }
});
