/**
 * trade/portfolio.js
 * 自主實戰：操作者帳戶（共用現金 + 0050 與 00631L 兩檔整數股）
 * 當天處理順序：賣出 → 現金加減碼 → 買進；任何一步使現金或持股為負即整筆拒絕、狀態不變
 * 買賣價 = 當日收盤，費用用 plan/fees.js 的 tradeCost（買進現金 −(金額+費)，賣出 +(金額−費−稅)）
 */

import { tradeCost } from '../plan/fees.js';

const EPS = 1e-6; // 浮點誤差容忍（同 plan/account.js）

export const EMPTY_ACTION = { cash: 0, buy50: 0, buy631: 0, sell50: 0, sell631: 0 };

export class Portfolio {
    constructor(cash, costs) {
        this.cash = cash;
        this.shares50 = 0;
        this.shares631 = 0;
        this.invested = cash; // 淨投入
        this.costTotal = 0;   // 累計手續費與證交稅
        this.tradeCount = 0;  // 買賣筆數
        this.accrued = 0;     // 已累計未入帳的現金利息
        this.costs = costs;
    }

    value(p50, p631) {
        return this.cash + this.shares50 * p50 + this.shares631 * p631;
    }

    // 執行當天操作；回 { ok:true } 或 { ok:false, error }（失敗時狀態不變）
    trade(action, p50, p631) {
        const a = { ...EMPTY_ACTION, ...action };
        const { costs } = this;
        if (!Number.isInteger(a.cash)) return fail('加減碼金額須為整數');
        for (const k of ['buy50', 'buy631', 'sell50', 'sell631']) {
            if (!Number.isInteger(a[k]) || a[k] < 0) return fail('買賣股數須為 0 或正整數');
        }
        let { cash, shares50, shares631 } = this;
        let cost = 0, n = 0;

        // 1. 賣出
        const sell = (qty, price, held, name) => {
            if (qty > held) return `賣出 ${name} 股數超過持股`;
            if (qty > 0) {
                const fee = tradeCost(qty * price, 'sell', costs);
                cash += qty * price - fee; cost += fee; n++;
            }
            return null;
        };
        let err = sell(a.sell50, p50, shares50, '0050') || sell(a.sell631, p631, shares631, '00631L');
        if (err) return fail(err);
        shares50 -= a.sell50; shares631 -= a.sell631;

        // 2. 現金加減碼
        cash += a.cash;
        if (cash < -EPS) return fail('減碼金額超過現金');

        // 3. 買進
        for (const [qty, price, name] of [[a.buy50, p50, '0050'], [a.buy631, p631, '00631L']]) {
            if (qty <= 0) continue;
            const fee = tradeCost(qty * price, 'buy', costs);
            cash -= qty * price + fee; cost += fee; n++;
            if (cash < -EPS) return fail(`現金不足，無法買進 ${name}（含手續費）`);
        }
        shares50 += a.buy50; shares631 += a.buy631;

        this.cash = cash; this.shares50 = shares50; this.shares631 = shares631;
        this.invested += a.cash;
        this.costTotal += cost;
        this.tradeCount += n;
        return { ok: true };
    }
}

const fail = error => ({ ok: false, error });
