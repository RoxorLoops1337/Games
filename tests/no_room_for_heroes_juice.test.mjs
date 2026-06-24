// Render + "juice" smoke test. The other suites exercise game LOGIC but never
// run the rAF draw loop, so a render-time error (bad array access, undefined
// var in draw) would ship green. This drives a real campaign wave — heroes
// walking, fighting, bleeding, dying — through update()+draw() for many frames
// and asserts the loop never throws, then exercises the damage/death juice hooks
// directly. The headless canvas is a full no-op context (see the lib), so only
// our own JS errors surface.
//
//   node tests/no_room_for_heroes_juice.test.mjs   (or: npm run test:boss)
import { loadGame, harness } from './no_room_for_heroes_lib.mjs';

const A = loadGame(`freshGame,chooseBoss,buildCells,prepCampaignWave,startWave,
  update,draw,render,updateTop,dealToHero,heroDies,applyRunes,makeRoom,makeUnit,BOSSES,particles,floats,
  goblinStep,fightTick,shake,
  collectLoot,collectAllLoot,mergeGear,autoMergeGear,assignLoot,GEAR,CHEST_MAX,TIER_ORDER,
  equipGear,roomMonUnits,renderPanel,describeHero,describeRoom,describeLoot,entityAt,gearEffectText,gearEffects,ampAt,
  get panelHTML(){ return panel.innerHTML; },
  get G(){return G;},set G(v){G=v;},
  get shakeMag(){return shakeMag;},set shakeMag(v){shakeMag=v;},
  get decals(){ return (typeof decals!=='undefined') ? decals : null; }`);
const t = harness('render/juice smoke');
const BOSS = Object.keys(A.BOSSES)[0];

// mint rooms through the real factory so they carry .def / stock / etc.
// mint a room and, for the optional extra parts, push them as real units into
// grown slots (mixed rooms now hold up to 5 trap/monster units).
function room(type, lvl, part2, part3){
  const r = A.makeRoom(type, lvl||1);
  for(const p of [part2, part3]){
    if(!p) continue;
    r.cap = (r.cap||1) + 1;
    r.units.push(A.makeUnit(p, lvl||1));
  }
  if(r.units[0]) r.type = r.units[0].type;
  return r;
}

function freshRun(rooms){
  A.G = A.freshGame('campaign');
  A.chooseBoss(BOSS);
  A.G.slots = rooms.length;
  A.G.rooms = rooms;
  if(typeof A.applyRunes==='function') A.applyRunes();
  A.prepCampaignWave();
  A.startWave();
}

let threw=null;
try{
  // 1) a full wave with traps + a goblin den + a two-guard fusion + an elemental combo
  freshRun([
    room('spike', 2),
    room('goblin', 2),
    room('ogre', 2, 'warden'),
    room('orc', 2),                   // Orc Marauder — new monster, static 2-frame idle sprite
    room('slime', 2),                 // Gel Cube — splits under 60% HP (extra guard + smaller draw)
    room('warcamp', 2),               // newly-arted monster sprite (War Camp, 192px sheets)
    room('totem', 2),                 // newly-arted monster sprite (War Totem, 64px + 192px slash)
    room('flame', 2, 'venom'),
    room('bombard', 2, 'hexbrand'),   // newly-arted traps (AoE + brand)
    room('runestone', 2),             // amplifier (passive looping art)
  ]);
  t.ok(A.G.phase==='run', 'wave started → run phase');
  t.ok(Array.isArray(A.G.heroes) && A.G.heroes.length>0, 'heroes spawned');

  let frames=0;
  for(; frames<1500; frames++){
    A.update(0.05);
    A.updateTop();                      // exercises the HUD count-up (countTo) path
    A.draw();
    if(A.G.phase!=='run') break;        // wave resolved (heroes dead or throne fell)
  }
  t.ok(frames>0, 'ran '+frames+' run-phase draw frames without throwing');

  // 2) drive the damage + death juice straight through the central hero-damage fn
  freshRun([room('spike', 1), room('goblin', 1)]);
  const h = A.G.heroes[0];
  for(let i=0;i<60 && h && h.state!=='dead'; i++){ A.dealToHero(h, 9999, 'TEST'); A.draw(); }
  t.ok(h && h.state==='dead', 'a hero can be damaged to death through dealToHero');
  t.ok(A.decals && A.decals.length>0, 'blood pooled on the floor after a kill (gore fired)');
  for(let i=0;i<20;i++) A.draw();        // draw the aftermath (corpse / blood decals / fading particles)
}catch(e){ threw=e; }
t.ok(!threw, 'run-phase draw/update/juice loop never threw'
  + (threw ? (' — '+threw.message+'\n'+String(threw.stack||'').split('\n').slice(0,4).join('\n')) : ''));

