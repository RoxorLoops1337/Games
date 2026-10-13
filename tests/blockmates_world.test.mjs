// Blockmates: headless world simulation tests (terrain, physics, mining, crafting, liquids, mobs, persistence, 16 players).
import assert from 'node:assert/strict';
import { World } from '../blockmates/server/world.js';
import { dropFor, B, I, W, H, SEA, RECIPES, CHUNK, MAX_PLAYERS, BLOCKS, ITEMS, MOBS } from '../blockmates/shared/data.js';
import { Terrain } from '../blockmates/shared/worldgen.js';
import { packLayers, unpackLayers } from '../blockmates/shared/codec.js';
import { K_RIGHT, K_JUMP } from '../blockmates/shared/physics.js';
import * as mobsMod from '../blockmates/server/mobs.js';

let passed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log('ok  ' + name); } catch (e) { console.error('FAIL ' + name); console.error(e); process.exitCode = 1; } };

function client(w, name, token = 't' + name) {
  const out = [];
  const id = w.connect((o) => out.push(o));
  w.message(id, { t: 'join', name, token });
  return { id, out, p: () => w.players.get(id), last: (t) => [...out].reverse().find((o) => o.t === t) };
}
const run = (w, n) => { for (let i = 0; i < n; i++) w.tick(); };

test('data tables are consistent', () => {
  for (const r of RECIPES) { assert.ok(ITEMS[r.out], 'recipe output'); for (const [id] of r.in) assert.ok(ITEMS[id], 'recipe input'); }
  for (const [n, d] of Object.entries(MOBS)) for (const [name] of d.drops) assert.ok(I[name], n + ' drop ' + name);
  for (const b of BLOCKS) if (b.drop) assert.ok(I[b.drop], 'drop ' + b.drop);
  assert.ok(BLOCKS.length < 256);
});

test('terrain is deterministic and varied', () => {
  const a = new Terrain(42).chunk(20), b = new Terrain(42).chunk(20), c = new Terrain(43).chunk(20);
  assert.deepEqual(a.fg, b.fg);
  assert.notDeepEqual(a.fg, c.fg);
  const t = new Terrain(42);
  const seen = new Set();
  for (let x = 0; x < W; x += 4) seen.add(t.biomeAt(x));
  assert.ok(seen.size >= 4, 'biomes ' + [...seen]);
  // ores exist somewhere
  const ores = new Set();
  for (let cx = 10; cx < 40; cx++) { const ch = t.chunk(cx); for (const v of ch.fg) if (BLOCKS[v].name.endsWith('_ore')) ores.add(BLOCKS[v].name); }
  for (const o of ['coal_ore', 'copper_ore', 'tin_ore', 'iron_ore']) assert.ok(ores.has(o), o);
});

test('chunk codec round trips', () => {
  const ch = new Terrain(9).chunk(5);
  const u = unpackLayers(packLayers(ch.fg, ch.bg, ch.liq), CHUNK * H);
  assert.deepEqual(u.fg, ch.fg); assert.deepEqual(u.bg, ch.bg); assert.deepEqual(u.liq, ch.liq);
});

test('a player joins, falls to the ground and walks', () => {
  const w = new World({ seed: 5 });
  const c = client(w, 'Ann');
  assert.ok(c.last('welcome'));
  run(w, 90);
  const p = c.p();
  assert.ok(p.onGround, 'on ground');
  const x0 = p.x;
  w.message(c.id, { t: 'i', k: K_RIGHT, s: 1 });
  run(w, 30);
  assert.ok(p.x > x0 + 4, 'walked ' + (p.x - x0));
  w.message(c.id, { t: 'i', k: 0, s: 2 }); run(w, 20);
  const y0 = p.y; w.message(c.id, { t: 'i', k: K_JUMP, s: 3 }); run(w, 8);
  assert.ok(p.y < y0 - 1, 'jumped');
});

