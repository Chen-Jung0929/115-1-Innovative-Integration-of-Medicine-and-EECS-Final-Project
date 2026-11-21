# Decision log

2026-11-16 · Initialization

| ID | 決策 | 理由／後續影響 |
| --- | --- | --- |
| ADR-001 | Browser-first React / TypeScript / Vite | 降低現場部署負擔；相機與推論需另驗證裝置相容性 |
| ADR-002 | 共用純 TypeScript biomechanics | MP4／camera 共用，數學單元測試獨立於 UI |
| ADR-003 | V0 優先 2D 膝部三點幾何角 | 可明確定義與人工影像參考比較；不等於臨床或 3D 效度 |
| ADR-004 | 依功能完成迭代 | 每版可操作／測試／重現，不依日期承諾版本 |
| ADR-005 | 資料不入 public Git | 模型輸出與去識別資料也可能敏感；ignore 加人工審查 |
| ADR-006 | 按功能加入依賴 | 先 React/Vite/Vitest；MediaPipe、Recharts、Python 統計套件於後續任務加入 |
| ADR-007 | 明確版本與無效值契約 | 保留 raw／validity 與模型／定義／QC provenance；缺失不等於零 |
| ADR-008 | Dataset 授權待查核 | landing page 回傳 403，未下載；不得推定 license 或捏造影片紀錄 |
| ADR-009 | 既有 unborn work branch 改名 main 後建立首筆提交 | 初始化前遠端無 refs；推送 main 前重新查核，不覆寫遠端歷史 |

待決定：臨床角度／ROM 規約、信心門檻、可接受誤差、驗證樣本設計、模型資產版本、
支援瀏覽器／裝置、camera 效能目標、獨立參考與倫理流程。
變更決策時新增紀錄並註明取代的 ADR，不悄悄改寫研究假設。

## Task 2 — 2026-11-16

- ADR-010：以 5 Hz 目標時間網格離線 seek，保存 requested 與 presented source time，去除重複／逆序影格。不是全影格分析。
- ADR-011：每次分析建立獨立 VIDEO 模型實例；播放只讀結果。不在未分析影格顯示近鄰姿態。
- ADR-012：明確選取的本機 .task 優先，否則先讀專案 public/models；官方下載須 opt-in。
  WASM 從 lockfile 中同版本 npm 套件複製、本機提供；不使用未知鏡像。模型不入 Git。
- ADR-013：原始 2D 內角與 180°−內角 proxy 使用不同 definition ID；無效角度為 null，CSV 空欄並記原因。
- ADR-014：V0 候選實作與真實模型／資料集驗收分開呈現；沒有正式人體推論證據就不標記 V0 完成。

## Subject selection follow-up — 2026-11-17

- ADR-015：正式課程名稱統一為「醫學電資創意整合專題」，更新目前文件與網頁，保留 Git 歷史。
- ADR-016：先採 single-pose 固定手動 ROI＋保守連續性篩檢；不增加 numPoses，保留候選／TargetTracker 介面。
- ADR-017：人物遺失／疑慮後在同 session 鎖定無效，避免自動接人；犧牲 coverage 的門檻為未驗證工程值。
- ADR-018：raw／automatic／人工覆核後結果分離，人工判錯使最終角度無效，自動決策保留以分析漏放。
- ADR-019：人為 ID 只來自標註，不來自模型候選 index。人工指標分母與未知狀態須明示，未標註不假定正確。

## Decoder / editable and adaptive ROI — 2026-11-17

