// Interactive figures for the note "OperatorSHAP: Shapley values for neural operators".
(function () {
  'use strict';

  var V = window.Viz;
  var svgEl = V.svgEl, text = V.text, clear = V.clear, lin = V.lin, clamp = V.clamp, path = V.path, range = V.range, rng = V.rng, normal = V.normal;
  var mount = V.mount, panel = V.panel, axes = V.axes, legend = V.legend, slider = V.slider, button = V.button;

  // ---------- heat equation and model ----------
  // u(x,t) = sum_k a_k exp(-nu k^2 pi^2 t) sin(k pi x) on [0,1], evaluated on the grid XS
  var PI = Math.PI, K = 64, NU = 0.003, N = 201, XS = range(0, 1, N), DX = 1 / (N - 1);
  var KM = 16, MULT = [0], gm = normal(99);
  for (var k = 1; k <= KM; k++) MULT.push(Math.exp(-NU * k * k * PI * PI) * (1 + 0.25 * gm()));
  var SIN = [null];
  for (k = 1; k <= KM; k++) SIN.push(XS.map(function (x) { return Math.sin(k * PI * x); }));

  function decay(k, t) { return Math.exp(-NU * k * k * PI * PI * t); }
  function evalCoef(c, t, x) { var s = 0; for (var k = 1; k <= K; k++) s += c[k] * decay(k, t) * Math.sin(k * PI * x); return s; }

  // initial coefficients a_k ~ N(0, exp(-k^2 / 25)), scaled so that max |u(., t)| = 1
  function heatCoef(seed, t) {
    var g = normal(seed), c = [0];
    for (var k = 1; k <= K; k++) c.push(g() * Math.exp(-k * k / 50));
    var mx = Math.max.apply(null, XS.map(function (x) { return Math.abs(evalCoef(c, t, x)); }));
    return c.map(function (a) { return a / mx; });
  }
  function heatState(seed) { var c = heatCoef(seed, 1); return XS.map(function (x) { return evalCoef(c, 1, x); }); }

  // the model: one heat step kept on KM Fourier modes with perturbed decay rates, then the readout g and an output bias
  function g(z) { return z - 0.25 * z * z * z; }
  function bias(x) { return 0.04 * Math.sin(3 * PI * x) - 0.02 * Math.sin(8 * PI * x); }
  function integrate(f) { var s = 0; for (var j = 0; j < N; j++) s += f[j] * (j === 0 || j === N - 1 ? 0.5 : 1); return s * DX; }
  function kernel(xh) {
    var kr = new Float64Array(N);
    for (var k = 1; k <= KM; k++) { var a = 2 * MULT[k] * Math.sin(k * PI * xh); for (var j = 0; j < N; j++) kr[j] += a * SIN[k][j]; }
    return kr;
  }
  function times(a, b) { var r = new Float64Array(N); for (var j = 0; j < N; j++) r[j] = a[j] * b[j]; return r; }
  // value(u, xh) = F(u)(xh) - F(0)(xh); the bias cancels
  function value(u, xh) { return g(integrate(times(kernel(xh), u))); }

  // Aumann-Shapley value for baseline 0: h(x) dF/du(x) integrated along the line from 0 to u, here kernel * u * g(z) / z
  function attribution(u, xh) {
    var kr = kernel(xh), z = integrate(times(kr, u)), r = Math.abs(z) < 1e-9 ? 1 : g(z) / z;
    return times(kr, u).map(function (v) { return v * r; });
  }

  // ---------- shared drawing ----------
  function line(gr, pts, cls, extra) { return svgEl('path', Object.assign({ d: path(pts), class: cls }, extra || {}), gr); }
  function curve(gr, sx, sy, xs, ys, cls, extra) { return line(gr, xs.map(function (x, j) { return [sx(x), sy(ys[j])]; }), cls, extra); }

  // positive part of f filled in fill-pos, negative part in fill-neg
  function signedArea(gr, sx, sy, f) {
    [['fill-pos', Math.max], ['fill-neg', Math.min]].forEach(function (s) {
      var up = XS.map(function (x, j) { return [sx(x), sy(s[1](f[j], 0))]; });
      line(gr, up.concat([[sx(1), sy(0)], [sx(0), sy(0)]]), s[0]);
    });
  }
  function marker(p, gr, sx, xh, label) {
    svgEl('line', { x1: sx(xh), x2: sx(xh), y1: p.y0, y2: p.y1 + 6, class: 'line-mark' }, gr);
    text(gr, sx(xh), p.y1 + 2, label || 'x̂', { 'text-anchor': 'middle', class: 'label-test' });
  }
  function sub(n) { return String(n).replace(/\d/g, function (d) { return '₀₁₂₃₄₅₆₇₈₉'[d]; }); }
  function sup(n) { return String(n).replace('-', '⁻').replace(/\d/g, function (d) { return '⁰¹²³⁴⁵⁶⁷⁸⁹'[d]; }); }
  function sig(z) { return 1 / (1 + Math.exp(-z)); }

  // ---------- figure 1: samples on different meshes ----------
  var VIRIDIS = ['#440154', '#482475', '#414487', '#355f8d', '#2a788e', '#21918c', '#22a884', '#44bf70', '#7ad151', '#bddf26', '#fde725'];
  function viridis(v) {
    v = clamp(v, 0, 1) * (VIRIDIS.length - 1);
    var i = Math.min(VIRIDIS.length - 2, Math.floor(v)), f = v - i;
    var a = parseInt(VIRIDIS[i].slice(1), 16), b = parseInt(VIRIDIS[i + 1].slice(1), 16);
    var mix = function (s) { return Math.round(((a >> s) & 255) * (1 - f) + ((b >> s) & 255) * f); };
    return 'rgb(' + mix(16) + ',' + mix(8) + ',' + mix(0) + ')';
  }

  // illustrative speed of a channel flow past a cylinder: potential flow, an oscillating wake and no-slip walls
  function speed(x, y, ob) {
    var dx = x - ob.x, dy = y - ob.y, r2 = ob.r * ob.r, q = dx * dx + dy * dy;
    var vx = 1 - r2 * (dx * dx - dy * dy) / (q * q), vy = -2 * r2 * dx * dy / (q * q);
    var s = Math.hypot(vx, vy);
    if (dx > 0) {
      var w = 0.9 * ob.r + 0.08 * dx, osc = 0.6 * ob.r * Math.sin(dx / ob.r * 0.9 + ob.phase) * Math.min(1, dx / (3 * ob.r));
      s *= 1 - 0.95 * Math.exp(-Math.pow(dy - osc, 2) / (w * w)) * Math.exp(-dx / (25 * ob.r));
    }
    return s * (1 - Math.exp(-y / 0.04)) * (1 - Math.exp(-(1 - y) / 0.04));
  }

  // nodes on the channel walls, on the obstacle and inside, with spacing refined towards the obstacle
  function meshNodes(ob, u) {
    var hmax = 0.09, hmin = Math.max(0.012, ob.r * 0.2);
    var h = function (x, y) { return hmin + (hmax - hmin) * Math.min(1, Math.max(0, Math.hypot(x - ob.x, y - ob.y) - ob.r) / 0.3); };
    var P = [];
    [[0, 0, 2, 0], [2, 0, 2, 1], [2, 1, 0, 1], [0, 1, 0, 0]].forEach(function (e) {
      for (var s = 0; s < 1;) { var x = e[0] + (e[2] - e[0]) * s, y = e[1] + (e[3] - e[1]) * s; P.push([x, y]); s += h(x, y) / Math.hypot(e[2] - e[0], e[3] - e[1]); }
    });
    var nc = Math.ceil(2 * PI * ob.r / hmin);
    for (var i = 0; i < nc; i++) P.push([ob.x + ob.r * Math.cos(2 * PI * i / nc), ob.y + ob.r * Math.sin(2 * PI * i / nc)]);
    for (var a = 0; a < 9000; a++) {
      var x = 2 * u(), y = u(), hh = h(x, y), d = Math.hypot(x - ob.x, y - ob.y) - ob.r;
      if (d < 0.6 * hh || x < 0.6 * hh || x > 2 - 0.6 * hh || y < 0.6 * hh || y > 1 - 0.6 * hh) continue;
      var ok = true;
      for (var j = 0; j < P.length && ok; j++) ok = Math.pow(P[j][0] - x, 2) + Math.pow(P[j][1] - y, 2) > 0.6 * hh * hh;
      if (ok) P.push([x, y]);
    }
    return P;
  }

  // Bowyer-Watson Delaunay triangulation, triangles as index triples
  function delaunay(P) {
    var pts = P.concat([[-10, -10], [12, -10], [1, 20]]), n = P.length;
    function tri(a, b, c) {
      var A = pts[a], B = pts[b], C = pts[c], d = 2 * (A[0] * (B[1] - C[1]) + B[0] * (C[1] - A[1]) + C[0] * (A[1] - B[1]));
      var a2 = A[0] * A[0] + A[1] * A[1], b2 = B[0] * B[0] + B[1] * B[1], c2 = C[0] * C[0] + C[1] * C[1];
      var ux = (a2 * (B[1] - C[1]) + b2 * (C[1] - A[1]) + c2 * (A[1] - B[1])) / d, uy = (a2 * (C[0] - B[0]) + b2 * (A[0] - C[0]) + c2 * (B[0] - A[0])) / d;
      return { v: [a, b, c], x: ux, y: uy, r2: Math.pow(A[0] - ux, 2) + Math.pow(A[1] - uy, 2) };
    }
    var T = [tri(n, n + 1, n + 2)];
    for (var i = 0; i < n; i++) {
      var p = pts[i], keep = [], edges = {};
      T.forEach(function (t) {
        if (Math.pow(p[0] - t.x, 2) + Math.pow(p[1] - t.y, 2) >= t.r2) return keep.push(t);
        [[0, 1], [1, 2], [2, 0]].forEach(function (e) {
          var a = t.v[e[0]], b = t.v[e[1]], key = a < b ? a + ',' + b : b + ',' + a;
          edges[key] = edges[key] ? null : [a, b];
        });
      });
      for (var key in edges) if (edges[key]) keep.push(tri(edges[key][0], edges[key][1], i));
      T = keep;
    }
    return T.filter(function (t) { return t.v[0] < n && t.v[1] < n && t.v[2] < n; }).map(function (t) { return t.v; });
  }

  function figMeshes() {
    var m = mount('viz-meshes'); if (!m) return;
    var panels = [0, 1, 2, 3].map(function () { return panel(m.panels, '', 184); });
    var seed = 3;
    function sample() {
      panels.forEach(function (p, s) {
        var u = rng(seed++);
        var r = 0.04 + 0.12 * u(), ob = { x: 0.3 + 1.1 * u(), y: 0.32 + 0.36 * u(), r: r, phase: 2 * PI * u() };
        var P = meshNodes(ob, u), T = delaunay(P);
        var sx = lin(0, 2, p.x0, p.x1), sy = lin(0, 1, 24 + (p.x1 - p.x0) / 2, 24);
        clear(p.g);
        p.svg.querySelector('.viz-title').textContent = 'sample ' + (s + 1) + ' · ' + P.length + ' nodes';
        T.forEach(function (t) {
          var cx = (P[t[0]][0] + P[t[1]][0] + P[t[2]][0]) / 3, cy = (P[t[0]][1] + P[t[1]][1] + P[t[2]][1]) / 3;
          if (Math.hypot(cx - ob.x, cy - ob.y) < ob.r) return;
          var d = path(t.map(function (i) { return [sx(P[i][0]), sy(P[i][1])]; })) + 'Z';
          svgEl('path', { d: d, class: 'mesh-tri', fill: viridis(speed(cx, cy, ob) / 1.6) }, p.g);
        });
        P.forEach(function (q) { svgEl('circle', { cx: sx(q[0]), cy: sy(q[1]), r: 0.7, class: 'mesh-node' }, p.g); });
        svgEl('circle', { cx: sx(ob.x), cy: sy(ob.y), r: sx(ob.r) - sx(0), class: 'obstacle' }, p.g);
        svgEl('rect', { x: sx(0), y: sy(1), width: sx(2) - sx(0), height: sy(0) - sy(1), class: 'domain' }, p.g);
      });
    }
    button(m.ctrl, 'new samples', sample);
    sample();
  }

  // ---------- figure 2: heat equation and one model step ----------
  // the heat equation is autonomous, so the model step from u(., t - 1) predicts u(., t) for every t >= 1
  function figHeat() {
    var m = mount('viz-heat'); if (!m) return;
    var L = panel(m.panels, 'continuous u(x, t)');
    var R = panel(m.panels, 'discrete uₜ on a mesh');
    var T = 10, NM = 26, seed = 1, coef = [], nodes = [];
    var sx = lin(0, 1, L.x0, L.x1), sy = lin(-1.2, 1.2, L.y0, L.y1);
    [L, R].forEach(function (p) { axes(p, sx, sy, [0, 0.5, 1], [-1, 0, 1], 'x'); });
    V.key(m, [['model input u(t − 1)', 'line-grey'], ['state u(t)', 'line-ink'], ['model prediction F̂(u(t − 1))', 'line-test']]);

    function at(t, xs) { return xs.map(function (x) { return evalCoef(coef, t, x); }); }
    function predict(t, xs) {
      return xs.map(function (x) { var s = 0; for (var k = 1; k <= KM; k++) s += MULT[k] * coef[k] * decay(k, t) * Math.sin(k * PI * x); return g(s) + bias(x); });
    }
    function sample() {
      var r = rng(seed + 1000);
      coef = heatCoef(seed++, 0);
      nodes = range(0, 1, NM).map(function (x, i) { return i === 0 || i === NM - 1 ? x : x + (r() - 0.5) * 0.7 / (NM - 1); });
      draw();
    }
    function draw() {
      var t = +time.value, truth = at(t, XS), pred = predict(t - 1, XS), truthN = at(t, nodes), predN = predict(t - 1, nodes);
      clear(L.g); clear(R.g);
      curve(L.g, sx, sy, XS, at(t - 1, XS), 'line-grey');
      curve(L.g, sx, sy, XS, pred, 'line-test');
      curve(L.g, sx, sy, XS, truth, 'line-ink');
      [[at(t - 1, nodes), 'grey', 'dot-grey', 2], [truthN, 'ink', 'dot-ink', 2.4], [predN, 'test', 'ring-test', 4]].forEach(function (s) {
        curve(R.g, sx, sy, nodes, s[0], 'line-' + s[1] + ' faint');
        nodes.forEach(function (x, i) { svgEl('circle', { cx: sx(x), cy: sy(s[0][i]), r: s[3], class: s[2] }, R.g); });
      });
      [L, R].forEach(function (p) { text(p.g, p.x1, p.y1 + 4, 't = ' + t.toFixed(2), { 'text-anchor': 'end', class: 'mono' }); });
      m.out.textContent = 'model step t − 1 → t  ·  L² error ‖F̂(u(t − 1)) − u(t)‖ = ' + Math.sqrt(integrate(truth.map(function (v, j) { return Math.pow(v - pred[j], 2); }))).toFixed(3);
    }

    var raf = 0;
    var time = slider(m.ctrl, 'time t', 1, T, 0.01, 1, function () { stop(); draw(); });
    var play = button(m.ctrl, 'play', function () {
      if (raf) return stop();
      if (+time.value >= T) time.value = 1;
      play.textContent = 'pause';
      var last = performance.now();
      raf = requestAnimationFrame(function tick(now) {
        time.value = Math.min(T, +time.value + (now - last) / 1000 * 0.4);
        last = now; draw();
        raf = +time.value < T ? requestAnimationFrame(tick) : (stop(), 0);
      });
    });
    function stop() { cancelAnimationFrame(raf); raf = 0; play.textContent = 'play'; }
    button(m.ctrl, 'new sample', sample);
    sample();
  }

  // ---------- figure 3: attribution for one location ----------
  function figAttr() {
    var m = mount('viz-attr'); if (!m) return;
    var L = panel(m.panels, 'prediction at x̂');
    var R = panel(m.panels, 'attribution φ(x) for the prediction at x̂');
    var sx = lin(0, 1, L.x0, L.x1), sy = lin(-1.2, 1.2, L.y0, L.y1), syR = lin(-6, 6, R.y0, R.y1);
    axes(L, sx, sy, [0, 0.5, 1], [-1, 0, 1], 'x');
    axes(R, sx, syR, [0, 0.5, 1], [-5, 0, 5], 'x');
    V.key(m, [['input u', 'line-ink'], ['baseline ū', 'line-grey'], ['F̂(u)', 'line-test'], ['F̂(ū)', 'line-test faint'], ['φ > 0', 'fill-pos'], ['φ < 0', 'fill-neg']]);
    var seed = 312, u = [], pred = [], px = range(0, 1, 101);

    function sample() {
      u = heatState(seed++);
      pred = px.map(function (x) { return value(u, x) + bias(x); });
      draw();
    }
    function draw() {
      var xh = +xsl.value, phi = attribution(u, xh), fx = value(u, xh), f0 = bias(xh);
      clear(L.g); clear(R.g);
      svgEl('line', { x1: L.x0, x2: L.x1, y1: sy(0), y2: sy(0), class: 'line-grey' }, L.g);
      curve(L.g, sx, sy, px, px.map(bias), 'line-test faint');
      curve(L.g, sx, sy, XS, u, 'line-ink');
      curve(L.g, sx, sy, px, pred, 'line-test');
      marker(L, L.g, sx, xh);
      svgEl('line', { x1: sx(xh), x2: sx(xh), y1: sy(f0), y2: sy(f0 + fx), class: 'line-diff' }, L.g);
      [f0, f0 + fx].forEach(function (v) { svgEl('circle', { cx: sx(xh), cy: sy(v), r: 4, class: 'dot-test' }, L.g); });
      var right = xh < 0.75;
      text(L.g, sx(xh) + (right ? 7 : -7), sy(f0) + (fx >= 0 ? 14 : -7), 'Δ = ' + fx.toFixed(2), { 'text-anchor': right ? 'start' : 'end', class: 'label-test mono' });
      svgEl('line', { x1: R.x0, x2: R.x1, y1: syR(0), y2: syR(0), class: 'axis' }, R.g);
      signedArea(R.g, sx, syR, phi);
      curve(R.g, sx, syR, XS, phi, 'line-ink', { 'stroke-width': 1 });
      marker(R, R.g, sx, xh);
      m.out.textContent = 'F̂ₓ̂(u) − F̂ₓ̂(ū) = ' + fx.toFixed(3) + '  ·  ∫Ω φ dx = ' + integrate(phi).toFixed(3) + '  at x̂ = ' + xh.toFixed(2);
    }
    var xsl = slider(m.ctrl, 'explained location x̂', 0.01, 0.99, 0.005, 0.5, draw);
    button(m.ctrl, 'new sample', sample);
    sample();
  }

  // ---------- figure 4: the game, step by step ----------
  var MASK_W = 0.006;

  // smooth masks with transitions at the cell boundaries b; they sum to one by construction
  function masks(b, xs) {
    return range(0, b.length, b.length + 1).map(function (i) {
      return xs.map(function (x) { return (i ? sig((x - b[i - 1]) / MASK_W) : 1) - (i < b.length ? sig((x - b[i]) / MASK_W) : 0); });
    });
  }
  // sum_i w_i eta_i on the grid xs
  function activation(b, w, xs) {
    var eta = masks(b, xs);
    return xs.map(function (x, q) { var s = 0; eta.forEach(function (e, i) { s += w[i] * e[q]; }); return s; });
  }
  function gcd(a, b) { return b ? gcd(b, a % b) : a; }
  function frac(a, b) { var d = gcd(a, b); return a === 0 || a === b ? String(a / b) : a / d + '/' + b / d; }

  function figGame() {
    var m = mount('viz-game'); if (!m) return;
    var P = [panel(m.panels, '(1) partition Ω with smooth masks ηᵢ'), panel(m.panels, '(2) activate the masks: Σᵢ μᵢ(S) ηᵢ'),
      panel(m.panels, '(3) baseline and input'), panel(m.panels, '(4) game input ū + Σᵢ μᵢ(S) ηᵢ (u − ū)')];
    var NP = 16, XP = range(0.04, 0.96, NP), XF = range(0, 1, 401);
    var sx = lin(0, 1, P[0].x0, P[0].x1), sy01 = lin(0, 1.25, P[0].y0, P[0].y1), syU = lin(-1.15, 1.15, P[0].y0, P[0].y1);
    var inS = XP.map(function (x, j) { return [3, 5, 6, 9, 10, 12, 15, 16].indexOf(j + 1) >= 0; });
    var seed = 5, u = [], nm = 4;
    V.key(m, [['masks ηᵢ', 'line-mask'], ['node in S', 'dot-cal'], ['node not in S', 'dot-open'], ['input u', 'line-ink'], ['baseline ū ≡ 0', 'line-grey'], ['game input', 'line-cal']]);

    function nodeAxis(p, sy, yt) {
      axes(p, sx, sy, [], yt);
      XP.forEach(function (x, j) { text(p.axes, sx(x), p.y0 + 15, 'x' + sub(j + 1), { 'text-anchor': 'middle', style: 'font-size: 10px', class: inS[j] ? 'node-in' : '' }); });
    }
    function draw() {
      var group = XP.map(function (x, j) { return Math.floor(j * nm / NP); });
      var b = []; for (var j = 1; j < NP; j++) if (group[j] !== group[j - 1]) b.push((XP[j] + XP[j - 1]) / 2);
      var mu = range(0, nm - 1, nm).map(function (i) {
        var all = 0, ins = 0; group.forEach(function (gi, j) { if (gi === i) { all++; if (inS[j]) ins++; } }); return [ins, all];
      });
      var share = mu.map(function (v) { return v[0] / v[1]; }), eta = masks(b, XF), act = activation(b, share, XF);
      var uf = XF.map(function (x) { return interp(u, x); }), game = uf.map(function (v, q) { return v * act[q]; });
      P.forEach(function (p) { clear(p.g); });
      nodeAxis(P[0], sy01, [0, 1]); nodeAxis(P[1], sy01, [0, 1]); nodeAxis(P[2], syU, [-1, 0, 1]); nodeAxis(P[3], syU, [-1, 0, 1]);
      P.forEach(function (p) { b.forEach(function (x) { svgEl('line', { x1: sx(x), x2: sx(x), y1: p.y0, y2: p.y1, class: 'line-cell' }, p.g); }); });
      var edges = [0].concat(b, [1]);

      // neighbouring masks alternate between two shades
      eta.forEach(function (e, i) {
        curve(P[0].g, sx, sy01, XF, e, 'line-mask' + (i % 2 ? ' alt' : ''));
        text(P[0].g, sx((edges[i] + edges[i + 1]) / 2), sy01(1) - 9, 'η' + sub(i + 1), { 'text-anchor': 'middle' });
      });
      XP.forEach(function (x) { svgEl('circle', { cx: sx(x), cy: sy01(1), r: 2.5, class: 'dot-grey' }, P[0].g); });

      curve(P[1].g, sx, sy01, XF, act, 'line-cal');
      mu.forEach(function (v, i) { text(P[1].g, sx((edges[i] + edges[i + 1]) / 2), sy01(v[0] / v[1]) - 9, frac(v[0], v[1]), { 'text-anchor': 'middle' }); });
      XP.forEach(function (x, j) { svgEl('circle', { cx: sx(x), cy: sy01(share[group[j]]), r: 4, class: inS[j] ? 'dot-cal' : 'dot-open' }, P[1].g); });

      [P[2], P[3]].forEach(function (p, i) {
        svgEl('line', { x1: p.x0, x2: p.x1, y1: syU(0), y2: syU(0), class: 'line-grey' }, p.g);
        curve(p.g, sx, syU, XF, uf, 'line-ink' + (i ? ' faint' : ''));
      });
      curve(P[3].g, sx, syU, XF, game, 'line-cal', { 'stroke-width': 2.4 });

      var gs = times(u, activation(b, share, XS));
    }
    function interp(f, x) { var p = x / DX, i = Math.min(N - 2, Math.floor(p)); return f[i] + (f[i + 1] - f[i]) * (p - i); }

    P.forEach(function (p) {
      p.svg.classList.add('clickable');
      p.svg.addEventListener('click', function (ev) {
        var j = Math.round(lin(sx(XP[0]), sx(XP[NP - 1]), 0, NP - 1)(V.svgPoint(p.svg, ev).x));
        if (j < 0 || j >= NP) return;
        inS[j] = !inS[j]; draw();
      });
    });
    V.choice(m.ctrl, 'masks m', [2, 4, 8, 16], nm, function (v) { nm = v; draw(); });
    button(m.ctrl, 'random coalition', function () { var r = Math.random; inS = inS.map(function () { return r() < 0.5; }); draw(); });
    button(m.ctrl, 'new input', function () { u = heatState(seed++); draw(); });
    u = heatState(seed++);
    draw();
  }

  // ---------- figure 5: training the explainer ----------
  // explainer phi(x) = u(x) k(x - xh), with k linear between ND values on [-DMAX, DMAX], trained with Adam
  function figTrain() {
    var m = mount('viz-train'); if (!m) return;
    var A = panel(m.panels, '1–2 · sample, mesh, Voronoi cells'), B = panel(m.panels, '3 · masked input and model value');
    var C = panel(m.panels, '4–5 · attribution, integral over S'), D = panel(m.panels, '6 · loss, mean of the last 50 iterations');
    var sx = lin(0, 1, A.x0, A.x1), sy = lin(-1.2, 1.2, A.y0, A.y1), syC = lin(-6, 6, C.y0, C.y1);
    [A, B].forEach(function (p) { axes(p, sx, sy, [0, 0.5, 1], [-1, 0, 1], 'x'); });
    axes(C, sx, syC, [0, 0.5, 1], [-5, 0, 5], 'x');
    V.key(m, [['input u', 'line-ink'], ['node in S', 'dot-cal'], ['node not in S', 'dot-open'], ['masked input uˢ', 'line-cal'], ['F̂(uˢ)', 'line-test'], ['F̂(ū)', 'line-test faint'],
      ['φ̂ > 0', 'fill-pos'], ['φ̂ < 0', 'fill-neg'], ['exact attribution', 'line-dash']]);
    var ND = 101, DMAX = 0.5, LR = 0.05, PX = range(0, 1, 101), theta, m1, m2, it, losses, seeds, st;

    function reset() {
      theta = new Float64Array(ND); m1 = new Float64Array(ND); m2 = new Float64Array(ND); it = 0; losses = []; seeds = rng(5);
      step(); draw();
    }
    function knot(d) { var p = (d + DMAX) / (2 * DMAX) * (ND - 1); return p < 0 || p > ND - 1 ? null : [Math.min(ND - 2, Math.floor(p)), p - Math.min(ND - 2, Math.floor(p))]; }
    function explain(u, xh) { return XS.map(function (x, j) { var h = knot(x - xh); return h ? u[j] * (theta[h[0]] * (1 - h[1]) + theta[h[0] + 1] * h[1]) : 0; }); }

    function step() {
      var r = rng(Math.floor(seeds() * 4294967296)), u = heatState(Math.floor(r() * 1e9));
      // 6 to 12 nodes, one per equal bin, jittered within the bin
      var n = 6 + Math.floor(r() * 7), nodes = [];
      for (var i = 0; i < n; i++) nodes.push((i + 0.25 + 0.5 * r()) / n);
      var inS = nodes.map(function () { return r() < 0.5; }), xh = 0.05 + 0.9 * r(), b = [];
      for (i = 1; i < n; i++) b.push((nodes[i - 1] + nodes[i]) / 2);
      var act = activation(b, inS.map(Number), XS);
      var cell = XS.map(function (x) { var c = 0; while (c < n - 1 && x > b[c]) c++; return c; });
      var masked = times(u, act), nu = value(masked, xh);
      var grad = new Float64Array(ND), pred = 0;
      for (var j = 0; j < N; j++) {
        var h = knot(XS[j] - xh);
        if (!inS[cell[j]] || !h) continue;
        var w = u[j] * DX * (j === 0 || j === N - 1 ? 0.5 : 1);
        pred += w * (theta[h[0]] * (1 - h[1]) + theta[h[0] + 1] * h[1]);
        grad[h[0]] += w * (1 - h[1]); grad[h[0] + 1] += w * h[1];
      }
      var err = pred - nu;
      it++; losses.push(err * err);
      for (var q = 0; q < ND; q++) {
        var gq = 2 * err * grad[q];
        m1[q] = 0.9 * m1[q] + 0.1 * gq; m2[q] = 0.999 * m2[q] + 0.001 * gq * gq;
        theta[q] -= LR * (m1[q] / (1 - Math.pow(0.9, it))) / (Math.sqrt(m2[q] / (1 - Math.pow(0.999, it))) + 1e-8);
      }
      st = { u: u, nodes: nodes, inS: inS, xh: xh, b: b, cell: cell, masked: masked, nu: nu, pred: pred, loss: err * err };
    }


    // rows of [left parts, right parts, left class, right class], aligned at the start of the right parts; a part '_S' is a subscript
    function equations(g, xe, y, rows) {
      rows.forEach(function (r, i) {
        [[r[0], xe - 6, 'end', r[2]], [r[1], xe, 'start', r[3]]].forEach(function (c) {
          var t = text(g, c[1], y + 16 * i, '', { 'text-anchor': c[2], class: 'halo ' + (c[3] || ''), 'xml:space': 'preserve', style: 'font-size: 12px' });
          c[0].forEach(function (p) {
            if (p[0] === '_') svgEl('tspan', { 'baseline-shift': 'sub', style: 'font-size: 9px' }, t).textContent = p.slice(1);
            else t.append(p);
          });
        });
      });
    }

    function draw() {
      [A, B, C, D].forEach(function (p) { clear(p.g); });
      var edges = [0].concat(st.b, [1]);
      edges.slice(1).forEach(function (e, c) {
        var x0 = sx(edges[c]), w = sx(e) - x0;
        if (c % 2) svgEl('rect', { x: x0, y: A.y1, width: w, height: A.y0 - A.y1, class: 'cell-band' }, A.g);
        if (st.inS[c]) svgEl('rect', { x: x0, y: C.y1, width: w, height: C.y0 - C.y1, class: 'cell-in' }, C.g);
      });
      svgEl('line', { x1: A.x0, x2: A.x1, y1: sy(0), y2: sy(0), class: 'axis-faint' }, A.g);
      curve(A.g, sx, sy, XS, st.u, 'line-ink');
      st.nodes.forEach(function (x, c) {
        svgEl('circle', { cx: sx(x), cy: sy(0), r: 3.5, class: st.inS[c] ? 'dot-cal' : 'dot-open' }, A.g);
        text(A.g, sx(x), sy(0) + 16, 'x' + sub(c + 1), { 'text-anchor': 'middle', class: 'halo' + (st.inS[c] ? ' node-in' : '') });
      });
      marker(A, A.g, sx, st.xh);

      var f0 = bias(st.xh);
      svgEl('line', { x1: B.x0, x2: B.x1, y1: sy(0), y2: sy(0), class: 'axis-faint' }, B.g);
      curve(B.g, sx, sy, XS, st.masked, 'line-cal', { 'stroke-width': 2.4 });
      curve(B.g, sx, sy, PX, PX.map(bias), 'line-test faint');
      curve(B.g, sx, sy, PX, PX.map(function (x) { return value(st.masked, x) + bias(x); }), 'line-test', { 'stroke-width': 1.6 });
      marker(B, B.g, sx, st.xh);
      svgEl('line', { x1: sx(st.xh), x2: sx(st.xh), y1: sy(f0), y2: sy(f0 + st.nu), class: 'line-diff' }, B.g);
      [f0, f0 + st.nu].forEach(function (v) { svgEl('circle', { cx: sx(st.xh), cy: sy(v), r: 3.5, class: 'dot-test' }, B.g); });
      var right = st.xh < 0.7;
      text(B.g, sx(st.xh) + (right ? 6 : -6), B.y1 + 14, 'ν(S) = ' + st.nu.toFixed(3), { 'text-anchor': right ? 'start' : 'end', class: 'label-test mono' });

      var phi = explain(st.u, st.xh);
      svgEl('line', { x1: C.x0, x2: C.x1, y1: syC(0), y2: syC(0), class: 'axis' }, C.g);
      signedArea(C.g, sx, syC, phi);
      curve(C.g, sx, syC, XS, attribution(st.u, st.xh), 'line-dash');
      marker(C, C.g, sx, st.xh);
      st.nodes.forEach(function (x, c) { svgEl('circle', { cx: sx(x), cy: syC(0), r: 3.5, class: st.inS[c] ? 'dot-cal' : 'dot-open' }, C.g); });
      var num = function (v) { return (v < 0 ? '−' : ' ') + Math.abs(v).toFixed(3); };
      equations(C.g, C.x1 - 62, C.y0 - 26, [[['∫', '_S', ' φ̂'], ['= ' + num(st.pred)], '', 'mono'], [['ν(S)'], ['= ' + num(st.nu)], 'label-test', 'mono label-test']]);
      var avg = losses.map(function (v, i) { var a = losses.slice(Math.max(0, i - 49), i + 1); return a.reduce(function (s, x) { return s + x; }, 0) / a.length; });
      var xmax = Math.max(100, it), sxD = lin(1, xmax, D.x0, D.x1), syD = lin(-5, 0, D.y0, D.y1);
      axes(D, sxD, syD, [1, Math.round(xmax / 2), xmax], [-5, -4, -3, -2, -1, 0], 'iteration');
      // y tick labels are log10 values, shown as powers of ten
      D.axes.querySelectorAll('text[text-anchor="end"]').forEach(function (t) { if (t.textContent !== 'iteration') t.textContent = '10' + sup(t.textContent); });
      line(D.g, avg.map(function (v, i) { return [sxD(i + 1), syD(clamp(Math.log10(v), -5, 0))]; }), 'line-test');
      var nuStr = st.nu < 0 ? '(−' + (-st.nu).toFixed(3) + ')' : st.nu.toFixed(3), e = st.loss.toExponential(1).split('e');
      equations(D.g, D.x1 - 145, D.y1 + 6, [[['loss'], ['= (∫', '_S', ' φ̂ − ν(S))²']], [[], ['= (' + st.pred.toFixed(3).replace('-', '−') + ' − ' + nuStr + ')²']],
        [[], ['= ' + e[0] + '·10' + sup(+e[1])]]]);
      m.out.textContent = 'iteration ' + it + '  ·  ' + st.nodes.length + ' nodes, ' + st.inS.filter(Boolean).length + ' in S';
    }

    var raf = 0;
    button(m.ctrl, 'next iteration', function () { if (!raf) { step(); draw(); } });
    var train = button(m.ctrl, 'train 500 iterations', function () {
      if (raf) return;
      var left = 500;
      train.disabled = true;
      raf = requestAnimationFrame(function tick() {
        for (var i = 0; i < 5 && left > 0; i++, left--) step();
        draw();
        raf = left > 0 ? requestAnimationFrame(tick) : (train.disabled = false, 0);
      });
    });
    button(m.ctrl, 'reset explainer', function () { cancelAnimationFrame(raf); raf = 0; train.disabled = false; reset(); });
    reset();
  }

  [figMeshes, figHeat, figAttr, figGame, figTrain].forEach(function (f) { f(); });
})();
