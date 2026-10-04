// Inkwoven browser smoke suite: the REAL game in REAL headless Chromium (playwright-core), driven with real mouse, touch and keyboard
// input. The headless suites run the same scripts against a stubbed DOM; this one catches what only a browser shows: CSS that hides or
// covers a button, a canvas that stays blank, a script that only breaks in a true engine, a viewport that cannot reach Begin.
//
//   guided   title (tap to begin) -> New Tale -> pick two heroes -> Begin -> story pages (Skip) -> map: preview and confirm a paint with two
//            clicks, walk onto the painted hex -> a fight (GAME.debug.open): tap an attack, drag a card into the play zone, Swap, End Turn
//            by key -> the win -> reward card and Continue -> map -> Esc, Save and quit -> title -> Continue -> map again
//   reward   a tap while the reward cards are still being dealt face down takes nothing, a tap after the flip takes the card
//   canvas   the #view canvas holds real, varied pixels on the title, the map and the fight (a blank or black canvas fails)
//   phone    844x390 with touch: title to hero select to Begin by taps; 390x844 portrait shows the "turn your device sideways" panel
//   clean    no page error, no console error or warning, no window.__errors, no failed request, in any of the above
//
// Time is the game's own virtual clock (GAME.debug.freeze + GAME.debug.tick) wherever a screenshot or a number depends on it, so the
// run is the same every time; clicks are real. SKIPPED with a clear message (and exit 0) when playwright-core or a Chromium build is
// missing, unless RB_BROWSER=1 asks for a hard failure. CHROMIUM_PATH overrides the browser. Under about 60 seconds; a watchdog kills a hang.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { harness } from './hocus_vocus_lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(HERE, '..');
const NAME = 'hocus_vocus browser';
const REQUIRED = process.env.RB_BROWSER === '1';

function skip(why) {
  console.log(NAME + ': SKIPPED, ' + why + (REQUIRED ? ' (RB_BROWSER=1: this is a failure)' : ' (set RB_BROWSER=1 to make a missing browser fail)'));
  if (REQUIRED) { console.log(NAME + ': 0 passed, 1 failed'); process.exit(1); }
  console.log(NAME + ': 0 passed, 0 failed');
  process.exit(0);
}

