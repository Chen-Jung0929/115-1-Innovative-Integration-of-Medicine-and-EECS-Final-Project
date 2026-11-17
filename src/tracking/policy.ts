/** Engineering screens, not calibrated identity probabilities or clinical limits. */
export const TRACKING_POLICY = {
  version: 'identity-only-recovery-v4', minConfidence: 0.5, roiMargin: 0.02,
  maxInitialCenterOffset: 0.35, minTorsoPx: 8, minSegmentPx: 2, maxLegSegmentRatio: 5,
  maxCenterTorsoPerSecond: 3, maxSegmentScaleChange: 2,
  recoveryGapMs: 650, recoveryConfirmations: 2, recoveryCenterTorso: 0.5, recoveryScaleChange: 1.25,
} as const;

export const JOINT_POLICY = {
  version: 'separate-knee-temporal-recovery-v1',
  minSegmentPx: 2, maxLegSegmentRatio: 5, maxSegmentScaleChange: 2,
  recoveryScaleChange: 1.25, recoveryConfirmations: 2, maxObservationGapMs: 300,
} as const;
