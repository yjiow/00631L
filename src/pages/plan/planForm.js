/**
 * planForm.js
 * 參數表單 ↔ 計畫物件（欄位讀寫與檢查；現金流清單見 cashflowList.js）
 */

import { normalizePlan } from '../../core/plan/defaults.js';
import { setCashflows, readCashflows } from './cashflowList.js';
import { setStages, readStages } from './stageList.js';
import { setDips, readDips, setDipsDisabled } from './dipList.js';
import { validInflationPct } from '../../core/plan/inflation.js';
import { validateDipBuy } from '../../core/plan/dipBuy.js';
import { DEFAULT_PLAN } from '../../core/plan/defaults.js';
import { formatMoney, parseMoney } from '../../ui/moneyInput.js';
import { canRebalance, triggerRange } from '../../core/plan/rebalance.js';

const $ = id => document.getElementById(id);
const pct = x => Math.round(x * 100) + '%';

// 門檻換算為「股市值 / 現金」觸發點說明
function rangeText(form, thresholdName) {
    const ratio = Number(form.stockRatio.value) / 100, th = Number(form[thresholdName].value) / 100;
    if (!canRebalance(ratio)) return '股票比例為 0 或 100% 時不適用，請到「基本設定」調整股票比例。';
    if (!(th > 0)) return '';
    const r = triggerRange(ratio, th);
    return `目標 股市值／現金 = ${pct(r.target)}；≥ ${pct(r.upper)} 或 ≤ ${pct(r.lower)} 時觸發。`;
}

function setText(id, text) {
    $(id).hidden = !text;
    $(id).textContent = text;
}

const INFLOW_DESC = {
    ratio: '入帳後把現金中超出目標比例的部分買進，維持股票比例（股票比例 100% 時即全部買進）。',
    amount: '只買新入帳的金額，帳戶原有現金不動；買完的零頭留在現金。'
};

// 定期購買：依時機 / 投入方式 / 金額方式顯示子欄位與說明
export function syncPurchase(form) {
    const timing = form.purchaseTiming.value, inflowMode = form.purchaseInflowMode.value;
    $('purchase-inflow').hidden = timing !== 'inflow';
    $('purchase-threshold-field').hidden = inflowMode !== 'threshold';
    setText('purchase-inflow-desc', timing !== 'inflow' ? ''
        : inflowMode === 'threshold' ? '入帳後先試算，偏離目標比例超過門檻才買到目標比例，否則先留現金（只買不賣）。' + rangeText(form, 'purchaseThreshold')
        : INFLOW_DESC[inflowMode]);
    $('purchase-monthly').hidden = timing !== 'monthly';
    $('purchase-amount-field').hidden = form.purchaseMode.value !== 'fixed';
}

// 再平衡：依方式顯示子欄位，並提示無作用 / 與定期購買抵銷
export function syncRebalance(form) {
    const mode = form.rebalanceMode.value;
    $('rebalance-periodic').hidden = mode !== 'periodic';
    $('rebalance-month-field').hidden = form.rebalancePeriod.value !== 'yearly';
    $('rebalance-threshold').hidden = mode !== 'threshold';

    const ratio = Number(form.stockRatio.value);
    const buysAll = form.purchaseTiming.value === 'monthly' && form.purchaseMode.value === 'all';
    const hint = mode === 'none' ? ''
        : !(ratio > 0 && ratio < 100) ? '股票比例為 0 或 100% 時再平衡無作用，請到「基本設定」調整股票比例。'
        : buysAll ? '提醒：定期購買「每月固定日＋全部現金」會把現金全部買進，再平衡又會賣回現金，兩者會互相抵銷；建議改用「入帳當天買進＋依股票比例投入」或「不自動買進」。'
        : '';
    setText('rebalance-hint', hint);
    setText('rebalance-dip-note', form.dipEnabled.checked ? '大跌加碼期間再平衡只買不賣（股票低於目標才以現金買進），占比回到目標後恢復完整再平衡。' : '');
    setText('rebalance-range', mode === 'threshold' && ratio > 0 && ratio < 100 ? rangeText(form, 'rebalanceThreshold') : '');
}

