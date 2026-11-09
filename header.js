/**
 * CLC YA Portal - 共用 Header 元件 (header.js)
 * 統一管理全站頂部導航、登入驗證、深淺主題、管理員下拉選單與登記時間全域設定
 */

window.ADMIN_WHITELIST = [
  "darren710404@gmail.com",
  "darren.lin@twclc.org"
];

// 將使用者輸入的文字放進 innerHTML 前必須先跳脫，避免被植入惡意程式碼。
window.clcEscapeHtml = function(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
};

window.firebaseConfig = {
  apiKey: "AIzaSyDAEOzDZQ4afNc4dWl2XuF9a-1x9Z1LeUA",
  authDomain: "clc-ya-portal.firebaseapp.com",
  projectId: "clc-ya-portal",
  storageBucket: "clc-ya-portal.firebasestorage.app",
  messagingSenderId: "503602694661",
  appId: "1:503602694661:web:3cc621cd62a21c50556a6c",
  measurementId: "G-GVLHE1PT24"
};

// 初始化 Firebase (保證只初始化一次)
if (!firebase.apps.length) {
  firebase.initializeApp(window.firebaseConfig);
}
window.auth = firebase.auth();
window.db = firebase.firestore();
window.auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

window.isAdmin = false;
window.currentAdminEmail = "";
window.currentAdminRole = "";
window.isSuperuser = false;
window.isViewer = false;
window.canViewAdmin = false;
window.configStartDay = 20;

// 在獨立 PWA 視窗內避免視窗標題顯示「網頁 title - App name」兩次。
// 一般瀏覽器分頁仍使用原本的完整標題。
if (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) {
  document.title = '';
}

// 取得當前頁面類型
function getCurrentPageType() {
  const path = window.location.pathname.toLowerCase();
  if (path.includes('admin-users')) return 'admin-users';
  if (path.includes('admin-venues')) return 'admin-venues';
  if (path.endsWith('/hymn-lyrics.html')) return 'hymn-lyrics';
  if (path.endsWith('/admin-hymns.html')) return 'admin-hymns';
  if (path.includes('venue')) return 'venue';
  if (path.includes('signup')) return 'signup';
  if (path === '/' || path.endsWith('/index.html')) return 'index';
  return 'other';
}

