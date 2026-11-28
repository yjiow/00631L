// 自主實戰結算說明（settlementNotes）：多 / 少 / 相同、報酬率 null、回撤深淺、費用 0
import { describe, it, expect } from 'vitest';
import { settlementNotes } from '../src/pages/trade/tradeNotes.js';

const snap = (o = {}) => ({ value: 1000000, ret: 0, mdd: -10, tradeCount: 0, costTotal: 0, ...o });

describe('settlementNotes', () => {
    it('你多了：金額差與報酬率括號', () => {
        const [m] = settlementNotes(snap({ value: 1008983.4, ret: 0.009 }), snap({ value: 950356, ret: -0.05 }));
        expect(m).toBe('最終資產：你 1,008,983 元、對照策略 950,356 元，你多了 58,627 元（報酬率 0.9% 對 -5.0%）。');
    });
    it('你少了', () => {
        const [m] = settlementNotes(snap({ value: 900000, ret: -0.1 }), snap({ value: 1000000, ret: 0 }));
        expect(m).toBe('最終資產：你 900,000 元、對照策略 1,000,000 元，你少了 100,000 元（報酬率 -10.0% 對 0.0%）。');
    });
    it('四捨五入到元相同', () => {
        const [m] = settlementNotes(snap({ value: 1000000.2 }), snap({ value: 999999.6 }));
        expect(m).toBe('最終資產與對照策略相同（1,000,000 元）。');
    });
    it('報酬率為 null 時省略括號', () => {
        const [m] = settlementNotes(snap({ value: 2e6, ret: null }), snap({ value: 1e6, ret: 0.1 }));
        expect(m).toBe('最終資產：你 2,000,000 元、對照策略 1,000,000 元，你多了 1,000,000 元。');
    });
    it('不顯示 -0.0%', () => {
        const [m, r] = settlementNotes(snap({ value: 1e6 + 5, ret: -0.0001, mdd: -0.01 }), snap({ value: 1e6, ret: 0, mdd: 0 }));
        expect(m).toContain('報酬率 0.0% 對 0.0%');
        expect(r).toBe('最大回撤：你 0.0%、對照策略 0.0%（兩者相同）。');
    });
    it('回撤更深 / 較淺 / 相同', () => {
        expect(settlementNotes(snap({ mdd: -22.6 }), snap({ mdd: -0.2 }))[1]).toBe('最大回撤：你 -22.6%、對照策略 -0.2%（你跌得更深）。');
        expect(settlementNotes(snap({ mdd: -0.2 }), snap({ mdd: -22.6 }))[1]).toBe('最大回撤：你 -0.2%、對照策略 -22.6%（你跌得較淺）。');
        expect(settlementNotes(snap({ mdd: -5 }), snap({ mdd: -5 }))[1]).toBe('最大回撤：你 -5.0%、對照策略 -5.0%（兩者相同）。');
    });
    it('交易與費用：含費用為 0', () => {
        const n = settlementNotes(snap({ tradeCount: 4, costTotal: 24.4 }), snap({ tradeCount: 0, costTotal: 0 }));
        expect(n[2]).toBe('交易與費用：你 4 筆、24 元；對照策略 0 筆、0 元。');
        expect(n).toHaveLength(3);
    });
});
