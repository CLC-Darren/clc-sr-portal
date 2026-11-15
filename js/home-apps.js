/**
 * 首頁功能圖示（YA、SR 共用，做法同 DX04「分站入口」）
 * - 清單存在 Firestore system_config/home_apps（沿用既有規則：所有人可讀、Admin 可寫），本機另存快取讓畫面先出來。
 * - 格子邏輯（長按晃動、拖到空格、互換、「−」移除、「＋」新增、點圖示修改）在 js/clc-slot-grid.js，三站共用。
 * - 只有 Superuser 可以編輯；最少 6 格，中間可以留空格。
 * - 新增／修改 App 同 LinFamily：網址 → 名稱 → 圖示，自動抓取；抓不到就用字母圖示。圖示也可填 emoji 或圖片網址。
 * 使用方式：<nav id="homeApps" data-site="ya"></nav>，並在 header.js、js/clc-slot-grid.js 之後載入本檔。
 * 預設清單放在 window.CLC_HOME_APPS_DEFAULT（各站 index.html 內設定）。
 */
(function () {
  const grid = document.getElementById('homeApps');
  if (!grid) return;
  const SITE = grid.dataset.site || 'site';
  const CACHE_KEY = 'clc_' + SITE + '_home_apps';
  const MAX_APPS = 24, MIN_SLOTS = 6;
  const DEFAULT_APPS = Array.isArray(window.CLC_HOME_APPS_DEFAULT) ? window.CLC_HOME_APPS_DEFAULT : [];
  let apps = DEFAULT_APPS;
  let editing = false;
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (Array.isArray(cached)) apps = cached;
  } catch (_) {}

  const css = `
    #homeApps .ha-cell { position:relative; aspect-ratio:1; }
    #homeApps .slot-target { border-radius:1.5rem; }
    .slot-floating .ha-tile { box-shadow:0 24px 50px rgba(0,0,0,.45),0 6px 16px rgba(0,0,0,.25); }
    #homeApps .ha-tile { width:100%; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:10px 8px; border-radius:1.5rem; background:#007E8A; color:#fff; box-shadow:0 10px 15px -3px rgba(0,126,138,.2); transition:transform .2s, background-color .2s; text-decoration:none; border:0; cursor:pointer; -webkit-touch-callout:none; -webkit-user-select:none; user-select:none; font:inherit; }
    #homeApps .ha-tile:hover { background:#006C77; }
    #homeApps .ha-tile:active { transform:scale(.95); }
    #homeApps .ha-tile:focus-visible { outline:4px solid #2dd4bf; outline-offset:2px; }
    #homeApps .ha-icon { font-size:1.875rem; line-height:1; margin-bottom:.5rem; transition:transform .2s; }
    #homeApps .ha-tile:hover .ha-icon { transform:scale(1.1); }
    .ha-mono { width:2.25rem; height:2.25rem; border-radius:22%; display:grid; place-content:center; color:#fff; font-weight:800; font-size:1.1rem; line-height:1; box-shadow:inset 0 0 0 1px rgba(255,255,255,.25); }
    @media (min-width:640px) { #homeApps .ha-mono { width:2.75rem; height:2.75rem; font-size:1.3rem; } }
    @media (min-width:1024px) { #homeApps .ha-mono { width:3rem; height:3rem; } }
    .ha-dialog .ha-iconrow { display:flex; gap:10px; align-items:center; }
    .ha-dialog .ha-iconrow input { flex:1; min-width:0; }
    .ha-dialog .ha-preview { width:44px; height:44px; flex:none; display:grid; place-content:center; border-radius:12px; background:#007E8A; }
    .ha-dialog .ha-preview .ha-icon { margin:0; font-size:1.6rem; }
    .ha-dialog .ha-preview .ha-icon img, .ha-dialog .ha-preview .ha-mono { width:36px; height:36px; font-size:1rem; }
    #homeApps .ha-icon img { width:2.25rem; height:2.25rem; border-radius:22%; object-fit:cover; display:block; pointer-events:none; }
    #homeApps .ha-name { font-size:.875rem; font-weight:800; line-height:1.25; letter-spacing:-.01em; max-width:100%; text-align:center; word-break:keep-all; overflow-wrap:anywhere; display:flex; align-items:center; justify-content:center; }
    #homeApps .ha-name svg { width:14px; height:14px; margin-left:4px; opacity:.8; flex:none; }
    @media (min-width:640px) { #homeApps .ha-icon { font-size:2.25rem; margin-bottom:.75rem; } #homeApps .ha-icon img { width:2.75rem; height:2.75rem; } }
    @media (min-width:1024px) { #homeApps .ha-name { font-size:1rem; } #homeApps .ha-icon { font-size:2.5rem; } #homeApps .ha-icon img { width:3rem; height:3rem; } }
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
    #homeApps .ha-remove { position:absolute; top:-10px; left:-10px; width:36px; height:36px; display:grid; place-content:center; border:0; background:none; padding:0; cursor:pointer; z-index:2; }
    #homeApps .ha-remove span { width:22px; height:22px; border-radius:50%; background:#475569; box-shadow:0 1px 4px rgba(0,0,0,.35); display:grid; place-content:center; }
    #homeApps .ha-remove span::after { content:""; width:10px; height:2px; border-radius:2px; background:#fff; }
    #homeApps .ha-remove:hover span, #homeApps .ha-remove:focus-visible span { background:#e11d48; }
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

  const isAdmin = () => !!window.isSuperuser; // 只有 Superuser 可以編輯
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
  // 字母圖示：抓不到圖、圖太小（< 96px 會糊）時，用彩色圓角方塊＋名稱第一個字（同 LinFamily）。
  const MONO_COLORS = ['#4E8B7E', '#B5835A', '#5F77A8', '#A8607A', '#4F8FA0', '#7E6FAE', '#6E8B4E'];
  const isGoogleIcon = v => /google\.[a-z.]+\/s2\/favicons/i.test(String(v || ''));
  function monoHtml(app) {
    let n = String(app.name || '').replace(/^CLC\s+/i, '').trim();
    if (!n) { try { n = new URL(safeUrl(app.url), location.href).hostname.replace(/^www\./, ''); } catch (_) { n = '?'; } }
    const cjk = /[\u3400-\u9fff]/.test(n[0] || '');
    let h = 0; for (const c of n) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    const t = cjk ? n[0] : ((n.replace(/[^A-Za-z0-9]/g, '').slice(0, 2) || n[0] || '?').replace(/^./, c => c.toUpperCase()));
    return `<span class="ha-mono" style="background:${MONO_COLORS[h % MONO_COLORS.length]}">${esc(t)}</span>`;
  }
  function iconHtml(app) {
    const icon = String(app.icon || '').trim();
    if (isImage(icon) && safeUrl(icon) && !isGoogleIcon(icon)) return `<span class="ha-icon" aria-hidden="true"><img alt="" src="${esc(safeUrl(icon))}" data-mono="${esc(monoHtml(app))}"></span>`;
    if (icon && !isImage(icon)) return `<span class="ha-icon" aria-hidden="true">${esc(icon)}</span>`;
    return `<span class="ha-icon" aria-hidden="true">${monoHtml(app)}</span>`;
  }
  // 圖片載入失敗或太小 → 換成字母圖示
  function monoSwap(img) { if (img.parentNode) img.outerHTML = img.dataset.mono; }
  document.addEventListener('error', e => { const t = e.target; if (t.tagName === 'IMG' && t.dataset && t.dataset.mono) monoSwap(t); }, true);
  document.addEventListener('load', e => {
    const t = e.target;
    if (t.tagName === 'IMG' && t.dataset && t.dataset.mono && t.naturalWidth && t.naturalWidth < 96 && !/\.svg(\?|$)/i.test(t.src)) monoSwap(t);
  }, true);
  const caret = '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>';

  let openMenuId = null;
  function renderTile(app, editing) {
    const hasMenu = Array.isArray(app.menu) && app.menu.length > 0;
    const label = `<span class="ha-name">${esc(app.name)}${hasMenu ? caret : ''}</span>`;
    let tile;
    if (hasMenu || editing) {
      tile = document.createElement('button');
      tile.type = 'button';
      if (hasMenu && !editing) tile.setAttribute('aria-expanded', openMenuId === app.id ? 'true' : 'false');
      tile.setAttribute('aria-label', app.name);
    } else {
      tile = document.createElement('a');
      const href = safeUrl(app.url) || '#';
      tile.href = href;
      if (isExternal(href)) { tile.target = '_blank'; tile.rel = 'noopener'; }
      tile.setAttribute('aria-label', '開啟' + app.name);
    }
    tile.className = 'ha-tile';
    tile.dataset.appId = app.id;
    tile.innerHTML = iconHtml(app) + label;
    if (hasMenu && !editing && openMenuId === app.id) {
      const menu = document.createElement('div');
      menu.className = 'ha-menu';
      menu.innerHTML = app.menu.map(m => `<a href="${esc(safeUrl(m.url) || '#')}"><span>${esc(m.icon || '')}</span><span>${esc(m.name)}</span></a>`).join('');
      queueMicrotask(() => tile.parentElement && tile.parentElement.append(menu));
    }
    return tile;
  }
  let addPos = null;
  const slots = window.clcSlotGrid(grid, {
    minSlots: MIN_SLOTS, cellClass: 'ha-cell', emptyClass: 'ha-slot', removeClass: 'ha-remove',
    canEdit: isAdmin,
    getItems: () => apps,
    renderTile,
    save: persist,
    error: err => alert('排列儲存失敗：' + errorText(err)),
    onAdd: pos => { addPos = pos; openDialog(null); },
    onEdit: id => openDialog(id),
    onRemove: id => removeApp(id),
    onEditingChange: () => { openMenuId = null; grid.querySelectorAll('.ha-menu').forEach(m => m.remove()); }
  });
  const render = () => slots.render();

  // 「週六小組場地」這種選單格：點一下展開、點旁邊收起。
  grid.addEventListener('click', e => {
    if (slots.isEditing() || e.target.closest('.ha-menu a')) return;
    const tile = e.target.closest('.ha-tile');
    const app = tile && apps.find(a => a.id === tile.dataset.appId);
    if (app && Array.isArray(app.menu) && app.menu.length) {
      e.preventDefault(); e.stopPropagation();
      openMenuId = openMenuId === app.id ? null : app.id;
      render();
    }
  });
  document.addEventListener('click', e => {
    if (openMenuId && !e.target.closest('#homeApps .ha-cell[data-id="' + CSS.escape(openMenuId) + '"]')) { openMenuId = null; render(); }
  });

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
  const withPos = () => window.clcSlotGridNormalize(apps);
  function errorText(err) {
    return err && err.code === 'permission-denied'
      ? '權限不足：請確認已用管理員登入。'
      : '儲存失敗，請稍後再試。';
  }
  async function removeApp(id) {
    const app = apps.find(a => a.id === id);
    if (!app || !confirm('從首頁移除「' + app.name + '」？')) return;
    try { await persist(withPos().filter(a => a.id !== id)); }
    catch (err) { console.warn('圖示移除失敗', err); alert(errorText(err)); }
  }
  // ---------- 新增／修改 App（同 LinFamily）：網址 → 名稱 → 圖示 ----------
  // 貼上網址後由 DX04 的 /api/site-info 自動抓名稱、圖示；使用者改過的值不會被覆蓋；抓不到圖示就用字母圖示。
  const SITE_INFO = 'https://clc-dx04.pages.dev/api/site-info?url=';
  const dialog = document.createElement('dialog');
  dialog.className = 'ha-dialog';
  dialog.innerHTML = `
    <form method="dialog" novalidate>
      <h3 data-ha="title">新增 App</h3>
      <label>網址<input data-ha="url" placeholder="例如：venue.html 或 https://…" autocomplete="off" inputmode="url"></label>
      <p class="ha-note" data-ha="urlNote" hidden></p>
      <label>名稱<input data-ha="name" maxlength="20" placeholder="貼上網址後自動抓取，可修改" autocomplete="off"></label>
      <label>圖示<span class="ha-iconrow"><span class="ha-preview" data-ha="preview"></span><input data-ha="icon" maxlength="300" placeholder="自動抓取；也可填 emoji 或圖片網址" autocomplete="off"></span></label>
      <p class="ha-note" data-ha="status" hidden></p>
      <p class="ha-err" data-ha="err" hidden></p>
      <div class="ha-actions">
        <button type="button" class="ha-cancel" data-ha="cancel">取消</button>
        <button type="submit" class="ha-save" data-ha="save">儲存</button>
      </div>
    </form>`;
  document.body.appendChild(dialog);
  const $ = k => dialog.querySelector('[data-ha="' + k + '"]');
  let editingId = null, auto = {}, fetchSeq = 0, fetchTimer = 0;
  function showError(msg) { $('err').textContent = msg; $('err').hidden = !msg; }
  function status(msg) { $('status').textContent = msg; $('status').hidden = !msg; }
  function preview() { $('preview').innerHTML = iconHtml({ name: $('name').value, icon: $('icon').value, url: $('url').value }); }
  function openDialog(id) {
    if (!isAdmin()) return;
    const app = id ? apps.find(a => a.id === id) : null;
    if (id && !app) return;
    editingId = id;
    if (id) addPos = null;
    const hasMenu = !!(app && Array.isArray(app.menu) && app.menu.length);
    $('title').textContent = app ? '修改 App' : '新增 App';
    $('url').value = app ? (app.url || '') : '';
    $('url').readOnly = hasMenu;
    $('urlNote').hidden = !hasMenu;
    $('urlNote').textContent = hasMenu ? '這一格是選單：' + app.menu.map(m => m.name).join('、') : '';
    $('name').value = app ? app.name : '';
    $('icon').value = app && !isGoogleIcon(app.icon) ? (app.icon || '') : '';
    auto = { name: '', icon: '', url: app ? safeUrl(app.url) : '' };
    showError(''); status('');
    $('save').disabled = false;
    preview();
    dialog.showModal();
    (app ? $('name') : $('url')).focus();
  }
  async function fetchInfo() {
    if ($('url').readOnly) return;
    const url = safeUrl($('url').value);
    if (!url || url === auto.url) return;
    auto.url = url;
    if (!isExternal(url)) return;
    const seq = ++fetchSeq; status('讀取網站名稱與圖示…');
    let info = null;
    try { const r = await fetch(SITE_INFO + encodeURIComponent(url)); info = await r.json(); } catch (_) {}
    if (seq !== fetchSeq) return;
    status(info && info.ok ? '' : '讀取不到網站資訊，請自行填寫（圖示可留空）。');
    if (!info) return;
    const name = String(info.name || '').trim().slice(0, 20), icon = info.ok && !isGoogleIcon(info.icon) ? safeUrl(info.icon) : '';
    if (name && (!$('name').value.trim() || $('name').value === auto.name)) { $('name').value = name; auto.name = name; }
    if (!$('icon').value.trim() || $('icon').value === auto.icon) { $('icon').value = icon; auto.icon = icon; }
    preview();
  }
  $('url').addEventListener('input', () => { clearTimeout(fetchTimer); fetchTimer = setTimeout(fetchInfo, 600); });
  $('url').addEventListener('change', fetchInfo);
  $('name').addEventListener('input', preview);
  $('icon').addEventListener('input', preview);
  $('cancel').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
  dialog.querySelector('form').addEventListener('submit', async e => {
    e.preventDefault();
    const old = editingId ? apps.find(a => a.id === editingId) : null;
    const hasMenu = !!(old && Array.isArray(old.menu) && old.menu.length);
    if (!hasMenu && safeUrl($('url').value) !== auto.url) { clearTimeout(fetchTimer); await fetchInfo(); }
    let name = $('name').value.trim().slice(0, 20);
    const url = hasMenu ? (old.url || '') : safeUrl($('url').value);
    const icon = $('icon').value.trim();
    if (!hasMenu && !url) return showError('請輸入網址，例如 venue.html 或 https://example.com');
    if (icon && isImage(icon) && !safeUrl(icon)) return showError('圖示網址格式不正確。');
    if (!old && apps.length >= MAX_APPS) return showError('最多 ' + MAX_APPS + ' 個 App。');
    if (!name) { try { name = isExternal(url) ? new URL(url).hostname.replace(/^www\./, '') : url.replace(/\/$/, ''); } catch (_) { name = url; } name = name.slice(0, 20); }
    if (!name) return showError('請輸入名稱。');
    $('save').disabled = true;
    const patch = { name, url, icon };
    const base = withPos();
    const next = old
      ? base.map(a => a.id === old.id ? Object.assign({}, a, patch) : a)
      : base.concat(Object.assign({ id: 'app_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }, patch,
          Number.isInteger(addPos) && !base.some(a => a.pos === addPos) ? { pos: addPos } : {}));
    try {
      await persist(next);
      dialog.close();
    } catch (err) {
      console.warn('App 儲存失敗', err);
      showError(errorText(err));
      $('save').disabled = false;
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
      render();
    }, err => console.warn('首頁圖示讀取失敗（沿用快取或預設）', err));
  } catch (err) {
    console.warn('首頁圖示無法連線資料庫', err);
  }
})();
