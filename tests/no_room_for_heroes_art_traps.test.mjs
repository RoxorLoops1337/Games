// Trap art: Web Snare (web), Wailing Horn (horn), Confusion Censer (censer) and
// the rooted-hero web cocoon (rooms/fx/web_root.png). Checks the exported frames
// on disk (1/2-size, contiguous), the new animation/layer/phase/light config, the
// layout defaults + rooms/layout.json + align.html entries, the per-trap loop
// speed and strike profiles, and that update()/draw() run clean with the art both
// loaded and missing (procedural fallback).
//
//   node tests/no_room_for_heroes_art_traps.test.mjs
import { loadGame, harness } from './no_room_for_heroes_lib.mjs';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const GAME = join(dirname(fileURLToPath(import.meta.url)), '..', 'no_room_for_heroes');
const t = harness('trap art (web/horn/censer)');

// ---- 1) assets on disk --------------------------------------------------------
function pngSize(p){ const b=readFileSync(p); return [b.readUInt32BE(16), b.readUInt32BE(20)]; }
const SEQ = { web:{n:6, w:668, h:531}, horn:{n:4, w:534, h:435}, censer:{n:4, w:749, h:540} };
for(const id in SEQ){
  const s=SEQ[id];
  for(let k=1;k<=s.n;k++){
    const f=join(GAME,'rooms','traps',id+'_'+String(k).padStart(2,'0')+'.png');
    t.ok(existsSync(f), 'frame on disk: rooms/traps/'+id+'_'+String(k).padStart(2,'0')+'.png');
    if(existsSync(f)){ const [w,h]=pngSize(f); t.ok(w===s.w && h===s.h, id+' frame '+k+' is '+s.w+'x'+s.h+' (got '+w+'x'+h+')'); }
  }
}
// censer_08 ships under its real index; it joins the sequence once 05-07 land
const c8=join(GAME,'rooms','traps','censer_08.png');
t.ok(existsSync(c8), 'censer_08.png shipped under its real index');
if(existsSync(c8)){ const [w,h]=pngSize(c8); t.ok(w===749 && h===540, 'censer_08 is 749x540'); }
const wr=join(GAME,'rooms','fx','web_root.png');
t.ok(existsSync(wr), 'hero effect on disk: rooms/fx/web_root.png');
if(existsSync(wr)){ const [w,h]=pngSize(wr); t.ok(w===200 && h===162, 'web_root.png is 200x162'); }

// ---- 2) layout.json + align.html ----------------------------------------------
const LJ = JSON.parse(readFileSync(join(GAME,'rooms','layout.json'),'utf8'));
t.ok(LJ.traps.web && LJ.traps.web[0].art==='web' && LJ.traps.web[0].layer===0 && LJ.traps.web[0].mode==='loop', 'layout.json: web part (layer 0, loop)');
t.ok(LJ.traps.horn && LJ.traps.horn[0].art==='horn' && LJ.traps.horn[0].layer===3 && !LJ.traps.horn[0].flip, 'layout.json: horn part (layer 3, unflipped)');
t.ok(LJ.traps.censer && LJ.traps.censer[0].art==='censer' && LJ.traps.censer[0].layer===5 && !LJ.traps.censer[0].flip, 'layout.json: censer part (layer 5, unflipped)');
t.ok(['web','horn','censer'].every(k=>LJ.traps[k][0].layer < LJ.heroLayer), 'all three sit behind the party (below heroLayer '+LJ.heroLayer+')');
t.ok((LJ.lights||[]).some(l=>l.attach==='censer'), 'layout.json: censer accent light');
const AL = readFileSync(join(GAME,'align.html'),'utf8');
for(const id of ['web','horn','censer']){
  t.ok(AL.includes("['"+id+"','rooms/traps/']"), 'align.html probes '+id);
  t.ok(new RegExp("trap:'"+id+"',\\s*art:'"+id+"'").test(AL), 'align.html has a '+id+' piece');
}
t.ok(/LOOP_MS=\{web:150\}/.test(AL) && /censer:\{rise:560,fwd:true\}/.test(AL) && /horn:\{rise:120,fall:620\}/.test(AL), 'align.html mirrors the loop speed + strike timing');
t.ok(/light:'censer'/.test(AL), 'align.html has the censer light piece');

