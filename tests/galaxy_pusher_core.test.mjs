// Galaxy Pusher: rules and the real-physics machine (Rapier), headless (no DOM, no audio).
import assert from 'node:assert/strict';
import { loadPhysics, Machine, mulberry, W, EDGE, PH, BACK_WALL, FACE_MAX, FACE_RET, FACE_MIN, GLASS_Z, COIN_HH, KINDS, FIELD_CAP, HZ, CRUMBLE_LIVE } from '../galaxy_pusher/machine.js';
import { Game, WHEEL, TOWER, FEVER_TIME, ITEMS, ITEM_ORDER, START_COINS, AUTO_SHOTS, COMBO_FULL, COIN_PTS, KILL_COINS, comboMult, foeAt, heroAtk } from '../galaxy_pusher/core.js';

await loadPhysics();
let passed = 0;
const ok = (c, n) => { assert.ok(c, n); passed++; if (process.env.GP_VERBOSE && /\(/.test(n)) console.log('  ok', n); };
const eq = (a, b, n) => { assert.deepEqual(a, b, n); passed++; };
const newGame = (seed, seeded = true) => { const g = new Game(seed, new Machine()); if (seeded) g.newMachine(); return g; };
// play for `sec` seconds at 60 fps, firing every `every` frames from alternating shooters; wheels resolve at once
function play(g, sec, every = 4, each) {
  let n = 0;
  for (let s = 0; s < sec * 60; s++) {
    if (every && s % every === 0) g.fire(n++ % 2 ? 'R' : 'L');
    g.tick(1 / 60);
    for (const e of g.out) if (e.t === 'kill') g.resolveWheel(g.spinWheel());
    g.out.length = 0;
    if (each) each(s);
  }
}
const up = (q) => 1 - 2 * (q.x * q.x + q.z * q.z);   // world y of the coin's own axis (1 = lying flat)
const steps = (m, sec) => { for (let i = 0; i < sec * HZ; i++) m.stepOnce(); };

// ---------------------------------------------------------------- a new machine
{
  const g = newGame(1);
  const live = g.f.coins.filter((c) => c.body);
  ok(live.length >= 70, 'a new machine starts with a carpet of coins (' + live.length + ')');
  ok(['B', 'P', 'Y'].every((k) => live.some((c) => c.k === k)), 'the carpet holds tokens of all three colours');
  ok(live.every((c) => { const p = c.body.translation(); return Math.abs(p.x) < W / 2 && p.z < EDGE + 1.6 && p.y > 0; }), 'every coin starts inside the machine (some hang over the edge)');
  ok(g.bank === START_COINS && g.score === 0 && g.foe.hp === foeAt(0).hp, 'start with a full coin bank, no points and the first enemy at full health');
}

// ---------------------------------------------------------------- real coin physics
{
  const m = new Machine(mulberry(3));
  const a = m.add('c', 0, 3, 6);
  steps(m, 1.5);
  ok(Math.abs(a.body.translation().y - COIN_HH) < 0.04 && up(a.body.rotation()) > 0.98, 'a dropped coin comes to rest lying flat on the floor');
  const b = m.add('c', 0.1, 3, 6);
  steps(m, 1.5);
  ok(Math.abs(b.body.translation().y - 3 * COIN_HH) < 0.06, 'a coin dropped onto another rests on top of it, not inside it (' + b.body.translation().y.toFixed(3) + ')');
  m.add('c', 4, 0.5, 6); const d = m.add('c', 4 + KINDS.c.r * 1.75, 2, 6);
  steps(m, 2);
  ok(d.body.translation().y < 0.6, 'a coin landing on the very edge of another tips off or leans, it never floats (' + d.body.translation().y.toFixed(2) + ')');
}
{
  // the pusher shoves a coin in front of it toward the edge
  const m = new Machine(mulberry(4));
  const c = m.add('c', 8, COIN_HH, FACE_MAX + KINDS.c.r - 1.0);   // within the pusher's stroke, beside the notch
  const z0 = c.body.translation().z;
  steps(m, 9);
  ok(c.body.translation().z > z0 + 0.5, 'a coin in front of the pusher is shoved forward');
  // coins raining onto the shelf crowd each other; the back wall scrapes them forward and they spill onto the field
  const m2 = new Machine(mulberry(9)), r = mulberry(10), shelf = [];
  for (let i = 0; i < 30; i++) { shelf.push(m2.add('c', (r() - 0.5) * 18, PH + 1 + (i % 3) * 0.4, BACK_WALL + 1.3 + r() * 3)); steps(m2, 0.4); }
  steps(m2, 15);
  const down = shelf.filter((c) => !c.body || c.body.translation().y < 1).length;
  ok(down >= 6, 'coins crowding the shelf spill off it onto the field (' + down + ' of 30)');
}
{
  // over the edge: the middle pays, the corners are gutters, Wall Guard closes them
  const m = new Machine(mulberry(7));
  const mid = m.add('c', 0, COIN_HH, EDGE - 0.4), side = m.add('c', -W / 2 + 1.25, COIN_HH, EDGE - 0.4);
  mid.body.setLinvel({ x: 0, y: 0, z: 40 }, true); side.body.setLinvel({ x: 0, y: 0, z: 40 }, true);
  const ev = []; for (let i = 0; i < 2 * HZ; i++) { m.stepOnce(); ev.push(...m.events); m.events.length = 0; }
  ok(ev.some((e) => e.t === 'pay' && Math.abs(e.x) < 1), 'a coin over the middle of the edge pays');
  ok(ev.some((e) => e.t === 'lost' && e.x < -W / 2 + 3), 'a coin over a corner gutter is lost');
  m.guard = true;
  const g2 = m.add('c', W / 2 - 1.25, COIN_HH, EDGE - 0.4); g2.body.setLinvel({ x: 0, y: 0, z: 40 }, true);
  const ev2 = []; for (let i = 0; i < 2 * HZ; i++) { m.stepOnce(); ev2.push(...m.events); m.events.length = 0; }
  ok(ev2.some((e) => e.t === 'pay') && !ev2.some((e) => e.t === 'lost'), 'Wall Guard turns a gutter coin into a payout');
}
{
  // the two shooters fire from the back corners in toward the middle
  const m = new Machine(mulberry(8));
  const L = m.shoot('c', 'L'), R = m.shoot('c', 'R');
  ok(L.body.translation().x < 0 && L.body.linvel().x > 0, 'the left shooter fires from the left corner toward the middle');
  ok(R.body.translation().x > 0 && R.body.linvel().x < 0, 'the right shooter fires from the right corner toward the middle');
  steps(m, 3);
  ok([L, R].every((c) => !c.body || (c.body.translation().y < 3 && Math.abs(c.body.translation().x) < W / 2)), 'shot coins land in the machine');
}

// ---------------------------------------------------------------- coins never sit inside each other
// A coin "inside" another: any point of its middle disc lies within the other coin's thickness and radius.
const rotv = (q, x, y, z) => { const ix = q.w * x + q.y * z - q.z * y, iy = q.w * y + q.z * x - q.x * z, iz = q.w * z + q.x * y - q.y * x, iw = -q.x * x - q.y * y - q.z * z; return [ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y, iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z, iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x]; };
const SAMP = []; for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; for (const rr of [0.95, 0.6]) SAMP.push([Math.cos(a) * rr, Math.sin(a) * rr]); } SAMP.push([0, 0]);
function overlaps(m) {
  const cs = m.coins.filter((c) => c.body).map((c) => { const p = c.body.translation(), q = c.body.rotation(); return { K: KINDS[c.k], p, q, n: rotv(q, 0, 1, 0) }; });
  let n = 0, worst = 0;
  for (let i = 0; i < cs.length; i++) for (let j = 0; j < cs.length; j++) {
    if (i === j) continue; const A = cs[i], B = cs[j];
    if (Math.hypot(A.p.x - B.p.x, A.p.y - B.p.y, A.p.z - B.p.z) > A.K.r + B.K.r) continue;
    let deep = 0;
    for (const [u, v] of SAMP) { const w = rotv(A.q, u * A.K.r, 0, v * A.K.r); const x = A.p.x + w[0] - B.p.x, y = A.p.y + w[1] - B.p.y, z = A.p.z + w[2] - B.p.z;
      const h = x * B.n[0] + y * B.n[1] + z * B.n[2], rad = Math.sqrt(Math.max(0, x * x + y * y + z * z - h * h)), inT = B.K.hh - Math.abs(h), inR = B.K.r - rad; if (inT > 0 && inR > 0) deep = Math.max(deep, Math.min(inT, inR)); }
    if (deep > 0.03) { n++; worst = Math.max(worst, deep); }
  }
  return { n, worst };
}
{
  // a still carpet: nothing overlaps and nothing gets popped about
  const m = new Machine(mulberry(31)); m.seedCarpet(); steps(m, 5);
  m.fixes = 0; let sum = 0, k = 0, worst = 0;
  for (let i = 0; i < HZ * 6; i++) { m.stepOnce(); if (i % 10 === 0) { const o = overlaps(m); sum += o.n; k++; worst = Math.max(worst, o.worst); } }
  ok(sum / k < 0.6 && worst < 0.15, `a settled carpet has (almost) no coin inside another (${(sum / k).toFixed(2)} pairs, deepest ${(worst * 10).toFixed(1)} mm)`);
  ok(m.fixes / 6 < 3, `a settled carpet is left alone: no coins popped into place (${(m.fixes / 6).toFixed(1)}/s)`);
  // busy play: coins pile and tilt, overlaps stay rare and shallow
  m.events.length = 0; sum = 0; k = 0; worst = 0;
  for (let i = 0; i < HZ * 30; i++) { if (i % 10 === 0) m.shoot('c', i % 20 ? 'L' : 'R'); m.stepOnce(); m.events.length = 0; if (i % 10 === 0) { const o = overlaps(m); sum += o.n; k++; worst = Math.max(worst, o.worst); } }
  ok(sum / k < 2.2 && worst < 0.26, `during play, coins inside others stay rare and shallow (${(sum / k).toFixed(2)} pairs at a time, deepest ${(worst * 10).toFixed(1)} mm of a ${(KINDS.c.hh * 20).toFixed(1)} mm coin)`);
}
{
  // tower rings: neighbours in a layer never overlap; crown tokens never overlap each other
  const m = new Machine(mulberry(32));
  const T = m.placeTower(900, { crown: ['B', 'P', 'Y'] }); T.layers = Math.ceil(900 / 8); T.hgt = T.layers * 2 * COIN_HH; T.H = T.hgt;
  let gap = 1e9; for (let L = 0; L < T.layers; L++) for (let a = 0; a < 8; a++) for (let b = a + 1; b < 8; b++) { const p = Machine.ringLocal(T, L * 8 + a), q = Machine.ringLocal(T, L * 8 + b); gap = Math.min(gap, Math.hypot(p[0] - q[0], p[2] - q[2]) - 2 * KINDS.c.r); }
  ok(gap >= 0, 'coins in a tower layer touch edge to edge, never overlapping (' + (gap * 10).toFixed(2) + ' mm apart)');
  let cg = 1e9; for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) { const p = Machine.crownLocal(T, a), q = Machine.crownLocal(T, b); cg = Math.min(cg, Math.hypot(p[0] - q[0], p[2] - q[2]) - 2 * KINDS.B.r); }
  ok(cg >= 0, 'the tokens crowning a tower never overlap');
}

