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
const { W, H, LINE_Y } = sim;
const noop = () => {};
const stubCtx = () => new Proxy({}, { get: (_t, k) => (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop: noop }) : k === 'measureText' ? () => ({ width: 10 }) : noop, set: () => true });
const stubCanvas = (w, h) => ({ width: w, height: h, getContext: stubCtx });

let n = 0;
const ok = (name, fn) => { fn(); n++; };
const run = (g, secs, input, pick = 0) => { for (let i = 0; i < secs * 60; i++) { sim.step(g, 1 / 60, typeof input === 'function' ? input(g) : input); if (g.phase === 'levelup') sim.choose(g, pick); } };
const bot = g => sim.botInput(g);
// move the whole virus along its lane until the head sits `gap` px above the cell
const bringNear = (g, gap = 100) => { let best = 0, bd = 1e9; for (let t = 0; t < g.path.len; t += 4) { const q = sim.pointAt(g.path, t), d = Math.abs(Math.hypot(q.x - g.p.x, q.y - g.p.y) - gap); if (d < bd) { bd = d; best = t; } } const shift = best - g.snakes[0].segs[0].ps; for (const q of g.snakes[0].segs) q.ps += shift; };
const ALL = { needles: 1, stick: 1, bubble: 1, satellite: 1, maw: 1 };

ok('deterministic: same seed, same run', () => {
  const a = sim.createGame({ seed: 7 }), b = sim.createGame({ seed: 7 });
  run(a, 25, bot); run(b, 25, bot);
  const snap = g => JSON.stringify(g.snakes.map(s => s.segs.map(q => [q.x.toFixed(3), q.hp.toFixed(3)])));
  assert.equal(snap(a), snap(b)); assert.equal(a.kills, b.kills); assert.equal(a.coins, b.coins);
});

ok('the virus rides a winding track downward: head enters first, segments follow by arc length', () => {
  const g = sim.createGame({ seed: 1 });
  const s = g.snakes[0];
  assert.equal(s.segs.length, sim.snakeLength(1));
  assert.ok(s.segs[0].r > s.segs[3].r && s.segs.at(-1).r < s.segs[3].r, 'big head, tapering tail');
  for (let i = 1; i < s.segs.length; i++) assert.ok(s.segs[i].ps < s.segs[i - 1].ps, 'ordered along the track');
  const y0 = s.segs[0].y; run(g, 4, {});
  assert.ok(s.segs[0].y > y0 + 40, 'moves down the screen');
  assert.ok(g.path.len > H, 'the lane winds, so it is longer than the screen');
  const a = sim.pointAt(g.path, 100), b = sim.pointAt(g.path, 900);
  assert.ok(b.y > a.y);
  assert.ok(sim.pointAt(g.path, -50).y < sim.pointAt(g.path, 0).y, 'extends upward beyond the start');
});

ok('chapters: names, five skins, bosses every 5th, alternating spawn points', () => {
  assert.ok(!sim.isBossStage(4) && sim.isBossStage(5) && sim.isBossStage(10));
  assert.equal(sim.virusName(1), 'Love-Struck Virus'); assert.equal(sim.virusName(2), 'Rustic Virus');
  assert.deepEqual(new Set([1, 2, 3, 4, 5].map(sim.skinFor)).size, 5);
  assert.ok(sim.snakeLength(5) > sim.snakeLength(4));
  const g1 = sim.createGame({ seed: 2, stage: 1 }), g2 = sim.createGame({ seed: 2, stage: 2 });
  assert.equal(sim.spawnMode(1), 'bottom'); assert.equal(sim.spawnMode(2), 'center');
  assert.ok(g1.p.y > g2.p.y + 200, 'center chapters spawn the cell higher');
  assert.ok(g2.p.zone.y1 < g1.p.zone.y0 + 100);
  assert.ok(sim.createGame({ seed: 3, stage: 5 }).snakes[0].boss);
});

