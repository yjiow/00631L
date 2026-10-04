/**
 * plan/defaults.js
 * 計畫參數格式與預設值；讀取舊存檔 / 分享連結時以 normalizePlan 補齊缺欄位
 * 新增參數：在 DEFAULT_PLAN 加欄位（附預設值），巢狀物件同步加進 normalizePlan
 */

export const PLAN_VERSION = 1;

export const DEFAULT_PLAN = {
    version: PLAN_VERSION,
    target: '00631L', // 標的：'00631L' | '0050'（畫面固定 00631L；0050 僅供結果對照；股價欄位對應見 pages/plan/plan.js）
    years: 20,
    initialCapital: 1_000_000,
    stockRatio: 0.5, // 股票比例 0~1（初始配置；日後與再平衡目標共用）
    // 股票比例時程：[{ fromYear, ratio }]，第 fromYear 年起切換為 ratio（0~1；最多 4 列、fromYear 嚴格遞增、≥2 且 < years）；第 1 年起為 stockRatio；空陣列 = 全程固定比例
    stockRatioSchedule: [],
    // 通膨率（年，固定；0~1）：inflation=true 的每月 / 每年現金流金額自 fromYear 起逐年調整。
    // 此為表單預設 2%；舊資料缺此欄位經 normalizePlan 一律視為 0（結果不變）
    inflationRate: 0.02,
    // 金額正 = 入帳、負 = 扣款；period：'monthly' 每月 | 'yearly' 每年 month 月 | 'once' 第 fromYear 年的 month 月
    // fromYear / toYear 為第幾年（toYear null = 到期末；once 只看 fromYear）
    cashflows: [{ name: '每月淨現金流', amount: 10_000, period: 'monthly', month: 1, day: 5, fromYear: 1, toYear: null, inflation: true }], // inflation：金額隨通膨調整（單次不適用）
    // timing：'inflow' 每筆正現金流入帳當天以全部現金買進 | 'monthly' 每月 day 日 | 'none' 不自動買進
    // inflowMode（僅 inflow）：'amount' 買入帳金額 | 'ratio' 依股票比例投入（買到目標比例）| 'threshold' 偏離超過 threshold 才買到目標比例（只買不賣）
    // mode（僅 monthly）：'all' 全部現金 | 'fixed' 固定金額 amount（上限，剩餘留在現金）
    purchase: { timing: 'none', inflowMode: 'threshold', threshold: 0.2, day: 5, mode: 'all', amount: 0 },
    // mode：'none' 不再平衡 | 'periodic' 定期（period：'monthly' | 'quarterly' 1/4/7/10 月 | 'yearly' month 月；day 日）| 'threshold' 漲跌幅門檻
    rebalance: { mode: 'threshold', period: 'yearly', month: 1, day: 5, threshold: 0.2 },
    // 手續費折扣、最低手續費；費率與稅率為系統參數（fees.js）
    costs: { enabled: true, discount: 0.6, minFee: 1 },
    // 大跌加碼（選填，預設關閉；tiers 為預設範例，關閉時不影響結果）：標的自歷史高點回撤達 drawdown（0~1）時動用現金 cashPct（0~1）加碼，最多 3 階、drawdown 嚴格遞增；
    // 回升到高點 −recoverAt 以內後，每月第一個交易日收回，分 recoverMonths 個月；加碼輪期間再平衡只買不賣（見 dipBuy.js）
    dipBuy: { enabled: false, tiers: [{ drawdown: 0.5, cashPct: 0.3 }, { drawdown: 0.7, cashPct: 0.5 }, { drawdown: 0.8, cashPct: 1 }], recoverAt: 0.3, recoverMonths: 12 },
    cashRate: 0.01 // 現金年利率（固定，不反映歷史升降息），預設 1%；存款利息課稅暫不計
};

export function normalizePlan(plan = {}) {
    return {
        ...DEFAULT_PLAN, ...plan,
        version: PLAN_VERSION,
        inflationRate: plan.inflationRate ?? 0, // 舊資料缺欄位視為 0（DEFAULT_PLAN 的 2% 只作表單預設）
        stockRatioSchedule: (plan.stockRatioSchedule ?? []).map(s => ({ ...s })),
        cashflows: (plan.cashflows ?? DEFAULT_PLAN.cashflows).map(f => ({ name: '', period: 'monthly', month: 1, fromYear: 1, toYear: null, inflation: false, ...f })),
        purchase: { ...DEFAULT_PLAN.purchase, ...plan.purchase },
        rebalance: { ...DEFAULT_PLAN.rebalance, ...plan.rebalance },
        costs: { ...DEFAULT_PLAN.costs, ...plan.costs },
        dipBuy: { ...DEFAULT_PLAN.dipBuy, ...plan.dipBuy, tiers: (plan.dipBuy?.tiers ?? DEFAULT_PLAN.dipBuy.tiers).map(t => ({ ...t })) }
    };
}