// ---------------------------------------------------------------- a long session stays sane
{
  const g = newGame(2);
  g.bank = 1e6;
  let bad = 0, maxN = 0;
  play(g, 120, 4, () => {
    for (const c of g.f.coins) { if (!c.body) continue; const p = c.body.translation(); if (!isFinite(p.x + p.y + p.z) || (p.z < EDGE - 0.5 && p.y < -0.05) || (Math.abs(p.x) > W / 2 + 0.5 && p.z < EDGE)) bad++; }
    maxN = Math.max(maxN, g.f.live());
  });
  eq(bad, 0, 'no coin sinks through the floor, passes a wall or goes NaN in 2 minutes of play');
  ok(maxN <= FIELD_CAP + 160, 'the loose coins stay bounded (' + maxN + ')');
  ok(g.stats.paid > 150 && g.stats.lost > 0, 'coins pour over the edge (' + g.stats.paid + ') and some fall in the gutters');
  ok(g.stats.kills >= 1, 'enemies die during normal play (' + g.stats.kills + ' kills)');
}

// ---------------------------------------------------------------- towers
{
  const g = newGame(13); g.foe.hp = g.foe.max = 1e9; g.bank = 1e6;
  const T = g.f.placeTower(300, { col: 'B', crown: ['B', 'B'] });
  let built = false, maxTilt = 0;
  play(g, 40, 6, () => { if (T.state === 'stand') { built = true; maxTilt = Math.max(maxTilt, T.tilt || 0); } });
  ok(built && g.f.towers.includes(T), 'the tower finishes building and is still standing 40 s later');
  ok(maxTilt < 0.12 && T.body.translation().z > FACE_RET + 2, 'it rides the carpet forward slowly, upright (' + maxTilt.toFixed(2) + ' rad)');
  // at the edge it goes over toward the player, smacks the front glass and spills
  T.body.setTranslation({ x: 0, y: T.H / 2 + 0.01, z: EDGE - 1 }, true);
  let smack = null, burst = null, paid0 = g.stats.paid;
  for (let i = 0; i < 60 * 15 && !burst; i++) { g.tick(1 / 60); for (const e of g.out) { if (e.t === 'smack') smack = e; if (e.t === 'burst') burst = e; } g.out.length = 0; }
  ok(smack && smack.z === GLASS_Z, 'a tower that reaches the edge falls over and smacks against the front glass');
  for (let i = 0; i < 60; i++) { g.tick(1 / 60); g.out.length = 0; }
  ok(burst && !g.f.towers.includes(T), 'then it crumbles into loose coins');
  for (let i = 0; i < 60 * 6; i++) { g.tick(1 / 60); g.out.length = 0; }
  ok(g.stats.paid - paid0 > 120, 'most of its coins pour down between the edge and the glass and pay (' + (g.stats.paid - paid0) + ')');
  // every coin of the tower is accounted for: the loose coins it becomes carry its whole value
  const m = new Machine(mulberry(5)); m.seedCarpet();
  const T2 = m.placeTower(720, {});
  ok(T2.state === 'wait' && !T2.body, 'a won tower waits for the pusher to pull back');
  let rose = false, pfMax = -Infinity, ang0 = null, angMax = 0;
  for (let i = 0; i < HZ * 8 && T2.state !== 'stand'; i++) {
    m.stepOnce();
    if (T2.state === 'build') {
      rose = true; pfMax = Math.max(pfMax, m.pf);
      const q = T2.body.rotation(), a = 2 * Math.atan2(q.y, q.w); if (ang0 === null) ang0 = a; angMax = Math.max(angMax, Math.abs(Math.sin((a - ang0) / 2)));
    }
  }
  ok(rose && pfMax < FACE_MIN - 1, 'the pusher stays pulled back past its normal stroke the whole time the tower rises');
  ok(angMax > 0.7, 'the tower spirals up: it turns as it rises');
  ok(rose && T2.state === 'stand' && Math.abs(T2.body.translation().z - FACE_RET) < 0.3, 'it rises out of the floor in the pusher notch, then stands');
  ok(T2.body.translation().y > T2.H / 2 - 0.05, 'once risen it stands on the floor, not sunk or launched');
  m.events.length = 0;
  const before = new Set(m.coins); let spawned = 0; const add0 = m.add.bind(m);
  m.add = (...a) => { const c = add0(...a); if (c.k === 'c') spawned += c.mul; return c; };
  m.burst(T2);
  ok(T2.state === 'crumble', 'a toppling tower crumbles: its layers peel off as real coins, top first');
  for (let i = 0; i < HZ * 1.2 && T2.body; i++) m.stepOnce();
  ok(!T2.body && !m.towers.includes(T2), 'within about half a second the whole tower has become loose coins');
  eq(spawned, 720, 'a toppled tower turns into loose coins worth all 720 of its coins');
  ok(m.live() <= CRUMBLE_LIVE + 2, 'a big crumble never floods the field past its cap (' + m.live() + ')');
}
{
  const counts = {}; WHEEL.forEach((P) => { counts[P.c] = (counts[P.c] || 0) + 1; });
  ok(counts.JP === 1 && counts.B >= 3 && counts.Y >= 3 && counts.P >= 2 && counts.V >= 2, 'the wheel has one jackpot pocket, smaller towers more often than big ones');
  eq([TOWER.B, TOWER.Y, TOWER.P, TOWER.V, TOWER.JP], [300, 400, 600, 900, 1200], 'tower sizes: 300, 400, 600, 900, and the biggest, 1200');
  ok(WHEEL.filter((P) => P.c === 'JP').length === 1, 'the 1200 tower is the one jackpot pocket');
}

