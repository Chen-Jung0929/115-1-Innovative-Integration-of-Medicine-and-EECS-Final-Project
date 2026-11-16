import type { Landmark, Sample } from '../domain/analysis';
import type { SubjectSelection, TrackingQuality } from '../domain/tracking';
export const selection: SubjectSelection = {id:'synthetic-selection',method:'manual-fixed-roi',referenceTimeMs:0,roi:{x:0,y:0,width:320,height:180}};
export const accepted: TrackingQuality = {accepted:true,identity:'consistent-unverified',landmarkConfidence:'sufficient',plausibility:'plausible',continuity:'initial',reasons:[]};
export function humanPose(dx=0): Landmark[] {
  const p:Landmark[]=Array.from({length:33},()=>({x:.5+dx,y:.4,visibility:1}));
  for(const [i,x,y] of [[11,.4,.2],[12,.6,.2],[23,.4,.5],[24,.6,.5],[25,.4,.7],[26,.6,.7],[27,.4,.9],[28,.6,.9]]) p[i!]={x:x!+dx,y:y!,visibility:1};
  return p;
}
export function makeSample(overrides: Partial<Sample> = {}): Sample {
  const left=overrides.left??{valid:true,rawAngleDeg:180,invalidReasons:[]};
  const right=overrides.right??{valid:true,rawAngleDeg:180,invalidReasons:[]};
  return {sampleIndex:0,requestedTimeMs:0,sourceTimeMs:0,landmarks:humanPose(),candidates:[],tracking:accepted,rawAngles:{left,right},automaticAngles:{left,right},left,right,...overrides};
}
