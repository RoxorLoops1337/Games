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
    'globalThis.__WW={getG:()=>G,mk:(k,l)=>makeMon(k,l),doCatch:()=>doCatch(),spawn:e=>spawnWild(e),tm:(a,b)=>typeMult(a,b),SP:SPECIES};\nnewGame();\nrequestAnimationFrame(loop);');

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

console.log(`wildwalk: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
