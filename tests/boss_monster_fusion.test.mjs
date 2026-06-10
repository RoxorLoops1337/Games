// Fusion pair identities + room demolish + menu screens.
//
//   node tests/boss_monster_fusion.test.mjs   (or: npm run test:boss)
import { loadGame, harness } from './boss_monster_lib.mjs';

const A = loadGame(`freshGame,buildCells,synergyInfo,doDeleteRoom,askDeleteRoom,
  openTitle,gotoMenu,openPlay,openStronghold,openLibrary,openCodex,openUnlocks,showHelp,
  pickSlot,describeRoom,chooseBoss,ROOMS,SYNERGY_PAIRS,
  get G(){return G;},set G(v){G=v;}`);
const t = harness('fusion/demolish/menu');

// --- synergyInfo returns the named monster pairs (keys are sorted parts) ---
const gi = p => A.synergyInfo(p);
t.ok(gi(['goblin','skeleton']).name === 'Grave Horde' && gi(['goblin','skeleton']).fx === 'feedBoth', 'goblin+skeleton → Grave Horde feedBoth');
t.ok(gi(['skeleton','goblin']).name === 'Grave Horde', 'order-independent lookup');
t.ok(gi(['warden','ogre']).fx === 'tauntBoth', 'ogre+warden → Gatehouse tauntBoth');
t.ok(gi(['slime','ogre']).fx === 'splitBoth', 'ogre+slime → Sludge Colossus splitBoth');
t.ok(gi(['ogre','skeleton']).m === 1.25, 'ogre+skeleton → Bone Colossus ×1.25');
t.ok(gi(['goblin','ogre']).name === 'Pack' && gi(['goblin','ogre']).m === 1, 'unnamed monster pair stays Pack ×1.0');

// --- buildCells applies the fx hooks to the guards ---
A.G = A.freshGame('campaign');
A.chooseBoss('dragon');                                              // build phase always has a boss
A.G.slots = 5;                                                       // room for all four test cells
A.G.rooms[0] = { type:'goblin', part2:'skeleton', lvl:1, kills:10 };  // Grave Horde, well fed
A.G.rooms[1] = { type:'ogre', part2:'warden', lvl:1, kills:0 };      // Gatehouse
A.G.rooms[2] = { type:'ogre', part2:'slime', lvl:1, kills:0 };       // Sludge Colossus
A.G.rooms[3] = { type:'goblin', part2:'skeleton', lvl:1, kills:0 };  // Grave Horde, unfed
A.buildCells();
const c = A.G.cells;
// feedBoth: the SECOND guard (skeleton, which doesn't feed on its own) must
// also grow with kills — compare fed vs unfed rooms
t.ok(c[0].mon2 && c[3].mon2 && c[0].mon2.maxHp > c[3].mon2.maxHp, 'Grave Horde feeds the non-feeding guard too');
t.ok(c[0].mon.maxHp > c[3].mon.maxHp, 'Grave Horde feeds the first guard');
t.ok(c[1].warden === true, 'Gatehouse: cell strikes the whole stalled party');
t.ok(c[2].mon.split === true && c[2].mon2.split === true, 'Sludge Colossus: both guards split');
t.ok(!c[3].warden, 'Grave Horde does not taunt');

// --- 3-part stacking: third guard at 85%, identity from best named pair ---
A.G.rooms[4] = { type:'ogre', part2:'warden', part3:'skeleton', lvl:1, kills:0 };
A.buildCells();
const c4 = A.G.cells[4];
t.ok(!!c4.mon3, 'third guard exists');
t.ok(c4.warden === true, 'Gatehouse identity survives a 3rd part');
// skeleton is 3rd: base 32 → with Gatehouse ×1.10 and 0.85 third-guard factor
t.ok(c4.mon3.maxHp < Math.round(32*0.9*1.10) , 'third guard joins below full strength');
t.ok(A.synergyInfo(['ogre','warden','skeleton']).name === 'Bone Colossus', 'BEST named pair wins in a trio (×1.25 beats ×1.10)');
t.ok(A.synergyInfo(['warden','slime','spike']).name === 'Pinned Down', 'pairless trio falls back by kinds');

// --- room inspect shows the pair identity + demolish button in build ---
A.G.phase = 'build';
const html = A.describeRoom(A.G.rooms[0]);
t.ok(html.includes('Grave Horde'), 'inspect shows the pair name');
t.ok(html.includes('feeds BOTH guards'), 'inspect shows the pair twist');
t.ok(html.includes('askDeleteRoom(0)'), 'inspect offers Demolish in build phase');

// --- demolish flow: ask is non-destructive, do clears the slot ---
A.askDeleteRoom(0);
t.ok(A.G.rooms[0] != null, 'asking does not delete');
A.doDeleteRoom(0);
t.ok(A.G.rooms[0] == null, 'confirming deletes the room');
A.doDeleteRoom(0);                                  // idempotent on empty slot
t.ok(A.G.rooms[0] == null, 'double-confirm is harmless');
A.G.phase = 'run'; A.G.rooms[1] = { type:'ogre', part2:'warden', lvl:1, kills:0 };
A.doDeleteRoom(1);
t.ok(A.G.rooms[1] != null, 'demolish refuses outside the build phase');

// --- menu screens render without throwing ---
let threw = '';
try {
  A.openTitle(); A.gotoMenu(); A.pickSlot(1);
  A.openPlay(); A.openStronghold(); A.openLibrary();
  A.openCodex(); A.openUnlocks(); A.showHelp();
} catch (e) { threw = e.message; }
t.ok(threw === '', 'all menu screens render clean' + (threw ? ' — ' + threw : ''));

t.done();
