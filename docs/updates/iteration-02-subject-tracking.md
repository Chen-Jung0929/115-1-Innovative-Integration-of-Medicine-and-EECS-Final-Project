# Iteration 02 — Subject Selection & Tracking Quality

日期：2026-11-17（Asia/Taipei） · app 0.3.0 · feature/dataset-demo-v0。

## 真實回報與本次範圍

團隊已使用 Google 官方 Lite 模型分析 Mendeley V1 的
`subject_002_squat_good_side.mp4`，回報多人場景錯選受測者及疑似混合 landmarks。
這是使用者實際操作回報；本雲端沒有影片、有效模型與人工逐樣本結果，不能冒稱已重跑。

原程式 numPoses=1 直接選第一組 landmarks，點位 visibility QC 並不檢查人物身分。
程式本身沒有跨候選拼接；混合、遮蔽、選錯與同步錯誤須以原始影格與 raw 輸出區分。
本次實作最小 ROI＋一致性策略，沒有攝影機或 V1 功能。

## 已完成

- 正式課程名統一為「醫學電資創意整合專題」，包含 document title、網站、README、spec 與開發文件；保留 Git 歷史。
- 在片頭手動框選固定 ROI，支援拖曳／來源像素輸入、確認與重新選人；未確認不可分析。
- 真正裁切 canvas 作推論，再映射回原圖；原始時間戳、5 Hz 網格、角度核心與原圖疊圖保留。
- 保留全部獨立候選介面及 crop/raw 原圖點；numPoses 仍為 1，不跨人拼接。
- 四維 QC：點位信心、人物一致性、投影幾何、時間連續性；設定與 ROI／selection ID 進研究 JSON。
- target-lost／identity-uncertain 使角度無效，後續不自動接人。正常隱藏拒絕骨架，人工除錯可顯示紅色。
- 逐樣本四類人工標註、匿名 reviewer／人物 ID、指標 JSON。原始幾何、自動結果與人工覆核後結果分離。
- 人工判錯／混合／不確定使最終 CSV／圖表角度無效，原自動決策仍能計算 False-Valid Rate。
- schemaVersion 由 2 提升至 3；CSV 保留既有欄位並追加 ROI、QC、raw angle／reason、自動與人工資訊。
- 新增 docs/SUBJECT_TRACKING.md，包含失敗分類、A/B/C 比較、完整門檻、指標公式與同片驗證流程。

## A / B / C 決策

已靜態檢查 installed @mediapipe/tasks-vision 1.2.3 的 numPoses 與 landmarks[][] API，無穩定人物 ID。
選 A（single-pose＋ROI）搭配 C（便宜的純 TS 時間篩檢）；B（多候選關聯）暫不啟用。
多姿態的真實 CPU／效能未量測；不可把候選陣列 index 當身分。保留 TargetTracker 介面以便替換。

## 實際檢查

| 項目 | 結果 |
| --- | --- |
| npm ci --cache /workspace/.cache/npm | 通過，139 個套件；同版本本機 WASM postinstall 通過 |
| npm run typecheck | 通過 |
| npm test | 9 個檔案、62 個單元測試通過 |
| npm run build | 通過；仍有主要 JS bundle >500 kB 警告，未隱藏 |
| CHROMIUM_PATH=/usr/bin/chromium npm run test:browser | 10 passed、1 skipped；Chromium 156 |
| 原有流程 | MP4 解碼／損壞檔、5 Hz 時間、模型錯誤恢復、本機 WASM、角度、骨架 canvas、曲線 SVG、CSV／JSON、重分析與切側通過 |
| 新增合成案例 | 目標消失、交錯跳換、幾何混合疑慮、失敗後鎖定、保留 raw、紅色檢查骨架、人工覆核、重新 ROI 選取及像素映射通過 |
| ROI 拖曳 | 320×180 合成 MP4 的 20%/10%→80%/90% 框選，得到 x=64,y=18,w=192,h=144；確認後才允許分析 |
| 人工指標 | 已知人工標籤與自動狀態的單元／瀏覽器案例通過；沒有標註資料時 N/A，不自動產生真人真值 |
| 真實模型／人體 MP4 | 本環境缺資產，條件式 E2E 跳過；不是「通過」 |
| 指定 Squat 修正後實測 | 尚未在本環境重跑；待團隊同片人工前後比較 |
| Python／pytest | 無新 Python 實作，不適用 |

## 修正前後結果與界線

| 證據 | 修正前 | 修正後 |
| --- | --- | --- |
| 真實 subject_002_squat_good_side.mp4 | 團隊已成功分析，但觀察錯人／疑似混合；沒有錯誤率標註 | 尚無本次修正的同片結果，不宣稱已改善多少 |
| 已知高 visibility 跳換的 3 樣本合成單元案例 | 原 knee visibility／幾何邏輯放行 3/3 | 新 tracker 僅放行 1/3，後兩筆 identity-uncertain；這是合成程式回歸結果 |
| 5 樣本合成瀏覽器案例（lost/switch/mixed） | 不以本次模擬結果冒稱舊版真實資料表現 | 各案例自動有效率 20%（第一筆）；後續鎖定無效，raw 保留；新 ROI 重設且時戳不變 |
| 相似錯人平滑移入的合成限制案例 | 可能通過 | 仍可能通過 consistent-unverified；證明沒有完整解決身份問題 |

單元數量與合成結果不能證明人體／臨床可靠性提升，也不能用低 coverage 代替準確性。
指標只根據人工標註：Target Accuracy=C/A、False-Valid=F/V、Usable Coverage=U/N（已確認下限）；
Switch Count 只計相鄰且具人工 ID 的可比較配對。詳細分母、unknown 與 JSON 子集指標見 SUBJECT_TRACKING.md。

## 限制與下一步

ROI 是固定框，不是 re-identification；兩人重疊、相似身形、平滑換人、左右混點仍可能漏過。
門檻是未驗證工程值，透視／快速動作也可能被誤拒；torso 遺失一次便鎖定可能降低 coverage。
重新選人從片頭重分析，不支援中途接續或自動 reacquire。人工標註只在記憶體，需先下載 JSON；暫無匯入續標。
保存原片／模型 hash、來源尺寸與授權證據後，用相同影片／目標網格、相同指定人物、
盲化人工標註及相同分母報前後結果。優先檢查 False-Valid 與未知比例，再調門檻並提升版本。

## GitHub

沿用既有 feature/dataset-demo-v0，未推送或合併 main。
本次 `gh pr view feature/dataset-demo-v0 --repo ... --json url` 回傳
`Post "https://api.github.com/graphql": Forbidden`，無法查證既有 PR URL；不捏造新 PR。
最終 commit SHA 與推送狀態於交付訊息及 Git 歷史回報。
