import {describe,expect,it} from 'vitest';
import {createFullFrameIdentity,feetStep,plantedContinuity} from './identity';
import type {Landmark} from '../domain/analysis';
const W=720,H=1280,ref={x:0,y:0,width:W,height:H};
/**
 * Synthetic frontal squatter in a 720×1280 portrait clip. depth 0 = standing, 1 = deep squat: the 2D
 * shoulder–hip length shrinks 166 → 56 px (trunk leaning toward the camera) and the hips drop 100 px,
 * while the feet and the shank (knee–ankle, 128 px) stay where they are — what lab_front shows.
 */
function person(depth:number,o:{dx?:number;shank?:number;hipWidth?:number;scale?:number}={}):Landmark[] {
 const dx=o.dx??0,shank=o.shank??128,hw=(o.hipWidth??64)/2,k=o.scale??1;
 const p:Landmark[]=Array.from({length:33},()=>({x:.5,y:.3,visibility:1}));
 const set=(i:number,x:number,y:number)=>{p[i]={x:(360+dx+(x-360)*k)/W,y:(1100-(1100-y)*k)/H,visibility:1};};
 const ankleY=1024,kneeY=ankleY-shank,hipY=742+100*depth,torso=166-110*depth;
 for(const [s,sign] of [[0,1],[1,-1]] as const){
  set(11+s,360+sign*70,hipY-torso);set(23+s,360+sign*hw,hipY);set(25+s,360+sign*(hw+8*depth),kneeY);
  set(27+s,360+sign*hw,ankleY);set(29+s,360+sign*hw,ankleY+12);set(31+s,360+sign*(hw+10),ankleY+40);
 }
 set(0,360,hipY-torso-90);
 return p;
}
/** Stand 2 s, then three squats: down in 0.3 s, hold 0.3 s, up in 0.3 s, stand 0.6 s (10 Hz). */
function squatClip():number[] {
 const d:number[]=Array(20).fill(0);
 for(let r=0;r<3;r++)d.push(.33,.67,1,1,1,1,.67,.33,0,0,0,0,0,0,0);
 return d;
}
describe('planted feet keep a squatting person tracked (planted-feet-continuity-v1, ADR-084)',()=>{
 it('a deep frontal squat does NOT lock, and the old torso-only rule would have', ()=>{
  const t=createFullFrameIdentity(W,H,{controlledSingle:true}),old=createFullFrameIdentity(W,H,{controlledSingle:false});
  const depths=squatClip();let acc=0,oldLocked=false;
  depths.forEach((d,i)=>{
   const r=t.observe([person(d)],i*100,ref);
   expect(r.tracking.state,`t=${i*100}`).not.toBe('MANUAL_REVIEW_REQUIRED');
   if(r.tracking.accepted)acc++;
   oldLocked||=old.observe([person(d)],i*100,ref).tracking.state==='MANUAL_REVIEW_REQUIRED';
  });
  expect(acc).toBe(depths.length);
  expect(oldLocked).toBe(true);
 });
 it('a different person (other shank length and feet position) swapped in mid-clip still locks and never recovers', ()=>{
  const t=createFullFrameIdentity(W,H,{controlledSingle:true});
  for(let i=0;i<20;i++)expect(t.observe([person(0)],i*100,ref).tracking.accepted).toBe(true);
  const states:string[]=[];
  for(let i=20;i<60;i++){const r=t.observe([person(0,{dx:120,shank:180,scale:1.6})],i*100,ref);expect(r.tracking.accepted,`t=${i*100}`).toBe(false);states.push(r.tracking.state);}
  expect(states.at(-1)).toBe('MANUAL_REVIEW_REQUIRED');
  // Same feet position but a clearly different shank is not "the same planted feet" either.
  expect(plantedContinuity(person(0,{shank:200}),person(0),W,H)).toBe(false);
  expect(plantedContinuity(person(0,{dx:60}),person(0),W,H)).toBe(false);
  expect(plantedContinuity(person(1),person(0),W,H)).toBe(true);
 });
 it('an automatic lock on one person recovers only after the feet stayed planted for 0.5 s', ()=>{
  const t=createFullFrameIdentity(W,H,{controlledSingle:true});
  for(let i=0;i<20;i++)t.observe([person(0)],i*100,ref);
  // Shoulders out of the frame for 1 s (torso anchors unreliable) → observation gap → lock.
  for(let i=20;i<30;i++){const p=person(0);p[11]={...p[11]!,visibility:.1};t.observe([p],i*100,ref);}
  const back=[30,31,32,33,34,35].map(i=>t.observe([person(0)],i*100,ref).tracking);
  expect(back[0]!.state).toBe('MANUAL_REVIEW_REQUIRED');
  expect(back.slice(0,5).every(q=>!q.accepted)).toBe(true);
  expect(back[5]!.accepted).toBe(true);expect(back[5]!.reasons).toContain('planted-feet-recovery-confirmed');
 });
 it('feet teleporting (a real jump) is not continuity, and two candidates keep the permanent lock', ()=>{
  const t=createFullFrameIdentity(W,H,{controlledSingle:true});
  for(let i=0;i<20;i++)t.observe([person(0)],i*100,ref);
  expect(t.observe([person(1,{dx:200})],2000,ref).tracking.accepted).toBe(false);
  const m=createFullFrameIdentity(W,H,{controlledSingle:true});
  for(let i=0;i<20;i++)m.observe([person(0)],i*100,ref);
  expect(m.observe([person(0),person(0,{dx:250})],2000,ref).tracking.state).toBe('MANUAL_REVIEW_REQUIRED');
  for(let i=21;i<40;i++)expect(m.observe([person(0)],i*100,ref).tracking.accepted).toBe(false);
 });
});

