// core/trade/ 自主實戰核心測試：資料對齊、操作規則、對照組、結算、存檔重播、與計畫頁引擎逐位比對（npm test）
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildSeries, pickStartIdx, startRange, chartWindow, maGaps } from '../src/core/trade/series.js';
import { createGame, toSave, replay } from '../src/core/trade/game.js';
import { tradeCost } from '../src/core/plan/fees.js';
import { simulatePlan, toSeries } from '../src/core/plan/simulate.js';
import { daysBetween, addYears } from '../src/core/plan/calendar.js';
import { weekdays, NO_COST } from './helpers/planHelpers.js';

const COSTS = { enabled: true, discount: 0.6, minFee: 1 };

// 同 database.js 的 loadAll：adjClose 還原價、兩檔日期聯集
function loadRows() {
    const read = f => JSON.parse(readFileSync(new URL(`../public/data/${f}.json`, import.meta.url)));
    const t2 = new Map(read('00631L').map(r => [r.date, r.adjClose]));
    const tw = new Map(read('0050').map(r => [r.date, r.adjClose]));
    return [...new Set([...t2.keys(), ...tw.keys()])].sort()
        .map(date => ({ date, t2_close: t2.get(date) ?? null, tw50_close: tw.get(date) ?? null }));
}
const rows = loadRows();
const real = buildSeries(rows);

// 合成資料：平日交易、兩檔價格由函式決定
function synth(p631 = () => 10, p50 = () => 10, endYear = 2001) {
    const { dates } = weekdays(() => 1, endYear);
    return { dates, p631: dates.map(p631), p50: dates.map(p50) };
}
const G = (series, idx = 0, over = {}) => createGame(series, idx, { initial: 1_000_000, costs: NO_COST, ...over });

describe('series', () => {
    it('buildSeries 只留兩檔皆非 null 的日期', () => {
        const s = buildSeries([
            { date: '2000-01-03', t2_close: 1, tw50_close: 2 },
            { date: '2000-01-04', t2_close: null, tw50_close: 2 },
            { date: '2000-01-05', t2_close: 3, tw50_close: null },
            { date: '2000-01-06', t2_close: 4, tw50_close: 5 }
        ]);
        expect(s).toEqual({ dates: ['2000-01-03', '2000-01-06'], p631: [1, 4], p50: [2, 5] });
    });

    it('pickStartIdx 多次抽樣皆在範圍內，邊界值正確', () => {
        const { lo, hi } = startRange(real);
        expect(lo).toBe(40);
        expect(real.dates[hi] <= addYears(real.dates.at(-1), -3)).toBe(true);
        expect(real.dates[hi + 1] > addYears(real.dates.at(-1), -3)).toBe(true);
        for (let i = 0; i < 500; i++) {
            const k = pickStartIdx(real);
            expect(k).toBeGreaterThanOrEqual(lo);
            expect(k).toBeLessThanOrEqual(hi);
        }
        expect(pickStartIdx(real, () => 0)).toBe(lo);
        expect(pickStartIdx(real, () => 0.9999999)).toBe(hi);
    });

    it('資料太短時 pickStartIdx 回 null', () => {
        expect(pickStartIdx(synth())).toBeNull();
    });

    it('chartWindow：22 日含當天，20MA 用更早資料；不足 20 筆用現有平均', () => {
        const s = synth();
        s.p631 = s.dates.map((_, i) => i + 1);
        s.p50 = s.dates.map(() => 5);
        const w = chartWindow(s, 50);
        expect(w.p631.length).toBe(22);
        expect(w.p631.at(-1)).toBe(51);
        expect(w.ma631.at(-1)).toBeCloseTo((32 + 51) / 2); // 第 32~51 個價格平均
        expect(w.ma50.every(v => v === 5)).toBe(true);
        const e = chartWindow(s, 2);
        expect(e.p631).toEqual([1, 2, 3]);
        expect(e.ma631).toEqual([1, 1.5, 2]);
    });

    it('chartWindow 5MA 與 maGaps：週 / 月 / 半年 / 年偏離 %，資料不足標 short', () => {
        const s = synth();
        s.p631 = s.dates.map((_, i) => i + 1);
        s.p50 = s.dates.map(() => 5);
        const w = chartWindow(s, 50);
        expect(w.wk631.at(-1)).toBeCloseTo((47 + 48 + 49 + 50 + 51) / 5);
        const g = maGaps(s, 50, 'p631');
        expect(g.map(x => x.label)).toEqual(['週', '月', '半年', '年']);
        expect(g[0].pct).toBeCloseTo((51 / 49 - 1) * 100, 6);
        expect(g[1].pct).toBeCloseTo((51 / ((32 + 51) / 2) - 1) * 100, 6);
        expect(g[0].short).toBe(false);
        expect(g[1].short).toBe(false);
        expect(g[2].short).toBe(true); // 51 筆 < 120
        expect(g[3].short).toBe(true);
        expect(maGaps(s, 50, 'p50').every(x => x.pct === 0)).toBe(true);
    });
});

