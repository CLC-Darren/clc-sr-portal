/**
 * RosterApiService - 資料存取與後台串接預留層
 *
 * 設計目的：
 * 1. 目前階段（靜態版）：所有讀取、修改、還原皆透過 localStorage 暫存在使用者本機，無需後端資料庫。
 * 2. 未來階段（動態版）：只需將 USE_REMOTE_API 切換為 true，並實作下方 fetch() 端點，
 *    前端 UI 與編輯互動邏輯完全不需改寫。
 */
class RosterApiService {
  constructor() {
    this.USE_REMOTE_API = false; // 未來串接後台時改為 true
    this.API_BASE_URL = '/api/v1/rosters';
    this.STORAGE_KEY = 'jiale_fellowship_roster_2026_q4_v1';
  }

  /**
   * 取得服事表完整資料
   * @param {number} year
   * @param {string} quarter
   * @returns {Promise<Object>}
   */
  async getRoster(year = 2026, quarter = 'Q4') {
    if (this.USE_REMOTE_API) {
      // [未來後台串接預留]
      // const response = await fetch(`${this.API_BASE_URL}?year=${year}&quarter=${quarter}`);
      // if (!response.ok) throw new Error('無法從伺服器載入服事表');
      // return await response.json();
    }

    // 目前使用 localStorage 本機暫存
    try {
      const cached = localStorage.getItem(this.STORAGE_KEY);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (err) {
      console.warn('讀取本機暫存失敗，將載入預設確認版資料：', err);
    }

    // 深拷貝預設確認版資料
    return JSON.parse(JSON.stringify(window.DEFAULT_ROSTER_DATA));
  }

  /**
   * 儲存整份或更新後的服事表資料
   * @param {Object} rosterData
   * @returns {Promise<{success: boolean, updatedAt: string}>}
   */
  async saveRoster(rosterData) {
    const now = new Date().toISOString();
    rosterData.meta.lastUpdated = now;

    if (this.USE_REMOTE_API) {
      // [未來後台串接預留]
      // const response = await fetch(`${this.API_BASE_URL}/${rosterData.meta.year}/${rosterData.meta.quarter}`, {
      //   method: 'PUT',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(rosterData)
      // });
      // return await response.json();
    }

    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(rosterData));
    return { success: true, updatedAt: now };
  }

  /**
   * 單一欄位局部更新（預留給未來即時多人協作或細粒度 Audit Log）
   * @param {string} weekId
   * @param {string} fieldPath e.g. "worship.lead" or "reception.floor1"
   * @param {any} newValue
   */
  async patchCell(weekId, fieldPath, newValue) {
    if (this.USE_REMOTE_API) {
      // [未來後台串接預留]
      // return await fetch(`${this.API_BASE_URL}/weeks/${weekId}`, {
      //   method: 'PATCH',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ path: fieldPath, value: newValue })
      // }).then(r => r.json());
    }
    return { success: true, mode: 'localStorage' };
  }

  /**
   * 未來動態計算季度週數，並與教會行事曆 (Church Calendar) 比對放假週次
   * @param {number} year
   * @param {string} quarter 'Q1' | 'Q2' | 'Q3' | 'Q4'
   * @param {number} targetWeekday 0(日) ~ 6(六)，加樂團契預設為 4(週四)
   * @returns {Promise<Array<{date: string, displayDate: string, isHoliday: boolean, holidayName: string}>>}
   */
  async generateQuarterWeeksWithCalendar(year, quarter, targetWeekday = 4) {
    let churchHolidays = {};

    if (this.USE_REMOTE_API) {
      // [未來後台串接預留：向後台取得教會行事曆與國定假日]
      // const res = await fetch(`/api/v1/church-calendar?year=${year}&quarter=${quarter}`);
      // churchHolidays = await res.json(); // 格式如 { "2026-10-08": "國慶連假/教會活動" }
    } else {
      // 靜態示範用：內建部分常見節日提示供試算預覽
      churchHolidays = {
        [`${year}-01-01`]: '元旦假期',
        [`${year}-10-10`]: '國慶日',
        [`${year}-12-25`]: '聖誕節'
      };
    }

    const quarterMonths = {
      Q1: [0, 1, 2],
      Q2: [3, 4, 5],
      Q3: [6, 7, 8],
      Q4: [9, 10, 11]
    }[quarter] || [9, 10, 11];

    const startMonth = quarterMonths[0];
    const endMonth = quarterMonths[2];
    const cursor = new Date(year, startMonth, 1);
    const endDate = new Date(year, endMonth + 1, 0);

    const result = [];
    while (cursor <= endDate) {
      if (cursor.getDay() === targetWeekday) {
        const yyyy = cursor.getFullYear();
        const mm = String(cursor.getMonth() + 1).padStart(2, '0');
        const dd = String(cursor.getDate()).padStart(2, '0');
        const iso = `${yyyy}-${mm}-${dd}`;
        result.push({
          date: iso,
          displayDate: `${cursor.getMonth() + 1}月${cursor.getDate()}日`,
          isHoliday: Boolean(churchHolidays[iso]),
          holidayName: churchHolidays[iso] || ''
        });
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return result;
  }

  /**
   * 清除本機暫存並還原預設值
   */
  async resetToDefault() {
    localStorage.removeItem(this.STORAGE_KEY);
    return JSON.parse(JSON.stringify(window.DEFAULT_ROSTER_DATA));
  }
}

window.rosterApi = new RosterApiService();