// 大跌加碼：關閉時整區灰階、欄位不可編輯
export function syncDip(form) {
    const on = form.dipEnabled.checked;
    $('dip-body').classList.toggle('disabled', !on);
    $('dip-off-note').hidden = on;
    setDipsDisabled(!on);
    form.recoverAt.disabled = form.recoverMonths.disabled = !on;
}

// 交易成本：勾選不計時停用折扣欄位
export function syncCosts(form) {
    const off = form.costDisabled.checked || !!form.dataset.locked; // 對照鎖定時整組停用
    $('costs-fields').classList.toggle('disabled', off);
    form.costDiscount.disabled = form.costMinFee.disabled = off;
}

// 方案對照鎖定：模擬年數、通膨率、交易成本頁籤（含現金年利率）停用並顯示「🔒 對照中已鎖定」
export function setLocked(form, locked) {
    form.dataset.locked = locked ? '1' : '';
    form.years.disabled = form.inflationRate.disabled = form.costDisabled.disabled = form.cashRate.disabled = locked;
    document.querySelectorAll('[data-lock-note]').forEach(el => { el.hidden = !locked; });
    syncCosts(form);
}

// 計畫物件 → 表單欄位
export function fillForm(form, plan) {
    const p = normalizePlan(plan);
    form.years.value = p.years;
    form.initialCapital.value = formatMoney(p.initialCapital);
    form.stockRatio.value = Math.round(p.stockRatio * 100);
    form.inflationRate.value = +(p.inflationRate * 100).toFixed(2);
    setStages(p.stockRatioSchedule.map(s => ({ fromYear: s.fromYear, ratio: s.ratio })));
    setCashflows(p.cashflows);
    form.purchaseTiming.value = p.purchase.timing;
    form.purchaseInflowMode.value = p.purchase.inflowMode;
    form.purchaseThreshold.value = Math.round(p.purchase.threshold * 100);
    form.purchaseDay.value = p.purchase.day;
    form.purchaseMode.value = p.purchase.mode;
    form.purchaseAmount.value = p.purchase.amount ? formatMoney(p.purchase.amount) : '';
    syncPurchase(form);
    form.rebalanceMode.value = p.rebalance.mode;
    form.rebalancePeriod.value = p.rebalance.period;
    form.rebalanceMonth.value = p.rebalance.month;
    form.rebalanceDay.value = p.rebalance.day;
    form.rebalanceThreshold.value = Math.round(p.rebalance.threshold * 100);
    form.dipEnabled.checked = p.dipBuy.enabled;
    setDips(p.dipBuy.tiers);
    form.recoverAt.value = +(p.dipBuy.recoverAt * 100).toFixed(2);
    form.recoverMonths.value = p.dipBuy.recoverMonths;
    syncDip(form);
    syncRebalance(form);
    form.costDiscount.value = +(p.costs.discount * 10).toFixed(2);
    form.costMinFee.value = p.costs.minFee;
    form.costDisabled.checked = !p.costs.enabled;
    syncCosts(form);
    form.cashRate.value = +(p.cashRate * 100).toFixed(2);
}

// 大跌加碼欄位 → { dipBuy } 或 { error, field }；關閉時不驗證，欄位不合法則沿用預設範例值
function readDipBuy(form) {
    const enabled = form.dipEnabled.checked;
    const pct = name => form[name].value.trim() === '' ? NaN : +(Number(form[name].value) / 100).toFixed(4);
    const dipBuy = { enabled, tiers: readDips().tiers, recoverAt: pct('recoverAt'), recoverMonths: Number(form.recoverMonths.value) };
    const bad = validateDipBuy(dipBuy);
    if (!bad) return { dipBuy };
    if (!enabled) return { dipBuy: { ...DEFAULT_PLAN.dipBuy } };
    const field = bad.key === 'tiers' ? 'dipEnabled' : ['drawdown', 'cashPct'].includes(bad.key) ? `dt${bad.index}_${bad.key}` : bad.key;
    return { error: bad.error, field };
}