describe('createGame 與每日流程', () => {
    it('第 1 天操作前兩組皆全現金，操作後對照組才建立 50/50', () => {
        const g = G(synth());
        expect(g.snapshot().b.shares631).toBe(0);
        expect(g.snapshot().b.cash).toBe(1_000_000);
        expect(g.act({}, 1).ok).toBe(true);
        g.snapshot(); // 操作當天（第 1 天）對照組已建立
        const first = g.history[0];
        expect(first.b).toBe(1_000_000);
        const { a, b } = g.snapshot();
        expect(g.day).toBe(2);
        expect(b.shares631).toBe(50000);
        expect(b.cash).toBe(500000);
        expect(b.value).toBe(1_000_000);
        expect(a.cash).toBe(1_000_000);
        expect(a.invested).toBe(1_000_000);
        expect(b.invested).toBe(1_000_000);
    });

    it('現金利息：日積數法，跨 6/21 結息入帳', () => {
        const s = synth();
        const g = G(s);
        let guard = 0;
        while (s.dates[g.idx] < '2000-06-21' && guard++ < 500) g.act({}, 1);
        expect(s.dates[g.idx]).toBe('2000-06-21');
        const days = daysBetween(s.dates[0], '2000-06-21');
        expect(g.snapshot().a.cash).toBeCloseTo(1_000_000 + 1_000_000 * 0.01 * days / 365, 6);
    });

    it('手續費與 tradeCost 一致、統計累計', () => {
        const g = G(synth(() => 100, () => 50), 0, { costs: COSTS });
        expect(g.act({ buy631: 100 }).ok).toBe(true);
        let a = g.snapshot().a;
        expect(a.cash).toBe(1_000_000 - 10000 - tradeCost(10000, 'buy', COSTS));
        expect(a.costTotal).toBe(tradeCost(10000, 'buy', COSTS));
        expect(a.tradeCount).toBe(1);
        const cash0 = g.snapshot().a.cash;
        // 以不含利息的比較：當天價格不變，下一天利息另計，故用同一天操作
        const g2 = G(synth(() => 100, () => 50), 0, { costs: COSTS });
        g2.act({ buy50: 200 }, 1);
        const c = g2.snapshot().a;
        expect(c.shares50).toBe(200);
        expect(c.tradeCount).toBe(1);
        expect(cash0).toBeLessThan(1_000_000);
        // 同日賣出：+金額−費−稅
        const g3 = G(synth(() => 100, () => 50), 0, { costs: COSTS });
        g3.act({ buy631: 100 }, 1);
        const before = g3.snapshot().a.cash;
        g3.act({ sell631: 100 }, 1);
        const sellNet = 10000 - tradeCost(10000, 'sell', COSTS);
        expect(g3.snapshot().a.cash - before).toBeCloseTo(sellNet, 2); // 兩日間僅有微量利息
        expect(g3.snapshot().a.tradeCount).toBe(2);
    });

    it('操作順序：賣出 → 加減碼 → 買進（同日賣出所得可用於買進）', () => {
        const g = G(synth());
        g.act({ buy50: 100000 }, 1); // 全數買進 0050
        expect(g.snapshot().a.cash).toBeCloseTo(0, 6);
        // 現金幾乎為 0：賣 0050 後買 00631L（利息使現金略多）
        expect(g.act({ sell50: 1000, buy631: 1000 }).ok).toBe(true);
        expect(g.snapshot().a.shares631).toBe(1000);
    });

    it('拒絕：現金不足 / 賣超過持股 / 負現金；狀態不變', () => {
        const g = G(synth(() => 10, () => 10), 0, { costs: COSTS });
        const snap = () => JSON.stringify([g.snapshot(), g.history, g.decisions, g.day, g.settled]);
        const base = snap();
        const r1 = g.act({ buy631: 100001 });
        expect(r1.ok).toBe(false); expect(r1.error).toMatch(/現金不足/);
        expect(g.act({ sell631: 1 }).ok).toBe(false);
        expect(g.act({ sell50: 1 }).error).toMatch(/超過持股/);
        expect(g.act({ cash: -1_000_001 }).error).toMatch(/超過現金/);
        expect(g.act({ buy631: 100000 }).ok).toBe(false); // 全額買進但手續費不夠
        expect(g.act({ buy631: -1 }).ok).toBe(false);
        expect(g.act({ cash: 1.5 }).ok).toBe(false);
        expect(g.act({}, 0).ok).toBe(false);
        expect(snap()).toBe(base);
    });

    it('對照組：加碼達門檻再平衡，減碼賣股補足', () => {
        const g = G(synth());
        g.act({ cash: 400_000 }, 1); // 現金 500k → 900k，股 500k：偏離 > 20% → 再平衡
        let b = g.snapshot().b;
        expect(b.invested).toBe(1_400_000);
        expect(b.shares631).toBe(70000);
        g.act({ cash: -800_000 }, 1); // 現金不足，賣股補足
        b = g.snapshot().b;
        expect(b.broke).toBe(false);
        expect(b.invested).toBe(600_000);
        expect(b.cash).toBeGreaterThanOrEqual(0);
        expect(b.value).toBeCloseTo(600_000, 0);
    });

    it('對照組：資金斷鏈後價值固定 0 且不再運作', () => {
        const g = G(synth(), 0, { costs: COSTS });
        expect(g.act({}, 1).ok).toBe(true); // 第 1 天對照組建立 50/50（含手續費）
        expect(g.act({ cash: -1_000_000 }, 1).ok).toBe(true); // 操作者現金剛好夠，對照組扣完費用後不足
        const { a, b } = g.snapshot();
        expect(a.cash).toBeCloseTo(0, 0);
        expect(b.broke).toBe(true);
        expect(b.value).toBe(0);
        g.act({}, 5);
        expect(g.snapshot().b.value).toBe(0);
        expect(g.snapshot().b.broke).toBe(true);
        expect(g.history.every((h, i) => i === 0 || h.b === 0)).toBe(true);
    });

    it('指標：ret / mdd / stockRatio', () => {
        const s = synth(d => (d < '2000-02-01' ? 10 : 5));
        const g = G(s);
        g.act({ buy631: 100000 }, 1);
        expect(g.snapshot().a.stockRatio).toBeCloseTo(1, 6);
        while (!g.settled && g.date < '2000-02-02') g.act({}, 1);
        const a = g.snapshot().a;
        expect(a.mdd).toBeCloseTo(-50, 0);
        expect(a.ret).toBeCloseTo(a.profit / a.invested, 10);
        const z = G(s, 0, { initial: 0 });
        expect(z.snapshot().a.ret).toBeNull();
        expect(z.snapshot().a.stockRatio).toBe(0);
    });

    it('到資料末自動結算、結算後鎖定', () => {
        const s = synth(() => 10, () => 10, 2000);
        const g = G(s);
        g.act({}, 99999);
        expect(g.finished).toBe(true);
        expect(g.settled).toBe(true);
        expect(g.endIdx).toBe(s.dates.length - 1);
        const before = JSON.stringify(g.snapshot());
        expect(g.act({ cash: 1 }).ok).toBe(false);
        g.settle();
        expect(JSON.stringify(g.snapshot())).toBe(before);
    });

    it('settle()：隨時結算，結入未入帳利息並鎖定', () => {
        const s = synth();
        const g = G(s);
        g.act({}, 10);
        const cashBefore = g.snapshot().a.cash;
        g.settle();
        expect(g.settled).toBe(true);
        expect(g.finished).toBe(false);
        expect(g.endIdx).toBe(g.idx);
        expect(g.snapshot().a.cash).toBeGreaterThan(cashBefore);
        expect(g.act({}).ok).toBe(false);
    });
});

