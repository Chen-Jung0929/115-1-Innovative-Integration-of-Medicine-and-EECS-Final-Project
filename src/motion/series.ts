import type { Sample } from '../domain/analysis';
import type { AnatomicalSide } from '../domain/measurement';
export function sampleTimes(durationSeconds: number, hz: number): number[] {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || !Number.isFinite(hz) || hz <= 0) throw new Error('無效的影片長度或取樣率');
  return Array.from({ length: Math.ceil(durationSeconds * hz) }, (_, i) => i / hz);
}
export function coverage(samples: readonly Sample[], side: AnatomicalSide): number | null {
  return samples.length ? samples.filter(s => s[side].valid).length / samples.length : null;
}
/** Only use the exact decoded source frame; no interpolation / nearest-frame pose reuse. */
export function matchingSample(samples: readonly Sample[], timeMs: number): Sample | undefined {
  return samples.find(s => s.decode.timeBasis === 'presentation' && Math.abs(s.sourceTimeMs - timeMs) <= 1); // 1 ms timestamp tolerance
}
/** Display only, between 5 Hz samples (playing or paused): the closest analyzed frame within maxMs (either side). */
export function nearestSample(samples: readonly Sample[], timeMs: number, maxMs: number): Sample | undefined {
  let best: Sample | undefined, bestD = Infinity;
  for (const s of samples) {
    const d = Math.abs((s.decode.timeBasis === 'presentation' ? s.sourceTimeMs : s.requestedTimeMs) - timeMs);
    if (d < bestD) { best = s; bestD = d; }
  }
  return bestD <= maxMs ? best : undefined;
}
/**
 * Display only (skeleton / overlay lines, never angles or exports): move the landmarks smoothly
 * between the two analyzed samples around timeMs, so the drawing keeps up with the moving body
 * instead of jumping every 0.2 s. Only when both neighbours passed subject QC, have full landmark
 * sets and are at most maxGapMs apart; otherwise returns the base sample unchanged.
 */
export function smoothedSample(samples: readonly Sample[], timeMs: number, base: Sample | undefined, maxGapMs: number): Sample | undefined {
  if (!base) return base;
  const t = (s: Sample) => s.decode.timeBasis === 'presentation' ? s.sourceTimeMs : s.requestedTimeMs;
  let prev: Sample | undefined, next: Sample | undefined;
  for (const s of samples) { if (t(s) <= timeMs) { if (!prev || t(s) > t(prev)) prev = s; } else if (!next || t(s) < t(next)) next = s; }
  if (!prev || !next || t(next) - t(prev) > maxGapMs || !prev.tracking.accepted || !next.tracking.accepted) return base;
  if (prev.landmarks.length === 0 || prev.landmarks.length !== next.landmarks.length) return base;
  const k = (timeMs - t(prev)) / (t(next) - t(prev));
  if (!(k > 0 && k < 1)) return base;
  const landmarks = prev.landmarks.map((a, i) => { const b = next!.landmarks[i]!; const lerped = { ...a, x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, visibility: Math.min(a.visibility, b.visibility) };
    return a.world && b.world ? { ...lerped, world: a.world.map((v, j) => v + (b.world![j]! - v) * k) as [number, number, number] } : lerped; });
  return { ...base, landmarks };
}
/** Display only: hold the last actually used crop between analyzed frames, never interpolate angles. */
export function displayedRoi(samples:readonly Sample[],timeMs:number) {
  for(let i=samples.length-1;i>=0;i--){const s=samples[i]!;const t=s.decode.timeBasis==='presentation'?s.sourceTimeMs:s.requestedTimeMs;if(t<=timeMs+.001)return s.roi;}
  return undefined;
}
