/**
 * chartRender.js
 * Chart.js 霓虹圖表初始化與更新
 */

let dcaChart = null;

export function renderDcaChart() {
    const canvas = document.getElementById('dcaChart');
    if (!canvas) return;

    const ctx      = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 340);
    gradient.addColorStop(0, 'rgba(0, 210, 255, 0.18)');
    gradient.addColorStop(1, 'rgba(0, 210, 255, 0.0)');

    dcaChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: '複利滾存資產',
                    data: [],
                    borderColor: '#00D2FF',
                    borderWidth: 2,
                    backgroundColor: gradient,
                    fill: true,
                    tension: 0.3,
                    pointBackgroundColor: '#00D2FF',
                    pointRadius: 3,
                    pointHoverRadius: 6
                },
                {
                    label: '投入總本金',
                    data: [],
                    borderColor: 'rgba(255, 255, 255, 0.25)',
                    borderWidth: 1,
                    borderDash: [5, 5],
                    fill: false,
                    pointRadius: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: '#9DA7B3', font: { family: 'Share Tech Mono' }, usePointStyle: true, pointStyle: 'circle', boxWidth: 8, boxHeight: 8 }
                }
            },
            scales: {
                x: {
                    grid:  { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#8B949E', font: { family: 'Share Tech Mono', size: 10 } }
                },
                y: {
                    grid:  { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: {
                        color: '#8B949E',
                        font:  { family: 'Share Tech Mono', size: 10 },
                        callback: value => '$' + value.toLocaleString()
                    }
                }
            },
            animation: { duration: 400, easing: 'easeOutQuart' }
        }
    });
}

export function updateDcaChart(labels, totalData, principalData) {
    if (!dcaChart) return;
    dcaChart.data.labels                    = labels;
    dcaChart.data.datasets[0].data          = totalData;
    dcaChart.data.datasets[1].data          = principalData;
    dcaChart.update();
}

// ===== 策略回測圖表（首頁）=====

let backtestChart = null;
let detail5050Chart = null;

const neonScales = yCallback => ({
    x: {
        grid:  { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { color: '#8B949E', font: { family: 'Share Tech Mono', size: 10 }, maxTicksLimit: 10 }
    },
    y: {
        grid:  { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { color: '#8B949E', font: { family: 'Share Tech Mono', size: 10 }, callback: yCallback }
    }
});

const glassTooltip = {
    mode: 'index',
    intersect: false,
    backgroundColor: 'rgba(26, 31, 44, 0.75)',
    borderColor: 'rgba(0, 210, 255, 0.4)',
    borderWidth: 1,
    titleFont: { family: 'Share Tech Mono' },
    bodyFont:  { family: 'Share Tech Mono' },
    usePointStyle: true, // 與圖例一致用圓點
    boxWidth: 8,
    boxHeight: 8,
    boxPadding: 6
};

const neonLine = (label, data, color) => ({
    label, data, borderColor: color, backgroundColor: color, borderWidth: 2, pointRadius: 0, fill: false, tension: 0.2
});

const MAX_POINTS = 800; // 超過才降採樣

// 降採樣：分段保留各序列最高 / 最低點（保住 MDD 低谷），回傳保留的索引
function downsampleIdx(n, seriesList) {
    if (n <= MAX_POINTS) return null;
    const size = Math.ceil(n / (MAX_POINTS / 4));
    const keep = new Set([0, n - 1]);
    for (let s = 0; s < n; s += size) {
        const e = Math.min(s + size, n);
        seriesList.forEach(vals => {
            let lo = -1, hi = -1;
            for (let i = s; i < e; i++) {
                if (vals[i] == null) continue;
                if (lo < 0 || vals[i] < vals[lo]) lo = i;
                if (hi < 0 || vals[i] > vals[hi]) hi = i;
            }
            if (lo >= 0) keep.add(lo).add(hi);
        });
    }
    return [...keep].sort((a, b) => a - b);
}

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