describe('存檔重播', () => {
    it('資料末被夾住的 skip 存實際推進天數；無法重現的決策回 null', () => {
        const s = synth();
        const g = G(s, s.dates.length - 5, { costs: COSTS });
        expect(g.act({}, 30).ok).toBe(true);
        expect(g.settled).toBe(true);
        const save = toSave(g);
        expect(save.decisions[0].skip).toBe(4);
        expect(replay(s, save).snapshot()).toEqual(g.snapshot());
        const bad = { ...save, decisions: [{ ...save.decisions[0], sell631: 1 }] };
        expect(replay(s, bad)).toBeNull();
    });


    it('重播結果與原遊戲逐位相同（含結算）', () => {
        const startIdx = 300;
        const g = createGame(real, startIdx, { initial: 1_000_000, costs: COSTS });
        g.act({ buy50: 500 }, 3);
        g.act({ cash: 200_000, buy631: 1000 }, 7);
        g.act({ sell50: 100, cash: -50_000 }, 1);
        expect(g.act({ sell631: 999999 }).ok).toBe(false); // 被拒絕，不入決策
        g.act({}, 120);
        g.settle();
        const save = toSave(g);
        expect(save.decisions.length).toBe(4);
        expect(save).toMatchObject({ v: 1, startDate: real.dates[startIdx], initial: 1_000_000, discount: 0.6, minFee: 1, settled: true, endDate: real.dates[g.endIdx] });
        const g2 = replay(real, JSON.parse(JSON.stringify(save)));
        expect(g2.snapshot()).toEqual(g.snapshot());
        expect(g2.history).toEqual(g.history);
        expect(toSave(g2)).toEqual(save);
    });

    it('未結算存檔重播一致；找不到起始日回 null', () => {
        const g = createGame(real, 100, { initial: 500_000, costs: COSTS });
        g.act({ buy631: 300, cash: 10_000 }, 5);
        g.act({ buy50: 100 }, 2);
        const g2 = replay(real, toSave(g));
        expect(g2.settled).toBe(false);
        expect(g2.idx).toBe(g.idx);
        expect(g2.snapshot()).toEqual(g.snapshot());
        expect(g2.history).toEqual(g.history);
        expect(replay(real, { ...toSave(g), startDate: '1900-01-01' })).toBeNull();
    });
});

