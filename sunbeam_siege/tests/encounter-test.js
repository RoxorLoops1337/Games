// Node test for src/data/encounters.js (SB.data.encounters and SB.data.encounterRules).
// Run: node tests/encounter-test.js            checks everything and prints the threat tables
//      node tests/encounter-test.js --fix      rewrites the stored threat numbers in encounters.js to the computed ones
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const dataDir = path.join(root, 'src', 'data');

const ctx = { console };
ctx.window = ctx;
vm.createContext(ctx);
['enemies-rodents.js', 'enemies-dogs.js', 'enemies-household.js', 'enemies-wild.js', 'enemies-bosses.js', 'encounters.js']
  .forEach(f => vm.runInContext(fs.readFileSync(path.join(dataDir, f), 'utf8'), ctx, { filename: f }));
const SB = ctx.SB;
const ENC = SB.data.encounters, R = SB.data.encounterRules;

const DASH = new RegExp('[' + String.fromCharCode(0x2013, 0x2014) + ']');
let failures = 0, warnings = 0;
function fail(msg) { failures++; console.log('FAIL  ' + msg); }
function warn(msg) { warnings++; console.log('warn  ' + msg); }
function ok(cond, msg) { if (!cond) fail(msg); return cond; }

/* ---------------------------------------------------------------- pest registry */
const pests = {};
const kindOf = {};
function reg(arr, kind) { arr.forEach(p => { if (pests[p.id]) fail('duplicate pest id ' + p.id); pests[p.id] = p; kindOf[p.id] = kind; }); }
reg(SB.data.enemiesRodents, 'regular'); reg(SB.data.enemiesDogs, 'regular'); reg(SB.data.enemiesHousehold, 'regular');
reg(SB.data.enemiesWild, 'regular'); reg(SB.data.enemiesElites, 'elite'); reg(SB.data.enemiesBosses, 'boss'); reg(SB.data.enemiesBossAdds, 'add');
const SIZE = { small: 1, medium: 2, large: 3, boss: 5 };
function room(p) {
  if (typeof p.room === 'number') return p.room;
  if (typeof p.size === 'number') return p.size;
  return SIZE[p.size] || 1;
}
function actsOf(p) {
  const a = p.acts || p.act;
  if (Array.isArray(a)) return a;
  if (typeof a === 'number') return [a, a];
  return null;
}
function inAct(p, act) { const a = actsOf(p); return !a || (act >= a[0] && act <= a[1]); }

/* ---------------------------------------------------------------- helpers */
const allEnc = [];
['act1', 'act2', 'act3'].forEach(a => ['prowl', 'night', 'elite', 'boss'].forEach(t => ENC[a][t].forEach(e => allEnc.push(e))));
Object.keys(ENC.events).forEach(k => allEnc.push(ENC.events[k]));

function expanded(enc) { return enc.waves.map(w => R.expandWave(w)); }
function threatOf(enc) {
  let t = 0;
  expanded(enc).forEach(w => w.spawns.forEach(s => { t += pests[s.id].threat; }));
  return t;
}
function waveThreats(enc) { return expanded(enc).map(w => w.spawns.reduce((s, x) => s + pests[x.id].threat, 0)); }
function bandFor(enc) {
  const act = enc.act, type = enc.type;
  if (enc.tier === 'soft') { const b = R.budgets[1].soft; return [Math.ceil(b * R.bands.soft[0]), Math.floor(b * R.bands.soft[1])]; }
  const b = R.budgets[act][type], w = R.bands[type];
  return [Math.ceil(b * w[0] - 1e-9), Math.floor(b * w[1] + 1e-9)];
}
function tierBand(enc) {
  if (enc.type === 'prowl' && R.tierWindows[enc.tier]) {
    const b = R.budgets[enc.act].prowl, w = R.tierWindows[enc.tier];
    return [Math.ceil(b * w[0] - 1e-9), Math.floor(b * w[1] + 1e-9)];
  }
  if (enc.type === 'night') {
    const b = R.budgets[enc.act].night, w = R.tierWindows[enc.nightSlot];
    return [Math.ceil(b * w[0] - 1e-9), Math.floor(b * w[1] + 1e-9)];
  }
  return null;
}

