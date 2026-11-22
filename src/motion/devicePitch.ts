import type { CameraPitch } from '../domain/analysis';

/** Allowed range for a camera pitch (°): readings outside it are ignored, typed values are clamped. */
export const PITCH_RANGE = { min: -30, max: 60 } as const;
/** Manual input range offered for uploaded videos (°). */
export const MANUAL_PITCH_RANGE = { min: 0, max: 30 } as const;

/**
 * Camera pitch (°, + = lens tilted down) from DeviceOrientationEvent beta/gamma (W3C: device frame
 * rotated by Rx(beta)·Ry(gamma) from flat). Gravity in device coordinates ∝ (cosβ·sinγ, −sinβ, −cosβ·cosγ);
 * the rear lens looks along −z, so its downward tilt is asin(cosβ·cosγ); the front lens looks along +z.
 * Phone upright (beta 90°) = 0°; top leaned back (beta 80°) = rear camera 10° down. Null for bad input.
 */
export function pitchFromOrientation(betaDeg: number | null | undefined, gammaDeg: number | null | undefined, facing: 'user' | 'environment'): number | null {
  if (!Number.isFinite(betaDeg) || !Number.isFinite(gammaDeg)) return null;
  const r = Math.PI / 180, down = Math.asin(Math.max(-1, Math.min(1, Math.cos(betaDeg! * r) * Math.cos(gammaDeg! * r)))) / r;
  const pitch = facing === 'environment' ? down : -down;
  return pitch >= PITCH_RANGE.min && pitch <= PITCH_RANGE.max ? pitch : null;
}

/** Collects pitch readings for one live segment; summary = median (robust to the moment the phone is touched). */
export function createPitchRecorder() {
  let readings: number[] = [];
  return {
    add(pitch: number | null) { if (pitch !== null && Number.isFinite(pitch)) readings.push(pitch); },
    reset() { readings = []; },
    get count() { return readings.length; },
    summary(): CameraPitch | null {
      if (!readings.length) return null;
      const s = [...readings].sort((a, b) => a - b), m = s.length >> 1;
      return { deg: s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2, source: 'device-orientation', readings: s.length };
    },
  };
}

/** Typed-in pitch for an uploaded video: null when empty or not a number, otherwise clamped to 0–30°. */
export function manualPitch(text: string): CameraPitch | null {
  if (!text.trim()) return null;
  const v = Number(text);
  if (!Number.isFinite(v)) return null;
  return { deg: Math.max(MANUAL_PITCH_RANGE.min, Math.min(MANUAL_PITCH_RANGE.max, v)), source: 'manual' };
}

/** iOS 13+ needs a user gesture (and https) before orientation events arrive; elsewhere they just work. */
export async function requestOrientationPermission(): Promise<'granted' | 'denied' | 'unsupported'> {
  if (typeof window === 'undefined' || typeof DeviceOrientationEvent === 'undefined') return 'unsupported';
  const ask = (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<'granted' | 'denied'> }).requestPermission;
  if (typeof ask !== 'function') return 'granted';
  try { return await ask.call(DeviceOrientationEvent); } catch { return 'denied'; }
}

/** Plain-language label: 「鏡頭俯角 12°（手機感測器）」. */
export function pitchLabel(p: CameraPitch | null | undefined): string | null {
  if (!p) return null;
  return `鏡頭俯角 ${p.deg.toFixed(0)}°（${p.source === 'device-orientation' ? '手機感測器' : '手動輸入'}）`;
}
