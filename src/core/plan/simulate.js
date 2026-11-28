/**
 * plan/simulate.js
 * 投資計畫模擬（純計算，不操作 DOM）
 * 流程：排程展開（schedule.js）→ 逐日執行動作（HANDLERS）→ 每日檢查（漲跌幅再平衡）→ 記錄每日資產
 * 每日檢查含大跌加碼（dipBuy.js）與漲跌幅再平衡
 * 規則：動作於設定日當天或之後第一個交易日執行，皆用當日收盤價；現金不足即賣股補足，持股也不足為資金斷鏈（模擬停止、期末資產 0）
 */

import { normalizePlan } from './defaults.js';
import { lowerBound, addYears, daysBetween } from './calendar.js';
import { buildSchedule } from './schedule.js';
import { Account } from './account.js';
import { xirr } from './xirr.js';
import { DipBuy } from './dipBuy.js';
import { canRebalance, drifted, rebalanceTo, allocateTo, topUpBudget } from './rebalance.js';

// database rows → { dates, prices }（略過 null）
export function toSeries(rows, field) {
    const valid = rows.filter(r => r[field] != null);
    return { dates: valid.map(r => r.date), prices: valid.map(r => r[field]) };
}

// 結息期序號：每年 6/21、12/21 各進一期（日期落在不同期序即跨過結息日）
export const settleKey = d => +d.slice(0, 4) * 2 + (d.slice(5) >= '12-21' ? 2 : d.slice(5) >= '06-21' ? 1 : 0);

// 入帳當天買進（股票比例 0 / 100% 時「達門檻才買」同「依股票比例」）
function buyOnInflow(s, amount, price) {
    const { inflowMode, threshold } = s.plan.purchase;
    const { account } = s, ratio = s.ratio;
    if (inflowMode === 'amount') return account.buy(price, amount, 'inflow');
    if (inflowMode === 'threshold' && canRebalance(ratio) &&
        !drifted(account.shares * price, account.cash, ratio, threshold)) return 0;
    return account.buy(price, topUpBudget(account, price, ratio), 'inflow');
}

// 各動作的執行方式；回傳 false 表示資金斷鏈
// 再平衡：大跌加碼輪期間只買不賣（股票低於目標時以現金買進，高於目標不賣，留給收回規則）
function rebalanceOrTopUp(s, price) {
    if (!s.dip?.active) return rebalanceTo(s.account, price, s.ratio);
    if (canRebalance(s.ratio)) s.account.buy(price, topUpBudget(s.account, price, s.ratio), 'rebalance');
}

const HANDLERS = {
    flow(s, act, price) {
        s.account.cash += act.amount;
        s.invested += act.amount;
        s.cashflows.push({ date: s.date, amount: -act.amount });
        s.log('flow', { amount: act.amount, shares: 0, cost: 0, name: act.name });
        if (!s.account.cover(price)) return false;
        if (act.amount > 0 && s.plan.purchase.timing === 'inflow') buyOnInflow(s, act.amount, price);
        return true;
    },
    buy(s, act, price) {
        const { mode, amount } = s.plan.purchase;
        s.account.buy(price, mode === 'all' ? s.account.cash : amount, 'purchase');
        return true;
    },
    rebalance(s, act, price) {
        rebalanceOrTopUp(s, price);
        return true;
    },
    stage(s, act, price) {
        s.ratio = act.ratio;
        allocateTo(s.account, price, s.ratio, 'stage');
        return true;
    }
};

