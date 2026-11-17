import { describe, expect, it } from 'vitest';
import { hipAngle, hipFlexionProxy, trunkLean, kneeWidthRatio, measurePosture, HIP_INDICES, TRUNK_INDICES, KNEE_WIDTH_INDICES, POSTURE_POLICY } from './posture';
import { humanPose } from '../test/fixtures';
import type { Landmark } from '../domain/analysis';
const v = (x: number, y: number): Landmark => ({ x, y, visibility: 1 });

describe('hip angle (shoulder–hip–knee, image plane)', () => {
  it('uses MediaPipe left 11/23/25 and right 12/24/26 independently', () => {
    expect(HIP_INDICES).toEqual({ left: [11, 23, 25], right: [12, 24, 26] });
    const p = humanPose();
    // Left: thigh horizontal forward (deep squat shape) -> 90°. Right: standing straight -> 180°.
    p[25] = v(.6, .5);
    expect(hipAngle(p, 'left', 100, 100).rawAngleDeg).toBeCloseTo(90, 8);
    expect(hipAngle(p, 'right', 100, 100).rawAngleDeg).toBeCloseTo(180, 8);
  });
  it('corrects aspect ratio before measuring', () => {
    const p = humanPose(); p[11] = v(.4, .3); p[23] = v(.4, .5); p[25] = v(.5, .5);
    expect(hipAngle(p, 'left', 100, 100).rawAngleDeg).toBeCloseTo(90, 8);
    p[25] = v(.5, .6); // 45° in a square frame; a 2:1 frame stretches x.
    expect(hipAngle(p, 'left', 100, 100).rawAngleDeg).toBeCloseTo(135, 8);
    expect(hipAngle(p, 'left', 200, 100).rawAngleDeg).toBeCloseTo(90 + Math.atan2(10, 20) * 180 / Math.PI, 8);
  });
  it('flexion proxy is 180 − interior and null when invalid', () => {
    const p = humanPose(); p[25] = v(.6, .5);
    expect(hipFlexionProxy(hipAngle(p, 'left', 100, 100))).toBeCloseTo(90, 8);
    expect(hipFlexionProxy(hipAngle([], 'left', 100, 100))).toBeNull();
  });
  it.each([
    [{ x: .4, y: .2, visibility: .3 }, 'low-confidence'],
    [{ x: -.1, y: .2, visibility: 1 }, 'out-of-frame'],
    [{ x: NaN, y: .2, visibility: 1 }, 'non-finite'],
  ])('reports N/A with reason for an unreliable shoulder', (point, reason) => {
    const p = humanPose(); p[11] = point;
    expect(hipAngle(p, 'left', 100, 100)).toEqual({ valid: false, rawAngleDeg: null, invalidReasons: [reason] });
    expect(hipAngle(p, 'right', 100, 100).valid).toBe(true);
  });
});

