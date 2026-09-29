/**
 * navIndicator.js
 * 導覽列目前頁底線（單一元素，定位到 .active 項目下方）
 */

const SVG_NS = 'http://www.w3.org/2000/svg';
const SPARK_H = 12;  // 電弧區高度
const TRAIL   = 70;  // 尾巴固定長度

let bar = null;
let spark = null; // 尾巴上的閃爍電弧（SVG）
let rafId = 0;
let curX = null; // 目前底線 X；null = 尚未定位

// 沿尾巴產生鋸齒折線，每幀重畫形成閃爍
function crackle() {
    const len = parseFloat(bar.style.getPropertyValue('--trail')) || 0;
    spark.setAttribute('viewBox', `0 0 ${len} ${SPARK_H}`);
    spark.querySelectorAll('polyline').forEach(line => {
        const pts = [];
        for (let x = 0; x <= len; x += 6 + Math.random() * 8) {
            const amp = (x / len) * (SPARK_H / 2 - 1); // 越靠近光點抖動越大
            pts.push(`${x.toFixed(1)},${(SPARK_H / 2 + (Math.random() * 2 - 1) * amp).toFixed(1)}`);
        }
        line.setAttribute('points', pts.join(' '));
    });
    rafId = requestAnimationFrame(crackle);
}

function stopMoving() {
    cancelAnimationFrame(rafId);
    bar.classList.remove('moving');
}

// animate：切頁時滑動並拖出發光尾巴；初次定位、縮放、字型載入直接跳位
function place(animate = false) {
    const active = document.querySelector('.menu [data-view].active');
    if (!bar || !active) return;
    const r = active.getBoundingClientRect();
    const m = bar.parentElement.getBoundingClientRect();
    const w = r.width * 0.5; // 底線寬 = 項目寬 50%
    const x = r.left - m.left + (r.width - w) / 2;
    const dist = curX === null ? 0 : x - curX;

    bar.classList.toggle('no-anim', !animate || dist === 0);
    if (animate && dist !== 0) {
        bar.style.setProperty('--trail', TRAIL + 'px');
        bar.classList.toggle('to-left', dist < 0);
        bar.classList.add('moving');
        cancelAnimationFrame(rafId);
        crackle();
    }
    bar.style.width = w + 'px';
    bar.style.transform = `translateX(${x}px)`;
    bar.style.opacity = '1';
    curX = x;
}

export function updateNavIndicator() {
    if (!bar) {
        const menu = document.querySelector('.menu');
        if (!menu) return;
        bar = document.createElement('span');
        bar.className = 'nav-indicator';
        spark = document.createElementNS(SVG_NS, 'svg');
        spark.setAttribute('class', 'nav-spark');
        spark.setAttribute('preserveAspectRatio', 'none');
        for (let i = 0; i < 2; i++) spark.appendChild(document.createElementNS(SVG_NS, 'polyline'));
        bar.appendChild(spark);
        menu.appendChild(bar);
        bar.addEventListener('transitionend', e => {
            if (e.target === bar && e.propertyName === 'transform') stopMoving();
        });
        window.addEventListener('resize', () => place());
        document.fonts?.ready.then(() => place()); // 字型載入後寬度會變
    }
    place(true);
}
