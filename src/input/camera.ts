/** Live camera input adapter. Only obtains frames; pose, angles and QC stay in shared core modules. */
export type Facing = 'user' | 'environment';

export function cameraConstraints(facing: Facing, deviceId?: string): MediaStreamConstraints {
  // Ideal values only: the browser may pick a lower resolution/frame rate that the device supports.
  const size = { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } };
  // A chosen deviceId is exact: some tablets ignore an ideal facingMode and always return the front camera.
  return { audio: false, video: deviceId ? { deviceId: { exact: deviceId }, ...size } : { facingMode: { ideal: facing }, ...size } };
}

export type CameraInfo = { deviceId: string; label: string };

/** Guesses a camera's direction from its label (labels are only filled after camera permission). */
export function facingFromLabel(label: string): Facing | null {
  if (/back|rear|environment|world|後/i.test(label)) return 'environment';
  if (/front|user|facetime|selfie|前/i.test(label)) return 'user';
  return null;
}

/**
 * Picks the camera to use for a direction when the browser ignored facingMode. Prefers a label match, otherwise
 * any camera other than the one currently open. Device type (phone, tablet, laptop) is never checked: any device
 * with two or more cameras can switch.
 */
export function pickCamera(cameras: CameraInfo[], facing: Facing, currentId?: string): CameraInfo | null {
  const byLabel = cameras.filter(c => facingFromLabel(c.label) === facing);
  if (byLabel.length) return byLabel.find(c => c.deviceId !== currentId) ?? byLabel[0] ?? null;
  return cameras.find(c => c.deviceId && c.deviceId !== currentId) ?? null;
}

export async function listCameras(): Promise<CameraInfo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter(d => d.kind === 'videoinput').map(d => ({ deviceId: d.deviceId, label: d.label }));
}

function trackFacing(stream: MediaStream): Facing | null {
  const track = stream.getVideoTracks()[0];
  const setting = track?.getSettings?.().facingMode;
  if (setting === 'user' || setting === 'environment') return setting;
  return track ? facingFromLabel(track.label) : null;
}

/** Opens the requested direction; if the browser returned the other direction, retries with an explicit camera. */
async function requestStream(facing: Facing): Promise<MediaStream> {
  const first = await navigator.mediaDevices.getUserMedia(cameraConstraints(facing));
  const got = trackFacing(first);
  if (got === facing) return first;
  const cameras = await listCameras().catch(() => []);
  if (cameras.length < 2) return first; // Only one camera (most laptops): use it whatever its direction.
  const currentId = first.getVideoTracks()[0]?.getSettings?.().deviceId;
  // Direction unknown and labels unknown: keep the browser's choice rather than guess.
  if (got === null && !cameras.some(c => facingFromLabel(c.label))) return first;
  const pick = pickCamera(cameras, facing, currentId);
  if (!pick || pick.deviceId === currentId) return first;
  first.getTracks().forEach(track => track.stop()); // Many tablets cannot open two cameras at once.
  try { return await navigator.mediaDevices.getUserMedia(cameraConstraints(facing, pick.deviceId)); }
  catch { return navigator.mediaDevices.getUserMedia(cameraConstraints(facing)); }
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
  const stream = await requestStream(facing);
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
