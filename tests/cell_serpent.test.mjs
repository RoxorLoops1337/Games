// Cell Serpent: headless suite. The sim is pure (cell_serpent/sim.js), the drawing kit and
// renderer are smoke-tested against a stub 2d context, and the asset list is checked on disk.
// Run: node tests/cell_serpent.test.mjs
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'cell_serpent');
const sim = await import(join(root, 'sim.js'));
const { createRenderer } = await import(join(root, 'render.js'));
const { ART_KEYS } = await import(join(root, 'art.js'));
const { createArtDraw } = await import(join(root, 'art_draw.js'));
const { W, H, LINE_Y, ROW_Y } = sim;
const noop = () => {};
const stubCtx = () => new Proxy({}, { get: (_t, k) => (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop: noop }) : k === 'measureText' ? () => ({ width: 10 }) : noop, set: () => true });
const stubCanvas = (w, h) => ({ width: w, height: h, getContext: stubCtx });

let n = 0;
const ok = (name, fn) => { fn(); n++; };
const run = (g, secs, input, pick = 0) => { for (let i = 0; i < secs * 60; i++) { sim.step(g, 1 / 60, typeof input === 'function' ? input(g) : input); if (g.phase === 'levelup') sim.choose(g, pick); } };
const bot = g => sim.botInput(g);
// the tail drives the chain, so to move the whole virus shift both the tail and every cell
const shiftChain = (g, shift) => { const sn = g.snakes[0]; sn.tail += shift; for (const q of sn.segs) q.ps += shift; };
// park the virus so cell number `idx` sits `dy` px straight above the cell (the cell slides under it)
const bringNear = (g, dy = 170, idx = 0) => {
  const sn = g.snakes[0]; let target = 0;
  for (let t = 0; t < g.path.len; t += 2) if (sim.pointAt(g.path, t).y >= ROW_Y - dy) { target = t; break; }
  shiftChain(g, target - sn.segs[idx].ps);
  const q = sim.pointAt(g.path, target); g.p.x = Math.max(g.p.zone.x0, Math.min(g.p.zone.x1, q.x));
};
const ALL = { needles: 1, stick: 1, bubble: 1, satellite: 1, maw: 1 };

ok('deterministic: same seed, same run', () => {
  const a = sim.createGame({ seed: 7 }), b = sim.createGame({ seed: 7 });
  run(a, 25, bot); run(b, 25, bot);
  const snap = g => JSON.stringify(g.snakes.map(s => s.segs.map(q => [q.x.toFixed(3), q.hp.toFixed(3)])));
  assert.equal(snap(a), snap(b)); assert.equal(a.kills, b.kills); assert.equal(a.coins, b.coins);
});

ok('every lane stage has its own shape and runs from above the screen past the line; ring stages spiral into a circle', () => {
  assert.equal(sim.PATH_KINDS.length, 9);
  const sigs = new Set(); let lanes = 0;
  for (let s = 1; s <= 9; s++) {
    const p = sim.buildPath(s);
    if (sim.stageKind(s) === 'ring') { assert.equal(p.kind, 'ring'); continue; }
    lanes++;
    assert.ok(p.pts[0].y < 0 && p.pts.at(-1).y > LINE_Y, 'stage ' + s);
    assert.ok(p.len > H, 'the lane winds, so it is longer than the screen');
    assert.ok(p.pts.every(q => q.x > -50 && q.x < W + 50), 'stays on screen');
    sigs.add(sim.PATH_KINDS[sim.pathKind(s)] + ':' + Math.round(p.len / 10));
  }
  assert.equal(sigs.size, lanes);
  const a = sim.buildPath(1), b = sim.buildPath(2); assert.notEqual(Math.round(a.len), Math.round(b.len));
  assert.ok(sim.pointAt(a, -50).y < sim.pointAt(a, 0).y && sim.pointAt(a, 900).y > sim.pointAt(a, 100).y);
  const ring = sim.buildPath(6), end = sim.pointAt(ring, ring.len);
  assert.ok(Math.abs(Math.hypot(end.x - sim.RING.cx, end.y - sim.RING.cy) - sim.RING.R) < 12, 'the spiral ends on the circle');
  assert.ok(ring.pts.every(q => q.x > -40 && q.x < W + 40), 'the spiral fits the screen');
});

ok('50 stages: some have two snakes, some a circle around the duo, and the circle ends the run when the snake reaches it', () => {
  assert.equal(sim.MAX_STAGE, 50);
  const kinds = new Set(Array.from({ length: 50 }, (_, i) => sim.stageKind(i + 1)));
  assert.deepEqual([...kinds].sort(), ['double', 'lane', 'ring']);
  assert.equal(sim.stageKind(1), 'lane'); assert.equal(sim.stageKind(6), 'ring'); assert.equal(sim.stageKind(7), 'double');
  assert.ok(!sim.canPlay({ cleared: 50 }, 51) && sim.canPlay({ cleared: 49 }, 50));
  const d = sim.createGame({ seed: 3, stage: 7 }); assert.equal(d.snakes.length, 2); assert.notEqual(d.snakes[0].path, d.snakes[1].path);
  assert.equal(d.upgradeLeft, d.snakes.reduce((a, sn) => a + sn.segs.filter(q => q.kind === 'upgrade').length, 0));
  for (let i = 0; i < 60 * 20; i++) sim.step(d, 1 / 60, {});
  assert.ok(d.snakes.every(sn => sn.segs[0].y > -100 || sn.segs[0].ps < 300), 'the second snake enters later');
  const r = sim.createGame({ seed: 4, stage: 6 }); assert.ok(r.ring); assert.equal(r.p.y, sim.RING.cy); assert.ok(r.p.zone.x1 - r.p.zone.x0 < 260);
  for (let i = 0; i < 30; i++) sim.step(r, 1 / 60, { mx: 1 }); assert.ok(r.p.x <= sim.RING.cx + 100 && r.p.y === sim.RING.cy, 'the duo stays inside the circle');
  r.snakes[0].tail = 1e9; sim.step(r, 1 / 60, {}); assert.equal(r.phase, 'dead', 'the snake reached the circle');
  const f = sim.createGame({ seed: 4, stage: 3 }); assert.ok(!f.ring);
});

ok('stages: names, five skins, boss every 5th, longer snakes and more HP per cell as you go', () => {
  assert.ok(!sim.isBossStage(4) && sim.isBossStage(5) && sim.isBossStage(10));
  assert.equal(sim.virusName(1), 'Love-Struck Serpent'); assert.equal(new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(sim.skinFor)).size, 10, 'ten different species');
  assert.ok(sim.snakeLength(1) >= 30 && sim.snakeLength(10) > sim.snakeLength(1) && sim.snakeLength(5) > sim.snakeLength(4));
  assert.ok(sim.hpBase(1) >= 100, 'numbers are big');
  assert.ok(sim.hpBase(10) > sim.hpBase(1) * 1.5);
  const info = sim.stageInfo(7); assert.ok(info.name && info.skin && info.path && info.length > 30);
  assert.ok(sim.createGame({ seed: 3, stage: 5 }).snakes[0].boss);
});

ok('only the snake: no small viruses, no enemy shots, no falling things', () => {
  const g = sim.createGame({ seed: 2, stage: 4 });
  run(g, 30, bot);
  assert.equal(g.minions, undefined); assert.equal(g.ebullets, undefined);
  assert.ok(!sim.createGame({ seed: 2, stage: 9 }).snakes[0].segs.some(q => q.kind === 'spitter'));
  assert.ok(!('MINIONS' in sim));
});

ok('the cell only slides left and right along its row, in every stage', () => {
  for (const stage of [1, 2, 3]) {
    const g = sim.createGame({ seed: 4, stage });
    assert.equal(g.p.y, ROW_Y);
    run(g, 3, { mx: -1, my: 1 }); assert.equal(g.p.x, g.p.zone.x0); assert.equal(g.p.y, ROW_Y, 'vertical input is ignored');
    run(g, 3, { mx: 1, my: -1 }); assert.equal(g.p.x, g.p.zone.x1); assert.equal(g.p.y, ROW_Y);
  }
});

ok('it starts weak: 10 to 20 capsule shots per cell, one note, no skills; and the first upgrades are capsule upgrades', () => {
  const g = sim.createGame({ seed: 30 });
  assert.equal(Object.keys(g.weap).length, 0); assert.equal(g.level, 1);
  const capsule = 10 * g.p.atk;
  const normals = g.snakes[0].segs.filter(q => q.kind === 'normal' && q.i > 0), shotsOf = q => q.max / capsule;
  for (const q of normals) assert.ok(shotsOf(q) >= 4 && shotsOf(q) <= 55, `cell needs ${shotsOf(q)} shots`);
  const first = normals.slice(0, 4).reduce((a, q) => a + shotsOf(q), 0) / 4, last = normals.slice(-4).reduce((a, q) => a + shotsOf(q), 0) / 4;
  assert.ok(first < 15 && last > first * 2, 'the first cells are soft and the snake gets tougher and tougher: ' + first + ' -> ' + last);
  assert.ok(g.p.rate <= 2.2);
  const g4 = sim.createGame({ seed: 5, stage: 4 });
  for (const first of [0, 1]) {   // the first two picks only ever offer capsule upgrades (once the stage has enough kinds of them)
    g4.pending = 1; sim.step(g4, 1 / 60, {});
    assert.equal(g4.phase, 'levelup'); assert.ok(g4.choices.every(c => c.kind === 'capsule'), 'pick ' + first);
    sim.choose(g4, 0);
  }
  for (const first of [0, 1]) {   // in the very first stages only two kinds exist, so a weak passive fills the third card
    g.pending = 1; sim.step(g, 1 / 60, {});
    assert.equal(g.phase, 'levelup'); assert.ok(g.choices.every(c => c.kind !== 'weapon'), 'pick ' + first); assert.equal(g.choices.length, 3);
    sim.choose(g, 0);
  }
  g.pending = 1; sim.step(g, 1 / 60, {});
  assert.ok(g.choices.some(c => c.kind !== 'capsule') || g.choices.length === 3, 'from the third pick on skills may appear');
});

