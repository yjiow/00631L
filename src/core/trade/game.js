/**
 * trade/game.js
 * 自主實戰：遊戲引擎與存檔重播（純計算，不操作 DOM）
 * 每天流程：抵達 → 現金利息（日積數法）→ 等待操作 act → 對照組檢查 → 記錄收盤資產
 * a = 操作者（Portfolio）、b = 對照組（00631L + 現金，目標 50/50、漲跌幅 20% 再平衡，用 plan 的 Account）
 */

import { Account } from '../plan/account.js';
import { drifted, rebalanceTo } from '../plan/rebalance.js';
import { daysBetween } from '../plan/calendar.js';
import { settleKey } from '../plan/simulate.js';
import { Portfolio, EMPTY_ACTION } from './portfolio.js';

export const CASH_RATE = 0.01;   // 現金年利率（固定）
const TARGET_RATIO = 0.5;        // 對照組目標股票比例
const THRESHOLD = 0.2;           // 對照組再平衡門檻
const SAVE_VERSION = 1;


// 以每日收盤資產曲線算最大回撤（同 simulate.js：peak 從 0 起，回傳最小值，百分數）
function maxDrawdown(values) {
    let peak = 0, mdd = 0;
    for (const v of values) {
        if (v > peak) peak = v;
        const dd = peak > 0 ? (v - peak) / peak * 100 : 0;
        if (dd < mdd) mdd = dd;
    }
    return mdd;
}

export function createGame(series, startIdx, { initial, costs }) {
    return new Game(series, startIdx, initial, costs);
}

class Game {
    constructor(series, startIdx, initial, costs) {
        this.series = series;
        this.startIdx = startIdx;
        this.initial = initial;
        this.costs = costs;
        this.idx = startIdx;
        this.finished = false; // 已到資料末
        this.settled = false;  // 已結算（含到資料末自動結算）
        this.endIdx = null;
        this.decisions = [];
        this.history = [];     // 每個交易日一筆 { idx, a, b }（當天待操作時為即時值，操作後更新）

        this.bLast = [];       // 對照組自上次 act 後的買賣 { day, type, shares, reason }，供畫面說明策略何時動作

        this.a = new Portfolio(initial, costs);
        this.b = {
            account: new Account(initial, costs, (type, t) => {
                this.b.tradeCount++;
                this.bLast.push({ day: this.day, type, shares: t.shares, reason: t.reason });
            }),
            invested: initial, accrued: 0, brokeIdx: null, tradeCount: 0
        };
        // 第 1 天對照組先不動，待操作者 act 後才檢查（act 內 checkB 會建立 50/50）
        this.history.push({ idx: startIdx, a: 0, b: 0 });
        this.refresh();
    }

    get day() { return this.idx - this.startIdx + 1; }
    get date() { return this.series.dates[this.idx]; }
    get broke() { return this.b.brokeIdx != null; }

    // 對照組：達漲跌幅門檻就再平衡到各半
    checkB() {
        const { b } = this;
        if (this.broke) return;
        const price = this.series.p631[this.idx];
        if (drifted(b.account.shares * price, b.account.cash, TARGET_RATIO, THRESHOLD)) rebalanceTo(b.account, price, TARGET_RATIO);
    }

    valueA() { return this.a.value(this.series.p50[this.idx], this.series.p631[this.idx]); }
    valueB() { return this.broke ? 0 : this.b.account.value(this.series.p631[this.idx]); }

    // 更新當天歷史紀錄
    refresh() {
        const h = this.history[this.history.length - 1];
        h.a = this.valueA();
        h.b = this.valueB();
    }

    // 抵達 idx 日：累計現金利息（日積數法），跨結息日或 flush 時入帳
    arrive(idx, flush = false) {
        const { dates } = this.series;
        const gap = daysBetween(dates[idx - 1], dates[idx]);
        const cross = settleKey(dates[idx]) > settleKey(dates[idx - 1]);
        this.idx = idx;
        for (const g of [this.a, ...(this.broke ? [] : [this.b])]) {
            const acct = g.account ?? g; // 兩組都有 cash 欄位
            g.accrued += acct.cash * CASH_RATE * gap / 365;
            if ((flush || cross) && g.accrued > 0) { acct.cash += g.accrued; g.accrued = 0; }
        }
        this.history.push({ idx, a: 0, b: 0 });
    }

