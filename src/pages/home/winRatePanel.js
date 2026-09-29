/**
 * winRatePanel.js
 * 首頁「持有期間勝率」卡片：跟著日期區間變動，不滿 N 年顯示「—」；點格子開報酬分布 Modal
 * 由 home.js 在區間資料更新後呼叫 renderWinRate()
 */

import { calcHoldingWinRate } from '../../core/calculator.js';
import { renderDistChart } from '../../charts/chartRender.js';

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

// 依目前日期區間的三條策略序列重畫（由 home.js 與績效卡、主圖同步呼叫）
export function renderWinRate(s00631, s5050, s0050) {
    const table = document.getElementById('winrateTable');
    if (!table) return;
    bindDistModal(table);

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

    results.clear();
    const head = '<tr><th></th>' + HOLD_YEARS.map(y => `<th>持有 ${y} 年</th>`).join('') + '</tr>';
    const body = strategies.map(s => '<tr>' +
        `<th><span class="winrate-dot" style="background:${s.color}"></span>${s.name}</th>` +
        HOLD_YEARS.map(y => {
            const r = calcHoldingWinRate(s.series, y);
            if (!r) return '<td class="winrate-na" title="區間不足 ' + y + ' 年">—</td>';
            const key = `${s.name}|${y}`;
            results.set(key, { ...r, name: s.name, years: y });
            return `<td class="winrate-cell" data-key="${key}" title="點擊查看報酬分布" style="${heat(r.winRate)}">` +
                `<div class="winrate-value">${r.winRate.toFixed(1)}%</div>` +
                `<div class="winrate-range">` +
                `虧損中位 ${r.lossMedian == null ? '—' : `<span class="${signCls(r.lossMedian)}">${pct(r.lossMedian)}</span>`}` +
                `<span class="winrate-sep">|</span>中位 <span class="${signCls(r.median)}">${pct(r.median)}</span></div></td>`;
        }).join('') + '</tr>').join('');
    table.innerHTML = `<thead>${head}</thead><tbody>${body}</tbody>`;
}

// ===== 報酬分布 Modal =====
const results = new Map(); // 'name|years' → calcHoldingWinRate 結果

// 100 萬持有 years 年、年化 v% 的期末金額（萬）
const wan = (v, years) => {
    const x = 100 * Math.pow(1 + v / 100, years);
    return (x < 10 ? x.toFixed(1) : Math.round(x).toLocaleString('en-US')) + ' 萬';
};

// v 為 null（如無虧損）整格不顯示；years 有值時下方附 100 萬期末金額
const stat = (label, v, years) => v == null ? '' : `<div class="dist-stat"><span class="dist-stat-label">${label}</span>` +
    `<span class="dist-stat-value ${signCls(v)}">${pct(v)}</span>` +
    (years ? `<span class="dist-stat-amount">100 萬 → ${wan(v, years)}</span>` : '') + '</div>';

function openDist(r) {
    document.getElementById('distTitle').textContent = `${r.name} 持有 ${r.years} 年：年化報酬分布`;
    // 左差右好
    const y = r.years;
    document.getElementById('distStats').innerHTML =
        stat('最差', r.worst, y) + stat('虧損中位', r.lossMedian, y) + stat('中位', r.median, y) + stat('最好', r.best, y) +
        `<div class="dist-stat"><span class="dist-stat-label">勝率</span><span class="dist-stat-value">${r.winRate.toFixed(1)}%</span></div>` +
        `<div class="dist-stat"><span class="dist-stat-label">樣本數</span><span class="dist-stat-value">${r.samples.toLocaleString('en-US')}<span class="dist-stat-unit">個進場日</span></span></div>`;
    document.getElementById('modal-dist').style.display = 'flex';
    renderDistChart(r.cagrs);
}

// 事件委派：table 隨視圖重建，以 dataset 標記避免重複綁定
function bindDistModal(table) {
    if (table.dataset.bound) return;
    table.dataset.bound = '1';
    table.addEventListener('click', e => {
        const td = e.target.closest('.winrate-cell');
        const r = td && results.get(td.dataset.key);
        if (r) openDist(r);
    });
    const modal = document.getElementById('modal-dist');
    const close = () => { modal.style.display = 'none'; };
    document.getElementById('modal-dist-close').addEventListener('click', close);
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
}
