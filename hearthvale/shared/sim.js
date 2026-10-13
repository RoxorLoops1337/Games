// Hearthvale authoritative simulation. Pure JS, no DOM, no timers: the server and the
// solo client both drive it with tick(W, dt) and command(W, pid, cmd).
import {
  GOODS, PLOT, MAX_PLAYERS, RING_HALF, LEVEL_XP, MAX_LEVEL, BUILDINGS, RECIPES, TECH,
  NODE_TYPES, MAX_BLD_LEVEL, upgradeCost, upgradeNeedsLevel, VALLEY_FIELDS, VALLEY_FIELD_RADIUS, VALLEY_LEVEL_XP, QUESTS, SELL,
  CRAFTED, ICON, FOOD, STOCK_CAP, ANIMALS, SKILLS, SKILL_XP, SKILL_BONUS, PROJECT_STAGES, DAILY_GAP_MS, DAILY_KEEP_MS, DAILY_REWARDS,
  COSMETICS, VISITOR_NAMES, VISITOR_STAY, FESTIVAL, MERCHANT, ACHIEVEMENTS,
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
    valley: { xp: 0, level: 1, orders: [], fields: VALLEY_FIELDS.map(f => ({ id: f.id, stock: f.max * 0.6 })), nextOrderAt: 0, project: newProject(), event: null, merchant: null }, now: 0 };
  while (W.valley.orders.length < ordersFor(1)) W.valley.orders.push(makeOrder(W));
  return W;
}
const uid = (W) => W.nextId++;
const newProject = () => ({ stage: 0, got: {}, contrib: {}, total: {}, lb: [] });
export const ordersFor = (lvl, bonus = 0) => 3 + Math.min(lvl, 6) + bonus;
const emit = (W, e) => { W.events.push(e); if (W.events.length > 300) W.events.shift(); };
// Rain: the SAME formula as weatherAt(t) in js/scene.js, so the sim and the picture always agree.
export function weatherAt(t) { const k = Math.floor(t / 240); const h = Math.sin(k * 12.9898 + 4.1414) * 43758.5453; return (h - Math.floor(h)) < 0.26 ? 1 : 0; }
// The host supplies a wall clock (ms since epoch); the sim never reads Date itself. Only daily rewards use it.
export function setNow(W, ms) { W.now = Number.isFinite(ms) ? ms : 0; }
// villages sit on a square ring around the valley: slot 0 is a corner, spacing 17.5 so 16-tile plots never overlap
export const slotOrigin = (slot) => {
  const H = RING_HALF, d = slot * (8 * H / MAX_PLAYERS), side = Math.floor(d / (2 * H)) % 4, u = d % (2 * H) - H;
  const [ox, oz] = side === 0 ? [u, -H] : side === 1 ? [H, u] : side === 2 ? [-u, H] : [-H, -u];
  return { ox, oz, ang: Math.atan2(oz, ox) };
};
export const levelOf = (xp) => { let l = 1; for (let i = 1; i < MAX_LEVEL; i++) if (xp >= LEVEL_XP[i]) l = i + 1; return l; };
export const tileToWorld = (P, tx, ty) => ({ x: P.ox + tx - PLOT / 2, z: P.oz + ty - PLOT / 2 });

const ORDER_BASE = { wood: 40, clay: 30, stone: 24, wheat: 36, planks: 14, bricks: 10, soup: 8, flour: 10, bread: 6, egg: 16, milk: 12, wool: 10, apple: 16, fish: 12, cheese: 5, jam: 5, cloth: 4, pie: 3 };
const ORDER_LVL = { flour: 3, bread: 3, egg: 4, apple: 4, milk: 5, wool: 5, fish: 5, cheese: 6, jam: 6, cloth: 7, pie: 7 };
function makeOrder(W, fest = false) {
  const lvl = W.valley.level, r = W.rnd;
  const pool = Object.keys(ORDER_BASE).filter(g => lvl >= (ORDER_LVL[g] || 1));
  const n = 1 + (r() < 0.5 + lvl * 0.05 ? 1 : 0) + (lvl >= 4 && r() < 0.3 ? 1 : 0);
  const need = {}, got = {};
  for (let i = 0; i < n; i++) {
    const g = pool[Math.floor(r() * pool.length)];
    if (need[g]) continue;
    const base = ORDER_BASE[g];
    need[g] = Math.max(2, Math.round(base * (1 + lvl * 0.35) * (0.7 + r() * 0.6)));
    got[g] = 0;
  }
  const value = Object.entries(need).reduce((s, [g, c]) => s + c * SELL[g], 0);
  const m = fest ? FESTIVAL.orderBonus : 1;
  const o = { id: uid(W), need, got, contrib: {}, reward: { coins: Math.round(value * 0.6 * m), scrolls: Math.round((1 + Math.floor(value / 120)) * m), xp: Math.round(value * 0.5 * m) }, done: false, doneAt: 0, at: W.t };
  if (fest) o.fest = true;
  return o;
}

