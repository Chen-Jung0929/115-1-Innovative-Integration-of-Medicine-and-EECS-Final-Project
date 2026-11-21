import { describe, expect, it } from 'vitest';
import { frontalTimeline } from './frontalTimeline';
import { humanPose, makeSample } from '../test/fixtures';
import type { Landmark } from '../domain/analysis';
const v = (x: number, y: number): Landmark => ({ x, y, visibility: 1 });
function pose(lean = 0): Landmark[] {
  const p = humanPose();
  p[2] = v(.48 - lean, .1); p[5] = v(.52 - lean, .1); p[0] = v(.5 - lean, .12);
  p[11] = v(.4 - lean, .2); p[12] = v(.6 - lean, .2);
  p[29] = v(.42, .95); p[30] = v(.58, .95); p[31] = v(.4, .97); p[32] = v(.6, .97);
  return p;
}
const at = (i: number, landmarks: Landmark[], extra = {}) => makeSample({ sampleIndex: i, sourceTimeMs: i * 200, requestedTimeMs: i * 200, landmarks, ...extra });

describe('frontal timeline over analysed samples', () => {
  it('locks the baseline after standing, then prompts a sustained left trunk lean', () => {
    const samples = [0, 1, 2, 3, 4, 5].map(i => at(i, pose())).concat([6, 7, 8].map(i => at(i, pose(.08))));
    const t = frontalTimeline(samples, 100, 100);
    expect(t[3]!.calibration).toBe('whole-video'); // before the 1 s lock, the whole-video standing calibration is used
    expect(t[4]!.baseline).toMatchObject({ state: 'locked', x: 50 });
    expect(t[4]!.calibration).toBe('standing-lock');
    expect(t[5]!.cues).toEqual([]);
    expect(t[6]!.cues).toEqual([]); // first leaning sample: still debouncing
    expect(t[7]!.cues.map(c => c.text)).toEqual(['上身往左傾（頭偏離中線）']);
    expect(t[8]!.baseline.x).toBe(50); // the line did not follow the body
  });
  it('rejected subject or human review never feeds the baseline or prompts', () => {
    const rejected = { ...makeSample().tracking, accepted: false, identity: 'target-lost' as const };
    const t = frontalTimeline([0, 1, 2, 3, 4, 5, 6].map(i => at(i, pose(.08), { tracking: rejected })), 100, 100);
    expect(t.every(f => f.baseline.state === 'searching' && f.cues.length === 0)).toBe(true);
    expect(t[0]!.metrics.trunkSide.invalidReasons).toEqual(['target-lost']);
  });
  it('keeps the analysed sample index for each frame', () => {
    const t = frontalTimeline([at(1, pose()), at(0, pose())], 100, 100);
    expect(t.map(f => f.sampleIndex)).toEqual([0, 1]);
  });
  it('default baseline = standing trunk midline, not the heel midpoint (asymmetric stance)', () => {
    const asym = () => { const p = pose(); p[29] = v(.46, .95); p[30] = v(.62, .95); return p; }; // heels centre at .54
    const samples = [0, 1, 2, 3, 4, 5].map(i => at(i, asym()));
    const trunk = frontalTimeline(samples, 100, 100);
    expect(trunk[5]!.baseline.x).toBeCloseTo(50, 8);
    expect(trunk[5]!.cues).toEqual([]);
    const heel = frontalTimeline(samples, 100, 100, 'heel-midpoint');
    expect(heel[5]!.baseline.x).toBeCloseTo(54, 8);
  });
  it('does not calibrate while squatting', () => {
    const bent = { valid: true as const, rawAngleDeg: 120, invalidReasons: [] as [] };
    const t = frontalTimeline([0, 1, 2, 3, 4, 5].map(i => at(i, pose(), { left: bent, right: bent })), 100, 100);
    expect(t.every(f => f.baseline.state === 'searching')).toBe(true);
  });
  it('an oblique view is not judged (frontal checks and knee check N/A)', () => {
    const oblique = () => { const p = pose(); p[11] = v(.45, .2); p[12] = v(.55, .2); return p; }; // shoulder/torso = 0.33
    const t = frontalTimeline([0, 1, 2, 3, 4, 5].map(i => at(i, oblique())), 100, 100);
    expect(t[5]!.metrics.trunkSide.invalidReasons).toEqual(['unsupported-view']);
    expect(t[5]!.metrics.kneeToe.left.invalidReasons).toEqual(['unsupported-view']);
    expect(t[5]!.cues).toEqual([]);
  });
  it('tilts are relative to the standing calibration (natural shoulder tilt / rolled camera is not a fault)', () => {
    const tilted = (extra: number) => { const p = pose(); p[11] = v(.4, .2 + .2 * Math.tan((6 + extra) * Math.PI / 180)); return p; };
    const t = frontalTimeline([0, 1, 2, 3, 4, 5, 6].map(i => at(i, tilted(0))).concat([7, 8, 9].map(i => at(i, tilted(7)))), 100, 100);
    expect(t[3]!.calibration).toBe('whole-video');
    expect(Math.abs(t[3]!.metrics.shoulderTilt.value ?? 99)).toBeLessThan(3); // relative to the standing samples, not to 0°
    expect(t[4]!.neutral!.shoulderTilt).toBeCloseTo(6, 6);
    expect(t[6]!.metrics.shoulderTilt.value).toBeCloseTo(0, 6);
    expect(t[6]!.cues).toEqual([]);
    expect(t[9]!.metrics.shoulderTilt.value).toBeCloseTo(7, 6);
    expect(t[9]!.cues.map(c => c.text)).toEqual(['左肩比較低（兩肩不平）']);
  });
});

