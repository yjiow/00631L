/**
 * dipList.js
 * 大跌加碼階梯清單（頁籤 5）：「回撤 X% → 動用現金 Y%」最多 3 列，讀寫 plan.dipBuy.tiers
 * 以 DOM 為唯一狀態；欄位 name 為 dt{列}_{欄}（供錯誤標紅定位），每次增刪後重新編號
 */

import { MAX_TIERS } from '../../core/plan/dipBuy.js';

const ROW_HTML = `
    <span class="sr-text">回撤</span>
    <input type="number" data-f="drawdown" min="1" max="99" step="5" aria-label="回撤幅度（%）">
    <span class="sr-text">% → 動用現金</span>
    <input type="number" data-f="cashPct" min="0" max="100" step="5" aria-label="動用現金比例（%）">
    <span class="sr-text">%</span>
    <button type="button" class="cf-del" title="刪除此階" aria-label="刪除此階">✕</button>`;

let list = null;
let off = false; // 功能關閉：整份清單不可編輯

const rowsEl = () => [...list.querySelectorAll('.sr-row')];
const notify = () => list.closest('form').dispatchEvent(new Event('input')); // 更新頁籤狀態
const fieldsOf = row => row.querySelectorAll('input, button');

function renumber() {
    rowsEl().forEach((row, i) => {
        row.querySelectorAll('[data-f]').forEach(el => { el.name = `dt${i}_${el.dataset.f}`; });
        fieldsOf(row).forEach(el => { el.disabled = off; });
    });
    list.querySelector('.sr-add').disabled = off || rowsEl().length >= MAX_TIERS;
}

function addRow(t) {
    const row = document.createElement('div');
    row.className = 'sr-row';
    row.innerHTML = ROW_HTML;
    const show = x => x == null ? '' : +(x * 100).toFixed(2);
    row.querySelector('[data-f=drawdown]').value = show(t.drawdown);
    row.querySelector('[data-f=cashPct]').value = show(t.cashPct);
    list.querySelector('.sr-add').before(row);
    return row;
}

// container 內建立清單並綁定事件（視圖重新載入時元素重建）
export function initDipList(container) {
    list = container;
    off = false;
    list.innerHTML = '<button type="button" class="cf-add sr-add">＋ 新增階段</button>';
    list.addEventListener('click', e => {
        if (e.target.closest('.sr-add')) {
            if (off || rowsEl().length >= MAX_TIERS) return;
            addRow({}).querySelector('[data-f=drawdown]').focus({ preventScroll: true });
        } else if (e.target.closest('.cf-del')) {
            if (off) return;
            e.target.closest('.sr-row').remove();
        } else return;
        renumber();
        notify();
    });
}

export function setDips(tiers) {
    rowsEl().forEach(r => r.remove());
    tiers.forEach(addRow);
    renumber();
}

export function setDipsDisabled(flag) {
    off = flag;
    renumber();
}

// → { tiers: [{ drawdown, cashPct }]（0~1，空欄為 NaN）}；兩欄皆空的列自動刪除
export function readDips() {
    const val = (row, k) => row.querySelector(`[data-f=${k}]`).value.trim();
    const blank = rowsEl().filter(r => !val(r, 'drawdown') && !val(r, 'cashPct'));
    if (blank.length) {
        blank.forEach(r => r.remove());
        renumber();
        notify();
    }
    const frac = v => v === '' ? NaN : +(Number(v) / 100).toFixed(4);
    return { tiers: rowsEl().map(r => ({ drawdown: frac(val(r, 'drawdown')), cashPct: frac(val(r, 'cashPct')) })) };
}
