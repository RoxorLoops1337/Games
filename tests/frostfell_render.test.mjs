// FROSTFELL — the render suite.
//
// A canvas game has a whole second failure surface: a draw call that throws on
// a state the rules suite never looks at, and a hit region that never lines up
// with what the player can see. Nothing here checks pixels — it checks that
// every screen draws, that every art recipe in the game survives being drawn,
// and that the things you are meant to be able to touch are touchable.
//
// Run: node tests/frostfell_render.test.mjs
import { loadGame, mkCtx, withRun, place, bareBattle, dummy, ok, eq, done, section } from './frostfell_lib.mjs';

const log = [];
const FF = loadGame({}, log);
const G = FF.G;
FF.setCtx(mkCtx(log));

const frame = (n = 1) => { for (let i = 0; i < n; i++) { FF.update(1 / 60); FF.render(); } };
const drew = (label) => { ok(log.length > 0, label); log.length = 0; };

/* ---------------------------------------------------------- every screen -- */
section('every screen draws');
{
  G.screen = 'title';
  frame(3); drew('the title draws');

  withRun(FF, 'hearth', 2024);
  G.screen = 'trail';
  frame(3); drew('the trail draws');

  FF.enterNode(G, 0);
  eq(G.screen, 'battle', 'the first node opens a fight');
  frame(30); drew('a battle draws');

  // mid-resolution: the busiest frame in the game
  FF.passTurn(G);
  frame(10); drew('a turn resolving draws');

  G.ui.reward = FF.rollReward(G, 'boss');
  G.screen = 'reward';
  frame(2); drew('the reward screen draws, charms and all');

  G.ui.reward = FF.rollReward(G, 'fight');
  frame(2);
  ok(FF.hits().some((h) => h.id === 'rewardCopy'), 'a pick can be spent copying instead');
  ok(FF.hits().some((h) => h.id === 'rewardBurn'), 'or burning');

  // and the meal, which is the only ware sold on both screens
  G.run.gold = 400;
  frame(2);
  ok(FF.hits().some((h) => h.id === 'rewardMeal'), 'or feeding somebody out of what the fight paid');

  G.ui.shop = FF.rollShop(G);
  G.screen = 'shop';
  frame(2); drew('the shop draws');
  ok(FF.hits().some((h) => h.id === 'buySigil'), 'and sells a sigil');
  ok(FF.hits().some((h) => h.id === 'buyBurn'), 'and will burn a card for you');
  ok(FF.hits().some((h) => h.id === 'buyMeal'), 'and a hot meal, as many as the purse holds');
  {
    // six buttons across the counter now: the row still has to fit the stage
    const D = FF.dims();
    const row = FF.hits().filter((h) => /^buy(Heal|Temper|Scar|Sigil|Burn|Meal)$/.test(h.id));
    eq(row.length, 6, 'all six wares are reachable');
    for (const h of row) ok(h.x >= 0 && h.x + h.w <= D.VW, 'the counter fits the stage at ' + h.id);
  }

  // the trail says what is behind you, at the fork rather than at the fight
  G.screen = 'trail';
  G.run.followed = 0;
  frame(2);
  const quiet = FF.hits().length;
  G.run.followed = FF.FOLLOW_FREE + 6;
  frame(2); drew('a trail with something behind it draws');
  ok(FF.hits().length >= quiet, 'and the warning costs no touchable thing');

  G.ui.event = { def: FF.EVENTS[0] };
  G.screen = 'event';
  frame(2); drew('an event draws');
  ok(FF.hits().filter((h) => h.id === 'eventOpt').length >= 2, 'with its choices touchable');

  G.screen = 'camp';
  frame(2); drew('camp draws');

  G.ui.rest = { offer: FF.BLESSINGS.slice(0, 3).map((x) => x.id) };
  G.screen = 'rest';
  frame(2); drew('a rest stop draws');
  eq(FF.hits().filter((h) => h.id === 'restPick').length, 3, 'with three blessings to take');

  G.screen = 'shrine';
  frame(2); drew('the shrine draws');
  ok(FF.hits().some((h) => h.id === 'shrineGive'), 'and offers the step');

  // a fight in mid-swing: telegraphs, next-up marker, log lines and a drag preview
  withRun(FF, 'frost', 12);
  FF.enterNode(G, 0);
  frame(24);
  FF.playerUnits(G).forEach((u) => { u.cnt = 1; });
  FF.enemyUnits(G).forEach((u) => { u.cnt = 1; });
  FF.logLine(G, 'something happened', '#fff');
  const itemIdx = G.battle.hand.findIndex((cd) => cd.type === 'item');
  if (itemIdx >= 0) {
    const hh = FF.hits().find((h) => h.id === 'hand' && h.data === itemIdx);
    if (hh) {
      FF.onDown(hh.x + 10, hh.y + 10);
      const target = FF.hits().find((h) => h.id === 'unit');
      FF.onMove(target.x + 40, target.y + 40);
      frame(2); drew('a battle mid-drag draws its telegraphs, marker, log and prediction');
      FF.onUp(-500, -500);
    }
  }

  // a warden wearing charms and standing under a banner: the busiest unit
  withRun(FF, 'scrap', 9);
  FF.attachCharm(G.run.deck[0], FF.CHARMS.keencharm);
  FF.attachCharm(G.run.deck[0], FF.CHARMS.shellcharm);
  G.run.deck[0].sigil = true;
  FF.startBattle(G, 'boss');
  frame(8); drew('a boss opening — banner, sigil-deployed warden, charms and all');

  G.screen = 'gameover';
  frame(2); drew('the loss screen draws');
  G.screen = 'victory';
  frame(2); drew('the win screen draws');
}

