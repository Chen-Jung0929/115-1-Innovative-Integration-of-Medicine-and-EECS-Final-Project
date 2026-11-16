export type PipelineId='full-frame-single'|'roi-crop'|'full-frame-multi';
export interface PipelineConfig {id:PipelineId;numPoses:1|2|3}
export const PIPELINES:PipelineConfig[]=[{id:'full-frame-single',numPoses:1},{id:'roi-crop',numPoses:1},{id:'full-frame-multi',numPoses:2}];
export const PIPELINE_NAMES:Record<PipelineId,string>={
 'full-frame-single':'A · Full Frame + Single Pose',
 'roi-crop':'B · ROI Cropping（保留 v0.4.0）',
 'full-frame-multi':'C · Full Frame + Multi-Pose + 選人（實驗）',
};
export function checkedPipeline(config:PipelineConfig):PipelineConfig {
 if(!PIPELINES.some(p=>p.id===config.id)||(config.id==='full-frame-multi'?![2,3].includes(config.numPoses):config.numPoses!==1))throw new Error('不支援的管線／候選數設定');
 return {...config};
}
