// EMBERKIN — render and flow suite.
//
// The logic suite never touches draw(). This one does: it drives the real
// renderer against a no-op 2d context for every map and for a battle, so a
// typo in a drawing path fails here instead of on a black screen. It then
// plays the opening beat-by-beat through the same input the player uses.
//
// Run: node tests/emberkin_render.test.mjs
import { loadGame, mkCtx, withDeck, autoFight, ok, eq, done, section } from './emberkin_lib.mjs';

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
  ok(/function startNew\(\) \{ show\(els\.title, false\); wipeSave\(\)/.test(SRC),
    'and New journey really does destroy it — this is not a cosmetic ordering');

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
  eq(g.EFF_MARK[String(a.eff)].tag, 'RESISTED', 'and it is labelled');
  eq(g.EFF_MARK[String(b2.eff)].tag, 'STRONG', 'both ways');
  ok(!g.EFF_MARK['1'], 'a neutral hit is not labelled at all — a mark on everything marks nothing');

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
  eq(g.EFF_MARK['0'].tag, 'NOTHING', 'an immune matchup has its own mark');

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

done('emberkin_render');