// ---------- players ----------
export function addPlayer(W, id, name) {
  if (W.players[id]) { W.players[id].online = true; if (name) W.players[id].name = name.slice(0, 16); return W.players[id]; }
  const slot = W.slots.indexOf(null);
  if (slot < 0) return null;
  W.slots[slot] = id;
  const { ox, oz, ang } = slotOrigin(slot);
  const P = { id, name: (name || 'Villager').slice(0, 16), color: COLORS[slot], slot, ox, oz, ang, online: true, joined: W.t,
    res: Object.fromEntries(GOODS.map(g => [g, 0])), coins: 50,
    xp: 0, level: 1, buildings: [], villagers: [], nodes: [], tech: {}, stats: {}, questsDone: {}, popups: [], rev: 1, vrev: 1,
    xpf: 0, charm: 0, pst: W.valley.project.stage, dT: 1 + (slot % 10) * 0.1, daily: { last: 0, streak: 0 }, ach: {}, title: '', cosmetics: [], visitor: null, visitAt: 0 };
  Object.assign(P.res, { wood: 40, clay: 10, stone: 10, wheat: 10, soup: 6 });
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
  const v = { id: uid(W), name: VILLAGER_NAMES[(W.nextId * 7) % VILLAGER_NAMES.length], x: c.x + (W.rnd() - 0.5) * 2, z: c.z + (W.rnd() - 0.5), hunger: HUNGER_MAX, task: null, state: 'idle', work: 0, hat: Math.floor(W.rnd() * 100), carry: null, skx: new Array(SKILLS.length).fill(0), cs: 0 };
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
const lv = (b) => (b.lvl || 1) - 1;
export const capOf = (P) => 100 + P.buildings.reduce((s, b) => s + (b.built && b.type === 'storehouse' ? 100 + 50 * lv(b) : 0) + (b.type === 'hall' ? 50 * lv(b) : 0), 0) + (P.tech.sturdy ? 60 : 0);
export const housingOf = (P) => (P.pst >= 2 ? 4 : 3) + P.buildings.reduce((s, b) => s + (b.built && b.type === 'house' ? 2 + lv(b) : 0) + (b.type === 'hall' ? lv(b) : 0), 0);
const speedOf = (b) => 1 + 0.25 * lv(b);
export const hireCost = (P) => ({ soup: 3 + Math.max(0, P.villagers.length - 3) * 3 });
export const hasTech = (P, t) => !t || !!P.tech[t];
function popup(P, text, x, z) { P.popups.push({ text, x, z }); if (P.popups.length > 20) P.popups.shift(); }
function bump(P, stat, n = 1) { P.stats[stat] = (P.stats[stat] || 0) + n; }
function canPay(P, cost) { for (const [k, n] of Object.entries(cost)) if ((k === 'coins' ? P.coins : P.res[k]) < n) return false; return true; }
function pay(P, cost) { for (const [k, n] of Object.entries(cost)) { if (k === 'coins') P.coins -= n; else P.res[k] -= n; } }
function give(P, k, n) {
  if (k === 'coins') { P.coins += n; return n; }
  const room = Math.max(0, capOf(P) - (P.res[k] || 0)); const g = Math.min(room, n);
  P.res[k] = (P.res[k] || 0) + g; return g;
}
export const festivalOn = (W) => !!(W.valley.event && W.valley.event.kind === 'festival');
// xp multiplier: +1% per 10 charm (max +25%) and +25% during a festival
export const xpBonus = (W, P) => Math.min(25, Math.floor((P.charm || 0) / 10)) / 100 + (festivalOn(W) ? FESTIVAL.xp : 0);
function addXp(W, P, n) {
  P.xpf = (P.xpf || 0) + n * (1 + xpBonus(W, P)); const whole = Math.floor(P.xpf); P.xpf -= whole; P.xp += whole;
  const l = levelOf(P.xp);
  if (l > P.level) { P.level = l; bump(P, 'level', 0); P.stats.level = l; emit(W, { t: 'levelup', pid: P.id, level: l }); P.rev++; }
}
// gathering perk of the Great Project (stage 1): +10% yield, rounded at random so small yields profit too
const boost = (W, P, amt) => P.pst >= 1 ? Math.floor(amt * 1.1 + W.rnd()) : amt;
// ---- villager skills ----
export function skillLevel(xp) { let l = 1; for (let i = 1; i < SKILL_XP.length; i++) if (xp >= SKILL_XP[i]) l = i + 1; return l; }
// advances skill si by dt work-seconds, returns the work done (dt scaled by the skill bonus)
function swork(W, P, v, si, dt) {
  const x = v.skx[si], l = skillLevel(x); v.skx[si] = x + dt; v.cs = si + 1;
  const l2 = skillLevel(x + dt);
  if (l2 > l) { popup(P, v.name + ': ' + SKILLS[si] + ' ' + l2 + '!', v.x, v.z); emit(W, { t: 'skill', pid: P.id, vid: v.id, skill: SKILLS[si], level: l2 }); P.rev++; }
  return dt * (1 + SKILL_BONUS * (l - 1));
}
const NODE_SKILL = { tree: 0, rock: 1, clay: 1 }, FIELD_SKILL = { vf_wood: 0, vf_clay: 1, vf_stone: 1, vf_wheat: 2 };
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
// during a festival decorations cost half
export const placeCost = (W, d) => !d.decor || !festivalOn(W) ? d.cost : Object.fromEntries(Object.entries(d.cost).map(([k, n]) => [k, Math.ceil(n * FESTIVAL.decorOff)]));
const cleanName = (s, max) => (typeof s === 'string' ? s : '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, max);
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
    const cost = placeCost(W, d); if (!canPay(P, cost)) return { ok: false, err: 'not enough resources' };
    pay(P, cost);
    const b = { id: uid(W), type: c.type, x, y, w: d.w, h: d.h, built: false, progress: 0, queue: [], lvl: 1 };
    if (d.field) { b.crop = 0; b.stage = 'empty'; }
    if (d.animals) { b.an = {}; b.ap = {}; b.stock = {}; b.feed = 0; b.hungry = false; }
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
    if (b.an) for (const k of Object.keys(b.an)) give(P, 'coins', Math.floor(ANIMALS[k].coins * 0.5 * b.an[k]));
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
    const b = building(P, c.id); if (!b || !Number.isInteger(c.i) || !b.queue[c.i]) return { ok: false };
    const q = b.queue[c.i];
    if (q.started) { for (const [k, n] of Object.entries(RECIPES[q.recipe].in)) give(P, k, n); }
    b.queue.splice(c.i, 1);
  },
  upgrade(W, P, c) {
    const b = building(P, c.id); if (!b || !b.built) return { ok: false, err: 'not ready' };
    if (b.up) return { ok: false, err: 'already upgrading' };
    if ((b.lvl || 1) >= MAX_BLD_LEVEL) return { ok: false, err: 'max level' };
    const need = upgradeNeedsLevel(b.type, b.lvl || 1); if (P.level < need) return { ok: false, err: 'village level ' + need + ' needed' };
    const cost = upgradeCost(b.type, b.lvl || 1); if (!canPay(P, cost)) return { ok: false, err: 'not enough resources' };
    pay(P, cost); b.up = { p: 0 };
    const v = nearestIdle(P, b); if (v) setTask(v, { k: 'bld', id: b.id });
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
    P.res[c.res] -= n; P.coins += Math.round(n * SELL[c.res] * (1 + 0.1 * lv(P.buildings.find(b => b.type === 'market' && b.built))) * (P.pst >= 5 && CRAFTED.includes(c.res) ? 1.1 : 1)); bump(P, 'sold', n);
  },
  contribute(W, P, c) {
    const o = W.valley.orders.find(o => o.id === c.id); if (!o || o.done || !own(o.need, c.res)) return { ok: false, err: 'not needed' };
    const n = Math.min(num(c.n) || 0, P.res[c.res], o.need[c.res] - o.got[c.res]); if (!(n > 0)) return { ok: false, err: 'nothing to give' };
    P.res[c.res] -= n; o.got[c.res] += n; o.contrib[P.id] = (o.contrib[P.id] || 0) + n * SELL[c.res]; bump(P, 'gave', n);
    if (Object.keys(o.need).every(k => o.got[k] >= o.need[k])) finishOrder(W, o);
  },
  gift(W, P, c) {
    const to = own(W.players, c.to) ? W.players[c.to] : null; if (!to || to === P) return { ok: false, err: 'no such village' };
    if (!GOODS.includes(c.res)) return { ok: false, err: 'bad good' };
    if (W.t < (P.giftAt || 0)) return { ok: false, err: 'wait a moment' };
    const n = Math.min(Math.max(0, num(c.n) || 0), 20, P.res[c.res]); if (!(n > 0)) return { ok: false, err: 'nothing to give' };
    const g = give(to, c.res, n); if (g <= 0) return { ok: false, err: to.name + ' has no room' };
    P.res[c.res] -= g; P.giftAt = W.t + 3; bump(P, 'gifted', g); popup(to, P.name + ' sent ' + g + ICON[c.res], to.ox, to.oz); to.rev++;
    emit(W, { t: 'gift', from: P.id, to: to.id, res: c.res, n: g });
  },
  chat(W, P, c) {
    const text = String(c.text || '').slice(0, 120).trim(); if (!text) return { ok: false };
    W.chat.push({ t: W.t, pid: P.id, name: P.name, color: P.color, text }); if (W.chat.length > 60) W.chat.shift();
  },
  emote(W, P, c) { W.events.push({ t: 'emote', pid: P.id, e: String(c.e || '').slice(0, 4) }); },
  rename(W, P, c) { P.name = String(c.name || '').slice(0, 16) || P.name; },
  // ---- animals ----
  buyAnimal(W, P, c) {
    const b = building(P, c.id); if (!b || !b.an) return { ok: false, err: 'no such building' };
    if (!b.built) return { ok: false, err: 'not built yet' };
    if (!own(ANIMALS, c.kind)) return { ok: false, err: 'unknown animal' };
    const a = ANIMALS[c.kind]; if (a.house !== b.type) return { ok: false, err: 'wrong home' };
    if (animalCount(b) >= animalCap(b)) return { ok: false, err: 'no room' };
    const cost = c.with === 'goods' ? a.goods : { coins: a.coins };
    if (!canPay(P, cost)) return { ok: false, err: 'not enough resources' };
    pay(P, cost); b.an[c.kind] = (b.an[c.kind] || 0) + 1; if (!b.ap[c.kind]) b.ap[c.kind] = 0;
    bump(P, 'animals'); addXp(W, P, 4); emit(W, { t: 'animal', pid: P.id, id: b.id, kind: c.kind });
    return { ok: true, count: b.an[c.kind] };
  },
  renameVillager(W, P, c) {
    const v = P.villagers.find(v => v.id === c.vid); if (!v) return { ok: false, err: 'no such villager' };
    const name = cleanName(c.name, 12); if (!name) return { ok: false, err: 'bad name' };
    v.name = name; P.vrev++;
    return { ok: true, name };
  },
  // ---- the Great Project ----
  projectGive(W, P, c) {
    const pr = W.valley.project;
    if (pr.stage >= PROJECT_STAGES.length) return { ok: false, err: 'project complete' };
    const need = PROJECT_STAGES[pr.stage].need;
    if (!own(need, c.res)) return { ok: false, err: 'not needed' };
    const n = Math.min(Math.max(0, num(c.n) || 0), P.res[c.res], need[c.res] - (pr.got[c.res] || 0));
    if (!(n > 0)) return { ok: false, err: 'nothing to give' };
    P.res[c.res] -= n; pr.got[c.res] = (pr.got[c.res] || 0) + n;
    const pts = n * SELL[c.res];
    pr.contrib[P.id] = (pr.contrib[P.id] || 0) + pts; pr.total[P.id] = (pr.total[P.id] || 0) + pts; bump(P, 'project', pts);
    rankProject(pr);
    if (Object.keys(need).every(k => (pr.got[k] || 0) >= need[k])) finishStage(W);
    return { ok: true, n, pts };
  },
  // ---- daily reward ----
  daily(W, P) {
    if (!(W.now > 0)) return { ok: false, err: 'no clock' };
    const D = P.daily; let gap = W.now - D.last; if (gap < 0) gap = DAILY_GAP_MS;
    if (D.last && gap < DAILY_GAP_MS) return { ok: false, err: 'come back later' };
    const streak = D.last && gap <= DAILY_KEEP_MS ? Math.min(DAILY_REWARDS.length, D.streak + 1) : 1;
    const R = DAILY_REWARDS[streak - 1], got = {}; let cosmetic = null;
    for (const [k, n] of Object.entries(R)) {
      if (k === 'cosmetic') { cosmetic = COSMETICS.find(x => !P.cosmetics.includes(x)) || null; if (cosmetic) P.cosmetics.push(cosmetic); else got.coins = (got.coins || 0) + give(P, 'coins', 300); }
      else got[k] = (got[k] || 0) + give(P, k, n);
    }
    D.last = W.now; D.streak = streak; P.stats.streak = Math.max(P.stats.streak || 0, streak);
    popup(P, 'Day ' + streak + ' reward!', P.ox, P.oz); emit(W, { t: 'daily', pid: P.id, streak });
    return { ok: true, streak, reward: got, cosmetic };
  },
  setTitle(W, P, c) {
    if (c.id === '' || c.id === null) { P.title = ''; return { ok: true }; }
    const a = own(ACH_BY_ID, c.id) ? ACH_BY_ID[c.id] : null;
    if (!a || !a.title) return { ok: false, err: 'no such title' };
    if (!P.ach[a.id]) return { ok: false, err: 'not unlocked' };
    P.title = a.id; return { ok: true };
  },
  // ---- visitors and the travelling merchant ----
  visitorServe(W, P) {
    const V = P.visitor; if (!V) return { ok: false, err: 'no visitor' };
    if ((P.res[V.want] || 0) < V.n) return { ok: false, err: 'need ' + V.n + ' ' + V.want };
    P.res[V.want] -= V.n; P.coins += V.price;
    let tip = 0; if (W.rnd() < 0.3) { tip = 5 + Math.floor(V.price * 0.2); P.coins += tip; }
    bump(P, 'visitors'); addXp(W, P, 6 + V.n); popup(P, 'Visitor paid ' + (V.price + tip) + ICON.coins, P.ox, P.oz);
    P.visitor = null; P.visitAt = W.t + visitInterval(P); emit(W, { t: 'visitor', pid: P.id, state: 'served' });
    return { ok: true, paid: V.price, tip };
  },
  merchantTrade(W, P, c) {
    const M = W.valley.merchant; if (!M) return { ok: false, err: 'no merchant' };
    const i = c.i; if (!Number.isInteger(i) || i < 0 || i >= M.offers.length) return { ok: false, err: 'no such offer' };
    const o = M.offers[i]; if (o.stock <= 0) return { ok: false, err: 'sold out' };
    if ((P.res[o.give.res] || 0) < o.give.n) return { ok: false, err: 'need ' + o.give.n + ' ' + o.give.res };
    if (o.get.res !== 'coins' && capOf(P) - P.res[o.get.res] + (o.give.res === o.get.res ? o.give.n : 0) < o.get.n) return { ok: false, err: 'storage full' };
    P.res[o.give.res] -= o.give.n; give(P, o.get.res, o.get.n); o.stock--;
    bump(P, 'trades'); addXp(W, P, 5); emit(W, { t: 'trade', pid: P.id, i });
    return { ok: true };
  },
};
const ACH_BY_ID = Object.fromEntries(ACHIEVEMENTS.map(a => [a.id, a]));
export const visitorInterval = (P) => Math.max(150, 330 - (P.charm || 0));
const visitInterval = visitorInterval;
export const animalCap = (b) => BUILDINGS[b.type].capacity[Math.min(2, (b.lvl || 1) - 1)] || 0;
export const animalCount = (b) => { let n = 0; for (const k in b.an) n += b.an[k]; return n; };
export const stockOf = (b) => { let n = 0; for (const k in b.stock) n += b.stock[k]; return n; };
function rankProject(pr) { pr.lb = Object.entries(pr.total).sort((a, b) => b[1] - a[1]).slice(0, 10); }
function finishStage(W) {
  const pr = W.valley.project, st = PROJECT_STAGES[pr.stage], ids = Object.keys(W.players);
  const sum = Object.values(pr.contrib).reduce((s, n) => s + n, 0) || 1;
  // every village gets 20% of the reward evenly, the other 80% by contribution
  for (const id of ids) {
    const P = W.players[id], share = (pr.contrib[id] || 0) / sum, f = 0.2 / ids.length + 0.8 * share;
    const coins = Math.round(st.reward.coins * f), sc = Math.round(st.reward.scrolls * f);
    give(P, 'coins', coins); give(P, 'scrolls', sc); addXp(W, P, Math.round(st.reward.xp * f));
    popup(P, st.name + ' done! +' + coins + ICON.coins, P.ox, P.oz); P.rev++;
  }
  pr.stage++; pr.got = {}; pr.contrib = {};
  for (const id of ids) W.players[id].pst = pr.stage;
  emit(W, { t: 'project', stage: pr.stage });
}
function finishOrder(W, o) {
  o.done = true; o.doneAt = W.t;
  const total = Object.values(o.contrib).reduce((s, n) => s + n, 0) || 1;
  for (const [pid, share] of Object.entries(o.contrib)) {
    const P = W.players[pid]; if (!P) continue;
    const f = share / total;
    give(P, 'coins', Math.round(o.reward.coins * f)); P.res.scrolls = Math.min(capOf(P), P.res.scrolls + Math.round(o.reward.scrolls * f + 0.4)); addXp(W, P, Math.round(o.reward.xp * f));
    bump(P, 'orders');
    popup(P, 'Order done! +' + Math.round(o.reward.coins * f) + '🪙', P.ox, P.oz);
  }
  const V = W.valley; V.xp += o.reward.xp;
  while (V.level < VALLEY_LEVEL_XP.length && V.xp >= VALLEY_LEVEL_XP[V.level]) { V.level++; emit(W, { t: 'valleylevel', level: V.level }); }
  emit(W, { t: 'order', id: o.id });
}

