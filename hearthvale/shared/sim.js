// Hearthvale authoritative simulation. Pure JS, no DOM, no timers: the server and the
// solo client both drive it with tick(W, dt) and command(W, pid, cmd).
import {
  GOODS, PLOT, MAX_PLAYERS, VILLAGE_RING, LEVEL_XP, MAX_LEVEL, BUILDINGS, RECIPES, TECH,
  NODE_TYPES, VALLEY_FIELDS, VALLEY_FIELD_RADIUS, VALLEY_LEVEL_XP, QUESTS, SELL,
} from './data.js';

export const COLORS = ['#e8564a', '#3d8bd8', '#f2b632', '#52b56a', '#a65bd6', '#ef7fb0', '#31b5b0', '#f08a3a',
  '#7a8cf0', '#b5c93a', '#d9604f', '#4f6bb3', '#c9962f', '#2f8f6b', '#8a4fb0', '#a0a0a8'];
const VILLAGER_NAMES = ['Bram', 'Wren', 'Tilda', 'Odo', 'Pip', 'Mara', 'Finn', 'Hazel', 'Rook', 'Elsa', 'Tobin', 'Nell',
  'Jory', 'Sage', 'Alder', 'Posy', 'Cato', 'Lark', 'Moss', 'Daisy', 'Hobb', 'Ivy', 'Barley', 'Clover'];
const SPEED = 3, WORK_RANGE = 0.35, TICK_CAP = 0.5, HUNGER_MAX = 100;

export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function createWorld(seed = 1) {
  const W = { v: 1, seed, t: 0, nextId: 1, rnd: rng(seed), players: {}, slots: new Array(MAX_PLAYERS).fill(null), chat: [], events: [],
    valley: { xp: 0, level: 1, orders: [], fields: VALLEY_FIELDS.map(f => ({ id: f.id, stock: f.max * 0.6 })), nextOrderAt: 0 } };
  while (W.valley.orders.length < ordersFor(1)) W.valley.orders.push(makeOrder(W));
  return W;
}
const uid = (W) => W.nextId++;
export const ordersFor = (lvl) => 3 + Math.min(lvl, 6);
export const slotOrigin = (slot) => {
  const a = (slot / MAX_PLAYERS) * Math.PI * 2 - Math.PI / 2;
  return { ox: Math.cos(a) * VILLAGE_RING, oz: Math.sin(a) * VILLAGE_RING, ang: a };
};
export const levelOf = (xp) => { let l = 1; for (let i = 1; i < MAX_LEVEL; i++) if (xp >= LEVEL_XP[i]) l = i + 1; return l; };
export const tileToWorld = (P, tx, ty) => ({ x: P.ox + tx - PLOT / 2, z: P.oz + ty - PLOT / 2 });

function makeOrder(W) {
  const lvl = W.valley.level, r = W.rnd;
  const pool = ['wood', 'clay', 'stone', 'wheat', 'planks', 'bricks', 'soup', 'flour', 'bread'].filter(g => lvl >= 3 || !['flour', 'bread'].includes(g));
  const n = 1 + (r() < 0.5 + lvl * 0.05 ? 1 : 0) + (lvl >= 4 && r() < 0.3 ? 1 : 0);
  const need = {}, got = {};
  for (let i = 0; i < n; i++) {
    const g = pool[Math.floor(r() * pool.length)];
    if (need[g]) continue;
    const base = { wood: 40, clay: 30, stone: 24, wheat: 36, planks: 14, bricks: 10, soup: 8, flour: 10, bread: 6 }[g];
    need[g] = Math.max(2, Math.round(base * (1 + lvl * 0.35) * (0.7 + r() * 0.6)));
    got[g] = 0;
  }
  const value = Object.entries(need).reduce((s, [g, c]) => s + c * SELL[g], 0);
  return { id: uid(W), need, got, contrib: {}, reward: { coins: Math.round(value * 0.6), scrolls: 1 + Math.floor(value / 120), xp: Math.round(value * 0.5) }, done: false, doneAt: 0 };
}

