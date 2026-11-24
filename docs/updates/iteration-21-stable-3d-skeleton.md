# 第 21 輪：3D 骨架不再飛起來

## 問題
使用者回報 3D 骨架常「飛起來」。用本機資料集 10 支深蹲影片（subject 001/002/003/005，正面／側面／斜角，Python MediaPipe Full 取 landmarks 後跑同一套 `liftClip`）重現：

- 整段影片只用一個地板高度，但每格腳的高度會漂：腳最多離地 59 cm（003 斜角開頭，腳只有部分入鏡），003 側面 105 / 235 格離地超過 10 cm，005 正面 69 / 228 格。
- 逐格（即時）版本的腳鎖定會讓身體前後滑動到離格線中心約 1 m。

## 改動（ADR-090）
- `src/motion/world3d.ts` 新增 `groundForDisplay`：每格把最低腳點放回地板、兩腳踝中點放回格線中心。腳畫平＋平移，膝／髖角度不變。
- 每隻腳畫成平的（腳跟、腳尖取較低的高度）：第一版交付後使用者指出「腳還是不在地面上」，原因是模型常把腳估成腳尖朝下 30–60°（像踮腳）。
- `src/visualization/bones.ts`：骨頭模型的腳底和腳點對不齊（差 0.5–11 cm），每格把整副骨頭移到最低腳骨頂點碰地板。
- 兩種模式腳下都畫陰影（橢圓，沿腳跟→腳尖）。
- `src/visualization/Skeleton3D.tsx` 的骨頭與線條兩種畫法都用這個顯示用姿勢。
- 經另一個 agent 獨立審核截圖與程式（審核意見：陰影太淡、文件要更新、NaN 檢查，均已修正）。
- 新增單元測試：浮起 0.4 m、偏移 1 m 的骨架會被放回地板中心，膝／髖 3D 角度與骨盆相對腳的高度完全相同。

## 站直時前傾（ADR-091）
第二版交付後使用者指出站直時骨架仍明顯前傾。沒有手機傾角時，骨架的「上」跟著鏡頭；改用整段影片最伸直的畫面當站直，把腳踝→肩膀轉成垂直（整段同一個旋轉，角度不變）。

| 影片 | 修正角度 | 站直傾斜（改前） | 站直傾斜（改後） |
| --- | --- | --- | --- |
| subject_001_squat_good_diagonal | 22.3° | 22.4° | 0.9° |
| subject_001_squat_good_front | 18.2° | 18.2° | 0.5° |
| subject_001_squat_good_side | 20.6° | 20.6° | 1.3° |
| subject_002_squat_good_diagonal | 14.7° | 14.8° | 1.1° |
| subject_002_squat_good_front | 20.4° | 20.4° | 1.6° |
| subject_003_squat_bad_diagonal | 16.7° | 17.0° | 1.3° |
| subject_003_squat_bad_front | 14.9° | 14.9° | 1.5° |
| subject_003_squat_bad_side | 17.1° | 16.9° | 1.8° |
| subject_005_squat_bad_diagonal | 18.0° | 18.0° | 1.0° |
| subject_005_squat_bad_front | 18.5° | 18.5° | 0.8° |

## 結果（離地 cm／骨盆離中心 cm，改前 → 改後）

| 影片 | 模式 | 腳離地最大 | 骨盆離中心最大 | 骨盆上下步距中位數 |
| --- | --- | --- | --- | --- |
| subject_001_squat_good_diagonal | 影片 | 8 → 0 | 27 → 36 | 6.2 → 5.9 |
| subject_001_squat_good_diagonal | 即時 | 8 → 0 | 31 → 37 | 6.8 → 5.8 |
| subject_001_squat_good_front | 影片 | 8 → 0 | 27 → 27 | 6.4 → 6.1 |
| subject_001_squat_good_front | 即時 | 8 → 0 | 35 → 28 | 6.6 → 6.1 |
| subject_001_squat_good_side | 影片 | 12 → 0 | 40 → 36 | 6.2 → 6.0 |
| subject_001_squat_good_side | 即時 | 17 → 0 | 106 → 38 | 6.1 → 5.2 |
| subject_002_squat_good_diagonal | 影片 | 10 → 0 | 21 → 19 | 4.9 → 4.3 |
| subject_002_squat_good_diagonal | 即時 | 5 → 0 | 27 → 21 | 5.2 → 4.2 |
| subject_002_squat_good_front | 影片 | 11 → 0 | 26 → 24 | 3.5 → 3.8 |
| subject_002_squat_good_front | 即時 | 25 → 0 | 32 → 27 | 3.2 → 3.7 |
| subject_003_squat_bad_diagonal | 影片 | 59 → 0 | 18 → 22 | 6.5 → 6.3 |
| subject_003_squat_bad_diagonal | 即時 | 33 → 0 | 31 → 22 | 7.0 → 6.2 |
| subject_003_squat_bad_front | 影片 | 8 → 0 | 16 → 14 | 6.6 → 6.4 |
| subject_003_squat_bad_front | 即時 | 7 → 0 | 16 → 15 | 7.2 → 6.3 |
| subject_003_squat_bad_side | 影片 | 33 → 0 | 42 → 33 | 6.4 → 6.0 |
| subject_003_squat_bad_side | 即時 | 17 → 0 | 101 → 39 | 6.8 → 6.4 |
| subject_005_squat_bad_diagonal | 影片 | 14 → 0 | 34 → 30 | 3.4 → 2.6 |
| subject_005_squat_bad_diagonal | 即時 | 9 → 0 | 47 → 33 | 3.5 → 2.4 |
| subject_005_squat_bad_front | 影片 | 17 → 0 | 28 → 28 | 3.4 → 2.7 |
| subject_005_squat_bad_front | 即時 | 10 → 0 | 34 → 31 | 3.3 → 2.6 |

（「影片」= 上傳影片用的整段 lift；「即時」= `createCausalLifter`，目前畫面沒用到，列出供參考。）

瀏覽器實測（Chromium + Lite 模型，005 正面影片，側面視角）：改前骨架在部分格子浮在格線上方，改後腳都踩在格線上，膝角讀數完全相同。

## 檢查
- `npm run typecheck` 通過；`npm test` 41 個測試檔、287 個測試通過；`npm run build` 通過；`npm run test:browser` 35 通過、2 個既有條件略過。

## 限制與下一步
- 跳躍動作不會顯示離地。
- 側面拍攝時前後深度仍是模型估計，上半身偶爾前後晃（與本次無關，未處理）。
- 測試中 003 側面影片（Lite 模型）2.3 秒起被判為「畫面跳動或換了人」、003 斜角（348×624）偵測不到人，屬追蹤問題，另案。
