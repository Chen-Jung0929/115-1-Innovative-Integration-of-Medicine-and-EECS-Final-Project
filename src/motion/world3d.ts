import type { Sample } from '../domain/analysis';
import { liftClip, flexion3D, rotationToUp, type LiftContext, type Vec3 } from '../biomechanics/lift3d';

/** Hybrid 3D poses for a whole analysed clip, by sampleIndex (ADR-071). Display + experimental angles only. */
export type SessionPoses = ReadonlyMap<number, Vec3[]>;
const sampleTime = (s: Sample) => s.decode.timeBasis === 'presentation' ? s.sourceTimeMs : s.requestedTimeMs;
/** Only frames that passed subject QC (and were not reviewed as the wrong person) feed the lift. */
const trusted = (s: Sample) => s.tracking.accepted && (!s.review || s.review.label === 'correct-target');

export interface SessionLift {
  /** context (gravity, floorY, origin) stays in the lift's own frame; poses are additionally turned by uprightDeg. */
  poses: SessionPoses; context: LiftContext | null;
  /** Degrees the whole clip was turned to stand upright from its standing frames (ADR-094), or null when not applied. */
  uprightDeg: number | null;
}
const mid = (P: readonly Vec3[], a: number, b: number): Vec3 => [(P[a]![0] + P[b]![0]) / 2, (P[a]![1] + P[b]![1]) / 2, (P[a]![2] + P[b]![2]) / 2];
/** Most extended frames: ankle-to-shoulder length ≥ this share of the clip's 95th percentile. */
const UPRIGHT_NEAR_MAX = 0.97;
/** Larger tilts are not trusted as a camera/gravity error (自訂). */
const UPRIGHT_MAX_DEG = 28; // dataset clips needed ≤ 22.4°
/**
 * Standing-frame upright (upright-from-standing-v1, ADR-094, 自訂). Without the phone's tilt the lifted
 * skeleton keeps the camera's view of "up": on the dataset squat clips a still-standing person leans
 * 15–22° (all camera angles), which reads as a forward lean. In the clip's most extended frames the line
 * from the ankle midpoint to the shoulder midpoint is taken as vertical, and the whole clip is turned by
 * that one rotation. A rigid rotation: every 3D angle is unchanged. Needs ≥ 3 such frames; tilts > 28° are
 * not treated as a camera error. A person who really stoops when standing is shown upright (the UI says so).
 */
export function uprightRotation(poses: readonly Vec3[][]): { rotation: number[]; deg: number } | null {
  const len = (P: readonly Vec3[]) => { const a = mid(P, 27, 28), s = mid(P, 11, 12); return Math.hypot(s[0] - a[0], s[1] - a[1], s[2] - a[2]); };
  const lens = poses.map(len).filter(Number.isFinite).sort((x, y) => x - y);
  if (lens.length < 3) return null;
  const top = lens[Math.min(lens.length - 1, Math.floor(lens.length * 0.95))]!;
  const dirs = poses.filter(P => len(P) >= UPRIGHT_NEAR_MAX * top).map(P => { const a = mid(P, 27, 28), s = mid(P, 11, 12), l = len(P); return [(s[0] - a[0]) / l, (s[1] - a[1]) / l, (s[2] - a[2]) / l]; });
  if (dirs.length < 3) return null;
  const med = (k: number) => { const v = dirs.map(d => d[k]!).sort((x, y) => x - y), h = v.length >> 1; return v.length % 2 ? v[h]! : (v[h - 1]! + v[h]!) / 2; };
  const x = med(0), z = med(2), y = -Math.sqrt(Math.max(0, 1 - x * x - z * z));
  const deg = Math.acos(Math.min(1, -y)) * 180 / Math.PI;
  if (!(deg <= UPRIGHT_MAX_DEG)) return null;
  return { rotation: rotationToUp([x, y, z]), deg };
}
const rotate = (m: number[], p: Vec3): Vec3 => [m[0]! * p[0] + m[1]! * p[1] + m[2]! * p[2], m[3]! * p[0] + m[4]! * p[1] + m[5]! * p[2], m[6]! * p[0] + m[7]! * p[1] + m[8]! * p[2]];
/** cameraPitchDeg (+ = lens tilted down), when known from the phone sensor or typed in, stands the skeleton upright (ADR-080). */
export function liftSession(samples: readonly Sample[], width: number, height: number, cameraPitchDeg?: number | null): SessionLift {
  const pitch = cameraPitchDeg !== null && cameraPitchDeg !== undefined && Number.isFinite(cameraPitchDeg) ? { cameraPitchDeg } : {};
  const { poses, context } = liftClip(samples.map(s => ({ timeMs: sampleTime(s), landmarks: trusted(s) ? s.landmarks : null })), width, height, pitch);
  // A known camera pitch already stood the skeleton upright (ADR-080); otherwise use the standing frames.
  const up = 'cameraPitchDeg' in pitch ? null : uprightRotation(poses.filter((p): p is Vec3[] => !!p));
  const out = new Map<number, Vec3[]>();
  samples.forEach((s, i) => { const p = poses[i]; if (p) out.set(s.sampleIndex, up ? p.map(q => rotate(up.rotation, q)) : p); });
  return { poses: out, context, uprightDeg: up ? up.deg : null };
}

