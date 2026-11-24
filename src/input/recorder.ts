/**
 * Live segment video recording (ADR-091). Videos stay in this browser's memory until the user downloads them;
 * nothing is uploaded. Recording never feeds inference: the model still reads the un-mirrored camera frame.
 */
export type SegmentVideos = { raw: Blob | null; skeleton: Blob | null };

/** Safari records MP4 (H.264); Chrome / Edge / Firefox record WebM. Returns '' when none is supported. */
export function pickRecorderMime(isSupported: (type: string) => boolean): string {
  const candidates = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  return candidates.find(type => { try { return isSupported(type); } catch { return false; } }) ?? '';
}

export function videoExtension(mime: string): 'mp4' | 'webm' { return mime.startsWith('video/mp4') ? 'mp4' : 'webm'; }

export function canRecord(): boolean {
  return typeof MediaRecorder !== 'undefined' && pickRecorderMime(t => MediaRecorder.isTypeSupported(t)) !== '';
}

export type SegmentRecorder = { stop(): Promise<Blob | null> };

/** Starts recording a stream; stop() resolves with the whole video, or null if nothing was recorded. */
export function startRecorder(stream: MediaStream): SegmentRecorder | null {
  if (!canRecord()) return null;
  const mimeType = pickRecorderMime(t => MediaRecorder.isTypeSupported(t));
  let recorder: MediaRecorder;
  try { recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2_500_000 }); } catch { return null; }
  const chunks: Blob[] = [];
  recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  try { recorder.start(1000); } catch { return null; } // 1 s chunks: a crash mid-segment still leaves earlier data.
  return {
    stop: () => new Promise(resolve => {
      if (recorder.state === 'inactive') { resolve(chunks.length ? new Blob(chunks, { type: mimeType }) : null); return; }
      recorder.onstop = () => resolve(chunks.length ? new Blob(chunks, { type: recorder.mimeType || mimeType }) : null);
      recorder.onerror = () => resolve(null);
      recorder.stop();
    }),
  };
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000); // Large videos: give the browser time to start the save.
}
