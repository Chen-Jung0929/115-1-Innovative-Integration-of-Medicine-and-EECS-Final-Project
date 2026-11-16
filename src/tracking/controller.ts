import type {Landmark,SearchObservation} from '../domain/analysis';
import type {Roi,SubjectSelection,RoiProposal,TrackingQuality,TrackingState} from '../domain/tracking';
import {roiAt} from './keyframes';
import {fitRoi} from './editRoi';
import {createTargetTracker,confident} from './target';
export const FOLLOW_POLICY={version:'bounded-torso-follow-v1',smoothing:.35,maxShiftFraction:.08,maxSizeFraction:.05,margin:.15,searchPeriodMs:1000,searchNumPoses:2,searchMatchTorso:.75} as const;
export interface FramePlan extends RoiProposal {resetModel:boolean;searchDue:boolean;previousState:TrackingState}
interface Body {x:number;y:number;torso:number}
function body(points:readonly Landmark[],width:number,height:number):Body|null {
  const a=[11,12,23,24].map(i=>points[i]);if(a.some(p=>!confident(p)||p.x<0||p.x>1||p.y<0||p.y>1))return null;
  const p=a as Landmark[];const d=(i:number,j:number)=>Math.hypot((p[i]!.x-p[j]!.x)*width,(p[i]!.y-p[j]!.y)*height);
  const torso=(d(0,2)+d(1,3))/2;if(torso<8||!Number.isFinite(torso))return null;
  return {x:p.reduce((s,p)=>s+p.x*width,0)/4,y:p.reduce((s,p)=>s+p.y*height,0)/4,torso};
}
const clamp=(x:number,a:number,b:number)=>Math.max(a,Math.min(b,x));
export function boundedFollow(previous:Roi,points:readonly Landmark[],seed:{roi:Roi;body:Body},width:number,height:number):Roi {
  const b=body(points,width,height);if(!b)return {...previous};
  const scale=clamp(b.torso/seed.body.torso,.5,2);
  const cx=b.x+(seed.roi.x+seed.roi.width/2-seed.body.x)*scale,cy=b.y+(seed.roi.y+seed.roi.height/2-seed.body.y)*scale;
  const visible=points.filter(confident).filter(p=>p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1);
  const extra=1+FOLLOW_POLICY.margin*2;
  const desiredW=Math.min(width,Math.max(seed.roi.width*scale,...visible.map(p=>2*Math.abs(p.x*width-cx)*extra)));
  const desiredH=Math.min(height,Math.max(seed.roi.height*scale,...visible.map(p=>2*Math.abs(p.y*height-cy)*extra)));
  const w=clamp(previous.width+(desiredW-previous.width)*FOLLOW_POLICY.smoothing,previous.width*(1-FOLLOW_POLICY.maxSizeFraction),previous.width*(1+FOLLOW_POLICY.maxSizeFraction));
  const h=clamp(previous.height+(desiredH-previous.height)*FOLLOW_POLICY.smoothing,previous.height*(1-FOLLOW_POLICY.maxSizeFraction),previous.height*(1+FOLLOW_POLICY.maxSizeFraction));
  const x=previous.x+previous.width/2+clamp((cx-previous.x-previous.width/2)*FOLLOW_POLICY.smoothing,-previous.width*FOLLOW_POLICY.maxShiftFraction,previous.width*FOLLOW_POLICY.maxShiftFraction)-w/2;
  const y=previous.y+previous.height/2+clamp((cy-previous.y-previous.height/2)*FOLLOW_POLICY.smoothing,-previous.height*FOLLOW_POLICY.maxShiftFraction,previous.height*FOLLOW_POLICY.maxShiftFraction)-h/2;
  // Preserve the bounded size when clamping the rectangle to the image edges.
  const fw=Math.min(width,Math.max(32,Math.round(w))),fh=Math.min(height,Math.max(32,Math.round(h)));
  return {x:Math.round(clamp(x,0,width-fw)),y:Math.round(clamp(y,0,height-fh)),width:fw,height:fh};
}
function suggestion(points:Landmark[],width:number,height:number):Roi|null {
  const p=points.filter(confident).filter(p=>p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1);if(!p.length)return null;
  const l=Math.min(...p.map(p=>p.x*width)),r=Math.max(...p.map(p=>p.x*width)),t=Math.min(...p.map(p=>p.y*height)),b=Math.max(...p.map(p=>p.y*height));
  return fitRoi({x:l-(r-l)*.2,y:t-(b-t)*.2,width:(r-l)*1.4,height:(b-t)*1.4},width,height);
}
/** Stateful coordinator. Proposals use only previous accepted source-space observations. */
export function createRoiController(selection:SubjectSelection,width:number,height:number) {
  let previousRoi={...selection.roi},lastAccepted:Landmark[]|null=null;
  let state:TrackingState='TRACKING',lastManualId:string|null=null,lastSearch=-Infinity;
  let seed:{roi:Roi;body:Body}|null=null;
  let tracker=createTargetTracker(previousRoi,width,height);
  return {
    propose(timeMs:number):FramePlan {
      const previousState=state;
      const manual=roiAt(selection,timeMs,width,height);
      const manualChanged=!!manual.manualKeyframeId&&manual.manualKeyframeId!==lastManualId;
      const resetModel=manualChanged&&lastManualId!==null;
      if(manualChanged){tracker=createTargetTracker(manual.roi,width,height);state='TRACKING';lastAccepted=null;seed=null;lastManualId=manual.manualKeyframeId;}
      let plan=manual;
      if(selection.method==='adaptive-roi'&&!manualChanged) {
        const following=state==='TRACKING'&&lastAccepted&&seed;
        plan={...manual,roi:following?boundedFollow(previousRoi,lastAccepted!,seed!,width,height):{...previousRoi},roiSource:following?'adaptive':'held-invalid',roiUpdateReason:following?'bounded-torso-margin-smoothed':'hold-until-identity-confirmed'};
      }
      previousRoi={...plan.roi};
      return {...plan,resetModel,previousState,searchDue:selection.method==='adaptive-roi'&&(manualChanged||timeMs-lastSearch>=FOLLOW_POLICY.searchPeriodMs||(['LOST','UNCERTAIN'].includes(state)&&timeMs-lastSearch>=199))};
    },
    observe(candidates:Landmark[][],timeMs:number,plan:FramePlan,searchCandidates?:Landmark[][],searchFailure?:string):{tracking:TrackingQuality;search:SearchObservation|null} {
      let search:SearchObservation|null=null;
      if(searchFailure){tracker.requireManual('full-frame-search-failed');search={roi:{x:0,y:0,width,height},candidates:[],numPoses:FOLLOW_POLICY.searchNumPoses,status:'search-error-manual-review',suggestedRoi:null,error:searchFailure};}
      if(searchCandidates) {
        lastSearch=timeMs;
        const reference=body(lastAccepted??candidates[0]??[],width,height);
        const near=reference?searchCandidates.filter(p=>{const b=body(p,width,height);return b&&Math.hypot(b.x-reference.x,b.y-reference.y)/Math.max(b.torso,reference.torso)<=FOLLOW_POLICY.searchMatchTorso&&Math.max(b.torso/reference.torso,reference.torso/b.torso)<=1.5;}):[];
        const ambiguous=near.length>1;
        if(ambiguous)tracker.requireManual('ambiguous-full-frame-candidates');
        search={roi:{x:0,y:0,width,height},candidates:searchCandidates,numPoses:FOLLOW_POLICY.searchNumPoses,status:ambiguous?'ambiguous-manual-review':near.length===1?'candidate-suggestion-not-identity-proof':'search-inconclusive',suggestedRoi:near.length===1?suggestion(near[0]!,width,height):null};
      }
      const tracking=tracker.assess(candidates,timeMs,plan.roi);
      state=tracking.state;
      if(tracking.accepted){lastAccepted=structuredClone(candidates[0]!);const b=body(lastAccepted,width,height);if(!seed&&b)seed={roi:{...plan.roi},body:b};}
      return {tracking,search};
    },
  };
}
