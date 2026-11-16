# Iteration 05 — Phase A3：Manual ROI keyframes

2026-11-17。A2 驗收通過後新增影片時間跳轉、Manual Keyframes 模式與人工重新確認。
Keyframes 包含 0 秒起始框；以 media-position ms 儲存，來源像素 x/y/w/h 線性插值，最後一框保持。
相同時間 Apply 取代該設定版本中的 keyframe，不修改舊 session。保留 selection revision／parentSelectionId 與 parentSessionId。
每個 sample 記錄實際 ROI、更新來源／原因、manual keyframe ID；CSV／JSON 同步，schema 5。
跨過新人工校正點的第一個 5 Hz 取樣重建模型與 tracker，可從既有鎖定狀態恢復；不是自動認人。
目前保守重分析全片，不局部拼接不同版本的角度或插值後的角度。

驗收：typecheck、78 個單元測試、build 通過；Chromium 13 passed／1 skipped。
新增 keyframe 邊界／排序／線性插值／不修改來源測試；browser 在 .4 秒加框，實際 ROI 寬度為320/280/240/240/240，.2 秒遺失無效、.4 秒人工重設後有效，新分析指向舊 parent session且原設定不變。
瀏覽器測試曾發現 select 的 accessible label 含 option 文字，已補精確 aria-label 並重跑整套通過。
指定真實 Squat 影片仍待團隊驗收；本次是合成程式回歸證據，不是臨床／身份效度。
下一階段才加入自動跟隨與有限的安全恢復狀態機。