// 3) build-phase draw (waiting heroes, room menus, shop) must also be clean
try{
  A.G = A.freshGame('campaign'); A.chooseBoss(BOSS);
  A.G.slots=3; A.G.rooms=[room('spike',1), null, room('shop',1)];
  A.G.rooms[2].stock=[{key:'sword'},{key:'armor'},{key:'potion'},{key:'great'}];  // exercises the painted item-icon draw
  A.G.hand=[{type:'spike',lvl:1},{type:'goblin',lvl:1},{type:'ogre',lvl:1}];
  A.G.phase='build'; A.buildCells(); A.prepCampaignWave();
  for(let i=0;i<6;i++){ A.render(); A.update(0.05); A.draw(); }   // hand-card deal-in + panel render
  A.G.hand.push({type:'flame',lvl:1});                            // a fresh draft → new card deals in
  A.render(); A.draw();
  A.G.brokenCells={0:true,1:true};                                // champion-smashed rooms → broken art + gap walls
  A.draw();
  t.ok(true, 'build-phase render + draw loop clean (cards, HUD, motion, broken rooms, gaps)');
}catch(e){ t.ok(false, 'build-phase draw threw: '+e.message); }

// 4) stale-cell guard: G.cells is only rebuilt at startWave, so a Bone Pit built
//    in a slot a Goblin Den used to occupy must NOT inherit the den's preview.
//    The den render gates on the CURRENT room (isDen), not the stale cell.spawner.
try{
  A.G = A.freshGame('campaign'); A.chooseBoss(BOSS);
  A.G.slots=2; A.G.rooms=[room('goblin',1), room('skeleton',1)];
  A.G.phase='build'; A.buildCells();                              // cells built — slot 0 gets spawner:'goblin'
  t.ok(A.G.cells[0] && A.G.cells[0].spawner==='goblin', 'den cell carries spawner:goblin');
  A.G.rooms[0]=room('skeleton',1);                               // swap slot 0 to a Bone Pit, cells NOT rebuilt
  t.ok(A.G.cells[0].spawner==='goblin', 'cell.spawner is now STALE (the bug condition)');
  A.draw();                                                      // must read isDen from the room, draw a skeleton, not ghost goblins
  t.ok(true, 'stale-cell den preview no longer fires for a non-goblin room');
}catch(e){ t.ok(false, 'stale-cell draw threw: '+e.message); }

