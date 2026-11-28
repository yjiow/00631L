/**
 * tradeStorage.js
 * 自主實戰存檔：localStorage 單一鍵，只存 toSave(game) 的內容（起始日、設定、決策、結算狀態）
 * 所有讀寫包 try/catch（無痕模式、容量、損毀皆不中斷）
 */

const KEY = 'trade-save-v1';

export function saveTrade(save) {
    try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* 略過 */ }
}

// → 存檔物件或 null（格式不符視為損毀）
export function loadTrade() {
    try {
        const s = JSON.parse(localStorage.getItem(KEY));
        if (!s || typeof s.startDate !== 'string' || !Number.isInteger(s.initial) || s.initial <= 0
            || !(s.discount > 0 && s.discount <= 1) || !(s.minFee >= 0) || !Array.isArray(s.decisions)) return null;
        const num = v => Number.isFinite(v);
        const ok = d => d && num(d.cash) && [d.buy50, d.buy631, d.sell50, d.sell631].every(n => Number.isInteger(n) && n >= 0)
            && Number.isInteger(d.skip) && d.skip >= 1;
        return s.decisions.every(ok) ? s : null;
    } catch {
        return null;
    }
}

export function clearTrade() {
    try { localStorage.removeItem(KEY); } catch { /* 略過 */ }
}