{
  // a jackpot from the wheel, end to end; and a second tower bought while the first still stands waits its turn
  const g = newGame(41); g.foe.hp = g.foe.max = 1e9; g.bank = 1e6; g.score = 1e9;
  g.wheelQ = 1; g.spinWheel(); g.resolveWheel(WHEEL.findIndex((P) => P.c === 'JP'));
  const J = g.f.towers[0];
  let maxY = 0, stood = false;
  play(g, 8, 6, () => { if (J.body) { maxY = Math.max(maxY, J.body.translation().y); if (J.state === 'stand') stood = true; } });
  ok(stood && maxY < J.H / 2 + 0.5 && J.want === 1200, 'the 1200-coin jackpot tower rises in the notch and stands without being launched');
  g.buy('wheel'); g.spinWheel(); g.resolveWheel(0);
  const T2 = g.f.towers.find((T) => T !== J);
  ok(T2 && (T2.state === 'wait' || !J.body), 'a second tower waits while the first one still blocks the notch');
  // move the first one on (as the pusher would), then the second rises in the notch
  J.body.setTranslation({ x: 0, y: J.H / 2 + 0.01, z: 7 }, true);
  let rose = false;
  play(g, 10, 6, () => { if (T2.body && T2.state === 'stand') rose = true; });
  ok(rose, 'once the notch is clear, the waiting tower rises');
}

