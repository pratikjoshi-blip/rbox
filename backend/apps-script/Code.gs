/**
 * DIGITAL RAVAN BOX — Google Apps Script backend (Google Sheets storage)
 * ---------------------------------------------------------------------
 * Bind this script to a Google Sheet (Extensions → Apps Script), then:
 *   1. Project Settings → Script properties → add ADMIN_PASSWORD = <a strong password>
 *   2. Run setup() once (authorise when asked).
 *   3. Deploy → New deployment → Web app → Execute as: Me, Who has access: Anyone.
 *   4. Paste the /exec URL into js/config.js → API_URL.
 *
 * Protocol: POST text/plain body = JSON {action, eventId, ...}. Response {ok, data | error, code}.
 * Stored per submission: id, eventId, category, message, createdAt, isDemo, burned, burnedAt.
 * NO names, emails, phone numbers, IPs or any other identifying data are stored.
 */

var SHEET_NAME = 'Submissions';
var HEADERS = ['id', 'eventId', 'category', 'message', 'createdAt', 'isDemo', 'burned', 'burnedAt'];
var MAX_LEN = 150;
var TOKEN_TTL_SEC = 21600; // 6 h (CacheService maximum)
var SUBMITS_PER_MINUTE = 60; // global cap (Apps Script cannot see client IPs)

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

/**
 * The spreadsheet that holds all data.
 * Uses the sheet this script is attached to (Extensions → Apps Script). If the script
 * was created on its own at script.google.com, set Script Property SPREADSHEET_ID to
 * the long id in the sheet's URL: docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/edit
 */
var SS_ = null; // opened once per request
function ss_() {
  if (SS_) return SS_;
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  SS_ = id ? SpreadsheetApp.openById(id.trim()) : SpreadsheetApp.getActiveSpreadsheet();
  if (!SS_) fail_('CONFIG', 'No spreadsheet: attach this script to a Google Sheet or set the SPREADSHEET_ID script property.');
  return SS_;
}

/** Run from the editor to print the link of the sheet this backend writes to. */
function whereIsMySheet() {
  Logger.log('Data is stored in: ' + ss_().getUrl());
}

/** Run once from the editor. Creates the sheet + headers and forces plain-text columns. */
function setup() {
  var ss = ss_();
  var sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
  sh.setFrozenRows(1);
  sh.getRange('A:H').setNumberFormat('@');
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('CEREMONY_STATE')) setStateProp_('SUBMISSIONS_OPEN');
  if (!props.getProperty('ADMIN_PASSWORD')) {
    throw new Error('Now add ADMIN_PASSWORD under Project Settings → Script properties.');
  }
  Logger.log('Setup complete.');
}

function doGet() {
  return json_({ ok: true, data: { service: 'digital-ravan-box', state: getState_().state } });
}

function doPost(e) {
  var out;
  try {
    var raw = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
    if (raw.length > 20000) fail_('INVALID', 'Request too large.');
    var body = JSON.parse(raw);
    out = { ok: true, data: handle_(body) };
  } catch (err) {
    out = { ok: false, error: err.code ? err.message : 'Server error', code: err.code || 'ERROR' };
    if (!err.code) console.error(err);
  }
  return json_(out);
}

