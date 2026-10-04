/**
 * plan/schedule.js
 * 排程：把計畫參數展開成依日期排序的動作 [{ idx, order, kind, ... }]
 * 新增排程類功能（如定期再平衡）：寫一個規則函式加進 RULES，並在 simulate.js 的 HANDLERS 加對應 kind
 */

import { targetDate, lowerBound, monthsFrom } from './calendar.js';
import { canRebalance } from './rebalance.js';
import { flowAmount } from './inflation.js';

// 同日執行順序（數字小者先）
export const ORDER = { flow: 0, stage: 1, buy: 2, rebalance: 3 };

// 現金流是否於該月執行（mo.year 為第幾年；每年 / 單次看日曆月份 month）
function flowActive(f, mo, years) {
    const to = f.period === 'once' ? f.fromYear : (f.toYear ?? years);
    if (mo.year < f.fromYear || mo.year > to) return false;
    return f.period === 'monthly' || mo.m === f.month;
}

// 現金流：設定日入帳 / 扣款
function cashflowRule(ctx, at) {
    for (const mo of ctx.months) {
        for (const f of ctx.plan.cashflows) {
            if (flowActive(f, mo, ctx.plan.years)) at(mo, f.day, { kind: 'flow', amount: flowAmount(f, mo.year, ctx.plan.inflationRate), name: f.name });
        }
    }
}

// 定期購買：每月設定日（入帳當天買進由 simulate.js 的 flow 處理）
function purchaseRule(ctx, at) {
    const { purchase } = ctx.plan;
    if (purchase.timing !== 'monthly') return;
    for (const mo of ctx.months) at(mo, purchase.day, { kind: 'buy' });
}

// 定期再平衡（漲跌幅再平衡為每日檢查，見 simulate.js）
const PERIOD_MATCH = {
    monthly: () => true,
    quarterly: mo => (mo.m - 1) % 3 === 0,
    yearly: (mo, r) => mo.m === r.month
};
function rebalanceRule(ctx, at) {
    const r = ctx.plan.rebalance;
    const { stockRatio, stockRatioSchedule } = ctx.plan;
    if (r.mode !== 'periodic' || ![stockRatio, ...stockRatioSchedule.map(s => s.ratio)].some(canRebalance)) return;
    for (const mo of ctx.months) if (PERIOD_MATCH[r.period](mo, r)) at(mo, r.day, { kind: 'rebalance' });
}

// 股票比例時程：第 fromYear 年的第一個月 1 日（與現金流「第幾年」同口徑，非交易日順延）以當日收盤價強制調到新比例
function stageRule(ctx, at) {
    for (const st of ctx.plan.stockRatioSchedule) {
        const mo = ctx.months[(st.fromYear - 1) * 12];
        if (mo) at(mo, 1, { kind: 'stage', ratio: st.ratio });
    }
}

const RULES = [cashflowRule, stageRule, purchaseRule, rebalanceRule];

export function buildSchedule(dates, startIdx, endIdx, plan) {
    const ctx = { plan, dates, startIdx, months: monthsFrom(dates[startIdx], plan.years * 12) };
    const acts = [];
    const atIdx = (idx, act) => { if (idx <= endIdx) acts.push({ idx, order: ORDER[act.kind], ...act }); };
    const at = (mo, day, act) => atIdx(Math.max(startIdx, lowerBound(dates, targetDate(mo.y, mo.m, day))), act);
    for (const rule of RULES) rule(ctx, at, atIdx);
    return acts.sort((a, b) => a.idx - b.idx || a.order - b.order);
}
