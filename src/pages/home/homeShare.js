/**
 * homeShare.js
 * 首頁「分享本站」按鈕：純網站網址（不含參數），機制同投資計畫頁分享（ui/shareButton.js）
 */
import { shareUrl } from '../../ui/shareButton.js';

let feedbackTimer;

export function initHomeShare() {
    const btn = document.getElementById('home-share');
    if (!btn) return;
    btn.addEventListener('click', async () => {
        const { status, url } = await shareUrl(location.origin + location.pathname, '正2資產模擬實驗室');
        const feedback = document.getElementById('home-share-feedback');
        if (status === 'copied') {
            clearTimeout(feedbackTimer);
            feedback.textContent = '已複製連結';
            feedback.hidden = false;
            feedbackTimer = setTimeout(() => { feedback.hidden = true; }, 1800);
        } else if (status === 'manual') {
            prompt('複製此連結分享：', url);
        }
    });
}
