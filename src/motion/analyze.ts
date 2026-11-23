import { checkedPipeline,DEFAULT_PIPELINE,type PipelineConfig } from '../domain/pipeline';
import { createFullFrameIdentity } from '../tracking/identity';
import type { Session, Sample } from '../domain/analysis';
import { ANGLE_DEFINITION, QC_POLICY, SAMPLING_HZ, ANALYSIS_SCHEMA_VERSION, ALLOWED_SAMPLING_HZ } from '../domain/analysis';
import { measureKnees, trackingPolicySnapshot } from './measure';
import { loadVideo, seekFrame, releaseVideo } from '../input/video';
import { createPoseEngine, modelBytes, MODEL_VERSION } from '../pose/mediapipe';
import { sampleTimes } from './series';
import type { SubjectSelection,TrackingState } from '../domain/tracking';
import { checkedKeyframes,roiAt } from '../tracking/keyframes';
import { checkedRoi, fromCrop } from '../tracking/roi';
import { createRoiController, FOLLOW_POLICY, type FramePlan } from '../tracking/controller';
import { gatePosture } from '../tracking/gate';
import { measurePosture } from '../biomechanics/posture';
import pkg from '../../package.json';

export interface AnalysisOptions {pipeline?:PipelineConfig;asset?:Awaited<ReturnType<typeof modelBytes>>;sourceSha256?:string;comparisonId?:string;samplingHz?:number}

