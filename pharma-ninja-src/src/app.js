/* =====================================================================
 * PHARMA NINJA — application code
 *
 * Map of this file
 *   0. Settings & constants
 *   1. Brand art (wordmark, mascot, domain icons) as inline SVG strings
 *   2. Utilities
 *   3. Store        — IndexedDB with localStorage fallback; seeds on first run
 *   4. Sound        — Web Audio: generated music loop + effects, no files
 *   5. Leaderboard  — today's top 10 (Asia/Kolkata date), best score per name
 *   6. Stage        — Phaser scene: capsules, slicing visuals, particles,
 *                     trail, screen shake, attract-mode demo loop
 *   7. Input        — Pointer Events → swipe trails → slice detection
 *   8. Round        — game rules: questions, scoring, streaks, lives, timer
 *   9. Screens      — DOM screens: attract, name entry, picker, HUD, results
 *  10. Admin        — Milestone 1 stub: PIN + sound / quiet mode
 *  11. Boot & recovery
 * ===================================================================== */
(function () {
'use strict';

/* ---------------------------------------------------------------------
 * 0. SETTINGS & CONSTANTS
 * Defaults only; the live values are in Store.data.settings and will be
 * editable in the Milestone 2 admin.
 * ------------------------------------------------------------------- */
var DEFAULT_SETTINGS = {
  roundSeconds: 75,
  lives: 3,
  fallTimeStart: 6.0,     // seconds for a capsule to cross the play zone at round start
  fallTimeEnd: 3.2,       // ... and at round end (fall speed increases through the round)
  playZoneTop: 1 / 3,     // play zone as a fraction of screen height (default: lower two-thirds)
  playZoneBottom: 1.0,
  minSwipeSpeed: 0.5,     // CSS px per ms on a 1080-px short edge; slower moves (and taps) don't slice
  music: true, musicVolume: 0.5,
  effects: true, effectsVolume: 0.8,
  quiet: false,           // mutes everything instantly (podcast recording)
  idleSeconds: 30,        // idle time before returning to attract mode
  pin: '2026',
  maxPixelRatio: 2,       // device-pixel-ratio cap for performance
  leaderboardResetAt: 0   // manual reset timestamp (used by the M2 admin)
};
var NAME_MAX = 16, VID_MAX = 24;
var BASE_POINTS = 100, MIN_POINTS = 20;
var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Small offline name filter. Matches whole words after common letter swaps.
   Extend this list as needed; it is checked on the name-entry screen only. */
var BLOCKED_WORDS = ['shit','bastard','dick','cock','pussy','arse','slut','porn','sex','nazi','rape','gandu','randi','lund',
  'harami','kamina','saala','saali','mc','bc','bsdk'];                       // matched as whole words
var BLOCKED_PARTS = ['fuck','cunt','bitch','whore','hitler','asshole','wanker','chutiya','chutia','bhenchod','behenchod',
  'madarchod','bhosdi'];                                                     // matched anywhere in the name

/* ---------------------------------------------------------------------
 * 1. BRAND ART
 * ------------------------------------------------------------------- */
var svgSeq = 0;
function wordmark(kind) {
  /* Natural glyph proportions (no stretching). NINJA is cut by a diagonal slice and the lower half is knocked out of line. */
  var id = 'wm' + (++svgSeq);
  var f = "font-family:'Barlow Condensed','Arial Narrow',sans-serif;font-weight:800;font-style:italic;";
  if (kind === 'h') {
    return '<svg viewBox="0 0 760 150" width="100%" role="img" aria-label="Pharma Ninja"><defs>' +
      '<clipPath id="' + id + 't"><polygon points="420,0 770,0 770,50 420,101"/></clipPath>' +
      '<clipPath id="' + id + 'b"><polygon points="420,101 770,50 770,170 420,170"/></clipPath></defs>' +
      '<text x="0" y="125" style="' + f + 'font-size:140px" fill="#FFFFFF">PHARMA</text>' +
      '<g clip-path="url(#' + id + 't)"><text x="432" y="125" style="' + f + 'font-size:140px" fill="#F7943E">NINJA</text></g>' +
      '<g clip-path="url(#' + id + 'b)" transform="translate(7 5)"><text x="432" y="125" style="' + f + 'font-size:140px" fill="#F7943E">NINJA</text></g>' +
      '<line x1="424" y1="101" x2="748" y2="52" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round"/></svg>';
  }
  return '<svg viewBox="0 0 680 335" width="100%" role="img" aria-label="Pharma Ninja"><defs>' +
    '<clipPath id="' + id + 't"><polygon points="-20,0 700,0 700,193 -20,239"/></clipPath>' +
    '<clipPath id="' + id + 'b"><polygon points="-20,239 700,193 700,345 -20,345"/></clipPath></defs>' +
    '<text x="16" y="100" letter-spacing="8" style="' + f + 'font-size:112px" fill="#FFFFFF">PHARMA</text>' +
    '<g clip-path="url(#' + id + 't)"><text x="6" y="318" style="' + f + 'font-size:290px" fill="#F7943E">NINJA</text></g>' +
    '<g clip-path="url(#' + id + 'b)" transform="translate(11 8)"><text x="6" y="318" style="' + f + 'font-size:290px" fill="#F7943E">NINJA</text></g>' +
    '<line x1="-6" y1="239" x2="676" y2="193" stroke="#FFFFFF" stroke-width="6" stroke-linecap="round"/></svg>';
}

/* The mascot: a two-tone capsule wearing a ninja hood. mood = ready | cheer | sad */
function mascot(mood) {
  var blade = mood === 'cheer' ? 20 : mood === 'sad' ? 60 : 35;
  var bladeCol = mood === 'sad' ? ['#8A8A8A', '#BDBDBD', '#9E9E9E'] : ['#F7943E', '#E6E6E6', '#CFCFCF'];
  var s = '<svg viewBox="0 0 220 260" width="100%" aria-hidden="true">' +
    '<ellipse cx="110" cy="250" rx="72" ry="8" fill="#000" opacity="0.35"/>';
  if (mood === 'cheer') s += '<path d="M28 40 L31 50 L41 53 L31 56 L28 66 L25 56 L15 53 L25 50 Z" fill="#F7943E"/>' +
    '<path d="M192 104 L194 111 L201 113 L194 115 L192 122 L190 115 L183 113 L190 111 Z" fill="#fff"/>' +
    '<path d="M20 150 L22 156 L28 158 L22 160 L20 166 L18 160 L12 158 L18 156 Z" fill="#fff"/>';
  s += '<g transform="rotate(' + blade + ' 110 130)"><rect x="103" y="-8" width="14" height="50" rx="5" fill="' + bladeCol[0] + '"/>' +
    '<rect x="96" y="40" width="28" height="8" rx="3" fill="' + bladeCol[1] + '"/><rect x="105" y="48" width="10" height="170" rx="3" fill="' + bladeCol[2] + '"/></g>' +
    '<rect x="45" y="30" width="130" height="210" rx="65" fill="#F7943E"/>' +
    '<path d="M45 135 V95 A65 65 0 0 1 175 95 V135 Z" fill="#2E2E2E"/>' +
    '<rect x="45" y="131" width="130" height="8" fill="#D9741F"/>' +
    '<path d="M60 100 A50 50 0 0 1 100 48" stroke="#fff" stroke-opacity="0.2" stroke-width="5" fill="none" stroke-linecap="round"/>' +
    '<rect x="60" y="152" width="14" height="66" rx="7" fill="#fff" opacity="0.28"/>' +
    '<rect x="53" y="62" width="114" height="13" rx="4" fill="#F7943E"/>';
  if (mood === 'sad') s += '<path d="M164 66 C178 78 180 100 184 116 L170 112 C168 98 166 86 162 76 Z" fill="#F7943E"/>' +
    '<path d="M160 70 C164 88 160 104 162 122 L150 114 C150 100 152 86 156 76 Z" fill="#D9741F"/>';
  else if (mood === 'cheer') s += '<path d="M164 64 C188 54 196 30 210 18 L210 38 C200 54 188 72 166 76 Z" fill="#F7943E"/>' +
    '<path d="M164 70 C188 70 202 56 218 52 L210 70 C196 76 182 80 166 76 Z" fill="#D9741F"/>';
  else s += '<path d="M164 64 C188 58 198 40 214 32 L210 50 C198 58 188 72 166 76 Z" fill="#F7943E"/>' +
    '<path d="M164 70 C186 72 200 64 216 66 L206 80 C194 80 182 80 166 76 Z" fill="#D9741F"/>';
  s += '<line x1="98" y1="68.5" x2="122" y2="68.5" stroke="#1F1F1F" stroke-width="2"/>' +
    '<circle cx="98" cy="68.5" r="3" fill="#1F1F1F"/><circle cx="110" cy="68.5" r="3" fill="#1F1F1F"/><circle cx="122" cy="68.5" r="3" fill="#1F1F1F"/>' +
    '<rect x="58" y="82" width="104" height="36" rx="18" fill="#F4EFE9"/>';
  if (mood === 'cheer') s += '<path d="M83 105 Q92 92 101 105" stroke="#1F1F1F" stroke-width="5" fill="none" stroke-linecap="round"/>' +
    '<path d="M119 105 Q128 92 137 105" stroke="#1F1F1F" stroke-width="5" fill="none" stroke-linecap="round"/>';
  else if (mood === 'sad') s += '<ellipse cx="92" cy="104" rx="6" ry="7" fill="#1F1F1F"/><ellipse cx="128" cy="104" rx="6" ry="7" fill="#1F1F1F"/>' +
    '<line x1="82" y1="93" x2="100" y2="88" stroke="#1F1F1F" stroke-width="4" stroke-linecap="round"/><line x1="138" y1="93" x2="120" y2="88" stroke="#1F1F1F" stroke-width="4" stroke-linecap="round"/>' +
    '<path d="M140 112 C136 120 136 126 140 128 C144 126 144 120 140 112 Z" fill="#BFE3F5"/>';
  else s += '<ellipse cx="92" cy="101" rx="7" ry="9" fill="#1F1F1F"/><ellipse cx="128" cy="101" rx="7" ry="9" fill="#1F1F1F"/>' +
    '<circle cx="94.5" cy="97" r="2.5" fill="#fff"/><circle cx="130.5" cy="97" r="2.5" fill="#fff"/>' +
    '<line x1="81" y1="87" x2="100" y2="92" stroke="#1F1F1F" stroke-width="4" stroke-linecap="round"/><line x1="139" y1="87" x2="120" y2="92" stroke="#1F1F1F" stroke-width="4" stroke-linecap="round"/>';
  s += '<ellipse cx="86" cy="244" rx="18" ry="8" fill="#2E2E2E"/><ellipse cx="134" cy="244" rx="18" ry="8" fill="#2E2E2E"/></svg>';
  return s;
}

/* Domain icon set. A domain's `icon` field names one of these keys. */
var ICONS = {
  clipboard: '<rect x="12" y="9" width="24" height="32" rx="4"/><rect x="18" y="6" width="12" height="7" rx="2"/><polyline points="16,28 21,28 24,21 27,34 30,26 33,26"/>',
  shield: '<path d="M24 6 L38 11 V22 C38 31 32 38 24 42 C16 38 10 31 10 22 V11 Z"/><polyline points="17,24 22,29 31,19"/>',
  factory: '<path d="M6 40 V22 L15 28 V22 L24 28 V10 H31 V40"/><path d="M4 40 H44"/><rect x="34" y="27" width="9" height="9" rx="1.5"/><path d="M38.5 27 V31"/>',
  flask: '<path d="M18 6 H30"/><path d="M21 6 V18 L10 37 C9 39.5 10.5 42 13.5 42 H34.5 C37.5 42 39 39.5 38 37 L27 18 V6"/><path d="M14.5 31 H33.5"/><circle cx="22" cy="36.5" r="1.5"/>',
  chip: '<rect x="12" y="12" width="24" height="24" rx="5"/><path d="M18 7 V12 M30 7 V12 M18 36 V41 M30 36 V41 M7 18 H12 M7 30 H12 M36 18 H41 M36 30 H41"/><path d="M24 17 L25.8 22.2 L31 24 L25.8 25.8 L24 31 L22.2 25.8 L17 24 L22.2 22.2 Z"/>',
  cloud: '<path d="M14 28 C9.5 28 6 25 6 21 C6 17 9 14 13 14 C14 9.5 18 6 23 6 C28.5 6 32.5 10 33.5 15 C38.5 15 42 18 42 22 C42 25.5 39 28 35 28 Z"/><path d="M18 43 V36 M24 43 V33 M30 43 V38"/>',
  chart: '<path d="M8 41 H40"/><path d="M15 41 V32 M23 41 V27 M31 41 V22"/><polyline points="9,25 19,17 26,21 38,9"/><polyline points="31,9 38,9 38,16"/>',
  globe: '<circle cx="24" cy="24" r="17"/><ellipse cx="24" cy="24" rx="7.5" ry="17"/><path d="M7 24 H41 M9.5 15 H38.5 M9.5 33 H38.5"/>'
};
function icon(key, stroke) {
  return '<svg viewBox="0 0 48 48" fill="none" stroke="' + (stroke || 'currentColor') + '" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    (ICONS[key] || ICONS.clipboard) + '</svg>';
}

/* ---------------------------------------------------------------------
 * 2. UTILITIES
 * ------------------------------------------------------------------- */
function $(id) { return document.getElementById(id); }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function rand(a, b) { return a + Math.random() * (b - a); }
function shuffle(arr) { var a = arr.slice(); for (var i = a.length - 1; i > 0; i--) { var j = (Math.random() * (i + 1)) | 0; var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
function fmt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
/* Calendar date in Asia/Kolkata (UTC+5:30, no DST) — computed directly so it never depends on the OS time zone */
function istDate(ts) { return new Date(ts + 330 * 60000).toISOString().slice(0, 10); }
function istLabel(ts) {
  var d = new Date(ts + 330 * 60000);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' +
    ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()];
}
function remPx() { return Math.min(window.innerWidth, window.innerHeight) / 108; }
function fillSvgSlots(root) {
  var nodes = (root || document).querySelectorAll('[data-svg]');
  for (var i = 0; i < nodes.length; i++) {
    var k = nodes[i].getAttribute('data-svg');
    nodes[i].innerHTML = k === 'wordmark-stacked' ? wordmark('stacked') : k === 'wordmark-h' ? wordmark('h') : mascot(k.replace('mascot-', ''));
  }
}

/* ---------------------------------------------------------------------
 * 3. STORE
 * Everything is kept in the browser: IndexedDB first, localStorage if
 * IndexedDB is unavailable, memory as a last resort. Keys:
 *   settings, domains, questions, rounds (leaderboard history), plays (per-question log)
 * ------------------------------------------------------------------- */
var Store = {
  KEYS: ['settings', 'domains', 'questions', 'rounds', 'plays'],
  data: {}, mode: 'mem', db: null,
  init: function () {
    var self = this;
    return self.openIDB().then(function (db) {
      self.db = db; self.mode = 'idb';
      return Promise.all(self.KEYS.map(function (k) { return self.idbGet(k); }));
    }).catch(function () {
      self.mode = 'ls';
      return self.KEYS.map(function (k) { try { var v = localStorage.getItem('pharmaNinja:' + k); return v ? JSON.parse(v) : undefined; } catch (e) { self.mode = 'mem'; return undefined; } });
    }).then(function (vals) {
      var seeded = [];
      self.KEYS.forEach(function (k, i) { self.data[k] = vals[i]; });
      if (!self.data.domains) { self.data.domains = JSON.parse(JSON.stringify(SEED_DOMAINS)); seeded.push('domains'); }
      if (!self.data.questions) { self.data.questions = JSON.parse(JSON.stringify(SEED_QUESTIONS)); seeded.push('questions'); }
      if (!self.data.rounds) { self.data.rounds = []; seeded.push('rounds'); }
      if (!self.data.plays) { self.data.plays = []; seeded.push('plays'); }
      self.data.settings = Object.assign({}, DEFAULT_SETTINGS, self.data.settings || {});
      seeded.push('settings');
      seeded.forEach(function (k) { self.save(k); });
    });
  },
  openIDB: function () {
    return new Promise(function (res, rej) {
      if (!window.indexedDB) return rej(new Error('no idb'));
      var req = indexedDB.open('pharma-ninja', 1);
      req.onupgradeneeded = function () { req.result.createObjectStore('kv'); };
      req.onsuccess = function () { res(req.result); };
      req.onerror = function () { rej(req.error); };
      setTimeout(function () { rej(new Error('idb timeout')); }, 3000);
    });
  },
  idbGet: function (key) {
    var db = this.db;
    return new Promise(function (res, rej) {
      var r = db.transaction('kv', 'readonly').objectStore('kv').get(key);
      r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); };
    });
  },
  save: function (key) {
    var self = this, val = self.data[key];
    if (self.mode === 'idb') {
      try {
        var tx = self.db.transaction('kv', 'readwrite');
        tx.objectStore('kv').put(JSON.parse(JSON.stringify(val)), key);
        tx.onerror = function () { self.mode = 'ls'; self.save(key); };
      } catch (e) { self.mode = 'ls'; self.save(key); }
    } else if (self.mode === 'ls') {
      try { localStorage.setItem('pharmaNinja:' + key, JSON.stringify(val)); } catch (e) { self.mode = 'mem'; }
    }
  },
  get settings() { return this.data.settings; },
  enabledDomains: function () { return this.data.domains.filter(function (d) { return d.enabled; }); },
  questionsFor: function (domainId) { return this.data.questions.filter(function (q) { return q.enabled && q.domainId === domainId; }); },
  domain: function (id) { return this.data.domains.filter(function (d) { return d.id === id; })[0]; }
};

/* ---------------------------------------------------------------------
 * 4. SOUND
 * All audio is synthesised with the Web Audio API.
 * Buses: master → music / effects. Quiet mode zeroes the master at once.
 * Browsers only allow audio after a user gesture, so unlock() runs on the
 * first touch. (The M3 kiosk launch flags remove that restriction.)
 * ------------------------------------------------------------------- */
var Sound = {
  ctx: null, master: null, musicBus: null, fxBus: null, noise: null, timer: null,
  step: 0, nextTime: 0, bar: 0,
  unlock: function () {
    if (!this.ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      var c = this.ctx = new AC();
      this.master = c.createGain(); this.master.connect(c.destination);
      var comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.connect(this.master);
      this.musicBus = c.createGain(); this.musicBus.connect(comp);
      this.fxBus = c.createGain(); this.fxBus.connect(comp);
      this.delay = c.createDelay(1); this.delay.delayTime.value = 0.4;
      var fb = c.createGain(); fb.gain.value = 0.28; this.delay.connect(fb); fb.connect(this.delay);
      var dl = c.createGain(); dl.gain.value = 0.35; this.delay.connect(dl); dl.connect(this.musicBus);
      var len = c.sampleRate, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noise = buf;
      this.apply();
      this.startMusic();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  },
  apply: function () {
    if (!this.ctx) return;
    var s = Store.settings, t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(s.quiet ? 0 : 1, t, 0.015);
    this.musicBus.gain.setTargetAtTime(s.music ? s.musicVolume * 0.55 : 0, t, 0.05);
    this.fxBus.gain.setTargetAtTime(s.effects ? s.effectsVolume : 0, t, 0.02);
  },
  midi: function (m) { return 440 * Math.pow(2, (m - 69) / 12); },

  /* --- Music: 112 BPM, I–V–vi–IV in C, plucked arpeggio, soft bass, light drums. Scheduled ahead in small batches. --- */
  BPM: 112,
  CHORDS: [[48, [0, 4, 7]], [43, [0, 4, 7]], [45, [0, 3, 7]], [41, [0, 4, 7]]],
  startMusic: function () {
    var self = this;
    if (self.timer) return;
    self.nextTime = self.ctx.currentTime + 0.1; self.step = 0;
    self.timer = setInterval(function () { self.schedule(); }, 25);
  },
  schedule: function () {
    var c = this.ctx, s16 = 60 / this.BPM / 4;
    while (this.nextTime < c.currentTime + 0.12) {
      this.playStep(this.step, this.nextTime, s16);
      this.nextTime += s16; this.step = (this.step + 1) % 128;
    }
  },
  playStep: function (st, t, s16) {
    var barIdx = (st >> 4) % 4, inBar = st % 16, alt = (st >> 6) % 2;
    var ch = this.CHORDS[barIdx], root = ch[0], iv = ch[1];
    if (inBar === 0) this.pad(root + 12, iv, t, s16 * 16);
    if ([0, 3, 6, 8, 11, 14].indexOf(inBar) >= 0) this.tone('triangle', this.midi(root + 12), t, 0.2, 0.22, 700, this.musicBus);
    if (inBar % 2 === 0) {
      var pat = alt ? [0, 2, 1, 3, 2, 1, 2, 0] : [0, 1, 2, 3, 2, 1, 2, 1];
      var k = pat[(inBar / 2) | 0], m = root + 24 + (k === 3 ? 12 : iv[k]);
      this.tone('triangle', this.midi(m), t, 0.16, 0.07, 3000, this.musicBus, true);
    }
    if (inBar === 0 || inBar === 6 || inBar === 8) this.kick(t);
    if (inBar === 4 || inBar === 12) this.noiseHit(t, 'bandpass', 1800, 0.12, 0.07, this.musicBus);
    if (inBar % 4 === 2) this.noiseHit(t, 'highpass', 8000, 0.04, 0.05, this.musicBus);
  },
  tone: function (type, f, t, dur, gain, cutoff, bus, send) {
    var c = this.ctx, o = c.createOscillator(), g = c.createGain(), lp = c.createBiquadFilter();
    o.type = type; o.frequency.setValueAtTime(f, t); lp.type = 'lowpass'; lp.frequency.value = cutoff || 4000;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp); lp.connect(g); g.connect(bus || this.fxBus); if (send) g.connect(this.delay);
    o.start(t); o.stop(t + dur + 0.05);
    return o;
  },
  pad: function (base, iv, t, dur) {
    var c = this.ctx;
    for (var i = 0; i < 3; i++) {
      var o = c.createOscillator(), g = c.createGain(), lp = c.createBiquadFilter();
      o.type = 'sawtooth'; o.frequency.value = this.midi(base + iv[i]); o.detune.value = (i - 1) * 6;
      lp.type = 'lowpass'; lp.frequency.value = 900;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.018, t + 0.4); g.gain.setValueAtTime(0.018, t + dur - 0.3); g.gain.linearRampToValueAtTime(0.0001, t + dur);
      o.connect(lp); lp.connect(g); g.connect(this.musicBus); o.start(t); o.stop(t + dur + 0.05);
    }
  },
  kick: function (t) {
    var c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.12);
    g.gain.setValueAtTime(0.32, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g); g.connect(this.musicBus); o.start(t); o.stop(t + 0.25);
  },
  noiseHit: function (t, type, f, dur, gain, bus, sweepTo) {
    var c = this.ctx, src = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
    src.buffer = this.noise; fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = 1.2;
    if (sweepTo) fl.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(fl); fl.connect(g); g.connect(bus || this.fxBus); src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
  },

  /* --- Effects --- */
  play: function (name) {
    if (!this.ctx) return;
    var t = this.ctx.currentTime + 0.005, self = this;
    if (name === 'slice') self.noiseHit(t, 'bandpass', 1200, 0.14, 0.4, null, 5200);
    else if (name === 'correct') { self.tone('triangle', 1046.5, t, 0.12, 0.26); self.tone('triangle', 1568, t + 0.07, 0.22, 0.26); self.tone('sine', 3136, t + 0.07, 0.15, 0.06); }
    else if (name === 'wrong') {
      var o1 = self.tone('square', 311, t, 0.2, 0.12, 1200); o1.frequency.exponentialRampToValueAtTime(233, t + 0.18);
      var o2 = self.tone('square', 220, t + 0.2, 0.32, 0.12, 1000); o2.frequency.exponentialRampToValueAtTime(165, t + 0.5);
    }
    else if (name === 'streak') [1046.5, 1318.5, 1568, 2093].forEach(function (f, i) { self.tone('triangle', f, t + i * 0.06, 0.14, 0.2); });
    else if (name === 'end') {
      [783.99, 1046.5, 1318.5, 1568].forEach(function (f, i) { self.tone('triangle', f, t + i * 0.1, 0.18, 0.2); });
      [1046.5, 1318.5, 1568].forEach(function (f) { self.tone('triangle', f, t + 0.42, 0.8, 0.12); });
      var mb = self.musicBus.gain; mb.cancelScheduledValues(t); mb.setTargetAtTime(0.0001, t, 0.05);
      setTimeout(function () { self.apply(); }, 1600);
    }
  }
};