// ---------------------------------------------------------------- token row: triples, volleys, combo
{
  const g = newGame(8, false);
  const hp0 = g.foe.hp;
  g.pushToken('B'); g.pushToken('P'); g.pushToken('B');
  ok(!g.out.some((e) => e.t === 'attack'), 'two of a colour do nothing yet');
  g.pushToken('B');
  ok(g.out.some((e) => e.t === 'attack' && e.col === 'B'), 'three blue tokens make Rox attack');
  eq(g.row, ['P'], 'the three matched tokens leave the row, the rest stay');
  eq(hp0 - g.foe.hp, heroAtk(1) * 3, 'a hero attack deals three hits of the hero attack');
  const vol = g.out.find((e) => e.t === 'autoStart');
  ok(vol && vol.n === AUTO_SHOTS.B, 'a blue triple makes a shooter fire a free volley of ' + AUTO_SHOTS.B);
  const bank = g.bank, n0 = g.f.coins.length;
  for (let i = 0; i < 90; i++) g.tick(1 / 60);
  ok(g.bank >= bank && g.f.coins.length >= n0 + AUTO_SHOTS.B - 2, 'the volley lands in the machine and costs no coins');
  ok(AUTO_SHOTS.B === 10 && AUTO_SHOTS.Y === 15 && AUTO_SHOTS.P === 25, 'volleys: blue 10, yellow 15, pink 25');
  g.pushToken('Y'); g.pushToken('Y'); g.pushToken('Y');
  eq(g.out.filter((e) => e.t === 'autoStart').map((e) => e.side), ['L', 'R'], 'volleys take turns between the left and right shooter');
}
// ---------------------------------------------------------------- combo meter
{
  const g = newGame(9, false); g.foe.hp = g.foe.max = 1e9;
  for (const k of ['B', 'B', 'B', 'P', 'P', 'P']) g.pushToken(k);
  eq(g.combo, 2, 'every three-of-a-kind adds to the combo');
  for (const k of ['B', 'P', 'Y', 'B', 'P', 'Y']) g.pushToken(k);
  ok(g.out.some((e) => e.t === 'comboBreak' && e.combo === 2), 'six tokens without a triple break the combo');
  ok(g.combo === 0 && g.meter === 0 && g.row.length === 0, 'a break empties the meter and the row');
  for (let i = 0; i < COMBO_FULL; i++) { g.pushToken('Y'); g.pushToken('Y'); g.pushToken('Y'); }
  ok(g.fever === FEVER_TIME && g.meter === 0 && g.combo === COMBO_FULL, 'a full combo meter starts Double Time and the combo keeps counting');
  const hp = g.foe.hp; g.pushToken('P'); g.pushToken('P'); g.pushToken('P');
  eq(hp - g.foe.hp, heroAtk(1) * 3 * 2, 'attacks deal double damage in Double Time');
}
{
  const g = newGame(10, false); g.foe.hp = g.foe.max = 1e9;
  for (let i = 0; i < 9; i++) g.pushToken('Y');
  eq(g.hero('Y').lv, 2, 'Mew levels up after enough attacks');
}

