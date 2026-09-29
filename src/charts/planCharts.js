/**
 * planCharts.js
 * 投資計畫頁圖表：滾動起點長條圖、單一起點資產曲線
 */

import Chart from 'chart.js/auto';
import { neonScales, glassTooltip, neonLine, downsampleIdx } from './chartTheme.js';
import { fmtMoney, ym } from '../pages/plan/planFormat.js';

let rollingChart = null;
let assetChart = null;

const COLOR = {
    bar: 'rgba(0, 210, 255, 0.45)',
    selected: '#E6EDF3',
    broke: '#FF007F',
    median: 'rgba(227, 179, 65, 0.8)'
};

const wanTick = v => (v / 1e4).toLocaleString('en-US') + '萬';

// 中位數水平虛線
const medianLine = value => ({
    id: 'medianLine',
    afterDatasetsDraw(chart) {
        const { ctx, chartArea, scales } = chart;
        const y = scales.y.getPixelForValue(value);
        ctx.save();
        ctx.strokeStyle = COLOR.median;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(chartArea.left, y);
        ctx.lineTo(chartArea.right, y);
        ctx.stroke();
        ctx.restore();
    }
});

// items：依顯示順序排列的滾動結果；點擊回呼 onPick(startIdx)（取最近一根，手機易點）
export function renderRollingChart(items, selectedIdx, median, onPick) {
    const canvas = document.getElementById('chartRolling');
    if (!canvas) return;
    if (rollingChart) rollingChart.destroy();

    const color = r => r.startIdx === selectedIdx ? COLOR.selected : r.brokeDate ? COLOR.broke : COLOR.bar;
    rollingChart = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: items.map(r => ym(r.startDate)),
            datasets: [{
                data: items.map(r => r.final),
                backgroundColor: items.map(color),
                borderWidth: 0,
                barPercentage: 1, categoryPercentage: 0.85,
                minBarLength: 2 // 期末 0（斷鏈）仍看得到
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            onClick(evt, _els, chart) {
                const pts = chart.getElementsAtEventForMode(evt, 'index', { intersect: false }, false);
                if (pts.length) onPick(items[pts[0].index].startIdx);
            },
            onHover(evt, _els, chart) {
                evt.native.target.style.cursor = 'pointer';
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    ...glassTooltip,
                    usePointStyle: false,
                    callbacks: {
                        title: its => items[its[0].dataIndex].startDate.replace(/-/g, '/') + ' 起',
                        label: it => {
                            const r = items[it.dataIndex];
                            return r.brokeDate ? `資金斷鏈 ${r.brokeDate.replace(/-/g, '/')}` : `期末資產 ${fmtMoney(r.final)}`;
                        }
                    }
                }
            },
            scales: neonScales(wanTick)
        },
        plugins: [medianLine(median)]
    });
}

// daily：simulatePlan 的每日資產
export function renderAssetChart(daily) {
    const canvas = document.getElementById('chartPlanAsset');
    if (!canvas) return;
    if (assetChart) assetChart.destroy();

    let labels = daily.map(d => d.date), value = daily.map(d => d.value), invested = daily.map(d => d.invested);
    const idx = downsampleIdx(labels.length, [value]);
    if (idx) [labels, value, invested] = [labels, value, invested].map(arr => idx.map(i => arr[i]));

    assetChart = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels,
            datasets: [
                neonLine('總資產', value, '#00D2FF'),
                { ...neonLine('累計淨投入', invested, '#94A3B8'), borderDash: [5, 4], borderWidth: 1.5, tension: 0 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { labels: { color: '#9DA7B3', font: { family: 'Share Tech Mono' }, usePointStyle: true, pointStyle: 'circle', boxWidth: 8, boxHeight: 8 } },
                tooltip: { ...glassTooltip, callbacks: { label: it => `${it.dataset.label} ${fmtMoney(it.raw)}` } }
            },
            scales: neonScales(wanTick),
            animation: { duration: 400, easing: 'easeOutQuart' }
        }
    });
}
