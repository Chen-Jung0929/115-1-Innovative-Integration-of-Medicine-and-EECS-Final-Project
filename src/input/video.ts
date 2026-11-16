import { MAX_DURATION_SECONDS } from '../domain/analysis';
export function checkFile(file: File): void {
  if (!/\.mp4$/i.test(file.name) || (file.type && file.type !== 'video/mp4')) throw new Error('僅支援 MP4 影片；請選擇 .mp4 檔案。');
  if (file.size === 0) throw new Error('影片檔案是空的。');
  if (file.size > 500 * 1024 * 1024) throw new Error('V0 最多支援 500 MB，請先在本機裁短影片。');
}
export async function loadVideo(video: HTMLVideoElement, url: string, signal: AbortSignal): Promise<void> {
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
/** Seek on a separate decoder and wait for a presented frame, not just a timer. */
export function seekFrame(video: HTMLVideoElement, seconds: number, signal: AbortSignal): Promise<number> {
  return new Promise((resolve, reject) => {
    let callbackId = 0;
    let seekDone = false;
    let frameTime: number | undefined;
    const timer = setTimeout(() => finish(undefined, new Error('影片影格解碼逾時，請換用 H.264 MP4。')), 15000);
    const cleanup = () => { clearTimeout(timer); video.cancelVideoFrameCallback(callbackId); video.removeEventListener('seeked', seeked); video.removeEventListener('error', fail); signal.removeEventListener('abort', abort); };
    const finish = (time?: number, error?: Error) => { cleanup(); if (error) reject(error); else resolve(time!); };
    const done = () => { if (seekDone && frameTime !== undefined) finish(frameTime); };
    const seeked = () => { seekDone = true; done(); };
    const fail = () => finish(undefined, new Error('影片解碼失敗。'));
    const abort = () => finish(undefined, new DOMException('已取消', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) { abort(); return; }
    video.addEventListener('seeked', seeked, { once: true }); video.addEventListener('error', fail, { once: true });
    callbackId = video.requestVideoFrameCallback((_now, metadata) => { frameTime = metadata.mediaTime * 1000; done(); });
    video.currentTime = seconds;
  });
}
export function releaseVideo(video: HTMLVideoElement): void {
  video.pause(); video.removeAttribute('src'); video.load(); video.remove();
}
