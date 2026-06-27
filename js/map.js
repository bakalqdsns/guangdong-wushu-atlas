/* ============================================================
 * map.js  卷二：广东 21 地市气泡地图（真实 GeoJSON 边界）
 * 入口：window.MAP.init()  被 main.js 调用
 * 数据：window.WUSHU_DATA.cities / byCity + data/guangdong.json
 * 接口契约：canvas#map-canvas；DOM #city-panel/#city-panel-name/
 *          #city-panel-count/#city-panel-list；关闭按钮 .city-panel-close
 * ============================================================ */
(function () {
  'use strict';

  const W = window;

  // ---------- 状态 ----------
  let p5Instance = null;
  let hoveredCity = null;       // 当前 hover 的城市
  let panelCity = null;         // 当前展开 panel 的城市（锁定）
  let gd = null;                // GeoJSON FeatureCollection
  let cityInfo = [];            // 合并后的地市信息
  let transform = null;         // {scale, offsetX, offsetY}
  let zoom = 1, panX = 0, panY = 0;
  let bubblePhase = [];         // 每个城市的呼吸相位
  let currentR = [];            // 每个城市的当前动画半径（lerp 平滑）
  let paperTex = null;          // 预渲染的纸张/山峦纹理
  let lastMouseDownX = 0;
  let lastMouseDownY = 0;

  const intro = {
    fired: false,                // 是否已触发过引导
    active: false,               // 当前是否在引导中
    t0: 0,                       // 引导开始时间（Date.now）
    steps: ['广州', '佛山', '深圳'],
    totalMs: 4000
  };

  // 珠三角气泡/标签避让（单位 px），基于经验值；其余城市偏移 (0,0)
  const BUBBLE_OFFSET = {
    '广州': [10, -10], '佛山': [-12, 8], '东莞': [12, 12],
    '深圳': [15, 5],   '中山': [-10, 15], '珠海': [0, 18], '江门': [-15, -8]
  };
  const LABEL_OFFSET = {
    '广州': [22, 18], '佛山': [-22, 16], '东莞': [20, 20],
    '深圳': [22, 14], '中山': [-18, 22], '珠海': [0, 26], '江门': [-22, -14]
  };

  // 珠江示意线：[lon,lat] 控制点 + 像素宽度（手写近似，重点体现"穿过三角洲"）
  const RIVERS = [
    { pts: [[111.4, 23.6], [112.0, 23.2], [112.5, 23.0], [113.0, 22.9], [113.2, 22.7]], w: 5 },
    { pts: [[112.8, 24.5], [112.9, 24.0], [113.0, 23.5], [113.1, 23.0], [113.2, 22.7]], w: 4 },
    { pts: [[114.8, 23.7], [114.5, 23.5], [114.2, 23.2], [113.9, 23.0], [113.6, 22.8], [113.5, 22.5]], w: 4 },
    { pts: [[113.4, 22.5], [113.6, 22.3], [113.9, 22.1], [114.2, 22.0]], w: 5 }
  ];

  // ---------- GeoJSON 加载 + 数据合并 ----------
  // 三级回退：① fetch(json) → ② 已注入的 window.GUANGDONG_GEOJSON → ③ 动态注入 <script src="data/guangdong.js">
  // 主要解决 file:// 协议下 fetch() 被 CORS 拦截的问题。
  function loadGeoData() {
    // file:// 协议下 fetch() 必被 CORS 拦；直接走 script 注入
    if (location.protocol === 'file:') return loadGeoFromScript();
    // ① fetch 优先
    if (typeof fetch === 'function') {
      return fetch('data/guangdong.json')
        .then(r => {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        })
        .then(j => { gd = j; buildCityInfo(); })
        .catch(() => loadGeoFromScript());
    }
    return loadGeoFromScript();
  }

  function loadGeoFromScript() {
    // ② 已通过 <script> 预加载
    if (W.GUANGDONG_GEOJSON) {
      gd = W.GUANGDONG_GEOJSON;
      buildCityInfo();
      return Promise.resolve();
    }
    // ③ 动态注入 <script src="data/guangdong.js">
    return new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = 'data/guangdong.js';
      s.onload = () => {
        if (W.GUANGDONG_GEOJSON) {
          gd = W.GUANGDONG_GEOJSON;
          buildCityInfo();
          resolve();
        } else {
          console.error('[MAP] data/guangdong.js 加载后未找到 window.GUANGDONG_GEOJSON');
          resolve();
        }
      };
      s.onerror = () => {
        console.error('[MAP] data/guangdong.js 注入失败');
        resolve();
      };
      document.head.appendChild(s);
    });
  }

  function buildCityInfo() {
    // GeoJSON properties.name 是 "广州市"，data.js city.name 是 "广州"，需要桥接
    const cities = (W.WUSHU_DATA && W.WUSHU_DATA.cities) || [];
    const byName = {};
    cities.forEach(c => { byName[c.name + '市'] = c; });

    cityInfo = gd.features.map(f => {
      const props = f.properties || {};
      const city = byName[props.name];
      return {
        name: city ? city.name : String(props.name || '').replace(/市$/, ''),
        isCore: city ? !!city.isCore : false,
        count: city ? city.count : 0,
        center: props.center,         // [lon, lat]
        feature: f,
        adcode: props.adcode
      };
    });

    bubblePhase = cityInfo.map((_, i) => (i * 1.37) % (Math.PI * 2));
    currentR = cityInfo.map(() => 0);
  }

  // ---------- 坐标变换 ----------
  function computeTransform(s) {
    if (!gd) return;
    let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
    const csAll = gd.features;
    for (let i = 0; i < csAll.length; i++) {
      const polys = csAll[i].geometry.coordinates;
      for (let p = 0; p < polys.length; p++) {
        const rings = polys[p];
        for (let r = 0; r < rings.length; r++) {
          const ring = rings[r];
          for (let k = 0; k < ring.length; k++) {
            const lon = ring[k][0], lat = ring[k][1];
            if (lon < minLon) minLon = lon;
            if (lon > maxLon) maxLon = lon;
            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
          }
        }
      }
    }
    const pad = Math.min(s.width, s.height) * 0.08;
    const dataW = maxLon - minLon;
    const dataH = maxLat - minLat;
    const availW = Math.max(1, s.width - 2 * pad);
    const availH = Math.max(1, s.height - 2 * pad);
    const scale = Math.min(availW / dataW, availH / dataH);
    const offsetX = pad + (availW - dataW * scale) / 2 - minLon * scale;
    const offsetY = pad + (availH - dataH * scale) / 2 + maxLat * scale;
    transform = { scale, offsetX, offsetY };
  }

  function px(lon) {
    return lon * transform.scale * zoom + transform.offsetX + panX;
  }
  function py(lat) {
    return -lat * transform.scale * zoom + transform.offsetY + panY;
  }

  // ---------- 预渲染纸张/山峦纹理（perlin noise 简易实现） ----------
  function buildPaperTexture(s) {
    if (paperTex) { paperTex.remove(); paperTex = null; }
    paperTex = s.createGraphics(s.width, s.height);
    const g = paperTex;
    g.noStroke();
    for (let y = 0; y < s.height; y += 4) {
      for (let x = 0; x < s.width; x += 4) {
        const n = s.noise(x * 0.012, y * 0.012);
        g.fill(212, 168, 87, n * 22);                 // 暖灰金
        g.rect(x, y, 4, 4);
      }
    }
    // 一层轻微的青色横纹，象征远山
    for (let y = 0; y < s.height; y += 4) {
      for (let x = 0; x < s.width; x += 4) {
        const n = s.noise(x * 0.004 + 100, y * 0.018);
        if (n > 0.78) {
          g.fill(120, 140, 130, (n - 0.78) * 60);
          g.rect(x, y, 4, 4);
        }
      }
    }
  }

  // ---------- 绘制：单 feature 的所有 ring ----------
  function traceFeature(s, feature) {
    const polys = feature.geometry.coordinates;
    for (let p = 0; p < polys.length; p++) {
      const rings = polys[p];
      for (let r = 0; r < rings.length; r++) {
        const ring = rings[r];
        s.beginShape();
        for (let k = 0; k < ring.length; k++) {
          s.vertex(px(ring[k][0]), py(ring[k][1]));
        }
        s.endShape(s.CLOSE);
      }
    }
  }

  // ---------- 省份多边形：填充 + 墨绿描边 + 浅蓝海岸外描 ----------
  function drawProvinces(s) {
    // 第一遍：浅米色错落透明度填充（宣纸感）
    s.push();
    s.noStroke();
    cityInfo.forEach((c, idx) => {
      const a = 22 + Math.abs(Math.sin(bubblePhase[idx])) * 18;  // 22..40
      s.fill(244, 236, 216, a);
      traceFeature(s, c.feature);
    });
    s.pop();

    // 第二遍：墨绿细描边
    s.push();
    s.noFill();
    s.stroke(31, 74, 61, 200);
    s.strokeWeight(1);
    cityInfo.forEach(c => traceFeature(s, c.feature));
    s.pop();

    // 第三遍：浅蓝外描（半径 +1 → strokeWeight +1），代表海岸线
    s.push();
    s.noFill();
    s.stroke(140, 170, 200, 180);
    s.strokeWeight(2);
    cityInfo.forEach(c => traceFeature(s, c.feature));
    s.pop();
  }

  // ---------- 装饰：北回归线 + 珠江 ----------
  function drawDecorations(s) {
    // 北回归线 lat=23.5，虚线横贯
    s.push();
    const ctx = s.drawingContext;
    ctx.setLineDash([6, 6]);
    s.stroke(212, 168, 87, 180);
    s.strokeWeight(1);
    s.line(px(109.5), py(23.5), px(118.0), py(23.5));
    ctx.setLineDash([]);
    s.pop();
    // 标注
    s.push();
    s.noStroke();
    s.fill(168, 122, 48, 220);
    s.textFont('serif');
    s.textSize(11);
    s.textAlign(s.LEFT, s.BOTTOM);
    s.text('北回归线 23.5°N', px(109.6), py(23.5) - 3);
    s.pop();

    // 珠江（4 条示意线，浅蓝半透明）
    s.push();
    s.noFill();
    s.stroke(120, 160, 200, 150);
    for (let i = 0; i < RIVERS.length; i++) {
      const r = RIVERS[i];
      s.strokeWeight(r.w);
      s.beginShape();
      for (let k = 0; k < r.pts.length; k++) {
        s.curveVertex(px(r.pts[k][0]), py(r.pts[k][1]));
      }
      s.endShape();
    }
    s.pop();
  }

  // ---------- 颜色：count → 浅米黄 → 朱红 渐变 ----------
  function bubbleRgb(s, count) {
    const t = Math.min(count, 5) / 5;
    const c = s.lerpColor(s.color(244, 228, 170), s.color(184, 37, 42), t);
    return [s.red(c), s.green(c), s.blue(c)];
  }

  // ---------- 气泡 + 标签 ----------
  function drawBubbles(s) {
    const order = cityInfo.map((_, i) => i)
      .sort((a, b) => cityInfo[a].count - cityInfo[b].count); // 小→大，避免遮挡
    const lockName = panelCity ? panelCity.name : null;

    for (let n = 0; n < order.length; n++) {
      const idx = order[n];
      const c = cityInfo[idx];
      const bo = BUBBLE_OFFSET[c.name] || [0, 0];
      const lo = LABEL_OFFSET[c.name] || [0, 0];
      const cx = px(c.center[0]) + bo[0];
      const cy = py(c.center[1]) + bo[1];

      const baseR = c.count > 0 ? Math.max(8, 7 + Math.sqrt(c.count) * 6) : 5;
      const breath = Math.sin(s.frameCount * 0.04 + bubblePhase[idx]) * 1.5;
      let target = baseR + breath;

      // 首次引导脉冲（广州 → 佛山 → 深圳）
      if (intro.active) {
        const elapsed = Date.now() - intro.t0;
        const stepDur = intro.totalMs / intro.steps.length;
        const stepIdx = intro.steps.indexOf(c.name);
        if (stepIdx >= 0) {
          const dt = elapsed - stepIdx * stepDur;
          if (dt > 0 && dt < stepDur) {
            target += Math.sin((dt / stepDur) * Math.PI * 2) * 9;
          }
        }
      }

      // 平滑过渡（lerp）
      if (currentR[idx] === 0) currentR[idx] = target;
      else currentR[idx] = s.lerp(currentR[idx], target, 0.18);

      const isOpen = lockName === c.name;
      const isHover = !panelCity && hoveredCity && hoveredCity.name === c.name;
      const r = currentR[idx];

      // 光晕（仅 count > 0）
      if (c.count > 0) {
        s.push();
        s.noStroke();
        for (let i = 4; i > 0; i--) {
          s.fill(184, 37, 42, 8);
          s.circle(cx, cy, (r + i * 4) * 2);
        }
        s.pop();
      }

      // 气泡主体
      s.push();
      if (c.count > 0) {
        const rgb = bubbleRgb(s, c.count);
        s.fill(rgb[0], rgb[1], rgb[2], (isHover || isOpen) ? 255 : 220);
        s.stroke(255, 248, 230, (isHover || isOpen) ? 240 : 180);
        s.strokeWeight((isHover || isOpen) ? 2.6 : 1.4);
        const drawR = (isHover || isOpen) ? r * 1.18 : r;
        s.circle(cx, cy, drawR * 2);

        s.noStroke();
        s.fill(251, 246, 233);
        s.textAlign(s.CENTER, s.CENTER);
        s.textSize(c.count >= 10 ? 13 : 11);
        s.textStyle(s.BOLD);
        s.text(c.count, cx, cy);
      } else {
        s.fill(180, 170, 140, 180);
        s.stroke(120, 110, 90, 140);
        s.strokeWeight(1);
        s.circle(cx, cy, r * 2);
      }
      s.pop();

      // 城市标签（米色圆角矩形 + 墨绿描边）
      s.push();
      s.textFont('serif');
      const labelText = c.name + (c.isCore ? ' ★' : '');
      s.textSize(12);
      s.textStyle(s.NORMAL);
      const tw = s.textWidth(labelText);
      const lx = cx + lo[0];
      const ly = cy + lo[1];
      s.rectMode(s.CENTER);
      s.fill(251, 246, 233, (isHover || isOpen) ? 235 : 195);
      s.stroke(31, 74, 61, (isHover || isOpen) ? 220 : 130);
      s.strokeWeight(0.8);
      s.rect(lx, ly, tw + 12, 18, 5);
      s.noStroke();
      s.fill(31, 74, 61);
      s.textAlign(s.CENTER, s.CENTER);
      s.text(labelText, lx, ly);
      s.pop();
    }
  }

  // ---------- hover 检测（distSq 避免 sqrt） ----------
  function detectHover(s) {
    let found = null;
    let minSq = Infinity;
    for (let i = 0; i < cityInfo.length; i++) {
      const c = cityInfo[i];
      const bo = BUBBLE_OFFSET[c.name] || [0, 0];
      const cx = px(c.center[0]) + bo[0];
      const cy = py(c.center[1]) + bo[1];
      const dx = s.mouseX - cx;
      const dy = s.mouseY - cy;
      const baseR = c.count > 0 ? Math.max(8, 7 + Math.sqrt(c.count) * 6) : 5;
      const hitR = baseR + 3;
      const dsq = dx * dx + dy * dy;
      if (dsq <= hitR * hitR && dsq < minSq) {
        minSq = dsq;
        found = c;
      }
    }
    hoveredCity = found;
    s.cursor(found ? s.HAND : s.ARROW);
  }

  // ---------- tooltip（带边界约束） ----------
  function drawTooltip(s) {
    if (!hoveredCity || panelCity) return;
    const c = hoveredCity;
    const bo = BUBBLE_OFFSET[c.name] || [0, 0];
    const cx = px(c.center[0]) + bo[0];
    const cy = py(c.center[1]) + bo[1];
    const label = c.name + ' · ' + c.count + ' 个拳种' + (c.isCore ? ' · 核心区' : '');
    s.push();
    s.textFont('serif');
    s.textSize(13);
    s.textStyle(s.NORMAL);
    s.textAlign(s.LEFT, s.BOTTOM);
    const tw = s.textWidth(label);
    const th = 22;
    let tx = s.mouseX + 14;
    let ty = s.mouseY - 14;
    tx = s.constrain(tx, 6, s.width - tw - 18);
    ty = s.constrain(ty, th + 4, s.height - 4);
    s.fill(31, 53, 43, 235);
    s.noStroke();
    s.rect(tx - 6, ty - th, tw + 14, th + 4, 4);
    s.fill(251, 246, 233);
    s.text(label, tx + 2, ty - 4);
    s.pop();
  }

  // ---------- 左上角小字 ----------
  function drawCornerMeta(s) {
    s.push();
    s.fill(31, 74, 61, 160);
    s.noStroke();
    s.textFont('serif');
    s.textAlign(s.LEFT, s.TOP);
    s.textSize(12);
    s.text('广东省 · 21 地市', 14, 12);
    s.text('Guangdong', 14, 26);
    s.pop();

    // 右下角操作提示（不抢主要视觉）
    s.push();
    s.fill(31, 74, 61, 130);
    s.noStroke();
    s.textFont('serif');
    s.textAlign(s.RIGHT, s.BOTTOM);
    s.textSize(11);
    s.text('拖拽 平移 · 点击 展开', s.width - 14, s.height - 12);
    s.pop();
  }

  // ---------- p5 sketch ----------
  const sketch = (s) => {
    s.setup = function () {
      const host = document.getElementById('map-canvas-wrap');
      // 移除 HTML 中占位的同名 canvas（避免 ID 重复 / 占位元素卡住父容器布局）
      const stub = document.getElementById('map-canvas');
      if (stub) stub.remove();
      let w = host.clientWidth || 1200;
      let h = host.clientHeight || Math.round(w * 11 / 16);
      const c = s.createCanvas(w, h);
      c.id('map-canvas');
      c.parent(host);
      s.pixelDensity(Math.min(window.devicePixelRatio || 1, 2));
      s.textFont('"Source Han Sans SC","Noto Sans SC","Microsoft YaHei",sans-serif');
      computeTransform(s);
      if (gd) buildPaperTexture(s);

      // 首次可见 / resize 时同步到真实尺寸
      const sync = () => {
        const nw = host.clientWidth;
        const nh = host.clientHeight;
        if (nw > 100 && nh > 100 && (Math.abs(nw - s.width) > 4 || Math.abs(nh - s.height) > 4)) {
          s.resizeCanvas(nw, nh);
          computeTransform(s);
          if (gd) buildPaperTexture(s);
        }
      };
      if ('IntersectionObserver' in window) {
        const io = new IntersectionObserver((entries) => {
          if (entries[0].isIntersecting) { sync(); io.disconnect(); }
        }, { threshold: 0.1 });
        io.observe(host);
      }
      window.addEventListener('resize', sync);
    };

    s.windowResized = function () {
      const host = document.getElementById('map-canvas-wrap');
      s.resizeCanvas(host.clientWidth, host.clientHeight);
      computeTransform(s);
      if (gd) buildPaperTexture(s);
    };

    // 不再绑定 mouseWheel：滚轮完全交给浏览器（页面滚动）。
    // 地图缩放已禁用。如需重新启用可在此实现 Shift/Ctrl + 滚轮 等显式触发。

    s.mousePressed = function () {
      lastMouseDownX = s.mouseX;
      lastMouseDownY = s.mouseY;
    };

    s.mouseClicked = function () {
      // 拖拽 5px 以上不视为 click
      const dx = s.mouseX - lastMouseDownX;
      const dy = s.mouseY - lastMouseDownY;
      if (dx * dx + dy * dy > 25) return;

      if (hoveredCity) {
        if (!panelCity || panelCity.name !== hoveredCity.name) {
          panelCity = hoveredCity;
          W.MAP.openPanel(hoveredCity);
        }
      } else if (panelCity) {
        // 点空白处关闭
        panelCity = null;
        W.MAP.closePanel();
      }
    };

    s.mouseDragged = function () {
      panX += s.mouseX - s.pmouseX;
      panY += s.mouseY - s.pmouseY;
    };

    s.draw = function () {
      s.background(251, 246, 233);

      // 数据未到位
      if (!gd || !transform) {
        s.push();
        s.fill(31, 74, 61);
        s.noStroke();
        s.textAlign(s.CENTER, s.CENTER);
        s.textSize(14);
        s.text('载入地理数据…', s.width / 2, s.height / 2);
        s.pop();
        return;
      }

      // 引导超时自动关闭
      if (intro.active && (Date.now() - intro.t0) > intro.totalMs) {
        intro.active = false;
      }

      // 1. 纸张 / 山峦纹理（预渲染）
      if (paperTex) s.image(paperTex, 0, 0);

      // 2. 装饰（北回归线 + 珠江）
      drawDecorations(s);

      // 3. 省份多边形（fill + 墨绿描边 + 浅蓝海岸）
      drawProvinces(s);

      // 4. 气泡 + 标签
      hoveredCity = null;
      drawBubbles(s);

      // 5. hover 检测（draw 中只设 hoveredCity + cursor，不判点击）
      detectHover(s);

      // 6. tooltip（panel 打开时不显示）
      drawTooltip(s);

      // 7. 左上角小字
      drawCornerMeta(s);
    };
  };

  // ---------- 公开 API ----------
  W.MAP = {
    init() {
      if (!W.WUSHU_DATA) {
        console.error('[MAP] WUSHU_DATA 未加载');
        return;
      }
      // 先尝试同步计算（如果 fetch 已在之前完成）；否则异步等数据后再建 texture
      loadGeoData().then(() => {
        if (p5Instance) {
          computeTransform(p5Instance);
          buildPaperTexture(p5Instance);
        }
      });
      p5Instance = new p5(sketch);

      // 关闭按钮
      const closeBtn = document.querySelector('.city-panel-close');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => {
          panelCity = null;
          W.MAP.closePanel();
        });
      }

      // 首次进入引导：滚动到 #map 第一次可见时启动
      const mapSec = document.getElementById('map');
      if (mapSec && 'IntersectionObserver' in window) {
        const io = new IntersectionObserver((entries) => {
          entries.forEach(en => {
            if (en.isIntersecting && !intro.fired) {
              intro.fired = true;
              intro.active = true;
              intro.t0 = Date.now();
              io.disconnect();
            }
          });
        }, { threshold: 0.3 });
        io.observe(mapSec);
      }
    },

    openPanel(city) {
      const panel = document.getElementById('city-panel');
      const list = document.getElementById('city-panel-list');
      const name = document.getElementById('city-panel-name');
      const count = document.getElementById('city-panel-count');
      const items = (W.WUSHU_DATA.byCity && W.WUSHU_DATA.byCity[city.name]) || [];

      name.textContent = city.name + (city.isCore ? ' · 核心区' : '');
      count.textContent = '共 ' + items.length + ' 个武术类非遗项目';
      list.innerHTML = '';

      if (items.length === 0) {
        const li = document.createElement('li');
        li.innerHTML = '<span class="nm">该地市暂无武术类项目入选</span>';
        list.appendChild(li);
      } else {
        items.forEach(it => {
          const li = document.createElement('li');
          const natTag = (it.nat && typeof it.nat === 'number')
            ? '<span class="badge">国家 ' + it.nat + ' 批</span>'
            : '<span class="badge">省 ' + it.prov + ' 批</span>';
          li.innerHTML = '<span class="nm">' + it.name + '</span>' + natTag;
          list.appendChild(li);
        });
      }
      panel.classList.add('is-open');
      panel.setAttribute('aria-hidden', 'false');
    },

    closePanel() {
      const panel = document.getElementById('city-panel');
      if (!panel) return;
      panel.classList.remove('is-open');
      panel.setAttribute('aria-hidden', 'true');
    }
  };
})();