let chromium;
try { chromium = createRequire(import.meta.url)(path.join(REPO, 'node_modules', 'playwright-core')).chromium; } catch (e) { skip('playwright-core is not installed (npm install)'); }
const exe = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
if (exe && !fs.existsSync(exe)) skip('CHROMIUM_PATH does not exist: ' + exe);
if (!exe) { let found = null; try { found = chromium.executablePath(); } catch (e) { /* none */ } if (!found || !fs.existsSync(found)) skip('no Chromium build found (set CHROMIUM_PATH or run npx playwright install chromium)'); }
const LAUNCH = { executablePath: exe, args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--force-color-profile=srgb', '--disable-lcd-text', '--font-render-hinting=none'] };
const PAGE_URL = pathToFileURL(path.join(REPO, 'hocus_vocus', 'index.html')).href + '?debug=1&seed=777&notutorial=1';

const t = harness(NAME);
const t0 = Date.now();
const rawTest = t.test.bind(t);
t.test = (name, fn) => rawTest(name, async () => { const a = Date.now(); try { await fn(); } finally { console.log('  [' + ((Date.now() - a) / 1000).toFixed(1) + ' s] ' + name.slice(0, 60)); } });
let browser = null;
const watchdog = setTimeout(async () => { console.log('FAIL: the browser suite hung for 150 s'); try { await browser.close(); } catch (e) { /* gone */ } process.exit(1); }, 150000);

// ---------------------------------------------------------------------------------------------------- a session: one page, everything it complains about
async function open(ctxOpts) {
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 1280, height: 720 }, colorScheme: 'dark', deviceScaleFactor: 1 }, ctxOpts));
  const page = await ctx.newPage();
  const bad = [];
  page.on('pageerror', (e) => bad.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') bad.push('console.' + m.type() + ': ' + m.text().slice(0, 200)); });
  page.on('requestfailed', (r) => bad.push('request failed: ' + r.url().slice(-80)));
  page.on('response', (r) => { if (r.status() >= 400) bad.push('http ' + r.status() + ': ' + r.url().slice(-80)); });
  await page.goto(PAGE_URL, { waitUntil: 'load' });
  await page.waitForFunction('window.__booted === true', null, { timeout: 15000 });
  await page.evaluate(() => GAME.debug.freeze(true));
  const s = {
    page, bad,
    tick: (ms = 500) => page.evaluate((m) => GAME.debug.tick(m, 32), ms),
    ev: (fn, arg) => page.evaluate(fn, arg),
    screen: () => page.evaluate(() => UI.currentName),
    overlay: () => page.evaluate(() => (UI.overlay.top && UI.overlay.top() ? UI.overlay.top().name : null)),
    // the centre of an element in client px, or null when it is missing or has no size
    centre: (sel, text) => page.evaluate(([q, tx]) => {
      const els = [...document.querySelectorAll(q)].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 2 && r.height > 2 && (!tx || new RegExp(tx, 'i').test(((e.getAttribute('aria-label') || '') + ' ' + e.textContent).trim().replace(/\s+/g, ' '))); });
      if (!els.length) return null;
      const r = els[0].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, [sel, text || '']),
    async press(sel, text, o = {}) {                                   // a real click (or tap) at the centre of the first match
      const c = await s.centre(sel, text);
      if (!c) throw new Error('nothing to press: ' + sel + (text ? ' /' + text + '/' : ''));
      if (o.touch) await page.touchscreen.tap(c.x, c.y); else await page.mouse.click(c.x, c.y);
      await s.tick(o.ms === undefined ? 500 : o.ms);
    },
    async stagePt(x, y) { const b = await page.evaluate(() => { const r = document.getElementById('stage').getBoundingClientRect(); return { l: r.left, t: r.top, k: r.width / 1280 }; }); return { x: b.l + x * b.k, y: b.t + y * b.k }; },
    // how many different colours (4 bits a channel) the #view canvas shows: a blank or black canvas has one or two
    palette: () => page.evaluate(() => {
      const v = document.getElementById('view'); const c = document.createElement('canvas'); c.width = 64; c.height = 36;
      const g = c.getContext('2d'); g.drawImage(v, 0, 0, 64, 36); const d = g.getImageData(0, 0, 64, 36).data; const seen = new Set();
      for (let i = 0; i < d.length; i += 4) seen.add((d[i] >> 4) * 256 + (d[i + 1] >> 4) * 16 + (d[i + 2] >> 4));
      return seen.size;
    }),
    async close() { try { await ctx.close(); } catch (e) { /* gone */ } },
  };
  return s;
}
const clean = (s, label) => t.ok(s.bad.length === 0, label + ': no page error, console error or failed request' + (s.bad.length ? ' [' + s.bad.slice(0, 3).join(' | ') + ']' : ''));
const noGameErrors = async (s, label) => { const e = await s.ev(() => (window.__errors || []).map((x) => JSON.stringify(x).slice(0, 160))); t.ok(e.length === 0, label + ': window.__errors is empty' + (e.length ? ' [' + e.join(' | ') + ']' : '')); };

