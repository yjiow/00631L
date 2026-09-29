/**
 * plan/simulate.js
 * 投資計畫模擬（純計算，不操作 DOM）
 * 流程：排程展開（schedule.js）→ 逐日執行動作（HANDLERS）→ 每日檢查（漲跌幅再平衡）→ 記錄每日資產
 * 規則：動作於設定日當天或之後第一個交易日執行，皆用當日收盤價；現金不足即賣股補足，持股也不足為資金斷鏈（模擬停止、期末資產 0）
 */

import { normalizePlan } from './defaults.js';
import { lowerBound, addYears } from './calendar.js';
import { buildSchedule } from './schedule.js';
import { Account } from './account.js';
import { xirr } from './xirr.js';
import { canRebalance, drifted, rebalanceTo, topUpBudget } from './rebalance.js';

// database rows → { dates, prices }（略過 null）
export function toSeries(rows, field) {
    const valid = rows.filter(r => r[field] != null);
    return { dates: valid.map(r => r.date), prices: valid.map(r => r[field]) };
}

// 入帳當天買進（股票比例 0 / 100% 時「達門檻才買」同「依股票比例」）
function buyOnInflow(s, amount, price) {
    const { inflowMode, threshold } = s.plan.purchase;
    const { account } = s, ratio = s.plan.stockRatio;
    if (inflowMode === 'amount') return account.buy(price, amount);
    if (inflowMode === 'threshold' && canRebalance(ratio) &&
        !drifted(account.shares * price, account.cash, ratio, threshold)) return 0;
    return account.buy(price, topUpBudget(account, price, ratio));
}

// 各動作的執行方式；回傳 false 表示資金斷鏈
const HANDLERS = {
    flow(s, act, price) {
        s.account.cash += act.amount;
        s.invested += act.amount;
        s.cashflows.push({ date: s.date, amount: -act.amount });
        s.log('flow', { amount: act.amount, shares: 0, cost: 0 });
        if (!s.account.cover(price)) return false;
        if (act.amount > 0 && s.plan.purchase.timing === 'inflow') buyOnInflow(s, act.amount, price);
        return true;
    },
    buy(s, act, price) {
        const { mode, amount } = s.plan.purchase;
        s.account.buy(price, mode === 'all' ? s.account.cash : amount);
        return true;
    },
    rebalance(s, act, price) {
        rebalanceTo(s.account, price, s.plan.stockRatio);
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
        plan: p, date: dates[startIdx], invested: p.initialCapital,
        cashflows: [{ date: dates[startIdx], amount: -p.initialCapital }], // 投資人角度，供 XIRR
        log: (type, t) => detail && trades.push({ date: s.date, type, ...t })
    };
    s.account = new Account(p.initialCapital, p.costs, s.log);
    s.account.buy(prices[startIdx], p.initialCapital * p.stockRatio);

    const acts = buildSchedule(dates, startIdx, endIdx, p);
    let peak = 0, mdd = 0, value = 0, brokeDate = null, a = 0;
    const { rebalance, stockRatio } = p;
    const checkDrift = rebalance.mode === 'threshold';

    for (let i = startIdx; i <= endIdx && !brokeDate; i++) {
        s.date = dates[i];
        while (a < acts.length && acts[a].idx === i) {
            const act = acts[a++];
            if (!HANDLERS[act.kind](s, act, prices[i])) { brokeDate = dates[i]; break; }
        }
        // 每日檢查：漲跌幅再平衡（當日動作執行後、收盤價）
        if (checkDrift && !brokeDate && drifted(s.account.shares * prices[i], s.account.cash, stockRatio, rebalance.threshold)) {
            rebalanceTo(s.account, prices[i], stockRatio);
        }
        value = brokeDate ? 0 : s.account.value(prices[i]);
        if (value > peak) peak = value;
        if (peak > 0) mdd = Math.min(mdd, (value - peak) / peak * 100);
        if (detail) daily.push({ date: dates[i], cash: brokeDate ? 0 : s.account.cash, shares: brokeDate ? 0 : s.account.shares, value, invested: s.invested });
    }

    const endDate = brokeDate ?? dates[endIdx];
    return {
        startDate: dates[startIdx], endDate,
        final: value, invested: s.invested, costTotal: s.account.costTotal, mdd, brokeDate,
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
