// Wildwalk — headless smoke + logic suite.
//
// Wildwalk lives in one self-contained file (wildwalk/index.html) as an inline
// IIFE that draws to a canvas. This harness stubs a full no-op DOM + 2d context,
// extracts the inline <script>, injects a tiny expose hook (test-only, never
// shipped), and evals it — then drives the real game through every state to
// catch runtime/render errors, plus asserts core flow (walk→battle→choice,
// catch/kill/release, full-party swap picker). Run: node tests/wildwalk.test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML = path.join(__dirname, '..', 'wildwalk', 'index.html');

let passed = 0, failed = 0;
function test(name, fn){ try{ fn(); passed++; } catch(e){ failed++; console.error(`FAIL ${name}: ${e.message}`); } }
function assert(cond, msg){ if(!cond) throw new Error(msg||'assertion failed'); }

// ---- build a fresh sandboxed game instance ----
function boot(){
  const gradient = { addColorStop(){} };
  const ctxStub = new Proxy({}, { get(t,p){
    if(p==='measureText') return ()=>({width:40});
    if(p==='createLinearGradient'||p==='createRadialGradient') return ()=>gradient;
    if(p==='canvas') return {width:960,height:600};
    return ()=>{};
  }});
  let pointer=null, key=null;
  const canvas = { width:960, height:600, getContext:()=>ctxStub,
    getBoundingClientRect:()=>({left:0,top:0,width:960,height:600}),
    addEventListener:(e,f)=>{ if(e==='pointerdown') pointer=f; } };
  const store = {};
  const sandbox = {
    document:{ getElementById:id=> id==='c'?canvas:{} },
    localStorage:{ getItem:k=> store[k]??null, setItem:(k,v)=>{store[k]=v;} },
    performance:{ now:(()=>{ let t=0; return ()=> (t+=16); })() },
    window:{ addEventListener:(e,f)=>{ if(e==='keydown') key=f; } },
    requestAnimationFrame:null,
    __raf:null,
  };
  sandbox.requestAnimationFrame = (cb)=>{ sandbox.__raf = cb; };

  const html = fs.readFileSync(HTML,'utf8');
  let src = html.match(/<script>([\s\S]*)<\/script>/)[1];
  // test-only expose hook (not present in the shipped file)
  src = src.replace('newGame();\nrequestAnimationFrame(loop);',
    'globalThis.__WW={getG:()=>G,mk:(k,l)=>makeMon(k,l),doCatch:()=>doCatch(),spawn:e=>spawnWild(e),tm:(a,b)=>typeMult(a,b),SP:SPECIES,strike:(a,b,d)=>strike(a,b,d),upd:dt=>updateBattle(dt),statusTick:(m,dt)=>statusTick(m,dt),trySwitch:(i)=>trySwitch(i),teamCardAt:(x,y)=>teamCardAt(x,y),openPokedex:(f)=>openPokedex(f),dexProgress:()=>dexProgress(),dexStatus:(k)=>dexStatus(k),pokedexCardAt:(x,y)=>pokedexCardAt(x,y),draw:()=>draw(),Dex,SWITCH_CD,SWITCH_ENTRY,C:{BURN_MAX,BURN_DUR,BURN_PCT,WATER_STEAL,GRASS_LEECH,LEECH_DUR,ROCK_GUARD,SHADOW_DODGE,VOLT_STUN,STUN_DUR,STUN_IMM}};\nnewGame();\nrequestAnimationFrame(loop);');

  // Install the sandbox globals for the eval'd script. The running game keeps
  // calling requestAnimationFrame/performance while we step it, so these stay
  // installed for the instance's lifetime (each boot() reinstalls its own; tests
  // run sequentially, so instances never cross-fire).
  for(const k of ['document','localStorage','performance','window','requestAnimationFrame']){
    globalThis[k] = sandbox[k];
  }
  (0,eval)(src);
  const api = globalThis.__WW; delete globalThis.__WW;
  const step = (n=1)=>{ for(let i=0;i<n;i++){ const cb=sandbox.__raf; sandbox.__raf=null; if(cb) cb(sandbox.performance.now()); } };
  const click = (x,y)=> pointer && pointer({ preventDefault(){}, clientX:x, clientY:y });
  const clickId = (id)=>{ const b=api.getG().buttons.find(b=>b.id===id && b.enabled); if(b){ click(b.x+5,b.y+5); return true; } return false; };
  const toBattle = ()=>{ for(let i=0;i<600;i++){ step(1); const g=api.getG(); if(g.state==='battle'&&g.wild) return true; } return false; };
  return { api, step, click, clickId, toBattle, getKey:()=>key };
}

