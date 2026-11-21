import {expect,it} from 'vitest';
import {replaySession,replayReport,qcSummary} from './replay';
import {readReplayInput} from './read';
import {syntheticResearch} from '../test/replayFixture';
import {humanPose} from '../test/fixtures';
import {applyReview} from '../validation/targetMetrics';
import {toCsv} from '../export/csv';
for(const pipeline of ['full-frame-single','roi-crop','full-frame-multi'] as const){
 it(`${pipeline}: replays 155 synthetic observations, keeps originals, exposes new acceptances and strict recovery`,()=>{
  const original=syntheticResearch(pipeline),before=structuredClone(original);
  const old=replaySession(original,'frozen-v0.5.0'),next=replaySession(original,'separated-2'),strict=replaySession(original,'separated-3');
  expect(qcSummary(original).jointMeasurementValid.any).toBe(4);expect(qcSummary(original).manualReviewRequired).toBe(151);
  expect(qcSummary(old.session).jointMeasurementValid.any).toBe(4);
  expect(qcSummary(next.session).subjectTrackingAccepted).toBe(155);expect(qcSummary(next.session).manualReviewRequired).toBe(0);
  expect(qcSummary(next.session).jointMeasurementValid.both).toBe(153);expect(qcSummary(strict.session).jointMeasurementValid.both).toBe(152);
  expect(next.session.samples.slice(3,8).map(s=>s.tracking.joints!.left.state)).toEqual(['READY','INVALID','RECOVERING','READY','READY']);
  const report=replayReport(original,[old,next,strict]);
  expect(report.strategies[0]!.baselineDecisionDifferences).toEqual([]);
  expect(report.strategies[1]!.artificiallyAcceptedSamplesAfterQcChanges.count).toBe(149);
  expect(report.strategies[1]!.artificiallyAcceptedSamplesAfterQcChanges.notAdjudicated).toBe(149);
  expect(report.originalWindow06to14.map(s=>s.sourceTimeMs)).toEqual([600,800,1000,1200,1400]);
  expect(report.strategies[1]!.summary.failureEpisodes.left[0]!.outcome).toBe('recovered-without-manual-reset');
  expect(report.original.failureEpisodes.identity[0]!.outcome).toBe('unresolved-at-end');
  expect(next.session.metadata.model).toEqual(original.metadata.model);expect(next.session.qcReplay!.detectionRun).toEqual(original.run);
  expect(next.session.metadata.sessionId).not.toBe(original.metadata.sessionId);expect(next.session.run).toBeUndefined();
  expect(original).toEqual(before);expect(next.session.samples[10]!.candidates).toEqual(original.samples[10]!.candidates);
  expect(toCsv(next.session)).toContain('joint_qc_state');expect(toCsv(next.session)).toContain('joint-recovery-pending');
 });
}
it('newly accepted wrong/mixed/uncertain human labels are disclosed, and still invalidate final output',()=>{
 const original=syntheticResearch();
 for(const [i,label] of [[8,'wrong-target'],[9,'mixed-landmarks'],[10,'uncertain'],[11,'correct-target']] as const)original.samples[i]=applyReview(original.samples[i]!,{label,identityId:'',reviewerId:'synthetic-reviewer'});
 const result=replaySession(original,'separated-2'),report=replayReport(original,[result]);
 for(const i of [8,9,10]){expect(result.session.samples[i]!.left.valid).toBe(false);expect(result.session.samples[i]!.automaticAngles.left.valid).toBe(true);}
 expect(report.strategies[0]!.artificiallyAcceptedSamplesAfterQcChanges.manualRejected).toBe(3);
 expect(report.strategies[0]!.artificiallyAcceptedSamplesAfterQcChanges.humanWrongOrMixed).toBe(2);expect(report.strategies[0]!.artificiallyAcceptedSamplesAfterQcChanges.humanUncertain).toBe(1);
 expect(report.strategies[0]!.artificiallyAcceptedSamplesAfterQcChanges.correctTargetOnly).toBe(1);
});
it('a human label cannot be silently applied to a different replay-selected candidate',()=>{
 const original=syntheticResearch('full-frame-multi',[humanPose()]);
 original.subjectSelection.roi={x:250,y:0,width:140,height:360};original.samples[0]!.targetReferenceRoi=original.subjectSelection.roi;
 const other=humanPose(-.3);original.samples[0]!.landmarks=other;original.samples[0]!.review={label:'correct-target',identityId:'target',reviewerId:'synthetic-reviewer'};
 original.samples[0]!.candidates.push({cropLandmarks:other,landmarks:other});
 const result=replaySession(original,'separated-2');expect(result.changes[0]!.sameEvaluatedLandmarks).toBe(false);expect(result.changes[0]!.humanAssessment).toBe('not-adjudicated');expect(result.session.samples[0]!.review).toBeUndefined();
});
it('manual resets remain explicit in replay and end identity failure episodes',()=>{
 const original=syntheticResearch('full-frame-multi',[humanPose(),humanPose(.3),humanPose(),humanPose()]);
 original.samples[2]!.manualKeyframeId='manual-at-400';original.samples[3]!.manualKeyframeId='manual-at-400';
 const r=replaySession(original,'separated-2');expect(r.session.samples[1]!.tracking.state).toBe('MANUAL_REVIEW_REQUIRED');expect(r.session.samples[2]!.tracking.accepted).toBe(true);
 expect(qcSummary(r.session).failureEpisodes.identity[0]!.outcome).toBe('ended-at-manual-reset');
});
it('replay preserves saved full-frame ambiguity and errors in B instead of accepting healthy primary poses',()=>{
 for(const status of ['ambiguous-manual-review','search-error-manual-review']){
  const o=syntheticResearch('roi-crop',[humanPose(),humanPose(),humanPose()]);o.samples[1]!.search={roi:o.samples[1]!.roi,status,candidates:[],numPoses:2,suggestedRoi:null};
  const r=replaySession(o,'separated-2');expect(r.session.samples[2]!.tracking.accepted).toBe(false);expect(r.session.samples[1]!.tracking.state).toBe('MANUAL_REVIEW_REQUIRED');
 }
});
it('reads session or comparison JSON and rejects missing candidates, duplicate time or unsupported metadata',()=>{
 const s=syntheticResearch();expect(readReplayInput(s)).toHaveLength(1);expect(readReplayInput({bundle:{entries:[{session:s},{session:null,error:'synthetic'}]}})).toHaveLength(1);
 const missing=structuredClone(s) as any;delete missing.samples[0].candidates;expect(()=>readReplayInput(missing)).toThrow('raw candidates');
 const duplicate=structuredClone(s);duplicate.samples[1]!.sourceTimeMs=0;expect(()=>readReplayInput(duplicate)).toThrow('遞增');
 const current=structuredClone(s);current.metadata.schemaVersion='9';expect(readReplayInput(current)).toHaveLength(1);
 const newer=structuredClone(s);newer.metadata.schemaVersion='8';newer.trackingPolicy={version:'identity-only-recovery-v3'};expect(replaySession(newer,'frozen-v0.5.0').session.trackingPolicy.version).toBe('roi-temporal-recovery-v2');
 const unknown=structuredClone(s);unknown.metadata.schemaVersion='6';expect(()=>readReplayInput(unknown)).toThrow('schema');
 const noModel=structuredClone(s) as any;delete noModel.metadata.model;expect(()=>readReplayInput(noModel)).toThrow('provenance');
 expect(()=>readReplayInput(replaySession(s,'separated-2').session)).toThrow();
 expect(()=>readReplayInput({bundle:{entries:[]}})).toThrow('沒有成功');
});