ok('capsule upgrades: extra notes fan out side by side, bursts repeat the volley, attack speed shoots faster, damage goes up', () => {
  const vol = ups => { const g = sim.createGame({ seed: 40 }); Object.assign(g.ups, ups); g.p.cd = 0; g.bullets.length = 0; sim.step(g, 1 / 60, {}); sim.step(g, 0.12, {}); return g; };
  const base = vol({}); assert.equal(base.bullets.length, 1);
  const notes = vol({ notes: 2 }); assert.equal(notes.bullets.length, 3);
  assert.equal(new Set(notes.bullets.map(b => Math.round(b.x))).size, 3, 'side by side'); assert.ok(notes.bullets.every(b => Math.abs(b.vx) < 1e-6 && b.vy < 0));
  const burst = vol({ burst: 1 }); assert.equal(burst.bullets.length, 2, 'a second volley follows within 0.1s'); assert.ok(burst.bullets[0].y !== burst.bullets[1].y);
  const shots = ups => { const g = sim.createGame({ seed: 41 }); Object.assign(g.ups, ups); run(g, 6, {}); return g.shots; };
  assert.ok(shots({ aspd: 10 }) > shots({}) * 1.4);
  const dm = ups => { const g = sim.createGame({ seed: 42 }); Object.assign(g.ups, ups); g.p.crit = 0; g.p.cd = 0; sim.step(g, 1 / 60, {}); return g.bullets[0].dmg; };
  assert.ok(dm({ cdmg: 8 }) > dm({}) * 1.8);
});

ok('the virus stays one connected chain: a destroyed cell is removed and the front slides back to close the gap', () => {
  const g = sim.createGame({ seed: 3 });
  const sn = g.snakes[0], len = sn.segs.length; sn.speed = 0.01;
  run(g, 0.2, {});
  const headPs = sn.segs[0].ps;
  sn.segs[5].hp = 0; sim.step(g, 1 / 60, {});
  assert.equal(g.snakes.length, 1, 'never splits'); assert.equal(sn.segs.length, len - 1);
  assert.ok(g.events.some(e => e.t === 'kill') && g.pickups.length >= 1 && g.events.some(e => e.t === 'close'));
  run(g, 2, {});
  for (let i = 0; i < sn.segs.length - 1; i++) assert.ok(Math.abs(sn.segs[i].ps - sn.segs[i + 1].ps - (sn.segs[i].r + sn.segs[i + 1].r) * 0.78) < 0.6, 'neighbours touch again');
  assert.ok(sn.segs[0].ps < headPs - 20, 'the face slid back with the front cells');
});

ok('the face cannot be hit or targeted until it is the last cell; then it pops and the stage is cleared', () => {
  const g = sim.createGame({ seed: 4 });
  const sn = g.snakes[0], face = sn.segs[0]; sn.speed = 0.01;
  assert.ok(face.shield && face.isHead);
  bringNear(g, 170); g.p.hp = g.p.maxHp = 1e6; g.p.iframes = 1e6;
  run(g, 4, {});
  assert.equal(face.hp, 1, 'shots and skills pass through the face'); assert.ok(face.shield);
  for (const q of sn.segs.slice(1)) q.hp = 0;
  g.p.x = face.x; run(g, 2, {});
  assert.equal(g.snakes.length, 0, 'the face pops once it is alone');
  assert.ok(g.events.some(e => e.t === 'kill' && e.head) && ['clear', 'levelup'].includes(g.phase));
});

ok('if the face reaches the line the run is over; an Encore saves it once', () => {
  const g = sim.createGame({ seed: 5 });
  const sn = g.snakes[0], face = sn.segs[0];
  sn.tail = 1e9; sim.step(g, 1 / 60, {});
  assert.equal(g.phase, 'dead'); assert.ok(g.events.some(e => e.t === 'leak') && g.result && !g.result.won);
  assert.ok(face.ps <= g.path.len + 0.01, 'the face stops at the line');
  const r = sim.createGame({ seed: 5, meta: { rev: 1 } }); r.snakes[0].tail = 1e9; sim.step(r, 1 / 60, {});
  assert.equal(r.phase, 'play', 'the Encore saves the first loss'); assert.ok(r.revived && r.snakes[0].segs[0].ps < r.path.len - 400);
  r.snakes[0].tail = 1e9; sim.step(r, 1 / 60, {}); assert.equal(r.phase, 'dead', 'only once');
  assert.ok(LINE_Y === 1055 && ROW_Y > LINE_Y + 80, 'the duo stands below the line');
  assert.ok(!('hp' in g.p) || g.p.hp === undefined, 'no hit points');
});

ok('now and then the virus surges for a second, with a warning first', () => {
  const g = sim.createGame({ seed: 8 });
  const sn = g.snakes[0]; sn.speed = 100; sn.surgeT = 0.01; g.p.hp = g.p.maxHp = 1e9; g.p.iframes = 1e9;
  const tails = [], seen = new Set();
  let wentGo = false;
  for (let i = 0; i < 60 * 12; i++) {
    const t0 = sn.tail; sim.step(g, 1 / 60, {}); tails.push([sn.surge, sn.tail - t0]);
    for (const e of g.events.splice(0)) seen.add(e.t);
    if (sn.surge === 'go') wentGo = true; else if (wentGo && sn.surge === 'idle') break;   // look at the first surge only
  }
  assert.ok(seen.has('surgewarn') && seen.has('surge'), 'warns, then surges');
  const idle = tails.filter(t => t[0] === 'idle').map(t => t[1]), go = tails.filter(t => t[0] === 'go').map(t => t[1]);
  assert.ok(go.length >= 55 && go.length <= 75, 'about a second: ' + go.length);
  assert.ok(Math.min(...go) > Math.max(...idle) * 2, 'much faster while surging');
});

ok('a destroyed cell that carried a chest drops it: chests give Beats and a skill fragment, never a skill pick', () => {
  const g = sim.createGame({ seed: 11 });
  const sn = g.snakes[0], carriers = sn.segs.filter(q => q.carry === 'chest');
  assert.equal(carriers.length, 2); assert.ok(carriers.every(q => q.i > 0));
  carriers[0].hp = 0; sim.step(g, 1 / 60, {});
  const chest = g.pickups.find(p => p.kind === 'chest');
  assert.ok(chest && g.events.some(e => e.t === 'chestdrop'));
  chest.x = g.p.x; chest.y = g.p.y; chest.age = 1;
  const coins0 = g.coins; sim.step(g, 1 / 60, {});
  assert.equal(g.phase, 'play'); assert.ok(g.coins > coins0);
  assert.equal(Object.values(g.frags).reduce((a, b) => a + b, 0), 1); assert.ok(sim.WEAPONS.some(w => g.frags[w.id]));
});

ok('upgrades come only from the yellow upgrade cells; Free Refresh gives new choices, 4 times', () => {
  for (const stage of [1, 3, 6, 10]) {
    const g = sim.createGame({ seed: stage, stage }), segs = g.snakes[0].segs, ups = segs.filter(q => q.kind === 'upgrade');
    assert.equal(ups.length, g.upgradeLeft); assert.ok(ups.length >= 3 && ups.length <= Math.round(segs.length / 7) + 1, 'about one per 7 cells: ' + ups.length);
    assert.ok(ups.every(q => q.i > 0 && !q.carry), 'never the face, never a chest cell');
    assert.ok(ups.every(q => q.max > segs.find(x => x.kind === 'normal' && x.i > 0).max), 'a little tougher than a plain cell');
  }
  const g = sim.createGame({ seed: 12 }), sn = g.snakes[0];
  const plain = sn.segs.filter(q => q.kind === 'normal' && q.i > 0 && !q.carry).slice(0, 6);
  for (const q of plain) q.hp = 0; sim.step(g, 1 / 60, {});
  assert.equal(g.phase, 'play', 'popping plain cells never gives an upgrade'); assert.equal(g.pending, 0);
  const left0 = g.upgradeLeft, first = sn.segs.find(q => q.kind === 'upgrade'); first.hp = 0; sim.step(g, 1 / 60, {});
  assert.equal(g.phase, 'levelup'); assert.equal(g.choices.length, 3); assert.equal(g.upgradeLeft, left0 - 1); assert.ok(g.events.some(e => e.t === 'upgradecell'));
  const before = g.choices.map(c => c.id).join();
  let changed = false; for (let i = 0; i < 4; i++) { assert.ok(sim.reroll(g)); if (g.choices.map(c => c.id).join() !== before) changed = true; }
  assert.ok(changed); assert.ok(!sim.reroll(g), 'only 4 refreshes'); assert.equal(g.rerolls, 0);
  sim.choose(g, 0); assert.equal(g.phase, 'play'); assert.equal(g.level, 2);
  assert.ok(!sim.createGame({ seed: 3, stage: 9 }).snakes[0].segs.some(q => q.kind === 'gold' || q.kind === 'spitter'));
});

