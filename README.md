# CLC SR 加樂團契小組管理系統 (V2.0 初始版本)

本系統專為「加樂團契」量身打造，具備長輩友善（大字體、高對比、超大觸控卡片）、4 級極簡權限（全開 Admin、區長、小組長、唯讀同工）及最高標準資料安全架構。

---

## 專案包含檔案清單
1. `index.html`：加樂團契控台首頁（長輩大字體卡片式入口）
2. `header.js`：共用頂部導航、Google 登入驗證、深淺主題切換、權限監聽
3. `admin-users.html`：Admin 專屬「4 級帳號與角色權限管理後台」
4. `admin-users.js`：管理員開通同工、指派牧區小組、啟停帳號之執行邏輯
5. `firestore.rules`：Firestore 安全規則（落實 Admin 全開、區長管牧區、小組長管小組）
6. `favicon.svg`：加樂團契專屬品牌向量圖示 (CLC SR)

---

## 部署流程說明

### 步驟一：建立與設定 Firebase 專案
1. 前往 [Firebase Console](https://console.firebase.google.com/)，點擊「新增專案」，命名為例如 `clc-sr-portal`。
2. 進入專案後，依序啟用：
   - **Authentication**：在「Sign-in method」啟用 **Google** 登入供應商。
   - **Firestore Database**：點擊「建立資料庫」，位置建議選擇台灣或鄰近區域（如 `asia-east1` 或 `asia-east2`）。
3. 進入 Firestore 的「**Rules（規則）**」分頁，將本壓縮包中的 `firestore.rules` 內容完整複製貼上，點擊「**發布 (Publish)**」。
4. 進入專案設定（Project Settings），在「一般」分頁往下滑點擊「新增網頁應用程式 (</>)」，複製 `firebaseConfig` 物件中的金鑰與 ID。
5. 開啟本專案的 `header.js`，將最上方的 `window.firebaseConfig` 替換為您專屬的 Firebase 金鑰！

### 步驟二：建立 GitHub Repository 並上傳程式碼
1. 在 GitHub 建立一個全新的公開或私有儲存庫（Repository），例如 `clc-sr-portal`。
2. 將本 ZIP 包解壓縮後的所有檔案（`index.html`, `header.js`, `admin-users.html`, `admin-users.js`, `favicon.svg`, `firestore.rules`）Commit 並 Push 至 GitHub 主分支（`main`）。

### 步驟三：部署至 Cloudflare Pages
1. 登入 [Cloudflare Dashboard](https://dash.cloudflare.com/)。
2. 點擊側邊欄 **Workers & Pages** -> **Create application** -> **Pages** -> **Connect to Git**。
3. 選擇剛才建立的 GitHub Repository (`clc-sr-portal`)。
4. 設定建置參數：
   - **Framework preset**：選擇 `None`
   - **Build command**：留空（純前端靜態站台）
   - **Build output directory**：留空或輸入 `/`
5. 點擊 **Save and Deploy**，大約 15 秒即可取得正式公開網址（例如 `https://clc-sr-portal.pages.dev`）。
6. **重要授權網域設定**：複製您的 Cloudflare 網址，回到 Firebase Console -> Authentication -> Settings -> **Authorized domains（已授權網域）**，將您的 Cloudflare 網址加入白名單，Google 登入即可正常運作！
