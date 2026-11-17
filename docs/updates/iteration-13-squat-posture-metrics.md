# Iteration 13 — 深蹲姿勢指標：髖角、上身（軀幹）前傾、膝蓋內夾

2026-11-17 · app 0.6.1 · schema 10 · feature/squat-angles（自 feature/controlled-single-recovery 分出）· 未合併 main。

## 完成內容

新增三項深蹲常看的 2D 影像平面指標，與既有膝角共用同一套點位篩檢與身分 gating：

| 指標 | 定義 ID | 公式（先依影片寬高還原像素） | 備註 |
|---|---|---|---|
| 髖角（左右） | `hip-image-interior-v1` | 肩–髖–膝於髖點的內角（MediaPipe 左 11/23/25、右 12/24/26）；proxy `hip-flexion-proxy-180-minus-interior-v1` = 180° − 內角 | 側面較適合 |
| 上身（軀幹）前傾 | `trunk-lean-image-vertical-v1` | 兩髖中點→兩肩中點與畫面垂直向上的夾角（0° 直立、90° 水平，不分前後左右） | 依賴手機擺正；軀幹長 < 8 px 判退化 |
| 膝蓋內夾（動態膝外翻） | `knee-ankle-width-ratio-image-v1` | 兩膝距離 ÷ 兩踝距離（1 = 同寬，< 1 = 膝往內靠） | 只適用正面；兩踝距離 < 8 px 判退化 |

- `src/biomechanics/posture.ts`：純函式，不依賴 React／MediaPipe。`knee.ts` 抽出 `sourcePoint`／`sourcePoints` 供共用，膝角行為不變（原測試全數通過）。
- `src/tracking/gate.ts`：`gatePosture` 與 `gateAngle` 同優先順序。subject 未通過 → `identity-uncertain`／`target-lost`；髖角跟隨同側 joint QC；膝寬比需雙側 joint QC；軀幹只看 subject。
- `Sample.posture = {raw, automatic, final}`（選填）。`applyReview` 人工判非目標時 final 全部無效、automatic 保留。分析與 offline replay 都呼叫同一個 `measurePosture`。
- 畫面：膝角卡片下方新增「深蹲姿勢指標」卡片；曲線區新增「曲線指標」下拉（膝角／髖角／上身前傾／膝蓋內夾）。無效取樣仍為斷點。
- CSV：每筆取樣在兩列膝之後多四列（hip 左右、`trunk_lean`/`midline`、`knee_width_ratio`/`bilateral`），尾端新增 `metric_value`、`metric_unit`、`ungated_metric_value`。比值不寫入角度欄。
- `ANALYSIS_SCHEMA_VERSION` 9 → 10；replay 讀取接受 7/8/9/10。

## 檢查結果（本次實際執行）

- `npm run typecheck`：通過。
- `npm test`：25 檔、167 個單元測試全部通過（原 139 個 + 新增 28 個，含新 `posture.test.ts`、`postureGate.test.ts` 與 CSV 新測試）。
- `npm run build`：通過，仍有既有 bundle 大小警告。
- `npx playwright test`（Chromium）：31 通過／2 項真實模型資產測試因缺模型跳過。e2e 斷言配合本次變更更新：schema `'9'`→`'10'`、合成 5 取樣 CSV 由 12 行改為 32 行，並新增檢查 `trunk_lean` 與膝寬比定義 ID。

## 限制

- 全部是 2D 影像平面幾何，受視角、遮蔽、鏡頭傾斜與模型錯點影響，不是經驗證的臨床角度；只用合成資料驗證數學與資料流程，未做真人準確度驗證。
- 上身前傾以畫面垂直為基準，未估計重力方向；膝寬比在側面或腳併攏時無意義（判無效）。
- 定義、適用視角與是否需要提醒門檻都需物理治療師確認；本次不加任何門檻或提醒。

## 下一步

- 請 PT 確認三項定義（特別是「上身與垂直線」或「上身與小腿平行」何者符合臨床習慣，以及膝寬比是否合用）。
- 以真實側面／正面 Squat 影片檢查曲線是否合理，再討論門檻。
