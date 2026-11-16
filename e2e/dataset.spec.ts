import { test, expect, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
async function selectRoi(page:Page) {
  await page.getByRole('button',{name:'框選受測者',exact:true}).click();
  await page.getByRole('button',{name:'確認 ROI（Apply）',exact:true}).click();
}
async function mockPose(page:Page) {
  await page.route('**/src/pose/mediapipe.ts', route => route.fulfill({contentType:'application/javascript',body:`
    export const MODEL_URL='https://example.invalid/synthetic';
    export const MODEL_VERSION='synthetic-adapter-test';
    export const PROJECT_MODEL_URL='/models/pose_landmarker_lite.task';
    export async function modelBytes(){return {bytes:new Uint8Array(),hash:'synthetic',id:'synthetic'};}
    export async function createPoseEngine(bytes,numPoses=1){
      if(numPoses===2&&new URLSearchParams(location.search).get('case')==='adaptive-search-error')throw new Error('synthetic search unavailable');
      let count=0,previous=-1;return {close(){},detect(canvas,time){
      if(time<=previous)throw new Error('non-monotonic timestamp'); previous=time;
      const i=count++,scenario=new URLSearchParams(location.search).get('case');
      if(i===1&&scenario==='lost')return [];
      const p=Array.from({length:33},()=>({x:.5,y:.4,visibility:1}));
      for(const [n,x,y]of [[11,.4,.2],[12,.6,.2],[23,.4,.5],[24,.6,.5],[25,.4,.7],[26,.6,.7],[27,.4,.9],[28,.6,.9]])p[n]={x,y,visibility:1};
      if(i===1&&scenario==='switch')p.forEach(p=>p.x+=.3);
      if(i===1&&scenario==='mixed')p[25].y=.51;
      if(scenario==='adaptive'&&numPoses===1)p.forEach(p=>p.x+=i*.02);
      if(numPoses===2&&scenario==='adaptive-ambiguous')return [p,p.map(p=>({...p,x:p.x+.04}))];
      if(i===1&&!scenario){p[25].visibility=.1;p[26].visibility=.1;}
      return [p];
    }}};
  `}));
}
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
  await page.getByLabel('MP4 影片').setInputFiles(synthetic); await selectRoi(page);
  await expect(page.locator('.file-info')).toContainText('320 × 180');
  const result = await page.evaluate(async () => {
    // Browser test imports the real source decoder, not a mocked video API.
    const { loadVideo, seekFrame, releaseVideo } = await import('/src/input/video.ts');
    const v = document.createElement('video'); document.body.append(v);
    const signal = new AbortController().signal;
    try {
      await loadVideo(v, document.querySelector('video')!.src, signal);
      const times: number[] = [];
      for (const seconds of [0,.2,.4,.6,.8]) times.push((await seekFrame(v, seconds, signal)).sourceTimeMs);
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
  await page.goto('/'); await page.getByLabel('MP4 影片').setInputFiles(synthetic); await selectRoi(page);
  await page.getByText('模型設定與資料隱私').click();
  await page.getByLabel('本機模型不存在時').check();
  await page.getByRole('button', { name: '開始分析' }).click();
  await expect(page.getByRole('alert')).toContainText('官方模型下載失敗');
  await expect(page.getByRole('button', { name: '下載 CSV' })).toHaveCount(0);
});

test('synthetic pose adapter: pipeline, gaps, chart, CSV, reanalysis and selection', async ({ page }) => {
  // ONLY an integration fixture. Never evidence of MediaPipe or real-human accuracy.
  await mockPose(page);
  const errors: string[]=[]; page.on('pageerror', e=>errors.push(e.message));
  const outgoing: string[]=[]; page.on('request', r => { if (!new URL(r.url()).hostname.match(/^(127\.0\.0\.1|localhost)$/) && !r.url().startsWith('blob:')) outgoing.push(r.url()); });
  await page.goto('/'); await page.getByLabel('MP4 影片').setInputFiles(synthetic); await selectRoi(page);
  await page.getByRole('button', { name:'開始分析' }).click();
  await expect(page.getByText('分析完成；', { exact:false })).toBeVisible();
  await expect(page.getByText('已分析 5 個取樣', { exact:false })).toBeVisible();
  await expect(page.locator('.measurements')).toContainText('80.0%');
  await expect(page.getByRole('img', { name: /左右膝影像/ })).toBeVisible();
  await page.getByLabel('已分析取樣', { exact:true }).fill('1');
  await expect(page.locator('.measurements')).toContainText('low-confidence');
  await page.getByLabel('已分析取樣', { exact:true }).fill('2');
  await expect(page.locator('.measurements')).toContainText('180.0°');
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
  expect(text.split('\r\n')).toHaveLength(12); expect(text).toContain('low-confidence'); expect(text).toContain('synthetic-adapter-test');
  const jsonDownload=page.waitForEvent('download'); await page.getByRole('button',{name:/下載研究 JSON/}).click();
  const first=JSON.parse(readFileSync((await (await jsonDownload).path())!, 'utf8'));
  await page.getByRole('button',{name:'重新分析'}).click(); await expect(page.getByText('分析完成；',{exact:false})).toBeVisible();
  const secondDownload=page.waitForEvent('download'); await page.getByRole('button',{name:/下載研究 JSON/}).click();
  const second=JSON.parse(readFileSync((await (await secondDownload).path())!, 'utf8'));
  expect(first.samples.map(({decode,...s}:any)=>s)).toEqual(second.samples.map(({decode,...s}:any)=>s)); expect(first.metadata.sessionId).not.toBe(second.metadata.sessionId);
  await page.locator('video').evaluate((v: HTMLVideoElement) => {v.currentTime=.12;});
  await expect(page.locator('.measurements .angle').first()).toHaveText('N/A');
  expect(errors).toEqual([]); expect(outgoing).toEqual([]);
});

test('actual MediaPipe on an approved local human MP4 (requires supplied assets)', async ({ page }) => {
  test.skip(!process.env.POSE_MODEL_PATH || !process.env.POSE_VIDEO_PATH, 'No approved model / real-human MP4 provided');
  await page.goto('/'); await page.getByLabel('MP4 影片').setInputFiles(process.env.POSE_VIDEO_PATH!); await selectRoi(page);
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
  await page.goto('/'); await page.getByLabel('MP4 影片').setInputFiles(synthetic); await selectRoi(page);
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
  await page.goto('/'); await page.getByLabel('MP4 影片').setInputFiles(synthetic); await selectRoi(page);
  await page.getByRole('button',{name:'開始分析'}).click();
  await expect(page.getByRole('alert')).toContainText('找不到專案本機模型');
  await expect(page.getByRole('button',{name:'開始分析'})).toBeEnabled();
  await expect(page.getByLabel('MP4 影片')).toBeEnabled();
  expect(remote).toBe(0);
});

for(const scenario of ['lost','switch','mixed']) {
  test(`synthetic multi-person ${scenario}: reject, retain raw evidence, annotate and reselect`,async({page})=>{
    await mockPose(page);await page.goto(`/?case=${scenario}`);
    await page.getByLabel('MP4 影片').setInputFiles(synthetic);await selectRoi(page);
    await page.getByRole('button',{name:'開始分析',exact:true}).click();
    await expect(page.getByText('分析完成；',{exact:false})).toBeVisible();
    await expect(page.locator('.measurements')).toContainText(scenario==='lost'?'60.0%':'20.0%');
    await page.getByLabel('已分析取樣',{exact:true}).fill('1');
    await expect(page.locator('.measurements')).toContainText(scenario==='lost'?'target-lost':'identity-uncertain');
    await page.getByLabel('已分析取樣',{exact:true}).fill('2');
    await expect(page.locator('.measurements')).toContainText('identity-uncertain');
    expect(await page.locator('canvas.overlay').evaluate((c:HTMLCanvasElement)=>c.getContext('2d')!.getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4===3&&v>0))).toBe(false);
    await page.getByLabel('顯示被拒絕骨架供人工檢查',{exact:false}).check();
    expect(await page.locator('canvas.overlay').evaluate((c:HTMLCanvasElement)=>c.getContext('2d')!.getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4===3&&v>0))).toBe(true);
    await page.getByLabel('人工人物判斷').selectOption('wrong-target');
    await page.getByLabel('人工人物代碼',{exact:false}).fill('person-B');
    const exported=page.waitForEvent('download');await page.getByRole('button',{name:/下載研究 JSON/}).click();
    const result=JSON.parse(readFileSync((await(await exported).path())!,'utf8'));
    expect(result.samples[2].candidates[0].cropLandmarks).toHaveLength(33);
    expect(result.samples[2].review.label).toBe('wrong-target');expect(result.samples[2].left.valid).toBe(false);
    expect(result.samples.map((s:{sourceTimeMs:number})=>s.sourceTimeMs)).toEqual([0,200,400,600,800]);
    const priorSelection=result.subjectSelection.id;
    await page.getByRole('button',{name:'重新選擇受測者／微調 ROI',exact:true}).click();
    await expect(page.getByRole('button',{name:'下載 CSV',exact:true})).toHaveCount(1);
    await page.getByLabel('ROI x',{exact:true}).fill('80');await page.getByLabel('ROI width',{exact:true}).fill('160');
    await page.getByRole('button',{name:'確認 ROI（Apply）',exact:true}).click();
    await page.getByRole('button',{name:'開始分析',exact:true}).click();
    await expect(page.getByText('分析完成；',{exact:false})).toBeVisible();
    const second=page.waitForEvent('download');await page.getByRole('button',{name:/下載研究 JSON/}).click();
    const reselected=JSON.parse(readFileSync((await(await second).path())!,'utf8'));
    expect(reselected.subjectSelection.id).not.toBe(priorSelection);
    expect(reselected.subjectSelection.roi).toEqual({x:80,y:0,width:160,height:180});
    expect(reselected.metadata.sourceWidthPx).toBe(320);
    expect(reselected.samples[0].landmarks[23].x).toBeCloseTo(.45);
    expect(reselected.samples[0].left.valid).toBe(true);
    expect(reselected.samples.every((s:{review?:unknown})=>!s.review)).toBe(true);
  });
}

