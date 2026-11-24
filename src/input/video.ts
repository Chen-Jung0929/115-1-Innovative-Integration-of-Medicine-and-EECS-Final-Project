import type { FrameRead } from '../domain/video';
import { MAX_DURATION_SECONDS } from '../domain/analysis';
/** Upload formats (ADR-099): MP4 / M4V, iPhone MOV and WebM; decoding still depends on the browser. */
export const VIDEO_ACCEPT='.mp4,.m4v,.mov,.webm,video/mp4,video/x-m4v,video/quicktime,video/webm';
const VIDEO_EXTENSION=/\.(mp4|m4v|mov|webm)$/i;
const VIDEO_TYPES=new Set(['video/mp4','video/x-m4v','video/quicktime','video/webm','application/octet-stream']);
/** Shown whenever the browser cannot decode the picture (often iPhone HEVC "High Efficiency" video on Windows). */
export const DECODE_HELP='這台裝置的瀏覽器播不了這支影片的畫面（可能是編碼不支援，或檔案損壞）。iPhone 影片請到「設定 > 相機 > 格式」改成「最相容」後重錄，或用轉檔 App 轉成一般 MP4（H.264）再上傳。';
export function checkFile(file: File): void {
  const type=file.type.split(';')[0]!.trim().toLowerCase();
  if (/\.(heic|heif|jpe?g|png)$/i.test(file.name)) throw new Error('這是照片，不是影片；動作分析需要影片（MP4、MOV、M4V 或 WebM）。');
  if (!VIDEO_EXTENSION.test(file.name) || (type && !VIDEO_TYPES.has(type))) throw new Error('目前支援 MP4、MOV、M4V、WebM 影片；請選擇這些格式的檔案。');
  if (file.size === 0) throw new Error('影片檔案是空的。');
  if (file.size > 500 * 1024 * 1024) throw new Error('V0 最多支援 500 MB，請先在本機裁短影片。');
}
/**
 * MediaRecorder files (WebM, some MP4) report an unknown duration until the end has been reached once;
 * jumping far ahead makes the browser compute it, then the decoder returns to the start.
 */
