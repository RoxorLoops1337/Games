// Headless suite for Encore Island: loads every js/*.js in page order against a stubbed DOM,
// then drives state init, world geometry, combat/economy, save round-trip and full draw().
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { harness } from './no_room_for_heroes_lib.mjs';

const t = harness('encore_island');
const tipsOff = () => { const T = EI.FEATS.find(f => f.id === 'tutorial').api; EI.S.feat.tutorial.off = true; T.finish(); };
const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, '..', 'encore_island');
const html = readFileSync(join(dir, 'index.html'), 'utf8');
const order = [...html.matchAll(/<script src="(js\/[^"]+)"/g)].map(m => m[1]);
t.ok(order.length >= 14, 'index.html loads the script chain (' + order.length + ')');
let code = order.map(f => readFileSync(join(dir, f), 'utf8')).join('\n;\n');

const noop = () => {};
const ctx = new Proxy({}, { get(_t, k) {
  if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return () => ({ addColorStop: noop });
  if (k === 'canvas') return { width: 400, height: 800 };
  if (k === 'measureText') return () => ({ width: 10 });
  if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
  return noop;
}, set() { return true; } });
const mkEl = () => new Proxy({ style: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
  addEventListener: noop, appendChild: noop, remove: noop, setAttribute: noop, getContext: () => ctx,
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 800 }), setPointerCapture: noop,
  querySelector: () => mkEl(), querySelectorAll: () => [], innerHTML: '', textContent: '', value: '', width: 400, height: 800, children: [], dataset: {} },
  { get(o, k) { return (k in o) ? o[k] : noop; }, set(o, k, v) { o[k] = v; return true; } });
const store = {};
global.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = '' + v; }, removeItem: k => { delete store[k]; } };
global.requestAnimationFrame = noop;
global.AudioContext = undefined; global.webkitAudioContext = undefined;
global.Image = class { set src(v) { this._s = v; } get src() { return this._s; } get width() { return 64; } get height() { return 64; } };
global.OffscreenCanvas = undefined;
const def = (k, v) => Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
def('navigator', { userAgent: 'node', maxTouchPoints: 0, vibrate: noop });
global.devicePixelRatio = 1;
global.document = new Proxy({ getElementById: () => mkEl(), createElement: () => mkEl(), querySelector: () => mkEl(), querySelectorAll: () => [],
  addEventListener: noop, body: mkEl(), documentElement: mkEl(), hidden: false }, { get(o, k) { return (k in o) ? o[k] : noop; } });
global.window = new Proxy(global, { get(o, k) { return (k in o) ? o[k] : undefined; }, set(o, k, v) { o[k] = v; return true; } });
global.window.addEventListener = noop; global.window.innerWidth = 400; global.window.innerHeight = 800; global.window.__EI_HEADLESS__ = true;
global.setTimeout = () => 0; global.setInterval = () => 0; global.clearTimeout = noop; global.clearInterval = noop;
code = code.replace(/\bconst\b/g, 'var').replace(/\blet\b/g, 'var');
eval('(function(){' + code + '\nglobalThis.__EI=window.EI;})()');
const EI = globalThis.__EI;
t.ok(!!EI, 'EI hooks exposed');

EI.boot();
let S = EI.S;
t.ok(S && S.player, 'state initialised');
EI.tick(0.05); EI.draw(0.016);
t.ok(true, 'title draws');

S.started = true;
for (let i = 0; i < 120; i++) { EI.tick(0.05); EI.draw(0.05); }
t.ok(true, '6s of hub ticks + draws without throwing');

// lands exist and are reachable
t.ok(S.lands && S.lands.length >= 1, 'lands generated');
const l0 = S.lands[0];
S.player.x = l0.g.x; S.player.y = l0.g.y; S.wallet = 1e6;
for (let i = 0; i < 400; i++) { EI.tick(0.05); if (i % 4 === 0) EI.draw(0.05); }
t.ok(isFinite(S.player.x) && isFinite(S.player.y), 'player position stays finite in land 1');
t.ok(isFinite(S.wallet), 'wallet finite');

