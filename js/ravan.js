/*
 * The Ravan face — a stylised, festive SVG illustration (viewBox 1000 × 800).
 * The face IS the box; the mouth is the opening.
 *
 *   RavanArt.markup(prefix)       → SVG string (prefix keeps gradient ids unique)
 *   RavanArt.setMouth(svg, t)     → t: 0 = closed … 1 = wide open
 *   RavanArt.animateMouth(svg, to, ms) → Promise
 *   RavanArt.mouthPoint(svg)      → {x, y} screen coords of the mouth opening
 */
(function () {
  var MOUTH = { x: 500, y: 600 };

  function mandala(p) {
    var s = '<g class="rv-mandala" opacity="0.32">';
    s += '<circle cx="500" cy="330" r="330" fill="none" stroke="url(#' + p + 'gold)" stroke-width="2"/>';
    s += '<circle cx="500" cy="330" r="312" fill="none" stroke="url(#' + p + 'gold)" stroke-width="1" stroke-dasharray="3 9"/>';
    s += '<circle cx="500" cy="330" r="250" fill="none" stroke="url(#' + p + 'gold)" stroke-width="1.5"/>';
    for (var i = 0; i < 32; i++) {
      var a = (i / 32) * 360;
      s += '<path transform="rotate(' + a + ' 500 330)" d="M500 0 Q 520 40 500 78 Q 480 40 500 0 Z" fill="url(#' + p + 'gold)" opacity="0.55"/>';
    }
    for (var j = 0; j < 16; j++) {
      var b = (j / 16) * 360 + 11.25;
      s += '<circle transform="rotate(' + b + ' 500 330)" cx="500" cy="96" r="6" fill="url(#' + p + 'gold)"/>';
    }
    return s + '</g>';
  }

  function sideHead(p, cx, cy, sc, flip) {
    var t = 'translate(' + cx + ' ' + cy + ') scale(' + (flip ? -sc : sc) + ' ' + sc + ')';
    return (
      '<g class="rv-side" transform="' + t + '">' +
      '<path d="M-118 -120 C-150 -20 -150 90 -120 170 L-60 120 Z M118 -120 C150 -20 150 90 120 170 L60 120 Z" fill="#160b10"/>' +
      '<path d="M-110 -120 C-122 -20 -106 80 -52 140 C-26 166 26 166 52 140 C106 80 122 -20 110 -120 Z" fill="url(#' + p + 'skinSide)" stroke="#3d0f08" stroke-width="4"/>' +
      '<path d="M-74 -52 Q-44 -74 -10 -60" stroke="#140a0c" stroke-width="12" fill="none" stroke-linecap="round"/>' +
      '<path d="M74 -52 Q44 -74 10 -60" stroke="#140a0c" stroke-width="12" fill="none" stroke-linecap="round"/>' +
      '<path d="M-72 -30 Q-42 -50 -12 -30 Q-42 -12 -72 -30 Z" fill="#fff4dc" stroke="#140a0c" stroke-width="4"/>' +
      '<path d="M72 -30 Q42 -50 12 -30 Q42 -12 72 -30 Z" fill="#fff4dc" stroke="#140a0c" stroke-width="4"/>' +
      '<circle cx="-40" cy="-31" r="9" fill="#2a1208"/><circle cx="40" cy="-31" r="9" fill="#2a1208"/>' +
      '<path d="M0 40 C-20 36 -48 44 -70 40 C-86 36 -86 18 -74 18 C-66 18 -66 28 -72 30 C-50 30 -24 24 0 30 C24 24 50 30 72 30 C66 28 66 18 74 18 C86 18 86 36 70 40 C48 44 20 36 0 40 Z" fill="#140a0c"/>' +
      '<path d="M-26 72 Q0 82 26 72" stroke="#5a140c" stroke-width="7" fill="none" stroke-linecap="round"/>' +
      '<path d="M-30 -96 Q0 -102 30 -96" stroke="#f6e7c8" stroke-width="5" fill="none" stroke-linecap="round"/>' +
      '<circle cx="0" cy="-84" r="6" fill="#c8102e"/>' +
      '<g class="rv-gold">' +
      '<path d="M-128 -108 L-114 -205 L-64 -172 L0 -262 L64 -172 L114 -205 L128 -108 Q0 -128 -128 -108 Z" fill="url(#' + p + 'gold)" stroke="#7a4a06" stroke-width="3"/>' +
      '<path d="M-128 -108 Q0 -128 128 -108 L124 -136 Q0 -154 -124 -136 Z" fill="url(#' + p + 'goldDeep)"/>' +
      '<circle cx="0" cy="-176" r="16" fill="#c8102e" stroke="#fff1a8" stroke-width="4"/>' +
      '<circle cx="-62" cy="-122" r="7" fill="#1f9d6b"/><circle cx="62" cy="-122" r="7" fill="#1f9d6b"/>' +
      '<circle cx="-122" cy="40" r="16" fill="none" stroke="url(#' + p + 'gold)" stroke-width="7"/>' +
      '<circle cx="122" cy="40" r="16" fill="none" stroke="url(#' + p + 'gold)" stroke-width="7"/>' +
      '</g></g>'
    );
  }

  /* Left-half facial features; mirrored for the right side. */
  function halfFeatures(p) {
    return (
      // ear + kundal
      '<ellipse cx="336" cy="468" rx="22" ry="44" fill="url(#' + p + 'skin)" stroke="#4a120a" stroke-width="3"/>' +
      '<path d="M336 440 Q326 468 338 494" stroke="#7a2616" stroke-width="3" fill="none"/>' +
      '<g class="rv-gold rv-earring"><circle cx="334" cy="540" r="24" fill="none" stroke="url(#' + p + 'gold)" stroke-width="8"/>' +
      '<circle cx="334" cy="566" r="9" fill="#c8102e" stroke="#fff1a8" stroke-width="2"/></g>' +
      // cheek blush
      '<ellipse cx="402" cy="528" rx="40" ry="22" fill="#ff7a5c" opacity="0.28"/>' +
      // brow
      '<path class="rv-brow" d="M386 418 Q420 378 476 396 Q472 404 466 404 Q424 394 396 424 Z" fill="#120808"/>' +
      // eye
      '<g class="rv-eye">' +
      '<path d="M398 446 Q440 414 484 442 Q440 474 398 446 Z" fill="#fff6e2"/>' +
      '<circle cx="443" cy="444" r="15" fill="#3a1c0e"/><circle cx="443" cy="444" r="15" fill="none" stroke="#c9902a" stroke-width="2.5"/>' +
      '<circle cx="443" cy="444" r="7" fill="#0b0503"/><circle cx="448" cy="439" r="4" fill="#fff"/>' +
      '<path d="M398 446 Q440 414 484 442" stroke="#120808" stroke-width="6" fill="none" stroke-linecap="round"/>' +
      '<path d="M398 446 Q440 474 484 442" stroke="#120808" stroke-width="3" fill="none"/>' +
      '<path d="M400 445 L380 434" stroke="#120808" stroke-width="5" stroke-linecap="round"/>' +
      '</g>' +
      '<ellipse class="rv-eyeglow" cx="441" cy="444" rx="58" ry="34" fill="url(#' + p + 'eyeGlow)" opacity="0"/>' +
      // moustache half
      '<path d="M500 552 C480 546 456 549 432 561 C408 574 382 574 368 556 C357 541 364 520 382 519 C395 519 400 532 391 538 C401 545 414 538 432 531 C458 522 484 530 500 540 Z" fill="#140a0c"/>'
    );
  }

  function crown(p) {
    var gems = '';
    for (var i = 0; i < 8; i++) {
      var x = 360 + i * 40;
      gems += '<circle cx="' + x + '" cy="' + (291 - Math.sin((i / 7) * Math.PI) * 10) + '" r="8" fill="' + (i % 2 ? '#1f9d6b' : '#c8102e') + '" stroke="#fff1a8" stroke-width="2"/>';
    }
    var petals = '';
    for (var k = 0; k < 12; k++) {
      petals += '<path transform="rotate(' + k * 30 + ' 500 196)" d="M500 152 Q510 172 500 186 Q490 172 500 152 Z" fill="url(#' + p + 'gold)"/>';
    }
    return (
      '<g class="rv-crown">' +
      // side flares
      '<path class="rv-gold" d="M330 262 Q262 238 250 170 Q300 196 346 214 Z" fill="url(#' + p + 'gold)" stroke="#7a4a06" stroke-width="3"/>' +
      '<path class="rv-gold" d="M670 262 Q738 238 750 170 Q700 196 654 214 Z" fill="url(#' + p + 'gold)" stroke="#7a4a06" stroke-width="3"/>' +
      // main mukut
      '<path class="rv-gold" d="M330 274 L350 168 Q380 184 406 160 L432 106 Q468 120 500 36 Q532 120 568 106 L594 160 Q620 184 650 168 L670 274 Z" fill="url(#' + p + 'gold)" stroke="#7a4a06" stroke-width="4"/>' +
      '<path d="M372 262 L384 196 Q412 206 432 180 L452 140 Q478 150 500 96 Q522 150 548 140 L568 180 Q588 206 616 196 L628 262 Z" fill="url(#' + p + 'maroon)"/>' +
      '<g class="rv-gold"><circle cx="500" cy="196" r="50" fill="url(#' + p + 'goldDeep)"/>' + petals +
      '<circle cx="500" cy="196" r="20" fill="#c8102e" stroke="#fff1a8" stroke-width="4"/><circle cx="506" cy="190" r="5" fill="#ffd0d6"/></g>' +
      '<circle class="rv-gold" cx="420" cy="236" r="10" fill="#1f9d6b" stroke="#fff1a8" stroke-width="3"/>' +
      '<circle class="rv-gold" cx="580" cy="236" r="10" fill="#1f9d6b" stroke="#fff1a8" stroke-width="3"/>' +
      // finial
      '<path class="rv-gold" d="M500 4 L510 30 Q518 44 500 54 Q482 44 490 30 Z" fill="url(#' + p + 'gold)" stroke="#7a4a06" stroke-width="2"/>' +
      '<circle cx="500" cy="38" r="6" fill="#c8102e"/>' +
      // band
      '<path class="rv-gold" d="M316 324 Q500 298 684 324 L676 266 Q500 244 324 266 Z" fill="url(#' + p + 'gold)" stroke="#7a4a06" stroke-width="4"/>' +
      gems +
      // pearl fringe
      '<path d="M340 322 Q500 300 660 322" stroke="#fff6e2" stroke-width="5" stroke-dasharray="1 11" stroke-linecap="round" fill="none"/>' +
      '</g>'
    );
  }

  function markup(prefix) {
    var p = prefix || 'rv';
    var defs =
      '<defs>' +
      '<linearGradient id="' + p + 'gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3b0"/><stop offset="0.45" stop-color="#f4c542"/><stop offset="1" stop-color="#a86d0c"/></linearGradient>' +
      '<linearGradient id="' + p + 'goldDeep" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e2a92a"/><stop offset="1" stop-color="#8a5506"/></linearGradient>' +
      '<linearGradient id="' + p + 'maroon" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7c1426"/><stop offset="1" stop-color="#3e0712"/></linearGradient>' +
      '<radialGradient id="' + p + 'skin" cx="0.5" cy="0.36" r="0.7"><stop offset="0" stop-color="#f3a86c"/><stop offset="0.45" stop-color="#d4703d"/><stop offset="0.8" stop-color="#a63e22"/><stop offset="1" stop-color="#7a2616"/></radialGradient>' +
      '<radialGradient id="' + p + 'skinSide" cx="0.5" cy="0.4" r="0.7"><stop offset="0" stop-color="#c97a4b"/><stop offset="0.7" stop-color="#8e3a20"/><stop offset="1" stop-color="#5e1d10"/></radialGradient>' +
      '<radialGradient id="' + p + 'eyeGlow"><stop offset="0" stop-color="#fffbe0"/><stop offset="0.35" stop-color="#ffd25a" stop-opacity="0.9"/><stop offset="1" stop-color="#ff7a00" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="' + p + 'mouth" cx="0.5" cy="0.35" r="0.7"><stop offset="0" stop-color="#2a0306"/><stop offset="0.7" stop-color="#4a0a10"/><stop offset="1" stop-color="#7a1a1a"/></radialGradient>' +
      '<radialGradient id="' + p + 'halo" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#ffb347" stop-opacity="0.35"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></radialGradient>' +
      '</defs>';

    var sides = '';
    var spec = [[62, 395, 0.45], [130, 410, 0.5], [205, 425, 0.56], [290, 440, 0.62]];
    for (var i = 0; i < spec.length; i++) {
      sides += sideHead(p, spec[i][0], spec[i][1], spec[i][2], false);
      sides += sideHead(p, 1000 - spec[i][0], spec[i][1], spec[i][2], true);
    }

    var half = halfFeatures(p);

    return (
      '<svg class="ravan-svg" viewBox="0 0 1000 800" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Stylised face of Ravan with a golden crown, ten heads and a closed mouth">' +
      defs +
      '<ellipse cx="500" cy="420" rx="500" ry="380" fill="url(#' + p + 'halo)"/>' +
      mandala(p) +
      '<g class="rv-sideheads">' + sides + '</g>' +
      // neck + hair
      '<path d="M440 680 L436 800 L564 800 L560 680 Z" fill="#8e3420"/>' +
      '<path d="M334 292 C276 360 270 530 300 650 C318 610 330 566 348 524 Z" fill="#170b10"/>' +
      '<path d="M666 292 C724 360 730 530 700 650 C682 610 670 566 652 524 Z" fill="#170b10"/>' +
      // face
      '<g class="rv-face">' +
      '<path class="rv-face-shape" d="M346 300 C334 420 344 560 400 650 C440 706 470 728 500 728 C530 728 560 706 600 650 C656 560 666 420 654 300 Z" fill="url(#' + p + 'skin)" stroke="#4a120a" stroke-width="4"/>' +
      '<g class="rv-features">' + half + '<g transform="translate(1000 0) scale(-1 1)">' + half + '</g>' +
      // tripundra + bindu
      '<path d="M446 342 Q500 334 554 342" stroke="#f6e7c8" stroke-width="6" fill="none" stroke-linecap="round"/>' +
      '<path d="M442 356 Q500 348 558 356" stroke="#f6e7c8" stroke-width="6" fill="none" stroke-linecap="round"/>' +
      '<path d="M446 370 Q500 362 554 370" stroke="#f6e7c8" stroke-width="6" fill="none" stroke-linecap="round"/>' +
      '<circle cx="500" cy="356" r="8" fill="#c8102e"/>' +
      // nose
      '<path d="M494 452 Q488 500 482 520" stroke="#8a3018" stroke-width="4" fill="none" stroke-linecap="round"/>' +
      '<path d="M476 518 Q488 534 500 528 Q512 534 524 518" stroke="#5a1a10" stroke-width="4" fill="none" stroke-linecap="round"/>' +
      '</g>' +
      // mouth
      '<g class="rv-mouth">' +
      '<ellipse class="rv-mouth-cavity" cx="500" cy="600" rx="46" ry="3" fill="url(#' + p + 'mouth)"/>' +
      '<g class="rv-lip-upper"><path d="M452 598 Q476 584 500 592 Q524 584 548 598 Q500 606 452 598 Z" fill="#a8182a" stroke="#5a0a12" stroke-width="2"/></g>' +
      '<g class="rv-lip-lower"><path d="M456 601 Q500 630 544 601 Q500 611 456 601 Z" fill="#b8202e" stroke="#5a0a12" stroke-width="2"/>' +
      '<path d="M482 646 Q500 652 518 646" stroke="#8a3018" stroke-width="3" fill="none" stroke-linecap="round"/></g>' +
      '</g>' +
      '</g>' +
      // necklace
      '<g class="rv-gold rv-necklace">' +
      '<path d="M404 716 Q500 796 596 716" stroke="url(#' + p + 'gold)" stroke-width="10" fill="none"/>' +
      '<path d="M372 732 Q500 840 628 732" stroke="url(#' + p + 'gold)" stroke-width="7" fill="none" stroke-dasharray="14 6"/>' +
      '<circle cx="500" cy="764" r="13" fill="#c8102e" stroke="#fff1a8" stroke-width="3"/>' +
      '<circle cx="452" cy="752" r="7" fill="#1f9d6b"/><circle cx="548" cy="752" r="7" fill="#1f9d6b"/>' +
      '</g>' +
      crown(p) +
      '</svg>'
    );
  }

  function setMouth(svg, t) {
    if (!svg) return;
    t = Math.max(0, Math.min(1, t));
    svg.__mouth = t;
    var cav = svg.querySelector('.rv-mouth-cavity');
    var low = svg.querySelector('.rv-lip-lower');
    var up = svg.querySelector('.rv-lip-upper');
    if (cav) {
      cav.setAttribute('ry', (3 + 40 * t).toFixed(2));
      cav.setAttribute('rx', (46 + 10 * t).toFixed(2));
      cav.setAttribute('cy', (600 + 20 * t).toFixed(2));
    }
    if (low) low.setAttribute('transform', 'translate(0 ' + (40 * t).toFixed(2) + ')');
    if (up) up.setAttribute('transform', 'translate(0 ' + (-3 * t).toFixed(2) + ')');
  }

  function animateMouth(svgs, to, ms) {
    var list = Array.isArray(svgs) ? svgs : [svgs];
    var from = (list[0] && list[0].__mouth) || 0;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) ms = Math.min(ms, 200);
    return new Promise(function (resolve) {
      var start = performance.now();
      function step(now) {
        var k = Math.min(1, (now - start) / ms);
        var e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        list.forEach(function (s) { setMouth(s, from + (to - from) * e); });
        if (k < 1) requestAnimationFrame(step); else resolve();
      }
      requestAnimationFrame(step);
    });
  }

  function mouthPoint(svg) {
    var r = svg.getBoundingClientRect();
    // viewBox is 1000 × 800 and preserveAspectRatio is default (xMidYMid meet)
    var scale = Math.min(r.width / 1000, r.height / 800);
    var ox = r.left + (r.width - 1000 * scale) / 2;
    var oy = r.top + (r.height - 800 * scale) / 2;
    var t = svg.__mouth || 0;
    return { x: ox + MOUTH.x * scale, y: oy + (MOUTH.y + 14 * t) * scale, scale: scale };
  }

  /* Bounding box (screen px) of the main face incl. crown, used for fire timing + layout */
  function faceRect(svg) {
    var r = svg.getBoundingClientRect();
    var scale = Math.min(r.width / 1000, r.height / 800);
    var ox = r.left + (r.width - 1000 * scale) / 2;
    var oy = r.top + (r.height - 800 * scale) / 2;
    return { left: ox + 300 * scale, right: ox + 700 * scale, top: oy + 4 * scale, bottom: oy + 800 * scale,
      fullLeft: ox, fullRight: ox + 1000 * scale, scale: scale,
      y: function (svgY) { return oy + svgY * scale; } };
  }

  window.RavanArt = { markup: markup, setMouth: setMouth, animateMouth: animateMouth, mouthPoint: mouthPoint, faceRect: faceRect };
})();
