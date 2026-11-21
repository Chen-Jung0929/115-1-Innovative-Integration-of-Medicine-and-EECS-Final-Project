import { describe, expect, it } from 'vitest';
import { humanPose, makeSample } from '../test/fixtures';
import { calibrationNote, liftSession, poseAt, sessionFlexion } from './world3d';
import type { LiftContext } from '../biomechanics/lift3d';

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
});