- ADR-020：no-op seek 與 callback 延遲分開處理；可繪製 frame 的時間估計必須有 provenance，不延長 timeout 掩蓋事件問題。
- ADR-021：ROI 草稿與 session 分離，Apply 才 stale；保留舊session，重新分析指向 parent。
- ADR-022：手動 keyframes 線性插值 source pixels，角度不插值；人工重新確認點重建模型與追蹤器。
- ADR-023：Adaptive 僅用前一 accepted pose、有界平滑，4-state安全恢復取代永久 latch（取代 ADR-017 的無條件永久鎖定部分）。
- ADR-024：獨立最多2-pose全畫面搜尋作人工建議／歧義證據，搜尋候選不自動轉成有效目標；未宣稱真人多姿態效度。
- ADR-025：保守全片重分析，不在舊 session 局部拼接或覆寫；schema6保存逐樣本ROI、decode、state及校正來源。

## Full-frame architecture comparison — 2026-11-17

- ADR-026：暫停擴充ROI；保留B，新增A全圖單人與C全圖多候選，以真實比較再決定架構。
- ADR-027：input crop 與 target reference 分離；A/C輸入完整source frame，候選index不是person ID。
- ADR-028：新完整流程分離Detection／Initial Selection／Temporal Identity／Landmark QC／Angles；B保留舊行為作對照。
- ADR-029：同源batch共用模型bytes與File hash，獨立依序A/B Adaptive/C，保留單法失敗；不把未知真實影格對齊假裝為零偏移。
- ADR-030：人工標籤逐法獨立，提供common/all分母與runtime；三法pipeline比較不視為cropping因果實驗。

## QC diagnosis and recovery — 2026-11-17

- ADR-031：分離 subject identity、joint observation 與 joint temporal QC；局部腿段跳變／退化不再單獨造成永久 identity failure（修正 ADR-023／028 中仍耦合的部分）。
- ADR-032：torso 的原始門檻、歧義／跳換／長期遺失人工鎖定保留；局部異常時可靠 torso 仍可更新人物歷史，不以膝踝幾何推定身分。
- ADR-033：左右膝獨立確認與 baseline，預設兩次連續穩定觀測、gap≤300ms、段長相對上一筆及窗口首筆≤1.25；等待時不補值、不 retroactive 接受。三次規則只供 replay 比較，尚未人體校準。
- ADR-034：保存凍結 v0.5.0 實作供 offline replay；不覆寫原 session，保存來源 hash／parent，逐筆列新增放行及人工適用性，coverage 不是 accuracy。
- ADR-035：Replay 固定原候選、實際 ROI、timestamps 與搜尋歧義／失敗紀錄；B 不重建 crop feedback，不能冒充新版本完整重分析。
- ADR-036：schema8 明確記錄各側 observation／temporal／recovery state；派生 session 的舊 detection run 保存於 qcReplay.detectionRun，與新推論耗時區別。

## v0.6 單人核心收斂 — 2026-11-17

- ADR-037：依使用者決定以 Full Frame + Single Pose 為主要操作及核心預設；取代 ADR-026 的「以A/B/C比較決定架構」作為主要開發目標，並非accuracy勝出結論。
- ADR-038：ROI／Multi-Pose／比較保留於實驗區，診斷／標註收合；停止擴充，既有測試保留。
- ADR-039：自動全圖參考標controlled-single-default、不作manual keyframe，schema9保留raw／QC／source與模型metadata；不要求一般使用者框選。
- ADR-040：初始化尚無可信torso時等待而非永久鎖定，逐側確認完成才放行；既有ambiguity／torso jump／長期遺失人工鎖定不自動解除。
- ADR-041：本版完成工程回歸仍將真實受控Squat標待驗收；先完成這項驗收，再另案規劃camera，不同時擴大範圍。

## V1 即時鏡頭初版 — 2026-11-17