/* -------------------------------------------------------------- overlays -- */
section('overlays');
{
  withRun(FF, 'frost', 77);
  G.screen = 'trail';
  FF.UI.deck = true;
  frame(2); drew('the deck view draws');
  FF.UI.inspect = G.run.deck[0];
  frame(2); drew('an inspected card draws');
  FF.UI.inspect = null;
  FF.UI.deck = false;

  FF.press('campCharm');
  ok(!!FF.UI.choose, 'a chooser opens');
  frame(2); drew('the chooser draws');
  FF.UI.choose = null;

  /* A board with intent on it: the ribbons hang outside the slabs, in a band
     nothing else uses, and every scheme in the game must be able to write its
     own sentence there without the draw falling over. */
  bareBattle(FF, 'frost', 41);
  G.battle.units = G.battle.units.filter((u) => u.leader);
  dummy(FF);
  place(FF, 'p', 'snowpup', 0, 0, { unit: { hp: 20 } });
  place(FF, 'p', 'snowpup', 1, 0, { unit: { hp: 20 } });
  /* One foe per scheme, so the check is that every KIND of telegraph draws —
     and it grows with the game rather than being pinned to a count. */
  const schemers = [['frostwolf', 0, 1], ['drift', 1, 1], ['packmother', 0, 2]];
  const laid = new Set();
  for (const [id, lane, col] of schemers) {
    const f = place(FF, 'e', id, lane, col, { unit: { cnt: 2, cntMax: 2 } });
    FF.layPlot(G, f);
    ok(!!f.plot, id + ' commits to something');
    if (f.plot) laid.add(FF.FOES[id].scheme);
  }
  G.screen = 'battle';
  frame(3); drew('a board with every kind of telegraph on it draws');
  eq(laid.size, Object.keys(FF.SCHEMES).length, 'and every scheme in the game was on it');
}