// ---- 3) game config --------------------------------------------------------------
const A = loadGame(`freshGame,chooseBoss,buildCells,prepCampaignWave,startWave,update,draw,render,
  makeRoom,BOSSES,ART,LAYOUT,TRAP_ANIM,TRAP_LOOP_MS,TRAP_TIMING,TRAP_PHASE,TRAP_LAYER,LIGHT_COL,ROOMS,
  strikeIdx,strikeFade,drawTrapPart,drawTrapProp,drawWebRoot,WEB_ROOT_IMG,FLOOR,
  get G(){return G;},set G(v){G=v;},
  get X(){return X;},set X(v){X=v;},
  get HERO_LAYER(){return HERO_LAYER;},set HERO_LAYER(v){HERO_LAYER=v;}`);
const BOSS = Object.keys(A.BOSSES)[0];

t.ok(A.TRAP_ANIM.web==='loop', 'TRAP_ANIM.web is loop');
t.ok(!A.TRAP_ANIM.horn && !A.TRAP_ANIM.censer, 'horn + censer stay strike-synced');
t.ok(A.TRAP_LOOP_MS.web===150, 'TRAP_LOOP_MS.web = 150ms/frame');
t.ok(A.TRAP_TIMING.horn && A.TRAP_TIMING.horn.rise===120 && A.TRAP_TIMING.horn.fall===620, 'TRAP_TIMING.horn {rise:120, fall:620}');
t.ok(A.TRAP_TIMING.censer && A.TRAP_TIMING.censer.rise===560 && A.TRAP_TIMING.censer.fwd===true, 'TRAP_TIMING.censer {rise:560, fwd:true}');
t.ok(A.TRAP_PHASE.horn===500 && A.TRAP_PHASE.censer===1500, 'TRAP_PHASE horn 500 / censer 1500');
t.ok(A.TRAP_LAYER.web===0 && A.TRAP_LAYER.horn===3 && A.TRAP_LAYER.censer===5, 'TRAP_LAYER web 0 / horn 3 / censer 5');
t.ok(A.LIGHT_COL.censer==='#b86bff', 'LIGHT_COL.censer is violet');
for(const id of ['web','horn','censer']){
  const p=A.LAYOUT.traps[id];
  t.ok(Array.isArray(p) && p[0].art===id && p[0].h>0, 'LAYOUT.traps.'+id+' default part');
  t.ok(A.ROOMS[id] && A.ROOMS[id].kind==='trap', id+' is a trap room id');
  t.ok(!!A.ART[id], 'artProbe registered '+id);
}

// ---- 4) animation timing (stubbed clock) ---------------------------------------
const realPerf = globalThis.performance;
let NOW = 1e6;
Object.defineProperty(globalThis, 'performance', { value:{ now:()=>NOW }, configurable:true, writable:true });
// censer: plays forward over 560ms, then snaps to rest (never reverses)
t.ok(A.strikeIdx(4, NOW-300, 'censer')===2, 'censer mid-puff frame (300ms -> 2)');
t.ok(A.strikeIdx(4, NOW-600, 'censer')===0, 'censer snaps back to rest after the puff (no reverse)');
// horn: snaps up in 120ms, recedes over 620ms
t.ok(A.strikeIdx(4, NOW-100, 'horn')===3, 'horn reaches the wail frame inside 120ms');
t.ok(A.strikeIdx(4, NOW-400, 'horn')===2, 'horn rings recede (reverse) after the rise');
t.ok(A.strikeIdx(4, NOW-900, 'horn')===0, 'horn back at rest after rise+fall');

