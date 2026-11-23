import type { AngleValue, AnatomicalSide, InvalidReason } from '../domain/measurement';
import type { Landmark } from '../domain/analysis';
export interface Point { x: number; y: number }
const invalid = (reason: InvalidReason): AngleValue => ({ valid: false, rawAngleDeg: null, invalidReasons: [reason] });
export const KNEE_INDICES = { left: [23, 25, 27], right: [24, 26, 28] } as const;

export function geometricAngle(a: Point, b: Point, c: Point): AngleValue {
  if (![a.x, a.y, b.x, b.y, c.x, c.y].every(Number.isFinite)) return invalid('non-finite');
  const ux = a.x - b.x, uy = a.y - b.y, vx = c.x - b.x, vy = c.y - b.y;
  const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
  if (![ux, uy, vx, vy, lu, lv].every(Number.isFinite)) return invalid('non-finite');
  if (lu < 1e-6 || lv < 1e-6) return invalid('degenerate-geometry');
  const cosine = (ux / lu) * (vx / lv) + (uy / lu) * (vy / lv);
  return { valid: true, rawAngleDeg: Math.acos(Math.max(-1, Math.min(1, cosine))) * 180 / Math.PI, invalidReasons: [] };
}

export function kneeAngle(landmarks: readonly Landmark[], side: AnatomicalSide, width: number, height: number): AngleValue {
  if (![width, height].every(v => Number.isFinite(v) && v > 0)) return invalid('non-finite');
  const points: Point[] = [];
  for (const index of KNEE_INDICES[side]) {
    const p = landmarks[index];
    if (!p) return invalid('missing-landmark');
    if (![p.x, p.y, p.visibility, p.presence ?? 1].every(Number.isFinite)) return invalid('non-finite');
    if (p.visibility < 0 || p.visibility > 1 || (p.presence !== undefined && (p.presence < 0 || p.presence > 1))) return invalid('out-of-range-confidence');
    if (p.visibility < 0.5 || (p.presence !== undefined && p.presence < 0.5)) return invalid('low-confidence');
    if (p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) return invalid('out-of-frame');
    points.push({ x: p.x * width, y: p.y * height });
  }
  return geometricAngle(points[0]!, points[1]!, points[2]!);
}

export function flexionProxy(angle: AngleValue): number | null {
  return angle.valid ? 180 - angle.rawAngleDeg : null;
}
