/*
 * Organizer navigation bar — injected on admin, teams, spinner and game pages.
 * NOT used on the employee page or the ceremony (on purpose).
 *
 *   <script src="../js/nav.js" data-base="../" data-mode="tv"></script>
 *   data-base: path from this page to the site root · data-mode="tv": auto-hide on screens
 */
(function () {
  var me = document.currentScript;
  var base = (me && me.getAttribute('data-base')) || './';
  var tv = me && me.getAttribute('data-mode') === 'tv';
  var LINKS = [
    { href: 'admin/', label: 'Admin', icon: '🏠' },
    { href: 'teams/', label: 'Teams', icon: '👥' },
    { href: 'spin/', label: 'Spinner', icon: '🎡' },
    { href: 'darts/score/', label: 'Darts', icon: '🎯' },
    { href: 'darts/', label: 'Darts TV', icon: '📺' },
    { href: 'hunt/score/', label: 'Hunt', icon: '🗺️' },
    { href: 'hunt/', label: 'Hunt TV', icon: '📺' }
  ];

  // which link is this page? (longest matching path wins, so darts/score/ beats darts/)
  var here = location.pathname.replace(/index\.html$/, '');
  var active = null, best = -1;
  LINKS.forEach(function (l) {
    var full = new URL(base + l.href, location.href).pathname;
    if (here.slice(-full.length) === full && full.length > best) { best = full.length; active = l; }
  });

  var nav = document.createElement('nav');
  nav.className = 'org-nav' + (tv ? ' org-nav-tv' : '');
  nav.setAttribute('aria-label', 'Organizer pages');
  var brand = document.createElement('a');
  brand.className = 'org-brand';
  brand.href = base + 'admin/';
  brand.innerHTML = '<span aria-hidden="true">🏹</span> <span class="gold-text">RAVAN BOX</span>';
  nav.appendChild(brand);
  var list = document.createElement('div');
  list.className = 'org-links';
  LINKS.forEach(function (l) {
    var a = document.createElement('a');
    a.href = base + l.href;
    a.className = 'org-link' + (l === active ? ' is-active' : '');
    if (l === active) a.setAttribute('aria-current', 'page');
    var i = document.createElement('span'); i.setAttribute('aria-hidden', 'true'); i.textContent = l.icon;
    a.appendChild(i);
    a.appendChild(document.createTextNode(' ' + l.label));
    list.appendChild(a);
  });
  nav.appendChild(list);
  document.body.insertBefore(nav, document.body.firstChild);
  if (active) {
    var cur = list.querySelector('.is-active');
    if (cur && cur.scrollIntoView) setTimeout(function () { list.scrollLeft = cur.offsetLeft - 60; }, 0);
  }

  // TV / projector pages: show on mouse move or focus, hide after 3 s idle
  if (tv) {
    var t;
    var show = function () { nav.classList.add('show'); clearTimeout(t); t = setTimeout(function () { if (!nav.matches(':hover') && !nav.contains(document.activeElement)) nav.classList.remove('show'); }, 3000); };
    ['mousemove', 'touchstart'].forEach(function (ev) { document.addEventListener(ev, show, { passive: true }); });
    nav.addEventListener('focusin', show);
    nav.addEventListener('mouseleave', show);
  }
})();
