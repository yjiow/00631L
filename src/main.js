/**
 * main.js
 * 應用程式進入點：初始化路由與全域事件
 */

import { initRouter } from './router.js';

document.addEventListener('DOMContentLoaded', () => {
    // 啟動 SPA 路由器
    initRouter();
});
