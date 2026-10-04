/**
 * docKey.js
 * document 層級 keydown 綁定：同一個 id 只保留最新一個監聽，避免視圖重建（切換分頁再回來）時監聽器累積
 */
const handlers = new Map();

export function bindDocKey(id, handler) {
    const old = handlers.get(id);
    if (old) document.removeEventListener('keydown', old);
    handlers.set(id, handler);
    document.addEventListener('keydown', handler);
}