// ---------- villagers ----------
function setTask(v, task) { v.task = task; v.work = 0; v.state = 'walk'; v.idleFor = 0; v.cs = 0; }
function clearTask(v) { v.task = null; v.work = 0; v.state = 'idle'; v.cs = 0; }
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
// What a hungry villager will eat, best first. Soup is the proper meal; plain wheat, apples and bread are the emergency fallbacks,
// so a village that runs out of soup can never get stuck (cooking needs a worker, and workers need food).
const vstate = (v) => (v.famished && (v.state === 'work' || v.state === 'build') ? 'hungry' : v.state);   // working but weary: the client shows a tired face
const MEALS = [['soup', 55], ['bread', 60], ['apple', 30], ['wheat', 24]];
export const hasFood = (P) => MEALS.some(([g]) => P.res[g] > 0);
function feed(P, v) {
  if (v.hunger > 30) return true;
  for (const [g, n] of MEALS) {
    if (P.res[g] > 0) { P.res[g]--; const gain = g === 'soup' ? Math.round((P.tech.hearty ? 100 : 55) * (P.pst >= 3 ? 1.25 : 1)) : n; v.hunger = Math.min(HUNGER_MAX, v.hunger + gain); P.rev++; return true; }
  }
  return v.hunger > 0;
}
const FIELD_YIELD = (b, d, P) => d.crop ? 5 + 2 * lv(b) + (P.tech.keen ? 1 : 0) : 6 + 3 * lv(b) + (P.tech.keen ? 2 : 0);
function stepVillager(W, P, v, dt) {
  v.cs = 0;
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
  // A starving villager still works, just slowly (never a dead stop): that is how a village recovers from an empty larder.
  v.famished = !feed(P, v); if (v.famished) { dt *= 0.4; v.hunger = Math.max(0, v.hunger); }
  const t = v.task;
  if (t.k === 'node' || t.k === 'valley') {
    v.state = 'work';
    const node = t.k === 'node' ? P.nodes.find(n => n.id === t.id) : null;
    const def = node ? NODE_TYPES[node.type] : VALLEY_FIELDS.find(f => f.id === t.id);
    v.work += swork(W, P, v, node ? NODE_SKILL[node.type] : FIELD_SKILL[t.id] || 0, dt); v.hunger -= dt * 1.1;
    if (v.work < def.time) return;
    v.work = 0;
    let amt = boost(W, P, def.yield + (P.tech.keen ? 1 : 0));
    if (node) {
      const n = node;
      amt = Math.min(amt, n.amount);
      const g = give(P, def.res, amt);
      if (g === 0) { v.state = 'full'; popup(P, 'Storage full', v.x, v.z); clearTask(v); return; }
      n.amount -= amt; bump(P, def.res, g); addXp(W, P, 1); popup(P, '+' + g + ICON[def.res], v.x, v.z);
      if (n.amount <= 0) { n.amount = 0; n.regrowAt = W.t + def.regrow; clearTask(v); }
    } else {
      const f = W.valley.fields.find(f => f.id === t.id);
      amt = Math.min(amt, Math.floor(f.stock));
      if (amt <= 0) { popup(P, 'Field is empty', v.x, v.z); clearTask(v); return; }
      const g = give(P, def.res, amt);
      if (g === 0) { popup(P, 'Storage full', v.x, v.z); clearTask(v); return; }
      f.stock -= g; bump(P, def.res, g); addXp(W, P, 1); popup(P, '+' + g + ICON[def.res], v.x, v.z);
    }
    return;
  }
  if (t.k === 'bld') {
    const b = building(P, t.id); const d = BUILDINGS[b.type] || {};
    v.hunger -= dt * 1.1;
    if (!b.built) {
      v.state = 'build'; b.progress += swork(W, P, v, 3, dt) / d.build;
      if (b.progress >= 1) { b.progress = 1; b.built = true; bump(P, 'b_' + b.type); addXp(W, P, d.xp || 5); popup(P, d.name + ' ready!', v.x, v.z); emit(W, { t: 'built', pid: P.id, id: b.id }); P.rev++; clearTask(v); }
      return;
    }
    if (b.up) {
      v.state = 'build'; b.up.p += swork(W, P, v, 3, dt) / (d.build * 1.5 * (b.lvl || 1));
      if (b.up.p >= 1) { b.up = null; b.lvl = (b.lvl || 1) + 1; bump(P, 'upgrades'); addXp(W, P, (d.xp || 5) * 2); popup(P, (d.name || 'Building') + ' upgraded to ' + b.lvl + '!', v.x, v.z); emit(W, { t: 'built', pid: P.id, id: b.id }); P.rev++; clearTask(v); }
      return;
    }
    if (d.field) {
      const crop = d.crop || 'wheat';
      if (b.stage === 'empty') { v.state = 'work'; v.work += swork(W, P, v, 2, dt); if (v.work >= 4) { v.work = 0; b.stage = 'grow'; b.crop = 0; P.rev++; } return; }
      if (b.stage === 'grow') { clearTask(v); return; }
      if (b.stage === 'ripe') { v.state = 'work'; v.work += swork(W, P, v, 2, dt); if (v.work >= 4) { v.work = 0; const g = give(P, crop, boost(W, P, FIELD_YIELD(b, d, P))); bump(P, crop, g); addXp(W, P, 3); popup(P, '+' + g + ICON[crop], v.x, v.z); b.stage = 'empty'; b.crop = 0; P.rev++; if (g === 0) popup(P, 'Storage full', v.x, v.z); clearTask(v); } return; }
    }
    if (b.an) {                                   // coop and barn: collect the ready products
      if (stockOf(b) < 1) { clearTask(v); return; }
      v.state = 'work'; v.work += swork(W, P, v, 7, dt);
      if (v.work >= 3) {
        v.work = 0; let tot = 0;
        for (const k in b.stock) { if (b.stock[k] < 1) continue; const g = give(P, k, b.stock[k]); if (g > 0) { b.stock[k] -= g; tot += g; bump(P, k, g); popup(P, '+' + g + ICON[k], v.x, v.z); } }
        if (tot > 0) { bump(P, 'collected', tot); addXp(W, P, 1 + tot); P.rev++; } else popup(P, 'Storage full', v.x, v.z);
        clearTask(v);
      }
      return;
    }
    if (d.fishing) {                              // dock: fish again and again, never depletes
      v.state = 'work'; v.work += swork(W, P, v, 6, dt);
      if (v.work >= 6) {
        v.work = 0; const g = give(P, 'fish', boost(W, P, 1 + Math.floor(W.rnd() * 3)));
        if (g === 0) { v.state = 'full'; popup(P, 'Storage full', v.x, v.z); clearTask(v); return; }
        bump(P, 'fish', g); addXp(W, P, 1); popup(P, '+' + g + ICON.fish, v.x, v.z);
      }
      return;
    }
    if (b.type === 'study' && b.research) {
      v.state = 'work'; b.research.left -= swork(W, P, v, 5, dt) * speedOf(b);
      if (b.research.left <= 0) { P.tech[b.research.tech] = true; popup(P, TECH[b.research.tech].name + ' learned!', v.x, v.z); addXp(W, P, 15); b.research = null; P.rev++; if (!b.queue.length) clearTask(v); }
      return;
    }
    if (b.queue.length) {
      const q = b.queue[0], r = RECIPES[q.recipe];
      if (!q.started) {
        if (!canPay(P, r.in)) { v.state = 'blocked'; v.idleFor = (v.idleFor || 0) + dt; if (v.idleFor > 8) { popup(P, 'Missing ingredients', v.x, v.z); clearTask(v); } return; }
        pay(P, r.in); q.started = true; q.left = r.time;
      }
      v.idleFor = 0; v.state = 'work'; q.left -= swork(W, P, v, b.type === 'study' ? 5 : FOOD.includes(q.recipe) ? 4 : 3, dt) * speedOf(b);
      if (q.left <= 0) {
        const g = give(P, q.recipe, r.out); bump(P, 'c_' + q.recipe, g); addXp(W, P, r.xp); popup(P, '+' + g + ICON[q.recipe], v.x, v.z);
        q.n--; q.started = false; if (q.n <= 0) b.queue.shift(); P.rev++;
      }
      return;
    }
    clearTask(v);
  }
}