describe('side view in the timeline', () => {
  const sidePose = (lean = 0): Landmark[] => {
    const p = humanPose();
    p[11] = v(.5 + lean, .3); p[12] = v(.51 + lean, .3); p[23] = v(.5, .6); p[24] = v(.51, .6);
    p[25] = v(.5, .75); p[26] = v(.51, .75); p[27] = v(.5, .9); p[28] = v(.51, .9);
    p[29] = v(.47, .92); p[30] = v(.48, .92); p[31] = v(.56, .92); p[32] = v(.57, .92);
    return p;
  };
  it('detects the side view and prompts sustained forward trunk lean without needing a baseline', () => {
    const t = frontalTimeline([0, 1, 2].map(i => at(i, sidePose(.4))), 100, 100);
    expect(t.every(f => f.view === 'side' && f.baseline.state === 'searching')).toBe(true);
    expect(t[0]!.lateral!.trunkLean.value).toBeGreaterThan(45);
    expect(t[1]!.cues.map(c => c.text)).toEqual(['上身前傾太多']);
  });
  it('upright side view gives no prompt', () => {
    const t = frontalTimeline([0, 1, 2].map(i => at(i, sidePose())), 100, 100);
    expect(t[2]!.view).toBe('side'); expect(t[2]!.cues).toEqual([]);
  });
  it('a clip that never stands still for 1 s still gets a baseline from its upright moments', () => {
    const bent = { valid: true as const, rawAngleDeg: 110, invalidReasons: [] as [] };
    const up = { valid: true as const, rawAngleDeg: 172, invalidReasons: [] as [] };
    // Alternating squat / brief stand every 200 ms: the live 1 s lock never happens.
    const t = frontalTimeline([0, 1, 2, 3, 4, 5, 6, 7].map(i => at(i, pose(), i % 2 ? { left: up, right: up } : { left: bent, right: bent })), 100, 100);
    expect(t.every(f => f.calibration === 'whole-video' && f.baseline.x !== null)).toBe(true);
    expect(t[0]!.metrics.trunkSide.valid).toBe(true);
  });
  it('fixed camera: one view for the clip; mixed clips use a 600 ms hold', () => {
    const oblique = () => { const p = pose(); p[11] = v(.45, .2); p[12] = v(.55, .2); return p; };
    const blip = frontalTimeline([0, 1, 2, 3, 4, 5, 6, 7].map(i => at(i, i === 6 ? oblique() : pose())), 100, 100);
    expect(blip[6]!.view).toBe('frontal');
    // Half frontal, half oblique: no whole-clip view, so the 600 ms hold decides per sample.
    const turn = frontalTimeline([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => at(i, i >= 5 ? oblique() : pose())), 100, 100);
    expect(turn[6]!.view).toBe('frontal'); // still within the 600 ms hold
    expect(turn[8]!.view).toBe('oblique');
    // Mostly frontal clip with a few oblique-looking frames scattered: the whole clip is frontal.
    const fixedCam = frontalTimeline([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => at(i, [3, 4, 5].includes(i) ? oblique() : pose())), 100, 100);
    expect(fixedCam.every(f => f.view === 'frontal')).toBe(true);
  });
});
