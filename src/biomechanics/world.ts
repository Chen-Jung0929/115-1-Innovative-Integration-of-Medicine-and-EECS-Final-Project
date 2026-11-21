import type { Landmark } from '../domain/analysis';
import type { AnatomicalSide } from '../domain/measurement';
import { flexion3D } from './lift3d';

/**
 * Raw 3D joint angles straight from MediaPipe world landmarks (ADR-068). Since ADR-071 the app shows the
 * hybrid lifted skeleton instead (src/biomechanics/lift3d.ts); this stays as the baseline it is compared with.
 *
 * Validation (OpenCap LabValidation subject2 squats1, 5 synchronised cameras at 0–75°): reads quiet
 * standing as ~11–21° of knee flexion and whole-clip knee error 8–16°; see docs/updates/iteration-17.
 */
export const WORLD_ANGLE_DEFINITION = 'world-landmark-3d-flexion-v1';
/** 180° − 3D interior angle (0 = straight), or null when any world point is missing or degenerate. */
export function worldFlexion(landmarks: readonly Landmark[], joint: 'knee' | 'hip', side: AnatomicalSide): number | null {
  return flexion3D(landmarks.map(p => p?.world), joint, side);
}
