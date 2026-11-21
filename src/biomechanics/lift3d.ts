import type { Landmark } from '../domain/analysis';
import type { AnatomicalSide } from '../domain/measurement';

/**
 * Hybrid 3D skeleton (ADR-071..074): MediaPipe world landmarks are good at depth order but put the
 * standing knee ~5 cm in front of the hip–ankle line (standing reads 10–25° of knee flexion), are
 * hip-centred (the pelvis never drops in a squat) and are not gravity-upright. The 2D image keypoints
 * are the most accurate thing we have in the image plane. This module combines them:
 *
 *   1. camera fit (自訂): one rotation + scale per clip that maps world landmarks onto the 2D keypoints
 *      (orthographic least squares), so world depth can be expressed in the camera frame;
 *   2. in-plane x/y from the 2D keypoints (÷ scale, so in metres), depth from the rotated world points;
 *   3. straight-leg depth calibration (自訂): in the clip's most extended frames the knee is assumed to sit
 *      on the hip–ankle line in depth; that depth offset is removed, fading out as the leg folds;
 *   4. foot lock (自訂): grounded feet keep their depth, which gives the pelvis its depth trajectory;
 *   5. gravity: the world model's "up" axis rotated into the camera; floor = median lowest-foot height,
 *      so the feet stand on y = 0;
 *   6. temporal smoothing of the inputs: zero-phase Gaussian (σ 0.1 s) for a whole clip, a causal
 *      one-euro filter for live.
 *
 * Output convention: metres (MediaPipe's own scale, ~15% small for a tall person), x = camera right,
 * y DOWN (floor at y = 0, body at negative y), z = away from the camera, gravity-upright.
 * Display / experimental angles only; the exported measurements stay 2D.
 */
export const LIFT3D_DEFINITION = 'hybrid-2d-world-lift-v1';
export type Vec3 = [number, number, number];
export interface LiftFrame { timeMs: number; landmarks: readonly Landmark[] | null | undefined }
export interface LiftContext {
  /** Image size in pixels (normalised landmark x/y are multiplied by these). */
  width: number; height: number;
  /** Rotation world → camera (row-major 3×3) and the clip's median pixels per metre (each frame has its own, LiftResult.scales). */
  rotation: number[]; pxPerM: number;
  /** Per side: in-plane hip–ankle length (m) when standing, and the standing knee depth offset (m). */
  legs: Record<AnatomicalSide, LegCalibration>;
  /** Rotation camera → gravity frame (row-major 3×3), where "up" came from, and the floor height (m, y down) after it. */
  gravity: number[]; upSource: 'floor' | 'world' | 'image' | 'average'; floorY: number;
  /** x/z of the origin (median mid-ankle) in the gravity frame. */
  originX: number; originZ: number;
}
/**
 * Straight-leg calibration outcome per side (ADR-075): 'applied' / 'capped' (offset limited to
 * MAX_CORRECTION_DEG) mean the knee depth was corrected; 'not-standing' (the leg never looked fully
 * extended), 'bent-in-image' (the 2D knee is visibly bent while "standing") and 'off' mean it was not.
 */
export type CalibrationStatus = 'applied' | 'capped' | 'not-standing' | 'bent-in-image' | 'off';
/** Per side, from the clip's most extended (standing) frames; lengths in m, 0 = unknown. */
export interface LegCalibration { standingExtension: number; kneeDepthOffset: number; status: CalibrationStatus; correctionDeg: number }
/** Largest standing knee-flexion change the calibration may make (自訂, safety cap). */
export const MAX_CORRECTION_DEG = 10;
/** "Standing" needs the image hip–ankle length ≥ this share of thigh + shank (pitch-corrected). */
const MIN_STANDING_EXTENSION = 0.95;
/** …and a 2D knee bend ≤ this. A bend seen in the image is never a depth artefact, but MediaPipe's 2D knee already reads ~20° in a standing side view (DEV), hence 25°. */
const MAX_IMAGE_BEND_DEG = 25;
export interface LiftOptions {
  /** Take x/y from the 2D keypoints (true) or keep the world landmarks' x/y (ablation). */
  imageXY?: boolean;
  /** Straight-leg knee depth calibration (ADR-072). */
  kneeCalibration?: boolean;
  /** Leg-extension ratio at which the calibration has faded to 0 (1 = standing). */
  fadeFrom?: number;
  /** Gaussian σ in seconds for whole-clip smoothing (0 = off). */
  smoothSeconds?: number;
  /** Gravity/floor alignment (false = camera frame, ablation). */
  gravity?: boolean;
  /** Which "up" cue to trust: the floor plane through the feet (default), the world model's up axis, the image vertical, or world/image average (ablation). */
  upCue?: 'floor' | 'world' | 'image' | 'average';
  /** Keep the stance foot fixed in depth (root depth trajectory, ADR-073). */
  footLock?: boolean;
  /**
   * Camera pitch in degrees (+ = looking down), when known from outside (e.g. the phone's motion sensor).
   * The world landmarks follow the camera, so without this a tilted phone tilts the whole skeleton (ADR-076).
   */
  cameraPitchDeg?: number;
}
export const LIFT_DEFAULTS: Required<LiftOptions> = { imageXY: true, kneeCalibration: true, fadeFrom: 0.75, smoothSeconds: 0.1, gravity: true, upCue: 'world', footLock: true, cameraPitchDeg: 0 };

