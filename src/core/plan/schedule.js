/**
 * plan/schedule.js
 * 排程：把計畫參數展開成依日期排序的動作 [{ idx, order, kind, ... }]
 * 新增排程類功能（如定期再平衡）：寫一個規則函式加進 RULES，並在 simulate.js 的 HANDLERS 加對應 kind
 */

import { targetDate, lowerBound, monthsFrom } from './calendar.js';
import { canRebalance } from './rebalance.js';

// 同日執行順序（數字小者先）
export const ORDER = { flow: 0, buy: 1, rebalance: 2 };

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
            if (flowActive(f, mo, ctx.plan.years)) at(mo, f.day, { kind: 'flow', amount: f.amount });
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
    if (r.mode !== 'periodic' || !canRebalance(ctx.plan.stockRatio)) return;
    for (const mo of ctx.months) if (PERIOD_MATCH[r.period](mo, r)) at(mo, r.day, { kind: 'rebalance' });
}

const RULES = [cashflowRule, purchaseRule, rebalanceRule];

export function buildSchedule(dates, startIdx, endIdx, plan) {
    const ctx = { plan, months: monthsFrom(dates[startIdx], plan.years * 12) };
    const acts = [];
    const at = (mo, day, act) => {
        const idx = Math.max(startIdx, lowerBound(dates, targetDate(mo.y, mo.m, day)));
        if (idx <= endIdx) acts.push({ idx, order: ORDER[act.kind], ...act });
    };
    for (const rule of RULES) rule(ctx, at);
    return acts.sort((a, b) => a.idx - b.idx || a.order - b.order);
}
