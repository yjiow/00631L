/**
 * tradeStart.js
 * 自主實戰開局：讀取並驗證初始金額與手續費折扣
 */

import { parseMoney } from '../../ui/moneyInput.js';

export const MIN_INITIAL = 100000;

// → { initial, costs } 或 { error }
export function readStartForm() {
    const initial = parseMoney(document.getElementById('trade-initial').value);
    const discount = Number(document.getElementById('trade-discount').value);
    if (!Number.isInteger(initial) || initial < MIN_INITIAL) return { error: `初始金額須為整數，且不得低於 ${MIN_INITIAL.toLocaleString('en-US')} 元` };
    if (!(discount >= 0.1 && discount <= 10)) return { error: '手續費折扣請填 0.1～10 折' };
    return { initial, costs: { enabled: true, discount: discount / 10, minFee: 1 } };
}

export function showStartError(msg) {
    const el = document.getElementById('trade-start-error');
    el.textContent = msg;
    el.hidden = !msg;
}
