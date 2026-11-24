import { test, expect } from '@playwright/test';
import { statSync } from 'node:fs';
// Chromium's built-in fake camera (synthetic test pattern, no person or face). Pose output is a
// synthetic adapter, so this checks wiring only, not MediaPipe accuracy on real people.
test.use({ permissions: ['camera'], launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'], ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) } });
test('live camera starts hands-free, ends a segment on a second person, restarts by itself, and exports', async ({ page }) => {
  await page.route('**/src/pose/mediapipe.ts', route => route.fulfill({ contentType: 'application/javascript', body: `
    export const MODEL_URL='https://example.invalid/synthetic';
    export const MODEL_VERSION='synthetic-adapter-test';
    export const MODEL_LOAD_ERROR='模型載入失敗，請確認網路後重試';
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
  await expect(page.getByText('畫面有其他人，這一段已結束並保存在下方。站回畫面中不動，會自動開始新的一段。')).toBeVisible();
  await expect(page.getByText('畫面中不只一人，請只留下受測者，才會開始量測。')).toBeVisible();
  await expect(page.getByText(/這一段共 \d+ 個取樣/)).toBeVisible(); // locked segment saved, never unlocked
  await page.evaluate(() => { (window as unknown as { __crowd: boolean }).__crowd = false; });
  await expect(page.getByText('量測中', { exact: true })).toBeVisible({ timeout: 10000 }); // new segment starts hands-free
  await page.waitForTimeout(1500); // let this segment record at least a second of video
  await page.getByRole('button', { name: '停止', exact: true }).click();
  await expect(page.getByLabel('選擇量測段')).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '下載 CSV', exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/^knee-live-.*\.csv$/);
  // Each segment is recorded twice on this device only: the raw camera picture and a copy with the skeleton drawn on.
  for (const [name, pattern] of [['下載影片（原始畫面）', /^video-live-[0-9a-f-]{36}\.(webm|mp4)$/], ['下載影片（含骨架）', /^video-live-skeleton-.*\.(webm|mp4)$/]] as const) {
    const button = page.getByRole('button', { name, exact: true });
    await expect(button).toBeVisible({ timeout: 10000 });
    const video = page.waitForEvent('download');
    await button.click();
    const file = await video;
    expect(file.suggestedFilename()).toMatch(pattern);
    const size = statSync(await file.path()).size;
    if (process.env.SAVE_VIDEOS) await file.saveAs(process.env.SAVE_VIDEOS + '/' + file.suggestedFilename());
    expect(size).toBeGreaterThan(1000);
  }
  // In-page playback of the recording, then the same full analysis view as an uploaded video.
  await expect(page.getByLabel('這一段的錄影')).toBeVisible();
  await page.getByRole('button', { name: '看原始畫面', exact: true }).click();
  await expect(page.getByRole('button', { name: '看原始畫面', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '用完整分析畫面看這一段', exact: true }).click();
  await expect(page.getByText('MP4 影片（最多 500 MB、10 分鐘）')).toBeVisible();
  await expect(page.getByText(/^live-.*\.mp4 · /)).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/分析完成/)).toBeVisible({ timeout: 60000 });
  // Saved live segments survive the trip to the upload view.
  await page.getByRole('button', { name: '即時鏡頭', exact: true }).click();
  await expect(page.getByLabel('選擇量測段')).toBeVisible();
  await expect(page.getByRole('button', { name: '下載影片（原始畫面）', exact: true })).toBeVisible();
});

test('camera downloads only on start and retries a failed model request', async ({ page }) => {
  let requests = 0;
  await page.route('https://storage.googleapis.com/**', route => { requests++; return route.abort(); });
  await page.goto('/');
  await page.getByRole('button', { name: '即時鏡頭', exact: true }).click();
  expect(requests).toBe(0);
  await page.getByRole('button', { name: '開啟鏡頭' }).click();
  await expect(page.getByRole('alert')).toHaveText('模型載入失敗，請確認網路後重試');
  await page.getByRole('button', { name: '重試開啟鏡頭' }).click();
  await expect(page.getByRole('alert')).toHaveText('模型載入失敗，請確認網路後重試');
  expect(requests).toBe(2);
});

// iPadOS reports itself as a Mac, and some tablets ignore an ideal facingMode and always return the front camera.
// The switch must depend only on the number of cameras, never on phone detection.
test.describe('tablet with front and rear cameras', () => {
  test.use({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15', viewport: { width: 1024, height: 1366 } });
  test('opens the rear camera even when facingMode is ignored, and switches front/rear while live', async ({ page }) => {
    await page.addInitScript(() => {
      const md = navigator.mediaDevices, real = md.getUserMedia.bind(md);
      const log: MediaStreamConstraints[] = []; (window as unknown as { __constraints: MediaStreamConstraints[] }).__constraints = log;
      md.enumerateDevices = async () => [{ deviceId: 'front', kind: 'videoinput', label: 'Front Camera', groupId: '1' }, { deviceId: 'back', kind: 'videoinput', label: 'Back Camera', groupId: '2' }] as MediaDeviceInfo[];
      md.getUserMedia = async (c?: MediaStreamConstraints) => {
        log.push(c!);
        const v = c?.video as MediaTrackConstraints, id = (v.deviceId as ConstrainDOMStringParameters | undefined)?.exact === 'back' ? 'back' : 'front';
        const stream = await real({ video: true });
        const track = stream.getVideoTracks()[0]!, settings = track.getSettings.bind(track);
        track.getSettings = () => ({ ...settings(), deviceId: id, facingMode: id === 'back' ? 'environment' : 'user' });
        return stream;
      };
    });
    await page.route('**/src/pose/mediapipe.ts', route => route.fulfill({ contentType: 'application/javascript', body: `
      export const MODEL_URL='https://example.invalid/synthetic';
      export const MODEL_VERSION='synthetic-adapter-test';
      export const MODEL_LOAD_ERROR='模型載入失敗，請確認網路後重試';
      export async function modelBytes(){return {bytes:new Uint8Array(),hash:'synthetic',id:'synthetic'};}
      export async function createPoseEngine(){let previous=-1;return {close(){},detect(canvas,time){
        if(time<=previous)throw new Error('non-monotonic timestamp');previous=time;
        const pose=Array.from({length:33},()=>({x:.5,y:.4,visibility:1}));
        for(const [i,x,y] of [[11,.4,.2],[12,.6,.2],[23,.4,.5],[24,.6,.5],[25,.45,.7],[26,.6,.7],[27,.4,.9],[28,.6,.9]])pose[i]={x,y,visibility:1};
        const crowd=window.__crowd===true;return crowd?[pose,pose.map(p=>({...p,x:p.x-.3}))]:[pose];
      }};}` }));
    await page.goto('/');
    await page.getByRole('button', { name: '即時鏡頭', exact: true }).click();
    await page.getByLabel('鏡頭方向').selectOption('environment');
    await page.getByRole('button', { name: '開啟鏡頭', exact: true }).click();
    const toFront = page.getByRole('button', { name: '切換到前鏡頭', exact: true });
    await expect(toFront).toBeVisible({ timeout: 15000 });
    const last = () => page.evaluate(() => { const l = (window as unknown as { __constraints: MediaStreamConstraints[] }).__constraints; return l[l.length - 1]!.video as MediaTrackConstraints; });
    expect((await last()).deviceId).toEqual({ exact: 'back' }); // retried with the rear camera's id
    await expect(page.locator('.video-stage:visible')).not.toHaveClass(/mirrored/); // rear camera is not mirrored
    await toFront.click();
    await expect(page.getByText('已切換到前鏡頭。前一段（如果有）已保存在下方。')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.video-stage:visible')).toHaveClass(/mirrored/);
    expect((await last()).facingMode).toEqual({ ideal: 'user' });
    await page.getByRole('button', { name: '切換到後鏡頭', exact: true }).click();
    await expect(page.getByText('已切換到後鏡頭。前一段（如果有）已保存在下方。')).toBeVisible({ timeout: 15000 });
    expect((await last()).deviceId).toEqual({ exact: 'back' });
  });
  test('two cameras that do not say which way they face: switching keeps the same camera and hides the button', async ({ page }) => {
    await page.addInitScript(() => {
      const md = navigator.mediaDevices, real = md.getUserMedia.bind(md);
      md.enumerateDevices = async () => [{ deviceId: 'cam', kind: 'videoinput', label: 'Integrated Camera', groupId: '1' }, { deviceId: 'virt', kind: 'videoinput', label: 'OBS Virtual Camera', groupId: '2' }] as MediaDeviceInfo[];
      md.getUserMedia = async () => {
        const stream = await real({ video: true });
        const track = stream.getVideoTracks()[0]!, settings = track.getSettings.bind(track);
        track.getSettings = () => { const s = settings(); delete s.facingMode; return { ...s, deviceId: 'cam' }; };
        return stream;
      };
    });
    await page.route('**/src/pose/mediapipe.ts', route => route.fulfill({ contentType: 'application/javascript', body: `
      export const MODEL_URL='https://example.invalid/synthetic';
      export const MODEL_VERSION='synthetic-adapter-test';
      export const MODEL_LOAD_ERROR='模型載入失敗，請確認網路後重試';
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
    await page.getByRole('button', { name: '切換到後鏡頭', exact: true }).click({ timeout: 15000 });
    await expect(page.getByText('這台裝置分不出前後鏡頭，仍是同一顆鏡頭。前一段（如果有）已保存在下方。')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.video-stage:visible')).toHaveClass(/mirrored/); // still the front-style mirror
    await expect(page.getByRole('button', { name: /切換到/ })).toHaveCount(0);
  });
});
