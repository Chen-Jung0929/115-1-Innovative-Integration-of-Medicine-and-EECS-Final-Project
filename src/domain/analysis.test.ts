import { describe, expect, it } from 'vitest';
import { SAMPLING_HZ, samplingHzFrom } from './analysis';

describe('uploaded-video sampling rate (ADR-081)', () => {
  it('defaults to 10 Hz; ?hz=5 re-runs the frozen 5 Hz setting; other values are ignored', () => {
    expect(SAMPLING_HZ).toBe(10);
    expect(samplingHzFrom('')).toBe(10);
    expect(samplingHzFrom('?hz=5')).toBe(5);
    expect(samplingHzFrom('?case=x&hz=5')).toBe(5);
    expect(samplingHzFrom('?hz=30')).toBe(10);
    expect(samplingHzFrom('?hz=abc')).toBe(10);
  });
});