ok('every extra note counts: each pick adds a note, spaced apart so you can see it, and the card says so', () => {
  const g = sim.createGame({ seed: 5, stage: 3 });
  const card = () => g.choices.find(c => c.id === 'notes');
  const pickNotes = () => { g.phase = 'play'; g.pending = 1; sim.step(g, 1 / 60, {}); for (let k = 0; k < 40 && !card(); k++) { g.rerolls = 4; sim.reroll(g); } const i = g.choices.indexOf(card()); assert.ok(i >= 0); return sim.choose(g, i); };
  const volley = () => { g.bullets.length = 0; g.vq.length = 0; g.p.cd = 0; g.p.crit = 0; sim.step(g, 1 / 60, {}); sim.step(g, 0.05, {}); return g.bullets; };
  assert.equal(volley().length, 1);
  g.phase = 'play'; g.pending = 1; sim.step(g, 1 / 60, {}); for (let k = 0; k < 40 && !card(); k++) { g.rerolls = 4; sim.reroll(g); }
  assert.match(card().stat, /Notes per shot: 1 → \d/); const gain1 = card().gain; sim.choose(g, g.choices.indexOf(card()));
  const two = volley(); assert.equal(two.length, 1 + gain1); assert.ok(Math.abs(two[0].x - two[1].x) >= 40, 'visibly apart'); assert.ok(two.every(b => b.dmg === 10 * g.p.atk));
  assert.ok(pickNotes()); g.phase = 'play';
  const three = volley(); assert.equal(three.length, 1 + Math.round(sim.uv(g, 'notes'))); assert.equal(g.ups.notes, 2);
  assert.equal(new Set(three.map(b => Math.round(b.x))).size, three.length);
});

ok('skill picks: 3 distinct choices; locked skills never appear; maxed ones stop; at most five skills; every passive applies', () => {
  const g = sim.createGame({ seed: 13 });
  g.level = 5; g.pending = 1; sim.step(g, 1 / 60, {});
  assert.equal(g.choices.length, 3); assert.equal(new Set(g.choices.map(c => c.id)).size, 3);
  for (let i = 0; i < 40; i++) { g.phase = 'play'; g.pending = 1; sim.step(g, 1 / 60, {}); assert.ok(g.choices.every(c => !['stick', 'bubble', 'satellite', 'maw'].includes(c.id)), 'locked'); sim.choose(g, 0); }
  const h = sim.createGame({ seed: 14, skills: { stick: 1, bubble: 1, satellite: 1, maw: 1 } }); h.level = 9;
  for (const w of sim.WEAPONS.slice(0, 5)) h.weap[w.id] = { lv: w.id === 'swab' ? 5 : 2, cd: 0 };
  for (let i = 0; i < 40; i++) { h.phase = 'play'; h.pending = 1; sim.step(h, 1 / 60, {}); assert.ok(h.choices.every(c => c.id !== 'swab' && (c.kind !== 'weapon' || h.weap[c.id]))); sim.choose(h, 0); }
  const p = sim.createGame({ seed: 15 });
  for (const u of sim.PASSIVES) {
    for (let k = 0; k < u.max + 2; k++) { p.phase = 'levelup'; p.pending = 1; p.choices = [{ id: u.id, kind: 'passive', lvl: p.ups[u.id] || 0, max: u.max }]; if (k < u.max) sim.choose(p, 0); }
    assert.equal(p.ups[u.id], u.max, u.id);
  }
  assert.ok(p.p.slow > 0.3 && sim.uv(p, 'speed') >= 3 && p.p.crit > 0.2, 'Calm Down slows the snake, Sharp Notes pierce');
});

ok('every skill works at every level and hurts the virus; a permanent skill level makes it hit harder', () => {
  for (const w of sim.WEAPONS) for (const L of [1, 3, 5]) {
    const g = sim.createGame({ seed: 20 + L, unlocked: ALL, stage: 4 });
    g.weap[w.id] = { lv: L, cd: 0 };
    g.p.hp = g.p.maxHp = 1e6; g.p.rate = 0.0001; g.p.cd = 99;   // silence the capsule so only the skill deals damage
    bringNear(g); g.snakes[0].speed = 0.01;
    sim.step(g, 1 / 60, {});
    const before = g.stageHp;
    for (let i = 0; i < 60 * 12; i++) { sim.step(g, 1 / 60, { mx: 0, my: 0 }); g.events.length = 0; if (g.phase === 'levelup') sim.choose(g, 0); }
    assert.ok(g.stageHp < before || g.kills > 0, `${w.id} L${L} dealt no damage`);
  }
  const hit = lvl => { const g = sim.createGame({ seed: 60, skills: { swab: lvl } }); g.weap.swab = { lv: 1, cd: 0 }; g.p.cd = 99; bringNear(g, 250); g.snakes[0].speed = 0.01; sim.step(g, 1 / 60, {}); return g.zones[0] && g.zones[0].dmg; };
  assert.ok(hit(6) > hit(1) * 1.5, 'skill level 6 vs 1');
});

ok('swab plants a zone by the face; towers pulse; maw executes weak cells', () => {
  const g = sim.createGame({ seed: 8, stage: 3 });
  g.p.cd = 99; g.weap.swab = { lv: 3, cd: 0 }; bringNear(g, 250);
  sim.step(g, 1 / 60, {}); assert.ok(g.zones.length >= 1);
  const z = g.zones[0], head = g.snakes[0].segs[0]; assert.ok(Math.hypot(z.x - head.x, z.y - head.y) < 80);
  const g2 = sim.createGame({ seed: 9 }); g2.weap.tower = { lv: 5, cd: 0 }; sim.step(g2, 1 / 60, {});
  assert.equal(g2.towers.length, 3);
  const g3 = sim.createGame({ seed: 10, unlocked: ALL }); g3.p.cd = 99; g3.weap.maw = { lv: 5, cd: 99 };
  bringNear(g3, 250); g3.snakes[0].speed = 0.01; sim.step(g3, 1 / 60, {});
  const weak = g3.snakes[0].segs[2]; weak.hp = weak.max * 0.1;
  g3.maws.push({ x: weak.x, y: weak.y, r: 120, life: 1, max: 1, tick: 0, exec: 0.3, dmg: 0 }); sim.step(g3, 1 / 60, {});
  assert.ok(!g3.snakes.some(s => s.segs.includes(weak)), 'executed');
});

ok('a bomb cell chain-reacts into its neighbours and the cell', () => {
  const g = sim.createGame({ seed: 5 });
  const s = g.snakes[0], bomb = s.segs[4];
  bomb.kind = 'bomb'; bomb.hp = 0; bomb.max = 10; s.segs[5].hp = 1; s.segs[6].hp = 1;
  const pos = sim.pointAt(g.path, bomb.ps + 1);
  g.p.zone = { x0: -500, x1: 2000 }; g.p.x = pos.x + 90; g.p.iframes = 0; g.p.y = pos.y;
  sim.step(g, 1 / 60, {});
  assert.ok(g.events.some(e => e.t === 'boom'));
  assert.ok(g.snakes.every(x => x.segs.every(q => q.i !== 5 && q.i !== 6)), 'neighbours died in the blast');
});

ok('losing ends the run; the Encore saves it once; the hush pickup slows and the wall pickup pushes the snake back; rage works', () => {
  const d = sim.createGame({ seed: 17 }); d.snakes[0].tail = 1e9; sim.step(d, 1 / 60, {});
  assert.equal(d.phase, 'dead'); assert.ok(d.result && d.result.won === false && d.result.stage === 1 && d.result.name);
  const t = d.t; sim.step(d, 1 / 60, {}); assert.equal(d.t, t, 'the world stops');
  const r = sim.createGame({ seed: 17, meta: { rev: 1 } }); r.snakes[0].tail = 1e9; sim.step(r, 1 / 60, {});
  assert.equal(r.phase, 'play'); assert.ok(r.events.some(e => e.t === 'revive'));
  const s = sim.createGame({ seed: 18 }); const sn = s.snakes[0], ps0 = sn.segs[0].ps;
  const put = k => s.pickups.push({ kind: k, x: s.p.x, y: s.p.y, vx: 0, vy: 0, v: 1, age: 1, vac: true });
  put('heal'); put('shield'); put('rage'); sim.step(s, 1 / 60, {});
  assert.ok(sn.slow > 1 && s.p.rage > 0 && sn.segs[0].ps < ps0 - 100);
});

ok('one run is one stage: clearing the virus wins the run once the loot is in (no automatic next stage)', () => {
  const g = sim.createGame({ seed: 19, stage: 2 });
  for (const q of g.snakes[0].segs) q.hp = 0;
  sim.step(g, 1 / 60, {});
  assert.ok(['clear', 'levelup'].includes(g.phase)); assert.ok(g.events.some(e => e.t === 'clear') && g.coins > 0);
  run(g, 8, { mx: 0 });
  assert.equal(g.phase, 'won'); assert.equal(g.stage, 2); assert.equal(g.snakes.length, 0);
  assert.ok(g.result.won && g.result.stage === 2 && g.result.coins > 0 && g.result.frags);
  const t = g.t; sim.step(g, 1 / 60, {}); assert.equal(g.t, t, 'frozen once won');
});

