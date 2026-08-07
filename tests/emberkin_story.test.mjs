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
import { loadGame, mkCtx, autoFight, ok, eq, done, section } from './emberkin_lib.mjs';

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
ok(!hale.gone, 'the Warden is still standing in the corridor');
ok(!EK.passable(EK.MAPS.emberwood, hale.x, hale.y, hale.y + 1), 'and blocks it');
talkAndFight('emberwood', 't_hale', 30);
eq(G.flags.t_hale, 1, 'the Warden is beaten');
ok(hale.gone, 'and steps off the path');
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
talkAndFight('crown_hollow', 't_wick3', 38);
eq(G.flags.t_wick3, 1, 'the last rival battle is won');

EK.enterMap('lab', rowan.x, rowan.y + 1, 'up');
G.mode = 'world';
EK.rowanScript();
ok(!!G.dialogue, 'Rowan has something to say');
ok(G.dialogue.lines.join(' ').includes('So it went with you'), 'and it is the ending, not the briefing');
clear();

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
  const seen = new Set(), lines = [];
  for (const id of ['t_wick1', 't_pell', 't_dorn', 't_ivo', 't_wick2', 't_coll', 't_hale', 't_mio']) {
    g.G.flags[id] = 1;
    const a = g.nextAim();
    lines.push(a);
    ok(!seen.has(a), `the aim moved on after ${id} — "${a}"`);
    seen.add(a);
  }
  g.G.flags.t_wick3 = 1;
  ok(/shrine/i.test(g.nextAim()), `with every trainer down it points at the shrine — "${g.nextAim()}"`);
  g.G.flags.beatVespyr = 1;
  ok(/unfound|valley is yours/.test(g.nextAim()), `and after that at the dex — "${g.nextAim()}"`);
}

done('emberkin_story');