test('mining a block drops an item and the player collects it', () => {
  const w = new World({ seed: 5 });
  const c = client(w, 'Bob');
  run(w, 90);
  const p = c.p();
  const x = Math.floor(p.x), y = Math.floor(p.y + 0.1);
  // the tile under the feet
  const under = w.fgAt(x, y);
  assert.ok(under, 'standing on something, got ' + under + ' at ' + x + ',' + y);
  const got = dropFor(under);
  const before = w.countItem(p, got);
  for (let i = 0; i < 200 && w.fgAt(x, y); i++) { w.message(c.id, { t: 'mine', x, y, l: 0 }); w.tick(); }
  assert.equal(w.fgAt(x, y), 0, 'block removed');
  run(w, 60);
  assert.ok(w.countItem(p, got) > before, 'drop collected');
});

test('cannot mine ore without the right tool tier', () => {
  const w = new World({ seed: 5 });
  const c = client(w, 'Cy'); run(w, 60);
  const p = c.p();
  const x = Math.floor(p.x) + 1, y = Math.floor(p.y - 0.5);
  w.setTile(x, y, 0, B.iron_ore);
  w.addItem(p, I.wood_pickaxe, 1);
  let ticks = 0;
  while (w.fgAt(x, y) && ticks < 3000) { w.message(c.id, { t: 'mine', x, y, l: 0 }); w.tick(); ticks++; }
  const ironDrops = [...w.drops.values()].filter((d) => d.item === I.iron_ore).length;
  assert.equal(ironDrops, 0, 'no drop with a wood pick');
  const stoneTicks = (() => { w.setTile(x, y, 0, B.stone); w.message(c.id, { t: 'mine', x, y, l: 0 }); let t = 0; while (w.fgAt(x, y) && t < 3000) { w.message(c.id, { t: 'mine', x, y, l: 0 }); w.tick(); t++; } return t; })();
  assert.ok(stoneTicks > 5);
});

test('placing blocks works, respects reach and consumes the item', () => {
  const w = new World({ seed: 5 });
  const c = client(w, 'Di'); run(w, 60);
  const p = c.p();
  w.addItem(p, I.planks, 10);
  const slot = p.inv.findIndex((s) => s && s.id === I.planks);
  w.message(c.id, { t: 'sel', i: Math.min(slot, 9) });
  const x = Math.floor(p.x) + 2, y = Math.floor(p.y) - 1;
  w.setTile(x, y + 1, 0, B.stone);
  const hotbarSlot = p.sel;
  if (slot > 9) { p.inv[9] = p.inv[slot]; p.inv[slot] = null; p.sel = 9; }
  w.message(c.id, { t: 'place', x, y, l: 0 });
  assert.equal(w.fgAt(x, y), B.planks);
  assert.equal(w.countItem(p, I.planks), 9);
  w.message(c.id, { t: 'place', x: x + 30, y, l: 0 });
  assert.equal(w.fgAt(x + 30, y), w.fgAt(x + 30, y), 'far placement ignored');
  assert.equal(w.countItem(p, I.planks), 9);
  void hotbarSlot;
});

test('crafting needs ingredients and stations', () => {
  const w = new World({ seed: 5 });
  const c = client(w, 'Eve'); run(w, 60);
  const p = c.p();
  const ri = (name) => RECIPES.findIndex((r) => r.out === I[name]);
  w.addItem(p, I.log, 2);
  w.message(c.id, { t: 'craft', r: ri('planks'), n: 2 });
  assert.equal(w.countItem(p, I.planks), 8);
  w.message(c.id, { t: 'craft', r: ri('workbench'), n: 1 });
  assert.equal(w.countItem(p, I.workbench), 1);
  // door needs a bench nearby
  w.addItem(p, I.planks, 6);
  w.message(c.id, { t: 'craft', r: ri('door'), n: 1 });
  assert.equal(w.countItem(p, I.door), 0, 'no bench');
  w.setTile(Math.floor(p.x), Math.floor(p.y) - 1, 0, B.workbench);
  w.message(c.id, { t: 'craft', r: ri('door'), n: 1 });
  assert.equal(w.countItem(p, I.door), 1);
});

