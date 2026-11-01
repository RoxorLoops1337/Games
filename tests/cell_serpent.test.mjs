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
const bringNear = (g, dy = 100, idx = 3) => {
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

ok('every stage has its own lane shape; all lanes run from above the screen down past the membrane', () => {
  assert.equal(sim.PATH_KINDS.length, 6);
  const sigs = new Set();
  for (let s = 1; s <= 6; s++) {
    const p = sim.buildPath(s);
    assert.ok(p.pts[0].y < 0 && p.pts.at(-1).y > LINE_Y, 'stage ' + s);
    assert.ok(p.len > H, 'the lane winds, so it is longer than the screen');
    assert.ok(p.pts.every(q => q.x > -50 && q.x < W + 50), 'stays on screen');
    sigs.add(sim.PATH_KINDS[sim.pathKind(s)] + ':' + Math.round(p.len / 10));
  }
  assert.equal(sigs.size, 6);
  const a = sim.buildPath(1), b = sim.buildPath(2); assert.notEqual(Math.round(a.len), Math.round(b.len));
  assert.ok(sim.pointAt(a, -50).y < sim.pointAt(a, 0).y && sim.pointAt(a, 900).y > sim.pointAt(a, 100).y);
});

ok('stages: names, five skins, boss every 5th, longer snakes and more HP per cell as you go', () => {
  assert.ok(!sim.isBossStage(4) && sim.isBossStage(5) && sim.isBossStage(10));
  assert.equal(sim.virusName(1), 'Love-Struck Virus'); assert.equal(new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(sim.skinFor)).size, 10, 'ten different species');
  assert.ok(sim.snakeLength(1) >= 12 && sim.snakeLength(10) > sim.snakeLength(1) && sim.snakeLength(5) > sim.snakeLength(4));
  assert.ok(sim.hpBase(1) >= 100, 'numbers are big');
  assert.ok(sim.hpBase(10) > sim.hpBase(1) * 1.5);
  const info = sim.stageInfo(7); assert.ok(info.name && info.skin && info.path && info.length > 12);
  assert.ok(sim.createGame({ seed: 3, stage: 5 }).snakes[0].boss);
});

