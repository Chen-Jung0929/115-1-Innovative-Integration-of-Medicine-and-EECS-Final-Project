export interface Roi { x: number; y: number; width: number; height: number }
export interface RoiKeyframe {id:string; timeMs:number; roi:Roi; source:'manual-target-confirmation'}
export interface RoiProposal {previousState?:TrackingState;resetModel?:boolean;searchDue?:boolean;roi:Roi;roiSource:string;roiUpdateReason:string;manualKeyframeId:string|null}
export interface SubjectSelection {
  id: string;
  roi: Roi; // Integer original-source pixels. Fixed for the whole analysis.
  method: 'manual-fixed-roi'|'manual-keyframes'|'adaptive-roi';
  keyframes:RoiKeyframe[];
  interpolation:'linear-source-pixels-v1';
  revision:number;
  correctionSource:'initial-selection'|'manual-roi-edit'|'manual-keyframe'|'mode-change';
  parentSelectionId:string|null;
  referenceTimeMs: 0; // Select on the beginning of the source clip.
}
export type TrackingState='TRACKING'|'UNCERTAIN'|'LOST'|'MANUAL_REVIEW_REQUIRED';
export interface TrackingQuality {
  state:TrackingState;
  accepted: boolean;
  identity: 'consistent-unverified' | 'identity-uncertain' | 'target-lost';
  landmarkConfidence: 'sufficient' | 'insufficient';
  plausibility: 'plausible' | 'implausible' | 'unassessed';
  continuity: 'initial' | 'continuous' | 'discontinuous' | 'unassessed';
  reasons: string[];
}
export type HumanLabel = 'correct-target' | 'wrong-target' | 'mixed-landmarks' | 'uncertain';
export interface HumanReview {
  label: HumanLabel;
  identityId: string; // Pseudonymous identity assigned by human, never model candidate index.
  reviewerId: string;
}
