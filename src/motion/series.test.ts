import { makeSample } from '../test/fixtures';
import { expect, it } from 'vitest';
import { sampleTimes, matchingSample, coverage } from './series';
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
