// core/plan/ 投資計畫模擬測試：股票比例時程（npm test）
import { describe, it, expect } from 'vitest';
import { normalizePlan } from '../src/core/plan/defaults.js';
import { simulatePlan } from '../src/core/plan/simulate.js';
import { weekdays, plan } from './helpers/planHelpers.js';

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
