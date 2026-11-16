import {expect,it,vi} from 'vitest';
import {comparePipelines} from './compare';
import {selection} from '../test/fixtures';
import type {Session} from '../domain/analysis';
vi.mock('../pose/mediapipe',()=>({modelBytes:vi.fn().mockResolvedValue({bytes:new Uint8Array([1]),hash:'fixed-model',id:'test'})}));
it('freezes one source/model/config, runs A/B-adaptive/C and records isolated failures',async()=>{
 const calls:unknown[][]=[];const initialX:number[]=[];
 const execute:typeof import('./analyze').analyze=async(...args)=>{calls.push(args);initialX.push(args[4].roi.x);args[4].roi.x=999;if(args[7]!.pipeline!.id==='full-frame-multi')throw new Error('synthetic unsupported');return {sourceFilename:args[1]} as Session;};
 const before=structuredClone(selection);
 const bundle=await comparePipelines('blob:synthetic',new File(['abc'],'synthetic.mp4'),null,false,selection,3,new AbortController().signal,()=>{},execute);
 expect(calls).toHaveLength(3);expect(calls.map(c=>(c[7] as {pipeline:{numPoses:number}}).pipeline.numPoses)).toEqual([1,1,3]);
 expect((calls[1]![4] as typeof selection).method).toBe('adaptive-roi');expect(initialX).toEqual([selection.roi.x,selection.roi.x,selection.roi.x]);
 expect(selection).toEqual(before);expect(bundle.sourceSha256).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');expect(bundle.entries[2]!.session).toBeNull();expect(bundle.entries[2]!.error).toContain('unsupported');
 expect(calls.every(c=>(c[7] as {asset:{hash:string}}).asset.hash==='fixed-model')).toBe(true);
});
it('cancellation never silently converts an interrupted comparison into a completed bundle',async()=>{
 const abort=new AbortController();const execute:typeof import('./analyze').analyze=async()=>{abort.abort();throw new Error('interrupted');};
 await expect(comparePipelines('blob:test',new File(['abc'],'test.mp4'),null,false,selection,2,abort.signal,()=>{},execute)).rejects.toThrow();
});
