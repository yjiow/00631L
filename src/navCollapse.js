/**
 * navCollapse.js
 * 導覽列自動收合：Logo + 選單放不下時改為漢堡選單（不綁固定斷點，選單項目增加時自動適應）
 */

const GAP = 24;     // Logo 與選單之間至少保留的間距
const TAP_MS = 260; // 點擊光團播放時間，之後才收起選單

let nav, menu, logo, toggle;

function setOpen(open) {
    nav.classList.toggle('menu-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? '關閉選單' : '開啟選單');
}

// 一律以展開狀態量測，避免收合後寬度改變造成來回切換
function check() {
    nav.classList.remove('nav-collapsed');
    const s = getComputedStyle(nav);
    const inner = nav.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight);
    const collapsed = logo.offsetWidth + menu.scrollWidth + GAP > inner;
    nav.classList.toggle('nav-collapsed', collapsed);
    if (!collapsed) setOpen(false);
}

export function initNavCollapse() {
    nav    = document.querySelector('nav');
    menu   = nav?.querySelector('.menu');
    logo   = nav?.querySelector('.logo');
    toggle = nav?.querySelector('.nav-toggle');
    if (!menu || !logo || !toggle) return;

    // 展開掃入動畫的順序（CSS 以 --i 計算延遲，項目增加不需改 CSS）
    menu.querySelectorAll('.menu-item').forEach((li, i) => li.style.setProperty('--i', i));

    toggle.addEventListener('click', () => setOpen(!nav.classList.contains('menu-open')));
    // 點擊回饋：收合模式下先播放光團（.tapped），再收起選單
    menu.addEventListener('click', e => {
        const a = e.target.closest('[data-view]');
        if (!a) return;
        if (!nav.classList.contains('nav-collapsed')) return setOpen(false);
        a.classList.remove('tapped');
        void a.offsetWidth; // 重新觸發動畫
        a.classList.add('tapped');
        setTimeout(() => { setOpen(false); a.classList.remove('tapped'); }, TAP_MS);
    });
    document.addEventListener('click', e => { if (!nav.contains(e.target)) setOpen(false); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') setOpen(false); });

    window.addEventListener('resize', check);
    document.fonts?.ready.then(check); // 字型載入後寬度會變
    check();
}
