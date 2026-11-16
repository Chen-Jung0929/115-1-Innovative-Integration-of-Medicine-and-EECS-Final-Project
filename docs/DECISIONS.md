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
