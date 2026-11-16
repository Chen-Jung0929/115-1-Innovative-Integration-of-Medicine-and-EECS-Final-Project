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
