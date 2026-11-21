# Iteration 10 — 追蹤 QC 診斷與恢復

2026-11-17 · v0.5.1 · feature/tracking-qc-recovery · 未合併 main。

## 問題與已完成修正

團隊已回報真實 Mendeley A/B/C 各4/155 auto valid、0.8秒 temporal limb scale change 後151筆人工鎖定；
原始左膝 A/B 155、C 149 可計算。未在本環境取得該研究 JSON，未重播或獨立驗證這組真人數字。
程式檢查確認 A/C 直接把腿段變動設 manual，B把它與torso混成hard failure；鎖定後 accepted=false 且baseline無法更新。

分離 torso identity、各側 observation、各側 temporal state。沒有調低原confidence／幾何／torso門檻，
多人歧義／torso跳換／長期遺失仍要求人工。局部異常只暫停該側角度，可信torso可維持人物歷史。
各側需2次連續可靠且穩定觀測，gap≤300ms、尺度相對前筆及窗口首筆≤1.25才恢復；等待無效、不補值。
B 不使用不可信關節更新crop；未擴充ROI演算法、UI、相機或動作。

新增 CLI `npm run qc:replay -- --input ... --output outputs/new-folder`。
讀原始研究session／比較bundle，對照 frozen-v0.5.0、separated-2／3，保存獨立派生session／input hash／parent／原model與raw資料。
報原始pose、subject accepted、joint validity、manual samples、失敗區間與新增放行稽核清單，特列0.6–1.4秒診斷。
換選候選不沿用原人工標籤；人工Wrong/Mixed/Uncertain仍否決最終角度，auto原決策另存。

## 實際檢查

- `npm ci --cache /workspace/.cache/npm`：139套件，本站WASM postinstall成功；未新增依賴。
- Typecheck、128 unit tests（20檔）、production build通過；build保留>500kB bundle警告。
- Chromium完整browser回歸25 passed／2 skipped；沒有真實資產，兩個actual人體測試明確跳過。
- 回歸涵蓋MP4、5Hz、解碼、A/C完整輸入、B裁切／keyframes、角度／曲線、CSV／JSON、人工否決及多人歧義。
- 新測試涵蓋局部與單側失敗、兩／三次恢復、低信心、退化、暫態／持續失敗、窗口尺度漂移、候選重選、人工鎖定及重播不覆寫。
- 舊測試中「局部異常＝identity failure」斷言改成驗證side gate；凍結策略仍重現原hard-lock行為。
  FVR瀏覽器案例改用正常姿態fixture，避免把新增恢復等待的自動無效樣本誤當false-valid分母。
- 實際以node啟動CLI，讀3組各155筆的**合成研究JSON**、輸出9個派生session，SHA核對原輸入未改。
  另測相同輸出路徑拒絕EEXIST、缺候選／無效時間拒絕、輸出限定ignored outputs。
- 合成0.8秒跳變：舊／frozen4 valid、151 manual；新2次153 valid／3次152 valid；新增149／148筆全未人工判讀。
  這是特定程式fixture，不是修正後Mendeley數據。初始CLI smoke曾有不必要Vite dep-scan關閉警告，已停用CLI dependency discovery後重跑。

## 限制與下一步

沒有真實修正後Accuracy或人物正確率結論。合理且穩定的錯人／混合骨架仍可能放行，需人工稽核新接受樣本。
Replay固定當時候選／crop，不重跑MediaPipe或ROI feedback；不能等同重新分析原片，也不能取代人工角度參考。
先用團隊原始JSON檢查frozen parity、0.6–1.4秒與新增放行，分開標Wrong/Mixed、Uncertain、Correct、未標註。
再以原片／模型hash進行新版人體驗收，判斷恢復是否有效且有足夠安全性；本次不推進V1。
