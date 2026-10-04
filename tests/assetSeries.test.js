import { describe, it, expect } from 'vitest';
import { assetSeries } from '../src/charts/assetSeries.js';

const mk = (n, f) => Array.from({ length: n }, (_, i) => ({ date: `d${String(i).padStart(4, '0')}`, value: f(i), invested: i }));

describe('assetSeries', () => {
    it('未帶 A 時 a 為 null，其餘為 B 原資料', () => {
        const s = assetSeries(mk(5, i => i * 10));
        expect(s.a).toBeNull();
        expect(s.value).toEqual([0, 10, 20, 30, 40]);
        expect(s.invested).toEqual([0, 1, 2, 3, 4]);
    });
    it('A 依日期對齊，較早中止則之後為 null', () => {
        const s = assetSeries(mk(5, i => i * 10), mk(3, i => i * 7));
        expect(s.a).toEqual([0, 7, 14, null, null]);
    });
    it('降採樣後 A 仍與 B 日期對齊', () => {
        const B = mk(3000, i => i), A = mk(3000, i => i * 2);
        const s = assetSeries(B, A);
        expect(s.labels.length).toBeLessThan(3000);
        expect(s.a.length).toBe(s.labels.length);
        s.labels.forEach((l, k) => expect(s.a[k]).toBe(Number(l.slice(1)) * 2));
    });
});
