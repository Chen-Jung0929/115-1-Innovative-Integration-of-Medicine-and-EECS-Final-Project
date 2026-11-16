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
/** Display only: hold the last actually used crop between analyzed frames, never interpolate angles. */
export function displayedRoi(samples:readonly Sample[],timeMs:number) {
  for(let i=samples.length-1;i>=0;i--){const s=samples[i]!;const t=s.decode.timeBasis==='presentation'?s.sourceTimeMs:s.requestedTimeMs;if(t<=timeMs+.001)return s.roi;}
  return undefined;
}
