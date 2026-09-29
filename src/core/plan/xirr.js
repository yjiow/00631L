/**
 * plan/xirr.js
 * 內部報酬率（年化，小數）
 */

// flows：[{ date, amount }]，投入為負、取回為正；無解回傳 null（二分法）
export function xirr(flows) {
    const t0 = Date.parse(flows[0].date);
    const ts = flows.map(f => (Date.parse(f.date) - t0) / 864e5 / 365);
    const npv = r => flows.reduce((s, f, i) => s + f.amount / Math.pow(1 + r, ts[i]), 0);
    let lo = -0.9999, hi = 10;
    let fLo = npv(lo);
    if (!isFinite(fLo) || fLo * npv(hi) > 0) return null;
    for (let k = 0; k < 200 && hi - lo > 1e-10; k++) {
        const mid = (lo + hi) / 2, fMid = npv(mid);
        if (fLo * fMid <= 0) hi = mid; else { lo = mid; fLo = fMid; }
    }
    return (lo + hi) / 2;
}