- ADR-042：依使用者要求（V1 路線）提前開始即時鏡頭，與真實受控 Squat 驗收並行；調整 ADR-041 的先後順序，不代表 Dataset Demo 已完成人體驗收。
- ADR-043：鏡頭只是新的輸入來源（src/input/camera.ts）；人物一致性、關節 QC、膝角與 gate 由 motion/measure.ts 與上傳影片共用，政策與門檻不變。
- ADR-044：即時目標取樣 10 Hz（離線 5 Hz）；時戳用 requestVideoFrameCallback 的 mediaTime，重複或倒退時戳直接略過，不送模型。
- ADR-045：即時模式的人工鎖定（多人、遺失過久等）不自動解除；使用者按「重新開始量測」才以新的 analyzer 開新段，前一段原樣保存可匯出。
- ADR-047：使用者回饋自己拍時手機放很遠、走回去按鈕不實際。改為免觸控分段：開鏡頭後先等待，同一人全身入鏡且靜止 1.5 秒（live-ready-hold-v1：gap≤300ms、中心移動≤0.25 torso、尺度比≤1.15、至少一側膝踝完整）才建立新 analyzer；量測中出現人工鎖定即結束並保存該段，等待下一次 ready。鎖定段本身仍不解除，取代 ADR-045 的「只能按鈕重新開始」。
- ADR-048：依 PROJECT_SPEC V1「記錄掉幀、有效率、延遲」與 VALIDATION_PROTOCOL Performance，每段記錄 live-performance-v1：裝置 userAgent、delegate、解析度、warm-up、輸入／處理 FPS、掉幀（rVFC presentedFrames 跳號；取樣率刻意略過的影格不算）、推論時間與端到端延遲 p50/p95（captureTime 起算，無則以 presentationTime 並標估計）。存於 Session.livePerformance（選用欄位，只有 camera session 有；CSV 不變、schema 版本未升）。每段 sourceTimeMs 以該段第一個影格的鏡頭媒體時間歸零，偏移存 sourceClockOffsetMs；模型仍收原始單調時鐘。
- ADR-046：推論永遠使用未鏡像影格（inferenceMirrored=false），顯示鏡像另存 displayMirrored；分頁隱藏即關閉鏡頭並結束該段；畫面尺寸改變即結束該段。


## 深蹲姿勢指標 — 2026-11-17

- ADR-042：新增髖角（hip-image-interior-v1）、上身（軀幹）前傾（trunk-lean-image-vertical-v1）、膝蓋對腳尖線（knee-toe-plumb-offset-hip-width-image-v1，依講義 p.11 膝蓋應在腳尖／第二趾鉛垂線上或微外側）三項 2D 影像平面指標，皆為暫定定義、無門檻，待 PT 確認；不宣稱臨床角度。
- ADR-043：姿勢指標與膝角共用同一套 landmark 篩檢（knee.ts sourcePoint）與 subject gating；髖角與膝蓋對腳尖線跟隨同側 joint QC，軀幹只看 subject。raw／automatic／人工覆核後 final 分開保存於 sample.posture（schema10，選填欄位，舊 session 不受影響）。
- ADR-044：CSV 每筆取樣在兩列膝之後加 hip 左右、trunk_lean（midline）、knee_toe_offset 左右；非角度值不放入角度欄，改用 metric_value／metric_unit（hip-width）／ungated_metric_value。

## 醫學組正面檢查（第二版） — 2026-11-17

