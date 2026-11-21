import type { AngleValue,AnatomicalSide } from '../domain/measurement';
import type { TrackingQuality } from '../domain/tracking';
export function gateAngle(angle: AngleValue, tracking: TrackingQuality, side?:AnatomicalSide): AngleValue {
  const q=side?tracking.joints?.[side]:Object.values(tracking.joints??{}).find(j=>!j.valid);
  if(tracking.accepted&&!angle.valid)return angle;
  if(tracking.accepted&&q&&!q.valid)return {valid:false,rawAngleDeg:null,invalidReasons:[q.state==='RECOVERING'?'joint-recovery-pending':q.reasons.includes('temporal-limb-scale-change')?'joint-temporal-discontinuity':'joint-landmark-invalid']};
  return tracking.accepted ? angle : {valid:false,rawAngleDeg:null,invalidReasons:[tracking.identity==='target-lost'?'target-lost':'identity-uncertain']};
}
