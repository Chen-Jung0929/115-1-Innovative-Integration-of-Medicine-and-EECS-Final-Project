# Iteration 06 — Phase B：Adaptive tracking & safe recovery

2026-11-17。Phase A1／A2／A3 依序驗收並提交後，才加入 Controller、自動跟隨與恢復。

實作：前一 accepted torso 驅動有界 ROI（平滑 .35，中心 8%、尺寸 5%），保留 margin 與逐樣本 ROI。
顯式 TRACKING／UNCERTAIN／LOST／MANUAL_REVIEW_REQUIRED，短期遺失最多 650 ms，需兩次更嚴格一致性確認；
大幅跳換／不合理幾何／多人歧義或長期遺失仍要求人工。人工 keyframe 會明確重建模型與 tracker。
Adaptive 以獨立最多 2-pose VIDEO engine 約每秒全畫面搜尋，短暫失效可加密；永久人工狀態維持每秒預算。
唯一候選僅建議 ROI、不能自動改成有效受測者；失敗記錄並拒絕身份放行，可用手動框繼續。
原始 primary／search landmarks、實際 ROI、狀態、更新方法、QC、raw／auto／manual angles、模型／政策版本均保存。

驗收：94 個單元測試、typecheck、build 通過；Chromium 16 passed／1 skipped。
含緩慢人物位移／小幅相機移動、中心／尺度限制、短期出框、兩次恢復、長期遺失拒絕、
兩個近似人物搜尋歧義、搜尋錯誤、人工校正、逐 sample CSV ROI／state 及原有回歸。
搜尋 factory options 已以 mock 驗證 1/2 poses、獨立 VIDEO 實例與候選保留；真實 Lite model 的多人性能未量測。
指定真實 Squat 測試仍待驗收；不宣稱已消除所有重疊／換人、也不宣稱臨床效度或 FPS 改善。

本階段政策與所有限制見 docs/ROI_TRACKING.md，README 提供一般組員操作步驟。

補充顯示回歸：非分析影格保留上一個實際 crop，不插角度；再次編輯 Adaptive 從當時實際框開始，不回到初始框。
