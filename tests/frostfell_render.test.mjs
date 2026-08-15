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
import { SIZES, SHAPES } from '../tools/frostfell/shapes.mjs';
import { readFileSync } from 'node:fs';

const log = [];
const FF = loadGame({}, log);
const G = FF.G;
FF.setCtx(mkCtx(log));

const frame = (n = 1) => { for (let i = 0; i < n; i++) { FF.update(1 / 60); FF.render(); } };
const drew = (label) => { ok(log.length > 0, label); log.length = 0; };
/* How much of the contrast check's resolution is a guess. Accumulated across
   every screen and every device shape, printed once at the end. */
const CELLS = { total: 0, one: 0, straddle: 0, mixed: 0, anchorBlind: 0 };
/* Stacked pairs with little room left between them — see the margin note in
   the sweep. Collected across every shape and screen, reported at the end. */
const TIGHT = [];
let SHOTS = 0;
/* WHAT FRACTION OF THE GAME'S TEXT THIS CHECK HAS EVER LOOKED AT.

   `button()` drew its label at a fixed size and never fitted it to its own
   button for forty-nine rounds, and the gutter check found it in one run — which
   is a strong argument for pointing the check at things it has not seen, and a
   reason to be suspicious of what it has. The sweep runs 9 shapes x 12 screens
   of ONE seeded run, so what it looks at is whatever that run happened to draw:
   the cards in that hand, the foes on that board, the wares in that shop.

   Every card name, every card's rules text, every foe name and every keyword is
   enumerable from the game's own tables. Counting the distinct strings the
   sweep drew against the strings the game CAN draw turns "probably most of it"
   into a number, and the number is printed whether or not it is flattering. */
const STRINGS = { seen: new Set(), draws: 0 };
const ctx2 = mkCtx(log);
/* A wash is not a ground — the same rule the raster uses. The bbox FALLBACK did
   not have it, so a 16%-opacity tint behind a label was reported as though it
   were solid paint. */
const solidCol = (col) => {
  if (typeof col !== 'string') return false;
  const m = /^rgba?\(([^)]+)\)/.exec(col);
  if (!m) return true;
  const p = m[1].split(',');
  return p.length < 4 || parseFloat(p[3]) > 0.9;
};


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

/* ----------------------------------------------- the recipes themselves --- */
/* TINDERCUB WAS REPORTED IN FOUR CONSECUTIVE CRITIQUES, and three of those
   rounds fixed the wrong half of it. Round 3 deleted the `scarf` primitive and
   the pink thing on the tutorial card's face stayed, because it was never the
   scarf — `mark:'scar'` draws `#c96a72` down the outer edge of the eye, it is
   the only pink chroma in the picture area of any card, and every single
   `evil:1` recipe in the bestiary carries it. Three of the player's own wardens
   were wearing the enemies' tell.
   Two things are asserted here rather than looked at, because looking at it is
   exactly what failed four times: the mark belongs to foes and to nothing else,
   and it is still on foes (a fix that removed it everywhere would pass the
   first half on its own). The recipes are also checked for the dead keys the
   last deletion left behind — a shadowed duplicate draws nothing and reads as
   intent, which is how `acc:'scarf'` survived a round that deleted `scarf`. */
