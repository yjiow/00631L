/**
 * yearlyTable.js
 * 單一起點的年度明細表：預設只顯示最後 5 年，「展開全部」切換（切換起點時保留展開狀態）；點年度列開 Modal 看當年收支與交易明細
 */

import { fmtMoney, ym } from './planFormat.js';
import { showYearlyDetail } from './yearlyDetailModal.js';

const COLLAPSED_ROWS = 5;
let expanded = false;
let rows = [];
let trades = [];
let dailyMap = new Map();

const $ = id => document.getElementById(id);

function draw() {
    const shown = expanded ? rows : rows.slice(-COLLAPSED_ROWS);
    const cell = (v, cls = '', sign = '') => v ? `<td class="${cls}">${sign}${fmtMoney(v)}</td>` : '<td class="yearly-empty">—</td>';
    $('yearly-body').innerHTML = shown.map(y => // 內容皆為計算數字與日期，無使用者文字
        `<tr class="yearly-row" data-year="${y.year}"><th>第 ${y.year} 年<span class="yearly-range">${ym(y.fromDate)} 起</span></th>` +
        cell(y.inflow, 'positive') + cell(y.outflow, 'negative', '−') +
        cell(y.buy) + cell(y.sell) + cell(y.cost) +
        `<td class="yearly-end">${fmtMoney(y.endValue)}</td></tr>`
    ).join('');
    const btn = $('yearly-toggle');
    btn.hidden = rows.length <= COLLAPSED_ROWS;
    btn.textContent = expanded ? '收合 ▴' : `展開全部 ${rows.length} 年 ▾`;
}

// ys：yearlySummary 結果；tradesArg / dailyArg：simulatePlan 結果的 trades / daily（供點列開 Modal 用）
export function renderYearly(ys, tradesArg, dailyArg) {
    rows = ys;
    trades = tradesArg;
    dailyMap = new Map(dailyArg.map(d => [d.date, d]));
    const btn = $('yearly-toggle');
    const body = $('yearly-body');
    if (!btn.dataset.bound) {
        btn.dataset.bound = '1';
        btn.addEventListener('click', () => { expanded = !expanded; draw(); });
        body.addEventListener('click', e => {
            const tr = e.target.closest('.yearly-row');
            if (!tr) return;
            const year = rows.find(r => r.year === +tr.dataset.year);
            if (year) showYearlyDetail(year, trades, dailyMap, rows);
        });
    }
    draw();
}