ok('the cell moves inside its spawn zone only', () => {
  const g = sim.createGame({ seed: 4 });
  run(g, 3, { mx: -1, my: 1 }); assert.ok(g.p.x >= g.p.zone.x0 && g.p.y <= g.p.zone.y1);
  run(g, 3, { mx: 1, my: -1 }); assert.ok(g.p.x <= g.p.zone.x1 && g.p.y >= g.p.zone.y0);
});

ok('killing a middle segment splits the virus into two pieces that both keep crawling', () => {
  const g = sim.createGame({ seed: 3 });
  const s = g.snakes[0], len = s.segs.length, tailHead = s.segs[6];
  s.segs[5].hp = 0; sim.step(g, 1 / 60, {});
  assert.equal(g.snakes.length, 2);
  assert.equal(g.snakes[0].segs.length + g.snakes[1].segs.length, len - 1);
  assert.equal(g.snakes.find(x => x !== s).segs[0], tailHead);
  assert.ok(g.events.some(e => e.t === 'split') && g.events.some(e => e.t === 'kill') && g.pickups.length >= 1);
  const ps = tailHead.ps; run(g, 1, {}); assert.ok(tailHead.ps > ps);
});

ok('killing the head promotes the next segment', () => {
  const g = sim.createGame({ seed: 4 });
  const s = g.snakes[0], second = s.segs[1];
  s.segs[0].hp = 0; sim.step(g, 1 / 60, {});
  assert.equal(g.snakes.length, 1); assert.equal(g.snakes[0].segs[0], second);
});

ok('a segment that reaches the membrane leaks: hurts even through i-frames, drops nothing', () => {
  const g = sim.createGame({ seed: 5 });
  const s = g.snakes[0], h = s.segs[0];
  g.p.iframes = 5; const hp0 = g.p.hp, kills0 = g.kills, pick0 = g.pickups.length;
  h.ps = g.path.len + 1; sim.step(g, 1 / 60, {});
  assert.ok(g.p.hp < hp0, 'leak damage ignores i-frames');
  assert.equal(g.leaks, 1); assert.equal(g.kills, kills0); assert.equal(g.pickups.length, pick0);
  assert.ok(g.events.some(e => e.t === 'leak') && !g.snakes.some(x => x.segs.includes(h)));
  assert.ok(sim.LINE_Y < H && LINE_Y === 1190);
});

ok('a bomb segment chain-reacts into neighbours and the player', () => {
  const g = sim.createGame({ seed: 5 });
  const s = g.snakes[0], bomb = s.segs[4];
  bomb.kind = 'bomb'; bomb.hp = 0; bomb.max = 10; s.segs[5].hp = 1; s.segs[6].hp = 1;
  const pos = sim.pointAt(g.path, bomb.ps + 1);
  g.p.zone = { x0: -500, x1: 2000, y0: -500, y1: 2000 }; g.p.x = pos.x + 90; g.p.y = pos.y; g.p.iframes = 0;
  const hp0 = g.p.hp;
  sim.step(g, 1 / 60, {});
  assert.ok(g.events.some(e => e.t === 'boom'));
  assert.ok(g.snakes.every(x => x.segs.every(q => q.i !== 5 && q.i !== 6)), 'neighbours died in the blast');
  assert.ok(g.p.hp < hp0, 'the cell inside the blast is hurt');
});

ok('the capsule auto-aims at the nearest visible target and bullets land', () => {
  const g = sim.createGame({ seed: 6 });
  const h = g.snakes[0].segs[0]; h.ps = 600; sim.step(g, 1 / 60, {});
  run(g, 1.5, {});
  assert.ok(g.shots > 0 && g.events.some(e => e.t === 'hit'));
  assert.ok(g.snakes[0].segs[0].hp < g.snakes[0].segs[0].max || g.kills > 0);
});

