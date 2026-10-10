// 冒煙測試：無頭 Chrome 實際操作網站關鍵流程（部署前本機執行，見 需求相關/測試項目.md）
// 用法：先啟動 Vite（npm run dev，預設 http://localhost:5173/），再 `npm run smoke`
// 環境變數：SMOKE_URL 指定網址（如 vite preview 的 http://localhost:4173/）、CHROME 指定 Chrome 執行檔
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const BASE = process.env.SMOKE_URL ?? 'http://localhost:5173/';
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- 啟動 Chrome + CDP ----------
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'smoke-'));
const port = 9400 + Math.floor(Math.random() * 100);
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
const cleanup = () => { try { chrome.kill(); } catch {} try { fs.rmSync(profile, { recursive: true, force: true }); } catch {} };
process.on('exit', cleanup);

let targets;
for (let i = 0; i < 40; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; } catch { await sleep(250); } }
if (!targets) { console.error('無法連上 Chrome（路徑可用環境變數 CHROME 指定）'); process.exit(2); }
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => { ws.onopen = r; });

let msgId = 0; const pending = new Map(); const errors = [];
ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result ?? m.error); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errors.push('例外：' + (m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text));
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('console.error：' + m.params.args.map(a => a.value ?? a.description).join(' '));
    if (m.method === 'Page.javascriptDialogOpening') { errors.push('非預期對話框：' + m.params.message.slice(0, 60)); send('Page.handleJavaScriptDialog', { accept: false }); }
};
const send = (method, params = {}) => new Promise(r => { const id = ++msgId; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const ev = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description?.split('\n')[0] ?? r.exceptionDetails.text);
    return r.result?.value;
};
const waitFor = async (expr, what, ms = 6000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { if (await ev(`(()=>{try{return !!(${expr})}catch{return false}})()`)) return; await sleep(100); }
    throw new Error('逾時未出現：' + what);
};

