/** Live camera performance contract, stored with camera sessions only (JSON; CSV unchanged). */
export const LIVE_PERFORMANCE_VERSION = 'live-performance-v1';
export type LatencyBasis = 'capture-time' | 'presentation-callback';
export interface LivePerformance {
  version: string;
  userAgent: string;
  delegate: string;
  sourceWidthPx: number;
  sourceHeightPx: number;
  /** Model download/read + engine creation before this run; same value for every segment of the run. */
  warmUpMs: number;
  /** Camera media time (ms) that became source time 0 for this segment. */
  sourceClockOffsetMs: number;
  durationMs: number;
  presentedFrames: number;
  /** Frames the browser presented but never delivered to the frame callback (main thread busy). */
  droppedFrames: number;
  processedSamples: number;
  inputFps: number | null;
  processedFps: number | null;
  inferenceMs: { p50: number | null; p95: number | null };
  latencyMs: { p50: number | null; p95: number | null; basis: LatencyBasis };
  perSample: { sampleIndex: number; inferenceMs: number; latencyMs: number }[];
}

