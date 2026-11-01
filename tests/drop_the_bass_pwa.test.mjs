// Drop the Bass PWA: manifest, icons, index.html tags, the generated precache list is current, service worker routing, pwa.js install flow.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { compute, blockFor, currentBlock } from '../tools/dtb_make_manifest.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), DIR = path.join(ROOT, 'drop_the_bass');
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };

const mf = JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.webmanifest'), 'utf8'));
ok(mf.name === 'Drop the Bass' && mf.short_name && mf.start_url === '/drop_the_bass/' && mf.scope === '/drop_the_bass/' && mf.display === 'standalone' && mf.orientation === 'portrait', 'manifest basics');
ok(/^#fbf6e6$/i.test(mf.background_color) && /^#fbf6e6$/i.test(mf.theme_color), 'cream paper colours');
const sizes = (p) => { const b = fs.readFileSync(p); assert.equal(b.slice(1, 4).toString(), 'PNG'); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
for (const ic of mf.icons) { const [w, h] = sizes(path.join(DIR, ic.src)); ok(ic.sizes === w + 'x' + h, 'icon size matches ' + ic.src); }
ok(mf.icons.some((i) => i.sizes === '192x192') && mf.icons.some((i) => i.sizes === '512x512' && i.purpose === 'any') && mf.icons.some((i) => i.purpose === 'maskable' && i.sizes === '512x512'), '192, 512 and maskable 512');
ok(sizes(path.join(DIR, 'icons/apple-touch-icon.png')).join() === '180,180', 'apple touch icon is 180');
const html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
ok(html.includes('rel="manifest" href="manifest.webmanifest"') && html.includes('rel="apple-touch-icon"') && html.includes('name="theme-color"'), 'index.html links the manifest and icons');

// the generated block in sw.js is current
const m = compute(), cur = currentBlock();
ok(cur.block === blockFor(m), 'sw.js precache list and version are current: run node tools/dtb_make_manifest.mjs');
ok(JSON.parse(fs.readFileSync(path.join(DIR, 'precache.json'), 'utf8')).version === m.version, 'precache.json is current');
const jsOnDisk = fs.readdirSync(path.join(DIR, 'js')).filter((f) => f.endsWith('.js')).map((f) => 'js/' + f);
ok(jsOnDisk.every((f) => m.files.includes(f)), 'every js module is precached');
ok(['index.html', 'ui.css', 'ui_doodle.css', 'manifest.webmanifest', 'fonts/PatrickHand-latin.woff2', 'icons/icon-192.png', 'js/pwa.js', 'js/stats.js'].every((f) => m.files.includes(f)), 'shell files are listed');
ok(!m.files.some((f) => /lab\/|\.md$|stats\.html|sw\.js/.test(f)), 'dev files are not precached');
ok(m.files.every((f) => fs.existsSync(path.join(DIR, f))), 'all listed files exist');

// service worker routing in a sandbox
const listeners = {}, cacheStore = new Map(), fetched = [];
const mkCache = (name) => { if (!cacheStore.has(name)) cacheStore.set(name, new Map()); const s = cacheStore.get(name); return { async add(r) { s.set(typeof r === 'string' ? r : r.url, 1); }, async match(r) { const u = typeof r === 'string' ? r : r.url; for (const k of s.keys()) if (k.split('?')[0] === u.split('?')[0]) return new Response('cached:' + u); return undefined; }, async put(r) { s.set(r.url, 1); } }; };
const sandbox = { self: { location: new URL('https://x.test/drop_the_bass/sw.js'), addEventListener: (t, f) => { listeners[t] = f; }, registration: { active: null }, skipWaiting() {}, clients: { claim: async () => {} } }, caches: { open: async (n2) => mkCache(n2), keys: async () => [...cacheStore.keys()], delete: async (k) => cacheStore.delete(k) }, fetch: async (r) => { fetched.push(r.url || r); return new Response('net'); }, Request, Response, URL, Promise, console };
vm.createContext(sandbox); vm.runInContext(fs.readFileSync(path.join(DIR, 'sw.js'), 'utf8'), sandbox);
ok(['install', 'activate', 'fetch', 'message'].every((t) => typeof listeners[t] === 'function'), 'worker registers its events');
let waited; listeners.install({ waitUntil: (p) => { waited = p; } }); await waited;
ok([...cacheStore.keys()].some((k) => k === 'dtb-shell-' + m.version) && cacheStore.get('dtb-shell-' + m.version).size === m.files.length, 'install precaches every file into a versioned cache');
const route = (url, extra) => { let res = 'not handled'; listeners.fetch(Object.assign({ request: Object.assign({ method: 'GET', url, mode: 'cors', destination: '' }, extra), respondWith: (p) => { res = p; } })); return res; };
ok(route('https://x.test/api/dropbass_board?b=daily') === 'not handled' && route('https://x.test/api/dropbass_stats') === 'not handled', '/api/ is never handled by the worker');
ok(route('https://x.test/drop_the_bass/x', { method: 'POST' }) === 'not handled' && route('https://other.test/drop_the_bass/a.js') === 'not handled' && route('https://x.test/other_game/a.js') === 'not handled', 'only GET, same origin, inside the scope');
ok(await (await route('https://x.test/drop_the_bass/js/main.js?v=3')).text() === 'cached:https://x.test/drop_the_bass/js/main.js', 'precached file is answered');
ok(await (await route('https://x.test/drop_the_bass/', { mode: 'navigate' })).text() === 'cached:https://x.test/drop_the_bass/index.html', 'navigation is served from the cached index.html (offline start)');
let act; listeners.activate({ waitUntil: (p) => { act = p; } }); await act;
cacheStore.set('dtb-shell-old', new Map()); listeners.activate({ waitUntil: (p) => { act = p; } }); await act; ok(!cacheStore.has('dtb-shell-old') && cacheStore.has('dtb-shell-' + m.version), 'activate drops old shell caches');

// pwa.js install flow (no browser needed)
const evs = {};
Object.defineProperty(globalThis, 'window', { value: { addEventListener: (t, f) => { evs[t] = f; } }, configurable: true });
const P = await import('../drop_the_bass/js/pwa.js');
ok(P.canInstall() === false && (await P.promptInstall()) === 'unavailable', 'no prompt offered yet');
let prompted = 0, changes = 0; P.onInstallChange(() => changes++);
evs.beforeinstallprompt({ preventDefault() {}, prompt: async () => { prompted++; }, userChoice: Promise.resolve({ outcome: 'accepted' }) });
ok(P.canInstall() === true && changes === 1, 'beforeinstallprompt makes canInstall true');
ok((await P.promptInstall()) === 'accepted' && prompted === 1 && P.canInstall() === false, 'promptInstall shows the dialog once');
ok((await P.initPwa()) === null, 'initPwa is a safe no-op without service worker support');
delete globalThis.window;
console.log('drop_the_bass pwa: ' + n + ' checks passed');