// ---- static data sanity ----
test('species DB is well-formed', ()=>{
  const { SP } = boot().api;
  const keys = Object.keys(SP);
  assert(keys.length >= 12, `only ${keys.length} species`);
  for(const k of keys){
    const s = SP[k];
    assert(s.name && s.type && s.base, `${k}: missing fields`);
    assert(Number.isFinite(s.base.hp) && s.base.hp>0, `${k}: bad hp`);
    assert(Number.isFinite(s.base.atk) && s.base.atk>0, `${k}: bad atk`);
    assert(Number.isFinite(s.base.spd) && s.base.spd>0, `${k}: bad spd`);
    assert(/^#[0-9a-f]{6}$/i.test(s.body), `${k}: bad body color`);
    if(s.evo) assert(SP[s.evo], `${k}: evo -> unknown ${s.evo}`);
  }
});

test('type chart is symmetric-ish and bounded', ()=>{
  const { tm, SP } = boot().api;
  const types = [...new Set(Object.values(SP).map(s=>s.type))];
  for(const a of types) for(const b of types){
    const m = tm(a,b);
    assert(m>=0.5 && m<=2, `mult ${a}->${b} = ${m} out of range`);
  }
});

// ---- level scaling / evolution ----
test('monsters scale and gain XP toward levels', ()=>{
  const { api } = boot();
  const m = api.mk('emberpup', 1);
  const hp1 = m.maxhp, atk1 = m.atk;
  const m5 = api.mk('emberpup', 5);
  assert(m5.maxhp > hp1 && m5.atk > atk1, 'stats should rise with level');
  assert(m5.level===5, 'level set');
});

// ---- core loop: walk -> battle -> choice ----
test('game boots on the title screen', ()=>{
  const { api } = boot();
  assert(api.getG().state==='title', `state ${api.getG().state}`);
  assert(api.getG().team.length===1, 'starts with one companion');
});

test('start -> walk -> battle -> choice reaches a decision', ()=>{
  const { api, step, clickId, toBattle } = boot();
  step(2);
  assert(clickId('start'), 'no start button');
  assert(toBattle(), 'never reached a battle');
  const g = api.getG();
  g.wild.hp = 1; g.battleIntro = 0;               // finish the fight fast
  let reached=false;
  for(let i=0;i<300;i++){ step(1); if(api.getG().state==='choice'){ reached=true; break; } }
  assert(reached, 'battle never resolved to a choice');
});

test('KILL grants souls, RELEASE grants honor', ()=>{
  const run = (idKey)=>{
    const { api, step, clickId, toBattle } = boot();
    step(2); clickId('start'); toBattle();
    const g = api.getG(); g.wild.hp=1; g.battleIntro=0;
    for(let i=0;i<300;i++){ step(1); if(api.getG().state==='choice') break; }
    step(1); // draw choice buttons
    const before = { souls:api.getG().souls, honor:api.getG().honor };
    clickId(idKey);
    return { before, after:{ souls:api.getG().souls, honor:api.getG().honor } };
  };
  const k = run('kill');   assert(k.after.souls > k.before.souls, 'kill gave no souls');
  const r = run('release'); assert(r.after.honor > r.before.honor, 'release gave no honor');
});

// ---- full-party catch opens the swap picker ----
test('catching with a full party opens the swap picker and swap works', ()=>{
  const { api, step, clickId, toBattle } = boot();
  step(2); clickId('start'); toBattle();
  const g = api.getG();
  g.team = [api.mk('emberpup',6), api.mk('puddlet',5), api.mk('sprig',4), api.mk('sparky',3)];
  g.team.forEach(m=> m.hp=m.maxhp);
  g.wild.hp = 1; g.battleIntro = 0;
  for(let i=0;i<300;i++){ step(1); if(api.getG().state==='choice') break; }
  const g2 = api.getG(); g2.ballTier=3; g2.honor=500;   // guarantee the catch
  api.doCatch();
  assert(api.getG().state==='swapchoice', `expected swapchoice, got ${api.getG().state}`);
  assert(api.getG().pendingMon, 'no pending monster');
  const boxBefore = api.getG().box.length;
  step(1);                                    // draw swap buttons
  assert(clickId('swapout_2'), 'no swapout button');
  const g3 = api.getG();
  assert(g3.box.length === boxBefore+1, 'swapped-out member did not go to box');
  assert(g3.team.length === 4, 'party size changed');
  assert(g3.state !== 'swapchoice', 'did not leave swap picker');
});

// ---- juice: driving every state must never throw (render + update) ----
test('3000 driven iterations across all states never throw', ()=>{
  const { api, step, click, getKey } = boot();
  step(2); click(480,490); // start
  const grid=[]; for(let gx=60;gx<960;gx+=90) for(let gy=90;gy<560;gy+=60) grid.push([gx,gy]);
  for(let i=0;i<3000;i++){
    step(3);
    const c = grid[i % grid.length];
    click(c[0], c[1]);
    step(2);
    const key = getKey();
    if(key) key({ key:String((i%4)+1), preventDefault(){} });
  }
  // reaching here without throwing is the assertion
  assert(true);
});

// ---- ability: Burn DoT + stack cap ----
test('burn deals capped DoT and expires', ()=>{
  const { api } = boot();
  const { statusTick, mk, C } = api;
  const d = mk('puddlet', 20); d.hp = d.maxhp;
  d.status.burn = 3; d.status.burnT = 3;
  const before = d.hp;
  statusTick(d, 1.0);
  const lost = before - d.hp;
  const expect = d.maxhp * C.BURN_PCT * 3; // 6% maxhp in 1s
  assert(Math.abs(lost - expect) < 0.5, `burn dot ${lost} vs ${expect}`);
  assert(Math.abs(d.status.burnT - 2) < 1e-6, `burnT ${d.status.burnT}`);
  // Fire attacker stacking respects BURN_MAX
  const att = mk('emberpup', 20); att.atk = 5;
  const v = mk('sparky', 20); v.hp = v.maxhp;
  for(let i=0;i<4;i++) api.strike(att, v, +1);
  assert(v.status.burn === C.BURN_MAX, `stack ${v.status.burn} != ${C.BURN_MAX}`);
  // let burn duration elapse -> stacks clear
  v.hp = v.maxhp;
  for(let i=0;i<40;i++) statusTick(v, 0.1);
  assert(v.status.burn === 0, `burn should clear, got ${v.status.burn}`);
});

// ---- ability: Fire burn / Water lifesteal / Grass leech ----
test('fire burns, water steals, grass leeches', ()=>{
  const { api } = boot();
  const { mk, strike, statusTick } = api;
  // Fire -> burn on a Volt def
  const fire = mk('emberpup', 20); const vdef = mk('sparky', 20); vdef.hp = vdef.maxhp;
  strike(fire, vdef, +1);
  assert(vdef.status.burn > 0 && vdef.status.burnT > 0, 'fire did not burn');
  // Water lifesteal — injured attacker heals but not past max
  const water = mk('puddlet', 20); water.hp = water.maxhp - 100 < 1 ? 1 : water.maxhp - 100;
  const wb = water.hp; const tdef = mk('sprig', 20); tdef.hp = tdef.maxhp;
  strike(water, tdef, +1);
  assert(water.hp > wb, 'water did not lifesteal');
  assert(water.hp <= water.maxhp, 'water over-healed');
  // Grass leech — regen ticks up over time
  const grass = mk('sprig', 20); grass.hp = Math.max(1, grass.maxhp - 100);
  const rdef = mk('pebblin', 20); rdef.hp = rdef.maxhp;
  strike(grass, rdef, +1);
  assert(grass.status.regen > 0, 'grass did not set regen');
  const gb = grass.hp, reg0 = grass.status.regen;
  statusTick(grass, 0.5);
  assert(grass.hp > gb, 'grass regen did not heal');
  assert(grass.status.regen < reg0, 'regen timer did not fall');
});

// ---- ability: stun skips a turn then resumes; immunity holds ----
test('stun skips then resumes, immunity caps', ()=>{
  const { api, step, clickId, toBattle } = boot();
  step(2); clickId('start'); assert(toBattle(), 'no battle');
  const g = api.getG();
  const you = g.team[g.lead];
  g.battleIntro = 0; g.wild.hp = g.wild.maxhp = 999999; g.wild.status.stun = 0;
  you.status.stun = 0.5; you.cd = 0;
  const whp = g.wild.hp;
  api.upd(0.1);
  assert(g.wild.hp === whp, 'stunned mon still attacked');
  assert(you.status.stun < 0.5, 'stun not decremented');
  // step past expiry -> it lands a hit
  for(let i=0;i<20;i++){ api.upd(0.1); if(g.wild.hp < whp) break; }
  assert(g.wild.hp < whp, 'never resumed attacking after stun');
  // immunity: repeated Volt strikes cannot re-stun during window
  const { mk, strike } = api;
  const volt = mk('sparky', 20); const def = mk('emberpup', 20);
  def.hp = def.maxhp = 999999; def.status.stunImm = 5;
  for(let i=0;i<60;i++){ def.hp = def.maxhp; strike(volt, def, +1); assert(def.status.stun === 0, 'immunity breached'); }
});

// ---- ability: shadow dodge is partial ----
test('shadow dodge is partial', ()=>{
  const { api } = boot();
  const { mk, strike, getG } = api;
  const att = mk('emberpup', 20); const def = mk('umbrat', 20);
  let dodges = 0;
  for(let i=0;i<100;i++){ def.hp = def.maxhp; const before = def.hp; strike(att, def, +1); if(def.hp === before) dodges++; }
  assert(dodges > 0 && dodges < 100, `dodges ${dodges} not partial`);
  assert(getG().dmgPops.some(p=>p.dodge), 'no DODGE pop');
});

// ---- resolution guard: worst-case mirrors never softlock ----
test('ability mirrors always resolve to a decision', ()=>{
  const run = (key)=>{
    const { api, step, clickId, toBattle } = boot();
    step(2); clickId('start'); assert(toBattle(), 'no battle');
    const g = api.getG();
    g.team = [api.mk(key, 20)]; g.team.forEach(m=>{ m.hp=m.maxhp; }); g.lead = 0;
    g.wild = api.mk(key, 20); g.wild.hp = g.wild.maxhp; g.wild.cd = 0.6;
    g.battleIntro = 0;
    for(let i=0;i<4000;i++){ api.upd(0.05); if(g.state!=='battle') break; }
    assert(g.state==='choice' || g.state==='gameover', `${key} mirror stuck in ${g.state}`);
  };
  run('puddlet');  // Water heal mirror
  run('pebblin');  // Rock guard mirror
});

// ---- mid-battle party switch ----
// Boot into a live battle with a fresh N-member living team, intro finished, swap ready.
function battleWithTeam(keys){
  const h = boot();
  const { api, step, clickId, toBattle } = h;
  step(2); clickId('start'); assert(toBattle(), 'no battle');
  const g = api.getG();
  g.team = keys.map((k,i)=> api.mk(k, 5+i));
  g.team.forEach(m=> m.hp=m.maxhp);
  g.lead = 0; g.battleIntro = 0; g.switchCd = 0; g.switchAnim = 0;
  g.wild.hp = g.wild.maxhp = 999999;   // keep the fight from ending mid-test
  return h;
}

test('T1 valid switch: swaps lead, entry cd, cooldown set, wild cd untouched', ()=>{
  const { api } = battleWithTeam(['emberpup','puddlet','sprig']);
  const g = api.getG();
  const wildCd = g.wild.cd;
  assert(api.trySwitch(2)===true, 'valid switch should return true');
  assert(g.lead===2, `lead should be 2, got ${g.lead}`);
  assert(g.team[2].cd >= api.SWITCH_ENTRY, `incoming cd ${g.team[2].cd} < SWITCH_ENTRY`);
  assert(g.switchCd===api.SWITCH_CD, `switchCd ${g.switchCd} != ${api.SWITCH_CD}`);
  assert(g.wild.cd===wildCd, `wild.cd changed ${g.wild.cd} != ${wildCd}`);
});

test('T2 reject fainted member', ()=>{
  const { api } = battleWithTeam(['emberpup','puddlet','sprig']);
  const g = api.getG();
  g.team[1].hp = 0;
  assert(api.trySwitch(1)===false, 'switch to fainted should be false');
  assert(g.lead===0, `lead should stay 0, got ${g.lead}`);
});

test('T3 reject self/active', ()=>{
  const { api } = battleWithTeam(['emberpup','puddlet']);
  const g = api.getG();
  assert(api.trySwitch(g.lead)===false, 'switch to self should be false');
  assert(g.switchCd===0, `switchCd should stay 0, got ${g.switchCd}`);
});

test('T4 reject while on cooldown', ()=>{
  const { api } = battleWithTeam(['emberpup','puddlet','sprig']);
  const g = api.getG();
  assert(api.trySwitch(1)===true, 'first switch ok');
  assert(g.lead===1, 'lead moved to 1');
  assert(api.trySwitch(2)===false, 'second switch during cd should fail');
  assert(g.lead===1, `lead should stay 1, got ${g.lead}`);
});

test('T5 reject during battle intro', ()=>{
  const { api } = battleWithTeam(['emberpup','puddlet']);
  const g = api.getG();
  g.battleIntro = 1;
  assert(api.trySwitch(1)===false, 'switch during intro should fail');
  assert(g.lead===0, 'lead unchanged');
  assert(g.switchCd===0, 'no cooldown incurred');
});

test('T6 anti-softlock: faint auto-switches despite huge manual cooldown', ()=>{
  const { api } = battleWithTeam(['emberpup','puddlet','sprig']);
  const g = api.getG();
  g.team[g.lead].hp = 0;      // active faints
  g.switchCd = 99; g.battleIntro = 0;
  api.upd(0.1);
  assert(g.state==='gameover' || (g.team[g.lead] && g.team[g.lead].hp>0),
    `expected auto-switch or gameover, lead=${g.lead} state=${g.state}`);
});

test('T7 cooldown expiry allows another switch', ()=>{
  const { api } = battleWithTeam(['emberpup','puddlet','sprig']);
  const g = api.getG();
  assert(api.trySwitch(1)===true, 'first switch ok');
  api.upd(api.SWITCH_CD + 0.1);
  assert(g.switchCd===0, `switchCd should drain to 0, got ${g.switchCd}`);
  assert(api.trySwitch(2)===true, 'switch after cd expiry should succeed');
  assert(g.lead===2, `lead should be 2, got ${g.lead}`);
});

test('T8 teamCardAt maps card geometry', ()=>{
  const { api } = battleWithTeam(['emberpup','puddlet','sprig']);
  // card i is at x=14+i*118, y=H-70, size 110x60 (H=600)
  assert(api.teamCardAt(14+1*118+5, 600-70+5)===1, 'card 1 hit-test');
  assert(api.teamCardAt(0, 0)===-1, 'off-card miss');
});

// ---- Pokédex screen ----
test('pokedex opens from title and back returns to title', ()=>{
  const { api, step, clickId } = boot();
  step(2);
  assert(clickId('dex'), 'no dex button on title');
  assert(api.getG().state==='pokedex', `expected pokedex, got ${api.getG().state}`);
  step(1);
  assert(clickId('back'), 'no back button');
  assert(api.getG().state==='title', `back should return to title, got ${api.getG().state}`);
});

test('pokedex opens from gameover and back returns to gameover', ()=>{
  const { api, step, clickId } = boot();
  const g=api.getG(); g.state='gameover';
  step(1);
  assert(clickId('dex'), 'no dex button on gameover');
  assert(api.getG().state==='pokedex' && api.getG().pokedexFrom==='gameover', 'from should be gameover');
  step(1);
  clickId('back');
  assert(api.getG().state==='gameover', `back should return to gameover, got ${api.getG().state}`);
});

test('dexProgress counts reflect Dex.data', ()=>{
  const { api } = boot();
  const p=api.dexProgress();
  assert(p.total===18 && p.caught===api.Dex.nCaught() && p.seen===api.Dex.nSeen(), 'counts mismatch');
  api.Dex.data.seen['umbrat']=1;
  const q=api.dexProgress();
  assert(q.seen>=p.seen, 'seen did not grow');
  let bc=0; q.byRarity.forEach(x=>{ bc+=x.caught; });
  assert(bc===q.caught, `byRarity caught sum ${bc} != ${q.caught}`);
});

test('pokedex renders caught/seen/locked + detail without throwing', ()=>{
  const { api, step } = boot();
  const g=api.getG();
  // caught = starter only; seen-only = umbrat; rest locked
  api.Dex.data.caught = { [g.starterKey]: 1 };
  api.Dex.data.seen = { [g.starterKey]: 1, umbrat: 1 };
  api.openPokedex('title'); step(3);
  api.getG().pokedexSel=0; step(3);            // detail (likely caught path)
  // find a seen-only card index and open its spoiler-safe detail
  const keys=Object.keys(api.SP);
  const seenIdx=keys.indexOf('umbrat');
  api.getG().pokedexSel=seenIdx; step(3);
  assert(true);
});

test('pokedex key wiring: d opens, Escape closes', ()=>{
  const { api, step, getKey } = boot();
  step(2);
  getKey()({ key:'d', preventDefault(){} });
  assert(api.getG().state==='pokedex', `d should open pokedex, got ${api.getG().state}`);
  getKey()({ key:'Escape', preventDefault(){} });
  assert(api.getG().state==='title', `Escape should return to title, got ${api.getG().state}`);
});

console.log(`wildwalk: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
