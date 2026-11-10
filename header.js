/**
 * CLC SR 加樂團契控台 - 共用 Header 與權限核心 (header.js)
 * 權限模型與 YA 完全一致：
 *  - Superuser：ADMIN_WHITELIST 內的固定初始管理員（不可停用／刪除）
 *  - admin：Firestore admin_users 內啟用中的管理員（可編輯）
 *  - viewer：Firestore admin_users 內啟用中的檢視者（唯讀）
 * 尚未串接審核功能；notifyReview 欄位先保留供日後使用。
 */

window.firebaseConfig = {
  apiKey: "AIzaSyDq4QVCPxV9RHC0ciWSJgrZ9QnOsKK4B9w",
  authDomain: "clc-sr-portal.firebaseapp.com",
  projectId: "clc-sr-portal",
  storageBucket: "clc-sr-portal.firebasestorage.app",
  messagingSenderId: "670007709518",
  appId: "1:670007709518:web:63373def384af0dd55981f",
  measurementId: "G-NVTHJLBT53"
};

window.ADMIN_WHITELIST = [
  "darren710404@gmail.com",
  "darren.lin@twclc.org"
];

// 將使用者輸入的文字放進 innerHTML 前必須先跳脫，避免被植入惡意程式碼。
window.clcEscapeHtml = function(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
};

// 初始化 Firebase (保證只初始化一次)
window.auth = null;
window.db = null;
try {
  if (!firebase.apps.length) firebase.initializeApp(window.firebaseConfig);
  window.auth = firebase.auth();
  window.db = firebase.firestore();
  window.auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(err => console.warn('SR Auth 持續登入設定:', err));
} catch (e) {
  console.error('SR Firebase 初始化失敗:', e);
}

window.isAdmin = false;
window.currentAdminEmail = "";
window.currentAdminRole = "";
window.isSuperuser = false;
window.isViewer = false;
window.canViewAdmin = false;

// 在獨立 PWA 視窗內避免視窗標題顯示兩次。
if (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) {
  document.title = '';
}

// 取得當前頁面類型（pretty URL 可不含 .html）
function getCurrentPageType() {
  const path = window.location.pathname.toLowerCase().replace(/\/+$/, '').replace(/\.html$/, '');
  if (path.includes('admin-users')) return 'admin-users';
  if (path.endsWith('/hymn-lyrics')) return 'hymn-lyrics';
  if (path.endsWith('/admin-hymns')) return 'admin-hymns';
  if (path.includes('members')) return 'members';
  if (path.includes('intakes')) return 'intakes';
  if (path.includes('groups')) return 'groups';
  if (path === '' || path.endsWith('/index')) return 'index';
  return 'other';
}

