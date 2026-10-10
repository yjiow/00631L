/**
 * plan.js
 * 投資計畫頁控制器：表單 → 滾動模擬 → 分布 / 明細；載入上次參數（planStorage）並以頂端提示標示來源
 * 由 router.js 在載入 views/plan.html 後呼叫 initPlan()
 */

import { fetchBacktestData } from '../../core/database.js';
import { DEFAULT_PLAN, normalizePlan } from '../../core/plan/defaults.js';
import { AI_CUTOFF } from '../../core/marketDates.js';
import { toSeries, simulatePlan, simulateRolling } from '../../core/plan/simulate.js';
import { purchasingPowerNote } from '../../core/plan/inflation.js';
import { fillForm, readForm, syncPurchase, syncRebalance, syncDip, syncCosts, setLocked } from './planForm.js';
import { initCashflowList } from './cashflowList.js';
import { initStageList } from './stageList.js';
import { initDipList } from './dipList.js';
import { bindMoneyInputs } from '../../ui/moneyInput.js';
import { initTabs, updateStatus, markError, clearErrors } from './planTabs.js';
import { renderRolling, renderCompare, setRollingA, resetRollingA } from './rollingPanel.js';
import { renderDetail, initDetailPanel } from './detailPanel.js';
import { savePlan, loadPlan, clearPlan } from './planStorage.js';
import { initAnchors, refreshAnchors, scrollToSection } from './planAnchors.js';
import { consumeSharedPlan, sharePlan, buildShareUrl } from './shareLink.js';
import { initPresets, clearPresetActive } from './planPresets.js';
import { initCases, summarizePlan } from './planCases.js';
import { diffPlans, compareStats, describePlan } from './planDiff.js';
import { renderCompareBlock, bindCompare, openPinModal } from './comparePanel.js';

const $ = id => document.getElementById(id);

// 標的 → database 股價欄位
const TARGET_FIELD = { '00631L': 't2_close', '0050': 'tw50_close' };

let rows = null;          // database 全部資料，載入一次
const seriesCache = {};   // 標的 → { dates, prices }

// 標的股價，end（資料截止日，null = 最新）之後的資料截掉；起點索引與完整序列相同
function seriesOf(target, end = null) {
    const key = `${target}|${end}`;
    if (!seriesCache[key]) {
        const full = seriesCache[target] ??= toSeries(rows, TARGET_FIELD[target]);
        const n = end ? full.dates.findLastIndex(d => d <= end) + 1 : full.dates.length;
        seriesCache[key] = { dates: full.dates.slice(0, n), prices: full.prices.slice(0, n) };
    }
    return seriesCache[key];
}
let dataEnd = null; // 資料截止：null 最新 | AI_CUTOFF（檢視方式，不存入參數）
let currentPlan = DEFAULT_PLAN;
let lastRs = [];      // 目前結果（B）的滾動結果，供對照
let detailIdx = null; // 目前單一起點明細的起點索引
let pinned = null;    // 方案對照：{ plan, dataEnd } 釘住的對照組 A（不保存、不分享，離開頁面或重新整理即清除）
const topSection = () => pinned ? 'plan-compare' : 'plan-rolling'; // 重新計算後捲回的結果頂端
// 結果來源：'default' 預設範例 | 'saved' 上次保存 | 'shared' 分享連結帶入 | 'user' 本次使用者按下模擬（不顯示提示）
let source = null, savedAt = null;