function handle_(body) {
  var action = String(body.action || '');
  var eventId = sanitize_(body.eventId || 'default').slice(0, 60);

  if (action === 'status') {
    var st = getState_();
    return { state: st.state, accepting: st.state === 'SUBMISSIONS_OPEN' };
  }
  if (action === 'submit') return submit_(body, eventId);
  if (action === 'login') return login_(body);
  if (action.indexOf('darts') === 0) return darts_(action, body);
  if (action.indexOf('hunt') === 0) return hunt_(action, body);
  if (action.indexOf('teams') === 0) return teams_(action, body);

  requireAdmin_(body.token);

  switch (action) {
    case 'logout':
      CacheService.getScriptCache().remove('tok_' + body.token);
      return { loggedOut: true };
    case 'list':
      var s = getState_();
      return { state: s.state, stateUpdatedAt: s.updatedAt, submissions: readAll_().filter(function (r) { return r.eventId === eventId; }) };
    case 'setState':
      if (STATES.indexOf(body.state) < 0) fail_('INVALID', 'Unknown state.');
      setStateProp_(body.state);
      return { state: body.state };
    case 'markBurned':
      return withLock_(function () {
        var now = new Date().toISOString();
        var n = updateRows_(function (r) {
          if (r.eventId === eventId && !r.isDemo && !r.burned) { r.burned = true; r.burnedAt = now; return true; }
          return false;
        });
        setStateProp_('BURNED');
        return { burned: n, state: 'BURNED' };
      });
    case 'resetCeremony':
      return withLock_(function () {
        var to = ['SUBMISSIONS_OPEN', 'CEREMONY_READY', 'RAVAN_CLOSED'].indexOf(body.toState) >= 0 ? body.toState : 'SUBMISSIONS_OPEN';
        updateRows_(function (r) {
          if (r.eventId === eventId && (r.burned || r.burnedAt)) { r.burned = false; r.burnedAt = ''; return true; }
          return false;
        });
        setStateProp_(to);
        return { state: to };
      });
    case 'generateDemo':
      return withLock_(function () {
        var count = [5, 10, 20, 22].indexOf(Number(body.count)) >= 0 ? Number(body.count) : 5;
        var pool = DEMO.slice().sort(function () { return Math.random() - 0.5; });
        var rows = [];
        for (var i = 0; i < count; i++) {
          var d = pool[i % pool.length];
          rows.push([newId_(), eventId, d[0], safeCell_(d[1]), new Date(Date.now() - i * 60000).toISOString(), 'TRUE', 'FALSE', '']);
        }
        var sh = sheet_();
        sh.getRange(sh.getLastRow() + 1, 1, rows.length, HEADERS.length).setNumberFormat('@').setValues(rows);
        return { added: count };
      });
    case 'clearDemo':
      return withLock_(function () {
        var all = readAll_();
        var keep = all.filter(function (r) { return !(r.eventId === eventId && r.isDemo); });
        rewrite_(keep);
        return { removed: all.length - keep.length };
      });
    default:
      fail_('INVALID', 'Unknown action.');
  }
}

// ---------- actions ----------
function submit_(body, eventId) {
  if (getState_().state !== 'SUBMISSIONS_OPEN') fail_('CLOSED', 'Submissions are closed.');
  var category = String(body.category || '');
  if (CATEGORIES.indexOf(category) < 0) fail_('INVALID', 'Please choose a valid category.');
  if (typeof body.message === 'string' && body.message.length > MAX_LEN * 2) fail_('INVALID', 'Message is too long.');
  var message = sanitize_(body.message);
  if (category === 'other' && !message) fail_('INVALID', 'Please write what you want to let go of.');

  var cache = CacheService.getScriptCache();
  var bucket = 'sub_' + Math.floor(Date.now() / 60000);
  var used = Number(cache.get(bucket) || 0);
  if (used >= SUBMITS_PER_MINUTE) fail_('RATE', 'Too many submissions right now. Try again in a minute.');
  cache.put(bucket, String(used + 1), 120);

  return withLock_(function () {
    var sh = sheet_();
    sh.getRange(sh.getLastRow() + 1, 1, 1, HEADERS.length).setNumberFormat('@')
      .setValues([[newId_(), eventId, category, safeCell_(message), new Date().toISOString(), 'FALSE', 'FALSE', '']]);
    return { received: true };
  });
}

function login_(body) {
  var cache = CacheService.getScriptCache();
  var fails = Number(cache.get('login_fails') || 0);
  if (fails >= 10) fail_('RATE', 'Too many attempts. Wait 10 minutes.');
  var expected = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD');
  if (!expected) fail_('DENIED', 'Admin password not configured.');
  if (!constantTimeEquals_(String(body.password || ''), expected)) {
    cache.put('login_fails', String(fails + 1), 600);
    Utilities.sleep(400);
    fail_('DENIED', 'Wrong password.');
  }
  var token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
  cache.put('tok_' + token, '1', TOKEN_TTL_SEC);
  return { token: token, expiresInSec: TOKEN_TTL_SEC };
}

