import type {Landmark} from '../domain/analysis';
import type {Roi} from '../domain/tracking';
import type {AnatomicalSide} from '../domain/measurement';
import {kneeAngle,KNEE_INDICES} from './knee';
import {JOINT_POLICY,TRACKING_POLICY} from '../tracking/policy';

/** Stateless observation screen; source-pixel geometry and optional actual crop bounds. */
export function kneeObservation(points:readonly Landmark[],side:AnatomicalSide,width:number,height:number,roi?:Roi) {
  const angle=kneeAngle(points,side,width,height);
  if(!angle.valid)return {lengths:null,reasons:[...angle.invalidReasons]};
  const p=KNEE_INDICES[side].map(i=>points[i]!);
  const lengths:[number,number]=[0,1].map(i=>Math.hypot((p[i]!.x-p[i+1]!.x)*width,(p[i]!.y-p[i+1]!.y)*height)) as [number,number];
  const reasons:string[]=[];
  if(lengths.some(l=>l<JOINT_POLICY.minSegmentPx)||Math.max(lengths[0]/lengths[1],lengths[1]/lengths[0])>JOINT_POLICY.maxLegSegmentRatio)reasons.push('implausible-projected-geometry');
  if(roi&&p.some(p=>{
    const x=(p.x*width-roi.x)/roi.width,y=(p.y*height-roi.y)/roi.height,m=TRACKING_POLICY.roiMargin;
    return x<m||x>1-m||y<m||y>1-m;
  }))reasons.push('joint-roi-boundary-or-extrapolation');
  return {lengths,reasons};
}
