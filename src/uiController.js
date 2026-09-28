/**
 * uiController.js
 * 首頁策略回測：日期區間選單、績效卡片、50/50 Modal 的 DOM 控制
 * 由 router.js 在載入 views/home.html 後呼叫 initBacktest()
 */

import { fetchBacktestData } from './database.js';
import { calcBuyHold, calc5050, findMDDPeriod } from './calculator.js';
import { renderBacktestChart, render5050DetailChart } from './chartRender.js';
import { renderWinRate } from './winRatePanel.js';

let currentStartDate = null;
let currentEndDate   = null;
let lastS5050        = null;
let requestId        = 0; // 避免滑桿快速拖曳時舊結果覆蓋新結果
let outsideClickBound = false;

const $ = id => document.getElementById(id);
const mmdd = date => date.slice(5).replace('-', '/'); // 'YYYY-MM-DD' → 'MM/DD'

function setCard(key, series) {
    const last = series[series.length - 1];
    const roi = Math.round(last.amount - 100);
    const roiEl = $('roi-' + key);
    roiEl.innerText = (roi >= 0 ? '+' : '') + roi.toLocaleString() + '%';
    roiEl.className = 'stat-value ' + (roi >= 0 ? 'positive' : 'negative');
    $('final-' + key).innerText =
        '$100 -> $' + last.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    $('mdd-' + key).innerText = last.mdd.toFixed(1) + '%';
    const period = findMDDPeriod(series);
    $('mdd-period-' + key).innerText = period.peak + '~' + period.trough;
    return { roi, mdd: last.mdd };
}

const CROWN_SVG =
    '<svg class="crown-icon" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round">' +
    '<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/></svg>';

function addCrown(id) {
    $(id).insertAdjacentHTML('beforeend', CROWN_SVG);
}

function renderDashboard(s00631, s5050, s0050) {
    lastS5050 = s5050;
    const results = {
        '00631': setCard('00631', s00631),
        '5050':  setCard('5050',  s5050),
        '0050':  setCard('0050',  s0050)
    };

    const maxRoi = Math.max(...Object.values(results).map(r => r.roi));
    const maxMdd = Math.max(...Object.values(results).map(r => r.mdd));
    Object.entries(results).forEach(([key, r]) => {
        if (r.roi === maxRoi) addCrown('roi-' + key);
        if (r.mdd === maxMdd) addCrown('mdd-' + key);
    });

    const map5050 = new Map(s5050.map(d => [d.date, d.amount]));
    const map0050 = new Map(s0050.map(d => [d.date, d.amount]));
    const labels  = s00631.map(d => d.date);
    renderBacktestChart(
        labels,
        s00631.map(d => d.amount),
        labels.map(dt => map5050.get(dt) ?? null),
        labels.map(dt => map0050.get(dt) ?? null)
    );
    renderWinRate(s00631, s5050, s0050);
}

async function loadRange(startYear, endYear, startDate, endDate) {
    if (endYear < startYear) endYear = startYear;
    currentStartDate = startDate || (startYear + '-01-01');
    currentEndDate   = endDate   || (endYear  + '-12-31');

    // 同步滑桿與標籤
    $('startSlider').value = startYear;
    $('endSlider').value   = endYear;
    $('startYearLabel').textContent = startYear;
    $('endYearLabel').textContent   = endYear;
    $('startDateLabel').textContent = mmdd(currentStartDate);
    $('endDateLabel').textContent   = mmdd(currentEndDate);

    // 快捷鍵 active 狀態
    const customStart = currentStartDate === startYear + '-01-01' ? '' : currentStartDate;
    document.querySelectorAll('.year-quick-btn').forEach(btn => {
        btn.classList.toggle('active',
            +btn.dataset.start === startYear && +btn.dataset.end === endYear &&
            (btn.dataset.startDate || '') === customStart);
    });
    document.querySelector('.float-trigger-label').textContent = startYear + '～' + endYear;

    const id = ++requestId;
    const rows = await fetchBacktestData(currentStartDate, currentEndDate, 'daily');
    if (id !== requestId || !$('mainChart')) return; // 已有較新的請求或已離開首頁

    const s00631 = calcBuyHold(rows, 't2_close');
    const s0050  = calcBuyHold(rows, 'tw50_close');
    if (!s00631.length || !s0050.length) return;
    renderDashboard(s00631, calc5050(rows, 't2_close'), s0050);
}