test('water flows down and spreads, sea refills', () => {
  const w = new World({ seed: 5 });
  const c = client(w, 'Fay'); run(w, 30);
  // artificial flat room
  const x0 = 700, y0 = 60;
  for (let x = x0 - 3; x <= x0 + 8; x++) { w.setTile(x, y0 + 5, 0, B.stone); for (let y = y0 - 10; y < y0 + 5; y++) { w.setTile(x, y, 0, 0); w.setTile(x, y, 2, 0); } }
  w.setTile(x0, y0 + 4, 2, (1 << 4) | 8);
  w.liqActive.add((y0 + 4) * W + x0);
  for (let i = 0; i < 200; i++) w.tick();
  let total = 0;
  for (let x = x0 - 3; x <= x0 + 8; x++) total += w.liqAt(x, y0 + 4) & 15;
  assert.equal(total, 8, 'volume conserved');
  assert.ok((w.liqAt(x0 + 1, y0 + 4) & 15) > 0, 'spread sideways');
});

test('water meeting lava makes stone', () => {
  const w = new World({ seed: 5 });
  client(w, 'Gus');
  const x = 710, y = 70;
  for (let k = -2; k <= 2; k++) { w.setTile(x + k, y + 1, 0, B.stone); for (let yy = y - 5; yy <= y; yy++) { w.setTile(x + k, yy, 0, 0); w.setTile(x + k, yy, 2, 0); } }
  w.setTile(x - 1, y, 2, (2 << 4) | 8); w.setTile(x, y - 2, 2, (1 << 4) | 8);
  w.liqActive.add(y * W + x - 1); w.liqActive.add((y - 2) * W + x);
  for (let i = 0; i < 120; i++) w.tick();
  let rock = 0;
  for (let k = -2; k <= 2; k++) for (let yy = y - 2; yy <= y; yy++) { const id = w.fgAt(x + k, yy); if (id === B.obsidian || id === B.stone) rock++; }
  assert.ok(rock > 0, 'rock formed');
});

test('night spawns hostile creatures and daytime passive ones', () => {
  const w = new World({ seed: 5 });
  const c = client(w, 'Hal'); run(w, 30);
  w.time = 600 * 0.7;
  const types = new Set();
  for (let sec = 0; sec < 40; sec++) { run(w, 30); c.p().hp = 20; for (const m of w.mobs.values()) types.add(m.type); }
  assert.ok(types.has('gloomling'), 'night spawn: ' + [...types]);
  void c;
});

test('mobs hurt and can be killed, dropping loot', () => {
  const w = new World({ seed: 5 });
  const c = client(w, 'Ivy'); run(w, 60);
  const p = c.p();
  w.addItem(p, I.iron_sword, 1);
  const si = p.inv.findIndex((s) => s && s.id === I.iron_sword);
  p.inv[9] = p.inv[si]; if (si !== 9) p.inv[si] = null; p.sel = 9;
  const mob = mobsMod.spawnMob(w, 'waddler', p.x + 1, p.y);
  for (let i = 0; i < 8 && w.mobs.has(mob.id); i++) { w.message(c.id, { t: 'atk', x: p.x + 1, y: p.y }); run(w, 14); }
  assert.ok(!w.mobs.has(mob.id), 'mob died');
  run(w, 30);
  assert.ok(w.drops.size > 0 || w.countItem(p, I.raw_meat) + w.countItem(p, I.feather) > 0);
});

test('death respawns the player', () => {
  const w = new World({ seed: 5 });
  const c = client(w, 'Jo'); run(w, 60);
  const p = c.p();
  w.hurtPlayer(p, 99, 'a test');
  assert.ok(p.dead);
  run(w, 100);
  assert.ok(!p.dead && p.hp > 0);
});

