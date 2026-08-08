// EMBERKIN — the whole story, start to end, driven through the real game.
//
// The other suites test pieces. This one plays: take a starter from Rowan, get
// called out by the rival, beat every trainer on every route, get past the
// Warden, catch the legendary on the shrine grass, beat the rival's last team,
// and hear Rowan's closing line. If any beat of the story stops being
// reachable — a flag that never sets, a gate that never opens, an NPC that
// never appears — this suite deadlocks and fails rather than quietly skipping.
//
// Run: node tests/emberkin_story.test.mjs
import { readFileSync } from 'node:fs';
import { loadGame, mkCtx, withDeck, autoFight, ok, eq, done, section } from './emberkin_lib.mjs';
const SRC = readFileSync(new URL('../emberkin/index.html', import.meta.url), 'utf8');

const EK = loadGame({});
EK.setCtx(mkCtx());
const G = EK.G;

const tap = (k, n = 1) => {
  for (let i = 0; i < n; i++) { EK.pressKey(k); EK.step(.2); EK.releaseKey(k); EK.fired.clear(); }
};
/**
 * Clear whatever dialogue or menu is on screen. Stops at a battle rather than
 * mashing through one — button-mashing a fight is how you lose it.
 */
const clear = (limit = 40) => {
  for (let i = 0; i < limit && G.mode !== 'world' && G.mode !== 'battle'; i++) tap('a');
  return G.mode;
};
/**
 * Drain the battle's own message queue. `clear()` cannot: in a fight G.mode is
 * 'battle', so it returns straight away and the intro lines were only ever
 * dismissed incidentally by whatever tapped next. That held while every fight
 * opened with exactly two lines. The legendary opens with three, and counting
 * taps instead of draining is what broke here first.
 */
const drainMsg = (limit = 12) => {
  for (let i = 0; i < limit && EK.liveBattleMsg(); i++) tap('a');
};
/** Fight the current battle to the end, sending out the next kin when one falls. */
function fightToEnd(limit = 40) {
  for (let round = 0; round < limit; round++) {
    if (!G.battle) return true;
    autoFight(EK, 200);
    const b = EK.B();
    if (!b) return true;
    if (b.over === 'switch') {
      // The forced-switch screen: pick whoever can still stand.
      tap('a', 3);
      const next = G.party.findIndex((m) => m.hp > 0);
      if (next < 0) return true;
      if (G.screen) { G.screen.i = next; tap('a', 2); }
      continue;
    }
    if (b.over) { tap('a', 8); clear(); return true; }
  }
  return false;
}

/** A party strong enough that story progress is never a balance question. */
const stack = (lvl, ids = ['tsunaga', 'magmane', 'bramblor']) => {
  G.party = ids.filter((id) => EK.DEX[id]).map((id) => EK.mkMon(id, lvl));
  EK.healParty();
};
const talkAndFight = (mapId, id, lvl) => {
  const npc = EK.MAPS[mapId].npcs.find((n) => n.id === id);
  stack(lvl);
  EK.enterMap(mapId, npc.x, npc.y + 1, 'up');
  G.mode = 'world';
  EK.talkTo(npc);
  clear();
  ok(!!G.battle, `${npc.name} accepted the challenge`);
  ok(fightToEnd(), `${npc.name}'s battle resolved`);
  return npc;
};

// ---------------------------------------------------------------- opening --
section('the study');
EK.newGame();
eq(G.mapId, 'lab', 'a new journey starts in Rowan\'s study');
clear();
const rowan = EK.MAPS.lab.npcs[0];
G.player.x = rowan.x; G.player.y = rowan.y + 1; G.player.px = rowan.x; G.player.py = rowan.y + 1;
G.player.dir = 'up';
tap('a');
clear(20);                                   // speech, then the starter menu
eq(G.party.length, 1, 'Rowan hands over a kin');
eq(G.party[0].species, 'cindercub', 'the first option is Cindercub');
eq(G.flags.starter, 'cindercub', 'the game remembers which one');
ok(G.bag.bloomorb >= 5, 'and some orbs to go with it');

