// pages/plan/planDiff.js 方案對照測試（npm test）
import { describe, it, expect } from 'vitest';
import { diffPlans, compareStats, shouldFold, describePlan, FOLD_LIMIT } from '../src/pages/plan/planDiff.js';
import { DEFAULT_PLAN } from '../src/core/plan/defaults.js';

const flow = (name, amount, over = {}) => ({ name, amount, period: 'monthly', month: 1, day: 5, fromYear: 1, toYear: null, inflation: false, ...over });
const base = { ...DEFAULT_PLAN, cashflows: [flow('每月提撥', 3000)] };
const withPlan = over => ({ ...base, ...over });

describe('diffPlans', () => {
    it('無差異回傳空陣列', () => {
        expect(diffPlans(base, structuredClone(base))).toEqual([]);
    });
    it('初始資金', () => {
        const d = diffPlans(base, withPlan({ initialCapital: 2_000_000 }));
        expect(d).toHaveLength(1);
        expect(d[0].text).toBe('初始資金：100 萬 → 200 萬');
    });
    it('股票比例', () => {
        expect(diffPlans(base, withPlan({ stockRatio: 0.8 }))[0].text).toBe('股票比例：50% → 80%');
    });
    it('股票比例時程', () => {
        const d = diffPlans(base, withPlan({ stockRatioSchedule: [{ fromYear: 11, ratio: 0.3 }] }));
        expect(d[0].text).toBe('股票比例時程：無（全程固定比例） → 第 11 年起 30%');
    });
    it('大跌加碼：開啟差異；兩邊都關閉時調整階梯不算差異', () => {
        const on = withPlan({ dipBuy: { ...DEFAULT_PLAN.dipBuy, enabled: true } });
        expect(diffPlans(base, on)[0].label).toBe('大跌加碼');
        const offOther = withPlan({ dipBuy: { ...DEFAULT_PLAN.dipBuy, tiers: [{ drawdown: 0.4, cashPct: 1 }] } });
        expect(diffPlans(base, offOther)).toEqual([]);
    });
    it('現金流金額不同', () => {
        const d = diffPlans(base, withPlan({ cashflows: [flow('每月提撥', 5000)] }));
        expect(d).toHaveLength(1);
        expect(d[0].text).toBe('每月提撥：3,000 → 5,000');
    });
    it('現金流起訖不同顯示完整描述', () => {
        const d = diffPlans(base, withPlan({ cashflows: [flow('每月提撥', 3000, { fromYear: 2 })] }));
        expect(d[0].text).toContain('第 1 年起至期末');
        expect(d[0].text).toContain('第 2 年起至期末');
    });
    it('現金流新增與刪除', () => {
        const d = diffPlans(base, withPlan({ cashflows: [flow('加薪', 1000)] }));
        expect(d.map(x => x.text)).toEqual(['刪除：每月提撥 3,000', '新增：加薪 1,000']);
    });
    it('名稱相同但週期不同視為不同列', () => {
        const d = diffPlans(base, withPlan({ cashflows: [flow('每月提撥', 3000, { period: 'yearly', month: 3 })] }));
        expect(d.map(x => x.text)).toEqual(['刪除：每月提撥 3,000', '新增：每月提撥 3,000']);
    });
    it('通膨率、年數、交易成本不比對', () => {
        expect(diffPlans(base, withPlan({ years: 10, inflationRate: 0.05, cashRate: 0.03, costs: { enabled: false } }))).toEqual([]);
    });
    it('再平衡與定期購買', () => {
        const d = diffPlans(base, withPlan({ rebalance: { ...base.rebalance, mode: 'none' }, purchase: { ...base.purchase, timing: 'monthly', day: 10, mode: 'all' } }));
        expect(d.map(x => x.label)).toEqual(['定期購買', '再平衡']);
    });
});

describe('shouldFold', () => {
    it('超過 5 項才摺疊', () => {
        expect(FOLD_LIMIT).toBe(5);
        expect(shouldFold(new Array(5).fill(0))).toBe(false);
        expect(shouldFold(new Array(6).fill(0))).toBe(true);
    });
});

describe('describePlan', () => {
    it('列出全部參數', () => {
        const lines = describePlan(base);
        expect(lines.map(l => l.label)).toEqual(expect.arrayContaining(['模擬年數', '通膨率', '初始資金', '現金年利率', '交易成本']));
        expect(lines.find(l => l.label === '資料截止').text).toBe('最新');
    });
});

describe('compareStats', () => {
    const r = (startIdx, final, xirr = 0.05, mdd = -20) => ({ startIdx, final, xirr, mdd });
    it('優於起點數、中位 / 最差 / 最佳', () => {
        const a = [r(0, 100), r(1, 200), r(2, 300), r(3, 400)];
        const b = [r(0, 150), r(1, 200), r(2, 250), r(3, 500)];
        const s = compareStats(a, b);
        expect(s.n).toBe(4);
        expect(s.better).toBe(2); // 持平不算優於
        expect(s.betterPct).toBe(0.5);
        expect(s.a).toMatchObject({ worst: 100, best: 400, median: 250 });
        expect(s.b).toMatchObject({ worst: 150, best: 500, median: 225 });
    });
    it('XIRR 與最大回撤中位', () => {
        const s = compareStats([r(0, 1, 0.1, -10), r(1, 1, 0.3, -30), r(2, 1, 0.2, -50)], [r(0, 1, 0.4, -5), r(1, 1, 0.5, -15), r(2, 1, 0.6, -25)]);
        expect(s.a.xirrMedian).toBeCloseTo(0.2);
        expect(s.b.xirrMedian).toBeCloseTo(0.5);
        expect(s.a.mddMedian).toBe(-30);
        expect(s.b.mddMedian).toBe(-15);
    });
    it('只以相同起點配對；無結果回傳 null', () => {
        expect(compareStats([r(0, 1), r(1, 1)], [r(1, 2), r(5, 9)])).toMatchObject({ n: 1, better: 1 });
        expect(compareStats([], [r(0, 1)])).toBeNull();
    });
});
