import type { FrameRead } from '../domain/video';
import { MAX_DURATION_SECONDS } from '../domain/analysis';
export function checkFile(file: File): void {
  if (!/\.mp4$/i.test(file.name) || (file.type && file.type !== 'video/mp4')) throw new Error('僅支援 MP4 影片；請選擇 .mp4 檔案。');
  if (file.size === 0) throw new Error('影片檔案是空的。');
  if (file.size > 500 * 1024 * 1024) throw new Error('V0 最多支援 500 MB，請先在本機裁短影片。');
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
    const fail = () => finish(new Error('無法解碼影片：檔案可能損壞，或此瀏覽器不支援其編碼。建議使用 H.264 MP4。'));
    const abort = () => finish(new DOMException('已取消', 'AbortError'));
    video.addEventListener('loadeddata', ready, { once: true }); video.addEventListener('error', fail, { once: true }); signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) { abort(); return; }
    video.preload = 'auto'; video.muted = true; video.src = url; video.load();
  });
  if (!Number.isFinite(video.duration) || video.duration <= 0 || !video.videoWidth || !video.videoHeight) throw new Error('無法取得有效影片長度或尺寸。');
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
