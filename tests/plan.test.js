// core/plan/ 投資計畫模擬測試（npm test）
import { describe, it, expect } from 'vitest';
import { targetDate, monthsFrom } from '../src/core/plan/calendar.js';
import { tradeCost } from '../src/core/plan/fees.js';
import { Account } from '../src/core/plan/account.js';
import { normalizePlan } from '../src/core/plan/defaults.js';
import { xirr } from '../src/core/plan/xirr.js';
import { drifted, triggerRange } from '../src/core/plan/rebalance.js';
import { simulatePlan, simulateRolling, toSeries } from '../src/core/plan/simulate.js';

// 2000/01/03 ~ 2001/12/31 的平日為交易日；price(date) 決定股價（預設 10）
function weekdays(price = () => 10) {
    const dates = [], prices = [];
    for (let t = Date.UTC(2000, 0, 1); t <= Date.UTC(2001, 11, 31); t += 864e5) {
        const d = new Date(t);
        if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
        const date = d.toISOString().slice(0, 10);
        dates.push(date);
        prices.push(price(date));
    }
    return { dates, prices };
}

const NO_COST = { enabled: false };
const plan = over => ({ years: 1, stockRatio: 1, cashflows: [], purchase: { timing: 'none' }, costs: NO_COST, ...over });

describe('calendar', () => {
    it('當月無該日取月底', () => {
        expect(targetDate(2000, 2, 30)).toBe('2000-02-29');
        expect(targetDate(2001, 2, 31)).toBe('2001-02-28');
        expect(targetDate(2001, 4, 5)).toBe('2001-04-05');
    });

    it('連續月份跨年並標示第幾年', () => {
        const ms = monthsFrom('2000-11-01', 14);
        expect(ms[2]).toEqual({ y: 2001, m: 1, year: 1 });
        expect(ms[12]).toEqual({ y: 2001, m: 11, year: 2 });
    });
});

describe('fees', () => {
    const costs = { enabled: true, discount: 0.6, minFee: 1 };

    it('手續費無條件捨去、不低於最低手續費；賣出加證交稅', () => {
        expect(tradeCost(10000, 'buy', costs)).toBe(8);   // 8.55
        expect(tradeCost(100, 'buy', costs)).toBe(1);     // 0.0855 → 最低 1
        expect(tradeCost(9990, 'sell', costs)).toBe(17);  // 8 + 9
        expect(tradeCost(10000, 'buy', NO_COST)).toBe(0);
    });

    it('買進含手續費後買得起的最大股數，零頭留現金', () => {
        const acc = new Account(10000, costs);
        expect(acc.buy(10, 10000)).toBe(999);
        expect(acc.cash).toBeCloseTo(2);
        expect(acc.costTotal).toBe(8);
    });

    it('現金為負時賣出最少股數補足（含成本）', () => {
        const acc = new Account(1000, costs);
        acc.buy(10, 1000);        // 99 股，現金 9
        acc.cash -= 100;          // -91
        expect(acc.cover(10)).toBe(true);
        expect(acc.shares).toBe(89); // 賣 10 股：100 − 1 − 0 = 99 ≥ 91（9 股僅 88）
        expect(acc.cash).toBeCloseTo(8);
    });
});

describe('normalizePlan', () => {
    it('缺欄位補預設值', () => {
        const p = normalizePlan({ years: 10, purchase: { day: 20 }, cashflows: [{ amount: 5, day: 1 }] });
        expect(p.years).toBe(10);
        expect(p.purchase).toMatchObject({ timing: 'inflow', inflowMode: 'ratio', day: 20, mode: 'all' });
        expect(p.cashflows[0]).toMatchObject({ fromYear: 1, toYear: null });
        expect(p.costs.enabled).toBe(true);
    });
});

