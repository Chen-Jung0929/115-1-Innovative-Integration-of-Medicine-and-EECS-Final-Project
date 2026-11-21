import { expect,it } from 'vitest';
import { makeSample } from '../test/fixtures';
import { applyReview,targetMetrics } from './targetMetrics';
import type { HumanLabel } from '../domain/tracking';
const reviewed=(index:number,label:HumanLabel,id:string)=>applyReview(makeSample({sampleIndex:index}),{label,identityId:id,reviewerId:'rater-A'});
it('computes explicit denominators and human-based switches',()=>{
 const samples=[reviewed(0,'correct-target','target'),reviewed(1,'wrong-target','other-B'),reviewed(2,'mixed-landmarks',''),reviewed(3,'uncertain',''),makeSample({sampleIndex:4})];
 const m=targetMetrics(samples);expect(m.targetAccuracy).toBeCloseTo(1/3);expect(m.falseValidRate).toBeCloseTo(2/3);expect(m.usableCoverage).toBeCloseTo(1/5);expect(m.usableReviewedCoverage).toBeCloseTo(1/3);expect(m.subjectSwitchCount).toBe(1);expect(m.comparableIdentityPairs).toBe(1);expect(m.reviewed).toBe(4);expect(m.assessable).toBe(3);
});
it('does not count automatic rejection as usable and never treats unknown as correct',()=>{
 const invalid={valid:false,rawAngleDeg:null,invalidReasons:['identity-uncertain']} as const;
 const s=applyReview(makeSample({automaticAngles:{left:invalid,right:invalid},left:invalid,right:invalid}),{label:'correct-target',identityId:'target',reviewerId:'r'});
 const m=targetMetrics([s]);expect(m.targetAccuracy).toBe(1);expect(m.usableCoverage).toBe(0);expect(m.falseValidRate).toBeNull();
});
it('returns N/A rather than zero with no reviewed / assessable / comparable samples',()=>{
 const m=targetMetrics([makeSample()]);expect(m.targetAccuracy).toBeNull();expect(m.subjectSwitchCount).toBeNull();expect(targetMetrics([]).usableCoverage).toBeNull();
});
it('does not bridge annotations across uncertain, missing identities or unreviewed samples',()=>{
 const m=targetMetrics([reviewed(0,'correct-target','target'),reviewed(1,'uncertain',''),reviewed(2,'wrong-target','B'),makeSample({sampleIndex:3}),reviewed(4,'correct-target','target')]);
 expect(m.subjectSwitchCount).toBeNull();
});
it('human wrong/mixed/uncertain labels invalidate output but preserve raw and automatic decisions',()=>{
 for(const label of ['wrong-target','mixed-landmarks','uncertain'] as const){
 const original=makeSample();const s=applyReview(original,{label,identityId:'',reviewerId:'r'});
 expect(s.left.valid).toBe(false);expect(s.left.rawAngleDeg).toBeNull();expect(s.rawAngles.left.rawAngleDeg).toBe(180);expect(s.automaticAngles.left.valid).toBe(true);expect(original.left.valid).toBe(true);
 expect(applyReview(s,undefined).left).toEqual(original.left);
 }
});
it('counts a known no-switch pair as zero, distinct from missing evidence',()=>{
 expect(targetMetrics([reviewed(0,'correct-target','target'),reviewed(1,'correct-target','target')]).subjectSwitchCount).toBe(0);
});
