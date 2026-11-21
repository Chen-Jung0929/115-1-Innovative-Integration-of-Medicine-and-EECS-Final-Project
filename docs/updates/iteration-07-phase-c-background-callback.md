# Iteration 07 — Phase C：Complete callback-suppression regression

2026-11-17。最後回歸新增整個頁面的 requestVideoFrameCallback 都不回呼的情境。
發現 choose() 讀取成功後原本只清 loading，仍可能保留 seeking=true，使框選按鈕無法進入 A1 的可恢復 seek helper。
修正為讀取流程完成時清 UI waiting；真正的尋時仍由 seekFrame 檢查 readyState／seeking，不假裝精確 PTS。

驗收：94 個單元、typecheck、build 通過；Chromium 17 passed／1 skipped。
新 browser 測試在真實合成 MP4 解碼時全域壓掉 rVFC，仍可上傳、確認ROI、分析5Hz，
研究JSON逐筆標記 seek-position-estimate。原本16個browser回歸仍通過。
這不是 subject_002_squat_good_side.mp4 的驗收；真實原片與有效模型仍未在本環境提供。
