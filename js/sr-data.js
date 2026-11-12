/**
 * CLC SR｜名單共用工具（通訊錄、名單後台、新朋友登記共用）
 *
 * Firestore 結構：
 *   persons/{id}   組員：name, gender('女'|'男'|''), birthday('YYYY-MM-DD'|''), phone, mobile,
 *                  address, marital, living, groupId, status, note, source, createdAt, updatedAt, updatedBy
 *   groups/{id}    小組：name, order, active
 *   options/lists  選項：statuses[], marital[], living[]（字串陣列，依序顯示）
 */
(function () {
  const SR = window.SR = {};

  // 新朋友表單與點名表「狀態選單」上的小組（初始化小組時使用，之後以後台為準）。
  SR.DEFAULT_GROUPS = ['惠玲小組', '美鈴小組', '美燕小組', '家玲小組', '淑美小組', '月嬌小組', '文菽小組', '翊婕小組',
    '文寶小組', '春梅小組', '菡翎小組', '曉艾小組', '夢凌小組', '瑞君小組', '培榮小組', '文泉小組', '健誠小組', '加樂同工'];

  SR.DEFAULT_OPTIONS = {
    // 與點名表「狀態選單」相同（去掉前面的編號）
    statuses: ['聚會小組', '只來聚會', '很久沒來', '居家休養', '離開教會', '安息主懷', '其他'],
    marital: ['已婚', '單身'],
    living: ['家人同住', '獨居', '其他']
  };
  // 新朋友名單的狀態（與點名表「狀態選單」的新人狀態相同）
  SR.INTAKE_STATUSES = ['跟進關懷', '偶爾聚會', '委身聚會', '加入小組', '暫不加入'];
  SR.OPTION_LABELS = { statuses: '狀態', marital: '婚姻', living: '居住狀況' };

  SR.PERSON_FIELDS = ['name', 'gender', 'birthday', 'phone', 'mobile', 'address', 'marital', 'living', 'groupId', 'status', 'note'];
  SR.FIELD_LABELS = {
    name: '姓名', gender: '性別', birthday: '生日', phone: '市話', mobile: '手機', address: '地址',
    marital: '婚姻', living: '居住狀況', groupId: '小組', status: '狀態', note: '備註', memberNo: '編號'
  };

  SR.esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const pad = n => String(n).padStart(2, '0');

  function validYmd(y, m, d) {
    if (!(y >= 1890 && y <= new Date().getFullYear() && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return false;
    const dt = new Date(y, m - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
  }

  /**
   * 把各種生日寫法轉成 'YYYY-MM-DD'。空白回傳 ''；看不懂回傳 null。
   * 支援：1956-03-02、1956/3/2、45/3/2（民國）、45.03.02、民國45年3月2日、0450302、19560302、
   *       Excel 日期物件與日期序號。年份小於 200 一律視為民國年。
   */
  SR.parseBirthday = function (value) {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) {
      if (isNaN(value)) return null;
      const y = value.getFullYear(), m = value.getMonth() + 1, d = value.getDate();
      return validYmd(y, m, d) ? `${y}-${pad(m)}-${pad(d)}` : null;
    }
    if (typeof value === 'number') {
      if (value > 1000 && value < 80000) { // Excel 日期序號
        const dt = new Date(Math.round((value - 25569) * 86400000));
        return SR.parseBirthday(new Date(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()));
      }
      value = String(value);
    }
    let s = String(value).trim().replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    if (!s) return '';
    let roc = false;
    if (/^民國/.test(s)) { roc = true; s = s.replace(/^民國\s*/, ''); }
    s = s.replace(/^西元\s*/, '');
    let y, m, d, parts;
    if ((parts = s.match(/^(\d{1,4})\s*[\/\-.年]\s*(\d{1,2})\s*[\/\-.月]\s*(\d{1,2})\s*日?$/))) {
      [y, m, d] = parts.slice(1).map(Number);
    } else if (/^\d{8}$/.test(s)) {
      y = +s.slice(0, 4); m = +s.slice(4, 6); d = +s.slice(6, 8);
    } else if (/^\d{6,7}$/.test(s)) { // 民國 YYMMDD / YYYMMDD
      y = +s.slice(0, s.length - 4); m = +s.slice(-4, -2); d = +s.slice(-2); roc = true;
    } else {
      return null;
    }
    if (roc || y < 200) y += 1911;
    return validYmd(y, m, d) ? `${y}-${pad(m)}-${pad(d)}` : null;
  };

  SR.formatRoc = function (iso) {
    const p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    return p ? `${+p[1] - 1911}/${p[2]}/${p[3]}` : '';
  };
  SR.formatRocLong = function (iso) {
    const p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    return p ? `民國 ${+p[1] - 1911} 年 ${+p[2]} 月 ${+p[3]} 日` : '';
  };
  SR.age = function (iso) {
    const p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    if (!p) return null;
    const now = new Date();
    let a = now.getFullYear() - +p[1];
    if (now.getMonth() + 1 < +p[2] || (now.getMonth() + 1 === +p[2] && now.getDate() < +p[3])) a--;
    return a;
  };

  /** 電話整理：手機 0920-710404；市話 02-2345-6789；其他保留原文字。 */
  SR.formatPhone = function (value) {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    let digits = raw.replace(/[^\d]/g, '');
    if (/^886\d{8,9}$/.test(digits)) digits = '0' + digits.slice(3); // +886
    if (/^9\d{8}$/.test(digits)) digits = '0' + digits; // Excel 吃掉開頭 0
    if (/^09\d{8}$/.test(digits)) return `${digits.slice(0, 4)}-${digits.slice(4)}`;   // 手機統一 0920-710404
    if (/^02\d{8}$/.test(digits)) return `02-${digits.slice(2, 6)}-${digits.slice(6)}`;
    if (/^[2-8]\d{7}$/.test(digits)) return `02-${digits.slice(0, 4)}-${digits.slice(4)}`; // 沒寫區碼的台北市話
    if (/^0[3-8]\d{7,8}$/.test(digits)) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
    return raw;
  };
  SR.phoneDigits = v => String(v ?? '').replace(/[^\d]/g, '');

  SR.normGender = function (value) {
    const s = String(value ?? '').trim();
    if (/^(女|姊妹|姐妹|f|female)$/i.test(s)) return '女';
    if (/^(男|弟兄|兄弟|m|male)$/i.test(s)) return '男';
    return '';
  };
  SR.genderLabel = g => g === '女' ? '姊妹' : g === '男' ? '弟兄' : '';

  /**
   * 一格裡寫了好幾支電話（以空白、/、換行分隔）時拆開。
   * 回傳 { mobiles: [], landlines: [], text: 除了號碼以外的文字（例如「高雄家」「空號」）}
   */
  SR.splitPhones = function (value) {
    const raw = String(value ?? '').trim();
    const out = { mobiles: [], landlines: [], text: '' };
    if (!raw) return out;
    const tokens = raw.match(/[\d\-()（）+]{7,}/g) || [];
    tokens.forEach(t => {
      const f = SR.formatPhone(t);
      const d = SR.phoneDigits(f);
      if (d.length < 7) return;
      (/^09\d{8}$/.test(d) ? out.mobiles : out.landlines).push(f);
    });
    out.text = raw.replace(/[\d\-()（）+\/\s,，、]+/g, ' ').trim();
    return out;
  };

  /** 辨識重複：姓名＋電話末 6 碼＋生日都相同（同名不同人不會被誤判）。 */
  SR.dupKey = p => [String(p.name || '').replace(/\s+/g, ''),
    (SR.phoneDigits(p.mobile) || SR.phoneDigits(p.phone)).slice(-6), p.birthday || ''].join('|');

  // ---------- Firestore ----------
  SR.watchGroups = function (onData, onError) {
    return window.db.collection('groups').onSnapshot(snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || String(a.name).localeCompare(String(b.name), 'zh-Hant'));
      onData(list);
    }, onError);
  };

  SR.watchOptions = function (onData, onError) {
    return window.db.collection('options').doc('lists').onSnapshot(snap => {
      const data = snap.exists ? snap.data() : {};
      const merged = {};
      for (const k of Object.keys(SR.DEFAULT_OPTIONS)) {
        merged[k] = Array.isArray(data[k]) ? data[k] : SR.DEFAULT_OPTIONS[k].slice();
        if (k === 'statuses') merged[k] = merged[k].filter(x => !SR.NOT_STATUS.includes(x));
      }
      onData(merged, snap.exists);
    }, onError);
  };

  // 「加樂同工」是身分不是聚會狀態：舊資料寫成狀態的，一律當作「未歸類」。
  SR.NOT_STATUS = ['加樂同工'];
  SR.statusOf = p => (p && p.status && !SR.NOT_STATUS.includes(p.status)) ? p.status : '';

  SR.serverTime = () => firebase.firestore.FieldValue.serverTimestamp();
  SR.stamp = () => ({ updatedAt: SR.serverTime(), updatedBy: window.currentAdminEmail || '' });


  // ---------- 身分與小組對象 ----------
  // 上方「大分類」：姊妹小組、弟兄小組看所屬小組（小組沒設定對象時看性別）；
  // 加樂同工（小組名稱含「同工」）、全職同工（身分）、未分組各自一類。
  SR.WHO = ['姊妹小組', '弟兄小組', '加樂同工', '全職同工', '未分組'];
  SR.CATEGORIES = ['全職同工', '其他'];
  SR.personWho = function (p, groupMap) {
    if (p.category === '全職同工') return '全職同工';
    const g = groupMap && groupMap[p.groupId];
    if (!g) return '未分組';
    if (/同工/.test(g.name)) return '加樂同工';
    const gg = SR.groupGender(g) || p.gender;
    return gg === '男' ? '弟兄小組' : gg === '女' ? '姊妹小組' : '未分組';
  };
  /** 小組的對象：'女' 姊妹小組、'男' 弟兄小組、'' 不限。沒設定時：培榮、文泉是弟兄小組，其他是姊妹小組。 */
  SR.groupGender = function (g) {
    if (!g) return '';
    if (g.gender === '女' || g.gender === '男' || g.gender === '') return g.gender;
    if (/同工/.test(g.name)) return '';
    return /培榮|文泉/.test(g.name) ? '男' : '女';
  };
  /** 某個性別可以選的小組（加上目前已選的那一組，避免舊資料看不到）。 */
  SR.groupsFor = function (groups, gender, keepId) {
    return groups.filter(g => g.id === keepId || (g.active !== false && (!gender || !SR.groupGender(g) || SR.groupGender(g) === gender)));
  };

  // ---------- 排序：姓名依筆畫 ----------
  // zh-Hant 的預設排序就是筆畫（同筆畫再比部首），與台灣通訊錄習慣一致。
  SR.collator = new Intl.Collator('zh-Hant-TW-u-co-stroke');
  SR.byName = (a, b) => SR.collator.compare(String(a.name || ''), String(b.name || ''));

  // ---------- 會員編號 ----------
  // 沿用點名表的 No.：姊妹是數字（12），弟兄前面有 *（*12）。只顯示在個人資料裡，可搜尋、可排序。
  SR.memberNoNum = v => { const m = String(v ?? '').match(/\d+/); return m ? +m[0] : Infinity; };
  SR.byMemberNo = (a, b) => {
    const ga = String(a.memberNo || '').startsWith('*') ? 1 : 0, gb = String(b.memberNo || '').startsWith('*') ? 1 : 0;
    return ga - gb || SR.memberNoNum(a.memberNo) - SR.memberNoNum(b.memberNo) || SR.byName(a, b);
  };
  /** 新增組員時給下一個編號：姊妹接著最大數字，弟兄接著最大的 *數字。 */
  SR.nextMemberNo = function (persons, gender) {
    const star = gender === '男';
    let max = 0;
    persons.forEach(p => {
      const v = String(p.memberNo || '').trim();
      if (!v || v.startsWith('*') !== star) return;
      const n = SR.memberNoNum(v);
      if (n !== Infinity && n > max) max = n;
    });
    return (star ? '*' : '') + (max + 1);
  };

  // ---------- 頭像：圓角方形，有相片顯示相片，沒有就顯示姓 ----------
  const AVATAR_COLORS = ['#D6336C', '#9C36B5', '#D9480F', '#1971C2', '#2B8A3E', '#5F3DC4', '#0B7285', '#C2255C'];
  SR.avatarColor = function (name) {
    let h = 0;
    for (const ch of String(name || '')) h = (h * 31 + ch.codePointAt(0)) >>> 0;
    return AVATAR_COLORS[h % AVATAR_COLORS.length];
  };
  SR.avatarHtml = function (p, size = 44) {
    const radius = Math.round(size * 0.26);
    const base = `width:${size}px;height:${size}px;border-radius:${radius}px;flex:none;`;
    if (p.photoThumb && /^data:image\/(jpeg|png|webp);base64,/.test(p.photoThumb)) {
      return `<img class="sr-avatar" src="${SR.esc(p.photoThumb)}" alt="" style="${base}object-fit:cover">`;
    }
    const ch = Array.from(String(p.name || '？').trim())[0] || '？';
    return `<span class="sr-avatar" aria-hidden="true" style="${base}background:${SR.avatarColor(p.name)};font-size:${Math.round(size * 0.44)}px">${SR.esc(ch)}</span>`;
  };

  // ---------- 聚會狀態的顏色 ----------
  const STATUS_STYLE = {
    '聚會小組': ['#DFF7E5', '#1B6B34'], '只來聚會': ['#E3EEFF', '#0B4FA8'], '加樂同工': ['#D7F3F5', '#00646E'],
    '新朋友': ['#FFF3C4', '#7A5200'], '居家休養': ['#FFEBD6', '#9A4A00'], '很久沒來': ['#EEEEF2', '#48484A'],
    '離開教會': ['#EEEEF2', '#5C5C60'], '安息主懷': ['#EEE6FA', '#5B3C99'], '其他': ['#EEEEF2', '#48484A'],
    '未處理': ['#FFE8D6', '#A3460B'], '跟進關懷': ['#FFF3C4', '#7A5200'], '偶爾聚會': ['#E3EEFF', '#0B4FA8'],
    '委身聚會': ['#D7F3F5', '#00646E'], '加入小組': ['#DFF7E5', '#1B6B34'], '暫不加入': ['#EEEEF2', '#48484A']
  };
  SR.statusPill = function (status) {
    if (!status) return '';
    const [bg, fg] = STATUS_STYLE[status] || ['#EEEEF2', '#48484A'];
    return `<span class="sr-pill" style="background:${bg};color:${fg}">${SR.esc(status)}</span>`;
  };

  // ---------- 相片：在瀏覽器裡裁切壓縮，不必另外開檔案儲存空間 ----------
  // thumb：128px 正方形，存在組員資料裡（列表直接顯示，每張約 5KB）
  // full：最長邊 720px，存在 personPhotos/{id}（打開個人資料才讀取）
  SR.makePhoto = async function (file) {
    if (!file || !/^image\//.test(file.type)) throw new Error('請選擇照片檔案');
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error('照片讀不出來，請換一張')); i.src = url; });
      const draw = (w, h, sx, sy, sw, sh, q) => {
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
        g.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
        return c.toDataURL('image/jpeg', q);
      };
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      const thumb = draw(128, 128, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0.78);
      const scale = Math.min(1, 720 / Math.max(img.naturalWidth, img.naturalHeight));
      const fw = Math.round(img.naturalWidth * scale), fh = Math.round(img.naturalHeight * scale);
      let full = draw(fw, fh, 0, 0, img.naturalWidth, img.naturalHeight, 0.82);
      if (full.length > 850000) full = draw(fw, fh, 0, 0, img.naturalWidth, img.naturalHeight, 0.6);
      return { thumb, full };
    } finally { URL.revokeObjectURL(url); }
  };

  // ---------- 提示訊息 ----------
  SR.toast = function (message, kind = 'ok') {
    let box = document.getElementById('srToast');
    if (!box) {
      box = document.createElement('div');
      box.id = 'srToast';
      box.setAttribute('role', 'status');
      box.setAttribute('aria-live', 'polite');
      document.body.appendChild(box);
    }
    box.textContent = message;
    box.className = 'sr-toast show ' + (kind === 'error' ? 'sr-toast-error' : '');
    clearTimeout(box._timer);
    box._timer = setTimeout(() => box.classList.remove('show'), kind === 'error' ? 4500 : 2200);
  };

  /** 等 header.js 的登入狀態確定後回呼；之後狀態改變也會再呼叫。 */
  SR.onAccess = function (callback) {
    let settled = false;
    const fire = () => callback({ canView: !!window.canViewAdmin, isAdmin: !!window.isAdmin, isViewer: !!window.isViewer });
    window.addEventListener('clc-admin-changed', () => { settled = true; fire(); });
    if (window.auth) {
      window.auth.onAuthStateChanged(user => {
        if (!user) { settled = true; fire(); }
      });
    } else {
      fire();
    }
    // 登入狀態若在註冊事件前就已確定，補發一次。
    setTimeout(() => { if (!settled && window.__clcLastAdminState) fire(); }, 50);
  };
})();
