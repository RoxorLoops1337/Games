// Cell Serpent: headless suite. The sim is pure (cell_serpent/sim.js), the renderer
// is smoke-tested against a stub 2d context, and the asset manifest is checked
// against the files on disk.
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
const noop = () => {};
const stubCtx = () => new Proxy({}, { get: (_t, k) => (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop: noop }) : k === 'measureText' ? () => ({ width: 10 }) : noop, set: () => true });
const stubCanvas = (w, h) => ({ width: w, height: h, getContext: stubCtx });
const { W, H } = sim;

let n = 0;
const ok = (name, fn) => { fn(); n++; };
const run = (g, secs, input) => { for (let i = 0; i < secs * 60; i++) { sim.step(g, 1 / 60, typeof input === 'function' ? input(g) : input); if (g.phase === 'levelup') sim.choose(g, 0); } };
const bot = g => sim.botInput(g);

ok('deterministic: same seed, same run', () => {
  const a = sim.createGame({ seed: 7 }), b = sim.createGame({ seed: 7 });
  run(a, 20, bot); run(b, 20, bot);
  assert.equal(JSON.stringify(a.snakes.map(s => s.segs.map(q => [q.x.toFixed(3), q.hp]))), JSON.stringify(b.snakes.map(s => s.segs.map(q => [q.x.toFixed(3), q.hp]))));
  assert.equal(a.kills, b.kills);
});

ok('stage 1 spawns one snake with a head, tapering tail and visible HP', () => {
  const g = sim.createGame({ seed: 1 });
  assert.equal(g.snakes.length, 1);
  const s = g.snakes[0];
  assert.equal(s.segs.length, sim.snakeLength(1));
  assert.ok(s.segs[0].r > s.segs[3].r, 'head is the biggest');
  assert.ok(s.segs.at(-1).r < s.segs[3].r, 'tail tapers');
  assert.ok(s.segs.every(q => q.hp >= 1 && q.hp === q.max));
  assert.ok(g.stageHpMax > 0);
});

ok('boss stages are every 5th, longer, with a boss skin', () => {
  assert.ok(!sim.isBossStage(4) && sim.isBossStage(5) && sim.isBossStage(10));
  const g = sim.createGame({ seed: 2, stage: 5 });
  assert.ok(g.snakes[0].boss);
  assert.ok(g.snakes[0].segs.length > sim.snakeLength(4));
  assert.equal(sim.skinFor(5), 'pink'); assert.equal(sim.skinFor(6), 'purple'); assert.equal(sim.skinFor(11), 'pink');
});

ok('killing a middle segment splits the snake in two; the tail gets its own head', () => {
  const g = sim.createGame({ seed: 3 });
  const s = g.snakes[0], len = s.segs.length, mid = s.segs[5];
  const tailHead = s.segs[6];
  mid.hp = 0;
  sim.step(g, 1 / 60, {});
  assert.equal(g.snakes.length, 2);
  assert.equal(g.snakes[0].segs.length + g.snakes[1].segs.length, len - 1);
  assert.equal(g.snakes.find(x => x !== s).segs[0], tailHead);
  assert.ok(g.events.some(e => e.t === 'split') && g.events.some(e => e.t === 'kill'));
  assert.ok(g.kills >= 1 && g.pickups.length >= 1);
});

ok('killing the head promotes the next segment', () => {
  const g = sim.createGame({ seed: 4 });
  const s = g.snakes[0], second = s.segs[1];
  s.segs[0].hp = 0; sim.step(g, 1 / 60, {});
  assert.equal(g.snakes.length, 1); assert.equal(g.snakes[0].segs[0], second);
});

