import {fullFrameSelection} from '../input/singleSubject';
import {DEFAULT_PIPELINE,PIPELINE_NAMES,type PipelineId} from '../domain/pipeline';
import {comparePipelines,sha256File} from '../motion/compare';
import type {ComparisonBundle} from '../validation/comparison';
import {ComparisonPanel} from '../validation/ComparisonPanel';
import { useEffect, useMemo, useRef, useState } from 'react';
import { SAMPLING_HZ, samplingHzFrom, type Session } from '../domain/analysis';
import { MODEL_URL, PROJECT_MODEL_URL } from '../pose/mediapipe';
import { checkFile, loadVideo, seekFrame, observePresentedFrame } from '../input/video';
import { analyze } from '../motion/analyze';
import { coverage, matchingSample, displayedRoi, nearestSample, smoothedSample } from '../motion/series';
import { flexionProxy } from '../biomechanics/knee';
import { downloadFile, toCsv } from '../export/csv';
import { Overlay } from '../visualization/Overlay';
import type { Roi, SubjectSelection } from '../domain/tracking';
import { roiAt } from '../tracking/keyframes';
import { fitRoi } from '../tracking/editRoi';
import { checkedRoi } from '../tracking/roi';
import { RoiSelector } from '../visualization/RoiSelector';
import { ReviewPanel } from '../validation/ReviewPanel';
import { applyReview } from '../validation/targetMetrics';
import { AngleChart, CHART_METRICS, type ChartMetric } from '../visualization/AngleChart';
import { hipFlexionProxy } from '../biomechanics/posture';
import { Metric } from './Metric';
import { calibrationNote, liftSession, poseAt, sessionFlexion } from '../motion/world3d';
import { MANUAL_PITCH_RANGE, manualPitch, pitchLabel } from '../motion/devicePitch';
import { Skeleton3D } from '../visualization/Skeleton3D';
import { kneeToeNote, kneeToeValue, lockedBannerText, plainReason, qcStatus, showAngle, showFlexion, trackingNotices } from './plain';
import { frontalTimeline, type BaselineSource } from '../motion/frontalTimeline';
import { FrontalOverlay, FrontalCuePanel, FrontalLegend } from '../visualization/FrontalOverlay';
import { CUE_POLICY } from '../motion/frontalCues';
import { LivePanel } from './LivePanel';

