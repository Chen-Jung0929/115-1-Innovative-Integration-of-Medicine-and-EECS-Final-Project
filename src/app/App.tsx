import { useEffect, useRef, useState } from 'react';
import type { Session } from '../domain/analysis';
import { MODEL_URL, PROJECT_MODEL_URL } from '../pose/mediapipe';
import { checkFile, loadVideo, seekFrame, observePresentedFrame } from '../input/video';
import { analyze } from '../motion/analyze';
import { coverage, matchingSample } from '../motion/series';
import { flexionProxy } from '../biomechanics/knee';
import { downloadFile, toCsv } from '../export/csv';
import { Overlay } from '../visualization/Overlay';
import type { Roi, SubjectSelection } from '../domain/tracking';
import { checkedRoi } from '../tracking/roi';
import { RoiSelector } from '../visualization/RoiSelector';
import { ReviewPanel } from '../validation/ReviewPanel';
import { applyReview } from '../validation/targetMetrics';
import { AngleChart } from '../visualization/AngleChart';

export function App() {
  const video = useRef<HTMLVideoElement>(null);
  const url = useRef<string | null>(null);
  const uiSeek=useRef<AbortController|null>(null);
  const task = useRef<AbortController | null>(null);
  const [info, setInfo] = useState<{ name: string; duration: number; width: number; height: number } | null>(null);
  const [model, setModel] = useState<File | null>(null);
  const [allowDownload, setAllowDownload] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState(false);
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
    setSelection(null); setSelecting(false); setSession(null); setInfo(null); setError(''); setNotice(''); setBusy(false); setLoading(true); setTimeMs(0); setSeeking(true);
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = null;
    try {
      checkFile(file); url.current = URL.createObjectURL(file);
      await loadVideo(video.current, url.current, controller.signal);
      controller.signal.throwIfAborted();
      setInfo({ name: file.name, duration: video.current.duration, width: video.current.videoWidth, height: video.current.videoHeight });
    } catch (e) {
      if (!controller.signal.aborted) { setError(message(e)); video.current.removeAttribute('src'); video.current.load(); if (url.current) URL.revokeObjectURL(url.current); url.current = null; }
    } finally { if (!controller.signal.aborted) setLoading(false); }
  }

  async function run() {
    if (!url.current || !info || !selection) return;
    task.current?.abort(); uiSeek.current?.abort();
    const controller = new AbortController(); task.current = controller;
    video.current?.pause(); setSession(null); setError(''); setNotice(''); setBusy(true); setSampleIndex(0);
    try {
      const result = await analyze(url.current, info.name, model, allowDownload, selection, controller.signal, (done, total, phase) => {
        if (!controller.signal.aborted) setProgress({ done, total, phase });
      });
      controller.signal.throwIfAborted(); setSession(result);
      if (video.current && result.samples[0]) video.current.currentTime = result.samples[0].requestedTimeMs / 1000;
      setNotice('分析完成；播放不會再次推論。可用取樣滑桿檢查每個已分析影格。');
    } catch (e) { if (!controller.signal.aborted) setError(`${message(e)} 若模型下載受阻，可下載官方模型後選取本機 .task 檔。`); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  function cancel() { task.current?.abort(); setBusy(false); setNotice('已取消分析；未完成的結果不提供匯出。'); }
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
    void seekPlayback(0);
    setSession(null);setSelection(null);setSelecting(true);setError('');
    setDraft({x:0,y:0,width:info.width,height:info.height});
    setNotice('請在影片起點框選單一受測者，保留完整髖、膝、踝與活動空間。');
  }
  function confirmSelection() {
    if (!info) return;
    try { const roi=checkedRoi(draft,info.width,info.height);
      setSelection({id:crypto.randomUUID(),roi,method:'manual-fixed-roi',referenceTimeMs:0});setSelecting(false);setError('');
    } catch(e) {setError(message(e));}
  }
  const sample = session && !seeking ? (matchingSample(session.samples, timeMs) ?? (video.current?.paused ? session.samples.find(s=>s.decode.timeBasis==='seek-position-estimate' && Math.abs(s.requestedTimeMs-video.current!.currentTime*1000)<.001):undefined)) : undefined;
  const pct = (s: 'left' | 'right') => { const value = session ? coverage(session.samples, s) : null; return value === null ? 'N/A' : `${(value * 100).toFixed(1)}%`; };

  return <main>
    <header><p className="eyebrow">臺大 115-1 醫學電資創意整合專題 · Dataset Demo V0</p><h1>關節動作分析研究工作台</h1><p>上傳 MP4 → 固定取樣 → 膝部 2D 內角 → 曲線與 CSV</p></header>
    <aside>本系統為學術概念驗證，不提供醫療診斷或治療建議。2D 影像平面幾何角不是經驗證的臨床角度；側面視角較適合觀察，遮蔽與透視會影響結果。</aside>
    <section className="setup" aria-labelledby="input-title"><h2 id="input-title">1. 選擇影片與模型</h2>
      <label>MP4 影片（最多 500 MB、10 分鐘）<input type="file" accept=".mp4,video/mp4" disabled={busy || loading} onChange={e => { const f = e.currentTarget.files?.[0]; e.currentTarget.value = ''; void choose(f); }} /></label>
      <details><summary>模型設定與資料隱私</summary><p>影片不會上傳。預設先讀取專案本機模型；手動選取的 .task 檔優先。WASM 與已安裝 npm 版本一致，從本站載入，不使用外部 CDN。沒有模型時可改選本機檔案，其他介面仍可操作。</p>
        <p><a href={MODEL_URL} target="_blank" rel="noreferrer">官方 Lite 模型下載</a>（模型來源與 SHA-256 會記錄於研究 JSON）。</p>
        <label>本機 .task 模型<input type="file" accept=".task" disabled={busy} onChange={e => { setModel(e.target.files?.[0] ?? null); e.target.value = ''; setSession(null); }} /></label>
        <button disabled={busy || !model} onClick={() => { setModel(null); setSession(null); }}>改用專案本機模型</button>
        <label><input type="checkbox" checked={allowDownload} disabled={busy} onChange={e => setAllowDownload(e.target.checked)} />本機模型不存在時，允許從 Google 官方下載（選用）</label>
        <p>放置方式：將官方模型存成 public/models/pose_landmarker_lite.task，或直接從 Mac 選取檔案，不需上傳伺服器。</p>
        <p>目前模型：{model ? model.name : `專案本機路徑 ${PROJECT_MODEL_URL}`} 。本機模型須由使用者核對來源與授權。</p>
      </details>
      {loading && <p role="status">讀取影片中…</p>}
      {info && <p className="file-info">{info.name} · {info.duration.toFixed(2)} 秒 · {info.width} × {info.height} 像素</p>}
      <div className="actions"><button disabled={!info || !selection || selecting || busy || loading} onClick={() => void run()}>{session ? '重新分析' : '開始分析'}</button>{busy && <button onClick={cancel}>取消分析</button>}</div>
      {busy && <div role="status"><p>{progress.phase} · {progress.done} / {progress.total || '準備中'}</p><progress max={progress.total || 1} value={progress.done} /></div>}
      {error && <p role="alert" className="error">{error}</p>}{notice && <p role="status">{notice}</p>}
    </section>
    {info && <section><h2>受測者選擇：固定 ROI</h2><p>先回到影片起點，框選單一受測者。ROI 只能降低其他人物干擾，無法保證分開重疊人物。高 visibility 不是身分正確的證據。</p>
      <button disabled={busy} onClick={beginSelection}>{selection?'重新選擇受測者':'框選受測者'}</button>
      {selecting && <><p>可拖曳下方影片框選，或輸入來源像素座標（至少 32 × 32）。固定 ROI 不會隨人移動，請保留活動空間。</p>
      <div className="roi-fields">{(['x','y','width','height'] as const).map(key=><label key={key}>ROI {key}<input type="number" value={draft[key]} onChange={e=>setDraft({...draft,[key]:Number(e.target.value)})} /></label>)}</div>
      <button disabled={seeking} onClick={confirmSelection}>確認 ROI</button></>}
      {selection && <p>ROI：x={selection.roi.x}, y={selection.roi.y}, w={selection.roi.width}, h={selection.roi.height}。失去目標後不自動接回；請重新選擇並分析。</p>}
    </section>}
    <section aria-labelledby="review-title"><h2 id="review-title">2. 影格與角度檢查</h2>
      <label>顯示側別<select value={side} onChange={e => setSide(e.target.value as typeof side)}><option value="both">左右膝 Both</option><option value="left">左膝 Left Knee</option><option value="right">右膝 Right Knee</option></select></label>
      <label><input type="checkbox" checked={diagnostic} onChange={e=>setDiagnostic(e.target.checked)} />顯示被拒絕骨架供人工檢查（紅色，不代表有效量測）</label>
      {sample && <p role="status">人工判斷：{sample.review?.label??'尚未標註'} · 人物一致性：{sample.tracking.identity}（未經人工確認） · 點位信心：{sample.tracking.landmarkConfidence} · 幾何：{sample.tracking.plausibility} · 連續性：{sample.tracking.continuity} · 原因：{sample.tracking.reasons.join(', ')||'未觸發篩檢警示；仍可能選錯或混合人物'}</p>}
      <div className="workspace"><div><div className="video-stage"><video ref={video} controls playsInline onSeeking={() => setSeeking(true)} onSeeked={() => {
        const v = video.current;
        if (!v) return;
        // Paused/off-screen videos may throttle rVFC. The same completed seek target
        // maps to the decoded frame recorded by the analysis decoder.
        const known = session?.samples.find(s => Math.abs(s.requestedTimeMs - v.currentTime * 1000) <= 1);
        setTimeMs(known?.sourceTimeMs ?? v.currentTime * 1000); setSeeking(false);
      }} onError={() => { if (info) { setError('影片播放解碼失敗，請改用 H.264 MP4。'); setSession(null); } }} /><Overlay sample={sample} width={info?.width ?? 640} height={info?.height ?? 360} side={side} diagnostic={diagnostic} />
      {selecting && info && !seeking && <RoiSelector width={info.width} height={info.height} roi={draft} onChange={setDraft} />}
      {selection && info && <svg className="roi-border" viewBox={`0 0 ${info.width} ${info.height}`} aria-label="受測者 ROI 範圍"><rect {...selection.roi} fill="none" stroke="#ffda57" strokeWidth={Math.max(2,info.width/250)} /></svg>}</div>
        <p>來源影格時間：{(timeMs/1000).toFixed(3)} 秒。{sample ? `對應取樣 #${sample.sampleIndex}（${sample.decode.timeBasis}）` : '此影格沒有對應分析結果，骨架與角度不顯示。'}</p>
        {session && <label>檢查已分析取樣 #{sampleIndex}<input aria-label="已分析取樣" type="range" min={0} max={session.samples.length-1} value={sampleIndex} onChange={e => jump(Number(e.target.value))} /></label>}
      </div><div className="measurements">
        {(['left','right'] as const).filter(s => side === 'both' || side === s).map(s => {
          const angle = sample?.[s];
          return <article key={s}><h3>{s === 'left' ? '左膝 Left Knee' : '右膝 Right Knee'}</h3><p className="angle">{angle?.valid ? `${angle.rawAngleDeg.toFixed(1)}°` : 'N/A'}</p><p>暫定屈曲 proxy：{angle?.valid ? `${flexionProxy(angle)!.toFixed(1)}°` : 'N/A'}</p><p>Tracking Status：{angle ? angle.valid ? '自動 QC 通過（身分仍待人工確認）' : `無效（${angle.invalidReasons.join(', ')}）` : '無對應取樣'}</p><p>有效取樣比例：{pct(s)}</p></article>;
        })}
      </div></div>
      <p>定義：髖–膝–踝於膝點的影像平面內角（0–180°）。暫定屈曲 proxy = 180° − 內角；不是已確認的臨床屈曲角。左右為人體解剖側，影片不鏡像。</p>
    </section>
    <section><h2>3. 角度時間曲線與匯出</h2>
      {session ? <><p>已分析 {session.samples.length} 個取樣；每秒 5 次目標取樣，不代表全部影格。可辨識的重複呈現時間已排除；無效取樣保留為曲線斷點。</p><AngleChart samples={session.samples} side={side} timeMs={timeMs} /><div className="actions">
        <button onClick={() => downloadFile(`knee-${session.metadata.sessionId}.csv`, toCsv(session), 'text/csv;charset=utf-8')}>下載 CSV</button>
        <button onClick={() => downloadFile(`research-${session.metadata.sessionId}.json`, JSON.stringify(session, null, 2), 'application/json')}>下載研究 JSON（含 landmarks）</button>
      </div><p>輸出含來源檔名、角度及人體特徵，請保存於受限空間，不要提交到 Public GitHub。</p></> : <p>完成分析後顯示曲線與匯出按鈕；目前沒有分析結果。</p>}
    </section>
    {session && <ReviewPanel session={session} sample={sample} onReview={(index,review)=>setSession(previous=>previous?{...previous,samples:previous.samples.map(s=>s.sampleIndex===index?applyReview(s,review):s)}:null)} />}
  </main>;
}
function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }
