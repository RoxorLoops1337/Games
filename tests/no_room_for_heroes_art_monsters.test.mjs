// Monster guard art: the per-frame guards (harpy, sentinel, mimic, the painted
// Corrupted demon, the new orc) and the Corrupted LPC skins (Edrik / Vesna).
// Checks the files on disk match MON_SPRITES exactly, the clip rules (the mimic's
// chest disguise -> one-shot transform -> walk), every fallback down the chain
// (a missing frame, a missing clip, the legacy orc sheet, the procedural wraith),
// and that update()/draw() run clean in build and run phases with the new art.
//
//   node tests/no_room_for_heroes_art_monsters.test.mjs
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadGame, harness } from './no_room_for_heroes_lib.mjs';

const GAME = join(dirname(fileURLToPath(import.meta.url)), '..', 'no_room_for_heroes');
const A = loadGame(`freshGame,chooseBoss,buildCells,prepCampaignWave,startWave,update,draw,render,
  makeRoom,makeUnit,applyRunes,BOSSES,MON_SPRITES,MON_IMG,monSpriteReady,drawMonsterSprite,monClipName,
  corruptSkinKey,corruptLookKey,CORRUPT_SKINS,loadFrameSeq,roomDrawInfo,VET_KILLS,CORRUPT_DEMON_KILLS,FLOOR,LIFT,
  get G(){return G;},set G(v){G=v;},
  get X(){return X;},set X(v){X=v;},
  get bar(){return bar;},set bar(v){bar=v;}`);
const t = harness('monster art');
const BOSS = Object.keys(A.BOSSES)[0];
const FRAME_KEYS = ['orc', 'harpy', 'sentinel', 'mimic', 'minion'];
// uploads that arrived corrupt: the game plays without them, and once re-uploaded
// (tools/art/monster_frames.py again) they are checked like every other frame
const KNOWN_MISSING = new Set(['sprites/mimic/mimic_walk_01.png', 'sprites/mimic/mimic_attack_01.png']);

function pngSize(p){ const b=readFileSync(p); return [b.readUInt32BE(16), b.readUInt32BE(20)]; }
function framePath(cfg, cl, k){ return cl.n>1 ? cfg.dir+cl.seq+'_'+String(k+1).padStart(2,'0')+'.png' : cfg.dir+cl.seq+'.png'; }

// ---- 1) files on disk match the config ---------------------------------------
// native canvas sizes from the art spec: every frame of a clip shares one canvas
const NATIVE = { harpy_idle:[198,185], harpy_attack:[174,145], sentinel_idle:[97,99], sentinel_walk:[121,103],
  sentinel_attack:[137,95], mimic_chest:[148,134], mimic_transform:[175,135], mimic_walk:[189,135],
  mimic_attack:[179,155], minion_idle:[135,131], minion_walk:[150,132], minion_attack:[207,126],
  orc_idle:[180,119], orc_walk:[179,137], orc_attack:[311,207] };
const onDisk=new Set();   // unique files (mimic idle + walk share a sequence)
for(const key of FRAME_KEYS){
  const cfg=A.MON_SPRITES[key];
  t.ok(cfg && cfg.frames===true && typeof cfg.dir==='string', key+' is a per-frame guard');
  if(!cfg) continue;
  t.ok(cfg.clips[cfg.idle] && cfg.clips[cfg.atk], key+' has its idle + attack clips');
  for(const c in cfg.clips){
    const cl=cfg.clips[c];
    t.ok(cl.seq && cl.n>=1 && cl.fps>0 && cl.s>0 && cl.ax>=0 && cl.ay>0, key+'.'+c+' clip carries seq/n/fps/s/ax/ay');
    const nat=NATIVE[cl.seq];
    t.ok(!!nat, key+'.'+c+' uses a known sequence ('+cl.seq+')');
    if(nat) t.ok(cl.ax<=nat[0] && cl.ay<=nat[1], key+'.'+c+' anchor sits inside the '+nat.join('x')+' canvas');
    for(let k=0;k<cl.n;k++){
      const rel=framePath(cfg, cl, k), abs=join(GAME, rel);
      if(KNOWN_MISSING.has(rel) && !existsSync(abs)) continue;
      t.ok(existsSync(abs), rel+' exists');
      if(!existsSync(abs)) continue;
      onDisk.add(rel);
      if(nat){ const [w,h]=pngSize(abs); t.ok(w===nat[0] && h===nat[1], rel+' is '+w+'x'+h+' (want '+nat.join('x')+')'); }
    }
  }
}
t.ok(onDisk.size>=61, 'all 61 converted guard frames are on disk ('+onDisk.size+')');
t.ok(existsSync(join(GAME,'sprites/orc/orc_idle.png')), 'the legacy orc sheet is kept as the fallback');
t.ok(A.MON_SPRITES.orc.fallback==='orcSheet' && A.MON_SPRITES.orcSheet && A.MON_SPRITES.orcSheet.base==='sprites/orc/orc_',
  'orc falls back to the legacy orcSheet entry');