/* ------------------------------------------------------------ the whole cast */
section('every art recipe survives being drawn');
{
  const ctx = mkCtx(null);
  let thrown = null;
  const all = Object.values(FF.CARDS).concat(Object.values(FF.FOES));
  for (const c of all) {
    if (c.type !== 'unit') continue;
    try { FF.drawCreature(ctx, c.art, 100, 100, 90, { t: 1.3, ph: 2, sq: 0.4, blink: 0.5, flip: true }); }
    catch (e) { thrown = c.id + ': ' + e.message; break; }
  }
  eq(thrown, null, 'every creature in the game draws without throwing');

  // and every trimming, in combination, not just the ones the roster happens to use
  const shapes = ['blob', 'round', 'tall', 'squat', 'small', 'wisp', 'boss'];
  const ears = ['round', 'pointy', 'horns', 'antler', 'antenna', 'shard', 'fin', 'none'];
  const mouths = ['smile', 'grin', 'flat', 'fang', 'wide', 'trap', 'beak', 'bolt', 'beard', 'none'];
  const accs = ['none', 'scarf', 'helm', 'crown', 'lantern', 'kettle', 'gear', 'hammer', 'pike', 'staff', 'cloak'];
  const pats = ['none', 'spots', 'stripes', 'tips', 'shards'];
  const eyes = ['dot', 'big', 'slit'];
  let combos = 0;
  thrown = null;
  outer:
  for (const shape of shapes) for (const e of ears) for (const m of mouths) {
    const acc = accs[combos % accs.length], pat = pats[combos % pats.length], ey = eyes[combos % eyes.length];
    combos++;
    try {
      FF.drawCreature(ctx, { body: '#fff', belly: '#eee', shape, ears: e, mouth: m, acc, pat, eyes: ey,
        patCol: '#123', accCol: '#456', wings: combos % 3 ? null : '#789', evil: combos % 2 },
        60, 60, 70, { t: combos * 0.13 });
    } catch (err) { thrown = [shape, e, m, acc].join('/') + ': ' + err.message; break outer; }
  }
  eq(thrown, null, `all ${combos} recipe combinations draw`);

  for (const c of Object.values(FF.CARDS)) {
    if (c.type !== 'item') continue;
    try { FF.drawItemIcon(ctx, c.art, 50, 50, 40, 0.7); }
    catch (e) { thrown = c.id + ': ' + e.message; break; }
  }
  eq(thrown, null, 'every piece of gear draws its icon');
}

/* --------------------------------------------------------- hit regions --- */
section('what you can see is what you can touch');
{
  withRun(FF, 'hearth', 5);
  FF.enterNode(G, 0);
  frame(2);
  ok(!FF.hits().some((h) => h.id === 'hand'), 'a card still dealing cannot be grabbed');
  frame(20);
  const hits = FF.hits();
  ok(hits.some((h) => h.id === 'hand'), 'once it lands in the fan it is touchable');
  ok(hits.some((h) => h.id === 'bell'), 'the bell is touchable');
  ok(hits.some((h) => h.id === 'slot'), 'empty slots are drop targets');
  ok(hits.some((h) => h.id === 'unit'), 'units are touchable');
  const D = FF.dims();
  for (const h of hits) {
    ok(h.x >= -40 && h.y >= -40 && h.x + h.w <= D.VW + 40 && h.y + h.h <= D.VH + 40,
      'hit region ' + h.id + ' sits on the screen');
  }

  // a card dragged from hand onto a slot puts a warden there
  const handHit = hits.filter((h) => h.id === 'hand');
  const unitCardIdx = G.battle.hand.findIndex((c) => c.type === 'unit');
  if (unitCardIdx >= 0) {
    const src = handHit.find((h) => h.data === unitCardIdx);
    const slot = FF.hits().find((h) => h.id === 'slot');
    const before = FF.playerUnits(G).length;
    FF.onDown(src.x + 10, src.y + 10);
    FF.onMove(slot.x + 40, slot.y + 40);
    FF.onUp(slot.x + 40, slot.y + 40);
    eq(FF.playerUnits(G).length, before + 1, 'dragging a warden from hand to a slot deploys it');
  }

  // a tap picks the card up rather than playing it, and the next tap on a slot
  // puts it down — the whole point being that a phone need not drag at all
  frame(1);
  const h2 = FF.hits().find((h) => h.id === 'hand');
  if (h2) {
    FF.onDown(h2.x + 10, h2.y + 10);
    FF.onUp(h2.x + 11, h2.y + 11);
    ok(!!FF.UI.picked, 'a tap takes the card into your hand');
    frame(1);
    const before = FF.playerUnits(G).length;
    const slot2 = FF.hits().find((h) => h.id === 'slot');
    const isUnit = FF.UI.picked.type === 'unit';
    FF.onDown(slot2.x + 40, slot2.y + 40);
    if (isUnit) {
      eq(FF.playerUnits(G).length, before + 1, 'and a tap on a slot plays it there');
      eq(FF.UI.picked, null, 'putting the card down clears the choice');
    }
    FF.UI.picked = null;
  }

  // holding it still opens it instead
  frame(2);
  const h3 = FF.hits().find((h) => h.id === 'hand');
  if (h3) {
    FF.onDown(h3.x + 10, h3.y + 10);
    for (let i = 0; i < 40; i++) FF.update(1 / 60);
    ok(!!FF.UI.inspect, 'holding a card open reads it');
    FF.UI.inspect = null;
    FF.onUp(h3.x + 10, h3.y + 10);
  }

  // an illegal drop says why rather than doing nothing
  frame(1);
  const hItem = FF.hits().find((h) => h.id === 'hand' && G.battle.hand[h.data] &&
    G.battle.hand[h.data].type === 'item' && FF.CARDS[G.battle.hand[h.data].def].target === 'enemy');
  if (hItem) {
    const mine = FF.hits().find((h) => h.id === 'unit' && h.data.side === 'p');
    FF.onDown(hItem.x + 10, hItem.y + 10);
    FF.onMove(mine.x + 40, mine.y + 40);
    FF.onUp(mine.x + 40, mine.y + 40);
    ok(!!FF.UI.refuse && FF.UI.refuse.text.length > 0, 'a refused drop explains itself');
    FF.UI.refuse = null;
  }
}

