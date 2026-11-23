import { describe, expect, it } from 'vitest';
import type { Landmark } from '../domain/analysis';
import { worldFlexion } from './world';

const pose = (knee: [number, number, number]): Landmark[] => {
  const p: Landmark[] = Array.from({ length: 33 }, () => ({ x: .5, y: .5, visibility: 1, world: [0, 0, 0] as [number, number, number] }));
  p[23] = { ...p[23]!, world: [0.1, 0, 0] }; p[25] = { ...p[25]!, world: knee }; p[27] = { ...p[27]!, world: [0.1, 0.8, 0] };
  p[11] = { ...p[11]!, world: [0.1, -0.5, 0] };
  return p;
};
describe('3D world-landmark flexion', () => {
  it('straight leg = 0°, knee pushed toward the camera = flexion even though the image looks straight', () => {
    expect(worldFlexion(pose([0.1, 0.4, 0]), 'knee', 'left')).toBeCloseTo(0, 5);
    // Knee 0.4 m forward in depth: invisible in a frontal 2D image, ~90° in 3D.
    expect(worldFlexion(pose([0.1, 0.4, -0.4]), 'knee', 'left')).toBeCloseTo(90, 0);
  });
  it('hip uses shoulder–hip–knee', () => {
    expect(worldFlexion(pose([0.1, 0.4, 0]), 'hip', 'left')).toBeCloseTo(0, 5);
  });
  it('missing world points give null', () => {
    const p = pose([0.1, 0.4, 0]); delete p[25]!.world;
    expect(worldFlexion(p, 'knee', 'left')).toBeNull();
  });
});
