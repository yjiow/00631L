/**
 * plan/fees.js
 * 交易成本（系統參數集中於此，法規變動只改本檔）
 * costs：{ enabled, discount, minFee }（使用者可調部分，見 defaults.js）
 */

export const FEE_RATE = 0.001425; // 手續費率（法定上限）
export const TAX_RATE = 0.001;    // ETF 證交稅（僅賣出）

// 成交金額 amount 的交易成本（元，無條件捨去；手續費不低於最低手續費）
export function tradeCost(amount, side, costs) {
    if (!costs.enabled || amount <= 0) return 0;
    const fee = Math.max(costs.minFee, Math.floor(amount * FEE_RATE * costs.discount));
    return side === 'sell' ? fee + Math.floor(amount * TAX_RATE) : fee;
}
