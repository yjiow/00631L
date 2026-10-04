/**
 * planCases.js
 * 案例 Modal：載入 public/data/cases.json（新增案例只改 JSON），卡片顯示摘要，按「帶入」交由 onApply(plan) 套用並重算
 */
import { normalizePlan } from '../../core/plan/defaults.js';
import { bindDocKey } from '../../ui/docKey.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtAmount = v => v >= 10_000 ? `${+(v / 10_000).toFixed(2)} 萬` : `${v.toLocaleString('en-US')} 元`;

// 關鍵參數摘要，如「初始 3 萬｜股票 80%｜20 年｜比例分 3 階段｜大跌加碼」
export function summarizePlan(plan) {
    const p = normalizePlan(plan);
    const parts = [`初始 ${fmtAmount(p.initialCapital)}`, `股票 ${Math.round(p.stockRatio * 100)}%`, `${p.years} 年`];
    if (p.stockRatioSchedule.length) parts.push(`比例分 ${p.stockRatioSchedule.length + 1} 階段`);
    if (p.dipBuy.enabled) parts.push('大跌加碼');
    return parts.join('｜');
}

let cases = null;

async function load(list) {
    list.innerHTML = '<p class="plan-cases-msg">載入中…</p>';
    try {
        if (!cases) {
            const res = await fetch('data/cases.json');
            if (!res.ok) throw new Error(res.status);
            cases = await res.json();
        }
    } catch {
        list.innerHTML = '<p class="plan-cases-msg">案例載入失敗，請稍後再試。</p>';
        return;
    }
    list.innerHTML = cases.length ? cases.map((c, i) => `<div class="plan-case-card">
        <div class="plan-case-body">
            <div class="plan-case-title">${esc(c.title)} <span class="plan-case-author">來源：${esc(c.author)}</span></div>
            <p class="plan-case-desc">${esc(c.desc)}</p>
            <p class="plan-case-summary">${esc(summarizePlan(c.plan))}</p>
        </div>
        <button type="button" class="plan-case-apply" data-i="${i}">帶入</button>
    </div>`).join('') : '<p class="plan-cases-msg">目前沒有案例。</p>';
}

export function initCases(onApply) {
    const modal = $('modal-cases'), list = $('modal-cases-list');
    const close = () => { modal.style.display = 'none'; };
    $('plan-cases').addEventListener('click', () => { modal.style.display = 'flex'; load(list); });
    $('modal-cases-close').addEventListener('click', close);
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
    bindDocKey('modal-cases', e => { if (e.key === 'Escape' && modal.style.display !== 'none') close(); });
    list.addEventListener('click', e => {
        const btn = e.target.closest('.plan-case-apply');
        if (!btn) return;
        close();
        onApply(cases[+btn.dataset.i].plan);
    });
}
