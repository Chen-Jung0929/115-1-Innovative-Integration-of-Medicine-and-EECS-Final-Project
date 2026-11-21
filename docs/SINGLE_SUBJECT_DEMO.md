# v0.6 — 單人 Dataset Demo 核心與驗收

> v0.6.1：controlled-single-default 的短暫torso跳變改為有界恢復，詳見 [iteration-12](updates/iteration-12-controlled-recovery.md)。非受控／實驗模式、真正歧義與人工鎖定維持原規則。

2026-11-17 · app 0.6.0 · schema9 · controlled-single-core-qc-v6。

## 收斂決策

主題為關節角度分析與視覺化，不以多人追蹤或 Adaptive ROI 研究作為主要目標。
預設與一般成員驗收只使用 Full Frame + Single Pose；ROI／多姿態／A/B/C 比較保留於實驗區，停止擴充。
此決策來自團隊的範圍選擇，不是已證實 Full Frame 人體 accuracy 勝出的實驗結論。

受控前提：單一受測者、固定鏡頭、完整人體入鏡、側面 Squat。numPoses=1 只限制回傳候選數，不能確認場景實際只有一人。
維持 academic PoC、2D 幾何、provisional flexion proxy；沒有加入攝影機、ROM、更多動作或臨床判讀。

## 工作流與模組邊界

MP4 → source-time 5Hz offline decode → 原尺寸完整 canvas → MediaPipe 1 pose → torso consistency／各側 landmark QC → 2D knee angle → overlay／curve／CSV／research JSON。

- `input/singleSubject.ts`：產生完整原圖參考設定，記為 `controlled-single-default`，不是使用者已人工確認人物。
- `domain/pipeline.ts`：UI 與 analyze 共用 DEFAULT_PIPELINE，避免 UI 主張單人但核心預設仍裁切。
- `pose/mediapipe.ts`、input/video.ts：沿用模型與解碼介面；本版不改 detector 或影片時間同步方法。
- `tracking/identity.ts`：只用可靠 torso／候選維持一致性；不能把腿段異常直接作為身份換人的證據。
- `biomechanics/jointQuality.ts`／`tracking/jointQuality.ts`：各側 observation／temporal 狀態，與 kneeAngle 的純數學獨立。
- `motion/analyze.ts`：共用編排，實驗管線須明確指定；不同輸入未來可共用角度與 QC 核心，本版不實作 camera。
- `visualization`／`export`：只使用已保存取樣；播放不再次推論，不在未知影格沿用近鄰角度。

主流程不要求 ROI；系統產生的全圖參考不作裁切，也不冒充 manual keyframe，sample.manualKeyframeId=null。
選用實驗設定仍明示於主要區域；收合不改 pipeline，編輯草稿可取消；回主要模式會 stale 舊分析，不修改原 session。
研究診斷／人工標註收合，保留所有既有原始／自動／人工結果與匯出。

## 4/155 的程式診斷及恢復

團隊回報 v0.5 三法各4/155、0.8秒腿段跳變後151筆持續人工鎖定；raw 左膝 A/B155、C149可計算。
本環境無原始 JSON，這些是回報值，非本次獨立重播結果。原始角度可計算不是人物或角度真值。

v0.5.1 已修正腿段→全域 manual latch 的耦合，v0.6沿用該分離：

1. 可靠 torso 持續更新身分歷史，局部腿部異常不耗盡身分恢復 budget。
2. Confidence≥0.5、missing／finite／source bounds、段長≥2px、同側比例≤5等檢查保留。
3. 各側 segment scale>2先拒絕，之後至少兩筆可靠且穩定觀測才恢復；gap≤300ms，尺度相對前筆與恢復首筆≤1.25。
4. 不插值／補值、不回填被拒絕樣本；另一側有效量測不因局部錯點被取消。

本版額外修正「尚無任何可靠姿態時立即人工鎖定」：
沒有可信 torso 的初始化樣本記 LOST／UNCERTAIN 與 waiting-for-initial-reliable-pose。
後續可信候選仍須通過原參考位置、confidence、geometry 與各側確認，才產生有效角度。
初始多候選歧義或有可靠人物卻不符指定參考，不會藉此解鎖；已鎖定的 identity 不會因好膝角自動解除。

已有 baseline 後，短期完全缺失仍受650ms、兩次嚴格 torso 恢復限制；再完成關節確認。
較長失去目標、明顯 torso 跳換、多人歧義、非遞增時間等仍要求人工，不承諾任意遮蔽都可恢復。
穩定且合理的錯人／混合點仍可能通過；這是未經人體校準的保守篩檢，不是身分分類器或 accuracy 證明。

## 資料契約

schema9：沿用所有欄位，加入 controlled-single-default 的設定／keyframe source，避免冒充人工確認；
主流程不記 manual keyframe ID。模型資產 SHA／package、原影片 SHA、來源尺寸、每筆 requested／source timestamps、
raw candidates／angles、tracking.joints、automaticAngles、人工否決與定義／QC／app版本均保留。
離線 replay 讀取 schema7/8/9；舊 v0.5.0凍結策略不改，本版派生結果schema9。
B replay仍只描述 saved ROI observations，不重建新 crop feedback；完整方法見 QC_REPLAY.md。

## 驗收表

| 項目 | 本環境狀態／證據 |
| --- | --- |
| 安裝、typecheck、unit、build | 記於 iteration-11 的實際結果，保留 bundle 大小警告 |
| 上傳→分析→曲線→CSV／JSON，不先框選 | 瀏覽器＋合成影片／mock pose回歸；不是人體推論驗證 |
| 首筆缺失／單側低信心／腿段跳變／短暫整體缺失後恢復 | 新 unit與browser逐取樣驗證，等待無效、原始資料保留 |
| 原ROI／多人／人工標註／replay | 舊測試保留，只調整收合區導航與schema／自動設定revision預期 |
| 真實單人固定鏡頭 Squat 穩定性 | **待驗收**：未取得核准影片／有效模型／原始研究JSON |

真實驗收不以 build 或合成曲線替代。待團隊提供／本機準備核准資產，執行：

```sh
POSE_MODEL_PATH=/approved/pose_landmarker_lite.task \
POSE_VIDEO_PATH=/approved/single-subject-squat.mp4 \
CHROMIUM_PATH=/usr/bin/chromium npm run test:browser -- --grep 'actual MediaPipe on an approved'
```

Mac 已安裝 Playwright Chromium 時省略 CHROMIUM_PATH。自動測試只作實際推論 smoke，仍須人工驗收：
確認場景符合單人條件，保存 source／model hash與取樣數；檢查原片、疊圖、各側N/A與曲線斷點、CSV／JSON一致性，
逐筆核對0.6–1.4秒以及所有拒絕／恢復區間。若已有逐樣本人工參考，另報正確人物、角度誤差與未知比例。
不能用有效率增加直接宣稱 accuracy 提升。尚未由物治確認可接受誤差，不自行設定臨床通過門檻。

已知 subject_002_squat_good_side.mp4 曾有多人背景，不能只因檔名符合Squat就宣稱已符合單人驗收條件。
若準備衍生單人片段，須另記來源、處理方式與新hash；不能靜默取代原始資料或回寫既有session。
下一步只先完成這項真人驗收，再規劃共用輸入介面的V1；不重啟多人追蹤擴充。