// 建立並注入 Header HTML
function renderHeaderComponent() {
  const headerContainer = document.getElementById('clc-header') || document.querySelector('header');
  if (!headerContainer) return;

  // 固化頂部 Header 的專屬固定樣式，徹底避免不同頁面 html font-size 造成的放大縮小
  if (!document.getElementById('clc-header-fixed-style')) {
    const style = document.createElement('style');
    style.id = 'clc-header-fixed-style';
    style.textContent = `
      #clc-header { box-sizing: border-box !important; border-bottom-width: 1px !important; }
      #clc-header > div { max-width: 1024px !important; height: 46px !important; min-height: 46px !important; padding-left: 14px !important; padding-right: 14px !important; box-sizing: border-box !important; display: flex !important; align-items: center !important; justify-content: space-between !important; }
      #clc-header > div > a { display: flex !important; align-items: center !important; text-decoration: none !important; }
      #clc-header > div > a > div { font-size: 13.5px !important; height: 34px !important; line-height: 34px !important; box-sizing: border-box !important; padding: 0 12px !important; border-radius: 9px !important; letter-spacing: 0.05em !important; font-weight: 800 !important; }
      #clc-header > div > div { gap: 6px !important; display: flex !important; align-items: center !important; }
      #clc-header > div > div > * + * { margin-left: 0 !important; }
      #clc-header #adminLoginBtn,
      #clc-header button[aria-label="切換深淺模式"],
      #clc-header a[title="小組聚會登記"],
      #clc-header a[title="查看場地總表"] { width: 34px !important; height: 34px !important; min-width: 34px !important; border-radius: 9px !important; font-size: 15px !important; padding: 0 !important; display: inline-flex !important; align-items: center !important; justify-content: center !important; }
      #clc-header #installAppBtn { height: 34px !important; box-sizing: border-box !important; font-size: 12px !important; padding: 0 10px !important; border-radius: 9px !important; }
      #clc-header #adminActiveDot { width: 7px !important; height: 7px !important; top: 6px !important; right: 6px !important; }
      /* 以 venue.html (root 15px) 為基準：所有頁面共用相同下拉選單像素尺寸，避免 index.html root 19px 的 rem 放大。 */
      #clc-header #adminDropdown,
      #hymnPageDropdown {
        width: 210px !important;
        margin-top: 7.5px !important;
        padding-top: 7.5px !important;
        padding-bottom: 7.5px !important;
        border-radius: 11.25px !important;
      }
      #clc-header #adminDropdown > a,
      #clc-header #adminDropdown > button,
      #hymnPageDropdown > a {
        padding: 9.375px 15px !important;
        font-size: 13.125px !important;
        line-height: 18.75px !important;
      }
      #clc-header #adminDropdown #adminEmailDisplay {
        padding: 7.5px 15px !important;
        font-size: 11.25px !important;
        line-height: 15px !important;
      }
      #clc-header #adminDropdown > div:not(#adminEmailDisplay) {
        margin-top: 5.625px !important;
        margin-bottom: 5.625px !important;
      }
      @media (min-width: 640px) {
        #clc-header #adminDropdown > a,
        #clc-header #adminDropdown > button,
        #hymnPageDropdown > a { font-size: 15px !important; }
        #clc-header > div { padding-left: 20px !important; padding-right: 20px !important; height: 48px !important; min-height: 48px !important; }
        #clc-header > div > a > div { height: 36px !important; line-height: 36px !important; font-size: 14px !important; padding: 0 14px !important; border-radius: 10px !important; }
        #clc-header #adminLoginBtn,
        #clc-header button[aria-label="切換深淺模式"],
        #clc-header a[title="小組聚會登記"],
        #clc-header a[title="查看場地總表"] { width: 36px !important; height: 36px !important; min-width: 36px !important; border-radius: 10px !important; font-size: 16px !important; }
        #clc-header #installAppBtn { height: 36px !important; font-size: 13px !important; padding: 0 12px !important; border-radius: 10px !important; }
      }
`;
    document.head.appendChild(style);
  }

  const page = getCurrentPageType();

  // 導航動作按鈕 (依照頁面適應 - 本次需求移除了 header 的 venue 與 signup 動作，僅保留 index 頁面 PWA)
  let pageActionButtons = '';
  if (page === 'index') {
    pageActionButtons = `
      <button id="installAppBtn" onclick="window.triggerPwaInstall && window.triggerPwaInstall()" class="inline-flex items-center px-3.5 py-2 rounded-xl bg-slate-200/70 hover:bg-slate-300/70 dark:bg-white/5 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 border border-slate-300/60 dark:border-white/10 text-xs sm:text-sm font-semibold transition active:scale-95">
        <span class="mr-1">📲</span><span class="whitespace-nowrap">安裝</span>
      </button>
    `;
  }

  headerContainer.className = "border-b border-slate-200 dark:border-white/10 backdrop-blur-xl bg-white/70 dark:bg-[#090A0F]/70 sticky top-0 z-40";
  headerContainer.innerHTML = `
    <div class="max-w-5xl mx-auto px-4 sm:px-6 flex items-center justify-between">
      
      <!-- Logo 區塊 -->
      <a href="index.html" class="flex items-center group">
        <div class="px-3.5 py-1.5 rounded-xl bg-[#007E8A] flex items-center justify-center font-extrabold text-white text-sm sm:text-base tracking-wider shadow-sm">
          CLC YA
        </div>
      </a>

      <!-- 右側動作群 -->
      <div class="flex items-center space-x-2 relative">
        
        <!-- 管理員按鈕 (含登入後皇冠下拉選單) -->
        <div class="relative">
          <button id="adminLoginBtn" onclick="toggleAdminDropdown()" title="管理員登入 / 狀態" class="w-10 h-10 rounded-xl bg-slate-200/70 hover:bg-slate-300/70 dark:bg-white/5 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 border border-slate-300/60 dark:border-white/10 flex items-center justify-center text-sm transition relative active:scale-95">
            <span id="adminBtnIcon">🔐</span>
            <span id="adminActiveDot" class="hidden absolute top-2 right-2 w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
          </button>
          
                    <!-- ★ 管理員下拉選單：對齊指定順序與名稱 ★ -->
          <div id="adminDropdown" class="hidden absolute right-0 mt-2 w-56 bg-white dark:bg-[#161924] rounded-xl shadow-2xl border border-slate-200 dark:border-brand-border py-2 z-50 text-left">
            <div class="px-4 py-2 text-xs font-bold text-slate-400 border-b border-slate-100 dark:border-white/5 truncate" id="adminEmailDisplay">
              管理員已登入
            </div>

            <!-- 5. 權限管理 (移至頂部) -->
            <a href="admin-users.html" class="block px-4 py-2.5 text-sm sm:text-[15px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 transition">
              👤 權限管理
            </a>
            
            <div class="border-t border-slate-100 dark:border-white/5 my-1.5"></div>

            <!-- 6. 登出管理員 -->
            <button onclick="handleAdminLogout()" class="w-full text-left px-4 py-2.5 text-sm sm:text-[15px] text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 font-bold transition">
              🚪 登出管理員
            </button>
          </div>
        </div>

        <!-- 頁面專屬按鈕 -->
        ${pageActionButtons}

        <!-- 深淺模式切換 -->
        <button onclick="toggleTheme()" aria-label="切換深淺模式" class="w-10 h-10 rounded-xl bg-slate-200/70 hover:bg-slate-300/70 dark:bg-white/5 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 border border-slate-300/60 dark:border-white/10 flex items-center justify-center text-sm transition">
          <span class="dark:hidden">🌙</span>
          <span class="hidden dark:inline">☀️</span>
        </button>

      </div>

    </div>
  `;

  // 注入全域時間設定 Modal
  if (!document.getElementById('globalSettingsModal')) {
    const modalDiv = document.createElement('div');
    modalDiv.id = 'globalSettingsModal';
    modalDiv.className = "fixed inset-0 bg-black/75 backdrop-blur-sm z-50 hidden flex items-center justify-center p-4";
    modalDiv.innerHTML = `
      <div class="bg-white dark:bg-brand-surface border border-slate-200 dark:border-brand-border rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-2xl">
        <div class="flex items-center justify-between border-b border-slate-200 dark:border-brand-border pb-3">
          <h3 class="text-base font-extrabold text-slate-900 dark:text-white flex items-center">
            <span>🕒 登記開放時間設定</span>
          </h3>
          <button onclick="closeGlobalSettings()" class="text-slate-400 hover:text-white text-lg font-bold">✕</button>
        </div>
        <p class="text-xs text-slate-500 dark:text-brand-muted leading-relaxed">
          設定每個月允許同工登入填表的時間區間（預設為每月 20 號至當月底）。
        </p>
        <div class="flex items-center space-x-3 text-sm font-bold text-slate-800 dark:text-white">
          <span>每月</span>
          <input type="number" id="startDayInput" min="1" max="31" class="w-16 bg-slate-50 dark:bg-[#161924] border border-slate-300 dark:border-brand-border rounded-lg px-2 py-1.5 text-center focus:outline-none font-bold">
          <span>號，至月底開放。</span>
        </div>
        <div class="flex justify-end space-x-2 pt-2 border-t border-slate-200 dark:border-brand-border">
          <button onclick="closeGlobalSettings()" class="px-4 py-2 rounded-xl border border-slate-300 dark:border-brand-border text-xs text-slate-600 dark:text-slate-300 font-bold">取消</button>
          <button onclick="saveGlobalSettings()" class="px-5 py-2 rounded-xl bg-[#007E8A] hover:bg-[#006C77] text-white text-xs font-extrabold shadow active:scale-95">儲存設定</button>
        </div>
      </div>
    `;
    document.body.appendChild(modalDiv);
  }

  // 不再從 localStorage 推定權限：須經 Firebase Auth 驗證。

}

// 歌詞雙頁面共用的齒輪選單：沿用 YA Admin 下拉選單的像素尺寸與登入權限。
// 只在歌詞頁注入，不更動其他 YA 頁面的 Header 或選單。
function renderHymnPageMenu() {
  const gear = document.getElementById('hymnAdminGear');
  if (!gear || document.getElementById('hymnPageDropdown')) return;
  const page = getCurrentPageType();
  if (page !== 'hymn-lyrics' && page !== 'admin-hymns') return;
  gear.parentElement.classList.add('relative');
  gear.setAttribute('aria-haspopup', 'true');
  gear.setAttribute('aria-expanded', 'false');
  gear.setAttribute('aria-controls', 'hymnPageDropdown');
  const dropdown = document.createElement('nav');
  dropdown.id = 'hymnPageDropdown';
  dropdown.setAttribute('aria-label', '歌詞頁面導覽');
  dropdown.className = 'hidden absolute right-0 top-full mt-2 w-56 bg-white dark:bg-[#161924] rounded-xl shadow-2xl border border-slate-200 dark:border-brand-border py-2 z-50 text-left';
  const activeClasses = ' bg-slate-100 dark:bg-white/5';
  const linkClasses = 'block px-4 py-2.5 text-sm sm:text-[15px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 transition';
  dropdown.innerHTML = `
    <a href="hymn-lyrics.html" class="${linkClasses}${page === 'hymn-lyrics' ? activeClasses : ''}"${page === 'hymn-lyrics' ? ' aria-current="page"' : ''}>🎵 搜尋歌詞</a>
    <a href="admin-hymns.html" class="${linkClasses}${page === 'admin-hymns' ? activeClasses : ''}"${page === 'admin-hymns' ? ' aria-current="page"' : ''}>📒 歌詞管理</a>
  `;
  gear.insertAdjacentElement('afterend', dropdown);
}

