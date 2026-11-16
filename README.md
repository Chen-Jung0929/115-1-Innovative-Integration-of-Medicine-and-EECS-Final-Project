# 即時關節動作分析系統

國立臺灣大學 115-1 醫學電資創意整合專題 · Real-Time Joint Motion Analysis System

這是一套讓團隊以瀏覽器觀察人體動作、檢查膝部影像平面角度的學術概念驗證（PoC）。
**不提供醫療診斷或治療建議，模型估計值不是經驗證的臨床角度。**

## 目前成果與驗證狀態

MP4 載入、5 Hz 目標離線取樣、MediaPipe 膝部 2D 角度、骨架、曲線及 CSV／研究 JSON 已實作。
團隊已使用官方 Lite 模型初步分析 Mendeley V1 的 `subject_002_squat_good_side.mp4`，
並回報多人場景選錯受測者、疑似混合 landmarks。這是團隊實際操作回報，不是本雲端重跑或正式效度結果。

本次加入**手動固定 ROI、保守人物一致性檢查、人工逐樣本標註及指標**。
高 visibility 不等於正確人物；ROI 與時間規則不能保證解決遮蔽或重疊。
修正後仍需在同一真實影片進行人工標註與前後比較，不宣稱已完全修復或已驗證臨床角度。

本次自動測試：75 個單元測試；瀏覽器 12 通過、1 個真實人體測試因本環境缺資產而跳過。
實際測試與限制見 [受測者選擇進度](docs/updates/iteration-02-subject-tracking.md)、
[追蹤與指標定義](docs/SUBJECT_TRACKING.md)；[原始 V0 紀錄](docs/updates/iteration-01-dataset-demo.md)保留歷史狀態。

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
3. 在「受測者選擇」按「框選受測者」，系統會暫停並回到片頭。
   在影片上拖曳框選單一受測者（或輸入原始像素 ROI），保留髖、膝、踝與活動空間，按「確認 ROI」。
   避免把其他人框入；固定 ROI 不會跟人移動。
4. 按「開始分析」，等候進度完成；可以取消，取消後不匯出不完整資料。
5. 播放／暫停影片，或使用「檢查已分析取樣」滑桿逐點檢查骨架與數值。
   每秒只有 5 次目標取樣，未分析的影格會顯示 N/A 並隱藏骨架，不拿鄰近姿態冒充當前結果。
6. 切換左膝、右膝或 Both，查看角度曲線與每側有效取樣比例。曲線無效處保留斷點。
7. 下載 CSV；研究需要時可下載含二維 landmarks 與完整設定資訊的 JSON。
   匯出含來源檔名及人體特徵，請留在受限空間，不要提交 Public GitHub。
8. 按「重新分析」重新建立完整結果；每次使用新模型實例與 session，避免 VIDEO 時間戳倒退。

若顯示 `target-lost`／`identity-uncertain`，角度為 N/A，後續取樣不自動接到另一個人。
可「重新選擇受測者」再分析；會清除先前曲線與人工標註，操作前先下載研究 JSON。
正常不顯示失敗骨架；可勾選紅色除錯顯示供人工檢查。

在「人工受測者標註」以取樣滑桿逐點檢查原始影片，選擇 Correct target／Wrong target／
Mixed landmarks／Uncertain，填匿名標註者代碼；不同人可填 person-B 等人工代碼。
頁面及 JSON 提供 Target Accuracy、False-Valid Rate、Usable Coverage、Subject Switch Count，
沒有標註或可比較資料時為 N/A。人工錯誤／混合／不確定會使最終角度無效，但保留自動 QC 原決策。
指標分母與資料範圍見 [完整定義](docs/SUBJECT_TRACKING.md)；不要把未標註或 Unknown 當正確。
標註目前只在記憶體，離開頁面前下載研究 JSON；尚不支援匯入接續標註。

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
| target-lost／identity-uncertain | 目標遺失、幾何／時間異常或鎖定；重新選擇並分析，或先裁短影片。相似錯人仍可能通過，需人工檢查 |
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
Mendeley 的 Good/Bad Form 標籤不是角度或身份真值；目前已知實測檔名，但授權、hash 與逐樣本人工結果仍待補齊。

## 專案文件

- [長期規格](docs/PROJECT_SPEC.md)、[架構](docs/ARCHITECTURE.md)、[資料集](docs/DATASET.md)。
- [隱私倫理](docs/PRIVACY_AND_ETHICS.md)、[決策](docs/DECISIONS.md)、[Agent 規範](AGENTS.md)。
- [初始化紀錄](docs/updates/iteration-01.md)、[Dataset Demo 紀錄](docs/updates/iteration-01-dataset-demo.md)。

## 開發路線（以功能完成決定版本）

後續依功能完成推進：先完成 V0 多人可靠性的同片人工驗收，再做 V1 即時攝影機、V2 物治確認
的上下台階／抬腿動作、V3 量測驗證、V4 展示整合。版本不依固定日期決定。

解碼修正（Phase A1）：重複 seek 0 秒會使用已有影格；背景回呼延遲時，以已完成尋時且可繪製的影格繼續，記錄 `seek-position-estimate`，不冒稱精確影格 PTS。等待失敗包含 readyState／seeking 等診斷，不一律歸咎編碼。

ROI 可重新進入編輯，拖曳內部移動、四角與四邊縮放；數值會限制在來源畫面內。Restore Previous 回復已套用矩形，Reset 回全畫面，取消編輯不影響原分析。只有 Apply 會使舊結果 stale；可另存舊 JSON，重新分析後保留先前 session 下載入口。
