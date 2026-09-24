// CLAWSPIRE -- art pipeline suite. js/art.js maps every drawable thing to an
// optional PNG under clawspire/art/. This checks the manifest is complete
// (every item art key and id, enemy art key and id, character, relic, status,
// hex type, event, backdrop, the title, logo, cabinet, claw parts and UI
// icons), has no duplicate paths and only uses the documented folders; that
// headless ART is inert (load is a no-op, get is null); and, with a fake
// Image class standing in for the browser, that loaded files are served and
// missing ones stay null.
import { boot, harness, scriptFiles } from './clawspire_lib.mjs';

const h = harness('clawspire art');

const FOLDERS = {
  item: /^art\/items\/[a-z0-9_]+\.png$/,
  itemId: /^art\/items\/id\/[a-z0-9_]+\.png$/,
  enemy: /^art\/enemies\/[a-z0-9_]+\.png$/,
  portrait: /^art\/portraits\/[a-z0-9_]+\.png$/,
  relic: /^art\/relics\/[a-z0-9_]+\.png$/,
  status: /^art\/status\/[a-z0-9_]+\.png$/,
  hex: /^art\/hex\/[a-z0-9_]+\.png$/,
  bg: /^art\/bg\/act[123]\.png$/,
  mapbg: /^art\/bg\/map[123]\.png$/,
  title: /^art\/title\.png$/,
  logo: /^art\/logo\.png$/,
  cabinet: /^art\/cabinet\.png$/,
  claw: /^art\/claw\/(palm|prong|carriage)\.png$/,
  event: /^art\/events\/[a-z0-9_]+\.png$/,
  ui: /^art\/ui\/(coin|ink|brush)\.png$/,
};

/* ------------------------------------------------- load order */
{
  const files = scriptFiles();
  const iu = files.indexOf('js/util.js'), ia = files.indexOf('js/art.js'), ip = files.indexOf('js/physics.js');
  h.ok(ia >= 0, 'index.html loads js/art.js');
  h.ok(iu >= 0 && ia === iu + 1 && (ip < 0 || ip > ia), 'art.js loads right after util.js, before physics.js');
}

/* ------------------------------------------------- manifest */
{
  const api = boot({ only: ['util', 'art', 'data', 'map', 'render'] });
  const { ART, DATA, MAP, RENDER } = api;
  h.ok(ART && typeof ART.load === 'function' && typeof ART.get === 'function' && typeof ART.has === 'function' && typeof ART.paths === 'function', 'ART exposes load/get/has/paths');
  const M = ART.paths();
  h.ok(Array.isArray(M) && M.length > 150, 'manifest is a real list (' + M.length + ' entries)');
  const byPath = new Set(M.map(m => m.path));
  h.eq(byPath.size, M.length, 'no duplicate paths');
  const need = (path, what) => h.ok(byPath.has(path), what + ' -> ' + path);

  for (const k of RENDER.ITEM_KEYS) need('art/items/' + k + '.png', 'item art key ' + k);
  for (const id in DATA.ITEMS) {
    need('art/items/id/' + id + '.png', 'item id ' + id);
    need('art/items/' + DATA.ITEMS[id].art + '.png', 'item ' + id + ' art key');
  }
  for (const k of RENDER.ENEMY_KEYS) need('art/enemies/' + k + '.png', 'enemy art key ' + k);
  for (const id in DATA.ENEMIES) {
    need('art/enemies/' + id + '.png', 'enemy id ' + id);
    need('art/enemies/' + DATA.ENEMIES[id].art + '.png', 'enemy ' + id + ' art key');
  }
  for (const id in DATA.CHARACTERS) need('art/portraits/' + id + '.png', 'portrait ' + id);
  for (const id in DATA.RELICS) need('art/relics/' + id + '.png', 'relic ' + id);
  for (const id in DATA.STATUS) need('art/status/' + id + '.png', 'status ' + id);
  for (const tp of MAP.TYPES) need('art/hex/' + tp + '.png', 'hex type ' + tp);
  for (const id in DATA.EVENTS) need('art/events/' + id + '.png', 'event ' + id);
  for (const a of [1, 2, 3]) { need('art/bg/act' + a + '.png', 'arena backdrop ' + a); need('art/bg/map' + a + '.png', 'map backdrop ' + a); }
  for (const p of ['art/title.png', 'art/logo.png', 'art/cabinet.png', 'art/claw/palm.png', 'art/claw/prong.png', 'art/claw/carriage.png', 'art/ui/coin.png', 'art/ui/ink.png', 'art/ui/brush.png']) need(p, 'fixed asset');

  for (const m of M) {
    const re = FOLDERS[m.kind];
    h.ok(!!re, 'known kind ' + m.kind);
    if (re) h.ok(re.test(m.path), m.kind + ' path uses its folder: ' + m.path);
    h.eq(ART.pathOf(m.kind, m.key), m.path, 'pathOf agrees with the manifest for ' + m.path);
    const okSize = (s) => Array.isArray(s) && s.length === 2 && s.every(v => Number.isFinite(v) && v > 0);
    h.ok(okSize(m.size), m.path + ' has a draw size ' + JSON.stringify(m.size));
    h.ok(okSize(m.gen) && m.gen.every(v => Number.isInteger(v) && v % 4 === 0), m.path + ' has a generation size ' + JSON.stringify(m.gen));
    h.ok(!/[^\x20-\x7e]/.test(m.path), 'plain ASCII path ' + m.path);
  }
  // spot checks on the sizes the prompt book promises
  const at = (p) => M.find(m => m.path === p);
  h.eq(JSON.stringify(at('art/bg/act1.png').gen), '[1080,540]', 'arena backdrop generates at 1080x540');
  h.eq(JSON.stringify(at('art/title.png').gen), '[1080,1920]', 'title generates at 1080x1920');
  h.eq(JSON.stringify(at('art/logo.png').gen), '[1024,384]', 'logo generates at 1024x384');
  h.eq(JSON.stringify(at('art/cabinet.png').size), '[540,450]', 'cabinet overlay covers the 540x450 frame');
  h.eq(JSON.stringify(at('art/items/id/rusty_sword.png').size), '[48,10]', 'item size is its physics box');
  h.eq(JSON.stringify(at('art/claw/prong.png').gen), '[128,256]', 'prong is tall');

  // headless: nothing loads, nothing is served
  h.eq(typeof globalThis.Image, 'undefined', 'node has no Image');
  h.eq(ART.load(), false, 'ART.load headless is a no-op');
  h.eq(ART.load(), false, 'ART.load headless stays a no-op');
  for (const [k, key] of [['item', 'sword'], ['itemId', 'rusty_sword'], ['enemy', 'rat'], ['boss', 'hoard'], ['elite', 'mimic'], ['portrait', 'knight'], ['relic', 'grip_tape'], ['hex', 'shop'], ['bg', 1], ['mapbg', 2], ['title'], ['logo'], ['cabinet'], ['claw', 'palm'], ['status', 'poison'], ['event', 'wishing_well'], ['ui', 'coin'], ['nope', 'x'], [undefined, undefined]]) {
    h.eq(ART.get(k, key), null, 'ART.get(' + k + ', ' + key + ') is null headless');
    h.eq(ART.has(k, key), false, 'ART.has(' + k + ', ' + key + ') is false headless');
  }
  h.eq(ART.status().total, 0, 'nothing was requested headless');
}

