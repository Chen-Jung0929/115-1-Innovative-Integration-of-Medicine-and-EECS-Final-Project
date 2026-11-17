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
    expect(t[3]!.baseline.state).toBe('searching');
    expect(t[4]!.baseline).toMatchObject({ state: 'locked', x: 50 });
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
});