// 表單欄位 → { plan } 或 { error, field }（field 為出錯欄位 name，供頁籤標紅）
export function readForm(form) {
    const num = name => parseMoney(form[name].value); // 金額欄位含千分位逗號
    const years = num('years'), initialCapital = num('initialCapital'), ratio = num('stockRatio');

    if (!Number.isInteger(years) || years < 1 || years > 25) return { error: '模擬年數請填 1～25 的整數', field: 'years' };
    if (!(initialCapital >= 0)) return { error: '初始資金不可為負數', field: 'initialCapital' };
    if (!(ratio >= 0 && ratio <= 100)) return { error: '股票比例請填 0～100', field: 'stockRatio' };
    const inflation = num('inflationRate');
    if (!validInflationPct(inflation)) return { error: '通膨率請填 0～20%', field: 'inflationRate' };
    const st = readStages(years);
    if (st.error) return { error: st.error, field: st.field };
    const timing = form.purchaseTiming.value, mode = form.purchaseMode.value;
    const pDay = num('purchaseDay'), pAmount = num('purchaseAmount');
    const inflowMode = form.purchaseInflowMode.value, pThreshold = num('purchaseThreshold');
    if (timing === 'inflow' && inflowMode === 'threshold' && !(pThreshold > 0 && pThreshold <= 200)) return { error: '定期購買：門檻請填 1～200%', field: 'purchaseThreshold' };
    if (timing === 'monthly' && !(Number.isInteger(pDay) && pDay >= 1 && pDay <= 31)) return { error: '定期購買：每月幾日請填 1～31', field: 'purchaseDay' };
    if (timing === 'monthly' && mode === 'fixed' && !(pAmount > 0)) return { error: '定期購買：固定金額需大於 0', field: 'purchaseAmount' };

    const rMode = form.rebalanceMode.value, rPeriod = form.rebalancePeriod.value;
    const rMonth = num('rebalanceMonth'), rDay = num('rebalanceDay'), rThreshold = num('rebalanceThreshold');
    if (rMode === 'periodic' && rPeriod === 'yearly' && !(Number.isInteger(rMonth) && rMonth >= 1 && rMonth <= 12)) return { error: '再平衡：月請填 1～12', field: 'rebalanceMonth' };
    if (rMode === 'periodic' && !(Number.isInteger(rDay) && rDay >= 1 && rDay <= 31)) return { error: '再平衡：日請填 1～31', field: 'rebalanceDay' };
    if (rMode === 'threshold' && !(rThreshold > 0 && rThreshold <= 200)) return { error: '再平衡：門檻請填 1～200%', field: 'rebalanceThreshold' };

    const dip = readDipBuy(form);
    if (dip.error) return { error: dip.error, field: dip.field };

    const costsOn = !form.costDisabled.checked, discount = num('costDiscount'), minFee = num('costMinFee');
    if (costsOn && !(discount >= 0.1 && discount <= 10)) return { error: '交易成本：折扣請填 0.1～10 折', field: 'costDiscount' };
    if (costsOn && !(Number.isInteger(minFee) && minFee >= 0)) return { error: '交易成本：最低手續費請填 0 以上的整數', field: 'costMinFee' };

    const cashRate = num('cashRate');
    if (!(cashRate >= 0 && cashRate <= 10)) return { error: '現金年利率請填 0～10%', field: 'cashRate' };

    const { flows, error, field } = readCashflows();
    if (error) return { error, field };
    if (initialCapital === 0 && !flows.some(f => f.amount > 0)) return { error: '初始資金為 0 時，至少需有一筆正的現金流', field: 'initialCapital' };

    return {
        plan: normalizePlan({
            years, initialCapital, stockRatio: ratio / 100, inflationRate: +(inflation / 100).toFixed(4), stockRatioSchedule: st.stages,
            cashflows: flows,
            purchase: { timing, inflowMode, threshold: (pThreshold || 20) / 100, day: pDay || 5, mode, amount: mode === 'fixed' ? pAmount : 0 },
            costs: costsOn ? { enabled: true, discount: discount / 10, minFee } : { enabled: false },
            dipBuy: dip.dipBuy,
            rebalance: { mode: rMode, period: rPeriod, month: rMonth || 1, day: rDay || 5, threshold: (rThreshold || 20) / 100 },
            cashRate: cashRate / 100
        })
    };
}
