import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
let folder: string;
let synthetic: string;
test.beforeAll(() => {
  folder = mkdtempSync(join(tmpdir(), 'knee-smoke-'));
  synthetic = join(folder, 'synthetic-no-human.mp4');
  execFileSync('ffmpeg', ['-v','error','-f','lavfi','-i','color=c=blue:s=320x180:r=25:d=1','-c:v','libx264','-pix_fmt','yuv420p',synthetic]);
});
test.afterAll(() => rmSync(folder, { recursive: true, force: true }));

test('real browser decodes an MP4, seeks deterministically and reports corrupted uploads', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.getByLabel('MP4 影片').setInputFiles(synthetic);
  await expect(page.locator('.file-info')).toContainText('320 × 180');
  const result = await page.evaluate(async () => {
    // Browser test imports the real source decoder, not a mocked video API.
    const { loadVideo, seekFrame, releaseVideo } = await import('/src/input/video.ts');
    const v = document.createElement('video'); document.body.append(v);
    const signal = new AbortController().signal;
    try {
      await loadVideo(v, document.querySelector('video')!.src, signal);
      const times: number[] = [];
      for (const seconds of [0,.2,.4,.6,.8]) times.push(await seekFrame(v, seconds, signal));
      return times;
    } finally { releaseVideo(v); }
  });
  expect(result).toEqual([0,200,400,600,800]);
  await page.getByLabel('MP4 影片').setInputFiles({ name: 'broken.mp4', mimeType: 'video/mp4', buffer: Buffer.from('not a video') });
  await expect(page.getByRole('alert')).toContainText('無法解碼影片');
  await expect(page.getByRole('button', { name: '開始分析' })).toBeDisabled();
  expect(errors).toEqual([]);
});

test('model network failure is explicit and does not produce results', async ({ page }) => {
  await page.route('https://storage.googleapis.com/**', route => route.fulfill({ status: 403, body: 'blocked for network failure test' }));
  await page.goto('/'); await page.getByLabel('MP4 影片').setInputFiles(synthetic);
  await page.getByText('模型設定與資料隱私').click();
  await page.getByLabel('本機模型不存在時').check();
  await page.getByRole('button', { name: '開始分析' }).click();
  await expect(page.getByRole('alert')).toContainText('官方模型下載失敗');
  await expect(page.getByRole('button', { name: '下載 CSV' })).toHaveCount(0);
});

test('synthetic pose adapter: pipeline, gaps, chart, CSV, reanalysis and selection', async ({ page }) => {
  // ONLY an integration fixture. Never evidence of MediaPipe or real-human accuracy.
  await page.route('**/src/pose/mediapipe.ts', route => route.fulfill({ contentType: 'application/javascript', body: `
    export const MODEL_URL='https://example.invalid/synthetic';
    export const MODEL_VERSION='synthetic-adapter-test';
    export const PROJECT_MODEL_URL='/models/pose_landmarker_lite.task';
    export async function modelBytes() { return {bytes:new Uint8Array(),hash:'synthetic',id:'synthetic'}; }
    export async function createPoseEngine() {
      let count=0, previous=-1;
      return {close(){},detect(canvas,time){
        if(time<=previous) throw new Error("non-monotonic timestamp"); previous=time;
        if(count++===1) return [];
        const p=Array.from({length:33},()=>({x:.5,y:.5,visibility:1}));
        p[23]={x:.1,y:.5,visibility:1}; p[27]={x:.5,y:.1,visibility:1};
        p[24]={x:.1,y:.5,visibility:1}; p[28]={x:.9,y:.5,visibility:1};
        return p;
      }};
    }
  ` }));
  const errors: string[]=[]; page.on('pageerror', e=>errors.push(e.message));
  const outgoing: string[]=[]; page.on('request', r => { if (!new URL(r.url()).hostname.match(/^(127\.0\.0\.1|localhost)$/) && !r.url().startsWith('blob:')) outgoing.push(r.url()); });
  await page.goto('/'); await page.getByLabel('MP4 影片').setInputFiles(synthetic);
  await page.getByRole('button', { name:'開始分析' }).click();
  await expect(page.getByText('分析完成；', { exact:false })).toBeVisible();
  await expect(page.getByText('已分析 5 個不重複影格', { exact:false })).toBeVisible();
  await expect(page.locator('.measurements')).toContainText('80.0%');
  await expect(page.getByRole('img', { name: /左右膝影像/ })).toBeVisible();
  await page.getByLabel('已分析取樣', { exact:true }).fill('1');
  await expect(page.locator('.measurements')).toContainText('missing-landmark');
  await page.getByLabel('已分析取樣', { exact:true }).fill('2');
  await expect(page.locator('.measurements')).toContainText('90.0°');
  await expect(page.locator('.recharts-line-curve')).toHaveCount(2);
  expect(await page.locator('canvas.overlay').evaluate((canvas: HTMLCanvasElement) => {
    const data = canvas.getContext('2d')!.getImageData(0,0,canvas.width,canvas.height).data;
    return data.some((v,i) => i % 4 === 3 && v > 0);
  })).toBe(true);
  await page.screenshot({path:'test-results/synthetic-ui.png',fullPage:true});
  await page.getByLabel('顯示側別').selectOption('left');
  await expect(page.locator('.measurements article')).toHaveCount(1);
  const pending=page.waitForEvent('download'); await page.getByRole('button',{name:'下載 CSV',exact:true}).click();
  const download=await pending; const text=readFileSync((await download.path())!, 'utf8');
  expect(text.split('\r\n')).toHaveLength(12); expect(text).toContain('missing-landmark'); expect(text).toContain('synthetic-adapter-test');
  const jsonDownload=page.waitForEvent('download'); await page.getByRole('button',{name:/下載研究 JSON/}).click();
  const first=JSON.parse(readFileSync((await (await jsonDownload).path())!, 'utf8'));
  await page.getByRole('button',{name:'重新分析'}).click(); await expect(page.getByText('分析完成；',{exact:false})).toBeVisible();
  const secondDownload=page.waitForEvent('download'); await page.getByRole('button',{name:/下載研究 JSON/}).click();
  const second=JSON.parse(readFileSync((await (await secondDownload).path())!, 'utf8'));
  expect(first.samples).toEqual(second.samples); expect(first.metadata.sessionId).not.toBe(second.metadata.sessionId);
  await page.locator('video').evaluate((v: HTMLVideoElement) => {v.currentTime=.12;});
  await expect(page.locator('.measurements .angle').first()).toHaveText('N/A');
  expect(errors).toEqual([]); expect(outgoing).toEqual([]);
});

