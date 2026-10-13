/*
 * Team picker for game setup — choose from the global team list (/teams/).
 * Tap a team to include it; the badge shows its order (darts throwing order).
 *
 *   var picker = TeamPicker(container, { min: 2, manageHref: '../../teams/' });
 *   picker.load(preselectIds) → Promise    picker.selected() → [ids]
 */
(function () {
  function el(tag, className, text) { var e = document.createElement(tag); if (className) e.className = className; if (text != null) e.textContent = text; return e; }

  window.TeamPicker = function (box, opts) {
    var teams = [], order = [];

    function render() {
      box.textContent = '';
      if (!teams.length) {
        var empty = el('p', 'note');
        empty.appendChild(document.createTextNode('No teams yet. '));
        var a = el('a', null, 'Create your teams first →'); a.href = opts.manageHref;
        empty.appendChild(a);
        box.appendChild(empty);
        return;
      }
      var tools = el('div', 'picker-tools');
      var all = el('button', 'btn btn-ghost btn-sm', 'Select all'); all.type = 'button';
      all.addEventListener('click', function () { teams.forEach(function (t) { if (order.indexOf(t.id) < 0) order.push(t.id); }); render(); });
      var none = el('button', 'btn btn-ghost btn-sm', 'Clear'); none.type = 'button';
      none.addEventListener('click', function () { order = []; render(); });
      var manage = el('a', 'btn btn-ghost btn-sm', '✎ Manage teams'); manage.href = opts.manageHref;
      tools.appendChild(all); tools.appendChild(none); tools.appendChild(manage);
      box.appendChild(tools);
      teams.forEach(function (t) {
        var pos = order.indexOf(t.id);
        var b = el('button', 'pick' + (pos >= 0 ? ' on' : ''));
        b.type = 'button';
        b.setAttribute('aria-pressed', String(pos >= 0));
        b.appendChild(el('span', 'pick-badge', pos >= 0 ? String(pos + 1) : ''));
        b.appendChild(el('span', 'pick-name', t.name));
        b.addEventListener('click', function () {
          var i = order.indexOf(t.id);
          if (i >= 0) order.splice(i, 1); else order.push(t.id);
          render();
          var again = box.querySelector('[data-id="' + t.id + '"]'); if (again) again.focus();
        });
        b.dataset.id = t.id;
        box.appendChild(b);
      });
      box.appendChild(el('p', 'note', order.length + ' selected' + (opts.orderHint ? ' · ' + opts.orderHint : '')));
    }

    return {
      load: function (preselect) {
        return RavanAPI.teamsList().then(function (s) {
          teams = (s && s.teams) || [];
          var ids = teams.map(function (t) { return t.id; });
          order = (preselect || []).filter(function (id) { return ids.indexOf(id) >= 0; });
          render();
          return teams;
        });
      },
      selected: function () { return order.slice(); },
      count: function () { return teams.length; }
    };
  };
})();
