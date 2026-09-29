/**
 * chartRender.js
 * Chart.js 霓虹圖表初始化與更新
 */

import Chart from 'chart.js/auto'; // npm 套件（版本見 package.json），auto 自動註冊全部圖表元件
import { neonScales, glassTooltip, neonLine, downsampleIdx } from './chartTheme.js';

// ===== 策略回測圖表（首頁）=====

let backtestChart = null;
let detail5050Chart = null;

// 三條策略資產路徑
export function renderBacktestChart(labels, vals00631, vals5050, vals0050) {
    const canvas = document.getElementById('mainChart');
    if (!canvas) return;
    if (backtestChart) backtestChart.destroy();

    const idx = downsampleIdx(labels.length, [vals00631, vals5050, vals0050]);
    if (idx) [labels, vals00631, vals5050, vals0050] =
        [labels, vals00631, vals5050, vals0050].map(arr => idx.map(i => arr[i]));

    backtestChart = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels,
            datasets: [
                neonLine('00631L',      vals00631, '#00D2FF'),
                neonLine('50/50策略',   vals5050,  '#A78BFA'),
                neonLine('0050',        vals0050,  '#94A3B8')
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend:  { labels: { color: '#9DA7B3', font: { family: 'Share Tech Mono' }, usePointStyle: true, pointStyle: 'circle', boxWidth: 8, boxHeight: 8 } },
                tooltip: glassTooltip
            },
            scales: neonScales(value => value.toLocaleString()),
            animation: { duration: 400, easing: 'easeOutQuart' }
        }
    });
}

// 依交易日數切換粒度：≤120 每日、≤520 每週、其餘每月（皆取期間最後一個交易日）
function periodLast(series) {
    if (series.length <= 120) return series;
    const key = series.length <= 520
        ? d => { const t = new Date(d.date + 'T00:00'); t.setDate(t.getDate() - (t.getDay() + 6) % 7); return t.toDateString(); } // 該週週一
        : d => d.date.slice(0, 7);
    return series.filter((d, i) => i === series.length - 1 || key(series[i + 1]) !== key(d));
}

// 50/50 策略股票與現金明細
// ===== 持有期間報酬分布（勝率表點擊）=====
let distChart = null;

// 約 20 組的整齊組距（1 / 2 / 2.5 / 5 × 10^k）
function niceStep(raw) {
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    return [1, 2, 2.5, 5, 10].map(m => m * p).find(s => s >= raw);
}

// cagrs：由小到大的年化報酬 %；組界為組距整數倍，0 必為組界（虧損 / 獲利分色：台股綠跌紅漲）
export function renderDistChart(cagrs) {
    const canvas = document.getElementById('chartDist');
    if (!canvas) return;
    if (distChart) distChart.destroy();

    const lo = cagrs[0], hi = cagrs[cagrs.length - 1];
    const step = niceStep(Math.max(hi - lo, 0.1) / 20);
    const start = Math.floor(lo / step) * step;
    const nBins = Math.max(Math.floor((hi - start) / step) + 1, 1);
    const counts = new Array(nBins).fill(0);
    cagrs.forEach(v => counts[Math.min(Math.floor((v - start) / step), nBins - 1)]++);

    const edge = i => +(start + i * step).toFixed(2);
    const labels = counts.map((_, i) => `${edge(i)}~${edge(i + 1)}%`);
    const share = counts.map(c => c / cagrs.length * 100);
    const isLoss = i => edge(i + 1) <= 0;

    distChart = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                data: share,
                backgroundColor: counts.map((_, i) => isLoss(i) ? 'rgba(52, 211, 153, 0.45)' : 'rgba(248, 113, 113, 0.45)'),
                borderColor:     counts.map((_, i) => isLoss(i) ? '#34D399' : '#F87171'),
                borderWidth: 1,
                barPercentage: 1, categoryPercentage: 0.92
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    ...glassTooltip,
                    usePointStyle: false,
                    callbacks: {
                        title: items => '年化 ' + items[0].label,
                        label: item => `${item.raw.toFixed(1)}%（${counts[item.dataIndex].toLocaleString('en-US')} 個進場日）`
                    }
                }
            },
            scales: neonScales(v => v + '%')
        }
    });
}

export function render5050DetailChart(series) {
    const canvas = document.getElementById('chart5050Detail');
    if (!canvas) return;
    if (detail5050Chart) detail5050Chart.destroy();
    series = periodLast(series);

    const fmt2 = v => v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    detail5050Chart = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels: series.map(d => d.date),
            datasets: [
                neonLine('00631L 股票', series.map(d => d.stock), '#00D2FF'),
                { type: 'bar', label: '現金', data: series.map(d => d.cash), backgroundColor: 'rgba(148, 163, 184, 0.35)', borderColor: '#94A3B8', borderWidth: 1 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend:  { labels: { color: '#9DA7B3', font: { family: 'Share Tech Mono' }, usePointStyle: true, pointStyle: 'circle', boxWidth: 8, boxHeight: 8 } },
                tooltip: glassTooltip
            },
            scales: neonScales(fmt2)
        }
    });
}