section('the rival, on the way out of town');
const wick1 = EK.MAPS.hollowbrook.npcs.find((n) => n.id === 't_wick1');
ok(EK.npcActive(wick1), 'Wick is waiting on the path now');
const DIR = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const [wdx, wdy] = DIR[wick1.dir];
EK.enterMap('hollowbrook', wick1.x + wdx * 2, wick1.y + wdy * 2, 'up');
G.mode = 'world'; G.alert = null;
ok(EK.trainerSight(), 'he calls you out');
ok(!!G.alert, 'and the frame closes in on him');
// The ambush is a beat, not a line: he walks over before anybody speaks.
let approached = 0;
for (let i = 0; i < 120 && G.alert; i++) { EK.step(.05); EK.fired.clear(); approached = Math.max(approached, Math.abs(wick1.ox || 0) + Math.abs(wick1.oy || 0)); }
ok(approached > 0, `he closed the distance on his own (${approached}px)`);
eq(wick1.ox || 0, 0, 'and ended up back on his own tile');
clear();
ok(!!G.battle, 'and the battle starts');
eq(EK.B().foe.species, EK.RIVAL_PICK.cindercub, 'with the starter that beats yours');
// This one is fought on what Rowan just handed over — no stacked party. It is
// the first fight in the game and it stands on the only road out of town, so
// if it is not winnable on a level-5 starter and the starting deck, the game
// is not winnable at all. Every other beat below may stack; this one may not.
eq(G.party.length, 1, 'with the one kin you were given');
eq(G.party[0].lvl, 5, 'at the level you were given it');
ok(EK.B().foe.lvl <= G.party[0].lvl, 'and he does not outlevel you on top of the type advantage');
// fightToEnd plays greedily — spend everything, end the turn — so it drops one
// of these now and again, exactly like a player learning the deck. What must
// hold is that a loss costs you a retry and nothing else: heal up, walk back,
// go again. If it took more than a handful the fight would be too steep.
let attempts = 1;
ok(fightToEnd(), 'the rival battle resolved');
while (!G.flags.t_wick1 && attempts < 12) {
  attempts++;
  EK.healParty();
  G.mode = 'world'; G.dialogue = null; G.battle = null;
  EK.enterMap('hollowbrook', wick1.x - wdx, wick1.y - wdy, 'up');
  EK.talkTo(wick1);
  clear();
  ok(!!G.battle, `attempt ${attempts}: he takes the rematch`);
  ok(fightToEnd(), `attempt ${attempts} resolved`);
}
eq(G.flags.t_wick1, 1, 'beating him is recorded');
ok(attempts <= 6, `and a fresh starter gets there without a grind (${attempts} attempt${attempts > 1 ? 's' : ''})`);
// Each loss costs a quarter of your shards, so only the single-attempt run ends
// up ahead of where it started — what has to be true either way is that the
// prize was actually paid out.
ok(G.money >= wick1.trainer.prize, `the prize was paid (${G.money} shards after ${attempts} attempt${attempts > 1 ? 's' : ''})`);

section('and losing to him does not lock you in town');
// Wick stands between Hollowbrook and the only grass in the game. If a loss
// let him re-challenge on the way back, there would be no way to train out of it.
const stuckRun = loadGame({});
stuckRun.setCtx(mkCtx());
stuckRun.newGame();
stuckRun.G.flags = { gotStarter: 1, starter: 'cindercub' };
stuckRun.G.party = [stuckRun.mkMon('cindercub', 5)];
const w = stuckRun.MAPS.hollowbrook.npcs.find((n) => n.id === 't_wick1');
const [sdx, sdy] = DIR[w.dir];
const walkInto = () => {
  stuckRun.enterMap('hollowbrook', w.x + sdx * 2, w.y + sdy * 2, 'up');
  stuckRun.G.mode = 'world'; stuckRun.G.alert = null; stuckRun.G.battle = null;
  return stuckRun.trainerSight();
};
ok(walkInto(), 'he calls you out the first time');
stuckRun.G.dialogue = null; stuckRun.G.battle = null;
ok(!walkInto(), 'and never again, win or lose — the road out is open');
ok(!stuckRun.G.flags.t_wick1, 'he is still unbeaten, so the rematch is still worth something');
stuckRun.G.party = [stuckRun.mkMon('pyrelynx', 30)];
stuckRun.G.mode = 'world'; stuckRun.G.dialogue = null;
stuckRun.talkTo(w);
ok(!!stuckRun.G.dialogue || !!stuckRun.G.battle, 'and walking up to him still starts it');

// ----------------------------------------------------------------- routes --
section('Route One');
talkAndFight('route_one', 't_pell', 16);
eq(G.flags.t_pell, 1, 'Forager Pell is beaten');
talkAndFight('route_one', 't_dorn', 16);
eq(G.flags.t_dorn, 1, 'Hiker Dorn is beaten');

section('Stillmere Shore');
talkAndFight('stillmere', 't_mio', 20);
eq(G.flags.t_mio, 1, 'Tide-hand Mio is beaten');

section('Emberwood');
talkAndFight('emberwood', 't_ivo', 22);
talkAndFight('emberwood', 't_coll', 22);
const wick2 = EK.MAPS.emberwood.npcs.find((n) => n.id === 't_wick2');
ok(EK.npcActive(wick2), 'the rival turned up again — he said he would');
talkAndFight('emberwood', 't_wick2', 24);
eq(G.flags.t_wick2, 1, 'the rematch is won');

section('the Warden opens the pass');
const hale = EK.MAPS.emberwood.npcs.find((n) => n.id === 't_hale');
ok(EK.npcActive(hale), 'the Warden is still standing in the corridor');
ok(!EK.passable(EK.MAPS.emberwood, hale.x, hale.y, hale.y + 1), 'and blocks it');
talkAndFight('emberwood', 't_hale', 30);
eq(G.flags.t_hale, 1, 'the Warden is beaten');
// Was `hale.gone` — a field on the shared MAPS object that the save never
// carried. Asking npcActive instead asks the question the game asks.
ok(!EK.npcActive(hale), 'and steps off the path');
ok(EK.passable(EK.MAPS.emberwood, hale.x, hale.y, hale.y + 1), 'the corridor is walkable now');

// -------------------------------------------------------------- the hunt --
section('Crown Hollow');
stack(34);
G.bag = { prismorb: 60, greatsalve: 20 };
EK.enterMap('crown_hollow', 8, 10, 'up');
G.mode = 'world';
// Walk a real patch of shrine grass until the legendary shows itself.
let shrine = null;
for (let y = 2; y <= 8 && !shrine; y++) {
  for (let x = 2; x < EK.MAPS.crown_hollow.rows[y].length - 2; x++) {
    if (EK.MAPS.crown_hollow.rows[y][x] === ',') { shrine = [x, y]; break; }
  }
}
ok(!!shrine, 'the shrine has grass to walk');
let appeared = false;
for (let i = 0; i < 400 && !appeared; i++) {
  G.battle = null; G.mode = 'world'; G.dialogue = null;
  G.flags.vespyrSeenAt = -100;
  G.player.x = shrine[0]; G.player.y = shrine[1];
  EK.onArrive();
  clear();
  appeared = !!G.battle && G.battle.foe.species === 'vespyr';
  if (appeared) drainMsg();
  if (G.battle && !appeared) { G.battle = null; G.mode = 'world'; }
}
ok(appeared, 'Vespyr turns up on the shrine grass');
eq(G.dex.vespyr, 1, 'and is registered as seen');

