/**
 * marketDates.js
 * 全站共用的市場事件日期
 */

// AI 行情前：資料截止日（台股 2022/10 落底、ChatGPT 2022/11 推出，2023 年起 AI 行情）
// 首頁「結束：AI 行情前」按鈕（views/home.html data-end-date）同此日期
export const AI_CUTOFF = '2022-12-31';

// 上市日（來源：關於我頁）。上市日之前的價格為推算值：
// 00631L 以 0050 每日漲跌幅 ×2 推算、0050 以加權指數推算；供畫面標示「含推算期間」（資料檔 simulated 欄位前端讀不到，故用常數）
export const LISTING_631L = '2014-10-31';
export const LISTING_0050 = '2003-06-30';

// 區間起日早於標的上市日 → 結果含推算價格（日期格式 'YYYY-MM-DD'，可直接字串比較）
export const hasSimulatedPeriod = (startDate, listingDate) => startDate < listingDate;
