import { describe, expect, it } from 'vitest';
import { gatePosture, gateReason, reviewedPosture } from './gate';
import { measurePosture } from '../biomechanics/posture';
import { accepted, humanPose, makeSample } from '../test/fixtures';
import { applyReview } from '../validation/targetMetrics';
import type { TrackingQuality, JointQuality } from '../domain/tracking';
const raw = measurePosture(humanPose(), 100, 100);
const joint = (valid: boolean, state: JointQuality['state'] = valid ? 'READY' : 'INVALID'): JointQuality => ({ state, valid, reasons: valid ? [] : ['implausible-projected-geometry'], lengthsPx: null, confirmationCount: 0, baselineBeforePx: null, recoveryAnchorPx: null, observationValid: valid, observationReasons: [], temporal: 'unassessed' });

describe('posture gating follows subject identity and joint QC', () => {
  it('passes accepted observations unchanged', () => expect(gatePosture(raw, accepted)).toEqual(raw));
  it('invalidates every metric when identity is uncertain or lost', () => {
    const lost: TrackingQuality = { ...accepted, accepted: false, identity: 'target-lost' };
    const g = gatePosture(raw, lost);
    expect([g.hip.left, g.hip.right, g.trunkLean, g.kneeToe.left, g.kneeToe.right].map(v => v.invalidReasons)).toEqual([['target-lost'], ['target-lost'], ['target-lost'], ['target-lost'], ['target-lost']]);
    expect(gateReason({ ...accepted, accepted: false, identity: 'identity-uncertain' }, [])).toBe('identity-uncertain');
  });
  it('a failing left joint invalidates left hip and left knee–toe, not the right side or trunk', () => {
    const t: TrackingQuality = { ...accepted, joints: { left: joint(false), right: joint(true) } };
    const g = gatePosture(raw, t);
    expect(g.hip.left.invalidReasons).toEqual(['joint-landmark-invalid']);
    expect(g.kneeToe.left.invalidReasons).toEqual(['joint-landmark-invalid']);
    expect(g.kneeToe.right.valid).toBe(true); expect(g.hip.right.valid).toBe(true); expect(g.trunkLean.valid).toBe(true);
    expect(gatePosture(raw, { ...accepted, joints: { left: joint(true), right: joint(false, 'RECOVERING') } }).hip.right.invalidReasons).toEqual(['joint-recovery-pending']);
  });
  it('keeps the measurement reason when the subject is accepted but geometry is invalid', () => {
    const empty = measurePosture([], 100, 100);
    expect(gatePosture(empty, accepted).trunkLean.invalidReasons).toEqual(['missing-landmark']);
    expect(gatePosture(empty, { ...accepted, accepted: false, identity: 'target-lost' }).kneeToe.right.invalidReasons).toEqual(['target-lost']);
  });
});

describe('human review', () => {
  it('rejects every final posture value unless correct-target, and keeps automatic results', () => {
    expect(reviewedPosture(raw, true)).toBe(raw);
    const sample = makeSample({ posture: { raw, automatic: raw, final: raw } });
    const wrong = applyReview(sample, { label: 'wrong-target', identityId: 'B', reviewerId: 'r' });
    expect(wrong.posture!.final.trunkLean.invalidReasons).toEqual(['identity-uncertain']);
    expect(wrong.posture!.final.kneeToe.left.value).toBeNull();
    expect(wrong.posture!.automatic.trunkLean.valid).toBe(true);
    const restored = applyReview(wrong, undefined);
    expect(restored.posture!.final).toEqual(raw);
    expect(applyReview(makeSample(), undefined).posture).toBeUndefined();
  });
});