section('catching it');
let caught = false;
for (let round = 0; round < 120 && !caught; round++) {
  if (!G.battle) {                                 // knocked it out — it comes back
    G.mode = 'world';
    ok(!G.flags.beatVespyr, 'losing it is not permanent');
    G.flags.vespyrSeenAt = -100;
    EK.startBattle({ foe: EK.mkMon('vespyr', 26), wild: true, legendary: true });
    clear(); drainMsg();
  }
  const b = EK.B();
  if (!b) break;
  drainMsg();
  b.foe.hp = 1;                                    // stand in for whittling it down
  EK.doAction({ kind: 'item', id: 'prismorb' });
  if (EK.B() && EK.B().over === 'caught') { tap('a', 8); caught = G.dex.vespyr === 2; }
  else if (EK.B() && EK.B().over) { tap('a', 8); }
  if (G.party.some((m) => m.hp <= 0)) EK.healParty();
  if (G.mode !== 'world' && !G.battle) clear();
}
ok(caught, 'the legendary can be caught');
eq(G.flags.beatVespyr, 1, 'and that closes the hunt');
ok(G.party.concat(G.box).some((m) => m.species === 'vespyr'), 'it is actually yours');

section('the last word');
const wick3 = EK.MAPS.crown_hollow.npcs.find((n) => n.id === 't_wick3');
ok(EK.npcActive(wick3), 'Wick is waiting at the shrine');

// What Rowan says with the shrine down but Wick still standing, recorded now so
// the ending can be compared against it. This used to assert the ending
// contained "So it went with you" — which is the SHRINE speech, keyed on
// beatVespyr, a flag set by the fight before the last one. The test agreed with
// the game that the second-to-last beat was the end, so neither noticed that
// finishing the game was acknowledged by nobody.
const seeRowan = () => {
  EK.enterMap('lab', rowan.x, rowan.y + 1, 'up');
  G.mode = 'world'; G.dialogue = null;
  EK.rowanScript();
  ok(!!G.dialogue, 'Rowan has something to say');
  const said = G.dialogue.lines.join(' ');
  clear();
  return said;
};
const atShrine = seeRowan();

talkAndFight('crown_hollow', 't_wick3', 38);
eq(G.flags.t_wick3, 1, 'the last rival battle is won');

// What he says afterwards, read by talking to him rather than off the field —
// it is a function now, and a test that reached for `.after.join` would only
// have proved it could still reach a field.
const askWick = () => {
  EK.enterMap('crown_hollow', wick3.x, wick3.y + 1, 'up');
  G.mode = 'world'; G.dialogue = null;
  EK.talkTo(wick3);
  const said = G.dialogue.lines.join(' ');
  clear();
  return said;
};
const sentDown = askWick();
ok(/Rowan/.test(sentDown), `and Wick sends you down to Rowan — "${sentDown}"`);

const ending = seeRowan();
ok(ending !== atShrine, 'and what she says is not the speech you already heard at the shrine');
ok(/ceremony/i.test(ending), 'she keeps her word that there is none');
ok(new RegExp(EK.spell(EK.AIM_ORDER.length)).test(ending),
  `and counts the trainers you actually beat (${EK.spell(EK.AIM_ORDER.length)})`);

// And the errand he gave you expires when you run it. Walking back up the
// mountain used to get "Go and see Rowan" for ever, including on the trip
// straight back from having gone and seen her.
eq(G.flags.heardEnding, 1, 'hearing her out is recorded');
const afterwards = askWick();
ok(afterwards !== sentDown, `Wick stops sending you somewhere you have been — "${afterwards}"`);
ok(!/Go and see Rowan/.test(afterwards), 'and does not repeat the errand');

section('the deck came along for the ride');
ok(G.cards.length >= EK.STARTER_DECK.length, 'you still have your starting cards');
ok(G.deck.length >= EK.DECK_MIN, 'and a legal deck');
ok(G.gems > 0, `the journey paid out gems (${G.gems})`);

section('the run holds together afterwards');
ok(EK.saveGame(), 'the finished run saves');
ok(G.money > 0, 'you finished with shards in hand');
ok(EK.dexCount(1) >= 8, `you met most of the valley on the way (${EK.dexCount(1)} seen)`);
EK.draw();
ok(true, 'and it still renders');

