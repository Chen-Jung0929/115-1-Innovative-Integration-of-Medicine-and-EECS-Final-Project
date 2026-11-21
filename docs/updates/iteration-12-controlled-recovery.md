# Iteration 12 — 受控單人暫態中斷恢復

2026-11-17 · app0.6.1 · feature/controlled-single-recovery · 未合併main。

## 實際附件診斷

本次取得使用者上傳MP4、研究JSON及CSV，沒有以合成案例代替該資料的重播。
來源：subject_010_squat_good_side.mp4；ffprobe長度29.733333秒，影片SHA-256
`b9f0e763f3bb6e50fabba68f477873477ab8f5f1cd4597719d1c5f53b446a6a1`，符合原run識別。
原JSON SHA-256 `66d87152adbd6c66a5056e811ec38a7213d5ca51774c6afd2b7dfa200d21a303`。
CSV296列＝148筆×兩側，JSON148筆，時間0–29.6秒。149個requested目標中16.6秒未保留；本次不補樣本、不改解碼。
原左膝自動有效16／148、右膝0／148，raw左膝148可計算；3.2秒起132筆MANUAL_REVIEW_REQUIRED。

3.0→3.2秒torso中心位移約195px，torso尺度約307→309px，速度約3.15 torso/s，超過3的工程門檻。
identity.ts原本直接把target-not-continuous當成temporal-torso-jump-or-scale-change並永久manual。
後續accepted=false無法更新previous，3.8秒又超過原650ms恢復gap；好觀測亦無法解除鎖定。

## 最小修改及恢復規則

只在pipeline full-frame-single且selection.correctionSource=controlled-single-default啟用。
短暫torso不連續不再直接宣稱換人：先UNCERTAIN／LOST，保留最後accepted anchor，不更新正式歷史。

- 最多1600ms（相對最後accepted來源時間），不會靠每筆新候選無限延長窗口。
- 候選恰好一人；可靠torso、原pose幾何QC及至少一側完整可量測的knee observation。
  另一側遮蔽仍由該側QC拒絕，不要求被遮蔽側也可信才能恢復可見側。
- 相對anchor中心差≤2 torso、torso尺度比≤1.5，否則仍人工鎖定。
- 異常影格只建立tentative觀測，不算確認；其後至少三次連續確認，gap≤300ms、相鄰中心差≤0.5 torso、尺度比≤1.25。
- 缺失、失信、不合理幾何或不穩定觀測重設確認序列。等候全部invalid。
- 完成身分確認後，原逐側joint recovery仍獨立執行，不回填先前無效角度、不用插值。
- 多候選證據即要求人工，即使只有一個較近；外部requireManual、超界、逾時、非遞增時間等鎖定不可自動解除。

非受控A、B／C實驗模式不啟用例外；沒有新增ROI／追蹤功能或畫面控制。
policy=controlled-single-bounded-v1，QC=controlled-single-core-qc-v7；模型、原始候選、時戳、raw／automatic／human維持分離。
tracking.recovery另存確認數、所需數與elapsedMs；live與offline replay共用相同選用條件。
原v0.5.0凍結策略不修改；它不等同輸入的v0.6.0，因此不宣稱其state與原檔完全一致。

## 真實觀測的QC重播結果

使用原檔、原148筆candidates與timestamps，不重新推論、不改影片／原session：

| 指標 | 原v0.6.0 | 新兩次joint確認（預設） |
| --- | --- | --- |
| raw pose available | 148 | 148 |
| subject tracking accepted | 16 | 145 |
| 左膝automatic valid | 16 | 143 |
| 右膝automatic valid | 0 | 0 |
| MANUAL_REVIEW_REQUIRED | 132 | 0 |
| 新增自動放行且未人工裁定 | — | 127 |

3.2、3.4、3.6秒身分與角度invalid；3.8秒第三次確認後身分通過，但joint尚在確認；4.0秒左膝恢復。
全片後續量測未因單次異常永久消失；保留5筆左膝無效，不把148個raw角度全數接受。
三次joint確認的對照為141／148左膝有效、新增125筆，僅作規則敏感度，不宣稱更準。

抽查3.0–4.0秒原片可見前景受測者動作及背景人物。numPoses1無法排除未回傳的背景候選。
因此這是實際模型觀測的QC重播證據，不是重新MediaPipe實測或人工身分／角度準確度驗證。
127筆新增放行需逐筆人工核對；沒有使用模型自身當ground truth。沒有有效模型檔，本次未重新執行人體推論。
影片／輸出／原始JSON只保留於工作空間受限附件及ignored outputs，不提交Git。

## 驗證與交付

新增合成regression：3.2秒中斷、三次確認＋joint恢復、遮蔽側不放行、非受控仍鎖定、真正多人歧義、
逾時／遠距跳換／明確人工要求維持鎖定，以及缺失重設計數。
Typecheck、139 unit tests／23檔、build通過；Chromium31 passed／2 actual-model測試因缺模型跳過。
保留bundle大小警告，未調整既有QC門檻以最大化有效率；已核對原輸入hash未變。
