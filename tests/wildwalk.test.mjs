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
    'globalThis.__WW={getG:()=>G,mk:(k,l)=>makeMon(k,l),doCatch:()=>doCatch(),acquire:(m,r)=>acquire(m,r),spawn:e=>spawnWild(e),spawnBoss:(k)=>spawnBoss(k),bossDue:()=>bossDue(),catchChance:(w)=>catchChance(w),tm:(a,b)=>typeMult(a,b),SP:SPECIES,strike:(a,b,d)=>strike(a,b,d),upd:dt=>updateBattle(dt),statusTick:(m,dt)=>statusTick(m,dt),trySwitch:(i)=>trySwitch(i),teamCardAt:(x,y)=>teamCardAt(x,y),openPokedex:(f)=>openPokedex(f),dexProgress:()=>dexProgress(),dexStatus:(k)=>dexStatus(k),pokedexCardAt:(x,y)=>pokedexCardAt(x,y),draw:()=>draw(),biomeForTier:(t)=>biomeForTier(t),BIOMES,pickBiased:(k)=>pickBiased(k),Dex,SWITCH_CD,SWITCH_ENTRY,hasRelic:(id)=>hasRelic(id),relicCount:(id)=>relicCount(id),RELICS,buildRelicOffer:(n)=>buildRelicOffer(n),setupRelicPick:(fn)=>setupRelicPick(fn),takeRelic:(i)=>takeRelic(i),doRelease:()=>doRelease(),finishSpawn:(w)=>finishSpawn(w),endFight:(x)=>endFight(x),switchCdMax:()=>switchCdMax(),C:{BURN_MAX,BURN_DUR,BURN_PCT,WATER_STEAL,GRASS_LEECH,LEECH_DUR,ROCK_GUARD,SHADOW_DODGE,VOLT_STUN,STUN_DUR,STUN_IMM,BOSS_EVERY,BOSS_HEAVY_CAP,TELE_WINDUP,BOSS_SOFTCAP,BOSS_EXECUTE_DPS,BOSS_CATCH_FLOOR,BOSS_SOULS_MUL,BOSS_PHASE_PAUSE}};\nnewGame();\nrequestAnimationFrame(loop);');

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

