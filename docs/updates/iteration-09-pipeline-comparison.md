# Iteration 09 — Full-frame / ROI / multi-pose comparison

2026-11-17 · v0.5.0 · feature/full-frame-comparison · 未合併 main。

## 實作與研究定位

依團隊回報暫停擴充ROI；裁切資訊不足、尺度變動、SDK temporal tracking及誤差回饋仍是待驗證假說。
保留 v0.4 ROI程式，新增A原圖1pose、C原圖2/3poses＋初始位置／軀幹／連續性選人。
框在A/C只作選人參考，模型輸入不裁切。候選順序交換不改人物關聯，交錯歧義則invalid。
新模組分離subject selection、identity tracking與pure observation QC，三法共用膝部角度與輸出。

新增單鍵同源比較：File SHA／同一model bytes／selection snapshot／5Hz frozen；B強制Adaptive，固定A→B→C。
各run獨立VIDEO狀態；group保存來源、pipeline設定、輸入範圍、model hash、sample timestamps、raw候選、選人決策、QC與review。
表格／CSV／JSON報Valid Frame Rate、人工Correct Target Rate、False-Valid Rate、Usable Coverage、
raw landmark discontinuities與配對分母、analysis duration、failure reasons。
沒有人工標註時人工指標N/A；單法錯誤保留而其他方法可用；人工標註獨立且更新原比較報告。

## 實際驗證

- npm ci --cache /workspace/.cache/npm：139套件，local WASM postinstall成功。
- Typecheck、109 unit tests（17檔）、production build通過；保留bundle >500kB警告。
- Chromium：23 passed、2 skipped。新conditional actual A/B/C smoke缺有效模型與人體MP4而跳過，原actual單法亦跳過。
- 原有ROI、解碼、5Hz、角度、canvas骨架、SVG曲線、CSV／JSON、人工review、stale與keyframes全部回歸通過。
- 新雙色無人體MP4＋mock：A/C輸入仍為320×180，框外左右像素均保留；窄參考框未裁切，重新編輯仍保留參考框而非整張輸入範圍。
- C numPoses2/3候選順序交替，選中index 0/1/0/1/0，來源時間仍0/200/400/600/800ms；交錯歧義不再接人。
- 同源batch：三法同source/model hash與comparison ID，B adaptive；人工未標皆N/A，A的Wrong不複製到C，報告會更新。
- 3poses不支援的mock失敗：A/B結果保留，C指標N/A及error，不冒造結果。
- Unit涵蓋初始位置、錯人、候選交換、交錯／遺失／安全恢復、pose QC、共同grid／來源不一致、人工指標、取消與設定隔離。

## 尚未驗證／限制

沒有 subject_002_squat_good_side.mp4 或有效官方模型在本環境，未執行人體A/B/C，未提出勝出架構／效度／FPS結論。
合成姿態不是MediaPipe人體準確度證據。候選限2/3不代表偵測全場景，相似人平滑交錯仍可能誤關聯。
各法獨立解碼、common requested grid不保證相同呈現影格；報estimated數及已知PTS偏移，不能把未知當零。
B含既有額外搜尋與不同邊界QC，C含多候選關聯，耗時／有效率差異不能全部歸因裁切。
固定順序有暖機偏差；需相同原片／模型hash、人工逐法標註與控制條件，才能支援架構選擇。

操作、指標分母、pipeline contracts與真實驗收步驟已更新於README、ARCHITECTURE、VALIDATION_PROTOCOL及PIPELINE_COMPARISON。