try {
  browser = await chromium.launch(LAUNCH);

  // ================================================================================================ the guided desktop flow
  await t.test('guided: title to hero select to the map by real clicks', async () => {
    const s = await open();
    await s.tick(900);
    t.eq(await s.screen(), 'title', 'guided: boots to the title');
    t.ok((await s.palette()) >= 12, 'guided: the title canvas holds real pixels (' + (await s.palette()) + ' colours)');
    t.ok(!!(await s.centre('[data-act=new]')), 'guided: the New Tale plaque is on screen');
    const gate = await s.centre('.mn-gate');
    if (gate) { await s.page.mouse.click(gate.x, gate.y); await s.tick(300); }
    await s.press('[data-act=new]', null, { ms: 1300 });
    t.eq(await s.screen(), 'heroSelect', 'guided: New Tale opens the hero select');
    await s.press('.mn-cards button', '^Hanae', { ms: 250 });
    await s.press('.mn-cards button', '^Kuro', { ms: 250 });
    const chosen = await s.ev(() => UI.screens.heroSelect.state().chosen);
    t.eq(chosen.join(','), 'hanae,kuro', 'guided: two clicks chose Hanae in front, Kuro behind');
    await s.press('[data-act=begin]', '', { ms: 700 });
    for (let i = 0; i < 5 && (await s.screen()) === 'story'; i++) { await s.press('button', '^skip', { ms: 900 }); }
    for (let i = 0; i < 4 && (await s.screen()) !== 'map'; i++) await s.tick(700);
    t.eq(await s.screen(), 'map', 'guided: Begin leads through the story pages to the map');
    await s.tick(1500);
    t.ok((await s.palette()) >= 20, 'guided: the map canvas holds real pixels (' + (await s.palette()) + ' colours)');
    const run = await s.ev(() => ({ heroes: GAME.state.R.heroes.map((h) => h.id), ink: GAME.state.R.ink, painted: Object.values(GAME.state.R.map.tiles).filter((x) => x.painted).length }));
    t.eq(run.heroes.join(','), 'hanae,kuro', 'guided: the run has the party that was chosen');

    // paint: a click on the fog previews the chain (a single hex is painted at once), the next click confirms or walks; the invisible tutorial
    // anchor marks the first hex of the cheapest chain, and moves onto the painted hex afterwards
    const pos = () => s.ev(() => GAME.state.R.map.pos.q + ',' + GAME.state.R.map.pos.r);
    const pos0 = await pos();
    const a = await s.centre('[data-tut=hex]');
    t.ok(!!a, 'guided: the map marks a hex to paint');
    await s.page.mouse.click(a.x, a.y); await s.tick(300);
    await s.page.mouse.click(a.x, a.y); await s.tick(1800);
    const after = await s.ev(() => ({ ink: GAME.state.R.ink, painted: Object.values(GAME.state.R.map.tiles).filter((x) => x.painted).length }));
    t.ok(after.painted > run.painted, 'guided: clicking the marked hex painted it (' + run.painted + ' -> ' + after.painted + ')');
    t.ok(after.ink < run.ink, 'guided: and spent Ink (' + run.ink + ' -> ' + after.ink + ')');
    let pos1 = await pos();
    if (pos1 === pos0 && (await s.screen()) === 'map') {                 // still standing at the start: a click on the painted hex walks there
      const w = await s.centre('[data-tut=hex]');
      await s.page.mouse.click(w.x, w.y); await s.tick(2400);
      pos1 = await pos();
    }
    t.ok(pos1 !== pos0 || (await s.screen()) !== 'map', 'guided: the party walked onto painted ground (' + pos0 + ' -> ' + pos1 + ')');
    await noGameErrors(s, 'guided/map');
    clean(s, 'guided/map');
    await s.close();
  });

  await t.test('guided: a fight by tap, drag, Swap and key, the win, the reward, and Save and quit then Continue', async () => {
    const s = await open();
    await s.tick(600);
    await s.ev(() => GAME.debug.open('combat', { enemies: ['kappa', 'kodama'], heroes: ['hanae', 'kuro'] }));
    await s.tick(1800);
    t.eq(await s.screen(), 'combat', 'fight: on the combat screen');
    t.ok((await s.palette()) >= 25, 'fight: the combat canvas holds real pixels (' + (await s.palette()) + ' colours)');
    const info = () => s.ev(() => { const C = GAME.debug.combat().C; return { turn: C.turn, phase: C.phase, energy: C.energy, hand: C.hand.length, foes: C.enemies.map((e) => e.hp + e.block), front: C.heroes.find((h) => h.row === 'front').id, hp: C.heroes.map((h) => h.hp) }; });
    const i0 = await info();
    t.eq(i0.hand, 5, 'fight: five cards in hand');
    t.ok(await s.ev(() => document.querySelectorAll('.cm-hand .card').length >= 5), 'fight: the hand is on the page');

    // tap an attack card: the first tap plays it on a lone target, or selects it when there are several; then tap a foe
    const attack = await s.ev(() => { const C = GAME.debug.combat().C; const c = C.hand.find((x) => C.needsTarget(x.uid)); return { uid: c.uid, targets: C.legalTargets(c.uid) }; });
    await s.press('.cm-hand .card[data-uid="' + attack.uid + '"]', null, { ms: 700 });
    if (attack.targets.length > 1) await s.press('.cm-en[data-enemy="' + attack.targets[0] + '"] .cm-ehit', null, { ms: 1200 });
    await s.tick(900);
    const i1 = await info();
    t.ok(i1.hand === i0.hand - 1 && i1.energy < i0.energy, 'fight: a tap on an attack played it (hand ' + i0.hand + ' -> ' + i1.hand + ', Energy ' + i0.energy + ' -> ' + i1.energy + ')');
    t.ok(i1.foes.join() !== i0.foes.join(), 'fight: and a foe took the blow (' + i0.foes + ' -> ' + i1.foes + ')');

    // drag a card that needs no target above the hand
    const self = await s.ev(() => { const C = GAME.debug.combat().C; const c = C.hand.find((x) => !C.needsTarget(x.uid) && C.canPlay(x.uid).ok); return c ? c.uid : null; });
    if (self !== null) {
      const from = await s.centre('.cm-hand .card[data-uid="' + self + '"]');
      const to = await s.stagePt(640, 280);
      await s.page.mouse.move(from.x, from.y); await s.page.mouse.down(); await s.page.mouse.move(to.x, to.y, { steps: 10 }); await s.page.mouse.up();
      await s.tick(1100);
      const i2 = await info();
      t.ok(i2.hand === i1.hand - 1, 'fight: dragging a card above the hand played it (hand ' + i1.hand + ' -> ' + i2.hand + ')');
    }
    // swap rows with the button, end the turn with E
    const f0 = (await info()).front;
    await s.press('.cm-swap', null, { ms: 1500 });
    const f1 = (await info()).front;
    t.ok(f1 !== f0, 'fight: the Swap button moved the other hero to the front (' + f0 + ' -> ' + f1 + ')');
    const turn = (await info()).turn;
    await s.page.keyboard.press('e');
    await s.tick(3400);
    t.ok((await info()).turn === turn + 1, 'fight: E ended the turn and the next one began (turn ' + turn + ' -> ' + (await info()).turn + ')');

    // win it for real: leave each foe one hit from death (the documented debug hook), then play attacks by tap until the fight ends
    for (let round = 0; round < 6 && (await s.screen()) === 'combat'; round++) {
      await s.ev(() => { const d = GAME.debug.combat(); d.C.enemies.forEach((e) => { if (!e.down) d.setHp(e.id, 1); }); });
      await s.tick(300);
      for (let k = 0; k < 4 && (await s.screen()) === 'combat'; k++) {
        const a = await s.ev(() => { const C = GAME.debug.combat().C; if (C.phase !== 'player' || C.result) return null; const c = C.hand.find((x) => C.needsTarget(x.uid) && C.legalTargets(x.uid).length && C.canPlay(x.uid, C.legalTargets(x.uid)[0]).ok); return c ? { uid: c.uid, targets: C.legalTargets(c.uid) } : null; });
        if (!a) break;
        await s.press('.cm-hand .card[data-uid="' + a.uid + '"]', null, { ms: 600 });
        if (a.targets.length > 1) await s.press('.cm-en[data-enemy="' + a.targets[0] + '"] .cm-ehit', null, { ms: 1000 });
        await s.tick(900);
      }
      if ((await s.screen()) === 'combat') { await s.page.keyboard.press('e'); await s.tick(3200); }
    }
    for (let i = 0; i < 6 && (await s.screen()) === 'combat'; i++) await s.tick(1500);
    t.eq(await s.screen(), 'reward', 'fight: a won fight leads to the reward page');
    await s.tick(2000);
    const offer = await s.centre('.rw-cards .card:not(.back)');
    if (offer) { await s.page.mouse.click(offer.x, offer.y); await s.tick(700); }
    for (let i = 0; i < 3 && (await s.screen()) === 'reward'; i++) { const b = await s.centre('button', '^(continue|take and continue|skip card)'); if (!b) { await s.tick(600); continue; } await s.page.mouse.click(b.x, b.y); await s.tick(1500); }
    for (let i = 0; i < 4 && (await s.screen()) !== 'map'; i++) await s.tick(800);
    t.eq(await s.screen(), 'map', 'fight: Continue on the reward page returns to the map');

    // pause, save and quit, continue
    await s.tick(800);
    await s.page.keyboard.press('Escape'); await s.tick(700);
    t.eq(await s.overlay(), 'pause', 'save: Esc opens the pause overlay');
    const saved = await s.ev(() => JSON.stringify(RUN.serialize(GAME.state.R)));
    await s.press('[data-act=quit]', null, { ms: 1800 });
    t.eq(await s.screen(), 'title', 'save: Save and quit goes to the title');
    await s.ev(() => { GAME.state.R = null; });
    await s.press('[data-act=continue]', null, { ms: 2200 });
    for (let i = 0; i < 3 && (await s.screen()) !== 'map'; i++) await s.tick(900);
    t.eq(await s.screen(), 'map', 'save: Continue returns to the map');
    t.eq(await s.ev(() => JSON.stringify(RUN.serialize(GAME.state.R))), saved, 'save: the run came back exactly');
    await noGameErrors(s, 'fight');
    clean(s, 'fight');
    // the loop is alive in real time too: unfreeze and count frames for a moment
    await s.ev(() => GAME.debug.freeze(false));
    const frames = await s.ev(() => new Promise((res) => { let n = 0; const end = performance.now() + 1200; const f = () => { n++; if (performance.now() < end) requestAnimationFrame(f); else res(n); }; requestAnimationFrame(f); }));
    t.ok(frames >= 3, 'fight: the real frame loop runs after unfreezing (' + frames + ' frames in 1.2 s)');
    await s.close();
  });

  await t.test('reward: a tap while the cards are still being dealt face down takes nothing; once flipped it takes the card', async () => {
    const s = await open();
    await s.tick(600);
    await s.ev(() => GAME.debug.open('reward', { source: 'combat', gold: 24, cards: ['hanae_full_bloom', 'hanae_twin_petals', 'kuro_ink_bolt'], relics: [], gems: [] }));
    await s.tick(300);
    const early = await s.centre('.rw-cards .card:not(.back)');
    t.ok(!!early, 'reward: the dealt cards are on the page');
    await s.page.mouse.click(early.x, early.y); await s.tick(300);
    const hint = () => s.ev(() => (document.querySelector('.rw-hint') || {}).textContent || '');
    t.ok(/Choose a card/.test(await hint()), 'reward: an early tap takes nothing [' + (await hint()) + ']');
    t.eq(await s.ev(() => GAME.state.R.deck.length), 10, 'reward: the deck is unchanged');
    await s.tick(2400);
    const late = await s.centre('.rw-cards .card:not(.back)');
    await s.page.mouse.click(late.x, late.y); await s.tick(400);
    t.ok(/joins your deck/.test(await hint()), 'reward: once the cards are flipped a tap takes one [' + (await hint()) + ']');
    clean(s, 'reward');
    await s.close();
  });

  // ================================================================================================ phone
  await t.test('phone: 844x390 landscape reaches Begin by taps; portrait asks to turn the device', async () => {
    const s = await open({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
    await s.tick(900);
    t.eq(await s.screen(), 'title', 'phone: boots to the title');
    t.ok(!(await s.ev(() => { const r = document.getElementById('rotate'); return r && getComputedStyle(r).display !== 'none' && r.getBoundingClientRect().width > 0; })), 'phone: landscape does not show the rotate panel');
    const gate = await s.centre('.mn-gate');
    if (gate) { await s.page.touchscreen.tap(gate.x, gate.y); await s.tick(300); }
    const small = await s.ev(() => { const el = document.querySelector('[data-act=new]'); const r = el.getBoundingClientRect(); return { w: r.width, h: r.height }; });
    t.ok(small.h >= 44 && small.w >= 44, 'phone: the New Tale plaque is at least 44 px on the real screen (' + Math.round(small.w) + 'x' + Math.round(small.h) + ')');
    await s.press('[data-act=new]', null, { touch: true, ms: 1300 });
    t.eq(await s.screen(), 'heroSelect', 'phone: a tap opens the hero select');
    await s.press('.mn-cards button', '^Hanae', { touch: true, ms: 250 });
    await s.press('.mn-cards button', '^Kuro', { touch: true, ms: 250 });
    const begin = await s.ev(() => { const b = document.querySelector('[data-act=begin]'); const r = b.getBoundingClientRect(); return { inView: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth, h: r.height }; });
    t.ok(begin.inView, 'phone: Begin the Tale is fully on the screen');
    t.ok(begin.h >= 44, 'phone: Begin the Tale is tall enough to tap (' + Math.round(begin.h) + ' px)');
    await s.press('[data-act=begin]', '', { touch: true, ms: 800 });
    for (let i = 0; i < 5 && (await s.screen()) === 'story'; i++) await s.press('button', '^skip', { touch: true, ms: 900 });
    for (let i = 0; i < 4 && (await s.screen()) !== 'map'; i++) await s.tick(700);
    t.eq(await s.screen(), 'map', 'phone: taps reached the map');
    clean(s, 'phone');
    await noGameErrors(s, 'phone');
    await s.close();

    const p = await open({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await p.tick(1200);
    const rot = await p.ev(() => { const r = document.getElementById('rotate'); return r ? { shown: getComputedStyle(r).display !== 'none' && r.getBoundingClientRect().width > 0, text: r.textContent.trim().slice(0, 80) } : null; });
    t.ok(rot && rot.shown && /turn your device sideways/i.test(rot.text), 'phone: portrait shows the "Turn your device sideways" panel [' + (rot && rot.text) + ']');
    clean(p, 'phone portrait');
    await p.close();
  });
} catch (e) {
  t.ok(false, 'the browser suite crashed: ' + ((e && e.stack) || e));
} finally {
  clearTimeout(watchdog);
  try { if (browser) await browser.close(); } catch (e) { /* already closed */ }
  console.log('  (' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)');
}
await t.done();
