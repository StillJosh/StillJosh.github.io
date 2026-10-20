// Particles with short fading trails moving at constant speed U along a meandering
// direction theta = a cos(k x - w t) cos(m y). Draws into <canvas id="flow">.
(function () {
  var c = document.getElementById('flow');
  if (!c) return;
  var ctx = c.getContext('2d');
  var dpr = window.devicePixelRatio || 1;
  var W = 0, H = 0;
  function resize() {
    W = c.clientWidth; H = c.clientHeight;
    c.width = W * dpr; c.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize);

  var N = W < 600 ? 30 : 60;                    // particle count
  var L = 260, U = 40, a = 0.5, k = 2.0, m = 2.4, om = 0.6, TAIL = 45;
  var ALPHA = 0.28;                             // max trail opacity
  var GREEN = '45,106,79';                      // accent colour

  function vel(x, y, t) {
    var th = a * Math.cos(k * x / L - om * t) * Math.cos(m * y / L);
    return [U * Math.cos(th), U * Math.sin(th)];
  }
  function spawn(p, anywhere) {
    p.x = anywhere ? Math.random() * W : -40 * Math.random();
    p.y = Math.random() * H; p.tr = []; p.age = anywhere ? 2 : 0;
    p.rgb = GREEN;
  }
  var P = [];
  for (var i = 0; i < N; i++) { var p = {}; spawn(p, true); P.push(p); }

  var t = 0, dt = 1 / 60, RATE = 120, raf = 0, visible = true, last = 0, acc = 0;  // RATE: simulation steps per real second
  function advance() {
    for (var j = 0; j < P.length; j++) {
      var q = P[j], v = vel(q.x, q.y, t);
      q.x += dt * v[0]; q.y += dt * v[1]; q.age += dt;
      q.tr.push([q.x, q.y]); if (q.tr.length > TAIL) q.tr.shift();
      if (q.x > W + 40 || q.y < -40 || q.y > H + 40) spawn(q, false);
    }
    t += dt;
  }
  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.lineWidth = 1; ctx.lineCap = 'round';
    for (var j = 0; j < P.length; j++) {
      var q = P[j], life = Math.min(1, q.age / 1.5);
      for (var s = 1; s < q.tr.length; s++) {
        ctx.strokeStyle = 'rgba(' + q.rgb + ',' + (ALPHA * life * s / q.tr.length).toFixed(3) + ')';
        ctx.beginPath(); ctx.moveTo(q.tr[s - 1][0], q.tr[s - 1][1]); ctx.lineTo(q.tr[s][0], q.tr[s][1]); ctx.stroke();
      }
    }
  }
  function loop(now) {
    acc = Math.min(acc + (last ? (now - last) / 1000 * RATE : 1), 8);
    last = now;
    for (; acc >= 1; acc--) advance();
    draw();
    raf = requestAnimationFrame(loop);
  }
  function start() { cancelAnimationFrame(raf); last = 0; raf = requestAnimationFrame(loop); }

  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    for (var r = 0; r < 120; r++) advance();    // one still frame
    draw();
    return;
  }
  // pause when the header is off screen or the tab is hidden
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (e) {
      visible = e[0].isIntersecting;
      cancelAnimationFrame(raf); if (visible && !document.hidden) start();
    }).observe(c);
  } else { start(); }
  document.addEventListener('visibilitychange', function () {
    cancelAnimationFrame(raf); if (visible && !document.hidden) start();
  });
})();