// ---------- players ----------
export function addPlayer(W, id, name) {
  if (W.players[id]) { W.players[id].online = true; if (name) W.players[id].name = name.slice(0, 16); return W.players[id]; }
  const slot = W.slots.indexOf(null);
  if (slot < 0) return null;
  W.slots[slot] = id;
  const { ox, oz, ang } = slotOrigin(slot);
  const P = { id, name: (name || 'Villager').slice(0, 16), color: COLORS[slot], slot, ox, oz, ang, online: true, joined: W.t,
    res: { wood: 40, clay: 10, stone: 10, wheat: 10, planks: 0, bricks: 0, flour: 0, bread: 0, soup: 6, scrolls: 0 }, coins: 50,
    xp: 0, level: 1, buildings: [], villagers: [], nodes: [], tech: {}, stats: {}, questsDone: {}, popups: [], rev: 1, vrev: 1 };
  const r = rng(W.seed * 977 + slot * 131 + 7);
  W.players[id] = P;
  const hall = { id: uid(W), type: 'hall', x: 6, y: 6, w: 3, h: 3, built: true, progress: 1, queue: [], lvl: 1 };
  P.buildings.push(hall);
  for (let i = 0; i < 18; i++) {
    const type = i < 8 ? 'tree' : i < 12 ? 'clay' : 'rock';
    for (let tries = 0; tries < 30; tries++) {
      const x = Math.floor(r() * PLOT), y = Math.floor(r() * PLOT);
      if (!freeRect(P, x, y, 1, 1, 1)) continue;
      const edge = x < 4 || y < 4 || x > PLOT - 5 || y > PLOT - 5;
      if (!edge && r() < 0.8) continue;
      P.nodes.push({ id: uid(W), type, x, y, amount: NODE_TYPES[type].amount, regrowAt: 0 });
      break;
    }
  }
  for (let i = 0; i < 3; i++) spawnVillager(W, P);
  return P;
}
export function removePlayer(W, id, forget = false) {
  const P = W.players[id]; if (!P) return;
  P.online = false;
  if (forget) { W.slots[P.slot] = null; delete W.players[id]; }
}
function spawnVillager(W, P) {
  const hall = P.buildings[0], c = tileToWorld(P, hall.x + 1.5, hall.y + 3.5);
  const v = { id: uid(W), name: VILLAGER_NAMES[(W.nextId * 7) % VILLAGER_NAMES.length], x: c.x + (W.rnd() - 0.5) * 2, z: c.z + (W.rnd() - 0.5), hunger: HUNGER_MAX, task: null, state: 'idle', work: 0, hat: Math.floor(W.rnd() * 6), carry: null };
  P.villagers.push(v); P.vrev++;
  return v;
}

// ---------- grid ----------
function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) { return ax < bx + bw && bx < ax + aw && ay < by + bh && by < ay + ah; }
export function freeRect(P, x, y, w, h, margin = 0, ignoreId = null) {
  if (x < 0 || y < 0 || x + w > PLOT || y + h > PLOT) return false;
  for (const b of P.buildings) if (b.id !== ignoreId && rectsOverlap(x, y, w, h, b.x - margin, b.y - margin, b.w + margin * 2, b.h + margin * 2)) return false;
  for (const n of P.nodes) if (rectsOverlap(x, y, w, h, n.x, n.y, 1, 1)) return false;
  return true;
}

export function findSpot(P, w, h, margin = 0) {
  for (let r = 0; r < PLOT; r++) for (let y = 0; y + h <= PLOT; y++) for (let x = 0; x + w <= PLOT; x++) {
    if (Math.max(Math.abs(x - 6), Math.abs(y - 6)) < 3 + r * 0 && false) continue;
    if (freeRect(P, x, y, w, h, margin)) return { x, y };
  }
  return null;
}
// ---------- helpers ----------
export const capOf = (P) => 100 + P.buildings.filter(b => b.type === 'storehouse' && b.built).length * 100 + (P.tech.sturdy ? 60 : 0);
export const housingOf = (P) => 3 + P.buildings.filter(b => b.type === 'house' && b.built).length * 2;
export const hireCost = (P) => ({ soup: 3 + Math.max(0, P.villagers.length - 3) * 3 });
export const hasTech = (P, t) => !t || !!P.tech[t];
function popup(P, text, x, z) { P.popups.push({ text, x, z }); if (P.popups.length > 20) P.popups.shift(); }
function bump(P, stat, n = 1) { P.stats[stat] = (P.stats[stat] || 0) + n; }
function canPay(P, cost) { for (const [k, n] of Object.entries(cost)) if ((k === 'coins' ? P.coins : P.res[k]) < n) return false; return true; }
function pay(P, cost) { for (const [k, n] of Object.entries(cost)) { if (k === 'coins') P.coins -= n; else P.res[k] -= n; } }
function give(P, k, n) {
  if (k === 'coins') { P.coins += n; return n; }
  const room = Math.max(0, capOf(P) - P.res[k]); const g = Math.min(room, n);
  P.res[k] += g; return g;
}
function addXp(W, P, n) {
  P.xp += n; const l = levelOf(P.xp);
  if (l > P.level) { P.level = l; bump(P, 'level', 0); P.stats.level = l; W.events.push({ t: 'levelup', pid: P.id, level: l }); P.rev++; }
}
const building = (P, id) => P.buildings.find(b => b.id === id);