describe('對照組 vs 計畫頁引擎（真實資料逐位比對）', () => {
    const series631 = toSeries(rows, 't2_close');
    // 真實資料 2025/06 起 0050 有缺日（00631L 單獨有價），兩序列僅在比對區間（前段）一致
    const common = series631.dates.findIndex((d, i) => d !== real.dates[i]);
    it('比對區間內兩序列日期一致', () => {
        expect(common).toBeGreaterThan(5000);
    });

    // 最後一天（endIdx）計畫頁於期末結入利息、遊戲於「非資料末」不結入，故排除計畫頁最後一筆
    for (const [startIdx, years] of [[100, 2], [2500, 3]]) {
        it(`起始 idx ${startIdx}，${years} 年（≥ 400 個交易日）逐日相等`, () => {
            const plan = simulatePlan(series631, startIdx, {
                initialCapital: 1_000_000, years, stockRatio: 0.5, cashflows: [],
                purchase: { timing: 'none' }, rebalance: { mode: 'threshold', threshold: 0.2 },
                costs: COSTS, cashRate: 0.01
            });
            const g = createGame(real, startIdx, { initial: 1_000_000, costs: COSTS });
            const endIdx = startIdx + plan.daily.length - 1;
            while (g.idx < endIdx) g.act({}, 1);
            expect(plan.daily.length).toBeGreaterThanOrEqual(400);
            expect(endIdx).toBeLessThan(common);
            for (let k = 0; k < plan.daily.length - 1; k++) {
                expect(g.history[k].b).toBe(plan.daily[k].value);
            }
            expect(g.history.length).toBe(plan.daily.length);
        });
    }

    it('跳過多天與逐日推進結果相同', () => {
        const a = createGame(real, 500, { initial: 1_000_000, costs: COSTS });
        const b = createGame(real, 500, { initial: 1_000_000, costs: COSTS });
        a.act({}, 250);
        for (let i = 0; i < 250; i++) b.act({}, 1);
        expect(a.history).toEqual(b.history);
        expect(a.snapshot()).toEqual(b.snapshot());
    });
});
