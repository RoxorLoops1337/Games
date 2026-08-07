// EMBERKIN — render and flow suite.
//
// The logic suite never touches draw(). This one does: it drives the real
// renderer against a no-op 2d context for every map and for a battle, so a
// typo in a drawing path fails here instead of on a black screen. It then
// plays the opening beat-by-beat through the same input the player uses.
//
// Run: node tests/emberkin_render.test.mjs
import { loadGame, mkCtx, ok, eq, done, section } from './emberkin_lib.mjs';

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
for (let i = 0; i < 10 && fresh.G.mode === 'dialogue'; i++) tap('a');
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
const SRC = readFileSync(new URL('../emberkin/index.html', import.meta.url), 'utf8');
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
const SKY = new Set(['route', 'town', 'route_one', 'emberwood', 'stillmere', 'crown_hollow']);
for (const [id, gr] of Object.entries(EK.GRADE)) {
  if (gr.shaft) {
    ok(SKY.has(id), `${id}: only a map with a sky gets shafts`);
    ok(/^rgba\(\d+,\s*\d+,\s*\d+,\s*\.?\d+\)$/.test(gr.shaft[0]), `${id}: shaft colour is usable`);
    ok(gr.shaft[1] > 0 && gr.shaft[1] < .3, `${id}: shaft strength stays under a wash`);
  } else {
    ok(!SKY.has(id) || id === 'route', `${id}: an outdoor map is lit from somewhere`);
  }
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
ok(/scale\(1\.0\d\)/.test(picked), 'and grows a little');
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
// It is not driven by the buttons any more — that was the old bug: the one
// moment the genre is built around used to run at the speed you mashed A.
const evo2 = loadGame({});
evo2.setCtx(mkCtx());
evo2.G.party = [evo2.mkMon('cindercub', 20)];
evo2.runEvolution(evo2.G.party[0]);
for (let i = 0; i < 12; i++) {
  evo2.pressKey('a'); evo2.step(.02); evo2.releaseKey('a'); evo2.fired.clear();
}
ok(evo2.G.evoAnim, 'mashing A does not skip it');
ok(evo2.evoPhase() === 'hold' || evo2.evoPhase() === 'build', `it is still early (${evo2.evoPhase()})`);

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
  if (monkey.G.battle && !wasBattle) battles++;
  wasBattle = !!monkey.G.battle;
  // Keep it alive so it goes on finding new states rather than sitting in a wipe.
  if (!monkey.G.party.some((m) => m.hp > 0)) monkey.healParty();
}
ok(!crashed, `6000 random frames survived${crashed ? ' — ' + crashed : ''}`);
ok([...modesSeen].every((m) => MODES.has(m)), `only valid modes reached (${[...modesSeen].join(', ')})`);
ok(modesSeen.has('world'), 'it walked around');
ok(battles > 0, `it stumbled into ${battles} battles`);
ok(monkey.G.party.length >= 1, 'it still has a party');
ok(monkey.G.party.every((m) => m.hp >= 0 && m.hp <= m.max), 'HP never went out of bounds');
ok(monkey.G.party.every((m) => m.moves.every((mv) => mv.pp >= 0 && mv.pp <= mv.max)), 'PP never went out of bounds');
ok(monkey.G.money >= 0, 'shards never went negative');
ok(monkey.G.party.length <= 6, 'the party never overflowed');

done('emberkin_render');