/* ---------------------------------------------------------------- structure */
[1, 2, 3].forEach(a => {
  const A = ENC['act' + a];
  ok(A.prowl.length === 14, `act${a}: 14 prowls expected, got ${A.prowl.length}`);
  ok(A.night.length === 10, `act${a}: 10 nights expected, got ${A.night.length}`);
  ok(A.elite.length === 4, `act${a}: 4 elites expected, got ${A.elite.length}`);
  ok(A.boss.length === (a === 3 ? 3 : 2), `act${a}: boss count ${A.boss.length}`);
  const slots = { A: 0, B: 0, any: 0 }; A.night.forEach(n => slots[n.nightSlot]++);
  ok(slots.A >= 3 && slots.B >= 3, `act${a}: night slots A/B/any ${JSON.stringify(slots)} need at least 3 A and 3 B`);
  const tiers = {}; A.prowl.forEach(p => tiers[p.tier] = (tiers[p.tier] || 0) + 1);
  ok(tiers.standard >= 5 && tiers.hard >= 2 && tiers.light >= 2, `act${a}: prowl tier mix ${JSON.stringify(tiers)}`);
  ok(a !== 1 || tiers.soft === 3, 'act1 needs 3 soft prowls');
  const arche = new Set(A.prowl.concat(A.night).map(e => e.archetype));
  ok(arche.size >= 8, `act${a}: archetype variety ${arche.size}`);
  const fams = new Set(A.prowl.concat(A.night).map(e => e.family));
  ok(fams.size >= 6, `act${a}: family variety ${fams.size}`);
});
ok(Object.keys(ENC.events).length === 7, 'events: 7 expected');
ok(JSON.stringify(ENC.tutorial) === '{}', 'tutorial must be {}');

const seen = {};
allEnc.forEach(e => { if (seen[e.id]) fail('duplicate encounter id ' + e.id); seen[e.id] = 1; });

