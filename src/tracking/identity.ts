import type {Landmark} from '../domain/analysis';
import type {Roi,TrackingQuality,TrackingState} from '../domain/tracking';
import {poseQuality,torsoOf,confident,type Torso} from '../biomechanics/poseQuality';
import {selectInitialSubject,type CandidateSelection} from '../selection/subject';
import {TRACKING_POLICY as POLICY} from './policy';
import {kneeObservation} from '../biomechanics/jointQuality';
import {kneeAngle} from '../biomechanics/knee';
import {createJointQuality} from './jointQuality';
export const IDENTITY_POLICY='controlled-single-bounded-recovery-v8-steady-restart';
/**
 * restart-after-still-standing-v1 (ADR-088, controlled single-person mode, uploaded video only: the live
 * camera already ends the segment on a lock and starts a new one with its ready gate). After an automatic
 * lock (person lost, jump, cut, or a second person who has left), the analysis restarts as a NEW segment
 * when exactly one person is detected standing upright (both 2D knee angles ≥ 160° and hips ≥ 1.7 shank lengths above the ankles, because a frontal squat
 * still looks straight-legged in 2D) and still (torso
 * centre within 0.15 torso length and feet not jumping) for restartMs (0.5 s, the same still time as the
 * 3D standing check, ADR-079; user-facing text keeps "about 1 s" as a margin). It does not claim it is the same
 * person: the frontal baseline and standing reference are rebuilt from scratch, as in live mode.
 * Locks requested by the user or caused by invalid time never restart. Engineering values.
 */
export const RESTART_POLICY={version:'restart-after-still-standing-v1',restartMs:500,minKneeAngleDeg:160,minHipAboveAnkleShank:1.7,maxCenterMoveTorso:.15,maxStepGapMs:300} as const;
/**
 * restart-after-steady-single-person-v1 (ADR-099, same scope as ADR-088: controlled single-person mode,
 * uploaded video only). Users reported that after one jump the whole rest of a video stayed "not found":
 * a person who keeps squatting never stands still 0.5 s with BOTH knees visible (the far knee is hidden in a
 * side view), so ADR-088 never fired (dataset subject_001 good side: locked at 0.8 s, 2% of 30 s usable).
 * After an automatic lock, a new segment also starts when exactly one person has been followed smoothly
 * for steadyMs (1 s): see smoothStep; in addition the torso centre stays within 0.75 torso length sideways of
 * where the window started (a passer-by walking across does not restart). The torso must be reliable and at
 * least one knee measurable. Like
 * ADR-088 it does not claim it is the same person: baselines are rebuilt. Engineering values.
 *
 * smooth-single-step-v1 (ADR-099): the general continuity screen allows 3 torso lengths per second, but a
 * real squat at 10 Hz moves the torso centre up to 0.36 torso length per step (99th percentile, dataset
 * squat videos), so a fast squat looked like a jump, then the short recovery window ran out and locked.
 * In controlled single-person mode one candidate whose torso centre moved ≤ 5 torso lengths per second
 * (0.5 per 10 Hz step) and never more than 0.6 torso length in one step, whose torso size changed ≤ 1.5×, within 300 ms, and whose feet did not teleport, is continuous.
 */
export const STEADY_RESTART_POLICY={version:'restart-after-steady-single-person-v1',steadyMs:1000,maxCenterTorsoPerSecond:5,maxStepCenterTorso:.6,maxNetSideShiftTorso:.75,maxStepScale:1.5,maxStepGapMs:300} as const;
/** One smooth step of a single candidate (smooth-single-step-v1, ADR-099). */
function smoothStep(body:Torso,points:readonly Landmark[],time:number,last:{body:Torso;points:readonly Landmark[];time:number},width:number,height:number):boolean {
 const sp=STEADY_RESTART_POLICY,dt=time-last.time;
 return dt>0&&dt<=sp.maxStepGapMs
  &&Math.hypot(body.x-last.body.x,body.y-last.body.y)/Math.max(body.length,last.body.length)<=Math.min(sp.maxCenterTorsoPerSecond*dt/1000,sp.maxStepCenterTorso)
  &&Math.max(body.length/last.body.length,last.body.length/body.length)<=sp.maxStepScale
  &&feetStep(points,last.points,width,height)!=='teleport';
}
const NO_RESTART=new Set(['invalid-source-time','non-increasing-source-time']);
export const SINGLE_RECOVERY_POLICY={version:'controlled-single-bounded-v1',windowMs:1600,confirmations:3,maxStepGapMs:300,maxAnchorDistanceTorso:2,maxAnchorScale:1.5} as const;
/**
 * planted-feet-continuity-v1 (ADR-084, controlled single-person mode only). In a frontal squat the
 * trunk leans toward the camera and its 2D shoulder–hip length shrinks 2–3× within 0.3 s, which the
 * torso-length identity screens read as a different person. Shank length (knee–ankle) and the feet do
 * not change in a squat, so "both feet stayed planted and the shank is the same size" is accepted as
 * continuity evidence, and a single-candidate pause (UNCERTAIN or an automatic lock) may recover after
 * that evidence holds for sustainMs. Different feet position or shank length (a swap) never qualifies.
 * Engineering values, not calibrated identity probabilities.
 */