/* ---------------------------------------------------------------------
 * 5. LEADERBOARD
 * Built from the rounds history. "Today" = the Asia/Kolkata calendar date,
 * so the board resets itself at midnight IST. One row per display name
 * (case-insensitive), showing that name's best score today.
 * ------------------------------------------------------------------- */
var Leaderboard = {
  todayRounds: function () {
    var today = istDate(Date.now()), resetAt = Store.settings.leaderboardResetAt || 0;
    return Store.data.rounds.filter(function (r) { return r.date === today && r.ts > resetAt; });
  },
  bestPerName: function () {
    var best = {};
    this.todayRounds().forEach(function (r) {
      var k = r.displayName.toLowerCase(), b = best[k];
      if (!b || r.score > b.score || (r.score === b.score && r.ts < b.ts)) best[k] = r;
    });
    return Object.keys(best).map(function (k) { return best[k]; })
      .sort(function (a, b) { return b.score - a.score || a.ts - b.ts; });
  },
  top: function (n) { return this.bestPerName().slice(0, n || 10); },
  /* Rank a score against everyone else's best today (the player's own other rounds don't count against them) */
  rankOf: function (name, score) {
    var k = (name || '').toLowerCase();
    return 1 + this.bestPerName().filter(function (r) { return r.displayName.toLowerCase() !== k && r.score > score; }).length;
  },
  render: function (el, highlightName) {
    var rows = this.top(10), hk = (highlightName || '').toLowerCase();
    var h = '<div class="lb-head"><h2 class="display">Today’s top 10</h2><span>' + istLabel(Date.now()) + '</span></div><div class="lb-list">';
    if (!rows.length) h += '<div class="lb-empty">No scores yet today. Be the first name on the board.</div>';
    rows.forEach(function (r, i) {
      var d = Store.domain(r.domainId), me = hk && r.displayName.toLowerCase() === hk;
      h += '<div class="lb-row' + (i < 3 ? ' top' : '') + (me ? ' me' : '') + '"><div class="rk">' + (i + 1) + '</div>' +
        '<div class="nm"><b>' + esc(r.displayName) + (me ? ' (you)' : '') + '</b><i>' + esc(d ? d.name : '') + '</i></div><div class="sc">' + fmt(r.score) + '</div></div>';
    });
    h += '</div><div class="lb-foot">Resets at midnight IST</div>';
    el.innerHTML = h;
  }
};

