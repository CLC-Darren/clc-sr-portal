/**
 * CLC SR 寄信程式（Google Apps Script）
 *
 * 用途：新朋友在「新朋友留名單」送出後，每 5 分鐘把歡迎紀念卡和資料寄給：
 *   - 名單後台 →「小組」頁面裡，「每一位新朋友都要通知的信箱」
 *   - 新朋友選的那個小組的通知信箱（小組長、區長）
 *
 * 必要條件：
 *   - 這份程式必須放在「有 Firebase 專案 clc-sr-portal 權限」的 Google 帳號（專案擁有者或編輯者）。
 *     程式用該帳號的身分讀寫 Firestore，所以不受網站的 Firestore 規則限制。
 *   - 寄件人就是這個 Google 帳號（建議用 darren.lin@twclc.org 這類同工帳號）。
 *
 * 安裝：
 *   1. script.google.com 新增專案，貼上本檔（Code.gs）與 appsscript.json（專案設定 → 顯示「appsscript.json」）。
 *   2. 執行一次 setup()，依提示授權。它會建立「每 5 分鐘」的觸發條件，並先跑一次檢查。
 *   3. 想先試寄，可以執行 processIntakes()，再看「執行紀錄」。
 */

const PROJECT_ID = 'clc-sr-portal';
const SITE_URL = 'https://clc-sr-portal.pages.dev';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// ---------------------------------------------------------------- 安裝／檢查
function setup() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('processIntakes').timeBased().everyMinutes(5).create();
  checkSetup();
}

/** 只檢查，不寄信：確認這個帳號讀得到 Firestore。結果看「執行紀錄」。 */
function checkSetup() {
  const me = Session.getEffectiveUser().getEmail();
  const pending = runQuery_('intakes', 'notify', 'pending', 50);
  const contacts = listAll_('groupContacts');
  console.log(`寄件帳號：${me}`);
  console.log(`待通知的新朋友：${pending.length} 位；已設定通知信箱的小組：${contacts.filter(c => (c.data.emails || []).length).length} 個`);
  console.log(`觸發條件：${ScriptApp.getProjectTriggers().map(t => t.getHandlerFunction()).join('、') || '（無）'}`);
}

// ---------------------------------------------------------------- 新朋友通知
function processIntakes() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    const jobs = runQuery_('intakes', 'notify', 'pending', 20);
    if (!jobs.length) return;
    const contacts = Object.fromEntries(listAll_('groupContacts').map(c => [c.id, (c.data.emails || []).filter(e => EMAIL_RE.test(e))]));
    jobs.forEach(job => {
      const d = job.data;
      try {
        const to = Array.from(new Set([...(contacts._all || []), ...(d.groupId ? contacts[d.groupId] || [] : [])]));
        if (!to.length) { patch_(job.name, { notify: 'no-recipient', notifiedAt: new Date() }); return; }
        let card = null;
        try {
          const c = getDoc_('intakeCards', job.id);
          const m = c && String(c.data.data || '').match(/^data:image\/jpeg;base64,(.+)$/);
          if (m) card = Utilities.newBlob(Utilities.base64Decode(m[1]), 'image/jpeg', `加樂歡迎卡_${d.name || '新朋友'}.jpg`);
        } catch (e) { console.warn('讀不到紀念卡：' + e.message); }
        const subject = `CLC SR｜新朋友 ${d.name || ''}${d.groupName ? '（' + d.groupName + '）' : ''}`;
        MailApp.sendEmail({
          to: to.join(','),
          subject,
          htmlBody: mailHtml_(d, !!card),
          inlineImages: card ? { card } : undefined,
          attachments: card ? [card] : undefined,
          name: 'CLC SR 加樂團契'
        });
        patch_(job.name, { notify: 'sent', notifiedAt: new Date() });
      } catch (err) {
        patch_(job.name, { notify: 'failed', notifyError: String(err.message || err).slice(0, 300), notifiedAt: new Date() });
      }
    });
  } finally { lock.releaseLock(); }
}