// ---------- commands ----------
export function command(W, pid, c) {
  const P = W.players[pid]; if (!P || !c || typeof c.op !== 'string') return { ok: false, err: 'no player' };
  const fn = OPS[c.op]; if (!fn) return { ok: false, err: 'unknown op' };
  let r; try { r = fn(W, P, c) || { ok: true }; } catch (e) { return { ok: false, err: 'error' }; }
  if (r.ok !== false) P.rev++;
  return r;
}
const own = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
const num = (x) => Number.isFinite(x) ? Math.floor(x) : NaN;
const OPS = {
  place(W, P, c) {
    if (!own(BUILDINGS, c.type)) return { ok: false, err: 'unknown building' };
    const d = BUILDINGS[c.type]; if (d.hidden) return { ok: false, err: 'unknown building' };
    const x = num(c.x), y = num(c.y); if (isNaN(x) || isNaN(y)) return { ok: false, err: 'bad pos' };
    if (P.level < d.lvl) return { ok: false, err: 'level ' + d.lvl + ' needed' };
    if (!hasTech(P, d.tech)) return { ok: false, err: 'research ' + TECH[d.tech].name };
    if (!d.decor && !d.field && P.buildings.filter(b => b.type === c.type).length >= 6 && c.type !== 'house') return { ok: false, err: 'limit reached' };
    if (P.buildings.length >= 90) return { ok: false, err: 'village is full' };
    if (!freeRect(P, x, y, d.w, d.h, 0)) return { ok: false, err: 'blocked' };
    if (!canPay(P, d.cost)) return { ok: false, err: 'not enough resources' };
    pay(P, d.cost);
    const b = { id: uid(W), type: c.type, x, y, w: d.w, h: d.h, built: false, progress: 0, queue: [], lvl: 1 };
    if (d.field) { b.crop = 0; b.stage = 'empty'; }
    P.buildings.push(b);
    // assign the nearest idle villager to build it
    const v = nearestIdle(P, b); if (v) setTask(v, { k: 'bld', id: b.id });
    return { ok: true, id: b.id };
  },
  move(W, P, c) {
    const b = building(P, c.id); if (!b || b.type === 'hall') return { ok: false, err: 'no such building' };
    const x = num(c.x), y = num(c.y);
    if (!freeRect(P, x, y, b.w, b.h, 0, b.id)) return { ok: false, err: 'blocked' };
    b.x = x; b.y = y;
  },
  demolish(W, P, c) {
    const b = building(P, c.id); if (!b || b.type === 'hall') return { ok: false, err: 'no such building' };
    const d = BUILDINGS[b.type];
    if (!b.built) for (const [k, n] of Object.entries(d.cost)) give(P, k, Math.floor(n * 0.8));
    else for (const [k, n] of Object.entries(d.cost)) give(P, k, Math.floor(n * 0.3));
    P.buildings.splice(P.buildings.indexOf(b), 1);
    for (const v of P.villagers) if (v.task && v.task.k === 'bld' && v.task.id === b.id) clearTask(v);
  },
  assign(W, P, c) {
    const v = P.villagers.find(v => v.id === c.vid) || null;
    let task;
    if (c.k === 'node') { if (!P.nodes.find(n => n.id === c.id)) return { ok: false, err: 'gone' }; task = { k: 'node', id: c.id }; }
    else if (c.k === 'bld') { const b = building(P, c.id); if (!b) return { ok: false, err: 'gone' }; task = { k: 'bld', id: c.id }; }
    else if (c.k === 'valley') { if (!VALLEY_FIELDS.find(f => f.id === c.id)) return { ok: false, err: 'gone' }; task = { k: 'valley', id: c.id }; }
    else return { ok: false, err: 'bad task' };
    const who = v || nearestIdleTo(P, task, W);
    if (!who) return { ok: false, err: 'no free villager' };
    setTask(who, task);
    return { ok: true, vid: who.id };
  },
  recall(W, P, c) { const v = P.villagers.find(v => v.id === c.vid); if (!v) return { ok: false }; clearTask(v); },
  queue(W, P, c) {
    const b = building(P, c.id); const d = b && BUILDINGS[b.type];
    if (!b || !b.built || !d.craft) return { ok: false, err: 'cannot craft' };
    const r = c.recipe;
    if (!d.craft.includes(r) || !own(RECIPES, r)) return { ok: false, err: 'wrong recipe' };
    const n = Math.max(1, Math.min(10, num(c.n) || 1));
    if (b.queue.reduce((s, q) => s + q.n, 0) + n > 20) return { ok: false, err: 'queue full' };
    const last = b.queue[b.queue.length - 1];
    if (last && last.recipe === r && !last.started) last.n += n; else b.queue.push({ recipe: r, n, left: 0, started: false });
    const v = nearestIdle(P, b); if (v && !P.villagers.some(w => w.task && w.task.k === 'bld' && w.task.id === b.id)) setTask(v, { k: 'bld', id: b.id });
  },
  dequeue(W, P, c) {
    const b = building(P, c.id); if (!b || !b.queue[c.i]) return { ok: false };
    const q = b.queue[c.i];
    if (q.started) { for (const [k, n] of Object.entries(RECIPES[q.recipe].in)) give(P, k, n); }
    b.queue.splice(c.i, 1);
  },
  research(W, P, c) {
    const t = own(TECH, c.tech) ? TECH[c.tech] : null, b = building(P, c.id);
    if (!t || P.tech[c.tech] || !b || b.type !== 'study' || !b.built) return { ok: false, err: 'cannot research' };
    if (b.research) return { ok: false, err: 'busy' };
    if (P.res.scrolls < t.scrolls) return { ok: false, err: 'need ' + t.scrolls + ' scrolls' };
    P.res.scrolls -= t.scrolls; b.research = { tech: c.tech, left: t.time };
    const v = nearestIdle(P, b); if (v) setTask(v, { k: 'bld', id: b.id });
  },
  hire(W, P) {
    if (P.villagers.length >= housingOf(P)) return { ok: false, err: 'build more cottages' };
    const cost = hireCost(P); if (!canPay(P, cost)) return { ok: false, err: 'need ' + cost.soup + ' soup' };
    pay(P, cost); spawnVillager(W, P); bump(P, 'hired');
  },
  sell(W, P, c) {
    if (!P.buildings.some(b => b.type === 'market' && b.built)) return { ok: false, err: 'build a Market' };
    if (!GOODS.includes(c.res)) return { ok: false };
    const n = Math.min(num(c.n) || 0, P.res[c.res]); if (!(n > 0)) return { ok: false };
    P.res[c.res] -= n; P.coins += n * SELL[c.res]; bump(P, 'sold', n);
  },
  contribute(W, P, c) {
    const o = W.valley.orders.find(o => o.id === c.id); if (!o || o.done || !own(o.need, c.res)) return { ok: false, err: 'not needed' };
    const n = Math.min(num(c.n) || 0, P.res[c.res], o.need[c.res] - o.got[c.res]); if (!(n > 0)) return { ok: false, err: 'nothing to give' };
    P.res[c.res] -= n; o.got[c.res] += n; o.contrib[P.id] = (o.contrib[P.id] || 0) + n * SELL[c.res]; bump(P, 'gave', n);
    if (Object.keys(o.need).every(k => o.got[k] >= o.need[k])) finishOrder(W, o);
  },
  chat(W, P, c) {
    const text = String(c.text || '').slice(0, 120).trim(); if (!text) return { ok: false };
    W.chat.push({ t: W.t, pid: P.id, name: P.name, color: P.color, text }); if (W.chat.length > 60) W.chat.shift();
  },
  emote(W, P, c) { W.events.push({ t: 'emote', pid: P.id, e: String(c.e || '').slice(0, 4) }); },
  rename(W, P, c) { P.name = String(c.name || '').slice(0, 16) || P.name; },
};
function finishOrder(W, o) {
  o.done = true; o.doneAt = W.t;
  const total = Object.values(o.contrib).reduce((s, n) => s + n, 0) || 1;
  for (const [pid, share] of Object.entries(o.contrib)) {
    const P = W.players[pid]; if (!P) continue;
    const f = share / total;
    give(P, 'coins', Math.round(o.reward.coins * f)); P.res.scrolls = Math.min(capOf(P), P.res.scrolls + Math.round(o.reward.scrolls * f + 0.4)); addXp(W, P, Math.round(o.reward.xp * f));
    popup(P, 'Order done! +' + Math.round(o.reward.coins * f) + '🪙', P.ox, P.oz);
  }
  const V = W.valley; V.xp += o.reward.xp;
  while (V.level < VALLEY_LEVEL_XP.length && V.xp >= VALLEY_LEVEL_XP[V.level]) { V.level++; W.events.push({ t: 'valleylevel', level: V.level }); }
  W.events.push({ t: 'order', id: o.id });
}

