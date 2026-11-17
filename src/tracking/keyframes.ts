import type { Roi, SubjectSelection, RoiKeyframe, RoiProposal } from '../domain/tracking';
import { checkedRoi } from './roi';
import { fitRoi } from './editRoi';
export function checkedKeyframes(frames:readonly RoiKeyframe[],width:number,height:number,durationMs:number):RoiKeyframe[] {
  const sorted=frames.map(k=>({...k,roi:checkedRoi(k.roi,width,height)})).sort((a,b)=>a.timeMs-b.timeMs);
  if(!sorted.length || sorted[0]!.timeMs!==0)throw new Error('ROI keyframes 必須包含 0 秒的初始框');
  sorted.forEach((k,i)=>{if(!Number.isFinite(k.timeMs)||k.timeMs<0||k.timeMs>=durationMs||(i>0&&k.timeMs===sorted[i-1]!.timeMs))throw new Error('Keyframe 時間必須唯一並在影片長度內');});
  return sorted;
}
export function roiAt(selection:SubjectSelection,timeMs:number,width:number,height:number):RoiProposal {
  if(selection.method==='manual-fixed-roi')return {roi:{...selection.roi},roiSource:'fixed',roiUpdateReason:'manual-fixed-roi',manualKeyframeId:null};
  const frames=selection.keyframes;
  const before=[...frames].reverse().find(k=>k.timeMs<=timeMs)??frames[0]!;
  const after=frames.find(k=>k.timeMs>timeMs);
  const manualKeyframeId=before.source==='controlled-single-default'?null:before.id;
  if(before.source==='controlled-single-default'&&!after)return {roi:{...before.roi},roiSource:'full-frame-default',roiUpdateReason:'controlled-single-default',manualKeyframeId};
  if(selection.method==='adaptive-roi' || timeMs===before.timeMs || !after)return {roi:{...before.roi},roiSource:timeMs===before.timeMs?'manual-keyframe':'manual-hold',roiUpdateReason:'manual-target-confirmation',manualKeyframeId};
  const t=(timeMs-before.timeMs)/(after.timeMs-before.timeMs);
  const roi=Object.fromEntries((['x','y','width','height'] as const).map(key=>[key,before.roi[key]+t*(after.roi[key]-before.roi[key])])) as unknown as Roi;
  return {roi:fitRoi(roi,width,height),roiSource:'keyframe-interpolated',roiUpdateReason:'linear-source-pixels-v1',manualKeyframeId};
}
