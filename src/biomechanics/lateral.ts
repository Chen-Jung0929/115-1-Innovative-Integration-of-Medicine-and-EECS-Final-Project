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
  hipDepthDefinition: 'hip-below-knee-near-side-shank-length-v1',
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
/** Shoulder width / torso length in the image (≈1 facing the camera, ≈0 side-on); null when unusable. */
export function viewRatio(landmarks: readonly Landmark[], width: number, height: number): number | null {
  const p = [11, 12, 23, 24].map(i => landmarks[i]);
  if (p.some(q => !q || !Number.isFinite(q.x) || !Number.isFinite(q.y))) return null;
  const [ls, rs, lh, rh] = p.map(q => ({ x: q!.x * width, y: q!.y * height })) as [Point, Point, Point, Point];
  const sm = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 }, hm = { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2 };
  const torso = Math.hypot(sm.x - hm.x, sm.y - hm.y);
  if (!(torso > 1e-6)) return null;
  return Math.abs(ls.x - rs.x) / torso;
}

export function classifyView(landmarks: readonly Landmark[], width: number, height: number): ViewKind | null {
  const ratio = viewRatio(landmarks, width, height);
  if (ratio === null) return null;
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
  /** Near-side hip below the knee in the image, in shank lengths; + = hip lower than the knee (full squat depth). ADR-098 */
  hipDepth: ScalarValue;
}

/** Ungated side-view metrics for the near side. Forward = heel→toe direction. Assumes a level camera. */
export function measureLateral(landmarks: readonly Landmark[], width: number, height: number): LateralMetrics {
  const side = nearSide(landmarks);
  const p = sourcePoints(landmarks, LATERAL_INDICES[side], width, height);
  if (typeof p === 'string') { const no = bad(p); return { side, kneeForward: no, trunkLean: no, tibiaLean: no, hipDepth: no }; }
  const [S, H, K, A, E, T] = p as [Point, Point, Point, Point, Point, Point];
  const forward = Math.sign(T.x - E.x);
  if (forward === 0) { const no = bad('degenerate-geometry'); return { side, kneeForward: no, trunkLean: no, tibiaLean: no, hipDepth: no }; }
  const shank = Math.hypot(K.x - A.x, K.y - A.y);
  return {
    side,
    kneeForward: shank < 1e-6 ? bad('degenerate-geometry') : ok((K.x - T.x) * forward / shank),
    trunkLean: H.y - S.y <= 0 ? bad('degenerate-geometry') : ok(Math.atan2((S.x - H.x) * forward, H.y - S.y) * DEG),
    tibiaLean: A.y - K.y <= 0 ? bad('degenerate-geometry') : ok(Math.atan2((K.x - A.x) * forward, A.y - K.y) * DEG),
    // Image y grows downward: hip y > knee y means the hip is lower. Does not need the forward direction.
    hipDepth: shank < 1e-6 ? bad('degenerate-geometry') : ok((H.y - K.y) / shank),
  };
}

/**
 * Side-view baseline (handout p.5 lateral landmarks: lateral malleolus; p.12 Fig 9.4 plumb line).
 * MediaPipe's ankle point (27/28) stands in for the lateral malleolus. Distances are in shank
 * lengths (knee→ankle) because a side view has no hip width. Provisional, PT review pending.
 */
export const SIDE_PLUMB_POLICY = {
  version: 'side-ankle-plumb-v1',
  baselineDefinition: 'near-ankle-image-vertical-v1',
  offsetDefinition: 'offset-from-side-baseline-shank-length-v1',
} as const;

/** Near-side ear, shoulder, hip, knee, ankle, heel, toe indices. */
export const SIDE_PLUMB_INDICES = {
  left: { ear: 7, shoulder: 11, hip: 23, knee: 25, ankle: 27, heel: 29, toe: 31 },
  right: { ear: 8, shoulder: 12, hip: 24, knee: 26, ankle: 28, heel: 30, toe: 32 },
} as const;

/** Near-side ankle (≈ lateral malleolus), shank length and forward direction (+1 = toes toward +x), or why not. */
export function sideAnchor(landmarks: readonly Landmark[], width: number, height: number, side: 'left' | 'right'): { ankle: Point; shank: number; forward: number } | InvalidReason {
  const i = SIDE_PLUMB_INDICES[side];
  const p = sourcePoints(landmarks, [i.knee, i.ankle, i.heel, i.toe], width, height);
  if (typeof p === 'string') return p;
  const [K, A, E, T] = p as [Point, Point, Point, Point];
  const shank = Math.hypot(K.x - A.x, K.y - A.y);
  const forward = Math.sign(T.x - E.x);
  if (!(shank > 1e-6) || forward === 0) return 'degenerate-geometry';
  return { ankle: A, shank, forward };
}

export interface SidePlumb {
  /** Horizontal distance from the side baseline in shank lengths; + = in front of the line (toward the toes). */
  ear: ScalarValue;
  shoulder: ScalarValue;
  hip: ScalarValue;
}

/** Ungated ear/shoulder/hip offsets from the locked side baseline (`baselineX`, source px). */
export function measureSidePlumb(landmarks: readonly Landmark[], width: number, height: number, side: 'left' | 'right', baselineX: number | null): SidePlumb {
  const a = sideAnchor(landmarks, width, height, side);
  if (typeof a === 'string') { const no = bad(a); return { ear: no, shoulder: no, hip: no }; }
  if (baselineX === null || !Number.isFinite(baselineX)) { const no = bad('baseline-pending'); return { ear: no, shoulder: no, hip: no }; }
  const i = SIDE_PLUMB_INDICES[side];
  const at = (idx: number): ScalarValue => {
    const q = sourcePoints(landmarks, [idx], width, height);
    return typeof q === 'string' ? bad(q) : ok((q[0]!.x - baselineX) * a.forward / a.shank);
  };
  return { ear: at(i.ear), shoulder: at(i.shoulder), hip: at(i.hip) };
}

