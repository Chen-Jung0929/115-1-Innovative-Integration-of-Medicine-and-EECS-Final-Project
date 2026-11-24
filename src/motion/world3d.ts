import type { Sample } from '../domain/analysis';
import { liftClip, flexion3D, type LiftContext, type Vec3 } from '../biomechanics/lift3d';

/** Hybrid 3D poses for a whole analysed clip, by sampleIndex (ADR-071). Display + experimental angles only. */
export type SessionPoses = ReadonlyMap<number, Vec3[]>;
const sampleTime = (s: Sample) => s.decode.timeBasis === 'presentation' ? s.sourceTimeMs : s.requestedTimeMs;
/** Only frames that passed subject QC (and were not reviewed as the wrong person) feed the lift. */
const trusted = (s: Sample) => s.tracking.accepted && (!s.review || s.review.label === 'correct-target');

export interface SessionLift { poses: SessionPoses; context: LiftContext | null }
/** cameraPitchDeg (+ = lens tilted down), when known from the phone sensor or typed in, stands the skeleton upright (ADR-080). */
export function liftSession(samples: readonly Sample[], width: number, height: number, cameraPitchDeg?: number | null): SessionLift {
  const pitch = cameraPitchDeg !== null && cameraPitchDeg !== undefined && Number.isFinite(cameraPitchDeg) ? { cameraPitchDeg } : {};
  const { poses, context } = liftClip(samples.map(s => ({ timeMs: sampleTime(s), landmarks: trusted(s) ? s.landmarks : null })), width, height, pitch);
  const out = new Map<number, Vec3[]>();
  samples.forEach((s, i) => { const p = poses[i]; if (p) out.set(s.sampleIndex, p); });
  return { poses: out, context };
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
 * Display only (ground-pin-display-v1, ADR-090): the same pose moved so its lowest heel/toe/ankle stands
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