function requireAdmin_(token) {
  if (!token || !/^[a-f0-9-]{40,80}$/i.test(String(token)) || !CacheService.getScriptCache().get('tok_' + token)) {
    fail_('AUTH', 'Please log in again.');
  }
}

// ---------- darts scoreboard ----------
/*
 * Scoring (per dart, numbers 1–20):
 *   odd  outside the ring → −n      odd  inside the ring → −n/2
 *   even outside the ring → +n      even inside the ring → +2n
 *   MISS → 0, BULL → the game's bullPoints setting
 * The whole game lives as one JSON value in cell A1 of the "Darts" tab; finished or
 * replaced games are appended below it as history. Scores are computed here only.
 */
var DARTS_SHEET = 'Darts';
var DARTS_CACHE = 'darts_state';

function dartsPoints_(hit, zone, bullPoints) {
  if (hit === 'MISS') return 0;
  if (hit === 'BULL') return Number(bullPoints) || 0;
  var n = Number(hit);
  if (n % 2) return zone === 'in' ? -n / 2 : -n;
  return zone === 'in' ? n * 2 : n;
}

/* Small JSON document stores: one JSON value in cell A1 of a tab, cached for fast reads. */
function jsonSheet_(name) {
  var ss = ss_();
  return ss.getSheetByName(name) || ss.insertSheet(name);
}
function jsonRead_(name, cacheKey, empty) {
  var cache = CacheService.getScriptCache();
  var hit = cache.get(cacheKey);
  if (hit) return JSON.parse(hit);
  var raw = String(jsonSheet_(name).getRange('A1').getValue() || '');
  var st = raw ? JSON.parse(raw) : empty;
  cache.put(cacheKey, JSON.stringify(st), 21600);
  return st;
}
function jsonWrite_(name, cacheKey, st) {
  st.updatedAt = new Date().toISOString();
  var json = JSON.stringify(st);
  if (json.length > 45000) fail_('INVALID', 'Game is too long — start a new game.');
  jsonSheet_(name).getRange('A1').setValue(json); // a JSON object string is always stored as text
  CacheService.getScriptCache().put(cacheKey, json, 21600);
  return st;
}
function dartsSheet_() { return jsonSheet_(DARTS_SHEET); }
function dartsRead_() { return jsonRead_(DARTS_SHEET, DARTS_CACHE, { game: null, throws: [] }); }
function dartsWrite_(st) { return jsonWrite_(DARTS_SHEET, DARTS_CACHE, st); }

function dartsTurn_(game, count) {
  var perRound = game.teams.length * game.dartsPerTurn;
  var total = perRound * game.rounds;
  return { over: count >= total, team: Math.floor(count / game.dartsPerTurn) % game.teams.length };
}

function requireDarts_(token) {
  var cache = CacheService.getScriptCache();
  var ok = token && /^[a-f0-9-]{40,80}$/i.test(String(token)) && (cache.get('dtok_' + token) || cache.get('tok_' + token));
  if (!ok) fail_('AUTH', 'Please enter the scorer PIN again.');
}