ok('a bomb segment chain-reacts into its neighbours and hurts the player when close', () => {
  const g = sim.createGame({ seed: 5 });
  const s = g.snakes[0];
  s.segs[4].kind = 'bomb'; s.segs[4].hp = 0; s.segs[4].max = 10;
  for (const q of s.segs) { q.x = 360; q.y = 400 + q.i * 10; }
  s.segs[5].hp = 1; s.segs[6].hp = 1;
  g.p.x = 360; g.p.y = 420;
  const hp0 = g.p.hp;
  sim.step(g, 1 / 60, {});
  assert.ok(g.events.some(e => e.t === 'boom'));
  assert.ok(!s.segs.some(q => q.i === 5 || q.i === 6) || g.snakes.every(x => x.segs.every(q => q.i !== 5 && q.i !== 6)));
  assert.ok(g.p.hp < hp0, 'player inside the blast radius takes damage');
});

ok('shooting: auto-aims at the nearest visible segment and bullets damage it', () => {
  const g = sim.createGame({ seed: 6 });
  const h = g.snakes[0].segs[0]; h.x = 360; h.y = 500; g.p.x = 360; g.p.y = 900;
  const hp0 = h.hp;
  run(g, 1.2, {});
  assert.ok(g.shots > 0);
  assert.ok(g.events.some(e => e.t === 'hit'));
  assert.ok(h.hp < hp0 || g.kills > 0);
  assert.ok(Math.abs(g.p.aim - -Math.PI / 2) < 0.4, 'aimed up the screen');
});

ok('contact hurts, grants i-frames, knocks back; hp never goes negative', () => {
  const g = sim.createGame({ seed: 8 });
  const h = g.snakes[0].segs[0]; h.x = g.p.x; h.y = g.p.y;
  sim.step(g, 1 / 60, {});
  assert.ok(g.p.hp < g.p.maxHp); assert.ok(g.p.iframes > 0);
  const hp1 = g.p.hp; sim.step(g, 1 / 60, {});
  assert.equal(g.p.hp, hp1, 'i-frames block the next hit');
});

ok('dying ends the run with a result; no revive without Second Wind', () => {
  const g = sim.createGame({ seed: 9 });
  g.p.hp = 1; const h = g.snakes[0].segs[0]; h.x = g.p.x; h.y = g.p.y;
  sim.step(g, 1 / 60, {});
  assert.equal(g.phase, 'dead'); assert.equal(g.p.hp, 0);
  assert.ok(g.result && g.result.stage === 1 && g.events.some(e => e.t === 'dead'));
  const t = g.t; sim.step(g, 1 / 60, {}); assert.equal(g.t, t, 'frozen once dead');
});

ok('Second Wind revives once', () => {
  const g = sim.createGame({ seed: 9, meta: { rev: 1 } });
  g.p.hp = 1; const h = g.snakes[0].segs[0]; h.x = g.p.x; h.y = g.p.y;
  sim.step(g, 1 / 60, {});
  assert.equal(g.phase, 'play'); assert.ok(g.p.hp >= g.p.maxHp * 0.5 - 1); assert.ok(g.events.some(e => e.t === 'revive'));
  g.p.iframes = 0; g.p.hp = 1; sim.step(g, 1 / 60, {});
  assert.equal(g.phase, 'dead');
});

ok('shield blocks damage, heal pickup heals, rage boosts damage', () => {
  const g = sim.createGame({ seed: 10 });
  g.p.shield = 3; const h = g.snakes[0].segs[0]; h.x = g.p.x; h.y = g.p.y;
  sim.step(g, 1 / 60, {}); assert.equal(g.p.hp, g.p.maxHp);
  g.p.shield = 0; g.p.hp = 10;
  g.pickups.push({ kind: 'heal', x: g.p.x, y: g.p.y, vx: 0, vy: 0, v: 1, age: 1, vac: true });
  sim.step(g, 1 / 60, {}); assert.ok(g.p.hp > 10);
  g.pickups.push({ kind: 'rage', x: g.p.x, y: g.p.y, vx: 0, vy: 0, v: 1, age: 1, vac: true });
  sim.step(g, 1 / 60, {}); assert.ok(g.p.rage > 0);
});