describe('xirr', () => {
    it('一年 +10%', () => {
        expect(xirr([{ date: '2001-01-01', amount: -100 }, { date: '2002-01-01', amount: 110 }])).toBeCloseTo(0.1, 6);
    });

    it('無解回傳 null', () => {
        expect(xirr([{ date: '2001-01-01', amount: 100 }, { date: '2002-01-01', amount: 110 }])).toBeNull();
    });
});

describe('simulatePlan', () => {
    it('初始資金依股票比例買整數股，零頭留現金', () => {
        const r = simulatePlan(weekdays(() => 3), 0, plan({ initialCapital: 100 }));
        expect(r.daily[0]).toMatchObject({ shares: 33, cash: 1 });
        expect(r.final).toBeCloseTo(100);
        expect(r.xirr).toBeCloseTo(0, 6);
    });

    it('設定日遇假日延至下一個交易日', () => {
        const r = simulatePlan(weekdays(), 0, plan({ initialCapital: 0, cashflows: [{ amount: 100, day: 5 }] }));
        const flows = r.trades.filter(t => t.type === 'flow').map(t => t.date);
        expect(flows[1]).toBe('2000-02-07'); // 2/5 週六
        expect(flows).toHaveLength(12);
    });

    it('每月固定日全部現金買進', () => {
        const r = simulatePlan(weekdays(), 0, plan({
            initialCapital: 1000, stockRatio: 0.5,
            cashflows: [{ amount: 100, day: 5 }], purchase: { timing: 'monthly', day: 5, mode: 'all' }
        }));
        const last = r.daily.at(-1);
        expect(last).toMatchObject({ shares: 220, invested: 2200 });
        expect(last.cash).toBeCloseTo(0);
    });

    it('入帳當天買進：年終於非購買日入帳也當天買', () => {
        const r = simulatePlan(weekdays(), 0, plan({
            initialCapital: 0,
            cashflows: [{ amount: 100, period: 'yearly', month: 2, day: 20 }], purchase: { timing: 'inflow' }
        }));
        expect(r.trades.filter(t => t.type === 'buy').map(t => [t.date, t.shares])).toEqual([['2000-02-21', 10]]); // 2/20 週日
    });

    it('入帳投入方式：入帳金額 / 依股票比例 / 達門檻才買', () => {
        const run = inflowMode => simulatePlan(weekdays(), 0, plan({
            years: 1, initialCapital: 1000, stockRatio: 0.5,
            cashflows: [{ amount: 100, day: 5 }], purchase: { timing: 'inflow', inflowMode, threshold: 0.2 }
        })).trades.filter(t => t.type === 'buy').slice(1, 4).map(t => [t.date.slice(5, 7), t.shares]); // 略過初始買進
        expect(run('amount')).toEqual([['01', 10], ['02', 10], ['03', 10]]);
        expect(run('ratio')).toEqual([['01', 5], ['02', 5], ['03', 5]]); // 1100 × 0.5 − 500 = 50 → 5 股
        // 股 500 / 現 600 偏離 20% 未超過；次月現 700 偏離 40% → 買到 600（10 股），之後每兩個月一次
        expect(run('threshold')).toEqual([['02', 10], ['04', 10], ['06', 10]]);
    });

    it('不自動買進：現金留在帳戶', () => {
        const r = simulatePlan(weekdays(), 0, plan({ initialCapital: 0, cashflows: [{ amount: 100, day: 5 }] }));
        expect(r.daily.at(-1)).toMatchObject({ shares: 0, cash: 1200 });
    });

    it('固定金額購買，剩餘留現金', () => {
        const r = simulatePlan(weekdays(), 0, plan({
            initialCapital: 0,
            cashflows: [{ amount: 100, day: 5 }], purchase: { timing: 'monthly', day: 5, mode: 'fixed', amount: 30 }
        }));
        expect(r.daily.at(-1)).toMatchObject({ shares: 36, cash: 840 });
    });

    it('每年指定月份、單次指定第幾年', () => {
        const r = simulatePlan(weekdays(), 0, plan({ years: 1, initialCapital: 0, cashflows: [
            { amount: 500, period: 'yearly', month: 3, day: 1 },
            { amount: 70, period: 'once', month: 7, day: 10, fromYear: 1 },
            { amount: 9, period: 'once', month: 7, day: 10, fromYear: 2 }
        ] }));
        const flows = r.trades.filter(t => t.type === 'flow').map(t => [t.date, t.amount]);
        expect(flows).toEqual([['2000-03-01', 500], ['2000-07-10', 70]]);
    });

    it('現金流依第幾年起訖生效', () => {
        const r = simulatePlan(weekdays(), 0, plan({ years: 1, initialCapital: 0, cashflows: [{ amount: 100, day: 5, fromYear: 2 }] }));
        expect(r.invested).toBe(0);
    });

    it('扣款賣股補足，持股不足即資金斷鏈', () => {
        const r = simulatePlan(weekdays(), 0, plan({ initialCapital: 100, cashflows: [{ amount: -30, day: 5 }] }));
        expect(r.brokeDate).toBe('2000-04-05');
        expect(r.final).toBe(0);
        expect(r.daily.at(-1).date).toBe('2000-04-05');
    });

    it('資料不足 years 年回傳 null', () => {
        expect(simulatePlan(weekdays(), 0, plan({ years: 3 }))).toBeNull();
    });
});