// ---------------------------------------------------------------- coins are not reused: they score points
{
  const g = newGame(30, false);
  const bank = g.bank;
  const c = g.f.add('c', 0, COIN_HH, EDGE - 0.3); c.body.setLinvel({ x: 0, y: 0, z: 40 }, true);
  for (let i = 0; i < 90; i++) g.tick(1 / 60);
  eq(g.score, COIN_PTS, 'a coin over the edge scores points');
  ok(g.bank <= bank + 2, 'a coin over the edge does not come back to shoot');
  g.combo = 4;
  const d = g.f.add('g', 0, COIN_HH, EDGE - 0.3); d.body.setLinvel({ x: 0, y: 0, z: 40 }, true);
  for (let i = 0; i < 90; i++) g.tick(1 / 60);
  eq(g.score - COIN_PTS, Math.round(COIN_PTS * 2 * comboMult(4)), 'gold coins score double, times the combo');
  const b2 = g.bank; g.damage(1e6, 'chip', null);
  eq(g.bank, b2 + KILL_COINS, 'beating an enemy gives coins to shoot');
}

// ---------------------------------------------------------------- enemy -> wheel -> tower -> next enemy
{
  const g = newGame(11, false);
  g.damage(1e6, 'chip', null);
  ok(g.foe === null && g.wheelQ === 1, 'a defeated enemy queues one Galaxy Wheel spin');
  g.damage(50, 'chip', null);
  eq(g.pendingDmg, 50, 'damage dealt while the wheel spins is kept for the next enemy');
  const i = g.spinWheel();
  g.resolveWheel(i);
  ok(g.f.towers.length === 1 && g.f.towers[0].want === TOWER[WHEEL[i].c], 'the pocket builds a tower of its colour height');
  ok(g.foe && g.foe.idx === 1 && g.foe.hp === g.foe.max - 50, 'the next enemy arrives and takes the kept damage');
  const g2 = newGame(12, false); g2.damage(1e6, 'chip', null); g2.spinWheel();
  g2.resolveWheel(WHEEL.findIndex((P) => P.lv));
  ok(g2.heroes.every((h) => h.lv === 2), 'a LV pocket levels up all three heroes');
}

