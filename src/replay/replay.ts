import type {Landmark,Sample,Session} from '../domain/analysis';
import {QC_POLICY,ANALYSIS_SCHEMA_VERSION} from '../domain/analysis';
import {kneeObservation} from '../biomechanics/jointQuality';
import {kneeAngle} from '../biomechanics/knee';
import {createFullFrameIdentity,IDENTITY_POLICY,PLANTED_FEET_POLICY,SINGLE_RECOVERY_POLICY} from '../tracking/identity';
import {createTargetTracker} from '../tracking/target';
import {createFullFrameIdentity as legacyIdentity,IDENTITY_POLICY as LEGACY_IDENTITY_POLICY} from '../tracking/legacy/identity';
import {createTargetTracker as legacyTarget,TRACKING_POLICY as LEGACY_TRACKING_POLICY} from '../tracking/legacy/target';
import {gateAngle,gatePosture} from '../tracking/gate';
import {measurePosture} from '../biomechanics/posture';
import {applyReview} from '../validation/targetMetrics';
import {JOINT_POLICY,TRACKING_POLICY} from '../tracking/policy';
import pkg from '../../package.json';

export type ReplayStrategy='frozen-v0.5.0'|'separated-2'|'separated-3';
export interface ReplayChange {
  sampleIndex:number;sourceTimeMs:number;
  newlyAcceptedSides:('left'|'right')[];
  sameEvaluatedLandmarks:boolean;
  humanAssessment:'manual-wrong-or-mixed'|'manual-uncertain'|'correct-target-only'|'not-adjudicated';
  originalHumanLabel:string|null;
}
export interface ReplayResult {strategy:ReplayStrategy;session:Session;changes:ReplayChange[];originalSessionId:string}
const samePoints=(a:Landmark[],b:Landmark[])=>JSON.stringify(a)===JSON.stringify(b);