/** Joints used for the camera fit, extension and floor (shoulders, hips, knees, ankles, heels, toes). */
const BODY = [11, 12, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32];
const FEET = [27, 28, 29, 30, 31, 32];
const LEG: Record<AnatomicalSide, readonly [number, number, number]> = { left: [23, 25, 27], right: [24, 26, 28] };
const SIDES: AnatomicalSide[] = ['left', 'right'];
const ANGLE_JOINTS = { knee: { left: [23, 25, 27], right: [24, 26, 28] }, hip: { left: [11, 23, 25], right: [12, 24, 26] } } as const;

// ---------- small vector helpers ----------
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: readonly number[], b: readonly number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const norm = (a: readonly number[]) => Math.hypot(a[0]!, a[1]!, a[2]!);
const cross = (a: readonly number[], b: readonly number[]): Vec3 => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
const mul = (m: readonly number[], v: readonly number[]): Vec3 => [m[0]! * v[0]! + m[1]! * v[1]! + m[2]! * v[2]!, m[3]! * v[0]! + m[4]! * v[1]! + m[5]! * v[2]!, m[6]! * v[0]! + m[7]! * v[1]! + m[8]! * v[2]!];
const transpose = (m: readonly number[]) => [m[0]!, m[3]!, m[6]!, m[1]!, m[4]!, m[7]!, m[2]!, m[5]!, m[8]!];
const median = (v: number[]) => { if (!v.length) return NaN; const s = [...v].sort((a, b) => a - b), h = s.length >> 1; return s.length % 2 ? s[h]! : (s[h - 1]! + s[h]!) / 2; };
const percentile = (v: number[], p: number) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.round(p / 100 * (s.length - 1))))]!; };
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const NO_LEG: LegCalibration = { standingExtension: 0, kneeDepthOffset: 0, status: 'off', correctionDeg: 0 };

/** 180° − interior angle (0 = straight) from any 33-point 3D skeleton, or null when degenerate. */
export function flexion3D(points: readonly (Vec3 | null | undefined)[] | undefined, joint: keyof typeof ANGLE_JOINTS, side: AnatomicalSide): number | null {
  if (!points) return null;
  const [a, b, c] = ANGLE_JOINTS[joint][side].map(i => points[i]);
  if (!a || !b || !c || ![...a, ...b, ...c].every(Number.isFinite)) return null;
  const u = sub(a, b), w = sub(c, b), nu = norm(u), nw = norm(w);
  if (nu < 1e-6 || nw < 1e-6) return null;
  return 180 - Math.acos(Math.max(-1, Math.min(1, dot(u, w) / (nu * nw)))) * 180 / Math.PI;
}

/** A frame is usable when all 33 points have finite 2D and world coordinates. */
export function usable(landmarks: readonly Landmark[] | null | undefined): landmarks is readonly Landmark[] {
  if (!landmarks || landmarks.length < 33 || !landmarks.every(p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && !!p.world && p.world.every(Number.isFinite))) return false;
  // A collapsed (zero-size) body in either space cannot be lifted.
  const spread = (f: (p: Landmark) => number) => { const v = BODY.map(i => f(landmarks[i]!)); return Math.max(...v) - Math.min(...v); };
  return spread(p => p.y) > 1e-3 && spread(p => p.world![1]) > 1e-3;
}

// ---------- camera fit: world → image, orthographic ----------
/**
 * Running sums for the least-squares map image ≈ M · world (M = 2×3), centred per frame. Each frame's
 * image points are first rescaled to the size of its world points, so a subject walking toward the
 * camera (growing in the image) does not distort the rotation; the per-frame scale is fitted separately.
 */
