import { describe, expect, it } from 'vitest';
import type { Landmark } from '../domain/analysis';
import { MAX_CORRECTION_DEG, addCameraSums, createCausalLifter, emptySums, flexion3D, frameScale, liftClip, projectToImage, solveCamera, usable, type Vec3 } from './lift3d';

// Synthetic subject facing the camera, in a gravity frame (metres, y down, floor y = 0, −z = toward camera).
const W = 720, H = 1280, PX = 300, PITCH = 10 * Math.PI / 180;
function body(flex: number): Vec3[] {
  // Shank tilts 40 % and thigh 60 % of the flexion, so the hip moves back over the planted feet.
  const a = 0.4 * flex * Math.PI / 180, b = 0.6 * flex * Math.PI / 180, P: Vec3[] = Array.from({ length: 33 }, () => [0, -1.4, 0]);
  for (const [s, x] of [[0, 0.1], [1, -0.1]] as const) { // 0 = left (image right side for a facing subject)
    const ankle: Vec3 = [x, -0.08, 0], knee: Vec3 = [x, ankle[1] - 0.42 * Math.cos(a), -0.42 * Math.sin(a)];
    const hip: Vec3 = [x, knee[1] - 0.42 * Math.cos(b), knee[2] + 0.42 * Math.sin(b)];
    P[27 + s] = ankle; P[25 + s] = knee; P[23 + s] = hip;
    P[29 + s] = [x, 0, 0.05]; P[31 + s] = [x, 0, -0.15];
    P[11 + s] = [x, hip[1] - 0.5, hip[2]];
    for (const i of [13, 15, 17, 19, 21]) P[i + s] = [x * 2, hip[1] - 0.2, hip[2] - 0.1];
  }
  P[0] = [0, P[11]![1] - 0.25, P[11]![2]];
  return P;
}
/** Camera pitched down by PITCH, 3 m away: orthographic image + world landmarks (hip-centred, gravity frame). */
function observe(P: Vec3[], kneeBias = 0, worldFollowsCamera = false, pitch = PITCH): Landmark[] {
  const c = Math.cos(pitch), s = Math.sin(pitch), hip = [0, 1, 2].map(k => (P[23]![k]! + P[24]![k]!) / 2);
  return P.map((p, i) => {
    const cam = [p[0], c * p[1] - s * (p[2] + 3), s * p[1] + c * (p[2] + 3)];
    const w: Vec3 = [p[0] - hip[0]!, p[1] - hip[1]!, p[2] - hip[2]! - (i === 25 || i === 26 ? kneeBias : 0)];
    // Real MediaPipe world points are roughly camera-aligned: they turn with a pitched phone.
    const world: Vec3 = worldFollowsCamera ? [w[0], c * w[1] - s * w[2], s * w[1] + c * w[2]] : w;
    return { x: (cam[0]! * PX + W / 2) / W, y: (cam[1]! * PX + H * 0.6) / H, visibility: 1, world };
  });
}
/** 10 frames standing still, then squats 0 → 90° → 0 every 2 s (10 Hz). */
const squat = (n = 50, bias = 0.05) => Array.from({ length: n }, (_, i) => {
  const f = i < 10 ? 0 : 45 * (1 - Math.cos(2 * Math.PI * (i - 10) / 20));
  return { flex: f, frame: { timeMs: i * 100, landmarks: observe(body(f), bias) } };
});

