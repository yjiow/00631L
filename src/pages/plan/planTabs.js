/**
 * planTabs.js
 * 參數頁籤：切換、下一步、手機「步驟 n/5」、頁籤狀態（✓ 已填寫 / 預設 / 錯誤標紅）
 * ✓ = 已確認：按「下一步」離開該頁，或頁內欄位與預設值不同（含增刪列；預設狀態於 initTabs 時記錄）；只點頁籤瀏覽不算
 */

let form = null;
let current = 0;
let tabs = [], panes = [], defaults = [];
const confirmed = new Set(); // 按過「下一步」的頁籤索引（切換視圖後保留）

const $ = id => document.getElementById(id);

export function showTab(i) {
    current = Math.max(0, Math.min(i, panes.length - 1));
    tabs.forEach((t, k) => {
        t.classList.toggle('active', k === current);
        t.setAttribute('aria-selected', k === current);
    });
    panes.forEach((p, k) => { p.hidden = k !== current; });
    const name = tabs[current].childNodes[1].textContent.trim(); // 編號與狀態 span 之間的文字
    $('plan-step-label').textContent = `步驟 ${current + 1}/${panes.length}　${name}`;
    $('plan-next').hidden = current === panes.length - 1;
}

// 頁內所有欄位的 name=value（列重建後值相同仍視為相同）
const paneState = pane => [...pane.querySelectorAll('input, select')]
    .map(el => `${el.name}=${el.type === 'radio' || el.type === 'checkbox' ? el.checked : el.value}`).join('&');

export function updateStatus() {
    panes.forEach((pane, k) => {
        const filled = confirmed.has(k) || paneState(pane) !== defaults[k];
        tabs[k].classList.toggle('filled', filled);
        tabs[k].querySelector('.plan-tab-status').textContent =
            tabs[k].classList.contains('error') ? '!' : filled ? '✓' : '預設';
    });
}

// 欄位錯誤：所在頁籤標紅並切換過去
export function markError(fieldName) {
    clearErrors();
    const input = form[fieldName];
    const k = panes.indexOf(input.closest('[data-pane]'));
    tabs[k].classList.add('error');
    input.classList.add('error');
    updateStatus();
    showTab(k);
    input.focus();
}

export function clearErrors() {
    tabs.forEach(t => t.classList.remove('error'));
    form.querySelectorAll('.error').forEach(el => el.classList.remove('error'));
    updateStatus();
}

// 下一步：確認目前頁籤後前進
function next() {
    confirmed.add(current);
    updateStatus();
    showTab(current + 1);
}

// 呼叫前表單須已填入預設值（作為「預設」狀態的比較基準）
export function initTabs(formEl) {
    form = formEl;
    tabs = [...form.querySelectorAll('.plan-tab')];
    panes = [...form.querySelectorAll('.plan-pane')];
    defaults = panes.map(paneState);

    tabs.forEach((t, k) => t.addEventListener('click', () => showTab(k)));
    form.querySelectorAll('[data-step]').forEach(b => b.addEventListener('click', () => {
        const step = Number(b.dataset.step);
        step > 0 ? next() : showTab(current + step);
    }));
    $('plan-next').addEventListener('click', next);
    form.addEventListener('input', e => { e.target.classList.remove('error'); updateStatus(); });
    showTab(0);
}
