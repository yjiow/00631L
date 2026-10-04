/**
 * detailPanel.js
 * 單一起點明細：數字卡、總資產曲線、年度明細表、資產配置 Modal（標題放大鏡）
 */

import { renderAssetChart, renderAllocationChart } from '../../charts/planCharts.js';
import { fmtMoney, fmtRate, signClass, ymd } from './planFormat.js';
import { yearlySummary } from '../../core/plan/summary.js';
import { renderYearly } from './yearlyTable.js';
import { initYearlyDetailModal } from './yearlyDetailModal.js';

const $ = id => document.getElementById(id);
let last = null; // 目前明細（供 Modal 使用）

// 資產配置 Modal 事件（視圖載入時綁定）
export function initDetailPanel() {
    const modal = $('modal-allocation');
    const close = () => { modal.style.display = 'none'; };
    $('btn-allocation').addEventListener('click', () => {
        if (!last) return;
        $('modal-allocation-title').textContent = `資產配置：00631L 股票 vs 現金（${ymd(last.startDate)} 起）`;
        modal.style.display = 'flex';
        renderAllocationChart(last.daily);
    });
    $('modal-allocation-close').addEventListener('click', close);
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
    initYearlyDetailModal();
}

// r：simulatePlan 結果（含 daily / trades）；years：模擬年數；cashRate：現金年利率（供年度明細 Modal 附註）
// rA：釘住時對照組 A 同起點的 simulatePlan 結果（疊加於總資產曲線），未釘住為 null
export function renderDetail(r, years, cashRate, rA = null) {
    last = r;
    const ys = yearlySummary(r, years);
    $('detail-desc').textContent = `${ymd(r.startDate)} 起 ～ ${ymd(r.endDate)}` + (r.brokeDate ? '（資金斷鏈中止）' : '');
    // 資金斷鏈：未完成模擬年數的明顯警告
    $('dt-broke-alert').hidden = !r.brokeDate;
    if (r.brokeDate) $('dt-broke-alert').textContent =
        `⚠ 資金斷鏈：${ymd(r.brokeDate)} 現金與持股不足以支付扣款，模擬在第 ${ys.at(-1).year} 年中止，未完成 ${years} 年。`;
    $('dt-final').textContent = fmtMoney(r.final);
    $('dt-invested').textContent = fmtMoney(r.invested);
    $('dt-xirr').textContent = fmtRate(r.xirr);
    $('dt-xirr').className = signClass(r.xirr);
    $('dt-mdd').textContent = r.mdd.toFixed(1) + '%';
    $('dt-mdd').className = signClass(r.mdd);
    // 回撤期間與金額標示於資產曲線；卡片提示框附完整日期
    const m = r.mddPeriod;
    $('dt-mdd-box').title = m ? `${ymd(m.peak)}～${ymd(m.trough)}：${fmtMoney(m.peakValue)} → ${fmtMoney(m.troughValue)}（見資產曲線綠色區段）` : '';
    $('dt-cost').textContent = fmtMoney(r.costTotal);
    renderAssetChart(r.daily, r.mddPeriod, r.mdd, rA?.daily ?? null);
    renderYearly(ys, r.trades, r.daily, cashRate);
}