// ---------- villagers ----------
function setTask(v, task) { v.task = task; v.work = 0; v.state = 'walk'; v.idleFor = 0; }
function clearTask(v) { v.task = null; v.work = 0; v.state = 'idle'; }
function nearestIdle(P, b) {
  const c = tileToWorld(P, b.x + b.w / 2, b.y + b.h / 2); let best = null, bd = 1e9;
  for (const v of P.villagers) if (!v.task) { const d = Math.hypot(v.x - c.x, v.z - c.z); if (d < bd) { bd = d; best = v; } }
  return best;
}
function nearestIdleTo(P, task, W) {
  const pos = targetPos(W, P, task); if (!pos) return null;
  let best = null, bd = 1e9;
  for (const v of P.villagers) if (!v.task) { const d = Math.hypot(v.x - pos.x, v.z - pos.z); if (d < bd) { bd = d; best = v; } }
  return best;
}
export function valleyFieldPos(f) { return { x: Math.cos(f.ang) * VALLEY_FIELD_RADIUS, z: Math.sin(f.ang) * VALLEY_FIELD_RADIUS }; }
function targetPos(W, P, t) {
  if (t.k === 'node') { const n = P.nodes.find(n => n.id === t.id); return n && tileToWorld(P, n.x + 0.5, n.y + 1.4); }
  if (t.k === 'bld') { const b = building(P, t.id); return b && tileToWorld(P, b.x + b.w / 2, b.y + b.h + 0.6); }
  if (t.k === 'valley') { const f = VALLEY_FIELDS.find(f => f.id === t.id); if (!f) return null; const p = valleyFieldPos(f); const d = Math.hypot(p.x - P.ox, p.z - P.oz) || 1; return { x: p.x + (P.ox - p.x) / d * 2.5, z: p.z + (P.oz - p.z) / d * 2.5 }; }
  return null;
}
function feed(P, v) {
  if (v.hunger > 30) return true;
  if (P.res.soup > 0) { P.res.soup--; v.hunger = Math.min(HUNGER_MAX, v.hunger + (P.tech.hearty ? 100 : 55)); P.rev++; return true; }
  return v.hunger > 0;
}
function stepVillager(W, P, v, dt) {
  if (!v.task) {
    v.state = 'idle';
    if (v.hunger < HUNGER_MAX && v.hunger < 70 && P.res.soup > 0) feed(P, v);
    return;
  }
  const pos = targetPos(W, P, v.task);
  if (!pos) { clearTask(v); return; }
  const speed = SPEED * (P.tech.swift ? 1.3 : 1);
  const dx = pos.x - v.x, dz = pos.z - v.z, d = Math.hypot(dx, dz);
  if (d > WORK_RANGE) {
    const s = Math.min(d, speed * dt); v.x += dx / d * s; v.z += dz / d * s; v.state = 'walk'; v.face = Math.atan2(dx, dz); return;
  }
  if (!feed(P, v)) { v.state = 'hungry'; return; }
  const t = v.task;
  if (t.k === 'node' || t.k === 'valley') {
    v.state = 'work';
    const def = t.k === 'node' ? NODE_TYPES[P.nodes.find(n => n.id === t.id).type] : VALLEY_FIELDS.find(f => f.id === t.id);
    v.work += dt; v.hunger -= dt * 1.1;
    if (v.work < def.time) return;
    v.work = 0;
    let amt = def.yield + (P.tech.keen ? 1 : 0);
    if (t.k === 'node') {
      const n = P.nodes.find(n => n.id === t.id);
      amt = Math.min(amt, n.amount);
      const g = give(P, def.res, amt);
      if (g === 0) { v.state = 'full'; popup(P, 'Storage full', v.x, v.z); clearTask(v); return; }
      n.amount -= amt; bump(P, def.res, g); addXp(W, P, 1); popup(P, '+' + g + ICONS[def.res], v.x, v.z);
      if (n.amount <= 0) { n.amount = 0; n.regrowAt = W.t + def.regrow; clearTask(v); }
    } else {
      const f = W.valley.fields.find(f => f.id === t.id);
      amt = Math.min(amt, Math.floor(f.stock));
      if (amt <= 0) { popup(P, 'Field is empty', v.x, v.z); clearTask(v); return; }
      const g = give(P, def.res, amt);
      if (g === 0) { popup(P, 'Storage full', v.x, v.z); clearTask(v); return; }
      f.stock -= g; bump(P, def.res, g); addXp(W, P, 1); popup(P, '+' + g + ICONS[def.res], v.x, v.z);
    }
    return;
  }
  if (t.k === 'bld') {
    const b = building(P, t.id); const d = BUILDINGS[b.type] || {};
    v.hunger -= dt * 1.1;
    if (!b.built) {
      v.state = 'build'; b.progress += dt / d.build;
      if (b.progress >= 1) { b.progress = 1; b.built = true; bump(P, 'b_' + b.type); addXp(W, P, d.xp || 5); popup(P, d.name + ' ready!', v.x, v.z); W.events.push({ t: 'built', pid: P.id, id: b.id }); P.rev++; clearTask(v); }
      return;
    }
    if (d.field) {
      if (b.stage === 'empty') { v.state = 'work'; v.work += dt; if (v.work >= 4) { v.work = 0; b.stage = 'grow'; b.crop = 0; P.rev++; } return; }
      if (b.stage === 'grow') { clearTask(v); return; }
      if (b.stage === 'ripe') { v.state = 'work'; v.work += dt; if (v.work >= 4) { v.work = 0; const g = give(P, 'wheat', 6 + (P.tech.keen ? 2 : 0)); bump(P, 'wheat', g); addXp(W, P, 3); popup(P, '+' + g + '🌾', v.x, v.z); b.stage = 'empty'; b.crop = 0; P.rev++; if (g === 0) popup(P, 'Storage full', v.x, v.z); clearTask(v); } return; }
    }
    if (b.type === 'study' && b.research) {
      v.state = 'work'; b.research.left -= dt;
      if (b.research.left <= 0) { P.tech[b.research.tech] = true; popup(P, TECH[b.research.tech].name + ' learned!', v.x, v.z); addXp(W, P, 15); b.research = null; P.rev++; if (!b.queue.length) clearTask(v); }
      return;
    }
    if (b.queue.length) {
      const q = b.queue[0], r = RECIPES[q.recipe];
      if (!q.started) {
        if (!canPay(P, r.in)) { v.state = 'blocked'; v.idleFor = (v.idleFor || 0) + dt; if (v.idleFor > 8) { popup(P, 'Missing ingredients', v.x, v.z); clearTask(v); } return; }
        pay(P, r.in); q.started = true; q.left = r.time;
      }
      v.idleFor = 0; v.state = 'work'; q.left -= dt;
      if (q.left <= 0) {
        const g = give(P, q.recipe, r.out); bump(P, 'c_' + q.recipe, g); addXp(W, P, r.xp); popup(P, '+' + g + ICONS[q.recipe], v.x, v.z);
        q.n--; q.started = false; if (q.n <= 0) b.queue.shift(); P.rev++;
      }
      return;
    }
    clearTask(v);
  }
}
const ICONS = { wood: '🪵', clay: '🧱', stone: '🪨', wheat: '🌾', planks: '📏', bricks: '🏺', flour: '🥣', bread: '🍞', soup: '🍲', scrolls: '📜' };

