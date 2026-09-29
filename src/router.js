/**
 * router.js
 * SPA 路由管理：非同步載入 views/*.html 並執行過場與初始化邏輯
 */

import { initBacktest } from './pages/home/home.js';
import { updateNavIndicator } from './ui/navIndicator.js';
import { initDataStatus } from './pages/about/dataStatus.js';

const viewStage = document.getElementById('view-stage');

// 打字機特效（用於首頁）
function runTypewriter(text, el, speed = 50) {
    if (!el) return;
    el.innerText = '';
    let i = 0;
    const timer = setInterval(() => {
        if (i < text.length) {
            el.innerText += text.charAt(i);
            i++;
        } else {
            clearInterval(timer);
        }
    }, speed);
}

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
                runTypewriter('模擬過去，掌控您的財務未來。', document.getElementById('typewriter-text'));
                initBacktest();
            } else if (viewName === 'about') {
                initDataStatus();
            }
        }, 150);

    } catch (err) {
        console.error('Router Error:', err);
        viewStage.innerHTML = `<div class="panel-card" style="text-align: center; color: #FF4D4D;">載入視圖失敗: ${err.message}</div>`;
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

    // 預設載入首頁
    navigateTo('home');
}
