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
