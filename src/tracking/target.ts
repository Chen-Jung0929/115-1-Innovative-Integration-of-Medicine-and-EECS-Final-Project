import type {Landmark} from '../domain/analysis';
import type {Roi,TrackingQuality} from '../domain/tracking';
import {createFullFrameIdentity} from './identity';
export {TRACKING_POLICY} from './policy';
export {confident} from '../biomechanics/poseQuality';
export interface TargetTracker {assess(candidates:readonly Landmark[][],sourceTimeMs:number,roi?:Roi):TrackingQuality;requireManual(reason:string):void}
/** ROI is a detector input bound. Leg failures are local; only torso evidence gates identity. */
export function createTargetTracker(initialRoi:Roi,width:number,height:number,options:{jointConfirmations?:2|3}={}):TargetTracker {
 const identity=createFullFrameIdentity(width,height,{crop:true,...options});
 return {requireManual:identity.requireManual,assess(candidates,time,roi=initialRoi){return identity.observe(candidates,time,roi).tracking;}};
}
