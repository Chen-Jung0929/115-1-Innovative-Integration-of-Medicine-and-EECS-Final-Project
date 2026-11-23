import {expect,it} from 'vitest';
import {editRoi,fitRoi,sourcePoint} from './editRoi';
const r={x:100,y:50,width:200,height:100};
it('moves without resizing and clamps within source boundaries',()=>{
 expect(editRoi(r,'move',1000,-1000,640,360)).toEqual({x:440,y:0,width:200,height:100});
});
it.each(['n','s','e','w','nw','ne','sw','se'] as const)('resizes %s with 32 px minimum and source clipping',handle=>{
 const q=editRoi(r,handle,-1000,1000,640,360);expect(q.x).toBeGreaterThanOrEqual(0);expect(q.y).toBeGreaterThanOrEqual(0);expect(q.width).toBeGreaterThanOrEqual(32);expect(q.height).toBeGreaterThanOrEqual(32);expect(q.x+q.width).toBeLessThanOrEqual(640);expect(q.y+q.height).toBeLessThanOrEqual(360);
});
it('maps scaled/offset portrait display coordinates to source pixels',()=>{
 expect(sourcePoint(110,220,{left:10,top:20,width:200,height:400},1000,2000)).toEqual({x:500,y:1000});
 expect(fitRoi({x:600,y:330,width:200,height:200},640,360)).toEqual({x:600,y:328,width:40,height:32});
});