export const PLANTED_FEET_POLICY={version:'planted-feet-continuity-v3',teleportMinVisibility:.7,maxStepXShank:.6,maxStepYShank:.6,maxHeelSpacingChangeShank:.4,maxFootMoveXShank:.25,maxFootMoveYShank:.6,maxShankScale:1.4,maxHipWidthScale:1.25,minHipWidthShank:.3,maxHipShiftShank:1,sustainMs:500,maxStepGapMs:300} as const;
const FEET=[27,28,29,30] as const;
/** Mean knee–ankle length (px) over legs whose knee and ankle are confident, or null. */
export function shankLength(points:readonly Landmark[],width:number,height:number):number|null {
 const l=([[25,27],[26,28]] as const).flatMap(([k,a])=>confident(points[k])&&confident(points[a])?[Math.hypot((points[k]!.x-points[a]!.x)*width,(points[k]!.y-points[a]!.y)*height)]:[]);
 const m=l.length?l.reduce((a,b)=>a+b,0)/l.length:0;
 return Number.isFinite(m)&&m>=POLICY.minTorsoPx?m:null;
}
/**
 * Both ankles and heels within 0.25 shank sideways and 0.6 shank up/down of the reference (MediaPipe moves
 * planted feet up to ~0.55 shank vertically while the person rises from a squat, lab_front 2.6 s), same shank (and hip width when measurable), hips not shifted. */
export function plantedContinuity(points:readonly Landmark[],reference:readonly Landmark[],width:number,height:number):boolean {
 const p=PLANTED_FEET_POLICY;
 const shank=shankLength(reference,width,height),now=shankLength(points,width,height);
 if(shank===null||now===null||Math.max(now/shank,shank/now)>p.maxShankScale)return false;
 const px=(q:Landmark)=>({x:q.x*width,y:q.y*height});
 for(const i of FEET){
  const a=points[i],b=reference[i];
  if(!confident(a)||!confident(b)||a.x<0||a.x>1||a.y<0||a.y>1)return false;
  const A=px(a),B=px(b);if(Math.abs(A.x-B.x)>p.maxFootMoveXShank*shank||Math.abs(A.y-B.y)>p.maxFootMoveYShank*shank)return false;
 }
 if(![23,24].every(i=>confident(points[i])&&confident(reference[i])))return false;
 const hip=(q:readonly Landmark[])=>({mid:(q[23]!.x+q[24]!.x)/2*width,width:Math.abs(q[23]!.x-q[24]!.x)*width});
 const H=hip(points),R=hip(reference);
 if(Math.abs(H.mid-R.mid)>p.maxHipShiftShank*shank)return false;
 if(H.width>=p.minHipWidthShank*shank&&R.width>=p.minHipWidthShank*shank&&Math.max(H.width/R.width,R.width/H.width)>p.maxHipWidthScale)return false;
 return true;
}
const RECOVERABLE_LOCKS=new Set(['feet-teleport','controlled-recovery-window-exceeded','controlled-recovery-outside-anchor','identity-observation-gap-exceeded','recovery-not-identity-consistent','temporal-torso-jump-or-scale-change']);
/**
 * Feet continuity between two observations (planted-feet-continuity-v3, ADR-086/099): 'teleport' when the
 * feet are reliable in both but jumped more than 0.6 shank in one step (either left/right labelling), or the horizontal heel spacing (stance width)
 * changed by more than 0.4 shank (a different body); 'unknown' when the feet are not reliable. The 2D shank length is
 * not used here: it shortens by up to 1.33× at the bottom of a frontal squat (lab_front 8.4 s).
 */
