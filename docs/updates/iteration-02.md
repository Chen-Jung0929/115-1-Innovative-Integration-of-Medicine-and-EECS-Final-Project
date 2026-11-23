# Iteration 02 — GitHub Pages 部署

2026-11-24（Asia/Taipei）。基線為 `main@d23a72f`。

## 本次變更

`deploy-pages.yml` 依 `.nvmrc` 選擇 Node，只發布通過型別檢查、單元測試與建置的 Pages artifact。建置 job 唯讀，只有 deploy job 能寫入 Pages 並取得 OIDC token。部署依賴 build 成功，同一分支的執行排隊。Vite 讀取部署指定的子路徑。原有 PR 檢查繼續執行。

## 本機驗證

| 檢查 | 結果 |
| --- | --- |
| `npm ci` | Node 24.14.1、npm 11.11.0 安裝 97 個套件。Actions 依 .nvmrc 使用 24.22.1。 |
| `npm run typecheck`、`npm test` | 型別檢查通過，1 個測試檔中的 2 個初始化頁面測試通過。 |
| `PAGES_BASE_PATH=/115-1-Innovative-Integration-of-Medicine-and-EECS-Final-Project/ npm run build` | 29 個模組，輸出 HTML、JS 與 CSS。 |
| Chrome 無頭瀏覽器、全新設定檔 | 將 dist 掛在靜態伺服器的正式子路徑，首頁、JS、CSS 回應 200，React 渲染「關節動作分析研究工作台」。本機 Vite 開發站也能從根路徑渲染相同標題。 |

## 相依 PR 與待人工驗收

基線只有初始化頁。等影片或攝影機功能經團隊合併到 main，再另開模型載入 PR。已從遠端分支唯讀核對以下接點。

- 重用 `src/pose/mediapipe.ts` 的 `modelBytes` 及 `createPoseEngine`。影片與攝影機開始分析時預設允許下載 Google 官方 Pose Landmarker Lite（固定 float16/1）。目前相依程式的官方下載預設關閉，整合時需同步檢查兩個入口的選項。
- 在開始後顯示載入中、就緒或失敗，提供重試與選取本機 .task 的備援。沿用 SHA-256 計算，記錄來源、模型資產版本及套件版本。模型二進位檔不入 Git。
- 核對安裝步驟有從鎖定的 tasks-vision 套件準備 JS/WASM，並在 dist 內驗證相對位置。既有 FilesetResolver 以 BASE_URL 加上 mediapipe/wasm 載入。用瀏覽器確認 WASM 的 MIME 為 application/wasm 並能實際啟動引擎。
- **待人工驗收（首次公開部署）**：在 Pages 啟用 GitHub Actions 並合併部署 PR 後，核對 Actions 的 main SHA、deploy 結果與 HTTPS 首頁。下次正常合併後核對新 SHA 與網站內容。遇到失敗建置時比對部署歷史，確認 deploy 略過且上一個成功版本仍可用。
- **待人工驗收（模型 PR 合併後）**：使用全新瀏覽器設定檔直接開站，選 MP4 或允許攝影機後開始分析，確認無須安裝或手動選模型；檢查骨架、角度、曲線、匯出與來源紀錄。封鎖模型請求測試錯誤狀態、重試及本機檔備援。用 Network 確認影片、攝影機影像與量測結果只在本機處理。
