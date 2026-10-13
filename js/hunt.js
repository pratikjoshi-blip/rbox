/*
 * Treasure hunt — shared rules for the scorer (phone) and the leaderboard (TV).
 *   Clue 1 +5 · Clue 2 +10 · Clue 3 +15 · Final clue +20  (found in order)
 *   All clues within 5:00 → +20 bonus · within 10:00 → +10 bonus
 *   Ranking: points, then the faster finish
 */
(function () {
  var NAMES = ['Clue 1', 'Clue 2', 'Clue 3', 'Final clue'];

  function ms(a, b) { return new Date(b).getTime() - new Date(a).getTime(); }

  /* nowMs: the current time already corrected to the server clock */
  function teamStatus(game, t, nowMs) {
    var clues = game.clues, n = t.found.length;
    var points = 0;
    for (var i = 0; i < n; i++) points += clues[i];
    var finished = n >= clues.length;
    var elapsed = !t.start ? 0 : finished ? ms(t.start, t.found[n - 1]) : Math.max(0, nowMs - new Date(t.start).getTime());
    var bonus = 0, bonusLabel = '';
    if (finished) {
      for (var k = 0; k < game.bonus.length; k++) {
        if (elapsed <= game.bonus[k][0] * 1000) { bonus = game.bonus[k][1]; bonusLabel = 'within ' + game.bonus[k][0] / 60 + ' min'; break; }
      }
    }
    return {
      name: t.name, started: !!t.start, running: !!t.start && !finished, finished: finished,
      found: n, next: finished ? null : { name: NAMES[n] || 'Clue ' + (n + 1), points: clues[n] },
      cluePoints: points, bonus: bonus, bonusLabel: bonusLabel, points: points + bonus, elapsed: elapsed,
      lastAt: n ? new Date(t.found[n - 1]).getTime() : Infinity
    };
  }

  function standings(st, nowMs) {
    var rows = st.teams.map(function (t, i) { var s = teamStatus(st.game, t, nowMs); s.index = i; return s; });
    var sorted = rows.slice().sort(function (a, b) {
      if (b.points !== a.points) return b.points - a.points;
      if (a.finished && b.finished) return a.elapsed - b.elapsed;          // faster finish wins
      if (a.found && a.found === b.found) return a.lastAt - b.lastAt;     // reached the same clue earlier
      return a.index - b.index;
    });
    // teams share a rank only when nothing separates them (same points and same time key)
    var key = function (r) { return r.points + '|' + (r.finished ? 'f' + r.elapsed : r.found ? 'c' + r.lastAt : '-'); };
    sorted.forEach(function (r, i) {
      r.rank = i && key(sorted[i - 1]) === key(r) ? sorted[i - 1].rank : i + 1;
    });
    return sorted;
  }

  function clock(msVal) {
    var s = Math.floor(msVal / 1000), m = Math.floor(s / 60);
    return m + ':' + ('0' + (s % 60)).slice(-2);
  }

  window.RavanHunt = { NAMES: NAMES, teamStatus: teamStatus, standings: standings, clock: clock };
})();