test('human wrong-target annotation suppresses final CSV validity but counts auto false-valid',async({page})=>{
 await mockPose(page);await page.goto('/');await page.getByLabel('MP4 影片').setInputFiles(synthetic);await selectRoi(page);
 await page.getByRole('button',{name:'開始分析',exact:true}).click();await expect(page.getByText('分析完成；',{exact:false})).toBeVisible();
 await page.getByLabel('已分析取樣',{exact:true}).fill('2');
 await page.getByLabel('人工人物判斷').selectOption('wrong-target');await page.getByLabel('人工人物代碼',{exact:false}).fill('person-B');
 await expect(page.locator('.measurements .angle').first()).toHaveText('N/A');
 const pending=page.waitForEvent('download');await page.getByRole('button',{name:'下載人工檢查指標 JSON',exact:true}).click();
 const report=JSON.parse(readFileSync((await(await pending).path())!,'utf8'));
 expect(report.metrics.falseValidRate).toBe(1);expect(report.metrics.targetAccuracy).toBe(0);expect(report.metrics.subjectSwitchCount).toBeNull();
 await page.getByLabel('已分析取樣',{exact:true}).fill('0');await page.getByLabel('人工人物判斷').selectOption('correct-target');
 await page.getByLabel('已分析取樣',{exact:true}).fill('1');await page.getByLabel('人工人物判斷').selectOption('wrong-target');await page.getByLabel('人工人物代碼',{exact:false}).fill('person-B');
 const next=page.waitForEvent('download');await page.getByRole('button',{name:'下載人工檢查指標 JSON',exact:true}).click();
 const m=JSON.parse(readFileSync((await(await next).path())!,'utf8')).metrics;
 expect(m.subjectSwitchCount).toBe(1);expect(m.comparableIdentityPairs).toBe(2);
});