/* ---------------------------------------------------------------------
 * 6. STAGE — the Phaser scene
 * Draws everything that moves. Rules live in Round; this scene only
 * spawns, moves, splits and decorates capsules, and runs the attract demo.
 * Units: game pixels. U = game px per design px (1080-px short edge).
 * ------------------------------------------------------------------- */
var Render = { k: 1 };   // game px per CSS px (device-pixel-ratio, capped)
var texSeq = 0;

function roundRectPath(ctx, x, y, w, h, r) {
  r = Math.min(r, h / 2, w / 2);
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r); ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r); ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r); ctx.closePath();
}
/* Draws one capsule (two-tone pharma capsule with the answer text) onto a canvas.
   state: 'normal' or 'wrong' (drained grey, used for the halves of a wrong slice) */
function drawCapsule(cw, ch, pad, U, accent, text, state) {
  var c = document.createElement('canvas'); c.width = Math.ceil(cw + pad * 2); c.height = Math.ceil(ch + pad * 2);
  var x = c.getContext('2d'), wrong = state === 'wrong';
  var bodyCol = wrong ? '#BDBDBD' : '#F5F3EF', capCol = wrong ? '#6B6B6B' : accent, ink = wrong ? '#3A3A3A' : '#1F1F1F';
  x.translate(pad, pad);
  x.save(); x.shadowColor = 'rgba(0,0,0,0.45)'; x.shadowBlur = 16 * U; x.shadowOffsetY = 10 * U;
  roundRectPath(x, cw * 0.185, ch * 0.05, cw * 0.815, ch * 0.9, ch * 0.45); x.fillStyle = bodyCol; x.fill();
  x.restore();
  // cap: rounded left end, nearly square right end — the cap sits slightly proud of the body
  var capW = cw * 0.29, r = ch / 2, cr = ch * 0.14;
  x.beginPath(); x.moveTo(r, 0); x.lineTo(capW - cr, 0); x.arcTo(capW, 0, capW, cr, cr); x.lineTo(capW, ch - cr); x.arcTo(capW, ch, capW - cr, ch, cr);
  x.lineTo(r, ch); x.arc(r, r, r, Math.PI / 2, Math.PI * 1.5); x.closePath();
  x.save(); x.shadowColor = 'rgba(0,0,0,0.3)'; x.shadowBlur = 8 * U; x.shadowOffsetX = 2 * U; x.fillStyle = capCol; x.fill(); x.restore();
  roundRectPath(x, cw * 0.046, ch * 0.13, cw * 0.9, ch * 0.12, ch * 0.06); x.fillStyle = 'rgba(255,255,255,0.4)'; x.fill();
  // answer text, fitted inside the body (one line, else two lines, else shrink)
  var left = cw * 0.315, right = cw * 0.94, areaW = right - left, cx = (left + right) / 2, fs = 32 * U;
  x.fillStyle = ink; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = '700 ' + fs + 'px "Barlow Condensed", "Arial Narrow", sans-serif';
  if (x.measureText(text).width <= areaW) { x.fillText(text, cx, ch / 2 + U); return c; }
  var words = text.split(' '), best = null;
  for (var i = 1; i < words.length; i++) {
    var a = words.slice(0, i).join(' '), b = words.slice(i).join(' '), w = Math.max(x.measureText(a).width, x.measureText(b).width);
    if (!best || w < best.w) best = { a: a, b: b, w: w };
  }
  if (best) {
    fs = 30 * U; x.font = '700 ' + fs + 'px "Barlow Condensed", "Arial Narrow", sans-serif';
    var w2 = Math.max(x.measureText(best.a).width, x.measureText(best.b).width);
    if (w2 > areaW) { fs *= areaW / w2; x.font = '700 ' + fs + 'px "Barlow Condensed", "Arial Narrow", sans-serif'; }
    x.fillText(best.a, cx, ch / 2 - fs * 0.52); x.fillText(best.b, cx, ch / 2 + fs * 0.55);
  } else {
    fs *= areaW / x.measureText(text).width; x.font = '700 ' + fs + 'px "Barlow Condensed", "Arial Narrow", sans-serif'; x.fillText(text, cx, ch / 2);
  }
  return c;
}

