# Validation protocol — draft 0.1

這是預留研究計畫，不是完成的驗證結果。臨床定義、樣本量與可接受誤差待物治端確認。
凍結模型／演算法／QC 版本、樣本選擇、定義與排除規則後，才進行正式比較。

## 驗證層次

| 能力 | 方法與必要輸出 |
| --- | --- |
| Computational correctness | 已知 0/90/180° 幾何、左右側、各長寬比／等比例縮放、鏡像、缺點、非有限值、零長向量、dot clamp、時間順序等單元測試 |
| Human annotation agreement | 同一影格由至少兩位經規約訓練者獨立標點；記錄重測、遮蔽、分歧與仲裁；報告角度差與 landmark 差，不能只報模型對單一標註者 |
| Angle measurement error | 相同來源影格、相同側別／角度定義配對；報告 MAE、RMSE、Bias、樣本數、涵蓋率與誤差分布 |
| Viewpoint robustness | 可比的視角分層；未同步影片不直接作逐影格配對；報告投影／遮蔽限制 |
| Tracking validity | 以所有 eligible frames 為分母，報告無效比例、缺口長度、左右交換、追蹤遺失與失敗原因 |
| Performance | 記錄裝置、瀏覽器、delegate、解析度、warm-up、輸入／處理 FPS、掉幀及延遲 p50/p95；推論耗時不冒稱端到端延遲 |
| Independent reference | 後續可用校準與同步的獨立量測系統；記錄校準／座標映射及參考不確定性 |

## 標註與配對

先撰寫 landmark 解剖定位、2D pixel 座標、側別、遮蔽處理與角度規約，做 pilot 再凍結。
來源影格以 source_id + frame index + media timestamp 保存，不用推論結果回填人工參考。
標註者在可行時對模型輸出盲化。按受試者／影片區分調參與保留評估樣本，避免相鄰影格洩漏。
取樣涵蓋角度範圍、動作階段、視角與失敗案例，不只選好看的影格。

人工影像參考與模型 2D 比較不證明三維或臨床效度；不能推論治療改善。

## 統計定義

有效配對 n 個，eᵢ = estimatedᵢ − referenceᵢ（degree）：

- MAE = Σ|eᵢ| / n
- RMSE = sqrt(Σeᵢ² / n)
- Bias = Σeᵢ / n（正值為高估）

n=0 時報無法估計，不輸出 0；缺失不補零。另報所有 eligible 數與有效配對數。
Bland–Altman 可描述 bias 及 agreement limits，但相鄰影格不獨立，不能直接套獨立樣本信賴區間。
以受試者／影片為群集的重抽樣或階層模型評估不確定性；群集太少時坦承不能穩健推估。
若使用 ICC，先選模型、單次／平均及 absolute agreement／consistency 並說明理由。
重測分析須固定同一 protocol，報受試者內變異；不是單一影片內高度自相關的穩定度。

## 決策與重現

臨床可接受 MAE／ROM 差與主要 endpoint 尚未決定，不得事後以結果訂及格線。
保留 raw angles、validity、模型／定義／QC／schema 版本、來源 hash、排除清單、
分析腳本與（若重抽樣）random seed；敏感資料留在核准的受限空間。
雙鏡頭即使互相一致也可能同時偏誤；不得自動當 ground truth。
Task 2 已加入 computational correctness 單元測試與合成輸入瀏覽器整合測試；
不把這些測試當量測效度結果。真實模型／人體影片驗收尚待執行；Python 分析尚未開始。

## 人物可靠性 follow-up

團隊已回報真實影片初步分析成功但有多人錯選；不能把原有角度計算測試當身份驗證。
本次實作逐樣本 Correct target／Wrong target／Mixed landmarks／Uncertain 與人工身份代碼。
按 SUBJECT_TRACKING.md 的分母計算 Target Accuracy、False-Valid Rate、Usable Coverage 與
Subject Switch Count。保存自動與人工覆核後 validity，避免標註修改後掩蓋原本漏放的錯誤。
以同片、同模型 hash、同目標時間網格作前後比較；先規約標註、報未知／缺失比例與樣本交集。
人工參考須考慮標註者一致性與重疊不可判定影格，不以模型輸出自動建立身份 ground truth。

