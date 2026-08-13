/* ============================================================================
   playthrough.mjs — play ONE run, and write down what it felt like.

     node tools/frostfell/playthrough.mjs

   The probe measures the game across hundreds of runs and prints numbers. This
   does the opposite: one run, start to finish, in a real browser, taking a note
   at every decision and a screenshot at every beat that matters — what the
   trail offered, what the reward screen showed, what the trader had, what the
   caravan was short of, how many seals were still alive.

   It exists because after seventeen rounds of tuning against a probe, the thing
   nobody had was a transcript. A number tells you a rung is worth nine points;
   only a transcript tells you the run had nothing to spend scrip on for four
   steps running.
   ========================================================================== */
import { chromium } from 'playwright-core';
import { mkdirSync, existsSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const GAME = join(REPO, 'frostfell', 'index.html');
const OUT = '/tmp/ff-play';

function findChromium() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (!existsSync(root)) return undefined;
  for (const d of readdirSync(root).filter((x) => x.startsWith('chromium') && !x.includes('headless_shell')).sort().reverse()) {
    for (const rel of ['chrome-linux/chrome', 'chrome-linux/headless_shell']) {
      const p = join(root, d, rel);
      if (existsSync(p)) return p;
    }
  }
  return undefined;
}
const settle = (page, n = 24) => page.evaluate((k) => new Promise((res) => {
  let i = 0; const step = () => (++i >= k ? res() : requestAnimationFrame(step)); requestAnimationFrame(step);
}), n);

const notes = [];
const note = (s) => { notes.push(s); console.log('  · ' + s); };

