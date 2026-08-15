/* ============================================================================
   shots.mjs — drive FROSTFELL in a real browser and photograph it.

     node tools/frostfell/shots.mjs                 # → /tmp/frostfell-shots
     node tools/frostfell/shots.mjs --out DIR
     node tools/frostfell/shots.mjs --size 2400x1080

   The headless suites prove the game does not throw. They cannot tell you that
   two labels overlap, that a panel is cramped, or that a colour has vanished
   into the backdrop. This opens the real file in Chromium, walks the route a
   player walks, and leaves a PNG of every screen so somebody can look.

   Chromium is preinstalled (PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers) — never
   run `playwright install` here.

   Each shot is taken through the game's own state rather than by hunting for
   pixels to click: `window.FF` is the same handle the test suites use, so a
   screenshot walk cannot drift out of step with the rules.
   ========================================================================== */
import { chromium } from 'playwright-core';
import { mkdirSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const GAME = join(REPO, 'frostfell', 'index.html');

const arg = (name, dflt) => {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const OUT = arg('out', '/tmp/frostfell-shots');
/* REAL PHONES, NOT JUST SMALL WINDOWS.

   Twenty-three rounds of shots were taken at 1280x720 and 2400x1080 in a
   desktop Chromium — a game built landscape-first for a thumb, never once
   photographed on anything shaped like a phone or driven by anything shaped
   like a finger. `--phone <name>` uses a real device's landscape viewport,
   its pixel ratio and touch emulation.

   AND THE LIST IS NOT KEPT HERE ANY MORE. The render suite swept eight shapes
   while the walk photographed three, so the stub was checking sizes no human
   had ever seen — which is exactly how a live defect sat on the victory screen
   at 653x280 until an assertion tripped over it. Both read
   `tools/frostfell/shapes.mjs` now, and `--all` walks every one of them. */
const { PHONES, SHAPES } = await import('./shapes.mjs');
/* `--all` WALKS EVERY SHAPE IN THE LIST, one child process each.

   The walk is one long linear script over module-level W/H/OUT, so looping it
   in-process would mean threading state through 250 lines of screen-by-screen
   choreography for no gain. Re-running itself per shape is the same coverage,
   keeps each walk's page errors attributable to one shape, and cannot leak
   state between them. Output goes to <out>/<w>x<h>/ so two shapes never
   overwrite each other — which the single-dir default did, and is why a stale
   phone shot was read as a fresh one this round. */
if (process.argv.includes('--all')) {
  const { spawnSync } = await import('node:child_process');
  let bad = 0;
  for (const sh of SHAPES) {
    const where = join(OUT, sh.w + 'x' + sh.h);
    const args = [process.argv[1], '--out', where].concat(
      sh.phone ? ['--phone', sh.phone] : ['--size', sh.w + 'x' + sh.h]);
    console.log(`\n=== ${sh.name} (${sh.w}x${sh.h})`);
    const r = spawnSync(process.execPath, args, { stdio: 'inherit' });
    if (r.status !== 0) { bad++; console.error(`  ! ${sh.name} exited ${r.status}`); }
  }
  console.log(`\n${SHAPES.length} shapes walked into ${OUT}${bad ? `, ${bad} FAILED` : ''}`);
  process.exit(bad ? 1 : 0);
}
const PHONE = arg('phone', '');
const dev = PHONE ? PHONES[PHONE] : null;
if (PHONE && !dev) { console.error('unknown phone: ' + PHONE + ' — have ' + Object.keys(PHONES).join(', ')); process.exit(1); }
const [W, H] = dev ? [dev.w, dev.h] : arg('size', '1280x720').split('x').map(Number);

/* Find the preinstalled Chromium rather than downloading one. */
function findChromium() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (!existsSync(root)) return undefined;
  const dirs = readdirSync(root).filter((d) => d.startsWith('chromium') && !d.includes('headless_shell'));
  for (const d of dirs.sort().reverse()) {
    for (const rel of ['chrome-linux/chrome', 'chrome-linux/headless_shell']) {
      const p = join(root, d, rel);
      if (existsSync(p)) return p;
    }
  }
  const direct = join(root, 'chromium');
  return existsSync(direct) ? direct : undefined;
}

const shots = [];
/* A SHOT SAYS WHICH SCREEN IT IS OF, AND IS CHECKED AGAINST IT.

   Every screenshot in this walk is filed under a name a person later reads as a
   promise — `15-reward` is the reward pick, `14-inspect` is a foe explained. For
   at least a round none of them were: the guide loop below plays whole fights to
   reach the last hint, it lost one, and from that point `13-battle-drag`,
   `14-inspect` and `15-reward` were three PNGs of the DEFEAT screen filed under
   three other names. Nothing was red. Three rounds of briefs asked for those
   three views to be verified in situ and three rounds of agents looked at a
   photograph of something else.

   So a shot declares what it expects — the screen the game must be on, and
   optionally the overlay that must be open — and a walk that photographs
   something else says so loudly and exits non-zero. A screenshot tool whose
   output cannot be trusted is worse than no screenshot tool, because it is
   believed. */
async function shot(page, name, note, want) {
  if (want) {
    const w = typeof want === 'string' ? { screen: want } : want;
    const got = await page.evaluate((need) => {
      const FF = window.FF, G = FF.G;
      return {
        screen: G.screen,
        over: !!(G.battle && G.battle.over),
        ui: need.ui ? !!FF.UI[need.ui] : true,
      };
    }, w);
    const wrong = [];
    if (got.screen !== w.screen) wrong.push(`on '${got.screen}', not '${w.screen}'`);
    if (w.screen === 'battle' && got.over && !w.over) wrong.push('the fight is already over');
    if (w.ui && !got.ui) wrong.push(`UI.${w.ui} is not open`);
    if (wrong.length) {
      console.error(`  ! ${name}: ${wrong.join('; ')} — the shot is of something else`);
      process.exitCode = 1;
    }
  }
  mkdirSync(OUT, { recursive: true });
  const file = join(OUT, name + '.png');
  await page.screenshot({ path: file });
  shots.push({ name, file, note });
  console.log(`  · ${name.padEnd(16)} ${note || ''}`);
}

/* Let a few frames go by so animations settle where they belong. */
const settle = (page, frames = 30) => page.evaluate((n) => new Promise((res) => {
  let i = 0;
  const step = () => (++i >= n ? res() : requestAnimationFrame(step));
  requestAnimationFrame(step);
}), frames);

(async () => {
  const exe = findChromium();
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--mute-audio'] });
  const page = await browser.newPage({
    viewport: { width: W, height: H },
    deviceScaleFactor: dev ? dev.dpr : 1,
    hasTouch: !!dev, isMobile: !!dev,
  });
  if (dev) console.log(`  (${dev.name} — ${W}x${H} at ${dev.dpr}x, touch on)`);
  page.on('pageerror', (e) => { console.error('  ! page error:', e.message); process.exitCode = 1; });
  page.on('console', (m) => { if (m.type() === 'error') console.error('  ! console:', m.text()); });

  await page.goto(pathToFileURL(GAME).href);
  await page.waitForFunction(() => !!window.FF);
  console.log(`FROSTFELL at ${W}x${H} → ${OUT}`);

  // the boot gate, then the title
  await settle(page, 10);
  await shot(page, '00-boot', 'the first-touch gate');
  await page.click('#bootgo');
  await settle(page, 40);
  await shot(page, '01-title', 'title and leader choices', 'title');

  // the rulebook, all three pages
  await page.evaluate(() => window.FF.press('help'));
  await settle(page, 6);
  await shot(page, '02-help-fight', 'rulebook: the fight');
  await page.evaluate(() => window.FF.press('helpPage', 1));
  await settle(page, 4);
  await shot(page, '03-help-board', 'rulebook: room and schemes');
  await page.evaluate(() => window.FF.press('helpPage', 2));
  await settle(page, 4);
  await shot(page, '04-help-status', 'rulebook: statuses');
  await page.evaluate(() => window.FF.press('helpPage', 3));
  await settle(page, 4);
  await shot(page, '04b-help-keyword', 'rulebook: keywords');
  await page.evaluate(() => window.FF.press('helpClose'));

  // the collection
  await page.evaluate(() => window.FF.press('collection'));
  await settle(page, 8);
  await shot(page, '05-collection', 'everything found and unfound', 'collection');
  await page.evaluate(() => window.FF.press('collectClose'));

  // choosing a leader, with a winter turned on
  await page.evaluate(() => window.FF.press('tribe', 'hearth'));
  await settle(page, 20);
  await shot(page, '06-leader', 'leader, starting deck, winters', 'leader');
  await page.evaluate(() => window.FF.press('winterToggle', 'keen'));
  await page.evaluate(() => window.FF.press('courseToggle', 'pack'));
  await settle(page, 6);
  await shot(page, '07-leader-winter', 'a winter and a course chosen', 'leader');

  // out on the trail
  await page.evaluate(() => window.FF.press('startRun'));
  await settle(page, 30);
  await shot(page, '08-trail', 'the road, first step', 'trail');

  // into the first fight
  await page.evaluate(() => window.FF.press('node', 0));
  await settle(page, 45);
  await shot(page, '09-battle-open', 'the opening hand, dealt', 'battle');

  /* THE GUIDE, IN ORDER, as a first-time player meets it. Each hint is cleared
     by doing the thing it names, so this walks the opening the way a new player
     walks it rather than photographing one frame of it. */
  await page.evaluate(() => { window.FF.G.meta.taught = false; });
  for (let k = 0; k < 12; k++) {
    const info = await page.evaluate(() => {
      const FF = window.FF, G = FF.G;
      if (!G.tut || G.tut.over) return null;
      /* THE GUIDE CARRIES ON INTO THE NEXT FIGHT, AND SO DOES THIS.

         It used to stop with the opening, which was fine while every hint could
         be cleared inside one skirmish. The scheme hint cannot: it waits for a
         foe to commit to a plan, and an opening that ends in four turns may not
         give it one. Stopping there photographed nine hints and silently missed
         the tenth — the most valuable one in the list. */
      let guard = 0;
      while ((G.screen !== 'battle' || G.battle.over) && guard++ < 40) {
        if (G.screen === 'reward') FF.press('rewardSkip');
        else if (G.screen === 'trail') FF.enterNode(G, 0);
        else if (G.screen === 'shop') FF.press('leaveShop');
        else if (G.screen === 'camp') FF.press('campRest');
        else if (G.screen === 'gameover' || G.screen === 'victory') return null;
        else FF.advance(G);
        FF.drainAll();
        for (let n = 0; n < 6 && FF.UI.choose; n++) FF.UI.choose.onPick(0);
        FF.UI.choose = null;
      }
      if (G.screen !== 'battle' || G.battle.over) return null;
      const h = FF.TUTORIAL[G.tut.i];
      return h ? { id: h.id, text: h.text, hold: !!G.tut.hold } : null;
    });
    if (!info) break;
    /* A HELD hint has nothing on screen yet — it is waiting for the thing it
       describes to be true. Photographing it while held produces a picture of
       the fight with no hint in it, filed under the hint's name, which is worse
       than not taking it: it says the hint does not appear when in fact it had
       not appeared YET. So pass turns until it speaks, the way a player does. */
    if (info.hold) {
      const spoke = await page.evaluate(() => {
        const FF = window.FF, G = FF.G;
        for (let n = 0; n < 14; n++) {
          if (!G.tut.hold) return true;
          if (G.screen !== 'battle' || G.battle.over) return false;
          // play on rather than only passing — a player waiting for a foe to
          // commit is still fighting, and a board with nothing on it loses
          const i = G.battle.hand.findIndex((c) => c.type === 'unit');
          const free = FF.freeSlots(G, 'p');
          if (i >= 0 && free.length) FF.playCard(G, i, free[0]);
          else FF.passTurn(G);
          FF.drainAll(); FF.update(1 / 30);
        }
        return !G.tut.hold;
      });
      await settle(page, 12);
      if (!spoke) continue;
    }
    await settle(page, 24);
    await shot(page, '09h' + k + '-hint-' + info.id, info.text.slice(0, 64));
    // do the thing the hint asks for, so the next one comes up
    await page.evaluate(() => {
      const FF = window.FF, G = FF.G;
      const h = FF.TUTORIAL[G.tut.i];
      if (!h) return;
      if (h.id === 'deploy') {
        const i = G.battle.hand.findIndex((c) => c.type === 'unit');
        if (i >= 0) FF.playCard(G, i, { lane: 1, col: 0 });
      } else if (h.id === 'order') FF.UI.order = true;
      else if (h.id === 'inspect') { FF.UI.inspect = G.run.deck[0]; }
      else if (h.id === 'bell') { FF.UI.inspect = null; FF.ringBell(G); }
      else if (h.id === 'front') {
        const u = FF.playerUnits(G).find((x) => !x.leader && x.col > 0);
        if (u && FF.slotFree(G, 'p', u.lane, 0)) FF.moveUnit(G, u, u.lane, 0);
        else FF.passTurn(G);
      } else { FF.passTurn(G); }
      FF.drainAll();
    });
    await settle(page, 6);
  }
  await page.evaluate(() => { window.FF.UI.order = false; window.FF.UI.inspect = null; });

  /* THE GUIDE GETS A RUN OF ITS OWN, AND EVERYTHING AFTER IT GETS A FRESH ONE.

     The loop above is not a screenshot of the opening any more — to reach the
     scheme hint it plays whole fights, skips rewards, walks the trail and enters
     the next node, and it plays them badly, because it is a `while` loop and not
     a pilot. Whatever it leaves behind is what the next twelve shots photograph:
     a caravan six steps along with three cards in hand, or, when the loop lost,
     the DEFEAT screen filed under `13-battle-drag`, `14-inspect` and `15-reward`.

     Reaching the last hint and photographing a clean fight are two jobs and they
     were sharing one run. They do not share one now: the guide finishes on its
     own run, and the walk then deals a NEW one — same tribe, a fixed seed, the
     guide switched off — and opens the first fight on it. Every shot from here
     is of a first fight in a caravan that is whole, at every shape, every time.
     `shot()`'s expectation is what keeps it that way. */
  await page.evaluate(() => {
    const FF = window.FF, G = FF.G;
    G.meta.taught = true;                  // the hints have had their turn
    FF.newRun(G, 'hearth', 20260415, ['keen'], 'pack');
  });
  /* AND A FIGHT THAT IS STILL GOING WHEN THE CAMERA COMES UP.

     The first node of a first trail is over in three turns — which put the
     reward screen under `11-battle-mid`, `12-battle-order`, `13-battle-drag` and
     `14-inspect` the moment the walk stopped inheriting a mid-run board. A
     pack with some weight in it is what those four shots are of, so that is what
     they get, and any shot that finds the fight finished asks for another. */
  const ensureFight = async () => {
    await page.evaluate(() => {
      const FF = window.FF, G = FF.G;
      if (G.screen === 'battle' && G.battle && !G.battle.over) return;
      G.run.zone = Math.max(1, G.run.zone);
      FF.startBattle(G, 'elite');
      FF.drainAll();
    });
    await settle(page, 45);
  };
  await ensureFight();

  // play a warden, then let the turn resolve
  await page.evaluate(() => {
    const FF = window.FF, G = FF.G;
    const i = G.battle.hand.findIndex((c) => c.type === 'unit');
    if (i >= 0) FF.playCard(G, i, { lane: 0, col: 0 });
  });
  await settle(page, 40);
  await shot(page, '10-battle-deployed', 'a warden on the board, mid-resolution', 'battle');


  // a few turns in: telegraphs, counters, a log
  await page.evaluate(() => {
    const FF = window.FF, G = FF.G;
    for (let k = 0; k < 3; k++) {
      const i = G.battle.hand.findIndex((c) => c.type === 'unit');
      if (i >= 0) FF.playCard(G, i, { lane: k % 2, col: Math.floor(k / 2) });
      else FF.passTurn(G);
      FF.drainAll();
    }
  });
  await ensureFight();
  await settle(page, 30);
  await shot(page, '11-battle-mid', 'a fight underway', 'battle');

  // the order overlay
  await page.evaluate(() => window.FF.press('order'));
  await settle(page, 8);
  await shot(page, '12-battle-order', 'resolution order, numbered', { screen: 'battle', ui: 'order' });
  await page.evaluate(() => window.FF.press('order'));

  // a card held over a target, showing what it would do
  await ensureFight();
  await page.evaluate(() => {
    const FF = window.FF, G = FF.G;
    const i = G.battle.hand.findIndex((c) => c.type === 'item');
    if (i < 0) return;
    const h = FF.hits().find((x) => x.id === 'hand' && x.data === i);
    const foe = FF.hits().find((x) => x.id === 'unit' && x.data.side === 'e');
    if (!h || !foe) return;
    FF.onDown(h.x + 20, h.y + 20);
    FF.onMove(foe.x + 40, foe.y + 40);
  });
  await settle(page, 8);
  await shot(page, '13-battle-drag', 'gear held over a foe, with its promise', { screen: 'battle', ui: 'drag' });
  await page.evaluate(() => window.FF.onUp(-999, -999));

  // inspecting something
  await page.evaluate(() => {
    const FF = window.FF;
    const u = FF.enemyUnits(FF.G)[0];
    if (u) FF.UI.inspect = u;
  });
  await settle(page, 6);
  await shot(page, '14-inspect', 'a foe, explained', { screen: 'battle', ui: 'inspect' });
  await page.evaluate(() => { window.FF.UI.inspect = null; });

  // win it, and take the reward
  await page.evaluate(() => {
    const FF = window.FF, G = FF.G;
    G.battle.waves = [];
    FF.enemyUnits(G).forEach((u) => FF.hurt(G, u, 9999, null));
    FF.drainAll();
  });
  await settle(page, 40);
  await shot(page, '15-reward', 'the pick after a fight', 'reward');

  // the course chooser, opened off the reward screen
  await page.evaluate(() => { window.FF.G.run.gold = 400; window.FF.press('rewardCourse'); });
  await settle(page, 8);
  await shot(page, '15b-course', 'changing the course mid-trek', { screen: 'reward', ui: 'choose' });
  await page.evaluate(() => { window.FF.UI.choose = null; });

  /* and back to the road, one step on. Taking the card only leaves the reward
     screen when there is no charm on offer as well — with one there, the pick is
     not finished until the charm is taken or the screen is passed, and the walk
     was photographing the reward screen a second time under the road's name. */
  await page.evaluate(() => {
    const FF = window.FF;
    FF.press('reward', 0);
    for (let n = 0; n < 6 && FF.UI.choose; n++) FF.UI.choose.onPick(0);
    FF.UI.choose = null;
    if (FF.G.screen === 'reward') FF.press('rewardSkip');
    FF.drainAll();
  });
  await settle(page, 30);
  await shot(page, '16-trail-again', 'the road, further along', 'trail');

  // the other screens, driven straight through state
  const screens = [
    ['shop', 'ui.shop = FF.rollShop(G)', '17-shop', 'the trader'],
    ['camp', '0', '18-camp', 'camp'],
    ['rest', "ui.rest = { offer: FF.BLESSINGS.slice(0,3).map(b=>b.id) }", '19-rest', 'a rest stop'],
    ['shrine', '0', '20-shrine', 'the shrine'],
    ['event', 'ui.event = { def: FF.EVENTS[0] }', '21-event', 'an event'],
  ];
  for (const [scr, setup, name, note] of screens) {
    await page.evaluate(([scr2, setup2]) => {
      const FF = window.FF, G = FF.G, ui = G.ui;
      // eslint-disable-next-line no-eval
      eval(setup2);
      G.screen = scr2;
    }, [scr, setup]);
    await settle(page, 24);
    await shot(page, name, note, scr);
  }

  // a boss, banner and all
  await page.evaluate(() => {
    const FF = window.FF, G = FF.G;
    G.run.zone = 1;
    FF.startBattle(G, 'boss');
  });
  await settle(page, 20);
  await shot(page, '22-boss', 'a beast, announced', 'battle');
  await settle(page, 90);
  await shot(page, '23-boss-settled', 'the same fight once the banner clears', 'battle');

  // and the end of a run, with a couple of seals struck on the way in
  await page.evaluate(() => {
    const FF = window.FF;
    FF.G.run.freshFeats = FF.checkFeats(FF.G.run).slice(0, 2);
    FF.G.screen = 'victory';
  });
  await settle(page, 40);
  await shot(page, '24-victory', 'what the caravan did', 'victory');

  /* AND THE OTHER HALF OF THE SAME MOMENT. The walk photographed a crossing and
     never once a defeat, so the loss screen went unlooked-at for thirty-five
     rounds while it was a dimmed copy of a zone you may never have reached. */
  await page.evaluate(() => {
    const FF = window.FF;
    FF.G.run.killedBy = { name: 'Frostwyrm', art: FF.FOES.frostwyrm.art, def: 'frostwyrm', boss: true };
    FF.G.screen = 'gameover';
  });
  await settle(page, 40);
  await shot(page, '25-defeat', 'and what stopped a run that did not', 'gameover');

  await browser.close();
  console.log(`\n${shots.length} shots in ${OUT}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