/* Closest points between segments P1Q1 (the swipe) and P2Q2 (the capsule axis) — Ericson, Real-Time Collision Detection */
function segSeg(p1x, p1y, q1x, q1y, p2x, p2y, q2x, q2y) {
  var d1x = q1x - p1x, d1y = q1y - p1y, d2x = q2x - p2x, d2y = q2y - p2y, rx = p1x - p2x, ry = p1y - p2y;
  var a = d1x * d1x + d1y * d1y, e = d2x * d2x + d2y * d2y, f = d2x * rx + d2y * ry, s, t, EPS = 1e-6;
  if (a <= EPS && e <= EPS) { s = t = 0; }
  else if (a <= EPS) { s = 0; t = clamp(f / e, 0, 1); }
  else {
    var c = d1x * rx + d1y * ry;
    if (e <= EPS) { t = 0; s = clamp(-c / a, 0, 1); }
    else {
      var b = d1x * d2x + d1y * d2y, den = a * e - b * b;
      s = den !== 0 ? clamp((b * f - c * e) / den, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); } else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
    }
  }
  var c1x = p1x + d1x * s, c1y = p1y + d1y * s, c2x = p2x + d2x * t, c2y = p2y + d2y * t;
  return { d2: (c1x - c2x) * (c1x - c2x) + (c1y - c2y) * (c1y - c2y), s: s, x: c1x, y: c1y };
}

var Stage = null;   // the live scene instance

class StageScene extends Phaser.Scene { constructor() { super({ key: 'stage' }); } }

StageScene.prototype.create = function () {
  Stage = this;
  this.capsules = []; this.pending = []; this.halves = []; this.parts = []; this.autoTrails = [];
  this.mode = 'attract'; this.paused = false; this.demoClock = 0;
  this.trailG = this.add.graphics().setDepth(50);
  this.makeParticleTextures();
  this.layout();
  Boot.stageReady();
};
StageScene.prototype.layout = function () {
  this.W = this.scale.width; this.H = this.scale.height; this.U = Math.min(this.W, this.H) / 1080;
  this.cw = 520 * this.U; this.ch = 100 * this.U; this.pad = 24 * this.U;
};
StageScene.prototype.makeParticleTextures = function () {
  var self = this;
  function star(key, col, size) {
    var c = document.createElement('canvas'); c.width = c.height = size; var x = c.getContext('2d'), h = size / 2, q = size * 0.1;
    x.fillStyle = col; x.beginPath(); x.moveTo(h, 0); x.lineTo(h + q, h - q); x.lineTo(size, h); x.lineTo(h + q, h + q); x.lineTo(h, size); x.lineTo(h - q, h + q); x.lineTo(0, h); x.lineTo(h - q, h - q); x.closePath(); x.fill();
    self.textures.addCanvas(key, c);
  }
  function dot(key, col, size) {
    var c = document.createElement('canvas'); c.width = c.height = size; var x = c.getContext('2d');
    x.fillStyle = col; x.beginPath(); x.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2); x.fill(); self.textures.addCanvas(key, c);
  }
  star('sparkO', '#F7943E', 64); star('sparkW', '#FFFFFF', 64); star('sparkS', '#FFD2A8', 64);
  dot('dotO', '#F7943E', 32); dot('dotW', '#FFFFFF', 32); dot('dotS', '#FFB070', 32);
  dot('dotG', '#9A9A9A', 32); dot('dotR', '#FF6B5E', 32); dot('dotT', '#BFE3F5', 32);
};

/* Mode: 'attract' runs the demo loop; 'play' is driven by Round; 'off' is quiet (name entry, picker, results) */
StageScene.prototype.pause = function () { if (!this.paused) { this.paused = true; this.pausedAt = this.time.now; } };
StageScene.prototype.resume = function () {
  if (!this.paused) return;
  var d = this.time.now - this.pausedAt; this.paused = false;
  this.pending.forEach(function (p) { p.at += d; });
};
StageScene.prototype.setMode = function (mode) {
  this.mode = mode; this.paused = false;
  this.clearAll();
};
StageScene.prototype.clearAll = function () {
  var self = this;
  this.pending = [];
  this.capsules.forEach(function (c) { self.fadeOut(c, 200); });
  this.capsules = [];
};
StageScene.prototype.destroyTex = function (img, key) {
  var tex = this.textures;
  img.destroy();
  if (tex.exists(key)) tex.remove(key);
};
StageScene.prototype.fadeOut = function (c, ms) {
  var self = this; c.alive = false;
  this.tweens.add({ targets: c.img, alpha: 0, scale: 0.85, duration: ms, onComplete: function () { self.destroyTex(c.img, c.key); } });
};

/* Create one falling capsule. opts: text, accent, x, y (centre), fallTime (s), tag (whatever Round needs back) */
StageScene.prototype.spawn = function (opts) {
  var key = 'cap' + (++texSeq), U = this.U;
  var canvas = drawCapsule(this.cw, this.ch, this.pad, U, opts.accent, opts.text, 'normal');
  this.textures.addCanvas(key, canvas);
  var img = this.add.image(opts.x, opts.y, key).setDepth(10).setAlpha(0).setScale(0.7);
  var base = rand(-0.08, 0.08);
  var c = { img: img, key: key, canvas: canvas, x: opts.x, y: opts.y, base: base, rot: base, phase: rand(0, 6.28),
    spawnY: opts.y, endY: this.H + this.ch, vy: (this.H + this.ch - opts.y) / opts.fallTime,
    born: this.time.now, alive: true, text: opts.text, accent: opts.accent, tag: opts.tag, demo: opts.demo };
  img.rotation = base;
  this.tweens.add({ targets: img, alpha: opts.alpha || 1, scale: 1, duration: 180, ease: 'Back.easeOut' });
  this.capsules.push(c);
  return c;
};

/* Queue a question's capsules: staggered releases into shuffled lanes so they never overlap */
StageScene.prototype.queueQuestion = function (options, accent, fallTime, spawnTopGame, startDelayMs) {
  var self = this, n = options.length, U = this.U;
  var y = spawnTopGame + this.ch / 2 + 4 * U;
  var speed = (this.H + this.ch - y) / fallTime;
  var gap = Math.max(fallTime * 0.16, (1.35 * this.ch) / speed) * 1000;
  var xmin = this.cw / 2 + 24 * U, xmax = this.W - this.cw / 2 - 24 * U;
  var lanes = [];
  for (var i = 0; i < n; i++) lanes.push(xmax <= xmin ? this.W / 2 : lerp(xmin, xmax, n === 1 ? 0.5 : i / (n - 1)));
  lanes = shuffle(lanes);
  var order = shuffle(options.map(function (o, i) { return i; }));
  var now = this.time.now;
  order.forEach(function (optIdx, k) {
    var x = clamp(lanes[k] + rand(-30, 30) * U, Math.min(xmin, self.W / 2), Math.max(xmax, self.W / 2));
    self.pending.push({ at: now + startDelayMs + k * gap, opts: { text: options[optIdx], accent: accent, x: x, y: y, fallTime: fallTime, tag: { optIdx: optIdx } } });
  });
};
StageScene.prototype.questionDone = function () { return this.pending.length === 0 && this.capsules.filter(function (c) { return c.alive && !c.demo; }).length === 0; };
StageScene.prototype.dismissOthers = function () {
  var self = this; this.pending = [];
  this.capsules.forEach(function (c) { if (c.alive) self.fadeOut(c, 260); });
  this.capsules = [];
};

/* Swipe-vs-capsule test for one segment of a trail. Returns the first capsule hit along the swipe. */
StageScene.prototype.hitTest = function (ax, ay, bx, by) {
  var best = null, r = this.ch / 2, half = this.cw / 2 - r;
  for (var i = 0; i < this.capsules.length; i++) {
    var c = this.capsules[i]; if (!c.alive || c.demo) continue;
    var cx = Math.cos(c.rot) * half, cy = Math.sin(c.rot) * half;
    var h = segSeg(ax, ay, bx, by, c.x - cx, c.y - cy, c.x + cx, c.y + cy);
    if (h.d2 <= r * r && (!best || h.s < best.s)) best = { cap: c, s: h.s, x: h.x, y: h.y };
  }
  if (best) { var dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1; best.dx = dx / l; best.dy = dy / l; }
  return best;
};
/* Fall progress 0..1 across the play zone (used for scoring) */
StageScene.prototype.progress = function (c) { return clamp((c.y - c.spawnY) / (this.H - c.spawnY), 0, 1); };

