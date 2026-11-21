import type {ComparisonBundle} from './comparison';
import {comparisonReport,comparisonCsv} from './comparison';
import {PIPELINE_NAMES} from '../domain/pipeline';
import {downloadFile} from '../export/csv';
export function ComparisonPanel({bundle,activeId,onSelect,busy}:{bundle:ComparisonBundle;activeId:string|undefined;onSelect:(id:string)=>void;busy:boolean}){
 const report=comparisonReport(bundle);const pct=(v:number|null)=>v===null?'N/A':`${(v*100).toFixed(1)}%`;
 return <section><h2>A/B/C 同源比較</h2><p>此比較組影片 SHA-256：{bundle.sourceSha256} · 模型 SHA-256：{bundle.modelSha256}。檢查舊比較會還原該次選人設定；輸入欄位的模型可能已改，結果以存檔 hash 為準。</p><p>共同目標取樣：{report.alignment.commonRequestedTimesMs.length}；估計時間取樣：{report.alignment.estimatedTimestampSamples}。表格使用共同目標時間子集；原始全部取樣指標也保留於報告。逐次解碼不保證完全相同呈現影格。</p>
 {!report.provenanceConsistent&&<p role="alert">比較來源或設定不一致，不可直接比較。</p>}<div style={{overflowX:'auto'}}><table><thead><tr><th>方法／檢查結果</th><th>Valid Frame Rate</th><th>Correct Target Rate（人工）</th><th>False-Valid Rate</th><th>Usable Coverage</th><th>Landmark 不連續／可比較配對</th><th>分析時間</th></tr></thead><tbody>{report.rows.map(row=>{
 const s=row.commonSamples;return <tr key={row.config.id}><td><button disabled={busy||!row.sessionId||row.sessionId===activeId} onClick={()=>row.sessionId&&onSelect(row.sessionId)}>{PIPELINE_NAMES[row.config.id]}</button>{row.error&&<p role="alert">此方法失敗：{row.error}</p>}</td>
 <td>{s?pct(s.validFrameRate):'N/A'}{s&&` (${s.validSamples}/${s.samples})`}</td><td>{s?pct(s.correctTargetRate):'N/A'}{s&&` (${s.human.correct}/${s.human.assessable})；未標 ${s.samples-s.human.reviewed}／不確定 ${s.human.uncertain}`}</td><td>{s?pct(s.falseValidRate):'N/A'}{s&&` (${s.human.falseValid}/${s.human.autoValidReviewed})`}</td><td>{s?pct(s.usableCoverage):'N/A'}</td>
 <td>{s?`${s.landmarkDiscontinuities??'N/A'} / ${s.landmarkComparablePairs}`:'N/A'}</td><td>{s?.analysisDurationMs!=null?`${(s.analysisDurationMs/1000).toFixed(2)} s`:'N/A'}</td></tr>;
 })}</tbody></table></div>
 <p>先按各方法切換結果並逐樣本人工標註，人工欄位才有數值；不複製另一方法的標籤。不連續是啟發式警示，可能來自真實動作。耗時含該次初始化與解碼，排除批次共用的影片 hash／模型準備；固定執行順序可能有暖機偏差。</p>
 <details><summary>追蹤失敗原因與完整分母</summary><pre>{JSON.stringify(report.rows.map(r=>({pipeline:r.config.id,metrics:r.allSamples})),null,2)}</pre></details>
 <button onClick={()=>downloadFile(`comparison-${bundle.id}-metrics.csv`,comparisonCsv(bundle),'text/csv;charset=utf-8')}>下載比較指標 CSV</button>
 <button onClick={()=>downloadFile(`comparison-${bundle.id}.json`,JSON.stringify({bundle,report},null,2),'application/json')}>下載 A/B/C 比較 JSON（含原始三次結果）</button>
 </section>;
}
