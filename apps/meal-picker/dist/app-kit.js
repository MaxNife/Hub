/* Hub app kit: what every app needs to feel like a standalone app — its own
 * home header with a greeting, a Settings sheet, and namespaced storage.
 * (Widgets on Hub's Home only get settings; apps and games get a home
 * screen and settings, as they would if they were installed on their own.)
 *
 * Source of truth: appkit/app-kit.js. Apps load a copy from their own
 * folder (`./app-kit.js`); run `python appkit/sync.py` after editing.
 *
 *   const kit = AppKit.create({
 *     id: 'converter', title: 'Converter',
 *     fields: [                                  // the Settings sheet (or a function returning them)
 *       { type: 'heading', label: 'Defaults' },
 *       { key: 'decimals', label: 'Decimal places', type: 'choice', def: '4', choices: [['2', '2'], ['4', '4']] },
 *       { key: 'lang', label: 'Language', type: 'select', def: 'en', choices: [['en', 'English'], …] },
 *       { key: 'haptics', label: 'Vibrate', type: 'toggle', def: true, hint: 'On phones' },
 *       { key: 'volume', label: 'Volume', type: 'range', def: 70, min: 0, max: 100 },
 *       { key: 'name', label: 'Your name', type: 'text', def: '' },
 *       { type: 'custom', render: (kit) => element },
 *       { type: 'action', label: 'Clear history', danger: true, run: (kit, close) => … },
 *     ],
 *     onChange: (key, value, settings) => …,
 *     settingsKey: 'football:app',               // optional; default '<id>:settings'
 *   });
 *   kit.header({ tagline: 'Units and currencies' })  // greeting, title, Settings button
 *   kit.settings.decimals; kit.set('decimals', '2'); kit.store.get('history', []);
 */
