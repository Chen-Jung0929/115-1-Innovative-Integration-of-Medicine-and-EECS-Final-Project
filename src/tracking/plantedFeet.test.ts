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

describe('restart after standing still (restart-after-still-standing-v1, ADR-088)', ()=>{
 const lockByGap=(t:ReturnType<typeof createFullFrameIdentity>)=>{
  for(let i=0;i<20;i++)t.observe([person(0)],i*100,ref);
  for(let i=20;i<30;i++)t.observe([],i*100,ref); // nobody detected for 1 s
 };
 it('lost person who comes back elsewhere and stands still 0.5 s starts a new segment', ()=>{
  const t=createFullFrameIdentity(W,H,{controlledSingle:true,restartAfterLock:true});lockByGap(t);
  const q=[...Array(15)].map((_,k)=>t.observe([person(0,{dx:200})],(30+k)*100,ref).tracking);
  expect(q[0]!.state).toBe('MANUAL_REVIEW_REQUIRED');
  expect(q.slice(0,5).every(x=>!x.accepted)).toBe(true);
  expect(q[5]!.accepted).toBe(true);expect(q[5]!.reasons).toEqual(['restart-after-still-standing']);
  // Then normal tracking continues, including squats.
  for(let k=0;k<10;k++)expect(t.observe([person(k%2?0:.5,{dx:200})],(45+k)*100,ref).tracking.state).not.toBe('MANUAL_REVIEW_REQUIRED');
 });
 it('does not restart by standing while squatting, jumping around, or with two people', ()=>{
  // A squatter followed smoothly restarts by restart-after-steady-single-person after 1 s (ADR-099), not by standing.
  const squat=createFullFrameIdentity(W,H,{controlledSingle:true,restartAfterLock:true});lockByGap(squat);
  const q=[...Array(30)].map((_,k)=>squat.observe([person(1,{dx:200})],(30+k)*100,ref).tracking);
  expect(q.slice(0,10).every(x=>!x.accepted)).toBe(true);
  expect(q[10]!.accepted).toBe(true);expect(q[10]!.reasons).toEqual(['restart-after-steady-single-person']);
  expect(q.some(x=>x.reasons.includes('restart-after-still-standing'))).toBe(false);
  // Swaying 60 px every 0.1 s is not standing still; the 1 s smooth-person restart may fire, standing never does.
  const moving=createFullFrameIdentity(W,H,{controlledSingle:true,restartAfterLock:true});lockByGap(moving);
  for(let k=0;k<30;k++)expect(moving.observe([person(0,{dx:200+(k%2)*60})],(30+k)*100,ref).tracking.reasons).not.toContain('restart-after-still-standing');
  // Jumping 120 px (0.72 torso length) every 0.1 s never restarts at all.
  const jumping=createFullFrameIdentity(W,H,{controlledSingle:true,restartAfterLock:true});lockByGap(jumping);
  for(let k=0;k<30;k++)expect(jumping.observe([person(0,{dx:200+(k%2)*120})],(30+k)*100,ref).tracking.accepted).toBe(false);
  const two=createFullFrameIdentity(W,H,{controlledSingle:true,restartAfterLock:true});lockByGap(two);
  for(let k=0;k<30;k++)expect(two.observe([person(0,{dx:200}),person(0,{dx:-200})],(30+k)*100,ref).tracking.accepted).toBe(false);
 });
 it('a lock requested by the user never restarts', ()=>{
  const t=createFullFrameIdentity(W,H,{controlledSingle:true,restartAfterLock:true});
  for(let i=0;i<20;i++)t.observe([person(0)],i*100,ref);
  t.requireManual('ambiguous-full-frame-candidates');
  for(let k=0;k<30;k++)expect(t.observe([person(0)],(20+k)*100,ref).tracking.accepted).toBe(false);
 });
 it('uploaded video: after a hard cut, the other person standing still 0.5 s starts a NEW segment', ()=>{
  const t=createFullFrameIdentity(W,H,{controlledSingle:true,restartAfterLock:true});
  for(let i=0;i<40;i++)t.observe([person(0,{hipWidth:50})],i*100,ref);
  const B=()=>person(0,{dx:-40,hipWidth:110,shank:104});
  const q=[...Array(20)].map((_,k)=>t.observe([B()],(40+k)*100,ref).tracking);
  const firstOk=q.findIndex(x=>x.accepted);
  expect(q[1]!.state).toBe('MANUAL_REVIEW_REQUIRED');
  expect(firstOk).toBeGreaterThanOrEqual(5);
  expect(q[firstOk]!.reasons).toEqual(['restart-after-still-standing']);
 });
 it('without the option (live camera ends the segment instead) a lock never restarts by standing', ()=>{
  const t=createFullFrameIdentity(W,H,{controlledSingle:true});lockByGap(t);
  for(let k=0;k<30;k++)expect(t.observe([person(0,{dx:200})],(30+k)*100,ref).tracking.accepted).toBe(false);
 });
});