export function App() {
  const [pipeline,setPipeline]=useState<PipelineId>(DEFAULT_PIPELINE.id);
  const [experiments,setExperiments]=useState(false);
  const [multiPoses,setMultiPoses]=useState<2|3>(2);
  const [comparison,setComparison]=useState<ComparisonBundle|null>(null);
  const sourceFile=useRef<File|null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const url = useRef<string | null>(null);
  const uiSeek=useRef<AbortController|null>(null);
  const task = useRef<AbortController | null>(null);
  const [info, setInfo] = useState<{ name: string; duration: number; width: number; height: number } | null>(null);
  const [model, setModel] = useState<File | null>(null);
  const [allowDownload, setAllowDownload] = useState(false);
  const [storedSession, setSession] = useState<Session | null>(null);
  const [stale,setStale]=useState(false);
  const [history,setHistory]=useState<Session[]>([]);
  const [draftMode,setDraftMode]=useState<SubjectSelection['method']>('manual-fixed-roi');
  const [editTimeMs,setEditTimeMs]=useState(0);
  const [navigation,setNavigation]=useState(0);
  const previousDraft=useRef<Roi>({x:0,y:0,width:640,height:360});
  const [drawNew,setDrawNew]=useState(true);
  const [busy, setBusy] = useState(false);
  const session=stale||busy?null:storedSession;
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, phase: '' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [timeMs, setTimeMs] = useState(0);
  const [seeking, setSeeking] = useState(false);
  const [side, setSide] = useState<'left' | 'right' | 'both'>('both');
  const [speed, setSpeed] = useState<number>(DEFAULT_SPEED);
  useEffect(() => { const v = video.current; if (v) { v.defaultPlaybackRate = speed; v.playbackRate = speed; } }, [speed]);
  const [selection,setSelection]=useState<SubjectSelection|null>(null);
  const [selecting,setSelecting]=useState(false);
  const [draft,setDraft]=useState<Roi>({x:0,y:0,width:640,height:360});
  const [diagnostic,setDiagnostic]=useState(false);
  const [sampleIndex, setSampleIndex] = useState(0);
  const [chartMetric,setChartMetric]=useState<ChartMetric>('knee');
  const [frontalView,setFrontalView]=useState(true);
  const [baselineSource,setBaselineSource]=useState<BaselineSource>('standing-trunk');
  const [obliqueRef,setObliqueRef]=useState(false);
  const [mode, setMode] = useState<'video' | 'camera'>('video');

  useEffect(() => {
    const v = video.current!;
    let id = 0, stopped = false;
    if (v.requestVideoFrameCallback) {
      const frame = (_: number, data: VideoFrameCallbackMetadata) => {
        if (stopped) return;
        observePresentedFrame(v,data.mediaTime); setTimeMs(data.mediaTime * 1000); setSeeking(v.seeking);
        id = v.requestVideoFrameCallback(frame);
      };
      id = v.requestVideoFrameCallback(frame);
    }
    return () => { stopped = true; if (id) v.cancelVideoFrameCallback(id); task.current?.abort(); uiSeek.current?.abort(); if (url.current) URL.revokeObjectURL(url.current); };
  }, []);

  async function choose(file: File | undefined) {
    if (!file || !video.current) return;
    task.current?.abort(); uiSeek.current?.abort();
    const controller = new AbortController(); task.current = controller;
    video.current.pause();
    sourceFile.current=file;setComparison(null);
    setSelection(null); setSelecting(false); setSession(null); setStale(false); setInfo(null); setError(''); setNotice(''); setBusy(false); setLoading(true); setTimeMs(0); setSeeking(true);
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = null;
    try {
      checkFile(file); url.current = URL.createObjectURL(file);
      await loadVideo(video.current, url.current, controller.signal);
      controller.signal.throwIfAborted();
      const defaultSelection=fullFrameSelection(video.current.videoWidth,video.current.videoHeight);
      setInfo({ name: file.name, duration: video.current.duration, width: video.current.videoWidth, height: video.current.videoHeight });
      setPipeline(DEFAULT_PIPELINE.id);setSelection(defaultSelection);
    } catch (e) {
      if (!controller.signal.aborted) { setError(message(e)); video.current.removeAttribute('src'); video.current.load(); if (url.current) URL.revokeObjectURL(url.current); url.current = null; }
    } finally { if (!controller.signal.aborted) {setLoading(false);setSeeking(false);} }
  }

  async function run() {
    if (!url.current || !info || !selection) return;
    task.current?.abort(); uiSeek.current?.abort();
    const controller = new AbortController(); task.current = controller;
    video.current?.pause(); setError(''); setNotice(''); setBusy(true); setSampleIndex(0);
    try {
      const sourceSha256=sourceFile.current?await sha256File(sourceFile.current):undefined;controller.signal.throwIfAborted();
      const result = await analyze(url.current, info.name, model, allowDownload, structuredClone(selection), controller.signal, (done, total, phase) => {
        if (!controller.signal.aborted) setProgress({ done, total, phase });
      },{pipeline:{id:pipeline,numPoses:pipeline==='full-frame-multi'?multiPoses:1},samplingHz:samplingHzFrom(location.search),...(sourceSha256?{sourceSha256}:{})});
      controller.signal.throwIfAborted(); if(storedSession)setHistory(h=>[...h,storedSession]);setSession({...result,analysisRevision:{...result.analysisRevision,parentSessionId:storedSession?.metadata.sessionId??null}});setStale(false);
      if (video.current && result.samples[0]) video.current.currentTime = result.samples[0].requestedTimeMs / 1000;
      setNotice('分析完成；播放不會再次推論。可用取樣滑桿檢查每個已分析影格。');
    } catch (e) { if (!controller.signal.aborted) setError(`${message(e)} 若模型下載受阻，可下載官方模型後選取本機 .task 檔。`); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  async function runComparison(){
    if(!url.current||!sourceFile.current||!selection)return;
    task.current?.abort();uiSeek.current?.abort();const controller=new AbortController();task.current=controller;
    video.current?.pause();setBusy(true);setError('');setNotice('');
    try{
      const bundle=await comparePipelines(url.current,sourceFile.current,model,allowDownload,selection,multiPoses,controller.signal,(done,total,phase)=>{if(!controller.signal.aborted)setProgress({done,total,phase});},undefined,samplingHzFrom(location.search));
      controller.signal.throwIfAborted();setComparison(bundle);
      const first=bundle.entries.find(e=>e.session)?.session;
      if(first){if(storedSession)setHistory(h=>[...h,storedSession]);setSession(first);setPipeline(first.run!.pipeline.id);setStale(false);setSampleIndex(0);void seekPlayback(0);}
      setNotice('同源比較完成。請依序檢查三種方法並分別人工標註；失敗方法保留錯誤，不填造結果。');
    }catch(e){if(!controller.signal.aborted)setError(message(e));}
    finally{if(!controller.signal.aborted)setBusy(false);}
  }
  function selectComparison(id:string){
    const selected=comparison?.entries.find(e=>e.session?.metadata.sessionId===id)?.session;
    if(selected){setSession(selected);setSelection(structuredClone(selected.subjectSelection));setPipeline(selected.run!.pipeline.id);if(selected.run!.pipeline.numPoses>1)setMultiPoses(selected.run!.pipeline.numPoses as 2|3);setStale(false);setSampleIndex(0);void seekPlayback(0);}
  }
  function restoreMainMode(){
    if(!info)return;
    setPipeline(DEFAULT_PIPELINE.id);setSelection(fullFrameSelection(info.width,info.height));setSelecting(false);
    if(storedSession)setStale(true);
    setNotice('已回到單人完整影格模式，請重新分析；原始完成結果仍可下載。');
  }
  function cancel() { task.current?.abort(); setBusy(false); setNotice('已取消分析；不保存部分結果，先前完成版本仍保留。'); }
  async function seekPlayback(seconds:number) {
    if(!video.current)return;
    uiSeek.current?.abort();const controller=new AbortController();uiSeek.current=controller;
    video.current.pause();setSeeking(true);
    try { const frame=await seekFrame(video.current,seconds,controller.signal);if(!controller.signal.aborted)setTimeMs(frame.sourceTimeMs); }
    catch(e){if(!controller.signal.aborted)setError(message(e));}
    finally{if(!controller.signal.aborted)setSeeking(false);}
  }
  function jump(index:number) {
    setSampleIndex(index);const sample=session?.samples[index];if(sample)void seekPlayback(sample.requestedTimeMs/1000);
  }
  function beginSelection() {
    if (!info || !video.current) return;
    const time=selection?Math.min(video.current.currentTime,info.duration-.001):0;setEditTimeMs(time*1000);void seekPlayback(time);setDraftMode(selection?.method??'manual-fixed-roi');
    setSelecting(true);setError('');setDrawNew(!selection||selection.correctionSource==='controlled-single-default');
    const applied=selection?((pipeline==='roi-crop'?displayedRoi(session?.samples??[],time*1000):null)??roiAt(selection,time*1000,info.width,info.height).roi):{x:0,y:0,width:info.width,height:info.height};previousDraft.current={...applied};setDraft({...applied});
    setNotice('編輯只變更草稿；Apply 前保留既有分析。請保留完整髖、膝、踝與活動空間。');
  }
  function confirmSelection() {
    if (!info) return;
    try {const roi=checkedRoi(draft,info.width,info.height);
      const time=draftMode==='manual-fixed-roi'?0:editTimeMs;
      const key={id:crypto.randomUUID(),timeMs:time,roi,source:'manual-target-confirmation' as const};
      const initial=selection?.keyframes.length?selection.keyframes:[{...key,timeMs:0,roi:selection?.roi??roi}];
      const keyframes=draftMode==='manual-fixed-roi'?[{...key,timeMs:0}]:[...initial.filter(k=>Math.abs(k.timeMs-time)>.001),key].sort((a,b)=>a.timeMs-b.timeMs);
      setSelection({id:crypto.randomUUID(),roi:{...keyframes[0]!.roi},method:draftMode,referenceTimeMs:0,keyframes:structuredClone(keyframes),interpolation:'linear-source-pixels-v1',revision:(selection?.revision??0)+1,parentSelectionId:selection?.id??null,correctionSource:!selection?'initial-selection':selection.method!==draftMode?'mode-change':draftMode!=='manual-fixed-roi'?'manual-keyframe':'manual-roi-edit'});
      if(storedSession)setStale(true);
      setSelecting(false);setError('');
    }catch(e){setError(message(e));}
  }
  const exact = session && !seeking ? (matchingSample(session.samples, timeMs) ?? (video.current?.paused ? session.samples.find(s=>s.decode.timeBasis==='seek-position-estimate' && Math.abs(s.requestedTimeMs-video.current!.currentTime*1000)<.001):undefined)) : undefined;
  // Between samples (playing or paused): show the closest analyzed frame (at most half an interval away) and say so.
  // Windows follow the session's own rate, so old 5 Hz sessions still display as before (ADR-081).
  const hz = session?.samplingHz && session.samplingHz > 0 ? session.samplingHz : SAMPLING_HZ;
  const held = !exact && session && !seeking ? nearestSample(session.samples, timeMs, nearestMs(hz)) : undefined;
  const sample = exact ?? held;
  // Drawing only: skeleton and check lines glide between samples; every number still comes from `sample`.
  const drawn = held && session ? smoothedSample(session.samples, timeMs, held, smoothMaxGapMs(hz)) : sample;
  const lift3d = useMemo(() => session ? liftSession(session.samples, session.metadata.sourceWidthPx, session.metadata.sourceHeightPx, session.cameraPitch?.deg) : null, [session]);
  const poses3d = lift3d?.poses ?? null;
  const pose3d = poses3d && session && sample ? (held ? poseAt(session.samples, poses3d, timeMs, held, smoothMaxGapMs(hz)) : poses3d.get(sample.sampleIndex)) : undefined;
  const heldGapS = held ? Math.abs(timeMs - (held.decode.timeBasis === 'presentation' ? held.sourceTimeMs : held.requestedTimeMs)) / 1000 : 0;
  const frontal = useMemo(() => session && info ? frontalTimeline(session.samples, info.width, info.height, baselineSource, obliqueRef) : [], [session, info, baselineSource, obliqueRef]);
  const frontalFrame = sample ? frontal.find(f => f.sampleIndex === sample.sampleIndex) : undefined;
  const notices = useMemo(() => session ? trackingNotices(session.samples, 'video') : null, [session]);
  const trackNotice = sample ? notices?.get(sample.sampleIndex) ?? null : null;
  // While a seek is in flight there is no sample yet: keep the last prompt instead of flashing "no result".
  const lastCue = useRef<{ frame: typeof frontalFrame; hasSample: boolean; notice: typeof trackNotice } | null>(null);
  const cue = seeking && lastCue.current ? lastCue.current : { frame: frontalFrame, hasSample: !!sample, notice: trackNotice };
  if (!seeking) lastCue.current = cue;
  // The whole-video calibration note is only true when the clip never had a live standing lock.
  const everStoodStill = useMemo(() => frontal.some(f => f.calibration === 'standing-lock'), [frontal]);
  const pct = (s: 'left' | 'right') => { const value = session ? coverage(session.samples, s) : null; return value === null ? 'N/A' : `${(value * 100).toFixed(1)}%`; };

  const knee = (s: 'left' | 'right') => sample?.[s];
  const sideName = (s: 'left' | 'right') => s === 'left' ? '左' : '右';
  const sides = (['left','right'] as const).filter(s => side === 'both' || side === s);

  return <div className="app">
    <header className="topbar"><div className="brand"><h1>關節動作分析</h1><p>深蹲 · 影像只在這台裝置上處理，不會上傳</p></div>
      <div className="segmented" role="group" aria-label="輸入來源">
        <button aria-pressed={mode==='video'} onClick={()=>setMode('video')}>上傳影片</button>
        <button aria-pressed={mode==='camera'} disabled={busy||loading||selecting} onClick={()=>{video.current?.pause();setMode('camera');}}>即時鏡頭</button>
      </div>
    </header>
    <main>
    {mode==='camera' && <LivePanel model={model} allowDownload={allowDownload} side={side} onSide={setSide} disabled={busy||loading} />}
    <div hidden={mode!=='video'}>
    <section className="card setup" aria-labelledby="input-title"><h2 id="input-title">選擇影片</h2>
      <div className="setup-row">
        <label className="file-pick"><span className="file-btn">選擇影片</span><span className="hint">MP4 影片（最多 500 MB、10 分鐘）</span><input type="file" accept=".mp4,video/mp4" disabled={busy || loading} onChange={e => { const f = e.currentTarget.files?.[0]; e.currentTarget.value = ''; void choose(f); }} /></label>
        <div className="actions"><button className="primary" disabled={!info || !selection || selecting || busy || loading} onClick={() => void run()}>{session ? '重新分析' : '開始分析'}</button>{busy && <button className="secondary" onClick={cancel}>取消分析</button>}</div>
      </div>
      {loading && <p role="status">讀取影片中…</p>}
      {info && <p className="file-info">{info.name} · {info.duration.toFixed(2)} 秒 · {info.width} × {info.height} 像素</p>}
      {busy && <div role="status" className="progress"><p>{progress.phase} · {progress.done} / {progress.total || '準備中'}</p><progress max={progress.total || 1} value={progress.done} /></div>}
      {error && <p role="alert" className="error">{error}</p>}{notice && <p role="status" className="notice">{notice}</p>}
      <p className="muted">適用：單人、鏡頭固定、頭到腳完整入鏡，不需框選。目前模式：{pipeline===DEFAULT_PIPELINE.id&&selection?.correctionSource==='controlled-single-default'?'單人完整影格（主要模式）':info?`${PIPELINE_NAMES[pipeline]}（實驗設定）`:'單人完整影格（主要模式）'}。</p>
      {info&&(pipeline!==DEFAULT_PIPELINE.id||selection?.correctionSource!=='controlled-single-default')&&<button className="secondary" disabled={busy||loading} onClick={restoreMainMode}>回到單人主要模式</button>}
      <details className="fold"><summary>模型設定與資料隱私</summary><p>影片不會上傳。預設先讀取專案本機模型；手動選取的 .task 檔優先。WASM 與已安裝 npm 版本一致，從本站載入，不使用外部 CDN。沒有模型時可改選本機檔案，其他介面仍可操作。</p>
        <p><a href={MODEL_URL} target="_blank" rel="noreferrer">官方 Lite 模型下載</a>（模型來源與 SHA-256 會記錄於研究 JSON）。</p>
        <label>本機 .task 模型<input type="file" accept=".task" disabled={busy} onChange={e => { setModel(e.target.files?.[0] ?? null); e.target.value = ''; if(storedSession)setStale(true); }} /></label>
        <button className="secondary" disabled={busy || !model} onClick={() => { setModel(null); if(storedSession)setStale(true); }}>改用專案本機模型</button>
        <label className="check"><input type="checkbox" checked={allowDownload} disabled={busy} onChange={e => setAllowDownload(e.target.checked)} />本機模型不存在時，允許從 Google 官方下載（選用）</label>
        <p>放置方式：將官方模型存成 public/models/pose_landmarker_lite.task，或直接從 Mac 選取檔案，不需上傳伺服器。</p>
        <p>目前模型：{model ? model.name : `專案本機路徑 ${PROJECT_MODEL_URL}`} 。本機模型須由使用者核對來源與授權。</p>
      </details>
    </section>
    {stale && storedSession && <aside className="banner" role="status">舊分析已過期（stale），請重新分析。舊設定的角度、圖表及一般匯出已隱藏。
      <button className="secondary" onClick={()=>downloadFile(`archived-${storedSession.metadata.sessionId}.json`,JSON.stringify(storedSession,null,2),'application/json')}>下載舊分析 JSON（原設定）</button></aside>}
    {history.length>0 && <details className="fold"><summary>先前分析存檔（不修改原始 session）</summary>{history.map(s=><p key={s.metadata.sessionId}><button className="secondary" onClick={()=>downloadFile(`archived-${s.metadata.sessionId}.json`,JSON.stringify(s,null,2),'application/json')}>下載 {s.metadata.sessionId}</button></p>)}</details>}
    <section className="card" aria-labelledby="review-title">
      <div className="card-head"><h2 id="review-title">動作檢查</h2>
        <div className="toolbar">
          <label className="switch"><input type="checkbox" role="switch" checked={frontalView} onChange={e=>setFrontalView(e.target.checked)} /><span>醫學組檢查線</span></label>
          {frontalView && <label className="compact">基準線位置<select aria-label="基準線位置" value={baselineSource} onChange={e=>setBaselineSource(e.target.value as BaselineSource)}><option value="standing-trunk">站直時的軀幹中線（預設）</option><option value="heel-midpoint">兩腳跟中點</option></select></label>}
          {frontalView && <label className="switch"><input type="checkbox" role="switch" checked={obliqueRef} onChange={e=>setObliqueRef(e.target.checked)} /><span>斜角也顯示（僅供參考）</span></label>}
          <label className="compact">顯示側別<select value={side} onChange={e => setSide(e.target.value as typeof side)}><option value="both">左右都看</option><option value="left">只看左邊</option><option value="right">只看右邊</option></select></label>
        </div>
      </div>
      {sample?.tracking.state==='MANUAL_REVIEW_REQUIRED'&&<aside className="banner warn">{lockedBannerText(trackNotice?.cause ?? 'lost-track', 'video', trackNotice?.sinceMs)}</aside>}
      <div className="workspace"><div className="stage-col"><div className="video-stage"><video ref={video} controls={!selecting} playsInline onPlay={()=>{if(selecting)video.current?.pause();}} onLoadedMetadata={e=>{e.currentTarget.defaultPlaybackRate=speed;e.currentTarget.playbackRate=speed;}} onSeeking={() => setSeeking(true)} onSeeked={() => {
        const v = video.current;
        if (!v) return;
        // Paused/off-screen videos may throttle rVFC. The same completed seek target
        // maps to the decoded frame recorded by the analysis decoder.
        const known = session?.samples.find(s => Math.abs(s.requestedTimeMs - v.currentTime * 1000) <= 1);
        setTimeMs(known?.sourceTimeMs ?? v.currentTime * 1000); setSeeking(false);
      }} onError={() => { if (info) { setError('影片播放解碼失敗，請改用 H.264 MP4。'); setSession(null); } }} /><Overlay sample={drawn} width={info?.width ?? 640} height={info?.height ?? 360} side={side} diagnostic={diagnostic} muted={frontalView && !!session && !selecting} />
      {frontalView && session && !selecting && <><FrontalOverlay sample={drawn} frame={frontalFrame} width={info?.width ?? 640} height={info?.height ?? 360} /></>}
      {selecting && info && !seeking && <RoiSelector width={info.width} height={info.height} roi={draft} onChange={setDraft} drawNew={drawNew} onDrawEnd={()=>setDrawNew(false)} />}
      {experiments && selection && info && !selecting && <svg className="roi-border" viewBox={`0 0 ${info.width} ${info.height}`} aria-label="受測者 ROI 範圍"><rect {...(pipeline==='roi-crop'?(sample?.roi??displayedRoi(session?.samples??[],timeMs)??roiAt(selection,timeMs,info.width,info.height).roi):(sample?.targetReferenceRoi??selection.roi))} fill="none" stroke="#ffda57" strokeWidth={Math.max(2,info.width/250)} /></svg>}
      {!info && !loading && <p className="stage-empty">選擇影片後，畫面會出現在這裡</p>}</div>
        {frontalView && session && !selecting && <FrontalCuePanel {...cue} />}
        {frontalView && session && !selecting && <FrontalLegend view={frontalFrame?.view} />}
        {frontalView && session && !selecting && frontalFrame?.calibration==='whole-video' && !everStoodStill && <p className="muted small">這段影片裡沒有「站直不動 1 秒」的片段，基準線改用整段影片中站得最直的幾格來定。</p>}
        {session && !selecting && <Skeleton3D sample={drawn} points={pose3d} note={calibrationNote(lift3d?.context)} pitchText={pitchLabel(session.cameraPitch)}>
          <label className="compact pitch-input">拍攝時手機俯角（°）<input type="number" inputMode="decimal" min={MANUAL_PITCH_RANGE.min} max={MANUAL_PITCH_RANGE.max} step={1} placeholder="未提供" disabled={session.cameraPitch?.source === 'device-orientation'}
            value={session.cameraPitch ? String(Math.round(session.cameraPitch.deg)) : ''} onChange={e => { if (!storedSession) return; const p = manualPitch(e.target.value); const { cameraPitch: _old, ...rest } = storedSession; setSession(p ? { ...rest, cameraPitch: p } : rest); }} /></label>
          <p className="muted small">影片檔沒有手機感測器資料。可在拍攝前用手機的水平儀 App 量俯角（鏡頭往下為正，0–30°）填在這裡，或改用「即時鏡頭」模式自動讀取；不填就照原本方式估計。</p>
        </Skeleton3D>}
        <div className="speed" role="group" aria-label="播放速度"><span className="muted small">播放速度</span><div className="segmented small-seg">{SPEEDS.map(r=><button key={r} aria-pressed={speed===r} onClick={()=>setSpeed(r)}>{r===1?'正常':`${r}×`}</button>)}</div></div>
        {session && <label className="scrub">逐格檢查<input aria-label="已分析取樣" type="range" min={0} max={session.samples.length-1} disabled={selecting} value={sampleIndex} onChange={e => jump(Number(e.target.value))} /><span className="muted">#{sampleIndex} / {session.samples.length-1}</span></label>}
        <p className="muted small">來源影格時間：{(timeMs/1000).toFixed(3)} 秒。{held ? `顯示最近的分析影格（取樣 #${held.sampleIndex}，相差 ${heldGapS.toFixed(2)} 秒；影片每秒分析 ${hz} 次）` : sample ? `對應取樣 #${sample.sampleIndex}（${sample.decode.timeBasis}）` : '這附近沒有分析結果（可能在分析範圍外），骨架與角度不顯示。'}</p>
      </div><div className="readout">
        <div className="group"><h3 className="group-title">膝蓋</h3>{(frontalFrame?.clipView ?? frontalFrame?.view) === 'frontal' && <p className="muted small">正面拍攝會低估膝彎曲；膝角度以側面拍攝較準。</p>}<div className="measurements">
        {sides.map(s => {
          const angle = knee(s);
          const w = angle?.valid ? sessionFlexion(poses3d, sample, 'knee', s) : null;
          return <Metric key={s} name={`${sideName(s)}膝彎曲`} value={showFlexion(angle, flexionProxy)} alt={w === null ? undefined : `3D 骨架 ${w.toFixed(0)}°`} note={angle?.valid ? '站直約 0°，蹲越低數字越大' : plainReason(angle, !!sample, trackNotice)}>
            <p>膝彎曲 = 180° − 膝角（自訂，採臨床習慣：站直 0°）。膝角 = 髖–膝–踝在膝蓋的夾角（影像平面，0–180°），內角：{showAngle(angle)}。</p><p>暫定屈曲 proxy：{angle?.valid ? `${flexionProxy(angle)!.toFixed(1)}°` : 'N/A'}（= 180° − 內角，不是已確認的臨床屈曲角）</p><p>Tracking Status：{qcStatus(angle, !!sample)}</p><p>有效取樣比例：{pct(s)}</p><p>3D 骨架（試驗）：{w === null ? 'N/A（這次分析沒有 3D 點，請重新分析）' : `${w.toFixed(1)}°`}。用混合式 3D 骨架（左右上下取自影片的 2D 點、前後深度取自 MediaPipe 3D 點；只有確認站直時才做站直校正）算同一個角度，比較不受拍攝角度影響。與 OpenCap 比對（2 位受試者）：整段誤差約 5–19°，站直時常多算 10–25°（為了不蓋掉真的膝蓋彎曲，站直校正最多只扣 10°），僅供比較（自訂）。</p></Metric>;
        })}
        </div></div>
        <div className="group"><h3 className="group-title">深蹲姿勢（暫定，待物理治療師確認）</h3><div className="posture-measurements">
        {sides.map(s => {
          const angle = sample?.posture?.final.hip[s];
          const w = angle?.valid ? sessionFlexion(poses3d, sample, 'hip', s) : null;
          return <Metric key={s} name={`${sideName(s)}髖彎曲`} value={showFlexion(angle, hipFlexionProxy)} alt={w === null ? undefined : `3D 骨架 ${w.toFixed(0)}°`} note={angle?.valid ? '站直約 0°，身體越往前折數字越大' : plainReason(angle, !!sample, trackNotice)}>
            <p>髖彎曲 = 180° − 髖角（自訂，站直 0°）。髖角 = 肩–髖–膝在髖的夾角（影像平面，0–180°），內角：{showAngle(angle)}。暫定髖屈曲 proxy：{angle?.valid ? `${hipFlexionProxy(angle)!.toFixed(1)}°` : 'N/A'}（= 180° − 內角）。</p><p>{qcStatus(angle, !!sample)}</p><p>3D 骨架（試驗）：{w === null ? 'N/A' : `${w.toFixed(1)}°`}（同一個肩–髖–膝角度改用 3D 骨架點計算，自訂）。3D 髖角只是近似值：MediaPipe 的髖點不是真正的髖關節中心，與 OpenCap 比對時不同受試者的偏差方向甚至相反（−14° 到 +25°），請勿當作臨床髖屈曲角。</p></Metric>;
        })}
        <Metric name="上身（軀幹）前傾" value={showAngle(sample?.posture?.final.trunkLean)} note={sample?.posture?.final.trunkLean.valid ? '0° = 上身直立' : plainReason(sample?.posture?.final.trunkLean, !!sample, trackNotice)}>
          <p>兩髖中點→兩肩中點連線與畫面垂直線的夾角（0° = 直立；手機需擺正）。</p><p>{qcStatus(sample?.posture?.final.trunkLean, !!sample)}</p></Metric>
        {sides.map(s => {
          const v = sample?.posture?.final.kneeToe[s];
          return <Metric key={`toe-${s}`} name={`${sideName(s)}膝對腳尖線`} value={kneeToeValue(v)} warn={!!v?.valid && v.value > CUE_POLICY.kneeToeHipWidths} note={kneeToeNote(v, frontalFrame?.view, !!sample, trackNotice)}>
            <p>膝蓋離「過腳尖的鉛垂線」多遠，以骨盆寬為單位；+ = 膝在內側（膝蓋內夾）。標準是在線上或微外側，且左右對稱；只適用正面拍攝。</p><p>{qcStatus(v, !!sample)}</p></Metric>;
        })}
        </div></div>
      </div></div>
      <details className="fold"><summary>畫面上的線和數字代表什麼？</summary>
        <p>膝彎曲（大數字與曲線）= 180° − 膝角，站直約 0°，蹲越低越大（自訂，採臨床習慣）。膝角定義：髖–膝–踝於膝點的影像平面內角（0–180°）。暫定屈曲 proxy = 180° − 內角；不是已確認的臨床屈曲角。左右為人體解剖側，影片不鏡像。</p>
        {frontalView && <p className="frontal-note">正面檢查說明：紅色直線是基準線。個案先站直、不動約 1 秒，系統以這段時間的軀幹中線（兩肩中點與兩髖中點）定出位置並固定；之後身體怎麼動線都不動，腳跟明顯移動才重新定位。也可切換成「兩腳跟中點」。拍攝角度太斜時預設不判斷；打開「斜角也顯示（僅供參考）」後斜角影片也會畫線與提示，但 2D 投影誤差大、僅供參考。黃線為目前的兩肩線、骨盆線（以髖關節代替 ASIS），白色虛線是「站直時」的肩線／骨盆線，兩條線張開代表變歪了；藍色虛線為軀幹，綠色虛線為過腳尖的鉛垂線；偏離時變紅並出現提示。綠色骨架在此模式下會淡化。左右指個案本身的左右。提示門檻為暫定值（頭 {CUE_POLICY.headHipWidths} 個骨盆寬、肩 {CUE_POLICY.shoulderDeg}°、軀幹 {CUE_POLICY.trunkDeg}°、骨盆 {CUE_POLICY.pelvisDeg}°、膝 {CUE_POLICY.kneeToeHipWidths} 個骨盆寬），待醫學組確認；只適用正面拍攝，皆為 2D 影像平面幾何。</p>}
        <p>姿勢指標定義：髖角 = 肩–髖–膝於髖點的影像平面內角（0–180°），暫定髖屈曲 proxy = 180° − 內角。上身（軀幹）前傾 = 兩髖中點→兩肩中點連線與畫面垂直線的夾角（0° = 直立；手機需擺正）。膝蓋對腳尖線 = 膝蓋離「過腳尖的鉛垂線」多遠，以骨盆寬為單位；+ = 膝在內側（膝蓋內夾），標準是在線上或微外側，且左右對稱；只適用正面拍攝。三者都是 2D 影像平面幾何，不是經驗證的臨床角度；點位不可靠時顯示 N/A，不補值。</p>
      </details>
    </section>
    {experiments && sample?.search && <aside className="banner">全畫面搜尋：{sample.search.status}（候選不代表確認身分）。{sample.search.error && <p>全畫面搜尋不可用，請改用 Manual Keyframes 並人工確認；本次搜尋不作身分放行依據。</p>}
      {sample.search.suggestedRoi && <button className="secondary" disabled={busy||seeking} onClick={()=>{beginSelection();setDraft(sample.search!.suggestedRoi!);setDraftMode('adaptive-roi');}}>檢查搜尋建議 ROI（仍需人工 Apply）</button>}</aside>}
    <section className="card" aria-labelledby="chart-title"><div className="card-head"><h2 id="chart-title">角度曲線與匯出</h2>
      {session && <label className="compact">曲線指標<select aria-label="曲線指標" value={chartMetric} onChange={e=>setChartMetric(e.target.value as ChartMetric)}>{(Object.keys(CHART_METRICS) as ChartMetric[]).map(k=><option key={k} value={k}>{CHART_METRICS[k].label}</option>)}</select></label>}</div>
      {session ? <><AngleChart samples={session.samples} side={side} timeMs={timeMs} metric={chartMetric} poses={poses3d} />{chartMetric.endsWith('3d')&&!session.samples.some(s=>s.landmarks.some(p=>p.world))&&<p>這次分析沒有 3D 骨架點，請重新分析。</p>}{chartMetric!=='knee'&&chartMetric!=='knee3d'&&!session.samples.some(s=>s.posture)&&<p>此分析版本沒有姿勢指標，請重新分析。</p>}
        <p className="muted small">已分析 {session.samples.length} 個取樣；每秒 {hz} 次目標取樣，不代表全部影格。可辨識的重複呈現時間已排除；無效取樣保留為曲線斷點。</p>
        <div className="actions">
        <button className="secondary" onClick={() => downloadFile(`knee-${session.metadata.sessionId}.csv`, toCsv(session), 'text/csv;charset=utf-8')}>下載 CSV</button>
        <button className="secondary" onClick={() => downloadFile(`research-${session.metadata.sessionId}.json`, JSON.stringify(session, null, 2), 'application/json')}>下載研究 JSON（含 landmarks）</button>
      </div><p className="muted small">輸出含來源檔名、角度及人體特徵，請保存於受限空間，不要提交到 Public GitHub。</p></> : <p className="muted">完成分析後顯示曲線與匯出按鈕；目前沒有分析結果。</p>}
    </section>
    <h2 className="section-label">進階（研究用）</h2>
    <details className="experimental" open={experiments} onToggle={e=>{setExperiments(e.currentTarget.open);if(!e.currentTarget.open)setSelecting(false);}}>
      <summary>實驗性功能（ROI／多人／A/B/C 比較）</summary>
      <p>以下保留供研究查核，未列為單人 Dataset Demo 的主要操作。多人身分與裁切追蹤尚未驗證；開啟或收合此區不會改變結果。</p>
      <label>分析管線<select aria-label="分析管線" disabled={busy||selecting} value={pipeline} onChange={e=>{setPipeline(e.target.value as PipelineId);if(storedSession)setStale(true);}}>{Object.entries(PIPELINE_NAMES).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
      <details><summary>A/B/C 比較設定</summary><label>C 的候選數<select aria-label="C 的候選數" disabled={busy} value={multiPoses} onChange={e=>{setMultiPoses(Number(e.target.value) as 2|3);if(storedSession)setStale(true);}}><option value={2}>2</option><option value={3}>3</option></select></label><p>A/C 模型輸入始終是完整影格；框只作選人參考。依序比較固定為 A、B Adaptive、C，使用同一影片與模型內容。</p></details>
      <button disabled={!info||!selection||selecting||busy||loading} onClick={()=>void runComparison()}>依序比較 A / B / C</button>
    {comparison && <ComparisonPanel bundle={comparison} activeId={session?.metadata.sessionId} busy={busy||selecting} onSelect={selectComparison} />}
    {info && <section><h2>受測者選擇與 ROI 時間校正</h2><p>首次請在片頭選取單一受測者；之後可在目前暫停時間微調或新增 keyframe。ROI 只能降低其他人物干擾，無法保證分開重疊人物。高 visibility 不是身分正確的證據。A/C 的框只用於選人，可圈指定人的軀幹中心附近，不裁切模型輸入。B 的裁切框則需要完整人體與活動空間。</p>
      <label>前往影片時間（秒）<input type="number" min={0} max={info.duration} step={0.2} value={navigation} disabled={busy||selecting} onChange={e=>setNavigation(Number(e.target.value))} /></label><button disabled={busy||selecting} onClick={()=>void seekPlayback(Math.max(0,Math.min(info.duration-.001,navigation)))}>跳轉影片時間</button>
      <button disabled={busy||seeking} onClick={beginSelection}>{selection&&selection.correctionSource!=='controlled-single-default'?'重新選擇受測者／微調 ROI':'框選受測者'}</button>
      {selecting && <><label>ROI 方法<select aria-label="ROI 方法" value={draftMode} onChange={e=>setDraftMode(e.target.value as SubjectSelection['method'])}><option value="manual-fixed-roi">Fixed ROI（固定框）</option><option value="manual-keyframes">Manual Keyframes（手動時間框）</option><option value="adaptive-roi">Adaptive ROI（保守自動跟隨）</option></select></label><p>編輯位置：{(editTimeMs/1000).toFixed(3)} 秒。選用 Keyframes 或 Adaptive 時，Apply 代表在此時間人工重新確認受測者；相鄰框以原圖像素線性插值，只插值 ROI，不插值角度。</p><p>可拖曳矩形內部移動、四角／四邊縮放，或輸入來源像素座標（至少 32 × 32）。Fixed 模式不會自動移動；Adaptive 只依先前通過 QC 的姿態更新，仍需保留活動空間。</p>
      <div className="roi-fields">{(['x','y','width','height'] as const).map(key=><label key={key}>ROI {key}<input type="number" value={draft[key]} onChange={e=>setDraft(fitRoi({...draft,[key]:Number(e.target.value)},info.width,info.height))} /></label>)}</div>
      <button disabled={seeking} onClick={confirmSelection}>確認 ROI（Apply）</button>
      <button onClick={()=>setDraft({...previousDraft.current})}>Restore Previous</button>
      <button onClick={()=>setDraft({x:0,y:0,width:info.width,height:info.height})}>Reset</button>
      <button onClick={()=>setDrawNew(true)}>重新畫框</button>
      <button onClick={()=>setSelecting(false)}>取消編輯</button></>}
      {selection && <p>ROI：x={selection.roi.x}, y={selection.roi.y}, w={selection.roi.width}, h={selection.roi.height}。失去目標時可在該時間加入人工 Keyframe，再重新分析。</p>}
      {selection && <p>模式：{selection.method} · 設定版本 {selection.revision} · Keyframes：{selection.keyframes.map(k=>`${(k.timeMs/1000).toFixed(3)} s`).join(", ")}</p>}
    </section>}
    </details>
    <details className="research"><summary>研究診斷與人工檢查</summary>
      <label><input type="checkbox" checked={diagnostic} onChange={e=>setDiagnostic(e.target.checked)} />顯示被拒絕骨架供人工檢查（紅色，不代表有效量測）</label>
      {session?.run && <p>結果管線：{PIPELINE_NAMES[session.run.pipeline.id]} · 模型 hash：{session.metadata.model.assetSha256.slice(0,16)} · session：{session.metadata.sessionId}</p>}
      {sample?.subjectDecision && <p>本影格選中候選：{sample.subjectDecision.selectedIndex===null?'N/A':sample.subjectDecision.selectedIndex+1}；候選編號僅限此影格，不是人物 ID。</p>}
      {sample && <p role="status">人工判斷：{sample.review?.label??'尚未標註'} · 追蹤狀態：{sample.tracking.state} · 人物一致性：{sample.tracking.identity}（未經人工確認） · 點位信心：{sample.tracking.landmarkConfidence} · 幾何：{sample.tracking.plausibility} · 連續性：{sample.tracking.continuity} · 原因：{sample.tracking.reasons.join(', ')||'未觸發篩檢警示；仍可能選錯或混合人物'}</p>}
    {session && <ReviewPanel session={session} sample={sample} onReview={(index,review)=>{if(!storedSession)return;const next={...storedSession,samples:storedSession.samples.map(s=>s.sampleIndex===index?applyReview(s,review):s)};setSession(next);setComparison(previous=>previous?{...previous,entries:previous.entries.map(e=>e.session?.metadata.sessionId===next.metadata.sessionId?{...e,session:next}:e)}:null);}} />}
    </details>
    </div>
    </main>
    <footer className="disclaimer">本系統為學術概念驗證，不提供醫療診斷或治療建議。2D 影像平面幾何角不是經驗證的臨床角度；側面視角較適合觀察，遮蔽與透視會影響結果。</footer>
  </div>;
}
/** Half a sampling interval plus decoder jitter: every frame maps to its closest analyzed sample (5 Hz → 120 ms, 10 Hz → 70 ms). */
const nearestMs = (hz: number) => 500 / hz + 20;
/** Skeleton smoothing only bridges neighbouring samples (one interval plus jitter), never a gap (5 Hz → 250 ms, 10 Hz → 150 ms). */
const smoothMaxGapMs = (hz: number) => 1000 / hz + 50;
/** Slow motion by default: easier for PTs to follow, and the sampled skeleton keeps up with the body better. */
const SPEEDS = [0.25, 0.5, 1] as const;
const DEFAULT_SPEED = 0.5;
function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }
