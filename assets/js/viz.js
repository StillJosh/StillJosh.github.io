// Shared SVG helpers for the interactive figures in the notes, exposed as window.Viz.
// Each figure fills a <figure class="viz" id="viz-..."> placed in the post.
(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var W = 360, H = 240, M = { l: 38, r: 12, t: 28, b: 30 };

  function svgEl(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function text(parent, x, y, str, attrs) {
    var t = svgEl('text', Object.assign({ x: x, y: y }, attrs || {}), parent);
    t.textContent = str;
    return t;
  }
  function clear(g) { while (g.firstChild) g.removeChild(g.firstChild); }
  function lin(d0, d1, r0, r1) { return function (v) { return r0 + (v - d0) / (d1 - d0) * (r1 - r0); }; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function path(pts) {
    return pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join('');
  }
  function range(a, b, n) { var r = []; for (var i = 0; i < n; i++) r.push(a + (b - a) * i / (n - 1)); return r; }

  // seeded uniform (mulberry32) and standard normal (Box-Muller)
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function normal(seed) {
    var u = rng(seed);
    return function () { return Math.sqrt(-2 * Math.log(1 - u())) * Math.cos(2 * Math.PI * u()); };
  }

  // ---------- layout ----------
  function mount(id) {
    var fig = document.getElementById(id);
    if (!fig) return null;
    var cap = fig.querySelector('figcaption');
    var panels = document.createElement('div'); panels.className = 'viz-panels';
    var ctrl = document.createElement('div'); ctrl.className = 'viz-controls';
    var out = document.createElement('div'); out.className = 'viz-readout'; out.setAttribute('aria-live', 'polite');
    [panels, ctrl, out].forEach(function (n) { fig.insertBefore(n, cap); });
    return { panels: panels, ctrl: ctrl, out: out };
  }

  // panel of width W and height h (default H) with a title line and a plotting area inside the margins M
  function panel(host, title, h) {
    h = h || H;
    var wrap = document.createElement('div'); wrap.className = 'viz-panel'; host.appendChild(wrap);
    var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + h, role: 'img', 'aria-label': title }, wrap);
    text(svg, M.l, 14, title, { class: 'viz-title' });
    var axes = svgEl('g', {}, svg);
    return { svg: svg, axes: axes, g: svgEl('g', {}, svg), x0: M.l, x1: W - M.r, y0: h - M.b, y1: M.t };
  }

  // x axis with ticks along the bottom, y axis with ticks along the left (either may be omitted)
  function axes(p, sx, sy, xt, yt, xlabel) {
    clear(p.axes);
    svgEl('line', { x1: p.x0, x2: p.x1, y1: p.y0, y2: p.y0, class: 'axis' }, p.axes);
    (xt || []).forEach(function (v) {
      svgEl('line', { x1: sx(v), x2: sx(v), y1: p.y0, y2: p.y0 + 4, class: 'axis' }, p.axes);
      text(p.axes, sx(v), p.y0 + 15, String(v), { 'text-anchor': 'middle' });
    });
    if (xlabel) text(p.axes, p.x1, p.y0 + 27, xlabel, { 'text-anchor': 'end' });
    if (yt) {
      svgEl('line', { x1: p.x0, x2: p.x0, y1: p.y0, y2: p.y1, class: 'axis' }, p.axes);
      yt.forEach(function (v) {
        svgEl('line', { x1: p.x0 - 4, x2: p.x0, y1: sy(v), y2: sy(v), class: 'axis' }, p.axes);
        text(p.axes, p.x0 - 7, sy(v) + 4, String(v), { 'text-anchor': 'end' });
      });
    }
  }

  function legend(p, items) {
    var x = p.x1;
    items.slice().reverse().forEach(function (it) {
      var t = text(p.svg, x, 14, it[0], { 'text-anchor': 'end', class: it[1] });
      x -= t.getComputedTextLength() + 12;
    });
  }

  // figure-wide legend above the panels; items are [label, class], drawn as a dot for dot-*/ring-*, a box for fill-*/cell-*, else a line
  function key(fig, items) {
    var row = document.createElement('div'); row.className = 'viz-key';
    items.forEach(function (it) {
      var s = document.createElement('span'), sw = svgEl('svg', { viewBox: '0 0 18 10' }, s);
      if (/^(dot|ring)/.test(it[1])) svgEl('circle', { cx: 9, cy: 5, r: 3.2, class: it[1] }, sw);
      else if (/^(fill|cell)/.test(it[1])) svgEl('rect', { x: 2, y: 0, width: 14, height: 10, class: it[1] }, sw);
      else svgEl('line', { x1: 0, x2: 18, y1: 5, y2: 5, class: it[1] }, sw);
      s.append(it[0]); row.appendChild(s);
    });
    fig.panels.parentNode.insertBefore(row, fig.panels);
    balance(row);
    var width = row.clientWidth;
    new ResizeObserver(function () { if (row.clientWidth !== width) { width = row.clientWidth; balance(row); } }).observe(row);
  }

  // break the legend into the fewest rows that fit, with the entries spread evenly over the rows
  function balance(row) {
    row.querySelectorAll('.viz-key-br').forEach(function (b) { b.remove(); });
    var items = Array.from(row.children), gap = parseFloat(getComputedStyle(row).columnGap) || 0;
    var w = items.map(function (s) { return s.getBoundingClientRect().width; }), starts;
    for (var rows = 1; rows <= items.length; rows++) {
      starts = []; for (var k = 0; k <= rows; k++) starts.push(Math.round(k * items.length / rows));
      if (starts.slice(1).every(function (e, k) { return w.slice(starts[k], e).reduce(function (a, b) { return a + b + gap; }, -gap) <= row.clientWidth; })) break;
    }
    starts.slice(1, -1).forEach(function (i) {
      var br = document.createElement('i'); br.className = 'viz-key-br'; row.insertBefore(br, items[i]);
    });
  }

  function slider(ctrl, label, min, max, step, value, onInput) {
    var l = document.createElement('label'); l.className = 'viz-slider';
    var s = document.createElement('span'); s.textContent = label;
    var inp = document.createElement('input');
    inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step; inp.value = value;
    inp.addEventListener('input', onInput);
    l.append(s, inp); ctrl.appendChild(l);
    return inp;
  }

  // all buttons of a figure share one row
  function button(ctrl, label, onClick) {
    var row = ctrl.querySelector('.viz-buttons');
    if (!row) { row = document.createElement('div'); row.className = 'viz-buttons'; ctrl.appendChild(row); }
    var b = document.createElement('button'); b.type = 'button'; b.textContent = label;
    b.addEventListener('click', onClick); row.appendChild(b);
    return b;
  }

  // labeled row of buttons, one per value; the pressed button marks the current value
  function choice(ctrl, label, values, value, onChange) {
    var row = document.createElement('div'); row.className = 'viz-choice';
    var s = document.createElement('span'); s.textContent = label; row.appendChild(s);
    var bs = values.map(function (v) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = v; b.setAttribute('aria-pressed', v === value);
      b.addEventListener('click', function () { bs.forEach(function (o) { o.setAttribute('aria-pressed', o === b); }); onChange(v); });
      row.appendChild(b);
      return b;
    });
    ctrl.appendChild(row);
  }

  // pointer position in the svg's viewBox coordinates
  function svgPoint(svg, ev) {
    var pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }

  // calls onDrag(point) on press and while dragging inside the svg
  function draggable(svg, onDrag) {
    svg.classList.add('draggable');
    svg.addEventListener('pointerdown', function (ev) { svg.setPointerCapture(ev.pointerId); onDrag(svgPoint(svg, ev)); });
    svg.addEventListener('pointermove', function (ev) { if (svg.hasPointerCapture(ev.pointerId)) onDrag(svgPoint(svg, ev)); });
  }

  window.Viz = {
    W: W, H: H, M: M, svgEl: svgEl, text: text, clear: clear, lin: lin, clamp: clamp, path: path, range: range, rng: rng, normal: normal,
    mount: mount, panel: panel, axes: axes, legend: legend, key: key, slider: slider, button: button, choice: choice, svgPoint: svgPoint, draggable: draggable
  };
})();