export interface CameraSums { aa: number[]; ab: number[]; n: number }
export const emptySums = (): CameraSums => ({ aa: Array(9).fill(0), ab: Array(6).fill(0), n: 0 });
function centred(lm: readonly Landmark[], width: number, height: number) {
  const w0 = [0, 0, 0], u0 = [0, 0], n = BODY.length;
  for (const i of BODY) { const p = lm[i]!; for (let k = 0; k < 3; k++) w0[k]! += p.world![k]! / n; u0[0]! += p.x * width / n; u0[1]! += p.y * height / n; }
  return BODY.map(i => { const p = lm[i]!; return { a: [p.world![0] - w0[0]!, p.world![1] - w0[1]!, p.world![2] - w0[2]!], b: [p.x * width - u0[0]!, p.y * height - u0[1]!] }; });
}
/** `pxPerM` = this frame's scale when known (second pass); otherwise a size ratio stands in for it. */
export function addCameraSums(s: CameraSums, lm: readonly Landmark[], width: number, height: number, pxPerM?: number): void {
  const pts = centred(lm, width, height);
  const ra = Math.sqrt(pts.reduce((t, { a }) => t + dot(a, a), 0)), rb = Math.sqrt(pts.reduce((t, { b }) => t + b[0]! ** 2 + b[1]! ** 2, 0));
  const k = pxPerM && pxPerM > 0 ? 1 / pxPerM : ra / rb;
  if (!(k > 0 && Number.isFinite(k))) return;
  for (const { a, b } of pts) {
    for (let r = 0; r < 3; r++) { for (let c = 0; c < 3; c++) s.aa[r * 3 + c]! += a[r]! * a[c]!; for (let c = 0; c < 2; c++) s.ab[r * 2 + c]! += a[r]! * b[c]! * k; }
  }
  s.n++;
}
/** Pixels per metre of one frame for a known rotation (least squares over the body joints). */
export function frameScale(lm: readonly Landmark[], width: number, height: number, rotation: number[]): number {
  let num = 0, den = 0;
  for (const { a, b } of centred(lm, width, height)) { const c = mul(rotation, a); num += c[0] * b[0]! + c[1] * b[1]!; den += c[0] ** 2 + c[1] ** 2; }
  return den > 0 && num > 0 ? num / den : NaN;
}
function solve3(m: number[], b: number[]): number[] | null {
  const [a, bb, c, d, e, f, g, h, i] = m as [number, number, number, number, number, number, number, number, number];
  const det = a * (e * i - f * h) - bb * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(det) < 1e-12) return null;
  const inv = [(e * i - f * h), -(bb * i - c * h), (bb * f - c * e), -(d * i - f * g), (a * i - c * g), -(a * f - c * d), (d * h - e * g), -(a * h - bb * g), (a * e - bb * d)].map(v => v / det);
  return mul(inv, b);
}
/** Rotation (world → camera) from the sums; null when underdetermined. */
export function solveCamera(s: CameraSums): { rotation: number[] } | null {
  if (s.n < 1) return null;
  const mx = solve3(s.aa, [s.ab[0]!, s.ab[2]!, s.ab[4]!]), my = solve3(s.aa, [s.ab[1]!, s.ab[3]!, s.ab[5]!]);
  if (!mx || !my) return null;
  const nx = norm(mx), ny = norm(my);
  if (!(nx > 0 && ny > 0)) return null;
  // Gram–Schmidt on the two image rows; third row = depth axis.
  const r1 = mx.map(v => v / nx), d = dot(r1, my), r2raw = my.map((v, k) => v - d * r1[k]!), n2 = norm(r2raw);
  if (!(n2 > 0)) return null;
  const r2 = r2raw.map(v => v / n2), r3 = cross(r1, r2);
  return { rotation: [...r1, ...r2, ...r3] };
}

