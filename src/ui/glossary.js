/**
 * glossary.js
 * 名詞小百科：HTML 在術語元素加 data-term="key"，initGlossary 於其後補「?」按鈕，
 * 點擊 / Enter / Space 開關說明泡泡（同時只開一個；點外面或 Esc 關閉）
 */

export const GLOSSARY = {
    lev2x: '目標是每天漲跌幅約為指數的 2 倍；長期受波動衰減影響，不等於長期報酬 2 倍。',
    rebalance: '漲多了賣一點、跌多了買一點，讓股票維持在目標比例（例如各一半）。',
    rolling: '同一份計畫從歷史上每個月初各跑一次，看運氣好壞的範圍。',
    mdd: '資產從最高點跌到最低點的最大幅度。例：−50% 代表 100 萬最多剩 50 萬。',
    xirr: '把每次投入與期末資產一起算，約等於每年平均賺多少。',
    adjprice: '把除息與股票分割調整過的價格，才能公平比較長期報酬。',
    ma: '最近 N 天收盤價的平均；5MA 週線、20MA 月線、120MA 半年線、240MA 年線。',
    survive: '歷史上所有起點中，資金沒有被提領耗盡的比例，不是對未來的預測。',
    simulated: '上市前以指數推算的價格，不含管理費與追蹤誤差，實際會較低。'
};

const boundDocs = new WeakSet(); // 全域事件（點外面 / Esc / 捲動）每份 document 只綁一次
let bubble = null;               // 說明泡泡（共用一個）
let openBtn = null;              // 目前開啟中的「?」按鈕

// 換頁前由 router 呼叫：關閉開啟中的泡泡（舊按鈕即將被移除）
export function closeGlossary() { closeBubble(); }

function closeBubble() {
    if (openBtn) openBtn.setAttribute('aria-expanded', 'false');
    openBtn = null;
    if (bubble) bubble.hidden = true;
}

// 泡泡置於按鈕上方（空間不足改放下方），水平夾在視窗內（手機不超出）
function placeBubble() {
    if (!openBtn || !bubble) return;
    if (!openBtn.isConnected) { closeBubble(); return; }
    const r = openBtn.getBoundingClientRect(), w = bubble.offsetWidth, h = bubble.offsetHeight, gap = 8;
    const left = Math.min(Math.max(r.left + r.width / 2 - w / 2, gap), window.innerWidth - w - gap);
    const top = r.top - h - gap >= gap ? r.top - h - gap : r.bottom + gap;
    bubble.style.left = `${Math.max(left, gap)}px`;
    bubble.style.top = `${top}px`;
}

function openFor(btn, doc) {
    if (!bubble || !bubble.isConnected) {
        bubble = doc.createElement('div');
        bubble.className = 'term-bubble';
        bubble.id = 'term-bubble';
        bubble.setAttribute('role', 'tooltip');
        doc.body.append(bubble);
    }
    if (openBtn) openBtn.setAttribute('aria-expanded', 'false');
    openBtn = btn;
    btn.setAttribute('aria-expanded', 'true');
    btn.setAttribute('aria-describedby', 'term-bubble');
    bubble.textContent = GLOSSARY[btn.dataset.key];
    bubble.hidden = false;
    placeBubble();
}

function bindGlobal(doc) {
    if (boundDocs.has(doc) || !doc.addEventListener) return;
    boundDocs.add(doc);
    doc.addEventListener('click', e => {
        if (!openBtn) return;
        if (e.target.closest?.('.term-hint, .term-bubble')) return;
        closeBubble();
    });
    doc.addEventListener('keydown', e => { if (e.key === 'Escape') closeBubble(); });
    doc.defaultView?.addEventListener('scroll', placeBubble, { passive: true });
    doc.defaultView?.addEventListener('resize', placeBubble);
}

// 掃描 root 內的 [data-term]，補上「?」按鈕；已補過（或 key 不存在）的略過，可重複呼叫
export function initGlossary(root = document) {
    const doc = root.ownerDocument ?? root;
    bindGlobal(doc);
    for (const el of root.querySelectorAll('[data-term]')) {
        const key = el.dataset.term;
        if (el.dataset.termReady || !GLOSSARY[key]) continue;
        el.dataset.termReady = '1';
        const btn = doc.createElement('button');
        btn.type = 'button';
        btn.className = 'term-hint';
        btn.dataset.key = key;
        btn.textContent = '?';
        btn.setAttribute('aria-label', `${el.dataset.termLabel ?? el.textContent.trim()}說明`);
        btn.setAttribute('aria-expanded', 'false');
        btn.addEventListener('click', e => {
            e.preventDefault();
            if (openBtn === btn) closeBubble(); else openFor(btn, doc);
        });
        el.after(btn);
    }
}