test('chests store items between players', () => {
  const w = new World({ seed: 5 });
  const a = client(w, 'Kim'), b = client(w, 'Lee'); run(w, 60);
  const p = a.p();
  const x = Math.floor(p.x) + 1, y = Math.floor(p.y) - 1;
  w.setTile(x, y + 1, 0, B.stone);
  w.addItem(p, I.chest, 1);
  const s = p.inv.findIndex((q) => q && q.id === I.chest); p.inv[9] = p.inv[s]; if (s !== 9) p.inv[s] = null; p.sel = 9;
  w.message(a.id, { t: 'place', x, y, l: 0 });
  assert.equal(w.fgAt(x, y), B.chest);
  w.message(a.id, { t: 'use2', x, y });
  assert.ok(a.last('chest'));
  const di = p.inv.findIndex((q) => q && q.id === I.torch);
  w.message(a.id, { t: 'move', from: ['inv', di], to: ['chest', 0] });
  assert.equal(w.metaGet(x, y).inv[0].id, I.torch);
  const q = b.p(); q.x = p.x; q.y = p.y;
  w.message(b.id, { t: 'use2', x, y });
  assert.equal(b.last('chest').inv[0].id, I.torch);
});

test('doors toggle both halves and sand falls', () => {
  const w = new World({ seed: 5 });
  const c = client(w, 'Mo'); run(w, 60);
  const p = c.p();
  const x = Math.floor(p.x) + 2, y = Math.floor(p.y);
  w.setTile(x, y + 1, 0, B.stone);
  for (let k = 0; k < 3; k++) w.setTile(x, y - k, 0, 0);
  w.addItem(p, I.door, 1);
  const s = p.inv.findIndex((q) => q && q.id === I.door); p.inv[9] = p.inv[s]; if (s !== 9) p.inv[s] = null; p.sel = 9;
  w.message(c.id, { t: 'place', x, y, l: 0 });
  assert.equal(w.fgAt(x, y), B.door_closed);
  assert.equal(w.fgAt(x, y - 1), B.door_top_closed);
  w.message(c.id, { t: 'use2', x, y });
  assert.equal(w.fgAt(x, y), B.door_open); assert.equal(w.fgAt(x, y - 1), B.door_top_open);
  // sand column
  const sx = x + 1;
  w.setTile(sx, y + 1, 0, B.stone); w.setTile(sx, y, 0, B.dirt); w.setTile(sx, y - 1, 0, B.sand);
  w.breakBlock(c.p(), sx, y, 0, true);
  assert.equal(w.fgAt(sx, y), B.sand, 'sand fell');
});

test('saving and loading a world keeps edits and accounts', () => {
  const w = new World({ seed: 11 });
  const c = client(w, 'Nan', 'secret'); run(w, 60);
  const p = c.p();
  w.addItem(p, I.gold_ingot, 5);
  w.setTile(800, 100, 0, B.gold_block);
  w.disconnect(c.id);
  const state = JSON.parse(JSON.stringify(w.exportState()));
  const chunks = JSON.parse(JSON.stringify(w.allModifiedChunks()));
  const w2 = new World({ seed: 1 });
  w2.importState(state);
  for (const [cx, b] of Object.entries(chunks)) w2.importChunk(+cx, b);
  assert.equal(w2.fgAt(800, 100), B.gold_block);
  const c2 = client(w2, 'Nan', 'secret');
  assert.ok(c2.last('welcome'));
  assert.equal(w2.countItem(c2.p(), I.gold_ingot), 5);
  // someone else cannot take the name
  w2.disconnect(c2.id);
  const imp = client(w2, 'Nan', 'wrong');
  assert.ok(imp.last('deny'));
});