// ---------- lifting one frame ----------
/** Camera-frame points (m): x/y from the image (or world), depth from the rotated world landmarks. */
function cameraPoints(lm: readonly Landmark[], width: number, height: number, rotation: number[], pxPerM: number, imageXY: boolean): Vec3[] {
  const hip = [0, 1, 2].map(k => (lm[23]!.world![k]! + lm[24]!.world![k]!) / 2);
  const hipU = (lm[23]!.x + lm[24]!.x) / 2 * width, hipV = (lm[23]!.y + lm[24]!.y) / 2 * height;
  return lm.slice(0, 33).map(p => {
    const c = mul(rotation, [p.world![0] - hip[0]!, p.world![1] - hip[1]!, p.world![2] - hip[2]!]);
    // Root translation always comes from the image (relative to the image centre), so the pelvis moves down in a squat.
    return imageXY ? [(p.x - 0.5) * width / pxPerM, (p.y - 0.5) * height / pxPerM, c[2]] : [(hipU - width / 2) / pxPerM + c[0], (hipV - height / 2) / pxPerM + c[1], c[2]];
  });
}
const inPlane = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1]);
/** Depth (z) of the knee relative to the hip–ankle chord at the knee's position along it. */
function kneeChordDepth(P: Vec3[], side: AnatomicalSide): number {
  const [h, k, a] = LEG[side].map(i => P[i]!) as [Vec3, Vec3, Vec3];
  const ha = sub(a, h), l2 = dot(ha, ha);
  const t = l2 > 1e-9 ? dot(sub(k, h), ha) / l2 : 0;
  return k[2] - (h[2] + t * ha[2]);
}
function applyKnee(P: Vec3[], ctx: LiftContext, fadeFrom: number): void {
  for (const side of SIDES) {
    const leg = ctx.legs[side], [h, k, a] = LEG[side];
    if (!(leg.standingExtension > 0) || !leg.kneeDepthOffset) continue;
    const e = inPlane(P[h]!, P[a]!) / leg.standingExtension;
    P[k]![2] -= leg.kneeDepthOffset * clamp01((e - fadeFrom) / (1 - fadeFrom));
  }
}
/** Minimal rotation taking unit vector `from` onto (0, −1, 0) (camera "up", y down). */
function rotationToUp(from: Vec3): number[] {
  const f = from.map(v => v / (norm(from) || 1)) as Vec3, to: Vec3 = [0, -1, 0];
  const v = cross(f, to), c = dot(f, to), s2 = dot(v, v);
  if (s2 < 1e-12) return c > 0 ? IDENTITY : [1, 0, 0, 0, -1, 0, 0, 0, -1];
  const k = (1 - c) / s2, [x, y, z] = v;
  return [1 - k * (y * y + z * z), -z + k * x * y, y + k * x * z, z + k * x * y, 1 - k * (x * x + z * z), -x + k * y * z, -y + k * x * z, x + k * y * z, 1 - k * (x * x + y * y)];
}
/** The world model's own up axis seen from the camera (trained on upright people; roughly camera-aligned, so it misses camera pitch). */
const worldUp = (rotation: number[]) => mul(rotation, [0, -1, 0]);
/** Height above the floor direction `up` (unit, camera frame). */
const heightAlong = (p: Vec3, up: Vec3) => dot(p, up);
const HEEL_TOE: Record<AnatomicalSide, number[]> = { left: [29, 31], right: [30, 32] };
/** Least-squares sums for the floor plane y = a·x + b·z + c (camera frame) through foot-contact points. */
export interface FloorSums { m: number[]; r: number[]; xs: number[]; zs: number[] }
export const emptyFloor = (): FloorSums => ({ m: Array(9).fill(0), r: [0, 0, 0], xs: [], zs: [] });
/** Adds the heels and toes of the feet that touch the ground in this frame (within 3 cm of the lowest). */
export function addFloorPoints(f: FloorSums, P: Vec3[], up: Vec3): void {
  const low = (side: AnatomicalSide) => Math.min(...HEEL_TOE[side].map(i => heightAlong(P[i]!, up)));
  const lowest = Math.min(low('left'), low('right'));
  for (const side of SIDES) {
    if (low(side) > lowest + 0.03) continue; // swing foot
    for (const i of HEEL_TOE[side]) {
      const [x, y, z] = P[i]!, v = [x, z, 1];
      for (let r = 0; r < 3; r++) { for (let c = 0; c < 3; c++) f.m[r * 3 + c]! += v[r]! * v[c]!; f.r[r]! += v[r]! * y; }
      f.xs.push(x); f.zs.push(z);
    }
  }
}
/**
 * Floor-plane up (自訂, ADR-076): image y of the heels and toes against their depth gives the camera
 * pitch (a flat foot pointing at the camera appears with its toe lower in the image when the camera looks
 * down), the left/right feet give the roll. Null when the contact points do not span ≥ 8 cm both ways
 * or the plane is > 35° from the world model's up (implausible).
 */
export function floorUp(f: FloorSums, fallback: Vec3): Vec3 | null {
  if (f.xs.length < 8) return null;
  const span = (v: number[]) => percentile(v, 90) - percentile(v, 10);
  if (span(f.xs) < 0.08 || span(f.zs) < 0.08) return null;
  const abc = solve3(f.m, f.r);
  if (!abc || !abc.every(Number.isFinite)) return null;
  const n = [abc[0]!, -1, abc[1]!], len = norm(n), up = n.map(v => v / len) as Vec3;
  return dot(up, fallback) / (norm(fallback) || 1) >= Math.cos(35 * Math.PI / 180) ? up : null;
}
/** Up vector for a cue, plus the floor estimate from camera-frame poses when the cue is 'floor'. */
/** Tilt an up vector seen by a level camera into the view of a camera pitched down by `deg`. */
const pitched = (up: Vec3, deg: number): Vec3 => { const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r); return [up[0], c * up[1] - s * up[2], s * up[1] + c * up[2]]; };
function chooseUp(cue: Required<LiftOptions>['upCue'], rotation: number[], camera: Vec3[][], pitchDeg = 0): { up: Vec3; source: LiftContext['upSource'] } {
  const w = pitched(worldUp(rotation), pitchDeg);
  if (cue === 'image') return { up: pitched([0, -1, 0], pitchDeg), source: 'image' };
  if (cue === 'average') return { up: [w[0], w[1] - 1, w[2]], source: 'average' };
  if (cue === 'world') return { up: w, source: 'world' };
  let up: Vec3 = w, found: Vec3 | null = null;
  for (let pass = 0; pass < 2; pass++) { // second pass re-selects contact feet with the better up
    const f = emptyFloor(); for (const P of camera) addFloorPoints(f, P, up);
    found = floorUp(f, w); if (!found) break; up = found;
  }
  return found ? { up: found, source: 'floor' } : { up: w, source: 'world' };
}

