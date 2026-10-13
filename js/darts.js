/*
 * Ravan Darts — shared rules for the scorer (phone) and the scoreboard (TV).
 * The server (Code.gs / local-backend.js) is the source of truth for points;
 * this file only previews points and derives turns, totals and rankings.
 *
 *   odd  outside the ring → −n      odd  inside the ring → −n/2
 *   even outside the ring → +n      even inside the ring → +2n
 *   MISS → 0, BULL → game.bullPoints
 */
(function () {
  function points(hit, zone, bullPoints) {
    if (hit === 'MISS') return 0;
    if (hit === 'BULL') return Number(bullPoints) || 0;
    var n = Number(hit);
    if (n % 2) return zone === 'in' ? -n / 2 : -n;
    return zone === 'in' ? n * 2 : n;
  }

  /* Whose turn is it after `count` darts? Teams throw in order, dartsPerTurn darts each. */
  function turn(game, count) {
    var per = game.dartsPerTurn, nTeams = game.teams.length;
    var total = per * nTeams * game.rounds;
    var turnIndex = Math.floor(count / per);
    return {
      over: count >= total,
      team: turnIndex % nTeams,
      round: Math.min(game.rounds, Math.floor(turnIndex / nTeams) + 1),
      dart: (count % per) + 1,
      thrown: count,
      total: total
    };
  }

  /* Team totals + competition ranking (ties share a rank: 1, 2, 2, 4). */
  function standings(game, throws) {
    var rows = game.teams.map(function (name, i) { return { index: i, name: name, score: 0, darts: 0, last: null }; });
    throws.forEach(function (t) {
      var r = rows[t.t];
      if (!r) return;
      r.score += t.p; r.darts++; r.last = t;
    });
    rows.forEach(function (r) { r.score = Math.round(r.score * 10) / 10; });
    var sorted = rows.slice().sort(function (a, b) { return b.score - a.score || a.index - b.index; });
    sorted.forEach(function (r, i) { r.rank = i && sorted[i - 1].score === r.score ? sorted[i - 1].rank : i + 1; });
    return sorted;
  }

  function fmt(p) {
    var s = Math.abs(p) % 1 ? Math.abs(p).toFixed(1) : String(Math.abs(p));
    return (p > 0 ? '+' : p < 0 ? '−' : '±') + s;
  }
  function fmtScore(p) {
    var s = Math.abs(p) % 1 ? Math.abs(p).toFixed(1) : String(Math.abs(p));
    return (p < 0 ? '−' : '') + s;
  }
  function label(t) {
    if (t.h === 'MISS') return 'Miss';
    if (t.h === 'BULL') return 'Bullseye';
    return t.h + (t.z === 'in' ? ' · inside ring' : ' · outside ring');
  }

  window.RavanDarts = { points: points, turn: turn, standings: standings, fmt: fmt, fmtScore: fmtScore, label: label };
})();
