// Install as an app: beforeinstallprompt flow, installed, iOS instructions, in-app browsers, manifest + index.html + icons, title and settings buttons on desktop and phone stages.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makeApp, frames, click, key } from './graftwork_lib.mjs';
import * as INST from '../graftwork/ui/install.js';
import title from '../graftwork/ui/title.js';
import settings from '../graftwork/ui/settings.js';
import * as META from '../graftwork/engine/meta.js';

const UA_CHROME = 'Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile Safari/537.36';
const UA_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1';
function fakeHost(ua, o = {}) {
  const L = {};
  const window = { addEventListener(n, f) { (L[n] = L[n] || []).push(f); }, matchMedia: (q) => ({ matches: !!(o.display && q.includes(o.display)) }) };
  const navigator = { userAgent: ua, platform: o.platform || '', maxTouchPoints: o.touch || 0, standalone: o.standalone };
  return { window, navigator, fire(n, ev) { for (const f of L[n] || []) f(ev); } };
}
function promptEvent(outcome) {
  const e = { prevented: false, prompts: 0, preventDefault() { this.prevented = true; }, prompt() { this.prompts++; return Promise.resolve(); }, userChoice: Promise.resolve({ outcome }) };
  return e;
}

// ---- headless safe: no window, nothing available
INST.resetInstall();
{ const w = globalThis.window; globalThis.window = undefined;
  assert.equal(INST.installMode(), 'none'); assert.equal(INST.canInstall(), false); assert.equal(INST.isInstalled(), false); assert.equal(INST.installAvailable(), false);
  assert.equal(await INST.install(null), 'unavailable'); globalThis.window = w; }

// ---- Chrome flow: event captured and prevented, install() prompts once, accepted -> toast and hidden
{
  const h = fakeHost(UA_CHROME); INST.initInstall(h);
  assert.equal(INST.installMode(), 'none', 'nothing before the browser says it can install');
  const ev = promptEvent('accepted'); h.fire('beforeinstallprompt', ev);
  assert.ok(ev.prevented, 'default mini-infobar prevented'); assert.equal(INST.canInstall(), true); assert.equal(INST.installAvailable(), true);
  assert.equal(await INST.install(null), 'accepted'); assert.equal(ev.prompts, 1);
  assert.equal(INST.installAvailable(), false, 'hidden after install'); assert.equal(INST.installMode(), 'installed');
  assert.ok(INST.installToast() && /Installed/.test(INST.installToast().msg), 'success toast'); assert.ok(!/[—–]/.test(INST.installToast().msg));
}
{ // dismissed: hidden until the browser fires a new event; appinstalled path
  const h = fakeHost(UA_CHROME); INST.initInstall(h);
  h.fire('beforeinstallprompt', promptEvent('dismissed')); assert.equal(await INST.install(null), 'dismissed');
  assert.equal(INST.installAvailable(), false); h.fire('beforeinstallprompt', promptEvent('accepted')); assert.equal(INST.installAvailable(), true);
  h.fire('appinstalled', {}); assert.equal(INST.isInstalled(), true); assert.equal(INST.installAvailable(), false); assert.ok(INST.installToast());
}
// ---- already installed (display-mode, navigator.standalone): hidden even with an event
for (const o of [{ display: 'standalone' }, { display: 'fullscreen' }, { standalone: true }]) {
  const h = fakeHost(UA_CHROME, o); INST.initInstall(h); h.fire('beforeinstallprompt', promptEvent('accepted'));
  assert.equal(INST.isInstalled(), true); assert.equal(INST.installAvailable(), false);
}
// ---- iOS: instructions; in-app browsers and desktop Firefox: nothing
{
  const h = fakeHost(UA_IOS); INST.initInstall(h); assert.equal(INST.installMode(), 'ios'); assert.equal(INST.installAvailable(), true);
  const app = await makeApp({ meta: META.loadMeta() }); app.register('install_help', INST.installHelp);
  assert.equal(await INST.install(app), 'ios'); frames(app, 5); assert.equal(app.top(), INST.installHelp, 'dialog open');
  click(app, 640, 190 + 300 - 66 + 23); frames(app, 3); assert.notEqual(app.top(), INST.installHelp, 'Got it closes it');
  const h2 = fakeHost('Mozilla/5.0 (Macintosh) AppleWebKit Safari', { platform: 'MacIntel', touch: 5 }); INST.initInstall(h2); assert.equal(INST.installMode(), 'ios', 'iPadOS reports as a Mac with touch');
  INST.initInstall(fakeHost(UA_IOS + ' Instagram 300')); assert.equal(INST.installMode(), 'none', 'in-app browser');
  INST.initInstall(fakeHost('Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0')); assert.equal(INST.installMode(), 'none', 'Firefox desktop');
}
{ const src = fs.readFileSync(new URL('../graftwork/ui/install.js', import.meta.url), 'utf8'); assert.ok(!/[—–]/.test(src), 'no dashes in install.js'); }

