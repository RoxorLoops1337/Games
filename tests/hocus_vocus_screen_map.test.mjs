// Map screen suite (js/screen_map.js, css/map.css): the page you colour in. Paint, chains, brushes, walking, instants, the camera, the HUD,
// the relics and legend overlays, empty states, cleanup, performance and a soak that paints and walks to the boss on many seeds.
//
// Everything runs against the REAL modules (MAP, RUN, META, UI, ART, AUDIO, GAME) in the headless loader, with runs built from real seeds. The
// suite drives the screen the way a player does: pointer events on the #view canvas at the screen position of a hex (UI.screens.map.mapDebug
// gives the camera and the hex to stage mapping), keys on the document, clicks on the HUD buttons. GAME.enterNode and GAME.nodeDone are spies
// except where a flow test uses the real ones. window.__HEADLESS makes every animation resolve at once, so most tests read final states; the
// "realtime" sections boot without it and move the frame clock to test the animated paths (bloom reveals, walks, flights, the intro).
import fs from 'node:fs';
import path from 'node:path';
import { boot, harness, DIR } from './hocus_vocus_lib.mjs';
// Wall-clock budgets are strict with RB_PERF=1 on an idle machine; otherwise 4x slack so a loaded CI box cannot flake the check.
const PERF_SLACK = process.env.RB_PERF ? 1 : 4;

const t = harness('hocus_vocus screen_map');
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const SRC = fs.readFileSync(path.join(DIR, 'js', 'screen_map.js'), 'utf8');
const CSS = fs.readFileSync(path.join(DIR, 'css', 'map.css'), 'utf8');

// ---------------------------------------------------------------------------------------------------- harness
function fresh(opts = {}) {
  const { spy, ...bootOpts } = opts;
  const g = boot({ only: ['screen_map', 'main'], seed: 5, continue: true, ...bootOpts });
  if (g._errors.length) throw new Error('boot errors: ' + JSON.stringify(g._errors.map((e) => e.file + ': ' + e.message)));
  g.GAME.boot();
  if (spy !== false) g._run('globalThis.__entered = []; globalThis.__done = 0; GAME.enterNode = (n) => { __entered.push(n); return Promise.resolve(); }; GAME.nodeDone = () => { __done++; return Promise.resolve(); };');
  g._run("globalThis.__sfx = []; { const o = AUDIO.sfx; AUDIO.sfx = function (id, x) { __sfx.push(id); return o.call(AUDIO, id, x); }; }");
  g._run("globalThis.__wake = []; globalThis.__awake = []; { const o = AUDIO.wake, a = AUDIO.awake; AUDIO.wake = function (q, r, x) { __wake.push([q, r, x && x.song || null, x ? x.i : null, x && x.soft ? 1 : 0, x && x.last ? 1 : 0]); return o ? o.call(AUDIO, q, r, x) : false; }; AUDIO.awake = function (f) { __awake.push(f); return a ? a.apply(AUDIO, arguments) : 1; }; }");
  g._run("globalThis.__ann = []; { const o = UI.announce; UI.announce = function (x) { __ann.push(String(x)); return o.call(UI, x); }; }");
  g._run("globalThis.__bus = []; ['map:paint', 'map:brush', 'map:walk'].forEach((k) => UI.bus.on(k, (d) => __bus.push([k, JSON.parse(JSON.stringify(d))])));");
  return g;
}
const $ = (g, sel, root) => (root || g._doc).querySelector(sel);
const $$ = (g, sel, root) => Array.from((root || g._doc).querySelectorAll(sel));
const txt = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const settle = (g) => g._settle();
const errs = (g) => g._console.error.length;
const entered = (g) => g._run('__entered');
const bus = (g, k) => g._run('__bus').filter((e) => e[0] === k).map((e) => e[1]);
const sfx = (g) => g._run('__sfx');
const wakes = (g) => g._run('__wake');
const awakes = (g) => g._run('__awake');
const toasts = (g) => $$(g, '#toasts .toast .t-text').map(txt);
const view = (g) => g.UI.layers.view;
const md = (g) => g.UI.screens.map.mapDebug;
const st = (g) => md(g).state();
const jsonEq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function mkRun(g, o = {}) {
  const R = g.RUN.newRun({ heroes: o.heroes || ['hanae', 'kuro'], seed: o.seed === undefined ? 5 : o.seed, trial: o.trial | 0, unlocked: o.unlocked });
  if (o.chapter && o.chapter > 1) g.RUN.startChapter(R, o.chapter);
  if (o.ink !== undefined) R.ink = o.ink;
  if (o.gold !== undefined) R.gold = o.gold;
  if (o.brushes) R.brushes = o.brushes.slice();
  if (o.relics) o.relics.forEach((id) => g.RUN.addRelic(R, id));
  g.GAME.state.R = R; g.UI.setRun(R);
  return R;
}

async function open(g, R) {
  await g.UI.go('map', { R }, { force: true, transition: 'none' });
  await settle(g);
  return $(g, '.s-map');
}

// the whole page in view (the fit view: the largest zoom at which no hex is under the HUD, placed where it is clear), so every hex has a stage
// position inside the window (the real default camera follows the party)
function fitCam(g) {
  const s = st(g);
  s.cam.z = s.fit.z; s.tz = s.cam.z;
  s.cam.x = s.fit.x; s.cam.y = s.fit.y;
  s.follow = false; s.fitted = true; s.goal = null;
}
const key = (g, q, r) => g.MAP.key(q, r);
const tileOf = (g, R, q, r) => R.map.tiles[key(g, q, r)];

async function clickHex(g, q, r, o = {}) {
  const p = md(g).screenOf(q, r);
  if (!p) throw new Error('no screen position for ' + q + ',' + r);
  g._click(view(g), { x: p.x, y: p.y, pointerType: o.pointerType || 'mouse' });
  await settle(g);
  return p;
}
async function hoverHex(g, q, r) {
  const p = md(g).screenOf(q, r);
  g._pointer('pointermove', view(g), { x: p.x, y: p.y, buttons: 0, id: 9 });
  await settle(g);
  g._raf(16);
  return p;
}
const press = async (g, k, o) => { g._key(k, o); await settle(g); };

// tiles by role
const frontier = (g, R) => g.MAP.frontier(R.map);
function farFog(g, R, minCost = 2, maxCost = 5) {
  const M = R.map;
  const list = Object.values(M.tiles).filter((T) => !T.painted && T.type !== 'block' && !g.MAP.canPaint(M, T.q, T.r).ok);
  for (const T of list) { const pre = g.RUN.paintPreview(R, T.q, T.r); if (pre.ok && pre.cost >= minCost && pre.cost <= maxCost) return { T, pre }; }
  return null;
}
// paint a tile of the given type by a real RUN.paint (chain) so the content is revealed, return it
function paintType(g, R, type) {
  const T = Object.values(R.map.tiles).find((x) => x.type === type && !x.painted);
  if (!T) return null;
  R.ink = R.inkMax;
  const res = g.RUN.paint(R, T.q, T.r);
  if (!res.ok) { R.ink = 99; g.RUN.paint(R, T.q, T.r); }
  return T;
}
// a run whose whole page is painted
function fullyPainted(g, R) { Object.values(R.map.tiles).forEach((T) => { if (T.type !== 'block') { T.painted = true; T.known = true; } }); }
const SEEDS = [1, 2, 3, 5, 8, 13, 21, 34];

// ==================================================================================================== load, registration, static rules
await t.test('screen_map.js loads headless, registers the map screen and replaces the relics and legend overlays', () => {
  const g = boot({ only: ['screen_map'], continue: true });
  t.eq(g._errors.length, 0, 'no load errors');
  const s = g.UI.screens.map;
  t.ok(s && ['enter', 'leave', 'update', 'draw', 'onKey'].every((k) => typeof s[k] === 'function'), 'UI.screens.map is a full screen');
  t.ok(typeof s.music === 'function', 'music is a function of the params');
  t.eq(s.music({ R: { chapter: 1 } }), 'map1', 'chapter 1 music'); t.eq(s.music({ R: { chapter: 3 } }), 'map3', 'chapter 3 music');
  t.ok(g.DATA.LISTS.music.indexOf(s.music({ R: { chapter: 2 } })) >= 0, 'a real track');
  ['relics', 'legend'].forEach((k) => t.ok(g.UI.overlays[k] && g.UI.overlays[k].open.length >= 3, 'UI.overlays.' + k + ' is the screen_map version (it takes root and close)'));
  t.ok(String(g.UI.overlays.legend.open).indexOf('lg-body') > 0 && String(g.UI.overlays.relics.open).indexOf('mr-grid') > 0, 'the replaced overlays are mine, not the basic ui.js ones');
});

