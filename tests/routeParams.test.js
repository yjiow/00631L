import { describe, it, expect } from 'vitest';
import { parseView, viewUrl } from '../src/ui/routeParams.js';

describe('parseView', () => {
    it('合法值原樣回傳', () => {
        for (const v of ['home', 'plan', 'trade', 'about']) expect(parseView(`?view=${v}`)).toBe(v);
    });
    it('非法值、空值、缺參數 → home', () => {
        for (const s of ['?view=xxx', '?view=', '?view=Plan', '', '?', '?foo=1']) expect(parseView(s)).toBe('home');
    });
    it('帶 plan= 但缺 view 或 view 非法的舊式連結 → plan', () => {
        expect(parseView('?plan=gAAA')).toBe('plan');
        expect(parseView('?view=xxx&plan=gAAA')).toBe('plan');
    });
    it('含其他參數仍可解析', () => {
        expect(parseView('?plan=gAAA&view=plan')).toBe('plan');
        expect(parseView('?view=trade&x=1')).toBe('trade');
    });
});

describe('viewUrl', () => {
    it('產生 ?view=<view>', () => {
        expect(viewUrl('about')).toBe('?view=about');
    });
});
