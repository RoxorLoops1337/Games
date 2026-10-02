// Boss ability VFX art: the painted frame sequences in no_room_for_heroes/abilities/fx/
// (ability_<name>_01.png ...) that play on the heroes an ability hits. Checks the
// shipped files, the ABIL_FX table, that castAbility spawns an effect on exactly the
// heroes run() hits, that the draw path puts the right frames on the right layer
// with crisp (nearest) sampling, and that update()/draw() with live effects never
// throws. Missing art must stay graceful: no frame drawn, the effect just drops.
//
//   node tests/no_room_for_heroes_art_abilities.test.mjs
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadGame, harness } from './no_room_for_heroes_lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const FX_DIR = join(here, '..', 'no_room_for_heroes', 'abilities', 'fx');
const t = harness('art: boss ability VFX');

// ---- 1) the shipped files: every frame, at exactly 1/5 of the owner's canvas ----
const FILES = {            // art id -> [frame count, width, height]
  ability_curse:      [5, 186, 176],
  ability_devour:     [6, 210, 152],
  ability_drain:      [5, 196, 198],
  ability_entangle:   [4, 189, 179],
  ability_firebreath: [3, 153, 175],
  ability_hellfire:   [4, 144, 179],
  ability_slam:       [5, 384, 216],
};
function pngSize(p){ const b=readFileSync(p);
  return (b.readUInt32BE(0)===0x89504e47) ? [b.readUInt32BE(16), b.readUInt32BE(20), b[25]] : null; }
let nFiles=0;
for(const [id,[n,w,h]] of Object.entries(FILES)){
  for(let k=1;k<=n;k++){
    const p=join(FX_DIR, id+'_'+String(k).padStart(2,'0')+'.png');
    t.ok(existsSync(p), 'asset exists: abilities/fx/'+id+'_'+String(k).padStart(2,'0')+'.png');
    if(!existsSync(p)) continue;
    nFiles++;
    const sz=pngSize(p);
    t.ok(sz && sz[0]===w && sz[1]===h, id+' frame '+k+' is '+w+'x'+h+' (got '+(sz&&sz.slice(0,2).join('x'))+')');
    t.ok(sz && (sz[2]===6 || sz[2]===4), id+' frame '+k+' keeps an alpha channel');
  }
  // one past the end must be absent, so artProbe stops at the real frame count
  t.ok(!existsSync(join(FX_DIR, id+'_'+String(n+1).padStart(2,'0')+'.png')), id+' has no stray frame '+(n+1));
}
t.ok(nFiles===32, 'all 32 ability VFX frames shipped (got '+nFiles+')');
// the 50x56 HUD icons next door are untouched
for(const id of ['slam','breath','curse','drain','devour','entangle','hellfire','quake'])
  t.ok(existsSync(join(here, '..', 'no_room_for_heroes', 'abilities', id+'.png')), 'HUD icon abilities/'+id+'.png still there');

// ---- 2) the game ----
const A = loadGame(`freshGame,chooseBoss,prepCampaignWave,startWave,update,draw,render,makeRoom,applyRunes,BOSSES,
  ABIL,ABIL_FX,FX_FADE,abilFx,spawnAbilFx,abilFxTick,drawAbilFx,abilFxProbe,heroFxScale,fxFrames,castAbility,ART,artProbe,FLOOR,buildHeroFromSpec,nextSpec,LIFT,
  get G(){return G;},set G(v){G=v;},
  get X(){return X;},set X(v){X=v;},
  get paused(){return paused;},set paused(v){paused=v;}`);

// the table
const WITH_ART = { slam:'ability_slam', quake:'ability_slam', devour:'ability_devour', drain:'ability_drain',
  curse:'ability_curse', breath:'ability_firebreath', hellfire:'ability_hellfire', entangle:'ability_entangle' };