t.ok(A.MON_SPRITES.harpy.hover===14, 'the harpy hovers 14px');
t.ok(A.MON_SPRITES.mimic.disguise==='chest' && A.MON_SPRITES.mimic.reveal==='transform' && A.MON_SPRITES.mimic.clips.transform.once,
  'the mimic disguises as a chest and reveals with a one-shot transform');
t.ok(Object.keys(A.MON_IMG.mimic).sort().join()==='mimic_attack,mimic_chest,mimic_transform,mimic_walk',
  'mimic idle + walk share one loaded sequence (4 seqs for 5 clips)');
for(const s of ['edrik','vesna']){
  const cfg=A.MON_SPRITES['corrupt_'+s];
  t.ok(cfg && cfg.dirRow===1 && cfg.scale===0.9, 'corrupt_'+s+' LPC skin config (row 1 faces left, scale 0.9)');
  if(!cfg) continue;
  for(const c in cfg.clips){ const cl=cfg.clips[c], p=join(GAME, cfg.base+cl.sheet+'.png');
    t.ok(existsSync(p), cfg.base+cl.sheet+'.png exists');
    if(existsSync(p)){ const [w,h]=pngSize(p); t.ok(w===cl.fw*cl.n && h===cl.fh*4, s+' '+cl.sheet+' sheet is '+cl.n+'x4 frames of '+cl.fw+'px'); } }
}
t.ok(A.CORRUPT_SKINS.join()==='edrik,vesna', 'two Corrupted skins');

// ---- 2) the loader against the REAL files (and the 0-based _0 naming) ----------
{
  const LibImage=globalThis.Image;
  let vfs=null;     // optional virtual file set, else the real disk
  globalThis.Image = class {
    constructor(){ this._ok=false; }
    set src(v){ this._src=v; const hit = vfs ? vfs.has(v) : existsSync(join(GAME, v)); (hit ? this.onload : this.onerror)?.(); }
    get src(){ return this._src; }
    get width(){ return 100; } get height(){ return 100; }
  };
  // every frame file on disk loads (and only those); a clip may miss at most one
  for(const key of FRAME_KEYS){ const cfg=A.MON_SPRITES[key];
    for(const c in cfg.clips){ const cl=cfg.clips[c]; if(cl.n<2) continue;
      const seq=A.loadFrameSeq(cfg.dir+cl.seq, cl.n), got=seq.filter(im=>im._ok).length;
      const want=[...Array(cl.n).keys()].filter(k=>existsSync(join(GAME, framePath(cfg, cl, k)))).length;
      t.ok(got===want && got>=cl.n-1, key+'.'+c+' loads from disk ('+got+'/'+cl.n+')'); } }
  vfs=new Set(['h/m_02.png','h/m_03.png']);
  const hole=A.loadFrameSeq('h/m', 3);
  t.ok(!hole[0]._ok && hole[1]._ok && hole[2]._ok, 'a missing _01 (both namings) is a hole, the rest load');
  vfs=new Set(['x/zz_0.png','x/zz_1.png']);
  const z=A.loadFrameSeq('x/zz', 3);
  t.ok(z[0]._ok && z[1]._ok && !z[2]._ok && z[0].src==='x/zz_0.png', 'the 0-based <id>_0.png naming also loads');
  vfs=null;
  globalThis.Image=LibImage;
}

