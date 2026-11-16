# Iteration 01 — Project Initialization

日期：2026-11-16（Asia/Taipei） · 範圍：Task 1；不含 Dataset Demo V0.1。

## 已完成

- 繁體中文 README、長期規格、架構、資料來源紀錄、驗證草案、隱私倫理、決策與 AGENTS 規範。
- React 19.3.1 / TypeScript 5.9.3 / Vite 7.3.8 基礎頁面，清楚標示未實作分析與研究用途。
- 七層責任目錄、共用量測 TypeScript 型別；尚無分析演算法／runtime validation。
- 精確依賴版本、package-lock.json、Node pin、Git ignore 與 GitHub Actions 檢查設定。
- 雲端 install_script / start_skill 草稿已成功保存：lockfile 安裝、checks、服務啟動與 readiness。
  草稿不代表已套用或發布；仍需於環境設定檢視、儲存並發布。

## 儲存庫初始檢查

- origin：指定 Chen-Jung0929 GitHub repository；HTTPS read 成功，遠端無 refs。
- 初始 work 為 unborn branch，無提交、無既有檔案與使用者修改。
- 空 HEAD 時 push dry-run 因沒有 src refspec 而失敗，這不是權限拒絕。
- 首筆提交使用 main。提交後 `git push --dry-run origin main:main` 回傳 HTTP 403
  （Permission denied）；寫入權限未具備，實際 push 未進行，遠端交付受阻。
  本地 commit SHA 於交付訊息回報；需平台 GitHub 連線開放此 repo 寫入後重試。

## 實際測試與環境

Node v24.22.1，npm 11.9.0，Linux 雲端環境。

| 檢查 | 結果 |
| --- | --- |
| 初次 npm install | 失敗：預設 /home/agent/.npm cache 無法建立；沒有關閉 TLS 或套件驗證 |
| 指定 /workspace/.cache/npm 安裝 | 成功；React 與開發依賴已安裝 |
| npm ci --cache /workspace/.cache/npm | 成功；以 lockfile 重新安裝 97 個套件 |
| npm run typecheck | 通過 |
| npm test | 通過：1 test file，2 個初始化頁面 SSR 測試；不是角度演算法測試 |
| npm run build | 通過：29 modules；產生 HTML、CSS、JS，dist 不入版控 |
| 開發 HTTP smoke | 通過：5173 HTML 標題、兩個 JavaScript 資源 HTTP 200 |
| 建置 preview HTTP smoke | 通過：4173 HTML、bundle HTTP 200；bundle 包含研究用途文字 |
| git diff --check | 通過；提交前亦檢查 staged diff |
| 資料集 landing page | HTTP 403；沒有下載，license 尚未核實 |
| pytest | 未執行：沒有 Python 實作或套件環境需求 |
| GitHub Actions／瀏覽器互動 E2E | 未在本次驗證；本機 checks、SSR 與 HTTP smoke 不等同於遠端 CI 或完整瀏覽器測試 |

## 已知限制

沒有姿態推論、角度、曲線、ROM、匯出、攝影機、統計驗證或前後測比較。
MediaPipe／Recharts／Python 統計套件依功能加入；本次沒有下載模型。
型別契約不強制執行時數值範圍。沒有臨床效度結果或已確認可接受誤差。
Ignore 規則不能阻止所有個資；每次 staged diff 均須審查，JSON 特別留意。

## 下一步：獨立的 Dataset Demo V0.1 任務

1. 查核 Mendeley V1 授權、來源與可用側面 Squat 影片，記錄檔案 hash 與 provenance。
2. 選定並固定 MediaPipe runtime／模型資產與設定，核對模型授權及網路行為。
3. 定義並測試 2D 膝部幾何角、長寬比轉換、側別／鏡像、QC 與缺失值。
4. 依下一任務範圍逐步接影片、骨架、曲線及 CSV；不得提前宣稱整個 V0 完成。
