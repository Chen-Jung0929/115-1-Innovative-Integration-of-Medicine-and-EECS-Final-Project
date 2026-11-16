import { expect, it, vi } from 'vitest';
import { checkFile, seekFrame } from './video';
it('rejects empty, unsupported and oversized files', () => {
  expect(()=>checkFile(new File(['x'],'a.mov',{type:'video/quicktime'}))).toThrow('僅支援 MP4');
  expect(()=>checkFile(new File([],'a.mp4',{type:'video/mp4'}))).toThrow('空的');
  expect(()=>checkFile({name:'a.mp4',type:'video/mp4',size:501*1024*1024} as File)).toThrow('500 MB');
  expect(()=>checkFile(new File(['x'],'a.MP4',{type:'video/mp4'}))).not.toThrow();
});
function decoder() {
  const target=new EventTarget();
  let callback: VideoFrameRequestCallback=()=>{};
  return Object.assign(target,{currentTime:0,requestVideoFrameCallback:vi.fn((cb:VideoFrameRequestCallback)=>{callback=cb;return 1;}),cancelVideoFrameCallback:vi.fn(),present:(time:number)=>callback(0,{mediaTime:time} as VideoFrameCallbackMetadata)}) as unknown as HTMLVideoElement & {present(time:number):void};
}
it('waits for both seek completion and actual presented media timestamp', async () => {
  const v=decoder(); const p=seekFrame(v,.2,new AbortController().signal);
  v.present(.166667); v.dispatchEvent(new Event('seeked'));
  expect(await p).toBeCloseTo(166.667); expect(v.cancelVideoFrameCallback).toHaveBeenCalled();
});
it('supports reverse callback order and cancellation', async () => {
  const v=decoder(); const p=seekFrame(v,.2,new AbortController().signal);
  v.dispatchEvent(new Event('seeked')); v.present(.2); expect(await p).toBe(200);
  const abort=new AbortController(); const rejected=seekFrame(v,.4,abort.signal); abort.abort(); await expect(rejected).rejects.toMatchObject({name:'AbortError'});
});
it('times out a decoder that cannot produce frames', async () => {
  vi.useFakeTimers();
  try { const p=seekFrame(decoder(),.2,new AbortController().signal); const assertion=expect(p).rejects.toThrow('解碼逾時'); await vi.advanceTimersByTimeAsync(15000); await assertion; } finally { vi.useRealTimers(); }
});