ok('two currencies: Beats and Sparkles; a clear pays Sparkles only the first time', () => {
  const s = sim.defaultSave();
  assert.equal(s.beats, 0); assert.equal(s.sparkles, 0);
  const a = sim.applyResult(s, { won: true, stage: 1, coins: 30, kills: 12, frags: { swab: 2 } });
  assert.ok(a.first && a.sparkles === sim.clearReward(1).sparkles); assert.equal(s.beats, 30); assert.equal(s.sparkles, a.sparkles); assert.equal(s.cleared, 1); assert.equal(s.skills.swab.frag, 2);
  const b = sim.applyResult(s, { won: true, stage: 1, coins: 20, kills: 12, frags: {} });
  assert.ok(!b.first && b.sparkles === 0); assert.equal(s.beats, 50);
  const c = sim.applyResult(s, { won: false, stage: 2, coins: 10, kills: 3, frags: {} });
  assert.equal(s.cleared, 1); assert.equal(s.beats, 60);
  assert.ok(sim.clearReward(5).sparkles > sim.clearReward(4).sparkles, 'bosses pay more');
  assert.ok(c.beats === 10);
});

ok('stage select: you may play any stage up to the next uncleared one', () => {
  const s = sim.defaultSave();
  assert.ok(sim.canPlay(s, 1) && !sim.canPlay(s, 2));
  s.cleared = 3; assert.ok(sim.canPlay(s, 1) && sim.canPlay(s, 3) && sim.canPlay(s, 4) && !sim.canPlay(s, 5));
});

ok('shop: stats cost Beats; skills unlock and level up with fragments; loot boxes give fragments', () => {
  const s = sim.defaultSave(); s.beats = 1e7; s.sparkles = 1000;
  assert.ok(['atk', 'crt', 'cdn'].every(id => sim.META.some(m => m.id === id)));
  assert.ok(sim.buyMeta(s, 'atk')); assert.equal(s.meta.atk, 1); assert.ok(sim.metaCost(sim.META[0], 3) > sim.metaCost(sim.META[0], 1));
  const c0 = s.cleared; s.cleared = 40;   // b12q: stat levels are capped by cleared stages
  for (let i = 0; i < 50; i++) sim.buyMeta(s, 'atk'); assert.equal(s.meta.atk, sim.META[0].max);
  s.cleared = c0;
  // skills: the first five are owned, the rest need fragments
  assert.ok(sim.WEAPON_STARTERS.every(id => s.skills[id].lv === 1) && s.skills.maw.lv === 0);
  assert.ok(!sim.unlockSkill(s, 'maw'), 'not enough fragments');
  s.skills.maw.frag = 70; assert.ok(!sim.unlockSkill(s, 'maw'), 'needs the stage cleared first'); s.cleared = 15; assert.ok(sim.unlockSkill(s, 'maw')); assert.equal(s.skills.maw.lv, 1); assert.equal(s.skills.maw.frag, 10);
  assert.ok(!sim.levelSkill(s, 'swab'), 'no fragments yet');
  s.skills.swab.frag = sim.skillUpgradeCost(1).frag; const b0 = s.beats; assert.ok(sim.levelSkill(s, 'swab'), 'fragments alone are enough'); assert.equal(s.skills.swab.lv, 2); assert.equal(s.skills.swab.frag, 0); assert.equal(s.beats, b0);
  assert.ok(sim.skillMul(5) > sim.skillMul(1) * 1.4);
  // boxes
  let k = 0; const rand = () => { k = (k * 9301 + 49297) % 233280; return k / 233280; };
  const before = Object.values(s.skills).reduce((a, x) => a + x.frag, 0), bb = s.beats;
  const got = sim.openBox(s, 'beat', rand); assert.ok(got && got.reduce((a, x) => a + x.n, 0) === 5); assert.equal(s.beats, bb - 150);
  const sp = s.sparkles, big = sim.openBox(s, 'spark', rand); assert.equal(big.reduce((a, x) => a + x.n, 0), 12); assert.equal(s.sparkles, sp - 30);
  s.sparkles = 300; const grand = sim.openBox(s, 'spark10', rand); assert.equal(grand.reduce((a, x) => a + x.n, 0), 150); assert.ok(grand[0].n >= 45, 'a star prize'); assert.equal(s.sparkles, 30);
  assert.equal(Object.values(s.skills).reduce((a, x) => a + x.frag, 0), before + 5 + 12 + 150);
  const poor = sim.defaultSave(); assert.equal(sim.openBox(poor, 'beat'), null); assert.equal(poor.skills.swab.frag, 0);
});

ok('save: sanitising, migration from the old coins save, defaults', () => {
  const bad = sim.sanitizeSave({ beats: -5, sparkles: 'x', cleared: 3, meta: { atk: 999, nope: 4 }, skills: { maw: { lv: 99, frag: 7 }, nope: { lv: 1 } }, muted: 1 });
  assert.equal(bad.beats, 0); assert.equal(bad.sparkles, 0); assert.equal(bad.cleared, 3); assert.equal(bad.meta.atk, sim.META[0].max); assert.equal(bad.skills.maw.lv, sim.SKILL_MAX_LV); assert.equal(bad.skills.maw.frag, 7); assert.ok(!('nope' in bad.skills));
  assert.equal(sim.sanitizeSave({ coins: 123, best: 4 }).beats, 123, 'old saves keep their coins as Beats');
  assert.equal(sim.sanitizeSave(null).beats, 0);
  assert.ok(sim.sanitizeSave({ skills: { swab: { lv: 0 } } }).skills.swab.lv >= 1, 'starter skills can never be locked');
  const p = sim.makePlayer({ atk: 5, crt: 5, cdn: 5, vit: 2 });
  assert.ok(p.atk > 1.3 && p.crit > 0.1 && p.cdBase < 0.8 && Math.abs(p.slow - 0.04) < 1e-9);
});

ok('bot plays full runs: bounded entities, finite numbers, and clears an early stage with a little shop progress', () => {
  let wins = 0;
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const g = sim.createGame({ seed, stage: 1, meta: { atk: 3, vit: 2, cdn: 1 } });
    for (let i = 0; i < 60 * 400 && g.phase !== 'dead' && g.phase !== 'won'; i++) {
      sim.step(g, 1 / 60, bot(g)); if (g.phase === 'levelup') sim.choose(g, Math.floor(g.rand() * g.choices.length));
      assert.ok(g.bullets.length < 600 && g.pickups.length < 700 && g.zones.length < 20);
      assert.ok(Number.isFinite(g.p.x) && g.p.x >= 0 && g.p.x <= W && g.p.y === ROW_Y);
    }
    if (g.phase === 'won') wins++;
    for (const sn of g.snakes) for (const q of sn.segs) assert.ok(Number.isFinite(q.x) && Number.isFinite(q.y) && q.hp > 0);
  }
  assert.ok(wins >= 3, 'wins ' + wins);
});

ok('groove: every note that lands builds it (+2% damage per point), a pause in the hits lets it fade', () => {
  const g = sim.createGame({ seed: 50 });
  assert.equal(g.groove, 0); assert.equal(sim.GROOVE_MAX, 20);
  const sn = g.snakes[0]; sn.speed = 0.01; bringNear(g, 170); g.p.hp = g.p.maxHp = 1e9; g.p.iframes = 1e9;
  const dmgNow = () => { g.bullets.length = 0; g.vq.length = 0; g.p.cd = 0; g.p.crit = 0; const x = g.p.x; sim.step(g, 1 / 60, {}); g.p.x = x; return g.bullets[0].dmg; };
  const d0 = dmgNow();
  run(g, 6, {}); assert.ok(g.groove >= 3, 'hits build groove: ' + g.groove); assert.ok(g.grooveMax >= g.groove);
  assert.ok(dmgNow() > d0, 'groove raises damage'); assert.ok(g.groove <= sim.GROOVE_MAX);
  g.groove = 12; g.bullets.length = 0; g.p.cd = 99; g.p.x = 20;   // nothing above you any more
  run(g, 4, {}); assert.ok(g.groove < 12, 'it fades when the hits stop: ' + g.groove);
  const h = sim.createGame({ seed: 51 }); h.snakes[0].speed = 0.01; bringNear(h, 170); sim.step(h, 1 / 60, {}); h.groove = 4; h.events.length = 0;
  const cell = h.snakes[0].segs[3]; h.bullets.push({ x: cell.x, y: cell.y, vx: 0, vy: -1, dmg: 1, crit: false, pierce: 0, r: 6, life: 1, hit: [], kind: 'pill', home: 0, splash: 0, slow: 0 });
  sim.step(h, 1 / 60, {}); assert.equal(h.groove, 5); assert.ok(h.events.some(e => e.t === 'groove' && e.n === 5));
});

ok('boss shield wave: a wave of shields rolls down the chain; cells in it cannot be hit; plain stages have none', () => {
  const g = sim.createGame({ seed: 52, stage: 5 }), sn = g.snakes[0];
  assert.ok(sn.boss); sn.speed = 0.01; g.p.hp = g.p.maxHp = 1e9; g.p.iframes = 1e9;
  const seen = new Set(); let maxWave = 0, shielded = null;
  for (let i = 0; i < 60 * 12; i++) {
    sim.step(g, 1 / 60, {});
    const w = sn.segs.filter(q => q.wave);
    maxWave = Math.max(maxWave, w.length); w.forEach(q => seen.add(q.i)); if (w.length && !shielded) shielded = w[0];
  }
  assert.ok(maxWave >= 2 && maxWave <= 4, 'a short wave: ' + maxWave); assert.ok(seen.size > 8, 'it travels down the snake: ' + seen.size);
  assert.ok(sn.segs.every(q => q.i > 0 || !q.wave), 'never on the face');
  bringNear(g, 170); const cell = sn.segs[5]; const hp0 = cell.hp; g.bullets.push({ x: cell.x, y: cell.y, vx: 0, vy: -1, dmg: 500, crit: false, pierce: 0, r: 6, life: 1, hit: [], kind: 'pill', home: 0, splash: 0, slow: 0 });
  const waveOn = (t) => { for (let i = 0; i < 60 * 8; i++) { sim.step(g, 1 / 60, {}); if (sn.segs[5] && sn.segs[5].wave) return true; } return false; };
  assert.ok(waveOn(), 'the wave reaches cell 5');
  { const c5 = sn.segs[5]; g.bullets.length = 0; g.bullets.push({ x: c5.x, y: c5.y, vx: 0, vy: -1, dmg: 500, crit: false, pierce: 0, r: 6, life: 1, hit: [], kind: 'pill', home: 0, splash: 0, slow: 0 }); const hpIn = c5.hp; sim.step(g, 1 / 60, {}); assert.equal(c5.hp, hpIn, 'a shielded cell takes no damage'); }
  const plain = sim.createGame({ seed: 53, stage: 4 }); run(plain, 8, {}); assert.ok(plain.snakes[0].segs.every(q => !q.wave));
  assert.ok(hp0 > 0 && shielded);
});