ok('every weapon works at every level and hurts the virus', () => {
  for (const w of sim.WEAPONS) for (const L of [1, 3, 5]) {
    const g = sim.createGame({ seed: 20 + L, unlocked: ALL, stage: 6 });
    g.weap[w.id] = { lv: L, cd: 0 }; if (w.id === 'tower') g.weap.tower.lv = L;
    g.p.hp = g.p.maxHp = 1e6; g.p.rate = 0.0001; g.p.cd = 99;   // silence the capsule so only the weapon deals damage
    bringNear(g); g.snakes[0].speed = 0.01;                      // park the virus by the cell
    sim.step(g, 1 / 60, {});
    const before = g.stageHp, ev = new Set();
    for (let i = 0; i < 60 * 12; i++) { sim.step(g, 1 / 60, { mx: 0, my: 0 }); for (const e of g.events) ev.add(e.t); g.events.length = 0; if (g.phase === 'levelup') sim.choose(g, 0); }
    assert.ok(g.stageHp < before || g.kills > 0, `${w.id} L${L} dealt no damage`);
  }
});

ok('swab plants a zone on the front of the virus; towers pulse; maw executes weak segments', () => {
  const g = sim.createGame({ seed: 8, stage: 3 });
  g.p.cd = 99; g.weap.swab = { lv: 3, cd: 0 }; bringNear(g, 250);
  sim.step(g, 1 / 60, {}); assert.ok(g.zones.length >= 1);
  const z = g.zones[0], head = g.snakes[0].segs[0]; assert.ok(Math.hypot(z.x - head.x, z.y - head.y) < 80);
  const g2 = sim.createGame({ seed: 9 }); g2.weap.tower = { lv: 5, cd: 0 }; sim.choose(Object.assign(g2, { phase: 'levelup', pending: 1, choices: [{ id: 'tower', kind: 'weapon', lvl: 4, max: 5 }] }), 0);
  assert.equal(g2.towers.length, 3);
  const g3 = sim.createGame({ seed: 10, unlocked: ALL }); g3.p.cd = 99; g3.weap.maw = { lv: 5, cd: 0 };
  bringNear(g3, 250); g3.snakes[0].speed = 0.01; g3.weap.maw.cd = 99; sim.step(g3, 1 / 60, {});
  const weak = g3.snakes[0].segs[2]; weak.hp = weak.max * 0.1;
  g3.maws.push({ x: weak.x, y: weak.y, r: 120, life: 1, max: 1, tick: 0, exec: 0.3, dmg: 0 }); sim.step(g3, 1 / 60, {});
  assert.ok(!g3.snakes.some(s => s.segs.includes(weak)), 'executed');
});

ok('chests drop at 25% and 50% of the virus health and open a skill pick', () => {
  const g = sim.createGame({ seed: 11 });
  const s = g.snakes[0], total = g.stageHpMax; let dead = 0;
  for (const q of s.segs) { if (dead / total >= 0.27) break; dead += q.hp; q.hp = 0; }
  sim.step(g, 1 / 60, {});
  assert.ok(g.progress >= 0.25 && g.chestsDone[25] && g.pickups.some(p => p.kind === 'chest') && g.events.some(e => e.t === 'chestdrop'));
  const chest = g.pickups.find(p => p.kind === 'chest'); chest.x = g.p.x; chest.y = g.p.y; chest.age = 1;
  const coins0 = g.coins; sim.step(g, 1 / 60, {});
  assert.equal(g.phase, 'levelup'); assert.ok(g.coins > coins0); assert.equal(g.choices.length, 3);
});