describe('trunk (upper body) forward lean vs image vertical', () => {
  it('uses both shoulders and both hips', () => expect(TRUNK_INDICES).toEqual([11, 12, 23, 24]));
  it('is 0° for an upright torso', () => expect(trunkLean(humanPose(), 100, 100).rawAngleDeg).toBeCloseTo(0, 8));
  it.each([[.3, 45], [-.3, 45], [.3 * Math.tan(Math.PI / 6), 30]])('measures lean magnitude when shoulders shift %f', (dx, deg) => {
    const p = humanPose(); p[11] = v(.4 + dx, .2); p[12] = v(.6 + dx, .2);
    expect(trunkLean(p, 100, 100).rawAngleDeg).toBeCloseTo(deg, 6);
  });
  it('reports 90° for a horizontal torso and 180° upside down', () => {
    const p = humanPose(); p[11] = v(.7, .5); p[12] = v(.9, .5);
    expect(trunkLean(p, 100, 100).rawAngleDeg).toBeCloseTo(90, 8);
    p[11] = v(.4, .8); p[12] = v(.6, .8);
    expect(trunkLean(p, 100, 100).rawAngleDeg).toBeCloseTo(180, 8);
  });
  it('corrects aspect ratio', () => {
    const p = humanPose(); p[11] = v(.5, .2); p[12] = v(.7, .2); // midpoint shift .1 in x, .3 in y
    expect(trunkLean(p, 100, 100).rawAngleDeg).toBeCloseTo(Math.atan2(10, 30) * 180 / Math.PI, 8);
    expect(trunkLean(p, 300, 100).rawAngleDeg).toBeCloseTo(45, 8);
  });
  it('rejects a collapsed torso instead of returning a number', () => {
    const p = humanPose(); for (const i of TRUNK_INDICES) p[i] = v(.5, .5);
    expect(trunkLean(p, 100, 100).invalidReasons).toEqual(['degenerate-geometry']);
    p[11] = v(.5, .5 - (POSTURE_POLICY.minTorsoPx + .5) / 100); p[12] = p[11];
    expect(trunkLean(p, 100, 100).valid).toBe(true);
  });
  it('is invalid when any torso anchor is unreliable', () => {
    const p = humanPose(); p[24] = { x: .6, y: .5, visibility: .1 };
    expect(trunkLean(p, 100, 100).invalidReasons).toEqual(['low-confidence']);
  });
});

describe('knee width ratio (knees ÷ ankles, frontal view)', () => {
  it('uses knees 25/26 and ankles 27/28', () => expect(KNEE_WIDTH_INDICES).toEqual([25, 26, 27, 28]));
  it('is 1 when knees are as wide as ankles', () => expect(kneeWidthRatio(humanPose(), 100, 100).value).toBeCloseTo(1, 8));
  it('falls below 1 when knees move inward and rises when they move outward', () => {
    const p = humanPose(); p[25] = v(.45, .7); p[26] = v(.55, .7);
    expect(kneeWidthRatio(p, 100, 100).value).toBeCloseTo(.5, 8);
    p[25] = v(.35, .7); p[26] = v(.65, .7);
    expect(kneeWidthRatio(p, 100, 100).value).toBeCloseTo(1.5, 8);
  });
  it('is scale invariant and aspect corrected', () => {
    const p = humanPose(); p[25] = v(.45, .7); p[26] = v(.55, .7);
    expect(kneeWidthRatio(p, 400, 400).value).toBeCloseTo(.5, 8);
    p[27] = v(.5, .8); p[28] = v(.5, 1); // ankles separated vertically only (20 px at 100 px height)
    expect(kneeWidthRatio(p, 200, 100).value).toBeCloseTo(1, 8); // knees 20 px wide in a 200 px frame
  });
  it('rejects feet together / side view instead of exploding', () => {
    const p = humanPose(); p[27] = v(.5, .9); p[28] = v(.52, .9);
    expect(kneeWidthRatio(p, 100, 100)).toEqual({ valid: false, value: null, invalidReasons: ['degenerate-geometry'] });
  });
  it('reports a missing ankle as N/A', () => {
    const p = humanPose().slice(0, 28);
    expect(kneeWidthRatio(p, 100, 100).invalidReasons).toEqual(['missing-landmark']);
  });
});

it('measurePosture returns every metric and handles an empty pose without numbers', () => {
  const ok = measurePosture(humanPose(), 100, 100);
  expect([ok.hip.left.valid, ok.hip.right.valid, ok.trunkLean.valid, ok.kneeWidthRatio.valid]).toEqual([true, true, true, true]);
  const none = measurePosture([], 100, 100);
  expect([none.hip.left.rawAngleDeg, none.hip.right.rawAngleDeg, none.trunkLean.rawAngleDeg, none.kneeWidthRatio.value]).toEqual([null, null, null, null]);
  expect(measurePosture(humanPose(), 0, 100).trunkLean.invalidReasons).toEqual(['non-finite']);
});