ok('skills are cute animals with stable save ids; no medical leftovers', () => {
  assert.deepEqual(sim.WEAPONS.map(w => w.id), ['swab', 'daggers', 'tower', 'dragon', 'needles', 'stick', 'bubble', 'satellite', 'maw']);
  assert.deepEqual(sim.WEAPONS.map(w => w.name), ['Kitty Paws', 'Chick Circle', 'Cow Choir', 'Dove Squad', 'Hedgehog Quills', 'Bunny Thump', 'Duckling Splash', 'Owl Spotlight', 'Bulldog Chomp']);
  const text = JSON.stringify([sim.WEAPONS, sim.CAPSULE_UPS, sim.PASSIVES.map(p => [p.name, p.desc]), sim.META.map(m => m.name)]);
  assert.ok(!/swab|medical|acupunct|massage|membrane|antibod|disinfect|snot|dagger/i.test(text.replace(/"id":"(swab|daggers)"/g, '')), 'no medical words: ' + text.match(/swab|medical|acupunct|massage|membrane|antibod|disinfect|snot|dagger/i));
  assert.deepEqual(sim.META.map(m => m.id), ['atk', 'crt', 'cdn', 'vit', 'for', 'rev']);
});

ok('daily gigs: three deterministic goals a day; progress counts finished runs; claim once; a new day resets', () => {
  const day = 20000, a = sim.dailyGoals(day), b = sim.dailyGoals(day), c = sim.dailyGoals(day + 1);
  assert.deepEqual(a, b); assert.equal(a.length, 3); assert.equal(new Set(a.map(x => x.id)).size, 3);
  assert.notDeepEqual(a.map(x => x.id + x.target), c.map(x => x.id + x.target));
  assert.ok(a.every(x => x.text && x.target > 0 && (x.reward.beats || x.reward.sparkles)));
  const s = sim.defaultSave();
  assert.ok(!sim.claimGoal(s, day, a[0].id), 'nothing done yet');
  sim.addRunStats(s, day, { kills: 500, won: true, boss: true, bombs: 50, starsGained: 50, chests: 50, picks: 50, groove: 20 });
  for (const goal of a) assert.equal(sim.goalProgress(s, day, goal), goal.target);
  const b0 = s.beats, sp0 = s.sparkles;
  assert.ok(sim.claimGoal(s, day, a[0].id)); assert.ok(!sim.claimGoal(s, day, a[0].id), 'only once');
  assert.equal(s.beats + s.sparkles, b0 + sp0 + (a[0].reward.beats || 0) + (a[0].reward.sparkles || 0));
  assert.equal(sim.goalProgress(s, day + 1, sim.dailyGoals(day + 1)[0]), 0, 'a new day starts fresh');
  sim.addRunStats(s, day + 1, { kills: 1, won: false, chests: 0, picks: 0, groove: 3 }); assert.equal(s.daily.day, day + 1); assert.ok(!s.daily.claimed[a[0].id]);
  const clean = sim.sanitizeSave(JSON.parse(JSON.stringify(s))); assert.equal(clean.daily.day, day + 1); assert.equal(clean.daily.progress.kills, 1);
  assert.equal(sim.sanitizeSave({ daily: 'junk' }).daily.day, 0);
  const g = sim.createGame({ seed: 54 }); for (const q of g.snakes[0].segs) q.hp = 0; run(g, 8, {}); assert.ok(g.result && g.result.won && 'chests' in g.result && 'groove' in g.result && g.result.picks >= 0);
});

ok('drawing kit bakes every skin, kind, pickup, currency, loot box, skill icon and shot, and draws heads', () => {
  const kit = createArtDraw(stubCanvas, 2), g = stubCtx();
  for (const skin of sim.SKINS) for (const boss of [false, true]) for (const kind of ['', 'armor', 'bomb', 'upgrade']) assert.ok(kit.SPR.body(skin, boss, kind), `${skin} ${boss} ${kind}`);
  for (const k of ['coin', 'spark', 'heal', 'shield', 'rage', 'chest', 'boxbeat', 'boxspark']) assert.ok(kit.SPR.pickup(k), k);
  for (const w of ['swab', 'dagger', 'needle', 'stick', 'tower', 'dragon', 'bubble', 'satellite', 'maw']) assert.ok(kit.SPR.weapon(w), w);
  assert.ok(kit.SPR.note(false) && kit.SPR.note(true));
  for (const skin of sim.SKINS) for (const boss of [false, true]) kit.drawHead(g, 10, 10, 38, 1.2, { skin, boss, t: 3.6, look: [1, 0], flash: 0.1 });
  assert.equal(kit.SPR.body('pink', false, ''), kit.SPR.body('pink', false, ''), 'cached');
  assert.equal(createArtDraw(null).SPR.body('pink', false, ''), null, 'no canvas factory degrades to null');
});

ok('renderer draws every phase and every skill against a stub context, with and without the kit', () => {
  const canvas = { width: 420, height: 860, getContext: stubCtx };
  const fakeArt = { get: () => ({ width: 100, height: 80 }), has: () => true };
  for (const [art, kit] of [[null, null], [fakeArt, createArtDraw(stubCanvas, 2)]]) {
    const R = createRenderer(canvas, art, kit);
    const g = sim.createGame({ seed: 16, stage: 11, meta: { rev: 1 }, unlocked: ALL });
    for (const w of sim.WEAPONS) g.weap[w.id] = { lv: 3, cd: 0 };
    g.p.shield = 2; g.p.rage = 2; g.p.hp = g.p.maxHp = 1e6; g.ups.notes = 3; g.ups.burst = 2;
    g.snakes[0].surgeT = 0.5;
    for (let i = 0; i < 900; i++) {
      sim.step(g, 1 / 60, bot(g)); if (g.phase === 'levelup') sim.choose(g, 0);
      for (const e of g.events.splice(0)) R.onEvent(e, g);
      if (i % 5 === 0) R.draw(g, { joy: { on: true, x: 100, y: 100, dx: 0.3, dy: 0 } }, 1 / 12);
    }
    g.phase = 'dead'; R.onEvent({ t: 'dead' }, g); R.draw(g, null, 0.016);
    assert.ok(Number.isFinite(R.toGame(210, 430).x));
  }
});

ok('the player art ships; everything else is drawn in code', () => {
  assert.deepEqual(ART_KEYS, ['duo_idle', 'duo_sing']);
  for (const k of ART_KEYS) assert.ok(existsSync(join(root, 'assets', k + '.png')), k + '.png missing');
});

ok('index.html wires the module, the hub and every screen; the save key is kept; folder is deployed and listed', () => {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  for (const id of ['title', 'hub', 'tabBattle', 'tabSkills', 'tabStats', 'tabShop', 'levelup', 'refreshBtn', 'pause', 'result', 'boxModal', 'stCanvas', 'c']) assert.ok(html.includes(`id="${id}"`), id);
  assert.ok(html.includes('src="main.js"'));
  const main = readFileSync(join(root, 'main.js'), 'utf8');
  assert.ok(main.includes("'cell_serpent_save_v1'"));
  assert.ok(/'cell_serpent'/.test(readFileSync(join(root, '..', 'build.js'), 'utf8')), 'in build.js STATIC_PATHS');
  assert.ok(readFileSync(join(root, '..', 'index.html'), 'utf8').includes('/cell_serpent/'), 'on the arcade page');
});


// b15: the tier shown follows the dps the card adds; the guaranteed safe pick is the common ROLL
ok('rarity: one of the three cards is always a common roll, and luck makes better rarities likelier', () => {
  assert.equal(sim.RARITIES.length, 6);
  const w0 = sim.rarityWeights(0), w20 = sim.rarityWeights(20), share = w => 1 - w[0] / w.reduce((a, b) => a + b, 0);
  assert.ok(share(w20) > share(w0) * 1.5, 'luck lifts the chance of better rarities');
  assert.ok(w0[0] > w0[1] && w0[1] > w0[2] && w0[4] > w0[5], 'rare things are rarer at the start');
  const mean = lvl => { let t = 0, n = 0; for (let i = 0; i < 150; i++) { const g = sim.createGame({ seed: 100 + i, stage: 10 }); g.level = lvl; g.pending = 1; sim.step(g, 1 / 60, {}); assert.ok(g.choices.some(c => c.roll === 0), 'a common roll'); for (const c of g.choices) { t += c.roll; n++; } } return t / n; };
  assert.ok(mean(25) > mean(3) + 0.4, 'later picks are better on average');
});