## v0.4.0 ROI / decoder regression and real-video acceptance

自動回歸：同時間0秒尋時、無 seeked／無 rVFC、草稿／Apply stale、移動／8 handles／縮放 source mapping、
keyframes插值、緩慢人物／camera位移、短期出框／兩次恢復、多人歧義、搜尋失敗、manual correction、舊session與CSV／JSON。
真實 subject_002_squat_good_side.mp4 不在本環境，真實驗收待完成；不能以合成姿態驗證代替。

先固定原片／模型 hash、對照相同 requested 5Hz grid 與指定受測者。逐樣本人工標身份與混點、
同時報 reviewed／uncertain 分母、FVR／usable coverage、state／failure分布與模型搜尋成本。
區分 presentation PTS 與 seek-position-estimate；估計時間不能冒稱精確逐影格配對。
標註／人工 ROI 校正若使用驗證片，必須將其列為人工輔助條件，另保留無校正基準，不能聲稱完全自動成效。
校正前後需分析新版本，記錄 keyframe時間、correctionSource、parentIDs，保留原始輸出；不把插值ROI當角度真值。

## v0.5.0 architecture comparison

完整方法見 PIPELINE_COMPARISON.md。裁切缺上下文、動態尺度、SDK temporal tracking 及ROI誤差回饋皆待驗證假說。
保留 B Adaptive，新增 A 全圖單人與 C 全圖多人／參考選人，三法輸出同一角度定義與版本化 QC 來源。
以相同影片／模型 hash／5Hz grid，比較自動有效率、人工Correct Target／False-Valid／Usable Coverage、
raw landmark不連續、可比較配對、實際分析耗時與失敗原因；未標註不當正確，失敗方法不填0。
報告 common requested子集與allSamples，檢查不同來源PTS或estimated時間的配對限制。
人工標註每法獨立，不能複製另一法的模型身份結果；比較整個pipeline不能單獨證實cropping因果。
先用無中途校正的初始框作基準，人工輔助校正另立條件；重跑／控制順序檢查暖機及裝置差異。
本環境真實影片未提供，不以合成測試替代人體結果或選出勝出方法。

## v0.5.1 QC replay 與新增放行稽核

依 [QC_REPLAY.md](QC_REPLAY.md) 對原始 schema7/8 研究 JSON 進行 frozen-v0.5.0、separated-2、separated-3 對照。
保留原檔 bytes hash，先檢查凍結策略與原紀錄是否一致，再逐筆核對0.6–1.4秒段長、候選、身分及各側狀態。
報 raw pose availability、subject acceptance、joint automatic validity、manual required、失敗區間結局，分母為各 run samples。
新增自動放行逐筆列出，不以 Valid Frame Rate 提升推定 Accuracy；人工 Wrong/Mixed、Uncertain、Correct 與未判讀分開。
對換選候選不沿用舊標籤；Correct target 也不足以確認 angle accuracy，需要獨立點位／角度參考。
B 重播只在 saved crop observations 條件下有效，不能代表新版 ROI feedback；必要時另跑原片比較。
團隊回報真人各4/155／0.8秒人工鎖定；本環境未收到 JSON，修正後真實指標待驗收。合成155筆僅驗證狀態機。

## v0.6 單人驗收優先

以 [SINGLE_SUBJECT_DEMO.md](SINGLE_SUBJECT_DEMO.md) 為目前驗收方向。受控單人、固定鏡頭、全身入鏡，
直接完整影格單姿態；不以多人追蹤／Adaptive效能作主要完成條件，也不聲稱此選擇已經accuracy比較證實。
新regression須涵蓋首筆姿態缺失、局部低信心／幾何／時間異常及短暫完全缺失；等待／恢復都保留原始觀測且無效值不補。
原27個browser案例與既有單元測試保留，實驗功能只改收合區導航及版本／自動初始化相關預期。
真實資產不在本環境，實際推論smoke與人工穩定性驗收分開，皆不能以mock pose取代。
來源影片有多人背景時應記為不符本次受控條件，不冒稱單人驗收通過。
