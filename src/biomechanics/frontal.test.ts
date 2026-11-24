import { describe, expect, it } from 'vitest';
import { FRONTAL_LANDMARKS, frontalFrame, headPoint, heelMidpoint, measureFrontal, shinTilt } from './frontal';
import { humanPose } from '../test/fixtures';
import type { Landmark } from '../domain/analysis';
const v = (x: number, y: number, visibility = 1): Landmark => ({ x, y, visibility });

/** Frontal standing pose; person's left (MediaPipe 11/23) is at screen x < 0.5, i.e. facing the camera. */
function frontal(): Landmark[] {
  const p = humanPose();
  p[2] = v(.48, .1); p[5] = v(.52, .1); p[0] = v(.5, .12);
  p[29] = v(.42, .95); p[30] = v(.58, .95); p[31] = v(.4, .97); p[32] = v(.6, .97);
  return p;
}

describe('handout p.5 landmarks', () => {
  it('uses MediaPipe heels 29/30, eyes 2/5 and nose 0', () => {
    expect([FRONTAL_LANDMARKS.leftHeel, FRONTAL_LANDMARKS.rightHeel, FRONTAL_LANDMARKS.leftEye, FRONTAL_LANDMARKS.rightEye, FRONTAL_LANDMARKS.nose]).toEqual([29, 30, 2, 5, 0]);
  });
  it('baseline anchor is the heel midpoint in source pixels', () => {
    expect(heelMidpoint(frontal(), 200, 100)).toEqual({ x: 100, y: 95 });
    const p = frontal(); p[30] = v(.58, .95, .2);
    expect(heelMidpoint(p, 200, 100)).toBe('low-confidence');
  });
  it('head point is the eye midpoint (≈ 眉心), falling back to the nose', () => {
    expect(headPoint(frontal(), 100, 100)).toEqual({ x: 50, y: 10 });
    const p = frontal(); p[2] = v(.48, .1, .1); p[0] = v(.25, .12);
    expect(headPoint(p, 100, 100)).toEqual({ x: 25, y: 12 });
  });
});

describe('frontal metrics (signed toward the person\'s left)', () => {
  it('a symmetric pose is all zero', () => {
    const m = measureFrontal(frontal(), 100, 100, 50);
    for (const value of [m.head, m.shoulderTilt, m.trunkSide, m.shift, m.pelvisTilt]) expect(value.value).toBeCloseTo(0, 10);
  });
  it('head offset is in hip widths from the baseline, + toward the left (handout p.7)', () => {
    const p = frontal(); p[2] = v(.43, .1); p[5] = v(.47, .1); // head moves to screen x .45 = person's left
    expect(measureFrontal(p, 100, 100, 50).head.value).toBeCloseTo(0.25, 10); // 5 px / 20 px hip width
  });
  it('is mirror-safe: mirrored video gives the same anatomical sign', () => {
    const p = frontal(); p[2] = v(.43, .1); p[5] = v(.47, .1);
    const mirrored = p.map(q => ({ ...q, x: 1 - q.x }));
    expect(measureFrontal(mirrored, 100, 100, 50).head.value).toBeCloseTo(0.25, 10);
  });
  it('head and shift are N/A until a baseline is locked', () => {
    const m = measureFrontal(frontal(), 100, 100, null);
    expect(m.head.valid).toBe(false); expect(m.shift.valid).toBe(false); expect(m.shoulderTilt.valid).toBe(true);
  });
  it('shoulder and pelvis tilt: + = left side lower (handout p.8, p.10)', () => {
    const p = frontal(); p[11] = v(.4, .2 + .2 * Math.tan(10 * Math.PI / 180)); p[24] = v(.6, .5 + .2 * Math.tan(4 * Math.PI / 180));
    const m = measureFrontal(p, 100, 100, 50);
    expect(m.shoulderTilt.value).toBeCloseTo(10, 8);
    expect(m.pelvisTilt.value).toBeCloseTo(-4, 8);
  });
  it('trunk side lean vs image vertical, + = leaning left (handout p.9)', () => {
    const p = frontal(); const dx = .3 * Math.tan(12 * Math.PI / 180);
    p[11] = v(.4 - dx, .2); p[12] = v(.6 - dx, .2); // shoulders move toward the person's left
    expect(measureFrontal(p, 100, 100, 50).trunkSide.value).toBeCloseTo(12, 8);
  });
  it('corrects aspect ratio before measuring angles', () => {
    const p = frontal(); p[11] = v(.4, .25); // 5% of height over 20% of width
    expect(measureFrontal(p, 200, 100, 100).shoulderTilt.value).toBeCloseTo(Math.atan2(5, 40) * 180 / Math.PI, 8);
  });
  it('rejects a side view instead of reporting tilt', () => {
    const p = frontal(); p[11] = v(.495, .2); p[12] = v(.505, .2); p[23] = v(.45, .5); p[24] = v(.55, .5);
    expect(frontalFrame(p, 100, 100)).toBe('unsupported-view');
    expect(measureFrontal(p, 100, 100, 50).trunkSide.invalidReasons).toEqual(['unsupported-view']);
  });
  it('reports the landmark reason when a shoulder is unreliable', () => {
    const p = frontal(); p[12] = v(.6, .2, .1);
    expect(measureFrontal(p, 100, 100, 50).pelvisTilt).toEqual({ valid: false, value: null, invalidReasons: ['low-confidence'] });
  });
});

describe('shin tilt (ADR-098)', () => {
  it('0° for a vertical shin; + when the knee is medial of the ankle; same for a mirrored image', () => {
    expect(shinTilt(frontal(), 'left', 100, 100).value).toBeCloseTo(0, 8);
    const p = frontal(); p[25] = v(.42, .7); p[26] = v(.56, .7); // both knees 2 / 4 px toward the midline, shank 20 px
    expect(shinTilt(p, 'left', 100, 100).value).toBeCloseTo(Math.atan2(2, 20) * 180 / Math.PI, 8);
    expect(shinTilt(p, 'right', 100, 100).value).toBeCloseTo(Math.atan2(4, 20) * 180 / Math.PI, 8);
    const m = p.map(q => ({ ...q, x: 1 - q.x }));
    expect(shinTilt(m, 'left', 100, 100).value).toBeCloseTo(Math.atan2(2, 20) * 180 / Math.PI, 8);
    const out = frontal(); out[25] = v(.37, .7);
    expect(shinTilt(out, 'left', 100, 100).value).toBeLessThan(0);
  });
  it('N/A for an unreliable point or a side view', () => {
    const p = frontal(); p[27] = v(.4, .9, .1);
    expect(shinTilt(p, 'left', 100, 100).invalidReasons).toEqual(['low-confidence']);
    const s = frontal(); s[23] = v(.5, .5); s[24] = v(.505, .5);
    expect(shinTilt(s, 'left', 100, 100).invalidReasons).toEqual(['degenerate-geometry']);
    expect(measureFrontal(s, 100, 100, null).shinTilt.left.valid).toBe(false);
  });
});