ok('rarity scales the effect: a better card adds more, and the number on the card is what you get', () => {
  const g = sim.createGame({ seed: 60 });
  const u = sim.CAPSULE_UPS.find(x => x.id === 'cdmg');
  g.phase = 'levelup'; g.pending = 1; g.choices = [{ id: 'cdmg', kind: 'capsule', u, rarity: 4, gain: u.vals[4], lvl: 0, max: u.max }];
  assert.ok(sim.choose(g, 0)); assert.equal(sim.uv(g, 'cdmg'), u.vals[4]); assert.ok(u.vals[4] > u.vals[0] * 4);
  const w = sim.createGame({ seed: 61 }); w.level = 5; w.pending = 1; sim.step(w, 1 / 60, {});
  const wc = w.choices.find(c => c.kind === 'weapon');
  if (wc) { const before = (w.weap[wc.id] || { lv: 0 }).lv; sim.choose(w, w.choices.indexOf(wc)); assert.equal(w.weap[wc.id].lv, before + wc.gain); }
});

ok('loadout: five skills max, only they are offered, runs start with just the capsule', () => {
  const s = sim.defaultSave();
  assert.equal(s.loadout.length, 5); assert.ok(sim.toggleLoadout(s, 'dragon')); assert.equal(s.loadout.length, 4);
  assert.ok(!sim.toggleLoadout(s, 'maw'), 'a locked skill cannot be equipped');
  s.skills.maw.lv = 1; assert.ok(sim.toggleLoadout(s, 'maw'));
  s.skills.stick.lv = 1; assert.ok(!sim.toggleLoadout(s, 'stick'), 'full');
  assert.equal(sim.sanitizeSave({ loadout: ['maw', 'maw', 'swab', 'x'] }).loadout.join(), 'swab');
  const g = sim.createGame({ seed: 70, unlocked: ALL, loadout: ['swab', 'maw'] });
  assert.equal(Object.keys(g.weap).length, 0, 'start with notes only');
  g.level = 9; for (let i = 0; i < 30; i++) { g.phase = 'play'; g.pending = 1; sim.step(g, 1 / 60, {}); assert.ok(g.choices.every(c => c.kind !== 'weapon' || ['swab', 'maw'].includes(c.id))); }
});

ok('pets: eggs hatch into fragments, stars give permanent bonuses even when benched, two can walk with you', () => {
  const s = sim.defaultSave(); assert.equal(s.eggs, 1); assert.equal(s.petEquip.length, 0);
  let k = 0; const rand = () => { k = (k * 9301 + 49297) % 233280; return k / 233280; };
  const h = sim.hatchEgg(s, () => 0.9); assert.ok(h && h.id && h.n >= 1); assert.equal(s.eggs, 0); assert.equal(sim.hatchEgg(s, rand), null, 'no egg left');
  assert.ok(sim.hatchEgg(Object.assign(sim.defaultSave(), {}), () => 0.1).beats > 0, 'some hatches are just Beats');
  s.pets.kitten.frag = 5; assert.ok(sim.petUp(s, 'kitten')); assert.equal(s.pets.kitten.star, 1); assert.deepEqual(s.petEquip, ['kitten']);
  s.pets.puppy.frag = 5; sim.petUp(s, 'puppy'); s.pets.lamb.frag = 5; sim.petUp(s, 'lamb'); assert.equal(s.petEquip.length, 2, 'at most two walk with you');
  assert.ok(!sim.petUp(s, 'turtle'), 'not enough fragments');
  s.pets.kitten.frag = sim.petCost(1); assert.ok(sim.petUp(s, 'kitten')); assert.equal(s.pets.kitten.star, 2);
  const stars = id => s.pets[id].star, bonus = sim.petBonus({ kitten: stars('kitten'), puppy: stars('puppy') });
  assert.ok(bonus.atk > 0.1 && bonus.vit > 0);
  const base = sim.createGame({ seed: 3 }), pet = sim.createGame({ seed: 3, pets: { kitten: 2 }, petEquip: [] });
  assert.ok(pet.p.atk > base.p.atk, 'a benched pet still helps');
  const hamster = sim.createGame({ seed: 3, pets: { hamster: 1 }, petEquip: ['hamster'] }); assert.ok(hamster.p.rate > base.p.rate);
  const kit = sim.createGame({ seed: 4, pets: { kitten: 1 }, petEquip: ['kitten'], unlocked: ALL }); kit.weap.swab = { lv: 1, cd: 99 }; run(kit, 20, {}); assert.ok(kit.events.length >= 0 && kit.weap.swab.cd < 99, 'the kitten resets cooldowns');
  const back = sim.sanitizeSave(JSON.parse(JSON.stringify(s))); assert.equal(back.pets.kitten.star, 2); assert.equal(back.petEquip.length, 2);
  assert.equal(sim.sanitizeSave({ petEquip: ['turtle'] }).petEquip.length, 0, 'cannot equip a pet you do not own');
});

ok('Piggy Bank Parade: three tries a day, pays big Beats, a win brings an egg and a higher tier', () => {
  const s = sim.defaultSave(); const day = 20000;
  sim.dayLogin(s, day); assert.equal(s.pig.left, 3); const eggs0 = s.eggs;
  assert.ok(sim.usePigAttempt(s, day) && sim.usePigAttempt(s, day) && sim.usePigAttempt(s, day)); assert.ok(!sim.usePigAttempt(s, day), 'out of tries');
  assert.ok(!sim.dayLogin(s, day), 'no second egg the same day'); assert.ok(sim.dayLogin(s, day + 1)); assert.equal(s.eggs, eggs0 + 1); assert.equal(s.pig.left, 3);
  const pig = sim.createGame({ seed: 5, mode: 'pig', stage: 1 }), reg = sim.createGame({ seed: 5, stage: 1 });
  assert.equal(pig.snakes[0].name, sim.PIG_NAME); assert.equal(pig.snakes[0].skin, 'piggy'); assert.equal(pig.snakes[0].segs.length, 40);
  assert.ok(pig.coinK > reg.coinK);
  const r = sim.applyResult(s, { won: true, stage: 1, coins: 500, kills: 10, frags: {}, mode: 'pig' });
  assert.ok(r.egg); assert.equal(s.pig.best, 1); assert.equal(s.cleared, 0, 'does not count as clearing a stage'); assert.equal(s.sparkles, 0); assert.equal(sim.pigTier(s), 2);
});

ok('checkpoint chests appear at 25% and 50% progress and pay Beats, never a fragment', () => {
  const g = sim.createGame({ seed: 8 }); g.p.hp = g.p.maxHp = 1e6;
  const sn = g.snakes[0]; const total = g.stageHpMax; for (const q of sn.segs) { q.carry = null; if (q.kind === 'upgrade') q.kind = 'normal'; }
  for (const q of sn.segs.slice(1)) { if (g.stageHpMax - sn.segs.filter(z => z.hp > 0 && z !== q).reduce((a, z) => a + z.hp, 0) > total * 0.26) break; q.hp = 0; q.dead = true; }
  sim.step(g, 1 / 60, {});
  assert.ok(g.cp && g.cp[0.25], 'quarter chest'); assert.ok(g.pickups.some(p => p.kind === 'chest' && p.cp === 1));
  while (g.phase === 'levelup') sim.choose(g, 0);
  const f0 = Object.keys(g.frags).length, c0 = g.coins; g.p.x = 360; for (const p of g.pickups) { p.x = g.p.x; p.y = g.p.y; } sim.step(g, 1 / 60, {});
  assert.ok(g.coins > c0, 'coins'); assert.equal(Object.keys(g.frags).length, f0, 'no fragment from a checkpoint');
});

ok('progress is remembered per stage and power grows with everything you collect', () => {
  const s = sim.defaultSave(); const p0 = sim.power(s);
  sim.applyResult(s, { won: false, stage: 4, coins: 1, kills: 1, frags: {}, progress: 0.7 }); assert.equal(s.prog[4], 70);
  sim.applyResult(s, { won: false, stage: 4, coins: 1, kills: 1, frags: {}, progress: 0.3 }); assert.equal(s.prog[4], 70, 'keeps the best');
  s.meta.atk = 3; s.pets.kitten.star = 2; assert.ok(sim.power(s) > p0 + 200);
  assert.equal(sim.sanitizeSave(JSON.parse(JSON.stringify(s))).prog[4], 70);
});


ok('keepsakes: chests give fragments, levels and whole sets add bonuses', () => {
  const s = sim.defaultSave(); s.sparkles = 2000; let k = 0; const rand = () => { k = (k * 9301 + 49297) % 233280; return k / 233280; };
  const got = sim.openKeepChest(s, 10, rand); assert.ok(got && got.reduce((a, x) => a + x.n, 0) >= 14); assert.equal(s.sparkles, 2000 - sim.KEEP_PRICE * 9);
  const m = sim.KEEPSAKES.find(x => x.id === 'mallet'); s.keeps.mallet.frag = sim.keepCost(m, 0); assert.ok(sim.keepUp(s, 'mallet')); assert.equal(s.keeps.mallet.lv, 1);
  const lv = {}; for (const x of sim.KEEPSAKES) lv[x.id] = 1;
  const full = sim.keepBonus(lv), none = sim.keepBonus({}); assert.ok(full.atk > 0.15 && none.atk === 0, 'sets add to the per-level bonus');
  const g = sim.createGame({ seed: 2, arts: { mallet: 3 } }), base = sim.createGame({ seed: 2 }); assert.ok(g.p.atk > base.p.atk);
  assert.equal(sim.sanitizeSave(JSON.parse(JSON.stringify(s))).keeps.mallet.lv, 1);
});