/* ---------------------------------------------------------------- per encounter checks */
allEnc.forEach(e => {
  const id = e.id;
  ok(e.name && e.intro && e.question && e.counterplay.length >= 1 && e.family && e.archetype, id + ': missing text fields');
  ok(e.waves.length > 0 && e.waves[0].round === 1, id + ': wave 1 must be round 1');
  for (let i = 1; i < e.waves.length; i++) ok(e.waves[i].round > e.waves[i - 1].round, id + ': wave rounds must increase');
  if (e.type !== 'boss') {
    const want = R.waveCounts[e.type];
    ok(e.waves.length === want, `${id}: ${want} waves expected, got ${e.waves.length}`);
    const last = e.waves[e.waves.length - 1].round;
    ok(last <= (e.type === 'prowl' ? 4 : 5), `${id}: last wave at round ${last} too late for a ${e.type}`);
  }
  const exempt = e.actExempt || [];
  let elites = 0;
  expanded(e).forEach((w, wi) => {
    const perFloor = {};
    w.spawns.forEach(s => {
      const p = pests[s.id];
      if (!ok(p, `${id}: unknown enemy id ${s.id}`)) return;
      ok(['back', 'front'].indexOf(s.at) >= 0, `${id}: bad at ${s.at}`);
      ok([1, 2, 3].indexOf(s.floor) >= 0, `${id}: bad floor`);
      if (exempt.indexOf(s.id) < 0) ok(inAct(p, e.act), `${id}: ${s.id} not available in act ${e.act} (${JSON.stringify(actsOf(p))})`);
      if (kindOf[s.id] === 'elite') { elites++; ok(e.type === 'elite' && s.id === e.elite, `${id}: stray elite ${s.id}`); }
      if (kindOf[s.id] === 'boss') ok(e.type === 'boss' && s.id === e.bossId, `${id}: stray boss ${s.id}`);
      if (kindOf[s.id] === 'add' && e.type !== 'boss' && !e.event) ok(false, `${id}: boss add ${s.id} used in a regular encounter`);
      if ((e.type === 'prowl' || e.type === 'night') && !e.event) ok(s.floor === 1, `${id}: regular encounters spawn on floor 1 only`);
      if (kindOf[s.id] === 'elite' || kindOf[s.id] === 'boss') ok(s.floor === (p.spawnFloor || 1), `${id}: ${s.id} floor ${s.floor} vs data spawnFloor ${p.spawnFloor || 1}`);
      perFloor[s.floor] = (perFloor[s.floor] || 0) + room(p);
    });
    Object.keys(perFloor).forEach(f => ok(perFloor[f] <= R.capacity.pestRoomPerFloor, `${id}: wave ${wi + 1} overfills floor ${f} at spawn (${perFloor[f]} > 5)`));
  });
  if (e.type === 'elite' && e.elite) {
    ok(elites === 1, `${id}: elite encounter needs exactly one elite unit, has ${elites}`);
    ok(pests[e.elite] && actsOf(pests[e.elite])[0] === e.act, `${id}: elite act mismatch`);
  }
  if (e.type === 'elite' && !e.elite) ok(e.event && e.eliteProxy && pests[e.eliteProxy], `${id}: elite encounter without an elite unit must be an event with eliteProxy`);

  // threat
  const t = threatOf(e);
  ok(e.threat === t, `${id}: stored threat ${e.threat} but computed ${t}`);
  const b = bandFor(e);
  ok(t >= b[0] && t <= b[1], `${id}: threat ${t} outside band ${b[0]} to ${b[1]} (budget ${e.budget})`);
  const tb = tierBand(e);
  if (tb) ok(t >= tb[0] && t <= tb[1], `${id}: threat ${t} outside ${e.tier} window ${tb[0]} to ${tb[1]}`);
  ok(e.budget === (e.tier === 'soft' ? 8 : R.budgets[e.act][e.type]), `${id}: budget field wrong`);
  if (e.type !== 'boss') {
    const wt = waveThreats(e), al = R.waveShares.allowed[e.type];
    wt.forEach((x, i) => {
      const sh = x / t;
      if (sh < al[0] - 1e-9 || sh > al[1] + 1e-9) fail(`${id}: wave ${i + 1} share ${(sh * 100).toFixed(0)} percent outside ${al.join(' to ')}`);
    });
  }
  // visitors
  const tables = ENC['act' + e.act].visitors;
  if (ok(tables[e.visitors], `${id}: unknown visitors table ${e.visitors}`)) {
    const type = e.type === 'boss' ? 'elite' : e.type;
    const band = R.visitorBand(e.act, type), mult = e.nightVisitorMult || 1;
    const n = tables[e.visitors].filter(p => p.threat >= band[0] && p.threat <= Math.ceil(band[1] * mult)).length;
    ok(n >= 2, `${id}: visitors table ${e.visitors} has ${n} packs inside band ${band.join(' to ')}`);
  }
  // rows / slot
  if (e.type === 'prowl' && !e.event) ok(Array.isArray(e.rows) && e.rows.length > 0, id + ': prowl needs rows');
  if (e.type === 'night') ok(['A', 'B', 'any'].indexOf(e.nightSlot) >= 0, id + ': nightSlot');
  (e.omenBan || []).forEach(o => ok(R.omens.indexOf(o) >= 0, id + ': unknown omen ' + o));
  // dashes
  const blob = JSON.stringify(e);
  if (DASH.test(blob)) fail(id + ': contains an en or em dash');
});

