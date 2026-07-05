// Room model: 5-slot mix-and-match rooms (≤2 traps), trap stacking, monster
// copies, gold slot-upgrades, the build menu + demolish flow.
//
//   node tests/no_room_for_heroes_fusion.test.mjs   (or: npm run test:boss)
import { loadGame, harness } from './no_room_for_heroes_lib.mjs';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));

const A = loadGame(`freshGame,buildCells,doDeleteRoom,askDeleteRoom,placeCard,makeRoom,
  roomSynergy,synergyFromTypes,synergyHint,synergyHintLine,describeCard,SYNERGIES,SYNERGY_TYPES,spawnDenGoblinsForWave,cardWeight,pickCardWeighted,describeGear,
  upgradeRoomGold,roomTrapUnits,roomMonUnits,roomFreeSlots,maxLevel,roomUpgradeCost,vetRank,
  MAX_SLOTS,MAX_TRAPS,describeRoom,chooseBoss,feedMul,ROOMS,GOBLIN_DEN_CAP,
  useBossPotion,potionCap,POTION_HEAL,POTION_GOLD,addRelic,buyMerchantPotion,rollMerchant,doShopping,
  gotoRelicChoice,rollRelicChoices,RELICS,MERCHANT_PRICE,TIER_ORDER,
  openTitle,gotoMenu,openPlay,openStronghold,openLibrary,openCodex,openUnlocks,showHelp,pickSlot,
  get G(){return G;},set G(v){G=v;},get RB(){return RB;}`);
const t = harness('rooms (slots/stacking/menu)');

function freshBuild(){ A.G=A.freshGame('campaign'); A.chooseBoss('dragon'); A.G.slots=5; A.G.phase='build'; A.G.gold=999999; }
function place(type,lvl,idx){ A.G.hand=[{type,lvl:lvl||1}]; return A.placeCard(0, idx); }

// --- a fresh room starts with ONE slot ---
freshBuild();
place('skeleton',1,0);
let r=A.G.rooms[0];
t.ok(r && r.units.length===1 && r.cap===1, 'placing a card builds a 1-unit room (cap 1)');
// full room + the SAME monster type → the copy trains that guard a level (no new slot)
t.ok(place('skeleton',1,0)===true && r.units.length===1 && r.units[0].lvl===2,
  'a same-type monster on a FULL room trains the guard to Lv 2 instead of refusing');
t.ok(place('ogre',1,0)===false && r.units.length===1, 'a DIFFERENT monster is still refused at cap 1');

// --- gold upgrade adds a slot; monsters STACK as independent copies ---
A.G.gold=A.roomUpgradeCost(r); A.upgradeRoomGold(0);
t.ok(r.cap===2, 'gold upgrade adds one slot');
place('skeleton',1,0);
t.ok(r.units.length===2 && A.roomMonUnits(r).length===2, 'a 2nd Bone Pit stacks as a SEPARATE guard (no merge)');
A.G.gold=999999; while(r.cap<A.MAX_SLOTS) A.upgradeRoomGold(0);
while(r.units.length<A.MAX_SLOTS) place('skeleton',1,0);
t.ok(r.units.length===5 && A.roomMonUnits(r).length===5, 'five Bone Pits live in one room');
const lv6=r.units[0].lvl;
t.ok(place('skeleton',1,0)===true && r.units.length===5 && r.units[0].lvl===lv6+1,
  'a 6th copy at the 5-slot cap trains a level instead of refusing');
