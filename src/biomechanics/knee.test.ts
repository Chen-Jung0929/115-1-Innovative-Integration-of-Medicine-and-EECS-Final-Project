import { describe, expect, it } from 'vitest';
import { geometricAngle, kneeAngle, flexionProxy, KNEE_INDICES } from './knee';
import type { Landmark } from '../domain/analysis';
const b = { x: 0, y: 0 };
function pose(): Landmark[] { return Array.from({length: 33}, () => ({x: .5, y: .5, visibility: 1})); }
describe('pixel-plane geometry', () => {
  it.each([
    [{x:1,y:0},{x:0,y:1},90],
    [{x:1,y:0},{x:-1,y:0},180],
    [{x:1,y:0},{x:2,y:0},0],
  ])('returns known interior angle', (a,c,deg) => {
    const angle = geometricAngle(a,b,c); expect(angle.valid).toBe(true); expect(angle.rawAngleDeg).toBeCloseTo(deg,8);
  });
  it('rejects a zero vector instead of reporting 0 degrees', () => {
    expect(geometricAngle(b,b,{x:1,y:0})).toEqual({ valid:false, rawAngleDeg:null, invalidReasons:['degenerate-geometry'] });
  });
  it('rejects finite coordinates whose vector arithmetic overflows', () => expect(geometricAngle({x:Number.MAX_VALUE,y:0},{x:-Number.MAX_VALUE,y:0},{x:0,y:1}).valid).toBe(false));
  it('rejects nonfinite geometry', () => expect(geometricAngle({x:NaN,y:0},b,{x:1,y:0}).valid).toBe(false));
  it('is invariant under translation, reflection and uniform scaling', () => {
    expect(geometricAngle({x:10,y:20},{x:10,y:10},{x:0,y:10}).rawAngleDeg).toBe(90);
  });
  it('keeps nearly collinear geometry finite', () => {
    expect(geometricAngle({x:1,y:1e-12}, b, {x:2,y:2e-12}).rawAngleDeg).toBeCloseTo(0);
  });
});
describe('landmark QC and anatomical mapping', () => {
  it('uses MediaPipe left 23/25/27 and right 24/26/28 independently', () => {
    expect(KNEE_INDICES).toEqual({left:[23,25,27],right:[24,26,28]});
    const p=pose();
    p[23]={x:0,y:.5,visibility:1}; p[27]={x:.5,y:0,visibility:1};
    p[24]={x:0,y:.5,visibility:1}; p[28]={x:1,y:.5,visibility:1};
    expect(kneeAngle(p,'left',100,100).rawAngleDeg).toBe(90);
    expect(kneeAngle(p,'right',100,100).rawAngleDeg).toBe(180);
  });
  it('corrects rectangular normalized coordinates before taking angle', () => {
    const p=pose(); p[23]={x:0,y:0,visibility:1}; p[27]={x:1,y:0,visibility:1};
    expect(kneeAngle(p,'left',200,100).rawAngleDeg).toBeCloseTo(126.86989765,6);
    expect(kneeAngle(p,'left',100,100).rawAngleDeg).toBeCloseTo(90);
    expect(kneeAngle(p,'left',400,200).rawAngleDeg).toBeCloseTo(126.86989765,6);
  });
  it('handles missing landmarks', () => expect(kneeAngle([],'left',100,100).invalidReasons).toEqual(['missing-landmark']));
  it.each([
    [{x:.5,y:.5,visibility:.49},'low-confidence'],
    [{x:.5,y:.5,visibility:1.5},'out-of-range-confidence'],
    [{x:.5,y:.5,visibility:1,presence:.49},'low-confidence'],
    [{x:1.01,y:.5,visibility:1},'out-of-frame'],
    [{x:.5,y:Infinity,visibility:1},'non-finite'],
    [{x:.5,y:.5,visibility:NaN},'non-finite'],
  ])('rejects invalid landmark', (point,reason) => {
    const p=pose(); p[23]=point; expect(kneeAngle(p,'left',100,100).invalidReasons).toEqual([reason]);
  });
  it('rejects bad dimensions', () => expect(kneeAngle(pose(),'left',0,100).invalidReasons).toEqual(['non-finite']));
  it('keeps invalid flexion proxy null, distinguishes valid 0 degrees', () => {
    const zero=geometricAngle({x:1,y:0},b,{x:2,y:0}); expect(flexionProxy(zero)).toBe(180);
    expect(flexionProxy(kneeAngle([],'left',100,100))).toBeNull();
  });
});
