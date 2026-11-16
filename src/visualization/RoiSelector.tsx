import { useRef } from 'react';
import type { Roi } from '../domain/tracking';
export function RoiSelector({width,height,roi,onChange}:{width:number;height:number;roi:Roi;onChange:(roi:Roi)=>void}) {
  const start=useRef<{x:number;y:number}|null>(null);
  const coordinate=(e:React.PointerEvent<SVGSVGElement>)=>{
    const bounds=e.currentTarget.getBoundingClientRect();
    return {x:Math.max(0,Math.min(width,(e.clientX-bounds.left)*width/bounds.width)),y:Math.max(0,Math.min(height,(e.clientY-bounds.top)*height/bounds.height))};
  };
  return <svg className="roi-selector" viewBox={`0 0 ${width} ${height}`} aria-label="在影片起點框選受測者" onPointerDown={e=>{start.current=coordinate(e);e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{
    if(!start.current)return;const end=coordinate(e);onChange({x:Math.round(Math.min(start.current.x,end.x)),y:Math.round(Math.min(start.current.y,end.y)),width:Math.round(Math.abs(start.current.x-end.x)),height:Math.round(Math.abs(start.current.y-end.y))});
  }} onPointerUp={()=>{start.current=null;}} onPointerCancel={()=>{start.current=null;}}><rect x={roi.x} y={roi.y} width={roi.width} height={roi.height} fill="#1cd9ac22" stroke="#ffda57" strokeWidth={Math.max(2,width/200)} /></svg>;
}