- ADR-050：依 Movement analysis 講義 p.5，基準線定義為「通過兩腳跟中點（MediaPipe 29/30）的畫面垂直線」（heel-midpoint-image-vertical-v1）。為避免線隨每格點位雜訊晃動，以狀態機鎖定（heel-baseline-lock-v1）：腳跟在 1 秒內範圍 ≤ 0.15 個骨盆寬才鎖定，偏離 > 0.35 個骨盆寬持續 ≥ 0.6 秒才重新搜尋，無觀測 > 2 秒解除。皆為工程暫定值。
- ADR-051：正面指標（squat-frontal-image-v1）：頭（眉心≈兩眼中點，否則鼻子）與骨盆中點相對基準線的水平距離（骨盆寬）、肩線與髖線傾斜角、軀幹（髖中點→肩中點）與畫面垂直的側傾角；正負號以個案解剖左側為 +，與鏡像無關。肩寬／軀幹長 < 0.35 判 unsupported-view（非正面）。2D 影像平面幾何，不是臨床角度。
- ADR-052：提示（squat-frontal-cues-v1）門檻全為暫定、待醫學組確認：頭 0.35 骨盆寬、肩 5°、軀幹 8°、重心 0.25 骨盆寬、骨盆 5°、膝對腳尖 0.45 骨盆寬（膝屈曲 proxy ≥ 30° 才判斷）。同方向的頭偏／肩不平歸因於軀幹側傾並合併為一則（依講義錯誤示範的寫法）；持續 ≥ 200 ms 才顯示，最多 2 則。
- ADR-053：正面檢查在顯示時由已分析取樣即時推導（motion/frontalTimeline.ts），不寫入 session、CSV 或 schema，schema 維持 10；只使用身分通過且未被人工否決的取樣。之後相機模式需呼叫同一組純函式（baseline、measureFrontal、instantCues、createCueTracker）。
- ADR-054（2026-11-17，使用者決定，修正 ADR-050 的位置）：基準線預設改為「個案站直時的軀幹中線」（兩肩中點與兩髖中點 x 的平均），只在站直（兩膝屈曲 proxy ≤ 20°）且腳跟穩定 1 秒時校正並鎖定；講義 p.5 的「兩腳跟中點」保留為可切換選項。理由：OpenCap 範例（動作正確）中兩腳站位不對稱與鏡頭偏斜使腳跟中點偏離身體中心，造成幾乎每格都誤報「頭偏離中線」。腳跟仍用來判斷何時鎖定／重新校正。待醫學組確認。
- ADR-055：頭偏、重心偏移、肩傾、骨盆傾、軀幹側傾改為相對「站直校正那 1 秒」的平均值（抵消鏡頭輕微滾轉與個人習慣站姿）；未校正前為 N/A（新增 InvalidReason `baseline-pending`）。膝對腳尖線維持絕對值。非正面門檻由肩寬／軀幹長 0.35 收緊為 0.55（約 40° 轉向），非正面時膝對腳尖也判無效。
- ADR-056（2026-11-17，使用者要求「有些線只適用正面」）：自動判斷拍攝角度（view-classify-shoulder-torso-v1）：肩寬／軀幹長 ≥ 0.55 正面、≤ 0.3 側面、其間斜拍（只用位置，不用 visibility）。正面線只在正面畫；側面（講義 p.12，squat-lateral-image-v1）只量靠鏡頭一側（平均 visibility 較高者）：膝蓋超過腳尖鉛垂線的距離（以小腿長為單位，前方由腳跟→腳尖方向決定）、上身前傾（髖→肩與畫面垂直夾角）、小腿前傾。暫定門檻：膝 > 0.6 小腿長（膝屈曲 proxy ≥ 30° 才判斷）、上身 > 45°。講義的 3–8 cm 無法從單一影片換算，脊椎曲線無對應點位，皆待醫學組確認。顯示時推導，不寫入 session，schema 仍為 10。

## 介面改版 — 2026-11-21

