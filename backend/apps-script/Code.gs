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

/** Run once from the editor. Creates the sheet + headers and forces plain-text columns. */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
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

// ---------- sheet helpers ----------
function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
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
