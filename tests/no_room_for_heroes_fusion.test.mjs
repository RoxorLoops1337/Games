// Room model: 5-slot mix-and-match rooms (≤2 traps), trap stacking, monster
// copies, gold slot-upgrades, the build menu + demolish flow.
//
//   node tests/no_room_for_heroes_fusion.test.mjs   (or: npm run test:boss)
import { loadGame, harness } from './no_room_for_heroes_lib.mjs';

const A = loadGame(`freshGame,buildCells,doDeleteRoom,askDeleteRoom,placeCard,makeRoom,
  upgradeRoomGold,roomTrapUnits,roomMonUnits,roomFreeSlots,maxLevel,roomUpgradeCost,vetRank,
  MAX_SLOTS,MAX_TRAPS,describeRoom,chooseBoss,feedMul,ROOMS,
  openTitle,gotoMenu,openPlay,openStronghold,openLibrary,openCodex,openUnlocks,showHelp,pickSlot,
  get G(){return G;},set G(v){G=v;}`);
const t = harness('rooms (slots/stacking/menu)');

function freshBuild(){ A.G=A.freshGame('campaign'); A.chooseBoss('dragon'); A.G.slots=5; A.G.phase='build'; A.G.gold=999999; }
function place(type,lvl,idx){ A.G.hand=[{type,lvl:lvl||1}]; return A.placeCard(0, idx); }

// --- a fresh room starts with ONE slot ---
freshBuild();
place('skeleton',1,0);
let r=A.G.rooms[0];
t.ok(r && r.units.length===1 && r.cap===1, 'placing a card builds a 1-unit room (cap 1)');
t.ok(place('skeleton',1,0)===false, 'a 2nd unit is refused — the room is full at cap 1');
t.ok(r.units.length===1, 'the refused placement added nothing');

// --- gold upgrade adds a slot; monsters STACK as independent copies ---
A.G.gold=A.roomUpgradeCost(r); A.upgradeRoomGold(0);
t.ok(r.cap===2, 'gold upgrade adds one slot');
place('skeleton',1,0);
t.ok(r.units.length===2 && A.roomMonUnits(r).length===2, 'a 2nd Bone Pit stacks as a SEPARATE guard (no merge)');
A.G.gold=999999; while(r.cap<A.MAX_SLOTS) A.upgradeRoomGold(0);
while(r.units.length<A.MAX_SLOTS) place('skeleton',1,0);
t.ok(r.units.length===5 && A.roomMonUnits(r).length===5, 'five Bone Pits live in one room');
t.ok(place('skeleton',1,0)===false, 'a 6th unit is refused at the 5-slot cap');

// --- buildCells turns the stack into 5 separate guards ---
A.buildCells();
let cell=A.G.cells[0];
t.ok(cell.guards && cell.guards.length===5, 'buildCells makes one guard per monster unit');
t.ok(cell.mon===cell.guards[0] && cell.guards.every(g=>g.alive), 'front guard is active; every guard alive');
t.ok(cell.guards.every(g=>g.type==='skeleton'), 'each guard remembers its type');

// --- TRAPS: same trap stacks into a LEVEL (one unit); max level then refuses ---
freshBuild();
place('spike',1,0); const tr=A.G.rooms[0];
t.ok(A.roomTrapUnits(tr).length===1 && tr.units[0].lvl===1, 'first trap is level 1');
place('spike',1,0);
t.ok(tr.units.length===1 && A.roomTrapUnits(tr)[0].lvl===2, 'same trap → level 2, still one unit (no new slot used)');
while(A.roomTrapUnits(tr)[0].lvl<A.maxLevel()) place('spike',1,0);
t.ok(A.roomTrapUnits(tr)[0].lvl===A.maxLevel(), 'trap reaches max level ('+A.maxLevel()+')');
t.ok(place('spike',1,0)===false, 'a maxed trap refuses further stacking');

// --- at most TWO traps per room ---
A.G.gold=999999; A.upgradeRoomGold(0);                 // cap 2
t.ok(place('flame',1,0)!==false && A.roomTrapUnits(tr).length===2, 'a 2nd trap TYPE fills the new slot');
A.upgradeRoomGold(0);                                  // cap 3
t.ok(place('venom',1,0)===false, 'a 3rd trap is refused — max '+A.MAX_TRAPS+' traps per room');

// --- mix and match: 2 traps + 3 monsters in one 5-slot room ---
freshBuild();
place('spike',1,2); A.G.gold=999999;
while(A.G.rooms[2].cap<5) A.upgradeRoomGold(2);
place('flame',1,2); place('skeleton',1,2); place('ogre',1,2); place('warden',1,2);
const rm=A.G.rooms[2];
t.ok(rm.units.length===5 && A.roomTrapUnits(rm).length===2 && A.roomMonUnits(rm).length===3, '2 traps + 3 monsters share one room');
A.buildCells();
const cm=A.G.cells[2];
t.ok(cm.traps.length===2 && cm.guards.length===3, 'buildCells splits the mixed room into 2 traps + 3 guards');
t.ok(cm.traps.find(x=>x.type==='spike').lvl===1, 'a trap carries its own level into the cell');
t.ok(cm.warden===true, 'a Warden unit still taunts the whole party');

// --- veteran rank still rides on room kills ---
freshBuild(); place('skeleton',1,0); A.G.rooms[0].kills=12;
t.ok(A.vetRank(A.G.rooms[0])>=2, 'room veteran rank still derives from kills');

// --- build menu: Upgrade(+slot) / Demolish / Info, full readout behind Info ---
A.G.phase='build';
const menu = A.describeRoom(A.G.rooms[0]);
t.ok(menu.includes('upgradeRoomGold(0)'), 'menu offers the slot upgrade');
t.ok(menu.includes('askDeleteRoom(0)'), 'menu offers Demolish');
t.ok(menu.includes('showRoomDetail(0)'), 'menu offers an Info button');
const html = A.describeRoom(A.G.rooms[0], true);
t.ok(html.includes('slots'), 'Info detail shows slot usage');
t.ok(html.includes('askDeleteRoom(0)'), 'Info detail still offers Demolish');
t.ok(!html.includes('showRoomDetail(0)'), 'Info detail drops the now-redundant Info button');

// --- demolish flow: ask is non-destructive, do clears the slot ---
A.askDeleteRoom(0);
t.ok(A.G.rooms[0] != null, 'asking does not delete');
A.doDeleteRoom(0);
t.ok(A.G.rooms[0] == null, 'confirming deletes the room');
A.doDeleteRoom(0);                                  // idempotent on empty slot
t.ok(A.G.rooms[0] == null, 'double-confirm is harmless');
A.G.phase = 'run'; A.G.rooms[1] = A.makeRoom('ogre', 1);
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

// --- "Fed" growth curve: uncapped, monotonic, with diminishing returns ---
const fm = A.feedMul;
t.ok(fm(0) === 1, 'no kills → no bonus (×1)');
t.ok(Math.abs((fm(1) - 1) - 0.03) < 0.005, 'first corpse ≈ +3% (early feel preserved)');
t.ok(fm(10) > fm(5) && fm(100) > fm(50) && fm(1000) > fm(500), 'monotonic increase — never caps');
t.ok((fm(20) - fm(10)) < (fm(10) - fm(0)), 'diminishing returns (curve bends)');
t.ok(fm(100) < 2.0 && fm(100) > 1.5, `tamed late game: 100 kills → ×${fm(100).toFixed(2)} (was ×4.0)`);

t.done();