/* ---------------------------------------------------------------- bosses against boss data */
function norm(waves) { return JSON.stringify(waves.map(w => [w.round, R.expandWave(w).spawns.map(s => s.id + '@' + (s.floor || 1))])); }
SB.data.enemiesBosses.forEach(b => {
  const e = allEnc.find(x => x.bossId === b.id);
  if (!ok(e, 'no encounter for boss ' + b.id)) return;
  ok(e.id === b.encounter.id, `${e.id}: id should equal boss data encounter id ${b.encounter.id}`);
  if (norm(e.waves) !== norm(b.encounter.waves)) {
    if (e.dataDeviation) warn(`${e.id}: waves deviate from enemies-bosses.js on purpose: ${e.dataDeviation}`);
    else fail(`${e.id}: waves differ from enemies-bosses.js`);
  }
  ok(JSON.stringify(e.winIf) === JSON.stringify(b.encounter.winIf), `${e.id}: winIf differs`);
  ok(e.rules.impatienceRound === b.encounter.impatienceRound, `${e.id}: impatienceRound differs`);
  ok(e.act === b.act, `${e.id}: act`);
  ok(SB.data.bossRules.pools[b.act].indexOf(b.id) >= 0, `${e.id}: not in bossRules pool`);
});

/* ---------------------------------------------------------------- events.js ids */
const evText = fs.readFileSync(path.join(dataDir, 'events.js'), 'utf8');
const found = {};
let m; const re = /fight\('(enc_evt_[a-z0-9_]+)',\s*'(prowl|elite)'/g;
while ((m = re.exec(evText))) found[m[1]] = m[2];
(evText.match(/enc_evt_[a-z0-9_]+/g) || []).forEach(x => { if (!found[x]) found[x] = found[x] || null; });
Object.keys(found).forEach(k => {
  if (!ok(ENC.events[k], 'events.js references ' + k + ' but encounters.events lacks it')) return;
  if (found[k]) ok(ENC.events[k].type === found[k], `${k}: events.js says ${found[k]}, encounter is ${ENC.events[k].type}`);
});
Object.keys(ENC.events).forEach(k => ok(found[k] !== undefined, k + ' is defined but events.js never references it'));

/* ---------------------------------------------------------------- Night Visitor tables */
[1, 2, 3].forEach(a => {
  const tables = ENC['act' + a].visitors;
  ok(Object.keys(tables).length >= 3, `act${a}: want at least 3 visitor tables`);
  Object.keys(tables).forEach(tn => tables[tn].forEach(p => {
    let t = 0;
    p.spawns.forEach(s => {
      const pp = pests[s.id];
      if (!ok(pp, `${p.id}: unknown enemy ${s.id}`)) return;
      ok(inAct(pp, a), `${p.id}: ${s.id} not in act ${a}`);
      ok(s.floor === 1, `${p.id}: visitors spawn in the Cellar`);
      t += pp.threat * (s.count || 1);
    });
    ok(p.threat === t, `${p.id}: stored threat ${p.threat}, computed ${t}`);
    const rm = p.spawns.reduce((x, s) => x + room(pests[s.id]) * (s.count || 1), 0);
    ok(rm <= 5, `${p.id}: pack too big for the floor`);
  }));
});

/* ---------------------------------------------------------------- rules sanity and selection simulation */
ok(R.hpScale(1) === 1 && R.hpScale(9) === 1.64 && R.hpScale(5) === 1.32, 'hpScale curve');
ok(R.nodeNight(1, 3) === 1 && R.nodeNight(1, 6) === 2 && R.nodeNight(1, 8) === 3 && R.nodeNight(3, 8) === 9, 'nodeNight');
[1, 2, 3].forEach(a => ['prowl', 'night', 'elite', 'boss'].forEach(t => ok(R.budgets[a][t] === ENC['act' + a].budgets[t], `budget ${a} ${t} differs between rules and data`)));

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const appearances = {};
const RUNS = 3000;
for (let run = 0; run < RUNS; run++) {
  const rng = mulberry32(1000 + run), used = [], recent = [];
  const deckTags = { nap: run % 5, box: run % 3, pile: run % 4, knock: run % 2, fluff: run % 6 };
  for (let act = 1; act <= 3; act++) {
    const plan = [
      { kind: 'prowl', row: 1, p: 1 }, { kind: 'prowl', row: 2, p: 0.55 }, { kind: 'night', row: 3, p: 1, slot: 'A' },
      { kind: 'prowl', row: 4, p: 0.5 }, { kind: 'prowl', row: 5, p: 0.5 }, { kind: rng() < 0.35 ? 'elite' : 'night', row: 6, p: 1, slot: 'B' }
    ];
    plan.forEach(step => {
      if (rng() > step.p) return;
      const mystery = step.kind === 'prowl' && step.row !== 1 && rng() < 0.12;
      const rowPicked = [];
      // other nodes in the same row get picked too (they are competing choices, only one is taken)
      const extras = step.row === 1 ? 2 : 3;
      for (let k = 0; k < extras; k++) {
        const x = R.pick({ act, kind: step.kind === 'elite' ? 'elite' : step.kind, row: step.row, nightSlot: step.slot, mystery: false, used: used.concat(rowPicked), rowPicked, recent, deckTags, rng });
        if (x) rowPicked.push(x.id);
      }
      const e = R.pick({ act, kind: step.kind, row: step.row, nightSlot: step.slot, mystery, used, rowPicked: rowPicked.slice(1), recent, deckTags, rng });
      if (!e) { fail(`pick returned null: run ${run} act ${act} ${step.kind} row ${step.row}`); return; }
      if (used.indexOf(e.id) >= 0) fail(`pick repeated ${e.id} in run ${run}`);
      used.push(e.id); recent.unshift({ archetype: e.archetype, family: e.family });
      appearances[e.id] = (appearances[e.id] || 0) + 1;
    });
  }
}
let minApp = Infinity, maxApp = 0, never = [];
allEnc.filter(e => !e.event && e.type !== 'boss').forEach(e => {
  const n = appearances[e.id] || 0;
  if (!n) never.push(e.id);
  minApp = Math.min(minApp, n); maxApp = Math.max(maxApp, n);
});
ok(never.length === 0, 'encounters never picked in ' + RUNS + ' simulated runs: ' + never.join(', '));
console.log(`selection sim: ${RUNS} runs, no repeats, appearances per encounter min ${minApp} max ${maxApp}`);

/* ---------------------------------------------------------------- source scan */
const srcFiles = ['src/data/encounters.js', 'tests/encounter-test.js', 'design/C5-encounters.md'];
srcFiles.forEach(f => {
  const p = path.join(root, f);
  if (!fs.existsSync(p)) return;
  const txt = fs.readFileSync(p, 'utf8');
  if (DASH.test(txt)) fail(f + ' contains an en or em dash');
  if (/Math\.random/.test(txt.replace(/Math\.random\)/g, ''))) { /* data file never calls it */ }
});

