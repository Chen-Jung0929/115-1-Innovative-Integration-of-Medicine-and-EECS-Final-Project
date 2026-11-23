import {expect,it} from 'vitest';
import {fullFrameSelection} from './singleSubject';
import {DEFAULT_PIPELINE} from '../domain/pipeline';
import {roiAt} from '../tracking/keyframes';
it('full-frame single is the shared default, with no invented manual annotation',()=>{
 expect(DEFAULT_PIPELINE).toEqual({id:'full-frame-single',numPoses:1});
 for(const [w,h] of [[1920,1080],[360,640]]){
  const s=fullFrameSelection(w!,h!);
  expect(s.roi).toEqual({x:0,y:0,width:w,height:h});expect(s.correctionSource).toBe('controlled-single-default');
  expect(s.keyframes[0]!.source).toBe('controlled-single-default');
  const proposal=roiAt({...s,method:'manual-keyframes'},400,w!,h!);expect(proposal.manualKeyframeId).toBeNull();expect(proposal.roiSource).toBe('full-frame-default');
 }
});
it('new uploads have independent settings and invalid dimensions fail clearly',()=>{
 const a=fullFrameSelection(640,360),b=fullFrameSelection(640,360);a.roi.width=32;
 expect(b.roi.width).toBe(640);expect(a.id).not.toBe(b.id);
 expect(()=>fullFrameSelection(NaN,360)).toThrow();expect(()=>fullFrameSelection(0,360)).toThrow();
});
