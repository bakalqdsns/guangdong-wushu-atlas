/* ============================================================
 * hero.js  卷一首：粒子"武"字
 * 入口：window.HERO.init()  被 main.js 调用
 * 数据：window.WUSHU_DATA.cities（每个城市经纬度 -> 目标位置）
 * ============================================================ */
(function () {
  'use strict';

  const W = window;
  let p5Instance = null;
  let particles = [];
  let charMask = null;      // {w,h, pixels} 预渲染"武"字得到的二值像素
  let citiesXY = [];        // [{x,y,name,isCore,count}] 粒子炸开后的目标
  let scrollProgress = 0;   // 0 -> 1, hero 段落内由滚动驱动
  let mouseX = 0, mouseY = 0;

  // ---------- 工具 ----------
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

  // 把"武"字写到隐藏 canvas，返回二值像素数组
  function buildCharMask() {
    const off = document.createElement('canvas');
    const size = 360;                       // 武字渲染分辨率
    off.width = size; off.height = size;
    const ctx = off.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 320px "Noto Serif SC", "STSong", "SimSun", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('武', size / 2, size / 2 + 8);
    const img = ctx.getImageData(0, 0, size, size);
    return { w: size, h: size, data: img.data };
  }

  // 从字符像素中按密度采样若干目标点
  function sampleCharTargets(mask, n) {
    const pts = [];
    const { w, h, data } = mask;
    while (pts.length < n) {
      const x = Math.floor(Math.random() * w);
      const y = Math.floor(Math.random() * h);
      const idx = (y * w + x) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      // 亮度 > 200 视为字形内像素
      if ((r + g + b) / 3 > 200) {
        pts.push({ tx: x, ty: y });
      }
    }
    return pts;
  }

  // 把 WUSHU_DATA.cities 投影到屏幕坐标
  function buildCityTargets(sketch) {
    const list = W.WUSHU_DATA.cities;
    const minLon = 109, maxLon = 117.5;
    const minLat = 20.2, maxLat = 25.5;
    const pad = 80;
    const w = sketch.width, h = sketch.height;
    return list.map(c => {
      const x = pad + ((c.lon - minLon) / (maxLon - minLon)) * (w - 2 * pad);
      // 纬度越大 -> y 越小
      const y = pad + ((maxLat - c.lat) / (maxLat - minLat)) * (h - 2 * pad);
      return { x, y, name: c.name, isCore: c.isCore, count: c.count };
    });
  }

  // ---------- sketch ----------
  const sketch = (s) => {
    s.setup = function () {
      const host = document.getElementById('hero-canvas');
      const c = s.createCanvas(host.clientWidth, host.clientHeight);
      c.parent(host);
      s.pixelDensity(Math.min(window.devicePixelRatio || 1, 2));
      s.noStroke();

      // 字体准备好后再采样
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(init);
      } else {
        setTimeout(init, 300);
      }
    };

    function init() {
      charMask = buildCharMask();
      // 粒子数 = 字形采样 + 地图扩散点
      const charTargets = sampleCharTargets(charMask, 1400);
      citiesXY = buildCityTargets(s);
      const allTargets = charTargets.concat(
        citiesXY.map(c => ({ tx: c.x, ty: c.y }))
      );
      particles = charTargets.map((t, i) => {
        // 粒子初始位置随机散布在屏幕外圈
        const angle = Math.random() * Math.PI * 2;
        const r = Math.max(s.width, s.height) * (0.55 + Math.random() * 0.4);
        const cx = s.width / 2, cy = s.height / 2;
        const px = cx + Math.cos(angle) * r;
        const py = cy + Math.sin(angle) * r;
        return {
          tx: t.tx * (s.height / charMask.h),         // 字形内目标 = 屏幕坐标
          ty: t.ty * (s.height / charMask.h),
          cx: px, cy: py,
          x: px, y: py,
          vx: 0, vy: 0,
          // 前 1400 个为字符粒子，后 21 个为城市粒子
          kind: i < 1400 ? 'char' : 'city',
          city: i < 1400 ? null : citiesXY[i - 1400],
          r: 1.4 + Math.random() * 1.6,
          phase: Math.random() * Math.PI * 2,
        };
      });
    }

    s.windowResized = function () {
      const host = document.getElementById('hero-canvas');
      s.resizeCanvas(host.clientWidth, host.clientHeight);
      if (charMask) {
        citiesXY = buildCityTargets(s);
        // 重算 city 粒子目标
        particles.forEach((p, i) => {
          if (p.kind === 'city' && p.city) {
            const city = citiesXY.find(c => c.name === p.city.name);
            if (city) {
              p.tx = city.x;
              p.ty = city.y;
              p.city = city;
            }
          }
        });
      }
    };

    s.mouseMoved = function () { mouseX = s.mouseX; mouseY = s.mouseY; };

    s.draw = function () {
      // 墨绿渐变背景
      s.background(19, 53, 43);

      // 装饰：鎏金细线圆环
      s.push();
      s.noFill();
      s.stroke(212, 168, 87, 60);
      s.strokeWeight(1);
      const cx = s.width / 2, cy = s.height / 2;
      for (let i = 0; i < 5; i++) {
        const r = 80 + i * 60 + Math.sin(s.frameCount * 0.01 + i) * 4;
        s.ellipse(cx, cy, r);
      }
      s.pop();

      if (!charMask || particles.length === 0) {
        // 还在等字体：显示一行金文
        s.push();
        s.fill(212, 168, 87, 220);
        s.noStroke();
        s.textAlign(s.CENTER, s.CENTER);
        s.textSize(16);
        s.text('载入卷轴…', cx, cy);
        s.pop();
        return;
      }

      // 滚动控制：0..0.35 维持武字，0.35..0.9 散开重组，0.9..1 完全成地图
      const tRaw = scrollProgress;
      const tForm = Math.min(1, Math.max(0, (tRaw - 0.25) / 0.55));   // 字符→地图
      const tEase = easeInOut(tForm);

      // 更新 + 绘制每个粒子
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        // 目标点：tEase=0 -> 武字目标；tEase=1 -> 城市点；中间线性插值
        let tx = lerp(p.tx, (p.city ? p.city.x : p.tx), tEase);
        let ty = lerp(p.ty, (p.city ? p.city.y : p.ty), tEase);

        // 字符阶段的"呼吸"扰动 + 鼠标引力
        if (tEase < 0.9) {
          const breath = Math.sin(s.frameCount * 0.04 + p.phase) * 1.6 * (1 - tEase);
          tx += breath;
          ty += breath * 0.5;
          // 鼠标排斥（仅在字符阶段）
          if (Math.abs(tRaw - 0.0) < 0.25) {
            const dx = tx - mouseX, dy = ty - mouseY;
            const d2 = dx * dx + dy * dy + 1;
            const force = 6000 / d2;
            tx += (dx / Math.sqrt(d2)) * force;
            ty += (dy / Math.sqrt(d2)) * force;
          }
        }

        // 弹簧趋近
        const dx = tx - p.x, dy = ty - p.y;
        const k = 0.06 + tEase * 0.04;
        const damp = 0.82;
        p.vx = p.vx * damp + dx * k;
        p.vy = p.vy * damp + dy * k;
        p.x += p.vx;
        p.y += p.vy;

        // 颜色：字符阶段朱红 -> 地图阶段按 isCore 区分
        let col;
        if (p.kind === 'city') {
          if (tEase > 0.6) {
            col = p.city && p.city.isCore
              ? [184, 37, 42, 230]    // 朱红
              : [212, 168, 87, 200];  // 鎏金
          } else {
            col = [184, 37, 42, 220];
          }
          // 城市粒子稍大
          const radius = (p.city && p.city.isCore ? 4.5 : 3.2) + (p.city ? Math.sqrt(p.city.count) : 2);
          s.fill(col[0], col[1], col[2], col[3]);
          s.circle(p.x, p.y, radius * 2);
          // 鎏金描边
          if (tEase > 0.85 && p.city && p.city.count > 0) {
            s.noFill();
            s.stroke(212, 168, 87, 120);
            s.strokeWeight(1);
            s.circle(p.x, p.y, radius * 2 + 6);
            s.noStroke();
          }
        } else {
          // 字符粒子：朱红 + 鎏金微光
          const flicker = (Math.sin(s.frameCount * 0.05 + p.phase) + 1) * 0.5;
          s.fill(184 + flicker * 30, 37 + flicker * 20, 42, 200);
          s.circle(p.x, p.y, p.r * 2);
        }
      }
    };
  };

  // ---------- 公开 API ----------
  W.HERO = {
    init() {
      if (!W.WUSHU_DATA) {
        console.error('[HERO] WUSHU_DATA 未加载');
        return;
      }
      p5Instance = new p5(sketch);
    },
    // 由 main.js 每帧调用：0=顶部，1=已滚出 hero 区
    setScroll(p) {
      scrollProgress = Math.max(0, Math.min(1, p));
    },
  };
})();
