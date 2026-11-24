import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Sample, Session } from '../domain/analysis';
import { canRecord, downloadBlob, startRecorder, videoExtension, type SegmentRecorder, type SegmentVideos } from '../input/recorder';
import { cameraErrorMessage, cameraUnavailableReason, listCameras, openCamera, stopCamera, streamDeviceId, type Facing } from '../input/camera';
import { fullFrameSelection } from '../input/singleSubject';
import { createPoseEngine, modelBytes, MODEL_LOAD_ERROR, MODEL_VERSION, type PoseEngine } from '../pose/mediapipe';
import { createLiveAnalyzer, createReadyGate, dueForSample, liveSession, LIVE_SAMPLING_HZ, READY_POLICY, type LiveRunInfo } from '../motion/live';
import { coverage, nearestSample } from '../motion/series';
import { createPerformanceRecorder } from '../motion/livePerformance';
import type { LivePerformance } from '../domain/performance';
import { flexionProxy } from '../biomechanics/knee';
import { downloadFile, toCsv } from '../export/csv';
import { Overlay } from '../visualization/Overlay';
import { AngleChart } from '../visualization/AngleChart';
import pkg from '../../package.json';
import { Metric } from './Metric';
import { createNoticeHold, noticeText, showAngle, showFlexion, trackingCause, TRACKING_TEXT, type TrackingNotice } from './plain';
import { createPitchRecorder, pitchFromOrientation, pitchLabel, requestOrientationPermission } from '../motion/devicePitch';
import { calibrationNote, liftSession } from '../motion/world3d';
import { Skeleton3D } from '../visualization/Skeleton3D';

type Side = 'left' | 'right' | 'both';
type Analyzer = ReturnType<typeof createLiveAnalyzer>;
type Ready = ReturnType<ReturnType<typeof createReadyGate>['observe']>;
const CHART_WINDOW_MS = 15000;
const MAX_KEPT_SEGMENTS = 10;

/** One plain line; numbers come from the recorder, never estimated. */
export function perfText(p: LivePerformance): string {
  const n = (v: number | null, d = 0) => v === null ? 'N/A' : v.toFixed(d);
  return `每秒處理 ${n(p.processedFps, 1)} 次（鏡頭 ${n(p.inputFps, 0)} fps）· 延遲中位數 ${n(p.latencyMs.p50)} ms、p95 ${n(p.latencyMs.p95)} ms${p.latencyMs.basis === 'presentation-callback' ? '（估計）' : ''} · 模型推論中位數 ${n(p.inferenceMs.p50)} ms · 掉幀 ${p.droppedFrames}`;
}

/** What the person should do while the app waits to start a segment by itself. */
export function waitStatus(ready: Ready | null): string {
  const hold = (READY_POLICY.holdMs / 1000).toFixed(1);
  if (!ready || ready.reason === 'no-person') return `請走到畫面中，頭到腳都入鏡，站好不動約 ${hold} 秒就會自動開始。`;
  if (ready.reason === 'multiple-people') return '畫面中不只一人，請只留下受測者，才會開始量測。';
  if (ready.reason === 'not-full-body') return '還沒拍到全身：請再退後一點，讓頭到腳（至少一側膝蓋和腳踝）都入鏡。';
  return `站好了，請保持不動… ${(ready.heldMs / 1000).toFixed(1)} / ${hold} 秒`;
}

/** Plain-language status for the person in front of the camera; detailed reasons stay in the export. */
export function liveStatus(sample: Sample | undefined, notice?: TrackingNotice | null): string {
  if (!sample) return '等待畫面中的人…';
  const t = sample.tracking;
  const cause = notice?.cause ?? (t.accepted ? null : trackingCause(sample));
  if (t.state === 'MANUAL_REVIEW_REQUIRED') return `這一段已結束：${TRACKING_TEXT[cause === 'confirming' || !cause ? 'lost-track' : cause].problem}。`;
  // Reasons come from src/app/plain.ts and are held ≥ 0.5 s there, so the line does not flicker.
  if (notice) return notice.text;
  if (cause) return noticeText(cause, false, 'live');
  if (!sample.left.valid && !sample.right.valid) return '偵測到人，但看不清膝蓋：請側身面向鏡頭，避免遮住腿部。';
  return '量測中';
}

