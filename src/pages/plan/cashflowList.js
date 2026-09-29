/**
 * cashflowList.js
 * 現金流清單（頁籤 2）：新增 / 刪除列、依週期顯示欄位、讀寫 plan.cashflows
 * 以 DOM 為唯一狀態；欄位 name 為 cf{列}_{欄}（供錯誤標紅定位），每次增刪後重新編號
 */

const PERIODS = { monthly: '每月', yearly: '每年', once: '單次' };
const MAX_ROWS = 10;

const ROW_HTML = `
    <label class="plan-field cf-name"><span>名稱</span><input type="text" data-f="name" maxlength="20" placeholder="例：薪水"></label>
    <label class="plan-field"><span data-short="金額">金額（元）</span><input type="number" data-f="amount" step="1000"></label>
    <label class="plan-field"><span>週期</span><select data-f="period">${Object.entries(PERIODS).map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></label>
    <label class="plan-field cf-month"><span>月</span><input type="number" data-f="month" min="1" max="12"></label>
    <label class="plan-field"><span>日</span><input type="number" data-f="day" min="1" max="31"></label>
    <label class="plan-field"><span class="cf-from-label" data-short="起">第幾年起</span><input type="number" data-f="fromYear" min="1"></label>
    <label class="plan-field cf-to"><span data-short="迄">至第幾年</span><input type="number" data-f="toYear" min="1" placeholder="期末"></label>
    <button type="button" class="cf-del" title="刪除此列" aria-label="刪除此列">✕</button>`;

let list = null;

const rowsEl = () => [...list.querySelectorAll('.cf-row')];
const notify = () => list.closest('form').dispatchEvent(new Event('input')); // 更新頁籤狀態

// 依週期切換「月」「至第幾年」欄位與標籤
function syncRow(row) {
    const period = row.querySelector('[data-f=period]').value;
    const off = (sel, hide) => {
        const field = row.querySelector(sel);
        field.hidden = hide; // 電腦版顯示為虛線空框（保留對齊），手機版隱藏
        field.querySelector('input').tabIndex = hide ? -1 : 0;
    };
    off('.cf-month', period === 'monthly');
    off('.cf-to', period === 'once');
    const from = row.querySelector('.cf-from-label');
    from.textContent = period === 'once' ? '第幾年' : '第幾年起';
    from.dataset.short = period === 'once' ? '年' : '起'; // 手機版短標籤
}

function renumber() {
    rowsEl().forEach((row, i) => {
        row.querySelectorAll('[data-f]').forEach(el => { el.name = `cf${i}_${el.dataset.f}`; });
    });
    list.querySelector('.cf-add').hidden = rowsEl().length >= MAX_ROWS;
}

function addRow(f) {
    const row = document.createElement('div');
    row.className = 'cf-row';
    row.innerHTML = ROW_HTML; // 固定模板，使用者資料一律以 value 寫入
    const set = (k, v) => { row.querySelector(`[data-f=${k}]`).value = v ?? ''; };
    set('name', f.name); set('amount', f.amount); set('period', f.period);
    set('month', f.month); set('day', f.day); set('fromYear', f.fromYear); set('toYear', f.toYear);
    syncRow(row);
    list.querySelector('.cf-add').before(row);
}

// container 內建立清單並綁定事件（視圖重新載入時元素重建）
export function initCashflowList(container) {
    list = container;
    list.innerHTML = '<button type="button" class="cf-add">＋ 新增現金流</button>';
    list.addEventListener('click', e => {
        if (e.target.closest('.cf-add')) {
            addRow({ name: '', amount: '', period: 'monthly', month: 1, day: 5, fromYear: 1, toYear: null });
        } else if (e.target.closest('.cf-del')) {
            e.target.closest('.cf-row').remove();
        } else return;
        renumber();
        notify();
    });
    list.addEventListener('change', e => {
        if (e.target.dataset.f === 'period') syncRow(e.target.closest('.cf-row'));
    });
}

export function setCashflows(flows) {
    rowsEl().forEach(r => r.remove());
    flows.forEach(addRow);
    renumber();
}

// → { flows } 或 { error, field }
export function readCashflows() {
    const flows = [];
    for (const [i, row] of rowsEl().entries()) {
        const v = k => row.querySelector(`[data-f=${k}]`).value.trim();
        const n = k => Number(v(k));
        const err = (k, msg) => ({ error: `現金流第 ${i + 1} 列：${msg}`, field: `cf${i}_${k}` });
        const period = v('period');
        if (v('amount') === '' || !Number.isFinite(n('amount'))) return err('amount', '金額請填數字');
        if (period !== 'monthly' && !(Number.isInteger(n('month')) && n('month') >= 1 && n('month') <= 12)) return err('month', '月請填 1～12');
        if (!(Number.isInteger(n('day')) && n('day') >= 1 && n('day') <= 31)) return err('day', '日請填 1～31');
        if (!(Number.isInteger(n('fromYear')) && n('fromYear') >= 1)) return err('fromYear', '第幾年請填 1 以上的整數');
        const toYear = period === 'once' || v('toYear') === '' ? null : n('toYear');
        if (toYear != null && !(Number.isInteger(toYear) && toYear >= n('fromYear'))) return err('toYear', '至第幾年需為整數且不小於起始年');
        flows.push({
            name: v('name'), amount: n('amount'), period,
            month: period === 'monthly' ? 1 : n('month'), day: n('day'), fromYear: n('fromYear'), toYear
        });
    }
    return { flows };
}
