import { useRef, type PointerEvent } from 'react';
import type { Roi } from '../domain/tracking';
import { editRoi, fitRoi, sourcePoint, type Handle } from '../tracking/editRoi';
export function RoiSelector({width,height,roi,onChange,drawNew=false,onDrawEnd}:{width:number;height:number;roi:Roi;onChange:(roi:Roi)=>void;drawNew?:boolean;onDrawEnd?:()=>void}) {
  const drag=useRef<{x:number;y:number;roi:Roi;handle:Handle|'draw'}|null>(null);
  const point=(e:PointerEvent<SVGSVGElement>)=>sourcePoint(e.clientX,e.clientY,e.currentTarget.getBoundingClientRect(),width,height);
  const update=(e:PointerEvent<SVGSVGElement>)=>{
    const start=drag.current;if(!start)return;const end=point(e);
    onChange(start.handle==='draw'?fitRoi({x:Math.min(start.x,end.x),y:Math.min(start.y,end.y),width:Math.abs(start.x-end.x),height:Math.abs(start.y-end.y)},width,height):editRoi(start.roi,start.handle,end.x-start.x,end.y-start.y,width,height));
  };
  const handles: [Handle,number,number][]=[['nw',roi.x,roi.y],['n',roi.x+roi.width/2,roi.y],['ne',roi.x+roi.width,roi.y],['e',roi.x+roi.width,roi.y+roi.height/2],['se',roi.x+roi.width,roi.y+roi.height],['s',roi.x+roi.width/2,roi.y+roi.height],['sw',roi.x,roi.y+roi.height],['w',roi.x,roi.y+roi.height/2]];
  const size=width/45;
  return <svg className="roi-selector" viewBox={`0 0 ${width} ${height}`} aria-label="編輯受測者 ROI" onPointerDown={e=>{
    const p=point(e);const handle=(e.target as SVGElement).dataset.handle as Handle|undefined;
    drag.current={...p,roi:{...roi},handle:drawNew?'draw':handle??'draw'};e.currentTarget.setPointerCapture(e.pointerId);
  }} onPointerMove={update} onPointerUp={e=>{update(e);drag.current=null;onDrawEnd?.();}} onPointerCancel={()=>{if(drag.current)onChange(drag.current.roi);drag.current=null;}}>
    <rect {...roi} data-handle="move" fill="#1cd9ac33" stroke="#ffda57" strokeWidth={width/250} style={{cursor:drawNew?'crosshair':'move'}} />
    {!drawNew && handles.map(([handle,x,y])=><rect key={handle} data-handle={handle} aria-label={`ROI ${handle} handle`} x={x-size/2} y={y-size/2} width={size} height={size} fill="#ffda57" style={{cursor:`${handle}-resize`}} />)}
  </svg>;
}