// record what the game blits: swap the ctx for a recorder that keeps real state
const realX = A.X;
let calls = [];
function recorder(){
  const st = { globalAlpha:1, imageSmoothingEnabled:false, globalCompositeOperation:'source-over' };
  return new Proxy(st, {
    get(o,k){
      if(k==='drawImage') return (...a)=>{ calls.push({ img:a[0], args:a.slice(1), alpha:o.globalAlpha }); };
      if(k in o) return o[k];
      return realX[k];
    },
    set(o,k,v){ o[k]=v; return true; },
  });
}
// mark every probed frame loaded (the lib's Image stub never sets _ok on frames)
function artLoaded(on){
  for(const id of ['web','horn','censer']){
    const rec=A.ART[id]; if(!rec) continue;
    rec.frames.forEach((f,i)=>{ if(f){ f._ok=on; f._tag=id+':'+i; } });
  }
}
try{
  A.G = A.freshGame('campaign'); A.chooseBoss(BOSS); A.G.phase='run';
  artLoaded(true);
  A.X = recorder();
  const web = A.LAYOUT.traps.web[0], N = A.ART.web.frames.length;
  const idxAt = T => { NOW=T; calls=[]; A.drawTrapPart(0,200,'web',web,0,null); const c=calls.find(c=>c.img&&c.img._tag); return c?+c.img._tag.split(':')[1]:-1; };
  const base = 150*N*1000;                                          // an exact cycle boundary
  const i0 = idxAt(base), i1 = idxAt(base+140), i2 = idxAt(base+150), i3 = idxAt(base+300);
  t.ok(i0>=0, 'web art draws once its frames load');
  t.ok(i1===i0, 'web holds a frame for 140ms (slower than the 110ms default)');
  t.ok(i2===(i0+1)%N && i3===(i0+2)%N, 'web advances one frame per 150ms ('+[i0,i1,i2,i3].join(',')+')');
  // a layout part can override the loop speed with `ms`
  NOW=base; calls=[]; A.drawTrapPart(0,200,'web',Object.assign({},web,{ms:50}),0,null);
  const j0=+calls.find(c=>c.img&&c.img._tag).img._tag.split(':')[1];
  NOW=base+50; calls=[]; A.drawTrapPart(0,200,'web',Object.assign({},web,{ms:50}),0,null);
  const j1=+calls.find(c=>c.img&&c.img._tag).img._tag.split(':')[1];
  t.ok(j1===(j0+1)%N, 'a part-level ms overrides TRAP_LOOP_MS');

  // censer fired in a run: forward puff + violet accent glow (a lighter-blended blit)
  const cell={ index:0, traps:[{ type:'censer', firedAt:NOW-10 }] };
  calls=[]; t.ok(A.drawTrapPart(0,200,'censer',A.LAYOUT.traps.censer[0],0,cell)===true, 'censer art draws in the run phase');
  t.ok(calls.length>=2, 'censer draws its frame plus the accent glow ('+calls.length+' blits)');
  cell.traps[0].firedAt=NOW-400; calls=[];
  A.drawTrapPart(0,200,'censer',A.LAYOUT.traps.censer[0],0,cell);
  t.ok(calls[0] && calls[0].img._tag==='censer:'+Math.floor(400/560*A.ART.censer.frames.length), 'censer frame follows the forward strike ('+(calls[0]&&calls[0].img._tag)+')');
  calls=[]; A.drawTrapPart(0,200,'horn',A.LAYOUT.traps.horn[0],0,{index:0,traps:[{type:'horn',firedAt:NOW-60}]});
  t.ok(calls.length===1, 'horn draws one blit (no accent glow)');

  // web root cocoon: anchored at the feet, sized to the figure, fades out at the end
  A.X = recorder();                                                 // fresh state (the glow above left alpha/blend set)
  calls=[]; A.drawWebRoot(100, 300, {root:1.0}, 250);
  const c0=calls.find(c=>c.img===A.WEB_ROOT_IMG);
  t.ok(!!c0, 'drawWebRoot blits rooms/fx/web_root.png when loaded');
  if(c0){ const [x,y,w,h]=c0.args;
    t.ok(h===28 && y===300-28+1 && x===Math.round(100-w/2), 'web root anchored at the feet, 0.55x figure height (min 26)');
    t.ok(Math.abs(c0.alpha-1)<1e-9, 'full opacity while rooted'); }
  calls=[]; A.drawWebRoot(100, 300, {root:0.1}, 150);
  const c1=calls.find(c=>c.img===A.WEB_ROOT_IMG);
  t.ok(c1 && Math.abs(c1.alpha-0.4)<1e-9 && c1.args[3]===64, 'web root fades over the last 0.25s and caps at 64px tall');
  A.WEB_ROOT_IMG._ok=false; calls=[];
  let fbThrew=null; try{ A.drawWebRoot(100,300,{root:1.0},250); }catch(e){ fbThrew=e; }
  t.ok(!fbThrew && !calls.some(c=>c.img===A.WEB_ROOT_IMG), 'missing web_root art falls back to a drawn veil');
  A.WEB_ROOT_IMG._ok=true;
}catch(e){ t.ok(false, 'direct trap/web-root draw threw: '+e.message+'\n'+String(e.stack||'').split('\n').slice(0,4).join('\n')); }
finally{
  A.X = realX;
  Object.defineProperty(globalThis, 'performance', { value:realPerf, configurable:true, writable:true });
}