section("the enemies' mark stays the enemies'");
{
  const wearing = (t) => Object.values(t).filter((d) => d.art && d.art.mark === 'scar').map((d) => d.id);
  eq(wearing(FF.CARDS).join(','), '', 'no card the player can own wears the foes’ scar');
  ok(wearing(FF.FOES).length >= 3, `and it is still a foe signature (${wearing(FF.FOES).length} foes wear it)`);
  const evilless = Object.values(FF.FOES).filter((d) => d.art && !d.art.evil).map((d) => d.id);
  eq(evilless.join(','), '', 'every foe recipe is marked evil, so the split above is real');

  /* Nothing may declare a trimming the drawing has no branch for, and nothing
     may declare the same key twice — the second silently wins and the first is
     a corpse that reads like a decision. Both are source-text checks because
     both are invisible once the object literal has been evaluated. */
  const src = readFileSync(new URL('../frostfell/index.html', import.meta.url), 'utf8');
  const dupes = [];
  for (const line of src.split('\n')) {
    if (!/^\s*art: A\(/.test(line)) continue;
    const seen = new Set();
    for (const m of line.matchAll(/([a-zA-Z]+)\s*:/g)) {
      if (seen.has(m[1])) dupes.push(m[1]);
      seen.add(m[1]);
    }
  }
  eq([...new Set(dupes)].join(','), '', 'no art recipe declares the same key twice');
  eq((src.match(/acc: ?'(scarf|band|bellcollar)'/g) || []).join(','), '',
    'and none of them asks for a prop the drawing deleted');
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
  /* Every branch `drawProp` actually has, and only those. `scarf` sat in this
     list for two rounds after the primitive was deleted, so the sweep was
     spending a slot on a prop that draws nothing while `goggles`, `satchel`,
     `plating` and `shield` — all four of them live — were never combined with
     anything. */
  const accs = ['none', 'helm', 'crown', 'lantern', 'kettle', 'gear', 'hammer', 'pike', 'staff',
    'cloak', 'satchel', 'plating', 'shield', 'goggles'];
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

/* -------------------------------------------- the states nobody photographs -- */
section('the palette holds in the states the shot walk never reaches');
{
  /* The contrast check only ever saw frames the shot walk happens to produce,
     and a shot walk photographs a game at rest: nothing mid-death, nothing
     mid-flight, and one creature colour per screen. "The palette holds" was
     therefore a claim about a dozen frames.

     This drives it over the states that never get photographed — every status
     on every tribe's colours, a foe dying, a card in flight, a defeat — and
     asserts the same two things. If it still finds nothing, the palette holds
     for real. */
  const shapes = [[1280, 720], [667, 375]];
  const bad = [];
  const lum = (col) => {
    const str = String(col).trim();
    let rgb = null;
    const m2 = /^#?([0-9a-f]{6})$/i.exec(str);
    if (m2) { const n = parseInt(m2[1], 16); rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
    else { const m3 = /^rgba?\(([-\d.]+)[ ,]+([-\d.]+)[ ,]+([-\d.]+)/i.exec(str); if (m3) rgb = [+m3[1], +m3[2], +m3[3]]; }
    if (!rgb) return null;
    const ch = rgb.map((v) => { const q = v / 255; return q <= 0.03928 ? q / 12.92 : Math.pow((q + 0.055) / 1.055, 2.4); });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  };
  const ratio = (x, y) => {
    const l1 = lum(x), l2 = lum(y);
    if (l1 === null || l2 === null) return null;
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };
  const under = (g4, x, y) => {
    const b3 = g4.bb;
    if (!(x >= b3[0] && x <= b3[2] && y >= b3[1] && y <= b3[3])) return false;
    if (!g4.circ) return true;
    const dx = x - g4.circ[0], dy = y - g4.circ[1];
    return dx * dx + dy * dy <= g4.circ[2] * g4.circ[2];
  };
  const SEEN = { n: 0, p: 0 };
  const scan = (label, cssPerStage) => {
    const grounds = [];
    let stroked = null, lastKey = null, seen = 0, paired = 0;
    for (const e of log) {
      if ((e[0] === 'fill' || e[0] === 'fillRect') && e[3] && e[2] > 0.9 && solidCol(e[1])) grounds.push({ col: e[1], bb: e[3], circ: e[4] });
      else if (e[0] === 'strokeText') { stroked = String(e[1]) === lastKey ? stroked : e[4]; lastKey = String(e[1]); }
      else if (e[0] === 'fillText' && String(e[1]).trim() && e[7] > 0.9) {
        seen++;
        if (e[4] * cssPerStage < FF.TEXT_MIN_CSS - 0.5) {
          bad.push(`${label}: ${JSON.stringify(String(e[1])).slice(0, 14)} at ${Math.round(e[4] * cssPerStage)}css`);
        }
        let g2 = null;
        for (let i = grounds.length - 1; i >= 0; i--) {
          const b3 = grounds[i].bb;
          if (e[2] >= b3[0] && e[2] <= b3[2] && e[3] >= b3[1] && e[3] <= b3[3]) { g2 = grounds[i]; break; }
        }
        const ground = (lastKey === String(e[1]) && stroked) ? stroked : (g2 && g2.col);
        if (!ground) continue;
        paired++;
        const r = ratio(e[6], ground);
        const big = e[4] * cssPerStage >= 18;
        if (r !== null && r < (big ? 3 : 4.5)) {
          bad.push(`${label}: ${e[6]} on ${ground} ${r.toFixed(1)}:1 ${JSON.stringify(String(e[1])).slice(0, 14)}`);
        }
      }
    }
    if (process.env.FF_CONTRAST) console.log(`      ${label}: ${seen} texts, ${paired} on a ground`);
    SEEN.n += seen; SEEN.p += paired;
    log.length = 0;
  };

  for (const [w, h] of shapes) {
    FF.setStageWidth(w, h);
    const cps = Math.min(w / FF.dims().VW, h / FF.dims().VH);

    // every status, on every tribe's palette, all at once
    for (const tribe of ['hearth', 'frost', 'scrap', 'wyrd']) {
      bareBattle(FF, tribe === 'wyrd' ? 'hearth' : tribe, 11);
      const mine = place(FF, 'p', 'snowpup', 0, 0);
      const foe = place(FF, 'e', 'chillfang', 0, 1);
      for (const st of FF.STATUS_ORDER) { FF.addStatus(G, mine, st, 3); FF.addStatus(G, foe, st, 3); }
      G.screen = 'battle';
      frame(2); log.length = 0; FF.render();
      scan(`${w}x${h} ${tribe} every status`, cps);
    }

    // a foe mid-death and a card mid-flight: frames a shot walk never lands on
    bareBattle(FF, 'hearth', 12);
    const doomedFoe = place(FF, 'e', 'chillfang', 0, 1);
    place(FF, 'p', 'snowpup', 0, 0);
    G.screen = 'battle';
    FF.hurt(G, doomedFoe, 999, null);
    for (let i = 0; i < 8; i++) { FF.update(1 / 60); log.length = 0; FF.render(); scan(`${w}x${h} a foe dying`, cps); }

    // the defeat screen, which the shot walk only ever reaches as a victory
    withRun(FF, 'hearth', 13);
    G.run.dead = true;
    G.screen = 'victory';
    frame(2); log.length = 0; FF.render();
    scan(`${w}x${h} a defeat`, cps);
  }
  FF.setStageWidth(1280, 720);
  ok(SEEN.p > 400, `these states actually draw something (${SEEN.p} of ${SEEN.n} texts on a ground)`);
  eq([...new Set(bad)].sort().slice(0, 6).join(' | '), '',
    'the palette holds in mid-death, mid-flight, every status and a defeat');
}

/* ------------------------------------------------------------- on a phone -- */
section('the shape of a phone');
{
  // 16:9, 19.5:9 and 20:9 are the three landscape shapes that matter. Every
  // one of them has to place its furniture inside the safe inset, keep every
  // touch target thumb-sized, and never push anything off the stage.
  /* …and the shapes that are actual phones, held sideways, which is what this
     game was built for and what nothing had ever been tested at. The desktop
     sizes above all sit near 1:1 with the stage; a real handset is about half
     that, which is exactly why the touch check never caught anything.

     THE LIST LIVES IN ONE PLACE NOW, and the reason is the defect this suite
     found last round: a live text overlap on the VICTORY screen at 653x280, a
     shape the shot walk had never once photographed. The stub was checking
     sizes nobody had ever looked at — every failure it finds there is real, and
     every failure it MISSES there is invisible twice over.
     `tools/frostfell/shots.mjs --all` walks the same list now, so a shape
     checked by assertion is also a shape somebody can see. */
  const shapes = SIZES;
  {
    const src = readFileSync(new URL('../tools/frostfell/shots.mjs', import.meta.url), 'utf8');
    ok(/shapes\.mjs/.test(src), 'the shot walk reads the shared shape list, not a copy of it');
    ok(/--all/.test(src), 'and can walk every shape in it in one command');
    const devices = SHAPES.filter((x) => x.phone).length;
    ok(devices >= 4, `and the list carries real devices rather than small windows (${devices})`);
  }
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
      /* EVERY SCREEN AT ITS FULLEST, because empty is the easy case.
         The seals block on the victory screen draws only when a crossing earned
         something, and this sweep never gave it anything — so `SEALS EARNED`
         drawn through `THE FIRST CROSSING` at 653x280 was invisible to nine
         shapes of checks and visible in the first PNG a person opened. The
         geometry of the overlap check was too narrow AND its state was
         narrower; widening one without the other fixes nothing.
         Whatever a screen draws only sometimes, it draws here. */
      if (scr === 'victory') G.run.freshFeats = FF.FEATS.slice(0, 3).map((f) => f.id);
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
      for (const t of texts) STRINGS.seen.add(t.s);
      STRINGS.draws += texts.length;
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
      const lum = (col) => {
        const str = String(col).trim();
        let rgb = null;
        const m2 = /^#?([0-9a-f]{6})$/i.exec(str);
        if (m2) {
          const n = parseInt(m2[1], 16);
          rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
        } else {
          // the text outline is an rgba() and it is the ground for outlined text
          const m3 = /^rgba?\(([-\d.]+)[ ,]+([-\d.]+)[ ,]+([-\d.]+)/i.exec(str);
          if (m3) rgb = [+m3[1], +m3[2], +m3[3]];
        }
        if (!rgb) return null;
        const ch = rgb.map((v) => {
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
      /* A single-arc path is tested as the circle it is, not as its box —
         a creature's body swallows the label under its feet otherwise. */
      const under = (g4, x, y) => {
        const b3 = g4.bb;
        if (!(x >= b3[0] && x <= b3[2] && y >= b3[1] && y <= b3[3])) return false;
        if (!g4.circ) return true;
        const dx = x - g4.circ[0], dy = y - g4.circ[1];
        return dx * dx + dy * dy <= g4.circ[2] * g4.circ[2];
      };
      const grounds = [];
      const dim = [];
      const cellHist = { total: 0, one: 0, straddle: 0, mixed: 0, anchorBlind: 0 };
      let unpaired = 0, paired = 0, stroked = null, lastStrokeKey = null;
      for (const e of log) {
        if ((e[0] === 'fill' || e[0] === 'fillRect') && e[3] && e[2] > 0.9 && solidCol(e[1])) {
          grounds.push({ col: e[1], bb: e[3], circ: e[4] });
        } else if (e[0] === 'strokeText') {
          stroked = String(e[1]) === lastStrokeKey ? stroked : e[4];
          lastStrokeKey = String(e[1]);
        } else if (e[0] === 'fillText' && String(e[1]).trim() && e[7] > 0.9) {
          // the last opaque shape drawn under this point is the ground it sits on
          let g2 = null;
          for (let i = grounds.length - 1; i >= 0; i--) {
            if (under(grounds[i], e[2], e[3])) { g2 = grounds[i]; break; }
          }
          /* EVERY GLYPH IN THIS GAME IS OUTLINED, and that changes the
             question. `txt` strokes a dark rounded outline behind the fill
             unless it is told not to, so an outlined glyph reads as a shape
             against its own outline rather than against whatever is behind it —
             which is why a white name over an orange creature is perfectly
             legible and a naive check called it 2.2:1. For outlined text the
             ground IS the outline. For text drawn with the outline suppressed
             it is whatever was painted underneath. */
          /* THE WORSE OF THE TWO, which is the third time a check here has
             been too generous and the third time tightening it found something.

             An outline gives a glyph its edge, so outlined text was measured
             against its outline and nothing else. That is right for a dark
             ground and wrong for a bright one: pale blue on a near-white snow
             bank has perfect edge definition and still reads badly, because
             edge definition is not figure-ground. Both are now measured and the
             worse one is the answer. */
          /* THE WORSE OF THE TWO, now that the ground is real.

             This was tried last round and reverted, because the ground was
             attributed by bounding box and a creature's box swallows the label
             under its feet. The stub rasterises now — a colour grid every eight
             units, stamped by every fill in draw order — so the ground under a
             glyph is the colour a screen would actually show there. With that
             fixed the rule can be what it should always have been: an outline
             gives a glyph its edge, but edge definition is not figure-ground,
             so BOTH are measured and the worse one is the answer. */
          /* AND THE WORST CELL THE STRING COVERS, not the one its anchor
             happens to sit in.

             The raster is eight units to a cell and a line of body type is
             thirteen tall and tens wide, so nearly every string straddles a
             boundary; reading the anchor's cell is a guess wherever a caption
             is half on a panel and half off it. The stub now hands back every
             distinct ground under the string's box and the worst of them is
             the answer. The distribution is printed under FF_CONTRAST, because
             a check whose resolution is a guess should say how often the guess
             would have mattered. */
          /* A QUARTER OF THE STRING IS THE BAR.

             The band is approximate in both directions, so a ground that shows
             up in one cell out of twenty is a pip on the row above rather than
             the thing the caption is written on. A ground that carries a
             quarter of the string is genuinely half-on-half-off, which is the
             case the anchor lookup could not see. */
          const SHARE = Number(process.env.FF_SHARE || 0.25);
          const outlined = lastStrokeKey === String(e[1]) && stroked;
          const span = e[9] || { cells: 1, cols: [] };
          const real = span.cols.filter((c) => c.share >= SHARE).map((c) => c.col);
          const covered = real.length ? real : [e[8] || (g2 && g2.col)].filter(Boolean);
          cellHist.total++;
          if (span.cells <= 1) cellHist.one++;
          else {
            cellHist.straddle++;
            if (real.length > 1) cellHist.mixed++;
            if (real.length > 1 && real.indexOf(e[8]) < 0) cellHist.anchorBlind++;
          }
          let rGnd = null, g3 = null;
          for (const c of covered) {
            const rc = ratio(e[6], c);
            if (rc !== null && (rGnd === null || rc < rGnd)) { rGnd = rc; g3 = c; }
          }
          const rOut = outlined ? ratio(e[6], stroked) : null;
          if (rOut === null && rGnd === null) { unpaired++; continue; }
          paired++;
          const r = (rOut !== null && rGnd !== null) ? Math.min(rOut, rGnd)
            : (rOut === null ? rGnd : rOut);
          const ground = (rGnd !== null && (rOut === null || rGnd < rOut)) ? g3 : stroked;
          const big = e[4] * cssPerStage >= 18;
          if (r !== null && r < (big ? 3 : 4.5)) {
            dim.push(`${e[6]} on ${ground} ${r.toFixed(1)}:1 ${JSON.stringify(String(e[1])).slice(0, 18)}`);
          }
        }
      }
      eq([...new Set(dim)].sort().join(' | '), '', `${w}x${h} ${scr}: every line of text can be read off its own background`);
      if (process.env.FF_CONTRAST) {
        console.log(`      ${w}x${h} ${scr}: ${paired} paired, ${unpaired} with no ground under them`);
      }
      CELLS.total += cellHist.total; CELLS.one += cellHist.one;
      CELLS.straddle += cellHist.straddle; CELLS.mixed += cellHist.mixed;
      CELLS.anchorBlind += cellHist.anchorBlind;

      // a run of lines is a column: same alignment, same x, sorted down the page
      const cols = new Map();
      for (const e of texts) {
        const key = e.align + ':' + Math.round(e.x);
        if (!cols.has(key)) cols.set(key, []);
        cols.get(key).push(e);
      }
      SHOTS++;
      const stacked = [];
      for (const run of cols.values()) {
        run.sort((a, b) => a.y - b.y);
        for (let i = 1; i < run.length; i++) {
          const a = run[i - 1], b = run[i], gap = b.y - a.y, need = (a.size + b.size) / 2;
          /* MARGIN, NOT JUST COLLISION — because the bug this is chasing arrives
             as a near miss and leaves as an overlap.

             `SEALS EARNED` over `THE FIRST CROSSING` read as a collision in the
             PNG and measured 20 against a 23-unit line: 87%, comfortably past
             the 78% bar below. A binary test cannot catch that class, and
             tightening the bar to catch it would fire on layouts that are fine.
             What separates them is SLACK: a pair at 87% is one longer word or
             one more device from being a defect, and a pair at 130% is not.

             So the tight ones are counted and named at the end rather than
             failed here. 102 of the 160 `txt()` calls in the game carry a
             literal vertical offset, so the question was never "which one is
             broken" — it is "which ones have no room left". */
          if (gap > 0.5 && a.s.length >= 3 && b.s.length >= 3 && gap < need * 1.15) {
            TIGHT.push({ shape: `${w}x${h}`, scr, a: a.s, b: b.s, gap, need });
          }
          /* Only consecutive lines of the SAME size and real length: that is a
             wrapped paragraph, where the step is a number in the source and can
             fall behind the text it is stepping. A heading over a caption, or a
             stat pip under a card, is a different size or a single glyph — those
             are laid out deliberately and are not what this is looking for. */
          if (a.s.length < 3 || b.s.length < 3) continue;
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

      /* AND THE SAME CHECK TURNED NINETY DEGREES, which is the half that was
         missing and the half that broke.

         The stacking check catches a line STEP that stopped growing with its
         text. It cannot catch a BOX that stopped containing it, because that
         failure runs sideways: on the leader screen at phone scale the text
         floor lifted every preview card's name past what `fitText` could shrink
         it to, and the four names were drawn straight through each other —
         `CINDERPUP CINDERPUP KETTLEBEAK` read as one word across three cards.
         Every one of them passed the floor check and the stacking check,
         because each was individually legible and none shared a column.

         Same rule, other axis: two strings drawn on the same baseline may not
         overlap horizontally. The stub reports the advance it measures, so the
         span is known; a shared baseline is what makes them a row. Single
         glyphs are exempt for the same reason they are exempt above — a stat
         pip beside a name is placed deliberately and is not a wrap. */
      const spanOf = (e) => {
        const w2 = e.s.length * e.size * 0.5;
        const left = e.align === 'center' ? e.x - w2 / 2 : e.align === 'right' ? e.x - w2 : e.x;
        return [left, left + w2];
      };
      const rows = new Map();
      for (const e of texts) {
        if (e.s.trim().length < 3) continue;
        const key = Math.round(e.y);
        if (!rows.has(key)) rows.set(key, []);
        rows.get(key).push(e);
      }
      const collided = [];
      for (const row of rows.values()) {
        const sp = row.map((e) => ({ e, s: spanOf(e) })).sort((a, b) => a.s[0] - b.s[0]);
        for (let i = 1; i < sp.length; i++) {
          const a = sp[i - 1], b = sp[i];
          if (Math.abs(a.e.size - b.e.size) > 0.6) continue;
          // a real overlap, not two glyph boxes touching at the kerning
          /* NOT AN OVERLAP — A GUTTER. This began as an overlap check and the
             corrected advance table showed why that was the wrong shape.

             On the fold cover the victory tally read `FIGHTS WON FOES FELLED`
             as one word. With the stub's old `length * size * 0.5` the two had
             a 30-unit gap; with the real advances they have **3 units at
             23-unit type** — 0.13 of the size. So they never overlapped, and an
             overlap check could not have caught them however accurate its
             widths were. What the eye reads as "touching" is a gap too small to
             separate two words, and the threshold for that is a fraction of the
             type size rather than zero.

             A quarter of the size is the bar: at 23 units that asks for 6 and
             the collision had 3. Sub-zero gaps (real overlaps) are reported as
             such, because the two failures want different fixes — an overlap is
             a layout that does not fit, a thin gutter is a layout that fits and
             cannot be read. */
          const gap2 = b.s[0] - a.s[1];
          const need = a.e.size * 0.25;
          if (gap2 < need) {
            collided.push(JSON.stringify(a.e.s).slice(0, 14) + '/' + JSON.stringify(b.e.s).slice(0, 14) +
              (gap2 < 0 ? ' OVERLAP ' + Math.round(-gap2) : ' gutter ' + Math.round(gap2) + '<' + Math.round(need)));
          }
        }
      }
      eq([...new Set(collided)].slice(0, 4).join(' | '), '',
        `${w}x${h} ${scr}: every two labels on one line keep a readable gutter`);
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

/* WHAT THE EIGHT-UNIT CELL COSTS, said out loud rather than assumed away.

   The raster's resolution is the one thing about this check that is a
   compromise, and for two rounds it went unstated. Every string is now measured
   against every ground its box covers, so the number that matters is how many
   strings cross a boundary at all and how many of those cross a real COLOUR
   boundary — the ones an anchor-only lookup would have had to guess about. */
/* ------------------------------------- every card, not the ones that landed -- */
/* POINT THE CHECK AT WHAT IT HAS NOT SEEN.

   `button()` never fitted its label to its own button for forty-nine rounds and
   the gutter check found it the first time it ran — which says the check is
   good and its aim is narrow. It sweeps one seeded run, so the cards it examines
   are the cards that run happened to deal: 75% of the names and rules the game
   can draw, and the missing quarter is exactly the long-tailed stuff a lucky
   run never turns up.

   Every card is enumerable. Each one is drawn at both sizes it is ever drawn at
   — the hand and the reward row — and put through the same two rules the screen
   sweep uses: nothing below the readable floor, and no two labels on one line
   without a gutter. It is the whole pool rather than a sample, at the two sizes
   that matter, on the smallest shape the game supports, which is where a name
   runs out of band. */
section('every card in the game, drawn and measured');
{
  const bad2 = [];
  /* AT BOTH SHAPES, and the second one is why the coverage figure was wrong.
     653x280 is where the layout is under pressure; 1280x720 is where the game
     actually draws everything it has. Sweeping only the tight one meant the
     rules lines the card DELIBERATELY drops on a fold were counted as text the
     check had failed to look at. */
  const SIZE = [[92, 150, 'in hand'], [126, 196, 'on the reward row']];
  let drawn = 0;
  for (const [w2, h2, where, stage] of SIZE.flatMap((z) => [z.concat([[653, 280]]), z.concat([[1280, 720]])])) {
    FF.setStageWidth(stage[0], stage[1]);                 // the tightest shape, where the floor bites hardest
    const D = FF.dims();
    const cps = Math.min(stage[0] / D.VW, stage[1] / D.VH);
    /* LEADERS INCLUDED, which is why the count was 98% and not 100%. The one
       paragraph nothing ever drew was a leader's — skipped here because a
       leader is not dealt into a hand, and reaching the screen sweep only for
       whichever tribe that seeded run happened to pick. But a leader IS drawn
       as a card, in the deck view, so `drawCard` is a real path for it and
       excluding it was the sweep being narrow rather than the game being
       unable to show it. */
    for (const def of Object.values(FF.CARDS)) {
      log.length = 0;
      FF.drawCard(ctx2, FF.mkCard(def.id), 40, 40, w2, h2, { t: 0.4 });
      drawn++;
      const ts = log.filter((e) => e[0] === 'fillText' && String(e[1]).trim())
        .map((e) => ({ s: String(e[1]), x: e[2], y: e[3], size: e[4], align: e[5] }));
      for (const t of ts) STRINGS.seen.add(t.s);
      /* A MOOD LINE NEVER GOES ON THE FACE. Snowpup's "Plain and willing." was
         drawn in the rules well in the same ink at the same size as Springjaw's
         "Smackback.", which is a real keyword, so the one card in the game with
         no effect looked like the one card whose effect you had not learnt yet.
         `flav` exists for this and only the inspect panel reads it; asserting it
         here is what stops the next mood line being typed into `text`. */
      if (def.flav) for (const t of ts) {
        if (t.s.indexOf(def.flav.slice(0, 14)) >= 0) bad2.push(`${def.id} ${where}: flavour drawn on the face`);
      }
      /* The other half of the same rule, and the half with teeth: the well only
         opens for a card that DOES something. A card with no keyword, no hook,
         no effect and no scheme has no rule to print, so anything in its `text`
         is mood by definition — which is how "Plain and willing." came to be set
         in the same ink at the same size as "Smackback." */
      if (def.text && !Object.keys(def.kw || {}).length && !def.hooks && !def.effect && !def.scheme) {
        bad2.push(`${def.id}: "${def.text}" is mood, not a rule — it belongs in flav`);
      }
      for (const t of ts) {
        if (t.size * cps < FF.TEXT_MIN_CSS - 0.5) {
          bad2.push(`${def.id} ${where}: ${JSON.stringify(t.s).slice(0, 14)} at ${Math.round(t.size * cps)}css`);
        }
        /* AND NOTHING ON A CARD FACE IS EVER A FRAGMENT.

           A rule is shown WHOLE or NOT AT ALL, and a name shrinks or wraps but
           never truncates. That invariant has now been approximated twice by a
           heuristic — "does a line hold two words", then "does half the
           paragraph survive" — and both shipped green while putting `Ember 4
           o…`, `On deploy, heals eve…` and `SWIFT CHAR…` in front of a player,
           because a sheet at 300 units wide never floors any type and the
           heuristics only misfire once the floor bites. So it is asserted here
           rather than aimed at: an ellipsis drawn by `drawCard` at any shape
           this game supports is a failure, full stop. */
        if (t.s.indexOf('…') >= 0) {
          bad2.push(`${def.id} ${where}: fragment ${JSON.stringify(t.s).slice(0, 24)}`);
        }
      }
      const rows2 = new Map();
      for (const t of ts) {
        if (t.s.trim().length < 3) continue;
        const key = Math.round(t.y);
        if (!rows2.has(key)) rows2.set(key, []);
        rows2.get(key).push(t);
      }
      for (const row of rows2.values()) {
        const sp = row.map((t) => {
          const ww = t.s.length * t.size * 0.5;
          const left = t.align === 'center' ? t.x - ww / 2 : t.align === 'right' ? t.x - ww : t.x;
          return { t, s: [left, left + ww] };
        }).sort((a, b) => a.s[0] - b.s[0]);
        for (let i = 1; i < sp.length; i++) {
          const a = sp[i - 1], b = sp[i];
          if (Math.abs(a.t.size - b.t.size) > 0.6) continue;
          if (b.s[0] - a.s[1] < a.t.size * 0.25) {
            bad2.push(`${def.id} ${where}: ${JSON.stringify(a.t.s).slice(0, 12)}/${JSON.stringify(b.t.s).slice(0, 12)}`);
          }
        }
      }
    }
  }
  FF.setStageWidth(1280, 720);
  log.length = 0;
  ok(drawn >= 100, `every card drawn at both sizes (${drawn} draws)`);
  eq([...new Set(bad2)].slice(0, 5).join(' | '), '',
    'every card in the pool keeps its text readable and its labels apart');

  /* AND NO CENTRED LINE HOLDS ONE WORD IT DID NOT HAVE TO. A greedy wrap in a
     narrow well gave BLASTCAP `Deal 6 to a / foe and 3 to / its / neighbours.` —
     a whole line of the card spent on three letters, centred, which reads as a
     fault rather than as a break. `wrapText` now makes one backward pass, and
     the invariant it establishes is checkable without re-implementing it: no
     line may be a lone word while the line above it has a word to SPARE — three
     or more, so feeding one does not just move the widow up a line — and the
     pair would still fit. Swept over every rules string in the game at every
     width a well is ever set to, so a rewrite of the wrap cannot lose it. */
  const widows = [];
  for (const def of Object.values(FF.CARDS)) {
    const s2 = String(def.text || '');
    if (!s2) continue;
    for (let mw = 40; mw <= 170; mw += 6) {
      const lines2 = FF.wrapText(ctx2, s2, 9, mw);
      for (let i = 1; i < lines2.length; i++) {
        const prev = lines2[i - 1].split(' ');
        if (/[ \u00a0]/.test(lines2[i]) || prev.length < 3) continue;
        const merged = prev[prev.length - 1] + ' ' + lines2[i];
        if (ctx2.measureText(merged).width <= mw) widows.push(`${def.id}@${mw}: "${lines2[i]}"`);
      }
    }
  }
  eq([...new Set(widows)].slice(0, 4).join(' | '), '', 'no rules line is a widow that could have been fed');
}

/* --------------------------------------------------- the aperture is a die -- */
/* WHAT THIS CATCHES, AND WHY NOTHING ELSE COULD.

   For three rounds the art window took whatever the rules well left over, so it
   was a different height on every card and no two cards in a hand shared
   proportions — a 3.6x range across the pool at reward size, 6x in one row on a
   handset, and at a reward pick the card with the LEAST to say ended up with the
   biggest picture. Every check in this file passed the whole time, because the
   defect is a property of a ROW: each card on its own is fine and it is only
   putting four of them side by side that shows it. So it is asserted as a row
   property here.

   Two statements, and the second is the one with teeth:

     ONE DIE PER SIZE   two cards drawn at the same size whose names set to the
                        same number of lines get the identical window. The band
                        is the only thing allowed to move it, and the band moves
                        it by pushing the whole stack down, not by resizing it.
     THE RULES DO NOT   the same card drawn with a one-word rule and with the
     TOUCH IT           deepest paragraph in the game gets the identical window.
                        This is the invariant that was actually broken; it holds
                        no matter what else moves.

   Plus the SUBJECT: `fitArt` solved against `min(height, width)`, which is not a
   size at all — it is whichever limit the drawing's proportions hit first — so a
   wide animal came out small in a big empty sky. Measured drawn area ran 14% to
   60% of the window, 4.2x. It is normalised on area now and the spread is held
   here so it cannot drift back. */
section('the aperture is a die');
{
  const badD = [];
  /* Longer than anything in the pool, so if the well ever starts buying room
     off the picture again this is the card that shows it. */
  const LOUD = 'Whenever a foe is Frosted it gains one attack, and until your next turn '
    + 'denying a scheme mends the whole line four on the spot.';
  const r2 = (n) => Math.round(n * 100) / 100;
  let sizes = 0;
  for (const [sw, sh] of SIZES) {
    FF.setStageWidth(sw, sh);
    for (const [w2, h2] of [[92, 150], [126, 196], [132, 176]]) {
      const byBand = new Map();
      const areas = [];
      sizes++;
      for (const def of Object.values(FF.CARDS)) {
        FF.drawCard(ctx2, FF.mkCard(def.id), 40, 40, w2, h2, { t: 0.4 });
        const quiet = { ...FF.CARD_DIE };
        areas.push(quiet.area);
        const loud = FF.mkCard(def.id);
        loud.text = LOUD;
        FF.drawCard(ctx2, loud, 40, 40, w2, h2, { t: 0.4 });
        const said = FF.CARD_DIE;
        if (r2(quiet.ay) !== r2(said.ay) || r2(quiet.ah) !== r2(said.ah)) {
          badD.push(`${def.id} ${w2}x${h2}@${sw}: rules move the window `
            + `${r2(quiet.ay)}+${r2(quiet.ah)} -> ${r2(said.ay)}+${r2(said.ah)}`);
        }
        const key = r2(quiet.band);
        const die = `${r2(quiet.ax)},${r2(quiet.ay)},${r2(quiet.aw)},${r2(quiet.ah)}`;
        if (!byBand.has(key)) byBand.set(key, [die, def.id]);
        else if (byBand.get(key)[0] !== die) {
          badD.push(`${def.id} ${w2}x${h2}@${sw}: ${die} but ${byBand.get(key)[1]} got ${byBand.get(key)[0]}`);
        }
      }
      /* And the spread of drawn subject area, at the shapes where the window is
         not a letterbox. A wide animal and a tall one have to read as the same
         size; past a fold the window is 2.5:1 and a tall subject cannot fill it
         however it is solved, which is geometry rather than a defect. */
      if (sw >= 1024) {
        const lo = Math.min(...areas), hi = Math.max(...areas);
        if (hi / lo > 4) badD.push(`${w2}x${h2}@${sw}: subject area spread x${(hi / lo).toFixed(2)}`);
      }
    }
  }
  /* The headline, stated where it is unconditional: at the reference desktop
     every card in the game gets the same rectangle, full stop. */
  FF.setStageWidth(1280, 720);
  const one = new Set();
  for (const def of Object.values(FF.CARDS)) {
    FF.drawCard(ctx2, FF.mkCard(def.id), 40, 40, 126, 168, { t: 0.4 });
    one.add(`${r2(FF.CARD_DIE.ax)},${r2(FF.CARD_DIE.ay)},${r2(FF.CARD_DIE.aw)},${r2(FF.CARD_DIE.ah)}`);
  }
  log.length = 0;
  ok(sizes >= 27, `the die checked at every shape and card size (${sizes})`);
  eq(one.size, 1, 'one aperture for the whole set at the reference desktop');
  eq([...new Set(badD)].slice(0, 4).join(' | '), '',
    'the window is the same die on every card, and no paragraph moves it');
}

/* ---------------------------------------------- the light in the window -- */
/* A CAST SHADOW IS A CLAIM, AND TWO ROUNDS GOT IT WRONG IN OPPOSITE DIRECTIONS.
   Round 2 gave every unit an ellipse as wide as its bounding box, which put a
   neat oval under a tail. Round 3 read that as "half the gear does not touch
   the ground" and withheld the patch from ALL gear — so grounded objects lost
   their contact while diagonal ones kept hanging in the air, which is the worst
   of the three answers available.
   The answer is neither exception: MEASURE the contact. `penBox` records what
   each drawing paints in the bottom eighth of itself, and the cast is sized off
   that. These three checks are what stop either mistake growing back. */
section('the light in the window');
{
  const boxes = [];
  for (const def of Object.values(FF.CARDS)) {
    if (def.type === 'unit' && def.art) boxes.push([def.id, FF.creatureBox(def.art)]);
    else if (def.art) boxes.push([def.id, FF.itemBox(def.art)]);
  }
  ok(boxes.length > 40, `every art recipe measured (${boxes.length})`);
  const badFoot = [];
  for (const [id, b] of boxes) {
    if (!(b[4] < b[5])) { badFoot.push(id + ': no footprint'); continue; }
    // the contact can never be wider than the drawing that makes it
    if (b[4] < b[0] - 1e-6 || b[5] > b[2] + 1e-6) badFoot.push(id + ': footprint outside the box');
  }
  eq(badFoot.slice(0, 4).join(' | '), '',
    'every drawing reports a contact patch, and it lies inside its own outline');

  /* THE ONE THAT MATTERS. Icepick is the object the last round argued from: it
     is drawn on a diagonal, so the width of its box is nowhere near the width
     of what is in the snow. If these two ever come back equal, the shadow has
     gone back to being the bounding box and Icepick is standing on a plinth it
     does not touch. */
  const ip = FF.itemBox(FF.CARDS.icepick.art);
  ok((ip[5] - ip[4]) < (ip[2] - ip[0]) * 0.72,
    `a diagonal object's contact is narrower than its box (icepick ${((ip[5] - ip[4]) / (ip[2] - ip[0])).toFixed(2)} of it)`);

  /* AND THE CREATURE'S OWN GROUND DISC STAYS OUT OF THE CARD. It is a flat
     black ellipse drawn BELOW the feet and inside the measured box, so while it
     was in there the window solved every subject's position against a box whose
     bottom was a shadow — the cast stood on the snow and the animal stood a
     fifth of a body above it, under two shadows that did not agree. The board
     and the collection have no snow of their own and keep it; the card passes
     `flat`, and so does the measurement, or the feet stop matching the box. */
  const art0 = FF.CARDS.cinderpup.art;
  log.length = 0;
  FF.drawCreature(ctx2, art0, 200, 200, 100, { t: 0 });
  const withDisc = log.filter((e) => e[0] === 'fill' && e[1] === '#000').length;
  log.length = 0;
  FF.drawCreature(ctx2, art0, 200, 200, 100, { t: 0, flat: 1 });
  const flatDisc = log.filter((e) => e[0] === 'fill' && e[1] === '#000').length;
  log.length = 0;
  ok(withDisc >= 1, 'off the card a creature still draws its own ground disc');
  eq(flatDisc, 0, 'and `flat` takes it away, so the window casts the only shadow');
}

/* ------------------------------------ every foe, on the board and inspected -- */
/* THE NAMED GAP, CLOSED. Drawing every card took name coverage as far as cards
   go and left 73% overall, and the missing quarter was named honestly: foes the
   seeded run never met. A run meets maybe a dozen of them; the game has dozens,
   and the ones a lucky run never turns up are exactly the ones nothing has
   looked at since they were written.

   Every foe is placed on a real board, given a scheme to telegraph, drawn as a
   slab and drawn again in the inspect panel, at the tightest shape — the three
   places a foe's name and rules are ever put on screen. Same two rules as
   everywhere else: nothing below the readable floor, no two labels on a line
   without a gutter. */
section('every foe in the game, on the board and inspected');
{
  const bad3 = [];
  let seen3 = 0;
  FF.setStageWidth(653, 280);
  const D3 = FF.dims();
  const cps3 = Math.min(653 / D3.VW, 280 / D3.VH);
  /* ON THE STAGE ONLY, and the count of what that skips is printed rather than
     quietly dropped. Driving foes onto synthetic boards leaves overlay state
     from earlier sections behind, and one of those overlays lists several unit
     names at a single off-stage anchor — three names at x=-16 reported as three
     collisions, which is an artefact of the harness rather than anything a
     player could see. A legibility rule is about what is readable ON SCREEN;
     text outside the stage is a different defect and the hit checks already
     cover things that hang off it.

     The HAND is out of scope here for the same reason and it is worth saying
     which: this section exists to check FOES, and the hand is drawn in every
     one of these renders while already carrying two checks of its own — the
     screen sweep looks at it on 9 shapes from a real run, and the per-card
     section draws every card in the pool at both sizes. A third look at it from
     a synthetic board adds no coverage and reports the harness's own state. */
  let skipped3 = 0;
  const check3 = (label, want) => {
    const all3 = log.filter((e) => e[0] === 'fillText' && String(e[1]).trim());
    const ts = all3.filter((e) => e[2] > 0 && e[2] < D3.VW && e[3] > 0 && e[3] < D3.VH * 0.74)
      .map((e) => ({ s: String(e[1]), x: e[2], y: e[3], size: e[4], align: e[5] }));
    skipped3 += all3.length - ts.length;
    /* AND THE SLAB SAYS THE WHOLE NAME.

       Every slab on the board truncated on every handset — `SNOWLU…`, `BRAM…`,
       `AR…` — and the code carried a comment explaining that the readable floor
       exceeds what the shrink loop can reach, which is true and is not a reason
       to cut the one thing on a slab you cannot get anywhere else. The name
       wraps now, hyphenated the way the card band wraps, so this joins the drawn
       lines back up (dropping the break marks) and asks whether the name is
       still in there. Checked at 653x280, the shape where the floor bites hardest
       and where all four of those truncations were photographed.

       Measured on EVERY string the frame drew rather than the on-stage subset
       the gutter check uses: this asks WHAT was written, not where it landed,
       and a synthetic board can leave a unit mid-tween at the origin. */
    if (want) {
      const joined = all3.map((e) => String(e[1])).join('').replace(/[-\s]+/g, '');
      if (joined.indexOf(want.toUpperCase().replace(/\s+/g, '')) < 0) {
        bad3.push(`${label}: name cut — no ${JSON.stringify(want.toUpperCase())}`);
      }
    }
    for (const t of ts) STRINGS.seen.add(t.s);
    for (const t of ts) {
      if (t.size * cps3 < FF.TEXT_MIN_CSS - 0.5) {
        bad3.push(`${label}: ${JSON.stringify(t.s).slice(0, 14)} at ${Math.round(t.size * cps3)}css`);
      }
    }
    const rows3 = new Map();
    for (const t of ts) {
      if (t.s.trim().length < 3) continue;
      const k3 = Math.round(t.y);
      if (!rows3.has(k3)) rows3.set(k3, []);
      rows3.get(k3).push(t);
    }
    for (const row of rows3.values()) {
      const sp = row.map((t) => {
        const ww = t.s.length * t.size * 0.5;
        const left = t.align === 'center' ? t.x - ww / 2 : t.align === 'right' ? t.x - ww : t.x;
        return { t, s: [left, left + ww] };
      }).sort((a, b) => a.s[0] - b.s[0]);
      for (let i = 1; i < sp.length; i++) {
        const a = sp[i - 1], b = sp[i];
        if (Math.abs(a.t.size - b.t.size) > 0.6) continue;
        if (b.s[0] - a.s[1] < a.t.size * 0.25) {
          bad3.push(`${label}: ${JSON.stringify(a.t.s).slice(0, 12)}/${JSON.stringify(b.t.s).slice(0, 12)}`);
        }
      }
    }
    log.length = 0;
  };
  for (const id of Object.keys(FF.FOES)) {
    bareBattle(FF, 'hearth', 5);
    G.battle.units = G.battle.units.filter((u) => u.leader);
    place(FF, 'p', 'snowpup', 0, 0, { unit: { hp: 20 } });
    let foe = null;
    try { foe = place(FF, 'e', id, 0, 1, { unit: { cnt: 2, cntMax: 2 } }); } catch { foe = null; }
    if (!foe) continue;
    seen3++;
    try { FF.layPlot(G, foe); } catch { /* not every foe schemes */ }
    G.screen = 'battle';
    frame(2); log.length = 0; FF.render();
    check3(id + ' on the board', foe.name);
    FF.UI.inspect = foe;
    frame(1); log.length = 0; FF.render();
    check3(id + ' inspected');
    FF.UI.inspect = null;
  }
  FF.setStageWidth(1280, 720);
  log.length = 0;
  ok(seen3 >= 20, `every foe drawn on a board and inspected (${seen3}, ${skipped3} off-stage strings skipped)`);
  eq([...new Set(bad3)].slice(0, 5).join(' | '), '',
    'every foe in the game keeps its text readable and its labels apart');
}

/* AND THE COVERAGE NUMBER, printed whether or not it is flattering.

   The sweep looks at 9 shapes x 12 screens of ONE seeded run, so the strings it
   examines are whatever that run drew. Everything the game CAN put on screen is
   enumerable from its own tables — every card name, every card's rules text,
   every foe name, every status and keyword — so the share is a number rather
   than an impression. It is asserted at a deliberately low bar: the point is
   that the figure is VISIBLE and moves when somebody widens the sweep, not that
   it is high today. A check that cannot say what it looks at is a check nobody
   can reason about. */
{
  /* NAMES AND RULES ARE COUNTED SEPARATELY, because they are drawn differently
     and lumping them made the figure meaningless. A name is drawn whole, so it
     either appeared or it did not; a rules paragraph is WRAPPED, so it never
     appears as one string and any test for it is a test of the wrap. Reporting
     one number over both made "every card is drawn" move coverage from 75% to
     77%, which reads as the widening having failed when what it actually did
     was take names to everything the game has. */
  const names = new Set();
  for (const c of Object.values(FF.CARDS)) names.add(String(c.name).toUpperCase());
  for (const f of Object.values(FF.FOES)) names.add(String(f.name).toUpperCase());
  const words = new Set();
  for (const s2 of STRINGS.seen) for (const w2 of String(s2).split(/[^A-Za-z]+/)) if (w2) words.add(w2.toLowerCase());
  let hitN = 0;
  for (const want of names) if (STRINGS.seen.has(want)) hitN++;
  // a rules text counts as looked at when every word in it was drawn somewhere
  const texts = [...new Set(Object.values(FF.CARDS).map((c) => c.text).filter(Boolean))];
  let hitT = 0;
  for (const t of texts) {
    const ws = String(t).split(/[^A-Za-z]+/).filter(Boolean).map((x) => x.toLowerCase());
    if (ws.length && ws.every((x) => words.has(x))) hitT++;
  }
  const shareN = hitN / Math.max(1, names.size);
  console.log(`  · what the text checks actually look at: ${STRINGS.draws} draws, ` +
    `${STRINGS.seen.size} distinct strings`);
  console.log(`    names ${hitN}/${names.size} (${(shareN * 100).toFixed(0)}%) · ` +
    `rules paragraphs ${hitT}/${texts.length} (${((hitT / Math.max(1, texts.length)) * 100).toFixed(0)}%) ` +
    `— every card at both sizes on both a desktop and a fold, every foe on a board and inspected`);
  /* TWO DIFFERENT NUMBERS THAT WERE BEING REPORTED AS ONE.

     This read 68% for a round and was filed as a coverage gap. It was not: the
     card DELIBERATELY drops its rules line on a fold, where the type cannot be
     read at any size, so a third of the paragraphs were never drawn there — and
     a check that only swept the tight shape counted the game's own decision as
     its own failure. Sweeping the desktop too takes it to 98%.

     So the two are separated, because only one of them is ever a bug: what the
     check LOOKS AT should be everything the game draws, and what the game
     CHOOSES NOT TO DRAW is a design decision that belongs in the record rather
     than in a coverage figure. */
  console.log(`    (and separately: on a fold the card drops its rules line on purpose — ` +
    `${texts.length} paragraphs the game chooses not to draw there, which is a decision, not a gap)`);
  ok(names.size > 60, `the catalogue is the game's own tables (${names.size} names)`);
  ok(shareN > 0.55, `and the sweep sees a stated share of it (${(shareN * 100).toFixed(0)}% of names)`);
}
if (CELLS.total) {
  const pc = (n) => Math.round((n / CELLS.total) * 100) + '%';
  console.log(`  · ${CELLS.total} strings measured against the raster: ` +
    `${CELLS.one} (${pc(CELLS.one)}) sit inside a single 8-unit cell, ` +
    `${CELLS.straddle} (${pc(CELLS.straddle)}) straddle, and of those ` +
    `${CELLS.mixed} (${pc(CELLS.mixed)}) cross two or more distinct grounds`);
  console.log(`    the check takes the WORST ground a string covers, not the anchor's — ` +
    `on ${CELLS.anchorBlind} of them the anchor's cell is not even one of the grounds under the text`);
  ok(CELLS.mixed <= CELLS.straddle, 'a mixed string is a straddling string');
}

/* WHAT IS LEFT OF THE MARGINS, reported rather than asserted.

   The five text defects the fold turned up were one bug wearing five hats:
   `textSize` clamps type up to a 9px floor while the gaps around it keep
   scaling by `S`, so a literal offset measured on a desktop runs out at 653x280.
   The grep says 102 of the game's 160 `txt()` calls carry a literal vertical
   offset — far too many to audit one at a time, and most of them are single
   lines with nothing under them and no way to fail.

   This is the audit that scales: every stacked pair the sweep draws, on every
   shape, ranked by how much room is left. Anything under 1.0 is already
   touching its neighbour's em box; anything under 1.15 survives on the current
   strings and would not survive a longer one. */
{
  TIGHT.sort((a, b) => a.gap / a.need - b.gap / b.need);
  const worst = TIGHT.filter((x) => x.gap / x.need < 1.0);
  console.log(`  · ${TIGHT.length} stacked pairs with under 15% of slack, ` +
    `${worst.length} with none — of ${SHOTS} shape-screens swept`);
  for (const x of (process.env.FF_TIGHT ? TIGHT : TIGHT.slice(0, 6))) {
    console.log(`      ${(x.gap / x.need * 100).toFixed(0)}%  ${x.shape} ${x.scr}  ` +
      `${JSON.stringify(x.a).slice(0, 22)} / ${JSON.stringify(x.b).slice(0, 22)}`);
  }
  ok(TIGHT.every((x) => x.gap >= x.need * 0.78), 'and none of them is an actual collision');
}

/* WHERE A LONG NAME BREAKS, PINNED — because the fold check cannot see it.

   The coverage sweep asks whether a name is DRAWN WHOLE, and by that measure
   `SNO` / `WPUP` and `SNOW` / `PUP` are identical: nothing is cut, both fit, 86
   of 86. Only a person opening the PNG can tell that one of them is a word. So
   a round shipped `CINDE` / `RPUP`, `KETTL` / `EBEAK` and `WHETS` / `TONE` with
   every check green, and the first attempt to fix it made two of the four worse
   in a way the same green checks did not notice.

   The rule is mechanical even though "reads well" is not: the second piece has
   to be able to START a word, which in English means consonant-then-vowel. That
   is worth an example table rather than a property — a property restating the
   implementation proves only that the code is the code, whereas these four
   names are the actual cases, and any of them regressing is the defect. */
{
  /* A flat metric on purpose: the question is WHERE the cut lands given a width,
     not what the typeface measures, and a monospace stub makes the expected
     answers readable instead of font-dependent. */
  const cc = { font: '', measureText: (s) => ({ width: s.length * 7 }) };
  /* BELLROPE and COLDSNAP joined the list after the fold walk: `BELLRO` / `PE`
     is what "take the latest seam that fits" does to a name whose seam is early,
     and it is the case that retired that rule for "nearest to balanced". */
  const CASES = [['CINDERPUP', 'CINDER'], ['KETTLEBEAK', 'KETTLE'],
    ['SNOWPUP', 'SNOW'], ['WHETSTONE', 'WHETS'],
    ['BELLROPE', 'BELL'], ['COLDSNAP', 'COLDS']];
  /* THE HEAD NOW ENDS IN A HYPHEN, and this expectation was updated rather
     than worked around because the OLD expectation encoded the defect: the
     comment beside the split has always claimed "a book does this", and a book
     hyphenates. `WHETS` over `TONE` is the proof — two English words that mean
     nothing together. The head has to carry the mark inside its own width, so
     the box each case is measured against grew by exactly one glyph; none of
     the six seams moved when it did. */
  for (const [nm, head] of CASES) {
    const p = FF.nameSplit(cc, nm, 14, (head.length + 1) * 7 + 3, 2);
    eq(p.length, 2, `${nm} breaks in two`);
    eq(p[0], head + '-', `${nm} breaks at the compound seam, hyphenated`);
    eq(p[0].slice(0, -1) + p[1], nm, `${nm} loses nothing to the break`);
  }
  console.log(`  · ${CASES.length} compound names break where a word can start ` +
    `(${CASES.map(([n2, h]) => h + '-|' + n2.slice(h.length)).join(' ')})`);
}

/* ------------------------------------- the tribe channel, off the card --- */
/* WHAT THIS SECTION EXISTS TO STOP COMING BACK.

   Five metals and five skies were built over three rounds inside `drawCard`,
   and the three surfaces that are NOT `drawCard` — the collection grid, the
   board slab, the leader panel — each hard-coded one navy and knew nothing
   about any of it. Sixty-one identical slate tiles, every friendly slab the
   same blue, every foe slab the same red. Nothing failed, because nothing
   asked. So this asks.

   A paint spy rather than the raster: `panel`, `skyGrad` and `snowGrad` put
   their colours into GRADIENT STOPS, which the recording ctx throws away, and
   the strokes it logs do not carry their style. Recording every string that
   reaches `fillStyle`, `strokeStyle` or `addColorStop` is the only place all
   three surfaces' materials are visible at once. */
section('the tribe channel reaches past the card face');
{
  const paintSpy = () => {
    const seen = new Set();
    const base = mkCtx(null);
    const note = (v) => { if (typeof v === 'string') seen.add(v.toLowerCase()); };
    const grad = { addColorStop: (_p, col) => note(col) };
    const c = new Proxy({}, {
      get(_t, k) {
        if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => grad;
        return base[k];
      },
      set(_t, k, v) { if (k === 'fillStyle' || k === 'strokeStyle') note(v); base[k] = v; return true; },
    });
    return { c, seen, has: (col) => seen.has(String(col).toLowerCase()) };
  };
  const MAT = FF.FRAME_MAT, WTH = FF.WEATHER;
  const TRIBED = ['hearth', 'frost', 'scrap', 'none'];

  // THE COLLECTION. 61 tiles, and every metal in the game has to be among them.
  {
    const sp = paintSpy();
    FF.G.screen = 'collection';
    FF.UI.collectPage = 0;
    FF.drawCollection(sp.c, 0);
    for (const k of TRIBED) {
      ok(sp.has(MAT[k].cap), `the collection tile wears ${k} metal`);
      ok(sp.has(WTH[k].horiz), `and ${k}'s own horizon behind the creature`);
    }
    const caps = new Set(TRIBED.map((k) => MAT[k].cap.toLowerCase()));
    ok([...caps].filter((cp) => sp.has(cp)).length >= 4,
      'the grid is not one slate — at least four metals on one page');
  }

  // THE BOARD SLAB. A warden carries its tribe onto the board; a foe does not
  // carry the caravan's.
  {
    const b = bareBattle(FF, 'hearth', 41);
    b.units.length = 0;
    const cases = [['cinderpup', 'p', 'hearth'], ['rimefox', 'p', 'frost'],
      ['clunkbot', 'p', 'scrap'], ['snowpup', 'p', 'none'], ['frostwolf', 'e', 'foe']];
    cases.forEach(([id, side, key], i) => {
      const u = place(FF, side, id, i % 2, 0);
      u.px = 300; u.py = 200;
      const sp = paintSpy();
      FF.drawUnit(sp.c, u, 0);
      ok(sp.has(MAT[key].cap), `a ${key} slab is edged in ${key} metal`);
      ok(sp.has(WTH[key].near), `and stands on ${key} ground`);
      for (const other of TRIBED.concat('foe')) {
        if (other === key) continue;
        ok(!sp.has(MAT[other].cap), `and wears no ${other} metal`);
      }
      b.units.length = 0;
    });
  }

  /* THE COUNTER IS THE CARD'S PLAQUE. It was a grey disc pinned to the slab's
     corner while the same number was the middle of three pills on the card an
     inch below — one value, two shapes, two colours. `#cfe0f5` was that disc's
     idle ink and it is the thing to watch for: if it comes back on a slab, so
     has the re-encode. */
  {
    const b = bareBattle(FF, 'hearth', 42);
    b.units.length = 0;
    const u = place(FF, 'p', 'cinderpup', 0, 0, { unit: { cnt: 1 } });
    u.px = 300; u.py = 200;
    const slab = paintSpy();
    FF.drawUnit(slab.c, u, 0);
    const card = paintSpy();
    FF.drawCard(card.c, FF.mkCard('cinderpup'), 0, 0, 126, 168, { t: 0 });
    for (const pill of ['#ff8b7a', '#ffd166', '#7de08f']) {
      ok(slab.has(pill), `the slab sets the same ${pill} plaque the card does`);
      ok(card.has(pill), `and the card still sets ${pill}`);
    }
    ok(!slab.has('#cfe0f5'), 'and no grey disc is left holding the counter');
  }

  // THE LEADER PANEL. The one screen you pick a whole run on, and the creature
  // stood on flat navy with no window at all.
  for (const tb of ['hearth', 'frost', 'scrap', 'wyrd']) {
    const sp = paintSpy();
    FF.G.ui.pick = { tribe: tb, winters: [], course: tb };
    FF.drawLeaderPick(sp.c, 0);
    const key = tb;
    ok(sp.has(MAT[key].mid), `the ${tb} leader panel is cut from ${tb} metal`);
    const wk = WTH[key] ? key : 'none';
    ok(sp.has(WTH[wk].horiz), `and the leader stands in a window, not on a slab (${tb})`);
  }
}

/* ---------------------- untribed is not frost, and foes are not untribed -- */
section('untribed, the enemy, and the two worlds they used to share');
{
  const MAT = FF.FRAME_MAT, WTH = FF.WEATHER;
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const dist = (a, b) => {
    const p = rgb(a), q = rgb(b);
    return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  };

  /* UNTRIBED WORE FROST'S FRAME OVER ITS OWN GREY SKY for a whole round: the
     window left the blue family and the metal did not, so on the gear sheet
     THORN OIL and HUSH were the same object. Blue cast is the tell — a neutral
     grey has no more blue in it than red. */
  for (const part of ['top', 'mid', 'cap']) {
    const [r, , b2] = rgb(MAT.none[part]);
    ok(b2 <= r + 6, `untribed ${part} has no blue cast (${MAT.none[part]})`);
  }
  ok(dist(MAT.none.cap, MAT.frost.cap) > 60, 'untribed metal is nowhere near frost metal');
  ok(dist(MAT.none.face[0], MAT.frost.face[0]) > 20, 'and neither is its card stock');

  /* AND THE FOES USED TO RENDER IN THAT SAME UNTRIBED METAL UNDER THAT SAME
     UNTRIBED OVERCAST, because a foe card is built with `tribe: null`. Cards
     you want and cards that kill you were the same object. */
  eq(FF.tribeKey(FF.mkFoeCard('frostwolf', 1)), 'foe', 'a beast belongs to the fell');
  eq(FF.tribeKey(FF.mkCard('snowpup')), 'none', 'and an unaligned warden does not');
  eq(FF.tribeKey(FF.mkCard('cinderpup')), 'hearth', 'and a Hearthkin is Hearthkin');
  /* Told apart by CHROMA rather than by value, because that is the difference
     that is actually there: grey iron and bruised rose sit at the same weight
     on the bar — which is the point, they are the same dark metal — and what
     separates them is that one of them is a colour and the other is the absence
     of one. A straight RGB distance would pass this pair at 48 and read as a
     weak margin; the spread between a metal's channels is unambiguous. */
  const chroma = (h) => { const p = rgb(h); return Math.max(...p) - Math.min(...p); };
  ok(chroma(MAT.foe.cap) > 40, 'the enemy metal is a colour');
  ok(chroma(MAT.none.cap) < 20, 'and the neutral metal is not one');
  ok(dist(MAT.foe.cap, MAT.none.cap) > 40, 'so the two are not the same bar');
  ok(dist(WTH.foe.mid, WTH.none.mid) > 60, 'nor standing in their weather');

  // and no two worlds in the game collide with each other
  const keys = Object.keys(MAT);
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      ok(dist(MAT[keys[i]].cap, MAT[keys[j]].cap) > 40,
        `${keys[i]} and ${keys[j]} are told apart by their metal`);
    }
  }
  const wk = Object.keys(WTH);
  for (let i = 0; i < wk.length; i++) {
    for (let j = i + 1; j < wk.length; j++) {
      ok(dist(WTH[wk[i]].mid, WTH[wk[j]].mid) > 40,
        `${wk[i]} and ${wk[j]} are told apart by their sky`);
    }
  }
  console.log(`  · ${keys.length} metals and ${wk.length} skies, none of them each other`);
}

done('frostfell-render');
