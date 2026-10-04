/**
 * planDiff.js
 * 方案對照（純函式，不依賴 DOM）：兩份計畫的參數差異、兩組滾動結果的統計對照、計畫完整參數描述
 */
import { normalizePlan } from '../../core/plan/defaults.js';

export const FOLD_LIMIT = 5; // 差異項目超過此數時摺疊

// 金額：滿 1 萬以「萬」顯示（至多 2 位小數），否則「元」；負數保留負號
export const fmtAmt = v => {
    const s = v < 0 ? '−' : '', a = Math.abs(v);
    return s + (a >= 10_000 ? `${+(a / 10_000).toFixed(2)} 萬` : `${a.toLocaleString('en-US')} 元`);
};
// 現金流金額：千分位、正數不加號
const fmtFlow = v => v.toLocaleString('en-US');
const pct = x => `${+(x * 100).toFixed(2)}%`;

// 中位數：偶數個時取偏小的那個（下中位數），使統計卡數字與「中位」按鈕選中的真實起點一致
export const median = arr => {
    const s = [...arr].sort((a, b) => a - b);
    return s[(s.length - 1) >> 1];
};

export const shouldFold = items => items.length > FOLD_LIMIT;

// ---- 各參數的文字描述（比對以描述字串為準，無作用的子欄位不會造成差異） ----

export function describeSchedule(p) {
    return p.stockRatioSchedule.length
        ? p.stockRatioSchedule.map(s => `第 ${s.fromYear} 年起 ${pct(s.ratio)}`).join('、')
        : '無（全程固定比例）';
}

export function describePurchase(p) {
    const u = p.purchase;
    if (u.timing === 'none') return '不自動買進';
    if (u.timing === 'monthly') return `每月 ${u.day} 日買進（${u.mode === 'all' ? '全部現金' : `固定金額上限 ${fmtAmt(u.amount)}`}）`;
    const mode = { amount: '入帳金額買進', ratio: '依股票比例投入', threshold: `達門檻才買（偏離 ${pct(u.threshold)}）` }[u.inflowMode];
    return `入帳當天買進（${mode}）`;
}

export function describeRebalance(p) {
    const r = p.rebalance;
    if (r.mode === 'none') return '不再平衡';
    if (r.mode === 'threshold') return `漲跌幅（門檻 ${pct(r.threshold)}）`;
    const when = { monthly: `每月 ${r.day} 日`, quarterly: `每季（1、4、7、10 月）${r.day} 日`, yearly: `每年 ${r.month} 月 ${r.day} 日` }[r.period];
    return `定期（${when}）`;
}

export function describeDip(p) {
    const d = p.dipBuy;
    if (!d.enabled) return '關閉';
    const tiers = d.tiers.map(t => `回撤 ${pct(t.drawdown)} 動用現金 ${pct(t.cashPct)}`).join('、');
    return `開啟：${tiers}；回升至高點 −${pct(d.recoverAt)} 內，分 ${d.recoverMonths} 個月收回`;
}

export function describeCosts(p) {
    return p.costs.enabled ? `手續費 ${+(p.costs.discount * 10).toFixed(2)} 折、最低 ${p.costs.minFee} 元` : '不計交易成本';
}

const PERIOD = { monthly: '每月', yearly: '每年', once: '單次' };
// 現金流列的排程描述（不含金額）
function describeFlowWhen(f) {
    const when = f.period === 'monthly' ? `每月 ${f.day} 日`
        : f.period === 'yearly' ? `每年 ${f.month} 月 ${f.day} 日`
        : `第 ${f.fromYear} 年 ${f.month} 月 ${f.day} 日`;
    const range = f.period === 'once' ? '' : `，第 ${f.fromYear} 年起至${f.toYear == null ? '期末' : `第 ${f.toYear} 年`}`;
    return when + range + (f.inflation && f.period !== 'once' ? '，隨通膨調整' : '');
}
const describeFlow = f => `${fmtFlow(f.amount)}（${describeFlowWhen(f)}）`;
const flowName = f => f.name || '（未命名）';

// ---- 差異比對 ----

const flowKey = f => `${f.name}|${f.period}`;
const sameFlow = (a, b) => ['amount', 'month', 'day', 'fromYear', 'toYear', 'inflation'].every(k => (a[k] ?? null) === (b[k] ?? null));

