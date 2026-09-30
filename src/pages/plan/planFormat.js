/**
 * planFormat.js
 * 投資計畫頁數字格式
 */

// 金額：滿 1 萬以「萬」顯示
export const fmtMoney = v => Math.abs(v) >= 1e4
    ? Math.round(v / 1e4).toLocaleString('en-US') + ' 萬'
    : Math.round(v).toLocaleString('en-US') + ' 元';

// 小數比例 → 百分比（null 顯示 —）
export const fmtRate = v => v == null ? '—' : (v * 100).toFixed(1) + '%';

// 數值正負 → 台股漲跌色 class（紅漲綠跌；0 / null 不上色）
export const signClass = v => v > 0 ? 'positive' : v < 0 ? 'negative' : '';

// 'YYYY-MM-DD' → 'YYYY/MM'
export const ym = date => date.slice(0, 7).replace('-', '/');
