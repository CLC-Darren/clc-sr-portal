/**
 * 首頁功能圖示（YA、SR 共用，做法同 DX04「分站入口」）
 * - 清單存在 Firestore system_config/home_apps（沿用既有規則：所有人可讀、Admin 可寫），本機另存快取讓畫面先出來。
 * - Admin：長按任一格進入編輯模式（晃動）→ 按「−」移除、按「＋」新增、點圖示改名稱／網址／圖示；
 *   手機長按後直接拖曳可排序，電腦直接拖曳排序。
 * - 圖示可填 emoji（例如 🎵）或圖片網址。
 * 使用方式：<div id="homeApps" data-site="ya"></div>，並在 header.js、js/reorder.js 之後載入本檔。
 * 預設清單放在 window.CLC_HOME_APPS_DEFAULT（各站 index.html 內設定）。
 */
(function () {
  const grid = document.getElementById('homeApps');
  if (!grid) return;
  const SITE = grid.dataset.site || 'site';
  const CACHE_KEY = 'clc_' + SITE + '_home_apps';
  const MAX_APPS = 24, LONG_PRESS_MS = 550;
  const DEFAULT_APPS = Array.isArray(window.CLC_HOME_APPS_DEFAULT) ? window.CLC_HOME_APPS_DEFAULT : [];
  let apps = DEFAULT_APPS;
  let editing = false;
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (Array.isArray(cached)) apps = cached;
  } catch (_) {}

  const css = `
    #homeApps .ha-cell { position:relative; aspect-ratio:1; }
    #homeApps .ha-tile { width:100%; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:12px; border-radius:1.5rem; background:#007E8A; color:#fff; box-shadow:0 10px 15px -3px rgba(0,126,138,.2); transition:transform .2s, background-color .2s; text-decoration:none; border:0; cursor:pointer; -webkit-touch-callout:none; -webkit-user-select:none; user-select:none; font:inherit; }
    #homeApps .ha-tile:hover { background:#006C77; }
    #homeApps .ha-tile:active { transform:scale(.95); }
    #homeApps .ha-tile:focus-visible { outline:4px solid #2dd4bf; outline-offset:2px; }
    #homeApps .ha-icon { font-size:1.875rem; line-height:1; margin-bottom:.5rem; transition:transform .2s; }
    #homeApps .ha-tile:hover .ha-icon { transform:scale(1.1); }
    #homeApps .ha-icon img { width:2.25rem; height:2.25rem; border-radius:22%; object-fit:cover; display:block; pointer-events:none; }
    #homeApps .ha-name { font-size:.875rem; font-weight:800; letter-spacing:-.01em; white-space:nowrap; max-width:100%; overflow:hidden; text-overflow:ellipsis; display:flex; align-items:center; }
    #homeApps .ha-name svg { width:14px; height:14px; margin-left:4px; opacity:.8; flex:none; }
    @media (min-width:640px) { #homeApps .ha-icon { font-size:2.25rem; margin-bottom:.75rem; } #homeApps .ha-icon img { width:2.75rem; height:2.75rem; } }
    @media (min-width:1024px) { #homeApps .ha-name { font-size:1rem; } }
    #homeApps .ha-slot { aspect-ratio:1; border-radius:1.5rem; border:2px dashed #cbd5e1; color:#94a3b8; display:grid; place-content:center; font-size:2.25rem; font-weight:300; line-height:1; background:rgba(248,250,252,.5); user-select:none; -webkit-user-select:none; }
    .dark #homeApps .ha-slot { border-color:#334155; color:#64748b; background:rgba(255,255,255,.02); }
    #homeApps .ha-slot.is-admin { cursor:pointer; -webkit-touch-callout:none; font:inherit; font-size:2.25rem; font-weight:300; }
    #homeApps .ha-slot.is-admin:hover { border-color:#007E8A; color:#007E8A; }
    #homeApps .ha-menu { position:absolute; left:0; right:0; top:100%; margin-top:8px; z-index:50; overflow:hidden; text-align:left; border-radius:1rem; background:#fff; border:1px solid #e2e8f0; box-shadow:0 25px 50px -12px rgba(0,0,0,.25); }
    .dark #homeApps .ha-menu { background:#161924; border-color:rgba(255,255,255,.1); }
    #homeApps .ha-menu a { display:flex; align-items:center; gap:8px; padding:12px 16px; font-size:.875rem; font-weight:700; color:#1e293b; text-decoration:none; }
    .dark #homeApps .ha-menu a { color:#fff; }
    #homeApps .ha-menu a + a { border-top:1px solid #f1f5f9; }
    .dark #homeApps .ha-menu a + a { border-top-color:rgba(255,255,255,.05); }
    #homeApps .ha-menu a:hover { background:#f8fafc; }
    .dark #homeApps .ha-menu a:hover { background:rgba(255,255,255,.05); }
    #homeApps.is-editing .ha-tile { animation:haJiggle .32s ease-in-out infinite; animation-delay:var(--jiggle-delay,0s); }
    @keyframes haJiggle { 0%,100% { transform:rotate(-2deg); } 50% { transform:rotate(2deg); } }
    @media (prefers-reduced-motion: reduce) { #homeApps.is-editing .ha-tile { animation:none; } }
    #homeApps .ha-remove { position:absolute; top:-10px; left:-10px; width:36px; height:36px; display:grid; place-content:center; border:0; background:none; padding:0; cursor:pointer; z-index:2; }
    #homeApps .ha-remove span { width:22px; height:22px; border-radius:50%; background:#475569; box-shadow:0 1px 4px rgba(0,0,0,.35); display:grid; place-content:center; }
    #homeApps .ha-remove span::after { content:""; width:10px; height:2px; border-radius:2px; background:#fff; }
    #homeApps .ha-remove:hover span, #homeApps .ha-remove:focus-visible span { background:#e11d48; }
    #homeApps .ha-pressing .ha-tile, #homeApps .ha-slot.ha-pressing { transform:scale(.92); transition:transform .5s; }
    #homeApps .reorder-source { opacity:.3; }
    #homeApps .reorder-target { outline:2px solid #00A3B4; outline-offset:3px; border-radius:1.5rem; }
    .reorder-floating.ha-cell { border-radius:1.5rem; box-shadow:0 20px 45px rgba(0,0,0,.3); transform-origin:center; will-change:transform; }
    .reorder-floating .ha-remove { visibility:hidden; }
    #homeAppsDone { margin:14px auto 0; display:block; padding:8px 22px; border-radius:9999px; background:#007E8A; color:#fff; font-weight:700; font-size:14px; border:0; cursor:pointer; }
    #homeAppsDone[hidden] { display:none; }
    .ha-dialog { width:min(92vw,400px); padding:0; border:0; border-radius:20px; background:#fff; color:#0f172a; text-align:left; }
    .dark .ha-dialog { background:#161924; color:#f1f5f9; }
    .ha-dialog::backdrop { background:rgba(0,0,0,.6); }
    .ha-dialog form { padding:22px; display:flex; flex-direction:column; gap:12px; }
    .ha-dialog h3 { margin:0; font-size:18px; font-weight:800; }
    .ha-dialog label { display:flex; flex-direction:column; gap:6px; font-size:13px; font-weight:700; color:#64748b; }
    .dark .ha-dialog label { color:#8A92A6; }
    .ha-dialog input { height:44px; padding:0 14px; border-radius:12px; font-size:15px; background:#f1f5f9; border:1px solid #e2e8f0; color:inherit; outline:none; }
    .dark .ha-dialog input { background:rgba(255,255,255,.04); border-color:rgba(255,255,255,.1); }
    .ha-dialog input:focus { border-color:#007E8A; }
    .ha-dialog input:read-only { opacity:.6; }
    .ha-dialog .ha-note { font-size:12px; color:#94a3b8; margin:-4px 0 0; }
    .ha-dialog .ha-err { font-size:13px; color:#e11d48; margin:0; }
    .ha-dialog .ha-actions { display:flex; justify-content:flex-end; gap:8px; margin-top:4px; }
    .ha-dialog .ha-actions button { height:42px; padding:0 18px; border-radius:12px; font-weight:700; font-size:15px; border:0; cursor:pointer; }
    .ha-dialog .ha-cancel { background:transparent; color:inherit; }
    .ha-dialog .ha-save { background:#007E8A; color:#fff; }
    .ha-dialog .ha-save:disabled { opacity:.5; }
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const doneBtn = document.createElement('button');
  doneBtn.type = 'button'; doneBtn.id = 'homeAppsDone'; doneBtn.textContent = '完成'; doneBtn.hidden = true;
  grid.after(doneBtn);

  const isAdmin = () => !!window.isAdmin;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  // 只接受 http(s)、站內相對路徑，避免 javascript: 之類的連結。
  function safeUrl(value) {
    const v = String(value || '').trim();
    if (!v || v.startsWith('//')) return '';
    if (/^[a-z][a-z0-9+.-]*:/i.test(v)) {
      try { const u = new URL(v); return (u.protocol === 'https:' || u.protocol === 'http:') ? u.href : ''; } catch (_) { return ''; }
    }
    if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/i.test(v) && !/\.html?($|[?#])/i.test(v)) return safeUrl('https://' + v);
    return v; // 站內相對路徑，例如 venue.html
  }
  function isExternal(url) {
    try { return new URL(url, location.href).origin !== location.origin; } catch (_) { return false; }
  }
  const isImage = icon => /^(https?:\/\/|\/)/i.test(String(icon || ''));
  function iconHtml(app) {
    const icon = String(app.icon || '').trim();
    if (isImage(icon) && safeUrl(icon)) return `<span class="ha-icon" aria-hidden="true"><img alt="" src="${esc(safeUrl(icon))}"></span>`;
    return `<span class="ha-icon" aria-hidden="true">${esc(icon || '🔗')}</span>`;
  }
  const caret = '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>';

  let openMenuId = null;
  function render() {
    const admin = isAdmin();
    if (!admin) editing = false;
    grid.classList.toggle('is-editing', editing);
    grid.replaceChildren();
    apps.forEach((app, i) => {
      const cell = document.createElement('div');
      cell.className = 'ha-cell';
      cell.dataset.sortId = app.id;
      cell.draggable = admin;
      cell.style.setProperty('--jiggle-delay', (-(i % 3) * 0.11) + 's');
      const hasMenu = Array.isArray(app.menu) && app.menu.length > 0;
      const label = `<span class="ha-name">${esc(app.name)}${hasMenu ? caret : ''}</span>`;
      if (hasMenu || editing) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'ha-tile'; b.dataset.appId = app.id;
        b.setAttribute('aria-label', editing ? '編輯 ' + app.name : app.name);
        if (hasMenu && !editing) b.setAttribute('aria-expanded', openMenuId === app.id ? 'true' : 'false');
        b.innerHTML = iconHtml(app) + label;
        cell.append(b);
      } else {
        const a = document.createElement('a');
        a.className = 'ha-tile'; a.dataset.appId = app.id;
        const href = safeUrl(app.url) || '#';
        a.href = href;
        if (isExternal(href)) { a.target = '_blank'; a.rel = 'noopener'; }
        a.draggable = admin;
        a.setAttribute('aria-label', '開啟' + app.name);
        a.innerHTML = iconHtml(app) + label;
        cell.append(a);
      }
      if (hasMenu && !editing && openMenuId === app.id) {
        const menu = document.createElement('div');
        menu.className = 'ha-menu';
        menu.innerHTML = app.menu.map(m => `<a href="${esc(safeUrl(m.url) || '#')}"><span>${esc(m.icon || '')}</span><span>${esc(m.name)}</span></a>`).join('');
        cell.append(menu);
      }
      if (editing) {
        const rm = document.createElement('button');
        rm.type = 'button'; rm.className = 'ha-remove'; rm.dataset.removeId = app.id;
        rm.setAttribute('aria-label', '移除 ' + app.name);
        rm.innerHTML = '<span aria-hidden="true"></span>';
        cell.append(rm);
      }
      grid.append(cell);
    });
    if (admin && apps.length < MAX_APPS) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'ha-slot is-admin'; b.textContent = '+';
      b.title = '新增'; b.setAttribute('aria-label', '新增功能圖示');
      grid.append(b);
    }
    fillRow();
    doneBtn.hidden = !editing;
  }
  // 依目前欄數補虛線格，讓最後一排排滿（手機 2 欄、電腦 4～5 欄）。
  function fillRow() {
    grid.querySelectorAll('.ha-fill').forEach(el => el.remove());
    const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length || 1;
    const used = grid.children.length;
    const missing = used % cols ? cols - (used % cols) : 0;
    for (let i = 0; i < missing; i++) {
      const d = document.createElement('div');
      d.className = 'ha-slot ha-fill'; d.setAttribute('aria-hidden', 'true'); d.textContent = '+';
      grid.append(d);
    }
  }
  let resizeTimer = null;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(fillRow, 120); });

  function setEditing(on) {
    if (on && !isAdmin()) return;
    if (editing === on) return;
    editing = on; openMenuId = null;
    if (on && navigator.vibrate) navigator.vibrate(15);
    render();
  }
  doneBtn.addEventListener('click', () => setEditing(false));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && editing && !document.querySelector('dialog[open]')) setEditing(false); });
  document.addEventListener('pointerdown', e => {
    if (editing && !e.target.closest('#homeApps, #homeAppsDone, dialog')) setEditing(false);
  });
  document.addEventListener('click', e => {
    if (openMenuId && !e.target.closest('#homeApps .ha-cell[data-sort-id="' + CSS.escape(openMenuId) + '"]')) { openMenuId = null; render(); }
  });

  if (window.clcReorder) {
    window.clcReorder(grid, {
      item: '.ha-cell', grid: true, allowed: () => isAdmin(), start: () => cancelPress(), hold: () => setEditing(true),
      async move(from, to, after) {
        const moving = apps.find(a => a.id === from);
        if (!moving || !apps.some(a => a.id === to)) return;
        const next = apps.filter(a => a.id !== from);
        next.splice(next.findIndex(a => a.id === to) + (after ? 1 : 0), 0, moving);
        await persist(next);
      },
      error: err => alert('排序儲存失敗：' + errorText(err))
    });
  }

  // ---------- 長按進入編輯模式 ----------
  let press = null, suppressClick = false;
  grid.addEventListener('pointerdown', e => {
    if (!isAdmin() || editing || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const target = e.target.closest('.ha-cell, .ha-slot.is-admin');
    if (!target) return;
    target.classList.add('ha-pressing');
    press = {
      target, x: e.clientX, y: e.clientY,
      timer: setTimeout(() => {
        target.classList.remove('ha-pressing');
        suppressClick = true; press = null;
        setEditing(true);
      }, LONG_PRESS_MS)
    };
  });
  function cancelPress() {
    if (!press) return;
    clearTimeout(press.timer);
    press.target.classList.remove('ha-pressing');
    press = null;
  }
  grid.addEventListener('pointermove', e => { if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10) cancelPress(); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => grid.addEventListener(t, cancelPress));
  document.addEventListener('pointerup', () => { if (suppressClick) setTimeout(() => { suppressClick = false; }, 350); });
  grid.addEventListener('click', e => {
    if (suppressClick) { e.preventDefault(); e.stopPropagation(); suppressClick = false; return; }
    const rm = e.target.closest('.ha-remove');
    if (rm) { e.preventDefault(); removeApp(rm.dataset.removeId); return; }
    if (e.target.closest('.ha-slot.is-admin')) { e.preventDefault(); openDialog(null); return; }
    if (e.target.closest('.ha-menu a')) return;
    const tile = e.target.closest('.ha-tile');
    if (!tile) return;
    if (editing) { e.preventDefault(); openDialog(tile.dataset.appId); return; }
    const app = apps.find(a => a.id === tile.dataset.appId);
    if (app && Array.isArray(app.menu) && app.menu.length) {
      e.preventDefault(); e.stopPropagation();
      openMenuId = openMenuId === app.id ? null : app.id;
      render();
    }
  }, true);
  grid.addEventListener('contextmenu', e => { if (isAdmin() && e.target.closest('.ha-tile, .ha-slot')) e.preventDefault(); });

  // ---------- 儲存 ----------
  const settingsRef = () => window.db.collection('system_config').doc('home_apps');
  async function persist(next) {
    if (!window.db || !window.firebase) throw new Error('資料庫尚未載入');
    await settingsRef().set({
      items: next,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedBy: String(window.currentAdminEmail || '')
    });
    apps = next;
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(apps)); } catch (_) {}
    render();
  }
  function errorText(err) {
    return err && err.code === 'permission-denied'
      ? '權限不足：請確認已用管理員登入。'
      : '儲存失敗，請稍後再試。';
  }
  async function removeApp(id) {
    const app = apps.find(a => a.id === id);
    if (!app || !confirm('從首頁移除「' + app.name + '」？')) return;
    try { await persist(apps.filter(a => a.id !== id)); }
    catch (err) { console.warn('圖示移除失敗', err); alert(errorText(err)); }
  }
  // 外部網址可自動抓名稱（經 DX04 的 /api/site-info；抓不到就用網域名稱）。
  async function siteName(url) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      const res = await fetch('/api/site-info?url=' + encodeURIComponent(url), { signal: controller.signal });
      clearTimeout(timer);
      const data = await res.json();
      if (data && data.ok && data.name) return { name: String(data.name).slice(0, 20), icon: data.icon || '' };
    } catch (_) {}
    try { return { name: new URL(url).hostname.replace(/^www\./, '').slice(0, 20), icon: '' }; } catch (_) { return { name: url.slice(0, 20), icon: '' }; }
  }

  // ---------- 新增／編輯對話框 ----------
  const dialog = document.createElement('dialog');
  dialog.className = 'ha-dialog';
  dialog.innerHTML = `
    <form method="dialog" novalidate>
      <h3 data-ha="title">新增功能圖示</h3>
      <label>名稱<input data-ha="name" maxlength="20" placeholder="例如：詩歌歌詞下載" autocomplete="off"></label>
      <label>網址<input data-ha="url" placeholder="例如：venue.html 或 https://…" autocomplete="off" inputmode="url"></label>
      <p class="ha-note" data-ha="urlNote" hidden></p>
      <label>圖示<input data-ha="icon" maxlength="300" placeholder="emoji（例如 🎵）或圖片網址" autocomplete="off"></label>
      <p class="ha-err" data-ha="err" hidden></p>
      <div class="ha-actions">
        <button type="button" class="ha-cancel" data-ha="cancel">取消</button>
        <button type="submit" class="ha-save" data-ha="save">儲存</button>
      </div>
    </form>`;
  document.body.appendChild(dialog);
  const $ = k => dialog.querySelector('[data-ha="' + k + '"]');
  let editingId = null;
  function showError(msg) { $('err').textContent = msg; $('err').hidden = !msg; }
  function openDialog(id) {
    if (!isAdmin()) return;
    const app = id ? apps.find(a => a.id === id) : null;
    if (id && !app) return;
    editingId = id;
    const hasMenu = !!(app && Array.isArray(app.menu) && app.menu.length);
    $('title').textContent = app ? '編輯功能圖示' : '新增功能圖示';
    $('name').value = app ? app.name : '';
    $('url').value = app ? (app.url || '') : '';
    $('url').readOnly = hasMenu;
    $('urlNote').hidden = !hasMenu;
    $('urlNote').textContent = hasMenu ? '這一格是選單：' + app.menu.map(m => m.name).join('、') : '';
    $('icon').value = app ? (app.icon || '') : '';
    showError('');
    $('save').disabled = false; $('save').textContent = '儲存';
    dialog.showModal();
    (app ? $('name') : $('url')).focus();
  }
  $('cancel').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
  dialog.querySelector('form').addEventListener('submit', async e => {
    e.preventDefault();
    const old = editingId ? apps.find(a => a.id === editingId) : null;
    const hasMenu = !!(old && Array.isArray(old.menu) && old.menu.length);
    let name = $('name').value.trim().slice(0, 20);
    const url = hasMenu ? (old.url || '') : safeUrl($('url').value);
    let icon = $('icon').value.trim();
    if (!hasMenu && !url) return showError('請輸入網址，例如 venue.html 或 https://example.com');
    if (icon && isImage(icon) && !safeUrl(icon)) return showError('圖示網址格式不正確。');
    if (!old && apps.length >= MAX_APPS) return showError('最多 ' + MAX_APPS + ' 個圖示。');
    $('save').disabled = true;
    if (!name && isExternal(url)) {
      $('save').textContent = '讀取中…';
      const info = await siteName(url);
      name = info.name;
      if (!icon && info.icon) icon = info.icon;
    }
    if (!name) { $('save').disabled = false; $('save').textContent = '儲存'; return showError('請輸入名稱。'); }
    const patch = { name, url, icon: icon || '🔗' };
    const next = old
      ? apps.map(a => a.id === old.id ? Object.assign({}, old, patch) : a)
      : apps.concat(Object.assign({ id: 'app_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }, patch));
    try {
      await persist(next);
      dialog.close();
    } catch (err) {
      console.warn('圖示儲存失敗', err);
      showError(errorText(err));
      $('save').disabled = false; $('save').textContent = '儲存';
    }
  });

  // ---------- 讀取 ----------
  render();
  window.addEventListener('clc-admin-changed', render);
  try {
    settingsRef().onSnapshot(snap => {
      const items = snap.exists && Array.isArray(snap.data().items) ? snap.data().items : DEFAULT_APPS;
      apps = items.filter(a => a && a.id && a.name);
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(apps)); } catch (_) {}
      if (!document.querySelector('.reorder-floating')) render();
    }, err => console.warn('首頁圖示讀取失敗（沿用快取或預設）', err));
  } catch (err) {
    console.warn('首頁圖示無法連線資料庫', err);
  }
})();
