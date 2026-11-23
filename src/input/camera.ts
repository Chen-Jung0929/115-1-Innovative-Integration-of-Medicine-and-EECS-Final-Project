/** Live camera input adapter. Only obtains frames; pose, angles and QC stay in shared core modules. */
export type Facing = 'user' | 'environment';

export function cameraConstraints(facing: Facing): MediaStreamConstraints {
  // Ideal values only: the browser may pick a lower resolution/frame rate that the device supports.
  return { audio: false, video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } } };
}

/** Returns a Traditional Chinese reason when this page cannot use a camera, otherwise null. */
export function cameraUnavailableReason(env: { isSecureContext: boolean; hasMediaDevices: boolean; hasFrameCallback: boolean }): string | null {
  if (!env.isSecureContext) return '瀏覽器只允許在 https 或本機 localhost 網址使用鏡頭。手機請改用 https 網址開啟。';
  if (!env.hasMediaDevices) return '此瀏覽器不支援鏡頭存取，請使用新版 Chrome、Edge 或 Safari。';
  if (!env.hasFrameCallback) return '此瀏覽器不支援精確的影格回呼，請使用新版 Chrome 或 Edge。';
  return null;
}

export function cameraErrorMessage(error: unknown): string {
  const name = error instanceof DOMException || error instanceof Error ? error.name : '';
  switch (name) {
    case 'NotAllowedError': case 'SecurityError': return '鏡頭權限被拒絕。請在瀏覽器網址列旁的權限設定允許使用鏡頭，再按一次開啟鏡頭。';
    case 'NotFoundError': case 'OverconstrainedError': return '找不到可用的鏡頭。請確認裝置有鏡頭，或改選另一個鏡頭方向。';
    case 'NotReadableError': case 'AbortError': return '鏡頭可能正被其他程式（例如視訊會議）使用，請關閉後再試。';
    default: return `無法開啟鏡頭：${error instanceof Error ? error.message : String(error)}`;
  }
}

export async function openCamera(video: HTMLVideoElement, facing: Facing, signal: AbortSignal): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getUserMedia(cameraConstraints(facing));
  try {
    signal.throwIfAborted();
    video.muted = true; video.playsInline = true; video.srcObject = stream;
    await video.play();
    if (!video.videoWidth || !video.videoHeight) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('鏡頭沒有回傳畫面，請重試。')), 5000);
        video.addEventListener('loadeddata', () => { clearTimeout(timer); resolve(); }, { once: true });
      });
    }
    signal.throwIfAborted();
    return stream;
  } catch (e) { stopCamera(stream, video); throw e; }
}

export function stopCamera(stream: MediaStream | null, video: HTMLVideoElement | null): void {
  stream?.getTracks().forEach(track => track.stop());
  if (video) { video.pause(); video.srcObject = null; }
}
