/* Ravan Darts — phone scorer: sign in → set up teams → tap number → inside / outside ring. */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var D = window.RavanDarts;
  var st = { game: null, throws: [] };
  var busy = false;
  var picked = null;
  var editingSetup = false;

  // ---------- helpers ----------
  var savingTimer;
  function flash(text, isErr, ms) {
    var s = $('saving');
    s.textContent = text; s.classList.toggle('err', !!isErr); s.hidden = false;
    clearTimeout(savingTimer);
    if (ms !== 0) savingTimer = setTimeout(function () { s.hidden = true; }, ms || 1600);
  }
  function views(name) {
    ['vLogin', 'vSetup', 'vPlay', 'vOver'].forEach(function (v) { $(v).hidden = v !== name; });
    $('menu').hidden = name === 'vLogin'; $('dangerZone').hidden = name === 'vLogin';
  }
  function cls(p) { return p > 0 ? 'pos' : p < 0 ? 'neg' : 'zero'; }
  function el(tag, className, text) { var e = document.createElement(tag); if (className) e.className = className; if (text != null) e.textContent = text; return e; }

  function handleErr(err) {
    if (err && err.code === 'AUTH') { views('vLogin'); flash('Please sign in again', true); return; }
    if (err && err.code === 'STALE') { flash('Updated from another device', false); return load(); }
    flash((err && err.message) || 'Could not save — check the connection', true, 3200);
  }

  // ---------- pad ----------
  for (var n = 1; n <= 20; n++) {
    var b = el('button', 'num ' + (n % 2 ? 'odd' : 'even'), String(n));
    b.type = 'button'; b.setAttribute('data-hit', String(n));
    b.setAttribute('aria-label', n + (n % 2 ? ', odd, subtracts' : ', even, adds'));
    $('pad').appendChild(b);
  }
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-hit]');
    if (!t || busy) return;
    var hit = t.getAttribute('data-hit');
    if (hit === 'MISS' || hit === 'BULL') return record(hit, '');
    picked = Number(hit);
    $('zoneTitle').textContent = 'Number ' + picked + ' — where did it land?';
    $('ptsIn').textContent = D.fmt(D.points(picked, 'in'));
    $('ptsOut').textContent = D.fmt(D.points(picked, 'out'));
    $('ptsIn').className = cls(D.points(picked, 'in'));
    $('ptsOut').className = cls(D.points(picked, 'out'));
    $('zoneSheet').hidden = false; $('backdrop').hidden = false;
    $('zoneSheet').querySelector('[data-zone="in"]').focus();
  });
  function closeSheet() { $('zoneSheet').hidden = true; $('backdrop').hidden = true; picked = null; }
  Array.prototype.forEach.call(document.querySelectorAll('[data-zone]'), function (b) {
    b.addEventListener('click', function () { var h = picked; var z = b.getAttribute('data-zone'); closeSheet(); if (h) record(h, z); });
  });
  $('zoneCancel').addEventListener('click', closeSheet);
  $('backdrop').addEventListener('click', closeSheet);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('zoneSheet').hidden) closeSheet(); });

  // ---------- server calls ----------
  function apply(state) {
    st = state || { game: null, throws: [] };
    render();
  }
  function load() {
    return RavanAPI.dartsState().then(apply).catch(handleErr);
  }
  function record(hit, zone) {
    if (!st.game || busy) return;
    var turn = D.turn(st.game, st.throws.length);
    if (turn.over) return;
    busy = true; setBusy(true);
    var team = st.game.teams[turn.team];
    var pts = D.points(hit, zone, st.game.bullPoints);
    flash('Saving ' + team + ' ' + D.fmt(pts) + '…', false, 0);
    RavanAPI.dartsThrow(st.throws.length, hit, zone).then(function (s) {
      apply(s);
      flash(team + ' ' + D.fmt(pts) + ' ✓');
      if (navigator.vibrate) navigator.vibrate(30);
    }).catch(handleErr).finally(function () { busy = false; setBusy(false); });
  }
  function undo() {
    if (!st.throws.length || busy) return;
    var last = st.throws[st.throws.length - 1];
    if (!window.confirm('Undo the last dart? (' + st.game.teams[last.t] + ': ' + D.label(last) + ' ' + D.fmt(last.p) + ')')) return;
    busy = true; setBusy(true);
    RavanAPI.dartsUndo(st.throws.length).then(function (s) { apply(s); flash('Last dart removed'); })
      .catch(handleErr).finally(function () { busy = false; setBusy(false); });
  }
  function setBusy(on) {
    Array.prototype.forEach.call(document.querySelectorAll('.num, #undoBtn, #overUndo'), function (b) { b.disabled = on; });
  }
  $('undoBtn').addEventListener('click', undo);
  $('overUndo').addEventListener('click', undo);
  $('refreshBtn').addEventListener('click', function () { load().then(function () { flash('Up to date'); }); });

  // ---------- render ----------
  function miniBoard(target, turnTeam) {
    var box = $(target); box.textContent = '';
    D.standings(st.game, st.throws).forEach(function (r) {
      var row = el('div', 'mini-row' + (r.index === turnTeam ? ' now' : ''));
      row.appendChild(el('span', 'rk', '#' + r.rank));
      row.appendChild(el('span', 'nm', r.name));
      row.appendChild(el('span', 'sc ' + cls(r.score), D.fmtScore(r.score)));
      box.appendChild(row);
    });
  }

  function render() {
    if (!RavanAPI.dartsHasToken()) return views('vLogin');
    if (!st.game || editingSetup) { fillSetup(); return views('vSetup'); }
    var g = st.game, turn = D.turn(g, st.throws.length);
    if (turn.over) {
      var top = D.standings(g, st.throws);
      var winners = top.filter(function (r) { return r.rank === 1; });
      $('overWinner').textContent = winners.length > 1 ? 'TIE: ' + winners.map(function (w) { return w.name; }).join(' & ') : winners[0].name + ' WINS';
      $('overNote').textContent = 'Game over · ' + g.rounds + ' rounds · ' + st.throws.length + ' darts';
      miniBoard('overBoard', -1);
      return views('vOver');
    }
    views('vPlay');
    $('turnRound').textContent = 'Round ' + turn.round + ' of ' + g.rounds + ' · dart ' + turn.dart + ' of ' + g.dartsPerTurn;
    $('turnTeam').textContent = g.teams[turn.team];
    var dots = $('turnDots'); dots.textContent = '';
    for (var i = 1; i <= g.dartsPerTurn; i++) dots.appendChild(el('span', 'dot' + (i < turn.dart ? ' done' : i === turn.dart ? ' now' : '')));
    var tt = $('thisTurn'); tt.textContent = '';
    var startOfTurn = st.throws.length - (turn.dart - 1);
    st.throws.slice(startOfTurn).forEach(function (t) {
      tt.appendChild(el('span', 'pill ' + cls(t.p), D.label(t).replace(' · ', ' ') + ' ' + D.fmt(t.p)));
    });
    if (!tt.childNodes.length) tt.appendChild(el('span', 'note', 'First dart of this turn'));
    $('undoBtn').disabled = !st.throws.length;
    miniBoard('miniBoard', turn.team);
  }

  // ---------- setup (teams come from the global list at /teams/) ----------
  var picker = TeamPicker($('teamPicker'), { manageHref: '../../teams/', orderHint: 'badge = throwing order' });
  var setupLoaded = false;
  function fillSetup() {
    if (setupLoaded) return;
    setupLoaded = true;
    picker.load(st.game && st.game.teamIds).catch(function () { flash('Could not load teams', true); });
    if (st.game) { $('rounds').value = st.game.rounds; $('perTurn').value = st.game.dartsPerTurn; $('bull').value = st.game.bullPoints; }
    $('cancelSetup').hidden = !st.game;
  }
  $('setupForm').addEventListener('submit', function (e) {
    e.preventDefault();
    $('setupMsg').hidden = true;
    var ids = picker.selected();
    if (ids.length < 2) { $('setupMsg').textContent = 'Pick at least 2 teams.'; $('setupMsg').hidden = false; return; }
    if (st.game && st.throws.length && !window.confirm('Start a new game? The current game (' + st.throws.length + ' darts) is saved to history and the board resets.')) return;
    $('startBtn').disabled = true;
    RavanAPI.dartsNewGame({ teamIds: ids, rounds: +$('rounds').value, dartsPerTurn: +$('perTurn').value, bullPoints: +$('bull').value })
      .then(function (s) { editingSetup = false; apply(s); flash('Game on! 🎯'); })
      .catch(function (err) { if (err.code === 'AUTH') return handleErr(err); $('setupMsg').textContent = err.message; $('setupMsg').hidden = false; })
      .finally(function () { $('startBtn').disabled = false; });
  });
  function openSetup() { editingSetup = true; setupLoaded = false; render(); window.scrollTo(0, 0); }
  $('newGameBtn').addEventListener('click', openSetup);
  $('overNew').addEventListener('click', openSetup);
  $('cancelSetup').addEventListener('click', function () { editingSetup = false; render(); });

  // ---------- testing reset (only this game's tab) ----------
  $('resetBtn').addEventListener('click', function () {
    var typed = window.prompt('Type RESET to wipe the darts board (current game and history). Ravan Box chits are not affected.');
    if (typed === null) return;
    if (typed.trim().toUpperCase() !== 'RESET') { flash('Not reset — type RESET exactly', true); return; }
    RavanAPI.dartsReset().then(function (s) { editingSetup = false; setupLoaded = false; apply(s); flash('Reset ✓'); window.scrollTo(0, 0); }).catch(handleErr);
  });

  // explain login failures: wrong PIN / rate limit / outdated backend / no connection
  function loginError(err) {
    if (err && (err.code === 'DENIED' || err.code === 'RATE')) return err.message;
    if (err && err.code === 'AUTH') return 'The server is running an older backend. In Apps Script, paste the latest Code.gs and deploy a New version (Deploy → Manage deployments → Edit).';
    if (err && err.code) return err.message;
    return 'Could not reach the server. Check your connection and API_URL in js/config.js.';
  }
  // ---------- login ----------
  $('loginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    $('loginBtn').disabled = true; $('loginMsg').hidden = true;
    RavanAPI.dartsLogin($('pin').value).then(function () { $('pin').value = ''; return load(); })
      .catch(function (err) { $('loginMsg').textContent = loginError(err); $('loginMsg').hidden = false; })
      .finally(function () { $('loginBtn').disabled = false; });
  });

  // keep in sync if a second scorer is used
  setInterval(function () { if (!busy && !document.hidden && RavanAPI.dartsHasToken() && $('zoneSheet').hidden) RavanAPI.dartsState().then(function (s) {
    if (!busy && (!st.updatedAt || s.updatedAt !== st.updatedAt)) apply(s);
  }).catch(function () {}); }, 6000);

  if (RavanAPI.dartsHasToken()) load(); else views('vLogin');
})();
