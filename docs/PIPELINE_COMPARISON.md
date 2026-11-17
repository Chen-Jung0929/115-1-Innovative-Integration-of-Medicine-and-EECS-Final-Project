# Full-frame vs application ROI cropping — comparison protocol v1

> v0.6：主要流程已收斂為單人完整影格，見 [SINGLE_SUBJECT_DEMO.md](SINGLE_SUBJECT_DEMO.md)。本文件保留研究／實驗規約；replay現可讀schema7/8/9，新派生結果為schema9。

> v0.5.1：下列為先前策略／比較規約；目前 QC 與恢復以 [QC_REPLAY.md](QC_REPLAY.md) 為準。裁切／取樣／候選契約保留，腿段不再單獨永久鎖定身分。

2026-11-17 · app 0.5.0 · schema 7 · pipeline-metrics-v1。

## 問題與待驗證假說

團隊實測回報 v0.4 Adaptive ROI 無明顯改善且可能更不穩定。未提供本環境的影片／模型或人工逐樣本結果。
以下皆待驗證，不作根因結論：應用程式裁切可能移除人體上下文；動態尺度可能影響 MediaPipe temporal tracking；
錯誤 landmarks 可能驅動下一 ROI 形成回饋。亦須考慮遮蔽、單目投影、模型能力、QC 門檻及原始拍攝條件。

Full-frame 僅表示本 App 不裁切／縮放模型輸入；不宣稱 MediaPipe 的內部前處理不包含裁切或縮放。
本版暫停擴充／調校 ROI 跟隨，保留其程式與回歸作 B 對照。

## 三條管線

| 方法 | Detector input / candidates | Selection & temporal identity | QC / angles |
| --- | --- | --- | --- |
| A | source-size original frame / 1 | 初始軀幹參考框＋來源座標連續性；沒有目標候選時拒絕 | 純 source pose quality＋共用 kneeAngle／geometricAngle |
| B | v0.4 crop canvas / primary 1、保留原全畫面搜尋 | 原 RoiController／TargetTracker、Adaptive／人工 keyframes | 原 v0.4 身份與幾何 gate＋共用 kneeAngle |
| C | source-size original frame / 2 或 3 | 初始框唯一候選，後續以軀幹位置／尺度選唯一連續候選；index 可逐樣本變動 | 與 A 相同 source QC／角度 |

A/C 參考框不是 inference crop，也不是後續永久活動範圍；軀幹離開初始框但時間一致時仍可追蹤。
若多個候選都可能是目標，不以最高 visibility 或 index0 選人，MANUAL_REVIEW_REQUIRED 且角度 invalid。
原始候選全部保留，不跨人拼接。人工 keyframe 會重設 A/C 身份狀態，模型維持原全畫面 VIDEO 序列。
B 的裁切／模型重設行為保持既有版本；三法完整策略不同，不是單一裁切因子的隨機因果實驗。

## 模組分離

- pose/mediapipe.ts：Pose Detection，只回每一候選的 raw estimates，不決定人物。
- selection/subject.ts：初始位置參考的純選擇函式，不裁切、不算角度、不更新 temporal state。
- tracking/identity.ts：來源座標的 Temporal Identity Tracking；陣列順序不是身份，僅接受候選後更新歷史。
- biomechanics/poseQuality.ts：Landmark QC，獨立 confidence／finite／source bounds／projected anatomy；不選人。
- biomechanics/knee.ts：點位 QC wrapper 與獨立 geometricAngle；三法共用同一原圖像素角度定義。
- motion/analyze.ts：編排以上步驟；B 分支保留既有 controller，不改寫 ROI 演算法。
- motion/compare.ts：凍結輸入與設定、準備一份模型內容、獨立依序執行 A/B/C。
- validation/comparison.ts：以自動決策及人工 review 計算指標／對齊／provenance；不使用模型自動生成真值。

A/C 也採 650ms／兩次嚴格恢復與 v0.4 同值的工程門檻，仍未做人體效度校準。
QC 模組不依賴 temporal implementation。B 邊界依 crop、A/C 邊界依原圖，差異記入各自 policy。

## 同源比較執行

同一 File object URL 與 SHA-256、同一份 ModelAsset bytes/hash、同一 selection snapshot、同一 5Hz grid。
固定執行 A→B（強制 Adaptive）→C（指定2/3），每次獨立 decoder／PoseEngine／tracking state，避免 VIDEO timestamp 重置污染。
模型與影片 hash 準備一次；Session.run 記錄 pipeline、inputSpace、numPoses、sourceSha256、comparisonId、requestedSamples及分析耗時。
B 初始／人工 keyframes 與 A/C 參考採同一快照；B method=adaptive 的變更明確在該 run 設定中記錄，不修改使用者原 selection。
若某方法失敗，保留 error，該列指標 N/A；其他成功結果仍可匯出。取消則不發布半成品比較組。

