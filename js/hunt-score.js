/* Treasure hunt — phone scorer: start each team's stopwatch, tap each clue as it's found. */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var H = window.RavanHunt;
  var st = { game: null, teams: [], v: 0 };
  var offset = 0;          // server clock − phone clock
  var busy = false, editingSetup = false;

  function el(tag, className, text) { var e = document.createElement(tag); if (className) e.className = className; if (text != null) e.textContent = text; return e; }
  var flashTimer;
  function flash(text, isErr, ms) {
    var s = $('saving'); s.textContent = text; s.classList.toggle('err', !!isErr); s.hidden = false;
    clearTimeout(flashTimer); if (ms !== 0) flashTimer = setTimeout(function () { s.hidden = true; }, ms || 1600);
  }
  function views(name) { ['vLogin', 'vSetup', 'vPlay'].forEach(function (v) { $(v).hidden = v !== name; }); $('menu').hidden = name === 'vLogin'; $('dangerZone').hidden = name === 'vLogin'; }
  function now() { return Date.now() + offset; }

  function apply(s) {
    st = s || { game: null, teams: [], v: 0 };
    if (st.now) offset = new Date(st.now).getTime() - Date.now();
    render();
  }
  function load() { return RavanAPI.huntState().then(apply).catch(handleErr); }
  function handleErr(err) {
    if (err && err.code === 'AUTH') { views('vLogin'); flash('Please sign in again', true); return; }
    if (err && err.code === 'STALE') { flash('Updated from another device'); return load(); }
    flash((err && err.message) || 'Could not save — check the connection', true, 3200);
  }
  function act(fn, okText) {
    if (busy) return;
    busy = true; render();
    flash('Saving…', false, 0);
    fn().then(function (s) { apply(s); flash(okText); if (navigator.vibrate) navigator.vibrate(30); })
      .catch(handleErr).finally(function () { busy = false; render(); });
  }

  // ---------- render ----------
  function render() {
    if (!RavanAPI.dartsHasToken()) return views('vLogin');
    if (!st.game || editingSetup) { fillSetup(); return views('vSetup'); }
    views('vPlay');
    $('startAll').hidden = !st.teams.some(function (t) { return !t.start; }) || st.teams.length < 2;
    $('startAll').disabled = busy;
    var box = $('teams'); box.textContent = '';
    st.teams.forEach(function (t, i) {
      var s = H.teamStatus(st.game, t, now());
      var card = el('div', 'hunt-team' + (s.running ? ' running' : s.finished ? ' finished' : ''));
      var top = el('div', 'ht-top');
      top.appendChild(el('div', 'ht-name', t.name));
      top.appendChild(el('div', 'ht-pts', s.points + ' pts'));
      card.appendChild(top);
      var watch = el('div', 'ht-watch');
      watch.dataset.team = i;
      fillWatch(watch, s);
      card.appendChild(watch);
      var pips = el('div', 'pips');
      st.game.clues.forEach(function (p, k) {
        var pip = el('div', 'pip' + (k < s.found ? ' got' : k === s.found && s.started ? ' next' : ''));
        pip.appendChild(el('b', null, (k < s.found ? '✓ ' : '') + '+' + p));
        pip.appendChild(document.createTextNode(H.NAMES[k]));
        pips.appendChild(pip);
      });
      card.appendChild(pips);
      var actions = el('div', 'ht-actions');
      var main;
      if (!s.started) {
        main = el('button', 'btn btn-gold', '⏱ Start stopwatch');
        main.addEventListener('click', function () { act(function () { return RavanAPI.huntStart(st.v, i); }, t.name + ' — go! ⏱'); });
      } else if (s.running) {
        main = el('button', 'btn', '✓ ' + s.next.name + ' found · +' + s.next.points);
        main.addEventListener('click', function () {
          var last = s.found === st.game.clues.length - 1;
          act(function () { return RavanAPI.huntClue(st.v, i); }, last ? t.name + ' finished! 🏁' : t.name + ' ' + s.next.name + ' ✓');
        });
      } else {
        main = el('button', 'btn btn-ghost', '🏁 Finished in ' + H.clock(s.elapsed));
        main.disabled = true;
      }
      main.disabled = main.disabled || busy;
      actions.appendChild(main);
      var undo = el('button', 'btn btn-ghost undo', '↶');
      undo.setAttribute('aria-label', 'Undo last action for ' + t.name);
      undo.disabled = busy || !s.started;
      undo.addEventListener('click', function () {
        var what = s.found ? H.NAMES[s.found - 1] : 'the stopwatch start';
        if (!window.confirm('Undo ' + what + ' for ' + t.name + '?')) return;
        act(function () { return RavanAPI.huntUndo(st.v, i); }, 'Undone');
      });
      actions.appendChild(undo);
      card.appendChild(actions);
      box.appendChild(card);
    });
  }
  function fillWatch(node, s) {
    node.textContent = '';
    if (!s.started) { node.textContent = 'Stopwatch not started'; return; }
    if (s.running) { node.textContent = '⏱ ' + H.clock(s.elapsed) + ' running · ' + s.found + ' of 4 clues'; return; }
    node.appendChild(document.createTextNode('🏁 ' + H.clock(s.elapsed) + ' · '));
    node.appendChild(el('span', s.bonus ? 'bonus' : '', s.bonus ? '+' + s.bonus + ' bonus (' + s.bonusLabel + ')' : 'no time bonus'));
  }
  // tick running stopwatches every second without a full re-render
  setInterval(function () {
    if (!st.game || $('vPlay').hidden) return;
    Array.prototype.forEach.call(document.querySelectorAll('.ht-watch'), function (w) {
      var t = st.teams[+w.dataset.team];
      if (t) { var s = H.teamStatus(st.game, t, now()); if (s.running) fillWatch(w, s); }
    });
  }, 1000);

  $('startAll').addEventListener('click', function () {
    if (!window.confirm('Start the stopwatch for every team that has not started yet?')) return;
    act(function () { return RavanAPI.huntStart(st.v, 'all'); }, 'All teams — go! ⏱');
  });
  $('refreshBtn').addEventListener('click', function () { load().then(function () { flash('Up to date'); }); });

  // ---------- setup (teams come from the global list at /teams/) ----------
  var picker = TeamPicker($('teamPicker'), { manageHref: '../../teams/' });
  var setupLoaded = false;
  function fillSetup() {
    if (setupLoaded) return;
    setupLoaded = true;
    var pre = st.game ? st.teams.map(function (t) { return t.id; }).filter(Boolean) : null;
    picker.load(pre).catch(function () { flash('Could not load teams', true); });
    $('cancelSetup').hidden = !st.game;
  }
  $('setupForm').addEventListener('submit', function (e) {
    e.preventDefault();
    $('setupMsg').hidden = true;
    var ids = picker.selected();
    if (!ids.length) { $('setupMsg').textContent = 'Pick at least 1 team.'; $('setupMsg').hidden = false; return; }
    var inProgress = st.game && st.teams.some(function (t) { return t.start; });
    if (inProgress && !window.confirm('Create a new hunt? The current one is saved to history and the leaderboard resets.')) return;
    $('startBtn').disabled = true;
    RavanAPI.huntNewGame(ids).then(function (s) { editingSetup = false; apply(s); flash('Hunt ready 🗺️'); })
      .catch(function (err) { if (err.code === 'AUTH') return handleErr(err); $('setupMsg').textContent = err.message; $('setupMsg').hidden = false; })
      .finally(function () { $('startBtn').disabled = false; });
  });
  $('newBtn').addEventListener('click', function () { editingSetup = true; setupLoaded = false; render(); window.scrollTo(0, 0); });
  $('cancelSetup').addEventListener('click', function () { editingSetup = false; render(); });

  // ---------- testing reset (only this game's tab) ----------
  $('resetBtn').addEventListener('click', function () {
    var typed = window.prompt('Type RESET to wipe the treasure hunt (current hunt and history). Ravan Box chits are not affected.');
    if (typed === null) return;
    if (typed.trim().toUpperCase() !== 'RESET') { flash('Not reset — type RESET exactly', true); return; }
    RavanAPI.huntReset().then(function (s) { editingSetup = false; setupLoaded = false; apply(s); flash('Reset ✓'); window.scrollTo(0, 0); }).catch(handleErr);
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

  setInterval(function () {
    if (busy || document.hidden || !RavanAPI.dartsHasToken() || editingSetup) return;
    RavanAPI.huntState().then(function (s) { if (!busy && s.v !== st.v) apply(s); }).catch(function () {});
  }, 6000);

  if (RavanAPI.dartsHasToken()) load(); else views('vLogin');
})();