// ---- 3) clip rules --------------------------------------------------------------
{
  const M=A.MON_SPRITES.mimic, now=100000;
  t.ok(A.monClipName(M, null, true, true, now)==='chest', 'build preview (no live guard): the mimic is a chest');
  t.ok(A.monClipName(M, {ambushDone:false}, true, true, now)==='chest', 'unsprung mimic stays a chest, even mid-fight');
  t.ok(A.monClipName(M, {ambushDone:true, ambushAt:now}, false, true, now)==='transform', 'the ambush strike starts the transform');
  t.ok(A.monClipName(M, {ambushDone:true, ambushAt:now-299}, false, true, now)==='transform', 'transform lasts 3 frames at 10fps');
  t.ok(A.monClipName(M, {ambushDone:true, ambushAt:now-1000}, true, false, now)==='walk', 'sprung mimic walks to the pack');
  t.ok(A.monClipName(M, {ambushDone:true, ambushAt:now-1000}, false, true, now)==='attack', 'then fights with its attack clip');
  t.ok(A.monClipName(M, {ambushDone:true, ambushAt:now-1000}, false, false, now)==='idle', 'and idles between fights');
  const H=A.MON_SPRITES.harpy;
  t.ok(A.monClipName(H, null, true, false, now)==='idle', 'the harpy has no walk clip: it glides on its idle wingbeat');
  t.ok(A.monClipName(H, null, false, true, now)==='attack', 'the harpy attacks');
  t.ok(A.monClipName(A.MON_SPRITES.sentinel, null, true, false, now)==='walk', 'the sentinel walks');
}

