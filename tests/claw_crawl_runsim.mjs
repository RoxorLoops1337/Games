// Claw Crawl: whole-run simulator (a balance tool, not part of npm run check).
//
// A sensible player bot plays full runs where HP carries over: a typical route
// per act (warm-up fights, harder fights, a chest, a shop, one elite, a rest,
// the boss), aiming the claw at the most valuable reachable item and focusing
// the weakest enemy. Use it to tune DIFF in claw_crawl/index.html.
//
// The owner's targets: 50% of runs die in act 1, 60% of the survivors in
// act 2, 70% of those in act 3.
//
// Run: node tests/claw_crawl_runsim.mjs <firstSeed> <count>   (one JSON line per run)
// Batch (4 in parallel):
//   seq 1000 1063 | xargs -P 4 -I@@ node tests/claw_crawl_runsim.mjs @@ 1

import { boot } from './claw_crawl_lib.mjs';
// crude per-item value for the smart bot (roughly "damage-equivalent")
function itemValue(A, it, state){
  const d = A.ITEMS[it.id]; if (d.junk) return it.id === 'bone' ? -2 : 0.5; // junk: grabbing clears it
  const f = d.fx, L = it.lvl - 1, v = k => f[k] ? f[k][Math.min(L, f[k].length - 1)] : 0;
  let s = 0;
  const nE = state ? state.nE : 1;
  s += v('dmg') * (v('hits') || 1);
  s += v('dmgAll') * (v('hits') || 1) * nE;
  s += v('block') * (state && state.incoming > 0 ? 1.0 : 0.3);
  s += v('heal') * (state && state.hpFrac < 0.6 ? 1.0 : 0.4);
  s += v('poison') * 1.8 + v('burn') * 1.5 + v('chill') * 1.5 + v('weak') * 2 + v('vuln') * 3;
  s += v('regen') * 3 + v('str') * 5 + v('thorns') * 1.5 + v('gold') * 0.2 + v('grab') * 8 + v('echo') * 6 + v('maxhp') * 2;
  return s;
}
// pick a target x. mode: 'random' | 'smart'
function chooseX(A, mode){
  const B = A.W.bodies.filter(b => b.x > A.CHW + 14 && b.y > -20);
  if (!B.length) return 200;
  if (mode === 'random') return B[Math.floor(Math.random() * B.length)].x;
  const F = A.F;
  const incoming = F.enemies.filter(e => !e.dead && e.intent && e.intent.atk).reduce((s, e) => s + e.intent.atk * (e.intent.x || 1), 0);
  const state = { nE: F.enemies.filter(e => !e.dead).length, incoming: incoming - F.P.block, hpFrac: A.G.run.hp / A.G.run.max };
  let best = null, bs = -1e9;
  for (const b of B){
    const top = b.y - b.br;
    // how buried: bodies overlapping this column whose top is above this one's top
    let cover = 0;
    for (const o of B){ if (o === b) continue; if (Math.abs(o.x - b.x) < (o.br + b.br) * 0.7 && o.y < b.y - 4) cover++; }
    // neighbours in the claw's span also come along sometimes
    let near = 0;
    for (const o of B){ if (o === b) continue; if (Math.abs(o.x - b.x) < 30 && Math.abs(o.y - b.y) < 30) near += Math.max(0, itemValue(A, o.it, state)) * 0.25; }
    const val = itemValue(A, b.it, state);
    const sc = (val + near) * (cover === 0 ? 1 : 0.35 / cover) - (b.x > A.XMAX ? 3 : 0);
    if (sc > bs){ bs = sc; best = b; }
  }
  return Math.max(A.XMIN, Math.min(A.XMAX, best.x));
}

// Whole-run simulator: a sensible player bot plays full runs (HP carries over),
// taking rewards, shopping, resting and fighting each act's boss.
// Usage: node runsim.mjs <firstSeed> <count>   -> one JSON line per run
const VAL = { axe:9, bomb:8, bolt:7, hammer:7, coconut:7, tonic:7, bow:6, sword:6, poison:6, shield:6, brocc:6, gem:6, chili:6, magnet:6, boomer:6,
  fire:5, ice:5, clover:5, crown:5, heart:5, pea:5, jam:5, balloon:5, die:5, mush:5, ring:5, cactus:5, lemon:4, garlic:4, banana:4, apple:3, dagger:3, coin:2 };