// 現金流以列比對：名稱＋週期相同視為同一列（重複時依出現順序配對）
function diffCashflows(a, b) {
    const pool = new Map();
    for (const f of b) pool.set(flowKey(f), [...(pool.get(flowKey(f)) ?? []), f]);
    const out = [];
    for (const fa of a) {
        const fb = pool.get(flowKey(fa))?.shift();
        if (!fb) { out.push({ label: '現金流', text: `刪除：${flowName(fa)} ${fmtFlow(fa.amount)}` }); continue; }
        if (sameFlow(fa, fb)) continue;
        const onlyAmount = ['month', 'day', 'fromYear', 'toYear', 'inflation'].every(k => (fa[k] ?? null) === (fb[k] ?? null));
        out.push({
            label: '現金流',
            text: onlyAmount ? `${flowName(fa)}：${fmtFlow(fa.amount)} → ${fmtFlow(fb.amount)}` : `${flowName(fa)}：${describeFlow(fa)} → ${describeFlow(fb)}`
        });
    }
    for (const list of pool.values()) for (const fb of list) out.push({ label: '現金流', text: `新增：${flowName(fb)} ${fmtFlow(fb.amount)}` });
    return out;
}

// 開放項目差異：[{ label, text }]，text 為「欄位：A值 → B值」一行；無差異回傳 []
export function diffPlans(planA, planB) {
    const a = normalizePlan(planA), b = normalizePlan(planB);
    const items = [];
    const cmp = (label, va, vb) => { if (va !== vb) items.push({ label, text: `${label}：${va} → ${vb}` }); };
    cmp('初始資金', fmtAmt(a.initialCapital), fmtAmt(b.initialCapital));
    cmp('股票比例', pct(a.stockRatio), pct(b.stockRatio));
    cmp('股票比例時程', describeSchedule(a), describeSchedule(b));
    items.push(...diffCashflows(a.cashflows, b.cashflows));
    cmp('定期購買', describePurchase(a), describePurchase(b));
    cmp('再平衡', describeRebalance(a), describeRebalance(b));
    cmp('大跌加碼', describeDip(a), describeDip(b));
    return items;
}

// 計畫完整參數：[{ label, text }]（供「檢視 A 完整參數」）；dataEnd：資料截止（null 最新）
export function describePlan(plan, dataEnd = null) {
    const p = normalizePlan(plan);
    return [
        { label: '模擬年數', text: `${p.years} 年` },
        { label: '通膨率', text: pct(p.inflationRate) },
        { label: '資料截止', text: dataEnd ? 'AI 行情前（2022 年底）' : '最新' },
        { label: '初始資金', text: fmtAmt(p.initialCapital) },
        { label: '股票比例', text: pct(p.stockRatio) },
        { label: '股票比例時程', text: describeSchedule(p) },
        ...(p.cashflows.length
            ? p.cashflows.map(f => ({ label: `現金流：${flowName(f)}`, text: `${PERIOD[f.period]} ${describeFlow(f)}` }))
            : [{ label: '現金流', text: '無' }]),
        { label: '定期購買', text: describePurchase(p) },
        { label: '再平衡', text: describeRebalance(p) },
        { label: '大跌加碼', text: describeDip(p) },
        { label: '交易成本', text: describeCosts(p) },
        { label: '現金年利率', text: pct(p.cashRate) }
    ];
}

// ---- 結果統計對照 ----

const statsOf = rs => ({
    worst: Math.min(...rs.map(r => r.final)),
    median: median(rs.map(r => r.final)),
    best: Math.max(...rs.map(r => r.final)),
    xirrMedian: median(rs.map(r => r.xirr ?? -1)),
    mddMedian: median(rs.map(r => r.mdd))
});

// rsA / rsB：simulateRolling 結果；以相同 startIdx 配對，B 的期末資產嚴格大於 A 才算優於
// → { a, b, n, better, betterPct }；任一邊無結果回傳 null
export function compareStats(rsA, rsB) {
    if (!rsA.length || !rsB.length) return null;
    const byIdx = new Map(rsA.map(r => [r.startIdx, r]));
    let n = 0, better = 0;
    for (const rb of rsB) {
        const ra = byIdx.get(rb.startIdx);
        if (!ra) continue;
        n++;
        if (rb.final > ra.final) better++;
    }
    return { a: statsOf(rsA), b: statsOf(rsB), n, better, betterPct: n ? better / n : 0 };
}
