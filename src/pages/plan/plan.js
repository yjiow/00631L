/**
 * plan.js
 * 投資計畫頁控制器：表單 → 滾動模擬 → 分布 / 明細；載入上次參數（planStorage）並以頂端提示標示來源
 * 由 router.js 在載入 views/plan.html 後呼叫 initPlan()
 */

import { fetchBacktestData } from '../../core/database.js';
import { DEFAULT_PLAN } from '../../core/plan/defaults.js';
import { toSeries, simulatePlan, simulateRolling } from '../../core/plan/simulate.js';
import { fillForm, readForm, syncPurchase, syncRebalance, syncCosts } from './planForm.js';
import { initCashflowList } from './cashflowList.js';
import { initTabs, updateStatus, markError, clearErrors } from './planTabs.js';
import { renderRolling, renderCompare } from './rollingPanel.js';
import { renderDetail } from './detailPanel.js';
import { savePlan, loadPlan, clearPlan } from './planStorage.js';

const $ = id => document.getElementById(id);

// 標的 → database 股價欄位
const TARGET_FIELD = { '00631L': 't2_close', '0050': 'tw50_close' };

let rows = null;          // database 全部資料，載入一次
const seriesCache = {};   // 標的 → { dates, prices }

const seriesOf = target => seriesCache[target] ??= toSeries(rows, TARGET_FIELD[target]);
let currentPlan = DEFAULT_PLAN;
// 結果來源：'default' 預設範例 | 'saved' 上次保存 | 'user' 本次使用者按下模擬（不顯示提示）
let source = null, savedAt = null;

const fmtTime = iso => {
    const d = new Date(iso), p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

function renderBanner() {
    $('plan-banner').hidden = source === 'user';
    $('plan-reset').hidden = source !== 'saved';
    $('plan-banner-text').textContent = source === 'saved'
        ? `已載入您上次的參數（${fmtTime(savedAt)}），調整後按「開始模擬」重新計算。`
        : '以下為預設參數的範例結果，請調整參數後按「開始模擬」。';
}

function showError(msg) {
    $('plan-error').hidden = !msg;
    $('plan-error').textContent = msg ?? '';
}

function showDetail(startIdx, scroll) {
    renderDetail(simulatePlan(seriesOf(currentPlan.target), startIdx, currentPlan));
    if (scroll) $('plan-detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// save：使用者按下「開始模擬」時保存參數
function run({ save = false } = {}) {
    if (!rows) return; // 資料尚未載入
    const { plan, error, field } = readForm($('plan-form'));
    if (error) { markError(field); return showError(error); }
    clearErrors();
    const rs = simulateRolling(seriesOf(plan.target), plan);
    if (!rs.length) return showError(`資料不足 ${plan.years} 年，請縮短模擬年數`);
    showError(null);
    currentPlan = plan;
    if (save) { savePlan(plan); source = 'user'; }
    renderBanner();
    $('plan-results').hidden = false;
    let first = true; // 初次預設選中位數時不捲動
    renderCompare(simulateRolling(seriesOf('0050'), { ...plan, target: '0050' }));
    renderRolling(rs, plan.years, idx => { showDetail(idx, !first); first = false; });
}

export async function initPlan() {
    const form = $('plan-form');
    if (!form) return;
    if (!source) { // 本次瀏覽首次進入：有保存就載入
        const saved = loadPlan();
        if (saved) ({ plan: currentPlan, savedAt } = saved);
        source = saved ? 'saved' : 'default';
    }
    initCashflowList($('cf-list'));
    fillForm(form, DEFAULT_PLAN);
    initTabs(form);           // 以預設值為「預設」狀態基準
    fillForm(form, currentPlan);
    updateStatus();
    // 子欄位、說明與提示依多頁欄位而定（股票比例、定期購買、再平衡），任一欄位變動即更新
    const sync = () => { syncPurchase(form); syncRebalance(form); syncCosts(form); };
    form.addEventListener('change', sync);
    form.addEventListener('input', sync);
    form.addEventListener('submit', e => { e.preventDefault(); run({ save: true }); });
    $('plan-reset').addEventListener('click', () => {
        clearPlan();
        currentPlan = DEFAULT_PLAN;
        source = 'default';
        fillForm(form, currentPlan);
        updateStatus();
        run();
    });
    rows ??= await fetchBacktestData('2000-01-01', '9999-12-31');
    run();
}
