import type { CameraPitch, Landmark, Sample, Session } from '../domain/analysis';
import { ANGLE_DEFINITION, QC_POLICY, ANALYSIS_SCHEMA_VERSION, MAX_DURATION_SECONDS } from '../domain/analysis';
import { DEFAULT_PIPELINE } from '../domain/pipeline';
import type { LivePerformance } from '../domain/performance';
import type { SubjectSelection } from '../domain/tracking';
import { createFullFrameIdentity } from '../tracking/identity';
import { measureKnees, trackingPolicySnapshot } from './measure';
import { poseQuality, type Torso } from '../biomechanics/poseQuality';
import { kneeObservation } from '../biomechanics/jointQuality';

/** Target live inference rate. Same as uploaded video since ADR-081 (was higher than offline 5 Hz) so feedback feels immediate; identity gates are per-second. */
export const LIVE_SAMPLING_HZ = 10;
export const LIVE_MAX_SAMPLES = MAX_DURATION_SECONDS * LIVE_SAMPLING_HZ;

/** True when a presented camera frame should be sent to the model (rate limit only; never reuses old poses). */
export function dueForSample(lastSampleMs: number | null, frameMs: number, hz = LIVE_SAMPLING_HZ): boolean {
  if (!Number.isFinite(frameMs)) return false;
  if (lastSampleMs === null) return true;
  return frameMs - lastSampleMs >= 1000 / hz - 5; // 5 ms tolerance for 30 fps cameras landing at 99.9 ms
}

/**
 * Live analysis for the main Full Frame + Single Pose mode. Uses the same identity, joint QC and knee
 * angle code as uploaded video. A manual-review lock is never cleared automatically; the user must
 * start a new live segment (a new analyzer).
 */
export function createLiveAnalyzer(width: number, height: number, selection: SubjectSelection) {
  const identity = createFullFrameIdentity(width, height, { controlledSingle: selection.correctionSource === 'controlled-single-default' });
  const samples: Sample[] = [];
  const keyframeId = selection.keyframes[0]?.id ?? selection.id;
  let previous = -Infinity;
  return {
    samples: samples as readonly Sample[],
    get full() { return samples.length >= LIVE_MAX_SAMPLES; },
    /** Returns null for duplicate / non-increasing timestamps or when the recording limit is reached. */
    step(candidateLandmarks: Landmark[][], sourceTimeMs: number): Sample | null {
      if (!(sourceTimeMs > previous) || samples.length >= LIVE_MAX_SAMPLES) return null;
      const roi = { x: 0, y: 0, width, height };
      const result = identity.observe(candidateLandmarks, sourceTimeMs, selection.roi);
      const { rawAngles, automaticAngles } = measureKnees(result.landmarks, result.tracking, width, height);
      const sample: Sample = {
        sampleIndex: samples.length, requestedTimeMs: sourceTimeMs, sourceTimeMs,
        decode: { sourceTimeMs, timeBasis: 'presentation', method: 'callback', warnings: [] },
        roi, roiSource: 'full-frame', roiUpdateReason: 'original-source-image-no-crop', manualKeyframeId: keyframeId,
        resetModel: false, searchDue: false, targetReferenceRoi: selection.roi, subjectDecision: result.decision, search: null,
        landmarks: result.landmarks, candidates: candidateLandmarks.map(landmarks => ({ cropLandmarks: landmarks, landmarks })),
        tracking: result.tracking, rawAngles, automaticAngles, ...automaticAngles,
      };
      samples.push(sample); previous = sourceTimeMs;
      return sample;
    },
  };
}

export interface LiveRunInfo { width: number; height: number; selection: SubjectSelection; displayMirrored: boolean; startedAt: number; model: Session['metadata']['model']; appVersion: string; modelPreparationMs: number }

