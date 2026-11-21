import {fullFrameSelection} from '../input/singleSubject';
import {DEFAULT_PIPELINE,PIPELINE_NAMES,type PipelineId} from '../domain/pipeline';
import {comparePipelines,sha256File} from '../motion/compare';
import type {ComparisonBundle} from '../validation/comparison';
import {ComparisonPanel} from '../validation/ComparisonPanel';
import { useEffect, useRef, useState } from 'react';
import type { Session } from '../domain/analysis';
import { MODEL_URL, PROJECT_MODEL_URL } from '../pose/mediapipe';
import { checkFile, loadVideo, seekFrame, observePresentedFrame } from '../input/video';
import { analyze } from '../motion/analyze';
import { coverage, matchingSample, displayedRoi } from '../motion/series';
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
import { AngleChart } from '../visualization/AngleChart';
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
  const [selection,setSelection]=useState<SubjectSelection|null>(null);
  const [selecting,setSelecting]=useState(false);
  const [draft,setDraft]=useState<Roi>({x:0,y:0,width:640,height:360});
  const [diagnostic,setDiagnostic]=useState(false);
  const [sampleIndex, setSampleIndex] = useState(0);
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
      },{pipeline:{id:pipeline,numPoses:pipeline==='full-frame-multi'?multiPoses:1},...(sourceSha256?{sourceSha256}:{})});
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
      const bundle=await comparePipelines(url.current,sourceFile.current,model,allowDownload,selection,multiPoses,controller.signal,(done,total,phase)=>{if(!controller.signal.aborted)setProgress({done,total,phase});});
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
  const sample = session && !seeking ? (matchingSample(session.samples, timeMs) ?? (video.current?.paused ? session.samples.find(s=>s.decode.timeBasis==='seek-position-estimate' && Math.abs(s.requestedTimeMs-video.current!.currentTime*1000)<.001):undefined)) : undefined;
  const pct = (s: 'left' | 'right') => { const value = session ? coverage(session.samples, s) : null; return value === null ? 'N/A' : `${(value * 100).toFixed(1)}%`; };

  return <main>
    <header><p className="eyebrow">臺大 115-1 醫學電資創意整合專題 · Dataset Demo v0.6.1</p><h1>關節動作分析研究工作台</h1><p>上傳單人 MP4 或開啟即時鏡頭 → 查看膝角度與曲線 → 匯出 CSV</p></header>
    <aside>本系統為學術概念驗證，不提供醫療診斷或治療建議。2D 影像平面幾何角不是經驗證的臨床角度；側面視角較適合觀察，遮蔽與透視會影響結果。</aside>
    <div className="mode-switch" role="group" aria-label="輸入來源">
      <button aria-pressed={mode==='video'} onClick={()=>setMode('video')}>上傳影片</button>
      <button aria-pressed={mode==='camera'} disabled={busy||loading||selecting} onClick={()=>{video.current?.pause();setMode('camera');}}>即時鏡頭</button>
    </div>
    {mode==='camera' && <LivePanel model={model} allowDownload={allowDownload} side={side} onSide={setSide} disabled={busy||loading} />}
    <div hidden={mode!=='video'}>
    <section className="setup" aria-labelledby="input-title"><h2 id="input-title">1. 選擇影片與模型</h2>
      <label>MP4 影片（最多 500 MB、10 分鐘）<input type="file" accept=".mp4,video/mp4" disabled={busy || loading} onChange={e => { const f = e.currentTarget.files?.[0]; e.currentTarget.value = ''; void choose(f); }} /></label>
      <details><summary>模型設定與資料隱私</summary><p>影片不會上傳。預設先讀取專案本機模型；手動選取的 .task 檔優先。WASM 與已安裝 npm 版本一致，從本站載入，不使用外部 CDN。沒有模型時可改選本機檔案，其他介面仍可操作。</p>
        <p><a href={MODEL_URL} target="_blank" rel="noreferrer">官方 Lite 模型下載</a>（模型來源與 SHA-256 會記錄於研究 JSON）。</p>
        <label>本機 .task 模型<input type="file" accept=".task" disabled={busy} onChange={e => { setModel(e.target.files?.[0] ?? null); e.target.value = ''; if(storedSession)setStale(true); }} /></label>
        <button disabled={busy || !model} onClick={() => { setModel(null); if(storedSession)setStale(true); }}>改用專案本機模型</button>
        <label><input type="checkbox" checked={allowDownload} disabled={busy} onChange={e => setAllowDownload(e.target.checked)} />本機模型不存在時，允許從 Google 官方下載（選用）</label>
        <p>放置方式：將官方模型存成 public/models/pose_landmarker_lite.task，或直接從 Mac 選取檔案，不需上傳伺服器。</p>
        <p>目前模型：{model ? model.name : `專案本機路徑 ${PROJECT_MODEL_URL}`} 。本機模型須由使用者核對來源與授權。</p>
      </details>
      {loading && <p role="status">讀取影片中…</p>}
      {info && <p className="file-info">{info.name} · {info.duration.toFixed(2)} 秒 · {info.width} × {info.height} 像素</p>}
      <p>目前模式：{pipeline===DEFAULT_PIPELINE.id&&selection?.correctionSource==='controlled-single-default'?'單人完整影格（主要模式）':info?`${PIPELINE_NAMES[pipeline]}（實驗設定）`:'單人完整影格（主要模式）'}。適用單人、固定鏡頭、完整人體入鏡；不需框選。</p>
      {info&&(pipeline!==DEFAULT_PIPELINE.id||selection?.correctionSource!=='controlled-single-default')&&<button disabled={busy||loading} onClick={restoreMainMode}>回到單人主要模式</button>}
      <div className="actions"><button disabled={!info || !selection || selecting || busy || loading} onClick={() => void run()}>{session ? '重新分析' : '開始分析'}</button>{busy && <button onClick={cancel}>取消分析</button>}</div>
      {busy && <div role="status"><p>{progress.phase} · {progress.done} / {progress.total || '準備中'}</p><progress max={progress.total || 1} value={progress.done} /></div>}
      {error && <p role="alert" className="error">{error}</p>}{notice && <p role="status">{notice}</p>}
    </section>
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
    {stale && storedSession && <aside role="status">舊分析已過期（stale），請重新分析。舊設定的角度、圖表及一般匯出已隱藏。
      <button onClick={()=>downloadFile(`archived-${storedSession.metadata.sessionId}.json`,JSON.stringify(storedSession,null,2),'application/json')}>下載舊分析 JSON（原設定）</button></aside>}
    {history.length>0 && <details><summary>先前分析存檔（不修改原始 session）</summary>{history.map(s=><p key={s.metadata.sessionId}><button onClick={()=>downloadFile(`archived-${s.metadata.sessionId}.json`,JSON.stringify(s,null,2),'application/json')}>下載 {s.metadata.sessionId}</button></p>)}</details>}
    <section aria-labelledby="review-title"><h2 id="review-title">2. 影格與角度檢查</h2>
      <label>顯示側別<select value={side} onChange={e => setSide(e.target.value as typeof side)}><option value="both">左右膝 Both</option><option value="left">左膝 Left Knee</option><option value="right">右膝 Right Knee</option></select></label>
      {sample?.tracking.state==='MANUAL_REVIEW_REQUIRED'&&<aside>人物一致性無法確認，量測已暫停。請確認單人、完整入鏡後重新分析；必要時可在實驗區人工校正。局部膝部缺點不會單獨造成這個鎖定。</aside>}
      <div className="workspace"><div><div className="video-stage"><video ref={video} controls={!selecting} playsInline onPlay={()=>{if(selecting)video.current?.pause();}} onSeeking={() => setSeeking(true)} onSeeked={() => {
        const v = video.current;
        if (!v) return;
        // Paused/off-screen videos may throttle rVFC. The same completed seek target
        // maps to the decoded frame recorded by the analysis decoder.
        const known = session?.samples.find(s => Math.abs(s.requestedTimeMs - v.currentTime * 1000) <= 1);
        setTimeMs(known?.sourceTimeMs ?? v.currentTime * 1000); setSeeking(false);
      }} onError={() => { if (info) { setError('影片播放解碼失敗，請改用 H.264 MP4。'); setSession(null); } }} /><Overlay sample={sample} width={info?.width ?? 640} height={info?.height ?? 360} side={side} diagnostic={diagnostic} />
      {selecting && info && !seeking && <RoiSelector width={info.width} height={info.height} roi={draft} onChange={setDraft} drawNew={drawNew} onDrawEnd={()=>setDrawNew(false)} />}
      {experiments && selection && info && !selecting && <svg className="roi-border" viewBox={`0 0 ${info.width} ${info.height}`} aria-label="受測者 ROI 範圍"><rect {...(pipeline==='roi-crop'?(sample?.roi??displayedRoi(session?.samples??[],timeMs)??roiAt(selection,timeMs,info.width,info.height).roi):(sample?.targetReferenceRoi??selection.roi))} fill="none" stroke="#ffda57" strokeWidth={Math.max(2,info.width/250)} /></svg>}</div>
        <p>來源影格時間：{(timeMs/1000).toFixed(3)} 秒。{sample ? `對應取樣 #${sample.sampleIndex}（${sample.decode.timeBasis}）` : '此影格沒有對應分析結果，骨架與角度不顯示。'}</p>
        {session && <label>檢查已分析取樣 #{sampleIndex}<input aria-label="已分析取樣" type="range" min={0} max={session.samples.length-1} disabled={selecting} value={sampleIndex} onChange={e => jump(Number(e.target.value))} /></label>}
      </div><div className="measurements">
        {(['left','right'] as const).filter(s => side === 'both' || side === s).map(s => {
          const angle = sample?.[s];
          return <article key={s}><h3>{s === 'left' ? '左膝 Left Knee' : '右膝 Right Knee'}</h3><p className="angle">{angle?.valid ? `${angle.rawAngleDeg.toFixed(1)}°` : 'N/A'}</p><p>暫定屈曲 proxy：{angle?.valid ? `${flexionProxy(angle)!.toFixed(1)}°` : 'N/A'}</p><p>Tracking Status：{angle ? angle.valid ? '自動 QC 通過（身分仍待人工確認）' : `無效（${angle.invalidReasons.join(', ')}）` : '無對應取樣'}</p><p>有效取樣比例：{pct(s)}</p></article>;
        })}
      </div></div>
      <p>定義：髖–膝–踝於膝點的影像平面內角（0–180°）。暫定屈曲 proxy = 180° − 內角；不是已確認的臨床屈曲角。左右為人體解剖側，影片不鏡像。</p>
    </section>
    {experiments && sample?.search && <aside>全畫面搜尋：{sample.search.status}（候選不代表確認身分）。{sample.search.error && <p>全畫面搜尋不可用，請改用 Manual Keyframes 並人工確認；本次搜尋不作身分放行依據。</p>}
      {sample.search.suggestedRoi && <button disabled={busy||seeking} onClick={()=>{beginSelection();setDraft(sample.search!.suggestedRoi!);setDraftMode('adaptive-roi');}}>檢查搜尋建議 ROI（仍需人工 Apply）</button>}</aside>}
    <section><h2>3. 角度時間曲線與匯出</h2>
      {session ? <><p>已分析 {session.samples.length} 個取樣；每秒 5 次目標取樣，不代表全部影格。可辨識的重複呈現時間已排除；無效取樣保留為曲線斷點。</p><AngleChart samples={session.samples} side={side} timeMs={timeMs} /><div className="actions">
        <button onClick={() => downloadFile(`knee-${session.metadata.sessionId}.csv`, toCsv(session), 'text/csv;charset=utf-8')}>下載 CSV</button>
        <button onClick={() => downloadFile(`research-${session.metadata.sessionId}.json`, JSON.stringify(session, null, 2), 'application/json')}>下載研究 JSON（含 landmarks）</button>
      </div><p>輸出含來源檔名、角度及人體特徵，請保存於受限空間，不要提交到 Public GitHub。</p></> : <p>完成分析後顯示曲線與匯出按鈕；目前沒有分析結果。</p>}
    </section>
    <details className="research"><summary>研究診斷與人工檢查</summary>
      <label><input type="checkbox" checked={diagnostic} onChange={e=>setDiagnostic(e.target.checked)} />顯示被拒絕骨架供人工檢查（紅色，不代表有效量測）</label>
      {session?.run && <p>結果管線：{PIPELINE_NAMES[session.run.pipeline.id]} · 模型 hash：{session.metadata.model.assetSha256.slice(0,16)} · session：{session.metadata.sessionId}</p>}
      {sample?.subjectDecision && <p>本影格選中候選：{sample.subjectDecision.selectedIndex===null?'N/A':sample.subjectDecision.selectedIndex+1}；候選編號僅限此影格，不是人物 ID。</p>}
      {sample && <p role="status">人工判斷：{sample.review?.label??'尚未標註'} · 追蹤狀態：{sample.tracking.state} · 人物一致性：{sample.tracking.identity}（未經人工確認） · 點位信心：{sample.tracking.landmarkConfidence} · 幾何：{sample.tracking.plausibility} · 連續性：{sample.tracking.continuity} · 原因：{sample.tracking.reasons.join(', ')||'未觸發篩檢警示；仍可能選錯或混合人物'}</p>}
    {session && <ReviewPanel session={session} sample={sample} onReview={(index,review)=>{if(!storedSession)return;const next={...storedSession,samples:storedSession.samples.map(s=>s.sampleIndex===index?applyReview(s,review):s)};setSession(next);setComparison(previous=>previous?{...previous,entries:previous.entries.map(e=>e.session?.metadata.sessionId===next.metadata.sessionId?{...e,session:next}:e)}:null);}} />}
    </details>
    </div>
  </main>;
}
function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }
