import {analyze} from './analyze';
import {modelBytes} from '../pose/mediapipe';
import type {SubjectSelection} from '../domain/tracking';
import type {ComparisonBundle,ComparisonEntry} from '../validation/comparison';
import {SAMPLING_HZ} from '../domain/analysis';
export async function sha256File(file:File):Promise<string>{
 const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());
 return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
/** Fixed order, immutable source/model/settings. Each run gets an independent VIDEO instance. */
export async function comparePipelines(url:string,file:File,model:File|null,allowDownload:boolean,selection:SubjectSelection,multiPoses:2|3,signal:AbortSignal,progress:(done:number,total:number,phase:string)=>void,execute:typeof analyze=analyze):Promise<ComparisonBundle>{
 const started=performance.now();progress(0,0,'準備同源比較：計算影片與模型識別');
 const snapshot=structuredClone(selection);const sourceSha256=await sha256File(file);signal.throwIfAborted();
 const asset=await modelBytes(model,signal,allowDownload);const sharedPreparationMs=performance.now()-started;signal.throwIfAborted();
 const id=crypto.randomUUID(),entries:ComparisonEntry[]=[];
 const configs=[{id:'full-frame-single',numPoses:1},{id:'roi-crop',numPoses:1},{id:'full-frame-multi',numPoses:multiPoses}] as const;
 for(const [index,config] of configs.entries()){
  signal.throwIfAborted();
  const plan=structuredClone(snapshot);
  if(!plan.keyframes.length)plan.keyframes=[{id:plan.id,timeMs:0,roi:{...plan.roi},source:'manual-target-confirmation'}];
  if(config.id==='roi-crop')plan.method='adaptive-roi';
  try{
   const session=await execute(url,file.name,model,allowDownload,plan,signal,(done,total,phase)=>progress(done,total,`${index+1}/3 ${config.id}：${phase}`),{pipeline:config,asset,sourceSha256,comparisonId:id});
   signal.throwIfAborted();entries.push({config,session,error:null});
  }catch(error){signal.throwIfAborted();entries.push({config,session:null,error:(error instanceof Error?error.message:String(error)).slice(0,1000)});}
 }
 return {schemaVersion:'pipeline-comparison-v1',id,sourceSha256,sourceFilename:file.name,sourceSizeBytes:file.size,modelSha256:asset.hash,samplingHz:SAMPLING_HZ,selectionId:snapshot.id,startedAtUtc:new Date(Date.now()-(performance.now()-started)).toISOString(),sharedPreparationMs,wallDurationMs:performance.now()-started,entries};
}
