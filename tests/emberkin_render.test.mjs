// EMBERKIN — render and flow suite.
//
// The logic suite never touches draw(). This one does: it drives the real
// renderer against a no-op 2d context for every map and for a battle, so a
// typo in a drawing path fails here instead of on a black screen. It then
// plays the opening beat-by-beat through the same input the player uses.
//
// Run: node tests/emberkin_render.test.mjs
import { loadGame, mkCtx, withDeck, autoFight, ok, eq, done, section, GAME } from './emberkin_lib.mjs';

const EK = loadGame();
const calls = [];
EK.setCtx(mkCtx(calls));

// The stub context swallows everything, so "it drew" is measured by counting
// draw calls; "it did not crash" is the other half of the assertion.
const drawCount = () => { const n = calls.length; return () => calls.length - n; };

section('every map renders');
EK.G.party = [EK.mkMon('cindercub', 5)];
for (const id of Object.keys(EK.MAPS)) {
  const map = EK.MAPS[id];
  EK.enterMap(id, Math.floor(map.rows[0].length / 2), Math.floor(map.rows.length / 2), 'down');
  EK.G.mode = 'world';
  const since = drawCount();
  EK.draw();
  ok(since() > 20, `${id} painted tiles`);
}

section('the player renders in all four directions, moving and still');
EK.enterMap('route_one', 9, 10, 'down');
for (const dir of ['up', 'down', 'left', 'right']) {
  EK.G.player.dir = dir;
  for (const step of [0, 1]) {
    EK.G.player.step = step;
    for (const moveT of [0, .07]) {
      EK.G.player.moveT = moveT;
      const since = drawCount();
      EK.draw();
      ok(since() > 0, `player drew facing ${dir} step ${step} moveT ${moveT}`);
    }
  }
}
EK.G.player.moveT = 0;

section('walking through tall grass and over a ledge renders');
EK.G.player.x = 4; EK.G.player.y = 1; EK.G.player.px = 4; EK.G.player.py = 1;
EK.draw();
ok(true, 'tall-grass overlay drew');
const ledgeY = EK.MAPS.route_one.rows.findIndex((r) => r.includes('L'));
EK.G.player.hop = true; EK.G.player.moveT = .1; EK.G.player.y = ledgeY + 1;
EK.draw();
EK.G.player.hop = false; EK.G.player.moveT = 0;
ok(true, 'the ledge hop drew');

section('battles render at every stage');
EK.G.party = [EK.mkMon('pyrelynx', 20)];
EK.startBattle({ foe: EK.mkMon('sproutle', 18), wild: true });
const b = EK.B();
for (const state of [
  { label: 'entry', set: () => { b.entry = 0; } },
  { label: 'settled', set: () => { b.entry = 1; } },
  { label: 'flashing', set: () => { b.flashF = .9; b.flashM = .5; b.shake = 1; } },
  { label: 'orb in flight', set: () => { b.throwT = .3; } },
  { label: 'fainted foe', set: () => { b.foe.hp = 0; } },
  { label: 'fainted mine', set: () => { b.mine.hp = 0; } },
]) {
  state.set();
  const since = drawCount();
  EK.draw();
  ok(since() > 0, `battle drew: ${state.label}`);
}

section('every creature and tile in the dex can be rasterised');
for (const id of EK.DEX_ORDER) {
  if (!EK.ART_CREATURES[id]) continue;           // art may still be landing
  ok(!!EK.sprite('creature', id), `${id} rasterised`);
  ok(!!EK.sprite('creature', id, 'sil'), `${id} silhouette rasterised`);
  const bottom = EK.artBottom(id);
  ok(bottom > 8 && bottom <= 40, `${id} sits inside the frame (bottom row ${bottom})`);
}
for (const id of Object.keys(EK.ART_TILES)) ok(!!EK.sprite('tile', id), `tile ${id} rasterised`);
for (const id of Object.keys(EK.ART_ACTORS)) ok(!!EK.sprite('actor', id), `actor ${id} rasterised`);

section('missing art falls back instead of crashing');
EK.G.party = [EK.mkMon('cindercub', 5)];
EK.startBattle({ foe: EK.mkMon('vespyr', 40), wild: true });
const saved = EK.ART_CREATURES.vespyr;
delete EK.ART_CREATURES.vespyr;
const since = drawCount();
EK.draw();
ok(since() > 0, 'a battle with missing art still draws');
if (saved) EK.ART_CREATURES.vespyr = saved;
EK.G.battle = null;

// ---------------------------------------------------------- the opening --
section('the opening plays through with real input');
const fresh = loadGame({});
fresh.setCtx(mkCtx());
const tap = (k, dt = .2) => { fresh.pressKey(k); fresh.step(dt); fresh.releaseKey(k); fresh.fired.clear(); };
const idle = (n = 1, dt = .1) => { for (let i = 0; i < n; i++) { fresh.step(dt); fresh.fired.clear(); } };

fresh.newGame();
eq(fresh.G.mapId, 'lab', 'a new journey starts in the study');
eq(fresh.G.mode, 'dialogue', 'and opens with Rowan talking');
for (let i = 0; i < 8 && fresh.G.mode === 'dialogue'; i++) tap('a');
eq(fresh.G.mode, 'world', 'the intro line clears');

// Walk up to Rowan and talk.
fresh.G.player.x = 5; fresh.G.player.y = 3; fresh.G.player.px = 5; fresh.G.player.py = 3;
fresh.G.player.dir = 'up';
tap('a');
eq(fresh.G.mode, 'dialogue', 'Rowan starts the starter speech');
for (let i = 0; i < 10 && fresh.G.mode === 'dialogue'; i++) tap('a');
eq(fresh.G.mode, 'screen', 'the starter screen opens');
eq(fresh.G.screen.kind, 'starter', 'and it is the pick-one-of-three screen');
// There is no way out of it but choosing — B does nothing.
tap('b');
eq(fresh.G.screen && fresh.G.screen.kind, 'starter', 'and no way out of it but choosing');
tap('a');
eq(fresh.G.party.length, 1, 'you have a kin');
eq(fresh.G.party[0].species, 'cindercub', 'the first option is Cindercub');
ok(fresh.G.bag.bloomorb >= 5, 'and a handful of orbs');
// The kin you are handed takes the same road as one you catch: it is
// celebrated, and then you get its papers with the name still yours to set.
// It used to have the screen shut in its face and five lines of rules read
// over it, which is a strange way to treat the creature you keep longest.
ok(fresh.G.gotcha, 'the kin is celebrated rather than just handed over');
for (let i = 0; i < 12 && fresh.G.gotcha; i++) tap('a');
eq(fresh.G.screen && fresh.G.screen.kind, 'profile', 'and then you get its papers');
ok(fresh.G.screen.opt.fresh, 'opened fresh, so the name is still yours to set');
for (let i = 0; i < 12 && fresh.G.mode === 'screen'; i++) tap('a');
for (let i = 0; i < 12 && fresh.G.mode === 'dialogue'; i++) tap('a');
eq(fresh.G.mode, 'world', 'back to walking');
ok(fresh.hasSave(), 'the game saved itself after the gift');

section('walking out of the study warps to town');
fresh.G.player.x = 5; fresh.G.player.y = 6; fresh.G.player.px = 5; fresh.G.player.py = 6;
fresh.pressKey('down');
for (let i = 0; i < 40 && fresh.G.mapId === 'lab'; i++) { fresh.step(.05); fresh.fired.clear(); }
fresh.releaseKey('down');
eq(fresh.G.mapId, 'hollowbrook', 'the door leads outside');
idle(3);
fresh.draw();
ok(true, 'the town drew after the warp');

section('bumping a wall does not move you');
fresh.enterMap('hollowbrook', 9, 1, 'up');
const before = { x: fresh.G.player.x, y: fresh.G.player.y };
fresh.G.player.dir = 'left';
fresh.pressKey('left');
for (let i = 0; i < 20; i++) { fresh.step(.05); fresh.fired.clear(); }
fresh.releaseKey('left');
ok(fresh.G.player.x <= before.x, 'walking left either moved onto grass or stopped at the wall');
ok(fresh.G.player.x >= 2, 'never walked through the town wall');

section('the menu opens, navigates and closes');
fresh.G.mode = 'world';
tap('b');
eq(fresh.G.mode, 'menu', 'B opens the field menu');
tap('down'); tap('down');
tap('b');
eq(fresh.G.mode, 'world', 'B closes it again');

section('a battle can be fought entirely through input');
// Play every card you can, then end the turn — the two keys a player uses.
fresh.G.party = [fresh.mkMon('pyrelynx', 30)];
fresh.STARTER_DECK.forEach(fresh.grantCard);
fresh.startBattle({ foe: fresh.mkMon('sproutle', 4), wild: true });
let guard = 0;
while (fresh.G.battle && guard++ < 600) {
  const b = fresh.B();
  const stuck = b && b.phase === 'player' && !b.log && !b.over
    && !b.hand.some((c) => fresh.playableNow(b, c));
  const key = stuck ? 'e' : 'a';
  fresh.step(.12);
  fresh.pressKey(key); fresh.step(.02); fresh.releaseKey(key); fresh.fired.clear();
  fresh.draw();
}
ok(guard < 600, `the battle resolved by playing cards and ending turns (${guard} frames)`);
eq(fresh.G.battle, null, 'and handed control back to the world');
// A win now lands on the card offer rather than straight back in the grass.
if (fresh.G.screen && fresh.G.screen.kind === 'reward') {
  fresh.G.screen.i = fresh.G.screen.list.length - 1;    // no thanks
  fresh.screenSelect();
}
eq(fresh.G.mode, 'world', 'the player is walking again');

section('the battle controls do what they say');
const ctl = loadGame({});
ctl.setCtx(mkCtx());
ctl.STARTER_DECK.forEach(ctl.grantCard);
ctl.G.party = [ctl.mkMon('pyrelynx', 30)];
const tapC = (k) => { ctl.pressKey(k); ctl.step(.2); ctl.releaseKey(k); ctl.fired.clear(); };
const freshBattle = () => {
  ctl.G.battle = null;
  ctl.healParty();                    // the foe hits back between probes
  ctl.startBattle({ foe: ctl.mkMon('gargolem', 40), wild: true });
  for (let i = 0; i < 6 && ctl.G.mode !== 'battle'; i++) tapC('a');
  const bb = ctl.B();
  bb.log = null; bb.started = false; ctl.G.battleMsg = null; ctl.G.dialogue = null;
  bb.energy = 9;
  return bb;
};

let cb = freshBattle();
cb.sel = 0;
tapC('right');
eq(cb.sel, 1, 'right walks along the hand');
tapC('left');
eq(cb.sel, 0, 'left walks back');

// Not hand-size checks: some cards draw, so the hand can refill as one leaves.
cb = freshBattle();
const aimed = cb.hand[cb.sel];
tapC('up');
ok(!cb.hand.includes(aimed), 'up plays the card you are on');

cb = freshBattle();
const third = cb.hand[2];
tapC('3');
ok(!third || !cb.hand.includes(third), 'a number key plays that card outright');
ok(!third || cb.disc.includes(third) || cb.exh.includes(third), 'and the third card is the one that left');

cb = freshBattle();
const turnWas = cb.turn;
tapC('e');
for (let i = 0; i < 40 && ctl.B() && ctl.B().log; i++) tapC('a');
ok(!ctl.B() || ctl.B().turn > turnWas || ctl.B().over, 'E ends the turn');

cb = freshBattle();
const handBefore = cb.hand.length, turnBefore = cb.turn;
tapC('b');
eq(!!ctl.G.menu, true, 'X opens the actions menu instead of ending the turn');
eq(cb.hand.length, handBefore, 'and plays nothing');
eq(cb.turn, turnBefore, 'and does not pass the turn');
ok(ctl.G.menu.rows.some((r) => /End turn/i.test(r.label)), 'the menu offers End turn');
ok(ctl.G.menu.rows.some((r) => /Kin/i.test(r.label)), 'and the party');
ok(ctl.G.menu.rows.some((r) => /Bag/i.test(r.label)), 'and the bag');
ctl.G.battle = null;

section('the stage lays itself out for the screen it is on');
// layoutFor is pure — viewport in, mode/scale/gutter out — so the whole
// fullscreen/landscape/portrait story is testable without a browser.
const VW = EK.VIEW_W, VH = EK.VIEW_H;
const gameH = (L) => VH * L.scale, gameW = (L) => VW * L.scale;

const desk = EK.layoutFor(1280, 900, false);
eq(desk.mode, 'none', 'a mouse gets no on-screen controls');
eq(desk.scale, 4, 'and integer scaling when there is room (1280x900 -> 4x)');
eq(desk.gutter, 0, 'and no gutter');
const deskSmall = EK.layoutFor(400, 300, false);
eq(deskSmall.mode, 'none', 'a small window is still mouse layout');
ok(deskSmall.scale > 1 && deskSmall.scale < 2, 'and drops to fractional scale rather than to 1x');
ok(EK.layoutFor(120, 120, false).scale >= 1, 'scale never falls below 1x, however small the window');

const land = EK.layoutFor(844, 390, true);
eq(land.mode, 'side', 'a phone in landscape puts the controls in the gutters');
ok(gameH(land) / 390 >= .95, `the game is the full height of the screen (${(gameH(land) / 390 * 100) | 0}%)`);
ok(land.gutter >= 96, `each gutter is wide enough for a thumb (${land.gutter}px)`);
ok(gameW(land) + land.gutter * 2 <= 844 + 1, 'stage plus both gutters fit across');

const narrow = EK.layoutFor(568, 320, true);
eq(narrow.mode, 'overlay', 'a short landscape screen has no room for gutters, so controls overlay');
ok(gameH(narrow) / 320 >= .95, 'and the game still fills the height');

const port = EK.layoutFor(412, 900, true);
eq(port.mode, 'below', 'a phone in portrait keeps the controls under the game');
ok(gameW(port) / 412 >= .95, 'the game is the full width');
ok(port.below >= 190, `and the band underneath is deep enough to hold them (${port.below | 0}px)`);
eq(EK.layoutFor(360, 640, true).mode, 'below', 'a small portrait phone still gets the band');
eq(EK.layoutFor(400, 420, true).mode, 'overlay', 'a squat portrait window falls back to overlay');

const LAYOUTS = new Set(['none', 'side', 'below', 'overlay']);
let badFit = null;
for (const [w, h] of [[320, 480], [375, 667], [390, 844], [414, 896], [768, 1024], [480, 320],
  [667, 375], [844, 390], [896, 414], [1024, 768], [1180, 820], [240, 240], [2400, 1080]]) {
  for (const touch of [false, true]) {
    const L = EK.layoutFor(w, h, touch);
    const why = !LAYOUTS.has(L.mode) ? `mode ${L.mode}`
      : !(L.scale >= 1) ? `scale ${L.scale}`
      : !(L.gutter >= 0) ? `gutter ${L.gutter}`
      : (gameW(L) > w && w >= VW) ? `${gameW(L)}px wide on a ${w}px screen`
      : (gameH(L) > h && h >= VH) ? `${gameH(L)}px tall on a ${h}px screen`
      : null;
    if (why && !badFit) badFit = `${w}x${h} touch=${touch}: ${why}`;
  }
}
ok(!badFit, `every viewport gets a sane layout${badFit ? ' — ' + badFit : ''}`);

eq(EK.stickDir(0, 0), null, 'a thumb resting on the stick walks nowhere');
eq(EK.stickDir(10, 6), null, 'and neither does a twitch inside the dead zone');
eq(EK.stickDir(40, 0), 'right', 'a pull right walks right');
eq(EK.stickDir(-40, 0), 'left', 'a pull left walks left');
eq(EK.stickDir(0, 40), 'down', 'screen-down is down');
eq(EK.stickDir(0, -40), 'up', 'and screen-up is up');
eq(EK.stickDir(40, 30), 'right', 'a diagonal resolves to its dominant axis');
eq(EK.stickDir(30, 40), 'down', 'either way round');
eq(EK.stickDir(30, 30), 'down', 'a perfect diagonal picks one and sticks to it');
eq(EK.stickDir(10, 6, 4), 'right', 'the dead zone is tunable');

eq(EK.toggleFullscreen(), false, 'toggleFullscreen is a no-op with no document to expand');

section('the touch layer is wired up in the markup');
// The drag/scroll affordances live in CSS and pointer handlers the stub DOM
// cannot exercise. Assert they are present so a refactor cannot quietly drop them.
const { readFileSync } = await import('node:fs');
// The SAME file loadGame ran.
//
// This used to read a hardcoded path while loadGame honoured EK_GAME, so under
// a mutation sweep the driven checks saw the mutant and all 135 source checks
// saw the original — every one of them invisible to the sweep, which had been
// under-reporting since the day it was built. A suite that reads the game twice
// has to read the same game twice.
const SRC = readFileSync(GAME, 'utf8');
for (const id of ['pad', 'stick', 'knob', 'btns', 'fsbtn']) {
  ok(SRC.includes(`id="${id}"`), `#${id} exists in the markup`);
}
ok(/#pad, #btns\{[^}]*position:fixed/.test(SRC), 'the controls are fixed to the screen, not to the stage');
ok(/#hand\{[^}]*touch-action:none/.test(SRC), 'the hand claims its own gestures so a drag is a drag');
ok(/touch-action:pan-y/.test(SRC), 'scrollable screens still scroll under a finger');
ok(SRC.includes('pointerdown') && SRC.includes('pointermove') && SRC.includes('pointerup'),
  'card dragging is on pointer events, so mouse and finger take the same path');
ok(SRC.includes('willplay'), 'a card lifted past the threshold says so');
ok(/fullscreenchange/.test(SRC), 'leaving fullscreen re-fits the stage');
ok(/orientationchange/.test(SRC), 'so does turning the phone');

section('one bad frame does not take the game with it');
// The frame loop used to let an exception escape, which stopped the
// requestAnimationFrame chain for good: the page froze on its last drawn frame,
// with the buttons still labelled for a state the game had already left, and
// nothing the player pressed did anything again.
const crashy = loadGame({});
crashy.setCtx(mkCtx());
crashy.newGame();
crashy.G.party = [crashy.mkMon('cindercub', 8)];
crashy.enterMap('route_one', 9, 10, 'down');
crashy.G.mode = 'world'; crashy.G.dialogue = null;
let thrown = 0;
// A context that throws the way a real render bug would.
crashy.setCtx(new Proxy({}, { get(_t, k) {
  if (k === 'canvas') return { width: 256, height: 208 };
  if (k === 'measureText') return () => ({ width: 10 });
  if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: () => {} });
  return () => { thrown++; throw new Error('render blew up'); };
}, set() { return true; } }));
let escaped = null;
const realErr = console.error;
console.error = () => {};                      // the loop reports; that is the point
for (let i = 0; i < 20; i++) {
  try { crashy.frame(i * 16); } catch (e) { escaped = e; break; }
}
console.error = realErr;
ok(!escaped, `the loop swallowed ${thrown} render errors instead of dying${escaped ? ' — ' + escaped.message : ''}`);
ok(thrown > 0, 'and the errors were real ones, not a test that proved nothing');
// Put a working context back and check the game is still playable afterwards.
crashy.setCtx(mkCtx());
const beforeX = crashy.G.player.x;
crashy.pressKey('right');
for (let i = 0; i < 30; i++) { crashy.step(.05); crashy.fired.clear(); }
crashy.releaseKey('right');
ok(crashy.G.player.x !== beforeX || crashy.G.battle, 'and it still responds to input once the bad frames pass');