function setHymnPageMenuOpen(open) {
  const menu = document.getElementById('hymnPageDropdown');
  const gear = document.getElementById('hymnAdminGear');
  if (!menu || !gear) return;
  menu.classList.toggle('hidden', !open);
  gear.setAttribute('aria-expanded', String(!!open));
  if (open) document.getElementById('adminDropdown')?.classList.add('hidden');
}

window.toggleHymnPageMenu = async function() {
  if (!window.canViewAdmin) {
    // 保留原本齒輪可啟動 Google 管理員登入的行為，但登入後改為展開選單。
    if (typeof triggerAdminLogin !== 'function') return;
    await triggerAdminLogin();
    if (!window.canViewAdmin) return;
  }
  const menu = document.getElementById('hymnPageDropdown');
  if (menu) setHymnPageMenuOpen(menu.classList.contains('hidden'));
};

document.addEventListener('click', function(event) {
  const gear = document.getElementById('hymnAdminGear');
  const menu = document.getElementById('hymnPageDropdown');
  if (gear && menu && !gear.contains(event.target) && !menu.contains(event.target)) setHymnPageMenuOpen(false);
});
document.addEventListener('keydown', function(event) {
  if (event.key === 'Escape') setHymnPageMenuOpen(false);
});

function applyAdminState(active, email, notify = true, viewer = false) {
  // active = 已授權可進入後台；viewer = 唯讀檢視者（可看後台、不可編輯）
  const viewerOnly = !!(active && viewer);
  window.isAdmin = !!active && !viewerOnly;
  window.isViewer = viewerOnly;
  window.canViewAdmin = !!active;
  window.currentAdminEmail = email;
  const superuser = window.isAdmin && window.ADMIN_WHITELIST.includes(String(email || '').toLowerCase());
  window.currentAdminRole = active ? (viewerOnly ? 'viewer' : (superuser ? 'superuser' : 'admin')) : '';
  window.isSuperuser = superuser;
  if (!active) setHymnPageMenuOpen(false);
  const icon = document.getElementById('adminBtnIcon');
  const dot = document.getElementById('adminActiveDot');
  const emailDisp = document.getElementById('adminEmailDisplay');

  if (icon && dot) {
    if (active) {
      localStorage.setItem('clc_ya_admin_email', email);
      icon.innerText = viewerOnly ? "👁️" : "👑";
      dot.classList.remove('hidden');
      if (emailDisp) emailDisp.innerText = email + (viewerOnly ? ' · Viewer（唯讀）' : (superuser ? ' · Superuser' : ' · Admin'));
    } else {
      localStorage.removeItem('clc_ya_admin_email');
      icon.innerText = "🔐";
      dot.classList.add('hidden');
      const dropdown = document.getElementById('adminDropdown');
      if (dropdown) dropdown.classList.add('hidden');
    }
  }

  if (notify) {
    window.dispatchEvent(new CustomEvent('clc-admin-changed', {
      detail: { isAdmin: window.isAdmin, isViewer: window.isViewer, canView: !!active, email: email }
    }));
  }
}

// 既有管理員保留為初始權限；新增管理員由 Firestore admin_users 管理。
window.clcIsAuthorizedAdmin = async function(user) {
  if (!user || !user.email || !user.emailVerified) return false;
  const email = user.email.toLowerCase().trim();
  if (window.ADMIN_WHITELIST.includes(email)) return true;
  try {
    const snap = await window.db.collection('admin_users').doc(email).get();
    return snap.exists && (snap.data().role === 'admin' || snap.data().role === 'viewer') && snap.data().active !== false && (!snap.data().email || snap.data().email === email);
  } catch(err) { console.warn('管理員權限讀取失敗',err); return false; }
};
// 回傳 'admin'（可編輯）、'viewer'（唯讀）或 null（無權限）。
window.clcGetAdminRole = async function(user) {
  if (!user || !user.email || !user.emailVerified) return null;
  const email = user.email.toLowerCase().trim();
  if (window.ADMIN_WHITELIST.includes(email)) return 'admin';
  try {
    const snap = await window.db.collection('admin_users').doc(email).get();
    if (!snap.exists) return null;
    const d = snap.data();
    if (d.active === false || (d.email && d.email !== email)) return null;
    return (d.role === 'admin' || d.role === 'viewer') ? d.role : null;
  } catch(err) { console.warn('管理員權限讀取失敗', err); return null; }
};
let clcAdminPermissionUnsubscribe = null;
window.auth.onAuthStateChanged(user => {
  if (clcAdminPermissionUnsubscribe) {
    clcAdminPermissionUnsubscribe();
    clcAdminPermissionUnsubscribe = null;
  }
  // 驗證過程先關閉操作權限，但不要發出暫時「未授權」事件讓後台誤跳轉。
  applyAdminState(false, '', false);
  if (!user || !user.email || !user.emailVerified) {
    applyAdminState(false, '');
    return;
  }
  const email = user.email.toLowerCase().trim();
  if (window.ADMIN_WHITELIST.includes(email)) {
    applyAdminState(true, email);
    return;
  }
  // 動態 Admin 的停用與刪除立即同步到各分頁。
  clcAdminPermissionUnsubscribe = window.db.collection('admin_users').doc(email).onSnapshot(snap => {
    if (window.auth.currentUser?.uid !== user.uid) return;
    const data = snap.exists ? snap.data() : null;
    const allowed = !!(data && (data.role === 'admin' || data.role === 'viewer') && data.active !== false && (!data.email || data.email === email));
    applyAdminState(allowed, allowed ? email : '', true, allowed && data.role === 'viewer');
  }, err => {
    console.warn('無法驗證管理員權限：', err);
    if (window.auth.currentUser?.uid === user.uid) applyAdminState(false, '');
  });
});

function toggleAdminDropdown() {
  if (window.isAdmin || window.isViewer) {
    const dropdown = document.getElementById('adminDropdown');
    if (dropdown) dropdown.classList.toggle('hidden');
  } else {
    triggerAdminLogin();
  }
}

async function triggerAdminLogin() {
  const provider = new firebase.auth.GoogleAuthProvider();
  try {
    const result = await window.auth.signInWithPopup(provider);
    const email = result.user.email.toLowerCase();

    const loginRole = await window.clcGetAdminRole(result.user);
    if (loginRole) {
      applyAdminState(true, email, true, loginRole === 'viewer');
      await result.user.getIdToken(true);
      alert(loginRole === 'viewer' ? `歡迎，${result.user.displayName || email}！目前為唯讀檢視權限。` : `歡迎回來，管理員 ${result.user.displayName || email}！`);
    } else {
      await window.auth.signOut();
      applyAdminState(false, "");
      alert(`帳號【${email}】非授權管理員！`);
    }
  } catch (error) {
    console.error("登入錯誤:", error);
  }
}