// 從 startIdx 起模擬 plan.years 年；資料不足回傳 null
// detail：true 時附每日資產 daily 與交易紀錄 trades（滾動分析時關閉以省記憶體）
export function simulatePlan(series, startIdx, plan, { detail = true } = {}) {
    const p = normalizePlan(plan);
    const { dates, prices } = series;
    const endIdx = lowerBound(dates, addYears(dates[startIdx], p.years)); // 滿 years 年當天或之後第一個交易日
    if (endIdx >= dates.length) return null;

    const daily = [], trades = [];
    const s = {
        plan: p, ratio: p.stockRatio, date: dates[startIdx], invested: p.initialCapital,
        cashflows: [{ date: dates[startIdx], amount: -p.initialCapital }], // 投資人角度，供 XIRR
        log: (type, t) => detail && trades.push({ date: s.date, type, ...t })
    };
    s.dip = p.dipBuy.enabled ? new DipBuy(p.dipBuy, prices) : null;
    s.account = new Account(p.initialCapital, p.costs, s.log);
    s.account.buy(prices[startIdx], p.initialCapital * p.stockRatio, 'initial');

    const acts = buildSchedule(dates, startIdx, endIdx, p);
    let peak = 0, mdd = 0, value = 0, brokeDate = null, a = 0, accrued = 0; // accrued：已累計未入帳的現金利息
    let peakDate = null, mddPeriod = null; // 最大回撤的高點 / 低點日期與資產
    const { rebalance } = p;
    const checkDrift = rebalance.mode === 'threshold';

    for (let i = startIdx; i <= endIdx && !brokeDate; i++) {
        s.date = dates[i];
        // 現金利息（日積數法）：前一交易日收盤現金 × 年利率 × 相隔日曆天數 ÷ 365 累計，6/21、12/21（非交易日順延）或期末當天結息入帳並記交易；期間不複利，結息先於當日其他動作
        if (i > startIdx && p.cashRate) {
            accrued += s.account.cash * p.cashRate * daysBetween(dates[i - 1], dates[i]) / 365;
            if ((i === endIdx || settleKey(dates[i]) > settleKey(dates[i - 1])) && accrued > 0) {
                s.account.cash += accrued;
                s.log('interest', { amount: accrued, shares: 0, cost: 0 });
                accrued = 0;
            }
        }
        while (a < acts.length && acts[a].idx === i) {
            const act = acts[a++];
            if (!HANDLERS[act.kind](s, act, prices[i])) { brokeDate = dates[i]; break; }
        }
        // 每日檢查：大跌加碼 / 收回，其後漲跌幅再平衡（當日動作執行後、收盤價；加碼輪期間再平衡只買不賣）
        if (s.dip && !brokeDate) s.dip.step(s.account, prices[i], i, i === 0 || dates[i].slice(0, 7) !== dates[i - 1].slice(0, 7), s.ratio);
        if (checkDrift && !brokeDate && drifted(s.account.shares * prices[i], s.account.cash, s.ratio, rebalance.threshold)) {
            rebalanceOrTopUp(s, prices[i]);
        }
        value = brokeDate ? 0 : s.account.value(prices[i]);
        if (value > peak) { peak = value; peakDate = dates[i]; }
        const dd = peak > 0 ? (value - peak) / peak * 100 : 0;
        if (dd < mdd) { mdd = dd; mddPeriod = { peak: peakDate, trough: dates[i], peakValue: peak, troughValue: value }; }
        if (detail) daily.push({ date: dates[i], cash: brokeDate ? 0 : s.account.cash, shares: brokeDate ? 0 : s.account.shares, value, invested: s.invested });
    }

    const endDate = brokeDate ?? dates[endIdx];
    return {
        startDate: dates[startIdx], endDate,
        final: value, invested: s.invested, costTotal: s.account.costTotal, mdd, mddPeriod, brokeDate,
        xirr: xirr([...s.cashflows, { date: endDate, amount: value }]),
        ...(detail && { daily, trades })
    };
}

// 滾動起點：每月第一個交易日各跑一次（只回傳摘要，明細另以 simulatePlan 取得）
export function simulateRolling(series, plan) {
    const { dates } = series;
    const results = [];
    for (let i = 0; i < dates.length; i++) {
        if (i > 0 && dates[i].slice(0, 7) === dates[i - 1].slice(0, 7)) continue;
        const r = simulatePlan(series, i, plan, { detail: false });
        if (!r) break; // 之後的起點都不滿 years 年
        results.push({ startIdx: i, ...r });
    }
    return results;
}