/* Split a capsule along the swipe into two halves that fly apart. kind: 'correct' | 'wrong' */
StageScene.prototype.split = function (c, hit, kind) {
  var self = this, U = this.U;
  c.alive = false;
  this.capsules = this.capsules.filter(function (o) { return o !== c; });
  var src = kind === 'wrong' ? drawCapsule(this.cw, this.ch, this.pad, U, c.accent, c.text, 'wrong') : c.canvas;
  var cos = Math.cos(-c.rot), sin = Math.sin(-c.rot);
  var lx = (hit.x - c.x) * cos - (hit.y - c.y) * sin + src.width / 2;
  var ly = (hit.x - c.x) * sin + (hit.y - c.y) * cos + src.height / 2;
  var dx = hit.dx * cos - hit.dy * sin, dy = hit.dx * sin + hit.dy * cos;
  if (Math.abs(dx) > 0.92) { dx = 0.35 * Math.sign(dx || 1); dy = Math.sqrt(1 - dx * dx) * (dy < 0 ? -1 : 1); }   // keep cuts across the capsule, not along it
  var nx = -dy, ny = dx, BIG = 5000;
  [1, -1].forEach(function (side) {
    var h = document.createElement('canvas'); h.width = src.width; h.height = src.height;
    var x = h.getContext('2d');
    x.beginPath(); x.moveTo(lx - dx * BIG, ly - dy * BIG); x.lineTo(lx + dx * BIG, ly + dy * BIG);
    x.lineTo(lx + dx * BIG + nx * side * BIG, ly + dy * BIG + ny * side * BIG); x.lineTo(lx - dx * BIG + nx * side * BIG, ly - dy * BIG + ny * side * BIG);
    x.closePath(); x.save(); x.clip(); x.drawImage(src, 0, 0);
    // cut edge: painted only onto the capsule's own pixels (source-atop), so it never spills into empty space
    x.globalCompositeOperation = 'source-atop';
    x.strokeStyle = kind === 'wrong' ? 'rgba(255,107,94,0.9)' : 'rgba(255,255,255,0.85)'; x.lineWidth = 4 * U;
    x.beginPath(); x.moveTo(lx - dx * BIG, ly - dy * BIG); x.lineTo(lx + dx * BIG, ly + dy * BIG); x.stroke(); x.restore();
    var key = 'half' + (++texSeq); self.textures.addCanvas(key, h);
    var img = self.add.image(c.x, c.y, key).setDepth(20); img.rotation = c.rot;
    var wnx = nx * Math.cos(c.rot) - ny * Math.sin(c.rot), wny = nx * Math.sin(c.rot) + ny * Math.cos(c.rot);
    var push = (kind === 'wrong' ? 180 : 300) * U;
    self.halves.push({ img: img, key: key, vx: wnx * side * push + hit.dx * 120 * U, vy: wny * side * push + c.vy * 0.4 - 160 * U,
      spin: side * rand(1.5, 3.2), life: 0, max: 1.0 });
  });
  this.destroyTex(c.img, c.key);
  this.burst(hit.x, hit.y, kind);
  if (kind === 'wrong' && !reducedMotion && this.mode === 'play') this.cameras.main.shake(240, 0.007);
};

/* Particle bursts: orange sparkles for correct, grey/red dots for wrong */
StageScene.prototype.burst = function (x, y, kind) {
  var U = this.U, n = kind === 'wrong' ? (reducedMotion ? 4 : 14) : (reducedMotion ? 8 : 30);
  var keys = kind === 'wrong' ? ['dotG', 'dotR', 'dotG', 'dotT'] : ['sparkO', 'sparkW', 'sparkS', 'dotO', 'dotW', 'dotS'];
  for (var i = 0; i < n; i++) {
    var key = keys[i % keys.length], spark = key.indexOf('spark') === 0;
    var a = rand(0, Math.PI * 2), sp = rand(kind === 'wrong' ? 120 : 260, kind === 'wrong' ? 420 : 900) * U;
    var img = this.add.image(x, y, key).setDepth(30);
    var sc = (spark ? rand(0.35, 0.9) : rand(0.3, 0.7)) * U;
    img.setScale(sc);
    this.parts.push({ img: img, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120 * U, life: 0, max: rand(0.45, 0.9), spin: spark ? rand(-6, 6) : 0, sc: sc });
  }
};
StageScene.prototype.popup = function (x, y, text, sub, color) {
  var U = this.U, self = this;
  var t = this.add.text(x, y, text, { fontFamily: '"Barlow Condensed", "Arial Narrow", sans-serif', fontStyle: 'italic 800', fontSize: Math.round(76 * U) + 'px',
    color: color || '#F7943E', stroke: '#1F1F1F', strokeThickness: Math.round(7 * U) }).setOrigin(0.5).setDepth(40);
  var targets = [t];
  if (sub) {
    var s = this.add.text(x, y + 52 * U, sub, { fontFamily: '"Barlow Condensed", "Arial Narrow", sans-serif', fontStyle: '700', fontSize: Math.round(26 * U) + 'px',
      color: '#D6D6D6', stroke: '#1F1F1F', strokeThickness: Math.round(5 * U) }).setOrigin(0.5).setDepth(40);
    targets.push(s);
  }
  this.tweens.add({ targets: targets, y: '-=' + (70 * U), alpha: 0, duration: 900, delay: 250, ease: 'Cubic.easeOut', onComplete: function () { targets.forEach(function (o) { o.destroy(); }); } });
  t.setScale(0.6); this.tweens.add({ targets: t, scale: 1, duration: 220, ease: 'Back.easeOut' });
};

/* Attract demo: capsules fall and get sliced automatically */
StageScene.prototype.demoTick = function (dt) {
  this.demoClock -= dt;
  var demoCount = this.capsules.filter(function (c) { return c.alive; }).length;
  if (this.demoClock <= 0 && demoCount < 6) {
    this.demoClock = rand(0.7, 1.1);
    var qs = Store.data.questions.filter(function (q) { return q.enabled; });
    if (!qs.length) return;
    var q = qs[(Math.random() * qs.length) | 0], d = Store.domain(q.domainId);
    var right = this.W > this.H ? this.W - 480 * this.U : this.W;
    var x = rand(this.cw / 2 + 30 * this.U, Math.max(this.cw / 2 + 31 * this.U, right - this.cw / 2 - 30 * this.U));
    var c = this.spawn({ text: q.options[(Math.random() * q.options.length) | 0], accent: d ? d.accent : '#F7943E', x: x, y: -this.ch, fallTime: 5.5, demo: true, alpha: 0.9 });
    c.vy = (this.H + this.ch * 2) / 5.5; c.spawnY = -this.ch;
    c.targetY = Math.random() < 0.85 ? rand(this.H * 0.4, this.H * 0.82) : Infinity;
  }
  var self = this;
  this.capsules.forEach(function (c) {
    if (c.alive && c.demo && c.y >= c.targetY && !c.autoCut) {
      c.autoCut = true;
      var a = rand(-1.1, -0.5), L = 260 * self.U, cx = Math.cos(a) * L, cy = Math.sin(a) * L;
      self.autoTrails.push({ id: 'auto' + (++texSeq), ax: c.x - cx, ay: c.y - cy, bx: c.x + cx, by: c.y + cy, t: 0, dur: 0.16, cap: c, cut: false });
    }
  });
};

StageScene.prototype.update = function (time, delta) {
  var dt = Math.min(delta, 50) / 1000, self = this, U = this.U;
  if (this.paused) { this.drawTrails(time); return; }
  // releases
  if (this.pending.length) {
    var due = this.pending.filter(function (p) { return p.at <= time; });
    if (due.length) { this.pending = this.pending.filter(function (p) { return p.at > time; }); due.forEach(function (p) { self.spawn(p.opts); }); }
  }
  // capsule motion
  var exited = false;
  this.capsules = this.capsules.filter(function (c) {
    if (!c.alive) return false;
    c.y += c.vy * dt;
    c.rot = reducedMotion ? c.base : c.base + Math.sin(time / 1000 * 1.3 + c.phase) * 0.04;
    c.img.x = c.x; c.img.y = c.y; c.img.rotation = c.rot;
    if (c.y - self.ch > self.H) { c.alive = false; self.destroyTex(c.img, c.key); if (!c.demo) exited = true; return false; }
    return true;
  });
  // halves and particles
  this.halves = this.halves.filter(function (h) {
    h.life += dt; h.vy += 1600 * U * dt; h.img.x += h.vx * dt; h.img.y += h.vy * dt; h.img.rotation += h.spin * dt;
    h.img.alpha = h.life > 0.6 ? Math.max(0, 1 - (h.life - 0.6) / 0.4) : 1;
    if (h.life >= h.max) { self.destroyTex(h.img, h.key); return false; } return true;
  });
  this.parts = this.parts.filter(function (p) {
    p.life += dt; p.vy += 700 * U * dt; p.vx *= 0.985; p.img.x += p.vx * dt; p.img.y += p.vy * dt; p.img.rotation += p.spin * dt;
    var k = p.life / p.max; p.img.alpha = 1 - k; p.img.setScale(p.sc * (1 - k * 0.5));
    if (p.life >= p.max) { p.img.destroy(); return false; } return true;
  });
  // auto trails (attract demo)
  this.autoTrails = this.autoTrails.filter(function (a) {
    a.t += dt; var k = Math.min(1, a.t / a.dur);
    Input.addPoint(a.id, lerp(a.ax, a.bx, k), lerp(a.ay, a.by, k), time);
    if (!a.cut && k >= 0.5 && a.cap.alive) { a.cut = true; self.split(a.cap, { x: a.cap.x, y: a.cap.y, dx: (a.bx - a.ax) / (520 * U), dy: (a.by - a.ay) / (520 * U) }, 'correct'); }
    if (k >= 1) { Input.endTrail(a.id); return false; } return true;
  });
  if (this.mode === 'attract') this.demoTick(dt);
  if (this.mode === 'play') { Round.tick(dt); if (exited && this.questionDone()) Round.onAllMissed(); }
  this.drawTrails(time);
};

/* Slice trail: tapered orange stroke with a soft glow and a white head; fades in ~150 ms */
StageScene.prototype.drawTrails = function (time) {
  var g = this.trailG, U = this.U, life = reducedMotion ? 90 : 160;
  g.clear();
  Input.trails.forEach(function (tr, id) {
    tr.pts = tr.pts.filter(function (p) { return time - p.t < life; });
    if (!tr.pts.length) { if (tr.ended) Input.trails.delete(id); return; }
    var pts = tr.pts, n = pts.length;
    for (var i = 1; i < n; i++) {
      var f = i / (n - 1 || 1), age = 1 - (time - pts[i].t) / life, w = (3 + 13 * f) * U * age;
      g.lineStyle(w * 2.4, 0xF7943E, 0.18 * age); g.lineBetween(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y);
      g.lineStyle(w, f > 0.75 ? 0xFFFFFF : 0xF7943E, 0.9 * age); g.lineBetween(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y);
      g.fillStyle(f > 0.75 ? 0xFFFFFF : 0xF7943E, 0.9 * age); g.fillCircle(pts[i].x, pts[i].y, w / 2);
    }
    var hd = pts[n - 1]; g.fillStyle(0xFFFFFF, 1); g.fillCircle(hd.x, hd.y, 7 * U);
  });
};

