/**
 * simBandPlugin.js
 * Chart.js 自訂 plugin：在類別 x 軸上，把「早於 boundary 日期」的區段畫淡色背景帶，標示推算期
 * 位置以 labels 的索引換算像素（降採樣 / 縮放後仍正確）；options.plugins.simBand = { boundary: 'YYYY-MM-DD', text }
 */

export const simBandPlugin = {
    id: 'simBand',
    beforeDatasetsDraw(chart, _args, opts) {
        if (!opts?.boundary) return;
        const labels = chart.data.labels;
        if (!labels?.length || labels[0] >= opts.boundary) return; // 起日 ≥ 上市日：不畫
        const { ctx, chartArea: a, scales: { x } } = chart;
        const idx = labels.findIndex(l => l >= opts.boundary);
        const right = idx < 0 ? a.right : Math.min(Math.max(x.getPixelForValue(idx), a.left), a.right);
        if (right <= a.left) return;
        ctx.save();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
        ctx.fillRect(a.left, a.top, right - a.left, a.bottom - a.top);
        ctx.font = '11px "Share Tech Mono", sans-serif';
        ctx.fillStyle = 'rgba(157, 167, 179, 0.9)';
        ctx.textBaseline = 'top';
        const w = ctx.measureText(opts.text).width;
        if (right - a.left >= w + 12) ctx.fillText(opts.text, a.left + 6, a.top + 6); // 帶太窄放不下文字時只畫背景
        ctx.restore();
    }
};