// save round trip
EI.save();
const snap = EI.serialize();
t.ok(snap && typeof snap === 'object', 'serialize returns object');
EI.initGame(true); EI.loadSave(); 
t.ok(EI.S && EI.S.player, 'loadSave leaves a valid state');
for (let i = 0; i < 40; i++) { EI.tick(0.05); EI.draw(0.05); }
t.ok(true, 'post-load ticks + draws fine');

// ---- gameplay flows: plate purchase, selling, vault, menu taps ----
EI.initGame(true); S = EI.S; S.started = true; tipsOff(); S.wallet = 500;
S.player.x = EI.UPG_POS.speed.x; S.player.y = EI.UPG_POS.speed.y;
for (let i = 0; i < 80; i++) EI.tick(0.05);
t.ok(S.up.speed > 0, 'standing on an upgrade plate buys it');
S.player.helmets = [EI.dropItem ? { k: 1, v: 10 } : { k: 1, v: 10 }];
{ const n0 = S.stats.sold; S.player.helmets = []; for (let i = 0; i < 6; i++) S.player.helmets.push({ k: 1, kind: 'helm', v: 1, val: 10, name: 'x' }); S.player.x = EI.SELL.x + 10; S.player.y = EI.SELL.y + 35; for (let i = 0; i < 60; i++) EI.tick(0.05); t.ok(S.stats.sold >= n0, 'selling does not throw'); }
// menu taps: dock button then a content hit and the close button, using the hit list the renderer builds
const tapAt = (x, y) => { const hs = EI.hits(); for (let i = hs.length - 1; i >= 0; i--) { const h = hs[i]; if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) { h.act(); return true; } } return false; };
EI.draw(0.016); const dock = EI.hits().filter(h => h.y > 700 && h.w < 100);
t.ok(dock.length >= 5, 'dock exposes five tappable buttons (' + dock.length + ')');
tapAt(dock[0].x + 5, dock[0].y + 5); EI.draw(0.016); EI.draw(0.016);
t.ok(S.sheet && S.sheet.id === 'town', 'tapping the first dock button opens Town');
S.wallet = 1e5; EI.draw(0.016); const before = S.pop.length; const sheetHits = EI.hits().filter(h => h.sheet); t.ok(sheetHits.length > 0, 'town sheet has tappable content');
sheetHits[0].act(); t.ok(S.pop.length >= before, 'recruit tap works'); 
for (const id of ['heroes', 'goals', 'perks', 'more']) { EI.openSheet(id); for (let i = 0; i < 3; i++) EI.draw(0.016); t.ok(S.sheet.id === id, id + ' sheet opens and draws'); }
EI.S.modal = { id: 'wheel' }; EI.draw(0.016); EI.S.modal = { id: 'daily' }; EI.draw(0.016); EI.S.modal = null;
t.ok(S.unlockPlate !== undefined, 'unlock plate state exists');

// ---- town: buildings, fan training, persistence ----
EI.initGame(true); S = EI.S; S.started = true; tipsOff(); EI.addLand(); EI.addLand(); S.wallet = 1e9;
const T = EI.TOWN; t.ok(T.length >= 9, 'town has many buildings (' + T.length + ')');
t.ok(EI.recruitCost() >= 1500, 'first recruit is no longer cheap (' + EI.recruitCost() + ')');
S.houses = 3; EI.recruit(); EI.recruit(); const f0 = S.pop[0]; f0.role = 'gather'; S.pop[1].role = 'fight';
const cap0 = EI.fanCarryCap(f0), dmg0 = EI.fanDmgOf(S.pop[1]), tier0 = EI.townTierIdx();
const shed = EI.TOWN_BY.shed, w0 = S.wallet, c0 = EI.townCost(shed); t.ok(EI.buyTown('shed') && S.wallet === w0 - c0, 'buying a building spends its cost');
t.ok(EI.townCost(shed) > c0 * 2, 'next level costs much more'); t.ok(EI.fanCarryCap(f0) === cap0 + 2, 'Loot Shed raises carry');
EI.buyTown('yard'); t.ok(EI.fanDmgOf(S.pop[1]) > dmg0 * 1.1, 'Rehearsal Studio raises fighter damage');
t.ok(S.lands.length === 3 && !EI.buyTown('snack'), 'locked building (needs land 4) refuses'); EI.addLand(); t.ok(EI.buyTown('snack'), 'unlocks with more lands'); t.ok(EI.buyTown('club'), 'Fan Club buys at land 3+');
const tc = EI.fanTrainCost(f0); t.ok(EI.trainFan(f0) && f0.lvl === 1, 'training a fan levels it'); t.ok(EI.fanCarryCap(f0) === cap0 + 3, 'trained collector carries more');
while (EI.trainFan(f0)); t.ok(f0.lvl === EI.fanMaxLvl(), 'fan level capped by the Academy (' + f0.lvl + ')'); EI.buyTown('academy'); t.ok(EI.fanMaxLvl() === 5 && EI.trainFan(f0), 'Academy raises the cap');
S.wallet = 0; t.ok(!EI.buyTown('track') && !EI.trainFan(S.pop[1]), 'cannot buy without coins'); S.wallet = 1e9;
for (let i = 0; i < 5; i++) EI.buyTown('merch'); t.ok(EI.townTierIdx() >= tier0, 'town tier is tracked');
EI.save(); const lv = f0.lvl, shedLv = S.town.shed; EI.initGame(true); t.ok(EI.S.town.shed === shedLv && EI.S.pop.some(f => f.lvl === lv), 'town + fan levels survive save/load');
for (const tab of ['crew', 'build']) { EI.openSheet('town', tab); for (let i = 0; i < 3; i++) EI.draw(0.016); t.ok(EI.S.sheet.tab === tab, 'town ' + tab + ' tab draws'); }