const toGravity = (P: Vec3[], ctx: LiftContext): Vec3[] => P.map(p => { const g = mul(ctx.gravity, p); return [g[0] - ctx.originX, g[1] - ctx.floorY, g[2] - ctx.originZ]; });
/**
 * Foot lock (自訂, ADR-073): the world landmarks are hip-centred, so on their own the pelvis never moves
 * in depth (in a frontal squat it really moves ~30 cm back). Feet on the ground do not slide, so each
 * frame the whole skeleton is shifted in camera depth to keep the grounded feet where they were. Image
 * x/y are untouched (they already carry the in-plane root motion), so the 2D reprojection is unchanged.
 * Returns a stateful per-frame function (same code for the whole clip and for live).
 */
export function footLock(margin = 0.05) {
  const FOOT: Record<AnatomicalSide, number[]> = { left: [27, 29, 31], right: [28, 30, 32] };
  const depth = (P: Vec3[], side: AnatomicalSide) => FOOT[side].reduce((s, i) => s + P[i]![2], 0) / 3;
  const low = (P: Vec3[], side: AnatomicalSide, gravity: number[]) => Math.max(...FOOT[side].map(i => mul(gravity, P[i]!)[1])); // y down
  // Each foot's weight = how close it is to the ground (1 = lowest, ~0 once lifted a few cm), so both
  // feet count in a squat and only the stance foot counts in mid-swing. The depth shift is integrated
  // from frame-to-frame foot motion; with both feet planted the sum telescopes, so there is no drift.
  let prev: { z: Record<AnatomicalSide, number>; w: Record<AnatomicalSide, number> } | null = null, offset = 0;
  return (P: Vec3[], gravity: number[]) => {
    const h = { left: low(P, 'left', gravity), right: low(P, 'right', gravity) }, lowest = Math.max(h.left, h.right);
    const w = { left: Math.exp(-(((lowest - h.left) / margin) ** 2)), right: Math.exp(-(((lowest - h.right) / margin) ** 2)) };
    const z = { left: depth(P, 'left'), right: depth(P, 'right') };
    if (prev) offset += SIDES.reduce((s, f) => s + prev!.w[f] * (prev!.z[f] - z[f]), 0) / (prev.w.left + prev.w.right);
    prev = { z, w };
    for (const p of P) p[2] += offset;
  };
}

/** Back-project a gravity-frame point to image pixels (weak perspective, that frame's scale); inverse of the x/y lift. */
export function projectToImage(p: Vec3, ctx: LiftContext, pxPerM: number): [number, number] {
  const c = mul(transpose(ctx.gravity), [p[0] + ctx.originX, p[1] + ctx.floorY, p[2] + ctx.originZ]);
  return [c[0] * pxPerM + ctx.width / 2, c[1] * pxPerM + ctx.height / 2];
}

// ---------- temporal smoothing ----------
type Track = { t: number; v: number[] }[];
/** Zero-phase Gaussian smoothing over time (σ in s), never across gaps longer than 4σ (min 0.5 s). */
function gaussianSmooth(track: Track, sigmaS: number): number[][] {
  if (!(sigmaS > 0)) return track.map(s => s.v);
  const gap = Math.max(0.5, 4 * sigmaS) * 1000, sig = sigmaS * 1000;
  return track.map((s, i) => {
    const acc = s.v.map(() => 0); let wsum = 0;
    for (let dir of [-1, 1]) for (let j = dir < 0 ? i : i + 1; j >= 0 && j < track.length; j += dir) {
      const prev = track[j - dir];
      if (j !== i && prev && Math.abs(track[j]!.t - prev.t) > gap) break;
      const dt = track[j]!.t - s.t; if (Math.abs(dt) > 3 * sig) break;
      const w = Math.exp(-0.5 * (dt / sig) ** 2); wsum += w;
      track[j]!.v.forEach((v, k) => { acc[k]! += w * v; });
    }
    return acc.map(v => v / wsum);
  });
}
const flat = (lm: readonly Landmark[]) => lm.slice(0, 33).flatMap(p => [p.x, p.y, ...p.world!]);
const unflat = (lm: readonly Landmark[], v: number[]): Landmark[] => lm.slice(0, 33).map((p, i) => ({ ...p, x: v[i * 5]!, y: v[i * 5 + 1]!, world: [v[i * 5 + 2]!, v[i * 5 + 3]!, v[i * 5 + 4]!] }));

