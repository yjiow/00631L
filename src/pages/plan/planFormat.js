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

// 'YYYY-MM-DD' → 'YYYY/MM'
export const ym = date => date.slice(0, 7).replace('-', '/');
