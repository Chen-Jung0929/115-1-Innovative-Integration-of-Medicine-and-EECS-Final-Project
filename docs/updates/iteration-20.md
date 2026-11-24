# 第 20 輪：分析畫面的響應式排版

頁首、主內容與頁尾共用水平邊界。內容寬度上限由 1240px 調整為 112rem（預設字級時為 1792px）。從 1200px 起，影片與角度讀數依 1.8 比 1 分配欄寬，曲線使用整張卡片。820px 以下沿用單欄操作順序。

影片與鏡頭元件只把既有來源寬高比傳給 CSS。當可用高度較少時，畫面和疊圖一起縮窄並置中。在 1920 × 1080 下以相同的 640 × 360 合成影片比對，影片寬由 640 增至 1103px、讀數欄由 439 增至 613px、曲線由 1162 增至 1746px。

## 實際截圖與尺寸

以下為 Chrome 完整頁面截圖，使用合成 MP4、模擬鏡頭與可重現的姿態測試資料。表格中的顯示寬度以 CSS 像素計算，四捨五入至整數。

| 測試視窗 | 影片／讀數欄／曲線寬度 | 影片分析截圖 | 即時鏡頭截圖 |
| --- | --- | --- | --- |
| 390 × 844 | 332／332／332 | [影片 390px](iteration-20-screenshots/video-390.webp) | [鏡頭 390px](iteration-20-screenshots/camera-390.webp) |
| 768 × 1024 | 640／690／690 | [影片 768px](iteration-20-screenshots/video-768.webp) | [鏡頭 768px](iteration-20-screenshots/camera-768.webp) |
| 1024 × 768 | 564／353／937 | [影片 1024px](iteration-20-screenshots/video-1024.webp) | [鏡頭 1024px](iteration-20-screenshots/camera-1024.webp) |
| 1440 × 900 | 844／469／1336 | [影片 1440px](iteration-20-screenshots/video-1440.webp) | [鏡頭 1440px](iteration-20-screenshots/camera-1440.webp) |
| 1920 × 1080 | 1103／613／1746 | [影片 1920px](iteration-20-screenshots/video-1920.webp) | [鏡頭 1920px](iteration-20-screenshots/camera-1920.webp) |

## 檢查與限制

- 五種視窗、兩種模式下，頁寬均等於視窗寬度，影片維持來源比例，影片、顯示容器與骨架 canvas 的位置及寬高差均小於 1 CSS 像素。鏡頭影片與 canvas 使用相同鏡像轉換。兩種模式皆可看到骨架像素、角度讀數及曲線。
- 新增 Playwright 回歸測試，涵蓋橫式與直式 MP4 在這五種寬度下的疊圖邊界、比例與水平溢出。
- `npm ci`、`npm run typecheck` 通過。單元測試 `npm test` 通過 41 個測試檔、286 個測試。使用 Pages 子路徑的 `npm run build` 通過，仍有既有的 bundle 大小提示。
- `npm run test:browser` 通過 35 個測試；另有 2 個需核可真人影片的既有測試依條件略過。
- 實體手機、平板、鏡頭及 Safari 的裝置驗收待團隊執行。本次截圖用於檢查排版與疊圖對齊，人體量測準確度需另行驗證。
