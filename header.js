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

// 是否被嵌入在 iframe 內（跨網域存取 window.top 會丟例外，視為已嵌入）。
window.CLC_EMBEDDED = (function () {
  try { return window.self !== window.top; } catch (e) { return true; }
})();
if (window.CLC_EMBEDDED) document.documentElement.classList.add('clc-embedded');

window.ADMIN_WHITELIST = [
  "darren710404@gmail.com",
  "darren.lin@twclc.org"
];

// 站台切換（僅 Superuser）：Logo 單擊回首頁，雙擊開啟其他站台選單。
// 新增站台時只要在 CLC_SITES 加一筆；YA 的 header.js 使用同一份清單，只把 CLC_SITE_KEY 改成 'ya'。
window.CLC_SITE_KEY = 'sr';
window.CLC_SITES = [
  { key: 'ya', label: 'CLC YA', url: 'https://clc-ya-portal.pages.dev/' },
  { key: 'sr', label: 'CLC SR', url: 'https://clc-sr-portal.pages.dev/' }
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
  // 有些瀏覽器的廣告阻擋（例如 Brave Shields）或公司網路會擋 Firestore 的即時連線，
  // 自動偵測後改用相容的連線方式，避免名單一直讀不到、寫入卡住。
  try { window.db.settings({ experimentalAutoDetectLongPolling: true, merge: true }); } catch (e) { console.warn('Firestore 連線設定', e); }
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
  if (path.includes('members-admin')) return 'members-admin';
  if (path.endsWith('/join')) return 'join';
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

  // 被嵌入 iframe（例如 SR 內嵌 YA 歌詞系統）時一律隱藏 header，
  // 不依賴網址參數，因此在內嵌頁面內跳轉到後台等其他頁面也不會再出現第二個 header。
  if (window.CLC_EMBEDDED) {
    headerContainer.style.setProperty('display', 'none', 'important');
    headerContainer.setAttribute('aria-hidden', 'true');
  }

  // 與 YA 共用相同的 Header 尺寸、邊距與斷點。
  if (!document.getElementById('clc-header-fixed-style')) {
    const style = document.createElement('style');
    style.id = 'clc-header-fixed-style';
    style.textContent = `
      #clc-header { box-sizing: border-box !important; border-bottom-width: 1px !important; }
      #clc-header > div { width: 100% !important; max-width: none !important; height: 46px !important; min-height: 46px !important; padding: 0 14px !important; box-sizing: border-box !important; display: flex !important; align-items: center !important; justify-content: space-between !important; }
      #clc-header > div > a,
      #clc-header #clcLogoWrap > a { display: flex !important; align-items: center !important; text-decoration: none !important; }
      #clc-header #clcLogoLink { touch-action: manipulation; -webkit-tap-highlight-color: transparent; user-select: none; -webkit-user-select: none; }
      #clc-header #siteSwitcher { top: 100%; width: 180px; margin-top: 7.5px; padding: 6px 0; border-radius: 11.25px; z-index: 100; }
      #clc-header #siteSwitcher a { display: block; padding: 9px 15px; font-size: 13.5px; font-weight: 700; }
      #clc-header .logo-badge { font-size: 13.5px !important; height: 34px !important; line-height: 34px !important; box-sizing: border-box !important; padding: 0 12px !important; border-radius: 9px !important; font-weight: 800 !important; background: #007E8A; color: white; display: inline-flex; align-items: center; text-decoration: none; letter-spacing: .05em; }
      #clc-header > div > div { gap: 6px !important; display: flex !important; align-items: center !important; }
      #clc-header > div > div > * + * { margin-left: 0 !important; }
      #clc-header .header-btn { width: 34px !important; min-width: 34px !important; height: 34px !important; border-radius: 9px !important; font-size: 15px !important; padding: 0 !important; display: inline-flex !important; align-items: center !important; justify-content: center !important; cursor: pointer; }
      #clc-header #installAppBtn { height: 34px !important; box-sizing: border-box !important; font-size: 12px !important; padding: 0 10px !important; border-radius: 9px !important; }
      #clc-header #adminActiveDot { width: 7px !important; height: 7px !important; top: 6px !important; right: 6px !important; }
      #clc-header #adminDropdown {
        width: 210px !important;
        margin-top: 7.5px !important;
        padding-top: 7.5px !important;
        padding-bottom: 7.5px !important;
        border-radius: 11.25px !important;
        z-index: 100 !important;
      }
      #clc-header #adminDropdown > a,
      #clc-header #adminDropdown > button {
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
        #clc-header #adminDropdown > button { font-size: 15px !important; }
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
      <div id="clcLogoWrap" class="relative">
        <a id="clcLogoLink" href="index.html" onclick="handleLogoClick(event)" class="flex items-center" aria-label="CLC SR 首頁">
          <div class="logo-badge shadow-sm">CLC SR</div>
        </a>
        <div id="siteSwitcher" class="hidden absolute left-0 bg-white dark:bg-[#161924] shadow-2xl border border-slate-200 dark:border-brand-border text-left">
          <div class="px-4 py-1.5 text-[11px] font-bold text-slate-400">切換站台</div>
          ${window.CLC_SITES.filter(s => s.key !== window.CLC_SITE_KEY).map(s => `
            <a href="${s.url}" class="text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 transition">${window.clcEscapeHtml(s.label)}</a>
          `).join('')}
        </div>
      </div>

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

// ---------- 頁面齒輪選單（與 YA 歌詞頁相同做法）----------
// 頁面放一個 <button id="pageMenuGear" data-menu="members">⚙️</button>，選單由這裡產生。
// 未登入時按齒輪會先跳 Google 登入，登入成功才展開。
window.CLC_PAGE_MENUS = {
  members: [
    { page: 'members', href: 'members.html', label: '📖 組員通訊錄' },
    { page: 'members-admin', href: 'members-admin.html', label: '📋 名單後台' }
  ]
};
function renderPageMenu() {
  const gear = document.getElementById('pageMenuGear');
  if (!gear || document.getElementById('pageMenuDropdown')) return;
  const items = window.CLC_PAGE_MENUS[gear.dataset.menu] || [];
  const page = getCurrentPageType();
  gear.parentElement.classList.add('relative');
  gear.setAttribute('aria-haspopup', 'true');
  gear.setAttribute('aria-expanded', 'false');
  gear.setAttribute('aria-controls', 'pageMenuDropdown');
  const nav = document.createElement('nav');
  nav.id = 'pageMenuDropdown';
  nav.setAttribute('aria-label', '頁面選單');
  nav.className = 'hidden absolute right-0 top-full mt-2 w-48 bg-white dark:bg-[#161924] rounded-xl shadow-2xl border border-slate-200 dark:border-brand-border py-2 z-50 text-left';
  const link = 'block px-4 py-2.5 text-sm sm:text-[15px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 transition';
  nav.innerHTML = items.map(i => `<a href="${i.href}" class="${link}${i.page === page ? ' bg-slate-100 dark:bg-white/5' : ''}"${i.page === page ? ' aria-current="page"' : ''}>${i.label}</a>`).join('');
  gear.insertAdjacentElement('afterend', nav);
}
function setPageMenuOpen(open) {
  const menu = document.getElementById('pageMenuDropdown');
  const gear = document.getElementById('pageMenuGear');
  if (!menu || !gear) return;
  menu.classList.toggle('hidden', !open);
  gear.setAttribute('aria-expanded', String(!!open));
  if (open) document.getElementById('adminDropdown')?.classList.add('hidden');
}
window.togglePageMenu = async function () {
  renderPageMenu();
  const menu = document.getElementById('pageMenuDropdown');
  if (!menu) return;
  if (!window.canViewAdmin) {
    if (typeof triggerAdminLogin !== 'function') return;
    await triggerAdminLogin();
    if (!window.canViewAdmin) return;
  }
  setPageMenuOpen(menu.classList.contains('hidden'));
};
document.addEventListener('click', e => {
  const gear = document.getElementById('pageMenuGear');
  const menu = document.getElementById('pageMenuDropdown');
  if (gear && menu && !gear.contains(e.target) && !menu.contains(e.target)) setPageMenuOpen(false);
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') setPageMenuOpen(false); });

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
  if (!active) setPageMenuOpen(false);
  if (!superuser) {
    const switcher = document.getElementById('siteSwitcher');
    if (switcher) switcher.classList.add('hidden');
  }
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

// Logo：一般使用者單擊立即回首頁；Superuser 第一下先等 280ms，
// 若期間再點一下即視為雙擊並開啟站台選單（不依賴 dblclick 事件，手機雙點也可用）。
let clcLogoClickTimer = null;
function handleLogoClick(e) {
  const switcher = document.getElementById('siteSwitcher');
  if (!window.isSuperuser || !switcher) return; // 照舊回首頁
  e.preventDefault();
  const href = e.currentTarget.getAttribute('href');
  if (clcLogoClickTimer) {
    clearTimeout(clcLogoClickTimer);
    clcLogoClickTimer = null;
    switcher.classList.toggle('hidden');
    const admin = document.getElementById('adminDropdown');
    if (admin) admin.classList.add('hidden');
    return;
  }
  clcLogoClickTimer = setTimeout(() => {
    clcLogoClickTimer = null;
    window.location.href = href;
  }, 280);
}

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
  const logoWrap = document.getElementById('clcLogoWrap');
  const switcher = document.getElementById('siteSwitcher');
  if (logoWrap && switcher && !logoWrap.contains(e.target)) {
    switcher.classList.add('hidden');
  }
});

// 已安裝的 App（獨立視窗）內切到其他網域時，瀏覽器會強制顯示網址列；
// 改用新視窗開啟，讓目標站以自己的 App 或一般分頁開啟，原 App 視窗保持乾淨。
document.addEventListener('click', function(e) {
  const link = e.target.closest && e.target.closest('#siteSwitcher a');
  if (!link) return;
  const standalone = (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  document.getElementById('siteSwitcher')?.classList.add('hidden');
  if (!standalone) return; // 一般瀏覽器分頁：照常在同一分頁切換
  e.preventDefault();
  window.open(link.href, '_blank', 'noopener');
});

document.addEventListener('DOMContentLoaded', () => {
  renderHeaderComponent();
  // 登入狀態若比 Header 渲染更早回來，渲染後重新套用一次（不再發出事件）。
  const last = window.__clcLastAdminState;
  if (last && last.active) applyAdminState(true, last.email, false, last.viewer);
});