section('Sable does not perform a heal that heals nothing');
{
  const g = loadGame({});
  g.newGame();
  g.enterMap('wayhouse', 5, 5, 'down'); g.G.mode = 'world'; g.G.dialogue = null;
  const sable = g.G.map.npcs.find((n) => n.heal);
  ok(!!sable, 'the Wayhouse has someone who heals');

  // A whole party: the short line, and no light.
  g.G.party = [g.mkMon('cindercub', 8)];
  g.talkTo(sable);
  const whole = g.G.dialogue && g.G.dialogue.lines.join(' ');
  ok(/all sound/i.test(whole || ''), `a whole party is told so — got "${whole}"`);
  for (let i = 0; i < 12 && g.G.dialogue; i++) { g.G.dialogue.hold = 0; g.advanceDialogue(); }
  ok(!g.G.mend, 'and the mend never runs, because nothing was mended');

  // A hurt one: the offer, then the light, then the reply.
  const m = g.G.party[0];
  m.hp = 3;
  g.G.dialogue = null; g.G.mend = null;
  g.talkTo(sable);
  for (let i = 0; i < 12 && g.G.dialogue; i++) { g.G.dialogue.hold = 0; g.advanceDialogue(); }
  ok(!!g.G.mend, 'a hurt party gets the light');
  eq(m.hp, m.max, 'and is actually put back together');
}

section('a chest opens as an event, not a re-render');
{
  const g = loadGame({});
  g.newGame();
  g.G.gems = 4000;
  g.openScreen('chests');
  const s2 = g.G.screen;
  ok(s2 && s2.kind === 'chests', 'the chest shop opens');
  const before = g.G.deck.length + g.G.cards.length;
  g.screenSelect();
  ok(!!g.G.chestOpen, 'buying one starts the beat rather than just re-rendering');
  ok((g.G.chestOpen.names || []).length > 0, 'and it names what you actually got');
  ok(g.G.gems < 4000, 'the gems were spent');
  ok(g.G.cards.length + g.G.deck.length > before, 'and the cards really arrived');
  // It ends on its own clock and hands the screen back.
  let guard = 0;
  while (g.G.chestOpen && guard++ < 400) { g.step(.02); g.fired.clear(); }
  ok(guard < 400, 'the beat ends rather than holding the screen for ever');
  ok(!g.G.chestOpen, 'and clears itself');
  ok(g.G.screen && g.G.screen.kind === 'chests', 'leaving you in the shop, to open another');
}

// The game never said what you were doing. It handed you a kin, explained the
// deck, opened the door, and the menu counted what you HAD and never what it
// was FOR. This reads the shape back out of G.flags rather than storing it
// twice, so it cannot drift from the actual progression.
section('the menu says what you are actually doing');
{
  const g = loadGame({});
  g.newGame();
  ok(/Rowan/.test(g.nextAim()), `before the starter it points at Rowan — "${g.nextAim()}"`);
  g.takeStarter('cindercub');
  ok(/Wick/.test(g.nextAim()), `then at the first trainer — "${g.nextAim()}"`);
  // Beat them in order; the aim has to move each time, never repeat, never stall.
  // Note what is NOT in this list: t_wick3 sits behind beatVespyr, so it cannot
  // be the aim until the shrine is done. The first version of this test set it
  // early and passed, because the code it was checking had the same order wrong.
  const seen = new Set();
  for (const id of ['t_wick1', 't_pell', 't_dorn', 't_ivo', 't_wick2', 't_coll', 't_mio', 't_hale']) {
    g.G.flags[id] = 1;
    const a = g.nextAim();
    ok(!seen.has(a), `the aim moved on after ${id} — "${a}"`);
    // The shrine line names Crown Hollow too, and rightly — what must never
    // appear yet is a TRAINER up there, which is the phrasing this checks.
    ok(!/standing, in Crown Hollow/.test(a), `and never sends you to fight in Crown Hollow before the shrine — "${a}"`);
    seen.add(a);
  }
  ok(/shrine/i.test(g.nextAim()), `with every reachable trainer down it points at the shrine — "${g.nextAim()}"`);
  g.G.flags.beatVespyr = 1;
  ok(/Wick/.test(g.nextAim()) && /Crown Hollow/.test(g.nextAim()),
    `the shrine opens Wick's last fight, and only then — "${g.nextAim()}"`);
  g.G.flags.t_wick3 = 1;
  ok(/unfound|valley is yours/.test(g.nextAim()), `and after that at the dex — "${g.nextAim()}"`);
}

// The gate column in AIM_ORDER is a copy of a fact the map data already owns.
// Copies drift, and this one drifting is what sent players up an empty mountain,
// so the copy gets compared against the original rather than trusted.
section('the aim order agrees with the gates the map actually sets');
{
  const g = loadGame({});
  const npcs = new Map();
  for (const map of Object.values(g.MAPS)) for (const n of map.npcs || []) if (n.id) npcs.set(n.id, n);
  for (const [id, who, where, gate] of g.AIM_ORDER) {
    const npc = npcs.get(id);
    ok(!!npc, `${id} is a trainer that exists on a map`);
    if (!npc) continue;
    eq(npc.name, who, `${id} is named the same in the aim as on the map`);
    eq(gate || null, npc.requires || null, `${id}'s gate matches the map: aim says ${gate || 'none'}`);
    ok(/./.test(where), `${id} says where it is`);
  }
  const listed = new Set(g.AIM_ORDER.map(([id]) => id));
  for (const id of npcs.keys()) {
    if (id.startsWith('t_')) ok(listed.has(id), `every trainer on a map is in the aim order (${id})`);
  }
}

