/**
 * CLC SR 加樂團契控台 - 全域共用 Header 與權限核心 (header.js)
 * 角色模型：
 *  - admin: 全開最高管理員
 *  - district_leader: 區長 (管理所屬牧區)
 *  - group_leader: 小組長 (管理所屬小組)
 *  - viewer: 一般同工 (僅查看)
 */

// ★ 請在此填入加樂團契專屬 Firebase 專案設定 ★
window.firebaseConfig = {
  apiKey: "YOUR_FIREBASE_API_KEY",
  authDomain: "clc-sr-portal.firebaseapp.com",
  projectId: "clc-sr-portal",
  storageBucket: "clc-sr-portal.firebasestorage.app",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// 初始管理員白名單 (可登入直接進入後台開通其他同工)
window.INITIAL_ADMIN_WHITELIST = [
  "darren710404@gmail.com",
  "darren.lin@twclc.org"
];

// 初始化 Firebase
if (!firebase.apps.length) {
  firebase.initializeApp(window.firebaseConfig);
}
window.auth = firebase.auth();
window.db = firebase.firestore();
window.auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

// 全域使用者狀態
window.currentUserProfile = null;
window.currentUserRole = "";
window.isAdmin = false;
window.isDistrictLeader = false;
window.isGroupLeader = false;
window.isViewer = false;

// 頁面路徑偵測
function getCurrentPage() {
  const path = window.location.pathname.toLowerCase();
  if (path.includes('admin-users')) return 'admin-users';
  if (path.includes('members')) return 'members';
  if (path.includes('intakes')) return 'intakes';
  return 'index';
}

// 建立共用 Header
function renderHeaderComponent() {
  const headerContainer = document.getElementById('clc-header') || document.querySelector('header');
  if (!headerContainer) return;

  // 固化頂部 Header 的專屬固定樣式 (長輩友善防跑版)
  if (!document.getElementById('clc-header-fixed-style')) {
    const style = document.createElement('style');
    style.id = 'clc-header-fixed-style';
    style.textContent = `
      #clc-header { box-sizing: border-box !important; border-bottom: 1px solid rgba(255,255,255,0.1) !important; }
      #clc-header > div { max-width: 1024px !important; height: 52px !important; min-height: 52px !important; padding: 0 16px !important; display: flex !important; align-items: center !important; justify-content: space-between !important; }
      #clc-header .logo-badge { font-size: 15px !important; height: 38px !important; line-height: 38px !important; padding: 0 14px !important; border-radius: 10px !important; font-weight: 800 !important; background: #007E8A; color: white; display: inline-flex; align-items: center; text-decoration: none; }
      #clc-header .header-btn { width: 40px !important; height: 40px !important; border-radius: 10px !important; font-size: 17px !important; display: inline-flex !important; align-items: center !important; justify-content: center !important; cursor: pointer; }
      #clc-header #userRoleTag { font-size: 11px !important; padding: 3px 8px !important; border-radius: 9999px !important; font-weight: 700 !important; }
    `;
    document.head.appendChild(style);
  }

  headerContainer.className = "border-b border-slate-200 dark:border-white/10 backdrop-blur-xl bg-white/80 dark:bg-[#090A0F]/80 sticky top-0 z-40";
  headerContainer.innerHTML = `
    <div class="max-w-5xl mx-auto flex items-center justify-between">
      
      <!-- Logo 區塊 -->
      <a href="index.html" class="flex items-center space-x-2.5">
        <div class="logo-badge shadow-sm">CLC SR</div>
        <span class="text-sm sm:text-base font-extrabold tracking-wide text-slate-800 dark:text-white hidden xs:inline">加樂團契控台</span>
      </a>

      <!-- 右側動作群 -->
      <div class="flex items-center space-x-2 sm:space-x-3">
        
        <!-- 使用者登入 / 狀態選單 -->
        <div class="relative">
          <button id="authActionBtn" onclick="toggleUserDropdown()" title="登入 / 使用者選單" class="header-btn bg-slate-200/70 hover:bg-slate-300/70 dark:bg-white/5 dark:hover:bg-white/10 text-slate-700 dark:text-slate-200 border border-slate-300/60 dark:border-white/10 transition relative active:scale-95">
            <span id="authIcon">🔐</span>
            <span id="authActiveDot" class="hidden absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
          </button>
          
          <!-- 下拉選單 -->
          <div id="userDropdown" class="hidden absolute right-0 mt-2 w-64 bg-white dark:bg-[#161924] rounded-2xl shadow-2xl border border-slate-200 dark:border-brand-border py-2.5 z-50 text-left">
            <div class="px-4 py-2 border-b border-slate-100 dark:border-white/5">
              <div id="userEmailDisplay" class="text-xs font-semibold text-slate-500 dark:text-slate-400 truncate">未登入</div>
              <div id="userNameAndRole" class="mt-1 flex items-center justify-between">
                <span id="userNameText" class="font-bold text-sm text-slate-900 dark:text-white">訪客</span>
                <span id="userRoleTag" class="bg-slate-200 text-slate-600 dark:bg-white/10 dark:text-slate-300">未開通</span>
              </div>
            </div>

            <!-- 系統管理員專屬後台入口 -->
            <div id="adminMenuSection" class="hidden py-1">
              <a href="admin-users.html" class="flex items-center px-4 py-2.5 text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-teal-50 dark:hover:bg-white/5 transition">
                <span class="mr-2.5 text-base">👤</span> 權限與帳號管理
              </a>
              <div class="border-t border-slate-100 dark:border-white/5 my-1"></div>
            </div>

            <!-- 登出按鈕 -->
            <button onclick="handleUserLogout()" class="w-full text-left px-4 py-2.5 text-sm text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 font-bold transition flex items-center">
              <span class="mr-2.5 text-base">🚪</span> 登出系統
            </button>
          </div>
        </div>

        <!-- 深淺主題切換 (高對比友善長輩) -->
        <button onclick="toggleTheme()" aria-label="切換深淺模式" class="header-btn bg-slate-200/70 hover:bg-slate-300/70 dark:bg-white/5 dark:hover:bg-white/10 text-slate-700 dark:text-slate-200 border border-slate-300/60 dark:border-white/10 transition">
          <span class="dark:hidden">🌙</span>
          <span class="hidden dark:inline">☀️</span>
        </button>

      </div>

    </div>
  `;
}

// 角色標籤色彩對照表
const ROLE_NAME_MAP = {
  admin: { name: '系統管理員', color: 'bg-amber-500/15 text-amber-500 border border-amber-500/30' },
  district_leader: { name: '區長', color: 'bg-blue-500/15 text-blue-500 border border-blue-500/30' },
  group_leader: { name: '小組長', color: 'bg-teal-500/15 text-teal-600 dark:text-teal-400 border border-teal-500/30' },
  viewer: { name: '一般同工 (唯讀)', color: 'bg-slate-200 text-slate-700 dark:bg-white/10 dark:text-slate-300' }
};

// 更新畫面使用者狀態
function applyUserAuthProfile(user, profile) {
  const icon = document.getElementById('authIcon');
  const dot = document.getElementById('authActiveDot');
  const emailDisp = document.getElementById('userEmailDisplay');
  const nameText = document.getElementById('userNameText');
  const roleTag = document.getElementById('userRoleTag');
  const adminSection = document.getElementById('adminMenuSection');

  if (!user) {
    window.currentUserProfile = null;
    window.currentUserRole = "";
    window.isAdmin = false;
    window.isDistrictLeader = false;
    window.isGroupLeader = false;
    window.isViewer = false;

    if (icon) icon.innerText = "🔐";
    if (dot) dot.classList.add('hidden');
    if (emailDisp) emailDisp.innerText = "請點擊登入";
    if (nameText) nameText.innerText = "訪客";
    if (roleTag) {
      roleTag.innerText = "未登入";
      roleTag.className = "bg-slate-200 text-slate-500 dark:bg-white/10 dark:text-slate-400 text-xs px-2 py-0.5 rounded-full";
    }
    if (adminSection) adminSection.classList.add('hidden');

    window.dispatchEvent(new CustomEvent('clc-auth-ready', { detail: { signedIn: false, role: null } }));
    return;
  }

  window.currentUserProfile = profile;
  const email = (user.email || '').toLowerCase().trim();
  const isSuper = window.INITIAL_ADMIN_WHITELIST.map(e => e.toLowerCase()).includes(email);
  
  let role = profile?.role;
  let isActive = profile?.isActive === true;

  if (isSuper) {
    role = 'admin';
    isActive = true;
  }

  window.currentUserRole = isActive ? role : '';
  window.isAdmin = (role === 'admin' && isActive);
  window.isDistrictLeader = (role === 'district_leader' && isActive);
  window.isGroupLeader = (role === 'group_leader' && isActive);
  window.isViewer = (role === 'viewer' && isActive);

  if (icon) icon.innerText = window.isAdmin ? "👑" : "👤";
  if (dot) dot.classList.remove('hidden');
  if (emailDisp) emailDisp.innerText = email;
  if (nameText) nameText.innerText = profile?.name || user.displayName || '同工';
  
  if (roleTag) {
    if (!isActive) {
      roleTag.innerText = "待管理員開通";
      roleTag.className = "bg-rose-500/15 text-rose-500 border border-rose-500/30 text-xs px-2 py-0.5 rounded-full";
    } else {
      const meta = ROLE_NAME_MAP[role] || { name: '已開通', color: 'bg-emerald-500/15 text-emerald-500' };
      roleTag.innerText = meta.name;
      roleTag.className = `${meta.color} text-xs px-2 py-0.5 rounded-full font-bold`;
    }
  }

  if (adminSection) {
    adminSection.classList.toggle('hidden', !window.isAdmin);
  }

  window.dispatchEvent(new CustomEvent('clc-auth-ready', {
    detail: { signedIn: true, user, profile, role: window.currentUserRole, isActive }
  }));
}

// 監聽 Firebase Auth 登入狀態變更
let authProfileUnsubscribe = null;
window.auth.onAuthStateChanged(async (user) => {
  if (authProfileUnsubscribe) {
    authProfileUnsubscribe();
    authProfileUnsubscribe = null;
  }

  if (!user || !user.email) {
    applyUserAuthProfile(null, null);
    return;
  }

  const email = user.email.toLowerCase().trim();
  const isSuper = window.INITIAL_ADMIN_WHITELIST.map(e => e.toLowerCase()).includes(email);

  // 監聽使用者在 Firestore users/{uid} 的設定
  authProfileUnsubscribe = window.db.collection('users').doc(user.uid).onSnapshot(async (snap) => {
    let profileData = snap.exists ? snap.data() : null;

    // 若使用者第一次登入且不存在於 users，自動建立基本資料草稿 (待審核)
    if (!snap.exists) {
      profileData = {
        uid: user.uid,
        email: email,
        name: user.displayName || email.split('@')[0],
        role: isSuper ? 'admin' : 'viewer',
        districtId: null,
        groupId: null,
        isActive: isSuper ? true : false,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      try {
        await window.db.collection('users').doc(user.uid).set(profileData, { merge: true });
      } catch (err) {
        console.warn('首次建立使用者自述文件失敗 (受規則限制):', err);
      }
    }

    applyUserAuthProfile(user, profileData);
  }, (err) => {
    console.warn('讀取使用者權限異常:', err);
    if (isSuper) {
      applyUserAuthProfile(user, { role: 'admin', isActive: true, email: email, name: user.displayName });
    } else {
      applyUserAuthProfile(user, null);
    }
  });
});

// 下拉選單開關
function toggleUserDropdown() {
  if (window.auth.currentUser) {
    const dropdown = document.getElementById('userDropdown');
    if (dropdown) dropdown.classList.toggle('hidden');
  } else {
    triggerGoogleLogin();
  }
}

// 觸發 Google 帳號登入
async function triggerGoogleLogin() {
  const provider = new firebase.auth.GoogleAuthProvider();
  try {
    const result = await window.auth.signInWithPopup(provider);
    const user = result.user;
    alert(`登入成功！歡迎 ${user.displayName || user.email} 同工。`);
  } catch (error) {
    if (error.code !== 'auth/popup-closed-by-user') {
      alert(`登入失敗：${error.message}`);
    }
  }
}

// 登出
async function handleUserLogout() {
  if (confirm("確定要登出加樂團契控台嗎？")) {
    await window.auth.signOut();
    const dropdown = document.getElementById('userDropdown');
    if (dropdown) dropdown.classList.add('hidden');
    window.location.reload();
  }
}

// 點擊空白處關閉選單
document.addEventListener('click', function(e) {
  const btn = document.getElementById('authActionBtn');
  const dropdown = document.getElementById('userDropdown');
  if (btn && dropdown && !btn.contains(e.target) && !dropdown.contains(e.target)) {
    dropdown.classList.add('hidden');
  }
});

// 深淺模式切換
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

document.addEventListener('DOMContentLoaded', () => {
  renderHeaderComponent();
});
