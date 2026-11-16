import type { AngleValue } from '../domain/measurement';
import type { TrackingQuality } from '../domain/tracking';
export function gateAngle(angle: AngleValue, tracking: TrackingQuality): AngleValue {
  return tracking.accepted ? angle : {valid:false,rawAngleDeg:null,invalidReasons:[tracking.identity==='target-lost'?'target-lost':'identity-uncertain']};
}
