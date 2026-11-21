import { test, expect } from '@playwright/test';
// Chromium's built-in fake camera (synthetic test pattern, no person or face). Pose output is a
// synthetic adapter, so this checks wiring only, not MediaPipe accuracy on real people.
test.use({ permissions: ['camera'], launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'], ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) } });
test('live camera starts hands-free, ends a segment on a second person, restarts by itself, and exports', async ({ page }) => {
  await page.route('**/src/pose/mediapipe.ts', route => route.fulfill({ contentType: 'application/javascript', body: `
    export const MODEL_URL='https://example.invalid/synthetic';
    export const MODEL_VERSION='synthetic-adapter-test';
    export const PROJECT_MODEL_URL='/models/pose_landmarker_lite.task';
    export async function modelBytes(){return {bytes:new Uint8Array(),hash:'synthetic',id:'synthetic'};}
    export async function createPoseEngine(){let previous=-1;return {close(){},detect(canvas,time){
      if(time<=previous)throw new Error('non-monotonic timestamp');previous=time;
      const pose=Array.from({length:33},()=>({x:.5,y:.4,visibility:1}));
      for(const [i,x,y] of [[11,.4,.2],[12,.6,.2],[23,.4,.5],[24,.6,.5],[25,.45,.7],[26,.6,.7],[27,.4,.9],[28,.6,.9]])pose[i]={x,y,visibility:1};
      const crowd=window.__crowd===true;return crowd?[pose,pose.map(p=>({...p,x:p.x-.3}))]:[pose];
    }};}` }));
  await page.goto('/');
  await page.getByRole('button', { name: '即時鏡頭', exact: true }).click();
  await page.getByRole('button', { name: '開啟鏡頭', exact: true }).click();
  await expect(page.getByText(/站好不動|保持不動/)).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('量測中', { exact: true })).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.measurements .angle').first()).toHaveText(/°$/);
  // The skeleton canvas must lie exactly on the camera picture (no letterboxing), or it drifts off the person.
  const boxes = await page.locator('.video-stage:visible').evaluate(stage => [stage.querySelector('video')!, stage.querySelector('canvas.overlay')!].map(e => { const r = e.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; }));
  expect(boxes[1]).toEqual(boxes[0]);
  expect(await page.locator('.video-stage:visible video').evaluate((v: HTMLVideoElement) => { const r = v.getBoundingClientRect(); return Math.abs(r.width / r.height - v.videoWidth / v.videoHeight) < 0.01; })).toBe(true);
  await page.evaluate(() => { (window as unknown as { __crowd: boolean }).__crowd = true; });
  await expect(page.getByText(/這一段已結束並保存/)).toBeVisible();
  await expect(page.getByText('畫面中不只一人，請只留下受測者，才會開始量測。')).toBeVisible();
  await expect(page.getByText(/這一段共 \d+ 個取樣/)).toBeVisible(); // locked segment saved, never unlocked
  await page.evaluate(() => { (window as unknown as { __crowd: boolean }).__crowd = false; });
  await expect(page.getByText('量測中', { exact: true })).toBeVisible({ timeout: 10000 }); // new segment starts hands-free
  await page.getByRole('button', { name: '停止', exact: true }).click();
  await expect(page.getByLabel('選擇量測段')).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '下載 CSV', exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/^knee-live-.*\.csv$/);
  await page.getByRole('button', { name: '上傳影片', exact: true }).click();
  await expect(page.getByText('MP4 影片（最多 500 MB、10 分鐘）')).toBeVisible();
});
