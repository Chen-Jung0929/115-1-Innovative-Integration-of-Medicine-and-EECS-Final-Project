# 即時關節動作分析系統

國立臺灣大學 115-1 醫學電資創意整合專題 · Real-Time Joint Motion Analysis System

這是一套讓團隊以瀏覽器觀察人體動作、檢查膝部影像平面角度的學術概念驗證（PoC）。
**不提供醫療診斷或治療建議，模型估計值不是經驗證的臨床角度。**

## 目前成果與驗證狀態

Dataset Demo V0 已實作 MP4 載入、離線固定取樣、MediaPipe 姿態介接、膝部 2D 角度、
骨架疊圖、左右側切換、時間曲線、有效取樣比例與 CSV／研究 JSON 匯出。
影片播放與分析分離，播放或拖曳不會重新推論。

**目前為待真實人體影片驗收的 V0 候選版本，不標記正式完成。**
39 個單元測試通過；Chromium 自動操作涵蓋真實 MP4 解碼、錯誤恢復與模擬姿態整合。
有效官方模型與真實人體影片推論測試尚未執行；指定 Mendeley 資料集也尚未實測。
合成影片與模擬姿態測試不能證明 MediaPipe 推論或臨床效度。
詳細紀錄見 [本次進度](docs/updates/iteration-01-dataset-demo.md)。

## 安裝與啟動

先安裝 Node.js（本次使用 24.22.1，見 `.nvmrc`），下載或 clone 此專案後在專案目錄執行：

```sh
npm ci
npm run dev
```

依終端機提示在本機瀏覽器開啟開發頁面。建議新版 Chrome／Edge，須支援
`requestVideoFrameCallback`。雲端 npm 快取若無法寫入，改用：

```sh
npm ci --cache /workspace/.cache/npm
```

安裝會自動把已鎖定的 `@mediapipe/tasks-vision` 套件內 WASM 複製到
`public/mediapipe/wasm/`。**不使用外部 WASM CDN**，勿混用其他版本。
正式建置使用 `npm run build`，`npm run preview` 可在本機檢查建置結果。
模型與影片準備好後，分析過程不需要把資料傳送到遠端；本版沒有攝影機或後端。

## 在 Mac 準備官方模型

僅使用 Google 官方 Pose Landmarker Lite 模型：

- 模型檔名：`pose_landmarker_lite.task`
- [官方模型下載](https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task)

將連結下載至 Mac，確認存下的是 `.task` 二進位檔，而不是錯誤網頁或 HTML。
不要下載非官方替代模型來繞過網路限制。可以用以下任一方式載入：

1. **專案本機路徑（預設）**：把檔案放在
   `public/models/pose_landmarker_lite.task`。開發伺服器會透過
   `/models/pose_landmarker_lite.task` 提供檔案；這是網址路徑，不是 Mac 的根目錄。
2. **直接選取 Mac 檔案**：展開「模型設定與資料隱私」，按「本機 .task 模型」選取
   已下載檔案。手動選取的檔案優先於專案路徑，不需要複製檔案或上傳到伺服器。
   按「改用專案本機模型」可取消這個選擇。
3. **選用官方下載**：明確勾選「本機模型不存在時，允許從 Google 官方下載」。
   只有專案路徑不存在且已勾選時才連線 Google；預設不自動下載。

每次分析會記錄模型來源、套件版本與實際內容的 SHA-256；這是識別與重現資訊，
不是模型授權或醫療效度的保證。不同來源的模型不可未經確認就混合比較。

`.task`、產生的 WASM、影片與輸出都排除於 Git；請勿強制加入。
在確認模型授權與分發方案前，不提交大型模型二進位檔。
若把模型放進 `public/`，建置會將它複製到 `dist/`；對外部署前仍須檢查再分發授權。
目前程式庫授權記錄見 [模型與資源說明](docs/MODEL_SETUP.md)。

## 一般組員操作流程

1. 啟動網頁，選擇 MP4 影片；建議先用短、全身可見的側面深蹲影片。
2. 確認顯示的檔名、秒數、寬高，並按上述方法準備模型。
3. 按「開始分析」，等候進度完成；可以取消，取消後不匯出不完整資料。
4. 播放／暫停影片，或使用「檢查已分析取樣」滑桿逐點檢查骨架與數值。
   每秒只有 5 次目標取樣，未分析的影格會顯示 N/A 並隱藏骨架，不拿鄰近姿態冒充當前結果。