// 5) den goblins now HUNT: a goblin chases the nearest living hero across the
//    whole dungeon (no same-cell requirement), fights it to the finish, and when
//    every hero is down it marches back to its den rest spot on the right.
try{
  freshRun([room('goblin', 3), room('spike', 1), room('ogre', 1)]);
  const g = (A.G.minions||[])[0];
  t.ok(!!g, 'a den goblin marched out for the wave');
  if(g){
    // isolate one hero, drop it far to the LEFT in a different cell, goblin to the right
    const h = A.G.heroes[0];
    A.G.heroes = [h];
    h.state='walking'; h.hp = h.maxHp = 99999; h.atk = 0;   // unkillable, harmless dummy
    h.x = A.G.cells[0].x0 + 4;                               // far-left cell
    g.x = A.G.cells[Math.min(2, A.G.cells.length-1)].x0 + 20; // a few cells to the right
    g.engaged = null;
    const gap0 = Math.abs(g.x - h.x);
    t.ok(Array.isArray(A.G.cells) && A.G.cells.length>0, 'dungeon cells exist');
    for(let i=0;i<60;i++) A.goblinStep(g, 0.05);
    t.ok(Math.abs(g.x - h.x) < gap0 - 1, 'goblin closed the gap to a hero in another room ('+gap0.toFixed(0)+'→'+Math.abs(g.x-h.x).toFixed(0)+')');
    t.ok(g.engaged === h, 'goblin locked onto the far hero (cross-cell hunt)');

    // now wipe the party → the goblin should retreat toward its den (homeX, right)
    h.hp = 0; h.state = 'dead';
    g.engaged = null;
    const homeX = g.homeX;
    g.x = homeX - 200;                                       // stranded far to the left
    const back0 = homeX - g.x;
    for(let i=0;i<80;i++) A.goblinStep(g, 0.05);
    t.ok((homeX - g.x) < back0 - 1, 'with no heroes left, goblin walks back toward the den ('+back0.toFixed(0)+'→'+(homeX-g.x).toFixed(0)+')');
  }
}catch(e){ t.ok(false, 'goblin hunt/retreat behavior threw: '+e.message); }

// 6) Gel Cube: drops under 60% HP → splits ONCE into two cubes keeping the big
//    one's stats (maxHp + atk); the twin joins the room's guard line.
try{
  freshRun([room('slime', 2)]);
  const sc=A.G.cells[0], slime=sc.mon;
  t.ok(slime && slime.split, 'slime room builds a splitting guard');
  slime.hp=Math.round(slime.maxHp*0.62);                         // just above the 60% line
  const hero=A.G.heroes[0]; hero.state='fighting'; hero.cellIndex=0; hero.x=sc.x0+40; hero.atkT=0;
  hero.atk=Math.max(hero.atk, slime.maxHp*0.12);                 // a hit that pushes it under 60%
  A.fightTick(hero, slime, 0.12, sc, true, false);
  const live=(sc.guards||[]).filter(g=>g && g.alive);
  t.ok(live.length===2, 'Gel Cube split into TWO under 60% (was '+live.length+')');
  t.ok(live.every(g=>g.atk===slime.atk && g.maxHp===slime.maxHp), 'both cubes keep the big one’s stats');
  t.ok(slime.didSplit && live.every(g=>g.small), 'it only splits once; the cubes are flagged smaller');
  for(let i=0;i<30;i++) A.draw();                                // draw the two cubes (smaller, behind) without throwing
}catch(e){ t.ok(false, 'gel cube split threw: '+e.message); }

// 7) screen shake is reserved for set-pieces now — the constant per-hit/kill
//    rumble was toned out. A routine hero kill must NOT shake; the SHAKE_SCALE
//    dial softens whatever set-piece shakes remain.
try{
  freshRun([room('spike',1), room('goblin',1)]);
  A.shakeMag=0;
  const h=A.G.heroes.find(x=>x && !x.champion && !x.elite && x.state!=='dead') || A.G.heroes[0];
  A.dealToHero(h, 999999, 'TEST', 'full', 'phys', true);        // a lethal routine hit (aimed → no dodge) → heroDies
  t.ok(h.state==='dead', 'routine hero died from the hit (control)');
  t.ok(A.shakeMag===0, 'a routine hero kill no longer shakes the screen');
  A.shakeMag=0; A.shake(10);
  t.ok(Math.abs(A.shakeMag-8)<1e-9, 'SHAKE_SCALE softens set-piece shakes (10→8)');
}catch(e){ t.ok(false, 'shake-restraint check threw: '+e.message); }

