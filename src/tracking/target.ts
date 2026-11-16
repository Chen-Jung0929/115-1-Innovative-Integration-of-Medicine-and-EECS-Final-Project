import type { Landmark } from '../domain/analysis';
import type { Roi, TrackingQuality, TrackingState } from '../domain/tracking';
export const TRACKING_POLICY = {
  version: 'roi-temporal-recovery-v2', minConfidence: 0.5, roiMargin: 0.02,
  maxInitialCenterOffset: 0.35, minTorsoPx: 8, minSegmentPx: 2, maxLegSegmentRatio: 5,
  maxCenterTorsoPerSecond: 3, maxSegmentScaleChange: 2,
  recoveryGapMs: 650, recoveryConfirmations:2, recoveryCenterTorso:.5, recoveryScaleChange:1.25,
} as const;
export interface TargetTracker { assess(candidates: readonly Landmark[][], sourceTimeMs: number, roi?:Roi): TrackingQuality; requireManual(reason:string):void }
const core = [11,12,23,24];
const legs = [[23,25],[25,27],[24,26],[26,28]] as const;
export function confident(p: Landmark | undefined): p is Landmark {
  return !!p && [p.x,p.y,p.visibility,p.presence ?? 1].every(Number.isFinite) && p.visibility >= TRACKING_POLICY.minConfidence && p.visibility <= 1 && (p.presence ?? 1) >= TRACKING_POLICY.minConfidence && (p.presence ?? 1) <= 1;
}
/** A consistency screen, never an identity classifier or calibrated probability. */
export function createTargetTracker(initialRoi: Roi, sourceWidth: number, sourceHeight: number): TargetTracker {
  let state:TrackingState='TRACKING';
  let recovery=0;
  let manualReason='';
  let previous: { x:number; y:number; torso:number; lengths:(number|null)[]; time:number } | undefined;
  const distance = (a:Landmark,b:Landmark) => Math.hypot((a.x-b.x)*sourceWidth,(a.y-b.y)*sourceHeight);
  function reject(q:TrackingQuality,time:number,kind:'lost'|'soft'|'hard'):TrackingQuality {
    recovery=0;
    if(state==='MANUAL_REVIEW_REQUIRED'||kind==='hard'||!previous||time-previous.time>TRACKING_POLICY.recoveryGapMs)state='MANUAL_REVIEW_REQUIRED';
    else state=kind==='lost'?'LOST':'UNCERTAIN';
    return {...q,state,reasons:[...q.reasons,...(manualReason?[manualReason]:[]),state==='MANUAL_REVIEW_REQUIRED'?'manual-reselection-required':'recovery-gated']};
  }
  return {requireManual(reason){state='MANUAL_REVIEW_REQUIRED';manualReason=reason;},assess(candidates, time, roi=initialRoi) {
    const q: TrackingQuality = {state,accepted:false, identity:'identity-uncertain',landmarkConfidence:'insufficient',plausibility:'unassessed',continuity:'unassessed',reasons:[]};
    if (candidates.length === 0 || !candidates.some(p => p.length)) {
      return reject({...q,identity:'target-lost',reasons:['no-pose-in-roi']},time,'lost');
    }
    if (candidates.length !== 1) return reject({...q,reasons:['ambiguous-candidates']},time,'hard');
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
      if(q.reasons.length===0) {
        if(state==='MANUAL_REVIEW_REQUIRED')return {...q,state,reasons:[manualReason||'manual-reselection-required','manual-reselection-required']};
        if(state!=='TRACKING' && previous) {
          const close=Math.hypot(x-previous.x,y-previous.y)/Math.max(torso,previous.torso)<=TRACKING_POLICY.recoveryCenterTorso;
          const scale=Math.max(torso/previous.torso,previous.torso/torso)<=TRACKING_POLICY.recoveryScaleChange;
          if(time-previous.time>TRACKING_POLICY.recoveryGapMs||!close||!scale||lengths.some((v,i)=>v!==null&&previous!.lengths[i]!=null&&Math.max(v/previous!.lengths[i]!,previous!.lengths[i]!/v)>TRACKING_POLICY.recoveryScaleChange))return reject({...q,reasons:['recovery-not-identity-consistent']},time,'hard');
          recovery++;
          if(recovery<TRACKING_POLICY.recoveryConfirmations){state='UNCERTAIN';return {...q,state,reasons:['recovery-confirmation-pending']};}
        }
        previous={x,y,torso,lengths,time};state='TRACKING';recovery=0;
      }
    }
    if(q.reasons.length) {
      const boundary=q.reasons.includes('roi-boundary-or-extrapolation');
      const hard=q.reasons.some(r=>['implausible-projected-geometry','temporal-jump-or-scale-change','initial-target-not-centered'].includes(r));
      return reject({...q,identity:boundary?'target-lost':'identity-uncertain'},time,hard?'hard':boundary?'lost':'soft');
    }
    q.accepted=true;q.identity='consistent-unverified';q.state=state;
    return q;
  }};
}
