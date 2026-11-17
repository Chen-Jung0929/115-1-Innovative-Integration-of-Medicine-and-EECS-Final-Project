import type { Point } from '../biomechanics/knee';

/**
 * Handout p.5 baseline: the vertical line through the midpoint of both heels. During a squat the
 * heels should not move, so instead of redrawing the line from every (noisy) frame we lock it once
 * the person has stood still, and only move it when the feet clearly move. This keeps the drawn line
 * steady while the body moves. Pure state machine; video and camera feed it the same way.
 *
 * Distances are in hip widths so the policy does not depend on resolution or camera distance.
 * Values are provisional engineering choices, not PT-reviewed endpoints.
 */
export const BASELINE_POLICY = {
  version: 'heel-baseline-lock-v1',
  /** Heels must stay within this range (hip widths) for `lockWindowMs` before locking. */
  lockToleranceHipWidths: 0.15,
  lockWindowMs: 1000,
  /** At least this many observations inside the window (5 Hz video ≈ 5–6 per second). */
  minLockSamples: 4,
  /** Heels farther than this from the locked line … */
  relockDistanceHipWidths: 0.35,
  /** … for at least this long means the feet really moved: unlock and search again. */
  relockHoldMs: 600,
  /** Without any heel observation for this long the lock is dropped. */
  lostTimeoutMs: 2000,
} as const;

export interface BaselineObservation { timeMs: number; heel: Point | null; hipWidthPx: number | null }

export type BaselineState =
  | { state: 'searching'; x: null; heelY: null; lockedAtMs: null }
  | { state: 'locked'; x: number; heelY: number; lockedAtMs: number };

const SEARCHING: BaselineState = { state: 'searching', x: null, heelY: null, lockedAtMs: null };
interface Obs { timeMs: number; x: number; y: number; scale: number }

export function createBaselineAnchor(policy: typeof BASELINE_POLICY = BASELINE_POLICY) {
  let window: Obs[] = [];
  let current: BaselineState = SEARCHING;
  let lastSeenMs: number | null = null;
  let awaySinceMs: number | null = null;

  function update(o: BaselineObservation): BaselineState {
    const usable = o.heel && o.hipWidthPx && o.hipWidthPx > 0 && [o.heel.x, o.heel.y, o.hipWidthPx, o.timeMs].every(Number.isFinite);
    if (!usable) {
      if (lastSeenMs !== null && o.timeMs - lastSeenMs > policy.lostTimeoutMs) { current = SEARCHING; window = []; awaySinceMs = null; }
      return current;
    }
    const obs: Obs = { timeMs: o.timeMs, x: o.heel!.x, y: o.heel!.y, scale: o.hipWidthPx! };
    lastSeenMs = o.timeMs;

    if (current.state === 'locked') {
      if (Math.abs(obs.x - current.x) / obs.scale <= policy.relockDistanceHipWidths) { awaySinceMs = null; return current; }
      awaySinceMs ??= o.timeMs;
      if (o.timeMs - awaySinceMs < policy.relockHoldMs) return current;
      // Feet moved: search again, seeded with this observation.
      current = SEARCHING; window = []; awaySinceMs = null;
    }

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
      const x = window.reduce((s, w) => s + w.x, 0) / window.length;
      const heelY = window.reduce((s, w) => s + w.y, 0) / window.length;
      current = { state: 'locked', x, heelY, lockedAtMs: obs.timeMs };
      window = [];
    }
    return current;
  }
  return { update, reset: () => { window = []; current = SEARCHING; lastSeenMs = null; awaySinceMs = null; } };
}