/** Conditional QC replay: use SAVED candidates and input rectangles, never rerun detection or ROI prediction. */
export function replaySession(original:Session,strategy:ReplayStrategy):ReplayResult {
  const crop=original.run?.inputSpace==='roi-crop';
  const w=original.metadata.sourceWidthPx,h=original.metadata.sourceHeightPx;
  const controlledSingle=original.run?.pipeline.id==='full-frame-single'&&original.subjectSelection.correctionSource==='controlled-single-default';
  const legacy=strategy==='frozen-v0.5.0',confirmations=strategy==='separated-3'?3:2;
  let full=legacy?legacyIdentity(w,h):createFullFrameIdentity(w,h,{jointConfirmations:confirmations,controlledSingle,restartAfterLock:true});
  let target=legacy?legacyTarget(original.subjectSelection.roi,w,h):createTargetTracker(original.subjectSelection.roi,w,h,{jointConfirmations:confirmations});
  let key:string|null|undefined;
  const changes:ReplayChange[]=[];
  const samples=original.samples.map(saved=>{
    if(saved.manualKeyframeId!==key){
      full=legacy?legacyIdentity(w,h):createFullFrameIdentity(w,h,{jointConfirmations:confirmations,controlledSingle,restartAfterLock:true});
      target=legacy?legacyTarget(saved.roi,w,h):createTargetTracker(saved.roi,w,h,{jointConfirmations:confirmations});
      key=saved.manualKeyframeId;
    }
    const candidates=structuredClone(saved.candidates).map(c=>c.landmarks);
    if(crop&&saved.search){
      if(saved.search.status==='ambiguous-manual-review')target.requireManual('ambiguous-full-frame-candidates');
      if(saved.search.error||saved.search.status==='search-error-manual-review')target.requireManual('full-frame-search-failed');
    }
    const result=crop?null:full.observe(candidates,saved.sourceTimeMs,saved.targetReferenceRoi??original.subjectSelection.roi);
    const tracking=result?.tracking??target.assess(candidates,saved.sourceTimeMs,saved.roi);
    const landmarks=result?.landmarks??(candidates.length===1?candidates[0]!:[]);
    const rawAngles={left:kneeAngle(landmarks,'left',w,h),right:kneeAngle(landmarks,'right',w,h)};
    const automaticAngles={left:gateAngle(rawAngles.left,tracking,'left'),right:gateAngle(rawAngles.right,tracking,'right')};
    const same=samePoints(saved.landmarks,landmarks);
    const newlyAcceptedSides=(['left','right'] as const).filter(side=>automaticAngles[side].valid&&!saved.automaticAngles[side].valid);
    changes.push({sampleIndex:saved.sampleIndex,sourceTimeMs:saved.sourceTimeMs,newlyAcceptedSides:[...newlyAcceptedSides],sameEvaluatedLandmarks:same,
      humanAssessment:!same||!saved.review?'not-adjudicated':saved.review.label==='correct-target'?'correct-target-only':saved.review.label==='uncertain'?'manual-uncertain':'manual-wrong-or-mixed',originalHumanLabel:saved.review?.label??null});
    const {review:_review,posture:_posture,...base}=structuredClone(saved);
    const rawPosture=measurePosture(landmarks,w,h),automaticPosture=gatePosture(rawPosture,tracking);
    const sample:Sample={...base,tracking,landmarks,rawAngles,automaticAngles,...automaticAngles,posture:{raw:rawPosture,automatic:automaticPosture,final:automaticPosture},
      subjectDecision:result?.decision??{selectedIndex:tracking.accepted?0:null,proposedIndex:candidates.length===1?0:null,reason:'roi-primary-single-candidate'}};
    return applyReview(sample,same?saved.review:undefined);
  });
  const session=structuredClone(original);
  session.samples=samples;
  session.metadata={...session.metadata,sessionId:crypto.randomUUID(),schemaVersion:ANALYSIS_SCHEMA_VERSION,applicationVersion:pkg.version,createdAtUtc:new Date().toISOString(),qcPolicyVersion:legacy?'frozen-v0.5.0-recomputed':QC_POLICY};
  session.analysisRevision={...session.analysisRevision,parentSessionId:original.metadata.sessionId,correctionSource:`offline-qc-replay:${strategy}:saved-observations`};
  // Original inference timing belongs to the parent; replay is not a new MediaPipe run.
  delete session.run;
  session.qcReplay={strategy,originalSessionId:original.metadata.sessionId,usesSavedObservations:true,...(original.run?{detectionRun:structuredClone(original.run)}:{})};
  session.trackingPolicy=legacy?{...LEGACY_TRACKING_POLICY,identityPolicy:crop?'legacy-roi-controller':LEGACY_IDENTITY_POLICY,replayStrategy:strategy}:{...TRACKING_POLICY,identityPolicy:IDENTITY_POLICY,...Object.fromEntries(Object.entries(SINGLE_RECOVERY_POLICY).map(([key,value])=>[`controlled_${key}`,value])),...Object.fromEntries(Object.entries(PLANTED_FEET_POLICY).map(([key,value])=>[`planted_${key}`,value])),jointPolicy:JOINT_POLICY.version,jointRecoveryConfirmations:confirmations,...Object.fromEntries(Object.entries(JOINT_POLICY).map(([key,value])=>[`joint_${key}`,key==='recoveryConfirmations'?confirmations:value])),replayStrategy:strategy};
  return {strategy,session,changes,originalSessionId:original.metadata.sessionId};
}

