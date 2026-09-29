/**
 * planStorage.js
 * 自動保存：上次「開始模擬」的參數存於 localStorage（只存參數、不存結果，僅在此瀏覽器）
 * 讀取時以 normalizePlan 補齊缺欄位（格式見 core/plan/defaults.js 的 version）
 */

import { normalizePlan } from '../../core/plan/defaults.js';

const KEY = 'yj00631.plan.last';

export function savePlan(plan) {
    try {
        localStorage.setItem(KEY, JSON.stringify({ plan, savedAt: new Date().toISOString() }));
    } catch { /* 無痕模式等無法存取時略過 */ }
}

// → { plan, savedAt } 或 null
export function loadPlan() {
    try {
        const raw = JSON.parse(localStorage.getItem(KEY));
        if (!raw?.plan) return null;
        return { plan: normalizePlan(raw.plan), savedAt: raw.savedAt };
    } catch {
        return null;
    }
}

export function clearPlan() {
    try { localStorage.removeItem(KEY); } catch { /* 略過 */ }
}
