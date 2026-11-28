/**
 * tradeCards.js
 * 自主實戰：兩組對照卡（操作者 / 對照組）與結算畫面
 */

import { fmtYuan, fmtRate, signClass, ymd } from '../plan/planFormat.js';
import { simulatedShare } from '../../core/trade/series.js';
import { mddText, rateText } from './tradeFmt.js';
import { settlementNotes } from './tradeNotes.js';

const $ = id => document.getElementById(id);
const sharesText = n => n.toLocaleString('en-US') + ' 股';
const signed = (v, text) => (v > 0 && !/^[+-]?0(\.0%| 元)?$/.test(text) ? '+' : '') + text;

const REASON = { rebalance: '再平衡', shortfall: '減碼賣股補足' };
const trow = (label, va, vb, ca = '', cb = '') => `<tr><td>${label}</td><td class="${ca}">${va}</td><td class="${cb}">${vb}</td></tr>`;
const retCls = s => (s.ret == null || rateText(s.ret) === '0.0%' ? '' : signClass(s.ret));
const retText = s => (s.ret == null ? '—' : signed(s.ret, rateText(s.ret)));

// 對照組自上次執行後的動作說明（讓使用者看到策略何時出手）
function strategyNote(game) {
    const list = game.bLast ?? [];
    if (game.broke) return '對照組資金斷鏈，已停止運作。';
    if (!list.length) return '對照組自上次執行後沒有買賣（未達 20% 門檻）。';
    const parts = list.map(t => `第 ${t.day} 天${REASON[t.reason] ?? '調整'}${t.type === 'buy' ? '買進' : '賣出'} ${t.shares.toLocaleString('en-US')} 股`);
    return '對照組自上次執行後：' + parts.join('；');
}

// 兩組對照表（左操作者、右對照組）
export function renderCompare(game) {
    const { a, b } = game.snapshot();
    $('trade-compare').innerHTML = `<div class="panel-title">兩組對照</div>
        <table class="trade-table trade-compare-table">
            <thead><tr><th></th><th>操作者</th><th>對照策略${b.broke ? '<span class="trade-tag trade-tag-warn">斷鏈</span>' : ''}<small>50/50 · 20%</small></th></tr></thead>
            <tbody>
                ${trow('總資產', fmtYuan(a.value), fmtYuan(b.value))}
                ${trow('淨投入', fmtYuan(a.invested), fmtYuan(b.invested))}
                ${trow('報酬金額', signed(a.profit, fmtYuan(a.profit)), signed(b.profit, fmtYuan(b.profit)), signClass(a.profit), signClass(b.profit))}
                ${trow('報酬率', retText(a), retText(b), retCls(a), retCls(b))}
                ${trow('最大回撤', mddText(a.mdd), mddText(b.mdd))}
                ${trow('股票占比', fmtRate(a.stockRatio), fmtRate(b.stockRatio))}
                ${trow('手續費+稅', fmtYuan(a.costTotal), fmtYuan(b.costTotal))}
                ${trow('現金', fmtYuan(a.cash), fmtYuan(b.cash))}
                ${trow('0050', sharesText(a.shares50), '—')}
                ${trow('00631L', sharesText(a.shares631), sharesText(b.shares631))}
            </tbody>
        </table>
        <p class="trade-strategy-note">${strategyNote(game)}</p>`;
}

// 結算畫面：揭曉真實起訖日；game 須已結算
export function renderResult(game, onAgain) {
    const { a, b } = game.snapshot();
    const { dates } = game.series;
    const ra = Math.round(a.value), rb = Math.round(b.value);
    const verdict = ra === rb ? '平手' : ra > rb ? '操作者勝' : '對照組（對照策略）勝';
    const line = (label, fa, fb) => `<tr><td>${label}</td><td>${fa}</td><td>${fb}</td></tr>`;
    const el = $('trade-result');
    el.innerHTML = `<div class="panel-title">結算</div>
        <div class="trade-verdict">${verdict}</div>
        <p class="trade-desc">真實期間：${ymd(dates[game.startIdx])} ～ ${ymd(dates[game.endIdx])}（共 ${game.day} 個交易日）</p>
        <p class="trade-desc">這局有 ${Math.round(simulatedShare(game.series, game.startIdx, game.endIdx) * 100)}% 的交易日是推算價格（00631L 上市前）</p>
        <ul class="trade-notes">${settlementNotes(a, b).map(s => `<li>${s}</li>`).join('')}</ul>
        <div class="trade-table-wrap"><table class="trade-table">
            <thead><tr><th></th><th>操作者</th><th>對照組${b.broke ? '（資金斷鏈）' : ''}</th></tr></thead>
            <tbody>
                ${line('最終資產', fmtYuan(a.value), fmtYuan(b.value))}
                ${line('報酬率', a.ret == null ? '—' : rateText(a.ret), b.ret == null ? '—' : rateText(b.ret))}
                ${line('最大回撤', mddText(a.mdd), mddText(b.mdd))}
                ${line('交易次數', a.tradeCount + ' 筆', b.tradeCount + ' 筆')}
                ${line('累計手續費與證交稅', fmtYuan(a.costTotal), fmtYuan(b.costTotal))}
            </tbody>
        </table></div>
        <div class="trade-result-actions">
            <button type="button" id="trade-again" class="btn-primary trade-btn-wide">再玩一次</button>
            <a id="trade-to-plan" class="trade-btn trade-btn-link" href="?view=plan" data-view="plan">用投資計畫看長期結果</a>
        </div>`;
    $('trade-again').addEventListener('click', onAgain);
}
