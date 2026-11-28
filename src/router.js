/**
 * router.js
 * SPA 路由管理：非同步載入 views/*.html 並執行過場與初始化邏輯
 */

import { initBacktest } from './pages/home/home.js';
import { updateNavIndicator } from './ui/navIndicator.js';
import { initDataStatus } from './pages/about/dataStatus.js';
import { initPlan } from './pages/plan/plan.js';
import { initTrade } from './pages/trade/trade.js';

import { parseView, viewUrl } from './ui/routeParams.js';

const viewStage = document.getElementById('view-stage');

const TITLES = {
    home:  '策略概覽｜正2資產模擬實驗室',
    plan:  '投資計畫模擬｜正2資產模擬實驗室',
    trade: '自主實戰模擬｜正2資產模擬實驗室',
    about: '關於我｜正2資產模擬實驗室'
};

let navSeq = 0;         // 每次導航遞增；過期的載入結果丟棄（快速連點不讓舊頁覆蓋新頁）
let currentView = null; // 目前（或載入中）的頁面

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// 核心導航函式（push：是否新增歷史紀錄；初始載入與 popstate 傳 false）
export async function navigateTo(viewName, { push = true } = {}) {
    if (!viewStage) return;
    const seq = ++navSeq;

    // 1. 淡出過場
    viewStage.classList.remove('fade-in');
    viewStage.classList.add('fade-out');

    try {
        const response = await fetch(`views/${viewName}.html`);
        if (!response.ok) throw new Error(`View [${viewName}] load failed.`);

        const html = await response.text();
        if (seq !== navSeq) return;

        setTimeout(() => {
            if (seq !== navSeq) return;
            // 載入成功後才提交網址與目前頁（載入失敗時網址、標題、選單維持舊頁）；目標頁與目前頁相同則不新增歷史
            if (push) history[viewName === currentView ? 'replaceState' : 'pushState'](null, '', viewUrl(viewName));
            currentView = viewName;
            // 2. 注入新視圖
            viewStage.innerHTML = html;
            window.scrollTo(0, 0); // 換頁回到頂端
            document.title = TITLES[viewName] ?? TITLES.home;

            // 3. 更新選單 Active 狀態
            document.querySelectorAll('[data-view]').forEach(item => {
                if (item.getAttribute('data-view') === viewName) {
                    item.classList.add('active');
                } else {
                    item.classList.remove('active');
                }
            });
            document.querySelectorAll('.menu [data-view]').forEach(item => {
                if (item.getAttribute('data-view') === viewName) item.setAttribute('aria-current', 'page');
                else item.removeAttribute('aria-current');
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
            } else if (viewName === 'trade') {
                initTrade();
            } else if (viewName === 'about') {
                initDataStatus();
            }
        }, prefersReducedMotion() ? 0 : 150);

    } catch (err) {
        if (seq !== navSeq) return;
        console.error('Router Error:', err);
        const box = document.createElement('div');
        box.className = 'panel-card';
        box.style.cssText = 'text-align: center; color: var(--color-up);';
        box.textContent = `載入視圖失敗: ${err.message}`;
        viewStage.replaceChildren(box);
        viewStage.classList.remove('fade-out');
        viewStage.classList.add('fade-in');
    }
}

// 初始化路由事件監聽
export function initRouter() {
    // 監聽全域點擊事件，若帶有 data-view 屬性則觸發無刷新導航（ctrl / meta / shift / 中鍵交給瀏覽器開新分頁）
    document.addEventListener('click', (e) => {
        const target = e.target.closest('[data-view]');
        if (!target) return;
        if (target.tagName === 'A' && (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey)) return;
        e.preventDefault();
        navigateTo(target.getAttribute('data-view'));
    });

    // 上一頁 / 下一頁：依網址載入該頁，不再新增歷史
    window.addEventListener('popstate', () => navigateTo(parseView(location.search), { push: false }));

    // 初始載入：依 ?view= 開啟（分享連結 ?view=plan&plan=… 的 plan 參數由 plan.js 讀取）；缺值 / 非法則校正網址為合法值
    const view = parseView(location.search);
    const sp = new URLSearchParams(location.search);
    if (sp.get('view') !== view) {
        sp.set('view', view); // 保留其他參數（如 plan=）
        history.replaceState(null, '', '?' + sp.toString());
    }
    navigateTo(view, { push: false });
}