describe('hybrid 3D lift', () => {
  it('recovers the camera rotation and scale from world ↔ image pairs', () => {
    const sums = emptySums();
    const clip = squat(50, 0);
    for (const { frame } of clip) addCameraSums(sums, frame.landmarks, W, H);
    const first = solveCamera(sums)!;
    // Second pass with each frame's own scale (as liftClip does) makes the fit exact.
    const again = emptySums();
    for (const { frame } of clip) addCameraSums(again, frame.landmarks, W, H, frameScale(frame.landmarks, W, H, first.rotation));
    const cam = solveCamera(again)!;
    expect(frameScale(clip[20]!.frame.landmarks, W, H, cam.rotation)).toBeCloseTo(PX, 0);
    expect(cam.rotation[4]).toBeCloseTo(Math.cos(PITCH), 3); // y-row of a pitch rotation
    expect(cam.rotation[5]).toBeCloseTo(-Math.sin(PITCH), 3);
  });

  it('removes the standing knee-depth bias, keeps squat depth, and stands the body upright on the floor', () => {
    const clip = squat();
    const { poses, context, scales } = liftClip(clip.map(c => c.frame), W, H, { smoothSeconds: 0 });
    const raw = clip.map(c => flexion3D(c.frame.landmarks.map(p => p.world), 'knee', 'left')!);
    const lifted = poses.map(p => flexion3D(p!, 'knee', 'left')!);
    expect(raw[0]).toBeGreaterThan(10); // the 5 cm bias reads as a bent knee
    expect(Math.abs(lifted[0]!)).toBeLessThan(5); // corrected, but at most MAX_CORRECTION_DEG
    expect(raw[0]! - lifted[0]!).toBeLessThanOrEqual(MAX_CORRECTION_DEG + 0.5);
    expect(['applied', 'capped']).toContain(context!.legs.left.status);
    // At the bottom the calibration has faded out, so the 5 cm bias is left (by design, ADR-072) …
    expect(Math.abs(lifted[20]! - clip[20]!.flex)).toBeLessThan(10);
    // … and without a bias the lift is exact there.
    const exact = liftClip(squat(50, 0).map(c => c.frame), W, H, { smoothSeconds: 0 }).poses;
    expect(flexion3D(exact[20]!, 'knee', 'left')!).toBeCloseTo(90, 0);
    clip.forEach((c, i) => expect(Math.abs(lifted[i]! - c.flex)).toBeLessThan(10));
    // Upright: in standing the hip is straight above the ankle; feet on y = 0.
    const p0 = poses[0]!;
    expect(Math.abs(p0[23]![2] - p0[27]![2])).toBeLessThan(0.02);
    expect(Math.abs(Math.max(p0[29]![1], p0[31]![1]))).toBeLessThan(0.02);
    // Reprojects onto the 2D keypoints.
    const [u, v] = projectToImage(p0[25]!, context!, scales[0]!);
    const lm = clip[0]!.frame.landmarks[25]!;
    expect(Math.hypot(u - lm.x * W, v - lm.y * H)).toBeLessThan(0.5);
  });

  it('foot lock gives the pelvis its depth motion while the feet stay put', () => {
    const clip = squat(25, 0);
    const { poses } = liftClip(clip.map(c => c.frame), W, H, { smoothSeconds: 0 });
    const hipZ = (p: Vec3[]) => (p[23]![2] + p[24]![2]) / 2;
    expect(hipZ(poses[20]!) - hipZ(poses[0]!)).toBeGreaterThan(0.08); // hip moved back (truth 0.093 m)
    expect(Math.abs(poses[20]![27]![2] - poses[0]![27]![2])).toBeLessThan(0.01);
    const off = liftClip(clip.map(c => c.frame), W, H, { smoothSeconds: 0, footLock: false }).poses;
    expect(Math.abs(off[20]![27]![2] - off[0]![27]![2])).toBeGreaterThan(0.1); // hip-centred: feet slide
  });

  it('skips unusable frames and returns null for them', () => {
    const clip = squat(6).map(c => c.frame);
    clip[2] = { timeMs: 200, landmarks: null as unknown as Landmark[] };
    const { poses } = liftClip(clip, W, H);
    expect(poses[2]).toBeNull();
    expect(poses.filter(Boolean)).toHaveLength(5);
    expect(liftClip([], W, H).context).toBeNull();
    expect(usable(clip[0]!.landmarks.map(({ world: _w, ...p }) => p))).toBe(false);
  });

  it('causal lifter: no correction before standing is seen, corrected once it is', () => {
    const lifter = createCausalLifter(W, H, { smoothSeconds: 0 });
    const clip = squat();
    const out = clip.map(c => lifter.step(c.frame.landmarks, c.frame.timeMs));
    expect(out.every(Boolean)).toBe(true);
    expect(flexion3D(out[9]!, 'knee', 'right')!).toBeLessThan(5);
    expect(['applied', 'capped']).toContain(lifter.context!.legs.right.status);
    expect(Math.abs(flexion3D(out[40]!, 'knee', 'right')! - clip[40]!.flex)).toBeLessThan(10);
    expect(lifter.step(clip[5]!.frame.landmarks, 0)).toBeNull(); // time must increase
  });

  it('a subject walking toward the camera keeps its size (per-frame scale)', () => {
    // Same standing pose, image scale growing 300 → 600 px/m over 2 s.
    const frames = Array.from({ length: 21 }, (_, i) => {
      const k = 1 + i / 20, lm = observe(body(0));
      return { timeMs: i * 100, landmarks: lm.map(p => ({ ...p, x: (p.x - .5) * k + .5, y: (p.y - .6) * k + .6 })) };
    });
    const { poses } = liftClip(frames, W, H, { smoothSeconds: 0 });
    const legLength = (p: Vec3[]) => Math.hypot(...[0, 1, 2].map(j => p[23]![j]! - p[27]![j]!));
    expect(legLength(poses[20]!) / legLength(poses[0]!)).toBeCloseTo(1, 1);
  });

  it('flexion3D needs all three points', () => {
    const p = body(0); expect(flexion3D(p, 'hip', 'left')).toBeCloseTo(0, 5);
    expect(flexion3D([], 'knee', 'left')).toBeNull();
    expect(flexion3D(undefined, 'knee', 'left')).toBeNull();
  });

  it('safety: a 20° flexion contracture hidden in depth still reads ≥ 15°', () => {
    // Standing with 20° of knee flexion that is invisible in the frontal image, plus the usual 5 cm bias.
    const clip = Array.from({ length: 40 }, (_, i) => {
      const f = i < 10 ? 20 : 20 + 35 * (1 - Math.cos(2 * Math.PI * (i - 10) / 20));
      return { flex: f, frame: { timeMs: i * 100, landmarks: observe(body(f), 0.05) } };
    });
    const { poses, context } = liftClip(clip.map(c => c.frame), W, H, { smoothSeconds: 0 });
    for (const side of ['left', 'right'] as const) {
      expect(flexion3D(poses[5]!, 'knee', side)!).toBeGreaterThanOrEqual(15);
      expect(context!.legs[side].correctionDeg).toBeLessThanOrEqual(MAX_CORRECTION_DEG + 1e-6);
    }
  });

  it('safety: a clip that never stands (knee > 45°) is not calibrated and not worse than raw', () => {
    const clip = Array.from({ length: 30 }, (_, i) => {
      const f = 45 + 22.5 * (1 - Math.cos(2 * Math.PI * i / 15));
      return { flex: f, frame: { timeMs: i * 100, landmarks: observe(body(f), 0.05) } };
    });
    const { poses, context } = liftClip(clip.map(c => c.frame), W, H, { smoothSeconds: 0 });
    expect(context!.legs.left.status).toBe('not-standing');
    expect(context!.legs.right.status).toBe('not-standing');
    const err = (get: (i: number) => number) => clip.reduce((s, c, i) => s + Math.abs(get(i) - c.flex), 0) / clip.length;
    const rawErr = err(i => flexion3D(clip[i]!.frame.landmarks.map(p => p.world), 'knee', 'left')!);
    expect(err(i => flexion3D(poses[i]!, 'knee', 'left')!)).toBeLessThanOrEqual(rawErr + 0.5);
  });

  it('safety: a knee bent in a side-view image is never "calibrated straight"', () => {
    // Same 30° contracture seen from the side (yaw 90°): the bend is in the image, so no correction.
    const side = (P: Vec3[]) => P.map(([x, y, z]) => [z, y, -x] as Vec3);
    const clip = Array.from({ length: 30 }, (_, i) => ({ timeMs: i * 100, landmarks: observe(side(body(i < 10 ? 30 : 30 + 30 * (1 - Math.cos(2 * Math.PI * (i - 10) / 20)))), 0.05) }));
    const { context } = liftClip(clip, W, H, { smoothSeconds: 0 });
    for (const s of ['left', 'right'] as const) expect(['bent-in-image', 'not-standing']).toContain(context!.legs[s].status);
  });

  it('a known camera pitch keeps the skeleton upright when the world points turn with the phone', () => {
    const clip = squat(30, 0).map(c => ({ timeMs: c.frame.timeMs, landmarks: observe(body(c.flex), 0, true) }));
    const tilt = (p: Vec3[]) => { const v = [0, 1, 2].map(j => (p[11]![j]! + p[12]![j]!) / 2 - (p[27]![j]! + p[28]![j]!) / 2); return Math.acos(-v[1]! / Math.hypot(...v)) * 180 / Math.PI; };
    expect(tilt(liftClip(clip, W, H, { smoothSeconds: 0 }).poses[0]!)).toBeGreaterThan(8); // pitch not observable
    expect(tilt(liftClip(clip, W, H, { smoothSeconds: 0, cameraPitchDeg: 10 }).poses[0]!)).toBeLessThan(1);
  });

  it('standing check: a 12° pitched phone still calibrates a straight-standing subject (pitch known)', () => {
    const P12 = 12 * Math.PI / 180;
    const clip = Array.from({ length: 40 }, (_, i) => {
      const f = i < 12 ? 0 : 45 * (1 - Math.cos(2 * Math.PI * (i - 12) / 20));
      return { timeMs: i * 100, landmarks: observe(body(f), 0.05, true, P12) };
    });
    const { context, poses } = liftClip(clip, W, H, { smoothSeconds: 0, cameraPitchDeg: 12 });
    expect(['applied', 'capped']).toContain(context!.legs.left.status);
    expect(Math.abs(flexion3D(poses[0]!, 'knee', 'left')!)).toBeLessThan(5);
    const live = createCausalLifter(W, H, { smoothSeconds: 0, cameraPitchDeg: 12 });
    clip.forEach(c => live.step(c.landmarks, c.timeMs));
    expect(['applied', 'capped']).toContain(live.context!.legs.left.status);
  });

  it('standing check: a straight leg held for under 0.5 s is not treated as standing', () => {
    // Quick squats (straight → 30° within one sample) that pause straight for only 0.3 s (3 samples at 10 Hz).
    const flexAt = (i: number) => { const k = i % 13; return k < 3 ? 0 : 30 + 30 * (1 - Math.cos(2 * Math.PI * (k - 3) / 10)); };
    const clip = Array.from({ length: 52 }, (_, i) => ({ timeMs: i * 100, landmarks: observe(body(flexAt(i)), 0.05) }));
    const { context } = liftClip(clip, W, H, { smoothSeconds: 0 });
    expect(context!.legs.left.status).toBe('not-standing');
    expect(context!.legs.right.status).toBe('not-standing');
    // The same clip with 0.6 s pauses does count as standing.
    const flexLong = (i: number) => { const k = i % 16; return k < 6 ? 0 : 30 + 30 * (1 - Math.cos(2 * Math.PI * (k - 6) / 10)); };
    const long = Array.from({ length: 48 }, (_, i) => ({ timeMs: i * 100, landmarks: observe(body(flexLong(i)), 0.05) }));
    expect(['applied', 'capped']).toContain(liftClip(long, W, H, { smoothSeconds: 0 }).context!.legs.left.status);
  });

  it('never returns non-finite poses: collapsed or NaN inputs are skipped', () => {
    const clip = squat(12).map(c => c.frame);
    clip[3] = { timeMs: 300, landmarks: clip[3]!.landmarks.map(p => ({ ...p, world: [0, 0, 0] as Vec3 })) };
    clip[4] = { timeMs: 400, landmarks: clip[4]!.landmarks.map((p, i) => i === 25 ? { ...p, x: NaN } : p) };
    clip[5] = { timeMs: 500, landmarks: clip[5]!.landmarks.map(p => ({ ...p, x: 0.5, y: 0.5 })) };
    const { poses } = liftClip(clip, W, H);
    expect([poses[3], poses[4], poses[5]]).toEqual([null, null, null]);
    expect(poses.filter(Boolean).every(p => p!.every(q => q.every(Number.isFinite)))).toBe(true);
    const allBad = liftClip(clip.map(f => ({ ...f, landmarks: f.landmarks.map(p => ({ ...p, world: [0, 0, 0] as Vec3 })) })), W, H);
    expect(allBad.poses.every(p => p === null)).toBe(true);
    const live = createCausalLifter(W, H);
    expect(live.step(clip[3]!.landmarks, 300)).toBeNull();
  });
});
