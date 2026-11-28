import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildShareUrl, consumeSharedPlan, sharePlan } from '../src/pages/plan/shareLink.js';
import { DEFAULT_PLAN, normalizePlan } from '../src/core/plan/defaults.js';

// 涵蓋所有可設定欄位的計畫（日後新增參數時，請同步加進此處，確保分享連結往返不遺失）
const FULL_PLAN = normalizePlan({
    years: 13, initialCapital: 2_345_678, stockRatio: 0.35, inflationRate: 0.03, cashRate: 0.015,
    stockRatioSchedule: [{ fromYear: 4, ratio: 0.5 }, { fromYear: 9, ratio: 0.2 }],
    cashflows: [
        { name: '薪水', amount: 30000, period: 'monthly', month: 1, day: 10, fromYear: 1, toYear: 8, inflation: true },
        { name: '年終', amount: 50000, period: 'yearly', month: 2, fromYear: 2, toYear: null, inflation: false },
        { name: '房貸', amount: -12000, period: 'once', month: 6, fromYear: 5, toYear: null, inflation: false }
    ],
    purchase: { timing: 'monthly', inflowMode: 'ratio', threshold: 0.1, day: 12, mode: 'fixed', amount: 8000 },
    rebalance: { mode: 'periodic', period: 'quarterly', month: 3, day: 7, threshold: 0.15 },
    costs: { enabled: false, discount: 0.38, minFee: 5 },
    dipBuy: { enabled: true, tiers: [{ drawdown: 0.4, cashPct: 0.2 }, { drawdown: 0.6, cashPct: 0.6 }], recoverAt: 0.25, recoverMonths: 6 }
});

function setLocation(search = '') {
    vi.stubGlobal('location', { origin: 'http://localhost:5173', pathname: '/', search });
    vi.stubGlobal('history', { replaceState: vi.fn() });
}
const searchOf = url => new URL(url).search;
const withTimeout = (p, ms = 3000) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`逾時 ${ms}ms`)), ms))]);

beforeEach(() => setLocation());
afterEach(() => vi.unstubAllGlobals());

describe('分享連結：編碼 / 解碼', () => {
    it('全欄位計畫往返後完全一致（gzip）', async () => {
        const url = await withTimeout(buildShareUrl(FULL_PLAN));
        expect(new URL(url).searchParams.get('view')).toBe('plan');
        expect(new URL(url).searchParams.get('plan')[0]).toBe('g');
        setLocation(searchOf(url));
        expect(normalizePlan(await consumeSharedPlan())).toEqual(FULL_PLAN);
    });

    it('預設計畫往返一致', async () => {
        const url = await withTimeout(buildShareUrl(normalizePlan(DEFAULT_PLAN)));
        setLocation(searchOf(url));
        expect(normalizePlan(await consumeSharedPlan())).toEqual(normalizePlan(DEFAULT_PLAN));
    });

    it('不支援 CompressionStream 時改用未壓縮（r 前綴）仍可往返', async () => {
        vi.stubGlobal('CompressionStream', undefined);
        const url = await withTimeout(buildShareUrl(FULL_PLAN));
        expect(new URL(url).searchParams.get('plan')[0]).toBe('r');
        setLocation(searchOf(url));
        expect(normalizePlan(await consumeSharedPlan())).toEqual(FULL_PLAN);
    });

    it('連結長度合理（全欄位計畫 < 900 字元）', async () => {
        expect((await buildShareUrl(FULL_PLAN)).length).toBeLessThan(900);
    });

    it('缺欄位的舊連結（手工組成只有 v、y）經 normalizePlan 補預設值', async () => {
        const payload = Buffer.from(JSON.stringify({ v: 1, y: 7 })).toString('base64url');
        setLocation('?view=plan&plan=r' + payload);
        const plan = normalizePlan(await consumeSharedPlan());
        expect(plan.years).toBe(7);
        expect(plan.initialCapital).toBe(DEFAULT_PLAN.initialCapital);
        expect(plan.cashflows).toEqual(normalizePlan().cashflows);
    });
});

describe('分享連結：讀取', () => {
    it('網址沒有 plan 參數 → null，且不動網址列', async () => {
        expect(await consumeSharedPlan()).toBeNull();
        expect(history.replaceState).not.toHaveBeenCalled();
    });

    it('讀到後立即清除 plan 參數（避免重整或之後保存蓋掉），保留 ?view=plan', async () => {
        const url = await buildShareUrl(FULL_PLAN);
        setLocation(searchOf(url));
        await consumeSharedPlan();
        expect(history.replaceState).toHaveBeenCalledWith(null, '', '/?view=plan');
    });

    it('亂碼 / 損毀的連結 → null，不拋錯', async () => {
        for (const bad of ['gXXXXnot-a-gzip', 'r!!!', 'g', 'rZm9v']) {
            setLocation('?view=plan&plan=' + bad);
            expect(await withTimeout(consumeSharedPlan())).toBeNull();
        }
    });
});

describe('分享：iPhone Safari 要求在點擊當下同步呼叫 navigator.share', () => {
    it('有預先產生的連結 → 同步呼叫系統分享（不先 await）', async () => {
        const share = vi.fn().mockResolvedValue();
        vi.stubGlobal('navigator', { share, clipboard: { writeText: vi.fn() } });
        const p = sharePlan(FULL_PLAN, 'http://localhost:5173/?view=plan&plan=gAAA');
        expect(share).toHaveBeenCalledTimes(1); // 尚未 await 就已呼叫
        expect(share.mock.calls[0][0].url).toBe('http://localhost:5173/?view=plan&plan=gAAA');
        expect((await p).status).toBe('shared');
    });

    it('沒有預先連結 → 需先壓縮產生（非同步），之後才呼叫系統分享', async () => {
        const share = vi.fn().mockResolvedValue();
        vi.stubGlobal('navigator', { share, clipboard: { writeText: vi.fn() } });
        const p = sharePlan(FULL_PLAN);
        expect(share).not.toHaveBeenCalled(); // 這條路在 iPhone 會因失去手勢而被拒，故 plan.js 一律預先產生
        expect((await p).status).toBe('shared');
        expect(share).toHaveBeenCalledTimes(1);
    });
});
