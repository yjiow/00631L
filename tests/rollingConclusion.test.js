import { describe, it, expect } from 'vitest';
import { rollingConclusion } from '../src/pages/plan/rollingConclusion.js';

const fmt = v => `${v}萬`;

describe('rollingConclusion', () => {
    it('全部撐過', () => {
        expect(rollingConclusion({ total: 83, ok: 83, worst: 816, median: 1891, best: 3842 }, fmt))
            .toBe('83 個起點裡 83 次錢都夠用；最差 816萬、中位 1891萬、最好 3842萬');
    });
    it('有斷鏈', () => {
        const s = rollingConclusion({ total: 10, ok: 7, worst: 0, okWorst: 120, median: 500, best: 900 }, fmt);
        expect(s).toContain('10 個起點裡有 3 次資金斷鏈（7 次撐過）');
        expect(s).toContain('撐過的最差 120萬');
        expect(s).toContain('最好 900萬');
    });
    it('全部斷鏈不列金額', () => {
        expect(rollingConclusion({ total: 5, ok: 0, worst: 0, median: 0, best: 0 }, fmt))
            .toBe('5 個起點裡有 5 次資金斷鏈（0 次撐過）');
    });
    it('空結果回傳空字串', () => {
        expect(rollingConclusion({ total: 0, ok: 0, worst: 0, median: 0, best: 0 }, fmt)).toBe('');
    });
});
