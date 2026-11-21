import type { Landmark } from '../domain/analysis';
import type { AnatomicalSide } from '../domain/measurement';

/**
 * Experimental 3D joint angles from MediaPipe world landmarks (ADR-068). The 2D image angles stay the
 * primary, exported measurement; these are shown next to them for comparison only.
 *
 * Validation 2026-11-22 (OpenCap LabValidation subject2 squats1, 5 synchronised cameras at 0–75°,
 * plus OpenCap 2-camera squats): squat-bottom knee flexion error 2D 2–82° depending on camera angle
 * (only near-side views are close), 3D 0–19° at every angle. 3D reads quiet standing as ~8–29° of
 * knee flexion and underestimates trunk–thigh (hip) flexion at the bottom by ~16–35°. One subject.
 */
export const WORLD_ANGLE_DEFINITION = 'world-landmark-3d-flexion-v1';
const JOINTS = {
  knee: { left: [23, 25, 27], right: [24, 26, 28] },
  hip: { left: [11, 23, 25], right: [12, 24, 26] },
} as const;

/** 180° − 3D interior angle (0 = straight), or null when any world point is missing or degenerate. */
export function worldFlexion(landmarks: readonly Landmark[], joint: keyof typeof JOINTS, side: AnatomicalSide): number | null {
  const [a, b, c] = JOINTS[joint][side].map(i => landmarks[i]?.world);
  if (!a || !b || !c || ![...a, ...b, ...c].every(Number.isFinite)) return null;
  const u = a.map((v, i) => v - b[i]!), w = c.map((v, i) => v - b[i]!);
  const nu = Math.hypot(...u), nw = Math.hypot(...w);
  if (nu < 1e-6 || nw < 1e-6) return null;
  const cos = u.reduce((s, v, i) => s + v * w[i]!, 0) / (nu * nw);
  return 180 - Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;
}
