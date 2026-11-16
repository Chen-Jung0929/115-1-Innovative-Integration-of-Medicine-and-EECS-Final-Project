import type {Landmark} from '../domain/analysis';
export const LANDMARK_QUALITY_POLICY={version:'source-pose-quality-v1',minConfidence:.5,minTorsoPx:8,minSegmentPx:2,maxLegSegmentRatio:5} as const;
const POLICY=LANDMARK_QUALITY_POLICY;
function confident(p:Landmark|undefined):p is Landmark {
 return !!p&&[p.x,p.y,p.visibility,p.presence??1].every(Number.isFinite)&&p.visibility>=POLICY.minConfidence&&p.visibility<=1&&(p.presence??1)>=POLICY.minConfidence&&(p.presence??1)<=1;
}
export interface Torso {x:number;y:number;length:number}
export function torsoOf(points:readonly Landmark[],width:number,height:number):Torso|null {
 const p=[11,12,23,24].map(i=>points[i]);
 if(p.some(p=>!confident(p)||p.x<0||p.x>1||p.y<0||p.y>1))return null;
 const a=p as Landmark[];const dist=(i:number,j:number)=>Math.hypot((a[i]!.x-a[j]!.x)*width,(a[i]!.y-a[j]!.y)*height);
 const length=(dist(0,2)+dist(1,3))/2;
 return Number.isFinite(length)&&length>=POLICY.minTorsoPx?{x:a.reduce((s,p)=>s+p.x*width,0)/4,y:a.reduce((s,p)=>s+p.y*height,0)/4,length}:null;
}
/** Observation quality only: does not choose a subject or update identity history. */
export function poseQuality(points:readonly Landmark[],width:number,height:number) {
 const torso=torsoOf(points,width,height);
 const lengths=([[23,25],[25,27],[24,26],[26,28]] as const).map(([i,j])=>confident(points[i])&&confident(points[j])?Math.hypot((points[i].x-points[j].x)*width,(points[i].y-points[j].y)*height):null);
 const implausible=lengths.some(l=>l!==null&&(!Number.isFinite(l)||l<POLICY.minSegmentPx))||[0,2].some(i=>{const a=lengths[i],b=lengths[i+1];return a!=null&&b!=null&&Math.max(a/b,b/a)>POLICY.maxLegSegmentRatio;});
 const out=points.filter((_,i)=>[11,12,23,24,25,26,27,28].includes(i)).filter(confident).some(p=>p.x<0||p.x>1||p.y<0||p.y>1);
 return {accepted:!!torso&&!implausible&&!out,torso,lengths,
  landmarkConfidence:([11,12,23,24,25,26,27,28].every(i=>confident(points[i]))?'sufficient':'insufficient') as 'sufficient'|'insufficient',
  plausibility:(!torso?'unassessed':implausible?'implausible':'plausible') as 'unassessed'|'implausible'|'plausible',
  reasons:[...(!torso?['unreliable-torso-anchors']:[]),...(implausible?['implausible-projected-geometry']:[]),...(out?['out-of-source-image']:[])]};
}