t.ok(Object.keys(A.ABIL_FX).sort().join()===Object.keys(WITH_ART).sort().join(), 'ABIL_FX covers exactly the 8 painted abilities');
for(const [id,art] of Object.entries(WITH_ART)){
  const f=A.ABIL_FX[id];
  t.ok(A.ABIL[id], 'ABIL_FX.'+id+' is a real ability');
  t.ok(f && f.art===art, id+' uses '+art);
  t.ok(f && FILES[f.art], id+' art has shipped frames');
  t.ok(f && f.dh>0 && f.fps>0 && f.ax>=0 && f.ax<=1 && f.ay>=0 && f.ay<=1, id+' has sane size/anchor/fps');
  t.ok(f && ['once','loop','hold'].includes(f.mode), id+' has a known play mode');
  t.ok(f && (f.mode!=='loop' || f.dur>0), id+' loop has a duration');
}
for(const id of ['bolt','freeze','dread','mend','siphon','raise'])
  t.ok(!A.ABIL_FX[id], id+' has no VFX entry (keeps bolt/burst only, no aliasing)');
t.ok(A.ABIL_FX.quake.dh<A.ABIL_FX.slam.dh && A.ABIL_FX.quake.stagger>0, 'quake reuses slam smaller with a ripple stagger');
t.ok(A.ABIL_FX.curse.layer==='back', 'curse vortex draws behind the hero');
t.ok(A.ABIL_FX.entangle.layer==='front' && A.ABIL_FX.entangle.alpha===0.92, 'entangle is front layer at alpha 0.92');
t.ok(A.ABIL_FX.entangle.mode==='hold' && A.ABIL_FX.entangle.max>0, 'entangle holds while rooted, capped');
for(const id of Object.keys(A.ABIL_FX)) if(id!=='curse') t.ok(A.ABIL_FX[id].layer==='front', id+' draws in front');

// the loader: ability_* ids resolve into abilities/fx/, traps keep rooms/traps/
A.artProbe('ability_slam');
const slamRec=A.ART.ability_slam;
t.ok(slamRec && slamRec.frames.length>0, 'artProbe loads ability_slam frames');
t.ok(slamRec && slamRec.frames[0] && String(slamRec.frames[0].src).startsWith('abilities/fx/ability_slam_'), 'ability art is fetched from abilities/fx/ (got '+(slamRec&&slamRec.frames[0]&&slamRec.frames[0].src)+')');
t.ok(A.ART.spike && A.ART.spike.frames[0] && String(A.ART.spike.frames[0].src).startsWith('rooms/traps/'), 'trap art still comes from rooms/traps/');

// a live run
const BOSS = Object.keys(A.BOSSES)[0];
function freshRun(){
  A.G = A.freshGame('campaign');
  A.chooseBoss(BOSS);
  A.G.slots = 3;
  A.G.rooms = [A.makeRoom('spike',1), A.makeRoom('goblin',1), A.makeRoom('flame',1)];
  if(typeof A.applyRunes==='function') A.applyRunes();
  A.prepCampaignWave();
  A.startWave();
}