// ---------- straight-leg calibration with safety checks (ADR-072, ADR-075) ----------
/** 2D knee bend (°) in the image: depth-free, so a bend here is real (or varus/valgus), never a depth artefact. */
function imageBend(P: Vec3[], side: AnatomicalSide): number {
  const [h, k, a] = LEG[side].map(i => P[i]!) as [Vec3, Vec3, Vec3];
  return flexion3D([...Array(33)].map((_, i) => i === LEG[side][0] ? [h[0], h[1], 0] : i === LEG[side][1] ? [k[0], k[1], 0] : i === LEG[side][2] ? [a[0], a[1], 0] : null), 'knee', side) ?? 0;
}
/** Thigh + shank length (m) from the world landmarks (robust median over the clip). */
const worldLeg = (lms: readonly Landmark[][], side: AnatomicalSide) => median(lms.map(lm => {
  const [h, k, a] = LEG[side].map(i => lm[i]!.world!) as [Vec3, Vec3, Vec3];
  return norm(sub(h, k)) + norm(sub(k, a));
}));
/** Flexion change (°) that removing `offset` from the knee depth makes on pose P. */
function correctionOf(P: Vec3[], side: AnatomicalSide, offset: number): number {
  const k = LEG[side][1], Q = P.map(p => [...p] as Vec3);
  Q[k]![2] -= offset;
  return (flexion3D(P, 'knee', side) ?? 0) - (flexion3D(Q, 'knee', side) ?? 0);
}
/** Scale the offset down so the standing correction stays ≤ MAX_CORRECTION_DEG (bisection). */
function capOffset(P: Vec3[], side: AnatomicalSide, offset: number): { offset: number; deg: number; capped: boolean } {
  const full = correctionOf(P, side, offset);
  if (full <= MAX_CORRECTION_DEG) return { offset, deg: full, capped: false };
  let lo = 0, hi = 1;
  for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (correctionOf(P, side, offset * mid) > MAX_CORRECTION_DEG) hi = mid; else lo = mid; }
  return { offset: offset * lo, deg: correctionOf(P, side, offset * lo), capped: true };
}
/**
 * Calibrate one leg on its most extended 10% of frames, only when two depth-free checks agree that it was
 * straight: (1) image hip–ankle length ≥ 95% of the world thigh + shank (divided by the cosine of the camera
 * pitch, since a vertical leg looks shorter from a tilted camera); (2) the 2D knee bend ≤ 15°. Then the
 * correction is capped at MAX_CORRECTION_DEG, so a real contracture hidden in depth keeps most of its angle.
 */
function legStats(P: Vec3[][], lms: readonly Landmark[][], side: AnatomicalSide, up: Vec3): LegCalibration {
  const [h, , a] = LEG[side];
  const ext = P.map(p => inPlane(p[h]!, p[a]!));
  const top = percentile(ext, 90), standingIdx = P.map((_, i) => i).filter(i => ext[i]! >= top);
  const standing = standingIdx.map(i => P[i]!);
  const standingExtension = median(standing.map(p => inPlane(p[h]!, p[a]!)));
  const cosPitch = Math.max(0.5, Math.hypot(up[0], up[1]) / (norm(up) || 1));
  const extension = standingExtension / (worldLeg(standingIdx.map(i => lms[i]! as Landmark[]), side) * cosPitch);
  const base = { ...NO_LEG, standingExtension };
  if (!(extension >= MIN_STANDING_EXTENSION)) return { ...base, status: 'not-standing' };
  if (median(standing.map(p => imageBend(p, side))) > MAX_IMAGE_BEND_DEG) return { ...base, status: 'bent-in-image' };
  const offsets = standing.map(p => kneeChordDepth(p, side)), offset = median(offsets);
  const rep = standing[offsets.indexOf([...offsets].sort((x, y) => Math.abs(x - offset) - Math.abs(y - offset))[0]!)]!;
  const c = capOffset(rep, side, offset);
  return { standingExtension, kneeDepthOffset: c.offset, status: c.capped ? 'capped' : 'applied', correctionDeg: Math.max(0, c.deg) };
}
function finishContext(ctx: LiftContext, camera: Vec3[][], gravityOn: boolean): LiftContext {
  if (!gravityOn || !camera.length) return ctx;
  const G = camera.map(P => P.map(p => mul(ctx.gravity, p)));
  const floorY = median(G.map(P => Math.max(...FEET.map(i => P[i]![1]))));
  const mid = G.map(P => [(P[27]![0] + P[28]![0]) / 2, (P[27]![2] + P[28]![2]) / 2]);
  return { ...ctx, floorY, originX: median(mid.map(m => m[0]!)), originZ: median(mid.map(m => m[1]!)) };
}

export interface LiftResult { poses: (Vec3[] | null)[]; context: LiftContext | null; scales: (number | null)[] }
const SCALE_SMOOTH_S = 0.5;
/**
 * Zero-phase smoothing of a scalar track by a Gaussian-weighted local line (σ in s), so a steady trend
 * (walking toward the camera) is not pulled toward the middle at the clip ends. Non-finite values are skipped.
 */
