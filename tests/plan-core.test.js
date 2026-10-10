// core/plan/ 投資計畫模擬測試：核心模擬、日曆、費用、XIRR、再平衡、年度摘要（npm test）
import { describe, it, expect } from 'vitest';
import { targetDate, monthsFrom } from '../src/core/plan/calendar.js';
import { tradeCost } from '../src/core/plan/fees.js';
import { Account } from '../src/core/plan/account.js';
import { normalizePlan } from '../src/core/plan/defaults.js';
import { xirr } from '../src/core/plan/xirr.js';
import { drifted, triggerRange } from '../src/core/plan/rebalance.js';
import { simulatePlan, simulateRolling, toSeries } from '../src/core/plan/simulate.js';
import { yearlySummary } from '../src/core/plan/summary.js';
import { formatMoney, parseMoney } from '../src/ui/moneyInput.js';
import { weekdays, NO_COST, plan } from './helpers/planHelpers.js';

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

    // 現金利息（日積數法）：6/21、12/21 與期末結息入帳並記 interest 交易；期間不複利
    describe('現金利息', () => {
        const cashPlan = over => plan({ initialCapital: 365_000, stockRatio: 0, cashRate: 0.1, ...over });
        const interests = r => r.trades.filter(t => t.type === 'interest');

        it('6/21、12/21 與期末各結息一次，金額為日積數、期間不複利', () => {
            const r = simulatePlan(weekdays(), 0, cashPlan());
            const its = interests(r);
            expect(its.map(t => t.date)).toEqual(['2000-06-21', '2000-12-21', '2001-01-03']);
            expect(its[0].amount).toBeCloseTo(365_000 * 0.1 * 170 / 365); // 1/3 → 6/21 共 170 天，期間用本金計、不複利
            const c2 = 365_000 + its[0].amount;
            expect(its[1].amount).toBeCloseTo(c2 * 0.1 * 183 / 365);       // 入帳後才滾入下一期本金
            const c3 = c2 + its[1].amount;
            expect(its[2].amount).toBeCloseTo(c3 * 0.1 * 13 / 365);        // 期末：12/21 → 1/3 未入帳的利息結入
            expect(r.final).toBeCloseTo(c3 + its[2].amount);
            expect(its[0]).toMatchObject({ shares: 0, cost: 0 });
            // 期間內每日現金不變（尚未入帳）
            expect(r.daily.find(d => d.date === '2000-06-20').cash).toBe(365_000);
            expect(r.daily.find(d => d.date === '2000-06-21').cash).toBeCloseTo(365_000 + its[0].amount);
        });

        it('結息日非交易日順延至其後第一個交易日', () => {
            const s = weekdays(undefined, 2001);
            const keep = s.dates.map((d, i) => d !== '2000-06-21' ? i : -1).filter(i => i >= 0);
            const series = { dates: keep.map(i => s.dates[i]), prices: keep.map(i => s.prices[i]) };
            const its = interests(simulatePlan(series, 0, cashPlan()));
            expect(its[0].date).toBe('2000-06-22');
            expect(its[0].amount).toBeCloseTo(365_000 * 0.1 * 171 / 365);
        });

        it('cashRate 為 0 不產生利息列；利息不計入投入本金 / XIRR 現金流', () => {
            const r0 = simulatePlan(weekdays(), 0, cashPlan({ cashRate: 0 }));
            expect(interests(r0)).toHaveLength(0);
            expect(r0.final).toBe(365_000);
            const r = simulatePlan(weekdays(), 0, cashPlan());
            expect(r.invested).toBe(365_000);
            expect(r.xirr).toBeCloseTo(r.final / 365_000 - 1, 2); // 只有期初投入與期末資產，約一年期
            expect(r.xirr).toBeGreaterThan(0.1);                  // 年中結息後再計息，年化略高於 10%
        });

        it('現金為 0 不產生利息列', () => {
            const r = simulatePlan(weekdays(), 0, plan({ initialCapital: 1000, stockRatio: 1, cashRate: 0.1 }));
            expect(interests(r)).toHaveLength(0);
        });

        it('detail:false 與 detail:true 的結果一致', () => {
            const p = cashPlan({ cashflows: [{ amount: 1000, day: 5 }], purchase: { timing: 'none' } });
            expect(simulatePlan(weekdays(), 0, p, { detail: false }).final).toBe(simulatePlan(weekdays(), 0, p).final);
        });
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
