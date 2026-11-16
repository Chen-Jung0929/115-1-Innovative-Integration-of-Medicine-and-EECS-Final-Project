# Subject selection and tracking quality — v1

2026-11-17 · 對應 app 0.3.0、analysis schema 3、fixed-roi-conservative-v1。

## 問題與證據界線

團隊回報已在自己的環境使用官方 Lite 模型，對 Mendeley V1 的
`subject_002_squat_good_side.mp4` 完成初步分析，並觀察到多人場景選錯／疑似混合人物。
本雲端沒有該影片、有效模型或逐樣本標註，不能確診原因或虛構修正後成功率。
原程式並沒有自行把不同候選的點拼接；它把 `.landmarks[0]` 當作受測者，缺少身分檢查。
模型可能在遮蔽／多人重疊時給錯點；沒有同步原始影格與 raw landmarks，不可只憑畫面歸因。

| 失敗型態 | 定義／如何檢查 | 本次措施與限制 |
| --- | --- | --- |
| Wrong target detection | 選到另一個完整的人；須人工比對原始影格與指定受測者 | 手動 ROI 降低背景人物干擾，初始 torso 需靠近 ROI 中心；相似的錯人仍可能通過 |
| Subject switching | 隨時間換人，並非單純關節移動 | torso 位移、骨段尺度變化、遺失後鎖定；平滑交錯仍可能漏掉 |
| Mixed landmarks | 同一候選中的點疑似來自不同人 | 保留每組候選，禁止自行拼接；投影幾何及時間檢查只篩部分異常，人工決定標籤 |
| Landmark occlusion | 正確的人，但關鍵點不可見／低信心 | 肢端低信心使該側角度無效；torso anchors 不可靠使人物身分不確定 |
| Geometrically implausible pose | 退化或異常投影骨段，不代表臨床病變 | 像素幾何規則判為疑慮；透視與深蹲也可能造成 false rejection |

高 visibility／presence 不是正確人物的機率。身份欄位用 `consistent-unverified`，
不是聲稱辨識身分；通過規則也可能是錯人，不能把有效角度當作已經人工驗證。

## A / B / C 評估

檢查 installed `@mediapipe/tasks-vision` 1.2.3 的 vision.d.ts：
PoseLandmarkerOptions 提供 numPoses，PoseLandmarkerResult 提供 landmarks[][]／worldLandmarks[][]，
沒有持續的 person identity ID；陣列 index 不能當跨影格身份。

| 方案 | 優點 | 成本／風險 | 決定 |
| --- | --- | --- | --- |
| A. Single-pose + manual ROI | 不增加推論候選數，容易人工控制，減少 ROI 外的人干擾 | 人離開固定區域／重疊仍失敗；crop 改變視角輸入與解析度，須另驗證效度 | 本次實作 |
| B. Multi-pose + selected target | 可比較候選，對分離的人可能更有幫助 | CPU／記憶體較高；仍須 data association 與拒絕歧義；Lite 真實多人效能未測 | 暫不啟用；保留候選與 TargetTracker 介面 |
| C. Temporal continuity checks | 純 TS、相對便宜，可拒絕明顯跳換 | 無法證明身份；快速動作／遮蔽可能過度拒絕 | 本次搭配 A |

未量測 multi-pose 延遲，不能報 CPU 百分比／FPS 增減。保留 numPoses=1，
adapter 回傳全部候選陣列，tracker 遇到多候選直接拒絕，不排序選第一個。
ROI 用 canvas 的九參數 drawImage 實際裁切，不依賴泛用 imageProcessingOptions 的 ROI 支援。

## ROI 與時間契約

- 手動回到來源影片起點、暫停並框選（可拖曳或輸入來源像素），確認後才能分析。
- 留出全身與運動空間，但避免納入其他人。固定 ROI 不會自動跟人走。
- x/y/w/h 為原始來源像素整數；範圍須在影片內，寬高至少 32 px。
- crop normalized `(u,v)` 回原圖 normalized：
  `x=(roi.x+u*roi.width)/sourceWidth`，`y=(roi.y+v*roi.height)/sourceHeight`。
- 角度使用映射後 xy × 原始來源寬高；不能拿 crop normalized 當全畫面座標。
- raw crop landmarks 與映射後 landmarks 都保存。z 若有值是原 crop 的模型相對深度，
  原樣保留不換算為全畫面深度，不用於 2D 角度，也不是臨床／真實 3D。
- 仍以全影片 k/5 秒 seek；source timestamp 來自原始影片 rVFC，crop 不改變時間。
- 重新選 ROI 會清除 session／人工標註，建立新 selection ID，需重新分析全片。
  不把不同人或不同 ROI 的曲線接成同一 session；調整前先下載研究 JSON。
