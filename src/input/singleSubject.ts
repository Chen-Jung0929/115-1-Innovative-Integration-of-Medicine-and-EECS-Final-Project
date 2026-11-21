import type {SubjectSelection} from '../domain/tracking';
import {checkedRoi} from '../tracking/roi';

/** Assumed controlled single-person scene; this is not a manual identity annotation. */
export function fullFrameSelection(width:number,height:number):SubjectSelection {
  const roi=checkedRoi({x:0,y:0,width,height},width,height),id=crypto.randomUUID();
  return {id,roi,method:'manual-fixed-roi',referenceTimeMs:0,
    keyframes:[{id:crypto.randomUUID(),timeMs:0,roi:{...roi},source:'controlled-single-default'}],
    interpolation:'linear-source-pixels-v1',revision:1,parentSelectionId:null,correctionSource:'controlled-single-default'};
}
