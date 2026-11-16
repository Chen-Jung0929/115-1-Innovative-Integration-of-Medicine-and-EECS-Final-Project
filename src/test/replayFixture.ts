import type {Session,Landmark} from '../domain/analysis';
import type {PipelineId} from '../domain/pipeline';
import {humanPose,selection,makeSample} from './fixtures';
import {createFullFrameIdentity} from '../tracking/legacy/identity';
import {createTargetTracker} from '../tracking/legacy/target';
import {kneeAngle} from '../biomechanics/knee';
import {gateAngle} from '../tracking/gate';
/** Synthetic geometry only. Reproduces the code-path pattern, not the user's human video. */
export function syntheticResearch(pipeline:PipelineId='full-frame-single',frames?:Landmark[][]):Session {
 const roi={x:0,y:0,width:640,height:360};
 const full=createFullFrameIdentity(640,360),target=createTargetTracker(roi,640,360);
 const poses=frames??Array.from({length:155},(_,i)=>{const p=humanPose();if(i===4){p[25]!.y=.57;p[26]!.y=.57;}return p;});
 const samples=poses.map((p,i)=>{
  const r=full.observe([p],i*200,roi),tracking=pipeline==='roi-crop'?target.assess([p],i*200,roi):r.tracking;
  const rawAngles={left:kneeAngle(p,'left',640,360),right:kneeAngle(p,'right',640,360)};
  const automaticAngles={left:gateAngle(rawAngles.left,tracking,'left'),right:gateAngle(rawAngles.right,tracking,'right')};
  return makeSample({sampleIndex:i,sourceTimeMs:i*200,requestedTimeMs:i*200,roi,targetReferenceRoi:roi,landmarks:p,candidates:[{cropLandmarks:p,landmarks:p}],tracking,rawAngles,automaticAngles,...automaticAngles,subjectDecision:r.decision});
 });
 return {metadata:{schemaVersion:'7',sessionId:`synthetic-${pipeline}`,sourceId:'synthetic-source',sourceWidthPx:640,sourceHeightPx:360,inputKind:'video',inferenceMirrored:false,displayMirrored:false,model:{packageVersion:'synthetic-test',assetId:'synthetic',assetSha256:'synthetic-model-hash',delegate:'CPU'},angleDefinitionVersion:'knee-image-interior-v1',qcPolicyVersion:'multi-pipeline-observation-and-identity-v4',applicationVersion:'0.5.0',createdAtUtc:'2026-11-17T00:00:00Z'},subjectSelection:{...selection,roi},trackingPolicy:{version:'roi-temporal-recovery-v2'},analysisRevision:{parentSessionId:null,selectionRevision:1,correctionSource:'initial-selection'},sourceFilename:'synthetic-no-human.mp4',durationMs:poses.length*200,samplingHz:5,samples,
 run:{pipeline:{id:pipeline,numPoses:pipeline==='full-frame-multi'?2:1},inputSpace:pipeline==='roi-crop'?'roi-crop':'full-frame',sourceSha256:'synthetic-source-hash',comparisonId:null,analysisDurationMs:10,modelPreparationMs:0,requestedSamples:poses.length}};
}
