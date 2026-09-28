/**
 * winRatePanel.js
 * 首頁「持有期間勝率」卡片：跟著日期區間變動，不滿 N 年顯示「—」
 * 由 uiController.js 在區間資料更新後呼叫 renderWinRate()
 */

import { calcHoldingWinRate } from './calculator.js';

const HOLD_YEARS = [1, 3, 5, 10, 15, 20];
const pct = v => (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
const signCls = v => v >= 0 ? 'positive' : 'negative';

// 熱度：勝率 60% 以下為灰 #8B949E，100% 為電光藍 #00D2FF，格底淡藍隨之加深
function heat(winRate) {
    const t = Math.min(Math.max((winRate - 60) / 40, 0), 1);
    const mix = (a, b) => Math.round(a + (b - a) * t);
    return `color:rgb(${mix(139, 0)},${mix(148, 210)},${mix(158, 255)});` +
        `background:rgba(0,210,255,${(0.12 * t).toFixed(3)})`;
}

// 依目前日期區間的三條策略序列重畫（由 uiController 與績效卡、主圖同步呼叫）
export function renderWinRate(s00631, s5050, s0050) {
    const table = document.getElementById('winrateTable');
    if (!table) return;

    const strategies = [
        { name: '00631L',      color: '#00D2FF', series: s00631 },
        { name: '50/50策略',   color: '#A78BFA', series: s5050 },
        { name: '0050',        color: '#94A3B8', series: s0050 }
    ];

    // 資料實際起訖日期
    const all = [s00631, s5050, s0050].filter(s => s.length);
    const start = all.map(s => s[0].date).sort()[0];
    const end   = all.map(s => s[s.length - 1].date).sort().pop();
    const periodEl = document.getElementById('winratePeriod');
    if (periodEl) periodEl.textContent = start + ' ~ ' + end;

    const head = '<tr><th></th>' + HOLD_YEARS.map(y => `<th>持有 ${y} 年</th>`).join('') + '</tr>';
    const body = strategies.map(s => '<tr>' +
        `<th><span class="winrate-dot" style="background:${s.color}"></span>${s.name}</th>` +
        HOLD_YEARS.map(y => {
            const r = calcHoldingWinRate(s.series, y);
            if (!r) return '<td class="winrate-na" title="區間不足 ' + y + ' 年">—</td>';
            return `<td style="${heat(r.winRate)}"><div class="winrate-value">${r.winRate.toFixed(1)}%</div>` +
                `<div class="winrate-range">最差 <span class="${signCls(r.worst)}">${pct(r.worst)}</span>` +
                ` · 最好 <span class="${signCls(r.best)}">${pct(r.best)}</span></div></td>`;
        }).join('') + '</tr>').join('');
    table.innerHTML = `<thead>${head}</thead><tbody>${body}</tbody>`;
}
