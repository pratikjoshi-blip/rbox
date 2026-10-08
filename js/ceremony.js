/*
 * Ceremony mode — state machine:
 *   SUBMISSIONS_OPEN → CEREMONY_READY → RAVAN_CLOSED → RAVAN_OPENING → CHITS_REVEALED
 *   → BURNING → BURNED → FINAL_MESSAGE
 * Real mode persists each step to the backend; ?mode=test runs entirely locally.
 */
(function () {
  var cfg = window.RAVAN_CONFIG;
  var $ = function (id) { return document.getElementById(id); };
  var TEST = new URLSearchParams(location.search).get('mode') === 'test';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var body = document.body;

  var wrap = $('ravanWrap'), main = $('ravanMain'), layer = $('chitsLayer'), aura = $('ravanAura');
  main.innerHTML = RavanArt.markup('cm');
  $('ravanHot').innerHTML = RavanArt.markup('ch');
  $('ravanChar').innerHTML = RavanArt.markup('cc');
  var svgs = [main, $('ravanHot'), $('ravanChar')].map(function (el) { return el.querySelector('svg'); });
  var mainSvg = svgs[0];
  $('finalDate').textContent = cfg.EVENT_DATE_LABEL;
  if (TEST) { $('testBadge').hidden = false; document.title = 'Test · Our Digital Ravan'; }

  var fire = new FireStage($('fireCanvas'));
  var T = FireStage.T;

  var state = 'CEREMONY_READY';
  var subs = [];
  var slots = [];        // chit slot elements
  var busy = false;      // a transition is running
  var revealRun = null;  // active "reveal a few"
  var focusOpen = null;

  // ---------------------------------------------------------------- helpers
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  var toastTimer;
  function toast(msg, ms) {
    var t = $('cToast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, ms || 2200);
  }
  function persist(next) {
    if (TEST) return Promise.resolve();
    return RavanAPI.setState(next).catch(function (e) { onApiError(e); });
  }
  function onApiError(e) {
    if (e && e.code === 'AUTH') showMsg('Your admin session has expired. Log in again from the admin page, then restart the ceremony.');
    else toast('⚠ Could not save ceremony state (offline?) — the show goes on.', 3500);
  }
  function setState(next, save) {
    state = next;
    body.setAttribute('data-state', next);
    if (save) return persist(next);
    return Promise.resolve();
  }
  function showMsg(text) { $('msgText').textContent = text; $('msgPanel').hidden = false; }

  // ---------------------------------------------------------------- garland
  (function garland() {
    var w = 1600, h = 140, swags = 7, s = '';
    var colors = ['#ff9f1c', '#ffb703', '#f77f00', '#ffd166'];
    for (var i = 0; i < swags; i++) {
      var x0 = (i / swags) * w, x1 = ((i + 1) / swags) * w, sag = 70;
      s += '<path d="M' + x0 + ' 6 Q' + (x0 + x1) / 2 + ' ' + (6 + sag * 2) + ' ' + x1 + ' 6" stroke="#2f6b2a" stroke-width="3" fill="none"/>';
      for (var k = 0; k <= 14; k++) {
        var t = k / 14;
        var x = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * ((x0 + x1) / 2) + t * t * x1;
        var y = (1 - t) * (1 - t) * 6 + 2 * (1 - t) * t * (6 + sag * 2) + t * t * 6;
        s += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="9" fill="' + colors[k % 4] + '"/><circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="4" fill="#e85d04" opacity="0.6"/>';
      }
      s += '<path d="M' + x1 + ' 8 L' + x1 + ' 52" stroke="#2f6b2a" stroke-width="2"/>';
      for (var d = 0; d < 4; d++) s += '<circle cx="' + x1 + '" cy="' + (16 + d * 12) + '" r="7" fill="' + colors[(d + i) % 4] + '"/>';
      s += '<path d="M' + (x1 - 7) + ' 66 L' + x1 + ' 86 L' + (x1 + 7) + ' 66 Z" fill="#2f8f3a"/>';
    }
    $('garland').innerHTML = '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none">' + s + '</svg>';
  })();

  // ---------------------------------------------------------------- layout
  var RATIO = 1000 / 800;
  function ravanBox(phase) {
    var W = window.innerWidth, H = window.innerHeight, h, top;
    if (phase === 'closed') { h = Math.min(H * 0.58, (W * 0.6) / RATIO); top = H * 0.185; }
    else { h = Math.min(H * 0.5, (W * 0.5) / RATIO); top = H * 0.17; }
    var w = h * RATIO;
    return { left: (W - w) / 2, top: top, width: w, height: h };
  }
  function placeRavan(phase, animate) {
    var b = ravanBox(phase);
    wrap.classList.toggle('no-anim', !animate);
    wrap.style.left = b.left + 'px'; wrap.style.top = b.top + 'px';
    wrap.style.width = b.width + 'px'; wrap.style.height = b.height + 'px';
    aura.style.left = (b.left + b.width * 0.15) + 'px'; aura.style.top = (b.top - b.height * 0.05) + 'px';
    aura.style.width = (b.width * 0.7) + 'px'; aura.style.height = (b.height * 1.1) + 'px';
    if (!animate) { void wrap.offsetWidth; wrap.classList.remove('no-anim'); }
    return b;
  }

  /* Grid of slots around Ravan's face (never under it), nearest-to-mouth first. */
  function computeSlots(n) {
    var W = window.innerWidth, H = window.innerHeight;
    var area = { x: W * 0.015, y: H * 0.12, w: W * 0.97, h: H * 0.68 };
    var rb = ravanBox('revealed');
    var face = { l: rb.left + rb.width * 0.29, r: rb.left + rb.width * 0.71, t: rb.top, b: rb.top + rb.height };
    var mouth = { x: rb.left + rb.width * 0.5, y: rb.top + rb.height * 0.75 };
    var best = null;
    for (var cols = 5; cols <= 16; cols++) {
      var cw = area.w / cols;
      var rows = Math.max(2, Math.floor(area.h / (cw / 1.32)));
      var ch = area.h / rows;
      var cells = [];
      for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) {
          var cx = area.x + (c + 0.5) * cw, cy = area.y + (r + 0.5) * ch;
          if (cx > face.l - cw * 0.25 && cx < face.r + cw * 0.25 && cy > face.t && cy < face.b + ch * 0.1) continue;
          cells.push({ cx: cx, cy: cy, cw: cw, ch: ch });
        }
      }
      best = cells;
      if (cells.length >= n) break;
    }
    best.forEach(function (c) { var dx = (c.cx - mouth.x) / W, dy = (c.cy - mouth.y) / H * 0.8; c.d = dx * dx + dy * dy; });
    best.sort(function (a, b) { return a.d - b.d; });
    return { cells: best.slice(0, n), mouth: mouth };
  }

  function buildChits() {
    layer.textContent = '';
    slots = [];
    var plan = computeSlots(subs.length);
    // shuffle so nearby chits aren't in submission order
    var order = subs.slice().sort(function () { return Math.random() - 0.5; });
    order.forEach(function (s, i) {
      var cell = plan.cells[i];
      if (!cell) return;
      var slot = document.createElement('div');
      slot.className = 'chit-slot';
      var chit = Chit.create(s, { tag: 'button' });
      var rnd = chit.__rnd;
      var w = cell.cw * 0.9, h = cell.ch * 0.86;
      var jx = (rnd() - 0.5) * cell.cw * 0.12, jy = (rnd() - 0.5) * cell.ch * 0.12;
      slot.style.left = (cell.cx - w / 2 + jx) + 'px';
      slot.style.top = (cell.cy - h / 2 + jy) + 'px';
      slot.style.width = w + 'px'; slot.style.height = h + 'px';
      slot.style.fontSize = Math.max(11, Math.min(22, w / 13.5)) + 'px';
      chit.style.setProperty('--r', ((rnd() - 0.5) * 14).toFixed(2) + 'deg');
      chit.style.setProperty('--s', (0.94 + rnd() * 0.1).toFixed(3));
      chit.addEventListener('click', function () { openFocus(slot, s); });
      slot.__sub = s;
      slot.__cell = cell;
      slot.appendChild(chit);
      layer.appendChild(slot);
      slots.push(slot);
    });
    return plan;
  }

  // ---------------------------------------------------------------- scenes
  function sceneClosed() {
    fire.clear(); fire.goldDust(false); fire.ambient(!reduce.matches);
    body.classList.remove('revealed', 'opening', 'rm-burn');
    $('final').hidden = true; $('final').classList.remove('show');
    $('actions').hidden = true;
    $('rmGlow').style.opacity = 0;
    layer.textContent = ''; layer.className = 'chits-layer'; layer.style.cssText = ''; slots = [];
    wrap.style.display = ''; wrap.style.opacity = ''; wrap.style.webkitMaskImage = wrap.style.maskImage = ''; wrap.style.transform = '';
    wrap.classList.remove('flash');
    setCopyMask(-30);
    aura.style.opacity = 0;
    main.className = 'ravan idle';
    svgs.forEach(function (s) { RavanArt.setMouth(s, 0); });
    placeRavan('closed', false);
    updateCount();
    return setState('RAVAN_CLOSED', true);
  }

  function sceneRevealed() {
    sceneClosedVisualsOnly();
    body.classList.add('revealed');
    placeRavan('revealed', false);
    svgs.forEach(function (s) { RavanArt.setMouth(s, 0.55); });
    buildChits();
    $('actions').hidden = false;
  }
  function sceneClosedVisualsOnly() {
    $('final').hidden = true;
    layer.className = 'chits-layer';
    main.className = 'ravan idle';
    fire.ambient(!reduce.matches);
  }

  function sceneFinal(animated) {
    wrap.style.display = 'none';
    layer.textContent = ''; slots = [];
    $('actions').hidden = true;
    body.classList.add('revealed');
    var f = $('final');
    f.hidden = false;
    f.classList.remove('show'); void f.offsetWidth; f.classList.add('show');
    fire.ambient(false);
    if (!reduce.matches) fire.goldDust(true);
    if (animated) RavanSound.chime();
  }

  function updateCount() {
    $('countNum').textContent = subs.length;
    $('countWord').textContent = subs.length === 1 ? 'RAVAN' : 'RAVANS';
  }

  // ---------------------------------------------------------------- open Ravan
  function openRavan() {
    if (state !== 'RAVAN_CLOSED' || busy) return;
    busy = true;
    setState('RAVAN_OPENING', true);
    body.classList.add('opening');
    main.classList.remove('idle');
    // Phase 1: reaction — shake, crown wobble, eyes glow, brows lift
    main.classList.add('react', 'glow');
    RavanSound.mouth();
    var quick = reduce.matches;
    sleep(quick ? 100 : 1100).then(function () {
      // Phase 2: mouth slowly opens while Ravan settles into the centre
      main.classList.remove('react');
      body.classList.add('revealed');
      placeRavan('revealed', !quick);
      return RavanArt.animateMouth(svgs, 1, quick ? 150 : 1500);
    }).then(function () {
      return sleep(quick ? 0 : 150);
    }).then(function () {
      // Phase 3: chits emerge from the mouth
      var plan = buildChits();
      var m = RavanArt.mouthPoint(mainSvg);
      var stagger = subs.length > 30 ? 70 : 115;
      var anims = slots.map(function (slot, i) {
        var r = slot.getBoundingClientRect();
        var dx = m.x - (r.left + r.width / 2), dy = m.y - (r.top + r.height / 2);
        if (quick) return slot.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, fill: 'both' }).finished;
        setTimeout(function () { RavanSound.paper(); }, i * stagger);
        return slot.animate([
          { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(0.08) rotate(0deg)', opacity: 0 },
          { transform: 'translate(' + dx + 'px,' + (dy + 18) + 'px) scale(0.16)', opacity: 1, offset: 0.12 },
          { transform: 'translate(' + dx * 0.45 + 'px,' + (dy * 0.45 - window.innerHeight * 0.08) + 'px) scale(0.75) rotate(' + (dx > 0 ? -18 : 18) + 'deg)', opacity: 1, offset: 0.6 },
          { transform: 'translate(0,0) scale(1) rotate(0deg)', opacity: 1 }
        ], { duration: 1150, delay: i * stagger, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'both' }).finished;
      });
      return Promise.all(anims).then(function () { return plan; });
    }).then(function () {
      main.classList.remove('glow');
      main.classList.add('idle');
      RavanArt.animateMouth(svgs, 0.55, 700);
      body.classList.remove('opening');
      $('actions').hidden = false;
      busy = false;
      return setState('CHITS_REVEALED', true);
    });
  }

  // ---------------------------------------------------------------- focus a chit
  function bigChit(sub) {
    var el = Chit.create(sub);
    el.classList.add('big-chit');
    return el;
  }
  function flipFrom(el, fromRect, reverse) {
    var to = el.getBoundingClientRect();
    var sx = fromRect.width / to.width, dx = (fromRect.left + fromRect.width / 2) - (to.left + to.width / 2), dy = (fromRect.top + fromRect.height / 2) - (to.top + to.height / 2);
    var a = { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + sx + ')', opacity: 0.6 };
    var b = { transform: 'none', opacity: 1 };
    return el.animate(reverse ? [b, a] : [a, b], { duration: reduce.matches ? 1 : 380, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both' }).finished;
  }
  function openFocus(slot, sub) {
    if (state !== 'CHITS_REVEALED' || focusOpen || revealRun || busy) return;
    var fl = $('focusLayer');
    fl.textContent = '';
    var el = bigChit(sub);
    fl.appendChild(el);
    fl.hidden = false;
    var from = slot.getBoundingClientRect();
    slot.classList.add('is-away');
    focusOpen = { slot: slot, el: el, from: from };
    fl.focus({ preventScroll: true });
    RavanSound.paper();
    flipFrom(el, from, false);
  }
  function closeFocus() {
    if (!focusOpen) return;
    var f = focusOpen; focusOpen = null;
    flipFrom(f.el, f.slot.getBoundingClientRect(), true).then(function () {
      $('focusLayer').hidden = true;
      $('focusLayer').textContent = '';
      f.slot.classList.remove('is-away');
      var btn = f.slot.querySelector('.chit');
      if (btn) btn.focus({ preventScroll: true });
    });
  }
  $('focusLayer').addEventListener('click', closeFocus);

  // ---------------------------------------------------------------- reveal a few
  function revealFew() {
    if (state !== 'CHITS_REVEALED' || revealRun || busy || !slots.length) return;
    closeFocus();
    var k = Math.min(slots.length, 3 + Math.floor(Math.random() * 3));
    var picks = slots.slice().sort(function () { return Math.random() - 0.5; }).slice(0, k);
    var run = { i: -1, picks: picks, timer: null, cancelled: false };
    revealRun = run;
    layer.classList.add('dim');
    $('revealLayer').hidden = false;
    next();
    function next() {
      if (run.cancelled) return;
      clearTimeout(run.timer);
      run.i++;
      if (run.i >= picks.length) return endReveal();
      var slot = picks[run.i];
      $('revealCount').textContent = 'RAVAN ' + (run.i + 1) + ' OF ' + picks.length;
      var holder = $('revealSlot');
      holder.textContent = '';
      var el = bigChit(slot.__sub);
      holder.appendChild(el);
      RavanSound.paper();
      flipFrom(el, slot.getBoundingClientRect(), false);
      var bar = $('revealBar');
      bar.getAnimations && bar.getAnimations().forEach(function (a) { a.cancel(); });
      bar.animate([{ width: '0%' }, { width: '100%' }], { duration: 5000, fill: 'forwards' });
      run.timer = setTimeout(next, 5000);
    }
    run.next = next;
  }
  function endReveal() {
    if (!revealRun) return;
    clearTimeout(revealRun.timer);
    revealRun.cancelled = true;
    revealRun = null;
    $('revealLayer').hidden = true;
    $('revealSlot').textContent = '';
    layer.classList.remove('dim');
  }
  $('revealLayer').addEventListener('click', function () { if (revealRun) revealRun.next(); });

  // ---------------------------------------------------------------- BURN
  function setCopyMask(F) {
    // F = % of the Ravan's height (from the bottom) that the fire front has reached
    var hot = 'linear-gradient(to top, #000 0%, #000 ' + F + '%, transparent ' + (F + 8) + '%)';
    var ch = 'linear-gradient(to top, #000 0%, #000 ' + (F - 26) + '%, transparent ' + (F - 8) + '%)';
    var h = $('ravanHot').style, c = $('ravanChar').style;
    h.webkitMaskImage = h.maskImage = hot;
    c.webkitMaskImage = c.maskImage = ch;
  }

  var bPressed = 0;
  function burn() {
    if (state !== 'CHITS_REVEALED' || busy) return;
    busy = true;
    endReveal(); closeFocus();
    $('actions').hidden = true;
    setState('BURNING', true);
    fire.ambient(false);

    var done = reduce.matches ? burnReduced() : burnCinematic();
    done.then(function () {
      wrap.style.display = 'none';
      layer.classList.add('gone');
      var save = TEST ? Promise.resolve() : RavanAPI.markBurned().catch(onApiError);
      setState('BURNED');
      return Promise.all([save, sleep(1000)]);
    }).then(function () {
      setState('FINAL_MESSAGE', true);
      sceneFinal(true);
      busy = false;
    });
  }

  function burnReduced() {
    body.classList.add('rm-burn');
    $('rmGlow').style.opacity = 1;
    return sleep(2600).then(function () { $('rmGlow').style.opacity = 0; return sleep(800); });
  }

  function burnCinematic() {
    var flashOn = false, flashOff = false;
    // 0–1 s: stillness — eyes glow, chits flutter
    main.classList.remove('idle');
    main.classList.add('glow');
    layer.classList.add('is-fluttering');
    RavanSound.stopAmbience(1.5);
    RavanSound.fire(T.END + 0.4);
    var chitRects = slots.map(function (s) { return s.getBoundingClientRect(); });
    var wr = wrap.getBoundingClientRect();
    return fire.burn({
      getRavanRect: function () { return RavanArt.faceRect(mainSvg); },
      getChitRects: function () { return chitRects; },
      onFrame: function (st) {
        // Ravan: fire front climbs mouth → cheeks → eyes → crown
        var F = ((wr.bottom - st.front) / wr.height) * 100;
        if (st.t >= T.WAVE) setCopyMask(Math.max(-30, Math.min(140, F)));
        aura.style.opacity = Math.min(1, st.t < T.DISSOLVE ? Math.max(0, (st.t - T.SMALL) / 3) : 1 - st.dissolve);
        if (st.t >= T.ENGULF + 0.3 && !flashOn) { flashOn = true; wrap.classList.add('flash'); main.classList.add('flash'); }
        if (st.t >= T.DISSOLVE - 0.1 && !flashOff) { flashOff = true; wrap.classList.remove('flash'); }
        // paper: all chits ignite together
        if (st.t >= T.CHIT_START) {
          if (!layer.classList.contains('is-burning')) { layer.classList.remove('is-fluttering'); layer.classList.add('is-burning'); }
          layer.style.setProperty('--b', st.chitBurn.toFixed(4));
          if (st.chitBurn >= 1) layer.classList.add('gone');
        }
        // disintegration: Ravan crumbles from the bottom up into embers and ash
        if (st.dissolve > 0) {
          var d = st.dissolve * 125;
          var m = 'linear-gradient(to top, transparent ' + (d - 18) + '%, #000 ' + d + '%)';
          wrap.style.webkitMaskImage = wrap.style.maskImage = m;
          wrap.style.transform = 'translateY(' + (-st.dissolve * 12) + 'px) scale(' + (1 + st.dissolve * 0.03) + ')';
          wrap.style.opacity = String(1 - Math.max(0, st.dissolve - 0.7) / 0.3);
        }
      }
    });
  }

  // ---------------------------------------------------------------- reset
  function askReset() {
    if (state === 'BURNING' || busy) return;
    endReveal(); closeFocus();
    $('resetModal').hidden = false;
    $('resetOk').focus();
  }
  function closeReset() { $('resetModal').hidden = true; }
  function doReset() {
    closeReset();
    var p = TEST ? Promise.resolve() : RavanAPI.resetCeremony('RAVAN_CLOSED').catch(onApiError);
    p.then(function () { return loadSubs(); }).then(function () {
      sceneClosed();
      toast('Ravan is back — ready when you are 🏹');
      main.focus({ preventScroll: true });
    });
  }
  $('resetCancel').addEventListener('click', closeReset);
  $('resetOk').addEventListener('click', doReset);

  // ---------------------------------------------------------------- controls
  main.addEventListener('click', openRavan);
  $('burnBtn').addEventListener('click', burn);
  $('revealBtn').addEventListener('click', revealFew);

  $('soundBtn').addEventListener('click', function () {
    var on = RavanSound.setEnabled(!RavanSound.isEnabled());
    this.textContent = on ? '🔊 Sound on' : '🔇 Sound off';
    this.setAttribute('aria-pressed', String(on));
    if (on && /BURNED|FINAL/.test(state)) RavanSound.stopAmbience(0.1);
  });
  function toggleFs() {
    if (!document.fullscreenElement) { (document.documentElement.requestFullscreen || function () {}).call(document.documentElement); }
    else if (document.exitFullscreen) document.exitFullscreen();
  }
  $('fsBtn').addEventListener('click', toggleFs);
  var escAt = 0;
  function exitCeremony() { location.href = '../admin/'; }
  $('exitBtn').addEventListener('click', function () {
    if (state === 'BURNING') return;
    exitCeremony();
  });

  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var k = e.key;
    if (!$('resetModal').hidden) {
      if (k === 'Escape') { e.preventDefault(); closeReset(); }
      else if (k === 'Enter') { e.preventDefault(); doReset(); }
      return;
    }
    if (k === ' ' || k === 'Spacebar') {
      e.preventDefault();
      if (focusOpen) closeFocus();
      else if (revealRun) revealRun.next();
      else if (state === 'RAVAN_CLOSED') openRavan();
      return;
    }
    if (k === 'Enter' && state === 'RAVAN_CLOSED' && document.activeElement === main) { e.preventDefault(); openRavan(); return; }
    if (k === 'Escape') {
      e.preventDefault();
      if (focusOpen) return closeFocus();
      if (revealRun) return endReveal();
      if (state === 'BURNING') return;
      if (Date.now() - escAt < 2500) return exitCeremony();
      escAt = Date.now();
      toast('Press Esc again to exit the ceremony');
      return;
    }
    if (k === 'b' || k === 'B') {
      if (state !== 'CHITS_REVEALED' || busy || focusOpen || revealRun) return;
      if (Date.now() - bPressed < 2500) { bPressed = 0; burn(); }
      else { bPressed = Date.now(); toast('🔥 Press B again to burn our Ravan'); }
      return;
    }
    if (k === 'r' || k === 'R') { askReset(); return; }
    if (k === 'f' || k === 'F') { toggleFs(); return; }
  });

  // hide cursor + corner controls when idle (projector)
  var idleTimer;
  function wake() {
    body.classList.remove('idle-ui');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(function () { body.classList.add('idle-ui'); }, 3000);
  }
  ['mousemove', 'mousedown', 'keydown', 'touchstart'].forEach(function (ev) { document.addEventListener(ev, wake, { passive: true }); });
  wake();

  var resizeT;
  window.addEventListener('resize', function () {
    clearTimeout(resizeT);
    resizeT = setTimeout(function () {
      if (state === 'RAVAN_CLOSED') placeRavan('closed', false);
      else if (state === 'CHITS_REVEALED' && !busy) { placeRavan('revealed', false); closeFocus(); endReveal(); buildChits(); }
    }, 150);
  });

  // ---------------------------------------------------------------- boot
  function loadSubs() {
    return RavanAPI.list().then(function (d) {
      var all = d.submissions || [];
      subs = TEST ? all : all.filter(function (s) { return !s.isDemo; });
      updateCount();
      return d;
    });
  }

  if (!RavanAPI.hasToken()) {
    showMsg('Ceremony mode is for the organizer. Please log in on the admin page first.');
    return;
  }

  placeRavan('closed', false);
  loadSubs().then(function (d) {
    if (TEST && !subs.length) toast('No entries yet — generate demo data in the admin panel.', 4000);
    var s = TEST ? 'CEREMONY_READY' : d.state;
    if (s === 'BURNED' || s === 'FINAL_MESSAGE') {
      setState('FINAL_MESSAGE');
      sceneFinal(false);
      toast('This ceremony is complete. Press R to run it again.', 4000);
    } else if (s === 'RAVAN_OPENING' || s === 'CHITS_REVEALED' || s === 'BURNING') {
      // resume after a refresh: chits are already out
      sceneRevealed();
      setState('CHITS_REVEALED', s !== 'CHITS_REVEALED');
    } else {
      sceneClosed();
    }
    setTimeout(function () { if (state === 'RAVAN_CLOSED') main.focus({ preventScroll: true }); }, 300);
  }).catch(function (e) {
    if (e && e.code === 'AUTH') showMsg('Your admin session has expired. Please log in again on the admin page.');
    else showMsg('Could not load the Ravans. Check the connection / API_URL and try again.');
  });
})();
