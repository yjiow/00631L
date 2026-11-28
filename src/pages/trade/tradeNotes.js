/**
 * tradeNotes.js
 * 自主實戰結算說明：依雙方數字產生白話句子（只陳述差異，不做因果推論或建議）
 */

import { fmtYuan } from '../plan/planFormat.js';
import { mddText, rateText } from './tradeFmt.js';

// a = 操作者、b = 對照策略（game.snapshot() 的欄位）→ 3 句字串陣列
export function settlementNotes(a, b) {
    const ra = Math.round(a.value), rb = Math.round(b.value);
    let money;
    if (ra === rb) {
        money = `最終資產與對照策略相同（${fmtYuan(ra)}）。`;
    } else {
        const rates = a.ret == null || b.ret == null ? '' : `（報酬率 ${rateText(a.ret)} 對 ${rateText(b.ret)}）`;
        money = `最終資產：你 ${fmtYuan(ra)}、對照策略 ${fmtYuan(rb)}，你${ra > rb ? '多' : '少'}了 ${fmtYuan(Math.abs(ra - rb))}${rates}。`;
    }

    // 回撤為負數：越小代表跌得越深；以顯示的小數 1 位判斷是否相同
    const ma = Math.round(a.mdd * 10), mb = Math.round(b.mdd * 10);
    const judge = ma === mb ? '兩者相同' : `你跌得${ma < mb ? '更深' : '較淺'}`;
    const risk = `最大回撤：你 ${mddText(a.mdd)}、對照策略 ${mddText(b.mdd)}（${judge}）。`;

    const cost = `交易與費用：你 ${a.tradeCount} 筆、${fmtYuan(a.costTotal)}；對照策略 ${b.tradeCount} 筆、${fmtYuan(b.costTotal)}。`;
    return [money, risk, cost];
}
