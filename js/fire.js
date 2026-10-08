/*
 * FireStage — lightweight particle fire on a full-screen <canvas>.
 *
 * Layers drawn each frame (back → front):
 *   background glow · smoke · main fire wall (wave) · flames · ember sparks · ash · golden dust
 *
 *   const fire = new FireStage(canvas)
 *   fire.burn({ getRavanRect, getChitRects, onFrame }) → Promise (≈ 8.8 s cinematic sequence)
 *   fire.ambient(true|false)   gentle embers rising from the bottom
 *   fire.goldDust(true|false)  final-screen festive golden particles
 *   fire.emberBurst(x, y, n)   small burst (employee "drop" moment)
 */
(function () {
  // Burn timeline (seconds). Exported so the DOM side can stay in sync.
  var T = {
    STILL: 0,        // 0–1   stillness, eyes glow, first embers, chits flutter
    SMALL: 1.0,      // 1–2   small flames at the very bottom
    WAVE: 2.0,       // 2–2.9 fire wave surges up from below and hits Ravan
    CLIMB: 2.9,      // 2.9–5 front climbs mouth → cheeks → eyes → crown
    ENGULF: 5.0,     // 5–6.1 whole face engulfed, crown burning
    DISSOLVE: 6.1,   // 6.1–7.9 flames → embers → ash/smoke, Ravan disintegrates
    END: 7.9,        // 7.9–8.8 last embers die, dark screen
    DONE: 8.8,
    CHIT_START: 2.7, CHIT_END: 5.6
  };

  var RES = 0.7;          // render scale (fire is soft; lower res = smooth on projector laptops)
  var MAX_PARTICLES = 2800;

  function sprite(stops, size) {
    var c = document.createElement('canvas');
    c.width = c.height = size;
    var g = c.getContext('2d');
    var grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    stops.forEach(function (s) { grd.addColorStop(s[0], s[1]); });
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
    return c;
  }

  var SPR = null;
  function sprites() {
    if (SPR) return SPR;
    SPR = {
      hot: sprite([[0, 'rgba(255,255,235,1)'], [0.2, 'rgba(255,236,150,0.95)'], [0.45, 'rgba(255,170,40,0.55)'], [0.75, 'rgba(255,90,0,0.15)'], [1, 'rgba(255,60,0,0)']], 96),
      warm: sprite([[0, 'rgba(255,230,140,0.95)'], [0.3, 'rgba(255,160,30,0.75)'], [0.6, 'rgba(240,80,0,0.3)'], [1, 'rgba(200,40,0,0)']], 96),
      orange: sprite([[0, 'rgba(255,150,30,0.85)'], [0.35, 'rgba(230,80,10,0.55)'], [0.7, 'rgba(170,30,0,0.2)'], [1, 'rgba(120,10,0,0)']], 96),
      red: sprite([[0, 'rgba(210,60,10,0.6)'], [0.5, 'rgba(140,20,0,0.25)'], [1, 'rgba(80,0,0,0)']], 96),
      ember: sprite([[0, 'rgba(255,255,220,1)'], [0.25, 'rgba(255,200,80,0.9)'], [0.6, 'rgba(255,100,0,0.3)'], [1, 'rgba(255,60,0,0)']], 32),
      smoke: sprite([[0, 'rgba(70,58,58,0.55)'], [0.5, 'rgba(50,42,44,0.25)'], [1, 'rgba(30,26,28,0)']], 128),
      gold: sprite([[0, 'rgba(255,250,220,1)'], [0.25, 'rgba(255,215,100,0.85)'], [0.6, 'rgba(230,160,40,0.25)'], [1, 'rgba(200,120,20,0)']], 32)
    };
    return SPR;
  }

  function rand(a, b) { return a + Math.random() * (b - a); }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function seg(t, a, b) { return clamp01((t - a) / (b - a)); }
  function easeOutCubic(k) { return 1 - Math.pow(1 - k, 3); }
  function easeInOut(k) { return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; }

  function FireStage(canvas) {
    this.c = canvas;
    this.g = canvas.getContext('2d');
    this.p = [];
    this.time = 0;
    this.modes = { ambient: false, gold: false };
    this.burnState = null;
    this.running = false;
    this.last = 0;
    sprites();
    var self = this;
    this.resize();
    window.addEventListener('resize', function () { self.resize(); });
  }

  FireStage.T = T;

  FireStage.prototype.resize = function () {
    var w = window.innerWidth, h = window.innerHeight;
    this.W = w; this.H = h;
    this.c.width = Math.max(1, Math.round(w * RES));
    this.c.height = Math.max(1, Math.round(h * RES));
    this.c.style.width = w + 'px';
    this.c.style.height = h + 'px';
  };

  FireStage.prototype.kick = function () {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    var self = this;
    requestAnimationFrame(function loop(now) {
      var dt = Math.min(0.05, (now - self.last) / 1000);
      self.last = now;
      self.time += dt;
      self.step(dt);
      self.draw();
      if (self.p.length || self.modes.ambient || self.modes.gold || self.burnState) {
        requestAnimationFrame(loop);
      } else {
        self.g.clearRect(0, 0, self.c.width, self.c.height);
        self.running = false;
      }
    });
  };

  FireStage.prototype.add = function (o) {
    if (this.p.length >= MAX_PARTICLES) return;
    o.age = 0;
    o.seed = Math.random() * 1000;
    this.p.push(o);
  };

  // Emitters ---------------------------------------------------------------
  FireStage.prototype.flame = function (x, y, size, vy, life, spread) {
    this.add({ k: 'flame', x: x, y: y, vx: rand(-1, 1) * (spread || 30), vy: vy, life: life, size: size });
  };
  FireStage.prototype.ember = function (x, y, speed) {
    this.add({ k: 'ember', x: x, y: y, vx: rand(-40, 40), vy: -rand(40, speed || 220), life: rand(1.2, 3.2), size: rand(3, 7) });
  };
  FireStage.prototype.ash = function (x, y) {
    this.add({ k: 'ash', x: x, y: y, vx: rand(-30, 30), vy: rand(-90, -10), life: rand(2.2, 4), size: rand(2, 6), rot: rand(0, 6.28), vr: rand(-4, 4) });
  };
  FireStage.prototype.smoke = function (x, y) {
    this.add({ k: 'smoke', x: x, y: y, vx: rand(-15, 15), vy: rand(-70, -30), life: rand(2.5, 4), size: rand(90, 180) });
  };
  FireStage.prototype.gold = function (x, y) {
    this.add({ k: 'gold', x: x, y: y, vx: rand(-12, 12), vy: -rand(12, 45), life: rand(4, 8), size: rand(3, 8) });
  };

  FireStage.prototype.emit = function (rate, dt, fn) {
    var n = rate * dt;
    var whole = Math.floor(n);
    if (Math.random() < n - whole) whole++;
    for (var i = 0; i < whole; i++) fn.call(this);
  };

  FireStage.prototype.ambient = function (on) { this.modes.ambient = !!on; if (on) this.kick(); };
  FireStage.prototype.goldDust = function (on) { this.modes.gold = !!on; if (on) this.kick(); };
  FireStage.prototype.clear = function () { this.p.length = 0; this.burnState = null; };

  FireStage.prototype.emberBurst = function (x, y, n) {
    for (var i = 0; i < (n || 40); i++) {
      var a = rand(-Math.PI, 0), s = rand(60, 260);
      this.add({ k: 'ember', x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.6, 1.6), size: rand(2, 5) });
    }
    for (var j = 0; j < 14; j++) this.flame(x + rand(-14, 14), y, rand(14, 30), -rand(60, 160), rand(0.3, 0.6), 20);
    this.kick();
  };

  /* The cinematic burn. opts.getRavanRect() → {left,right,top,bottom,fullLeft,fullRight}
     opts.getChitRects() → [DOMRect]  opts.onFrame(state) called each frame. */
  FireStage.prototype.burn = function (opts) {
    var self = this;
    return new Promise(function (resolve) {
      self.burnState = { t: 0, opts: opts, resolve: resolve, chitsGone: false, rv: opts.getRavanRect(), chits: opts.getChitRects() };
      self.kick();
    });
  };

  /* x position inside the Ravan silhouette at screen height y: crown narrow, face wide, side heads mid-height */
  FireStage.prototype.faceX = function (rv, y) {
    var v = clamp01((y - rv.top) / (rv.bottom - rv.top));
    var cx = (rv.left + rv.right) / 2;
    var hw = (rv.right - rv.left) * 0.85 * (0.4 + 0.6 * Math.sin(Math.PI * Math.min(1, 0.15 + v * 0.9)));
    // side heads span almost the full width between ~30% and ~75% of the height
    if (v > 0.3 && v < 0.76 && Math.random() < 0.55) hw = (rv.fullRight - rv.fullLeft) * 0.48;
    return cx + (Math.random() * 2 - 1) * hw;
  };

  FireStage.prototype.noise = function (x, t) {
    return Math.sin(x * 0.011 + t * 3.1) * 0.5 + Math.sin(x * 0.027 - t * 4.7) * 0.3 + Math.sin(x * 0.061 + t * 7.3) * 0.2;
  };

  FireStage.prototype.stepBurn = function (dt) {
    var b = this.burnState;
    b.t += dt;
    var t = b.t, W = this.W, H = this.H, rv = b.rv;
    var S = Math.max(0.6, W / 1600);
    var faceW = rv.right - rv.left, faceH = rv.bottom - rv.top;

    // --- fire wall (the rising wave) ---------------------------------------
    var wallTop = H + 40, wallAlpha = 0;
    if (t >= T.SMALL && t < T.WAVE) {
      wallTop = H - H * 0.07 * easeOutCubic(seg(t, T.SMALL, T.WAVE));
      wallAlpha = 0.55 * seg(t, T.SMALL, T.SMALL + 0.4);
    } else if (t >= T.WAVE && t < T.CLIMB) {
      var k = easeOutCubic(seg(t, T.WAVE, T.CLIMB));
      wallTop = (H - H * 0.07) + (rv.bottom - faceH * 0.08 - (H - H * 0.07)) * k;
      wallAlpha = 0.55 + 0.4 * k;
    } else if (t >= T.CLIMB && t < T.ENGULF) {
      var c = easeInOut(seg(t, T.CLIMB, T.ENGULF));
      wallTop = (rv.bottom - faceH * 0.08) + (rv.top - (rv.bottom - faceH * 0.08)) * c;
      wallAlpha = 0.95 - 0.6 * c;
    } else if (t >= T.ENGULF && t < T.DISSOLVE) {
      wallTop = rv.top - faceH * 0.1 * seg(t, T.ENGULF, T.DISSOLVE);
      wallAlpha = 0.35;
    } else if (t >= T.DISSOLVE) {
      var d = seg(t, T.DISSOLVE, T.END);
      wallTop = rv.top + (H - rv.top) * easeInOut(d);
      wallAlpha = 0.35 * (1 - d);
    }
    b.wallTop = wallTop; b.wallAlpha = wallAlpha;

    var climb = seg(t, T.CLIMB, T.ENGULF);
    var dissolve = seg(t, T.DISSOLVE, T.END);
    var chitBurn = easeInOut(seg(t, T.CHIT_START, T.CHIT_END));
    var front = t < T.CLIMB ? Math.max(wallTop, rv.bottom) : t < T.ENGULF ? wallTop : rv.top - 60;
    b.glow = t < T.SMALL ? 0.15 * seg(t, 0, T.SMALL) : t < T.DISSOLVE ? 0.15 + 0.55 * seg(t, T.SMALL, T.ENGULF) : 0.7 * (1 - dissolve);

    // --- emission ---------------------------------------------------------------
    if (t < T.SMALL) {
      this.emit(30 * S, dt, function () { this.ember(rand(0, W), H + 5, 160); });
      this.emit(12, dt, function () { this.ember(rand(rv.left, rv.right), rand(rv.top, rv.bottom), 90); });
    } else if (t < T.WAVE) {
      var grow = seg(t, T.SMALL, T.WAVE);
      this.emit((90 + 260 * grow) * S, dt, function () {
        this.flame(rand(-20, W + 20), H + 10, rand(24, 50) * (0.6 + grow), -rand(80, 220) * (0.6 + grow), rand(0.5, 0.95), 25);
      });
      this.emit(40 * S, dt, function () { this.ember(rand(0, W), H, 260); });
    } else if (t < T.DISSOLVE) {
      // wave front across the full width — the visible "wall of fire"
      var waveRate = t < T.CLIMB ? 1000 : 520 * (1 - climb * 0.5);
      this.emit(waveRate * S, dt, function () {
        var x = rand(-40, W + 40);
        var y = wallTop + this.noise(x, this.time) * 40 + rand(-10, 30);
        this.flame(x, y, rand(55, 115), -rand(380, 820), rand(0.45, 0.9), 50);
      });
      // base of the fire keeps roaring
      this.emit(160 * S, dt, function () { this.flame(rand(-20, W + 20), H + 20, rand(60, 120), -rand(250, 500), rand(0.5, 0.9), 40); });
      // flames on Ravan: everything below the front burns
      if (t >= T.CLIMB) {
        var engulf = seg(t, T.ENGULF, T.DISSOLVE);
        this.emit((520 + 1000 * engulf) * S, dt, function () {
          var y0 = engulf > 0 ? rv.top - 20 : Math.max(rv.top, front);
          var y = y0 + (engulf > 0 ? Math.random() : Math.pow(Math.random(), 1.6)) * (rv.bottom - y0);
          var x = this.faceX(rv, y);
          this.flame(x, y, rand(45, 105) * (1 + engulf * 0.4), -rand(170, 440), rand(0.45, 0.95), 55);
        });
      }
      this.emit(140 * S, dt, function () { this.ember(rand(rv.fullLeft, rv.fullRight), rand(Math.max(rv.top, front), rv.bottom + 40), 380); });
    } else if (t < T.END) {
      var fall = 1 - dissolve;
      this.emit(900 * fall * fall * S, dt, function () {
        var yy = rand(rv.top, rv.bottom);
        this.flame(this.faceX(rv, yy), yy, rand(40, 100) * fall + 20, -rand(160, 420), rand(0.4, 0.8), 40);
      });
      this.emit(360 * S, dt, function () { this.ember(rand(rv.fullLeft, rv.fullRight), rand(rv.top, rv.bottom), 320); });
      this.emit(160 * S, dt, function () { this.ash(rand(rv.fullLeft, rv.fullRight), rand(rv.top, rv.bottom)); });
      this.emit(22 * S, dt, function () { this.smoke(rand(rv.left, rv.right), rand(rv.top + faceH * 0.3, rv.bottom)); });
    }

    // chits: flames ride each paper's burn line; then they crumble into ash
    if (chitBurn > 0 && chitBurn < 1) {
      for (var i = 0; i < b.chits.length; i++) {
        var r = b.chits[i];
        var ly = r.bottom - chitBurn * r.height * 1.1;
        this.emit(16, dt, function () { this.flame(rand(r.left, r.right), ly + rand(-4, 8), rand(16, 34), -rand(90, 200), rand(0.3, 0.6), 18); });
        if (Math.random() < dt * 6) this.ember(rand(r.left, r.right), ly, 200);
      }
    }
    if (chitBurn >= 1 && !b.chitsGone) {
      b.chitsGone = true;
      for (var j = 0; j < b.chits.length; j++) {
        var q = b.chits[j];
        for (var m = 0; m < 10; m++) this.ash(rand(q.left, q.right), rand(q.top, q.top + q.height * 0.3));
        for (var n2 = 0; n2 < 8; n2++) this.ember(rand(q.left, q.right), rand(q.top, q.bottom), 260);
      }
    }

    if (b.opts.onFrame) b.opts.onFrame({ t: t, front: front, climb: climb, dissolve: dissolve, chitBurn: chitBurn, wallTop: wallTop });

    if (t >= T.DONE) {
      var res = b.resolve;
      this.burnState = null;
      res();
    }
  };

  FireStage.prototype.step = function (dt) {
    var W = this.W, H = this.H, t = this.time;
    if (this.burnState) this.stepBurn(dt);
    if (this.modes.ambient) this.emit(7 * Math.max(0.6, W / 1600), dt, function () { this.ember(rand(0, W), H + 5, 120); });
    if (this.modes.gold) this.emit(26 * Math.max(0.6, W / 1600), dt, function () { this.gold(rand(0, W), rand(H * 0.3, H + 10)); });

    var p = this.p;
    for (var i = p.length - 1; i >= 0; i--) {
      var o = p[i];
      o.age += dt / o.life;
      if (o.age >= 1) { p[i] = p[p.length - 1]; p.pop(); continue; }
      if (o.k === 'flame') {
        o.vy -= 260 * dt;
        o.vx += Math.sin(o.y * 0.02 + t * 6 + o.seed) * 260 * dt;
        o.vx *= 0.96;
      } else if (o.k === 'ember') {
        o.vy -= 30 * dt;
        o.vx += Math.sin(t * 3 + o.seed) * 80 * dt;
      } else if (o.k === 'ash') {
        o.vy += 22 * dt;
        o.vx += Math.sin(t * 2 + o.seed) * 30 * dt;
        o.rot += o.vr * dt;
      } else if (o.k === 'smoke') {
        o.vx += Math.sin(t + o.seed) * 6 * dt;
      } else if (o.k === 'gold') {
        o.vx += Math.sin(t * 0.8 + o.seed) * 8 * dt;
      }
      o.x += o.vx * dt;
      o.y += o.vy * dt;
    }
  };

  FireStage.prototype.draw = function () {
    var g = this.g, s = RES, W = this.W, H = this.H, b = this.burnState;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.c.width, this.c.height);
    g.setTransform(s, 0, 0, s, 0, 0);
    var spr = SPR, p = this.p, i, o;

    // 1. background glow from below
    if (b && b.glow > 0) {
      g.globalCompositeOperation = 'lighter';
      var rg = g.createRadialGradient(W / 2, H * 1.05, 0, W / 2, H * 1.05, Math.max(W, H) * 0.9);
      rg.addColorStop(0, 'rgba(255,120,20,' + (0.4 * b.glow) + ')');
      rg.addColorStop(0.5, 'rgba(200,50,0,' + (0.12 * b.glow) + ')');
      rg.addColorStop(1, 'rgba(120,10,0,0)');
      g.fillStyle = rg;
      g.fillRect(0, 0, W, H);
    }

    // 2. smoke (normal blending)
    g.globalCompositeOperation = 'source-over';
    for (i = 0; i < p.length; i++) {
      o = p[i];
      if (o.k !== 'smoke') continue;
      var sz = o.size * (0.6 + o.age * 1.4);
      g.globalAlpha = Math.sin(o.age * Math.PI) * 0.55;
      g.drawImage(spr.smoke, o.x - sz / 2, o.y - sz / 2, sz, sz);
    }
    g.globalAlpha = 1;

    // 3. the fire wall — a wave of flame rising from below
    if (b && b.wallAlpha > 0.01 && b.wallTop < H + 30) {
      g.globalCompositeOperation = 'lighter';
      var top = b.wallTop, tt = this.time;
      g.beginPath();
      g.moveTo(-20, H + 20);
      for (var x = -20; x <= W + 20; x += 24) {
        var n = this.noise(x, tt);
        var tongue = Math.max(0, Math.sin(x * 0.045 + tt * 9) * Math.sin(x * 0.013 - tt * 3)) * 70;
        g.lineTo(x, top + n * 38 - tongue);
      }
      g.lineTo(W + 20, H + 20);
      g.closePath();
      var span = Math.max(80, H - top);
      var lg = g.createLinearGradient(0, top - 60, 0, H);
      var a = b.wallAlpha;
      lg.addColorStop(0, 'rgba(255,240,170,' + (0.0) + ')');
      lg.addColorStop(Math.min(0.12, 60 / (span + 60)), 'rgba(255,220,120,' + (0.85 * a) + ')');
      lg.addColorStop(Math.min(0.3, 180 / (span + 60)), 'rgba(255,130,25,' + (0.42 * a) + ')');
      lg.addColorStop(Math.min(0.55, 420 / (span + 60)), 'rgba(200,50,0,' + (0.06 * a) + ')');
      lg.addColorStop(0.8, 'rgba(200,50,0,' + (0.04 * a) + ')');
      lg.addColorStop(1, 'rgba(255,110,10,' + (0.5 * a) + ')');
      g.fillStyle = lg;
      g.fill();
    }

    // 4. flames + embers + gold (additive)
    g.globalCompositeOperation = 'lighter';
    for (i = 0; i < p.length; i++) {
      o = p[i];
      if (o.k === 'flame') {
        var ag = o.age;
        var img = ag < 0.22 ? spr.hot : ag < 0.45 ? spr.warm : ag < 0.72 ? spr.orange : spr.red;
        var fs = o.size * (0.55 + ag * 0.9) * (1 - ag * 0.45);
        g.globalAlpha = Math.pow(1 - ag, 1.1);
        g.drawImage(img, o.x - fs / 2, o.y - fs / 2, fs, fs * 1.25);
      } else if (o.k === 'ember') {
        var es = o.size * 3 * (1 - o.age * 0.6);
        g.globalAlpha = (1 - o.age) * (0.65 + 0.35 * Math.sin(this.time * 20 + o.seed));
        g.drawImage(spr.ember, o.x - es / 2, o.y - es / 2, es, es);
      } else if (o.k === 'gold') {
        var gs = o.size * 3;
        g.globalAlpha = Math.sin(o.age * Math.PI) * (0.55 + 0.45 * Math.sin(this.time * 4 + o.seed));
        g.drawImage(spr.gold, o.x - gs / 2, o.y - gs / 2, gs, gs);
      }
    }

    // 5. ash flakes (normal blending)
    g.globalCompositeOperation = 'source-over';
    for (i = 0; i < p.length; i++) {
      o = p[i];
      if (o.k !== 'ash') continue;
      g.globalAlpha = Math.sin(o.age * Math.PI) * 0.8;
      g.save();
      g.translate(o.x, o.y);
      g.rotate(o.rot);
      g.fillStyle = o.age < 0.3 ? '#8a5a3a' : '#5d5550';
      g.fillRect(-o.size, -o.size * 0.4, o.size * 2, o.size * 0.8);
      g.restore();
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  };

  window.FireStage = FireStage;
})();
