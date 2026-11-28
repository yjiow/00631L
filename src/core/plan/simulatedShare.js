/**
 * plan/simulatedShare.js
 * 滾動起點中「00631L 上市前起跑」（含推算價格）的占比（純計算）
 */

import { LISTING_631L } from '../marketDates.js';

// results：simulateRolling 結果（每筆有 startIdx）；dates：對應標的的交易日陣列；listing：該標的上市日（預設 00631L）
// 回傳 { share: 0～1, count }；空陣列 share = 0
export function rollingSimShare(results, dates, listing = LISTING_631L) {
    const count = results.filter(r => dates[r.startIdx] < listing).length;
    return { share: results.length ? count / results.length : 0, count };
}