ok('gems level you up: three distinct choices, pick applies, game resumes', () => {
  const g = sim.createGame({ seed: 11 });
  g.pickups.push({ kind: 'gem', x: g.p.x, y: g.p.y, vx: 0, vy: 0, v: g.xpNeed + 1, age: 1, vac: true });
  sim.step(g, 1 / 60, {});
  assert.equal(g.phase, 'levelup'); assert.equal(g.level, 2);
  assert.equal(g.choices.length, 3); assert.equal(new Set(g.choices.map(c => c.id)).size, 3);
  const id = g.choices[0].id; const before = JSON.stringify({ ...g.p });
  assert.ok(sim.choose(g, 0));
  assert.equal(g.phase, 'play'); assert.equal(g.ups[id], 1); assert.notEqual(JSON.stringify({ ...g.p }), before);
  assert.ok(!sim.choose(g, 0), 'cannot choose outside level-up');
});

ok('every upgrade applies and respects its max level', () => {
  const g = sim.createGame({ seed: 12 });
  for (const u of sim.UPGRADES) {
    for (let k = 0; k < u.max + 2; k++) { g.phase = 'levelup'; g.pending = 1; g.choices = [{ id: u.id, name: u.name, desc: u.desc, lvl: g.ups[u.id] || 0, max: u.max }]; if (k < u.max) sim.choose(g, 0); }
    assert.equal(g.ups[u.id], u.max, u.id);
  }
  g.phase = 'play'; g.pending = 1;
  run(g, 0.1, {});
  assert.ok(g.phase === 'play' || g.phase === 'levelup');
});

ok('clearing every segment clears the stage, pays a bonus and starts the next one', () => {
  const g = sim.createGame({ seed: 13 });
  for (const q of g.snakes[0].segs) q.hp = 0;
  sim.step(g, 1 / 60, {});
  assert.equal(g.phase, 'clear'); assert.ok(g.events.some(e => e.t === 'clear')); assert.ok(g.coins > 0);
  run(g, 6, {});
  assert.equal(g.stage, 2); assert.equal(g.phase, 'play'); assert.equal(g.snakes.length, 1);
});

ok('minions swarm in from stage 2, chase the player and can be shot', () => {
  const g = sim.createGame({ seed: 14, stage: 3 });
  g.wave = 0.01; sim.step(g, 0.05, {});
  assert.ok(g.minions.length > 0 && g.events.some(e => e.t === 'swarm'));
  const m = g.minions[0], d0 = Math.hypot(m.x - g.p.x, m.y - g.p.y);
  run(g, 0.5, {});
  const m2 = g.minions.find(x => x === m);
  if (m2) assert.ok(Math.hypot(m2.x - g.p.x, m2.y - g.p.y) < d0);
  m.hp = 0; sim.step(g, 1 / 60, {}); assert.ok(!g.minions.includes(m));
});

ok('meta shop: buy, cost grows, max level, save sanitising', () => {
  const s = sim.defaultSave(); s.coins = 10000;
  const d = sim.META[0];
  assert.ok(sim.buyMeta(s, d.id)); assert.equal(s.meta[d.id], 1); assert.ok(s.coins < 10000);
  assert.ok(sim.metaCost(d, 3) > sim.metaCost(d, 1));
  for (let i = 0; i < 50; i++) sim.buyMeta(s, d.id);
  assert.equal(s.meta[d.id], d.max);
  const poor = sim.defaultSave(); assert.ok(!sim.buyMeta(poor, d.id));
  const bad = sim.sanitizeSave({ coins: -5, best: 'x', meta: { vit: 999, nope: 4 }, muted: 1 });
  assert.equal(bad.coins, 0); assert.equal(bad.best, 0); assert.equal(bad.meta.vit, sim.META[0].max); assert.ok(!('nope' in bad.meta));
  assert.equal(sim.sanitizeSave(null).coins, 0);
  const p = sim.makePlayer({ vit: 3, pow: 2 }); assert.equal(p.maxHp, 100 + 36); assert.ok(p.dmg > sim.makePlayer({}).dmg);
});

