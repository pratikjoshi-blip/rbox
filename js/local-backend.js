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
