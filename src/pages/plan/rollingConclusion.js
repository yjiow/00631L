/**
 * rollingConclusion.js
 * 滾動起點分布的白話結論（純函式，金額格式由呼叫端傳入 fmt）
 * stats：{ total 起點數, ok 撐過數, worst / median / best 期末資產, okWorst 撐過起點中最差（有斷鏈時使用，未給則用 worst） }
 */
export function rollingConclusion({ total, ok, worst, median, best, okWorst = worst }, fmt) {
    if (!total) return '';
    if (ok >= total) {
        return `${total} 個起點裡 ${total} 次錢都夠用；最差 ${fmt(worst)}、中位 ${fmt(median)}、最好 ${fmt(best)}`;
    }
    const broke = total - ok;
    const head = `${total} 個起點裡有 ${broke} 次資金斷鏈（${ok} 次撐過）`;
    if (!ok) return head;
    return `${head}；撐過的最差 ${fmt(okWorst)}，全部起點中位 ${fmt(median)}、最好 ${fmt(best)}`;
}
