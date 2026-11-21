# Iteration 08 — Phase D：Regression & handoff

2026-11-17 · v0.4.0 · feature/dataset-demo-v0，未推送／合併 main。

## 分階段交付

1. A1／077e251：Decoder no-op/cache/fallback provenance及UI waiting，65 unit、11 browser通過／1 skip。
2. A2／8234177：ROI move／resize／Restore／Reset／stale，75 unit、12 browser通過／1 skip。
3. A3／7f00096：版本化keyframes／逐sampleROI／manual reset，78 unit、13 browser通過／1 skip。
4. B／78cc107：adaptive controller＋safe recovery＋full-frame suggestions，94 unit、16 browser通過／1 skip；完整規約見 ROI_TRACKING.md。
5. C／8c6c301：整頁rVFC抑制的上傳UI等待修正與新增回歸，17 browser通過／1 skip。
6. D：README繁體中文操作、architecture、validation protocol與decision log；Git記錄保存各階段結果。

## Final check matrix

- 安裝：npm ci --cache /workspace/.cache/npm，139套件，postinstall提供同版本本機WASM。
- TypeScript typecheck、94 unit（13檔）、production build通過；bundle >500kB警告保留。
- Chromium 17 passed、1 skipped；實際有效模型＋人體MP4的條件式測試缺資產而跳過。
- 解碼：0秒重seek、已呈現影格、callback節流／無seeked、反覆 seek 及新ROI重分析。
- ROI：內部移動／八handles／numeric clamp／縮放與portrait來源座標、restore/reset/cancel、Apply stale，舊JSON逐欄不變。
- Keyframes：來源像素插值、不插角度；.4s人工校正、全片重分析、parent版本與模型reset。
- Adaptive：緩慢人物／camera位移、有界中心及尺寸、短暫出框的global建議與兩次返回確認、長失效／交錯拒絕。
- 搜尋：獨立VIDEO與1/2候選設定、raw候選保留、錯誤fail-safe、永久人工狀態受週期預算限制。
- 匯出：CSV使用逐sample實際ROI，包含state、decode、更新原因與review；JSON保留所有版本／原始值。

## 真實驗收待辦（不能寫成通過）

subject_002_squat_good_side.mp4 與有效官方模型未在本環境。團隊先前已初步實測與回報問題，
本次僅有合成程式／瀏覽器解碼證據，不能宣稱原片timeout、ROI跟隨或多人識別已完全修好。
請以相同原片／模型hash、相同5Hz requested grid，人工標Target／Wrong／Mixed／Uncertain，
分別評估Fixed／Keyframes／Adaptive，保存校正前後session、manual corrections、timing basis與指標分母。
搜尋只作建議，對完全離框或相似人重疊不提供自動身分保證；主執行緒CPU成本及真人2-pose性能未量測。
資料仍僅本地處理，未加入V1攝影機；媒體／模型／研究輸出不入Git。

最終 PR 查詢仍回傳 `Post "https://api.github.com/graphql": Forbidden`；無法確認 PR URL，不捏造連結。所有變更以 feature branch 提供審查，不合併 main。