// ---------- animals ----------
function animalStep(W, P, b, dt) {
  const d = BUILDINGS[b.type]; let total = stockOf(b), hungry = false;
  for (let i = 0; i < d.animals.length; i++) {
    const k = d.animals[i], n = b.an[k]; if (!n) continue;
    if (total >= STOCK_CAP) continue;
    const a = ANIMALS[k]; let p = (b.ap[k] || 0) + dt * n / a.time;
    if (p >= 1) {
      if (b.feed < 1) { if (P.res.wheat >= 1) { P.res.wheat--; b.feed += 2; } else { hungry = true; p = 1; } }
      if (b.feed >= 1) { b.feed--; p -= 1; b.stock[a.product] = (b.stock[a.product] || 0) + 1; total++; P.rev++; }
    }
    b.ap[k] = p;
  }
  b.hungry = hungry;
}

// ---------- world events: festival, merchant ----------
function makeMerchant(W, start) {
  const r = W.rnd, pick = (a) => a[Math.floor(r() * a.length)];
  const stock = Math.max(3, Math.min(10, 2 + Math.ceil(Object.keys(W.players).length / 2)));
  const [g1, n1] = pick([['wood', 20], ['clay', 20], ['stone', 12], ['planks', 8], ['bricks', 6], ['bread', 4], ['soup', 5], ['flour', 6]]);
  const [g2, n2] = pick([['planks', 10], ['bricks', 8], ['soup', 8], ['bread', 5], ['flour', 8]]);
  const rare = pick(['cheese', 'jam', 'cloth', 'pie', 'wool', 'apple']), rn = rare === 'pie' ? 1 : 2, g3 = pick(['planks', 'bricks', 'bread', 'flour', 'soup']);
  return { until: start + MERCHANT.len, stock, offers: [
    { give: { res: g1, n: n1 }, get: { res: 'coins', n: Math.round(n1 * SELL[g1] * 1.5) }, stock, max: stock },
    { give: { res: g2, n: n2 }, get: { res: 'scrolls', n: Math.max(1, Math.floor(n2 * SELL[g2] / 7)) }, stock, max: stock },
    { give: { res: g3, n: Math.ceil(SELL[rare] * rn * 1.2 / SELL[g3]) }, get: { res: rare, n: rn }, stock, max: stock },
  ] };
}
// next window start >= 0 for a schedule {first, every}: k-th window starts at first + k * every
const windowStart = (t, S) => t < S.first ? -1 : S.first + Math.floor((t - S.first) / S.every) * S.every;
function worldEvents(W) {
  const V = W.valley, t = W.t;
  let fs = windowStart(t, FESTIVAL); const fOn = fs >= 0 && t < fs + FESTIVAL.len;
  if (fOn && !V.event) {
    V.event = { kind: 'festival', until: fs + FESTIVAL.len }; emit(W, { t: 'festival', state: 'start', until: V.event.until });
    for (let i = 0; i < FESTIVAL.orders; i++) V.orders.push(makeOrder(W, true));
  } else if (!fOn && V.event) { V.event = null; emit(W, { t: 'festival', state: 'end' }); }
  const ms = windowStart(t, MERCHANT), mOn = ms >= 0 && t < ms + MERCHANT.len;
  if (mOn && !V.merchant) { V.merchant = makeMerchant(W, ms); emit(W, { t: 'merchant', state: 'arrive', until: V.merchant.until }); }
  else if (!mOn && V.merchant) { V.merchant = null; emit(W, { t: 'merchant', state: 'leave' }); }
}

