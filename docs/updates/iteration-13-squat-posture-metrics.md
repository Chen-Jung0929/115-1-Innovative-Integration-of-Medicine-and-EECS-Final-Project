# Iteration 13 — 深蹲姿勢指標：髖角、上身（軀幹）前傾、膝蓋對腳尖線

2026-11-17 · app 0.6.1 · schema 10 · feature/squat-angles（自 feature/controlled-single-recovery 分出）· 未合併 main。

## 完成內容

新增三項深蹲常看的 2D 影像平面指標，與既有膝角共用同一套點位篩檢與身分 gating：

| 指標 | 依據 | 定義 ID | 公式（先依影片寬高還原像素） | 備註 |
|---|---|---|---|---|
| 髖角（左右） | 自訂 | `hip-image-interior-v1` | 肩–髖–膝於髖點的內角（MediaPipe 左 11/23/25、右 12/24/26）；proxy `hip-flexion-proxy-180-minus-interior-v1` = 180° − 內角 | 側面較適合；臨床髖屈曲看大腿相對骨盆，MediaPipe 無骨盆點 |
| 上身（軀幹）前傾 | 自訂 | `trunk-lean-image-vertical-v1` | 兩髖中點→兩肩中點與畫面垂直向上的夾角（0° 直立、90° 水平，不分方向） | 側面＝前傾；正面拍時對應講義 p.9「軀幹應平行鉛垂線（不側彎）」；依賴手機擺正 |
| 膝蓋對腳尖線（膝蓋內夾，dynamic knee valgus） | 講義 p.11 | `knee-toe-plumb-offset-hip-width-image-v1` | 膝蓋（25/26）與「過腳尖（foot index 31/32）的畫面鉛垂線」的水平距離 ÷ 骨盆寬（23–24）；+ = 膝在內側 | 只適用正面；講義標準為在線上或微外側且左右對稱；以腳尖點代替第二趾 |

依據欄：「講義 p.X」= 團隊 Movement analysis 講義該頁觀察重點（無數字門檻）；「自訂」= 講義沒有，依需求加入。

- `src/biomechanics/posture.ts`：純函式，不依賴 React／MediaPipe。`knee.ts` 抽出 `sourcePoint`／`sourcePoints` 供共用，膝角行為不變（原測試全數通過）。
- 內側方向以「朝另一側髖」判斷，人面向或背對鏡頭時 + 都代表解剖內側。兩髖水平距離 < 8 px（側面拍）判退化。
- `src/tracking/gate.ts`：`gatePosture` 與 `gateAngle` 同優先順序。subject 未通過 → `identity-uncertain`／`target-lost`；髖角與膝對腳尖線跟隨同側 joint QC；軀幹只看 subject。
- `Sample.posture = {raw, automatic, final}`（選填）。`applyReview` 人工判非目標時 final 全部無效、automatic 保留。分析與 offline replay 都呼叫同一個 `measurePosture`。
- 畫面：膝角卡片下方新增「深蹲姿勢指標」卡片（左右髖、上身前傾、左右膝對腳尖線）；曲線區新增「曲線指標」下拉。無效取樣仍為斷點。
- CSV：每筆取樣在兩列膝之後多五列（hip 左右、`trunk_lean`/`midline`、`knee_toe_offset` 左右），尾端新增 `metric_value`、`metric_unit`、`ungated_metric_value`。非角度值不寫入角度欄。
- `ANALYSIS_SCHEMA_VERSION` 9 → 10；replay 讀取接受 7/8/9/10。

## 檢查結果（本次實際執行）

- `npm run typecheck`：通過。
- `npm test`：25 檔、168 個單元測試全部通過（原 139 個 + 新增 29 個，含 `posture.test.ts`、`postureGate.test.ts` 與 CSV 新測試）。
- `npm run build`：通過，仍有既有 bundle 大小警告。
- `npx playwright test`（Chromium）：31 通過／2 項真實模型資產測試因缺模型跳過。e2e 斷言配合本次變更更新：schema `'9'`→`'10'`、合成 5 取樣 CSV 由 12 行改為 37 行，並新增檢查 `trunk_lean` 與膝對腳尖線定義 ID。

## 限制

- 全部是 2D 影像平面幾何，受視角、遮蔽、鏡頭傾斜與模型錯點影響，不是經驗證的臨床角度；只用合成資料驗證數學與資料流程，未做真人準確度驗證。
- 以畫面垂直當鉛垂線，未估計重力方向。腳尖點不是第二趾，腳尖外八時可能影響判讀。
- 髖角與上身前傾講義沒有對應定義；定義、適用視角與是否需要提醒門檻都需物理治療師確認；本次不加任何門檻或提醒。

## 下一步

- 請 PT 確認：上身前傾要看「與垂直線」還是「與小腿平行」；膝對腳尖線用腳尖點代替第二趾是否可以；「微外側」可接受到多少。
- 以真實正面／側面 Squat 影片檢查曲線是否合理，再討論門檻。
