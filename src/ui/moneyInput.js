/**
 * moneyInput.js
 * 金額輸入框千分位：<input type="text" data-money> 輸入時自動加逗號（保留游標位置）
 * data-money="signed" 允許開頭負號；讀值一律用 parseMoney
 */

// 數值 → '1,234,567'（空值 / 非數字回傳 ''）
export function formatMoney(v) {
    if (v === '' || v == null || !Number.isFinite(Number(v))) return '';
    return Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

// '1,234,567' → 1234567（空字串為 0，同 Number('')）
export const parseMoney = s => Number(String(s).replace(/,/g, ''));

// 只留數字（signed 時保留開頭負號、小數點後捨去）後加逗號，游標維持在同一個數字之後
// 刪除輸入（inputType 為 delete*）時保留全 0 的位數（刪掉首位後可接著輸入新的首位，如 30,000 刪 3 再打 5 → 50,000），離開欄位才收成 0
function reformat(el, inputType = '') {
    const signed = el.dataset.money === 'signed';
    const raw = el.value;
    const intRaw = raw.split('.')[0]; // 金額以元為單位：小數部分捨去，避免 1234.5 被當成 12345
    const caret = Math.min(el.selectionStart ?? raw.length, intRaw.length);
    const keep = ch => /\d/.test(ch);
    const digitsBefore = [...raw.slice(0, caret)].filter(keep).length;
    const neg = signed && raw.trimStart().startsWith('-');
    let digits = [...intRaw].filter(keep).join('').replace(/^0+(?=[1-9])/, '');
    if (/^0+$/.test(digits) && !inputType.startsWith('delete')) digits = '0';
    const text = (neg ? '-' : '') + digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    if (text === raw) return;
    el.value = text;
    let pos = neg ? 1 : 0, seen = 0;
    while (pos < text.length && seen < digitsBefore) { if (/\d/.test(text[pos])) seen++; pos++; }
    el.setSelectionRange(pos, pos);
}

// root 內所有 [data-money]（含之後新增的）以事件委派處理
export function bindMoneyInputs(root) {
    root.addEventListener('input', e => { if (e.target.matches?.('[data-money]')) reformat(e.target, e.inputType); });
    root.addEventListener('focusout', e => {
        const el = e.target;
        if (el.matches?.('[data-money]') && /^-?0{2,}$/.test(el.value.replace(/,/g, ''))) el.value = '0';
    });
}