export async function resolveDuration(video: HTMLVideoElement, signal: AbortSignal, timeoutMs = 3000): Promise<void> {
  if (Number.isFinite(video.duration)) return;
  const wait=(event:string,ms:number,until:()=>boolean)=>new Promise<void>(resolve=>{
    const check=()=>{if(until()||signal.aborted)done();};
    const done=()=>{clearTimeout(timer);video.removeEventListener(event,check);signal.removeEventListener('abort',done);resolve();};
    const timer=setTimeout(done,ms);video.addEventListener(event,check);signal.addEventListener('abort',done,{once:true});
  });
  // Some engines fire durationchange before the real value: keep waiting until the duration is finite.
  const found=wait('durationchange',timeoutMs,()=>Number.isFinite(video.duration));video.currentTime=1e101;await found;signal.throwIfAborted();
  const back=wait('seeked',timeoutMs,()=>Math.abs(video.currentTime)<1e-6);video.currentTime=0;await back;signal.throwIfAborted();
}
export async function loadVideo(video: HTMLVideoElement, url: string, signal: AbortSignal): Promise<void> {
  frames.delete(video);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error('讀取影片逾時，請確認影片可解碼。')), 20000);
    const finish = (error?: Error) => {
      clearTimeout(timer); video.removeEventListener('loadeddata', ready); video.removeEventListener('error', fail); signal.removeEventListener('abort', abort);
      if (error) reject(error); else resolve();
    };
    const ready = () => finish();
    const fail = () => finish(new Error(`無法解碼影片：${DECODE_HELP}`));
    const abort = () => finish(new DOMException('已取消', 'AbortError'));
    video.addEventListener('loadeddata', ready, { once: true }); video.addEventListener('error', fail, { once: true }); signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) { abort(); return; }
    video.preload = 'auto'; video.muted = true; video.src = url; video.load();
  });
  // An undecodable video track (e.g. HEVC without hardware support) may still load the audio: width 0.
  if (!video.videoWidth || !video.videoHeight) throw new Error(DECODE_HELP);
  await resolveDuration(video, signal);
  if (!Number.isFinite(video.duration) || video.duration <= 0) throw new Error('無法取得有效影片長度。');
  if (video.duration > MAX_DURATION_SECONDS) throw new Error('V0 最多分析 10 分鐘，請先在本機裁短影片。');
  if (!video.requestVideoFrameCallback) throw new Error('此瀏覽器不支援精確的影格回呼，請使用新版 Chrome 或 Edge。');
}
const frames = new WeakMap<HTMLVideoElement, {position:number; frame:FrameRead}>();
export function observePresentedFrame(video:HTMLVideoElement, mediaTimeSeconds:number):void {
  if (!video.seeking && Number.isFinite(mediaTimeSeconds)) frames.set(video,{position:video.currentTime,frame:{sourceTimeMs:mediaTimeSeconds*1000,timeBasis:'presentation',method:'callback',warnings:[]}});
}
export class FrameReadError extends Error {
  constructor(public code:string, public diagnostics:Record<string,unknown>) {
    super(`影片取樣等待失敗（${code}）：${JSON.stringify(diagnostics)}。請切回分頁並重試；此訊息不代表影片編碼不支援。`);
  }
}
/** Read a settled frame. A callback is preferred, but not required to re-fire on no-op seeks. */
export function seekFrame(video: HTMLVideoElement, seconds: number, signal: AbortSignal): Promise<FrameRead> {
  if (!Number.isFinite(seconds) || seconds<0) return Promise.reject(new Error('無效的取樣時間'));
  if(signal.aborted)return Promise.reject(new DOMException('已取消','AbortError'));
  const atTarget=()=>Math.abs(video.currentTime-seconds)<1e-6;
  const drawable=()=>!video.seeking && atTarget() && video.readyState>=2;
  const cached=frames.get(video);
  if(drawable() && cached && Math.abs(cached.position-video.currentTime)<1e-6) return Promise.resolve({...cached.frame,method:'cached'});
  return new Promise((resolve,reject)=>{
    let callbackId=0, seekedSeen=false, callbackSeen=false, finished=false;
    const noOp=atTarget() && !video.seeking;
    const started=Date.now();
    const diagnostics=()=>({requestedTime:seconds,currentTime:video.currentTime,readyState:video.readyState,networkState:video.networkState,paused:video.paused,seeking:video.seeking,seekedSeen,callbackSeen,noOp,visibility:typeof document==='undefined'?'unknown':document.visibilityState,mediaError:video.error?.code??null});
    const cleanup=()=>{clearTimeout(deadline);clearInterval(poll);video.cancelVideoFrameCallback(callbackId);video.removeEventListener('seeked',seeked);video.removeEventListener('error',fail);signal.removeEventListener('abort',abort);};
    const finish=(frame?:FrameRead,error?:Error)=>{
      if(finished)return;finished=true;cleanup();
      if(error)reject(error);else {frames.set(video,{position:video.currentTime,frame:frame!});resolve(frame!);}
    };
    const seeked=()=>{seekedSeen=true;};
    const fail=()=>finish(undefined,new FrameReadError('media-error',diagnostics()));
    const abort=()=>finish(undefined,new DOMException('已取消','AbortError'));
    const deadline=setTimeout(()=>finish(undefined,new FrameReadError(video.seeking?'seek-not-settled':'frame-unavailable',diagnostics())),15000);
    // A settled HAVE_CURRENT_DATA frame is drawable even when rVFC is throttled.
    // Its currentTime is explicitly an estimate, never relabeled as exact frame PTS.
    const poll=setInterval(()=>{
      if(drawable() && Date.now()-started>=150)finish({sourceTimeMs:video.currentTime*1000,timeBasis:'seek-position-estimate',method:'ready-frame',warnings:['presentation-callback-unavailable']});
    },25);
    video.addEventListener('seeked',seeked);video.addEventListener('error',fail);signal.addEventListener('abort',abort,{once:true});
    const presented:VideoFrameRequestCallback=(_now,data)=>{
      callbackSeen=true;
      if(drawable())finish({sourceTimeMs:data.mediaTime*1000,timeBasis:'presentation',method:'callback',warnings:[]});
      else callbackId=video.requestVideoFrameCallback(presented);
    };
    callbackId=video.requestVideoFrameCallback(presented);
    if(!noOp) {try {video.currentTime=seconds;}catch {finish(undefined,new FrameReadError('seek-rejected',diagnostics()));}}
  });
}
export function releaseVideo(video: HTMLVideoElement): void {
  frames.delete(video); video.pause(); video.removeAttribute('src'); video.load(); video.remove();
}