- 不支援中途自動恢復或分段 ROI。片頭無人／出框後可能整段鎖定無效，請先裁短或重新選擇。

## 四個 QC 維度與保守鎖定

完整設定寫入 session.trackingPolicy，政策版本 `fixed-roi-conservative-v1`：

- 點位信心：visibility／可用 presence ≥0.5 且在 [0,1]。肢端低信心不自動證明換人，仍由該側原有 knee QC 拒絕。
- 身份一致性：必須恰好一候選；雙肩、雙髖的 torso anchors 可靠；可信的主要點須在 ROI 內側 2% 邊界。
  第一次 torso 中心與 ROI 中心各軸差 ≤0.35 個 ROI 尺寸。這些是未驗證的 proxy，不是身份分類器。
- 幾何合理性：平均左右 torso 長度至少 8 px；可評估腿段至少 2 px；同側大腿／小腿投影長度比不超過 5。
- 時間連續性：torso 中心速度不超過每秒 3 個 torso 長度；torso 或可比較腿段在相鄰樣本的尺度比不超過 2。
  非遞增時間亦拒絕。所有門檻均為工程初始值，沒有臨床或資料集效度背書。

沒有姿態 → `target-lost`。歧義候選、core 信心不足、ROI 外插、幾何異常、時間跳變 → `identity-uncertain`。
任一人物失敗後，剩餘取樣不自動重新接回候選，附 `manual-reselection-required`。
重新選擇／重新分析才建立新 tracker。鎖定會犧牲 coverage，尤其短暫完全遮蔽後。

## 輸出與人工覆核

每個 sample 保留 candidates（crop 與原圖座標）、tracking 四維度與 reasons、rawAngles
（未經身份 gate 的幾何結果）、automaticAngles（自動 QC）、最終 left/right 及可用 review。
CSV 保留原有欄位，附 selection ID、ROI、tracking 原因、原始幾何值、auto_valid、人工標籤與政策版本。
正常視圖隱藏被拒絕骨架；可勾選紅色除錯骨架供人工判讀。紅色骨架不當作有效角度。

人工在取樣滑桿逐樣本選 Correct target／Wrong target／Mixed landmarks／Uncertain。
記錄 reviewer 代碼；Correct target 使用 target，Wrong target 可填 person-B 等人工代碼。
混合／不確定不指派單一人身份。候選 index 不可拿來代替人工 identity ID。
人工錯誤／混合／不確定會將最終角度設為無效；Correct 不會覆寫原本的自動拒絕。
保留 automaticAngles 以回顧系統原本是否漏放錯誤，避免用覆核後結果掩蓋 False-Valid。
標註只在瀏覽器記憶體，應下載研究 JSON；本版尚不支援重新匯入或跨 session 接續標註。

## 指標定義（逐樣本，不把左右兩列重複算）

全部取樣 N；人工已標註 R；可判定 A = R 排除 Uncertain；Correct C；
A 中自動至少一側有效 V；V 中 Wrong/Mixed 為 F；C 中自動至少一側有效 U。

| 指標 | 公式／界線 |
| --- | --- |
| Target Accuracy | C / A；只描述人工可判定子集，不自動推估未標註部分 |
| False-Valid Rate | F / V；自動放行中人工判錯／混合的比例，不是以所有錯誤作分母的 FPR |
| Usable Coverage | U / N；已人工確認的全片可用率下限，不知道未標註部分；無可判定樣本時為 N/A |
| usableReviewedCoverage（JSON） | U / A；可判定已標註子集中的可用率 |
| Subject Switch Count | 來源相鄰 sample_index，兩筆皆人工 Correct/Wrong 且有身份代碼時，代碼不同的次數 |

缺少分母時 N/A；沒有可比較身份配對時 Switch Count 也是 N/A，不冒報零。
切換不跨未標註、Uncertain、Mixed 或缺身份的區間。必須一併報 N/R/A、Uncertain、V、
可比較身份配對數。人工標註也有不確定性，須規約、訓練、分歧複核；不是無誤差 ground truth。

## 真實修正前後驗證仍需完成

用同一 `subject_002_squat_good_side.mp4` 與相同時間網格／模型 hash，保存舊版與新版 session。
先訂同一受測者與標註規約，逐樣本人工判讀（可行時對版本盲化），核對時戳與樣本交集。
報上表分母、uncertain／unreviewed 比例、失效原因及效能；不因新版拒絕較多就自稱較準確。
沒有該片在本環境的輸出前，本次只能報軟體回歸與合成測試結果。
