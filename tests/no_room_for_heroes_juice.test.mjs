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

t.done();
