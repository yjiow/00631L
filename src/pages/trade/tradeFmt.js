/**
 * tradeFmt.js
 * 自主實戰的數字文字格式（結算卡、對照表、結算說明共用）
 */

import { fmtRate } from '../plan/planFormat.js';

export const mddText = v => (Math.abs(v) < 0.05 ? 0 : v).toFixed(1) + '%'; // 避免顯示 -0.0%
export const rateText = r => { const t = fmtRate(r); return t === '-0.0%' ? '0.0%' : t; }; // 避免 -0.0%