describe('a hard cut to another person locks (feet chain, ADR-086)', ()=>{
 it('swap_cut: different person, similar place and size, wider stance → locks at the 2nd frame, never recovers', ()=>{
  const t=createFullFrameIdentity(W,H,{controlledSingle:true});
  for(let i=0;i<40;i++)expect(t.observe([person(0,{hipWidth:50})],i*100,ref).tracking.accepted).toBe(true);
  // Person B: torso 40 px left, stance 110 px wide, shank 104 px (reviewer clip: heels 445/396 → 395/286 px).
  const B=()=>person(0,{dx:-40,hipWidth:110,shank:104});
  const first=t.observe([B()],4000,ref).tracking;
  expect(first.accepted).toBe(false);expect(first.reasons).toContain('feet-teleport-pending');
  const second=t.observe([B()],4100,ref).tracking;
  expect(second.state).toBe('MANUAL_REVIEW_REQUIRED');expect(second.reasons).toContain('feet-teleport');
  for(let i=42;i<90;i++)expect(t.observe([B()],i*100,ref).tracking.accepted,`t=${i*100}`).toBe(false);
 });
 it('a whole-body teleport of the same build locks too; only feet back where they were can lift it', ()=>{
  const t=createFullFrameIdentity(W,H,{controlledSingle:true});
  for(let i=0;i<20;i++)t.observe([person(0)],i*100,ref);
  t.observe([person(0,{dx:150})],2000,ref);
  expect(t.observe([person(0,{dx:150})],2100,ref).tracking.state).toBe('MANUAL_REVIEW_REQUIRED');
  for(let i=22;i<40;i++)expect(t.observe([person(0,{dx:150})],i*100,ref).tracking.accepted).toBe(false);
  const back=[40,41,42,43,44,45].map(i=>t.observe([person(0)],i*100,ref).tracking);
  expect(back[5]!.accepted).toBe(true);
 });
 it('a one-frame foot glitch (both feet collapsed) does not lock', ()=>{
  const t=createFullFrameIdentity(W,H,{controlledSingle:true});
  for(let i=0;i<20;i++)t.observe([person(0)],i*100,ref);
  const glitch=person(0);for(const i of [27,28,29,30])glitch[i]={...glitch[i]!,x:.5};
  expect(t.observe([glitch],2000,ref).tracking.accepted).toBe(false);
  for(let i=21;i<30;i++)expect(t.observe([person(0)],i*100,ref).tracking.state).not.toBe('MANUAL_REVIEW_REQUIRED');
  expect(t.observe([person(0)],3000,ref).tracking.accepted).toBe(true);
  expect(feetStep(person(1),person(0),W,H)).toBe('continuous');
  expect(feetStep(person(0,{hipWidth:110}),person(0,{hipWidth:50}),W,H)).toBe('teleport');
 });
});
