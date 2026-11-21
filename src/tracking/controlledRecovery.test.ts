import {expect,it} from 'vitest';
import {createFullFrameIdentity} from './identity';
import {humanPose} from '../test/fixtures';
import {gateAngle} from './gate';
import {kneeAngle} from '../biomechanics/knee';
const ref={x:0,y:0,width:640,height:360};
function initialized(controlledSingle=true){const t=createFullFrameIdentity(640,360,{controlledSingle});for(let i=0;i<16;i++)t.observe([humanPose()],i*200,ref);return t;}
it('3.2s single-person jump is invalid until three strict confirmations and separate joint recovery',()=>{
 const t=initialized();const valid:boolean[]=[];
 for(let i=16;i<30;i++){
  const p=humanPose(.14);p[26]!.visibility=.1; // One occluded knee must remain invalid, not prevent reliable left-side recovery.
  const r=t.observe([p],i*200,ref);
  valid.push(gateAngle(kneeAngle(p,'left',640,360),r.tracking,'left').valid);
  expect(r.tracking.state).not.toBe('MANUAL_REVIEW_REQUIRED');
  expect(gateAngle(kneeAngle(p,'right',640,360),r.tracking,'right').valid).toBe(false);
  if(i<=19)expect(r.tracking.recovery!.confirmations).toBe(i-16);
 }
 expect(valid.slice(0,5)).toEqual([false,false,false,false,true]);expect(valid.slice(5).every(Boolean)).toBe(true);
});
it('the experimental/manual-target path retains its original torso-jump lock',()=>{
 const t=initialized(false);expect(t.observe([humanPose(.14)],3200,ref).tracking.state).toBe('MANUAL_REVIEW_REQUIRED');
 expect(t.observe([humanPose()],3400,ref).tracking.accepted).toBe(false);
});
it('multiple candidates during recovery require manual review even if only one is near the anchor',()=>{
 const t=initialized();t.observe([humanPose(.14)],3200,ref);
 expect(t.observe([humanPose(.14),humanPose(-.3)],3400,ref).tracking.state).toBe('MANUAL_REVIEW_REQUIRED');
 for(const time of [3600,3800,4000])expect(t.observe([humanPose()],time,ref).tracking.accepted).toBe(false);
});
it('timeout, large anchor displacement and explicit manual locks cannot auto-recover',()=>{
 const timeout=initialized();timeout.observe([humanPose(.14)],3200,ref);
 for(let time=3400;time<=4800;time+=200){const p=humanPose(.14);p[11]!.visibility=.1;timeout.observe([p],time,ref);}
 expect(timeout.observe([humanPose()],5000,ref).tracking.state).toBe('MANUAL_REVIEW_REQUIRED');
 const distant=initialized();expect(distant.observe([humanPose(.4)],3200,ref).tracking.state).toBe('MANUAL_REVIEW_REQUIRED');
 const manual=initialized();manual.requireManual('human-confirmation-needed');expect(manual.observe([humanPose()],3200,ref).tracking.accepted).toBe(false);
});
it('missing or unstable recovery observations reset confirmations; no interpolation is accepted',()=>{
 const t=initialized();t.observe([humanPose(.14)],3200,ref);t.observe([humanPose(.14)],3400,ref);
 expect(t.observe([],3600,ref).tracking.accepted).toBe(false);
 expect(t.observe([humanPose(.14)],3800,ref).tracking.recovery!.confirmations).toBe(0);
 expect(t.observe([humanPose(.14)],4000,ref).tracking.accepted).toBe(false);
});
