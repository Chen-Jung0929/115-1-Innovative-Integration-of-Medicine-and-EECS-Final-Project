# Model and runtime provenance

## Current runtime

- `@mediapipe/tasks-vision` 1.2.3，精確版本與 npm integrity 見 package-lock.json。
- 套件 package.json 宣告 Apache-2.0；不把程式庫授權自動延伸為所有模型或資料集的授權。
- `npm ci` 的 postinstall 從該套件複製 WASM 至 `public/mediapipe/wasm`；不從外部 CDN 取 WASM。
- PoseLandmarker：VIDEO、CPU、numPoses=1、detection/presence/tracking thresholds=0.5。
- 推論時間使用解碼影格的來源 timestamp（ms），只送嚴格遞增值；重新分析使用新實例。
- 所有模型與 WASM 二進位檔均不提交 Git。node_modules／public generated assets／dist ignored。

## Model selection

預設官方候選：Google Pose Landmarker Lite，float16，asset version 1。
官方 URL：
https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task

順序：明確選取本機 File → 本站 BASE_URL + models/pose_landmarker_lite.task →
只有使用者勾選才允許 Google 官方 URL fallback。
404 或 SPA 的 HTML fallback 判為不存在；403／其他部署錯誤不偷偷 fallback。
檔案限 50 MB；讀取內容計算 SHA-256 並記錄於每次 session。hash 表示內容識別，
不是預先簽署的可信驗證。取得與使用者自行提供模型時須自行核對官方來源。

模型 license／model card 尚未在此環境獨立核實；Google host 被網路政策擋下，
不假稱已確認再分發許可。由使用者從官方取得後本機載入。
程式支援本機模型，但本次沒有取得有效模型進行真實人體推論；只有 invalid model
失敗恢復與本地 WASM 載入測試。未採用不明鏡像或第三方模型。

## Deployment and privacy

模型檔缺失不影響網頁啟動、選片與播放；分析提供可恢復的明確錯誤。
模型與 WASM 同站點時不需外部連線。未啟用 service worker，不保證關閉伺服器後仍能開啟網站。
「離線」是本地檔案分析，非 PWA 離線安裝承諾。需要網路的選用下載只傳模型 GET，
不傳影片、landmarks 或量測值。專案沒有分析上傳 API 或遙測。
如把模型放 public，build 會複製到 dist，發布靜態站點前須先確認模型再分發條款。

## 0.3.0 follow-up（2026-11-17）

團隊回報已取得官方 Lite 並成功分析真實 Squat；本環境仍未持有相同資產。
numPoses 仍為 1；adapter 改為回傳候選陣列並保留可用 z，沒有跨人合併。
輸入改為手動 ROI 實際裁切畫布；候選映射與保守追蹤介面見 SUBJECT_TRACKING.md。
來源時間、同版本本機 WASM、官方／本機模型載入規則不變。