describe('rebalance', () => {
    it('50/50 同首頁規則；其他比例先除以目標權重', () => {
        expect(drifted(55, 50, 0.5, 0.2)).toBe(false);
        expect(drifted(65, 50, 0.5, 0.2)).toBe(true);
        expect(drifted(60, 40, 0.6, 0.2)).toBe(false);
        expect(drifted(80, 40, 0.6, 0.2)).toBe(true);
        expect(drifted(80, 0, 1, 0.2)).toBe(false); // 100% 無作用
    });

    it('觸發點以股市值 / 現金表示', () => {
        const r = triggerRange(0.5, 0.2);
        expect(r.upper).toBeCloseTo(1.2);
        expect(r.lower).toBeCloseTo(1 / 1.2);
        expect(triggerRange(0.6, 0.2).upper).toBeCloseTo(1.8);
    });

    it('漲跌幅超過門檻當日調回目標比例', () => {
        const r = simulatePlan(weekdays(d => d >= '2000-01-04' ? 13 : 10), 0, plan({
            initialCapital: 1000, stockRatio: 0.5, rebalance: { mode: 'threshold', threshold: 0.2 }
        }));
        expect(r.daily[1]).toMatchObject({ shares: 45, cash: 565 }); // 股 650 / 現 500 → 賣 5 股
    });

    it('定期（每年指定月）再平衡', () => {
        const r = simulatePlan(weekdays(d => d >= '2000-02-01' ? 20 : 10), 0, plan({
            initialCapital: 1000, stockRatio: 0.5, rebalance: { mode: 'periodic', period: 'yearly', month: 3, day: 1 }
        }));
        expect(r.trades.filter(t => t.type === 'sell').map(t => [t.date, t.shares])).toEqual([['2000-03-01', 12]]);
    });
});

describe('simulateRolling', () => {
    it('每月第一個交易日為起點，至不滿 years 年為止', () => {
        const rs = simulateRolling(weekdays(), plan({ initialCapital: 100 }));
        expect(rs).toHaveLength(12);
        expect(rs.map(r => r.startDate).slice(0, 2)).toEqual(['2000-01-03', '2000-02-01']);
        expect(rs[0].daily).toBeUndefined();
    });
});

describe('toSeries', () => {
    it('略過 null', () => {
        const s = toSeries([{ date: 'a', x: 1 }, { date: 'b', x: null }, { date: 'c', x: 2 }], 'x');
        expect(s).toEqual({ dates: ['a', 'c'], prices: [1, 2] });
    });
});
