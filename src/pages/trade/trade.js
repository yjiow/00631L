/**
 * trade.js
 * 自主實戰頁控制器：載入資料 → 開局 / 還原存檔 → 逐日操作 → 結算
 * 由 router.js 在載入 views/trade.html 後呼叫 initTrade()；遊戲狀態只在記憶體，進度靠 tradeStorage 重播
 */

import { fetchBacktestData, getLatestDate } from '../../core/database.js';
import { buildSeries, pickStartIdx } from '../../core/trade/series.js';
import { createGame, toSave, replay } from '../../core/trade/game.js';
import { bindMoneyInputs } from '../../ui/moneyInput.js';
import { saveTrade, loadTrade, clearTrade } from './tradeStorage.js';
import { readStartForm, showStartError } from './tradeStart.js';
import { renderPanel, submitAction, showError, bindPanel, resetInputs } from './tradePanel.js';
import { renderCompare, renderResult } from './tradeCards.js';
import { renderPriceCharts, renderTrendChart, destroyTradeCharts } from './tradeCharts.js';

const $ = id => document.getElementById(id);

let series = null; // 資料載入一次
let game = null;

// 只顯示其中一個區塊：loading / start / play
function show(section) {
    $('trade-loading').hidden = section !== 'loading';
    $('trade-start').hidden = section !== 'start';
    $('trade-play').hidden = section !== 'play';
}

function showLoadError(msg) {
    $('trade-loading').textContent = msg;
    show('loading');
}

// 依遊戲狀態更新全部畫面
function render() {
    const settled = game.settled;
    $('trade-day').textContent = game.day;
    $('trade-settled-tag').hidden = !settled;
    $('trade-head-btns').hidden = settled;
    $('trade-op').hidden = settled;
    $('trade-result').hidden = !settled;
    cancelRestart();
    if (settled) renderResult(game, playAgain);
    else renderPanel(game);
    renderPriceCharts(series, game.idx);
    renderCompare(game);
    renderTrendChart(game.history);
}

const persist = () => saveTrade(toSave(game));

function beginGame() {
    const r = readStartForm();
    if (r.error) { showStartError(r.error); return; }
    showStartError('');
    const startIdx = pickStartIdx(series);
    if (startIdx == null) { showStartError('資料不足，無法抽取起始日'); return; }
    game = createGame(series, startIdx, { initial: r.initial, costs: r.costs });
    persist();
    showError('');
    resetInputs();
    show('play');
    render();
}

function onAct() {
    if (!game || game.settled) return;
    if (!submitAction(game)) return;
    persist();
    render();
}

function onSettle() {
    if (!game || game.settled) return;
    game.settle();
    persist();
    render();
}

function playAgain() {
    clearTrade();
    game = null;
    resetInputs();
    showStartError('');
    show('start');
}

// 重新開始：同一列內二次確認（不用瀏覽器對話框）
function cancelRestart() {
    $('trade-restart-confirm').hidden = true;
    $('trade-restart').hidden = false;
}

function bindEvents() {
    bindMoneyInputs($('trade-app'));
    bindPanel(() => game, onAct);
    $('trade-begin').addEventListener('click', beginGame);
    $('trade-act').addEventListener('click', onAct);
    $('trade-settle').addEventListener('click', onSettle);
    $('trade-restart').addEventListener('click', () => {
        $('trade-restart').hidden = true;
        $('trade-restart-confirm').hidden = false;
    });
    $('trade-restart-no').addEventListener('click', cancelRestart);
    $('trade-restart-yes').addEventListener('click', playAgain);
}

// 有存檔且可重播 → 回傳遊戲；否則清除損毀存檔回 null
function restoreGame() {
    const save = loadTrade();
    if (!save) { clearTrade(); return null; }
    try {
        const g = replay(series, save);
        if (g) return g;
    } catch { /* 損毀存檔 */ }
    clearTrade();
    return null;
}

export async function initTrade() {
    destroyTradeCharts();
    game = null;
    bindEvents();
    try {
        if (!series) {
            const latest = await getLatestDate();
            series = buildSeries(await fetchBacktestData('2000-01-01', latest));
        }
    } catch (e) {
        if (!$('trade-app')) return;
        console.warn('自主實戰資料載入失敗', e);
        showLoadError('資料載入失敗，請重新整理後再試。');
        return;
    }
    if (!$('trade-app')) return; // 載入期間已切換到其他頁
    game = restoreGame();
    if (game) { show('play'); render(); }
    else show('start');
}
