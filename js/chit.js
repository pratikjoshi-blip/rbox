/*
 * Paper chits. All user text goes through textContent — never innerHTML — so
 * submissions can never inject markup (XSS-safe by construction).
 */
(function () {
  // Small deterministic PRNG so a chit keeps the same "imperfections" across re-renders
  function seeded(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return function () {
      h += 0x6d2b79f5;
      var t = h;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Slightly torn / uneven paper outline
  function tornClip(rnd) {
    var pts = [];
    var n = 9;
    var j = function (amt) { return (rnd() * amt).toFixed(2); };
    for (var i = 0; i <= n; i++) pts.push((i / n * 100).toFixed(2) + '% ' + j(2.2) + '%');
    for (var k = 1; k <= n; k++) pts.push((100 - j(1.6)) + '% ' + (k / n * 100).toFixed(2) + '%');
    for (var m = n - 1; m >= 0; m--) pts.push((m / n * 100).toFixed(2) + '% ' + (100 - j(2.4)) + '%');
    for (var q = n - 1; q >= 1; q--) pts.push(j(1.6) + '% ' + (q / n * 100).toFixed(2) + '%');
    return 'polygon(' + pts.join(',') + ')';
  }

  var TINTS = ['#fbf1d6', '#f8ead0', '#fdf5e1', '#f5e6c4', '#faefd9'];

  /**
   * create(sub, opts) → HTMLElement
   *   sub: { id, category, message }
   *   opts.tag: 'div' | 'button'
   */
  function create(sub, opts) {
    opts = opts || {};
    var rnd = seeded(String(sub.id || Math.random()));
    var cat = window.categoryById(sub.category);
    var el = document.createElement(opts.tag || 'div');
    el.className = 'chit' + (opts.className ? ' ' + opts.className : '');
    if (opts.tag === 'button') el.type = 'button';

    var paper = document.createElement('div');
    paper.className = 'chit-paper';
    paper.style.clipPath = tornClip(rnd);
    paper.style.webkitClipPath = paper.style.clipPath;
    paper.style.backgroundColor = TINTS[Math.floor(rnd() * TINTS.length)];
    paper.style.setProperty('--fold', (20 + rnd() * 60).toFixed(1) + '%');
    paper.style.setProperty('--off', (rnd() * 0.12).toFixed(3));

    var head = document.createElement('div');
    head.className = 'chit-cat';
    var emo = document.createElement('span');
    emo.className = 'chit-emoji';
    emo.setAttribute('aria-hidden', 'true');
    emo.textContent = cat.emoji;
    var lab = document.createElement('span');
    lab.textContent = cat.label;
    head.appendChild(emo);
    head.appendChild(lab);

    var msg = document.createElement('p');
    msg.className = 'chit-msg';
    var text = (sub.message || '').trim();
    if (text) {
      msg.textContent = '“' + text + '”';
      var len = text.length;
      msg.classList.add(len > 110 ? 'len-xl' : len > 70 ? 'len-l' : len > 35 ? 'len-m' : 'len-s');
    } else {
      msg.textContent = 'I let go of ' + cat.label.replace(/[“”]/g, '').toLowerCase() + '.';
      msg.classList.add('len-s', 'chit-msg-empty');
    }

    var burn = document.createElement('div');
    burn.className = 'chit-burn';
    burn.setAttribute('aria-hidden', 'true');

    paper.appendChild(head);
    paper.appendChild(msg);
    paper.appendChild(burn);
    el.appendChild(paper);
    el.setAttribute('aria-label', cat.label + (text ? ': ' + text : ''));
    el.__rnd = rnd;
    return el;
  }

  window.Chit = { create: create, seeded: seeded };
})();
