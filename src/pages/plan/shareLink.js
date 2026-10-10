/**
 * shareLink.js
 * 分享連結：計畫參數編碼進網址（?view=plan&plan=<編碼>），開啟即帶入
 * 編碼：JSON → 短鍵縮寫（FIELD_MAP，只用於網址，不影響內部參數格式）→ gzip 壓縮（CompressionStream，不支援則略過）→ base64url
 * 讀取端以 normalizePlan（core/plan/defaults.js）補齊缺欄位，相容日後新增參數
 */

import { shareUrl } from '../../ui/shareButton.js';

const TOP_KEYS = { version: 'v', target: 't', years: 'y', initialCapital: 'ic', stockRatio: 'sr', stockRatioSchedule: 'ss', cashflows: 'cf', purchase: 'pu', rebalance: 'rb', costs: 'co', cashRate: 'cr', dipBuy: 'db', inflationRate: 'ir' };
const CF_KEYS = { name: 'n', amount: 'a', period: 'p', month: 'm', day: 'd', fromYear: 'fy', toYear: 'ty', inflation: 'inf' };
const SS_KEYS = { fromYear: 'fy', ratio: 'r' };
const PURCHASE_KEYS = { timing: 'ti', inflowMode: 'im', threshold: 'th', day: 'd', mode: 'mo', amount: 'a' };
const REBALANCE_KEYS = { mode: 'mo', period: 'p', month: 'm', day: 'd', threshold: 'th' };
const COSTS_KEYS = { enabled: 'e', discount: 'di', minFee: 'mf' };
const DIP_KEYS = { enabled: 'e', tiers: 't', recoverAt: 'ra', recoverMonths: 'rm' };
const TIER_KEYS = { drawdown: 'd', cashPct: 'c' };

const invert = map => Object.fromEntries(Object.entries(map).map(([k, v]) => [v, k]));
const remap = (obj, map) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [map[k] ?? k, v]));

function toCompact(plan) {
    return remap({
        ...plan,
        stockRatioSchedule: (plan.stockRatioSchedule ?? []).map(s => remap(s, SS_KEYS)),
        cashflows: plan.cashflows.map(f => remap(f, CF_KEYS)),
        purchase: remap(plan.purchase, PURCHASE_KEYS),
        rebalance: remap(plan.rebalance, REBALANCE_KEYS),
        costs: remap(plan.costs, COSTS_KEYS),
        ...(plan.dipBuy && { dipBuy: remap({ ...plan.dipBuy, tiers: plan.dipBuy.tiers.map(t => remap(t, TIER_KEYS)) }, DIP_KEYS) })
    }, TOP_KEYS);
}

export function fromCompactForTest(c) { return fromCompact(c); }
export function toCompactForTest(p) { return toCompact(p); }
function fromCompact(c) {
    const plan = remap(c, invert(TOP_KEYS));
    if (plan.stockRatioSchedule) plan.stockRatioSchedule = plan.stockRatioSchedule.map(s => remap(s, invert(SS_KEYS)));
    if (plan.cashflows) plan.cashflows = plan.cashflows.map(f => remap(f, invert(CF_KEYS)));
    if (plan.purchase) plan.purchase = remap(plan.purchase, invert(PURCHASE_KEYS));
    if (plan.rebalance) plan.rebalance = remap(plan.rebalance, invert(REBALANCE_KEYS));
    if (plan.costs) plan.costs = remap(plan.costs, invert(COSTS_KEYS));
    if (plan.dipBuy) {
        plan.dipBuy = remap(plan.dipBuy, invert(DIP_KEYS));
        if (plan.dipBuy.tiers) plan.dipBuy.tiers = plan.dipBuy.tiers.map(t => remap(t, invert(TIER_KEYS)));
    }
    return plan;
}

function toBase64Url(bytes) {
    let bin = '';
    bytes.forEach(b => { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str) {
    const b64 = str.replace(/-/g, '+').replace(/_/g, '/').padEnd(str.length + (4 - str.length % 4) % 4, '=');
    return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

// 寫入端不 await、與讀取端同時進行：先等寫完才讀會因串流背壓互等而卡死（分享按鈕無反應）；寫入錯誤會反映在讀取端
async function pipeThrough(bytes, stream) {
    const w = stream.writable.getWriter();
    w.write(bytes).catch(() => {}); w.close().catch(() => {});
    return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}

const gzip = bytes => pipeThrough(bytes, new CompressionStream('gzip'));
const gunzip = bytes => pipeThrough(bytes, new DecompressionStream('gzip'));

export async function buildShareUrl(plan) {
    const raw = new TextEncoder().encode(JSON.stringify(toCompact(plan)));
    const canGzip = typeof CompressionStream !== 'undefined';
    const bytes = canGzip ? await gzip(raw) : raw;
    const url = new URL(location.pathname, location.origin);
    url.searchParams.set('view', 'plan');
    url.searchParams.set('plan', (canGzip ? 'g' : 'r') + toBase64Url(bytes));
    return url.toString();
}

// 進站時讀取網址分享參數；讀到後立即清除網址列，避免重整或之後保存蓋掉
export async function consumeSharedPlan() {
    const raw = new URLSearchParams(location.search).get('plan');
    if (!raw) return null;
    history.replaceState(null, '', location.pathname);
    try {
        const bytes = fromBase64Url(raw.slice(1));
        const json = raw[0] === 'g' ? await gunzip(bytes) : bytes;
        return fromCompact(JSON.parse(new TextDecoder().decode(json)));
    } catch { return null; }
}

export async function sharePlan(plan) {
    return shareUrl(await buildShareUrl(plan), '投資計畫模擬');
}