/* ---------------------------------------------------------------------
 * 7. INPUT
 * Pointer Events only, so touch, mouse and pen share one path; each
 * pointer id has its own trail, so multi-touch is tolerated. A move only
 * slices when it is faster than settings.minSwipeSpeed — taps never do.
 * Also hosts the hidden admin gesture (3-second press, top-left corner).
 * ------------------------------------------------------------------- */
var Input = {
  trails: new Map(), slicing: false, pressTimer: null, pressStart: null,
  toGame: function (ev) {
    var cv = Phaser && Boot.game && Boot.game.canvas; if (!cv) return null;
    var r = cv.getBoundingClientRect();
    return { x: (ev.clientX - r.left) * (Stage.W / r.width), y: (ev.clientY - r.top) * (Stage.H / r.height), t: Stage.time.now, cssScale: Stage.W / r.width };
  },
  addPoint: function (id, x, y, t) {
    var tr = this.trails.get(id); if (!tr) { tr = { pts: [], ended: false }; this.trails.set(id, tr); }
    tr.pts.push({ x: x, y: y, t: t, rt: performance.now() });
  },
  endTrail: function (id) { var tr = this.trails.get(id); if (tr) tr.ended = true; },
  attach: function () {
    var self = this;
    window.addEventListener('pointerdown', function (e) {
      Activity.ping(); Sound.unlock();
      self.adminPress(e);
      if (!self.slicing || !Stage) return;
      var p = self.toGame(e); if (!p) return;
      self.trails.set(e.pointerId, { pts: [{ x: p.x, y: p.y, t: p.t, rt: e.timeStamp }], ended: false, down: true });
    }, true);
    window.addEventListener('pointermove', function (e) {
      if (self.pressStart && Math.hypot(e.clientX - self.pressStart.x, e.clientY - self.pressStart.y) > 30) self.cancelPress();
      if (!self.slicing || !Stage) return;
      var tr = self.trails.get(e.pointerId); if (!tr || !tr.down) return;
      var list = (e.getCoalescedEvents && e.getCoalescedEvents().length) ? e.getCoalescedEvents() : [e];
      var minSpeed = Store.settings.minSwipeSpeed * (Math.min(window.innerWidth, window.innerHeight) / 1080);
      for (var i = 0; i < list.length; i++) {
        var p = self.toGame(list[i]); if (!p) continue;
        var prev = tr.pts[tr.pts.length - 1];
        var rt = list[i].timeStamp || e.timeStamp;
        tr.pts.push({ x: p.x, y: p.y, t: p.t, rt: rt });
        if (!prev) continue;
        var dtMs = Math.max(1, rt - prev.rt), distCss = Math.hypot(p.x - prev.x, p.y - prev.y) / p.cssScale;
        if (distCss / dtMs >= minSpeed) {
          var hit = Stage.hitTest(prev.x, prev.y, p.x, p.y);
          if (hit) Round.onSlice(hit);
        }
      }
    }, true);
    function up(e) { self.cancelPress(); var tr = self.trails.get(e.pointerId); if (tr) { tr.down = false; tr.ended = true; } }
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
    document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  },
  adminPress: function (e) {
    var zone = 12 * remPx();
    if (e.clientX <= zone && e.clientY <= zone && !Admin.isOpen) {
      this.pressStart = { x: e.clientX, y: e.clientY };
      this.pressTimer = setTimeout(function () { Input.pressStart = null; Admin.open(); }, 3000);
    }
  },
  cancelPress: function () { clearTimeout(this.pressTimer); this.pressTimer = null; this.pressStart = null; },
  inAdminZone: function (e) { var z = 12 * remPx(); return e.clientX <= z && e.clientY <= z; }
};

/* Idle tracking → attract mode */
var Activity = {
  last: Date.now(), n: 0,
  ping: function () { this.last = Date.now(); },
  start: function () {
    var self = this;
    setInterval(function () {
      if (Admin.isOpen) return;
      if (Screens.current === 'attract' && (++self.n % 30) === 0) Leaderboard.render($('lb-attract'));
      if (['name', 'picker', 'results'].indexOf(Screens.current) >= 0 && Date.now() - self.last > Store.settings.idleSeconds * 1000) Screens.toAttract();
    }, 1000);
  }
};

/* ---------------------------------------------------------------------
 * 8. ROUND — the game rules
 *   - One domain; questions in difficulty order 1→3, shuffled within a
 *     level, no repeats. The round ends when time runs out, lives reach
 *     zero, or the domain's questions run out.
 *   - The first capsule sliced ends the question, right or wrong.
 *   - Correct: max(20, 100 × (1 − fall progress)) × streak multiplier.
 *     Multiplier ×1.5 from the 4th correct in a row, ×2 from the 6th.
 *   - Wrong: −1 life, streak resets. All capsules missed: no penalty,
 *     streak resets, next question.
 * ------------------------------------------------------------------- */
var Round = {
  active: false,
  start: function (player, domainId) {
    var s = Store.settings, d = Store.domain(domainId), pool = Store.questionsFor(domainId);
    var order = [];
    [1, 2, 3].forEach(function (lv) { order = order.concat(shuffle(pool.filter(function (q) { return q.difficulty === lv; }))); });
    this.st = { id: uid(), player: player, domain: d, order: order, idx: 0, score: 0, lives: s.lives, streak: 0, longest: 0,
      timeLeft: s.roundSeconds, elapsed: 0, answers: [], cur: null, over: false };
    this.active = true;
    Screens.show('hud'); Hud.init(this.st);
    Stage.setMode('play'); Input.slicing = true;
    var self = this; setTimeout(function () { self.next(); }, 250);
  },
  next: function () {
    var st = this.st; if (!this.active || st.over) return;
    if (st.idx >= st.order.length) return this.end('cleared');
    var q = st.order[st.idx++];
    st.cur = { q: q, resolved: false, shownAt: Date.now() };
    Hud.question(st, q);
    var s = Store.settings, t = clamp(st.elapsed / s.roundSeconds, 0, 1);
    var fallTime = lerp(s.fallTimeStart, s.fallTimeEnd, t);
    var spawnTopCss = Math.max(window.innerHeight * s.playZoneTop, Hud.cardBottom() + 1.6 * remPx());
    Stage.queueQuestion(q.options, st.domain.accent, fallTime, spawnTopCss * (Stage.H / window.innerHeight), 450);
  },
  onSlice: function (hit) {
    var st = this.st; if (!this.active || !st || st.over || !st.cur || st.cur.resolved) return;
    var cur = st.cur, q = cur.q, c = hit.cap, correct = c.tag.optIdx === q.correctIndex;
    cur.resolved = true;
    var ms = Math.round(Stage.time.now - c.born), p = Stage.progress(c);
    Sound.play('slice');
    if (correct) {
      var mult = st.streak >= 5 ? 2 : st.streak >= 3 ? 1.5 : 1;
      var base = Math.max(MIN_POINTS, Math.round(BASE_POINTS * (1 - p))), pts = Math.round(base * mult);
      st.score += pts; st.streak++; st.longest = Math.max(st.longest, st.streak);
      Stage.split(c, hit, 'correct');
      Stage.popup(hit.x, hit.y - 40 * Stage.U, '+' + pts, mult > 1 ? base + ' × ' + mult + ' streak' : null);
      Sound.play('correct');
      if (st.streak === 3 || st.streak === 5) { Sound.play('streak'); }
      cur.result = 'correct';
    } else {
      st.lives--; st.streak = 0;
      Stage.split(c, hit, 'wrong');
      Stage.popup(hit.x, hit.y - 40 * Stage.U, '\u22121 life', null, '#FF6B5E');
      Sound.play('wrong'); Hud.sad(hit); Hud.flash();
      cur.result = 'wrong';
    }
    this.record(cur, c.tag.optIdx, ms);
    Hud.update(st);
    Stage.dismissOthers();
    var self = this;
    setTimeout(function () { if (st.lives <= 0) self.end('lives'); else self.next(); }, 650);
  },
  onAllMissed: function () {
    var st = this.st; if (!this.active || st.over || !st.cur || st.cur.resolved) return;
    st.cur.resolved = true; st.cur.result = 'missed'; st.streak = 0;
    this.record(st.cur, -1, null); Hud.update(st);
    var self = this; setTimeout(function () { self.next(); }, 250);
  },
  record: function (cur, chosenIdx, ms) {
    var st = this.st, q = cur.q;
    st.answers.push({ q: q, chosen: chosenIdx, result: cur.result, ms: ms });
    Store.data.plays.push({ ts: Date.now(), roundId: st.id, displayName: st.player.displayName, visitorId: st.player.visitorId || '',
      domainId: st.domain.id, questionId: q.id, result: cur.result, msToSlice: ms == null ? '' : ms });
  },
  tick: function (dt) {
    var st = this.st; if (!this.active || !st || st.over) return;
    st.timeLeft -= dt; st.elapsed += dt;
    if (st.timeLeft <= 0) { st.timeLeft = 0; Hud.time(st); return this.end('time'); }
    Hud.time(st);
  },
  end: function (reason) {
    var st = this.st; if (st.over) return;
    st.over = true; st.reason = reason; Input.slicing = false;
    // a question on screen when time ran out counts as missed
    if (st.cur && !st.cur.resolved) { st.cur.resolved = true; st.cur.result = 'missed'; this.record(st.cur, -1, null); }
    Stage.dismissOthers(); Sound.play('end'); Hud.banner(reason);
    var correct = st.answers.filter(function (a) { return a.result === 'correct'; }).length;
    var round = { roundId: st.id, ts: Date.now(), date: istDate(Date.now()), displayName: st.player.displayName, visitorId: st.player.visitorId || '',
      domainId: st.domain.id, score: st.score, questions: st.answers.length, correct: correct, longestStreak: st.longest, endReason: reason };
    Store.data.rounds.push(round); Store.save('rounds'); Store.save('plays');
    st.round = round; st.rank = Leaderboard.rankOf(round.displayName, round.score);
    var self = this;
    setTimeout(function () { self.active = false; Stage.setMode('off'); Screens.results(st); }, 1300);
  },
  abort: function () { if (this.active) { this.active = false; if (this.st) this.st.over = true; Input.slicing = false; } }
};

