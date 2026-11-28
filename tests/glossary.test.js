import { describe, it, expect } from 'vitest';
import { GLOSSARY, initGlossary } from '../src/ui/glossary.js';

// 最小假 DOM：只實作 initGlossary 用到的部分
function fakeDoc(terms) {
    const doc = {
        createElement: () => {
            const el = { dataset: {}, attrs: {}, listeners: {}, className: '' };
            el.setAttribute = (k, v) => { el.attrs[k] = v; };
            el.addEventListener = (t, f) => { el.listeners[t] = f; };
            return el;
        },
        addEventListener() {}
    };
    const els = terms.map(t => ({
        dataset: { term: t }, textContent: '術語', inserted: [],
        after(b) { this.inserted.push(b); }
    }));
    const root = { ownerDocument: doc, querySelectorAll: () => els };
    return { root, els };
}

describe('GLOSSARY', () => {
    it('9 個 key 皆有非空說明且 ≤ 90 字', () => {
        expect(Object.keys(GLOSSARY).sort()).toEqual(
            ['adjprice', 'lev2x', 'ma', 'mdd', 'rebalance', 'rolling', 'simulated', 'survive', 'xirr']);
        for (const [k, v] of Object.entries(GLOSSARY)) {
            expect(v.trim().length, k).toBeGreaterThan(0);
            expect(v.length, k).toBeLessThanOrEqual(90);
        }
    });
});

describe('initGlossary', () => {
    it('補一顆「?」按鈕，重複呼叫不重複補', () => {
        const { root, els } = fakeDoc(['lev2x']);
        initGlossary(root);
        initGlossary(root);
        expect(els[0].inserted).toHaveLength(1);
        const b = els[0].inserted[0];
        expect(b.className).toBe('term-hint');
        expect(b.textContent).toBe('?');
        expect(b.attrs['aria-expanded']).toBe('false');
        expect(b.attrs['aria-label']).toBe('術語說明');
    });
    it('未知 key 略過', () => {
        const { root, els } = fakeDoc(['nope']);
        initGlossary(root);
        expect(els[0].inserted).toHaveLength(0);
    });
});
