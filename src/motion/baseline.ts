import type { Point } from '../biomechanics/knee';

/**
 * Baseline lock. The heels decide WHEN: the person must stand still (heel midpoint stable for about
 * a second) and the line only moves again when the feet clearly move. `centerX` decides WHERE: the
 * caller passes either the heel midpoint (handout p.5 definition) or the standing trunk midline.
 * Locking instead of redrawing every (noisy) frame keeps the line steady while the body moves.
 * Pure state machine; video and camera feed it the same way.
 *
 * Distances are in hip widths so the policy does not depend on resolution or camera distance.
 * Values are provisional engineering choices, not PT-reviewed endpoints.
 */
export const BASELINE_POLICY = {
  version: 'heel-baseline-lock-v1',
  /** Heels must stay within this range (hip widths) for `lockWindowMs` before locking. */
  lockToleranceHipWidths: 0.15,
  lockWindowMs: 1000,
  /** At least this many observations inside the window (10 Hz video ≈ 10 per second; old 5 Hz sessions ≈ 5–6). */
  minLockSamples: 4,
  /** Heels farther than this from the locked line … */
  relockDistanceHipWidths: 0.35,
  /** … for at least this long means the feet really moved: unlock and search again. */
  relockHoldMs: 600,
  /** Without any heel observation for this long the lock is dropped. */
  lostTimeoutMs: 2000,
} as const;

export interface BaselineObservation {
  timeMs: number;
  /** Heel midpoint: decides whether the feet are still / have moved. */
  heel: Point | null;
  hipWidthPx: number | null;
  /** Where to put the line once locked (source px). Defaults to the heel midpoint x. */
  centerX?: number | null;
  /** Only standing observations may establish a lock (default true). */
  standing?: boolean;
}

export type BaselineState =
  | { state: 'searching'; x: null; heelY: null; lockedAtMs: null }
  | { state: 'locked'; x: number; heelY: number; lockedAtMs: number };

const SEARCHING: BaselineState = { state: 'searching', x: null, heelY: null, lockedAtMs: null };
interface Obs { timeMs: number; x: number; cx: number; y: number; scale: number }

export function createBaselineAnchor(policy: typeof BASELINE_POLICY = BASELINE_POLICY) {
  let window: Obs[] = [];
  let current: BaselineState = SEARCHING;
  let lastSeenMs: number | null = null;
  let awaySinceMs: number | null = null;
  /** Heel-midpoint x when the lock was made: the feet are compared with this, not with the line (which may be the trunk midline). */
  let lockedHeelX: number | null = null;

  function update(o: BaselineObservation): BaselineState {
    const usable = o.heel && o.hipWidthPx && o.hipWidthPx > 0 && [o.heel.x, o.heel.y, o.hipWidthPx, o.timeMs].every(Number.isFinite);
    if (!usable) {
      if (lastSeenMs !== null && o.timeMs - lastSeenMs > policy.lostTimeoutMs) { current = SEARCHING; window = []; awaySinceMs = null; }
      return current;
    }
    const cx = o.centerX ?? o.heel!.x;
    const obs: Obs = { timeMs: o.timeMs, x: o.heel!.x, cx: Number.isFinite(cx) ? cx : o.heel!.x, y: o.heel!.y, scale: o.hipWidthPx! };
    lastSeenMs = o.timeMs;

    if (current.state === 'locked') {
      if (Math.abs(obs.x - (lockedHeelX ?? current.x)) / obs.scale <= policy.relockDistanceHipWidths) { awaySinceMs = null; return current; }
      awaySinceMs ??= o.timeMs;
      if (o.timeMs - awaySinceMs < policy.relockHoldMs) return current;
      // Feet moved: search again, seeded with this observation.
      current = SEARCHING; window = []; awaySinceMs = null;
    }

    // Not standing (e.g. already squatting): cannot define the neutral line; wait for standing.
    if (o.standing === false || o.centerX === null) { window = []; return current; }
    window.push(obs);
    window = window.filter(w => obs.timeMs - w.timeMs <= policy.lockWindowMs);
    // Drop older observations until the remaining heel positions agree with each other.
    const scale = obs.scale;
    while (window.length > 1) {
      const xs = window.map(w => w.x);
      if ((Math.max(...xs) - Math.min(...xs)) / scale <= policy.lockToleranceHipWidths) break;
      window.shift();
    }
    const span = window.length ? obs.timeMs - window[0]!.timeMs : 0;
    if (window.length >= policy.minLockSamples && span >= policy.lockWindowMs * 0.75) {
      const x = window.reduce((s, w) => s + w.cx, 0) / window.length;
      const heelY = window.reduce((s, w) => s + w.y, 0) / window.length;
      current = { state: 'locked', x, heelY, lockedAtMs: obs.timeMs };
      lockedHeelX = window.reduce((s, w) => s + w.x, 0) / window.length;
      window = [];
    }
    return current;
  }
  /** Feet currently away from where the lock was made (waiting out relockHoldMs). */
  const away = () => current.state === 'locked' && awaySinceMs !== null;
  return { update, away, reset: () => { window = []; current = SEARCHING; lastSeenMs = null; awaySinceMs = null; lockedHeelX = null; } };
}
