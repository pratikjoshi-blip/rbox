/*
 * LOCAL MODE backend — runs entirely in the browser (localStorage). No server, no Node.js.
 * Used automatically when RAVAN_CONFIG.API_URL is empty, so the whole experience can be
 * tested by just opening the site. It mirrors backend/apps-script/Code.gs action-for-action.
 *
 * Limits: data lives in THIS browser only (employee page + admin + ceremony must be opened
 * in the same browser). For real use with phones, configure the Apps Script API_URL.
 */
(function () {
  var KEY = 'ravan_local_db_v1';
  var MAX_LEN = 150;
  var TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
  var CATEGORIES = ['anger', 'laziness', 'fear', 'overthinking', 'distraction', 'negativity', 'ego', 'procrastination', 'blame', 'notmyjob', 'other'];
  var STATES = ['SUBMISSIONS_OPEN', 'CEREMONY_READY', 'RAVAN_CLOSED', 'RAVAN_OPENING', 'CHITS_REVEALED', 'BURNING', 'BURNED', 'FINAL_MESSAGE'];

  var DEMO = [
    ['overthinking', 'I want to stop overthinking every small decision.'],
    ['procrastination', 'I want to stop procrastinating.'],
    ['negativity', 'I want to communicate more positively.'],
    ['fear', 'I want to stop worrying about things I cannot control.'],
    ['overthinking', 'I want to let go of unnecessary stress.'],
    ['distraction', 'Checking my phone every 3 minutes during meetings. Sorry team!'],
    ['procrastination', 'Saying "I\'ll do it after lunch" — and then after the next lunch.'],
    ['anger', 'Getting irritated in traffic before I even reach office.'],
    ['ego', 'Needing to win every argument, even about biryani.'],
    ['blame', 'Blaming the Wi-Fi for everything.'],
    ['notmyjob', 'Thinking "not my job" when a teammate needs help.'],
    ['laziness', 'Skipping my evening walk every single day.'],
    ['fear', 'Fear of speaking up in big meetings.'],
    ['overthinking', 'Re-reading my emails 10 times before hitting send.'],
    ['distraction', 'Opening 47 browser tabs and finishing none of them.'],
    ['negativity', 'Complaining about Mondays. Mondays are fine.'],
    ['procrastination', 'Leaving timesheets to the last Friday of the month.'],
    ['ego', 'Not asking for help because I think I should know it already.'],
    ['anger', 'Snapping at people when I am tired.'],
    ['other', 'Comparing my journey with everyone else\'s.'],
    ['laziness', 'Hitting snooze five times every morning.'],
    ['fear', 'Being afraid to try new things in case I fail.'],
    ['blame', 'Saying "it worked on my machine".'],
    ['other', 'Holding grudges from 2019.'],
    ['overthinking', 'Imagining worst-case scenarios before every presentation.'],
    ['distraction', 'Doom-scrolling reels till 1 AM.']
  ];

  function load() {
    try {
      var db = JSON.parse(localStorage.getItem(KEY));
      if (db && db.submissions) return db;
    } catch (e) {}
    return { state: 'SUBMISSIONS_OPEN', stateUpdatedAt: new Date().toISOString(), submissions: [], tokens: {}, loginFails: [], submits: [] };
  }
  function save(db) { localStorage.setItem(KEY, JSON.stringify(db)); }

  function newId() {
    var a = new Uint8Array(8);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }
  function sanitize(text) {
    return String(text == null ? '' : text)
      .replace(/[\u0000-\u001F\u007F]/g, ' ')
      .replace(/[<>]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_LEN);
  }
  function fail(code, msg) { var e = new Error(msg); e.code = code; throw e; }
  function pub(s) {
    return { id: s.id, category: s.category, message: s.message, createdAt: s.createdAt, isDemo: !!s.isDemo, burned: !!s.burned, burnedAt: s.burnedAt || '' };
  }

  function handle(body) {
    var db = load();
    db.tokens = db.tokens || {}; db.loginFails = db.loginFails || []; db.submits = db.submits || [];
    var eventId = sanitize(body.eventId || 'default').slice(0, 60);
    var now = new Date().toISOString();
    var t = Date.now();

    if (body.action === 'status') return { state: db.state, accepting: db.state === 'SUBMISSIONS_OPEN', local: true };

    if (body.action === 'submit') {
      if (db.state !== 'SUBMISSIONS_OPEN') fail('CLOSED', 'Submissions are closed.');
      var category = String(body.category || '');
      if (CATEGORIES.indexOf(category) < 0) fail('INVALID', 'Please choose a valid category.');
      if (typeof body.message === 'string' && body.message.length > MAX_LEN * 2) fail('INVALID', 'Message is too long.');
      var message = sanitize(body.message);
      if (category === 'other' && !message) fail('INVALID', 'Please write what you want to let go of.');
      db.submits = db.submits.filter(function (x) { return t - x < 60000; });
      if (db.submits.length >= 60) fail('RATE', 'Too many submissions. Try again in a minute.');
      db.submits.push(t);
      db.submissions.push({ id: newId(), eventId: eventId, category: category, message: message, createdAt: now, isDemo: false, burned: false, burnedAt: '' });
      save(db);
      return { received: true };
    }

    if (body.action === 'login') {
      db.loginFails = db.loginFails.filter(function (x) { return t - x < 600000; });
      if (db.loginFails.length >= 10) { save(db); fail('RATE', 'Too many attempts. Wait 10 minutes.'); }
      var expected = (window.RAVAN_CONFIG && window.RAVAN_CONFIG.LOCAL_ADMIN_PASSWORD) || 'ravan2026';
      if (String(body.password || '') !== expected) { db.loginFails.push(t); save(db); fail('DENIED', 'Wrong password.'); }
      var token = newId() + newId() + newId();
      db.tokens[token] = t + TOKEN_TTL_MS;
      save(db);
      return { token: token, expiresInSec: TOKEN_TTL_MS / 1000 };
    }

    if (String(body.action).indexOf('darts') === 0) return darts(body, db, t);
    if (String(body.action).indexOf('hunt') === 0) return hunt(body, db, t);
    if (String(body.action).indexOf('teams') === 0) return teamsAction(body, db, t);

    var exp = db.tokens[body.token];
    if (!body.token || !exp || exp < t) fail('AUTH', 'Please log in again.');
    var mine = function (s) { return s.eventId === eventId; };

    switch (body.action) {
      case 'logout':
        delete db.tokens[body.token]; save(db);
        return { loggedOut: true };
      case 'list':
        return { state: db.state, stateUpdatedAt: db.stateUpdatedAt, submissions: db.submissions.filter(mine).map(pub) };
      case 'setState':
        if (STATES.indexOf(body.state) < 0) fail('INVALID', 'Unknown state.');
        db.state = body.state; db.stateUpdatedAt = now; save(db);
        return { state: db.state };
      case 'markBurned':
        var n = 0;
        db.submissions.forEach(function (s) { if (mine(s) && !s.isDemo && !s.burned) { s.burned = true; s.burnedAt = now; n++; } });
        db.state = 'BURNED'; db.stateUpdatedAt = now; save(db);
        return { burned: n, state: db.state };
      case 'resetCeremony':
        var to = ['SUBMISSIONS_OPEN', 'CEREMONY_READY', 'RAVAN_CLOSED'].indexOf(body.toState) >= 0 ? body.toState : 'SUBMISSIONS_OPEN';
        db.submissions.forEach(function (s) { if (mine(s)) { s.burned = false; s.burnedAt = ''; } });
        db.state = to; db.stateUpdatedAt = now; save(db);
        return { state: db.state };
      case 'generateDemo':
        var count = [5, 10, 20, 22].indexOf(+body.count) >= 0 ? +body.count : 5;
        var pool = DEMO.slice().sort(function () { return Math.random() - 0.5; });
        for (var i = 0; i < count; i++) {
          var d = pool[i % pool.length];
          db.submissions.push({ id: newId(), eventId: eventId, category: d[0], message: d[1], createdAt: new Date(t - i * 60000).toISOString(), isDemo: true, burned: false, burnedAt: '' });
        }
        save(db);
        return { added: count };
      case 'clearDemo':
        var before = db.submissions.length;
        db.submissions = db.submissions.filter(function (s) { return !(mine(s) && s.isDemo); });
        save(db);
        return { removed: before - db.submissions.length };
      default:
        fail('INVALID', 'Unknown action.');
    }
  }

  // ---- darts (mirrors darts_ in Code.gs) ----
  var DARTS_KEY = 'ravan_local_darts_v1';
  function dartsPoints(hit, zone, bull) {
    if (hit === 'MISS') return 0;
    if (hit === 'BULL') return Number(bull) || 0;
    var n = Number(hit);
    if (n % 2) return zone === 'in' ? -n / 2 : -n;
    return zone === 'in' ? n * 2 : n;
  }
  function dartsLoad() {
    try { var s = JSON.parse(localStorage.getItem(DARTS_KEY)); if (s && s.throws) return s; } catch (e) {}
    return { game: null, throws: [] };
  }
  function dartsSave(st) { st.updatedAt = new Date().toISOString(); localStorage.setItem(DARTS_KEY, JSON.stringify(st)); return st; }

  function darts(body, db, t) {
    var st = dartsLoad();
    if (body.action === 'dartsState') return st;
    if (body.action === 'dartsLogin') {
      var cfg = window.RAVAN_CONFIG || {};
      var expected = cfg.LOCAL_DARTS_PIN || cfg.LOCAL_ADMIN_PASSWORD || 'ravan2026';
      if (String(body.pin || '') !== expected) fail('DENIED', 'Wrong PIN.');
      var token = newId() + newId() + newId();
      db.tokens[token] = t + TOKEN_TTL_MS; save(db);
      return { token: token };
    }
    var exp = db.tokens[body.token];
    if (!body.token || !exp || exp < t) fail('AUTH', 'Please enter the scorer PIN again.');

    if (body.action === 'dartsNewGame') {
      var picked = resolveTeams(body.teamIds), teams = picked.names;
      if (teams.length < 2 || teams.length > 12) fail('INVALID', 'Pick 2 to 12 teams.');
      var rounds = Math.round(+body.rounds), per = Math.round(+body.dartsPerTurn), bull = +body.bullPoints || 0;
      if (!(rounds >= 1 && rounds <= 20)) fail('INVALID', 'Rounds must be 1–20.');
      if (!(per >= 1 && per <= 6)) fail('INVALID', 'Darts per turn must be 1–6.');
      if (!(bull >= -100 && bull <= 100)) fail('INVALID', 'Bullseye points must be between −100 and 100.');
      return dartsSave({ game: { id: newId(), teams: teams, teamIds: picked.ids, rounds: rounds, dartsPerTurn: per, bullPoints: bull, startedAt: new Date().toISOString() }, throws: [] });
    }
    if (body.action === 'dartsReset') return dartsSave({ game: null, throws: [] });
    if (!st.game) fail('INVALID', 'Start a game first.');
    if (+body.expect !== st.throws.length) fail('STALE', 'Scores changed on another device — refreshed.');
    if (body.action === 'dartsThrow') {
      var g = st.game, count = st.throws.length;
      if (count >= g.teams.length * g.dartsPerTurn * g.rounds) fail('INVALID', 'The game is over.');
      var hin = String(body.hit || '').toUpperCase();
      var hit = hin === 'MISS' || hin === 'BULL' ? hin : Number(hin);
      if (typeof hit === 'number' && !(hit >= 1 && hit <= 20 && hit === Math.floor(hit))) fail('INVALID', 'Pick a number from 1 to 20.');
      var zone = typeof hit === 'number' ? (body.zone === 'in' ? 'in' : body.zone === 'out' ? 'out' : '') : '';
      if (typeof hit === 'number' && !zone) fail('INVALID', 'Choose inside or outside the ring.');
      st.throws.push({ t: Math.floor(count / g.dartsPerTurn) % g.teams.length, h: hit, z: zone, p: dartsPoints(hit, zone, g.bullPoints), at: new Date().toISOString() });
      return dartsSave(st);
    }
    if (body.action === 'dartsUndo') {
      if (!st.throws.length) fail('INVALID', 'Nothing to undo.');
      st.throws.pop();
      return dartsSave(st);
    }
    fail('INVALID', 'Unknown action.');
  }

  // ---- global teams (mirrors teams_ in Code.gs) ----
  var TEAMS_KEY = 'ravan_local_teams_v1';
  function teamsLoad() {
    try { var s = JSON.parse(localStorage.getItem(TEAMS_KEY)); if (s && s.teams) return s; } catch (e) {}
    return { teams: [], v: 0 };
  }
  function resolveTeams(ids) {
    if (!Array.isArray(ids)) fail('INVALID', 'Pick the teams that are playing.');
    var byId = {};
    teamsLoad().teams.forEach(function (x) { byId[x.id] = x.name; });
    var seen = {}, names = [], out = [];
    ids.forEach(function (id) {
      id = String(id);
      if (!byId[id]) fail('INVALID', 'A selected team no longer exists — refresh the team list.');
      if (seen[id]) return;
      seen[id] = 1; out.push(id); names.push(byId[id]);
    });
    return { ids: out, names: names };
  }
  function teamsAction(body, db, t) {
    var st = teamsLoad();
    if (body.action === 'teamsList') return st;
    var exp = db.tokens[body.token];
    if (!body.token || !exp || exp < t) fail('AUTH', 'Please enter the scorer PIN again.');
    if (body.action === 'teamsReset') {
      st = { teams: [], v: (st.v || 0) + 1, updatedAt: new Date().toISOString() };
      localStorage.setItem(TEAMS_KEY, JSON.stringify(st));
      return st;
    }
    if (body.action !== 'teamsSave') fail('INVALID', 'Unknown action.');
    if (+body.expect !== (st.v || 0)) fail('STALE', 'Teams changed on another device — refreshed.');
    var list = Array.isArray(body.teams) ? body.teams : [];
    if (list.length > 30) fail('INVALID', 'Up to 30 teams.');
    var seen = {}, out = [];
    list.forEach(function (x) {
      var name = sanitize(x && x.name).slice(0, 30);
      if (!name) return;
      if (seen[name.toLowerCase()]) fail('INVALID', 'Team names must be different: ' + name);
      seen[name.toLowerCase()] = 1;
      out.push({ id: x && /^[a-f0-9]{8,32}$/.test(String(x.id || '')) ? String(x.id) : newId(), name: name });
    });
    st.teams = out; st.v = (st.v || 0) + 1; st.updatedAt = new Date().toISOString();
    localStorage.setItem(TEAMS_KEY, JSON.stringify(st));
    return st;
  }

  // ---- treasure hunt (mirrors hunt_ in Code.gs) ----
  var HUNT_KEY = 'ravan_local_hunt_v1';
  function hunt(body, db, t) {
    var st;
    try { st = JSON.parse(localStorage.getItem(HUNT_KEY)); } catch (e) {}
    if (!st || !st.teams) st = { game: null, teams: [], v: 0 };
    var nowIso = new Date().toISOString();
    if (body.action === 'huntState') { st.now = nowIso; return st; }
    var exp = db.tokens[body.token];
    if (!body.token || !exp || exp < t) fail('AUTH', 'Please enter the scorer PIN again.');
    var done = function () { st.v = (st.v || 0) + 1; st.updatedAt = nowIso; localStorage.setItem(HUNT_KEY, JSON.stringify(st)); st.now = nowIso; return st; };

    if (body.action === 'huntNewGame') {
      var pickedH = resolveTeams(body.teamIds), names = pickedH.names;
      if (names.length < 1 || names.length > 20) fail('INVALID', 'Pick 1 to 20 teams.');
      st = { game: { id: newId(), clues: [5, 10, 15, 20], bonus: [[300, 20], [600, 10]], startedAt: nowIso },
        teams: names.map(function (n, i) { return { id: pickedH.ids[i], name: n, start: '', found: [] }; }), v: st.v || 0 };
      return done();
    }
    if (body.action === 'huntReset') { st = { game: null, teams: [], v: st.v || 0 }; return done(); }
    if (!st.game) fail('INVALID', 'Start a hunt first.');
    if (+body.expect !== (st.v || 0)) fail('STALE', 'Updated on another device — refreshed.');
    if (body.action === 'huntStart') {
      var targets = body.team === 'all' ? st.teams.map(function (_, i) { return i; }) : [+body.team];
      var n = 0;
      targets.forEach(function (i) { var tm = st.teams[i]; if (tm && !tm.start) { tm.start = nowIso; n++; } });
      if (!n) fail('INVALID', 'Already started.');
      return done();
    }
    var team = st.teams[+body.team];
    if (!team) fail('INVALID', 'Unknown team.');
    if (body.action === 'huntClue') {
      if (!team.start) fail('INVALID', 'Start the stopwatch for this team first.');
      if (team.found.length >= 4) fail('INVALID', 'All clues already found.');
      team.found.push(nowIso);
      return done();
    }
    if (body.action === 'huntUndo') {
      if (team.found.length) team.found.pop(); else if (team.start) team.start = ''; else fail('INVALID', 'Nothing to undo.');
      return done();
    }
    fail('INVALID', 'Unknown action.');
  }

  /* Same contract as a network call: resolves with data, rejects with {message, code}. */
  window.RavanLocalBackend = {
    call: function (body) {
      return new Promise(function (resolve, reject) {
        setTimeout(function () {
          try { resolve(JSON.parse(JSON.stringify(handle(body)))); }
          catch (e) { if (!e.code) { e.code = 'ERROR'; } reject(e); }
        }, 120 + Math.random() * 180);
      });
    }
  };
})();
