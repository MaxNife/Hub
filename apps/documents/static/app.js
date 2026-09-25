// Documents — tool grid, per-tool flows, page organizer and PDF editor.
// Plain JS, relative URLs only (works under /apps/documents/ inside Hub).
(function () {
  'use strict';

  // ─── tiny helpers ─────────────────────────────────────────────────────
  const $ = (sel, el) => (el || document).querySelector(sel);
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === false || v == null) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(kid));
    return el;
  }
  const size = (n) => n >= 1e6 ? (n / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1e3)) + ' KB';
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

  // ─── icons (24px line icons) ─────────────────────────────────────────
  const P = {
    merge: 'M7 4v6a4 4 0 0 0 4 4h2a4 4 0 0 1 4 4v2M17 4v6a4 4 0 0 1-4 4M4 7l3-3 3 3M14 7l3-3 3 3',
    split: 'M12 3v18M5 8l-3 4 3 4M19 8l3 4-3 4',
    remove: 'M6 4h9l4 4v12H6zM9 14h7',
    organize: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
    rotate: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
    compress: 'M8 3v5H3M16 3v5h5M8 21v-5H3M16 21v-5h5',
    office: 'M5 3h10l4 4v14H5zM8 12l2 6 2-4 2 4 2-6',
    image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9h.01',
    word: 'M5 3h10l4 4v14H5zM9 11l1.5 6L12 13l1.5 4L15 11',
    text: 'M5 6h14M12 6v13M8 19h8',
    edit: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4',
    sign: 'M3 17c3 0 4-6 6-6s1 6 4 6 3-3 5-3 3 2 3 2M3 21h18',
    numbers: 'M5 4h14v16H5zM9 16h1.5M13.5 16H15M11.2 16h1.6',
    watermark: 'M12 3l6 7a6 6 0 1 1-12 0z',
    lock: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3',
    unlock: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 7.5-2',
    back: 'm15 5-7 7 7 7', up: 'm6 15 6-6 6 6', down: 'm6 9 6 6 6-6', x: 'M6 6l12 12M18 6 6 18', turn: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
    select: 'M5 3l14 8-6 2-2 6z', whiteout: 'M4 6h16v12H4z', highlight: 'M9 11l-4 8h5l7-7-4-4zM13 5l4 4 3-3-4-4z',
    draw: 'M4 18c4-9 7 4 10-3s4-7 6-4', search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4', redact: 'M3 8h18v8H3z', undo: 'M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  };
  const icon = (name, fill) => `<svg viewBox="0 0 24 24" fill="${fill ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${P[name]}"/></svg>`;

  // ─── the tools ────────────────────────────────────────────────────────
  const PDF = '.pdf,application/pdf';
  const OFFICE = '.doc,.docx,.odt,.rtf,.txt,.ppt,.pptx,.odp,.xls,.xlsx,.ods,.csv,.html,.htm';
  const IMAGES = 'image/*,.png,.jpg,.jpeg,.gif,.bmp,.tif,.tiff,.webp';
  const pagesOpt = (label, def, hint) => ({ key: 'pages', type: 'text', label, def, hint: hint || 'Like 1-3, 5, 8- · leave as “all” for every page' });
  const TOOLS = [
    { id: 'merge', group: 'Organize', name: 'Merge PDF', blurb: 'Combine PDFs and images into one file, in the order you want.', icon: 'merge', color: '#7c5cff', accept: PDF + ',' + IMAGES, multi: true, min: 2, action: 'Merge' },
    { id: 'split', group: 'Organize', name: 'Split PDF', blurb: 'Pull out page ranges, or split into separate files.', icon: 'split', color: '#7c5cff', accept: PDF, action: 'Split',
      opts: [{ key: 'mode', type: 'choice', label: 'How', def: 'ranges', choices: [['ranges', 'By ranges'], ['every', 'Every N pages'], ['extract', 'Extract pages']] },
        { key: 'ranges', type: 'text', label: 'Ranges', def: '1-2, 3-', hint: 'Each range becomes its own PDF', when: (o) => o.mode === 'ranges' },
        { key: 'every', type: 'number', label: 'Pages per file', def: 1, when: (o) => o.mode === 'every' },
        { key: 'pages', type: 'text', label: 'Pages to extract', def: '1', hint: 'They go into one new PDF', when: (o) => o.mode === 'extract' }] },
    { id: 'remove', group: 'Organize', name: 'Remove pages', blurb: 'Delete the pages you don’t need.', icon: 'remove', color: '#7c5cff', accept: PDF, action: 'Remove pages',
      opts: [pagesOpt('Pages to remove', '', 'Like 2, 5-7')] },
    { id: 'organize', group: 'Organize', name: 'Organize pages', blurb: 'Drag pages into order, rotate or delete them.', icon: 'organize', color: '#7c5cff', accept: PDF, special: 'organize' },
    { id: 'rotate', group: 'Organize', name: 'Rotate PDF', blurb: 'Turn pages the right way up.', icon: 'rotate', color: '#7c5cff', accept: PDF, multi: true, action: 'Rotate',
      opts: [{ key: 'angle', type: 'choice', label: 'Rotate', def: 90, choices: [[90, '90° right'], [180, '180°'], [270, '90° left']] }, pagesOpt('Pages', 'all')] },
    { id: 'compress', group: 'Optimize', name: 'Compress PDF', blurb: 'Make PDFs smaller for email and upload.', icon: 'compress', color: '#2ebe7a', accept: PDF, multi: true, action: 'Compress',
      opts: [{ key: 'level', type: 'choice', label: 'Compression', def: 'recommended', choices: [['low', 'Light, best quality'], ['recommended', 'Recommended'], ['extreme', 'Smallest file']] }] },
    { id: 'office-to-pdf', group: 'Convert to PDF', name: 'Office to PDF', blurb: 'Word, PowerPoint and Excel files to PDF.', icon: 'office', color: '#ff9f3f', accept: OFFICE, multi: true, action: 'Convert to PDF', needs: 'office' },
    { id: 'images-to-pdf', group: 'Convert to PDF', name: 'Images to PDF', blurb: 'Photos and scans to a single PDF.', icon: 'image', color: '#ff9f3f', accept: IMAGES, multi: true, action: 'Convert to PDF',
      opts: [{ key: 'size', type: 'choice', label: 'Page size', def: 'fit', choices: [['fit', 'Same as image'], ['a4', 'A4'], ['letter', 'Letter']] },
        { key: 'orientation', type: 'choice', label: 'Orientation', def: 'portrait', choices: [['portrait', 'Portrait'], ['landscape', 'Landscape']], when: (o) => o.size !== 'fit' },
        { key: 'margin', type: 'choice', label: 'Margin', def: 'none', choices: [['none', 'None'], ['small', 'Small'], ['big', 'Big']] }] },
    { id: 'pdf-to-word', group: 'Convert from PDF', name: 'PDF to Word', blurb: 'Editable DOCX with layout and tables.', icon: 'word', color: '#3b7bff', accept: PDF, action: 'Convert to Word', needs: 'word' },
    { id: 'pdf-to-images', group: 'Convert from PDF', name: 'PDF to images', blurb: 'Every page as a PNG or JPG.', icon: 'image', color: '#3b7bff', accept: PDF, action: 'Convert to images',
      opts: [{ key: 'format', type: 'choice', label: 'Format', def: 'png', choices: [['png', 'PNG'], ['jpg', 'JPG']] },
        { key: 'dpi', type: 'choice', label: 'Quality', def: 150, choices: [[72, 'Screen'], [150, 'Standard'], [300, 'Print']] }, pagesOpt('Pages', 'all')] },
    { id: 'pdf-to-text', group: 'Convert from PDF', name: 'PDF to text', blurb: 'Pull out all the text as a .txt file.', icon: 'text', color: '#3b7bff', accept: PDF, action: 'Extract text' },
    { id: 'edit', group: 'Edit & sign', name: 'Edit PDF', blurb: 'Add text, cover, highlight, draw and redact.', icon: 'edit', color: '#ff5c7a', accept: PDF, special: 'editor' },
    { id: 'sign', group: 'Edit & sign', name: 'Sign PDF', blurb: 'Draw or type your signature and place it.', icon: 'sign', color: '#ff5c7a', accept: PDF, special: 'editor' },
    { id: 'page-numbers', group: 'Edit & sign', name: 'Page numbers', blurb: 'Number pages, where and how you like.', icon: 'numbers', color: '#ff5c7a', accept: PDF, action: 'Add page numbers',
      opts: [{ key: 'position', type: 'choice', label: 'Position', def: 'bottom-center', choices: [['top-left', 'Top left'], ['top-center', 'Top'], ['top-right', 'Top right'], ['bottom-left', 'Bottom left'], ['bottom-center', 'Bottom'], ['bottom-right', 'Bottom right']] },
        { key: 'style', type: 'choice', label: 'Text', def: 'n', choices: [['n', '1'], ['page', 'Page 1'], ['of', 'Page 1 of 9']] },
        { key: 'start', type: 'number', label: 'First number', def: 1 }, pagesOpt('Pages', 'all')] },
    { id: 'watermark', group: 'Edit & sign', name: 'Watermark', blurb: 'Stamp text like DRAFT or CONFIDENTIAL.', icon: 'watermark', color: '#ff5c7a', accept: PDF, multi: true, action: 'Add watermark',
      opts: [{ key: 'text', type: 'text', label: 'Text', def: 'CONFIDENTIAL' },
        { key: 'size', type: 'range', label: 'Size', def: 54, min: 18, max: 120 },
        { key: 'opacity', type: 'range', label: 'Opacity', def: 18, min: 5, max: 100, unit: '%' },
        { key: 'angle', type: 'choice', label: 'Angle', def: 45, choices: [[0, 'Flat'], [45, 'Diagonal'], [90, 'Upright']] },
        { key: 'color', type: 'color', label: 'Colour', def: '#c0322f' }, pagesOpt('Pages', 'all')] },
    { id: 'protect', group: 'Security', name: 'Protect PDF', blurb: 'Lock with a password (AES-256).', icon: 'lock', color: '#1f2a44', accept: PDF, multi: true, action: 'Protect',
      opts: [{ key: 'password', type: 'password', label: 'Password', def: '' }, { key: 'confirm', type: 'password', label: 'Type it again', def: '' }] },
    { id: 'unlock', group: 'Security', name: 'Unlock PDF', blurb: 'Remove a password you know.', icon: 'unlock', color: '#1f2a44', accept: PDF, multi: true, action: 'Unlock',
      opts: [{ key: 'password', type: 'password', label: 'Current password', def: '' }] },
  ];
  const GROUPS = ['Organize', 'Optimize', 'Convert to PDF', 'Convert from PDF', 'Edit & sign', 'Security'];
  const byId = Object.fromEntries(TOOLS.map((t) => [t.id, t]));
  const glyph = (t) => h('span', { class: 'glyph', style: { background: t.color }, html: icon(t.icon) });

  let engines = { pdf: true, word: true, office: true };
  let handoff = null; // a result carried into the next tool
  const app = $('#app');

  // ─── server calls ─────────────────────────────────────────────────────
  function upload(file, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', './api/files?name=' + encodeURIComponent(file.name));
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
      xhr.onload = () => {
        let body = {};
        try { body = JSON.parse(xhr.responseText); } catch (e) { /* not JSON */ }
        xhr.status === 201 ? resolve(body) : reject(new Error(body.error || 'Upload failed'));
      };
      xhr.onerror = () => reject(new Error('Upload failed. Is Documents still running?'));
      xhr.send(file);
    });
  }
  async function runTool(tool, ids, options) {
    const r = await fetch('./api/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tool, files: ids, options }) });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error || 'That didn’t work');
    return body;
  }
  const fileURL = (f, extra) => `./api/files/${f.id}${extra || ''}`;
  const pageURL = (f, n, w) => `./api/files/${f.id}/pages/${n}.png?w=${w}`;

  // ─── routing ──────────────────────────────────────────────────────────
  function route() {
    closeEditor();
    const m = location.hash.match(/^#\/t\/([\w-]+)/);
    const t = m && byId[m[1]];
    window.scrollTo(0, 0);
    t ? renderTool(t) : renderHome();
  }
  window.addEventListener('hashchange', route);

  // ─── home ─────────────────────────────────────────────────────────────
  function renderHome() {
    document.title = 'Documents';
    const groups = h('div');
    const search = h('input', { type: 'search', placeholder: 'Find a tool: merge, word, sign…', 'aria-label': 'Find a tool',
      oninput: () => fill(search.value.trim().toLowerCase()) });
    function fill(q) {
      groups.replaceChildren(...GROUPS.map((g) => {
        const list = TOOLS.filter((t) => t.group === g && (!q || (t.name + ' ' + t.blurb + ' ' + t.group).toLowerCase().includes(q)));
        if (!list.length) return null;
        return h('section', { class: 'group' }, h('h2', {}, g),
          h('div', { class: 'grid' }, list.map((t) => h('a', { class: 'tool', href: '#/t/' + t.id }, glyph(t), h('b', {}, t.name), h('span', { class: 'blurb' }, t.blurb)))));
      }).filter(Boolean));
      if (!groups.children.length) groups.append(h('p', { class: 'note', style: { marginTop: '24px' } }, 'No tool matches that.'));
    }
    const missing = [];
    if (!engines.office) missing.push('Office to PDF needs LibreOffice on the Hub machine.');
    if (!engines.word) missing.push('PDF to Word needs pdf2docx: <code>pip install -r apps/documents/requirements.txt</code>.');
    app.replaceChildren(h('div', { class: 'wrap' },
      h('h1', {}, 'Documents'),
      h('p', { class: 'lead' }, 'Merge, split, convert, edit and sign documents. Everything happens on this computer, and files are deleted after two hours.'),
      h('label', { class: 'search' }, h('span', { html: icon('search'), style: { display: 'flex', width: '20px', color: 'var(--muted)' } }), search),
      missing.length ? h('p', { class: 'engine-note', html: missing.join(' ') }) : null,
      groups));
    fill('');
  }

  // ─── tool page ────────────────────────────────────────────────────────
  function renderTool(t) {
    document.title = t.name + ' · Documents';
    const opts = Object.fromEntries((t.opts || []).map((o) => [o.key, o.def]));
    const state = { files: handoff ? [handoff] : [], uploads: [], error: '', running: false, result: null };
    handoff = null;
    let organizeState = null;

    const input = h('input', { type: 'file', accept: t.accept, multiple: t.multi || null, hidden: true, onchange: () => { add(input.files); input.value = ''; } });

    async function add(list) {
      const picked = Array.from(list);
      if (!t.multi) { state.files = []; picked.splice(1); }
      for (const file of picked) {
        const u = { name: file.name, progress: 0 };
        state.uploads.push(u);
        render();
        try {
          const meta = await upload(file, (p) => { u.progress = p; paintUploads(); });
          if (t.accept === PDF && !meta.pdf) throw new Error(`${file.name} isn’t a PDF`);
          state.files.push(meta);
          state.error = '';
        } catch (e) {
          state.error = e.message;
        }
        state.uploads.splice(state.uploads.indexOf(u), 1);
        state.result = null;
        render();
      }
    }
    let uploadsBox = null;
    function paintUploads() {
      if (!uploadsBox) return;
      uploadsBox.replaceChildren(...state.uploads.map((u) => h('div', { class: 'file' },
        h('div', { class: 'thumb' }, h('span', { class: 'ext' }, '…')), h('span', { class: 'name' }, u.name),
        h('div', { class: 'bar' }, h('span', { style: { width: (u.progress * 100) + '%' } })))));
    }

    function dropzone(compact) {
      const z = h('div', { class: 'drop' + (compact ? ' compact' : ''), role: 'button', tabindex: 0,
        onclick: () => input.click(), onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } } },
      h('b', {}, compact ? '+ Add more files' : (t.multi ? 'Drop files here' : 'Drop a file here')),
      compact ? null : h('span', { class: 'note' }, 'or click to choose · ' + acceptLabel(t.accept)));
      ['dragenter', 'dragover'].forEach((ev) => z.addEventListener(ev, (e) => { e.preventDefault(); z.classList.add('over'); }));
      ['dragleave', 'drop'].forEach((ev) => z.addEventListener(ev, (e) => { e.preventDefault(); z.classList.remove('over'); }));
      z.addEventListener('drop', (e) => e.dataTransfer.files.length && add(e.dataTransfer.files));
      return z;
    }

    function fileCard(f, i) {
      const thumb = f.pdf && !f.encrypted
        ? h('img', { src: pageURL(f, 1, 240), alt: '' })
        : h('span', { class: 'ext' }, f.encrypted ? '🔒' : (f.ext || 'file'));
      const move = (d) => { const j = i + d; [state.files[i], state.files[j]] = [state.files[j], state.files[i]]; state.result = null; render(); };
      return h('div', { class: 'file' },
        h('div', { class: 'thumb' }, thumb),
        h('span', { class: 'name', title: f.name }, f.name),
        h('span', { class: 'meta' }, [f.pages ? plural(f.pages, 'page') : null, size(f.size)].filter(Boolean).join(' · ')),
        h('div', { class: 'ctrl' },
          t.multi && i > 0 ? h('button', { class: 'icon-btn', 'aria-label': 'Move earlier', html: icon('back'), onclick: () => move(-1) }) : null,
          t.multi && i < state.files.length - 1 ? h('button', { class: 'icon-btn', 'aria-label': 'Move later', html: icon('back').replace('m15 5-7 7 7 7', 'm9 5 7 7-7 7'), onclick: () => move(1) }) : null,
          h('button', { class: 'icon-btn', 'aria-label': 'Remove ' + f.name, html: icon('x'), onclick: () => { state.files.splice(i, 1); state.result = null; render(); } })));
    }

    function optionFields() {
      const box = h('div', { class: 'options' });
      for (const o of t.opts || []) {
        if (o.when && !o.when(opts)) continue;
        const id = 'opt-' + o.key;
        let field;
        if (o.type === 'choice') {
          field = h('div', { class: 'seg', role: 'group', 'aria-label': o.label }, o.choices.map(([v, label]) =>
            h('button', { type: 'button', 'aria-pressed': String(opts[o.key] === v), onclick: () => { opts[o.key] = v; render(); } }, label)));
        } else if (o.type === 'range') {
          const out = h('small', {}, opts[o.key] + (o.unit || ''));
          field = h('div', {}, h('input', { id, type: 'range', min: o.min, max: o.max, value: opts[o.key],
            oninput: (e) => { opts[o.key] = +e.target.value; out.textContent = e.target.value + (o.unit || ''); } }), ' ', out);
        } else {
          field = h('input', { id, type: o.type, value: opts[o.key], autocomplete: o.type === 'password' ? 'new-password' : 'off',
            oninput: (e) => { opts[o.key] = o.type === 'number' ? +e.target.value : e.target.value; } });
        }
        box.append(h('div', { class: 'opt' }, o.type === 'choice' ? h('span', { class: 'label' }, o.label) : h('label', { for: id }, o.label),
          field, o.hint ? h('small', {}, o.hint) : null));
      }
      return box.children.length ? box : null;
    }

    async function go() {
      const min = t.min || 1;
      if (state.files.length < min) { state.error = min > 1 ? `Add at least ${min} files` : 'Add a file first'; return render(); }
      if (t.id === 'protect' && opts.password !== opts.confirm) { state.error = 'The two passwords don’t match'; return render(); }
      const options = { ...opts };
      if (t.id === 'watermark') options.opacity = opts.opacity / 100;
      state.running = true; state.error = ''; render();
      try {
        state.result = await runTool(t.id, state.files.map((f) => f.id), options);
      } catch (e) {
        state.error = e.message;
      }
      state.running = false;
      render();
      $('.result') && $('.result').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function resultCard() {
      const r = state.result;
      const outs = r.outputs;
      const total = outs.reduce((a, o) => a + o.size, 0);
      const saved = t.id === 'compress' && r.inputSize ? Math.round((1 - total / r.inputSize) * 100) : null;
      const next = outs.length === 1 && outs[0].pdf ? ['compress', 'edit', 'sign', 'merge', 'split', 'page-numbers', 'watermark', 'protect'].filter((x) => x !== t.id) : [];
      return h('section', { class: 'result' },
        h('h2', {}, outs.length === 1 ? 'Your file is ready' : `${outs.length} files are ready`),
        saved != null ? h('span', { class: 'saving' }, saved > 0 ? `${size(r.inputSize)} → ${size(total)} · ${saved}% smaller` : 'Already as small as it gets') : null,
        h('div', { class: 'dl' }, outs.map((o) => h('a', { class: 'ink-btn', href: fileURL(o), download: o.name }, 'Download ' + o.name + ' · ' + size(o.size)))),
        next.length ? h('div', {}, h('p', { class: 'note', style: { margin: '18px 0 0' } }, 'Keep going with this file'),
          h('div', { class: 'chain' }, next.map((id) => h('button', { class: 'pill-btn', onclick: () => { handoff = outs[0]; location.hash = '#/t/' + id; } }, byId[id].name)))) : null,
        h('div', { class: 'chain' }, h('button', { class: 'pill-btn', onclick: () => { state.files = []; state.result = null; render(); } }, 'Start over')));
    }

    function render() {
      if (t.special === 'editor' && state.files.length && !state.uploads.length) return openEditor(state.files[0], t.id === 'sign' ? 'sign' : 'edit');
      const unavailable = t.needs && !engines[t.needs];
      const body = h('div', { class: 'wrap' },
        h('a', { class: 'back', href: '#/' }, h('span', { html: icon('back'), style: { display: 'flex', width: '16px' } }), 'All tools'),
        h('div', { class: 'tool-head' }, glyph(t), h('div', {}, h('h1', {}, t.name), h('p', { class: 'lead', style: { marginTop: '6px' } }, t.blurb))),
        unavailable ? h('p', { class: 'engine-note', html: t.needs === 'office'
          ? 'This needs LibreOffice on the Hub machine. Install it from libreoffice.org, then restart Documents.'
          : 'This needs pdf2docx: run <code>pip install -r apps/documents/requirements.txt</code>, then restart Documents.' }) : null,
        input);
      if (t.special === 'organize' && state.files.length) {
        body.append(organizeView(state.files[0]));
      } else {
        if (!state.files.length || t.multi) body.append(dropzone(state.files.length > 0));
        const grid = h('div', { class: 'files' }, state.files.map(fileCard));
        uploadsBox = h('div', { style: { display: 'contents' } });
        grid.append(uploadsBox);
        if (state.files.length || state.uploads.length) body.append(grid);
        paintUploads();
        if (state.files.length && !t.special) {
          const fields = optionFields();
          if (fields) body.append(fields);
          body.append(h('div', { class: 'actions' },
            h('button', { class: 'ink-btn', disabled: state.running || unavailable, onclick: go },
              state.running ? [h('span', { class: 'spinner' }), 'Working…'] : t.action),
            state.error ? h('span', { class: 'err', role: 'alert' }, state.error) : null));
        } else if (state.error) {
          body.append(h('p', { class: 'err', role: 'alert' }, state.error));
        }
        if (state.result) body.append(resultCard());
      }
      app.replaceChildren(body);
    }

    // Organize: thumbnails you can drag, rotate and delete.
    function organizeView(f) {
      if (!organizeState || organizeState.file !== f) {
        organizeState = { file: f, pages: Array.from({ length: f.pages || 0 }, (_, i) => ({ index: i, rotate: 0 })) };
      }
      const pages = organizeState.pages;
      let dragFrom = null;
      const grid = h('div', { class: 'pages' });
      const paint = () => grid.replaceChildren(...pages.map((p, i) => {
        const img = h('img', { src: pageURL(f, p.index + 1, 220), alt: '', loading: i < 24 ? 'eager' : 'lazy', style: { transform: `rotate(${p.rotate}deg)` } });
        const card = h('div', { class: 'pg', draggable: 'true', tabindex: 0, 'aria-label': `Page ${p.index + 1}, position ${i + 1}. Arrow keys move it, R rotates, Delete removes.` },
          h('div', { class: 'thumb' }, img),
          h('span', { class: 'num' }, 'Page ' + (p.index + 1)),
          h('div', { class: 'ctrl' },
            h('button', { class: 'icon-btn', 'aria-label': 'Rotate', html: icon('turn'), onclick: () => { p.rotate = (p.rotate + 90) % 360; paint(); } }),
            h('button', { class: 'icon-btn', 'aria-label': 'Delete page', html: icon('x'), onclick: () => { pages.splice(i, 1); paint(); } })));
        card.addEventListener('dragstart', () => { dragFrom = i; card.classList.add('dragging'); });
        card.addEventListener('dragend', () => card.classList.remove('dragging'));
        card.addEventListener('dragover', (e) => { e.preventDefault(); card.classList.add('drop-before'); });
        card.addEventListener('dragleave', () => card.classList.remove('drop-before'));
        card.addEventListener('drop', (e) => {
          e.preventDefault();
          if (dragFrom == null || dragFrom === i) return paint();
          const [moved] = pages.splice(dragFrom, 1);
          pages.splice(dragFrom < i ? i - 1 : i, 0, moved);
          dragFrom = null;
          paint();
        });
        card.addEventListener('keydown', (e) => {
          const mv = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key];
          if (mv && pages[i + mv]) { [pages[i], pages[i + mv]] = [pages[i + mv], pages[i]]; paint(); grid.children[i + mv].focus(); e.preventDefault(); }
          if (e.key === 'r' || e.key === 'R') { p.rotate = (p.rotate + 90) % 360; paint(); grid.children[i].focus(); }
          if (e.key === 'Delete' || e.key === 'Backspace') { pages.splice(i, 1); paint(); (grid.children[i] || grid.children[i - 1])?.focus(); }
        });
        return card;
      }));
      paint();
      const save = async () => {
        state.running = true; state.error = ''; render();
        try { state.result = await runTool('organize', [f.id], { pages }); } catch (e) { state.error = e.message; }
        state.running = false;
        organizeState = null;
        state.files = state.result ? [] : state.files;
        render();
      };
      return h('div', {},
        h('p', { class: 'note', style: { marginTop: '20px' } }, `${f.name} · drag pages to reorder, or use the arrow keys.`),
        grid,
        h('div', { class: 'actions' },
          h('button', { class: 'ink-btn', disabled: state.running || !pages.length, onclick: save }, state.running ? [h('span', { class: 'spinner' }), 'Saving…'] : 'Save PDF'),
          h('button', { class: 'pill-btn', onclick: () => { organizeState = null; state.files = []; render(); } }, 'Choose another file'),
          state.error ? h('span', { class: 'err', role: 'alert' }, state.error) : null));
    }

    render();
  }

  function acceptLabel(a) {
    if (a === PDF) return 'PDF';
    if (a === OFFICE) return 'Word, PowerPoint, Excel, OpenDocument, text';
    if (a === IMAGES) return 'JPG, PNG and other images';
    return 'PDF or images';
  }

  // ─── PDF editor ───────────────────────────────────────────────────────
  let editorEl = null;
  function closeEditor() { if (editorEl) { editorEl.remove(); editorEl = null; } }

  function openEditor(file, mode) {
    closeEditor();
    const sizes = file.sizes || [];
    let items = [];
    const undoStack = [];
    let tool = mode === 'sign' ? 'select' : 'text';
    let selected = null;
    const props = { color: '#1c1a16', size: 14, width: 2 };
    const pages = [];
    const snapshot = () => { undoStack.push(JSON.stringify(items)); if (undoStack.length > 50) undoStack.shift(); };
    const uid = () => Math.random().toString(36).slice(2, 9);

    const TBTN = [['select', 'Select'], ['text', 'Text'], ['whiteout', 'Whiteout'], ['highlight', 'Highlight'], ['draw', 'Draw'], ['redact', 'Redact']];
    const toolButtons = TBTN.map(([id, label]) => h('button', { class: 'tbtn', 'aria-pressed': String(tool === id), title: label,
      onclick: () => setTool(id), html: icon(id) + `<span class="lbl">${label}</span>` }));
    function setTool(id) {
      tool = id;
      toolButtons.forEach((b, i) => b.setAttribute('aria-pressed', String(TBTN[i][0] === id)));
      scroller.style.cursor = id === 'select' ? 'default' : 'crosshair';
    }
    const colorInput = h('input', { type: 'color', value: props.color, 'aria-label': 'Colour', oninput: (e) => {
      props.color = e.target.value;
      if (selected && (selected.type === 'text' || selected.type === 'ink')) { snapshot(); selected.color = props.color; paintAll(); }
    } });
    const sizeSelect = h('select', { 'aria-label': 'Text size', onchange: (e) => {
      props.size = +e.target.value;
      if (selected && selected.type === 'text') { snapshot(); selected.size = props.size; paintAll(); }
    } }, [10, 12, 14, 18, 24, 32, 48].map((n) => h('option', { value: n, selected: n === props.size }, n + ' pt')));
    const imgInput = h('input', { type: 'file', accept: 'image/png,image/jpeg', hidden: true, onchange: () => {
      const f = imgInput.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => placeImage(r.result, 200);
      r.readAsDataURL(f);
      imgInput.value = '';
    } });
    const saveBtn = h('button', { class: 'ink-btn', style: { height: '40px', padding: '0 18px', fontSize: '15px' }, onclick: save }, 'Save PDF');
    const status = h('span', { class: 'note', role: 'status' });

    const bar = h('div', { class: 'etools' },
      h('button', { class: 'tbtn', onclick: () => { location.hash = '#/'; }, html: icon('back') + '<span class="lbl">Tools</span>' }),
      h('span', { class: 'sep' }), toolButtons,
      h('button', { class: 'tbtn', title: 'Image', onclick: () => imgInput.click(), html: icon('image') + '<span class="lbl">Image</span>' }),
      h('button', { class: 'tbtn', title: 'Signature', onclick: () => signatureModal((data) => placeImage(data, 170)), html: icon('sign') + '<span class="lbl">Sign</span>' }),
      h('span', { class: 'sep' }), colorInput, sizeSelect,
      h('button', { class: 'tbtn', title: 'Undo', onclick: undo, html: icon('undo') + '<span class="lbl">Undo</span>' }),
      imgInput, h('span', { class: 'grow' }), status, saveBtn);
    const scroller = h('div', { class: 'escroll' });
    editorEl = h('div', { class: 'editor', role: 'application', 'aria-label': 'PDF editor: ' + file.name }, bar, scroller);
    document.body.append(editorEl);
    app.replaceChildren();

    // Pages, sized to the window.
    for (let i = 0; i < sizes.length; i++) {
      const el = h('div', { class: 'epage' }, h('span', { class: 'label' }, `Page ${i + 1} of ${sizes.length}`));
      const img = h('img', { alt: `Page ${i + 1}`, loading: 'lazy' });
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'ink');
      const layer = h('div', { class: 'layer' });
      el.append(img, svg, layer);
      scroller.append(el);
      pages.push({ el, img, svg, layer, w: sizes[i][0], h: sizes[i][1], scale: 1 });
      layer.addEventListener('pointerdown', (e) => pointerDown(e, i));
    }
    function layout() {
      const avail = Math.min(scroller.clientWidth - 32, 980);
      pages.forEach((p, i) => {
        const w = Math.max(280, avail);
        p.scale = w / p.w;
        p.el.style.width = w + 'px';
        p.el.style.height = (p.h * p.scale) + 'px';
        const want = Math.round(w * (window.devicePixelRatio || 1));
        if (!p.img.dataset.w || +p.img.dataset.w < want) { p.img.src = pageURL(file, i + 1, Math.min(2400, want)); p.img.dataset.w = want; }
      });
      paintAll();
    }
    window.addEventListener('resize', layout);
    requestAnimationFrame(layout);
    setTool(tool);
    if (mode === 'sign') setTimeout(() => signatureModal((data) => placeImage(data, 170)), 300);

    function visiblePage() {
      const top = scroller.getBoundingClientRect().top;
      let best = 0, bestDist = Infinity;
      pages.forEach((p, i) => { const d = Math.abs(p.el.getBoundingClientRect().top - top - 24); if (d < bestDist) { bestDist = d; best = i; } });
      return best;
    }
    function placeImage(data, widthPts) {
      const im = new Image();
      im.onload = () => {
        const pi = visiblePage();
        const p = pages[pi];
        const w = Math.min(widthPts, p.w * 0.6);
        const hgt = w * (im.naturalHeight / im.naturalWidth);
        snapshot();
        const it = { id: uid(), page: pi, type: 'image', x: (p.w - w) / 2, y: p.h * 0.6, w, h: hgt, data };
        items.push(it);
        selected = it;
        setTool('select');
        paintAll();
      };
      im.src = data;
    }

    function undo() { if (undoStack.length) { items = JSON.parse(undoStack.pop()); selected = null; paintAll(); } }
    document.addEventListener('keydown', onKey);
    function onKey(e) {
      if (!editorEl) { document.removeEventListener('keydown', onKey); return; }
      const editing = document.activeElement && document.activeElement.isContentEditable;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !editing) { e.preventDefault(); undo(); }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected && !editing) { e.preventDefault(); snapshot(); items = items.filter((x) => x !== selected); selected = null; paintAll(); }
      if (e.key === 'Escape') { selected = null; document.activeElement.blur && document.activeElement.blur(); paintAll(); }
    }

    // Draw every item of every page from the model (points → pixels).
    function paintAll() {
      pages.forEach((p, pi) => {
        const s = p.scale;
        p.layer.replaceChildren();
        p.svg.replaceChildren();
        for (const it of items.filter((x) => x.page === pi)) {
          if (it.type === 'ink') {
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
            path.setAttribute('points', it.points.map(([x, y]) => `${x * s},${y * s}`).join(' '));
            path.setAttribute('fill', 'none');
            path.setAttribute('stroke', it.color);
            path.setAttribute('stroke-width', it.width * s);
            path.setAttribute('stroke-linecap', 'round');
            path.setAttribute('stroke-linejoin', 'round');
            p.svg.append(path);
            // an invisible box so strokes can be selected and deleted
            const xs = it.points.map((q) => q[0]), ys = it.points.map((q) => q[1]);
            const box = itemBox(it, Math.min(...xs) - 4, Math.min(...ys) - 4, Math.max(...xs) - Math.min(...xs) + 8, Math.max(...ys) - Math.min(...ys) + 8, s, 'rect');
            p.layer.append(box);
            continue;
          }
          const el = itemBox(it, it.x, it.y, it.w, it.h, s, it.type === 'image' ? 'image' : it.type === 'text' ? 'text' : 'rect');
          if (it.type === 'text') {
            el.textContent = it.text;
            Object.assign(el.style, { fontSize: it.size * s + 'px', color: it.color, width: 'auto', height: 'auto', minHeight: it.size * 1.2 * s + 'px' });
            el.addEventListener('dblclick', () => editText(el, it));
          } else if (it.type === 'image') {
            el.append(h('img', { src: it.data, alt: '' }));
          } else {
            el.style.background = it.type === 'redact' ? '#000' : it.fill;
            el.style.opacity = it.type === 'redact' ? .82 : it.opacity;
            if (it.fill === '#ffffff') el.style.boxShadow = 'inset 0 0 0 1px rgba(0,0,0,.08)';
          }
          p.layer.append(el);
        }
      });
      status.textContent = items.length ? plural(items.length, 'change') : '';
    }
    function itemBox(it, x, y, w, hh, s, cls) {
      const el = h('div', { class: `item ${cls}${selected === it ? ' sel' : ''}`, style: { left: x * s + 'px', top: y * s + 'px', width: w * s + 'px', height: hh * s + 'px' } });
      el._item = it;
      if (selected === it && it.type !== 'ink' && it.type !== 'text') el.append(h('span', { class: 'grip' }));
      return el;
    }
    function editText(el, it) {
      el.contentEditable = 'true';
      el.focus();
      document.getSelection().selectAllChildren(el);
      const done = () => {
        el.contentEditable = 'false';
        const text = el.innerText.replace(/\n$/, '');
        if (text !== it.text) { snapshot(); it.text = text; }
        if (!it.text.trim()) items = items.filter((x) => x !== it);
        else fitText(el, it);
        paintAll();
      };
      el.addEventListener('blur', done, { once: true });
    }
    function fitText(el, it) {
      const s = pages[it.page].scale;
      it.w = Math.max(20, el.scrollWidth / s + 4);
      it.h = Math.max(it.size * 1.3, el.scrollHeight / s + 2);
    }

    // Pointer interactions per tool.
    function pointerDown(e, pi) {
      const p = pages[pi];
      const r = p.layer.getBoundingClientRect();
      const pt = (ev) => [(ev.clientX - r.left) / p.scale, (ev.clientY - r.top) / p.scale];
      const [x0, y0] = pt(e);
      const hit = e.target.closest && e.target.closest('.item');
      if (hit && hit.isContentEditable) return;

      if (tool === 'select' || (hit && tool === 'text' && hit._item.type === 'text')) {
        if (!hit) { selected = null; paintAll(); return; }
        const it = hit._item;
        if (it.type === 'text' && tool === 'text') { selected = it; return editText(hit, it); }
        selected = it;
        paintAll();
        const resizing = e.target.classList.contains('grip');
        const before = JSON.stringify(items);
        const orig = JSON.parse(JSON.stringify(it));
        const move = (ev) => {
          const [x, y] = pt(ev);
          if (resizing) {
            const ratio = orig.h / orig.w;
            it.w = Math.max(10, orig.w + (x - x0));
            it.h = it.type === 'image' ? it.w * ratio : Math.max(6, orig.h + (y - y0));
          } else if (it.type === 'ink') {
            it.points = orig.points.map(([a, b]) => [a + x - x0, b + y - y0]);
          } else {
            it.x = orig.x + x - x0;
            it.y = orig.y + y - y0;
          }
          paintAll();
        };
        const up = () => {
          window.removeEventListener('pointermove', move);
          if (JSON.stringify(items) !== before) undoStack.push(before);  // one undo step per move
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up, { once: true });
        e.preventDefault();
        return;
      }

      if (tool === 'text') {
        snapshot();
        const it = { id: uid(), page: pi, type: 'text', x: x0, y: y0 - props.size * 0.6, w: 40, h: props.size * 1.3, text: '', size: props.size, color: props.color };
        items.push(it);
        selected = it;
        paintAll();
        const el = [...p.layer.children].find((c) => c._item === it);
        e.preventDefault();
        setTimeout(() => editText(el, it));
        return;
      }

      if (tool === 'draw') {
        snapshot();
        const it = { id: uid(), page: pi, type: 'ink', points: [[x0, y0]], color: props.color, width: props.width };
        items.push(it);
        const move = (ev) => { it.points.push(pt(ev)); paintAll(); };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', () => {
          window.removeEventListener('pointermove', move);
          if (it.points.length < 2) { items = items.filter((q) => q !== it); undoStack.pop(); }
          paintAll();
        }, { once: true });
        e.preventDefault();
        return;
      }

      // whiteout / highlight / redact: drag a box
      const draft = h('div', { class: 'drafting' });
      p.layer.append(draft);
      const move = (ev) => {
        const [x, y] = pt(ev);
        Object.assign(draft.style, { left: Math.min(x, x0) * p.scale + 'px', top: Math.min(y, y0) * p.scale + 'px', width: Math.abs(x - x0) * p.scale + 'px', height: Math.abs(y - y0) * p.scale + 'px' });
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', (ev) => {
        window.removeEventListener('pointermove', move);
        draft.remove();
        const [x, y] = pt(ev);
        const w = Math.abs(x - x0), hh = Math.abs(y - y0);
        if (w < 3 || hh < 3) return;
        snapshot();
        const base = { id: uid(), page: pi, x: Math.min(x, x0), y: Math.min(y, y0), w, h: hh };
        items.push(tool === 'redact' ? { ...base, type: 'redact' }
          : tool === 'highlight' ? { ...base, type: 'rect', fill: '#ffe066', opacity: 0.4 }
            : { ...base, type: 'rect', fill: '#ffffff', opacity: 1 });
        paintAll();
      }, { once: true });
      e.preventDefault();
    }

    async function save() {
      if (document.activeElement && document.activeElement.isContentEditable) document.activeElement.blur();
      if (!items.length) { status.textContent = 'Nothing to save yet'; return; }
      saveBtn.disabled = true;
      saveBtn.replaceChildren(h('span', { class: 'spinner' }), 'Saving…');
      const ops = items.map(({ id, ...op }) => op);
      try {
        const r = await runTool('edit', [file.id], { ops });
        const out = r.outputs[0];
        doneModal(out);
      } catch (e) {
        status.textContent = e.message;
      }
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save PDF';
    }
    function doneModal(out) {
      const back = h('div', { class: 'modal-back' }, h('div', { class: 'modal', role: 'dialog', 'aria-label': 'Saved' },
        h('h2', {}, 'Your PDF is ready'),
        h('p', { class: 'note' }, 'Redacted areas are removed for good, not just covered.'),
        h('div', { class: 'row' },
          h('button', { class: 'pill-btn', onclick: () => back.remove() }, 'Keep editing'),
          h('button', { class: 'pill-btn', onclick: () => { handoff = out; back.remove(); location.hash = '#/t/compress'; } }, 'Compress it'),
          h('a', { class: 'ink-btn', href: fileURL(out), download: out.name }, 'Download'))));
      document.body.append(back);
    }
  }

  // Signature: draw it, or type it in a handwriting-style font.
  function signatureModal(onDone) {
    let mode = 'draw';
    const canvas = h('canvas', { width: 1000, height: 360, 'aria-label': 'Draw your signature here' });
    const ctx = canvas.getContext('2d');
    const typed = h('input', { type: 'text', placeholder: 'Type your name', hidden: true, oninput: drawTyped });
    let drawn = false;
    function clear() { ctx.clearRect(0, 0, canvas.width, canvas.height); drawn = false; }
    function drawTyped() {
      clear();
      if (!typed.value.trim()) return;
      ctx.fillStyle = '#1a2b6d';
      ctx.font = 'italic 120px "Segoe Script", "Brush Script MT", "Snell Roundhand", cursive';
      ctx.textBaseline = 'middle';
      ctx.fillText(typed.value, 30, canvas.height / 2, canvas.width - 60);
      drawn = true;
    }
    canvas.addEventListener('pointerdown', (e) => {
      if (mode !== 'draw') return;
      const r = canvas.getBoundingClientRect();
      const at = (ev) => [(ev.clientX - r.left) * canvas.width / r.width, (ev.clientY - r.top) * canvas.height / r.height];
      ctx.strokeStyle = '#1a2b6d'; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(...at(e));
      const move = (ev) => { ctx.lineTo(...at(ev)); ctx.stroke(); drawn = true; };
      canvas.addEventListener('pointermove', move);
      window.addEventListener('pointerup', () => canvas.removeEventListener('pointermove', move), { once: true });
    });
    // Crop to the ink so the placed image hugs the signature.
    function cropped() {
      const { width: w, height: hh } = canvas;
      const px = ctx.getImageData(0, 0, w, hh).data;
      let x0 = w, y0 = hh, x1 = 0, y1 = 0;
      for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) if (px[(y * w + x) * 4 + 3] > 10) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      if (x1 <= x0) return null;
      const c = document.createElement('canvas');
      c.width = x1 - x0 + 16; c.height = y1 - y0 + 16;
      c.getContext('2d').drawImage(canvas, x0 - 8, y0 - 8, c.width, c.height, 0, 0, c.width, c.height);
      return c.toDataURL('image/png');
    }
    const tabs = h('div', { class: 'seg' }, [['draw', 'Draw'], ['type', 'Type']].map(([m, label]) => h('button', { type: 'button', 'aria-pressed': String(m === mode), onclick: (e) => {
      mode = m;
      tabs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === e.target)));
      typed.hidden = m !== 'type';
      clear();
      if (m === 'type') { typed.focus(); drawTyped(); }
    } }, label)));
    const back = h('div', { class: 'modal-back' }, h('div', { class: 'modal', role: 'dialog', 'aria-label': 'Your signature' },
      h('h2', {}, 'Your signature'), h('div', { style: { marginTop: '12px' } }, tabs), typed, canvas,
      h('div', { class: 'row' },
        h('button', { class: 'pill-btn', onclick: clear }, 'Clear'),
        h('button', { class: 'pill-btn', onclick: () => back.remove() }, 'Cancel'),
        h('button', { class: 'ink-btn', onclick: () => { if (!drawn) return; const d = cropped(); back.remove(); d && onDone(d); } }, 'Place signature'))));
    document.body.append(back);
  }

  // ─── start ────────────────────────────────────────────────────────────
  fetch('./health').then((r) => r.json()).then((hlth) => { engines = hlth.engines || engines; if (!location.hash || location.hash === '#/') renderHome(); }).catch(() => {});
  route();
})();
