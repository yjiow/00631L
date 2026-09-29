/**
 * plan/account.js
 * 帳戶：現金 + 持股（整數股）；買賣皆計交易成本，並回報交易紀錄
 */

import { tradeCost } from './fees.js';

const EPS = 1e-6; // 浮點誤差容忍

export class Account {
    // onTrade(type, { amount, shares, cost })：交易紀錄回呼（可省略）
    constructor(cash, costs, onTrade = null) {
        this.cash = cash;
        this.shares = 0;
        this.costTotal = 0;
        this.costs = costs;
        this.onTrade = onTrade;
    }

    value(price) {
        return this.cash + this.shares * price;
    }

    // 以 budget 為上限買進最大整數股（含手續費），回傳股數
    buy(price, budget) {
        budget = Math.min(budget, this.cash);
        const spend = n => n * price + tradeCost(n * price, 'buy', this.costs);
        let n = Math.floor(budget / price);
        while (n > 0 && spend(n) > budget + EPS) n--;
        if (n <= 0) return 0;
        const cost = tradeCost(n * price, 'buy', this.costs);
        this.shares += n;
        this.cash -= n * price + cost;
        this.costTotal += cost;
        this.onTrade?.('buy', { amount: n * price, shares: n, cost });
        return n;
    }

    // 賣出 n 股，回傳實收金額
    sell(price, n) {
        n = Math.min(n, this.shares);
        if (n <= 0) return 0;
        const cost = tradeCost(n * price, 'sell', this.costs);
        this.shares -= n;
        this.cash += n * price - cost;
        this.costTotal += cost;
        this.onTrade?.('sell', { amount: n * price, shares: n, cost });
        return n * price - cost;
    }

    // 現金為負時賣出最少股數補足；持股不足回傳 false（資金斷鏈）
    cover(price) {
        if (this.cash >= -EPS) return true;
        const need = -this.cash;
        const net = n => n * price - tradeCost(n * price, 'sell', this.costs);
        let n = Math.min(this.shares, Math.ceil(need / price));
        while (n < this.shares && net(n) < need - EPS) n++;
        this.sell(price, n);
        return this.cash >= -EPS;
    }
}