// Rowan hands you a kin and five lines of rules, and used to send you out the
// door without once saying what the valley wanted. The menu carries the running
// answer; this is the one said out loud, so it is driven through the real
// hand-over rather than read out of the source.
section('Rowan says what the journey is for');
{
  const g = loadGame({});
  g.setCtx(mkCtx());
  g.newGame();
  g.openScreen('starter');
  g.screenSelect();                       // takes the aimed kin — raises the gotcha
  ok(!!g.G.gotcha, 'the hand-over still opens with the celebration');
  g.step(3);                              // the gotcha runs itself out into the papers
  g.closeScreen();                        // a fresh profile has one way out, and it talks
  ok(!!g.G.dialogue, 'and ends in Rowan talking');
  const said = g.G.dialogue.lines.join(' ');
  ok(/deck/i.test(said), `he still explains the deck — "${said.slice(0, 40)}…"`);
  ok(said.includes(g.spell(g.AIM_ORDER.length)), `he counts the trainers, in words (${g.spell(g.AIM_ORDER.length)})`);
  ok(/shrine/i.test(said), 'he mentions the thing on the shrine');
  ok(said.includes(g.spell(g.DEX_ORDER.length)), `and the kin worth writing down (${g.spell(g.DEX_ORDER.length)})`);
  ok(!/\b\d+ (trainers|kin)\b/.test(said), `and says them as a person, not a stat line — "${said.match(/\b\d+ (?:trainers|kin)\b/) || 'no digits'}"`);
  // The aim is the last thing said, so it is what you are holding at the door.
  const last = g.G.dialogue.lines[g.G.dialogue.lines.length - 1];
  ok(/errand/i.test(last), `the errand is the closing line, not the chest shop — "${last}"`);
  for (let i = 0; i < 20 && g.G.dialogue; i++) { g.G.dialogue.hold = 0; g.advanceDialogue(); }
  ok(!g.G.dialogue, 'and the whole speech is dismissable');
  eq(g.G.mode, 'world', 'leaving you stood in the world with a kin');
}

// Warden Hale is the only npc who leaves the map, and he leaves the one tile
// that matters. Run across TWO game instances over one store, because the fault
// was invisible inside a single one: the field that removed him lived on the
// module-level MAPS object, so it survived a save it was never part of, right
// up until the tab closed.
section('the Warden stays off the path across a reload');
{
  const store = {};
  const a = loadGame(store);
  a.setCtx(mkCtx());
  a.newGame();
  a.takeStarter('cindercub');
  const hale = (g) => g.MAPS.emberwood.npcs.find((n) => n.id === 't_hale');
  const h = hale(a);
  const open = (g, n) => g.passable(g.MAPS.emberwood, n.x, n.y, n.y + 1);

  ok(a.npcActive(h), 'he is on the path to start with');
  ok(!open(a, h), 'and standing in it');
  // If the neck ever stops being one tile wide he is decoration and every other
  // assertion in this section is measuring nothing.
  ok(!a.passable(a.MAPS.emberwood, h.x + 1, h.y, h.y + 1)
    && !a.passable(a.MAPS.emberwood, h.x - 1, h.y, h.y + 1),
    'the pass is one tile wide, so he is the gate and not a decoration in front of one');

  a.G.flags.t_hale = 1;                      // exactly what winning records
  ok(!a.npcActive(h), 'beating him takes him off it');
  ok(open(a, h), 'and the pass opens');
  ok(a.saveGame(), 'the run saves');

  // A second instance is a second page load: fresh MAPS, same save.
  const b = loadGame(store);
  b.setCtx(mkCtx());
  ok(b.loadGame(), 'the save comes back');
  ok(!b.npcActive(hale(b)), 'and he is still off the path');
  ok(open(b, hale(b)),
    'so Crown Hollow, the shrine and the last fight are still reachable after a reload');

  // The other direction, same root cause: a new run in the same tab must find
  // him back, or the Warden never fights and the pass is open from minute one.
  a.newGame();
  ok(a.npcActive(h), 'and a fresh run finds him back on the path');
  ok(!open(a, h), 'with the pass shut again');
}

