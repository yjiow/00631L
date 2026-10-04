// plan-*.test.js 共用測試工具

// 2000/01/03 ~ endYear/12/31 的平日為交易日；price(date) 決定股價（預設 10）
export function weekdays(price = () => 10, endYear = 2001) {
    const dates = [], prices = [];
    for (let t = Date.UTC(2000, 0, 1); t <= Date.UTC(endYear, 11, 31); t += 864e5) {
        const d = new Date(t);
        if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
        const date = d.toISOString().slice(0, 10);
        dates.push(date);
        prices.push(price(date));
    }
    return { dates, prices };
}

export const NO_COST = { enabled: false };
export const plan = over => ({ years: 1, stockRatio: 1, cashflows: [], purchase: { timing: 'none' }, rebalance: { mode: 'none' }, costs: NO_COST, cashRate: 0, ...over });