// ---------- tick ----------
export function tick(W, dt) {
  dt = Math.min(dt, TICK_CAP); W.t += dt;
  for (const P of Object.values(W.players)) {
    for (const v of P.villagers) stepVillager(W, P, v, dt);
    for (const b of P.buildings) {
      if (b.stage === 'grow') { b.crop += dt / 30; if (b.crop >= 1) { b.crop = 1; b.stage = 'ripe'; P.rev++; } }
    }
    for (const n of P.nodes) if (n.amount <= 0 && W.t >= n.regrowAt) { n.amount = NODE_TYPES[n.type].amount; P.rev++; }
    // quests
    P.stats.level = P.level;
    for (const q of QUESTS) {
      if (P.questsDone[q.id]) continue;
      if ((P.stats[q.stat] || 0) >= q.n) { P.questsDone[q.id] = true; for (const [k, n] of Object.entries(q.reward)) give(P, k, n); popup(P, 'Quest done: ' + q.text, P.ox, P.oz); W.events.push({ t: 'quest', pid: P.id }); P.rev++; }
    }
    // villagers that have nothing to do for a long time just stand
    if (P.popups.length > 20) P.popups.splice(0, P.popups.length - 20);
  }
  for (const f of W.valley.fields) { const d = VALLEY_FIELDS.find(x => x.id === f.id); f.stock = Math.min(d.max, f.stock + d.regen * dt); }
  const V = W.valley;
  for (let i = 0; i < V.orders.length; i++) {
    const o = V.orders[i];
    if (o.done && W.t - o.doneAt > 15) V.orders[i] = makeOrder(W);
  }
  while (V.orders.length < ordersFor(V.level)) V.orders.push(makeOrder(W));
}

