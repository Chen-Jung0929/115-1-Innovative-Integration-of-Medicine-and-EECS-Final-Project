import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import type { Landmark } from '../domain/analysis';
import pkg from '../../package.json';
export const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
export const PROJECT_MODEL_URL = `${import.meta.env.BASE_URL}models/pose_landmarker_lite.task`;
export const MODEL_VERSION = pkg.dependencies['@mediapipe/tasks-vision'];
export interface PoseEngine { detect(frame: HTMLCanvasElement, timeMs: number): Landmark[]; close(): void }
export async function createPoseEngine(bytes: Uint8Array): Promise<PoseEngine> {
  const files = await FilesetResolver.forVisionTasks(`${import.meta.env.BASE_URL}mediapipe/wasm`);
  const pose = await PoseLandmarker.createFromOptions(files, {
    baseOptions: { modelAssetBuffer: bytes, delegate: 'CPU' }, runningMode: 'VIDEO', numPoses: 1,
    minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
  });
  return { detect: (frame, timeMs) => pose.detectForVideo(frame, timeMs).landmarks[0]?.map(p => ({ x: p.x, y: p.y, visibility: p.visibility, ...(p.presence !== undefined ? { presence: p.presence } : {}) })) ?? [], close: () => pose.close() };
}
export async function modelBytes(file: File | null, signal: AbortSignal, allowOfficialDownload = false): Promise<{ bytes: Uint8Array; hash: string; id: string }> {
  let buffer: ArrayBuffer;
  let id = 'local-task-file';
  if (file) {
    if (!file.size || file.size > 50 * 1024 * 1024) throw new Error('模型檔須介於 1 byte 與 50 MB。');
    buffer = await file.arrayBuffer();
  } else {
    const response = await fetch(PROJECT_MODEL_URL, { signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]) });
    // SPA servers often return index.html with HTTP 200 for a missing public asset.
    const missing = response.status === 404 || (response.ok && response.headers.get('content-type')?.includes('text/html'));
    if (missing) {
      if (!allowOfficialDownload) throw new Error('找不到專案本機模型。請將官方模型放在 public/models/pose_landmarker_lite.task，或在模型設定選取 Mac 上的 .task 檔；也可明確勾選允許官方下載。');
      const official = await fetch(MODEL_URL, { signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]) });
      if (!official.ok) throw new Error(`官方模型下載失敗（${official.status}），請改選本機 .task 模型。`);
      buffer = await official.arrayBuffer(); id = MODEL_URL;
    } else {
      if (!response.ok) throw new Error(`專案本機模型無法讀取（${response.status}）。請檢查 public/models 與靜態檔部署設定。`);
      buffer = await response.arrayBuffer(); id = PROJECT_MODEL_URL;
    }
  }
  signal.throwIfAborted();
  if (!buffer.byteLength || buffer.byteLength > 50 * 1024 * 1024) throw new Error('模型檔須介於 1 byte 與 50 MB，請確認下載的是官方 .task 檔。');
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))].map(b => b.toString(16).padStart(2, '0')).join('');
  return { bytes: new Uint8Array(buffer), hash, id };
}
