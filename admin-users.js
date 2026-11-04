/**
 * CLC SR 權限管理邏輯 (admin-users.js)
 * 實作 4 種角色指派與啟停保護
 */

(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  let cachedUsers = [];
  let isProcessing = false;

  // 角色選擇動態聯動輸入框
  window.handleRoleSelectionChange = function (role) {
    const districtBox = $('fieldDistrictContainer');
    const groupBox = $('fieldGroupContainer');
    
    if (role === 'district_leader') {
      districtBox.classList.remove('hidden');
      groupBox.classList.add('hidden');
    } else if (role === 'group_leader') {
      districtBox.classList.add('hidden');
      groupBox.classList.remove('hidden');
    } else {
      districtBox.classList.add('hidden');
      groupBox.classList.add('hidden');
    }
  };

  // 驗證是否具備 Admin 權限
  async function checkAdminAuth() {
    if (!window.auth.currentUser) return false;
    return window.isAdmin === true;
  }

  // 監聽全域認證完成事件
  window.addEventListener('clc-auth-ready', async (e) => {
    const allowed = await checkAdminAuth();
    if (allowed) {
      $('accessCheckCard').classList.add('hidden');
      $('mainAdminPanel').classList.remove('hidden');
      loadUserListFromFirestore();
    } else {
      $('accessCheckCard').classList.remove('hidden');
      $('mainAdminPanel').classList.add('hidden');
      if (window.auth.currentUser) {
        $('accessCheckMsg').innerHTML = `<span class="text-rose-500 font-bold">抱歉，您的帳號【${window.auth.currentUser.email}】不是系統管理員 (Admin)！</span><br><span class="text-xs text-slate-400">無法操作權限管理後台。</span>`;
      } else {
        $('accessCheckMsg').innerText = "請先點擊右上角鑰匙登入已授權的 Admin 帳號。";
      }
    }
  });

  // 讀取所有 users
  window.loadUserListFromFirestore = async function () {
    const container = $('userListContainer');
    container.innerHTML = `<div class="text-center py-8 text-slate-400">正在讀取同工資料...</div>`;

    try {
      const snap = await window.db.collection('users').get();
      cachedUsers = snap.docs.map(doc => ({ uid: doc.id, ...doc.data() }));

      // 也合併白名單的 superusers，防止未在資料庫建檔時消失
      window.INITIAL_ADMIN_WHITELIST.forEach(email => {
        const found = cachedUsers.some(u => (u.email || '').toLowerCase() === email.toLowerCase());
        if (!found) {
          cachedUsers.unshift({
            uid: 'super_' + email.replace(/[^a-zA-Z0-9]/g, '_'),
            email: email,
            name: '初始管理員',
            role: 'admin',
            isActive: true,
            isBootstrap: true
          });
        }
      });

      renderUserCards();
    } catch (err) {
      console.error(err);
      container.innerHTML = `<div class="p-6 text-center text-rose-500 font-bold">讀取同工清單失敗：${esc(err.message)}<br><span class="text-xs text-slate-400">請確認是否已部署加樂專案的 Firestore Security Rules。</span></div>`;
    }
  };

  // 渲染同工卡片 (大觸控區、清楚顯示牧區小組)
  function renderUserCards() {
    const container = $('userListContainer');
    $('userCountBadge').innerText = `${cachedUsers.length} 位`;

    if (cachedUsers.length === 0) {
      container.innerHTML = `<div class="p-6 text-center text-slate-400">目前尚無同工資料。</div>`;
      return;
    }

    const ROLE_LABELS = {
      admin: '👑 系統管理員 (全開)',
      district_leader: '⭐ 牧區區長',
      group_leader: '🌿 小組長',
      viewer: '📖 一般同工 (唯讀)'
    };

    container.innerHTML = cachedUsers.map(user => {
      const email = user.email || '';
      const isSuper = window.INITIAL_ADMIN_WHITELIST.map(e => e.toLowerCase()).includes(email.toLowerCase());
      const active = isSuper || (user.isActive === true);
      const role = isSuper ? 'admin' : (user.role || 'viewer');
      
      let scopeText = "無特定負責小組";
      if (role === 'district_leader' && user.districtId) scopeText = `負責牧區：${esc(user.districtId)}`;
      if (role === 'group_leader' && user.groupId) scopeText = `負責小組：${esc(user.groupId)}`;

      return `
        <div class="rounded-2xl border-2 ${active ? 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161924]' : 'border-rose-400/30 bg-rose-500/5'} p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 transition shadow-sm">
          <div class="min-w-0 flex-1">
            <div class="flex items-center space-x-2 flex-wrap">
              <span class="text-lg font-black text-slate-900 dark:text-white">${esc(user.name || '未命名同工')}</span>
              <span class="text-xs px-2.5 py-0.5 rounded-full font-bold ${active ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/20 text-rose-500'}">
                ${active ? '● 已啟用' : '✕ 已停用'}
              </span>
              ${isSuper ? '<span class="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-500 font-extrabold">永久保留 Superuser</span>' : ''}
            </div>
            <div class="text-sm text-slate-500 dark:text-slate-400 mt-1 break-all">${esc(email)}</div>
            <div class="text-xs font-semibold text-[#007E8A] dark:text-teal-400 mt-1">${scopeText}</div>
          </div>

          <!-- 快速控制動作列 -->
          <div class="flex flex-wrap items-center gap-2 shrink-0">
            <!-- 角色切換下拉選單 -->
            <select onchange="updateUserRole('${esc(user.uid)}', this.value)" ${isSuper ? 'disabled' : ''} class="bg-slate-100 dark:bg-[#11131B] border border-slate-300 dark:border-brand-border rounded-xl px-3 py-2 text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-none">
              <option value="viewer" ${role==='viewer'?'selected':''}>一般同工 (僅查看)</option>
              <option value="group_leader" ${role==='group_leader'?'selected':''}>小組長 (管轄小組)</option>
              <option value="district_leader" ${role==='district_leader'?'selected':''}>區長 (管轄牧區)</option>
              <option value="admin" ${role==='admin'?'selected':''}>系統管理員 (全開)</option>
            </select>

            <!-- 啟停狀態切換按鈕 -->
            ${isSuper ? '' : `
              <button onclick="toggleUserStatus('${esc(user.uid)}', ${!active})" class="px-3.5 py-2 rounded-xl text-xs font-bold border transition ${active ? 'border-rose-500/40 text-rose-500 hover:bg-rose-500/10' : 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10'}">
                ${active ? '停用帳號' : '重新開通'}
              </button>
            `}
          </div>
        </div>
      `;
    }).join('');
  }

  // 變更使用者角色
  window.updateUserRole = async function(uid, newRole) {
    if (isProcessing) return;
    const user = cachedUsers.find(u => u.uid === uid);
    if (!user) return;

    let targetDistrict = user.districtId || null;
    let targetGroup = user.groupId || null;

    if (newRole === 'district_leader') {
      const dist = prompt(`請輸入 ${user.name || user.email} 負責的「牧區名稱」：`, targetDistrict || "");
      if (dist === null) return;
      targetDistrict = dist.trim();
    } else if (newRole === 'group_leader') {
      const grp = prompt(`請輸入 ${user.name || user.email} 負責的「小組名稱」：`, targetGroup || "");
      if (grp === null) return;
      targetGroup = grp.trim();
    }

    isProcessing = true;
    try {
      await window.db.collection('users').doc(uid).set({
        role: newRole,
        districtId: targetDistrict,
        groupId: targetGroup,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      alert(`已成功將 ${user.name || user.email} 角色更新為【${newRole}】！`);
      await loadUserListFromFirestore();
    } catch (err) {
      alert(`更新角色失敗：${err.message}`);
    } finally {
      isProcessing = false;
    }
  };

  // 啟停同工帳號
  window.toggleUserStatus = async function(uid, nextActive) {
    if (isProcessing) return;
    const user = cachedUsers.find(u => u.uid === uid);
    if (!user) return;

    const actionText = nextActive ? "開通並啟用" : "停用此";
    if (!confirm(`確定要${actionText}同工「${user.name || user.email}」嗎？`)) return;

    isProcessing = true;
    try {
      await window.db.collection('users').doc(uid).set({
        isActive: nextActive,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      await loadUserListFromFirestore();
    } catch (err) {
      alert(`更新狀態失敗：${err.message}`);
    } finally {
      isProcessing = false;
    }
  };

  // 表單送出新增
  document.addEventListener('DOMContentLoaded', () => {
    $('inviteUserForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (isProcessing) return;

      const name = $('formUserName').value.trim();
      const email = $('formUserEmail').value.trim().toLowerCase();
      const role = $('formUserRole').value;
      const district = $('formUserDistrict').value.trim();
      const group = $('formUserGroup').value.trim();
      const isActive = $('formUserActive').checked;

      if (!name || !email) {
        alert("請填寫姓名與 Google Email！");
        return;
      }

      isProcessing = true;
      try {
        // 以 email 特徵建立自訂 doc ID，或查詢是否已有既有文件
        const querySnap = await window.db.collection('users').where('email', '==', email).limit(1).get();
        let targetDocRef;
        if (!querySnap.empty) {
          targetDocRef = querySnap.docs[0].ref;
        } else {
          // 若對方尚未以 Google 登入過，以 email 為臨時 docId 建檔
          targetDocRef = window.db.collection('users').doc('user_' + email.replace(/[^a-zA-Z0-9]/g, '_'));
        }

        await targetDocRef.set({
          name: name,
          email: email,
          role: role,
          districtId: role === 'district_leader' ? district : null,
          groupId: role === 'group_leader' ? group : null,
          isActive: isActive,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        alert(`已成功預先配置同工【${name} (${email})】！
對方使用此 Google 帳號登入後即可直接取得授權。`);
        $('inviteUserForm').reset();
        handleRoleSelectionChange('viewer');
        await loadUserListFromFirestore();
      } catch (err) {
        alert(`新增失敗：${err.message}`);
      } finally {
        isProcessing = false;
      }
    });
  });

})();