function darts_(action, body) {
  if (action === 'dartsState') return dartsRead_();

  if (action === 'dartsLogin') {
    var cache = CacheService.getScriptCache();
    var fails = Number(cache.get('darts_fails') || 0);
    if (fails >= 10) fail_('RATE', 'Too many attempts. Wait 10 minutes.');
    var props = PropertiesService.getScriptProperties();
    var expected = props.getProperty('DARTS_PIN') || props.getProperty('ADMIN_PASSWORD');
    if (!expected) fail_('DENIED', 'Scorer PIN not configured.');
    if (!constantTimeEquals_(String(body.pin || ''), expected)) {
      cache.put('darts_fails', String(fails + 1), 600);
      Utilities.sleep(400);
      fail_('DENIED', 'Wrong PIN.');
    }
    var token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
    cache.put('dtok_' + token, '1', TOKEN_TTL_SEC);
    return { token: token };
  }

  requireDarts_(body.token);

  return withLock_(function () {
    var st = dartsRead_();

    if (action === 'dartsNewGame') {
      var picked = resolveTeams_(body.teamIds);
      var teams = picked.names;
      if (teams.length < 2 || teams.length > 12) fail_('INVALID', 'Pick 2 to 12 teams.');
      var rounds = Math.round(Number(body.rounds)), per = Math.round(Number(body.dartsPerTurn));
      var bull = Number(body.bullPoints) || 0;
      if (!(rounds >= 1 && rounds <= 20)) fail_('INVALID', 'Rounds must be 1–20.');
      if (!(per >= 1 && per <= 6)) fail_('INVALID', 'Darts per turn must be 1–6.');
      if (!(bull >= -100 && bull <= 100)) fail_('INVALID', 'Bullseye points must be between −100 and 100.');
      if (st.game) dartsSheet_().appendRow([JSON.stringify(st)]); // keep history
      return dartsWrite_({ game: { id: newId_(), teams: teams, teamIds: picked.ids, rounds: rounds, dartsPerTurn: per, bullPoints: bull,
        startedAt: new Date().toISOString() }, throws: [] });
    }

    // test reset: wipes ONLY the Darts tab (current game + history); Ravan Box data is untouched
    if (action === 'dartsReset') {
      dartsSheet_().clearContents();
      return dartsWrite_({ game: null, throws: [] });
    }

    if (!st.game) fail_('INVALID', 'Start a game first.');
    // optimistic concurrency: the phone says how many darts it has seen
    if (Number(body.expect) !== st.throws.length) {
      var e = new Error('Scores changed on another device — refreshed.'); e.code = 'STALE'; throw e;
    }

    if (action === 'dartsThrow') {
      var turn = dartsTurn_(st.game, st.throws.length);
      if (turn.over) fail_('INVALID', 'The game is over.');
      var hitIn = String(body.hit || '').toUpperCase();
      var hit = hitIn === 'MISS' || hitIn === 'BULL' ? hitIn : Number(hitIn);
      if (typeof hit === 'number' && !(hit >= 1 && hit <= 20 && hit === Math.floor(hit))) fail_('INVALID', 'Pick a number from 1 to 20.');
      var zone = typeof hit === 'number' ? (body.zone === 'in' ? 'in' : body.zone === 'out' ? 'out' : '') : '';
      if (typeof hit === 'number' && !zone) fail_('INVALID', 'Choose inside or outside the ring.');
      st.throws.push({ t: turn.team, h: hit, z: zone, p: dartsPoints_(hit, zone, st.game.bullPoints), at: new Date().toISOString() });
      return dartsWrite_(st);
    }

    if (action === 'dartsUndo') {
      if (!st.throws.length) fail_('INVALID', 'Nothing to undo.');
      st.throws.pop();
      return dartsWrite_(st);
    }

    fail_('INVALID', 'Unknown action.');
  });
}

// ---------- treasure hunt leaderboard ----------
/*
 * Clues are found in order: Clue 1 +5, Clue 2 +10, Clue 3 +15, Final +20.
 * Each team has its own stopwatch (started by the scorer). Finishing every clue
 * within 5:00 earns +20, within 10:00 earns +10. Times use the server clock.
 * Ranking: points, then faster finish.
 */
var HUNT_SHEET = 'Hunt';
var HUNT_CACHE = 'hunt_state';
var HUNT_CLUES = [5, 10, 15, 20];
var HUNT_BONUS = [[300, 20], [600, 10]]; // [within seconds, points]

function huntRead_() { return jsonRead_(HUNT_SHEET, HUNT_CACHE, { game: null, teams: [], v: 0 }); }

