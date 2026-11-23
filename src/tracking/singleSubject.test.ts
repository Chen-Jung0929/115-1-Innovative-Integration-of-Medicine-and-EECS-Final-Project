import {expect,it} from 'vitest';
import {createFullFrameIdentity} from './identity';
import {createFullFrameIdentity as frozen} from './legacy/identity';
import {humanPose} from '../test/fixtures';
import {kneeAngle} from '../biomechanics/knee';
import {gateAngle} from './gate';
const ref={x:0,y:0,width:640,height:360};
it('controlled single regression: a transient leg jump at 0.8s cannot destroy the remaining 151 observations',()=>{
 const old=frozen(640,360),current=createFullFrameIdentity(640,360);
 const oldValid:boolean[]=[],next:boolean[]=[],right:boolean[]=[];
 for(let i=0;i<155;i++){
  const p=humanPose();if(i===4)p[25]!.y=.57;
  const legacy=old.observe([p],i*200,ref),result=current.observe([p],i*200,ref);
  oldValid.push(legacy.tracking.accepted);
  next.push(gateAngle(kneeAngle(p,'left',640,360),result.tracking,'left').valid);
  right.push(gateAngle(kneeAngle(p,'right',640,360),result.tracking,'right').valid);
  expect(result.tracking.state).toBe('TRACKING');
  if(i===4){expect(result.landmarks).toEqual(p);expect(kneeAngle(p,'left',640,360).valid).toBe(true);expect(next[i]).toBe(false);}
 }
 expect(oldValid.filter(Boolean)).toHaveLength(4);expect(next.slice(4,7)).toEqual([false,false,true]);
 expect(next.slice(7).every(Boolean)).toBe(true);expect(right.every(Boolean)).toBe(true);
});
it('missing or low-confidence first observation waits for reliable initialization instead of creating a permanent lock',()=>{
 for(const first of [[],[humanPose().map((p,i)=>i===11?{...p,visibility:.1}:p)]]){
  const t=createFullFrameIdentity(640,360);const initial=t.observe(first,0,ref);
  expect(initial.tracking.accepted).toBe(false);expect(initial.tracking.state).not.toBe('MANUAL_REVIEW_REQUIRED');
  const pending=t.observe([humanPose()],200,ref);expect(pending.tracking.joints!.left.valid).toBe(false);
  const ready=t.observe([humanPose()],400,ref);expect(ready.tracking.joints!.left.valid).toBe(true);expect(ready.tracking.accepted).toBe(true);
 }
});
it('one missing pose after initialization needs torso and joint confirmations, and preserves the gap',()=>{
 const t=createFullFrameIdentity(640,360);t.observe([humanPose()],0,ref);
 expect(t.observe([],200,ref).tracking.accepted).toBe(false);
 expect(t.observe([humanPose()],400,ref).tracking.accepted).toBe(false);
 expect(t.observe([humanPose()],600,ref).tracking.joints!.left.valid).toBe(false);
 expect(t.observe([humanPose()],800,ref).tracking.joints!.left.valid).toBe(true);
});
it('unreliable observations remain invalid, and a real identity ambiguity still locks',()=>{
 const t=createFullFrameIdentity(640,360);const p=humanPose();p[25]!.visibility=.1;
 for(let i=0;i<10;i++)expect(t.observe([p],i*200,ref).tracking.joints!.left.valid).toBe(false);
 const ambiguous=t.observe([humanPose(),humanPose(.01)],2000,ref);expect(ambiguous.tracking.state).toBe('MANUAL_REVIEW_REQUIRED');
 expect(t.observe([humanPose()],2200,ref).tracking.accepted).toBe(false);
});
