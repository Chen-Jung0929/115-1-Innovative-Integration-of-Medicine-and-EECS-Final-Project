import { test, expect, type Page } from '@playwright/test';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expectAlignedPicture, makeSyntheticVideo, syntheticPose } from '../e2e/fixtures';
import { verifySite } from './site';

const official = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
let folder: string;
let video: string;
test.beforeAll(async () => {
  folder = await mkdtemp(join(tmpdir(), 'pages-smoke-'));
  video = join(folder, 'synthetic.mp4');
  makeSyntheticVideo(video);
});
test.afterAll(async () => { if (folder) await rm(folder, { recursive: true, force: true }); });

// Patch only the SDK factory in this browser context. All production application code,
// including asset resolution, HTTP, retry, hashing and exports, runs normally.
async function mockInference(page: Page) {
  const runtime = page.locator('link[rel=modulepreload][href*="/pose-runtime-"]');
  const url = await runtime.evaluate(node => (node as HTMLLinkElement).href);
  await page.evaluate(async ({ url, pose }) => {
    const sdk = await import(url);
    const landmarker = Object.values(sdk).find(value => typeof value === 'function' && 'POSE_CONNECTIONS' in value && 'createFromOptions' in value);
    if (!landmarker) throw new Error('PoseLandmarker export missing');
    Object.defineProperty(landmarker, 'createFromOptions', { value: async (files: { wasmBinaryPath: string }, options: { runningMode: string; baseOptions: { modelAssetBuffer: Uint8Array } }) => {
      if (options.runningMode !== 'VIDEO' || !options.baseOptions.modelAssetBuffer.byteLength ||
          !files.wasmBinaryPath.startsWith(new URL('mediapipe/wasm/', location.href).pathname)) {
        throw new Error('Unexpected production model initialization');
      }
      return { detectForVideo: () => ({ landmarks: [pose] }), close() {} };
    } });
  }, { url, pose: syntheticPose() });
}

async function downloadText(page: Page, name: RegExp) {
  const ready = page.waitForEvent('download');
  await page.getByRole('button', { name }).click();
  return readFile((await (await ready).path())!, 'utf8');
}

test('@smoke production HTML, bundles, local WASM and mode switch', async ({ page, baseURL }) => {
  await verifySite(page, baseURL!);
  await page.getByRole('button', { name: '即時鏡頭', exact: true }).click();
  await expect(page.getByRole('button', { name: '開啟鏡頭' })).toBeVisible();
  await page.getByRole('button', { name: '上傳影片', exact: true }).click();
  await expect(page.getByLabel('MP4 影片')).toBeAttached();
});

test('@smoke synthetic video retries download, renders and exports (mock inference)', async ({ page }) => {
  let requests = 0;
  await page.route(official, route => ++requests === 1 ? route.abort() :
    route.fulfill({ contentType: 'application/octet-stream', body: 'synthetic-model' }));
  await page.goto('./');
  await mockInference(page);
  await page.getByLabel('MP4 影片').setInputFiles(video);
  expect(requests).toBe(0);
  await page.getByRole('button', { name: '開始分析', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('模型載入失敗，請確認網路後重試');
  await page.getByRole('button', { name: '重試分析' }).click();
  await expect(page.getByText('分析完成；', { exact: false })).toBeVisible({ timeout: 25_000 });
  expect(requests).toBe(2);
  await expect(page.locator('.measurements .angle').first()).toHaveText(/°$/);
  await expect(page.locator('.chart .recharts-line-curve')).toHaveCount(2);
  const stage = page.locator('.video-stage:visible');
  expect(await stage.locator('.overlay').evaluate((canvas: HTMLCanvasElement) =>
    canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data.some((v, i) => i % 4 === 3 && v > 0))).toBe(true);
  for (const [width, height] of [[390,844], [768,1024], [1440,900]] as const) {
    await page.setViewportSize({ width, height });
    await expectAlignedPicture(stage, 320 / 180);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  }
  expect(await downloadText(page, /^下載 CSV$/)).toContain('"trunk_lean","midline"');
  const session = JSON.parse(await downloadText(page, /下載研究 JSON/));
  expect(session.samples).toHaveLength(10);
  expect(session.metadata.model.assetId).toBe(official);
  expect(session.samples[0].left.valid).toBe(true);
});

test('@smoke fake Chromium camera starts and releases its track (mock inference)', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'This test uses the Chromium fake camera');
  await page.route(official, route => route.fulfill({ body: 'synthetic-model' }));
  await page.goto('./');
  await mockInference(page);
  await page.getByRole('button', { name: '即時鏡頭', exact: true }).click();
  await page.getByRole('button', { name: '開啟鏡頭', exact: true }).click();
  await expect(page.getByText('量測中', { exact: true })).toBeVisible({ timeout: 20_000 });
  const track = await page.getByLabel('即時鏡頭畫面', { exact: true }).evaluateHandle((v: HTMLVideoElement) =>
    (v.srcObject as MediaStream).getVideoTracks()[0]);
  await page.getByRole('button', { name: '停止', exact: true }).click();
  await expect(page.getByRole('button', { name: '開啟鏡頭', exact: true })).toBeEnabled();
  expect(await track.evaluate(t => t?.readyState)).toBe('ended');
});

test('@smoke real SDK loads local WASM and rejects invalid model bytes', async ({ page, baseURL }) => {
  await page.route(official, route => route.fulfill({ body: 'invalid model' }));
  await page.goto('./');
  await page.getByLabel('MP4 影片').setInputFiles(video);
  const wasm = page.waitForResponse(r =>
    r.url().startsWith(new URL('mediapipe/wasm/', baseURL).href) && r.url().endsWith('.wasm') && r.ok());
  await page.getByRole('button', { name: '開始分析', exact: true }).click();
  await wasm;
  await expect(page.getByRole('alert')).toHaveText('模型載入失敗，請確認網路後重試');
  await expect(page.getByRole('button', { name: '重試分析' })).toBeEnabled();
});

test('@official real Google Lite download and MediaPipe inference on synthetic MP4', async ({ page }) => {
  await page.goto('./');
  await page.getByLabel('MP4 影片').setInputFiles(video);
  const downloaded = page.waitForResponse(r => r.url() === official && r.ok());
  await page.getByRole('button', { name: '開始分析', exact: true }).click();
  await downloaded;
  await expect(page.getByText('分析完成；', { exact: false })).toBeVisible({ timeout: 40_000 });
  const session = JSON.parse(await downloadText(page, /下載研究 JSON/));
  expect(session.metadata.model.assetId).toBe(official);
  expect(session.metadata.model.assetSha256).toBe('59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a');
  expect(session.samples).toHaveLength(10);
});
