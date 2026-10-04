/**
 * assetSeries.js
 * 單一起點資產曲線的資料組裝（純函式）：降採樣後的日期軸、總資產、累計淨投入、對照組 A 總資產
 */

import { downsampleIdx } from './chartTheme.js';

// daily：目前（B）每日資產；dailyA：釘住的對照組 A 同起點每日資產（無則 null）
// A 依日期對齊 B 的日期軸；A 較早中止（資金斷鏈）時，之後的點為 null（不補值）；降採樣仍以 B 為準
export function assetSeries(daily, dailyA = null) {
    let labels = daily.map(d => d.date), value = daily.map(d => d.value), invested = daily.map(d => d.invested);
    const idx = downsampleIdx(labels.length, [value]);
    if (idx) [labels, value, invested] = [labels, value, invested].map(arr => idx.map(i => arr[i]));
    let a = null;
    if (dailyA) {
        const byDate = new Map(dailyA.map(d => [d.date, d.value]));
        a = labels.map(l => byDate.get(l) ?? null);
    }
    return { labels, value, invested, a };
}
