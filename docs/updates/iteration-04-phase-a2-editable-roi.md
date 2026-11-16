# Iteration 04 — Phase A2：Editable ROI

2026-11-17。A1 驗收完成後才進入本階段。
支援矩形內部移動、八個縮放把手、來源像素輸入、重新畫框、Restore Previous、Reset 與取消。
草稿限制在來源尺寸、最小 32 px；編輯時影片暫停，禁止播放。
Apply 前不修改 session／已套用矩形。Apply 改動後只標記 stale 並隱藏舊曲線／一般匯出，原 JSON 保留可下載。
重新分析產生新 session，完成後保留前版存檔；不在舊物件上改 ROI 或人為標註。

驗收：75 個單元測試、typecheck、build 通過；Chromium 12 passed／1 skipped。
含八個把手的邊界／最小尺寸、縮放 portrait 座標轉換、拖曳移動／右下縮放、取消／還原、Apply stale，下載舊 session 與修改前逐欄相等。
真實 Squat 影片未在此環境，效果待同片人工驗收。下一階段才加入 keyframes。
