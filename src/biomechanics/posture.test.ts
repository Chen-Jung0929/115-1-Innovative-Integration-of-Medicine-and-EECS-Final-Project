import { describe, expect, it } from 'vitest';
import { hipAngle, hipFlexionProxy, trunkLean, kneeToeOffset, measurePosture, HIP_INDICES, TRUNK_INDICES, KNEE_TOE_INDICES, POSTURE_POLICY } from './posture';
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

describe('knee vs toe plumb line (handout p.11, frontal view)', () => {
  // Hips at x .4/.6 (hip width 20 px at 100 px), toes directly under the knees.
  function frontal(): Landmark[] { const p = humanPose(); p[31] = v(.4, .95); p[32] = v(.6, .95); return p; }
  it('uses both hips plus knee 25 / toe 31 (left) and knee 26 / toe 32 (right)', () =>
    expect(KNEE_TOE_INDICES).toEqual({ left: [23, 24, 25, 31], right: [23, 24, 26, 32] }));
  it('is 0 when the knee is on the toe line', () => {
    expect(kneeToeOffset(frontal(), 'left', 100, 100).value).toBeCloseTo(0, 8);
    expect(kneeToeOffset(frontal(), 'right', 100, 100).value).toBeCloseTo(0, 8);
  });
  it('is positive when the knee moves medially and negative laterally, per anatomical side', () => {
    const p = frontal(); p[25] = v(.45, .7); p[26] = v(.65, .7); // left knee inward 5 px, right knee outward 5 px
    expect(kneeToeOffset(p, 'left', 100, 100).value).toBeCloseTo(.25, 8);
    expect(kneeToeOffset(p, 'right', 100, 100).value).toBeCloseTo(-.25, 8);
  });
  it('keeps medial = positive when the person faces away (left/right swapped on screen)', () => {
    const p = frontal(); p[23] = v(.6, .5); p[24] = v(.4, .5); p[25] = v(.55, .7); p[31] = v(.6, .95); p[26] = v(.4, .7); p[32] = v(.4, .95);
    expect(kneeToeOffset(p, 'left', 100, 100).value).toBeCloseTo(.25, 8);
    expect(kneeToeOffset(p, 'right', 100, 100).value).toBeCloseTo(0, 8);
  });
  it('is scale invariant and aspect corrected', () => {
    const p = frontal(); p[25] = v(.45, .7);
    expect(kneeToeOffset(p, 'left', 400, 400).value).toBeCloseTo(.25, 8);
    expect(kneeToeOffset(p, 'left', 200, 100).value).toBeCloseTo(.25, 8);
  });
  it('rejects a side view (hips overlap horizontally) instead of exploding', () => {
    const p = frontal(); p[24] = v(.42, .5);
    expect(kneeToeOffset(p, 'left', 100, 100)).toEqual({ valid: false, value: null, invalidReasons: ['degenerate-geometry'] });
  });
  it('reports a missing or unreliable toe as N/A', () => {
    expect(kneeToeOffset(humanPose().slice(0, 31), 'left', 100, 100).invalidReasons).toEqual(['missing-landmark']);
    const p = frontal(); p[32] = { x: .6, y: .95, visibility: .2 };
    expect(kneeToeOffset(p, 'right', 100, 100).invalidReasons).toEqual(['low-confidence']);
    expect(kneeToeOffset(p, 'left', 100, 100).valid).toBe(true);
  });
});

it('measurePosture returns every metric and handles an empty pose without numbers', () => {
  const ok = measurePosture(humanPose(), 100, 100);
  expect([ok.hip.left.valid, ok.hip.right.valid, ok.trunkLean.valid, ok.kneeToe.left.valid, ok.kneeToe.right.valid]).toEqual([true, true, true, true, true]);
  const none = measurePosture([], 100, 100);
  expect([none.hip.left.rawAngleDeg, none.hip.right.rawAngleDeg, none.trunkLean.rawAngleDeg, none.kneeToe.left.value, none.kneeToe.right.value]).toEqual([null, null, null, null, null]);
  expect(measurePosture(humanPose(), 0, 100).trunkLean.invalidReasons).toEqual(['non-finite']);
});
