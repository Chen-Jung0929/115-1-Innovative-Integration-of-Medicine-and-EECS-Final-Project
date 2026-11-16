import type { Session, Sample } from '../domain/analysis';
import { ANGLE_DEFINITION, QC_POLICY, SAMPLING_HZ } from '../domain/analysis';
import { kneeAngle } from '../biomechanics/knee';
import { loadVideo, seekFrame, releaseVideo } from '../input/video';
import { createPoseEngine, modelBytes, MODEL_VERSION } from '../pose/mediapipe';
import { sampleTimes } from './series';
import pkg from '../../package.json';

export async function analyze(url: string, filename: string, model: File | null, allowOfficialDownload: boolean, signal: AbortSignal, progress: (done: number, total: number, phase: string) => void): Promise<Session> {
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
    canvas.width = decoder.videoWidth; canvas.height = decoder.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('此瀏覽器無法建立影格畫布。');
    const times = sampleTimes(decoder.duration, SAMPLING_HZ);
    const samples: Sample[] = [];
    let previous = -1;
    for (const [index, time] of times.entries()) {
      signal.throwIfAborted();
      const sourceTimeMs = await seekFrame(decoder, time, signal);
      if (sourceTimeMs <= previous) { progress(index + 1, times.length, '分析中'); continue; } // Low FPS/VFR may return the same frame. Never send duplicate timestamps.
      ctx.drawImage(decoder, 0, 0);
      const landmarks = engine.detect(canvas, sourceTimeMs);
      samples.push({ sampleIndex: samples.length, requestedTimeMs: time * 1000, sourceTimeMs, landmarks,
        left: kneeAngle(landmarks, 'left', canvas.width, canvas.height), right: kneeAngle(landmarks, 'right', canvas.width, canvas.height) });
      previous = sourceTimeMs;
      progress(index + 1, times.length, '分析中');
      await new Promise(resolve => setTimeout(resolve, 0)); // Allow cancellation / progress paint.
    }
    if (!samples.length) throw new Error('沒有可分析的影格。');
    return {
      sourceFilename: filename, durationMs: decoder.duration * 1000, samplingHz: SAMPLING_HZ, samples,
      metadata: { schemaVersion: '2', sessionId: crypto.randomUUID(), sourceId: crypto.randomUUID(), inputKind: 'video',
        sourceWidthPx: canvas.width, sourceHeightPx: canvas.height, inferenceMirrored: false, displayMirrored: false,
        model: { packageVersion: MODEL_VERSION, assetId: asset.id, assetSha256: asset.hash, delegate: 'CPU' },
        angleDefinitionVersion: ANGLE_DEFINITION, qcPolicyVersion: QC_POLICY, applicationVersion: pkg.version, createdAtUtc: new Date().toISOString() },
    };
  } finally { engine?.close(); releaseVideo(decoder); }
}