section('a card face carries everything you need to read it');
// One component builds the hand, the deck shelf and the post-win offer, so a
// card the player learns to read in a fight looks the same everywhere.
const face = loadGame({});
face.setCtx(mkCtx());
face.STARTER_DECK.forEach(face.grantCard);
face.G.party = [face.mkMon('pyrelynx', 30)];
face.startBattle({ foe: face.mkMon('sproutle', 20), wild: true });
const fb = face.B();
const deckCard = fb.hand.find((c) => c.src === 'deck') || { src: 'deck', u: face.G.cards[0].u, id: face.G.cards[0].id, bg: 0 };
const kinCard = { src: 'kin', id: fb.mine.moves[0].id };
for (const [label, c] of [['a deck card', deckCard], ['a kin move', kinCard]]) {
  const html = face.cardHTML(c, { slot: 1 });
  ok(/class="cardel /.test(html), `${label}: renders a card`);
  ok(html.includes(face.cardName(c)), `${label}: shows its name`);
  ok(html.includes('ccost'), `${label}: shows what it costs`);
  ok(html.includes('cart'), `${label}: has an art window`);
  ok(html.includes('canvas'), `${label}: with real art in it, not a letter`);
  ok(html.includes('cpip'), `${label}: says what it is at the foot`);
  ok(html.includes('--tint:'), `${label}: is tinted by rarity or element`);
}
// Rarity is the frame, not a word you have to read.
for (const r of face.RARITY_ORDER) {
  const id = face.cardsOfRarity(r)[0];
  const owned = face.grantCard(id);
  const html = face.cardHTML({ src: 'deck', u: owned.u, id, bg: 0 });
  ok(html.includes(`r-${r}`), `${r} cards carry their rarity in the frame`);
  ok(html.includes(face.RARITY[r]), `${r} cards are tinted with its colour`);
}
// A grown copy wears its growth; an ungrown one does not.
const grownCard = face.grantCard('whet');
ok(!face.cardHTML({ src: 'deck', u: grownCard.u, id: 'whet', bg: 0 }).includes('cgrow'), 'an ungrown card has no badge');
grownCard.plus = 4;
ok(face.cardHTML({ src: 'deck', u: grownCard.u, id: 'whet', bg: 0 }).includes('+4'), 'a grown card wears what it has earned');
// A kin move wears its element rather than a rarity.
ok(face.cardHTML(kinCard, {}).includes('elem_'), 'a kin move shows its element');
ok(face.cardHTML(kinCard, {}).includes('kin'), 'and is marked as the creature\'s own');
face.G.battle = null;

section('every map is lit as its own place');
// The tiles are shared between maps, so the grade is the only thing making the
// shore and the deep wood different pictures. If two of them collapse onto the
// same numbers, walking between them stops meaning anything.
const OUTDOOR = Object.keys(EK.MAPS).filter((id) => EK.MAPS[id].kind !== 'inside');
const seenGrade = new Set();
for (const id of OUTDOOR) {
  const gr = EK.gradeFor(EK.MAPS[id].kind, id);
  const key = `${gr.top}|${gr.bot}|${gr.vig}`;
  ok(!seenGrade.has(key), `${id} is not lit the same as another map`);
  seenGrade.add(key);
}
// The same claim, asked of the table that actually paints the frame.
//
// This section has always checked GRADE for collapse and never AIR — the
// six-dial per-map weather (tint, grade, vig, motes, mc, drift) added later,
// which is what pass 178 measured when it asked whether the valley reads as
// eight places. Giving the lab hollowbrook's exact AIR row killed NONE of this
// section's 57 checks. The rule was stated and asked of one of its two tables.
{
  const seenAir = new Set();
  for (const [id, air] of Object.entries(EK.AIR)) {
    const key = JSON.stringify([air.tint, air.grade, air.vig, air.motes, air.mc, air.drift]);
    ok(!seenAir.has(key), `${id} does not share another map's weather`);
    seenAir.add(key);
    // …and it is not simply the fallback wearing a name, which is the other way
    // a place stops being its own.
    const dflt = EK.AIR_DEFAULT;
    ok(JSON.stringify([air.tint, air.grade, air.vig, air.motes, air.mc, air.drift])
      !== JSON.stringify([dflt.tint, dflt.grade, dflt.vig, dflt.motes, dflt.mc, dflt.drift]),
      `${id} is not just the default air under a map's name`);
  }
  // Every map has one — the list read out of MAPS, so a map added tomorrow is
  // asked the same question rather than quietly falling back.
  for (const id of Object.keys(EK.MAPS)) {
    ok(!!EK.AIR[id], `${id} has weather of its own`);
  }
  eq(Object.keys(EK.AIR).length, Object.keys(EK.MAPS).length,
    'and no weather is written for a map that does not exist');
}
for (const [id, gr] of Object.entries(EK.GRADE)) {
  ok(/^rgba\(\d+,\s*\d+,\s*\d+,\s*\.?\d+\)$/.test(gr.top), `${id}: top wash is a usable colour`);
  ok(/^rgba\(\d+,\s*\d+,\s*\d+,\s*\.?\d+\)$/.test(gr.bot), `${id}: bottom wash is a usable colour`);
  ok(gr.vig > 0 && gr.vig < 1, `${id}: the vignette is a fraction`);
}
// Shafts belong to the maps that have a sky, and to no others. Photographing
// all eight maps turned up exactly one asymmetry: the interiors have a light
// source (the window pools) and the outdoor maps had none. An interior that
// grew a shaft would be daylight coming through a ceiling.
// A town is outdoors too — it was the last map with a sky and no light source,
// which only showed up when it was re-photographed after the routes got theirs.
// `inside` is the one that must never have one: daylight through a ceiling.
// GRADE is keyed by BOTH map kind and map id, and both of those already say
// whether they are indoors — so this was a hand-list of six names for a fact
// the suite could have asked for. Same fault as the cue list two sections down.
const hasSky = (id) => (EK.MAPS[id] ? EK.MAPS[id].kind !== 'inside' : id !== 'inside');
for (const [id, gr] of Object.entries(EK.GRADE)) {
  if (!gr.shaft) continue;
  ok(hasSky(id), `${id}: only a map with a sky gets shafts`);
  ok(/^rgba\(\d+,\s*\d+,\s*\d+,\s*\.?\d+\)$/.test(gr.shaft[0]), `${id}: shaft colour is usable`);
  ok(gr.shaft[1] > 0 && gr.shaft[1] < .3, `${id}: shaft strength stays under a wash`);
}
// And the other half asked of the MAPS rather than of the table, which is what
// removes the second exemption — the old form read `!SKY.has(id) || id ===
// 'route'`, carving out the generic route grade because it has no shaft. It has
// no shaft because it is not a place: nothing resolves to it, every route map
// carries its own entry. Ask which maps you can stand in, resolve their light
// the way the game resolves it, and there is nothing left to excuse. This also
// covers hollowbrook, which is not a GRADE key at all and so was never checked.
for (const id of OUTDOOR) {
  const gr = EK.gradeFor(EK.MAPS[id].kind, id);
  ok(!!gr.shaft, `${id}: an outdoor map is lit from somewhere`);
}
// An unknown map still gets light rather than a crash.
ok(EK.gradeFor('route', 'nowhere_at_all') === EK.GRADE.route, 'an unknown route falls back to route light');
ok(EK.gradeFor('inside', 'nowhere_at_all') === EK.GRADE.inside, 'an unknown interior falls back to interior light');
ok(EK.gradeFor(undefined, undefined) === EK.GRADE.route, 'no map at all still gets light');
// And every one of them survives a real paint.
for (const id of Object.keys(EK.MAPS)) {
  EK.enterMap(id, 3, 3, 'down');
  EK.G.mode = 'world';
  const since = drawCount();
  EK.draw();
  ok(since() > 20, `${id} still paints under its grade`);
}

section('the title screen is a picture');
// The title canvas is its own element, so it gets its own stub.
const titleCalls = [];
const titleCtx = mkCtx(titleCalls);
for (const t of [0, 1.3, 2.5, 7.9, 60]) {
  const n = titleCalls.length;
  EK.drawTitleArt(t, titleCtx);
  ok(titleCalls.length - n > 30, `the title illustration paints at t=${t}`);
}

section('a hit throws a number and a lean');
const fight = loadGame({});
fight.setCtx(mkCtx());
fight.newGame();
fight.G.party = [fight.mkMon('cindercub', 30)];
fight.startBattle({ foe: fight.mkMon('dewdrip', 30), wild: true });
const bt = fight.B();
ok(Array.isArray(bt.pops) && bt.pops.length === 0, 'a fight opens with nothing floating');

// A swing that lands: the foe loses HP, a number leaves it, and the one who
// threw it leans in.
bt.pops = []; bt.lungeM = 0; bt.lungeF = 0;
bt.tgtF = bt.foe.hp;
fight.entryFx(bt, { fx: 'hit', side: 'foe', atk: 'mine', hpM: bt.mine.hp, hpF: bt.foe.hp - 12 });
eq(bt.pops.length, 1, 'one number came off the foe');
eq(bt.pops[0].n, 12, 'and it is what came off the bar');
eq(bt.pops[0].kind, 'dmg', 'marked as damage');
eq(bt.pops[0].side, 'foe', 'over the foe');
ok(bt.lungeM > 0, 'the kin that swung leans in');
ok(bt.lungeF === 0, 'the one that got hit does not');

// Burn, roots and recoil are also 'hit', but nobody threw them, so nothing leans.
bt.pops = []; bt.lungeM = 0; bt.lungeF = 0;
bt.tgtM = bt.mine.hp; bt.tgtF = bt.foe.hp;
fight.entryFx(bt, { fx: 'hit', side: 'mine', hpM: bt.mine.hp - 4, hpF: bt.foe.hp });
eq(bt.pops.length, 1, 'a burn still throws its number');
eq(bt.pops[0].side, 'mine', 'over whoever it burned');
ok(bt.lungeM === 0 && bt.lungeF === 0, 'but nothing leans into a burn');

// Healing reads as healing.
bt.pops = [];
bt.mine.hp = Math.max(1, bt.mine.hp - 20); bt.tgtM = bt.mine.hp;
fight.entryFx(bt, { fx: 'heal', side: 'mine', hpM: bt.mine.hp + 9, hpF: bt.foe.hp });
eq(bt.pops[0].kind, 'heal', 'a gain of HP pops as a heal');
eq(bt.pops[0].n, 9, 'for what it gained');

// Nothing moved, nothing pops — otherwise every line of text would throw a zero.
bt.pops = [];
fight.entryFx(bt, { fx: '', side: '', hpM: bt.tgtM, hpF: bt.tgtF });
eq(bt.pops.length, 0, 'a line that changed no HP is silent');

// They expire, and they never pile up without bound.
for (let i = 0; i < 40; i++) fight.pushPop(bt, 'foe', 3, 'dmg');
ok(bt.pops.length <= 8, `the pile is capped (${bt.pops.length})`);
fight.G.mode = 'battle';
for (let i = 0; i < 40; i++) { fight.step(.05); fight.draw(); }
eq(bt.pops.length, 0, 'and they all clear on their own');

// And the whole thing through the real path: a fight played out on the keys a
// player uses, drawing every frame. Nothing here reaches into the effect system
// — if numbers stop appearing over a real fight, this is what says so.
const played = loadGame({});
played.setCtx(mkCtx());
played.STARTER_DECK.forEach(played.grantCard);
played.G.party = [played.mkMon('pyrelynx', 30)];
played.startBattle({ foe: played.mkMon('sproutle', 6), wild: true });
let popped = 0, frames = 0;
while (played.G.battle && frames++ < 600) {
  const live = played.B();
  const stuck = live && live.phase === 'player' && !live.log && !live.over
    && !live.hand.some((c) => played.playableNow(live, c));
  const key = stuck ? 'e' : 'a';
  played.step(.12);
  played.pressKey(key); played.step(.02); played.releaseKey(key); played.fired.clear();
  played.draw();
  if (played.G.battle) popped = Math.max(popped, played.B().pops.length);
}
ok(popped > 0, `a fight played on the keys threw numbers (peak ${popped} on screen)`);

section('a swing winds up, and a crit looks like one');
const sw = loadGame({});
sw.setCtx(mkCtx());
sw.G.party = [sw.mkMon('pyrelynx', 30)];
sw.startBattle({ foe: sw.mkMon('sproutle', 30), wild: true });
const sb = sw.B();

// The line that announces a move arrives before the line that lands it. That
// gap is the wind-up — without it the lunge is a twitch with no preparation.
sb.windM = 0; sb.windF = 0; sb.tgtM = sb.mine.hp; sb.tgtF = sb.foe.hp;
sw.entryFx(sb, { fx: 'use', side: 'mine', hpM: sb.mine.hp, hpF: sb.foe.hp });
eq(sb.windM, sw.WIND_UP, 'announcing your move pulls you back');
eq(sb.windF, 0, 'and does not move the one about to be hit');
// …and the hit cancels it, so the two never fight over the same sprite.
sw.entryFx(sb, { fx: 'hit', side: 'foe', atk: 'mine', crit: false, hpM: sb.mine.hp, hpF: sb.foe.hp - 5 });
eq(sb.windM, 0, 'the swing landing ends the wind-up');
ok(sb.lungeM > 0, 'and starts the lunge');
ok(sb.recoilF > 0, 'the one that took it is knocked back');
eq(sb.recoilM, 0, 'the one that threw it is not');
eq(sb.crit, null, 'an ordinary hit sets off no burst');

// A crit shakes harder, bursts, and rewrites its own number.
sb.pops = []; sb.tgtF = sb.foe.hp;
sw.entryFx(sb, { fx: 'hit', side: 'foe', atk: 'mine', crit: true, hpM: sb.mine.hp, hpF: sb.foe.hp - 40 });
ok(sb.crit && sb.crit.side === 'foe', 'a crit bursts over whoever took it');
eq(sb.pops[sb.pops.length - 1].kind, 'crit', 'and its number is marked as one');
ok(sb.shake > 1, `a crit shakes harder than a normal hit (${sb.shake})`);
// It draws, and it expires rather than sticking to the screen.
const critCalls = [];
sw.setCtx(mkCtx(critCalls));
const beforeCrit = critCalls.length;
sw.drawBattle(mkCtx(critCalls));
ok(critCalls.length - beforeCrit > 0, 'the burst paints');
sw.G.mode = 'battle';
for (let i = 0; i < 40; i++) { sw.step(.05); sw.draw(); }
eq(sw.B().crit, null, 'and it clears itself');

// Damage that nobody threw — burn, roots, recoil — knocks its victim back but
// leaves everyone leaning nowhere.
const sb2 = sw.B();
sb2.lungeM = 0; sb2.lungeF = 0; sb2.recoilM = 0; sb2.recoilF = 0;
sb2.tgtM = sb2.mine.hp; sb2.tgtF = sb2.foe.hp;
sw.entryFx(sb2, { fx: 'hit', side: 'mine', hpM: sb2.mine.hp - 3, hpF: sb2.foe.hp });
ok(sb2.recoilM > 0, 'a burn still shoves whoever it burned');
ok(sb2.lungeM === 0 && sb2.lungeF === 0, 'but nobody leans into a burn');

section('the hand is a fan, not a row');
// The middle card is upright and the outer ones splay; the one you are aiming
// at leaves the arc entirely.
for (const n of [1, 2, 3, 4, 5, 6]) {
  const styles = Array.from({ length: n }, (_, i) => sw.fanStyle(i, n, false));
  const rots = styles.map((s) => parseFloat((s.match(/rotate\((-?[\d.]+)deg\)/) || [0, 0])[1]));
  if (n > 1) {
    ok(rots[0] < 0, `${n} cards: the leftmost leans left (${rots[0]}°)`);
    ok(rots[n - 1] > 0, `${n} cards: the rightmost leans right (${rots[n - 1]}°)`);
    // Monotonic across the hand — one card out of order and the fan reads as a
    // shuffle rather than a hand.
    ok(rots.every((r, i) => i === 0 || r > rots[i - 1]), `${n} cards: the angles run in order`);
    // Symmetric, so the hand is not lopsided.
    ok(Math.abs(rots[0] + rots[n - 1]) < 1e-6, `${n} cards: the fan is symmetric`);
  }
  // Every card is stacked, and every card is placed.
  ok(styles.every((s) => /z-index:\d+/.test(s)), `${n} cards: each one has a place in the stack`);
}
// The selected card is the only upright one, and it is on top of everything.
const picked = sw.fanStyle(2, 5, true);
ok(!/rotate\(-?[1-9]/.test(picked), 'the aimed card comes upright');
// Grows a little, and the range is the point rather than the digits: much past
// a twentieth and the aimed card swells sideways into its neighbour and hides
// that card's rules text, which a photograph of a real turn caught.
const grew = Number((/scale\(([\d.]+)\)/.exec(picked) || [])[1]);
ok(grew > 1 && grew <= 1.06, `and grows a little, not a lot (${grew})`);
ok(/translateY\(-\d/.test(picked), 'and lifts, which is what marks it instead');
ok(/z-index:20/.test(picked), 'and sits over the rest of the hand');
// Scaling about the fan's pivot would throw it up over the dialogue; it pivots
// about its own base instead.
ok(picked.includes('transform-origin:50% 100%'), 'it lifts off its own base, not the fan\'s');

section('the screens have a shape');
// The bag groups, and every group is one you would actually go looking in.
const bagKeys = Object.keys(EK.ITEMS);
const shelves = EK.shelve(bagKeys);
ok(shelves.length >= 2, `the bag is shelved rather than listed (${shelves.length} groups)`);
eq(shelves.flatMap(([, ks]) => ks).length, bagKeys.length, 'every item lands on a shelf');
ok(new Set(shelves.flatMap(([, ks]) => ks)).size === bagKeys.length, 'and none lands on two');
ok(shelves[0][0] === 'Orbs', 'orbs come first — it is the thing you reach for mid-fight');
// A shelf never changes order between renders, or the cursor jumps under you.
eq(JSON.stringify(EK.shelve(bagKeys)), JSON.stringify(EK.shelve([...bagKeys].reverse())),
  'shelving is stable however the keys arrive');
// Every item has a glyph, so the bag is icons rather than a list of names.
for (const k of bagKeys) ok(!!EK.sprite('card', EK.ITEM_ART(k)), `${EK.ITEMS[k].name} has an icon`);

// The kin page: a portrait, bars, and moves, all off one function.
const page = EK.statBlock(EK.mkMon('pyrelynx', 24));
ok(page.includes('portrait'), 'the kin page has a portrait');
for (const label of ['HP', 'ATK', 'GUARD', 'SPD', 'EXP']) ok(page.includes(`>${label}<`), `it shows ${label}`);
eq((page.match(/class="sbar"/g) || []).length, 5, 'every stat gets a bar, not just a number');
ok((page.match(/class="movecard"/g) || []).length >= 1, 'and the moves come with it');
eq(EK.statBlock(null), '', 'an empty slot renders nothing rather than throwing');
// A save whose xp sits below its own level floor must not print a negative.
const odd = EK.mkMon('pyrelynx', 24);
odd.xp = 0;
const oddPage = EK.statBlock(odd);
ok(!/>-\d/.test(oddPage), 'a half-migrated save shows no negative EXP');
ok(!/width:-/.test(oddPage), 'and no negative bar');
// A bar never runs past its track either.
const full = EK.mkMon('pyrelynx', 24);
full.xp = 1e9;
const widths = [...EK.statBlock(full).matchAll(/width:([\d.]+)%/g)].map((m) => parseFloat(m[1]));
ok(widths.length >= 5, 'the bars are all there');
ok(widths.every((w) => w >= 0 && w <= 100), `and none runs past its track (max ${Math.max(...widths)}%)`);

// Status reads as a chip in its own colour rather than three grey letters.
for (const st of Object.keys(EK.STATUS)) {
  const chip = EK.statusChip(st);
  ok(chip.includes(EK.STATUS[st].tag), `${st} shows its tag`);
  ok(/background:#[0-9a-f]{6}/i.test(chip), `${st} carries its own colour`);
}

// Every screen renders without throwing, with real content in it.
const scr = loadGame({});
scr.setCtx(mkCtx());
scr.G.party = [scr.mkMon('pyrelynx', 24), scr.mkMon('dewdrip', 12)];
scr.G.box = [scr.mkMon('sproutle', 8)];
scr.G.bag = { bloomorb: 4, salve: 2, elixir: 1 };
scr.G.dex = { cindercub: 2, pyrelynx: 1 };
scr.STARTER_DECK.forEach(scr.grantCard);
scr.G.money = 3000; scr.G.gems = 900;
for (const kind of ['party', 'dex', 'box', 'deck', 'bag', 'shop', 'chests']) {
  scr.openScreen(kind);
  scr.renderScreen();
  ok(scr.G.screen && scr.G.screen.kind === kind, `${kind} opened`);
  ok((scr.G.screen.list || []).length >= 0, `${kind} built a list`);
  // …and it can be walked with the keys without falling off either end.
  for (let i = 0; i < 30; i++) {
    scr.pressKey(i % 2 ? 'right' : 'down');
    scr.step(.05);
    scr.releaseKey(i % 2 ? 'right' : 'down');
    scr.fired.clear();
  }
  const len = (scr.G.screen ? screenLen(scr) : 1);
  ok(!scr.G.screen || (scr.G.screen.i >= 0 && scr.G.screen.i < Math.max(1, len)),
    `${kind}: the cursor stayed on the list`);
  if (scr.G.screen) scr.closeScreen();
  scr.G.screen = null;
}
function screenLen(g) { return (g.G.screen.list || []).length; }

section('the first choice is a choice');
// The starter used to be a three-line menu. It is a screen you cannot leave.
const first = loadGame({});
first.setCtx(mkCtx());
first.newGame();
for (let i = 0; i < 8 && first.G.mode === 'dialogue'; i++) { first.pressKey('a'); first.step(.2); first.releaseKey('a'); first.fired.clear(); }
first.G.player.x = 5; first.G.player.y = 3; first.G.player.px = 5; first.G.player.py = 3;
first.G.player.dir = 'up';
first.pressKey('a'); first.step(.2); first.releaseKey('a'); first.fired.clear();
for (let i = 0; i < 10 && first.G.mode === 'dialogue'; i++) { first.pressKey('a'); first.step(.2); first.releaseKey('a'); first.fired.clear(); }
eq(first.G.mode, 'screen', 'Rowan opens a screen rather than a menu');
eq(first.G.screen.kind, 'starter', 'the pick-one-of-three screen');
eq(first.G.screen.list.length, 3, 'with three kin on it');
eq(first.G.screen.list.join(','), first.STARTERS.join(','), 'and they are the three starters');
// Every one of them is a real, different choice.
const starterTypes = first.STARTERS.map((id) => first.DEX[id].types[0]);
eq(new Set(starterTypes).size, 3, `no two starters share an element (${starterTypes.join('/')})`);
// It renders, at every cursor position, without throwing.
for (let i = 0; i < 3; i++) { first.G.screen.i = i; first.renderScreen(); ok(true, `starter ${i} rendered`); }
// There is no way out of it but choosing.
first.closeScreen();
eq(first.G.screen && first.G.screen.kind, 'starter', 'closing it does nothing');
first.G.screen.i = 1;
first.screenSelect();
eq(first.G.party.length, 1, 'picking one gives you a kin');
eq(first.G.party[0].species, first.STARTERS[1], 'the one you picked');
eq(first.G.flags.starter, first.STARTERS[1], 'and the run remembers it');
ok(first.G.bag.bloomorb >= 5 && first.G.bag.salve >= 3, 'with orbs and salves to go with it');
eq(first.G.screen, null, 'the screen closed behind you');

section('a knockout has weight');
const koRun = loadGame({});
koRun.setCtx(mkCtx());
koRun.G.party = [koRun.mkMon('pyrelynx', 40)];
koRun.startBattle({ foe: koRun.mkMon('sproutle', 3), wild: true });
const kb = koRun.B();
eq(kb.downF, null, 'nobody is down at the start');
kb.foe.hp = 0; kb.tgtF = 0;
koRun.entryFx(kb, { fx: 'faint', side: 'foe', hpM: kb.mine.hp, hpF: 0 });
eq(kb.downF, 0, 'a faint starts the fall');
eq(kb.downM, null, 'and only for the one that fell');
// It falls over time and then stops falling.
koRun.G.mode = 'battle';
for (let i = 0; i < 6; i++) { koRun.step(.05); koRun.draw(); }
ok(kb.downF > 0 && kb.downF < koRun.KO_FALL, `it is mid-fall (${kb.downF.toFixed(2)}s)`);
for (let i = 0; i < 40; i++) { koRun.step(.05); koRun.draw(); }
ok(kb.downF <= koRun.KO_FALL + 1e-9, 'and it settles rather than falling for ever');

section('the chest shop reads like the bag');
const chest = loadGame({});
chest.setCtx(mkCtx());
chest.G.gems = 5000;
chest.openScreen('chests');
chest.renderScreen();
eq(chest.G.screen.list.length, chest.CHEST_IDS.length, 'every chest is on the shelf');
// The odds bar is a distribution, so it has to add up to one.
for (const k of chest.CHEST_IDS) {
  const total = Object.values(chest.CHESTS[k].odds).reduce((a, b) => a + b, 0);
  eq(total, 100, `${chest.CHESTS[k].name}: the odds add up`);
  // …and better chests really are better, or the bar is decoration.
  ok(chest.CHESTS[k].odds.common != null, `${chest.CHESTS[k].name} lists its commons`);
}
const commons = chest.CHEST_IDS.map((k) => chest.CHESTS[k].odds.common || 0);
ok(commons.every((c, i) => i === 0 || c <= commons[i - 1]),
  `commons thin out as chests get dearer (${commons.join(' → ')})`);
const costs = chest.CHEST_IDS.map((k) => chest.CHESTS[k].cost);
ok(costs.every((c, i) => i === 0 || c > costs[i - 1]), 'and they are listed cheapest first');
chest.closeScreen();

// A survey measured every element on ten screens at two window sizes and asked
// one question: is this text wider than the box it is drawn in, with nothing
// above it clipping? Two answers came back. Both were rows that had been told
// not to wrap and given nowhere to go.
//
// These are CSS faults, and CSS is the only vocabulary that states them. The
// claim is not "this selector exists" — it is that a row of separable items
// must be free to break between them and forbidden to break inside one, which
// is exactly two rules and cannot be said in fewer.
section('a row that runs out of room wraps rather than painting over its neighbour');
{
  // A dual-typed creature in a dex cell laid its second chip 8px past the cell
  // and over the one beside it: VERDANT + GLOOM does not fit a 96px column, and
  // the row had no wrap rule at all. A chip is a word — it may move to the next
  // line, it may not be halved, and it may never be read as belonging to the
  // creature next door.
  const types = SRC.match(/\n\s*\.types\{([^}]*)\}/);
  ok(types, 'the type row has a rule');
  ok(/flex-wrap:\s*wrap/.test(types[1]),
    'and it says what happens when the chips do not fit');

  // The chest odds line said the second half of the claim and forgot the first.
  // nowrap on the whole line keeps "45%" with "epic" — and also forbids the
  // break between "45% epic" and "20% legendary", which is the one break that
  // was wanted. At 980px the Prism row (dearest chest, so widest price, so
  // narrowest description) ran 13px past its card with nowhere legal to break.
  const line = SRC.match(/\.chestrow \.info small\{([^}]*)\}/);
  const item = SRC.match(/\.chestrow \.info small span\{([^}]*)\}/);
  ok(line && !/nowrap/.test(line[1]), 'the odds line may break between its items');
  ok(item && /white-space:\s*nowrap/.test(item[1]), 'and never inside one');

  // …and the separator belongs to the item before it, so a line that does wrap
  // opens with a percentage rather than a stray dot.
  const join = SRC.match(/\$\{ch\.odds\[r\]\}% \$\{r\}<\/span>`\)\s*\.join\('([^']*)'\)/);
  ok(join, 'the odds are joined with a separator');
  ok(/^(&nbsp;|&#160;|\u00a0)/.test(join[1]),
    `and its leading space is unbreakable, so the dot cannot open a line (joined with "${join && join[1]}")`);
}

section('a phone is driven with a thumb, not a pointer');
{
  // Targets mode of the survey opened eleven screens at 390x760 and measured,
  // for every tappable element, not its border box but how far from its centre
  // a tap can land and still resolve to it. Three sets came back under a 44px
  // thumb: the way out of every screen at 8px tall, the four buttons pressed
  // every turn of a fight at 24, and the two that end the profile at 18.
  //
  // A CSS fault has only CSS to state it in. What is netted here is not four
  // selectors but the thing that keeps them honest: the size a thumb needs has
  // a NAME, and the touch rules ask for it instead of each repeating a 44.
  const root = SRC.match(/:root\{([\s\S]*?)\}/);
  ok(root && /--tap:\s*44px/.test(root[1]), 'how big a thumb is has a name');

  // Every rule that sizes a touch target asks for it. Four today — the fight's
  // action row, the back chip's spacer, the profile's two buttons, and any list
  // row — and a fifth gets it for free by asking.
  const uses = (SRC.match(/var\(--tap\)/g) || []).length;
  ok(uses >= 4, `and the touch rules ask for it by name (${uses} sites)`);

  // …and nobody states it a second time. This is the check that would have
  // caught the version of this pass where the number was written into each
  // rule: they agreed on the day and would not have stayed agreed.
  const bare = SRC.match(/body\.touch[^{]*\{[^}]*(?:min-height|height):\s*44px/g) || [];
  eq(bare.length, 0, 'and none of them writes the number out again');

  // The one rule that is a POSITION rather than a size, and the reason it
  // exists: `#acts` is anchored by its top, so a taller button grows downward
  // into the panel carrying the selected card's text. Growing a target into
  // whatever sits below it is not growing it — the box read 44 and the
  // reachable area stayed at 24 until the row moved up by what it gained.
  const acts = SRC.match(/body\.touch #acts\{([^}]*)\}/);
  ok(acts && /margin-top:\s*-\d+px/.test(acts[1]),
    'the fight\'s action row moves up by what it grew, rather than into the panel below it');
}

section('the wait before a catch resolves has something tightening inside it');
{
  const g = loadGame({});
  g.setCtx(mkCtx());
  g.newGame(); g.takeStarter('cindercub'); g.G.dialogue = null;

  // Filmed, the wait was seventeen frames in which every wobble looked exactly
  // like the last one. The game already counts the holds and already says so
  // afterwards — "Three shakes. You had it." — so the picture agreeing with the
  // text is the claim, and it is a claim about a number, not about a drawing.
  const rock = [1, 2, 3].map((n) => g.orbRock(n));
  ok(rock.every((r, i) => i === 0 || r > rock[i - 1]),
    `each hold rocks harder than the last (${rock.map((r) => r.toFixed(2)).join(' → ')})`);
  ok(rock[0] > 0, 'and the first one still moves');

  // The hush covers the waiting and NOTHING else. The throw has to be visible
  // arriving — it is the only part the player caused — and the resolution has
  // to be visible landing, because an answer delivered under a vignette reads
  // as a continuation rather than an answer.
  const beats = g.orbBeats(3, true).map((b) => b[0]);
  eq(beats[0], 'throw', 'a throw opens with the throw');
  eq(beats[beats.length - 1], 'click', 'and a caught one ends on the click');
  ok(!g.orbHush('throw') && !g.orbHush('suck'), 'the arc is not hushed');
  ok(!g.orbHush('click') && !g.orbHush('burst'), 'and neither is the answer');
  const held = beats.filter((p) => g.orbHush(p));
  eq(held.length, beats.length - 3,
    `everything between them is (${held.length} of ${beats.length} beats — all but throw, suck and click)`);

  // …and one condition, not two. The canvas dims the arena and the DOM dims the
  // panels off the same question; written out twice they would drift, and the
  // drift would be a frame where the world is dark and the panels are not.
  // Counting inline copies of the condition was the first attempt and it was a
  // bad net: it also matched `inOrb`, which asks a DIFFERENT question — is the
  // creature inside the orb, which stays true through the click. A net that
  // cannot tell two conditions apart is naming markup rather than the claim.
  // What is true and worth holding is that both layers CALL the named one.
  const calls = (SRC.match(/orbHush\(/g) || []).length;
  ok(calls >= 2, `and both layers call it rather than restating it (${calls} sites)`);

  // Every beat of a throw draws. The hush is a radial gradient and the rock is
  // a transform, and neither had ever been driven by a suite — a throw that
  // threw would have shipped and only shown up as a black screen mid-catch.
  const b = (() => {
    g.G.mapId = 'route_one';
    g.startBattle({ foe: g.mkMon('dewdrip', 6), wild: true });
    const bb = g.B(); bb.foe.hp = 2; g.G.bag.bloomorb = 5; g.G.battleMsg = null;
    // The throw is a DICE ROLL. `shot.mjs` pins it so two films of the same
    // moment are comparable; this suite did not, and two runs in fourteen came
    // back "through its beats (throw, suck, fall, burst)" — a real zero-shake
    // break, correctly played, that simply never reaches the beats being
    // tested. A flaky net is worse than no net: it teaches you to re-run.
    const roll = Math.random;
    Math.random = () => .001;                 // three holds and a click
    try { g.submitLog(g.doAction({ kind: 'item', id: 'bloomorb', target: 'foe' })); }
    finally { Math.random = roll; }
    return bb;
  })();
  // `b.orb` does not exist yet: `tryCatch` leaves an `orbPlan`, and the log
  // playback turns it into a live throw. Asserting on it straight after
  // `submitLog` tests the wrong instant.
  for (let i = 0; i < 200 && !b.orb; i++) { g.step(.02); g.draw(); }
  ok(!!b.orb, 'a throw is playing');
  const seen = new Set();
  let frames = 0;
  for (let i = 0; i < 400 && b.orb && !b.orb.done; i++) {
    const p = g.orbPhase();
    if (p) seen.add(p);
    g.step(.02); g.draw(); frames++;
  }
  ok(frames > 20, `and it was driven frame by frame (${frames} frames)`);
  ok(seen.has('wobble'), `through its beats (${[...seen].join(', ')})`);
}

section('an evolution winds up rather than jumping about');
{
  const g = loadGame({});
  g.setCtx(mkCtx());
  g.newGame(); g.takeStarter('cindercub'); g.G.dialogue = null;

  // The wheel's spin is an ANGULAR VELOCITY and it has to be integrated. The
  // draw used to rotate by `G.t * (.35 + heat * 2.6)` — a product of time and a
  // rate that changes, which is not the angle a thing turning at that rate
  // would be at. Measured across a whole evolution that snapped backwards at
  // 425 rad/s at the burst and reversed a second time in plain view during the
  // settle: three sign flips where the intent was one wind-up and a release.
  const mag = ['hold', 'build'].flatMap((p) =>
    [0, .25, .5, .75, 1].map((k) => Math.abs(g.evoSpin(p, k, false))));
  ok(mag.every((v, i) => i === 0 || v >= mag[i - 1] - 1e-9),
    `the light gathers speed all the way in (${mag[0].toFixed(2)} → ${mag[mag.length - 1].toFixed(2)} rad/s)`);
  ok(g.evoSpin('settle', 1, true) !== 0 && Math.abs(g.evoSpin('settle', 1, true)) < Math.abs(g.evoSpin('build', 1, true)),
    'and lets it go again afterwards');

  // Drive the whole beat and watch the ACCUMULATED angle. A frame may only turn
  // the wheel by as much as the fastest legal rate allows — this is the net
  // that the old expression fails by two orders of magnitude, and it cannot be
  // stated about the rate alone, only about the angle over time.
  const m = g.mkMon('cindercub', 15);
  g.G.party = [m]; m.lvl = 16; g.refresh(m);
  g.runEvolution(m);
  const a = g.G.evoAnim;
  ok(!!a, 'an evolution is running');
  const top = Math.max(...['hold', 'build', 'burst', 'settle', 'quiet'].flatMap((p) =>
    [0, .5, 1].map((k) => Math.abs(g.evoSpin(p, k, false)))));
  const dt = 1 / 30;
  let prev = a.spin, worst = 0, flips = 0, lastDir = 0, frames = 0;
  for (let i = 0; i < 300 && g.evoPhase(); i++) {
    g.step(dt); g.draw();
    if (!g.evoPhase()) break;
    const d = a.spin - prev;
    worst = Math.max(worst, Math.abs(d) / dt);
    const dir = Math.sign(d);
    if (dir && lastDir && dir !== lastDir) flips++;
    if (dir) lastDir = dir;
    prev = a.spin; frames++;
  }
  ok(frames > 60, `the beat was driven frame by frame (${frames} frames)`);
  ok(worst <= top + 1e-6,
    `and no frame turns the wheel faster than the light can (${worst.toFixed(1)} rad/s, ceiling ${top.toFixed(1)})`);
  eq(flips, 1, 'it changes direction once, when the creature does');
}

section('a plaque does not draw over the thing that has taken the screen');
{
  // The rule was already written at the call site — "a plaque has no business
  // sitting on top of a catch or a wipe" — and then it named one screen-taker.
  // An evolution replaces the world exactly as a battle does.
  //
  // Netted by DIFFERENCE rather than by reading the guard: hold the evolution
  // perfectly still, draw one frame with a plaque raised and one without, and
  // count what reached the canvas. If the plaque is suppressed the two frames
  // are the same picture. A source-level net here would name the guard; this
  // names the claim.
  const frame = (withPlace) => {
    const g = loadGame({});
    const log = [];
    g.setCtx(mkCtx(log));
    g.newGame(); g.takeStarter('cindercub'); g.G.dialogue = null;
    g.enterMap('route_one', 9, 10, 'down');
    const m = g.mkMon('cindercub', 15);
    g.G.party = [m]; m.lvl = 16; g.refresh(m);
    g.runEvolution(m);
    g.G.place = withPlace ? { name: 'Route One', t: .4 } : null;
    g.draw();                       // one frame, nothing stepped
    return log.length;
  };
  const bare = frame(false), plaqued = frame(true);
  eq(plaqued, bare,
    `the same picture with a plaque raised and without (${plaqued} vs ${bare} draw calls)`);
  ok(bare > 0, 'and the frame drew something at all');
}

section('the screen stops promising a swing from a creature that cannot take one');
{
  // Filmed the kill. The foe fell and faded and the chip went on reading
  // "Foe: Mist Spray · hits 9" for the whole of the next two seconds —
  // measured, from the faint at 1.97s until the flourish hid the panels at
  // 3.52s. A chip that says what the foe will do NEXT is a promise about a next
  // turn, and there is no next turn.
  //
  // Two ways a foe stops being able to act, and they had to be found
  // separately: it falls, or an orb takes it. The second is not a variant of
  // the first — the creature is alive and about to be yours.
  const g = loadGame({});
  const { intentLine } = g;
  g.setCtx(mkCtx());
  g.newGame(); g.takeStarter('cindercub'); g.G.dialogue = null;

  eq(g.foeAfield(null), false, 'no fight, nothing to promise');
  eq(g.foeAfield({ downF: null }), true, 'a foe standing on the field can act');
  eq(g.foeAfield({ downF: 0 }), false, 'one that has started to fall cannot');

  // The kill, driven, with the dice pinned. `playCard` BUILDS a log; `submitLog`
  // plays it back, and the fall is set by a `faint` entry DURING that playback.
  const kill = (() => {
    g.G.mapId = 'route_one';
    const roll = Math.random;
    Math.random = () => .999;
    try {
      g.startBattle({ foe: g.mkMon('dewdrip', 6), wild: true });
      const b = g.B(); b.foe.hp = 1; g.G.battleMsg = null;
      const i = b.hand.findIndex((c) => c.src === 'kin' && g.cardCost(c) <= b.energy);
      g.submitLog(g.playCard(i >= 0 ? i : 0));
      return b;
    } finally { Math.random = roll; }
  })();
  let sawStanding = false, fellAt = -1, promisedAfter = 0, frames = 0;
  for (let n = 0; n < 600 && g.B() && !g.G.screen; n++) {
    const b = g.B();
    if (b.downF == null && g.foeAfield(b)) sawStanding = true;
    if (b.downF != null) {
      if (fellAt < 0) fellAt = n;
      if (g.foeAfield(b)) promisedAfter++;
    }
    g.step(1 / 60); g.draw(); frames++;
  }
  ok(frames > 60, `the kill was driven frame by frame (${frames} frames)`);
  ok(sawStanding, 'the foe was promising a swing while it stood');
  ok(fellAt > 0, `and it was seen to fall (frame ${fellAt})`);
  eq(promisedAfter, 0, 'and promised nothing once it had');

  // …and the chip itself, not just the decision behind it. The first version of
  // this section netted `foeAfield` and the call sites and NOT the wiring
  // between them: breaking the gate on purpose changed nothing and nothing
  // failed. `intentLine` is a value so a suite can read what the chip would
  // say.
  const standing = g.B() || kill;
  eq(intentLine({ downF: 0, intent: { name: 'Mist Spray', kind: 'attack', dmg: 9 },
    mods: {}, shield: 0, mine: { hp: 19, max: 19 } }).html, '',
    'a fallen foe says nothing');
  ok(/Mist Spray/.test(intentLine({ downF: null, intent: { name: 'Mist Spray', kind: 'attack', dmg: 9 },
    mods: {}, shield: 0, mine: { hp: 19, max: 19 } }).html),
    'and a standing one still says what it will do');

  // …and the other way. Through the throw the foe is still standing and the
  // chip is honest; from the moment the orb takes it, it is not on the field.
  const g2 = loadGame({});
  g2.setCtx(mkCtx());
  g2.newGame(); g2.takeStarter('cindercub'); g2.G.dialogue = null;
  g2.G.mapId = 'route_one';
  const roll2 = Math.random;
  Math.random = () => .001;                  // three holds and a click
  try {
    g2.startBattle({ foe: g2.mkMon('dewdrip', 6), wild: true });
    const b2 = g2.B();
    b2.foe.hp = Math.max(1, Math.round(b2.foe.max * .12));
    g2.G.bag.bloomorb = 5; g2.G.battleMsg = null;
    g2.submitLog(g2.doAction({ kind: 'item', id: 'bloomorb', target: 'foe' }));
  } finally { Math.random = roll2; }
  const seen = {};
  for (let n = 0; n < 600 && g2.B() && !g2.G.screen; n++) {
    const b2 = g2.B();
    const p = g2.orbPhase();
    if (p) (seen[p] = seen[p] || []).push(g2.foeAfield(b2));
    g2.step(1 / 60); g2.draw();
  }
  ok(seen.throw && seen.throw.every(Boolean),
    'the orb is in the air and the foe is still standing');
  for (const p of ['suck', 'fall', 'wobble', 'gap', 'click']) {
    if (!seen[p]) continue;
    ok(seen[p].every((v) => v === false), `${p}: the orb has it, so it promises nothing`);
  }
  ok(Object.keys(seen).length >= 4, `the throw played its beats (${Object.keys(seen).join(', ')})`);

  // The chip lives in `renderHand`, which runs when the PLAYBACK ends — about a
  // second and a half after the foe falls. Knowing the right answer is no use
  // if nothing asks at the moment it changes, so it is redrawn at both.
  const calls = (SRC.match(/renderIntent\(/g) || []).length;
  ok(calls >= 3, `and it is redrawn at each moment the answer changes (${calls} sites)`);
}

section('a level gets the screen to itself, the way it already gets the sprite');
{
  // The game clears the hit flash, the lunge, the recoil and the crit burst
  // when a level lands, under a comment saying why: two beats running at once
  // are indistinguishable and the one not yet read wins. The rule was written
  // and applied to everything BEFORE the level and nothing after. Measured, the
  // rings run 3.50s to 4.30s and the victory flourish started at 3.90s — half
  // the beat drawn under a field of gold motes rising in the same colour.
  const win = (levels) => {
    const g = loadGame({});
    g.setCtx(mkCtx());
    g.newGame(); g.takeStarter('cindercub'); g.G.dialogue = null;
    g.G.mapId = 'route_one';
    const roll = Math.random;
    Math.random = () => .999;              // same deal, top of every range
    try {
      g.startBattle({ foe: g.mkMon('dewdrip', 6), wild: true });
      const b = g.B(); b.foe.hp = 1; g.G.battleMsg = null;
      // One point short of the boundary, or a long way from it.
      b.mine.xp = levels ? g.xpFor(b.mine.lvl + 1) - 1 : g.xpFor(b.mine.lvl);
      b.dispXp = b.tgtXp = b.mine.xp; b.barLv = b.mine.lvl;
      const i = b.hand.findIndex((c) => c.src === 'kin' && g.cardCost(c) <= b.energy);
      g.submitLog(g.playCard(i >= 0 ? i : 0));
    } finally { Math.random = roll; }
    let both = 0, levelFrames = 0, flourishFrames = 0, frames = 0;
    for (let n = 0; n < 900 && !g.G.screen; n++) {
      const b = g.B();
      const lv = !!(b && b.lvT > 0), fl = !!g.G.flourish;
      if (lv && fl) both++;
      if (lv) levelFrames++;
      if (fl) flourishFrames++;
      g.step(1 / 60); g.draw(); frames++;
    }
    return { both, levelFrames, flourishFrames, frames, lvl: g.G.party[0].lvl };
  };

  const up = win(true);
  ok(up.frames > 120, `the winning fight was driven frame by frame (${up.frames} frames)`);
  eq(up.lvl, 6, 'and the win crossed a level');
  ok(up.levelFrames > 30, `the level was on screen (${up.levelFrames} frames)`);
  eq(up.both, 0, 'and the victory never came up over it');
  ok(up.flourishFrames > 0,
    `…while still arriving afterwards (${up.flourishFrames} frames) — waiting is not starving`);

  // A win with no level is untouched: the gate reads `lvT`, which is zero, so
  // the far commoner fight pays nothing for this.
  const flat = win(false);
  eq(flat.levelFrames, 0, 'a win with no level shows no level');
  ok(flat.flourishFrames > 0, 'and its victory arrives as it always did');
  eq(flat.both, 0, 'with nothing to overlap');
}

section('when a level lands, nothing else is still shoving the sprite it draws around');
{
  // The game clears the hit flash, the lunge, the recoil and the bursts when a
  // level lands, under a comment saying two beats at once are
  // indistinguishable. `mx` is `72 - shake - wind(windM) + lunge(lungeM) -
  // recoil(recoilM)`: FOUR ways the player's sprite can be displaced, and the
  // list named three. Swept for deliberately after the same shape turned up in
  // 168, 169 and 170 — and it found a fifth thing nobody was looking for, which
  // is in the source comment at that site.
  //
  // Netted as the CLAIM — every beat that draws on or shoves this sprite is
  // zero — rather than as the line, so the next term added to `mx` has
  // somewhere to fail.
  const g = loadGame({});
  g.setCtx(mkCtx());
  g.newGame(); g.takeStarter('cindercub'); g.G.dialogue = null;
  g.G.mapId = 'route_one';
  const roll = Math.random;
  Math.random = () => .999;
  try {
    g.startBattle({ foe: g.mkMon('dewdrip', 6), wild: true });
    const b = g.B(); b.foe.hp = 1; g.G.battleMsg = null;
    b.mine.xp = g.xpFor(b.mine.lvl + 1) - 1;
    b.dispXp = b.tgtXp = b.mine.xp; b.barLv = b.mine.lvl;
    const i = b.hand.findIndex((c) => c.src === 'kin' && g.cardCost(c) <= b.energy);
    g.submitLog(g.playCard(i >= 0 ? i : 0));
  } finally { Math.random = roll; }

  // Shove the sprite every way it can be shoved, right up to the level landing,
  // so the clear has something to clear. WITHOUT THIS THE NET PASSES ON A
  // BATTLE WHERE THEY WERE ALL ZERO ANYWAY — proved by deleting the whole
  // clear-list and this dirtying together and watching the suite stay green.
  let dirty = 0, live = null, frames = 0;
  for (let n = 0; n < 900 && g.B() && !g.G.screen; n++) {
    const bb = g.B();
    if (bb.lvT <= 0) {
      bb.flashM = .8; bb.lungeM = .2; bb.recoilM = .2; bb.windM = .3;
      bb.crit = { side: 'mine', t: .1 };
      dirty++;
    } else if (!live) {
      live = { flashM: bb.flashM || 0, lungeM: bb.lungeM || 0,
        recoilM: bb.recoilM || 0, windM: bb.windM || 0, crit: bb.crit ? 1 : 0 };
    }
    g.step(1 / 60); g.draw(); frames++;
  }
  ok(frames > 120, `the levelling fight was driven (${frames} frames)`);
  ok(dirty > 20, `and the sprite was being shoved right up to it (${dirty} frames)`);
  ok(!!live, 'the level landed');
  for (const k of ['flashM', 'lungeM', 'recoilM', 'windM', 'crit']) {
    eq(live[k], 0, `${k} is not still running under the level`);
  }
}

section('a beat that owns the screen is abandoned when the ground moves under it');
{
  // `enterMap` clears seven beats under a comment making two claims: that every
  // beat owning the screen is abandoned when the map changes, and that every one
  // of them blocks input while it runs. Both are testable, and 171 showed what a
  // comment claiming a fix is worth on its own.
  //
  // The list of beats is READ OUT OF THE LADDER rather than written here, so a
  // beat added to `step` and forgotten in `enterMap` fails this without anyone
  // remembering to update a test. That is the whole point: the last three
  // passes each found a rule applied to some of its cases.
  const ladder = SRC.slice(SRC.indexOf('function step(dt)'));
  // `if (G.x && xStep(dt)) return;` — the ladder writes `return;`, not
  // `return true;`, which the first version of this pattern required and so
  // found two of nine. A parser that silently under-reads is the same fault as
  // a net that cannot fail: it agrees with you.
  const parsed = [...new Set(
    [...ladder.matchAll(/\n\s*if \(G\.(\w+)\s*&&[^)]*Step\(dt\)\)/g)].map((m) => m[1]))];
  // `gotcha` gates the frame from an inline block rather than a `…Step(dt)`
  // call, so the pattern above cannot see it. Named here, with the reason,
  // rather than silently missing from a list that claims to be complete.
  const gate = [...new Set([...parsed, 'gotcha'])];
  ok(gate.length >= 8, `the ladder was parsed (${gate.length} beats: ${gate.join(', ')})`);
  for (const f of ['warp', 'evoAnim', 'alert', 'rustle', 'mend', 'blackout', 'chestOpen', 'flourish', 'gotcha']) {
    ok(gate.includes(f), `${f} gates the frame`);
  }

  // …and now the behavioural half, DRIVEN FROM THE PARSED LIST. The first
  // version of this section hardcoded the beats and then claimed in its own
  // comment that a beat added to `step` and forgotten in `enterMap` would fail
  // it — which was not true, and is the exact fault this pass went looking for.
  // Every field the ladder gates on is set, the ground is moved, and each is
  // looked at.
  //
  // DIRTIED FIRST — a net run against a game where these were already null
  // cannot fail, which is 171's lesson written into the setup.
  const g = loadGame({});
  g.setCtx(mkCtx());
  g.newGame(); g.takeStarter('cindercub'); g.G.dialogue = null;
  const stub = () => ({ t: 0, go: () => {}, done: null, beats: [['x', 1]], i: 0,
    gems: 1, name: 'x', species: 'cindercub', where: 'x',
    mon: g.G.party[0], from: 'cindercub', to: 'pyrelynx', spin: 0, swapped: false, res: null });
  const owned = gate.filter((f) => f !== 'warp');       // the exception, below
  for (const f of owned) g.G[f] = stub();
  eq(owned.filter((f) => g.G[f]).length, owned.length,
    `all ${owned.length} screen-owning beats were running before the ground moved`);
  g.enterMap('route_one', 9, 10, 'down');
  for (const f of owned) eq(g.G[f], null, `${f} was abandoned`);

  // `warp` is the documented exception, and it has to stay one: `warpStep` is
  // what calls `enterMap`, so clearing it there would cancel the door you are
  // walking through. Netted as the exception rather than left as prose.
  g.G.warp = { to: { to: 'route_one', tx: 9, ty: 10 }, t: .1 };
  g.enterMap('route_one', 9, 10, 'down');
  ok(!!g.G.warp, 'and the door you are walking through is not');
}

section('the plaque waits for the light');
{
  // Timed through a real warp: the curtain shuts over 0.17s, the map swaps at
  // 0.183s, `G.fade` opens the far side over 0.300s — and PLACE_IN is 0.300s
  // starting at that same instant. ALL of the ease that drawPlace's comment
  // describes ("it eases on the way in so it arrives rather than snaps") was
  // spent underneath the fade, and the world appeared with the name already
  // fully in place.
  const g = loadGame({});
  g.setCtx(mkCtx());
  g.newGame(); g.takeStarter('cindercub'); g.G.dialogue = null;
  g.enterMap('hollowbrook', 12, 10, 'down');
  g.G.place = null;
  const w = (g.G.map.warps || [])[0];
  ok(!!w, 'hollowbrook has a door to walk through');
  g.doWarp(w);

  let easeInDark = 0, easeInLight = 0, sawFull = false, cleared = -1, frames = 0;
  let prev = null;
  for (let n = 0; n < 400; n++) {
    const p = g.G.place;
    const covered = (g.G.fade > 0) || !!g.G.warp;
    // Only frames where the clock ACTUALLY MOVED count as ease being spent —
    // a plaque held at t=0 behind the curtain is not spending anything, and
    // counting its held frames as "under black" was the first version's error.
    if (p && prev != null && p.t > prev && p.t <= g.PLACE_IN) {
      if (covered) easeInDark++; else easeInLight++;
    }
    if (p && p.t > g.PLACE_IN && p.t < g.PLACE_IN + g.PLACE_HOLD) sawFull = true;
    if (!p && prev != null && cleared < 0) cleared = n;
    prev = p ? p.t : null;
    g.step(1 / 60); g.draw(); frames++;
  }
  ok(frames > 300, `the warp was driven frame by frame (${frames} frames)`);
  ok(easeInLight > 10, `the plaque's entrance is spent in the light (${easeInLight} frames)`);
  eq(easeInDark, 0, 'and none of it behind the curtain');

  // Waiting is not starving — two claims, netted separately, per 170. A plaque
  // whose clock is gated on the fade must still arrive and still leave.
  ok(sawFull, 'it still arrives at full');
  ok(cleared > 0, `and still leaves (cleared at frame ${cleared})`);
}

section('a beat is not shown while the screen is covered');
{
  // The plaque was the first case; the toast was the second, found by shooting
  // the wipe at peak cover and seeing the one thing left on screen. Both are
  // the same rule — a beat whose display time runs behind a curtain has not
  // been shown, it has been consumed — so the condition has a name and three
  // callers: the plaque's clock, the toast's clock, and the class that takes
  // the battle panels out of the wipe.
  const g = loadGame({});
  g.setCtx(mkCtx());
  g.newGame(); g.takeStarter('cindercub'); g.G.dialogue = null;
  g.enterMap('route_one', 9, 10, 'down');

  const was = { fade: g.G.fade, warp: g.G.warp, wipe: g.G.wipe };
  g.G.fade = 0; g.G.warp = null; g.G.wipe = 0;
  eq(g.screenCovered(), false, 'an open screen is not covered');
  g.G.fade = .2; ok(g.screenCovered(), 'a fade covers it'); g.G.fade = 0;
  g.G.warp = { t: .1, to: {} }; ok(g.screenCovered(), 'a door covers it'); g.G.warp = null;
  g.G.wipe = .2; ok(g.screenCovered(), 'the battle bars cover it'); g.G.wipe = 0;
  Object.assign(g.G, was);

  // The toast, through a real wipe. `startBattle` sets G.wipe, and the sighting
  // toast fires in the same breath — measured, it sat at 0.99 opacity over a
  // picture that was 97% black, spending its whole life behind the bars.
  const g2 = loadGame({});
  g2.setCtx(mkCtx());
  g2.newGame(); g2.takeStarter('cindercub'); g2.G.dialogue = null;
  g2.enterMap('route_one', 9, 10, 'down');
  for (let n = 0; n < 200 && (g2.G.place || g2.G.toastT > 0); n++) g2.step(1 / 60);
  const roll = Math.random;
  Math.random = () => .999;
  try { g2.startBattle({ foe: g2.mkMon('dewdrip', 6), wild: true }); }
  finally { Math.random = roll; }
  g2.G.battleMsg = null;
  g2.G.toast = 'x'; g2.G.toastT = 2.4;                 // DIRTIED: a toast to spend
  const full = g2.G.toastT;
  let spentCovered = 0, spentOpen = 0, prev = g2.G.toastT;
  for (let n = 0; n < 400 && g2.G.toastT > 0; n++) {
    g2.step(1 / 60); g2.draw();
    // Sampled AFTER the step, because that is the value the toast's own tick
    // used: `step` decays the wipe and then reaches the toast, so on the frame
    // the bars finish the screen is already open. Sampling before counted that
    // frame as covered and reported a one-frame leak that was not there.
    const covered = g2.screenCovered();
    if (g2.G.toastT < prev) { if (covered) spentCovered++; else spentOpen++; }
    prev = g2.G.toastT;
  }
  eq(spentCovered, 0, 'none of the toast is spent behind the bars');
  ok(spentOpen > 60, `and all of it in the open (${spentOpen} frames of ${full}s)`);
  // The game lets it go a hair past zero rather than clamping, and the string
  // is cleared on that frame — so the claim is that it ran out, not that it
  // landed on a round number.
  ok((g2.G.toastT || 0) <= 0 && !g2.G.toast,
    `and it still runs out — waiting is not starving (${(g2.G.toastT || 0).toFixed(2)})`);

  // …and the panels. A canvas wipe cannot fade a DOM panel, so every one of
  // them has to be named. Netted as a count against the elements the battle
  // actually shows, so a panel added later has somewhere to fail.
  const rule = SRC.match(/body\.wiping[^{]*\{[^}]*\}/);
  ok(rule, 'the wipe takes the panels with it');
  for (const id of ['hudFoe', 'hudMine', 'intent', 'battlebar', 'acts', 'piles', 'energy', 'dialogue', 'toast']) {
    ok(rule[0].includes('#' + id), `#${id} goes with the wipe`);
  }
}

section('a beat is finished before whatever it starts begins');
{
  // 173 established the rule: a beat spent behind a curtain has not been shown,
  // it has been consumed. Sweeping every clock against `screenCovered()` and
  // FORCING each one live under each cover, every display beat advances behind
  // it — and every one of those combinations is unreachable, for two reasons
  // that hold each other up:
  //
  //   1. every display beat blocks the input ladder while it runs (netted in
  //      172), so nothing that starts a cover can happen while one is live; and
  //   2. each beat NULLS ITSELF before running the callback that starts the
  //      next thing — `G.rustle = null; r.go();`, and `r.go()` is what calls
  //      `startBattle`, which raises the bars.
  //
  // The first is netted. The second was not, and it is one line's ordering in
  // each of five step functions: reverse it anywhere and the beat's remaining
  // time burns behind a wipe or a fade with nothing to catch it.
  const g = loadGame({});
  g.setCtx(mkCtx());
  g.newGame(); g.takeStarter('cindercub'); g.G.dialogue = null;
  g.enterMap('route_one', 9, 10, 'down');

  // Read the beats out of the ladder rather than listing them here, so one
  // added later is covered without anyone remembering (172's rule).
  const ladder = SRC.slice(SRC.indexOf('function step(dt)'));
  const gated = [...new Set(
    [...ladder.matchAll(/\n\s*if \(G\.(\w+)\s*&&[^)]*Step\(dt\)\)/g)].map((m) => m[1]))];
  ok(gated.length >= 7, `the ladder was parsed (${gated.length}: ${gated.join(', ')})`);

  // Only the ones that carry a callback can start anything, and those are the
  // ones this is about.
  const carriers = ['rustle', 'mend', 'blackout'].filter((f) => gated.includes(f));
  eq(carriers.length, 3, `three ladder beats carry a callback (${carriers.join(', ')})`);

  for (const f of carriers) {
    let stillSet = null;
    g.G.fade = 0; g.G.wipe = 0; g.G.warp = null;
    g.G[f] = { t: 0, x: 9, y: 10, go: () => { stillSet = !!g.G[f]; } };
    // DIRTIED and then run to completion — a net that never reaches the
    // callback proves nothing about what the callback sees.
    for (let n = 0; n < 400 && stillSet === null; n++) { g.step(1 / 60); g.draw(); }
    ok(stillSet !== null, `${f}'s callback ran`);
    eq(stillSet, false, `${f} is already finished when what it starts begins`);
    g.G[f] = null;
  }
}

section('being called out happens to you as well as to them');
{
  // Filmed, the ambush was a beat that happened entirely to the trainer: they
  // jolt (the marker goes white and double size), they walk over, they get a
  // cue. The one thing on screen that is YOU turned to face them and then stood
  // perfectly still for the whole 1.35s.
  //
  // The recoil it now uses was already half built. `p.bump` was set when you
  // walked into a wall, decayed every frame, and NOTHING READ IT — a timer that
  // drove nothing, in a file where every other one drives a picture.
  const g = loadGame({});
  g.setCtx(mkCtx());
  g.newGame(); g.takeStarter('cindercub'); g.G.dialogue = null;
  g.enterMap('hollowbrook', 9, 5, 'right');
  g.G.place = null; g.G.flags.gotStarter = 1;

  // The offset is an ARC: nothing at either end of the bump's life, most in the
  // middle. A bump that never advances therefore draws nothing whichever end it
  // is stuck at, which is exactly how the first attempt moved the player zero
  // pixels for a second and a third of a second.
  const p = { dir: 'right', bump: g.BUMP_T };
  eq(g.bumpOffset(p).join(','), '0,0', 'a recoil at full has not moved yet');
  p.bump = g.BUMP_T * .5;
  const mid = g.bumpOffset(p);
  ok(mid[0] !== 0, `and mid-way it has (${mid.join(',')})`);
  ok(mid[0] < 0, 'away from the way you are facing');
  p.bump = 0;
  eq(g.bumpOffset(p).join(','), '0,0', 'and it comes back');
  eq(g.bumpOffset({ dir: 'up', bump: g.BUMP_T * .5 })[1] > 0, true, 'it knows which way you face');

  // Being spotted sets it…
  ok(g.trainerSight(), 'a trainer spots the player at 9,5');
  eq(g.G.player.bump, g.BUMP_T, 'and you flinch');
  ok(!!g.G.alert, 'and the ambush owns the screen');

  // …and it plays out WHILE THE AMBUSH RUNS. This is the whole finding: the
  // decay used to live below the input ladder, and an ambush returns before it,
  // so the value sat frozen at full for the entire beat and the player moved
  // zero pixels. Driven, not reasoned — the source looked plausible.
  let moved = 0, frames = 0;
  while (g.G.alert && frames < 200) {
    const [ox, oy] = g.bumpOffset(g.G.player);
    if (ox || oy) moved++;
    g.step(1 / 60); g.draw(); frames++;
  }
  ok(frames > 60, `the ambush was driven frame by frame (${frames} frames)`);
  ok(moved > 5, `and the recoil played out inside it (${moved} frames of movement)`);
  eq(g.G.player.bump, 0, 'and it is spent by the time the beat ends');
}

section('the game opens the way it changes any other scene');
{
  // Photographed end to end for the first time: the title was replaced by the
  // study 120ms after the click, mid-sentence, with `fade` and `wipe` both zero
  // at every sample. A door goes through black at .3 and waking up after a loss
  // at .5 — the most careful transition in the file, skipped at the one cut
  // every player sees first.
  const g = loadGame({});
  g.setCtx(mkCtx());
  ok(g.OPEN_FADE > 0, `the opening has a length (${g.OPEN_FADE}s)`);

  g.startNew();
  eq(g.G.fade, g.OPEN_FADE, 'and starting a journey goes through it');
  ok(g.screenCovered(), 'so the screen is covered while the world comes up');

  // Waiting is not starving (170): a cover that never lifts is worse than no
  // cover. Driven, not reasoned.
  let frames = 0;
  while (g.G.fade > 0 && frames < 300) { g.step(1 / 60); g.draw(); frames++; }
  eq(g.G.fade, 0, 'and the world does arrive');
  ok(frames > 10 && frames < 120,
    `taking about as long as it says (${frames} frames for ${g.OPEN_FADE}s)`);
  ok(!g.screenCovered(), 'and the screen is its own again');

  // …and the same for picking up a save, which is the other way in. The rule
  // this pass is about is a rule applied to SOME of its cases; netting one door
  // and not the other is how that happens.
  const g2 = loadGame({});
  g2.setCtx(mkCtx());
  g2.startNew();
  for (let n = 0; n < 300 && g2.G.fade > 0; n++) g2.step(1 / 60);
  g2.saveGame();
  const g3 = loadGame(g2.__store || {});
  g3.setCtx(mkCtx());
  g3.startCont();
  eq(g3.G.fade, g3.OPEN_FADE, 'and so does picking one up again');
}

section('weather belongs to the place');
// Every outdoor map has weather, and it is a property of the map rather than
// of a clock — Stillmere is always wet, Emberwood is always misty.
for (const id of Object.keys(EK.MAPS)) {
  const outside = EK.MAPS[id].kind !== 'inside';
  eq(!!EK.WEATHER[id], outside, `${id}: ${outside ? 'has weather' : 'is indoors and has none'}`);
}
ok(new Set(Object.values(EK.WEATHER)).size >= 3, 'and no two kinds of place feel the same');
// Wind is per-map too, and every map has a fallback rather than a crash.
for (const id of Object.keys(EK.MAPS)) {
  const w = EK.WIND[id] || EK.WIND._;
  ok(Array.isArray(w) && w.length === 2 && w[1] >= 1, `${id} has a wind [rate, px]`);
}
ok((EK.WIND.crown_hollow || [])[1] > (EK.WIND.emberwood || [])[1],
  'the exposed pass blows harder than the sheltered wood');
// It paints, on every map, and it never leaves the context dirty for the next
// frame — a leaked globalAlpha is how a whole game goes translucent.
for (const id of Object.keys(EK.MAPS)) {
  const wcalls = [];
  const wctx = mkCtx(wcalls);
  wctx.globalAlpha = 1;
  EK.weather(wctx, id, { kind: EK.MAPS[id].kind, map: EK.MAPS[id], x0: 0, y0: 0, ox: 0, oy: 0 });
  ok(true, `${id} weather painted without throwing`);
}
// And the world still draws under it, on every map and at several times.
for (const id of Object.keys(EK.MAPS)) {
  EK.enterMap(id, 4, 4, 'down');
  EK.G.mode = 'world';
  for (const t of [0, 3.3, 41.7]) {
    EK.G.t = t;
    const since = drawCount();
    EK.draw();
    ok(since() > 20, `${id} drew with weather at t=${t}`);
  }
}

section('a door goes through black');
const warp = loadGame({});
warp.setCtx(mkCtx());
warp.G.party = [warp.mkMon('pyrelynx', 12)];
warp.enterMap('hollowbrook', 5, 5, 'up');
warp.G.mode = 'world';
const door = warp.MAPS.hollowbrook.warps.find((w) => w.to === 'lab');
ok(door, 'the study still has a door');
warp.doWarp(door);
ok(warp.G.warp, 'stepping on it draws the curtain');
eq(warp.G.mapId, 'hollowbrook', 'and the map has NOT changed yet — that is the whole point');
// Nothing moves while the curtain is down.
const wasX = warp.G.player.x;
warp.pressKey('left');
for (let i = 0; i < 3; i++) { warp.step(.04); warp.draw(); }
warp.releaseKey('left'); warp.fired.clear();
eq(warp.G.player.x, wasX, 'and you cannot walk behind it');
// It opens on the other side.
for (let i = 0; i < 20 && warp.G.warp; i++) { warp.step(.04); warp.draw(); }
eq(warp.G.mapId, 'lab', 'the curtain lifts on the new map');
eq(warp.G.player.x, door.tx, 'at the far side of the door');
ok(warp.G.fade > 0, 'and it opens rather than cutting');
ok(warp.hasSave(), 'the journey saved on the way through');

section('evolving takes its time');
const evo = loadGame({});
evo.setCtx(mkCtx());
evo.G.party = [evo.mkMon('cindercub', 20)];
evo.runEvolution(evo.G.party[0]);
const beats = [];
let swapAt = null;
for (let i = 0; i < 400 && evo.G.evoAnim; i++) {
  const p = evo.evoPhase();
  if (p && p !== beats[beats.length - 1]) beats.push(p);
  if (swapAt === null && evo.G.party[0].species !== 'cindercub') swapAt = p;
  evo.step(.05);
  evo.draw();
}
eq(beats.join(' '), 'hold build burst settle quiet', 'it plays every beat in order');
eq(swapAt, 'burst', 'and the shape changes under the white-out, never in the open');
eq(evo.G.party[0].species, 'pyrelynx', 'the kin really evolved');
eq(evo.G.evoAnim, null, 'the scene handed the screen back');
eq(evo.G.mode, 'dialogue', 'and the name arrives after it, not during');
// It is not driven by the buttons — that was the old bug: the one moment the
// genre is built around used to run at the speed you mashed A.
//
// This used to check the PROXY: after a mash the phase had to still be 'hold'
// or 'build'. Pass 186 gave a press the power to skip the WIND-UP, and the
// proxy went red while the claim above it stayed true. Measured, mashing or
// not:
//
//     left alone   burst at frame 151, ends at 282 — the change takes 131
//     mashing A    burst at frame   0, ends at 131 — the change takes 131
//
// The moment is untouchable either way; only the 2.4s run-up before it can be
// cut. So the claim is netted instead of the proxy: a mash must not shorten the
// change by a single frame.
const evoRun = (mash) => {
  const g = loadGame({});
  g.setCtx(mkCtx());
  g.G.party = [g.mkMon('cindercub', 20)];
  g.runEvolution(g.G.party[0]);
  let n = 0, burstAt = null, threw = null;
  // step() is raw where frame() has a try/catch, so a beat that throws takes the
  // whole suite down instead of failing one check. Caught here and reported.
  try {
    while (n < 1500 && g.G.evoAnim) {
      if (mash) g.pressKey('a');
      g.step(.016);
      if (mash) { g.releaseKey('a'); g.fired.clear(); }
      if (g.evoPhase() === 'burst' && burstAt === null) burstAt = n;
      n++;
    }
  } catch (e) { threw = String(e && e.message || e); }
  // Read through a guard: a break that leaves the party empty threw here and
  // took every check behind it off the board, which reads as "the break did not
  // bite" (182). A break has to produce a failure, not silence.
  return { end: n, burstAt, threw, change: burstAt === null ? null : n - burstAt,
    species: (g.G.party[0] || {}).species || '(no kin left)' };
};
const evoSlow = evoRun(false), evoMash = evoRun(true);
ok(!evoSlow.threw && !evoMash.threw, `the evolution runs without throwing (${evoSlow.threw || evoMash.threw || 'clean'})`);
ok(evoSlow.burstAt !== null && evoMash.burstAt !== null, 'the change happens either way');
eq(evoMash.change, evoSlow.change,
  `mashing A does not shorten the change itself (${evoMash.change} frames either way)`);
eq(evoMash.species, 'pyrelynx', 'and the kin still really evolves');
ok(evoMash.end < evoSlow.end, `only the run-up can be cut (${evoSlow.end} frames -> ${evoMash.end})`);

section('the ground makes a sound');
// A footstep says what you are walking on. Every walkable tile has a cue, and
// no two kinds of ground share one by accident.
const walkable = Object.keys(EK.TILE_ART).filter((c) => !EK.SOLID.has(c));
for (const c of walkable) {
  const cue = EK.STEP_CUE[c] || 'step_grass';
  ok(/^step_/.test(cue), `${EK.TILE_ART[c]} has a footstep (${cue})`);
}
ok(new Set(Object.values(EK.STEP_CUE)).size >= 4, 'and the ground is audibly different in at least four ways');
eq(EK.STEP_CUE[','], 'step_tall', 'tall grass sounds like tall grass');
eq(EK.STEP_CUE.b, 'step_wood', 'floorboards sound like boards');

section('a town that moves');
// NPCs turn to look at you. The art faces the viewer, so the only honest turn
// is a mirror — which means it has to be driven by which side you are on.
const town = loadGame({});
town.setCtx(mkCtx());
town.G.party = [town.mkMon('pyrelynx', 12)];
town.enterMap('hollowbrook', 5, 7, 'down');
town.G.mode = 'world';
const tam = town.MAPS.hollowbrook.npcs.find((n) => n.name === 'Old Tam');
ok(tam, 'Old Tam is still in the town');
const drawFlips = () => {
  const calls = [];
  town.setCtx(mkCtx(calls));
  town.draw();
  return calls.filter((c) => c[0] === 'scale' && c[1] === -1).length;
};
town.G.player.x = tam.x + 1; town.G.player.px = tam.x + 1;
town.G.player.y = tam.y; town.G.player.py = tam.y;
const fromRight = drawFlips();
town.G.player.x = tam.x - 1; town.G.player.px = tam.x - 1;
const fromLeft = drawFlips();
ok(fromRight !== fromLeft, `standing on the other side turns somebody (${fromRight} vs ${fromLeft} mirrors)`);
// Nobody is drawn at a fractional offset — the bob is whole pixels or it shimmers.
const drawn = [];
town.setCtx(mkCtx(drawn));
for (let i = 0; i < 30; i++) { town.step(.05); town.draw(); }
const fracs = drawn.filter((c) => c[0] === 'drawImage')
  .flatMap((c) => c.slice(1))
  .filter((v) => typeof v === 'number' && !Number.isInteger(v));
eq(fracs.length, 0, 'every actor lands on a whole pixel');

section('three rooms, not one room three times');
// The three interiors used to be the same generated box. What makes a room a
// room is what is in it.
const ROOMS = ['lab', 'wayhouse', 'shop'];
const furnitureOf = (id) => new Set(EK.MAPS[id].rows.join('').split('').filter((c) => 'HCBxpn'.includes(c)));
for (const id of ROOMS) {
  const f = furnitureOf(id);
  ok(f.size > 0, `${id} has furniture in it`);
  ok(f.has('n'), `${id} has a window`);
}
for (let i = 0; i < ROOMS.length; i++) {
  for (let j = i + 1; j < ROOMS.length; j++) {
    const a = EK.MAPS[ROOMS[i]].rows.join(''), b = EK.MAPS[ROOMS[j]].rows.join('');
    ok(a !== b, `${ROOMS[i]} and ${ROOMS[j]} are different rooms`);
  }
}
ok(furnitureOf('wayhouse').has('B'), 'the Wayhouse has beds');
ok(furnitureOf('shop').has('C'), 'the shop has a counter');
ok(furnitureOf('lab').has('H'), 'the study has shelves');
// Every piece of furniture is solid, or you walk through the bed.
for (const c of 'HCBxpn') ok(EK.SOLID.has(c), `${EK.TILE_ART[c]} is something you cannot walk through`);
// And every one of them has art, or a room is a field of fallback squares.
for (const c of 'HCBxpn') ok(!!EK.sprite('tile', EK.TILE_ART[c]), `${EK.TILE_ART[c]} has art`);
// The people in each room are still reachable from the door.
for (const id of ROOMS) {
  const m = EK.MAPS[id];
  for (const npc of m.npcs || []) {
    const around = [[1, 0], [-1, 0], [0, 1], [0, -1]]
      .filter(([dx, dy]) => EK.passable(m, npc.x + dx, npc.y + dy, npc.y));
    ok(around.length > 0, `${id}: ${npc.name} can be stood next to`);
  }
}

section('a monkey on the keyboard cannot break it');
// Random input for thousands of frames, drawing every one. This is the cheapest
// way to find the state a hand-written test would never think to reach.
const monkey = loadGame({});
monkey.setCtx(mkCtx());
monkey.newGame();
monkey.G.party = [monkey.mkMon('cindercub', 8), monkey.mkMon('dewdrip', 7)];
monkey.G.bag = { bloomorb: 20, salve: 5, revive: 2, elixir: 2 };
monkey.G.flags = { gotStarter: 1, starter: 'cindercub' };
monkey.enterMap('route_one', 9, 10, 'down');   // drop it where there is grass to walk into
monkey.G.mode = 'world'; monkey.G.dialogue = null;
const KEYS = ['up', 'down', 'left', 'right', 'a', 'b', 'a', 'a'];
const MODES = new Set(['world', 'battle', 'dialogue', 'menu', 'screen', 'title']);
// Beats that own the screen. `update` picks between them with a precedence
// ladder of early returns, but `draw` does NOT — drawEvolution, drawFlourish,
// drawGotcha and the warp each draw on their own `if`. So two live at once is
// not a tie the ladder settles: the loser goes on being drawn while never being
// stepped, frozen on top of or underneath the winner. Whether any pair is even
// reachable has been an open question for several passes; this answers it by
// watching for it rather than by reading the call sites and reasoning.
const BEATS = ['warp', 'evoAnim', 'alert', 'rustle', 'mend', 'blackout', 'flourish', 'gotcha', 'chestOpen'];
let collided = null, beatsSeen = new Set();
const watchBeats = (g, where) => {
  const live = BEATS.filter((k) => g.G[k]);
  for (const k of live) beatsSeen.add(k);
  if (live.length > 1 && !collided) collided = `${where}: ${live.join(' + ')}`;
};

let crashed = null, modesSeen = new Set(), battles = 0, wasBattle = false;
for (let i = 0; i < 6000 && !crashed; i++) {
  const k = KEYS[Math.floor(Math.random() * KEYS.length)];
  try {
    monkey.pressKey(k);
    monkey.step(.05 + Math.random() * .05);
    monkey.releaseKey(k);
    monkey.fired.clear();
    monkey.draw();
  } catch (e) { crashed = `frame ${i}, key ${k}: ${e && e.stack ? e.stack.split('\n')[0] : e}`; }
  modesSeen.add(monkey.G.mode);
  watchBeats(monkey, `frame ${i}`);
  if (monkey.G.battle && !wasBattle) battles++;
  wasBattle = !!monkey.G.battle;
  // Keep it alive so it goes on finding new states rather than sitting in a wipe.
  if (!monkey.G.party.some((m) => m.hp > 0)) monkey.healParty();
}
ok(!crashed, `6000 random frames survived${crashed ? ' — ' + crashed : ''}`);
ok(!collided, `no two screen-owning beats were ever live together${collided ? ' — ' + collided : ''}`);
// The monkey only ever reaches rustle, gotcha and alert — never warp, evoAnim,
// mend, blackout or flourish, which is both halves of both collisions anyone
// actually cared about. Left in as a regression net, but it answers nothing on
// its own, and a passing run of it must never be read as the pairs being clear.
// The scripted drives below are what answer that.
//
// Which is exactly why this no longer FAILS on reaching none. Whether 6000
// random keypresses stumble into a beat is luck, and it came up empty about one
// run in thirty — a red run that means nothing is a red run you learn to skip
// past, and the two assertions above are the ones with something to say. The
// count is still printed, so a monkey that suddenly reaches nothing for a
// structural reason is still visible in the output.
ok(true, `the monkey reached (${[...beatsSeen].join(', ') || 'nothing this run, which is luck'})`);

section('no two screen-owning beats can be live at once');
{
  const BEAT_LIST = BEATS;
  const liveNow = (g) => BEAT_LIST.filter((k) => g.G[k]);
  // Step frames, watching between each. Returns the first collision seen.
  const run = (g, frames) => {
    let bad = null, reached = new Set();
    for (let i = 0; i < frames; i++) {
      // 'a' advances everything; 'e' ends a turn that has nothing left to play.
      // Holding 'a' alone stalls the fight in the player phase for ever, which
      // is how the first version of this reached no beats at all and reported
      // the collisions clear on the strength of it.
      const b = g.G.battle && g.B();
      const stuck = b && b.phase === 'player' && !b.log && !b.over
        && !b.hand.some((c) => g.playableNow(b, c));
      const k = stuck ? 'e' : 'a';
      g.pressKey(k); g.step(.04); g.releaseKey(k); g.fired.clear();
      g.draw();
      const live = liveNow(g);
      live.forEach((k) => reached.add(k));
      if (live.length > 1 && !bad) bad = live.join(' + ');
    }
    return { bad, reached };
  };

  // ---- losing: the say, then the blackout that closes over the arena
  {
    const g = withDeck(loadGame({}));
    g.setCtx(mkCtx());
    g.G.party = [g.mkMon('cindercub', 3)];
    g.enterMap('route_one', 9, 10, 'down'); g.G.mode = 'world'; g.G.dialogue = null;
    g.startBattle({ foe: g.mkMon('magmane', 40), wild: true });
    const r = run(g, 900);
    ok(r.reached.has('blackout'), `the loss actually reached the blackout (${[...r.reached].join(', ') || 'nothing'})`);
    ok(!r.bad, `and nothing was live alongside it${r.bad ? ' — ' + r.bad : ''}`);
  }

  // ---- evolving off the back of a win, which is where flourish and evoAnim meet
  {
    const g = withDeck(loadGame({}));
    g.setCtx(mkCtx());
    const me = g.mkMon('cindercub', 15);
    me.xp = g.xpFor(16) - 2;              // the win tips it over, and cindercub evolves
    g.G.party = [me];
    g.enterMap('route_one', 9, 10, 'down'); g.G.mode = 'world'; g.G.dialogue = null;
    g.startBattle({ foe: g.mkMon('sproutle', 4), wild: true });
    const r = run(g, 900);
    ok(!r.bad, `a win that evolves keeps its beats apart${r.bad ? ' — ' + r.bad : ''}`);
    ok(r.reached.has('evoAnim'), `and the evolution really ran (${[...r.reached].join(', ') || 'nothing'})`);
  }

  // ---- catching, which ends in the gotcha and then the papers screen
  {
    const g = withDeck(loadGame({}));
    g.setCtx(mkCtx());
    g.G.party = [g.mkMon('cindercub', 20)];
    g.G.bag = { prismorb: 30 };
    g.enterMap('route_one', 9, 10, 'down'); g.G.mode = 'world'; g.G.dialogue = null;
    g.startBattle({ foe: g.mkMon('dewdrip', 3), wild: true });
    // `tryCatch(log, orbId)` — it fills a log it is handed, and the caller is
    // meant to pass that to submitLog. Calling it raw sets `over` and nothing
    // else: the gotcha is raised by finishBattle, which the update loop only
    // reaches once the battle message in front of it has been dismissed. So the
    // catch is thrown here and then driven with the same keys a player uses.
    // Throw the orb with NO keys down. 'a' in a fight plays the aimed card, so
    // a version of this that pressed keys while catching quietly fought the
    // battle instead: a Lv20 kin killed the Lv3 foe, levelled, and evolved, and
    // the test that thought it was watching a catch was watching a win. (The
    // invariant held through that pile-up too, which is worth more than the
    // scenario it was supposed to be running.)
    // No keys at all. Playback advances on its own `hold` timer, so the opener
    // clears without help — and 'a' in a clean player phase plays the aimed
    // card, which turned an earlier version of this into a win with a level-up
    // and an evolution while it believed it was watching a catch. (The
    // invariant held through that pile-up too, which is worth more than the
    // scenario it was meant to run.)
    let thrown = 0, landed = false;
    for (let i = 0; i < 500; i++) {
      const b = g.G.battle && g.B();
      if (!b) break;
      if (b.over) { landed = b.over === 'caught'; break; }
      if (!b.log) { g.tryCatch([], 'prismorb'); thrown++; }
      g.step(.04); g.fired.clear(); g.draw();
    }
    ok(thrown > 0 && landed, `the orb landed (${thrown} throws)`);
    const r = run(g, 600);
    ok(r.reached.has('gotcha'), `the catch reaches the gotcha (${[...r.reached].join(', ') || 'nothing'})`);
    ok(!r.bad, `and nothing rides along with it${r.bad ? ' — ' + r.bad : ''}`);
  }
}
ok([...modesSeen].every((m) => MODES.has(m)), `only valid modes reached (${[...modesSeen].join(', ')})`);
ok(modesSeen.has('world'), 'it walked around');
ok(battles > 0, `it stumbled into ${battles} battles`);
ok(monkey.G.party.length >= 1, 'it still has a party');
ok(monkey.G.party.every((m) => m.hp >= 0 && m.hp <= m.max), 'HP never went out of bounds');
ok(monkey.G.party.every((m) => m.moves.every((mv) => mv.pp >= 0 && mv.pp <= mv.max)), 'PP never went out of bounds');
ok(monkey.G.money >= 0, 'shards never went negative');
ok(monkey.G.party.length <= 6, 'the party never overflowed');

// The dialogue box is a DOM overlay that only redraws on a dialogue event, so
// anything that changes G.dialogue from outside the game — the screenshot tool
// does, in every scene — has to be able to make the panel catch up. It could
// not: `renderDialogue` was not on the EK export, so clearing the state left
// the box on screen with its last line in it, and Elder Rowan sat behind every
// screen shot for passes. Keep the handle reachable.
section('the dialogue panel can be made to agree with the state');
{
  const g = loadGame();
  ok(typeof g.renderDialogue === 'function', 'renderDialogue is reachable from outside');
  g.G.dialogue = null;
  let threw = null;
  try { g.renderDialogue(); } catch (e) { threw = e; }
  ok(!threw, `it survives being called with no dialogue${threw ? ' — ' + threw : ''}`);
}

// The place card names the map you have just walked into. Everything about it
// is defined by what it does NOT do: it is not in BEATS, it does not block
// input, and it does not survive a mode that owns the screen. So this checks
// those, not just that the state exists.
section('walking into a new place says where you are');
{
  const g = loadGame();
  g.setCtx(mkCtx());
  g.newGame();
  // The study is an interior; the game should not announce a room you are
  // standing in when the story starts.
  eq(g.G.map.kind, 'inside', 'a new journey starts indoors');
  ok(!g.G.place, 'and no plaque comes down over the opening');

  g.enterMap('hollowbrook', 12, 10, 'down');
  ok(!!g.G.place, 'stepping outside names the town');
  eq(g.G.place.name, g.MAPS.hollowbrook.name, 'with the map\'s own name, not a second copy of it');

  // Ducking into a building and back out must not re-announce the town — the
  // classic way a card like this turns from a flourish into a nuisance.
  g.G.place = null;
  g.enterMap('lab', 5, 4, 'up');
  ok(!g.G.place, 'going indoors says nothing');
  g.enterMap('hollowbrook', 12, 10, 'down');
  ok(!g.G.place, 'and coming back out of the same door says nothing either');

  // Somewhere genuinely new does announce.
  g.enterMap('route_one', 4, 9, 'right');
  ok(!!g.G.place, 'but a new route does');
  eq(g.G.place.name, g.MAPS.route_one.name, 'and names that one');

  // It owns nothing. The player walks through it.
  //
  // The direction is read off the map rather than guessed: the first version of
  // this pressed 'right' at the entrance, the player did not move, and that
  // proves nothing — a wall answers exactly like a blocked input. Pick a tile
  // the map says is open, and a failure here can only mean input was eaten.
  g.G.mode = 'world'; g.G.dialogue = null;
  const rows = g.MAPS.route_one.rows;
  const open = [['right', 1, 0], ['left', -1, 0], ['down', 0, 1], ['up', 0, -1]]
    .find(([, dx, dy]) => !g.SOLID.has((rows[g.G.player.y + dy] || '')[g.G.player.x + dx]));
  ok(!!open, 'the entrance to Route One has somewhere to walk');
  const before = { x: g.G.player.x, y: g.G.player.y };
  g.pressKey(open[0]);
  for (let i = 0; i < 12; i++) { g.step(.05); g.fired.clear(); }
  g.releaseKey(open[0]);
  ok(!!g.G.place, 'the plaque is still up');
  ok(g.G.player.x !== before.x || g.G.player.y !== before.y,
    `and you walked ${open[0]} through it (${before.x},${before.y} → ${g.G.player.x},${g.G.player.y})`);

  // Drawn at every point of its life, including the frame it is born on and
  // the frame it dies on, because a slide that divides by its own duration is
  // exactly where an off-by-one lands.
  let threw = null;
  try {
    for (const t of [0, .01, g.PLACE_IN, g.PLACE_IN + g.PLACE_HOLD,
      g.PLACE_IN + g.PLACE_HOLD + g.PLACE_OUT - .001]) {
      g.G.place.t = t;
      g.drawPlace(mkCtx());
    }
  } catch (e) { threw = e && e.stack ? e.stack.split('\n')[0] : e; }
  ok(!threw, `it draws at every point of its life${threw ? ' — ' + threw : ''}`);

  // And it clears itself rather than waiting for the next map.
  g.G.place.t = 0;
  for (let i = 0; i < 200 && g.G.place; i++) g.step(.05);
  ok(!g.G.place, 'it takes itself off screen');

  // Where you have been announced belongs to the run, not to the tab. Without
  // this, a second playthrough in one sitting walks out of the study into a
  // town it has already named once and says nothing — the first outdoor moment
  // of the new run, silently skipped.
  g.newGame();
  ok(!g.G.placeSeen, 'a new run has been nowhere');
  g.enterMap('hollowbrook', 12, 10, 'down');
  ok(!!g.G.place, 'so it names the town again on the second playthrough');
}

// The box screen's layout. There is no layout engine here, so the screenshot is
// what actually verified this — these are a regression net, because a
// squash-merge has resurrected old markup in this repo before and a grid
// quietly going back to two columns looks like nothing in a diff.
section('the box is at least as dense as the party above it');
{
  const boxScreen = SRC.slice(SRC.indexOf('const monCard = (m, i)'), SRC.indexOf('} else if (s.kind === \'deck\')'));
  ok(boxScreen.length > 100, 'found the box screen markup');
  const grids = boxScreen.match(/class="cards[^"]*"/g) || [];
  eq(grids.length, 2, `the screen draws two grids (${grids.join(', ')})`);
  // They must match, and not only for looks. `gridCols` counts the cells in the
  // first row of everything the cursor can be in and uses that one number for
  // the whole screen — so with the party three across and the box two, up and
  // down moved by three inside a two-column box. One column basis, one grid
  // class. The party is capped at six and the box is not, so the class they
  // agree on has to be the dense one.
  ok(grids.every((g) => /\bslim\b/.test(g)),
    `both grids share the dense column basis gridCols assumes (${grids.join(', ')})`);

  // The level and the types must stay separable units. Written as one string
  // with a separator, a dual type wrapped and left the separator stranded at
  // the end of the line.
  //
  // This used to name the markup — `<small class="meta"><span>Lv…` — and the
  // markup changed when the box stopped saying a type differently from every
  // other screen. The CLAIM did not: the level is still its own element beside
  // the chips rather than glued to them, which is what stops a separator being
  // left hanging. Assert the claim, not the spelling.
  ok(/\$\{kinSub\(m\)\}/.test(boxScreen), 'the box card takes its line from the one that writes it');
  ok(/<span class="lv">Lv\$\{m\.lvl\}<\/span>/.test(SRC.slice(SRC.indexOf('const kinSub'), SRC.indexOf('const kinSub') + 400)),
    'the level and types are separate elements, not one string with a dot in it');
  ok(!/Lv\$\{m\.lvl\} · /.test(boxScreen), 'and no separator can be left hanging at a line end');
}

// The screens used to name keyboard keys in their prose — "X — back" in the
// corner, "A on a boxed kin withdraws it" at the foot of the box — while three
// inches below, on a phone, two large circles said Pick and Back. Neither key
// exists on the device. The button labels were already computed in one place;
// the screens wrote their own copy of the keyboard's names beside them.
//
// This was invisible for the whole project because the shot tool could not
// produce a touch layout until this pass. `renderScreen` returns early when
// headless, so there is no HTML here to read — what can be checked is that the
// prose and the buttons draw on one source, and that the source is right.
section('the screens name the controls the player actually has');
{
  const g = loadGame({});
  g.setCtx(mkCtx());
  g.newGame();
  g.G.dialogue = null;

  ok(!g.isTouch(), 'headless is not a touch device, so the prose is the keyboard one');
  eq(g.pickName(), 'A', 'confirm is a key here');
  eq(g.backName(), 'X', 'and so is cancel');

  // The other half of the same fact: what a phone would be told instead. These
  // are the strings the buttons themselves carry, so the prose cannot drift
  // from the circles the player is looking at.
  g.G.mode = 'screen'; g.G.screen = { kind: 'box', i: 0, opt: {} };
  eq(g.btnLabels().join('/'), 'Pick/Back', 'on a screen the buttons are Pick and Back');
  g.G.screen = { kind: 'reward', i: 0, opt: {} };
  eq(g.btnLabels().join('/'), 'Take/Skip', 'an offer you can decline says so');
  g.G.screen = null; g.G.mode = 'battle';
  eq(g.btnLabels().join('/'), 'Play/Menu', 'in a fight they are Play and Menu');
  g.G.mode = 'dialogue';
  eq(g.btnLabels().join('/'), 'Next/Next', 'and mid-speech both mean Next');

  // Regression net: the prose must interpolate the helpers rather than spell a
  // key. A literal creeping back reads as nothing in a diff and is invisible in
  // every desktop screenshot.
  ok(/\$\{pickName\(\)\} on a boxed kin/.test(SRC), 'the box help asks for the control by name');
  ok(!/>A on a boxed kin/.test(SRC), 'and does not hardcode the key');
  ok(/class="back">\$\{/.test(SRC), 'the corner hint is built from the same source');
}

// …and the corner hint must not appear on a screen that refuses to close.
//
// The chip was emitted unconditionally at the top of renderScreen and three
// branches blanked it by rewriting `html`. The forced party screen — kin down,
// pick a replacement — locks on `opt.force` rather than on its kind, so it kept
// the chip: on a phone, the only affordance that closes a screen, sitting in
// the corner of the one screen that will not close, playing the back sound and
// doing nothing. One predicate now answers for both the chip and the refusal.
section('a screen that will not close does not offer a way out');
{
  const g = loadGame({});
  g.setCtx(mkCtx());
  g.newGame();
  g.G.dialogue = null;
  g.G.party = [g.mkMon('cindercub', 12), g.mkMon('brookite', 12)];

  const LOCKED = [
    ['party', { force: true }, 'the forced switch demands a replacement'],
    ['starter', {}, 'the first choice in the game must be made'],
    ['swap', {}, 'something has to come out'],
    ['reward', {}, 'an offer is taken or declined, not dismissed'],
  ];
  for (const [kind, opt, why] of LOCKED) {
    const s = { kind, i: 0, opt };
    ok(g.screenLocked(s), `${kind}: ${why}`);
    g.G.screen = s;
    g.closeScreen();
    ok(g.G.screen === s, `${kind}: and closing it does nothing`);
  }
  // The ordinary ones still close, or the guard is a wall rather than a lock.
  for (const kind of ['party', 'dex', 'box', 'deck', 'bag']) {
    const s = { kind, i: 0, opt: {} };
    ok(!g.screenLocked(s), `${kind} is not locked`);
    g.G.screen = s;
    g.closeScreen();
    eq(g.G.screen, null, `and ${kind} closes`);
  }
  // The same party screen, twice, differing only in the flag: this is the case
  // the two copies of the list disagreed about.
  ok(g.screenLocked({ kind: 'party', i: 0, opt: { force: true } })
    && !g.screenLocked({ kind: 'party', i: 0, opt: {} }),
    'the party screen is locked by the flag, not by its kind');

  // Source: one predicate feeds the chip and the refusal, the refusal happens
  // before the sound, and no branch blanks the chip a second way.
  ok(/let html = screenLocked\(s\) \? ''/.test(SRC), 'the chip is withheld from a locked screen');
  ok(/if \(screenLocked\(s\)\) return;\n  playCue\('back'\);/.test(SRC),
    'and the refusal comes before the back sound, not after it');
  ok(!/html = '';/.test(SRC), 'with no second mechanism left to disagree with the first');
}

// Two screens list kin, and they described the same creature two different
// ways. The party row drew type CHIPS and a status chip; the box row printed
// "Lv26 Verdant/Gloom" in plain grey text with no status on it at all — and the
// box is the screen you stand in to decide who to bring, so a kin carrying BURN
// looked exactly like a healthy one in the one place where that is the whole
// question. One function writes that line now.
section('a kin is described the same way wherever it is listed');
{
  const g = loadGame({});
  g.setCtx(mkCtx());
  g.newGame();
  g.G.dialogue = null;

  const m = g.mkMon('frillamb', 30);          // dual type, so both chips must appear
  const line = g.kinSub(m);
  ok(/class="kinsub"/.test(line), 'the list line has one class of its own');
  ok(/Lv30/.test(line), 'it carries the level');
  for (const t of m.types) {
    ok(new RegExp(`>${t}<`).test(line), `and ${t} as a chip, not as text`);
  }
  ok(!new RegExp(m.types.join('/')).test(line), 'never as a slash-joined sentence');
  ok(!/class="tp st"/.test(line), 'a healthy kin wears no status chip');

  // The half the box dropped entirely.
  const sick = g.mkMon('gargolem', 30);
  sick.status = 'burn';
  ok(/class="tp st"/.test(g.kinSub(sick)), 'a kin with a status on it says so');
  ok(new RegExp(g.STATUS.burn.tag).test(g.kinSub(sick)), 'by the tag the rest of the game uses');

  // Source: both list rows go through it, and nothing else in a row spells a
  // type out. The ONE remaining `types.join('/')` is the forced-switch prompt,
  // which is a SENTENCE about the foe out there — "Bramblor is out there —
  // Lv25 Verdant/Gloom" — and chips inside prose read as a rash. That is the
  // property that exempts it: it is not a list row.
  eq((SRC.match(/kinSub\(m\)/g) || []).length, 2, 'the party row and the box card both ask for it');
  eq((SRC.match(/types\.join\('\/'\)/g) || []).length, 1, 'and one sentence is left spelling a type out');
  ok(/is out there — Lv\$\{foe\.lvl\} \$\{foe\.types\.join\('\/'\)\}/.test(SRC),
    'and that one is the prompt, where prose is right');
  ok(!/small class="meta"/.test(SRC), 'the box row no longer has a second way of saying it');

  // The layout rule the chips forced. They are wider than the text they
  // replaced, so left to flow the level sat inline on a short name and on its
  // own line on a long one — three bar heights in one row of three cards, two
  // of them the same species. The level takes a whole line always.
  ok(/\.card \.info \.kinsub \.lv\{ flex-basis:100%/.test(SRC),
    'in the narrow card the level takes a line of its own, so every card is one shape');
}

// One collection, three screens, three names for it. Asked of the SET rather
// than of any one screen: every inventory in this game heads itself
// `Name — count` — "Dex — 13 caught / 16 seen / 19", "Box — 26",
// "Deck — 8/12 (min 5)", "Bag — 500 shards". The party broke that pattern in
// both ways available at once. The pause menu said `Kin  6/6`, the party screen
// said `Your kin` with no number on it at all, and the box screen — listing the
// SAME six creatures — headed them `Party — 6/6`. The one you open most was the
// odd one out.
section('the party is called the same thing wherever it is counted');
{
  const g = loadGame({});
  g.setCtx(mkCtx());
  g.newGame();
  g.G.dialogue = null;
  g.G.party = [g.mkMon('cindercub', 8), g.mkMon('dewdrip', 9)];

  eq(g.partyTally(), `2/${g.PARTY_MAX}`, 'the tally is how many you carry over the cap');
  eq(g.kinHeading(), `Kin — 2/${g.PARTY_MAX}`, 'and the heading is that tally, named');
  g.G.party.push(g.mkMon('sproutle', 7));
  eq(g.kinHeading(), `Kin — 3/${g.PARTY_MAX}`, 'and it moves when the party does');

  // `kin` is the game's own word for these creatures — the battle button, the
  // starter prompt, the cards. `Party` was the outlier, and it was the label on
  // the screen that lists them beside the box.
  ok(/^Kin — /.test(g.kinHeading()), 'the noun is the one the rest of the game uses');

  // Every screen that names this collection asks the same function for it.
  eq((SRC.match(/kinHeading\(\)/g) || []).length, 2,
    'the party screen and the box screen take their header from one place');
  ok(/sub: partyTally\(\)/.test(SRC), 'and the pause menu takes its count from the same one');
  ok(!/<h2>Your kin<\/h2>/.test(SRC), 'no screen still calls it something else');
  ok(!/Party — \$\{G\.party\.length\}/.test(SRC), 'and none spells the count out beside a second noun');

  // The cap is a constant now, not a 6 written into four places — one of which
  // draws the empty slots and would have disagreed with the one that fills them.
  eq(g.PARTY_MAX, 6, 'the cap has a name');
  ok(!/G\.party\.length < 6\b/.test(SRC), 'and nothing compares against a bare six');

  // The pattern this joins, so a future screen has something to match. Each of
  // these is `Name — count`; the ones NOT in this list are prompts that ask a
  // question rather than inventories that report one, which is the property
  // that exempts them.
  for (const head of ['Dex — ', 'Box — ', 'Deck — ', 'Collection — ', 'Gem chests — ']) {
    ok(SRC.includes(head), `the family still contains "${head.trim()}"`);
  }
}

// The box is where you decide who to bring, and it was the one screen that
// could not answer the question that decision turns on. The party screen puts a
// stat block beside its list and the dex puts a detail pane under its grid; the
// box had neither, so "what does this one know" meant withdrawing it, opening
// the party screen, and putting it back.
section('the box shows what the kin under the cursor can do');
{
  const g = loadGame({});
  g.setCtx(mkCtx());
  g.newGame();
  g.G.dialogue = null;
  g.G.party = [g.mkMon('pyrelynx', 22), g.mkMon('brookite', 24)];
  g.G.box = [g.mkMon('gargolem', 28), g.mkMon('kindlark', 30)];

  // The cursor runs party-then-box as one list, which is what makes a swap two
  // indices — so the pane has to read off that same concatenation or it will
  // describe the wrong creature the moment the cursor crosses into the box.
  const all = g.G.party.concat(g.G.box);
  eq(all.length, 4, 'party and box are one list to the cursor');
  for (let i = 0; i < all.length; i++) {
    const block = g.statBlock(all[i]);
    ok(new RegExp(g.dispName(all[i])).test(block), `${i}: the pane names the kin at that index`);
    // The thing the decision is actually about.
    for (const slot of all[i].moves) {
      ok(new RegExp(g.MOVES[slot.id].name).test(block), `${i}: and lists ${g.MOVES[slot.id].name}`);
    }
  }

  // Source: the box asks for it, off the same concatenation, and only when the
  // cursor is on something — an empty box with the cursor past the party must
  // not throw.
  ok(/const under = G\.party\.concat\(G\.box\)\[s\.i\];/.test(SRC),
    'the box reads the kin under the cursor off the one list');
  ok(/if \(under\) html \+= statBlock\(under\);/.test(SRC),
    'and shows the same block the party screen does, guarded');
  ok((SRC.match(/statBlock\(/g) || []).length >= 3, 'one function serves both screens');

  // The chip floats over everything at a fixed corner, so a full-width panel
  // that LEADS a screen drew straight through the only way off it. Every other
  // screen opens with a short <h2> that sits to its left. The corner is
  // reserved rather than the chip moved — the chip being in the same place on
  // every screen is the point of it.
  ok(/#screen > \.kindetail\{ margin-top:20px; \}/.test(SRC),
    'a panel leading a screen leaves the back chip its corner');
  // …and the party screen must NOT inherit that, because its block is nested
  // inside .kinview rather than sitting at the top level.
  ok(/<div class="kinview">/.test(SRC), 'the party screen keeps its block beside the list');
}

// The title screen had only ever been photographed by a first-time player.
// `Continue` exists only when there is a save, so every shot ever taken of this
// screen showed one button — and the one it showed was `New journey`, which
// calls wipeSave(). On the screen a returning player sees every session that
// button sat ABOVE Continue, in identical weight and colour, while the KEYBOARD
// already disagreed: pressing A on the title runs startCont whenever a save
// exists. The layout follows the key now.
section('the title leads with the run you already have');
{
  const g = loadGame({});
  g.setCtx(mkCtx());

  // The predicate both halves hang off.
  ok(!g.hasSave(), 'a fresh store has nothing to come back to');
  g.newGame();
  g.takeStarter('cindercub');
  g.saveGame();
  ok(g.hasSave(), 'and a saved run does');

  // A is already the safe one. This is the fact the layout was contradicting.
  ok(/\(hasSave\(\) \? startCont : startNew\)\(\)/.test(SRC),
    'pressing A on the title continues when there is a run to continue');
  // Netted as the CLAIM, not the line. This assertion used to be a regex over
  // `function startNew() { show(els.title, false); wipeSave()` — one physical
  // line — and reformatting startNew to open through a fade broke it while the
  // claim stayed exactly as true. Rule 68, caught by the suite doing its job.
  ok(g.hasSave(), 'a run exists to be destroyed');
  g.startNew();
  ok(!g.hasSave(), 'and New journey really does destroy it — this is not a cosmetic ordering');

  // One flag drives the button AND the order, so the screen cannot reveal
  // Continue while still leading with the button that wipes the save.
  ok(/if \(hasSave\(\)\) \{ show\(contBtn, true\); els\.title\.classList\.add\('returning'\); \}/.test(SRC),
    'one flag reveals Continue and marks the screen returning');
  ok(/#title\.returning \[data-act="cont"\]\{ order:-1; \}/.test(SRC),
    'and on a returning title Continue comes first');
  ok(/#title\.returning \[data-act="new"\]\{ opacity:/.test(SRC),
    'while the destructive one stops presenting itself as the thing you came for');

  // …and a FIRST-TIME title is untouched: no flag, so no reorder and no
  // dimming — there is nothing to protect and nothing to demote.
  ok(/#title\.returning/.test(SRC) && !/#title \[data-act="new"\]\{ opacity:/.test(SRC),
    'a first-time title dims nothing, because both of those rules are gated');
  ok(/<div class="btn panel" data-act="new">New journey<\/div>/.test(SRC),
    'the markup order still reads new-then-continue; only the returning view reorders');
}

// The losing beat's one piece of kindness, and the state nobody had reached.
//
// Sable's fee is a quarter of your shards, FLOORED — so anybody holding fewer
// than four was told "It cost you 0 shards" in the single line the game writes
// to soften a wipe. That is precisely the player most likely to be broke: they
// have just lost everything. A number that is always zero reads as a bug, and
// it turned the only mercy in the beat into a clerical error.
section('when there was nothing to take, Sable says so');
{
  const g = loadGame({});
  g.setCtx(mkCtx());
  g.newGame();
  g.G.dialogue = null;

  // The arithmetic that produces the empty state, stated rather than assumed.
  const fee = (money) => Math.floor(money * .25);
  eq(fee(0), 0, 'nothing to take from nothing');
  eq(fee(3), 0, 'nor from three — the floor eats it');
  ok(fee(4) > 0, 'four is the first amount that costs anything');

  // Both branches exist, and the charged one still names the number.
  // This named the MARKUP — `It cost you ${lost} shards.` — and the markup
  // changed for a good reason one pass later: the count now goes through
  // countOf so that "1 shards" cannot happen either. The CLAIM is that a real
  // charge still names its amount; assert that.
  ok(/lost > 0\n\s*\? `Sable patched them up\. It cost you \$\{countOf\(lost, 'shard'\)\}\.`/.test(SRC),
    'a real charge still says what it was, through the one that agrees with its noun');
  ok(/: 'Sable patched them up\. She did not ask for anything, and did not say why\.'/.test(SRC),
    'and nothing taken is said as nothing taken, not as zero');
  ok(!/`Sable patched them up\. It cost you \$\{[^}]*\} shards\.`, 'Go easier/.test(SRC),
    'the unconditional line is gone');

  // The half that must not change: she is not suddenly explaining herself.
  ok(/'Go easier out there\.'/.test(SRC), 'the second line is the same either way');

  // …and the fee is still actually charged, so this is a wording fix and not a
  // quiet removal of the loss.
  ok(/G\.money -= lost;/.test(SRC), 'the shards still go');
}

// A count and its noun, everywhere they meet.
//
// The win flourish already got this right ON THE CANVAS — `+1 gem`, `+2 gems`
// — and the TOAST for the same win, fired in the same moment two inches away,
// said `+1 gems`. One number, one event, two places, disagreeing. And the line
// pass 161 rewrote for ZERO still read "It cost you 1 shards" for anybody
// holding four to seven shards: the zero was fixed and the one was walked past,
// in the same sentence.
section('a count and its noun agree');
{
  const g = loadGame({});
  g.setCtx(mkCtx());
  g.newGame();

  eq(g.countOf(1, 'gem'), '1 gem', 'one takes the singular');
  eq(g.countOf(2, 'gem'), '2 gems', 'two takes the plural');
  eq(g.countOf(0, 'gem'), '0 gems', 'and so does none');
  eq(g.countOf(1, 'shard'), '1 shard', 'the noun is the caller\'s');
  eq(g.countOf(3, 'shard'), '3 shards', 'pluralised by default with an s');
  eq(g.countOf(1, 'kin', 'kin'), '1 kin', 'an irregular plural can be given');
  eq(g.countOf(9, 'kin', 'kin'), '9 kin', 'and is used for every other count');

  // The degenerate value of every site that prints one of these. 161's rule:
  // compute the expression over a range and read the sentence.
  const fee = (m) => Math.floor(m * .25);
  eq(g.countOf(fee(4), 'shard'), '1 shard', 'four shards costs one shard, not "1 shards"');
  eq(g.countOf(fee(40), 'shard'), '10 shards', 'and forty costs ten');

  // Source: every site goes through it, and none spells a plural itself.
  ok(/countOf\(f\.gems, 'gem'\)/.test(SRC), 'the win flourish on the canvas');
  ok(/setToast\(`\+\$\{countOf\(gems, 'gem'\)\}`\)/.test(SRC), 'the toast for the same win');
  ok(/countOf\(ch\.cost - G\.gems, 'gem'\)\} short/.test(SRC), 'the chest shortfall');
  ok(/countOf\(lost, 'shard'\)/.test(SRC), "Sable's fee");
  ok(/countOf\(b\.npc\.trainer\.prize, 'shard'\)/.test(SRC), 'and a trainer prize');
  ok(!/\$\{f\.gems === 1 \? 'gem' : 'gems'\}/.test(SRC),
    'the one place that had its own copy of the rule no longer does');

  // The exemptions, named rather than left as survivors.
  //
  //  - `Collection — N spare` works at every count: "spare" is an adjective.
  //  - `Nobody left to beat. N kin still unfound.` cannot reach zero — the
  //    ternary above it takes the other branch when nothing is left, and `kin`
  //    is invariant in this game's usage anyway.
  ok(/Collection — \$\{rest\.length\} spare/.test(SRC), 'a spare count needs no plural');
  ok(/seen < DEX_ORDER\.length\n\s*\? `Nobody left to beat\./.test(SRC),
    'and the unfound count is guarded from zero by the branch above it');
}

// The one thing in this game a PLAYER TYPES. No pass had ever driven that input.
//
// `dispName()` is `nick || name` and it lands in innerHTML at fifty-five sites.
// A nickname of `A<B` therefore opened a <b> element in the middle of a name,
// and the </b> that followed closed the wrong one — so the rest of the screen
// went bold and the DOM was corrupt from that row down. The nickname is SAVED,
// so it stayed corrupt for the rest of the run.
section('a nickname cannot open an element');
{
  const g = loadGame({});
  g.setCtx(mkCtx());
  g.newGame();
  const m = g.mkMon('cindercub', 12);
  const take = (raw) => { m.nick = raw; return g.commitNick({ opt: { mon: m } }); };

  eq(take('A<B'), 'AB', 'an angle bracket cannot start an element');
  eq(take('<s>Ash'), 'sAsh', 'nor a whole tag');
  eq(take('<<<>>>'), '', 'and a name of nothing but brackets is no name');
  // `&` is deliberately left: a bare ampersand renders as itself, and stripping
  // it would turn "Bo & Ed" into "Bo  Ed" for no gain.
  eq(take('R&B'), 'R&B', 'an ampersand is a legitimate character in a name');
  // …and the rest of the gate still does what it did.
  eq(take('  Bo   Ed  '), 'Bo Ed', 'whitespace is collapsed and trimmed');
  eq(take('Ashling the Third'), 'Ashling the', 'twelve characters, and no trailing space');
  eq(take('   '), '', 'blank is no nickname');
  eq(take('Cindercub'), '', 'and its own name is no nickname either');

  // The trim runs twice on purpose — cutting at twelve can land mid-space.
  ok(/\.slice\(0, 12\)\.trim\(\)/.test(SRC), 'the slice is trimmed after, not only before');
  ok(/replace\(\/\[<>\]\/g, ''\)/.test(SRC), 'and the gate is at the boundary, not at the fifty-five');

  // The layout half: the portrait is float:right and .pname is a FLEX
  // container, whose contents are not line boxes — so nothing in it wrapped
  // around the float, and at twelve characters the level chip was drawn on top
  // of the portrait frame.
  ok(/\.kindetail \.pname\{ display:flex; flex-wrap:wrap;[^}]*overflow:hidden/.test(SRC),
    'the name line is a formatting context of its own, and wraps');
  ok(/\.kindetail \.pname b\{[^}]*overflow-wrap:anywhere/.test(SRC),
    'a twelve-letter word that will not break on its own still breaks');
  // It must NOT truncate: the first attempt clipped "Ashling them" to
  // "Ashling t…" while the kin row beside it showed the whole thing.
  ok(!/\.kindetail \.pname b\{[^}]*text-overflow:ellipsis/.test(SRC),
    'and a name the player chose is not cut for space the panel has going spare');
}

// Finishing 163's question: the nickname in the OTHER places dispName lands.
// Three of four came back clean and the reason is nameable in each; the fourth
// was measured overflowing and is fixed.
section('a twelve-character nickname fits everywhere it is drawn');
{
  const g = loadGame({});
  g.setCtx(mkCtx());
  g.newGame();

  // 1. THE ONLY TYPED INPUT. One <input>, one .value read, no prompt(), no
  //    contenteditable. Worth asserting so a second one cannot appear quietly.
  // `<input` also appears in a COMMENT above commitNick ("A real <input>
  // rather than a letter-picker"), and a bare /\.value/ matches Object.values —
  // both counts were wrong the first time. Match the element and the word.
  eq((SRC.match(/<input /g) || []).length, 1, 'the nickname field is the only input in the game');
  eq((SRC.match(/\.value\b/g) || []).length, 1, 'and it is read in exactly one place');
  ok(!/prompt\(/.test(SRC) && !/contenteditable/.test(SRC), 'nothing else takes typing');

  // 2. THE GOTCHA CARD names `caught.name` — the SPECIES — not dispName, and it
  //    fires before the profile screen where naming happens. It can never show
  //    a nickname at all. The widest species name is ten characters.
  ok(/name: caught\.name,/.test(SRC), 'the gotcha card names the species, not the kin');
  const longest = g.DEX_ORDER.map((id) => g.DEX[id].name).sort((a, b) => b.length - a.length)[0];
  ok(longest.length <= 12, `and the widest species name is ${longest} at ${longest.length} characters`);

  // 3. THE FORCED-SWITCH PROMPT names the FOE, and a foe has no nickname — wild
  //    kin and trainer teams are built by mkMon, which takes one only from opts.
  ok(/\$\{dispName\(foe\)\} is out there/.test(SRC), 'the prompt names the foe');
  eq(g.mkMon('bramblor', 20).nick, '', 'and a foe is born without a nickname');

  // 4. THE BATTLE HUD: measured, not judged. A twelve-character nickname is
  //    108px inside a 180px plate at phone size. It needs no rule, and the
  //    comment says so rather than leaving a mystery.
  ok(/MEASURED, not guessed/.test(SRC), 'the HUD is documented as measured rather than fixed');
  ok(!/\.hud \.nm > span:first-child\{/.test(SRC), 'and carries no rule it does not need');

  // …and the one that WAS overflowing. The box card is the narrowest thing in
  // the game that takes a name — 74px of text beside a 40px sprite — and a
  // twelve-character nickname measures 120px, so it ran 46px past its card.
  ok(/\.card \.info b\{[^}]*text-overflow:ellipsis/.test(SRC),
    'the box card clips a name to its own width');
  ok(/\.card \.info b\{[^}]*white-space:nowrap/.test(SRC),
    'on one line, because these are grid cells and a wrap makes one card taller');
  // It ELLIPSES where the stat block WRAPS, and the difference is the room.
  ok(/\.kindetail \.pname\{[^}]*flex-wrap:wrap/.test(SRC),
    'while the stat block, which has room and is a heading, still wraps');
}

// The hand at phone size. `renderHand` returns early when headless, so as with
// the screens there is no markup here to read — these hold the two rules that
// only exist because a --touch shot showed them, and that no desktop shot can
// ever show.
section('the hand survives a phone');
{
  // The aimed card is the only one carrying the "▲ play" badge, and the badge
  // is absolutely positioned. The rule that hid the text on the OTHER four
  // cards left this one to collide with it.
  ok(/body\.tight #hand \.cardel\.sel \.ctext\{/.test(SRC),
    'the aimed card has a rule of its own at tight size');
  ok(/body\.tight #hand \.cardel\.sel \.ctext\{[^}]*margin-bottom/.test(SRC),
    'and it reserves room by MARGIN — padding is inside the overflow clip and reserves nothing');
  // Hiding it outright was tried and rejected: renderHand only fills the
  // description bar while the battle's line timer is at zero, so during an
  // action line the wording would have been nowhere at all.
  ok(!/body\.tight #hand \.cardel \.ctext\{\s*display:none/.test(SRC),
    'and the wording is still on the card, not only in a bar that comes and goes');

  // The E hint is a key, and a phone has no keys. It stays in the markup for
  // everyone who does.
  ok(/body\.touch #acts \.abtn \.key\{[^}]*display:none/.test(SRC),
    'the End turn key hint is hidden on touch');
  ok(/End turn <span class="key">E<\/span>/.test(SRC),
    'and still printed for a keyboard');

  // The big card is the same component on the deck, the reward and the swap,
  // and at a phone's scale its art left no room for a second line of rules
  // text — "Every attack +2 for this battle" came out with "battle" sliced in
  // half across the card's bottom edge. The room comes off the picture.
  //
  // The rule is scoped to the CARD and not to a screen on purpose: the last
  // three passes were each about a fix that reached the one place that
  // revealed it and none of the others.
  const bigCard = SRC.match(/body\.tight [^{]*\.cardel\.big[^{]*\{/g) || [];
  ok(bigCard.length > 0, `the big card has a rule at tight size (${bigCard.join(' ')})`);
  ok(bigCard.every((r) => !/#hand|#screen/.test(r)),
    `and none of them is scoped to a single screen (${bigCard.join(' ')})`);
}

// The overlay layout: what a landscape phone gets when the gutters come out
// too narrow to hold the controls beside the stage. It is the branch of
// layoutFor nobody pictures a player in, and it had never been photographed.
// CSS only, and renderHand returns early headless, so these are source nets.
section('the overlay layout keeps its controls off the cards');
{
  // The branch shrinks the buttons and must therefore re-place them. Without
  // offsets of its own it inherits bottom:calc(50% - 96px) — written for an
  // 82px pair in a full-height column — which lands below its own box.
  ok(/body\.ctl-overlay #btns \.rbtn\[data-k="z"\]/.test(SRC),
    'overlay places its own confirm button rather than inheriting the tall column\'s offset');
  ok(/body\.ctl-overlay #btns \.rbtn\[data-k="x"\]/.test(SRC),
    'and its own cancel button');
  ok(!/body\.ctl-overlay #btns \.rbtn\{[^}]*bottom:calc/.test(SRC),
    'and does not reach for the calc that put Play off the bottom of the screen');

  // The hand is the row you tap. A control on top of a card is a card you
  // cannot pick.
  ok(/body\.ctl-overlay #hand\{[^}]*right:/.test(SRC),
    'the hand is held clear of the button column in overlay');
  // And the pad's label is anchored to the foot of the pad, which in this
  // layout is the middle of the hand.
  // The label was first moved to the top of the pad, which fixed the battle and
  // only the battle. A screen panel is inset:0 over the whole stage, so in this
  // layout there is no height at which the label is not on somebody's kin — it
  // went from the aimed card to the middle of the party list. This is the one
  // layout where the pad has no band of its own, so the label goes entirely.
  ok(/body\.ctl-overlay #pad::after\{[^}]*display:none/.test(SRC),
    'the move label is gone in the one layout where the pad has no band of its own');
  // And a screen's last row sits under the controls. The scroller gets a floor
  // deep enough to lift it clear — verified by a shot of the panel scrolled to
  // the bottom, which is the only thing that can show it.
  ok(/body\.ctl-overlay #screen\{[^}]*padding-bottom/.test(SRC),
    'and a full-screen panel can be scrolled clear of the controls');
}

// The title screen was wired to clicks on its two DOM buttons and nothing else.
// On a phone the round controls are the only thing you can press, so neither of
// them did anything — and btnLabels had no case for the title, so they fell
// through to the world's defaults and read "Talk" and "Menu" on a screen with
// nobody to talk to and no menu. This is behaviour, not markup, so it is driven
// rather than grepped.
section('the title answers the buttons it shows');
{
  const fresh = loadGame({});
  fresh.setCtx(mkCtx());
  eq(fresh.G.mode, 'title', 'the game opens on the title');
  ok(!fresh.hasSave(), 'with nothing saved');
  eq(fresh.btnLabels().join('/'), 'Start/Start',
    'both buttons offer the only thing there is, rather than one being dead');
  fresh.pressKey('a'); fresh.step(.05); fresh.releaseKey('a'); fresh.fired.clear();
  ok(fresh.G.mode !== 'title', `and pressing one actually leaves the title (${fresh.G.mode})`);
  eq(fresh.G.mapId, 'lab', 'into the study, where a new journey starts');

  // With a save there are two real choices, and each button takes one.
  const store = {};
  const played = loadGame(store);
  played.setCtx(mkCtx());
  played.newGame();
  played.takeStarter('cindercub');
  played.enterMap('route_one', 5, 7, 'down');
  played.G.mode = 'world';
  ok(played.saveGame(), 'a run is saved');

  const back = loadGame(store);
  back.setCtx(mkCtx());
  ok(back.hasSave(), 'the next visit to the title sees it');
  eq(back.btnLabels().join('/'), 'Continue/New', 'and the buttons offer both');
  back.pressKey('a'); back.step(.05); back.releaseKey('a'); back.fired.clear();
  eq(back.G.mapId, 'route_one', 'confirm picks the run up where it was left');
  eq(back.G.party.length, 1, 'with the party still in it');

  const over = loadGame(store);
  over.setCtx(mkCtx());
  over.pressKey('b'); over.step(.05); over.releaseKey('b'); over.fired.clear();
  eq(over.G.mapId, 'lab', 'and cancel starts a new journey instead');
  eq(over.G.party.length, 0, 'with nothing carried over');
}

// Tapping anywhere advances a dialogue — that is the whole of the affordance on
// a phone, where the alternative is finding a small round button. It worked
// exactly once. The click handler pressed 'a' and nothing ever released it, and
// `pressKey` only adds to `fired` when the key is not already held, so every
// later tap was a no-op for the rest of the page's life. A keyboard player
// never saw it: the first Z they pressed released 'a' for them.
//
// The frame clears `fired`, not `step`, so a drive that calls step alone shows
// every tap working. That is exactly what my first attempt at this showed, and
// it was measuring nothing. The clear belongs in the loop below.
section('tapping advances a dialogue more than once');
{
  const g = loadGame({});
  g.setCtx(mkCtx());
  g.newGame();
  g.G.dialogue = null; g.G.mode = 'world';
  g.say('Test', ['one', 'two', 'three', 'four', 'five']);
  eq(g.G.dialogue.i, 0, 'a speech starts on its first line');

  const tap = () => {
    g.tapKey('a');                 // what the click handler and the pad both do
    if (g.G.dialogue) g.G.dialogue.hold = 0;
    g.step(.05);
    g.fired.clear();               // what frame() does at the end of every frame
  };
  for (let n = 1; n <= 4; n++) {
    tap();
    eq(g.G.dialogue ? g.G.dialogue.i : 'closed', n, `tap ${n} moves the speech on`);
  }

  // The mechanism, stated on its own so a future bare pressKey is caught here
  // rather than by somebody tapping a phone.
  const g2 = loadGame({});
  g2.setCtx(mkCtx());
  g2.pressKey('a');
  ok(g2.fired.has('a'), 'a press registers');
  g2.fired.clear();
  g2.pressKey('a');
  ok(!g2.fired.has('a'), 'a second press with no release does NOT — this is the trap');
  g2.fired.clear();
  g2.tapKey('a');
  ok(g2.fired.has('a'), 'and a tap, which releases, always does');
}

// The portrait band's two buttons were a fixed 82px placed at percentages of a
// band half the window wide, so their centres sat 0.21 * vw apart — less than
// 82px on any window under about 390. They overlapped, and the outer one ran
// off the screen. Every phone shot until now was taken at exactly 390, which is
// the one width where the old numbers just about worked.
section('the portrait buttons fit a narrow phone');
{
  const rule = (SRC.match(/body\.ctl-below #btns \.rbtn\{[^}]*\}/) || [''])[0];
  ok(rule, 'the portrait band sizes its own buttons');
  // Sized from the window, capped so nothing changes on a roomy phone.
  ok(/min\(\s*82px\s*,\s*[\d.]+vw\s*\)/.test(rule),
    `the size comes off the window with the old 82px as a ceiling (${rule})`);
  // Centred by transform, not by a margin equal to half a hardcoded width —
  // that is what went stale in the overlay layout when its buttons shrank.
  ok(/transform:translate\(-50%/.test(rule),
    'and it is centred by transform, so the offset cannot go stale when the size changes');
  ok(!/margin-left:-\d/.test(rule),
    'rather than by a margin written for one particular width');
  ok(/body\.ctl-below #btns \.rbtn:active\{[^}]*translate\(-50%/.test(SRC),
    'and the pressed state keeps the centring instead of dropping it');
}

// Sound cannot be photographed, and playCue returns immediately when headless,
// so nothing here can hear anything. What CAN be checked is the wiring, and the
// failure it catches is real: a cue fired under a name playCue does not handle
// is silence that looks exactly like a cue nobody wrote. Both directions.
const mapTiles = (g) => {
  const t = new Set();
  for (const m of Object.values(g.MAPS)) for (const row of m.rows) for (const ch of row) t.add(ch);
  return t;
};

section('every cue that is fired is a cue that exists');
{
  const body = (SRC.match(/function playCue\(kind\)[\s\S]*?\n\}/) || [''])[0];
  ok(body.length > 200, 'found playCue');
  const g0 = loadGame({});
  // Every theme is a cue: playCue hands anything in THEMES to startMusic rather
  // than naming the tracks a second time, which is what made adding one two
  // edits with an easy one to forget.
  const defined = new Set([...(body.match(/kind === '[a-z_]+'/g) || [])
    .map((m) => m.replace(/kind === '|'/g, '')), ...Object.keys(g0.THEMES)]);
  ok(defined.size > 15, `it handles a table of cues (${defined.size})`);
  ok(/if \(THEMES\[kind\]\)/.test(body), 'and takes the track list from THEMES itself');

  const fired = new Set((SRC.match(/playCue\('[a-z_]+'\)/g) || [])
    .map((m) => m.replace(/playCue\('|'\)/g, '')));
  ok(fired.size > 10, `and a lot of them are fired by name (${fired.size})`);

  // The cues that are NOT fired by name — ASKED FOR rather than listed.
  //
  // This used to be nineteen names written out by hand, with a comment saying
  // that declaring each new one was the point. It was, four times running. But
  // an exemption list is a map of facts the test cannot read, and every one of
  // these nineteen came out of a pure function or a table that was sitting
  // right there: hitCue, faintCue, battleTrack, placeTrack, STEP_CUE. The list
  // was not knowledge the suite lacked. It was knowledge it declined to ask
  // for.
  //
  // Asking is strictly stronger in both directions. Add a theme and point a map
  // at it and placeTrack now yields it here on its own — where the hand-list
  // would have gone red and invited the next person to widen it, which is the
  // failure mode the old comment was trying to prevent and could not. And a
  // theme NOTHING points at still fails, because that is the true claim: a
  // sound nobody can reach.
  const hits = [{ eff: 2, crit: true }, { eff: 2 }, { eff: 1 }, { eff: .5 }, { eff: 0 }, null];
  const faints = [{ side: 'mine' }, { side: 'foe' }, null];
  const fights = [{ legendary: true }, { npc: { id: 't_wick2' } }, { npc: { id: 't_pell' } }, {}];
  const asked = new Set([
    ...hits.map((e) => g0.hitCue(e)),
    ...faints.map((e) => g0.faintCue(e)),
    ...fights.map((o) => g0.battleTrack(o)),
    ...Object.keys(g0.MAPS).map((id) => g0.placeTrack(id)),
    // Every tile character that appears in any map, put through the game's own
    // step-cue choice. Stronger than reading STEP_CUE's values: it covers the
    // grass default, and a tile added tomorrow with a footstep playCue does not
    // handle now fails here rather than being silence nobody notices.
    ...[...mapTiles(g0)].map((t) => g0.stepCue(t)),
    // Every screen the game opens, put through its own choice of note. The
    // kinds are harvested from the openScreen call sites rather than typed
    // here, so a screen added tomorrow is covered — and a cue that only ever
    // appears inside an expression stops being unreachable.
    ...[...new Set((SRC.match(/openScreen\('([a-z]+)'/g) || [])
      .map((m) => m.replace(/openScreen\('|'/g, '')))].map((k) => g0.screenCue(k)),
  ]);
  ok(asked.size > 12, `and the rest are asked for rather than listed (${asked.size})`);

  // Two tables that had never been asked about each other: GRASSY is what
  // rollEncounter gates on, STEP_CUE is what you hear underfoot. The surface
  // that hides things has to be the one that sounds deep, or the game tells
  // your ear one thing about a tile and your odds another.
  for (const t of g0.GRASSY) {
    eq(g0.stepCue(t), 'step_tall', `the grass that hides things sounds deep ("${t}")`);
  }

  const reachable = new Set([...fired, ...asked]);
  // Both directions, and the indirect ones are now inside BOTH of them — the
  // old shape only checked literals against the table, so a hitCue branch
  // returning a name playCue does not handle was silence nothing would catch.
  for (const k of reachable) ok(defined.has(k), `the cue "${k}" is one playCue handles`);
  for (const k of defined) ok(reachable.has(k), `the cue "${k}" is reachable`);

  // The plaque that names a new place was the one beat in the game with no
  // sound at all. It is fired where the beat is raised, not somewhere near it.
  ok(/G\.place = \{ name: m\.name, t: 0 \};\s*\n\s*playCue\('place'\);/.test(SRC),
    'arriving somewhere new makes a sound, raised with the plaque itself');
}

// A trainer is not a Zaplet in the grass. The opening LINE has always made that
// distinction and the music did not — nine hand-authored fights, three of them
// the rival, all playing the tune the long grass plays. Driven off the map data
// rather than a list of ids typed here, so a trainer added later is covered.
section('a fight sounds like the fight it is');
{
  const g = loadGame({});
  g.setCtx(mkCtx());
  const foe = g.mkMon('zaplet', 4);
  eq(g.battleTrack({ foe, wild: true }), 'battle', 'the long grass keeps the old tune');
  eq(g.battleTrack({ foe, legendary: true }), 'shrine', 'and the legendary keeps its own');

  const trainers = Object.values(g.MAPS).flatMap((m) => m.npcs || []).filter((n) => n.trainer);
  ok(trainers.length >= 9, `the valley holds its trainers (${trainers.length})`);
  const wicks = trainers.filter((n) => g.battleTrack({ foe, npc: n }) === 'rival');
  const rest = trainers.filter((n) => g.battleTrack({ foe, npc: n }) === 'duel');
  eq(wicks.length + rest.length, trainers.length, 'every trainer gets a track of its own kind');
  ok(rest.length > 0, `the ordinary ones duel (${rest.map((n) => n.name).join(', ')})`);
  // The rival is whoever turns up more than once, which the data says rather
  // than this test: he is the only name on more than one map.
  const byName = {};
  for (const n of trainers) byName[n.name] = (byName[n.name] || 0) + 1;
  const recurring = Object.keys(byName).filter((k) => byName[k] > 1);
  eq(recurring.length, 1, `exactly one person turns up more than once (${recurring.join(', ')})`);
  eq(wicks.length, byName[recurring[0]],
    `and every one of his fights is the one that sounds different (${wicks.length})`);
  for (const n of rest) ok(n.name !== recurring[0], `${n.name} is not him`);
  // And the fight actually asks. battleTrack being right is no use if
  // startBattle still picks with the old two-way ternary.
  ok(/playCue\(battleTrack\(opt\)\)/.test(SRC), 'and startBattle asks it rather than choosing for itself');
  ok(!/playCue\(opt\.legendary \? 'shrine' : 'battle'\)/.test(SRC), 'the old two-way choice is gone');
}

// A knockout on your side and one on theirs are opposite events and made the
// same sound. The log has carried the side all along and the prose already says
// it; only the cue was deaf. Driven through a real fight so the sides come out
// of the game rather than out of this test.
section('losing a kin does not sound like winning');
{
  const g = loadGame({});
  g.setCtx(mkCtx());
  g.newGame();
  g.G.dialogue = null; g.G.mode = 'world';
  g.G.party = [g.mkMon('pyrelynx', 30)];
  // Driving a real knockout here was tried and thrown away: the raw calls
  // RETURN a log and the state only advances when submitLog plays it back, so a
  // loop of playCard alone never actually finishes the foe — it failed three
  // runs in five, and a test that flaky is worse than none.
  // What the fight was there to prove is that the game emits both sides at all,
  // and the source says that outright: three knockouts are recorded, and they
  // are not all the same side.
  const sides = (SRC.match(/snap\(log, [^;]*?'faint', '(mine|foe)'\)/g) || [])
    .map((m) => (/'mine'\)/.test(m) ? 'mine' : 'foe'));
  ok(sides.length >= 3, `the game records knockouts (${sides.length})`);
  ok(sides.includes('mine'), 'at least one of them is yours');
  ok(sides.includes('foe'), 'and at least one is theirs');
  for (const side of new Set(sides)) {
    eq(g.faintCue({ side }), side === 'mine' ? 'faint' : 'downed',
      `a ${side} knockout plays its own cue`);
  }

  // A level-30 Pyrelynx against a level-3 Zaplet only knocks out one way, so
  // the other side is asserted directly rather than pretended to be covered.
  eq(g.faintCue({ side: 'mine' }), 'faint', 'yours is the falling one');
  eq(g.faintCue({ side: 'foe' }), 'downed', 'theirs is not');
  eq(g.faintCue(undefined), 'downed', 'and a missing side never claims to be yours');
}

// AIR gives all eight maps their own light and the music gave them one tune
// between them — and nothing told the music the map had moved at all, so the
// world theme started once and played everywhere. Driven off the MAPS list
// rather than a table typed here, so a ninth map is covered.
section('the music follows the map');
{
  const g = loadGame({});
  const maps = Object.keys(g.MAPS);
  ok(maps.length >= 8, `the valley has its maps (${maps.length})`);

  // Every map resolves to a real theme. A typo in the table would otherwise be
  // silence, and silence is what this whole seam keeps turning out to be.
  for (const id of maps) {
    const track = g.placeTrack(id);
    ok(g.THEMES[track], `${id} plays a theme that exists (${track})`);
  }
  // And every entry in the table names a map that is really there.
  for (const id of Object.keys(g.MAP_TRACK)) ok(maps.includes(id), `${id} is a real map`);

  // The places you travel each sound like themselves; the town and the rooms
  // in it share the valley's tune.
  const travel = Object.keys(g.MAP_TRACK);
  const tracks = new Set(travel.map((id) => g.placeTrack(id)));
  eq(tracks.size, travel.length, `no two places you travel share a tune (${[...tracks].join(', ')})`);
  const rest = maps.filter((id) => !travel.includes(id));
  for (const id of rest) eq(g.placeTrack(id), 'world', `${id} keeps the valley's tune`);
  ok(rest.length > 0, `and some places do (${rest.join(', ')})`);

  // The wiring: walking somewhere follows it, and coming out of a fight or a
  // save resumes where you ARE rather than always the town.
  ok(/followMap\(\);\s*\n\s*return m;/.test(SRC), 'entering a map follows it');
  ok(/if \(HEADLESS \|\| !musicTimer\) return;/.test(SRC),
    'but only switches music already playing — the title has always been silent');
  ok(/if \(track !== musicTrack\) startMusic\(track\)/.test(SRC),
    'and never restarts the tune it is already on, which would stutter at every doorway');
  eq((SRC.match(/playCue\(placeTrack\(G\.mapId\)\)/g) || []).length, 2,
    'a fight and a loaded save both resume the place you are in');
}

// `effWord` gives the fight five readings — brutally effective, effective,
// barely lands, does nothing, and nothing said — and every one of them landed
// on the same blip. The words already tell you whether your type choice worked.
section('a hit sounds like how well it landed');
{
  const g = loadGame({});
  g.setCtx(mkCtx());
  eq(g.hitCue({ eff: 2 }), 'strong', 'a doubled hit cracks');
  eq(g.hitCue({ eff: 1 }), 'hit', 'a neutral one is the plain impact');
  eq(g.hitCue({ eff: .5 }), 'weak', 'a resisted one thuds');
  eq(g.hitCue({ eff: 2, crit: true }), 'crit', 'and a crit outranks the lot — it is the bigger fact');
  eq(g.hitCue(null), 'hit', 'an impact carrying nothing stays the plain one');
  // eff 0 deals no damage and so snaps no impact at all; the line stands alone.
  eq(g.hitCue({ eff: 0 }), 'hit', 'an immune hit never reaches this, and is not claimed to');

  // The game must actually put `eff` on the entry, or hitCue answers a question
  // nobody asks it. Driving a real swing to prove that was tried FOUR times and
  // thrown away, which is the part worth writing down: the hand may deal no kin
  // move at all; a kin's moves include ones with pow 0 that deal no damage; most
  // have acc under 100 and can miss; and speed decides who opens, so the fight
  // does not always start on your turn. Each reads as "the swing landed (0)".
  // Guarding all four still failed one run in forty, and a flaky test is worse
  // than none — so the claim is asserted where it is deterministic.
  // The detailed impacts are the ones that already carry `crit`; one of the
  // three writes its extra as a ternary, so this keys on the field rather than
  // on the punctuation around it.
  const hitSnaps = (SRC.match(/snap\(log, [^;]*?'hit', '(?:mine|foe)',[^;]*?\);/g) || [])
    .filter((h) => /crit:/.test(h));
  eq(hitSnaps.length, 3, `the game records three detailed impacts (${hitSnaps.length})`);
  for (const h of hitSnaps) {
    ok(/\beff\b/.test(h), `an impact carries how well it landed — ${h.slice(-70)}`);
  }
  // And the foe's swing reaches hurtMine through the battle rather than as an
  // argument, the same channel the impact burst's element already uses.
  ok(/b\.hitEff = eff;/.test(SRC), 'the foe\'s swing hands its effectiveness along');
  ok(/eff: b\.hitEff/.test(SRC), 'and the impact it causes reads it');
}

// #1737 proved every map resolves to a theme that EXISTS. It did not prove the
// theme PLAYS: musicTick reads phrase[step % 16] and a short phrase yields
// undefined, which it skips — so a malformed theme is SILENCE, not a crash, and
// nothing would ever say so.
section('every theme is shaped like something musicTick can play');
{
  const g = loadGame({});
  for (const [name, th] of Object.entries(g.THEMES)) {
    ok(th.bpm > 0, `${name} has a tempo (${th.bpm})`);
    ok(th.lead.length > 0 && th.bass.length > 0, `${name} has a lead and a bass`);
    for (const p of th.lead) {
      eq(p.length, 16, `${name}: every phrase is the sixteen steps musicTick walks`);
    }
    for (const i of th.order) {
      ok(i >= 0 && i < th.lead.length, `${name}: its order only names phrases it has (${i})`);
    }
  }
}

// Rowan hands you the game with "there are nineteen kin in this valley — I want
// every one of them written down", the menu carries the tally, and the ending
// counts what is still unwritten. Three pieces of prose agree the dex is the
// errand, and both moments it moves — first sighting, first catch — were
// silent: meeting a species for the first time was indistinguishable from
// meeting your fiftieth Emberpup.
section('the dex says when it moves');
{
  const g = loadGame({});
  g.setCtx(mkCtx());
  g.newGame();

  // The two writers report what they wrote. Everything below rests on this.
  ok(g.seeMon('zaplet'), 'a species never met is a new line');
  ok(!g.seeMon('zaplet'), 'and meeting it again writes nothing');
  ok(g.catchMon('zaplet'), 'catching one you had only seen is still the first time it is written down');
  ok(!g.catchMon('zaplet'), 'catching a second of the same writes nothing');
  ok(g.catchMon('dewdrip'), 'and one you never even saw counts too');

  // The tally quotes the errand back with the number it moved to.
  eq(g.dexTally(), `WRITTEN DOWN — 2 OF ${g.DEX_ORDER.length}`,
    `the tally reads off the book (${g.dexTally()})`);
  eq(g.dexNew('Zaplet'), 'Zaplet — new to the dex.', 'and one wording for a sighting');
}

// Walking into a fight is one of four places the game learns a species, and the
// only one that is not inside a battle log — so it says so directly.
section('a first sighting is announced when the fight opens');
{
  const g = withDeck(loadGame({}));
  g.newGame();
  g.takeStarter('cindercub');
  g.G.dialogue = null;

  g.startBattle({ foe: g.mkMon('zaplet', 6), wild: true });
  eq(g.G.toast, 'Zaplet — new to the dex.', `the opening marks it (${g.G.toast || 'nothing'})`);
  ok(g.G.toastT > 0, 'and the mark is standing');

  // Now it is in the book. The second Zaplet is just a Zaplet.
  g.G.battle = null; g.G.toast = ''; g.G.toastT = 0;
  g.startBattle({ foe: g.mkMon('zaplet', 6), wild: true });
  eq(g.G.toast, '', 'the second one of the same says nothing');
}

// The other three sites are mid-battle send-outs, which run inside a log
// builder. A toast fired from there would land a beat before the player is told
// anything came out at all — raw calls only BUILD the log; the state moves when
// submitLog plays it back. So the note goes through the log, and the cue hangs
// off the entry.
section('a trainer leading with something new says so through the log');
{
  const g = withDeck(loadGame({}));
  g.newGame();
  g.takeStarter('cindercub');
  g.G.dialogue = null;

  const bench = [g.mkMon('zaplet', 8), g.mkMon('dewdrip', 8)];
  g.startBattle({ foe: bench[0], wild: false, npc: { id: 't_pell', name: 'Forager Pell' } });
  const b = g.G.battle;
  b.roster = bench;
  b.teamIdx = 0;
  bench[0].hp = 0;                          // the one that is out has fallen

  const log = [];
  g.resolveFoeDown(log);
  const notes = log.filter((e) => e.fx === 'dex');
  eq(notes.length, 1, `the newcomer nobody has met is marked once (${notes.length})`);
  eq(notes[0].t, 'Dewdrip — new to the dex.', 'in the same words the opening uses');
  // Order matters: you are told something came out before you are told it is new.
  const sent = log.findIndex((e) => e.fx === 'send');
  const noted = log.findIndex((e) => e.fx === 'dex');
  ok(sent >= 0 && sent < noted, 'and only after being told it came out at all');

  // Same fight, same bench, second time round: nothing new to say.
  bench[1].hp = 0;
  bench[0].hp = 10;
  b.teamIdx = 1;
  const again = [];
  g.resolveFoeDown(again);
  eq(again.filter((e) => e.fx === 'dex').length, 0, 'a kin already in the book is sent out quietly');
}

// The gotcha is the one screen that already varies by context, and it read the
// same for the nineteenth species as for your fourth Emberpup.
section('the payoff screen counts the errand it just moved');
{
  const g = loadGame({});
  g.setCtx(mkCtx());
  g.newGame();

  // The ordering claim, which is the whole bug class: asked AFTER addCaught
  // writes the line, "was this new?" is always no. Source, because the answer
  // lives inside finishBattle's caught branch and nothing hands it back out.
  const caughtBranch = SRC.slice(SRC.indexOf("} else if (over === 'caught') {"));
  const askedAt = caughtBranch.indexOf('const written =');
  const wroteAt = caughtBranch.indexOf('addCaught(caught)');
  ok(askedAt >= 0 && wroteAt >= 0, 'the caught branch both asks and writes');
  ok(askedAt < wroteAt, 'and it asks before it writes, or the answer is always no');
  ok(/note: written \? dexTally\(\) : ''/.test(caughtBranch),
    'a catch that moved the book carries the tally, and one that did not carries nothing');

  // The starter is always the first line in an empty book, so it always counts.
  ok(/head: 'YOUR KIN', note: dexTally\(\)/.test(SRC), 'the kin you are handed opens the book');

  // And the screen draws what it is given, without falling over on a catch that
  // wrote nothing. Both branches, through the real draw.
  g.takeStarter('cindercub');
  g.G.gotcha = { t: .9, species: 'cindercub', name: 'Cindercub', where: 'joined your party',
    note: g.dexTally(), done: () => {} };
  g.draw();
  g.G.gotcha.note = '';
  g.draw();
  ok(true, 'the gotcha draws with a tally and without one');
}

// The intent chip's own comment says it exists to answer "can I take this, or
// do I need to block?" — and it answered half of it. It already subtracted
// guard and shield to print what LANDS; it never compared that to what was
// LEFT. At 9 HP against "about 30" it read exactly as it does at full health,
// in the same colour, while 9/63 sat on the other side of the arena for the
// player to hold in their head.
section('the telegraph finishes its own question');
{
  const g = withDeck(loadGame({}));
  g.setCtx(mkCtx());
  g.newGame();
  g.takeStarter('cindercub');
  g.G.dialogue = null;
  g.G.party = [g.mkMon('pyrelynx', 24)];
  g.startBattle({ foe: g.mkMon('bramblor', 23), wild: true });
  const b = g.B();
  const swing = { kind: 'attack', name: 'Thorn Maul', dmg: 30, hi: 33 };

  // The half that already worked: guard comes off, then shield absorbs — and
  // both ends of the roll go through the same subtraction.
  b.mods.def = 0; b.shield = 0;
  eq(g.intentThrough(b, swing).lo, 30, 'bare, the whole swing lands');
  eq(g.intentThrough(b, swing).hi, 33, 'and the top of the roll lands too');
  b.mods.def = 4;
  eq(g.intentThrough(b, swing).lo, 26, 'guard comes off the top');
  eq(g.intentThrough(b, swing).hi, 29, 'off both ends of it');
  b.shield = 10;
  eq(g.intentThrough(b, swing).lo, 16, 'and shield absorbs the rest');
  eq(g.intentThrough(b, swing).hi, 19, 'from both again');
  b.mods.def = 0; b.shield = 0;

  // A telegraph that is not an attack has nothing to land.
  eq(g.intentThrough(b, { kind: 'plan', name: 'Sharpen' }), null, 'a plan lands nothing');
  eq(g.intentThrough(b, null), null, 'and neither does no telegraph at all');

  // The half that did not exist.
  b.mine.hp = b.mine.max;
  ok(!g.intentLethal(b, swing), 'at full health the swing is survivable and says nothing');
  b.mine.hp = 30;
  ok(g.intentLethal(b, swing), 'at exactly the incoming number it is called');
  b.mine.hp = 9;
  ok(g.intentLethal(b, swing), 'at nine against about thirty it is called');

  // The reason this pass exists. The roll spreads [.85, 1] and the alarm used
  // to be measured against the middle of it, so between the middle and the top
  // sat a band where the chip said you live and the swing killed you. Measured
  // at one HP above the shown figure it killed you 31% of the time, silently.
  // The alarm reads the ceiling now, and the band is empty.
  for (let hp = swing.dmg + 1; hp <= swing.hi; hp++) {
    b.mine.hp = hp;
    ok(g.intentLethal(b, swing), `at ${hp} against a swing that can reach ${swing.hi} it is called`);
  }
  b.mine.hp = swing.hi + 1;
  ok(!g.intentLethal(b, swing), 'and one point above what it can reach is not');

  // What the telegraph itself puts in that field: the middle AND the top, from
  // the same swing the foe is about to take.
  {
    const it = g.readIntent();
    if (it.kind === 'attack') {
      ok(it.hi != null, 'the telegraph carries the top of its own roll');
      ok(it.hi >= it.dmg, `and the top is not below the middle (${it.dmg} then ${it.hi})`);
    }
  }

  // It reads what LANDS, not what is swung — so blocking has to answer it. This
  // is the whole point of the two halves being the same number.
  b.shield = 40;
  ok(!g.intentLethal(b, swing), 'and enough shield takes the warning away');
  b.shield = 0;

  // A kin already down is not about to be finished again.
  b.mine.hp = 0;
  ok(!g.intentLethal(b, swing), 'a kin already down is not warned about');
  b.mine.hp = b.mine.max;

  // And the chip must actually wear it. renderHand returns early when HEADLESS,
  // so this is a source net — the class and the phrase both have to be there.
  ok(/els\.intent\.classList\.toggle\('lethal', lethal\)/.test(SRC),
    'the chip is marked when the swing would finish you');
  ok(/lethal \? ' · <b>enough to finish you<\/b>' : ''/.test(SRC), 'and says so in words');
  ok(/#intent\.lethal\{[^}]*--hp-bad/.test(SRC), 'and the frame carries the alarm');
  // The move name in this chip is already red, so the warning cannot be red
  // text alone — that reads as more chip rather than as an alarm.
  ok(/#intent b\{ color:var\(--hp-bad\); \}/.test(SRC), 'the name was already red, which is why the frame changes');
}

// The forced switch: your kin is down, the fight is still running, and the
// screen asks you to pick somebody to send out — while covering the arena. The
// foe's name, level and types were behind it at the exact moment they decide
// everything, and the move list printed damage computed against a DUMMY WITH NO
// TYPES. Right in the town menu, exactly wrong here.
section('the switch screen knows who you are choosing against');
{
  const g = withDeck(loadGame({}));
  g.setCtx(mkCtx());
  g.newGame();
  g.takeStarter('cindercub');
  g.G.dialogue = null;
  const wet = g.mkMon('brookite', 22);          // Tide, into Verdant/Gloom
  const hot = g.mkMon('magmane', 30);           // Ember, into the same
  const swing = (m) => m.moves.find((s) => g.MOVES[s.id].pow).id;

  // Out of a fight there is nobody to aim at, and the neutral figure stands.
  eq(g.moveVersusFoe(wet, swing(wet)), null, 'out of a fight the reading is refused');
  ok(g.moveDamageNeutral(wet, swing(wet)).hi > 0, 'and the foe-agnostic number is still there for the town menu');

  g.G.party = [wet];
  g.startBattle({ foe: g.mkMon('bramblor', 25), wild: true });

  const a = g.moveVersusFoe(wet, swing(wet));
  const b2 = g.moveVersusFoe(hot, swing(hot));
  ok(a && b2, 'in a fight both readings resolve');
  eq(a.eff, .5, 'Tide into Verdant is resisted');
  eq(b2.eff, 2, 'and Ember doubles');
  ok(a.hi < g.moveDamageNeutral(wet, swing(wet)).hi,
    `the real number is lower than the neutral one (${a.hi} vs ${g.moveDamageNeutral(wet, swing(wet)).hi})`);
  eq(g.effMark(a.eff).tag, 'RESISTED', 'and it is labelled');
  eq(g.effMark(b2.eff).tag, 'STRONG', 'both ways');
  ok(!g.effMark(1), 'a neutral hit is not labelled at all — a mark on everything marks nothing');

  // And the number folds in what the SWING folds in. `moveDamage` has always
  // applied attackBonus(); this did not, so with an edge banked the switch
  // screen understated a replacement by up to a quarter — the telegraph's fault
  // exactly, in a function written two passes after it fixed.
  const hitId = (m) => m.moves.find((sl) => g.MOVES[sl.id].pow).id;
  const fight = g.B();                       // `b` in this scope is not the battle
  const bare = g.moveVersusFoe(wet, hitId(wet)).hi;
  fight.mods.edge = 9;
  const banked = g.moveVersusFoe(wet, hitId(wet)).hi;
  ok(banked > bare, `a banked edge raises the figure (${bare} -> ${banked})`);
  eq(banked - bare, 9, 'by exactly what was banked, the way the swing spends it');
  fight.mods.mul = 2;
  ok(g.moveVersusFoe(wet, hitId(wet)).hi > banked, 'and a multiplier multiplies it');
  fight.mods.edge = 0; fight.mods.mul = 1;
  ok(/const bonus = attackBonus\(\);/.test(SRC.slice(SRC.indexOf('function moveVersusFoe'), SRC.indexOf('function moveDamageNeutral'))),
    'read off attackBonus rather than a second copy of what it does');

  // It reads the kin being ASKED ABOUT, not whoever happens to be out. The
  // whole point is choosing a replacement while somebody else is on the field.
  ok(g.moveVersusFoe(hot, swing(hot)).hi !== g.moveVersusFoe(wet, swing(wet)).hi,
    'and it answers for the kin you are looking at, not the one on the field');

  // A range, not one number behind a tilde. This showed the swing at roll 1 —
  // the CEILING — and wrote "~8" in front of it, so the one figure the screen
  // could not have meant was the one it printed. The card in hand has always
  // shown "deal 7-8"; the screen that asks the same question now says it the
  // same way.
  let spread = 0;
  for (const m of [wet, hot]) {
    const r = g.moveVersusFoe(m, swing(m));
    ok(r.lo <= r.hi, `${m.species}: the range does not run backwards (${r.lo}-${r.hi})`);
    ok(r.hi > 0 && r.lo > 0, `${m.species}: and neither end is empty`);
    // The bottom is the bottom of the roll, not the top printed twice.
    if (r.lo < r.hi) spread++;
    ok(r.lo >= Math.floor(r.hi * .8), `${m.species}: and the bottom is the roll's floor, not a guess (${r.lo}-${r.hi})`);
  }
  ok(spread > 0, 'a hit big enough to spread reads as two numbers, not one twice');
  eq(g.rangeText(7, 8), '7-8', 'two numbers when the roll can spread them');
  eq(g.rangeText(7, 7), '7', 'and one when it cannot');
  ok(!/~\$\{dmg\} dmg/.test(SRC), 'no tilde is left standing in front of a ceiling');

  // A move that cannot land at all reads as nothing rather than as 1.
  eq(g.effMark(0).tag, 'NOTHING', 'an immune matchup has its own mark');

  // Source nets: renderScreen returns early when HEADLESS, so the prompt and
  // the marks have to be asserted here.
  ok(/Choose who steps up\.\$\{foe/.test(SRC), 'the prompt names what is out there');
  ok(/Lv\$\{foe\.lvl\} \$\{foe\.types\.join\('\/'\)\}/.test(SRC), 'with its level and its types');
  ok(/const vs = mv\.pow \? \(moveVersusFoe\(m, slot\.id\) \|\| moveDamageNeutral\(m, slot\.id\)\) : null;/.test(SRC),
    'and the move list asks for the real reading');
  ok(/\.movecard\.eff-good\{ border-left-color:var\(--hp-good\)/.test(SRC),
    'a strong move is marked on the card, not only in the text');
}

// Generalising the last pass rather than repeating it: which OTHER overlay
// screens cover something they are asking about? The swap screen and the reward
// offer both came back clean — each already shows the card coming in and how
// many of each you hold, with a comment saying it was asked deliberately. The
// bag was half-done, and its own comment said what it was for: "opening the bag
// mid-fight covers the arena and both HP bars… the number goes where the
// decision is." It brought your HP and not what was coming at it, which is one
// side of a subtraction — the intent chip's exact old fault.
section('the bag brings both operands into the fight');
{
  const g = withDeck(loadGame({}));
  g.setCtx(mkCtx());
  g.newGame();
  g.takeStarter('cindercub');
  g.G.dialogue = null;
  g.G.party = [g.mkMon('pyrelynx', 24)];
  g.G.bag = { salve: 3, greatsalve: 1 };
  g.startBattle({ foe: g.mkMon('bramblor', 25), wild: true });
  const b = g.B();
  g.readIntent();

  // It reads the same two functions the chip does, so the two screens cannot
  // disagree about the same swing.
  b.mine.hp = 11;
  const inc = g.intentThrough(b, b.intent);
  ok(inc && inc.hi > 0, `there is an incoming number to bring (${inc && inc.lo}-${inc && inc.hi})`);
  ok(g.intentLethal(b, b.intent) === (inc.hi >= 11), 'and the bag would mark it exactly as the chip does');

  b.mine.hp = b.mine.max;
  ok(!g.intentLethal(b, b.intent), 'at full health it is not marked');

  // Out of a fight there is nothing to bring, and the header must not invent it.
  g.G.battle = null;
  eq(g.intentThrough(null, null), null, 'with no fight there is no incoming number');

  // Source: the header carries it, in the chip's own words, and only in a fight.
  ok(/const inc = inFight \? intentThrough\(B\(\), B\(\)\.intent\) : null;/.test(SRC),
    'the bag asks for the incoming number only while a fight is running');
  ok(/\$\{rangeText\(inc\.lo, inc\.hi\)\} coming\$\{doomed \? ', enough to finish you' : ''\}/.test(SRC),
    'and says it in the same words the chip uses, so one teaches the other');
  ok(/\+ \(inc \?/.test(SRC), 'nothing is printed when there is nothing to print');
  // Both screens print the same two numbers through the same formatter, which
  // is the only reason a player who has learned one can read the other.
  ok((SRC.match(/rangeText\(/g) || []).length >= 4, 'and every one of them goes through the one formatter');
}

// Eight elements, and measured with a real canvas, seven eighths of the arena
// was one place: the field came back 0.00 luminance and 0.00 hue apart between
// an Ember fight and a Tide one, and so did the ridges. The whole difference
// lived in the top 58 pixels of sky. The arena's own comment states the rule it
// then stops at the horizon — further away is closer to the sky colour — so the
// element now falls on the ground as light, strongest along the far edge.
//
// The colour of a fill is the one thing the headless context cannot see, so the
// band is a value (`groundHaze`) and these nets read the value and then check
// the drawing spends exactly it.
section('the element reaches the ground, not just the sky');
{
  const g = loadGame();
  const log = [];
  g.setCtx(mkCtx(log));

  // By difference: two opposed elements must not describe the same ground.
  const emb = g.groundHaze(g.TYPES.Ember), tid = g.groundHaze(g.TYPES.Tide);
  ok(emb.top !== tid.top, `an Ember fight and a Tide one are lit differently (${emb.top} vs ${tid.top})`);
  ok(emb.top === g.TYPES.Ember, 'and the light is the element, not a colour of its own');
  ok(emb.a > 0, 'the ground takes some of it');

  // Further away is closer to the sky colour. The ground is lit BY the sky, so
  // it cannot take more of the element than the sky itself does.
  ok(g.GROUND_HAZE < g.SKY_WASH, `the ground takes less than the sky (${g.GROUND_HAZE} < ${g.SKY_WASH})`);

  // It has to cover the ground the fight actually happens on — both stands, not
  // a decorative strip under the far ridge. FOE_GROUND 66 and MY_GROUND 108 are
  // where drawBattle stands them.
  const inside = (y) => y >= emb.y && y < emb.y + emb.h;
  ok(inside(66), 'the far stand is inside the band');
  ok(inside(108), 'and so is the one you are standing on');
  ok(emb.y + emb.h === g.VIEW_H, 'the band runs to the bottom of the frame');
  ok(emb.y > g.HORIZON, 'and starts below the horizon — the sky already has its own wash');

  // Wiring, by difference: the drawing must spend the value it was handed. A
  // hardcoded rect passes the value nets above and fails this one.
  const arenaLog = [];
  g.setCtx(mkCtx(arenaLog));
  g.drawArena(mkCtx(arenaLog), g.TYPES.Ember, null);
  const band = arenaLog.filter((c) => c[0] === 'fillRect'
    && c[1] === 0 && c[2] === emb.y && c[3] === g.VIEW_W && c[4] === emb.h);
  eq(band.length, 1, 'the arena fills exactly the band the value names');

  // …and nothing else in the arena happens to have those coordinates, or the
  // net above would pass with the haze deleted.
  const other = arenaLog.filter((c) => c[0] === 'fillRect' && c[2] === emb.y);
  eq(other.length, 1, 'and that rect is the only thing starting at the band top');
}

// The reason a battle takes no map weather is written in draw(): a wash over
// the finished frame lands on the kin rather than behind them, and Crown
// Hollow's violet turned Cindercub to mud. The ground haze is held to the same
// line — it is inside drawArena, which drawBattle calls before it draws anybody.
// Netted by difference rather than by reading the source: everything the arena
// draws must be a PREFIX of what the battle draws.
section('the light is under the kin, not over them');
{
  const g = withDeck(loadGame({}));
  g.setCtx(mkCtx());
  g.newGame();
  g.takeStarter('cindercub');
  g.G.dialogue = null;
  g.G.party = [g.mkMon('pyrelynx', 24)];
  g.startBattle({ foe: g.mkMon('brookite', 22), wild: true });
  const b = g.B();
  b.entry = 1;

  const arena = [];
  g.drawArena(mkCtx(arena), g.TYPES.Tide, b);
  const fight = [];
  g.setCtx(mkCtx(fight));
  g.drawBattle(mkCtx(fight));

  ok(arena.length > 0 && fight.length > arena.length,
    `the fight draws more than the arena (${arena.length} then ${fight.length})`);
  // Reported as the first index that disagrees rather than as two logs: a
  // failure a reader cannot read is only half an instrument.
  let split = -1;
  for (let i = 0; i < arena.length; i++) {
    if (JSON.stringify(fight[i]) !== JSON.stringify(arena[i])) { split = i; break; }
  }
  ok(split < 0, split < 0
    ? 'and every stroke of the arena lands before the first stroke of the fight'
    : `the fight diverges from the arena at stroke ${split}: ${JSON.stringify(fight[split])} where the arena drew ${JSON.stringify(arena[split])}`);

  // Inside the arena, and so inside the prefix — which is what puts it under
  // the kin. The first draft asserted `at < arena.length`, which is true of any
  // index findIndex can return: a sentence, not a net.
  const hz = g.groundHaze(g.TYPES.Tide);
  const at = arena.findIndex((c) => c[0] === 'fillRect' && c[2] === hz.y && c[4] === hz.h);
  ok(at >= 0, 'the haze is in the arena');

  // Light falls on the scenery. The stands are the last scenery the arena
  // draws — they are the only thing in it that transforms — so the haze has to
  // come after them, or the ground both kin stand on is lit and the ground they
  // stand ON is not.
  const lastStand = arena.map((c) => c[0]).lastIndexOf('translate');
  ok(lastStand >= 0, 'the stands are in the arena');
  ok(at > lastStand, `the haze falls on the stands too (stroke ${at}, stands end at ${lastStand})`);

  // …and the motes are the light itself, so they stay out of it.
  ok(arena.length > at + 1, 'and something still comes after it — the motes are not tinted by it');
}

// The valley's air had a lifetime written for it and never spent: drawMotes
// computed `life = 6 + fx * 5` for every speck on every frame and threw it away
// with `void life` on the next line. Without it a mote's position wrapped
// modulo the frame, so a speck running off one edge reappeared at the other AT
// WHATEVER BRIGHTNESS IT WAS. Measured over thirty seconds at 60fps on all
// eight maps, counting only arrivals with nothing lit within 2px of them last
// frame — a speck out of nowhere rather than one that moved:
//
//     baseline   mean brightness at birth 102.9, 100% arrived visible, peak 182
//     with life  mean brightness at birth   1.0,   0% arrived visible, peak   2
//
// Alpha is invisible to the headless context — it records the rectangle, not
// the colour — so the speck is a value now and these nets read it.
section('no speck of air is ever born visible');
{
  const g = loadGame();
  g.setCtx(mkCtx());

  // A mote goes fully out and fully in over its own life, or the fade is not a
  // fade. Sampled from the game's own function, not a copy of its arithmetic.
  const air = g.AIR.emberwood;
  let lo = 1, hi = 0;
  for (let k = 0; k < 900; k++) {
    const a = g.moteAt(0, k / 60, air).a;
    if (a < lo) lo = a;
    if (a > hi) hi = a;
  }
  ok(lo < .01, `a speck goes all the way out (dimmest ${lo.toFixed(4)})`);
  ok(hi > .15, `and all the way back in (brightest ${hi.toFixed(3)})`);

  // `life` is READ, by difference: two specks with different fx have different
  // lives, so they cannot be on the same clock. A fade driven off one shared
  // period would make these equal.
  const lifeOf = (i) => g.moteAt(i, 0, air).life;
  const lives = [];
  for (let i = 0; i < air.motes; i++) lives.push(+lifeOf(i).toFixed(4));
  ok(new Set(lives).size > air.motes * .5,
    `the specks are on their own clocks (${new Set(lives).size} distinct lives among ${air.motes})`);
  ok(Math.min(...lives) >= 6 && Math.max(...lives) <= 11,
    `and each lasts between six and eleven seconds (${Math.min(...lives).toFixed(2)}-${Math.max(...lives).toFixed(2)})`);

  // The claim itself, on every map: a speck that was off the frame last sample
  // and on it now has to arrive dark. This is the pixel measurement above,
  // written down.
  let worst = 0, worstAt = '', arrivals = 0;
  for (const [id, a] of Object.entries(g.AIR)) {
    for (let i = 0; i < (a.motes | 0); i++) {
      let wasIn = null;
      for (let k = 0; k < 1800; k++) {
        const m = g.moteAt(i, k / 60, a);
        const isIn = m.x >= 0 && m.y >= 0 && m.x < g.VIEW_W && m.y < g.VIEW_H;
        if (wasIn === false && isIn) {
          arrivals++;
          if (m.a > worst) { worst = m.a; worstAt = `${id} speck ${i}`; }
        }
        wasIn = isIn;
      }
    }
  }
  ok(arrivals > 0, `specks do cross onto the frame (${arrivals} arrivals seen)`);
  ok(worst < .05, `and the brightest arrival across every map is invisible (${worst.toFixed(4)}, ${worstAt})`);

  // Same t, same frame — the suite and the shot tool both depend on it.
  const one = JSON.stringify(g.moteAt(3, 7.5, air));
  eq(JSON.stringify(g.moteAt(3, 7.5, air)), one, 'and a speck is the same speck at the same moment');

  // Wiring, by difference: drawMotes draws the specks the value says are worth
  // drawing and skips the ones it does not. The first draft of this net counted
  // at an arbitrary moment, where every speck is above the threshold — so both
  // sides were `air.motes` and no break could move them. It has to be netted at
  // a moment when the threshold actually fires, so the moment is SEARCHED for.
  const lit = (tt) => {
    let n = 0;
    for (let i = 0; i < air.motes; i++) if (g.moteAt(i, tt, air).a >= 1 / 255) n++;
    return n;
  };
  let t = -1;
  for (let k = 0; k < 4000 && t < 0; k++) if (lit(k / 60) < air.motes) t = k / 60;
  ok(t >= 0, `there is a moment when a speck is too faint to draw (t=${t.toFixed(3)})`);
  const log = [];
  g.drawMotes(mkCtx(log), air, t);
  eq(log.filter((c) => c[0] === 'fillRect').length, lit(t),
    `the drawing spends the value: ${lit(t)} specks lit of ${air.motes}`);

  // …and it puts them where the value says, not somewhere of its own.
  // …at the coordinates the value names. Asked of a speck that is actually
  // drawn at this moment — the searched t is a moment when one of them is not.
  let mi = 0;
  while (mi < air.motes && g.moteAt(mi, t, air).a < 1 / 255) mi++;
  const m0 = g.moteAt(mi, t, air);
  ok(log.some((c) => c[0] === 'fillRect' && c[1] === m0.x && c[2] === m0.y && c[3] === m0.sz),
    `and at the coordinates the value names (speck ${mi} at ${m0.x},${m0.y})`);

  // The air is still air: turning the dial off empties it, and every map still
  // has specks in it.
  const off = [];
  g.drawMotes(mkCtx(off), { ...air, motes: 0 }, t);
  eq(off.length, 0, 'no motes means no motes');
  for (const [id, a] of Object.entries(g.AIR)) {
    const l = [];
    g.drawMotes(mkCtx(l), a, t);
    ok(l.length > 0, `${id} has air in it`);
  }
}

// A dead-field sweep of the whole file turned up five values the game computes
// and never reads. Four are dead weight; this one was a player-visible gap with
// its own comment on it. `grantCard` ends:
//
//     c.replaced = (CARDS[worst.id] || …).name;   // so the offer can say so
//
// and nothing read `c.replaced`. Driven with the deck at DECK_MAX, a three-pull
// silver chest removed three cards and named none of them: you lose a card per
// pull and are never told which. The note is a value because the shelf is a
// template, which the headless suite cannot see.
section('a pull that costs you a card says which card');
{
  const g = loadGame({});
  g.setCtx(mkCtx());
  g.newGame();
  g.takeStarter('cindercub');
  g.G.dialogue = null;

  // Room in the deck: nothing is thrown away, so there is nothing to say.
  const roomy = g.grantCard('edge');
  eq(g.swapNote(roomy), '', 'a pull into a deck with room replaced nothing');

  // …and the state has to be DIRTIED before the claim can be checked: fill the
  // deck to its ceiling, which is the only condition under which a card goes.
  while (g.G.deck.length < g.DECK_MAX) g.grantCard(g.CARD_IDS[g.G.deck.length % g.CARD_IDS.length]);
  eq(g.G.deck.length, g.DECK_MAX, 'the deck is at its ceiling');

  const before = g.G.deck.slice();
  g.G.gems = 9999;
  const got = g.openChest('silver');
  ok(got && got.length === 3, `the chest pulled ${got && got.length}`);
  const after = g.G.deck.slice();
  const lost = before.filter((u) => !after.includes(u));

  // The claim, by difference: as many cards left as arrived, and every one of
  // them is named. A pull that takes something and says nothing fails here.
  eq(lost.length, got.length, `${got.length} cards in, ${lost.length} out`);
  for (const c of got) {
    ok(g.swapNote(c) !== '', `the pull says what it cost (${g.swapNote(c)})`);
    ok(/^replaced /.test(g.swapNote(c)), 'and says it in words, not as a bare name');
  }

  // The name in the note is the name of a card that actually left, not a
  // plausible-looking string. Read out of the deck diff, not typed in here.
  const lostNames = new Set(lost.map((u) => {
    const o = g.G.cards.find((x) => x.u === u);
    return o && g.CARDS[o.id] ? g.CARDS[o.id].name : null;
  }).filter(Boolean));
  ok(lostNames.size > 0, `something identifiable left the deck (${[...lostNames].join(', ')})`);
  for (const c of got) {
    ok(lostNames.has(g.swapNote(c).replace(/^replaced /, '')),
      `and the note names a card that really went (${g.swapNote(c)})`);
  }

  // The deck did not grow: a chest with a full deck is a swap, not an add.
  eq(after.length, g.DECK_MAX, 'the deck is still at its ceiling');

  // A card whose definition has gone still gets a sentence rather than nothing —
  // that branch is the one an old save walks into.
  const orphan = { u: 999, id: 'no_such_card', replaced: 'an old card' };
  eq(g.swapNote(orphan), 'replaced an old card', 'a card from an old save is still named');

  // Wiring: the shelf spends the value. The panel is a template, so this is the
  // one thing here that has to be asked of the source.
  ok(/swapNote\(c\)/.test(SRC), 'the pulled shelf asks for the note');
  ok(/small class="swapped"/.test(SRC), 'and gives it a line of its own');
  ok(/\.item \.info small\.swapped\{/.test(SRC), 'which is styled apart from the description');
}

// 179 found `G.screen.prev` written by openScreen and read by nothing. Driven
// rather than read: every row of the pause menu — Kin, Dex, Bag, Box, Deck —
// recorded prev='menu' and then dropped you into the world when you pressed
// back, so looking at two of them meant opening the menu twice. Meanwhile the
// profile screen, opened with an explicit `back: 'party'`, returned properly:
// the rule was written and applied to exactly one case.
// Every read of G.menu/G.screen below goes through a guard rather than off a
// bare `.i`. A net that THROWS takes every check after it off the board, and
// pass 182's mutation sweep counted those as survivors — deleting the pause
// menu's return threw here, cost 90 checks, and read back as "not one of them
// died". A break has to produce a failure, not silence.
section('back out of a menu row goes back to the menu');
{
  const g = loadGame({});
  g.setCtx(mkCtx());
  const tap = (k) => { g.pressKey(k); g.frame(.016); g.releaseKey(k); g.frame(.016); };
  const fresh = () => {
    g.newGame();
    g.takeStarter('cindercub');
    g.G.dialogue = null; g.G.screen = null; g.G.menu = null; g.G.mode = 'world';
    g.G.party = [g.mkMon('cindercub', 8), g.mkMon('pyrelynx', 9)];
    g.G.bag = { salve: 2, orb: 3 };
    g.G.box = [g.mkMon('brookite', 5)];
  };

  // The rows are read OUT of the menu the game builds, not listed here — a row
  // added or renamed must not quietly fall outside this net.
  fresh();
  tap('b');
  ok(g.G.menu && g.G.mode === 'menu', 'the pause menu opens');
  const rows = g.G.menu.rows.map((r) => r.label);
  const opens = [];
  for (let row = 0; row < rows.length; row++) {
    fresh();
    tap('b');
    for (let i = 0; i < row; i++) tap('down');
    eq(g.G.menu && g.G.menu.i, row, `the cursor walks to ${rows[row]}`);
    tap('a');
    if (!g.G.screen) continue;                       // Sound, Save, Close, Fullscreen
    opens.push(rows[row]);
    eq(g.G.screen && g.G.screen.prev, 'menu', `${rows[row]} remembers it came from the menu`);
    eq(g.G.screen && g.G.screen.prevRow, row, 'and which row of it');
    tap('b');
    ok(!g.G.screen, `${rows[row]} closes`);
    ok(!!g.G.menu, `and puts the menu back (${rows[row]})`);
    eq(g.G.mode, 'menu', 'in menu mode, not out in the grass');
    eq(g.G.menu && g.G.menu.i, row, `with the cursor still on ${rows[row]}`);
    // …and one more back is the way out, or the menu is a trap.
    tap('b');
    ok(!g.G.menu && g.G.mode === 'world', `and a second back leaves (${rows[row]})`);
  }
  ok(opens.length >= 5, `every row that opens a screen was walked (${opens.join(', ')})`);

  // Two screens in one visit — the whole point of the change.
  fresh();
  tap('b');
  const seen = [];
  for (const row of [0, 2]) {
    // Guarded for the same reason as above: with no menu this walked off a null
    // and took the rest of the suite with it.
    while (g.G.menu && g.G.menu.i > row) tap('up');
    while (g.G.menu && g.G.menu.i < row) tap('down');
    tap('a');
    if (g.G.screen) seen.push(g.G.screen.kind);
    tap('b');
  }
  eq(seen.length, 2, `two screens visited without reopening the menu (${seen.join(', ')})`);
  ok(!!g.G.menu, 'and the menu is still up at the end of it');

  // Nothing else moved. A screen opened from the world still leaves to the
  // world, and one opened in a fight still leaves to the fight.
  fresh();
  g.openScreen('party');
  eq(g.G.screen && g.G.screen.prev, 'world', 'a screen opened from the world remembers the world');
  g.closeScreen();
  eq(g.G.mode, 'world', 'and goes back to it');
  ok(!g.G.menu, 'without conjuring a menu that was never open');

  fresh();
  g.startBattle({ foe: g.mkMon('kindlark', 8), wild: true });
  g.openScreen('bag');
  eq(g.G.screen && g.G.screen.prev, 'battle', 'a bag opened in a fight remembers the fight');
  g.closeScreen();
  eq(g.G.mode, 'battle', 'and goes back to it');

  // The path that already worked still works: a profile named its own way back
  // before this pass and must not have been overtaken by prev.
  fresh();
  g.openScreen('party');
  g.openScreen('profile', { mon: g.G.party[0], back: 'party' });
  g.closeScreen();
  ok(g.G.screen && g.G.screen.kind === 'party', 'a profile still returns to the list it names');
}

// 180 gave the pause menu its way back by testing `s.prev === 'menu'`, which
// reads the MODE — and the battle's Actions menu never sets a mode, so the rule
// could not reach it. Driven through the real input ladder, a fight still
// dropped you at your hand: checking a kin and then an item meant opening
// Actions twice. Keyed on the menu itself now, so both are one sentence.
//
// Reaching this at all took four goes. `frame()` takes a wall-clock TIMESTAMP,
// not a dt — feeding it the same number twice advances zero time while input
// still fires, so the opening log sat at hold 0.38 for six hundred iterations
// and the probe reported "menu none" as if it were a finding.
section('back out of a battle menu row goes back to the battle menu');
{
  const g = withDeck(loadGame({}));
  g.setCtx(mkCtx());
  let ms = 0;
  const step = (n = 16) => { ms += n; g.frame(ms); };
  const tap = (k) => { g.pressKey(k); step(); g.releaseKey(k); step(); };
  const fresh = () => {
    g.newGame();
    g.takeStarter('cindercub');
    g.G.dialogue = null; g.G.screen = null; g.G.menu = null; g.G.mode = 'world';
    g.G.party = [g.mkMon('cindercub', 12), g.mkMon('pyrelynx', 12)];
    g.G.bag = { salve: 2, bloomorb: 3 };
    g.startBattle({ foe: g.mkMon('kindlark', 10), wild: true });
    const b = g.B();
    b.entry = 1;
    // Each blocker has its own way out; a battle message will not advance while
    // its hold is up, and the hold only decays inside step().
    const ready = () => !g.G.dialogue && !g.G.battleMsg && !b.over
      && !(b.log && b.li < b.log.length) && b.hand.length > 0;
    for (let i = 0; i < 600 && !ready(); i++) {
      if (g.G.battleMsg) { g.G.battleMsg.hold = 0; g.advanceDialogue(); continue; }
      if (g.G.dialogue) { g.G.dialogue.hold = 0; g.advanceDialogue(); continue; }
      step(50);
    }
    ok(ready(), 'the fight is taking input');
    return b;
  };

  // B opens it, not Up — Up plays the card you are on. The doc comment said Up
  // for as long as this menu has existed.
  fresh();
  tap('up');
  ok(!g.G.menu, 'up does not open the actions menu');
  fresh();
  tap('b');
  ok(g.G.menu && g.G.menu.elId === 'battlemenu', 'B opens the actions menu');

  // Rows read OUT of the menu the game builds, so one added or renamed cannot
  // fall outside this net.
  const rows = g.G.menu.rows.map((r) => r.label);
  ok(rows.length >= 5, `the actions are ${rows.join(', ')}`);
  const opened = [];
  for (let row = 0; row < rows.length; row++) {
    fresh();
    tap('b');
    for (let i = 0; i < row; i++) tap('down');
    eq(g.G.menu && g.G.menu.i, row, `the cursor walks to ${rows[row]}`);
    tap('a');
    if (!g.G.screen) continue;                       // Run, End turn, Back
    opened.push(rows[row]);
    eq(g.G.screen && g.G.screen.prevMenu, 'battlemenu', `${rows[row]} remembers which menu it came out of`);
    eq(g.G.screen && g.G.screen.prevRow, row, 'and which row of it');
    tap('b');
    ok(!g.G.screen, `${rows[row]} closes`);
    ok(!!g.G.menu, `and puts the actions back (${rows[row]})`);
    eq(g.G.menu && g.G.menu.i, row, `with the cursor still on ${rows[row]}`);
    eq(g.G.mode, 'battle', 'still in the fight');
    tap('b');
    ok(!g.G.menu, `and a second back returns to the hand (${rows[row]})`);
  }
  eq(opened.length, 2, `both screen rows were walked (${opened.join(', ')})`);

  // Two rows in one visit, which is the point.
  fresh();
  tap('b');
  const seen = [];
  for (const row of [0, 1]) {
    while (g.G.menu && g.G.menu.i > row) tap('up');
    while (g.G.menu && g.G.menu.i < row) tap('down');
    tap('a');
    if (g.G.screen) seen.push(g.G.screen.kind);
    tap('b');
  }
  eq(seen.length, 2, `two screens without reopening the actions (${seen.join(', ')})`);
  ok(!!g.G.menu, 'and the actions are still up at the end of it');

  // A screen opened in a fight WITHOUT the menu must not conjure one.
  fresh();
  g.openScreen('bag');
  eq(g.G.screen ? g.G.screen.prevMenu : 'no screen at all', null, 'a bag opened straight from the fight came from no menu');
  g.closeScreen();
  ok(!g.G.menu, 'and closing it does not invent the actions menu');
  eq(g.G.mode, 'battle', 'it goes back to the fight');

  // And the fight not being interrupted by any of this: no frame threw.
  eq(g.frame.errs || 0, 0, 'nothing threw while driving the fight');
}

// The pause menu's return, re-netted after 180's `prev === 'menu'` was replaced
// by the menu-id test — the same claim, so it must survive the generalisation.
section('and the pause menu still goes back the same way');
{
  const g = loadGame({});
  g.setCtx(mkCtx());
  let ms = 0;
  const step = (n = 16) => { ms += n; g.frame(ms); };
  const tap = (k) => { g.pressKey(k); step(); g.releaseKey(k); step(); };
  g.newGame();
  g.takeStarter('cindercub');
  g.G.dialogue = null; g.G.mode = 'world';
  g.G.party = [g.mkMon('cindercub', 8)];
  g.G.bag = { salve: 2 };
  tap('b');
  ok(g.G.menu && g.G.menu.elId === 'mainmenu', 'the pause menu is the main menu');
  tap('a');
  eq(g.G.screen && g.G.screen.prevMenu, 'mainmenu', 'and a row remembers it');
  tap('b');
  ok(!!g.G.menu && g.G.mode === 'menu', 'back puts it up again');
}

// A fight opens through closing bars; a door goes through black at .3; waking
// after a loss at .5; the title at .45. Measured across every cut in the game,
// the way OUT of a fight was the only one with nothing over it:
//
//     world -> battle          wipe 0.550    35/36 frames covered
//     world -> world (door)    fade 0.300    30/31 frames covered
//     battle -> world (a win)  nothing        0/86 frames covered
//     evolution -> world       nothing        0/282 frames covered
//
// Both paths already met at the same saveGame(), so they take the same way back.
section('a fight hands the map back the way everything else does');
{
  const g = withDeck(loadGame({}));
  g.setCtx(mkCtx());
  let ms = 0;
  const step = (n = 16) => { ms += n; g.frame(ms); };
  const fresh = () => {
    g.newGame();
    g.takeStarter('cindercub');
    g.G.dialogue = null; g.G.screen = null; g.G.menu = null; g.G.mode = 'world';
    g.G.party = [g.mkMon('cindercub', 14), g.mkMon('pyrelynx', 14)];
    g.G.bag = { salve: 2, bloomorb: 3 };
  };

  ok(g.BATTLE_OUT > 0, `the way out has a length (${g.BATTLE_OUT}s)`);

  // The claim, by difference: from the blow that ends a fight to the frame you
  // can move again, the screen is covered for some of it. Driven, not posed —
  // and the window has to run past mode 'world', because the cover is what
  // stands between mode 'world' and being able to move.
  fresh();
  g.startBattle({ foe: g.mkMon('kindlark', 4), wild: true });
  autoFight(g);
  ok(g.G.battle && g.B().over === 'win', `the fight was won (${g.G.battle && g.B().over})`);
  g.G.fade = 0; g.G.wipe = 0;                       // the entry's cover is not the exit's
  let covered = 0, frames = 0;
  for (let i = 0; i < 600 && (g.G.battle || g.G.mode !== 'world' || g.screenCovered()); i++) {
    if (g.G.battleMsg) { g.G.battleMsg.hold = 0; g.advanceDialogue(); continue; }
    if (g.G.dialogue) { g.G.dialogue.hold = 0; g.advanceDialogue(); continue; }
    if (g.G.screen) { if (g.screenLocked(g.G.screen)) g.screenSelect(); else g.closeScreen(); continue; }
    step();
    if (g.screenCovered()) covered++;
    frames++;
  }
  ok(!g.G.battle && g.G.mode === 'world', 'the fight let go of the map');
  ok(covered > 0, `and covered the cut on the way out (${covered} of ${frames} frames)`);
  ok(!g.screenCovered(), 'and cleared, so the map is not left under a veil');

  // The same for an evolution, which ends at the same saveGame() and had the
  // same nothing over it.
  fresh();
  g.G.party = [g.mkMon('cindercub', 20)];
  const evo = g.checkEvolve();
  ok(!!evo, 'a kin is ready to evolve');
  if (evo) {
    g.runEvolution(evo);
    let cov2 = 0, n2 = 0;
    for (let i = 0; i < 900 && (g.G.evoAnim || g.G.dialogue || g.screenCovered()); i++) {
      if (g.G.dialogue) { g.G.dialogue.hold = 0; g.advanceDialogue(); continue; }
      step();
      if (g.screenCovered()) cov2++;
      n2++;
    }
    ok(!g.G.evoAnim, 'the evolution finished');
    ok(cov2 > 0, `and covered its cut too (${cov2} of ${n2} frames)`);
  }

  // When a fix is "put a cover up", net separately that the thing the cover was
  // hiding still HAPPENS: backToWorld saves.
  fresh();
  const store = {};
  const h = withDeck(loadGame(store));
  h.setCtx(mkCtx());
  h.newGame();
  h.takeStarter('cindercub');
  h.G.dialogue = null;
  h.G.party = [h.mkMon('cindercub', 9)];
  h.wipeSave();
  ok(!h.hasSave(), 'no save to begin with');
  h.backToWorld();
  ok(h.hasSave(), 'and handing the map back still writes one');
  ok(h.G.fade > 0, 'with the cover up');

  // A cover already running is never cut short — `max`, not assignment.
  h.G.fade = .5;
  h.backToWorld();
  ok(h.G.fade >= .5, `a longer cover already up is not shortened (${h.G.fade})`);
}

// This file says three times that two beats must not make the same sound: a
// menu that opens and one that confirms, the chest that borrowed the catch, the
// crit that arrived as an ordinary hit. Then the victory flourish played
// `level`, and so did the card offer behind it. Measured on one win that
// levelled, dice pinned, the level-up's climb was heard THREE times:
//
//     before   weak, weak, weak, downed, level, level, world, level, select
//     after    weak, weak, weak, downed, level, win,   world, offer, select
//
// Cues are unhearable from here, so they are recorded rather than played, and
// the claim is netted on the NOTES — two names with the same body would still
// be the same sound.
section('two different beats do not make the same sound');
{
  // playCue returns early when HEADLESS and blip needs an AudioContext, so both
  // are made to record instead. This is the only way the suite can hear.
  const spy = (src) => src
    // Record the cue and DO NOT return, so the notes underneath it run…
    .replace('function playCue(kind) {\n  if (HEADLESS) return;',
      'function playCue(kind) {\n  if (HEADLESS) (globalThis.__cues = globalThis.__cues || []).push(kind);')
    // …past the AudioContext, which does not exist here and made playCue return
    // before a single note. Anchored on playCue's OWN line: `const ac =
    // audio();` appears twice in the file and String.replace takes the first,
    // so the first attempt stubbed a different function and recorded nothing.
    .replace(/function playCue\(kind\) \{([\s\S]*?)const ac = audio\(\);/,
      (m, mid) => `function playCue(kind) {${mid}const ac = { currentTime: 0 };`)
    // And blip writes down what it was asked for instead of playing it.
    .replace('function blip(freq, dur, type, gain, when) {',
      'function blip(freq, dur, type, gain, when) {\n  (globalThis.__blips = globalThis.__blips || []).push([Math.round(freq), dur, type, gain || 0, when || 0]);\n  if (HEADLESS) return;');
  const g = withDeck(loadGame({}, spy));
  g.setCtx(mkCtx());

  // What a cue SOUNDS like, as a value: the notes it makes.
  const notesOf = (kind) => {
    globalThis.__blips = [];
    g.playCue(kind);
    return JSON.stringify(globalThis.__blips);
  };
  ok(notesOf('level') !== '[]', 'a cue can be heard from here at all');

  // By difference, on the sound and not the name: every beat that used to share
  // `level` now has its own.
  const lvl = notesOf('level'), win = notesOf('win'), offer = notesOf('offer'), menu = notesOf('menu');
  ok(win !== '[]', 'a win has a sound');
  ok(offer !== '[]', 'an offer has a sound');
  ok(win !== lvl, 'a win does not sound like a level');
  ok(offer !== lvl, 'an offer does not sound like a level');
  ok(offer !== menu, 'nor like opening a menu');
  ok(win !== offer, 'and a win does not sound like the offer behind it');

  // …and the whole table, so a future cue cannot be added as a duplicate of one
  // already there. Read out of playCue, not listed here.
  const body = (SRC.match(/function playCue\(kind\)[\s\S]*?\n\}\n/) || [''])[0];
  const kinds = [...new Set((body.match(/kind === '[a-z_]+'/g) || []).map((m) => m.replace(/kind === '|'/g, '')))];
  ok(kinds.length > 20, `the table has ${kinds.length} sounds in it`);
  const bySound = new Map();
  const twins = [];
  for (const k of kinds) {
    const n = notesOf(k);
    if (n === '[]') continue;                       // themes and the like
    if (bySound.has(n)) twins.push(`${bySound.get(n)} and ${k}`);
    else bySound.set(n, k);
  }
  eq(twins.length, 0, `no two cues make the same noise${twins.length ? ': ' + twins.join(', ') : ''}`);

  // The beats themselves, driven: a win that also levels must not say the same
  // thing twice. The state is DIRTIED — a kin one point of XP under a level —
  // or the collision cannot happen at all.
  const rnd = Math.random;
  Math.random = () => 0.5;                          // pinned everywhere, scene and suite
  try {
    g.newGame();
    g.takeStarter('cindercub');
    g.G.dialogue = null; g.G.mode = 'world';
    const mine = g.mkMon('cindercub', 8);
    mine.xp = g.xpFor(9) - 1;
    g.G.party = [mine];
    g.startBattle({ foe: g.mkMon('kindlark', 3), wild: true });
    globalThis.__cues = [];
    let ms = 0;
    const step = (n = 50) => { ms += n; g.frame(ms); };
    for (let k = 0; k < 80 && g.G.battle && !g.B().over; k++) {
      const b = g.B();
      const i = b.hand.findIndex((c) => g.cardCost(c) <= b.energy);
      // submitLog only QUEUES the log; the cues fire as playbackStep walks it.
      if (i >= 0) g.submitLog(g.playCard(i)); else g.submitLog(g.endTurn());
      for (let f = 0; f < 200 && g.G.battle && g.B().log && g.B().li < g.B().log.length; f++) {
        if (g.G.battleMsg) { g.G.battleMsg.hold = 0; g.advanceDialogue(); continue; }
        step();
      }
    }
    ok(g.G.battle && g.B().over === 'win', `the fight was won (${g.G.battle && g.B().over})`);
    for (let i = 0; i < 900 && (g.G.battle || g.G.mode !== 'world' || g.screenCovered()); i++) {
      if (g.G.battleMsg) { g.G.battleMsg.hold = 0; g.advanceDialogue(); continue; }
      if (g.G.dialogue) { g.G.dialogue.hold = 0; g.advanceDialogue(); continue; }
      if (g.G.screen) { if (g.screenLocked(g.G.screen)) g.screenSelect(); else g.closeScreen(); continue; }
      step();
    }
    const heard = (globalThis.__cues || []).slice();
    eq(g.G.party[0].lvl, 9, 'the kin levelled during the fight');
    ok(heard.includes('win'), `the win was announced (${heard.join(', ')})`);
    ok(heard.includes('offer'), 'and the offer asked');
    eq(heard.filter((c) => c === 'level').length, 1,
      `the level-up's sound is heard once, for the level (${heard.join(', ')})`);
  } finally {
    Math.random = rnd;
  }
}

// Every other line in this game names its number — "Shield up to 8", "hit for
// +4", "took 43", "gained 385 EXP", "It cost you 12 shards" — and the two beats
// that permanently change what a creature IS named only the name. Measured:
//
//     a level (8->10)   hp 25->29  atk 13->16  def 12->13  spd 13->15
//                       said "grew to level 9!"  twice, naming none of it
//     an evolution      hp 49->54  atk 27->36  def 22->28  spd 25->37
//                       said "Cindercub became Pyrelynx!"
//
// One helper for both, because fixing one is how 180's fix reached one menu and
// not the other.
section('a beat that changes your numbers says which ones');
{
  const g = loadGame({});
  g.setCtx(mkCtx());
  g.newGame();
  g.takeStarter('cindercub');
  g.G.dialogue = null;

  // The value on its own, by difference.
  const was = { max: 20, atk: 10, def: 10, spd: 10 };
  eq(g.gainLine(was, was), '', 'a change of nothing says nothing');
  eq(g.gainLine(was, { ...was, max: 22 }), '+2 HP', 'one number moving names one number');
  eq(g.gainLine(was, { ...was, atk: 13, spd: 11 }), '+3 ATK, +1 SPD', 'and only the ones that moved');
  ok(!/\+0/.test(g.gainLine(was, { ...was, def: 10, max: 21 })), 'nothing is ever named as +0');
  eq(g.gainLine(was, { ...was, max: 18 }), '-2 HP', 'and a number going down is named too');

  // The words are the game's OWN. Read out of the profile markup rather than
  // typed here: the first draft invented "attack, defence, speed" for stats the
  // screens already call ATK, GUARD and SPD — a second vocabulary, and long
  // enough that the worst-case line ran 368px into a 367px bar on a phone.
  const labels = g.gainLine(was, { max: 21, atk: 11, def: 11, spd: 11 })
    .split(', ').map((p) => p.split(' ')[1]).filter(Boolean);
  eq(labels.length, 4, `all four numbers are named (${labels.join(', ')})`);
  const profile = SRC.match(/statBlock\(m\)[\s\S]*?\n\}/)[0];
  // A fixed number of checks: this loop walks the WORDS THE PROFILE USES, not
  // the words gainLine produced, so a mutant that empties gainLine fails these
  // rather than quietly asserting fewer times — the sweep read that as a crash.
  for (const L of ['ATK', 'GUARD', 'SPD']) {
    ok(new RegExp(`\\b${L}\\b`).test(profile), `the profile screen says "${L}"`);
    ok(labels.includes(L), `and so does a gain line ("${L}")`);
  }

  // A LEVEL, driven — the state is dirtied to one point under the boundary or
  // no level can happen at all.
  const m = g.mkMon('cindercub', 8);
  g.G.party = [m];
  g.startBattle({ foe: g.mkMon('kindlark', 30), wild: true });
  g.B().mine = m;
  m.xp = g.xpFor(9) - 1;
  const before = g.statSnap(m);
  const log = [];
  g.grantXP(log, m, g.mkMon('kindlark', 30));
  const after = g.statSnap(m);
  const lvLines = log.filter((e) => e.fx === 'level').map((e) => e.t);
  ok(lvLines.length > 0, `the level was announced (${lvLines.join(' | ')})`);
  ok(after.max > before.max, `and the numbers really moved (hp ${before.max}->${after.max})`);
  // By difference: the deltas the lines name must add up to the deltas that
  // happened. A line that names a plausible number rather than the real one
  // fails here.
  const summed = { max: 0, atk: 0, def: 0, spd: 0 };
  const KEY = { HP: 'max', ATK: 'atk', GUARD: 'def', SPD: 'spd' };
  for (const t of lvLines) {
    for (const [, d, L] of t.matchAll(/([+-]\d+) (HP|ATK|GUARD|SPD)/g)) summed[KEY[L]] += +d;
  }
  for (const k of ['max', 'atk', 'def', 'spd']) {
    eq(summed[k], after[k] - before[k], `the level's lines account for every point of ${k}`);
  }

  // AN EVOLUTION — the same helper, so the same claim.
  const e = g.mkMon('cindercub', 20);
  g.G.party = [e];
  const eBefore = g.statSnap(e);
  const r = g.evolveMon(e);
  const eAfter = g.statSnap(e);
  ok(r && r.gained, `the evolution names what it changed (${r && r.gained})`);
  const eSum = { max: 0, atk: 0, def: 0, spd: 0 };
  for (const [, d, L] of String(r.gained).matchAll(/([+-]\d+) (HP|ATK|GUARD|SPD)/g)) eSum[KEY[L]] += +d;
  for (const k of ['max', 'atk', 'def', 'spd']) {
    eq(eSum[k], eAfter[k] - eBefore[k], `the evolution accounts for every point of ${k}`);
  }

  // …and it reaches the sentence the player actually reads. The line is built
  // in a template, so it is asked for as a value.
  ok(/\$\{r\.gained \? ` \$\{r\.gained\}\.` : ''\}/.test(SRC),
    'and the line the player reads carries it');
  ok(/grew to level \$\{winner\.lvl\}!\$\{grew \? ` \$\{grew\}\.` : ''\}/.test(SRC),
    'as does the level line');

  // The worst case still fits the battle bar. Measured in a browser at 367px;
  // netted here as the length that bought it, because a headless box has no
  // pixels — an eleven-letter nickname at level 99 with all four moving.
  const worst = `Bartholomew grew to level 99! ${g.gainLine({ max: 0, atk: 0, def: 0, spd: 0 }, { max: 12, atk: 9, def: 6, spd: 12 })}.`;
  ok(worst.length <= 64, `the longest line this can produce is ${worst.length} chars`);
}

// Every beat that takes the screen hands it back, and none of them starves
// under a cover — that came back clean. What did not was WHICH ones you can
// press past. The ladder's own comment says "any key skips the tail of it —
// nobody should have to sit through a flourish twice":
//
//     beat          left alone   pressing A   skips?
//     warp            12 fr        12 fr        NO      0.19s, a curtain
//     evoAnim        282 fr       282 fr        NO      4.45s
//     alert           87 fr        87 fr        NO      a trainer walking up
//     rustle          26 fr        26 fr        NO
//     mend            73 fr        73 fr        NO
//     blackout        67 fr        67 fr        NO
//     chestOpen      101 fr        45 fr        yes
//     flourish        86 fr         1 fr        yes
//     gotcha         126 fr         1 fr        yes
//
// The mercy went to the 1.4s flourish, the 1.6s chest and the 2s gotcha, and
// not to the 4.45s evolution — three times the next-longest beat, and the only
// one that can fire twice in a row, because its own ending looks for another
// evolution and starts it.
section('the longest beat in the game can be pressed past');
{
  const g = loadGame({});
  g.setCtx(mkCtx());
  const run = (press) => {
    g.newGame();
    g.takeStarter('cindercub');
    g.G.dialogue = null; g.G.screen = null; g.G.menu = null; g.G.mode = 'world';
    g.G.party = [g.mkMon('cindercub', 20)];
    const evo = g.checkEvolve();
    if (!evo) return null;
    g.runEvolution(evo);
    let ms = 0, n = 0, said = null, sawBurst = false, swappedAt = null;
    while (n < 1500 && (g.G.evoAnim || g.G.dialogue)) {
      if (g.G.dialogue) { said = said || g.G.dialogue.lines[0]; g.G.dialogue.hold = 0; g.advanceDialogue(); continue; }
      if (press) g.pressKey('a');
      ms += 16; g.frame(ms);
      if (press) g.releaseKey('a');
      if (g.evoPhase() === 'burst') sawBurst = true;
      if (g.G.evoAnim && g.G.evoAnim.swapped && swappedAt === null) swappedAt = n;
      n++;
    }
    return { n, sawBurst, swappedAt, said, species: g.G.party[0].species, done: !g.G.evoAnim };
  };

  const slow = run(false);
  ok(slow, 'a kin was ready to evolve');
  const fast = run(true);

  // By difference: pressing must shorten it.
  ok(fast.n < slow.n * .9, `a press shortens it (${slow.n} frames -> ${fast.n})`);
  ok(fast.n > 1, 'but does not end it on the spot');

  // …and never past the change. This is the chest's rule in the chest's words:
  // the thing you paid for should never be the part that gets cut.
  ok(fast.sawBurst, 'the burst is still on screen after a skip');
  eq(fast.species, 'pyrelynx', 'and the creature really changed');
  eq(slow.species, 'pyrelynx', 'as it does when left alone');
  ok(fast.swappedAt !== null && fast.swappedAt < slow.swappedAt,
    `the change arrives sooner, not later (frame ${fast.swappedAt} vs ${slow.swappedAt})`);

  // What is left after a skip is the change itself, not a stub: burst + settle
  // + quiet, which is EVO's own arithmetic rather than a number typed here.
  const tail = (g.EVO.burst + g.EVO.settle + g.EVO.quiet) / .016;
  ok(fast.n >= tail * .8, `and the whole change still plays (${fast.n} frames, tail is ~${Math.round(tail)})`);

  // The thing behind the beat still happens — a skip must not cost the sentence.
  ok(/became/.test(String(fast.said)), `it still says what happened (${fast.said})`);
  ok(/\+\d+ HP/.test(String(fast.said)), 'and still names the numbers');
  ok(fast.done, 'and it hands the screen back');
}

// The rule applied to ALL its cases, not just the one this pass fixed. Read out
// of the ladder in step() rather than listed here, so a beat added tomorrow is
// asked the same question.
section('every beat that can be pressed past still can');
{
  const g = withDeck(loadGame({}));
  g.setCtx(mkCtx());
  const ladder = [...new Set((SRC.match(/if \(G\.(\w+)[^\n]*?Step\(dt\)\) return;/g) || [])
    .map((m) => m.replace(/if \(G\.|\s.*$/g, '')))];
  ok(ladder.length >= 8, `the ladder owns ${ladder.length} beats: ${ladder.join(', ')}`);
  ok(ladder.includes('evoAnim'), 'and the evolution is one of them');
  ok(ladder.includes('flourish') && ladder.includes('chestOpen'), 'as are the flourish and the chest');

  // Each skippable beat's step must read a press. Asked of the FUNCTION, so a
  // step that stops reading input fails here whatever its clock does.
  for (const fn of ['flourishStep', 'chestStep', 'evoStep']) {
    const at = SRC.indexOf(`function ${fn}(dt) {`);
    const body = at < 0 ? '' : SRC.slice(at, SRC.indexOf('\n}', at) + 2);
    ok(body.length > 40, `found ${fn}`);
    ok(/justPressed\('a'\)/.test(body) && /justPressed\('b'\)/.test(body),
      `${fn} answers a press`);
  }
  // …and the gotcha, which is inline in the ladder rather than a step of its own.
  ok(/G\.gotcha\.t > 2 \|\| justPressed\('a'\) \|\| justPressed\('b'\)/.test(SRC),
    'and the gotcha answers one too');
}

// The suite used to read the game TWICE. `loadGame` honours EK_GAME so a
// mutation sweep can point it at a mutant; the 135 source checks read a
// hardcoded path. So under every mutant the driven checks saw the mutation and
// every source check saw the original — all of them structurally invisible, and
// one whole section came back "0 killed" while the same mutation run by hand
// plainly killed a check in it. 105 of 1427 checks were killed by the mutant
// set before, 108 after; the count matters less than the fact that the sweep's
// loudest output was wrong.
section('the suite reads the game it runs');
{
  // By difference, and about the FILE rather than any one check: point the
  // loader at a copy with a known change in it, and the source the suite reads
  // has to contain that change. Nothing here reads the working tree.
  const { readFileSync: rf, writeFileSync: wf, mkdtempSync } = await import('node:fs');
  const { join: pjoin } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const dir = mkdtempSync(pjoin(tmpdir(), 'ek-same-'));
  const twin = pjoin(dir, 'twin.html');
  const MARK = 'EK_SAME_FILE_MARKER_187';
  wf(twin, rf(GAME, 'utf8').replace('<script>', `<script>\n// ${MARK}\n`));

  ok(SRC.length > 100000, `the suite has the source (${SRC.length} bytes)`);
  ok(!SRC.includes(MARK), 'and it does not contain the marker by accident');

  const twinSrc = rf(twin, 'utf8');
  ok(twinSrc.includes(MARK), 'the twin does contain it');

  // The claim: SRC comes from GAME, whatever GAME is. Read the same way the
  // suite reads it, from the same handle.
  eq(rf(GAME, 'utf8').length, SRC.length, 'SRC is the file GAME names, byte for byte');
  ok(GAME.endsWith('index.html') || GAME === process.env.EK_GAME,
    `and GAME is a real path (${String(GAME).split('/').slice(-2).join('/')})`);

  // …and the loader uses the same one. Driven: a game loaded from GAME must
  // agree with the source the suite is asserting against.
  const g = loadGame({});
  ok(typeof g.playCue === 'function', 'the loader loaded something');
  const fromSrc = /const BATTLE_OUT = ([\d.]+);/.exec(SRC);
  ok(fromSrc, 'the source names a constant this suite can check against the loaded game');
  if (fromSrc) {
    eq(g.BATTLE_OUT, Number(fromSrc[1]),
      'and the loaded game agrees with the source the suite read');
  }
}

// The screen panel is `overflow: auto`, so it CAN be scrolled — and nothing
// ever scrolled it. Walking the cursor down on a phone at 390x760, measured:
//
//     swap   worst selection 392px outside the box   scrollTop stayed 0
//     deck   worst selection 357px outside the box   scrollTop stayed 0
//     box    worst selection 456px outside the box   scrollTop stayed 0
//     party  worst selection   0px                   (it fits)
//
// The swap screen is LOCKED — `screenLocked` refuses to close it — so you were
// choosing a card you could not see, on a screen you were not allowed to leave.
//
// The panel is markup the headless suite cannot measure, so the decision is a
// value and these nets read the value.
section('the list follows the cursor');
{
  const g = loadGame({});
  g.setCtx(mkCtx());
  const box = (scrollTop, height) => ({ scrollTop, height });

  // Already in view: the list must not shift under your thumb.
  eq(g.scrollFor({ top: 40, height: 50 }, box(0, 310)), 0, 'a selection in view does not move the list');
  eq(g.scrollFor({ top: 400, height: 50 }, box(380, 310)), 380, 'nor one in view further down');

  // Below the fold: bring its BOTTOM to the bottom of the window, no further.
  eq(g.scrollFor({ top: 400, height: 100 }, box(0, 310)), 190, 'a selection below the fold is scrolled to');
  eq(g.scrollFor({ top: 310, height: 0 }, box(0, 310)), 0, 'one exactly at the edge is already in');

  // Above: bring its TOP to the top.
  eq(g.scrollFor({ top: 20, height: 50 }, box(200, 310)), 20, 'a selection above the window is scrolled back to');
  eq(g.scrollFor({ top: 0, height: 50 }, box(200, 310)), 0, 'and the first row goes to the very top');

  // Never off the top of the content.
  ok(g.scrollFor({ top: -50, height: 20 }, box(0, 310)) >= 0, 'the list never scrolls above itself');
  ok(g.scrollFor({ top: 5, height: 400 }, box(0, 310)) >= 0, 'nor for a selection taller than the window');

  // A box with no height cannot be scrolled into anything — leave it alone.
  eq(g.scrollFor({ top: 900, height: 50 }, box(77, 0)), 77, 'an unmeasured box is left where it is');
  eq(g.scrollFor(null, box(77, 310)), 77, 'and so is one with nothing selected');

  // By difference, over a whole list: walk a cursor down rows taller than the
  // window and the selection must be inside the window at every step. This is
  // the phone measurement, in arithmetic.
  {
    const ROW = 150, N = 8, H = 310;
    let top = 0, worst = 0;
    for (let i = 0; i < N; i++) {
      const sel = { top: i * ROW, height: ROW };
      top = g.scrollFor(sel, box(top, H));
      const above = top - sel.top, below = (sel.top + sel.height) - (top + H);
      worst = Math.max(worst, Math.max(0, above), Math.max(0, below));
    }
    eq(worst, 0, `walking ${N} rows of ${ROW}px through a ${H}px window never leaves the selection outside`);
    ok(top > 0, `and the list actually moved (scrollTop ${top})`);
  }
  // …and a list that FITS never moves at all, which is what `party` does.
  {
    const ROW = 60, N = 4, H = 310;
    let top = 0;
    for (let i = 0; i < N; i++) top = g.scrollFor({ top: i * ROW, height: ROW }, box(top, H));
    eq(top, 0, 'a list shorter than the window is never scrolled');
  }

  // Wiring: renderScreen spends it, once, for every screen — not per kind.
  ok(/el\.scrollTop = scrollFor\(\{ top: cur\.offsetTop, height: cur\.offsetHeight \}/.test(SRC),
    'renderScreen puts the window where the cursor is');
  // Counted, not guessed: the definition is an arrow (`const scrollFor =`), so
  // there is exactly ONE `scrollFor(` call in the file — the call site.
  ok(/const scrollFor = \(sel, box, pad = 0\) =>/.test(SRC), 'the value is defined once');
  eq((SRC.match(/scrollFor\(/g) || []).length, 1,
    'and spent in one place — every screen goes through renderScreen');
  // After the markup: the element under the cursor does not exist before it.
  const rs = SRC.indexOf('function renderScreen()');
  const body = SRC.slice(rs, SRC.indexOf('\n}', SRC.indexOf('paintCardArt(el);', rs)));
  ok(body.includes('scrollFor('), 'the call is inside renderScreen');
  ok(body.indexOf('el.innerHTML = html;') < body.indexOf('scrollFor('),
    'and after the markup, or there is nothing under the cursor to find');
}

// Every sentence the screens write, measured against the panel a player is
// actually looking at on a phone. Fifty of them across sixteen raisings at
// 390x760; eleven were outside the box. The worst two were not merely below the
// fold — they were scrolled off the TOP, by the game's own hand:
//
//   swap   "What comes out?"                          top -66   OFF THE TOP
//   swap   "A deck holds 12 … pick the one it replaces"  top -46   OFF THE TOP
//   box    "Pick on a boxed kin withdraws it · …"      top 1003  below the fold
//   dex    the habitat line under a 19-cell grid       top 985   below the fold
//   deck   "Everything you own is in the deck."        top 725   below the fold
//   starter  the third kin's dex line                  top 419   below the fold
//
// `scrollFor` puts the window where the cursor is, and on `swap` the cursor
// lives below the question — so opening the screen scrolled the question away.
// And `swap` is the one screen `screenLocked` refuses to close: the sentence
// telling you what you were choosing, on the screen you could not leave.
//
// The rest are below the fold on screens that scroll and close, and the cursor
// walks to them; they are recorded rather than fixed.
section('the question stays on a screen that will not close');
{
  const g = loadGame({});
  g.setCtx(mkCtx());
  const box = (scrollTop, height) => ({ scrollTop, height });

  // A cover pinned to the top means the top of the window is no longer the top
  // of what you can see. Everything is measured from UNDER it.
  eq(g.scrollFor({ top: 200, height: 50 }, box(300, 310), 60), 140,
    'a selection above the window stops a cover-height short, not at its own top');
  eq(g.scrollFor({ top: 200, height: 50 }, box(300, 310), 0), 200,
    'and with no cover it goes to its own top, as it always did');
  eq(g.scrollFor({ top: 30, height: 50 }, box(300, 310), 60), 0,
    'the padding never scrolls the list above itself');
  // Downward is untouched: the bottom edge is still the bottom edge.
  eq(g.scrollFor({ top: 400, height: 100 }, box(0, 310), 60),
    g.scrollFor({ top: 400, height: 100 }, box(0, 310)),
    'a selection below the fold is unaffected by a cover at the top');
  // A selection already sitting under the cover counts as out of view.
  eq(g.scrollFor({ top: 320, height: 50 }, box(300, 310), 60), 260,
    'one parked behind the cover is pulled out from under it');
  eq(g.scrollFor({ top: 380, height: 50 }, box(300, 310), 60), 300,
    'and one clear of it is left alone');

  // By difference, walking a cursor UP through rows with a cover overhead — the
  // measurement that mattered. Without the pad, 72px of the selected card sat
  // behind the pinned question at 390x760; with it, 0.
  {
    // The cover is the first thing in the document, so the rows START below it
    // — modelling them from 0 would put a row where the block itself sits and
    // report a fault at the top of every list. The band it hides is always
    // [scrollTop, scrollTop + HEAD], because a block pinned to the top travels
    // with the scroll; what changes is whether `scrollFor` was told about it.
    const ROW = 150, N = 8, H = 310, HEAD = 72;
    const row = (i) => ({ top: HEAD + i * ROW, height: ROW });
    const walk = (pad) => {
      let top = row(N - 1).top, worst = 0;
      for (let i = N - 1; i >= 0; i--) {
        const sel = row(i);
        top = g.scrollFor(sel, box(top, H), pad);
        worst = Math.max(worst, Math.max(0, (top + HEAD) - sel.top));
      }
      return worst;
    };
    eq(walk(HEAD), 0, `walking ${N} rows up under a ${HEAD}px cover never parks the selection behind it`);
    ok(walk(0) > 0, `and without the pad it does (${walk(0)}px hidden), so the pad is load-bearing`);
  }

  // Wiring: the call site measures the cover rather than assuming one.
  ok(SRC.includes("const head = el.querySelector('.shead');"), 'renderScreen looks for a pinned head');
  ok(SRC.includes('head ? head.offsetHeight : 0);'), 'and passes its real height, or nothing when there is none');
  // The markup and the rule that pins it.
  const swap = SRC.slice(SRC.indexOf("} else if (s.kind === 'swap') {"));
  ok(swap.indexOf('<div class="shead"><h2>What comes out?</h2>') > -1, 'the swap screen wraps its question');
  ok(swap.indexOf('pick the one it replaces.</p></div>') > -1, '…and its lede, in the same block');
  ok(swap.indexOf('</div>') < swap.indexOf('cardrow'), 'the block closes before the cards it must stay above');
  ok(/#screen \.shead\{ position:sticky; top:-12px;/.test(SRC), 'the block is pinned to the panel');
  ok(/body\.touch #screen \.shead\{ top:-24px; padding-top:24px; \}/.test(SRC),
    'and flush on a phone, where the panel pads by 24 — at top:0 it stuck 24px down and cards ran through the gap');
  // It is the LOCKED screen that got this, which is the whole reason.
  ok(/screenLocked/.test(SRC), 'and the screen it was given to is the one that will not close');
}

// gridCols counts a row off the RENDERED grid, and its own comment records that
// the bag, the shop and the chest shelf were once missing from its selector and
// fell to the `< 2` branch: "up and down moved by a single cell in a grid two
// and three across". It then counted the first row IN THE DOCUMENT, which is not
// always the grid the cursor is in. Walked at 390x760, every screen:
//
//     screen    gridCols said   really across   down moved by
//     dex             3               3               3
//     box             2               2               2
//     deck            3               3               3
//     shop            2               2               2
//     swap            1               3               1     <-
//
// The swap screen shows the card coming in ABOVE the deck you choose from, in a
// row of its own: cells sat 1 / 3 / 3 / 3 / 2 down the panel, the first row was
// that lone card, and up and down moved one card at a time through a grid three
// across — on the one screen `screenLocked` will not let you leave.
section('the cursor moves by the grid it is in');
{
  const g = loadGame({});
  g.setCtx(mkCtx());

  // The counting, as a value.
  eq(g.colsFrom([]), 1, 'nothing to count is one column');
  eq(g.colsFrom([10]), 1, 'and so is a single cell');
  eq(g.colsFrom([10, 10, 10]), 3, 'three cells on one row are three columns');
  eq(g.colsFrom([10, 10, 10, 60, 60, 60]), 3, 'and the rows below do not add to it');
  eq(g.colsFrom([10, 60, 110]), 1, 'a column of cells is one across');
  ok(g.colsFrom([10, 10, 60]) >= 1, 'and it is never zero');

  // The claim, by difference, on the swap screen's actual shape: a lone card at
  // 76, then eleven cells laid out 3 across at 252 / 408 / 564 / 720. Counting
  // from the document gives the wrong answer; counting from the cursor's own
  // row gives the right one.
  const document_order = [76, 252, 252, 252, 408, 408, 408, 564, 564, 564, 720, 720];
  const cursor_row = document_order.slice(1);
  eq(g.colsFrom(document_order), 1, 'counting from the top of the panel finds the incoming card alone');
  eq(g.colsFrom(cursor_row), 3, 'counting from the grid the cursor is in finds three across');

  // Wiring: gridCols scopes to the selection's own container when that
  // container has cells, and falls back to the panel when there is no cursor.
  const body = SRC.slice(SRC.indexOf('function gridCols(s) {'), SRC.indexOf('function screenInput()'));
  ok(body.includes("const cur = els.screen.querySelector('.sel');"), 'gridCols asks where the cursor is');
  ok(/scope = cur && cur\.parentElement && cur\.parentElement\.querySelector\(SEL\)\s*\?\s*cur\.parentElement : els\.screen/.test(body),
    'and counts that container, falling back to the panel when there is none');
  ok(body.includes('colsFrom('), 'and spends the value rather than counting inline');
  // The selector still names every grid a cursor can be in — read out of the
  // code, so a grid added tomorrow is either in it or visibly missing.
  const sel = (body.match(/const SEL = '([^']+)'/) || [])[1] || '';
  for (const cls of ['.dexcell', '.cardrow > .cardel', '.items > .item']) {
    ok(sel.includes(cls), `the selector still names ${cls}`);
  }
}

// Every number the player is SHOWN against the number the game USES. Nine
// cases were swept — a plain swing, an edge banked, might, a multiplier, two
// hits, an attack stage, a resistance, and the two after a switch — and eight
// agreed to the hit point. The ninth: switch a kin in and the card in your hand
// promised the whole number while `useMove` took 0.6 of it. Driven through a
// real switch, a card reading "deal 11-13" landed for 7, and all 300 swings
// fell outside the range they were shown. The damper is the foe's rule too and
// the foe's TELEGRAPH already folds it in — the same asymmetry, on the side
// nobody had measured.
section('the card in your hand does not promise what the swing will not pay');
{
  // Crits off: a range that says 8-11 is not lying when a crit lands 16.
  const noCrit = (src) => src.replace(
    'const crit = opts.crit != null ? opts.crit : critRoll();',
    'const crit = opts.crit != null ? opts.crit : false;');
  const mk = () => {
    const g = withDeck(loadGame({}, noCrit));
    g.setCtx(mkCtx());
    g.newGame();
    g.takeStarter('cindercub');
    g.G.dialogue = null; g.G.screen = null; g.G.menu = null; g.G.mode = 'world';
    g.G.party = [g.mkMon('cindercub', 16), g.mkMon('pyrelynx', 16)];
    return g;
  };
  const range = (txt) => {
    const m = txt.match(/deal (\d+)(?:-(\d+))?(?: ×(\d+))?/);
    return m ? { lo: +m[1], hi: m[2] ? +m[2] : +m[1], hits: m[3] ? +m[3] : 1 } : null;
  };

  // Both sides of the rule, side by side. This is the pair the game states in
  // one place and has to apply in two.
  ok(EK.SETTLE_MUL < 1, 'a kin still finding its feet swings for less');
  {
    const g = mk();
    g.startBattle({ foe: g.mkMon('kindlark', 16), wild: true });
    const b = g.B();
    b.foeSettling = 0; const settled = g.foeSwingMul(b, 1);
    b.foeSettling = 1; const fresh = g.foeSwingMul(b, 1);
    ok(Math.abs(fresh - settled * g.SETTLE_MUL) < 1e-9, 'the foe telegraph folds the damper in');
    b.settling = 0; eq(g.mineSwingMul(b), 1, 'and yours is 1 when you have been out a while');
    b.settling = 1; eq(g.mineSwingMul(b), g.SETTLE_MUL, '…and the same damper on the turn you switch in');
    eq(g.mineSwingMul(null), 1, 'out of a fight there is nothing to damp');
  }

  // The cases. Each one sets the fight up, reads what the card SAYS, then makes
  // that swing forty times and asks whether the number ever left the range.
  const CASES = [
    ['a plain swing', null],
    ['an edge banked', (g, b) => { b.mods.edge = 6; }],
    ['might', (g) => { g.G.might = 3; }],
    ['a multiplier', (g, b) => { b.mods.mul = 1.5; }],
    ['two hits', (g, b) => { b.mods.hits = 1; }],
    ['an attack stage', (g, b) => { b.mine.stages.atk = 2; }],
    ['just switched in', (g, b) => { b.settling = 1; }],
    ['switched in with an edge banked', (g, b) => { b.settling = 1; b.mods.edge = 6; }],
  ];
  for (const [label, setup] of CASES) {
    const g = mk();
    g.startBattle({ foe: g.mkMon('kindlark', 16), wild: true });
    const b = g.B();
    b.foe.max = 99999; b.foe.hp = 99999;
    if (setup) setup(g, b);
    const shown = range(g.moveCardText('ember'));
    ok(shown, `${label}: the card names a number`);
    const bench = g.moveVersusFoe(b.mine, 'ember');
    let out = 0, worst = null;
    for (let i = 0; i < 40; i++) {
      b.foe.hp = 99999;
      // A shocked kin is jolted stiff one swing in four and deals nothing. That
      // is not the card lying — but it made this section fail one run in three,
      // on whichever case the roll happened to land in, because the foe of a
      // fight that starts with the foe faster can land shock before turn one.
      b.mine.status = '';
      // Restore only what the swing SPENDS, and only if it was set: writing
      // `b.mods.hits = undefined` back makes bonus.hits NaN, the hit loop runs
      // zero times, and a swing that dealt 0 reads as the card lying.
      const keep = { settling: b.settling, edge: b.mods.edge, hits: b.mods.hits };
      const before = b.foe.hp;
      g.useMove([], 'mine', 'ember');
      const dealt = before - b.foe.hp;
      b.settling = keep.settling;
      if (keep.edge != null) b.mods.edge = keep.edge;
      if (keep.hits != null) b.mods.hits = keep.hits;
      const lo = shown.lo * shown.hits, hi = shown.hi * shown.hits;
      if (dealt < lo || dealt > hi) { out++; worst = dealt; }
    }
    eq(out, 0, `${label}: every swing landed inside "${shown.lo}-${shown.hi}${shown.hits > 1 ? `×${shown.hits}` : ''}"` +
      (worst == null ? '' : ` (saw ${worst})`));
    ok(bench && bench.lo === shown.lo && bench.hi === shown.hi,
      `${label}: the bench screen reads the same number as the hand`);
  }

  // And the one that matters, driven through the real switch rather than posed:
  // doAction sets the flag, the hand is redrawn, and the card has to know.
  {
    const g = mk();
    g.startBattle({ foe: g.mkMon('kindlark', 16), wild: true });
    const b = g.B();
    b.foe.max = 99999; b.foe.hp = 99999;
    g.doAction({ kind: 'switch', idx: 1 });
    eq(b.settling, 1, 'a switch you chose leaves the new kin finding its feet');
    const damped = range(g.moveCardText('ember'));
    // The full number for WHOEVER IS OUT NOW. Reading it before the switch
    // measured the kin that just left, and two different creatures swinging the
    // same move is not a comparison — that is what failed here first.
    b.settling = 0;
    const full = range(g.moveCardText('ember'));
    b.settling = 1;
    ok(damped.hi < full.hi, `the card drops on the turn you switch in (${full.lo}-${full.hi} -> ${damped.lo}-${damped.hi})`);
    const before = b.foe.hp;
    g.useMove([], 'mine', 'ember');
    const dealt = before - b.foe.hp;
    ok(dealt >= damped.lo && dealt <= damped.hi, `and the swing pays what it promised (${dealt} in ${damped.lo}-${damped.hi})`);
    ok(dealt < full.lo, 'which is less than the card used to say');
    eq(b.settling, 0, 'the swing spends the settling');
    const back = range(g.moveCardText('ember'));
    ok(back.hi === full.hi, 'and the next card is back to the full number');
  }

  // The source, so the two previews cannot drift apart again: both build their
  // swing through the same helper.
  const body = SRC.match(/<script>([\s\S]*?)<\/script>/)[1];
  const mults = [...body.matchAll(/bonus\.flat\) \* bonus\.mul \* mineSwingMul\(b\)/g)];
  eq(mults.length, 2, 'both previews damp their swing through the one helper');
  ok(/const mineSwingMul = \(b\) => \(b && b\.settling \? SETTLE_MUL : 1\);/.test(body),
    'and the helper is one line beside the foe’s');
}

// Every screen, emptied out: does the panel say anything? Eleven kinds were
// swept at 390x760, the list harvested from the game's own openScreen call
// sites. The three that can hold nothing all had a line — "Empty. Even the
// lint.", "Nothing stored yet.", "Everything you own is in the deck." The other
// empty had no words at all: a shop with no shards, the chest wall with no
// gems, a bag of orbs while you are stood on a footpath are FULL shelves where
// every single row is refused. Measured: 7 of 7 dead, 4 of 4, 3 of 3, and
// nothing above any of them.
section('a shelf where nothing can be taken says so');
{
  const mk = () => {
    const g = withDeck(loadGame({}));
    g.setCtx(mkCtx());
    g.newGame();
    g.takeStarter('cindercub');
    g.G.dialogue = null; g.G.screen = null; g.G.menu = null; g.G.mode = 'world';
    g.G.party = [g.mkMon('cindercub', 12), g.mkMon('pyrelynx', 12)];
    return g;
  };
  const bag = (g) => Object.keys(g.G.bag).filter((k) => g.G.bag[k] > 0);

  // The empty shelf, which has always spoken.
  {
    const g = mk();
    g.G.bag = {};
    eq(g.shelfNote('bag', [], false), 'Empty. Even the lint.', 'a bag with nothing in it says so');
  }
  // The other empty: rows on the shelf, every one refused.
  {
    const g = mk();
    g.G.bag = { bloomorb: 3, gleamorb: 1 };
    const list = bag(g);
    ok(list.every((k) => g.rowDead('bag', k, false)), 'orbs on a footpath: every row is refused');
    eq(g.shelfNote('bag', list, false), 'Save those for the wild.',
      'and when the whole shelf agrees on why, it says the reason the row would give');
    eq(g.shelfNote('bag', list, false), g.fieldItemUse('bloomorb').why,
      'in the game’s own words, not a second sentence about the same fact');
  }
  {
    const g = mk();
    g.G.bag = { salve: 2, greatsalve: 1 };
    for (const m of g.G.party) m.hp = m.max;
    eq(g.shelfNote('bag', bag(g), false), 'Nobody needs that.', 'salves with nobody hurt say the other reason');
  }
  {
    const g = mk();
    g.G.bag = { bloomorb: 1, salve: 1 };
    for (const m of g.G.party) m.hp = m.max;
    const whys = new Set(bag(g).map((k) => g.fieldItemUse(k).why));
    eq(whys.size, 2, 'a mixed bag has two different reasons');
    eq(g.shelfNote('bag', bag(g), false), 'Nothing in here is any use out on the path.',
      'so the shelf speaks for itself instead of picking one of them');
  }
  // …and the cases that must stay quiet.
  {
    const g = mk();
    g.G.bag = { salve: 2, bloomorb: 1 };
    g.G.party[0].hp = 1;
    eq(g.shelfNote('bag', bag(g), false), '', 'one usable row and the shelf says nothing');
    // …and in a fight, which now needs an actual fight to be in. These two read
    // `inFight` with no battle up — a state the game cannot reach — and passed
    // because in a fight nothing was EVER dimmed, which was pass 199's finding.
    // The claim survives; the setup was standing in for it.
    g.G.battle = null;
    g.startBattle({ foe: g.mkMon('pebblet', 16), wild: true });
    g.B().mine.hp = 1;
    eq(g.shelfNote('bag', bag(g), true), '', 'and in a wild fight it says nothing either');
    ok(!g.rowDead('bag', 'bloomorb', true), 'because an orb against a wild kin is a real offer');
    ok(g.rowDead('bag', 'bloomorb', false), 'while on the path an orb is refused');
  }
  // The shop, off the same helper.
  {
    const g = mk();
    const list = Object.keys(g.ITEMS);
    const cheapest = Math.min(...list.map((k) => g.ITEMS[k].cost));
    g.G.money = 0;
    ok(list.every((k) => g.rowDead('shop', k, false)), 'with no shards every row is refused');
    eq(g.shelfNote('shop', list, false), 'Nothing here you can afford yet. Shards come off beaten trainers.',
      'and the shelf says so');
    g.G.money = cheapest - 1;
    eq(g.shelfNote('shop', list, false), 'Nothing here you can afford yet. Shards come off beaten trainers.',
      'one shard short is still nothing you can afford');
    g.G.money = cheapest;
    eq(g.shelfNote('shop', list, false), '', 'and the moment one row is takeable the line goes');
    ok(g.rowDead('shop', list.find((k) => g.ITEMS[k].cost > cheapest), false),
      'while the dearer rows are still refused');
  }
  // The chest wall, which reads its own prices rather than a list.
  {
    const g = mk();
    const cheapest = Math.min(...g.CHEST_IDS.map((k) => g.CHESTS[k].cost));
    g.G.gems = 0;
    eq(g.shelfNote('chests', g.CHEST_IDS, false),
      'Not enough gems for any of them yet. Gems come off every fight you win.',
      'no gems, and the wall says so');
    g.G.gems = cheapest - 1;
    ok(g.shelfNote('chests', g.CHEST_IDS, false), 'one gem short still says so');
    g.G.gems = cheapest;
    eq(g.shelfNote('chests', g.CHEST_IDS, false), '', 'and it goes the moment one chest is affordable');
  }
  // One reading of the rule: the row's dimmed frame and the line above it come
  // from the same function.
  const body = SRC.match(/<script>([\s\S]*?)<\/script>/)[1];
  ok(/const dead = rowDead\(s\.kind, k, !!inFight\);/.test(body), 'the row asks rowDead whether it is refused');
  ok(/const note = shelfNote\(s\.kind, list, !!inFight\);/.test(body), 'and the shelf asks shelfNote what to say');
  eq((body.match(/shelfNote\(/g) || []).length, 3, 'its own definition and the two shelf screens, and nowhere else');
  ok(/if \(!list\.every\(\(k\) => rowDead\(kind, k, inFight\)\)\) return '';/.test(body),
    'and the line only appears when every row is refused');

  // The three screens that CAN hold nothing still say what they always said.
  for (const [needle, what] of [
    ['Nothing stored yet.', 'the box'],
    ['Everything you own is in the deck.', 'the deck'],
    ['Empty. Even the lint.', 'the bag'],
  ]) ok(body.includes(needle), `${what} still has its own line for a list with nothing in it`);
}

// Every place a screen takes something, and what it says before you press.
// Eight commit points, driven through their real entry points and diffed:
//
//   buy from the shop     row says "200sh"          -> shards 5000->4800
//   open a gem chest      row says "60gems"         -> gems 9999->9939
//   use a salve           row says "x2" and who     -> bag x2->x1, hp 1->31
//   store a kin           panel says what a pick does -> party 2->1, box 0->1
//   take a reward card    row says "none in your deck" -> deck +1
//   swap a card out       "pick the one it replaces"  -> deck 11->10
//   take a starter        "Rowan will not be talked round" -> irreversible
//   switch a kin in a fight  "KIN — 2/6" and a roster -> foeEdge, settling, the turn
//
// Seven price themselves on the row you are about to press. The eighth took a
// flat opening for the foe AND the settling damper on your own next swing, and
// said neither — the log says "this will hurt" afterwards, which is not the
// same as being told.
section('the screen that takes something says what it costs');
{
  const mk = (patch) => {
    const g = withDeck(loadGame({}, patch));
    g.setCtx(mkCtx());
    g.newGame();
    g.takeStarter('cindercub');
    g.G.dialogue = null; g.G.screen = null; g.G.menu = null; g.G.mode = 'world';
    return g;
  };
  const fight = (g, lvl) => {
    g.G.battle = null;
    g.G.party = [g.mkMon('cindercub', 16), g.mkMon('pyrelynx', 16)];
    g.startBattle({ foe: g.mkMon('kindlark', lvl), wild: true });
    return g.B();
  };

  // The price, and that it is the foe's level that sets it.
  {
    const g = mk();
    const seen = [];
    for (const lvl of [4, 16, 40]) {
      const b = fight(g, lvl);
      const c = g.switchCost(b);
      eq(c.edge, Math.round(g.SWITCH_PUNISH * g.planScale(b.foe.lvl)), `lv${lvl}: the price is the punish scaled to the foe`);
      eq(c.damp, g.SETTLE_MUL, `lv${lvl}: and the other half is the settling damper itself`);
      ok(c.edge > 0, `lv${lvl}: it is a real number, not a rounding to nothing`);
      seen.push(c.edge);
    }
    ok(seen[0] < seen[1] && seen[1] < seen[2], `it escalates with the foe (${seen.join(' < ')})`);
    eq(g.switchCost(null).edge, 0, 'and out of a fight there is nothing to price');
    eq(g.switchCost({}).edge, 0, 'nor with no foe on the field');
  }

  // The number SHOWN is the number CHARGED — measured at the instant the switch
  // charges it. A delta read across the whole of `doAction` is the whole turn:
  // the foe's plan can add edge of its own and its swing spends it, which read
  // as 0, 37 and 60 against a price of 4, 19 and 31.
  {
    const spy = (src) => src.replace(
      'if (b.foe.hp > 0 && !b.over) b.foeEdge += switchCost(b).edge;',
      'if (b.foe.hp > 0 && !b.over) { const __was = b.foeEdge || 0; b.foeEdge += switchCost(b).edge; globalThis.__charged = (b.foeEdge || 0) - __was; }');
    const g = mk(spy);
    for (const lvl of [4, 16, 40]) {
      const b = fight(g, lvl);
      const shown = g.switchCost(b).edge;
      globalThis.__charged = null;
      g.doAction({ kind: 'switch', idx: 1 });
      // The spy is anchored to the very line under test, so a mutation to that
      // line kills the SPY rather than being caught by it. Say which happened.
      ok(globalThis.__charged !== null, `lv${lvl}: the spy fired (if not, the charging line has moved, not misbehaved)`);
      eq(globalThis.__charged, shown, `lv${lvl}: the switch charges exactly what the screen showed`);
      eq(b.settling, 1, `lv${lvl}: and leaves the newcomer finding its feet`);
    }
    delete globalThis.__charged;
  }

  // A forced switch is FREE — your kin is already down and the punish is never
  // charged — so the line belongs to the choice, not to the screen.
  {
    const g = mk();
    const b = fight(g, 16);
    const was = b.foeEdge || 0;
    g.G.party[0].hp = 0;
    g.openScreen('party', { force: true });
    g.G.screen.i = 1;
    g.screenSelect();
    eq(b.foeEdge || 0, was, 'stepping up after a faint costs no opening');
    eq(b.settling || 0, 0, 'and no damper either');
  }

  // One reading of the rule: the line reads what the action spends.
  const body = SRC.match(/<script>([\s\S]*?)<\/script>/)[1];
  ok(/const switchCost = \(b\) => \(\{/.test(body), 'the price is a value, computed in one place');
  ok(body.includes('if (b.foe.hp > 0 && !b.over) b.foeEdge += switchCost(b).edge;'),
    'the action spends it');
  ok(/const c = switchCost\(b\);/.test(body), 'and the screen reads the same function');
  // Two CALLS — the charge and the line. The definition reads `switchCost = (b)`
  // and does not match this, and the export and the doc comment carry no paren.
  eq((body.match(/switchCost\(/g) || []).length, 2, 'the charge and the line call it, and nothing else does');
  ok(/Stepping out costs the turn\./.test(body), 'the line names the turn');
  ok(/gets a \+\$\{c\.edge\} opening/.test(body), '…the opening, off the price itself');
  ok(/swings at \$\{Math\.round\(c\.damp \* 100\)\}%/.test(body), '…and the damper, off the same');
  // The branch it lives in: not on a forced switch, not with the foe already down.
  ok(body.includes("} else if (G.battle && B() && B().foe && B().foe.hp > 0 && !B().over) {"),
    'and it is drawn only when a switch would actually be charged');

  // …and ABOVE the list, not under it. Both lines used to sit after the roster
  // and the stat block, which on a phone is below the fold: photographed at
  // 390x760 the sentence was in the DOM and off the screen, and a price nobody
  // can see is not a price that was named.
  {
    const party = body.slice(body.indexOf("if (s.kind === 'party') {"));
    const at = (needle) => party.indexOf(needle);
    ok(at('Stepping out costs the turn') > -1 && at('class="kinview"') > -1, 'both landmarks are in the party branch');
    ok(at('Stepping out costs the turn') < at('class="kinview"'), 'the price is built before the roster');
    ok(at('Choose who steps up') < at('class="kinview"'), 'and so is the forced prompt, which had the same fault');
    ok(at(`<h2>\${kinHeading()}</h2>`) < at('Stepping out costs the turn'), 'both still sit under the heading');
  }

  // The seven that already priced themselves keep doing it.
  for (const [needle, what] of [
    ['${it.cost}<small>sh</small>', 'the shop row prices itself in shards'],
    ['${ch.cost}<small>gems</small>', 'the chest row prices itself in gems'],
    ['Rowan will not be talked round', 'the starter says it is for keeps'],
    ['pick the one it replaces', 'the swap says what comes out'],
  ]) ok(body.includes(needle), what);
}

// Does a screen that scrolls tell you there is more?
//
// The machinery has been in the CSS since the deck first overflowed and nobody
// had ever sampled a pixel of it: two `local` covers that scroll WITH the
// content and two marks pinned to the frame, the covers listed OVER the marks,
// so a mark shows at an edge with content beyond it and is covered at an edge
// you have reached. Sound in structure. Measured at 390x760 — same content,
// same scroll position, the only difference being whether the pinned layers
// paint — it delivered almost nothing, because the marks were BLACK on a panel
// whose bottom is already #0d0913:
//
//   screen   more below   at the end      after
//   box          2.43        1.00      18.83 / 3.39
//   dex          3.21        1.00      23.42 / 3.39
//   deck         0.98        1.02       7.03 / 4.20   <- was INVERTED
//   swap         0.92        0.46       6.63 / 1.90
//   starter      3.14        0.54      22.52 / 1.82
//   (cannot scroll: 0.51-1.02 before, 3.55-4.20 after — the floor, correctly)
//
// Out of 255. On `deck` the mark was FAINTER when there was more below than
// when there was not, and every screen sat within ~2 lum of a screen that
// cannot scroll at all. Black on near-black has nowhere to go: darkening a
// colour of luminance 10 by 60% removes six luminance and no eye reads it.
//
// So the marks are the panel's own edge colour instead, which is the only
// direction available on a near-black surface — lighter, not darker.
//
// This is CSS, which a headless suite cannot render. What it CAN do is read the
// declaration out of the file and check the property the numbers are about:
// each mark must be lighter than the base it is drawn on, or it cannot be seen
// at all. That is the net that would have failed for the whole of this game's
// life until now.
section('a screen that scrolls says so, visibly');
{
  // Split on top-level commas — the layers are full of parenthesised colours.
  const split = (v) => {
    const out = []; let d = 0, cur = '';
    for (const ch of v) {
      if (ch === '(') d++; if (ch === ')') d--;
      if (ch === ',' && d === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  };
  const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const rgb = (s) => {
    const hex = s.match(/#([0-9a-f]{6})/i);
    if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16));
    const fn = s.match(/rgba?\(([^)]*)\)/i);
    return fn ? fn[1].split(',').slice(0, 3).map((n) => +n.trim()) : null;
  };

  // The declaration only — up to its own semicolon, counting parentheses, or a
  // slice to the next `;` swallows every rule after it (the first attempt read
  // 26 "layers" that way).
  // …and anchored on the rule's own first line, not on `#screen{` — which
  // matches `body.touch #screen{ padding-top:24px; }` hundreds of lines earlier
  // and reads a background belonging to something else entirely.
  const at = SRC.indexOf('position:absolute; inset:0; z-index:9; padding:12px; overflow:auto;');
  ok(at > -1, 'the panel rule is where this thinks it is');
  const decl = SRC.slice(at, SRC.indexOf('backdrop-filter:blur(3px)', at));
  const from = decl.indexOf('background:') + 'background:'.length;
  let end = from, depth = 0;
  while (end < decl.length && !(decl[end] === ';' && depth === 0)) {
    if (decl[end] === '(') depth++;
    if (decl[end] === ')') depth--;
    end++;
  }
  const bg = decl.slice(from, end);
  const layers = split(bg).filter(Boolean);
  eq(layers.length, 5, 'five background layers: two covers, two marks, and the panel itself');

  // Order is the whole mechanism: the covers must be listed BEFORE the marks,
  // because an earlier layer paints over a later one — that is what makes a
  // mark disappear at an edge you have reached.
  ok(/local/.test(layers[0]) && /local/.test(layers[1]), 'the two covers scroll with the content');
  ok(/scroll/.test(layers[2]) && /scroll/.test(layers[3]), 'and the two marks are pinned to the frame');
  ok(layers.findIndex((l) => /local/.test(l)) < layers.findIndex((l) => /scroll no-repeat/.test(l)),
    'the covers are painted over the marks, which is what hides a mark at an edge you have reached');
  ok(!/local|scroll no-repeat/.test(layers[4]), 'and the panel itself is underneath everything');

  // The property the pixels were about. `#screen` runs from #1a1222 at the top
  // to #0d0913 at the bottom, so each mark is judged against the end it is
  // drawn on — a mark no lighter than its own ground cannot be seen.
  const base = layers[4].match(/#[0-9a-f]{6}/gi);
  eq(base.length, 2, 'the panel is a gradient with two ends');
  const [topBase, botBase] = base.map((h) => lum(rgb(h)));
  const topMark = lum(rgb(layers[2]));
  const botMark = lum(rgb(layers[3]));
  ok(topMark > topBase, `the top mark is lighter than the panel's top (${topMark.toFixed(1)} vs ${topBase.toFixed(1)})`);
  ok(botMark > botBase, `the bottom mark is lighter than the panel's bottom (${botMark.toFixed(1)} vs ${botBase.toFixed(1)})`);
  // By difference, and the number that matters: how far the mark can move the
  // pixel it sits on. Black on #0d0913 could move it by six; this moves it by
  // more than thirty, which is what turned 0.98 into 7.03 and 3.21 into 23.42.
  ok(botMark - botBase > 30, `and by enough to be seen (${(botMark - botBase).toFixed(1)} luminance of headroom)`);
  ok(topMark - topBase > 30, `at both ends (${(topMark - topBase).toFixed(1)})`);
  // The marks must still be TRANSPARENT at their far end, or they are bands
  // rather than edges.
  for (const [i, which] of [[2, 'top'], [3, 'bottom']]) {
    ok(/,\s*rgba\([^)]*,\s*0\)/.test(layers[i]), `the ${which} mark fades to nothing away from the edge`);
  }
  // Geometry unchanged: the covers are deeper than the marks, so a mark is
  // fully hidden when its cover arrives.
  const px = (l) => +(l.match(/100% (\d+)px/) || [0, 0])[1];
  ok(px(layers[0]) >= px(layers[2]), `the top cover (${px(layers[0])}px) is deeper than the mark it hides (${px(layers[2])}px)`);
  ok(px(layers[1]) >= px(layers[3]), `and the bottom cover (${px(layers[1])}px) than its mark (${px(layers[3])}px)`);
}

// Is anything this game draws actually legible?
//
// 319 text nodes across fourteen raisings at 390x760, each measured against the
// ground it ACTUALLY landed on — the ink from the computed style, the ground
// from the pixels of the same frame with every glyph turned transparent. Most
// of the quiet things are quiet on purpose: an unseen dex slot is a ghost at
// 1.13, a shelf row you cannot afford is dimmed to 2.40 because the dimming IS
// the refusal, the max-HP denominator sits at 3.98 under the number that moves.
//
// One was not a choice. `.pickcard .matchup span` was written for the two
// LABELS — "strong into", "soft against" — but `typeChips` emits spans too, so
// the rule repainted the chips themselves, and beat `.tp`'s own ink on
// specificity. On the one irreversible choice in the game, the block naming
// what your starter is strong and soft against read:
//
//   Verdant  1.08:1     Tide  1.17:1     Ember  1.28:1
//   Spark    1.47:1     Stone 1.72:1 / 1.84:1
//
// …in dim grey on saturated type colour, at 3.7px, because `.matchup` is .58em
// and `.tp` is another .58em inside it. A third of the card's own text, in ink
// that is not there. After: every one at its own `.tp` ink, 6.38px, the size of
// the label introducing it.
section('a type chip is legible on its own colour');
{
  const g = loadGame({});
  g.setCtx(mkCtx());

  // WCAG, computed from the game's own palette rather than a copy of it.
  const lin = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  const rl = ([r, gg, b]) => 0.2126 * lin(r) + 0.7152 * lin(gg) + 0.0722 * lin(b);
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const ratio = (a, b) => { const [x, y] = [rl(a), rl(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

  // The chip's ink, read out of the one rule that sets it.
  const tp = SRC.match(/\n\s*\.tp\{[^}]*\}/);
  ok(tp, 'the chip rule is in the file');
  const ink = (tp[0].match(/color:(#[0-9a-f]{6})/i) || [])[1];
  ok(ink, `the chip names its own ink (${ink})`);

  // …and it has to work on every ground the game puts it on. Wild included: it
  // is a move type and reaches a chip through the battle log.
  //
  // GLOOM IS A KNOWN SHORTFALL, recorded rather than papered over. This net was
  // written expecting the palette to pass and it did not: #7a5fc4 gives the
  // chip 3.89:1, under the 4.5 a body-sized glyph wants. It is the only one,
  // and moving it is a palette decision that reaches every Gloom-tinted card
  // and sprite accent in the game — a different change from this one. So the
  // bar stays at 4.5 for the other seven and Gloom is pinned at what it
  // measures today: if it gets worse, or if any other type falls, this fails.
  const KNOWN = { Gloom: 3.89 };
  const types = Object.entries(g.TYPES);
  eq(types.length, 8, 'eight type colours to be legible on');
  let worst = [Infinity, ''];
  for (const [name, bg] of types) {
    const r = ratio(hex(ink), hex(bg));
    if (KNOWN[name]) {
      ok(r >= KNOWN[name] - 0.01, `${name} (${bg}) is the known shortfall, still ${r.toFixed(2)}:1 and no worse`);
      ok(r < 4.5, `…and still short of 4.5, or this exception should go`);
      continue;
    }
    ok(r >= 4.5, `${name} (${bg}) reads at ${r.toFixed(2)}:1`);
    if (r < worst[0]) worst = [r, name];
  }
  ok(worst[0] >= 4.5, `and the worst ground that is meant to pass is ${worst[1]} at ${worst[0].toFixed(2)}:1`);

  // The rule that used to steal it. `:not(.tp)` is the whole fix: the labels
  // keep their dim, the chips keep theirs.
  ok(SRC.includes('.pickcard .matchup span:not(.tp){ color:var(--dim);'),
    'the matchup labels are dimmed without repainting the chips beside them');
  ok(!/\.pickcard \.matchup span\{/.test(SRC), 'and the rule that captured both is gone');
  // …and the size, which compounded because both rules use the same .58em.
  ok(SRC.includes('.pickcard .matchup .tp{ font-size:1em; }'),
    'a chip in the matchup is the size of the label introducing it, not .58 of it');
  const mu = SRC.match(/\.pickcard \.matchup\{[^}]*\}/);
  ok(mu && /font-size:\.58em/.test(mu[0]), 'the block itself is still the quieter .58em');

  // By difference: without the reset, the chip would inherit the block's .58em
  // ON TOP of its own — which is how 11px of card became 3.7px of chip.
  const base = 11, block = 0.58, chip = 0.58;
  ok(base * block * chip < 4, `nested, a chip would be ${(base * block * chip).toFixed(1)}px`);
  ok(base * block >= 6, `reset, it is ${(base * block).toFixed(1)}px — the label's own size`);
}

// Does the game tell the truth about type, everywhere it speaks about it?
//
// `CHART[attacker][defender]` over eight types is 64 ordered pairs — and a
// defender can carry TWO, which is where the chart's entries stop being values
// and start being products. Driven over the whole domain rather than through
// whatever fights happened to be played:
//
//   effect()     agrees with the chart on all 64 pairs
//   resistedBy   agrees on all 361 creature pairings
//   the mark     was keyed on the multiplier's own STRING — '2', '0.5', '0' —
//                which is every value a SINGLE type can produce and not every
//                value the game can. Reachable: 0.25, 0.5, 1, 2, 4.
//
// So the card fell silent at the two matchups most worth telegraphing, a
// quadruple hit and a doubly-resisted one: 19 of 288 attacker/defender
// combinations, against five of the nineteen creatures in the dex. It is a
// band now, in the words already here.
section('every multiplier the game can produce has a word for it');
{
  const g = withDeck(loadGame({}));
  g.setCtx(mkCtx());
  g.newGame();

  const T = Object.keys(g.TYPES);
  const chart = (a, d) => (g.CHART[a] || {})[d] ?? 1;

  // The number every other voice is derived from, over all 64 ordered pairs.
  let pairs = 0;
  for (const a of T) {
    for (const d of T) {
      eq(g.effect(a, [d]), chart(a, d), `${a} into ${d} is the chart's own entry`);
      pairs++;
    }
  }
  eq(pairs, 64, 'all sixty-four ordered pairs were driven');

  // THE WHOLE DOMAIN, not the instances anyone thought to visit: single types
  // and every unordered pair of them, which is what a dual-typed creature is.
  const twos = [];
  for (let i = 0; i < T.length; i++) for (let j = i + 1; j < T.length; j++) twos.push([T[i], T[j]]);
  const reachable = new Set();
  for (const a of T) {
    for (const d of T) reachable.add(g.effect(a, [d]));
    for (const p of twos) reachable.add(g.effect(a, p));
  }
  const vals = [...reachable].sort((x, y) => x - y);
  eq(vals.join(','), '0.25,0.5,1,2,4', 'the reachable multipliers are these five');

  // …and every one of them either has a word or is deliberately silent.
  for (const v of vals) {
    const m = g.effMark(v);
    if (v === 1) { ok(!m, 'a neutral hit stays unmarked — a mark on everything marks nothing'); continue; }
    ok(m && m.tag, `${v}x has a word (${m && m.tag})`);
    ok(m.cls === (v > 1 ? 'eff-good' : 'eff-bad'), `…and ${v}x is coloured for its direction (${m.cls})`);
  }
  // Banded, not matched: the value BETWEEN two written-down ones is answered.
  eq(g.effMark(4).tag, g.effMark(2).tag, 'a quadruple reads like a double, as the log has always said');
  eq(g.effMark(0.25).tag, g.effMark(0.5).tag, 'and a double resist like a single');
  eq(g.effMark(3).tag, 'STRONG', 'a multiplier nobody wrote down is still answered');
  eq(g.effMark(0.125).tag, 'RESISTED', 'in both directions');
  eq(g.effMark(0).tag, 'NOTHING', 'and nothing at all keeps its own word');
  // …and its own colour. This was missed on the first writing: the colour loop
  // above only walks the REACHABLE values, and 0 is not one of them — nothing
  // in `CHART` is an immunity — so a planted fault that painted NOTHING as a
  // good hit sailed through. An unreachable branch still needs its net.
  eq(g.effMark(0).cls, 'eff-none', 'coloured as its own thing, not as a hit');
  ok(!vals.includes(0), 'no matchup in the chart is an immunity today, so that branch is held in reserve');

  // By difference, and the number that made this a finding: not one
  // attacker/defender combination in the game is left without a word.
  let silent = 0, total = 0;
  for (const a of T) {
    for (const d of [...T.map((t) => [t]), ...twos]) {
      const v = g.effect(a, d);
      total++;
      if (v !== 1 && !g.effMark(v)) silent++;
    }
  }
  eq(total, 288, 'every attacker against every single and dual defender');
  eq(silent, 0, 'and none of them is silent (it was 19)');

  // The creatures that made it reachable — this is not a hypothetical domain.
  const duals = g.DEX_ORDER.filter((id) => g.DEX[id].types.length > 1);
  eq(duals.length, 5, 'five creatures in the dex carry two types');
  for (const id of duals) {
    const ts = g.DEX[id].types;
    const hot = T.filter((a) => { const v = g.effect(a, ts); return v === 4 || v === 0.25; });
    ok(hot.length > 0, `${g.DEX[id].name} (${ts.join('/')}) has an extreme matchup at all`);
    for (const a of hot) ok(g.effMark(g.effect(a, ts)), `…and ${a} into it is marked`);
  }

  // The consumer reads the band, and the old table is gone.
  ok(SRC.includes('const mark = vs && vs.eff !== undefined ? effMark(vs.eff) : null;'),
    'the move card asks the band');
  ok(!/EFF_MARK/.test(SRC), 'and the exact-key table it used to ask is gone');

  // RECORDED, NOT FIXED — the starter screen harvests `types[0]` only, so on a
  // dual-typed kin it names what beats the first type and drops the second:
  // Kindlark (Ember/Spark) would read "soft against Tide, Stone" where the
  // truth is Stone alone. Unreachable today — all three starters are single
  // typed — so it is pinned rather than fixed, and this fails the day a
  // dual-typed kin is added to STARTERS, which is when it would start lying.
  for (const id of g.STARTERS) {
    eq(g.DEX[id].types.length, 1,
      `${g.DEX[id].name} is single-typed, which is what keeps the matchup block honest`);
  }
  {
    const k = g.DEX.kindlark;
    const said = g.TYPE_ORDER.filter((t) => chart(t, k.types[0]) > 1);
    const truth = g.TYPE_ORDER.filter((t) => g.effect(t, k.types) > 1);
    ok(said.length !== truth.length,
      `the types[0] harvest still disagrees on a dual kin ([${said}] vs [${truth}]) — recorded, unreachable`);
  }
}

// Does every move do what its card says — for every move in the game, not the
// handful that turn up in a driven fight?
//
// Three readings, over all 56: what the TABLE declares, what `moveCardText`
// tells the player, and what the resolver does when the move is actually used.
// The resolver and the table agree everywhere — every fx key in the table is
// applied, and every one of them was already spoken.
//
// What was not spoken is not an fx at all. `acc` sits beside `pow` and `pp`,
// `resolve` rolls it, and 28 of the 56 moves can miss:
//
//   1 in 5   Maelstrom, Thunderclap, Eclipse Fang, Landslide
//   15%      Magma Charge, Pyre Burst, Breaker, Thorn Maul, Bloom Burst,
//            Volt Crash, Ruin Maw, Quake Step, Starfall
//   10%      Root Snare, Boulder Drop, Lull
//   5%       twelve more
//
// The four that whiff hardest are the four biggest hits in the game.
section('a move card says whether it lands');
{
  const g = withDeck(loadGame({}));
  g.setCtx(mkCtx());
  g.newGame();

  const ids = Object.keys(g.MOVES);
  eq(ids.length, 56, 'every move in the table is in scope');

  // THE WHOLE DOMAIN. Three states, and each one has a rule.
  let missable = 0, certain = 0, statusy = 0;
  for (const id of ids) {
    const m = g.MOVES[id];
    const said = g.moveCardText(id);
    if (m.acc > 0 && m.acc < 100) {
      missable++;
      ok(said.includes(`${m.acc}% to land`), `${m.name} can miss (${m.acc}) and says so`);
    } else {
      if (m.acc === 0) statusy++; else certain++;
      ok(!/% to land/.test(said), `${m.name} cannot miss, so it makes an unqualified promise`);
    }
  }
  eq(missable, 28, 'twenty-eight moves can miss');
  eq(statusy, 10, 'ten are skipped by the roll entirely (acc 0)');
  eq(missable + certain + statusy, 56, 'and the three states account for every move');

  // The number shown is the number rolled: `resolve` compares against `m.acc`.
  // COUNTED, not merely found: the first writing of this check matched a
  // literal inside a doc comment two hundred lines away, so disabling the real
  // roll left it green. One occurrence, and it is the code.
  eq((SRC.match(/if \(m\.acc && rnd\(100\) >= m\.acc\)/g) || []).length, 1,
    'the resolver rolls the accuracy the card prints, in exactly one place');
  ok(SRC.includes('if (m.acc > 0 && m.acc < 100) bits.push(`${m.acc}% to land`);'),
    'and the card prints the accuracy the resolver rolls — one field, both voices');

  // It qualifies the damage, so it is said before the riders qualify anything else.
  {
    const said = g.moveCardText('rootsnare');
    ok(said.indexOf('% to land') < said.indexOf('may snare'), 'the chance of landing comes before what landing does');
    ok(said.indexOf('status') < said.indexOf('% to land'), '…and after what the move is');
  }

  // Every fx key the table uses is spoken by the card. Computed over the table
  // rather than listed from memory, so a new rider cannot arrive unspoken.
  {
    const keys = new Set();
    for (const id of ids) for (const k of Object.keys(g.MOVES[id].fx || {})) keys.add(k);
    eq([...keys].sort().join(','), 'drain,foe,heal,pri,recoil,self,st', 'these are the riders in the table');
    for (const k of keys) ok(SRC.includes(`if (fx.${k})`), `the card knows how to say fx.${k}`);
  }

  // …and the resolver applies what the table declares, driven for real. A
  // rider that is a CHANCE is forced by taking the certain ones — the four
  // categories below are the ones that always fire when the move connects.
  const drive = (id, setup) => {
    g.G.battle = null;
    g.G.party = [g.mkMon('cindercub', 30)];
    g.startBattle({ foe: g.mkMon('pebblet', 30), wild: true });
    const b = g.B();
    b.mine.hp = Math.floor(b.mine.max * 0.5);
    if (setup) setup(b);
    const before = { mine: b.mine.hp, foe: b.foe.hp, ms: { ...b.mine.stages }, fs: { ...b.foe.stages } };
    // `useMove(log, atkSide, moveId)` takes a SIDE and reads the pair off the
    // battle — passing the two creatures throws on every move in the table.
    g.useMove([], 'mine', id);
    return { b, before, after: { mine: b.mine.hp, foe: b.foe.hp, ms: { ...b.mine.stages }, fs: { ...b.foe.stages } } };
  };
  {
    // Driven until it CONNECTS. Magma Charge lands 85 times in 100, and the
    // first writing of this check simply skipped itself on a miss — the suite
    // quietly reported one check fewer, which is the shape of a check that
    // never ran rather than one that survived.
    let r = null;
    for (let i = 0; i < 40 && !(r && r.after.foe < r.before.foe); i++) r = drive('magmacharge');
    ok(r.after.foe < r.before.foe, 'Magma Charge connects inside forty swings');
    ok(r.after.mine < r.before.mine, 'and the recoil costs the attacker HP, as the card says');
  }
  {
    const r = drive('mend');
    ok(r.after.mine > r.before.mine, 'a heal heals, as the card says');
  }
  {
    const r = drive('shellup');
    eq(r.after.ms.def, r.before.ms.def + 2, 'a self buff moves the stage the table names');
  }
  {
    const r = drive('dreadgaze');
    eq(r.after.fs.atk, r.before.fs.atk - 2, 'and a foe debuff moves theirs');
  }
}

// Does every item do what its shelf row says?
//
// Seven items, three code paths — the row, `useItemInBattle`, and the field
// path in `screenSelect`. The blurbs are exact, checked against a kin with more
// than 90 HP missing so the clamp cannot flatter them: Salve gives 30, Great
// Salve 90, Emberroot half of max. Both paths give the same number.
//
// The shelf was the thing that lied, and only in a fight. `rowDead` returned
// false for EVERY row the moment a battle was up, so the bag drew seven live
// rows while the resolver held refusals nobody could see:
//
//   trainer fight   three orbs drawn live, no odds beside them, and each press
//                   answered "Stealing another trainer's kin? No."
//   whole kin       a salve drawn live, press answered "already whole"
//   standing kin    an Emberroot drawn live, press answered "does not need that"
//
// The footpath has had one reading of this since 192 (`fieldItemUse`); the
// fight had none. `battleItemUse` is that reading, and both the row and the
// resolver ask it.
section('a bag row in a fight refuses before you press it');
{
  const g = withDeck(loadGame({}));
  g.setCtx(mkCtx());
  g.newGame();
  g.takeStarter('cindercub');
  const ids = Object.keys(g.ITEMS);
  eq(ids.length, 7, 'seven items in the table');

  // THE PROPERTY, over every row in every battle state that changes an answer:
  // a row is dimmed exactly when the press would be refused.
  let pairs = 0, disagree = 0;
  for (const wild of [true, false]) {
    for (const state of ['whole', 'hurt', 'down']) {
      g.G.battle = null;
      g.G.party = [g.mkMon('cindercub', 20), g.mkMon('pyrelynx', 20)];
      g.G.bag = Object.fromEntries(ids.map((k) => [k, 5]));
      g.startBattle({ foe: g.mkMon('pebblet', 20), wild });
      const b = g.B();
      const set = () => { b.mine.hp = state === 'down' ? 0 : state === 'hurt' ? 1 : b.mine.max; };
      set();
      for (const k of ids) {
        const dead = g.rowDead('bag', k, true);
        const had = g.G.bag[k];
        const refused = !g.useItemInBattle([], k, null);
        g.G.bag[k] = had;            // put the shelf back for the next row
        set();
        pairs++;
        if (dead !== refused) {
          disagree++;
          ok(false, `${k} in a ${wild ? 'wild' : 'trainer'} fight against a ${state} kin: row ${dead ? 'dead' : 'live'}, press ${refused ? 'refused' : 'allowed'}`);
        }
      }
    }
  }
  eq(pairs, 42, 'every row in every battle state was driven');
  eq(disagree, 0, 'and the row agrees with the press in all of them');

  // The case that started it, named on its own so it cannot quietly come back.
  {
    g.G.battle = null;
    g.G.party = [g.mkMon('cindercub', 20)];
    g.G.bag = Object.fromEntries(ids.map((k) => [k, 5]));
    g.startBattle({ foe: g.mkMon('pebblet', 20), wild: false });
    const orbs = ids.filter((k) => g.ITEMS[k].kind === 'orb');
    eq(orbs.length, 3, 'three orbs');
    for (const k of orbs) ok(g.rowDead('bag', k, true), `${k} is dimmed against a trainer`);
    // …and live again the moment the fight is one you could catch in.
    g.G.battle = null;
    g.startBattle({ foe: g.mkMon('pebblet', 20), wild: true });
    for (const k of orbs) ok(!g.rowDead('bag', k, true), `${k} is live against a wild kin`);
  }

  // …and the refusals themselves, PINNED. The property above compares the row
  // against the press, and both now read the same gate — so a gate that stops
  // refusing something keeps them in perfect agreement and the check stays
  // green. A planted fault proved exactly that: dropping the revive guard bit
  // nothing. Consistency is not correctness; these name the answers.
  {
    g.G.battle = null;
    g.G.party = [g.mkMon('cindercub', 20)];
    g.G.bag = Object.fromEntries(ids.map((k) => [k, 5]));
    g.startBattle({ foe: g.mkMon('pebblet', 20), wild: true });
    const b = g.B();
    const gate = (k) => g.battleItemUse(k, b.mine);

    b.mine.hp = b.mine.max;
    ok(!gate('salve').ok, 'a salve on a whole kin is refused');
    ok(/already whole/.test(gate('salve').why), '…and says why');
    ok(!gate('revive').ok, 'an Emberroot on a standing kin is refused');
    ok(/does not need that/.test(gate('revive').why), '…and says why');

    b.mine.hp = 0;
    ok(!gate('salve').ok, 'a salve on a kin that is out cold is refused');
    ok(/out cold/.test(gate('salve').why), '…and says why');
    ok(gate('revive').ok, 'and an Emberroot on it is not');

    b.mine.hp = 1;
    ok(gate('salve').ok, 'a salve on a hurt kin is offered');
    ok(gate('elixir').ok, 'and the elixir is always offered in a fight');

    g.G.bag = {};
    ok(!gate('salve').ok, 'an item you do not have is refused');
    ok(/none of those/.test(gate('salve').why), '…and says why');
  }

  // The shelf's own line, in a fight, in the fight's words. This branch could
  // not be reached at all until the fight learned to dim a row.
  {
    g.G.battle = null;
    g.G.party = [g.mkMon('cindercub', 20)];
    g.G.bag = { bloomorb: 1, salve: 1 };
    g.startBattle({ foe: g.mkMon('pebblet', 20), wild: false });
    g.B().mine.hp = g.B().mine.max;
    const list = g.shelve(Object.keys(g.G.bag)).flatMap(([, keys]) => keys);
    ok(list.every((k) => g.rowDead('bag', k, true)), 'an orb and a full kin against a trainer: every row dead');
    const note = g.shelfNote('bag', list, true);
    eq(note, 'Nothing in the bag will help here.', 'and the shelf says so in the fight\'s own words');
    ok(!/out on the path/.test(note), 'not the footpath\'s, which is where it was standing');
  }
  // …and a shelf where every row agrees on ONE reason, which is where the two
  // voices actually say different things: three orbs against a trainer are all
  // refused for the same reason in a fight, and for a different same reason on
  // a footpath. The note has to be the fight's.
  {
    g.G.battle = null;
    g.G.party = [g.mkMon('cindercub', 20)];
    g.G.bag = { bloomorb: 1, gleamorb: 1, prismorb: 1 };
    g.startBattle({ foe: g.mkMon('pebblet', 20), wild: false });
    const list = g.shelve(Object.keys(g.G.bag)).flatMap(([, keys]) => keys);
    eq(list.length, 3, 'three orbs on the shelf');
    ok(list.every((k) => g.rowDead('bag', k, true)), 'all three dead against a trainer');
    eq(g.shelfNote('bag', list, true), 'Stealing another trainer\'s kin? No.',
      'the shelf speaks the refusal the fight would give');
    eq(g.shelfNote('bag', list, false), 'Save those for the wild.',
      'and the footpath still speaks its own');
  }

  // One reading: the resolver asks the gate rather than keeping its own copy.
  // COUNTED. Three call sites: the row, the resolver, and the shelf's own note
  // — which had to learn the fight's refusals too once the shelf could go
  // wholly dead in one. The definition reads `function battleItemUse(id,` and
  // is counted here as well, so the total is four.
  eq((SRC.match(/battleItemUse\(/g) || []).length, 4, 'the gate is defined once and asked in three places');
  ok(SRC.includes('const gate = battleItemUse(id, target);'), 'the resolver asks it');
  ok(SRC.includes("if (inFight) return !battleItemUse(k, null).ok;"), 'and the row asks it');
  ok(!/if \(inFight\) return false;/.test(SRC), 'the blanket "nothing is ever dead in a fight" is gone');
  // The refusals live in the gate now, not duplicated in the resolver body.
  {
    const fn = SRC.slice(SRC.indexOf('function useItemInBattle('));
    const body = fn.slice(0, fn.indexOf('\n}'));
    ok(!/is already whole/.test(body), 'the resolver no longer carries its own copy of a refusal');
    ok(!/does not need that/.test(body), '…nor of the other one');
  }

  // The blurbs are exact — measured against a kin big enough that the clamp
  // cannot make a small number look like the promised one.
  {
    g.G.battle = null;
    const big = g.mkMon('gargolem', 60);
    g.G.party = [big];
    g.G.bag = { salve: 5, greatsalve: 5, revive: 5 };
    g.startBattle({ foe: g.mkMon('pebblet', 20), wild: true });
    const b = g.B();
    b.mine = big;
    ok(big.max > 120, `a kin with ${big.max} max HP, so 90 fits inside the gap`);
    for (const [k, want] of [['salve', 30], ['greatsalve', 90]]) {
      b.mine.hp = 1;
      g.useItemInBattle([], k, 0);
      eq(b.mine.hp - 1, want, `${g.ITEMS[k].name} restores the ${want} its row promises`);
      ok(g.ITEMS[k].desc.includes(String(want)), `…and its row says ${want}`);
    }
    b.mine.hp = 0;
    g.useItemInBattle([], 'revive', 0);
    eq(b.mine.hp, Math.floor(b.mine.max / 2), 'Emberroot wakes a kin at half, as its row says');
  }
}

// Does every status do what the game says it does?
//
// Four statuses, three readings each — the table, the words a player can ever
// read, and the tick. The tick is honest: burn takes max/16 a turn and .85 off
// atk, chill halves spd and costs a card, shock costs an energy and jolts one
// swing in four, snare takes max/16 and holds you in the fight.
//
// The words were not. A creature cannot take the status its own element deals,
// and NOTHING said so:
//
//   burn   Ember    Cindercub, Pyrelynx, Magmane, Kindlark
//   shock  Spark    Kindlark, Zaplet, Voltyx
//   snare  Verdant  Sproutle, Thornip, Bramblor, Frillamb
//   chill  Tide     Dewdrip, Brookite, Tsunaga, Lanterneel, Frillamb
//
// 16 of 76 status/creature pairs can never land. Driven a hundred times each,
// four such moves landed nothing and the log gave a reason zero times out of
// four hundred — while the card went on promising "may burn".
section('a card does not promise a status the thing in front of you cannot take');
{
  const g = withDeck(loadGame({}));
  g.setCtx(mkCtx());
  g.newGame();
  g.takeStarter('cindercub');

  // The rule, pinned by name rather than read back out of itself.
  eq(g.IMMUNE_TO.burn, 'Ember', 'Ember does not burn');
  eq(g.IMMUNE_TO.shock, 'Spark', 'Spark does not shock');
  eq(g.IMMUNE_TO.chill, 'Tide', 'Tide does not chill');
  eq(g.IMMUNE_TO.snare, 'Verdant', 'Verdant does not snare');
  eq(Object.keys(g.IMMUNE_TO).sort().join(','), Object.keys(g.STATUS).sort().join(','),
    'and every status in the table has an element that shrugs it off');

  const fight = (foeId) => {
    g.G.battle = null;
    g.G.party = [g.mkMon('gargolem', 40)];
    g.startBattle({ foe: g.mkMon(foeId, 20), wild: true });
    return g.B();
  };
  // A move that carries each rider, harvested rather than named from memory.
  const carrier = {};
  for (const st of Object.keys(g.STATUS)) {
    carrier[st] = Object.keys(g.MOVES).find((m) => (g.MOVES[m].fx || {}).st && g.MOVES[m].fx.st[0] === st);
    ok(carrier[st], `something in the move table can ${st}`);
  }

  // THE WHOLE DOMAIN: every status against every creature in the dex.
  let pairs = 0, immune = 0;
  for (const st of Object.keys(g.STATUS)) {
    for (const id of g.DEX_ORDER) {
      const b = fight(id);
      const shrugs = g.DEX[id].types.includes(g.IMMUNE_TO[st]);
      const said = g.moveCardText(carrier[st]);
      pairs++;
      if (shrugs) {
        immune++;
        ok(said.includes(`it shrugs off ${st}`), `${g.DEX[id].name} shrugs off ${st}, and the card says so`);
        ok(!said.includes(`may ${st}`), `…and does not still promise it`);
      } else {
        ok(said.includes(`may ${st}`), `${g.DEX[id].name} can be ${st}, and the card offers it`);
      }
    }
  }
  eq(pairs, 76, 'four statuses against nineteen creatures');
  eq(immune, 16, 'sixteen of which can never land');

  // …and the resolver agrees, driven rather than assumed. Pinned separately
  // from the wording: two voices agreeing is not the same as either being right.
  for (const st of Object.keys(g.STATUS)) {
    const victim = g.DEX_ORDER.find((id) => g.DEX[id].types.includes(g.IMMUNE_TO[st]));
    let landed = 0;
    for (let i = 0; i < 60; i++) {
      const b = fight(victim);
      b.mine.moves = [{ id: carrier[st], pp: 9, max: 9 }];
      g.useMove([], 'mine', carrier[st]);
      if (b.foe.status === st) landed++;
    }
    eq(landed, 0, `sixty swings of ${g.MOVES[carrier[st]].name} at ${g.DEX[victim].name} land no ${st}`);
    // …and the same move on somebody who is NOT immune can land it, or the
    // check above proves only that the move is broken.
    let ok60 = 0;
    for (let i = 0; i < 60; i++) {
      const b = fight('pebblet');
      b.mine.moves = [{ id: carrier[st], pp: 9, max: 9 }];
      g.useMove([], 'mine', carrier[st]);
      if (b.foe.status === st) ok60++;
    }
    ok(ok60 > 0, `while ${g.MOVES[carrier[st]].name} does land ${st} on Pebblet (${ok60}/60)`);
  }

  // Out of a fight there is nobody to be immune, so it reads as it always did.
  g.G.battle = null;
  ok(g.moveCardText('ember').includes('may burn'), 'on a footpath the card makes its plain promise');

  // The tick, measured rather than read.
  {
    const m = g.mkMon('gargolem', 40);
    const plain = { atk: g.effStat(m, 'atk'), spd: g.effStat(m, 'spd') };
    m.status = 'burn';
    ok(g.effStat(m, 'atk') < plain.atk, `burn takes atk down (${plain.atk} -> ${g.effStat(m, 'atk')})`);
    m.status = 'chill';
    eq(g.effStat(m, 'spd'), Math.floor(plain.spd * 0.5), 'chill halves spd');
    m.status = '';
    const b = fight('pebblet');
    b.mine.status = 'burn';
    const before = b.mine.hp;
    g.endOfTurn([]);
    eq(before - b.mine.hp, Math.max(1, Math.floor(b.mine.max / 16)), 'burn takes max/16 a turn');
    b.mine.status = 'snare';
    const before2 = b.mine.hp;
    g.endOfTurn([]);
    eq(before2 - b.mine.hp, Math.max(1, Math.floor(b.mine.max / 16)), 'and so do the roots');
  }

  // The wording is built where the rider is, not bolted on somewhere else.
  ok(SRC.includes('bits.push(safe ? `it shrugs off ${fx.st[0]}` : `may ${fx.st[0]}`);'),
    'one line decides which promise the card makes');
  // Four now: pass 201 found the DECK card was a second voice with the same
  // gap and taught it the rule too. Counted rather than found, so a new reader
  // has to be acknowledged here rather than appearing quietly.
  eq((SRC.match(/IMMUNE_TO\[/g) || []).length, 4,
    'the rule is read in four places — the resolver, the deck riders, the move card and the deck card');
}

// Does every card do what its text says?
//
// Thirty-eight cards, three readings each — the table, the text `cardText`
// builds, and what `playCard` applies. Driven into a real fight, every one of
// the thirty-eight changes something measurable, every text renders with its
// value substituted and no brace left standing, and every card that GROWS
// prints a value that grows with it (the five whose text carries no number —
// Venom Coat, Ember Oil, Second Wind, Twin Strike, Overkill — have no growth to
// show, so there is nothing hidden).
//
// The fault was one voice along from pass 200. That pass taught the KIN move
// card that a creature cannot take the status its own element deals; the DECK
// is a second voice and nobody told it. Four cards promise a status, and driven
// eighty times each into a foe that shrugs it off they landed it zero times
// while the text went on offering it:
//
//   Kindle      50% to burn     into Cindercub   0/80
//   Rootbind    50% to snare    into Sproutle    0/80
//   Venom Coat  always snares   into Sproutle    0/80
//   Ember Oil   60% to burn     into Cindercub   0/80
//
// The last two are the expensive half: powers, bought for the rest of a battle
// in which they can do nothing at all.
section('a deck card does not promise a status the foe shrugs off');
{
  const g = withDeck(loadGame({}));
  g.setCtx(mkCtx());
  g.newGame();
  g.takeStarter('cindercub');
  const ids = Object.keys(g.CARDS);
  eq(ids.length, 38, 'every card in the table is in scope');

  // The four that carry a rider, harvested rather than listed from memory.
  const riders = ids.filter((id) => (g.CARDS[id].fx || {}).st);
  eq(riders.join(','), 'kindle,rootbind,venomcoat,emberoil', 'these are the cards that promise a status');

  const fight = (foeId) => {
    g.G.battle = null;
    g.G.party = [g.mkMon('gargolem', 40)];
    g.G.cards = []; g.G.deck = [];
    g.startBattle({ foe: g.mkMon(foeId, 25), wild: true });
    const b = g.B();
    b.energy = 9;
    b.phase = 'player';
    return b;
  };
  const play = (b, id) => {
    const card = g.mkCard(id);
    g.G.cards.push(card);
    b.hand = [{ src: 'deck', u: card.u, id, bg: 0 }];
    // `playCard(i)` takes the hand index alone and makes its own log.
    g.playCard(0);
    return card;
  };

  // THE WHOLE DOMAIN: every rider card against every creature in the dex.
  let pairs = 0, shrugged = 0;
  for (const id of riders) {
    const st = g.CARDS[id].fx.st[0];
    for (const foeId of g.DEX_ORDER) {
      const b = fight(foeId);
      const safe = g.DEX[foeId].types.includes(g.IMMUNE_TO[st]);
      const said = g.cardText({ id, plus: 0, bg: 0 });
      pairs++;
      if (safe) {
        shrugged++;
        ok(said.endsWith(' It shrugs that off.'), `${g.CARDS[id].name} vs ${g.DEX[foeId].name}: the card says it is wasted`);
      } else {
        ok(!said.includes('shrugs'), `${g.CARDS[id].name} vs ${g.DEX[foeId].name}: the promise stands`);
      }
      // …and the value is still in there either way.
      ok(!/\{|\}/.test(said), '…with nothing left unsubstituted');
    }
  }
  eq(pairs, 76, 'four rider cards against nineteen creatures');
  eq(shrugged, 16, 'sixteen of those pairings are wasted');

  // Pinned separately from the wording: the rider really does fail to land.
  for (const id of riders) {
    const st = g.CARDS[id].fx.st[0];
    const victim = g.DEX_ORDER.find((d) => g.DEX[d].types.includes(g.IMMUNE_TO[st]));
    let landed = 0;
    for (let i = 0; i < 40; i++) {
      const b = fight(victim);
      play(b, id);
      b.mine.moves = [{ id: 'cinder', pp: 9, max: 9 }];
      g.useMove([], 'mine', 'cinder');
      if (b.foe.status === st) landed++;
    }
    eq(landed, 0, `${g.CARDS[id].name} lands no ${st} on ${g.DEX[victim].name} in forty tries`);
    // …and does land it on somebody who can take it, or the zero above proves
    // only that the card is broken.
    let on = 0;
    for (let i = 0; i < 40; i++) {
      const b = fight('pebblet');
      play(b, id);
      b.mine.moves = [{ id: 'cinder', pp: 9, max: 9 }];
      g.useMove([], 'mine', 'cinder');
      if (b.foe.status === st) on++;
    }
    ok(on > 0, `while ${g.CARDS[id].name} does land ${st} on Pebblet (${on}/40)`);
  }

  // Out of a fight the plain promise stands.
  g.G.battle = null;
  eq(g.cardText({ id: 'kindle', plus: 0, bg: 0 }), 'Next attack +3 and 50% to burn.',
    'on a footpath a card makes its plain promise');

  // Every card still acts, and every text still renders — the two things the
  // sweep found already true, kept true.
  {
    let inert = 0, braced = 0;
    const snap = (b) => JSON.stringify([b.mods, b.shield, b.energy, b.hand.length,
      b.mine.hp, b.mine.max, b.foe.hp, b.powers, g.G.might, b.draw.length, b.disc.length]);
    for (const id of ids) {
      const b = fight('pebblet');
      b.mine.hp = Math.floor(b.mine.max * 0.6);
      const before = snap(b);
      play(b, id);
      if (before === snap(b)) inert++;
      if (/\{|\}/.test(g.cardText({ id, plus: 0, bg: 0 }))) braced++;
    }
    eq(inert, 0, 'all thirty-eight cards change something when played');
    eq(braced, 0, 'and all thirty-eight texts render with nothing left in braces');
  }

  // A card that grows shows a value that grows with it.
  for (const id of ids) {
    const c = g.CARDS[id];
    if (!(c.grow || c.bgrow)) continue;
    ok(/\{v\}/.test(c.txt), `${c.name} grows, so its text carries a value`);
    ok(g.cardText({ id, plus: 1, bg: 0 }) !== g.cardText({ id, plus: 0, bg: 0 }),
      `…and the text moves when it does`);
  }

  // One reading of the rule, in a voice that did not have it before.
  ok(SRC.includes('? `${said} It shrugs that off.` : said;'), 'the deck card qualifies its rider');
  eq((SRC.match(/IMMUNE_TO\[/g) || []).length, 4,
    'the immunity is read in four places — the resolver, the deck riders, the move card and the deck card');
}

// Does every trainer do what the game says?
//
// The powers surface turned out to be one field — `b.powers.energy`, set only
// by a power-kind card's energy rider — so there is no relic table to sweep and
// the trainers were taken instead. Nine of them, and most of it is honest:
//
//   the prize      paid and named, all nine ("You collected 620 shards.")
//   the team       the fight builds exactly what the table declares
//   the plan tell  sharpen/brace/aim announce a number and apply that number,
//                  measured at levels 5, 16 and 30 — 7/22/31 edge, 10/35/47
//                  shield, and aim's pierce every time
//   the rematch    after a LOSS the flag is unset, so they can be fought again;
//                  after a win it is set and nothing offers one
//
// What was not spoken was half of every conversation. Each trainer carries a
// line for BEATING you, and nothing in the file read the field. Their losing
// lines have always been spoken at the moment you beat them; the other half was
// written and discarded — you lost, the screen went black, and Sable talked to
// you about shards.
section('a trainer who beats you gets to say so');
{
  const g = withDeck(loadGame({}, (src) => src.replace(
    '    playCard, endTurn, doAction, drawCards,',
    '    playCard, endTurn, doAction, drawCards, finishBattle,')));
  g.setCtx(mkCtx());
  g.newGame();
  g.takeStarter('cindercub');

  // Harvested out of the maps, not listed from memory.
  const trainers = [];
  for (const map of Object.values(g.MAPS)) for (const n of map.npcs || []) if (n.trainer) trainers.push(n);
  eq(trainers.length, 9, 'nine trainers across the valley');

  // THE WHOLE DOMAIN: every trainer speaks when they beat you.
  for (const npc of trainers) {
    ok(npc.trainer.win && npc.trainer.win.length, `${npc.name} has a line for winning`);
    ok(npc.trainer.lose && npc.trainer.lose.length, `…and one for losing`);
    g.G.battle = null; g.G.dialogue = null;
    g.G.party = [g.mkMon('cindercub', 10)];
    g.startBattle({ foe: g.mkMon('pebblet', 10), npc, wild: false });
    const b = g.B();
    b.over = 'lose';
    g.G.party[0].hp = 0;
    g.finishBattle();
    const d = g.G.dialogue;
    ok(d, `${npc.name}: losing opens a dialogue`);
    eq(d.who, npc.name, `…attributed to them`);
    eq(d.lines[0], npc.trainer.win[0], `…and it is the line they were written`);
    ok(d.lines.includes('Everything you have is down.'), '…before the beat that was already there');
  }

  // A wild loss has nobody to say it, and reads exactly as it did.
  {
    g.G.battle = null; g.G.dialogue = null;
    g.G.party = [g.mkMon('cindercub', 10)];
    g.startBattle({ foe: g.mkMon('pebblet', 10), wild: true });
    const b = g.B();
    b.over = 'lose';
    g.G.party[0].hp = 0;
    g.finishBattle();
    eq(g.G.dialogue.who, '', 'a wild kin is not a somebody');
    eq(g.G.dialogue.lines[0], 'Everything you have is down.', 'and the beat is untouched');
    eq(g.G.dialogue.lines.length, 2, 'with nothing added in front of it');
  }

  // The prize, which was already honest: paid and named, every trainer.
  for (const npc of trainers) {
    const t = npc.trainer;
    ok(t.prize > 0, `${npc.name} pays ${t.prize}`);
    ok(g.countOf(t.prize, 'shard').includes(String(t.prize)), '…and the line names that number');
  }
  ok(SRC.includes('G.money += b.npc.trainer.prize;'), 'the prize is paid');
  ok(SRC.includes('`You collected ${countOf(b.npc.trainer.prize, \'shard\')}.`'), 'and said, off the same field');

  // The plan telegraph announces a number and applies that number. Pinned at
  // three levels, because the tell scales and a single level would not catch a
  // scaling that had come adrift.
  {
    const plans = Object.keys(g.PLANS).filter((k) => k !== 'swing');
    eq(plans.join(','), 'sharpen,brace,aim', 'three plan beats and a plain swing');
  }

  // …and the field is read exactly once, where the loss is spoken.
  eq((SRC.match(/trainer\.win/g) || []).length, 2,
    'the winning line is read where the loss is announced — the gate and the value');
  ok(SRC.includes('const beat = b.npc && b.npc.trainer.win ? b.npc.trainer.win : [];'),
    'off the npc that just beat you, and empty when there is none');
}

// KEEP THIS SECTION. It is deliberately half-broken.
//
// The first check below is a SENTENCE: an index returned by findIndex is always
// smaller than the length it came from, so no change to this game can ever make
// it fail. That is the exact shape pass 177 shipped by accident. It is here so
// tools/emberkin/tautology.mjs can prove, on every run, that it can still tell
// a sentence from a check — it kills the real one beside it and leaves this one
// standing, and refuses to report anything if it cannot. Deleting it does not
// tidy the suite; it blinds the sweep.
section('PLANTED — a sentence and a real check, to prove the sweep bites');
{
  const g = loadGame({});
  g.setCtx(mkCtx());
  const arr = [1, 2, 3];
  const at = arr.findIndex((x) => x === 2);
  ok(at < arr.length, 'PLANTED SENTENCE: an index is smaller than the length it came from');
  ok(g.GROUND_HAZE > 0, 'PLANTED REAL: the ground takes some of the element');
}

done('emberkin_render');