// ---------- snapshots ----------
const r1 = (n) => Math.round(n * 10) / 10;
export function snapshot(W, pid) {
  const players = [];
  for (const P of Object.values(W.players)) {
    players.push({ id: P.id, name: P.name, color: P.color, slot: P.slot, ox: P.ox, oz: P.oz, ang: P.ang, level: P.level, online: P.online,
      b: P.buildings.map(b => [b.id, b.type, b.x, b.y, b.built ? 1 : r1(b.progress), b.stage || (b.queue && b.queue.length ? 'busy' : ''), b.stage === 'grow' ? r1(b.crop) : 0]),
      n: P.nodes.map(n => [n.id, n.type, n.x, n.y, n.amount > 0 ? 1 : 0]),
      v: P.villagers.map(v => [v.id, r1(v.x), r1(v.z), v.state, v.hat, v.face ? r1(v.face) : 0, v.name]) });
  }
  const me = W.players[pid]; let you = null;
  if (me) {
    you = { id: me.id, res: me.res, coins: me.coins, xp: me.xp, level: me.level, cap: capOf(me), housing: housingOf(me), tech: me.tech, quests: me.questsDone, stats: me.stats,
      hire: hireCost(me), buildings: me.buildings.map(b => ({ id: b.id, type: b.type, queue: b.queue, research: b.research || null, stage: b.stage, crop: b.crop })),
      villagers: me.villagers.map(v => ({ id: v.id, name: v.name, state: v.state, hunger: Math.round(v.hunger), task: v.task })), popups: me.popups.splice(0) };
  }
  return { t: r1(W.t), you, players, valley: { xp: W.valley.xp, level: W.valley.level, orders: W.valley.orders, fields: W.valley.fields.map(f => ({ id: f.id, stock: Math.floor(f.stock) })) }, chat: W.chat.slice(-30), events: W.events };
}
export function flushEvents(W) { W.events.length = 0; }
export function serialize(W) { return JSON.stringify(W, (k, v) => k === 'rnd' ? undefined : v); }
export function deserialize(s) {
  const W = JSON.parse(s); W.rnd = rng((W.seed + Math.floor(W.t)) | 0);
  for (const P of Object.values(W.players)) { P.online = false; P.popups = []; }
  return W;
}
