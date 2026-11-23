# Iteration 03 — Phase A1：Decoder reliability

2026-11-17。根因風險：舊 seekFrame 強制等待 seeked + rVFC，no-op seek 與背景／暫停節流不保證重新送出兩個事件；beginSelection 無條件設 seeking=true 也可能卡住。

已修正：快取已呈現影格、no-op seek 不強制改 currentTime、可繪製 settled frame 的明確降級；UI seek 用可取消 promise 並 finally 清除等待。沒有延長 15 秒 deadline。
每個 sample 保存 decode.timeBasis/method/warnings，CSV 同步附欄。估計時間只供合理取樣，不冒稱精確 PTS或全影格分析；非取樣播放不以估計時戳對接骨架。
錯誤保存 requested/current time、readyState、seeking、networkState、事件狀態、分頁可見性及 MediaError code，不把所有等待失敗當不支援 H.264。

驗收：typecheck、65 個單元測試、build 通過（仍有 bundle 大小警告）；Chromium 11 passed／1 skipped。
新增同時間 0 秒、快取、沒有 seeked、沒有 rVFC 的 mock 測試；真正 MP4 decoder 壓掉 rVFC後反覆 0/0/.2/.2/.4/.2 秒可完成，並正確標記估計時間。原有 ROI 重選與重分析回歸通過。
指定 subject_002_squat_good_side.mp4 不在本環境，真實驗收待團隊重跑，不能宣稱原片逾時已完全解決。
下一步：在本階段驗收通過後實作可編輯 ROI 與 stale session。
