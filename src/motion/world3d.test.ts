import { describe, expect, it } from 'vitest';
import { humanPose, makeSample } from '../test/fixtures';
import { calibrationNote, groundForDisplay, liftSession, poseAt, sessionFlexion } from './world3d';
import { flexion3D, type LiftContext, type Vec3 } from '../biomechanics/lift3d';

const withWorld = (dx = 0) => humanPose(dx).map(p => ({ ...p, world: [p.x - .5 - dx, p.y - .5, 0] as [number, number, number] }));
const at = (i: number, extra = {}) => makeSample({ sampleIndex: i, requestedTimeMs: i * 200, sourceTimeMs: i * 200, landmarks: withWorld(i * .01), ...extra });

describe('session 3D poses', () => {
  it('lifts only frames that passed subject QC and were not reviewed as the wrong person', () => {
    const lost = at(1); lost.tracking = { ...lost.tracking, accepted: false };
    const wrong = at(2, { review: { label: 'wrong-target', note: '', reviewedAt: '' } as never });
    const poses = liftSession([at(0), lost, wrong, at(3)], 640, 480).poses;
    expect([...poses.keys()]).toEqual([0, 3]);
    expect(sessionFlexion(poses, at(0), 'knee', 'left')).toBeCloseTo(0, 0);
    expect(sessionFlexion(poses, lost, 'knee', 'left')).toBeNull();
    expect(sessionFlexion(null, at(0), 'knee', 'left')).toBeNull();
  });

  it('display pose moves between neighbouring lifted samples, never across a long gap', () => {
    const samples = [at(0), at(1)], poses = liftSession(samples, 640, 480).poses;
    const mid = poseAt(samples, poses, 100, samples[0], 250)!;
    const a = poses.get(0)!, b = poses.get(1)!;
    expect(mid[25]![0]).toBeCloseTo((a[25]![0] + b[25]![0]) / 2, 6);
    expect(poseAt(samples, poses, 100, samples[0], 150)).toBe(a);
    expect(poseAt(samples, poses, 100, undefined, 250)).toBeUndefined();
  });

  it('says in plain words whether the straight-leg calibration was used', () => {
    const ctx = { legs: { left: { status: 'capped', correctionDeg: 10, standingExtension: 1, kneeDepthOffset: -0.04 }, right: { status: 'not-standing', correctionDeg: 0, standingExtension: 1, kneeDepthOffset: 0 } } } as unknown as LiftContext;
    expect(calibrationNote(ctx)).toBe('左膝已做站直校正（10°，已達上限）；右膝未校正（沒有偵測到可確認的站直畫面，鏡頭俯仰也可能讓系統判斷不出來）。');
    expect(calibrationNote(null)).toBeNull();
  });

  it('display pose stands on the floor grid at its centre, without changing any angle (ADR-090)', () => {
    const pose = liftSession([at(0)], 640, 480).poses.get(0)!;
    // Float the skeleton 0.4 m above the floor and 1 m sideways / back, as a drifting lift could.
    const floating = pose.map(p => [p[0] + 1, p[1] - 0.4, p[2] + 1] as Vec3);
    const shown = groundForDisplay(floating)!;
    expect(Math.max(...[27, 28, 29, 30, 31, 32].map(i => shown[i]![1]))).toBeCloseTo(0, 9);
    expect((shown[27]![0] + shown[28]![0]) / 2).toBeCloseTo(0, 9);
    expect((shown[27]![2] + shown[28]![2]) / 2).toBeCloseTo(0, 9);
    for (const joint of ['knee', 'hip'] as const) for (const side of ['left', 'right'] as const) expect(flexion3D(shown, joint, side)).toBeCloseTo(flexion3D(pose, joint, side)!, 9);
    // The pelvis keeps its height above the feet (a squat still goes down).
    const hipAboveFeet = (P: Vec3[]) => Math.max(...[27, 28].map(i => P[i]![1])) - (P[23]![1] + P[24]![1]) / 2;
    expect(hipAboveFeet(shown)).toBeCloseTo(hipAboveFeet(pose), 9);
    // Each foot is drawn flat: heel and toe at the same height.
    expect(shown[29]![1]).toBeCloseTo(shown[31]![1], 9);
    expect(shown[30]![1]).toBeCloseTo(shown[32]![1], 9);
    expect(groundForDisplay(undefined)).toBeUndefined();
    expect(floating[27]![1]).toBeCloseTo(pose[27]![1] - 0.4, 9); // input untouched
  });
});