/* ---------------------------------------------------------------- --fix mode */
if (process.argv.indexOf('--fix') >= 0) {
  const p = path.join(root, 'src/data/encounters.js');
  let src = fs.readFileSync(p, 'utf8'), changed = 0;
  function patch(re2src, val) {
    const re2 = new RegExp(re2src);
    let hit = false;
    src = src.replace(re2, (m0, a, b) => { hit = true; if (+b !== val) changed++; return a + val; });
    if (!hit) fail('--fix could not find the threat slot for ' + re2src);
  }
  const patchEnc = (e, val) => {
    if (e.event) return patch("(EV\\('" + e.id + "',\\s*'\\w+',\\s*\\d,\\s*)(\\d+)", val);
    if (e.type === 'boss') return patch("(BO\\(\\d,\\s*'" + e.id + "',\\s*'[a-z0-9_]+',\\s*)(\\d+)", val);
    const fn = e.type === 'prowl' ? 'PR' : e.type === 'night' ? 'NI' : 'EL';
    return patch("(" + fn + "\\(\\d,\\s*'" + e.id + "',\\s*)(\\d+)", val);
  };
  allEnc.forEach(e => patchEnc(e, threatOf(e)));
  [1, 2, 3].forEach(a => Object.keys(ENC['act' + a].visitors).forEach(tn => ENC['act' + a].visitors[tn].forEach(pk => {
    patch("(pk\\('" + pk.id + "',\\s*)(\\d+)", pk.spawns.reduce((x, s) => x + pests[s.id].threat * (s.count || 1), 0));
  })));
  fs.writeFileSync(p, src);
  console.log('--fix rewrote ' + changed + ' threat numbers. Run the test again.');
  process.exit(0);
}

