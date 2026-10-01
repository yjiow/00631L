/**
 * plan/calendar.js
 * 交易日曆工具：設定日 → 當天或之後第一個交易日
 */

const pad = n => String(n).padStart(2, '0');

// y 年 m 月（1~12）第 day 日；當月無該日取月底
export function targetDate(y, m, day) {
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return `${y}-${pad(m)}-${pad(Math.min(day, last))}`;
}

// 已排序日期中第一個 >= date 的索引（無則 dates.length）
export function lowerBound(dates, date) {
    let lo = 0, hi = dates.length;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (dates[mid] < date) lo = mid + 1; else hi = mid;
    }
    return lo;
}

export const addYears = (date, years) => (+date.slice(0, 4) + years) + date.slice(4);

// 兩個 'YYYY-MM-DD' 相差的日曆天數（供現金利息按實際天數計息）
export const daysBetween = (a, b) => (Date.parse(b) - Date.parse(a)) / 864e5;

// 自 startDate 所在月份起連續 count 個月：[{ y, m, year }]（year = 第幾年，1 起算）
export function monthsFrom(startDate, count) {
    const [sy, sm] = startDate.split('-').map(Number);
    return Array.from({ length: count }, (_, k) => ({
        y: sy + Math.floor((sm - 1 + k) / 12),
        m: (sm - 1 + k) % 12 + 1,
        year: Math.floor(k / 12) + 1
    }));
}
