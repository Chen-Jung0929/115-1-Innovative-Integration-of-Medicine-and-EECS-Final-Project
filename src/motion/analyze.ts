import type { Session, Sample } from '../domain/analysis';
import { ANGLE_DEFINITION, QC_POLICY, SAMPLING_HZ } from '../domain/analysis';
import { kneeAngle } from '../biomechanics/knee';
import { loadVideo, seekFrame, releaseVideo } from '../input/video';
import { createPoseEngine, modelBytes, MODEL_VERSION } from '../pose/mediapipe';
import { sampleTimes } from './series';
import type { SubjectSelection } from '../domain/tracking';
import { checkedRoi, fromCrop } from '../tracking/roi';
import { createTargetTracker, TRACKING_POLICY } from '../tracking/target';
import { gateAngle } from '../tracking/gate';
import pkg from '../../package.json';

export async function analyze(url: string, filename: string, model: File | null, allowOfficialDownload: boolean, selection: SubjectSelection, signal: AbortSignal, progress: (done: number, total: number, phase: string) => void): Promise<Session> {
  const decoder = document.createElement('video');
  decoder.className = 'analysis-decoder'; decoder.playsInline = true; decoder.setAttribute('aria-hidden', 'true');
  // Attached, off-screen video ensures browsers can present paused frames for rVFC.
  document.body.append(decoder);
  let engine: Awaited<ReturnType<typeof createPoseEngine>> | undefined;
  try {
    progress(0, 0, '讀取影片與模型');
    await loadVideo(decoder, url, signal);
    const asset = await modelBytes(model, signal, allowOfficialDownload);
    engine = await createPoseEngine(asset.bytes);
    signal.throwIfAborted();
    const canvas = document.createElement('canvas');
    const roi = checkedRoi(selection.roi, decoder.videoWidth, decoder.videoHeight);
    canvas.width = roi.width; canvas.height = roi.height;
    const tracker = createTargetTracker(roi, decoder.videoWidth, decoder.videoHeight);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('此瀏覽器無法建立影格畫布。');
    const times = sampleTimes(decoder.duration, SAMPLING_HZ);
    const samples: Sample[] = [];
    let previous = -1;
    for (const [index, time] of times.entries()) {
      signal.throwIfAborted();
      const decode = await seekFrame(decoder, time, signal);
      const sourceTimeMs = decode.sourceTimeMs;
      if (sourceTimeMs <= previous) { progress(index + 1, times.length, '分析中'); continue; } // Low FPS/VFR may return the same frame. Never send duplicate timestamps.
      ctx.drawImage(decoder, roi.x, roi.y, roi.width, roi.height, 0, 0, canvas.width, canvas.height);
      const candidates = engine.detect(canvas, sourceTimeMs).map(cropLandmarks => ({cropLandmarks,landmarks:fromCrop(cropLandmarks,roi,decoder.videoWidth,decoder.videoHeight)}));
      const tracking = tracker.assess(candidates.map(c=>c.landmarks),sourceTimeMs);
      const landmarks = candidates.length===1 ? candidates[0]!.landmarks : [];
      const rawAngles = {left:kneeAngle(landmarks,'left',decoder.videoWidth,decoder.videoHeight),right:kneeAngle(landmarks,'right',decoder.videoWidth,decoder.videoHeight)};
      const automaticAngles = {left:gateAngle(rawAngles.left,tracking),right:gateAngle(rawAngles.right,tracking)};
      samples.push({ sampleIndex: samples.length, requestedTimeMs: time * 1000, sourceTimeMs, decode, landmarks, candidates, tracking, rawAngles, automaticAngles, ...automaticAngles });
      previous = sourceTimeMs;
      progress(index + 1, times.length, '分析中');
      await new Promise(resolve => setTimeout(resolve, 0)); // Allow cancellation / progress paint.
    }
    if (!samples.length) throw new Error('沒有可分析的影格。');
    return {
      trackingPolicy:TRACKING_POLICY, subjectSelection: {...selection,roi}, sourceFilename: filename, durationMs: decoder.duration * 1000, samplingHz: SAMPLING_HZ, samples,
      metadata: { schemaVersion: '4', sessionId: crypto.randomUUID(), sourceId: crypto.randomUUID(), inputKind: 'video',
        sourceWidthPx: decoder.videoWidth, sourceHeightPx: decoder.videoHeight, inferenceMirrored: false, displayMirrored: false,
        model: { packageVersion: MODEL_VERSION, assetId: asset.id, assetSha256: asset.hash, delegate: 'CPU' },
        angleDefinitionVersion: ANGLE_DEFINITION, qcPolicyVersion: QC_POLICY, applicationVersion: pkg.version, createdAtUtc: new Date().toISOString() },
    };
  } finally { engine?.close(); releaseVideo(decoder); }
}