// 建立共用 Header
function renderHeaderComponent() {
  const headerContainer = document.getElementById('clc-header') || document.querySelector('header');
  if (!headerContainer) return;

  // 與 YA 共用相同的 Header 尺寸、邊距與斷點。
  if (!document.getElementById('clc-header-fixed-style')) {
    const style = document.createElement('style');
    style.id = 'clc-header-fixed-style';
    style.textContent = `
      #clc-header { box-sizing: border-box !important; border-bottom-width: 1px !important; }
      #clc-header > div { width: 100% !important; max-width: none !important; height: 46px !important; min-height: 46px !important; padding: 0 14px !important; box-sizing: border-box !important; display: flex !important; align-items: center !important; justify-content: space-between !important; }
      #clc-header > div > a { display: flex !important; align-items: center !important; text-decoration: none !important; }
      #clc-header .logo-badge { font-size: 13.5px !important; height: 34px !important; line-height: 34px !important; box-sizing: border-box !important; padding: 0 12px !important; border-radius: 9px !important; font-weight: 800 !important; background: #007E8A; color: white; display: inline-flex; align-items: center; text-decoration: none; letter-spacing: .05em; }
      #clc-header > div > div { gap: 6px !important; display: flex !important; align-items: center !important; }
      #clc-header > div > div > * + * { margin-left: 0 !important; }
      #clc-header .header-btn { width: 34px !important; min-width: 34px !important; height: 34px !important; border-radius: 9px !important; font-size: 15px !important; padding: 0 !important; display: inline-flex !important; align-items: center !important; justify-content: center !important; cursor: pointer; }
      #clc-header #installAppBtn { height: 34px !important; box-sizing: border-box !important; font-size: 12px !important; padding: 0 10px !important; border-radius: 9px !important; }
      #clc-header #adminActiveDot { width: 7px !important; height: 7px !important; top: 6px !important; right: 6px !important; }
      #clc-header #adminDropdown,
      #hymnPageDropdown {
        width: 210px !important;
        margin-top: 7.5px !important;
        padding-top: 7.5px !important;
        padding-bottom: 7.5px !important;
        border-radius: 11.25px !important;
        z-index: 100 !important;
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
        #clc-header > div { height: 48px !important; min-height: 48px !important; padding: 0 20px !important; }
        #clc-header .logo-badge { font-size: 14px !important; height: 36px !important; line-height: 36px !important; padding: 0 14px !important; border-radius: 10px !important; }
        #clc-header .header-btn { width: 36px !important; min-width: 36px !important; height: 36px !important; border-radius: 10px !important; font-size: 16px !important; }
        #clc-header #installAppBtn { height: 36px !important; font-size: 13px !important; padding: 0 12px !important; border-radius: 10px !important; }
        #clc-header #adminDropdown > a,
        #clc-header #adminDropdown > button,
        #hymnPageDropdown > a { font-size: 15px !important; }
      }
      @media (min-width: 1024px) {
        #clc-header > div { padding-left: 24px !important; padding-right: 24px !important; }
      }
      @media (min-width: 1440px) {
        #clc-header > div { padding-left: 32px !important; padding-right: 32px !important; }
      }
    `;
    document.head.appendChild(style);
  }

  const page = getCurrentPageType();

  headerContainer.className = "border-b border-slate-200 dark:border-white/10 backdrop-blur-xl bg-white/70 dark:bg-[#090A0F]/70 sticky top-0 z-40";
  headerContainer.innerHTML = `
    <div class="w-full mx-auto flex items-center justify-between">

      <!-- Logo 區塊 -->
      <a href="index.html" class="flex items-center" aria-label="CLC SR 首頁">
        <div class="logo-badge shadow-sm">CLC SR</div>
      </a>

      <!-- 右側動作群 -->
      <div class="flex items-center">

        <!-- 管理員按鈕 (含登入後下拉選單)：與 YA 相同 -->
        <div class="relative">
          <button id="adminLoginBtn" onclick="toggleAdminDropdown()" title="管理員登入 / 狀態" class="header-btn bg-slate-200/70 hover:bg-slate-300/70 dark:bg-white/5 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 border border-slate-300/60 dark:border-white/10 transition relative active:scale-95">
            <span id="adminBtnIcon">🔐</span>
            <span id="adminActiveDot" class="hidden absolute top-2 right-2 w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
          </button>

          <div id="adminDropdown" class="hidden absolute right-0 mt-2 w-56 bg-white dark:bg-[#161924] rounded-xl shadow-2xl border border-slate-200 dark:border-brand-border py-2 z-50 text-left">
            <div class="px-4 py-2 text-xs font-bold text-slate-400 border-b border-slate-100 dark:border-white/5 truncate" id="adminEmailDisplay">
              管理員已登入
            </div>

            <a href="admin-users.html" class="block px-4 py-2.5 text-sm sm:text-[15px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 transition">
              👤 權限管理
            </a>

            <div class="border-t border-slate-100 dark:border-white/5 my-1.5"></div>

            <button onclick="handleAdminLogout()" class="w-full text-left px-4 py-2.5 text-sm sm:text-[15px] text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 font-bold transition">
              🚪 登出管理員
            </button>
          </div>
        </div>

        <!-- 首頁安裝按鈕 -->
        ${page === 'index' ? '<button id="installAppBtn" type="button" onclick="window.triggerPwaInstall && window.triggerPwaInstall()" class="hidden items-center px-3.5 py-2 rounded-xl bg-slate-200/70 hover:bg-slate-300/70 dark:bg-white/5 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 border border-slate-300/60 dark:border-white/10 text-xs sm:text-sm font-semibold transition active:scale-95"><span class="mr-1">📲</span><span class="whitespace-nowrap">安裝</span></button>' : ''}

      </div>

    </div>
  `;

  // 不再從 localStorage 推定權限：須經 Firebase Auth 驗證。
}