async function handleAdminLogout() {
  if (confirm("確定要登出管理員身分嗎？")) {
    await window.auth.signOut();
    applyAdminState(false, "");
    const page = getCurrentPageType();
    if (page === 'admin-venues') {
      window.location.href = "venue.html";
    }
  }
}

document.addEventListener('click', function(e) {
  const btn = document.getElementById('adminLoginBtn');
  const dropdown = document.getElementById('adminDropdown');
  if (btn && dropdown && !btn.contains(e.target) && !dropdown.contains(e.target)) {
    dropdown.classList.add('hidden');
  }
});

function toggleTheme() {
  const html = document.documentElement;
  if (html.classList.contains('dark')) {
    html.classList.remove('dark');
    localStorage.setItem('theme', 'light');
  } else {
    html.classList.add('dark');
    localStorage.setItem('theme', 'dark');
  }
}

function openGlobalSettings() {
  const dropdown = document.getElementById('adminDropdown');
  if (dropdown) dropdown.classList.add('hidden');
  const input = document.getElementById('startDayInput');
  if (input) input.value = window.configStartDay;
  const modal = document.getElementById('globalSettingsModal');
  if (modal) modal.classList.remove('hidden');
}

function closeGlobalSettings() {
  const modal = document.getElementById('globalSettingsModal');
  if (modal) modal.classList.add('hidden');
}