/* ---------------------------------------------------------------------
 * 9. SCREENS (DOM)
 * ------------------------------------------------------------------- */
var Screens = {
  current: null, player: null,
  show: function (name) {
    ['attract', 'name', 'picker', 'hud', 'results'].forEach(function (s) { $('s-' + s).classList.toggle('on', s === name); });
    this.current = name;
  },
  toAttract: function () {
    Round.abort(); this.player = null;
    Leaderboard.render($('lb-attract'));
    this.show('attract'); if (Stage) Stage.setMode('attract');
  },
  init: function () {
    var self = this;
    fillSvgSlots(document);
    // attract: touch anywhere starts (except the fullscreen button and the hidden admin corner)
    var downInCorner = false;
    $('s-attract').addEventListener('pointerdown', function (e) { downInCorner = Input.inAdminZone(e); });
    $('s-attract').addEventListener('click', function (e) {
      if (downInCorner || Admin.isOpen || e.target.closest('#fs-btn')) return;
      NameEntry.open();
    });
    $('fs-btn').addEventListener('click', function () {
      var d = document;
      if (d.fullscreenElement) d.exitFullscreen && d.exitFullscreen(); else d.documentElement.requestFullscreen && d.documentElement.requestFullscreen().catch(function () {});
    });
    $('name-back').addEventListener('click', function () { self.toAttract(); });
    $('pk-back').addEventListener('click', function () { NameEntry.open(self.player); });
    $('r-again').addEventListener('click', function () { Picker.open(self.player); });
    $('r-done').addEventListener('click', function () { self.toAttract(); });
    NameEntry.init();
  },
  results: function (st) {
    var acc = st.answers.length ? Math.round(100 * st.round.correct / st.answers.length) : 0;
    $('r-mascot').innerHTML = mascot(acc >= 50 ? 'cheer' : 'sad');
    $('r-hi').textContent = 'Round over, ' + st.player.displayName;
    $('r-head').textContent = acc >= 80 ? 'Sharp blade!' : acc >= 50 ? 'Clean cuts!' : 'Keep training!';
    $('r-score').textContent = fmt(st.score);
    $('r-rank').textContent = '#' + st.rank;
    $('r-acc').textContent = acc + '%';
    $('r-streak').textContent = st.longest;
    $('r-dom').textContent = st.domain.name; $('r-dom').style.color = st.domain.accent;
    $('r-count').textContent = st.answers.length + (st.answers.length === 1 ? ' question' : ' questions') + (st.reason === 'cleared' ? ', domain cleared' : '');
    var tick = '<svg viewBox="0 0 24 24" fill="none" stroke="#1F1F1F" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="5,12.5 10,17 19,7"/></svg>';
    var cross = '<svg viewBox="0 0 24 24" fill="none" stroke="#1F1F1F" stroke-width="3.5" stroke-linecap="round"><path d="M6 6 L18 18 M18 6 L6 18"/></svg>';
    var dash = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round"><path d="M6 12 H18"/></svg>';
    var h = '';
    if (!st.answers.length) h = '<div class="lb-empty">No questions were answered this round.</div>';
    st.answers.forEach(function (a) {
      var cls = a.result === 'correct' ? 'c' : a.result === 'wrong' ? 'w' : 'm';
      var you = a.chosen >= 0 ? a.q.options[a.chosen] : 'No slice';
      h += '<div class="rv ' + cls + '"><div class="ic" aria-label="' + a.result + '">' + (cls === 'c' ? tick : cls === 'w' ? cross : dash) + '</div><div class="body">' +
        '<div class="q">' + esc(a.q.questionText) + '</div><div class="chips"><span class="you">You: ' + esc(you) + '</span><span class="ans">Answer: ' + esc(a.q.options[a.q.correctIndex]) + '</span></div>' +
        '<div class="e">' + esc(a.q.explanation) + '</div></div></div>';
    });
    $('r-review').innerHTML = h; $('r-review').scrollTop = 0;
    Leaderboard.render($('lb-results'), st.player.displayName);
    Activity.ping();
    this.show('results');
  }
};

/* Name entry with the built-in keyboard (physical keyboard also works for laptop testing) */
var NameEntry = {
  name: '', vid: '', field: 'name', shift: true, vidLocked: false,
  ROWS: [['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'], ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', '-'], ['SHIFT', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', '.', 'DEL'], ['_', 'SPACE', 'GO']],
  init: function () {
    var self = this, kb = $('kb'), h = '';
    var params = new URLSearchParams(location.search), urlVid = params.get('visitorId') || params.get('vid');
    if (urlVid) { this.urlVid = urlVid.slice(0, VID_MAX); }
    this.ROWS.forEach(function (row) {
      h += '<div class="kb-row">';
      row.forEach(function (k) {
        if (k === 'GO') { h += '<button class="key go" id="name-go">Choose domain</button>'; return; }   // submit lives in the keyboard so it is always in reach
        var cls = k === 'SHIFT' || k === 'DEL' ? 'key wide' : k === 'SPACE' ? 'key space' : 'key';
        var label = k === 'SHIFT' ? 'Shift' : k === 'DEL' ? 'Delete' : k === 'SPACE' ? 'Space' : k;
        h += '<button class="' + cls + '" data-k="' + k + '"' + (k === 'SHIFT' ? ' id="k-shift"' : '') + '>' + label + '</button>';
      });
      h += '</div>';
    });
    kb.innerHTML = h;
    kb.addEventListener('pointerdown', function (e) {
      var b = e.target.closest('.key'); if (!b || b.id === 'name-go') return;
      e.preventDefault(); b.classList.add('down'); setTimeout(function () { b.classList.remove('down'); }, 120);
      self.key(b.getAttribute('data-k'));
    });
    $('f-name').addEventListener('click', function () { self.field = 'name'; self.paint(); });
    $('f-vid').addEventListener('click', function () { if (!self.vidLocked) { self.field = 'vid'; self.paint(); } });
    $('name-go').addEventListener('click', function () { self.submit(); });
    window.addEventListener('keydown', function (e) {
      if (Screens.current !== 'name' || Admin.isOpen) return;
      Activity.ping();
      if (e.key === 'Enter') return self.submit();
      if (e.key === 'Backspace') { e.preventDefault(); return self.key('DEL'); }
      if (e.key === ' ') { e.preventDefault(); return self.key('SPACE'); }
      if (e.key.length === 1) { self.shift = e.key !== e.key.toLowerCase(); self.type(e.key); }
    });
  },
  open: function (player) {
    this.name = player ? player.displayName : ''; this.field = 'name';
    this.vidLocked = !!this.urlVid; this.vid = this.urlVid || (player ? player.visitorId || '' : '');
    this.shift = !this.name; $('name-msg').textContent = '';
    Screens.show('name'); if (Stage) Stage.setMode('off'); Activity.ping(); this.paint();
  },
  key: function (k) {
    if (k === 'SHIFT') { this.shift = !this.shift; return this.paint(); }
    if (k === 'DEL') { if (this.field === 'name') this.name = this.name.slice(0, -1); else this.vid = this.vid.slice(0, -1); if (this.field === 'name' && !this.name) this.shift = true; return this.paint(); }
    if (k === 'SPACE') return this.type(' ');
    this.type(this.shift ? k.toUpperCase() : k.toLowerCase());
  },
  type: function (ch) {
    $('name-msg').textContent = '';
    if (this.field === 'name') {
      if (this.name.length >= NAME_MAX || (ch === ' ' && (!this.name || / $/.test(this.name)))) return;
      if (!/^[A-Za-z0-9 ._-]$/.test(ch)) return;
      this.name += ch;
      this.shift = ch === ' ';
    } else {
      if (this.vid.length >= VID_MAX || !/^[A-Za-z0-9_-]$/.test(ch)) return;
      this.vid += ch;
    }
    this.paint();
  },
  paint: function () {
    var caret = '<span class="caret"></span>';
    $('v-name').innerHTML = this.name ? esc(this.name) + (this.field === 'name' ? caret : '') : (this.field === 'name' ? caret : '') + '<span class="ph">Your name</span>';
    $('v-vid').innerHTML = this.vid ? esc(this.vid) + (this.field === 'vid' ? caret : '') : (this.field === 'vid' ? caret : '') + '<span class="ph">Badge or code</span>';
    $('f-name').classList.toggle('active', this.field === 'name'); $('f-vid').classList.toggle('active', this.field === 'vid');
    $('k-shift').classList.toggle('on', this.shift);
    $('name-go').disabled = this.name.trim().length < 2;
  },
  blocked: function (name) {
    var n = name.toLowerCase().replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a').replace(/5/g, 's').replace(/7/g, 't').replace(/\$/g, 's').replace(/@/g, 'a');
    var words = n.split(/[\s._-]+/), squashed = n.replace(/[\s._-]+/g, '');
    return BLOCKED_WORDS.concat(BLOCKED_PARTS).some(function (b) { return words.indexOf(b) >= 0; }) ||
      BLOCKED_PARTS.some(function (b) { return squashed.indexOf(b) >= 0; });
  },
  submit: function () {
    var n = this.name.trim();
    if (n.length < 2) { $('name-msg').textContent = 'Use at least 2 characters.'; return; }
    if (this.blocked(n)) { $('name-msg').textContent = 'That name can’t go on the leaderboard. Try another.'; return; }
    Screens.player = { displayName: n, visitorId: this.vid.trim() };
    Picker.open(Screens.player);
  }
};

