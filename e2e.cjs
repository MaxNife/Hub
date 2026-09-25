// End-to-end suite for the Hub server. Run: node e2e.cjs (hub must be up on :8080,
// started from the repo root without HUB_PASSWORD_HASH).
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const BASE = 'http://127.0.0.1:8080';
let pass = 0;
async function t(name, fn) {
  try { await fn(); pass++; console.log('ok -', name); }
  catch (e) { console.error('FAIL -', name, '\n ', e.message); process.exitCode = 1; }
}
async function req(method, p, body) {
  const r = await fetch(BASE + p, { method, headers: { 'X-Hub-Request': '1' } });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: r.status, text, json, headers: r.headers };
}

(async () => {
// wait for boot
for (let i = 0; i < 50; i++) {
  try { const r = await fetch(BASE + '/healthz'); if (r.ok) break; } catch {}
  await new Promise(r => setTimeout(r, 200));
}

await t('healthz', async () => {
  const r = await req('GET', '/healthz');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.json.status, 'ok');
});

await t('home serves embedded shell', async () => {
  const r = await req('GET', '/');
  assert.strictEqual(r.status, 200);
  assert.ok(r.text.includes('<div id="root">'), 'shell html, got: ' + r.text.slice(0, 120));
});

await t('SPA fallback for client routes', async () => {
  const r = await req('GET', '/c/Tools');
  assert.strictEqual(r.status, 200);
  assert.ok(r.text.includes('<div id="root">'));
});

await t('api/apps lists converter installed', async () => {
  const r = await req('GET', '/api/apps');
  assert.strictEqual(r.status, 200);
  const conv = r.json.find(a => a.id === 'converter');
  assert.ok(conv, 'converter present: ' + JSON.stringify(r.json));
  assert.strictEqual(conv.installed, true);
  assert.strictEqual(conv.name, 'Converter');
});

await t('api/apps/{id} + unknown 404', async () => {
  const r = await req('GET', '/api/apps/converter');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.json.category, 'Tools');
  const bad = await req('GET', '/api/apps/nope');
  assert.strictEqual(bad.status, 404);
  assert.ok(bad.json.error);
  const badPost = await req('POST', '/api/apps/nope/install');
  assert.strictEqual(badPost.status, 404);
});

await t('opened feeds recent', async () => {
  const o = await req('POST', '/api/apps/converter/opened');
  assert.strictEqual(o.status, 200);
  const r = await req('GET', '/api/recent?limit=6');
  assert.strictEqual(r.status, 200);
  assert.ok(r.json.some(e => e.id === 'converter'), JSON.stringify(r.json));
});

await t('categories counts Tools', async () => {
  const r = await req('GET', '/api/categories');
  assert.strictEqual(r.status, 200);
  const tools = r.json.find(c => c.name === 'Tools');
  assert.ok(tools && tools.count >= 1, JSON.stringify(r.json));
});

await t('pin + unpin roundtrip', async () => {
  assert.strictEqual((await req('POST', '/api/apps/converter/pin')).status, 200);
  let apps = (await req('GET', '/api/apps')).json;
  assert.strictEqual(apps.find(a => a.id === 'converter').pinned, true);
  assert.strictEqual((await req('DELETE', '/api/apps/converter/pin')).status, 200);
  apps = (await req('GET', '/api/apps')).json;
  assert.strictEqual(apps.find(a => a.id === 'converter').pinned, false);
});

await t('hide blocks /apps, install restores', async () => {
  assert.strictEqual((await req('DELETE', '/api/apps/converter/install')).status, 200);
  assert.strictEqual((await req('GET', '/apps/converter/')).status, 404);
  let apps = (await req('GET', '/api/apps')).json;
  assert.strictEqual(apps.find(a => a.id === 'converter').installed, false);
  assert.strictEqual((await req('POST', '/api/apps/converter/install')).status, 200);
  apps = (await req('GET', '/api/apps')).json;
  assert.strictEqual(apps.find(a => a.id === 'converter').installed, true);
});