/** Package a finished live segment like an offline session so the same CSV / JSON export works. */
export function liveSession(samples: readonly Sample[], info: LiveRunInfo, now = performance.now(), livePerformance?: LivePerformance, cameraPitch?: CameraPitch | null): Session {
  const first = samples[0]?.sourceTimeMs ?? 0, last = samples.at(-1)?.sourceTimeMs ?? 0;
  return {
    ...(livePerformance ? { livePerformance } : {}),
    ...(cameraPitch ? { cameraPitch } : {}),
    run: { pipeline: { ...DEFAULT_PIPELINE }, inputSpace: 'full-frame', sourceSha256: null, comparisonId: null, analysisDurationMs: now - info.startedAt, modelPreparationMs: info.modelPreparationMs, requestedSamples: samples.length },
    analysisRevision: { parentSessionId: null, selectionRevision: info.selection.revision, correctionSource: info.selection.correctionSource },
    trackingPolicy: trackingPolicySnapshot(), subjectSelection: info.selection,
    sourceFilename: 'live-camera', durationMs: last - first, samplingHz: LIVE_SAMPLING_HZ, samples: [...samples],
    metadata: { schemaVersion: ANALYSIS_SCHEMA_VERSION, sessionId: crypto.randomUUID(), sourceId: crypto.randomUUID(), inputKind: 'camera',
      sourceWidthPx: info.width, sourceHeightPx: info.height, inferenceMirrored: false, displayMirrored: info.displayMirrored,
      model: info.model, angleDefinitionVersion: ANGLE_DEFINITION, qcPolicyVersion: QC_POLICY, applicationVersion: info.appVersion, createdAtUtc: new Date().toISOString() },
  };
}

/** Hands-free start: how long one person must stand still, fully in view, before a new segment begins. */
export const READY_POLICY = { version: 'live-ready-hold-v1', holdMs: 1500, maxGapMs: 300, maxCenterTorso: 0.25, maxScaleChange: 1.15 } as const;

/**
 * Decides when a new live segment may start without anyone touching the device. It never edits or
 * unlocks an existing segment: a locked segment stays locked and is saved; only a brand-new analyzer
 * starts after exactly one reliable, still, full-body pose has been seen for READY_POLICY.holdMs.
 */
export function createReadyGate(width: number, height: number, policy = READY_POLICY) {
  let anchor: { torso: Torso; since: number; last: number } | null = null;
  return {
    reset() { anchor = null; },
    observe(candidates: readonly Landmark[][], timeMs: number): { ready: boolean; heldMs: number; reason: 'no-person' | 'multiple-people' | 'not-full-body' | 'moving' | 'holding' | 'ready' } {
      if (candidates.length !== 1) { anchor = null; return { ready: false, heldMs: 0, reason: candidates.length ? 'multiple-people' : 'no-person' }; }
      const points = candidates[0]!, qc = poseQuality(points, width, height);
      const kneeVisible = (['left', 'right'] as const).some(side => kneeObservation(points, side, width, height).reasons.length === 0);
      if (!qc.accepted || !qc.torso || !kneeVisible) { anchor = null; return { ready: false, heldMs: 0, reason: 'not-full-body' }; }
      const torso = qc.torso;
      const still = anchor && timeMs - anchor.last <= policy.maxGapMs && timeMs > anchor.last
        && Math.hypot(torso.x - anchor.torso.x, torso.y - anchor.torso.y) / Math.max(torso.length, anchor.torso.length) <= policy.maxCenterTorso
        && Math.max(torso.length / anchor.torso.length, anchor.torso.length / torso.length) <= policy.maxScaleChange;
      if (!still) { const moved = anchor !== null; anchor = { torso, since: timeMs, last: timeMs }; return { ready: false, heldMs: 0, reason: moved ? 'moving' : 'holding' }; }
      anchor!.last = timeMs;
      const heldMs = timeMs - anchor!.since;
      return heldMs >= policy.holdMs ? { ready: true, heldMs, reason: 'ready' } : { ready: false, heldMs, reason: 'holding' };
    },
  };
}