let threw=null;
try{
  // startWave clears stale effects and preloads this boss's equipped ability art
  A.abilFx.push({ f:A.ABIL_FX.slam, h:null, x:0, s:1, t:0, end:null });
  delete A.ART.ability_firebreath; delete A.ART.ability_drain;
  freshRun();
  t.ok(A.G.phase==='run' && A.G.heroes.length>0, 'wave started with heroes');
  t.ok(A.abilFx.length===0, 'startWave clears leftover VFX');
  for(const a of A.G.boss.abil){ const f=A.ABIL_FX[a.id]; if(f) t.ok(A.ART[f.art] && A.fxFrames(f.art)>0, 'startWave preloaded '+f.art+' for equipped '+a.id); }

  // spawn: every painted ability on a hero, entangle on a rooted hero, hellfire on everyone
  for(let i=0;i<4;i++) A.update(0.05), A.draw();      // let drawHero stamp _figTop
  const h0=A.G.heroes[0];
  t.ok(A.heroFxScale(h0)>=0.85 && A.heroFxScale(h0)<=2.2, 'heroFxScale is clamped ('+A.heroFxScale(h0)+')');
  for(const id of Object.keys(A.ABIL_FX)) A.spawnAbilFx(id, [h0]);
  t.ok(A.abilFx.length===Object.keys(A.ABIL_FX).length, 'one effect per painted ability');
  h0.freeze=1;
  A.spawnAbilFx('entangle', [h0]);
  const living=A.G.heroes.filter(h=>h.state!=='dead');
  const before=A.abilFx.length;
  A.spawnAbilFx('hellfire', living);
  t.ok(A.abilFx.length===before+living.length, 'hellfire spawns one pillar per living hero');
  t.ok(A.abilFx.slice(before).every((e,i)=>Math.abs(e.t+0.06*i)<1e-9), 'hellfire pillars ripple with a 0.06s stagger');

  // no entry / no targets: nothing
  const n0=A.abilFx.length;
  A.spawnAbilFx('bolt', [h0]); A.spawnAbilFx('freeze', [h0]); A.spawnAbilFx('slam', []); A.spawnAbilFx('slam', null);
  t.ok(A.abilFx.length===n0, 'abilities without art, and empty target lists, spawn nothing');

  // the draw path: record what reaches the canvas
  const orig=A.X, calls=[];
  const rec=new Proxy({}, { get(tg,k){
      if(k==='drawImage') return (im,x,y,w,h)=>calls.push({ src:String(im&&im.src), x, y, w, h, a:tg.globalAlpha, sm:tg.imageSmoothingEnabled });
      if(k in tg) return tg[k];
      return orig[k]; },
    set(tg,k,v){ tg[k]=v; return true; } });
  rec.imageSmoothingEnabled=true; rec.globalAlpha=1;
  A.X=rec;
  for(const e of A.abilFx){ e.t=Math.max(e.t,0.2); }
  A.drawAbilFx(x=>x, 'back');
  const back=calls.splice(0);
  t.ok(back.length>0 && back.every(c=>c.src.includes('ability_curse')), 'back layer draws only the curse vortex ('+back.length+' draws)');
  A.drawAbilFx(x=>x, 'front');
  const front=calls.splice(0);
  t.ok(front.length>0 && !front.some(c=>c.src.includes('ability_curse')), 'front layer draws the rest, never curse');
  t.ok([...back,...front].every(c=>c.src.startsWith('abilities/fx/')), 'every VFX frame comes from abilities/fx/');
  t.ok([...back,...front].every(c=>c.sm===false), 'VFX draw with image smoothing off (crisp nearest)');
  t.ok(rec.imageSmoothingEnabled===true && rec.globalAlpha===1, 'drawAbilFx restores smoothing and alpha');
  t.ok(front.some(c=>c.src.includes('ability_entangle') && Math.abs(c.a-0.92)<1e-9), 'entangle draws at alpha 0.92');
  const slamDraw=front.find(c=>c.src.includes('ability_slam'));
  t.ok(slamDraw && slamDraw.w>0 && slamDraw.h>0 && slamDraw.y<A.FLOOR && slamDraw.y+slamDraw.h>A.FLOOR, 'slam blast straddles the floor line');
  A.X=orig;

  // run it out: nothing throws, everything ends (entangle's hold ends at thaw or the 4s cap)
  for(let i=0;i<120;i++){ A.update(0.05); A.draw(); }
  t.ok(A.abilFx.length===0, 'every effect finished and was removed (left '+A.abilFx.length+')');

  // graceful: art that never loaded draws nothing and drops quickly
  A.ART.ability_drain={frames:[], static:null};
  A.spawnAbilFx('drain', [A.G.heroes[0]]);
  A.X=rec;
  A.update(0.05); A.drawAbilFx(x=>x,'front'); A.draw();
  A.update(0.05); A.drawAbilFx(x=>x,'front'); A.draw();
  A.X=orig;
  t.ok(!calls.some(c=>c.src.includes('ability_drain')), 'missing drain art draws no frame');
  t.ok(A.abilFx.length===0, 'missing-art effect drops within ~0.1s');
  delete A.ART.ability_drain; A.artProbe('ability_drain');

  // castAbility spawns on exactly the heroes run() hits; a small first wave
  // (one hero on some days) gets a few more so multi-target casts have targets
  freshRun();
  while(A.G.heroes.length<4){ const h=A.buildHeroFromSpec(A.nextSpec()); h.x=-60-A.G.heroes.length*40; h.yOff=-A.LIFT; A.G.heroes.push(h); }
  for(let i=0;i<30;i++){ A.update(0.05); A.draw(); }
  function cast(id, keepHp){
    A.abilFx.length=0;
    A.G.boss.abil=[{id, cd:0}];
    A.G.boss.mana=A.G.boss.maxMana=999;
    const pre=A.G.heroes.filter(h=>h.state!=='dead');
    if(!keepHp) for(const h of pre){ h.maxHp=h.hp=1e6; h.freeze=0; }   // nobody dies mid-check
    A.castAbility(0);
    return pre;
  }
  if(A.G.phase==='run' && A.G.heroes.filter(h=>h.state!=='dead').length>=2){
    let pre=cast('slam');
    t.ok(A.abilFx.length===1 && A.abilFx[0].f.art==='ability_slam' && pre.includes(A.abilFx[0].h), 'Slam cast: one blast on the target');
    pre=cast('entangle');
    const tgt=A.abilFx[0] && A.abilFx[0].h;
    t.ok(tgt && A.abilFx.length===pre.filter(o=>o===tgt || o.cellIndex===tgt.cellIndex).length, 'Entangle cast: brambles on the target and its cellmates ('+A.abilFx.length+')');
    t.ok(A.abilFx.length>0 && A.abilFx.every(e=>e.h.freeze>0), 'every entangled hero is actually rooted');
    cast('bolt');
    t.ok(A.abilFx.length===0, 'Bone Bolt cast: no VFX (bolt/burst only)');
    cast('curse');
    t.ok(A.abilFx.length===1 && A.abilFx[0].f.layer==='back' && A.abilFx[0].h.cursed, 'Curse cast: vortex behind the cursed hero');
    // Devour executes a hero under 30% HP: the maw still plays on the corpse
    const alive=A.G.heroes.filter(h=>h.state!=='dead');
    for(const h of alive){ h.maxHp=h.hp=1e6; h.freeze=0; }
    const victim=alive.find(h=>!h.champion && !h.king);
    if(victim){ victim.hp=1;
      cast('devour', true);
      t.ok(victim.state==='dead' && A.abilFx.length===1 && A.abilFx[0].h===victim, 'Devour execute: the maw plays on the swallowed hero');
    }
    pre=cast('hellfire');
    t.ok(pre.length>0 && A.abilFx.length===pre.length && pre.every(h=>A.abilFx.some(e=>e.h===h)), 'Hellfire cast: a pillar on every hero alive at cast time ('+A.abilFx.length+'/'+pre.length+')');
    pre=cast('quake');
    t.ok(pre.length>0 && A.abilFx.length===pre.length && A.abilFx.every(e=>e.f.art==='ability_slam'), 'Quake cast: the slam blast on every hero');
    for(let i=0;i<120;i++){ A.update(0.05); A.draw(); }
    t.ok(A.abilFx.length===0, 'cast effects all finish');
  } else t.ok(false, 'second wave ended (or lost heroes) before the cast checks');

  // paused: the effect still advances (tutorial ability beats cast while paused)
  freshRun();
  A.spawnAbilFx('slam', [A.G.heroes[0]]);
  const e=A.abilFx[0];
  const t0=e.t;
  A.update(0.05);
  t.ok(e.t>t0, 'effects tick in update()');
  A.paused=true;
  const t1=e.t, hx=A.G.heroes[0].x;
  A.update(0.05);
  t.ok(e.t>t1 && A.G.heroes[0].x===hx, 'effects still tick while paused (the sim itself stays frozen)');
  A.paused=false;
}catch(err){ threw=err; console.log(err && err.stack); }
t.ok(!threw, 'ability VFX update/draw never throws');
t.done();