const fmtTime = iso => {
    const d = new Date(iso), p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

function renderBanner() {
    $('plan-banner').hidden = source === 'user';
    $('plan-reset').hidden = source === 'default' || source === 'user';
    $('plan-banner-text').textContent = source === 'saved'
        ? `已載入您上次的參數（${fmtTime(savedAt)}），調整後按「開始模擬」重新計算。`
        : source === 'shared'
        ? '已載入朋友分享的計畫參數，調整後按「開始模擬」重新計算。'
        : '以下為預設參數（首頁 50/50 策略＋每月 1 萬）的範例結果，請調整參數後按「開始模擬」。'; // 文字對應 DEFAULT_PLAN
}

// 預先產生目前計畫的分享連結（計畫變動時重做）：點分享要在手勢內同步呼叫系統分享，不能當場壓縮
let shareCache = { plan: null, url: null };
function prepareShare() {
    const plan = currentPlan;
    if (shareCache.plan === plan) return;
    shareCache = { plan, url: null };
    buildShareUrl(plan).then(url => { if (shareCache.plan === plan) shareCache.url = url; }).catch(() => {});
}

let shareFeedbackTimer;
function showShareFeedback(text) {
    clearTimeout(shareFeedbackTimer);
    const btn = $('plan-share');
    btn.classList.add('is-done');
    btn.title = text;
    shareFeedbackTimer = setTimeout(() => { btn.classList.remove('is-done'); btn.title = '分享此計畫參數'; }, 1800);
}

function showError(msg) {
    $('plan-error').hidden = !msg;
    $('plan-error').textContent = msg ?? '';
}

function showDetail(startIdx, scroll) {
    detailIdx = startIdx;
    // 釘住期間另算 A 在同一起點的每日資產（單次 simulatePlan），疊加於總資產曲線
    const rA = pinned ? simulatePlan(seriesOf(pinned.plan.target, pinned.dataEnd), startIdx, pinned.plan) : null;
    renderDetail(simulatePlan(seriesOf(currentPlan.target, dataEnd), startIdx, currentPlan), currentPlan.years, rA);
    if (scroll) scrollToSection('plan-detail');
}

// save：使用者按下「開始模擬」時保存參數
function run({ save = false } = {}) {
    if (!rows) return; // 資料尚未載入
    const { plan, error, field } = readForm($('plan-form'));
    if (error) { markError(field); return showError(error); }
    clearErrors();
    if (!compute(plan)) return;
    if (save) { savePlan(plan); source = 'user'; }
    renderBanner();
    if (save) scrollToSection(topSection()); // 每次按「開始模擬」都捲回結果頂端（電腦 / 手機皆同）
}

// 方案對照：依 pinned 狀態顯示 / 隱藏對照區塊與釘住按鈕、鎖定欄位，並重算 A（simulateRolling，不另存）與差異
// refreshDetail：釘住 / 取消釘住時重繪目前明細（A 線出現或消失）；重算結果時由 renderRolling 的選中回呼負責
function renderPin(refreshDetail = false) {
    const on = !!pinned;
    if (refreshDetail && detailIdx != null) showDetail(detailIdx, false);
    $('plan-pin').hidden = on;
    $('plan-compare').hidden = !on;
    setLocked($('plan-form'), on);
    $('rolling-end').querySelectorAll('button').forEach(b => { b.disabled = on; });
    if (!on) return setRollingA(null);
    const a = pinned.plan;
    const rsA = simulateRolling(seriesOf(a.target, pinned.dataEnd), a);
    setRollingA(rsA); // 分布的統計卡與長條圖疊加 A（與對照表共用同一份結果）
    renderCompareBlock({ summary: summarizePlan(a), stats: compareStats(rsA, lastRs), diff: diffPlans(a, currentPlan) });
}

// 會整組取代情境的操作（快速情境、案例帶入、恢復預設）：釘住中先確認，確認才取消釘住；回傳 false = 使用者取消
function confirmUnpin() {
    if (!pinned) return true;
    if (!confirm('會取消對照，是否繼續？')) return false;
    pinned = null;
    renderPin(true);
    return true;
}

// 0050 對照：沿用現金流與交易成本，改為 100% 投入、每筆入帳當天全數買進（零頭留現金）、不再平衡、不加碼
const buyHold0050 = plan => ({
    ...plan, target: '0050', stockRatio: 1, stockRatioSchedule: [], dipBuy: { ...plan.dipBuy, enabled: false },
    purchase: { ...plan.purchase, timing: 'inflow', inflowMode: 'ratio' },
    rebalance: { ...plan.rebalance, mode: 'none' }
});

// 以 plan 與目前資料截止日計算並顯示結果；資料不足回傳 false
function compute(plan) {
    const series = seriesOf(plan.target, dataEnd);
    const rs = simulateRolling(series, plan);
    if (!rs.length) {
        showError(dataEnd ? `資料只到 2022 年底，不足 ${plan.years} 年，請縮短模擬年數或切回「最新」` : `資料不足 ${plan.years} 年，請縮短模擬年數`);
        return false;
    }
    showError(null);
    currentPlan = plan;
    prepareShare();
    lastRs = rs;
    $('plan-results').hidden = false;
    $('rolling-end-note').hidden = !dataEnd;
    const note = purchasingPowerNote(plan.inflationRate, plan.years);
    $('rolling-infl-note').textContent = note;
    $('rolling-infl-wrap').hidden = !note;
    renderCompare([
        { label: '同樣現金流 100% 買進持有 0050', rs: simulateRolling(seriesOf('0050', dataEnd), buyHold0050(plan)) },
        dataEnd
            ? { label: '資料含最新行情', rs: simulateRolling(seriesOf(plan.target), plan) }
            : { label: '資料只到 AI 行情前（2022 年底）', rs: simulateRolling(seriesOf(plan.target, AI_CUTOFF), plan) }
    ]);
    let first = true; // 初次預設選中位數時不捲動
    renderRolling(rs, plan.years, series.dates.at(-1), idx => { showDetail(idx, !first); first = false; });
    renderPin();
    refreshAnchors();
    return true;
}

// 資料截止切換：以目前結果的參數重算（不讀表單、不保存）
function bindDataEnd() {
    const seg = $('rolling-end');
    seg.querySelectorAll('button').forEach(b => b.classList.toggle('active', (b.dataset.end === 'ai') === !!dataEnd));
    seg.addEventListener('click', e => {
        const btn = e.target.closest('[data-end]');
        if (!btn || !rows) return;
        const prev = dataEnd;
        dataEnd = btn.dataset.end === 'ai' ? AI_CUTOFF : null;
        if (!compute(currentPlan)) { dataEnd = prev; return; }
        seg.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === btn));
    });
}