test('actual MediaPipe on an approved local human MP4 (requires supplied assets)', async ({ page }) => {
  test.skip(!process.env.POSE_MODEL_PATH || !process.env.POSE_VIDEO_PATH, 'No approved model / real-human MP4 provided');
  await page.goto('/'); await page.getByLabel('MP4 影片').setInputFiles(process.env.POSE_VIDEO_PATH!);
  await page.getByText('模型設定與資料隱私').click();
  await page.getByLabel('本機 .task 模型').setInputFiles(process.env.POSE_MODEL_PATH!);
  await page.getByRole('button',{name:'開始分析'}).click();
  await expect(page.getByRole('button',{name:'下載 CSV',exact:true})).toBeVisible({timeout:80000});
  const pending=page.waitForEvent('download'); await page.getByRole('button',{name:/下載研究 JSON/}).click();
  const result=JSON.parse(readFileSync((await (await pending).path())!, 'utf8'));
  expect(result.samples.some((s: {left:{valid:boolean};right:{valid:boolean}})=>s.left.valid || s.right.valid)).toBe(true);
});


test('actual MediaPipe adapter loads local WASM and rejects an invalid task model', async ({ page }) => {
  const wasm: string[] = [];
  page.on('response', r => { if (r.url().includes('/mediapipe/wasm/') && r.url().endsWith('.wasm') && r.status() === 200) wasm.push(r.url()); });
  await page.goto('/'); await page.getByLabel('MP4 影片').setInputFiles(synthetic);
  await page.getByText('模型設定與資料隱私').click();
  await page.getByLabel('本機 .task 模型').setInputFiles({name:'invalid.task',mimeType:'application/octet-stream',buffer:Buffer.from('invalid task model')});
  await page.getByRole('button',{name:'開始分析'}).click();
  await expect(page.getByRole('alert')).toBeVisible({timeout:30000});
  await expect(page.getByRole('button',{name:'開始分析'})).toBeEnabled();
  expect(wasm.length).toBeGreaterThan(0);
  expect(wasm.every(url => url.startsWith('http://127.0.0.1:5190/'))).toBe(true);
  await expect(page.getByRole('button',{name:'下載 CSV',exact:true})).toHaveCount(0);
});


test('missing local model keeps app usable and never downloads without opt-in', async ({ page }) => {
  let remote = 0;
  await page.route('https://storage.googleapis.com/**', route => { remote++; return route.abort(); });
  await page.goto('/'); await page.getByLabel('MP4 影片').setInputFiles(synthetic);
  await page.getByRole('button',{name:'開始分析'}).click();
  await expect(page.getByRole('alert')).toContainText('找不到專案本機模型');
  await expect(page.getByRole('button',{name:'開始分析'})).toBeEnabled();
  await expect(page.getByLabel('MP4 影片')).toBeEnabled();
  expect(remote).toBe(0);
});