test('manual drag selects ROI in original video pixels and requires confirmation',async({page})=>{
 await page.goto('/');await page.getByLabel('MP4 影片').setInputFiles(synthetic);
 await expect(page.getByRole('button',{name:'開始分析',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'框選受測者',exact:true}).click();
 const selector=page.getByLabel('編輯受測者 ROI',{exact:true});await expect(selector).toBeVisible();await selector.scrollIntoViewIfNeeded();
 const bounds=(await selector.boundingBox())!;
 await page.mouse.move(bounds.x+bounds.width*.2,bounds.y+bounds.height*.1);await page.mouse.down();
 await page.mouse.move(bounds.x+bounds.width*.8,bounds.y+bounds.height*.9,{steps:8});await page.mouse.up();
 await expect(page.getByLabel('ROI x',{exact:true})).toHaveValue('64');await expect(page.getByLabel('ROI y',{exact:true})).toHaveValue('18');
 await expect(page.getByLabel('ROI width',{exact:true})).toHaveValue('192');await expect(page.getByLabel('ROI height',{exact:true})).toHaveValue('144');
 await page.getByRole('button',{name:'確認 ROI（Apply）',exact:true}).click();await expect(page.getByRole('button',{name:'開始分析',exact:true})).toBeEnabled();
});


test('decoder handles repeated zero and paused frame callbacks that never arrive',async({page})=>{
 await page.goto('/');await page.getByLabel('MP4 影片').setInputFiles(synthetic);
 const frames=await page.evaluate(async()=>{
  const {loadVideo,seekFrame,releaseVideo}=await import('/src/input/video.ts');
  const v=document.createElement('video');document.body.append(v);
  v.requestVideoFrameCallback=()=>1;v.cancelVideoFrameCallback=()=>{};
  const signal=new AbortController().signal;
  try{await loadVideo(v,document.querySelector('video')!.src,signal);const frames=[];
    for(const t of [0,0,.2,.2,.4,.2])frames.push(await seekFrame(v,t,signal));return frames;
  }finally{releaseVideo(v);}
 });
 expect(frames.map(f=>f.sourceTimeMs)).toEqual([0,0,200,200,400,200]);
 expect(frames.every(f=>f.timeBasis==='seek-position-estimate')).toBe(true);expect(frames[1].method).toBe('cached');
});

test('ROI draft is editable and cancelable; Apply preserves old session and marks it stale',async({page})=>{
 await mockPose(page);await page.goto('/');await page.getByLabel('MP4 影片').setInputFiles(synthetic);await selectRoi(page);
 await page.getByRole('button',{name:'開始分析',exact:true}).click();await expect(page.getByText('分析完成；',{exact:false})).toBeVisible();
 const json=page.waitForEvent('download');await page.getByRole('button',{name:/下載研究 JSON/}).click();const first=JSON.parse(readFileSync((await(await json).path())!,'utf8'));
 await page.getByRole('button',{name:'重新選擇受測者／微調 ROI',exact:true}).click();
 await page.getByLabel('ROI width',{exact:true}).fill('160');await page.getByLabel('ROI height',{exact:true}).fill('100');
 await expect(page.getByRole('button',{name:'下載 CSV',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Restore Previous',exact:true}).click();await expect(page.getByLabel('ROI width',{exact:true})).toHaveValue('320');
 await page.getByLabel('ROI width',{exact:true}).fill('160');await page.getByLabel('ROI height',{exact:true}).fill('100');
 const editor=page.getByLabel('編輯受測者 ROI',{exact:true});await editor.scrollIntoViewIfNeeded();const b=(await editor.boundingBox())!;
 await page.mouse.move(b.x+b.width*.2,b.y+b.height*.2);await page.mouse.down();await page.mouse.move(b.x+b.width*.3,b.y+b.height*.3,{steps:4});await page.mouse.up();
 await expect(page.getByLabel('ROI x',{exact:true})).toHaveValue('32');await expect(page.getByLabel('ROI y',{exact:true})).toHaveValue('18');
 const se=page.getByLabel('ROI se handle',{exact:true});const h=(await se.boundingBox())!;
 await page.mouse.move(h.x+h.width/2,h.y+h.height/2);await page.mouse.down();await page.mouse.move(h.x+h.width/2+b.width*.1,h.y+h.height/2+b.height*.1,{steps:4});await page.mouse.up();
 await expect(page.getByLabel('ROI width',{exact:true})).toHaveValue('192');await expect(page.getByLabel('ROI height',{exact:true})).toHaveValue('118');
 expect(await page.locator('video').evaluate((v:HTMLVideoElement)=>v.paused)).toBe(true);
 await page.getByRole('button',{name:'取消編輯',exact:true}).click();await expect(page.getByRole('button',{name:'下載 CSV',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'重新選擇受測者／微調 ROI',exact:true}).click();await expect(page.getByLabel('ROI width',{exact:true})).toHaveValue('320');
 await page.getByLabel('ROI width',{exact:true}).fill('200');await page.getByRole('button',{name:'確認 ROI（Apply）',exact:true}).click();
 await expect(page.getByText('舊分析已過期',{exact:false})).toBeVisible();await expect(page.getByRole('button',{name:'下載 CSV',exact:true})).toHaveCount(0);
 const old=page.waitForEvent('download');await page.getByRole('button',{name:'下載舊分析 JSON（原設定）',exact:true}).click();expect(JSON.parse(readFileSync((await(await old).path())!,'utf8'))).toEqual(first);
});

test('manual ROI keyframe reanalysis creates a new version and recovers only at explicit correction',async({page})=>{
 await mockPose(page);await page.goto('/?case=lost');await page.getByLabel('MP4 影片').setInputFiles(synthetic);await selectRoi(page);
 await page.getByRole('button',{name:'開始分析',exact:true}).click();await expect(page.getByText('分析完成；',{exact:false})).toBeVisible();
 const pending=page.waitForEvent('download');await page.getByRole('button',{name:/下載研究 JSON/}).click();const old=JSON.parse(readFileSync((await(await pending).path())!,'utf8'));
 await page.getByLabel('前往影片時間（秒）',{exact:true}).fill('.4');await page.getByRole('button',{name:'跳轉影片時間',exact:true}).click();
 await expect(page.getByText('來源影格時間：0.400',{exact:false})).toBeVisible();
 await page.getByRole('button',{name:'重新選擇受測者／微調 ROI',exact:true}).click();await page.getByLabel('ROI 方法',{exact:true}).selectOption('manual-keyframes');
 await page.getByLabel('ROI width',{exact:true}).fill('240');await page.getByRole('button',{name:'確認 ROI（Apply）',exact:true}).click();
 await expect(page.getByText('舊分析已過期',{exact:false})).toBeVisible();
 await page.getByRole('button',{name:'開始分析',exact:true}).click();await expect(page.getByText('分析完成；',{exact:false})).toBeVisible();
 const next=page.waitForEvent('download');await page.getByRole('button',{name:/下載研究 JSON/}).click();const newer=JSON.parse(readFileSync((await(await next).path())!,'utf8'));
 expect(newer.subjectSelection.keyframes.map((k:{timeMs:number})=>k.timeMs)).toEqual([0,400]);
 expect(newer.samples.map((s:{roi:{width:number}})=>s.roi.width)).toEqual([320,280,240,240,240]);
 expect(newer.samples[1].left.valid).toBe(false);expect(newer.samples[2].left.valid).toBe(true);
 expect(newer.analysisRevision.parentSessionId).toBe(old.metadata.sessionId);expect(newer.subjectSelection.revision).toBe(2);
 expect(old.subjectSelection.keyframes).toHaveLength(1);expect(newer.samples[2].roiUpdateReason).toContain('new-model');
});


for(const scenario of ['adaptive','adaptive-ambiguous','adaptive-search-error']) {
 test(`${scenario}: exports actual per-sample ROI, state and independent full-frame evidence`,async({page})=>{
  await mockPose(page);await page.goto(`/?case=${scenario}`);await page.getByLabel('MP4 影片').setInputFiles(synthetic);
  await page.getByRole('button',{name:'框選受測者',exact:true}).click();
  await page.getByLabel('ROI 方法',{exact:true}).selectOption('adaptive-roi');
  await page.getByLabel('ROI width',{exact:true}).fill('200');await page.getByLabel('ROI x',{exact:true}).fill('80');
  await page.getByRole('button',{name:'確認 ROI（Apply）',exact:true}).click();await page.getByRole('button',{name:'開始分析',exact:true}).click();
  await expect(page.getByText('分析完成；',{exact:false})).toBeVisible();
  const pending=page.waitForEvent('download');await page.getByRole('button',{name:/下載研究 JSON/}).click();
  const result=JSON.parse(readFileSync((await(await pending).path())!,'utf8'));
  expect(result.metadata.schemaVersion).toBe('6');expect(result.subjectSelection.method).toBe('adaptive-roi');
  expect(result.samples[0].search.numPoses).toBe(2);expect(result.samples[0].roi.width).toBe(200);
  if(scenario==='adaptive'){
   expect(result.samples.some((s:{roi:{x:number}})=>s.roi.x>80)).toBe(true);
   expect(result.samples.every((s:{tracking:{state:string};left:{valid:boolean}})=>s.tracking.state==='TRACKING'&&s.left.valid)).toBe(true);
  }else{
   expect(result.samples.every((s:{tracking:{state:string};left:{valid:boolean}})=>s.tracking.state==='MANUAL_REVIEW_REQUIRED'&&!s.left.valid)).toBe(true);
   expect(result.samples[0].search.status).toContain(scenario==='adaptive-ambiguous'?'ambiguous':'search-error');
  }
  const csvPending=page.waitForEvent('download');await page.getByRole('button',{name:'下載 CSV',exact:true}).click();
  const csv=readFileSync((await(await csvPending).path())!,'utf8');expect(csv).toContain('tracking_state');expect(csv).toContain('roi_update_reason');
 });
}

test('upload and ROI editor stay usable when all video-frame callbacks are suppressed',async({page})=>{
 await page.addInitScript(()=>{
  HTMLVideoElement.prototype.requestVideoFrameCallback=()=>1;
  HTMLVideoElement.prototype.cancelVideoFrameCallback=()=>{};
 });
 await mockPose(page);await page.goto('/');await page.getByLabel('MP4 影片').setInputFiles(synthetic);
 await expect(page.getByRole('button',{name:'框選受測者',exact:true})).toBeEnabled();await selectRoi(page);
 await page.getByRole('button',{name:'開始分析',exact:true}).click();await expect(page.getByText('分析完成；',{exact:false})).toBeVisible();
 const pending=page.waitForEvent('download');await page.getByRole('button',{name:/下載研究 JSON/}).click();
 const session=JSON.parse(readFileSync((await(await pending).path())!,'utf8'));
 expect(session.samples.map((s:{sourceTimeMs:number})=>s.sourceTimeMs)).toEqual([0,200,400,600,800]);
 expect(session.samples.every((s:{decode:{timeBasis:string}})=>s.decode.timeBasis==='seek-position-estimate')).toBe(true);
});