export async function initPlan() {
    const form = $('plan-form');
    if (!form) return;
    pinned = null; // 對照不跨頁面保存
    resetRollingA();
    if (!source) { // 本次瀏覽首次進入：分享連結優先，其次有保存就載入
        const shared = await consumeSharedPlan();
        if (shared) {
            currentPlan = normalizePlan(shared);
            source = 'shared';
        } else {
            const saved = loadPlan();
            if (saved) ({ plan: currentPlan, savedAt } = saved);
            source = saved ? 'saved' : 'default';
        }
    }
    initCashflowList($('cf-list'));
    initStageList($('sr-list'));
    initDipList($('dip-list'));
    bindMoneyInputs(form);
    fillForm(form, DEFAULT_PLAN);
    initTabs(form);           // 以預設值為「預設」狀態基準
    fillForm(form, currentPlan);
    updateStatus();
    // 子欄位、說明與提示依多頁欄位而定（股票比例、定期購買、再平衡），任一欄位變動即更新
    const presetsEl = $('plan-presets');
    const sync = () => { syncPurchase(form); syncDip(form); syncRebalance(form); syncCosts(form); clearPresetActive(presetsEl); };
    form.addEventListener('change', sync);
    form.addEventListener('input', sync);
    form.addEventListener('submit', e => { e.preventDefault(); run({ save: true }); });
    bindDataEnd();
    initDetailPanel();
    initAnchors();
    const applyPlan = plan => {
        if (!rows) return; // 資料尚未載入
        fillForm(form, plan);
        updateStatus();
        syncPurchase(form); syncDip(form); syncRebalance(form); syncCosts(form);
        clearErrors();
        if (compute(normalizePlan(plan))) {
            source = 'user'; // 套用情境視同使用者操作，不顯示來源提示
            renderBanner();
            scrollToSection(topSection()); // 每次套用情境都捲回結果頂端
        }
    };
    bindCompare({
        onUnpin: () => { pinned = null; renderPin(true); },
        onView: () => openPinModal(describePlan(pinned.plan, pinned.dataEnd)),
        onRestore: () => applyPlan(structuredClone(pinned.plan))
    });
    $('plan-pin').addEventListener('click', () => {
        pinned = { plan: structuredClone(currentPlan), dataEnd };
        renderPin(true);
        scrollToSection('plan-compare');
    });
    // 快速情境：在按鈕自身處理前（capture）先確認，取消則不套用、不切換按鈕高亮
    presetsEl.addEventListener('click', e => {
        if (e.target.closest('.plan-preset-btn') && !confirmUnpin()) e.stopPropagation();
    }, true);
    initPresets(presetsEl, applyPlan);
    initCases(plan => {
        if (!confirmUnpin()) return;
        applyPlan(normalizePlan(plan));
        clearPresetActive(presetsEl);
        presetsEl.querySelector('[data-role=desc]').hidden = true;
    });
    $('plan-share').addEventListener('click', async () => {
        const { status, url } = await sharePlan(currentPlan, shareCache.plan === currentPlan ? shareCache.url : null);
        if (status === 'copied') showShareFeedback('已複製連結');
        else if (status === 'manual') prompt('複製此連結分享：', url);
    });
    $('plan-reset').addEventListener('click', () => {
        if (!confirmUnpin()) return;
        clearPlan();
        currentPlan = DEFAULT_PLAN;
        source = 'default';
        fillForm(form, currentPlan);
        updateStatus();
        clearPresetActive(presetsEl);
        run();
        scrollToSection(topSection()); // 每次重新計算都捲回結果頂端
    });
    rows ??= await fetchBacktestData('2000-01-01', '9999-12-31');
    run();
}