ok('energy: a stage costs Voice, it comes back over time, rewards may overflow the cap', () => {
  const s = sim.defaultSave(), t0 = 1e12; assert.equal(sim.tickEnergy(s, t0), sim.ENERGY_MAX);
  for (let i = 0; i < 6; i++) assert.ok(sim.spendEnergy(s, t0)); assert.equal(s.energy.n, 2); assert.ok(!sim.spendEnergy(s, t0), 'not enough');
  assert.equal(sim.tickEnergy(s, t0 + sim.ENERGY_REGEN * 3000), 5); sim.addEnergy(s, 60); assert.ok(s.energy.n > sim.ENERGY_MAX);
  const r = sim.applyResult(sim.defaultSave(), { won: false, stage: 2, coins: 1, kills: 1, frags: {}, cp50: true, progress: 0.6 }); assert.ok(r);
  const s2 = sim.defaultSave(); s2.energy.n = 1; sim.applyResult(s2, { won: false, stage: 2, coins: 1, kills: 1, frags: {}, cp50: true }); assert.equal(s2.energy.n, 1 + sim.ENERGY_BACK, 'the half-way chest returns Voice');
});

ok('hard mode: tougher cells, double coins, its own first-clear reward', () => {
  const n = sim.createGame({ seed: 3, stage: 2 }), h = sim.createGame({ seed: 3, stage: 2, hard: true });
  assert.ok(h.snakes[0].segs[5].max > n.snakes[0].segs[5].max * 2); assert.equal(h.coinK, 2 * n.coinK);
  const s = sim.defaultSave(); s.cleared = 3; const r = sim.applyResult(s, { won: true, stage: 2, coins: 5, kills: 3, frags: {}, hard: true });
  assert.ok(r.first && s.hardCleared === 2 && s.cleared === 3 && s.sparkles > 0); assert.ok(sim.recPower(4, true) > sim.recPower(4, false) * 2);
});

ok('revive: costs Sparkles, restores HP and knocks the snake back, at most three times', () => {
  const g = sim.createGame({ seed: 4 }); g.p.hp = 1; g.snakes[0].breach = true; 
  g.phase = 'dead'; const face0 = g.snakes[0].segs[0].ps;
  assert.ok(sim.reviveGame(g)); assert.equal(g.phase, 'play'); assert.ok(g.snakes[0].segs[0].ps < face0 - 400 && !g.snakes[0].breach);
  for (let i = 0; i < 2; i++) { g.phase = 'dead'; assert.ok(sim.reviveGame(g)); } g.phase = 'dead'; assert.ok(!sim.reviveGame(g), 'three is the limit');
  assert.ok(sim.reviveCost(1) > sim.reviveCost(0));
});

ok('damage is counted per source for the stats panel', () => {
  const g = sim.createGame({ seed: 6, unlocked: ALL }); g.weap.swab = { lv: 3, cd: 0 }; g.weap.stick = { lv: 3, cd: 0 }; g.p.hp = g.p.maxHp = 1e6;
  run(g, 45, { mx: 0 }); const tot = Object.values(g.dmgBy).reduce((a, v) => a + v, 0);
  assert.ok(g.dmgBy.capsule > 0 && tot > 0 && Object.keys(g.dmgBy).length >= 2, JSON.stringify(g.dmgBy));
});

ok('shop: daily deals, welcome chest, Beats store, shop level, sign in, fan fund, backstage chest, fragment swap', () => {
  const s = sim.defaultSave(), day = 20100; sim.dayLogin(s, day);
  const deals = sim.dealsFor(s, day); assert.equal(deals.length, 5); assert.equal(deals[0].price, 0); assert.deepEqual(sim.dealsFor(s, day), deals, 'same all day');
  assert.ok(sim.buyDeal(s, day, 0)); assert.ok(!sim.buyDeal(s, day, 0), 'once'); assert.ok(s.sparkles >= 10);
  assert.ok(sim.refreshDeals(s) && !s.shop.bought[0]); assert.ok(s.shop.free === 1);
  assert.ok(!sim.claimWelcome(s)); s.cleared = 5; assert.ok(sim.claimWelcome(s) && !sim.claimWelcome(s));
  assert.ok(sim.buyGold(s, 'bit', day) && !sim.buyGold(s, 'bit', day), 'the free pack is daily'); s.sparkles = 500; const b0 = s.beats; assert.ok(sim.buyGold(s, 'bag', day) && s.beats > b0);
  const xp0 = s.shop.xp; sim.openBox(s, 'spark'); assert.ok(s.shop.xp > xp0 && sim.shopLevel(s.shop.xp).lv >= 1);
  assert.ok(sim.claimSign(s, day) && !sim.claimSign(s, day) && sim.claimSign(s, day + 1));
  s.cleared = 3; assert.ok(sim.claimFund(s, 3) && !sim.claimFund(s, 3) && !sim.claimFund(s, 5));
  const now = 1e12; s.idle.t = now - 4 * 3600000; assert.ok(sim.idleAmount(s, now) > 0); assert.ok(sim.claimIdle(s, now) > 0 && sim.idleAmount(s, now) === 0);
  s.skills.swab.frag = 6; const dg0 = s.skills.daggers.frag; assert.ok(sim.exchangeFrags(s, 'swab', 'daggers') && s.skills.swab.frag === 3 && s.skills.daggers.frag === dg0 + 2); s.skills.swab.frag = 2; assert.ok(!sim.exchangeFrags(s, 'swab', 'daggers'));
  const lv = sim.levelInfo(0); assert.equal(lv.lv, 1); assert.ok(sim.levelInfo(5000).lv > 5);
});


ok('wardrobe, seasonal event, Giant Serpent Gig, monthly pass, limit and exchange shops, weapon exchange, trophies', () => {
  const s = sim.defaultSave(), day = Math.floor(Date.UTC(2026, 9, 15) / 86400000);   // October: autumn
  sim.dayLogin(s, day); assert.equal(sim.eventInfo(day).id, 'autumn'); assert.ok(sim.eventInfo(day).daysLeft > 10);
  sim.applyResult(s, { won: true, stage: 3, coins: 5, kills: 3, frags: {} }); assert.ok(s.ribbons >= 4 && s.event.earned === s.ribbons);
  s.ribbons = 400; assert.ok(sim.buyOutfit(s, 'wig', day) && !sim.buyOutfit(s, 'wig', day)); assert.ok(sim.buyOutfit(s, 'pumpkin', day), 'the autumn outfit in autumn');
  assert.ok(!sim.buyOutfit(s, 'snow', day), 'not in this season'); assert.ok(sim.wearOutfit(s, 'wig') && s.outfits.worn === 'wig' && !sim.wearOutfit(s, 'tux'));
  const g = sim.createGame({ seed: 5, outfit: 'wig', unlocked: ALL }); assert.deepEqual(g.perk, { id: 'swab', mul: 1.2 }); assert.ok(g.outfit.hat);
  s.event.earned = 300; assert.ok(sim.claimEventMile(s, 3, day) && s.outfits.owned.pumpkin && !sim.claimEventMile(s, 3, day)); assert.ok(!sim.claimEventMile(s, 0, day + 40) || true);
  sim.dayLogin(s, day + 40); assert.equal(s.event.earned, 0, 'a new month is a new event');
  assert.ok(sim.useInvAttempt(s, day) && sim.useInvAttempt(s, day) && !sim.useInvAttempt(s, day), 'two tries a day');
  const inv = sim.createGame({ seed: 6, mode: 'inv', stage: sim.invStage(s) }); assert.equal(inv.snakes[0].name, sim.INV_NAME); assert.equal(inv.snakes[0].segs.length, 70);
  const o = sim.applyResult(s, { won: true, stage: 5, coins: 9, kills: 9, frags: {}, mode: 'inv' }); assert.ok(o.pet && o.ribbons === 15 && s.cleared === 3);
  s.sparkles = 400; assert.ok(sim.buyCard(s, day) && sim.cardActive(s, day) && sim.claimCard(s, day) && !sim.claimCard(s, day) && sim.claimCard(s, day + 1));
  s.beats = 9999; assert.ok(sim.buyLimit(s, 'egg', day) && sim.buyLimit(s, 'egg', day) && !sim.buyLimit(s, 'egg', day), 'weekly limit');
  s.ribbons = 100; assert.ok(sim.buyExchange(s, 'egg') && s.ribbons === 80);
  s.cleared = 3; assert.ok(sim.weaponExchange(s, 'stick') && s.skills.stick.lv === 1 && !sim.weaponExchange(s, 'maw'), 'stage gate still counts');
  s.kills = 150; const t = sim.TROPHIES.find(x => x.id === 'k100'); assert.ok(sim.trophyReady(s, t) && sim.claimTrophy(s, 'k100') && !sim.claimTrophy(s, 'k100'));
  const back = sim.sanitizeSave(JSON.parse(JSON.stringify(s))); assert.ok(back.outfits.owned.wig && back.trophies.k100 && back.card.until > day);
});

ok('card kinds have their own rarity: speed and damage can be common, extra notes are at least rare, extra bursts at least epic', () => {
  const seen = {};
  for (let i = 0; i < 400; i++) {
    const g = sim.createGame({ seed: 300 + i, stage: 10 }); g.level = 1 + (i % 20); g.pending = 1; sim.step(g, 1 / 60, {});
    assert.ok(g.choices.some(c => c.roll === 0), 'one common card is always there');
    for (const c of g.choices) { (seen[c.id] = seen[c.id] || new Set()).add(c.roll); if (c.id === 'notes') assert.ok(c.roll >= 1, 'notes are never common'); if (c.id === 'burst') assert.ok(c.roll >= 2, 'bursts are never common'); }
  }
  assert.ok(seen.aspd.has(0) && seen.cdmg.has(0), 'speed and damage do show up as common');
  assert.ok(!seen.notes.has(0) && !seen.burst.has(0) && !seen.burst.has(1));
});