// ---- manifest, icons, index.html
{
  const root = new URL('../graftwork/', import.meta.url);
  const raw = fs.readFileSync(new URL('manifest.webmanifest', root), 'utf8'); assert.ok(!/[—–]/.test(raw), 'no em dashes');
  const m = JSON.parse(raw);
  assert.equal(m.name, 'Graftwork'); assert.equal(m.short_name, 'Graftwork'); assert.equal(m.start_url, './'); assert.equal(m.scope, './');
  assert.equal(m.display, 'fullscreen'); assert.deepEqual(m.display_override, ['fullscreen', 'standalone']); assert.equal(m.orientation, 'landscape');
  assert.match(m.background_color, /^#[0-9a-f]{6}$/i); assert.match(m.theme_color, /^#[0-9a-f]{6}$/i); assert.ok(m.description && m.categories.length);
  const base = new URL('https://games-71g.pages.dev/graftwork/manifest.webmanifest');
  assert.ok(new URL(m.scope, base).pathname === '/graftwork/' && new URL(m.start_url, base).pathname.startsWith('/graftwork/'), 'scope and start_url stay inside /graftwork/');
  const sizeOf = (f) => { const b = fs.readFileSync(f); assert.equal(b.toString('latin1', 1, 4), 'PNG'); return [b.readUInt32BE(16), b.readUInt32BE(20), b.length]; };
  const purposes = new Set();
  for (const ic of m.icons) { const [w, h, n] = sizeOf(new URL(ic.src, root)); assert.equal(`${w}x${h}`, ic.sizes, ic.src); assert.equal(ic.type, 'image/png'); assert.ok(n < 40000, 'icon stays small: ' + ic.src); purposes.add(ic.sizes + ic.purpose); }
  for (const p of ['192x192any', '512x512any', '512x512maskable']) assert.ok(purposes.has(p), 'icon ' + p);
  const [aw, ah] = sizeOf(new URL('icons/apple-touch-icon.png', root)); assert.equal(aw + 'x' + ah, '180x180');
  const html = fs.readFileSync(new URL('index.html', root), 'utf8');
  for (const re of [/<link rel="manifest" href="manifest\.webmanifest">/, /<meta name="theme-color" content="#1A1614">/, /<link rel="apple-touch-icon" href="icons\/apple-touch-icon\.png">/, /apple-mobile-web-app-capable" content="yes"/, /viewport-fit=cover/]) assert.match(html, re);
  assert.equal(m.theme_color.toLowerCase(), '#1a1614'); assert.ok(!/[—–]/.test(html));
  assert.ok(!fs.existsSync(new URL('sw.js', root)), 'no service worker: nothing can serve stale code');
}

// ---- UI: title and settings, desktop and phone stage scales
async function rig(scale, avail) {
  INST.resetInstall(); const h = fakeHost(UA_CHROME); INST.initInstall(h); if (avail) h.fire('beforeinstallprompt', promptEvent('accepted'));
  const meta = META.loadMeta(); meta.settings = {};
  const app = await makeApp({ run: null, meta, flow: { hasSave: () => false, saveMeta() {}, openCodex() {}, openSettings() { app.push('settings'); } } });
  app.shared.audio = { sfx() {}, music() {}, setVolumes() {}, mute() {} };
  if (scale) { app.scale = scale; app.minPx = 11; }
  app.register('title', title); app.register('settings', settings); app.register('install_help', INST.installHelp);
  return { app, h };
}
for (const scale of [0, 0.64, 0.54, 0.46]) for (const save of [false, true]) {
  for (const avail of [false, true]) {
    const { app } = await rig(scale, avail); app.shared.flow.hasSave = () => save; app.go('title'); frames(app, 80);
    const R = app.layout.getAll();
    for (const r of R) if (r.layer !== 'world' && !r.overlay) assert.ok(r.x >= -0.5 && r.y >= -0.5 && r.x + r.w <= 1280.5 && r.y + r.h <= 720.5, `title rect inside stage (${scale}, save ${save}, avail ${avail}): ${r.id}`);
    if (scale) for (const r of R) if (r.layer === 'hud' && /^btn/.test(r.id || '')) assert.ok(r.h >= 36, 'touch target: ' + r.id + ' ' + r.h);
  }
}
{ // click Install app on the title (desktop), Chrome path
  const { app, h } = await rig(0, true); const ev = promptEvent('accepted'); h.fire('beforeinstallprompt', ev);
  app.go('title'); frames(app, 80);
  click(app, 725, 306 + 4 * 56 + 24); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  assert.equal(ev.prompts, 1, 'title Install app button prompts');
  const { app: a2 } = await rig(0, false); a2.go('title'); frames(a2, 80); click(a2, 725, 306 + 4 * 56 + 24); frames(a2, 20);
  assert.equal(a2.current, 'title'); assert.notEqual(a2.state, 'credits'); // Credits is full width without the button: the right half is Credits then
}
{ // settings row
  const { app, h } = await rig(0, true); const ev = promptEvent('accepted'); h.fire('beforeinstallprompt', ev);
  app.push('settings'); frames(app, 30);
  const on = app.layout.getAll(); for (const r of on) if (r.layer !== 'world' && !r.overlay) assert.ok(r.y + r.h <= 720.5, 'settings rect inside: ' + r.id);
  const s = app.top(); assert.ok(s.rows.some((r) => r.label === 'Install app'), 'Install app row registered for keyboard nav');
  s.rows.find((r) => r.label === 'Install app').act(1); await Promise.resolve(); await Promise.resolve(); assert.equal(ev.prompts, 1);
  const { app: a2 } = await rig(0, false); a2.push('settings'); frames(a2, 30); assert.ok(!a2.top().rows.some((r) => r.label === 'Install app'), 'no row when not installable');
}
INST.resetInstall();
console.log('install ok');
