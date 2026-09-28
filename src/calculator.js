/**
 * calculator.js
 * 複利計算核心邏輯與數據面板更新
 * 由 router.js 在載入 views/dca.html 後呼叫 initDCA()
 */

import { renderDcaChart, updateDcaChart } from './chartRender.js';

export function initDCA() {
    const inputAmount = document.getElementById('input-amount');
    const inputRate   = document.getElementById('input-rate');
    const inputYears  = document.getElementById('input-years');

    const valAmount = document.getElementById('val-amount');
    const valRate   = document.getElementById('val-rate');
    const valYears  = document.getElementById('val-years');

    const resPrincipal = document.getElementById('res-principal');
    const resTotal     = document.getElementById('res-total');

    // 初始化圖表
    renderDcaChart();

    function updateSimulation() {
        const P          = parseInt(inputAmount.value);
        const annualRate = parseFloat(inputRate.value) / 100;
        const r          = annualRate / 12;
        const years      = parseInt(inputYears.value);

        // 更新滑桿數值文字
        valAmount.innerText = P.toLocaleString();
        valRate.innerText   = (annualRate * 100).toFixed(1);
        valYears.innerText  = years;

        const labels        = [];
        const principalData = [];
        const totalData     = [];

        // 逐年計算複利數據
        for (let y = 1; y <= years; y++) {
            labels.push('Year ' + y);
            const principal = P * 12 * y;
            principalData.push(principal);

            // 月複利公式：M = P × ((1 + r)^n - 1) / r × (1 + r)
            const n     = y * 12;
            const total = P * (((Math.pow(1 + r, n) - 1) / r) * (1 + r));
            totalData.push(Math.round(total));
        }

        // 更新數據看板
        resPrincipal.innerText = '$' + principalData[principalData.length - 1].toLocaleString();
        resTotal.innerText     = '$' + totalData[totalData.length - 1].toLocaleString();

        // 更新圖表
        updateDcaChart(labels, totalData, principalData);
    }

    // 滑桿事件綁定（Real-time 即時更新）
    inputAmount.addEventListener('input', updateSimulation);
    inputRate.addEventListener('input', updateSimulation);
    inputYears.addEventListener('input', updateSimulation);

    // 初始化首次渲染
    updateSimulation();
}

// ===== 策略回測（首頁）=====

// 買進持有：以區間首日收盤價為基準，從 100 元開始
// field：'t2_close' | 'tw50_close'
export function calcBuyHold(rows, field) {
    const valid = rows.filter(r => r[field] != null);
    if (!valid.length) return [];
    const base = valid[0][field];
    let peak = 100, mdd = 0;
    return valid.map(r => {
        const amount = r[field] / base * 100;
        if (amount > peak) peak = amount;
        const dd = (amount - peak) / peak * 100;
        if (dd < mdd) mdd = dd;
        return { date: r.date, amount, mdd };
    });
}

// 50/50 再平衡：股票與現金差距超過 20% 時重新平衡
export function calc5050(rows, field) {
    const valid = rows.filter(r => r[field] != null);
    let stock = 50, cash = 50, peak = 100, mdd = 0;
    return valid.map((r, i) => {
        if (i > 0) stock *= r[field] / valid[i - 1][field];
        const total = stock + cash;
        const minVal = Math.min(stock, cash);
        if (minVal > 0 && Math.abs(stock - cash) / minVal > 0.20) {
            stock = total / 2;
            cash  = total / 2;
        }
        if (total > peak) peak = total;
        const dd = (total - peak) / peak * 100;
        if (dd < mdd) mdd = dd;
        return { date: r.date, stock, cash, amount: total, mdd };
    });
}

// 最大回撤的高點與低點日期
export function findMDDPeriod(series) {
    let troughIdx = 0, minMDD = 0;
    for (let i = 0; i < series.length; i++) {
        if (series[i].mdd < minMDD) { minMDD = series[i].mdd; troughIdx = i; }
    }
    let peakIdx = 0, peakVal = 0;
    for (let i = 0; i <= troughIdx; i++) {
        if (series[i].amount > peakVal) { peakVal = series[i].amount; peakIdx = i; }
    }
    return { peak: series[peakIdx].date, trough: series[troughIdx].date };
}

// 持有期間勝率：任一交易日進場、持有 years 年後的結果
// series：[{ date, amount }]；回傳 { winRate, worst, best, samples }（年化 %），樣本不足回傳 null
export function calcHoldingWinRate(series, years) {
    let wins = 0, samples = 0, worst = Infinity, best = -Infinity;
    let j = 0;
    for (let i = 0; i < series.length; i++) {
        const target = (+series[i].date.slice(0, 4) + years) + series[i].date.slice(4);
        while (j < series.length && series[j].date < target) j++;
        if (j >= series.length) break; // 之後的進場日都不滿 years 年
        const ret = series[j].amount / series[i].amount;
        const cagr = (Math.pow(ret, 1 / years) - 1) * 100;
        if (ret > 1) wins++;
        if (cagr < worst) worst = cagr;
        if (cagr > best) best = cagr;
        samples++;
    }
    return samples ? { winRate: wins / samples * 100, worst, best, samples } : null;
}
