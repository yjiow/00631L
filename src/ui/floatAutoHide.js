/**
 * floatAutoHide.js
 * 浮動日期按鈕：往下捲時滑出畫面，往上捲或停止捲動後滑回（日期面板展開時不隱藏）
 */

const THRESHOLD = 8;   // 單次捲動量小於此值不判斷，避免抖動
const IDLE_MS   = 600; // 停止捲動後多久滑回

let lastY = 0;
let idleTimer = 0;
let bound = false;

function setHidden(hidden) {
    const menu = document.querySelector('.float-menu');
    if (!menu) return; // 非首頁
    const panel = document.getElementById('floatPanel');
    if (hidden && panel && panel.style.display !== 'none') return;
    menu.classList.toggle('is-hidden', hidden);
}

function onScroll() {
    const y = window.scrollY;
    if (Math.abs(y - lastY) < THRESHOLD) return;
    setHidden(y > lastY);
    lastY = y;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => setHidden(false), IDLE_MS);
}

// 每次載入首頁呼叫；scroll 監聽全域只綁一次
export function initFloatAutoHide() {
    lastY = window.scrollY;
    if (bound) return;
    bound = true;
    window.addEventListener('scroll', onScroll, { passive: true });
}
