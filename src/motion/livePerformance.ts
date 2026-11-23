/**
 * Live performance record (docs/VALIDATION_PROTOCOL.md "Performance"). Inference time and end-to-end
 * latency are kept separate; frames skipped on purpose by the sampling rate are not counted as drops.
 */
import { LIVE_PERFORMANCE_VERSION, type LatencyBasis, type LivePerformance } from '../domain/performance';
export { LIVE_PERFORMANCE_VERSION };

export function percentile(values: readonly number[], p: number): number | null {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[rank]!;
}

export function createPerformanceRecorder(info: { userAgent: string; delegate: string; width: number; height: number; warmUpMs: number; sourceClockOffsetMs: number }) {
  let firstMs: number | null = null, lastMs: number | null = null, lastPresented: number | null = null;
  let presented = 0, dropped = 0;
  const samples: LivePerformance['perSample'] = [];
  let basis: LatencyBasis = 'capture-time';
  return {
    /** Call for every frame callback. presentedFrames is the browser's running counter. */
    frame(mediaTimeMs: number, presentedFrames: number) {
      if (firstMs === null) firstMs = mediaTimeMs;
      lastMs = mediaTimeMs; presented++;
      if (lastPresented !== null && presentedFrames > lastPresented + 1) dropped += presentedFrames - lastPresented - 1;
      lastPresented = presentedFrames;
    },
    sample(sampleIndex: number, inferenceMs: number, latencyMs: number, latencyBasis: LatencyBasis) {
      if (latencyBasis === 'presentation-callback') basis = 'presentation-callback';
      samples.push({ sampleIndex, inferenceMs, latencyMs });
    },
    summary(): LivePerformance {
      const seconds = firstMs !== null && lastMs !== null && lastMs > firstMs ? (lastMs - firstMs) / 1000 : 0;
      return { version: LIVE_PERFORMANCE_VERSION, userAgent: info.userAgent, delegate: info.delegate, sourceWidthPx: info.width, sourceHeightPx: info.height,
        warmUpMs: info.warmUpMs, sourceClockOffsetMs: info.sourceClockOffsetMs, durationMs: seconds * 1000,
        presentedFrames: presented, droppedFrames: dropped, processedSamples: samples.length,
        inputFps: seconds ? (presented - 1) / seconds : null, processedFps: seconds ? Math.max(0, samples.length - 1) / seconds : null,
        inferenceMs: { p50: percentile(samples.map(s => s.inferenceMs), 50), p95: percentile(samples.map(s => s.inferenceMs), 95) },
        latencyMs: { p50: percentile(samples.map(s => s.latencyMs), 50), p95: percentile(samples.map(s => s.latencyMs), 95), basis },
        perSample: [...samples] };
    },
  };
}
