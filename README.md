# 即時關節動作分析系統

國立臺灣大學 115-1 醫學電資創意整合專題 · Real-Time Joint Motion Analysis System

這是一套讓團隊以瀏覽器觀察人體動作、檢查膝部影像平面角度的學術概念驗證（PoC）。
**不提供醫療診斷或治療建議，模型估計值不是經驗證的臨床角度。**

## 目前成果與驗證狀態

已實作 MP4 上傳、5 Hz 目標離線取樣、MediaPipe 膝角度、骨架、時間曲線、CSV／JSON。
本次 v0.4.0 加入可移動／縮放 ROI、手動時間 keyframes、保守自動跟隨、安全恢復與解碼診斷。

團隊已用官方 Lite 模型初步分析 Mendeley V1 的 `subject_002_squat_good_side.mp4`，
並回報多人錯選、固定框失去目標及新版尋時逾時。本次修正已用程式／合成資料驗證，
**同一真實 Squat 影片尚未在本環境重跑**，不能宣稱已完全解決錯人或原片逾時。

94 個單元測試通過；Chromium 瀏覽器 16 通過、1 個真實人體測試因本環境無資產而跳過。
安裝、typecheck、build 通過；build 有 bundle 大小警告。
各階段紀錄見 [解碼](docs/updates/iteration-03-phase-a1-decoder.md)、
[ROI 編輯](docs/updates/iteration-04-phase-a2-editable-roi.md)、
[keyframes](docs/updates/iteration-05-phase-a3-keyframes.md)、
[跟隨與恢復](docs/updates/iteration-06-phase-b-tracking.md)。

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

1. 選擇 MP4 並準備官方模型，確認影片檔名、秒數與尺寸。建議先用短、全身可見的側面影片。
2. 按「框選受測者」，首次會暫停於片頭。在影片拖曳框出單一受測者，保留肩、髖、膝、踝與活動空間。
   避免把其他人一起框入；高 visibility 不能證明人物正確。
3. 選擇 ROI 方法，按「確認 ROI（Apply）」後開始分析。等待進度完成，可取消，不保存半成品。
4. 播放／暫停影片或用「檢查已分析取樣」滑桿檢查；播放本身不會重新推論。
   未分析影格顯示 N/A，無效取樣在曲線保留斷點。左右是人體解剖側，畫面不鏡像。
5. 檢查可能錯誤的角度：查看追蹤狀態與四維 QC；需要時勾選紅色拒絕骨架作人工檢查。
   在人工標註區選 Correct target／Wrong target／Mixed landmarks／Uncertain，填匿名代碼。
   人工判錯／混合／不確定會使最終角度無效，自動決策與 raw 結果仍保留。
6. 下載 CSV／含 landmarks、ROI、診斷及標註的研究 JSON。所有資料在瀏覽器處理，不上傳影片。
   輸出含人體特徵與來源檔名，只存受限空間，不提交 Public GitHub。

### 微調已確認的 ROI

暫停影片後按「重新選擇受測者／微調 ROI」。拖曳矩形內部移動，四角／四邊調整大小，
也可輸入 x、y、width、height（來源影片像素）。框不能超出來源畫面，寬高至少 32 px。

- Restore Previous：回到目前時間已套用的框。
- Reset：回到全畫面；仍需確認只量到指定人物。
- 重新畫框：捨棄草稿形狀，重新拖出矩形。
- 取消編輯：回到既有設定與分析。

**Apply 前只改草稿。** Apply 後原分析標為 stale，隱藏舊曲線與一般匯出，提示重新分析。
可另存「舊分析 JSON（原設定）」。重分析產生新 session 與設定版本，先前 session 保留下載入口；
不會在舊 JSON 上改 ROI 或把不同版本角度串接。存檔與標註只在記憶體，離開頁面前須下載，尚無匯入續標。

### 選擇 Fixed、Keyframes 或 Adaptive