function hunt_(action, body) {
  if (action === 'huntState') { var st0 = huntRead_(); st0.now = new Date().toISOString(); return st0; }

  requireDarts_(body.token); // same scorer PIN as darts

  return withLock_(function () {
    var st = huntRead_();
    var nowIso = new Date().toISOString();
    var done = function () { st.v = (st.v || 0) + 1; var out = jsonWrite_(HUNT_SHEET, HUNT_CACHE, st); out.now = nowIso; return out; };

    if (action === 'huntNewGame') {
      var pickedH = resolveTeams_(body.teamIds);
      var names = pickedH.names;
      if (names.length < 1 || names.length > 20) fail_('INVALID', 'Pick 1 to 20 teams.');
      if (st.game) jsonSheet_(HUNT_SHEET).appendRow([JSON.stringify(st)]); // keep history
      st = { game: { id: newId_(), clues: HUNT_CLUES, bonus: HUNT_BONUS, startedAt: nowIso },
        teams: names.map(function (n, i) { return { id: pickedH.ids[i], name: n, start: '', found: [] }; }), v: st.v || 0 };
      return done();
    }

    // test reset: wipes ONLY the Hunt tab (current hunt + history)
    if (action === 'huntReset') {
      jsonSheet_(HUNT_SHEET).clearContents();
      st = { game: null, teams: [], v: st.v || 0 };
      return done();
    }

    if (!st.game) fail_('INVALID', 'Start a hunt first.');
    if (Number(body.expect) !== (st.v || 0)) { var e = new Error('Updated on another device — refreshed.'); e.code = 'STALE'; throw e; }

    if (action === 'huntStart') {
      var targets = body.team === 'all' ? st.teams.map(function (_, i) { return i; }) : [Number(body.team)];
      var started = 0;
      targets.forEach(function (i) { var t = st.teams[i]; if (t && !t.start) { t.start = nowIso; started++; } });
      if (!started) fail_('INVALID', 'Already started.');
      return done();
    }

    var team = st.teams[Number(body.team)];
    if (!team) fail_('INVALID', 'Unknown team.');

    if (action === 'huntClue') {
      if (!team.start) fail_('INVALID', 'Start the stopwatch for this team first.');
      if (team.found.length >= HUNT_CLUES.length) fail_('INVALID', 'All clues already found.');
      team.found.push(nowIso);
      return done();
    }

    if (action === 'huntUndo') {
      if (team.found.length) team.found.pop();
      else if (team.start) team.start = '';
      else fail_('INVALID', 'Nothing to undo.');
      return done();
    }

    fail_('INVALID', 'Unknown action.');
  });
}

// ---------- global teams (shared by darts + treasure hunt) ----------
var TEAMS_SHEET = 'Teams';
var TEAMS_CACHE = 'teams_state';

function teamsRead_() { return jsonRead_(TEAMS_SHEET, TEAMS_CACHE, { teams: [], v: 0 }); }

/* Turn selected team ids into names, in the order given. */
function resolveTeams_(ids) {
  if (!Array.isArray(ids)) fail_('INVALID', 'Pick the teams that are playing.');
  var byId = {};
  teamsRead_().teams.forEach(function (t) { byId[t.id] = t.name; });
  var seen = {}, names = [], out = [];
  ids.forEach(function (id) {
    id = String(id);
    if (!byId[id]) fail_('INVALID', 'A selected team no longer exists — refresh the team list.');
    if (seen[id]) return;
    seen[id] = 1; out.push(id); names.push(byId[id]);
  });
  return { ids: out, names: names };
}

function teams_(action, body) {
  if (action === 'teamsList') return teamsRead_();
  requireDarts_(body.token);
  return withLock_(function () {
    var st = teamsRead_();
    // test reset: wipes ONLY the Teams tab
    if (action === 'teamsReset') {
      jsonSheet_(TEAMS_SHEET).clearContents();
      return jsonWrite_(TEAMS_SHEET, TEAMS_CACHE, { teams: [], v: (st.v || 0) + 1 });
    }
    // spinner result: the playing order drawn on /spin/ (darts + hunt setup can apply it)
    if (action === 'teamsSpin') {
      var known = {};
      st.teams.forEach(function (t) { known[t.id] = 1; });
      var order = [], seenS = {};
      (Array.isArray(body.order) ? body.order : []).forEach(function (id) {
        id = String(id);
        if (!known[id]) fail_('INVALID', 'A team on the wheel no longer exists — reload the spinner.');
        if (!seenS[id]) { seenS[id] = 1; order.push(id); }
      });
      if (!order.length) fail_('INVALID', 'Spin at least once.');
      st.spin = { order: order, at: new Date().toISOString() };
      return jsonWrite_(TEAMS_SHEET, TEAMS_CACHE, st);
    }
    if (action === 'teamsSave') {
      if (Number(body.expect) !== (st.v || 0)) { var e = new Error('Teams changed on another device — refreshed.'); e.code = 'STALE'; throw e; }
      var list = Array.isArray(body.teams) ? body.teams : [];
      if (list.length > 30) fail_('INVALID', 'Up to 30 teams.');
      var seen = {}, out = [];
      list.forEach(function (t) {
        var name = sanitize_(t && t.name).slice(0, 30);
        if (!name) return;
        if (seen[name.toLowerCase()]) fail_('INVALID', 'Team names must be different: ' + name);
        seen[name.toLowerCase()] = 1;
        var id = t && /^[a-f0-9]{8,32}$/.test(String(t.id || '')) ? String(t.id) : newId_();
        out.push({ id: id, name: name });
      });
      st.teams = out;
      st.v = (st.v || 0) + 1;
      return jsonWrite_(TEAMS_SHEET, TEAMS_CACHE, st);
    }
    fail_('INVALID', 'Unknown action.');
  });
}

