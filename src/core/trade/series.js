/**
 * trade/series.js
 * 自主實戰：資料對齊、起始日抽取、圖表視窗（純計算）
 * 價格一律用還原價：t2_close（00631L）、tw50_close（0050）
 */

import { lowerBound, addYears } from '../plan/calendar.js';
import { LISTING_631L } from '../marketDates.js';

export const MIN_START_IDX = 40; // 起始日前至少 40 個交易日（供 20MA）
const MA_DAYS = 20;
export const MA_LEVELS = [{ label: '週', days: 5 }, { label: '月', days: 20 }, { label: '半年', days: 120 }, { label: '年', days: 240 }];

// k 日（含）往前 days 日的均價；不足 days 筆用現有筆數平均
function maAt(prices, k, days) {
    const s = Math.max(0, k - days + 1);
    let sum = 0;
    for (let j = s; j <= k; j++) sum += prices[j];
    return sum / (k - s + 1);
}

// database rows → { dates, p631, p50 }（兩檔皆非 null 的日期才算交易日）
export function buildSeries(rows) {
    const valid = rows.filter(r => r.t2_close != null && r.tw50_close != null);
    return {
        dates: valid.map(r => r.date),
        p631: valid.map(r => r.t2_close),
        p50: valid.map(r => r.tw50_close)
    };
}

// 起始日可抽範圍 [lo, hi]：索引 ≥ 40 且日期 ≤ 最新日往前 3 年；範圍不存在回傳 null
export function startRange(series) {
    const { dates } = series;
    if (!dates.length) return null;
    const limit = addYears(dates[dates.length - 1], -3);
    const lb = lowerBound(dates, limit);
    const hi = dates[lb] === limit ? lb : lb - 1;
    return hi >= MIN_START_IDX ? { lo: MIN_START_IDX, hi } : null;
}

// [startIdx, endIdx] 內日期早於 00631L 上市日（價格為推算值）的交易日占比（0～1）；空區間回傳 0
export function simulatedShare(series, startIdx, endIdx) {
    const n = endIdx - startIdx + 1;
    if (n <= 0) return 0;
    let sim = 0;
    for (let k = startIdx; k <= endIdx; k++) if (series.dates[k] < LISTING_631L) sim++;
    return sim / n;
}

export const POST_LISTING_SHARE = 0.7; // 抽到 00631L 上市後（兩檔 ETF 都已上市、價格為真實值）的機率

// 在 [from, to] 內依 u（0 <= u < 1）均勻取索引
const pickIn = (from, to, u) => from + Math.floor(u * (to - from + 1));

// 隨機抽起始日索引（rand 可注入供測試）；無可用範圍回傳 null
// 單次亂數 u：u < 1 − postShare 落在上市前區段（含推算價格）、其餘落在上市後區段，各段內均勻；某段為空時整段改抽另一段
// u = 0 恆為可抽範圍最小索引、u 趨近 1 恆為最大索引
export function pickStartIdx(series, rand = Math.random, postShare = POST_LISTING_SHARE) {
    const r = startRange(series);
    if (!r) return null;
    const split = Math.min(Math.max(lowerBound(series.dates, LISTING_631L), r.lo), r.hi + 1); // 上市後區段起點
    const u = rand();
    if (split <= r.lo) return pickIn(r.lo, r.hi, u);   // 沒有上市前區段
    if (split > r.hi) return pickIn(r.lo, r.hi, u);    // 沒有上市後區段
    const pre = 1 - postShare;
    return u < pre ? pickIn(r.lo, split - 1, u / pre) : pickIn(split, r.hi, (u - pre) / postShare);
}

// 最近 n 個交易日（含 idx 當天）的價格、5MA（wk）與 20MA（ma）；MA 以更早資料計算，不足筆數用現有筆數平均
export function chartWindow(series, idx, n = 22) {
    const from = Math.max(0, idx - n + 1);
    const out = { p631: [], p50: [], ma631: [], ma50: [], wk631: [], wk50: [] };
    for (let k = from; k <= idx; k++) {
        out.p631.push(series.p631[k]);
        out.p50.push(series.p50[k]);
        out.ma631.push(maAt(series.p631, k, MA_DAYS));
        out.ma50.push(maAt(series.p50, k, MA_DAYS));
        out.wk631.push(maAt(series.p631, k, 5));
        out.wk50.push(maAt(series.p50, k, 5));
    }
    return out;
}

// 現價相對各均線的偏離 %：key 為 'p631' | 'p50'；short = 資料不足該均線天數（以現有筆數平均，僅供參考）
export function maGaps(series, idx, key) {
    const prices = series[key];
    return MA_LEVELS.map(({ label, days }) => ({
        label, days,
        pct: (prices[idx] / maAt(prices, idx, days) - 1) * 100,
        short: idx + 1 < days
    }));
}
