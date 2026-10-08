/* Employee flow, one screen at a time:
 *   1 welcome → 2 pick your Ravan (+ optional message) → 3 drop it in the mouth. */
(function () {
  var cfg = window.RAVAN_CONFIG;
  var MAX = cfg.MESSAGE_MAX || 150;
  var COOLDOWN_MS = 20000;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (id) { return document.getElementById(id); };

  var heroRavan = $('heroRavan'), stageRavan = $('stageRavan');
  heroRavan.innerHTML = RavanArt.markup('hr');
  stageRavan.innerHTML = RavanArt.markup('sr');
  var stageSvg = stageRavan.querySelector('svg');
  $('eventDate').textContent = cfg.EVENT_DATE_LABEL;

  var fire = new FireStage($('fireCanvas'));

  // ---- screens ----
  var SCREENS = { welcome: $('screenWelcome'), pick: $('screenPick'), drop: $('dropStage') };
  var current = 'welcome';
  function show(name, opts) {
    opts = opts || {};
    Object.keys(SCREENS).forEach(function (k) { SCREENS[k].hidden = k !== name; });
    current = name;
    window.scrollTo(0, 0);
    // let the phone's back button go from "pick" to "welcome"
    if (opts.push) history.pushState({ screen: name }, '', '#' + name);
    else if (opts.replace) history.replaceState({ screen: name }, '', name === 'welcome' ? location.pathname + location.search : '#' + name);
    var focusEl = { welcome: $('ctaBtn'), pick: $('pickTitle'), drop: $('stageStatus') }[name];
    if (focusEl && opts.focus !== false) {
      if (!focusEl.hasAttribute('tabindex') && focusEl.tagName !== 'BUTTON') focusEl.setAttribute('tabindex', '-1');
      focusEl.focus({ preventScroll: true });
    }
  }
  window.addEventListener('popstate', function () {
    if (current === 'drop') return; // never interrupt the drop animation
    show(location.hash === '#pick' && !sealed ? 'pick' : 'welcome');
  });
  var sealed = false;
  $('ctaBtn').addEventListener('click', function () { if (!sealed) show('pick', { push: true }); });
  $('backBtn').addEventListener('click', function () {
    if (history.state && history.state.screen === 'pick') history.back();
    else show('welcome', { replace: true });
  });
  show(location.hash === '#pick' ? 'pick' : 'welcome', { replace: true, focus: false });

  // ---- categories ----
  var grid = $('catGrid');
  RAVAN_CATEGORIES.forEach(function (c, i) {
    var wrap = document.createElement('div');
    wrap.className = 'cat-opt' + (c.id === 'other' ? ' wide' : '');
    var input = document.createElement('input');
    input.type = 'radio'; input.name = 'category'; input.value = c.id; input.id = 'cat-' + c.id;
    var label = document.createElement('label');
    label.htmlFor = input.id;
    var emo = document.createElement('span');
    emo.className = 'emo'; emo.setAttribute('aria-hidden', 'true'); emo.textContent = c.emoji;
    var txt = document.createElement('span'); txt.textContent = c.label;
    label.appendChild(emo); label.appendChild(txt);
    wrap.appendChild(input); wrap.appendChild(label);
    grid.appendChild(wrap);
  });

  var form = $('dropForm'), msg = $('msg'), count = $('msgCount'), err = $('formError'), btn = $('dropBtn');
  msg.maxLength = MAX;

  function updateCount() {
    var n = msg.value.length;
    count.textContent = n + ' / ' + MAX;
    count.classList.toggle('near', n > MAX - 20);
  }
  msg.addEventListener('input', updateCount);
  updateCount();

  grid.addEventListener('change', function () {
    var other = form.category.value === 'other';
    $('msgHint').textContent = other ? 'Required for “Something Else”.' : 'Optional — but it makes the ceremony special.';
    hideError();
  });

  function showError(text) { err.textContent = text; err.hidden = false; }
  function hideError() { err.hidden = true; }

  // ---- is the box still open? ----
  RavanAPI.status().then(function (s) {
    if (s && s.accepting === false) {
      sealed = true;
      $('ctaBtn').hidden = true;
      $('sealedNotice').hidden = false;
      if (current === 'pick') show('welcome', { replace: true });
    }
  }).catch(function () { /* backend unreachable: let the submit report it */ });

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // ---- submit ----
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    hideError();
    var category = form.category.value;
    var message = msg.value.replace(/\s+/g, ' ').trim().slice(0, MAX);
    if (!category) { showError('Pick the Ravan you want to defeat first.'); grid.querySelector('input').focus(); return; }
    if (category === 'other' && !message) { showError('Tell us the one thing you want to let go of.'); msg.focus(); return; }
    var last = 0;
    try { last = +localStorage.getItem('ravan_last_drop') || 0; } catch (x) {}
    if (Date.now() - last < COOLDOWN_MS) { showError('Take a breath 🙏 — you can drop another chit in a few seconds.'); return; }

    btn.disabled = true;
    runDrop(category, message).finally(function () { btn.disabled = false; });
  });

  function runDrop(category, message) {
    var stage = $('dropStage');
    var status = $('stageStatus');
    var done = $('stageDone');
    done.hidden = true;
    status.hidden = false;
    status.textContent = 'Folding your chit…';
    show('drop');
    RavanArt.setMouth(stageSvg, 0);

    var chit = Chit.create({ id: 'local-' + Date.now(), category: category, message: message });
    chit.classList.add('flying-chit');
    document.body.appendChild(chit);

    var vw = window.innerWidth, vh = window.innerHeight;
    var cw = chit.offsetWidth, ch = chit.offsetHeight;
    var startX = (vw - cw) / 2, startY = vh - ch - Math.max(40, vh * 0.08);
    chit.style.transform = 'translate(' + startX + 'px,' + startY + 'px)';

    var appear = chit.animate([
      { transform: 'translate(' + startX + 'px,' + (startY + 60) + 'px) scale(0.6) rotate(-6deg)', opacity: 0 },
      { transform: 'translate(' + startX + 'px,' + startY + 'px) scale(1) rotate(-2deg)', opacity: 1 }
    ], { duration: reduce ? 150 : 550, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' }).finished;

    var request = RavanAPI.submit(category, message);

    return Promise.all([request, appear, sleep(reduce ? 200 : 900)]).then(function () {
      try { localStorage.setItem('ravan_last_drop', String(Date.now())); } catch (x) {}
      status.textContent = 'Into the Ravan Box…';
      var m = RavanArt.mouthPoint(stageSvg);
      var endX = m.x - cw / 2, endY = m.y - ch / 2;
      var midX = (startX + endX) / 2 + vw * 0.12, midY = Math.min(startY, endY) - vh * 0.06;
      RavanArt.animateMouth(stageSvg, 1, 450);
      var fly = chit.animate([
        { transform: 'translate(' + startX + 'px,' + startY + 'px) scale(1) rotate(-2deg)', opacity: 1 },
        { transform: 'translate(' + midX + 'px,' + midY + 'px) scale(0.55) rotate(14deg)', opacity: 1, offset: 0.55 },
        { transform: 'translate(' + endX + 'px,' + endY + 'px) scale(0.05) rotate(40deg)', opacity: 0.2 }
      ], { duration: reduce ? 300 : 1150, easing: 'cubic-bezier(.45,0,.35,1)', fill: 'forwards' }).finished;
      return fly.then(function () {
        chit.remove();
        if (!reduce) fire.emberBurst(m.x, m.y, 50);
        return RavanArt.animateMouth(stageSvg, 0, 320);
      }).then(function () {
        stageRavan.classList.add('glow');
        setTimeout(function () { stageRavan.classList.remove('glow'); }, 1200);
        status.hidden = true;
        done.hidden = false;
        form.reset();
        updateCount();
        $('doneBtn').focus();
      });
    }).catch(function (e) {
      chit.remove();
      if (e && e.code === 'CLOSED') {
        sealed = true; $('ctaBtn').hidden = true; $('sealedNotice').hidden = false;
        show('welcome', { replace: true });
        return;
      }
      show('pick');
      showError(friendly(e));
    });
  }

  function friendly(e) {
    if (e && e.code === 'CLOSED') return 'The Ravan Box is sealed — submissions are closed.';
    if (e && e.code === 'RATE') return 'Lots of Ravans arriving at once! Please try again in a minute.';
    if (e && e.code === 'INVALID') return e.message;
    return 'Could not reach the Ravan Box. Check your connection and try again.';
  }

  // after the drop: Done → screen 1, Drop another → screen 2
  $('doneBtn').addEventListener('click', function () { show('welcome', { replace: true }); });
  $('againBtn').addEventListener('click', function () { show('pick', { replace: true }); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && current === 'drop' && !$('stageDone').hidden) show('welcome', { replace: true });
  });
})();