// ---- full-party acquire opens the swap picker ----
test('acquiring with a full party opens the swap picker and swap works', ()=>{
  const { api, step, clickId } = boot();
  step(2); clickId('start');
  const g = api.getG();
  g.team = [api.mk('emberpup',6), api.mk('puddlet',5), api.mk('sprig',4), api.mk('sparky',3)];
  g.team.forEach(m=> m.hp=m.maxhp);
  // Acquiring a new companion with a full party must open the swap picker.
  // Driving acquire() directly (rather than doCatch) keeps this deterministic —
  // catch chance is capped at 0.96, so a doCatch-based check would flake ~4%.
  api.acquire(api.mk('infernyx', 9), ()=>{ api.getG().state = 'walk'; });
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

// ---- doCatch routes a full-party catch to a valid resolved state (no flake) ----
test('doCatch with a full party resolves (swap picker on success, continue on flee)', ()=>{
  const { api, step, clickId, toBattle } = boot();
  step(2); clickId('start'); toBattle();
  const g = api.getG();
  g.team = [api.mk('emberpup',6), api.mk('puddlet',5), api.mk('sprig',4), api.mk('sparky',3)];
  g.team.forEach(m=> m.hp=m.maxhp);
  g.wild.hp = 1; g.battleIntro = 0;
  for(let i=0;i<300;i++){ step(1); if(api.getG().state==='choice') break; }
  api.getG().ballTier=3; api.getG().honor=500;
  api.doCatch();
  const st = api.getG().state;
  // success -> swap picker (party full); flee (~4%) -> journey continues
  assert(['swapchoice','walk','crossroads'].includes(st), `unexpected state ${st}`);
});

// ---- juice: driving every state must never throw (render + update) ----
test('3000 driven iterations across all states never throw', ()=>{
  const { api, step, click, getKey } = boot();
  step(2); click(480,490); // start
  api.getG().relics = ['catch','gold','gold','crit','swiftpaw'];  // exercise drawRelicStrip (incl. a ×N stack)
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
  g.battleIntro = 0;
  // Force a Water wild: it can't dodge (Shadow) or reduce a hit to nothing (Rock floors at 1),
  // so once `you` resumes attacking the hit ALWAYS lands — keeps this assertion deterministic.
  g.wild = api.mk('puddlet', 5);
  g.wild.hp = g.wild.maxhp = 999999; g.wild.cd = 999; g.wild.status.stun = 0;
  you.status.stun = 0.5; you.cd = 0;
  const whp = g.wild.hp;
  api.upd(0.1);
  assert(g.wild.hp === whp, 'stunned mon still attacked');
  assert(you.status.stun < 0.5, 'stun not decremented');
  // step past expiry -> it lands a hit
  for(let i=0;i<40;i++){ api.upd(0.1); if(g.wild.hp < whp) break; }
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

// ---- biomes: progression is deterministic + monotonic ----
test('biome progression maps tiers and is monotonic/pure', ()=>{
  const { biomeForTier } = boot().api;
  assert(biomeForTier(1)===0, `t1 -> ${biomeForTier(1)}`);
  assert(biomeForTier(3)===1, `t3 -> ${biomeForTier(3)}`);
  assert(biomeForTier(5)===2, `t5 -> ${biomeForTier(5)}`);
  assert(biomeForTier(7)===3, `t7 -> ${biomeForTier(7)}`);
  assert(biomeForTier(9)===4, `t9 -> ${biomeForTier(9)}`);
  assert(biomeForTier(11)===5, `t11 -> ${biomeForTier(11)}`);
  assert(biomeForTier(50)===5, `t50 -> ${biomeForTier(50)}`);
  let prev=-1;
  for(let t=1;t<=40;t++){ const v=biomeForTier(t); assert(v>=prev, `not monotonic at t=${t}`); prev=v; }
  // pure: same input -> same output
  for(let t=1;t<=40;t++) assert(biomeForTier(t)===biomeForTier(t), 'not pure');
});

// ---- biomes: spawn bias raises favored share, never empties the pool ----
test('spawn bias favors biome types without emptying the pool', ()=>{
  const { api } = boot();
  const { pickBiased, getG, SP } = api;
  const COMMONS=['emberpup','puddlet','sprig','sparky','pebblin','umbrat'];
  const RARES=['infernyx','leviatide','verdragon','stormhorn'];
  // Volcano (index 4) favors Fire/Rock
  getG().biome=4;
  let fav=0; const seenC=new Set();
  for(let i=0;i<4000;i++){
    const k=pickBiased(COMMONS);
    assert(k!=null && COMMONS.includes(k), `bad pick ${k}`);
    seenC.add(k);
    if(SP[k].type==='Fire'||SP[k].type==='Rock') fav++;
  }
  const frac=fav/4000;
  assert(frac>0.5, `favored fraction ${frac} not > 0.5`);      // unbiased ~0.33
  // Cave (index 3) favors Rock/Shadow — RARES has neither -> uniform fallback
  getG().biome=3;
  const cnt={}; const seenR=new Set();
  for(let i=0;i<2000;i++){
    const k=pickBiased(RARES);
    assert(k!=null && RARES.includes(k), `bad rare pick ${k}`);
    seenR.add(k); cnt[k]=(cnt[k]||0)+1;
  }
  assert(seenR.size===RARES.length, `not all rares appeared: ${[...seenR]}`);
  for(const k of RARES) assert(cnt[k]>2000*0.15, `rare ${k} under-represented (${cnt[k]}) — not ~uniform`);
});

// ---- biomes: no pool is ever empty across every biome x pool ----
test('pickBiased never returns null across all biomes and pools', ()=>{
  const { api } = boot();
  const { pickBiased, getG } = api;
  const POOLS = {
    COMMONS:['emberpup','puddlet','sprig','sparky','pebblin','umbrat'],
    UNCOMMONS:['cindermaw','torrentoad','thornbeast','voltfox','boulderk','nightwyrm'],
    RARES:['infernyx','leviatide','verdragon','stormhorn'],
    LEGENDS:['moltengod','abysslord'],
  };
  for(let bi=0; bi<=5; bi++){
    getG().biome=bi;
    for(const [name,pool] of Object.entries(POOLS)){
      for(let i=0;i<200;i++){
        const k=pickBiased(pool);
        assert(k!=null && pool.includes(k), `biome ${bi} pool ${name}: bad pick ${k}`);
      }
    }
  }
});

// ---- biomes: transient, never leaks into the persisted save ----
test('biome state stays out of the save shape', ()=>{
  const { api, step, clickId, toBattle } = boot();
  step(2); clickId('start'); assert(toBattle(), 'no battle');
  const g=api.getG();
  g.biome=4; g.biomePrev=2; g.biomeFxT=2; g.biomeLabel='Ashfall Ridge';
  // drive a fight to a win + crossroads so biome logic + a Dex.save() fire
  g.wild.hp=1; g.battleIntro=0;
  for(let i=0;i<300;i++){ step(1); if(api.getG().state==='choice') break; }
  step(1); clickId('kill');   // grants souls, saves Dex
  api.Dex.save();
  const saved=JSON.parse(localStorage.getItem('wildwalk_save_v1'));
  const keys=Object.keys(saved).sort();
  assert(JSON.stringify(keys)===JSON.stringify(['best','caught','runs','seen']),
    `save shape changed: ${keys}`);
  for(const k of keys) assert(!/^biome/.test(k), `biome field leaked: ${k}`);
});

// ===================================================================
// BOSS ENCOUNTERS — schedule, phases, telegraph, rewards, anti-softlock
// ===================================================================

// ---- 1. schedule is a pure, self-deduping function of G.fights ----
test('boss schedule is pure/deterministic and routes the walk spawn', ()=>{
  const { api, step, clickId, toBattle } = boot();
  step(2); clickId('start'); assert(toBattle(), 'no battle');
  const g = api.getG();
  for(let f=0; f<=12; f++){ g.fights=f; assert(api.bossDue() === (((f+1)%api.C.BOSS_EVERY)===0), `bossDue wrong at fights=${f}`); }
  // fights=5 -> (5+1)%6===0 -> next walk spawn is a boss
  g.fights=5; g.state='walk'; g.walkTarget=100; g.scroll=100;
  step(1);
  assert(g.wild && g.wild.boss===true, `walk spawn did not become a boss (state ${g.state})`);
  assert(g.state==='battle', `expected battle, got ${g.state}`);
  assert(g.wild.phaseMax>=2, `phaseMax ${g.wild.phaseMax} < 2`);
  // elite hunts never route through the boss scheduler
  api.spawn(true);
  assert(g.wild && !g.wild.boss, 'elite spawn wrongly flagged boss');
});

// ---- 2. phases decrement monotonically to 1 and the fight resolves ----
test('boss phases decrement to 1 and the fight always resolves', ()=>{
  const { api } = boot();
  const g = api.getG();
  g.team = [api.mk('leviatide',30)];               // huge Water atk vs Fire boss
  g.team.forEach(m=> m.hp=m.maxhp); g.lead=0;
  api.spawnBoss('moltengod');
  g.battleIntro = 0;
  g.team[0].maxhp = g.team[0].hp = 999999;         // survive long enough to out-damage the boss
  const pmax = g.wild.phaseMax;
  let minPhase = pmax, maxPhase = pmax, prev = pmax, everIncreased = false;
  for(let i=0;i<8000 && g.state==='battle';i++){
    api.upd(0.05);
    if(g.wild){ const p=g.wild.phase;
      if(p>prev) everIncreased=true; prev=p;
      if(p<minPhase) minPhase=p; if(p>maxPhase) maxPhase=p; }
  }
  assert(minPhase===1, `phase never reached 1 (min ${minPhase})`);
  assert(maxPhase<=pmax, `phase exceeded phaseMax (${maxPhase} > ${pmax})`);
  assert(!everIncreased, 'phase increased at some point');
  assert(g.state==='choice' || g.state==='gameover', `stuck in ${g.state}`);
});

// ---- 3. telegraph fires a capped heavy then resets its timers ----
test('boss telegraph caps the heavy hit and resets cleanly', ()=>{
  const { api } = boot();
  const g = api.getG();
  g.team = [api.mk('boulderk',40)];                // full-HP Rock tank
  g.team.forEach(m=> m.hp=m.maxhp); g.lead=0;
  api.spawnBoss('moltengod');
  g.battleIntro = 0;
  const you = g.team[g.lead];
  you.hp = you.maxhp; you.atk = 0; you.cd = 999;   // isolate: player does nothing
  const w = g.wild;
  w.cd = 999;                                      // no normal boss attacks
  w.tele = 0.04; w.teleActive = true; w.teleCd = 999; w.enrage = 1; w.phaseBreak = 0;
  for(let i=0;i<4;i++) api.upd(0.05);
  assert(you.hp>0, 'tank one-shot by heavy');
  assert(you.maxhp - you.hp <= you.maxhp*api.C.BOSS_HEAVY_CAP + 1, `heavy exceeded cap (lost ${you.maxhp-you.hp})`);
  assert(w.tele===0 && w.teleActive===false, `telegraph did not clear (tele ${w.tele}, active ${w.teleActive})`);
  assert(w.teleCd>0, `teleCd did not reset (${w.teleCd})`);
});

// ---- 4. heavy never one-shots a full-HP active mon ----
test('boss heavy attack never one-shots from full HP', ()=>{
  const { api } = boot();
  const g = api.getG();
  g.team = [api.mk('sparky',30)];
  g.team.forEach(m=> m.hp=m.maxhp); g.lead=0;
  api.spawnBoss('moltengod');
  g.battleIntro = 0;
  const you = g.team[g.lead];
  you.hp = you.maxhp; you.atk = 0; you.cd = 999;
  g.wild.cd = 999; g.wild.tele = 0.04; g.wild.teleActive = true; g.wild.teleCd = 999;
  api.upd(0.05);
  const validStates = ['battle','choice','gameover'];
  assert(validStates.includes(g.state), `invalid state ${g.state}`);
  // either the active mon survived, or the loop cleanly routed a faint
  assert((g.team[g.lead] && g.team[g.lead].hp>0) || g.state!=='battle' || g.team.every(m=>m.hp<=0)===false,
    `active mon dead but no clean resolution (state ${g.state})`);
  assert(g.team[g.lead].hp>0, 'active mon should survive a single capped heavy from full');
});

// ---- 5. worst-case boss mirror (incl. Water lifesteal) always ends ----
test('worst-case boss mirrors always terminate via execute valve', ()=>{
  for(const key of ['moltengod','abysslord','leviatide']){
    const { api } = boot();
    const g = api.getG();
    g.team = [api.mk('sprig',4)];                  // deliberately weak
    g.team.forEach(m=> m.hp=m.maxhp); g.lead=0;
    api.spawnBoss(key);
    g.battleIntro = 0;
    const iters = Math.ceil((api.C.BOSS_SOFTCAP + 30) / 0.05);
    for(let i=0;i<iters && g.state==='battle';i++) api.upd(0.05);
    assert(g.state==='choice' || g.state==='gameover', `${key} mirror stuck in ${g.state}`);
  }
});

// drive a fresh boss fight to the choice screen (strong team so it's a defeat)
function bossToChoice(bossKey){
  const h = boot();
  const { api, step } = h;
  const g = api.getG();
  g.team = [api.mk('leviatide',45)];
  g.team.forEach(m=> m.hp=m.maxhp); g.lead=0;
  api.spawnBoss(bossKey);
  g.battleIntro = 0;
  g.team[0].maxhp = g.team[0].hp = 999999;         // survive long enough to defeat the boss
  for(let i=0;i<8000 && g.state==='battle';i++) api.upd(0.05);
  assert(g.state==='choice', `boss fight did not reach choice (${g.state})`);
  step(1);                                         // draw choice buttons
  return h;
}

// ---- 6. rewards applied + boosted rare catch on the choice screen ----
test('boss rewards apply and catch is floored', ()=>{
  const { api, clickId } = bossToChoice('moltengod');
  const g = api.getG();
  const w = g.wild;
  assert(api.catchChance(w) >= api.C.BOSS_CATCH_FLOOR, `catch ${api.catchChance(w)} below floor`);
  const soulsBefore = g.souls, potionsBefore = g.potions;
  const nonBoss = Math.round(w.level*(1+w.sp.rarity*0.6)*2.2) + (w.elite?15:0);
  assert(clickId('kill'), 'no kill button');
  const soulsDelta = g.souls - soulsBefore;
  assert(soulsDelta >= nonBoss*api.C.BOSS_SOULS_MUL, `souls delta ${soulsDelta} < ${nonBoss*api.C.BOSS_SOULS_MUL}`);
  assert(g.potions === potionsBefore + 1, `potions ${g.potions} != ${potionsBefore+1}`);
  g.team.forEach(m=>{ if(m.hp>0) assert(m.hp===m.maxhp, `${m.sp.name} not full HP after boss reward`); });
  assert(g.bossWin===false, 'bossWin latch not cleared');
});

// ---- 7. save shape unchanged after a boss fight ----
test('boss fight leaves the save shape untouched', ()=>{
  const { api, clickId } = bossToChoice('abysslord');
  clickId('kill');
  api.Dex.save();
  const saved = JSON.parse(localStorage.getItem('wildwalk_save_v1'));
  const keys = Object.keys(saved).sort();
  assert(JSON.stringify(keys)===JSON.stringify(['best','caught','runs','seen']), `save shape changed: ${keys}`);
  for(const k of keys) assert(!/^boss/i.test(k), `boss field leaked into save: ${k}`);
});

// ---- 8. telegraph/pause never freeze the battle tick ----
test('boss loop never freezes across telegraphs + a phase break', ()=>{
  const { api } = boot();
  const g = api.getG();
  g.team = [api.mk('boulderk',40), api.mk('pebblin',40), api.mk('boulderk',38), api.mk('pebblin',36)];
  g.team.forEach(m=> m.hp=m.maxhp); g.lead=0;
  api.spawnBoss('moltengod');
  g.battleIntro = 0;
  g.team.forEach(m=> m.atk=0);                     // player can't kill the boss
  g.wild.atk = 0;                                  // boss can't wipe the team -> only the valve ends it
  let left = -1;
  for(let i=0;i<3000;i++){
    api.upd(0.05);                                 // must never throw
    if(g.state!=='battle'){ left=i; break; }
  }
  assert(left>0, `battle never terminated (state ${g.state})`);
  assert(g.state==='choice', `execute valve should end the fight in choice, got ${g.state}`);
  assert(left>200, `terminated implausibly early at frame ${left} (valve should engage ~45s+)`);
});

// ===================================================================
// RELICS — run-modifier boons (transient G.relics)
// ===================================================================
const ALL_RELICS = ['catch','rare','lifesteal','burn','crit','critdmg','thorns','startheal','gold','bosspotion','honor','swiftpaw'];

// drive a fresh boss fight to its choice screen (strong team → defeat)
function bossToChoiceR(bossKey){
  const h = boot();
  const { api, step } = h;
  const g = api.getG();
  g.team = [api.mk('leviatide',45)]; g.team.forEach(m=> m.hp=m.maxhp); g.lead=0;
  api.spawnBoss(bossKey);
  g.battleIntro = 0;
  g.team[0].maxhp = g.team[0].hp = 999999;
  for(let i=0;i<8000 && g.state==='battle';i++) api.upd(0.05);
  assert(g.state==='choice', `boss fight did not reach choice (${g.state})`);
  step(1);
  return h;
}

test('R1 RELICS table is well-formed (12, one stackable = gold)', ()=>{
  const { RELICS } = boot().api;
  const keys = Object.keys(RELICS);
  assert(keys.length===12, `expected 12 relics, got ${keys.length}`);
  for(const k of keys){ const r=RELICS[k];
    assert(r.name && r.icon && r.col && r.desc, `${k}: missing field`); }
  const stackers = keys.filter(k=>RELICS[k].stack===true);
  assert(stackers.length===1 && stackers[0]==='gold', `stackers ${stackers}`);
});

test('R2 hasRelic/relicCount + no-dup offers', ()=>{
  const { api } = boot();
  const g = api.getG();
  g.relics = ['catch'];
  assert(api.hasRelic('catch') && api.relicCount('catch')===1, 'hasRelic/count');
  assert(!api.buildRelicOffer(3).includes('catch'), 'owned relic offered');
  // own every one-time relic → only the stackable (gold) remains eligible
  g.relics = ALL_RELICS.filter(id=> id!=='gold');
  const off = api.buildRelicOffer(3);
  assert(off.length===1 && off[0]==='gold', `expected [gold], got ${off}`);
  // even with gold owned, it stays eligible (stackable)
  g.relics = ALL_RELICS.slice();
  assert(api.buildRelicOffer(3).join()==='gold', 'gold should stay offerable');
});

test('R3 catch relics change catchChance', ()=>{
  const { api } = boot();
  const g = api.getG();
  const rare = api.mk('infernyx', 5);   // rarity 2
  const common = api.mk('emberpup', 5); // rarity 0
  g.relics = [];  const baseRare = api.catchChance(rare), baseCommon = api.catchChance(common);
  g.relics = ['catch']; assert(Math.abs(api.catchChance(common)-(baseCommon+0.08))<1e-6, 'catch +8% off');
  g.relics = ['rare']; assert(Math.abs(api.catchChance(rare)-(baseRare+0.12))<1e-6, 'rare +12% off');
  g.relics = ['rare']; assert(Math.abs(api.catchChance(common)-baseCommon)<1e-6, 'rare must not touch commons');
});

test('R4 lifesteal heals your attacker on landed hit only', ()=>{
  const { api } = boot();
  const g = api.getG();
  const you = api.mk('sparky', 20); you.hp = you.maxhp - 200;   // Volt, non-Water
  const def = api.mk('sprig', 20); def.hp = def.maxhp = 1e9;
  g.relics = ['lifesteal'];
  const b = you.hp; api.strike(you, def, +1);
  assert(you.hp > b && you.hp <= you.maxhp, `lifesteal did not heal (${b}->${you.hp})`);
  // dir<0 (you as passive/wild attacking) does NOT self-heal via lifesteal
  const you2 = api.mk('sparky', 20); you2.hp = you2.maxhp - 200;
  const b2 = you2.hp; api.strike(you2, def, -1);
  assert(you2.hp === b2, 'lifesteal fired on dir<0');
});

test('R5 thorns reflects onto the attacker (dir<0 only)', ()=>{
  const { api } = boot();
  const g = api.getG();
  const enemy = api.mk('emberpup', 20); enemy.hp = enemy.maxhp;
  const you = api.mk('puddlet', 20); you.hp = you.maxhp = 1e9;
  g.relics = ['thorns'];
  const b = enemy.hp; api.strike(enemy, you, -1);
  assert(enemy.hp < b, `thorns did not reflect (${b}->${enemy.hp})`);
  // without relic: no reflect
  g.relics = []; const enemy2 = api.mk('emberpup', 20); enemy2.hp = enemy2.maxhp;
  const b2 = enemy2.hp; api.strike(enemy2, you, -1);
  assert(enemy2.hp === b2, 'thorns fired without relic');
  // dir>0 (your mon attacking) never reflects onto itself
  g.relics = ['thorns']; const att = api.mk('emberpup', 20); att.hp = att.maxhp;
  const b3 = att.hp; api.strike(att, you, +1);
  assert(att.hp === b3, 'thorns reflected on dir>0');
});

test('R6 burn relic adds a stack and raises the cap', ()=>{
  const { api } = boot();
  const g = api.getG(); const { C } = api;
  const fire = api.mk('emberpup', 20);
  const def = api.mk('sparky', 20); def.hp = def.maxhp = 1e9;
  g.relics = ['burn'];
  api.strike(fire, def, +1);
  assert(def.status.burn >= 2, `one burn strike should stack ≥2, got ${def.status.burn}`);
  for(let i=0;i<6;i++) api.strike(fire, def, +1);
  assert(def.status.burn === C.BURN_MAX+1, `burn cap should be ${C.BURN_MAX+1}, got ${def.status.burn}`);
});

test('R7 crit relic raises crit chance (statistical)', ()=>{
  const { api } = boot();
  const g = api.getG();
  const count = (relics)=>{
    g.relics = relics.slice(); g.dmgPops.length = 0;
    const att = api.mk('emberpup', 20), def = api.mk('sparky', 20); def.hp = def.maxhp = 1e12;
    for(let i=0;i<3000;i++) api.strike(att, def, +1);
    return g.dmgPops.filter(p=>p.crit).length;
  };
  const base = count([]); const withCrit = count(['crit']);
  assert(withCrit > base + 100, `crit relic did not clearly raise crits (${base} vs ${withCrit})`);
});

test('R8 critdmg relic raises max hit magnitude (statistical)', ()=>{
  const { api } = boot();
  const g = api.getG();
  const maxHit = (relics)=>{
    g.relics = relics.slice(); g.dmgPops.length = 0;
    const att = api.mk('emberpup', 20), def = api.mk('sparky', 20); def.hp = def.maxhp = 1e12;
    for(let i=0;i<3000;i++) api.strike(att, def, +1);
    let mx = 0; for(const p of g.dmgPops){ const v = parseInt(String(p.txt).replace('-','')); if(v>mx) mx=v; }
    return mx;
  };
  const base = maxHit([]); const boosted = maxHit(['critdmg']);
  assert(boosted > base, `critdmg max ${boosted} should exceed baseline max ${base}`);
});

test('R9 startheal tops up the team at fight start', ()=>{
  const { api } = boot();
  const g = api.getG();
  g.team = [api.mk('emberpup',10), api.mk('puddlet',10)];
  g.team.forEach(m=>{ m.hp = Math.round(m.maxhp*0.5); });
  const before = g.team.map(m=>m.hp);
  g.relics = ['startheal'];
  api.finishSpawn(api.mk('sparky',5));
  g.team.forEach((m,i)=>{ assert(m.hp>before[i] && m.hp<=m.maxhp, `member ${i} not healed (${before[i]}->${m.hp})`); });
});

test('R10 gold relic scales gold reward (stacks)', ()=>{
  const { api } = boot();
  const g = api.getG();
  const sample = (relics)=>{
    let sum=0; const N=600;
    for(let i=0;i<N;i++){
      g.relics = relics.slice(); g.gold = 0; g.bossWin = false; g.fights = 0;
      g.wild = api.mk('emberpup', 5);
      api.endFight(true);
      sum += g.gold;
    }
    return sum/N;
  };
  const base = sample([]); const two = sample(['gold','gold']);
  const ratio = two/base;
  assert(ratio>1.45 && ratio<1.75, `gold ×2 stack ratio ${ratio.toFixed(3)} not ~1.6`);
});

test('R11 bosspotion grants an extra potion after a boss', ()=>{
  const { api, clickId } = bossToChoiceR('moltengod');
  const g = api.getG();
  g.relics = ['bosspotion'];
  const before = g.potions;
  assert(clickId('kill'), 'no kill button');
  assert(g.potions === before + 2, `expected +2 potions, got ${g.potions-before}`);
});

test('R12 honor relic boosts release honor ×1.5', ()=>{
  const { api } = boot();
  const g = api.getG();
  g.wild = api.mk('emberpup', 10); g.honor = 0; g.relics = [];
  api.doRelease(); const base = g.honor;
  g.wild = api.mk('emberpup', 10); g.honor = 0; g.relics = ['honor'];
  api.doRelease(); const boosted = g.honor;
  assert(boosted === Math.round(base*1.5), `honor ${boosted} != round(${base}*1.5)`);
});

test('R13 swiftpaw shortens the switch cooldown', ()=>{
  const { api } = battleWithTeam(['emberpup','puddlet','sprig','sparky']);
  const g = api.getG();
  g.relics = ['swiftpaw'];
  assert(api.trySwitch(1)===true, 'switch failed');
  assert(g.switchCd === api.switchCdMax(), `switchCd ${g.switchCd} != switchCdMax ${api.switchCdMax()}`);
  assert(g.switchCd < api.SWITCH_CD, `switchCd ${g.switchCd} not < ${api.SWITCH_CD}`);
  api.draw();  // must not throw with a relic strip present
});

test('R14 offers never duplicate owned one-time relics', ()=>{
  const { api } = boot();
  const g = api.getG();
  g.relics = ['catch'];
  assert(!api.buildRelicOffer(3).includes('catch'), 'catch offered while owned');
  g.relics = ALL_RELICS.slice();   // everything owned
  assert(api.buildRelicOffer(3).join()==='gold', 'only gold should remain offerable');
});

test('R15 picking a relic adds it and advances', ()=>{
  const { api, step } = boot();
  const g = api.getG();
  g.relics = [];
  api.setupRelicPick(()=>{ api.getG().state='walk'; });
  assert(g.state==='relic', `expected relic state, got ${g.state}`);
  assert(g.relicOffer.length>=1 && g.relicOffer.length<=3, `offer size ${g.relicOffer.length}`);
  step(1); api.draw();  // render the relic pick screen
  const pick = g.relicOffer[0];
  api.takeRelic(0);
  assert(g.relics.includes(pick), 'picked relic not added');
  assert(g.relicOffer===null && g.afterRelic===null, 'offer/afterRelic not cleared');
  assert(g.state==='walk', `continuation did not run (state ${g.state})`);
});

test('R16 a relic is offered after a boss victory (integration)', ()=>{
  const { api, clickId } = bossToChoiceR('abysslord');
  const g = api.getG();
  g.relics = [];
  assert(clickId('kill'), 'no kill button');
  assert(g.state==='relic', `expected relic pick after boss, got ${g.state}`);
  assert(g.relicOffer.length>=1, 'no relic offer after boss');
  api.takeRelic(0);
  assert(g.state==='walk' || g.state==='crossroads', `did not advance (${g.state})`);
});

test('R17 relics never change the persisted save shape', ()=>{
  const { api, step, clickId, toBattle } = boot();
  step(2); clickId('start'); assert(toBattle(), 'no battle');
  const g = api.getG();
  g.relics = ['catch','gold','gold','crit'];
  g.wild.hp = 1; g.battleIntro = 0;
  for(let i=0;i<300;i++){ step(1); if(api.getG().state==='choice') break; }
  step(1); clickId('kill');
  api.Dex.save();
  const saved = JSON.parse(localStorage.getItem('wildwalk_save_v1'));
  const keys = Object.keys(saved).sort();
  assert(JSON.stringify(keys)===JSON.stringify(['best','caught','runs','seen']), `save shape changed: ${keys}`);
  for(const k of keys) assert(!/relic/i.test(k), `relic field leaked: ${k}`);
});

test('R18 a battle with all relics active resolves without throwing', ()=>{
  const { api, step, clickId, toBattle } = boot();
  step(2); clickId('start'); assert(toBattle(), 'no battle');
  const g = api.getG();
  g.relics = ALL_RELICS.slice();
  g.battleIntro = 0;
  api.draw();  // exercise drawRelicStrip with a full strip
  for(let i=0;i<4000 && g.state==='battle';i++){ api.upd(0.05); }
  assert(g.state==='choice' || g.state==='gameover', `stuck in ${g.state}`);
});

console.log(`wildwalk: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
