/**
 * planCharts.js
 * 投資計畫頁圖表：滾動起點長條圖、單一起點資產曲線
 */

import Chart from 'chart.js/auto';
import { neonScales, glassTooltip, neonLine, downsampleIdx, periodLast, chartAnimation } from './chartTheme.js';
import { assetSeries } from './assetSeries.js';
import { fmtMoney, ym } from '../pages/plan/planFormat.js';

let rollingChart = null;
let assetChart = null;
let allocationChart = null;

const COLOR = {
    bar: 'rgba(0, 210, 255, 0.45)',
    selected: '#E6EDF3',
    broke: '#FF007F',
    median: 'rgba(227, 179, 65, 0.8)',
    drawdown: '#34D399', // 跌：同 --color-down
    a: '#A78BFA'         // 對照組 A（同明細圖 A 線）
};

const wanTick = v => (v / 1e4).toLocaleString('en-US') + '萬';

// 本頁圖表座標軸：X 軸標籤水平、寬度不足自動減少；xFmt 轉換日期標籤（如 'YYYY-MM-DD' → 'YYYY/MM'）
function planScales(xFmt = null) {
    const sc = neonScales(wanTick);
    sc.x.ticks = { ...sc.x.ticks, maxRotation: 0, autoSkipPadding: 16,
        ...(xFmt && { callback(v) { return xFmt(this.getLabelForValue(v)); } }) };
    return sc;
}

// 中位數水平虛線（預設金色；對照組 A 另畫一條紫色，id 須不同）
const medianLine = (value, color = COLOR.median, id = 'medianLine') => ({
    id,
    afterDatasetsDraw(chart) {
        const { ctx, chartArea, scales } = chart;
        const y = scales.y.getPixelForValue(value);
        ctx.save();
        ctx.strokeStyle = color;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(chartArea.left, y);
        ctx.lineTo(chartArea.right, y);
        ctx.stroke();
        ctx.restore();
    }
});

// 依結果排序時 X 軸改標排名位置（中位與「中位」快速按鈕同一根：floor）
function rankScales(n) {
    const marks = {};
    [[0, '最差'], [0.25, '25%'], [0.5, '中位'], [0.75, '75%'], [1, '最好']]
        .forEach(([q, label]) => { marks[Math.floor((n - 1) * q)] = label; });
    const sc = neonScales(wanTick);
    sc.x.ticks = { ...sc.x.ticks, autoSkip: false, maxRotation: 0, callback: (_v, i) => marks[i] ?? '' };
    sc.x.grid = { color: ctx => marks[ctx.index] ? 'rgba(255, 255, 255, 0.05)' : 'transparent' };
    return sc;
}

// items：依顯示順序排列的滾動結果；byRank：依結果排序（X 軸標排名）；點擊回呼 onPick(startIdx)（取最近一根，手機易點）
// a：釘住對照組 A 時的疊加資料 { line, median }（見 rollingA.js；未釘住為 null，圖與原本完全相同）
export function renderRollingChart(items, selectedIdx, median, onPick, byRank = false, a = null) {
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
            }, ...(a ? [{
                type: 'line', label: 'A', data: a.line,
                borderColor: COLOR.a, borderWidth: 1.5, pointRadius: 0, pointHoverRadius: 0, tension: 0, fill: false, spanGaps: false
            }] : [])]
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
            ...(a && { interaction: { mode: 'index', intersect: false } }), // 有 A 線時滑過同一欄即同時顯示 B、A
            plugins: {
                legend: { display: false },
                tooltip: {
                    ...glassTooltip,
                    usePointStyle: false,
                    callbacks: {
                        title: its => items[its[0].dataIndex].startDate.replace(/-/g, '/') + ' 起',
                        label: it => {
                            if (it.datasetIndex === 1) return it.raw == null ? null : `A 期末資產 ${fmtMoney(it.raw)}`;
                            const r = items[it.dataIndex];
                            return r.brokeDate ? `資金斷鏈 ${r.brokeDate.replace(/-/g, '/')}` : `期末資產 ${fmtMoney(r.final)}`;
                        }
                    }
                }
            },
            scales: byRank ? rankScales(items.length) : planScales(),
            layout: { padding: { right: byRank ? 14 : 0 } } // 右端「最好」標籤不被切掉
        },
        plugins: [medianLine(median), ...(a ? [medianLine(a.median, COLOR.a, 'medianLineA')] : [])]
    });
}

