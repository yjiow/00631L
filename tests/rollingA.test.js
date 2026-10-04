// pages/plan/rollingA.js 滾動分布疊加對照組 A 測試（npm test）
import { describe, it, expect } from 'vitest';
import { aStatRows, aLineData, fmtDelta } from '../src/pages/plan/rollingA.js';

const r = (startIdx, final, xirr = 0.05, brokeDate = null) => ({ startIdx, final, xirr, brokeDate });
const rsA = [r(0, 3_000_000), r(1, 1_000_000), r(2, 0, null, '2010-01-04'), r(3, 2_000_000)];
const rsB = [r(0, 4_000_000, 0.07), r(1, 2_000_000, 0.07), r(2, 500_000, 0.07), r(3, 2_000_000, 0.07)];

describe('fmtDelta', () => {
    it('正負與零', () => {
        expect(fmtDelta(1_500_000, v => `${v}`, () => false)).toEqual({ text: '▲ +1500000', cls: 'positive' });
        expect(fmtDelta(-5, v => `${v}`, () => false)).toEqual({ text: '▼ −5', cls: 'negative' });
        expect(fmtDelta(0.0001, v => v, d => d < 0.001)).toEqual({ text: '—', cls: '' });
    });
});

describe('aStatRows', () => {
    it('A 的各統計值與差異（B−A）', () => {
        const s = aStatRows(rsA, rsB);
        expect(s.success.a).toBe('75%（3/4）');
        expect(s.success.delta).toEqual({ text: '▲ +25.0 pt', cls: 'positive' });
        expect(s.worst.a).toBe('0 元');
        expect(s.worst.delta.text).toBe('▲ +50 萬');
        expect(s.median.a).toBe('100 萬');          // 偶數個取下中位數（100 萬，非平均 150 萬）
        expect(s.median.delta.text).toBe('▲ +100 萬'); // B 中位 200 萬
        expect(s.best.a).toBe('300 萬');
        expect(s.best.delta.text).toBe('▲ +100 萬');
        expect(s.xirr.a).toBe('5.0%');               // xirr null 視為 -1，中位 = 5%
        expect(s.xirr.delta.text).toBe('▲ +2.0 pt');
    });
    it('A = B 時差異皆為 —', () => {
        const s = aStatRows(rsB, rsB);
        for (const k of ['success', 'worst', 'median', 'best', 'xirr']) expect(s[k].delta).toEqual({ text: '—', cls: '' });
    });
});

describe('aLineData', () => {
    it('依時間：以 startIdx 配對，缺少的起點為 null', () => {
        const items = [r(0, 1), r(2, 1), r(9, 1)];
        const d = aLineData(rsA, items, false);
        expect(d.line).toEqual([3_000_000, 0, null]);
        expect(d.median).toBe(1_000_000); // 下中位數
    });
    it('依結果：A 自行由小到大排序，長度不足補 null', () => {
        const d = aLineData(rsA, [r(0, 1), r(1, 1), r(2, 1), r(3, 1), r(4, 1)], true);
        expect(d.line).toEqual([0, 1_000_000, 2_000_000, 3_000_000, null]);
    });
});