/* ---------------------------------------------------------------- report tables */
function stats(arr) { const s = arr.slice().sort((a, b) => a - b); return { n: s.length, min: s[0], max: s[s.length - 1], mean: s.reduce((x, y) => x + y, 0) / s.length }; }
function pad(s, n) { s = String(s); while (s.length < n) s += ' '; return s; }
console.log('\nTHREAT BY ACT (sum of enemy threat at hpScale 1; budgets from A07 section 10)');
console.log(pad('act', 5) + pad('type', 8) + pad('n', 4) + pad('budget', 8) + pad('min', 6) + pad('mean', 7) + pad('max', 6) + pad('mean/budget', 12) + 'band');
[1, 2, 3].forEach(a => {
  ['prowl', 'night', 'elite', 'boss'].forEach(t => {
    const list = ENC['act' + a][t];
    const st = stats(list.map(e => e.threat));
    const b = R.budgets[a][t];
    const bnd = t === 'boss' ? [Math.ceil(b * R.bands.boss[0]), Math.floor(b * R.bands.boss[1])] : [Math.ceil(b * R.bands[t][0] - 1e-9), Math.floor(b * R.bands[t][1] + 1e-9)];
    console.log(pad('A' + a, 5) + pad(t, 8) + pad(st.n, 4) + pad(b, 8) + pad(st.min, 6) + pad(st.mean.toFixed(1), 7) + pad(st.max, 6) + pad((st.mean / b).toFixed(3), 12) + bnd.join(' to '));
  });
});
const soft = ENC.act1.prowl.filter(e => e.tier === 'soft');
console.log(`A1 soft prowls: ${soft.length}, threat ${soft.map(e => e.threat).join(', ')} (budget 8)`);
console.log('events: ' + Object.keys(ENC.events).map(k => `${k}=${ENC.events[k].threat}`).join(', '));

console.log('\nEFFECTIVE THREAT BY NIGHT (threat x hpScale, mean of the encounters that can appear at that night)');
console.log(pad('night', 7) + pad('hpScale', 9) + pad('prowl', 8) + pad('night', 8) + pad('elite', 8) + pad('boss', 8) + 'exp. Warmth loss per fight (prowl/night/elite/boss)');
for (let n = 1; n <= 9; n++) {
  const act = Math.ceil(n / 3), pos = (n - 1) % 3; // 0 = Night A, 1 = Night B, 2 = boss night
  const A = ENC['act' + act];
  const prowls = A.prowl.filter(e => (pos === 0 ? e.rows.some(r => r <= 3) : pos === 1 ? e.rows.some(r => r >= 4) : false));
  const nights = A.night.filter(e => pos === 0 ? e.nightSlot !== 'B' : pos === 1 ? e.nightSlot !== 'A' : false);
  const mean = l => l.length ? (l.reduce((x, e) => x + R.effectiveThreat(e, n), 0) / l.length).toFixed(1) : '-';
  const bossList = pos === 2 ? A.boss : [];
  const eliteList = pos === 1 ? A.elite : [];
  console.log(pad(n, 7) + pad(R.hpScale(n).toFixed(2), 9) + pad(mean(prowls), 8) + pad(mean(nights), 8) + pad(mean(eliteList), 8) + pad(mean(bossList), 8) +
    [R.expectedLoss(act, 'prowl'), R.expectedLoss(act, 'night'), R.expectedLoss(act, 'elite'), R.expectedLoss(act, 'boss')].join(' / '));
}

console.log(`\n${failures} failure(s), ${warnings} warning(s)`);
process.exit(failures ? 1 : 0);
