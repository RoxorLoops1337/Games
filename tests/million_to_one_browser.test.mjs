// Million To One in REAL headless Chromium: boot the title, start a swim, steer with a touch drag,
// clear a zone and pick a mutation card, reach every zone without a page error, end a run and buy a habit.
// MTO_SHOTS=<dir> also saves screenshots there. SKIPPED (exit 0) when playwright or Chromium is missing, unless MTO_BROWSER=1.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url)), REPO = path.join(HERE, '..');
const REQUIRED = process.env.MTO_BROWSER === '1', SHOTS = process.env.MTO_SHOTS || '';
let passed = 0, failed = 0;
const ok = (c, n) => { if (c) passed++; else { failed++; console.error('FAIL: ' + n); } };
const finish = () => { console.log(`million_to_one_browser: ${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0); };
function skip(why) { console.log('million_to_one_browser: SKIPPED, ' + why); if (REQUIRED) { console.log('million_to_one_browser: 0 passed, 1 failed'); process.exit(1); } process.exit(0); }

const req = createRequire(import.meta.url);
let chromium = null;
for (const spec of [path.join(REPO, 'node_modules', 'playwright-core'), 'playwright-core', 'playwright']) { try { chromium = req(spec).chromium; break; } catch (e) { /* next */ } }
if (!chromium) skip('playwright is not installed');
const exe = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

const watchdog = setTimeout(() => { console.error('FAIL: browser suite hung'); process.exit(1); }, 150000);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };
const server = http.createServer((rq, rs) => {
  let p = path.join(REPO, decodeURIComponent(rq.url.split('?')[0]));
  if (p.endsWith('/')) p += 'index.html';
  if (!p.startsWith(REPO) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { rs.writeHead(404); rs.end(); return; }
  rs.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(rs);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const URL = `http://127.0.0.1:${server.address().port}/million_to_one/`;

let browser;
try { browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox', '--disable-dev-shm-usage'] }); } catch (e) { skip('Chromium would not start: ' + e.message); }
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: SHOTS ? 2 : 1, hasTouch: true, isMobile: true });
const page = await ctx.newPage(); const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
// main.js catches a throwing frame (its freeze guard) and logs it with console.error, so those count as page errors too
page.on('console', (m) => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
const shot = async (name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png') }); };

// Arrange: the title screen with a demo race behind it
await page.goto(URL);
await page.waitForFunction(() => window.game && game.race && game.race.demo, null, { timeout: 15000 });
await page.waitForTimeout(800);
ok(await page.isVisible('#playBtn'), 'the title screen shows a SWIM button');
await shot('1_title');

// Act: first swim shows the story, tapping through starts the race
await page.tap('#playBtn'); await page.waitForTimeout(200);
ok(await page.isVisible('#intro'), 'the first swim starts with the story');
for (let i = 0; i < 20 && await page.isVisible('#intro'); i++) { await page.tap('#intro'); await page.waitForTimeout(80); }
await page.waitForTimeout(1500);
ok(await page.evaluate(() => !game.race.demo && document.getElementById('hud').offsetParent !== null), 'the race starts with the HUD showing');
await shot('2_start');
// swim 1 shows one text at a time: a watcher notes any moment the coach strip and the lesson card are both on
await page.evaluate(() => { window.__both = []; const co = document.getElementById('coach'), tu = document.getElementById('tut');
  const chk = () => { if (co.classList.contains('on') && tu.classList.contains('on')) window.__both.push(co.textContent + ' / ' + tu.className); };
  for (const el of [co, tu]) new MutationObserver(chk).observe(el, { attributes: true, attributeFilter: ['class'] }); });

// a touch drag steers the swimmer
const before = await page.evaluate(() => game.race.p.x);
const cdp = await ctx.newCDPSession(page);
const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
await touch('touchStart', 200, 600);
for (let k = 1; k <= 8; k++) { await touch('touchMove', 200 - k * 10, 600); await page.waitForTimeout(30); }
await page.waitForTimeout(250);
const after = await page.evaluate(() => game.race.p.x);
await touch('touchEnd', 120, 600);
ok(after < before - 15, `dragging left steers left (${before.toFixed(0)} -> ${after.toFixed(0)})`);
ok(await page.evaluate(() => game.race.rank < 1000000), 'you are already overtaking');
// a tight rank row (a 7-digit rank plus a long +places tick): the tick never covers the swimmers-alive line or the distance
{ // arrange: the long rank and tick the 8_perk_pop shot showed, the row marked tight the way rankTight() does
  const hit = await page.evaluate(() => {
    const $ = (id) => document.getElementById(id), rr = $('rankRow'), tk = $('rankTick'), rk = $('rank');
    const keep = [rk.textContent, tk.textContent, tk.className, rr.className];
    rk.textContent = '#989,241'; tk.textContent = '+16.8k'; tk.classList.add('on'); rr.classList.add('tight');
    // act: measure in the same task, before the HUD writes again
    const a = tk.getBoundingClientRect(), al = $('alive').getBoundingClientRect(), ds = $('dist').getBoundingClientRect();
    const meet = (b) => b.width > 0 && b.height > 0 && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    rk.textContent = keep[0]; tk.textContent = keep[1]; tk.className = keep[2]; rr.className = keep[3];
    return { alive: meet(al), dist: meet(ds), h: a.height };
  });
  // assert
  ok(hit.h > 0 && !hit.alive && !hit.dist, 'a tight rank row keeps the +places tick off the swimmers-alive line and the distance (' + JSON.stringify(hit) + ')');
}

// swim 1 never teaches cashing in: a watcher records every class #tut gets from here on
await page.evaluate(() => { window.__tutCls = []; new MutationObserver(() => window.__tutCls.push(document.getElementById('tut').className)).observe(document.getElementById('tut'), { attributes: true, attributeFilter: ['class'] }); });

// Act: jump to the end of zone 1 so the mutation cards come up
await page.evaluate(() => { const r = game.race; r.p.y = 8950; r.genY = 9300; r.ents = []; r.p.e = r.p.maxE; });
await page.waitForFunction(() => !document.getElementById('cards').classList.contains('hide'), null, { timeout: 5000 }).catch(() => {});
ok(await page.isVisible('#cards'), 'clearing a zone deals mutation cards');
if (SHOTS) await page.waitForTimeout(800); // let the deal animation land so the shot shows all three cards
await shot('3_cards');
ok(await page.evaluate(() => document.querySelectorAll('#cardRow .card').length === 3), 'three cards are dealt');
await page.tap('#cardRow .card');
await page.waitForTimeout(400);
ok(await page.evaluate(() => Object.keys(game.race.muts).length === 1 && !game.race.pending), 'tapping a card takes it and the swim goes on');
// Assert: through swim 1's lessons so far the coach strip and the lesson card were never on screen together
ok(await page.evaluate(() => window.__both.length === 0), 'swim 1 never shows the coach strip and a lesson card together ' + (await page.evaluate(() => window.__both.slice(0, 2).join(' | '))));

// hit-stop replace: inside the 80 ms window a bigger hit takes over the running hold, a smaller one never does
// Arrange: a 50 ms hold running (holds under 45 ms are zoom punches, not holds)
const hsRes = await page.evaluate(() => { const h = game.hs, p = game.race.p; h.frozen = 0; h.hitStop(50, p.x, p.y, 'pop');
  // Act: a smaller and then a much bigger hit in the same frame
  h.hitStopRL(20, p.x, p.y, 'pop'); const small = h.hold ? h.hold.ms : -1; h.hitStopRL(90, p.x, p.y, 'bump'); return { small, big: h.hold ? h.hold.ms : -1, kind: h.hold ? h.hold.kind : '' }; });
// Assert
ok(hsRes.small === 50 && hsRes.big === 90 && hsRes.kind === 'bump', 'a bigger hit replaces the running hold, a smaller one does not (' + JSON.stringify(hsRes) + ')');
await page.waitForTimeout(300);

// DASH from the resting thumb: the steering thumb lifts on the DASH button and taps it at once: that tap dashes
// Arrange: a full tank, no cooldown, the thumb steering towards the button
const db = await page.evaluate(() => { const r = game.race; r.p.e = r.p.maxE; r.p.dashCd = 0; r.ents = []; const b = document.getElementById('dashBtn').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
await touch('touchStart', db.x - 120, db.y - 40);
for (let k = 1; k <= 4; k++) { await touch('touchMove', db.x - 120 + k * 30, db.y - 40 + k * 10); await page.waitForTimeout(16); }
// Act: lift there, and press and release DASH within the resting window
await touch('touchEnd', db.x, db.y); await touch('touchStart', db.x, db.y); await page.waitForTimeout(60); await touch('touchEnd', db.x, db.y);
await page.waitForTimeout(120);
// Assert
ok(await page.evaluate(() => game.race.p.dashCd > 0 || game.race.p.dashT > 0), 'a DASH tap from the resting steering thumb dashes');

// a hit-stop lets go: after a bonk the impact frame is gone by 0.25 s and the flash by 0.4 s
await page.evaluate(() => { const r = game.race, p = r.p; r.emit('bonk', { x: p.x, y: p.y + 20 }); });
await page.waitForTimeout(250);
ok(await page.evaluate(() => game.R.imp == null), 'the bonk impact frame has released by 0.25 s');
await page.waitForTimeout(150);
ok(await page.evaluate(() => !(game.R._flash > 0.1)), 'and its flash has faded by 0.4 s');
// marks (BEST line, a grave) draw on the track without an error
await page.evaluate(() => { const y = game.race.p.y; game.R.marks = [{ y: y + 260, kind: 'best', label: 'BEST' }, { y: y + 520, kind: 'grave', label: 'Kevin #3' }]; });
await page.waitForTimeout(400);
await shot('4_marks');
ok(errs.length === 0, 'BEST and grave marks draw without page errors ' + errs.join(' | '));

// the egg duel panel's rival line never names its speaker twice ('Gunther: Gunther: ...')
await page.evaluate(() => { window.__epBad = []; const ep = document.querySelector('#drillUI .ep'); if (ep) new MutationObserver(() => { const t = ep.textContent || ''; if (/^([^:]{1,20}): \1:/.test(t)) window.__epBad.push(t); }).observe(ep, { childList: true, characterData: true, subtree: true }); });
// every zone draws without errors (keep the swimmer alive while we skip around)
const ZY = [4000, 16000, 30000, 46000, 61500, 70000, 82500];
for (const y of ZY) {
  await page.evaluate((y) => { const r = game.race; if (r.pending) r.choose(r.pending[0]); document.getElementById('cards').classList.add('hide'); document.body.classList.remove('cardsUp'); r.p.y = y; r.genY = y + 300; r.ents = r.ents.filter((e) => e.y > y); r.p.e = r.p.maxE; r.p.shield = 9; if (y > 60000 && !r.p.side) r.p.side = r.eggSide; r.p.x = (y > 59400 ? (r.eggSide < 0 ? 150 : 250) : 200); }, y);
  await page.waitForTimeout(1600);
  await page.evaluate(() => { const r = game.race; if (r.pending) { r.choose(r.pending[0]); document.getElementById('cards').classList.add('hide'); } document.body.classList.remove('cardsUp'); r.p.e = r.p.maxE; });
  await page.waitForTimeout(600);
  await page.evaluate(() => document.getElementById('banner').classList.remove('on')); // the shot shows the zone, not a banner
  await shot('4_zone_' + y);
}
ok(errs.length === 0, 'no page errors across all zones ' + errs.join(' | '));
// Act: at the egg, a rival winds up a move (its tell line already names the speaker)
// (the swim from the last hop to the egg takes a variable time: wait for the duel panel itself, capped, not a fixed delay;
// the tank is kept full meanwhile so the wait never ends on GAS)
await page.waitForFunction(() => { const r = game.race; if (r && !r.over && !r.drill) r.p.e = r.p.maxE; return !document.getElementById('drillUI').classList.contains('hide') || !!(r && r.over); }, null, { timeout: 15000, polling: 100 }).catch(() => {});
const drillOn = await page.evaluate(() => !document.getElementById('drillUI').classList.contains('hide'));
if (drillOn) {
  // (a tell at the egg goes to Gunther's own duel bubble via R.duelSay, one bubble per rival; the bark already drops the
  // speaker prefix, so the bubble text never starts with 'Gunther:' and never names him twice)
  // (the duel bubbles belong to the drill itself: before it starts, in the claim beat, lines use the plain bubble)
  await page.waitForFunction(() => !!game.race.drill && !game.race.over, null, { timeout: 8000 }).catch(() => {});
  await page.evaluate(() => { window.__ds = []; const R = game.R, orig = R.duelSay.bind(R); R.duelSay = (k, t, d) => { window.__ds.push([k, String(t)]); return orig(k, t, d); }; game.race.emit('rivalMove', { phase: 'tell', k: 3, move: 'test' }); });
  await page.waitForTimeout(150);
  const ds = await page.evaluate(() => window.__ds.filter((e) => e[0] === 3));
  const dsT = ds.length ? ds[0][1] : '';
  ok(ds.length >= 1 && dsT.length > 0 && !/^Gunther\s*:/.test(dsT), 'a tell at the egg puts Gunther\'s line in his duel bubble, speaker not repeated ("' + dsT + '")');
  ok(await page.evaluate(() => game.R.duelBub && game.R.duelBub.size >= 1 && [...game.R.duelBub.values()].length <= 5), 'duel bubbles hold at most one per rival');
}
ok(drillOn, 'the last zone hop lands at the egg duel');
ok(await page.evaluate(() => window.__epBad.length === 0), 'the egg panel never doubles a speaker name ' + (await page.evaluate(() => window.__epBad.join(' | '))));
ok(await page.evaluate(() => !window.__tutCls.some((c) => /\bstep-cash\b/.test(c))), 'swim 1 never shows the cash lesson');


// Act: give up, see the result, buy a habit
await page.evaluate(() => { const r = game.race; r.over = null; if (typeof r.remaining === 'function') { r.p.y += r.remaining(); } r.end('energy'); });
await page.waitForFunction(() => !document.getElementById('result').classList.contains('hide'), null, { timeout: 5000 }).catch(() => {});
ok(await page.isVisible('#result'), 'the end of a swim shows the result');
if (SHOTS) await page.waitForTimeout(3200); // let the rank fall and the DNA receipt count up
await shot('5_result');
// Assert: an energy death right at the egg never reads "0.0 cm from the egg" (it says Kevin was at the egg)
const resTipT = await page.evaluate(() => (document.getElementById('resTip') || {}).textContent || '');
ok(!/(^|[^\d.])0\.0 cm/.test(resTipT), 'a GAS death at the egg never says 0.0 cm ("' + resTipT + '")');
ok(!/(^|[^\d.])0\.0+ cm/.test(await page.evaluate(() => (document.querySelector('#resEgg span') || {}).textContent || '')), 'the egg bar never says Kevin was 0.00 cm short of the egg');
ok(!/DASH/.test(await page.evaluate(() => (document.getElementById('resWhy') || {}).textContent || '')), 'a GAS death at the egg never blames DASH');
// Assert: the egg-bar caption fits one phone line, and the retry button is in the first viewport
const cap = await page.evaluate(() => { const sp = document.querySelector('#resEgg span'); const c = sp.cloneNode(true); c.querySelectorAll('i').forEach((i) => i.remove()); return c.textContent.trim(); });
const capMax = /^[\d.]+ cm short/.test(cap) ? 34 : 48; // the plain gap line 34, a SHORT_BY joke 48 (its writer limit)
ok(cap.length <= capMax, `the egg caption is ${capMax} characters or fewer ("${cap}")`);
ok(await page.evaluate(() => { const b = document.getElementById('againBtn').getBoundingClientRect(); return b.height > 0 && b.top >= 0 && b.bottom <= innerHeight; }), 'SWIM AGAIN sits inside the first viewport');
const dna = await page.evaluate(() => game.meta.dna);
ok(dna > 0, 'the swim paid DNA (' + dna + ')');
await page.evaluate(() => { game.meta.dna += 500; });
await page.tap((await page.isVisible('#resSeeAll')) ? '#resSeeAll' : '#resShopBtn'); await page.waitForTimeout(200);
await shot('6_shop');
// Assert: the shop marks where a habit unlocks a perk (content.js HABIT_PERKS: broccoli at 5) and names the next one
const brocRow = await page.evaluate(() => { const r = document.querySelector('#shopList [data-row="broccoli"]'); return r ? { pk: r.querySelectorAll('.pips i.pk').length, np: (r.querySelector('.np') || {}).textContent || '' } : null; });
ok(brocRow && brocRow.pk >= 1, 'the broccoli row marks its perk levels with gold pips (' + JSON.stringify(brocRow) + ')');
ok(brocRow && /^NEXT PERK: /.test(brocRow.np) && !/a perk/.test(brocRow.np), 'and names its next perk ("' + (brocRow && brocRow.np) + '")');
await page.tap('#shopList button[data-id="broccoli"]'); await page.waitForTimeout(150);
ok(await page.evaluate(() => game.meta.habits.broccoli === 1), 'buying Dad eats broccoli works');
ok(await page.evaluate(() => JSON.parse(localStorage.getItem('million_to_one_v1')).habits.broccoli === 1), 'and it is saved');
ok(errs.length === 0, 'no page errors at all ' + errs.join(' | '));

// Regression (the old win frame threw on an undefined fling factor): a win at the egg with rivals arrived draws for 1.6 s
// Arrange: a fresh swim put straight into the duel, two named rivals at the egg
await page.evaluate(() => { document.getElementById('shop').classList.add('hide'); });
const winErrs = errs.length;
const winSet = await page.evaluate(() => {
  const r = game.race; if (!r || r.demo) return 'no race';
  if (!r.drill && typeof r.startDrill === 'function') { try { r.startDrill(); } catch (e) { return 'startDrill threw: ' + e.message; } }
  if (!r.drill) return 'no drill';
  let n = 0; for (const a of r.agents) if (a.boss && n < 2) { a.alive = true; if (!a.arrived) r.arrive(a); n++; }
  r.over = { reason: 'win' }; return n === 2 ? 'ok' : 'rivals: ' + n;
});
// Act: let the renderer draw the win for 1.6 s
await page.waitForTimeout(1600);
// Assert
ok(winSet === 'ok' && await page.evaluate(() => game.R.duel.size >= 2), 'the forced win has two rivals in the duel (' + winSet + ')');
ok(errs.length === winErrs, 'a forced win at the egg draws 1.6 s without a page error (' + winSet + ') ' + errs.slice(winErrs).join(' | '));

// ------------------------------------------------------------------ a returning player: the welcome card, then a daily swim
// Arrange: a save that last played 9 hours ago with a factory, swim 6, the lessons done (written before the page boots)
await page.close();
const p2 = await ctx.newPage(); p2.on('pageerror', (e) => errs.push(e.message));
p2.on('console', (m) => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
await p2.addInitScript(() => {
  if (sessionStorage.getItem('mtoArranged')) return; sessionStorage.setItem('mtoArranged', '1');
  const m = JSON.parse(localStorage.getItem('million_to_one_v1') || '{}');
  Object.assign(m, { runs: 6, normRuns: 6, introSeen: true, lastSeen: Date.now() - 9 * 3600000, bank: 0 }); m.habits = Object.assign({}, m.habits, { factory: 1 });
  localStorage.setItem('million_to_one_v1', JSON.stringify(m));
  const u = JSON.parse(localStorage.getItem('million_to_one_ui') || '{}'); u.tutDone = true; u.bestHead = 2.8; localStorage.setItem('million_to_one_ui', JSON.stringify(u));
});
const errs2 = errs.length;
// Act
await p2.goto(URL);
await p2.waitForFunction(() => window.game && game.race && game.race.demo, null, { timeout: 15000 });
await p2.waitForTimeout(400);
// Assert
ok(await p2.isVisible('#welcome'), 'coming back after 9 hours shows the welcome card');
const shot2 = async (name) => { if (SHOTS) await p2.screenshot({ path: path.join(SHOTS, name + '.png') }); };
await shot2('7_welcome');
await p2.tap('#wbClose'); await p2.waitForTimeout(200);
// Arrange: today's daily already swum once, so this is attempt 2
await p2.evaluate(async () => { const C = await import('./core.js'); const m = game.meta; m.dailyDay = C.dailySeed(); m.dailyRuns = 1; m.dailyLastDay = C.dailySeed(); m.dailyStreak = Math.max(1, m.dailyStreak | 0); m.streakFreeze = 1; });
await p2.tap('#dailyBtn'); await p2.waitForTimeout(500);
ok(await p2.evaluate(() => !!game.race && !game.race.demo && game.race.daily != null), 'the Daily button starts a daily swim');
// Act: a habit perk fires mid-swim (its pop), then straight to the egg with a FRENZY tier and a combo behind him
await p2.evaluate(async () => { const K = await import('./content.js'); const r = game.race, p = r.p; const P = Array.isArray(K.HABIT_PERKS) ? K.HABIT_PERKS[0] : null; if (P) r.emit('habitPerk', { id: P.id, perk: P.perk, x: p.x, y: p.y }); });
await p2.waitForTimeout(300); await shot2('8_perk_pop');
await p2.evaluate(() => { const r = game.race, p = r.p; if (r.pending) r.choose(r.pending[0]); document.getElementById('cards').classList.add('hide'); p.bestTier = 2; p.bestCombo = 40; p.y = 82500; r.genY = p.y + 300; r.ents = []; p.e = p.maxE; p.shield = 9; p.side = r.eggSide; p.x = r.eggSide < 0 ? 150 : 250; });
await p2.waitForFunction(() => !!game.race.drill, null, { timeout: 8000 }).catch(() => {});
await p2.waitForTimeout(900); await shot2('9_head_ledger');
ok(await p2.evaluate(() => !!game.race.drill), 'the daily swim reaches the egg drill');
// Act: a rival takes the egg (a lost duel)
await p2.evaluate(() => { const r = game.race; if (r.pending) r.choose(r.pending[0]); r.end('late'); });
await p2.waitForFunction(() => !document.getElementById('result').classList.contains('hide'), null, { timeout: 8000 }).catch(() => {});
if (SHOTS) await p2.waitForTimeout(2500);
await shot2('10_duel_result');
// Assert: a tight loss card's one-row Dad's Pick keeps every visible line inside its 56 px row
const tightRow = await p2.evaluate(() => { const res = document.getElementById('result'), up = document.getElementById('resUp'); if (!res.classList.contains('tightUp') || !up) return { on: false, out: [] }; const b = up.getBoundingClientRect(); const out = [...up.querySelectorAll('.tx > *')].filter((e) => e.getClientRects().length).map((e) => [e.className || e.tagName, e.getBoundingClientRect()]).filter(([, r]) => r.top < b.top - 1 || r.bottom > b.bottom + 1).map(([n, r]) => n + ' ' + Math.round(r.top - b.top) + '..' + Math.round(r.bottom - b.top)); return { on: true, h: Math.round(b.height), out }; });
ok(tightRow.out.length === 0, 'the tight-loss Dad\'s Pick row fits its lines ' + JSON.stringify(tightRow));
// Assert: the chip row carries the head start (and the best one when this fell short of it) and the attempt's pay
const chipT = await p2.evaluate(() => (document.getElementById('resChips') || {}).textContent || '');
const headNow = await p2.evaluate(() => { const d = game.race && game.race.drill; return d && Number.isFinite(+d.head) ? +d.head : null; });
ok(/Head start \+\d+\.\ds/.test(chipT), 'a lost duel puts its head start on the chip row ("' + chipT + '")');
ok(headNow == null || headNow >= 2.75 || /Best 2\.8s/.test(chipT), 'and the best head start when this one fell short (now ' + headNow + ', "' + chipT + '")');
ok(/Attempt 2 · [^·]*pay/.test(chipT), 'the daily result says what this attempt pays on the chip row ("' + chipT + '")');
// Assert: the result card shows one stamp at most (record, bounty, medal, grudge); the rest become toasts
const stamps = await p2.evaluate(() => ['resRecord', 'resBounty', 'resMedal', 'resGrudge'].filter((id) => { const e = document.getElementById(id); return e && !e.classList.contains('hide') && e.getClientRects().length > 0; }));
ok(stamps.length <= 1, 'the result card shows at most one stamp (' + stamps.join() + ')');
// Arrange / Act: the no-flash setting
const nf = await p2.evaluate(() => { const b = document.getElementById('setNoFlash'), was = b.checked; b.checked = true; b.dispatchEvent(new Event('change')); const on = document.body.classList.contains('noFlash'); b.checked = false; b.dispatchEvent(new Event('change')); const off = !document.body.classList.contains('noFlash'); b.checked = was; b.dispatchEvent(new Event('change')); return { on, off }; });
// Assert
ok(nf.on && nf.off, 'the no-flash setting toggles body.noFlash ' + JSON.stringify(nf));
ok(errs.length === errs2, 'the returning player pass runs without page errors ' + errs.slice(errs2).join(' | '));


// ---- round 2: the deal survives the tab hiding, a palm never dashes, a held freeze keeps the streak saveable ----
// Arrange: a returning player (tutorial done) on a fresh page
const ctx3 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
const p3 = await ctx3.newPage(); const errs3 = [];
p3.on('pageerror', (e) => errs3.push(e.message));
p3.on('console', (m) => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errs3.push('console: ' + m.text()); });
await p3.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
await p3.goto(URL);
await p3.waitForFunction(() => window.game && game.race && game.race.demo, null, { timeout: 15000 });
await p3.evaluate(() => { const u = JSON.parse(localStorage.getItem('million_to_one_ui') || '{}'); u.tutDone = true; localStorage.setItem('million_to_one_ui', JSON.stringify(u)); const m = JSON.parse(localStorage.getItem('million_to_one_v1') || '{}'); Object.assign(m, { runs: 5, introSeen: true }); localStorage.setItem('million_to_one_v1', JSON.stringify(m)); });
await p3.reload(); await p3.waitForFunction(() => window.game && game.race && game.race.demo, null, { timeout: 15000 });
await p3.tap('#playBtn'); await p3.waitForFunction(() => game.race && !game.race.demo && game.race.t > 1, null, { timeout: 15000 });
await p3.evaluate(() => { const r = game.race; r.p.y = 8950; r.genY = 9300; r.ents = []; r.p.e = r.p.maxE; });
await p3.waitForFunction(() => !document.getElementById('cards').classList.contains('hide'), null, { timeout: 5000 }).catch(() => {});
// Act: the tab hides while the cards are up
const setHidden = (h) => p3.evaluate((h) => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => h }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') }); document.dispatchEvent(new Event('visibilitychange')); }, h);
await setHidden(true);
const openPaused = () => p3.evaluate(() => { const m = JSON.parse(localStorage.getItem('million_to_one_v1') || '{}'); return !!(m.openRun && m.openRun.paused); });
// Assert
ok(await openPaused() === true, 'hiding the tab on a deal saves the open swim as paused');
await setHidden(false);
ok(await openPaused() === true, 'coming back to the tab keeps the paused mark while the deal is still up');
await p3.waitForTimeout(900);
await p3.tap('#cardRow .card'); await p3.waitForTimeout(500);
ok(await openPaused() === false, 'picking a card clears the paused mark');
// Arrange: count every time the dash input goes on
const cdp3 = await ctx3.newCDPSession(p3);
const tp3 = (type, pts) => cdp3.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
await p3.evaluate(() => { const r = game.race; r.p.e = r.p.maxE; r.p.dashCd = 0; r.ents = []; window.__d = 0; let v = r.input.dash; Object.defineProperty(r.input, 'dash', { configurable: true, get: () => v, set: (x) => { if (x) window.__d++; v = x; } }); });
const PALM = { x: 60, y: 700, radiusX: 40, radiusY: 40, id: 1 }, FB = (x) => ({ x, y: 600, id: 2 });
// Act: a palm rests (A), a finger drags (B), lifts, re-touches and drags back
await tp3('touchStart', [PALM]); await p3.waitForTimeout(50);
await tp3('touchStart', [PALM, FB(200)]); for (let k = 1; k <= 6; k++) { await tp3('touchMove', [PALM, FB(200 + k * 10)]); await p3.waitForTimeout(20); }
await tp3('touchEnd', [PALM]); await p3.waitForTimeout(80);
await tp3('touchStart', [PALM, FB(250)]); for (let k = 1; k <= 6; k++) { await tp3('touchMove', [PALM, FB(250 - k * 15)]); await p3.waitForTimeout(20); }
const palm = await p3.evaluate(() => ({ d: window.__d, tx: game.race.input.tx }));
await tp3('touchEnd', []);
// Assert
ok(palm.d === 0, 'a resting palm plus a dragging finger never dashes (' + JSON.stringify(palm) + ')');
// Arrange: a 4-day streak, the daily last swum 2 days ago, one freeze held
await p3.evaluate(async () => { const C = await import('./core.js'); const m = game.meta, t = C.dailySeed(); m.dailyStreak = 4; m.dailyLastDay = t - 2; m.dailyLastAt = Date.now() - 50 * 3600000; m.dailyDay = t - 2; m.streakFreeze = 1; m.runs = 5; localStorage.setItem('million_to_one_v1', JSON.stringify(m)); });
// Act
await p3.reload(); await p3.waitForFunction(() => window.game && game.race && game.race.demo, null, { timeout: 15000 }); await p3.waitForTimeout(400);
const frz = await p3.evaluate(() => ({ t: document.getElementById('dailyBtn').textContent, p: document.getElementById('dailyBtn').classList.contains('pulse'), lost: game.settings.streakLostDay, ice: !!document.querySelector('#dailyBtn .dfrz.save') }));
// Assert
ok(frz.p && frz.lost === -1 && frz.ice && /4-day/.test(frz.t) && !/\{n\}/.test(frz.t), 'a 2-day gap with a freeze held stays saveable on the title ' + JSON.stringify(frz));
if (SHOTS) await p3.screenshot({ path: path.join(SHOTS, '11_title_freeze.png') });
ok(errs3.length === 0, 'the round 2 pass runs without page errors ' + errs3.join(' | '));
await ctx3.close();

// ---- round 3: seeded saves (Act 2's loss clue, Act 3's opening) and the phone layout loop ----
// Arrange: a generation-10 save, 20 swims, Act 2 begun 10 swims ago, Coach's clues all heard
{
  const ctx4 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  const p4 = await ctx4.newPage(); const errs4 = [];
  p4.on('pageerror', (e) => errs4.push(e.message));
  await p4.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await p4.addInitScript(() => {
    if (sessionStorage.getItem('mto4')) return; sessionStorage.setItem('mto4', '1');
    localStorage.setItem('million_to_one_v1', JSON.stringify({ runs: 20, introSeen: true, gen: 10, wins: 10 }));
    localStorage.setItem('million_to_one_ui', JSON.stringify({ tutDone: true, finaleSeen: true, genIntroSeen: 10, revealSeen: true, act2From: 10, clues: [3, 8, 15, 20, 25, 40, 50, 60, 90] }));
  });
  await p4.goto(URL); await p4.waitForFunction(() => window.game && game.race && game.race.demo, null, { timeout: 15000 });
  // Act: a swim that ends in a loss
  await p4.evaluate(() => { const w = document.getElementById('welcome'); if (w) w.classList.add('hide'); });
  await p4.tap('#playBtn'); await p4.waitForFunction(() => game.race && !game.race.demo && game.race.t > 0.5, null, { timeout: 15000 });
  await p4.evaluate(() => { const r = game.race; r.p.y = 20000; r.end('energy'); });
  await p4.waitForFunction(() => !document.getElementById('result').classList.contains('hide'), null, { timeout: 8000 }).catch(() => {});
  // Assert: the saga slot carries an Act 2 loss clue
  const nextT = await p4.evaluate(() => document.getElementById('resNext').textContent || '');
  const a2 = await p4.evaluate(async () => { const K = await import('./content.js'); return (K.ACT2_LOSS_CLUES || []).map((x) => x[1]); });
  ok(a2.some((l) => nextT.includes(l)), 'a generation-10 loss shows an Act 2 loss clue ("' + nextT + '")');
  ok(errs4.length === 0, 'the seeded Act 2 save runs without page errors ' + errs4.join(' | '));
  await ctx4.close();
}
// Arrange/Act: an Act 3 save (generation 20 next) starts a swim: the story plays GEN20_INTRO
{
  const ctx5 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  const p5 = await ctx5.newPage();
  await p5.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await p5.addInitScript(() => {
    if (sessionStorage.getItem('mto5')) return; sessionStorage.setItem('mto5', '1');
    localStorage.setItem('million_to_one_v1', JSON.stringify({ runs: 40, introSeen: true, gen: 19, wins: 19, babies: Array.from({ length: 19 }, (_, i) => ({ name: 'Kev ' + (i + 1), run: i + 1 })) }));
    localStorage.setItem('million_to_one_ui', JSON.stringify({ tutDone: true, finaleSeen: true, act2Seen: true, genIntroSeen: 18, revealSeen: true }));
  });
  await p5.goto(URL); await p5.waitForFunction(() => window.game && game.race && game.race.demo, null, { timeout: 15000 });
  await p5.evaluate(() => { const w = document.getElementById('welcome'); if (w) w.classList.add('hide'); });
  await p5.tap('#playBtn'); await p5.waitForTimeout(300);
  const seen = []; for (let i = 0; i < 14 && await p5.isVisible('#intro'); i++) { seen.push(await p5.evaluate(() => document.getElementById('introTxt').textContent)); await p5.tap('#intro'); await p5.waitForTimeout(120); }
  const g20 = await p5.evaluate(async () => { const K = await import('./content.js'); return K.GEN20_INTRO || []; });
  // Assert
  ok(!g20.length || seen.some((t) => g20.includes(t)), 'generation 20 opens Act 3 with its intro (' + seen.slice(0, 6).join(' / ') + ')');
  await ctx5.close();
}
// The layout loop: four small phones (portrait and landscape), DPR 1
for (const [w, h] of [[360, 640], [320, 568], [640, 360], [568, 320]]) {
  const cx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  const pg = await cx.newPage();
  await pg.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await pg.addInitScript(() => { if (sessionStorage.getItem('mtoL')) return; sessionStorage.setItem('mtoL', '1');
    localStorage.setItem('million_to_one_v1', JSON.stringify({ runs: 6, introSeen: true })); localStorage.setItem('million_to_one_ui', JSON.stringify({ tutDone: true, revealSeen: true })); });
  await pg.goto(URL); await pg.waitForFunction(() => window.game && game.race && game.race.demo, null, { timeout: 15000 });
  await pg.evaluate(() => { const wl = document.getElementById('welcome'); if (wl) wl.classList.add('hide'); });
  await pg.waitForTimeout(300);
  // Assert: every visible title button is 44 px (or padded to it by a ::before) and on screen; SWIM needs no scroll
  const tb = await pg.evaluate(() => { const bad = []; for (const b of document.querySelectorAll('#title button, #title .toggle:not(.hide)')) { const r = b.getBoundingClientRect(); if (!r.width || getComputedStyle(b).visibility === 'hidden') continue;
    const pad = getComputedStyle(b, '::before'); const ph = pad && pad.content !== 'none' ? parseFloat(pad.height) || 0 : 0;
    if (Math.max(r.height, ph) < 43.5 || r.left < -1 || r.right > innerWidth + 1 || r.top < -1 || r.bottom > innerHeight + 1) bad.push((b.id || b.className) + ' ' + Math.round(r.height) + '@' + Math.round(r.top)); } return bad; });
  ok(tb.length === 0, `${w}x${h}: title buttons are 44 px and on screen (${tb.join(', ')})`);
  // Act: a swim with a combo and a banner up
  await pg.tap('#playBtn'); await pg.waitForFunction(() => game.race && !game.race.demo && game.race.t > 1, null, { timeout: 15000 });
  await pg.evaluate(() => { const r = game.race; r.p.combo = 12; r.p.comboT = 5; });
  await pg.waitForTimeout(500);
  // Assert: DASH never sits on the combo strip, the lesson card or the drill panel; the banner title never overflows;
  // the coach strip is 2 lines at most
  const lay = await pg.evaluate(() => {
    const vis = (id) => { const e = document.getElementById(id); if (!e) return null; const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05 || e.classList.contains('hide')) return null; const r = e.getBoundingClientRect(); return r.width ? r : null; };
    const inner = (sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return r.width ? r : null; };
    const hit = (a, b) => !!a && !!b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const d = vis('dashBtn'), co = vis('combo') ? inner('#combo .in') : null, tu = vis('tut'), dr = vis('drillUI');
    const bt = document.querySelector('#banner .t'), c = document.getElementById('coach');
    const lh = parseFloat(getComputedStyle(c).lineHeight) || 16;
    return { dashCombo: hit(d, co), dashTut: hit(d, tu), dashDrill: hit(d, dr), tutCombo: hit(tu, co), banner: !bt || bt.scrollWidth <= bt.clientWidth + 1, coach: c.offsetHeight <= 2 * lh + 14,
      dashIn: !!d && d.left >= 0 && d.right <= innerWidth && d.bottom <= innerHeight };
  });
  ok(!lay.dashCombo && !lay.dashTut && !lay.dashDrill && !lay.tutCombo && lay.banner && lay.coach && lay.dashIn, `${w}x${h}: the race HUD keeps DASH, the combo, the card and the banner apart ${JSON.stringify(lay)}`);
  await cx.close();
}

// round 1 render hooks: the flash safety cap, one duel bubble per rival, the 'think' pop style
{
  // arrange
  const pg = await ctx.newPage(); pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto(URL); await pg.waitForFunction(() => window.game && game.R, null, { timeout: 15000 });
  // act
  const rf = await pg.evaluate(() => {
    const R = game.R, t0 = (R.time || 0) + 100; let acc = 0;
    if (R._flashOn) R._flashOn.fill(-9);
    for (let i = 0; i < 5; i++) { R.time = t0 + i * 0.1; R.lastFlashT = -9; R._flash = 0; R.flash = 1; if (!R.flashRej) acc++; }
    const cnt = R.flashCount();
    const a = game.race && game.race.agents ? game.race.agents.filter((q) => q && q !== game.race.p) : [];
    const k1 = a[0] || 0, k2 = a[1] || 1;
    if (R.duelBub) R.duelBub.clear();
    R.duelSay(k1, 'one'); R.duelSay(k1, 'two'); const same = R.duelBub.size;
    R.duelSay(k2, 'three'); const diff = R.duelBub.size; R.duelBub.clear();
    R.pop(200, 200, 'hmm', '#fff4f8', 13, 1.6, 'think');
    const pops = R.pops || R.popups || []; const last = pops[pops.length - 1];
    return { acc, cnt, same, diff, think: !!(last && last.think) };
  });
  // assert
  ok(rf.acc === 3 && rf.cnt === 3, 'the flash cap lets 3 flashes start in 1 s and refuses the rest, even with lastFlashT reset ' + JSON.stringify(rf));
  ok(rf.same === 1 && rf.diff === 2, 'duelSay keeps one bubble per rival ' + JSON.stringify(rf));
  ok(rf.think, "a 'think' pop is flagged think");
  await pg.close();
}

// round 2 hooks: Act 4 plays in the live story with no raw placeholders, the wall hit and the photo finish
{
  // arrange
  const pg = await ctx.newPage(); pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto(URL); await pg.waitForFunction(() => window.game && game.R, null, { timeout: 15000 });
  // act
  const st = await pg.evaluate(() => {
    const m = game.meta, g0 = m.gen, S = game.settings, seen = S.act4Seen, gis = S.genIntroSeen, b0 = m.babies;
    m.babies = (b0 || []).concat([{ name: 'Kevin Jr', run: 0 }]); S.genIntroSeen = 0;
    const at = (g) => { m.gen = g - 1; return game.story(); };
    const g31 = at(31), g39 = at(39), g41 = at(41), g30 = at(30);
    m.gen = g0; S.act4Seen = seen; S.genIntroSeen = gis; m.babies = b0;
    const raw = [g30, g31, g39, g41].flat().filter((t) => /\{\w+\}/.test(t));
    return { g31: g31.join(' | '), g39n: g39.length, g41: g41.join(' | '), g30: g30.join(' | '), raw };
  });
  // (R.wallHit needs a live race with Kevin: under CPU load the page can still be setting it up, so wait for it)
  await pg.waitForFunction(() => game.R && game.R.race && game.R.race.p && game.race, null, { timeout: 15000 }).catch(() => {});
  const rh = await pg.evaluate(() => {
    const R = game.R; R.wallHit(-1, 0.9); const wt = R.wHit ? R.wHit.t : -1;
    const r = game.race; R.photoFinish(r, r.p, 'Brock', 0.23); return { wt, pf: R.pf ? R.pf.txt : null };
  });
  // assert
  ok(st.g31.includes('The Kevins listen to the Macros'), 'generation 31 plays Act 4 chapter 1 (' + st.g31.slice(0, 120) + ')');
  ok(st.g39n >= 6, 'generation 39 plays the Act 4 finale (' + st.g39n + ' lines)');
  ok(st.raw.length === 0, 'no story line shows a raw {placeholder} ' + JSON.stringify(st.raw));
  ok(Math.abs(rh.wt - 0.18) < 1e-6 && rh.pf === '0.23s', 'R.wallHit opens its 0.18 s hit and R.photoFinish labels the margin ' + JSON.stringify(rh));
  await pg.close();
}

await browser.close(); server.close(); clearTimeout(watchdog);
finish();