// ---- notifications: merged, capped, time out, and pause behind menus ----
EI.initGame(true); S = EI.S; S.started = true; tipsOff(); S.toasts.length = 0; while (S.cards) EI.pickCard(0); S.xp = 0; S.cards = null;
for (let i = 0; i < 9; i++) S.toasts.push({ txt: i < 4 ? 'same' : 'T' + i, t: 0 });
(S.cards = null, EI.tick(0.05)); t.ok(S.toasts.length <= 5 && S.toasts.filter(x => x.txt === 'same').length === 1, 'toasts merge duplicates and cap the backlog (' + S.toasts.length + ')');
S.sheet = { id: 'more', tab: null, scroll: 0, vel: 0, max: 0, openT: 1 }; const keep = S.toasts.length; for (let i = 0; i < 100; i++) (S.cards = null, EI.tick(0.05)); t.ok(S.toasts.length === keep, 'toasts wait while a menu is open'); S.sheet = null;
for (let i = 0; i < 400; i++) (S.cards = null, EI.tick(0.05)); t.ok(S.toasts.length === 0, 'toasts all clear on their own (' + S.toasts.length + ')');
S.toasts.length = 0; S.toasts.push({ txt: 'away', t: 0, life: 4.5 }); for (let i = 0; i < 70; i++) (S.cards = null, EI.tick(0.05)); t.ok(S.toasts.some(x => x.txt === 'away'), 'long toast outlives a short one'); for (let i = 0; i < 40; i++) (S.cards = null, EI.tick(0.05)); t.ok(!S.toasts.some(x => x.txt === 'away'), 'long toast still expires');

// ---- the BEAT button: timed taps, not auto-kills ----
EI.initGame(true); S = EI.S; S.started = true; tipsOff(); S.sheet = null; S.cards = null; S.hold = false; S.groove = 0; S.beatChain = 0; S.beatLock = 0;
const beatS = 60 / S.bpm;
S.t = beatS * 10; t.ok(EI.beatTap() && S.groove >= 1 && S.beatChain === 1 && EI.onBeatNow(), 'a tap exactly on the beat is PERFECT: fills groove, starts the damage boost');
S.beatLock = 0; S.t = beatS * 10.5; const g0 = S.groove; EI.beatTap(); t.ok(S.beatChain === 0 && S.groove === g0, 'a tap halfway between beats is off-beat: chain resets, no groove');
S.beatLock = 0; S.t = beatS * 12; EI.beatTap(); const gk = S.groove; S.beatLock = 0; S.t = beatS * 12 + 0.01; EI.beatTap(); t.ok(S.beatLock >= 0 && S.groove >= gk, 'taps never remove groove');
S.beatBuffT = 0; t.ok(!EI.onBeatNow(), 'boost ends after a few seconds');
S.groove = 0; const kg = S.groove; EI.killEnemy({ x: 0, y: 0, k: 1, r: 15, boss: false, hp: 0, max: 1 }); t.ok(S.groove > kg && S.groove < 1, 'kills only trickle groove');
S.groove = 0; S.beatChain = 0; for (let i = 0; i < 12; i++) { S.beatLock = 0; S.t = beatS * (20 + i); EI.beatTap(); } t.ok(S.encoreT > 0, 'a run of perfect taps triggers ENCORE');
// desktop: menu content must be clickable at wide screen sizes (hit areas are offset by the sheet region)
EI.openSheet('town', 'build'); EI.draw(0.016); EI.draw(0.016);
{ const hs = EI.hits().filter(h => h.sheet), win = 400; t.ok(hs.length > 0 && hs.every(h => h.x >= 0), 'sheet hit areas are in screen space'); }

