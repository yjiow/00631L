/**
 * planPresets.js
 * 範例情境：步驟 1 頂端一鍵套用按鈕；新增情境只需在 PRESETS 加一筆，按鈕與說明會自動產生
 */
import { DEFAULT_PLAN } from '../../core/plan/defaults.js';

export const PRESETS = [
    {
        name: '小額定投',
        brief: '剛出社會、本金不多：靠每月定額投入，讓複利慢慢滾大。',
        desc: '您剛出社會，本金不多，但還有時間優勢：靠每月定額投入，讓複利慢慢滾大。',
        plan: {
            ...DEFAULT_PLAN, initialCapital: 30_000, stockRatio: 0.8, years: 20,
            cashflows: [{ name: '每月提撥', amount: 3_000, period: 'monthly', month: 1, day: 5, fromYear: 1, toYear: null, inflation: true }]
        }
    },
    {
        name: '收支打平',
        brief: '穩定上班族：滾動信貸做長期投資，用 50/50 與 20% 門檻再平衡累積退休金。',
        desc: '您是信用良好的穩定上班族，想持續滾動信貸做長期投資：透過 50/50 策略與 20% 門檻再平衡，幫自己額外累積退休金。',
        plan: {
            ...DEFAULT_PLAN, initialCapital: 1_000_000, stockRatio: 0.5, years: 20,
            cashflows: [
                { name: '每月信貸還款', amount: -9_700, period: 'monthly', month: 1, day: 5, fromYear: 1, toYear: null, inflation: false },
                { name: '2年增貸', amount: 170_000, period: 'once', month: 12, day: 31, fromYear: 2, toYear: null, inflation: false },
                { name: '4年增貸', amount: 170_000, period: 'once', month: 12, day: 31, fromYear: 4, toYear: null, inflation: false },
                { name: '6年增貸', amount: 170_000, period: 'once', month: 12, day: 31, fromYear: 6, toYear: null, inflation: false },
                { name: '8年增貸', amount: 170_000, period: 'once', month: 12, day: 31, fromYear: 8, toYear: null, inflation: false },
                { name: '10年增貸', amount: 170_000, period: 'once', month: 12, day: 31, fromYear: 10, toYear: null, inflation: false },
                { name: '12年增貸', amount: 170_000, period: 'once', month: 12, day: 31, fromYear: 12, toYear: null, inflation: false },
                { name: '14年增貸', amount: 170_000, period: 'once', month: 12, day: 31, fromYear: 14, toYear: null, inflation: false },
                { name: '16年增貸', amount: 170_000, period: 'once', month: 12, day: 31, fromYear: 16, toYear: null, inflation: false },
                { name: '18年增貸', amount: 170_000, period: 'once', month: 12, day: 31, fromYear: 18, toYear: null, inflation: false },
                { name: '還款', amount: -830_000, period: 'once', month: 12, day: 5, fromYear: 20, toYear: null, inflation: false }
            ],
            purchase: { ...DEFAULT_PLAN.purchase, timing: 'none' }
        }
    },
    {
        name: '差額提領',
        brief: '已退休、退休金不夠生活：每月提領差額，看資產能撐多久、會不會提前用完。',
        desc: '您已退休、手上有一筆資產，但退休金不夠生活：每月從資產提領差額，看看這筆錢能撐多久、會不會提前用完。',
        plan: {
            ...DEFAULT_PLAN, initialCapital: 5_000_000, stockRatio: 0.5, years: 20,
            cashflows: [{ name: '生活費提領', amount: -30_000, period: 'monthly', month: 1, day: 5, fromYear: 1, toYear: null, inflation: true }]
        }
    }
];

// container 內含按鈕與說明段落（data-role="buttons" / "desc"）；onApply(plan) 由呼叫端套用並重算
export function initPresets(container, onApply) {
    const buttons = container.querySelector('[data-role=buttons]');
    const desc = container.querySelector('[data-role=desc]');
    // 每個情境：按鈕 + 下方一行濃縮說明（brief 為固定文案）
    buttons.innerHTML = PRESETS.map((p, i) =>
        `<div class="plan-preset-item"><button type="button" class="plan-preset-btn" data-i="${i}">${p.name}</button><p class="plan-presets-desc">${p.brief}</p></div>`).join('');
    buttons.addEventListener('click', e => {
        const btn = e.target.closest('.plan-preset-btn');
        if (!btn) return;
        const preset = PRESETS[+btn.dataset.i];
        buttons.querySelectorAll('.plan-preset-btn').forEach(b => b.classList.toggle('active', b === btn));
        desc.hidden = false;
        desc.textContent = preset.desc;
        onApply(preset.plan);
    });
}

// 欄位被手動調整或恢復預設時，套用狀態已不準確，移除高亮
export function clearPresetActive(container) {
    container.querySelectorAll('.plan-preset-btn.active').forEach(b => b.classList.remove('active'));
}