function failureEpisodes(samples:Sample[],valid:(s:Sample)=>boolean) {
  const episodes:{startMs:number;endMs:number;outcome:'recovered-without-manual-reset'|'ended-at-manual-reset'|'unresolved-at-end'}[]=[];
  let start:number|null=null,key:string|null=null;
  for(const s of samples){
    if(start!==null&&s.manualKeyframeId!==key){episodes.push({startMs:start,endMs:s.sourceTimeMs,outcome:'ended-at-manual-reset'});start=null;}
    if(!valid(s)&&start===null)start=s.sourceTimeMs;
    if(valid(s)&&start!==null){episodes.push({startMs:start,endMs:s.sourceTimeMs,outcome:'recovered-without-manual-reset'});start=null;}
    key=s.manualKeyframeId;
  }
  if(start!==null)episodes.push({startMs:start,endMs:samples.at(-1)!.sourceTimeMs,outcome:'unresolved-at-end'});
  return episodes;
}
export function qcSummary(session:Session) {
  const n=session.samples.length,count=(f:(s:Sample)=>boolean)=>session.samples.filter(f).length;
  const identityReasons:Record<string,number>={},jointReasons:Record<string,number>={};
  for(const s of session.samples){
    for(const r of new Set(s.tracking.reasons))identityReasons[r]=(identityReasons[r]??0)+1;
    for(const side of ['left','right'] as const)for(const r of new Set(s.tracking.joints?.[side].reasons??[]))jointReasons[`${side}:${r}`]=(jointReasons[`${side}:${r}`]??0)+1;
  }
  return {samples:n,rawPoseAvailable:count(s=>s.candidates.some(c=>c.landmarks.length>0)),
    rawGeometricAngles:{left:count(s=>s.rawAngles.left.valid),right:count(s=>s.rawAngles.right.valid)},
    subjectTrackingAccepted:count(s=>s.tracking.accepted),manualReviewRequired:count(s=>s.tracking.state==='MANUAL_REVIEW_REQUIRED'),
    jointMeasurementValid:{left:count(s=>s.automaticAngles.left.valid),right:count(s=>s.automaticAngles.right.valid),any:count(s=>s.automaticAngles.left.valid||s.automaticAngles.right.valid),both:count(s=>s.automaticAngles.left.valid&&s.automaticAngles.right.valid)},
    finalAfterHumanReview:{left:count(s=>s.left.valid),right:count(s=>s.right.valid)},
    failureEpisodes:{identity:failureEpisodes(session.samples,s=>s.tracking.accepted),left:failureEpisodes(session.samples,s=>s.automaticAngles.left.valid),right:failureEpisodes(session.samples,s=>s.automaticAngles.right.valid)},identityReasons,jointReasons};
}
export function replayReport(original:Session,results:ReplayResult[]) {
  const detail=(s:Sample)=>({observedSegmentsPx:{left:kneeObservation(s.landmarks,'left',original.metadata.sourceWidthPx,original.metadata.sourceHeightPx).lengths,right:kneeObservation(s.landmarks,'right',original.metadata.sourceWidthPx,original.metadata.sourceHeightPx).lengths},sampleIndex:s.sampleIndex,sourceTimeMs:s.sourceTimeMs,tracking:s.tracking,rawAngles:s.rawAngles,automaticAngles:s.automaticAngles,decision:s.subjectDecision??null});
  return {originalSessionId:original.metadata.sessionId,pipeline:original.run?.pipeline??null,model:original.metadata.model,sourceSha256:original.run?.sourceSha256??null,originalPolicy:original.trackingPolicy,original:qcSummary(original),
    interpretation:'新增自動放行不是 accuracy 改善；未重新執行 MediaPipe，ROI／候選固定。人工 Correct 只確認人物，不確認關節角度。',
    originalWindow06to14:original.samples.filter(s=>s.sourceTimeMs>=600&&s.sourceTimeMs<=1400).map(detail),
    strategies:results.map(r=>{
      const added=r.changes.filter(c=>c.newlyAcceptedSides.length);
      return {strategy:r.strategy,derivedSessionId:r.session.metadata.sessionId,summary:qcSummary(r.session),
        changedEvaluatedCandidateSamples:r.changes.filter(c=>!c.sameEvaluatedLandmarks).map(c=>c.sampleIndex),
        baselineDecisionDifferences:r.session.samples.filter((s,i)=>s.tracking.accepted!==original.samples[i]!.tracking.accepted||s.tracking.state!==original.samples[i]!.tracking.state||(['left','right'] as const).some(side=>s.automaticAngles[side].valid!==original.samples[i]!.automaticAngles[side].valid)).map(s=>s.sampleIndex),
        artificiallyAcceptedSamplesAfterQcChanges:{definition:'相對原始自動拒絕，改由此策略自動放行至少一側；不代表已證實錯誤或正確',count:added.length,manualRejected:added.filter(c=>c.humanAssessment==='manual-wrong-or-mixed'||c.humanAssessment==='manual-uncertain').length,humanWrongOrMixed:added.filter(c=>c.humanAssessment==='manual-wrong-or-mixed').length,humanUncertain:added.filter(c=>c.humanAssessment==='manual-uncertain').length,correctTargetOnly:added.filter(c=>c.humanAssessment==='correct-target-only').length,notAdjudicated:added.filter(c=>c.humanAssessment==='not-adjudicated').length,samples:added},
        window06to14:r.session.samples.filter(s=>s.sourceTimeMs>=600&&s.sourceTimeMs<=1400).map(detail)};
    })};
}
