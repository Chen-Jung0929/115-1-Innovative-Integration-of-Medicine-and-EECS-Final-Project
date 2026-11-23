import type { InvalidReason, ScalarValue } from '../domain/measurement';
import type { Landmark } from '../domain/analysis';
import { sourcePoint, sourcePoints, type Point } from './knee';
import { kneeToeOffset } from './posture';

/**
 * Frontal-view squat checks from the team's Movement analysis handout (p.5 landmarks and baseline,
 * p.7 head, p.8 shoulders, p.9 trunk, p.10 pelvis, p.11 knee). All values are 2D image-plane
 * geometry on aspect-corrected source pixels, NOT validated clinical measurements. Definitions
 * require PT review. Signed values are anatomical: + = toward the person's LEFT side, which does not
 * depend on whether the video is mirrored or the person faces the camera.
 */
export const FRONTAL_POLICY = {
  version: 'squat-frontal-image-v1',
  baselineDefinition: 'heel-midpoint-image-vertical-v1',
  headDefinition: 'head-offset-from-baseline-hip-width-v1',
  shoulderDefinition: 'shoulder-line-tilt-image-v1',
  trunkDefinition: 'trunk-side-lean-image-vertical-v1',
  shiftDefinition: 'pelvis-midpoint-offset-from-baseline-hip-width-v1',
  pelvisDefinition: 'hip-joint-line-tilt-image-v1',
  /** Hip separation below this means a side view or a collapsed pose. */
  minHipWidthPx: 8,
  /**
   * Shoulder width / torso length below this is treated as not a frontal view. Adults facing the
   * camera are roughly 0.7–0.9; about 40° of body rotation drops below 0.55. Provisional.
   */
  minFrontalShoulderRatio: 0.55,
} as const;

/** MediaPipe indices used to draw and measure the handout p.5 landmarks. */
export const FRONTAL_LANDMARKS = {
  nose: 0, leftEye: 2, rightEye: 5, leftEar: 7, rightEar: 8,
  leftShoulder: 11, rightShoulder: 12, leftHip: 23, rightHip: 24,
  leftKnee: 25, rightKnee: 26, leftHeel: 29, rightHeel: 30, leftToe: 31, rightToe: 32,
} as const;

export interface FrontalMetrics {
  /** Head (eye midpoint ≈ 眉心, else nose) offset from the baseline, in hip widths. p.7 */
  head: ScalarValue;
  /** Shoulder line tilt in degrees; + = left shoulder lower. p.8 (shoulder joint ≈ acromion) */
  shoulderTilt: ScalarValue;
  /** Hip-mid→shoulder-mid vs image vertical, degrees; + = leaning to the left. p.9 */
  trunkSide: ScalarValue;
  /** Pelvis midpoint offset from the baseline in hip widths (horizontal shift). p.9 */
  shift: ScalarValue;
  /** Hip-joint line tilt in degrees; + = left side lower. p.10 (hip joints ≈ ASIS line) */
  pelvisTilt: ScalarValue;
  /** Knee vs toe plumb line in hip widths; + = medial (inside). p.11, from posture.ts. */
  kneeToe: { left: ScalarValue; right: ScalarValue };
}

const DEG = 180 / Math.PI;
const ok = (value: number): ScalarValue => Number.isFinite(value) ? { valid: true, value, invalidReasons: [] } : bad('non-finite');
const bad = (reason: InvalidReason): ScalarValue => ({ valid: false, value: null, invalidReasons: [reason] });
const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** Midpoint of both heels in source pixels (handout p.5 baseline anchor), or the first invalid reason. */
export function heelMidpoint(landmarks: readonly Landmark[], width: number, height: number): Point | InvalidReason {
  const p = sourcePoints(landmarks, [FRONTAL_LANDMARKS.leftHeel, FRONTAL_LANDMARKS.rightHeel], width, height);
  return typeof p === 'string' ? p : mid(p[0]!, p[1]!);
}

/** Head reference point: eye midpoint (≈ 眉心) when both eyes are reliable, otherwise the nose. */
export function headPoint(landmarks: readonly Landmark[], width: number, height: number): Point | InvalidReason {
  const eyes = sourcePoints(landmarks, [FRONTAL_LANDMARKS.leftEye, FRONTAL_LANDMARKS.rightEye], width, height);
  if (typeof eyes !== 'string') return mid(eyes[0]!, eyes[1]!);
  return sourcePoint(landmarks, FRONTAL_LANDMARKS.nose, width, height);
}

/** Torso frame shared by every frontal check, or why the pose is not a usable frontal view. */
export function frontalFrame(landmarks: readonly Landmark[], width: number, height: number) {
  const p = sourcePoints(landmarks, [11, 12, 23, 24], width, height);
  if (typeof p === 'string') return p;
  const [ls, rs, lh, rh] = p as [Point, Point, Point, Point];
  const hipWidth = Math.hypot(lh.x - rh.x, lh.y - rh.y);
  if (!Number.isFinite(hipWidth)) return 'non-finite' as const;
  if (Math.abs(lh.x - rh.x) < FRONTAL_POLICY.minHipWidthPx) return 'degenerate-geometry' as const;
  const shoulderMid = mid(ls, rs), hipMid = mid(lh, rh);
  const torso = Math.hypot(shoulderMid.x - hipMid.x, shoulderMid.y - hipMid.y);
  if (torso < 1e-6) return 'degenerate-geometry' as const;
  if (Math.abs(ls.x - rs.x) / torso < FRONTAL_POLICY.minFrontalShoulderRatio) return 'unsupported-view' as const;
  /** +1 when the person's left is toward +x on screen. */
  const leftDir = Math.sign(lh.x - rh.x);
  return { ls, rs, lh, rh, hipWidth, shoulderMid, hipMid, leftDir };
}

/** Signed tilt of the line left→right point; + = left point lower (image y grows downward). */
function tilt(left: Point, right: Point): number {
  return Math.atan2(left.y - right.y, Math.abs(left.x - right.x)) * DEG;
}

/**
 * Ungated frontal metrics for one pose. `baselineX` is the locked baseline in source pixels (see
 * motion/baseline.ts); head and shift are N/A while no baseline is locked. Video and camera must
 * both call this.
 */
export function measureFrontal(landmarks: readonly Landmark[], width: number, height: number, baselineX: number | null): FrontalMetrics {
  const kneeToe = { left: kneeToeOffset(landmarks, 'left', width, height), right: kneeToeOffset(landmarks, 'right', width, height) };
  const f = frontalFrame(landmarks, width, height);
  if (typeof f === 'string') {
    const no = bad(f);
    // An oblique/side view also invalidates the frontal knee check.
    return { head: no, shoulderTilt: no, trunkSide: no, shift: no, pelvisTilt: no, kneeToe: f === 'unsupported-view' ? { left: no, right: no } : kneeToe };
  }
  const fromBaseline = (x: number) => baselineX === null || !Number.isFinite(baselineX) ? bad('baseline-pending') : ok((x - baselineX) * f.leftDir / f.hipWidth);
  const head = headPoint(landmarks, width, height);
  const up = f.hipMid.y - f.shoulderMid.y;
  return {
    head: typeof head === 'string' ? bad(head) : fromBaseline(head.x),
    shoulderTilt: ok(tilt(f.ls, f.rs)),
    trunkSide: up <= 0 ? bad('degenerate-geometry') : ok(Math.atan2((f.shoulderMid.x - f.hipMid.x) * f.leftDir, up) * DEG),
    shift: fromBaseline(f.hipMid.x),
    pelvisTilt: ok(tilt(f.lh, f.rh)),
    kneeToe,
  };
}
