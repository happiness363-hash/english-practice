# 英文慢慢說

英文單字與發音練習網站，內含第 01–05 課及 2-1，共 81 個不重複詞語。支援音標、語音朗讀、課程篩選與 JSON 匯入匯出。

## 本機與部署

使用 Node.js 安裝相依套件：`npm install`。

登入 Cloudflare：`npx wrangler login`。

本機預覽：`npm run dev`。部署：`npm run deploy`。

部署採 Cloudflare Workers，以文字模組載入 index.html，設定為 wrangler.jsonc。

公開網址：https://english-practice.happiness363-english.workers.dev

## 資料

公開頁面提供 81 詞範例。登入後的字庫由 Cloudflare D1 保存，新增、編輯與 JSON 匯入均透過受 Cloudflare Access 保護的 API 儲存。登入使用 Email 驗證碼；允許的帳號在 Access 政策中設定。

不同裝置登入後讀取同一份字庫，可按「重新整理雲端」取得最新內容。寫入使用版本檢查，遇到其他裝置已修改時拒絕覆寫，並提供未儲存草稿下載。離線時無法修改雲端資料。

原 file:// 網頁的個人資料需先匯出 JSON，再於新網址登入後匯入。語音由裝置與瀏覽器提供。

## 自動部署與資料庫

Cloudflare Workers Builds 連接本 GitHub 倉庫的 main 分支，推送後執行 `npx wrangler deploy`。資料庫與 Access 設定已建立；程式部署不會重新匯入種子或覆寫字庫。

`schema.sql` 是建表語法；`seed.json` 是初始 81 詞。請勿在每次部署時重新寫入種子。`node check-cloud.mjs` 驗證 JWT、資料庫讀寫、版本衝突與跨來源寫入防護。

使用 Workers Free 與 D1 Free；沒有啟用付費方案。需持續留意 Cloudflare 免費用量限制。
