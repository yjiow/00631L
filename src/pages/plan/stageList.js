/**
 * stageList.js
 * 股票比例時程清單（頁籤 1 基本設定）：新增 / 刪除階段、讀寫 plan.stockRatioSchedule
 * 以 DOM 為唯一狀態；欄位 name 為 sr{列}_{欄}（供錯誤標紅定位），每次增刪後重新編號
 */

export const MAX_STAGES = 4;

const ROW_HTML = `
    <span class="sr-text">第</span>
    <input type="number" data-f="fromYear" min="2" step="1" aria-label="第幾年起">
    <span class="sr-text">年起 →</span>
    <input type="number" data-f="ratio" min="0" max="100" step="5" aria-label="股票比例（%）">
    <span class="sr-text">%</span>
    <button type="button" class="cf-del" title="刪除此階段" aria-label="刪除此階段">✕</button>`;

let list = null;

const rowsEl = () => [...list.querySelectorAll('.sr-row')];
const notify = () => list.closest('form').dispatchEvent(new Event('input')); // 更新頁籤狀態

function renumber() {
    rowsEl().forEach((row, i) => {
        row.querySelectorAll('[data-f]').forEach(el => { el.name = `sr${i}_${el.dataset.f}`; });
    });
    list.querySelector('.sr-add').disabled = rowsEl().length >= MAX_STAGES;
}

function addRow(s) {
    const row = document.createElement('div');
    row.className = 'sr-row';
    row.innerHTML = ROW_HTML;
    row.querySelector('[data-f=fromYear]').value = s.fromYear ?? '';
    row.querySelector('[data-f=ratio]').value = s.ratio == null ? '' : Math.round(s.ratio * 100);
    list.querySelector('.sr-add').before(row);
    return row;
}

// container 內建立清單並綁定事件（視圖重新載入時元素重建）
export function initStageList(container) {
    list = container;
    list.innerHTML = '<button type="button" class="cf-add sr-add">＋ 新增階段</button>';
    list.addEventListener('click', e => {
        if (e.target.closest('.sr-add')) {
            if (rowsEl().length >= MAX_STAGES) return;
            addRow({}).querySelector('[data-f=fromYear]').focus({ preventScroll: true });
        } else if (e.target.closest('.cf-del')) {
            e.target.closest('.sr-row').remove();
        } else return;
        renumber();
        notify();
    });
}

export function setStages(stages) {
    rowsEl().forEach(r => r.remove());
    stages.forEach(addRow);
    renumber();
}

// → { stages } 或 { error, field }；兩欄皆空的列自動刪除；years 為模擬年數
export function readStages(years) {
    const val = (row, k) => row.querySelector(`[data-f=${k}]`).value.trim();
    const blank = rowsEl().filter(r => !val(r, 'fromYear') && !val(r, 'ratio'));
    if (blank.length) {
        blank.forEach(r => r.remove());
        renumber();
        notify();
    }
    const stages = [];
    for (const [i, row] of rowsEl().entries()) {
        const from = Number(val(row, 'fromYear')), ratio = Number(val(row, 'ratio'));
        const err = (k, msg) => ({ error: `股票比例時程第 ${i + 1} 列：${msg}`, field: `sr${i}_${k}` });
        if (!Number.isInteger(from) || from < 2 || from >= years) return err('fromYear', `第幾年請填 2～${years - 1} 的整數`);
        if (stages.length && from <= stages.at(-1).fromYear) return err('fromYear', '年數需大於上一列');
        if (val(row, 'ratio') === '' || !(ratio >= 0 && ratio <= 100)) return err('ratio', '比例請填 0～100');
        stages.push({ fromYear: from, ratio: ratio / 100 });
    }
    return { stages };
}