/** Plain-language straight-leg calibration status for the 3D view (ADR-075). */
export function calibrationNote(context: LiftContext | null | undefined): string | null {
  if (!context) return null;
  const say = (side: 'left' | 'right') => {
    const l = context.legs[side], name = side === 'left' ? '左膝' : '右膝';
    if (l.status === 'applied' || l.status === 'capped') return `${name}已做站直校正（${l.correctionDeg.toFixed(0)}°${l.status === 'capped' ? '，已達上限' : ''}）`;
    return `${name}未校正（${l.status === 'bent-in-image' ? '站姿時影片上膝蓋看起來是彎的' : l.status === 'not-standing' ? '沒有偵測到可確認的站直畫面，鏡頭俯仰也可能讓系統判斷不出來' : '未啟用'}）`;
  };
  return `${say('left')}；${say('right')}。`;
}

const FEET = [27, 28, 29, 30, 31, 32];
const HEEL_TOE = [[29, 31], [30, 32]] as const;
/**
 * Display only (ground-pin-display-v1, ADR-093): the same pose moved so its lowest heel/toe/ankle stands
 * on the floor grid (y = 0) and the point between the ankles sits at the grid centre (x = z = 0).
 * The lift puts one floor height on the whole clip, but the feet's own height drifts by 10–60 cm
 * (scale changes, feet half out of frame) and the live foot lock can slide the body ~1 m in depth, so the
 * skeleton seemed to float or fly off the grid. Each foot is also drawn flat (heel and toe at the height
 * of the lower of the two): the model's heel–toe depth is noisy and often tips the foot 30–60° toes-down,
 * which looked like standing on tiptoe above the floor. Knee/hip angles never use heel or toe and the rest
 * is a pure translation, so every angle is unchanged; the pelvis still moves relative to the feet (a squat
 * still goes down and back). Jumps are not shown.
 */
export function groundForDisplay(pose: readonly Vec3[] | undefined): Vec3[] | undefined {
  if (!pose || pose.length < 33 || !FEET.every(i => pose[i]?.every(Number.isFinite))) return pose ? pose.map(p => [...p] as Vec3) : undefined;
  const flat = pose.map(p => [...p] as Vec3);
  for (const [h, t] of HEEL_TOE) { const y = Math.max(flat[h]![1], flat[t]![1]); flat[h]![1] = y; flat[t]![1] = y; } // y down: max = lower
  const floor = Math.max(...FEET.map(i => flat[i]![1]));
  const x = (flat[27]![0] + flat[28]![0]) / 2, z = (flat[27]![2] + flat[28]![2]) / 2;
  return flat.map(p => [p[0] - x, p[1] - floor, p[2] - z] as Vec3);
}

/** 3D flexion for one sample, or null when it has no lifted pose. */
export function sessionFlexion(poses: SessionPoses | null | undefined, sample: Sample | undefined, joint: 'knee' | 'hip', side: 'left' | 'right'): number | null {
  return sample && poses ? flexion3D(poses.get(sample.sampleIndex), joint, side) : null;
}

/**
 * Display only: the lifted pose at timeMs, moved smoothly between the two neighbouring analysed samples
 * (same rule as smoothedSample: both lifted and at most maxGapMs apart), otherwise the base sample's pose.
 */
export function poseAt(samples: readonly Sample[], poses: SessionPoses, timeMs: number, base: Sample | undefined, maxGapMs: number): Vec3[] | undefined {
  if (!base) return undefined;
  let prev: Sample | undefined, next: Sample | undefined;
  for (const s of samples) {
    if (!poses.has(s.sampleIndex)) continue;
    if (sampleTime(s) <= timeMs) { if (!prev || sampleTime(s) > sampleTime(prev)) prev = s; } else if (!next || sampleTime(s) < sampleTime(next)) next = s;
  }
  const own = poses.get(base.sampleIndex);
  if (!prev || !next || sampleTime(next) - sampleTime(prev) > maxGapMs) return own;
  const k = (timeMs - sampleTime(prev)) / (sampleTime(next) - sampleTime(prev));
  if (!(k > 0 && k < 1)) return own;
  const a = poses.get(prev.sampleIndex)!, b = poses.get(next.sampleIndex)!;
  return a.map((p, i) => p.map((v, j) => v + (b[i]![j]! - v) * k) as Vec3);
}