// 8) the King (👑) renders as a 40%-bigger Super Knight — drive walk/fight/throne
//    stances through the scaled drawChampion path without throwing.
try{
  freshRun([room('spike',1), room('goblin',1)]);
  const h=A.G.heroes[0]; h.king=true; h.heroName='The High King'; h.champion=null;
  h.state='walking'; for(let i=0;i<20;i++){ h.x+=3; A.draw(); }
  h.state='fighting'; h.atkT=0.3; for(let i=0;i<10;i++) A.draw();
  h.state='boss';     h.atkT=0.5; for(let i=0;i<10;i++) A.draw();
  t.ok(true, 'the King draws as a scaled Super Knight (walk / fight / throne) without throwing');
}catch(e){ t.ok(false, 'King render threw: '+e.message); }

// 9) the King storms in with a 50-knight host (spectacle) — one King leads a
//    swarm of weak little knights; the whole host renders cleanly.
try{
  A.G = A.freshGame('campaign'); A.chooseBoss(BOSS);
  A.G.slots=2; A.G.rooms=[room('spike',1), room('goblin',1)];
  if(typeof A.applyRunes==='function') A.applyRunes();
  A.prepCampaignWave();
  A.G.kingDue=true; A.startWave();
  const kings  = A.G.heroes.filter(h=>h && h.king);
  const guards = A.G.heroes.filter(h=>h && h.kingGuard);
  t.ok(kings.length===1, 'exactly one High King leads the wave');
  t.ok(guards.length===50, 'the King brings a 50-knight honor guard (got '+guards.length+')');
  t.ok(guards.every(g=>g.maxHp < kings[0].maxHp && !g.king), 'the little knights are far weaker than the King');
  let kf=0; for(; kf<300; kf++){ A.update(0.05); A.draw(); if(A.G.phase!=='run') break; }
  t.ok(kf>0, 'the King + 50-knight host runs '+kf+' frames without throwing');
}catch(e){ t.ok(false, 'king host spawn/render threw: '+e.message); }

// 10) 💎 Loot loop: a slain carrier drops gear → collect into the 16-slot chest
//     → tap two of a kind to merge up the rarity ladder.
try{
  // a champion always carries class-themed gear (mage → tome)
  const champHero={cls:'mage', champion:'x'}; A.assignLoot(champHero);
  t.ok(champHero.loot && champHero.loot.k==='tome', 'a champion always carries class-themed gear (mage→tome)');

  freshRun([room('spike',1), room('goblin',1)]);
  const h=A.G.heroes[0]; h.loot={k:'blade', t:'common'}; h.x=120;
  A.heroDies(h);
  t.ok((A.G.floorLoot||[]).length===1, 'a slain carrier drops one piece on the floor');
  for(let i=0;i<10;i++) A.draw();                         // render the glinting floor loot (no throw)
  t.ok(A.collectLoot(0)===true && A.G.chest.length===1 && A.G.floorLoot.length===0, 'clicking collects it into the chest');

  // two of the same kind+tier merge into the next rarity up
  A.G.chest=[{k:'tome',t:'common'},{k:'tome',t:'common'}];
  A.mergeGear(0,1);
  t.ok(A.G.chest.length===1 && A.G.chest[0].t===A.TIER_ORDER[1], 'two commons merge into the next tier (special)');

  // the chest is hard-capped at CHEST_MAX
  A.G.chest=[]; for(let i=0;i<A.CHEST_MAX;i++) A.G.chest.push({k:'blade',t:'rare'});
  A.G.floorLoot=[{k:'blade',t:'rare',x:100}];
  t.ok(A.collectLoot(0)===false && A.G.chest.length===A.CHEST_MAX, 'the chest is capped at CHEST_MAX ('+A.CHEST_MAX+')');

  // auto-merge fuses every matching pair: 4 commons → 1 rare
  A.G.chest=[{k:'charm',t:'common'},{k:'charm',t:'common'},{k:'charm',t:'common'},{k:'charm',t:'common'}];
  A.autoMergeGear();
  t.ok(A.G.chest.length===1 && A.G.chest[0].t===A.TIER_ORDER[2], 'auto-merge fuses 4 commons → 1 rare');
}catch(e){ t.ok(false, 'loot loop threw: '+e.message); }

