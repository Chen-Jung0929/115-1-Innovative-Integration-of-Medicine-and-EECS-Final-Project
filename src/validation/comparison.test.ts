import {expect,it} from 'vitest';
import {makeSample,selection} from '../test/fixtures';
import type {Session} from '../domain/analysis';
import {summarizeRun,comparisonReport,type ComparisonBundle} from './comparison';
import {applyReview} from './targetMetrics';
const session:Session={metadata:{schemaVersion:'7',sessionId:'synthetic-test',sourceId:'test',inputKind:'video',sourceWidthPx:640,sourceHeightPx:360,inferenceMirrored:false,displayMirrored:false,model:{packageVersion:'test',assetId:'test',assetSha256:'model',delegate:'CPU'},angleDefinitionVersion:'test',qcPolicyVersion:'test',applicationVersion:'test',createdAtUtc:'2026-11-17T00:00:00Z'},analysisRevision:{parentSessionId:null,selectionRevision:1,correctionSource:'test'},subjectSelection:selection,trackingPolicy:{version:'test'},sourceFilename:'synthetic.mp4',durationMs:1000,samplingHz:5,samples:[makeSample(),makeSample({sampleIndex:1,sourceTimeMs:200,requestedTimeMs:200})],run:{pipeline:{id:'full-frame-single',numPoses:1},inputSpace:'full-frame',sourceSha256:'source',comparisonId:'group',analysisDurationMs:123,modelPreparationMs:0,requestedSamples:5}};
it('does not invent correct-target or false-valid rates before human review',()=>{
 const m=summarizeRun(session);expect(m.validFrameRate).toBe(1);expect(m.correctTargetRate).toBeNull();expect(m.falseValidRate).toBeNull();expect(m.analysisDurationMs).toBe(123);
});
it('preserves automatic false-valid evidence after human rejection',()=>{
 const samples=[applyReview(session.samples[0]!,{label:'correct-target',identityId:'target',reviewerId:'r'}),applyReview(session.samples[1]!,{label:'wrong-target',identityId:'B',reviewerId:'r'})];
 const m=summarizeRun({...session,samples});expect(m.validFrameRate).toBe(1);expect(m.correctTargetRate).toBe(.5);expect(m.falseValidRate).toBe(.5);expect(m.usableCoverage).toBe(.5);
});
it('reports raw discontinuities with comparable pair counts and excludes missing pairs',()=>{
 const b=makeSample({sampleIndex:1,sourceTimeMs:200,requestedTimeMs:200,landmarks:session.samples[0]!.landmarks.map(p=>({...p,x:p.x+.3}))});
 expect(summarizeRun({...session,samples:[session.samples[0]!,b]}).landmarkDiscontinuities).toBe(1);
 expect(summarizeRun({...session,samples:[makeSample({landmarks:[]}),b]}).landmarkDiscontinuities).toBeNull();
});
it('compares only common requested timestamps and exposes timing/provenance mismatch',()=>{
 const bundle:ComparisonBundle={schemaVersion:'pipeline-comparison-v1',id:'group',sourceSha256:'source',sourceFilename:'synthetic.mp4',sourceSizeBytes:1,modelSha256:'model',samplingHz:5,selectionId:selection.id,startedAtUtc:'test',sharedPreparationMs:1,wallDurationMs:2,entries:[{config:{id:'full-frame-single',numPoses:1},session,error:null},{config:{id:'roi-crop',numPoses:1},session:{...session,run:{...session.run!,pipeline:{id:'roi-crop',numPoses:1}},samples:[session.samples[0]!]},error:null},{config:{id:'full-frame-multi',numPoses:2},session:null,error:'unsupported model'}]};
 const r=comparisonReport(bundle);expect(r.complete).toBe(false);expect(r.alignment.commonRequestedTimesMs).toEqual([0]);expect(r.rows[2]!.commonSamples).toBeNull();
 expect(r.rows[0]!.commonSamples!.samples).toBe(1);expect(r.rows[0]!.allSamples!.samples).toBe(2);
 const altered={...session,run:{...session.run!,sourceSha256:'different'}};expect(comparisonReport({...bundle,entries:[{...bundle.entries[0]!,session:altered}]}).provenanceConsistent).toBe(false);
});
