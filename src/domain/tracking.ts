export interface Roi { x: number; y: number; width: number; height: number }
export interface SubjectSelection {
  id: string;
  roi: Roi; // Integer original-source pixels. Fixed for the whole analysis.
  method: 'manual-fixed-roi';
  referenceTimeMs: 0; // Select on the beginning of the source clip.
}
export interface TrackingQuality {
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