// ---- 4) drawing a guard directly, with a recording canvas ------------------------
function recCtx(scaleA){
  const calls={draw:[], smooth:[], xf:[]}; let sm=false;
  const c={ drawImage:(...a)=>calls.draw.push(a), save(){}, restore(){}, translate:(...a)=>calls.xf.push(['t',...a]),
    scale:(...a)=>calls.xf.push(['s',...a]), getTransform:()=>({a:scaleA}),
    get imageSmoothingEnabled(){ return sm; }, set imageSmoothingEnabled(v){ sm=v; calls.smooth.push(v); } };
  return { c, calls };
}
function freshBuild(rooms){
  A.G = A.freshGame('campaign'); A.chooseBoss(BOSS);
  A.G.slots=rooms.length; A.G.rooms=rooms; A.G.phase='build'; A.buildCells();
}
const origX=A.X;
try{
  freshBuild([A.makeRoom('orc',1)]);
  const R=A.G.rooms[0], C=A.G.cells[0], fy=A.FLOOR-A.LIFT;
  for(const key of FRAME_KEYS){
    t.ok(A.monSpriteReady(key), key+' reads as ready once its frames load');
    const { c, calls } = recCtx(2); A.X=c;
    const ok=A.drawMonsterSprite(100, fy, R, C, key, true, false, 0, 1, null);
    t.ok(ok===true && calls.draw.length===1, key+' draws one frame through drawMonsterSprite');
    t.ok(calls.smooth.length===2 && calls.smooth[1]===false, key+' restores the smoothing flag after drawing');
  }
  // anchor + size maths on the orc idle clip (Image stub is 100x100)
  { const { c, calls } = recCtx(2.5); A.X=c;
    A.drawMonsterSprite(100, fy, R, C, 'orc', true, false, 0, 1, null);
    const [im,dx,dy,dw,dh]=calls.draw[0], cl=A.MON_SPRITES.orc.clips.idle;
    t.ok(A.MON_IMG.orc.orc_idle.includes(im), 'an idle orc draws an orc_idle frame');
    t.ok(dx===Math.round(100-cl.ax*cl.s) && dy===Math.round(fy-cl.ay*cl.s) && dw===Math.round(100*cl.s) && dh===Math.round(100*cl.s),
      'frame drawn at the foot anchor, scaled by s ('+[dx,dy,dw,dh].join(',')+')');
    t.ok(calls.smooth[0]===false, 'orc at 0.566 x 2.5 device px stays crisp (nearest-neighbour)'); }
  { const { c, calls } = recCtx(1); A.X=c;
    A.drawMonsterSprite(100, fy, R, C, 'mimic', true, false, 0, 1, null);
    t.ok(calls.draw[0][0]===A.MON_IMG.mimic.mimic_chest[0], 'the build preview mimic draws the chest');
    t.ok(calls.smooth[0]===true, 'the small chest (0.256 x 1 device px) is drawn smoothed, not pixel-dropped'); }
  { const now=performance.now(), g={ambushDone:true, ambushAt:now-150};
    const { c, calls } = recCtx(2); A.X=c;
    A.drawMonsterSprite(100, fy, R, C, 'mimic', true, false, 0, 1, g);
    t.ok(calls.draw[0][0]===A.MON_IMG.mimic.mimic_transform[1], '150ms after the ambush the mimic shows transform frame 2'); }
  { const g={ambushDone:true, ambushAt:performance.now()-5000};
    const { c, calls } = recCtx(2); A.X=c;
    A.drawMonsterSprite(100, fy, R, C, 'mimic', true, false, 0, 1, g);
    t.ok(A.MON_IMG.mimic.mimic_walk.includes(calls.draw[0][0]), 'long after the ambush the mimic idles on its walk frames');
    t.ok(g._mc_mimic==='idle', 'a live guard keeps its own clip timer'); }
  // a hole in a clip is skipped; a whole missing clip falls back to idle
  { const seq=A.MON_IMG.mimic.mimic_attack; seq[0]._ok=false;
    const cells=A.G.cells; A.G.phase='run'; A.G.heroes=[{state:'fighting', cellIndex:0}];
    const g={ambushDone:true, ambushAt:performance.now()-5000};
    const { c, calls } = recCtx(2); A.X=c;
    const ok=A.drawMonsterSprite(100, fy, R, cells[0], 'mimic', true, false, 0, 1, g);
    t.ok(ok && seq.slice(1).includes(calls.draw[0][0]), 'mimic attack skips the missing _01 frame');
    const sent=A.MON_IMG.sentinel.sentinel_attack; sent.forEach(im=>im._ok=false);
    const r2=recCtx(2); A.X=r2.c;
    const ok2=A.drawMonsterSprite(100, fy, R, cells[0], 'sentinel', true, false, 0, 1, null);
    t.ok(ok2 && A.MON_IMG.sentinel.sentinel_idle.includes(r2.calls.draw[0][0]), 'a sentinel with no attack frames fights on its idle clip');
    sent.forEach(im=>im._ok=true); seq[0]._ok=true; A.G.heroes=[]; A.G.phase='build'; }
  // the flip flag (for future right-facing art) mirrors about the anchor
  { const cfg=A.MON_SPRITES.sentinel; cfg.flip=true;
    const { c, calls } = recCtx(2); A.X=c;
    A.drawMonsterSprite(100, fy, R, C, 'sentinel', true, false, 0, 1, null);
    t.ok(calls.xf.some(x=>x[0]==='s' && x[1]===-1) && calls.draw.length===1, 'flip:true mirrors the frame');
    delete cfg.flip; }
  // orc: new frames missing -> the legacy sheet; both missing -> not ready (emoji/procedural)
  { const all=Object.values(A.MON_IMG.orc).flat(); all.forEach(im=>im._ok=false);
    t.ok(A.monSpriteReady('orc'), 'orc with no frames is still ready through orcSheet');
    const { c, calls } = recCtx(2); A.X=c;
    const ok=A.drawMonsterSprite(100, fy, R, C, 'orc', true, false, 0, 1, null);
    t.ok(ok && calls.draw[0][0]===A.MON_IMG.orcSheet.idle, 'orc falls back to drawing the legacy sheet');
    A.MON_IMG.orcSheet.idle._ok=false;
    t.ok(!A.monSpriteReady('orc'), 'orc with neither art is not ready (the procedural guard draws)');
    const r2=recCtx(2); A.X=r2.c;
    t.ok(A.drawMonsterSprite(100, fy, R, C, 'orc', true, false, 0, 1, null)===false, 'drawMonsterSprite reports it drew nothing');
    all.forEach(im=>im._ok=true); A.MON_IMG.orcSheet.idle._ok=true; }
}catch(e){ t.ok(false, 'direct guard draws threw: '+e.message+'\n'+String(e.stack||'').split('\n').slice(0,4).join('\n')); }
A.X=origX;