/* ------------------------------------------------- the full game boots with ART */
{
  const api = boot();
  h.ok(api.ART && api.CS !== null, 'window.CS carries ART');
  let threw = null;
  try { api.GAME.boot(); } catch (e) { threw = e; }
  h.ok(!threw, 'GAME.boot calls ART.load headless without throwing' + (threw ? ' :: ' + threw : ''));
  h.eq(api.ART.status().total, 0, 'GAME.boot requests nothing headless');
}

/* ------------------------------------------------- a fake browser */
{
  // Every Image records its src; the test decides which ones "exist".
  const made = [];
  globalThis.Image = class {
    constructor() { this.complete = false; this.naturalWidth = 0; this.naturalHeight = 0; made.push(this); }
    set src(v) { this._src = v; }
    get src() { return this._src; }
  };
  try {
    const api = boot({ only: ['util', 'art', 'data', 'map', 'render'] });
    const { ART } = api;
    h.eq(ART.load(), true, 'ART.load runs when Image exists');
    h.eq(ART.load(), false, 'ART.load runs once');
    const M = ART.paths();
    h.eq(made.length, M.length, 'one request per manifest path (' + made.length + ')');
    h.eq(new Set(made.map(i => i._src)).size, made.length, 'no path requested twice');
    h.ok(made.every(i => typeof i.onload === 'function' && typeof i.onerror === 'function'), 'every request has onload and onerror');
    h.eq(ART.get('item', 'sword'), null, 'nothing is served before it loads');
    const exist = new Set(['art/items/sword.png', 'art/enemies/hoard.png', 'art/bg/act2.png', 'art/title.png', 'art/claw/prong.png']);
    for (const img of made) {
      if (exist.has(img._src)) { img.complete = true; img.naturalWidth = 64; img.naturalHeight = 32; img.onload(); }
      else if (img._src === 'art/items/axe.png') { img.complete = true; img.onload(); }   // decodes to 0x0: broken
      else { img.complete = true; img.onerror(); }
    }
    h.ok(ART.get('item', 'sword') && ART.get('item', 'sword')._src === 'art/items/sword.png', 'a loaded item is served');
    h.eq(ART.has('item', 'sword'), true, 'has() agrees');
    h.ok(ART.get('boss', 'hoard') && ART.get('enemy', 'hoard') === ART.get('boss', 'hoard'), 'boss is an alias of enemy');
    h.ok(ART.get('bg', 2) && ART.get('bg', '2') === ART.get('bg', 2), 'bg keys by act number');
    h.ok(ART.get('title') && ART.get('title', 'title') === ART.get('title'), 'title needs no key');
    h.ok(ART.get('claw', 'prong'), 'claw part served');
    h.eq(ART.get('item', 'axe'), null, 'a 0x0 (broken) image is not served');
    h.eq(ART.get('item', 'dagger'), null, 'a 404 is not served');
    h.eq(ART.get('itemId', 'rusty_sword'), null, 'a missing per-id override is null');
    h.eq(ART.get('bg', 1), null, 'a missing backdrop is null');
    const st = ART.status();
    h.eq(st.total, M.length, 'status counts every request');
    h.eq(st.done, M.length, 'every request settled');
    h.eq(st.found, exist.size, 'only the existing files were found');
  } finally {
    delete globalThis.Image;
  }
}

h.done();
