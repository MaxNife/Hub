/* Hub game kit — a home screen, settings, sound and music for Hub's games.
 *
 * Built on the app kit (settings sheet, storage): games load
 * `./app-kit.js` first, then `./game-kit.js`. Source of truth: appkit/;
 * run `python appkit/sync.py` after editing.
 *
 *   const kit = GameKit.create({
 *     id: 'memory', title: 'Memory', tagline: 'Match the pairs', art: '<svg…>',
 *     howTo: ['Flip two cards…', …],
 *     difficulties: [{ id: 'easy', label: 'Easy', detail: '6 pairs' }, …], defaultDifficulty: 'normal',
 *     options: [{ key: 'faces', label: 'Card faces', def: 'space', choices: [['space', 'Space'], …] }],
 *     stats: (kit) => [{ label: 'Best time', value: '1:02' }],
 *     saved: () => null | { label: '6 of 8 pairs · 1:23' },
 *     onNew: (settings) => …, onContinue: () => …, onPause: () => …,
 *   });
 *   kit.sfx('match'); kit.played(); kit.showHome(); kit.menuButton();
 *
 * Deep links: #continue resumes a saved game, #new starts one straight away.
 */
(function () {
  'use strict';

  var el = AppKit.el, load = AppKit.load, store = AppKit.save;
  var ago = AppKit.ago;

  // ─── audio: synthesised, nothing to download ──────────────────────────
  function Audio(getSettings) {
    var ctx = null, master = null, musicGain = null, musicTimer = null, pad = null;
    function ensure() {
      if (ctx) return ctx;
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0;
      musicGain.connect(master);
      volume();
      return ctx;
    }
    function volume() { if (master) master.gain.value = (getSettings().volume || 0) / 100; }
    function tone(freq, start, dur, type, gain, dest, glideTo) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, start);
      if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, start + dur);
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(gain || 0.3, start + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      o.connect(g);
      g.connect(dest || master);
      o.start(start);
      o.stop(start + dur + 0.02);
    }
    var SFX = {
      tap: function (t) { tone(660, t, 0.07, 'sine', 0.22); },
      flip: function (t) { tone(420, t, 0.07, 'triangle', 0.2, null, 560); },
      move: function (t) { tone(300, t, 0.05, 'triangle', 0.18, null, 360); },
      match: function (t) { tone(660, t, 0.12, 'sine', 0.25); tone(990, t + 0.09, 0.18, 'sine', 0.22); },
      miss: function (t) { tone(240, t, 0.16, 'triangle', 0.18, null, 180); },
      bad: function (t) { tone(160, t, 0.22, 'sawtooth', 0.12, null, 110); },
      go: function (t) { tone(880, t, 0.14, 'square', 0.12); },
      win: function (t) { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, t + i * 0.11, 0.3, 'triangle', 0.24); }); },
    };
    // A soft pentatonic loop over a quiet pad.
    var SCALE = [261.6, 293.7, 329.6, 392.0, 440.0, 523.3, 587.3, 659.3];
    function startMusic() {
      if (!ensure() || musicTimer) return;
      musicGain.gain.cancelScheduledValues(ctx.currentTime);
      musicGain.gain.setTargetAtTime(0.35, ctx.currentTime, 0.8);
      pad = [130.8, 196.0].map(function (f) {
        var o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
        o.type = 'sawtooth'; o.frequency.value = f; lp.type = 'lowpass'; lp.frequency.value = 420; g.gain.value = 0.035;
        o.connect(lp); lp.connect(g); g.connect(musicGain); o.start();
        return o;
      });
      var step = 0;
      musicTimer = setInterval(function () {
        if (!ctx || document.hidden) return;
        var t = ctx.currentTime + 0.02;
        if (step % 2 === 0 || Math.random() < 0.35) {
          var f = SCALE[Math.floor(Math.random() * SCALE.length)] * (Math.random() < 0.2 ? 2 : 1);
          tone(f, t, 0.9, 'sine', 0.09, musicGain);
        }
        step++;
      }, 380);
    }
    function stopMusic() {
      if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
      if (pad) { pad.forEach(function (o) { try { o.stop(); } catch (e) { /* already stopped */ } }); pad = null; }
      if (musicGain && ctx) musicGain.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
    }
    return {
      unlock: function () { if (ensure() && ctx.state === 'suspended') ctx.resume(); },
      sfx: function (name) {
        var s = getSettings();
        if (!s.sound || !SFX[name] || !ensure()) return;
        if (ctx.state === 'suspended') ctx.resume();
        SFX[name](ctx.currentTime + 0.005);
      },
      music: function (on) { on && getSettings().music ? startMusic() : stopMusic(); },
      volume: volume,
    };
  }

  // ─── the kit ──────────────────────────────────────────────────────────
  function create(cfg) {
    var MKEY = cfg.id + ':meta';
    var app = AppKit.create({
      id: cfg.id,
      title: cfg.title,
      defaults: { difficulty: cfg.defaultDifficulty || (cfg.difficulties && cfg.difficulties[0].id) },
      fields: [
        { type: 'heading', label: 'Sound' },
        { key: 'sound', label: 'Sound effects', type: 'toggle', def: true },
        { key: 'music', label: 'Music', type: 'toggle', def: false },
        { key: 'volume', label: 'Volume', type: 'range', def: 70, min: 0, max: 100 },
      ].concat(cfg.options && cfg.options.length ? [{ type: 'heading', label: 'Game' }] : [], (cfg.options || []).map(function (o) {
        return { key: o.key, label: o.label, type: 'choice', def: o.def, choices: o.choices };
      }), [
        { type: 'heading', label: 'Progress' },
        { type: 'action', label: 'Stats and best scores', button: 'Reset stats', danger: true, run: function (k, close) {
          if (!window.confirm('Reset your ' + cfg.title + ' stats and best scores?')) return;
          if (cfg.onResetStats) cfg.onResetStats();
          store(MKEY, { played: 0, lastPlayed: 0 });
          close(); render();
        } },
      ]),
      onChange: function (key) {
        if (key === 'difficulty') return;
        if (key === 'volume') audio.volume();
        else if (key === 'music') audio.music(true);
        if (key !== 'volume') audio.sfx('tap');
      },
    });
    var settings = app.settings;
    var audio = Audio(function () { return settings; });
    var home = null, playing = false;

    function save() { app.set('difficulty', settings.difficulty); }
    function meta() { return load(MKEY, { played: 0, lastPlayed: 0 }); }

    function button(label, cls, onclick, extra) {
      return el('button', Object.assign({ type: 'button', class: cls, onclick: function (e) { audio.unlock(); onclick(e); } }, extra || {}), [label]);
    }

    function render() {
      var m = meta();
      var saved = cfg.saved ? cfg.saved() : null;
      var diff = (cfg.difficulties || []).map(function (d) {
        return el('button', { type: 'button', 'aria-pressed': String(settings.difficulty === d.id), onclick: function () {
          settings.difficulty = d.id; save(); audio.sfx('tap'); render();
        } }, [el('b', {}, [d.label]), d.detail ? el('small', {}, [d.detail]) : null]);
      });
      var stats = cfg.stats ? cfg.stats(api) : [];
      home.replaceChildren(el('div', { class: 'gk-inner' }, [
        el('div', { class: 'gk-hero' }, [
          el('div', { class: 'gk-art', html: cfg.art || '' }),
          el('div', {}, [
            el('p', { class: 'gk-hello' }, [m.lastPlayed ? 'Welcome back · last played ' + ago(m.lastPlayed) : 'Ready when you are']),
            el('h1', {}, [cfg.title]),
            el('p', { class: 'gk-tag' }, [cfg.tagline || '']),
          ]),
        ]),
        el('div', { class: 'gk-play' }, [
          saved ? button('Continue', 'gk-primary', continueGame, { 'data-detail': saved.label }) : null,
          saved ? el('p', { class: 'gk-saved' }, [saved.label]) : null,
          diff.length ? el('div', { class: 'gk-diff', role: 'group', 'aria-label': 'Difficulty' }, diff) : null,
          button(saved ? 'New game' : 'Play', saved ? 'gk-secondary' : 'gk-primary', newGame),
        ]),
        stats.length ? el('div', { class: 'gk-stats' }, stats.map(function (s) {
          return el('div', { class: 'gk-stat' }, [el('b', {}, [String(s.value)]), el('small', {}, [s.label])]);
        })) : null,
        el('div', { class: 'gk-foot' }, [
          button('Settings', 'gk-link', openSettings),
          cfg.howTo ? button('How to play', 'gk-link', openHowTo) : null,
        ]),
      ]));
    }

    function showHome() {
      if (!home) {
        home = el('section', { class: 'gk-home', 'aria-label': cfg.title + ' home' });
        document.body.append(home);
      }
      if (playing && cfg.onPause) cfg.onPause();
      playing = false;
      render();
      home.hidden = false;
      document.body.classList.add('gk-at-home');
      audio.music(true);
      var first = home.querySelector('.gk-primary');
      if (first) first.focus({ preventScroll: true });
    }
    function showGame() {
      if (home) home.hidden = true;
      document.body.classList.remove('gk-at-home');
      playing = true;
      audio.music(true);
    }
    function newGame() {
      audio.sfx('tap');
      var m = meta();
      store(MKEY, { played: m.played, lastPlayed: Date.now() });
      showGame();
      cfg.onNew(settings);
    }
    function continueGame() {
      audio.sfx('tap');
      showGame();
      cfg.onContinue(settings);
    }

    function openSettings() { audio.unlock(); app.openSettings(); }
    function openHowTo() {
      AppKit.modal('How to play', el('ol', { class: 'gk-how' }, cfg.howTo.map(function (s) { return el('li', {}, [s]); })));
    }

    // Menu button for the game's own top bar: pause and go home.
    function menuButton() {
      return el('button', { type: 'button', class: 'gk-menu', 'aria-label': 'Menu', title: 'Menu (Esc)', onclick: function () { audio.sfx('tap'); showHome(); },
        html: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h10"/></svg><span>Menu</span>' });
    }
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && playing && !document.querySelector('.ak-modal-back')) showHome();
    });
    document.addEventListener('visibilitychange', function () { if (document.hidden && playing && cfg.onPause) cfg.onPause(); });

    var api = {
      settings: settings,
      sfx: function (n) { audio.sfx(n); },
      showHome: showHome,
      showGame: showGame,
      newGame: newGame,
      menuButton: menuButton,
      played: function () { var m = meta(); store(MKEY, { played: m.played + 1, lastPlayed: Date.now() }); },
      get playing() { return playing; },
    };

    // First screen: honour deep links from Hub (also when already open).
    function route(first) {
      var hash = location.hash;
      if (hash) history.replaceState(null, '', location.pathname + location.search);
      if (hash === '#continue' && cfg.saved && cfg.saved()) continueGame();
      else if (hash === '#new') newGame();
      else if (first) showHome();
    }
    window.addEventListener('hashchange', function () { route(false); });
    setTimeout(function () { route(true); });
    return api;
  }

  window.GameKit = { create: create };
})();