// ---- 5) Corrupted looks ------------------------------------------------------------
{
  t.ok(A.corruptSkinKey('Edrik')==='corrupt_edrik', 'a thrall named Edrik wears Edrik');
  t.ok(A.corruptSkinKey(' vesna ')==='corrupt_vesna', 'a thrall named Vesna wears Vesna (case/space-insensitive)');
  const names=['Gwen','Bram','Aldric','Mira','Thane','Isolde','Corin','Hale','Rook','Sable','Thrall','Corrupted'];
  const looks=names.map(n=>A.corruptSkinKey(n));
  t.ok(looks.every(k=>k==='corrupt_edrik'||k==='corrupt_vesna'), 'every other name gets one of the two skins');
  t.ok(looks.includes('corrupt_edrik') && looks.includes('corrupt_vesna'), 'the name hash spreads thralls over both skins');
  t.ok(names.every((n,i)=>A.corruptSkinKey(n)===looks[i]), 'the same name always gets the same look');
  t.ok(A.corruptSkinKey(undefined)!==null, 'an unnamed thrall still gets a skin');
  const room={kills:0};
  t.ok(A.corruptLookKey('Vesna', room)==='corrupt_vesna', 'a fresh Corrupted room wears the LPC skin');
  room.kills=A.CORRUPT_DEMON_KILLS-1;
  t.ok(A.corruptLookKey('Vesna', room)==='corrupt_vesna', 'still the skin one kill short of the demon');
  room.kills=A.CORRUPT_DEMON_KILLS;
  t.ok(A.corruptLookKey('Vesna', room)==='minion', 'a thrall room with 3 kills turns into the painted demon');
  // fallbacks down the chain
  const V=A.MON_IMG.corrupt_vesna.idle, E=A.MON_IMG.corrupt_edrik.idle, D=Object.values(A.MON_IMG.minion).flat();
  D.forEach(im=>im._ok=false);
  t.ok(A.corruptLookKey('Vesna', room)==='corrupt_vesna', 'veteran demon art missing: back to the skin');
  V._ok=false;
  t.ok(A.corruptSkinKey('Vesna')==='corrupt_edrik', 'Vesna art missing: a Vesna thrall wears Edrik');
  E._ok=false;
  t.ok(A.corruptSkinKey('Vesna')===null && A.corruptLookKey('Vesna', {kills:0})==='minion', 'no skins: falls to the minion key');
  t.ok(!A.monSpriteReady('minion'), '...which with no demon art is not ready, so the procedural wraith draws');
  // build + run draw with every Corrupted look missing must still be clean
  try{
    freshBuild([A.makeRoom('minion',1,{label:'Vesna',minHp:30,minAtk:7})]);
    for(let i=0;i<3;i++) A.draw();
    t.ok(true, 'build draw with no Corrupted art at all (procedural wraith) is clean');
  }catch(e){ t.ok(false, 'wraith fallback draw threw: '+e.message); }
  D.forEach(im=>im._ok=true); V._ok=true; E._ok=true;
}

// ---- 6) the guard carries its thrall's name; combat stats are untouched ----------
function freshRun(rooms){
  A.G = A.freshGame('campaign'); A.chooseBoss(BOSS);
  A.G.slots=rooms.length; A.G.rooms=rooms;
  if(typeof A.applyRunes==='function') A.applyRunes();
  A.prepCampaignWave(); A.startWave();
}
{
  freshRun([A.makeRoom('minion',1,{label:'Vesna',minHp:30,minAtk:7})]);
  const g1=A.G.cells[0].guards[0];
  freshRun([A.makeRoom('minion',1,{label:'Gwen',minHp:30,minAtk:7})]);
  const g2=A.G.cells[0].guards[0];
  t.ok(g1.label==='Vesna' && g2.label==='Gwen', 'startWave copies the thrall name onto its guard');
  t.ok(g1.hp===g2.hp && g1.atk===g2.atk && g1.maxHp===g2.maxHp, 'the label is draw-only: same hp/atk for any name');
  freshRun([A.makeRoom('orc',1)]);
  t.ok(A.G.cells[0].guards[0].label===undefined, 'non-thrall guards carry no label');
  // build preview reads each thrall's own name from its unit
  const r=A.makeRoom('minion',1,{label:'Edrik',minHp:30,minAtk:7});
  r.cap=3; r.units.push(A.makeUnit('spike',1)); r.units.push(A.makeUnit('minion',1,{label:'Vesna',minHp:30,minAtk:7}));
  const info=A.roomDrawInfo(r);
  t.ok(info.guardUnits.length===info.guardParts.length && info.guardUnits.map(u=>u.label).join()==='Edrik,Vesna',
    'roomDrawInfo lists guard units in guardParts order (Edrik, Vesna)');
}

