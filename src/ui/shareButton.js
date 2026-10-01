/**
 * shareButton.js
 * 分享共用邏輯：支援 Web Share API 的裝置（多為手機）跳系統分享面板（含 LINE）；其餘複製連結到剪貼簿
 * 回傳 status：'shared' | 'cancelled' | 'copied' | 'manual'（manual 需呼叫端自行顯示 url 供手動複製）
 */
export async function shareUrl(url, title) {
    if (navigator.share) {
        try { await navigator.share({ title, url }); return { status: 'shared', url }; }
        catch (err) { if (err?.name === 'AbortError') return { status: 'cancelled', url }; }
    }
    try { await navigator.clipboard.writeText(url); return { status: 'copied', url }; }
    catch { return { status: 'manual', url }; }
}