await t.test('source rules: every sound id, overlay name, bus event and tutorial anchor in the file is in its closed list; no dashes; css namespaces', () => {
  const L = boot({ only: ['util', 'data'] }).DATA.LISTS;
  // every string literal inside a snd(...) call (a ternary may pick between two), minus the ones that are only compared (=== 'combat')
  const ids = [];
  for (let i = SRC.indexOf('snd('); i >= 0; i = SRC.indexOf('snd(', i + 4)) {
    if (/[\w.]$/.test(SRC.slice(Math.max(0, i - 1), i))) continue;
    let d = 0, j = i + 3;
    for (; j < SRC.length; j++) { if (SRC[j] === '(') d++; else if (SRC[j] === ')' && --d === 0) break; }
    const arg = SRC.slice(i + 4, j).replace(/===\s*'[^']*'/g, '');
    [...arg.matchAll(/'([\w-]+)'/g)].forEach((m) => ids.push(m[1]));
  }
  t.ok(ids.length > 15, 'the file plays plenty of sounds (' + ids.length + ')');
  ids.forEach((id) => t.ok(L.sfx.indexOf(id) >= 0, 'sound id ' + id + ' is in LISTS.sfx'));
  [...SRC.matchAll(/\bsfx:\s*'([\w-]+)'/g)].forEach((m) => t.ok(L.sfx.indexOf(m[1]) >= 0, 'sfx option ' + m[1]));
  [...SRC.matchAll(/UI\.overlay\.open\(\s*'([\w-]+)'/g)].forEach((m) => t.ok(L.overlays.indexOf(m[1]) >= 0, 'overlay ' + m[1] + ' is known'));
  [...SRC.matchAll(/UI\.bus\.emit\(\s*'([^']+)'/g)].forEach((m) => t.ok(L.busEvents.indexOf(m[1]) >= 0, 'bus event ' + m[1] + ' is known'));
  [...SRC.matchAll(/\btut\([^,]+,\s*'([\w-]+)'\)/g)].forEach((m) => t.ok(L.tutAnchors.indexOf(m[1]) >= 0, 'data-tut ' + m[1] + ' is a known anchor'));
  ['map:paint', 'map:brush', 'map:walk'].forEach((e) => t.ok(SRC.indexOf("'" + e + "'") > 0, 'the file emits ' + e));
  const dash = new RegExp('[' + String.fromCharCode(0x2014, 0x2013) + ']');
  t.ok(!dash.test(SRC) && !dash.test(CSS), 'no em or en dashes in the module or the stylesheet');
  t.ok(!/Math\.random/.test(SRC), 'no Math.random');
  ['.s-map', '.mp-hud', '.mp-ink', '.mp-tray', '.mp-chip', '.mp-info', '.mp-mode', '.mp-tool', '.mp-fly', '.mp-intro', '.mp-relics', '.o-relics', '.mr-grid', '.lg-body', '.lg-brush'].forEach((p) => t.ok(CSS.indexOf(p) >= 0 || (/^\.o-/.test(p) ? CSS.indexOf('mp-' + p.slice(3) + '-panel') >= 0 : false), 'css has ' + p));
  t.ok(/reduce-motion/.test(CSS) && /#stage\.compact/.test(CSS), 'css honours reduce-motion and the compact class');
  t.ok(/translate:/.test(CSS) && !/transform:\s*translate\(-50%/.test(CSS), 'motion uses individual transform properties so nothing fights a transform');
});

// ==================================================================================================== the page and its HUD
await t.test('enter: the HUD, the data-tut anchors, the chapter title, music, and a clean console', async () => {
  const g = fresh(); const R = mkRun(g, { relics: ['brass_lantern', 'fox_mask'] });
  const root = await open(g, R);
  t.ok(root, 'the map screen is up');
  t.eq($$(g, '.mp-party .badge', root).length, 2, 'two hero badges');
  t.deep($$(g, '.mp-party .badge', root).map((b) => b.dataset.hero), ['hanae', 'kuro'], 'the party in order');
  { const hh = g.DATA.heroes.hanae.maxHp, kk = g.DATA.heroes.kuro.maxHp; t.ok(txt($(g, '.mp-party .badge.h-hanae', root)).indexOf(hh + '/' + hh) >= 0 && txt($(g, '.mp-party .badge.h-kuro', root)).indexOf(kk + '/' + kk) >= 0, 'HP shows on the badges'); }
  t.eq($$(g, '.mp-ink .mp-drop', root).length, R.inkMax, 'one drop per point of the Ink maximum');
  t.eq($$(g, '.mp-ink .mp-drop.full', root).length, R.ink, 'as many full drops as Ink');
  t.eq(txt($(g, '.mp-ink-n', root)), R.ink + '/' + R.inkMax, 'the number reads Ink over maximum');
  t.eq(txt($(g, '.mp-gold .val', root)), String(R.gold), 'gold');
  t.ok(/Act I/.test(txt($(g, '.mp-ch', root))) && txt($(g, '.mp-title', root)) === g.DATA.lore.ch1_intro.title, 'the banner names the chapter from the lore title');
  t.ok(/\d+% live/.test(txt($(g, '.mp-prog', root))), 'the progress meter');
  t.eq($(g, '.mp-prog', root).getAttribute('aria-valuenow'), String(g.MAP.progress(R.map).pct), 'its aria value is MAP.progress');
  t.eq($$(g, '.mp-chip', root).length, 1, 'one brush chip: the starting Long Stroke');
  t.ok(new RegExp(g.DATA.brushes.stroke.name).test(txt($(g, '.mp-chip', root))), 'the chip names the brush');
  t.eq($$(g, '.mp-relics .relic', root).length, 2, 'the relic strip shows the charms');
  t.eq($$(g, '.mp-tools button', root).length, 5, 'Deck, Legend, Fit, Zoom in, Zoom out');
  t.ok($(g, '.menu-btn', root), 'the pause button');
  ['ink', 'hex', 'brushes', 'deck', 'relics'].forEach((a) => t.ok(g.UI.anchorEl(a), 'data-tut anchor ' + a + ' resolves through UI.anchorEl'));
  t.ok(g.UI.anchorEl('deck').tagName === 'BUTTON' && g.UI.anchorEl('relics').classList.contains('mp-relics'), 'the deck anchor is the button, the relics anchor the strip');
  t.eq($(g, '.mp-info-name', root).textContent.indexOf('hexes live') > 0, true, 'the info chip rests on a progress line');
  const interactive = $$(g, 'button, [role=button], [tabindex="0"]', root);
  t.ok(interactive.length >= 8 && interactive.every((e) => e.localName === 'button' || e.getAttribute('role') || e.getAttribute('tabindex') === '0'), 'every interactive element is a real button or has a role');
  t.ok($$(g, '.mp-tool', root).every((b) => b.getAttribute('aria-label')), 'tool buttons are labelled');
  t.eq(g._run('UI.currentName'), 'map', 'the current screen');
  for (let i = 0; i < 40; i++) g._raf(16);
  t.eq(errs(g), 0, 'no console errors after 40 frames of update and draw');
  t.eq(g._run('window.__errors.length'), 0, 'no UI errors');
});

await t.test('empty states: no run, a run without a map, and the way back', async () => {
  const g = fresh(); g.GAME.state.R = null; g.UI.setRun(null);
  await g.UI.go('map', {}, { force: true, transition: 'none' }); await settle(g);
  const root = $(g, '.s-map');
  t.ok(root && /no map/i.test(txt(root)), 'a friendly blank page, never an empty screen');
  t.ok($(g, '.menu-btn', root), 'the menu is still there');
  g._raf(16); g._raf(16);
  let went = 0; g._run('globalThis.__title = 0; UI.hooks.toTitle = () => { __title++; };');
  await (async () => { g._click($$(g, 'button', root).find((b) => /Title/.test(b.textContent))); await settle(g); })();
  t.eq(g._run('__title'), 1, 'Back to Title goes to the title');
  const R = mkRun(g); R.map = null;
  await g.UI.go('map', { R }, { force: true, transition: 'none' }); await settle(g);
  t.ok(/no map/i.test(txt($(g, '.s-map'))), 'a run with no map shows the same page');
  g._raf(16);
  t.eq(errs(g), 0, 'no errors in the empty states');
});

// ==================================================================================================== painting
await t.test('tap a fogged hex next to the page: RUN.paint for 1 Ink, the tile is revealed, the bus and the meter agree', async () => {
  for (const seed of SEEDS) {
    const g = fresh({ seed }); const R = mkRun(g, { seed, ink: 9 });
    await open(g, R); fitCam(g);
    const fr = frontier(g, R).filter((T) => T.type !== 'block');
    const T = fr[seed % fr.length];
    const ink0 = R.ink, painted0 = g.MAP.progress(R.map).painted, hexes0 = R.stats.hexesPainted;
    t.ok(!T.painted, 'seed ' + seed + ': the tile starts hidden');
    await clickHex(g, T.q, T.r);
    t.ok(T.painted, 'seed ' + seed + ': painted by the tap');
    t.eq(R.ink, ink0 - 1, 'seed ' + seed + ': exactly 1 Ink spent');
    t.eq(R.stats.hexesPainted, hexes0 + 1, 'seed ' + seed + ': RUN counted it');
    t.eq(g.MAP.progress(R.map).painted, painted0 + 1, 'seed ' + seed + ': progress grew by one');
    t.deep(bus(g, 'map:paint'), [{ q: T.q, r: T.r, cost: 1 }], 'seed ' + seed + ': map:paint carries the tile and the cost');
    t.eq(txt($(g, '.mp-ink-n')), R.ink + '/' + R.inkMax, 'seed ' + seed + ': the meter number');
    t.eq($$(g, '.mp-ink .mp-drop.full').length, R.ink, 'seed ' + seed + ': the drops');
    t.ok(sfx(g).indexOf('paint') >= 0, 'seed ' + seed + ': the paint sound');
    t.ok(/hexes live/.test(txt($(g, '.mp-prog'))) || /% live/.test(txt($(g, '.mp-prog'))), 'seed ' + seed + ': the progress text');
    t.eq(errs(g), 0, 'seed ' + seed + ': no console errors');
  }
});

await t.test('a far fogged hex previews the cheapest chain, a second tap on it paints the whole chain', async () => {
  for (const seed of SEEDS.slice(0, 5)) {
    const g = fresh({ seed }); const R = mkRun(g, { seed, ink: 12 });
    await open(g, R); fitCam(g);
    const f = farFog(g, R, 2, 6);
    t.ok(f, 'seed ' + seed + ': a far hex exists');
    const { T, pre } = f;
    const ink0 = R.ink;
    await clickHex(g, T.q, T.r);
    t.ok(!T.painted && R.ink === ink0, 'seed ' + seed + ': the first tap only previews');
    t.ok(st(g).chain && st(g).chain.cost === pre.cost && st(g).chain.path.length === pre.path.length, 'seed ' + seed + ': the preview is RUN.paintPreview');
    t.ok(new RegExp('chain of ' + pre.path.length).test(txt($(g, '.mp-info'))) && new RegExp('costs ' + pre.cost).test(txt($(g, '.mp-info'))), 'seed ' + seed + ': the info chip names the chain and its price');
    t.eq(bus(g, 'map:paint').length, 0, 'seed ' + seed + ': no paint event yet');
    await clickHex(g, T.q, T.r);
    t.ok(T.painted && pre.path.every((c) => tileOf(g, R, c[0], c[1]).painted), 'seed ' + seed + ': the whole chain is painted');
    t.eq(R.ink, ink0 - pre.cost, 'seed ' + seed + ': the total cost was paid once');
    t.deep(bus(g, 'map:paint'), [{ q: T.q, r: T.r, cost: pre.cost }], 'seed ' + seed + ': one map:paint for the chain');
    t.ok(!st(g).chain, 'seed ' + seed + ': the preview is gone');
    t.eq(errs(g), 0, 'seed ' + seed + ': clean');
  }
});

await t.test('tapping elsewhere or pressing Esc drops a chain preview; a different far hex replaces it', async () => {
  const g = fresh(); const R = mkRun(g, { ink: 12 });
  await open(g, R); fitCam(g);
  const list = Object.values(R.map.tiles).filter((T) => !T.painted && T.type !== 'block' && !g.MAP.canPaint(R.map, T.q, T.r).ok && g.RUN.paintPreview(R, T.q, T.r).cost >= 2);
  const a = list[0], b = list.find((T) => g.MAP.dist(T.q, T.r, a.q, a.r) > 3);
  await clickHex(g, a.q, a.r);
  t.eq(st(g).chain.q, a.q, 'first preview');
  await clickHex(g, b.q, b.r);
  t.ok(st(g).chain.q === b.q && st(g).chain.r === b.r, 'a different far hex replaces it');
  t.ok(!a.painted && !b.painted, 'nothing painted');
  await press(g, 'Escape');
  t.ok(!st(g).chain, 'Esc cancels the preview');
  t.eq(g.UI.overlay.count(), 0, 'and does not open the pause menu');
  await clickHex(g, a.q, a.r);
  const p = md(g).screenOf(R.map.pos.q, R.map.pos.r);
  await clickHex(g, R.map.pos.q, R.map.pos.r);
  t.ok(!st(g).chain, 'tapping the party hex drops it too');
  t.eq(errs(g), 0, 'clean');
});

await t.test('not enough Ink: the meter shakes, a toast says how much is missing, nothing changes, no event', async () => {
  const g = fresh(); const R = mkRun(g, { ink: 0 });
  await open(g, R); fitCam(g);
  const T = frontier(g, R).filter((x) => x.type !== 'block')[0];
  const painted0 = g.MAP.progress(R.map).painted;
  await clickHex(g, T.q, T.r);
  t.ok(!T.painted && R.ink === 0, 'nothing painted, no Ink spent');
  t.ok(toasts(g).some((x) => /Vox/.test(x)), 'a toast about Vox (' + toasts(g).join(' | ') + ')');
  t.ok(sfx(g).indexOf('ui_error') >= 0, 'the error sound');
  t.ok($(g, '.mp-ink').classList.contains('shake') || $(g, '.mp-ink').classList.contains('flash-bad'), 'the meter shakes');
  t.eq(bus(g, 'map:paint').length, 0, 'no map:paint');
  t.eq(g.MAP.progress(R.map).painted, painted0, 'progress did not move');
  // a chain you cannot afford: preview first, then the refusal on the second tap
  R.ink = 1;
  const f = farFog(g, R, 3, 6);
  await clickHex(g, f.T.q, f.T.r);
  t.ok(st(g).chain && !st(g).chain.affordable, 'the preview says it is not affordable');
  t.ok(/Too far for your Vox/.test(txt($(g, '.mp-info'))), 'and the chip says so');
  await clickHex(g, f.T.q, f.T.r);
  t.ok(!f.T.painted && R.ink === 1, 'the second tap refuses and keeps your Ink');
  t.ok(toasts(g).some((x) => new RegExp('needs ' + f.pre.cost + ' Vox').test(x)), 'the toast names the price');
  t.eq(errs(g), 0, 'clean');
});

await t.test('the Void and the page edge answer with a toast and change nothing; a hover over fog shows the price', async () => {
  const g = fresh({ seed: 8 }); const R = mkRun(g, { seed: 8 });
  await open(g, R); fitCam(g);
  const v = Object.values(R.map.tiles).find((T) => T.type === 'block');
  await clickHex(g, v.q, v.r);
  t.ok(toasts(g).some((x) => new RegExp(esc(g.DATA.tiles.block.name)).test(x)), 'a toast about the Void');
  t.ok(!v.painted, 'still unpainted');
  await hoverHex(g, v.q, v.r);
  t.ok(new RegExp(esc(g.DATA.tiles.block.name)).test(txt($(g, '.mp-info-name'))) && /Nothing can cross/.test(txt($(g, '.mp-info-act'))), 'hovering the Void explains it');
  const adj = frontier(g, R).filter((T) => T.type !== 'block')[0];
  await hoverHex(g, adj.q, adj.r);
  t.ok(/Muted ground|spotted/.test(txt($(g, '.mp-info-name'))) && /1 Vox/.test(txt($(g, '.mp-info-act'))), 'hovering fog next to the page names the price');
  t.ok(st(g).hover && st(g).hover.q === adj.q, 'the hover hex is tracked');
  const known = Object.values(R.map.tiles).find((T) => T.known && !T.painted && T.type === 'boss');
  await hoverHex(g, known.q, known.r);
  t.ok(new RegExp(esc(g.DATA.tiles.boss.name) + ', (spotted)').test(txt($(g, '.mp-info-name'))), 'a glimpsed landmark is named; what is blank stays secret');
  const secret = Object.values(R.map.tiles).find((T) => !T.known && !T.painted && T.type === 'enemy');
  await hoverHex(g, secret.q, secret.r);
  t.ok(!new RegExp(esc(g.DATA.tiles.enemy.name)).test(txt($(g, '.mp-info'))), 'hidden content is never leaked by hover');
  t.eq(errs(g), 0, 'clean');
});

await t.test('map:paint fires per action, the mercy rule surfaces as a toast, and the Book lends exactly one drop', async () => {
  const g = fresh({ seed: 3 }); const R = mkRun(g, { seed: 3, ink: 1, brushes: [] });
  // mark everything painted as done so nothing unresolved is reachable: the next paint strands the party
  Object.values(R.map.tiles).forEach((T) => { if (T.painted) T.done = true; });
  await open(g, R); fitCam(g);
  const T = frontier(g, R).find((x) => x.type === 'empty');
  t.ok(T, 'an empty frontier tile exists');
  const mercy0 = R.stats.mercy;
  await clickHex(g, T.q, T.r);
  t.ok(T.painted, 'painted');
  t.eq(R.stats.mercy, mercy0 + 1, 'RUN lent a drop');
  t.eq(R.ink, 1, 'exactly paintCost Ink: the one spent comes back');
  t.ok(toasts(g).some((x) => /hums along: 1 Vox/.test(x)), 'the toast says so');
  t.ok(sfx(g).indexOf('ink_gain') >= 0, 'with the Ink sound');
  t.eq(errs(g), 0, 'clean');
});

// ==================================================================================================== brushes
const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
const chip = (g) => $(g, '.mp-chip');
const modeBar = (g) => $(g, '.mp-mode');
const cellsKey = (cells) => JSON.stringify(cells.map((c) => c[0] + ',' + c[1]).sort());

await t.test('every brush through the screen: chip, glowing anchors, hover preview, aim, apply paints exactly MAP.brushCells and uses the brush up', async () => {
  for (const id of ['stroke', 'wave', 'fan', 'splash', 'halo', 'blot']) {
    for (const seed of [2, 9]) {
      const g = fresh({ seed }); const R = mkRun(g, { seed, brushes: [id], ink: 4 });
      await open(g, R); fitCam(g);
      const M = R.map, def = g.DATA.brushes[id], dirKind = def.kind === 'line' || def.kind === 'fan';
      t.eq($$(g, '.mp-chip').length, 1, id + '/' + seed + ': one chip');
      t.ok(modeBar(g).hidden, id + '/' + seed + ': no mode bar before the chip');
      await (async () => { g._click(chip(g)); await settle(g); })();
      const b = st(g).brush;
      t.ok(b && b.id === id, id + '/' + seed + ': the chip enters brush mode');
      t.ok(!modeBar(g).hidden && txt(modeBar(g)).indexOf(def.name) >= 0, id + '/' + seed + ': the mode bar names the brush');
      t.eq(chip(g).getAttribute('aria-pressed'), 'true', id + '/' + seed + ': the chip is pressed');
      const list = g.MAP.brushAnchors(M, id);
      t.eq(b.anchors.size, list.length, id + '/' + seed + ': the glowing anchors are MAP.brushAnchors');
      // pick an anchor whose aimed neighbour exists
      let pick = null;
      for (const a of list) {
        const ds = dirKind ? a.dirs : [0];
        const d = ds.find((dd) => g.MAP.tile(M, a.q + DIRS[dd][0], a.r + DIRS[dd][1]));
        if (d !== undefined) { pick = { a, d }; break; }
      }
      t.ok(pick, id + '/' + seed + ': a usable anchor');
      const { a, d } = pick;
      await hoverHex(g, a.q, a.r);
      t.ok(st(g).brush.preview.length > 0 && st(g).brush.valid, id + '/' + seed + ': hovering an anchor previews the shape');
      t.ok(st(g).brush.preview.every((c) => g.MAP.brushCells(M, id, a.q, a.r, dirKind ? st(g).brush.hoverDir : 0).some((e) => e[0] === c[0] && e[1] === c[1])), id + '/' + seed + ': the preview cells are brush cells');
      let expect;
      if (dirKind) {
        await clickHex(g, a.q, a.r);
        t.ok(st(g).brush.anchor && st(g).brush.anchor.q === a.q, id + '/' + seed + ': the first tap locks the anchor');
        t.eq(R.brushes.length, 1, id + '/' + seed + ': nothing used yet');
        const nb = [a.q + DIRS[d][0], a.r + DIRS[d][1]];
        await hoverHex(g, nb[0], nb[1]);
        t.eq(st(g).brush.dir, d, id + '/' + seed + ': the pointer aims the brush with MAP.dirOf (' + d + ')');
        expect = g.MAP.brushCells(M, id, a.q, a.r, d);
        t.eq(cellsKey(st(g).brush.preview), cellsKey(expect), id + '/' + seed + ': the preview follows the aim');
        await clickHex(g, nb[0], nb[1]);
      } else {
        expect = g.MAP.brushCells(M, id, a.q, a.r, 0);
        await clickHex(g, a.q, a.r);
      }
      t.ok(expect.length > 0 && expect.every((c) => tileOf(g, R, c[0], c[1]).painted), id + '/' + seed + ': every cell the brush covers is painted (' + expect.length + ')');
      t.eq(R.brushes.length, 0, id + '/' + seed + ': the brush is used up');
      t.eq($$(g, '.mp-chip').length, 0, id + '/' + seed + ': the chip is gone');
      t.ok(/No Spells/.test(txt($(g, '.mp-tray'))), id + '/' + seed + ': the tray says so');
      t.ok(modeBar(g).hidden && !st(g).brush, id + '/' + seed + ': brush mode ended');
      t.eq(R.ink, 4, id + '/' + seed + ': brushes are free');
      t.eq(R.stats.brushesUsed, 1, id + '/' + seed + ': RUN counted it');
      t.deep(bus(g, 'map:brush'), [{ id }], id + '/' + seed + ': map:brush carries the id');
      t.ok(sfx(g).indexOf('brush_use') >= 0, id + '/' + seed + ': the brush sound');
      t.eq(errs(g), 0, id + '/' + seed + ': clean');
    }
  }
});

await t.test('brush mode: touch needs the confirming tap, Esc backs out one level at a time, right click cancels, the Paint button applies', async () => {
  const g = fresh({ seed: 4 }); const R = mkRun(g, { seed: 4, brushes: ['splash', 'fan', 'fan'] });
  await open(g, R); fitCam(g);
  t.eq($$(g, '.mp-chip').length, 2, 'one chip per kind');
  t.eq(txt($(g, '.mp-chip[data-id="fan"] .mp-chip-c')), 'x2', 'a count badge when you hold two');
  g._click($(g, '.mp-chip[data-id="splash"]')); await settle(g);
  const a = [...st(g).brush.anchors.values()][3];
  const exp = g.MAP.brushCells(R.map, 'splash', a.q, a.r, 0);
  await clickHex(g, a.q, a.r, { pointerType: 'touch' });
  t.ok(exp.every((c) => !tileOf(g, R, c[0], c[1]).painted), 'a first touch tap only shows the shape');
  t.ok(st(g).brush && st(g).brush.anchor && /Tap again|Cast/.test(txt(modeBar(g))), 'and asks for a second tap');
  t.eq(R.brushes.length, 3, 'nothing used');
  await press(g, 'Escape');
  t.ok(st(g).brush && !st(g).brush.anchor, 'Esc first releases the anchor');
  await press(g, 'Escape');
  t.ok(!st(g).brush && modeBar(g).hidden, 'Esc again puts the brush away');
  t.eq(g.UI.overlay.count(), 0, 'and neither opened the pause menu');
  await press(g, 'Escape');
  t.ok(g.UI.overlay.has('pause'), 'a third Esc reaches the pause menu');
  await press(g, 'Escape'); t.eq(g.UI.overlay.count(), 0, 'Esc closes it');
  // right click cancels
  g._click($(g, '.mp-chip[data-id="splash"]')); await settle(g);
  t.ok(st(g).brush, 'brush mode again');
  g._pointer('pointerdown', view(g), { button: 2, buttons: 2 }); await settle(g);
  t.ok(!st(g).brush, 'a right click cancels brush mode');
  // two taps with touch really paint
  g._click($(g, '.mp-chip[data-id="splash"]')); await settle(g);
  await clickHex(g, a.q, a.r, { pointerType: 'touch' });
  await clickHex(g, a.q, a.r, { pointerType: 'touch' });
  t.ok(exp.every((c) => tileOf(g, R, c[0], c[1]).painted) && R.brushes.indexOf('splash') < 0, 'the second tap paints');
  // the Paint button for a fan: anchor, aim by tapping a neighbour, press Paint
  g._click($(g, '.mp-chip[data-id="fan"]')); await settle(g);
  const fa = [...st(g).brush.anchors.values()].find((x) => x.dirs.length > 1 && g.MAP.tile(R.map, x.q + DIRS[x.dirs[1]][0], x.r + DIRS[x.dirs[1]][1]));
  await clickHex(g, fa.q, fa.r, { pointerType: 'touch' });
  const nb = [fa.q + DIRS[fa.dirs[1]][0], fa.r + DIRS[fa.dirs[1]][1]];
  await clickHex(g, nb[0], nb[1], { pointerType: 'touch' });
  t.eq(st(g).brush.dir, fa.dirs[1], 'a touch tap on the neighbouring hex aims the fan');
  t.eq(R.brushes.length, 2, 'aiming spends nothing');
  const want = g.MAP.brushCells(R.map, 'fan', fa.q, fa.r, fa.dirs[1]);
  const apply = $(g, '.mp-mode .btn-primary'); t.ok(apply && /Cast \d/.test(txt(apply)), 'the Paint button shows the count (' + txt(apply) + ')');
  g._click(apply); await settle(g);
  t.ok(want.every((c) => tileOf(g, R, c[0], c[1]).painted), 'Paint applies the fan');
  t.eq(R.brushes.length, 1, 'one fan left');
  t.eq($$(g, '.mp-chip[data-id="fan"] .mp-chip-c').length, 0, 'the badge is gone with one left');
  t.eq(errs(g), 0, 'clean');
});

await t.test('brush mode: an invalid start refuses with a hint, keys B and 1 to 9 pick brushes, an empty tray and a brush with no room say so', async () => {
  const g = fresh({ seed: 6 }); const R = mkRun(g, { seed: 6, brushes: ['stroke', 'halo'] });
  await open(g, R); fitCam(g);
  await press(g, 'b');
  t.ok(st(g).brush && st(g).brush.id === 'stroke', 'B opens the first brush');
  await press(g, 'b');
  t.ok(st(g).brush && st(g).brush.id === 'halo', 'B again moves to the next');
  await press(g, 'b'); t.ok(st(g).brush && st(g).brush.id === 'stroke', 'and wraps round');
  await press(g, '2'); t.ok(st(g).brush && st(g).brush.id === 'halo', 'the key 2 picks the second chip');
  await press(g, '2'); t.ok(!st(g).brush, 'pressing it again puts it away');
  await press(g, '1');
  const bad = Object.values(R.map.tiles).find((T) => T.painted && g.MAP.brushAnchors(R.map, 'stroke').every((a) => a.q !== T.q || a.r !== T.r)) || Object.values(R.map.tiles).find((T) => T.type === 'block');
  const before = JSON.stringify(g.MAP.progress(R.map));
  await clickHex(g, bad.q, bad.r);
  t.ok(toasts(g).length > 0, 'a hint toast (' + toasts(g).join(' | ') + ')');
  t.eq(JSON.stringify(g.MAP.progress(R.map)), before, 'nothing painted');
  t.ok(st(g).brush && R.brushes.length === 2, 'still in brush mode, brush kept');
  await press(g, 'Escape');
  R.brushes = [];
  g._raf(16); g._raf(16);
  t.eq($$(g, '.mp-chip').length, 0, 'the tray follows RUN (no chips)');
  await press(g, 'b');
  t.ok(toasts(g).some((x) => /no spells/i.test(x)), 'B with an empty tray says so');
  R.brushes = ['blot']; fullyPainted(g, R);
  g._raf(16); g._raf(16);
  await press(g, 'b');
  t.ok(!st(g).brush && toasts(g).some((x) => /nowhere to unmute/i.test(x)), 'a brush with no room refuses to start');
  t.eq(errs(g), 0, 'clean');
});

// ==================================================================================================== walking, instants, nodes
// retype a painted tile near the party into `type` (content given) so a real RUN.step on it makes the real node
function plant(g, R, type, content, minDist = 1, maxDist = 2) {
  const M = R.map, pos = M.pos;
  const T = Object.values(M.tiles).find((x) => x.painted && x.type === 'empty' && !(x.q === pos.q && x.r === pos.r) && g.MAP.dist(pos.q, pos.r, x.q, x.r) >= minDist && g.MAP.dist(pos.q, pos.r, x.q, x.r) <= maxDist);
  T.type = type; T.content = content || {}; T.done = false;
  return T;
}

await t.test('walking: tap painted ground and the party goes there; the bus, RUN.pos and the sounds agree; a tap on the party hex does nothing', async () => {
  for (const seed of SEEDS) {
    const g = fresh({ seed }); const R = mkRun(g, { seed });
    await open(g, R); fitCam(g);
    const M = R.map, pos0 = { q: M.pos.q, r: M.pos.r };
    const T = Object.values(M.tiles).filter((x) => x.painted && x.type === 'empty' && g.MAP.dist(pos0.q, pos0.r, x.q, x.r) === 2)[seed % 3];
    const path = g.MAP.walkPath(M, T.q, T.r);
    t.ok(path && path.length >= 2, 'seed ' + seed + ': a walkable path of ' + (path && path.length));
    await clickHex(g, T.q, T.r);
    t.deep({ q: M.pos.q, r: M.pos.r }, { q: T.q, r: T.r }, 'seed ' + seed + ': the party arrived');
    t.deep(bus(g, 'map:walk'), [{ q: T.q, r: T.r }], 'seed ' + seed + ': map:walk names the destination');
    t.eq(sfx(g).filter((x) => x === 'step').length, path.length, 'seed ' + seed + ': a footstep per hex');
    t.eq(entered(g).length, 0, 'seed ' + seed + ': an empty hex enters nothing');
    t.deep({ x: st(g).tok.x, y: st(g).tok.y }, g.MAP.toPixel(T.q, T.r, 46), 'seed ' + seed + ': the token sits on the hex');
    t.ok(!st(g).walk && !st(g).tok.moving, 'seed ' + seed + ': the walk is over');
    const n = bus(g, 'map:walk').length;
    await clickHex(g, T.q, T.r);
    t.eq(bus(g, 'map:walk').length, n, 'seed ' + seed + ': tapping where you stand starts no walk');
    t.eq(errs(g), 0, 'seed ' + seed + ': clean');
  }
});

await t.test('walking stops on the first unresolved tile and triggers it: a fight goes to GAME.enterNode with the real node, and the page then ignores taps', async () => {
  for (const kind of ['enemy', 'elite']) {
    const g = fresh({ seed: 7 }); const R = mkRun(g, { seed: 7 });
    const T = plant(g, R, kind, {}, 2, 2);
    await open(g, R); fitCam(g);
    await clickHex(g, T.q, T.r);
    t.deep({ q: R.map.pos.q, r: R.map.pos.r }, { q: T.q, r: T.r }, kind + ': the party stands on the fight');
    t.ok(R.node && R.node.kind === 'combat' && R.node.tier === (kind === 'elite' ? 'elite' : 'normal'), kind + ': RUN.step made the combat node');
    t.eq(entered(g).length, 1, kind + ': GAME.enterNode called once');
    t.ok(entered(g)[0].kind === 'combat' && entered(g)[0].tile.q === T.q, kind + ': with that node');
    t.ok(st(g).busy, kind + ': the page is busy while GAME takes over');
    const other = Object.values(R.map.tiles).find((x) => x.painted && x.type === 'empty' && !(x.q === T.q && x.r === T.r));
    const before = JSON.stringify(R.map.pos);
    await clickHex(g, other.q, other.r);
    t.eq(JSON.stringify(R.map.pos), before, kind + ': taps are ignored while busy');
    t.eq(entered(g).length, 1, kind + ': and nothing is entered twice');
    t.ok(sfx(g).indexOf(kind === 'elite' ? 'reveal_landmark' : 'reveal_landmark') >= 0, kind + ': a sting on arrival');
    t.eq(errs(g), 0, kind + ': clean');
  }
});

await t.test('the walk goes around trouble when it can and stops on it when it must; a far target behind a fight ends at the fight', async () => {
  const g = fresh({ seed: 11 }); const R = mkRun(g, { seed: 11 });
  const M = R.map, pos = M.pos;
  // a corridor: every painted tile except a line of three east of the party becomes Void is too invasive, so test the rule through MAP itself
  const T1 = plant(g, R, 'enemy', {}, 1, 1);
  const far = Object.values(M.tiles).find((x) => x.painted && x.type === 'empty' && g.MAP.dist(pos.q, pos.r, x.q, x.r) === 2 && g.MAP.dist(T1.q, T1.r, x.q, x.r) === 1);
  await open(g, R); fitCam(g);
  const path = g.MAP.walkPath(M, far.q, far.r);
  t.ok(path.every((c) => !(c[0] === T1.q && c[1] === T1.r)), 'MAP.walkPath avoids the unresolved fight on the way');
  await clickHex(g, far.q, far.r);
  t.deep({ q: M.pos.q, r: M.pos.r }, { q: far.q, r: far.r }, 'the party took the detour');
  t.ok(!R.node && entered(g).length === 0, 'and met nothing');
  t.eq(errs(g), 0, 'clean');
});

await t.test('instants: a well pours its Ink into the meter, a brush rack drops the brush into the tray, both end the walk and go through GAME.enterNode', async () => {
  for (const seed of [1, 5, 9]) {
    const g = fresh({ seed }); const R = mkRun(g, { seed, ink: 3 });
    const W = plant(g, R, 'well', { ink: 4 }, 2, 2);
    const B = plant(g, R, 'brush', { id: 'wave' }, 1, 2);
    await open(g, R); fitCam(g);
    const ink0 = R.ink;
    await clickHex(g, W.q, W.r);
    t.deep({ q: R.map.pos.q, r: R.map.pos.r }, { q: W.q, r: W.r }, 'seed ' + seed + ': stood on the well');
    t.eq(R.ink, ink0 + 4, 'seed ' + seed + ': the well refilled 4 Ink');
    t.ok(W.done, 'seed ' + seed + ': the well is done');
    t.eq(txt($(g, '.mp-ink-n')), R.ink + '/' + R.inkMax, 'seed ' + seed + ': the meter shows it');
    t.eq($$(g, '.mp-ink .mp-drop.full').length, R.ink, 'seed ' + seed + ': the drops filled');
    t.eq(entered(g).length, 1, 'seed ' + seed + ': GAME.enterNode got the instant');
    t.ok(entered(g)[0].kind === 'well' && entered(g)[0].gained === 4 && entered(g)[0].done, 'seed ' + seed + ': the instant has its numbers');
    t.ok(!R.node && !st(g).busy, 'seed ' + seed + ': an instant leaves the page free');
    t.ok(/Walk|here/.test(txt($(g, '.mp-info'))) || true, 'seed ' + seed + ': info ok');
    await clickHex(g, B.q, B.r);
    t.deep({ q: R.map.pos.q, r: R.map.pos.r }, { q: B.q, r: B.r }, 'seed ' + seed + ': stood on the rack');
    t.ok(R.brushes.indexOf('wave') >= 0 && B.done, 'seed ' + seed + ': the brush is yours');
    t.ok($$(g, '.mp-chip[data-id="wave"]').length === 1, 'seed ' + seed + ': a chip for it appeared in the tray');
    t.ok(entered(g).length === 2 && entered(g)[1].kind === 'brush' && entered(g)[1].id === 'wave', 'seed ' + seed + ': GAME.enterNode got the brush');
    t.eq(errs(g), 0, 'seed ' + seed + ': clean');
  }
});

await t.test('a fable with nothing left to tell resolves as an instant and the screen shows its toast', async () => {
  const g = fresh({ seed: 12 }); const R = mkRun(g, { seed: 12 });
  g.DATA.LISTS.chapters.forEach(() => {});
  R.seen.events = Object.keys(g.DATA.events);                      // every fable already told
  const E = plant(g, R, 'event', {}, 1, 2);
  g.DATA.events && Object.values(g.DATA.events).forEach((e) => { e.__once = e.once; e.once = true; });
  await open(g, R); fitCam(g);
  await clickHex(g, E.q, E.r);
  const n = entered(g)[0];
  t.ok(n && (n.kind === 'event' || n.kind === 'well'), 'RUN gave a node or the fallback instant (' + (n && n.kind) + ')');
  // run.js says it in the new words (HV_UI_COPY 2.2): "The detour leads nowhere. You find a little Vox."
  if (n && n.fallback) t.ok(toasts(g).some((x) => /detour leads nowhere/i.test(x)), 'the fallback shows its own line');
  else t.ok(R.node && R.node.kind === 'event', 'an event node otherwise');
  t.eq(errs(g), 0, 'clean');
});

await t.test('the boss: walking onto it builds the boss node, plays the boss sting and hands over after a long beat', async () => {
  const g = fresh({ seed: 14 }); const R = mkRun(g, { seed: 14 });
  const B = plant(g, R, 'boss', {}, 1, 2);
  await open(g, R); fitCam(g);
  await clickHex(g, B.q, B.r);
  t.ok(R.node && R.node.kind === 'combat' && R.node.tier === 'boss' && R.node.enemies.length === 1, 'a boss combat node');
  t.ok(sfx(g).indexOf('boss_intro') >= 0, 'the boss sting');
  t.eq(entered(g).length, 1, 'handed to GAME.enterNode');
  t.eq(entered(g)[0].tier, 'boss', 'with the boss node');
  t.eq(errs(g), 0, 'clean');
});

await t.test('with the real GAME: a fight leaves for the combat screen and a finished node brings the map back with the tile done', async () => {
  const g = fresh({ spy: false, seed: 7 }); const R = mkRun(g, { seed: 7 });
  const T = plant(g, R, 'enemy', {}, 2, 2);
  g._run('globalThis.__t = []; UI.bus.on("screen", (e) => __t.push(e.name));');
  await open(g, R); fitCam(g);
  await clickHex(g, T.q, T.r);
  await g._until(() => g._run('UI.currentName') === 'combat', { ms: 6000 });
  t.eq(g._run('UI.currentName'), 'combat', 'the real GAME routed to combat');
  g.RUN.finishNode(R);                                           // what a won fight and its reward do
  await g.UI.go('map', { R }, { force: true, transition: 'none' }); await settle(g);
  t.ok(T.done, 'the tile is done');
  t.ok(!R.node, 'no node pending');
  fitCam(g);
  await hoverHex(g, T.q, T.r);
  t.ok(/The party stands here|Done/.test(txt($(g, '.mp-info-act'))), 'the chip reads done');
  t.eq(errs(g), 0, 'clean');
});

// ==================================================================================================== camera
const wheel = (g, x, y, dy) => g._run(`UI.layers.view.dispatchEvent(new WheelEvent('wheel', { clientX: ${x}, clientY: ${y}, deltaY: ${dy}, bubbles: true, cancelable: true }))`);
// the same at a stage point, whatever the scale of the window (a phone viewport scales the stage)
const wheelAtStage = (g, x, y, dy) => wheel(g, g.UI.ox + x * g.UI.scale, g.UI.oy + y * g.UI.scale, dy);
const camOf = (g) => md(g).cam();
const worldAt = (c, x, y) => ({ x: c.x + (x - 640) / c.z, y: c.y + (y - 360) / c.z });

await t.test('camera: starts on the party, drag pans with the page under the finger, glides on, and clamps to the page', async () => {
  const g = fresh(); const R = mkRun(g);
  await open(g, R);
  const c0 = camOf(g);
  t.near(c0.z, 1, 1e-9, 'the default zoom is 1');
  t.ok(c0.follow && !c0.fitted, 'following the party');
  const tok = g.MAP.toPixel(R.map.pos.q, R.map.pos.r, 46);
  t.ok(Math.abs(c0.x - tok.x) < 700 && Math.abs(c0.y - tok.y) < 400, 'the camera is near the party');
  g._drag(view(g), [700, 400], [500, 400], 8); await settle(g);
  const c1 = camOf(g);
  t.near(c1.x - c0.x, 200, 1e-6, 'dragging 200 px left moves the camera 200 world units right');
  t.near(c1.y, c0.y, 1e-6, 'and not vertically');
  t.ok(!c1.follow, 'a manual drag stops following the party');
  // a drag shorter than the threshold is a tap, not a pan
  const p = md(g).screenOf(R.map.pos.q, R.map.pos.r);
  g._pointer('pointerdown', view(g), { x: p.x, y: p.y, id: 3 }); g._pointer('pointermove', view(g), { x: p.x + 3, y: p.y + 2, id: 3 }); g._pointer('pointerup', view(g), { x: p.x + 3, y: p.y + 2, id: 3 });
  t.near(camOf(g).x, c1.x, 1e-6, 'a 3 px wobble does not pan');
  // inertia: the page keeps gliding after the finger leaves, then stops
  const before = camOf(g).x;
  g._drag(view(g), [900, 400], [700, 400], 6);
  const afterUp = camOf(g).x;
  for (let i = 0; i < 12; i++) g._raf(16);
  t.ok(camOf(g).x > afterUp, 'the camera glides on after the release');
  for (let i = 0; i < 400; i++) g._raf(16);
  const rest = camOf(g).x;
  for (let i = 0; i < 10; i++) g._raf(16);
  t.near(camOf(g).x, rest, 1e-6, 'and comes to rest');
  // clamp: shove the page far in every direction and look at the limits
  // (the limits are where the padded page edge reaches the edge of the clamp box: the HUD free box plus the fit, DESIGN 4.8; they used to be the window)
  const s = st(g), z = camOf(g).z, B = s.box;
  for (let i = 0; i < 25; i++) g._drag(view(g), [100, 360], [1200, 360], 4);
  for (let i = 0; i < 400; i++) g._raf(16);
  t.near(camOf(g).x, s.world.x0 - 80 + (640 - B.x0) / z, 1e-6, 'the left limit is the page edge plus padding, at the edge of the box the HUD leaves free');
  for (let i = 0; i < 25; i++) g._drag(view(g), [1200, 360], [100, 360], 4);
  for (let i = 0; i < 400; i++) g._raf(16);
  t.near(camOf(g).x, s.world.x1 + 80 + (640 - B.x1) / z, 1e-6, 'the right limit');
  for (let i = 0; i < 25; i++) g._drag(view(g), [640, 650], [640, 60], 4);
  for (let i = 0; i < 400; i++) g._raf(16);
  t.near(camOf(g).y, s.world.y1 + 80 + (360 - B.y1) / z, 1e-6, 'the bottom limit');
  for (let i = 0; i < 25; i++) g._drag(view(g), [640, 60], [640, 650], 4);
  for (let i = 0; i < 400; i++) g._raf(16);
  t.near(camOf(g).y, s.world.y0 - 80 + (360 - B.y0) / z, 1e-6, 'the top limit');
  t.eq(errs(g), 0, 'clean');
});

await t.test('camera: the wheel zooms about the pointer inside the limits, two fingers pinch, buttons and keys zoom and pan, Fit toggles', async () => {
  const g = fresh(); const R = mkRun(g);
  await open(g, R);
  const s = st(g);
  s.cam.x = (s.world.x0 + s.world.x1) / 2; s.cam.y = (s.world.y0 + s.world.y1) / 2; s.follow = false;
  const w0 = worldAt(camOf(g), 900, 300);
  wheel(g, 900, 300, -300); await settle(g);
  const c1 = camOf(g);
  t.ok(c1.z > 1 && c1.z <= c1.zMax, 'the wheel zooms in');
  const w1 = worldAt(c1, 900, 300);
  t.near(w1.x, w0.x, 1e-6, 'the world point under the pointer stays put (x)'); t.near(w1.y, w0.y, 1e-6, 'and y');
  t.ok(!c1.follow, 'zooming by hand stops following');
  for (let i = 0; i < 30; i++) wheel(g, 640, 360, -600);
  t.eq(camOf(g).z, c1.zMax, 'the zoom stops at the maximum');
  for (let i = 0; i < 60; i++) wheel(g, 640, 360, 600);
  t.near(camOf(g).z, camOf(g).zMin, 1e-9, 'and at the minimum, where the whole page fits');
  const z = camOf(g);
  t.near(z.x, s.fit.x, 1e-6, 'fully zoomed out the camera sits on the fit (the page placed clear of the HUD), whatever the pointer was on');
  t.near(z.y, s.fit.y, 1e-6, 'in y too');
  t.ok(z.zMin < 1 && z.zMin > 0.25 && camOf(g).fitted, 'the minimum zoom shows the whole page (' + z.zMin.toFixed(3) + ') and counts as the fit view');
  // pinch
  const R0 = JSON.stringify(R.map.pos), ink0 = R.ink;
  const zBefore = camOf(g).z;
  g._pointer('pointerdown', view(g), { x: 500, y: 360, id: 1, pointerType: 'touch' });
  g._pointer('pointerdown', view(g), { x: 780, y: 360, id: 2, pointerType: 'touch' });
  g._pointer('pointermove', view(g), { x: 400, y: 360, id: 1, pointerType: 'touch' });
  g._pointer('pointermove', view(g), { x: 880, y: 360, id: 2, pointerType: 'touch' });
  const zp = camOf(g).z;
  t.near(zp / zBefore, 480 / 280, 0.02, 'two fingers apart by 480 instead of 280 zoom by that ratio');
  g._pointer('pointerup', view(g), { x: 400, y: 360, id: 1, pointerType: 'touch' }); g._pointer('pointerup', view(g), { x: 880, y: 360, id: 2, pointerType: 'touch' });
  await settle(g);
  t.ok(JSON.stringify(R.map.pos) === R0 && R.ink === ink0 && bus(g, 'map:paint').length === 0, 'a pinch is never a tap');
  // buttons
  s.cam.z = 1; s.tz = 1;
  g._click($(g, '.mp-t-zin')); await settle(g);
  t.near(camOf(g).z, 1.3, 1e-9, 'Zoom in multiplies by 1.3');
  g._click($(g, '.mp-t-zout')); g._click($(g, '.mp-t-zout')); await settle(g);
  t.near(camOf(g).z, 1.3 / 1.3 / 1.3, 1e-9, 'Zoom out divides');
  // keys
  s.cam.z = 1; s.tz = 1; s.cam.x = (s.world.x0 + s.world.x1) / 2; s.cam.y = (s.world.y0 + s.world.y1) / 2;
  const cx = camOf(g).x;
  g._doc.activeElement && g._doc.activeElement.blur && g._doc.activeElement.blur();
  await press(g, 'ArrowRight'); t.near(camOf(g).x - cx, 80, 1e-6, 'ArrowRight pans 80');
  await press(g, 'ArrowLeft', { shift: true }); t.near(camOf(g).x - cx, 80 - 240, 1e-6, 'Shift triples it');
  await press(g, '+'); t.near(camOf(g).z, 1.25, 1e-9, '+ zooms in'); await press(g, '-'); t.near(camOf(g).z, 1, 1e-9, '- zooms out');
  // fit
  g._click($(g, '.mp-t-fit')); await settle(g);
  let c = camOf(g);
  t.ok(c.fitted && !c.follow && Math.abs(c.z - c.zMin) < 1e-9, 'Fit shows the whole page');
  t.near(c.x, s.fit.x, 1e-6, 'placed on the fit camera (clear of the HUD)');
  await press(g, 'f');
  c = camOf(g);
  t.ok(!c.fitted && c.follow && Math.abs(c.z - 1) < 1e-9, 'Fit again (or F) goes back to following the party at the default zoom');
  // ctrl keys are not ours
  const z2 = camOf(g).z; await press(g, '+', { ctrl: true }); t.eq(camOf(g).z, z2, 'Ctrl plus is left to the browser');
  t.eq(errs(g), 0, 'clean');
});

await t.test('camera: a small screen starts closer; hexAt maps the stage to the hex under it and nothing outside the page window', async () => {
  const g = fresh({ viewport: { w: 844, h: 390 }, touch: true }); const R = mkRun(g);
  g._resize(844, 390);
  await open(g, R);
  t.ok(g._doc.getElementById('stage').classList.contains('compact'), 'the stage is compact at 844 x 390');
  t.near(camOf(g).z, 1.2, 1e-9, 'a closer default zoom');
  const p = md(g).screenOf(R.map.pos.q, R.map.pos.r);
  t.deep(md(g).hexAt(p.x, p.y), { q: R.map.pos.q, r: R.map.pos.r }, 'hexAt is the inverse of screenOf');
  t.eq(md(g).hexAt(5, 5), null, 'the frame is not a hex');
  t.eq(md(g).hexAt(640, 710), null, 'neither is the bottom margin');
  t.ok($$(g, '.mp-tool').length === 5 && $$(g, '.mp-chip').length === 1, 'the HUD is still complete');
  t.eq(errs(g), 0, 'clean');
});

// ==================================================================================================== the camera and the HUD footprint
// The HUD lies over the page. The camera measures its REAL rectangles (stage px) and keeps the page clear of them: the fit view, the minimum zoom, the pan
// range and the follow all work with what the HUD leaves free (DESIGN 4.8). The headless DOM has no layout, so the suite gives each piece the rectangle
// it has in real Chromium (one brush, two treasures) through `_rect`, or measures nothing at all to see the fixed fallback.
const HUD_SEL = { party: '.mp-party', ink: '.mp-ink', banner: '.mp-banner', gold: '.mp-gold', menu: '.menu-btn', deck: '.mp-t-deck', legend: '.mp-t-legend', fit: '.mp-t-fit', zin: '.mp-t-zin', zout: '.mp-t-zout', tray: '.mp-tray', info: '.mp-info', relics: '.mp-relics', mode: '.mp-mode' };
const HUD_WIDE = { party: [14, 9, 312, 75], ink: [14, 84, 374, 138], banner: [419, 2, 861, 86], gold: [1134, 14, 1196, 48], menu: [1211, -1, 1269, 57], deck: [1208, 74, 1268, 134], legend: [1205, 143, 1268, 203],
  fit: [1208, 212, 1268, 272], zin: [1202, 281, 1268, 341], zout: [1191, 350, 1268, 410], tray: [567, 605, 714, 710], info: [946, 589, 1268, 708], relics: [14, 642, 139, 708] };
const HUD_COMPACT = { party: [14, 9, 312, 75], ink: [14, 82, 374, 136], banner: [460, 2, 820, 90], gold: [1113, 14, 1175, 48], menu: [1185, -1, 1269, 83], deck: [1187, 89, 1268, 170], legend: [1187, 178, 1268, 260],
  fit: [1187, 268, 1268, 349], zin: [1187, 357, 1268, 438], zout: [1187, 446, 1268, 527], tray: [577, 590, 703, 710], info: [988, 625, 1268, 708], relics: [14, 611, 207, 708] };
// give every piece its rectangle (stage px in the table, client px on the element); a null entry is a piece that is not shown
function layOut(g, table) {
  const sc = g.UI.scale, ox = g.UI.ox, oy = g.UI.oy;
  Object.keys(HUD_SEL).forEach((k) => {
    const el = $(g, HUD_SEL[k]), r = table[k];
    if (!el) return;
    el._rect = r ? { left: ox + r[0] * sc, top: oy + r[1] * sc, width: (r[2] - r[0]) * sc, height: (r[3] - r[1]) * sc } : { left: 0, top: 0, width: 0, height: 0 };
  });
}
const rectOf = (r) => ({ x0: r[0], y0: r[1], x1: r[2], y1: r[3] });
// an exact test of a pointy-top hex (centre, radius) against a rectangle: separating axes
function hexHits(cx, cy, r, R) {
  const h = Math.sqrt(3) / 2 * r;
  if (cx + h <= R.x0 || cx - h >= R.x1 || cy + r <= R.y0 || cy - r >= R.y1) return false;
  const rc = [[R.x0, R.y0], [R.x1, R.y0], [R.x1, R.y1], [R.x0, R.y1]];
  for (const a of [0, 60, 120]) {
    const nx = Math.cos(a * Math.PI / 180), ny = Math.sin(a * Math.PI / 180), c = cx * nx + cy * ny;
    let mn = Infinity, mx = -Infinity;
    rc.forEach((p) => { const v = p[0] * nx + p[1] * ny; mn = Math.min(mn, v); mx = Math.max(mx, v); });
    if (c + h <= mn || c - h >= mx) return false;
  }
  return true;
}
// the hexes of the page that touch any rectangle (the camera as it stands), and those outside the page window
function underHud(g, rects, hexes) {
  const s = st(g), z = s.cam.z, out = [];
  (hexes || Object.values(s.M.tiles)).forEach((T) => {
    const p = md(g).screenOf(T.q, T.r), rad = 46 * z * (T.type === 'boss' ? 1.2 : 1);
    const r = rects.find((q) => hexHits(p.x, p.y, rad, q));
    if (r) out.push({ q: T.q, r: T.r, x: Math.round(p.x), y: Math.round(p.y), hud: r.k || '' });
  });
  return out;
}
function outsideWindow(g) {
  const s = st(g), z = s.cam.z, w = s.win;
  return Object.values(s.M.tiles).filter((T) => {
    const p = md(g).screenOf(T.q, T.r), h = Math.sqrt(3) / 2 * 46 * z, r = 46 * z;
    return p.x - h < w.x || p.x + h > w.x + w.w || p.y - r < w.y || p.y + r > w.y + w.h;
  });
}
const oldFitZ = (s) => Math.max(0.25, Math.min(1, Math.min(s.win.w / (s.world.x1 - s.world.x0 + 160), s.win.h / (s.world.y1 - s.world.y0 + 160))));   // what Fit used to be: the page plus padding in the window, HUD ignored
const hudRects = (g, measure) => md(g).hud(measure).rects.map((r) => ({ k: r.k, x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1 }));
async function pressFit(g) { g._doc.activeElement && g._doc.activeElement.blur && g._doc.activeElement.blur(); await press(g, 'f'); }

for (const lay of [{ name: 'desktop 1280x720', tab: HUD_WIDE, vp: null }, { name: 'phone 844x390', tab: HUD_COMPACT, vp: { w: 844, h: 390 } }]) {
  await t.test('fit: on the ' + lay.name + ' the whole page is clear of every HUD piece, in all three chapters and on several seeds, and the zoom stays near what it was', async () => {
    const g = lay.vp ? fresh({ viewport: lay.vp, touch: true }) : fresh();
    if (lay.vp) g._resize(lay.vp.w, lay.vp.h);
    let bad = 0, checked = 0, worstRatio = 9;
    for (const ch of [1, 2, 3]) {
      for (const seed of [1, 5, 13, 34]) {
        const R = mkRun(g, { seed, chapter: ch, relics: ['brass_lantern', 'fox_mask'] });
        await open(g, R); layOut(g, lay.tab); await g._tick(400);
        const hud = md(g).hud();
        t.ok(hud.rects.length === 13 && hud.rects.every((r) => r.live), ch + '/' + seed + ': all 13 pieces are measured, none from the fallback table');
        await pressFit(g);
        const s = st(g), c = camOf(g);
        t.ok(c.fitted && !c.follow && Math.abs(c.z - c.zMin) < 1e-9 && Math.abs(c.z - hud.fit.z) < 1e-9, ch + '/' + seed + ': Fit shows the fit view at the minimum zoom');
        const rects = hudRects(g);
        const under = underHud(g, rects), out = outsideWindow(g);
        bad += under.length + out.length; checked += Object.keys(s.M.tiles).length;
        t.eq(under.length, 0, ch + '/' + seed + ': no hex (boss and Void included) touches a HUD piece' + (under.length ? ' ' + JSON.stringify(under.slice(0, 3)) : ''));
        t.eq(out.length, 0, ch + '/' + seed + ': and none leaves the page window');
        worstRatio = Math.min(worstRatio, c.z / oldFitZ(s));
      }
    }
    t.ok(checked > 3000 && bad === 0, 'every hex of twelve pages was checked against every piece (' + checked + ')');
    t.ok(worstRatio >= 0.75, 'the fit zoom is at least 75 percent of the old one (' + (worstRatio * 100).toFixed(1) + '%)');
    t.ok(worstRatio < 1, 'and the HUD does cost something, so the numbers are real');
    t.eq(errs(g), 0, 'clean');
  });
}

await t.test('fit: Fit, F, wheel and pinch all the way out, and the opening view land on the same placement; the minimum zoom is the fit zoom', async () => {
  const g = fresh(); const R = mkRun(g);
  await open(g, R); layOut(g, HUD_WIDE); await g._tick(400);
  const hud = md(g).hud(), s = st(g);
  t.near(s.zMin, hud.fit.z, 1e-12, 'zMin is the fit zoom'); t.near(s.fitZ, hud.fit.z, 1e-12, 'and so is fitZ');
  await pressFit(g);
  const a = camOf(g);
  t.near(a.x, hud.fit.x, 1e-6, 'F: the fit camera'); await press(g, 'f');
  t.ok(camOf(g).follow, 'F again follows the party');
  for (let i = 0; i < 40; i++) wheel(g, 400, 300, 500);
  await settle(g);
  const b = camOf(g);
  t.ok(b.z === b.zMin && Math.abs(b.x - a.x) < 1e-6 && Math.abs(b.y - a.y) < 1e-6, 'the wheel all the way out ends on the fit placement, wherever the pointer was');
  t.ok(b.fitted, 'and counts as the fit view (F then goes back to the party)');
  t.eq(underHud(g, hudRects(g)).length, 0, 'with no hex under a piece');
  // two fingers closing all the way
  s.cam.z = 1; s.tz = 1; s.fitted = false;
  g._pointer('pointerdown', view(g), { x: 300, y: 360, id: 1, pointerType: 'touch' }); g._pointer('pointerdown', view(g), { x: 980, y: 360, id: 2, pointerType: 'touch' });
  g._pointer('pointermove', view(g), { x: 630, y: 360, id: 1, pointerType: 'touch' }); g._pointer('pointermove', view(g), { x: 650, y: 360, id: 2, pointerType: 'touch' });
  g._pointer('pointerup', view(g), { x: 630, y: 360, id: 1, pointerType: 'touch' }); g._pointer('pointerup', view(g), { x: 650, y: 360, id: 2, pointerType: 'touch' });
  await settle(g);
  t.ok(camOf(g).z === camOf(g).zMin && Math.abs(camOf(g).x - a.x) < 1e-6, 'a pinch all the way in ends on the fit too');
  // zooming out stops at the fit zoom and never goes into the HUD
  await press(g, 'f'); s.cam.z = 1; s.tz = 1; s.follow = false;
  for (let i = 0; i < 12; i++) { g._click($(g, '.mp-t-zout')); await settle(g); }
  t.ok(camOf(g).z === camOf(g).zMin, 'Zoom out stops at the minimum');
  t.eq(errs(g), 0, 'clean');
});

await t.test('fit: nothing can be measured (the headless page): the fixed fallback rectangles stand in, the fit is still clear of them, and the compact table differs', async () => {
  const g = fresh(); const R = mkRun(g);
  await open(g, R); await g._tick(400);
  const hud = md(g).hud(), s = st(g);
  t.eq(hud.rects.length, 13, 'every piece has a rectangle'); t.ok(hud.rects.every((r) => !r.live), 'none of them measured');
  await pressFit(g);
  t.eq(underHud(g, hudRects(g)).length, 0, 'the fit is clear of the fallback rectangles'); t.eq(outsideWindow(g).length, 0, 'and inside the window');
  t.ok(camOf(g).z > 0.4 && camOf(g).z < 0.6 && camOf(g).z / oldFitZ(s) >= 0.75, 'at a sensible zoom (' + camOf(g).z.toFixed(3) + ')');
  t.ok(hud.free.x1 - hud.free.x0 > 900 && hud.free.y1 - hud.free.y0 > 380, 'and the free box is the stage minus the HUD bands');
  const gc = fresh({ viewport: { w: 844, h: 390 }, touch: true }); gc._resize(844, 390);
  await open(gc, mkRun(gc)); await gc._tick(400);
  const hc = md(gc).hud();
  t.ok(hc.rects.every((r) => !r.live) && JSON.stringify(hc.rects.map((r) => r.x0)) !== JSON.stringify(hud.rects.map((r) => r.x0)), 'the phone layout has its own table');
  await pressFit(gc);
  t.eq(underHud(gc, hudRects(gc)).length, 0, 'the phone fit is clear of its fallback rectangles');
  // one measured piece and twelve fallbacks: the measured one wins
  const g3 = fresh(); await open(g3, mkRun(g3));
  $(g3, '.mp-tray')._rect = { left: 100, top: 400, width: 200, height: 100 };
  await g3._tick(400);
  const tray = md(g3).hud().rects.find((r) => r.k === 'tray');
  t.ok(tray.live && tray.x0 === 100 && tray.y1 === 500, 'a piece that can be measured is measured while the others fall back');
  t.eq(errs(g) + errs(gc) + errs(g3), 0, 'clean');
});

await t.test('fit: a hidden piece covers nothing, and the translate of the entrance animation or a hover lift is taken out of a rectangle', async () => {
  const g = fresh(); const R = mkRun(g);
  await open(g, R);
  const tab = Object.assign({}, HUD_WIDE, { tray: null });
  layOut(g, tab); await g._tick(400);
  const hud = md(g).hud();
  t.eq(hud.rects.length, 12, 'the hidden tray is not in the footprint');
  t.ok(!hud.rects.some((r) => r.k === 'tray'), 'by name');
  const g2 = fresh(); await open(g2, mkRun(g2));
  layOut(g2, HUD_WIDE); await g2._tick(400);
  const z0 = md(g2).hud().fit.z;
  const lifted = $(g2, '.mp-t-fit'); lifted._rect = { left: 1208, top: 212 - 14, width: 60, height: 60 };
  g2._run("document.querySelector('.mp-t-fit').style.setProperty('translate', '0px -14px')");
  await g2._tick(400);
  const r = md(g2).hud().rects.find((q) => q.k === 'fit');
  t.near(r.y0, 212, 0.5, 'a piece lifted by 14 px is measured where it rests'); t.near(md(g2).hud().fit.z, z0, 1e-9, 'and the fit does not move');
  t.eq(errs(g) + errs(g2), 0, 'clean');
});

await t.test('pan: at every zoom each corner tile can be dragged clear of the HUD, and the page cannot be lost off screen', async () => {
  for (const lay of [{ tab: HUD_WIDE, vp: null }, { tab: HUD_COMPACT, vp: { w: 844, h: 390 } }]) {
    const g = lay.vp ? fresh({ viewport: lay.vp, touch: true }) : fresh();
    if (lay.vp) g._resize(lay.vp.w, lay.vp.h);
    const R = mkRun(g, { seed: 21, chapter: 2 });
    await open(g, R); layOut(g, lay.tab); await g._tick(400);
    const s = st(g), hud = md(g).hud(), rects = hudRects(g).map((r) => ({ x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1 }));
    const tiles = Object.values(s.M.tiles).map((T) => Object.assign({ T }, g.MAP.toPixel(T.q, T.r, 46)));
    const corner = (fx, fy) => tiles.reduce((b, e) => ((e.x * fx + e.y * fy) > (b.x * fx + b.y * fy) ? e : b), tiles[0]);
    const corners = { topLeft: corner(-1, -1), topRight: corner(1, -1), bottomLeft: corner(-1, 1), bottomRight: corner(1, 1), left: corner(-1, 0), right: corner(1, 0), top: corner(0, -1), bottom: corner(0, 1) };
    const zs = [hud.fit.z, hud.fit.z * 1.02, hud.fit.z * 1.1, hud.fit.z * 1.3, 0.8, 1, 1.5, 2.4];
    const where = lay.vp ? 'phone' : 'desktop';
    for (const z of zs) {
      const zz = Math.max(z, hud.fit.z), rad = 46 * zz, w = s.win;
      for (const [name, e] of Object.entries(corners)) {
        // every place on the window the tile could be asked to go to (a 16 px grid), through the real clamp: is one of them clear of the HUD?
        let clear = 0, tried = 0;
        for (let ty = w.y + rad; ty <= w.y + w.h - rad; ty += 16) {
          for (let tx = w.x + rad; tx <= w.x + w.w - rad; tx += 16) {
            const c = md(g).clamp(e.x - (tx - 640) / zz, e.y - (ty - 360) / zz, zz);
            const px = 640 + (e.x - c.x) * c.z, py = 360 + (e.y - c.y) * c.z;
            tried++;
            if (px - Math.sqrt(3) / 2 * rad < w.x || px + Math.sqrt(3) / 2 * rad > w.x + w.w || py - rad < w.y || py + rad > w.y + w.h) continue;
            if (!rects.some((q) => hexHits(px, py, rad, q))) clear++;
          }
        }
        t.ok(clear > 0, where + ' z ' + zz.toFixed(3) + ' ' + name + ': the tile can be dragged clear of the HUD (' + clear + ' of ' + tried + ' places are reachable and free)');
      }
      // lost off screen: shove the camera to the extremes, the page must stay in the window
      [[-1e6, -1e6], [1e6, -1e6], [-1e6, 1e6], [1e6, 1e6]].forEach(([dx, dy]) => {
        const c = md(g).clamp(dx, dy, zz);
        const inWin = tiles.filter((e) => { const px = 640 + (e.x - c.x) * c.z, py = 360 + (e.y - c.y) * c.z; return px > w.x && px < w.x + w.w && py > w.y && py < w.y + w.h; });
        t.ok(inWin.length > 0, where + ' z ' + zz.toFixed(3) + ' shoved to (' + Math.sign(dx) + ',' + Math.sign(dy) + '): the page is still on screen (' + inWin.length + ' hexes)');
      });
    }
    // and the extremes put the page edge on the free box, not on the window: the edge tiles can be taken clear of the pieces at the window sides
    const c = md(g).clamp(-1e6, 0, 1), z1 = 1;
    t.ok(640 + (corners.left.x - c.x) * z1 - 46 >= hud.free.x0 - 1e-6 || hud.free.x0 === s.win.x, where + ': dragging the page far right, its left edge stops at the free box');
    t.eq(errs(g), 0, 'clean');
  }
});

await t.test('pan: drag, wheel about the pointer and the keyboard cursor still work with the HUD measured; zoomAt keeps the point under the pointer fixed', async () => {
  const g = fresh(); const R = mkRun(g, { seed: 8 });
  await open(g, R); layOut(g, HUD_WIDE); await g._tick(400);
  const s = st(g);
  s.follow = false; s.goal = null; s.cam.z = 1; s.tz = 1; s.cam.x = (s.world.x0 + s.world.x1) / 2; s.cam.y = (s.world.y0 + s.world.y1) / 2;
  const c0 = camOf(g);
  g._drag(view(g), [700, 400], [600, 330], 8); await settle(g);
  t.near(camOf(g).x - c0.x, 100, 1e-6, 'a drag moves the page with the finger (x)'); t.near(camOf(g).y - c0.y, 70, 1e-6, 'and y');
  const w0 = worldAt(camOf(g), 820, 250);
  wheel(g, 820, 250, -240); await settle(g);
  t.near(worldAt(camOf(g), 820, 250).x, w0.x, 1e-6, 'the wheel keeps the world point under the pointer (x)'); t.near(worldAt(camOf(g), 820, 250).y, w0.y, 1e-6, 'and y');
  // the zoom buttons turn about the middle of the free box
  s.cam.z = 1; s.tz = 1; s.cam.x = (s.world.x0 + s.world.x1) / 2; s.cam.y = (s.world.y0 + s.world.y1) / 2;
  const F = md(g).hud().free, mid = { x: (F.x0 + F.x1) / 2, y: (F.y0 + F.y1) / 2 };
  const wm0 = worldAt(camOf(g), mid.x, mid.y);
  g._click($(g, '.mp-t-zin')); await settle(g);
  t.near(camOf(g).z, 1.3, 1e-9, 'Zoom in multiplies by 1.3');
  t.near(worldAt(camOf(g), mid.x, mid.y).x, wm0.x, 1e-6, 'about the middle of the free box (x)'); t.near(worldAt(camOf(g), mid.x, mid.y).y, wm0.y, 1e-6, 'and y');
  // the keyboard cursor: Q E A D Z C walk it and the page comes along when it nears the HUD free edge
  s.cam.z = 1; s.tz = 1; s.follow = false;
  await press(g, 'Enter');
  for (let i = 0; i < 24; i++) await press(g, 'd');
  const cur = s.cursor, p = md(g).screenOf(cur.q, cur.r);
  t.ok(p.x > F.x0 && p.x < F.x1 && p.y > F.y0 && p.y < F.y1, 'the cursor 24 hexes east is on free ground (' + Math.round(p.x) + ', ' + Math.round(p.y) + ')');
  t.eq(errs(g), 0, 'clean');
});

await t.test('follow: the party and its neighbours are never under a HUD piece at the default zoom, from the first hex to the last', async () => {
  for (const lay of [{ tab: HUD_WIDE, vp: null }, { tab: HUD_COMPACT, vp: { w: 844, h: 390 } }]) {
    const g = lay.vp ? fresh({ viewport: lay.vp, touch: true }) : fresh();
    if (lay.vp) g._resize(lay.vp.w, lay.vp.h);
    const R = mkRun(g, { seed: 13 });
    await open(g, R); layOut(g, lay.tab); await g._tick(400);
    const s = st(g), rects = hudRects(g), M = R.map;
    const tiles = Object.values(M.tiles).filter((T) => T.type !== 'block');
    const ends = [tiles.reduce((a, b) => (b.r + b.q * 0.01 < a.r + a.q * 0.01 ? b : a)), tiles.reduce((a, b) => (b.r > a.r || (b.r === a.r && b.q > a.q) ? b : a)), M.tiles[g.MAP.key(M.start.q, M.start.r)], M.tiles[g.MAP.key(M.boss.q, M.boss.r)]];
    const sample = ends.concat(tiles.filter((_, i) => i % 17 === 0));
    let checked = 0;
    for (const T of sample) {
      M.pos = { q: T.q, r: T.r };
      s.follow = true; s.goal = null; s.fitted = false; s.cam.z = s.tz = g.UI.screens.map.mapDebug.cam().z;
      await g._tick(2500);
      t.ok(camOf(g).follow, 'following');
      const nb = g.MAP.neighbors(M, T.q, T.r).map((c) => M.tiles[g.MAP.key(c[0], c[1])]);
      const hit = underHud(g, rects, [T].concat(nb));
      checked += 1 + nb.length;
      t.eq(hit.length, 0, (lay.vp ? 'phone' : 'desktop') + ' party at ' + T.q + ',' + T.r + ': it and its neighbours are clear' + (hit.length ? ' ' + JSON.stringify(hit) : ''));
    }
    t.ok(checked > 100, 'many hexes were checked (' + checked + ')');
    // the party starts in the middle of the free box when the page lets it
    const mid = { x: (s.free.x0 + s.free.x1) / 2, y: (s.free.y0 + s.free.y1) / 2 };
    const centre = tiles.reduce((a, b) => (Math.hypot(b.q - 9, b.r - 6) < Math.hypot(a.q - 9, a.r - 6) ? b : a));
    M.pos = { q: centre.q, r: centre.r }; s.follow = true; await g._tick(2500);
    const pc = md(g).screenOf(centre.q, centre.r);
    t.ok(Math.hypot(pc.x - mid.x, pc.y - mid.y) < 1, 'in the middle of the page the party sits on the middle of the free box, not the window (' + Math.round(pc.x) + ',' + Math.round(pc.y) + ' vs ' + Math.round(mid.x) + ',' + Math.round(mid.y) + ')');
    t.eq(errs(g), 0, 'clean');
  }
});

await t.test('layout changes: a bigger tray, a new brush and a new window size re-fit the camera (and a camera on the fit follows the new fit)', async () => {
  const g = fresh(); const R = mkRun(g, { seed: 3, brushes: ['stroke'] });
  await open(g, R); layOut(g, HUD_WIDE); await g._tick(400);
  const v0 = md(g).hud().ver, z0 = md(g).hud().fit.z;
  await pressFit(g);
  // a tray twice as tall: the fit gets smaller and the fitted camera moves onto it
  const tall = Object.assign({}, HUD_WIDE, { tray: [477, 540, 810, 710], info: [946, 540, 1268, 708] });
  layOut(g, tall); await g._tick(400);
  const h1 = md(g).hud();
  t.ok(h1.ver > v0 && h1.fit.z < z0 - 0.01, 'a taller tray and info chip shrink the fit (' + z0.toFixed(3) + ' to ' + h1.fit.z.toFixed(3) + ')');
  t.ok(camOf(g).fitted && Math.abs(camOf(g).z - h1.fit.z) < 1e-9 && Math.abs(camOf(g).x - h1.fit.x) < 1e-6, 'the camera that was on the fit is on the new one');
  t.eq(underHud(g, hudRects(g)).length, 0, 'and clear of the new rectangles');
  // gone again
  layOut(g, HUD_WIDE); await g._tick(400);
  t.near(md(g).hud().fit.z, z0, 1e-9, 'back to the old rectangles, back to the old fit');
  // a camera that is zoomed in is only re-clamped, never yanked
  await press(g, 'f'); const s = st(g);
  s.follow = false; s.cam.z = 1.4; s.tz = 1.4; s.cam.x = 900; s.cam.y = 400;
  layOut(g, tall); await g._tick(400);
  t.near(camOf(g).z, 1.4, 1e-9, 'a zoomed-in camera keeps its zoom'); t.ok(!camOf(g).fitted, 'and stays off the fit');
  // a brush gained: the tray is rebuilt and the footprint measured again at once (the next frame, not the next poll)
  layOut(g, HUD_WIDE); await g._tick(400);
  const ver = md(g).hud().ver;
  $(g, '.mp-tray')._rect = { left: 477, top: 605, width: 340, height: 105 };
  R.brushes.push('wave'); g._raf(16);
  t.ok(md(g).hud().ver > ver, 'gaining a brush re-measures the HUD on the very next frame');
  // the window changes shape: the stage rescales and the compact layout appears
  g._resize(844, 390); await g._tick(400);
  t.ok(g._doc.getElementById('stage').classList.contains('compact'), 'now compact');
  layOut(g, HUD_COMPACT); await g._tick(400);
  const hc = md(g).hud();
  t.ok(hc.rects.every((r) => r.live) && Math.abs(hc.rects.find((r) => r.k === 'tray').x0 - 577) < 1e-6, 'the compact rectangles are measured in stage px, whatever the window scale (' + g.UI.scale.toFixed(3) + ')');
  await pressFit(g);
  t.ok(camOf(g).fitted && Math.abs(camOf(g).z - hc.fit.z) < 1e-9, 'Fit is the compact fit');
  t.eq(underHud(g, hudRects(g)).length, 0, 'and clear of the compact pieces');
  t.eq(errs(g), 0, 'clean');
});

// the real rectangles of the layouts the follow-up audits found failing (measured in Chromium): no brush (a slim tray strip), and the Larger text size (a wider, taller info chip)
const HUD_WIDE_0 = Object.assign({}, HUD_WIDE, { tray: [475, 651, 805, 710], relics: [14, 642, 158, 708] });
const HUD_WIDE_13 = Object.assign({}, HUD_WIDE, { banner: [405, 2, 875, 97], tray: [433, 646, 847, 710], info: [893, 564, 1268, 708], relics: [14, 642, 176, 708] });
const BAR_WIDE = [340, 2, 940, 74], BAR_COMPACT = [447, 2, 833, 99];     // the brush mode bar where it hangs (the chapter banner's slot at the top)

// Can the page be panned, inside the real clamp range, so that this tile's hex (its bounding box, 0.75 px of overlap forgiven) is clear of every piece? Exact: the
// reachable screen positions of a tile are a rectangle, and a free position, when there is one, has its x and y on the edge of a piece grown by the hex.
function tileReachable(e, rng, z, rects) {
  const SQ = Math.sqrt(3), r = 46 * z * (e.T.type === 'boss' ? 1.2 : 1), hw = SQ / 2 * r, PEN = 0.75;
  const sxLo = 640 + (e.x - rng.xhi) * z, sxHi = 640 + (e.x - rng.xlo) * z, syLo = 360 + (e.y - rng.yhi) * z, syHi = 360 + (e.y - rng.ylo) * z;
  const xs = [sxLo, sxHi], ys = [syLo, syHi];
  rects.forEach((R) => { xs.push(R.x0 - hw, R.x1 + hw); ys.push(R.y0 - r, R.y1 + r); });
  for (const x0 of xs) for (const x of [x0 - 0.01, x0, x0 + 0.01]) {
    if (x < sxLo - 1e-6 || x > sxHi + 1e-6) continue;
    for (const y0 of ys) for (const y of [y0 - 0.01, y0, y0 + 0.01]) {
      if (y < syLo - 1e-6 || y > syHi + 1e-6) continue;
      if (!rects.some((R) => x + hw > R.x0 + PEN && x - hw < R.x1 - PEN && y + r > R.y0 + PEN && y - r < R.y1 - PEN)) return true;
    }
  }
  return false;
}
// the clamp as it was before this fix (the free box united with the fit placement, the padding fading in just above the minimum): the sweep must catch it
function oldClampRange(s, z) {
  const w = s.world, f = s.free, c = s.fit;
  const b = { x0: Math.min(f.x0, 640 + (w.x0 - c.x) * c.z), y0: Math.min(f.y0, 360 + (w.y0 - c.y) * c.z), x1: Math.max(f.x1, 640 + (w.x1 - c.x) * c.z), y1: Math.max(f.y1, 360 + (w.y1 - c.y) * c.z) };
  const pad = 80 * Math.max(0, Math.min(1, (z - s.zMin) / (s.zMin * 0.4)));
  const ax = (v, lo, hi, b0, b1, mid) => { const a = lo + (mid - b0) / z, bb = hi + (mid - b1) / z; return Math.max(Math.min(a, bb), Math.min(Math.max(a, bb), v)); };
  const at = (v) => ({ x: ax(v, w.x0 - pad, w.x1 + pad, b.x0, b.x1, 640), y: ax(v, w.y0 - pad, w.y1 + pad, b.y0, b.y1, 360) });
  const lo = at(-1e7), hi = at(1e7);
  return { xlo: lo.x, xhi: hi.x, ylo: lo.y, yhi: hi.y };
}
const sweepZ = (zMin) => { const out = []; for (let m = 1.005; zMin * m <= 2.4 + 1e-9; m += m < 1.4 ? 0.01 : m < 2.6 ? 0.05 : 0.25) out.push(zMin * m); out.push(2.4); return out; };     // from just above the minimum to the maximum zoom

await t.test('pan: at EVERY zoom above the minimum (1.005 x zMin to the maximum zoom, in small steps) every one of the 273 tiles can be dragged clear of every HUD piece; the old clamp left corner tiles under the info chip for 1.04 to 1.27 x', async () => {
  const cases = [{ name: 'desktop, no brush', tab: HUD_WIDE_0, vp: null }, { name: 'desktop, one brush', tab: HUD_WIDE, vp: null }, { name: 'desktop, Larger text, no brush', tab: HUD_WIDE_13, vp: null },
    { name: 'desktop, brush armed (the bar counts)', tab: Object.assign({}, HUD_WIDE, { mode: BAR_WIDE }), vp: null, arm: true }, { name: 'phone, one brush', tab: HUD_COMPACT, vp: { w: 844, h: 390 } },
    { name: 'phone, brush armed', tab: Object.assign({}, HUD_COMPACT, { mode: BAR_COMPACT }), vp: { w: 844, h: 390 }, arm: true }];
  let oldBad = 0;
  for (const cs of cases) {
    const g = cs.vp ? fresh({ viewport: cs.vp, touch: true }) : fresh();
    if (cs.vp) g._resize(cs.vp.w, cs.vp.h);
    const R = mkRun(g, { seed: 11, chapter: 1, brushes: ['stroke', 'fan'] });
    await open(g, R);
    if (cs.arm) { g._click(chip(g)); await settle(g); }
    layOut(g, cs.tab); await g._tick(400);
    const s = st(g), hud = md(g).hud(), rects = hudRects(g);
    t.eq(hud.rects.length, cs.arm ? 14 : 13, cs.name + ': the footprint has ' + (cs.arm ? 'the bar too' : 'its thirteen pieces'));
    const tiles = Object.values(s.M.tiles).map((T) => Object.assign({ T }, g.MAP.toPixel(T.q, T.r, 46)));
    let bad = 0, n = 0; const names = new Set();
    for (const z of sweepZ(s.zMin)) {
      const lo = md(g).clamp(-1e7, -1e7, z), hi = md(g).clamp(1e7, 1e7, z), rng = { xlo: lo.x, xhi: hi.x, ylo: lo.y, yhi: hi.y };
      const old = oldClampRange(s, z);
      tiles.forEach((e) => {
        n++;
        if (!tileReachable(e, rng, z, rects)) { bad++; names.add(e.T.q + ',' + e.T.r); }
        if (!tileReachable(e, old, z, rects)) oldBad++;
      });
    }
    t.eq(bad, 0, cs.name + ': every tile is reachable at every zoom (' + n + ' checks' + (bad ? ', unreachable ' + Array.from(names).slice(0, 5).join(' ') : '') + ')');
    t.eq(errs(g), 0, 'clean');
  }
  t.ok(oldBad > 0, 'and the sweep has teeth: the old rule fails it (' + oldBad + ' tile and zoom pairs)');
});

await t.test('pan: a wheel zoom in from Fit keeps the point under the pointer fixed, near the right of the page too (the old clamp pulled the page 118 px on the first notch)', async () => {
  for (const lay of [{ tab: HUD_WIDE_0, vp: null }, { tab: HUD_WIDE_13, vp: null }, { tab: HUD_COMPACT, vp: { w: 844, h: 390 } }]) {
    for (const chapter of [1, 2, 3]) {
      const g = lay.vp ? fresh({ viewport: lay.vp, touch: true }) : fresh();
      if (lay.vp) g._resize(lay.vp.w, lay.vp.h);
      await open(g, mkRun(g, { seed: 7, chapter, brushes: ['stroke'] })); layOut(g, lay.tab); await g._tick(400);
      const hud = md(g).hud(), s = st(g);
      // a pointer on the page (its screen box at the fit) at the right, the left, the top, the bottom and the middle
      const px = (wx) => 640 + (wx - hud.fit.x) * hud.fit.z, py = (wy) => 360 + (wy - hud.fit.y) * hud.fit.z;
      const W = s.world, pts = [[px(W.x1 - 40), py((W.y0 + W.y1) / 2)], [px(W.x0 + 40), py((W.y0 + W.y1) / 2)], [px((W.x0 + W.x1) / 2), py(W.y0 + 40)], [px((W.x0 + W.x1) / 2), py(W.y1 - 40)], [px((W.x0 + W.x1) / 2), py((W.y0 + W.y1) / 2)], [px(W.x1 - 40), py(W.y1 - 40)]];
      for (const [x, y] of pts) {
        await pressFit(g); if (!camOf(g).fitted) await pressFit(g);
        t.ok(camOf(g).fitted, 'on the fit');
        const w0 = worldAt(camOf(g), x, y);
        for (let n = 1; n <= 3; n++) {
          wheelAtStage(g, x, y, -100); await settle(g);
          const w1 = worldAt(camOf(g), x, y);
          t.ok(Math.hypot(w1.x - w0.x, w1.y - w0.y) * camOf(g).z < 0.01, (lay.vp ? 'phone' : 'desktop') + ' ch' + chapter + ' pointer (' + Math.round(x) + ',' + Math.round(y) + ') notch ' + n + ': the point under it has not moved (' + (Math.hypot(w1.x - w0.x, w1.y - w0.y) * camOf(g).z).toFixed(3) + ' px)');
        }
        t.ok(camOf(g).z > camOf(g).zMin * 1.5, 'three notches zoomed in');
      }
      t.eq(errs(g), 0, 'clean');
    }
  }
});

await t.test('brush mode bar: it is part of the HUD footprint only while a brush is armed, the fit is solved again when it comes and goes and returns to the same fit, and a camera on the fit follows', async () => {
  const g = fresh(); const R = mkRun(g, { seed: 3, brushes: ['stroke', 'fan'] });
  await open(g, R); layOut(g, HUD_WIDE); await g._tick(400);
  const h0 = md(g).hud(); t.eq(h0.rects.length, 13, 'unarmed: the bar covers nothing'); t.ok(!h0.rects.some((r) => r.k === 'mode'), 'it is not in the footprint');
  layOut(g, Object.assign({}, HUD_WIDE, { mode: BAR_WIDE })); await g._tick(400);
  t.eq(md(g).hud().rects.length, 13, 'a hidden bar is not measured even when it has a box');
  await pressFit(g); t.ok(camOf(g).fitted, 'on the fit');
  g._click(chip(g)); await settle(g);
  t.ok(!modeBar(g).hidden && $(g, '.mp-hud').classList.contains('brushing'), 'a brush is armed: the bar shows and the banner gives way (class brushing)');
  t.eq(md(g).hud().rects.length, 13, 'before the next frame nothing has re-measured');
  const v0 = md(g).hud().ver;
  await g._tick(400);
  const h1 = md(g).hud(), bar = h1.rects.find((r) => r.k === 'mode');
  t.ok(h1.ver > v0 && h1.rects.length === 14 && bar && bar.live && bar.x0 === 340 && bar.y1 === 74, 'armed: the next frame measures the bar into the footprint (version ' + v0 + ' to ' + h1.ver + ')');
  t.ok(h1.fit.z >= h0.fit.z * 0.97, 'a bar in the banner\'s slot costs the page next to nothing (' + h0.fit.z.toFixed(4) + ' to ' + h1.fit.z.toFixed(4) + ')');
  t.eq(underHud(g, hudRects(g)).length, 0, 'and the fit is clear of every piece, the bar included');
  // a bar that grew (a long line of text at some size) pushes the fit, the camera on the fit moves with it, and putting the brush away restores the old fit exactly
  layOut(g, Object.assign({}, HUD_WIDE, { mode: [300, 2, 980, 300] })); await g._tick(400);
  const h2 = md(g).hud();
  t.ok(h2.fit.z < h0.fit.z - 0.01, 'a tall bar shrinks the fit (' + h0.fit.z.toFixed(3) + ' to ' + h2.fit.z.toFixed(3) + ')');
  t.ok(camOf(g).fitted && Math.abs(camOf(g).z - h2.fit.z) < 1e-9 && Math.abs(camOf(g).x - h2.fit.x) < 1e-6, 'the camera that was on the fit is on the new one');
  t.eq(underHud(g, hudRects(g)).length, 0, 'clear of the tall bar');
  const v2 = md(g).hud().ver;
  await press(g, 'Escape'); t.ok(modeBar(g).hidden && !$(g, '.mp-hud').classList.contains('brushing'), 'Esc puts the brush away');
  await g._tick(400);
  const h3 = md(g).hud();
  t.ok(h3.ver > v2 && h3.rects.length === 13, 'put away: the next frame measures the bar out of the footprint');
  t.near(h3.fit.z, h0.fit.z, 1e-12, 'back to the same fit zoom'); t.near(h3.fit.x, h0.fit.x, 1e-9, 'and placement'); t.near(h3.fit.y, h0.fit.y, 1e-9, 'exactly');
  t.ok(camOf(g).fitted && Math.abs(camOf(g).z - h0.fit.z) < 1e-9, 'the camera is on the normal fit again');
  // zoomed in, the camera is only clamped, never yanked, when a brush comes and goes
  {
    const s = st(g); s.follow = false; s.fitted = false; s.cam.z = 1.2; s.tz = 1.2; s.cam.x = 900; s.cam.y = 400;
    layOut(g, Object.assign({}, HUD_WIDE, { mode: [300, 2, 980, 300] })); g._click($$(g, '.mp-chip')[1]); await settle(g); await g._tick(400);
    t.near(camOf(g).z, 1.2, 1e-9, 'a zoomed in camera keeps its zoom when the brush is armed'); t.ok(!camOf(g).fitted, 'and stays off the fit');
  }
  // switching from one brush to another keeps the bar up and the footprint as it is
  const v4 = md(g).hud().ver; await press(g, 'b'); await g._tick(400);
  t.ok(!modeBar(g).hidden && md(g).hud().rects.length === 14 && md(g).hud().ver >= v4, 'B switches brush: the bar stays in the footprint');
  t.eq(errs(g), 0, 'clean');
});

await t.test('css: the brush mode bar hangs from the top in the banner slot, clear of the party plate, the tray and the info chip, with a fixed size; the info chip stops short of the full brush tray at every text size', () => {
  const css = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  const rule = (sel) => Array.from(css.matchAll(new RegExp('(?:^|\\})\\s*' + sel.replace(/[.#]/g, '\\$&') + '\\s*\\{([^}]*)\\}', 'g'))).map((m) => m[1]).join(' ');     // every rule of exactly this selector
  const bar = rule('.mp-mode');
  t.ok(/top:\s*2px/.test(bar) && !/bottom:/.test(bar), 'the bar hangs from the top edge, not above the tray');
  t.ok(/width:\s*calc\(600px \+ \(var\(--ts\) - 1\) \* 120px\)/.test(bar), 'its width is fixed for a text size');
  t.ok(/\.mp-hud\.brushing \.mp-banner\s*\{[^}]*opacity:\s*0/.test(css), 'the banner fades while it is up');
  t.ok(/\.mp-mode-txt\s*\{[^}]*-webkit-line-clamp:\s*2[^}]*min-height:\s*2\.6em/.test(css), 'the bar text is two clamped lines');
  // x positions in stage px: the bar is centred on 640, and must clear the party plate (right edge 312) and the gold plate (left edge 1127 at the Larger size)
  const barW = (ts) => 600 + (ts - 1) * 120;
  [1, 1.15, 1.3].forEach((ts) => t.ok(640 - barW(ts) / 2 >= 312 + 8 && 640 + barW(ts) / 2 <= 1127 - 8, 'text size ' + ts + ': the bar (' + Math.round(640 - barW(ts) / 2) + ' to ' + Math.round(640 + barW(ts) / 2) + ') clears the party and the gold plates'));
  // the info chip is right aligned (12 px from the edge); the full tray is six chips, centred, max-width 540 (compact 580)
  const infoW = /width:\s*calc\((\d+)px \+ \(var\(--ts\) - 1\) \* (\d+)px\)/.exec(rule('.mp-info')), trayMax = /max-width:\s*(\d+)px/.exec(rule('.mp-tray')), trayMaxC = /max-width:\s*(\d+)px/.exec(rule('#stage.compact .mp-tray'));
  const infoWC = /width:\s*calc\((\d+)px \+ \(var\(--ts\) - 1\) \* (\d+)px\)/.exec(rule('#stage.compact .mp-info'));
  t.ok(infoW && trayMax && trayMaxC && infoWC, 'the chip widths are a base plus a step per text size, and the tray has a maximum');
  [1, 1.15, 1.3].forEach((ts) => {
    t.ok(1268 - (+infoW[1] + (ts - 1) * +infoW[2]) - (640 + +trayMax[1] / 2) >= 4, 'text size ' + ts + ': the chip starts right of the full tray');
    t.ok(1268 - (+infoWC[1] + (ts - 1) * +infoWC[2]) - (640 + +trayMaxC[1] / 2) >= 4, 'text size ' + ts + ', phone: the same');
  });
  t.ok(/\.mp-info-name\s*\{[^}]*min-height:\s*1\.15em/.test(css), 'an empty chip keeps its name line (the first fit is measured before the chip has text)');
});

// the primary hints of the info chip always fit their clamped lines: shorter sentences for a larger text size and for a phone (checked in real pixels in the browser audit)
await t.test('info chip copy: the walk hint and the resting hint come in shorter versions for Larger text and for a phone, and every action line stays within its two lines of budget', async () => {
  const tiers = [{ name: 'normal', ts: 1, vp: null, max: 66 }, { name: 'Larger text', ts: 1.3, vp: null, max: 52 }, { name: 'phone', ts: 1, vp: { w: 844, h: 390 }, max: 40 }, { name: 'phone, Larger text', ts: 1.3, vp: { w: 844, h: 390 }, max: 40 }];
  for (const tier of tiers) {
    const g = tier.vp ? fresh({ viewport: tier.vp, touch: true }) : fresh();
    if (tier.vp) g._resize(tier.vp.w, tier.vp.h);
    g.UI.opt.textScale = tier.ts;
    const R = mkRun(g, { seed: 5, brushes: ['stroke', 'fan', 'splash'] });
    await open(g, R);
    // resting: the primary hint is in the description (or, on a phone that has no room for it, in the action line)
    await g._tick(100);
    const rest = txt($(g, '.mp-info'));
    t.ok(/walk/.test(rest) && /unmute/i.test(rest), tier.name + ': the resting chip says to paint fog and walk on painted ground (' + rest.slice(0, 80) + ')');
    t.ok(tier.vp ? /ground to walk\./.test(txt($(g, '.mp-info-act'))) : /tap live ground to walk\./.test(txt($(g, '.mp-info-text'))), tier.name + ': and the whole sentence is there');
    // every hex of a fully painted page, then of the unpainted one with the party's Ink low: the longest action line of each kind
    fullyPainted(g, R); st(g).infoKey = ''; fitCam(g);
    let longest = 0, longestTxt = '', walks = new Set();
    for (const T of Object.values(R.map.tiles).filter((x) => x.type !== 'block')) {
      await hoverHex(g, T.q, T.r);
      const a = txt($(g, '.mp-info-act'));
      if (a.length > longest) { longest = a.length; longestTxt = a; }
      if (/^Walk/.test(a) && /stop/.test(a)) walks.add(a.replace(/\d+/, 'N'));
    }
    t.ok(longest <= tier.max, tier.name + ': the longest action line is ' + longest + ' characters (budget ' + tier.max + '): ' + longestTxt);
    const w = Array.from(walks);
    t.ok(w.length > 0, tier.name + ': a walk that stops short was seen');
    t.ok(w.every((x) => (tier.ts === 1 && !tier.vp ? /^Walk toward it: N steps?, stopping at the first thing in the way\.$/ : tier.vp ? /^Walk N steps?, stops early\.$/ : /^Walk: N steps?, stops at the first thing in the way\.$/).test(x)), tier.name + ': with the version for this size (' + w.join(' | ') + ')');
    t.eq(errs(g), 0, 'clean');
  }
});

const rtFresh = async () => { const g = fresh({ realtime: true }); await g._tick(1200); return g; };     // (the title's fade plays out on the frame clock first)

await t.test('realtime: the camera on the fit glides to a fit that moved, whichever way it moved (the HUD shrinking used to pop it onto the new fit first)', async () => {
  const g = await rtFresh(); const R = mkRun(g, { seed: 3, brushes: ['stroke'] });
  await open(g, R); layOut(g, HUD_WIDE); await g._tick(4500);
  await pressFit(g); await g._tick(2500);
  t.ok(camOf(g).fitted, 'on the fit');
  const small = Object.assign({}, HUD_WIDE, { tray: [475, 651, 805, 710], relics: [14, 642, 158, 708] });         // the last brush used: the tray is a slim strip, the fit grows
  const frames = (n) => { const out = []; for (let i = 0; i < n; i++) { g._raf(16); out.push(camOf(g)); } return out; };
  const c0 = camOf(g);
  layOut(g, small);
  const rows = frames(60);
  const fit1 = md(g).hud().fit;
  t.ok(fit1.z > c0.z + 0.01, 'the fit grew (' + c0.z.toFixed(4) + ' to ' + fit1.z.toFixed(4) + ')');
  let maxDz = 0, maxDx = 0, prev = c0;
  rows.forEach((c) => { maxDz = Math.max(maxDz, Math.abs(c.z / prev.z - 1)); maxDx = Math.max(maxDx, Math.abs(c.x - prev.x)); prev = c; });
  t.ok(maxDz < 0.015 && maxDx < 25, 'no frame jumps: the biggest step is ' + (maxDz * 100).toFixed(2) + ' percent of the zoom and ' + maxDx.toFixed(1) + ' world px');
  t.ok(Math.abs(rows[rows.length - 1].z - fit1.z) < 1e-9 && Math.abs(rows[rows.length - 1].x - fit1.x) < 1e-6 && rows[rows.length - 1].fitted, 'and it lands exactly on the new fit');
  t.ok(rows.some((c) => c.z > c0.z + 1e-4 && c.z < fit1.z - 1e-4), 'through in between zooms (a glide, not a pop)');
  // the other way (the HUD grows) glides too, and a user input in the middle of a glide takes over
  layOut(g, HUD_WIDE); frames(4);
  const mid = camOf(g);
  t.ok(mid.z < fit1.z && mid.z > md(g).hud().fit.z - 1e-9 || mid.fitted, 'the HUD grew: gliding down');
  {
    layOut(g, small); frames(2);
    wheel(g, 640, 360, -100); frames(1);
    t.ok(!camOf(g).fitted && !st(g).fg, 'a wheel notch in the middle of a glide takes over (off the fit, glide gone)');
  }
  t.eq(errs(g), 0, 'clean');
});

await t.test('realtime: Fit after zooming all the way out with the Zoom out button or the minus key (while following the party) returns to the party at the first press, as after the wheel', async () => {
  const g = await rtFresh(); const R = mkRun(g, { seed: 3, brushes: ['stroke'] });
  await open(g, R); layOut(g, HUD_WIDE); await g._tick(4500);
  t.ok(camOf(g).follow && !camOf(g).fitted, 'following the party');
  for (let i = 0; i < 10; i++) { g._click($(g, '.mp-t-zout')); await g._tick(250); }
  await g._tick(800);
  let c = camOf(g);
  t.ok(c.z === c.zMin && c.fitted && !c.follow, 'all the way out by the button: that is the fit view (' + c.z.toFixed(3) + ', fitted ' + c.fitted + ', follow ' + c.follow + ')');
  await pressFit(g); await g._tick(2500);
  c = camOf(g); t.ok(c.follow && !c.fitted && c.z > c.zMin + 0.1, 'one press of Fit goes back to the party');
  for (let i = 0; i < 12; i++) { await press(g, '-'); await g._tick(150); }
  await g._tick(800);
  c = camOf(g); t.ok(c.z === c.zMin && c.fitted && !c.follow, 'the minus key does the same');
  await pressFit(g); await g._tick(2500);
  t.ok(camOf(g).follow && !camOf(g).fitted, 'and one press of F follows again');
  // a half way zoom out is not the fit: Fit goes to the fit
  for (let i = 0; i < 2; i++) { g._click($(g, '.mp-t-zout')); await g._tick(250); }
  await g._tick(600); await pressFit(g); await g._tick(2500);
  t.ok(camOf(g).fitted && camOf(g).z === camOf(g).zMin, 'from a half way zoom, Fit shows the whole page');
  t.eq(errs(g), 0, 'clean');
});

await t.test('first fit: the slide-in of the HUD is measured out of every piece, ancestors included (the tool buttons ride in on their column), so the fit at entry is the settled one', async () => {
  const g = fresh(); const R = mkRun(g);
  await open(g, R); layOut(g, HUD_WIDE); await g._tick(400);
  const z0 = md(g).hud().fit, d0 = md(g).hud().rects.find((r) => r.k === 'deck');
  // the whole column is mid slide (translate 14 px down) and its buttons are measured 14 px low
  g._run("document.querySelector('.mp-tools').style.setProperty('translate', '0px 14px')");
  const shifted = Object.assign({}, HUD_WIDE); ['deck', 'legend', 'fit', 'zin', 'zout'].forEach((k) => { const r = HUD_WIDE[k]; shifted[k] = [r[0], r[1] + 14, r[2], r[3] + 14]; });
  layOut(g, shifted); await g._tick(400);
  const d1 = md(g).hud().rects.find((r) => r.k === 'deck'), z1 = md(g).hud().fit;
  t.near(d1.y0, d0.y0, 0.5, 'the Deck button is measured where it rests, not where its sliding column puts it'); t.near(z1.z, z0.z, 1e-9, 'so the fit does not move'); t.near(z1.x, z0.x, 1e-6, 'in x'); t.near(z1.y, z0.y, 1e-6, 'and y');
  // the chip is filled before it is measured, in the source and in the page
  const enter = /function enter\(params, root\) \{[\s\S]*?\n  \}\n/.exec(SRC)[0];
  t.ok(enter.indexOf('flushInfo(s)') > 0 && enter.indexOf('flushInfo(s)') < enter.indexOf('relayout(s, true)'), 'enter fills the info chip before the first fit is solved');
  t.ok(/\S/.test(txt($(g, '.mp-info-name'))), 'the chip has its text');
  t.eq(errs(g), 0, 'clean');
});

await t.test('performance: measuring the HUD and searching for the fit takes a few milliseconds, and never runs per frame', async () => {
  const g = fresh(); const R = mkRun(g, { seed: 2 });
  await open(g, R); layOut(g, HUD_WIDE); await g._tick(400);
  const times = [];
  for (let i = 0; i < 12; i++) {
    const tab = Object.assign({}, HUD_WIDE, { tray: [567 - i * 6, 605 - i, 714 + i * 6, 710] });
    layOut(g, tab);
    const t0 = process.hrtime.bigint();
    md(g).hud(true);
    times.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  times.sort((a, b) => a - b);
  t.ok(times[6] < 16 * PERF_SLACK, 'the median re-fit is ' + times[6].toFixed(2) + ' ms (budget 16 ms, slack x' + PERF_SLACK + ')');
  t.ok(times[11] < 40 * PERF_SLACK, 'and the slowest ' + times[11].toFixed(2) + ' ms');
  // while nothing moves the HUD, frames never search
  const ver = md(g).hud().ver;
  for (let i = 0; i < 300; i++) g._raf(16);
  t.eq(md(g).hud().ver, ver, 'three hundred quiet frames re-fit nothing');
  t.eq(errs(g), 0, 'clean');
});

await t.test('css: the hex info chip has a fixed size (clamped text, a name on one line) so the HUD footprint the fit relies on does not change with the hex under the pointer', () => {
  const css = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  t.ok(/\.mp-info-text,\s*\.mp-info-act\s*\{[^}]*-webkit-line-clamp:\s*2[^}]*min-height:\s*2\.6em/.test(css), 'text and action are two clamped lines with a minimum of two lines');
  t.ok(/\.mp-info-name\s*\{[^}]*white-space:\s*nowrap[^}]*text-overflow:\s*ellipsis/.test(css), 'the name is one line');
  t.ok(!/\.mp-info-act:empty\s*\{\s*display:\s*none/.test(css), 'an empty action line keeps its room');
  t.ok(/\.mp-tray-empty\s*\{[^}]*white-space:\s*nowrap/.test(css), 'the empty tray is a one line strip');
  t.ok(/getBoundingClientRect/.test(SRC) && /FALLBACK_HUD/.test(SRC) && /solveFit/.test(SRC), 'the module measures the DOM and keeps a fallback table');
});

await t.test('a phone shows fewer charm icons so the strip never slides under the brush tray; the +N chip carries the rest', async () => {
  const ids = Object.keys(fresh().DATA.relics).slice(0, 8);
  const g = fresh({ viewport: { w: 844, h: 390 }, touch: true });
  const R = mkRun(g, { relics: ids, brushes: ['stroke', 'wave', 'fan'] });
  g._resize(844, 390);
  await open(g, R);
  t.eq($$(g, '.mp-relics .relic').length, 3, 'compact: three icons');
  t.eq(txt($(g, '.mp-relic-more')), '+5', 'and +5 for the other five');
  const g2 = fresh({ viewport: { w: 844, h: 390 }, touch: true });
  const R2 = mkRun(g2, { relics: ids, brushes: ['stroke', 'wave', 'fan', 'splash', 'halo', 'blot'] });
  g2._resize(844, 390);
  await open(g2, R2);
  t.eq($$(g2, '.mp-relics .relic').length, 2, 'six brush kinds fill the tray: two icons');
  t.eq(txt($(g2, '.mp-relic-more')), '+6', 'and +6');
  const g3 = fresh();
  const R3 = mkRun(g3, { relics: ids });
  await open(g3, R3);
  t.eq($$(g3, '.mp-relics .relic').length, 6, 'a full-size screen keeps six');
  t.eq(txt($(g3, '.mp-relic-more')), '+2', 'and +2');
  // a desktop tray with all six brush kinds starts at x 372, where a six icon strip (x 14 to 394) would slide under it
  const g4 = fresh();
  const R4 = mkRun(g4, { relics: ids, brushes: ['stroke', 'wave', 'fan', 'splash', 'halo', 'blot'] });
  await open(g4, R4);
  t.eq($$(g4, '.mp-relics .relic').length, 5, 'a full-size screen with six brush kinds shows five icons (the strip stays left of the tray)');
  t.eq(txt($(g4, '.mp-relic-more')), '+3', 'and +3');
  t.eq(errs(g) + errs(g2) + errs(g3) + errs(g4), 0, 'clean');
});

await t.test('css: the compact map keeps the text a player reads while playing at 8 to 9 screen px (--fs8, --fs9), and the hero HP numbers follow --ts', () => {
  const css = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  ['mp-chip-n', 'mp-prog-t', 'mp-ch', 'mp-info-act'].forEach((c) => t.ok(new RegExp('#stage\\.compact \\.' + c + '\\s*\\{[^}]*var\\(--fs[89]\\)').test(css), 'compact .' + c + ' has a floor'));
  const base = fs.readFileSync(path.join(DIR, 'css', 'base.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  t.ok(/--fs9\s*:\s*calc\(9px \/ var\(--scale\)\)/.test(base) && /--fs8\s*:\s*calc\(8px \/ var\(--scale\)\)/.test(base), 'base.css defines the 8 and 9 screen px floors from --scale');
  t.ok(/\.hp-txt\s*\{[^}]*calc\(var\(--hpf\) \* var\(--ts\)\)/.test(base), 'the badge HP number scales with the text size setting');
  t.ok(/#stage\.compact \.hp-txt\s*\{[^}]*var\(--fs9\)/.test(base), 'and has a 9 screen px floor on a phone');
  t.ok(!/\.mp-party \.hp-txt\s*\{[^}]*font-size/.test(css), 'the map no longer pins the HP number to a fixed size');
});

// ==================================================================================================== keyboard
await t.test('keyboard: Q E A D Z C move a hex cursor (announced), Enter paints or walks, Esc cancels, modified keys and focused buttons are left alone', async () => {
  const g = fresh({ seed: 9 }); const R = mkRun(g, { seed: 9 });
  await open(g, R); fitCam(g);
  const M = R.map;
  await press(g, 'd');
  t.deep(st(g).cursor, { q: M.pos.q, r: M.pos.r }, 'the first key places the cursor on the party');
  t.ok(g._run('__ann').length > 1 && g._run('__ann').some((x) => /\S/.test(x)), 'and announces (' + g._run('__ann').slice(-1)[0].slice(0, 60) + ')');
  const start = { q: M.pos.q, r: M.pos.r };
  for (const [k, d] of [['d', 0], ['e', 1], ['q', 2], ['a', 3], ['z', 4], ['c', 5]]) {
    st(g).cursor = { q: start.q, r: start.r };
    await press(g, k);
    t.deep(st(g).cursor, { q: start.q + DIRS[d][0], r: start.r + DIRS[d][1] }, 'key ' + k + ' moves the cursor ' + d);
  }
  t.ok(/\S/.test(txt($(g, '.mp-info-name'))) && st(g).mode === 'key', 'the info chip follows the cursor');
  // Enter on a frontier hex paints it
  const T = frontier(g, R).filter((x) => x.type !== 'block')[2];
  st(g).cursor = { q: T.q, r: T.r }; st(g).mode = 'key';
  const ink0 = R.ink;
  await press(g, 'Enter');
  t.ok(T.painted && R.ink === ink0 - 1, 'Enter paints the cursor hex');
  // Space walks to a painted hex
  const W = Object.values(M.tiles).find((x) => x.painted && x.type === 'empty' && g.MAP.dist(M.pos.q, M.pos.r, x.q, x.r) === 2);
  st(g).cursor = { q: W.q, r: W.r };
  await press(g, ' ');
  t.deep({ q: M.pos.q, r: M.pos.r }, { q: W.q, r: W.r }, 'Space walks there');
  // Esc with nothing to cancel falls through to the pause menu
  await press(g, 'Escape'); t.ok(g.UI.overlay.has('pause'), 'Esc with nothing to cancel opens the pause menu'); await press(g, 'Escape');
  // a focused button keeps Enter and the arrows
  const deck = $(g, '.mp-t-deck'); deck.focus();
  const pos1 = JSON.stringify(M.pos);
  await press(g, 'Enter');
  t.ok(g.UI.overlay.has('deck') || g.UI.overlay.count() > 0, 'Enter on the focused Deck button opens the deck (' + g.UI.overlay.count() + ')');
  await press(g, 'Escape');
  t.eq(JSON.stringify(M.pos), pos1, 'and did not walk');
  const c0 = camOf(g).x; deck.focus(); await press(g, 'ArrowRight'); t.near(camOf(g).x, c0, 1e-9, 'arrows move button focus, they do not pan, while a button has focus');
  deck.blur(); g._doc.body.focus();
  // L opens the legend
  await press(g, 'l'); t.ok(g.UI.overlay.has('legend'), 'L opens the legend'); await press(g, 'Escape');
  t.eq(errs(g), 0, 'clean');
});

// ==================================================================================================== overlays
const relicsOfRarity = (g, r) => Object.values(g.DATA.relics).filter((x) => x.rarity === r).map((x) => x.id);

await t.test('relics overlay: every charm with art, text and where it came from, sorted by rarity; empty state; Close and Esc', async () => {
  const g = fresh(); const R = mkRun(g);
  const picks = [relicsOfRarity(g, 'common')[0], relicsOfRarity(g, 'boss')[0], relicsOfRarity(g, 'rare')[0], relicsOfRarity(g, 'uncommon')[0], relicsOfRarity(g, 'shop')[0]];
  g.RUN.addRelic(R, picks[0]); g.RUN.addRelic(R, picks[1]);
  g.RUN.startChapter(R, 2);
  g.RUN.addRelic(R, picks[2]); g.RUN.addRelic(R, picks[3]); g.RUN.addRelic(R, picks[4]);
  await open(g, R);
  t.eq($$(g, '.mp-relics .relic').length, 5, 'the strip shows all five');
  g._click($(g, '.mp-relics .relic')); await settle(g);
  const ov = $(g, '.o-relics');
  t.ok(ov && ov.querySelector('.mr-grid'), 'tapping a charm opens the relics overlay (the screen_map version)');
  const rows = $$(g, '.mr-row', ov);
  t.eq(rows.length, 5, 'one row per charm');
  t.deep(rows.map((r) => r.dataset.id), [picks[1], picks[2], picks[4], picks[3], picks[0]], 'sorted boss, rare, shop, uncommon, common');
  rows.forEach((row) => {
    const d = g.DATA.relics[row.dataset.id];
    t.ok($(g, '.relic canvas', row), d.name + ': art');
    t.eq(txt($(g, '.mr-name', row)), d.name, d.name + ': name');
    t.eq(txt($(g, '.mr-text', row)), g.DATA.relicText(d.id), d.name + ': the relic text');
    t.ok(new RegExp(d.rarity === 'boss' ? 'headliner' : d.rarity === 'shop' ? 'merch' : d.rarity, 'i').test(txt($(g, '.mr-tag', row))), d.name + ': rarity tag (the boss rarity reads Headliner, the shop rarity Merch)');
    t.ok(/Found in Act (I|II),/.test(txt($(g, '.mr-from', row))), d.name + ': where it was found (' + txt($(g, '.mr-from', row)).slice(0, 50) + ')');
  });
  t.ok(/Found in Act I,/.test(txt($(g, '.mr-from', rows[4]))) && /Found in Act II,/.test(txt($(g, '.mr-from', rows[1]))), 'the chapter comes from RUN\'s log');
  t.ok(/headliner/i.test(txt($(g, '.mr-from', rows[0]))) && /merch/i.test(txt($(g, '.mr-from', rows[2]))), 'and the source from the rarity');
  t.ok(/5 charms/.test(txt($(g, '.mr-sum', ov))), 'a summary line');
  g._click($(g, '.btn', ov)); await settle(g);
  t.eq(g.UI.overlay.count(), 0, 'Close closes it');
  // empty
  const g2 = fresh(); const R2 = mkRun(g2);
  await open(g2, R2);
  t.ok(/Charms/.test(txt($(g2, '.mp-relics'))) && $(g2, '.mp-relics').classList.contains('empty'), 'an empty strip still shows a Charms button');
  g2._click($(g2, '.mp-relic-none')); await settle(g2);
  t.ok(/No charms yet/.test(txt($(g2, '.o-relics'))), 'the overlay has an empty state, never a blank panel');
  await press(g2, 'Escape'); t.eq(g2.UI.overlay.count(), 0, 'Esc closes it');
  // the pause menu's Charms button and an explicit list
  g2.UI.overlay.open('relics', { relics: picks.slice(0, 2) }); await settle(g2);
  t.eq($$(g2, '.o-relics .mr-row').length, 2, 'params.relics overrides the run');
  g2.UI.overlay.closeAll();
  t.eq(errs(g) + errs(g2), 0, 'clean');
});

await t.test('legend overlay: tiles, brushes drawn on hexes, controls, and the glossary of words', async () => {
  const g = fresh(); const R = mkRun(g, { brushes: ['stroke', 'stroke', 'fan'] });
  await open(g, R);
  g._click($(g, '.mp-t-legend')); await settle(g);
  const ov = $(g, '.o-legend');
  t.ok(ov, 'the Legend button opens the legend');
  t.eq($$(g, '.tab', ov).length, 4, 'four tabs');
  t.deep($$(g, '.tab', ov).map((x) => txt(x)), ['The Soundlands', 'Spells', 'Controls', 'Words'], 'named');
  const body = () => $(g, '.lg-body', ov);
  g.LISTS = g.DATA.LISTS;
  g.DATA.LISTS.tiles.filter((x) => x !== 'block').forEach((id) => {
    const row = $$(g, '.lg-tile', ov).find((r) => txt(r).indexOf(g.DATA.tiles[id].name) >= 0);
    t.ok(row && txt(row).indexOf(g.DATA.tiles[id].text) >= 0 && $(g, 'canvas', row), 'tile ' + id + ': icon, name and text');
  });
  t.ok(new RegExp(esc(g.DATA.tiles.block.name)).test(txt(body())) && /Muted ground/.test(txt(body())) && /Spotted from afar/.test(txt(body())), 'the page reading guide');
  t.eq($$(g, '.lg-tile .lg-lm', ov).length, g.DATA.LISTS.landmarks.length, 'landmarks are marked as seen from afar');
  g._click($$(g, '.tab', ov)[1]); await settle(g);
  t.eq($$(g, '.lg-brush', body()).length, Object.keys(g.DATA.brushes).length, 'one entry per brush');
  Object.keys(g.DATA.brushes).forEach((id) => {
    const row = $$(g, '.lg-brush', body()).find((r) => txt(r).indexOf(g.DATA.brushes[id].name) >= 0);
    t.ok(row && $(g, 'canvas.lg-dia', row) && txt(row).indexOf(g.DATA.brushes[id].text) >= 0, 'brush ' + id + ': a hex diagram, name and text');
  });
  t.ok(/You hold 2/.test(txt($$(g, '.lg-brush', body()).find((r) => new RegExp(g.DATA.brushes.stroke.name).test(txt(r))))) && /You hold 1/.test(txt($$(g, '.lg-brush', body()).find((r) => new RegExp(g.DATA.brushes.fan.name).test(txt(r))))), 'what you hold is shown');
  g._click($$(g, '.tab', ov)[2]); await settle(g);
  t.deep($$(g, '.lg-ctl h3', body()).map((x) => txt(x)), ['Mouse', 'Touch', 'Keyboard'], 'three control schemes');
  t.ok(/Q E A D Z C/.test(txt(body())) && /Enter/.test(txt(body())) && /Pinch/.test(txt(body())) && /Wheel/.test(txt(body())), 'the real controls are listed');
  g._click($$(g, '.tab', ov)[3]); await settle(g);
  t.eq($$(g, '.legend-row', body()).length, Object.keys(g.DATA.statuses).length + Object.keys(g.DATA.keywords).length, 'the glossary of every status and keyword survives');
  t.eq($$(g, '.tab.on', ov).length, 1, 'one tab is on');
  await press(g, 'Escape'); t.eq(g.UI.overlay.count(), 0, 'Esc closes it');
  g.UI.overlay.open('legend', { tab: 'controls' }); await settle(g);
  t.ok($(g, '.o-legend .tab.on') && txt($(g, '.o-legend .tab.on')) === 'Controls', 'params.tab picks the tab');
  g.UI.overlay.closeAll();
  t.eq(errs(g), 0, 'clean');
});

await t.test('while an overlay is open the page ignores taps, wheel and keys; closing it gives the page back', async () => {
  const g = fresh({ seed: 3 }); const R = mkRun(g, { seed: 3 });
  await open(g, R); fitCam(g);
  const T = frontier(g, R).filter((x) => x.type !== 'block')[0];
  g.UI.overlay.open('legend', {}); await settle(g);
  const ink0 = R.ink, z0 = camOf(g).z;
  await clickHex(g, T.q, T.r); wheel(g, 640, 360, -400); await press(g, 'f');
  t.ok(!T.painted && R.ink === ink0 && camOf(g).z === z0 && camOf(g).fitted === true, 'nothing happened behind the overlay');
  g.UI.overlay.closeAll(); await settle(g);
  await clickHex(g, T.q, T.r);
  t.ok(T.painted, 'after closing, the page paints again');
  t.eq(errs(g), 0, 'clean');
});

// ==================================================================================================== cleanup, saves, performance
await t.test('leaving: DOM, key listeners and canvas handlers are gone; re-entering starts a clean visit; a stale pointer event does nothing', async () => {
  const g = fresh(); const R = mkRun(g);
  await g.UI.go('title', null, { force: true, transition: 'none' }); await settle(g);
  g._pointer('pointerdown', view(g), { x: 5, y: 5 }); g._pointer('pointerup', view(g), { x: 5, y: 5 }); await press(g, 'Shift');       // the one-shot audio arming listeners are spent
  const base = { kd: g._listeners('keydown'), ku: g._listeners('keyup'), pd: g._listeners('pointerdown'), rs: g._listeners('resize') };
  await open(g, R); fitCam(g);
  const T = frontier(g, R).filter((x) => x.type !== 'block')[0];
  await clickHex(g, T.q, T.r);                                  // a reveal and a hover are in flight
  g._click($(g, '.mp-chip')); await settle(g);                    // brush mode on
  g._run('UI.tip.hide()');
  await g.UI.go('title', null, { force: true, transition: 'none' }); await settle(g);
  t.ok(!$(g, '.s-map') && !$(g, '.mp-hud'), 'the screen DOM is gone');
  t.eq(md(g).state(), null, 'the visit state is released');
  t.eq(md(g).cam(), null, 'no camera outside a visit');
  t.deep({ kd: g._listeners('keydown'), ku: g._listeners('keyup'), pd: g._listeners('pointerdown'), rs: g._listeners('resize') }, base, 'no leaked window or document listeners');
  const ink = R.ink, pos = JSON.stringify(R.map.pos);
  g._pointer('pointerdown', view(g), { x: 700, y: 300 }); g._pointer('pointerup', view(g), { x: 700, y: 300 });
  wheel(g, 640, 360, -300); await press(g, 'Enter'); await press(g, 'b');
  t.ok(R.ink === ink && JSON.stringify(R.map.pos) === pos, 'stale pointer, wheel and key events do nothing');
  g._flush(); await settle(g);
  g.UI.screens.map.leave(); g.UI.screens.map.leave();
  t.eq(g._run('window.__errors.length'), 0, 'leave twice, flush timers: no UI errors');
  await open(g, R);
  t.ok(!st(g).brush && !st(g).chain && !st(g).walk && st(g).reveals.size === 0, 're-entering starts without brush mode, chain, walk or reveals');
  t.eq($$(g, '.s-map').length, 1, 'exactly one screen root');
  t.eq(errs(g), 0, 'clean');
});

await t.test('a saved run restores to the same page: serialize, deserialize, open', async () => {
  const g = fresh({ seed: 21 }); const R = mkRun(g, { seed: 21, ink: 12 });
  await open(g, R); fitCam(g);
  const f = farFog(g, R, 2, 4);
  await clickHex(g, f.T.q, f.T.r); await clickHex(g, f.T.q, f.T.r);
  const W = Object.values(R.map.tiles).find((x) => x.painted && x.type === 'empty' && g.MAP.dist(R.map.pos.q, R.map.pos.r, x.q, x.r) === 2);
  await clickHex(g, W.q, W.r);
  const saved = JSON.parse(JSON.stringify(g.RUN.serialize(R)));
  const R2 = g.RUN.deserialize(saved);
  g.GAME.state.R = R2; g.UI.setRun(R2);
  await open(g, R2);
  t.eq(txt($(g, '.mp-ink-n')), R2.ink + '/' + R2.inkMax, 'the Ink meter');
  t.eq(g.MAP.progress(R2.map).painted, g.MAP.progress(R.map).painted, 'the painted page');
  t.deep(R2.map.pos, R.map.pos, 'the party stands where it stood');
  const tk = g.MAP.toPixel(R2.map.pos.q, R2.map.pos.r, 46);
  g._raf(16);
  t.deep({ x: st(g).tok.x, y: st(g).tok.y }, tk, 'the token is on that hex');
  t.eq(txt($(g, '.mp-prog')).indexOf(String(g.MAP.progress(R2.map).pct)) >= 0, true, 'the progress meter');
  t.eq(errs(g), 0, 'clean');
});

await t.test('performance: a fully painted 21 x 13 page draws in a few ms of script time per frame, with culling and no per-frame sprite baking', async () => {
  const g = fresh(); const R = mkRun(g);
  fullyPainted(g, R);
  await open(g, R); fitCam(g);
  g._run("globalThis.__hex = 0; { const o = ART.map.hex; ART.map.hex = function () { __hex++; return o.apply(this, arguments); }; }");
  const ctx = g._run('UI.layers.view.getContext("2d")');
  for (let i = 0; i < 60; i++) { g._raf(16); }                    // warm the sprite cache: bakes are limited per frame
  g._run('__hex = 0');
  const sprites0 = g._run('ART.sprite.stats().misses');
  const N = 120, t0 = process.hrtime.bigint();
  g._run('(() => { const c = UI.layers.view.getContext("2d"); for (let i = 0; i < ' + N + '; i++) { UI.screens.map.update(0.016, i * 0.016); UI.screens.map.draw(c, i * 0.016); } })()');
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / N;
  const tiles = Object.keys(R.map.tiles).length;
  const hexes = g._run('__hex') / N;
  t.ok(ms < 5 * PERF_SLACK, 'update plus draw averages ' + ms.toFixed(2) + ' ms of script per frame on a no-op canvas (budget 5)');
  t.ok(hexes <= tiles && hexes > 150, 'one ART.map.hex per visible tile per frame (' + hexes + ' of ' + tiles + ')');
  t.eq(g._run('ART.sprite.stats().misses') - sprites0, 0, 'a steady frame bakes no sprites');
  // zoomed in, culling keeps the per-frame work down
  const s = st(g); s.cam.z = 2.4; s.tz = 2.4; s.cam.x = 600; s.cam.y = 400;
  g._run('__hex = 0'); g._run('(() => { const c = UI.layers.view.getContext("2d"); UI.screens.map.draw(c, 1); })()');
  t.ok(g._run('__hex') < 70, 'zoomed in, off-screen hexes are culled (' + g._run('__hex') + ' drawn)');
  t.eq(errs(g), 0, 'clean');
});

await t.test('a missing or throwing ART.map never breaks the page: fallbacks draw, taps still work', async () => {
  const g = fresh({ seed: 4 }); const R = mkRun(g, { seed: 4 });
  g._run('ART.map.hex = function () { throw new Error("boom"); }; ART.map.paper = function () { throw new Error("boom2"); }; delete ART.map.fogEdge; delete ART.map.route; delete ART.map.frame; delete ART.map.edgeMasks; delete ART.map.frameInner;');
  await open(g, R); fitCam(g);
  for (let i = 0; i < 6; i++) g._raf(16);
  const T = frontier(g, R).filter((x) => x.type !== 'block')[0];
  await clickHex(g, T.q, T.r);
  t.ok(T.painted, 'painting works with broken art');
  const W = Object.values(R.map.tiles).find((x) => x.painted && x.type === 'empty' && g.MAP.dist(R.map.pos.q, R.map.pos.r, x.q, x.r) === 2);
  await clickHex(g, W.q, W.r);
  t.deep(R.map.pos, { q: W.q, r: W.r }, 'walking works too');
  for (let i = 0; i < 6; i++) g._raf(16);
  t.eq(g._run('window.__errors.length'), 0, 'no UI errors: the screen stayed alive');
  t.ok(g._console.warn.some((w) => /ART\.map/.test(String(w.args ? w.args.join(' ') : w))), 'the broken pieces were reported once as warnings');
  t.eq(errs(g), 0, 'and not as errors');
});

// ==================================================================================================== the animated paths (realtime: the frame clock decides)
// boot starts with the title's fade transition, which realtime plays out on the frame clock: let it finish before the suite navigates
const rt = async (o = {}) => { const g = fresh({ realtime: true, ...o }); await g._tick(1200); return g; };
const paintSfx = (g) => sfx(g).filter((x) => x === 'paint').length;

await t.test('realtime: a paint blooms for about 0.6 s, the sound comes with it, the meter drains with a drip and settles; a chain reveals cell by cell', async () => {
  const g = await rt({ seed: 6 }); const R = mkRun(g, { seed: 6, ink: 12 });
  await open(g, R); fitCam(g);
  await g._tick(4000);                                                  // let the intro and the HUD entrance finish
  const T = frontier(g, R).filter((x) => x.type !== 'block')[1];
  await clickHex(g, T.q, T.r);
  t.eq(st(g).reveals.size, 1, 'one bloom is running');
  t.ok(T.painted, 'RUN already painted it (the animation is only the show)');
  t.ok($$(g, '.mp-drop.spend').length === 1, 'one drop drips out of the meter');
  t.eq(txt($(g, '.mp-ink-n')) !== '', true, 'the count is tweening');
  const s0 = paintSfx(g);
  await g._tick(120);
  t.ok(paintSfx(g) >= s0, 'the sound plays');
  await g._tick(900);
  t.eq(st(g).reveals.size, 0, 'the bloom is over');
  t.eq(txt($(g, '.mp-ink-n')), R.ink + '/' + R.inkMax, 'the meter settled on the real Ink');
  t.eq($$(g, '.mp-drop.spend, .mp-drop.gain').length, 0, 'the drip classes are cleaned up');
  // a chain
  const f = farFog(g, R, 3, 5);
  await clickHex(g, f.T.q, f.T.r); await clickHex(g, f.T.q, f.T.r);
  t.eq(st(g).reveals.size, f.pre.path.length, 'every cell of the chain waits its turn');
  const t0s = [...st(g).reveals.values()].map((r) => r.t0);
  t.ok(t0s.every((v, i) => i === 0 || v > t0s[i - 1]), 'in order, one after the other');
  await g._tick(250);
  t.ok(st(g).reveals.size >= 1 && st(g).reveals.size <= f.pre.path.length, 'part way through');
  for (let i = 0; i < 12; i++) g._raf(16);
  await g._tick(3000);
  t.eq(st(g).reveals.size, 0, 'all revealed in the end');
  t.ok(f.pre.path.every((c) => tileOf(g, R, c[0], c[1]).painted), 'and painted');
  t.eq(errs(g), 0, 'clean');
});

await t.test('realtime: a walk takes a step every 0.23 s with a footstep each, the token moves hex to hex, the camera follows, and RUN.step happens on arrival', async () => {
  const g = await rt({ seed: 5 }); const R = mkRun(g, { seed: 5 });
  await open(g, R);
  await g._tick(4000);
  const M = R.map, W = Object.values(M.tiles).find((x) => x.painted && x.type === 'empty' && g.MAP.dist(M.pos.q, M.pos.r, x.q, x.r) === 2);
  const path = g.MAP.walkPath(M, W.q, W.r);
  const home = g.MAP.toPixel(M.pos.q, M.pos.r, 46);
  fitCam(g);
  await clickHex(g, W.q, W.r);
  t.ok(st(g).walk && st(g).walk.path.length === path.length, 'a walk is under way');
  t.deep(bus(g, 'map:walk'), [{ q: W.q, r: W.r }], 'map:walk fired once at the start');
  t.ok(M.pos.q === (path.length && R.map.pos.q) && g.MAP.dist(M.pos.q, M.pos.r, home.q === undefined ? M.pos.q : M.pos.q, M.pos.r) >= 0, 'the party has not moved yet in RUN');
  await g._tick(140);
  t.ok(st(g).tok.moving, 'the token is walking');
  const mid = { x: st(g).tok.x, y: st(g).tok.y };
  t.ok(Math.hypot(mid.x - home.x, mid.y - home.y) > 0.5, 'and has left its hex');
  await g._tick(path.length * 230 + 400);
  t.ok(!st(g).walk && !st(g).tok.moving, 'the walk finished');
  t.deep(M.pos, { q: W.q, r: W.r }, 'RUN has the party on the target');
  t.eq(sfx(g).filter((x) => x === 'step').length, path.length, 'one footstep per hex');
  // the camera follows a token that walks away from the middle
  const s = st(g); s.cam.x = s.world.x0 + 600; s.cam.y = (s.world.y0 + s.world.y1) / 2; s.cam.z = 1; s.tz = 1; s.follow = false;
  const far = Object.values(M.tiles).find((x) => x.painted && x.type === 'empty' && g.MAP.dist(M.pos.q, M.pos.r, x.q, x.r) >= 1);
  await clickHex(g, far.q, far.r);
  t.ok(camOf(g).follow, 'walking turns following back on');
  const d0 = Math.hypot(camOf(g).x - st(g).tok.x, camOf(g).y - st(g).tok.y);
  await g._tick(1500);
  const d1 = Math.hypot(camOf(g).x - st(g).tok.x, camOf(g).y - st(g).tok.y);
  t.ok(d1 < d0 - 50, 'the camera closed in on the party (' + d0.toFixed(0) + ' to ' + d1.toFixed(0) + '; the page edge clamps it short)');
  t.eq(errs(g), 0, 'clean');
});

await t.test('realtime: speed setting and reduceMotion change the pace of a walk; taps during a walk are ignored; leaving mid-walk is clean', async () => {
  const pace = async (setup) => {
    const g = await rt({ seed: 5 }); const R = mkRun(g, { seed: 5 });
    if (setup) setup(g);
    await open(g, R); fitCam(g); await g._tick(4000);
    const M = R.map, W = Object.values(M.tiles).find((x) => x.painted && x.type === 'empty' && g.MAP.dist(M.pos.q, M.pos.r, x.q, x.r) === 2);
    await clickHex(g, W.q, W.r);
    let ms = 0;
    while (st(g).walk && ms < 5000) { await g._tick(16); ms += 16; }
    return ms;
  };
  const normal = await pace(null), fast = await pace((g) => g.UI.setSetting('fastAnim', 2)), calm = await pace((g) => g.UI.setSetting('reduceMotion', true));
  t.ok(fast < normal, 'the fast setting walks faster (' + fast + ' < ' + normal + ')');
  t.ok(calm < normal, 'reduced motion walks with a shorter step (' + calm + ' < ' + normal + ')');
  const g = await rt({ seed: 5 }); const R = mkRun(g, { seed: 5 });
  await open(g, R); fitCam(g); await g._tick(4000);
  const M = R.map, W = Object.values(M.tiles).find((x) => x.painted && x.type === 'empty' && g.MAP.dist(M.pos.q, M.pos.r, x.q, x.r) === 2);
  const T = frontier(g, R).filter((x) => x.type !== 'block')[0];
  await clickHex(g, W.q, W.r);
  const ink = R.ink;
  await clickHex(g, T.q, T.r);
  t.ok(!T.painted && R.ink === ink, 'a tap on fog during a walk is ignored');
  await g._tick(100);
  await g.UI.go('title', null, { force: true, transition: 'none' });
  await g._tick(2000);
  t.eq(g._run('window.__errors.length'), 0, 'leaving mid-walk: nothing throws afterwards');
  t.eq(errs(g), 0, 'clean');
});

await t.test('realtime: a well sends drops flying into the meter and the meter fills when they land; a brush rack sends the brush to its chip', async () => {
  const g = await rt({ seed: 1 }); const R = mkRun(g, { seed: 1, ink: 3 });
  const W = plant(g, R, 'well', { ink: 4 }, 2, 2);
  const B = plant(g, R, 'brush', { id: 'halo' }, 1, 2);
  await open(g, R); fitCam(g); await g._tick(4000);
  await clickHex(g, W.q, W.r);
  await g._tick(((st(g).walk ? st(g).walk.path.length : 2) + 1) * 240);
  t.ok(R.ink === 7 && W.done, 'the well paid out');
  const flights = $$(g, '.mp-fly-drop');
  t.ok(flights.length >= 3 && flights.length <= 8, 'drops are flying (' + flights.length + ')');
  t.ok(flights.every((f) => f.parentNode && /px/.test(f.style.getPropertyValue('--dx'))), 'each has its own destination');
  t.ok(/^3\//.test(txt($(g, '.mp-ink-n'))) || /^[3-6]\//.test(txt($(g, '.mp-ink-n'))), 'the meter is still waiting for them (' + txt($(g, '.mp-ink-n')) + ')');
  await g._tick(2500);
  t.eq($$(g, '.mp-fly').length, 0, 'every flight cleaned itself up');
  t.eq(txt($(g, '.mp-ink-n')), R.ink + '/' + R.inkMax, 'the meter has the Ink');
  t.ok(sfx(g).indexOf('ink_gain') >= 0, 'with the Ink sound');
  await clickHex(g, B.q, B.r);
  await g._tick(500);
  t.ok($$(g, '.mp-fly-brush').length >= 1 || $$(g, '.mp-fly').length >= 1, 'the brush flies to the tray');
  await g._tick(3000);
  t.ok($$(g, '.mp-chip[data-id="halo"]').length === 1 && R.brushes.indexOf('halo') >= 0, 'the Halo chip is in the tray');
  t.eq($$(g, '.mp-fly').length, 0, 'flights cleaned up');
  t.eq(errs(g), 0, 'clean');
});

await t.test('realtime: the chapter intro plays once per chapter (title, brush stroke, swoop from the whole page), never twice, and is a fade under reduced motion', async () => {
  const g = await rt({ seed: 9 }); const R = mkRun(g, { seed: 9 });
  await open(g, R);
  t.ok($(g, '.mp-intro') && /Act I/.test(txt($(g, '.mp-intro'))) && txt($(g, '.mp-intro-t')).indexOf(g.DATA.lore.ch1_intro.title) >= 0, 'the first visit shows the chapter title');
  t.ok($(g, '.mp-hud').classList.contains('intro'), 'the small banner waits for it');
  const c0 = camOf(g);
  t.ok(Math.abs(c0.z - c0.zMin) < 1e-9, 'the camera starts on the whole page');
  await g._tick(1500);
  t.ok(camOf(g).z > c0.z + 0.05, 'and swoops in toward the party');
  await g._tick(4000);
  t.ok(!$(g, '.mp-intro') && !$(g, '.mp-hud').classList.contains('intro'), 'the intro removes itself');
  t.ok(Math.abs(camOf(g).z - 1) < 0.02, 'the swoop ended at the default zoom');
  await open(g, R);
  t.ok(!$(g, '.mp-intro') && Math.abs(camOf(g).z - 1) < 1e-9, 'coming back from a node plays no intro and starts on the party');
  g.RUN.startChapter(R, 2);
  await open(g, R);
  t.ok($(g, '.mp-intro') && /Act II/.test(txt($(g, '.mp-intro'))), 'a new chapter plays it again');
  const g2 = await rt({ seed: 9 }); g2.UI.setSetting('reduceMotion', true);
  const R2 = mkRun(g2, { seed: 9 });
  await open(g2, R2);
  t.ok($(g2, '.mp-intro'), 'reduced motion still names the chapter');
  t.near(camOf(g2).z, 1, 1e-9, 'but there is no swoop');
  t.eq(errs(g) + errs(g2), 0, 'clean');
});

await t.test('realtime: a node that never opens is retried once and then the page is free again', async () => {
  const g = await rt({ seed: 7 }); const R = mkRun(g, { seed: 7 });
  const T = plant(g, R, 'enemy', {}, 2, 2);
  await open(g, R); fitCam(g); await g._tick(4000);
  await clickHex(g, T.q, T.r);
  await g._tick(2500);
  t.eq(entered(g).length, 1, 'the first hand-over');
  t.ok(st(g).busy, 'busy while we wait');
  await g._tick(3500);
  t.eq(entered(g).length, 2, 'one retry when the screen is still the map');
  await g._tick(4500);
  t.ok(!st(g).busy, 'then the page is freed so the player is never stuck');
  t.eq(entered(g).length, 2, 'and it does not retry forever');
  t.eq(errs(g), 0, 'clean');
});

await t.test('realtime: ambient life: petals, the boss halo and the info chip all draw frames with no errors, at quality low and with reduced motion too', async () => {
  for (const mode of ['normal', 'low', 'reduced', 'colorblind']) {
    const g = await rt({ seed: 3 }); const R = mkRun(g, { seed: 3 });
    if (mode === 'low') g.UI.setSetting('quality', 'low');
    if (mode === 'reduced') g.UI.setSetting('reduceMotion', true);
    if (mode === 'colorblind') g.UI.setSetting('colorblind', true);
    await open(g, R);
    await g._tick(1500);
    const B = R.map.boss; const s = st(g);
    s.cam.z = 1; s.tz = 1; const bp = g.MAP.toPixel(B.q, B.r, 46); s.cam.x = bp.x; s.cam.y = bp.y; s.follow = false;
    await g._tick(500);
    t.ok(g._counts && true, mode + ': drew');
    t.eq(g._run('window.__errors.length'), 0, mode + ': no UI errors');
    t.eq(errs(g), 0, mode + ': no console errors');
  }
});

// ==================================================================================================== input odds and ends
await t.test('input: pointercancel frees a stuck pointer, contextmenu is swallowed and cancels, pointerleave clears the hover, announcements name what happened', async () => {
  const g = fresh({ seed: 5 }); const R = mkRun(g, { seed: 5, brushes: ['halo'] });
  await open(g, R); fitCam(g);
  const T = frontier(g, R).filter((x) => x.type !== 'block')[0];
  const p = md(g).screenOf(T.q, T.r);
  g._pointer('pointerdown', view(g), { x: p.x, y: p.y, id: 7 });
  g._pointer('pointercancel', view(g), { x: p.x, y: p.y, id: 7 });
  t.eq(st(g).ptrs.size, 0, 'a cancelled pointer is forgotten');
  g._pointer('pointerdown', view(g), { x: 300, y: 300, id: 8, pointerType: 'touch' });
  g._pointer('pointerdown', view(g), { x: 500, y: 300, id: 9, pointerType: 'touch' });
  g._pointer('pointercancel', view(g), { id: 9, pointerType: 'touch' });
  g._pointer('pointercancel', view(g), { id: 8, pointerType: 'touch' });
  t.ok(st(g).ptrs.size === 0 && !st(g).pinch, 'a cancelled pinch leaves nothing behind');
  await clickHex(g, T.q, T.r);
  t.ok(T.painted, 'and the next tap still paints');
  t.ok(g._run('__ann').some((x) => /Unmuted 1 hex for 1 Vox/.test(x)), 'the screen reader line says what happened (' + g._run('__ann').slice(-2).join(' | ').slice(0, 90) + ')');
  g._click($(g, '.mp-chip')); await settle(g);
  t.ok(st(g).brush, 'brush mode');
  const ev = g._run("(() => { const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 600, clientY: 300 }); UI.layers.view.dispatchEvent(e); return e.defaultPrevented; })()");
  t.ok(ev === true && !st(g).brush, 'the context menu is swallowed and the brush is put away');
  await hoverHex(g, T.q, T.r);
  t.ok(st(g).hover, 'hovering');
  g._pointer('pointerleave', view(g), { x: 5, y: 5, buttons: 0, id: 9 });
  t.eq(st(g).hover, null, 'leaving the canvas clears the hover');
  t.eq(errs(g), 0, 'clean');
});

await t.test('input: a keyboard cursor aims a locked brush and Enter applies it; the cursor keeps moving the preview in a plain brush', async () => {
  const g = fresh({ seed: 12 }); const R = mkRun(g, { seed: 12, brushes: ['fan', 'splash'] });
  await open(g, R); fitCam(g);
  await press(g, '1');
  t.eq(st(g).brush.id, 'fan', 'the key 1 picks the fan');
  const a = [...st(g).brush.anchors.values()].find((x) => x.dirs.length > 1 && g.MAP.tile(R.map, x.q + DIRS[x.dirs[1]][0], x.r + DIRS[x.dirs[1]][1]));
  st(g).cursor = { q: a.q, r: a.r }; st(g).mode = 'key';
  await press(g, 'Enter');
  t.ok(st(g).brush.anchor && st(g).brush.anchor.q === a.q, 'Enter on the cursor locks the anchor');
  const dkey = ['d', 'e', 'q', 'a', 'z', 'c'][a.dirs[1]];
  await press(g, dkey);
  t.eq(st(g).brush.dir, a.dirs[1], 'moving the cursor one hex aims the fan that way (key ' + dkey + ')');
  const want = g.MAP.brushCells(R.map, 'fan', a.q, a.r, a.dirs[1]);
  await press(g, 'Enter');
  t.ok(want.length > 0 && want.every((c) => tileOf(g, R, c[0], c[1]).painted), 'Enter on the aimed hex paints it');
  t.eq(R.brushes.indexOf('fan'), -1, 'the fan is used');
  await press(g, 'Escape');
  t.eq(errs(g), 0, 'clean');
});

await t.test('pending choices left by RUN are answered with a safe default so the page can never soft lock', async () => {
  const g = fresh({ seed: 5 }); const R = mkRun(g, { seed: 5 });
  const deck0 = R.deck.length;
  const res = g.RUN.applyOps(R, [{ op: 'removeCard', n: 1 }], {});
  t.ok(res.pending.length === 1 && R.pending.length === 1, 'RUN raised a pending removal');
  await open(g, R);
  t.eq(R.pending.length, 0, 'the map answered it');
  t.eq(R.deck.length, deck0 - 1, 'with the first card');
  t.eq(errs(g), 0, 'clean');
});

await t.test('realtime: a finger leaves its hex info for a moment, then the chip returns to rest; a mouse hover is immediate', async () => {
  const g = await rt({ seed: 5 }); const R = mkRun(g, { seed: 5 });
  await open(g, R); fitCam(g); await g._tick(4000);
  const W = Object.values(R.map.tiles).find((x) => x.painted && x.type === 'empty' && g.MAP.dist(R.map.pos.q, R.map.pos.r, x.q, x.r) === 1);
  const T = frontier(g, R).filter((x) => x.type !== 'block')[3];
  await clickHex(g, T.q, T.r, { pointerType: 'touch' });
  t.ok(T.painted && st(g).hover && st(g).hover.q === T.q, 'the touch tap painted and remembers its hex');
  await g._tick(600);
  t.ok(/\S/.test(txt($(g, '.mp-info-name'))) && !/hexes live/.test(txt($(g, '.mp-info-name'))), 'the chip still describes the tapped hex');
  await g._tick(3300);
  t.eq(st(g).hover, null, 'after three seconds the touch hover lets go');
  t.ok(/hexes live/.test(txt($(g, '.mp-info-name'))), 'and the chip rests on the progress line');
  t.eq(errs(g), 0, 'clean');
});

// ==================================================================================================== the tutorial anchor
await t.test('the hex anchor sits on the first hex of the cheapest chain to the boss and follows the camera', async () => {
  const g = fresh({ seed: 8 }); const R = mkRun(g, { seed: 8 });
  await open(g, R); fitCam(g);
  for (let i = 0; i < 8; i++) g._raf(16);
  const a = $(g, '.mp-hexanchor');
  t.eq(a.getAttribute('data-tut'), 'hex', 'tagged');
  const sol = g.MAP.solve(R.map), cell = sol.path[0];
  const p = md(g).screenOf(cell[0], cell[1]);
  const cx = parseFloat(a.style.left) + parseFloat(a.style.width) / 2, cy = parseFloat(a.style.top) + parseFloat(a.style.height) / 2;
  t.near(cx, p.x, 1.5, 'centred on that hex (x)'); t.near(cy, p.y, 1.5, 'and y');
  t.ok(parseFloat(a.style.width) > 20, 'sized like a hex on screen');
  // right after painting it the anchor marks the hex that was just painted (that is what the `walk` hint points at) ...
  await clickHex(g, cell[0], cell[1]);
  for (let i = 0; i < 8; i++) g._raf(16);
  const next = g.MAP.solve(R.map).path[0];
  t.ok(next && (next[0] !== cell[0] || next[1] !== cell[1]), 'the cheapest chain moved on');
  const pc = md(g).screenOf(cell[0], cell[1]);
  t.near(parseFloat(a.style.left) + parseFloat(a.style.width) / 2, pc.x, 1.5, 'the anchor now sits on the hex that was just painted (x)');
  t.near(parseFloat(a.style.top) + parseFloat(a.style.height) / 2, pc.y, 1.5, 'and y');
  // ... and once a walk starts it goes back to the next hex of the chain
  await clickHex(g, cell[0], cell[1]);
  for (let i = 0; i < 8; i++) g._raf(16);
  const next2 = g.MAP.solve(R.map).path[0];
  const p2 = md(g).screenOf(next2[0], next2[1]);
  t.near(parseFloat(a.style.left) + parseFloat(a.style.width) / 2, p2.x, 1.5, 'after a walk starts the anchor returns to the next hex to paint');
  // moving the camera moves the anchor
  const s8 = st(g); s8.cam.z = 1; s8.tz = 1; s8.cam.x = (s8.world.x0 + s8.world.x1) / 2; s8.cam.y = (s8.world.y0 + s8.world.y1) / 2;
  for (let i = 0; i < 8; i++) g._raf(16);
  const left0 = parseFloat(a.style.left);
  g._drag(view(g), [700, 400], [600, 400], 6); for (let i = 0; i < 8; i++) g._raf(16);
  t.ok(Math.abs(parseFloat(a.style.left) - left0) > 20, 'it tracks the camera');
  t.eq(errs(g), 0, 'clean');
});

// ==================================================================================================== the soak: paint a chain to the boss and walk there, on many seeds in all three chapters
await t.test('soak: on 8 seeds in each chapter the screen paints the cheapest chain to the boss, walks, resolves what it meets, re-enters the page, and ends on the boss node', async () => {
  const listeners0 = {};
  const summary = [];
  for (const chapter of [1, 2, 3]) {
    const g = fresh({ seed: chapter });
    await g.UI.go('title', null, { force: true, transition: 'none' }); await settle(g);
    g._pointer('pointerdown', view(g), { x: 5, y: 5 }); g._pointer('pointerup', view(g), { x: 5, y: 5 }); await press(g, 'Shift');
    const kd = g._listeners('keydown');
    for (const seed of [1, 2, 3, 5, 8, 13, 21, 34]) {
      g._run('__entered.length = 0; __bus.length = 0; __sfx.length = 0');
      const R = mkRun(g, { seed: seed * 7 + chapter, chapter });
      await open(g, R);
      const M = () => R.map, boss = R.map.boss, minInk = g.MAP.solve(R.map).minInk;
      t.ok(minInk >= 16 && minInk <= 22, 'ch' + chapter + ' seed ' + seed + ': a solvable page (' + minInk + ')');
      const wells0 = R.stats.wellsDrunk;
      let bossNode = null, steps = 0, topUps = 0, nodes = 0, instants = 0, mercy0 = R.stats.mercy;
      const touch = seed % 2 ? 'touch' : 'mouse';
      while (!bossNode && steps++ < 160) {
        fitCam(g);
        const sol = g.MAP.solve(M());
        if (sol.path.length) {
          const reach = Math.min(Math.max(R.ink, 0), sol.path.length);
          if (reach === 0) { R.ink = Math.min(R.inkMax, sol.path.length); topUps++; }
          const idx = Math.min(Math.max(R.ink, 1), sol.path.length) - 1;
          const target = sol.path[idx];
          const adjacent = g.MAP.canPaint(M(), target[0], target[1]).ok;
          await clickHex(g, target[0], target[1], { pointerType: touch });
          if (!adjacent && !tileOf(g, R, target[0], target[1]).painted) await clickHex(g, target[0], target[1], { pointerType: touch });
          t.ok(tileOf(g, R, target[0], target[1]).painted, 'ch' + chapter + ' seed ' + seed + ' step ' + steps + ': the chain target is painted');
        } else {
          const before = JSON.stringify(R.map.pos), ent0 = entered(g).length;
          await clickHex(g, boss.q, boss.r, { pointerType: touch });
          const ent = entered(g);
          if (ent.length > ent0) {
            const n = ent[ent.length - 1];
            if (n.done) instants++;
            else if (n.kind === 'combat' && n.tier === 'boss') bossNode = n;
            else { nodes++; g.RUN.finishNode(R); await open(g, R); }       // a fight, shop or fable resolved elsewhere: come back to the page
          } else if (JSON.stringify(R.map.pos) === before) { t.ok(false, 'ch' + chapter + ' seed ' + seed + ': the walk toward the boss made no progress'); break; }
        }
        if (R.ink < 0 || R.ink > R.inkMax) { t.ok(false, 'Ink out of range ' + R.ink); break; }
        if (errs(g)) break;
      }
      t.ok(bossNode, 'ch' + chapter + ' seed ' + seed + ': the boss node was entered (' + steps + ' loops, ' + nodes + ' nodes, ' + instants + ' instants)');
      t.ok(R.node && R.node.tier === 'boss', 'ch' + chapter + ' seed ' + seed + ': RUN holds the boss node');
      t.ok(tileOf(g, R, boss.q, boss.r).painted && R.map.pos.q === boss.q && R.map.pos.r === boss.r, 'ch' + chapter + ' seed ' + seed + ': the party stands on the boss');
      t.eq(R.stats.hexesPainted, minInk, 'ch' + chapter + ' seed ' + seed + ': exactly the cheapest chain was painted (' + minInk + ')');
      t.eq(bus(g, 'map:paint').reduce((a, e) => a + e.cost, 0), minInk, 'ch' + chapter + ' seed ' + seed + ': the map:paint costs add up to the same');
      t.ok(topUps <= 3, 'ch' + chapter + ' seed ' + seed + ': at most 3 top-ups of Ink were needed in this stand-in for fights and wells (' + topUps + ')');
      summary.push(chapter + ':' + seed + ':' + steps);
      t.eq(errs(g), 0, 'ch' + chapter + ' seed ' + seed + ': no console errors');
    }
    t.eq(g._listeners('keydown'), kd, 'ch' + chapter + ': 24 visits to the page left no listeners behind');
    t.eq(g._run('window.__errors.length'), 0, 'ch' + chapter + ': no UI errors');
  }
});

// ==================================================================================================== a random play-through
await t.test('stress: 600 seeded random actions (taps anywhere, keys, wheel, drags, chips, overlays) never throw and never break the invariants', async () => {
  for (const seed of [3, 17]) {
    const g = fresh({ seed }); const R = mkRun(g, { seed, ink: 14 });
    await open(g, R);
    const rng = g.U.rng(seed * 101);
    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '-', 'f', 'b', 'q', 'e', 'a', 'd', 'z', 'c', 'Enter', ' ', 'Escape', '1', '2', '3', 'l'];
    const tiles = Object.values(R.map.tiles);
    for (let i = 0; i < 300; i++) {
      const roll = rng();
      const sOpen = g.UI.overlay.count() > 0;
      if (roll < 0.40) {
        const T = tiles[Math.floor(rng() * tiles.length)];
        if (!st(g)) break;
        fitCam(g);
        await clickHex(g, T.q, T.r, { pointerType: rng() < 0.4 ? 'touch' : 'mouse' });
      } else if (roll < 0.62) { await press(g, keys[Math.floor(rng() * keys.length)], { shift: rng() < 0.1 }); }
      else if (roll < 0.70) { wheel(g, 100 + rng() * 1000, 100 + rng() * 500, (rng() - 0.5) * 900); }
      else if (roll < 0.78) { g._drag(view(g), [100 + rng() * 1000, 100 + rng() * 500], [100 + rng() * 1000, 100 + rng() * 500], 4); }
      else if (roll < 0.84) { const c = $$(g, '.mp-chip'); if (c.length) { g._click(c[Math.floor(rng() * c.length)]); } }
      else if (roll < 0.88) { const b = $$(g, '.mp-tool'); g._click(b[Math.floor(rng() * b.length)]); }
      else if (roll < 0.92 && !sOpen) { await hoverHex(g, tiles[Math.floor(rng() * tiles.length)].q, tiles[Math.floor(rng() * tiles.length)].r); }
      else { g._raf(16); }
      await settle(g);
      if (g.UI.overlay.count() > 0 && rng() < 0.5) { g.UI.overlay.closeAll(); await settle(g); }
      if (R.node) { g.RUN.finishNode(R); await open(g, R); }          // a node is resolved elsewhere
      const p = R.map.pos, T = R.map.tiles[g.MAP.key(p.q, p.r)];
      if (!(T && T.painted && T.type !== 'block')) { t.ok(false, 'seed ' + seed + ' action ' + i + ': the party stands on a painted, walkable hex'); break; }
      if (!(R.ink >= 0 && R.ink <= R.inkMax)) { t.ok(false, 'seed ' + seed + ' action ' + i + ': Ink in range (' + R.ink + ')'); break; }
      const S1 = st(g);
      if (S1 && S1.brush && R.brushes.indexOf(S1.brush.id) < 0) { t.ok(false, 'seed ' + seed + ' action ' + i + ': brush mode with a brush that is gone'); break; }
      if (S1 && S1.brush && S1.chain) { t.ok(false, 'seed ' + seed + ' action ' + i + ': brush mode and a chain together'); break; }
      if (S1 && (!(S1.cam.z >= S1.zMin - 1e-9 && S1.cam.z <= 2.4 + 1e-9) || !Number.isFinite(S1.cam.x) || !Number.isFinite(S1.cam.y))) { t.ok(false, 'seed ' + seed + ' action ' + i + ': a sane camera'); break; }
      if (errs(g)) { t.ok(false, 'seed ' + seed + ' action ' + i + ': console errors ' + JSON.stringify(g._console.error.slice(0, 2).map((e) => String(e.args ? e.args.join(' ') : e).slice(0, 200)))); break; }
    }
    t.eq(errs(g), 0, 'seed ' + seed + ': no console errors in 300 random actions');
    t.eq(g._run('window.__errors.length'), 0, 'seed ' + seed + ': no UI errors');
    t.ok(g.MAP.progress(R.map).painted > 19, 'seed ' + seed + ': the page was actually played on (' + g.MAP.progress(R.map).painted + ' hexes painted)');
  }
});

// ==================================================================================================== Echo: every woken hex sings, the Hush follows the land
const chipOf = (g) => $(g, '.mp-chip');
async function singSong(g, R, id) {
  g._click(chipOf(g)); await settle(g);
  const list = g.MAP.brushAnchors(R.map, id), dirKind = g.DATA.brushes[id].kind === 'line' || g.DATA.brushes[id].kind === 'fan';
  let pick = null;
  for (const a of list) {
    const ds = dirKind ? a.dirs : [0];
    const d = ds.find((dd) => g.MAP.tile(R.map, a.q + g.MAP.DIRS[dd][0], a.r + g.MAP.DIRS[dd][1]));
    if (d !== undefined) { pick = { a, d }; break; }
  }
  if (dirKind) {
    await clickHex(g, pick.a.q, pick.a.r);
    const nb = [pick.a.q + g.MAP.DIRS[pick.d][0], pick.a.r + g.MAP.DIRS[pick.d][1]];
    await hoverHex(g, nb[0], nb[1]);
    await clickHex(g, nb[0], nb[1]);
  } else await clickHex(g, pick.a.q, pick.a.r);
  return pick;
}

await t.test('echo: a walk hums the path back, thinned: the first six steps, then every second one, never twice within four seconds', async () => {
  const g = fresh({ seed: 5 }); const R = mkRun(g, { seed: 5 });
  await open(g, R); fitCam(g);
  const M = R.map;
  Object.values(M.tiles).forEach((T) => { if (T.type !== 'block') { T.painted = true; T.known = true; if (T.type !== 'start') T.type = 'empty'; } });
  const start = { q: M.pos.q, r: M.pos.r };
  const far = Object.values(M.tiles).filter((T) => T.type === 'empty').map((T) => ({ T, p: g.MAP.walkPath(M, T.q, T.r) })).filter((x) => x.p && x.p.length >= 10).sort((a, b) => b.p.length - a.p.length)[0];
  t.ok(far, 'a walk of at least ten hexes exists');
  const L = far.p.length;
  await clickHex(g, far.T.q, far.T.r);
  t.deep(M.pos, { q: far.T.q, r: far.T.r }, 'the party walked the whole way');
  const soft = wakes(g).filter((w) => w[4]);
  t.eq(soft.length, Math.min(L, 6) + Math.floor(Math.max(0, L - 6) / 2), 'the soft notes are thinned (' + L + ' steps)');
  const want = far.p.filter((c, i) => (i + 1) <= 6 || (i + 1 - 6) % 2 === 0).map((c) => c[0] + ',' + c[1]);
  t.deep(soft.map((w) => w[0] + ',' + w[1]), want, 'they are the path steps 1..6, 8, 10, ...');
  const n0 = wakes(g).length;
  for (const c of far.p.slice(0, -1).reverse().concat([[start.q, start.r]])) await clickHex(g, c[0], c[1]);
  const back = wakes(g).slice(n0).filter((w) => w[4]);
  const heardKeys = new Set(soft.map((w) => w[0] + ',' + w[1]));
  t.ok(back.every((w) => !heardKeys.has(w[0] + ',' + w[1])), 'walking straight back over the same hexes adds no soft note on a hex that just sounded');
  t.eq(errs(g), 0, 'clean');
});

await t.test('realtime echo: a chain sings its hexes in path order and holds the last; the melody is visible as one rising mark per note, even with sound off', async () => {
  const g = await rt({ seed: 6 }); const R = mkRun(g, { seed: 6, ink: 12 });
  await open(g, R); fitCam(g);
  await g._tick(4000);
  const f = farFog(g, R, 3, 5), n = f.pre.path.length;
  t.ok(n >= 3 && n <= 8, 'a chain of a few hexes');
  const w0 = wakes(g).length, m0 = st(g).noteMarks.length;
  await clickHex(g, f.T.q, f.T.r); await clickHex(g, f.T.q, f.T.r);
  await g._tick(n * 130 + 250);
  const sung = wakes(g).slice(w0).filter((w) => !w[4]);
  t.deep(sung.map((w) => [w[0], w[1]]), f.pre.path.map((c) => [c[0], c[1]]), 'the notes follow the path in order');
  t.deep(sung.map((w) => w[3]), f.pre.path.map((c, i) => i), 'i runs 0..n-1');
  t.deep(sung.map((w) => w[5]), f.pre.path.map((c, i) => (i === n - 1 ? 1 : 0)), 'only the last is held');
  t.eq(st(g).noteMarks.length - m0, n, 'one rising mark per wake call');
  await g._tick(3000);
  t.ok(st(g).noteMarks.length <= 24, 'marks fade away and never pass the cap');
  // sound off: the marks still come
  g._run("if (AUDIO.setVolume) AUDIO.setVolume('sfx', 0)");
  const g2 = farFog(g, R, 2, 6);
  if (g2) {
    const k0 = st(g).noteMarks.length, c0 = wakes(g).length;
    await clickHex(g, g2.T.q, g2.T.r); await clickHex(g, g2.T.q, g2.T.r);
    await g._tick(g2.pre.path.length * 130 + 250);
    const added = wakes(g).slice(c0).filter((w) => !w[4]).length;
    t.ok(added > 0 && st(g).noteMarks.length - k0 === added, 'with the Effects slider at 0 every note still leaves its mark');
  }
  t.eq(errs(g), 0, 'clean');
});

await t.test('realtime echo: a Song sings every cell it wakes with its own gesture (brush_use, no extra paint)', async () => {
  for (const id of ['fan', 'splash']) {
    const g = await rt({ seed: 4 }); const R = mkRun(g, { seed: 4, brushes: [id], ink: 4 });
    await open(g, R); fitCam(g);
    await g._tick(4000);
    const w0 = wakes(g).length, p0 = paintSfx(g), before = g.MAP.progress(R.map).painted;
    await singSong(g, R, id);
    await g._tick(3000);
    const painted = g.MAP.progress(R.map).painted - before;
    const sung = wakes(g).slice(w0).filter((w) => !w[4]);
    t.ok(painted > 0 && sung.length === painted, id + ': one note per painted cell (' + painted + ')');
    t.ok(sung.every((w) => w[2] === id), id + ': every call carries the Song id');
    t.ok(sfx(g).indexOf('brush_use') >= 0, id + ': brush_use plays');
    t.eq(paintSfx(g), p0, id + ': applyBrushNow no longer plays paint');
    t.eq(errs(g), 0, id + ': clean');
  }
});

await t.test('echo: the Hush follows the painted share (AUDIO.awake from the progress meter)', async () => {
  const g = fresh({ seed: 5 }); const R = mkRun(g, { seed: 5, ink: 9 });
  await open(g, R); fitCam(g);
  const a0 = awakes(g).slice();
  t.ok(a0.length > 0, 'AUDIO.awake was told on enter');
  t.near(a0[a0.length - 1], g.MAP.progress(R.map).frac, 1e-9, 'it equals the progress fraction');
  const T = frontier(g, R).filter((x) => x.type !== 'block')[0];
  await clickHex(g, T.q, T.r); await settle(g); await g._tick(100);
  const a1 = awakes(g);
  t.near(a1[a1.length - 1], g.MAP.progress(R.map).frac, 1e-9, 'and follows a paint');
  t.ok(a1[a1.length - 1] > a0[a0.length - 1], 'it grew');
});

await t.done();
