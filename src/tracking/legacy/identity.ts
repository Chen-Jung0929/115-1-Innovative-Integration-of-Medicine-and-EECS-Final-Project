// Frozen v0.5.0 identity policy for replay; paired with legacy target constants.
import type {Landmark} from '../../domain/analysis';
import type {Roi,TrackingQuality,TrackingState} from '../../domain/tracking';
import {poseQuality,torsoOf,type Torso} from './poseQuality';
import {selectInitialSubject,type CandidateSelection} from './subject';
import {TRACKING_POLICY as POLICY} from './target';
export const IDENTITY_POLICY='full-frame-reference-continuity-v1';
export function associateByContinuity(candidates:readonly Landmark[][],previous:Torso,dtSeconds:number,width:number,height:number):CandidateSelection {
 if(!(dtSeconds>0))return {selectedIndex:null,proposedIndex:null,reason:'non-increasing-source-time'};
 const ranked=candidates.map((p,index)=>({index,b:torsoOf(p,width,height)})).filter(c=>c.b).map(c=>({...c,d:Math.hypot(c.b!.x-previous.x,c.b!.y-previous.y)/Math.max(c.b!.length,previous.length),scale:Math.max(c.b!.length/previous.length,previous.length/c.b!.length)})).sort((a,b)=>a.d-b.d);
 const consistent=ranked.filter(c=>c.d/dtSeconds<=POLICY.maxCenterTorsoPerSecond&&c.scale<=POLICY.maxSegmentScaleChange);
 if(consistent.length===1)return {selectedIndex:consistent[0]!.index,proposedIndex:consistent[0]!.index,reason:'unique-temporally-consistent-candidate'};
 return {selectedIndex:null,proposedIndex:ranked[0]?.index??null,reason:consistent.length>1?'ambiguous-temporal-subject':candidates.length?'target-not-continuous':'no-pose'};
}
/** Identity state is updated only after independent observation QC accepts the candidate. */
export function createFullFrameIdentity(width:number,height:number) {
 let previous:{body:Torso;time:number;lengths:(number|null)[]}|null=null,state:TrackingState='TRACKING',returns=0;
 return {observe(candidates:Landmark[][],time:number,reference:Roi){
  let decision=previous?associateByContinuity(candidates,previous.body,(time-previous.time)/1000,width,height):selectInitialSubject(candidates,reference,width,height);
  const points=decision.proposedIndex===null?[]:candidates[decision.proposedIndex]!;
  const qc=poseQuality(points,width,height);
  let continuity:TrackingQuality['continuity']=!previous?'initial':decision.selectedIndex===null?'discontinuous':'continuous';
  let accepted=decision.selectedIndex!==null&&qc.accepted;
  const reasons:string[]=[];
  if(decision.reason.startsWith('ambiguous')||decision.reason==='non-increasing-source-time'){state='MANUAL_REVIEW_REQUIRED';}
  if(previous&&qc.lengths.some((l,i)=>l!==null&&previous!.lengths[i]!=null&&Math.max(l/previous!.lengths[i]!,previous!.lengths[i]!/l)>POLICY.maxSegmentScaleChange)){accepted=false;state='MANUAL_REVIEW_REQUIRED';continuity='discontinuous';reasons.push('temporal-limb-scale-change');}
  if(state==='MANUAL_REVIEW_REQUIRED'){accepted=false;reasons.push('manual-reselection-required');}
  if(!accepted){
   returns=0;reasons.push(decision.reason,...qc.reasons);
   if(state!=='MANUAL_REVIEW_REQUIRED')state=!previous||time-previous.time>POLICY.recoveryGapMs?'MANUAL_REVIEW_REQUIRED':candidates.length?'UNCERTAIN':'LOST';
  }else if(previous&&state!=='TRACKING'){
   const b=qc.torso!;const close=Math.hypot(b.x-previous.body.x,b.y-previous.body.y)/Math.max(b.length,previous.body.length)<=POLICY.recoveryCenterTorso;
   const stable=Math.max(b.length/previous.body.length,previous.body.length/b.length)<=POLICY.recoveryScaleChange&&qc.lengths.every((l,i)=>l===null||previous!.lengths[i]==null||Math.max(l/previous!.lengths[i]!,previous!.lengths[i]!/l)<=POLICY.recoveryScaleChange);
   if(time-previous.time>POLICY.recoveryGapMs||!close||!stable){state='MANUAL_REVIEW_REQUIRED';accepted=false;reasons.push('recovery-not-identity-consistent');}
   else if(++returns<POLICY.recoveryConfirmations){state='UNCERTAIN';accepted=false;reasons.push('recovery-confirmation-pending');}
  }
  if(accepted){previous={body:qc.torso!,time,lengths:qc.lengths};state='TRACKING';returns=0;}
  decision={...decision,selectedIndex:accepted?decision.selectedIndex:null};
  const tracking:TrackingQuality={state,accepted,identity:accepted?'consistent-unverified':!candidates.length?'target-lost':'identity-uncertain',landmarkConfidence:qc.landmarkConfidence,plausibility:qc.plausibility,continuity,reasons};
  return {decision,tracking,landmarks:points};
 }};
}
