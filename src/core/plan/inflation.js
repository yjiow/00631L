/**
 * plan/inflation.js
 * 通膨調整（純計算）：現金流逐年調整、購買力提示文字
 */

// 該列是否隨通膨調整（單次不調整）
export const isIndexed = f => f.inflation === true && f.period !== 'once';

// 現金流第 year 年的名目金額：輸入金額 = 第 fromYear 年金額，之後每年 × (1+rate)；捨去取整元（同金額輸入慣例）
export function flowAmount(f, year, rate) {
    if (!rate || !isIndexed(f) || year <= f.fromYear) return f.amount;
    return Math.trunc(+(f.amount * Math.pow(1 + rate, year - f.fromYear)).toFixed(6));
}

// 表單通膨率（%）是否合法：0～20（可含小數）
export const validInflationPct = pct => pct >= 0 && pct <= 20;

// 結果區購買力提示：N 年後的實質購買力約剩 100/(1+rate)^N %；通膨率 0（或無效）回傳空字串
export function purchasingPowerNote(rate, years) {
    if (!(rate > 0)) return '';
    const pct = Number((rate * 100).toFixed(1));
    const w = Math.round(100 / Math.pow(1 + rate, years));
    return `通膨 ${pct}%：${years} 年後的實質購買力約剩 ${w}%`;
}
