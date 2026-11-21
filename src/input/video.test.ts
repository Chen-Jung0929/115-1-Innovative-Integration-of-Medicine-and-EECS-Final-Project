import { expect, it, vi } from 'vitest';
import { checkFile, seekFrame, observePresentedFrame } from './video';
it('rejects empty, unsupported and oversized files', () => {
  expect(()=>checkFile(new File(['x'],'a.mov',{type:'video/quicktime'}))).toThrow('僅支援 MP4');
  expect(()=>checkFile(new File([],'a.mp4',{type:'video/mp4'}))).toThrow('空的');
  expect(()=>checkFile({name:'a.mp4',type:'video/mp4',size:501*1024*1024} as File)).toThrow('500 MB');
  expect(()=>checkFile(new File(['x'],'a.MP4',{type:'video/mp4'}))).not.toThrow();
});
function decoder() {
  const target=new EventTarget();
  let callback: VideoFrameRequestCallback=()=>{};
  return Object.assign(target,{currentTime:0,readyState:2,networkState:1,seeking:false,paused:true,requestVideoFrameCallback:vi.fn((cb:VideoFrameRequestCallback)=>{callback=cb;return 1;}),cancelVideoFrameCallback:vi.fn(),present:(time:number)=>callback(0,{mediaTime:time} as VideoFrameCallbackMetadata)}) as unknown as HTMLVideoElement & {present(time:number):void};
}
it('waits for both seek completion and actual presented media timestamp', async () => {
  const v=decoder(); const p=seekFrame(v,.2,new AbortController().signal);
  v.present(.166667); v.dispatchEvent(new Event('seeked'));
  expect((await p).sourceTimeMs).toBeCloseTo(166.667); expect(v.cancelVideoFrameCallback).toHaveBeenCalled();
});
it('supports reverse callback order and cancellation', async () => {
  const v=decoder(); const p=seekFrame(v,.2,new AbortController().signal);
  v.dispatchEvent(new Event('seeked')); v.present(.2); expect((await p).sourceTimeMs).toBe(200);
  const abort=new AbortController(); const rejected=seekFrame(v,.4,abort.signal); abort.abort(); await expect(rejected).rejects.toMatchObject({name:'AbortError'});
});
it('times out a decoder that cannot produce frames', async () => {
  vi.useFakeTimers();
  try { const v=decoder();Object.defineProperty(v,'readyState',{value:0});const p=seekFrame(v,.2,new AbortController().signal); const assertion=expect(p).rejects.toThrow('frame-unavailable'); await vi.advanceTimersByTimeAsync(15000); await assertion; } finally { vi.useRealTimers(); }
});

it('reuses known frame at zero without waiting for new seeked or callback',async()=>{
 const v=decoder();observePresentedFrame(v,0);const frame=await seekFrame(v,0,new AbortController().signal);
 expect(frame.method).toBe('cached');expect(frame.timeBasis).toBe('presentation');expect(v.requestVideoFrameCallback).not.toHaveBeenCalled();
});
it('zero no-op and throttled paused decoder use explicit timestamp estimates',async()=>{
 vi.useFakeTimers();try{const v=decoder();const pending=seekFrame(v,0,new AbortController().signal);await vi.advanceTimersByTimeAsync(175);
 const frame=await pending;expect(frame.timeBasis).toBe('seek-position-estimate');expect(frame.sourceTimeMs).toBe(0);expect(frame.warnings).toContain('presentation-callback-unavailable');
 expect((await seekFrame(v,0,new AbortController().signal)).method).toBe('cached');
 }finally{vi.useRealTimers();}
});
it('settled seek can finish without a seeked event, retaining approximate provenance',async()=>{
 vi.useFakeTimers();try{const v=decoder();const pending=seekFrame(v,.4,new AbortController().signal);await vi.advanceTimersByTimeAsync(175);expect((await pending).sourceTimeMs).toBe(400);}finally{vi.useRealTimers();}
});
