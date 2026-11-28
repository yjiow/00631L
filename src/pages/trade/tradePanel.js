/**
 * tradePanel.js
 * 自主實戰：每日操作面板（讀取輸入 → game.act；今日收盤價、快捷買賣、跳過天數快捷鈕）
 */

import { parseMoney } from '../../ui/moneyInput.js';
import { tradeCost } from '../../core/plan/fees.js';

const $ = id => document.getElementById(id);
const num = id => { const v = $(id).value.trim(); return v === '' ? 0 : Number(v); };
const cashInput = () => ($('trade-cash').value.trim() === '' ? 0 : parseMoney($('trade-cash').value));
const QTY_IDS = ['trade-buy50', 'trade-sell50', 'trade-buy631', 'trade-sell631'];

// 更新今日收盤價、現金與第 1 天提示
export function renderPanel(game) {
    const { p631, p50 } = game.series, i = game.idx;
    const chg = arr => i > 0 && arr[i - 1] ? ` (${arr[i] >= arr[i - 1] ? '+' : ''}${((arr[i] / arr[i - 1] - 1) * 100).toFixed(2)}%)` : '';
    $('trade-px-631').textContent = p631[i].toFixed(2) + chg(p631);
    $('trade-px-50').textContent = p50[i].toFixed(2) + chg(p50);
    $('trade-cash-now').textContent = Math.round(game.a.cash).toLocaleString('en-US');
    $('trade-day1-note').hidden = game.day !== 1;
    updateActLabel();
}

export function showError(msg) {
    const el = $('trade-error');
    el.textContent = msg;
    el.hidden = !msg;
}

// 執行鈕文字與跳過快捷鈕的選中狀態跟著跳過天數
function updateActLabel() {
    const n = num('trade-skip');
    $('trade-act').textContent = `執行並前進 ${n >= 1 ? n : 1} 天`;
    document.querySelectorAll('[data-skip]').forEach(b => b.classList.toggle('active', Number(b.dataset.skip) === n));
}

export function resetInputs() {
    $('trade-cash').value = '0';
    QTY_IDS.forEach(id => { $(id).value = '0'; });
    $('trade-skip').value = '1';
    updateActLabel();
}

// 現金 budget 在價格 price 下最多買幾股（含手續費）
function maxShares(budget, price, costs) {
    let n = Math.floor(budget / price);
    while (n > 0 && n * price + tradeCost(n * price, 'buy', costs) > budget) n--;
    return Math.max(n, 0);
}

// 快捷買賣：以「目前現金 + 加減碼輸入 + 已填賣出所得」為預算
function quick(game, kind) {
    const { p631, p50 } = game.series, i = game.idx, costs = game.costs;
    const a = game.a;
    if (kind === 'clear') { QTY_IDS.forEach(id => { $(id).value = '0'; }); return; }
    if (kind === 'sellall') {
        $('trade-sell50').value = a.shares50;
        $('trade-sell631').value = a.shares631;
        return;
    }
    const sellGain = (id, price) => { const n = num(id); return n > 0 ? n * price - tradeCost(n * price, 'sell', costs) : 0; };
    const budget = a.cash + cashInput() + sellGain('trade-sell50', p50[i]) + sellGain('trade-sell631', p631[i]);
    if (budget <= 0) return;
    const share = kind === 'half' ? budget / 2 : budget;
    $('trade-buy50').value = kind === 'all631' ? 0 : maxShares(share, p50[i], costs);
    $('trade-buy631').value = kind === 'all50' ? 0 : maxShares(share, p631[i], costs);
}

// 綁定快捷鈕、跳過鈕與 Enter 執行（onAct 為執行回呼；getGame 取得目前遊戲）
export function bindPanel(getGame, onAct) {
    document.querySelectorAll('[data-quick]').forEach(btn => btn.addEventListener('click', () => {
        const g = getGame();
        if (g && !g.settled) quick(g, btn.dataset.quick);
    }));
    document.querySelectorAll('[data-skip]').forEach(btn => btn.addEventListener('click', () => {
        $('trade-skip').value = btn.dataset.skip;
        updateActLabel();
    }));
    $('trade-skip').addEventListener('input', updateActLabel);
    $('trade-op').addEventListener('keydown', e => {
        if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); onAct(); }
    });
}

// 執行當天操作；成功回 true（並清空輸入），失敗顯示錯誤、狀態不變
export function submitAction(game) {
    const action = { cash: cashInput(), buy50: num('trade-buy50'), buy631: num('trade-buy631'), sell50: num('trade-sell50'), sell631: num('trade-sell631') };
    const r = game.act(action, num('trade-skip'));
    if (!r.ok) { showError(r.error); return false; }
    showError('');
    resetInputs();
    return true;
}
