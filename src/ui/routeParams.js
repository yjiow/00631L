/**
 * routeParams.js
 * 路由網址參數：?view=home|plan|trade|about（純函式，無 DOM 依賴）
 */

export const VIEWS = ['home', 'plan', 'trade', 'about'];

// 讀取網址的 view 參數；缺值或非法回首頁（例外：帶 plan= 分享參數但缺 view 的舊式 / 被截斷的連結視為投資計畫）
export function parseView(search) {
    const sp = new URLSearchParams(search);
    const v = sp.get('view');
    if (VIEWS.includes(v)) return v;
    return sp.has('plan') ? 'plan' : 'home';
}

export const viewUrl = view => `?view=${view}`;