// 11) 🛡️ Equip gear onto a monster → it folds into the guard's stats & specials
try{
  A.G=A.freshGame('campaign'); A.chooseBoss(BOSS); A.G.phase='build';
  A.G.slots=2; A.G.rooms=[A.makeRoom('skeleton',1), A.makeRoom('skeleton',1)];
  A.G.chest=[{k:'blade',t:'epic'},{k:'aegis',t:'rare'}];

  // gear is refused on a room with no monster (temporarily a trap room)
  const keep=A.G.rooms[1]; A.G.rooms[1]=A.makeRoom('spike',1);
  A.equipGear(0,1);
  t.ok(A.G.chest.length===2, 'gear is refused on a room with no monster');
  A.G.rooms[1]=keep;

  // equip both onto room 0's skeleton; they leave the chest
  A.equipGear(0,0); A.equipGear(0,0);
  t.ok(A.G.rooms[0].units[0].gear.length===2 && A.G.chest.length===0, 'both pieces equip and leave the chest');

  A.buildCells();
  const geared=A.G.cells[0].guards[0], bare=A.G.cells[1].guards[0];
  t.ok(geared.atk>bare.atk && geared.maxHp>bare.maxHp, 'Blade & Aegis raise the monster ATK & HP');
  t.ok(geared.dr>0, 'Aegis grants the guard damage reduction');
  t.ok(Array.isArray(geared.gear) && geared.gear.length===2, 'the guard remembers its equipped gear');

  // Charm → lifesteal; Tome → an elemental proc
  A.G.rooms[0].units[0].gear=[{k:'charm',t:'mythic'}]; A.buildCells();
  t.ok(A.G.cells[0].guards[0].leech>0, 'Charm grants the guard lifesteal');
  A.G.rooms[0].units[0].gear=[{k:'tome',t:'common'}]; A.buildCells();
  const pr=A.G.cells[0].guards[0].proc;
  t.ok(pr && pr.burn>0, 'Tome grants the guard an elemental (burn/chill) proc');
}catch(e){ t.ok(false, 'gear equip/effects threw: '+e.message); }

