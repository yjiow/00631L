/**
 * chartTheme.js
 * 全站圖表共用樣式：霓虹座標軸、玻璃提示框、折線、降採樣
 */

export const neonScales = yCallback => ({
    x: {
        grid:  { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { color: '#8B949E', font: { family: 'Share Tech Mono', size: 10 }, maxTicksLimit: 10 }
    },
    y: {
        grid:  { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { color: '#8B949E', font: { family: 'Share Tech Mono', size: 10 }, callback: yCallback }
    }
});

export const glassTooltip = {
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

export const neonLine = (label, data, color) => ({
    label, data, borderColor: color, backgroundColor: color, borderWidth: 2, pointRadius: 0, fill: false, tension: 0.2
});

const MAX_POINTS = 800; // 超過才降採樣

// 降採樣：分段保留各序列最高 / 最低點（保住 MDD 低谷），回傳保留的索引
export function downsampleIdx(n, seriesList) {
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

// 依交易日數切換粒度：≤120 每日、≤520 每週、其餘每月（皆取期間最後一個交易日）
export function periodLast(series) {
    if (series.length <= 120) return series;
    const key = series.length <= 520
        ? d => { const t = new Date(d.date + 'T00:00'); t.setDate(t.getDate() - (t.getDay() + 6) % 7); return t.toDateString(); } // 該週週一
        : d => d.date.slice(0, 7);
    return series.filter((d, i) => i === series.length - 1 || key(series[i + 1]) !== key(d));
}
