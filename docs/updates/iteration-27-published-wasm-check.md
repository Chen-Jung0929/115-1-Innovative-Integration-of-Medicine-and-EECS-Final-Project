# 第 27 輪：修正部署後的線上網站檢查

## 問題
部署後的「Verify published site and revision」從 PR #12 起每次都失敗：檢查 MediaPipe wasm 檔前 8 個位元組時讀到空的。

## 原因
GitHub Pages 會把 `.wasm` 用 gzip 壓縮後傳送，而且 `Range: bytes=0-7` 是套在「壓縮後」的資料上（`Content-Range: bytes 0-7/4217437`，回傳的是 gzip 標頭 `1f8b...`）。Playwright 收到 8 個位元組的 gzip 片段無法解壓，所以 body 變成空的。實際檔案正常：不帶 Range 時解壓後 14,665,716 位元組，開頭是 `\0asm`。

## 修正
`quality/site.ts` 抓 MediaPipe 的 wasm／js 檔時加上 `Accept-Encoding: identity`，要求未壓縮的原始檔，前 8 個位元組就會是 `0061736d01000000`。本機預覽（`vite preview`）本來就不壓縮，行為不變。

## 檢查
- 線上網站 `build-revision` = main 最新 commit（d08acb0）
- 帶 `Accept-Encoding: identity` 的 Range 請求回 206、開頭 `\0asm`（兩個 wasm 檔都是）
- 本機 `npm run test:smoke` 4/4 通過；完整的 `published.spec.ts` 要合併、部署後才會在 GitHub 上跑
