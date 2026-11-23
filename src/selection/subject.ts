import type {Landmark} from '../domain/analysis';
import type {Roi} from '../domain/tracking';
import {torsoOf} from '../biomechanics/poseQuality';
export interface CandidateSelection {selectedIndex:number|null;proposedIndex:number|null;reason:string}
/** Initial position reference only. No crop, temporal state, angle or stable candidate ID. */
export function selectInitialSubject(candidates:readonly Landmark[][],reference:Roi,width:number,height:number):CandidateSelection {
 const near=candidates.map((p,index)=>({index,torso:torsoOf(p,width,height)})).filter(c=>c.torso&&c.torso.x>=reference.x&&c.torso.x<=reference.x+reference.width&&c.torso.y>=reference.y&&c.torso.y<=reference.y+reference.height);
 if(near.length===1)return {selectedIndex:near[0]!.index,proposedIndex:near[0]!.index,reason:'unique-torso-in-target-reference'};
 return {selectedIndex:null,proposedIndex:near[0]?.index??(candidates.length===1?0:null),reason:near.length>1?'ambiguous-initial-subject':candidates.length?'target-not-in-reference':'no-pose'};
}
