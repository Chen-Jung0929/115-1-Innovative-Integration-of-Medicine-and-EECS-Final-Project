import { describe, expect, it } from 'vitest';
import { classifyView, measureLateral, measureSidePlumb, nearSide, sideAnchor, LATERAL_INDICES, type SidePlumb } from './lateral';
import type { ScalarValue } from '../domain/measurement';
import { humanPose } from '../test/fixtures';
import { CUE_POLICY, deepEnough, lateralCues, mergeSideCues } from '../motion/frontalCues';
import type { Landmark } from '../domain/analysis';
const v = (x: number, y: number, visibility = 1): Landmark => ({ x, y, visibility });

/** Side view facing +x, left side toward the camera. */
function side(): Landmark[] {
  const p = humanPose();
  p[11] = v(.5, .3); p[12] = v(.51, .3, .6); p[23] = v(.5, .6); p[24] = v(.51, .6, .6);
  p[25] = v(.5, .75); p[26] = v(.51, .75, .6); p[27] = v(.5, .9); p[28] = v(.51, .9, .6);
  p[29] = v(.47, .92); p[30] = v(.48, .92, .6); p[31] = v(.56, .92); p[32] = v(.57, .92, .6);
  return p;
}

describe('view detection', () => {
  it('frontal, side and oblique from shoulder width / torso length', () => {
    expect(classifyView(humanPose(), 100, 100)).toBe('frontal'); // 20 / 30
    expect(classifyView(side(), 100, 100)).toBe('side');
    const o = humanPose(); o[11] = v(.44, .2); o[12] = v(.56, .2);
    expect(classifyView(o, 100, 100)).toBe('oblique'); // 12 / 30 = .4
    expect(classifyView([], 100, 100)).toBeNull();
  });
  it('near side = higher visibility', () => {
    expect(nearSide(side())).toBe('left');
    const p = side(); for (const i of LATERAL_INDICES.left) p[i] = { ...p[i]!, visibility: .55 };
    expect(nearSide(p)).toBe('right');
  });
});

describe('side-view metrics (handout p.12)', () => {
  it('upright and knee above the ankle → no lean, knee behind the toe', () => {
    const m = measureLateral(side(), 100, 100);
    expect(m.side).toBe('left');
    expect(m.trunkLean.value).toBeCloseTo(0, 8);
    expect(m.tibiaLean.value).toBeCloseTo(0, 8);
    expect(m.kneeForward.value).toBeCloseTo(-6 / 15, 8); // knee 6 px behind the toe, shank 15 px
  });
  it('signs use the heel→toe direction, so facing left or right gives the same result', () => {
    const p = side(); p[25] = v(.62, .75); p[11] = v(.6, .35); // knee 6 px past toe; trunk leans forward
    const m = measureLateral(p, 100, 100);
    const mirrored = measureLateral(p.map(q => ({ ...q, x: 1 - q.x })), 100, 100);
    expect(m.kneeForward.value).toBeGreaterThan(0);
    expect(mirrored.kneeForward.value).toBeCloseTo(m.kneeForward.value!, 8);
    expect(m.trunkLean.value).toBeCloseTo(Math.atan2(10, 25) * 180 / Math.PI, 8);
    expect(mirrored.trunkLean.value).toBeCloseTo(m.trunkLean.value!, 8);
  });
  it('N/A with reason when a near-side point is unreliable', () => {
    const p = side(); p[31] = v(.56, .92, .2);
    expect(measureLateral(p, 100, 100).kneeForward.invalidReasons).toEqual(['low-confidence']);
  });
  it('prompts: trunk > 45° and knee past the toe > 0.6 shank (only when the knee is bent)', () => {
    const p = side(); p[11] = v(.8, .4); p[25] = v(.72, .8); p[27] = v(.5, .9);
    const m = measureLateral(p, 100, 100);
    expect(lateralCues(m, 80).map(c => c.text)).toEqual(['上身前傾太多', '膝蓋超過腳尖太多']);
    expect(lateralCues(m, 10).map(c => c.text)).toEqual(['上身前傾太多']);
    expect(lateralCues(measureLateral(side(), 100, 100), 80)).toEqual([]);
  });
});

