# 第 23 輪：部署前後的網站功能驗證

基線為 `origin/main@a08d64a`。原本的 E2E 使用 Vite 開發伺服器，透過攔截 TypeScript 模組替換辨識器。新增的品質關卡啟動 Vite preview，以 repository 子路徑提供剛建置的 dist。PR 與 main 共用同一個檢查 job，main 成功後直接將受測的 dist 上傳到 Pages。

## 部署必過的四項 Chromium 測試

1. 開啟首頁、確認 React 已渲染、版本符合 checkout，驗證子路徑下 JS、CSS 與兩組 WASM 載入器及二進位資源，切換影片與鏡頭輸入。
2. 合成 MP4 的第一次官方下載請求由測試攔截並模擬斷線，使用者按重試後取得測試位元組。僅在瀏覽器測試環境中替換 SDK 推論工廠，保留正式應用的模型取得、初始化呼叫、雜湊、分析、繪圖及匯出流程。檢查角度、骨架像素、曲線、CSV 內容與 JSON 取樣，再於 390、768、1440px 比對影像比例、疊圖邊界與頁寬。
3. 使用 Chromium 模擬攝影機與合成姿態啟動量測，停止後驗證實際 MediaStreamTrack 進入 ended 狀態。
4. 使用正式 MediaPipe SDK 及本站 WASM，提供無效模型內容，驗證啟動取用正確子路徑的 WASM，並顯示可重試的錯誤。

既有合成 MP4 產生器、攝影機姿態資料與疊圖幾何斷言抽成測試共用檔。完整開發站 E2E 仍可另行執行。正式 bundle 將 SDK 分成獨立 chunk，測試替身只存在於 Playwright 的頁面環境。

## 實測結果

2026-11-24 於 macOS arm64 執行。下列為本機耗時，安裝瀏覽器與 GitHub runner 排隊時間另計。

| 項目 | 結果 | 耗時 |
| --- | --- | --- |
| `npm ci`，再以 Pages base 執行 `npm run check` | 安裝成功；typecheck、291 個單元測試與 production build 通過。Vite 仍提示主 bundle 大於 500 kB。 | check 8.51 秒 |
| `npm run test:smoke` | Chromium 4/4 通過 | 6.4 秒 |
| 三引擎 `@smoke` | Chromium 4、Firefox 3、Playwright WebKit 3 通過。後兩者略過專用 Chromium 模擬鏡頭，共 2 項略過 | 共 33.4 秒 |
| `npm run test:official` | 實際從 Google 下載固定版本 Lite，核對內容 SHA-256，在色塊 MP4 上執行真實推論並匯出 10 筆取樣 | 7.7 秒 |
| 既有開發站 E2E（`npm run test:browser`） | 37 通過，2 個需要核可真人素材的案例依條件略過 | 約 1 分鐘 |
| 版本不符演練 | 指定不同的預期 commit，Chromium 檢查回傳 exit 1，產生 trace.zip、失敗截圖與 HTML 報告 | 版本斷言等待 5 秒後失敗 |

三引擎可在執行 README 的子路徑建置後，用下列指令重跑：

```sh
npx playwright install chromium firefox webkit
npx playwright test -c playwright.quality.config.ts --grep @smoke
```

Google 服務的連線檢查可手動獨立執行。部署必要測試使用的 MP4、姿態、模型回應及攝影機都是測試素材。真實推論測試使用無人的色塊影片，兩類結果均無法評估人體辨識準確度。

## 公開網站與人工驗收

變更前已用 Chromium 開啟正式 HTTPS 網站。首頁渲染且回應 200，JS、CSS 回應 200，兩組 WASM 與載入器的部分讀取回應 206，WASM 標頭正確。現行公開版尚無 build-revision。新流程於部署後重試檢查最多約兩分鐘以容許 CDN 更新，失敗時標紅並保留診斷，版本處置由管理者決定。

- [ ] 首次合併部署後，比對 Actions 的 main SHA 與首頁 HTML 內 build-revision，確認 verify job 成功。
- [ ] 在實體 iPhone／iPad Safari 與 Android Chrome，以核可 MP4 試播、拖曳時間軸、檢查骨架／角度／曲線並開啟下載的 CSV／JSON。
- [ ] 測試實體鏡頭允許／拒絕權限、前後鏡頭、停止後指示燈、橫直向與短段錄影回放。Playwright WebKit 僅代表桌面測試引擎。
