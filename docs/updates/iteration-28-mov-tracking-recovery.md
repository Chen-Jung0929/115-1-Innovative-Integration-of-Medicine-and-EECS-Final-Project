# 第 28 輪：支援 MOV 等影片格式，修正「追蹤跳掉後整段找不到」

醫學組回饋兩件事：「要不要允許 HEIC 或 MOV」「影片很容易畫面跳脫然後全部找不到」。決策見 ADR-099。

## 改動

| 模組 | 內容 |
|---|---|
| `src/input/video.ts` | `VIDEO_ACCEPT`：MP4、M4V、MOV、WebM。照片（HEIC／JPG／PNG）直接說「這是照片，不是影片」。`DECODE_HELP`：瀏覽器播不了畫面時的 iPhone 設定提示（解碼失敗、或影片寬度 0 都用）。`resolveDuration`：MediaRecorder 檔案片長未知時先算出片長。 |
| `src/app/App.tsx` | 選檔說明改為「影片檔：MP4、MOV（iPhone）、M4V、WebM」；播放失敗也用同一提示。 |
| `src/app/LivePanel.tsx` | 錄成 WebM 的整段錄影也能「用完整分析畫面看整段」，檔名與格式一致。 |
| `src/tracking/identity.ts` | smooth-single-step-v1、planted-feet-continuity-v3（側面遠側腳不當瞬移證據）、restart-after-steady-single-person-v1（鎖定後平順追到同一個人 1 秒就重新開始一段，路人左右走過不算）。 |
| `src/app/plain.ts` | 鎖定橫幅：「畫面上只剩一個人、連續看清楚約 1 秒（或站直不動）後會自動重新開始一段」。 |
| `src/motion/measure.ts` | 匯出的 trackingPolicy 加上 `steady_*` 門檻。 |
| 測試 | `video.test.ts`（格式、照片、片長未知）、`plantedFeet.test.ts`（ADR-099 新情境；原「移動中不重新開始」改成分開檢查：搖晃 60 px 不會觸發「站直」重新開始、跳動 120 px 完全不重新開始）、e2e／部署關卡改用新的選檔標籤「影片檔：」。 |

## 重現與結果

多視角健身資料集 squat（subject 001–008，good／bad，CC BY、有臉，不放進 repo；原檔是 HEVC，雲端 Chromium 不能解，轉成 H.264 後跑一次 MediaPipe Lite，存下每格候選人，再用新舊身分規則重播）：

| | main | 本輪 |
|---|---|---|
| 18 支（16 側面、2 正面）可用取樣 | 75.5% | 98.9% |
| subject_001 good side | 2%（0.8 秒鎖定後再也沒回來） | 87%（2 次鎖定，各約 1–2 秒回來） |
| subject_003 bad side／good side | 4%／1% | 99%／95% |
| subject_007 bad side | 70% | 100% |
| 正面 2 支 | 100% | 100% |

格式：瀏覽器實測 MOV、M4V、WebM、即時錄影產生的 WebM（片長 Infinity）都能讀到長度與尺寸並完成分析；HEVC MOV 在不支援的瀏覽器顯示 iPhone 設定提示。

## 檢查

- `npm run typecheck` 通過；`npm test` 315 個測試通過；`npm run build` 通過。
- `npm run test:browser` 37 通過、2 個既有條件略過；`npm run test:smoke` 4 通過。
- 獨立 agent 審核 3 輪（第 1 輪抓到：腳可見度門檻讓換人被默默接上、路人走過會重新開始、測試被放寬、型別檢查失敗；第 2 輪抓到：從兩腳清楚切到一腳暗的人仍會漏掉；都已修正並加測試；第 3 輪只剩文件用語，已修正）。

## 限制

- 能不能讀 MOV／HEVC 取決於使用者的瀏覽器與電腦，網頁無法自己轉檔。
- 鎖定後約 1 秒會重新開始一段：剪接換人時後面會當新的一段量（同 ADR-088），報告時要看鎖定橫幅時間。
- 側面拍攝時腳不再當換人證據；左右移動很慢的人可能被當成新的一段。
- 只重播了資料集深蹲；ADR-084～088 的 lab_*／swap_* 測試影片不在這台電腦，改用單元測試涵蓋換人情境。
