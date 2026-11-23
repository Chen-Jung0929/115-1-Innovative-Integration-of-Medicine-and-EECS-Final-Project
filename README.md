# 即時關節動作分析系統

國立臺灣大學 115-1 醫學電資創意整合專題 · Real-Time Joint Motion Analysis System

我們希望讓物理治療師用一般攝影機觀察動作，逐步取得關節角度、變化曲線與活動範圍。
這是**學術概念驗證（PoC）**，僅輔助運動評估與溝通，不提供醫療診斷或治療建議。
姿態辨識估計值尚未證明等同於臨床量測。

## 目前成果

已建立 React + TypeScript + Vite 基礎專案、初始化狀態頁、模組目錄、資料契約與研究文件。
**目前尚不能分析影片或攝影機**；沒有模型推論、角度計算、曲線、ROM 或匯出功能。
本次驗證結果見 [Iteration 01](docs/updates/iteration-01.md)。

## 開發路線（以功能完成決定版本）

| 階段 | 預期可操作成果 | 狀態 |
| --- | --- | --- |
| Initialization | 可安裝、測試與建置的專案骨架及研究規範 | 本次交付 |
| V0 Dataset Demo | 側面深蹲影片 → 骨架 → 膝部角度 → 曲線 → CSV | 尚未開始；下一個獨立任務為 V0.1 |
| V1 Real-Time Demo | 筆電攝影機即時骨架、角度與曲線 | 規劃中 |
| V2 Clinical Motion Analysis | 上下台階、單腳抬高 90°；依物治定義分析角度與 ROM | 待定義確認 |
| V3 Validation | 人工參考標註、MAE／RMSE／Bias、視角與追蹤效度分析 | 規劃中 |
| V4 Final PoC | 操作介面、保存、前後測比較及初步驗證結果 | 規劃中 |

## 如何啟動（開發者）

需要 Node.js（本次使用 24.22.1；版本見 `.nvmrc`）與 npm。
在專案根目錄執行：

```sh
npm ci
npm run dev
```

若雲端預設 npm cache 無法寫入，使用 `npm ci --cache /workspace/.cache/npm`。
啟動後會看到初始化說明頁；沒有資料上傳或攝影機存取。
本機開發伺服器預設埠為 5173。完整檢查：

```sh
npm run typecheck
npm test
npm run build
```

`npm run preview` 可檢視建置輸出。`npm test` 目前只有 2 個狀態頁測試，並未驗證量測演算法。
Python 統計分析尚未實作，故本次沒有 pytest 結果。

## GitHub Pages 部署與驗收

[預期網站網址](https://chen-jung0929.github.io/115-1-Innovative-Integration-of-Medicine-and-EECS-Final-Project/)在首次部署成功後供組員直接開啟。第一版部署內容為初始化頁。驗證紀錄與模型整合條件見 [Iteration 02](docs/updates/iteration-02.md)。

1. 管理者到 **Settings → Pages → Build and deployment → Source** 選 **GitHub Actions**。如果已限制部署分支，請確認 `github-pages` environment 允許 `main`。
2. 部署工作流程合併進 `main` 後，每次推送到 `main`（含合併 PR）都會執行 **Deploy to GitHub Pages**。依序安裝鎖定依賴、型別檢查、單元測試及建置。全部成功後才上傳 `dist/` 並發布，同一時間只執行一個正式部署。
3. 手動部署目前版本時，開啟 **Actions → Deploy to GitHub Pages → Run workflow**，選 `main`。在成功執行的 **deploy** 工作中開啟 environment 網址，確認對應的 commit 與頁面內容。
4. 若建置失敗，在 **build** 的第一個失敗步驟查看日誌，修正後透過 PR 合併；部署工作會略過失敗的建置。若部署遇到 403 或 Pages 設定錯誤，檢查 Pages 來源、environment 分支規則與 Actions 是否允許工作流程宣告的 Pages 和 OIDC 權限。
5. 若首頁空白或資源 404，從完整的 repository 子路徑開啟網站，在瀏覽器 Network 確認 JS 與 CSS 請求位於該子路徑的 `assets/`。部署時 `PAGES_BASE_PATH` 由 repository 名稱產生，本機開發預設為 `/`。未來載入 `public/` 的 WASM 時，須從 `import.meta.env.BASE_URL` 組合路徑，並確認回傳 WASM 而非 HTML。

開發者可用以下指令在本機預覽相同的子路徑，開啟終端機顯示的完整網址。

```sh
export PAGES_BASE_PATH=/115-1-Innovative-Integration-of-Medicine-and-EECS-Final-Project/
npm run build
npm run preview
```

## 文件與協作

- [長期規格](docs/PROJECT_SPEC.md)：需求、各版本驗收與待確認事項。
- [軟體架構](docs/ARCHITECTURE.md)：模組邊界、共用核心與資料流。
- [資料集紀錄](docs/DATASET.md)：來源、授權查核狀態與影片登錄規則。
- [驗證計畫](docs/VALIDATION_PROTOCOL.md)：量測誤差、標註一致性及效度研究。
- [隱私與倫理](docs/PRIVACY_AND_ETHICS.md)：Public repo 的資料界線。
- [決策紀錄](docs/DECISIONS.md)／[進度紀錄](docs/updates/)／[Agent 規範](AGENTS.md)。

MediaPipe、Recharts、NumPy／pandas／SciPy 將在對應功能實作時加入。
影片、人體標註、量測輸出與金鑰不能提交到此 Public repo；忽略規則不等於存取控制。
資料集授權尚未獨立查核；Good/Bad Form 標籤不是角度真值。
