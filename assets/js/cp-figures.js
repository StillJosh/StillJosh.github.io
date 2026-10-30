// Interactive figures for the note "Conformal prediction for time-dependent PDEs".
// Each figure fills a <figure class="viz" id="viz-..."> placed in the post.
(function () {
  'use strict';

  var V = window.Viz;
  var svgEl = V.svgEl, text = V.text, clear = V.clear, lin = V.lin, clamp = V.clamp, path = V.path, range = V.range, normal = V.normal;
  var mount = V.mount, panel = V.panel, axes = V.axes, legend = V.legend, slider = V.slider, button = V.button;

  // standard normal cdf (Abramowitz-Stegun 7.1.26), its inverse (Acklam) and Gaussian density
  function Phi(x) {
    var t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
    var y = 1 - t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429)))) * Math.exp(-x * x / 2);
    return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
  }
  function PhiInv(p) {
    var a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
    var b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
    var c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
    var d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
    var q, r;
    if (p < 0.02425 || p > 0.97575) {
      q = Math.sqrt(-2 * Math.log(p < 0.5 ? p : 1 - p));
      r = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
      return p < 0.5 ? r : -r;
    }
    q = p - 0.5; r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  function pdf(x, m, s) { return Math.exp(-0.5 * Math.pow((x - m) / s, 2)) / (s * Math.sqrt(2 * Math.PI)); }
  function tvShift(m) { return 2 * Phi(m / 2) - 1; }  // TV between Gaussians with equal covariance, Mahalanobis distance m
  function pct(v) { return (100 * v).toFixed(0) + '%'; }

  // prediction f(x) on [0,1] with a band of half-width `base`, widened to `wide` (orange) or narrowed (dashed base)
  function bandPanel(p) {
    var sx = lin(0, 1, p.x0, p.x1), sy = lin(-1.5, 1.5, p.y0, p.y1);
    axes(p, sx, sy, [0, 0.5, 1], null, 'x');
    var xs = range(0, 1, 101);
    var f = function (x) { return 0.55 * Math.sin(2 * Math.PI * x) + 0.25 * Math.sin(5 * Math.PI * x + 0.6); };
    var Y = function (v) { return clamp(sy(v), p.y1, p.y0); };
    function area(lo, hi, cls) {
      var up = xs.map(function (x) { return [sx(x), Y(f(x) + hi)]; });
      var dn = xs.slice().reverse().map(function (x) { return [sx(x), Y(f(x) + lo)]; });
      svgEl('path', { d: path(up.concat(dn)) + 'Z', class: cls }, p.g);
    }
    function curve(off, cls) { svgEl('path', { d: path(xs.map(function (x) { return [sx(x), Y(f(x) + off)]; })), class: cls }, p.g); }
    return function draw(base, wide) {
      clear(p.g);
      if (!isFinite(wide)) {
        svgEl('rect', { x: p.x0, y: p.y1, width: p.x1 - p.x0, height: p.y0 - p.y1, class: 'fill-test' }, p.g);
        text(p.g, (p.x0 + p.x1) / 2, p.y1 + 16, 'band is infinite', { 'text-anchor': 'middle', class: 'label-test' });
      } else {
        if (wide > base) { area(base, wide, 'fill-test'); area(-wide, -base, 'fill-test'); }
        area(-Math.min(base, wide), Math.min(base, wide), 'fill-cal');
        if (wide < base) { curve(base, 'line-dash'); curve(-base, 'line-dash'); }
      }
      curve(0, 'line-ink');
    };
  }

  // two Gaussian densities N(0,1) and N(mu,1) on a shared x axis
  function gaussPanel(p, xmin, xmax) {
    var sx = lin(xmin, xmax, p.x0, p.x1), sy = lin(0, 0.46, p.y0, p.y1);
    axes(p, sx, sy, [-2, 0, 2, 4], null, 'x');
    legend(p, [['calibration', 'label-cal'], ['test', 'label-test']]);
    var xs = range(xmin, xmax, 241);
    return {
      sx: sx, sy: sy, xs: xs,
      curves: function (mu) {
        svgEl('path', { d: path(xs.map(function (x) { return [sx(x), sy(pdf(x, 0, 1))]; })), class: 'line-cal' }, p.g);
        svgEl('path', { d: path(xs.map(function (x) { return [sx(x), sy(pdf(x, mu, 1))]; })), class: 'line-test' }, p.g);
      }
    };
  }

  // ---------- figure 1: heat equation, function vs. grid ----------
  function figHeat() {
    var m = mount('viz-heat'); if (!m) return;
    var L = panel(m.panels, 'function u(x, t)');
    var R = panel(m.panels, 'vector uᵗ on 11 grid points');
    var K = 64, NU = 0.003, T = 10, seed = 1;
    var xs = range(0, 1, 201), grid = range(0, 1, 11);
    var sx = lin(0, 1, L.x0, L.x1), sy = lin(-1.2, 1.2, L.y0, L.y1);
    axes(L, sx, sy, [0, 0.5, 1], [-1, 0, 1], 'x');
    axes(R, sx, sy, [0, 0.5, 1], [-1, 0, 1], 'x');
    var coef = [];

    // u(x,t) = sum_k a_k exp(-nu k^2 pi^2 t) sin(k pi x), initial a_k ~ N(0, 1/(1 + k^2 pi^2))
    function u(x, t) {
      var s = 0;
      for (var k = 1; k <= K; k++) s += coef[k] * Math.exp(-NU * k * k * Math.PI * Math.PI * t) * Math.sin(k * Math.PI * x);
      return s;
    }
    function sample() {
      var g = normal(seed++);
      coef = [0];
      for (var k = 1; k <= K; k++) coef.push(g() / Math.sqrt(1 + k * k * Math.PI * Math.PI));
      var mx = Math.max.apply(null, xs.map(function (x) { return Math.abs(u(x, 0)); }));
      coef = coef.map(function (a) { return a / mx; });
      draw();
    }
    function line(g, pts, cls, extra) { svgEl('path', Object.assign({ d: path(pts), class: cls }, extra || {}), g); }
    function draw() {
      var t = +time.value, step = Math.floor(t + 1e-9);
      clear(L.g); clear(R.g);
      line(L.g, xs.map(function (x) { return [sx(x), sy(u(x, 0))]; }), 'line-grey');
      line(L.g, xs.map(function (x) { return [sx(x), sy(u(x, t))]; }), 'line-cal');
      text(L.g, L.x1, L.y1 + 4, 't = ' + t.toFixed(2), { 'text-anchor': 'end', class: 'mono' });
      for (var s = 0; s < step; s++) {
        line(R.g, grid.map(function (x) { return [sx(x), sy(u(x, s))]; }), 'line-grey', { opacity: (0.25 + 0.5 * (s + 1) / step).toFixed(2) });
      }
      var cur = grid.map(function (x) { return [sx(x), sy(u(x, step))]; });
      line(R.g, cur, 'line-cal');
      cur.forEach(function (c) { svgEl('circle', { cx: c[0], cy: c[1], r: 3.2, class: 'dot-cal' }, R.g); });
      text(R.g, R.x1, R.y1 + 4, 't = ' + step, { 'text-anchor': 'end', class: 'mono' });
    }

    var raf = 0;
    var time = slider(m.ctrl, 'time t', 0, T, 0.01, 0, function () { stop(); draw(); });
    var play = button(m.ctrl, 'play', function () {
      if (raf) return stop();
      if (+time.value >= T) time.value = 0;
      play.textContent = 'pause';
      var last = performance.now();
      raf = requestAnimationFrame(function tick(now) {
        time.value = Math.min(T, +time.value + (now - last) / 1000 * 1.5);
        last = now; draw();
        raf = +time.value < T ? requestAnimationFrame(tick) : (stop(), 0);
      });
    });
    function stop() { cancelAnimationFrame(raf); raf = 0; play.textContent = 'play'; }
    button(m.ctrl, 'new sample', sample);
    sample();
  }

  // ---------- figure 2: TV distance and widened bands ----------
  function figTV() {
    var m = mount('viz-tv'); if (!m) return;
    var L = panel(m.panels, 'densities');
    var R = panel(m.panels, 'prediction band');
    var G = gaussPanel(L, -3.5, 6);
    var band = bandPanel(R);
    var SIGMA = 0.15, ALPHA = 0.1;
    var q = function (level) { return level >= 1 ? Infinity : SIGMA * PhiInv((1 + level) / 2); };

    function draw() {
      var mu = +shift.value, tv = tvShift(mu);
      clear(L.g);
      // test density exceeds calibration density for x > mu/2; that area is the TV distance
      var right = G.xs.filter(function (x) { return x >= mu / 2; });
      var up = right.map(function (x) { return [G.sx(x), G.sy(pdf(x, mu, 1))]; });
      var dn = right.slice().reverse().map(function (x) { return [G.sx(x), G.sy(pdf(x, 0, 1))]; });
      if (right.length) svgEl('path', { d: path(up.concat(dn)) + 'Z', class: 'fill-test' }, L.g);
      G.curves(mu);
      text(L.g, G.sx(mu / 2 + 1.6), G.sy(0.43), 'TV = ' + tv.toFixed(2), { class: 'label-test mono' });
      var level = 1 - ALPHA + 2 * tv;
      band(q(1 - ALPHA), q(level));
      text(R.g, R.x1, R.y0 - 6, level >= 1 ? 'quantile level ≥ 100%' : 'quantile level ' + pct(level), { 'text-anchor': 'end', class: 'mono' });
    }
    var shift = slider(m.ctrl, 'shift μ', 0, 0.3, 0.001, 0.05, draw);
    draw();
  }

  // ---------- figure 3: function space limit ----------
  function figSingular() {
    var m = mount('viz-singular'); if (!m) return;
    var L = panel(m.panels, 'variance ratio per mode, t + δ vs. t');
    var R = panel(m.panels, 'TV distance vs. grid points p');
    var P = 100, N = 2000;
    var z2 = new Float64Array(N * P), g = normal(7);
    for (var i = 0; i < N * P; i++) { var z = g(); z2[i] = z * z; }
    var sxR = lin(0, P, R.x0, R.x1), syR = lin(0, 1.05, R.y0, R.y1);
    axes(R, sxR, syR, [1, 25, 50, 75, 100], [0, 0.5, 1], 'p');
    var syL = lin(0, 1, L.y0, L.y1);
    var tvs = [];

    // eigenvalues of the discrete Dirichlet Laplacian on p interior points
    function lam(k, p) { var h = 1 / (p + 1); return 4 / (h * h) * Math.pow(Math.sin(k * Math.PI * h / 2), 2); }

    // TV = E_P[(1 - q/p)_+]; per mode the log likelihood ratio is -log(r)/2 - z^2 (1/r - 1)/2 with r = exp(-2 lam delta)
    function tvAt(p, delta) {
      var a = new Float64Array(p), b = new Float64Array(p), sa = 0;
      for (var k = 0; k < p; k++) {
        var e = 2 * lam(k + 1, p) * delta;
        a[k] = e / 2; sa += a[k];
        b[k] = Math.min((Math.exp(e) - 1) / 2, 1e300);
      }
      var acc = 0;
      for (var s = 0; s < N; s++) {
        var l = sa, o = s * P;
        for (k = 0; k < p; k++) l -= b[k] * z2[o + k];
        acc += Math.max(0, 1 - Math.exp(l));
      }
      return acc / N;
    }

    var lastDelta = null;
    function draw() {
      var delta = Math.pow(10, +dsl.value), p = +psl.value;
      if (delta !== lastDelta) {
        tvs = [];
        for (var q = 1; q <= P; q++) tvs.push(tvAt(q, delta));
        lastDelta = delta;
      }
      clear(L.g); clear(R.g);
      var sxL = lin(0.5, p + 0.5, L.x0, L.x1);
      axes(L, sxL, syL, p > 1 ? [1, p] : [1], [0, 0.5, 1], 'mode k');
      var bw = Math.max(1, (L.x1 - L.x0) / p - (p > 40 ? 0.5 : 2));
      for (var k = 1; k <= p; k++) {
        var r = Math.exp(-2 * lam(k, p) * delta);
        svgEl('rect', { x: sxL(k) - bw / 2, y: syL(r), width: bw, height: syL(0) - syL(r), class: 'bar-cal' }, L.g);
      }
      svgEl('line', { x1: R.x0, x2: R.x1, y1: syR(1), y2: syR(1), class: 'line-dash' }, R.g);
      text(R.g, R.x1, syR(1) - 5, 'function space, p → ∞', { 'text-anchor': 'end' });
      svgEl('path', { d: path(tvs.map(function (v, i) { return [sxR(i + 1), syR(v)]; })), class: 'line-test' }, R.g);
      var tv = tvs[p - 1];
      svgEl('circle', { cx: sxR(p), cy: syR(tv), r: 4, class: 'dot-test' }, R.g);
      m.out.textContent = 'δ = ' + delta.toExponential(1) + ', p = ' + p + ' grid points  →  TV ≈ ' + tv.toFixed(3) + '   (function space: TV = 1)';
    }
    var dsl = slider(m.ctrl, 'time gap δ', -5, -1, 0.01, -4, draw);
    var psl = slider(m.ctrl, 'grid points p', 1, P, 1, 50, draw);
    draw();
  }

  // ---------- figure 4: weighted conformal prediction ----------
  function figWCP() {
    var m = mount('viz-wcp'); if (!m) return;
    var L = panel(m.panels, 'calibration points and test point');
    var R = panel(m.panels, 'prediction for the test point');
    var G = gaussPanel(L, -3.5, 5);
    var band = bandPanel(R);
    var MU = 1.5, n = 200, ALPHA = 0.1, SIGMA = 0.15;
    var gx = normal(11), gs = normal(12), cal = [];
    for (var i = 0; i < n; i++) cal.push({ x: gx(), s: SIGMA * Math.abs(gs()) });
    cal.sort(function (a, b) { return a.s - b.s; });
    var base = cal[Math.ceil((n + 1) * (1 - ALPHA)) - 1].s;
    var ratio = function (x) { return Math.exp(MU * x - MU * MU / 2); };

    function draw() {
      var xt = +xsl.value, rt = ratio(xt);
      var tot = rt + cal.reduce(function (s, c) { return s + ratio(c.x); }, 0);
      var wt = rt / tot, wide = Infinity, cum = 0, wmax = 0;
      cal.forEach(function (c) { wmax = Math.max(wmax, ratio(c.x) / tot); });
      for (var k = 0; k < n; k++) { cum += ratio(cal[k].x) / tot; if (cum >= 1 - ALPHA) { wide = cal[k].s; break; } }
      clear(L.g);
      G.curves(MU);
      cal.forEach(function (c) {
        var h = 3 + 34 * ratio(c.x) / tot / wmax;
        svgEl('line', { x1: G.sx(c.x), x2: G.sx(c.x), y1: L.y0, y2: L.y0 - h, class: 'tick-cal' }, L.g);
      });
      svgEl('line', { x1: G.sx(xt), x2: G.sx(xt), y1: L.y0, y2: L.y1 + 22, class: 'line-test' }, L.g);
      svgEl('circle', { cx: G.sx(xt), cy: L.y0, r: 4.5, class: 'dot-test' }, L.g);
      text(L.g, G.sx(xt) + (xt > 2.5 ? -6 : 6), L.y1 + 30, 'test point', { 'text-anchor': xt > 2.5 ? 'end' : 'start', class: 'label-test' });
      band(base, wide);
      text(R.g, R.x1, R.y0 - 6, 'test point x = ' + xt.toFixed(2), { 'text-anchor': 'end', class: 'label-test mono' });
      m.out.textContent = 'likelihood ratio ' + rt.toFixed(2) + '  ·  test weight ' + wt.toFixed(3) +
        (wt > ALPHA ? ' > α = 0.1  →  band is infinite' : ' ≤ α = 0.1  →  band ±' + wide.toFixed(3) + ' (unweighted ±' + base.toFixed(3) + ')');
    }
    var xsl = slider(m.ctrl, 'test point location', -3, 4.5, 0.01, 0, draw);
    draw();
  }

  // ---------- figure 5: drift direction vs. covariance ----------
  function figDrift() {
    var m = mount('viz-drift'); if (!m) return;
    var L = panel(m.panels, 'calibration and test distribution');
    var R = panel(m.panels, 'TV distance');
    var TH = Math.PI / 6, S1 = 1.5, S2 = 0.4;
    var c = Math.cos(TH), s = Math.sin(TH);
    // inverse covariance R diag(1/S1^2, 1/S2^2) R^T and marginal variance of u1
    var i11 = c * c / (S1 * S1) + s * s / (S2 * S2), i22 = s * s / (S1 * S1) + c * c / (S2 * S2), i12 = c * s * (1 / (S1 * S1) - 1 / (S2 * S2));
    var v11 = c * c * S1 * S1 + s * s * S2 * S2;
    var sx = lin(-3.4, 3.4, L.x0, L.x1), sy = lin(-2, 2, L.y0, L.y1), unit = sx(1) - sx(0);
    axes(L, sx, sy, [-3, -2, -1, 0, 1, 2, 3], [-2, -1, 0, 1, 2], 'u₁');
    text(L.axes, L.x0 + 4, L.y1 + 2, 'u₂');
    var clip = svgEl('clipPath', { id: 'viz-drift-clip' }, L.svg);
    svgEl('rect', { x: L.x0, y: L.y1, width: L.x1 - L.x0, height: L.y0 - L.y1 }, clip);
    L.g.setAttribute('clip-path', 'url(#viz-drift-clip)');

    function ellipses(cx, cy, cls) {
      [1, 2].forEach(function (k) {
        svgEl('ellipse', { cx: sx(cx), cy: sy(cy), rx: k * S1 * unit, ry: k * S2 * unit,
          transform: 'rotate(' + (-TH * 180 / Math.PI) + ' ' + sx(cx) + ' ' + sy(cy) + ')', class: cls }, L.g);
      });
    }
    function bar(y, label, tv) {
      var bx = lin(0, 1, R.x0 + 4, R.x1 - 4);
      text(R.g, R.x0 + 4, y - 8, label);
      svgEl('rect', { x: bx(0), y: y, width: bx(1) - bx(0), height: 18, class: 'bar-track' }, R.g);
      svgEl('rect', { x: bx(0), y: y, width: bx(tv) - bx(0), height: 18, class: 'bar-test' }, R.g);
      text(R.g, bx(1), y - 8, 'TV = ' + tv.toFixed(2), { 'text-anchor': 'end', class: 'mono' });
    }

    function draw() {
      var a = +dir.value * Math.PI / 180, len = +lsl.value;
      var dx = len * Math.cos(a), dy = len * Math.sin(a);
      var maha = Math.sqrt(dx * dx * i11 + 2 * dx * dy * i12 + dy * dy * i22);
      var full = tvShift(maha), u1 = tvShift(Math.abs(dx) / Math.sqrt(v11));
      clear(L.g); clear(R.g);
      ellipses(0, 0, 'ell-cal');
      ellipses(dx, dy, 'ell-test');
      if (len > 0.05) {
        var ex = sx(dx) - 7 * Math.cos(a), ey = sy(dy) + 7 * Math.sin(a);
        svgEl('line', { x1: sx(0), y1: sy(0), x2: ex, y2: ey, class: 'arrow' }, L.g);
        svgEl('path', { d: 'M' + sx(dx) + ',' + sy(dy) + 'l' + (-10 * Math.cos(a - 0.4)) + ',' + (10 * Math.sin(a - 0.4)) +
          'l' + (10 * Math.cos(a - 0.4) - 10 * Math.cos(a + 0.4)) + ',' + (-10 * Math.sin(a - 0.4) + 10 * Math.sin(a + 0.4)) + 'Z', class: 'arrow-head' }, L.g);
      }
      svgEl('circle', { cx: sx(dx), cy: sy(dy), r: 6, class: 'dot-test' }, L.g);
      bar(R.y1 + 56, 'bands for u₁ and u₂', full);
      bar(R.y1 + 126, 'bands for u₁ only', u1);
    }

    V.draggable(L.svg, function (v) {
      var dx = (v.x - sx(0)) / unit, dy = -(v.y - sy(0)) / unit;
      dir.value = (Math.round(Math.atan2(dy, dx) * 180 / Math.PI) + 360) % 360;
      lsl.value = Math.min(1.5, Math.hypot(dx, dy));
      draw();
    });

    var dir = slider(m.ctrl, 'direction', 0, 359, 1, 30, draw);
    var lsl = slider(m.ctrl, 'drift length', 0, 1.5, 0.01, 0.3, draw);
    button(m.ctrl, 'along wide axis', function () { dir.value = 30; draw(); });
    button(m.ctrl, 'along narrow axis', function () { dir.value = 120; draw(); });
    draw();
  }

  [figHeat, figTV, figSingular, figWCP, figDrift].forEach(function (f) { f(); });
})();