function mailHtml_(d, hasCard) {
  const roc = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? `民國 ${+m[1] - 1911} 年 ${+m[2]} 月 ${+m[3]} 日` : ''; };
  const rows = [
    ['姓名', d.name], ['身分', d.gender === '女' ? '姊妹' : d.gender === '男' ? '弟兄' : ''], ['生日', roc(d.birthday)],
    ['手機', d.mobile], ['市話', d.phone], ['地址', d.address], ['婚姻', d.marital], ['居住狀況', d.living],
    ['關懷小組', d.groupName || '暫不安排'],
    ['介紹人', [d.refName, d.refRelation ? `（${d.refRelation}）` : '', d.refPhone].filter(Boolean).join(' ')],
    ['信仰', (d.faith || []).join('、')], ['希望', (d.intent || []).join('、')], ['代禱事項', d.note]
  ].filter(r => r[1]);
  const tel = String(d.mobile || '').replace(/[^\d]/g, '');
  return `<div style="font-family:'PingFang TC','Microsoft JhengHei',sans-serif;font-size:16px;color:#3B342C;max-width:560px">
    <h2 style="color:#007E8A;margin:0 0 8px">🌱 有一位新朋友留了名單</h2>
    <p style="margin:0 0 16px">請在一週內聯絡、關心這位新朋友。</p>
    ${hasCard ? '<img src="cid:card" alt="歡迎紀念卡" style="width:100%;max-width:420px;border-radius:12px;display:block;margin:0 0 16px">' : ''}
    <table style="border-collapse:collapse;width:100%">${rows.map(([k, v]) =>
      `<tr><td style="padding:8px 10px;border-bottom:1px solid #EFE3D3;color:#8A7D6E;white-space:nowrap;vertical-align:top">${esc_(k)}</td><td style="padding:8px 10px;border-bottom:1px solid #EFE3D3;font-weight:bold;white-space:pre-line">${esc_(v)}</td></tr>`).join('')}
    </table>
    <p style="margin:18px 0">${tel ? `<a href="tel:${tel}" style="display:inline-block;background:#007E8A;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none;font-weight:bold">📞 撥給 ${esc_(d.name)}</a>　` : ''}
      <a href="${SITE_URL}/intakes.html" style="color:#007E8A;font-weight:bold">打開新朋友名單後台</a></p>
    <p style="color:#A99B89;font-size:13px">這封信由 CLC SR 加樂團契系統自動寄出。通知信箱可以在「名單後台 → 小組」修改。</p>
  </div>`;
}

function getDoc_(col, id) {
  try { return fromDoc_(api_('get', `${BASE}/${col}/${encodeURIComponent(id)}`)); }
  catch (err) { if (err.code === 404) return null; throw err; }
}

// ---------------------------------------------------------------- Firestore REST 小工具
function api_(method, url, body) {
  const res = UrlFetchApp.fetch(url, {
    method, contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    payload: body ? JSON.stringify(body) : undefined
  });
  const code = res.getResponseCode(), text = res.getContentText();
  if (code >= 300) {
    const err = new Error(`Firestore ${method} ${code}：${text.slice(0, 300)}`);
    err.code = code; throw err;
  }
  return text ? JSON.parse(text) : {};
}
const docName_ = (col, id) => `projects/${PROJECT_ID}/databases/(default)/documents/${col}/${id}`;

function listAll_(col) {
  const out = []; let token = '';
  do {
    const r = api_('get', `${BASE}/${col}?pageSize=300${token ? '&pageToken=' + encodeURIComponent(token) : ''}`);
    (r.documents || []).forEach(d => out.push(fromDoc_(d)));
    token = r.nextPageToken || '';
  } while (token);
  return out;
}
function runQuery_(col, field, value, limit) {
  const r = api_('post', `${BASE}:runQuery`, { structuredQuery: {
    from: [{ collectionId: col }],
    where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: toValue_(value) } },
    limit
  } });
  return r.filter(x => x.document).map(x => fromDoc_(x.document));
}
function patch_(name, fields) {
  const mask = Object.keys(fields).map(k => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&');
  return api_('patch', `https://firestore.googleapis.com/v1/${name}?${mask}`, { fields: toFields_(fields) });
}
function createIfAbsent_(col, id, fields) {
  try { api_('post', `${BASE}/${col}?documentId=${encodeURIComponent(id)}`, { fields: toFields_(fields) }); return true; }
  catch (err) { if (err.code === 409) return false; throw err; }
}
function fromDoc_(d) {
  return { name: d.name, id: d.name.split('/').pop(), data: Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, fromValue_(v)])) };
}
function fromValue_(v) {
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('timestampValue' in v) return new Date(v.timestampValue);
  if ('nullValue' in v) return null;
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, fromValue_(x)]));
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromValue_);
  return null;
}
function toValue_(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue_) } };
  if (typeof v === 'object') return { mapValue: { fields: toFields_(v) } };
  return { stringValue: String(v) };
}
function toFields_(o) { return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, toValue_(v)])); }
function esc_(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
