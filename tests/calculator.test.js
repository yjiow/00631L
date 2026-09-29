// calculator.js 純函式測試（npm test）
import { describe, it, expect } from 'vitest';
import { calcBuyHold, calc5050, findMDDPeriod, calcHoldingWinRate } from '../src/core/calculator.js';

const rows = (prices, start = 2000) =>
    prices.map((p, i) => ({ date: `${start + i}-01-03`, t2_close: p }));

describe('calcBuyHold', () => {
    it('以首日為 100 元換算，並累計最大回撤', () => {
        const s = calcBuyHold(rows([10, 20, 10, 30]), 't2_close');
        expect(s.map(d => d.amount)).toEqual([100, 200, 100, 300]);
        expect(s[3].mdd).toBeCloseTo(-50);
    });

    it('略過 null（停止交易日）', () => {
        const r = rows([10, null, 20]);
        expect(calcBuyHold(r, 't2_close').map(d => d.date)).toEqual(['2000-01-03', '2002-01-03']);
    });

    it('全為 null 回傳空陣列', () => {
        expect(calcBuyHold(rows([null, null]), 't2_close')).toEqual([]);
    });
});

describe('calc5050', () => {
    it('股票與現金差距未超過 20% 不再平衡', () => {
        const s = calc5050(rows([10, 11]), 't2_close'); // 股 55、現 50，差 10%
        expect(s[1].stock).toBeCloseTo(55);
        expect(s[1].cash).toBe(50);
    });

    it('差距超過 20% 時兩邊各半', () => {
        const s = calc5050(rows([10, 13]), 't2_close'); // 股 65、現 50，差 30% → 各 57.5
        expect(s[1].stock).toBeCloseTo(57.5);
        expect(s[1].cash).toBeCloseTo(57.5);
        expect(s[1].amount).toBeCloseTo(115);
    });

    it('下跌時計入最大回撤', () => {
        const s = calc5050(rows([10, 5]), 't2_close'); // 股 25 → 再平衡各 37.5，總 75
        expect(s[1].amount).toBeCloseTo(75);
        expect(s[1].mdd).toBeCloseTo(-25);
    });
});

describe('findMDDPeriod', () => {
    it('找出最大回撤的高點與低點日期', () => {
        const s = calcBuyHold(rows([10, 20, 15, 8, 25]), 't2_close');
        expect(findMDDPeriod(s)).toEqual({ peak: '2001-01-03', trough: '2003-01-03' });
    });
});

describe('calcHoldingWinRate', () => {
    // 每年一筆：100 → 200 → 100 → 400
    const series = [100, 200, 100, 400].map((amount, i) => ({ date: `${2000 + i}-01-03`, amount }));

    it('持有 1 年：3 個樣本，2 賺 1 賠', () => {
        const r = calcHoldingWinRate(series, 1);
        expect(r.samples).toBe(3);
        expect(r.winRate).toBeCloseTo(200 / 3);
        expect(r.cagrs).toEqual([-50, 100, 300]);
        expect(r.worst).toBe(-50);
        expect(r.best).toBe(300);
        expect(r.median).toBe(100);
        expect(r.lossMedian).toBe(-50);
    });

    it('無虧損時 lossMedian 為 null', () => {
        const r = calcHoldingWinRate(series, 3); // 100 → 400
        expect(r.samples).toBe(1);
        expect(r.winRate).toBe(100);
        expect(r.lossMedian).toBeNull();
        expect(r.median).toBeCloseTo((Math.pow(4, 1 / 3) - 1) * 100);
    });

    it('區間不足 N 年回傳 null', () => {
        expect(calcHoldingWinRate(series, 5)).toBeNull();
    });
});
