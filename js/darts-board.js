/* Ravan Darts — TV scoreboard. Read-only; polls the shared game state. */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var D = window.RavanDarts;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var POLL_MS = 2500;
  var fire = new FireStage($('fireCanvas'));
  var last = { key: '', count: -1, gameId: '', over: false };
  var failures = 0;

  function el(tag, className, text) { var e = document.createElement(tag); if (className) e.className = className; if (text != null) e.textContent = text; return e; }
  function cls(p) { return p > 0 ? 'pos' : p < 0 ? 'neg' : 'zero'; }

  /* Reorder rows with a FLIP animation so rank changes slide into place. */
  function renderBoard(rows, nowTeam, bumped) {
    var board = $('board');
    var before = {};
    Array.prototype.forEach.call(board.children, function (c) { before[c.dataset.team] = c.getBoundingClientRect().top; });
    var existing = {};
    Array.prototype.forEach.call(board.children, function (c) { existing[c.dataset.team] = c; });
    board.textContent = '';
    rows.forEach(function (r) {
      var row = existing[r.index] || el('div', 'team');
      row.dataset.team = r.index;
      row.className = 'team' + (r.rank === 1 && r.darts ? ' lead' : '') + (r.index === nowTeam ? ' now' : '');
      row.textContent = '';
      row.appendChild(el('div', 'rank', r.rank === 1 && r.darts ? '👑' : '#' + r.rank));
      var mid = el('div');
      mid.appendChild(el('div', 'name', r.name));
      mid.appendChild(el('span', 'meta', r.darts + ' dart' + (r.darts === 1 ? '' : 's') + (r.last ? ' · last ' + D.fmt(r.last.p) : '')));
      row.appendChild(mid);
      var sc = el('div', 'score' + (r.score < 0 ? ' neg-score' : ''), D.fmtScore(r.score));
      if (r.index === bumped && !reduce) sc.classList.add('bump');
      row.appendChild(sc);
      board.appendChild(row);
    });
    if (reduce) return;
    Array.prototype.forEach.call(board.children, function (c) {
      var b = before[c.dataset.team];
      if (b == null) return;
      var dy = b - c.getBoundingClientRect().top;
      if (Math.abs(dy) > 1) c.animate([{ transform: 'translateY(' + dy + 'px)' }, { transform: 'none' }], { duration: 650, easing: 'cubic-bezier(.2,.8,.2,1)' });
    });
  }

  function pop(t, teamName) {
    if (reduce) return;
    var p = el('div', 'pop');
    p.appendChild(el('div', 'p ' + cls(t.p), D.fmt(t.p)));
    p.appendChild(el('div', 'w', teamName + ' · ' + D.label(t)));
    document.body.appendChild(p);
    setTimeout(function () { p.remove(); }, 2000);
    if (t.p >= 20) {
      var r = $('board').querySelector('[data-team="' + t.t + '"] .score');
      if (r) { var b = r.getBoundingClientRect(); fire.emberBurst(b.left + b.width / 2, b.top + b.height / 2, 60); }
    }
  }

  function render(st) {
    var g = st.game;
    $('tvEmpty').hidden = !!g;
    if (!g) { $('winner').hidden = true; fire.goldDust(false); last = { key: '', count: -1, gameId: '', over: false }; return; }
    var key = g.id + ':' + st.throws.length + ':' + (st.updatedAt || '');
    if (key === last.key) return;
    var newDart = last.gameId === g.id && st.throws.length === last.count + 1 ? st.throws[st.throws.length - 1] : null;

    var turn = D.turn(g, st.throws.length);
    var rows = D.standings(g, st.throws);
    renderBoard(rows, turn.over ? -1 : turn.team, newDart ? newDart.t : -1);

    $('nowTeam').textContent = turn.over ? 'Game over' : g.teams[turn.team];
    $('nowInfo').textContent = turn.over ? g.rounds + ' rounds played' : 'Round ' + turn.round + ' of ' + g.rounds + ' · dart ' + turn.dart + ' of ' + g.dartsPerTurn;
    var dots = $('nowDots'); dots.textContent = '';
    if (!turn.over) for (var i = 1; i <= g.dartsPerTurn; i++) dots.appendChild(el('span', 'dot' + (i < turn.dart ? ' done' : i === turn.dart ? ' now' : '')));
    $('bullRule').innerHTML = '';
    $('bullRule').appendChild(document.createTextNode('Bullseye: '));
    $('bullRule').appendChild(el('span', cls(g.bullPoints), D.fmt(g.bullPoints)));

    var feed = $('feed'); feed.textContent = '';
    st.throws.slice(-8).reverse().forEach(function (t) {
      var li = el('li');
      var who = el('span'); who.appendChild(el('b', null, g.teams[t.t])); who.appendChild(document.createTextNode(' · ' + D.label(t)));
      li.appendChild(who);
      li.appendChild(el('span', 'pts ' + cls(t.p), D.fmt(t.p)));
      if (!newDart) li.style.animation = 'none';
      feed.appendChild(li);
    });
    if (!st.throws.length) feed.appendChild(el('li', null, 'First dart coming up…'));

    if (newDart) pop(newDart, g.teams[newDart.t]);

    // winner reveal
    if (turn.over) {
      var winners = rows.filter(function (r) { return r.rank === 1; });
      $('winLabel').textContent = winners.length > 1 ? "IT'S A TIE" : 'WINNER';
      $('winName').textContent = winners.map(function (w) { return w.name; }).join(' & ');
      var fb = $('finalBoard'); fb.textContent = '';
      rows.forEach(function (r) {
        var d = el('div');
        d.appendChild(el('span', null, '#' + r.rank)); d.appendChild(el('span', null, r.name)); d.appendChild(el('span', null, D.fmtScore(r.score)));
        fb.appendChild(d);
      });
      var show = function () { $('winner').hidden = false; if (!reduce) fire.goldDust(true); };
      if (!last.over && newDart) setTimeout(show, 2100); else show();
    } else {
      $('winner').hidden = true; fire.goldDust(false);
    }
    last = { key: key, count: st.throws.length, gameId: g.id, over: turn.over };
  }

  function tick() {
    if (document.hidden) return setTimeout(tick, POLL_MS);
    RavanAPI.dartsState().then(function (st) {
      failures = 0;
      $('liveDot').classList.remove('off'); $('liveText').textContent = 'Live';
      render(st || { game: null, throws: [] });
    }).catch(function () {
      failures++;
      if (failures >= 2) { $('liveDot').classList.add('off'); $('liveText').textContent = 'Reconnecting…'; }
    }).finally(function () { setTimeout(tick, POLL_MS); });
  }
  tick();

  // fullscreen on F / double-click (TV mode)
  function fs() { if (!document.fullscreenElement && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen(); else if (document.exitFullscreen) document.exitFullscreen(); }
  document.addEventListener('keydown', function (e) { if (e.key === 'f' || e.key === 'F') fs(); });
  document.addEventListener('dblclick', fs);
})();