| 方法 | 如何操作 | 限制 |
| --- | --- | --- |
| Fixed ROI | 選 Fixed，確認一個全片共用的框 | 不會跟人走，攝影機／人物位移後可能失效 |
| Manual Keyframes | 先以「前往影片時間」跳到如 10 秒，開啟編輯，選 Keyframes、調框並 Apply；其他時間重複此流程 | 相鄰框以原圖像素線性插值，最後一框保持；不是自動認人，快速移動仍可能超出插值框 |
| Adaptive ROI | 選 Adaptive，人工指定初始人與框後 Apply，再分析 | 僅根據先前接受的姿態作有界平滑更新；可能追錯相似人物，不能保證分開重疊的人 |

只有 ROI 插值；每個角度仍由實際模型觀測計算，不插值補角度。
在 Keyframes 或 Adaptive 模式於指定時間 Apply，代表人工重新確認該時間的目標，
會記錄新的 keyframe、設定 revision 與 parent session。為保持可重現，本版重分析全片，
在第一個跨過人工 keyframe 的取樣重建模型與追蹤器，沒有在舊 session 局部覆寫。
Adaptive 在人工 keyframes 之間自動跟隨，不預先插值到未來人工框。

### 失去追蹤時怎麼做

- TRACKING：自動一致性檢查通過，**仍未證明身分正確**。
- LOST：沒有可靠目標／目標出框，角度無效。
- UNCERTAIN：點位／身分不確定或恢復待確認，角度無效。
- MANUAL_REVIEW_REQUIRED：多人歧義、大幅跳換、長時間遺失或搜尋不可用；不自動接回人物。

短暫遺失後，只有在有限時間內連續兩次通過較嚴格檢查才會恢復；失敗期間保留 N/A。
若持續無效，跳到失效時間，人工確認正確人物，新增／調整 keyframe 後重新分析。
Adaptive 會約每秒及短暫失效時，以獨立模型作最多兩候選的全畫面搜尋；
搜尋只提供建議與歧義證據，**不直接把另一個人替換成有效目標**。
可按「檢查搜尋建議 ROI」，看清原始影格後再 Apply；不能只因模型提出候選就認定身分正確。
若人已完全離開上一框且無法確認，這版會要求人工修正，而不是承諾自動找回。

內角為髖–膝–踝在膝點形成的影像平面 0–180° 幾何角；暫定 flexion proxy = 180° − 內角，
不是已確認的臨床屈曲角。人工指標的定義與分母見 [人物標註規約](docs/SUBJECT_TRACKING.md)。

## 常見問題

| 狀況 | 解決方式 |
| --- | --- |
| 影片影格等待失敗 | 切回分頁、暫停後重試並保存診斷；同時間 0 秒不再強制等待新事件。等待失敗不等於編碼不支援 |
| 時間欄是 seek-position-estimate | 影格可讀，但瀏覽器未送精確呈現回呼；保留為時間估計。研究比對時不能冒充精確影格 PTS |
| stale／沒有曲線 | ROI 設定已改，請重新分析；需要原結果可下載舊 JSON |
| Fixed 框跟不上人 | 改用手動 Keyframes 或 Adaptive；目標身份不明時仍先人工檢查 |
| 長時間 N/A／MANUAL_REVIEW_REQUIRED | 不代表 0°；在失效時間新增人工校正 keyframe，再分析。混合與相似人物仍可能需要重新拍攝較單純畫面 |
| 搜尋模型失敗 | 本次不將搜尋當可靠身份證據；可用 Manual Keyframes。錯誤保留於研究 JSON，不反覆重建失敗搜尋模型 |
| 模型／WASM 載入錯誤 | 使用 Google 官方 .task，重新 npm ci 產生同版本本站 WASM；不用非官方鏡像 |
| MP4 解碼失敗 | 確認檔案未損壞，使用新版 Chrome／Edge；真正的 MediaError 與等待逾時分開記錄 |
| 分析慢／檔案太長 | 本版限制 500 MB、10 分鐘；CPU 主執行緒與搜尋有成本，先裁短影片，無即時效能承諾 |

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