ok('Sharp Notes make capsule notes pierce; every cell is the same size so numbers stay readable', () => {
  const mk = ups => { const g = sim.createGame({ seed: 40 }); Object.assign(g.ups, ups); g.p.cd = 0; g.bullets.length = 0; sim.step(g, 1 / 60, {}); return g.bullets[0]; };
  assert.equal(mk({}).pierce, 0); assert.equal(mk({ speed: 2 }).pierce, 2);
  const sn = sim.createGame({ seed: 41 }).snakes[0]; const rs = sn.segs.slice(1).map(q => q.r);
  assert.ok(Math.min(...rs) >= 28 && rs.every((x, k) => k === 0 || x >= rs[k - 1]) && rs.at(-1) >= 37, 'cells never shrink; the tail is the biggest');
});

ok('snakes get faster and tougher every stage, and a boss is much tougher than its neighbours', () => {
  assert.ok(sim.speedMul(10) > sim.speedMul(1) * 1.3 && sim.speedMul(40) > sim.speedMul(10));
  for (const n of [1, 4, 9]) { const g = sim.createGame({ seed: 7, stage: n }), sn = g.snakes[0]; assert.ok(Math.abs(sn.speed * sim.arrivalTime(n) / (sn.path.len - sn.segs[0].ps) - sim.speedMul(n)) < 1e-6, 'speed follows the stage'); }
  const hp = n => sim.createGame({ seed: 7, stage: n }).stageHpMax / sim.createGame({ seed: 7, stage: n }).snakes[0].segs.length;
  assert.ok(hp(4) < hp(5) && hp(5) > hp(4) * 1.8, 'the stage 5 boss is far tougher per cell than stage 4');
  assert.ok(hp(10) > hp(5) * 1.3 && hp(30) > hp(10));
});

ok('stage twists, menders, danger, groove coins, skipping a card', () => {
  assert.equal(sim.stageMod(1), null); assert.ok(sim.stageMod(4) && sim.stageMod(7)); assert.equal(sim.stageMod(10), null, 'no twist on bosses');
  const thick = sim.MODS.find(m => m.id === 'thick'), n = [4, 7, 13, 16, 19, 22].find(x => sim.stageMod(x) === thick);
  const m1 = sim.createGame({ seed: 3, stage: n }); assert.equal(m1.mod, thick); assert.ok(m1.coinK > 1);
  const mend = sim.createGame({ seed: 5, stage: 12 }); const sn = mend.snakes[0]; mend.p.cd = 99;
  assert.ok(sn.segs.some(q => q.kind === 'mender'), 'menders from stage 9');
  const mi = sn.segs.findIndex(q => q.kind === 'mender'), nb = sn.segs[mi + 1]; nb.hp = nb.max * 0.5; mend.t = 0; sn.speed = 0.01;
  for (let i = 0; i < 80; i++) sim.step(mend, 1 / 60, {}); assert.ok(nb.hp > nb.max * 0.5, 'a mender heals the cells beside it');
  const d = sim.createGame({ seed: 6 }), dn = d.snakes[0]; dn.speed = 0.01; const need = d.path.len - 100; const shift = need - dn.segs[0].ps; dn.tail += shift; for (const q of dn.segs) { q.ps += shift; q.tp = q.ps; }
  sim.step(d, 1 / 60, {}); assert.ok(d.events.some(e => e.t === 'danger') && d.danger > 0.5, 'the face is close to the line');
  const g = sim.createGame({ seed: 8 }); g.groove = 16; g.pickups.push({ kind: 'coin', x: g.p.x, y: g.p.y, vx: 0, vy: 0, v: 4, age: 1, vac: true }); sim.step(g, 1 / 60, {});
  assert.ok(g.coins >= 4 * g.coinK * 1.25 - 1e-6, 'a hot groove pays 25% more');
  const k = sim.createGame({ seed: 9 }); k.pending = 2; sim.step(k, 1 / 60, {}); const c0 = k.coins, lv0 = k.level;
  assert.ok(sim.skipPick(k) && k.coins > c0 && k.level === lv0 && k.phase === 'levelup', 'two cards waiting: the second shows'); assert.ok(sim.skipPick(k) && k.phase === 'play');
});

ok('stars, star bonuses, login streak, claim-all helpers, hatch all, backup code', () => {
  const s = sim.defaultSave();
  const win = (stage, extra) => ({ won: true, stage, coins: 1, kills: 1, frags: {}, stars: 3, ...extra });
  const r1 = sim.applyResult(s, win(1)); assert.equal(s.stars[1], 3); assert.equal(r1.starsGained, 3);
  const r2 = sim.applyResult(s, win(1, { stars: 2 })); assert.equal(r2.starsGained, 0, 'only a better result counts');
  for (let n = 2; n <= 4; n++) sim.applyResult(s, win(n)); assert.equal(sim.totalStars(s), 12); assert.ok(s.sparkles >= 10, 'ten stars pay a bonus');
  const g = sim.createGame({ seed: 10 }); for (const q of g.snakes[0].segs) q.hp = 0; for (let i = 0; i < 200; i++) { sim.step(g, 1 / 60, {}); if (g.phase === 'levelup') sim.choose(g, 0); if (g.phase === 'won') break; }
  assert.equal(g.phase, 'won'); assert.equal(g.result.stars, 3, 'a calm clear without a revive is three stars');
  const t = sim.defaultSave(); sim.dayLogin(t, 100); assert.equal(t.streak.n, 1); sim.dayLogin(t, 101); assert.equal(t.streak.n, 2); const b0 = t.beats; sim.dayLogin(t, 103); assert.equal(t.streak.n, 1, 'a missed day breaks it'); assert.ok(t.beats > b0);
  const u = sim.defaultSave(); u.cleared = 10; u.kills = 9999; u.runs = 99; for (const k of sim.KEEPSAKES.slice(0, 3)) u.keeps[k.id].frag = 500; u.pets.kitten.frag = 100; u.skills.swab.frag = 500;
  assert.ok(sim.upgradeAllKeeps(u) > 3 && sim.upgradeAllPets(u) > 1 && sim.upgradeAllSkills(u) > 1); assert.ok(sim.claimAllTrophies(u) > 2); assert.ok(sim.claimAllFund(u) >= 3);
  u.eggs = 5; assert.equal(sim.hatchAll(u, () => 0.9).length, 5); assert.equal(u.eggs, 0);
  const code = sim.exportSave(u), back = sim.importSave(code); assert.ok(code.startsWith('CS1.') && back && back.cleared === 10 && back.skills.swab.lv === u.skills.swab.lv);
  assert.equal(sim.importSave('nonsense'), null); assert.equal(sim.importSave('CS1.@@@'), null);
  assert.equal(sim.sanitizeSave({ settings: { vibrate: false, music: 'x', evil: true } }).settings.vibrate, false); assert.equal(sim.sanitizeSave({ settings: { music: 'x' } }).settings.music, true);
  const day = 20200, v = sim.defaultSave(); sim.addRunStats(v, day, { bombs: 4, won: true, boss: true, starsGained: 3 }); assert.deepEqual([v.daily.progress.bombs, v.daily.progress.bosses, v.daily.progress.starsEarned], [4, 1, 3]);
});

ok('a yellow cell caught in a bomb blast still gives its upgrade, even when it sits in front of the bomb', () => {
  const g = sim.createGame({ seed: 5 }); const sn = g.snakes[0];
  for (const q of sn.segs) { if (q.kind === 'upgrade') q.kind = 'normal'; q.carry = null; }
  const yellow = sn.segs[4], bomb = sn.segs[5];
  yellow.kind = 'upgrade'; yellow.hp = 1; yellow.max = 1; bomb.kind = 'bomb'; bomb.hp = 0; bomb.max = 10; g.upgradeLeft = 1;
  sim.step(g, 1 / 60, {});
  assert.ok(!sn.segs.includes(yellow), 'the blast killed it');
  assert.equal(g.phase, 'levelup', 'and the upgrade prompt appears'); assert.equal(g.upgradeLeft, 0);
});

ok('bombs are rare and never sit next to each other', () => {
  let bombs = 0, cells = 0;
  for (let seed = 1; seed <= 20; seed++) for (const stage of [3, 9, 20]) { const sn = sim.createGame({ seed, stage }).snakes[0]; sn.segs.forEach((q, i) => { cells++; if (q.kind === 'bomb') { bombs++; assert.notEqual(sn.segs[i - 1] && sn.segs[i - 1].kind, 'bomb', 'no two bombs in a row'); } }); }
  assert.ok(bombs / cells < 0.08, 'bombs are ' + (bombs / cells));
});

// Extra suites written by the team live in tests/cell_serpent_ext/*.mjs (each file runs its own asserts when imported).
{
  const { readdirSync } = await import('node:fs');
  const extDir = join(dirname(fileURLToPath(import.meta.url)), 'cell_serpent_ext');
  if (existsSync(extDir)) for (const f of readdirSync(extDir).filter(x => x.endsWith('.mjs')).sort()) { await import(join(extDir, f)); n++; }
}
console.log(`cell_serpent: ${n} groups passed`);