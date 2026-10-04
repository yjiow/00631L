/**
 * plan/dipBuy.js
 * 大跌加碼：標的自歷史高點回撤達各階門檻時動用現金加碼；回升後分月收回
 * 回撤深度 depth = 1 − 收盤 / 歷史高點（歷史高點 = 價格陣列第 0 筆起累計最大值，含模擬起點之前）
 * 一輪：第一次加碼起，到「回升且占比回到目標」或「加碼部位賣完」為止；輪中 simulate.js 再平衡只買不賣
 */

import { canRebalance } from './rebalance.js';

export const MAX_TIERS = 3;
const EPS = 1e-9;

// 價格陣列 → 累計最大值（同一陣列只算一次）
const peakCache = new WeakMap();
export function runningPeaks(prices) {
    let peaks = peakCache.get(prices);
    if (!peaks) {
        peaks = new Array(prices.length);
        let max = 0;
        for (let i = 0; i < prices.length; i++) { if (prices[i] > max) max = prices[i]; peaks[i] = max; }
        peakCache.set(prices, peaks);
    }
    return peaks;
}

// 驗證設定（enabled 為 true 時才需呼叫）→ null | { error, key, index }（key：drawdown | cashPct | tiers | recoverAt | recoverMonths）
export function validateDipBuy(d) {
    const t = d.tiers ?? [];
    if (!t.length || t.length > MAX_TIERS) return { error: `大跌加碼：請設定 1～${MAX_TIERS} 階`, key: 'tiers', index: 0 };
    for (let i = 0; i < t.length; i++) {
        const n = i + 1;
        if (!(t[i].drawdown > 0 && t[i].drawdown < 1)) return { error: `大跌加碼第 ${n} 階：回撤請填大於 0 小於 100 的 %`, key: 'drawdown', index: i };
        if (i && t[i].drawdown <= t[i - 1].drawdown) return { error: `大跌加碼第 ${n} 階：回撤需大於上一階`, key: 'drawdown', index: i };
        if (!(t[i].cashPct >= 0 && t[i].cashPct <= 1)) return { error: `大跌加碼第 ${n} 階：動用現金請填 0～100%`, key: 'cashPct', index: i };
    }
    if (!(d.recoverAt >= 0 && d.recoverAt < t[0].drawdown)) return { error: '大跌加碼：回收門檻需大於等於 0 且小於第一階回撤', key: 'recoverAt', index: 0 };
    if (!Number.isInteger(d.recoverMonths) || d.recoverMonths < 1) return { error: '大跌加碼：收回月數請填 1 以上的整數', key: 'recoverMonths', index: 0 };
    return null;
}

export class DipBuy {
    constructor(cfg, prices) {
        this.cfg = cfg;
        this.peaks = runningPeaks(prices);
        this.reset();
    }

    reset() {
        this.active = false;
        this.triggered = this.cfg.tiers.map(() => false);
        this.shares = 0;       // 加碼部位（剩餘股數）
        this.bought = false;   // 本輪是否買進過
        this.base = null;      // 第一次開始收回時的加碼部位（收回節奏基準）
    }

    // 每個交易日於當日動作後呼叫；ratio 為當時目標股票比例，monthStart 為當月第一個交易日
    step(account, price, i, monthStart, ratio) {
        const { tiers, recoverAt, recoverMonths } = this.cfg;
        const depth = 1 - price / this.peaks[i];
        if (canRebalance(ratio)) {
            tiers.forEach((t, k) => {
                if (this.triggered[k] || depth < t.drawdown - EPS) return;
                this.triggered[k] = true;
                this.active = true;
                const n = account.buy(price, account.cash * t.cashPct, 'dip');
                if (n > 0) { this.shares += n; this.bought = true; }
            });
        }
        if (!this.active) return;
        this.shares = Math.min(this.shares, account.shares);

        const recovered = depth < recoverAt - EPS;
        const excess = () => Math.floor((account.shares * price - account.value(price) * ratio) / price); // 超出目標比例的股數
        if (recovered && monthStart && excess() > 0) {
            this.base ??= this.shares;
            const n = Math.min(Math.ceil(this.base / recoverMonths), this.shares, excess());
            if (n > 0) { account.sell(price, n, 'recover'); this.shares -= n; }
        }
        if ((recovered && (excess() <= 0 || this.shares <= 0)) || (this.bought && this.shares <= 0)) this.reset();
    }
}