// ---- cleanup pass: memoised geometry, one reused next-land plate, quest reroll without timers, Arena spin tickets ----
EI.initGame(true); S = EI.S; S.started = true; tipsOff(); S.sheet = null;
{ const a = EI.unlockSpot(2); t.ok(EI.unlockSpot(2) === a && isFinite(a.x) && isFinite(a.y), 'unlockSpot is memoised per land (the sim asks every frame)'); const e1 = EI.worldExtent(1); t.ok(EI.worldExtent(1) === e1 && e1.x1 > e1.x0, 'worldExtent is memoised per land count'); }
EI.tick(0.05); { const up0 = S.unlockPlate; EI.tick(0.05); t.ok(up0 && S.unlockPlate === up0 && up0.cost === EI.unlockCost(S.lands.length + 1) && up0.paid === S.unlockPaid, 'the next-land plate is one reused object with the right price'); }
{ const q = S.quests[0]; q.prog = q.goal - 1; EI.questEvent(q.kind, 1); t.ok(q.done && S.quests[0] === q, 'a completed island quest stays listed for a moment');
  for (let i = 0; i < 50; i++) EI.tick(0.05); t.ok(S.quests[0] !== q && S.quests.length === 3 && S.quests.every(x => !x.done), 'then a fresh quest takes its place (no timers involved)'); }
{ const q = S.quests[1]; q.prog = q.goal - 1; EI.questEvent(q.kind, 1); t.ok(q.done, 'quest completed right before a save'); EI.save(); EI.initGame(true); S = EI.S;
  t.ok(S.quests.length === 3 && S.quests.every(x => !x.done), 'a quest finished right before saving is rerolled on load instead of sticking'); }
S.started = true; tipsOff(); S.gems = 0; S.spinFree = 2;
t.ok(!!EI.spinWheel() && S.spinFree === 1, 'an Arena spin ticket pays for a wheel spin when there are no gems');
S.spinFree = 0; S.gems = 0; t.ok(EI.spinWheel() === null, 'no ticket and no gems: the wheel refuses');
S.spinFree = 3; EI.save(); EI.initGame(true); t.ok(EI.S.spinFree === 3, 'spin tickets survive a reload');
EI.S.started = true; EI.prestige(); t.ok(EI.S.spinFree === 3, 'spin tickets survive an Encore Tour');

