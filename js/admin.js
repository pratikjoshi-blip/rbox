/* Admin dashboard */
(function () {
  var cfg = window.RAVAN_CONFIG;
  var $ = function (id) { return document.getElementById(id); };
  var data = { state: '', submissions: [] };
  var filter = 'all';
  var pollTimer = null;

  var STATE_LABEL = {
    SUBMISSIONS_OPEN: '● Submissions open', CEREMONY_READY: 'Box sealed · ceremony ready', RAVAN_CLOSED: 'Ceremony · Ravan closed',
    RAVAN_OPENING: 'Ceremony · opening', CHITS_REVEALED: 'Ceremony · chits revealed', BURNING: 'Ceremony · burning',
    BURNED: '🔥 Burned', FINAL_MESSAGE: '🔥 Ceremony complete'
  };

  $('loginRavan').innerHTML = RavanArt.markup('lg');

  // ---------- toast + confirm ----------
  var toastTimer;
  function toast(msg, isError) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.toggle('error', !!isError);
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 3200);
  }

  function confirmBox(title, text, word, okLabel) {
    var d = $('confirmDialog');
    $('confirmTitle').textContent = title;
    $('confirmText').textContent = text;
    $('confirmTypeWrap').hidden = !word;
    $('confirmWord').textContent = word || '';
    $('confirmInput').value = '';
    $('confirmOk').textContent = okLabel || 'Confirm';
    return new Promise(function (resolve) {
      function done() {
        d.removeEventListener('close', done);
        var ok = d.returnValue === 'ok' && (!word || $('confirmInput').value.trim().toUpperCase() === word);
        if (d.returnValue === 'ok' && word && !ok) toast('Not confirmed — type ' + word + ' exactly.', true);
        resolve(ok);
      }
      d.addEventListener('close', done);
      if (d.showModal) d.showModal(); else resolve(window.confirm(text));
      if (word) setTimeout(function () { $('confirmInput').focus(); }, 30);
    });
  }

  // ---------- auth ----------
  function showLogin() {
    $('dashView').hidden = true;
    $('loginView').hidden = false;
    clearInterval(pollTimer);
    setTimeout(function () { $('pw').focus(); }, 50);
  }
  function showDash() {
    $('loginView').hidden = true;
    $('dashView').hidden = false;
    refresh();
    clearInterval(pollTimer);
    pollTimer = setInterval(function () { if (!document.hidden) refresh(true); }, 30000);
  }

  $('loginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = $('loginBtn');
    btn.disabled = true;
    $('loginError').hidden = true;
    RavanAPI.login($('pw').value).then(function () {
      $('pw').value = '';
      showDash();
    }).catch(function (err) {
      $('loginError').textContent = err.code === 'DENIED' || err.code === 'RATE' ? err.message : 'Could not reach the server. Check API_URL in js/config.js.';
      $('loginError').hidden = false;
    }).finally(function () { btn.disabled = false; });
  });

  $('logoutBtn').addEventListener('click', function () { RavanAPI.logout(); showLogin(); });

  function handleErr(err) {
    if (err && err.code === 'AUTH') { toast('Session expired — please log in again.', true); showLogin(); return; }
    toast((err && err.message) || 'Something went wrong', true);
  }

  // ---------- data ----------
  function refresh(silent) {
    return RavanAPI.list().then(function (d) {
      data = d;
      render();
      if (!silent) setupShare();
    }).catch(handleErr);
  }
  $('refreshBtn').addEventListener('click', function () { refresh().then(function () { toast('Updated'); }); });

  function render() {
    var subs = data.submissions || [];
    var real = subs.filter(function (s) { return !s.isDemo; });
    var demo = subs.filter(function (s) { return s.isDemo; });
    var burned = real.filter(function (s) { return s.burned; });
    $('kpiTotal').textContent = real.length;
    $('kpiDemo').textContent = demo.length;
    $('kpiBurned').textContent = burned.length;
    $('kpiBurnedNote').textContent = burned.length ? 'burned ' + fmtTime(burned[0].burnedAt) : 'not yet';
    var latest = real.slice().sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; })[0];
    $('kpiLatest').textContent = latest ? fmtTime(latest.createdAt) : '—';

    var pill = $('statePill');
    pill.textContent = STATE_LABEL[data.state] || data.state;
    pill.className = 'state-pill' + (data.state === 'SUBMISSIONS_OPEN' ? ' open' : /BURN|FINAL/.test(data.state) ? ' burned' : '');
    $('sealBtn').textContent = data.state === 'SUBMISSIONS_OPEN' ? '🔒 Seal the box' : '🔓 Reopen submissions';

    renderChart($('includeDemo').checked ? subs : real);
    renderWall(subs);
  }

  function fmtTime(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  // ---------- chart: one series, sorted, direct labels ----------
  function renderChart(list) {
    var counts = {};
    RAVAN_CATEGORIES.forEach(function (c) { counts[c.id] = 0; });
    list.forEach(function (s) { counts[s.category] = (counts[s.category] || 0) + 1; });
    var rows = RAVAN_CATEGORIES.map(function (c) { return { c: c, n: counts[c.id] || 0 }; })
      .sort(function (a, b) { return b.n - a.n || RAVAN_CATEGORIES.indexOf(a.c) - RAVAN_CATEGORIES.indexOf(b.c); });
    var max = Math.max(1, rows[0].n);
    var total = list.length;
    var chart = $('chart');
    chart.textContent = '';
    $('chartEmpty').hidden = total > 0;
    rows.forEach(function (r) {
      var row = document.createElement('div');
      row.className = 'bar-row' + (r.n ? '' : ' zero');
      row.setAttribute('role', 'listitem');
      row.tabIndex = 0;
      var pct = total ? Math.round((r.n / total) * 100) : 0;
      row.setAttribute('aria-label', r.c.label + ': ' + r.n + (total ? ' (' + pct + '%)' : ''));
      var lab = document.createElement('span');
      lab.className = 'bar-label';
      lab.textContent = r.c.emoji + ' ' + r.c.label;
      var track = document.createElement('span');
      track.className = 'bar-track';
      var bar = document.createElement('span');
      bar.className = 'bar';
      bar.style.width = (r.n / max) * 82 + '%';
      var val = document.createElement('span');
      val.className = 'bar-value';
      val.textContent = r.n;
      var tip = document.createElement('span');
      tip.className = 'tip';
      tip.textContent = r.c.label + ' — ' + r.n + (total ? ' · ' + pct + '%' : '');
      track.appendChild(bar); track.appendChild(val);
      row.appendChild(lab); row.appendChild(track); row.appendChild(tip);
      chart.appendChild(row);
    });
  }
  $('includeDemo').addEventListener('change', render);

  // ---------- chit wall ----------
  function renderWall(subs) {
    var list = subs.filter(function (s) { return filter === 'all' || (filter === 'demo' ? s.isDemo : !s.isDemo); })
      .sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; });
    var wall = $('wall');
    wall.textContent = '';
    $('wallEmpty').hidden = list.length > 0;
    list.forEach(function (s) {
      var el = Chit.create(s);
      var rnd = el.__rnd;
      el.style.transform = 'rotate(' + ((rnd() - 0.5) * 9).toFixed(2) + 'deg) translateY(' + ((rnd() - 0.5) * 14).toFixed(1) + 'px)';
      el.style.marginTop = (rnd() * 10).toFixed(0) + 'px';
      if (s.isDemo) { var t = document.createElement('span'); t.className = 'chit-tag demo'; t.textContent = 'DEMO'; el.appendChild(t); }
      if (s.burned) { el.classList.add('is-burned'); var b = document.createElement('span'); b.className = 'chit-tag burned'; b.textContent = '🔥 BURNED'; el.appendChild(b); }
      var time = document.createElement('span');
      time.className = 'chit-time';
      time.textContent = fmtTime(s.createdAt);
      el.querySelector('.chit-paper').appendChild(time);
      wall.appendChild(el);
    });
  }
  Array.prototype.forEach.call(document.querySelectorAll('.seg-btn'), function (b) {
    b.addEventListener('click', function () {
      filter = b.getAttribute('data-filter');
      Array.prototype.forEach.call(document.querySelectorAll('.seg-btn'), function (x) { x.classList.toggle('is-on', x === b); });
      renderWall(data.submissions || []);
    });
  });

  // ---------- ceremony controls ----------
  $('startBtn').addEventListener('click', function () {
    var n = (data.submissions || []).filter(function (s) { return !s.isDemo; }).length;
    var already = /BURNED|FINAL_MESSAGE/.test(data.state);
    var text = already
      ? 'This ceremony has already been completed. It will open on the final screen — press R there (or Reset here) to run it again.'
      : 'Starting the ceremony seals the Ravan Box — employees can no longer submit. ' + n + ' real Ravan' + (n === 1 ? '' : 's') + ' will be revealed (demo data is excluded).';
    confirmBox('🎬 Start the ceremony?', text, null, 'Start').then(function (ok) {
      if (!ok) return;
      var p = data.state === 'SUBMISSIONS_OPEN' ? RavanAPI.setState('CEREMONY_READY') : Promise.resolve();
      p.then(function () { location.href = '../ceremony/'; }).catch(handleErr);
    });
  });
  function testCeremony() { location.href = '../ceremony/?mode=test'; }
  $('testBtn').addEventListener('click', testCeremony);
  $('testBtn2').addEventListener('click', testCeremony);

  $('sealBtn').addEventListener('click', function () {
    var open = data.state === 'SUBMISSIONS_OPEN';
    var p = open
      ? confirmBox('Seal the Ravan Box?', 'Employees will see “The Ravan Box is sealed” and cannot submit.', null, 'Seal')
      : confirmBox('Reopen submissions?', 'Employees can submit again. Burn flags are cleared so the ceremony can run fresh.', null, 'Reopen');
    p.then(function (ok) {
      if (!ok) return;
      (open ? RavanAPI.setState('CEREMONY_READY') : RavanAPI.resetCeremony('SUBMISSIONS_OPEN'))
        .then(function () { toast(open ? 'Box sealed' : 'Submissions reopened'); refresh(true); }).catch(handleErr);
    });
  });

  $('resetBtn').addEventListener('click', function () {
    confirmBox('Reset ceremony?', 'Resets the presentation state to “submissions open” and clears burn flags. No submissions are deleted.', 'RESET', 'Reset')
      .then(function (ok) {
        if (!ok) return;
        RavanAPI.resetCeremony('SUBMISSIONS_OPEN').then(function () { toast('Ceremony reset — all submissions kept'); refresh(true); }).catch(handleErr);
      });
  });

  // ---------- demo ----------
  Array.prototype.forEach.call(document.querySelectorAll('[data-demo]'), function (b) {
    b.addEventListener('click', function () {
      var n = +b.getAttribute('data-demo');
      b.disabled = true;
      RavanAPI.generateDemo(n).then(function () { toast('Added ' + n + ' demo Ravans'); return refresh(true); })
        .catch(handleErr).finally(function () { b.disabled = false; });
    });
  });
  $('clearDemoBtn').addEventListener('click', function () {
    confirmBox('Clear demo data?', 'Removes only entries marked as demo. Real submissions are untouched.', null, 'Clear demo')
      .then(function (ok) {
        if (!ok) return;
        RavanAPI.clearDemo().then(function (r) { toast('Removed ' + r.removed + ' demo entries'); refresh(true); }).catch(handleErr);
      });
  });

  // ---------- share: QR + link ----------
  function publicUrl() {
    if (cfg.PUBLIC_URL) return cfg.PUBLIC_URL;
    return new URL('../', location.href).href.replace(/index\.html$/, '');
  }
  function setupShare() {
    var url = publicUrl();
    $('publicUrl').textContent = url;
    RavanQR.draw($('qrCanvas'), url);
    $('posterLink').href = 'poster.html?url=' + encodeURIComponent(url);
    var localAddr = location.protocol === 'file:' || /^(localhost|127\.|\[::1\])/.test(location.hostname);
    var note = localAddr ? 'This is a local address — deploy to GitHub Pages (or set PUBLIC_URL) before printing.'
      : RavanAPI.isLocal() ? 'Local mode: phones can open this page, but their chits stay on their own phone until API_URL is configured.' : '';
    $('publicUrlNote').hidden = !note;
    $('publicUrlNote').textContent = note;
  }
  $('downloadQr').addEventListener('click', function () {
    // larger, print-quality PNG
    var c = document.createElement('canvas');
    c.width = c.height = 1200;
    RavanQR.draw(c, publicUrl(), { frame: true }).then(function () {
      var a = document.createElement('a');
      a.download = 'digital-ravan-box-qr.png';
      a.href = c.toDataURL('image/png');
      document.body.appendChild(a); a.click(); a.remove();
    }).catch(function () { toast('Could not create the QR image', true); });
  });
  $('copyLink').addEventListener('click', function () {
    var url = publicUrl();
    var done = function () { toast('Link copied: ' + url); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(url).then(done, fallback);
    else fallback();
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = url; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { toast(url); }
      ta.remove();
    }
  });

  $('localBanner').hidden = !RavanAPI.isLocal();

  if (RavanAPI.hasToken()) showDash(); else showLogin();
})();
