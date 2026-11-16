import type { Roi } from '../domain/tracking';
export type Handle='move'|'n'|'s'|'e'|'w'|'nw'|'ne'|'sw'|'se';
const clamp=(n:number,lo:number,hi:number)=>Math.min(hi,Math.max(lo,Number.isFinite(n)?n:lo));
export function fitRoi(roi:Roi,width:number,height:number):Roi {
  const x=Math.round(clamp(roi.x,0,width-32)),y=Math.round(clamp(roi.y,0,height-32));
  return {x,y,width:Math.round(clamp(roi.width,32,width-x)),height:Math.round(clamp(roi.height,32,height-y))};
}
export function editRoi(roi:Roi,handle:Handle,dx:number,dy:number,width:number,height:number):Roi {
  if(handle==='move')return {...roi,x:Math.round(clamp(roi.x+dx,0,width-roi.width)),y:Math.round(clamp(roi.y+dy,0,height-roi.height))};
  let l=roi.x,r=l+roi.width,t=roi.y,b=t+roi.height;
  if(handle.includes('w'))l=clamp(l+dx,0,r-32);
  if(handle.includes('e'))r=clamp(r+dx,l+32,width);
  if(handle.includes('n'))t=clamp(t+dy,0,b-32);
  if(handle.includes('s'))b=clamp(b+dy,t+32,height);
  return {x:Math.round(l),y:Math.round(t),width:Math.round(r-l),height:Math.round(b-t)};
}
export function sourcePoint(clientX:number,clientY:number,bounds:{left:number;top:number;width:number;height:number},width:number,height:number) {
  return {x:clamp((clientX-bounds.left)*width/bounds.width,0,width),y:clamp((clientY-bounds.top)*height/bounds.height,0,height)};
}
