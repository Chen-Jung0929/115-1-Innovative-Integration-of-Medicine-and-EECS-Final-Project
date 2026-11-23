import { expect, it } from 'vitest';
import { checkedRoi,fromCrop } from './roi';
import { kneeAngle } from '../biomechanics/knee';
import { humanPose } from '../test/fixtures';
it('rounds source-pixel ROI and rejects invalid / out-of-frame crops',()=>{
 expect(checkedRoi({x:10.2,y:20,width:100.3,height:80},640,360)).toEqual({x:10,y:20,width:100,height:80});
 for(const roi of [{x:-1,y:0,width:100,height:100},{x:600,y:0,width:100,height:100},{x:0,y:0,width:10,height:100},{x:NaN,y:0,width:100,height:100}]) expect(()=>checkedRoi(roi,640,360)).toThrow();
});
it.each([[1000,500],[500,1000]])('maps crop coordinates back without distorting angles (%i x %i)',(width,height)=>{
 const p=humanPose();p[23]={x:.2,y:.3,visibility:1};p[25]={x:.4,y:.3,visibility:1};p[27]={x:.4,y:.5,visibility:1};
 const roi={x:100,y:50,width:200,height:300};const mapped=fromCrop(p,roi,width,height);
 expect(mapped[23]!.x*width).toBeCloseTo(140);expect(mapped[23]!.y*height).toBeCloseTo(140);
 expect(kneeAngle(mapped,'left',width,height).rawAngleDeg).toBeCloseTo(90);
 expect(kneeAngle(mapped,'left',width,height).rawAngleDeg).toBeCloseTo(kneeAngle(p,'left',200,300).rawAngleDeg!);
});
it('retains out-of-crop coordinates and scores for diagnostic QC',()=>{
 const p={x:-.2,y:1.2,visibility:.9,presence:.8};
 const result=fromCrop([p],{x:10,y:20,width:100,height:100},200,200)[0]!;
 expect(result.x).toBe(-.05);expect(result.y).toBe(.7);expect(result.visibility).toBe(.9);expect(p.x).toBe(-.2);
});