ok('only the snake: no small viruses, no enemy shots, no falling things', () => {
  const g = sim.createGame({ seed: 2, stage: 6 });
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
  for (const q of g.snakes[0].segs) if (q.kind === 'normal' && q.i > 0) { const shots = q.max / capsule; assert.ok(shots >= 10 && shots <= 20, `cell needs ${shots} shots`); }
  assert.ok(g.p.rate <= 2.2);
  for (const first of [0, 1]) {   // the first two picks only ever offer capsule upgrades
    g.pending = 1; sim.step(g, 1 / 60, {});
    assert.equal(g.phase, 'levelup'); assert.ok(g.choices.every(c => c.kind === 'capsule'), 'pick ' + first);
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
  assert.ok(shots({ aspd: 4 }) > shots({}) * 1.4);
  const dm = ups => { const g = sim.createGame({ seed: 42 }); Object.assign(g.ups, ups); g.p.crit = 0; g.p.cd = 0; sim.step(g, 1 / 60, {}); return g.bullets[0].dmg; };
  assert.ok(dm({ cdmg: 3 }) > dm({}) * 1.8);
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
  bringNear(g, 120); g.p.hp = g.p.maxHp = 1e6; g.p.iframes = 1e6;
  run(g, 4, {});
  assert.equal(face.hp, 1, 'shots and skills pass through the face'); assert.ok(face.shield);
  for (const q of sn.segs.slice(1)) q.hp = 0;
  sim.step(g, 1 / 60, {});
  assert.equal(g.snakes.length, 0, 'the face pops once it is alone');
  assert.ok(g.events.some(e => e.t === 'kill' && e.head) && ['clear', 'levelup'].includes(g.phase));
});

ok('if the face reaches the membrane it drains HP until you finish the cells; each kill pushes it back', () => {
  const g = sim.createGame({ seed: 5 });
  const sn = g.snakes[0], face = sn.segs[0];
  g.p.iframes = 5; const hp0 = g.p.hp;
  sn.tail = 1e9; sim.step(g, 1 / 60, {});
  assert.ok(sn.breach && g.p.hp < hp0 && g.events.some(e => e.t === 'leak'));
  assert.ok(face.ps <= g.path.len + 0.01, 'the face stops at the membrane');
  const hp1 = g.p.hp; sn.speed = 0.01; run(g, 1.1, {}); assert.ok(g.p.hp < hp1 - 4, 'keeps draining');
  const before = face.ps; for (const q of sn.segs.slice(1, 4)) q.hp = 0; run(g, 1, {});
  assert.ok(face.ps < before - 80, 'killing cells pushes the face back off the membrane');
  assert.ok(LINE_Y === 1190 && ROW_Y < LINE_Y);
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
  const g = sim.createGame({ seed: 5 });
  const card = () => g.choices.find(c => c.id === 'notes');
  const pickNotes = () => { g.phase = 'play'; g.pending = 1; sim.step(g, 1 / 60, {}); for (let k = 0; k < 40 && !card(); k++) { g.rerolls = 4; sim.reroll(g); } const i = g.choices.indexOf(card()); assert.ok(i >= 0); return sim.choose(g, i); };
  const volley = () => { g.bullets.length = 0; g.vq.length = 0; g.p.cd = 0; g.p.crit = 0; sim.step(g, 1 / 60, {}); sim.step(g, 0.05, {}); return g.bullets; };
  assert.equal(volley().length, 1);
  g.phase = 'play'; g.pending = 1; sim.step(g, 1 / 60, {}); for (let k = 0; k < 40 && !card(); k++) { g.rerolls = 4; sim.reroll(g); }
  assert.match(card().stat, /Notes per shot: 1 → 2/); sim.choose(g, g.choices.indexOf(card()));
  const two = volley(); assert.equal(two.length, 2); assert.ok(Math.abs(two[0].x - two[1].x) >= 40, 'visibly apart'); assert.ok(two.every(b => b.dmg === 10 * g.p.atk));
  assert.ok(pickNotes()); g.phase = 'play';
  const three = volley(); assert.equal(three.length, 3); assert.equal(g.ups.notes, 2);
  assert.equal(new Set(three.map(b => Math.round(b.x))).size, 3);
});

ok('skill picks: 3 distinct choices; locked skills never appear; maxed ones stop; at most six skills; every passive applies', () => {
  const g = sim.createGame({ seed: 13 });
  g.level = 5; g.pending = 1; sim.step(g, 1 / 60, {});
  assert.equal(g.choices.length, 3); assert.equal(new Set(g.choices.map(c => c.id)).size, 3);
  for (let i = 0; i < 40; i++) { g.phase = 'play'; g.pending = 1; sim.step(g, 1 / 60, {}); assert.ok(g.choices.every(c => !['needles', 'stick', 'bubble', 'satellite', 'maw'].includes(c.id)), 'locked'); sim.choose(g, 0); }
  const h = sim.createGame({ seed: 14, skills: { needles: 1, stick: 1, bubble: 1, satellite: 1, maw: 1 } }); h.level = 9;
  for (const w of sim.WEAPONS.slice(0, 6)) h.weap[w.id] = { lv: w.id === 'swab' ? 5 : 2, cd: 0 };
  for (let i = 0; i < 40; i++) { h.phase = 'play'; h.pending = 1; sim.step(h, 1 / 60, {}); assert.ok(h.choices.every(c => c.id !== 'swab' && (c.kind !== 'weapon' || h.weap[c.id]))); sim.choose(h, 0); }
  const p = sim.createGame({ seed: 15 });
  for (const u of sim.PASSIVES) {
    for (let k = 0; k < u.max + 2; k++) { p.phase = 'levelup'; p.pending = 1; p.choices = [{ id: u.id, kind: 'passive', lvl: p.ups[u.id] || 0, max: u.max }]; if (k < u.max) sim.choose(p, 0); }
    assert.equal(p.ups[u.id], u.max, u.id);
  }
  assert.ok(p.p.maxHp > 100 && p.p.speed > 300 && p.p.crit > 0.3 && p.p.guard > 0.5);
});

ok('every skill works at every level and hurts the virus; a permanent skill level makes it hit harder', () => {
  for (const w of sim.WEAPONS) for (const L of [1, 3, 5]) {
    const g = sim.createGame({ seed: 20 + L, unlocked: ALL, stage: 6 });
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
  const hp0 = g.p.hp;
  sim.step(g, 1 / 60, {});
  assert.ok(g.events.some(e => e.t === 'boom'));
  assert.ok(g.snakes.every(x => x.segs.every(q => q.i !== 5 && q.i !== 6)), 'neighbours died in the blast');
  assert.ok(g.p.hp <= hp0);
});

ok('contact hurts and grants i-frames; dying ends the run; Second Wind revives once; shield, heal and rage work', () => {
  const g = sim.createGame({ seed: 16 });
  g.snakes[0].speed = 0.01; const hd = g.snakes[0].segs[0]; g.p.zone = { x0: -500, x1: 2000 }; g.p.x = hd.x;
  const hp0 = g.p.hp; hd.y = g.p.y; sim.step(g, 1 / 60, {});
  g.p.y = ROW_Y;
  const d = sim.createGame({ seed: 17 }); d.p.hp = 1; d.snakes[0].tail = 1e9; sim.step(d, 1 / 60, {});
  assert.equal(d.phase, 'dead'); assert.ok(d.result && d.result.won === false && d.result.stage === 1 && d.result.name);
  const t = d.t; sim.step(d, 1 / 60, {}); assert.equal(d.t, t);
  const r = sim.createGame({ seed: 17, meta: { rev: 1 } }); r.p.hp = 1; r.snakes[0].tail = 1e9; sim.step(r, 1 / 60, {});
  assert.equal(r.phase, 'play'); assert.ok(r.events.some(e => e.t === 'revive'));
  const s = sim.createGame({ seed: 18 }); s.p.shield = 3; s.snakes[0].tail = 1e9; sim.step(s, 1 / 60, {}); assert.equal(s.p.hp, s.p.maxHp);
  s.p.shield = 0; s.p.hp = 10; s.pickups.push({ kind: 'heal', x: s.p.x, y: s.p.y, vx: 0, vy: 0, v: 1, age: 1, vac: true }, { kind: 'rage', x: s.p.x, y: s.p.y, vx: 0, vy: 0, v: 1, age: 1, vac: true });
  sim.step(s, 1 / 60, {}); assert.ok(s.p.hp > 10 && s.p.rage > 0);
  assert.ok(hp0 > 0);
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
  for (let i = 0; i < 50; i++) sim.buyMeta(s, 'atk'); assert.equal(s.meta.atk, sim.META[0].max);
  // skills: the first four are owned, the rest need fragments
  assert.ok(sim.WEAPON_STARTERS.every(id => s.skills[id].lv === 1) && s.skills.maw.lv === 0);
  assert.ok(!sim.unlockSkill(s, 'maw'), 'not enough fragments');
  s.skills.maw.frag = 70; assert.ok(sim.unlockSkill(s, 'maw')); assert.equal(s.skills.maw.lv, 1); assert.equal(s.skills.maw.frag, 10);
  assert.ok(!sim.levelSkill(s, 'swab'), 'no fragments yet');
  s.skills.swab.frag = 5; const b0 = s.beats; assert.ok(sim.levelSkill(s, 'swab')); assert.equal(s.skills.swab.lv, 2); assert.equal(s.skills.swab.frag, 0); assert.ok(s.beats < b0);
  assert.ok(sim.skillMul(5) > sim.skillMul(1) * 1.4);
  // boxes
  let k = 0; const rand = () => { k = (k * 9301 + 49297) % 233280; return k / 233280; };
  const before = Object.values(s.skills).reduce((a, x) => a + x.frag, 0), bb = s.beats;
  const got = sim.openBox(s, 'beat', rand); assert.ok(got && got.reduce((a, x) => a + x.n, 0) === 5); assert.equal(s.beats, bb - 150);
  const sp = s.sparkles, big = sim.openBox(s, 'spark', rand); assert.equal(big.reduce((a, x) => a + x.n, 0), 15); assert.ok(big[0].n >= 8, 'one featured skill'); assert.equal(s.sparkles, sp - 30);
  assert.equal(Object.values(s.skills).reduce((a, x) => a + x.frag, 0), before + 20);
  const poor = sim.defaultSave(); assert.equal(sim.openBox(poor, 'beat'), null); assert.equal(poor.skills.swab.frag, 0);
});

ok('save: sanitising, migration from the old coins save, defaults', () => {
  const bad = sim.sanitizeSave({ beats: -5, sparkles: 'x', cleared: 3, meta: { atk: 999, nope: 4 }, skills: { maw: { lv: 99, frag: 7 }, nope: { lv: 1 } }, muted: 1 });
  assert.equal(bad.beats, 0); assert.equal(bad.sparkles, 0); assert.equal(bad.cleared, 3); assert.equal(bad.meta.atk, sim.META[0].max); assert.equal(bad.skills.maw.lv, sim.SKILL_MAX_LV); assert.equal(bad.skills.maw.frag, 7); assert.ok(!('nope' in bad.skills));
  assert.equal(sim.sanitizeSave({ coins: 123, best: 4 }).beats, 123, 'old saves keep their coins as Beats');
  assert.equal(sim.sanitizeSave(null).beats, 0);
  assert.ok(sim.sanitizeSave({ skills: { swab: { lv: 0 } } }).skills.swab.lv >= 1, 'starter skills can never be locked');
  const p = sim.makePlayer({ atk: 5, crt: 5, cdn: 5, vit: 2 });
  assert.ok(p.atk > 1.3 && p.crit > 0.1 && p.cdBase < 0.8 && p.maxHp === 124);
});

ok('bot plays full runs: bounded entities, finite numbers, and clears an early stage with a little shop progress', () => {
  let wins = 0;
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const g = sim.createGame({ seed, stage: 2, meta: { atk: 3, vit: 2, cdn: 1 } });
    for (let i = 0; i < 60 * 240 && g.phase !== 'dead' && g.phase !== 'won'; i++) {
      sim.step(g, 1 / 60, bot(g)); if (g.phase === 'levelup') sim.choose(g, Math.floor(g.rand() * g.choices.length));
      assert.ok(g.bullets.length < 600 && g.pickups.length < 700 && g.zones.length < 20);
      assert.ok(Number.isFinite(g.p.x) && g.p.x >= 0 && g.p.x <= W && g.p.y === ROW_Y && Number.isFinite(g.p.hp));
    }
    if (g.phase === 'won') wins++;
    for (const sn of g.snakes) for (const q of sn.segs) assert.ok(Number.isFinite(q.x) && Number.isFinite(q.y) && q.hp > 0);
  }
  assert.ok(wins >= 3, 'wins ' + wins);
});

ok('groove: every note that lands builds it (+2% damage per point), a pause in the hits lets it fade', () => {
  const g = sim.createGame({ seed: 50 });
  assert.equal(g.groove, 0); assert.equal(sim.GROOVE_MAX, 20);
  const sn = g.snakes[0]; sn.speed = 0.01; bringNear(g, 120); g.p.hp = g.p.maxHp = 1e9; g.p.iframes = 1e9;
  const dmgNow = () => { g.bullets.length = 0; g.vq.length = 0; g.p.cd = 0; g.p.crit = 0; const x = g.p.x; sim.step(g, 1 / 60, {}); g.p.x = x; return g.bullets[0].dmg; };
  const d0 = dmgNow();
  run(g, 6, {}); assert.ok(g.groove >= 3, 'hits build groove: ' + g.groove); assert.ok(g.grooveMax >= g.groove);
  assert.ok(dmgNow() > d0, 'groove raises damage'); assert.ok(g.groove <= sim.GROOVE_MAX);
  g.groove = 12; g.bullets.length = 0; g.p.cd = 99; g.p.x = 20;   // nothing above you any more
  run(g, 4, {}); assert.ok(g.groove < 12, 'it fades when the hits stop: ' + g.groove);
  const h = sim.createGame({ seed: 51 }); h.snakes[0].speed = 0.01; bringNear(h, 120); sim.step(h, 1 / 60, {}); h.groove = 4; h.events.length = 0;
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
  bringNear(g, 120); const cell = sn.segs[5]; const hp0 = cell.hp; g.bullets.push({ x: cell.x, y: cell.y, vx: 0, vy: -1, dmg: 500, crit: false, pierce: 0, r: 6, life: 1, hit: [], kind: 'pill', home: 0, splash: 0, slow: 0 });
  const waveOn = (t) => { for (let i = 0; i < 60 * 8; i++) { sim.step(g, 1 / 60, {}); if (sn.segs[5] && sn.segs[5].wave) return true; } return false; };
  assert.ok(waveOn(), 'the wave reaches cell 5');
  { const c5 = sn.segs[5]; g.bullets.length = 0; g.bullets.push({ x: c5.x, y: c5.y, vx: 0, vy: -1, dmg: 500, crit: false, pierce: 0, r: 6, life: 1, hit: [], kind: 'pill', home: 0, splash: 0, slow: 0 }); const hpIn = c5.hp; sim.step(g, 1 / 60, {}); assert.equal(c5.hp, hpIn, 'a shielded cell takes no damage'); }
  const plain = sim.createGame({ seed: 53, stage: 4 }); run(plain, 8, {}); assert.ok(plain.snakes[0].segs.every(q => !q.wave));
  assert.ok(hp0 > 0 && shielded);
});

ok('skills are music gear with stable save ids; no medical leftovers', () => {
  assert.deepEqual(sim.WEAPONS.map(w => w.id), ['swab', 'daggers', 'tower', 'dragon', 'needles', 'stick', 'bubble', 'satellite', 'maw']);
  assert.deepEqual(sim.WEAPONS.map(w => w.name), ['Beat Pad', 'Spinning Vinyl', 'Speaker Stack', 'Autotune', 'Treble Pins', 'Drumsticks', 'Hum Bubbles', 'Spotlight Storm', 'Bass Drop']);
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
  sim.addRunStats(s, day, { kills: 500, won: true, chests: 50, picks: 50, groove: 20 });
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
    const g = sim.createGame({ seed: 16, stage: 12, meta: { rev: 1 }, unlocked: ALL });
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

console.log(`cell_serpent: ${n} groups passed`);
