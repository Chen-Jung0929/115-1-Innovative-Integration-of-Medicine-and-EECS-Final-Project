/**
 * Live segment video recording (ADR-091). Videos stay in this browser's memory until the user downloads them;
 * nothing is uploaded. Recording never feeds inference: the model still reads the un-mirrored camera frame.
 */

/** MP4 (H.264) when the browser supports it (Safari, recent Chrome), otherwise WebM. Returns '' when none is supported. */
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
export function startRecorder(stream: MediaStream, videoBitsPerSecond = 1_200_000): SegmentRecorder | null {
  if (!canRecord()) return null;
  const mimeType = pickRecorderMime(t => MediaRecorder.isTypeSupported(t));
  let recorder: MediaRecorder;
  try { recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond }); } catch { return null; }
  const chunks: Blob[] = [];
  recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  try { recorder.start(1000); } catch { return null; } // 1 s chunks: a crash mid-segment still leaves earlier data.
  return {
    stop: () => new Promise(resolve => {
      // Whatever was recorded is kept, even after an error; a missing stop event times out instead of hanging.
      let done = false;
      const finish = () => { if (done) return; done = true; clearTimeout(timer); resolve(chunks.length ? new Blob(chunks, { type: recorder.mimeType || mimeType }) : null); };
      const timer = setTimeout(finish, 5000);
      if (recorder.state === 'inactive') { finish(); return; }
      recorder.onstop = finish; recorder.onerror = finish;
      try { recorder.stop(); } catch { finish(); }
    }),
  };
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000); // Large videos: give the browser time to start the save.
}
