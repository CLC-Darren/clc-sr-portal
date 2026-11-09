/** CLC SR 管理員後台：YA 同款緊湊介面、SR 原有四個角色與範圍。
 *  `user_invites/{email}` 是預先指派；`users/{firebaseUid}` 是登入後的正式權限。
 *  Firebase Rules 必須先部署；本程式不會提升未獲授權的使用者。
 */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const EMAIL=/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/;
const ROLES={viewer:'檢視者（唯讀）',group_leader:'小組長',district_leader:'區長',admin:'管理員'};
let busy=false, rows=[], allowed=false;
const isBootstrap=email=>(window.INITIAL_ADMIN_WHITELIST||[]).some(s=>s.toLowerCase()===String(email||'').toLowerCase());
const norm=s=>String(s||'').trim().toLowerCase();
function status(s){$('usersListStatus').textContent=s||'';}
function scope(role,v){return role==='district_leader'?{districtId:v||null,groupId:null}:role==='group_leader'?{districtId:null,groupId:v||null}:{districtId:null,groupId:null};}
function needsScope(role){return role==='district_leader'||role==='group_leader';}
function addFormScope(){const need=needsScope($('newRole').value);$('newScopeWrap').classList.toggle('hidden',!need);$('newScope').required=need;if(!need)$('newScope').value='';$('newScope').placeholder=$('newRole').value==='district_leader'?'牧區 ID／名稱':'小組 ID／名稱';}
function baseRows(){return (window.INITIAL_ADMIN_WHITELIST||[]).map(email=>({email:norm(email),name:'初始管理員',role:'admin',isActive:true,bootstrap:true,docId:null,invited:false}));}
function keyOf(row){return norm(row.email);}
function sanitizeRow(r){return {email:norm(r.email),name:String(r.name||''),role:ROLES[r.role]?r.role:'viewer',isActive:r.isActive===true,districtId:r.districtId||null,groupId:r.groupId||null};}
async function render(){
  if(!allowed||!window.db)return;
  status('正在讀取同工與預先授權名單…');
  let userDocs,inviteDocs;
  try{[userDocs,inviteDocs]=await Promise.all([window.db.collection('users').get(),window.db.collection('user_invites').get()]);}
  catch(e){status('名單讀取失敗：'+e.message+'。請先部署 SR Firebase Rules。');$('usersList').innerHTML='';return;}
  const map=new Map(baseRows().map(x=>[keyOf(x),x]));
  for(const doc of inviteDocs.docs){
    const r=sanitizeRow({...doc.data(),email:doc.id});if(!r.email)continue;
    if(map.has(r.email)){map.get(r.email).invited=true;continue;}
    map.set(r.email,{...r,invited:true,inviteId:doc.id,docId:null,legacyId:null,bootstrap:false});
  }
  // 正式 UID 文件優先；舊版 user_email 形式只顯示供管理員修復，不隱藏。
  for(const doc of userDocs.docs){
    const data=doc.data()||{};const r=sanitizeRow(data);if(!r.email)continue;
    const base=map.get(r.email);if(base?.bootstrap)continue;
    const legacy=doc.id.startsWith('user_')&&!data.uid;
    if(base){
      if(legacy){base.legacyId=doc.id;base.legacyGrant=r;if(!base.docId&&!base.invited)Object.assign(base,r);}else Object.assign(base,r,{docId:doc.id});
    }else map.set(r.email,{...r,docId:legacy?null:doc.id,legacyId:legacy?doc.id:null,legacyGrant:legacy?r:null,invited:false,bootstrap:false});
  }
  rows=[...map.values()].sort((a,b)=>Number(b.bootstrap)-Number(a.bootstrap)||a.email.localeCompare(b.email));
  $('usersCount').textContent=`${rows.length} 位`;
  $('usersList').innerHTML=rows.map(r=>{
    const active=r.bootstrap||r.isActive;
    const detail=r.role==='district_leader'&&r.districtId?'牧區：'+r.districtId:r.role==='group_leader'&&r.groupId?'小組：'+r.groupId:'';
    const id=esc(r.email);
    const lockedSelf=!!(r.docId && r.docId===window.auth?.currentUser?.uid);
    return `<div class="rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-2"><span class="font-bold text-sm">${esc(r.name||r.email)}</span><span class="text-xs ${active?'text-emerald-600 dark:text-emerald-400':'text-rose-500'}">${active?'● 已啟用':'● 已停用'}</span></div>
        <div class="text-xs text-slate-500 dark:text-slate-400 mt-1 break-all">${id}</div>
        <div class="text-xs text-slate-500 dark:text-slate-400 mt-1">${r.bootstrap?'🔒 Superuser · 永久保留':esc(ROLES[r.role]||'檢視者')}${detail?' · '+esc(detail):''}${!r.docId&&!r.bootstrap?' · 尚未首次登入':''}${r.legacyId&&!r.invited?' · 舊版授權待同步':''}</div>
      </div>
      ${r.bootstrap?'<span class="text-xs text-amber-600 dark:text-amber-400 font-bold">不可刪除／停用／降權</span>':lockedSelf?'<span class="text-xs text-slate-500">不可修改自己的權限</span>':`
      <div class="flex flex-wrap gap-1.5 sm:justify-end" data-email="${id}">
        <select class="field text-xs sm:w-auto max-w-[150px]" data-action="role" aria-label="${id} 權限等級">${Object.entries(ROLES).map(([k,v])=>`<option value="${k}" ${r.role===k?'selected':''}>${esc(v)}</option>`).join('')}</select>
        <button class="btn btn-ghost" data-action="scope" title="設定牧區／小組">範圍</button>
        ${r.legacyId&&!r.invited?'<button class="btn btn-ghost" data-action="sync" title="將舊版授權設定同步到正式 UID 與新的邀請機制">套用舊授權</button>':''}
        <button class="btn btn-ghost" data-action="toggle">${active?'停用':'啟用'}</button>
        <button class="btn btn-danger" data-action="delete">移除</button>
      </div>`}
    </div>`;
  }).join('');
  status('');
}
async function updateRow(row,patch){
  const email=keyOf(row);if(!EMAIL.test(email)||row.bootstrap)throw new Error('固定管理員或信箱格式無效，不允許修改。');
  const dest={...sanitizeRow(row),...patch,email};
  const update={name:dest.name,role:dest.role,isActive:dest.isActive,districtId:dest.districtId||null,groupId:dest.groupId||null,email,updatedAt:firebase.firestore.FieldValue.serverTimestamp()};
  const batch=window.db.batch();
  // 提前授權資料與既有 UID 權限同步更新，避免停用後再次登入時恢復舊權限。
  batch.set(window.db.collection('user_invites').doc(email),update,{merge:true});
  if(row.docId)batch.set(window.db.collection('users').doc(row.docId),update,{merge:true});
  // 老版本殘留的 user_email 也是有權限的資料，維持同步直到人工清理。
  if(row.legacyId)batch.set(window.db.collection('users').doc(row.legacyId),update,{merge:true});
  await batch.commit();
}
async function removeRow(row){
  if(row.bootstrap)throw new Error('不能移除固定 Superuser');
  const batch=window.db.batch();
  batch.delete(window.db.collection('user_invites').doc(row.email));
  if(row.docId)batch.delete(window.db.collection('users').doc(row.docId));
  if(row.legacyId)batch.delete(window.db.collection('users').doc(row.legacyId));
  await batch.commit();
}
async function operate(button){
  if(!allowed||busy)return;
  const holder=button.closest('[data-email]');if(!holder)return;
  const row=rows.find(r=>r.email===holder.dataset.email);if(!row||row.bootstrap)return;
  const type=button.dataset.action;let patch=null;
  if(type==='role'){
    const newRole=button.value;
    if(!ROLES[newRole]||newRole===row.role)return;
    let sc='';
    if(needsScope(newRole)){
      sc=prompt(`請輸入 ${row.email} 的${newRole==='district_leader'?'牧區':'小組'} ID／名稱：`,newRole==='district_leader'?row.districtId||'':row.groupId||'');
      if(sc===null)return;sc=sc.trim();if(!sc){alert('此角色必須填寫管轄範圍。');button.value=row.role;return;}
    }
    if(!confirm(`確定將 ${row.email} 的角色改為「${ROLES[newRole]}」？`)){button.value=row.role;return;}
    patch={role:newRole,...scope(newRole,sc)};
  }else if(type==='scope'){
    if(!needsScope(row.role)){alert('此角色不需要指定管轄範圍。');return;}
    const key=row.role==='district_leader'?'districtId':'groupId';const sc=prompt('請輸入新的'+(key==='districtId'?'牧區':'小組')+' ID／名稱：',row[key]||'');if(sc===null)return;if(!sc.trim()){alert('範圍不可空白。');return;}patch=scope(row.role,sc.trim());
  }else if(type==='sync'){
    if(!confirm(`確定將「${row.email}」的既有授權同步到新版 Email 邀請機制？`))return;
    patch=row.legacyGrant?{name:row.legacyGrant.name,role:row.legacyGrant.role,isActive:row.legacyGrant.isActive,districtId:row.legacyGrant.districtId,groupId:row.legacyGrant.groupId}:{};
  }else if(type==='toggle'){
    if(!confirm(`確定要${row.isActive?'停用':'啟用'}「${row.email}」嗎？`))return;
    patch={isActive:!row.isActive};
  }else if(type==='delete'){
    if(!confirm(`確定移除「${row.email}」的 SR 授權？\n其 Firebase/Google 帳號不會被刪除。`))return;
    if(!confirm('再次確認：移除後如需恢復，必須重新新增授權。'))return;
  }else return;
  busy=true;button.disabled=true;status('正在儲存權限變更…');
  try{if(type==='delete')await removeRow(row);else await updateRow(row,patch);await render();status('權限已更新；對方登入後會套用新的 SR 權限。');}
  catch(e){alert('權限更新失敗：'+e.message);await render();}finally{busy=false;}
}
window.addEventListener('clc-auth-ready',e=>{
  allowed=!!(e.detail?.signedIn&&window.isAdmin===true&&window.db);
  $('mainPanel').classList.toggle('hidden',!allowed);$('access').classList.toggle('hidden',allowed);
  if(allowed)render();
  else $('access').textContent=window.SR_FIREBASE_READY===false?'SR Firebase 設定尚未完成：請先在 header.js 填入 SR 專案的有效 Web App Config。':window.auth?.currentUser?'此帳號不是 SR 系統管理員，無法查看或修改權限。':'請點右上角登入已授權的 SR 管理員 Google 帳號。';
});
document.addEventListener('DOMContentLoaded',()=>{
  $('newRole').addEventListener('change',addFormScope);addFormScope();
  $('usersList').addEventListener('click',e=>{const el=e.target.closest('button[data-action]');if(el)operate(el);});
  $('usersList').addEventListener('change',e=>{const el=e.target.closest('select[data-action]');if(el)operate(el);});
  $('addForm').addEventListener('submit',async e=>{
    e.preventDefault();if(!allowed||busy)return;
    const email=norm($('newEmail').value),name=$('newName').value.trim(),role=$('newRole').value,sc=$('newScope').value.trim();
    if(!EMAIL.test(email)){alert('請填寫有效的 Google Email。');return;}
    if(isBootstrap(email)){alert('此帳號已是固定 Superuser。');return;}
    if(needsScope(role)&&!sc){alert('區長／小組長必須指定管轄範圍。');return;}
    if(rows.some(r=>r.email===email)){alert('此 Email 已存在，請在下方名單直接調整角色或啟用。');return;}
    if(!ROLES[role])return;
    busy=true;status('正在新增預先授權…');
    try{
      const ref=window.db.collection('user_invites').doc(email);
      // 用 transaction 確認還沒有其他管理員建立同一個預先授權。
      await window.db.runTransaction(async tx=>{
        const existing=await tx.get(ref);
        if(existing.exists)throw new Error('同一 Email 已存在預先授權，請重新整理。');
        tx.set(ref,{email,name,role,isActive:$('newActive').checked,...scope(role,sc),createdAt:firebase.firestore.FieldValue.serverTimestamp(),updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
      });
      $('addForm').reset();addFormScope();await render();status('已新增授權；同工首次登入後會套用對應角色。');
    }catch(err){alert('新增授權失敗：'+err.message);await render();}finally{busy=false;}
  });
  if(window.SR_FIREBASE_READY===false){$('access').textContent='SR Firebase Web App 設定不完整，請先完成部署前檢查清單。';}
});
})();
