/*
 * Team spinner — draws the playing order, one spin per place.
 * The winner is chosen with crypto.getRandomValues BEFORE the animation; the wheel
 * then eases to land exactly on that team. Each result is saved (teamsSpin) so the
 * darts / treasure hunt setup can apply it with one tap.
 */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var canvas = $('wheel'), g = canvas.getContext('2d');
  var fire = new FireStage($('fireCanvas'));
  var COLORS = ['#7c1426', '#b8860b', '#9a3412', '#4a0d1c', '#a16207', '#c2410c', '#5b1022', '#8a6d0b'];
  var ORD = ['FIRST', 'SECOND', 'THIRD', 'FOURTH', 'FIFTH', 'SIXTH', 'SEVENTH', 'EIGHTH', 'NINTH', 'TENTH', 'ELEVENTH', 'TWELFTH'];

  var teams = [];        // global list
  var excluded = {};     // id → true (left off the wheel)
  var order = [];        // ids drawn so far
  var angle = 0;         // current wheel rotation (radians)
  var spinning = false;
  var soundOn = false, actx = null;

  $('hub').innerHTML = RavanArt.markup('sp');

  function el(tag, className, text) { var e = document.createElement(tag); if (className) e.className = className; if (text != null) e.textContent = text; return e; }
  var ft;
  function flash(t, err) { var s = $('saving'); s.textContent = t; s.classList.toggle('err', !!err); s.hidden = false; clearTimeout(ft); ft = setTimeout(function () { s.hidden = true; }, 2600); }
  function nameOf(id) { for (var i = 0; i < teams.length; i++) if (teams[i].id === id) return teams[i].name; return '?'; }
  function onWheel() { return teams.filter(function (t) { return !excluded[t.id] && order.indexOf(t.id) < 0; }); }
  function playing() { return teams.filter(function (t) { return !excluded[t.id]; }); }

  /* fair pick: rejection sampling over crypto random bytes */
  function randomIndex(n) {
    var c = window.crypto || window.msCrypto;
    if (!c || !c.getRandomValues) return Math.floor(Math.random() * n);
    var buf = new Uint32Array(1), limit = Math.floor(4294967296 / n) * n;
    do { c.getRandomValues(buf); } while (buf[0] >= limit);
    return buf[0] % n;
  }

  // ---------- drawing ----------
  function draw() {
    var list = onWheel();
    var W = canvas.width, R = W / 2 - 18, cx = W / 2, cy = W / 2;
    g.clearRect(0, 0, W, W);
    // outer gold rim with lights
    g.beginPath(); g.arc(cx, cy, R + 14, 0, Math.PI * 2); g.fillStyle = '#d9a11f'; g.fill();
    g.beginPath(); g.arc(cx, cy, R + 4, 0, Math.PI * 2); g.fillStyle = '#2a0610'; g.fill();
    for (var b = 0; b < 24; b++) {
      var ba = (b / 24) * Math.PI * 2;
      g.beginPath(); g.arc(cx + Math.cos(ba) * (R + 9), cy + Math.sin(ba) * (R + 9), 5, 0, Math.PI * 2);
      g.fillStyle = b % 2 ? '#fff1a8' : '#ff8a1f'; g.fill();
    }
    if (!list.length) {
      g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fillStyle = '#3a0b17'; g.fill();
      return;
    }
    var seg = (Math.PI * 2) / list.length;
    g.save();
    g.translate(cx, cy);
    g.rotate(angle);
    list.forEach(function (t, i) {
      var a0 = -Math.PI / 2 + i * seg - seg / 2;
      g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, R, a0, a0 + seg); g.closePath();
      g.fillStyle = list.length === 1 ? COLORS[0] : COLORS[i % COLORS.length];
      g.fill();
      g.strokeStyle = 'rgba(255, 241, 168, 0.55)'; g.lineWidth = 3; g.stroke();
      // label along the segment
      g.save();
      g.rotate(a0 + seg / 2);
      g.textAlign = 'right'; g.textBaseline = 'middle';
      // fit the label between the Ravan hub and the rim (shrink, then ellipsis if needed)
      var room = R - 30 - W * 0.12 - 16;
      var label = t.name, fs = Math.min(54, seg * R * 0.32);
      g.font = '800 ' + fs + 'px Cinzel, Georgia, serif';
      while (fs > 18 && g.measureText(label).width > room) { fs -= 2; g.font = '800 ' + fs + 'px Cinzel, Georgia, serif'; }
      while (label.length > 4 && g.measureText(label).width > room) { label = label.slice(0, -2) + '…'; }
      g.fillStyle = '#fff7e8';
      g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 6;
      g.fillText(label, R - 30, 0);
      g.restore();
    });
    g.restore();
  }

  // ---------- sound ----------
  function tick(freq) {
    if (!soundOn) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      var o = actx.createOscillator(), v = actx.createGain(), t = actx.currentTime;
      o.type = 'triangle'; o.frequency.value = freq || 1400;
      v.gain.setValueAtTime(0.12, t); v.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      o.connect(v); v.connect(actx.destination); o.start(t); o.stop(t + 0.06);
    } catch (e) {}
  }
  function fanfare() {
    if (!soundOn) return;
    [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) { setTimeout(function () { tick(f); }, i * 110); });
  }
  $('soundBtn').addEventListener('click', function () {
    soundOn = !soundOn;
    this.textContent = soundOn ? '🔊 Sound on' : '🔇 Sound off';
    this.setAttribute('aria-pressed', String(soundOn));
    if (soundOn) tick(900);
  });

  // ---------- spin ----------
  function spin() {
    if (spinning) return;
    var list = onWheel();
    if (!list.length) return;
    if (!RavanAPI.dartsHasToken()) { $('loginModal').hidden = false; $('pin').focus(); return; }
    if (list.length === 1) { return land(list[0]); }
    spinning = true;
    $('spinBtn').disabled = true;
    var win = randomIndex(list.length);
    var seg = (Math.PI * 2) / list.length;
    // segment i's centre sits at angle −π/2 + i·seg (+ rotation); land it under the top pointer
    var jitter = (randomIndex(1000) / 1000 - 0.5) * seg * 0.7;
    var target = -win * seg - jitter;
    var turns = reduce ? 0 : 6 + randomIndex(3);
    var start = angle;
    var d = (((target - start) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2); // forward distance to the winner
    var end = start + d + Math.PI * 2 * (turns + (reduce ? 0 : 1));
    var dur = reduce ? 600 : 5200 + randomIndex(1200);
    var t0 = performance.now(), lastSeg = null;
    (function frame(now) {
      var k = Math.min(1, (now - t0) / dur);
      var e = 1 - Math.pow(1 - k, 4); // ease-out quart: long, suspenseful slowdown
      angle = start + (end - start) * e;
      draw();
      var under = Math.floor((((-angle + seg / 2) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / seg);
      if (under !== lastSeg) { if (lastSeg !== null) tick(1200 + (1 - k) * 600); lastSeg = under; }
      if (k < 1) requestAnimationFrame(frame);
      else { angle = end % (Math.PI * 2); spinning = false; window.__spinCheck = { pointer: window.__spinDebug(), winner: list[win].name }; land(list[win]); }
    })(t0);
  }

  function land(team) {
    order.push(team.id);
    var place = order.length - 1;
    // the last team left gets the last place automatically
    var left = onWheel();
    if (left.length === 1) order.push(left[0].id);
    renderOrder();
    draw();
    announce(team.name, place);
    save();
    $('spinBtn').disabled = !onWheel().length;
  }

  function announce(name, place) {
    $('aSmall').textContent = 'PLAYS ' + (ORD[place] || '#' + (place + 1));
    $('aName').textContent = name;
    var a = $('announce');
    a.hidden = false;
    a.classList.remove('show'); void a.offsetWidth; a.classList.add('show');
    fanfare();
    if (!reduce) fire.emberBurst(window.innerWidth * 0.36, window.innerHeight * 0.18, 90);
    clearTimeout(announce.t);
    announce.t = setTimeout(function () { a.hidden = true; }, 3200);
  }

  function renderOrder() {
    var ol = $('orderList'); ol.textContent = '';
    var total = playing().length;
    for (var i = 0; i < total; i++) {
      var li = el('li', i < order.length ? 'done' : '');
      li.appendChild(el('span', 'o-n', String(i + 1)));
      li.appendChild(el('span', 'o-name', i < order.length ? nameOf(order[i]) : '— spin —'));
      ol.appendChild(li);
    }
    $('spinHint').textContent = !onWheel().length ? 'Order complete 🎉' : order.length ? 'Spin for ' + (ORD[order.length] || '#' + (order.length + 1)).toLowerCase() + ' place' : 'Press Space or the button';
  }

  function renderChips() {
    var box = $('teamChips'); box.textContent = '';
    teams.forEach(function (t) {
      var c = el('button', 'chip-btn' + (excluded[t.id] ? ' off' : ''), t.name);
      c.type = 'button';
      c.setAttribute('aria-pressed', String(!excluded[t.id]));
      c.disabled = order.length > 0; // lock the line-up once spinning has started
      c.addEventListener('click', function () { if (excluded[t.id]) delete excluded[t.id]; else excluded[t.id] = true; renderAll(); });
      box.appendChild(c);
    });
  }
  function renderAll() { renderChips(); renderOrder(); draw(); $('spinBtn').disabled = spinning || !onWheel().length || playing().length < 2; }

  function save() {
    // drawn teams first, then anyone not drawn yet (keeps darts/hunt setup complete)
    var full = order.concat(onWheel().map(function (t) { return t.id; }));
    RavanAPI.teamsSpin(full).then(function () { $('savedNote').hidden = false; })
      .catch(function (err) {
        if (err.code === 'AUTH') { $('loginModal').hidden = false; flash('Sign in to save the order', true); }
        else flash(err.message || 'Could not save the order', true);
      });
  }

  $('spinBtn').addEventListener('click', spin);
  $('resetBtn').addEventListener('click', function () {
    if (spinning) return;
    if (order.length && !window.confirm('Start the draw again? The saved order stays until you spin again.')) return;
    order = []; $('savedNote').hidden = true; renderAll();
  });
  document.addEventListener('keydown', function (e) {
    if (!$('loginModal').hidden) return;
    if (e.key === ' ' || e.key === 'Enter') { if (document.activeElement && document.activeElement.tagName === 'BUTTON' && document.activeElement.id !== 'spinBtn') return; e.preventDefault(); spin(); }
    if (e.key === 'f' || e.key === 'F') { if (!document.fullscreenElement && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen(); else if (document.exitFullscreen) document.exitFullscreen(); }
  });

  // ---------- sign-in (needed to save) ----------
  $('loginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    $('loginBtn').disabled = true; $('loginMsg').hidden = true;
    RavanAPI.dartsLogin($('pin').value).then(function () { $('pin').value = ''; $('loginModal').hidden = true; flash('Signed in — spin away!'); })
      .catch(function (err) {
        $('loginMsg').textContent = err.code === 'DENIED' || err.code === 'RATE' ? err.message
          : err.code === 'AUTH' ? 'The server runs an older backend — deploy a New version of Code.gs.' : err.code ? err.message : 'Could not reach the server.';
        $('loginMsg').hidden = false;
      })
      .finally(function () { $('loginBtn').disabled = false; });
  });

  if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw);
  window.__spinDebug = function () { var list = onWheel(), seg = Math.PI * 2 / Math.max(1, list.length);
    var i = Math.round(((-angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / seg) % Math.max(1, list.length); return list[i] ? list[i].name : null; };

  RavanAPI.teamsList().then(function (s) {
    teams = (s && s.teams) || [];
    if (teams.length < 2) { $('spinHint').textContent = 'Create at least 2 teams on the Teams page first.'; }
    renderAll();
  }).catch(function (err) {
    $('spinHint').textContent = err && err.code === 'AUTH' ? 'The server runs an older backend — deploy a New version of Code.gs.' : 'Could not load teams.';
    renderAll();
  });
})();