// ---------- once-a-second village bookkeeping: charm, stats, quests, achievements, visitors ----------
function derive(W, P) {
  let charm = 0, built = 0, decor = 0;
  for (const b of P.buildings) {
    if (!b.built) continue; const d = BUILDINGS[b.type];
    if (b.type === 'hall') { charm += 2 * lv(b); continue; }
    built++;
    if (d.decor) { decor++; charm += d.decor + lv(b) * Math.ceil(d.decor / 2); } else charm += lv(b);
  }
  P.charm = charm;
  let s5 = 0; for (const v of P.villagers) for (let i = 0; i < SKILLS.length; i++) if (v.skx && v.skx[i] >= SKILL_XP[4]) { s5++; break; }
  const st = P.stats; st.charm = charm; st.buildings = built; st.decor = decor; st.villagers = P.villagers.length; st.skill5 = s5; st.level = P.level;
}
function bookkeeping(W, P) {
  derive(W, P);
  for (const q of QUESTS) {
    if (P.questsDone[q.id]) continue;
    if ((P.stats[q.stat] || 0) >= q.n) { P.questsDone[q.id] = true; for (const [k, n] of Object.entries(q.reward)) give(P, k, n); popup(P, 'Quest done: ' + q.text, P.ox, P.oz); emit(W, { t: 'quest', pid: P.id }); P.rev++; }
  }
  for (const a of ACHIEVEMENTS) {
    if (P.ach[a.id]) continue;
    if ((P.stats[a.stat] || 0) >= a.n) { P.ach[a.id] = Math.floor(W.t) || 1; for (const [k, n] of Object.entries(a.reward)) give(P, k, n); popup(P, 'Achievement: ' + a.name, P.ox, P.oz); emit(W, { t: 'ach', pid: P.id, id: a.id }); P.rev++; }
  }
  // visitors: charm attracts one every few minutes
  const V = P.visitor;
  if (V) { if (W.t >= V.until) { P.visitor = null; P.visitAt = W.t + visitInterval(P); emit(W, { t: 'visitor', pid: P.id, state: 'leave' }); } }
  else if (!P.bot && P.charm >= 10) {
    if (!P.visitAt) P.visitAt = W.t + visitInterval(P);
    else if (W.t >= P.visitAt) {
      const pool = []; for (const g of GOODS) if (g !== 'scrolls' && (['wood', 'clay', 'stone', 'wheat'].includes(g) || P.stats[g] > 0 || P.stats['c_' + g] > 0)) pool.push(g);
      const want = pool[Math.floor(W.rnd() * pool.length)], n = Math.max(1, Math.min(12, Math.round((20 + W.rnd() * 25) / SELL[want])));
      P.visitor = { who: Math.floor(W.rnd() * VISITOR_NAMES.length), want, n, price: Math.round(n * SELL[want] * 1.5), until: W.t + VISITOR_STAY };
      emit(W, { t: 'visitor', pid: P.id, state: 'arrive' });
    }
  }
}

