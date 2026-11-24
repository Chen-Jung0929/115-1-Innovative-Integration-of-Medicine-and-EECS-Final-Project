import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import type { Landmark } from '../domain/analysis';
import pkg from '../../package.json';
export const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
export const PROJECT_MODEL_URL = `${import.meta.env.BASE_URL}models/pose_landmarker_lite.task`;
export const MODEL_VERSION = pkg.dependencies['@mediapipe/tasks-vision'];
export const MODEL_LOAD_ERROR = '模型載入失敗，請確認網路後重試';
type ModelAsset = { bytes: Uint8Array; hash: string; id: string };
let cachedModel: { file: File | null; asset: ModelAsset } | undefined;
let fileset: ReturnType<typeof FilesetResolver.forVisionTasks> | undefined;

export interface PoseEngine { detect(frame: HTMLCanvasElement, timeMs: number): Landmark[][]; close(): void }
export async function createPoseEngine(bytes: Uint8Array, numPoses = 1): Promise<PoseEngine> {
  // Each independent VIDEO stream needs its own tracking history and timestamp clock.
  fileset ??= FilesetResolver.forVisionTasks(`${import.meta.env.BASE_URL}mediapipe/wasm`).catch(() => {
    fileset = undefined;
    throw new Error(MODEL_LOAD_ERROR);
  });
  const files = await fileset;
  const pose = await PoseLandmarker.createFromOptions(files, {
    baseOptions: { modelAssetBuffer: bytes, delegate: 'CPU' }, runningMode: 'VIDEO', numPoses,
    minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
  }).catch(() => {
    if (cachedModel?.asset.bytes === bytes) cachedModel = undefined;
    throw new Error(MODEL_LOAD_ERROR);
  });
  return { detect: (frame, timeMs) => {
    const result = pose.detectForVideo(frame, timeMs);
    return result.landmarks.map((candidate, ci) => candidate.map((p, i) => {
      const w = result.worldLandmarks?.[ci]?.[i];
      return { x: p.x, y: p.y, z: p.z, visibility: p.visibility, ...(p.presence !== undefined ? { presence: p.presence } : {}), ...(w ? { world: [w.x, w.y, w.z] as [number, number, number] } : {}) };
    }));
  }, close: () => pose.close() };
}
export async function modelBytes(file: File | null, signal: AbortSignal, allowOfficialDownload = true): Promise<ModelAsset> {
  signal.throwIfAborted();
  if (cachedModel?.file === file && (allowOfficialDownload || cachedModel.asset.id !== MODEL_URL)) {
    return cachedModel.asset;
  }
  try {
    const asset = await readModel(file, signal, allowOfficialDownload);
    signal.throwIfAborted();
    cachedModel = { file, asset };
    return asset;
  } catch {
    signal.throwIfAborted();
    throw new Error(MODEL_LOAD_ERROR);
  }
}

async function readModel(file: File | null, signal: AbortSignal, allowOfficialDownload: boolean): Promise<ModelAsset> {
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
      if (!allowOfficialDownload) throw new Error(MODEL_LOAD_ERROR);
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
