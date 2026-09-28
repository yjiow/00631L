/**
 * database.js
 * 歷史資料查詢（讀取靜態 JSON）
 */

let cache = null; // 依日期排序的每日資料 [{ date, t2_close, tw50_close }]，載入一次後快取

// 本地 JSON（日期 'YYYY/MM/DD'、漲跌幅 'x.xx%'）→ Map<'YYYY-MM-DD', 指數化收盤價（首日 100）>
function toCloseMap(rows) {
    const sorted = [...rows].sort((a, b) => a.日期.localeCompare(b.日期));
    const map = new Map();
    let close = 100;
    sorted.forEach((r, i) => {
        const pct = parseFloat(r.漲跌幅); // '-' → NaN
        if (i > 0 && !isNaN(pct)) close *= 1 + pct / 100;
        map.set(r.日期.replaceAll('/', '-'), close);
    });
    return map;
}

// 轉成統一欄位格式；日後改接資料庫只需替換此函式
async function loadAll() {
    if (cache) return cache;
    const [raw00631, raw0050] = await Promise.all([
        fetch('data/00631_ALL.json').then(r => r.json()),
        fetch('data/0050_ALL.json').then(r => r.json())
    ]);
    const t2   = toCloseMap(raw00631);
    const tw50 = toCloseMap(raw0050);
    const dates = [...new Set([...t2.keys(), ...tw50.keys()])].sort();
    cache = dates.map(date => ({
        date,
        t2_close:   t2.get(date)   ?? null,
        tw50_close: tw50.get(date) ?? null
    }));
    return cache;
}

// 取得區間資料，日期格式 'YYYY-MM-DD'
// dataInterval：'daily' 每日；'monthly_last_day' 每月最後一個交易日
export async function fetchBacktestData(startDate, endDate, dataInterval = 'daily') {
    const rows = (await loadAll()).filter(r => r.date >= startDate && r.date <= endDate);
    if (dataInterval !== 'monthly_last_day') return rows;
    return rows.filter((r, i) => i === rows.length - 1 || rows[i + 1].date.slice(0, 7) !== r.date.slice(0, 7));
}