    // action：{ cash, buy50, buy631, sell50, sell631 }；skip：操作後往後推進的交易日數（≥ 1）
    act(action = {}, skip = 1) {
        if (this.settled) return { ok: false, error: '遊戲已結算' };
        if (!Number.isInteger(skip) || skip < 1) return { ok: false, error: '跳過天數須為 1 以上整數' };
        const { p50, p631 } = this.series;
        const r = this.a.trade(action, p50[this.idx], p631[this.idx]);
        if (!r.ok) return r;
        this.bLast = [];
        const act = { ...EMPTY_ACTION, ...action };

        const { b } = this;
        if (!this.broke) {
            b.account.cash += act.cash;
            b.invested += act.cash;
            if (!b.account.cover(p631[this.idx])) b.brokeIdx = this.idx;
        }
        this.checkB();
        this.refresh();

        const last = this.series.dates.length - 1;
        let moved = 0; // 實際推進天數（資料末會夾住 skip；存檔存實際值，資料更新後重播才與原局一致）
        for (let k = 0; k < skip && this.idx < last; k++) {
            moved++;
            this.arrive(this.idx + 1, this.idx + 1 === last);
            // 停下待操作的那天（跳過的最後一天、且非資料末）不檢查，留到下次 act 或 settle
            if (k < skip - 1 || this.idx === last) this.checkB();
            this.refresh();
        }
        this.decisions.push({ ...act, skip: moved });
        if (this.idx === last) { this.finished = true; this.lock(); }
        return { ok: true };
    }

    // 結算當天：結入未入帳利息、對照組檢查後鎖定（已結算則無作用）
    settle() {
        if (this.settled) return;
        for (const g of [this.a, ...(this.broke ? [] : [this.b])]) {
            const acct = g.account ?? g;
            acct.cash += g.accrued;
            g.accrued = 0;
        }
        this.checkB();
        this.refresh();
        this.lock();
    }

    lock() {
        this.settled = true;
        this.endIdx = this.idx;
    }

    // 兩組每日指標
    snapshot() {
        const { p50, p631 } = this.series;
        const i = this.idx;
        const hist = this.history;
        const make = (key, cash, shares631, stock, invested, costTotal, tradeCount, extra) => {
            const value = key === 'b' && this.broke ? 0 : cash + stock;
            const profit = value - invested;
            return {
                cash, shares631, value, invested, profit,
                ret: invested > 0 ? profit / invested : null,
                mdd: maxDrawdown(hist.map(h => h[key])),
                stockRatio: value ? stock / value : 0,
                costTotal, tradeCount, ...extra
            };
        };
        const a = this.a, b = this.b;
        const bOn = !this.broke;
        return {
            a: make('a', a.cash, a.shares631, a.shares50 * p50[i] + a.shares631 * p631[i], a.invested, a.costTotal, a.tradeCount, { shares50: a.shares50 }),
            b: make('b', bOn ? b.account.cash : 0, bOn ? b.account.shares : 0, bOn ? b.account.shares * p631[i] : 0, b.invested, b.account.costTotal, b.tradeCount, { broke: !bOn })
        };
    }
}

// 存檔：只存起始日、初始金額、費用設定、決策清單與結算狀態
export function toSave(game) {
    const { dates } = game.series;
    return {
        v: SAVE_VERSION,
        startDate: dates[game.startIdx],
        initial: game.initial,
        discount: game.costs.discount,
        minFee: game.costs.minFee,
        decisions: game.decisions.map(d => ({ ...d })),
        settled: game.settled,
        endDate: game.settled ? dates[game.endIdx] : null
    };
}

// 重建遊戲並重播所有決策；找不到起始日回傳 null
export function replay(series, save) {
    const startIdx = series.dates.indexOf(save.startDate);
    if (startIdx < 0) return null;
    const game = createGame(series, startIdx, { initial: save.initial, costs: { enabled: true, discount: save.discount, minFee: save.minFee } });
    for (const d of save.decisions) {
        if (!game.act(d, d.skip).ok) return null; // 決策無法重現 = 存檔與資料不符，視為損毀
    }
    if (save.settled) game.settle();
    return game;
}