// 歌詞雙頁面共用的齒輪選單（與 YA 相同），只在歌詞頁注入。
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
  renderHymnPageMenu();
  const menu = document.getElementById('hymnPageDropdown');
  if (!menu) return;
  if (!window.canViewAdmin) {
    if (typeof triggerAdminLogin !== 'function') return;
    await triggerAdminLogin();
    if (!window.canViewAdmin) return;
  }
  setHymnPageMenuOpen(menu.classList.contains('hidden'));
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
  window.__clcLastAdminState = { active: !!active, email, viewer: viewerOnly };
  const superuser = window.isAdmin && window.ADMIN_WHITELIST.includes(String(email || '').toLowerCase());
  window.currentAdminRole = active ? (viewerOnly ? 'viewer' : (superuser ? 'superuser' : 'admin')) : '';
  window.isSuperuser = superuser;
  if (!active) setHymnPageMenuOpen(false);
  const icon = document.getElementById('adminBtnIcon');
  const dot = document.getElementById('adminActiveDot');
  const emailDisp = document.getElementById('adminEmailDisplay');

  if (icon && dot) {
    if (active) {
      localStorage.setItem('clc_sr_admin_email', email);
      icon.innerText = viewerOnly ? "👁️" : "👑";
      dot.classList.remove('hidden');
      if (emailDisp) emailDisp.innerText = email + (viewerOnly ? ' · Viewer（唯讀）' : (superuser ? ' · Superuser' : ' · Admin'));
    } else {
      localStorage.removeItem('clc_sr_admin_email');
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

// 固定初始管理員（Superuser）保留為初始權限；其他管理員由 Firestore admin_users 管理。
window.clcIsAuthorizedAdmin = async function(user) {
  return !!(await window.clcGetAdminRole(user));
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
if (window.auth) window.auth.onAuthStateChanged(user => {
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
  // 動態 Admin / Viewer 的停用與刪除立即同步到各分頁。
  clcAdminPermissionUnsubscribe = window.db.collection('admin_users').doc(email).onSnapshot(snap => {
    if (window.auth.currentUser?.uid !== user.uid) return;
    const data = snap.exists ? snap.data() : null;
    const allowed = !!(data && (data.role === 'admin' || data.role === 'viewer') && data.active !== false && (!data.email || data.email === email));
    applyAdminState(allowed, allowed ? email : '', true, allowed && data.role === 'viewer');
  }, err => {
    console.warn('無法驗證管理員權限：', err);
    if (window.auth.currentUser?.uid === user.uid) applyAdminState(false, '');
  });
}, err => {
  console.error('SR Firebase 登入狀態錯誤:', err);
  applyAdminState(false, '');
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
  if (!window.auth) {
    alert('Firebase 初始化失敗，請重新整理頁面或檢查 header.js 的 Firebase 設定。');
    return;
  }
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
    // 使用者自行關閉登入視窗不用提示；其他錯誤避免讓按鈕看起來「沒有反應」。
    if (!['auth/popup-closed-by-user', 'auth/cancelled-popup-request'].includes(error?.code)) {
      const code = error?.code || 'unknown';
      const hint = {
        'auth/unauthorized-domain': '此網域尚未加入 Firebase 的 Authorized domains（Authentication → Settings → Authorized domains），請加入 ' + location.hostname,
        'auth/operation-not-allowed': 'Firebase 尚未啟用 Google 登入（Authentication → Sign-in method → Google → Enable）。',
        'auth/popup-blocked': '瀏覽器擋住了登入彈出視窗，請允許彈出視窗後再試。',
        'auth/network-request-failed': '網路連線失敗，請稍後再試。',
        'auth/api-key-not-valid.-please-pass-a-valid-api-key.': 'Firebase apiKey 無效，請檢查 header.js 的設定。'
      }[code] || '請確認網路連線與瀏覽器是否允許 Google 登入彈出視窗。';
      alert('管理員登入未完成。\n\n原因：' + hint + '\n（錯誤代碼：' + code + '）');
    }
  }
}

async function handleAdminLogout() {
  if (confirm("確定要登出管理員身分嗎？")) {
    await window.auth.signOut();
    applyAdminState(false, "");
  }
}

document.addEventListener('click', function(e) {
  const btn = document.getElementById('adminLoginBtn');
  const dropdown = document.getElementById('adminDropdown');
  if (btn && dropdown && !btn.contains(e.target) && !dropdown.contains(e.target)) {
    dropdown.classList.add('hidden');
  }
});

document.addEventListener('DOMContentLoaded', () => {
  renderHeaderComponent();
  renderHymnPageMenu();
  // 登入狀態若比 Header 渲染更早回來，渲染後重新套用一次（不再發出事件）。
  const last = window.__clcLastAdminState;
  if (last && last.active) applyAdminState(true, last.email, false, last.viewer);
});
