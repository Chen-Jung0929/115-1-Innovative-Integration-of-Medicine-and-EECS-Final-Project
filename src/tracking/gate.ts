import type { AngleValue,AnatomicalSide,InvalidReason,PostureSet } from '../domain/measurement';
import type { TrackingQuality } from '../domain/tracking';
export function gateAngle(angle: AngleValue, tracking: TrackingQuality, side?:AnatomicalSide): AngleValue {
  const q=side?tracking.joints?.[side]:Object.values(tracking.joints??{}).find(j=>!j.valid);
  if(tracking.accepted&&!angle.valid)return angle;
  if(tracking.accepted&&q&&!q.valid)return {valid:false,rawAngleDeg:null,invalidReasons:[q.state==='RECOVERING'?'joint-recovery-pending':q.reasons.includes('temporal-limb-scale-change')?'joint-temporal-discontinuity':'joint-landmark-invalid']};
  return tracking.accepted ? angle : {valid:false,rawAngleDeg:null,invalidReasons:[tracking.identity==='target-lost'?'target-lost':'identity-uncertain']};
}

/** Same precedence as gateAngle, for any set of sides whose joint QC the metric depends on. */
export function gateReason(tracking: TrackingQuality, sides: readonly AnatomicalSide[]): InvalidReason | null {
  if(!tracking.accepted)return tracking.identity==='target-lost'?'target-lost':'identity-uncertain';
  for(const side of sides){
    const q=tracking.joints?.[side];
    if(q&&!q.valid)return q.state==='RECOVERING'?'joint-recovery-pending':q.reasons.includes('temporal-limb-scale-change')?'joint-temporal-discontinuity':'joint-landmark-invalid';
  }
  return null;
}
const gatedAngle=(angle:AngleValue,tracking:TrackingQuality,sides:readonly AnatomicalSide[]):AngleValue=>{
  if(tracking.accepted&&!angle.valid)return angle;
  const reason=gateReason(tracking,sides);
  return reason?{valid:false,rawAngleDeg:null,invalidReasons:[reason]}:angle;
};
/**
 * Posture gating: subject identity must be accepted. Hip uses that side's joint QC (shares hip/knee points);
 * knee width ratio needs both sides; trunk lean depends only on torso anchors / subject identity.
 */
export function gatePosture(raw: PostureSet, tracking: TrackingQuality): PostureSet {
  const ratio=raw.kneeWidthRatio;
  const ratioReason=tracking.accepted&&!ratio.valid?null:gateReason(tracking,['left','right']);
  return {
    hip:{left:gatedAngle(raw.hip.left,tracking,['left']),right:gatedAngle(raw.hip.right,tracking,['right'])},
    trunkLean:gatedAngle(raw.trunkLean,tracking,[]),
    kneeWidthRatio:ratioReason?{valid:false,value:null,invalidReasons:[ratioReason]}:ratio,
  };
}
/** Human review: anything other than correct-target invalidates every final posture value. */
export function reviewedPosture(automatic: PostureSet, allowed: boolean): PostureSet {
  if(allowed)return automatic;
  const no={valid:false as const,rawAngleDeg:null,invalidReasons:['identity-uncertain'] as ['identity-uncertain']};
  return {hip:{left:no,right:no},trunkLean:no,kneeWidthRatio:{valid:false,value:null,invalidReasons:['identity-uncertain']}};
}
