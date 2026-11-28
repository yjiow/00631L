// 推算期標示：上市日常數、起日判斷、遊戲 / 滾動起點的推算占比（npm test）
import { describe, it, expect } from 'vitest';
import { LISTING_631L, LISTING_0050, hasSimulatedPeriod } from '../src/core/marketDates.js';
import { simulatedShare } from '../src/core/trade/series.js';
import { rollingSimShare } from '../src/core/plan/simulatedShare.js';

// 4 個交易日：兩日在上市前、上市日當天與之後
const dates = ['2014-10-29', '2014-10-30', '2014-10-31', '2014-11-03'];
const series = { dates };

describe('hasSimulatedPeriod', () => {
    it('起日早於上市日 = 含推算；等於或晚於 = 不含', () => {
        expect(hasSimulatedPeriod('2000-01-01', LISTING_631L)).toBe(true);
        expect(hasSimulatedPeriod('2014-10-30', LISTING_631L)).toBe(true);
        expect(hasSimulatedPeriod(LISTING_631L, LISTING_631L)).toBe(false);
        expect(hasSimulatedPeriod('2016-01-01', LISTING_631L)).toBe(false);
        expect(hasSimulatedPeriod('2003-06-29', LISTING_0050)).toBe(true);
        expect(hasSimulatedPeriod('2003-06-30', LISTING_0050)).toBe(false);
    });
});

describe('simulatedShare', () => {
    it('全推算 = 1、全真實 = 0', () => {
        expect(simulatedShare(series, 0, 1)).toBe(1);
        expect(simulatedShare(series, 2, 3)).toBe(0);
    });
    it('跨上市日：上市日當天算真實', () => {
        expect(simulatedShare(series, 0, 3)).toBe(0.5);
        expect(simulatedShare(series, 1, 2)).toBe(0.5);
    });
    it('空區間 = 0', () => {
        expect(simulatedShare(series, 3, 2)).toBe(0);
        expect(simulatedShare({ dates: [] }, 0, -1)).toBe(0);
    });
});

describe('rollingSimShare', () => {
    const rs = idxs => idxs.map(startIdx => ({ startIdx }));
    it('全推算 / 全真實 / 跨上市日', () => {
        expect(rollingSimShare(rs([0, 1]), dates)).toEqual({ share: 1, count: 2 });
        expect(rollingSimShare(rs([2, 3]), dates)).toEqual({ share: 0, count: 0 });
        expect(rollingSimShare(rs([0, 1, 2, 3]), dates)).toEqual({ share: 0.5, count: 2 });
    });
    it('可指定上市日（0050 用 2003-06-30）', () => {
        const d = ['2003-06-27', '2003-06-30', '2010-01-04'];
        expect(rollingSimShare(rs([0, 1, 2]), d, '2003-06-30')).toEqual({ share: 1 / 3, count: 1 });
    });
    it('空陣列 = 0', () => {
        expect(rollingSimShare([], dates)).toEqual({ share: 0, count: 0 });
    });
});
