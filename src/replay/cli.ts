import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname,relative} from 'node:path';
import {parseArgs} from 'node:util';
import {createHash} from 'node:crypto';
import {readReplayInput} from './read';
import {replaySession,replayReport,type ReplayStrategy} from './replay';

export async function main(args:string[]) {
  const {values}=parseArgs({args,options:{input:{type:'string'},output:{type:'string'},help:{type:'boolean'}}});
  if(values.help){console.log('npm run qc:replay -- --input /path/research.json --output outputs/qc-replay-01\n支援研究 session 與 A/B/C bundle。輸出資料夾必須不存在，原檔不修改。');return;}
  if(!values.input||!values.output)throw new Error('必須指定 --input 與 --output；可用 --help');
  const input=resolve(values.input),output=resolve(values.output);
  // Keep derived landmark exports within the already ignored research-output tree.
  const outputRoot=resolve('outputs'),local=relative(outputRoot,output);
  if(!local||local==='..'||local.startsWith('../')||local.startsWith('..\\')||resolve(output)===input)throw new Error('--output 必須是 outputs/ 下新的子資料夾');
  const bytes=await readFile(input);
  const sourceSha256=createHash('sha256').update(bytes).digest('hex');
  const sessions=readReplayInput(JSON.parse(bytes.toString('utf8')));
  const strategies:ReplayStrategy[]=['frozen-v0.5.0','separated-2','separated-3'];
  const replay=sessions.map(original=>({original,results:strategies.map(s=>replaySession(original,s))}));
  await mkdir(dirname(output),{recursive:true});
  await mkdir(output); // EEXIST deliberately refuses to overwrite a previous replay.
  const reports=[];
  for(const [i,group] of replay.entries()){
    for(const r of group.results)await writeFile(resolve(output,`session-${i+1}-${r.strategy}.json`),JSON.stringify(r.session,null,2),{flag:'wx'});
    reports.push(replayReport(group.original,group.results));
  }
  const report={schemaVersion:'offline-qc-replay-v1',createdAtUtc:new Date().toISOString(),inputFileSha256:sourceSha256,mode:'conditional-on-saved-observations',
    warning:'新增放行需人工檢查；重播不是重新推論或人體 accuracy 驗證。A/B/C 缺失方法不會捏造。',reports};
  await writeFile(resolve(output,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});
  console.log(`QC replay 完成：${sessions.length} 個原始 session × 3 策略；結果保存在 ${output}`);
  for(const r of reports)console.log(JSON.stringify({original:r.originalSessionId,rawPose:r.original.rawPoseAvailable,total:r.original.samples,strategies:r.strategies.map(s=>({strategy:s.strategy,subjectAccepted:s.summary.subjectTrackingAccepted,jointValid:s.summary.jointMeasurementValid,manualReview:s.summary.manualReviewRequired,newlyAccepted:s.artificiallyAcceptedSamplesAfterQcChanges.count,unadjudicated:s.artificiallyAcceptedSamplesAfterQcChanges.notAdjudicated}))}));
}