(function () {
  'use strict';

  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    });
    [].concat(kids == null ? [] : kids).forEach(function (c) {
      if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(c));
    });
    return e;
  }
  function load(key, def) { try { var v = JSON.parse(localStorage.getItem(key) || 'null'); return v == null ? def : v; } catch (e) { return def; } }
  function save(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* storage blocked */ } }
  function drop(key) { try { localStorage.removeItem(key); } catch (e) { /* storage blocked */ } }
  function ago(ts) {
    var s = (Date.now() - ts) / 1000;
    if (s < 90) return 'just now';
    if (s < 3600) return Math.round(s / 60) + ' min ago';
    if (s < 86400) return Math.round(s / 3600) + ' hr ago';
    var d = Math.round(s / 86400);
    return d === 1 ? 'yesterday' : d + ' days ago';
  }
  function partOfDay() {
    var h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  }
  var GEAR = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>';

  function create(cfg) {
    var id = cfg.id;
    var fieldList = function () { return typeof cfg.fields === 'function' ? cfg.fields() : (cfg.fields || []); };
    var defaults = {};
    fieldList().forEach(function (f) { if (f.key) defaults[f.key] = f.def; });
    Object.assign(defaults, cfg.defaults || {});
    var SKEY = cfg.settingsKey || id + ':settings';  // an app whose widget already uses <id>:settings picks another
    var settings = Object.assign({}, defaults, load(SKEY, {}));

    // Visits: the greeting says "welcome back" and when you were last here.
    var visits = load(id + ':visits', { count: 0, last: 0 });
    var lastVisit = visits.last;
    save(id + ':visits', { count: visits.count + 1, last: Date.now() });

    var toastEl = null, toastTimer = 0;
    var kit = {
      el: el,
      ago: ago,
      settings: settings,
      lastVisit: lastVisit,
      visits: visits.count,
      store: {
        get: function (k, def) { return load(id + ':' + k, def); },
        set: function (k, v) { save(id + ':' + k, v); },
        remove: function (k) { drop(id + ':' + k); },
      },
      set: function (key, value) {
        settings[key] = value;
        save(SKEY, settings);
        if (cfg.onChange) cfg.onChange(key, value, settings);
      },
      greeting: function () {
        if (!lastVisit) return partOfDay();
        return partOfDay() + ' · welcome back';
      },
      header: function (opts) {
        opts = opts || {};
        return el('header', { class: 'ak-head' }, [
          el('div', { class: 'ak-head-text' }, [
            el('p', { class: 'ak-hello' }, [opts.hello || kit.greeting()]),
            el('h1', {}, [opts.title || cfg.title]),
            opts.tagline ? el('p', { class: 'ak-tag' }, [opts.tagline]) : null,
          ]),
          el('div', { class: 'ak-head-actions' }, (opts.actions || []).concat([kit.settingsButton()])),
        ]);
      },
      settingsButton: function () {
        return el('button', { type: 'button', class: 'ak-icon-btn', 'aria-label': 'Settings', title: 'Settings', html: GEAR, onclick: function () { kit.openSettings(); } });
      },
      modal: modal,
      toast: function (msg) {
        if (!toastEl) { toastEl = el('div', { class: 'ak-toast', role: 'status' }); document.body.append(toastEl); }
        toastEl.textContent = msg;
        toastEl.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 1800);
      },
      openSettings: function () {
        var close;
        var body = el('div', { class: 'ak-settings' }, fieldList().map(function (f) { return field(f, function () { return close; }); }));
        close = modal(cfg.settingsTitle || 'Settings', body, cfg.settingsNote ? [el('p', { class: 'ak-note' }, [cfg.settingsNote])] : []);
      },
    };

    function field(f, getClose) {
      if (f.type === 'heading') return el('h3', { class: 'ak-heading' }, [f.label]);
      if (f.type === 'note') return el('p', { class: 'ak-note' }, [f.text]);
      if (f.type === 'custom') return f.render(kit);
      if (f.type === 'action') {
        return el('div', { class: 'ak-field' }, [
          el('span', {}, [f.label, f.hint ? el('small', {}, [f.hint]) : null]),
          el('button', { type: 'button', class: 'ak-pill' + (f.danger ? ' danger' : ''), onclick: function () { f.run(kit, getClose()); } }, [f.button || f.label]),
        ]);
      }
      var label = el('span', {}, [f.label, f.hint ? el('small', {}, [f.hint]) : null]);
      if (f.type === 'toggle') {
        var box = el('input', { type: 'checkbox', role: 'switch' });
        box.checked = !!settings[f.key];
        box.addEventListener('change', function () { kit.set(f.key, box.checked); });
        return el('label', { class: 'ak-field ak-toggle' }, [label, box]);
      }
      if (f.type === 'choice') {
        return el('div', { class: 'ak-field' }, [label, el('div', { class: 'ak-seg', role: 'group', 'aria-label': f.label }, f.choices.map(function (c) {
          return el('button', { type: 'button', 'aria-pressed': String(String(settings[f.key]) === String(c[0])), onclick: function (e) {
            kit.set(f.key, c[0]);
            e.currentTarget.parentNode.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String(b === e.currentTarget)); });
          } }, [c[1]]);
        }))]);
      }
      if (f.type === 'select') {
        var sel = el('select', { 'aria-label': f.label }, f.choices.map(function (c) {
          return el('option', { value: c[0], selected: String(settings[f.key]) === String(c[0]) }, [c[1]]);
        }));
        sel.addEventListener('change', function () { kit.set(f.key, sel.value); });
        return el('label', { class: 'ak-field' }, [label, sel]);
      }
      if (f.type === 'range') {
        var out = el('small', { class: 'ak-range-out' }, [settings[f.key] + (f.unit || '')]);
        var r = el('input', { type: 'range', min: f.min, max: f.max, step: f.step || 1, value: settings[f.key], 'aria-label': f.label });
        r.addEventListener('input', function () { out.textContent = r.value + (f.unit || ''); kit.set(f.key, +r.value); });
        return el('label', { class: 'ak-field' }, [label, el('span', { class: 'ak-range' }, [r, out])]);
      }
      var input = el('input', { type: f.type === 'number' ? 'number' : 'text', value: settings[f.key] == null ? '' : settings[f.key], placeholder: f.placeholder || '', 'aria-label': f.label });
      input.addEventListener('change', function () { kit.set(f.key, f.type === 'number' ? +input.value : input.value.trim()); });
      return el('label', { class: 'ak-field' }, [label, input]);
    }

    return kit;
  }

  // A dialog sheet: Escape, the backdrop or Done close it. Returns close().
  function modal(title, body, actions) {
    var opener = document.activeElement;
    var back = el('div', { class: 'ak-modal-back', onclick: function (e) { if (e.target === back) close(); } });
    function close() {
      back.remove();
      document.removeEventListener('keydown', esc, true);
      if (opener && opener.focus) opener.focus({ preventScroll: true });
    }
    function esc(e) { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(); } }
    document.addEventListener('keydown', esc, true);
    back.append(el('div', { class: 'ak-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, [
      el('h2', {}, [title]), body,
      el('div', { class: 'ak-row' }, (actions || []).concat([el('button', { type: 'button', class: 'ak-primary', onclick: close }, ['Done'])])),
    ]));
    document.body.append(back);
    var f = back.querySelector('.ak-modal button, .ak-modal input, .ak-modal select, .ak-modal textarea');
    if (f) f.focus({ preventScroll: true });
    return close;
  }

  window.AppKit = { create: create, el: el, modal: modal, ago: ago, load: load, save: save };
})();
