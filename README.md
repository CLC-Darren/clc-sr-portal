# CLC SR Portal｜YA 同款介面 × 共用歌詞試行版（2026-11-09）

本包以使用者提供的 `clc-sr-portal-main.zip` 為基礎，**完整保留 SR 原有 Firebase 專案、使用者與權限管理資料結構**，將首頁與 Header 對齊 YA 的介面模式。SR 和 YA 依舊是**不同 GitHub Repository、不同 Firebase 專案、不同 Admin**。

## 已完成

- **SR 首頁**：YA 同款精簡頂部 Header、CLC SR Logo、深淺切換、登入／角色選單、置中標題及 2×2 正方形功能卡片，適用手機和電腦。
- **功能入口**：只開放「🎵 詩歌歌詞下載」，另外三個 `＋` 僅顯示預留位置，不連到尚未開發的檔案。SR Admin 仍從 Header 登入後的權限選單進入。
- **共用歌詞頁**：SR 新增 `/hymn-lyrics.html`，上方顯示 **SR 自己的 Header**，下方 iframe 指向 `https://clc-ya-portal.pages.dev/hymn-lyrics?neutral=1`。未複製 YA 歌詞程式或資料庫，因此 YA 主站更新，SR 下次載入便取得新版本。
- **回退入口**：右上角「在原站開啟」可直接用新分頁開啟 YA 中性版，供 iframe 不允許顯示或手機列印／下載不順時使用。
- **PWA 基礎**：新增 SR 專屬 manifest、192/512 圖示、Apple icon、安裝入口；Service Worker **不快取**使用者、歌詞、登入或管理資料。
- **保留原後台**：`admin-users.html`、`admin-users.js`、`firestore.rules`（其中後兩者未修改），SR 的 Admin／區長／小組長／Viewer 角色邏輯不變。

## 最重要：部署前核對 SR Firebase 設定

使用者提供的原 ZIP 中，`header.js` 的 `window.firebaseConfig` 仍是：

```
apiKey: "YOUR_FIREBASE_API_KEY"
messagingSenderId: "YOUR_MESSAGING_SENDER_ID"
appId: "YOUR_APP_ID"
```

**這份更新包刻意原樣保留占位符，因為我們沒有你實際 SR Firebase Web App 的值，不能憑空填入或拿 YA 的設定取代。**

如果線上 SR 曾經設定過真實 Firebase，部署時請先從目前 GitHub SR `header.js` 把 `window.firebaseConfig` 的真實欄位複製到此包新版 `header.js`；其他登入／角色相關程式則維持新版。若尚未設定，請先到 SR Firebase Console → Project Settings → Web App 取得設定，填妥後再部署。不要把 YA Firebase Config 貼到 SR。

SR Google 登入還需確保 Firebase Authentication 已啟用 Google 供應商，且 Authorized Domains 包含 `clc-sr-portal.pages.dev`。`firestore.rules` 本包不重新發布；如 SR 尚未設定，請依原有權限模型自行部署。

## 如何更新 GitHub

1. 將本 ZIP 解壓縮，**內部檔案直接放 Repository 根目錄**（不要再多包一層資料夾）。
2. **先核對上述 Firebase Config**，再將檔案上傳到 `clc-sr-portal` Repository（或你目前 SR 實際使用的 Repository）。
3. 保留現有 `admin-users.js` 和 `firestore.rules`；不要拿 YA 的登入 JS 或規則覆寫。
4. GitHub Commit 後由 Cloudflare Pages 自動部署。進入 SR 首頁點「詩歌歌詞下載」驗證。

## iframe 的真實限制

- iframe 外的 **SR Header 登入 ≠ iframe 內的 YA 登入**；兩站 Firebase 仍各自管理。中性模式會隱藏 YA Header，但不能讓 SR 的登入自動取得 YA 的權限。
- **管理歌詞**仍使用 YA 原有管理後台。SR 使用者不因為是 SR Admin 就自動取得 YA 歌詞編輯權限。
- 瀏覽器可能限制第三方 Cookie／登入儲存、iframe 內列印、PDF 或 PPTX 下載；YA 端若設定禁止 iframe 的 `X-Frame-Options` 或 CSP `frame-ancestors`，嵌入也可能被擋。此包無法替 YA 網站修改這些安全政策。
- 如果 iframe 無法顯示，請使用已預留的「在原站開啟」。若確認為安全政策問題，需在 YA 主站做**明確且限縮到 SR 網域**的允許設定，不建議放開任意網站嵌入。
- 正式網域嵌入及手機列印需部署後實測；本包已完成靜態路由、桌面／手機版型與程式檢查，但不聲稱已線上測得跨站嵌入成功。

## 檔案結構

```
index.html             # SR 首頁（YA 同款 2×2）
header.js              # SR 共用 Header、獨立 Firebase 登入與權限
hymn-lyrics.html       # SR 歌詞 iframe 容器（唯一 YA 來源）
admin-users.html       # SR 管理員頁（保留業務）
admin-users.js         # 原版未修改
firestore.rules        # 原版未修改
favicon.svg            # 原版 SR 標誌
manifest.json          # SR PWA
portal-pwa.js          # PWA 安裝入口
sw.js                  # 不快取資料的 service worker
icon-192.png
icon-512.png
apple-touch-icon.png
README.md
```

後續可以用相同的「SR Header＋共用 App iframe」模式新增其他功能，不需要改變現有 Firebase 的資料分工。
