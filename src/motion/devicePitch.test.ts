import { describe, expect, it } from 'vitest';
import { createPitchRecorder, manualPitch, pitchFromOrientation, pitchLabel } from './devicePitch';

describe('camera pitch from the phone tilt sensor', () => {
  it('upright phone = 0°, top leaned back = rear camera looking down', () => {
    expect(pitchFromOrientation(90, 0, 'environment')).toBeCloseTo(0, 6);
    expect(pitchFromOrientation(80, 0, 'environment')).toBeCloseTo(10, 6);
    expect(pitchFromOrientation(80, 0, 'user')).toBeCloseTo(-10, 6);
    // Landscape (gamma ±90) with the phone tipped: same downward tilt from the cos·cos term.
    expect(pitchFromOrientation(0, -80, 'environment')).toBeCloseTo(10, 6);
  });
  it('rejects missing or out-of-range readings', () => {
    expect(pitchFromOrientation(null, 0, 'environment')).toBeNull();
    expect(pitchFromOrientation(NaN, 0, 'environment')).toBeNull();
    expect(pitchFromOrientation(0, 0, 'environment')).toBeNull(); // lying flat = 90° down
  });
  it('segment summary is the median, so a bump does not move it', () => {
    const r = createPitchRecorder();
    expect(r.summary()).toBeNull();
    [10, 11, 12, 40, null].forEach(v => r.add(v));
    expect(r.summary()).toEqual({ deg: 11.5, source: 'device-orientation', readings: 4 });
    r.reset(); expect(r.count).toBe(0);
  });
  it('manual input: empty = not provided, clamped to 0–30°', () => {
    expect(manualPitch('')).toBeNull();
    expect(manualPitch('abc')).toBeNull();
    expect(manualPitch('12')).toEqual({ deg: 12, source: 'manual' });
    expect(manualPitch('45')!.deg).toBe(30);
    expect(pitchLabel({ deg: 12.4, source: 'device-orientation' })).toBe('鏡頭俯角 12°（手機感測器）');
    expect(pitchLabel(null)).toBeNull();
  });
});