5. 切換左膝、右膝或 Both，查看角度曲線與每側有效取樣比例。曲線無效處保留斷點。
6. 下載 CSV；研究需要時可下載含二維 landmarks 與完整設定資訊的 JSON。
   匯出含來源檔名及人體特徵，請留在受限空間，不要提交 Public GitHub。
7. 按「重新分析」重新建立完整結果；每次使用新模型實例與 session，避免 VIDEO 時間戳倒退。

左／右是人體解剖側，不是螢幕左右；本版不鏡像。
內角是髖–膝–踝在膝點形成的 0–180° 影像平面幾何角。
暫定屈曲 proxy = 180° − 內角，**不是已確認的臨床屈曲角**。

## 常見問題

| 狀況 | 解決方式 |
| --- | --- |
| 找不到專案本機模型 | 確認檔案位於 `public/models/pose_landmarker_lite.task`，或直接在介面選取 Mac 檔案；其他功能仍可操作 |
| 官方下載失敗／403 | 取消遠端下載，改用自己取得的官方 `.task`；不需要關閉 TLS 驗證或換不明來源 |
| 模型初始化失敗 | 確認不是 HTML、壓縮檔或不相容模型；重新下載官方 Lite 檔。未完成分析不提供匯出 |
| WASM 404／載入失敗 | 在專案根目錄重新 `npm ci`；確認本站 `/mediapipe/wasm/` 資源可讀，不要手動混入其他版本 |
| MP4 無法解碼 | 檔案可能損壞，或 MP4 內的編碼不支援；建議先轉成 H.264 MP4，再用新版 Chrome／Edge 開啟 |
| 影片太大或太長 | 本版限制 500 MB、10 分鐘；先在本機裁成較短片段 |
| 骨架或角度 N/A | 可能是未取樣影格、缺點、低信心、出框或退化向量；用取樣滑桿檢查，勿解讀為 0° |
| 分析速度慢 | CPU 推論與解碼在主執行緒，長片較慢；先用短片並等候進度，不保證即時效能 |
| 不支援影格回呼 | 更新 Chrome／Edge；本版不以不精確計時器假裝精確影格同步 |

## 自動檢查與研究限制

```sh
npm run typecheck
npm test
npm run build
```

瀏覽器測試另需 FFmpeg 與 Playwright Chromium：

```sh
npx playwright install chromium
npm run test:browser
```

雲端已有 Chromium 時可使用 `CHROMIUM_PATH=/usr/bin/chromium npm run test:browser`。
真實人體影片測試需要本機核准檔案；指定 `POSE_MODEL_PATH` 與 `POSE_VIDEO_PATH` 才會執行，
未指定時該測試會明確跳過。測試產生的合成影片只驗證軟體流程，不是資料集實測。

取樣時間網格固定，但實際解碼受瀏覽器、編碼及可變影格率影響；保留目標時間與解碼
presentation timestamp，去除重複／逆序影格。本版不宣稱分析全部影格或跨平台位元一致。
詳見 [分析方法](docs/ARCHITECTURE.md) 與 [驗證草案](docs/VALIDATION_PROTOCOL.md)。
沒有經驗證的 ROM、臨床判讀、三維運動學或前後測功能；Python 統計尚未開始。
Mendeley 的 Good/Bad Form 標籤不是角度真值，資料集授權與實際選片仍待查核。

## 專案文件

- [長期規格](docs/PROJECT_SPEC.md)、[架構](docs/ARCHITECTURE.md)、[資料集](docs/DATASET.md)。
- [隱私倫理](docs/PRIVACY_AND_ETHICS.md)、[決策](docs/DECISIONS.md)、[Agent 規範](AGENTS.md)。
- [初始化紀錄](docs/updates/iteration-01.md)、[Dataset Demo 紀錄](docs/updates/iteration-01-dataset-demo.md)。

## 開發路線（以功能完成決定版本）

後續依功能完成推進：先完成 V0 真實影片與模型驗收，再做 V1 即時攝影機、V2 物治確認
的上下台階／抬腿動作、V3 量測驗證、V4 展示整合。版本不依固定日期決定。
