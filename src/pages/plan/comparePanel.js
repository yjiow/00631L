/**
 * comparePanel.js
 * 方案對照區塊（A vs 目前 B）：標籤、對照表、不同的參數清單、A 完整參數 Modal；計算見 planDiff.js
 */
import { fmtMoney, fmtRate, signClass } from './planFormat.js';
import { bindDocKey } from '../../ui/docKey.js';
import { shouldFold } from './planDiff.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// 差異欄：金額 / 百分點，▲▼ + 正負號；0 顯示 —（顏色沿用漲跌色：正紅負綠）
const deltaCell = (d, fmtAbs, zero) => {
    if (!d || zero(d)) return '<td class="cmp-delta">—</td>';
    return `<td class="cmp-delta ${signClass(d)}">${d > 0 ? '▲ +' : '▼ −'}${fmtAbs(Math.abs(d))}</td>`;
};
const pt = v => (v * 100).toFixed(1) + ' pt';
const isZeroPt = d => +(d * 100).toFixed(1) === 0;
const isZeroMoney = d => Math.abs(d) < 0.5;

// stats = compareStats 結果
function tableRows(s) {
    const money = (label, a, b) => `<tr><th>${label}</th><td>${fmtMoney(a)}</td><td>${fmtMoney(b)}</td>${deltaCell(b - a, fmtMoney, isZeroMoney)}</tr>`;
    return [
        money('期末資產 中位', s.a.median, s.b.median),
        money('期末資產 最差', s.a.worst, s.b.worst),
        money('期末資產 最佳', s.a.best, s.b.best),
        `<tr><th>XIRR 中位</th><td>${fmtRate(s.a.xirrMedian)}</td><td>${fmtRate(s.b.xirrMedian)}</td>${deltaCell(s.b.xirrMedian - s.a.xirrMedian, pt, isZeroPt)}</tr>`,
        `<tr><th>最大回撤 中位</th><td>${s.a.mddMedian.toFixed(1)}%</td><td>${s.b.mddMedian.toFixed(1)}%</td>${deltaCell((s.b.mddMedian - s.a.mddMedian) / 100, pt, isZeroPt)}</tr>`,
        `<tr><th>B 優於 A 的起點</th><td>—</td><td>${s.better} / ${s.n}（${(s.betterPct * 100).toFixed(0)}%）</td><td class="cmp-delta">—</td></tr>`
    ].join('');
}

function diffHtml(diff) {
    if (!diff.length) return '<p class="cmp-empty">尚無差異，改參數後按「開始模擬」</p>';
    const list = `<ul class="cmp-diff-list">${diff.map(d => `<li>${esc(d.text)}</li>`).join('')}</ul>`;
    return shouldFold(diff)
        ? `<details class="cmp-diff-fold"><summary>共 ${diff.length} 項差異，點開查看</summary>${list}</details>`
        : list;
}

// summary：A 的一行摘要；stats：compareStats 結果；diff：diffPlans 結果
export function renderCompareBlock({ summary, stats, diff }) {
    $('cmp-label').textContent = `A：${summary}`;
    $('cmp-body').innerHTML = stats
        ? tableRows(stats)
        : '<tr><td colspan="4" class="cmp-empty">資料不足，無法對照</td></tr>';
    const open = $('cmp-diff').querySelector('details')?.open; // 重算時保留摺疊展開狀態
    $('cmp-diff').innerHTML = diffHtml(diff);
    if (open) $('cmp-diff').querySelector('details')?.setAttribute('open', '');
}

// A 完整參數 Modal；lines = describePlan 結果
export function openPinModal(lines) {
    $('modal-pin-list').innerHTML = lines.map(l => `<div class="cmp-param"><span>${esc(l.label)}</span><span>${esc(l.text)}</span></div>`).join('');
    $('modal-pin').style.display = 'flex';
}

// 事件只綁一次（視圖重新載入時元素會重建，故以 dataset 標記）
export function bindCompare({ onUnpin, onRestore, onView }) {
    const block = $('plan-compare');
    if (block.dataset.bound) return;
    block.dataset.bound = '1';
    $('cmp-unpin').addEventListener('click', onUnpin);
    $('cmp-restore').addEventListener('click', onRestore);
    $('cmp-view').addEventListener('click', onView);
    const modal = $('modal-pin'), close = () => { modal.style.display = 'none'; };
    $('modal-pin-close').addEventListener('click', close);
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
    bindDocKey('modal-pin', e => { if (e.key === 'Escape' && modal.style.display !== 'none') close(); });
}
