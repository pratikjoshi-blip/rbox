/* Treasure hunt — TV leaderboard. Read-only; polls state and ticks stopwatches locally. */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var H = window.RavanHunt;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var POLL_MS = 2500;
  var fire = new FireStage($('fireCanvas'));
  var st = null, offset = 0, prev = null, failures = 0, winnerShown = false;

  function el(tag, className, text) { var e = document.createElement(tag); if (className) e.className = className; if (text != null) e.textContent = text; return e; }
  function now() { return Date.now() + offset; }

  function pop(big, small, cls) {
    if (reduce) return;
    var p = el('div', 'pop');
    p.appendChild(el('div', 'p ' + (cls || 'pos'), big));
    p.appendChild(el('div', 'w', small));
    document.body.appendChild(p);
    setTimeout(function () { p.remove(); }, 2000);
  }

  function watchCell(node, s) {
    node.className = 'tv-watch' + (s.running ? ' running' : '');
    node.textContent = s.started ? H.clock(s.elapsed) : '—';
    var small = el('small');
    if (!s.started) small.textContent = 'not started';
    else if (s.running) small.textContent = '⏱ running';
    else small.appendChild(el('span', s.bonus ? 'bonus' : '', s.bonus ? '⚡ +' + s.bonus + ' bonus' : 'finished'));
    node.appendChild(small);
  }

  function render() {
    if (!st || !st.game) {
      $('tvEmpty').hidden = false; $('winner').hidden = true; fire.goldDust(false); winnerShown = false;
      $('board').textContent = ''; return;
    }
    $('tvEmpty').hidden = true;
    var rows = H.standings(st, now());
    var board = $('board');
    var before = {};
    Array.prototype.forEach.call(board.children, function (c) { before[c.dataset.team] = c.getBoundingClientRect().top; });
    board.textContent = '';
    rows.forEach(function (r) {
      var row = el('div', 'team' + (r.rank === 1 && r.points ? ' lead' : '') + (r.running ? ' now' : ''));
      row.dataset.team = r.index;
      row.appendChild(el('div', 'rank', r.rank === 1 && r.points ? '👑' : '#' + r.rank));
      var mid = el('div');
      mid.appendChild(el('div', 'name', r.name));
      var pips = el('div', 'pips');
      st.game.clues.forEach(function (p, k) {
        var pip = el('div', 'pip' + (k < r.found ? ' got' : k === r.found && r.running ? ' next' : ''));
        pip.appendChild(el('b', null, (k < r.found ? '✓ ' : '') + '+' + p));
        pip.appendChild(document.createTextNode(H.NAMES[k]));
        pips.appendChild(pip);
      });
      mid.appendChild(pips);
      row.appendChild(mid);
      var w = el('div'); w.dataset.watch = r.index; watchCell(w, r); row.appendChild(w);
      row.appendChild(el('div', 'score', String(r.points)));
      board.appendChild(row);
    });
    if (!reduce) Array.prototype.forEach.call(board.children, function (c) {
      var b = before[c.dataset.team];
      if (b == null) return;
      var dy = b - c.getBoundingClientRect().top;
      if (Math.abs(dy) > 1) c.animate([{ transform: 'translateY(' + dy + 'px)' }, { transform: 'none' }], { duration: 650, easing: 'cubic-bezier(.2,.8,.2,1)' });
    });

    // winner once every team has finished
    var allDone = rows.length && rows.every(function (r) { return r.finished; });
    if (allDone) {
      var winners = rows.filter(function (r) { return r.rank === 1; });
      $('winLabel').textContent = winners.length > 1 ? "IT'S A TIE" : 'WINNER';
      $('winName').textContent = winners.map(function (x) { return x.name; }).join(' & ');
      var fb = $('finalBoard'); fb.textContent = '';
      rows.forEach(function (r) {
        var d = el('div');
        d.appendChild(el('span', null, '#' + r.rank)); d.appendChild(el('span', null, r.name + ' · ' + H.clock(r.elapsed)));
        d.appendChild(el('span', null, r.points + ' pts'));
        fb.appendChild(d);
      });
      if (!winnerShown) {
        winnerShown = true;
        setTimeout(function () { $('winner').hidden = false; if (!reduce) fire.goldDust(true); }, prev ? 2200 : 0);
      }
    } else { winnerShown = false; $('winner').hidden = true; fire.goldDust(false); }
  }

  /* announce what changed since the last poll */
  function announce(oldSt, newSt) {
    if (!oldSt || !oldSt.game || oldSt.game.id !== newSt.game.id) return;
    newSt.teams.forEach(function (t, i) {
      var o = oldSt.teams[i];
      if (!o) return;
      if (!o.start && t.start) pop('GO!', t.name + ' · stopwatch started', 'zero');
      if (t.found.length === o.found.length + 1) {
        var s = H.teamStatus(newSt.game, t, now());
        var k = t.found.length - 1;
        if (s.finished) {
          pop('🏁 ' + H.clock(s.elapsed), t.name + ' finished · +' + newSt.game.clues[k] + (s.bonus ? ' & ⚡ +' + s.bonus + ' bonus' : ''));
          var cell = document.querySelector('[data-team="' + i + '"] .score');
          if (cell && !reduce) { var b = cell.getBoundingClientRect(); fire.emberBurst(b.left + b.width / 2, b.top + b.height / 2, 70); }
        } else {
          pop('+' + newSt.game.clues[k], t.name + ' found ' + H.NAMES[k]);
        }
      }
    });
  }

  function tick() {
    if (document.hidden) return setTimeout(tick, POLL_MS);
    RavanAPI.huntState().then(function (s) {
      failures = 0; $('liveDot').classList.remove('off'); $('liveText').textContent = 'Live';
      if (s.now) offset = new Date(s.now).getTime() - Date.now();
      if (!st || s.v !== st.v || (s.game && st.game && s.game.id !== st.game.id) || !s.game !== !st.game) {
        prev = st; st = s;
        if (s.game) announce(prev, s);
        render();
      }
    }).catch(function () {
      failures++;
      if (failures >= 2) { $('liveDot').classList.add('off'); $('liveText').textContent = 'Reconnecting…'; }
    }).finally(function () { setTimeout(tick, POLL_MS); });
  }
  tick();

  // running stopwatches tick every second
  setInterval(function () {
    if (!st || !st.game) return;
    Array.prototype.forEach.call(document.querySelectorAll('[data-watch]'), function (w) {
      var t = st.teams[+w.dataset.watch];
      if (t) { var s = H.teamStatus(st.game, t, now()); if (s.running) watchCell(w, s); }
    });
  }, 1000);

  function fs() { if (!document.fullscreenElement && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen(); else if (document.exitFullscreen) document.exitFullscreen(); }
  document.addEventListener('keydown', function (e) { if (e.key === 'f' || e.key === 'F') fs(); });
  document.addEventListener('dblclick', fs);
})();
