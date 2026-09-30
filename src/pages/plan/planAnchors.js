/**
 * planAnchors.js
 * 結果區錨點列：固定於導覽列下方，點擊捲動至參數（僅窄螢幕）/ 分布 / 明細 / 年度表，捲動時標示目前區塊
 */

const $ = id => document.getElementById(id);
let bound = false;

const navHeight = () => document.querySelector('nav')?.offsetHeight ?? 0;
const barHeight = () => $('plan-anchors')?.offsetHeight ?? 0;

// 捲動至區塊頂端（扣掉導覽列與錨點列高度）
export function scrollToSection(id) {
    const el = $(id);
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - navHeight() - barHeight() - 12;
    window.scrollTo({ top, behavior: 'smooth' });
}

// 依捲動位置標示目前區塊（結果區顯示後由 plan.js 呼叫一次）
export function refreshAnchors() {
    document.documentElement.style.setProperty('--plan-nav-h', navHeight() + 'px'); // 左欄參數 sticky 用
    const bar = $('plan-anchors');
    if (!bar || bar.closest('[hidden]')) return;
    bar.style.top = navHeight() + 'px';
    const line = navHeight() + barHeight() + 24;
    const btns = [...bar.querySelectorAll('[data-target]')].filter(b => b.offsetParent); // 略過隱藏的（寬螢幕「參數」）
    let current = btns[0];
    for (const b of btns) if ($(b.dataset.target)?.getBoundingClientRect().top <= line) current = b;
    const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
    if (atBottom) current = btns.at(-1); // 捲到底時最後一區碰不到判斷線
    btns.forEach(b => b.classList.toggle('active', b === current));
}

export function initAnchors() {
    $('plan-anchors').addEventListener('click', e => {
        const btn = e.target.closest('[data-target]');
        if (btn) scrollToSection(btn.dataset.target);
    });
    refreshAnchors();
    if (bound) return; // 視窗事件只綁一次（視圖重新載入時 update 自行找新元素）
    bound = true;
    let ticking = false;
    const onScroll = () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => { ticking = false; refreshAnchors(); });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
}
