/*
 * API client. Same action-based protocol for the local dev server and Google Apps Script.
 * Requests are POSTed as text/plain so Apps Script never needs a CORS preflight.
 */
(function () {
  var cfg = window.RAVAN_CONFIG;
  var TOKEN_KEY = 'ravan_admin_token';

  function endpoint() {
    return cfg.API_URL && cfg.API_URL.trim() ? cfg.API_URL.trim() : '';
  }

  function call(action, payload) {
    var body = Object.assign({ action: action, eventId: cfg.EVENT_ID }, payload || {});
    // No API_URL → in-browser local mode (js/local-backend.js)
    if (!endpoint()) return window.RavanLocalBackend.call(body);
    return fetch(endpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      redirect: 'follow'
    })
      .then(function (res) {
        if (!res.ok) throw new Error('Network error (' + res.status + ')');
        return res.json();
      })
      .then(function (json) {
        if (!json || json.ok !== true) {
          var err = new Error((json && json.error) || 'Request failed');
          err.code = json && json.code;
          throw err;
        }
        return json.data;
      });
  }

  function token() {
    try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
  }

  function admin(action, payload) {
    return call(action, Object.assign({ token: token() }, payload || {})).catch(function (err) {
      if (err.code === 'AUTH') {
        try { sessionStorage.removeItem(TOKEN_KEY); } catch (e) {}
      }
      throw err;
    });
  }

  // The scorer stays signed in on the phone (localStorage), separate from the admin session
  var DARTS_KEY = 'ravan_darts_token';
  function dartsToken() { try { return localStorage.getItem(DARTS_KEY) || ''; } catch (e) { return ''; } }
  function darts(action, payload) {
    return call(action, Object.assign({ token: dartsToken() }, payload || {})).catch(function (err) {
      if (err.code === 'AUTH') { try { localStorage.removeItem(DARTS_KEY); } catch (e) {} }
      throw err;
    });
  }

  window.RavanAPI = {
    isLocal: function () { return !endpoint(); },
    status: function () { return call('status'); },
    submit: function (category, message) {
      return call('submit', { category: category, message: message });
    },
    login: function (password) {
      return call('login', { password: password }).then(function (data) {
        try { sessionStorage.setItem(TOKEN_KEY, data.token); } catch (e) {}
        return data;
      });
    },
    logout: function () {
      var p = admin('logout').catch(function () {});
      try { sessionStorage.removeItem(TOKEN_KEY); } catch (e) {}
      return p;
    },
    hasToken: function () { return !!token(); },
    list: function () { return admin('list'); },
    setState: function (state) { return admin('setState', { state: state }); },
    markBurned: function () { return admin('markBurned'); },
    resetCeremony: function (toState) { return admin('resetCeremony', { toState: toState || 'SUBMISSIONS_OPEN' }); },
    generateDemo: function (count) { return admin('generateDemo', { count: count }); },
    clearDemo: function () { return admin('clearDemo'); },

    // ---- darts scoreboard ----
    dartsState: function () { return call('dartsState'); },
    dartsLogin: function (pin) {
      return call('dartsLogin', { pin: pin }).then(function (d) {
        try { localStorage.setItem(DARTS_KEY, d.token); } catch (e) {}
        return d;
      });
    },
    dartsHasToken: function () { return !!dartsToken(); },
    dartsLogout: function () { try { localStorage.removeItem(DARTS_KEY); } catch (e) {} },
    dartsNewGame: function (cfgGame) { return darts('dartsNewGame', cfgGame); },

    // ---- global teams (shared by darts + hunt) ----
    teamsList: function () { return call('teamsList'); },
    teamsSave: function (expect, teams) { return darts('teamsSave', { expect: expect, teams: teams }); },
    teamsReset: function () { return darts('teamsReset'); },
    teamsSpin: function (order) { return darts('teamsSpin', { order: order }); },
    dartsReset: function () { return darts('dartsReset'); },
    huntReset: function () { return darts('huntReset'); },
    dartsThrow: function (expect, hit, zone) { return darts('dartsThrow', { expect: expect, hit: hit, zone: zone }); },
    dartsUndo: function (expect) { return darts('dartsUndo', { expect: expect }); },

    // ---- treasure hunt (same scorer PIN/session as darts) ----
    huntState: function () { return call('huntState'); },
    huntNewGame: function (teamIds) { return darts('huntNewGame', { teamIds: teamIds }); },
    huntStart: function (expect, team) { return darts('huntStart', { expect: expect, team: team }); },
    huntClue: function (expect, team) { return darts('huntClue', { expect: expect, team: team }); },
    huntUndo: function (expect, team) { return darts('huntUndo', { expect: expect, team: team }); }
  };
})();
