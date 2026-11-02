// Drop the Bass round 5, hub and menu side (pure, no browser): friend invite links, boss phase groups, the muted setting, the fresh-profile
// reduce-motion default (fake matchMedia), and the PWA bits (online state, "ready to play offline" from a fake service worker).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as M from '../drop_the_bass/js/meta.js';
import { inviteLink, friendFromSearch, withoutFriendParam, cleanName, NAME_MAX } from '../drop_the_bass/js/lb.js';
import { BOSS_IDS } from '../drop_the_bass/js/data_core.js';
import { BOSS_PHASES, BOSS_PHASE_EFFECTS } from '../drop_the_bass/js/data_depth.js';

let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const NOW = Date.UTC(2026, 10, 2, 12);
const src = (f) => fs.readFileSync(new URL('../drop_the_bass/' + f, import.meta.url), 'utf8');

// ---- friend invite link
ok(inviteLink('https://games.test', 'Roxor Fan') === 'https://games.test/drop_the_bass/?friend=Roxor%20Fan', 'invite link: origin + path + encoded name');
ok(inviteLink('https://games.test/', 'Jas') === 'https://games.test/drop_the_bass/?friend=Jas', 'a trailing slash on the origin is dropped');
ok(inviteLink('https://games.test', '') === '' && inviteLink('https://games.test', '<>$%') === '', 'no name (or nothing left after cleaning): no link');
ok(friendFromSearch('?friend=Roxor%20Fan') === 'Roxor Fan', 'the name is read back');
ok(friendFromSearch('?x=1&friend=Jas') === 'Jas' && friendFromSearch('') === '' && friendFromSearch('?friend=') === '' && friendFromSearch('?other=1') === '', 'missing or empty parameter gives an empty name');
ok(friendFromSearch('?friend=' + encodeURIComponent('<script>alert(1)</script>')) === 'scriptalert1scri', 'markup characters are stripped (and the length limit applies)');
ok(friendFromSearch('?friend=' + 'a'.repeat(500)).length === NAME_MAX, 'length limit is the board name limit');
ok(/^[\w \-.']*$/.test(friendFromSearch('?friend=%E0%A4%A')), 'a broken escape never throws and stays clean');
ok(withoutFriendParam('/drop_the_bass/', '?friend=Jas', '') === '/drop_the_bass/' && withoutFriendParam('/drop_the_bass/', '?sw=1&friend=Jas', '#x') === '/drop_the_bass/?sw=1#x', 'the friend parameter leaves the address, other parts stay');
// round trip through the same rule the board uses
{ const nm = 'Roxor Fan'; ok(friendFromSearch('?' + inviteLink('https://x.test', nm).split('?')[1]) === nm, 'round trip'); }
// adding goes through the existing friends code: never twice, never yourself
{
  const p = M.newProfile(NOW); p.name = 'Me';
  ok(M.addFriend(p, friendFromSearch('?friend=Jas')).ok && p.friends.includes('Jas'), 'invite name is added to the profile friends');
  ok(M.addFriend(p, 'jas').reason === 'dup' && M.addFriend(p, 'Me').reason === 'self', 'duplicates and yourself are refused');
}

// ---- boss phases for the codex
{
  let total = 0;
  for (const id of BOSS_IDS) {
    const g = M.bossPhaseGroups(id);
    const raw = BOSS_PHASES[id] || [];
    ok(g.length === new Set(raw.map((p) => p.at)).size, id + ': one group per distinct threshold');
    ok(g.every((x, i) => i === 0 || g[i - 1].at > x.at), id + ': thresholds descending');
    ok(g.reduce((a, x) => a + x.entries.length, 0) === raw.length, id + ': every phase effect is listed');
    ok(g.every((x) => x.entries.every((e) => e.name && e.desc && e.name === BOSS_PHASE_EFFECTS[e.id].name)), id + ': names and descriptions come from BOSS_PHASE_EFFECTS');
    total += g.length;
  }
  ok(total > 0, 'bosses have phases');
  const sil = M.bossPhaseGroups('silence');
  ok(sil.map((x) => x.pct).join() === '100,66,33,9' && sil[1].entries.length === 2 && sil[2].entries.length === 3, 'Dr. Dead Air: four notches, effects share them');
  ok(M.bossPhaseGroups('nobody').length === 0, 'unknown boss: nothing');
}

// ---- muted setting
{
  const p = M.newProfile(NOW); ok(p.settings.muted === false, 'default: not muted');
  const old = M.migrate({ records: 5, settings: { music: 0.5 } }, NOW); ok(old.settings.muted === false, 'old save without the setting: false');
  const m = M.migrate({ records: 5, settings: { muted: true } }, NOW); ok(m.settings.muted === true, 'a stored true is kept');
  const junk = M.migrate({ settings: { muted: 'yes please' } }, NOW); ok(junk.settings.muted === true && typeof junk.settings.muted === 'boolean', 'coerced to a boolean');
  const rt = M.parseSave(M.serialize(m), NOW); ok(rt.settings.muted === true, 'survives save and load');
  const mainSrc = src('js/main.js');
  ok(/AudioFx\.mute\(!!s\.muted\)/.test(mainSrc), 'applySettings drives AudioFx.mute from settings.muted');
}

// ---- reduce motion default for a fresh profile
{
  const mm = (match) => (q) => ({ matches: q.includes('prefers-reduced-motion') && match });
  const a = M.applyFreshDefaults(M.newProfile(NOW), mm(true)); ok(a.settings.reduce === true, 'system prefers reduced motion: fresh profile starts with Reduce motion on');
  const b = M.applyFreshDefaults(M.newProfile(NOW), mm(false)); ok(b.settings.reduce === false, 'no preference: stays off');
  ok(M.applyFreshDefaults(M.newProfile(NOW), null).settings.reduce === false && M.applyFreshDefaults(M.newProfile(NOW), () => { throw new Error('x'); }).settings.reduce === false, 'no matchMedia, or one that throws: stays off');
  // a stored choice is never overridden: loadSave does not call it, and a saved reduce:false survives a load while the system prefers reduced motion
  const store = new Map(); const ls = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  const p = M.newProfile(NOW); p.settings.reduce = false; M.commitSave(ls, p);
  const L = M.loadSave(ls, NOW); ok(L.hadSave && L.profile.settings.reduce === false, 'stored reduce:false is loaded as it is');
  const mainSrc = src('js/main.js'); ok(/if \(!loaded\.hadSave\) freshDefaults\(profile\)/.test(mainSrc), 'boot applies the default only when there was no save');
  const empty = M.loadSave({ getItem: () => null, setItem() {}, removeItem() {} }, NOW); ok(!empty.hadSave, 'no save: hadSave false');
}

// ---- pwa: online state and "ready to play offline"
{
  const winL = {};
  Object.defineProperty(globalThis, 'window', { value: { addEventListener: (t, f) => { (winL[t] = winL[t] || []).push(f); } }, configurable: true });
  const swL = {}, regL = {};
  let online = true;
  const fakeNav = { get onLine() { return online; }, serviceWorker: null };
  Object.defineProperty(globalThis, 'navigator', { value: fakeNav, configurable: true });
  const P = await import('../drop_the_bass/js/pwa.js');
  ok(P.isOnline() === true, 'online by default');
  let seen = []; const off = P.onOnlineChange((v) => seen.push(v));
  online = false; winL.offline.forEach((f) => f()); ok(P.isOnline() === false && seen.join() === 'false', 'offline event: isOnline false and listeners told');
  online = true; winL.online.forEach((f) => f()); ok(seen.join() === 'false,true', 'online event');
  off(); online = false; winL.offline.forEach((f) => f()); ok(seen.length === 2, 'unsubscribed listeners are not called');
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: undefined }, configurable: true }); ok(P.isOnline() === true, 'an unknown onLine counts as online');
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: false }, configurable: true }); ok(P.isOnline() === false, 'only an explicit false is offline');

  // fake service worker: first visit (no controller). The worker finishes installing, activates, claims the page.
  const mkSw = (controller) => {
    const reg = { active: null, waiting: null, installing: null, addEventListener: (t, f) => { (regL[t] = regL[t] || []).push(f); } };
    const sw = { controller, register: async () => reg, addEventListener: (t, f) => { (swL[t] = swL[t] || []).push(f); } };
    return { sw, reg };
  };
  const setup = (controller) => {
    for (const k of Object.keys(swL)) delete swL[k]; for (const k of Object.keys(regL)) delete regL[k];
    const f = mkSw(controller);
    Object.defineProperty(globalThis, 'navigator', { value: { onLine: true, serviceWorker: f.sw }, configurable: true });
    Object.defineProperty(globalThis, 'location', { value: { hostname: 'games.test', search: '' }, configurable: true });
    Object.defineProperty(globalThis, 'document', { value: { addEventListener() {}, hidden: false }, configurable: true });
    return f;
  };
  {
    const f = setup(null); let ready = 0;
    const inst = { state: 'installing', addEventListener: (t, fn) => { inst.fn = fn; } }; f.reg.installing = inst;
    await P.initPwa({ onOfflineReady: () => ready++ });
    ok(ready === 0, 'not ready while the worker is still installing');
    inst.state = 'activated'; inst.fn(); ok(ready === 1, 'first install reaching activated: ready');
    (swL.controllerchange || []).forEach((fn) => fn()); ok(ready === 1, 'controllerchange after that does not fire twice');
  }
  {
    const f = setup(null); let ready = 0; await P.initPwa({ onOfflineReady: () => ready++ });
    (swL.controllerchange || []).forEach((fn) => fn()); ok(ready === 1, 'first visit: the worker claiming the page (controllerchange) means everything is stored');
  }
  {
    const f = setup(null); f.reg.active = { state: 'activated' }; let ready = 0; await P.initPwa({ onOfflineReady: () => ready++ });
    ok(ready === 1, 'already active on a page without a controller: ready');
  }
  {
    const f = setup({ state: 'activated' }); f.reg.active = { state: 'activated' }; let ready = 0, reloads = 0;
    Object.defineProperty(globalThis, 'location', { value: { hostname: 'games.test', search: '', reload() { reloads++; } }, configurable: true });
    await P.initPwa({ onOfflineReady: () => ready++ });
    (swL.controllerchange || []).forEach((fn) => fn());
    ok(ready === 0 && reloads === 1, 'a page that already had a worker (an update) never says "ready", and still reloads on the new worker');
  }
  {
    setup(null); let threw = false; try { await P.initPwa({ onOfflineReady: () => { throw new Error('boom'); } }); (swL.controllerchange || []).forEach((fn) => fn()); } catch (e) { threw = true; }
    ok(!threw, 'a failing callback never breaks the worker flow');
  }
  delete globalThis.window; delete globalThis.document; delete globalThis.location;
}

// ---- no em dashes in what this round added
for (const f of ['js/main.js', 'js/ui_hub.js', 'js/ui_core.js', 'js/pwa.js', 'js/lb.js', 'js/meta.js', 'ui_doodle.css']) ok(!src(f).includes(String.fromCharCode(8212)), f + ': no em dash');
console.log('drop_the_bass r5 hub: ' + n + ' checks passed');