// 每個新文件載入前注入：固定「無系統分享面板、剪貼簿記錄複製內容」，並提供 vis（可見）判斷
await send('Runtime.enable'); await send('Page.enable');
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async u => { window.__copied = u; } }, configurable: true });
    window.vis = e => !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0;
    window.$ = id => document.getElementById(id);` });

async function open(width, url = BASE) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 });
    await send('Page.navigate', { url: BASE });
    await sleep(800);
    await ev(`localStorage.clear()`);
    await send('Page.navigate', { url });
    await waitFor(`document.querySelector('nav, .navbar, [data-view]')`, '導覽列');
    await sleep(600);
}
const goView = async view => { await ev(`document.querySelector('[data-view="${view}"]').click()`); await sleep(700); };
const setYears = n => ev(`(()=>{const i=document.querySelector('[name=years]');i.value='${n}';i.dispatchEvent(new Event('input',{bubbles:true}))})()`);

// ---------- 檢查項目 ----------
const results = [];
async function check(name, fn) {
    const before = errors.length;
    try { await fn(); if (errors.length > before) throw new Error(errors.slice(before).join('；')); results.push([true, name]); console.log('  ✓', name); }
    catch (e) { results.push([false, name, e.message]); console.log('  ✗', name, '→', e.message); }
}

console.log('電腦版 1440');
await open(1440);
await check('首頁載入：統計卡與圖表有內容', async () => {
    await waitFor(`$('roi-00631')?.textContent.trim() && $('mainChart')`, '首頁統計卡 / 圖表');
});
await check('首頁「分享本站」：複製網址並顯示提示', async () => {
    await ev(`$('home-share').click()`);
    await waitFor(`vis($('home-share-feedback')) && $('home-share-feedback').textContent.includes('已複製')`, '已複製提示');
    if (!(await ev(`window.__copied`)).startsWith(BASE.replace(/\/$/, ''))) throw new Error('複製內容不是本站網址');
});
await check('導覽切換：策略概覽 / 投資計畫 / 自主實戰 / 關於我 皆可進入', async () => {
    for (const [view, sel] of [['plan', '#plan-form'], ['trade', '.panel-card, .panel-title'], ['about', '.panel-card, .panel-title'], ['home', '#mainChart']]) {
        await goView(view);
        await waitFor(`document.querySelector('${sel}')`, `${view} 頁內容`);
    }
});

await goView('plan');
await waitFor(`$('rs-success')?.textContent.trim()`, '投資計畫預設結果');
await check('投資計畫：預設結果（統計卡、滾動分布圖）', async () => {
    await waitFor(`$('chartRolling') && $('rs-median').textContent.trim() && $('rs-xirr').textContent.trim()`, '統計卡');
});
await check('投資計畫：改年數 7 → 開始模擬 → 結果隨之更新', async () => {
    const before = await ev(`$('rolling-desc').textContent`);
    await setYears(7);
    await ev(`document.querySelector('.plan-submit').click()`);
    await waitFor(`$('rolling-desc').textContent.includes('各跑 7 年')`, '說明文字更新為 7 年');
    if (before === await ev(`$('rolling-desc').textContent`)) throw new Error('結果未變');
});
await check('投資計畫：6 個頁籤切換，只顯示對應內容', async () => {
    for (let n = 0; n < 6; n++) {
        await ev(`document.querySelector('.plan-tab[data-tab="${n}"]').click()`);
        const shown = await ev(`[...document.querySelectorAll('.plan-pane')].map(p => vis(p))`);
        if (shown.filter(Boolean).length !== 1 || !shown[n]) throw new Error(`第 ${n + 1} 頁籤顯示異常：${JSON.stringify(shown)}`);
    }
    await ev(`document.querySelector('.plan-tab[data-tab="0"]').click()`);
});
await check('投資計畫：「案例」開關（按鈕 / Esc）與帶入', async () => {
    await ev(`$('plan-cases').click()`);
    await waitFor(`vis($('modal-cases')) && document.querySelectorAll('.plan-case-apply').length >= 1`, '案例清單');
    await ev(`$('modal-cases-close').click()`);
    await waitFor(`!vis($('modal-cases'))`, '案例 Modal 關閉');
    await ev(`$('plan-cases').click()`);
    await waitFor(`vis($('modal-cases'))`, '案例 Modal 再開');
    await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
    await waitFor(`!vis($('modal-cases'))`, 'Esc 關閉案例 Modal');
    await ev(`$('plan-cases').click()`);
    await waitFor(`document.querySelectorAll('.plan-case-apply').length >= 1`, '案例清單');
    await ev(`document.querySelector('.plan-case-apply').click()`);
    await waitFor(`!vis($('modal-cases'))`, '帶入後 Modal 關閉');
    await waitFor(`$('rs-success').textContent.trim()`, '帶入後有結果');
});
await check('投資計畫：分享連結產出、開啟後帶回參數並清除網址列', async () => {
    await open(1440); // 乾淨狀態（排除前一項案例帶入的參數）
    await goView('plan');
    await waitFor(`$('rs-success')?.textContent.trim()`, '預設結果');
    await setYears(9);
    await ev(`document.querySelector('.plan-submit').click()`);
    await waitFor(`$('rolling-desc').textContent.includes('各跑 9 年')`, `9 年結果（錯誤訊息：${await ev(`$('plan-error')?.textContent`) || '無'}）`);
    await ev(`window.__copied = null; $('plan-share').click()`);
    await waitFor(`window.__copied && $('plan-share').classList.contains('is-done')`, '連結產出與 ✓ 提示', 4000);
    const link = await ev(`window.__copied`);
    if (!/[?&]plan=/.test(link)) throw new Error('連結不含 plan 參數');
    await ev(`localStorage.clear()`); // 排除「上次參數」干擾，確認年數來自連結
    await send('Page.navigate', { url: link });
    await waitFor(`document.querySelector('[name=years]')?.value === '9'`, '連結帶入年數 9', 8000);
    await waitFor(`$('rs-success')?.textContent.trim()`, '帶入後自動模擬有結果');
    if (/plan=/.test(await ev(`location.search`))) throw new Error('網址列未清除 plan 參數');
});

await check('投資計畫：點分享的當下同步呼叫系統分享（iPhone Safari 須在手勢內，不能先等壓縮）', async () => {
    await waitFor(`$('rs-success')?.textContent.trim()`, '結果');
    await sleep(800); // 等預先連結產生
    const r = await ev(`(async () => {
        let depth = 0, sync = null, sharedUrl = null;
        const down = () => { depth = 1; }, up = () => { depth = 0; };
        document.addEventListener('click', down, true); document.addEventListener('click', up, false);
        Object.defineProperty(navigator, 'share', { value: async d => { sync = depth === 1; sharedUrl = d.url; }, configurable: true });
        $('plan-share').click();
        await new Promise(r => setTimeout(r, 400));
        document.removeEventListener('click', down, true); document.removeEventListener('click', up, false);
        Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
        return { sync, sharedUrl };
    })()`);
    if (r.sync === null) throw new Error('沒有呼叫系統分享');
    if (r.sync !== true) throw new Error('系統分享不是在點擊當下同步呼叫（iPhone 會被拒絕）');
    if (!/[?&]plan=/.test(r.sharedUrl ?? '')) throw new Error('分享連結不含 plan 參數');
});

console.log('手機版 390');
await open(390);
const PAGES = ['home', 'plan', 'trade', 'about'];
await check('各頁沒有水平溢出（不可左右捲動）', async () => {
    for (const view of PAGES) {
        await goView(view);
        await sleep(500);
        const w = await ev(`[document.documentElement.scrollWidth, innerWidth]`);
        if (w[0] > w[1] + 1) throw new Error(`${view} 頁寬 ${w[0]} 超出視窗 ${w[1]}`);
    }
});
await goView('plan');
await waitFor(`$('plan-form')`, '投資計畫表單');
await check('投資計畫標題列：分享與案例按鈕在卡片內、互不重疊', async () => {
    const r = await ev(`(()=>{const c=$('plan-params').getBoundingClientRect(),a=$('plan-share').getBoundingClientRect(),b=$('plan-cases').getBoundingClientRect();
        const overlap = !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
        return { inCard: a.left >= c.left && b.right <= c.right && b.left >= c.left, overlap }})()`);
    if (!r.inCard) throw new Error('按鈕超出卡片範圍');
    if (r.overlap) throw new Error('分享與案例按鈕重疊');
});
await check('投資計畫手機版：步驟左右切換', async () => {
    const before = await ev(`$('plan-step-label').textContent`);
    await ev(`document.querySelector('.plan-step-btn[data-step="1"]').click()`);
    await waitFor(`$('plan-step-label').textContent !== ${JSON.stringify(before)}`, '步驟標籤改變');
});
await check('投資計畫手機版：開始模擬後有結果', async () => {
    await ev(`document.querySelector('.plan-submit').click()`);
    await waitFor(`$('rs-success')?.textContent.trim()`, '結果');
});

// ---------- 結果 ----------
const failed = results.filter(r => !r[0]);
console.log(`\n冒煙測試：${results.length - failed.length}/${results.length} 通過`);
ws.close(); cleanup();
process.exit(failed.length ? 1 : 0);
