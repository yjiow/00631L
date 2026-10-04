// core/plan/ 投資計畫模擬測試：通膨調整（npm test）
import { describe, it, expect } from 'vitest';
import { normalizePlan, DEFAULT_PLAN } from '../src/core/plan/defaults.js';
import { xirr } from '../src/core/plan/xirr.js';
import { simulatePlan } from '../src/core/plan/simulate.js';
import { flowAmount, purchasingPowerNote, validInflationPct } from '../src/core/plan/inflation.js';
import { weekdays, plan } from './helpers/planHelpers.js';

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
