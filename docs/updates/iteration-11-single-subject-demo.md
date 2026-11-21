# Iteration 11 — 單人 Dataset Demo 收斂

2026-11-17 · v0.6.0 · feature/dataset-demo-v06 · 未合併main。

## 已完成功能

Full Frame + Single Pose為UI及analyze共用預設。上傳後自動建立全圖參考，直接開始分析，不要求先框ROI。
模型輸入維持原始尺寸完整影格，仍為5Hz離線目標取樣、source timestamps、骨架、左右膝角、曲線、CSV／研究JSON。
ROI／Adaptive／Multi-Pose／A/B/C保留於預設收合的實驗區，研究診斷與人工標註另收合，未擴充追蹤演算法。
實驗模式仍在主要區明示；回主模式會stale舊分析、可下載原JSON；收合編輯取消草稿、不修改舊結果。

沿用v0.5.1的逐側QC／兩次可靠恢復，保留confidence、geometry、missing-data與identity安全規則。
另修正初始化首筆無可靠torso直接人工鎖定的路徑：在尚無baseline時等待可靠觀測，不以「沒偵測到」推定換人。
等候／確認取樣均invalid，真正歧義、torso跳換、已追蹤後長期遺失仍要求人工。

schema9記錄controlled-single-default來源，不冒充人工標註，main manualKeyframeId=null。
全圖previousState改記實際上一筆狀態。raw／auto／human與模型／影片hash、版本、定義保留；replay仍可讀7/8並新增9。
沒有新增相機、ROM、其他動作、後端或多人演算法研究。

## 4/155診斷與研究界線

團隊回報v0.5三法各4/155及0.8秒腿段異常後151筆鎖定；原始左膝A/B155、C149可計算。
本環境尚無該JSON／影片／有效模型，因此沒有獨立重播真人或修正後真人結果。
程式與合成155筆回歸可確認舊策略hard latch及新策略側別恢復，不能把較高可用率稱為accuracy改善。
「選單人主流程」為使用者範圍決策，不是三法人體準確度勝出結論。

## 實際驗證

- `npm ci --cache /workspace/.cache/npm`：139套件，local WASM postinstall成功；沒有增加依賴。
- Typecheck通過；134 unit tests／22檔通過；production build通過，仍有>500kB bundle警告。
- Chromium：31 passed／2 skipped（缺少核准真實影片／有效模型，實際人體單法與A/B/C案例明確跳過）。
- 原27項browser案例保留，改為明確展開實驗／研究區；舊「必先框選」預期改為主流程可開始、草稿編輯時禁分析。
- 新6項browser：主要流程正常、單側低信心、單側腿段跳變、首筆缺失、短暫整體缺失、實驗回主模式／取消草稿與舊結果不變。
- Main單側測試：有效序列true/false/false/true/true，另一側不受影響；原始候選保留、無效角null、恢復不回填。
- 初始無姿態：false/false/true/true/true；短暫整體缺失：true/false/false/false/true；不永久人工鎖定。
- 新unit：不同長寬比全圖設定、非人工來源、獨立設定、無效尺寸、155筆單側時間異常、初始化缺失／失信、缺失恢復及真歧義鎖定。
- 原角度、解碼、長寬比、左右映射、ROI編輯／keyframes、多人歧義、匯出、人工否決及replay測試均保留。
- 已檢視browser的主流程桌面截圖：實驗與研究資訊收合、骨架／角度／曲線／匯出可操作；圖中為雙色無人體影片與mock landmarks。

## 待驗收與下一步

**真實單人、固定鏡頭、完整人體入鏡Squat穩定性待驗收。** 尚未提供人體accuracy、MAE、真人修正後有效率或FPS結論。
subject_002曾有多人背景，不能直接當受控單人條件已滿足。依SINGLE_SUBJECT_DEMO方法準備核准資產、保存hash與逐樣本人工核對。
短暫完全缺失仍有650ms的原身份恢復窗口，長期遺失或跳換仍可能鎖定，不以無條件接受提高可用率。
先完成這項真實驗收，再另案規劃共用輸入介面的V1；不恢復複雜ROI／多人追蹤擴充。