ok('level-up offers 3 distinct choices (new weapons, weapon levels, passives); picks apply; maxed and locked are excluded', () => {
  const g = sim.createGame({ seed: 12 });
  g.pickups.push({ kind: 'gem', x: g.p.x, y: g.p.y, vx: 0, vy: 0, v: g.xpNeed + 1, age: 1, vac: true });
  sim.step(g, 1 / 60, {});
  assert.equal(g.phase, 'levelup'); assert.equal(g.level, 2); assert.equal(g.choices.length, 3);
  assert.equal(new Set(g.choices.map(c => c.id)).size, 3);
  assert.ok(!g.choices.some(c => ['needles', 'stick', 'bubble', 'satellite', 'maw'].includes(c.id)), 'locked weapons never appear');
  const c = g.choices[0]; assert.ok(sim.choose(g, 0)); assert.equal(g.phase, 'play');
  assert.ok(c.kind === 'weapon' ? g.weap[c.id].lv === 1 : g.ups[c.id] === 1);
  assert.ok(!sim.choose(g, 0));
  // maxed weapons stop being offered; at most six weapons are carried
  const h = sim.createGame({ seed: 13, unlocked: ALL });
  for (const w of sim.WEAPONS.slice(0, 6)) h.weap[w.id] = { lv: w.id === 'swab' ? 5 : 2, cd: 0 };
  for (let i = 0; i < 40; i++) { h.phase = 'play'; h.pending = 1; sim.step(h, 1 / 60, {}); assert.ok(h.choices.every(c => !(c.id === 'swab') && (c.kind === 'passive' || h.weap[c.id]))); sim.choose(h, 0); }
});

ok('every passive applies and respects its max level', () => {
  const g = sim.createGame({ seed: 14 });
  for (const u of sim.PASSIVES) {
    for (let k = 0; k < u.max + 2; k++) { g.phase = 'levelup'; g.pending = 1; g.choices = [{ id: u.id, kind: 'passive', lvl: g.ups[u.id] || 0, max: u.max }]; if (k < u.max) sim.choose(g, 0); }
    assert.equal(g.ups[u.id], u.max, u.id);
  }
  assert.ok(g.p.maxHp > 100 && g.p.speed > 270 && g.p.crit > 0.3);
});

ok('firstPick opens a skill choice before anything else', () => {
  const g = sim.createGame({ seed: 15, firstPick: true });
  sim.step(g, 1 / 60, {}); assert.equal(g.phase, 'levelup'); assert.equal(g.choices.length, 3);
  sim.choose(g, 0); assert.equal(g.phase, 'play');
});

ok('contact hurts, grants i-frames; dying ends the run; Second Wind revives once; shield, heal and rage pickups work', () => {
  const g = sim.createGame({ seed: 16 });
  g.snakes[0].speed = 0.01; const hd = g.snakes[0].segs[0]; g.p.zone = { x0: -500, x1: 2000, y0: -500, y1: 2000 }; g.p.x = hd.x; g.p.y = hd.y;
  const hp0 = g.p.hp; sim.step(g, 1 / 60, {}); assert.ok(g.p.hp < hp0 && g.p.iframes > 0);
  const d = sim.createGame({ seed: 17 }); d.p.hp = 1; d.snakes[0].segs[0].ps = d.path.len + 1; sim.step(d, 1 / 60, {});
  assert.equal(d.phase, 'dead'); assert.ok(d.result && d.result.stage === 1 && d.result.name);
  const t = d.t; sim.step(d, 1 / 60, {}); assert.equal(d.t, t);
  const r = sim.createGame({ seed: 17, meta: { rev: 1 } }); r.p.hp = 1; r.snakes[0].segs[0].ps = r.path.len + 1; sim.step(r, 1 / 60, {});
  assert.equal(r.phase, 'play'); assert.ok(r.events.some(e => e.t === 'revive'));
  const s = sim.createGame({ seed: 18 }); s.p.shield = 3; s.snakes[0].segs[0].ps = s.path.len + 1; sim.step(s, 1 / 60, {}); assert.equal(s.p.hp, s.p.maxHp);
  s.p.shield = 0; s.p.hp = 10; s.pickups.push({ kind: 'heal', x: s.p.x, y: s.p.y, vx: 0, vy: 0, v: 1, age: 1, vac: true }, { kind: 'rage', x: s.p.x, y: s.p.y, vx: 0, vy: 0, v: 1, age: 1, vac: true });
  sim.step(s, 1 / 60, {}); assert.ok(s.p.hp > 10 && s.p.rage > 0);
});

