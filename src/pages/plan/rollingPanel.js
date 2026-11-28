/**
 * rollingPanel.js
 * 滾動起點分布：數字卡、長條圖、排序切換、快速選取（最差 / 中位 / 最好）
 */

import { renderRollingChart } from '../../charts/planCharts.js';
import { fmtMoney, fmtRate, ym, signClass } from './planFormat.js';
import { daysBetween } from '../../core/plan/calendar.js';
import { aStatRows, aLineData } from './rollingA.js';
import { median } from './planDiff.js';
import { rollingSimShare } from '../../core/plan/simulatedShare.js';
import { LISTING_631L, LISTING_0050 } from '../../core/marketDates.js';

const $ = id => document.getElementById(id);

let results = [];     // simulateRolling 結果（依時間）
let byValue = [];     // 依期末資產由差到好
let sortMode = 'time';
let selectedIdx = null;
let onSelect = () => {};
let resultsA = null;  // 釘住的對照組 A 的滾動結果（未釘住為 null）


// 快速選取對應的起點
const PICKS = {
    worst: () => byValue[0].startIdx,
    median: () => byValue[(byValue.length - 1) >> 1].startIdx,
    best: () => byValue.at(-1).startIdx
};

function draw() {
    const items = sortMode === 'time' ? results : byValue;
    const byRank = sortMode === 'value';
    renderRollingChart(items, selectedIdx, median(results.map(r => r.final)), select, byRank,
        resultsA && aLineData(resultsA, items, byRank));
}

// 統計卡的 A 行（釘住期間才有；未釘住時移除，卡片 DOM 與原本相同）與圖例說明
const CARD_IDS = { success: 'rs-success', worst: 'rs-worst', median: 'rs-median', best: 'rs-best', xirr: 'rs-xirr' };
function renderAExtras() {
    document.querySelectorAll('#plan-rolling .rs-a, #plan-rolling .rs-a-note').forEach(el => el.remove());
    if (!resultsA || !results.length) return;
    const rows = aStatRows(resultsA, results);
    for (const [key, id] of Object.entries(CARD_IDS)) {
        const row = rows[key], div = document.createElement('div');
        div.className = 'rs-a';
        const aVal = document.createElement('span');
        aVal.className = 'rs-a-val';
        aVal.textContent = `A ${row.a}`;
        div.append(aVal);
        $(id).parentElement.append(div);
    }
    const note = document.createElement('span');
    note.className = 'plan-dataend-note rs-a-note';
    note.textContent = '紫線＝對照組 A';
    $('rolling-sort').parentElement.append(note);
}

// 視圖重新載入時清除上次殘留的 A（不重繪）
export const resetRollingA = () => { resultsA = null; };

// 設定 / 取消對照組 A（rsA：simulateRolling 結果，null 或空陣列 = 取消）；有變化才重繪
export function setRollingA(rsA) {
    const next = rsA?.length ? rsA : null;
    if (!next && !resultsA) return;
    resultsA = next;
    renderAExtras();
    if (results.length) draw();
}

function select(startIdx) {
    selectedIdx = startIdx;
    draw();
    onSelect(startIdx);
}

// 事件只綁一次（視圖重新載入時元素會重建，故以 dataset 標記）
function bindControls() {
    const sortEl = $('rolling-sort'), pickEl = $('rolling-pick');
    if (sortEl.dataset.bound) return;
    sortEl.dataset.bound = '1';
    sortEl.addEventListener('click', e => {
        const btn = e.target.closest('[data-sort]');
        if (!btn) return;
        sortMode = btn.dataset.sort;
        sortEl.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === btn));
        draw();
    });
    pickEl.addEventListener('click', e => {
        const btn = e.target.closest('[data-pick]');
        if (btn) select(PICKS[btn.dataset.pick]());
    });
}

// 對照行：items = [{ label, rs }]（rs 為 simulateRolling 結果，空陣列表示資料不足）
export function renderCompare(items) {
    const val = v => `<span class="compare-val">${v}</span>`; // 內容皆為計算數字與固定標籤
    $('rolling-compare').innerHTML = items.map(({ label, rs }) => {
        if (!rs.length) return `<div>對照：${label}，資料不足模擬年數</div>`;
        const ok = rs.filter(r => !r.brokeDate).length;
        return `<div>對照：${label}，期末資產中位 ${val(fmtMoney(median(rs.map(r => r.final))))}、資金不斷鏈 ${val((ok / rs.length * 100).toFixed(0) + '%')}</div>`;
    }).join('');
}

// rs：simulateRolling 結果；years：模擬年數；dataEnd：資料截止日；dates：標的交易日陣列（對應 rs 的 startIdx）；handler(startIdx)：選中起點時呼叫；預設選中位數
export function renderRolling(rs, years, dataEnd, handler, dates, target = '00631L') {
    results = rs;
    // 依結果排序：期末資產優先；相同時（常見於資金斷鏈皆為 0）以撐過的天數為次要依據，讓斷鏈快慢排得出順序；
    // 連撐過天數都相同，再以投入金額排序（投入越多、結果一樣差，排名視為越差）
    byValue = [...rs].sort((a, b) =>
        a.final - b.final ||
        daysBetween(a.startDate, a.endDate) - daysBetween(b.startDate, b.endDate) ||
        b.invested - a.invested
    );
    onSelect = handler;
    bindControls();

    const ok = rs.filter(r => !r.brokeDate).length;
    $('rolling-desc').textContent =
        `同一份計畫從 ${ym(rs[0].startDate)} 到 ${ym(rs.at(-1).startDate)} 每個月第一個交易日各跑 ${years} 年，共 ${rs.length} 個起點（資料至 ${dataEnd.replace(/-/g, '/')}）。`;
    $('rs-success').textContent = `${(ok / rs.length * 100).toFixed(0)}%（${ok}/${rs.length}）`;
    $('rs-worst').textContent = fmtMoney(byValue[0].final);
    $('rs-median').textContent = fmtMoney(median(rs.map(r => r.final)));
    $('rs-best').textContent = fmtMoney(byValue.at(-1).final);
    const xirrMedian = median(rs.map(r => r.xirr ?? -1));
    $('rs-xirr').textContent = fmtRate(xirrMedian);
    $('rs-xirr').className = signClass(xirrMedian);

    // 標的上市前起跑的起點占比（含推算價格）；沒給 dates 或 0% 時整行隱藏
    const sim = $('rolling-sim');
    const is0050 = target === '0050';
    const pct = dates ? Math.round(rollingSimShare(rs, dates, is0050 ? LISTING_0050 : LISTING_631L).share * 100) : 0;
    sim.hidden = pct === 0;
    sim.textContent = `${pct}% 的起點在 ${is0050 ? '0050' : '00631L'} 上市前起跑，結果含推算價格`;

    renderAExtras();
    select(PICKS.median());
}
