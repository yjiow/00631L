/**
 * detailPanel.js
 * 單一起點明細：數字卡、總資產曲線
 */

import { renderAssetChart } from '../../charts/planCharts.js';
import { fmtMoney, fmtRate } from './planFormat.js';

const $ = id => document.getElementById(id);
const slash = date => date.replace(/-/g, '/');

// r：simulatePlan 結果（含 daily）
export function renderDetail(r) {
    $('detail-desc').textContent = `${slash(r.startDate)} 起 ～ ${slash(r.endDate)}`;
    $('dt-final').textContent = fmtMoney(r.final);
    $('dt-invested').textContent = fmtMoney(r.invested);
    $('dt-xirr').textContent = fmtRate(r.xirr);
    $('dt-mdd').textContent = r.mdd.toFixed(1) + '%';
    $('dt-cost').textContent = fmtMoney(r.costTotal);
    $('dt-broke-box').hidden = !r.brokeDate;
    if (r.brokeDate) $('dt-broke').textContent = slash(r.brokeDate);
    renderAssetChart(r.daily);
}