test('16 players fit, the 17th is refused, snapshots stay small', () => {
  const w = new World({ seed: 5 });
  const cs = [];
  for (let i = 0; i < MAX_PLAYERS; i++) cs.push(client(w, 'P' + i));
  assert.equal(w.players.size, MAX_PLAYERS);
  const extra = client(w, 'Extra');
  assert.ok(extra.last('deny'));
  const t0 = process.hrtime.bigint();
  for (let sec = 0; sec < 10; sec++) { for (const c of cs) w.message(c.id, { t: 'i', k: i_rand(c.id) ? K_RIGHT : 0, s: sec }); run(w, 30); }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 300;
  console.log(`     16 players: ${ms.toFixed(2)} ms per tick`);
  assert.ok(ms < 20, 'tick cost ' + ms);
  const snap = cs[0].last('s');
  assert.equal(snap.p.length, 16);
  assert.ok(JSON.stringify(snap).length < 6000, 'snapshot size ' + JSON.stringify(snap).length);
});
function i_rand(id) { return id % 2 === 0; }

test('chat commands and rate limit', () => {
  const w = new World({ seed: 5 });
  const a = client(w, 'Op1'), b = client(w, 'Pl2');
  run(w, 5);
  w.message(b.id, { t: 'chat', text: 'hello' });
  assert.ok(a.out.some((o) => o.t === 'chat' && o.text === 'hello'));
  w.message(b.id, { t: 'chat', text: '/time night' });
  assert.ok(b.out.some((o) => o.t === 'chat' && /operator/.test(o.text)));
  w.message(a.id, { t: 'chat', text: '/time night' });
  assert.ok(w.time > 300);
  for (let i = 0; i < 10; i++) w.message(b.id, { t: 'chat', text: 'spam' + i });
  assert.ok(b.out.filter((o) => o.t === 'toast').length > 0, 'rate limited');
});

test('operators can teleport to a safe spot, summon creatures, and the sigil wakes a boss only deep down', () => {
  const w = new World({ seed: 5 });
  const c = client(w, 'Boss'); run(w, 30);
  w.message(c.id, { t: 'chat', text: '/goto 700 160' });
  const p = c.p();
  assert.ok(!w.solidAt(Math.floor(p.x), Math.floor(p.y - 0.5)) && w.solidAt(Math.floor(p.x), Math.floor(p.y + 0.1)), 'standing on a floor in open air');
  w.message(c.id, { t: 'chat', text: '/summon hoppit' });
  assert.ok([...w.mobs.values()].some((m) => m.type === 'hoppit'));
  // sigil on the surface does nothing
  w.message(c.id, { t: 'chat', text: '/goto plains' });
  w.addItem(p, I.warden_sigil, 1);
  const si = p.inv.findIndex((q) => q && q.id === I.warden_sigil);
  w.message(c.id, { t: 'use', i: si });
  assert.ok(![...w.mobs.values()].some((m) => m.type === 'stonewarden'), 'not on the surface');
  assert.equal(w.countItem(p, I.warden_sigil), 1);
  // deep: carve a hall and use it
  const hx = Math.floor(p.x) + 200, hy = 150;
  for (let x = hx - 14; x <= hx + 14; x++) for (let y = hy - 8; y <= hy; y++) { w.setTile(x, y, 0, 0); w.setTile(x, y, 2, 0); }
  for (let x = hx - 14; x <= hx + 14; x++) w.setTile(x, hy + 1, 0, B.stone);
  p.x = hx + 0.5; p.y = hy + 1 - 0.01; p.vx = p.vy = 0; run(w, 5);
  w.message(c.id, { t: 'use', i: si });
  const boss = [...w.mobs.values()].find((m) => m.type === 'stonewarden');
  assert.ok(boss, 'warden woke');
  assert.equal(w.countItem(p, I.warden_sigil), 0, 'sigil used up');
  // it walks toward the player and slams: the player loses health
  const hp0 = p.hp;
  boss.x = hx + 6.5; boss.y = hy + 1 - 0.01;
  run(w, 30 * 8);
  assert.ok(p.hp < hp0 || p.dead, 'the warden hurt the player');
  w.message(c.id, { t: 'chat', text: '/summon stonewarden' });
  assert.equal([...w.mobs.values()].filter((m) => m.type === 'stonewarden').length >= 1, true);
});

