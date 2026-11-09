# CLC SR Portal｜YA 視覺統一 × 共用歌詞 × SR 權限管理（2026-11-09）

此版根據原始 `clc-sr-portal-main.zip` 及上一版 SR Portal 完整包製作。**SR 與 YA 的 Repository、Firebase 專案、Superuser 與業務資料仍獨立。** SR 的歌詞 iframe 只讀取 YA 主站唯一的中性歌詞系統。

## 主要更新

- **首頁**：與 YA 相近的暗／亮主題、置中標題、雙欄方形功能卡，完整保留原 SR 的「新朋友關懷／組員通訊錄／牧區與小組／權限管理」，加上「詩歌歌詞下載」。五個入口都可以點擊。
- **三個尚未開發的 SR 功能**：原始 ZIP 沒有 `intakes.html`、`members.html`、`groups.html`，本次先製作「尚未開放」頁防止 404，沒有假裝完成業務功能，也沒有寫入任何資料。
- **歌詞工具**：`hymn-lyrics.html` 移除重複的「詩歌歌詞下載／在原站開啟」工具列，SR Header 正下方直接顯示 YA 中性歌詞 iframe。日後 YA 更新，SR 不必更新歌曲工具的核心程式。
- **SR Icon**：用使用者提供的 YA `favicon.svg` 作為比例、填色與留白參考，另製作真正向量輪廓的 SR `favicon.svg`，以及 192px／512px／Apple 圖示。無需轉存字型檔。
- **權限後台**：`admin-users.html` 參考 YA 的緊湊管理介面，SR 保留四種角色 `admin`、`district_leader`、`group_leader`、`viewer`。可預先新增 Google Email、啟停、調整角色／範圍、移除授權、保護固定初始 Superuser。
- **修正舊版預授權問題**：新方案使用 `user_invites/{email}` 寫入預先授權，首次 Google 登入後安全建立 `users/{uid}`。管理員修改角色會同步兩份資料。舊版 `users/user_...` 的授權會在後台顯示，可點「套用舊授權」轉接；不會自動刪除舊資料。
- **登入錯誤提示**：如果 SR 原始 Firebase Web Config 仍是佔位符，顯示明確的未設定提醒，而不再試圖用無效 API Key 登入。

## 必須先完成的兩項遠端設定（此 ZIP 不會自動部署）

### A. 補入真正的 SR Firebase Web Config

原始 ZIP 只有 `YOUR_FIREBASE_API_KEY`、`YOUR_MESSAGING_SENDER_ID` 和 `YOUR_APP_ID`，本次**無法憑空產生有效設定**，亦不可把 YA Config 當 SR 的。

請到 SR Firebase Console → 專案設定 → 一般 → Web 應用程式，取得 `firebaseConfig`，填入 **`header.js` 最上方**；並在 Firebase Authentication 開啟 Google Provider、核對 Authorized Domains 包含 `clc-sr-portal.pages.dev`。Firebase Web Config 是公開設定資訊，不是服務帳號私鑰。

### B. 將本包的 `firestore.rules` 正確部署到 SR 專案

新的 `user_invites` 功能與 UID 自動建檔需要新版規則，只有上傳 `firestore.rules` 到 GitHub **不等於已發布到 Firebase**。

可以在 Firebase Console 的 Firestore Rules 編輯器中，先備份線上現有規則、比對差異、再貼上並發布。若使用 Firebase CLI，應**明確指定 SR 專案**與已驗證的 `firebase.json` 路徑；使用 CLI 部署整份 Rules 會覆寫 Console 中目前已存在的規則。部署前先測試初始管理員、一般 Viewer 與未授權帳號。

## 部署順序

1. 備份 SR 線上 Firebase Rules 及 GitHub 目前檔案。
2. 在 `header.js` 填入 **SR 自己** 的 Firebase Web Config。
3. 在 SR Firebase Console 測試／發布新的 `firestore.rules`。
4. 將本 ZIP 的檔案上傳至 SR GitHub Repository 根目錄並 Commit；Cloudflare Pages 應從原連線的 Repository 自動部署。
5. 測試：SR 初始 Superuser 登入、預先授權 Email、其他同工首次登入、角色修改／停用／移除、五個首頁連結、歌詞 iframe、手機列印與 PPTX 下載。

## 安全與 iframe 注意事項

- SR Header 登入與 YA 歌詞 iframe 的 Firebase Auth 仍各自獨立。SR Admin 不會自動成為 YA 歌詞 Admin。
- YA 主站如使用禁止 iframe 的 CSP／X-Frame-Options，SR 歌詞頁會被阻擋。請先在 YA 站**只放行 SR 網域**，不要開放任何網站嵌入。必要時直接開啟 `https://clc-ya-portal.pages.dev/hymn-lyrics?neutral=1`。
- 部分手機瀏覽器限制跨網域 iframe 的下載、列印與第三方登入儲存；上線後應實機測試。
- 此 ZIP 僅完成程式與本地模擬，**沒有登入你的 Firebase／Cloudflare，也沒有發布任何線上設定**。
