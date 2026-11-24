import { describe, expect, it, vi } from 'vitest';
import { checkFile, seekFrame, observePresentedFrame, resolveDuration } from './video';
it('rejects empty, unsupported and oversized files', () => {
  expect(()=>checkFile(new File(['x'],'a.avi',{type:'video/x-msvideo'}))).toThrow('目前支援 MP4、MOV');
  expect(()=>checkFile(new File(['x'],'IMG_0001.HEIC',{type:'image/heic'}))).toThrow('這是照片');
  expect(()=>checkFile(new File(['x'],'a.mp4',{type:'image/png'}))).toThrow('目前支援');
  for(const [name,type] of <[string,string][]>[['IMG_0001.MOV','video/quicktime'],['a.m4v','video/x-m4v'],['rec.webm','video/webm;codecs=vp9'],['a.mov','']])expect(()=>checkFile(new File(['x'],name,{type}))).not.toThrow();
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

describe('MediaRecorder files with an unknown duration (ADR-099)', ()=>{
 function recorded(){
  const t=new EventTarget();let duration=Infinity,time=0;
  const v=Object.defineProperties(t,{duration:{get:()=>duration},currentTime:{get:()=>time,set:(x:number)=>{time=x;}}}) as unknown as HTMLVideoElement;
  return {v,setDuration(d:number){duration=d;t.dispatchEvent(new Event('durationchange'));},seeked(){t.dispatchEvent(new Event('seeked'));},get time(){return time;}};
 }
 it('waits past an early durationchange that still says Infinity, then returns to the start', async()=>{
  const r=recorded();const p=resolveDuration(r.v,new AbortController().signal);
  expect(r.time).toBe(1e101);r.setDuration(Infinity);r.setDuration(4.2);
  await Promise.resolve();expect(r.time).toBe(0);r.seeked();await p;expect(r.v.duration).toBe(4.2);
 });
 it('gives up after the timeout without hanging, and honours cancellation', async()=>{
  vi.useFakeTimers();
  try{const r=recorded();const p=resolveDuration(r.v,new AbortController().signal,100);await vi.advanceTimersByTimeAsync(250);await p;expect(r.v.duration).toBe(Infinity);}
  finally{vi.useRealTimers();}
  const r=recorded(),abort=new AbortController();const p=resolveDuration(r.v,abort.signal);abort.abort();
  await expect(p).rejects.toMatchObject({name:'AbortError'});
 });
});