/** Segments whose videos stay downloadable; older segments keep only their angle data (memory on phones and tablets). */
const MAX_VIDEO_SEGMENTS = 3;

/** Identifies the open camera by device id, or by its label when the browser gives no id. */
const cameraKey = (s: MediaStream | null) => streamDeviceId(s) || (s?.getVideoTracks()[0]?.label ?? '');

/** Saved live results kept by the parent while the camera page is closed (ADR-092). Mutated in place. */
export type LiveKeep = { results: Session[]; videos: Record<string, SegmentVideos | 'pending'>; released: Set<string>;
  /** Set by the mounted panel: a recording that finishes after a remount still reaches the visible panel. */
  onVideo?: ((id: string, videos: SegmentVideos) => void) | undefined };
export function createLiveKeep(): LiveKeep { return { results: [], videos: {}, released: new Set() }; }

export function LivePanel({ keep, model, side, onSide, disabled, onFullAnalysis }: { keep?: LiveKeep; model: File | null; side: Side; onSide: (side: Side) => void; disabled: boolean; onFullAnalysis?: (file: File) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const engine = useRef<PoseEngine | null>(null);
  const analyzer = useRef<Analyzer | null>(null);
  const runInfo = useRef<Omit<LiveRunInfo, 'startedAt'> | null>(null);
  const segmentStart = useRef(0);
  const frameId = useRef(0);
  const lastSampleMs = useRef<number | null>(null);
  const opening = useRef<AbortController | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const gate = useRef<ReturnType<typeof createReadyGate> | null>(null);
  const perf = useRef<ReturnType<typeof createPerformanceRecorder> | null>(null);
  const clockOffset = useRef(0);
  const warmUpMs = useRef(0);
  const pitchRec = useRef(createPitchRecorder());
  const noticeHold = useRef(createNoticeHold('live'));
  const [liveNotice, setLiveNotice] = useState<TrackingNotice | null>(null);
  const facingRef = useRef<Facing>('user');
  const [sensor, setSensor] = useState<'off' | 'on' | 'denied' | 'unsupported'>('off');
  const [livePitch, setLivePitch] = useState<number | null>(null);
  const [facing, setFacing] = useState<Facing>('user');
  const [mirrored, setMirrored] = useState(true);
  const [cameraCount, setCameraCount] = useState(0);
  const [canSwitch, setCanSwitch] = useState(true);
  const [released, setReleased] = useState<Set<string>>(() => keep?.released ?? new Set());
  // Segment videos (ADR-091): kept in memory on this device only, downloaded on request, never uploaded.
  const [record, setRecord] = useState(true);
  const [videos, setVideos] = useState<Record<string, SegmentVideos | 'pending'>>(() => keep?.videos ?? {});
  const rawRec = useRef<SegmentRecorder | null>(null);
  const skelRec = useRef<SegmentRecorder | null>(null);
  const composite = useRef<HTMLCanvasElement | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const latest = useRef<Sample | undefined>(undefined);
  const [state, setState] = useState<'off' | 'starting' | 'live'>('off');
  const [size, setSize] = useState({ width: 640, height: 360 });
  const [sample, setSample] = useState<Sample | undefined>();
  const [recent, setRecent] = useState<Sample[]>([]);
  const [results, setResults] = useState<Session[]>(() => keep?.results ?? []);
  const [shown, setShown] = useState(0);
  const [ready, setReady] = useState<Ready | null>(null);
  const [measuring, setMeasuring] = useState(false);
  const [livePerf, setLivePerf] = useState<LivePerformance | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Leaving the camera page mid-segment saves that segment into the parent's keep instead of dropping it.
  useEffect(() => () => { opening.current?.abort(); endSegment(true); halt(); }, []);
  useEffect(() => {
    if (!keep) return;
    keep.onVideo = (id, done) => setVideos(previous => id in previous ? { ...previous, [id]: done } : previous);
    return () => { keep.onVideo = undefined; };
  }, [keep]);
  // Drop videos of segments that fell out of the kept list, so memory does not grow without bound.
  useEffect(() => {
    // Videos are large (about 9 MB per minute per video), so only the latest few segments keep them.
    const kept = new Set(results.slice(0, MAX_VIDEO_SEGMENTS).map(r => r.metadata.sessionId));
    setVideos(previous => {
      const dropped = Object.keys(previous).filter(id => !kept.has(id));
      if (!dropped.length) return previous;
      setReleased(old => new Set([...old, ...dropped]));
      return Object.fromEntries(Object.entries(previous).filter(([id]) => kept.has(id)));
    });
  }, [results]);
  useEffect(() => {
    const hidden = () => { if (document.visibilityState === 'hidden' && stream.current) stop('切換到其他分頁或 App 時，鏡頭已自動關閉並結束這一段量測。'); };
    document.addEventListener('visibilitychange', hidden);
    return () => document.removeEventListener('visibilitychange', hidden);
  });

  function halt() {
    const v = video.current;
    if (v && frameId.current) v.cancelVideoFrameCallback(frameId.current);
    frameId.current = 0;
    stopCamera(stream.current, v); stream.current = null;
    engine.current?.close(); engine.current = null;
  }

  /** Ends the current live segment and keeps it for review / export. Never edits earlier samples. */
  function endSegment(unmounting = false): void {
    const a = analyzer.current, info = runInfo.current;
    analyzer.current = null;
    setMeasuring(false);
    const recorders = [rawRec.current, skelRec.current] as const;
    rawRec.current = null; skelRec.current = null; composite.current = null; latest.current = undefined;
    const finish = Promise.all(recorders.map(r => r ? r.stop() : Promise.resolve(null)));
    if (a && info && a.samples.length) {
      const session = liveSession(a.samples, { ...info, startedAt: segmentStart.current }, performance.now(), perf.current?.summary(), pitchRec.current.summary());
      const id = session.metadata.sessionId;
      if (unmounting && keep) { // State setters do nothing after unmount: write straight into the keep.
        keep.results = [session, ...keep.results].slice(0, MAX_KEPT_SEGMENTS);
        if (recorders.some(Boolean)) keep.videos = { ...keep.videos, [id]: 'pending' };
      } else { setResults(previous => [session, ...previous].slice(0, MAX_KEPT_SEGMENTS)); setShown(0); }
      if (recorders.some(Boolean)) {
        if (!unmounting) setVideos(previous => ({ ...previous, [id]: 'pending' }));
        void finish.then(([raw, skeleton]) => {
          const done = { raw: raw ?? null, skeleton: skeleton ?? null };
          // Also into the parent's keep, in case the camera page was closed before the video finished.
          if (!keep) { setVideos(previous => id in previous ? { ...previous, [id]: done } : previous); return; }
          if (id in keep.videos) keep.videos = { ...keep.videos, [id]: done };
          keep.onVideo?.(id, done);
        });
      }
    }
  }

  /** Records the raw camera stream and a copy with the skeleton and knee angles drawn on (not mirrored). */
  function startRecording(width: number, height: number) {
    if (!record || !stream.current || !canRecord()) return;
    rawRec.current = startRecorder(stream.current);
    const c = document.createElement('canvas'); c.width = width; c.height = height;
    composite.current = c; drawComposite();
    skelRec.current = 'captureStream' in c ? startRecorder(c.captureStream(30), 1_000_000) : null;
    if (!skelRec.current) composite.current = null;
  }

  function drawComposite() {
    const c = composite.current, v = video.current;
    const ctx = c?.getContext('2d');
    if (!c || !v || !ctx) return;
    ctx.drawImage(v, 0, 0, c.width, c.height);
    const overlay = stage.current?.querySelector<HTMLCanvasElement>('canvas.overlay');
    if (overlay?.width) ctx.drawImage(overlay, 0, 0, c.width, c.height);
    const s = latest.current;
    if (!s) return;
    const text = `左膝彎曲 ${showFlexion(s.left, flexionProxy)}　右膝彎曲 ${showFlexion(s.right, flexionProxy)}　${(s.sourceTimeMs / 1000).toFixed(1)} 秒`;
    const size = Math.max(14, Math.round(c.width / 40));
    ctx.font = `600 ${size}px system-ui, sans-serif`;
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, ctx.measureText(text).width + size, size * 1.8);
    ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(text, size / 2, size * 0.9);
  }

  /** Wait hands-free for one still, full-body person before the next segment starts. */
  function enterWaiting() {
    gate.current?.reset(); setReady(null); setSample(undefined); setRecent([]);
  }

  /** Starts a new segment whose source time 0 is the camera media time of this frame (docs/ARCHITECTURE.md). */
  function beginSegment(width: number, height: number, mediaTimeMs: number) {
    const selection = fullFrameSelection(width, height);
    clockOffset.current = mediaTimeMs;
    perf.current = createPerformanceRecorder({ userAgent: navigator.userAgent, delegate: 'CPU', width, height, warmUpMs: warmUpMs.current, sourceClockOffsetMs: mediaTimeMs });
    if (runInfo.current) runInfo.current = { ...runInfo.current, selection, width, height };
    analyzer.current = createLiveAnalyzer(width, height, selection);
    segmentStart.current = performance.now(); lastSampleMs.current = null; pitchRec.current.reset();
    noticeHold.current = createNoticeHold('live', width, height); setLiveNotice(null);
    setSample(undefined); setRecent([]); setMeasuring(true); setLivePerf(null);
    startRecording(width, height);
  }

  function onFrame(_now: number, meta: VideoFrameCallbackMetadata) {
    const v = video.current, a = analyzer.current, e = engine.current, c = canvas.current;
    if (!v || !e || !c) return;
    frameId.current = v.requestVideoFrameCallback(onFrame);
    if (v.videoWidth !== c.width || v.videoHeight !== c.height) {
      stop('鏡頭畫面尺寸改變（可能是手機轉向），已結束這一段。請固定手機方向後重新開啟鏡頭。'); return;
    }
    const t = meta.mediaTime * 1000;
    if (a) perf.current?.frame(t, meta.presentedFrames);
    drawComposite(); // Every camera frame, so the skeleton video is as smooth as the camera.
    if (!dueForSample(lastSampleMs.current, t)) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, c.width, c.height); // Inference always sees the un-mirrored camera frame.
    const inferenceStart = performance.now();
    const candidates = e.detect(c, t); // The model keeps the raw monotonic camera clock across segments.
    const inferenceMs = performance.now() - inferenceStart;
    lastSampleMs.current = t;
    let current = a;
    if (!current) {
      const r = gate.current?.observe(candidates, t) ?? null;
      setReady(r);
      if (!r?.ready) return;
      beginSegment(c.width, c.height, t); setNotice('已自動開始量測。');
      perf.current?.frame(t, meta.presentedFrames);
      current = analyzer.current!;
    }
    const next = current.step(candidates, t - clockOffset.current);
    if (!next) { if (current.full) { endSegment(); enterWaiting(); setNotice('已達單段 10 分鐘上限，這一段已保存。站好不動就會自動開始新的一段。'); } return; }
    lastSampleMs.current = t;
    const held = noticeHold.current.update(next);
    if (next.tracking.state === 'MANUAL_REVIEW_REQUIRED') {
      // The locked segment is never unlocked; it is saved as-is and the next one starts only after a fresh ready check.
      endSegment(); enterWaiting();
      const why = held && held.cause !== 'confirming' ? TRACKING_TEXT[held.cause].problem : TRACKING_TEXT['lost-track'].problem;
      setNotice(`${why}，這一段已結束並保存在下方。站回畫面中不動，會自動開始新的一段。`);
      return;
    }
    // End-to-end latency: camera capture (or, if unavailable, frame presentation) to angle ready. Not inference time.
    const basis = meta.captureTime !== undefined ? 'capture-time' : 'presentation-callback';
    perf.current?.sample(next.sampleIndex, inferenceMs, performance.now() - (meta.captureTime ?? meta.presentationTime), basis);
    if (next.sampleIndex % LIVE_SAMPLING_HZ === 0) setLivePerf(perf.current?.summary() ?? null);
    latest.current = next; setSample(next); setLiveNotice(held);
    setRecent(previous => [...previous.filter(s => next.sourceTimeMs - s.sourceTimeMs <= CHART_WINDOW_MS), next]);
  }

  /** Opens the camera; facing/mirror can be passed directly when switching, before React state updates land. */
  async function start(useFacing: Facing = facing, useMirrored: boolean = mirrored): Promise<boolean> {
    setError(''); setNotice('');
    const v = video.current;
    if (!v) return false;
    const reason = cameraUnavailableReason({ isSecureContext: window.isSecureContext, hasMediaDevices: !!navigator.mediaDevices?.getUserMedia, hasFrameCallback: 'requestVideoFrameCallback' in HTMLVideoElement.prototype });
    if (reason) { setError(reason); return false; }
    opening.current?.abort();
    const controller = new AbortController(); opening.current = controller;
    setState('starting');
    try {
      const prepareStart = performance.now();
      const asset = await modelBytes(model, controller.signal);
      const modelPreparationMs = performance.now() - prepareStart;
      stream.current = await openCamera(v, useFacing, controller.signal);
      // Count cameras after permission (labels and ids are filled then). Any device with 2+ cameras may switch.
      void listCameras().then(c => setCameraCount(c.length)).catch(() => undefined);
      engine.current = await createPoseEngine(asset.bytes, 1);
      controller.signal.throwIfAborted();
      warmUpMs.current = performance.now() - prepareStart;
      const width = v.videoWidth, height = v.videoHeight;
      const c = document.createElement('canvas'); c.width = width; c.height = height; canvas.current = c;
      setSize({ width, height });
      runInfo.current = { width, height, selection: fullFrameSelection(width, height), displayMirrored: useMirrored, appVersion: pkg.version, modelPreparationMs,
        model: { packageVersion: MODEL_VERSION, assetId: asset.id, assetSha256: asset.hash, delegate: 'CPU' } };
      gate.current = createReadyGate(width, height); enterWaiting();
      frameId.current = v.requestVideoFrameCallback(onFrame);
      setState('live');
      return true;
    } catch (e) {
      halt();
      if (!controller.signal.aborted) { setState('off'); setError(e instanceof DOMException ? cameraErrorMessage(e) : e instanceof Error ? e.message : String(e)); }
      return false;
    }
  }

  /** Front/rear switch while live: saves the current segment, then reopens the other camera. Mirror only the front one. */
  async function switchCamera() {
    const previousFacing = facing, previousMirrored = mirrored, previousId = cameraKey(stream.current);
    const next: Facing = facing === 'user' ? 'environment' : 'user';
    setFacing(next); setMirrored(next === 'user');
    stop();
    if (!await start(next, next === 'user')) return;
    const nowId = cameraKey(stream.current);
    if (previousId && nowId === previousId) {
      // Two cameras, but neither says which way it faces (e.g. webcam + virtual camera): the browser reopened the same one.
      setFacing(previousFacing); setMirrored(previousMirrored); setCanSwitch(false);
      if (runInfo.current) runInfo.current = { ...runInfo.current, displayMirrored: previousMirrored };
      setNotice('這台裝置分不出前後鏡頭，仍是同一顆鏡頭。前一段（如果有）已保存在下方。');
      return;
    }
    setNotice(`已切換到${next === 'user' ? '前' : '後'}鏡頭。前一段（如果有）已保存在下方。`);
  }

  function stop(message = '已停止鏡頭。這一段的曲線與匯出在下方。') {
    opening.current?.abort();
    endSegment(); halt(); setState('off'); setSample(undefined); setReady(null); setNotice(message);
  }

  function restart() {
    if (!canvas.current) return;
    endSegment(); enterWaiting();
    setNotice('前一段已保存在下方。站好不動就會自動開始新的一段。');
  }

  // Phone tilt sensor (ADR-080): readings during a measured segment; its median becomes the segment's camera pitch.
  facingRef.current = facing;
  useEffect(() => {
    if (sensor !== 'on') return;
    const onTilt = (e: DeviceOrientationEvent) => {
      const p = pitchFromOrientation(e.beta, e.gamma, facingRef.current);
      setLivePitch(p);
      if (analyzer.current) pitchRec.current.add(p);
    };
    window.addEventListener('deviceorientation', onTilt);
    return () => window.removeEventListener('deviceorientation', onTilt);
  }, [sensor]);
  async function enableSensor() { const r = await requestOrientationPermission(); setSensor(r === 'granted' ? 'on' : r); }

  const live = state === 'live';
  const pct = (s: 'left' | 'right') => { const value = analyzer.current ? coverage(analyzer.current.samples, s) : null; return value === null ? 'N/A' : `${(value * 100).toFixed(0)}%`; };
  const result = results[shown] ?? null;
  const resultVideos = result ? videos[result.metadata.sessionId] : undefined;
  const hasVideo = !!resultVideos && resultVideos !== 'pending' && !!(resultVideos.raw || resultVideos.skeleton);
  const resultLift = useMemo(() => result ? liftSession(result.samples, result.metadata.sourceWidthPx, result.metadata.sourceHeightPx, result.cameraPitch?.deg) : null, [result]);
  // Playback of a saved segment's video inside the page (ADR-092): the chart cursor and 3D skeleton follow the video time.
  const [playKind, setPlayKind] = useState<'skeleton' | 'raw'>('skeleton');
  const [playMs, setPlayMs] = useState<number | null>(null);
  const playBlob = resultVideos && resultVideos !== 'pending' ? (resultVideos[playKind] ?? resultVideos.raw ?? resultVideos.skeleton) : null;
  const [playUrl, setPlayUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!playBlob) { setPlayUrl(null); return; }
    const url = URL.createObjectURL(playBlob); setPlayUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [playBlob]);
  useEffect(() => { setPlayMs(null); }, [shown, results, playKind]);
  // Mirror saved results into the parent's keep so they come back when the camera page reopens.
  useEffect(() => { if (keep) { keep.results = results; keep.videos = videos; keep.released = released; } }, [keep, results, videos, released]);
  const resultLast = result && resultLift ? (playMs === null
    ? [...result.samples].reverse().find(s => resultLift.poses.has(s.sampleIndex))
    : nearestSample(result.samples.filter(s => resultLift.poses.has(s.sampleIndex)), playMs, Infinity)) : undefined;

  return <>
    <section className="card" aria-labelledby="live-title">
      <div className="card-head"><h2 id="live-title">即時鏡頭</h2>
        <div className="actions">
          {!live && <button className="primary" disabled={disabled || state === 'starting'} onClick={() => void start()}>{state === 'starting' ? '正在準備姿態辨識功能…' : error === MODEL_LOAD_ERROR ? '重試開啟鏡頭' : '開啟鏡頭'}</button>}
          {live && measuring && <button className="secondary" onClick={restart}>結束這一段</button>}
          {live && <button className="secondary" onClick={() => stop()}>停止</button>}
        </div>
      </div>
      <div className="live-options">
        <label className="compact">鏡頭方向<select value={facing} disabled={state !== 'off'} onChange={e => { const f = e.target.value as Facing; setFacing(f); setMirrored(f === 'user'); }}><option value="user">前鏡頭（自拍）</option><option value="environment">後鏡頭（手機或平板架在旁邊）</option></select></label>
        {live && cameraCount > 1 && canSwitch && <button className="secondary" onClick={() => void switchCamera()}>切換到{facing === 'user' ? '後' : '前'}鏡頭</button>}
        <label className="switch"><input type="checkbox" role="switch" checked={record} disabled={state !== 'off'} onChange={e => setRecord(e.target.checked)} /><span>錄下每一段影片</span></label>
        <label className="switch"><input type="checkbox" role="switch" checked={mirrored} disabled={state !== 'off'} onChange={e => setMirrored(e.target.checked)} /><span>畫面像照鏡子</span></label>
        {sensor === 'off' && <button className="secondary" onClick={() => void enableSensor()}>使用手機／平板傾斜感測器（鏡頭俯角）</button>}
        {sensor === 'on' && <span className="muted small">{livePitch === null ? '等待手機傾斜感測器…（筆電通常沒有）' : `鏡頭俯角 ${livePitch.toFixed(0)}°（手機感測器）`}</span>}
        {sensor === 'denied' && <span className="muted small">未取得傾斜感測器權限（iPhone 需在 https 網址按按鈕允許）。</span>}
        {sensor === 'unsupported' && <span className="muted small">這個瀏覽器沒有傾斜感測器。</span>}
        <label className="compact">顯示側別<select value={side} onChange={e => onSide(e.target.value as Side)}><option value="both">左右都看</option><option value="left">只看左邊</option><option value="right">只看右邊</option></select></label>
      </div>
      {error === MODEL_LOAD_ERROR && <p>如需選用本機模型，可到「上傳影片」的進階設定。</p>}{error && <p role="alert" className="error">{error}</p>}{notice && <p role="status" className="notice">{notice}</p>}
      <details className="fold"><summary>怎麼拍最準？</summary>
        <p>開啟鏡頭後，畫面會即時畫出骨架與膝角度（每秒約 {LIVE_SAMPLING_HZ} 次）。影像只在這台裝置上處理，不會上傳。開啟「錄下每一段影片」時，每一段會錄成兩支影片（原始畫面、含骨架與角度）暫存在這台裝置，最近 {MAX_VIDEO_SEGMENTS} 段可下載，關閉網頁就會消失。含骨架影片中的骨架每秒更新約 {LIVE_SAMPLING_HZ} 次，動作快時會略落後身體。</p>
        <p>建議：鏡頭固定不動、從側面拍、頭到腳完整入鏡、畫面中只有一人。開啟後不用再碰裝置：走到畫面中、站穩約 {(READY_POLICY.holdMs / 1000).toFixed(1)} 秒就會自動開始；有人闖入或你離開畫面時，這一段會自動結束保存，回來站好又會開始新的一段。</p>
        <p>「畫面像照鏡子」只影響顯示，左右膝仍以個案身體為準。</p>
      </details>
    </section>
    <section className="card" aria-labelledby="live-view-title"><h2 id="live-view-title">即時畫面與角度</h2>
      {live && <p role="status" className={measuring ? 'live-status' : 'live-status wait'}>{measuring ? liveStatus(sample, liveNotice) : waitStatus(ready)}</p>}
      <div className="workspace"><div className="stage-col">
        <div ref={stage} className={mirrored ? 'video-stage mirrored' : 'video-stage'}
          style={{ '--source-ratio': size.width / size.height } as CSSProperties} hidden={state === 'off'}>
          <video ref={video} playsInline muted aria-label="即時鏡頭畫面" />
          <Overlay sample={sample} width={size.width} height={size.height} side={side} />
        </div>
        {state === 'off' && <p className="live-placeholder">鏡頭尚未開啟。</p>}
        {live && measuring && livePerf && <p className="live-perf">{perfText(livePerf)}</p>}
      </div><div className="readout"><div className="group"><h3 className="group-title">膝蓋</h3><div className="measurements">
        {(['left', 'right'] as const).filter(s => side === 'both' || side === s).map(s => {
          const angle = sample?.[s];
          return <Metric key={s} name={`${s === 'left' ? '左' : '右'}膝彎曲`} value={showFlexion(angle, flexionProxy)} note={angle?.valid ? '站直約 0°，蹲越低數字越大' : '尚未量到'}>
            <p>膝彎曲 = 180° − 膝角（自訂，站直 0°）。膝角 = 髖–膝–踝在膝蓋的夾角（影像平面，0–180°），內角：{showAngle(angle)}。暫定屈曲 proxy：{angle?.valid ? `${flexionProxy(angle)!.toFixed(1)}°` : 'N/A'}</p><p>本段有效比例：{pct(s)}</p></Metric>;
        })}
      </div></div></div></div>
      {live && recent.length > 1 && <><p className="muted small">最近 15 秒膝彎曲曲線（看不清楚的時間點會斷開，不補線）。</p><AngleChart samples={recent} side={side} timeMs={recent.at(-1)!.sourceTimeMs} /></>}
    </section>
    <section className="card" aria-labelledby="live-saved-title"><div className="card-head"><h2 id="live-saved-title">已保存的量測段與匯出</h2>
      {results.length > 1 && <label className="compact">選擇量測段<select value={shown} onChange={e => setShown(Number(e.target.value))}>{results.map((r, i) => <option key={r.metadata.sessionId} value={i}>{i === 0 ? '最新一段' : `前 ${i} 段`} · {(r.durationMs / 1000).toFixed(1)} 秒 · {r.samples.length} 個取樣</option>)}</select></label>}</div>
      {result ? <><p>這一段共 {result.samples.length} 個取樣、{(result.durationMs / 1000).toFixed(1)} 秒。<span className="muted">時間軸為鏡頭影格時間，每段從 0 秒起算；無效取樣保留為斷點。</span></p>
        {result.livePerformance && <p className="live-perf">效能：{perfText(result.livePerformance)}（詳細數字在研究 JSON 的 livePerformance）</p>}
        {resultVideos && resultVideos !== 'pending' && resultVideos.raw && onFullAnalysis && <div className="full-analysis">
          {videoExtension(resultVideos.raw.type) === 'mp4'
            ? <><button className="primary" disabled={live || state === 'starting'} onClick={() => onFullAnalysis(new File([resultVideos.raw!], `live-${result.metadata.sessionId}.mp4`, { type: 'video/mp4' }))}>用完整分析畫面看這一段</button>
              <span className="muted small">{live ? '請先按「停止」關閉鏡頭。' : '跟「上傳影片」一樣的畫面（骨架、角度、姿勢提醒、3D、播放速度），用這一段的錄影重新分析一次。'}</span></>
            : <span className="muted small">這個瀏覽器錄成 WebM，無法直接用完整分析；請下載影片後轉成 MP4 再上傳。</span>}
        </div>}
        {playUrl && <div className="segment-playback">
          {resultVideos && resultVideos !== 'pending' && resultVideos.raw && resultVideos.skeleton && <div className="actions" role="group" aria-label="播放哪一支影片">
            <button className={playKind === 'skeleton' ? 'primary' : 'secondary'} aria-pressed={playKind === 'skeleton'} onClick={() => setPlayKind('skeleton')}>看含骨架</button>
            <button className={playKind === 'raw' ? 'primary' : 'secondary'} aria-pressed={playKind === 'raw'} onClick={() => setPlayKind('raw')}>看原始畫面</button></div>}
          <video key={playUrl} src={playUrl} controls playsInline muted aria-label="這一段的錄影"
            onTimeUpdate={e => setPlayMs(e.currentTarget.currentTime * 1000)} onSeeked={e => setPlayMs(e.currentTarget.currentTime * 1000)} />
          <p className="muted small">播放或拖動影片時，下方曲線的直線和 3D 骨架會跟著影片時間移動（大約對齊，誤差約 0.1–0.2 秒）。</p>
        </div>}
        <AngleChart samples={result.samples} side={side} timeMs={playMs ?? result.samples.at(-1)?.sourceTimeMs ?? 0} />
        {resultLift && resultLast && <Skeleton3D sample={resultLast} points={resultLift.poses.get(resultLast.sampleIndex)} note={calibrationNote(resultLift.context)} pitchText={pitchLabel(result.cameraPitch)} />}
        <div className="actions">
          <button className="secondary" onClick={() => downloadFile(`knee-live-${result.metadata.sessionId}.csv`, toCsv(result), 'text/csv;charset=utf-8')}>下載 CSV</button>
          <button className="secondary" onClick={() => downloadFile(`research-live-${result.metadata.sessionId}.json`, JSON.stringify(result, null, 2), 'application/json')}>下載研究 JSON（含 landmarks）</button>
          {resultVideos === 'pending' && <span className="muted small">影片處理中…</span>}
          {resultVideos && resultVideos !== 'pending' && !hasVideo && <span className="muted small">這一段太短，沒有錄到影片。</span>}
          {resultVideos && resultVideos !== 'pending' && resultVideos.raw && <button className="secondary" onClick={() => downloadBlob(`video-live-${result.metadata.sessionId}.${videoExtension(resultVideos.raw!.type)}`, resultVideos.raw!)}>下載影片（原始畫面）</button>}
          {resultVideos && resultVideos !== 'pending' && resultVideos.skeleton && <button className="secondary" onClick={() => downloadBlob(`video-live-skeleton-${result.metadata.sessionId}.${videoExtension(resultVideos.skeleton!.type)}`, resultVideos.skeleton!)}>下載影片（含骨架）</button>}
        </div>{!resultVideos && released.has(result.metadata.sessionId) && <p className="muted small">這一段的影片已釋放（只保留最近 {MAX_VIDEO_SEGMENTS} 段的影片），角度資料仍可下載。</p>}
        {record && !canRecord() && <p className="muted small">這個瀏覽器不支援錄影，只能下載角度資料。</p>}
        <p className="muted small">輸出含人體特徵點{hasVideo ? '與影像' : ''}，請保存於受限空間，不要上傳或提交到 Public GitHub。</p></>
        : <p className="muted">每一段結束後（按停止、有人闖入或離開畫面），這裡會顯示該段曲線與匯出按鈕，最多保留最近 {MAX_KEPT_SEGMENTS} 段。關閉網頁前請先下載。</p>}
    </section>
  </>;
}
