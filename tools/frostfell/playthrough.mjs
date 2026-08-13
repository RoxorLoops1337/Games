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
const arg = (name, dflt) => {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const TRIBE = arg('tribe', 'frost');
const COURSE = arg('course', 'frost');
const OUT = arg('out', '/tmp/ff-play');
const QUIET = process.argv.indexOf('--quiet') >= 0;
/* --careless plays the way the probe's bottom rung plays: leftmost card into the
   leftmost slot, gear at the nearest thing, no reading of schemes and no slot
   kept back. That rung has read 7% for five rounds and nobody had watched it. */
const CARELESS = process.argv.indexOf('--careless') >= 0;

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
const note = (s) => { notes.push(s); if (!QUIET) console.log('  · ' + s); };
/* What the run adds up to, so four transcripts can be compared rather than
   read one at a time. */
const tally = { fights: 0, skipped: 0, nodes: 0, brokeAt: 0, earned: 0, spent: 0, bought: 0, steps: [] };

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
  await page.evaluate((tb) => { window.FF.press('tribe', tb); }, TRIBE);
  await settle(page, 12);
  await page.evaluate((co) => { window.FF.press('courseToggle', co); window.FF.press('startRun'); }, COURSE);
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
        return { kinds: nodes.map((n) => n.kind), need: need ? need.name : null,
          live: FF.liveFeats(G.run).length, zone: G.run.zone, step: G.run.step,
          gold: G.run.gold, deck: G.run.deck.length,
          power: Math.round(FF.caravanPower(G.run) * 10) / 10,
          answer: Math.round(FF.fellAnswer(G.run) * 100) };
      });
      /* SOMEBODY WHO HAS READ THE RULES picks by what the caravan is short of:
         a trader when there is scrip to spend, a camp when the line is hurt,
         and otherwise a fight, because fights are what pay. */
      const pick = await page.evaluate(() => {
        const FF = window.FF, G = FF.G;
        const nodes = G.run.trail[G.run.step] || [];
        const hurt = G.run.deck.concat([G.run.leader]).some((c) => c.dmg > 4 || c.injured);
        const rank = (k) => {
          if (k === 'shop') return G.run.gold >= 30 ? 9 : 2;
          if (k === 'camp' || k === 'rest') return hurt ? 8 : 3;
          if (k === 'shrine') return 6;
          if (k === 'cache' || k === 'event') return 5;
          if (k === 'elite') return 7;              // packs pay best
          if (k === 'boss') return 10;
          return 6;                                  // a plain fight
        };
        let best = 0;
        nodes.forEach((n, i) => { if (rank(n.kind) > rank(nodes[best].kind)) best = i; });
        return best;
      });
      tally.nodes++;
      const took = info.kinds[pick];
      if (took === 'fight' || took === 'elite' || took === 'boss') tally.fights++; else tally.skipped++;
      tally.steps.push(`${info.zone + 1}.${info.step + 1} ${took}`);
      note(`zone ${info.zone + 1} step ${info.step + 1}: ${info.kinds.join('/')} → ${took}` +
        ` · ${info.deck} cards, ${info.gold} scrip, power ${info.power} (the fell answers ${info.answer > 0 ? '+' : ''}${info.answer}%)` +
        (info.need ? ` · short of ${info.need.toLowerCase()}` : ' · wants nothing') +
        ` · ${info.live} seals alive`);
      if (info.step === 0) await snap('z' + (info.zone + 1) + '-trail');
      await page.evaluate((i) => window.FF.press('node', i), pick);
      await settle(page, 16);
      continue;
    }

    if (st.screen === 'battle') {
      if (st.over) { await page.evaluate(() => window.FF.drainAll()); await settle(page, 8); continue; }
      const acted = await page.evaluate(() => {
        const FF = window.FF, G = FF.G, b = G.battle;
        /* The four habits the ablation says are worth anything, in order:
           deny what has committed, hold gear until it earns the turn, fill the
           front of both lanes, keep a slot in reserve. */
        for (const f of FF.enemyUnits(G)) {
          const p = f.plot;
          if (!p) continue;
          if (p.id === 'mark') {
            const t = FF.playerUnits(G).find((x) => x.uid === p.uid);
            if (t && t.lane === p.lane && t.col === p.col) {
              const spot = FF.freeSlots(G, 'p')[0];
              if (spot) FF.moveUnit(G, t, spot.lane, spot.col);
            }
          } else if (p.id === 'chill') {
            const caught = FF.playerUnits(G).filter((x) => x.lane === p.lane);
            const room = FF.freeSlots(G, 'p').filter((sl) => sl.lane !== p.lane);
            if (caught.length && caught.length <= room.length) {
              caught.forEach((t, i) => FF.moveUnit(G, t, room[i].lane, room[i].col));
            }
          }
        }
        // gear, but only where it kills something the line would not have killed
        for (let i = 0; i < b.hand.length; i++) {
          const c = b.hand[i];
          if (c.type !== 'item') continue;
          for (const f of FF.enemyUnits(G)) {
            const pre = FF.previewOf(G, c, f);
            if (pre.some((x) => x.dmg >= x.u.hp) && FF.canPlay(G, c, f)) {
              const n = c.name; FF.playCard(G, i, f); return n + ' finishes ' + f.name;
            }
          }
        }
        // a body, front of both lanes first, keeping one slot back
        const ui = b.hand.findIndex((c) => c.type === 'unit');
        if (ui >= 0 && FF.freeSlots(G, 'p').length > 1) {
          for (let col = 0; col < FF.COLS; col++) for (let lane = 0; lane < FF.LANES; lane++) {
            if (FF.slotFree(G, 'p', lane, col)) {
              const n = b.hand[ui].name;
              if (FF.playCard(G, ui, { lane, col })) return 'set down ' + n;
            }
          }
        }
        // gear on whatever is about to swing
        for (let i = 0; i < b.hand.length; i++) {
          const c = b.hand[i];
          if (c.type !== 'item') continue;
          const t = FF.enemyUnits(G).slice().sort((a, z) => a.cnt - z.cnt)[0] || null;
          if (FF.canPlay(G, c, t)) { const n = c.name; FF.playCard(G, i, t); return 'used ' + n; }
        }
        if (b.bell >= FF.bellNeed(G)) { FF.ringBell(G); return 'rang the bell'; }
        FF.passTurn(G);
        return 'passed';
      }, CARELESS);
      if (st.turn <= 4) note(`  turn ${st.turn}: ${acted}`);
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
          const need = FF.caravanNeeds(G.run);
          const score = (id) => {
            const d = FF.CARDS[id];
            let v = (d.rare || 1) * 2;
            if (d.type === 'unit') v += (d.atk || 0) / Math.max(1, d.cnt || 1) * 3 + (d.hp || 0) * 0.25;
            else v += 5;
            if (need) {
              if (need.k === 'bodies' && d.type === 'unit') v += 5;
              if (need.k === 'wall' && (d.hp || 0) >= 10) v += 5;
              if (need.k === 'mend' && /heal|mend|regen/i.test(d.text || '')) v += 5;
              if (need.k === 'punch' && Math.max(d.atk || 0, FF.hitOf({ def: id })) >= 5) v += 4;
            }
            return v;
          };
          let bi = 0;
          r.cards.forEach((id, i) => { if (score(id) > score(r.cards[bi])) bi = i; });
          const names = r.cards.map((id) => FF.CARDS[id].name);
          const chosen = FF.CARDS[r.cards[bi]].name;
          FF.press('reward', bi);
          return 'reward: ' + names.join(', ') + ' → took ' + chosen;
        }
        if (r.charms.length && !r.charmTaken) { FF.press('rewardCharm', 0); for (let k = 0; k < 6 && FF.UI.choose; k++) FF.UI.choose.onPick(0); return 'reward: took a charm'; }
        if (r.bells && r.bells.length && !r.bellTaken) { FF.press('rewardBell', 0); return 'reward: rang a bell'; }
        FF.press('rewardSkip'); return 'reward: onward';
      }
      if (s === 'shop') {
        const sh = G.ui.shop, before = G.run.gold;
        const hurt = G.run.deck.concat([G.run.leader]).some((c) => c.dmg > 4 || c.injured);
        if (sh.bell && !sh.bell.sold && G.run.gold >= sh.bell.price) { FF.buy(G, 'bell'); return 'trader: a bell, ' + sh.bell.price + ' (' + before + '→' + G.run.gold + ')'; }
        if (sh.temper && !sh.temper.sold && G.run.gold >= sh.temper.price && FF.temperable(G.run).length) {
          FF.press('buyTemper');
          for (let k = 0; k < 6 && FF.UI.choose; k++) FF.UI.choose.onPick(0);
          return 'trader: tempered, ' + sh.temper.price + ' (' + before + '→' + G.run.gold + ')';
        }
        if (hurt && !sh.heal.sold && G.run.gold >= sh.heal.price) { FF.buy(G, 'heal'); return 'trader: mended all, ' + sh.heal.price + ' (' + before + '→' + G.run.gold + ')'; }
        // and then she feeds the line for as long as the purse holds out
        if (FF.mealPrice && G.run.gold >= FF.mealPrice(G.run) && FF.feedable(G.run).length) {
          const cost = FF.mealPrice(G.run);
          FF.press('buyMeal');
          for (let k = 0; k < 6 && FF.UI.choose; k++) FF.UI.choose.onPick(0);
          return 'trader: a hot meal, ' + cost + ' (' + before + '→' + G.run.gold + ')';
        }
        const cheapest = sh.cards.filter((cc) => !cc.sold).map((cc) => cc.price).sort((a, z) => a - z)[0];
        FF.press('leaveShop');
        return 'trader: WALKED OUT — ' + before + ' scrip left, cheapest card ' +
          (cheapest === undefined ? 'none' : cheapest) + ', next meal ' + (FF.mealPrice ? FF.mealPrice(G.run) : '—');
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
    if (/WALKED OUT/.test(did)) tally.brokeAt++;
    note('  ' + did);
    await settle(page, 10);
  }

  const end = await page.evaluate(() => {
    const FF = window.FF, G = FF.G;
    return { screen: G.screen, deck: G.run ? G.run.deck.length : 0, gold: G.run ? G.run.gold : 0,
      power: G.run ? Math.round(FF.caravanPower(G.run) * 10) / 10 : 0 };
  });
  const line = `${TRIBE}/${COURSE}: ${end.screen} · ${tally.fights} fights of ${tally.nodes} steps ` +
    `(${Math.round(100 * tally.fights / Math.max(1, tally.nodes))}% fought) · ` +
    `${tally.brokeAt} shops walked out of · ended ${end.deck} cards, ${end.gold} scrip, power ${end.power}`;
  notes.push('');
  notes.push(line);
  console.log('\n' + line);
  writeFileSync(join(OUT, 'notes.txt'), notes.join('\n'));
  await browser.close();
  console.log('\n' + notes.length + ' notes in ' + OUT);
})().catch((e) => { console.error(e); process.exit(1); });
