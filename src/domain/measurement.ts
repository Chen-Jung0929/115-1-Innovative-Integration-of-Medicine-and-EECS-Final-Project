/** Shared measurement contracts; runtime QC is in biomechanics/knee.ts. */
export type AnatomicalSide = 'left' | 'right';
export type MeasurementSpace = 'image-plane-2d' | 'model-estimated-3d';
export type InvalidReason =
  | 'missing-landmark' | 'low-confidence' | 'non-finite'
  | 'target-lost' | 'identity-uncertain' | 'out-of-range-confidence' | 'degenerate-geometry' | 'out-of-frame' | 'unsupported-view'
  | 'joint-landmark-invalid' | 'joint-temporal-discontinuity' | 'joint-recovery-pending';

export type AngleValue =
  | { valid: true; rawAngleDeg: number; invalidReasons: readonly [] }
  | { valid: false; rawAngleDeg: null; invalidReasons: readonly [InvalidReason, ...InvalidReason[]] };

/** Non-angle scalar (e.g. a width ratio); same validity contract as AngleValue. */
export type ScalarValue =
  | { valid: true; value: number; invalidReasons: readonly [] }
  | { valid: false; value: null; invalidReasons: readonly [InvalidReason, ...InvalidReason[]] };

/** Provisional squat posture metrics, all 2D image-plane geometry (see biomechanics/posture.ts). */
export interface PostureSet {
  hip: { left: AngleValue; right: AngleValue };
  trunkLean: AngleValue;
  /** Knee offset from the toe plumb line in hip widths; + = medial. */
  kneeToe: { left: ScalarValue; right: ScalarValue };
}

export interface AnalysisMetadata {
  schemaVersion: string;
  sessionId: string;
  sourceId: string; // Opaque ID; no participant name or local file path.
  inputKind: 'video' | 'camera';
  sourceWidthPx: number;
  sourceHeightPx: number;
  inferenceMirrored: boolean;
  displayMirrored: boolean;
  model: { packageVersion: string; assetId: string; assetSha256: string; delegate: string };
  angleDefinitionVersion: string;
  qcPolicyVersion: string;
  applicationVersion: string;
  createdAtUtc: string;
}

export type AngleSample = AngleValue & {
  frameIndex: number;
  timestampMs: number; // Source media timeline, never wall-clock processing completion.
  side: AnatomicalSide;
  joint: string;
  measurementSpace: MeasurementSpace;
  angleDefinitionVersion: string;
};
