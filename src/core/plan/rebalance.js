/**
 * plan/rebalance.js
 * 再平衡規則：目標股票比例 ratio（0~1，與初始配置共用）
 */

// 比例為 0 或 100% 時再平衡無作用
export const canRebalance = ratio => ratio > 0 && ratio < 1;

// 漲跌幅門檻：股票與現金各除以目標權重後，差距超過較小者的 threshold（50/50 時同首頁規則）
// 等同「股市值 / 現金」偏離目標值 ratio / (1 − ratio) 超過 ±threshold 倍，觸發點見 triggerRange
export function drifted(stock, cash, ratio, threshold) {
    if (!canRebalance(ratio)) return false;
    const s = stock / ratio, c = cash / (1 - ratio);
    const min = Math.min(s, c);
    return min > 0 ? Math.abs(s - c) / min > threshold : s + c > 0;
}

// 觸發點（股市值 / 現金，小數）：≥ upper 或 ≤ lower 時再平衡
export function triggerRange(ratio, threshold) {
    const target = ratio / (1 - ratio);
    return { target, upper: target * (1 + threshold), lower: target / (1 + threshold) };
}

// 買到目標比例所需金額（不足為 0）
export const topUpBudget = (account, price, ratio) => Math.max(0, account.value(price) * ratio - account.shares * price);

// 調回目標比例：股票過多賣出、不足以現金買進（整數股、含交易成本）
export function rebalanceTo(account, price, ratio, reason = 'rebalance') {
    if (canRebalance(ratio)) allocateTo(account, price, ratio, reason);
}

// 強制調到目標比例（含 0 / 100%，供股票比例時程階段切換；不受 canRebalance 限制）
export function allocateTo(account, price, ratio, reason) {
    const target = account.value(price) * ratio;
    const stock = account.shares * price;
    if (stock > target) account.sell(price, Math.floor((stock - target) / price), reason);
    else account.buy(price, target - stock, reason);
}