ok('clearing the virus clears the chapter: bonus chest, then the next chapter starts with a new lane', () => {
  const g = sim.createGame({ seed: 19 });
  const path1 = g.path;
  for (const q of g.snakes[0].segs) q.hp = 0;
  sim.step(g, 1 / 60, {});
  assert.ok(['clear', 'levelup'].includes(g.phase)); assert.ok(g.events.some(e => e.t === 'clear') && g.coins > 0);
  run(g, 10, { mx: 0, my: 0 });
  assert.equal(g.stage, 2); assert.equal(g.phase, 'play'); assert.equal(g.snakes.length, 1); assert.notEqual(g.path, path1);
});

ok('minions swarm in from chapter 2, chase the cell, and can be shot', () => {
  const g = sim.createGame({ seed: 14, stage: 3 });
  g.wave = 0.01; sim.step(g, 0.05, {});
  assert.ok(g.minions.length > 0 && g.events.some(e => e.t === 'swarm'));
  const m = g.minions[0]; m.hp = 0; sim.step(g, 1 / 60, {}); assert.ok(!g.minions.includes(m));
});

ok('shop: stats, weapon unlocks, save sanitising', () => {
  const s = sim.defaultSave(); s.coins = 1e7;
  assert.ok(['atk', 'crt', 'cdn'].every(id => sim.META.some(m => m.id === id)));
  assert.ok(sim.buyMeta(s, 'atk')); assert.equal(s.meta.atk, 1); assert.ok(sim.metaCost(sim.META[0], 3) > sim.metaCost(sim.META[0], 1));
  for (let i = 0; i < 50; i++) sim.buyMeta(s, 'atk'); assert.equal(s.meta.atk, sim.META[0].max);
  assert.ok(!s.unlocked.needles); assert.ok(sim.buyWeapon(s, 'needles')); assert.ok(s.unlocked.needles); assert.ok(!sim.buyWeapon(s, 'needles'));
  assert.ok(!sim.buyWeapon(sim.defaultSave(), 'maw'));
  const bad = sim.sanitizeSave({ coins: -5, best: 'x', meta: { atk: 999, nope: 4 }, unlocked: { maw: 1, nope: 1 }, muted: 1 });
  assert.equal(bad.coins, 0); assert.equal(bad.meta.atk, sim.META[0].max); assert.ok(bad.unlocked.maw && !bad.unlocked.nope && bad.unlocked.swab);
  const p = sim.makePlayer({ atk: 5, crt: 5, cdn: 5, vit: 2 });
  assert.ok(p.atk > 1.3 && p.crit > 0.1 && p.cdBase < 0.8 && p.maxHp === 124);
});

ok('bot plays full runs without errors: bounded entities, finite numbers, survives several chapters', () => {
  let best = 0;
  for (const seed of [1, 2, 3, 4]) {
    const g = sim.createGame({ seed, firstPick: true, unlocked: ALL });
    for (let i = 0; i < 60 * 300 && g.phase !== 'dead'; i++) {
      sim.step(g, 1 / 60, bot(g)); if (g.phase === 'levelup') sim.choose(g, Math.floor(g.rand() * g.choices.length));
      assert.ok(g.bullets.length < 600 && g.pickups.length < 700 && g.ebullets.length < 400 && g.minions.length < 80 && g.zones.length < 20);
      assert.ok(Number.isFinite(g.p.x) && g.p.x >= 0 && g.p.x <= W && g.p.y >= 0 && g.p.y <= H && Number.isFinite(g.p.hp));
    }
    best = Math.max(best, g.stage);
    for (const sn of g.snakes) for (const q of sn.segs) assert.ok(Number.isFinite(q.x) && Number.isFinite(q.y) && q.hp > 0);
  }
  assert.ok(best >= 3, 'best chapter ' + best);
});