(async () => {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: findChromium(), args: ['--no-sandbox', '--mute-audio'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => note('!! page error: ' + e.message));
  await page.goto(pathToFileURL(GAME).href);
  await page.waitForFunction(() => !!window.FF);
  await page.click('#bootgo');
  await settle(page, 30);

  // choose Frostborn, declare the Deep Cold, no winter — a normal first choice
  await page.evaluate(() => { window.FF.press('tribe', 'frost'); });
  await settle(page, 12);
  await page.evaluate(() => { window.FF.press('courseToggle', 'frost'); window.FF.press('startRun'); });
  await settle(page, 20);

  let shot = 0;
  const snap = async (tag) => {
    await settle(page, 8);
    await page.screenshot({ path: join(OUT, String(shot++).padStart(2, '0') + '-' + tag + '.png') });
  };

  for (let step = 0; step < 220; step++) {
    const st = await page.evaluate(() => {
      const FF = window.FF, G = FF.G;
      return { screen: G.screen, zone: G.run ? G.run.zone : -1, step: G.run ? G.run.step : -1,
        deck: G.run ? G.run.deck.length : 0, gold: G.run ? G.run.gold : 0,
        turn: G.battle ? G.battle.turn : -1, over: G.battle ? G.battle.over : true };
    });
    if (st.screen === 'victory' || st.screen === 'gameover') { await snap(st.screen); note('the run ends: ' + st.screen); break; }

    if (st.screen === 'trail') {
      const info = await page.evaluate(() => {
        const FF = window.FF, G = FF.G;
        const nodes = G.run.trail[G.run.step] || [];
        const need = FF.caravanNeeds(G.run);
        const live = FF.liveFeats(G.run).map((f) => f.name);
        return { kinds: nodes.map((n) => n.kind), need: need ? need.name : null, live, zone: G.run.zone, step: G.run.step };
      });
      // a human picks: a trader when short of scrip-worthy strength, a fight otherwise
      const want = ['shop', 'camp', 'rest', 'shrine', 'cache', 'event'];
      let pick = info.kinds.findIndex((k) => want.indexOf(k) >= 0);
      if (pick < 0) pick = 0;
      note(`zone ${info.zone + 1} step ${info.step + 1}: ${info.kinds.join('/')} → took ${info.kinds[pick]}` +
        (info.need ? ` (short of ${info.need.toLowerCase()})` : ' (wants nothing)') +
        ` · ${info.live.length} seals alive`);
      if (info.step === 0 && info.zone === 0) await snap('trail-first');
      await page.evaluate((i) => window.FF.press('node', i), pick);
      await settle(page, 16);
      continue;
    }

    if (st.screen === 'battle') {
      if (st.over) { await page.evaluate(() => window.FF.drainAll()); await settle(page, 8); continue; }
      const acted = await page.evaluate(() => {
        const FF = window.FF, G = FF.G, b = G.battle;
        // deny anything that has committed to a lunge, for free
        for (const f of FF.enemyUnits(G)) {
          const p = f.plot;
          if (p && p.id === 'mark') {
            const t = FF.playerUnits(G).find((x) => x.uid === p.uid);
            if (t && t.lane === p.lane && t.col === p.col) {
              const spot = FF.freeSlots(G, 'p')[0];
              if (spot) FF.moveUnit(G, t, spot.lane, spot.col);
            }
          }
        }
        // gear that kills, then a body, then gear, then pass
        for (let i = 0; i < b.hand.length; i++) {
          const c = b.hand[i];
          if (c.type !== 'item') continue;
          for (const f of FF.enemyUnits(G)) {
            const pre = FF.previewOf(G, c, f);
            if (pre.some((x) => x.dmg >= x.u.hp) && FF.canPlay(G, c, f)) { FF.playCard(G, i, f); return 'gear kills ' + f.name; }
          }
        }
        const ui = b.hand.findIndex((c) => c.type === 'unit');
        if (ui >= 0) {
          for (let col = 0; col < FF.COLS; col++) for (let lane = 0; lane < FF.LANES; lane++) {
            if (FF.slotFree(G, 'p', lane, col) && FF.freeSlots(G, 'p').length > 1) {
              const n = b.hand[ui].name;
              if (FF.playCard(G, ui, { lane, col })) return 'set down ' + n;
            }
          }
        }
        for (let i = 0; i < b.hand.length; i++) {
          const c = b.hand[i];
          if (c.type !== 'item') continue;
          const t = FF.enemyUnits(G).sort((a, z) => a.cnt - z.cnt)[0] || null;
          if (FF.canPlay(G, c, t)) { const n = c.name; FF.playCard(G, i, t); return 'used ' + n; }
        }
        if (b.bell >= FF.bellNeed(G)) { FF.ringBell(G); return 'rang the bell'; }
        FF.passTurn(G);
        return 'passed';
      });
      if (st.turn === 1) { await snap('fight-z' + (st.zone + 1)); note(`  fight opens (zone ${st.zone + 1}) — ${acted}`); }
      await page.evaluate(() => window.FF.drainAll());
      await settle(page, 3);
      continue;
    }

    // every other screen: take the most human option and note what it offered
    const did = await page.evaluate(() => {
      const FF = window.FF, G = FF.G;
      const s = G.screen;
      if (s === 'reward') {
        const r = G.ui.reward;
        if (r.cards.length && !r.taken) {
          const names = r.cards.map((id) => FF.CARDS[id].name);
          FF.press('reward', 0);
          return 'reward: offered ' + names.join(', ') + ' — took the first';
        }
        if (r.charms.length && !r.charmTaken) { FF.press('rewardCharm', 0); for (let k = 0; k < 6 && FF.UI.choose; k++) FF.UI.choose.onPick(0); return 'reward: took a charm'; }
        if (r.bells && r.bells.length && !r.bellTaken) { FF.press('rewardBell', 0); return 'reward: rang a bell'; }
        FF.press('rewardSkip'); return 'reward: onward';
      }
      if (s === 'shop') {
        const sh = G.ui.shop;
        if (sh.bell && !sh.bell.sold && G.run.gold >= sh.bell.price) { FF.buy(G, 'bell'); return 'trader: bought a bell'; }
        if (sh.temper && !sh.temper.sold && G.run.gold >= sh.temper.price && FF.temperable(G.run).length) {
          FF.press('buyTemper');
          for (let k = 0; k < 6 && FF.UI.choose; k++) FF.UI.choose.onPick(0);
          return 'trader: tempered a card';
        }
        if (!sh.heal.sold && G.run.gold >= sh.heal.price) { FF.buy(G, 'heal'); return 'trader: mended everyone'; }
        FF.press('leaveShop'); return 'trader: nothing affordable, walked out (' + G.run.gold + ' scrip)';
      }
      if (s === 'camp') { FF.press('campRest'); return 'camp: rested'; }
      if (s === 'rest') { FF.press('restPick', 0); for (let k = 0; k < 6 && FF.UI.choose; k++) FF.UI.choose.onPick(0); return 'rest stop: took the first kindness'; }
      if (s === 'shrine') { FF.press('shrineGive'); for (let k = 0; k < 6 && FF.UI.choose; k++) FF.UI.choose.onPick(0); return 'shrine: left a card'; }
      if (s === 'event') {
        const ev = G.ui.event.def;
        FF.press('eventOpt', 0);
        for (let k = 0; k < 6 && FF.UI.choose; k++) FF.UI.choose.onPick(0);
        return 'event "' + ev.title + '": took "' + ev.opts[0].label + '"';
      }
      FF.advance(G);
      return 'advanced past ' + s;
    });
    note('  ' + did);
    await settle(page, 10);
  }

  writeFileSync(join(OUT, 'notes.txt'), notes.join('\n'));
  await browser.close();
  console.log('\n' + notes.length + ' notes in ' + OUT);
})().catch((e) => { console.error(e); process.exit(1); });
