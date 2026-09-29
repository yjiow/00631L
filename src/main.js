/**
 * main.js
 * 應用程式進入點：初始化路由與全域事件
 */

import { initRouter } from './router.js';
import { initNavCollapse } from './ui/navCollapse.js';

document.addEventListener('DOMContentLoaded', () => {
    // 導覽列放不下時收合為漢堡選單（需早於 router，resize 時先切換狀態再定位底線）
    initNavCollapse();
    // 啟動 SPA 路由器
    initRouter();
});
