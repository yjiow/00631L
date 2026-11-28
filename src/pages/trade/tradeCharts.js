/**
 * tradeCharts.js
 * 自主實戰圖表：兩檔價格圖（近 22 日 + 20MA，只用相對標示、不含日期）與兩組總資產走勢圖
 */

import Chart from 'chart.js/auto';
import { neonScales, glassTooltip, neonLine, downsampleIdx } from '../../charts/chartTheme.js';
import { chartWindow, maGaps } from '../../core/trade/series.js';

const WINDOW = 22;
const COLOR = { p631: '#00D2FF', p50: '#FFD166', ma: '#8B949E', wk: '#C792EA', a: '#00D2FF', b: '#FFB74D' };

let charts = {}; // 'p631' | 'p50' | 'trend' → Chart

// 離開頁面或重新進入時釋放
export function destroyTradeCharts() {
    Object.values(charts).forEach(c => c.destroy());
    charts = {};
}

// 滑鼠所在位置畫垂直線（十字游標的縱線）
const crosshair = {
    id: 'tradeCrosshair',
    afterDatasetsDraw(chart) {
        const act = chart.tooltip?.getActiveElements?.();
        if (!act?.length) return;
        const { ctx, chartArea } = chart, x = act[0].element.x;
        ctx.save();
        ctx.strokeStyle = 'rgba(0, 210, 255, 0.5)';
        ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(x, chartArea.top); ctx.lineTo(x, chartArea.bottom); ctx.stroke();
        ctx.restore();
    }
};

const baseOptions = (tooltip, yCb) => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
        legend: { labels: { color: '#9DA7B3', font: { family: 'Share Tech Mono' }, usePointStyle: true, pointStyle: 'circle', boxWidth: 8, boxHeight: 8 } },
        tooltip: { ...glassTooltip, ...tooltip }
    },
    scales: neonScales(yCb),
    animation: false
});

// 近 22 日資料：多取 1 日作為第一點的漲跌基準
function priceData(series, idx, key) {
    const w = chartWindow(series, idx, WINDOW + 1);
    const price = w[key], ma = w['ma' + key.slice(1)], wk = w['wk' + key.slice(1)];
    const first = price.length > WINDOW ? 1 : 0;
    const n = price.length - first;
    const p = price.slice(first), m = ma.slice(first), k5 = wk.slice(first);
    const chg = p.map((v, i) => { const prev = i + first > 0 ? price[i + first - 1] : null; return prev ? (v / prev - 1) * 100 : null; });
    const labels = p.map((_, i) => i === n - 1 ? '今天' : `−${n - 1 - i}`);
    return { labels, p, m, k5, chg };
}

// 兩張價格圖同步：游標停在其中一張的第 i 個交易日，另一張同位置也顯示提示與縱線（idx null = 移出）
function syncHover(src, idx) {
    for (const c of [charts.p631, charts.p50]) {
        if (!c || c === src) continue;
        if (idx == null) {
            c.setActiveElements([]);
            c.tooltip.setActiveElements([], { x: 0, y: 0 });
        } else {
            const pts = c.data.datasets.map((_, i) => ({ datasetIndex: i, index: idx }));
            const el = c.getDatasetMeta(0).data[idx];
            if (!el) continue;
            c.setActiveElements(pts);
            c.tooltip.setActiveElements(pts, { x: el.x, y: el.y });
        }
        c.update('none');
    }
}

function ensurePrice(id, name, key, color) {
    if (charts[key]) return charts[key];
    const canvas = document.getElementById(id);
    const state = { chg: [] };
    const chart = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: { labels: [], datasets: [neonLine(name, [], color), { ...neonLine('5MA', [], COLOR.wk), borderDash: [3, 3], borderWidth: 1.5 }, { ...neonLine('20MA', [], COLOR.ma), borderDash: [8, 4], borderWidth: 1.5 }] },
        options: {
            ...baseOptions({
            callbacks: {
                title: items => items[0].label === '今天' ? '今天' : `${items[0].label} 個交易日`,
                label: c => c.datasetIndex === 0
                    ? ` ${c.dataset.label}：${c.parsed.y.toFixed(2)}（${state.chg[c.dataIndex] == null ? '—' : (state.chg[c.dataIndex] >= 0 ? '+' : '') + state.chg[c.dataIndex].toFixed(2) + '%'}）`
                    : ` ${c.dataset.label}：${c.parsed.y.toFixed(2)}`
            }
        }, v => v.toFixed(2)),
            onHover: (_e, els, c) => syncHover(c, els.length ? els[0].index : null)
        },
        plugins: [crosshair]
    });
    chart.tradeState = state;
    charts[key] = chart;
    return chart;
}

// 圖下一行：現價相對週 / 月 / 半年 / 年均線的偏離 %（* = 資料不足該均線天數，以現有筆數估算）
function renderGaps(series, idx, key) {
    const el = document.getElementById('trade-gap-' + key.slice(1));
    if (!el) return;
    el.innerHTML = maGaps(series, idx, key).map(g => {
        const t = (Math.abs(g.pct) < 0.05 ? 0 : g.pct).toFixed(1);
        const cls = g.pct > 0.05 ? 'positive' : g.pct < -0.05 ? 'negative' : '';
        return `<span>${g.label}${g.short ? '*' : ''} <b class="${cls}">${g.pct > 0.05 ? '+' : ''}${t}%</b></span>`;
    }).join('');
}

export function renderPriceCharts(series, idx) {
    for (const [id, name, key, color] of [['trade-chart-631', '00631L', 'p631', COLOR.p631], ['trade-chart-50', '0050', 'p50', COLOR.p50]]) {
        const chart = ensurePrice(id, name, key, color);
        const d = priceData(series, idx, key);
        chart.data.labels = d.labels;
        chart.data.datasets[0].data = d.p;
        chart.data.datasets[1].data = d.k5;
        chart.data.datasets[2].data = d.m;
        renderGaps(series, idx, key);
        chart.tradeState.chg = d.chg;
        chart.update('none');
    }
}

const wan = v => Math.abs(v) >= 1e4 ? (v / 1e4).toLocaleString('en-US', { maximumFractionDigits: 0 }) + '萬' : Math.round(v).toLocaleString('en-US');

// history：game.history（[{idx,a,b}]）；x 軸為「第 N 天」序號
export function renderTrendChart(history) {
    if (!charts.trend) {
        const canvas = document.getElementById('trade-chart-trend');
        const state = { days: [] };
        charts.trend = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: { labels: [], datasets: [neonLine('操作者', [], COLOR.a), neonLine('對照組', [], COLOR.b)] },
            options: baseOptions({
                callbacks: {
                    title: items => `第 ${state.days[items[0].dataIndex]} 天`,
                    label: c => ` ${c.dataset.label}：${Math.round(c.parsed.y).toLocaleString('en-US')} 元`
                }
            }, wan),
            plugins: [crosshair]
        });
        charts.trend.tradeState = state;
    }
    const chart = charts.trend;
    chart.options.scales.x.ticks.maxRotation = 0; // 標籤不斜放，放不下時自動跳過
    const a = history.map(h => h.a), b = history.map(h => h.b);
    const days = history.map((_, i) => i + 1);
    const keep = downsampleIdx(days.length, [a, b]) ?? days.map((_, i) => i);
    chart.tradeState.days = keep.map(i => days[i]);
    chart.data.labels = keep.map(i => String(days[i])); // x 軸只標天數，提示框才寫「第 N 天」，避免標籤擠在一起
    chart.data.datasets[0].data = keep.map(i => a[i]);
    chart.data.datasets[1].data = keep.map(i => b[i]);
    chart.update('none');
}