- ADR-057（使用者決定）：畫面上的膝、髖大數字與曲線改顯示「彎曲」= 180° − 影像平面內角（站直約 0°）。依據自訂（臨床習慣，講義未規定數值）。只改顯示；session、CSV、JSON 仍存內角，內角在「怎麼算？」可見。
- ADR-058：無效值在畫面上以白話原因呈現（src/app/plain.ts），原始 InvalidReason 代碼保留在細節與匯出，研究追溯不受影響。
- ADR-059（使用者回饋畫面一直跳）：播放中顯示最近一次已分析取樣，最多 250 ms（一個 5 Hz 間隔加解碼誤差），只往前、不插值；暫停時仍只顯示精確對應的取樣（matchingSample），研究檢查規則不變。
- ADR-060（使用者回饋暫停時仍常見「沒有分析結果」，修正 ADR-059 的暫停部分）：暫停在兩次取樣之間時，顯示時間最接近的已分析取樣（最多相差 120 ms，nearestSample），並標示「顯示最近的分析影格（相差 X 秒）」。只影響顯示；session、CSV、JSON 與取樣規則不變。
- ADR-061（使用者回饋「人在深蹲卻一直叫他站直」）：上傳影片若始終沒有「站直不動 1 秒」可鎖定基準線，改用整段影片中站得最直的正面取樣（兩膝屈曲 proxy ≤ 20°，不足 3 筆時放寬到 ≤ 35°）的中位數定基準線與站直校正（offline-standing-calibration-v1）；畫面註明此情況。即時鏡頭不適用（無法看未來）。
- ADR-062（使用者回饋播放有延遲、肩線跟不上身體，取代 ADR-059 的「只往前沿用」）：播放與暫停一律顯示時間最接近的已分析取樣（最多相差 120 ms），延遲由最多約 0.25 秒降到約 0.1 秒。根本限制是上傳影片每秒只分析 5 次（SAMPLING_HZ），要更順需提高取樣率（分析時間等比例增加），待團隊決定。
- ADR-063（使用者回饋骨架與影片仍不同步）：只為「畫面上的骨架與檢查線」在相鄰兩個都通過人物 QC、相隔 ≤ 250 ms 的取樣之間線性移動點位（smoothedSample）；所有數字、提示、CSV、JSON 仍取自實際取樣，不插值角度（ADR-022 精神不變）。遇到斷點或未通過 QC 時不平滑。
- ADR-064（使用者回饋「目前角度太斜」偶爾閃出）：拍攝角度判斷加上持續時間（view-hold-v1）：新的角度要連續維持 600 ms 才採用，單格的肩寬變窄（雙手交握、輕微轉身、點位抖動）不再切換成「太斜」。門檻（ADR-056 的 0.55／0.3）不變，暫定值。
- ADR-065（使用者：「拍攝角度其實是同一個」）：上傳影片鏡頭固定，若 ≥ 60% 可用取樣判為同一角度，整段影片就用這個角度（whole-video-view-v1）；只有角度真的混雜時才用 ADR-064 的 600 ms 持續判斷。
- ADR-066：整段影片的拍攝角度只用「站姿」取樣（兩膝屈曲 proxy ≤ 35°，至少 3 筆，否則用全部）判斷，因為深蹲時上身前傾、軀幹在畫面上變短，會讓斜角拍攝看起來像正面。整段判為斜角時，提示改為「這支影片是斜角拍攝：醫學組檢查線只適用正面或正側面，膝、髖角度仍可參考」。
- ADR-067（使用者選擇「加開關，標註僅供參考」）：「動作檢查」新增開關「斜角也顯示（僅供參考）」，預設關閉。打開時斜角取樣（肩寬÷軀幹長介於 0.3 與 0.55）也用正面檢查計算基準線、站直校正、檢查線與提示（oblique-reference-v1），提示框標示「斜角拍攝，僅供參考（2D 投影會有誤差）」。依 2026-11-17 測試，斜角影片的正面檢查誤報 40–67%，因此只作參考、預設不開；匯出資料不受影響。
- ADR-068（使用者選擇「做試驗版並和 OpenCap 比對」）：保存 MediaPipe world landmarks（`Landmark.world`，選填，schema 不升版），以 3D 夾角算膝、髖彎曲（world-landmark-3d-flexion-v1，自訂），在畫面與曲線上和 2D 並列，標示「試驗」。2D 仍是主要量測、CSV 與提示依據。初步比對（OpenCap 5 鏡頭 0–75°＋雙鏡頭，iteration-17）：深蹲最低點膝誤差 2D 2–82°、3D 3–19°；3D 站直時讀 8–29°。是否改為主要數字待研究組資料驗證後決定。
- ADR-069（使用者要「看得到的 3D 骨架」）：影片下方加「3D 骨架（試驗）」視窗，用同一組 world landmarks 以正交投影畫在 canvas 上（不加新套件），可拖曳旋轉或切正面／斜角／側面，膝旁標 3D 膝彎曲。只顯示、不影響量測；畫面平滑時 3D 點也在相鄰取樣間線性移動（同 ADR-063）。
- ADR-070（使用者：「能不能用骨架？骨頭？」）：3D 骨架視窗預設以 OpenSim LaiUhlrich2022 骨頭模型（opencap-viewer 幾何，Apache-2.0，`public/bones/`，約 1.1 MB）顯示，用 three.js 0.187.0（新增相依）依 world landmarks 擺位、長度依個案縮放；可切回「線條」。只顯示、不是 OpenSim IK，不影響量測；WebGL 或模型檔載入失敗時自動改用線條。