/* Domain picker */
var Picker = {
  open: function (player) {
    if (!player) return Screens.toAttract();
    var s = Store.settings, tiles = '', ds = Store.enabledDomains();
    $('pk-me').innerHTML = '<div class="av">' + esc(player.displayName.slice(0, 2).toUpperCase()) + '</div>' + esc(player.displayName);
    $('pk-sub').innerHTML = 'One domain per round, <b>' + s.roundSeconds + ' seconds</b>, ' + s.lives + ' lives';
    ds.forEach(function (d) {
      var n = Store.questionsFor(d.id).length;
      tiles += '<button class="tile" data-d="' + esc(d.id) + '"' + (n ? '' : ' disabled') + '><div class="ring" style="box-shadow:inset 0 0 0 0.4rem ' + d.accent + ';color:' + d.accent + '">' + icon(d.icon) + '</div>' +
        '<h3>' + esc(d.name) + '</h3><p>' + esc(n ? d.desc : 'No questions yet') + '</p></button>';
    });
    $('tiles').innerHTML = tiles;
    $('tiles').onclick = function (e) {
      var b = e.target.closest('.tile'); if (!b || b.disabled) return;
      Round.start(player, b.getAttribute('data-d'));
    };
    Screens.show('picker'); if (Stage) Stage.setMode('off'); Activity.ping();
  }
};

/* Gameplay HUD (DOM layer over the canvas) */
var Hud = {
  init: function (st) {
    var d = st.domain;
    $('h-dom').innerHTML = icon(d.icon, d.accent) + '<span style="color:' + d.accent + '">' + esc(d.name) + '</span>';
    $('h-streak').className = 'streak'; $('h-count').className = 'countdown display';
    $('h-q').textContent = ''; $('h-qn').textContent = '';
    this.update(st); this.time(st);
  },
  question: function (st, q) {
    var card = $('h-card'), qt = $('h-q');
    $('h-qn').textContent = 'Question ' + st.idx;
    qt.textContent = q.questionText; qt.style.fontSize = '';
    // shrink long questions until the card clears the top of the play zone
    var limit = window.innerHeight * Store.settings.playZoneTop, size = 5.0;
    while (card.getBoundingClientRect().bottom > limit && size > 3.6) { size -= 0.2; qt.style.fontSize = size + 'rem'; }
    card.classList.remove('enter'); void card.offsetWidth; card.classList.add('enter');
  },
  cardBottom: function () { return $('h-card').getBoundingClientRect().bottom; },
  update: function (st) {
    var h = '';
    for (var i = 0; i < Store.settings.lives; i++) h += '<div class="life' + (i < st.lives ? '' : ' lost') + '"><i></i><b></b></div>';
    $('h-lives').innerHTML = h;
    $('h-score').textContent = fmt(st.score);
    $('h-rank').innerHTML = '<b>#' + Leaderboard.rankOf(st.player.displayName, st.score) + '</b> today';
    var sk = $('h-streak');
    if (st.streak >= 3) {
      var x2 = st.streak >= 5, was = sk.classList.contains('on');
      $('h-x').textContent = x2 ? '×2' : '×1.5'; $('h-n').textContent = st.streak + ' in a row';
      sk.style.top = (this.cardBottom() + 1.6 * remPx()) + 'px';
      sk.classList.toggle('x2', x2);
      if (!was || st.streak === 5) { sk.classList.remove('on'); void sk.offsetWidth; }
      sk.classList.add('on');
    } else sk.classList.remove('on', 'x2');
  },
  time: function (st) {
    var t = Math.ceil(st.timeLeft), m = Math.floor(t / 60), s = t % 60;
    $('h-time').textContent = m + ':' + (s < 10 ? '0' : '') + s;
    $('h-tbar').style.width = (100 * st.timeLeft / Store.settings.roundSeconds) + '%';
    $('h-timer').classList.toggle('low', st.timeLeft <= 10);
  },
  sad: function (hit) {
    var cv = Boot.game.canvas.getBoundingClientRect(), el = document.createElement('div');
    el.className = 'sad'; el.innerHTML = mascot('sad');
    var hx = cv.left + hit.x * cv.width / Stage.W, hy = cv.top + hit.y * cv.height / Stage.H, off = 12 * remPx();
    // sit beside the hit point (away from the "−1 life" pop-up), flipping sides near the right edge
    el.style.left = (hx + (hx + off * 1.6 > window.innerWidth ? -off : off)) + 'px'; el.style.top = (hy + 2 * remPx()) + 'px';
    $('h-fx').appendChild(el); setTimeout(function () { el.remove(); }, 1150);
  },
  flash: function () { if (reducedMotion) return; var f = $('h-flash'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go'); },
  banner: function (reason) {
    var b = $('h-count');
    b.textContent = reason === 'time' ? 'Time!' : reason === 'lives' ? 'Out of lives' : 'Domain cleared!';
    b.style.fontSize = reason === 'time' ? '' : '12rem';
    b.className = 'countdown display on';
  }
};

/* ---------------------------------------------------------------------
 * 10. ADMIN — Milestone 1 stub
 * Opened by pressing the top-left corner for 3 seconds. PIN, then sound
 * controls and quiet mode. The full admin (questions, CSV import/export,
 * settings, play zone, PIN change, exports) arrives in Milestone 2.
 * ------------------------------------------------------------------- */
var Admin = {
  isOpen: false, entry: '',
  open: function () {
    this.isOpen = true; this.entry = ''; this.wasPaused = false;
    if (Stage && Round.active) { Stage.pause(); this.wasPaused = true; }
    $('s-admin').classList.add('on'); this.pinView();
  },
  close: function () {
    this.isOpen = false; $('s-admin').classList.remove('on');
    if (Stage && this.wasPaused) Stage.resume();
    Activity.ping();
  },
  pinView: function () {
    var self = this, h = '<h2>Admin</h2><div class="pin" id="a-pin"></div><div class="err" id="a-err"></div><div class="pad">';
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'Cancel', '0', 'OK'].forEach(function (k) { h += '<button data-p="' + k + '">' + k + '</button>'; });
    $('adm').innerHTML = h + '</div>';
    $('adm').onclick = function (e) {
      var b = e.target.closest('[data-p]'); if (!b) return;
      var k = b.getAttribute('data-p');
      if (k === 'Cancel') return self.close();
      if (k === 'OK') { if (self.entry === String(Store.settings.pin)) return self.panel(); $('a-err').textContent = 'Wrong PIN.'; self.entry = ''; }
      else if (self.entry.length < 8) self.entry += k;
      $('a-pin').textContent = self.entry.replace(/./g, '\u2022');
    };
  },
  panel: function () {
    var self = this, s = Store.settings;
    function row(label, key) { return '<div class="row"><span>' + label + '</span><button data-t="' + key + '" class="' + (s[key] ? 'on' : '') + '">' + (s[key] ? 'On' : 'Off') + '</button></div>'; }
    $('adm').innerHTML = '<h2>Admin</h2>' + row('Quiet mode (mutes everything)', 'quiet') + row('Background music', 'music') + row('Sound effects', 'effects') +
      '<div class="note">Storage: ' + Store.mode + '. Rounds saved: ' + Store.data.rounds.length + '. The full admin (questions, CSV import and export, settings, play zone, PIN) arrives in Milestone 2.</div>' +
      '<button class="close" data-x="1">Back to game</button>';
    $('adm').onclick = function (e) {
      var t = e.target.closest('[data-t]');
      if (t) { var k = t.getAttribute('data-t'); s[k] = !s[k]; Store.save('settings'); Sound.apply(); return self.panel(); }
      if (e.target.closest('[data-x]')) self.close();
    };
  }
};

/* ---------------------------------------------------------------------
 * 11. BOOT & RECOVERY
 * Store → fonts → Phaser → attract mode. Any uncaught error sends the
 * game back to attract mode instead of leaving a broken screen.
 * ------------------------------------------------------------------- */
var Boot = {
  game: null,
  sizeFor: function () {
    var w = window.innerWidth, h = window.innerHeight, dpr = window.devicePixelRatio || 1;
    var k = Math.min(dpr, Store.settings.maxPixelRatio || 2), budget = 1920 * 1080 * 2.25;
    if (w * h * k * k > budget) k = Math.sqrt(budget / (w * h));
    Render.k = k;
    return { w: Math.round(w * k), h: Math.round(h * k) };
  },
  start: function () {
    var self = this;
    Store.init().then(function () {
      var fonts = ['500 20px Barlow', '600 20px Barlow', '700 20px "Barlow Condensed"', '800 20px "Barlow Condensed"', 'italic 800 20px "Barlow Condensed"'];
      return Promise.all(fonts.map(function (f) { return document.fonts ? document.fonts.load(f) : null; })).catch(function () {});
    }).then(function () {
      Screens.init(); Input.attach(); Activity.start();
      var sz = self.sizeFor();
      self.game = new Phaser.Game({
        type: Phaser.AUTO, parent: 'stage', width: sz.w, height: sz.h, backgroundColor: '#1F1F1F', banner: false,
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
        render: { antialias: true, powerPreference: 'high-performance' }, fps: { target: 60 },
        input: { keyboard: false, mouse: false, touch: false, gamepad: false }, disableContextMenu: true,
        scene: [StageScene]
      });
      var rt;
      window.addEventListener('resize', function () {
        clearTimeout(rt);
        rt = setTimeout(function () { var s = self.sizeFor(); self.game.scale.setGameSize(s.w, s.h); if (Stage) Stage.layout(); }, 150);
      });
    });
  },
  stageReady: function () { Screens.toAttract(); }
};

var lastRecover = 0;
function recover(err) {
  try { console.error('Recovering to attract mode:', err); } catch (e) {}
  if (Date.now() - lastRecover < 2000 || !Stage) return;
  lastRecover = Date.now();
  try { Admin.isOpen && Admin.close(); Screens.toAttract(); } catch (e) {}
}
window.addEventListener('error', function (e) { recover(e.error || e.message); });
window.addEventListener('unhandledrejection', function (e) { recover(e.reason); });

/* Exposed for debugging in the browser console only */
window.PharmaNinja = { Store: Store, Round: Round, Leaderboard: Leaderboard, get Stage() { return Stage; } };

Boot.start();
})();
