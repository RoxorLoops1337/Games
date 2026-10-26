// Stacking Cats: PWA files, haptics, share card. Headless, no browser.
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

let n = 0;
const t = async (name, fn) => { await fn(); n++; console.log('ok', name); };
const D = 'stacking_cats/';

// every module the game imports must be in the service worker's install list, or the game will not start offline
await t('the service worker pre-caches every game module and static file', () => {
  const sw = readFileSync(D + 'sw.js', 'utf8');
  const list = sw.slice(sw.indexOf('PRECACHE = ['), sw.indexOf('];', sw.indexOf('PRECACHE = [')));
  const missing = readdirSync(D).filter((f) => f.endsWith('.js') && f !== 'sw.js' && !list.includes("'" + f + "'"));
  assert.deepEqual(missing, [], 'not pre-cached: ' + missing.join(', '));
  for (const f of ['index.html', 'manifest.webmanifest']) assert.ok(list.includes("'" + f + "'"), f);
});

const fakeCtx = () => {
  const grad = { addColorStop() {} };
  return new Proxy({}, {
    get(o, k) {
      if (k in o) return o[k];
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => grad;
      if (k === 'measureText') return () => ({ width: 10 });
      return () => undefined;
    },
    set(o, k, v) { o[k] = v; return true; },
  });
};
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => fakeCtx() }) };
globalThis.Path2D = class { constructor() { return new Proxy(this, { get: (o, k) => (k in o ? o[k] : () => {}) }); } };