export async function analyze(url: string, filename: string, model: File | null, allowOfficialDownload: boolean, selection: SubjectSelection, signal: AbortSignal, progress: (done: number, total: number, phase: string) => void, options:AnalysisOptions={}): Promise<Session> {
  const started=performance.now();
  const pipeline=checkedPipeline(options.pipeline??DEFAULT_PIPELINE);
  const cropping=pipeline.id==='roi-crop';
  let modelPreparationMs=0;
  let completed:Session|undefined;
  const decoder = document.createElement('video');
  decoder.className = 'analysis-decoder'; decoder.playsInline = true; decoder.setAttribute('aria-hidden', 'true');
  // Off-screen decoder may throttle rVFC; seekFrame records settled-frame timing fallback.
  document.body.append(decoder);
  let engine: Awaited<ReturnType<typeof createPoseEngine>> | undefined;
  let searchUnavailable:string|undefined;
  let searchEngine: Awaited<ReturnType<typeof createPoseEngine>> | undefined;
  try {
    progress(0, 0, '讀取影片與模型');
    await loadVideo(decoder, url, signal);
    const prepareStart=performance.now();
    const asset = options.asset??await modelBytes(model, signal, allowOfficialDownload);
    modelPreparationMs=options.asset?0:performance.now()-prepareStart;
    engine = await createPoseEngine(asset.bytes,pipeline.numPoses);
    signal.throwIfAborted();
    const canvas = document.createElement('canvas');
    const roi = checkedRoi(selection.roi, decoder.videoWidth, decoder.videoHeight);
    canvas.width = roi.width; canvas.height = roi.height;
    if(selection.method!=='manual-fixed-roi')checkedKeyframes(selection.keyframes,decoder.videoWidth,decoder.videoHeight,decoder.duration*1000);
    let identity=createFullFrameIdentity(decoder.videoWidth,decoder.videoHeight,{controlledSingle:pipeline.id==='full-frame-single'&&selection.correctionSource==='controlled-single-default',restartAfterLock:true});
    let referenceKey:string|null=null;
    let previousTrackingState:TrackingState='TRACKING';
    const controller = createRoiController(selection,decoder.videoWidth,decoder.videoHeight);
    const fullFrame=document.createElement('canvas');fullFrame.width=decoder.videoWidth;fullFrame.height=decoder.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('此瀏覽器無法建立影格畫布。');
    const samplingHz = (ALLOWED_SAMPLING_HZ as readonly number[]).includes(options.samplingHz ?? NaN) ? options.samplingHz! : SAMPLING_HZ;
    const times = sampleTimes(decoder.duration, samplingHz);
    const samples: Sample[] = [];
    let previous = -1;
    for (const [index, time] of times.entries()) {
      signal.throwIfAborted();
      const decode = await seekFrame(decoder, time, signal);
      const sourceTimeMs = decode.sourceTimeMs;
      if (sourceTimeMs <= previous) { progress(index + 1, times.length, '分析中'); continue; } // Low FPS/VFR may return the same frame. Never send duplicate timestamps.
      const referenceSelection={...selection,method:'manual-keyframes' as const,keyframes:selection.keyframes.length?selection.keyframes:[{id:selection.id,timeMs:0,roi:selection.roi,source:'manual-target-confirmation' as const}]};
      const reference=roiAt(referenceSelection,time*1000,decoder.videoWidth,decoder.videoHeight);
      const proposal:FramePlan=cropping?controller.propose(time*1000):{roi:{x:0,y:0,width:decoder.videoWidth,height:decoder.videoHeight},roiSource:'full-frame',roiUpdateReason:'original-source-image-no-crop',manualKeyframeId:reference.manualKeyframeId,resetModel:false,searchDue:false,previousState:previousTrackingState};
      if(!cropping&&reference.manualKeyframeId!==referenceKey){identity=createFullFrameIdentity(decoder.videoWidth,decoder.videoHeight,{controlledSingle:pipeline.id==='full-frame-single'&&selection.correctionSource==='controlled-single-default',restartAfterLock:true});referenceKey=reference.manualKeyframeId;}
      const usedRoi=proposal.roi;
      if(proposal.resetModel){engine.close();engine=await createPoseEngine(asset.bytes);signal.throwIfAborted();proposal.roiUpdateReason+=':new-model-after-manual-confirmation';}
      canvas.width=usedRoi.width;canvas.height=usedRoi.height;
      ctx.drawImage(decoder, usedRoi.x, usedRoi.y, usedRoi.width, usedRoi.height, 0, 0, canvas.width, canvas.height);
      const candidates = engine.detect(canvas, sourceTimeMs).map(cropLandmarks => ({cropLandmarks,landmarks:fromCrop(cropLandmarks,usedRoi,decoder.videoWidth,decoder.videoHeight)}));
      let searchCandidates: ReturnType<typeof engine.detect>|undefined;
      if(cropping&&selection.method==='adaptive-roi'&&(proposal.searchDue||(candidates.length!==1&&proposal.previousState==='TRACKING'))) {
        try { if(!searchUnavailable){searchEngine??=await createPoseEngine(asset.bytes,FOLLOW_POLICY.searchNumPoses);signal.throwIfAborted();
        const context=fullFrame.getContext('2d');if(!context)throw new Error('無法建立全畫面搜尋畫布');context.drawImage(decoder,0,0);
        searchCandidates=searchEngine.detect(fullFrame,sourceTimeMs);}
        }catch(e){searchUnavailable=(e instanceof Error?e.message:String(e)).slice(0,300);}
      }
      const detected=candidates.map(c=>c.landmarks);
      const fullResult=cropping?null:identity.observe(detected,sourceTimeMs,reference.roi);
      const {tracking,search}=fullResult?{tracking:fullResult.tracking,search:null}:controller.observe(detected,sourceTimeMs,proposal,searchCandidates,searchUnavailable);
      previousTrackingState=tracking.state;
      const landmarks = fullResult?fullResult.landmarks:candidates.length===1?candidates[0]!.landmarks:[];
      const subjectDecision=fullResult?.decision??{selectedIndex:tracking.accepted?0:null,proposedIndex:candidates.length===1?0:null,reason:'roi-primary-single-candidate'};
      const {rawAngles,automaticAngles}=measureKnees(landmarks,tracking,decoder.videoWidth,decoder.videoHeight);
      const rawPosture = measurePosture(landmarks,decoder.videoWidth,decoder.videoHeight);
      const automaticPosture = gatePosture(rawPosture,tracking);
      samples.push({ sampleIndex: samples.length, requestedTimeMs: time * 1000, sourceTimeMs, decode, ...proposal, targetReferenceRoi:reference.roi, subjectDecision, search, landmarks, candidates, tracking, rawAngles, automaticAngles, ...automaticAngles, posture:{raw:rawPosture,automatic:automaticPosture,final:automaticPosture} });
      previous = sourceTimeMs;
      progress(index + 1, times.length, '分析中');
      await new Promise(resolve => setTimeout(resolve, 0)); // Allow cancellation / progress paint.
    }
    if (!samples.length) throw new Error('沒有可分析的影格。');
    completed={
      run:{pipeline,inputSpace:cropping?'roi-crop':'full-frame',sourceSha256:options.sourceSha256??null,comparisonId:options.comparisonId??null,analysisDurationMs:performance.now()-started,modelPreparationMs,requestedSamples:times.length},
      analysisRevision:{parentSessionId:null,selectionRevision:selection.revision,correctionSource:selection.correctionSource},trackingPolicy:trackingPolicySnapshot(), subjectSelection: {...selection,roi}, sourceFilename: filename, durationMs: decoder.duration * 1000, samplingHz, samples,
      metadata: { schemaVersion: ANALYSIS_SCHEMA_VERSION, sessionId: crypto.randomUUID(), sourceId: crypto.randomUUID(), inputKind: 'video',
        sourceWidthPx: decoder.videoWidth, sourceHeightPx: decoder.videoHeight, inferenceMirrored: false, displayMirrored: false,
        model: { packageVersion: MODEL_VERSION, assetId: asset.id, assetSha256: asset.hash, delegate: 'CPU' },
        angleDefinitionVersion: ANGLE_DEFINITION, qcPolicyVersion: QC_POLICY, applicationVersion: pkg.version, createdAtUtc: new Date().toISOString() },
    };return completed;
  } finally { searchEngine?.close(); engine?.close(); releaseVideo(decoder); if(completed?.run)completed.run.analysisDurationMs=performance.now()-started; }
}
