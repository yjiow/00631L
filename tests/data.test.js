// public/data/*.json 資料檢查（npm test）：自動更新或重建後防止壞資料上線
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { normalizePlan } from '../src/core/plan/defaults.js';
import { simulatePlan, toSeries } from '../src/core/plan/simulate.js';
import { summarizePlan } from '../src/pages/plan/planCases.js';

const load = code => JSON.parse(readFileSync(new URL(`../public/data/${code}.json`, import.meta.url)));

// 單日還原漲跌幅上限：台股漲跌停 10%，00631L 為 2 倍；留少許緩衝
const LIMITS = { '0050': 0.11, '00631L': 0.22 };

describe.each(Object.keys(LIMITS))('%s.json', code => {
    const rows = load(code);

    it('欄位完整、數值為正', () => {
        for (const r of rows) {
            expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
            expect(r.close).toBeGreaterThan(0);
            expect(r.adjClose).toBeGreaterThan(0);
        }
    });

    it('日期由舊到新、無重複', () => {
        for (let i = 1; i < rows.length; i++) expect(rows[i].date > rows[i - 1].date).toBe(true);
    });

    it('最新一日 adjClose = close', () => {
        const last = rows.at(-1);
        expect(last.adjClose).toBeCloseTo(last.close, 6);
    });

    it('simulated 只出現在上市前的連續開頭', () => {
        const firstReal = rows.findIndex(r => !r.simulated);
        expect(rows.slice(firstReal).some(r => r.simulated)).toBe(false);
    });

    it(`單日還原漲跌幅不超過 ±${LIMITS[code] * 100}%`, () => {
        const bad = [];
        for (let i = 1; i < rows.length; i++) {
            const pct = rows[i].adjClose / rows[i - 1].adjClose - 1;
            if (Math.abs(pct) > LIMITS[code]) bad.push(`${rows[i].date} ${(pct * 100).toFixed(2)}%`);
        }
        expect(bad).toEqual([]);
    });
});

describe('cases.json', () => {
    const cases = load('cases');
    const rows = load('00631L').map(r => ({ ...r, t2_close: r.adjClose }));
    const series = toSeries(rows, 't2_close');

    it('必填欄位齊全、id 唯一', () => {
        for (const c of cases) {
            for (const k of ['id', 'title', 'author', 'desc']) expect(typeof c[k]).toBe('string');
            for (const k of ['id', 'title', 'author', 'desc']) expect(c[k].length).toBeGreaterThan(0);
            expect(typeof c.plan).toBe('object');
        }
        expect(new Set(cases.map(c => c.id)).size).toBe(cases.length);
    });

    it('每個 plan 可模擬、可產生摘要', () => {
        for (const c of cases) {
            const res = simulatePlan(series, 0, normalizePlan(c.plan));
            expect(res, c.id).not.toBeNull();
            expect(summarizePlan(c.plan)).toMatch(/^初始/);
        }
    });
});