// 最大回撤標示：高點～低點淡綠色帶（線下）+ 兩端圓點與金額標籤（線上）
// m：simulatePlan 的 mddPeriod；pct：最大回撤 %；labels：圖上日期（降採樣後，取該日當天或之後最近一點）
function mddMarker(m, pct, labels) {
    const xAt = (x, date) => {
        const i = labels.findIndex(d => d >= date);
        return x.getPixelForValue(i < 0 ? labels.length - 1 : i);
    };
    return {
        id: 'mddMarker',
        beforeDatasetsDraw(chart) {
            const { ctx, chartArea: a, scales: { x } } = chart;
            const x0 = xAt(x, m.peak), x1 = xAt(x, m.trough);
            ctx.save();
            ctx.fillStyle = 'rgba(52, 211, 153, 0.1)';
            ctx.fillRect(x0, a.top, Math.max(x1 - x0, 2), a.bottom - a.top);
            ctx.restore();
        },
        afterDatasetsDraw(chart) {
            const { ctx, chartArea: a, scales: { x, y } } = chart;
            // 高點標籤在圓點左上、低點標籤在圓點右下，左右錯開避免窄圖重疊
            const pts = [
                { px: xAt(x, m.peak), py: y.getPixelForValue(m.peakValue), text: `高點 ${fmtMoney(m.peakValue)}`, dy: -12, side: -1 },
                { px: xAt(x, m.trough), py: y.getPixelForValue(m.troughValue), text: `低點 ${fmtMoney(m.troughValue)}（${pct.toFixed(1)}%）`, dy: 14, side: 1 }
            ];
            if (a.right - a.left < 500) { // 窄圖（手機）只標回撤幅度，避免標籤互相重疊
                pts[0].text = '';
                pts[1].text = `${pct.toFixed(1)}%`;
            }
            ctx.save();
            ctx.font = '11px "JetBrains Mono", "Noto Sans TC", monospace';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = COLOR.drawdown;
            for (const p of pts) {
                ctx.beginPath();
                ctx.arc(p.px, p.py, 4, 0, Math.PI * 2);
                ctx.fill();
                if (!p.text) continue;
                const w = ctx.measureText(p.text).width;
                let tx = p.side < 0 ? p.px - w - 6 : p.px + 6;
                if (tx < a.left + 2 || tx + w > a.right - 2) tx = p.side < 0 ? p.px + 6 : p.px - w - 6; // 超出左右緣改放另一側
                tx = Math.min(Math.max(tx, a.left + 2), a.right - w - 2);
                let ty = p.py + p.dy;
                if (ty > a.bottom - 8 || ty < a.top + 8) ty = p.py - p.dy; // 超出圖表區上下緣時改放圓點另一側
                ctx.fillText(p.text, tx, ty);
            }
            ctx.restore();
        }
    };
}

// daily：simulatePlan 的每日資產；mddPeriod / mdd：最大回撤期間與幅度（無回撤時 mddPeriod 為 null）
// dailyA：釘住的對照組 A 同起點每日資產（未釘住為 null；有值時多畫紫色細點線）
export function renderAssetChart(daily, mddPeriod = null, mdd = 0, dailyA = null) {
    const canvas = document.getElementById('chartPlanAsset');
    if (!canvas) return;
    if (assetChart) assetChart.destroy();

    const { labels, value, invested, a } = assetSeries(daily, dailyA);

    assetChart = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels,
            datasets: [
                neonLine(a ? '總資產（目前）' : '總資產', value, '#00D2FF'),
                { ...neonLine('累計淨投入', invested, '#94A3B8'), borderDash: [5, 4], borderWidth: 1.5, tension: 0 },
                ...(a ? [{ ...neonLine('A（對照組）', a, '#A78BFA'), borderDash: [2, 3], borderWidth: 1.5 }] : [])
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
            scales: planScales(d => d.slice(0, 7).replace('-', '/')),
            animation: chartAnimation
        },
        plugins: mddPeriod ? [mddMarker(mddPeriod, mdd, labels)] : []
    });
}

// 資產配置（放大鏡 Modal）：股票市值折線 + 現金長條，樣式同首頁 50/50 明細圖；粒度依交易日數切換
export function renderAllocationChart(daily) {
    const canvas = document.getElementById('chartPlanAllocation');
    if (!canvas) return;
    if (allocationChart) allocationChart.destroy();
    const series = periodLast(daily);
    allocationChart = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels: series.map(d => d.date),
            datasets: [
                neonLine('00631L 股票市值', series.map(d => d.value - d.cash), '#00D2FF'),
                { type: 'bar', label: '現金', data: series.map(d => d.cash), backgroundColor: 'rgba(148, 163, 184, 0.35)', borderColor: '#94A3B8', borderWidth: 1 }
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
            scales: planScales(d => d.slice(0, 7).replace('-', '/'))
        }
    });
}
