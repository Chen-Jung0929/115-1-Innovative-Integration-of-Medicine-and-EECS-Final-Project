import type { Landmark } from '../domain/analysis';
import type { AngleValue } from '../domain/measurement';
import type { TrackingQuality } from '../domain/tracking';
import { kneeAngle } from '../biomechanics/knee';
import { gateAngle } from '../tracking/gate';
import { LANDMARK_QUALITY_POLICY } from '../biomechanics/poseQuality';
import { IDENTITY_POLICY, SINGLE_RECOVERY_POLICY } from '../tracking/identity';
import { TRACKING_POLICY, JOINT_POLICY } from '../tracking/policy';
import { FOLLOW_POLICY } from '../tracking/controller';

/** One shared knee measurement step for uploaded video and live camera. */
export function measureKnees(landmarks: readonly Landmark[], tracking: TrackingQuality, width: number, height: number): { rawAngles: { left: AngleValue; right: AngleValue }; automaticAngles: { left: AngleValue; right: AngleValue } } {
  const rawAngles = { left: kneeAngle(landmarks, 'left', width, height), right: kneeAngle(landmarks, 'right', width, height) };
  const automaticAngles = { left: gateAngle(rawAngles.left, tracking, 'left'), right: gateAngle(rawAngles.right, tracking, 'right') };
  return { rawAngles, automaticAngles };
}

/** Policy snapshot stored with every session, identical for video and camera input. */
export function trackingPolicySnapshot(): Readonly<Record<string, string | number | boolean>> {
  return {...TRACKING_POLICY,identityPolicy:IDENTITY_POLICY,...Object.fromEntries(Object.entries(SINGLE_RECOVERY_POLICY).map(([key,value])=>[`controlled_${key}`,value])),jointPolicy:JOINT_POLICY.version,jointRecoveryConfirmations:JOINT_POLICY.recoveryConfirmations,...Object.fromEntries(Object.entries(JOINT_POLICY).map(([key,value])=>[`joint_${key}`,value])),landmarkQualityPolicy:LANDMARK_QUALITY_POLICY.version,...Object.fromEntries(Object.entries(FOLLOW_POLICY).map(([key,value])=>[`follow_${key}`,value]))};
}