const val = id => VAL[id] || 3;
function playFight(A){
  let steps = 0;
  while (A.F && A.G.scr === 'fight' && steps < 60 * 1500){
    const F = A.F;
    if (F.phase === 'player' && F.claw.st === 'idle' && F.grabs > 0 && !F.claw.pending && F.spawnQ.length === 0){
      let bi = -1; F.enemies.forEach((e, i) => { if (!e.dead && (bi < 0 || e.hp + e.block < F.enemies[bi].hp + F.enemies[bi].block)) bi = i; }); if (bi >= 0) F.target = bi;
      F.claw.tx = chooseX(A, 'smart'); F.claw.pending = true;
    }
    A.stepFight(1 / 60); steps++;
  }
  return A.G.scr !== 'over';
}
function takeRewards(A){
  let g = 0;
  while (A.G.rq && g++ < 10){
    const st = A.G.rq.stages[0];
    if (!st){ A.afterReward(); break; }
    if (st.t === 'items'){ let bi = 0; st.ids.forEach((id, i) => { if (val(id) > val(st.ids[bi])) bi = i; }); A.ACT.pickItem(bi); }
    else if (st.t === 'claw'){ const c = A.G.run.claw; A.ACT.pickClaw(c.grabs < 5 ? 'grabs' : 'size'); }
    else A.ACT.skipStage();
  }
}
function at(A, k){ const m = A.G.run.map, c = m.cells[m.pos]; c.k = k; c.done = false; c.stock = null; c.ev = null; c.tut = 0; return c; }
function fight(A, kind, depth){
  const r = A.G.run, act = r.act;
  at(A, kind === 'normal' ? 'fight' : kind);
  const enc = kind === 'elite' ? A.ENC[act].elite : depth < 0.3 ? A.ENC[act].easy : A.ENC[act].hard;
  A.startFight(kind, kind === 'boss' ? A.ENC[act].boss : enc[Math.floor(Math.random() * enc.length)], depth);
  const ok = playFight(A);
  if (ok) takeRewards(A);
  return ok;
}
function shop(A){
  at(A, 'shop'); A.enterCell();
  const r = A.G.run, s = A.G.run.map.cells[r.map.pos].stock;
  for (let k = 0; k < 3; k++){
    const up = r.claw.size <= r.claw.grip + 0.6 ? 'size' : 'grip';
    if (r.gold >= 85 + r.buys.claw * 45 && k === 0) A.ACT.buyClaw(up);
    const items = s.items.map((x, i) => [x, i]).filter(([x]) => !x.sold && x.p <= r.gold).sort((a, b) => val(b[0].id) - val(a[0].id));
    if (items.length && val(items[0][0].id) >= 5) A.ACT.buyItem(items[0][1]);
  }
  A.ACT.leave();
}
function camp(A){
  at(A, 'camp'); A.enterCell();
  const r = A.G.run;
  if (r.hp < r.max * 0.7) A.ACT.campRest();
  else { let bi = -1; r.deck.forEach((d, i) => { if (d.lvl < 3 && !A.ITEMS[d.id].junk && (bi < 0 || val(d.id) > val(r.deck[bi].id))) bi = i; }); if (bi >= 0) A.ACT.campUpPick(bi); else A.ACT.campRest(); }
}
function chest(A){ at(A, 'chest'); A.enterCell(); takeRewards(A); A.toMap(); }
function goldTile(A){ at(A, 'gold'); A.enterCell(); }
const [,, s0 = '1', n = '10'] = process.argv;
for (let i = 0; i < +n; i++){
  const seed = +s0 + i;
  const A = boot(); A.G.meta.tut = 5; A.newRun(seed); A.toMap();
  let died = 0;
  // a typical route through each act: warm-ups, harder fights, one elite, a shop, a chest, rest, boss
  for (let act = 1; act <= 3 && !died; act++){
    const plan = [['n', 0.1], ['n', 0.2], ['chest'], ['n', 0.4], ['gold'], ['n', 0.6], ['shop'], ['e', 0.6], ['n', 0.8], ['camp'], ['b', 0]];
    for (const [k, d] of plan){
      if (k === 'n'){ if (!fight(A, 'normal', d)){ died = act; break; } }
      else if (k === 'e'){ if (!fight(A, 'elite', d)){ died = act; break; } }
      else if (k === 'b'){ A.G.run.map.pos = A.G.run.map.cells.findIndex(c => c.k === 'boss'); if (!fight(A, 'boss', 0)){ died = act; break; } }
      else if (k === 'shop') shop(A); else if (k === 'camp') camp(A); else if (k === 'chest') chest(A); else goldTile(A);
      if (process.env.LOG) console.error(act, k, 'hp', A.G.run.hp + '/' + A.G.run.max, 'act', A.G.run.act, 'scr', A.G.scr, 'grabs', A.G.run.claw.grabs, 'turns', A.F ? A.F.turn : '-');
    }
  }
  console.log(JSON.stringify({ seed, died, hp: A.G.run ? A.G.run.hp : 0, deck: A.G.run ? A.G.run.deck.length : 0 }));
}
