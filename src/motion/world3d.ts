import type { Sample } from '../domain/analysis';
import { liftClip, flexion3D, type Vec3 } from '../biomechanics/lift3d';

/** Hybrid 3D poses for a whole analysed clip, by sampleIndex (ADR-071). Display + experimental angles only. */
export type SessionPoses = ReadonlyMap<number, Vec3[]>;
const sampleTime = (s: Sample) => s.decode.timeBasis === 'presentation' ? s.sourceTimeMs : s.requestedTimeMs;
/** Only frames that passed subject QC (and were not reviewed as the wrong person) feed the lift. */
const trusted = (s: Sample) => s.tracking.accepted && (!s.review || s.review.label === 'correct-target');

export function liftSession(samples: readonly Sample[], width: number, height: number): SessionPoses {
  const { poses } = liftClip(samples.map(s => ({ timeMs: sampleTime(s), landmarks: trusted(s) ? s.landmarks : null })), width, height);
  const out = new Map<number, Vec3[]>();
  samples.forEach((s, i) => { const p = poses[i]; if (p) out.set(s.sampleIndex, p); });
  return out;
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
