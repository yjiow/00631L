/**
 * rollingA.js
 * 滾動起點分布疊加對照組 A（純函式，不依賴 DOM）：統計卡的 A 行資料、長條圖的 A 折線資料
 */
import { fmtMoney, fmtRate } from './planFormat.js';
import { median } from './planDiff.js';

const pt = v => (v * 100).toFixed(1) + ' pt';
const isZeroPt = d => +(d * 100).toFixed(1) === 0;
const isZeroMoney = d => Math.abs(d) < 0.5;

// 差異（B − A）→ { text, cls }：▲ +x / ▼ −x，0 為「—」；cls 為 positive（紅）/ negative（綠）/ ''（同方案對照表慣例）
export function fmtDelta(d, fmtAbs, zero) {
    if (!d || zero(d)) return { text: '—', cls: '' };
    return { text: `${d > 0 ? '▲ +' : '▼ −'}${fmtAbs(Math.abs(d))}`, cls: d > 0 ? 'positive' : 'negative' };
}

// 五張統計卡的 A 行：回傳 { success, worst, median, best, xirr }，各為 { a: A 值文字, delta: { text, cls } }
// rsA / rsB：simulateRolling 結果（皆非空）
export function aStatRows(rsA, rsB) {
    const okRate = rs => rs.filter(r => !r.brokeDate).length / rs.length;
    const finals = rs => rs.map(r => r.final);
    const xirrMed = rs => median(rs.map(r => r.xirr ?? -1));
    const ok = rs => rs.filter(r => !r.brokeDate).length;
    const money = (a, b) => ({ a: fmtMoney(a), delta: fmtDelta(b - a, fmtMoney, isZeroMoney) });
    return {
        success: {
            a: `${(okRate(rsA) * 100).toFixed(0)}%（${ok(rsA)}/${rsA.length}）`,
            delta: fmtDelta(okRate(rsB) - okRate(rsA), pt, isZeroPt)
        },
        worst: money(Math.min(...finals(rsA)), Math.min(...finals(rsB))),
        median: money(median(finals(rsA)), median(finals(rsB))),
        best: money(Math.max(...finals(rsA)), Math.max(...finals(rsB))),
        xirr: { a: fmtRate(xirrMed(rsA)), delta: fmtDelta(xirrMed(rsB) - xirrMed(rsA), pt, isZeroPt) }
    };
}

// 長條圖的 A 折線：items 為圖上目前顯示的 B 結果（依時間或依結果排序）
// 依時間：以 startIdx 配對 A 的期末資產（A 無該起點為 null）；依結果：A 自行由小到大排序（長度不足補 null）
// → { line: number[]（與 items 等長）, median: A 期末資產中位 }
export function aLineData(rsA, items, byRank) {
    const finals = rsA.map(r => r.final);
    if (!byRank) {
        const byIdx = new Map(rsA.map(r => [r.startIdx, r.final]));
        return { line: items.map(r => byIdx.get(r.startIdx) ?? null), median: median(finals) };
    }
    const sorted = [...finals].sort((x, y) => x - y);
    return { line: items.map((_, i) => sorted[i] ?? null), median: median(finals) };
}