## 3D 骨架準確度改善（混合式 3D）— 2026-11-21

- ADR-071（使用者回饋 3D 骨架「非常不準」，邀請創新做法）：3D 骨架與 3D 膝、髖角改用「混合式 3D」（hybrid-2d-world-lift-v1，自訂，`src/biomechanics/lift3d.ts`）：每支影片先以正交最小平方求一個「world landmarks → 畫面」的旋轉（兩階段：先以大小比例代替尺度，再用每格尺度重解），每格尺度（像素／公尺）以 0.5 秒局部直線平滑，可跟上走向鏡頭的人；骨架的左右、上下取自 2D 關鍵點（畫面內最準），只有前後深度取自旋轉後的 world landmarks。顯示與 3D 角度都用這組點；2D 角度仍是主要量測，CSV、QC、門檻不變。`worldFlexion()` 保留為基準比較。
- ADR-072：站直校正膝深度（straight-leg knee depth calibration，自訂）：world landmarks 站直時把膝蓋放在髖–踝連線前方約 5 cm，讓站直讀成 11–21°。取整段影片「髖–踝畫面距離」前 10% 的取樣當站直，取其膝相對髖–踝連線的深度中位數為偏移；每格依腿伸直比例 e（髖–踝距離 ÷ 站直值）扣除偏移 × clamp((e − 0.75)/0.25)，蹲下時逐漸不扣（全扣會讓最低點低估 5–15°）。假設：影片裡有站直的時候。另試過（已移除）：骨長限制的深度求解（Taylor 法，含軟限制與「膝可達範圍」兩種），站直與最低點都變差，原因是腿接近平行畫面時深度對骨長誤差極敏感。
- ADR-073：腳步鎖定與重力（自訂）：world landmarks 以髖為中心，深蹲時骨盆不會後移；改以「著地的腳不滑動」把整副骨架在相機深度方向平移（兩腳依離地高度加權、逐格積分；雙腳著地時累加互相抵消、不漂移）。重力方向用 world landmarks 自己的「上」經擬合旋轉換到相機座標（比「手機擺正」或兩者平均準：五視角平均傾斜 4.9° vs 9.7° / 7.3°）；地板 = 每格最低腳點高度的中位數，腳踩在 y = 0。畫面 x/y 不受影響，所以骨架仍貼合影片（重投影 ≤ 1.6% 身高）。
- ADR-074：時間平滑與即時版：上傳影片在輸入點位上做零相位高斯平滑（σ = 0.1 秒，不跨 > 0.5 秒的斷點）；即時鏡頭用同一套步驟的因果版（`createCausalLifter`：旋轉累加、站直值用緩慢衰減的最大值、偏移用近站直取樣的移動平均、one-euro 濾波 minCutoff 5 Hz、β 1），目前即時畫面尚未顯示 3D，留作之後接上。驗證方式與結果見 iteration-17（DEV：OpenCap LabValidation 5 鏡頭；HELD-OUT：sync_2-cameras 只做最後一次檢查）。限制：MediaPipe Lite 在 5 Hz 側面深蹲最低點常把髖點放到腰上方（2D 本身就錯），混合式 3D 無法修正；VIDEO 模式的內建平滑讓點位落後約 0–80 ms。