// ---- 5) full update()/draw() loops -----------------------------------------------
function freshRun(types){
  A.G = A.freshGame('campaign'); A.chooseBoss(BOSS);
  A.G.slots = types.length;
  A.G.rooms = types.map(tp=>A.makeRoom(tp, 2));
  A.prepCampaignWave(); A.startWave();
  // rogues disarm every trap room they enter, so a random all-rogue party would fire
  // nothing; make the wave deterministic for the "traps fired" checks below
  for(const h of A.G.heroes||[]) if(h && h.cls==='rogue') h.cls='warrior';
}
for(const loaded of [true, false]){
  const tag = loaded ? 'art loaded' : 'art missing (procedural fallback)';
  try{
    artLoaded(loaded);
    A.HERO_LAYER = loaded ? 4 : 999;          // with art, the censer (layer 5) takes the deferred front-of-party path
    // build phase: idle strike preview with the per-trap phase offsets
    A.G = A.freshGame('campaign'); A.chooseBoss(BOSS);
    A.G.slots=3; A.G.rooms=[A.makeRoom('web',1), A.makeRoom('horn',1), A.makeRoom('censer',1)];
    A.G.phase='build'; A.buildCells(); A.prepCampaignWave();
    for(let i=0;i<8;i++){ A.render(); A.update(0.05); A.draw(); }
    t.ok(true, 'build-phase draw clean ('+tag+')');
    // run phase: heroes get snared, wailed at and confused
    freshRun(['web','horn','censer','web']);
    t.ok(A.G.phase==='run', 'wave started ('+tag+')');
    let rooted=0, frames=0, cocoon=false;
    for(; frames<900; frames++){
      A.update(0.05);
      for(const h of A.G.heroes||[]) if(h && h.root>0) rooted++;
      if(frames===40) for(const h of A.G.heroes||[]) if(h && h.state!=='dead'){ h.root=1.0; }   // force the cocoon on screen
      if(frames===41) for(const h of A.G.heroes||[]) if(h && h.state!=='dead'){ h.root=0.1; }   // and the fade-out path
      if(frames===40){ A.X=recorder(); calls=[]; }
      A.draw();
      if(frames===40){ cocoon=calls.some(c=>c.img===A.WEB_ROOT_IMG); A.X=realX; }
      if(A.G.phase!=='run') break;
    }
    t.ok(frames>0 && rooted>0, 'ran '+frames+' run frames with rooted heroes drawn ('+tag+')');
    t.ok(cocoon, 'drawHero puts the web cocoon on a rooted hero ('+tag+')');
    const fired=(A.G.cells||[]).some(c=>(c.traps||[]).some(tr=>['web','horn','censer'].includes(tr.type) && tr.firedAt));
    t.ok(fired, 'web/horn/censer traps fired and stamped firedAt ('+tag+')');
  }catch(e){ t.ok(false, 'update/draw threw ('+tag+'): '+e.message+'\n'+String(e.stack||'').split('\n').slice(0,4).join('\n')); }
}
A.HERO_LAYER = 999;
// ---- 6) the censer's smoke cloud dissolves instead of vanishing in one frame ----
{
  const T=A.TRAP_TIMING.censer, now=performance.now();
  t.ok(T && T.fwd && T.fade>0 && T.rise+T.fade<850, 'censer: forward-only with a fade that fits inside its 0.85s fire rate');
  t.ok(A.strikeFade(now-T.rise-10,'censer')>0.8, 'just after the puff peaks the last frame is still nearly opaque');
  t.ok(A.strikeFade(now-T.rise-T.fade-20,'censer')===0, 'after the fade window the ghost is gone');
  t.ok(A.strikeFade(now-10,'censer')===0 && A.strikeFade(null,'censer')===0 && A.strikeFade(now-T.rise-10,'spike')===0,
    'no ghost while rising, when unfired, or on traps without a fade');
}
t.done();