/* ------------------------------------------------------------- on a phone -- */
section('the shape of a phone');
{
  // 16:9, 19.5:9 and 20:9 are the three landscape shapes that matter. Every
  // one of them has to place its furniture inside the safe inset, keep every
  // touch target thumb-sized, and never push anything off the stage.
  /* …and three shapes that are actual phones, held sideways, which is what this
     game was built for and what nothing had ever been tested at. The desktop
     sizes above all sit near 1:1 with the stage; a real handset is about half
     that, which is exactly why the touch check never caught anything. */
  const shapes = [[1280, 720], [1560, 720], [1600, 720], [2400, 1080], [1024, 768],
    [667, 375], [844, 390], [653, 280]];
  for (const [w, h] of shapes) {
    FF.setStageWidth(w, h);
    const D = FF.dims();
    ok(D.VW >= 1180 && D.VW <= 1760, `${w}x${h}: the stage stays inside its bounds (${D.VW})`);

    for (const scr of ['title', 'trail', 'battle', 'shop', 'camp', 'event', 'rest', 'shrine', 'reward', 'leader', 'collection', 'victory']) {
      withRun(FF, 'hearth', 3);
      if (scr === 'battle') FF.enterNode(G, 0);
      else if (scr === 'shop') G.ui.shop = FF.rollShop(G);
      else if (scr === 'event') G.ui.event = { def: FF.EVENTS[1] };
      else if (scr === 'reward') G.ui.reward = FF.rollReward(G, 'boss');
      else if (scr === 'leader') G.ui.pick = { tribe: 'frost', winters: ['keen'] };
      else if (scr === 'rest') G.ui.rest = { offer: FF.BLESSINGS.slice(0, 3).map((x) => x.id) };
      G.screen = scr;
      frame(scr === 'battle' ? 22 : 2);
      log.length = 0; FF.render();   // exactly one frame's draws, not twenty-two overlaid
      /* THE UNITS A THUMB WORKS IN.

         This checked `hh.w < 40` for seventeen rounds, in STAGE units — but the
         stage is up to 1760 wide and the phone it is drawn on is 667 CSS pixels
         across, so every target is about half the size this check believed.
         Photographed on real devices for the first time in iteration 24, seven
         controls came in under the 44 CSS pixels both platform guidelines ask
         for, and PASS was twenty-four pixels tall.

         The threshold is in CSS pixels now, converted through the same scale
         the browser uses. Small controls get a forgiving second pass in hitAt,
         so what counts is the effective target rather than the drawn one. */
      const cssPerStage = Math.min(w / D.VW, h / D.VH);
      const reach = (hh) => Math.min(hh.w, hh.h) < FF.TOUCH_MIN ? FF.TOUCH_SLOP * 2 : 0;
      let small = [], off = [], edge = [];
      for (const hh of FF.hits()) {
        const cw = (hh.w + reach(hh)) * cssPerStage, ch = (hh.h + reach(hh)) * cssPerStage;
        if (cw < 40 || ch < 40) small.push(hh.id + ' ' + Math.round(cw) + 'x' + Math.round(ch) + 'css');
        if (hh.x < -2 || hh.x + hh.w > D.VW + 2 || hh.y + hh.h > D.VH + 2) off.push(hh.id);
        // a notch eats the outer inset in landscape, so nothing tappable lives there
        if (hh.x + hh.w < 8 || hh.x > D.VW - 8) edge.push(hh.id);
      }
      /* THE TEXT NOBODY WAS CHECKING.

         The touch check above was rewritten in CSS pixels and found seven
         controls too small to hit. Nothing did the same for TYPE, and the
         phone walk in iteration 25 found the worse half of the same bug: help
         text cut off mid-sentence, card rules stacked on top of each other,
         paired labels overlapping. A text floor fixed the size and then broke
         the layout, because every line step in the file was a hardcoded number
         chosen for the size the text USED to be.

         Two assertions, both in CSS pixels, on every screen and every shape:
         nothing is drawn below the floor, and no two lines in the same column
         are closer together than the taller of them. The second one is what
         catches a step that stopped growing with its text. */
      const texts = log.filter((e) => e[0] === 'fillText' && String(e[1]).trim())
        .map((e) => ({ s: String(e[1]), x: e[2], y: e[3], size: e[4], align: e[5] }));
      const tiny = texts.filter((e) => e.size * cssPerStage < FF.TEXT_MIN_CSS - 0.5)
        .map((e) => JSON.stringify(e.s).slice(0, 18) + '@' + Math.round(e.size * cssPerStage));
      eq([...new Set(tiny)].join(','), '', `${w}x${h} ${scr}: no text below the readable floor`);

      /* THE THIRD THING NOBODY WAS CHECKING.

         Touch was rewritten in CSS pixels and found seven controls too small.
         Type got a floor and a stacking check and found five collisions.
         Nothing had ever asked whether the text could be SEEN — and a game
         painted in dim blues on darker blues is exactly where that goes wrong.

         The stub records what colour every shape was filled in and where, so
         each line of text can be paired with the shape actually under it
         rather than with whatever was drawn most recently. Contrast is the
         real WCAG ratio; the bar is 4.5:1 for body text and 3:1 for large
         text, which is what the guideline says and not a number invented here.

         Deliberately faded things are exempt: a sold-out ware, a locked
         leader, a hint on its way out. Those are drawn under a globalAlpha and
         the alpha is recorded with them. */
      const lum = (hex) => {
        const m2 = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
        if (!m2) return null;
        const n = parseInt(m2[1], 16);
        const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
          const q = v / 255;
          return q <= 0.03928 ? q / 12.92 : Math.pow((q + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
      };
      const ratio = (a2, b2) => {
        const l1 = lum(a2), l2 = lum(b2);
        if (l1 === null || l2 === null) return null;
        return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      };
      const grounds = [];
      const dim = [];
      for (const e of log) {
        if ((e[0] === 'fill' || e[0] === 'fillRect') && e[3] && e[2] > 0.9) {
          grounds.push({ col: e[1], bb: e[3] });
        } else if (e[0] === 'fillText' && String(e[1]).trim() && e[7] > 0.9) {
          // the last opaque shape drawn under this point is the ground it sits on
          let g2 = null;
          for (let i = grounds.length - 1; i >= 0; i--) {
            const b3 = grounds[i].bb;
            if (e[2] >= b3[0] && e[2] <= b3[2] && e[3] >= b3[1] && e[3] <= b3[3]) { g2 = grounds[i]; break; }
          }
          if (!g2) continue;
          const r = ratio(e[6], g2.col);
          const big = e[4] * cssPerStage >= 18;
          if (r !== null && r < (big ? 3 : 4.5)) {
            dim.push(`${e[6]} on ${g2.col} ${r.toFixed(1)}:1 ${JSON.stringify(String(e[1])).slice(0, 18)}`);
          }
        }
      }
      eq([...new Set(dim)].sort().join(' | '), '', `${w}x${h} ${scr}: every line of text can be read off its own background`);

      // a run of lines is a column: same alignment, same x, sorted down the page
      const cols = new Map();
      for (const e of texts) {
        const key = e.align + ':' + Math.round(e.x);
        if (!cols.has(key)) cols.set(key, []);
        cols.get(key).push(e);
      }
      const stacked = [];
      for (const run of cols.values()) {
        run.sort((a, b) => a.y - b.y);
        for (let i = 1; i < run.length; i++) {
          const a = run[i - 1], b = run[i], gap = b.y - a.y, need = Math.max(a.size, b.size);
          /* Only consecutive lines of the SAME size and real length: that is a
             wrapped paragraph, where the step is a number in the source and can
             fall behind the text it is stepping. A heading over a caption, or a
             stat pip under a card, is a different size or a single glyph — those
             are laid out deliberately and are not what this is looking for. */
          if (Math.abs(a.size - b.size) > 0.6 || a.s.length < 3 || b.s.length < 3) continue;
          if (gap > 0.5 && gap < need * 0.78) {
            stacked.push(JSON.stringify(a.s).slice(0, 16) + '/' + JSON.stringify(b.s).slice(0, 16) +
              ' ' + Math.round(gap) + '<' + Math.round(need));
          }
        }
      }
      /* This used to skip 653x280 — a folding phone's cover display — because
         the leader screen could not hold seven winters at a 23-unit text floor.
         Excluding a shape with a note is the right move once and a habit
         twice, so the leader screen was made to measure its own rows instead
         and the exclusion is gone. Every shape in the list is checked for
         everything it is in the list for. */
      eq([...new Set(stacked)].join(' | '), '', `${w}x${h} ${scr}: no two lines drawn on top of each other`);
      log.length = 0;

      eq(small.join(','), '', `${w}x${h} ${scr}: every touch target is thumb-sized`);
      eq(off.join(','), '', `${w}x${h} ${scr}: nothing tappable hangs off the stage`);
      eq(edge.join(','), '', `${w}x${h} ${scr}: nothing tappable hides under a notch`);
    }
  }
  FF.setStageWidth(1280, 720);
}

/* -------------------------------------------------------- long animation -- */
section('the loop stays upright');
{
  withRun(FF, 'scrap', 31);
  FF.enterNode(G, 0);
  let thrown = null;
  try {
    for (let i = 0; i < 400; i++) {
      if (G.screen === 'battle' && !G.battle.busy && !G.battle.over) FF.passTurn(G);
      frame(2);
      if (G.screen !== 'battle') break;
    }
  } catch (e) { thrown = e.message; }
  eq(thrown, null, 'four hundred frames of a fight resolving itself never throw');
  ok(G.screen !== 'battle' || G.battle.turn > 6, 'and the turns actually turn while it draws');

  /* The same fight without the animation budget: a player who does nothing at
     all must still reach an ending rather than sitting in a stalled board — and
     doing nothing must not be a way to win.

     Not the FIRST fight, though. The opening two skirmishes are deliberately
     weak now — walking the guide in order showed a new player's only warden
     dead by the sixth hint, in the fight the game teaches with — so a leader
     left alone can and should see them off. Step four is where the trail starts
     asking. */
  withRun(FF, 'hearth', 31);
  G.run.step = 4;                     // …and the node at step four may be a shop
  FF.startBattle(G, 'fight');
  G.screen = 'battle';
  let turns = 0;
  while (G.screen === 'battle' && !G.battle.over && turns++ < 300) { FF.passTurn(G); FF.drainAll(); }
  ok(G.battle.over, 'a fight nobody plays does eventually end');
  eq(G.battle.won, false, 'badly');
}

done('frostfell-render');