// ---------------------------------------------------------------- economy and items
{
  const g = newGame(15, false);
  g.bank = 0;
  ok(!g.fire('L'), 'you cannot fire with an empty bank');
  for (let i = 0; i < 60 * 11; i++) g.tick(1 / 60);
  ok(g.bank >= 8, 'an empty bank refills over time');
  g.bank = 10; g.fireCd = 0; g.fire('R');
  eq(g.bank, 9, 'a shot costs one coin');
  ok(!g.fire('R'), 'shots are rate limited');
  ok(foeAt(4).boss && foeAt(4).hp > foeAt(3).hp * 2, 'every fifth enemy is a much tougher boss');
}
{
  const g = newGame(20);
  g.score = 10;
  ok(!g.buy('wheel') && g.score === 10, 'an item you cannot afford is not bought');
  g.score = 1e6;
  ok(g.buy('wheel') && g.score === 1e6 - ITEMS.wheel.cost && g.wheelQ === 1, 'Tower Call costs points and queues a wheel spin');
  const b0 = g.bank; g.buy('refill');
  eq(g.bank, b0 + ITEMS.refill.coins, 'a Coin Pack turns points into coins to shoot');
  const n0 = g.f.coins.length; g.row = ['P', 'P']; g.buy('rain');
  const fresh = g.f.coins.slice(n0).map((c) => c.k);
  ok(fresh.length === 3 && fresh.filter((k) => k === 'P').length >= 2, 'Token Rain drops three tokens favouring the colour you collect');
  g.buy('guard'); g.tick(1 / 60);
  ok(g.f.guard, 'Wall Guard closes the gutters');
  for (let i = 0; i < 60 * 31; i++) g.tick(1 / 60);
  ok(g.guardT === 0 && !g.f.guard, 'Wall Guard runs out');
  const t0 = g.f.t; g.buy('turbo'); for (let i = 0; i < 60; i++) g.tick(1 / 60);
  ok(Math.abs(g.f.t - t0 - 2) < 0.15, 'Turbo Push doubles the pusher speed');
  const zs = () => { const a = g.f.coins.filter((c) => c.body && c.body.translation().y < 1).map((c) => c.body.translation().z); return a.reduce((x, y) => x + y, 0) / a.length; };
  const z0 = zs(); g.buy('quake'); for (let i = 0; i < 12; i++) g.tick(1 / 60);
  ok(zs() > z0 + 0.1, 'Quake jolts the coins forward');
  ok(ITEM_ORDER.every((id) => ITEMS[id].name && ITEMS[id].cost > 0 && ITEMS[id].desc), 'every item has a name, price and description');
}