async function saveGlobalSettings() {
  if (!window.isAdmin) { alert('唯讀權限無法修改設定。'); return; }
  const input = document.getElementById('startDayInput');
  const val = parseInt(input.value, 10);
  if (isNaN(val) || val < 1 || val > 31) {
    alert("請輸入有效的日期 (1~31)");
    return;
  }

  try {
    await window.db.collection("system_config").doc("global_settings").set({
      startDay: val,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    
    window.configStartDay = val;
    closeGlobalSettings();
    alert(`設定成功！未來將於每月 ${val} 號開放登記。`);
    window.dispatchEvent(new CustomEvent('clc-config-changed', { detail: { startDay: val } }));
  } catch (err) {
    alert("儲存失敗，請檢查權限與連線。");
  }
}

async function fetchGlobalSettings() {
  try {
    const doc = await window.db.collection("system_config").doc("global_settings").get();
    if (doc.exists && doc.data().startDay) {
      window.configStartDay = parseInt(doc.data().startDay, 10);
      window.dispatchEvent(new CustomEvent('clc-config-changed', { detail: { startDay: window.configStartDay } }));
    }
  } catch (e) {
    console.warn("使用預設開放日期 20 號");
  }
}

document.addEventListener('DOMContentLoaded', () => {
  renderHeaderComponent();
  renderHymnPageMenu();
  fetchGlobalSettings();
});


// Navigation to venue week-holiday editor (the modal exists only in venue.html).
window.triggerHolidaySettings = function() {
  const dropdown = document.getElementById('adminDropdown');
  if (dropdown) dropdown.classList.add('hidden');
  if (!window.isAdmin && !window.isViewer) {
    alert('請先使用管理員帳號登入。');
    return;
  }
  if (getCurrentPageType() === 'venue' && typeof window.openWeeksHolidayModal === 'function') {
    window.openWeeksHolidayModal();
  } else {
    window.location.href = 'venue.html?openHoliday=1';
  }
};

// =========================================================================
// ★ 全官方社青 33 小組名單與小組登記狀況查閱後台 ★
// =========================================================================
window.CLC_OFFICIAL_GROUPS = [
  "CA101.璟佑牧區-稏倫小組", "CA102.璟佑牧區-祐嘉小組", "CA103.璟佑牧區-秉恩小組", "CA104.璟佑牧區-家豪小組",
  "CA201.彥伯牧區-學洋小組", "CA203.彥伯牧區-政憲小組", "CA204.彥伯牧區-佳翰小組", "CA205.彥伯牧區-圻燐小組",
  "CA301.漢威牧區-建宇小組", "CA303.漢威牧區-威勛小組", "CA304.漢威牧區-忠雄小組", "CA308.漢威牧區-書豪小組",
  "DC102.名君牧區-文雅小組", "DC103.名君牧區-盈汝小組", "DC105.名君牧區-之穎小組", "DC106.名君牧區-薏芳小組", "DC107.名君牧區-秀華小組",
  "DC201.奕芬牧區-芷萍小組", "DC202.奕芬牧區-沛澄小組", "DC203.奕芬牧區-家慈小組", "DC204.奕芬牧區-紀如小組", "DC205.奕芬牧區-奕芬小組",
  "DD201.淑珠牧區-淑珠小組", "DD202.淑珠牧區-鄭瑜小組", "DD203.淑珠牧區-薏翎小組",
  "DE102.欣芳牧區-宜君小組", "DE103.欣芳牧區-宇新小組", "DE104.欣芳牧區-莛雅小組", "DE105.欣芳牧區-婉萱小組", "DE106.欣芳牧區-霈縈小組",
  "DE201.莛喻牧區-雅慧小組", "DE202.莛喻牧區-雅惠小組", "DE204.莛喻牧區-才瑋小組"
];

let currentStatusMonth = "";
let currentStatusFilter = "all";
let cachedStatusData = { registered: [], unregistered: [] };

window.openGroupRegistrationStatusModal = async function(targetMonthOverride) {
  const dropdown = document.getElementById('adminDropdown');
  if (dropdown) dropdown.classList.add('hidden');

  let modal = document.getElementById('groupStatusModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'groupStatusModal';
    modal.className = "fixed inset-0 bg-black/75 backdrop-blur-sm z-50 hidden flex items-center justify-center p-3 sm:p-5";
    modal.innerHTML = `
      <div class="bg-white dark:bg-[#11131B] border border-slate-200 dark:border-brand-border rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        
        <!-- 頂部標題與關閉 -->
        <div class="px-5 py-3.5 border-b border-slate-200 dark:border-brand-border flex items-center justify-between shrink-0 bg-slate-50/50 dark:bg-white/5">
          <div class="flex items-center space-x-2">
            <span class="text-xl">📋</span>
            <div>
              <h3 class="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white flex items-center">
                <span>小組異動審核與登記名冊</span>
              </h3>
              <p class="text-[11px] text-slate-500 dark:text-brand-muted mt-0.5">即時統計已登記小組，並勾選核准異動需求</p>
            </div>
          </div>
          <button onclick="closeGroupRegistrationStatusModal()" class="text-slate-400 hover:text-slate-600 dark:hover:text-white text-lg font-bold p-1">✕</button>
        </div>

        <!-- 月份選擇與動作列 -->
        <div class="px-5 py-2.5 border-b border-slate-200 dark:border-brand-border flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div class="flex items-center space-x-2">
            <span class="text-xs font-bold text-slate-500 dark:text-slate-400">月份：</span>
            <div id="statusMonthTabs" class="flex p-0.5 bg-slate-200/80 dark:bg-[#161924] border border-slate-300 dark:border-brand-border rounded-lg"></div>
          </div>
          <div class="flex items-center space-x-2">
            <button onclick="copyUnregisteredList()" class="px-3 py-1.5 rounded-lg bg-teal-500/15 hover:bg-teal-500/25 text-[#007E8A] dark:text-[#2DD4BF] border border-teal-500/30 text-xs font-bold transition flex items-center">
              <span>📋 複製未登記名單</span>
            </button>
          </div>
        </div>

        <!-- 數據統計卡 -->
        <div class="px-5 py-3 grid grid-cols-4 gap-2 border-b border-slate-200 dark:border-brand-border shrink-0 bg-slate-50 dark:bg-[#161924]/60">
          <div class="text-center p-2 rounded-xl bg-white dark:bg-[#11131B] border border-slate-200 dark:border-white/5 shadow-sm">
            <div class="text-[10px] text-slate-400 font-bold">總小組數</div>
            <div class="text-base sm:text-lg font-black text-slate-900 dark:text-white mt-0.5" id="statTotalCount">33</div>
          </div>
          <div class="text-center p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/25 shadow-sm">
            <div class="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">已登記</div>
            <div class="text-base sm:text-lg font-black text-emerald-600 dark:text-emerald-400 mt-0.5" id="statRegCount">0</div>
          </div>
          <div class="text-center p-2 rounded-xl bg-rose-500/10 border border-rose-500/25 shadow-sm">
            <div class="text-[10px] text-rose-600 dark:text-rose-400 font-bold">尚未登記</div>
            <div class="text-base sm:text-lg font-black text-rose-600 dark:text-rose-400 mt-0.5" id="statUnregCount">0</div>
          </div>
          <div class="text-center p-2 rounded-xl bg-amber-500/10 border border-amber-500/25 shadow-sm">
            <div class="text-[10px] text-amber-600 dark:text-amber-400 font-bold">待審 / 異動</div>
            <div class="text-base sm:text-lg font-black text-amber-600 dark:text-amber-400 mt-0.5" id="statPendingCount">0</div>
          </div>
        </div>

        <!-- 篩選 Tab 列 -->
        <div class="px-5 pt-3 pb-2 flex items-center justify-between gap-2 shrink-0">
          <div class="flex items-center space-x-1.5">
            <button id="tabBtnAll" onclick="filterStatusDisplay('all')" class="px-2.5 py-1 rounded-lg text-xs font-bold bg-[#007E8A] text-white transition">全部</button>
            <button id="tabBtnPending" onclick="filterStatusDisplay('pending')" class="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-200/80 dark:bg-white/10 text-slate-700 dark:text-slate-300 transition flex items-center">待審核<span id="tabPendingBadge" class="hidden ml-1 w-2 h-2 rounded-full bg-rose-500"></span></button>
            <button id="tabBtnReg" onclick="filterStatusDisplay('reg')" class="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-200/80 dark:bg-white/10 text-slate-700 dark:text-slate-300 transition">已登記</button>
            <button id="tabBtnUnreg" onclick="filterStatusDisplay('unreg')" class="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-200/80 dark:bg-white/10 text-slate-700 dark:text-slate-300 transition">未登記</button>
          </div>
          <input type="text" id="statusSearchInput" oninput="handleStatusSearch(this.value)" placeholder="搜尋小組..." class="bg-slate-100 dark:bg-[#161924] border border-slate-300 dark:border-brand-border rounded-lg px-2.5 py-1 text-xs text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none w-28 sm:w-36">
        </div>

        <!-- 小組名單滾動區 -->
        <div id="statusListContainer" class="px-5 py-2 flex-1 overflow-y-auto space-y-2 pr-2 text-xs">
          <div class="p-8 text-center text-slate-400">正在讀取雲端登記資料...</div>
        </div>

        <!-- 底部 -->
        <div class="px-5 py-3 border-t border-slate-200 dark:border-brand-border flex items-center justify-between shrink-0 bg-slate-50/50 dark:bg-white/5">
          <label id="selectAllLabel" class="flex items-center space-x-2 font-bold cursor-pointer text-slate-800 dark:text-slate-200 text-[11px]">
            <input type="checkbox" id="selectAllCheckbox" onchange="toggleSelectAllStatus(this)" class="w-4 h-4 text-[#007E8A] rounded focus:ring-0">
            <span>全選未核准</span>
          </label>
          <div class="flex items-center space-x-2">
            <button onclick="closeGroupRegistrationStatusModal()" class="px-4 py-2 rounded-xl border border-slate-300 dark:border-brand-border text-xs text-slate-600 dark:text-slate-300 font-bold transition">關閉</button>
            <button id="batchApproveBtn" onclick="batchApproveGlobalSelected()" class="px-5 py-2 rounded-xl bg-[#007E8A] hover:bg-[#006C77] text-white text-xs font-bold transition shadow-md">批次核准已選</button>
          </div>
        </div>

      </div>
    `;
    document.body.appendChild(modal);
  }

  // 計算預設月份
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const curMonthStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  const nextDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const nextMonthStr = `${nextDate.getFullYear()}-${pad(nextDate.getMonth() + 1)}`;
  
  currentStatusMonth = targetMonthOverride || (now.getDate() >= 20 ? nextMonthStr : curMonthStr);

  renderStatusMonthTabs(curMonthStr, nextMonthStr);
  // 唯讀檢視者：隱藏核准相關操作
  ['selectAllLabel','batchApproveBtn'].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = window.isAdmin ? '' : 'none'; });
  modal.classList.remove('hidden');
  await loadStatusDataForMonth(currentStatusMonth);
};

window.closeGroupRegistrationStatusModal = function() {
  const modal = document.getElementById('groupStatusModal');
  if (modal) modal.classList.add('hidden');
};

function renderStatusMonthTabs(curM, nextM) {
  const container = document.getElementById('statusMonthTabs');
  if (!container) return;
  container.innerHTML = "";

  const months = [curM, nextM];
  months.forEach(mStr => {
    const [y, m] = mStr.split('-');
    const isActive = (mStr === currentStatusMonth);
    const btn = document.createElement('button');
    btn.className = isActive
      ? "px-3 py-1 rounded text-xs font-bold bg-[#007E8A] text-white shadow transition"
      : "px-3 py-1 rounded text-xs font-medium text-slate-600 dark:text-brand-muted hover:text-slate-900 dark:hover:text-white transition";
    btn.innerText = `${parseInt(m, 10)}月名冊`;
    btn.onclick = () => {
      currentStatusMonth = mStr;
      renderStatusMonthTabs(curM, nextM);
      loadStatusDataForMonth(currentStatusMonth);
    };
    container.appendChild(btn);
  });
}