// ---------- tick ----------
export function tick(W, dt) {
  dt = Math.min(dt, TICK_CAP); W.t += dt;
  const V = W.valley, rain = weatherAt(W.t) ? 2 : 1, stage = V.project.stage;
  worldEvents(W);
  for (const P of Object.values(W.players)) {
    P.pst = stage;
    for (const v of P.villagers) stepVillager(W, P, v, dt);
    // the Hearth Hall never lets a village starve outright: with no food at all and hungry villagers, the hall cook shares a free bowl of stew every 40 s
    if (!hasFood(P) && P.villagers.some(v => v.hunger < 35) && W.t >= (P.rationAt || 0)) {
      P.rationAt = W.t + 40; P.res.soup = Math.min(capOf(P), P.res.soup + 1); P.rev++;
      const hall = P.buildings[0], c = tileToWorld(P, hall.x + 1.5, hall.y + 3.5); popup(P, 'The hall cook shared a free bowl of stew!', c.x, c.z); W.events.push({ t: 'ration', pid: P.id });
    }
    for (const b of P.buildings) {
      if (b.stage === 'grow') { b.crop += dt * rain / (BUILDINGS[b.type].grow || 30); if (b.crop >= 1) { b.crop = 1; b.stage = 'ripe'; P.rev++; } }
      else if (b.an && b.built) animalStep(W, P, b, dt);
    }
    for (const n of P.nodes) if (n.amount <= 0 && W.t >= n.regrowAt) { n.amount = NODE_TYPES[n.type].amount; P.rev++; }
    P.dT = (P.dT || 0) - dt; if (P.dT <= 0) { P.dT = 1; bookkeeping(W, P); }
    if (P.popups.length > 20) P.popups.splice(0, P.popups.length - 20);
  }
  for (const f of V.fields) { const d = VALLEY_FIELDS.find(x => x.id === f.id); f.stock = Math.min(d.max, f.stock + d.regen * dt); }
  // orders: finished ones are replaced after a while (festival orders just go away); untouched old ones are swapped for fresh ones
  let regular = 0;
  for (let i = 0; i < V.orders.length; i++) {
    const o = V.orders[i];
    if (o.done && W.t - o.doneAt > 15) { if (o.fest) { V.orders.splice(i, 1); i--; continue; } V.orders[i] = makeOrder(W); }
    else if (!o.done && !o.fest && W.t - (o.at || 0) > 1800 && !Object.keys(o.contrib).length) V.orders[i] = makeOrder(W);
    if (!V.orders[i].fest) regular++;
  }
  const slots = ordersFor(V.level, stage >= 4 ? 1 : 0);
  while (regular < slots) { V.orders.push(makeOrder(W)); regular++; }
}

