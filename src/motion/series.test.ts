import { makeSample } from '../test/fixtures';
import { expect, it } from 'vitest';
import { sampleTimes, matchingSample, coverage, nearestSample, smoothedSample } from './series';
import type { Sample } from '../domain/analysis';
const samples: Sample[] = [
  makeSample({sampleIndex:0,requestedTimeMs:0,sourceTimeMs:0,landmarks:[],left:{valid:true,rawAngleDeg:0,invalidReasons:[]},right:{valid:false,rawAngleDeg:null,invalidReasons:['missing-landmark']}}),
  makeSample({sampleIndex:1,requestedTimeMs:200,sourceTimeMs:200,landmarks:[],left:{valid:false,rawAngleDeg:null,invalidReasons:['low-confidence']},right:{valid:false,rawAngleDeg:null,invalidReasons:['missing-landmark']}}),
];
it('samples a deterministic fixed grid, excludes duration boundary', () => {
  expect(sampleTimes(1,5)).toEqual([0,.2,.4,.6,.8]);
  expect(sampleTimes(.01,5)).toEqual([0]);
});
it('rejects invalid sampling inputs', () => { expect(()=>sampleTimes(Infinity,5)).toThrow(); expect(()=>sampleTimes(1,0)).toThrow(); });
it('does not reuse the nearest pose at an unanalysed playback time', () => {
  expect(matchingSample(samples,100)).toBeUndefined(); expect(matchingSample(samples,200)?.sampleIndex).toBe(1);
});
it('reports per-side coverage with missingness and no-data separately', () => {
  expect(coverage(samples,'left')).toBe(.5); expect(coverage(samples,'right')).toBe(0); expect(coverage([],'left')).toBeNull();
});
it('holds actual adaptive ROI between frames without inventing angle samples',async()=>{
 const {displayedRoi}=await import('./series');
 const a=makeSample({sourceTimeMs:0,roi:{x:0,y:0,width:100,height:100}});
 const b=makeSample({sampleIndex:1,sourceTimeMs:166.667,requestedTimeMs:200,roi:{x:50,y:0,width:100,height:100}});
 expect(displayedRoi([a,b],180)?.x).toBe(50);expect(matchingSample([a,b],180)).toBeUndefined();expect(a.roi.x).toBe(0);
});

it('paused display picks the closest analyzed frame, only when it is close', () => {
  const at = (i: number, t: number) => makeSample({ sampleIndex: i, sourceTimeMs: t, requestedTimeMs: t });
  const samples = [at(0, 0), at(1, 200)];
  expect(nearestSample(samples, 120, 120)?.sampleIndex).toBe(1);
  expect(nearestSample(samples, 60, 120)?.sampleIndex).toBe(0);
  expect(nearestSample(samples, 500, 120)).toBeUndefined();
});
it('skeleton drawing moves smoothly between two tracked samples, values stay from the base sample', () => {
  const lm = (x: number) => Array.from({ length: 33 }, () => ({ x, y: .5, visibility: 1 }));
  const a = makeSample({ sampleIndex: 0, sourceTimeMs: 0, requestedTimeMs: 0, landmarks: lm(.2) });
  const b = makeSample({ sampleIndex: 1, sourceTimeMs: 200, requestedTimeMs: 200, landmarks: lm(.4) });
  const s = smoothedSample([a, b], 50, a, 250)!;
  expect(s.landmarks[0]!.x).toBeCloseTo(.25, 6);
  expect(s.sampleIndex).toBe(0); expect(s.left).toEqual(a.left); expect(a.landmarks[0]!.x).toBe(.2);
  const lost = { ...b, tracking: { ...b.tracking, accepted: false } };
  expect(smoothedSample([a, lost], 50, a, 250)).toBe(a);
  expect(smoothedSample([a, b], 50, a, 100)).toBe(a);
});
