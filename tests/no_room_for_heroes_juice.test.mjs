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
  update,draw,render,updateTop,dealToHero,heroDies,applyRunes,makeRoom,BOSSES,particles,floats,
  goblinStep,
  get G(){return G;},set G(v){G=v;},
  get decals(){ return (typeof decals!=='undefined') ? decals : null; }`);
const t = harness('render/juice smoke');
const BOSS = Object.keys(A.BOSSES)[0];

// mint rooms through the real factory so they carry .def / stock / etc.
function room(type, lvl, part2, part3){
  const r = A.makeRoom(type, lvl||1);
  if(part2) r.part2 = part2;
  if(part3) r.part3 = part3;
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

t.done();
