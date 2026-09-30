/**
 * yearlyTable.js
 * 單一起點的年度明細表：預設只顯示最後 5 年，「展開全部」切換（切換起點時保留展開狀態）
 */

import { fmtMoney, ym } from './planFormat.js';

const COLLAPSED_ROWS = 5;
let expanded = false;
let rows = [];

const $ = id => document.getElementById(id);

function draw() {
    const shown = expanded ? rows : rows.slice(-COLLAPSED_ROWS);
    const cell = (v, cls = '', sign = '') => v ? `<td class="${cls}">${sign}${fmtMoney(v)}</td>` : '<td class="yearly-empty">—</td>';
    $('yearly-body').innerHTML = shown.map(y => // 內容皆為計算數字與日期，無使用者文字
        `<tr><th>第 ${y.year} 年<span class="yearly-range">${ym(y.fromDate)} 起</span></th>` +
        cell(y.inflow, 'positive') + cell(y.outflow, 'negative', '−') +
        cell(y.buy) + cell(y.sell) + cell(y.cost) +
        `<td class="yearly-end">${fmtMoney(y.endValue)}</td></tr>`
    ).join('');
    const btn = $('yearly-toggle');
    btn.hidden = rows.length <= COLLAPSED_ROWS;
    btn.textContent = expanded ? '收合 ▴' : `展開全部 ${rows.length} 年 ▾`;
}

// ys：yearlySummary 結果
export function renderYearly(ys) {
    rows = ys;
    const btn = $('yearly-toggle');
    if (!btn.dataset.bound) {
        btn.dataset.bound = '1';
        btn.addEventListener('click', () => { expanded = !expanded; draw(); });
    }
    draw();
}