await t('static serving: html, icon, redirect, 404s', async () => {
  const idx = await req('GET', '/apps/converter/');
  assert.strictEqual(idx.status, 200);
  assert.ok(idx.text.includes('<title>Converter</title>'));
  assert.ok(idx.headers.get('content-type').includes('text/html'));
  const icon = await req('GET', '/apps/converter/icon.svg');
  assert.strictEqual(icon.status, 200);
  assert.ok(icon.headers.get('content-type').includes('svg'));
  // no-trailing-slash redirect (fetch follows it)
  const redir = await fetch(BASE + '/apps/converter', { redirect: 'manual' });
  assert.strictEqual(redir.status, 302);
  assert.strictEqual((await req('GET', '/apps/ghost/')).status, 404);
  assert.strictEqual((await req('GET', '/apps/converter/../../go.mod')).status, 404);
  const missing = await req('GET', '/apps/converter/nope.png');
  assert.strictEqual(missing.status, 404);
  // hub.json stays private even though the icon is served
  assert.strictEqual((await req('GET', '/apps/converter/hub.json')).status, 404);
});

await t('broken manifest -> errors, valid screen unaffected', async () => {
  const dir = path.join('apps', '_broken');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'hub.json'), JSON.stringify({ manifestVersion: 1, id: 'nope', name: 'Way Too Long A Name For An Icon' }));
  assert.strictEqual((await req('POST', '/api/registry/rescan')).status, 200);
  const errs = (await req('GET', '/api/registry/errors')).json;
  assert.ok(errs.some(e => e.id === '_broken'), JSON.stringify(errs));
  const apps = (await req('GET', '/api/apps')).json;
  assert.ok(apps.some(a => a.id === 'converter'), 'valid apps still listed');
  fs.rmSync(dir, { recursive: true, force: true });
  assert.strictEqual((await req('POST', '/api/registry/rescan')).status, 200);
  const errs2 = (await req('GET', '/api/registry/errors')).json;
  assert.ok(!errs2.some(e => e.id === '_broken'));
});

await t('status + db file exist', async () => {
  const r = await req('GET', '/api/status');
  assert.strictEqual(r.status, 200);
  assert.ok(fs.existsSync('data/hub.db'), 'hub.db created');
});

await t('m3 apps serve with correct titles', async () => {
  await req('POST', '/api/registry/rescan');
  const apps = (await req('GET', '/api/apps')).json;
  for (const id of ['converter', 'memory', 'meal-picker']) {
    assert.ok(apps.some(a => a.id === id && a.installed), id + ' listed+installed');
    const page = await req('GET', `/apps/${id}/`);
    assert.strictEqual(page.status, 200, id + ' serves');
  }
  assert.ok((await req('GET', '/apps/memory/')).text.includes('<title>Memory</title>'));
  assert.ok((await req('GET', '/apps/meal-picker/')).text.includes('<title>Meal picker</title>'));
  assert.strictEqual((await req('GET', '/apps/memory/icon.svg')).status, 200);
  const cats = (await req('GET', '/api/categories')).json;
  assert.ok(cats.some(c => c.name === 'Games'), 'Games category: ' + JSON.stringify(cats));
});

await t('all static apps serve', async () => {
  await req('POST', '/api/registry/rescan');
  for (const [id, title] of [['reaction', 'Reaction'], ['puzzle', 'Puzzle'], ['random', 'Random'], ['names', 'Name generator']]) {
    const page = await req('GET', `/apps/${id}/`);
    assert.strictEqual(page.status, 200, id);
    assert.ok(page.text.includes(`<title>${title}</title>`), id + ' title');
    assert.ok(page.text.includes('hub:theme'), id + ' follows the Hub theme');
  }
});