// Four people in this valley exist to point at something: the grass, the
// Wayhouse, the road north, the thing in the shallows. Every one of them went
// on pointing at it for the whole game — to a player who by the end had caught
// the grass, used the Wayhouse forty times, walked the road, and had the thing
// in the shallows in their party. A signpost that keeps pointing after you have
// arrived is worse than no signpost.
section('the signposts stop pointing once you have arrived');
{
  const g = loadGame({});
  const npc = (name) => {
    for (const m of Object.values(g.MAPS)) for (const n of (m.npcs || [])) if (n.name === name) return n;
    return null;
  };
  const fresh = (setup) => {
    g.newGame(); g.G.dialogue = null;
    g.takeStarter('cindercub');
    if (setup) setup();
  };
  const said = (name) => g.talkLines(npc(name)).join(' ');

  // The mechanism first: `lines` may be a function, the way `after` already
  // could. It was a trainers-only privilege for no reason but that trainers
  // were where it was first needed.
  for (const name of ['Old Tam', 'Bly', 'Ranger Isa', 'Sheller Ann']) {
    eq(typeof npc(name).lines, 'function', `${name} is allowed to notice things`);
  }
  // And every path that speaks goes through the one accessor, so a person who
  // wants to notice something can wherever they stand — including behind a
  // counter. Five call sites used to read `npc.lines` directly and only one of
  // them would have honoured a function.
  ok(!/say\(npc\.name, npc\.lines/.test(SRC), 'and no path reads the lines around it');

  fresh();
  ok(/thick with kin/.test(said('Old Tam')), 'Tam explains the grass to somebody who has not walked it');
  fresh(() => g.DEX_ORDER.slice(0, 6).forEach((id) => g.catchMon(id)));
  ok(!/thick with kin/.test(said('Old Tam')), 'and stops explaining it to somebody who has');
  ok(/boots/.test(said('Old Tam')), 'noticing instead');
  // His boast was a number and the tally is a number, and at six they collided:
  // "Six kinds in the book. I managed six." Comparative now, so check no count
  // can make him repeat himself.
  for (let n = 4; n < g.DEX_ORDER.length; n++) {
    fresh(() => g.DEX_ORDER.slice(0, n).forEach((id) => g.catchMon(id)));
    const words = said('Old Tam').match(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen)\b/gi) || [];
    eq(new Set(words.map((w) => w.toLowerCase())).size, words.length,
      `at ${n} caught, Tam does not say the same number twice`);
  }
  fresh(() => g.DEX_ORDER.forEach((id) => g.catchMon(id)));
  ok(/Every last one/.test(said('Old Tam')), 'and the full book gets its own answer');

  // Bly's is the one that is urgent exactly when it is urgent — read off the
  // same party state Sable reads at her door.
  fresh();
  ok(/patches your kin up for free/.test(said('Bly')), 'Bly gives directions once');
  fresh(() => { g.G.been.wayhouse = 1; });
  ok(!/patches your kin up for free/.test(said('Bly')), 'and not again to somebody who has been');
  fresh(() => { g.G.been.wayhouse = 1; g.G.party[0].hp = 1; });
  ok(/bad way/.test(said('Bly')), 'but says it again when it matters');
  fresh(() => { g.G.been.wayhouse = 1; g.G.party[0].hp = 0; });
  ok(/is down/.test(said('Bly')), 'and harder when it matters more');

  // Isa points north. She was still pointing north at somebody walking back
  // DOWN from the top of the mountain.
  fresh();
  ok(/north of here/.test(said('Ranger Isa')), 'Isa sends you to the wood');
  fresh(() => { g.G.been.emberwood = 1; });
  ok(!/north of here/.test(said('Ranger Isa')), 'and stops once you have found it');
  fresh(() => { g.G.been.emberwood = 1; g.G.been.crown_hollow = 1; });
  ok(/Hollow/.test(said('Ranger Isa')), 'she knows how far you got');
  fresh(() => { g.G.been.emberwood = 1; g.G.been.crown_hollow = 1; g.G.flags.heardEnding = 1; });
  ok(/come back down/.test(said('Ranger Isa')), 'and that you came back down');

  // Ann warns you about a creature. The dex has always known which of the three
  // people she is talking to.
  fresh();
  ok(/Sweet little faces/.test(said('Sheller Ann')), 'Ann warns a stranger');
  fresh(() => g.seeMon('lanterneel'));
  ok(/met one/.test(said('Sheller Ann')), 'greets somebody who has met one');
  fresh(() => g.catchMon('lanterneel'));
  ok(/Look at your hand/.test(said('Sheller Ann')), 'and needles somebody carrying one');
}

// `been` is state, and state that does not survive a reload is a signpost that
// starts pointing again — the exact fault this pass exists to fix, one level
// down. Same shape as the Warden, who lived on module data the save never
// carried.
section('where you have been survives the walk back');
{
  const store = {};
  const a = loadGame(store);
  a.newGame(); a.G.dialogue = null;
  a.takeStarter('cindercub');
  a.enterMap('route_one', 9, 10, 'down');
  a.enterMap('emberwood', 8, 1, 'up');
  a.enterMap('route_one', 9, 10, 'down');
  ok(a.G.been.emberwood, 'walking into the wood is remembered');
  a.saveGame();

  const b = loadGame(store);
  ok(b.hasSave(), 'the run was written down');
  b.loadGame();
  ok(b.G.been.emberwood, 'and the wood is still remembered after a reload');
  ok(b.G.been.route_one, 'along with the road you reloaded onto');
  const isa = b.MAPS.route_one.npcs.find((n) => n.name === 'Ranger Isa');
  ok(!/north of here/.test(b.talkLines(isa).join(' ')),
    'so Isa does not send you somewhere you have already been');

  // And a new run has been nowhere, the same way it has caught nothing.
  b.newGame();
  eq(Object.keys(b.G.been).join(','), 'lab', 'a new run has been exactly where it is standing');
}

// Having a parting line is not the same as the line being worth reading. Each
// of the five reads a different thing the game already knew, and each one is
// driven both ways here — a static `after` would satisfy every check in the
// core suite and none of these.
section('the people you beat notice what you did next');
{
  const g = loadGame({});
  const find = (id) => {
    for (const m of Object.values(g.MAPS)) for (const n of (m.npcs || [])) if (n.id === id) return n;
    return null;
  };
  const after = (id, setup) => {
    g.newGame(); g.G.dialogue = null;
    g.takeStarter('cindercub');
    g.G.flags[id] = 1;
    if (setup) setup(g);
    const n = find(id);
    return (typeof n.after === 'function' ? n.after() : n.after).join(' ');
  };
  const differs = (id, label, a, b) => {
    ok(after(id, a) !== after(id, b), `${find(id).name} ${label}`);
  };

  // Pell's whole idea is that the grass teaches you things.
  ok(/does not care how many/.test(after('t_pell')), 'Pell shrugs at a fresh dex');
  ok(/taking some of the credit/.test(after('t_pell', (g) => g.DEX_ORDER.slice(0, 12).forEach((i) => g.catchMon(i)))),
    'and claims credit once the book fills');
  ok(/nothing left to teach/.test(after('t_pell', (g) => g.DEX_ORDER.forEach((i) => g.catchMon(i)))),
    'and gives up teaching when it is full');

  // Dorn guards a stretch that you then walk past for the rest of the game.
  ok(/still on this stretch/.test(after('t_dorn')), 'Dorn holds the line');
  differs('t_dorn', 'notices you went north', null, (g) => { g.G.been.emberwood = 1; });
  ok(/calling myself something else/.test(after('t_dorn', (g) => { g.G.been.emberwood = 1; g.G.been.crown_hollow = 1; })),
    'and gives up the bit entirely once you have been to the top');

  // The two Emberwood rangers, each noticing you beat the other. The game has
  // always known; neither of them was allowed to say so.
  differs('t_ivo', 'notices you beat Coll too', null, (g) => { g.G.flags.t_coll = 1; });
  differs('t_coll', 'notices you beat Ivo too', null, (g) => { g.G.flags.t_ivo = 1; });
  ok(/Coll/.test(after('t_ivo', (g) => { g.G.flags.t_coll = 1; })), 'and says his name');
  ok(/kid/.test(after('t_coll', (g) => { g.G.flags.t_ivo = 1; })), 'and he says the kid');

  // Mio got everything she has out of that water, and should know one of her
  // own when it is standing next to you.
  differs('t_mio', 'recognises a kin out of the water', null,
    (g) => g.G.party.push(g.mkMon('brookite', 18)));
  ok(/cousins/.test(after('t_mio', (g) => g.G.party.push(g.mkMon('brookite', 18)))),
    'and claims it as family');
}

