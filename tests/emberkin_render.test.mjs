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
eq(fresh.G.mode, 'menu', 'the starter menu opens');
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
    && !b.hand.some((c) => fresh.cardCost(c) <= b.energy);
  const key = stuck ? 'e' : 'a';
  fresh.step(.12);
  fresh.pressKey(key); fresh.step(.02); fresh.releaseKey(key); fresh.fired.clear();
  fresh.draw();
}
ok(guard < 600, `the battle resolved by playing cards and ending turns (${guard} frames)`);
eq(fresh.G.battle, null, 'and handed control back to the world');
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

cb = freshBattle();
const handWas = cb.hand.length;
tapC('up');
ok(cb.hand.length < handWas, 'up plays the card you are on');

cb = freshBattle();
const third = cb.hand[2] && ctl.cardName(cb.hand[2]);
tapC('3');
ok(cb.hand.length < 5 || !third, 'a number key plays that card outright');
ok(!cb.hand.some((c, i) => i === 2 && ctl.cardName(c) === third && cb.hand.length === 5), 'the third card is the one that left');

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