// ---- 7) HP bar: hidden on an unsprung mimic, raised over the harpy ----------------
try{
  freshRun([A.makeRoom('mimic',1), A.makeRoom('harpy',1)]);
  const mim=A.G.cells[0].mon, hp=A.G.cells[1].mon;
  t.ok(mim && mim.type==='mimic' && mim.ambush && !mim.ambushDone, 'a fresh wave re-disguises the mimic');
  const orig=A.bar; let bars=[];
  A.bar=function(x,y,w,h,f,c,ent){ bars.push({y,ent}); return orig.apply(this, arguments); };
  A.draw();
  t.ok(!bars.some(b=>b.ent===mim), 'no HP bar over an unsprung mimic');
  const hb=bars.find(b=>b.ent===hp);
  t.ok(hb && hb.y===A.FLOOR-78-14, 'the harpy HP bar rides 14px higher ('+(hb&&hb.y)+')');
  mim.ambushDone=true; mim.ambushAt=performance.now()-5000; bars=[];
  A.draw(); A.draw();
  t.ok(bars.some(b=>b.ent===mim), 'the sprung mimic shows its HP bar');
  t.ok(typeof mim._pinF==='number', 'the sprung mimic tracks its own position to scuttle to the pack');
  A.bar=orig;
}catch(e){ t.ok(false, 'HP bar checks threw: '+e.message); }

// ---- 8) a full wave through update()+draw() with all the new guards ---------------
let threw=null;
try{
  freshRun([
    A.makeRoom('mimic',2),
    A.makeRoom('harpy',2),
    A.makeRoom('sentinel',1),
    A.makeRoom('orc',2),
    A.makeRoom('minion',2,{label:'Edrik',minHp:30,minAtk:7}),
    (()=>{ const r=A.makeRoom('minion',2,{label:'Gwen',minHp:30,minAtk:7}); r.cap=3;
      r.units.push(A.makeUnit('minion',2,{label:'Vesna',minHp:30,minAtk:7})); r.units.push(A.makeUnit('mimic',2)); return r; })(),
    (()=>{ const r=A.makeRoom('minion',2,{label:'Mira',minHp:30,minAtk:7}); r.kills=A.VET_KILLS*3; return r; })(),   // veteran demon
  ]);
  t.ok(A.G.phase==='run', 'wave started');
  const mimic=A.G.cells[0].mon;
  let frames=0, sawChest=false, sawSprung=false;
  for(; frames<1500; frames++){
    A.update(0.05); A.draw();
    if(mimic.alive && !mimic.ambushDone) sawChest=true;
    if(mimic.ambushDone) sawSprung=true;
    if(A.G.phase!=='run') break;
  }
  t.ok(frames>0, 'ran '+frames+' run frames with every new guard on the board');
  t.ok(sawChest, 'the mimic sat disguised before its first strike');
  t.ok(sawSprung && typeof mimic.ambushAt==='number', 'the mimic sprang its ambush and stamped ambushAt for the transform');
  // build phase afterwards (between waves), and again with a disguised mimic preview
  freshBuild([A.makeRoom('mimic',1), A.makeRoom('harpy',1), A.makeRoom('minion',1,{label:'Vesna',minHp:30,minAtk:7})]);
  for(let i=0;i<5;i++){ A.update(0.05); A.draw(); }
}catch(e){ threw=e; }
t.ok(!threw, 'update()/draw() with the new guard art never threw'
  + (threw ? (': '+threw.message+'\n'+String(threw.stack||'').split('\n').slice(0,4).join('\n')) : ''));

// ---- 9) a disguised mimic lies in wait at rest: the guard pack does not walk out to meet the hero ----
try{
  A.G = A.freshGame('campaign'); A.chooseBoss(BOSS);
  A.G.slots = 1; A.G.rooms = [A.makeRoom('mimic', 1)];
  A.prepCampaignWave(); A.startWave();
  const room=A.G.rooms[0], cell=A.G.cells[0];
  let minF=1, sprung=false;
  for(let i=0;i<400 && A.G.phase==='run';i++){ A.update(0.05); A.draw();
    if(cell.mon && !cell.mon.ambushDone && room._monF!=null) minF=Math.min(minF, room._monF);
    if(cell.mon && cell.mon.ambushDone) { sprung=true; break; } }
  t.ok(minF>=0.73, 'an unsprung mimic holds its rest spot (min '+minF.toFixed(3)+')');
  t.ok(sprung, 'the hero reaches the chest and the ambush springs');
}catch(e){ t.ok(false, 'mimic lurk threw: '+e.message); }
t.done();