await t('games load the shared game kit', async () => {
  for (const id of ['memory', 'reaction', 'puzzle']) {
    const page = (await req('GET', `/apps/${id}/`)).text;
    assert.ok(page.includes('./game-kit.js') && page.includes('GameKit.create'), id + ' uses the kit');
    const kit = await req('GET', `/apps/${id}/game-kit.js`);
    assert.strictEqual(kit.status, 200, id + ' serves game-kit.js');
    assert.strictEqual(kit.text, fs.readFileSync('appkit/game-kit.js', 'utf8'), id + ' kit is in sync (python appkit/sync.py)');
  }
});

await t('writes need the X-Hub-Request header', async () => {
  const r = await fetch(BASE + '/api/apps/converter/pin', { method: 'POST' });
  assert.strictEqual(r.status, 403);
  const ok = await req('DELETE', '/api/apps/converter/pin');
  assert.strictEqual(ok.status, 200);
});

await t('session, status and settings', async () => {
  const s = await req('GET', '/api/session');
  assert.deepStrictEqual(s.json, { authRequired: false, authenticated: true });
  const st = (await req('GET', '/api/status')).json;
  assert.ok(st.weather && st.nextEvent && st.health, JSON.stringify(st));
  assert.ok(st.health.total >= 7, 'counts installed apps');
  const set = (await req('GET', '/api/settings')).json;
  assert.strictEqual(typeof set.calendarConfigured, 'boolean');
  const bad = await fetch(BASE + '/api/settings/weather', {
    method: 'PUT', headers: { 'X-Hub-Request': '1', 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Nowhere', latitude: 123, longitude: 0 }),
  });
  assert.strictEqual(bad.status, 400);
});

await t('service app: proxy, health, offline', async () => {
  const http = require('http');
  let seen = null;
  const up = http.createServer((r, w) => {
    if (r.url === '/health') { w.end('ok'); return; }
    seen = { url: r.url, prefix: r.headers['x-forwarded-prefix'], cookie: r.headers.cookie || '' };
    w.end('hello from ' + r.url);
  });
  await new Promise((res) => up.listen(8199, '127.0.0.1', res));
  const dir = path.join('apps', 'e2e-svc');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'icon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  fs.writeFileSync(path.join(dir, 'hub.json'), JSON.stringify({
    manifestVersion: 1, id: 'e2e-svc', name: 'E2E service', category: 'Test', icon: 'icon.svg',
    type: 'service', upstream: 'http://127.0.0.1:8199',
  }));
  try {
    assert.strictEqual((await req('POST', '/api/registry/rescan')).status, 200);
    const check = await req('POST', '/api/apps/e2e-svc/check');
    assert.strictEqual(check.json.ok, true, JSON.stringify(check.json));
    const r = await fetch(BASE + '/apps/e2e-svc/echo?x=1', { headers: { Cookie: 'hub_session=secret; theirs=1' } });
    assert.strictEqual(await r.text(), 'hello from /echo?x=1');
    assert.strictEqual(seen.prefix, '/apps/e2e-svc');
    assert.ok(!seen.cookie.includes('secret') && seen.cookie.includes('theirs=1'), 'session cookie stripped: ' + seen.cookie);
    assert.strictEqual((await req('GET', '/apps/e2e-svc/icon.svg')).status, 200, 'icon served by Hub');
    const apps = (await req('GET', '/api/apps')).json;
    assert.strictEqual(apps.find((a) => a.id === 'e2e-svc').healthOk, true);
    await new Promise((res) => up.close(res));
    const down = await req('POST', '/api/apps/e2e-svc/check');
    assert.strictEqual(down.json.ok, false);
    assert.strictEqual((await req('GET', '/apps/e2e-svc/')).status, 502);
    const st = (await req('GET', '/api/status')).json;
    assert.ok(st.health.down.some((d) => d.id === 'e2e-svc'), JSON.stringify(st.health));
  } finally {
    up.close();
    fs.rmSync(dir, { recursive: true, force: true });
    await req('POST', '/api/registry/rescan');
  }
});

console.log(`\n${pass} passed`);
})();
