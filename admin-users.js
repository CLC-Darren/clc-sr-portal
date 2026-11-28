// CLC SR 全站設定：畫面用 LF 共用後台（shared/admin/admin.v1.js），這裡只寫設定與資料讀寫。
// Superuser（header.js 的 ADMIN_WHITELIST）與 Admin 可以改；Viewer 唯讀；牧區／小組長（leader）不能進來。
// 審核功能尚未串接：notifyReview 欄位先保留（只有 Admin、Superuser 可以開）。
(function () {
  'use strict';
  const SUPERUSERS = (window.ADMIN_WHITELIST || []).map(x => String(x).trim().toLowerCase());
  const db = window.db, now = () => firebase.firestore.FieldValue.serverTimestamp();
  const users = () => db.collection('admin_users'), names = () => db.collection('admin_user_names');
  let groups = [], districts = [], watching = false;
  const pickable = () => groups.filter(g => !(window.SR && SR.isStaffGroup(g)));
  const scope = d => ({ leadDistricts: d.leadDistricts || [], leadGroups: d.leadGroups || [], scopeGroups: SR.computeScope(d.leadDistricts || [], d.leadGroups || [], groups) });
  function watch() {
    if (watching || !window.SR) return; watching = true;
    const fail = e => console.warn('讀取牧區／小組失敗', e);
    SR.watchGroups(list => { groups = list; }, fail);
    SR.watchDistricts(list => { districts = list; }, fail);
  }

  const ui = LFAdmin.mount(document.getElementById('clcAdmin'), {
    brand: 'DX', title: '全站設定', backHref: 'index.html', underHeader: true, themeToggle: false,
    categories: [{
      id: 'users', icon: '👤', title: '權限管理', type: 'users',
      desc: '管理員可編輯全部；檢視者全站唯讀；牧區／小組長只看自己負責的牧區或小組。新增者需使用相同 Google Email 登入。',
      superusers: SUPERUSERS,
      roles: [
        { value: 'admin', label: '管理員（可編輯全部）', short: '管理員' },
        { value: 'viewer', label: '檢視者（全站唯讀）', short: '檢視者' },
        { value: 'leader', label: '牧區／小組長（只看自己負責的）', short: '牧區／小組長' }
      ],
      extraSwitches: [{ key: 'notifyReview', label: '接收審核 Email', hint: '保留選項，審核功能尚未串接', showIf: r => r === 'admin' || r === 'superuser' }],
      extraChecks: [
        { key: 'leadDistricts', label: '擔任區長的牧區', hint: '看、改這個牧區所有小組', options: () => districts.map(d => ({ value: d.id, label: d.name })), empty: '還沒有牧區，請先到「牧區與小組」新增。', showIf: r => r === 'leader' },
        { key: 'leadGroups', label: '擔任小組長的小組', hint: '看、改這個小組', options: () => pickable().map(g => ({ value: g.id, label: g.name })), showIf: r => r === 'leader' }
      ],
      async load() {
        watch();
        const [u, n] = await Promise.all([users().get(), names().get().catch(() => null)]);
        const nm = new Map(n ? n.docs.map(d => [d.id, d.data().name]) : []);
        const byEmail = new Map(u.docs.map(d => [d.id.trim().toLowerCase(), d.data() || {}]));
        const list = [...byEmail].map(([email, d]) => Object.assign({ email }, d, { name: nm.get(email) || '', role: ['admin', 'viewer', 'leader'].includes(d.role) ? d.role : 'admin', notifyReview: d.notifyReview === true }));
        SUPERUSERS.forEach(e => { if (!byEmail.has(e)) list.push({ email: e, name: nm.get(e) || '', notifyReview: false }); });
        return list;
      },
      async add(d) {
        const ref = users().doc(d.email);
        if ((await ref.get()).exists) throw new Error('這個帳號已在名單中');
        const data = { role: d.role, active: d.active, notifyReview: d.role === 'admin' && !!d.notifyReview, updatedAt: now() };
        if (d.role === 'leader') Object.assign(data, scope(d));
        const batch = db.batch();
        batch.set(ref, data);
        if (d.name) batch.set(names().doc(d.email), { name: d.name });
        await batch.commit();
      },
      async update(email, p) {
        if ('name' in p) await names().doc(email).set({ name: p.name });
        const rest = Object.assign({}, p); delete rest.name;
        const sup = SUPERUSERS.includes(email);
        if (sup) { // Superuser 只能改「接收審核 Email」
          if ('notifyReview' in rest) await users().doc(email).set({ role: 'admin', active: true, notifyReview: rest.notifyReview, updatedAt: now() }, { merge: true });
          return;
        }
        if ('leadDistricts' in rest || 'leadGroups' in rest) Object.assign(rest, scope(rest));
        if (rest.role && rest.role !== 'admin') rest.notifyReview = false;
        if (Object.keys(rest).length) await users().doc(email).update(Object.assign(rest, { updatedAt: now() }));
      },
      async remove(email) { const b = db.batch(); b.delete(users().doc(email)); b.delete(names().doc(email)); await b.commit(); },
      forceLogout: email => users().doc(email).update({ forceLogoutAt: now(), updatedAt: now() })
    }]
  });

  if (!window.auth) return ui.setAccess(false, '登入服務尚未載入，請重新整理。');
  window.auth.onAuthStateChanged(async u => {
    const role = u ? await window.clcGetAdminRole(u) : null;
    if (role === 'admin' || role === 'viewer') return ui.setAccess(true, '', { readOnly: role !== 'admin' });
    ui.setAccess(false, role === 'leader' ? '權限管理只有管理員和檢視者可以查看。' : '請先從右上角使用已授權的 Google 管理員帳號登入。');
  });
})();