ok('drawing kit bakes every skin, kind, minion, pickup, weapon and shot, and draws heads', () => {
  const kit = createArtDraw(stubCanvas, 2), g = stubCtx();
  for (const skin of sim.SKINS) for (const boss of [false, true]) for (const kind of ['', 'armor', 'bomb', 'spitter', 'gold']) assert.ok(kit.SPR.body(skin, boss, kind), `${skin} ${boss} ${kind}`);
  for (const m of sim.MINIONS) assert.ok(kit.MINION_IDS.includes(m.art) && kit.SPR.minion(m.art), m.art);
  for (const k of ['gem', 'coin', 'heal', 'shield', 'rage', 'chest']) assert.ok(kit.SPR.pickup(k), k);
  for (const w of ['swab', 'dagger', 'needle', 'stick', 'tower']) assert.ok(kit.SPR.weapon(w), w);
  assert.ok(kit.SPR.note(false) && kit.SPR.note(true) && kit.SPR.acid());
  for (const skin of sim.SKINS) for (const boss of [false, true]) kit.drawHead(g, 10, 10, 38, 1.2, { skin, boss, t: 3.6, look: [1, 0], flash: 0.1 });
  assert.equal(kit.SPR.body('pink', false, ''), kit.SPR.body('pink', false, ''), 'cached');
  assert.equal(createArtDraw(null).SPR.body('pink', false, ''), null, 'no canvas factory degrades to null');
});

ok('renderer draws every phase and every weapon against a stub context, with and without the kit', () => {
  const canvas = { width: 420, height: 860, getContext: stubCtx };
  const fakeArt = { get: () => ({ width: 100, height: 80 }), has: () => true };
  for (const [art, kit] of [[null, null], [fakeArt, createArtDraw(stubCanvas, 2)]]) {
    const R = createRenderer(canvas, art, kit);
    const g = sim.createGame({ seed: 16, stage: 12, meta: { rev: 1 }, unlocked: ALL });
    for (const w of sim.WEAPONS) g.weap[w.id] = { lv: 3, cd: 0 };
    sim.choose(Object.assign(g, { phase: 'levelup', pending: 1, choices: [{ id: 'tower', kind: 'weapon', lvl: 3, max: 5 }] }), 0);
    g.p.shield = 2; g.p.rage = 2; g.wave = 0.01;
    for (let i = 0; i < 900; i++) {
      sim.step(g, 1 / 60, bot(g)); if (g.phase === 'levelup') sim.choose(g, 0);
      for (const e of g.events.splice(0)) R.onEvent(e, g);
      if (i % 5 === 0) R.draw(g, { joy: { on: true, x: 100, y: 100, dx: 0.3, dy: 0.2 } }, 1 / 12);
    }
    g.phase = 'dead'; R.onEvent({ t: 'dead' }, g); R.draw(g, null, 0.016);
    assert.ok(Number.isFinite(R.toGame(210, 430).x));
  }
});

ok('the player art ships; everything else is drawn in code', () => {
  assert.deepEqual(ART_KEYS, ['duo_idle', 'duo_sing']);
  for (const k of ART_KEYS) assert.ok(existsSync(join(root, 'assets', k + '.png')), k + '.png missing');
});

ok('index.html wires the module, the screens and the save key; folder is deployed and listed', () => {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  for (const id of ['title', 'shop', 'levelup', 'pause', 'over', 'c']) assert.ok(html.includes(`id="${id}"`), id);
  assert.ok(html.includes('src="main.js"'));
  assert.ok(readFileSync(join(root, 'main.js'), 'utf8').includes("'cell_serpent_save_v1'"));
  assert.ok(/'cell_serpent'/.test(readFileSync(join(root, '..', 'build.js'), 'utf8')), 'in build.js STATIC_PATHS');
  assert.ok(readFileSync(join(root, '..', 'index.html'), 'utf8').includes('/cell_serpent/'), 'on the arcade page');
});

console.log(`cell_serpent: ${n} groups passed`);
