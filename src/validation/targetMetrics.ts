import type { Sample } from '../domain/analysis';
import type { HumanReview } from '../domain/tracking';
import { reviewedPosture } from '../tracking/gate';
export function applyReview(sample: Sample, review: HumanReview | undefined): Sample {
  const {review: _old, ...rest}=sample;
  const posture=(allowed:boolean)=>sample.posture?{posture:{...sample.posture,final:reviewedPosture(sample.posture.automatic,allowed)}}:{};
  if (!review) return {...rest,...sample.automaticAngles,...posture(true)};
  review = {...review,identityId:review.label==='correct-target'?'target':['mixed-landmarks','uncertain'].includes(review.label)?'':review.identityId.trim()};
  const allowed = review.label === 'correct-target';
  return {...rest,review,...posture(allowed),...(allowed?sample.automaticAngles:{left:{valid:false,rawAngleDeg:null,invalidReasons:['identity-uncertain']},right:{valid:false,rawAngleDeg:null,invalidReasons:['identity-uncertain']}})};
}
export function targetMetrics(samples: readonly Sample[]) {
  const reviewed=samples.filter(s=>s.review);
  const assessed=reviewed.filter(s=>s.review!.label!=='uncertain');
  const correct=assessed.filter(s=>s.review!.label==='correct-target');
  const autoValid=(s:Sample)=>s.automaticAngles.left.valid||s.automaticAngles.right.valid;
  const valid=assessed.filter(autoValid);
  const falseValid=valid.filter(s=>s.review!.label!=='correct-target');
  let switches=0,pairs=0;
  for(let i=1;i<samples.length;i++) {
    const a=samples[i-1]!,b=samples[i]!;
    const comparable=(s:Sample)=>s.review && ['correct-target','wrong-target'].includes(s.review.label) && s.review.identityId.trim();
    if(b.sampleIndex===a.sampleIndex+1 && comparable(a) && comparable(b)) {pairs++;if(a.review!.identityId.trim()!==b.review!.identityId.trim()) switches++;}
  }
  const ratio=(n:number,d:number)=>d?n/d:null;
  return {total:samples.length,reviewed:reviewed.length,assessable:assessed.length,uncertain:reviewed.length-assessed.length,correct:correct.length,
    autoValidReviewed:valid.length,falseValid:falseValid.length,usable:correct.filter(autoValid).length,
    targetAccuracy:ratio(correct.length,assessed.length),falseValidRate:ratio(falseValid.length,valid.length),usableCoverage:assessed.length?ratio(correct.filter(autoValid).length,samples.length):null,usableReviewedCoverage:ratio(correct.filter(autoValid).length,assessed.length),
    subjectSwitchCount:pairs?switches:null,comparableIdentityPairs:pairs};
}