// Rowan's one piece of navigation was gated on `dexCount(2) >= 8` — a PROXY for
// "far enough along", when the game has the actual fact one flag away. It was
// wrong in both directions at once.
section('Rowan points at the road that is actually open');
{
  const g = loadGame({});
  const ask = (setup) => {
    g.newGame(); g.G.dialogue = null;
    g.takeStarter('cindercub');
    g.G.dialogue = null;
    if (setup) setup(g);
    g.enterMap('lab', 5, 5, 'up'); g.G.mode = 'world'; g.G.dialogue = null;
    g.talkTo(g.MAPS.lab.npcs[0]);
    return g.G.dialogue.lines.join(' ');
  };
  const caught = (n) => (g) => g.DEX_ORDER.slice(0, n).forEach((i) => g.catchMon(i));

  ok(/paperwork/.test(ask(caught(3))), 'early on she just keeps the book');
  ok(/will not let you by/.test(ask(caught(9))),
    'with a full-ish book and the Warden in place, she names him as the obstacle');

  // The direction that was silent: the path is open and she never said so,
  // because the count had not reached eight.
  ok(/stepped aside/.test(ask((g) => { caught(3)(g); g.G.flags.t_hale = 1; })),
    'a thin dex and a beaten Warden still gets told the path opened');

  // And the direction that was wrong: sent past a man who is not there.
  const been = ask((g) => { caught(9)(g); g.G.flags.t_hale = 1; g.G.been.crown_hollow = 1; });
  ok(!/past the Warden/.test(been), 'somebody who has stood on the mountain is not sent past him again');
  ok(/air go thin/.test(been), 'they get pointed at what is actually still up there');
}

// The general form of that, which is what found the second one. Rowan was the
// instance I read; Wick had been saying "The Warden will not let either of us
// up" for the whole rest of the game, including on the way back down.
//
// Stating it took three goes, and the two failures are the interesting part.
// Reading `talkLines`/`after` off the fields cannot see Rowan at all — she is a
// `script` npc, so her words never touch either — and it reported the sweep
// clean on the exact fault it was written for. And "nobody may NAME a departed
// blocker" is the wrong claim: "Hale stepped aside for you" names him, and is
// the fix rather than the bug.
//
// What is actually wrong is a line that does not MOVE. If somebody mentions the
// blocker while the blocker is in the way, they have to say something different
// once he has stepped off it.
section('a line about a blocked path changes when the path opens');
{
  const g = loadGame({});
  const all = Object.entries(g.MAPS).flatMap(([mid, m]) => (m.npcs || []).map((n) => [mid, n]));
  const blockers = all.map(([, n]) => n).filter((n) => n.block);
  ok(blockers.length > 0, `somebody blocks a path (${blockers.map((n) => n.name).join(', ')})`);

  // Mid-game on purpose: far enough that everyone has been met, not so far that
  // the ending branches take over and nobody is talking about paths any more.
  const midGame = (g, open) => {
    g.newGame(); g.G.dialogue = null;
    g.takeStarter('cindercub');
    g.G.dialogue = null;
    ['t_wick1', 't_pell', 't_dorn', 't_ivo', 't_coll', 't_wick2', 't_mio'].forEach((f) => { g.G.flags[f] = 1; });
    g.DEX_ORDER.slice(0, 9).forEach((id) => g.catchMon(id));
    g.G.been.route_one = 1; g.G.been.emberwood = 1; g.G.been.stillmere = 1;
    if (open) blockers.forEach((b) => { g.G.flags[b.id] = 1; });
  };
  const askAll = (open) => {
    midGame(g, open);
    const out = new Map();
    for (const [mid, n] of all) {
      if (!g.npcActive(n)) continue;
      g.G.dialogue = null; g.G.screen = null; g.G.battle = null;
      g.enterMap(mid, n.x, n.y + 1, 'up');
      g.G.mode = 'world'; g.G.dialogue = null;
      g.talkTo(n);
      out.set(`${n.name} (${mid})`, (g.G.dialogue ? g.G.dialogue.lines : []).join(' '));
    }
    return out;
  };

  const shut = askAll(false);
  const open = askAll(true);
  ok(shut.size >= 10, `everybody still standing was asked (${shut.size})`);
  for (const [who, said] of shut) {
    ok(said.length > 0, `${who} says something at all`);
    for (const b of blockers) {
      const bare = b.name.replace(/^\w+\s+/, '');
      if (!new RegExp(`\\b(${b.name}|${bare}|Warden)\\b`).test(said)) continue;
      // They brought him up while he was in the way. They may not say the same
      // thing once he is not.
      ok(open.get(who) !== said,
        `${who} talks about ${b.name} and stops saying the same thing once he steps aside`);
    }
  }
}

