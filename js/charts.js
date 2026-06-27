/* ============================================================
 * charts.js  卷三：批次对比 + 核心区对比
 * 入口：window.CHARTS.init()  被 main.js 调用
 * 依赖：Chart.js 4.x
 * ============================================================ */
(function () {
  'use strict';

  const W = window;
  let chartBatch = null;
  let chartCore = null;

  const COLORS = {
    prov: 'rgba(184, 37, 42, 0.85)',     // 朱红
    provBorder: '#b8252a',
    nat:  'rgba(212, 168, 87, 0.9)',     // 鎏金
    natBorder: '#d4a857',
    core: 'rgba(184, 37, 42, 0.9)',
    other: 'rgba(31, 74, 61, 0.55)',
    ink: '#1f4a3d',
    inkSoft: '#4a4a4a',
  };

  function gridStyle() {
    return {
      color: 'rgba(31, 74, 61, 0.08)',
      drawBorder: false,
    };
  }

  function tickStyle(size) {
    return {
      color: COLORS.ink,
      font: { family: 'Noto Serif SC, serif', size: size || 12 },
    };
  }

  function buildBatchChart() {
    const ctx = document.getElementById('chart-batch');
    if (!ctx) return;

    const prov = W.WUSHU_DATA.byBatch.prov;
    const nat  = W.WUSHU_DATA.byBatch.nat;

    const labels = prov.map(p => '第 ' + p.batch + ' 批');
    const provData = prov.map(p => p.count);
    const natData = nat.map(n => n.count);

    chartBatch = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: '省级',
            data: provData,
            backgroundColor: COLORS.prov,
            borderColor: COLORS.provBorder,
            borderWidth: 1,
            borderRadius: 4,
          },
          {
            label: '国家级',
            data: natData,
            backgroundColor: COLORS.nat,
            borderColor: COLORS.natBorder,
            borderWidth: 1,
            borderRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 1200, easing: 'easeOutQuart' },
        plugins: {
          legend: {
            position: 'top',
            labels: { color: COLORS.ink, font: { family: 'Noto Serif SC, serif', size: 13 } },
          },
          tooltip: {
            backgroundColor: 'rgba(31,53,43,0.95)',
            titleColor: '#f4ecd8',
            bodyColor: '#f4ecd8',
            borderColor: '#d4a857',
            borderWidth: 1,
            padding: 10,
            callbacks: {
              label: (c) => `${c.dataset.label} · ${c.parsed.y} 项`,
            },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: tickStyle() },
          y: { beginAtZero: true, grid: gridStyle(), ticks: { ...tickStyle(), stepSize: 2 } },
        },
      },
    });
  }

  function buildCoreChart() {
    const ctx = document.getElementById('chart-core');
    if (!ctx) return;

    const cities = W.WUSHU_DATA.cities || [];
    const coreCities = ['广州', '佛山', '江门', '揭阳'];
    const coreSum = cities.filter(c => coreCities.includes(c.name)).reduce((s, c) => s + c.count, 0);
    const otherSum = cities.filter(c => !coreCities.includes(c.name)).reduce((s, c) => s + c.count, 0);

    chartCore = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['四大核心区\n（广州·佛山·江门·揭阳）', '其他地区'],
        datasets: [{
          label: '拳种数',
          data: [coreSum, otherSum],
          backgroundColor: [COLORS.core, COLORS.other],
          borderColor: [COLORS.core.replace('0.9', '1'), '#1f4a3d'],
          borderWidth: 1,
          borderRadius: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 1200, easing: 'easeOutQuart' },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(31,53,43,0.95)',
            titleColor: '#f4ecd8',
            bodyColor: '#f4ecd8',
            borderColor: '#d4a857',
            borderWidth: 1,
            padding: 10,
            callbacks: {
              label: (c) => `${c.label}  ·  ${c.parsed.y} 项拳种`,
            },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: tickStyle(12) },
          y: { beginAtZero: true, grid: gridStyle(), ticks: { ...tickStyle(), stepSize: 2 } },
        },
      },
    });
  }

  function buildJointInsight() {
    const el = document.getElementById('insight-joint');
    if (!el) return;

    // 真实数据中莫家拳在东莞(prov=3) 和 惠州(prov=6) 各有 1 条，
    // 同属第 5 批国家级。蔡李佛(prov=3) 仅东莞一条。
    const detail = W.WUSHU_DATA.detail;
    const moJia = detail.filter(d => /莫家/.test(d.style));

    let html = '<strong>莫家拳</strong>：分属 <em>东莞（省 3 批）</em> 与 <em>惠州（省 6 批）</em>，';
    html += '共同入选 <strong>第 5 批国家级名录</strong>，';
    html += '是岭南拳种"跨地市流传、联合保护"的典型。';

    if (moJia.length >= 2) {
      html += '<br/><span style="color:#888;font-size:13px;">';
      html += moJia.map(m => `${m.cities.join('·')}：${m.name}`).join('  |  ');
      html += '</span>';
    }

    el.innerHTML = html;
  }

  W.CHARTS = {
    init() {
      if (!W.WUSHU_DATA) { console.error('[CHARTS] WUSHU_DATA 未加载'); return; }
      buildBatchChart();
      buildCoreChart();
      buildJointInsight();
    },
  };
})();
