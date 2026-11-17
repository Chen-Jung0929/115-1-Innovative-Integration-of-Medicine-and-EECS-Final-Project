import type { AngleValue, AnatomicalSide, InvalidReason, PostureSet, ScalarValue } from '../domain/measurement';
import type { Landmark } from '../domain/analysis';
import { geometricAngle, sourcePoints, type Point } from './knee';

/**
 * Provisional squat posture metrics. All values are 2D image-plane geometry on aspect-corrected
 * source pixels, NOT validated clinical angles. Definitions and any thresholds require PT review.
 */
export const POSTURE_POLICY = {
  version: 'squat-posture-image-v1',
  hipDefinition: 'hip-image-interior-v1',
  hipProxyDefinition: 'hip-flexion-proxy-180-minus-interior-v1',
  trunkLeanDefinition: 'trunk-lean-image-vertical-v1',
  kneeWidthRatioDefinition: 'knee-ankle-width-ratio-image-v1',
  /** Shoulder-midpoint to hip-midpoint length below this is treated as degenerate. */
  minTorsoPx: 8,
  /** Ankle separation below this makes the ratio unstable (side view / feet together). */
  minAnkleWidthPx: 8,
} as const;

/** MediaPipe shoulder / hip / knee for each anatomical side. */
export const HIP_INDICES = { left: [11, 23, 25], right: [12, 24, 26] } as const;
/** Left shoulder, right shoulder, left hip, right hip. */
export const TRUNK_INDICES = [11, 12, 23, 24] as const;
/** Left knee, right knee, left ankle, right ankle. */
export const KNEE_WIDTH_INDICES = [25, 26, 27, 28] as const;

const invalidAngle = (reason: InvalidReason): AngleValue => ({ valid: false, rawAngleDeg: null, invalidReasons: [reason] });
const invalidScalar = (reason: InvalidReason): ScalarValue => ({ valid: false, value: null, invalidReasons: [reason] });
const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** Shoulder–hip–knee interior angle at the hip (0–180°). 180° ≈ trunk and thigh in one line. */
export function hipAngle(landmarks: readonly Landmark[], side: AnatomicalSide, width: number, height: number): AngleValue {
  const p = sourcePoints(landmarks, HIP_INDICES[side], width, height);
  if (typeof p === 'string') return invalidAngle(p);
  return geometricAngle(p[0]!, p[1]!, p[2]!);
}

/** Hip flexion proxy = 180° − interior angle; null when invalid. Not a confirmed clinical flexion angle. */
export function hipFlexionProxy(angle: AngleValue): number | null {
  return angle.valid ? 180 - angle.rawAngleDeg : null;
}

/**
 * Trunk (upper body) forward lean: angle between hip-midpoint→shoulder-midpoint and image "up".
 * 0° = upright in the image, 90° = horizontal. Unsigned. Assumes the camera is not rolled;
 * image vertical is not gravity unless the camera is level.
 */
export function trunkLean(landmarks: readonly Landmark[], width: number, height: number): AngleValue {
  const p = sourcePoints(landmarks, TRUNK_INDICES, width, height);
  if (typeof p === 'string') return invalidAngle(p);
  const shoulder = mid(p[0]!, p[1]!), hip = mid(p[2]!, p[3]!);
  const length = Math.hypot(shoulder.x - hip.x, shoulder.y - hip.y);
  if (!Number.isFinite(length)) return invalidAngle('non-finite');
  if (length < POSTURE_POLICY.minTorsoPx) return invalidAngle('degenerate-geometry');
  // Up in image pixels is −y.
  return geometricAngle(shoulder, hip, { x: hip.x, y: hip.y - length });
}

/**
 * Knee width ÷ ankle width (distance between knees over distance between ankles).
 * 1 = knees as wide as ankles; below 1 = knees closer together (dynamic knee valgus pattern).
 * Meaningful only from a frontal view.
 */
export function kneeWidthRatio(landmarks: readonly Landmark[], width: number, height: number): ScalarValue {
  const p = sourcePoints(landmarks, KNEE_WIDTH_INDICES, width, height);
  if (typeof p === 'string') return invalidScalar(p);
  const knees = Math.hypot(p[0]!.x - p[1]!.x, p[0]!.y - p[1]!.y);
  const ankles = Math.hypot(p[2]!.x - p[3]!.x, p[2]!.y - p[3]!.y);
  if (![knees, ankles].every(Number.isFinite)) return invalidScalar('non-finite');
  if (ankles < POSTURE_POLICY.minAnkleWidthPx) return invalidScalar('degenerate-geometry');
  const ratio = knees / ankles;
  return Number.isFinite(ratio) ? { valid: true, value: ratio, invalidReasons: [] } : invalidScalar('non-finite');
}

/** Ungated posture measurements for one pose. Video and camera must both call this. */
export function measurePosture(landmarks: readonly Landmark[], width: number, height: number): PostureSet {
  return {
    hip: { left: hipAngle(landmarks, 'left', width, height), right: hipAngle(landmarks, 'right', width, height) },
    trunkLean: trunkLean(landmarks, width, height),
    kneeWidthRatio: kneeWidthRatio(landmarks, width, height),
  };
}
