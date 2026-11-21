import { makeSample } from '../test/fixtures';
import { expect, it } from 'vitest';
import { sampleTimes, matchingSample, coverage, heldSample, nearestSample } from './series';
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

it('playback display holds the latest analyzed frame for a short time, never a future one', () => {
  const at = (i: number, t: number) => makeSample({ sampleIndex: i, sourceTimeMs: t, requestedTimeMs: t });
  const samples = [at(0, 0), at(1, 200), at(2, 400)];
  expect(heldSample(samples, 120, 250)?.sampleIndex).toBe(0);
  expect(heldSample(samples, 398, 250)?.sampleIndex).toBe(1);
  expect(heldSample(samples, 400, 250)?.sampleIndex).toBe(2);
  expect(heldSample(samples, 700, 250)).toBeUndefined();
  expect(heldSample([at(0, 500)], 100, 250)).toBeUndefined();
});
it('paused display picks the closest analyzed frame, only when it is close', () => {
  const at = (i: number, t: number) => makeSample({ sampleIndex: i, sourceTimeMs: t, requestedTimeMs: t });
  const samples = [at(0, 0), at(1, 200)];
  expect(nearestSample(samples, 120, 120)?.sampleIndex).toBe(1);
  expect(nearestSample(samples, 60, 120)?.sampleIndex).toBe(0);
  expect(nearestSample(samples, 500, 120)).toBeUndefined();
});
