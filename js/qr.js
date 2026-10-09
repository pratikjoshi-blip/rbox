/*
 * Ravan-face QR codes, built on the vendored qrcode-generator (MIT).
 *
 * Uses error-correction level H (≈30% recoverable), so Ravan's face can sit in the
 * centre of the code. The emblem covers only ~7% of the symbol and never touches the
 * finder, timing or alignment patterns. Square maroon modules on cream (verified with
 * jsQR + OpenCV decoders across sizes).
 *
 *   RavanQR.draw(canvas, text, { emblem: true, frame: false }) → Promise
 */
(function () {
  var INK = '#2a0a10', INK_2 = '#5e0c1d', EYE_INNER = '#8a1426', PAPER = '#fff8e6';
  var emblemImg = null;

  function matrix(text) {
    var qr = window.qrcode(0, 'H');
    qr.addData(unescape(encodeURIComponent(text)), 'Byte');
    qr.make();
    return qr;
  }

  /* Main face + crown + the inner side heads, cropped from the shared Ravan SVG. */
  function loadEmblem() {
    if (emblemImg) return emblemImg;
    emblemImg = new Promise(function (resolve) {
      if (!window.RavanArt) return resolve(null);
      var svg = window.RavanArt.markup('qr')
        .replace('viewBox="0 0 1000 800"', 'viewBox="170 0 660 800" width="660" height="800"')
        .replace('<svg ', '<svg preserveAspectRatio="xMidYMid meet" ');
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { resolve(null); };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
    return emblemImg;
  }

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function isFinder(r, c, n) {
    return (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
  }

  function draw(canvas, text, opts) {
    opts = opts || {};
    var useEmblem = opts.emblem !== false;
    var qr = matrix(text);
    var n = qr.getModuleCount();
    var quiet = 4;
    var size = canvas.width;
    var frame = opts.frame ? Math.round(size * 0.035) : 0;
    var cell = (size - frame * 2) / (n + quiet * 2);
    var off = frame + quiet * cell;
    var g = canvas.getContext('2d');

    // emblem area: an odd number of modules, centred (~27% of the width ≈ 7% of the area)
    var e = Math.round(n * 0.27);
    if (e % 2 === 0) e += 1;
    var e0 = (n - e) / 2;
    var inEmblem = function (r, c) { return useEmblem && r >= e0 && r < e0 + e && c >= e0 && c < e0 + e; };

    // paper
    g.clearRect(0, 0, size, size);
    g.fillStyle = PAPER;
    g.fillRect(0, 0, size, size);
    if (frame) {
      g.lineWidth = frame * 0.5;
      g.strokeStyle = '#d9a11f';
      roundRect(g, frame * 0.5, frame * 0.5, size - frame, size - frame, frame * 1.5);
      g.stroke();
    }

    // data modules: solid squares by default (dots are optional but scan less reliably), deep maroon
    var grad = g.createLinearGradient(off, off, off + n * cell, off + n * cell);
    grad.addColorStop(0, INK);
    grad.addColorStop(1, INK_2);
    g.fillStyle = grad;
    var dots = opts.modules === 'dots';
    var rad = cell * 0.46;
    g.beginPath();
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        if (!qr.isDark(r, c) || isFinder(r, c, n) || inEmblem(r, c)) continue;
        var x0 = off + c * cell, y0 = off + r * cell;
        if (dots) {
          g.moveTo(x0 + cell / 2 + rad, y0 + cell / 2);
          g.arc(x0 + cell / 2, y0 + cell / 2, rad, 0, Math.PI * 2);
        } else {
          // solid squares (slightly overlapped so neighbours join without hairline gaps)
          g.rect(x0 - 0.25, y0 - 0.25, cell + 0.5, cell + 0.5);
        }
      }
    }
    g.fill();

    // finder "eyes": rounded square ring + rounded inner square
    // square finder 'eyes' by default: rounded ones failed decoder tests (see README)
    var rr = opts.roundEyes === true ? 1 : 0;
    [[0, 0], [0, n - 7], [n - 7, 0]].forEach(function (p) {
      var x = off + p[1] * cell, y = off + p[0] * cell;
      g.fillStyle = INK;
      roundRect(g, x, y, 7 * cell, 7 * cell, cell * 1.6 * rr + 0.01);
      g.fill();
      g.fillStyle = PAPER;
      roundRect(g, x + cell, y + cell, 5 * cell, 5 * cell, cell * 1.0 * rr + 0.01);
      g.fill();
      g.fillStyle = opts.eyeInner || EYE_INNER;
      roundRect(g, x + 2 * cell, y + 2 * cell, 3 * cell, 3 * cell, cell * 0.7 * rr + 0.01);
      g.fill();
    });

    if (!useEmblem) return Promise.resolve(canvas);

    // Ravan badge
    var bx = off + e0 * cell, bw = e * cell;
    var pad = cell * 0.35;
    var bg = g.createRadialGradient(bx + bw / 2, bx + bw * 0.4, 0, bx + bw / 2, bx + bw / 2, bw * 0.7);
    bg.addColorStop(0, '#7c1426');
    bg.addColorStop(1, '#2a0610');
    g.fillStyle = bg;
    roundRect(g, bx + pad, bx + pad, bw - pad * 2, bw - pad * 2, bw * 0.2);
    g.fill();
    g.lineWidth = Math.max(1.5, cell * 0.28);
    g.strokeStyle = '#f4c542';
    roundRect(g, bx + pad, bx + pad, bw - pad * 2, bw - pad * 2, bw * 0.2);
    g.stroke();

    return loadEmblem().then(function (img) {
      if (img) {
        var ih = bw * 0.84, iw = ih * (660 / 800);
        g.drawImage(img, bx + (bw - iw) / 2, bx + (bw - ih) / 2 + bw * 0.02, iw, ih);
      }
      return canvas;
    });
  }

  window.RavanQR = { draw: draw };
})();