const png = (f) => { const b = readFileSync(D + f); assert.equal(b.subarray(1, 4).toString(), 'PNG', f); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

await t('manifest has the required fields and real icon files', () => {
  const m = JSON.parse(readFileSync(D + 'manifest.webmanifest', 'utf8'));
  assert.equal(m.name, 'Stacking Cats');
  assert.ok(['fullscreen', 'standalone'].includes(m.display));
  assert.ok(String(m.orientation).startsWith('landscape'));
  assert.equal(m.theme_color, '#150f26'); assert.equal(m.background_color, '#150f26');
  for (const k of ['start_url', 'scope']) assert.ok(!m[k].startsWith('/') && !/^https?:/.test(m[k]), k + ' must be relative');
  const sizes = new Set();
  for (const ic of m.icons) {
    assert.ok(existsSync(D + ic.src), ic.src);
    const [w, h] = png(ic.src); const [ew] = ic.sizes.split('x').map(Number);
    assert.equal(w, ew); assert.equal(h, ew); sizes.add(ic.sizes + ':' + ic.purpose);
  }
  assert.ok(sizes.has('192x192:any') && sizes.has('512x512:any') && sizes.has('512x512:maskable'));
  assert.deepEqual(png('icons/apple-touch-icon.png'), [180, 180]);
  const html = readFileSync(D + 'index.html', 'utf8');
  for (const s of ['rel="manifest"', 'rel="apple-touch-icon"', 'apple-mobile-web-app-capable']) assert.ok(html.includes(s), s);
});

await t('service worker parses, never touches /api/, versions its cache and lists real files', () => {
  execFileSync('node', ['--check', D + 'sw.js']);
  const sw = readFileSync(D + 'sw.js', 'utf8');
  assert.match(sw, /const VERSION = '/);
  assert.ok(sw.includes("'/api/'") && /includes\('\/api\/'\)\)\s*return/.test(sw), 'api requests are passed through');
  assert.ok(!/caches\.[a-z]+\([^)]*\/api\//.test(sw));
  assert.ok(sw.includes('caches.delete'), 'cleans old caches');
  const list = sw.match(/const PRECACHE = \[([\s\S]*?)\];/)[1].match(/'([^']+)'/g).map((s) => s.slice(1, -1));
  for (const f of list) if (f !== './') assert.ok(existsSync(D + f), 'precache file missing: ' + f);
});

await t('pwa.js is safe to load without a browser', async () => {
  const p = await import('../stacking_cats/pwa.js');
  assert.equal(p.canInstall(), false); assert.equal(p.isIosSafari(), false);
  assert.equal(await p.promptInstall(), false);
  assert.doesNotThrow(() => p.registerPwa());
});

await t('haptics: no-op without vibrate, short patterns with it, respects settings', async () => {
  const h = await import('../stacking_cats/haptics.js');
  delete globalThis.navigator;
  for (const k of ['hit', 'crit', 'ko', 'boss', 'merge', 'ui']) assert.equal(h.buzz(k), false);
  const calls = [];
  Object.defineProperty(globalThis, 'navigator', { value: { vibrate: (p) => { calls.push(p); return true; } }, configurable: true });
  for (const k of ['crit', 'ko', 'boss', 'merge', 'ui']) assert.equal(h.buzz(k), true, k);
  assert.equal(calls.length, 5);
  for (const p of calls) { const a = [].concat(p); assert.ok(a.length <= 3 && a.every((v) => v >= 8 && v <= 60), JSON.stringify(p)); }
  assert.equal(h.buzz('nonsense'), false);
  h.setHaptics(false); assert.equal(h.buzz('crit'), false); h.setHaptics(true);
  globalThis.matchMedia = () => ({ matches: true });
  assert.equal(h.buzz('crit'), false, 'off under reduced motion');
  delete globalThis.matchMedia;
  Object.defineProperty(globalThis, 'navigator', { value: { vibrate() { throw new Error('boom'); } }, configurable: true });
  assert.doesNotThrow(() => h.buzz('ko'));
});

await t('share card: a tall stack is scaled down so its top never reaches the subtitle', async () => {
  const { shareStack } = await import('../stacking_cats/share.js');
  for (let n = 0; n <= 5; n++) {
    const { cell, step, bottom } = shareStack(n);
    const topOfStack = bottom - cell - Math.max(0, n - 1) * step;
    assert.ok(topOfStack >= 200, `${n} cats: the top of the stack (${topOfStack}) must stay below the subtitle line`);
    assert.ok(cell <= 250 && cell >= 150, `${n} cats: cats stay a readable size (${cell})`);
  }
  assert.equal(shareStack(1).cell, 250, 'a short stack keeps the full size');
});

await t('share card: cats that do not fit on the tower are counted, not silently dropped', async () => {
  const { shareExtra } = await import('../stacking_cats/share.js');
  assert.equal(shareExtra(0), 0);
  assert.equal(shareExtra(5), 0);
  assert.equal(shareExtra(8), 3);
});

await t('idleHop: a tower cat now and then hops once, each cat on its own beat', async () => {
  const { idleHop } = await import('../stacking_cats/art_util.js');
  let peak = 0, hopping = 0;
  for (let tt = 0; tt < 60; tt += 0.05) { const h = idleHop(tt, 3); assert.ok(h >= 0 && h <= 1, 'lift stays between 0 and 1'); peak = Math.max(peak, h); if (h > 0) hopping++; }
  assert.ok(peak > 0.95, 'a hop reaches its top');
  assert.ok(hopping < 1200 * 0.2, 'cats are on the ground most of the time');
  const a = [], b = [];
  for (let tt = 0; tt < 30; tt += 0.1) { a.push(idleHop(tt, 1) > 0); b.push(idleHop(tt, 2) > 0); }
  assert.notDeepEqual(a, b, 'two cats do not hop in unison');
});

await t('waveProgress: share of the wave already beaten, always between 0 and 1', async () => {
  const { waveProgress } = await import('../stacking_cats/art_util.js');
  assert.equal(waveProgress(10, 10, 20), 0, 'a fresh wave is at the start');
  assert.equal(waveProgress(0, 5, 20), 0.75);
  assert.equal(waveProgress(0, 0, 20), 1);
  assert.equal(waveProgress(0, 0, 0), 0, 'no total means no bar');
  assert.ok(waveProgress(40, 0, 20) >= 0 && waveProgress(0, 0, 20) <= 1, 'summons cannot push it out of range');
});

await t('dangerLevel: a soft warning only when a cat is nearly out of health', async () => {
  const { dangerLevel } = await import('../stacking_cats/art_util.js');
  const cat = (hp, max = 100) => ({ hp, max });
  assert.equal(dangerLevel([]), 0, 'no cats, no warning');
  assert.equal(dangerLevel([cat(100), cat(80)]), 0, 'healthy team');
  assert.equal(dangerLevel([cat(30), cat(90)]), 0, 'exactly at the threshold is still calm');
  assert.ok(dangerLevel([cat(15), cat(90)]) > 0.3 && dangerLevel([cat(15), cat(90)]) < 0.7, 'half way into the red zone');
  assert.equal(dangerLevel([cat(0, 100), cat(90)]), 0, 'fallen cats do not count');
  assert.ok(dangerLevel([cat(1)]) > 0.9 && dangerLevel([cat(1)]) <= 1, 'nearly dead is the strongest warning');
});

await t('clearLine: a short wave summary for the cleared banner', async () => {
  const { clearLine } = await import('../stacking_cats/art_util.js');
  assert.equal(clearLine({ kills: 12, coins: 18.6, time: 41.2 }), '12 mice \u00B7 +18 coins \u00B7 41s');
  assert.equal(clearLine({ kills: 1, coins: 9, time: 8 }), '1 mouse \u00B7 +9 coins \u00B7 8s');
  assert.equal(clearLine({ kills: 0, coins: 0, time: 3 }), '3s', 'nothing to brag about, just the time');
  assert.equal(clearLine(null), '', 'no report, no line');
});

await t('specialLabel: the tray button says whether the special is ready, charging or the cat is down', async () => {
  const { specialLabel } = await import('../stacking_cats/art_util.js');
  assert.equal(specialLabel('Tabby', 'Frenzy', 1, true, false), 'Tabby: Frenzy, ready');
  assert.equal(specialLabel('Tabby', 'Frenzy', 0.4, false, false), 'Tabby: Frenzy, charging 40 percent');
  assert.equal(specialLabel('Tabby', 'Frenzy', 0.4, false, true), 'Tabby: Frenzy, knocked out');
  assert.equal(specialLabel('Tabby', 'Frenzy', 1.7, false, false), 'Tabby: Frenzy, charging 100 percent', 'clamped');
  assert.ok(!specialLabel('A', 'B', 0.5, false, false).includes(String.fromCharCode(0x2014)));
  const js = (await import('node:fs')).readFileSync('stacking_cats/main.js', 'utf8');
  assert.ok(/const lab = specialLabel\(/.test(js) && /setAttribute\('aria-label', lab\)/.test(js), 'the tray updates its label each frame');
});

await t('confirmTap: the first tap arms, a second tap within three seconds confirms', async () => {
  const { confirmTap } = await import('../stacking_cats/art_util.js');
  assert.deepEqual(confirmTap(0, 10), { fire: false, armedAt: 10 }, 'first tap only arms');
  assert.deepEqual(confirmTap(10, 12.5), { fire: true, armedAt: 0 }, 'second tap in time fires and resets');
  assert.deepEqual(confirmTap(10, 13.5), { fire: false, armedAt: 13.5 }, 'too slow: it arms again instead');
  assert.equal(confirmTap(0, 0.5).fire, false, 'time zero is not an armed tap');
});

await t('share card shows the story tagline above the link and keeps it off the stats panel', async () => {
  const { drawShareCard, SHARE_TAGLINE, SHARE_URL } = await import('../stacking_cats/share.js');
  const texts = [];
  const rec = new Proxy({}, { get: (o, k) => (k === 'fillText' ? (t, x, y) => texts.push({ t, y }) : k === 'measureText' ? () => ({ width: 10 }) : k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : (o[k] ?? (() => {}))), set: (o, k, v) => { o[k] = v; return true; } });
  assert.equal(drawShareCard({ getContext: () => rec }, { wave: 12, cats: [] }), true);
  const tag = texts.find((x) => x.t === SHARE_TAGLINE), url = texts.find((x) => x.t === SHARE_URL);
  assert.ok(tag && url, 'tagline and link are drawn');
  assert.ok(tag.y < url.y && url.y - tag.y >= 40, 'the tagline sits above the link');
  assert.ok(tag.y > 850, 'below the stats panel (ends at y=840)');
  assert.ok(!SHARE_TAGLINE.includes('\u2014'));
});

await t('share card draws for several runs without throwing', async () => {
  const { drawShareCard, shareRun, SHARE_W } = await import('../stacking_cats/share.js');
  const { CATS } = await import('../stacking_cats/cats.js');
  const runs = [
    { wave: 1, kills: 0, bossKills: 0, biggest: 0, diff: 'Cozy', cats: [] },
    { wave: 12, kills: 340, bossKills: 2, biggest: 5120, diff: 'Normal', cats: CATS.slice(0, 3).map((c) => c.id) },
    { wave: 40, kills: 99999, bossKills: 7, biggest: 3200000, diff: 'Hard', daily: true, cats: CATS.slice(0, 8).map((c) => c.id) },
    { cats: ['nope'] }, {},
  ];
  for (const r of runs) { const c = { getContext: () => fakeCtx() }; assert.equal(drawShareCard(c, r), true); assert.equal(c.width, SHARE_W); }
  assert.equal(drawShareCard({ getContext: () => null }, {}), false);
  assert.equal(drawShareCard(null, {}), false);
  assert.equal(await shareRun(runs[1]), 'failed');   // no toBlob in the fake canvas: reports failure, never throws
});

await t('no em dashes in the new files', () => {
  const files = ['manifest.webmanifest', 'sw.js', 'pwa.js', 'haptics.js', 'share.js', 'main.js', 'index.html'].map((f) => D + f).concat('tests/stacking_cats_pwa.test.mjs');
  for (const f of files) assert.ok(!readFileSync(f, 'utf8').includes(String.fromCharCode(0x2014)), f);
  assert.ok(readdirSync(D + 'icons').length >= 4);
});

await t('story: the intro timeline is walkable and every line of the story is clean and cat themed', async () => {
  const st = await import('../stacking_cats/story.js');
  assert.ok(st.INTRO.length >= 5, 'the intro has several scenes');
  let at = 0;
  for (let i = 0; i < st.INTRO.length; i++) {
    const mid = st.introAt(at + st.INTRO[i].dur / 2);
    assert.equal(mid.i, i, 'the middle of scene ' + i + ' is scene ' + i);
    assert.ok(mid.p > 0.45 && mid.p < 0.55, 'progress is about half');
    at += st.INTRO[i].dur;
  }
  assert.equal(st.INTRO_LEN, at, 'the total length is the sum of the scenes');
  assert.equal(st.introAt(-1).i, 0);
  assert.ok(st.introAt(at + 5).done, 'past the end the intro reports done');
  assert.equal(st.typed('Hello world', 0), '');
  assert.equal(st.typed('Hello world', 1), 'Hello world');
  assert.ok(st.typed('Hello world', 0.5).length > 2 && st.typed('Hello world', 0.5).length < 11, 'half way is a prefix');
  const all = [...st.INTRO.map((s) => s.text), ...st.RESCUE_LINES, ...st.FALL_LINES, st.WORLD.tagline];
  for (const line of all) assert.ok(!line.includes('\u2014'), 'no em dash in: ' + line);
  const words = all.join(' ').toLowerCase();
  for (const w of ['meow', 'whisker', 'paw', 'purr', 'cat']) assert.ok(words.includes(w), 'the story uses the word ' + w);
  assert.ok(st.rescueLine(0) !== st.rescueLine(1), 'the rescue line changes between nests');
  assert.ok(st.fallLine(3).length > 10);
});

await t('story: every five waves a new chapter starts in a new region, and each nest has a villain taunt', async () => {
  const st = await import('../stacking_cats/story.js');
  const { THEMES } = await import('../stacking_cats/cats.js');
  assert.equal(st.CHAPTERS.length, THEMES.length, 'one story beat per region');
  assert.ok(st.isChapterStart(1) && st.isChapterStart(6) && st.isChapterStart(11), 'chapters start on 1, 6, 11');
  assert.ok(!st.isChapterStart(2) && !st.isChapterStart(5) && !st.isChapterStart(10), 'not mid chapter or on a nest wave');
  assert.deepEqual(st.chapterOf(1), { n: 1, theme: 0 });
  assert.deepEqual(st.chapterOf(6), { n: 2, theme: 1 });
  assert.equal(st.chapterOf(31).theme, 0, 'after the last region the map starts over');
  const line = st.chapterLine(6, THEMES);
  assert.ok(line.startsWith('Chapter 2'), line);
  assert.ok(line.includes(THEMES[1].name), 'the line names the region');
  for (const c of st.CHAPTERS) { assert.ok(c.length > 20 && !c.includes('\u2014'), c); }
  assert.ok(st.TAUNTS.length >= 5);
  for (const tn of st.TAUNTS) assert.ok(!tn.includes('\u2014') && tn.length > 10, tn);
  assert.notEqual(st.taunt(0), st.taunt(1));
  assert.ok(/squeak|mice|mouse|cheese/i.test(st.TAUNTS.join(' ')), 'taunts sound like the mouse king');
});

await t('story: a freed cat thanks you with a line of its own', async () => {
  const st = await import('../stacking_cats/story.js');
  assert.ok(st.FREED_LINES.length >= 6);
  for (const l of st.FREED_LINES) assert.ok(!l.includes('\u2014') && l.length > 12, l);
  assert.ok(/meow|whisker|paw|purr/i.test(st.FREED_LINES.join(' ')), 'freed cats talk like cats');
  assert.notEqual(st.freedLine(0), st.freedLine(1));
  assert.equal(st.freedLine(0), st.freedLine(st.FREED_LINES.length), 'the lines loop');
  assert.equal(st.freedToast('Tabby', 2), 'Tabby: "' + st.freedLine(2) + '"');
});

await t('story: every cat has its own one line story for the Cat Dex', async () => {
  const st = await import('../stacking_cats/story.js');
  const { CATS } = await import('../stacking_cats/cats.js');
  const seen = new Set();
  for (const c of CATS) {
    const l = st.catStory(c.id);
    assert.ok(l && l.length >= 30 && l.length <= 130, c.id + ' needs a story line of 30 to 130 characters: ' + l);
    assert.ok(!l.includes('\u2014'), 'no em dash for ' + c.id);
    assert.ok(!seen.has(l), 'story lines are unique: ' + c.id);
    seen.add(l);
  }
  assert.equal(st.catStory('nobody'), '', 'unknown cats have no story');
});

await t('story: the chapter beat toast steps aside while the first coach tip is about to appear', async () => {
  const st = await import('../stacking_cats/story.js');
  assert.equal(st.beatToastWanted(1, true), false, 'wave 1 with the tutorial still pending: the coach tip would wipe the toast');
  assert.equal(st.beatToastWanted(1, false), true, 'wave 1 without a pending tip shows it');
  assert.equal(st.beatToastWanted(6, true), true, 'later chapters always show it');
  assert.equal(st.beatToastWanted(7, true), false, 'only the first wave of a chapter has a beat');
});

await t('story: the mouse king falls at the end of the map, once per run, with a one time royal reward', async () => {
  const st = await import('../stacking_cats/story.js');
  assert.equal(st.FINALE_WAVE, st.CHAPTERS.length * 5, 'the finale is the last nest of the first trip around the map');
  assert.equal(st.finaleDue(st.FINALE_WAVE, false), true);
  assert.equal(st.finaleDue(st.FINALE_WAVE, true), false, 'only once per run');
  assert.equal(st.finaleDue(st.FINALE_WAVE - 5, false), false, 'not before the last nest');
  assert.equal(st.finaleDue(st.FINALE_WAVE + 5, false), false, 'not on later laps');
  assert.equal(st.finaleGems(true), 5, 'the first victory pays gems');
  assert.equal(st.finaleGems(false), 0, 'later victories pay nothing extra');
  assert.ok(st.FINALE_LINES.length >= 3);
  for (const l of st.FINALE_LINES) assert.ok(!l.includes('\u2014') && l.length > 20, l);
  assert.ok(/Squeakimus/.test(st.FINALE_TITLE) && !st.FINALE_TITLE.includes('\u2014'));
});

await t('story: the epilogue is a short two scene timeline with clean captions', async () => {
  const st = await import('../stacking_cats/story.js');
  assert.equal(st.EPILOGUE.length, 2);
  let at = 0;
  for (let i = 0; i < st.EPILOGUE.length; i++) {
    const mid = st.epilogueAt(at + st.EPILOGUE[i].dur / 2);
    assert.equal(mid.i, i);
    assert.ok(!st.EPILOGUE[i].text.includes('\u2014'), st.EPILOGUE[i].text);
    at += st.EPILOGUE[i].dur;
  }
  assert.equal(st.EPILOGUE_LEN, at);
  assert.ok(st.epilogueAt(at + 1).done);
  assert.ok(st.EPILOGUE_LEN > 8 && st.EPILOGUE_LEN < 20, 'short enough to enjoy and not too short to read');
});

await t('story: destroying a nest closes the chapter with its own line', async () => {
  const st = await import('../stacking_cats/story.js');
  assert.equal(st.chapterDoneLine(5), 'Chapter 1 complete! A friend is free!');
  assert.equal(st.chapterDoneLine(10), 'Chapter 2 complete! A friend is free!');
  assert.ok(!st.chapterDoneLine(30).includes('\u2014'));
});

await t('share text adds the mouse count and a cat pun when the run has kills, and stays short without them', async () => {
  const { shareText } = await import('../stacking_cats/share.js');
  const withKills = shareText({ wave: 12, kills: 340 });
  assert.ok(/340 mice/.test(withKills) && /paw|purr|meow|whisker|fur/i.test(withKills), withKills);
  assert.ok(!withKills.includes('\u2014'));
  assert.ok(!/mice/.test(shareText({ wave: 5 })), 'no kills means no mouse count');
  assert.ok(/1 mouse(?!s)/.test(shareText({ wave: 5, kills: 1 })), 'one kill is singular');
  assert.ok(withKills.length <= 200, 'short enough for a post');
});

await t('share text names the chapter as well as the wave and has no em dash', async () => {
  const { shareText } = await import('../stacking_cats/share.js');
  const tx = shareText({ wave: 12 });
  assert.ok(tx.includes('wave 12') && /chapter 3/i.test(tx), tx);
  assert.ok(tx.includes('Stacking Cats') && !tx.includes('\u2014'));
  assert.ok(/chapter 1/i.test(shareText({ wave: 1 })), 'wave 1 is chapter 1');
  assert.ok(shareText({}).includes('wave 0') || shareText({}).length > 10, 'a missing wave does not throw');
});

await t('coachAbove: a tip sits just over its target, clamped inside the stage', async () => {
  const { coachAbove } = await import('../stacking_cats/art_util.js');
  const app = { left: 100, top: 50 };
  // scale 0.5: a target at screen (300,250) is at stage (400,400); bubble 60 high goes 12 above it
  const a = coachAbove({ left: 300, top: 250, width: 100 }, app, 0.5, 60, 960);
  assert.deepEqual(a, { x: 500, y: 328, side: false }, 'centred over the target, bubble bottom 12 above it');
  assert.equal(coachAbove({ left: 100, top: 52, width: 20 }, app, 1, 60, 960).y, 6, 'never above the top edge');
  assert.equal(coachAbove({ left: 100, top: 400, width: 10 }, app, 1, 60, 960).x, 139, 'keeps room on the left edge');
  assert.equal(coachAbove({ left: 1100, top: 400, width: 10 }, app, 1, 60, 960).x, 821, 'keeps room on the right edge');
});

await t('titleTag: the line under the logo follows the story', async () => {
  const { titleTag } = await import('../stacking_cats/story.js');
  assert.equal(titleTag(false, 3, 31), 'Stack your cats. Merge them. Smash the mouse nests.', 'fresh save keeps the classic line');
  assert.equal(titleTag(false, 8, 31), '8 of 31 cats rescued. Keep smashing the nests!');
  assert.equal(titleTag(true, 20, 31), 'The Cheddar Throne has fallen. 11 cats still caged!');
  assert.equal(titleTag(true, 31, 31), 'Every cat is free and purring. Whiskerton is safe!');
  for (const [d, u] of [[false, 3], [false, 9], [true, 9], [true, 31]]) assert.ok(!/\u2014/.test(titleTag(d, u, 31)), 'no em dash');
});

await t('nestTitle: the wave 30 nest bar names King Squeakimus', async () => {
  const { nestTitle } = await import('../stacking_cats/story.js');
  assert.equal(nestTitle(10, 'Drain Pipe Den'), 'Drain Pipe Den');
  assert.equal(nestTitle(30, 'Cheese Hut'), 'King Squeakimus: Cheese Hut');
  assert.equal(nestTitle(60, 'Cheese Hut'), 'Cheese Hut', 'only the first trip around the map');
  assert.ok(!/\u2014/.test(nestTitle(30, 'x')), 'no em dash');
});

await t('nestBannerTitle: wave 30 announces the final battle', async () => {
  const { nestBannerTitle } = await import('../stacking_cats/story.js');
  assert.equal(nestBannerTitle(10), 'NEST BATTLE!');
  assert.equal(nestBannerTitle(30), 'FINAL BATTLE!');
  assert.equal(nestBannerTitle(60), 'NEST BATTLE!');
});

await t('pickLine: the first start pick sets the story up, later picks explain merging', async () => {
  const { pickLine } = await import('../stacking_cats/story.js');
  assert.ok(/royal guard/.test(pickLine(0)) && /pick the first/.test(pickLine(0)));
  assert.ok(/merges/.test(pickLine(1)) && pickLine(1) === pickLine(2));
  assert.ok(!/\u2014/.test(pickLine(0) + pickLine(1)), 'no em dash');
});

await t('roadLine: the road screen names the next chapter and its region', async () => {
  const { roadLine } = await import('../stacking_cats/story.js');
  const themes = [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }, { name: 'E' }, { name: 'F' }];
  assert.equal(roadLine(5, themes), 'Where to next? Chapter 2 waits in B. This road shapes the next five waves and the next nest.');
  assert.ok(/Chapter 3 waits in C/.test(roadLine(10, themes)));
  assert.ok(/Chapter 7 waits in A/.test(roadLine(30, themes)), 'the map starts over after the last region');
  assert.ok(!/\u2014/.test(roadLine(5, themes)), 'no em dash');
});

await t('wrapCaption: balanced two-line captions, no lonely last word', async () => {
  const { wrapCaption, INTRO, EPILOGUE } = await import('../stacking_cats/story.js');
  const m = (s) => s.length * 12;   // 12 px per character
  assert.deepEqual(wrapCaption('short caption', m, 800), ['short caption'], 'one line stays one line');
  const l = wrapCaption('Then one night the Cheese Moon went dark, and the mice crept out to squeak.', m, 800);
  assert.equal(l.length, 2);
  assert.ok(l[1].length > 20, 'second line is not an orphan: ' + l[1]);
  assert.equal(l.join(' '), 'Then one night the Cheese Moon went dark, and the mice crept out to squeak.', 'no words lost');
  for (const sc of [...INTRO, ...EPILOGUE]) {
    const lines = wrapCaption(sc.text, m, 800);
    assert.equal(lines.join(' '), sc.text);
    assert.ok(lines.every((x) => m(x) <= 800), 'every line fits');
    if (lines.length === 2) assert.ok(lines[1].length >= lines[0].length * 0.4, 'balanced: ' + sc.id);
  }
});

await t('kingdomLine: the village story grows with the kingdom level', async () => {
  const { kingdomLine } = await import('../stacking_cats/story.js');
  const lines = [0, 5, 6, 15, 16, 29, 30, 80].map(kingdomLine);
  assert.equal(lines[0], lines[1]);
  assert.notEqual(lines[1], lines[2]);
  assert.equal(lines[2], lines[3]);
  assert.notEqual(lines[3], lines[4]);
  assert.notEqual(lines[5], lines[6]);
  assert.equal(lines[6], lines[7]);
  assert.ok(lines.every((l) => l.length > 10 && !/\u2014/.test(l)), 'no em dash');
});

await t('coachAbove: with no room above the target (a title is there) the tip goes to its right, tail left', async () => {
  const { coachAbove } = await import('../stacking_cats/art_util.js');
  const app = { left: 0, top: 0 };
  const hi = coachAbove({ left: 100, top: 80, width: 200, height: 40 }, app, 1, 100, 960);
  assert.equal(hi.side, true, 'only 80px of room for a 100px bubble');
  assert.deepEqual([hi.x, hi.y], [314, 80], 'just right of the target: left edge at 300 + 14, level with its top');
  const lo = coachAbove({ left: 100, top: 300, width: 200, height: 40 }, app, 1, 100, 960);
  assert.equal(lo.side, false);
  assert.equal(lo.y, 188);
});

await t('freedLineFor: the game over screen announces freed cats in story words', async () => {
  const { freedLineFor } = await import('../stacking_cats/story.js');
  assert.equal(freedLineFor(1), 'A caged cat is free and joins the royal guard!');
  assert.equal(freedLineFor(3), '3 caged cats are free and join the royal guard!');
  assert.ok(!/\u2014/.test(freedLineFor(1) + freedLineFor(2)), 'no em dash');
});

console.log(n + ' passed');