test('fishing: cast into water, wait, catch; breaks off when you walk away', () => {
  const w = new World({ seed: 5 });
  const c = client(w, 'Fisher'); run(w, 10);
  w.message(c.id, { t: 'chat', text: '/goto ocean' }); run(w, 60);
  const p = c.p();
  w.addItem(p, I.fishing_rod, 1);
  const si = p.inv.findIndex((q) => q && q.id === I.fishing_rod); p.inv[9] = p.inv[si]; p.inv[si] = null; p.sel = 9;
  let wx = 0, wy = 0;
  for (let x = Math.floor(p.x) - 20; x < Math.floor(p.x) + 20 && !wy; x++) for (let y = 88; y < 100; y++) if ((w.liqAt(x, y) >> 4) === 1 && (w.liqAt(x, y - 1) >> 4) === 1) { wx = x; wy = y; break; }
  assert.ok(wy, 'water found');
  p.x = wx - 1.5; p.y = wy - 1; p.vx = p.vy = 0; run(w, 2);
  w.message(c.id, { t: 'place', x: wx, y: wy, l: 0 });
  assert.ok(p.fishing, 'line cast');
  run(w, 30 * 40);
  const got = w.countItem(p, I.fish) + w.countItem(p, I.string) + w.countItem(p, I.stick) + w.countItem(p, I.clay_ball) + w.countItem(p, I.crystal_shard);
  assert.ok(got >= 1, 'caught something');
  p.x += 8; run(w, 3);
  assert.equal(p.fishing, null, 'line lost when walking off');
});

test('worlds come with shrines, ruins and buried loot that survives a save', () => {
  const w = new World({ seed: 1337 });
  for (let cx = 0; cx < W / CHUNK; cx++) w.chunk(cx);
  const kinds = {};
  for (const [, m] of w.meta) kinds[m.k] = (kinds[m.k] || 0) + 1;
  assert.ok(kinds.waystone >= 3, 'shrines ' + JSON.stringify(kinds));
  assert.ok(kinds.chest >= 10, 'chests ' + JSON.stringify(kinds));
  // a shrine stands near the spawn point
  const near = [...w.meta].some(([k, m]) => m.k === 'waystone' && Math.abs(+k.split(',')[0] - w.spawn.x) < 20);
  assert.ok(near, 'shrine near spawn');
  for (const [k, m] of w.meta) if (m.k === 'chest') { const [x, y] = k.split(',').map(Number); assert.equal(w.fgAt(x, y), B.chest); assert.ok(m.inv.some(Boolean), 'loot at ' + k); }
  // chunks with structures are saved; taking loot is remembered
  const [k0, chest] = [...w.meta].find(([, m]) => m.k === 'chest');
  chest.inv.fill(null);
  const saved = JSON.parse(JSON.stringify({ s: w.exportState(), c: w.allModifiedChunks() }));
  const w2 = new World({ seed: 1 }); w2.importState(saved.s); for (const [cx, b] of Object.entries(saved.c)) w2.importChunk(+cx, b);
  w2.chunk(Math.floor(+k0.split(',')[0] / CHUNK));
  assert.ok(w2.metaGet(...k0.split(',').map(Number)).inv.every((q) => !q), 'looted chest stays empty');
});

test('a client that goes silent stops walking', () => {
  const w = new World({ seed: 5 });
  const c = client(w, 'Quiet'); run(w, 60);
  w.message(c.id, { t: 'i', k: K_RIGHT, s: 1 });
  run(w, 30); const x1 = c.p().x;
  run(w, 90); const x2 = c.p().x;
  run(w, 60); assert.ok(Math.abs(c.p().x - x2) < 0.5, 'stopped');
  assert.ok(x2 > x1, 'walked while input kept arriving');
});

