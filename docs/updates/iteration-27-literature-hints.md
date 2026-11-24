# 第 27 輪：依文獻調整拍攝建議、補暫定門檻、手動指定檢查方式（ADR-098）

協調者整理兩篇文獻後交辦：拍攝角度與服裝建議（Panni et al. 2026）、FMS 過頭深蹲的判斷規則（SOMA 2025）。文獻名稱只寫在文件與 ADR，畫面上不出現。

## 改動

| 模組 | 內容 |
|---|---|
| `src/app/shootingTips.tsx` | 共用「怎麼拍最準」：膝、髖彎曲與上身前傾從正側面拍（鏡頭在髖部高度、與身體成直角）；膝往內、骨盆歪斜從正面拍；穿貼身長褲或短褲；鏡頭固定、全身入鏡、只有一人。上傳頁選影片前顯示，之後收進摺疊區；即時鏡頭只顯示正側面、服裝、入鏡三則。斜角提示框加「膝、髖角度請改從正側面拍」。 |
| `src/biomechanics/frontal.ts` | `shinTilt`：腳踝→膝與畫面垂直夾角，+ = 膝在腳踝內側（以另一側髖決定內側，與鏡像無關）。 |
| `src/biomechanics/lateral.ts` | `hipDepth`：靠鏡頭側髖低於膝多少（小腿長）。 |
| `src/motion/frontalCues.ts` | `CUE_POLICY` 新增 `shinValgusDeg` 3°、`trunkTibiaMarginDeg` 0°、`trunkTibiaMinKneeFlexionDeg` 90°、`hipBelowKneeShank` 0；既有門檻都沒改。小腿內斜併入既有膝往內提示；蹲到底時「上身比小腿更往前倒」；`deepEnough` 給「✓ 蹲得夠深」。 |
| `src/motion/frontalTimeline.ts` | `ViewChoice`（自動／正面／側面），手動優先；每格多 `manual`。 |
| `src/visualization/FrontalOverlay.tsx`、`src/app/App.tsx` | 「檢查方式」選單、手動指定說明、無法用正面檢查的提示、蹲得夠深。 |
| 文件 | 新增 `docs/angle-definitions.md`（每個門檻的依據欄）、ADR-098、README。 |

## 檢查

- `npm run typecheck` 通過；`npm test` 44 個測試檔、328 個測試通過（新增：小腿內斜幾何與鏡像、提示門檻與邊界、既有門檻未變、上身—小腿只在蹲到底判斷（含 90° 邊界）、髖低於膝、手動檢查方式、提示框文字、拍攝建議文字不含文獻名稱）；`npm run build` 通過（既有 bundle 大小提示）。
- `npx playwright test`：本機沒有 ffmpeg、Playwright 瀏覽器，改用本機 Chrome 時 5 個失敗、34 個未執行；切回 main 跑同一測試結果相同，屬環境問題，未在 CI 以外驗證。
- 用模擬姿勢（非真人）在實際畫面截圖確認提示文字與版面（含 390 px 寬）。
- 經獨立 agent 審核兩輪：第 1 輪通過但指出上身—小腿規則在下蹲途中會誤報、新 UI 缺測試、即時頁顯示了不適用的正面建議等，修正後第 2 輪通過。

## 限制

- 新門檻皆暫定；3° 在 2D 上很敏感（鏡頭滾轉會影響），上身—小腿 0° 容許在蹲到底時仍可能常出現，未用真人影片驗證誤報率。
- 「腳跟抬起」沒有實作（需站直基準與醫學組門檻）。
- 即時鏡頭仍未接上姿勢檢查。

## 下一步

- 請醫學組確認 3°、0°、90° 與是否採用這些規則。
- 用真人正面／側面深蹲影片量誤報率。
