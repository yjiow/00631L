/**
 * router.js
 * SPA 路由管理：非同步載入 views/*.html 並執行過場與初始化邏輯
 */

import { initDCA } from './calculator.js';
import { initBacktest } from './uiController.js';
import { updateNavIndicator } from './navIndicator.js';

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

// 初始化自我掌握滑桿連動
function initSelfControl() {
    const curAgeInput = document.getElementById('input-cur-age');
    const retAgeInput = document.getElementById('input-retire-age');
    const savingsInput = document.getElementById('input-savings');

    const valCurAge = document.getElementById('val-cur-age');
    const valRetAge = document.getElementById('val-retire-age');
    const valSavings = document.getElementById('val-savings');
    const resTimespan = document.getElementById('res-timespan');

    if (!curAgeInput || !retAgeInput) return;

    function update() {
        const cur = parseInt(curAgeInput.value);
        const ret = Math.max(cur + 1, parseInt(retAgeInput.value));
        retAgeInput.value = ret;

        valCurAge.innerText = cur;
        valRetAge.innerText = ret;
        if (valSavings && savingsInput) {
            valSavings.innerText = parseInt(savingsInput.value).toLocaleString();
        }
        if (resTimespan) {
            resTimespan.innerText = `${ret - cur} 年`;
        }
    }

    curAgeInput.addEventListener('input', update);
    retAgeInput.addEventListener('input', update);
    if (savingsInput) savingsInput.addEventListener('input', update);
    update();
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
            if (viewName === 'dca') {
                initDCA();
            } else if (viewName === 'home') {
                runTypewriter('掌控財務，解鎖你的模擬人生。', document.getElementById('typewriter-text'));
                initBacktest();
            } else if (viewName === 'self-control') {
                initSelfControl();
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
