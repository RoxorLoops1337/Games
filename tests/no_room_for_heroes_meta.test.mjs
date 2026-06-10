// Battle report attribution + Ascension (NG+) mechanics.
//
//   node tests/no_room_for_heroes_meta.test.mjs   (or: npm run test:boss)
import { loadGame, harness } from './no_room_for_heroes_lib.mjs';

const A = loadGame(`freshGame,chooseBoss,battleReportHTML,difficulty,dealToHero,buildHeroFromSpec,
  trueVictory,saveRunes,loadRunes,awardRunes,
  get RUNES(){return RUNES;},get _roomDmgCtx(){return _roomDmgCtx;},set _roomDmgCtx(v){_roomDmgCtx=v;},
  get G(){return G;},set G(v){G=v;}`);
const t = harness('report/ascension');

A.G = A.freshGame('campaign'); A.chooseBoss('dragon');

// empty report on a fresh run
t.ok(A.battleReportHTML() === '', 'no report before any damage');

// room-context damage lands on the room; context-free damage lands on the boss bucket
const room = { type:'goblin', lvl:2, kills:3 };
A.G.rooms[0] = room;
const hero = { state:'walking', hp:500, maxHp:500, armor:0, x:100, y:330, traits:[], dodge:0 };
A._roomDmgCtx = room; A.dealToHero(hero, 50, 'HIT', 'full', 'phys', true); A._roomDmgCtx = null;
t.ok((room.dmg||0) > 0, 'room-context damage attributed to the room');
const abil0 = A.G.stats.abilDmg||0;
A.dealToHero(hero, 30, 'SMITE', 'full', 'phys', true);
t.ok((A.G.stats.abilDmg||0) > abil0, 'context-free damage attributed to boss bucket');
const html = A.battleReportHTML();
t.ok(html.includes('Goblin Den') && html.includes('Battle report'), 'report lists the room');

// ascension: difficulty scales +18% per crown, campaign only
A.G.levelIdx = 19;                       // some mid-campaign level
A.RUNES.asc = 0; const d0 = A.difficulty();
A.RUNES.asc = 2; const d2 = A.difficulty();
t.ok(Math.abs(d2/d0 - 1.36) < 1e-9, 'asc 2 → ×1.36 campaign difficulty');
A.G.mode = 'endless'; A.G.survived = 0;
const e2 = A.difficulty(); A.RUNES.asc = 0; const e0 = A.difficulty();
t.ok(Math.abs(e2 - e0) < 1e-9, 'ascension does NOT touch endless difficulty');

// ascension persists through the rune save
A.RUNES.asc = 3; A.RUNES.best = 123; A.saveRunes(); A.loadRunes();
t.ok(A.RUNES.asc === 3 && A.RUNES.best === 123, 'asc + endless best survive save/load');

// trueVictory grants a crown (capped at 9)
A.G = A.freshGame('campaign'); A.chooseBoss('dragon'); A.G.mode='campaign';
A.RUNES.asc = 3;
A.trueVictory();
t.ok(A.RUNES.asc === 4, 'trueVictory raises ascension');
t.ok(A.G.phase === 'win', 'victory phase reached');

t.done();