async function loadStatusDataForMonth(monthStr) {
  const container = document.getElementById('statusListContainer');
  if (!container) return;
  container.innerHTML = `<div class="p-8 text-center text-slate-400 flex items-center justify-center space-x-2"><span>⏳</span><span>讀取【${monthStr}】登記紀錄中...</span></div>`;

  try {
    const snapshot = await window.db.collection("venue_bookings").where("month", "==", monthStr).get();
    const bookings = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

    const registered = [];
    const unregistered = [];
    let duplicateCount = 0;
    let pendingCount = 0;

    let officialGroups = window.CLC_OFFICIAL_GROUPS;
    try {
      const registrySnap = await window.db.collection('system_config').doc('groups_registry').get();
      if(registrySnap.exists && Array.isArray(registrySnap.data().list) && registrySnap.data().list.length) {
        officialGroups = registrySnap.data().list.map(g=>g.fullName).filter(Boolean);
      }
    } catch(e) { console.warn('小組名冊使用預設資料',e); }
    window.CLC_OFFICIAL_GROUPS = officialGroups;
    officialGroups.forEach(fullGroupId => {
      const shortName = fullGroupId.split('-').pop();
      const matchedDocs = bookings.filter(b => b.groupId === fullGroupId || (b.groupId && b.groupId.includes(shortName)));

      if (matchedDocs.length > 0) {
        // 取最新一筆
        const latestDoc = matchedDocs[matchedDocs.length - 1];
        const subCount = latestDoc.submissionCount || matchedDocs.length;
        const isDuplicate = (subCount > 1 || matchedDocs.length > 1);

        if (isDuplicate) duplicateCount++;
        if (!latestDoc.approved) pendingCount++;

        let timeStr = "";
        if (latestDoc.updatedAt && latestDoc.updatedAt.toDate) {
          const dt = latestDoc.updatedAt.toDate();
          timeStr = `${window.clcWeekLabel(`${dt.getMonth()+1}/${dt.getDate()}`,`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`)} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
        }

        // 解析週次簡報
        const escapeReviewText = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
        // 只列出有實際異動的週次；正常聚會、未申請均不顯示。
        const reviewWeeks = latestDoc.weeks ? Object.entries(latestDoc.weeks).filter(([d, status]) => {
          const value = String(status ?? '').trim();
          return value !== '' && !['正常聚會', '正常', '未申請', '不申請'].includes(value);
        }) : [];
        const weeksSummary = reviewWeeks.map(([d, status]) => {
          const value = String(status).trim();
          const label = value === '小組休會' || value === '休會' ? '休會' : (latestDoc.venueRequest ? `申請場地：${value}` : `異動：${value}`);
          return `${escapeReviewText(window.clcWeekLabel(d, monthStr))}：${escapeReviewText(label)}`;
        }).join('<br>');
        registered.push({
          fullGroupId: fullGroupId,
          shortName: shortName,
          doc: latestDoc,
          timeStr: timeStr,
          isDuplicate: isDuplicate,
          subCount: subCount,
          weeksSummary: weeksSummary
        });
      } else {
        unregistered.push(fullGroupId);
      }
    });

    cachedStatusData = { registered, unregistered, pendingCount, duplicateCount };

    // 更新統計數據
    document.getElementById('statTotalCount').innerText = window.CLC_OFFICIAL_GROUPS.length;
    document.getElementById('statRegCount').innerText = registered.length;
    document.getElementById('statUnregCount').innerText = unregistered.length;
    document.getElementById('statPendingCount').innerText = pendingCount;
    
    const pb = document.getElementById('tabPendingBadge');
    if (pb) {
      if (pendingCount > 0) pb.classList.remove('hidden');
      else pb.classList.add('hidden');
    }

    document.getElementById('tabBtnAll').innerText = `全部`;
    document.getElementById('tabBtnReg').innerText = `已登記 (${registered.length})`;
    document.getElementById('tabBtnUnreg').innerText = `未登記 (${unregistered.length})`;

    renderStatusList();
  } catch (err) {
    console.error("載入小組登記統計失敗:", err);
    container.innerHTML = `<div class="p-8 text-center text-rose-500">讀取失敗，請確認管理員權限與網路連線。</div>`;
  }
}

function renderStatusList(keyword = "") {
  const container = document.getElementById('statusListContainer');
  if (!container) return;
  container.innerHTML = "";

  const kw = keyword.toLowerCase().trim();
  let itemsToRender = [];

  if (currentStatusFilter === 'all' || currentStatusFilter === 'reg' || currentStatusFilter === 'pending') {
    cachedStatusData.registered.forEach(r => {
      if (currentStatusFilter === 'pending' && r.doc.approved) return;
      if (kw && !r.fullGroupId.toLowerCase().includes(kw)) return;
      itemsToRender.push({ type: 'registered', data: r });
    });
  }

  if (currentStatusFilter === 'all' || currentStatusFilter === 'unreg') {
    cachedStatusData.unregistered.forEach(u => {
      if (kw && !u.toLowerCase().includes(kw)) return;
      itemsToRender.push({ type: 'unregistered', fullGroupId: u });
    });
  }

  if (itemsToRender.length === 0) {
    container.innerHTML = `<div class="p-8 text-center text-slate-400">沒有符合條件的小組。</div>`;
    return;
  }

  itemsToRender.forEach(item => {
    if (item.type === 'registered') {
      const r = item.data;
      const isApproved = r.doc.approved === true;
      const card = document.createElement('div');
      card.className = `p-3 rounded-xl border ${isApproved ? 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10' : 'bg-amber-500/10 border-amber-500/30'} flex flex-col items-stretch gap-2.5 transition`;
      card.innerHTML = `
        <div class="flex items-start space-x-2.5 w-full">
          <input type="checkbox" value="${window.clcEscapeHtml(r.fullGroupId)}" ${(isApproved || !window.isAdmin) ? 'disabled' : ''} class="global-review-checkbox mt-0.5 w-4 h-4 text-[#007E8A] rounded focus:ring-0 shrink-0">
          <div class="flex-1 min-w-0">
            <div class="flex items-center space-x-2 flex-wrap gap-y-1">
              <span class="font-extrabold text-slate-900 dark:text-white text-xs sm:text-sm">${window.clcEscapeHtml(r.fullGroupId)}</span>
              ${r.isDuplicate ? `
                <span class="px-1.5 py-0.2 rounded font-bold text-[10px] bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                  ⚠️ 重複登記 ${r.subCount} 次
                </span>
              ` : ''}
            </div>
            ${r.weeksSummary ? `<div class="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              <strong>異動週次：</strong><div class="mt-1 leading-relaxed">${r.weeksSummary}</div>
            </div>` : ''}
            ${r.doc.venueRequest ? `<div class="text-amber-500 font-bold text-[11px]">📍 新增場地申請（${isApproved ? '已核准' : '待審核'}）</div>` : ''}
            ${r.doc.note ? `<div class="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5"><strong>備註：</strong> ${window.clcEscapeHtml(r.doc.note)}</div>` : ''}
          </div>
          <div class="text-right shrink-0 flex flex-col items-end">
            <div class="text-[9px] text-slate-400">${r.timeStr ? r.timeStr : ''}</div>
            <span class="inline-block mt-1 text-[10px] px-1.5 py-0.2 rounded font-bold ${isApproved ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/15 text-rose-500 border border-rose-500/20'}">
              ${isApproved ? '已核准' : '調動待審'}
            </span>
            ${window.isAdmin ? `<button type="button" class="mt-2 text-[11px] font-bold text-[#007E8A] dark:text-teal-300 underline" data-edit-weeks="${window.clcEscapeHtml(r.doc.id)}">編輯週次</button>` : ''}
            ${window.isAdmin ? `<button type="button" class="mt-2 text-[10px] font-bold text-rose-500 underline" data-delete-booking="${window.clcEscapeHtml(r.doc.id)}">刪除登記</button>` : ''}
          </div>
        </div>
      `;
      const editBtn = card.querySelector('[data-edit-weeks]');
      if (editBtn) editBtn.addEventListener('click', () => window.openBookingWeekEditor(r.doc.id, r.fullGroupId, card));
      const deleteBtn = card.querySelector('[data-delete-booking]');
      if(deleteBtn) deleteBtn.addEventListener('click',()=>window.deleteBookingToUnregistered(r.doc.id,r.fullGroupId));
      container.appendChild(card);
    } else {
      const u = item.fullGroupId;
      const card = document.createElement('div');
      card.className = "p-3 rounded-xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 flex items-center justify-between gap-2 transition";
      card.innerHTML = `
        <div class="flex items-center space-x-2 min-w-0">
          <span class="font-extrabold text-slate-900 dark:text-white text-xs sm:text-sm truncate">${window.clcEscapeHtml(u)}</span>
          <span class="px-1.5 py-0.2 rounded font-bold text-[10px] bg-rose-500/15 text-rose-500 border border-rose-500/30 shrink-0">✕ 尚未登記</span>
        </div>
        <span class="text-[11px] text-slate-400 shrink-0">預設套用官方常態</span>
      `;
      container.appendChild(card);
    }
  });
}

// 管理員可直接編輯已核准／自動核准的休會週次，不需先「取消核准」或刪除登記。
// 只更新正式 venue_bookings.weeks；其他資訊（包括小組名冊、場地與備註）維持不變。
window.openBookingWeekEditor = function(docId, groupId, card) {
  if (!window.isAdmin || !window.auth?.currentUser) {
    alert('只有管理員可以編輯週次。');
    return;
  }
  const old = card.querySelector('[data-week-editor]');
  if (old) { old.remove(); return; }
  const record = cachedStatusData.registered.find(x => x.doc.id === docId);
  if (!record) { alert('找不到這筆登記，請重新開啟名冊。'); return; }
  const originalWeeks = record.doc.weeks || {};
  const [yy, mm] = currentStatusMonth.split('-').map(Number);
  const dates = [];
  for (let d = 1; d <= new Date(yy, mm, 0).getDate(); d++) {
    if (new Date(yy, mm - 1, d).getDay() === 6) {
      dates.push(`${String(mm).padStart(2, '0')}/${String(d).padStart(2, '0')}`);
    }
  }
  for (const d of Object.keys(originalWeeks)) {
    if (!dates.includes(d)) dates.push(d);
  }
  dates.sort((a,b) => {
    const d = s => Number(s.split('/')[0])*100 + Number(s.split('/')[1]);
    return d(a)-d(b);
  });
  const esc = window.clcEscapeHtml;
  const editor = document.createElement('form');
  editor.dataset.weekEditor = '1';
  editor.className = 'w-full rounded-xl border border-teal-500/30 bg-teal-500/5 p-3 mt-1 space-y-2';
  editor.innerHTML = `
    <div class="font-bold text-xs text-slate-800 dark:text-slate-100">編輯 ${esc(groupId)} 週次</div>
    <div class="text-[11px] text-slate-500 dark:text-slate-400">可修改已自動核准的休會；儲存後會直接更新正式登記及場地總表。</div>
    ${dates.map(d => {
      const value = String(originalWeeks[d] || '正常聚會');
      const mode = value === '小組休會' || value === '休會' ? 'pause'
        : value === '正常聚會' || value === '正常' ? 'normal'
        : value === '未申請' || value === '不申請' ? 'none' : 'custom';
      return `<div class="flex flex-wrap items-center gap-2" data-week-row data-date="${esc(d)}">
        <label class="w-20 text-[11px] font-bold text-slate-600 dark:text-slate-300">${esc(d)}(六)</label>
        <select data-week-mode class="rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-[#161924] px-2 py-1.5 text-xs flex-1 min-w-32">
          <option value="normal" ${mode==='normal'?'selected':''}>正常聚會</option>
          <option value="pause" ${mode==='pause'?'selected':''}>小組休會（釋出場地）</option>
          <option value="none" ${mode==='none'?'selected':''}>未申請</option>
          <option value="custom" ${mode==='custom'?'selected':''}>其他異動（自訂）</option>
        </select>
        <input data-week-custom type="text" maxlength="250" value="${esc(mode==='custom'?value:'')}"
          class="${mode==='custom'?'':'hidden'} w-full sm:flex-1 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-[#161924] px-2 py-1.5 text-xs"
          placeholder="異動內容" aria-label="${esc(d)} 自訂異動內容">
      </div>`;
    }).join('')}
    <div class="flex gap-2 justify-end pt-1">
      <button type="button" data-cancel class="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-300 dark:border-slate-600">取消</button>
      <button type="submit" data-save class="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#007E8A] text-white">儲存週次</button>
    </div>`;
  card.appendChild(editor);
  editor.querySelector('[data-cancel]').addEventListener('click', () => editor.remove());
  editor.querySelectorAll('[data-week-row]').forEach(row => {
    const mode = row.querySelector('[data-week-mode]');
    const custom = row.querySelector('[data-week-custom]');
    mode.addEventListener('change', () => custom.classList.toggle('hidden', mode.value !== 'custom'));
  });
  editor.addEventListener('submit', async e => {
    e.preventDefault();
    if (!window.isAdmin || !window.auth?.currentUser) return;
    const updated = {...originalWeeks};
    for (const row of editor.querySelectorAll('[data-week-row]')) {
      const date = row.dataset.date;
      const mode = row.querySelector('[data-week-mode]').value;
      const custom = row.querySelector('[data-week-custom]').value.trim();
      if (mode === 'custom' && !custom) {
        alert(`請填寫 ${date} 的異動內容。`);
        row.querySelector('[data-week-custom]').focus();
        return;
      }
      updated[date] = mode==='pause' ? '小組休會'
        : mode==='normal' ? '正常聚會'
        : mode==='none' ? '未申請' : custom;
    }
    const save = editor.querySelector('[data-save]');
    save.disabled = true;
    save.textContent = '儲存中…';
    try {
      const ref = window.db.collection('venue_bookings').doc(docId);
      const snapshot = await ref.get();
      if (!snapshot.exists) throw Error('登記紀錄已被刪除，請重新整理。');
      if (JSON.stringify(snapshot.data().weeks || {}) !== JSON.stringify(originalWeeks)) {
        alert('這筆登記已由其他人更新，請重新載入後再編輯。');
        await loadStatusDataForMonth(currentStatusMonth);
        return;
      }
      const all = Object.values(updated);
      const hasChanges = all.some(x => x !== '正常聚會' && x !== '未申請') || !!String(snapshot.data().note || '').trim();
      await ref.update({
        weeks: updated,
        hasChanges,
        approved: true, // 管理員親自編輯即視為核准，包含原先的自動核准休會。
        approvedVia: 'admin-manual-edit',
        approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      await loadStatusDataForMonth(currentStatusMonth);
      if (typeof window.fetchMatrixData === 'function') await window.fetchMatrixData();
    } catch (err) {
      console.error('管理員修改週次失敗', err);
      alert('修改失敗：' + (err.message || '請確認管理員權限與網路連線'));
    } finally {
      save.disabled = false;
      save.textContent = '儲存週次';
    }
  });
};

function filterStatusDisplay(filterType) {
  currentStatusFilter = filterType;
  const btnMap = {
    all: document.getElementById('tabBtnAll'),
    pending: document.getElementById('tabBtnPending'),
    reg: document.getElementById('tabBtnReg'),
    unreg: document.getElementById('tabBtnUnreg')
  };

  Object.keys(btnMap).forEach(key => {
    const btn = btnMap[key];
    if (!btn) return;
    if (key === filterType) {
      btn.className = "px-2.5 py-1 rounded-lg text-xs font-bold bg-[#007E8A] text-white transition";
    } else {
      btn.className = "px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-200/80 dark:bg-white/10 text-slate-700 dark:text-slate-300 transition";
    }
  });

  const kw = document.getElementById('statusSearchInput') ? document.getElementById('statusSearchInput').value : "";
  renderStatusList(kw);
}

function handleStatusSearch(val) {
  renderStatusList(val);
}

window.copyUnregisteredList = function() {
  if (!cachedStatusData.unregistered || cachedStatusData.unregistered.length === 0) {
    alert("太棒了！本月份所有 33 個社青小組均已全數完成登記！");
    return;
  }

  const [y, m] = currentStatusMonth.split('-');
  let copyText = `【CLC YA ${parseInt(m, 10)}月份小組聚會登記 - 尚未填報名單】
目前尚有 ${cachedStatusData.unregistered.length} 個小組未完成登記：

`;
  
  cachedStatusData.unregistered.forEach((g, idx) => {
    copyText += `${idx + 1}. ${g}
`;
  });

  copyText += `
請各小組長盡速至入口登記完成下月聚會排程，謝謝大家！
https://clc-ya-portal.pages.dev/signup.html`;

  navigator.clipboard.writeText(copyText).then(() => {
    alert(`已成功複製 ${cachedStatusData.unregistered.length} 個未登記小組名單至剪貼簿！可直接貼至 LINE 群組提醒。`);
  }).catch(() => {
    prompt("請按 Ctrl+C / Cmd+C 複製以下未登記名單：", copyText);
  });
};


window.toggleSelectAllStatus = function(masterCheckbox) {
  const checkboxes = document.querySelectorAll('.global-review-checkbox:not(:disabled)');
  checkboxes.forEach(cb => cb.checked = masterCheckbox.checked);
};

window.batchApproveGlobalSelected = async function() {
  if (!window.isAdmin) { alert('唯讀權限無法核准。'); return; }
  const selected = Array.from(document.querySelectorAll('.global-review-checkbox:checked')).map(cb => cb.value);
  if (selected.length === 0) {
    alert("請先勾選需核准的小組！");
    return;
  }

  try {
    const batch = window.db.batch();
    selected.forEach(fullGroupId => {
      const docRef = window.db.collection("venue_bookings").doc(`${currentStatusMonth}_${fullGroupId}`);
      batch.update(docRef, { approved: true, approvedAt: firebase.firestore.FieldValue.serverTimestamp() });
    });
    await batch.commit();

    alert(`已成功批次核准 ${selected.length} 個小組之異動申請！總表將即時更新。`);
    
    // Refresh modal data
    loadStatusDataForMonth(currentStatusMonth);
    
    // Trigger global refresh if we are on venue.html
    if (window.fetchMatrixData) {
      window.fetchMatrixData();
    }
  } catch (e) {
    console.error("批次核准失敗:", e);
    alert("核准失敗，請確認管理員權限。");
  }
};

// 回復未登記：刪除指定月份的正式登記文件，預設場地仍保留。
window.deleteBookingToUnregistered = async function(docId,groupId) {
  if (!window.isAdmin || !window.auth.currentUser) { alert('只有管理員可刪除登記'); return; }
  if (!confirm(`確定刪除「${groupId}」在 ${currentStatusMonth} 的登記紀錄？
刪除後將恢復未登記，並套用常態預設。此動作無法直接復原。`)) return;
  try {
    await window.db.collection('venue_bookings').doc(docId).delete();
    await loadStatusDataForMonth(currentStatusMonth);
    if (typeof window.fetchMatrixData === 'function') await window.fetchMatrixData();
    alert('已刪除登記，恢復為未登記狀態。');
  } catch(e) { console.error(e); alert('刪除失敗，請確認 Firestore 權限。'); }
};

window.clcWeekLabel = function(date, monthStr) {
  const nums = String(date).match(/(\d{1,2})\/(\d{1,2})/);
  if (!nums) return date;
  const year = Number(String(monthStr).split('-')[0]) || new Date().getFullYear();
  const m=Number(nums[1]),d=Number(nums[2]);
  return `${m}/${String(d).padStart(2,'0')}(${['日','一','二','三','四','五','六'][new Date(year,m-1,d).getDay()]})`;
};
