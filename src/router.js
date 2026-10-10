/**
 * router.js
 * SPA 路由管理：非同步載入 views/*.html 並執行過場與初始化邏輯
 */

import { initBacktest } from './pages/home/home.js';
import { updateNavIndicator } from './ui/navIndicator.js';
import { initDataStatus } from './pages/about/dataStatus.js';
import { initPlan } from './pages/plan/plan.js';

const viewStage = document.getElementById('view-stage');

// 核心導航函式
export async function navigateTo(viewName) {
    if (!viewStage) return;

    // 1. 淡出過場
    viewStage.classList.remove('fade-in');
    viewStage.classList.add('fade-out');

    try {
        const response = await fetch(`views/${viewName}.html`);
        if (!response.ok) throw new Error(`View [${viewName}] load failed.`);

        const html = await response.text();

        setTimeout(() => {
            // 2. 注入新視圖
            viewStage.innerHTML = html;
            window.scrollTo(0, 0); // 換頁回到頂端

            // 3. 更新選單 Active 狀態
            document.querySelectorAll('[data-view]').forEach(item => {
                if (item.getAttribute('data-view') === viewName) {
                    item.classList.add('active');
                } else {
                    item.classList.remove('active');
                }
            });
            updateNavIndicator();

            // 4. 淡入過場
            viewStage.classList.remove('fade-out');
            viewStage.classList.add('fade-in');

            // 5. 觸發各視圖特定模組初始化
            if (viewName === 'home') {
                initBacktest();
            } else if (viewName === 'plan') {
                initPlan();
            } else if (viewName === 'about') {
                initDataStatus();
            }
        }, 150);

    } catch (err) {
        console.error('Router Error:', err);
        viewStage.innerHTML = `<div class="panel-card" style="text-align: center; color: var(--color-up);">載入視圖失敗: ${err.message}</div>`;
        viewStage.classList.remove('fade-out');
        viewStage.classList.add('fade-in');
    }
}

// 初始化路由事件監聽
export function initRouter() {
    // 監聽全域點擊事件，若帶有 data-view 屬性則觸發無刷新導航
    document.addEventListener('click', (e) => {
        const target = e.target.closest('[data-view]');
        if (target) {
            e.preventDefault();
            const viewName = target.getAttribute('data-view');
            navigateTo(viewName);
        }
    });

    // 分享連結帶 ?view=plan 時直接開啟該頁（plan.js 另讀網址參數帶入計畫），其餘預設首頁
    const view = new URLSearchParams(location.search).get('view');
    navigateTo(view === 'plan' ? 'plan' : 'home');
}
