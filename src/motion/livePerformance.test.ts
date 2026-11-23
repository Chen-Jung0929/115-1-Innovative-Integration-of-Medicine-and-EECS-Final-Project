import { describe, expect, it } from 'vitest';
import { createPerformanceRecorder, percentile } from './livePerformance';
const info = { userAgent: 'test', delegate: 'CPU', width: 640, height: 360, warmUpMs: 800, sourceClockOffsetMs: 5000 };
describe('live performance record', () => {
  it('uses nearest-rank percentiles and ignores non-finite values', () => {
    expect(percentile([10, 20, 30, 40], 50)).toBe(20);
    expect(percentile([10, 20, 30, 40], 95)).toBe(40);
    expect(percentile([Number.NaN], 50)).toBeNull();
  });
  it('counts frames the callback missed as dropped, but not frames skipped by the sampling rate', () => {
    const r = createPerformanceRecorder(info);
    [1, 2, 3, 6, 7].forEach((n, i) => r.frame(i * 33.3, n)); // 4 and 5 never reached the callback
    r.sample(0, 20, 40, 'capture-time'); r.sample(1, 30, 60, 'capture-time');
    const s = r.summary();
    expect(s.droppedFrames).toBe(2);
    expect(s.presentedFrames).toBe(5);
    expect(s.processedSamples).toBe(2);
    expect(s.inferenceMs.p50).toBe(20);
    expect(s.latencyMs).toEqual({ p50: 40, p95: 60, basis: 'capture-time' });
    expect(s.sourceClockOffsetMs).toBe(5000);
  });
  it('marks latency as a weaker estimate when capture time is unavailable', () => {
    const r = createPerformanceRecorder(info);
    r.frame(0, 1); r.sample(0, 10, 12, 'presentation-callback');
    expect(r.summary().latencyMs.basis).toBe('presentation-callback');
    expect(r.summary().inputFps).toBeNull();
  });
});