此版本每法分開解碼相同來源，不能保證相同 requested time 一定是同一呈現影格。
report.alignment 保存共同 requested times、estimated timestamp 數與 maxKnownPresentationOffsetMs。
UI 用共同 requested-time 子集算表格，報告另保留 allSamples 指標；不可把不同分母的結果靜默當成相同影格比較。
如果估計時間過多或呈現偏移不可忽略，先人工對齊來源影格再作精確角度／身份結論；不能把未知偏移當零。
來源／模型／pipeline／selection／sampling 不一致時 provenanceConsistent=false，不可直接比較。

## 指標與分母

以下每個單位為取樣，不是左右膝兩列、也不是影片全部影格。

- Valid Frame Rate = 自動至少一側膝角有效的取樣 / 該比較子集 N；人工否決不抹掉原自動有效率。
- Correct Target Rate = 人工 Correct / 可判定人工標註（排除 Uncertain）；未標註或分母0時 N/A。
- False-Valid Rate = 自動有效中人工 Wrong/Mixed / 可判定且自動有效的取樣；不是以所有錯例為分母的 FPR。
- Usable Coverage = 人工 Correct 且自動至少一側有效 / N，為已確認下限；未知資料不假設正確。
- Landmark discontinuities：相鄰200ms requested grid 且可比較 torso 的 source-normalized原始假說，
  中心速度>3 torso/s 或 torso／可比腿段尺度比>2 算一次警示。報 comparablePairs／nonComparablePairs；沒有配對時 N/A。
  這是跳變警示而非人體真實錯誤標註，快速真實動作亦可能觸發。未通過身份 gate 的 proposed 候選仍可能留作 raw hypothesis。
- Analysis duration：從各法 analyze 開始到清理完成的實際 wall time（ms），含解碼／模型初始化／推論／QC，
  批次共享 File hash／model 準備排除在各法之外，另列 sharedPreparationMs／wallDurationMs。
- Tracking failure reasons：每樣本每個 code 最多計一次，保留完整 counts；不把低 confidence、自動選錯與人工 Wrong 混為同一事件。

提供全部／共同子集、reviewed／assessable／uncertain／autoValidReviewed 等分母。標籤必須每法獨立檢查，不自動跨方法複製。
比較樣本不是隨機受試者樣本，不提供臨床可接受誤差、顯著性或效度聲明。

## Traceability / backward compatibility

schema7 保留原角度CSV欄位及原 ROI 程式；附 pipeline／inputSpace／candidate counts／source hash／comparison ID、
selected/proposed index、selection reason、targetReferenceRoi、duration。index只限當前sample，不當person ID。
Sample.roi 是實際模型輸入區域：A/C 為全source，B為實際crop。targetReferenceRoi 獨立記錄選人參考。
舊欄位 candidates[].cropLandmarks 保留為原始 input-normalized estimates 的相容名稱；A/C 的 input 是全圖，
不能因欄位名就誤認 A/C 有裁切。landmarks 為原圖normalized xy，z始終是該模型輸入相對深度，不是臨床3D。
rawAngles、automaticAngles、human review、最終角度與各自 invalid reasons 不互相覆蓋。
改動設定標stale；比較組的舊結果可檢查並還原其selection，結果模型以session hash為準，不以目前輸入欄位的檔名代替。

## 真實驗證與假說判定

1. 選定同一 subject_002_squat_good_side.mp4、固定指定人物、授權與File/model hash；先僅初始人工參考，不加中途校正。
2. 凍結 C 候選數、裝置／瀏覽器／delegate／政策版本，執行比較。重複測量，另以反向／個別執行檢查暖機與固定順序偏差。
3. 檢查原片與每法原始候選，逐樣本人工標 Correct/Wrong/Mixed/Uncertain，保留分歧與遮蔽；不可把模型輸出當ground truth。
4. 對齊時間精度後比較共同樣本指標、失敗原因、ROI尺寸變動與raw landmark跳變；人工校正條件另立組，不混成完全自動結果。
5. 本比較可支持選擇後續架構的初步決策，不能單憑三法差異證實動態裁切的因果假說。必要時另設 Fixed ROI、固定尺度等控制條件。

本環境沒有有效模型或真實Squat，只有雙色合成MP4解碼、mock姿態與單元案例；無最佳架構或人體準確度結論。
可在本機提供 POSE_MODEL_PATH／POSE_VIDEO_PATH 後執行 browser 的 actual A/B/C smoke；
可選 POSE_TARGET_ROI JSON（來源像素 x/y/width/height）。該自動測試只驗證三法真的推論，不證明選對受測者，仍需人工標註。
