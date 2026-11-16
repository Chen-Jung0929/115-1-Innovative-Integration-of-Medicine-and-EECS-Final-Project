import type { Landmark } from '../domain/analysis';
import type { Roi, TrackingQuality } from '../domain/tracking';
export const TRACKING_POLICY = {
  version: 'fixed-roi-conservative-v1', minConfidence: 0.5, roiMargin: 0.02,
  maxInitialCenterOffset: 0.35, minTorsoPx: 8, minSegmentPx: 2, maxLegSegmentRatio: 5,
  maxCenterTorsoPerSecond: 3, maxSegmentScaleChange: 2,
  latchAfterUncertainty: true,
} as const;
export interface TargetTracker { assess(candidates: readonly Landmark[][], sourceTimeMs: number): TrackingQuality }
const core = [11,12,23,24];
const legs = [[23,25],[25,27],[24,26],[26,28]] as const;
export function confident(p: Landmark | undefined): p is Landmark {
  return !!p && [p.x,p.y,p.visibility,p.presence ?? 1].every(Number.isFinite) && p.visibility >= TRACKING_POLICY.minConfidence && p.visibility <= 1 && (p.presence ?? 1) >= TRACKING_POLICY.minConfidence && (p.presence ?? 1) <= 1;
}
/** A consistency screen, never an identity classifier or calibrated probability. */
export function createTargetTracker(roi: Roi, sourceWidth: number, sourceHeight: number): TargetTracker {
  let latched = false;
  let previous: { x:number; y:number; torso:number; lengths:(number|null)[]; time:number } | undefined;
  const distance = (a:Landmark,b:Landmark) => Math.hypot((a.x-b.x)*sourceWidth,(a.y-b.y)*sourceHeight);
  return { assess(candidates, time) {
    const q: TrackingQuality = {accepted:false, identity:'identity-uncertain',landmarkConfidence:'insufficient',plausibility:'unassessed',continuity:'unassessed',reasons:[]};
    if (candidates.length === 0 || !candidates.some(p => p.length)) {
      latched = true; return {...q,identity:'target-lost',reasons:['no-pose-in-roi','manual-reselection-required']};
    }
    if (candidates.length !== 1) { latched=true; return {...q,reasons:['ambiguous-candidates','manual-reselection-required']}; }
    const p = candidates[0]!;
    const anchors = core.map(i=>p[i]);
    if (anchors.some(a=>!confident(a))) q.reasons.push('unreliable-torso-anchors');
    else {
      q.landmarkConfidence = [25,26,27,28].every(i=>confident(p[i]))?'sufficient':'insufficient';
      // Every confident analysis anchor/leg must remain inside the selected crop, not extrapolated out of it.
      const relevant = [...core,25,26,27,28].map(i=>p[i]).filter(confident);
      if (relevant.some(a => {
        const x=(a.x*sourceWidth-roi.x)/roi.width, y=(a.y*sourceHeight-roi.y)/roi.height;
        return x < TRACKING_POLICY.roiMargin || x > 1-TRACKING_POLICY.roiMargin || y < TRACKING_POLICY.roiMargin || y > 1-TRACKING_POLICY.roiMargin;
      })) q.reasons.push('roi-boundary-or-extrapolation');
      const a = anchors as Landmark[];
      const x=a.reduce((sum,v)=>sum+v.x*sourceWidth,0)/4, y=a.reduce((sum,v)=>sum+v.y*sourceHeight,0)/4;
      if (!previous && (Math.abs((x-roi.x)/roi.width-.5)>TRACKING_POLICY.maxInitialCenterOffset || Math.abs((y-roi.y)/roi.height-.5)>TRACKING_POLICY.maxInitialCenterOffset)) q.reasons.push('initial-target-not-centered');
      const torso=(distance(a[0]!,a[2]!)+distance(a[1]!,a[3]!))/2;
      const lengths = legs.map(([i,j])=> confident(p[i]) && confident(p[j]) ? distance(p[i],p[j]) : null);
      const impossible = !Number.isFinite(torso) || torso < TRACKING_POLICY.minTorsoPx || lengths.some(l=>l!==null && (!Number.isFinite(l) || l<TRACKING_POLICY.minSegmentPx)) || [0,2].some(i => {
        const u=lengths[i],v=lengths[i+1]; return u!=null && v!=null && Math.max(u/v,v/u)>TRACKING_POLICY.maxLegSegmentRatio;
      });
      q.plausibility=impossible?'implausible':'plausible';
      if (impossible) q.reasons.push('implausible-projected-geometry');
      q.continuity=previous?'continuous':'initial';
      if (previous) {
        const dt=(time-previous.time)/1000;
        const speed=Math.hypot(x-previous.x,y-previous.y)/Math.max(torso,previous.torso)/dt;
        const scaleChange=(u:number,v:number)=>Math.max(u/v,v/u)>TRACKING_POLICY.maxSegmentScaleChange;
        if (dt<=0 || !Number.isFinite(speed) || speed>TRACKING_POLICY.maxCenterTorsoPerSecond || scaleChange(torso,previous.torso) || lengths.some((v,i)=> v!==null && previous!.lengths[i]!=null && scaleChange(v,previous!.lengths[i]!))) {
          q.continuity='discontinuous'; q.reasons.push('temporal-jump-or-scale-change');
        }
      }
      if (!latched && q.reasons.length===0) previous={x,y,torso,lengths,time};
    }
    if (latched) q.reasons.push('manual-reselection-required');
    if (q.reasons.length) { latched=true; if (!q.reasons.includes('manual-reselection-required')) q.reasons.push('manual-reselection-required'); }
    else { q.accepted=true; q.identity='consistent-unverified'; }
    return q;
  }};
}