function smoothTrack(track: { t: number; v: number }[], sigmaS: number): number[] {
  const ok = track.filter(s => Number.isFinite(s.v)), sig = sigmaS * 1000;
  if (!ok.length) return track.map(() => NaN);
  return track.map(({ t }) => {
    let sw = 0, st = 0, sv = 0, stt = 0, stv = 0;
    for (const p of ok) { const d = p.t - t, w = Math.exp(-0.5 * (d / sig) ** 2); sw += w; st += w * d; sv += w * p.v; stt += w * d * d; stv += w * d * p.v; }
    const det = sw * stt - st * st;
    return det > 1e-9 * sw * sw * sig * sig ? (stt * sv - st * stv) / det : sv / sw; // intercept of the local line at t
  });
}
/**
 * Offline lift of a whole clip: smooth inputs (zero phase), fit the camera, calibrate the knees on the
 * clip's most extended frames, align with gravity. Returns one pose per input frame (null = unusable).
 */
export function liftClip(frames: readonly LiftFrame[], width: number, height: number, options: LiftOptions = {}): LiftResult {
  const o = { ...LIFT_DEFAULTS, ...options };
  const idx = frames.map((f, i) => usable(f.landmarks) ? i : -1).filter(i => i >= 0);
  if (idx.length < 1) return { poses: frames.map(() => null), context: null, scales: frames.map(() => null) };
  const raw = idx.map(i => frames[i]!.landmarks as readonly Landmark[]);
  const smooth = gaussianSmooth(idx.map((i, k) => ({ t: frames[i]!.timeMs, v: flat(raw[k]!) })), o.smoothSeconds).map((v, k) => unflat(raw[k]!, v));
  // Two passes: rotation from size-normalised frames, then per-frame scale, then the rotation again
  // with those scales. Scales are smoothed over ~0.5 s: they follow a subject walking toward the camera.
  let cam = { rotation: IDENTITY }, scales: number[] = [];
  for (let pass = 0; pass < 2; pass++) {
    const sums = emptySums();
    smooth.forEach((lm, k) => addCameraSums(sums, lm, width, height, scales[k]));
    cam = solveCamera(sums) ?? cam;
    scales = smoothTrack(smooth.map((lm, k) => ({ t: frames[idx[k]!]!.timeMs, v: frameScale(lm, width, height, cam.rotation) })), SCALE_SMOOTH_S);
  }
  const camera = smooth.map((lm, k) => cameraPoints(lm, width, height, cam.rotation, scales[k]!, o.imageXY));
  const { up, source } = chooseUp(o.upCue, cam.rotation, camera, o.cameraPitchDeg);
  let ctx: LiftContext = { width, height, ...cam, pxPerM: median(scales), legs: { left: NO_LEG, right: NO_LEG }, gravity: rotationToUp(up), upSource: source, floorY: 0, originX: 0, originZ: 0 };
  if (o.kneeCalibration) ctx = { ...ctx, legs: { left: legStats(camera, smooth, 'left', up), right: legStats(camera, smooth, 'right', up) } };
  camera.forEach(P => { if (o.kneeCalibration) applyKnee(P, ctx, o.fadeFrom); });
  if (o.footLock) { const lock = footLock(); camera.forEach(P => lock(P, ctx.gravity)); }
  ctx = finishContext(ctx, camera, o.gravity);
  const poses: (Vec3[] | null)[] = frames.map(() => null);
  const frameScales: (number | null)[] = frames.map(() => null);
  idx.forEach((i, k) => {
    const pose = o.gravity ? toGravity(camera[k]!, ctx) : camera[k]!;
    // Never hand a non-finite pose to the display or the angles: hide that frame instead.
    if (pose.every(p => p.every(Number.isFinite))) { poses[i] = pose; frameScales[i] = scales[k]!; }
  });
  return { poses, context: ctx, scales: frameScales };
}

// ---------- causal (live camera) ----------
/** One-euro filter on a vector (Casiez et al. 2012): little lag when moving, little jitter when still. */
function oneEuro(minCutoff = 5, beta = 1, dCutoff = 1) {
  let prev: number[] | null = null, dPrev: number[] | null = null, tPrev = 0;
  const alpha = (cut: number, dt: number) => 1 / (1 + 1 / (2 * Math.PI * cut * dt));
  return (t: number, v: number[]) => {
    if (!prev || t <= tPrev) { prev = v; dPrev = v.map(() => 0); tPrev = t; return v; }
    const dt = (t - tPrev) / 1000; tPrev = t;
    const ad = alpha(dCutoff, dt), d = v.map((x, k) => ad * ((x - prev![k]!) / dt) + (1 - ad) * dPrev![k]!);
    const out = v.map((x, k) => { const a = alpha(minCutoff + beta * Math.abs(d[k]!), dt); return a * x + (1 - a) * prev![k]!; });
    prev = out; dPrev = d; return out;
  };
}
/**
 * Causal per-frame lifter for live camera: the same steps, with every clip statistic replaced by a
 * running estimate (camera sums accumulate; floor plane sums accumulate; standing extension = slowly
 * decaying maximum; knee offset = running mean over frames that pass both straight-leg checks, capped
 * per frame; floor = running median of the last 50 frames; origin = first frame's mid-ankle). Before a
 * verified standing frame has been seen the knee is not corrected ('not-standing').
 */