ok('bot plays a full run without errors: bounded entities, finite numbers, reaches stage 3+', () => {
  let best = 0;
  for (const seed of [1, 2, 3, 4, 5]) {
    const g = sim.createGame({ seed });
    for (let i = 0; i < 60 * 240 && g.phase !== 'dead'; i++) {
      sim.step(g, 1 / 60, bot(g)); if (g.phase === 'levelup') sim.choose(g, g.choices.length - 1);
      assert.ok(g.bullets.length < 400 && g.pickups.length < 600 && g.ebullets.length < 400 && g.minions.length < 80);
      assert.ok(Number.isFinite(g.p.x) && Number.isFinite(g.p.y) && g.p.x >= 0 && g.p.x <= W && g.p.y >= 0 && g.p.y <= H);
    }
    best = Math.max(best, g.stage);
    for (const sn of g.snakes) for (const q of sn.segs) assert.ok(Number.isFinite(q.x) && Number.isFinite(q.y) && q.hp > 0);
  }
  assert.ok(best >= 3, 'best stage ' + best);
});

ok('snake segments stay chained: neighbours never drift apart', () => {
  const g = sim.createGame({ seed: 15, stage: 6 });
  g.p.hp = g.p.maxHp = 1e6;
  run(g, 20, bot);
  for (const sn of g.snakes) for (let i = 1; i < sn.segs.length; i++) {
    const a = sn.segs[i - 1], b = sn.segs[i];
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) <= (a.r + b.r) * 0.78 + 1.5);
  }
});

ok('drawing kit bakes every snake skin, kind, minion, pickup and shot, and draws heads', () => {
  const kit = createArtDraw(stubCanvas, 2);
  const g = stubCtx();
  for (const skin of ['pink', 'purple']) for (const boss of [false, true]) for (const kind of ['', 'armor', 'bomb', 'spitter', 'gold']) assert.ok(kit.SPR.body(skin, boss, kind), `${skin} ${boss} ${kind}`);
  for (const m of sim.MINIONS) assert.ok(kit.MINION_IDS.includes(m.art) && kit.SPR.minion(m.art), m.art);
  for (const k of ['gem', 'coin', 'heal', 'shield', 'rage']) assert.ok(kit.SPR.pickup(k), k);
  assert.ok(kit.SPR.note(false) && kit.SPR.note(true) && kit.SPR.acid());
  for (const skin of ['pink', 'purple']) for (const boss of [false, true]) kit.drawHead(g, 10, 10, 38, 1.2, { skin, boss, t: 3.6, look: [1, 0], flash: 0.1 });
  assert.equal(kit.SPR.body('pink', false, ''), kit.SPR.body('pink', false, ''), 'sprites are cached');
  assert.equal(createArtDraw(null).SPR.body('pink', false, ''), null, 'no canvas factory degrades to null');
});

ok('renderer draws every phase against a stub context, with and without the kit and the duo art', () => {
  const canvas = { width: 420, height: 860, getContext: stubCtx };
  const fakeArt = { get: () => ({ width: 100, height: 80 }), has: () => true };
  for (const [art, kit] of [[null, null], [fakeArt, createArtDraw(stubCanvas, 2)]]) {
    const R = createRenderer(canvas, art, kit);
    const g = sim.createGame({ seed: 16, stage: 12, meta: { rev: 1 } });
    g.p.orbit = 2; g.p.shield = 2; g.p.rage = 2; g.wave = 0.01;
    for (let i = 0; i < 600; i++) {
      sim.step(g, 1 / 60, bot(g)); if (g.phase === 'levelup') sim.choose(g, 0);
      for (const e of g.events.splice(0)) R.onEvent(e, g);
      if (i % 5 === 0) R.draw(g, { joy: { on: true, x: 100, y: 100, dx: 0.3, dy: 0.2 } }, 1 / 12);
    }
    g.phase = 'dead'; R.onEvent({ t: 'dead' }, g); R.draw(g, null, 0.016);
    const p = R.toGame(210, 430); assert.ok(Number.isFinite(p.x));
  }
});

ok('the player art ships; everything else is drawn in code (no stray sheet crops)', () => {
  for (const k of ART_KEYS) assert.ok(existsSync(join(root, 'assets', k + '.png')), k + '.png missing');
  assert.deepEqual(ART_KEYS, ['duo_idle', 'duo_sing']);
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