// ---------------------------------------------------------------- saves
{
  const g = newGame(16);
  g.bank = 77; g.row = ['B', 'Y']; g.heroes[1].lv = 4; g.foe.hp = 33; g.score = 1234; g.combo = 3; g.meter = 3;
  g.f.placeTower(360, { col: 'Y', crown: ['Y', 'Y'] });
  for (let i = 0; i < 60 * 4; i++) g.tick(1 / 60);
  const s = JSON.parse(JSON.stringify(g.save()));
  const h = Game.load(s, new Machine());
  ok(h && h.bank === g.bank && h.heroes[1].lv === 4 && h.foe.hp === g.foe.hp && h.score === g.score && h.combo === 3 && h.meter === 3, 'a save round-trips coins, points, combo, heroes and enemy');
  ok(g.row.length >= 2 && g.row[0] === 'B' && g.row[1] === 'Y', 'the row kept the tokens it started with');
  eq(h.row, g.row, 'the token row is saved');
  const onBoard = g.f.coins.filter((c) => c.body).map((c) => c.body.translation()).filter((p) => Math.abs(p.x) <= 12 && p.z <= 12 && p.y >= 0).length;   // coins already falling off are not saved
  ok(Math.abs(h.f.live() - onBoard) <= 2 && h.f.towers.length === 1 && h.f.towers[0].n === 360, 'the coins on the field (with their tilt) and the standing tower are saved');
  // an old save from the 2.5D machine keeps its progress and gets a fresh 3D machine
  const old = Game.load({ v: 1, bank: 55, score: 999, foeIdx: 2, foe: { hp: 10 }, heroes: [{ lv: 3 }], coins: [['c', 5, 10, 0]] }, new Machine());
  ok(old && old.bank === 55 && old.score === 999 && old.foeIdx === 2 && old.heroes[0].lv === 3 && old.f.live() > 60, 'an old save keeps its progress and gets a fresh machine');
  eq(Game.load({ v: 99 }, new Machine()), null, 'an unknown save version is refused');
}

// ---------------------------------------------------------------- performance budget
{
  const g = newGame(17); g.bank = 1e6;
  play(g, 40, 4);
  const t0 = performance.now();
  play(g, 20, 4);
  const ms = performance.now() - t0;
  ok(ms < 9000, `20 s of play with ~${g.f.live()} coins simulates in ${ms.toFixed(0)} ms (budget 9000)`);
}

if (process.env.GP_VERBOSE) console.log('done');
console.log(`galaxy_pusher_core: ${passed} passed, 0 failed`);
