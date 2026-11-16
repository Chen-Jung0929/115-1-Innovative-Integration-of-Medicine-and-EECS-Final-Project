import {expect,it} from 'vitest';
import {roiAt,checkedKeyframes} from './keyframes';
import {selection} from '../test/fixtures';
const a={id:'a',timeMs:0,roi:{x:0,y:0,width:160,height:100},source:'manual-target-confirmation' as const};
const b={id:'b',timeMs:1000,roi:{x:100,y:50,width:200,height:120},source:'manual-target-confirmation' as const};
const plan={...selection,method:'manual-keyframes' as const,keyframes:[a,b]};
it('linearly interpolates ROI in source pixels, without interpolating landmarks or angles',()=>{
 expect(roiAt(plan,500,640,360)).toEqual({roi:{x:50,y:25,width:180,height:110},roiSource:'keyframe-interpolated',roiUpdateReason:'linear-source-pixels-v1',manualKeyframeId:'a'});
 expect(roiAt(plan,1000,640,360).manualKeyframeId).toBe('b');expect(roiAt(plan,1500,640,360).roi).toEqual(b.roi);
 expect(plan.keyframes[0]).toEqual(a);
});
it('requires a unique in-bounds zero keyframe and preserves input objects',()=>{
 expect(checkedKeyframes([b,a],640,360,2000).map(k=>k.id)).toEqual(['a','b']);
 expect(()=>checkedKeyframes([b],640,360,2000)).toThrow('0 秒');
 expect(()=>checkedKeyframes([a,a],640,360,2000)).toThrow('唯一');
 expect(()=>checkedKeyframes([a,b],640,360,1000)).toThrow();
});
it('holds fixed ROI independently of time',()=>{expect(roiAt(selection,900,320,180).roi).toEqual(selection.roi);});
