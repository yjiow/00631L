/**
 * detailPanel.js
 * 單一起點明細：數字卡、總資產曲線、年度明細表、資產配置 Modal（標題放大鏡）
 */

import { renderAssetChart, renderAllocationChart } from '../../charts/planCharts.js';
import { fmtMoney, fmtRate, signClass } from './planFormat.js';
import { yearlySummary } from '../../core/plan/summary.js';
import { renderYearly } from './yearlyTable.js';

const $ = id => document.getElementById(id);
const slash = date => date.replace(/-/g, '/');
let last = null; // 目前明細（供 Modal 使用）

// 資產配置 Modal 事件（視圖載入時綁定）
export function initDetailPanel() {
    const modal = $('modal-allocation');
    const close = () => { modal.style.display = 'none'; };
    $('btn-allocation').addEventListener('click', () => {
        if (!last) return;
        $('modal-allocation-title').textContent = `資產配置：00631L 股票 vs 現金（${slash(last.startDate)} 起）`;
        modal.style.display = 'flex';
        renderAllocationChart(last.daily);
    });
    $('modal-allocation-close').addEventListener('click', close);
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
}

// r：simulatePlan 結果（含 daily / trades）；years：模擬年數
export function renderDetail(r, years) {
    last = r;
    const ys = yearlySummary(r, years);
    $('detail-desc').textContent = `${slash(r.startDate)} 起 ～ ${slash(r.endDate)}` + (r.brokeDate ? '（資金斷鏈中止）' : '');
    // 資金斷鏈：未完成模擬年數的明顯警告
    $('dt-broke-alert').hidden = !r.brokeDate;
    if (r.brokeDate) $('dt-broke-alert').textContent =
        `⚠ 資金斷鏈：${slash(r.brokeDate)} 現金與持股不足以支付扣款，模擬在第 ${ys.at(-1).year} 年中止，未完成 ${years} 年。`;
    $('dt-final').textContent = fmtMoney(r.final);
    $('dt-invested').textContent = fmtMoney(r.invested);
    $('dt-xirr').textContent = fmtRate(r.xirr);
    $('dt-xirr').className = signClass(r.xirr);
    $('dt-mdd').textContent = r.mdd.toFixed(1) + '%';
    $('dt-mdd').className = signClass(r.mdd);
    // 回撤期間與金額標示於資產曲線；卡片提示框附完整日期
    const m = r.mddPeriod;
    $('dt-mdd-box').title = m ? `${slash(m.peak)}～${slash(m.trough)}：${fmtMoney(m.peakValue)} → ${fmtMoney(m.troughValue)}（見資產曲線綠色區段）` : '';
    $('dt-cost').textContent = fmtMoney(r.costTotal);
    renderAssetChart(r.daily, r.mddPeriod, r.mdd);
    renderYearly(ys);
}