// MM/DD 點擊編輯
function setupDateEdit(labelId, isStart) {
    const el = $(labelId);
    el.addEventListener('click', () => {
        if (document.querySelector('.date-edit-input')) return;
        const savedVal = el.textContent;

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'date-edit-input';
        input.value = savedVal;
        input.maxLength = 5;

        // 精確疊蓋在原文字上，不影響版面
        const r = el.getBoundingClientRect();
        Object.assign(input.style, {
            top: r.top + 'px', left: r.left + 'px',
            width: r.width + 'px', height: r.height + 'px'
        });
        document.body.appendChild(input);
        input.focus();
        input.select();

        // 自動維持 MM/DD 格式
        let prevLen = input.value.length;
        input.addEventListener('input', () => {
            const digits = input.value.replace(/\D/g, '').slice(0, 4);
            let fmt = digits.slice(0, 2);
            if (digits.length > 2) {
                fmt += '/' + digits.slice(2);
            } else if (digits.length === 2 && input.value.length > prevLen) {
                fmt += '/';
            }
            input.value = fmt;
            prevLen = input.value.length;
        });

        let done = false;
        function apply(save) {
            if (done) return;
            done = true;
            input.remove();
            if (save) {
                const m = input.value.trim().match(/^(\d{1,2})\/(\d{1,2})$/);
                if (m) {
                    const md = m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0');
                    const sy = +$('startYearLabel').textContent;
                    const ey = +$('endYearLabel').textContent;
                    if (isStart) loadRange(sy, ey, sy + '-' + md, currentEndDate);
                    else         loadRange(sy, ey, currentStartDate, ey + '-' + md);
                    return;
                }
            }
            el.textContent = savedVal;
        }

        input.addEventListener('blur', () => apply(true));
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter') input.blur();
            if (e.key === 'Escape') apply(false);
        });
    });
}

export function initBacktest() {
    const panel   = $('floatPanel');
    const trigger = document.querySelector('.float-trigger');
    if (!panel || !trigger) return;

    const togglePanel = open => { panel.style.display = open ? 'block' : 'none'; };
    trigger.addEventListener('click', () => togglePanel(panel.style.display === 'none'));

    // 點擊面板外關閉（全域只綁一次，切頁回來不重複綁定）
    if (!outsideClickBound) {
        outsideClickBound = true;
        document.addEventListener('click', e => {
            const p = $('floatPanel');
            if (p && !e.target.closest('.float-menu')) p.style.display = 'none';
        });
    }

    // 滑桿最大值為今年
    const curYear = new Date().getFullYear();
    const startSlider = $('startSlider');
    const endSlider   = $('endSlider');
    startSlider.max = curYear;
    endSlider.max   = curYear;

    startSlider.addEventListener('input', () => {
        const s = +startSlider.value, e = +endSlider.value;
        loadRange(s, Math.max(s, e));
    });
    endSlider.addEventListener('input', () => {
        const s = +startSlider.value, e = +endSlider.value;
        loadRange(Math.min(s, e), e);
    });

    // 快捷鍵：選後關閉面板，保留目前結束日期
    document.querySelectorAll('.year-quick-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            togglePanel(false);
            const startDate = btn.dataset.startDate || null;
            const startYear = +btn.dataset.start;
            const endDate = currentEndDate || (curYear + '-12-31');
            const endYear = +endDate.slice(0, 4);
            if ((startDate || startYear + '-01-01') > endDate) {
                loadRange(startYear, curYear, startDate, curYear + '-12-31');
            } else {
                loadRange(startYear, endYear, startDate, endDate);
            }
        });
    });

    // 50/50 詳細圖表 Modal
    const modal = $('modal-5050');
    $('btn-5050-info').addEventListener('click', () => {
        if (!lastS5050) return;
        modal.style.display = 'flex';
        render5050DetailChart(lastS5050);
    });
    $('modal-5050-close').addEventListener('click', () => { modal.style.display = 'none'; });
    modal.addEventListener('click', e => { if (e.target === modal) modal.style.display = 'none'; });

    setupDateEdit('startDateLabel', true);
    setupDateEdit('endDateLabel', false);

    loadRange(2000, curYear);
}
