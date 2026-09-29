/**
 * dataStatus.js
 * 關於頁「資料更新」區塊：顯示資料檔最後交易日
 */

import { getLatestDate } from '../../core/database.js';

export async function initDataStatus() {
    const el = document.getElementById('data-latest-date');
    if (!el) return;
    const date = await getLatestDate();
    el.textContent = date ? date.replaceAll('-', '/') : '—';
}