// ---------- sheet helpers ----------
function sheet_() {
  var ss = ss_();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) { setup(); sh = ss.getSheetByName(SHEET_NAME); }
  return sh;
}

function readAll_() {
  var sh = sheet_();
  var last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, HEADERS.length).getValues().map(rowToObj_).filter(function (r) { return r.id; });
}

function rowToObj_(v) {
  var iso = function (x) { return x instanceof Date ? x.toISOString() : String(x || ''); };
  var bool = function (x) { return x === true || String(x).toUpperCase() === 'TRUE'; };
  return { id: String(v[0]), eventId: String(v[1]), category: String(v[2]), message: String(v[3]).replace(/^'(?=[=+\-@])/, ''),
    createdAt: iso(v[4]), isDemo: bool(v[5]), burned: bool(v[6]), burnedAt: iso(v[7]) };
}

function objToRow_(r) {
  return [r.id, r.eventId, r.category, safeCell_(r.message), r.createdAt, r.isDemo ? 'TRUE' : 'FALSE', r.burned ? 'TRUE' : 'FALSE', r.burnedAt || ''];
}

function updateRows_(fn) {
  var sh = sheet_();
  var last = sh.getLastRow();
  if (last < 2) return 0;
  var range = sh.getRange(2, 1, last - 1, HEADERS.length);
  var rows = range.getValues().map(rowToObj_);
  var n = 0;
  rows.forEach(function (r) { if (r.id && fn(r)) n++; });
  if (n) {
    // only the burned / burnedAt columns change — originals are never rewritten
    sh.getRange(2, 7, rows.length, 2).setNumberFormat('@')
      .setValues(rows.map(function (r) { return [r.burned ? 'TRUE' : 'FALSE', r.burnedAt || '']; }));
  }
  return n;
}

function rewrite_(rows) {
  var sh = sheet_();
  var last = sh.getLastRow();
  if (last >= 2) sh.getRange(2, 1, last - 1, HEADERS.length).clearContent();
  if (rows.length) sh.getRange(2, 1, rows.length, HEADERS.length).setNumberFormat('@').setValues(rows.map(objToRow_));
}

// ---------- state ----------
function getState_() {
  var p = PropertiesService.getScriptProperties();
  return { state: p.getProperty('CEREMONY_STATE') || 'SUBMISSIONS_OPEN', updatedAt: p.getProperty('CEREMONY_UPDATED_AT') || '' };
}
function setStateProp_(state) {
  PropertiesService.getScriptProperties().setProperties({ CEREMONY_STATE: state, CEREMONY_UPDATED_AT: new Date().toISOString() });
}

// ---------- utils ----------
function sanitize_(text) {
  return String(text == null ? '' : text)
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_LEN);
}
/* Prevent spreadsheet formula injection (=, +, -, @ at the start of a cell). */
function safeCell_(text) {
  var s = String(text || '');
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}
function newId_() { return Utilities.getUuid().replace(/-/g, '').slice(0, 16); }
function constantTimeEquals_(a, b) {
  var ha = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, a);
  var hb = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, b);
  var diff = 0;
  for (var i = 0; i < ha.length; i++) diff |= ha[i] ^ hb[i];
  return diff === 0;
}
function withLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) fail_('RATE', 'Busy — please try again.');
  try { return fn(); } finally { lock.releaseLock(); }
}
function fail_(code, msg) { var e = new Error(msg); e.code = code; throw e; }
function json_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
