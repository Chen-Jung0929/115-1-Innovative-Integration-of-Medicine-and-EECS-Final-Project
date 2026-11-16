import {expect,it} from 'vitest';
import {selectInitialSubject} from './subject';
import {humanPose} from '../test/fixtures';
const ref={x:250,y:0,width:140,height:360};
it('selects a unique source-image torso inside a target reference without modifying candidates',()=>{
 const candidates=[humanPose(-.35),humanPose()];const original=structuredClone(candidates);
 expect(selectInitialSubject(candidates,ref,640,360).selectedIndex).toBe(1);expect(candidates).toEqual(original);
});
it('rejects overlapping initial people rather than ranking by array index or visibility',()=>{
 expect(selectInitialSubject([humanPose(),humanPose(.02)],ref,640,360).reason).toBe('ambiguous-initial-subject');
});
it('does not accept a high-confidence wrong person outside the reference',()=>{
 expect(selectInitialSubject([humanPose(-.35)],ref,640,360).selectedIndex).toBeNull();
});
