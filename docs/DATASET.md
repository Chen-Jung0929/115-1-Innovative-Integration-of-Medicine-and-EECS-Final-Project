# Dataset provenance and usage register

## 指定候選來源

- Title: A Multi-View Raw Video Dataset of Seven Fitness Exercises with Good/Bad Form Labels
- Landing page: https://data.mendeley.com/datasets/kgbb3yn47p/1
- Dataset version: V1
- DOI: https://doi.org/10.17632/kgbb3yn47p.1
- 優先候選：Bodyweight Squat，Side View MP4。

以上名稱、版本與動作資訊來自 Project Charter。2026-11-16 在本環境讀取 landing page
回傳 HTTP 403；尚未獨立核對作者、檔案結構、授權條款或影片內容。
**授權狀態：待查核。** 不推定為 CC 授權；能公開下載也不代表能任意再散布。
使用前須保存正式授權名稱、條款 URL／版本、歸屬要求、研究使用與衍生資料限制。
若 403 持續，由團隊透過正式網站核對並記錄證據，不繞過存取限制。

## 實際使用紀錄

目前下載 0、分析 0 部影片；沒有選定或捏造檔名。完成授權查核後才取得影片。
後續每個實際檔案須登錄：

| 欄位 | 內容要求 |
| --- | --- |
| source_id | 不含個資的穩定 ID |
| version / DOI / source URL | 固定 V1 與檔案來源，不使用浮動 latest |
| original relative filename | 核對後的資料集內路徑；不得包含本機私人路徑 |
| exercise / view / form label | 來源標籤；無法確認則標 unknown |
| checksum / bytes | SHA-256 與檔案大小 |
| dimensions / duration / frame timing | 實測尺寸、長度、FPS／VFR 資訊 |
| license / evidence / acquired date | 條款與核對來源、取得日期 |
| selection / exclusions | 選樣原因與遮蔽等排除理由 |
| usage | 對應 iteration、分析版本及受限輸出位置 |

資料留在 ignored data/ 或核准的受限儲存空間；public repo 只放允許公開且不識別個人的
來源紀錄。Good/Bad Form 是動作品質分類，**不是逐影格角度 ground truth**。
本資料集沒有已提供的逐影格真實角度標註；後續人工影像標註只能作為明確定義的 2D 參考。

## Task 2 狀態（2026-11-16）

本次再次讀取同一 landing page，CONNECT tunnel 回傳 HTTP 403（環境 egress policy）。
沒有下載、解壓或分析指定資料集，亦未改用來源不明影片／模型。實際使用紀錄仍為 0。
瀏覽器測試只以 FFmpeg 產生 1 秒藍色、無人體的合成 MP4 測試解碼／seek，
並以明確標示的模擬姿態測試軟體整合；不是 Squat 資料集或人體推論驗證。
待官方模型與核准影片可取得後，以來源／SHA-256／尺寸／授權紀錄填寫上方登錄表再驗收。
