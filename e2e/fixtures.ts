import { execFileSync } from 'node:child_process';
import { expect, type Locator } from '@playwright/test';

export function makeSyntheticVideo(filename: string) {
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i',
    'color=c=blue:s=320x180:r=25:d=1,drawbox=x=0:y=0:w=160:h=180:color=red:t=fill',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', filename]);
}

export function syntheticPose() {
  const pose = Array.from({ length: 33 }, () => ({ x: .5, y: .4, z: 0, visibility: 1 }));
  for (const [index, x, y] of [[11,.4,.2],[12,.6,.2],[23,.4,.5],[24,.6,.5],
    [25,.45,.7],[26,.6,.7],[27,.4,.9],[28,.6,.9]] as const) pose[index] = { x, y, z: 0, visibility: 1 };
  return pose;
}

export async function expectAlignedPicture(stage: Locator, aspect: number) {
  const picture = await stage.locator('video').boundingBox();
  const skeleton = await stage.locator('canvas.overlay').boundingBox();
  expect(picture).not.toBeNull();
  expect(skeleton).not.toBeNull();
  for (const key of ['x', 'y', 'width', 'height'] as const) {
    expect(Math.abs(skeleton![key] - picture![key])).toBeLessThan(1);
  }
  expect(Math.abs(picture!.width - picture!.height * aspect)).toBeLessThan(1);
}
