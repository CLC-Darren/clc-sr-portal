/**
 * 加樂團契服事表 Web 應用程式主邏輯
 * - 桌機版：完整呈現原 Excel 17欄 × 每週6列合併結構，支援行內直接編輯 (Inline Editing)
 * - 手機版：自動轉換為「週次任務卡片視圖」與「橫向週次導覽膠囊」，單手上下滑動即可清晰閱讀與修改
 * - 雙向同步：桌機表格修改與手機卡片修改共用同一份 State，並即時寫入本機 localStorage
 */

(function () {
  let rosterState = null;
  let searchQuery = '';
  let selectedWeekFilter = 'all';
  let currentViewMode = 'auto'; // 'auto' | 'table' | 'card'
  let saveTimer = null;

  // 輔助函式：取得/設定物件深層路徑
  function getByPath(obj, path) {
    return path.split('.').reduce((acc, key) => (acc ? acc[key] : ''), obj);
  }

  function setByPath(obj, path, value) {
    const keys = path.split('.');
    const last = keys.pop();
    const target = keys.reduce((acc, key) => acc[key], obj);
    if (target) target[last] = value;
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatMultiline(str) {
    return escapeHtml(str).replace(/\n/g, '<br>');
  }

  // 初始化
  async function init() {
    rosterState = await window.rosterApi.getRoster(2026, 'Q4');
    renderMeta();
    renderLeaders();
    populateWeekDropdown();
    renderAllViews();
    bindEvents();
    updateSaveIndicator(rosterState.meta.lastUpdated, false);
  }

  function renderMeta() {
    document.getElementById('bannerYear').textContent = rosterState.meta.year;
    document.getElementById('bannerTitle').textContent = rosterState.meta.title;
    document.getElementById('bannerNote').textContent = rosterState.meta.note;
  }

  function renderLeaders() {
    document.querySelectorAll('.leader-cell[data-leader]').forEach((th) => {
      const key = th.dataset.leader;
      th.textContent = rosterState.leaders[key] || '';
      th.setAttribute('contenteditable', 'true');
      th.setAttribute('spellcheck', 'false');
    });
  }

  function populateWeekDropdown() {
    const select = document.getElementById('weekJumpSelect');
    const currentVal = select.value;
    select.innerHTML = `<option value="all">顯示全部週次 (${rosterState.weeks.length}週)</option>`;
    rosterState.weeks.forEach((w) => {
      const opt = document.createElement('option');
      opt.value = w.id;
      const statusTag = w.isHoliday ? ` [休會: ${w.holidayName || '放假'}]` : '';
      const eventTag = w.events.event1 ? ` (${w.events.event1})` : '';
      opt.textContent = `第${w.weekNumber}週 · ${w.displayDate}${eventTag}${statusTag}`;
      select.appendChild(opt);
    });
    if ([...select.options].some((o) => o.value === currentVal)) {
      select.value = currentVal;
    }
  }

  function renderAllViews() {
    renderDesktopTable();
    renderMobileCards();
    applySearchHighlight();
  }

  // 建立可編輯儲存格 HTML（桌機表格用）
  function editableTd(weekIdx, path, val, extraClass = '', rowspan = 1, colspan = 1, isMultiline = false) {
    const rsAttr = rowspan > 1 ? ` rowspan="${rowspan}"` : '';
    const csAttr = colspan > 1 ? ` colspan="${colspan}"` : '';
    const displayVal = isMultiline ? formatMultiline(val) : escapeHtml(val);
    const mlAttr = isMultiline ? ' data-multiline="true"' : '';
    return `<td${rsAttr}${csAttr} class="editable-cell ${extraClass}" contenteditable="true" spellcheck="false" data-week="${weekIdx}" data-path="${path}"${mlAttr}>${displayVal}</td>`;
  }

  // 渲染桌機版 17欄 × 每週6列完整結構
  function renderDesktopTable() {
    const tbody = document.getElementById('rosterTableBody');
    tbody.innerHTML = '';

    rosterState.weeks.forEach((w, idx) => {
      if (selectedWeekFilter !== 'all' && selectedWeekFilter !== w.id) return;

      const weekGroupClass = idx % 2 === 1 ? 'week-alt' : 'week-normal';
      const holidayClass = w.isHoliday ? 'week-holiday' : '';

      // 講員底色類別（對應原 Excel 黃底、青底、綠底）
      let speakerBgClass = '';
      if (w.message.speakerType === 'church') speakerBgClass = 'bg-speaker-church';
      else if (w.message.speakerType === 'external') speakerBgClass = 'bg-speaker-external';
      else if (w.message.speakerType === 'outing') speakerBgClass = 'bg-speaker-outing';

      // 若該週標記為放假，在上方顯示一條醒目的休會提示橫幅列（不破壞原欄位結構）
      let holidayBannerHtml = '';
      if (w.isHoliday) {
        holidayBannerHtml = `
          <tr class="holiday-notice-row">
            <td colspan="17">
              🏖️ <strong>${escapeHtml(w.displayDate)} 本週暫停聚會／放假</strong>：${escapeHtml(w.holidayName || '教會行事曆休會')}（仍可點擊下方欄位預排或調整）
            </td>
          </tr>
        `;
      }

      // 第1列 (Row +0)：日期(A), 講員(B), 主領(C:D), 樂手1(E), 投影片(F, rowspan 6), 音控(G, rowspan 6), 攝影1(H), 招待一樓(I+J), 愛宴主責(K), 教會車固定標籤(L), 點名1(M), 交誼廳接待固定標籤(N:O), 體操帶操(P), 值班(Q, rowspan 6)
      const r0 = `
        <tr class="week-row week-row-start ${weekGroupClass} ${holidayClass}" data-week-id="${w.id}">
          <td class="fixed-col sticky-col date-cell">${escapeHtml(w.displayDate)}</td>
          ${editableTd(idx, 'message.speaker', w.message.speaker, `speaker-cell ${speakerBgClass}`)}
          ${editableTd(idx, 'worship.lead', w.worship.lead, 'worship-lead-cell', 1, 2)}
          ${editableTd(idx, 'musicians.0', w.musicians[0], 'musician-cell')}
          ${editableTd(idx, 'slides', w.slides, 'tech-cell', 6, 1)}
          ${editableTd(idx, 'sound', w.sound, 'tech-cell', 6, 1)}
          ${editableTd(idx, 'camera.0', w.camera[0], 'camera-cell')}
          ${editableTd(idx, 'reception.floor1', w.reception.floor1, 'rec-name-cell')}
          <td class="fixed-col rec-loc-cell">一樓</td>
          ${editableTd(idx, 'meal.coordinator', w.meal.coordinator, 'meal-coord-cell')}
          <td class="fixed-col shuttle-label-cell">教會 AWF-7019</td>
          ${editableTd(idx, 'rollCall.0', w.rollCall[0], 'roll-cell')}
          <td colspan="2" class="fixed-col lounge-header-cell">交誼廳接待</td>
          ${editableTd(idx, 'exercise.leader', w.exercise.leader, 'exercise-leader-cell')}
          ${editableTd(idx, 'duty', w.duty, 'duty-cell', 6, 1)}
        </tr>
      `;

      // 第2列 (Row +1)：特別活動1(A, rowspan 3), 信息主題(B, rowspan 5), 敬拜同工1(C:D), 樂手2(E, rowspan 5), 攝影2(H, rowspan 5), 招待中間(I+J), 愛宴同工1(K), 教會車司機(L), 點名2(M), 交誼廳N1(N), 交誼廳O1(O, rowspan 4), 體操項目(P, rowspan 5)
      const r1 = `
        <tr class="week-row ${weekGroupClass} ${holidayClass}" data-week-id="${w.id}">
          ${editableTd(idx, 'events.event1', w.events.event1, 'event-red-cell', 3, 1, true)}
          ${editableTd(idx, 'message.topic', w.message.topic, 'topic-blue-cell', 5, 1, true)}
          ${editableTd(idx, 'worship.singers.0', w.worship.singers[0], 'singer-cell', 1, 2)}
          ${editableTd(idx, 'musicians.1', w.musicians[1], 'musician-cell', 5, 1)}
          ${editableTd(idx, 'camera.1', w.camera[1], 'camera-cell', 5, 1)}
          ${editableTd(idx, 'reception.middle', w.reception.middle, 'rec-name-cell')}
          <td class="fixed-col rec-loc-cell">中間</td>
          ${editableTd(idx, 'meal.staff.0', w.meal.staff[0], 'meal-staff-cell')}
          ${editableTd(idx, 'shuttle.churchCar', w.shuttle.churchCar, 'shuttle-driver-cell')}
          ${editableTd(idx, 'rollCall.1', w.rollCall[1], 'roll-cell')}
          ${editableTd(idx, 'lounge.col1.0', w.lounge.col1[0], 'lounge-cell')}
          ${editableTd(idx, 'lounge.col2Top', w.lounge.col2Top, 'lounge-cell', 4, 1)}
          ${editableTd(idx, 'exercise.type', w.exercise.type, 'exercise-type-cell', 5, 1)}
        </tr>
      `;

      // 第3列 (Row +2)：敬拜同工2(C:D), 招待B1大廳(I+J), 愛宴同工2(K), 自用車-1固定標籤(L), 點名3(M, rowspan 4), 交誼廳N2(N)
      const r2 = `
        <tr class="week-row ${weekGroupClass} ${holidayClass}" data-week-id="${w.id}">
          ${editableTd(idx, 'worship.singers.1', w.worship.singers[1], 'singer-cell', 1, 2)}
          ${editableTd(idx, 'reception.b1Hall', w.reception.b1Hall, 'rec-name-cell')}
          <td class="fixed-col rec-loc-cell">B1大廳</td>
          ${editableTd(idx, 'meal.staff.1', w.meal.staff[1], 'meal-staff-cell')}
          <td class="fixed-col shuttle-label-cell">自用車-1</td>
          ${editableTd(idx, 'rollCall.2', w.rollCall[2], 'roll-cell', 4, 1)}
          ${editableTd(idx, 'lounge.col1.1', w.lounge.col1[1], 'lounge-cell')}
        </tr>
      `;

      // 第4列 (Row +3)：詩歌1類型(C), 詩歌1曲名(D), 招待會堂入口(I+J), 愛宴同工3(K), 自用車-1司機(L), 交誼廳N3(N)
      const r3 = `
        <tr class="week-row ${weekGroupClass} ${holidayClass}" data-week-id="${w.id}">
          ${editableTd(idx, 'worship.songs.0.type', w.worship.songs[0].type, 'song-type-cell')}
          ${editableTd(idx, 'worship.songs.0.title', w.worship.songs[0].title, 'song-title-cell')}
          ${editableTd(idx, 'reception.entrance', w.reception.entrance, 'rec-name-cell')}
          <td class="fixed-col rec-loc-cell">會堂入口</td>
          ${editableTd(idx, 'meal.staff.2', w.meal.staff[2], 'meal-staff-cell')}
          ${editableTd(idx, 'shuttle.car1', w.shuttle.car1, 'shuttle-driver-cell')}
          ${editableTd(idx, 'lounge.col1.2', w.lounge.col1[2], 'lounge-cell')}
        </tr>
      `;

      // 第5列 (Row +4)：社福諮詢站(A, rowspan 2), 詩歌2類型(C), 詩歌2曲名(D), 招待電梯機動(I+J), 愛宴同工4(K), 自用車-2固定標籤(L), 交誼廳N4(N), 量血壓固定標籤(O)
      const isBento = (w.meal.staff[3] || '').includes('便當');
      const r4 = `
        <tr class="week-row ${weekGroupClass} ${holidayClass}" data-week-id="${w.id}">
          ${editableTd(idx, 'events.welfare', w.events.welfare, 'event-welfare-cell', 2, 1, true)}
          ${editableTd(idx, 'worship.songs.1.type', w.worship.songs[1].type, 'song-type-cell')}
          ${editableTd(idx, 'worship.songs.1.title', w.worship.songs[1].title, 'song-title-cell')}
          ${editableTd(idx, 'reception.elevator', w.reception.elevator, 'rec-name-cell')}
          <td class="fixed-col rec-loc-cell">電梯機動</td>
          ${editableTd(idx, 'meal.staff.3', w.meal.staff[3], `meal-staff-cell ${isBento ? 'bento-highlight' : ''}`)}
          <td class="fixed-col shuttle-label-cell">自用車-2</td>
          ${editableTd(idx, 'lounge.col1.3', w.lounge.col1[3], 'lounge-cell')}
          <td class="fixed-col lounge-bp-label-cell">量血壓</td>
        </tr>
      `;

      // 第6列 (Row +5)：詩歌3類型(C), 詩歌3曲名(D), 招待空位(I:J), 愛宴空位(K), 自用車-2司機(L), 交誼廳N5(N), 量血壓人員(O)
      const r5 = `
        <tr class="week-row week-row-end ${weekGroupClass} ${holidayClass}" data-week-id="${w.id}">
          ${editableTd(idx, 'worship.songs.2.type', w.worship.songs[2].type, 'song-type-cell')}
          ${editableTd(idx, 'worship.songs.2.title', w.worship.songs[2].title, 'song-title-cell')}
          <td colspan="2" class="empty-structural-cell"></td>
          <td class="empty-structural-cell"></td>
          ${editableTd(idx, 'shuttle.car2', w.shuttle.car2, 'shuttle-driver-cell')}
          ${editableTd(idx, 'lounge.col1.4', w.lounge.col1[4], 'lounge-cell')}
          ${editableTd(idx, 'lounge.bloodPressure', w.lounge.bloodPressure, 'lounge-bp-cell')}
        </tr>
      `;

      tbody.insertAdjacentHTML('beforeend', holidayBannerHtml + r0 + r1 + r2 + r3 + r4 + r5);
    });
  }

  // 渲染手機版：週次導覽膠囊 + 任務分組卡片
  function renderMobileCards() {
    const pillsContainer = document.getElementById('mobileWeekPills');
    const cardsContainer = document.getElementById('mobileCardsContainer');
    pillsContainer.innerHTML = '';
    cardsContainer.innerHTML = '';

    rosterState.weeks.forEach((w, idx) => {
      // 導覽膠囊
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = `week-pill ${selectedWeekFilter === w.id ? 'active' : ''} ${w.isHoliday ? 'is-holiday' : ''}`;
      pill.textContent = w.displayDate;
      pill.addEventListener('click', () => {
        const targetCard = document.getElementById(`card-${w.id}`);
        if (targetCard) {
          targetCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
      pillsContainer.appendChild(pill);

      if (selectedWeekFilter !== 'all' && selectedWeekFilter !== w.id) return;

      const card = document.createElement('article');
      card.className = `week-card ${w.isHoliday ? 'week-card-holiday' : ''}`;
      card.id = `card-${w.id}`;
      card.dataset.weekId = w.id;

      const mField = (label, path, val, extraClass = '', isMultiline = false) => `
        <div class="m-field ${extraClass}">
          <span class="m-label">${escapeHtml(label)}</span>
          <span class="m-value editable-cell" contenteditable="true" spellcheck="false" data-week="${idx}" data-path="${path}"${isMultiline ? ' data-multiline="true"' : ''}>${isMultiline ? formatMultiline(val) : escapeHtml(val)}</span>
        </div>
      `;

      let speakerBadgeClass = '';
      if (w.message.speakerType === 'church') speakerBadgeClass = 'bg-speaker-church';
      else if (w.message.speakerType === 'external') speakerBadgeClass = 'bg-speaker-external';
      else if (w.message.speakerType === 'outing') speakerBadgeClass = 'bg-speaker-outing';

      card.innerHTML = `
        <div class="card-header">
          <div class="card-date-wrap">
            <span class="card-week-num">第 ${w.weekNumber} 週</span>
            <h2 class="card-date">${escapeHtml(w.displayDate)}</h2>
            ${w.isHoliday ? `<span class="holiday-pill">休會：${escapeHtml(w.holidayName || '放假')}</span>` : ''}
          </div>
          <div class="card-events">
            <div class="m-inline-edit event-red-text" contenteditable="true" spellcheck="false" data-week="${idx}" data-path="events.event1" data-placeholder="+ 活動備註">${formatMultiline(w.events.event1)}</div>
            <div class="m-inline-edit event-welfare-text" contenteditable="true" spellcheck="false" data-week="${idx}" data-path="events.welfare" data-multiline="true" data-placeholder="+ 社福諮詢">${formatMultiline(w.events.welfare)}</div>
          </div>
        </div>

        <div class="card-body">
          <!-- 區塊 1：信息與講員 -->
          <div class="card-group group-message">
            <div class="group-title">📖 信息與講員</div>
            <div class="group-grid-2">
              ${mField('講員', 'message.speaker', w.message.speaker, speakerBadgeClass)}
              ${mField('信息主題 / 活動', 'message.topic', w.message.topic, 'topic-blue-text', true)}
            </div>
          </div>

          <!-- 區塊 2：敬拜與詩歌 -->
          <div class="card-group group-worship">
            <div class="group-title">🎵 敬拜團（組長：${escapeHtml(rosterState.leaders.worship)}）</div>
            <div class="group-grid-3">
              ${mField('主領', 'worship.lead', w.worship.lead, 'highlight-lead')}
              ${mField('配唱 1', 'worship.singers.0', w.worship.singers[0])}
              ${mField('配唱 2', 'worship.singers.1', w.worship.singers[1])}
            </div>
            <div class="songs-mini-list">
              ${[0, 1, 2].map((sIdx) => `
                <div class="song-mini-row">
                  <span class="song-tag editable-cell" contenteditable="true" spellcheck="false" data-week="${idx}" data-path="worship.songs.${sIdx}.type">${escapeHtml(w.worship.songs[sIdx].type)}</span>
                  <span class="song-name editable-cell" contenteditable="true" spellcheck="false" data-week="${idx}" data-path="worship.songs.${sIdx}.title">${escapeHtml(w.worship.songs[sIdx].title)}</span>
                </div>
              `).join('')}
            </div>
          </div>

          <!-- 區塊 3：音控 / 影音 / 體操 / 值班 -->
          <div class="card-group group-tech">
            <div class="group-title">🎛️ 影音、體操與值班</div>
            <div class="group-grid-3">
              ${mField('樂手 1', 'musicians.0', w.musicians[0])}
              ${mField('樂手 2', 'musicians.1', w.musicians[1])}
              ${mField('投影片', 'slides', w.slides)}
              ${mField('音控', 'sound', w.sound)}
              ${mField('攝影 1', 'camera.0', w.camera[0])}
              ${mField('攝影 2', 'camera.1', w.camera[1])}
              ${mField('體操帶領', 'exercise.leader', w.exercise.leader, 'exercise-pink-text')}
              ${mField('體操項目', 'exercise.type', w.exercise.type, 'exercise-pink-text')}
              ${mField('總值班', 'duty', w.duty)}
            </div>
          </div>

          <!-- 區塊 4：招待與點名 -->
          <div class="card-group group-reception">
            <div class="group-title">🤝 招待（組長：${escapeHtml(rosterState.leaders.reception)}）與點名</div>
            <div class="group-grid-3">
              ${mField('一樓', 'reception.floor1', w.reception.floor1)}
              ${mField('中間', 'reception.middle', w.reception.middle)}
              ${mField('B1大廳', 'reception.b1Hall', w.reception.b1Hall)}
              ${mField('會堂入口', 'reception.entrance', w.reception.entrance)}
              ${mField('電梯機動', 'reception.elevator', w.reception.elevator)}
              ${mField('點名 1', 'rollCall.0', w.rollCall[0])}
              ${mField('點名 2', 'rollCall.1', w.rollCall[1])}
              ${mField('點名 3', 'rollCall.2', w.rollCall[2])}
            </div>
          </div>

          <!-- 區塊 5：愛宴與接送 -->
          <div class="card-group group-meal">
            <div class="group-title">🍱 愛宴（組長：${escapeHtml(rosterState.leaders.meal)}）與接送</div>
            <div class="group-grid-3">
              ${mField('愛宴主責', 'meal.coordinator', w.meal.coordinator)}
              ${mField('愛宴 1', 'meal.staff.0', w.meal.staff[0])}
              ${mField('愛宴 2', 'meal.staff.1', w.meal.staff[1])}
              ${mField('愛宴 3', 'meal.staff.2', w.meal.staff[2])}
              ${mField('愛宴 4/備註', 'meal.staff.3', w.meal.staff[3])}
              ${mField('教會 AWF-7019', 'shuttle.churchCar', w.shuttle.churchCar)}
              ${mField('自用車-1', 'shuttle.car1', w.shuttle.car1)}
              ${mField('自用車-2', 'shuttle.car2', w.shuttle.car2)}
            </div>
          </div>

          <!-- 區塊 6：交誼廳與量血壓 -->
          <div class="card-group group-lounge">
            <div class="group-title">☕ 交誼廳接待（組長：${escapeHtml(rosterState.leaders.lounge)}）</div>
            <div class="group-grid-3">
              ${mField('接待 1', 'lounge.col1.0', w.lounge.col1[0])}
              ${mField('接待 2', 'lounge.col1.1', w.lounge.col1[1])}
              ${mField('接待 3', 'lounge.col1.2', w.lounge.col1[2])}
              ${mField('接待 4', 'lounge.col1.3', w.lounge.col1[3])}
              ${mField('接待 5', 'lounge.col1.4', w.lounge.col1[4])}
              ${mField('接待 6', 'lounge.col2Top', w.lounge.col2Top)}
              ${mField('量血壓', 'lounge.bloodPressure', w.lounge.bloodPressure, 'bp-highlight')}
            </div>
          </div>
        </div>
      `;

      cardsContainer.appendChild(card);
    });
  }

  // 搜尋同工高亮過濾
  function applySearchHighlight() {
    const q = searchQuery.trim().toLowerCase();
    document.querySelectorAll('.editable-cell').forEach((el) => {
      const text = el.textContent.trim().toLowerCase();
      if (q && text.includes(q)) {
        el.classList.add('search-hit');
      } else {
        el.classList.remove('search-hit');
      }
    });
  }

  // 觸發自動儲存（本機 localStorage）
  function scheduleAutoSave(weekId = null, fieldPath = null, newValue = null) {
    const badge = document.getElementById('storageStatusBadge');
    badge.textContent = '儲存中...';
    badge.classList.add('saving');

    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      const res = await window.rosterApi.saveRoster(rosterState);
      if (weekId && fieldPath !== null) {
        await window.rosterApi.patchCell(weekId, fieldPath, newValue);
      }
      badge.textContent = '已暫存本機';
      badge.classList.remove('saving');
      updateSaveIndicator(res.updatedAt, true);
    }, 300);
  }

  function updateSaveIndicator(isoStr, showToastMsg) {
    const el = document.getElementById('lastSavedText');
    if (isoStr) {
      const d = new Date(isoStr);
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      const ss = String(d.getSeconds()).padStart(2, '0');
      el.textContent = `本機同步：${hh}:${mm}:${ss}`;
    }
    if (showToastMsg) {
      showToast('已自動暫存於本機瀏覽器');
    }
  }

  function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('show'), 2200);
  }

  // 事件綁定
  function bindEvents() {
    // 1. 表格與卡片內所有可編輯欄位之變更同步
    document.addEventListener('focusout', (e) => {
      const target = e.target;

      // 表頭標題或備註修改
      if (target.dataset && target.dataset.meta) {
        const metaKey = target.dataset.meta;
        const val = target.innerText.trim();
        if (rosterState.meta[metaKey] !== val) {
          rosterState.meta[metaKey] = val;
          scheduleAutoSave();
        }
        return;
      }

      // 組長列修改
      if (target.classList.contains('leader-cell') && target.dataset.leader) {
        const leaderKey = target.dataset.leader;
        const val = target.innerText.trim();
        if (rosterState.leaders[leaderKey] !== val) {
          rosterState.leaders[leaderKey] = val;
          renderMobileCards(); // 同步更新手機卡片上的組長名稱
          scheduleAutoSave();
        }
        return;
      }

      // 服事同工 / 詩歌 / 活動欄位修改
      if (target.classList.contains('editable-cell') && target.dataset.week !== undefined) {
        const weekIdx = Number(target.dataset.week);
        const path = target.dataset.path;
        const rawText = target.innerText.replace(/\r\n/g, '\n').trim();
        const oldVal = getByPath(rosterState.weeks[weekIdx], path);

        if (oldVal !== rawText) {
          setByPath(rosterState.weeks[weekIdx], path, rawText);
          // 同步更新另一個視圖（桌機<->手機）對應欄位
          document.querySelectorAll(`.editable-cell[data-week="${weekIdx}"][data-path="${path}"]`).forEach((peer) => {
            if (peer !== target) {
              if (peer.dataset.multiline === 'true') {
                peer.innerHTML = formatMultiline(rawText);
              } else {
                peer.textContent = rawText;
              }
            }
          });
          applySearchHighlight();
          scheduleAutoSave(rosterState.weeks[weekIdx].id, path, rawText);
        }
      }
    });

    // 單行欄位按 Enter 時完成編輯（避免產生多餘換行）
    document.addEventListener('keydown', (e) => {
      const target = e.target;
      if (
        (target.classList.contains('editable-cell') || target.classList.contains('leader-cell')) &&
        target.dataset.multiline !== 'true' &&
        e.key === 'Enter'
      ) {
        e.preventDefault();
        target.blur();
      }
    });

    // 2. 搜尋同工姓名
    const searchInput = document.getElementById('searchInput');
    const clearSearchBtn = document.getElementById('clearSearchBtn');
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      clearSearchBtn.classList.toggle('hidden', !searchQuery);
      applySearchHighlight();
    });

    clearSearchBtn.addEventListener('click', () => {
      searchQuery = '';
      searchInput.value = '';
      clearSearchBtn.classList.add('hidden');
      applySearchHighlight();
    });

    // 3. 週次篩選
    document.getElementById('weekJumpSelect').addEventListener('change', (e) => {
      selectedWeekFilter = e.target.value;
      renderAllViews();
    });

    // 4. 檢視模式切換（自動 / 桌機全表 / 手機卡片）
    document.querySelectorAll('.toggle-btn[data-view]').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.toggle-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        currentViewMode = btn.dataset.view;
        document.body.classList.remove('force-table', 'force-card');
        if (currentViewMode === 'table') document.body.classList.add('force-table');
        if (currentViewMode === 'card') document.body.classList.add('force-card');
      });
    });

    // 5. 匯出 JSON 備份
    document.getElementById('btnExportJson').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(rosterState, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${rosterState.meta.year}-${rosterState.meta.quarter}-加樂服事表備份.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('已匯出 JSON 備份檔');
    });

    // 6. 匯入 JSON 備份
    document.getElementById('importJsonInput').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const imported = JSON.parse(evt.target.result);
          if (!imported.weeks || !Array.isArray(imported.weeks)) {
            throw new Error('檔案格式不符');
          }
          rosterState = imported;
          await window.rosterApi.saveRoster(rosterState);
          renderMeta();
          renderLeaders();
          populateWeekDropdown();
          renderAllViews();
          showToast('已成功匯入並套用服事表');
        } catch (err) {
          alert('匯入失敗：請確認選擇的是正確的服事表 JSON 備份檔。');
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    });

    // 7. 還原為原始確認版
    document.getElementById('btnResetDefault').addEventListener('click', async () => {
      if (!confirm('確定要清除本機修改，還原為「2026-10-12 確認版」原始名單嗎？')) return;
      rosterState = await window.rosterApi.resetToDefault();
      renderMeta();
      renderLeaders();
      populateWeekDropdown();
      renderAllViews();
      showToast('已還原為原始確認版資料');
    });

    // 8. 季度週數與教會行事曆（放假）設定彈窗
    const modal = document.getElementById('calendarModal');
    document.getElementById('btnCalendarPreview').addEventListener('click', () => {
      renderHolidayManager();
      modal.classList.remove('hidden');
    });
    document.getElementById('closeCalendarModal').addEventListener('click', () => {
      modal.classList.add('hidden');
    });
    document.getElementById('saveCalendarSettings').addEventListener('click', () => {
      populateWeekDropdown();
      renderAllViews();
      scheduleAutoSave();
      modal.classList.add('hidden');
      showToast('已更新聚會與放假狀態');
    });

    // 試算未來季度週次
    document.getElementById('btnPreviewQuarterDates').addEventListener('click', async () => {
      const y = Number(document.getElementById('genYear').value) || 2026;
      const q = document.getElementById('genQuarter').value;
      const wd = Number(document.getElementById('genWeekday').value);
      const weeksPreview = await window.rosterApi.generateQuarterWeeksWithCalendar(y, q, wd);
      const box = document.getElementById('quarterPreviewResult');
      box.classList.remove('hidden');
      box.innerHTML = `
        <strong>試算結果：${y} 年 ${q} 共 ${weeksPreview.length} 週</strong>
        <div class="preview-chips">
          ${weeksPreview.map((item) => `
            <span class="preview-chip ${item.isHoliday ? 'holiday' : ''}">
              ${item.displayDate}${item.isHoliday ? ` (${item.holidayName})` : ''}
            </span>
          `).join('')}
        </div>
      `;
    });
  }

  function renderHolidayManager() {
    const container = document.getElementById('holidayManagerList');
    container.innerHTML = '';
    rosterState.weeks.forEach((w, idx) => {
      const row = document.createElement('div');
      row.className = 'holiday-item-row';
      row.innerHTML = `
        <div class="h-date">第${w.weekNumber}週 · <strong>${escapeHtml(w.displayDate)}</strong> (${w.date})</div>
        <label class="h-toggle">
          <input type="checkbox" ${w.isHoliday ? 'checked' : ''} data-h-idx="${idx}" />
          <span>設為放假／休會</span>
        </label>
        <input type="text" class="h-reason" placeholder="放假或特殊行事曆說明（如：國慶連假）" value="${escapeHtml(w.holidayName)}" data-r-idx="${idx}" />
      `;
      container.appendChild(row);
    });

    container.querySelectorAll('input[type="checkbox"]').forEach((chk) => {
      chk.addEventListener('change', (e) => {
        const idx = Number(e.target.dataset.hIdx);
        rosterState.weeks[idx].isHoliday = e.target.checked;
      });
    });

    container.querySelectorAll('.h-reason').forEach((inp) => {
      inp.addEventListener('input', (e) => {
        const idx = Number(e.target.dataset.rIdx);
        rosterState.weeks[idx].holidayName = e.target.value;
      });
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
