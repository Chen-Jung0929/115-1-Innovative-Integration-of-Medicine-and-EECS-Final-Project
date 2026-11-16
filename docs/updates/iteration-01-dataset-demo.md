# Iteration 01 — Dataset Demo V0 候選實作

日期：2026-11-16（Asia/Taipei） · 分支：feature/dataset-demo-v0。

## 已完成功能

- MP4 選取、檔名／長度／尺寸、瀏覽器解碼檢查；損壞檔、非 MP4、超過 500 MB 或 10 分鐘會拒絕。
- 播放／暫停與分析分離。獨立 decoder 依 5 Hz 目標網格 seek，等待 seeked 與 presented-frame callback。
  保存 requested 與 source media timestamp；去除重複／逆序影格，不宣稱全影格分析。
- MediaPipe PoseLandmarker VIDEO、CPU、單人介接；每次建立新實例，finally 釋放模型與 decoder。
- 本機 .task 選檔優先，否則 public/models/pose_landmarker_lite.task；Google 官方下載須 opt-in。
  沒有模型時分析可恢復失敗，頁面與影片播放仍可操作。沒有使用不明模型或鏡像。
- WASM 由精確鎖定的 npm 套件 postinstall 複製到 public/mediapipe/wasm，不使用外部 CDN。
- 純 TypeScript 髖–膝–踝內角、左右 mapping、normalized xy 長寬比校正與 QC；
  provisional flexion proxy=180°−內角，獨立 definition ID；無效角度 null／N/A。
- 同比例骨架疊圖、左右側切換、每側有效取樣率、保留缺失斷點的 Recharts 曲線與取樣滑桿。
  未分析影格不顯示鄰近姿態。暫停／離開 viewport 的 rVFC 節流以既知 seek 目標對應處理。
- CSV 與研究 JSON 本機下載：包含來源時間、sample_index、角度、validity／reason、版本及模型 hash。
  CSV 文字轉義與公式前綴防護。研究 JSON 僅保留 normalized xy、visibility、可用 presence，沒有 3D z。
- 更新 README、AGENTS、架構／規格／資料集／驗證／決策文件，新增模型操作與分發界線說明。

## 實際驗證

環境：Node v24.22.1、npm 11.9.0、Chromium 156.0.8078.79，Linux，CPU。

| 檢查 | 結果與證據界線 |
| --- | --- |
| npm ci --cache /workspace/.cache/npm | 通過，139 個套件；postinstall 成功複製本機 WASM |
| npm run typecheck | 通過，strict TypeScript |
| npm test | 6 個檔案、39 個測試通過；幾何、QC、角度邊界、長寬比、左右 mapping、缺失值、CSV、模型來源順序與 opt-in、取樣／有效率、解碼等待／取消／逾時 |
| npm run build | 通過；有主 bundle >500 kB 的大小警告，未掩蓋；不是功能測試替代品 |
| Chromium／Playwright | 5 passed、1 skipped；下表說明，不把 skipped 當通過 |
| Production preview | 通過：HTML／JS／CSS HTTP 200、WASM 內容 hash 與 npm 套件一致；390 px 行動版 Chromium 無橫向溢出／頁面錯誤。不等同正式部署或人體推論 |
| 真實人體影片＋有效模型 | 未執行；需使用者提供官方模型與核准影片；已保留可重跑的條件式 E2E |
| 指定 Mendeley V1 Squat | 未執行；landing page CONNECT 403，尚未下載，授權未核實 |
| Python／pytest | 未執行；本次未實作統計分析 |
| GitHub Actions | 已保留既有 check workflow；本次未確認遠端執行結果 |

瀏覽器案例：

1. 真正解碼 FFmpeg 產生的無人體 1 秒藍色 MP4，seek 得到 0/200/400/600/800 ms；損壞 MP4 有錯誤且不啟用分析。
2. 明確允許官方下載後，以攔截 403 測試錯誤與禁止匯出不完整資料。
3. 模擬姿態 adapter＋真實 MP4 decoder：5 取樣、1 缺失、80% 有效率、實際 canvas 非空骨架、SVG 曲線、CSV、左右切換、重新分析樣本一致且新 session、未分析影格 N/A；沒有非本機資料請求。
4. **真實 MediaPipe／核准人體 MP4：跳過**，缺 POSE_MODEL_PATH／POSE_VIDEO_PATH。
5. 真正 MediaPipe adapter 從本站成功取得 WASM（HTTP 200），無效 task 模型可恢復失敗。
6. 本機模型缺失、未 opt-in 時不發出 Google 請求，影片選取與分析控制仍可操作。

案例 1、3 的影片都是無人體合成素材；案例 3 的姿態也是模擬，不能稱為人體或資料集實測。
截圖人工檢查確認版面、曲線與疊圖布局；截圖未入 Git。沒有量測效度／臨床準確度結果。

## 開發中修正與已知限制

初版瀏覽器測試發現暫停影片捲出 viewport 時 rVFC 節流，滑桿跳轉後仍為 N/A；
已修正並以相同案例重新驗證通過。幾何算術溢位與 confidence 超範圍亦判無效。

- V0 仍為候選版本，尚不符合「實際人體姿態估計可操作且經驗證」的最終完成判準。
- 需新版支援 rVFC 的瀏覽器。固定的是目標網格；不同平台／編碼不保證相同影格或數值。
- CPU 推論在主執行緒，可能短暫卡頓；未完成裝置效能基準、臨床 ROM、三維分析或即時攝影機。
- 模型授權／再分發方案待確認，.task 不提交。模型若放 public，build 會複製進 dist，發布前須另查授權。
- 純 TypeScript 型別不代替全部 schema runtime 驗證；本次核心已做有限數值、confidence 與幾何 QC。
- 匯出含檔名與人體特徵；應儲存在受限空間，不能提交 Public repo。

## 遠端交付與環境

本次 GitHub API read 測試 `gh api repos/Chen-Jung0929/115-1-Innovative-Integration-of-Medicine-and-EECS-Final-Project --jq .full_name`
回傳 Forbidden；GH CLI 的 auth status 亦失敗，不等同 HTTPS Git push 沒有權限。
提交／push／PR 的最終結果於交付訊息回報，不捏造 PR。

環境設定草稿已新增所需 storage.googleapis.com、data.mendeley.com、api.github.com
並保留套件網域 preset，且更新 V0 啟動教學；保存不代表已套用／發布。
模型由使用者從官方取得，本地載入仍可開發，不以網路限制作為重建或停止開發理由。

## 下一個 Iteration

1. 使用者取得官方 Lite 模型後，依 README 放置或選取，對核准的側面 Squat MP4 實際分析。
2. 記錄影片來源／授權、hash、尺寸、模型 hash、有效率與問題案例；有條件時使用指定 Mendeley V1。
3. 執行 `POSE_MODEL_PATH=... POSE_VIDEO_PATH=... npm run test:browser` 補上真實推論驗收，再決定是否標記 V0 完成。
4. 物治端確認幾何 proxy 與 clinical definitions 的界線；V1 攝影機與 V3 統計驗證另立任務。