describe('side baseline through the ankle (lateral malleolus)', () => {
  it('anchor = near ankle, shank length and heel→toe direction', () => {
    expect(sideAnchor(side(), 100, 100, 'left')).toEqual({ ankle: { x: 50, y: 90 }, shank: 15, forward: 1 });
    const p = side(); p[27] = v(.5, .9, .2);
    expect(sideAnchor(p, 100, 100, 'left')).toBe('low-confidence');
  });
  it('ear / shoulder / hip offsets from the line in shank lengths, + = toward the toes, mirror-safe', () => {
    const p = side(); p[7] = v(.53, .15); p[11] = v(.56, .3); p[23] = v(.47, .6);
    const m = measureSidePlumb(p, 100, 100, 'left', 50);
    expect(m.ear.value).toBeCloseTo(3 / 15, 8);
    expect(m.shoulder.value).toBeCloseTo(6 / 15, 8);
    expect(m.hip.value).toBeCloseTo(-3 / 15, 8);
    const mirrored = measureSidePlumb(p.map(q => ({ ...q, x: 1 - q.x })), 100, 100, 'left', 50);
    expect(mirrored.shoulder.value).toBeCloseTo(6 / 15, 8);
  });
  it('N/A before the line is locked, and per point when only that point is unreliable', () => {
    expect(measureSidePlumb(side(), 100, 100, 'left', null).shoulder.invalidReasons).toEqual(['baseline-pending']);
    const p = side(); p[7] = v(.53, .15, .1);
    const m = measureSidePlumb(p, 100, 100, 'left', 50);
    expect(m.ear.invalidReasons).toEqual(['low-confidence']);
    expect(m.shoulder.valid).toBe(true);
  });
  it('prompt: shoulder past the line > 0.4 shank while squatting; merged into the trunk prompt when both apply', () => {
    const val = (value: number): ScalarValue => ({ valid: true, value, invalidReasons: [] });
    const plumb = (sh: number): SidePlumb => ({ ear: val(sh), shoulder: val(sh), hip: val(0) });
    const upright = measureLateral(side(), 100, 100);
    expect(lateralCues(upright, 80, plumb(.5)).map(c => c.text)).toEqual(['重心偏前（肩膀超過外踝基準線太多）']);
    expect(lateralCues(upright, 10, plumb(.5))).toEqual([]); // standing: not judged
    expect(lateralCues(upright, 80, plumb(.3))).toEqual([]);
    const p = side(); p[11] = v(.8, .4);
    const both = lateralCues(measureLateral(p, 100, 100), 80, plumb(.6));
    expect(both.map(c => c.id)).toEqual(['trunk-forward', 'side-forward']); // separate ids so each keeps its own hold timer
    expect(mergeSideCues(both).map(c => c.text)).toEqual(['上身前傾太多（肩膀超過基準線，重心偏前）']);
    expect(mergeSideCues(both)[0]!.parts).toEqual(['side-trunk', 'side-plumb']);
  });
});


describe('literature side checks (provisional, ADR-098)', () => {
  const val = (value: number): ScalarValue => ({ valid: true, value, invalidReasons: [] });
  const lat = (trunk: number, tibia: number, hipDepth = -1) => ({ side: 'left' as const, kneeForward: val(0), trunkLean: val(trunk), tibiaLean: val(tibia), hipDepth: val(hipDepth) });
  it('trunk leaning more than the shin at the bottom of the squat → one prompt; parallel or less → none', () => {
    expect(CUE_POLICY.trunkTibiaMarginDeg).toBe(0);
    expect(lateralCues(lat(35, 30), 95).map(c => c.text)).toEqual(['上身比小腿更往前倒（上身應與小腿大致平行）']);
    expect(lateralCues(lat(35, 30, .1), 60).map(c => c.id)).toEqual(['trunk-tibia']); // hip below the knee = bottom
    expect(lateralCues(lat(30, 30), 95)).toEqual([]);
    expect(lateralCues(lat(20, 30), 95)).toEqual([]);
  });
  it('on the way down (knee 30–89°, hip above the knee) the trunk normally leans first: not judged', () => {
    expect(lateralCues(lat(18, 0), 70)).toEqual([]);
    expect(lateralCues(lat(35, 30), 89)).toEqual([]);
    expect(lateralCues(lat(35, 30), 90).map(c => c.id)).toEqual(['trunk-tibia']); // boundary: ≥ 90° counts as the bottom
    expect(lateralCues(lat(35, 30), 10)).toEqual([]);
  });
  it('"leaning too far" covers it: only the stronger prompt is shown; with the weight-forward prompt they merge', () => {
    expect(lateralCues(lat(50, 30), 95).map(c => c.id)).toEqual(['trunk-forward', 'trunk-tibia']);
    expect(mergeSideCues(lateralCues(lat(50, 30), 95)).map(c => c.id)).toEqual(['trunk-forward']);
    const plumb: SidePlumb = { ear: val(.6), shoulder: val(.6), hip: val(0) };
    const merged = mergeSideCues(lateralCues(lat(35, 30), 95, plumb));
    expect(merged.map(c => c.text)).toEqual(['上身比小腿更往前倒（肩膀超過基準線，重心偏前）']);
    expect(merged[0]!.parts).toEqual(['side-trunk', 'side-plumb']);
  });
  it('hip lower than the knee = full depth (information only, never a prompt)', () => {
    const p = side(); p[23] = v(.4, .78); p[11] = v(.5, .5); // hip 3 px below the knee, shank 15 px
    const m = measureLateral(p, 100, 100);
    expect(m.hipDepth.value).toBeCloseTo(3 / 15, 8);
    expect(deepEnough(m)).toBe(true);
    expect(deepEnough(measureLateral(side(), 100, 100))).toBe(false);
    expect(deepEnough(null)).toBe(false);
    expect(lateralCues(lat(0, 0, .5), 80)).toEqual([]);
  });
});