describe('fast squats and side views do not lose the person (ADR-099)', ()=>{
 it('a fast move (torso centre 0.45 torso length per 0.1 s) stays tracked as one smooth person', ()=>{
  const t=createFullFrameIdentity(W,H,{controlledSingle:true,restartAfterLock:true});
  for(let i=0;i<10;i++)t.observe([person(0)],i*100,ref);
  // Whole body (feet too) sways 75 px = 0.45 torso length per step: faster than the general 3 torso/s screen.
  const q=[...Array(10)].map((_,k)=>t.observe([person(0,{dx:[75,150,75,0][k%4]!})],(10+k)*100,ref).tracking);
  expect(q.every(x=>x.accepted&&x.state==='TRACKING')).toBe(true);
  expect(q[0]!.reasons).toContain('smooth-single-step');
 });
 it('a far foot that is barely visible (side view) is not teleport evidence', ()=>{
  const a=person(0),b=person(0);
  for(const i of [28,30]){a[i]={...a[i]!,visibility:.55};b[i]={...b[i]!,y:b[i]!.y-150/H,visibility:.55};}
  expect(feetStep(b,a,W,H)).toBe('unknown');
  const clear=person(0);for(const i of [28,30])clear[i]={...clear[i]!,y:clear[i]!.y-150/H};
  expect(feetStep(clear,person(0),W,H)).toBe('teleport');
 });
 it('after a lock, a person who keeps squatting comes back within about 1 s', ()=>{
  const t=createFullFrameIdentity(W,H,{controlledSingle:true,restartAfterLock:true});
  for(let i=0;i<20;i++)t.observe([person(0)],i*100,ref);
  for(let i=20;i<30;i++)t.observe([],i*100,ref);
  // Shallow squats (torso shrinks ≤ 1.2× per step, like a side view) without standing still 0.5 s.
  const clip=[...Array(4)].flatMap(()=>[.17,.33,.5,.5,.33,.17,0]);
  const q=clip.map((d,k)=>t.observe([person(d,{dx:100})],(30+k)*100,ref).tracking);
  const back=q.findIndex(x=>x.accepted);
  expect(back).toBeGreaterThanOrEqual(5);expect(back).toBeLessThanOrEqual(10);
  expect(q.slice(back).every(x=>x.state!=='MANUAL_REVIEW_REQUIRED')).toBe(true);
 });
 it('swap_cut with dimly visible feet (0.65, below the 0.7 "sure" bar) still locks', ()=>{
  const dim=(q:Landmark[])=>{for(const i of [27,28,29,30])q[i]={...q[i]!,visibility:.65};return q;};
  for(const restartAfterLock of [false,true]){
   const t=createFullFrameIdentity(W,H,{controlledSingle:true,restartAfterLock});
   for(let i=0;i<40;i++)t.observe([dim(person(0,{hipWidth:50}))],i*100,ref);
   const B=()=>dim(person(0,{dx:-40,hipWidth:110,shank:104}));
   expect(t.observe([B()],4000,ref).tracking.reasons).toContain('feet-teleport-pending');
   expect(t.observe([B()],4100,ref).tracking.state).toBe('MANUAL_REVIEW_REQUIRED');
  }
 });
 it('a cut from a fully visible person to one with ONE dim foot (0.65) still locks', ()=>{
  const t=createFullFrameIdentity(W,H,{controlledSingle:true,restartAfterLock:true});
  for(let i=0;i<40;i++)t.observe([person(0,{hipWidth:50})],i*100,ref);
  const B=()=>{const q=person(0,{dx:-40,hipWidth:110,shank:104});for(const i of [28,30])q[i]={...q[i]!,visibility:.65};return q;};
  expect(t.observe([B()],4000,ref).tracking.reasons).toContain('feet-teleport-pending');
  expect(t.observe([B()],4100,ref).tracking.state).toBe('MANUAL_REVIEW_REQUIRED');
 });
 it('after a lock, a passer-by walking across (1.5 torso lengths per second) does not restart the analysis', ()=>{
  const t=createFullFrameIdentity(W,H,{controlledSingle:true,restartAfterLock:true});
  for(let i=0;i<20;i++)t.observe([person(0)],i*100,ref);
  for(let i=20;i<30;i++)t.observe([],i*100,ref);
  // 25 px per 0.1 s from the left edge to the right; walking legs alternate depth so standing never holds.
  for(let k=0;k<26;k++)expect(t.observe([person(k%2?.3:0,{dx:-300+25*k})],(30+k)*100,ref).tracking.accepted,`k=${k}`).toBe(false);
 });
 it('a person jumping around by more than 0.6 torso length per step never restarts', ()=>{
  const t=createFullFrameIdentity(W,H,{controlledSingle:true,restartAfterLock:true});
  for(let i=0;i<20;i++)t.observe([person(0)],i*100,ref);
  for(let i=20;i<30;i++)t.observe([],i*100,ref);
  for(let k=0;k<30;k++)expect(t.observe([person(1,{dx:k%2?-50:60})],(30+k)*100,ref).tracking.accepted).toBe(false);
 });
});
