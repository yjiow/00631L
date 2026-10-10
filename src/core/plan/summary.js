/**
 * plan/summary.js
 * 模擬結果彙總（純計算）：年度明細
 */

import { addYears } from './calendar.js';

// r：simulatePlan 結果（需 detail：daily / trades）；years：模擬年數
// 第 k 年 = 起點 + (k−1) 年 ～ 起點 + k 年前一天（期末那天併入最後一年）；資金斷鏈後的年度不列
// → [{ year, fromDate, endDate, inflow, outflow, buy, sell, cost, endValue }]（outflow 為正數）
export function yearlySummary(r, years) {
    const ends = Array.from({ length: years - 1 }, (_, k) => addYears(r.startDate, k + 1)); // 第 1～years−1 年的結束（不含）
    const yearIdx = date => {
        let k = 0;
        while (k < ends.length && date >= ends[k]) k++;
        return k;
    };
    const rows = Array.from({ length: years }, (_, k) => ({
        year: k + 1, fromDate: null, endDate: null,
        inflow: 0, outflow: 0, buy: 0, sell: 0, cost: 0, endValue: 0
    }));

    for (const t of r.trades) {
        if (t.type === 'interest') continue; // 現金利息只列於年度明細 Modal，不併入年度買賣 / 收支彙總
        const row = rows[yearIdx(t.date)], amount = t.amount;
        if (t.type === 'flow') t.amount > 0 ? row.inflow += amount : row.outflow -= amount;
        else row[t.type] += amount; // buy / sell
        row.cost += t.cost;
    }
    for (const d of r.daily) {
        const row = rows[yearIdx(d.date)];
        row.fromDate ??= d.date;
        row.endDate = d.date;
        row.endValue = d.value;
    }
    return rows.filter(row => row.endDate);
}
