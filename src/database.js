/**
 * database.js
 * 歷史資料查詢（讀取靜態 JSON）
 */

let cache = null; // 依日期排序的每日資料 [{ date, t2_close, tw50_close }]，載入一次後快取

// 本地 JSON [{ date, close, adjClose, simulated? }] → Map<'YYYY-MM-DD', 還原股價>
// 回測一律用 adjClose（分割、除息已還原；0050 為含息）；close 為當日真實股價，供日後顯示
const toAdjMap = rows => new Map(rows.map(r => [r.date, r.adjClose]));

// 轉成統一欄位格式；日後改接資料庫只需替換此函式
async function loadAll() {
    if (cache) return cache;
    const [raw00631, raw0050] = await Promise.all([
        fetch('data/00631L.json').then(r => r.json()),
        fetch('data/0050.json').then(r => r.json())
    ]);
    const t2   = toAdjMap(raw00631);
    const tw50 = toAdjMap(raw0050);
    const dates = [...new Set([...t2.keys(), ...tw50.keys()])].sort();
    cache = dates.map(date => ({
        date,
        t2_close:   t2.get(date)   ?? null,
        tw50_close: tw50.get(date) ?? null
    }));
    return cache;
}

// 資料最後交易日 'YYYY-MM-DD'（兩檔皆有值的最後一天）
export async function getLatestDate() {
    const rows = await loadAll();
    for (let i = rows.length - 1; i >= 0; i--) {
        if (rows[i].t2_close != null && rows[i].tw50_close != null) return rows[i].date;
    }
    return null;
}

// 取得區間資料，日期格式 'YYYY-MM-DD'
// dataInterval：'daily' 每日；'monthly_last_day' 每月最後一個交易日
export async function fetchBacktestData(startDate, endDate, dataInterval = 'daily') {
    const rows = (await loadAll()).filter(r => r.date >= startDate && r.date <= endDate);
    if (dataInterval !== 'monthly_last_day') return rows;
    return rows.filter((r, i) => i === rows.length - 1 || rows[i + 1].date.slice(0, 7) !== r.date.slice(0, 7));
}
