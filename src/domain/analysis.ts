import type { PipelineConfig } from './pipeline';
import type { CandidateSelection } from '../selection/subject';
import type { FrameRead } from './video';
import type { TrackingQuality, SubjectSelection, HumanReview, RoiProposal, Roi } from './tracking';
import type { AngleValue, AnalysisMetadata, PostureSet } from './measurement';
import type { LivePerformance } from './performance';
export interface Landmark {
  x: number; y: number; visibility: number; presence?: number; z?: number;
  /** Optional MediaPipe world landmark (metres, hip-centred 3D estimate). Experimental 3D angles only (ADR-068). */
  world?: [number, number, number];
}
export interface SearchObservation {roi:Roi;candidates:Landmark[][];status:string;suggestedRoi:Roi|null;numPoses:number;error?:string}
export interface Sample extends RoiProposal {
  subjectDecision?:CandidateSelection;
  targetReferenceRoi?:Roi;
  sampleIndex: number;
  requestedTimeMs: number;
  search:SearchObservation|null;
  decode: FrameRead;
  sourceTimeMs: number; // Decoded frame presentation timestamp, from requestVideoFrameCallback.
  landmarks: Landmark[];
  // Legacy cropLandmarks field means input-normalized estimates; A/C input is the full image.
  candidates: { cropLandmarks: Landmark[]; landmarks: Landmark[] }[];
  tracking: TrackingQuality;
  rawAngles: { left: AngleValue; right: AngleValue };
  automaticAngles: { left: AngleValue; right: AngleValue };
  review?: HumanReview;
  /** Optional (schema ≥10): squat posture metrics, raw / automatic-gated / final after human review. */
  posture?: { raw: PostureSet; automatic: PostureSet; final: PostureSet };
  left: AngleValue;
  right: AngleValue;
}
/**
 * Camera pitch (°, + = lens tilted down toward the floor) used to stand the 3D skeleton upright (ADR-080).
 * Optional; schema not bumped. 'device-orientation' = median phone tilt sensor reading over the live
 * segment; 'manual' = typed in for an uploaded video.
 */
export interface CameraPitch { deg: number; source: 'device-orientation' | 'manual'; readings?: number }
export interface Session {
  livePerformance?: LivePerformance;
  cameraPitch?: CameraPitch;
  qcReplay?:{strategy:string;originalSessionId:string;usesSavedObservations:true;detectionRun?:NonNullable<Session['run']>};
  run?:{pipeline:PipelineConfig;inputSpace:'full-frame'|'roi-crop';sourceSha256:string|null;comparisonId:string|null;analysisDurationMs:number;modelPreparationMs:number;requestedSamples:number};
  metadata: AnalysisMetadata;
  analysisRevision:{parentSessionId:string|null;selectionRevision:number;correctionSource:string};
  subjectSelection: SubjectSelection;
  trackingPolicy: Readonly<Record<string,string|number|boolean>>;
  sourceFilename: string;
  durationMs: number;
  samplingHz: number;
  samples: Sample[];
}
export const ANGLE_DEFINITION = 'knee-image-interior-v1';
export const PROXY_DEFINITION = 'knee-flexion-proxy-180-minus-interior-v1';
export const QC_POLICY = 'controlled-single-core-qc-v7';
export const ANALYSIS_SCHEMA_VERSION = '10';
/** Uploaded-video analysis rate (ADR-081: 5 → 10 Hz; old sessions keep their own samplingHz). */
export const SAMPLING_HZ = 10;
export const MAX_DURATION_SECONDS = 600;
/** Rates an uploaded video may be analysed at: 10 Hz default, 5 Hz only to compare with sessions made before ADR-081. */
export const ALLOWED_SAMPLING_HZ = [5, 10] as const;
/** `?hz=5` in the page address re-runs the frozen 5 Hz setting (AGENTS.md comparisons); anything else = SAMPLING_HZ. */
export function samplingHzFrom(search: string): number {
  const v = Number(new URLSearchParams(search).get('hz'));
  return (ALLOWED_SAMPLING_HZ as readonly number[]).includes(v) ? v : SAMPLING_HZ;
}
