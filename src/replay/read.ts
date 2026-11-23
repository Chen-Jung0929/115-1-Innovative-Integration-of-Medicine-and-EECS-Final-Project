import type {Session} from '../domain/analysis';

type RecordValue=Record<string,unknown>;
function object(value:unknown):value is RecordValue{return !!value&&typeof value==='object'&&!Array.isArray(value);}
function finite(value:unknown):value is number{return typeof value==='number'&&Number.isFinite(value);}
/** Fail closed on unavailable candidates. Selected landmarks alone cannot reconstruct candidate selection. */
function validateSession(value:unknown):Session {
  if(!object(value)||!object(value.metadata)||!Array.isArray(value.samples)||!object(value.subjectSelection)||!object(value.run))throw new Error('需要含 metadata、samples、subjectSelection、run 的原始研究 session（schema 7/8/9）');
  const m=value.metadata;
  if(!['7','8','9','10'].includes(String(m.schemaVersion))||value.qcReplay)throw new Error('僅支援原始 schema 7/8/9/10，不接受已重播 session');
  if(!finite(m.sourceWidthPx)||!finite(m.sourceHeightPx)||m.sourceWidthPx<=0||m.sourceHeightPx<=0||typeof m.sessionId!=='string')throw new Error('來源尺寸或 session ID 無效');
  if(!object(m.model)||typeof m.model.assetSha256!=='string'||!m.model.assetSha256||typeof m.model.packageVersion!=='string'||typeof m.model.assetId!=='string'||typeof m.qcPolicyVersion!=='string'||typeof m.angleDefinitionVersion!=='string'||!object(value.trackingPolicy)||!object(value.analysisRevision))throw new Error('缺少模型版本／hash 或 QC provenance');
  if(!['roi-crop','full-frame'].includes(String(value.run.inputSpace)))throw new Error('缺少明確 inference inputSpace');
  const pipeline=value.run.pipeline;
  if(!object(pipeline)||!['roi-crop','full-frame-single','full-frame-multi'].includes(String(pipeline.id))||(pipeline.id==='full-frame-multi'?![2,3].includes(Number(pipeline.numPoses)):pipeline.numPoses!==1)||(pipeline.id==='roi-crop')!==(value.run.inputSpace==='roi-crop'))throw new Error('Pipeline 與 inputSpace／numPoses 不一致');
  const roi=(r:unknown)=>object(r)&&['x','y','width','height'].every(k=>finite(r[k]))&&(r.width as number)>0&&(r.height as number)>0;
  if(!roi(value.subjectSelection.roi))throw new Error('缺少有效的原始選人參考框');
  const points=(p:unknown)=>Array.isArray(p)&&p.every(l=>object(l)&&['x','y','visibility'].every(k=>l[k]===null||typeof l[k]==='number')&&(l.presence===undefined||l.presence===null||typeof l.presence==='number'));
  let previous=-Infinity,index=-1;
  for(const s of value.samples){
    if(!object(s)||!finite(s.sourceTimeMs)||!finite(s.requestedTimeMs)||!finite(s.sampleIndex)||s.sourceTimeMs<0||s.sourceTimeMs<=previous||!Number.isInteger(s.sampleIndex)||s.sampleIndex<=index)throw new Error('樣本必須具有唯一遞增來源時間與 sampleIndex');
    if(!Array.isArray(s.candidates)||!s.candidates.every(c=>object(c)&&points(c.landmarks)&&points(c.cropLandmarks))||!points(s.landmarks))throw new Error(`sample ${s.sampleIndex} 缺少 raw candidates／source landmarks，不可假設只有已選中人物`);
    if(s.manualKeyframeId!==null&&typeof s.manualKeyframeId!=='string')throw new Error('缺少明確 manual keyframe 紀錄');
    if(!roi(s.roi)||(s.targetReferenceRoi!==undefined&&!roi(s.targetReferenceRoi))||!object(s.tracking)||typeof s.tracking.accepted!=='boolean'||!Array.isArray(s.tracking.reasons)||!object(s.automaticAngles)||!object(s.rawAngles))throw new Error(`sample ${s.sampleIndex} 缺少原始 ROI／QC metadata`);
    for(const side of ['left','right']){
      for(const angles of [s.automaticAngles,s.rawAngles,s]){
        const a=angles[side];
        if(!object(a)||typeof a.valid!=='boolean'||!Array.isArray(a.invalidReasons)||(a.valid&&!finite(a.rawAngleDeg)))throw new Error(`sample ${s.sampleIndex} 缺少角度有效性`);
      }
    }
    if(s.review!==undefined&&(!object(s.review)||!['correct-target','wrong-target','mixed-landmarks','uncertain'].includes(String(s.review.label))||typeof s.review.identityId!=='string'||typeof s.review.reviewerId!=='string'))throw new Error('人工標註格式不支援');
    if(s.search!==null&&s.search!==undefined&&(!object(s.search)||typeof s.search.status!=='string'))throw new Error('搜尋 metadata 格式不支援');
    previous=s.sourceTimeMs;index=s.sampleIndex;
  }
  if(!value.samples.length)throw new Error('session 沒有樣本');
  return value as unknown as Session;
}
export function readReplayInput(value:unknown):Session[] {
  if(object(value)&&Array.isArray(value.samples))return [validateSession(value)];
  const bundle=object(value)&&object(value.bundle)?value.bundle:value;
  if(!object(bundle)||!Array.isArray(bundle.entries))throw new Error('請提供單一研究 JSON 或 A/B/C 比較 JSON');
  const sessions=bundle.entries.flatMap(e=>object(e)&&e.session?[validateSession(e.session)]:[]);
  if(!sessions.length)throw new Error('比較組沒有成功 session');
  return sessions;
}
