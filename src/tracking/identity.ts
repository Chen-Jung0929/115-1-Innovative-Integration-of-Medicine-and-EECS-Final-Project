import type {Landmark} from '../domain/analysis';
import type {Roi,TrackingQuality,TrackingState} from '../domain/tracking';
import {poseQuality,torsoOf,confident,type Torso} from '../biomechanics/poseQuality';
import {selectInitialSubject,type CandidateSelection} from '../selection/subject';
import {TRACKING_POLICY as POLICY} from './policy';
import {createJointQuality} from './jointQuality';
export const IDENTITY_POLICY='torso-identity-independent-joints-v3';
export function associateByContinuity(candidates:readonly Landmark[][],previous:Torso,dtSeconds:number,width:number,height:number):CandidateSelection {
 if(!(dtSeconds>0))return {selectedIndex:null,proposedIndex:null,reason:'non-increasing-source-time'};
 const ranked=candidates.map((p,index)=>({index,b:torsoOf(p,width,height)})).filter(c=>c.b).map(c=>({...c,d:Math.hypot(c.b!.x-previous.x,c.b!.y-previous.y)/Math.max(c.b!.length,previous.length),scale:Math.max(c.b!.length/previous.length,previous.length/c.b!.length)})).sort((a,b)=>a.d-b.d);
 const consistent=ranked.filter(c=>c.d/dtSeconds<=POLICY.maxCenterTorsoPerSecond&&c.scale<=POLICY.maxSegmentScaleChange);
 if(consistent.length===1)return {selectedIndex:consistent[0]!.index,proposedIndex:consistent[0]!.index,reason:'unique-temporally-consistent-candidate'};
 return {selectedIndex:null,proposedIndex:ranked[0]?.index??(candidates.length===1?0:null),reason:consistent.length>1?'ambiguous-temporal-subject':candidates.length?'target-not-continuous':'no-pose'};
}
/** Torso identity history is independent of joint validity. Manual identity locks never auto-clear. */
export function createFullFrameIdentity(width:number,height:number,options:{crop?:boolean;jointConfirmations?:2|3}={}) {
 let previous:{body:Torso;time:number}|null=null,state:TrackingState='TRACKING',returns=0,manualReason='';
 const joints=createJointQuality(width,height,options.jointConfirmations??2);
 return {requireManual(reason:string){state='MANUAL_REVIEW_REQUIRED';manualReason=reason;},observe(candidates:readonly Landmark[][],time:number,reference:Roi){
  let decision=previous?associateByContinuity(candidates,previous.body,(time-previous.time)/1000,width,height):selectInitialSubject(candidates,reference,width,height);
  if(options.crop&&candidates.length>1)decision={selectedIndex:null,proposedIndex:null,reason:'ambiguous-candidates'};
  const points=decision.proposedIndex===null?[]:candidates[decision.proposedIndex]!;
  const qc=poseQuality(points,width,height),body=torsoOf(points,width,height);
  const reasons:string[]=[];
  let accepted=decision.selectedIndex!==null&&body!==null;
  let continuity:TrackingQuality['continuity']=!previous?'initial':accepted?'continuous':'discontinuous';
  const lock=(reason:string)=>{state='MANUAL_REVIEW_REQUIRED';manualReason=reason;accepted=false;};
  if(!Number.isFinite(time))lock('invalid-source-time');
  if(decision.reason.startsWith('ambiguous')||decision.reason==='non-increasing-source-time')lock(decision.reason);
  if(previous&&time-previous.time>POLICY.recoveryGapMs)lock('identity-observation-gap-exceeded');
  if(options.crop&&body){
   const anchors=[11,12,23,24].map(i=>points[i]!).filter(confident);
   if(anchors.some(p=>{const x=(p.x*width-reference.x)/reference.width,y=(p.y*height-reference.y)/reference.height;return x<POLICY.roiMargin||x>1-POLICY.roiMargin||y<POLICY.roiMargin||y>1-POLICY.roiMargin;})){
    accepted=false;reasons.push('torso-roi-boundary-or-extrapolation');
   }
   if(!previous&&(Math.abs((body.x-reference.x)/reference.width-.5)>POLICY.maxInitialCenterOffset||Math.abs((body.y-reference.y)/reference.height-.5)>POLICY.maxInitialCenterOffset))lock('initial-target-not-centered');
  }
  // A reliable but discontinuous torso is independent identity evidence; a leg alone is not.
  if(previous&&body&&decision.selectedIndex===null&&decision.reason==='target-not-continuous')lock('temporal-torso-jump-or-scale-change');
  if(!body&&candidates.length)reasons.push('unreliable-torso-anchors');
  if(state==='MANUAL_REVIEW_REQUIRED')accepted=false;
  if(!accepted){
   returns=0;reasons.push(decision.reason);
   if(state!=='MANUAL_REVIEW_REQUIRED'){
    if(!previous){
     if(body)lock('initial-identity-not-established');
     else {state=candidates.length?'UNCERTAIN':'LOST';reasons.push('waiting-for-initial-reliable-pose');}
    }else state=candidates.length?'UNCERTAIN':'LOST';
   }
  }else if(previous&&state!=='TRACKING'){
   const b=body!;
   const close=Math.hypot(b.x-previous.body.x,b.y-previous.body.y)/Math.max(b.length,previous.body.length)<=POLICY.recoveryCenterTorso;
   const stable=Math.max(b.length/previous.body.length,previous.body.length/b.length)<=POLICY.recoveryScaleChange;
   if(!close||!stable)lock('recovery-not-identity-consistent');
   else if(++returns<POLICY.recoveryConfirmations){state='UNCERTAIN';accepted=false;reasons.push('identity-recovery-confirmation-pending');}
  }
  if(state==='MANUAL_REVIEW_REQUIRED')reasons.push(manualReason,'manual-reselection-required');
  if(accepted){previous={body:body!,time};state='TRACKING';returns=0;}
  if(reasons.includes('temporal-torso-jump-or-scale-change'))continuity='discontinuous';
  const jointQuality=joints.observe(points,time,accepted,options.crop?reference:undefined);
  const tracking:TrackingQuality={state,accepted,identity:accepted?'consistent-unverified':!candidates.length?'target-lost':'identity-uncertain',landmarkConfidence:qc.landmarkConfidence,plausibility:qc.plausibility,continuity,reasons:[...new Set(reasons)],joints:jointQuality};
  decision={...decision,selectedIndex:accepted?decision.selectedIndex:null};
  return {decision,tracking,landmarks:points};
 }};
}
