# Iteration 14 — V1 即時鏡頭初版

2026-11-17 · app 0.6.1 · feature/live-camera（從 feature/controlled-single-recovery 開出）· 未合併 main。
編號跳過 13：iteration-13 保留給並行中的 feature/squat-angles。

## 完成內容

- 上方新增「上傳影片／即時鏡頭」切換；原上傳流程與畫面不變（切走時只隱藏、不卸載）。
- `src/input/camera.ts`：getUserMedia（只要影像、facingMode 用 ideal）、白話錯誤訊息、https／localhost 檢查、停止時釋放所有 track。
- `src/motion/measure.ts`：把膝角＋gate 與 trackingPolicy 快照抽成共用函式，上傳影片 `analyze.ts` 與即時鏡頭都呼叫它（行為不變）。
- `src/motion/live.ts`：即時 analyzer，沿用 Full Frame + Single Pose 的 `createFullFrameIdentity`（controlled-single-default）、關節 QC 與膝角；
  目標 10 Hz、時戳用 rVFC mediaTime、重複／倒退時戳略過；結束的一段包成 `inputKind: 'camera'` 的 Session，沿用既有 CSV／JSON 匯出。
- `src/app/LivePanel.tsx`：開啟／停止／結束這一段、前後鏡頭、顯示鏡像、即時骨架與左右膝角、最近 15 秒曲線、白話狀態列、最近 10 段曲線與匯出。
- 免觸控分段（使用者回饋：自己拍時手機放很遠，不可能走回去按鈕）：`createReadyGate` 要求同一人全身入鏡、靜止 1.5 秒才自動開始一段。
- `src/motion/livePerformance.ts`＋`src/domain/performance.ts`：依 V1 完成判準記錄掉幀、FPS、推論時間與端到端延遲（p50/p95），畫面顯示一行、研究 JSON 存 `livePerformance`；每段時間從 0 起算（ARCHITECTURE「camera 起點歸零」）。
- 角度曲線 X 軸刻度改為一位小數（即時時戳非 0.2 秒整數倍時原本顯示長小數）。

## 安全與資料規則

- 推論用未鏡像影格（inferenceMirrored=false）；displayMirrored 另存。左右膝仍為解剖側。
- 人工鎖定（多人、遺失超過既有窗口等）不會在該段內解除：該段立即結束並原樣保存；之後只有通過 ready 檢查才建立新的 analyzer 開新段。等待期間不量測、不記錄。
- 分頁隱藏即關閉鏡頭並結束該段；畫面尺寸改變（手機轉向）即結束該段；單段上限 10 分鐘（6000 筆）。
- 不錄影、不上傳；WASM 與模型仍從本站載入。沒有新增套件。

## 檢查結果（本次實際執行）

- `npm run typecheck`：通過。
- `npm test`：27 檔、157 tests 通過（原 139，新增 camera 3、live 8、livePerformance 3、LivePanel 3、App 1）。
- `npm run build`：通過（保留原有 bundle 大小警告）。
- `npx playwright test`（未放本機模型）：32 passed、2 skipped（actual-model 測試）。新增 `e2e/live.spec.ts` 使用 Chromium
  內建假鏡頭（合成測試圖，無人臉）＋合成 pose adapter，只驗證接線：免觸控自動開始、出現第二人時該段結束保存、恢復一人後自動開新段、選段與匯出 CSV、切回上傳影片。
  注意：若 `public/models/pose_landmarker_lite.task` 存在，既有兩個「缺模型」e2e 會失敗，屬既有測試前提，與本次無關。
- 本機額外以官方 Lite 模型＋公開 OpenCap 範例深蹲影片作為假鏡頭來源跑一次（影片與截圖不入 repo）：
  10.1 秒得 98 筆（約 9.7 Hz），骨架與左右膝曲線正常顯示；改為免觸控後再跑一次，片頭站立約 1.5 秒後自動開始量測。
  加入效能紀錄後（雲端 headless Chromium、CPU、640×720 假鏡頭）：處理 9.5 次／秒、鏡頭約 25 fps、端到端延遲 p50 44 ms／p95 74 ms（captureTime 起算）、
  推論 p50 37 ms、掉幀 30／169（推論在主執行緒造成），第一筆時間 0。此為雲端模擬數字，不代表組員筆電或手機效能。這只是軟體可運作的證據，不是角度準確度驗證。

## 限制

- 手機需 https 網址才能開鏡頭；區網 http 會被瀏覽器擋。尚未部署 https。
- 實際取樣率依裝置 CPU；推論在主執行緒，會造成掉幀，較慢的手機可能低於 10 Hz。尚未在真實筆電／手機量測。
- `livePerformance` 為選用新欄位，未升 schemaVersion（避免與並行分支衝突）；是否升版待組員決定。
- 未在真人現場做驗收；角度仍為 2D 影像平面內角，非臨床角度。

## 下一步

- 真實筆電鏡頭與手機（https）實測，記錄實際 Hz 與鎖定頻率。
- feature/squat-angles 合併後，即時畫面加入髖角、上身前傾、膝蓋內夾。
- 視需要把推論移到 Web Worker。
