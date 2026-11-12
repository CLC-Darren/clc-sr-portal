// CLC SR 權限管理：Admin / Viewer（與 YA 相同）＋ SR 的牧區長、小組長。
// 固定 Superuser 永遠顯示；其餘名單存放於 Firestore admin_users/{email}。
// 牧區長／小組長的範圍：leadDistricts（區長的牧區）、leadGroups（小組長的小組），
// 存檔時展開成 scopeGroups 給資料庫規則使用。檢視者也可以兼任（身分疊加）。
// 審核功能尚未串接：notifyReview 欄位先保留，日後串接時直接使用。
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const baseAdmins = (window.ADMIN_WHITELIST || []).map(x => String(x).trim().toLowerCase());
  const ROLE_LABEL = { admin: '管理員（可編輯全部）', viewer: '檢視者（全站唯讀）', leader: '牧區／小組長（只看自己負責的）' };
  const ROLE_SHORT = { admin: '管理員', viewer: '檢視者（唯讀）', leader: '牧區／小組長' };
  let busy = false;
  let canEdit = false; // 只有 admin 可編輯；viewer 為唯讀
  let groups = [], districts = [];
  let state = { records: null, loaded: false };
  let openScope = null; // 正在設定範圍的帳號（重畫時保持打開）

  const BTN = 'rounded-md px-2.5 py-1.5 border text-xs disabled:opacity-40';
  const serverTime = () => firebase.firestore.FieldValue.serverTimestamp();
  const pickable = () => groups.filter(g => !(window.SR && SR.isStaffGroup(g)));   // 加樂同工不歸牧區、也不設小組長
  const nameOfD = id => (districts.find(d => d.id === id) || {}).name;
  const nameOfG = id => (groups.find(g => g.id === id) || {}).name;

  function scopeText(u) {
    const ds = (u.leadDistricts || []).map(nameOfD).filter(Boolean);
    const gs = (u.leadGroups || []).map(nameOfG).filter(Boolean);
    const parts = [ds.length ? '區長：' + ds.join('、') : '', gs.length ? '小組長：' + gs.join('、') : ''].filter(Boolean);
    return parts.join('；');
  }

  function baseRows(records, loaded) {
    const rows = [];
    const used = new Set();
    // 固定 Superuser 永遠顯示：不依賴 Firestore 查詢成功才呈現。
    baseAdmins.forEach(email => {
      const data = records && records.get(email);
      rows.push({email, bootstrap:true, active:true, role:'superuser',
        notifyReview: data ? data.notifyReview === true : false,
        exists: !!data, known:loaded});
      used.add(email);
    });
    if (records) {
      const order = { admin: 0, viewer: 1, leader: 2 };
      [...records.values()].sort((a,b)=>(order[a.role] ?? 3) - (order[b.role] ?? 3) || a.email.localeCompare(b.email)).forEach(data => {
        if (used.has(data.email)) return;
        rows.push({...data,bootstrap:false,exists:true,known:true});
      });
    }
    return rows;
  }

  // 範圍設定：牧區（區長）＋小組（小組長）
  function scopeEditor(u, editable) {
    const dis = editable ? '' : ' disabled';
    const ld = new Set(u.leadDistricts || []), lg = new Set(u.leadGroups || []);
    const dList = districts.length
      ? districts.map(d => `<label class="inline-flex items-center gap-1.5 mr-3 mb-1.5 whitespace-nowrap"><input type="checkbox" class="accent-[#007E8A]" data-sd="${esc(d.id)}"${ld.has(d.id) ? ' checked' : ''}${dis}>${esc(d.name)}</label>`).join('')
      : '<span class="text-slate-500">還沒有牧區，請先到「牧區與小組」新增。</span>';
    const gList = pickable().map(g => `<label class="inline-flex items-center gap-1.5 mr-3 mb-1.5 whitespace-nowrap"><input type="checkbox" class="accent-[#007E8A]" data-sg="${esc(g.id)}"${lg.has(g.id) ? ' checked' : ''}${dis}>${esc(g.name)}</label>`).join('');
    return `<div class="mt-3 rounded-lg bg-slate-100 dark:bg-white/5 p-3 space-y-3 text-xs" data-scope-box="${esc(u.email)}">
      <div><div class="font-bold mb-1.5">擔任區長的牧區 <span class="font-normal text-slate-500">（看、改這個牧區所有小組）</span></div>${dList}</div>
      <div><div class="font-bold mb-1.5">擔任小組長的小組 <span class="font-normal text-slate-500">（看、改這個小組）</span></div>${gList}</div>
      ${editable ? `<div class="flex gap-2"><button type="button" class="${BTN} bg-[#007E8A] border-[#007E8A] text-white" data-scope-save="${esc(u.email)}">儲存範圍</button><button type="button" class="${BTN} border-slate-300 dark:border-slate-600" data-scope-close>取消</button></div>` : ''}
    </div>`;
  }

  function showRows() {
    const { records, loaded } = state;
    const rows = baseRows(records, loaded);
    const editable = loaded && canEdit;
    $('usersCount').textContent = `${rows.length} 個帳號`;
    $('usersList').innerHTML = rows.map(u => {
      const active = u.bootstrap || u.active === true;
      const role = u.bootstrap ? 'superuser' : (ROLE_SHORT[u.role] ? u.role : 'admin');
      const scoped = role === 'viewer' || role === 'leader';
      const sText = scoped ? scopeText(u) : '';
      const notice = !u.known ? '無法讀取' : (role !== 'admin' && role !== 'superuser' ? '不寄信' : !active ? '帳號停用・不寄信' : (u.notifyReview ? '審核通知：開（尚未串接）' : '審核通知：關'));
      const canNotify = editable && (role === 'admin' || role === 'superuser');
      return `<div class="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div class="min-w-0">
            <div class="font-semibold break-all">${esc(u.email)}</div>
            <div class="text-xs text-slate-500 dark:text-slate-400 mt-1">${u.bootstrap ? '🔒 Superuser · 永久保留（不可刪除、不可降權）' : (ROLE_SHORT[role] + (active ? ' · 已啟用' : ' · 已停用'))}</div>
            ${scoped ? `<div class="text-xs mt-1 ${sText ? 'text-teal-700 dark:text-teal-300' : (role === 'leader' ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400')}">${sText ? esc(sText) : (role === 'leader' ? '⚠️ 還沒有指派牧區或小組' : '未兼任區長、小組長')}</div>` : ''}
          </div>
          <div class="flex flex-wrap items-center gap-2 sm:justify-end">
            ${role === 'admin' || role === 'superuser' ? `<label class="flex items-center gap-1.5 text-xs ${canNotify?'':'opacity-60'}">
              <input type="checkbox" class="accent-[#007E8A]" data-notify="${esc(u.email)}" ${u.known && u.notifyReview?'checked':''} ${canNotify?'':'disabled'} aria-label="${esc(u.email)} 接收審核 Email（保留選項）">接收審核 Email
            </label>` : ''}
            <span class="text-[11px] ${u.known?(u.notifyReview?'text-emerald-500':'text-slate-500 dark:text-slate-400'):'text-amber-500'}">${notice}</span>
            ${u.bootstrap?'':`<label><span class="sr-only">${esc(u.email)} 的權限等級</span><select class="${BTN} bg-transparent border-slate-300 dark:border-slate-600 text-teal-700 dark:text-teal-300" data-role="${esc(u.email)}" ${editable?'':'disabled'}>
                ${['admin','viewer','leader'].map(r => `<option value="${r}"${r===role?' selected':''}>${ROLE_SHORT[r]}</option>`).join('')}
              </select></label>
              ${scoped ? `<button type="button" class="${BTN} border-slate-300 dark:border-slate-600 text-teal-700 dark:text-teal-300" data-scope="${esc(u.email)}">${editable ? '設定範圍' : '查看範圍'}</button>` : ''}
              <button type="button" class="${BTN} border-slate-300 dark:border-slate-600 ${active?'text-rose-600 dark:text-rose-400':'text-emerald-600 dark:text-emerald-400'}" data-toggle="${esc(u.email)}" ${editable?'':'disabled'}>${active?'停用':'啟用'}</button>
              <button type="button" class="${BTN} border-rose-400/70 dark:border-rose-700/70 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10" data-delete="${esc(u.email)}" ${editable?'':'disabled'} title="永久移除 ${esc(u.email)} 的權限">刪除</button>`}
          </div>
        </div>
        ${scoped && openScope === u.email ? scopeEditor(u, editable) : ''}
      </div>`;
    }).join('');
    if (!loaded) return;
    bindRows(rows);
  }

  function bindRows(rows) {
    $('usersList').querySelectorAll('[data-notify]').forEach(el=>el.addEventListener('change',async()=>{
      if(busy)return;
      const email=el.dataset.notify;
      const row=rows.find(r=>r.email===email);
      if(!row)return;
      busy=true;el.disabled=true;
      $('usersListStatus').textContent='正在儲存審核通知設定…';
      try {
        const ref=window.db.collection('admin_users').doc(email);
        if(row.exists && row.bootstrap) {
          // 初始管理員權限不可停用；兼容先前可能儲存過 active:false 的舊文件。
          await ref.set({role:'admin',active:true,notifyReview:el.checked,updatedAt:serverTime()},{merge:true});
        } else if(row.exists) {
          // 只變更通知設定；不能因勾選而不小心啟用已停用的管理員。
          await ref.update({notifyReview:el.checked,updatedAt:serverTime()});
        } else {
          // 初始管理員原本可能只有固定白名單，第一次勾選時建立偏好文件。
          await ref.set({role:'admin',active:true,notifyReview:el.checked,updatedAt:serverTime()});
        }
        await render();
        $('usersListStatus').textContent='審核通知設定已儲存（日後串接審核功能後生效）。';
      }catch(e){
        $('usersListStatus').textContent='設定儲存失敗：'+e.message;
        alert('設定儲存失敗：'+e.message+'\n請先更新 Firestore Security Rules。');
        await render();
      }finally{busy=false;}
    }));
    // 僅允許刪除新增的帳號；固定 Superuser 不顯示刪除按鈕，Rules 也禁止刪除。
    $('usersList').querySelectorAll('[data-delete]').forEach(el=>el.addEventListener('click',async()=>{
      if(busy)return;
      const email=el.dataset.delete;
      const row=rows.find(r=>r.email===email);
      if(!row || row.bootstrap)return;
      if(!confirm(`確定永久刪除「${email}」的權限？\n\n將移除其後台權限、負責範圍與通知設定；日後如需恢復，必須重新新增。`))return;
      busy=true;el.disabled=true;
      $('usersListStatus').textContent=`正在刪除 ${email}…`;
      try {
        await window.db.collection('admin_users').doc(email).delete();
        await render();
        $('usersListStatus').textContent=`已刪除 ${email} 的權限設定。`;
      }catch(e){
        alert('刪除失敗：'+e.message);
        await render();
      }finally{busy=false;}
    }));
    // 變更權限等級；非管理員一律不接收審核通知。
    $('usersList').querySelectorAll('[data-role]').forEach(el=>el.addEventListener('change',async()=>{
      if(busy||!canEdit)return;
      const row=rows.find(r=>r.email===el.dataset.role);
      if(!row||row.bootstrap)return;
      const next=el.value;
      if(!ROLE_SHORT[next] || next===row.role)return;
      if(!confirm(`確定將「${row.email}」改為 ${ROLE_LABEL[next]}？`)){el.value=row.role;return;}
      busy=true;el.disabled=true;
      try{
        const data={role:next,updatedAt:serverTime()};
        if(next!=='admin') data.notifyReview=false;
        await window.db.collection('admin_users').doc(row.email).update(data);
        if(next!=='admin') openScope=row.email;
        await render();
        $('usersListStatus').textContent=next==='leader'&&!scopeText(row)?'權限等級已更新。請在下方勾選他負責的牧區或小組。':'權限等級已更新，對方需重新整理以同步畫面。';
      }catch(e){alert('權限等級更新失敗：'+e.message);await render();}
      finally{busy=false;}
    }));
    $('usersList').querySelectorAll('[data-toggle]').forEach(el=>el.addEventListener('click',async()=>{
      if(busy)return;
      const row=rows.find(r=>r.email===el.dataset.toggle);
      if(!row || row.bootstrap || !confirm(`確定要${row.active?'停用':'啟用'}「${row.email}」？`)) return;
      busy=true;el.disabled=true;
      try {
        await window.db.collection('admin_users').doc(row.email).update({active:!row.active,updatedAt:serverTime()});
        await render();
        $('usersListStatus').textContent='權限已更新，對方需重新整理以同步畫面。';
      }catch(e){alert('權限更新失敗：'+e.message);await render();}
      finally{busy=false;}
    }));
    $('usersList').querySelectorAll('[data-scope]').forEach(el=>el.addEventListener('click',()=>{
      openScope = openScope===el.dataset.scope ? null : el.dataset.scope;
      showRows();
    }));
    $('usersList').querySelectorAll('[data-scope-close]').forEach(el=>el.addEventListener('click',()=>{ openScope=null; showRows(); }));
    $('usersList').querySelectorAll('[data-scope-save]').forEach(el=>el.addEventListener('click',async()=>{
      if(busy||!canEdit)return;
      const email=el.dataset.scopeSave;
      const box=$('usersList').querySelector(`[data-scope-box="${CSS.escape(email)}"]`);
      const leadDistricts=[...box.querySelectorAll('[data-sd]:checked')].map(x=>x.dataset.sd);
      const leadGroups=[...box.querySelectorAll('[data-sg]:checked')].map(x=>x.dataset.sg);
      busy=true;el.disabled=true;
      try{
        await window.db.collection('admin_users').doc(email).update({
          leadDistricts, leadGroups, scopeGroups: SR.computeScope(leadDistricts, leadGroups, groups), updatedAt:serverTime()
        });
        openScope=null;
        await render();
        $('usersListStatus').textContent=`已儲存 ${email} 的負責範圍，對方重新整理後生效。`;
      }catch(e){alert('範圍儲存失敗：'+e.message+'\n請確認 Firestore Rules 已發布最新版本。');await render();}
      finally{busy=false;}
    }));
  }

  async function render() {
    const roleNow = (window.auth && window.auth.currentUser) ? await window.clcGetAdminRole(window.auth.currentUser) : null;
    canEdit = roleNow === 'admin';
    // 牧區／小組長不能看帳號名單
    if(roleNow !== 'admin' && roleNow !== 'viewer') {
      $('access').classList.remove('hidden');
      $('access').textContent = roleNow === 'leader' ? '權限管理只有管理員和檢視者可以查看。' : '請先從右上角使用已授權的 Google 管理員帳號登入。';
      $('mainPanel').classList.add('hidden');
      return;
    }
    $('access').classList.add('hidden');
    $('mainPanel').classList.remove('hidden');
    $('addForm').classList.toggle('hidden', !canEdit);
    $('viewerNote').classList.toggle('hidden', canEdit);
    startLists();
    // 即使 Firestore 權限尚未開放，也要先顯示固定的 Superuser。
    if (!state.loaded) { state = { records: null, loaded: false }; showRows(); }
    $('usersListStatus').textContent='正在讀取 Firestore 權限設定…';
    try {
      const snap=await window.db.collection('admin_users').get();
      const records=new Map(snap.docs.map(d=> {
        const email=d.id.trim().toLowerCase();
        const data = d.data() || {};
        return [email,{...data,email,active:data.active !== false}];
      }));
      state = { records, loaded: true };
      showRows();
      $('usersListStatus').textContent='對方使用相同 Google Email 登入即可；更改後立即儲存。';
    }catch(e){
      state = { records: null, loaded: false };
      showRows();
      $('usersListStatus').innerHTML='<span class="text-amber-500 font-semibold">Firestore 權限尚未設定：</span>固定 Superuser 仍可登入，但無法讀取其他帳號或儲存設定。請到 Firebase Console 發布本包的 Firestore Rules。錯誤：'+esc(e.message);
    }
  }

  // 牧區、小組清單（設定範圍用）
  let listsStarted = false;
  function startLists() {
    if (listsStarted || !window.SR) return;
    listsStarted = true;
    const fail = e => console.warn('讀取牧區／小組失敗', e);
    SR.watchGroups(list => { groups = list; renderAddScope(); if (state.loaded) showRows(); }, fail);
    SR.watchDistricts(list => { districts = list; renderAddScope(); if (state.loaded) showRows(); }, fail);
  }
  function renderAddScope() {
    const box = $('newScope');
    if (!box) return;
    const keepD = new Set([...box.querySelectorAll('[data-sd]:checked')].map(x => x.dataset.sd));
    const keepG = new Set([...box.querySelectorAll('[data-sg]:checked')].map(x => x.dataset.sg));
    box.innerHTML = scopeEditor({ email: '_new', leadDistricts: [...keepD], leadGroups: [...keepG] }, false)
      .replace(/ disabled/g, '');
  }

  document.addEventListener('DOMContentLoaded',()=>{
    $('addForm').addEventListener('submit',async event=>{
      event.preventDefault();
      if(busy || !canEdit)return;
      const input=$('newEmail');
      const email=input.value.trim().toLowerCase();
      if(!/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(email)){alert('請輸入有效的 Google 帳號 Email。');return;}
      if(baseAdmins.includes(email)){alert('這個帳號已是固定 Superuser，請在下方直接設定通知選項。');return;}
      busy=true;
      try {
        const ref=window.db.collection('admin_users').doc(email);
        const old=await ref.get();
        if(old.exists){alert('這個帳號已經在名單裡，請在下方調整。');return;}
        const newRole=ROLE_SHORT[$('newRole').value] ? $('newRole').value : 'admin';
        const data={role:newRole,active:true,notifyReview:newRole==='admin'&&$('newNotify').checked,updatedAt:serverTime()};
        if(newRole!=='admin'){
          const box=$('newScope');
          data.leadDistricts=[...box.querySelectorAll('[data-sd]:checked')].map(x=>x.dataset.sd);
          data.leadGroups=[...box.querySelectorAll('[data-sg]:checked')].map(x=>x.dataset.sg);
          data.scopeGroups=SR.computeScope(data.leadDistricts,data.leadGroups,groups);
          if(newRole==='leader' && !data.scopeGroups.length && !confirm('還沒有勾選負責的牧區或小組，對方登入後會看不到任何組員。要先新增嗎？')) return;
        }
        await ref.set(data);
        input.value='';
        $('newScope').querySelectorAll('input[type=checkbox]').forEach(x=>{x.checked=false;});
        await render();
        alert('已新增：'+email+'\n對方可使用此 Google 帳號登入。');
      }catch(e){alert('新增失敗：'+e.message+'\n請先更新 Firestore Security Rules。');await render();}
      finally{busy=false;}
    });
    const syncNewRole=()=>{
      const r=$('newRole').value;
      $('newNotify').disabled=r!=='admin'; if(r!=='admin')$('newNotify').checked=false;
      $('newNotifyWrap').classList.toggle('hidden', r!=='admin');
      $('newScopeWrap').classList.toggle('hidden', r==='admin');
    };
    $('newRole').addEventListener('change',syncNewRole);
    syncNewRole();
    window.addEventListener('clc-admin-changed',render);
    render();
  });
})();
