import { describe, expect, it } from 'vitest';
import { BASELINE_POLICY, createBaselineAnchor } from './baseline';

const obs = (timeMs: number, x: number, hipWidthPx = 100) => ({ timeMs, heel: { x, y: 900 }, hipWidthPx });
/** 5 Hz like the video analysis. */
const run = (xs: number[], start = 0) => { const a = createBaselineAnchor(); return xs.map((x, i) => a.update(obs(start + i * 200, x))); };

describe('heel baseline lock (handout p.5)', () => {
  it('locks only after the heels stay still for about one second', () => {
    const states = run([500, 502, 498, 501, 500, 499]);
    expect(states.slice(0, 4).every(s => s.state === 'searching')).toBe(true);
    expect(states[4]).toMatchObject({ state: 'locked', heelY: 900 });
    expect(states[4]!.x).toBeCloseTo(500.2, 6);
  });
  it('does not move with normal landmark jitter or body motion once locked', () => {
    const a = createBaselineAnchor();
    for (let i = 0; i < 5; i++) a.update(obs(i * 200, 500));
    const locked = a.update(obs(1000, 500));
    // ±30 px heel jitter (0.3 hip widths) for several seconds: the line must not move.
    for (let i = 6; i < 30; i++) expect(a.update(obs(i * 200, 500 + (i % 2 ? 30 : -30)))).toEqual(locked);
  });
  it('relocks when the feet really move', () => {
    const a = createBaselineAnchor();
    for (let i = 0; i < 6; i++) a.update(obs(i * 200, 500));
    const moved = [] as string[];
    for (let i = 6; i < 20; i++) moved.push(a.update(obs(i * 200, 700)).state);
    expect(moved[0]).toBe('locked'); // a brief excursion is ignored
    expect(moved).toContain('searching');
    const last = a.update(obs(4000, 700));
    expect(last.state).toBe('locked'); expect(last.x).toBeCloseTo(700, 6);
  });
  it('does not lock while the heels keep drifting', () => {
    const states = run(Array.from({ length: 15 }, (_, i) => 400 + i * 10));
    expect(states.every(s => s.state === 'searching')).toBe(true);
  });
  it('missing heels keep the lock briefly, then drop it after the timeout', () => {
    const a = createBaselineAnchor();
    for (let i = 0; i < 6; i++) a.update(obs(i * 200, 500));
    expect(a.update({ timeMs: 1000 + BASELINE_POLICY.lostTimeoutMs, heel: null, hipWidthPx: null }).state).toBe('locked');
    expect(a.update({ timeMs: 1201 + BASELINE_POLICY.lostTimeoutMs, heel: null, hipWidthPx: null }).state).toBe('searching');
  });
  it('tolerance scales with body size (hip width), not pixels', () => {
    const a = createBaselineAnchor();
    // 12 px spread is 0.24 hip widths for a 50 px hip width → too unstable to lock.
    const s = [0, 1, 2, 3, 4, 5].map(i => a.update(obs(i * 200, i % 2 ? 512 : 500, 50)));
    expect(s.every(x => x.state === 'searching')).toBe(true);
  });
  it('places the line at centerX (e.g. standing trunk midline) while heels decide stillness', () => {
    const a = createBaselineAnchor();
    const s = [0, 1, 2, 3, 4].map(i => a.update({ ...obs(i * 200, 500), centerX: 470 + (i % 2) }));
    expect(s[4]!.state).toBe('locked'); expect(s[4]!.x).toBeCloseTo(470.4, 6);
  });
  it('only standing observations can establish the lock', () => {
    const a = createBaselineAnchor();
    const squatting = [0, 1, 2, 3, 4, 5].map(i => a.update({ ...obs(i * 200, 500), standing: false }));
    expect(squatting.every(x => x.state === 'searching')).toBe(true);
    // A squat in the middle of the window restarts it.
    a.update(obs(1200, 500)); a.update(obs(1400, 500)); a.update({ ...obs(1600, 500), standing: false });
    expect([1800, 2000, 2200, 2400, 2600].map(t => a.update(obs(t, 500)).state)).toEqual(['searching', 'searching', 'searching', 'searching', 'locked']);
  });
});
