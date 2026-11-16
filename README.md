# 即時關節動作分析系統

國立臺灣大學 115-1 醫學電資創意整合專題 · Real-Time Joint Motion Analysis System

這是一套讓團隊以瀏覽器觀察人體動作、檢查膝部影像平面角度的學術概念驗證（PoC）。
**不提供醫療診斷或治療建議，模型估計值不是經驗證的臨床角度。**

## 目前成果與驗證狀態

v0.5.0 為**姿態估計架構比較版本**。已暫停擴充 ROI Tracking，保留 v0.4.0 程式與操作模式，
新增全畫面單人、全畫面多人選取，以及同源 A/B/C 比較。

團隊回報 Adaptive ROI 在真實影片未明顯改善、可能更不穩定。裁切資訊不完整、尺度變動、
模型 temporal tracking 與錯誤回饋累積均為**待驗證假說**，目前沒有證實原因或決定最佳架構。
本環境沒有有效模型／`subject_002_squat_good_side.mp4`，沒有捏造人體實測或準確度結果。

驗證：109 個單元測試、typecheck、build 通過；Chromium 23 通過、2 個真實資產測試跳過。
原有 ROI 流程保留並通過回歸，build 仍有 bundle 大小警告。
詳見 [研究方法](docs/PIPELINE_COMPARISON.md) 與 [本次迭代](docs/updates/iteration-09-pipeline-comparison.md)。

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

## 一般組員操作：比較三種方法

| 管線 | 送入 MediaPipe 的影像 | 如何選人／限制 |
| --- | --- | --- |
| A · Full Frame + Single Pose | 完整原始影格，numPoses=1 | 參考框確認初始人；模型只回一人，若選錯而沒有目標候選只能拒絕 |
| B · ROI Cropping + Adaptive Tracking | 裁切後的動態 ROI，保留 v0.4.0 | 可能缺少上下文、尺度變動；仍需驗證，沒有刪除或進一步調參擴充 |
| C · Full Frame + Multi-Pose + Subject Selection | 完整原始影格，numPoses=2 或 3 | 由初始位置、軀幹與時間連續性選候選；重疊或多人皆合理時拒絕，候選編號不是固定人物 ID |

1. 選擇短、可清楚看到人體的 MP4，準備官方模型。預設先選 A；可從「分析管線」改選 B 或 C。
2. 按「框選受測者」。A/C 可圈指定人的軀幹中心附近：這是**選人參考框，不會裁切模型輸入**。
   B 的裁切框需包含完整人體與活動空間。按「確認 ROI（Apply）」。
3. 按「開始分析」試跑單一方法，或按「依序比較 A / B / C」。批次固定同一影片 SHA-256、
   同一模型內容與 5 Hz 目標取樣；B 固定使用 Adaptive，C 的 2／3 候選數可在「比較設定」選擇。
4. 等待三法依序完成。若某方法不支援／失敗，保留錯誤與其他成功結果，不把失敗填成 0%。
5. 在比較表按方法切換結果，以取樣滑桿檢查骨架與角度；播放不會再次推論。
   確認人物、缺點與可能混合骨架，需要時開啟紅色拒絕骨架。單一候選／高 visibility 都不等於正確人物。
6. **分別人工標註每個方法**的 Correct target／Wrong target／Mixed landmarks／Uncertain。
   不會把 A 的標籤自動複製給 B/C。人工錯誤／混合／不確定使最終角度無效，自動 QC 原決策保留。
7. 下載「比較指標 CSV」及「A/B/C 比較 JSON」；後者含三次原始 session、模型與影片 hash、
   輸入範圍、參考框、候選、時間精度、選人決策、人工標註、版本與報告。
   也可對目前方法下載原有角度 CSV／研究 JSON。離開前先下載，資料只在記憶體、沒有自動上傳或匯入續標。

比較表列 Valid Frame Rate（實為取樣有效率）、人工 Correct Target Rate、False-Valid Rate、
Usable Coverage、Landmark 不連續警示、分析耗時；完整失敗原因與分母可展開查看。
沒有人工標註時，人工欄位顯示 N/A。高有效率不代表選對人。

表格只比較三法共同保留的 requested 目標時間；報告同時提供全部原始取樣指標。
逐次解碼可能取得不同實際影格，時間估計與已知呈現偏移會記錄，不能直接假設精確逐影格配對。
耗時包含各自初始化、解碼、推論與清理，排除批次共用準備；執行順序固定 A→B→C，可能有暖機／裝置偏差。
這是三個完整流程的比較，**不能單靠結果把差異全部歸因於裁切**。

### 保留的 ROI 操作

在 B 仍可使用 Fixed、Manual Keyframes、Adaptive，以及矩形移動、八方向縮放、數值輸入、
Restore Previous、Reset、取消編輯。Apply 才標記舊分析 stale，重新分析產生新 session 與 parent 關聯。
A/C 也可更新選人參考與人工 keyframe，但模型輸入維持全畫面；人工確認只重設人物狀態，不因框變動重啟全畫面模型。
同源批次會保留同一組參考 keyframes；B 使用其人工種子與既有 Adaptive 流程。
建議先只用片頭人工框作基準，再將人工輔助校正另立比較，避免混淆完全自動與人工輔助成效。

失去人物或無法分辨時保留 N/A，依需要在該時間人工重新框選並分析。參考框不是全程限制區，
A/C 後續追蹤使用來源影像座標的連續性；即使走出初始參考框也不會因此裁掉人體。
相似人物平滑交錯仍可能漏判，本版沒有已驗證的 re-identification。
[v0.4.0 操作與限制](docs/ROI_TRACKING.md) 保留供既有流程查核。

## 常見問題

| 狀況 | 處理方式 |
| --- | --- |
| A 模型選到另一人 | 若唯一候選不在參考框或不連續會拒絕；可試 C，不能假設 A 一定找得到目標 |
| C 一直 invalid | 可能無目標候選、多人皆合理、遮蔽或 QC 失敗；看原始影格與原因，必要時縮小軀幹參考框並重分析 |
| 多人模式不支援 | 某些模型／環境可能無法完成 2／3 poses；比較表保留錯誤，A/B 仍可檢查 |
| B 裁切不穩定 | 保留結果與逐樣本 ROI，與 A/C 對照；不要先假設是模型或裁切造成 |
| stale／舊比較 | 輸入／設定已改時先重分析；檢查舊比較會還原該次選人設定，結果以存檔的模型 hash 為準 |
| seek-position-estimate | 影格可讀但沒有精確呈現回呼；只是尋時位置估計，不能冒稱精確 PTS |
| 影片等待失敗 | 切回分頁並保存診斷；等待逾時與真正解碼錯誤分開，不能一律歸因不支援編碼 |
| 模型／WASM 錯誤 | 使用官方 .task、npm ci 產生同版本本站 WASM，不改用不明鏡像 |

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

後續依功能完成推進：先以 A/B/C 同片人工比較決定架構，再做 V1 即時攝影機、V2 物治確認
的上下台階／抬腿動作、V3 量測驗證、V4 展示整合。版本不依固定日期決定。
