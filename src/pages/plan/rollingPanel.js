/**
 * rollingPanel.js
 * 滾動起點分布：數字卡、長條圖、排序切換、快速選取（最差 / 中位 / 最好）
 */

import { renderRollingChart } from '../../charts/planCharts.js';
import { fmtMoney, fmtRate, ym, signClass } from './planFormat.js';
import { daysBetween } from '../../core/plan/calendar.js';

const $ = id => document.getElementById(id);

let results = [];     // simulateRolling 結果（依時間）
let byValue = [];     // 依期末資產由差到好
let sortMode = 'time';
let selectedIdx = null;
let onSelect = () => {};

const median = arr => {
    const s = [...arr].sort((a, b) => a - b), n = s.length;
    return n % 2 ? s[n >> 1] : (s[n / 2 - 1] + s[n / 2]) / 2;
};

// 快速選取對應的起點
const PICKS = {
    worst: () => byValue[0].startIdx,
    median: () => byValue[(byValue.length - 1) >> 1].startIdx,
    best: () => byValue.at(-1).startIdx
};

function draw() {
    const items = sortMode === 'time' ? results : byValue;
    renderRollingChart(items, selectedIdx, median(results.map(r => r.final)), select, sortMode === 'value');
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

// rs：simulateRolling 結果；years：模擬年數；dataEnd：資料截止日；handler(startIdx)：選中起點時呼叫；預設選中位數
export function renderRolling(rs, years, dataEnd, handler) {
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

    select(PICKS.median());
}