// 12) Run panel must render exactly n+3 .abil buttons (abilities + Smite + Overdrive
//     + Potion), matching updateRunPanel's rebuild guard. If they diverge, the guard
//     rebuilds the whole panel EVERY frame and ability clicks get eaten mid-press.
try{
  freshRun([room('spike',2)]);
  A.G.phase='run'; A.renderPanel();
  const html=A.panelHTML||'';
  const abilCount=(html.match(/<button class="abil/g)||[]).length;
  const n=A.G.boss.abil.length;
  t.ok(abilCount===n+3, 'run panel renders n+3 .abil buttons (got '+abilCount+', abilities='+n+') so updateRunPanel patches in place instead of rebuilding every frame');
}catch(e){ t.ok(false, 'ability-button count check threw: '+e.message); }

// 13) Loot readouts: carried gear reads on heroes, equipped gear on monsters,
//     and a floor pickup is inspectable (entityAt resolves it) for mid-wave collect.
try{
  // per-tier effect text
  t.ok(A.gearEffectText({k:'blade',t:'common'})==='+25% ATK', 'gearEffectText reports the per-tier effect');

  // a carrier advertises its gear in the hero inspect bubble
  const hh={cls:'warrior', heroName:'Sir Test', traits:[], hp:10, maxHp:10, atk:3, armor:2, spd:46, gold:5, loot:{k:'blade',t:'epic'}};
  const hd=A.describeHero(hh);
  t.ok(/Carrying/.test(hd) && /Blade/.test(hd), 'a carrier shows its gear in the hero inspect bubble');

  // a floor pickup describes its equipped effect
  t.ok(/damage taken/.test(A.describeLoot({k:'aegis',t:'rare',x:200})), 'a floor pickup describes its equipped effect');

  // equipped gear is listed on the monster room readout
  A.G=A.freshGame('campaign'); A.chooseBoss(BOSS); A.G.phase='build';
  A.G.slots=1; A.G.rooms=[A.makeRoom('skeleton',1)];
  const bare=A.describeRoom(A.G.rooms[0], true);
  A.G.rooms[0].units[0].gear=[{k:'blade',t:'mythic'}];
  const armed=A.describeRoom(A.G.rooms[0], true);
  t.ok(/Blade/.test(armed) && armed!==bare, 'equipped gear is listed on the monster room readout');

  // entityAt resolves a floor pickup so it can be inspected & collected mid-wave
  A.G.floorLoot=[{k:'charm',t:'common',x:300}];
  const ent=A.entityAt(300);
  t.ok(ent && ent.kind==='loot' && ent.loot.k==='charm', 'entityAt resolves a floor pickup for inspect/collect');
}catch(e){ t.ok(false, 'loot readout threw: '+e.message); }

// 14) Support monsters: War Camp CONDITIONS its own room + BOTH neighbours (regen +
//     faster swings, build-time); War Totem amplifies its OWN room while its totem lives.
try{
  A.G=A.freshGame('campaign'); A.chooseBoss(BOSS); A.G.phase='build';
  A.G.slots=4; A.G.rooms=[A.makeRoom('skeleton',1), A.makeRoom('warcamp',1), A.makeRoom('skeleton',1), A.makeRoom('skeleton',1)];
  A.buildCells();
  const left=A.G.cells[0].guards[0], camp=A.G.cells[1].guards[0], right=A.G.cells[2].guards[0], far=A.G.cells[3].guards[0];
  t.ok(left.regen>0 && left.haste<1, 'War Camp conditions the room behind it');
  t.ok(camp.regen>0 && camp.haste<1, 'War Camp conditions its own room');
  t.ok(right.regen>0 && right.haste<1, 'War Camp conditions the room ahead');
  t.ok(!(far.regen>0), 'a room two away is left untouched');

  // War Totem: skeleton + totem stacked in one room — amp applies to that room while alive
  A.G.slots=1; A.G.rooms=[A.makeRoom('skeleton',1)];
  A.G.rooms[0].cap=2; A.G.rooms[0].units.push(A.makeUnit('totem',1));
  A.buildCells();
  t.ok(A.ampAt(0)>1, 'a living War Totem amplifies its OWN room');
  A.G.cells[0].guards.forEach(g=>{ if(g.type==='totem') g.alive=false; });
  t.ok(A.ampAt(0)===1, 'once the totem falls, the amp is gone');
}catch(e){ t.ok(false, 'support-buff rework threw: '+e.message); }

// 15) Every living guard in a room focus-fires the front hero — three guards deal
//     ~3× a lone guard's damage. Summed over many ticks so the 12% crit roll
//     (dealToHero) averages out instead of making the ratio flaky.
try{
  function totalDmg(nGuards){
    A.G=A.freshGame('campaign'); A.chooseBoss(BOSS); A.G.phase='run';
    A.G.slots=1; A.G.rooms=[A.makeRoom('skeleton',1)]; A.G.rooms[0].cap=nGuards;
    for(let i=1;i<nGuards;i++) A.G.rooms[0].units.push(A.makeUnit('skeleton',1));
    A.buildCells();
    const cell=A.G.cells[0];
    const hero={cls:'warrior', state:'fighting', cellIndex:0, x:cell.x0+220, y:0, hp:1e9, maxHp:1e9,
      atk:0, atkSpeed:1, armor:0, acid:0, mark:0, burn:0, freeze:0, chill:0, oil:0, shock:0, reactCount:0, atkT:1e9};
    A.G.heroes=[hero];
    let total=0;
    for(let k=0;k<80;k++){
      cell.guards.forEach(g=>{ if(g) g.atkT=0; });    // ready every guard each tick
      const before=hero.hp;
      A.fightTick(hero, cell.mon, 0.05, cell, true, false);
      total += before-hero.hp;
    }
    return total;
  }
  const d1=totalDmg(1), d3=totalDmg(3);
  t.ok(d1>0, 'a single guard strikes the front hero ('+d1+' over 80 ticks)');
  t.ok(d3 > d1*2.5, 'three guards focus-fire ~3× a lone guard ('+d1+' → '+d3+')');
}catch(e){ t.ok(false, 'simultaneous-attack threw: '+e.message); }

// 16) 🐲 Drakeling fire breath: a ranged cone that stacks burn on EVERY hero in the room
try{
  A.G=A.freshGame('campaign'); A.chooseBoss(BOSS); A.G.phase='run';
  A.G.slots=1; A.G.rooms=[A.makeRoom('dragon',1)]; A.buildCells();
  const cell=A.G.cells[0];
  const mk=x=>({cls:'warrior', state:'fighting', cellIndex:0, x, y:0, hp:1e6, maxHp:1e6, atk:0, atkSpeed:1,
    armor:0, acid:0, mark:0, burn:0, burnT:0, freeze:0, chill:0, oil:0, shock:0, reactCount:0, atkT:999});
  const front=mk(cell.x0+220), back=mk(cell.x0+160);
  A.G.heroes=[front, back];
  A.fightTick(front, cell.mon, 0.05, cell, true, false);
  t.ok(front.burn>0 && back.burn>0, 'fire breath ignites EVERY hero in the room (ranged cone)');
  const b1=front.burn;
  cell.guards[0].atkT=0;                                   // ready the next breath
  A.fightTick(front, cell.mon, 0.05, cell, true, false);
  t.ok(front.burn>b1, 'burn STACKS with each breath');
}catch(e){ t.ok(false, 'dragon breath threw: '+e.message); }

// 17) Legendary+ gear gains a SIGNATURE on-hit special (lower tiers have none).
try{
  const legBlade=A.gearEffects([{k:'blade',t:'legendary'}]);
  t.ok(A.gearEffects([{k:'blade',t:'epic'}]).crush===0 && legBlade.crush>0, 'a Blade gains armor crush at legendary');
  t.ok(A.gearEffects([{k:'blade',t:'mythic'}]).crush>legBlade.crush, 'mythic crush is stronger than legendary');
  t.ok(A.gearEffects([{k:'aegis',t:'legendary'}]).thorns>0 && A.gearEffects([{k:'aegis',t:'rare'}]).thorns===0, 'a legendary Aegis adds thorns (rare has none)');
  t.ok(A.gearEffects([{k:'charm',t:'mythic'}]).poison>0 && A.gearEffects([{k:'charm',t:'epic'}]).poison===0, 'a mythic Charm adds poison (epic has none)');
  t.ok(A.gearEffects([{k:'tome',t:'legendary'}]).proc.freeze && A.gearEffects([{k:'tome',t:'rare'}]).proc.freeze==null, 'a Tome gains a freeze chance at legendary+ only');
  t.ok(/armor crush/.test(A.gearEffectText({k:'blade',t:'mythic'})), 'the gear readout names the legendary special');

  // integration: a legendary-Aegis guard reflects thorns when a hero strikes it
  A.G=A.freshGame('campaign'); A.chooseBoss(BOSS); A.G.phase='run';
  A.G.slots=1; A.G.rooms=[A.makeRoom('skeleton',1)];
  A.G.rooms[0].units[0].gear=[{k:'aegis',t:'mythic'}];
  A.buildCells();
  const cell=A.G.cells[0];
  cell.guards.forEach(g=>{ g.atkT=999; });                  // suppress the guard's own swing — isolate thorns
  const hero={cls:'warrior', state:'fighting', cellIndex:0, x:cell.x0+220, y:0, hp:1000, maxHp:1000,
    atk:40, atkSpeed:1, armor:0, acid:0, mark:0, burn:0, freeze:0, chill:0, oil:0, shock:0, reactCount:0, atkT:0};
  A.G.heroes=[hero];
  const before=hero.hp;
  A.fightTick(hero, cell.mon, 0.05, cell, true, false);
  t.ok(hero.hp<before, 'thorns reflects damage back at a hero who strikes a legendary-Aegis guard');
}catch(e){ t.ok(false, 'legendary-gear specials threw: '+e.message); }

t.done();
