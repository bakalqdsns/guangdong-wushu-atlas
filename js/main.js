/* ============================================================
 * main.js  滚动叙事协调器 + 时间轴绘制
 * ============================================================ */
(function () {
  'use strict';

  const W = window;

  // ---------- 时间轴 ----------
  function drawTimeline() {
    const canvas = document.getElementById('timeline-canvas');
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cssW, cssH);

    const data = W.WUSHU_DATA;
    const detail = data.detail;

    // 按省级批次分组（1..8）
    const groups = {};
    detail.forEach(d => {
      const b = typeof d.prov === 'number' ? d.prov : 0;
      if (!groups[b]) groups[b] = [];
      groups[b].push(d);
    });

    const padL = 60, padR = 90;
    const top = 50, bot = cssH - 70;
    const rowH = (bot - top) / 8;

    // 坐标轴
    ctx.strokeStyle = 'rgba(31,74,61,0.6)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(padL, top - 10);
    ctx.lineTo(padL, bot + 10);
    ctx.moveTo(padL, bot);
    ctx.lineTo(cssW - padR, bot);
    ctx.stroke();

    // 批次标签
    ctx.fillStyle = '#1f4a3d';
    ctx.font = '600 13px "Noto Serif SC", serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let b = 1; b <= 8; b++) {
      const y = top + (b - 1) * rowH + rowH / 2;
      ctx.fillText('省 ' + b + ' 批', padL - 10, y);
      ctx.strokeStyle = 'rgba(31,74,61,0.08)';
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(cssW - padR, y);
      ctx.stroke();
    }

    // 国家级金边竖线（第 1-5 批位置）
    const natY = { 1: top + 0.5 * rowH, 2: top + 1.5 * rowH, 3: top + 2.5 * rowH, 4: top + 3.5 * rowH, 5: top + 4.5 * rowH };
    ctx.strokeStyle = 'rgba(212,168,87,0.55)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    [1, 2, 3, 4, 5].forEach(b => {
      if (natY[b]) {
        ctx.beginPath();
        ctx.moveTo(cssW - padR, natY[b]);
        ctx.lineTo(padL, natY[b]);
        ctx.stroke();
      }
    });
    ctx.setLineDash([]);

    // 国家级标签
    ctx.fillStyle = '#a87a30';
    ctx.textAlign = 'right';
    ctx.font = '12px "Noto Serif SC", serif';
    [1, 2, 3, 4, 5].forEach(b => {
      ctx.fillText('国 ' + b + ' 批', cssW - 4, natY[b]);
    });

    // 项目圆点
    Object.keys(groups).forEach(b => {
      const y = top + (Number(b) - 1) * rowH + rowH / 2;
      const items = groups[b];
      const total = items.length;
      const innerW = cssW - padL - padR - 50;
      items.forEach((it, idx) => {
        const x = padL + 18 + (total > 1 ? (idx + 0.5) / total * innerW : innerW / 2);
        const isNat = typeof it.nat === 'number';
        const r = isNat ? 9 : 7;

        // 连接线
        ctx.strokeStyle = isNat ? 'rgba(212,168,87,0.7)' : 'rgba(184,37,42,0.5)';
        ctx.lineWidth = 1;
        if (isNat) {
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x, natY[it.nat]);
          ctx.stroke();
        }

        // 圆点
        ctx.fillStyle = isNat ? '#d4a857' : '#b8252a';
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        if (isNat) {
          ctx.strokeStyle = '#fff8e6';
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        // 文字
        ctx.fillStyle = '#1f4a3d';
        ctx.font = '11.5px "Noto Serif SC", serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const label = it.style || it.name;
        ctx.fillText(label, x + r + 4, y);
      });
    });

    // 顶部说明
    ctx.fillStyle = '#1f4a3d';
    ctx.font = '13px "Noto Serif SC", serif';
    ctx.textAlign = 'left';
    ctx.fillText('横轴：项目在批次内的相对位置；朱红=省级入选，鎏金=同时入选国家级', padL, 28);
  }

  // ---------- 滚动协调 ----------
  function initNav() {
    const navLinks = document.querySelectorAll('.nav a');
    const stations = document.querySelectorAll('.station');
    navLinks.forEach(a => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const id = a.getAttribute('href').slice(1);
        const target = Array.from(stations).find(s => s.id === id);
        if (target) {
          const idx = Array.from(stations).indexOf(target);
          if (_pagingGoto) _pagingGoto(idx);
          else target.scrollIntoView({ behavior: 'smooth' });
        }
      });
    });

    // IntersectionObserver 切高亮
    const io = new IntersectionObserver((entries) => {
      entries.forEach(en => {
        if (en.isIntersecting) {
          const key = en.target.dataset.station;
          navLinks.forEach(a => {
            a.classList.toggle('is-active', a.dataset.nav === key);
          });
        }
      });
    }, { threshold: 0.4 });
    stations.forEach(s => io.observe(s));
  }

  // ---------- 翻页式段落滚动 ----------
  // 每次滚轮/方向键/导航点击 → 平滑滚动到下一/上一 station，带"落点卡顿"缓动
  let _pagingGoto = null;          // 暴露给 initNav 使用
  function initPagingScroll() {
    const stations = Array.from(document.querySelectorAll('.station'));
    if (!stations.length) return;

    let locked = false;        // 动画进行中
    let animId = null;

    // 缓动函数：先慢中快收尾停顿，模拟"翻页卡顿"
    const ease = t => t < 0.5
      ? 2 * t * t
      : 1 - Math.pow(-2 * t + 2, 2) / 2;

    function animateScrollTo(targetY, duration) {
      const startY = window.scrollY || window.pageYOffset;
      const delta = targetY - startY;
      if (Math.abs(delta) < 2) { locked = false; return; }
      const startT = performance.now();
      function step(now) {
        const t = Math.min((now - startT) / duration, 1);
        const y = startY + delta * ease(t);
        window.scrollTo(0, y);
        if (t < 1) {
          animId = requestAnimationFrame(step);
        } else {
          locked = false;
          animId = null;
        }
      }
      animId = requestAnimationFrame(step);
    }

    function currentIndex() {
      const y = window.scrollY + window.innerHeight * 0.35;
      let idx = 0;
      for (let i = 0; i < stations.length; i++) {
        if (stations[i].offsetTop <= y) idx = i;
      }
      return idx;
    }

    function goto(targetIdx) {
      if (locked) return;
      const idx = Math.max(0, Math.min(stations.length - 1, targetIdx));
      if (idx === currentIndex()) return;
      locked = true;
      // 卡顿段落感：行程越长，时长越长（700~1100ms）
      const dist = Math.abs(stations[idx].offsetTop - window.scrollY);
      const dur = Math.min(1100, Math.max(700, dist * 0.45));
      animateScrollTo(stations[idx].offsetTop, dur);
    }
    _pagingGoto = goto;

    // 滚轮 / 触摸板
    let wheelAccum = 0;
    let wheelTimer = null;
    window.addEventListener('wheel', (e) => {
      // 用户主动滚动意图：累计 deltaY，超阈值才翻页
      if (locked) { e.preventDefault(); return; }
      wheelAccum += e.deltaY;
      clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => { wheelAccum = 0; }, 220);
      if (Math.abs(wheelAccum) < 50) return;
      e.preventDefault();
      const dir = wheelAccum > 0 ? 1 : -1;
      wheelAccum = 0;
      goto(currentIndex() + dir);
    }, { passive: false });

    // 触摸滑动
    let touchStartY = null;
    window.addEventListener('touchstart', (e) => {
      touchStartY = e.touches[0].clientY;
    }, { passive: true });
    window.addEventListener('touchend', (e) => {
      if (touchStartY === null || locked) return;
      const dy = touchStartY - (e.changedTouches[0].clientY);
      if (Math.abs(dy) > 40) goto(currentIndex() + (dy > 0 ? 1 : -1));
      touchStartY = null;
    }, { passive: true });

    // 键盘
    window.addEventListener('keydown', (e) => {
      if (locked) return;
      if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault();
        goto(currentIndex() + 1);
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault();
        goto(currentIndex() - 1);
      } else if (e.key === 'Home') {
        e.preventDefault();
        goto(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        goto(stations.length - 1);
      }
    });
  }

  // hero 区滚动进度 0..1
  function bindHeroScroll() {
    const hero = document.getElementById('hero');
    const onScroll = () => {
      const rect = hero.getBoundingClientRect();
      const total = hero.offsetHeight - window.innerHeight;
      const scrolled = Math.min(Math.max(-rect.top, 0), Math.max(total, 1));
      const p = total > 0 ? scrolled / total : 0;
      if (W.HERO) W.HERO.setScroll(p);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  function init() {
    if (!W.WUSHU_DATA) {
      console.error('[MAIN] WUSHU_DATA 未加载');
      return;
    }

    // 启动各模块
    W.HERO && W.HERO.init();
    W.MAP && W.MAP.init();
    W.CHARTS && W.CHARTS.init();
    W.FIGURES && W.FIGURES.init();

    // 时间轴
    drawTimeline();
    let resizeT;
    window.addEventListener('resize', () => {
      clearTimeout(resizeT);
      resizeT = setTimeout(drawTimeline, 200);
    });

    // 滚动 + 导航
    initPagingScroll();
    initNav();
    bindHeroScroll();

    console.log('[MAIN] 武林绘卷启动 OK · 共', W.WUSHU_DATA.meta.totalWushu, '个武术类非遗项目');
  }

  // 等字体准备好再启动，避免 hero 武字采样失败
  function ready() {
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(init);
    } else {
      window.addEventListener('load', init);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ready);
  } else {
    ready();
  }
})();
