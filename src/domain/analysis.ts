import type { PipelineConfig } from './pipeline';
import type { CandidateSelection } from '../selection/subject';
import type { FrameRead } from './video';
import type { TrackingQuality, SubjectSelection, HumanReview, RoiProposal, Roi } from './tracking';
import type { AngleValue, AnalysisMetadata } from './measurement';
export interface Landmark { x: number; y: number; visibility: number; presence?: number; z?: number }
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
  left: AngleValue;
  right: AngleValue;
}
export interface Session {
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
export const ANALYSIS_SCHEMA_VERSION = '9';
export const SAMPLING_HZ = 5;
export const MAX_DURATION_SECONDS = 600;
