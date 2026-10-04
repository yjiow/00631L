// core/plan/ 投資計畫模擬測試（npm test）
import { describe, it, expect } from 'vitest';
import { targetDate, monthsFrom } from '../src/core/plan/calendar.js';
import { tradeCost } from '../src/core/plan/fees.js';
import { Account } from '../src/core/plan/account.js';
import { normalizePlan } from '../src/core/plan/defaults.js';
import { xirr } from '../src/core/plan/xirr.js';
import { drifted, triggerRange } from '../src/core/plan/rebalance.js';
import { validateDipBuy } from '../src/core/plan/dipBuy.js';
import { simulatePlan, simulateRolling, toSeries } from '../src/core/plan/simulate.js';
import { yearlySummary } from '../src/core/plan/summary.js';
import { flowAmount, purchasingPowerNote, validInflationPct } from '../src/core/plan/inflation.js';
import { DEFAULT_PLAN } from '../src/core/plan/defaults.js';
import { formatMoney, parseMoney } from '../src/ui/moneyInput.js';

// 2000/01/03 ~ endYear/12/31 的平日為交易日；price(date) 決定股價（預設 10）
function weekdays(price = () => 10, endYear = 2001) {
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

const NO_COST = { enabled: false };
const plan = over => ({ years: 1, stockRatio: 1, cashflows: [], purchase: { timing: 'none' }, rebalance: { mode: 'none' }, costs: NO_COST, cashRate: 0, ...over });

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
        expect(p.purchase).toMatchObject({ timing: 'none', inflowMode: 'threshold', day: 20, mode: 'all' });
        expect(p.rebalance.mode).toBe('threshold');
        expect(p.stockRatio).toBe(0.5);
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

    it('交易紀錄標示來源（initial / inflow / purchase / shortfall），供年度明細 Modal 分類', () => {
        const r1 = simulatePlan(weekdays(() => 3), 0, plan({ initialCapital: 100 }));
        expect(r1.trades[0]).toMatchObject({ type: 'buy', reason: 'initial' });

        const r2 = simulatePlan(weekdays(), 0, plan({
            initialCapital: 0, cashflows: [{ amount: 100, day: 5 }], purchase: { timing: 'inflow', inflowMode: 'amount' }
        }));
        expect(r2.trades.find(t => t.type === 'buy')).toMatchObject({ reason: 'inflow' });

        const r3 = simulatePlan(weekdays(), 0, plan({
            initialCapital: 1000, stockRatio: 0.5,
            cashflows: [{ amount: 100, day: 5 }], purchase: { timing: 'monthly', day: 5, mode: 'all' }
        }));
        expect(r3.trades.find(t => t.reason === 'purchase')).toBeTruthy();

        const r4 = simulatePlan(weekdays(), 0, plan({ initialCapital: 100, cashflows: [{ amount: -30, day: 5 }] }));
        expect(r4.trades.find(t => t.reason === 'shortfall')).toBeTruthy();
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

    it('最大回撤附高點 / 低點日期', () => {
        const price = d => d >= '2000-06-01' ? 12 : d >= '2000-03-01' ? 5 : d >= '2000-02-01' ? 20 : 10;
        const r = simulatePlan(weekdays(price), 0, plan({ initialCapital: 1000 }));
        expect(r.mdd).toBeCloseTo(-75);
        expect(r.mddPeriod).toEqual({ peak: '2000-02-01', trough: '2000-03-01', peakValue: 2000, troughValue: 500 });
    });

    it('現金利息：按與上一交易日相隔天數比例計息', () => {
        const r = simulatePlan(weekdays(), 0, plan({ initialCapital: 365_000, stockRatio: 0, cashRate: 0.1 }));
        expect(r.daily[0].cash).toBe(365_000); // 第一天尚無前一交易日，不計息
        expect(r.daily[1].date).toBe('2000-01-04'); // 與第一天相隔 1 個日曆天
        expect(r.daily[1].cash).toBeCloseTo(365_100); // 365000 × 10% × 1/365 = 100
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
        expect(r.trades.find(t => t.date === '2000-01-04')).toMatchObject({ type: 'sell', reason: 'rebalance' });
    });

    it('定期（每年指定月）再平衡', () => {
        const r = simulatePlan(weekdays(d => d >= '2000-02-01' ? 20 : 10), 0, plan({
            initialCapital: 1000, stockRatio: 0.5, rebalance: { mode: 'periodic', period: 'yearly', month: 3, day: 1 }
        }));
        expect(r.trades.filter(t => t.type === 'sell').map(t => [t.date, t.shares])).toEqual([['2000-03-01', 12]]);
    });
});

describe('yearlySummary', () => {
    it('依第幾年彙總入帳 / 扣款 / 買賣 / 年底資產', () => {
        const p = plan({
            years: 2, initialCapital: 1000,
            cashflows: [{ amount: 100, day: 5 }, { amount: -50, period: 'yearly', month: 6, day: 1 }],
            purchase: { timing: 'inflow', inflowMode: 'amount' }
        });
        const r = simulatePlan(weekdays(() => 10, 2002), 0, p);
        const ys = yearlySummary(r, 2);
        expect(ys.map(y => [y.year, y.fromDate, y.inflow, y.outflow, y.buy])).toEqual([
            [1, '2000-01-03', 1200, 50, 2200], // 含初始買進 1000
            [2, '2001-01-03', 1200, 50, 1200]
        ]);
        expect(ys[1].endDate).toBe('2002-01-03'); // 期末那天併入最後一年
        expect(ys.at(-1).endValue).toBeCloseTo(r.final);
    });

    it('資金斷鏈後的年度不列', () => {
        const r = simulatePlan(weekdays(() => 10, 2002), 0, plan({ years: 2, initialCapital: 100, cashflows: [{ amount: -30, day: 5 }] }));
        expect(yearlySummary(r, 2)).toHaveLength(1);
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

describe('moneyInput', () => {
    it('千分位格式化與解析', () => {
        expect(formatMoney(1234567)).toBe('1,234,567');
        expect(formatMoney(-32000)).toBe('-32,000');
        expect(formatMoney('')).toBe('');
        expect(parseMoney('-1,234')).toBe(-1234);
        expect(parseMoney('')).toBe(0);
        expect(parseMoney('-')).toBeNaN();
    });
});

describe('股票比例時程', () => {
    // 價格第 2 年起漲到 20；第 2 年起（2001-01-01）由 100% 降到 50%
    const price = d => d >= '2001-01-01' ? 20 : 10;
    const base = over => plan({ years: 2, initialCapital: 1000, stockRatio: 1, ...over });
    const staged = over => base({ stockRatioSchedule: [{ fromYear: 2, ratio: 0.5 }], ...over });

    it('階段起始日以收盤價調到新比例', () => {
        const r = simulatePlan(weekdays(price, 2002), 0, staged());
        const t = r.trades.find(x => x.reason === 'stage');
        expect(t).toMatchObject({ date: '2001-01-01', type: 'sell', shares: 50 }); // 100 股 × 20 = 2000 → 賣 50 股
        const d = r.daily.find(x => x.date === '2001-01-01');
        expect(d).toMatchObject({ shares: 50, cash: 1000 });
        expect(r.daily.find(x => x.date === '2000-12-29').shares).toBe(100);
    });

    it('不再平衡模式下仍切換；切換後再平衡用新比例', () => {
        const r = simulatePlan(weekdays(price, 2002), 0, staged({ rebalance: { mode: 'none' } }));
        expect(r.trades.filter(x => x.reason === 'stage')).toHaveLength(1);
        const r2 = simulatePlan(weekdays(d => d >= '2001-06-01' ? 40 : price(d), 2002), 0,
            staged({ rebalance: { mode: 'threshold', threshold: 0.2 } }));
        const t = r2.trades.find(x => x.reason === 'rebalance');
        expect(t).toBeTruthy(); // 以 50% 為目標（股 50×40=2000 / 現 1000）
        const d = r2.daily.find(x => x.date === t.date);
        expect(d.shares * 40 / (d.shares * 40 + d.cash)).toBeCloseTo(0.5, 1);
    });

    it('階段切換計手續費與證交稅；可切到 0% 與 100%', () => {
        const costs = { enabled: true, discount: 1, minFee: 1 };
        const noCost = simulatePlan(weekdays(price, 2002), 0, staged());
        const withCost = simulatePlan(weekdays(price, 2002), 0, staged({ costs }));
        expect(withCost.trades.find(x => x.reason === 'stage').cost).toBeGreaterThan(0);
        expect(withCost.final).toBeLessThan(noCost.final);
        const toZero = simulatePlan(weekdays(price, 2002), 0, base({ stockRatioSchedule: [{ fromYear: 2, ratio: 0 }] }));
        expect(toZero.daily.find(x => x.date === '2001-01-01')).toMatchObject({ shares: 0, cash: 2000 });
        const toFull = simulatePlan(weekdays(price, 2002), 0, base({ stockRatio: 0.5, stockRatioSchedule: [{ fromYear: 2, ratio: 1 }] }));
        expect(toFull.daily.find(x => x.date === '2001-01-01').shares).toBe(50 + 25); // 50 股 + 現金 500 / 20 = 25 股
    });

    it('空時程與未設定結果一致', () => {
        const a = simulatePlan(weekdays(price, 2002), 0, base({ rebalance: { mode: 'threshold', threshold: 0.2 } }));
        const b = simulatePlan(weekdays(price, 2002), 0, base({ rebalance: { mode: 'threshold', threshold: 0.2 }, stockRatioSchedule: [] }));
        expect(b).toEqual(a);
        expect(normalizePlan({}).stockRatioSchedule).toEqual([]);
    });

    it('舊分享連結（無時程欄位）視為空陣列', async () => {
        const { fromCompactForTest } = await import('../src/pages/plan/shareLink.js');
        const old = fromCompactForTest({ y: 10, sr: 0.6 });
        expect(normalizePlan(old).stockRatioSchedule).toEqual([]);
        const withSchedule = fromCompactForTest({ y: 10, ss: [{ fy: 3, r: 0.4 }] });
        expect(normalizePlan(withSchedule).stockRatioSchedule).toEqual([{ fromYear: 3, ratio: 0.4 }]);
    });
});

describe('大跌加碼', () => {
    const tiers = [{ drawdown: 0.5, cashPct: 0.3 }, { drawdown: 0.7, cashPct: 0.5 }, { drawdown: 0.8, cashPct: 1 }];
    const dip = over => ({ enabled: true, tiers, recoverAt: 0.3, recoverMonths: 4, ...over });
    const base = over => plan({ initialCapital: 1_000_000, stockRatio: 0.5, ...over });
    const piece = steps => d => steps.findLast(([from]) => d >= from)[1]; // [[起日, 價格], …]
    const reasons = (r, reason) => r.trades.filter(t => t.reason === reason);

    it('回撤達階門檻以當日現金 × 比例加碼，依階序', () => {
        const price = piece([['2000-01-01', 10], ['2000-03-01', 5], ['2000-05-01', 3]]);
        const r = simulatePlan(weekdays(price), 0, base({ dipBuy: dip() }));
        const t = reasons(r, 'dip');
        expect(t).toHaveLength(2);
        expect(t[0]).toMatchObject({ date: '2000-03-01', type: 'buy', shares: 30_000 });        // 現金 50 萬 × 30% ÷ 5
        expect(t[1]).toMatchObject({ date: '2000-05-01', type: 'buy', shares: 58_333 });        // 剩 35 萬 × 50% ÷ 3
    });

    it('同一天連續觸發多階，各階用當下現金', () => {
        const price = piece([['2000-01-01', 10], ['2000-03-01', 2]]);
        const t = reasons(simulatePlan(weekdays(price), 0, base({ dipBuy: dip() })), 'dip');
        expect(t.map(x => x.shares)).toEqual([75_000, 87_500, 87_500]); // 15 萬、17.5 萬、剩 17.5 萬全買，皆 ÷ 2
        expect(new Set(t.map(x => x.date))).toEqual(new Set(['2000-03-01']));
    });

    it('現金不足有多少買多少；現金用完該階仍標記已觸發', () => {
        const price = piece([['2000-01-01', 10], ['2000-03-01', 5], ['2000-04-03', 3]]);
        const flow = [{ name: '入帳', amount: 100_000, period: 'once', month: 5, day: 2, fromYear: 1 }];
        const p = base({ stockRatio: 0.9, cashflows: flow, dipBuy: dip({ tiers: [{ drawdown: 0.5, cashPct: 1 }, { drawdown: 0.7, cashPct: 1 }] }) });
        const r = simulatePlan(weekdays(price), 0, p);
        const t = reasons(r, 'dip');
        expect(t).toHaveLength(1);                          // 第 2 階（4/3）現金已空不買，5/2 入帳也不再觸發
        expect(t[0]).toMatchObject({ date: '2000-03-01', shares: 20_000 }); // 全部現金 10 萬 ÷ 5
        expect(r.daily.find(d => d.date === '2000-05-02').cash).toBe(100_000);
    });

    it('手續費計入加碼買進成本，總支出不超過動用現金', () => {
        const price = piece([['2000-01-01', 10], ['2000-03-01', 5]]);
        const costs = { enabled: true, discount: 1, minFee: 20 };
        const r = simulatePlan(weekdays(price), 0, base({ costs, dipBuy: dip() }));
        const t = reasons(r, 'dip')[0];
        expect(t.cost).toBeGreaterThan(0);
        expect(t.amount + t.cost).toBeLessThanOrEqual(150_000);
    });

    it('回升後每月第一個交易日分月收回，占比回到目標即結束並重置，可再加碼', () => {
        const price = piece([['2000-01-01', 10], ['2000-03-01', 5], ['2000-04-01', 8], ['2000-07-01', 5]]);
        const p = base({ dipBuy: dip({ tiers: [{ drawdown: 0.5, cashPct: 0.5 }] }) });
        const r = simulatePlan(weekdays(price), 0, p);
        expect(reasons(r, 'dip')[0]).toMatchObject({ date: '2000-03-01', shares: 50_000 });  // 25 萬 ÷ 5
        const rec = reasons(r, 'recover');
        expect(rec.map(x => [x.date, x.shares])).toEqual([['2000-04-03', 12_500], ['2000-05-01', 12_500], ['2000-06-01', 9_375]]); // 50,000 ÷ 4；最後一次賣到占比剛好 50%
        expect(reasons(r, 'dip')).toHaveLength(2);                                            // 7 月再跌，新一輪再加碼
        expect(reasons(r, 'dip')[1].date).toBe('2000-07-03');
    });

    it('回撤尚未回升到門檻內不收回；回升後才開始', () => {
        const price = piece([['2000-01-01', 10], ['2000-03-01', 5], ['2000-04-03', 6], ['2000-05-01', 8]]);
        const r = simulatePlan(weekdays(price), 0, base({ dipBuy: dip({ tiers: [{ drawdown: 0.5, cashPct: 0.5 }] }) }));
        expect(reasons(r, 'recover')[0].date).toBe('2000-05-01'); // 4/3 回撤 40% 仍高於 30%
    });

    it('加碼輪期間再平衡只買不賣，結束後恢復', () => {
        const price = piece([['2000-01-01', 10], ['2000-03-01', 5], ['2000-03-15', 8], ['2000-09-01', 40]]);
        const tiersOne = [{ drawdown: 0.5, cashPct: 0.3 }];
        const mk = d => base({ rebalance: { mode: 'threshold', threshold: 0.2 }, dipBuy: d });
        const off = simulatePlan(weekdays(price), 0, mk(dip({ enabled: false, tiers: tiersOne })));
        const on = simulatePlan(weekdays(price), 0, mk(dip({ tiers: tiersOne })));
        expect(reasons(off, 'rebalance').some(t => t.date === '2000-03-15')).toBe(true); // 沒開加碼時 3/15 會再平衡
        const lastRecover = reasons(on, 'recover').at(-1).date;
        expect(reasons(on, 'rebalance').filter(t => t.date >= '2000-03-01' && t.date <= lastRecover)).toHaveLength(0);
        expect(reasons(on, 'rebalance').some(t => t.date > lastRecover)).toBe(true);     // 結束後（9 月大漲）恢復再平衡
    });

    it('加碼輪期間新增現金仍會以再平衡買進（只買不賣）', () => {
        const price = piece([['2000-01-01', 10], ['2000-03-01', 5], ['2000-12-01', 6]]);
        const r = simulatePlan(weekdays(price), 0, base({
            cashflows: [{ amount: 800_000, day: 5 }], rebalance: { mode: 'threshold', threshold: 0.2 },
            dipBuy: dip({ tiers: [{ drawdown: 0.5, cashPct: 0.3 }] })
        }));
        const firstDip = reasons(r, 'dip')[0].date;
        const inRound = reasons(r, 'rebalance').filter(t => t.date > firstDip);
        expect(inRound.length).toBeGreaterThan(0);
        expect(inRound.every(t => t.type === 'buy')).toBe(true);
    });

    it('歷史高點含模擬起點之前', () => {
        const price = piece([['2000-01-01', 10], ['2000-06-01', 5]]);
        const s = weekdays(price);
        const start = s.dates.indexOf('2000-07-03');
        const r = simulatePlan(s, start, base({ dipBuy: dip() }));
        expect(reasons(r, 'dip')[0].date).toBe('2000-07-03'); // 起點價 5 相對先前高點 10 已回撤 50%
    });

    it('關閉（含 tiers 為範例值）結果與現況逐位相同；開啟但未觸發亦相同', () => {
        const price = piece([['2000-01-01', 10], ['2000-03-01', 5], ['2000-05-01', 20]]);
        const p = base({ rebalance: { mode: 'threshold', threshold: 0.2 } });
        const ref = simulatePlan(weekdays(price), 0, p);
        expect(simulatePlan(weekdays(price), 0, { ...p, dipBuy: dip({ enabled: false }) })).toEqual(ref);
        expect(simulatePlan(weekdays(price), 0, { ...p, dipBuy: dip({ tiers: [{ drawdown: 0.9, cashPct: 1 }] }) })).toEqual(ref);
    });

    it('股票比例 0 / 100% 時不作用', () => {
        const price = piece([['2000-01-01', 10], ['2000-03-01', 4]]);
        for (const stockRatio of [0, 1]) {
            const r = simulatePlan(weekdays(price), 0, base({ stockRatio, dipBuy: dip() }));
            expect(reasons(r, 'dip')).toHaveLength(0);
        }
    });

    it('驗證規則', () => {
        const ok = { tiers, recoverAt: 0.3, recoverMonths: 12 };
        expect(validateDipBuy(ok)).toBeNull();
        expect(validateDipBuy({ ...ok, tiers: [] })).toMatchObject({ key: 'tiers' });
        expect(validateDipBuy({ ...ok, tiers: [...tiers, { drawdown: 0.9, cashPct: 1 }] })).toMatchObject({ key: 'tiers' });
        expect(validateDipBuy({ ...ok, tiers: [{ drawdown: 0, cashPct: 0.3 }] })).toMatchObject({ key: 'drawdown', index: 0 });
        expect(validateDipBuy({ ...ok, tiers: [{ drawdown: 1, cashPct: 0.3 }] })).toMatchObject({ key: 'drawdown' });
        expect(validateDipBuy({ ...ok, tiers: [tiers[0], tiers[0]] })).toMatchObject({ key: 'drawdown', index: 1 });
        expect(validateDipBuy({ ...ok, tiers: [{ drawdown: 0.5, cashPct: 1.2 }] })).toMatchObject({ key: 'cashPct' });
        expect(validateDipBuy({ ...ok, recoverAt: 0.5 })).toMatchObject({ key: 'recoverAt' });
        expect(validateDipBuy({ ...ok, recoverAt: -0.1 })).toMatchObject({ key: 'recoverAt' });
        expect(validateDipBuy({ ...ok, recoverMonths: 0 })).toMatchObject({ key: 'recoverMonths' });
        expect(validateDipBuy({ ...ok, recoverMonths: 2.5 })).toMatchObject({ key: 'recoverMonths' });
    });

    it('normalizePlan 預設關閉；分享連結新舊格式相容', async () => {
        const { fromCompactForTest, toCompactForTest } = await import('../src/pages/plan/shareLink.js');
        expect(normalizePlan({}).dipBuy.enabled).toBe(false);
        expect(normalizePlan(fromCompactForTest({ y: 10 })).dipBuy.enabled).toBe(false); // 舊連結缺欄位
        const p = normalizePlan({ dipBuy: dip({ tiers: [{ drawdown: 0.4, cashPct: 0.2 }], recoverMonths: 6 }) });
        const c = toCompactForTest(p);
        expect(c.db.t[0]).toEqual({ d: 0.4, c: 0.2 });
        expect(normalizePlan(fromCompactForTest(c)).dipBuy).toEqual(p.dipBuy);
    });
});

describe('通膨調整', () => {
    const cf = over => ({ name: '', amount: 1000, period: 'monthly', month: 1, day: 5, fromYear: 1, toYear: null, inflation: true, ...over });

    it('flowAmount：起始年不變、之後逐年調整、不同 fromYear', () => {
        expect([1, 2, 3].map(y => flowAmount(cf(), y, 0.1))).toEqual([1000, 1100, 1210]);
        expect([3, 4, 5].map(y => flowAmount(cf({ fromYear: 3 }), y, 0.1))).toEqual([1000, 1100, 1210]);
        expect(flowAmount(cf({ amount: -1000 }), 2, 0.1)).toBe(-1100);
        expect(flowAmount(cf({ amount: 1001 }), 2, 0.02)).toBe(1021); // 1021.02 無條件捨去
        expect(flowAmount(cf({ period: 'yearly', month: 3 }), 3, 0.1)).toBe(1210);
    });

    it('單次 / inflation=false / 通膨率 0 不調整', () => {
        expect(flowAmount(cf({ period: 'once', fromYear: 1 }), 5, 0.1)).toBe(1000);
        expect(flowAmount(cf({ inflation: false }), 3, 0.1)).toBe(1000);
        expect(flowAmount(cf({ inflation: undefined }), 3, 0.1)).toBe(1000);
        expect(flowAmount(cf(), 3, 0)).toBe(1000);
    });

    it('模擬：入帳金額逐年調整，同年各月相同；inflation=false 與 0% 結果逐位相同', () => {
        const s = weekdays(() => 10, 2004);
        const base = rate => ({ years: 3, inflationRate: rate, stockRatio: 0.5, rebalance: { mode: 'none' }, cashflows: [cf({ fromYear: 2 })] });
        const r = simulatePlan(s, 0, plan(base(0.1)));
        const amounts = r.trades.filter(t => t.type === 'flow').map(t => t.amount);
        expect(amounts.slice(0, 12).every(a => a === 1000)).toBe(true); // 第 2 年（起始年）
        expect(amounts.slice(12).every(a => a === 1100)).toBe(true);   // 第 3 年
        const off = simulatePlan(s, 0, plan({ ...base(0.1), cashflows: [cf({ fromYear: 2, inflation: false })] }));
        const zero = simulatePlan(s, 0, plan(base(0)));
        expect(off.final).toBe(zero.final);
        expect(off.invested).toBe(zero.invested);
        expect(off.xirr).toBe(zero.xirr);
        expect(r.invested).toBeGreaterThan(zero.invested);
    });

    it('normalizePlan：舊資料缺欄位視為 0 / false；表單預設 2%', () => {
        expect(DEFAULT_PLAN.inflationRate).toBe(0.02);
        const old = normalizePlan({ cashflows: [{ amount: 5, day: 1 }] });
        expect(old.inflationRate).toBe(0);
        expect(old.cashflows[0].inflation).toBe(false);
        expect(normalizePlan({}).inflationRate).toBe(0);
        const cur = normalizePlan({ inflationRate: 0.03, cashflows: [{ amount: 5, day: 1, inflation: true }] });
        expect(cur.inflationRate).toBe(0.03);
        expect(cur.cashflows[0].inflation).toBe(true);
        expect(normalizePlan(DEFAULT_PLAN).inflationRate).toBe(0.02);
    });

    it('購買力提示：W = 100/(1+r)^N 四捨五入；通膨率 0 不顯示', () => {
        expect(purchasingPowerNote(0.02, 20)).toBe('通膨 2%：20 年後的實質購買力約剩 67%');
        expect(purchasingPowerNote(0.015, 10)).toBe('通膨 1.5%：10 年後的實質購買力約剩 86%');
        expect(purchasingPowerNote(0.025, 30)).toBe('通膨 2.5%：30 年後的實質購買力約剩 48%');
        expect(purchasingPowerNote(0, 20)).toBe('');
    });

    it('分享連結往返與舊連結相容', async () => {
        const { fromCompactForTest, toCompactForTest } = await import('../src/pages/plan/shareLink.js');
        const p = normalizePlan({ inflationRate: 0.025, cashflows: [cf(), cf({ period: 'once', inflation: false })] });
        const c = toCompactForTest(p);
        expect(c.ir).toBe(0.025);
        expect(c.cf[0].inf).toBe(true);
        const back = normalizePlan(fromCompactForTest(c));
        expect(back.inflationRate).toBe(0.025);
        expect(back.cashflows.map(f => f.inflation)).toEqual([true, false]);
        const old = normalizePlan(fromCompactForTest({ y: 10, cf: [{ a: 100, d: 5 }] }));
        expect(old.inflationRate).toBe(0);
        expect(old.cashflows[0].inflation).toBe(false);
    });

    it('驗證：通膨率 0～20%', () => {
        [0, 2, 2.5, 20].forEach(v => expect(validInflationPct(v)).toBe(true));
        [-0.1, 20.1, NaN].forEach(v => expect(validInflationPct(v)).toBe(false));
    });
});