export function feetStep(points:readonly Landmark[],reference:readonly Landmark[],width:number,height:number):'continuous'|'teleport'|'unknown' {
 const p=PLANTED_FEET_POLICY;
 const inside=(q:Landmark|undefined)=>confident(q)&&q.x>=0&&q.x<=1&&q.y>=0&&q.y<=1;
 const shank=shankLength(reference,width,height),now=shankLength(points,width,height);
 if(shank===null||now===null)return 'unknown';
 // ADR-099: in a side view the far foot sits at visibility 0.4–0.6 and jumps by up to ~1 shank between
 // frames (dataset subject_001 good side 0.6 s), which read as a teleport; even the near foot is swapped with
 // the far one at the bottom of a squat (subject_003 good side 7.2 s), so one foot alone is no evidence.
 // A foot is "sure" when its ankle AND heel are ≥ teleportMinVisibility. Exactly one sure foot in BOTH frames
 // (the side-view signature) gives 'unknown', as a hidden far foot always did. Otherwise (e.g. a front view
 // cut to a person with one dim foot, or a dim frontal view) all four confident points keep the full check.
 const sure=(q:Landmark|undefined)=>inside(q)&&q!.visibility>=p.teleportMinVisibility&&(q!.presence??1)>=p.teleportMinVisibility;
 const sureFeet=(q:readonly Landmark[])=>([[27,29],[28,30]] as const).filter(f=>f.every(i=>sure(q[i]))).length;
 const sideView=sureFeet(points)===1&&sureFeet(reference)===1;
 const allConfident=FEET.every(i=>inside(points[i])&&inside(reference[i]));
 if(sideView||!allConfident)return 'unknown';
 // MediaPipe sometimes swaps the left/right labels for one frame: accept either assignment.
 const MIRROR:Record<number,number>={27:28,28:27,29:30,30:29};
 const near=(q:Landmark,r:Landmark)=>Math.abs(q.x-r.x)*width<=p.maxStepXShank*shank&&Math.abs(q.y-r.y)*height<=p.maxStepYShank*shank;
 const within=(mirror:boolean)=>FEET.every(i=>near(points[i]!,reference[mirror?MIRROR[i]!:i]!));
 if(!within(false)&&!within(true))return 'teleport';
 // Horizontal heel spacing (stance width): vertical heel jitter must not count.
 const spacing=(q:readonly Landmark[])=>Math.abs(q[29]!.x-q[30]!.x)*width;
 const a=spacing(points),b=spacing(reference);
 if(Math.abs(a-b)>p.maxHeelSpacingChangeShank*shank)return 'teleport';
 return 'continuous';
}
export function associateByContinuity(candidates:readonly Landmark[][],previous:Torso,dtSeconds:number,width:number,height:number):CandidateSelection {
 if(!(dtSeconds>0))return {selectedIndex:null,proposedIndex:null,reason:'non-increasing-source-time'};
 const ranked=candidates.map((p,index)=>({index,b:torsoOf(p,width,height)})).filter(c=>c.b).map(c=>({...c,d:Math.hypot(c.b!.x-previous.x,c.b!.y-previous.y)/Math.max(c.b!.length,previous.length),scale:Math.max(c.b!.length/previous.length,previous.length/c.b!.length)})).sort((a,b)=>a.d-b.d);
 const consistent=ranked.filter(c=>c.d/dtSeconds<=POLICY.maxCenterTorsoPerSecond&&c.scale<=POLICY.maxSegmentScaleChange);
 if(consistent.length===1)return {selectedIndex:consistent[0]!.index,proposedIndex:consistent[0]!.index,reason:'unique-temporally-consistent-candidate'};
 return {selectedIndex:null,proposedIndex:ranked[0]?.index??(candidates.length===1?0:null),reason:consistent.length>1?'ambiguous-temporal-subject':candidates.length?'target-not-continuous':'no-pose'};
}
/** Torso identity history is independent of joint validity. Manual identity locks never auto-clear. */
export function createFullFrameIdentity(width:number,height:number,options:{crop?:boolean;jointConfirmations?:2|3;controlledSingle?:boolean;restartAfterLock?:boolean}={}) {
 let previous:{body:Torso;time:number}|null=null,state:TrackingState='TRACKING',returns=0,manualReason='';
 let transient:{anchor:Torso;start:number;last:Torso|null;lastTime:number;count:number}|null=null;
 // planted-feet-continuity-v1: landmarks of the last accepted observation, the running planted-feet streak,
 // and whether the current lock may be lifted by it (only automatic temporal locks in controlled mode).
 let lastGood:{points:readonly Landmark[];time:number}|null=null,planted:{since:number;last:number}|null=null;
 let manualRecoverable=false,neverRecover=false,noRestart=false;
 let restart:{since:number;last:number;body:Torso;points:readonly Landmark[]}|null=null;
 let steady:{since:number;start:Torso;time:number;body:Torso;points:readonly Landmark[]}|null=null;
 // Feet chain since the last accepted observation: broken by a teleport (hard cut / swap), kept across frames without reliable feet.
 let feetRef:readonly Landmark[]|null=null,chainBroken=false,teleportPending=false;
 const controlled=options.controlledSingle===true&&!options.crop;
 const joints=createJointQuality(width,height,options.jointConfirmations??2);
 return {requireManual(reason:string){state='MANUAL_REVIEW_REQUIRED';manualReason=reason;neverRecover=true;noRestart=true;},observe(candidates:readonly Landmark[][],time:number,reference:Roi){
  let decision=previous?associateByContinuity(candidates,previous.body,(time-previous.time)/1000,width,height):selectInitialSubject(candidates,reference,width,height);
  if((options.crop||controlled)&&candidates.length>1)decision={selectedIndex:null,proposedIndex:null,reason:'ambiguous-candidates'};
  const points=decision.proposedIndex===null?[]:candidates[decision.proposedIndex]!;
  const qc=poseQuality(points,width,height),body=torsoOf(points,width,height);
  const reasons:string[]=[];
  let teleportHold=false;
  // Squat shrinkage is not an identity change: same planted feet and shank size keep continuity (ADR-084).
  if(controlled&&previous&&lastGood&&!transient&&state!=='MANUAL_REVIEW_REQUIRED'&&candidates.length===1&&body&&decision.reason==='target-not-continuous'
   &&time-previous.time<=POLICY.recoveryGapMs&&plantedContinuity(points,lastGood.points,width,height)){
   decision={selectedIndex:decision.proposedIndex,proposedIndex:decision.proposedIndex,reason:'planted-feet-continuity'};
   reasons.push('planted-feet-continuity');
  }
  // A fast squat is not a jump: one smooth step of the single candidate keeps continuity (ADR-099).
  if(controlled&&previous&&lastGood&&!transient&&state!=='MANUAL_REVIEW_REQUIRED'&&candidates.length===1&&body&&decision.reason==='target-not-continuous'
   &&smoothStep(body,points,time,{body:previous.body,points:lastGood.points,time:previous.time},width,height)){
   decision={selectedIndex:decision.proposedIndex,proposedIndex:decision.proposedIndex,reason:'smooth-single-step'};
   reasons.push('smooth-single-step');
  }
  let accepted=decision.selectedIndex!==null&&body!==null;
  let continuity:TrackingQuality['continuity']=!previous?'initial':accepted?'continuous':'discontinuous';
  const lock=(reason:string)=>{
   state='MANUAL_REVIEW_REQUIRED';manualReason=reason;accepted=false;
   if(controlled&&RECOVERABLE_LOCKS.has(reason))manualRecoverable=true;else neverRecover=true;
   if(NO_RESTART.has(reason))noRestart=true;
  };
  // A different body cut in (feet jump or new proportions) locks at once; only feet back where they were can lift it (ADR-086).
  if(controlled&&feetRef&&candidates.length===1&&points.length){
   const step=feetStep(points,feetRef,width,height);
   if(step==='continuous'&&!chainBroken){feetRef=points;teleportPending=false;}
   // One-frame foot glitches happen (MediaPipe collapses both feet for a frame): the frame is held back,
   // and only a second consecutive teleport against the same reference locks.
   else if(step==='teleport'&&!chainBroken&&!teleportPending){teleportPending=true;teleportHold=true;reasons.push('feet-teleport-pending');}
   else if(step==='teleport'&&!chainBroken){chainBroken=true;teleportPending=false;reasons.push('feet-teleport');if(state!=='MANUAL_REVIEW_REQUIRED')lock('feet-teleport');}
  }
  if(!Number.isFinite(time))lock('invalid-source-time');
  if(decision.reason.startsWith('ambiguous')||decision.reason==='non-increasing-source-time')lock(decision.reason);
  if(previous&&!transient&&time-previous.time>POLICY.recoveryGapMs)lock('identity-observation-gap-exceeded');
  if(options.crop&&body){
   const anchors=[11,12,23,24].map(i=>points[i]!).filter(confident);
   if(anchors.some(p=>{const x=(p.x*width-reference.x)/reference.width,y=(p.y*height-reference.y)/reference.height;return x<POLICY.roiMargin||x>1-POLICY.roiMargin||y<POLICY.roiMargin||y>1-POLICY.roiMargin;})){
    accepted=false;reasons.push('torso-roi-boundary-or-extrapolation');
   }
   if(!previous&&(Math.abs((body.x-reference.x)/reference.width-.5)>POLICY.maxInitialCenterOffset||Math.abs((body.y-reference.y)/reference.height-.5)>POLICY.maxInitialCenterOffset))lock('initial-target-not-centered');
  }
  let handled=false;
  let recovery:TrackingQuality['recovery'];
  if(controlled&&state!=='MANUAL_REVIEW_REQUIRED'&&previous&&body&&decision.reason==='target-not-continuous'&&!transient){
   transient={anchor:previous.body,start:previous.time,last:null,lastTime:time,count:0};
   reasons.push('temporal-torso-discontinuity');
  }
  if(transient&&state!=='MANUAL_REVIEW_REQUIRED'){
   handled=true;accepted=false;state=candidates.length?'UNCERTAIN':'LOST';continuity='discontinuous';
   const r=transient,p=SINGLE_RECOVERY_POLICY;
   if(time-r.start>p.windowMs)lock('controlled-recovery-window-exceeded');
   else if(body&&candidates.length===1){
    const distance=Math.hypot(body.x-r.anchor.x,body.y-r.anchor.y)/Math.max(body.length,r.anchor.length);
    const scale=Math.max(body.length/r.anchor.length,r.anchor.length/body.length);
    // Torso size is not identity evidence while the feet stay planted (frontal squat, ADR-084/086).
    const plantedNow=!chainBroken&&!!lastGood&&plantedContinuity(points,lastGood.points,width,height);
    if((distance>p.maxAnchorDistanceTorso||scale>p.maxAnchorScale)&&!plantedNow)lock('controlled-recovery-outside-anchor');
    else if(qc.accepted&&(['left','right'] as const).some(side=>kneeObservation(points,side,width,height).reasons.length===0)){
     const dt=time-r.lastTime;
     const close=r.last&&Math.hypot(body.x-r.last.x,body.y-r.last.y)/Math.max(body.length,r.last.length)<=POLICY.recoveryCenterTorso;
     const stable=r.last&&Math.max(body.length/r.last.length,r.last.length/body.length)<=POLICY.recoveryScaleChange;
     r.count=dt>0&&dt<=p.maxStepGapMs&&close&&stable?r.count+1:0;
     r.last=body;r.lastTime=time;
     if(r.count>=p.confirmations&&!chainBroken){accepted=true;decision={...decision,selectedIndex:decision.proposedIndex};reasons.push('controlled-single-recovery-confirmed');transient=null;}
    }else {r.count=0;r.last=null;}
   }else {r.count=0;r.last=null;}
   recovery={kind:'controlled-single-temporal',confirmations:r.count,required:p.confirmations,elapsedMs:time-r.start};
   if(!accepted)reasons.push('controlled-single-recovery-pending');
  }
  if(!handled){
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
   // A squat moves fast: one smooth step from the last accepted observation is consistent (ADR-099).
   const smooth=controlled&&!!lastGood&&smoothStep(b,points,time,{body:previous.body,points:lastGood.points,time:previous.time},width,height);
   if((!close||!stable)&&!smooth)lock('recovery-not-identity-consistent');
   else if(++returns<POLICY.recoveryConfirmations){state='UNCERTAIN';accepted=false;reasons.push('identity-recovery-confirmation-pending');}
  }
  }
  // Single-candidate recovery from UNCERTAIN or an automatic lock: feet planted where they were at the last
  // accepted observation, same shank size, torso reliable, continuously for sustainMs (ADR-084).
  if(teleportHold){accepted=false;if(state==='TRACKING')state='UNCERTAIN';}
  const mayRecover=state==='MANUAL_REVIEW_REQUIRED'?manualRecoverable&&!neverRecover:true;
  if(controlled&&!accepted&&!teleportHold&&mayRecover&&lastGood&&candidates.length===1&&body&&qc.accepted&&plantedContinuity(points,lastGood.points,width,height)){
   const pp=PLANTED_FEET_POLICY;
   planted=planted&&time>planted.last&&time-planted.last<=pp.maxStepGapMs?{since:planted.since,last:time}:{since:time,last:time};
   if(time-planted.since>=pp.sustainMs){
    accepted=true;state='TRACKING';manualReason='';manualRecoverable=false;transient=null;planted=null;recovery=undefined;returns=0;
    decision={...decision,selectedIndex:decision.proposedIndex};
    reasons.length=0;reasons.push('planted-feet-recovery-confirmed');
   }else reasons.push('planted-feet-recovery-pending');
  }else if(!accepted)planted=null;
  // New segment after an automatic lock: one person followed smoothly for steadyMs (ADR-099).
  if(controlled&&options.restartAfterLock===true&&!accepted&&state==='MANUAL_REVIEW_REQUIRED'&&!noRestart&&candidates.length===1&&body&&qc.accepted
   &&(['left','right'] as const).some(side=>kneeObservation(points,side,width,height).reasons.length===0)){
   const sp=STEADY_RESTART_POLICY,last=steady;
   // Squats move mostly up and down; someone walking across the picture drifts sideways (passer-by guard).
   const smooth=last!==null&&smoothStep(body,points,time,last,width,height)&&Math.abs(body.x-last.start.x)<=sp.maxNetSideShiftTorso*Math.max(body.length,last.start.length);
   steady={since:smooth?last!.since:time,start:smooth?last!.start:body,time,body,points};
   if(time-steady.since>=sp.steadyMs){
    accepted=true;state='TRACKING';manualReason='';manualRecoverable=false;neverRecover=false;transient=null;planted=null;recovery=undefined;returns=0;restart=null;steady=null;
    decision={...decision,selectedIndex:decision.proposedIndex};
    reasons.length=0;reasons.push('restart-after-steady-single-person');
   }else reasons.push('restart-pending-steady-single-person');
  }else if(!accepted)steady=null;
  // New segment after an automatic lock: one person, standing upright and still for restartMs (ADR-088).
  if(controlled&&options.restartAfterLock===true&&!accepted&&state==='MANUAL_REVIEW_REQUIRED'&&!noRestart&&candidates.length===1&&body&&qc.accepted){
   const rp=RESTART_POLICY;
   const upright=(['left','right'] as const).every(side=>{const a=kneeAngle(points,side,width,height);return a.valid&&a.rawAngleDeg!==null&&a.rawAngleDeg>=rp.minKneeAngleDeg;});
   const shank=shankLength(points,width,height);
   const hipAbove=shank===null||![23,24,27,28].every(i=>confident(points[i]))?0:((points[27]!.y+points[28]!.y)-(points[23]!.y+points[24]!.y))/2*height/shank;
   const standing=upright&&hipAbove>=rp.minHipAboveAnkleShank;
   const still=restart!==null&&time>restart.last&&time-restart.last<=rp.maxStepGapMs
    &&Math.hypot(body.x-restart.body.x,body.y-restart.body.y)/Math.max(body.length,restart.body.length)<=rp.maxCenterMoveTorso
    &&feetStep(points,restart.points,width,height)!=='teleport';
   if(!standing)restart=null;
   else if(!still)restart={since:time,last:time,body,points};
   else restart={since:restart!.since,last:time,body:restart!.body,points:restart!.points};
   if(restart&&time-restart.since>=rp.restartMs){
    accepted=true;state='TRACKING';manualReason='';manualRecoverable=false;neverRecover=false;transient=null;planted=null;recovery=undefined;returns=0;restart=null;
    decision={...decision,selectedIndex:decision.proposedIndex};
    reasons.length=0;reasons.push('restart-after-still-standing');
   }else if(restart)reasons.push('restart-pending-still-standing');
  }else if(!accepted)restart=null;
  if(state==='MANUAL_REVIEW_REQUIRED')reasons.push(manualReason,'manual-reselection-required');
  if(accepted){steady=null;previous={body:body!,time};lastGood={points,time};feetRef=points;chainBroken=false;state='TRACKING';returns=0;planted=null;}
  if(reasons.includes('temporal-torso-jump-or-scale-change'))continuity='discontinuous';
  const jointQuality=joints.observe(points,time,accepted,options.crop?reference:undefined);
  const tracking:TrackingQuality={...(recovery?{recovery}:{}),state,accepted,identity:accepted?'consistent-unverified':!candidates.length?'target-lost':'identity-uncertain',landmarkConfidence:qc.landmarkConfidence,plausibility:qc.plausibility,continuity,reasons:[...new Set(reasons)],joints:jointQuality};
  decision={...decision,selectedIndex:accepted?decision.selectedIndex:null};
  return {decision,tracking,landmarks:points};
 }};
}
