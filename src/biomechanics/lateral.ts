import type { InvalidReason, ScalarValue } from '../domain/measurement';
import type { Landmark } from '../domain/analysis';
import { sourcePoints, type Point } from './knee';

/**
 * Side-view (lateral) squat checks from the Movement analysis handout p.12 and view detection.
 * 2D image-plane geometry on aspect-corrected source pixels, NOT validated clinical measurements.
 * Definitions and thresholds require PT review.
 */
export const LATERAL_POLICY = {
  version: 'squat-lateral-image-v1',
  viewDefinition: 'view-shoulder-width-over-torso-v1',
  kneeForwardDefinition: 'knee-ahead-of-toe-plumb-shank-length-v1',
  trunkLeanDefinition: 'trunk-forward-lean-near-side-image-vertical-v1',
  tibiaLeanDefinition: 'shank-forward-lean-near-side-image-vertical-v1',
  /** Shoulder width / torso length at or above this = frontal (same as FRONTAL_POLICY). */
  frontalMinRatio: 0.55,
  /** At or below this = side view (body turned roughly 70° or more). */
  sideMaxRatio: 0.3,
} as const;

export type ViewKind = 'frontal' | 'side' | 'oblique';

/** Landmarks of each anatomical side: shoulder, hip, knee, ankle, heel, toe (foot index). */
export const LATERAL_INDICES = { left: [11, 23, 25, 27, 29, 31], right: [12, 24, 26, 28, 30, 32] } as const;

const DEG = 180 / Math.PI;
const bad = (reason: InvalidReason): ScalarValue => ({ valid: false, value: null, invalidReasons: [reason] });
const ok = (value: number): ScalarValue => Number.isFinite(value) ? { valid: true, value, invalidReasons: [] } : bad('non-finite');

/**
 * Camera view from how wide the shoulders look compared with the torso. Uses positions only (no
 * visibility gate) because the far shoulder is often low-visibility in a side view; null when the
 * points are missing or non-finite.
 */
export function classifyView(landmarks: readonly Landmark[], width: number, height: number): ViewKind | null {
  const p = [11, 12, 23, 24].map(i => landmarks[i]);
  if (p.some(q => !q || !Number.isFinite(q.x) || !Number.isFinite(q.y))) return null;
  const [ls, rs, lh, rh] = p.map(q => ({ x: q!.x * width, y: q!.y * height })) as [Point, Point, Point, Point];
  const sm = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 }, hm = { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2 };
  const torso = Math.hypot(sm.x - hm.x, sm.y - hm.y);
  if (!(torso > 1e-6)) return null;
  const ratio = Math.abs(ls.x - rs.x) / torso;
  return ratio >= LATERAL_POLICY.frontalMinRatio ? 'frontal' : ratio <= LATERAL_POLICY.sideMaxRatio ? 'side' : 'oblique';
}

/** The side nearer the camera: higher mean visibility over shoulder/hip/knee/ankle/heel/toe. */
export function nearSide(landmarks: readonly Landmark[]): 'left' | 'right' {
  const mean = (idx: readonly number[]) => idx.reduce((s, i) => s + (Number.isFinite(landmarks[i]?.visibility) ? landmarks[i]!.visibility : 0), 0) / idx.length;
  return mean(LATERAL_INDICES.left) >= mean(LATERAL_INDICES.right) ? 'left' : 'right';
}

export interface LateralMetrics {
  side: 'left' | 'right';
  /** Knee ahead of the vertical through the toe tip, in shank lengths; + = in front of the toes. */
  kneeForward: ScalarValue;
  /** Near-side hip→shoulder vs image vertical, degrees; + = leaning forward. */
  trunkLean: ScalarValue;
  /** Near-side ankle→knee vs image vertical, degrees; + = shank inclined forward. */
  tibiaLean: ScalarValue;
}

/** Ungated side-view metrics for the near side. Forward = heel→toe direction. Assumes a level camera. */
export function measureLateral(landmarks: readonly Landmark[], width: number, height: number): LateralMetrics {
  const side = nearSide(landmarks);
  const p = sourcePoints(landmarks, LATERAL_INDICES[side], width, height);
  if (typeof p === 'string') { const no = bad(p); return { side, kneeForward: no, trunkLean: no, tibiaLean: no }; }
  const [S, H, K, A, E, T] = p as [Point, Point, Point, Point, Point, Point];
  const forward = Math.sign(T.x - E.x);
  if (forward === 0) { const no = bad('degenerate-geometry'); return { side, kneeForward: no, trunkLean: no, tibiaLean: no }; }
  const shank = Math.hypot(K.x - A.x, K.y - A.y);
  return {
    side,
    kneeForward: shank < 1e-6 ? bad('degenerate-geometry') : ok((K.x - T.x) * forward / shank),
    trunkLean: H.y - S.y <= 0 ? bad('degenerate-geometry') : ok(Math.atan2((S.x - H.x) * forward, H.y - S.y) * DEG),
    tibiaLean: A.y - K.y <= 0 ? bad('degenerate-geometry') : ok(Math.atan2((K.x - A.x) * forward, A.y - K.y) * DEG),
  };
}
