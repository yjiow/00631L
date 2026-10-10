/**
 * yearlyDetailModal.js
 * 年度明細 Modal（點年度列開啟）：按時間列出該年所有現金流與買賣，附交易後現金與股票市值（算好的金額，股數 × 股價列為小字附註），供比對現金／市值判斷是否真的需要再平衡
 */
import { fmtYuan, ymd } from './planFormat.js';
import { bindDocKey } from '../../ui/docKey.js';

const TYPE_LABEL = { flow: '收支', buy: '買進', sell: '賣出', interest: '利息' };
const REASON_LABEL = { initial: '期初配置', inflow: '入帳', purchase: '定期購買', rebalance: '再平衡', stage: '比例切換', shortfall: '扣款賣股', dip: '大跌加碼', recover: '大跌收回' };

const $ = id => document.getElementById(id);

// 同一天可能有多筆交易（如入帳當天即再平衡），但交易後現金／市值皆為當天收盤後的結果、彼此相同
// → 同一天合併為一組，日期與這兩欄只在組內第一列顯示（rowspan），避免看起來像重複或算錯
function groupByDate(trades) {
    const groups = [];
    for (const t of trades) {
        const last = groups.at(-1);
        if (last && last.date === t.date) last.items.push(t);
        else groups.push({ date: t.date, items: [t] });
    }
    return groups;
}

// 注意：合併列（rowspan）後各 <tr> 的 <td> 數量不同，靠右對齊 / 等寬數字字體一律用 class 標示，
// 不可用 :nth-child 判斷欄位（同一列裡第幾個 <td> 不等於視覺上第幾欄）
function itemCells(t) {
    const cashDelta = t.type === 'flow' || t.type === 'interest' ? t.amount : t.type === 'buy' ? -(t.amount + t.cost) : t.amount - t.cost; // buy/sell 的 amount 為成交金額（未扣成本）
    const sign = cashDelta > 0 ? 'positive' : cashDelta < 0 ? 'negative' : '';
    const desc = t.type === 'flow' ? (t.name || '現金流') : t.type === 'interest' ? '現金利息' : (REASON_LABEL[t.reason] ?? '');
    return `<td>${TYPE_LABEL[t.type]}</td><td>${desc}</td><td class="yearly-modal-num ${sign}">${cashDelta > 0 ? '+' : ''}${fmtYuan(cashDelta)}</td>`;
}

// dailyMap：date → { cash, shares, value }（simulatePlan 的 daily，供交易後現金 / 市值查詢）；zebra：同一天內的列同色，不用 hover（純呈現，見網站格式.md）
function groupHtml(group, dailyMap, zebra) {
    const n = group.items.length;
    const d = dailyMap.get(group.date);
    const stockValue = d ? d.value - d.cash : null;
    const price = d && d.shares > 0 ? stockValue / d.shares : null;
    const marketCell = stockValue == null ? '—'
        : fmtYuan(stockValue) + (price != null ? `<span class="yearly-modal-sub">${d.shares.toLocaleString()} 股 × ${price.toFixed(1)}</span>` : '');
    return group.items.map((t, i) => `<tr class="${zebra}">
        ${i === 0 ? `<td class="yearly-modal-date" rowspan="${n}">${ymd(group.date)}</td>` : ''}
        ${itemCells(t)}
        ${i === 0 ? `<td class="yearly-modal-num" rowspan="${n}">${d ? fmtYuan(d.cash) : '—'}</td><td class="yearly-modal-num" rowspan="${n}">${marketCell}</td>` : ''}
    </tr>`).join('');
}

let state = null; // { years, idx, trades, dailyMap }：供「上一年 / 下一年」切換

// years：yearlySummary 全部年度列（含 fromDate / endDate）；year：要開啟的那一年；trades：完整交易紀錄；dailyMap：date → daily 項目
export function showYearlyDetail(year, trades, dailyMap, years = [year]) {
    state = { years, idx: Math.max(0, years.findIndex(y => y.year === year.year)), trades, dailyMap };
    renderYear();
}

function renderYear() {
    const { years, idx, trades, dailyMap } = state;
    const year = years[idx];
    $('modal-yearly-prev').disabled = idx === 0;
    $('modal-yearly-next').disabled = idx === years.length - 1;
    const rows = trades.filter(t => t.date >= year.fromDate && t.date <= year.endDate);
    $('modal-yearly-title').textContent = `第 ${year.year} 年明細（${ymd(year.fromDate)}～${ymd(year.endDate)}）`;
    $('modal-yearly-body').innerHTML = rows.length
        ? groupByDate(rows).map((g, i) => groupHtml(g, dailyMap, i % 2 ? 'yearly-modal-odd' : 'yearly-modal-even')).join('')
        : '<tr><td colspan="6" class="yearly-modal-empty">本年無異動</td></tr>';
    $('modal-yearly').style.display = 'flex';
    $('modal-yearly').querySelector('.yearly-modal-scroll').scrollTo(0, 0); // 切換年度時捲回頂端；display:none 時設定不會生效，須在顯示後才設
}

export function initYearlyDetailModal() {
    const modal = $('modal-yearly');
    const close = () => { modal.style.display = 'none'; };
    $('modal-yearly-close').addEventListener('click', close);
    const step = d => { if (state && state.years[state.idx + d]) { state.idx += d; renderYear(); } };
    $('modal-yearly-prev').addEventListener('click', () => step(-1));
    $('modal-yearly-next').addEventListener('click', () => step(1));
    bindDocKey('modal-yearly', e => {
        if (modal.style.display === 'none') return;
        if (e.key === 'ArrowLeft') step(-1);
        else if (e.key === 'ArrowRight') step(1);
        else if (e.key === 'Escape') close();
    });
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
}