// ---- render pass: cached gradients, derived biome colours, the baked minimap, table-driven wheel and daily gifts ----
S = EI.S; S.started = true; tipsOff(); S.sheet = null; S.modal = null;
{ const g1 = EI.vgrad(20, '#000000', '#ffffff'); t.ok(EI.vgrad(20, '#000000', '#ffffff') === g1 && EI.vgrad(21, '#000000', '#ffffff') !== g1 && EI.vgrad(20, '#000001', '#ffffff') !== g1, 'vertical gradients are cached per height and colour pair');
  t.ok(EI.hgrad(230, '#ff9ac8', '#9af0b4') === EI.hgrad(230, '#ff9ac8', '#9af0b4') && EI.pgrad(42, '#7a5cd8', '#3a2a8a') === EI.pgrad(42, '#7a5cd8', '#3a2a8a') && EI.ggrad(2, 80, '#ffd678') === EI.ggrad(2, 80, '#ffd678'), 'horizontal, disc and glow gradients too'); }
{ const B = EI.BIOMES[2], P = EI.biomePal(B); t.ok(P === EI.biomePal(B) && /^rgb\(/.test(P.cliffDark) && /^rgba\(/.test(P.edge) && /^rgba\(/.test(P.mist), 'derived biome colours are built once per biome'); }
EI.draw(0.016); { const n = S.lands.length; t.ok(EI.MINI.n === n && EI.MINI.sc > 0 && isFinite(EI.MINI.mx), 'the minimap chart is baked for the current land count'); EI.addLand(); EI.draw(0.016); t.ok(EI.MINI.n === n + 1, 'and re-baked when a land opens'); }
{ S.gems = 2000; S.spinFree = 0; const seen = {}; for (let i = 0; i < 80; i++) { const w = EI.spinWheel(); seen[EI.WHEEL[w.idx].id] = w.msg; }
  t.ok(Object.keys(seen).length >= 6 && Object.values(seen).every(m => typeof m === 'string' && m.length > 0), 'every wheel segment pays out through its table entry (' + Object.keys(seen).length + ' of ' + EI.WHEEL.length + ' kinds seen)'); }
{ const RAR = [{ w: 0 }, { w: 1 }, { w: 0 }]; let all1 = true; for (let i = 0; i < 20; i++) if (EI.pickWeighted(RAR) !== 1) all1 = false; t.ok(all1, 'weighted pick never lands on a zero-weight entry'); }
{ S.login = { day: 0, last: '' }; const g0 = S.gems, w0 = S.wallet; let ok = true; for (let d = 0; d < 7; d++) { S.login.last = ''; if (!EI.claimLogin()) ok = false; }
  t.ok(ok && S.login.day === 7 && S.gems > g0 && S.wallet > w0, 'the 7-day gift cycle claims every day through its table'); }

// ---- the big home island: zones, fixtures and the Backstage greenroom ----
EI.initGame(true); S = EI.S; S.started = true; tipsOff(); S.sheet = null; S.modal = null;
{ const K = EI.HUB_KEEP, inside = K.every(o => EI.walkable(o.x, o.y, 0) && Math.hypot(o.x, o.y) + 60 < EI.radiusAt(EI.HUB_GEO, Math.atan2(o.y, o.x)));
  let md = 1e9; for (let i = 0; i < K.length; i++) for (let j = i + 1; j < K.length; j++) md = Math.min(md, Math.hypot(K[i].x - K[j].x, K[i].y - K[j].y));
  t.ok(EI.HUB.r >= 600 && inside, 'every plaza fixture stands well inside the bigger home island (r ' + EI.HUB.r + ')'); t.ok(md >= 110, 'fixtures keep at least 110 px apart (closest ' + Math.round(md) + ')'); }
{ const sg = EI.HUBSIGNS; let clear = true; for (const s of sg) for (const o of EI.HUB_KEEP) if (o !== EI.HUB_KEEP[0] && Math.hypot(s.x - o.x, s.y - o.y) < 90) clear = false;
  t.ok(sg.length === 8 && clear && EI.HUBLAMPS.length >= 12, 'eight signposts sit clear of the fixtures and the lamps ring the plaza (' + EI.HUBLAMPS.length + ')'); }
{ const T = EI.TERRACE, onArc = Object.values(EI.UPG_POS).every(p => Math.abs(Math.hypot(p.x - T.x, p.y - T.y) - T.r) < 2 && p.y > 250); t.ok(onArc, 'the five hero plates sit on the Training Terrace arc south of the stage'); }
S.wallet = 1e12; const H = EI.HATCH;
while (S.lands.length < EI.BACKSTAGE_SHOW - 1) EI.addLand();
S.player.x = H.x; S.player.y = H.y; S.player.vx = S.player.vy = 0; EI.tick(0.05); t.ok(S.bsPlate.cost === 0 && S.bsPlate.paid === 0, 'the stairway stays hidden before ' + EI.BACKSTAGE_SHOW + ' lands');
EI.addLand(); EI.tick(0.05); t.ok(S.bsPlate.cost > 0 && S.bsPlate.paid === 0 && !S.bsPlate.built, 'at ' + EI.BACKSTAGE_SHOW + ' lands it shows a price but cannot be paid yet');
while (S.lands.length < EI.BACKSTAGE_OPEN) EI.addLand();
for (let i = 0; i < 400 && !S.bsPlate.built; i++) EI.tick(0.05);
t.ok(S.bsPlate.built && S.place === 'hub', 'from ' + EI.BACKSTAGE_OPEN + ' lands the plate takes coins and opens the Backstage');
EI.draw(0.016);
for (let i = 0; i < 40 && S.place !== 'backstage'; i++) EI.tick(0.05);
t.ok(S.place === 'backstage' && EI.inBackstage(S.player.x, S.player.y), 'standing still on the open stairs takes the hero down into the greenroom');
t.ok(EI.walkable(S.player.x, S.player.y, S.lands.length) && !EI.walkable(EI.BACKSTAGE.x - 60, S.player.y, S.lands.length) && !EI.walkable(S.player.x, EI.BACKSTAGE.y + 20, S.lands.length), 'the room floor is walkable, its walls are not');
t.ok(EI.guideTarget() === null, 'no guide arrow down there');
let drew = true; try { for (let i = 0; i < 5; i++) { EI.tick(0.05); EI.draw(0.016); } } catch (e) { drew = false; console.log(e); } t.ok(drew, 'draw() renders the Backstage without throwing');
{ S.pop.push({ role: 'fight', x: 0, y: 0, ph: 0, cd: 1, mv: 0, carry: [], art: 'fan', face: 1 }); for (let i = 0; i < 10; i++) EI.tick(0.05); const f = S.pop[S.pop.length - 1]; t.ok(Math.abs(f.x) < 400 && Math.abs(f.y) < 400 && !EI.inBackstage(f.x, f.y), 'fighter fans wait up on the stage instead of following into the room'); S.pop.pop(); }
EI.save(); EI.initGame(true); S = EI.S; S.started = true; tipsOff(); t.ok(S.place === 'backstage' && S.bsPlate.built && EI.inBackstage(S.player.x, S.player.y), 'a save made in the Backstage reloads there with the stairway still open');
{ const dp = EI.bsDoorPos(1), doors = EI.bsDoors(); t.ok(doors.length === 3 && doors.every(d => d.unlocked() === false && typeof d.hint === 'string'), 'the three doorways show locked placeholders until a feature claims them');
  let entered = 0; EI.regDoor({ id: 'test_door', name: 'Test', icon: 'star', hint: 'test', unlocked: () => true, enter: () => { entered++; } });
  t.ok(EI.bsDoors()[0].id === 'test_door' && EI.bsDoors().length === 3, 'a registered door takes the first frame and the placeholders fill the rest');
  S.player.x = EI.bsDoorPos(0).x; S.player.y = EI.bsDoorPos(0).y + 30; S.player.vx = S.player.vy = 0; for (let i = 0; i < 60 && !entered; i++) EI.tick(0.05); t.ok(entered === 1, 'standing still in an unlocked doorway enters it once');
  EI.DOORS.length = 0; S.player.x = dp.x; S.player.y = dp.y + 30; for (let i = 0; i < 60; i++) EI.tick(0.05); t.ok(S.place === 'backstage' && entered === 1, 'a locked doorway just says so and keeps the hero in the room'); }
S.player.x = EI.BS_STAIRS.x; S.player.y = EI.BS_STAIRS.y; S.player.vx = S.player.vy = 0; for (let i = 0; i < 60 && S.place === 'backstage'; i++) EI.tick(0.05);
t.ok(S.place === 'hub' && Math.hypot(S.player.x - H.x, S.player.y - H.y) < 120 && EI.walkable(S.player.x, S.player.y, S.lands.length), 'the EXIT stairs bring the hero back up beside the stairway');
for (let i = 0; i < 40 && S.place !== 'backstage'; i++) EI.tick(0.05); if (S.place !== 'backstage') EI.enterBackstage();
S.player.x = EI.STAGE.x; S.player.y = EI.STAGE.y; EI.tick(0.05); t.ok(S.place === 'hub', 'anything that moves the hero out of the room (fainting, a warp, a tour) leaves the Backstage cleanly');
EI.enterBackstage(); EI.prestige(); t.ok(EI.S.place === 'hub' && !EI.S.bsPlate.built, 'an Encore Tour resets the Backstage with the rest of the run');

t.done();