t.ok(/Lv 3\//.test(A.describeRoom(r,true)), 'the room inspector shows the trained guard level');

// --- buildCells turns the stack into 5 separate guards ---
A.buildCells();
let cell=A.G.cells[0];
t.ok(cell.guards && cell.guards.length===5, 'buildCells makes one guard per monster unit');
t.ok(cell.mon===cell.guards[0] && cell.guards.every(g=>g.alive), 'front guard is active; every guard alive');
t.ok(cell.guards.every(g=>g.type==='skeleton'), 'each guard remembers its type');
t.ok(cell.guards[0].hp>cell.guards[1].hp, 'the trained (higher-Lv) guard is tougher than its fresh packmates');

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

// --- 🔯 Runestone (amp trap): stacking is a no-op, so the stack is REFUSED ---
freshBuild();
place('runestone',1,1); const rs=A.G.rooms[1];
A.G.gold=999999; A.upgradeRoomGold(1);                 // free slot available — still refused
t.ok(place('runestone',1,1)===false, 'a 2nd Runestone on the same room is refused (lvl++ would change nothing)');
t.ok(rs.units.length===1 && rs.units[0].lvl===1, 'the refused Runestone changed nothing');
t.ok(place('runestone',1,0)!==false, 'the Runestone still places fine in ANOTHER room');

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

// --- shop upgrades by stacking shop cards (and never shares a room) ---
freshBuild();
place('shop',1,0); const sh=A.G.rooms[0];
t.ok(sh && sh.units.length===1 && sh.units[0].kind==='shop' && sh.cap===1, 'a Shop builds as its own 1-slot room');
t.ok(place('spike',1,0)===false, 'a trap can\'t share a Shop room');
t.ok(place('shop',1,0)!==false && A.G.rooms[0].cap===2, 'dropping a Shop card on a Shop upgrades its tier');
A.G.gold=999999; place('shop',1,0); place('shop',1,0);
t.ok(A.G.rooms[0].cap===4, 'stacking more Shop cards keeps raising the tier');

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

// --- 🧪 throne potions: held heals that replaced the gold "Repair" button ---
A.G=A.freshGame('campaign'); A.chooseBoss('dragon');
t.ok(A.potionCap()===3 && A.G.boss.potions===3, 'a fresh boss starts with a full 3-potion belt');
A.G.boss.hp=Math.round(A.G.boss.maxHp*0.4);
const lowHp=A.G.boss.hp, expHeal=Math.ceil(A.G.boss.maxHp*A.POTION_HEAL);
A.useBossPotion();
t.ok(A.G.boss.potions===2, 'quaffing a potion spends one slot');
t.ok(A.G.boss.hp===lowHp+expHeal, 'the potion healed '+Math.round(A.POTION_HEAL*100)+'% of max HP');
A.G.boss.hp=A.G.boss.maxHp; A.useBossPotion();
t.ok(A.G.boss.potions===2, 'a full-HP throne refuses to waste a potion');
A.G.boss.potions=0; A.G.boss.hp=10; A.useBossPotion();
t.ok(A.G.boss.hp===10, 'an empty belt cannot heal');

// the Devourer's gullet (+2) and the Alchemist's Belt relic (+2) raise the cap to 5
A.G=A.freshGame('campaign'); A.chooseBoss('ogre');
t.ok(A.potionCap()===5 && A.G.boss.potions===5, 'the Devourer carries a 5-potion belt');
A.G=A.freshGame('campaign'); A.chooseBoss('dragon'); A.addRelic('rFlask');
t.ok(A.potionCap()===5, "the Alchemist's Belt relic raises the cap to 5");

// the traveling merchant restocks potions for plain GOLD (not dread)
A.G=A.freshGame('campaign'); A.chooseBoss('dragon');
let mp=null; for(let i=0;i<50 && !mp;i++){ const m=A.rollMerchant(); if(m.visiting) mp=m.potion; }
t.ok(mp && mp.price>0, 'a visiting merchant always offers a gold-priced potion');
A.G.boss.potions=1; A.G.gold=A.POTION_GOLD*5; A.G.merchant={visiting:true,stock:[],potion:{price:A.POTION_GOLD}};
const gold0=A.G.gold; A.buyMerchantPotion();
t.ok(A.G.boss.potions===2 && A.G.gold===gold0-A.POTION_GOLD, 'buying a potion costs gold and fills a belt slot');

// --- "Relic Unearthed" must NOT show an unpickable screen once every relic is owned ---
A.G=A.freshGame('campaign'); A.chooseBoss('dragon');
A.G.relics=Object.keys(A.RELICS);                 // own them all
let relicSkipped=false; A.gotoRelicChoice('Relic Unearthed','test',()=>{ relicSkipped=true; });
t.ok(relicSkipped && A.G.phase!=='relic', 'every relic owned → the relic draft is skipped (no soft-lock)');
A.G.relics=[]; A.gotoRelicChoice('Relic Unearthed','test',()=>{});
t.ok(A.G.phase==='relic' && (A.G._relicChoices||[]).length>0, 'with relics left, the draft still offers choices');

// --- dread-shop relic prices are steep and scale up by tier ---
const mpz=A.TIER_ORDER.map(tt=>A.MERCHANT_PRICE[tt]);
t.ok(mpz.every((v,i)=>i===0||v>mpz[i-1]), 'merchant relic price rises with every tier');
t.ok(A.MERCHANT_PRICE.mythic>=200 && A.MERCHANT_PRICE.mythic/A.MERCHANT_PRICE.common>=12,
  'top-tier relics are a major dread sink (steep high-tier scaling)');

// --- "Fed" growth curve: uncapped, monotonic, with diminishing returns ---
const fm = A.feedMul;
t.ok(fm(0) === 1, 'no kills → no bonus (×1)');
t.ok(Math.abs((fm(1) - 1) - 0.03) < 0.005, 'first corpse ≈ +3% (early feel preserved)');
t.ok(fm(10) > fm(5) && fm(100) > fm(50) && fm(1000) > fm(500), 'monotonic increase — never caps');
t.ok((fm(20) - fm(10)) < (fm(10) - fm(0)), 'diminishing returns (curve bends)');
t.ok(fm(100) < 2.0 && fm(100) > 1.5, `tamed late game: 100 kills → ×${fm(100).toFixed(2)} (was ×4.0)`);

// --- 🔗 TRAP SYNERGIES: a curated trap pair → a themed room + damage amp + rider ---
const synKeys = Object.keys(A.SYNERGIES);
t.ok(synKeys.length === 35, `all 35 curated synergy pairs are defined (${synKeys.length})`);
let badSyn = '';
for(const k of synKeys){
  const s = A.SYNERGIES[k], ids = k.split('+');
  if(ids.slice().sort().join('+') !== k) badSyn = k+' key not canonical';
  else if(!A.SYNERGY_TYPES[s.type]) badSyn = k+' unknown type';
  else if(ids.some(id => !A.ROOMS[id] || A.ROOMS[id].kind !== 'trap')) badSyn = k+' non-trap id';
  else if(!existsSync(join(here, '..', 'no_room_for_heroes', 'rooms', 'synergies', s.img + '.png'))) badSyn = k+' art missing';
  if(badSyn) break;
}
t.ok(!badSyn, 'every synergy: canonical key, known type, real trap ids, shipped art' + (badSyn ? ' — '+badSyn : ''));
t.ok(Object.values(A.SYNERGY_TYPES).every(v => v.amp > 0 && v.name && v.col && v.desc), 'every synergy type has an amp + name + colour + blurb');

// detection: a real pair synergizes; dupes / undefined pairs / lone traps do not
t.ok(A.roomSynergy({units:[{type:'flame',kind:'trap'},{type:'oil',kind:'trap'}]})?.type === 'fire', 'Flame Jet + Oil Slick → fire synergy');
t.ok(A.roomSynergy({units:[{type:'flame',kind:'trap'},{type:'flame',kind:'trap'}]}) === null, 'the same trap twice is not a synergy');
t.ok(A.roomSynergy({units:[{type:'spike',kind:'trap'},{type:'flame',kind:'trap'}]}) === null, 'an undefined pair is not a synergy');
t.ok(A.roomSynergy({units:[{type:'flame',kind:'trap'},{type:'oil',kind:'trap'},{type:'runestone',kind:'trap'}]})?.type === 'fire', 'a Runestone (amp-only) does not break the pair');

// 🔗 synergy badge: a card that would COMPLETE a pair in an existing room says so
A.G = A.freshGame('campaign'); A.chooseBoss('dragon'); A.G.slots = 2; A.G.phase = 'build';
A.G.rooms = [{ type:'flame', cap:2, kills:0, units:[{type:'flame',kind:'trap',lvl:1}] }, null];
const sHint = A.synergyHint('oil');
t.ok(sHint && sHint.room === 0 && sHint.syn.type === 'fire', 'an Oil card reports it would form Inferno with room 1');
t.ok(/Forms <b>Inferno<\/b> with room 1/.test(A.synergyHintLine('oil')), 'the badge line names the synergy + room');
t.ok(A.describeCard({type:'oil',lvl:1}).includes('Forms <b>Inferno</b> with room 1'), 'the hand-card tooltip carries the badge');
t.ok(A.synergyHint('spike') === null, 'a non-pairing trap gets no badge (spike+flame is not curated)');
t.ok(A.synergyHint('skeleton') === null && A.synergyHint('runestone') === null, 'monsters and amp traps never badge');
A.G.rooms[0].cap = 1;
t.ok(A.synergyHint('oil') === null, 'a room with no free slot is not offered');
A.G.rooms[0].cap = 2; A.G.rooms[0].units.push({type:'oil',kind:'trap',lvl:1});
t.ok(A.synergyHint('venom') === null, 'a room whose synergy already formed is not offered again');

// buildCells caches the type + a >1 damage amp on the cell
A.G = A.freshGame('campaign'); A.chooseBoss('dragon'); A.G.slots = 1;
A.G.rooms = [{ type:'flame', cap:2, kills:0, units:[{type:'flame',kind:'trap',lvl:1},{type:'oil',kind:'trap',lvl:1}] }];
A.buildCells();
const c0 = A.G.cells[0];
t.ok(c0.synType === 'fire' && c0.syn === 1 + A.SYNERGY_TYPES.fire.amp, `a synergy room caches synType + the damage amp (syn=${c0.syn})`);
// a non-synergy 2-trap room stays neutral
A.G.rooms = [{ type:'spike', cap:2, kills:0, units:[{type:'spike',kind:'trap',lvl:1},{type:'skeleton',kind:'monster',lvl:1}] }];
A.buildCells();
t.ok(!A.G.cells[0].synType && (A.G.cells[0].syn||1) === 1, 'a non-pair room has no synergy amp');

// --- 👺 a Goblin Den works even MIXED with a guard: goblins still march, the guard stays ---
A.G = A.freshGame('campaign'); A.chooseBoss('dragon'); A.G.slots = 1;
A.G.rooms = [{ type:'goblin', cap:2, kills:0, units:[{type:'goblin',kind:'monster',lvl:1},{type:'ogre',kind:'monster',lvl:1}] }];
A.buildCells();
const den = A.G.cells[0];
t.ok(den.spawner === 'goblin', 'a den mixed with an ogre still spawns goblins');
t.ok(den.guards.length === 1 && den.guards[0].type === 'ogre', 'the ogre stays a stationary guard; the goblin is NOT a guard');
A.spawnDenGoblinsForWave();
t.ok((A.G.minions||[]).some(m => m.type==='goblin' && m.home===0), 'the mixed den marches goblins out for the wave');
// the inspector shows BOTH the den and the guard
const desc = A.describeRoom(A.G.rooms[0], true);
t.ok(/Goblins \(spawner\)/.test(desc) && /Ogre Lair/.test(desc), 'the room inspector lists both the goblin den and the ogre guard');

// --- 🎲 draft variety: recently-offered cards are down-weighted so the same few don't recur ---
A.G = A.freshGame('campaign');
const w0 = A.cardWeight('spike', 5);
A.G._recentOffers = ['spike'];
t.ok(Math.abs(A.cardWeight('spike', 5) - w0*0.3) < 0.001, 'a recently-offered card is down-weighted ×0.3 (fresher next draft)');
A.G._recentOffers = ['flame','frost'];
t.ok(A.cardWeight('spike', 5) === w0, 'a card NOT recently offered keeps full weight');
// over many rolls, a fresh card is offered far more than a recently-shown one of the same tier
A.G._recentOffers = ['spike'];
let spikes = 0, arrows = 0;
for(let i=0;i<3000;i++){ const t2 = A.pickCardWeighted(['spike','arrow'], 5); if(t2==='spike') spikes++; else arrows++; }
t.ok(arrows > spikes*1.8, `the recently-shown common is picked much less (spike ${spikes} vs arrow ${arrows})`);

// --- 💎 gear info card (hover on the arena + in the chest) ---
const sword = { k:'blade', t:'rare', v:0 };
const floorTxt = A.describeGear(sword, true), chestTxt = A.describeGear(sword, false);
t.ok(/Blade/.test(floorTxt) && /Tap to collect/.test(floorTxt), 'floor-loot gear card names the piece + collect hint');
t.ok(/Drag onto a monster/.test(chestTxt) && !/Tap to collect/.test(chestTxt), 'chest gear card shows the equip/merge hint instead');
t.ok(/Blade/.test(chestTxt) && /Rare/.test(chestTxt), 'both cards show the piece name and tier');

// --- ⚖️ rarity → power ladder: commons are the weak baseline; rares/epics hit harder ---
const dps = k => A.ROOMS[k].dmg / A.ROOMS[k].rate;
t.ok(dps('spike') < dps('gallows') && dps('gallows') < dps('maul'), `trap dps climbs common→rare→epic (spike ${dps('spike').toFixed(1)} < gallows ${dps('gallows').toFixed(1)} < maul ${dps('maul').toFixed(1)})`);
t.ok(A.ROOMS.spike.dmg <= 5 && A.ROOMS.arrow.dmg <= 4, 'common traps are the weak baseline');
t.ok(A.ROOMS.maul.dmg >= 18 && A.ROOMS.bombard.dmg >= 18, 'epic traps hit hard (a rare/epic feels good to get)');
t.ok(A.ROOMS.goblin.hp < A.ROOMS.ogre.hp && A.ROOMS.skeleton.hp < A.ROOMS.ogre.hp, 'common monsters are frailer than the tougher tiers');
t.ok(A.ROOMS.orc.atk > A.ROOMS.skeleton.atk && A.ROOMS.warden.hp > A.ROOMS.skeleton.hp, 'rare monsters out-stat the commons');
// tier retune: the ogre is a TRUE wall now (it used to sit under the rare warden)
t.ok(A.ROOMS.ogre.hp===92 && A.ROOMS.ogre.atk===26, `ogre retuned to a real late-game wall (${A.ROOMS.ogre.hp} HP / ${A.ROOMS.ogre.atk} atk)`);
t.ok(A.ROOMS.ogre.hp > A.ROOMS.warden.hp, 'the special-tier ogre out-tanks the rare warden');
t.ok(A.ROOMS.dragon.breath.burn===2, 'drakeling breath stacks +2 burn per puff (was 3 — whole-room burn was outpacing its tier)');
t.ok(A.GOBLIN_DEN_CAP===12, 'goblin den banks at most 12 veterans (was 20)');

// --- 📜 Deed to the Deep is a dead pick in Endless (slot cap is ∞ there) — never offered ---
A.G = A.freshGame('endless'); A.chooseBoss('dragon');
A.G.relics = Object.keys(A.RELICS).filter(id => id !== 'rDeed');   // only the Deed left in the vault
t.ok(A.rollRelicChoices(3).length === 0, 'Endless never offers the Deed (its +slot cap does nothing there)');
A.G = A.freshGame('campaign'); A.chooseBoss('dragon');
A.G.relics = Object.keys(A.RELICS).filter(id => id !== 'rDeed');
t.ok(A.rollRelicChoices(3).includes('rDeed'), 'Campaign still offers the Deed (where it works)');

// --- ⛏️ Excavator rune: "+5% synergy" now genuinely sharpens synergy rooms ---
A.G = A.freshGame('campaign'); A.chooseBoss('dragon'); A.G.slots = 1;
A.G.rooms = [{ type:'flame', cap:2, kills:0, units:[{type:'flame',kind:'trap',lvl:1},{type:'oil',kind:'trap',lvl:1}] }];
A.RB.synergy = 0.05; A.buildCells();
t.ok(Math.abs(A.G.cells[0].syn - (1 + A.SYNERGY_TYPES.fire.amp + 0.05)) < 1e-9, 'RB.synergy folds into a synergy room\'s amp (Excavator does what it says)');
A.RB.synergy = 0;

// --- 💥 QA: shopping in a room the King just smashed must not crash the frame loop ---
A.G = A.freshGame('campaign'); A.chooseBoss('dragon'); A.G.slots = 1;
A.G.rooms = [null]; A.buildCells();
const shopper = { state:'shopping', shopT:0, x:10, cellIndex:0 };
let shopThrew = false;
try { A.doShopping(shopper, A.G.cells[0]); } catch(e){ shopThrew = true; }
t.ok(!shopThrew && shopper.state === 'walking', 'a shopper in a smashed room walks on instead of crashing');

// --- 🏺 QA: boss-select ⇄ loadout Back loop must not farm free relics ---
A.G = A.freshGame('campaign'); A.chooseBoss('dragon');
A.G.relics = ['rFang','rTome'];                       // pretend a previous pick granted these
A.chooseBoss('dragon');                               // back out → re-pick
t.ok(!A.G.relics.includes('rFang') && !A.G.relics.includes('rTome'), 're-picking a boss resets run relics (no dupe farming)');

t.done();
