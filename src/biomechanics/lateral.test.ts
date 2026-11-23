import { describe, expect, it } from 'vitest';
import { classifyView, measureLateral, nearSide, LATERAL_INDICES } from './lateral';
import { humanPose } from '../test/fixtures';
import { lateralCues } from '../motion/frontalCues';
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