// the tool a villager visibly holds, derived from the job (client art picks the model from it)
const FIELD_TOOL = { vf_wood: 'axe', vf_clay: 'hoe', vf_stone: 'pick', vf_wheat: 'hoe' }, NODE_TOOL = { tree: 'axe', rock: 'pick', clay: 'hoe' };
export function toolOf(P, v) {
  const t = v.task; if (!t) return 'none';
  if (t.k === 'node') { const n = P.nodes.find(n => n.id === t.id); return n ? NODE_TOOL[n.type] : 'none'; }
  if (t.k === 'valley') return FIELD_TOOL[t.id] || 'none';
  if (t.k === 'bld') { const b = building(P, t.id); if (!b) return 'none'; if (!b.built || b.up) return 'hammer'; const d = BUILDINGS[b.type] || {}; if (d.field) return d.crop ? 'basket' : 'hoe'; if (d.animals) return 'basket'; if (d.fishing) return 'cane'; if (b.type === 'study') return 'scroll'; if (d.craft) return 'ladle'; }
  return 'none';
}
// ---------- snapshots ----------
const r1 = (n) => Math.round(n * 10) / 10;
// ctx (optional, one per connection) turns on delta sending: buildings/nodes of a village are only sent
// when they changed since this connection last got them, and chat only when there are new lines.
export function publicParts(W) {
  const parts = new Map();
  for (const P of Object.values(W.players)) {
    const b = P.buildings.map(b => [b.id, b.type, b.x, b.y, b.built ? 1 : r1(b.progress), b.stage || (b.stock && stockOf(b) >= 1 ? 'ready' : (b.queue && b.queue.length) || b.research || b.up ? 'busy' : ''), b.stage === 'grow' ? r1(b.crop) : 0, b.lvl || 1, b.up ? r1(b.up.p) : 0]);
    const n = P.nodes.map(n => [n.id, n.type, n.x, n.y, n.amount > 0 ? 1 : 0]);
    parts.set(P.id, { b, n, bs: JSON.stringify(b), ns: JSON.stringify(n) });
  }
  return parts;
}
function publicParts1(P) { return publicParts({ players: { x: P } }).get(P.id); }
const titleText = (P) => P.title && ACH_BY_ID[P.title] ? ACH_BY_ID[P.title].title : '';
function dailyView(W, P) {
  const D = P.daily, clock = W.now > 0; let gap = W.now - D.last; if (gap < 0) gap = DAILY_GAP_MS;
  const lapsed = !D.last || gap > DAILY_KEEP_MS, streak = lapsed ? 0 : D.streak;
  const available = clock && (!D.last || gap >= DAILY_GAP_MS);
  const nextDay = Math.min(DAILY_REWARDS.length, streak + 1);
  return { available, streak, nextDay, nextInMs: !clock ? 0 : available ? 0 : Math.max(0, DAILY_GAP_MS - gap), reward: DAILY_REWARDS[nextDay - 1], clock };
}
export function snapshot(W, pid, ctx = null, parts = null) {
  const players = []; parts = ctx ? (parts || publicParts(W)) : null;
  for (const P of Object.values(W.players)) {
    const e = { id: P.id, name: P.name, color: P.color, slot: P.slot, ox: P.ox, oz: P.oz, ang: P.ang, level: P.level, online: P.online,
      v: P.villagers.map(v => [v.id, r1(v.x), r1(v.z), vstate(v), v.hat, v.face ? r1(v.face) : 0, v.name, toolOf(P, v), v.cs || 0]), charm: P.charm || 0, title: titleText(P) };
    if (!ctx) {
      const pp = publicParts1(P); e.b = pp.b; e.n = pp.n;
    } else {
      const pp = parts.get(P.id), last = ctx.last.get(P.id) || {};
      if (last.bs !== pp.bs) e.b = pp.b; if (last.ns !== pp.ns) e.n = pp.n;
      ctx.last.set(P.id, { bs: pp.bs, ns: pp.ns });
    }
    players.push(e);
  }
  if (ctx) for (const id of [...ctx.last.keys()]) if (!W.players[id]) ctx.last.delete(id);
  const me = W.players[pid]; let you = null;
  const V = W.valley, pr = V.project;
  if (me) {
    const ach = {}; for (const a of ACHIEVEMENTS) ach[a.id] = [Math.min(a.n, Math.floor(me.stats[a.stat] || 0)), me.ach[a.id] ? 1 : 0];
    you = { id: me.id, res: me.res, coins: me.coins, xp: me.xp, level: me.level, cap: capOf(me), housing: housingOf(me), tech: me.tech, quests: me.questsDone, stats: me.stats,
      hire: hireCost(me), buildings: me.buildings.map(b => { const e = { id: b.id, type: b.type, lvl: b.lvl || 1, up: !!b.up, queue: b.queue, research: b.research || null, stage: b.stage, crop: b.crop }; if (b.an) { e.an = b.an; e.stock = b.stock; e.hungry = b.hungry; e.room = animalCap(b); e.feed = b.feed; } return e; }),
      villagers: me.villagers.map(v => ({ id: v.id, name: v.name, state: vstate(v), famished: !!v.famished, hunger: Math.round(v.hunger), task: v.task, skills: v.skx.map(skillLevel), skx: v.skx.map(Math.floor), skill: v.cs || 0 })), popups: me.popups.splice(0),
      charm: me.charm || 0, xpBonus: xpBonus(W, me), daily: dailyView(W, me), ach, title: me.title, cosmetics: me.cosmetics,
      visitor: me.visitor ? { who: me.visitor.who, want: me.visitor.want, n: me.visitor.n, price: me.visitor.price, expiresIn: Math.max(0, Math.ceil(me.visitor.until - W.t)) } : null,
      project: { pts: Math.floor(pr.contrib[me.id] || 0), total: Math.floor(pr.total[me.id] || 0) } };
  }
  const st = pr.stage < PROJECT_STAGES.length ? PROJECT_STAGES[pr.stage] : null;
  const project = { stage: pr.stage, max: PROJECT_STAGES.length, name: st ? st.name : 'Complete', need: st ? st.need : {}, got: pr.got, top: pr.lb.map(([id, pts]) => ({ id, name: W.players[id] ? W.players[id].name : '?', pts: Math.floor(pts) })) };
  const nextF = W.t < FESTIVAL.first ? FESTIVAL.first : FESTIVAL.first + (Math.floor((W.t - FESTIVAL.first) / FESTIVAL.every) + 1) * FESTIVAL.every;
  const nextM = W.t < MERCHANT.first ? MERCHANT.first : MERCHANT.first + (Math.floor((W.t - MERCHANT.first) / MERCHANT.every) + 1) * MERCHANT.every;
  return { t: r1(W.t), you, players, valley: { xp: V.xp, level: V.level, orders: V.orders, fields: V.fields.map(f => ({ id: f.id, stock: Math.floor(f.stock) })),
    project, event: V.event, merchant: V.merchant, rain: weatherAt(W.t), next: { festival: nextF, merchant: nextM } }, chat: chatFor(W, ctx), events: W.events };
}
function chatFor(W, ctx) {
  if (!ctx) return W.chat.slice(-30);
  const t0 = ctx.chatT === undefined ? -1 : ctx.chatT; const out = W.chat.filter(c => c.t > t0).slice(-30);
  if (W.chat.length) ctx.chatT = W.chat[W.chat.length - 1].t; else ctx.chatT = ctx.chatT === undefined ? -1 : ctx.chatT;
  return out;
}
export function flushEvents(W) { W.events.length = 0; }
export function serialize(W) { return JSON.stringify(W, (k, v) => k === 'rnd' ? undefined : v); }
export function deserialize(s) {
  const W = JSON.parse(s); W.rnd = rng((W.seed + Math.floor(W.t)) | 0);
  // older saves: add everything the newer systems need
  const V = W.valley; if (!V.project) V.project = newProject(); if (V.event === undefined) V.event = null; if (V.merchant === undefined) V.merchant = null;
  for (const o of V.orders) if (o.at === undefined) o.at = W.t;
  W.now = 0; if (!W.events) W.events = [];
  for (const P of Object.values(W.players)) {
    P.online = false; P.popups = [];
    for (const g of GOODS) if (typeof P.res[g] !== 'number') P.res[g] = 0;
    if (P.xpf === undefined) P.xpf = 0; if (P.charm === undefined) P.charm = 0; P.pst = V.project.stage; if (P.dT === undefined) P.dT = 1 + (P.slot % 10) * 0.1;
    if (!P.daily) P.daily = { last: 0, streak: 0 }; if (!P.ach) P.ach = {}; if (P.title === undefined) P.title = ''; if (!P.cosmetics) P.cosmetics = [];
    if (P.visitor === undefined) P.visitor = null; if (!P.visitAt) P.visitAt = 0;
    for (const v of P.villagers) { if (!Array.isArray(v.skx)) v.skx = new Array(SKILLS.length).fill(0); while (v.skx.length < SKILLS.length) v.skx.push(0); v.cs = 0; }
    for (const b of P.buildings) { const d = BUILDINGS[b.type]; if (d && d.animals && !b.an) { b.an = {}; b.ap = {}; b.stock = {}; b.feed = 0; b.hungry = false; } }
    // saves from the old circular layout: move the village (and its villagers) to the square ring
    const o = slotOrigin(P.slot); if (Math.abs(o.ox - P.ox) > 0.01 || Math.abs(o.oz - P.oz) > 0.01) { const dx = o.ox - P.ox, dz = o.oz - P.oz; for (const v of P.villagers) { v.x += dx; v.z += dz; } P.ox = o.ox; P.oz = o.oz; P.ang = o.ang; }
  }
  rankProject(V.project);
  return W;
}
