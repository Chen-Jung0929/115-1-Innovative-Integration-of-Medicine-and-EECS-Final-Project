import { describe, expect, it } from 'vitest';
import { CUE_POLICY, createCueTracker, instantCues } from './frontalCues';
import type { FrontalMetrics } from '../biomechanics/frontal';
import type { ScalarValue } from '../domain/measurement';

const n = (value: number): ScalarValue => ({ valid: true, value, invalidReasons: [] });
const na: ScalarValue = { valid: false, value: null, invalidReasons: ['low-confidence'] };
const neutral = (): FrontalMetrics => ({ head: n(0), shoulderTilt: n(0), trunkSide: n(0), shift: n(0), pelvisTilt: n(0), kneeToe: { left: n(0), right: n(0) }, shinTilt: { left: n(0), right: n(0) } });
const squat = { left: 80, right: 80 };

describe('frontal prompts (provisional thresholds)', () => {
  it('neutral posture gives no prompt', () => expect(instantCues(neutral(), squat)).toEqual([]));
  it('handout p.7 case: head off midline because the trunk leans left → one prompt naming the cause', () => {
    const m = { ...neutral(), trunkSide: n(12), head: n(0.5), shoulderTilt: n(7) };
    const cues = instantCues(m, squat);
    expect(cues.map(c => c.text)).toEqual(['上身往左傾（頭偏離中線、兩肩不平）']);
    expect(cues[0]!.parts).toEqual(['trunk', 'head', 'shoulder']);
  });
  it('head off midline without trunk lean is its own prompt', () => {
    expect(instantCues({ ...neutral(), head: n(-0.5) }, squat).map(c => c.text)).toEqual(['頭偏離中線（往右）']);
  });
  it('shoulder tilt opposite to the trunk lean is not attributed to it', () => {
    const texts = instantCues({ ...neutral(), trunkSide: n(-10), shoulderTilt: n(7) }, squat).map(c => c.text);
    expect(texts).toEqual(['上身往右傾', '左肩比較低（兩肩不平）']);
  });
  it('pelvis tilt (p.10) and knee inside the toe line (p.11)', () => {
    const m = { ...neutral(), pelvisTilt: n(-6), kneeToe: { left: n(0.6), right: n(0.1) } };
    expect(instantCues(m, squat).map(c => c.text)).toEqual(['骨盆往右傾（兩側不水平）', '左膝往內，沒有對準腳尖']);
  });
  it('knee prompts wait until the person is actually squatting', () => {
    const m = { ...neutral(), kneeToe: { left: n(0.6), right: n(0.6) } };
    expect(instantCues(m, { left: 10, right: null })).toEqual([]);
  });
  it('N/A metrics never trigger a prompt', () => {
    expect(instantCues({ head: na, shoulderTilt: na, trunkSide: na, shift: na, pelvisTilt: na, kneeToe: { left: na, right: na }, shinTilt: { left: na, right: na } }, squat)).toEqual([]);
  });
  it('values exactly at a threshold do not trigger', () => {
    expect(instantCues({ ...neutral(), trunkSide: n(CUE_POLICY.trunkDeg) }, squat)).toEqual([]);
  });
});

describe('frontal shin tilt (literature, provisional, ADR-098)', () => {
  it(`shin tilted inward ≥ ${CUE_POLICY.shinValgusDeg}° gives the knee-inward prompt even when the knee is not past the toe line`, () => {
    expect(CUE_POLICY.shinValgusDeg).toBe(3);
    const m = { ...neutral(), shinTilt: { left: n(3), right: n(2.9) } };
    expect(instantCues(m, squat).map(c => c.text)).toEqual(['左膝往內，小腿往內斜']);
  });
  it('one prompt per knee when both signs agree; the toe-line wording wins', () => {
    const m = { ...neutral(), kneeToe: { left: n(0.6), right: n(0) }, shinTilt: { left: n(8), right: n(0) } };
    const cues = instantCues(m, squat);
    expect(cues.map(c => c.id)).toEqual(['knee-left']);
    expect(cues[0]!.text).toBe('左膝往內，沒有對準腳尖');
  });
  it('shin tilted outward (wide stance) or a standing pose never triggers', () => {
    expect(instantCues({ ...neutral(), shinTilt: { left: n(-10), right: n(-10) } }, squat)).toEqual([]);
    expect(instantCues({ ...neutral(), shinTilt: { left: n(6), right: n(6) } }, { left: 10, right: 10 })).toEqual([]);
  });
  it('existing thresholds set before ADR-098 are unchanged', () => {
    expect([CUE_POLICY.headHipWidths, CUE_POLICY.shoulderDeg, CUE_POLICY.trunkDeg, CUE_POLICY.shiftHipWidths, CUE_POLICY.pelvisDeg, CUE_POLICY.kneeToeHipWidths, CUE_POLICY.kneeMinFlexionDeg, CUE_POLICY.kneeForwardShank, CUE_POLICY.trunkForwardDeg, CUE_POLICY.sideShoulderForwardShank])
      .toEqual([0.35, 5, 8, 0.25, 5, 0.45, 30, 0.6, 45, 0.4]);
  });
});

describe('prompt debouncing', () => {
  const lean = instantCues({ ...neutral(), trunkSide: n(12) }, squat);
  it('shows a prompt only after it held for holdMs and drops it immediately when it clears', () => {
    const t = createCueTracker();
    expect(t.update(0, lean)).toEqual([]);
    expect(t.update(200, lean).map(c => c.id)).toEqual(['trunk']);
    expect(t.update(400, [])).toEqual([]);
    expect(t.update(600, lean)).toEqual([]); // restarted
  });
  it('shows at most maxShown prompts in priority order', () => {
    const t = createCueTracker();
    const many = instantCues({ ...neutral(), trunkSide: n(12), pelvisTilt: n(8), kneeToe: { left: n(1), right: n(1) } }, squat);
    t.update(0, many);
    expect(t.update(200, many).map(c => c.id)).toEqual(['trunk', 'pelvis', 'knee-left']);
  });
});
