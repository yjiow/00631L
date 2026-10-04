// core/plan/ 投資計畫模擬測試：大跌加碼（npm test）
import { describe, it, expect } from 'vitest';
import { normalizePlan } from '../src/core/plan/defaults.js';
import { validateDipBuy } from '../src/core/plan/dipBuy.js';
import { simulatePlan } from '../src/core/plan/simulate.js';
import { weekdays, plan } from './helpers/planHelpers.js';

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
