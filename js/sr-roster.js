/* CLC SR｜名單頁共用程式（組員通訊錄、新朋友名單）
 * <body data-mode="members"> 或 <body data-mode="intakes"> */
  (function () {
    const SR = window.SR;
    const $ = id => document.getElementById(id);
    const isDesktop = () => window.matchMedia('(min-width: 1024px)').matches;
    // 同一支程式給兩個頁面用：組員通訊錄（persons）與新朋友名單（intakes）
    const IS_INTAKE = document.body.dataset.mode === 'intakes';
    const COLL = IS_INTAKE ? 'intakes' : 'persons';
    const PHOTO_COLL = IS_INTAKE ? 'intakePhotos' : 'personPhotos';
    const EMPTY_STATUS = IS_INTAKE ? '未處理' : '未歸類';
    const statusOf = p => IS_INTAKE ? (p && p.status) || '' : SR.statusOf(p);
    const statusList = () => IS_INTAKE ? SR.INTAKE_STATUSES : options.statuses;
    const createdMs = p => (p.createdAt && typeof p.createdAt.toMillis === 'function') ? p.createdAt.toMillis() : 0;
    const fmtDate = ms => { if (!ms) return ''; const d = new Date(ms); return `${d.getFullYear() - 1911}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`; };
    let persons = [], groups = [], groupMap = {}, options = SR.DEFAULT_OPTIONS;
    let access = { canView: false, isAdmin: false };
    let unsubs = [], loaded = false, slow = false, slowTimer = null;
    // 預設只看「聚會小組」，要看其他狀態再從表頭切換
    // 新朋友名單預設看全部、最新的在最上面
    const filter = { q: '', who: '', group: 'all', status: IS_INTAKE ? 'all' : '聚會小組', sort: IS_INTAKE ? 'new' : 'name' };
    let selectedId = null;    // 電腦版選取的人
    let editor = null;        // { id|null, draft:{}, photo:{thumb,full}|null, removePhoto:bool, dirty:bool, where:'inspector'|'sheet' }

    const ICON_PHONE = '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z"/></svg>';
    const ICON_MSG = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>';
    const ICON_MAP = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>';

    // 齒輪按鈕在電腦版移到工具列右邊（同一個元素，選單只有一份）
    function placeGear() {
      const wrap = $('pageMenuGear').parentElement, slot = $('gearDesktopSlot');
      if (isDesktop()) { if (wrap.parentElement !== slot) slot.appendChild(wrap); }
      else if (wrap.parentElement === slot) document.querySelector('.m-round[data-new]').after(wrap);
    }
    window.addEventListener('resize', () => { placeGear(); });
    placeGear();

    // ---------- 權限 ----------
    SR.onAccess(a => {
      access = a;
      $('gateChecking').classList.add('hidden');
      $('gateLogin').classList.toggle('hidden', a.canView);
      $('app').classList.toggle('hidden', !a.canView);
      document.querySelectorAll('.admin-only').forEach(el => el.classList.toggle('hidden', !a.isAdmin));
      if (a.canView) start(); else stop();
    });
    function stop() { unsubs.forEach(u => u && u()); unsubs = []; persons = []; loaded = false; }
    function start() {
      if (unsubs.length) { render(); return; }
      const fail = err => { console.error(err); SR.toast('讀取資料失敗：' + (err.code || err.message), 'error'); };
      unsubs.push(SR.watchGroups(list => { groups = list; groupMap = Object.fromEntries(list.map(g => [g.id, g])); persons.forEach(normalizeRec); fillSelects(); render(); }, fail));
      unsubs.push(SR.watchOptions(o => { options = o; fillSelects(); render(); }, fail));
      clearTimeout(slowTimer);
      slowTimer = setTimeout(() => { if (!loaded) { slow = true; render(); } }, 8000);
      // 只信任伺服器回來的結果：離線快取的「0 筆」不代表名單是空的。
      unsubs.push(window.db.collection(COLL).onSnapshot({ includeMetadataChanges: true }, snap => {
        if (snap.metadata.fromCache && !snap.size && !loaded) return;
        persons = snap.docs.map(d => normalizeRec({ id: d.id, ...d.data() }));
        loaded = true; slow = false;
        render();
      }, fail));
    }

    // 新朋友表單只存小組名稱：對到小組清單補上 groupId
    function normalizeRec(p) {
      if (IS_INTAKE && !p.groupId && p.groupName) { const g = groups.find(x => x.name === p.groupName); if (g) p.groupId = g.id; }
      return p;
    }

    // ---------- 篩選 ----------
    // 依大分類決定可選的小組
    function groupsForWho() {
      if (filter.who === '姊妹小組') return groups.filter(g => !/同工/.test(g.name) && SR.groupGender(g) === '女');
      if (filter.who === '弟兄小組') return groups.filter(g => !/同工/.test(g.name) && SR.groupGender(g) === '男');
      if (!filter.who) return groups;
      return [];
    }
    function fillSelects() {
      const glist = groupsForWho();
      if (filter.group !== 'all' && !(filter.group === '' ? !filter.who : glist.some(g => g.id === filter.group))) filter.group = 'all';
      document.querySelectorAll('[data-filter="group"]').forEach(s => {
        s.innerHTML = `<option value="all">小組：全部</option>` + glist.map(g => `<option value="${g.id}">${SR.esc(g.name)}${g.active === false ? '（停用）' : ''}</option>`).join('') + (filter.who ? '' : `<option value="">未分組</option>`);
        s.disabled = !glist.length;
        s.value = filter.group;
      });
      document.querySelectorAll('[data-filter="status"]').forEach(s => {
        s.innerHTML = `<option value="all">狀態：全部</option>` + statusList().map(x => `<option value="${SR.esc(x)}">${SR.esc(x)}</option>`).join('') + `<option value="">${EMPTY_STATUS}</option>`;
        s.value = [...s.options].some(o => o.value === filter.status) ? filter.status : 'all';
      });
      renderHeaders();
    }

    // 排序（參考 Google 試算表：遞增／遞減），空白的生日排最後
    const byBirth = (a, b) => (a.birthday ? 0 : 1) - (b.birthday ? 0 : 1) || String(a.birthday || '').localeCompare(String(b.birthday || '')) || SR.byName(a, b);
    const md = p => p.birthday ? p.birthday.slice(5) : '99-99';
    const SORTS = {
      'name': ['姓名筆畫 少 → 多', SR.byName],
      'name-desc': ['姓名筆畫 多 → 少', (a, b) => SR.byName(b, a)],
      'no': ['編號 小 → 大', SR.byMemberNo],
      'no-desc': ['編號 大 → 小', (a, b) => SR.byMemberNo(b, a)],
      'birth': ['生日 年長 → 年輕', byBirth],
      'birth-desc': ['生日 年輕 → 年長', (a, b) => (a.birthday ? 0 : 1) - (b.birthday ? 0 : 1) || byBirth(b, a)],
      'bmonth': ['生日月份 1月 → 12月（找壽星）', (a, b) => md(a).localeCompare(md(b)) || SR.byName(a, b)],
      'new': ['填表日期 新 → 舊', (a, b) => createdMs(b) - createdMs(a) || SR.byName(a, b)],
      'old': ['填表日期 舊 → 新', (a, b) => createdMs(a) - createdMs(b) || SR.byName(a, b)]
    };
    // ---------- 表頭選單（像試算表的篩選：點表頭就能選） ----------
    const CARET = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
    function renderHeaders() {
      const g = groupMap[filter.group];
      const set = (col, label, active) => {
        const b = document.querySelector(`.m-th[data-col="${col}"]`);
        if (b) { b.innerHTML = `<span class="lbl">${SR.esc(label)}</span>` + CARET; b.dataset.active = String(!!active); }
      };
      const arrow = { 'name': ' ↑', 'name-desc': ' ↓', 'no': '（編號 ↑）', 'no-desc': '（編號 ↓）', 'new': '（最新）', 'old': '（最舊）' }[filter.sort];
      set('sortName', '姓名' + (arrow || ''), ['name-desc', 'no', 'no-desc', 'old'].includes(filter.sort) || (!IS_INTAKE && filter.sort === 'new'));
      const barrow = { 'birth': ' ↑', 'birth-desc': ' ↓', 'bmonth': '（月份）' }[filter.sort];
      set('sortBirth', '生日' + (barrow || ''), !!barrow);
      set('group', filter.group === 'all' ? '小組' : (filter.group === '' ? '小組：未分組' : '小組：' + (g ? g.name : '')), filter.group !== 'all');
      set('status', filter.status === 'all' ? '狀態' : '狀態：' + (filter.status || EMPTY_STATUS), filter.status !== 'all');
    }
    const COL_KEY = { sortName: 'sort', sortBirth: 'sort', group: 'group', status: 'status', export: 'export' };
    function colItems(col) {
      if (col === 'sortName') return IS_INTAKE
        ? [['new', SORTS.new[0]], ['old', SORTS.old[0]], null, ['name', SORTS.name[0]], ['name-desc', SORTS['name-desc'][0]]]
        : [['name', SORTS.name[0]], ['name-desc', SORTS['name-desc'][0]], null, ['no', SORTS.no[0]], ['no-desc', SORTS['no-desc'][0]]];
      if (col === 'sortBirth') return [['birth', SORTS.birth[0]], ['birth-desc', SORTS['birth-desc'][0]], null, ['bmonth', SORTS.bmonth[0]]];
      if (col === 'export') return [['pdf', '下載 PDF（A4 橫式，可列印）'], ['jpg', '下載 JPG 圖片']];
      if (col === 'group') {
        const list = groupsForWho();
        return [['all', '所有小組'], null, ...list.map(g => [g.id, g.name]), ...(filter.who ? [] : [null, ['', '未分組']])];
      }
      return [['all', '所有狀態'], null, ...statusList().map(x => [x, x]), null, ['', EMPTY_STATUS]];
    }
    let menuCol = null;
    function closeColMenu() { $('colMenu').classList.add('hidden'); menuCol = null; }

    // ---------- 下載目前看到的名單 ----------
    async function doExport(type) {
      const list = visible();
      if (!list.length) { SR.toast('目前沒有人可以下載', 'error'); return; }
      const g = groupMap[filter.group];
      const parts = [filter.who || '全部小組', filter.group === 'all' ? '' : (filter.group === '' ? '未分組' : g && g.name),
        filter.status === 'all' ? '' : (filter.status || EMPTY_STATUS), filter.q ? `搜尋「${filter.q}」` : ''].filter(Boolean);
      const now = new Date(), d = `${now.getFullYear() - 1911}.${now.getMonth() + 1}.${now.getDate()}`;
      SR.toast('正在產生檔案…');
      try {
        await SR.exportList(type, list, {
          title: IS_INTAKE ? '江翠加樂 新朋友名單' : '江翠加樂 組員通訊錄',
          statusOf,
          subtitle: `${parts.join('・')}　共 ${list.length} 人　排序：${(SORTS[filter.sort] || SORTS.name)[0]}　民國 ${d} 製表`,
          fileBase: `${IS_INTAKE ? '加樂新朋友' : '加樂通訊錄'}_${parts.join('_').replace(/[\\/:*?"<>|「」]/g, '')}_${d}`,
          groupMap
        });
      } catch (err) { console.error(err); SR.toast('下載失敗：' + err.message, 'error'); }
    }
    document.addEventListener('click', e => {
      const th = e.target.closest('.m-th, [data-export]');
      const item = e.target.closest('#colMenu button');
      if (item) {
        const key = COL_KEY[menuCol];
        closeColMenu();
        if (key === 'export') { doExport(item.dataset.v); return; }
        filter[key] = item.dataset.v;
        document.querySelectorAll(`[data-filter="${key}"]`).forEach(x => { x.value = item.dataset.v; });
        renderHeaders(); render();
        return;
      }
      if (!th) { if (!e.target.closest('#colMenu')) closeColMenu(); return; }
      const col = th.dataset.col || 'export';
      if (menuCol === col) { closeColMenu(); return; }
      menuCol = col;
      const items = colItems(menuCol);
      const cur = filter[COL_KEY[menuCol]];
      $('colMenu').innerHTML = items.length > 2 || menuCol !== 'group'
        ? items.map(it => it ? `<button type="button" role="menuitemradio" aria-checked="${it[0] === cur}" data-v="${SR.esc(it[0])}"><span class="chk">${it[0] === cur ? '✓' : ''}</span>${SR.esc(it[1])}</button>` : '<hr>').join('')
        : `<p style="padding:10px;color:#6E6E73;font-size:14px;white-space:nowrap">「${SR.esc(filter.who)}」沒有小組可選</p>`;
      const r = th.getBoundingClientRect();
      const m = $('colMenu');
      m.classList.remove('hidden');
      m.style.top = (r.bottom + 6) + 'px';
      m.style.left = Math.min(r.left - 6, window.innerWidth - m.offsetWidth - 12) + 'px';
      m.querySelector('[aria-checked="true"]')?.focus();
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeColMenu(); });
    window.addEventListener('scroll', closeColMenu, true);

    document.addEventListener('change', e => {
      const f = e.target.dataset && e.target.dataset.filter;
      if (!f) return;
      filter[f] = e.target.value;
      document.querySelectorAll(`[data-filter="${f}"]`).forEach(s => { s.value = e.target.value; });
      if (f === 'who') { filter.group = 'all'; fillSelects(); }
      render();
    });
    document.addEventListener('input', e => {
      if (!e.target.matches('[data-q]')) return;
      filter.q = e.target.value.trim();
      document.querySelectorAll('[data-q]').forEach(i => { if (i !== e.target) i.value = e.target.value; });
      render();
    });

    function visible() {
      const q = filter.q.toLowerCase(), qd = SR.phoneDigits(filter.q);
      return persons.filter(p => {
        if (filter.who && SR.personWho(p, groupMap) !== filter.who) return false;
        if (filter.group !== 'all' && (filter.group === '' ? groupMap[p.groupId] : p.groupId !== filter.group)) return false;
        if (filter.status !== 'all' && statusOf(p) !== filter.status) return false;
        if (!q) return true;
        if (String(p.name || '').toLowerCase().includes(q)) return true;
        if (String(p.address || '').includes(filter.q) || String(p.note || '').includes(filter.q)) return true;
        const no = String(p.memberNo || '');
        if (no && (no === filter.q || no.replace('*', '') === filter.q.replace('*', '') && no.startsWith('*') === filter.q.startsWith('*'))) return true;
        return qd.length >= 3 && (SR.phoneDigits(p.mobile).includes(qd) || SR.phoneDigits(p.phone).includes(qd));
      }).sort((SORTS[filter.sort] || SORTS.name)[1]);
    }

    // ---------- 畫面 ----------
    function render() {
      if (!access.canView) return;
      if (!loaded) {
        const msg = slow ? '⚠️ 連不到資料庫。請關掉這個網站的廣告阻擋（例如 Brave 的盾牌），或換個網路後重新整理。' : '讀取中…';
        $('countLine').textContent = msg; $('tableFoot').textContent = msg;
        return;
      }
      const list = visible();
      const line = `顯示 ${list.length} 人／共 ${persons.length} 人`;
      $('countLine').textContent = line;
      $('tableFoot').textContent = line + '・排序：' + (SORTS[filter.sort] || SORTS.name)[0];
      const emptyText = persons.length ? '找不到符合條件的人。' : IS_INTAKE ? '還沒有新朋友留名單。' : (access.isAdmin ? '名單還是空的。可以按「＋ 新增」，或從齒輪 → 名單後台匯入。' : '名單還是空的。');
      $('tableEmpty').classList.toggle('hidden', list.length > 0); $('tableEmpty').textContent = emptyText;
      $('cardsEmpty').classList.toggle('hidden', list.length > 0); $('cardsEmpty').textContent = emptyText;
      renderTable(list);
      renderCards(list);
      if (isDesktop() && (!editor || !editor.dirty) && !$('inspector').contains(document.activeElement)) renderInspector();
    }

    function renderTable(list) {
      $('tbody').innerHTML = list.map(p => {
        const g = groupMap[p.groupId];
        return `<tr data-id="${SR.esc(p.id)}" aria-selected="${p.id === selectedId}" tabindex="0">
          <td><div style="display:flex;align-items:center;gap:10px">${SR.avatarHtml(p, 32)}<span style="font-weight:700">${SR.esc(p.name)}</span></div></td>
          <td>${p.gender || '<span class="m-muted">—</span>'}</td>
          <td>${SR.formatRoc(p.birthday) || '<span class="m-muted">—</span>'}</td>
          <td>${SR.esc(p.mobile || p.phone) || '<span class="m-muted">—</span>'}</td>
          <td>${g ? SR.esc(g.name) : p.category === '全職同工' ? '全職同工' : '<span class="m-muted">未分組</span>'}</td>
          <td>${SR.statusPill(statusOf(p)) || (IS_INTAKE ? SR.statusPill('未處理') : '')}</td>
          ${IS_INTAKE ? `<td>${p.personId ? '<span class="sr-pill" style="background:#DFF7E5;color:#1B6B34">✓ 已加入</span>' : '<span class="m-muted">未加入</span>'}</td>` : ''}
        </tr>`;
      }).join('');
    }
    $('tbody').addEventListener('click', e => { const tr = e.target.closest('tr[data-id]'); if (tr) select(tr.dataset.id); });
    $('tbody').addEventListener('keydown', e => {
      const tr = e.target.closest('tr[data-id]'); if (!tr) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(tr.dataset.id); }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const n = e.key === 'ArrowDown' ? tr.nextElementSibling : tr.previousElementSibling; if (n) { n.focus(); select(n.dataset.id); } }
    });

    function select(id) {
      if (editor && editor.dirty && editor.id !== id && !confirm('剛剛的修改還沒儲存，要放棄嗎？')) return;
      selectedId = id; editor = null;
      $('tbody').querySelectorAll('tr').forEach(tr => tr.setAttribute('aria-selected', String(tr.dataset.id === id)));
      renderInspector();
    }

    function renderCards(list) {
      $('cards').innerHTML = list.map(p => {
        const g = groupMap[p.groupId];
        const tel = SR.phoneDigits(p.mobile) || SR.phoneDigits(p.phone);
        const sub = [g ? g.name : (p.category === '全職同工' ? '全職同工' : '未分組'), statusOf(p) || (IS_INTAKE ? '未處理' : ''), IS_INTAKE && p.personId ? '已加入通訊錄' : ''].filter(Boolean).join('・');
        return `<article class="m-card">
          <button type="button" data-open="${SR.esc(p.id)}">
            ${SR.avatarHtml(p, 52)}
            <span style="min-width:0;display:flex;flex-direction:column;gap:1px">
              <span style="font-size:20px;font-weight:800;line-height:1.25">${SR.esc(p.name)}</span>
              <span style="font-size:14px;color:#6E6E73">${SR.esc(sub)}</span>
              <span style="font-size:17px;font-weight:700;${p.mobile || p.phone ? '' : 'color:#AEAEB2'}">${SR.esc(p.mobile || p.phone || '沒有電話')}</span>
            </span>
          </button>
          ${tel ? `<a class="m-call" href="tel:${tel}" aria-label="撥電話給 ${SR.esc(p.name)}">${ICON_PHONE}</a>` : ''}
        </article>`;
      }).join('');
    }

    // ---------- 個人資料（唯讀） ----------
    function detailHtml(p) {
      const g = groupMap[p.groupId];
      const tel = SR.phoneDigits(p.mobile) || SR.phoneDigits(p.phone);
      const sms = SR.phoneDigits(p.mobile);
      const row = (label, value, extra = '') => value ? `<div class="m-row"><span class="m-lab">${label}</span><span class="m-val"${extra}>${SR.esc(value)}</span></div>` : '';
      const birth = p.birthday ? `${SR.formatRocLong(p.birthday)}・${SR.age(p.birthday)} 歲` : '';
      const mar = [p.marital, p.living].filter(Boolean).join('・');
      const g1 = row('手機', p.mobile, ' style="color:#007E8A"') + row('市話', p.phone, ' style="color:#007E8A"');
      const g2 = row('生日', birth) + row('地址', p.address) + row('婚姻・居住', mar);
      const g3 = IS_INTAKE
        ? row('想加入的小組', g ? g.name : (p.groupName || '暫不安排')) + row('新朋友狀態', statusOf(p) || '未處理') + row('通訊錄', p.personId ? '已加入' : '尚未加入') + row('填表日期', fmtDate(createdMs(p))) + row('Email 通知', ({ pending: '排隊中（約 5 分鐘內寄出）', sent: '已寄給小組長、區長', 'no-recipient': '沒有寄：還沒設定通知信箱', failed: '寄送失敗：' + (p.notifyError || '') })[p.notify] || '')
        : row('小組', g ? g.name : '未分組') + row('聚會狀態', statusOf(p)) + row('編號', p.memberNo);
      const g4 = IS_INTAKE ? row('介紹人', [p.refName, p.refRelation && `（${p.refRelation}）`, p.refPhone].filter(Boolean).join(' ')) + row('信仰', (p.faith || []).join('、')) + row('希望', (p.intent || []).join('、')) : '';
      return `
        <div style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:8px 0 4px">
          <span data-big-avatar="${SR.esc(p.id)}">${SR.avatarHtml(p, 96)}</span>
          <div style="font-size:28px;font-weight:800;color:#fff" class="m-name">${SR.esc(p.name)}</div>
          <div style="font-size:15px;color:rgba(235,235,245,.65)" class="m-sub">${SR.esc([g ? g.name : (IS_INTAKE ? '' : SR.personWho(p, groupMap)), statusOf(p)].filter(Boolean).join('・'))}</div>
        </div>
        <div style="display:flex;gap:10px;margin:14px 0">
          ${tel ? `<a class="m-act" href="tel:${tel}" style="background:#007E8A;color:#fff">${ICON_PHONE}撥打</a>` : `<span class="m-act" style="background:#2C2C2E;color:rgba(235,235,245,.4)">${ICON_PHONE}沒有電話</span>`}
          ${sms ? `<a class="m-act" href="sms:${sms}" style="background:#2C2C2E;color:#fff">${ICON_MSG}簡訊</a>` : ''}
          ${p.address ? `<a class="m-act" href="https://maps.apple.com/?q=${encodeURIComponent(p.address)}" target="_blank" rel="noopener" style="background:#2C2C2E;color:#fff">${ICON_MAP}地圖</a>` : ''}
        </div>
        ${IS_INTAKE && access.isAdmin && !p.personId ? `<button type="button" class="m-btn" data-join-sheet="${SR.esc(p.id)}" style="width:100%;margin-bottom:14px;background:#F2B33D;color:#3B2A10;min-height:50px;font-size:17px">＋ 加入組員通訊錄</button>` : ''}
        <div style="display:flex;flex-direction:column;gap:14px">
          ${g1 ? `<div class="m-group">${g1}</div>` : ''}
          ${g2 ? `<div class="m-group">${g2}</div>` : ''}
          <div class="m-group">${g3}</div>
          ${g4 ? `<div class="m-group">${g4}</div>` : ''}
          ${p.note ? `<div class="m-group">${row(IS_INTAKE ? '需要幫助或代禱的事項' : '備註', p.note)}</div>` : ''}
          ${p.updatedBy ? `<p style="font-size:13px;color:rgba(235,235,245,.45);text-align:center">最後修改：${SR.esc(p.updatedBy)}</p>` : ''}
        </div>`;
    }

    // 有相片時，打開個人資料再讀大圖
    async function loadBigPhoto(p) {
      if (!p || !p.photoThumb) return;
      try {
        const snap = await window.db.collection(PHOTO_COLL).doc(p.id).get();
        const data = snap.exists && snap.data().data;
        if (!data || !/^data:image\//.test(data)) return;
        document.querySelectorAll(`[data-big-avatar="${CSS.escape(p.id)}"] img`).forEach(img => { img.src = data; });
      } catch (e) { /* 大圖讀不到就用縮圖 */ }
    }

    // ---------- 編輯表單（檢閱器與手機共用） ----------
    function startEditor(p, where) {
      editor = { id: p ? p.id : null, where, dirty: false, photo: null, removePhoto: false,
        draft: p ? { ...p } : { gender: filter.who === '姊妹小組' ? '女' : filter.who === '弟兄小組' ? '男' : '', category: filter.who === '全職同工' ? '全職同工' : '', groupId: filter.group !== 'all' ? filter.group : '', status: '', memberNo: '' } };
    }
    function groupOptions(gender, selected) {
      let html = `<option value="">未分組</option>`;
      SR.groupsFor(groups, gender, selected).forEach(g => { html += `<option value="${g.id}"${g.id === selected ? ' selected' : ''}>${SR.esc(g.name)}</option>`; });
      if (selected && !groupMap[selected]) html += `<option value="${SR.esc(selected)}" selected>（已刪除的小組）</option>`;
      return html;
    }
    function formHtml() {
      const d = editor.draft, isNew = !editor.id;
      const field = (key, label, input, help = '') => `<div class="m-row"><label class="m-lab" for="f_${key}">${label}</label>${input}${help ? `<span id="h_${key}" style="font-size:12px;color:#6E6E73">${help}</span>` : ''}</div>`;
      const text = (key, val, extra = '') => `<input class="m-in" id="f_${key}" name="${key}" value="${SR.esc(val ?? '')}"${extra}>`;
      const sel = (key, list, val, empty) => {
        const all = val && !list.includes(val) ? [...list, val] : list;
        return `<select class="m-in" id="f_${key}" name="${key}"><option value="">${empty}</option>${all.map(v => `<option${v === val ? ' selected' : ''}>${SR.esc(v)}</option>`).join('')}</select>`;
      };
      const gsel = `<select class="m-in" id="f_groupId" name="groupId">${groupOptions(d.gender, d.groupId)}</select>`;
      const preview = editor.photo ? { ...d, photoThumb: editor.photo.thumb } : (editor.removePhoto ? { ...d, photoThumb: '' } : d);
      const birthHelp = d.birthday ? `${SR.formatRocLong(d.birthday)}・${SR.age(d.birthday)} 歲` : '民國或西元都可以，例如「45/3/2」';
      return (editor.where === 'inspector' ? CLOSE_BTN : '') + `<form id="editForm" novalidate style="display:flex;flex-direction:column;gap:14px">
        <div style="display:flex;align-items:center;gap:14px">
          <button type="button" data-photo aria-label="更換相片" style="position:relative;border:0;background:transparent;padding:0;cursor:pointer">${SR.avatarHtml(preview, 72)}
            <span style="position:absolute;right:-4px;bottom:-4px;width:26px;height:26px;border-radius:50%;background:#007E8A;color:#fff;display:flex;align-items:center;justify-content:center;border:2px solid #F2F2F7"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M3 8h3l2-3h8l2 3h3v12H3z"/><circle cx="12" cy="13" r="4"/></svg></span></button>
          <div style="min-width:0">
            <div class="m-head-name" style="font-size:22px;font-weight:800">${isNew ? (IS_INTAKE ? '新增新朋友' : '新增組員') : SR.esc(d.name)}</div>
            ${IS_INTAKE && !isNew ? `<div style="font-size:13px;color:#6E6E73">填表日期 ${fmtDate(createdMs(d)) || '—'}</div>` : ''}
            <div style="display:flex;gap:10px;margin-top:2px">
              <button type="button" data-photo class="m-link" style="font-size:14px;padding:0;color:#007E8A">${preview.photoThumb ? '更換相片' : '加入相片'}</button>
              ${preview.photoThumb ? '<button type="button" data-photo-remove class="m-link" style="font-size:14px;padding:0;color:#D70015">移除</button>' : ''}
            </div>
          </div>
        </div>
        ${!isNew && (SR.phoneDigits(d.mobile) || SR.phoneDigits(d.phone)) ? `<a class="m-btn m-btn-teal" href="tel:${SR.phoneDigits(d.mobile) || SR.phoneDigits(d.phone)}">${ICON_PHONE.replace(/22/g, '18')} 撥打 ${SR.esc(d.mobile || d.phone)}</a>` : ''}
        ${IS_INTAKE && !isNew ? (d.personId
          ? `<a class="m-btn" href="members.html" style="background:#DFF7E5;color:#1B6B34">✓ 已在組員通訊錄裡</a>`
          : `<button type="button" class="m-btn" data-join style="background:#F2B33D;color:#3B2A10;min-height:48px;font-size:16px">＋ 加入組員通訊錄</button>`) : ''}
        <div class="m-group">
          ${field('name', '姓名＊', text('name', d.name, ' maxlength="30" autocomplete="off"'))}
          <div class="m-row"><span class="m-lab">性別</span><div class="m-lseg" data-lseg>
            <button type="button" data-v="女" aria-pressed="${d.gender === '女'}">女（姊妹）</button><button type="button" data-v="男" aria-pressed="${d.gender === '男'}">男（弟兄）</button></div></div>
          ${IS_INTAKE ? '' : field('category', '身分', `<select class="m-in" id="f_category" name="category"><option value="">一般組員</option>${['全職同工', ...(d.category === '其他' ? ['其他'] : [])].map(c => `<option${d.category === c ? ' selected' : ''}>${c}</option>`).join('')}</select>`)}
          ${field('birthday', '生日', text('birthday', SR.formatRoc(d.birthday), ' inputmode="numeric" placeholder="45/3/2"'), birthHelp)}
        </div>
        <div class="m-group">
          ${field('mobile', '手機', text('mobile', d.mobile, ' type="tel" inputmode="tel"'))}
          ${field('phone', '市話', text('phone', d.phone, ' type="tel" inputmode="tel"'))}
          ${field('address', '地址', text('address', d.address, ' maxlength="120"'))}
        </div>
        <div class="m-group">
          ${field('groupId', IS_INTAKE ? '想加入的小組' : '小組', gsel)}
          ${field('status', IS_INTAKE ? '新朋友狀態' : '聚會狀態', sel('status', statusList(), statusOf(d), EMPTY_STATUS))}
          <div class="m-row" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px">
            <label style="display:flex;flex-direction:column;gap:2px"><span class="m-lab">婚姻</span>${sel('marital', options.marital, d.marital || '', '—')}</label>
            <label style="display:flex;flex-direction:column;gap:2px"><span class="m-lab">居住</span>${sel('living', options.living, d.living || '', '—')}</label>
          </div>
          ${IS_INTAKE ? '' : field('memberNo', '編號', text('memberNo', d.memberNo, ' maxlength="20" placeholder="' + (isNew ? '留白會自動編號' : '') + '"'), '點名表的序號，弟兄前面有 *。不顯示在列表，可搜尋。')}
        </div>
        ${IS_INTAKE ? `<div class="m-group">
          ${field('refName', '介紹人', text('refName', d.refName, ' maxlength="30"'))}
          ${field('refRelation', '與介紹人的關係', text('refRelation', d.refRelation, ' maxlength="20"'))}
          ${field('refPhone', '介紹人電話', text('refPhone', d.refPhone, ' type="tel" inputmode="tel"'))}
        </div>
        <div class="m-group">
          ${field('faith', '信仰', text('faith', (d.faith || []).join('、'), ' maxlength="200"'), '多項用「、」隔開')}
          ${field('intent', '希望', text('intent', (d.intent || []).join('、'), ' maxlength="200"'))}
        </div>` : ''}
        <div class="m-group">${field('note', IS_INTAKE ? '需要幫助或代禱的事項' : '備註', `<textarea class="m-in" id="f_note" name="note" rows="3" maxlength="2000">${SR.esc(d.note || '')}</textarea>`)}</div>
        <div style="display:flex;gap:8px;position:sticky;bottom:0;padding:8px 0" data-foot>
          <button type="button" class="m-btn m-btn-white" style="flex:1" data-cancel>取消</button>
          <button type="submit" class="m-btn m-btn-teal" style="flex:2" id="saveBtn">儲存</button>
        </div>
        ${!isNew ? `<button type="button" class="m-btn m-btn-red" data-delete>從名單刪除</button>
          <p style="font-size:12px;color:#6E6E73;text-align:center;margin-top:-8px">${IS_INTAKE ? '刪除只會刪掉這筆留名單，不會動到通訊錄。' : '只是暫時不來聚會的話，改「聚會狀態」就好，不要刪除。'}</p>` : ''}
      </form>`;
    }

    // 右側面板：沒選人時收起來，表格滿版；點一個人才滑出來
    const CLOSE_BTN = '<div style="display:flex;justify-content:flex-end;margin:-6px -6px 2px"><button type="button" data-close-panel aria-label="關閉個人資料" style="width:30px;height:30px;border-radius:50%;border:0;background:#E5E5EA;color:#3A3A3C;font-size:15px;font-weight:700;cursor:pointer">✕</button></div>';
    function renderInspector() {
      const box = $('inspector');
      const p = persons.find(x => x.id === selectedId);
      const open = (editor && editor.where === 'inspector') || !!p;
      box.classList.toggle('hidden', !open);
      if (!open) return;
      if (editor && editor.where === 'inspector') { box.innerHTML = formHtml(); return; }
      if (access.isAdmin) { startEditor(p, 'inspector'); box.innerHTML = formHtml(); }
      else { box.innerHTML = CLOSE_BTN + `<div style="background:#1C1C1E;border-radius:14px;padding:12px">${detailHtml(p)}</div>`; }
      loadBigPhoto(p);
    }
    function closePanel() {
      if (editor && editor.dirty && !confirm('剛剛的修改還沒儲存，要放棄嗎？')) return;
      editor = null; selectedId = null;
      $('tbody').querySelectorAll('tr').forEach(tr => tr.setAttribute('aria-selected', 'false'));
      renderInspector();
    }
    $('inspector').addEventListener('click', e => { if (e.target.closest('[data-close-panel]')) closePanel(); });

    // 表單事件（檢閱器、手機頁共用）
    function formRoot() { return editor && editor.where === 'sheet' ? $('sheetBody') : $('inspector'); }
    function readForm() {
      const form = formRoot().querySelector('#editForm');
      if (!form) return;
      const fd = new FormData(form);
      for (const [k, v] of fd.entries()) editor.draft[k] = v;
    }
    ['inspector', 'sheetBody'].forEach(id => {
      const root = $(id);
      root.addEventListener('input', e => {
        if (!editor || !e.target.closest('#editForm')) return;
        editor.dirty = true;
        if (e.target.id === 'f_birthday') {
          const iso = SR.parseBirthday(e.target.value);
          const h = root.querySelector('#h_birthday');
          if (h) h.textContent = iso ? `${SR.formatRocLong(iso)}・${SR.age(iso)} 歲` : (e.target.value ? '還看不懂這個日期，例如「45/3/2」' : '民國或西元都可以，例如「45/3/2」');
        }
        if (e.target.id === 'f_name') { const n = root.querySelector('.m-head-name'); if (n && editor.id) n.textContent = e.target.value || '（未填姓名）'; }
      });
      root.addEventListener('click', e => {
        if (!editor) return;
        const seg = e.target.closest('[data-lseg] button');
        if (seg) {
          editor.dirty = true;
          editor.draft.gender = editor.draft.gender === seg.dataset.v ? '' : seg.dataset.v;
          root.querySelectorAll('[data-lseg] button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === editor.draft.gender)));
          const gs = root.querySelector('#f_groupId');
          if (gs) { const keep = gs.value; gs.innerHTML = groupOptions(editor.draft.gender, ''); gs.value = [...gs.options].some(o => o.value === keep) ? keep : ''; }
        }
        if (e.target.closest('[data-photo]')) $('photoInput').click();
        if (e.target.closest('[data-photo-remove]')) { readForm(); editor.photo = null; editor.removePhoto = true; editor.dirty = true; root.innerHTML = formHtml(); }
        if (e.target.closest('[data-cancel]')) {
          if (editor.dirty && !confirm('要放棄剛剛的修改嗎？')) return;
          const where = editor.where; editor = null;
          if (where === 'sheet') { const p = persons.find(x => x.id === sheetId); p ? showSheetDetail(p) : closeSheet(); }
          else { if (!persons.some(x => x.id === selectedId)) selectedId = null; renderInspector(); }
        }
        if (e.target.closest('[data-delete]')) deletePerson();
        if (e.target.closest('[data-join]')) joinMembers();
      });
      root.addEventListener('submit', e => { e.preventDefault(); save(); });
    });

    $('photoInput').addEventListener('change', async e => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file || !editor) return;
      try {
        readForm();
        editor.photo = await SR.makePhoto(file);
        editor.removePhoto = false; editor.dirty = true;
        formRoot().innerHTML = formHtml();
        SR.toast('相片已放上，記得按「儲存」');
      } catch (err) { SR.toast(err.message, 'error'); }
    });

    function normalize(key, raw) {
      const v = String(raw ?? '').trim();
      if (key === 'name') return v ? { value: v } : { error: '姓名不能空白' };
      if (key === 'birthday') { const iso = SR.parseBirthday(v); return iso === null ? { error: '生日看不懂，可以輸入「45/3/2」或「1956/3/2」' } : { value: iso }; }
      if (key === 'mobile' || key === 'phone') return { value: SR.formatPhone(v) };
      return { value: v };
    }

    async function save() {
      if (!access.isAdmin || !editor) return;
      readForm();
      const data = {};
      const keys = IS_INTAKE
        ? ['name', 'birthday', 'mobile', 'phone', 'address', 'note', 'groupId', 'status', 'marital', 'living', 'refName', 'refRelation', 'refPhone']
        : ['name', 'birthday', 'mobile', 'phone', 'address', 'note', 'groupId', 'status', 'marital', 'living', 'memberNo', 'category'];
      for (const key of keys) {
        const r = normalize(key, editor.draft[key]);
        if (r.error) { SR.toast(r.error, 'error'); const el = formRoot().querySelector('#f_' + key); if (el) { el.classList.add('sr-invalid'); el.focus(); } return; }
        data[key] = r.value;
      }
      data.gender = editor.draft.gender || '';
      if (IS_INTAKE) {
        const split = v => String(Array.isArray(v) ? v.join('、') : v || '').split(/[、,，\n]/).map(x => x.trim()).filter(Boolean).slice(0, 10);
        data.faith = split(editor.draft.faith); data.intent = split(editor.draft.intent);
        data.refPhone = SR.formatPhone(data.refPhone);
        data.groupName = groupMap[data.groupId] ? groupMap[data.groupId].name : '';
      } else if (!editor.id && !data.memberNo) data.memberNo = SR.nextMemberNo(persons, data.gender);
      if (editor.photo) data.photoThumb = editor.photo.thumb;
      else if (editor.removePhoto) data.photoThumb = firebase.firestore.FieldValue.delete();
      const btn = formRoot().querySelector('#saveBtn');
      if (btn) btn.disabled = true;
      try {
        let id = editor.id;
        if (id) await window.db.collection(COLL).doc(id).update({ ...data, ...SR.stamp() });
        else { const ref = await window.db.collection(COLL).add({ ...data, source: 'manual', createdAt: SR.serverTime(), ...SR.stamp() }); id = ref.id; }
        if (editor.photo) await window.db.collection(PHOTO_COLL).doc(id).set({ data: editor.photo.full, ...SR.stamp() });
        else if (editor.removePhoto) await window.db.collection(PHOTO_COLL).doc(id).delete().catch(() => {});
        SR.toast(`已儲存：${data.name}`);
        const where = editor.where;
        editor = null;
        if (where === 'sheet') { sheetId = id; const p = persons.find(x => x.id === id) || { id, ...data }; showSheetDetail(p); }
        else { selectedId = id; render(); renderInspector(); }
      } catch (err) {
        console.error(err);
        SR.toast('儲存失敗（' + (err.code || err.message) + '）', 'error');
        if (btn) btn.disabled = false;
      }
    }

    async function deletePerson() {
      const p = persons.find(x => x.id === editor.id);
      if (!p || !confirm(`確定要把「${p.name}」${IS_INTAKE ? '這筆留名單刪除' : '從名單刪除'}嗎？\n刪除後無法復原。`)) return;
      try {
        await window.db.collection(COLL).doc(p.id).delete();
        await window.db.collection(PHOTO_COLL).doc(p.id).delete().catch(() => {});
        SR.toast(`已刪除：${p.name}`);
        const where = editor.where; editor = null;
        if (where === 'sheet') closeSheet(); else { selectedId = null; renderInspector(); }
      } catch (err) { SR.toast('刪除失敗（' + (err.code || err.message) + '）', 'error'); }
    }

    // ---------- 新朋友 → 加入組員通訊錄 ----------
    async function joinMembers() {
      if (!IS_INTAKE || !access.isAdmin || !editor || !editor.id) return;
      if (editor.dirty) { SR.toast('請先按「儲存」，再加入通訊錄', 'error'); return; }
      const p = persons.find(x => x.id === editor.id);
      if (!p || p.personId) return;
      try {
        const members = (await window.db.collection('persons').get()).docs.map(d => ({ id: d.id, ...d.data() }));
        const same = members.find(m => SR.dupKey(m) === SR.dupKey(p)) || members.find(m => m.name === p.name && SR.phoneDigits(m.mobile) && SR.phoneDigits(m.mobile) === SR.phoneDigits(p.mobile));
        if (same && !confirm(`通訊錄裡好像已經有「${same.name}」了，還是要再加一筆嗎？`)) return;
        if (!same && !confirm(`把「${p.name}」加入組員通訊錄？`)) return;
        const lines = [`新朋友表單 ${fmtDate(createdMs(p))}`.trim(),
          p.refName ? `介紹人：${p.refName}${p.refRelation ? `（${p.refRelation}）` : ''}${p.refPhone ? ' ' + p.refPhone : ''}` : '',
          (p.faith || []).length ? `信仰：${p.faith.join('、')}` : '', (p.intent || []).length ? `希望：${p.intent.join('、')}` : '',
          p.note ? `代禱：${p.note}` : ''].filter(Boolean);
        const data = {
          name: p.name, gender: p.gender || '', birthday: p.birthday || '', mobile: p.mobile || '', phone: p.phone || '',
          address: (p.address || '').slice(0, 200), marital: p.marital || '', living: p.living || '', groupId: p.groupId || '',
          status: p.status === '加入小組' ? '聚會小組' : '', note: lines.join('\n').slice(0, 2000),
          memberNo: SR.nextMemberNo(members, p.gender), source: 'intake', createdAt: SR.serverTime(), ...SR.stamp()
        };
        if (p.photoThumb) data.photoThumb = p.photoThumb;
        const pref = window.db.collection('persons').doc();
        const batch = window.db.batch();
        batch.set(pref, data);
        batch.update(window.db.collection('intakes').doc(p.id), { personId: pref.id, joinedAt: SR.serverTime(), ...SR.stamp() });
        await batch.commit();
        if (p.photoThumb) {
          const ph = await window.db.collection('intakePhotos').doc(p.id).get().catch(() => null);
          if (ph && ph.exists && ph.data().data) await window.db.collection('personPhotos').doc(pref.id).set({ data: ph.data().data, ...SR.stamp() }).catch(() => {});
        }
        p.personId = pref.id;   // 先在畫面上更新，不用等資料庫回傳
        SR.toast(`已加入通訊錄：${p.name}（編號 ${data.memberNo}）`);
        editor = null;
        render();
        if (!$('sheet').classList.contains('hidden')) showSheetDetail({ ...p, personId: pref.id }); else renderInspector();
      } catch (err) { console.error(err); SR.toast('加入失敗（' + (err.code || err.message) + '）', 'error'); }
    }

    // 新增
    document.addEventListener('click', e => {
      if (!e.target.closest('[data-new]') || !access.isAdmin) return;
      if (isDesktop()) {
        if (editor && editor.dirty && !confirm('剛剛的修改還沒儲存，要放棄嗎？')) return;
        selectedId = null;
        $('tbody').querySelectorAll('tr').forEach(tr => tr.setAttribute('aria-selected', 'false'));
        startEditor(null, 'inspector'); renderInspector();
        setTimeout(() => $('inspector').querySelector('#f_name')?.focus(), 30);
      } else {
        sheetId = null; startEditor(null, 'sheet'); openSheet(); $('sheetBody').innerHTML = formHtml(); $('sheetEdit').classList.add('hidden');
      }
    });

    // ---------- 手機個人資料頁 ----------
    let sheetId = null, lastFocus = null;
    document.addEventListener('click', e => {
      const b = e.target.closest('[data-open]');
      if (!b) return;
      const p = persons.find(x => x.id === b.dataset.open);
      if (!p) return;
      lastFocus = b; sheetId = p.id; editor = null;
      openSheet(); showSheetDetail(p);
    });
    function openSheet() { $('sheet').classList.remove('hidden'); document.body.style.overflow = 'hidden'; $('sheet').scrollTop = 0; }
    function closeSheet() {
      $('sheet').classList.add('hidden'); document.body.style.overflow = ''; editor = null;
      if (lastFocus && lastFocus.isConnected) lastFocus.focus();
    }
    function showSheetDetail(p) {
      $('sheetEdit').classList.toggle('hidden', !access.isAdmin);
      $('sheetBody').innerHTML = detailHtml(p);
      $('sheet').scrollTop = 0;
      loadBigPhoto(p);
    }
    $('sheet').addEventListener('click', e => {
      const j = e.target.closest('[data-join-sheet]');
      if (j) { const p = persons.find(x => x.id === j.dataset.joinSheet); if (p) { startEditor(p, 'sheet'); joinMembers(); } return; }
      if (e.target.closest('[data-close]')) {
        if (editor && editor.dirty && !confirm('剛剛的修改還沒儲存，要放棄嗎？')) return;
        closeSheet();
      }
    });
    $('sheetEdit').addEventListener('click', () => {
      const p = persons.find(x => x.id === sheetId);
      if (!p) return;
      startEditor(p, 'sheet'); $('sheetBody').innerHTML = formHtml(); $('sheetEdit').classList.add('hidden'); $('sheet').scrollTop = 0;
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('sheet').classList.contains('hidden') && !(editor && editor.dirty)) closeSheet(); });
  })();
