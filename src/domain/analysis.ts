import type { FrameRead } from './video';
import type { TrackingQuality, SubjectSelection, HumanReview, RoiProposal } from './tracking';
import type { AngleValue, AnalysisMetadata } from './measurement';
export interface Landmark { x: number; y: number; visibility: number; presence?: number; z?: number }
export interface Sample extends RoiProposal {
  sampleIndex: number;
  requestedTimeMs: number;
  decode: FrameRead;
  sourceTimeMs: number; // Decoded frame presentation timestamp, from requestVideoFrameCallback.
  landmarks: Landmark[];
  candidates: { cropLandmarks: Landmark[]; landmarks: Landmark[] }[];
  tracking: TrackingQuality;
  rawAngles: { left: AngleValue; right: AngleValue };
  automaticAngles: { left: AngleValue; right: AngleValue };
  review?: HumanReview;
  left: AngleValue;
  right: AngleValue;
}
export interface Session {
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
export const QC_POLICY = 'pixel-xy-visible-present-0.5-and-roi-tracking-v2';
export const SAMPLING_HZ = 5;
export const MAX_DURATION_SECONDS = 600;