export function createCausalLifter(width: number, height: number, options: LiftOptions = {}) {
  const o = { ...LIFT_DEFAULTS, ...options };
  const filter = oneEuro(), sums = emptySums(), floor = emptyFloor(), lock = footLock(), floors: number[] = [];
  const newLeg = () => ({ ext: 0, raw: 0, off: 0, deg: 0, capped: false, n: 0, len: 0, nl: 0 });
  const legs = { left: newLeg(), right: newLeg() };
  let last = -Infinity, origin: [number, number] | null = null, scale: number | null = null;
  let context: LiftContext | null = null;
  return {
    /** Context of the last lifted frame (calibration status per side, gravity source). */
    get context() { return context; },
    step(landmarks: readonly Landmark[] | null | undefined, timeMs: number): Vec3[] | null {
      if (!usable(landmarks) || !(timeMs > last)) return null;
      const dtS = Number.isFinite(last) ? (timeMs - last) / 1000 : 0; last = timeMs;
      const lm = o.smoothSeconds > 0 ? unflat(landmarks, filter(timeMs, flat(landmarks))) : landmarks;
      addCameraSums(sums, lm, width, height, scale ?? undefined);
      const cam = solveCamera(sums) ?? { rotation: IDENTITY };
      const s = frameScale(lm, width, height, cam.rotation);
      if (Number.isFinite(s)) scale = scale === null ? s : scale + (s - scale) * (1 - Math.exp(-dtS / SCALE_SMOOTH_S));
      const pxPerM = scale ?? height / 2;
      const P = cameraPoints(lm, width, height, cam.rotation, pxPerM, o.imageXY);
      // Up: floor plane once enough contact points spread out, otherwise the world model's up.
      const w = pitched(worldUp(cam.rotation), o.cameraPitchDeg);
      let up: Vec3 = o.upCue === 'image' ? pitched([0, -1, 0], o.cameraPitchDeg) : w, source: LiftContext['upSource'] = o.upCue === 'image' ? 'image' : 'world';
      if (o.upCue === 'floor') { addFloorPoints(floor, P, context?.upSource === 'floor' ? transposeUp(context.gravity) : w); const f = floorUp(floor, w); if (f) { up = f; source = 'floor'; } }
      const cosPitch = Math.max(0.5, Math.hypot(up[0], up[1]) / (norm(up) || 1));
      const legCal = {} as Record<AnatomicalSide, LegCalibration>;
      for (const side of SIDES) {
        const leg = legs[side], [h, k, a] = LEG[side], ext = inPlane(P[h]!, P[a]!);
        const wl = norm(sub(lm[h]!.world! as Vec3, lm[k]!.world! as Vec3)) + norm(sub(lm[k]!.world! as Vec3, lm[a]!.world! as Vec3));
        leg.nl++; leg.len += (wl - leg.len) / Math.min(leg.nl, 50);
        leg.ext = Math.max(ext, leg.ext * Math.exp(-dtS / 60)); // a glitch-long maximum fades over ~1 min
        const straight = ext >= 0.97 * leg.ext && ext / (leg.len * cosPitch) >= MIN_STANDING_EXTENSION && imageBend(P, side) <= MAX_IMAGE_BEND_DEG;
        if (straight) { // running mean of the raw offset, capped against this verified standing frame
          leg.n++; leg.raw += (kneeChordDepth(P, side) - leg.raw) / Math.min(leg.n, 20);
          const c = capOffset(P, side, leg.raw); leg.off = c.offset; leg.deg = Math.max(0, c.deg); leg.capped = c.capped;
        }
        legCal[side] = leg.n ? { standingExtension: leg.ext, kneeDepthOffset: leg.off, status: leg.capped ? 'capped' : 'applied', correctionDeg: leg.deg } : { ...NO_LEG, standingExtension: leg.ext, status: 'not-standing' };
      }
      const gravity = rotationToUp(up);
      context = { width, height, ...cam, pxPerM, legs: legCal, gravity, upSource: source, floorY: 0, originX: 0, originZ: 0 };
      if (o.kneeCalibration) applyKnee(P, context, o.fadeFrom);
      if (o.footLock) lock(P, gravity);
      if (!o.gravity) return P.every(p => p.every(Number.isFinite)) ? P : null;
      const G = P.map(p => mul(gravity, p));
      floors.push(Math.max(...FEET.map(i => G[i]![1]))); if (floors.length > 50) floors.shift();
      origin ??= [(G[27]![0] + G[28]![0]) / 2, (G[27]![2] + G[28]![2]) / 2];
      const floorY = median(floors), out = G.map(g => [g[0] - origin![0], g[1] - floorY, g[2] - origin![1]] as Vec3);
      return out.every(p => p.every(Number.isFinite)) ? out : null;
    },
  };
}
/** The camera-frame up vector a gravity rotation was built from (its inverse applied to (0, −1, 0)). */
const transposeUp = (g: number[]): Vec3 => mul(transpose(g), [0, -1, 0]);
