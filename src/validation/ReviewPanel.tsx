import { useState } from 'react';
import type { Sample, Session } from '../domain/analysis';
import type { HumanLabel, HumanReview } from '../domain/tracking';
import { targetMetrics } from './targetMetrics';
import { downloadFile } from '../export/csv';
export function ReviewPanel({session,sample,onReview}:{session:Session;sample:Sample|undefined;onReview:(index:number,review:HumanReview|undefined)=>void}) {
  const [reviewer,setReviewer]=useState('reviewer-1');
  const metrics=targetMetrics(session.samples);
  const percent=(v:number|null)=>v===null?'N/A':`${(v*100).toFixed(1)}%`;
  return <section><h2>4. 人工受測者標註與可靠性指標</h2>
    <p>以原始影格人工判斷，不以模型或高 visibility 當真值。指標只適用已標註子集，不能直接推論整段影片。</p>
    <label>標註者代碼（不填姓名）<input value={reviewer} onChange={e=>setReviewer(e.target.value)} /></label>
    {sample ? <fieldset><legend>取樣 #{sample.sampleIndex} · {(sample.sourceTimeMs/1000).toFixed(3)} 秒</legend>
      <label>人工人物判斷<select value={sample.review?.label??''} disabled={!reviewer.trim()} onChange={e=>{
        const label=e.target.value as HumanLabel|'';
        onReview(sample.sampleIndex,label?{label,identityId:label==='correct-target'?'target':'',reviewerId:reviewer.trim()}:undefined);
      }}><option value="">尚未標註</option><option value="correct-target">Correct target（正確受測者）</option><option value="wrong-target">Wrong target（錯誤受測者）</option><option value="mixed-landmarks">Mixed landmarks（混合人物）</option><option value="uncertain">Uncertain（不確定）</option></select></label>
      {sample.review && <label>人工人物代碼（例如 target、person-B；混合／不確定時留白）<input value={sample.review.identityId} disabled={['correct-target','mixed-landmarks','uncertain'].includes(sample.review.label)||!reviewer.trim()} onChange={e=>onReview(sample.sampleIndex,{...sample.review!,reviewerId:reviewer.trim(),identityId:e.target.value})} /></label>}
      <p>錯誤／混合／不確定標註會使最終角度無效；原始幾何值與自動 QC 決策保留，供計算 False-Valid Rate。</p>
    </fieldset> : <p>請使用取樣滑桿跳到已分析影格後標註。</p>}
    <dl><dt>已標註／全部取樣</dt><dd>{metrics.reviewed} / {metrics.total}（其中 Uncertain：{metrics.uncertain}）</dd>
      <dt>Target Accuracy</dt><dd>{percent(metrics.targetAccuracy)}（{metrics.correct}/{metrics.assessable}）</dd>
      <dt>False-Valid Rate</dt><dd>{percent(metrics.falseValidRate)}（{metrics.falseValid}/{metrics.autoValidReviewed}）</dd>
      <dt>Usable Coverage</dt><dd>{percent(metrics.usableCoverage)}（{metrics.usable}/{metrics.total}；已人工確認的整體可用率下限）</dd>
      <dt>Subject Switch Count</dt><dd>{metrics.subjectSwitchCount??'N/A'}（{metrics.comparableIdentityPairs} 組相鄰且具人工人物代碼的可比較配對）</dd></dl>
    <p>Uncertain 與未標註不進入準確率與 False-Valid Rate 分母；Usable Coverage 分母是全部取樣，分子只計人工正確且至少一側膝角通過自動 QC。未檢查部分仍未知，這是已確認下限，不是效度推估。切換計數不跨未標註／混合／不確定缺口，不把沒有可比較配對誤報為零。</p>
    <button onClick={()=>downloadFile(`review-metrics-${session.metadata.sessionId}.json`,JSON.stringify({sessionId:session.metadata.sessionId,selection:session.subjectSelection,metrics},null,2),'application/json')}>下載人工檢查指標 JSON</button>
    <p>標註只在記憶體；離開或重新分析前請下載含標註的研究 JSON。不得將人工人物代碼對照表或輸出提交 Public Git。</p>
  </section>;
}
