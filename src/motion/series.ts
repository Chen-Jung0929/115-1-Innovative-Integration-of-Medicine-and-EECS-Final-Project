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
/**
 * Display only, while the video is playing: keep showing the most recent analyzed frame
 * (never a future one, never interpolated) for at most holdMs, so the screen does not
 * flash "no result" between 5 Hz samples. Paused inspection still uses matchingSample.
 */
export function heldSample(samples: readonly Sample[], timeMs: number, holdMs: number): Sample | undefined {
  for (let i = samples.length - 1; i >= 0; i--) {
    const s = samples[i]!;
    const t = s.decode.timeBasis === 'presentation' ? s.sourceTimeMs : s.requestedTimeMs;
    if (t > timeMs + 1) continue;
    return timeMs - t <= holdMs ? s : undefined;
  }
  return undefined;
}
/** Display only, while paused between samples: the closest analyzed frame within maxMs (either side). */
export function nearestSample(samples: readonly Sample[], timeMs: number, maxMs: number): Sample | undefined {
  let best: Sample | undefined, bestD = Infinity;
  for (const s of samples) {
    const d = Math.abs((s.decode.timeBasis === 'presentation' ? s.sourceTimeMs : s.requestedTimeMs) - timeMs);
    if (d < bestD) { best = s; bestD = d; }
  }
  return bestD <= maxMs ? best : undefined;
}
/** Display only: hold the last actually used crop between analyzed frames, never interpolate angles. */
export function displayedRoi(samples:readonly Sample[],timeMs:number) {
  for(let i=samples.length-1;i>=0;i--){const s=samples[i]!;const t=s.decode.timeBasis==='presentation'?s.sourceTimeMs:s.requestedTimeMs;if(t<=timeMs+.001)return s.roi;}
  return undefined;
}
