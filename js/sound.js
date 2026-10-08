/*
 * Ceremony sound — synthesised with the Web Audio API, so no audio files ship.
 * OFF by default. RavanSound.setEnabled(true) must be called from a user gesture.
 */
(function () {
  var ctx = null, master = null, enabled = false, ambience = null, fireNodes = null;

  function ensure() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.8;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function noiseBuffer(sec) {
    var len = Math.floor(ctx.sampleRate * sec);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  function tone(freq, type, start, dur, peak, dest) {
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(peak, start + Math.min(0.05, dur / 4));
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g); g.connect(dest || master);
    o.start(start); o.stop(start + dur + 0.05);
    return o;
  }

  function startAmbience() {
    if (!enabled || ambience || !ensure()) return;
    // Tanpura-like drone: Sa – Pa – Sa'
    var g = ctx.createGain();
    g.gain.value = 0.0001;
    g.gain.exponentialRampToValueAtTime(0.06, ctx.currentTime + 3);
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 900;
    lp.connect(g); g.connect(master);
    var oscs = [130.81, 196.0, 261.63, 130.81 * 1.003].map(function (f) {
      var o = ctx.createOscillator();
      o.type = 'sawtooth'; o.frequency.value = f;
      var og = ctx.createGain(); og.gain.value = 0.25;
      o.connect(og); og.connect(lp); o.start();
      return o;
    });
    var lfo = ctx.createOscillator(); var lfoG = ctx.createGain();
    lfo.frequency.value = 0.15; lfoG.gain.value = 300;
    lfo.connect(lfoG); lfoG.connect(lp.frequency); lfo.start();
    ambience = { gain: g, oscs: oscs.concat([lfo]) };
  }

  function stopAmbience(fade) {
    if (!ambience || !ctx) return;
    var a = ambience; ambience = null;
    var t = ctx.currentTime;
    a.gain.gain.cancelScheduledValues(t);
    a.gain.gain.setValueAtTime(a.gain.gain.value, t);
    a.gain.gain.exponentialRampToValueAtTime(0.0001, t + (fade || 1));
    a.oscs.forEach(function (o) { o.stop(t + (fade || 1) + 0.1); });
  }

  var api = {
    isEnabled: function () { return enabled; },
    setEnabled: function (on) {
      enabled = !!on;
      if (enabled) { ensure(); startAmbience(); }
      else { stopAmbience(0.4); api.stopFire(0.3); }
      return enabled;
    },
    ambience: startAmbience,
    stopAmbience: stopAmbience,
    // deep rumble + rising growl for the mouth opening
    mouth: function () {
      if (!enabled || !ensure()) return;
      var t = ctx.currentTime;
      var o = ctx.createOscillator(); var g = ctx.createGain(); var lp = ctx.createBiquadFilter();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(48, t); o.frequency.exponentialRampToValueAtTime(90, t + 1.6);
      lp.type = 'lowpass'; lp.frequency.value = 420;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.4);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
      o.connect(lp); lp.connect(g); g.connect(master); o.start(t); o.stop(t + 2.3);
      tone(65.4, 'sine', t, 1.6, 0.3);
    },
    // soft paper rustle
    paper: function () {
      if (!enabled || !ensure()) return;
      var t = ctx.currentTime;
      var s = ctx.createBufferSource(); s.buffer = noiseBuffer(0.25);
      var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3000 + Math.random() * 2000; bp.Q.value = 1.5;
      var g = ctx.createGain(); g.gain.setValueAtTime(0.08, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      s.connect(bp); bp.connect(g); g.connect(master); s.start(t);
    },
    // fire: roar (filtered noise swelling) + random crackles
    fire: function (duration) {
      if (!enabled || !ensure()) return;
      api.stopFire(0.1);
      var t = ctx.currentTime;
      var src = ctx.createBufferSource(); src.buffer = noiseBuffer(2); src.loop = true;
      var lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
      lp.frequency.setValueAtTime(300, t); lp.frequency.linearRampToValueAtTime(1600, t + duration * 0.55);
      lp.frequency.linearRampToValueAtTime(400, t + duration);
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12, t + 1);
      g.gain.exponentialRampToValueAtTime(0.55, t + duration * 0.4);
      g.gain.setValueAtTime(0.55, t + duration * 0.7);
      g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
      src.connect(lp); lp.connect(g); g.connect(master); src.start(t); src.stop(t + duration + 0.1);
      var crackle = setInterval(function () {
        if (!enabled) return;
        var n = ctx.currentTime;
        var c = ctx.createBufferSource(); c.buffer = noiseBuffer(0.04);
        var hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1800;
        var cg = ctx.createGain(); cg.gain.setValueAtTime(0.1 + Math.random() * 0.25, n);
        cg.gain.exponentialRampToValueAtTime(0.0001, n + 0.05);
        c.connect(hp); hp.connect(cg); cg.connect(master); c.start(n);
      }, 70);
      fireNodes = { src: src, g: g, crackle: crackle };
      setTimeout(function () { clearInterval(crackle); }, duration * 1000);
    },
    stopFire: function (fade) {
      if (!fireNodes || !ctx) return;
      clearInterval(fireNodes.crackle);
      var t = ctx.currentTime;
      try {
        fireNodes.g.gain.cancelScheduledValues(t);
        fireNodes.g.gain.setValueAtTime(Math.max(0.0001, fireNodes.g.gain.value), t);
        fireNodes.g.gain.exponentialRampToValueAtTime(0.0001, t + (fade || 0.3));
        fireNodes.src.stop(t + (fade || 0.3) + 0.05);
      } catch (e) {}
      fireNodes = null;
    },
    // final soft temple-bell chime
    chime: function () {
      if (!enabled || !ensure()) return;
      var t = ctx.currentTime;
      [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) {
        tone(f, 'sine', t + i * 0.18, 3.2, 0.12);
        tone(f * 2.76, 'sine', t + i * 0.18, 1.4, 0.025);
      });
    },
    // tiny "gulp" + shimmer for the employee drop
    drop: function () {
      if (!enabled || !ensure()) return;
      var t = ctx.currentTime;
      var o = ctx.createOscillator(); var g = ctx.createGain();
      o.frequency.setValueAtTime(320, t); o.frequency.exponentialRampToValueAtTime(110, t + 0.25);
      g.gain.setValueAtTime(0.2, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.35);
      tone(1318.5, 'sine', t + 0.3, 1.2, 0.06);
    }
  };
  window.RavanSound = api;
})();