// The two behind the counter in Hollowbrook Supply. Both of them talk about
// money and neither had ever looked at yours.
section('the shop notices what you can afford');
{
  const g = loadGame({});
  const npc = (name) => {
    for (const m of Object.values(g.MAPS)) for (const n of (m.npcs || [])) if (n.name === name) return n;
    return null;
  };
  const said = (name, setup) => {
    g.newGame(); g.G.dialogue = null;
    g.takeStarter('cindercub');
    if (setup) setup(g);
    return g.talkLines(npc(name)).join(' ');
  };

  ok(/no credit/.test(said('Bell', (g) => { g.G.money = 5000; })), 'Bell always states the rule');
  ok(/not got a single orb/.test(said('Bell', (g) => { g.G.bag = {}; })), 'and says when you have no orbs');
  ok(/short for a salve/.test(said('Bell', (g) => { g.G.money = 10; })), 'and when you cannot afford one');
  // The orb list is asked of ITEMS, not written out — a fourth orb must count.
  ok(!/bloomorb.*gleamorb.*prismorb/s.test(SRC.slice(SRC.indexOf("name: 'Bell'"), SRC.indexOf("name: 'Vane'"))),
    'and she counts orbs by kind rather than by a list of three names');

  ok(/short of the smallest one/.test(said('Vane', (g) => { g.G.gems = 0; })),
    'Vane says how far off the cheapest chest you are');
  ok(/nibble/.test(said('Vane', (g) => { g.G.gems = 300; })), 'gives the ladder to a newcomer who can buy');
  ok(/keep coming back/.test(said('Vane', (g) => { g.G.gems = 300; g.G.chestsOpened = 14; })),
    'and greets a regular as one');
  ok(/cover a Prism/.test(said('Vane', (g) => { g.G.gems = 5000; })), 'and notices when you can cover the top of it');
  // The floor comes off CHESTS rather than repeating a price.
  ok(/Math\.min\(\.\.\.CHEST_IDS/.test(SRC), 'reading the cheapest chest off the prices themselves');
}

// The first sixty seconds, driven beat by beat and counted rather than admired.
// Title to out-of-the-study was seventeen presses, eight of them a lecture — and
// one of those eight taught the hand to somebody holding no cards, because the
// place that teaches it properly was gated on `opt.wild` and the FIRST FIGHT IN
// THE GAME IS THE RIVAL.
section('the hand is taught where there is a hand');
{
  const g = withDeck(loadGame({}));
  g.setCtx(mkCtx());

  // The rival is a trainer, on the only road out of town, before any grass.
  const wick = g.MAPS.hollowbrook.npcs.find((n) => n.id === 't_wick1');
  ok(!!wick && !!wick.trainer, 'the first fight in the game is a trainer, not a wild kin');

  g.newGame(); g.G.dialogue = null;
  g.takeStarter('cindercub'); g.G.dialogue = null;
  g.startBattle({ foe: g.mkMon('dewdrip', 5), wild: false, npc: wick, team: [['dewdrip', 5]] });
  const first = g.G.battleMsg.lines.join(' ');
  ok(/Five cards, three energy/.test(first), 'a trainer fight teaches the hand');
  ok(/end the turn/.test(first), 'and how to end the turn');
  ok(!/reach for an orb/.test(first), 'and says nothing about orbs, there being nothing to catch');
  eq(g.G.flags.taughtHand, 1, 'and records that it has');

  // Once only.
  g.G.battle = null; g.G.battleMsg = null;
  g.startBattle({ foe: g.mkMon('zaplet', 4), wild: true });
  const wild = g.G.battleMsg.lines.join(' ');
  ok(!/Five cards, three energy/.test(wild), 'it is not taught twice');
  ok(/reach for an orb/.test(wild), 'and the orb lesson waits for something catchable');

  // The orb line still needs orbs to be about.
  const h = withDeck(loadGame({}));
  h.setCtx(mkCtx());
  h.newGame(); h.G.dialogue = null; h.takeStarter('cindercub'); h.G.dialogue = null;
  h.G.bag = {};
  h.startBattle({ foe: h.mkMon('zaplet', 4), wild: true });
  ok(!/reach for an orb/.test(h.G.battleMsg.lines.join(' ')), 'with an empty bag it is not mentioned');
  ok(/Five cards, three energy/.test(h.G.battleMsg.lines.join(' ')), 'but the hand still is');

  // And the study stops saying what the fight now says better, with the keys.
  ok(!/Each turn you get three energy and five cards/.test(SRC),
    'Rowan no longer recites the rule to somebody holding no cards');
  ok(/if \(!G\.flags\.taughtHand\)/.test(SRC), 'the hand lesson is gated on having been taught, not on the fight being wild');
  ok(/opt\.wild && !G\.flags\.taughtCatch/.test(SRC), 'and the orb lesson is still gated on wild');
}

done('emberkin_story');
