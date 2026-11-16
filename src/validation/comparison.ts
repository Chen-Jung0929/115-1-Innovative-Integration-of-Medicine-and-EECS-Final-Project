import {serializeCsv} from '../export/csv';
import type {Session,Sample} from '../domain/analysis';
import type {PipelineConfig} from '../domain/pipeline';
import {targetMetrics} from './targetMetrics';
import {poseQuality} from '../biomechanics/poseQuality';
import {TRACKING_POLICY as POLICY} from '../tracking/target';
export interface ComparisonEntry {config:PipelineConfig;session:Session|null;error:string|null}
export interface ComparisonBundle {
 schemaVersion:'pipeline-comparison-v1';id:string;sourceSha256:string;sourceFilename:string;sourceSizeBytes:number;
 modelSha256:string;samplingHz:number;selectionId:string;startedAtUtc:string;sharedPreparationMs:number;wallDurationMs:number;
 entries:ComparisonEntry[];
}
export function discontinuities(samples:readonly Sample[],width:number,height:number) {
 let pairs=0,count=0;
 for(let i=1;i<samples.length;i++){
  const a=samples[i-1]!,b=samples[i]!;const dt=(b.sourceTimeMs-a.sourceTimeMs)/1000;
  if(Math.abs(b.requestedTimeMs-a.requestedTimeMs-200)>1||dt<=0)continue;
  const x=poseQuality(a.landmarks,width,height),y=poseQuality(b.landmarks,width,height);
  if(!x.torso||!y.torso)continue;pairs++;
  const speed=Math.hypot(y.torso.x-x.torso.x,y.torso.y-x.torso.y)/Math.max(x.torso.length,y.torso.length)/dt;
  const scales=[Math.max(x.torso.length/y.torso.length,y.torso.length/x.torso.length),...x.lengths.flatMap((l,j)=>l!==null&&y.lengths[j]!=null?[Math.max(l/y.lengths[j]!,y.lengths[j]!/l)]:[])];
  if(speed>POLICY.maxCenterTorsoPerSecond||scales.some(v=>v>POLICY.maxSegmentScaleChange))count++;
 }
 return {landmarkDiscontinuities:pairs?count:null,landmarkComparablePairs:pairs,nonComparablePairs:Math.max(0,samples.length-1-pairs)};
}
export function summarizeRun(session:Session,samples:Sample[]=session.samples){
 const human=targetMetrics(samples);const valid=samples.filter(s=>s.automaticAngles.left.valid||s.automaticAngles.right.valid).length;
 const reasons:Record<string,number>={};
 for(const s of samples)for(const reason of new Set([...s.tracking.reasons,...s.automaticAngles.left.invalidReasons,...s.automaticAngles.right.invalidReasons]))reasons[reason]=(reasons[reason]??0)+1;
 return {samples:samples.length,validSamples:valid,validFrameRate:samples.length?valid/samples.length:null,correctTargetRate:human.targetAccuracy,
  falseValidRate:human.falseValidRate,usableCoverage:human.usableCoverage,human,
  ...discontinuities(samples,session.metadata.sourceWidthPx,session.metadata.sourceHeightPx),analysisDurationMs:session.run?.analysisDurationMs??null,trackingFailureReasons:reasons};
}
export function comparisonReport(bundle:ComparisonBundle){
 const sessions=bundle.entries.flatMap(e=>e.session?[e.session]:[]);
 const first=sessions[0];
 const common=first?first.samples.map(s=>s.requestedTimeMs).filter(t=>sessions.every(run=>run.samples.some(s=>s.requestedTimeMs===t))):[];
 const estimated=sessions.reduce((n,s)=>n+s.samples.filter(p=>p.decode.timeBasis!=='presentation').length,0);
 let maxOffset:number|null=null;
 for(const t of common){const points=sessions.map(s=>s.samples.find(p=>p.requestedTimeMs===t)!);if(points.every(p=>p.decode.timeBasis==='presentation'))maxOffset=Math.max(maxOffset??0,Math.max(...points.map(p=>p.sourceTimeMs))-Math.min(...points.map(p=>p.sourceTimeMs)));}
 const provenanceConsistent=sessions.length>0&&sessions.every(s=>s.run?.comparisonId===bundle.id&&s.run.sourceSha256===bundle.sourceSha256&&s.metadata.model.assetSha256===bundle.modelSha256&&s.samplingHz===bundle.samplingHz&&s.subjectSelection.id===bundle.selectionId&&s.sourceFilename===bundle.sourceFilename)&&bundle.entries.every(e=>!e.session||e.session.run?.pipeline.id===e.config.id&&e.session.run.pipeline.numPoses===e.config.numPoses);
 return {definitionVersion:'pipeline-metrics-v1',groupId:bundle.id,complete:sessions.length===3,provenanceConsistent,
  alignment:{successfulPipelines:sessions.length,commonRequestedTimesMs:common,estimatedTimestampSamples:estimated,maxKnownPresentationOffsetMs:maxOffset},
  rows:bundle.entries.map(e=>({config:e.config,error:e.error,sessionId:e.session?.metadata.sessionId??null,allSamples:e.session?summarizeRun(e.session):null,commonSamples:e.session?summarizeRun(e.session,e.session.samples.filter(s=>common.includes(s.requestedTimeMs))):null}))};
}

export function comparisonCsv(bundle:ComparisonBundle):string {
 const report=comparisonReport(bundle);
 return serializeCsv([
 ['comparison_id','pipeline','source_sha256','model_sha256','common_samples','raw_samples','valid_frame_rate','correct_target_rate','false_valid_rate','usable_coverage','reviewed','assessable','uncertain','auto_valid_reviewed','landmark_discontinuities','landmark_comparable_pairs','analysis_duration_ms','failure_reasons','error'],
 ...report.rows.map(row=>{const s=row.commonSamples;return [bundle.id,row.config.id,bundle.sourceSha256,bundle.modelSha256,s?.samples??null,row.allSamples?.samples??null,s?.validFrameRate??null,s?.correctTargetRate??null,s?.falseValidRate??null,s?.usableCoverage??null,s?.human.reviewed??null,s?.human.assessable??null,s?.human.uncertain??null,s?.human.autoValidReviewed??null,s?.landmarkDiscontinuities??null,s?.landmarkComparablePairs??null,s?.analysisDurationMs??null,s?JSON.stringify(s.trackingFailureReasons):null,row.error];}),
 ]);
}
