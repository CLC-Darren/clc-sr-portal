// CLC SR 權限管理：與 YA 相同的 Admin / Viewer 模型。
// 固定 Superuser 永遠顯示；其餘名單存放於 Firestore admin_users/{email}。
// 審核功能尚未串接：notifyReview 欄位先保留，日後串接時直接使用。
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const baseAdmins = (window.ADMIN_WHITELIST || []).map(x => String(x).trim().toLowerCase());
  let busy = false;
  let canEdit = false; // 只有 admin 可編輯；viewer 為唯讀

  const BTN = 'rounded-md px-2.5 py-1.5 border text-xs disabled:opacity-40';

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
      [...records.values()].sort((a,b)=>a.email.localeCompare(b.email)).forEach(data => {
        if (used.has(data.email)) return;
        rows.push({...data,bootstrap:false,exists:true,known:true});
      });
    }
    return rows;
  }

  function showRows(records, loaded) {
    const rows = baseRows(records, loaded);
    const editable = loaded && canEdit;
    $('usersCount').textContent = `${rows.length} 位管理員`;
    $('usersList').innerHTML = rows.map(u => {
      const active = u.bootstrap || u.active === true;
      const notice = !u.known ? '無法讀取' : (u.role === 'viewer' ? '檢視者・不寄信' : !active ? '帳號停用・不寄信' : (u.notifyReview ? '審核通知：開（尚未串接）' : '審核通知：關'));
      return `<div class="rounded-xl border border-slate-200 dark:border-slate-700 p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div class="min-w-0">
          <div class="font-semibold break-all">${esc(u.email)}</div>
          <div class="text-xs text-slate-500 dark:text-slate-400 mt-1">${u.bootstrap ? '🔒 Superuser · 永久保留（不可刪除、不可降權）' : ((u.role==='viewer'?'檢視者（唯讀）':'管理員')+(active?' · 已啟用':' · 已停用'))}</div>
        </div>
        <div class="flex flex-wrap items-center gap-2 sm:justify-end">
          <label class="flex items-center gap-1.5 text-xs ${editable && u.role!=='viewer'?'':'opacity-60'}">
            <input type="checkbox" class="accent-[#007E8A]" data-notify="${esc(u.email)}" ${u.known && u.notifyReview && u.role!=='viewer'?'checked':''} ${editable && u.role!=='viewer'?'':'disabled'} aria-label="${esc(u.email)} 接收審核 Email（保留選項）">接收審核 Email
          </label>
          <span class="text-[11px] ${u.known?(u.notifyReview?'text-emerald-500':'text-slate-500 dark:text-slate-400'):'text-amber-500'}">${notice}</span>
          ${u.bootstrap?'':`<button type="button" class="${BTN} border-slate-300 dark:border-slate-600 text-teal-700 dark:text-teal-300" data-role="${esc(u.email)}" ${editable?'':'disabled'}>${u.role==='viewer'?'改為管理員':'改為檢視者'}</button><button type="button" class="${BTN} border-slate-300 dark:border-slate-600 ${active?'text-rose-600 dark:text-rose-400':'text-emerald-600 dark:text-emerald-400'}" data-toggle="${esc(u.email)}" ${editable?'':'disabled'}>${active?'停用':'啟用'}</button><button type="button" class="${BTN} border-rose-400/70 dark:border-rose-700/70 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10" data-delete="${esc(u.email)}" ${editable?'':'disabled'} title="永久移除 ${esc(u.email)} 的管理員權限">刪除</button>`}
        </div>
      </div>`;
    }).join('');
    if (!loaded) return;
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
          await ref.set({role:'admin',active:true,notifyReview:el.checked,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
        } else if(row.exists) {
          // 只變更通知設定；不能因勾選而不小心啟用已停用的管理員。
          await ref.update({notifyReview:el.checked,updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
        } else {
          // 初始管理員原本可能只有固定白名單，第一次勾選時建立偏好文件。
          await ref.set({role:'admin',active:true,notifyReview:el.checked,updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
        }
        await render();
        $('usersListStatus').textContent='審核通知設定已儲存（日後串接審核功能後生效）。';
      }catch(e){
        $('usersListStatus').textContent='設定儲存失敗：'+e.message;
        alert('設定儲存失敗：'+e.message+'\n請先更新 Firestore Security Rules。');
        await render();
      }finally{busy=false;}
    }));
    // 僅允許刪除新增的管理員；固定 Superuser 不顯示刪除按鈕，Rules 也禁止刪除。
    $('usersList').querySelectorAll('[data-delete]').forEach(el=>el.addEventListener('click',async()=>{
      if(busy)return;
      const email=el.dataset.delete;
      const row=rows.find(r=>r.email===email);
      if(!row || row.bootstrap)return;
      if(!confirm(`確定永久刪除管理員「${email}」？\n\n將移除其後台權限與通知設定；日後如需恢復，必須重新新增。`))return;
      busy=true;el.disabled=true;
      $('usersListStatus').textContent=`正在刪除 ${email}…`;
      try {
        await window.db.collection('admin_users').doc(email).delete();
        await render();
        $('usersListStatus').textContent=`已刪除 ${email} 的管理員設定。`;
      }catch(e){
        alert('刪除失敗：'+e.message);
        await render();
      }finally{busy=false;}
    }));
    // 變更權限等級（管理員 <-> 檢視者）；檢視者一律不接收審核通知。
    $('usersList').querySelectorAll('[data-role]').forEach(el=>el.addEventListener('click',async()=>{
      if(busy||!canEdit)return;
      const row=rows.find(r=>r.email===el.dataset.role);
      if(!row||row.bootstrap)return;
      const next=row.role==='viewer'?'admin':'viewer';
      if(!confirm(`確定將「${row.email}」改為${next==='viewer'?'檢視者（唯讀）':'管理員（可編輯）'}？`))return;
      busy=true;el.disabled=true;
      try{
        const data={role:next,updatedAt:firebase.firestore.FieldValue.serverTimestamp()};
        if(next==='viewer') data.notifyReview=false;
        await window.db.collection('admin_users').doc(row.email).update(data);
        await render();
        $('usersListStatus').textContent='權限等級已更新，對方需重新整理以同步畫面。';
      }catch(e){alert('權限等級更新失敗：'+e.message);await render();}
      finally{busy=false;}
    }));
    $('usersList').querySelectorAll('[data-toggle]').forEach(el=>el.addEventListener('click',async()=>{
      if(busy)return;
      const row=rows.find(r=>r.email===el.dataset.toggle);
      if(!row || row.bootstrap || !confirm(`確定要${row.active?'停用':'啟用'}「${row.email}」？`)) return;
      busy=true;el.disabled=true;
      try {
        await window.db.collection('admin_users').doc(row.email).update({active:!row.active,updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
        await render();
        $('usersListStatus').textContent='管理員權限已更新，對方需重新整理以同步畫面。';
      }catch(e){alert('權限更新失敗：'+e.message);await render();}
      finally{busy=false;}
    }));
  }

  async function render() {
    const roleNow = (window.auth && window.auth.currentUser) ? await window.clcGetAdminRole(window.auth.currentUser) : null;
    canEdit = roleNow === 'admin';
    if(!roleNow) {
      $('access').classList.remove('hidden');
      $('access').textContent='請先從右上角使用已授權的 Google 管理員帳號登入。';
      $('mainPanel').classList.add('hidden');
      return;
    }
    $('access').classList.add('hidden');
    $('mainPanel').classList.remove('hidden');
    $('addForm').classList.toggle('hidden', !canEdit);
    $('viewerNote').classList.toggle('hidden', canEdit);
    // 即使 Firestore 權限尚未開放，也要先顯示固定的 Superuser。
    showRows(null,false);
    $('usersListStatus').textContent='正在讀取 Firestore 管理員設定…';
    try {
      const snap=await window.db.collection('admin_users').get();
      const records=new Map(snap.docs.map(d=> {
        const email=d.id.trim().toLowerCase();
        const data = d.data() || {};
        return [email,{...data,email,active:data.active !== false}];
      }));
      showRows(records,true);
      $('usersListStatus').textContent='新管理員使用相同 Google Email 登入；勾選或取消勾選後會立即儲存。';
    }catch(e){
      showRows(null,false);
      $('usersListStatus').innerHTML='<span class="text-amber-500 font-semibold">Firestore 權限尚未設定：</span>固定 Superuser 仍可登入，但無法讀取其他管理員或儲存設定。請到 Firebase Console 發布本包的 Firestore Rules。錯誤：'+esc(e.message);
    }
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
        if(old.exists){alert('管理員已存在，請在下方名單啟用或調整設定。');return;}
        const newRole=$('newRole').value==='viewer'?'viewer':'admin';
        await ref.set({role:newRole,active:true,notifyReview:newRole==='admin'&&$('newNotify').checked,updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
        input.value='';
        await render();
        alert('管理員已新增：'+email+'\n對方可使用此 Google 帳號登入。');
      }catch(e){alert('新增失敗：'+e.message+'\n請先更新 Firestore Security Rules。');await render();}
      finally{busy=false;}
    });
    $('newRole').addEventListener('change',()=>{const v=$('newRole').value==='viewer';$('newNotify').disabled=v;if(v)$('newNotify').checked=false;});
    window.addEventListener('clc-admin-changed',render);
    render();
  });
})();
