import {expect,it} from 'vitest';
import {createFullFrameIdentity} from './identity';
import {humanPose} from '../test/fixtures';
const ref={x:250,y:0,width:140,height:360};
it('tracks the same person through candidate-order permutations and rejects crossings',()=>{
 const t=createFullFrameIdentity(640,360);
 expect(t.observe([humanPose(),humanPose(-.35)],0,ref).decision.selectedIndex).toBe(0);
 expect(t.observe([humanPose(-.35),humanPose(.005)],200,ref).decision.selectedIndex).toBe(1);
 const ambiguous=t.observe([humanPose(.01),humanPose(.02)],400,ref);expect(ambiguous.tracking.state).toBe('MANUAL_REVIEW_REQUIRED');expect(ambiguous.decision.selectedIndex).toBeNull();
 expect(t.observe([humanPose(.01)],600,ref).tracking.accepted).toBe(false);
});
it('does not limit an accepted subject to the initial reference rectangle',()=>{
 const narrow={x:315,y:110,width:32,height:32};const t=createFullFrameIdentity(640,360);
 expect(t.observe([humanPose()],0,narrow).tracking.accepted).toBe(true);
 for(let i=1;i<8;i++)expect(t.observe([humanPose(i*.01)],i*200,narrow).tracking.accepted).toBe(true);
});
it('keeps landmark QC distinct from identity, rejecting degenerate bones and low torso confidence',()=>{
 const p=humanPose();p[25]={...p[23]!};const t=createFullFrameIdentity(640,360);
 const q=t.observe([p],0,ref);expect(q.tracking.accepted).toBe(false);expect(q.tracking.plausibility).toBe('implausible');
});
it('short loss recovery needs two stable returns, while a distant person is never attached',()=>{
 const t=createFullFrameIdentity(640,360);t.observe([humanPose()],0,ref);expect(t.observe([],200,ref).tracking.state).toBe('LOST');
 expect(t.observe([humanPose()],400,ref).tracking.accepted).toBe(false);expect(t.observe([humanPose()],600,ref).tracking.accepted).toBe(true);
 expect(t.observe([humanPose(-.35)],800,ref).tracking.accepted).toBe(false);
});
it('manual reconfirmation uses a new identity state, not the old candidate index',()=>{
 const t=createFullFrameIdentity(640,360);t.observe([humanPose(),humanPose(.02)],0,ref);
 expect(t.observe([humanPose()],200,ref).tracking.accepted).toBe(false);
 expect(createFullFrameIdentity(640,360).observe([humanPose()],200,ref).tracking.accepted).toBe(true);
});
it('full-frame recovery does not waive limb-scale QC when the torso alone looks stable',()=>{
 const t=createFullFrameIdentity(640,360);t.observe([humanPose()],0,ref);t.observe([],200,ref);
 const p=humanPose();p[25]!.y=.65;
 const result=t.observe([p],400,ref);expect(result.tracking.accepted).toBe(false);expect(result.tracking.reasons).toContain('recovery-not-identity-consistent');
});
