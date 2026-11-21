import { describe, expect, it } from 'vitest';
import type { Landmark } from '../domain/analysis';
import { addCameraSums, createCausalLifter, emptySums, flexion3D, frameScale, liftClip, projectToImage, solveCamera, usable, type Vec3 } from './lift3d';

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
function observe(P: Vec3[], kneeBias = 0): Landmark[] {
  const c = Math.cos(PITCH), s = Math.sin(PITCH), hip = [0, 1, 2].map(k => (P[23]![k]! + P[24]![k]!) / 2);
  return P.map((p, i) => {
    const cam = [p[0], c * p[1] - s * (p[2] + 3), s * p[1] + c * (p[2] + 3)];
    const world: Vec3 = [p[0] - hip[0]!, p[1] - hip[1]!, p[2] - hip[2]! - (i === 25 || i === 26 ? kneeBias : 0)];
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
    expect(Math.abs(lifted[0]!)).toBeLessThan(2);
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
    expect(flexion3D(out[0]!, 'knee', 'right')!).toBeLessThan(3); // first frame defines 'standing' itself
    expect(Math.abs(flexion3D(out[9]!, 'knee', 'right')!)).toBeLessThan(3);
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
});
