/**
 * calculator.js
 * 策略回測計算核心（純計算，不操作 DOM）
 */

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
// series：[{ date, amount }]；回傳 { winRate, worst, best, median, lossMedian, cagrs, samples }（年化 %，cagrs 由小到大；lossMedian 為虧損樣本中位數，無虧損為 null），樣本不足回傳 null
export function calcHoldingWinRate(series, years) {
    let wins = 0;
    const cagrs = [];
    let j = 0;
    for (let i = 0; i < series.length; i++) {
        const target = (+series[i].date.slice(0, 4) + years) + series[i].date.slice(4);
        while (j < series.length && series[j].date < target) j++;
        if (j >= series.length) break; // 之後的進場日都不滿 years 年
        const ret = series[j].amount / series[i].amount;
        if (ret > 1) wins++;
        cagrs.push((Math.pow(ret, 1 / years) - 1) * 100);
    }
    const samples = cagrs.length;
    if (!samples) return null;
    cagrs.sort((a, b) => a - b);
    return {
        winRate: wins / samples * 100,
        worst: cagrs[0], best: cagrs[samples - 1],
        median: quantile(cagrs, 0.5),
        lossMedian: wins < samples ? quantile(cagrs.slice(0, samples - wins), 0.5) : null, // 未獲利者即排序後前段
        cagrs, samples
    };
}

// 已排序陣列的分位數（線性內插）
function quantile(sorted, q) {
    const pos = (sorted.length - 1) * q, lo = Math.floor(pos);
    return sorted[lo] + (sorted[Math.min(lo + 1, sorted.length - 1)] - sorted[lo]) * (pos - lo);
}
