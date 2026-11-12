/* 코인병 — 라스트찬스에 끼워 넣을 부품 하나 (2026-11-12)
 *
 * 쓰는 법:
 *   const jar = CoinJar.create(document.getElementById('jar'));
 *   jar.render({coins: 7, jar: 20, level: 1, base: 1000});          // 그대로 그리기
 *   await jar.play(prev, next, {emptied: false});                    // prev → next 애니메이션
 *
 * state = coins.json의 coins · jar · level · base (score_daily.py --write가 만든다)
 * 앱은 보여 주기만 한다 — 판정하지 않는다. 지난번 본 상태(localStorage)와 새 coins.json을 play()에 넘기면 된다.
 * 다른 파일·라이브러리 없음. 스타일은 처음 create 때 <style id="coinjar-css">로 한 번 넣는다.
 */
(function (global) {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var STEP = 20, REWARD = 200;
  var CSS = [
    '.cj{--cj-ink:#0A0A0A;--cj-ink3:#8A8A8A;--cj-line:#E5E5E5;--cj-gold:#E2B33C;--cj-gold-d:#B8860B;--cj-gold-l:#F6D77A;--cj-danger:#D64545;',
    'position:relative;display:flex;flex-direction:column;align-items:center;gap:6px;font-family:inherit;color:var(--cj-ink)}',
    '.cj svg{width:100%;height:auto;display:block;overflow:hidden}',
    '.cj-count{display:flex;align-items:baseline;gap:6px;font-family:Inter,"Noto Sans KR",sans-serif;font-variant-numeric:tabular-nums;line-height:1}',
    '.cj-n{font-size:34px;font-weight:700;letter-spacing:-0.03em}',
    '.cj-of{font-size:15px;font-weight:500;color:var(--cj-ink3)}',
    '.cj-meta{font-size:12px;color:var(--cj-ink3);letter-spacing:0.01em}',
    '.cj-toast{position:absolute;left:50%;top:34%;transform:translate(-50%,-50%);padding:8px 14px;border-radius:999px;',
    'background:var(--cj-ink);color:#FFF;font-size:13px;font-weight:600;white-space:nowrap;opacity:0;pointer-events:none;transition:opacity .25s,transform .25s}',
    '.cj-toast.on{opacity:1;transform:translate(-50%,-62%)}',
    '.cj-toast.gold{background:var(--cj-gold-d)}.cj-toast.bad{background:var(--cj-danger)}',
    '.cj.small .cj-n{font-size:22px}.cj.small .cj-of{font-size:12px}.cj.small .cj-meta{display:none}.cj.small .cj-toast{font-size:11px;padding:6px 10px}'
  ].join('');

  // 병 안쪽 (viewBox 200 × 260)
  var B = { x0: 28, x1: 172, top: 96, y1: 242, r: 19 };
  var JAR_PATH = 'M70,40 L70,50 C70,64 26,66 26,92 L26,224 Q26,244 46,244 L154,244 Q174,244 174,224 L174,92 C174,66 130,64 130,50 L130,40';

  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function rnd(i) { var x = Math.sin(i * 12.9898 + 4.1) * 43758.5453; return x - Math.floor(x); }
  function jarSize(level) { return STEP * level; }
  function fmt(n) { return Number(n).toLocaleString('en-US'); }
  var reduced = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function inside(x, y, r) {
    if (x - r < B.x0 || x + r > B.x1 || y + r > B.y1) return false;
    var cy = B.y1 - B.r, cx = null;
    if (x < B.x0 + B.r) cx = B.x0 + B.r; else if (x > B.x1 - B.r) cx = B.x1 - B.r;
    if (cx !== null && y > cy && Math.hypot(x - cx, y - cy) > B.r - r + 0.5) return false;
    return true;
  }

  // 병 크기(capacity)에 맞춰 동전 자리를 아래에서부터 벌집 모양으로. 다 차면 어깨 아래까지 찬다.
  var slotCache = {};
  function slots(n) {
    if (slotCache[n]) return slotCache[n];
    function make(r) {
      var d = r * 2.06, h = d * 0.87, out = [], row = 0;
      for (var y = B.y1 - r; y - r >= B.top - 2; y -= h, row++) {
        var off = row % 2 ? d / 2 : 0, rowSlots = [];
        for (var x = B.x0 + r + off; x + r <= B.x1; x += d) if (inside(x, y, r)) rowSlots.push({ x: x, y: y, row: row });
        var mid = (B.x0 + B.x1) / 2;
        if (rowSlots.length) {  // 줄을 병 가운데로
          var sh = mid - (rowSlots[0].x + rowSlots[rowSlots.length - 1].x) / 2;
          var moved = rowSlots.map(function (q) { return { x: q.x + sh, y: q.y, row: q.row }; });
          if (moved.every(function (q) { return inside(q.x, q.y, r); })) rowSlots = moved;
        }
        rowSlots.sort(function (a, b) { return Math.abs(a.x - mid) - Math.abs(b.x - mid); });
        out = out.concat(rowSlots);
      }
      return out;
    }
    var lo = 3, hi = 40;
    for (var k = 0; k < 30; k++) { var m = (lo + hi) / 2; if (make(m).length >= n) lo = m; else hi = m; }
    var r = lo, list = make(r).slice(0, n).map(function (s, i) {
      return { x: s.x + (rnd(i) - 0.5) * r * 0.22, y: s.y + (rnd(i + 99) - 0.5) * r * 0.08, rot: (rnd(i + 7) - 0.5) * 50, r: r };
    });
    slotCache[n] = list;
    return list;
  }

  function tween(ms, fn) {
    return new Promise(function (res) {
      var t0 = performance.now();
      function f(now) { var t = Math.min(1, (now - t0) / ms); fn(t); if (t < 1) requestAnimationFrame(f); else res(); }
      requestAnimationFrame(f);
    });
  }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  var easeIn = function (t) { return t * t; }, easeOut = function (t) { return 1 - (1 - t) * (1 - t); };
  var easeInOut = function (t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; };

  function create(host, opts) {
    opts = opts || {};
    if (!document.getElementById('coinjar-css')) {
      var st = document.createElement('style'); st.id = 'coinjar-css'; st.textContent = CSS; document.head.appendChild(st);
    }
    host.innerHTML = '';
    var root = document.createElement('div');
    root.className = 'cj' + (opts.small ? ' small' : '');
    host.appendChild(root);

    var svg = el('svg', { viewBox: '0 0 200 260', role: 'img' }, root);
    var defs = el('defs', {}, svg);
    var grad = el('radialGradient', { id: 'cjCoin', cx: '38%', cy: '34%', r: '70%' }, defs);
    el('stop', { offset: '0', 'stop-color': '#F9E08F' }, grad);
    el('stop', { offset: '0.6', 'stop-color': '#E2B33C' }, grad);
    el('stop', { offset: '1', 'stop-color': '#C79422' }, grad);

    el('path', { d: JAR_PATH + ' Z', fill: '#0A0A0A', 'fill-opacity': '0.025', stroke: 'none' }, svg);
    var coinLayer = el('g', {}, svg);
    var glass = el('path', { d: JAR_PATH, fill: 'none', stroke: '#0A0A0A', 'stroke-width': '2.2', 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);
    el('path', { d: 'M36,108 L36,206', stroke: '#FFFFFF', 'stroke-width': '3', 'stroke-linecap': 'round', opacity: '0.55' }, svg);
    var lid = el('g', {}, svg);
    el('rect', { x: '62', y: '24', width: '76', height: '18', rx: '4', fill: '#0A0A0A' }, lid);
    for (var i = 0; i < 6; i++) el('line', { x1: 72 + i * 11, y1: '27', x2: 72 + i * 11, y2: '39', stroke: '#FFFFFF', 'stroke-opacity': '0.18', 'stroke-width': '1.4' }, lid);
    var fullLine = el('line', { x1: '30', y1: B.top, x2: '170', y2: B.top, stroke: '#0A0A0A', 'stroke-opacity': '0.12', 'stroke-dasharray': '3 4' }, svg);

    var count = document.createElement('div'); count.className = 'cj-count';
    count.innerHTML = '<span class="cj-n">0</span><span class="cj-of">/ 20</span>';
    var meta = document.createElement('div'); meta.className = 'cj-meta';
    var toast = document.createElement('div'); toast.className = 'cj-toast';
    root.appendChild(count); root.appendChild(meta); root.appendChild(toast);
    var nEl = count.querySelector('.cj-n'), ofEl = count.querySelector('.cj-of');

    var cur = { coins: 0, jar: STEP, level: 1, base: 1000 };
    var coins = [];
    var busy = Promise.resolve();

    function coinNode(r) {
      var g = el('g', {});
      el('circle', { r: r, fill: 'url(#cjCoin)', stroke: '#A97A12', 'stroke-width': Math.max(0.8, r * 0.09) }, g);
      el('circle', { r: r * 0.68, fill: 'none', stroke: '#A97A12', 'stroke-opacity': '0.45', 'stroke-width': Math.max(0.6, r * 0.06) }, g);
      el('path', { d: 'M' + (-r * 0.5) + ',' + (-r * 0.35) + ' A' + r * 0.62 + ',' + r * 0.62 + ' 0 0 1 ' + (r * 0.15) + ',' + (-r * 0.6),
        fill: 'none', stroke: '#FFF6D6', 'stroke-width': Math.max(0.6, r * 0.1), 'stroke-linecap': 'round', opacity: '0.9' }, g);
      return g;
    }
    function place(g, x, y, rot, s) {
      g._x = x; g._y = y; g._rot = rot || 0;
      g.setAttribute('transform', 'translate(' + x.toFixed(2) + ',' + y.toFixed(2) + ') rotate(' + (rot || 0).toFixed(1) + ') scale(' + (s || 1) + ')');
    }
    function setText(st) {
      nEl.textContent = st.coins; ofEl.textContent = '/ ' + st.jar;
      meta.textContent = st.level + '단계 · 기준액 ' + fmt(st.base) + ' USDT';
      svg.setAttribute('aria-label', '코인병 ' + st.coins + ' / ' + st.jar);
    }
    function say(text, kind, ms) {
      toast.textContent = text; toast.className = 'cj-toast on ' + (kind || '');
      return wait(ms || 1400).then(function () { toast.className = 'cj-toast ' + (kind || ''); });
    }
    function draw(st) {
      cur = { coins: st.coins, jar: st.jar || jarSize(st.level), level: st.level, base: st.base };
      coinLayer.innerHTML = ''; coins = [];
      var sl = slots(cur.jar);
      var topY = Math.min.apply(null, sl.map(function (q) { return q.y - q.r; })) - 2;  // 가득 찬 높이
      fullLine.setAttribute('y1', topY.toFixed(1)); fullLine.setAttribute('y2', topY.toFixed(1));
      for (var i = 0; i < Math.min(cur.coins, cur.jar); i++) {
        var g = coinNode(sl[i].r); place(g, sl[i].x, sl[i].y, sl[i].rot); coinLayer.appendChild(g); coins.push(g);
      }
      glass.setAttribute('stroke', '#0A0A0A');
      setText(cur);
    }

    function lidUp(up) {
      var a = up ? 0 : 1;
      return tween(260, function (t) {
        var k = easeInOut(up ? t : 1 - t);
        lid.setAttribute('transform', 'translate(' + (-26 * k) + ',' + (-18 * k) + ') rotate(' + (-24 * k) + ' 62 42)');
      });
    }

    function dropOne(i) {
      var sl = slots(cur.jar)[i];
      if (!sl) return Promise.resolve();
      var g = coinNode(sl.r); coinLayer.appendChild(g); coins.push(g);
      var sx = 100 + (rnd(i + 31) - 0.5) * 30, sy = -sl.r - 4, ex = sl.x, ey = sl.y;
      var ms = 360 + Math.sqrt(ey - sy) * 22, spin = (rnd(i + 3) - 0.5) * 300;
      return tween(ms, function (t) {
        place(g, sx + (ex - sx) * easeOut(t), sy + (ey - sy) * easeIn(t), sl.rot + spin * (1 - t));
      }).then(function () {
        cur.coins += 1; setText(cur);
        return tween(170, function (t) {
          var b = Math.sin(t * Math.PI) * sl.r * 0.22;
          place(g, ex, ey - b, sl.rot);
        });
      });
    }

    async function drop(n) {
      if (n <= 0) return;
      await lidUp(true);
      var jobs = [], start = coins.length;  // 자리는 내려오기 시작할 때 정한다 (떨어지는 중인 것까지 센다)
      for (var k = 0; k < n; k++) {
        jobs.push(dropOne(start + k));
        await wait(n > 12 ? 70 : 150);
      }
      await Promise.all(jobs);
      await lidUp(false);
    }

    async function levelUp() {
      await tween(700, function (t) {
        var k = Math.sin(t * Math.PI);
        glass.setAttribute('stroke', k > 0.15 ? '#B8860B' : '#0A0A0A');
        glass.setAttribute('stroke-width', (2.2 + k * 2).toFixed(2));
      });
      glass.setAttribute('stroke', '#0A0A0A'); glass.setAttribute('stroke-width', '2.2');
      var next = { coins: 0, level: cur.level + 1, jar: jarSize(cur.level + 1), base: cur.base + REWARD };
      var toastP = say('병이 찼다 · 기준액 +' + REWARD, 'gold', 1500);
      await lidUp(true);
      var olds = coins.slice();
      await tween(650, function (t) {
        olds.forEach(function (g, i) {
          var d = Math.max(0, Math.min(1, t * 1.6 - (i % 9) * 0.06));
          g.setAttribute('opacity', (1 - d).toFixed(2));
          if (g._y0 === undefined) g._y0 = g._y;
          place(g, g._x, g._y0 - 70 * easeIn(d), g._rot);
        });
      });
      await lidUp(false);
      await toastP;
      draw(next);
      meta.textContent = next.level + '단계 · 기준액 ' + fmt(next.base) + ' USDT';
      await say(next.level + '단계 · ' + next.jar + '개 병', '', 1100);
    }

    async function empty() {
      var bad = say('큰 위반 · 병 비움', 'bad', 1600);
      await tween(380, function (t) {
        var s = Math.sin(t * Math.PI * 6) * (1 - t) * 4;
        svg.style.transform = 'translateX(' + s.toFixed(2) + 'px)';
        glass.setAttribute('stroke', t < 0.9 ? '#D64545' : '#0A0A0A');
      });
      svg.style.transform = '';
      var olds = coins.slice();
      await tween(700, function (t) {
        olds.forEach(function (g, i) {
          var d = Math.max(0, Math.min(1, t * 1.5 - rnd(i + 50) * 0.5));
          g.setAttribute('opacity', (1 - d).toFixed(2));
          if (g._y0 === undefined) g._y0 = g._y;
          place(g, g._x, g._y0 + 90 * easeIn(d), g._rot);
        });
        nEl.textContent = Math.round(cur.coins * (1 - t));
      });
      glass.setAttribute('stroke', '#0A0A0A');
      await bad;
      draw({ coins: 0, jar: cur.jar, level: cur.level, base: cur.base });
    }

    async function play(prev, next, o) {
      o = o || {};
      next = { coins: next.coins, level: next.level, jar: next.jar || jarSize(next.level), base: next.base };
      prev = prev ? { coins: prev.coins, level: prev.level, jar: prev.jar || jarSize(prev.level), base: prev.base } : next;
      if (reduced) { draw(next); return; }
      draw(prev);
      await wait(250);
      if (o.emptied || (next.level === prev.level && next.coins < prev.coins)) {
        if (cur.coins > 0) await empty(); else { await say('큰 위반 · 병 비움', 'bad', 1500); }
        draw(next); return;
      }
      while (cur.level < next.level) { await drop(cur.jar - cur.coins); await levelUp(); }
      await drop(next.coins - cur.coins);
      draw(next);
    }

    function queue(fn) { busy = busy.then(fn, fn); return busy; }
    return {
      render: function (st) { return queue(function () { draw(st); }); },
      play: function (prev, next, o) { return queue(function () { return play(prev, next, o); }); },
      get state() { return Object.assign({}, cur); }
    };
  }

  global.CoinJar = { create: create, jarSize: jarSize };
})(window);
