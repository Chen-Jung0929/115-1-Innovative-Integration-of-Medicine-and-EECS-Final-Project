import type {Landmark} from '../domain/analysis';
import type {JointQuality,Roi} from '../domain/tracking';
import type {AnatomicalSide} from '../domain/measurement';
import {kneeObservation} from '../biomechanics/jointQuality';
import {JOINT_POLICY} from './policy';

const scale=(a:readonly number[],b:readonly number[])=>Math.max(...a.map((v,i)=>Math.max(v/b[i]!,b[i]!/v)));
/** Per-side temporal observations. A tentative baseline cannot update identity or the accepted baseline. */
export function createJointQuality(width:number,height:number,confirmations:2|3=2) {
  const histories={left:{baseline:null as [number,number]|null,pending:null as [number,number]|null,anchor:null as [number,number]|null,count:0,time:-Infinity,recovering:false},right:{baseline:null as [number,number]|null,pending:null as [number,number]|null,anchor:null as [number,number]|null,count:0,time:-Infinity,recovering:false}};
  return {observe(points:readonly Landmark[],time:number,subjectAccepted:boolean,roi?:Roi):{left:JointQuality;right:JointQuality}{
    function assess(side:AnatomicalSide):JointQuality {
      const h=histories[side],baselineBeforePx=h.baseline?[...h.baseline] as [number,number]:null,observation=kneeObservation(points,side,width,height,roi);
      const result=(state:JointQuality['state'],reasons:string[]):JointQuality=>({state,valid:state==='READY',reasons,lengthsPx:observation.lengths,confirmationCount:h.count,baselineBeforePx,recoveryAnchorPx:h.anchor?[...h.anchor]:null,observationValid:observation.reasons.length===0,observationReasons:[...observation.reasons],temporal:state==='READY'?'consistent':state==='RECOVERING'?'recovering':reasons.includes('temporal-limb-scale-change')?'discontinuous':'unassessed'});
      const contiguous=time>h.time&&time-h.time<=JOINT_POLICY.maxObservationGapMs;
      h.time=time;
      if(!subjectAccepted){h.recovering=true;h.pending=null;h.anchor=null;h.count=0;return result('SUSPENDED',['subject-not-accepted',...observation.reasons]);}
      if(observation.reasons.length){h.recovering=true;h.pending=null;h.anchor=null;h.count=0;return result('INVALID',observation.reasons);}
      const lengths=observation.lengths!;
      if(h.baseline&&!h.recovering&&scale(lengths,h.baseline)>JOINT_POLICY.maxSegmentScaleChange){
        h.recovering=true;h.pending=null;h.anchor=null;h.count=0;return result('INVALID',['temporal-limb-scale-change']);
      }
      if(h.baseline&&!contiguous)h.recovering=true;
      if(h.recovering){
        const hadPending=!!h.pending;
        const stable=contiguous&&h.pending&&h.anchor&&scale(lengths,h.pending)<=JOINT_POLICY.recoveryScaleChange&&scale(lengths,h.anchor)<=JOINT_POLICY.recoveryScaleChange;
        h.count=stable?h.count+1:1;
        if(!stable)h.anchor=[...lengths];
        h.pending=[...lengths];
        if(h.count<confirmations)return result('RECOVERING',['joint-recovery-confirmation-pending',...(hadPending&&!stable?[contiguous?'unstable-recovery-segments':'recovery-observation-gap']:[])]);
        h.recovering=false;h.baseline=[...lengths];h.pending=null;h.anchor=null;
        return result('READY',['joint-recovered-after-stable-observations']);
      }
      h.baseline=[...lengths];h.count=0;
      return result('READY',[]);
    }
    return {left:assess('left'),right:assess('right')};
  }};
}