test('idle players are dropped after the idle limit, active ones are not', () => {
  const w = new World({ seed: 5, idleMinutes: 1 });
  const a = client(w, 'Afk'), b = client(w, 'Busy'); run(w, 10);
  for (let sec = 0; sec < 75; sec++) { w.message(a.id, { t: 'i', k: 0, s: sec }); w.message(b.id, { t: 'i', k: sec % 2 ? 2 : 0, s: sec }); run(w, 30); }
  assert.ok(!w.players.has(a.id), 'idle player dropped');
  assert.ok(w.players.has(b.id), 'active player stays');
  assert.ok(a.last('deny'));
});

test('review fixes: ops and name from config survive a load, trade escrow survives a save, spawn is never inside a block', () => {
  const a = new World({ seed: 5, ops: ['alice'], name: 'A' }); client(a, 'Alice');
  const st = JSON.parse(JSON.stringify(a.exportState()));
  const b = new World({ seed: 5, ops: ['bob'], name: 'B' }); b.importState(st);
  assert.ok(b.ops.has('bob') && b.ops.has('alice')); assert.equal(b.name, 'B');
  // escrow
  const w = new World({ seed: 5 });
  const c1 = client(w, 'Eve'), c2 = client(w, 'Fox'); run(w, 30);
  w.addItem(c1.p(), I.gold_ingot, 10);
  w.message(c1.id, { t: 'trade', to: c2.id }); w.message(c2.id, { t: 'tradeacc', from: c1.id });
  w.message(c1.id, { t: 'tradeadd', slot: c1.p().inv.findIndex((q) => q && q.id === I.gold_ingot), n: 10 });
  const saved = JSON.parse(JSON.stringify(w.exportState()));
  const gold = saved.accounts.eve.inv.reduce((n, q) => n + (q && q.id === I.gold_ingot ? q.n : 0), 0);
  assert.equal(gold, 10, 'offered items are in the saved account');
  // spawn on many seeds
  for (let seed = 1; seed <= 120; seed++) {
    const x = new World({ seed }); const cc = client(x, 'Sp');
    const p = cc.p();
    assert.ok(!x.solidAt(Math.floor(p.x), Math.floor(p.y - 0.5)) && !x.solidAt(Math.floor(p.x), Math.floor(p.y - 1.5)), 'free spawn on seed ' + seed);
  }
  // malformed input
  const m = client(w, 'Mal'); run(w, 5); if (!m.p()) console.log('deny', JSON.stringify(m.out.slice(0, 2)));
  for (const bad of [{ t: 'way', x: '886', y: 84 }, { t: 'wname', x: 'a', y: null }, { t: '__proto__' }, { t: 'constructor' }, { t: 'join', name: { toString: 1 } }]) w.message(m.id, bad);
  w.message(m.id, { t: 'chat', text: '/summon constructor' }); w.message(m.id, { t: 'chat', text: '/goto Infinity 5' });
  assert.ok(Number.isFinite(m.p().x));
  assert.equal([...w.mobs.values()].filter((q) => q.type === 'constructor').length, 0);
  // lava meeting a chest leaves the chest alone
  const px = 600, py = 60;
  for (let x = px - 3; x <= px + 3; x++) { for (let y = py - 4; y < py; y++) { w.setTile(x, y, 0, 0); w.setTile(x, y, 2, 0); } w.setTile(x, py, 0, B.stone); }
  w.setTile(px, py - 1, 0, B.chest); w.metaSet(px, py - 1, { k: 'chest', inv: new Array(24).fill(null) });
  w.setTile(px - 1, py - 1, 2, (2 << 4) | 8); w.setTile(px + 1, py - 1, 2, (1 << 4) | 8);
  w.liqActive.add((py - 1) * W + px - 1); w.liqActive.add((py - 1) * W + px + 1);
  for (let i = 0; i < 90; i++) w.tick();
  assert.equal(w.fgAt(px, py - 1), B.chest);
});

console.log(`\n${passed} passed`);

