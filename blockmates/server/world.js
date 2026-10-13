// The Blockmates world: authoritative simulation for up to 16 players. No DOM, no Node APIs, so the same file runs in
// Node (server/node.js), in a Cloudflare Durable Object (server/cf/worker.js) and inside the browser for solo play.
import {
  W, H, CHUNK, SEA, TICK, DT, MAX_PLAYERS, REACH, DAY_SECONDS, BLOCKS, B, I, ITEMS, RECIPES, MOBS, PLAYER,
  DEFAULT_LOOK, dropFor, L_WATER, L_LAVA,
} from '../shared/data.js';
import { Terrain, spawnPoint, hash2 } from '../shared/worldgen.js';
import { stepBody, K_LEFT } from '../shared/physics.js';
import { packLayers, unpackLayers } from '../shared/codec.js';
import { daylight, clamp } from '../shared/util.js';
import { stepLiquids, activateAround } from './liquid.js';
import { spawnTick, updateMob, damageMob, spawnMob } from './mobs.js';
import { spawnNpc, updateNpc, setJob, JOBS, MAX_BUDDIES } from './npcs.js';

const NC = W / CHUNK;
// [item, min, max, chance] per tier: 0 ruins, 1 shallow, 2 middle, 3 deep
const LOOT = [
  [['torch', 3, 8, 1], ['bread', 2, 4, 0.8], ['planks', 6, 14, 0.8], ['coal', 2, 6, 0.7], ['apple', 1, 3, 0.6], ['seeds', 2, 5, 0.6], ['copper_ingot', 1, 3, 0.35], ['wood_sword', 1, 1, 0.3], ['leather_helmet', 1, 1, 0.2]],
  [['torch', 4, 10, 1], ['coal', 3, 8, 0.8], ['copper_ingot', 2, 5, 0.7], ['tin_ingot', 2, 4, 0.5], ['cooked_meat', 1, 3, 0.6], ['flint', 2, 5, 0.5], ['arrow', 6, 14, 0.4], ['bow', 1, 1, 0.25], ['iron_ingot', 1, 3, 0.35], ['leather_chest', 1, 1, 0.2]],
  [['iron_ingot', 3, 7, 0.8], ['gold_ingot', 1, 3, 0.5], ['crystal_shard', 1, 3, 0.5], ['glowshard', 1, 2, 0.5], ['cooked_meat', 2, 4, 0.7], ['iron_pickaxe', 1, 1, 0.12], ['copper_chest', 1, 1, 0.2], ['iron_helmet', 1, 1, 0.15], ['fishing_rod', 1, 1, 0.3]],
  [['gold_ingot', 3, 6, 0.8], ['titanium_ingot', 1, 3, 0.55], ['sunstone', 1, 3, 0.5], ['glowshard', 2, 4, 0.7], ['golden_apple', 1, 2, 0.5], ['crystal_shard', 2, 4, 0.7], ['buddy_bell', 1, 1, 0.2], ['titanium_helmet', 1, 1, 0.1], ['iron_chest', 1, 1, 0.2]],
];
const SLOTS = PLAYER.inv;
const dist2 = (ax, ay, bx, by) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);
const r2 = (v) => Math.round(v * 100) / 100;
const cleanName = (s) => String(s || '').replace(/[^\w \-.]/g, '').trim().slice(0, 16);

export class World {
  constructor(opts = {}) {
    this.seed = (opts.seed ?? 1337) | 0;
    this.terrain = new Terrain(this.seed);
    this.chunks = new Map();
    this.meta = new Map();          // "x,y" -> {k:'chest'|'sign'|'waystone'|'bed', ...}
    this.players = new Map();       // id -> player (connected)
    this.accounts = new Map();      // name -> saved player
    this.mobs = new Map();
    this.drops = new Map();
    this.arrows = new Map();
    this.npcs = new Map();           // hired Buddies
    this.trades = new Map();         // player id -> trade session (shared by both sides)
    this.conns = new Map();         // id -> send(obj)
    this.rates = new Map();
    this.liqActive = new Set();
    this.tileQueue = [];
    this.metaQueue = [];
    this.events = [];
    this.chat = [];
    this.nextId = 1;
    this.nextEnt = 1;
    this.tick_n = 0;
    this.time = DAY_SECONDS * 0.1;
    this.day = 1;
    this.ops = new Set((opts.ops || []).map((s) => s.toLowerCase()));
    this.name = opts.name || 'Blockmates World';
    this.motd = opts.motd || 'Welcome! Chop a tree, build a workbench, and explore.';
    this.password = opts.password || '';
    this.pvp = !!opts.pvp;
    this.idleMinutes = opts.idleMinutes ?? 20;
    this.maxPlayers = opts.maxPlayers || MAX_PLAYERS;
    this.spawn = spawnPoint(this.terrain);
    this._rs = (this.seed ^ 0x9e3779b9) >>> 0;
    this.stats = { ticks: 0, msgs: 0 };
    this.dirtyState = false;
  }

  // deterministic-enough random for the sim (seeded, so tests are repeatable)
  rng() {
    let t = (this._rs += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // ------------------------------------------------------------ tiles
  chunk(cx) {
    let c = this.chunks.get(cx);
    if (!c) {
      const g = this.terrain.chunk(cx);
      c = { fg: g.fg, bg: g.bg, liq: g.liq, mod: false, dirty: false };
      this.chunks.set(cx, c);
      this.populate(cx, c);
    }
    return c;
  }

  // shrines, ruins and buried chests: written into a fresh chunk once. The chunk is then saved like an edited one, so
  // loot taken from a chest never comes back after a restart.
  populate(cx, c) {
    const x0 = cx * CHUNK, T = this.terrain;
    const set = (x, y, id) => { c.fg[(x - x0) * H + y] = id; };
    const bgset = (x, y, id) => { c.bg[(x - x0) * H + y] = id; };
    const get = (x, y) => c.fg[(x - x0) * H + y];
    let any = false;
    const spawnChunk = Math.floor(this.spawn.x / CHUNK);
    const wantShrine = cx % 8 === 3 || cx === spawnChunk;
    const shrineX = cx === spawnChunk ? Math.min(x0 + 27, Math.max(x0 + 4, Math.floor(this.spawn.x) + 7 > x0 + 27 ? Math.floor(this.spawn.x) - 7 : Math.floor(this.spawn.x) + 7)) : x0 + 16;
    const dry = (x) => T.surface(x) < SEA - 2;
    if (wantShrine && dry(shrineX) && cx > 1 && cx < NC - 2) {
      let top = 1e9;
      for (let x = shrineX - 3; x <= shrineX + 3; x++) top = Math.min(top, T.surface(x));
      for (let x = shrineX - 3; x <= shrineX + 3; x++) {
        for (let y = top - 7; y < top; y++) set(x, y, 0);
        for (let y = top; y <= T.surface(x); y++) set(x, y, B.stone_brick);
        set(x, top, B.stone_brick);
      }
      set(shrineX - 3, top - 1, B.stone_brick); set(shrineX + 3, top - 1, B.stone_brick);
      set(shrineX, top - 1, B.waystone);
      set(shrineX - 2, top - 1, B.torch); set(shrineX + 2, top - 1, B.torch);
      this.meta.set(shrineX + ',' + (top - 1), { k: 'waystone', name: 'Shrine ' + (cx + 1), owner: 'the world' });
      any = true;
    } else if (T.biomeAt(x0 + 16) !== 'desert' && hash2(this.seed, cx, 71) < 0.4) {
      // a small ruin: brick floor, walls, roof, planks wall, a chest and a torch
      const rx = x0 + 6 + Math.floor(hash2(this.seed, cx, 72) * 14);
      if (dry(rx) && dry(rx + 6)) {
        let top = 1e9; for (let x = rx; x <= rx + 6; x++) top = Math.min(top, T.surface(x));
        for (let x = rx; x <= rx + 6; x++) {
          for (let y = top - 6; y < top; y++) set(x, y, 0);
          for (let y = top; y <= T.surface(x); y++) set(x, y, B.stone_brick);
        }
        for (let y = top - 4; y < top; y++) { set(rx, y, B.stone_brick); set(rx + 6, y, B.stone_brick); }
        for (let x = rx; x <= rx + 6; x++) set(x, top - 5, B.stone_brick);
        set(rx, top - 1, 0); set(rx, top - 2, 0); // a doorway on the left
        for (let x = rx + 1; x <= rx + 5; x++) for (let y = top - 4; y < top; y++) bgset(x, y, B.planks);
        set(rx + 3, top - 1, B.chest); this.fillChest(rx + 3, top - 1, 0);
        set(rx + 5, top - 1, B.torch); set(rx + 1, top - 3, B.cobweb);
        any = true;
      }
    }
    // buried chests in caves
    for (let k = 0; k < 3; k++) {
      for (let tries = 0; tries < 12; tries++) {
        const x = x0 + 2 + Math.floor(hash2(this.seed, cx * 7 + k, 80 + tries) * 28), y = SEA + 22 + Math.floor(hash2(this.seed, cx * 7 + k, 120 + tries) * (H - SEA - 40));
        if (get(x, y) === 0 && get(x, y + 1) !== 0 && BLOCKS[get(x, y + 1)].solid && !c.liq[(x - x0) * H + y] && (k === 0 || hash2(this.seed, cx, 90 + k) < 0.5)) {
          set(x, y, B.chest); this.fillChest(x, y, y > SEA + 100 ? 3 : y > SEA + 55 ? 2 : 1);
          any = true; break;
        }
      }
    }
    if (any) c.mod = c.dirty = true;
  }
  fillChest(x, y, tier) {
    const slots = new Array(24).fill(null);
    const table = LOOT[tier];
    for (const [name, lo, hi, ch] of table) {
      if (this.rng() > ch) continue;
      const cnt = lo + Math.floor(this.rng() * (hi - lo + 1));
      const def = ITEMS[I[name]];
      let i = Math.floor(this.rng() * 24);
      while (slots[i]) i = (i + 1) % 24;
      slots[i] = { id: I[name], n: cnt, ...(def.dur ? { d: def.dur } : {}) };
    }
    this.meta.set(x + ',' + y, { k: 'chest', inv: slots });
  }
  fgAt(x, y) {
    if (x < 0 || x >= W || y >= H) return B.bedrock;
    if (y < 0) return 0;
    return this.chunk((x / CHUNK) | 0).fg[(x % CHUNK) * H + y];
  }
  bgAt(x, y) {
    if (x < 0 || x >= W || y < 0 || y >= H) return 0;
    return this.chunk((x / CHUNK) | 0).bg[(x % CHUNK) * H + y];
  }
  liqAt(x, y) {
    if (x < 0 || x >= W || y < 0 || y >= H) return 0;
    return this.chunk((x / CHUNK) | 0).liq[(x % CHUNK) * H + y];
  }
  // layer 0 fg, 1 bg, 2 liquid
  setTile(x, y, l, v) {
    if (x < 0 || x >= W || y < 0 || y >= H) return;
    const c = this.chunk((x / CHUNK) | 0);
    const arr = l === 0 ? c.fg : l === 1 ? c.bg : c.liq;
    const i = (x % CHUNK) * H + y;
    if (arr[i] === v) return;
    arr[i] = v;
    c.mod = c.dirty = true;
    this.tileQueue.push([x, y, l, v]);
  }
  metaGet(x, y) { return this.meta.get(x + ',' + y); }
  metaSet(x, y, m) {
    const k = x + ',' + y;
    if (m) this.meta.set(k, m); else this.meta.delete(k);
    this.metaQueue.push([x, y, m ? this.publicMeta(m) : null]);
    this.dirtyState = true;
  }
  publicMeta(m) {
    if (m.k === 'sign') return { k: 'sign', text: m.text };
    if (m.k === 'waystone') return { k: 'waystone', name: m.name };
    return { k: m.k };
  }
  solidAt(x, y) { const id = this.fgAt(x, y); return !!id && BLOCKS[id].solid; }
  event(k, x, y, a) { this.events.push([k, r2(x), r2(y), a ?? 0]); }
  sky(x, y) { // open to the sky?
    for (let yy = y; yy >= 0; yy--) { const id = this.fgAt(x, yy); if (id && !BLOCKS[id].sky && BLOCKS[id].solid) return false; }
    return true;
  }

  // ------------------------------------------------------------ connections
  connect(send) {
    const id = this.nextId++;
    this.conns.set(id, send);
    return id;
  }
  disconnect(id) {
    const p = this.players.get(id);
    if (p) { this.cancelTrade(p, 'left'); this.savePlayer(p); this.players.delete(id); this.sysChat(`${p.name} left`); this.broadcast({ t: 'leave', id }); }
    const f = this.conns.get(id);
    this.conns.delete(id); this.rates.delete(id);
    if (f && f.close) { try { f.close(); } catch { /* already closed */ } } // kicked or idle: hang up
  }
  send(id, obj) { const f = this.conns.get(id); if (f) f(obj); }
  broadcast(obj, except) { for (const id of this.players.keys()) if (id !== except) this.send(id, obj); }
  sysChat(text) { this.broadcast({ t: 'chat', from: '', text, sys: true }); }

  message(id, m) {
    this.stats.msgs++;
    if (!m || typeof m !== 'object') return;
    // flood guard: at most 300 messages a second per connection
    const r = this.rates.get(id) || { t: 0, n: 0 };
    if (r.t !== this.tick_n - (this.tick_n % TICK)) { r.t = this.tick_n - (this.tick_n % TICK); r.n = 0; }
    this.rates.set(id, r);
    if (++r.n > 300) return;
    if (m.t === 'join') return this.join(id, m);
    if (m.t === 'ping') return this.send(id, { t: 'pong', c: m.c });
    const p = this.players.get(id);
    if (!p) return;
    const h = Object.hasOwn(HANDLERS, m.t) ? HANDLERS[m.t] : null;
    if (m.t !== 'i' || m.k !== p.keys) p.lastReal = this.tick_n; // keep-alive input does not count as being active
    if (h) h(this, p, m);
  }

  // ------------------------------------------------------------ players
  join(id, m) {
    if (this.players.has(id)) return;
    const name = cleanName(m.name);
    if (name.length < 2) return this.send(id, { t: 'deny', why: 'Pick a name with at least 2 characters.' });
    if (this.password && m.password !== this.password) return this.send(id, { t: 'deny', why: 'Wrong password.' });
    if (this.players.size >= this.maxPlayers) return this.send(id, { t: 'deny', why: `The world is full (${this.maxPlayers} players).` });
    for (const o of this.players.values()) if (o.name.toLowerCase() === name.toLowerCase()) return this.send(id, { t: 'deny', why: 'That name is online right now.' });
    const token = String(m.token || '').slice(0, 64);
    const acc = this.accounts.get(name.toLowerCase());
    if (acc && acc.token && acc.token !== token) return this.send(id, { t: 'deny', why: 'That name belongs to someone else. Pick another one.' });
    const p = this.newPlayer(id, name, token, m.look, acc);
    this.players.set(id, p);
    if (!this.ops.size && !this.accounts.size) this.ops.add(name.toLowerCase());
    this.accounts.set(name.toLowerCase(), this.snapshotPlayer(p));
    this.dirtyState = true;
    this.send(id, {
      t: 'welcome', id, name: this.name, motd: this.motd, seed: this.seed, W, H, time: this.time, day: this.day, tick: TICK,
      you: this.selfState(p), op: this.ops.has(name.toLowerCase()), players: [...this.players.values()].map((o) => this.pubPlayer(o)),
      waystones: this.waystoneList(),
    });
    this.sendInv(p);
    this.sysChat(`${p.name} joined`);
    this.broadcast({ t: 'join', p: this.pubPlayer(p) }, id);
  }

  newPlayer(id, name, token, look, acc) {
    const sp = this.spawn;
    const p = {
      id, name, token, look: this.cleanLook(look || (acc && acc.look)),
      x: sp.x, y: sp.y, vx: 0, vy: 0, w: PLAYER.w, h: PLAYER.h, onGround: false, dir: 1,
      keys: 0, seq: 0, hp: PLAYER.hp, food: PLAYER.food, breath: 10, sel: 0,
      inv: new Array(SLOTS).fill(null), armor: [null, null, null],
      spawnPt: { x: sp.x, y: sp.y }, dead: false, respawnAt: 0, mining: null, atkCd: 0, hurtCd: 0,
      known: new Set(), openChest: null, chatBudget: 8, foodT: 0, regenT: 0, lastAct: this.tick_n, sleeping: false, kills: 0, deaths: 0,
      swing: 0, emote: '', emoteT: 0, shootCd: 0, ping: 0, lastReal: this.tick_n,
    };
    if (acc && acc.inv) {
      p.inv = acc.inv.map((s) => (s && ITEMS[s.id] ? { ...s } : null));
      while (p.inv.length < SLOTS) p.inv.push(null);
      p.armor = (acc.armor || [null, null, null]).map((s) => (s && ITEMS[s.id] ? { ...s } : null));
      p.x = acc.x; p.y = acc.y; p.hp = Math.max(1, acc.hp || PLAYER.hp); p.food = acc.food ?? PLAYER.food;
      p.spawnPt = acc.spawnPt || p.spawnPt; p.kills = acc.kills || 0; p.deaths = acc.deaths || 0;
    } else {
      this.addItem(p, I.wood_pickaxe, 1);
      this.addItem(p, I.wood_axe, 1);
      this.addItem(p, I.torch, 8);
      this.addItem(p, I.bread, 4);
    }
    return p;
  }
  cleanLook(l) {
    const d = { ...DEFAULT_LOOK };
    if (l && typeof l === 'object') for (const k of Object.keys(d)) if (Number.isInteger(l[k]) && l[k] >= 0 && l[k] < 24) d[k] = l[k];
    return d;
  }
  snapshotPlayer(p) {
    return {
      token: p.token, look: p.look, inv: p.inv, armor: p.armor, x: p.x, y: p.y, hp: p.hp, food: p.food, spawnPt: p.spawnPt,
      kills: p.kills, deaths: p.deaths, last: Date.now(),
    };
  }
  savePlayer(p) { this.accounts.set(p.name.toLowerCase(), JSON.parse(JSON.stringify(this.snapshotPlayer(p)))); this.dirtyState = true; }
  selfState(p) {
    return { x: r2(p.x), y: r2(p.y), hp: p.hp, food: p.food, breath: p.breath, sel: p.sel, spawn: p.spawnPt, look: p.look };
  }
  pubPlayer(p) {
    return { id: p.id, name: p.name, look: p.look };
  }

  // ------------------------------------------------------------ inventory
  addItem(p, id, n, dur) {
    const def = ITEMS[id];
    if (!def || n <= 0) return n;
    const stack = def.stack || 99;
    if (stack > 1) {
      for (let i = 0; i < SLOTS && n > 0; i++) {
        const s = p.inv[i];
        if (s && s.id === id && s.n < stack) { const m = Math.min(n, stack - s.n); s.n += m; n -= m; }
      }
    }
    for (let i = 0; i < SLOTS && n > 0; i++) {
      if (!p.inv[i]) {
        const m = Math.min(n, stack);
        p.inv[i] = { id, n: m };
        if (def.dur) p.inv[i].d = dur ?? def.dur;
        n -= m;
      }
    }
    p.invDirty = true;
    return n;
  }
  countItem(p, id) { let c = 0; for (const s of p.inv) if (s && s.id === id) c += s.n; return c; }
  takeItem(p, id, n) {
    for (let i = SLOTS - 1; i >= 0 && n > 0; i--) {
      const s = p.inv[i];
      if (s && s.id === id) { const m = Math.min(n, s.n); s.n -= m; n -= m; if (!s.n) p.inv[i] = null; }
    }
    p.invDirty = true;
  }
  sendInv(p) {
    p.invDirty = false;
    this.send(p.id, { t: 'inv', inv: p.inv, armor: p.armor, sel: p.sel });
  }
  heldItem(p) { return p.inv[p.sel]; }

  // ------------------------------------------------------------ entities
  dropItem(x, y, id, n, opts = {}) {
    if (!id || n <= 0) return;
    if (this.drops.size > 500) { const first = this.drops.keys().next().value; this.drops.delete(first); }
    const d = {
      id: this.nextEnt++, item: id, n, x, y, vx: opts.vx ?? (this.rng() - 0.5) * 3, vy: opts.vy ?? -4 - this.rng() * 2,
      w: 0.4, h: 0.4, onGround: false, age: 0, delay: opts.delay ?? 0.35, dur: opts.dur,
    };
    this.drops.set(d.id, d);
  }

  // ------------------------------------------------------------ breaking and placing
  inReach(p, x, y) { return dist2(p.x, p.y - p.h * 0.55, x + 0.5, y + 0.5) <= REACH * REACH; }

  mineSpeed(p, bd) {
    const s = this.heldItem(p);
    const def = s && ITEMS[s.id];
    let power = 1, tier = 0;
    if (def && def.tool && (def.tool === bd.tool || bd.tool === 'any')) { power = def.power || 1; tier = def.tier || 0; }
    else if (def && def.tool && def.tool !== 'sword' && def.tool !== 'bow' && bd.tool === 'any') power = 1;
    const ok = tier >= (bd.need || 0);
    return { power, tier, ok };
  }

  beginMine(p, x, y, l) {
    if (!Number.isInteger(x) || !Number.isInteger(y) || (l !== 0 && l !== 1)) return;
    if (p.dead || !this.inReach(p, x, y)) { p.mining = null; return; }
    const id = l === 0 ? this.fgAt(x, y) : this.bgAt(x, y);
    if (!id || (l === 1 && this.fgAt(x, y))) { p.mining = null; return; }
    if (!p.mining || p.mining.x !== x || p.mining.y !== y || p.mining.l !== l) p.mining = { x, y, l, prog: 0, last: this.tick_n };
    p.mining.last = this.tick_n;
  }

  tickMining(p) {
    const m = p.mining;
    if (!m) return;
    if (this.tick_n - m.last > TICK * 0.6 || p.dead || !this.inReach(p, m.x, m.y)) { p.mining = null; return; }
    const id = m.l === 0 ? this.fgAt(m.x, m.y) : this.bgAt(m.x, m.y);
    if (!id) { p.mining = null; return; }
    const bd = BLOCKS[id];
    if (bd.hard >= 1e8) return;
    const sp = this.mineSpeed(p, bd);
    const time = Math.max(0.12, (bd.hard * (m.l ? 1.3 : 1)) / sp.power) * (sp.ok ? 1 : 3.5);
    m.prog += DT / time;
    p.swing = 0.25;
    if (this.tick_n % 6 === 0) this.event('hit', m.x + 0.5, m.y + 0.5, id);
    if (m.prog >= 1) {
      p.mining = null;
      this.breakBlock(p, m.x, m.y, m.l, sp.ok);
    }
  }

  breakBlock(p, x, y, l, ok = true) {
    const id = l === 0 ? this.fgAt(x, y) : this.bgAt(x, y);
    if (!id) return;
    const bd = BLOCKS[id];
    if (l === 1) {
      this.setTile(x, y, 1, 0);
      if (ok) this.dropItem(x + 0.5, y + 0.5, id === B.stone ? I.cobble : (bd.drop ? I[bd.drop] : I[bd.name]), 1);
      this.event('break', x + 0.5, y + 0.5, id);
      return;
    }
    // doors are two tiles tall: remove both halves, drop one door
    if (bd.door) {
      const bottom = id === B.door_closed || id === B.door_open;
      const oy = bottom ? y - 1 : y + 1;
      const oid = this.fgAt(x, oy);
      if (oid === B.door_top_closed || oid === B.door_top_open || oid === B.door_closed || oid === B.door_open) this.setTile(x, oy, 0, 0);
      this.setTile(x, y, 0, 0);
      this.dropItem(x + 0.5, (bottom ? y : oy) + 0.5, I.door, 1);
      this.event('break', x + 0.5, y + 0.5, id);
      this.afterRemove(x, y);
      return;
    }
    const m = this.metaGet(x, y);
    if (m && m.k === 'chest') {
      for (const s of m.inv) if (s) this.dropItem(x + 0.5, y + 0.5, s.id, s.n, { dur: s.d });
      for (const o of this.players.values()) if (o.openChest && o.openChest.x === x && o.openChest.y === y) { o.openChest = null; this.send(o.id, { t: 'chest', close: true }); }
    }
    if (m) this.metaSet(x, y, null);
    this.setTile(x, y, 0, 0);
    // drop
    if (ok) {
      let item = dropFor(id);
      if (bd.dropChance && this.rng() > bd.dropChance) item = 0;
      if (id === B.tallgrass && this.rng() < 0.12) item = I.seeds;
      if (id === B.leaves && this.rng() < 0.05) { this.dropItem(x + 0.5, y + 0.5, I.apple, 1); }
      if (id === B.wheat2) { this.dropItem(x + 0.5, y + 0.5, I.seeds, 1 + (this.rng() < 0.5 ? 1 : 0)); }
      if (id === B.gravel && this.rng() < 0.25) item = I.flint;
      if (item) this.dropItem(x + 0.5, y + 0.5, item, id === B.wheat2 ? 1 + (this.rng() < 0.4 ? 1 : 0) : 1);
    }
    if (id === B.log) { const n = this.fellAbove(x, y); if (n) this.dropItem(x + 0.5, y - 0.5, I.log, n); }
    this.event('break', x + 0.5, y + 0.5, id);
    // tool wear
    const s = this.heldItem(p);
    if (s && s.d && ITEMS[s.id].tool && ITEMS[s.id].tool !== 'sword') this.wear(p, p.sel, 1);
    this.afterRemove(x, y);
  }

  wear(p, slot, n) {
    const s = p.inv[slot];
    if (!s || !s.d) return;
    s.d -= n;
    if (s.d <= 0) { p.inv[slot] = null; this.event('toolbreak', p.x, p.y - 1); }
    p.invDirty = true;
  }

  // the trunk above a chopped log comes down with it: returns how many logs fell
  fellAbove(x, y) {
    let n = 0, yy = y - 1;
    while (this.fgAt(x, yy) === B.log && n < 14) { this.setTile(x, yy, 0, 0); n++; yy--; }
    if (n) this.event('break', x + 0.5, y - 0.5, B.log);
    return n;
  }
  // after a tile in the foreground changed: fix whatever depended on it
  afterRemove(x, y) {
    activateAround(this, x, y);
    this.settle(x, y - 1, 0);
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, 0]]) {
      if (this.fgAt(x + dx, y + dy) === B.torch && !this.torchSupported(x + dx, y + dy)) this.breakBlock(DUMMY, x + dx, y + dy, 0, true);
    }
  }
  // the block at (x,y) may have lost the ground under it: sand falls, plants and furniture pop off
  settle(x, y, depth) {
    if (depth > 40) return;
    const id = this.fgAt(x, y);
    if (!id) return;
    const bd = BLOCKS[id];
    if (bd.gravity && !this.fgAt(x, y + 1)) {
      let ny = y;
      while (ny + 1 < H && !this.fgAt(x, ny + 1)) ny++;
      this.setTile(x, y, 0, 0);
      this.setTile(x, ny, 0, id);
      activateAround(this, x, y);
      this.settle(x, y - 1, depth + 1);
      return;
    }
    if (id === B.log && !this.fgAt(x, y + 1)) { this.breakBlock(DUMMY, x, y, 0, true); return; } // a felled trunk comes down in one go
    const belowSolid = this.solidAt(x, y + 1);
    const needsFloor = (bd.plant && !bd.light) || bd.station || bd.container || bd.bed || bd.sign || bd.waystone;
    if (needsFloor && !belowSolid && !(this.bgAt(x, y) && !bd.plant)) this.breakBlock(DUMMY, x, y, 0, true);
  }
  torchSupported(x, y) {
    return this.solidAt(x, y + 1) || this.solidAt(x - 1, y) || this.solidAt(x + 1, y) || !!this.bgAt(x, y);
  }

  canPlaceAt(p, x, y, l, def) {
    const bid = def.place;
    const bd = BLOCKS[bid];
    if (l === 1) {
      if (!bd.solid || bd.oneway || bd.door || bd.gravity) return false;
      if (this.bgAt(x, y)) return false;
      return !!(this.fgAt(x, y) || this.bgAt(x - 1, y) || this.bgAt(x + 1, y) || this.bgAt(x, y - 1) || this.bgAt(x, y + 1) || this.solidAt(x - 1, y) || this.solidAt(x + 1, y) || this.solidAt(x, y - 1) || this.solidAt(x, y + 1));
    }
    const cur = this.fgAt(x, y);
    if (cur && !(BLOCKS[cur].plant && !BLOCKS[cur].light) && cur !== B.cobweb) return false;
    if (bd.plant && !bd.light) { // flowers, saplings, seeds
      const below = this.fgAt(x, y + 1);
      if (bid === B.wheat0) return below === B.dirt || below === B.grass || below === B.farmland;
      return below === B.dirt || below === B.grass || below === B.sand || below === B.snow || below === B.farmland;
    }
    if (bid === B.torch) return this.torchSupported(x, y) || !!this.fgAt(x, y + 1);
    if (bd.climb) return !!this.bgAt(x, y) || this.solidAt(x - 1, y) || this.solidAt(x + 1, y) || this.solidAt(x, y + 1) || this.fgAt(x, y - 1) === B.ladder || this.fgAt(x, y + 1) === B.ladder;
    if (bd.door) {
      return !this.fgAt(x, y - 1) && this.solidAt(x, y + 1);
    }
    if (bd.station || bd.container || bd.bed || bd.sign || bd.waystone || bd.oneway) {
      if (bd.oneway) return !!(this.solidAt(x - 1, y) || this.solidAt(x + 1, y) || this.solidAt(x, y + 1) || this.fgAt(x - 1, y) || this.fgAt(x + 1, y) || this.fgAt(x, y + 1));
      return this.solidAt(x, y + 1) || !!this.bgAt(x, y);
    }
    if (bd.solid) {
      // not inside a creature
      const box = { x: x + 0.5, y: y + 1, w: 1, h: 1 };
      for (const o of this.players.values()) if (!o.dead && overlap(o, box)) return false;
      for (const o of this.mobs.values()) if (overlap(o, box)) return false;
    }
    return !!(this.fgAt(x - 1, y) || this.fgAt(x + 1, y) || this.fgAt(x, y - 1) || this.fgAt(x, y + 1) || this.bgAt(x, y) || this.liqAt(x, y) );
  }

  place(p, x, y, l) {
    if (p.dead || !Number.isInteger(x) || !Number.isInteger(y) || (l !== 0 && l !== 1)) return;
    if (x < 0 || x >= W || y < 1 || y >= H - 1 || !this.inReach(p, x, y)) return;
    const s = this.heldItem(p);
    if (!s) return;
    const def = ITEMS[s.id];
    // buckets
    if (def.name === 'bucket') {
      const lq = this.liqAt(x, y);
      if (lq && (lq & 15) === 8) {
        this.setTile(x, y, 2, 0); activateAround(this, x, y);
        s.n--; if (!s.n) p.inv[p.sel] = null;
        this.addItem(p, (lq >> 4) === L_LAVA ? I.lava_bucket : I.water_bucket, 1);
        p.invDirty = true; this.event('splash', x + 0.5, y + 0.5);
      }
      return;
    }
    if (def.name === 'water_bucket' || def.name === 'lava_bucket') {
      if (this.solidAt(x, y)) return;
      this.setTile(x, y, 2, ((def.name === 'water_bucket' ? L_WATER : L_LAVA) << 4) | 8);
      activateAround(this, x, y);
      s.n--; if (!s.n) p.inv[p.sel] = null;
      this.addItem(p, I.bucket, 1);
      p.invDirty = true; this.event('splash', x + 0.5, y + 0.5);
      return;
    }
    if (def.tool === 'rod') {
      if (p.fishing) { p.fishing = null; return; }
      if ((this.liqAt(x, y) >> 4) !== L_WATER) return this.send(p.id, { t: 'toast', text: 'Cast the line into water.' });
      p.fishing = { x, y, t: 3 + this.rng() * 5, px: p.x };
      this.event('splash', x + 0.5, y + 0.5);
      return;
    }
    if (def.name === 'buddy_bell') {
      if (this.solidAt(x, y) || this.solidAt(x, y - 1)) return;
      const mine = [...this.npcs.values()].filter((n) => n.owner.toLowerCase() === p.name.toLowerCase()).length;
      if (mine >= MAX_BUDDIES || this.npcs.size >= 24) return this.send(p.id, { t: 'toast', text: `You can have ${MAX_BUDDIES} Buddies.` });
      spawnNpc(this, p.name, x + 0.5, y + 1 - 0.01, 'follow');
      s.n--; if (s.n <= 0) p.inv[p.sel] = null; p.invDirty = true;
      this.event('tp', x + 0.5, y);
      this.send(p.id, { t: 'toast', text: 'A Buddy joins you! Right click them to give orders.' });
      return;
    }
    if (!def.place) return;
    if (!this.canPlaceAt(p, x, y, l, def)) return;
    const bid = def.place;
    const bd = BLOCKS[bid];
    if (bd.door) {
      this.setTile(x, y, 0, B.door_closed);
      this.setTile(x, y - 1, 0, B.door_top_closed);
    } else {
      if (l === 0 && bd.solid) { if (this.liqAt(x, y)) { this.setTile(x, y, 2, 0); } }
      this.setTile(x, y, l, bid);
      if (l === 0 && bd.container) this.metaSet(x, y, { k: 'chest', inv: new Array(bd.container).fill(null) });
      if (l === 0 && bd.sign) this.metaSet(x, y, { k: 'sign', text: '' });
      if (l === 0 && bd.waystone) this.metaSet(x, y, { k: 'waystone', name: p.name + "'s stone", owner: p.name });
      if (l === 0 && bd.bed) this.metaSet(x, y, { k: 'bed', owner: p.name });
      if (l === 0 && bd.gravity) this.settle(x, y, 0);
    }
    activateAround(this, x, y);
    s.n--; if (s.n <= 0) p.inv[p.sel] = null;
    p.invDirty = true;
    p.swing = 0.2;
    this.event('place', x + 0.5, y + 0.5, bid);
  }

  interact(p, x, y) {
    if (p.dead || !Number.isInteger(x) || !Number.isInteger(y) || !this.inReach(p, x, y)) return;
    const id = this.fgAt(x, y);
    if (!id) return;
    const bd = BLOCKS[id];
    if (bd.door) { this.toggleDoor(x, y); return; }
    const m = this.metaGet(x, y);
    if (!m) return;
    if (m.k === 'chest') {
      p.openChest = { x, y };
      this.send(p.id, { t: 'chest', x, y, inv: m.inv });
    } else if (m.k === 'sign') {
      this.send(p.id, { t: 'sign', x, y, text: m.text });
    } else if (m.k === 'bed') {
      p.spawnPt = { x: x + 0.5, y: y + 1 - 0.01 };
      this.send(p.id, { t: 'toast', text: 'Spawn point set.' });
      if (daylight(this.time) < 0.4) this.sleep(p);
    } else if (m.k === 'waystone') {
      this.send(p.id, { t: 'ways', from: [x, y], list: this.waystoneList() });
    }
  }
  toggleDoor(x, y) {
    const id = this.fgAt(x, y);
    const bottom = id === B.door_closed || id === B.door_open;
    const by = bottom ? y : y + 1;
    const open = this.fgAt(x, by) === B.door_open;
    this.setTile(x, by, 0, open ? B.door_closed : B.door_open);
    this.setTile(x, by - 1, 0, open ? B.door_top_closed : B.door_top_open);
    this.event('door', x + 0.5, y + 0.5, open ? 0 : 1);
  }
  sleep(p) {
    p.sleeping = true;
    this.send(p.id, { t: 'toast', text: 'Zzz... waiting for the others.' });
    const n = [...this.players.values()].filter((o) => !o.dead).length;
    const s = [...this.players.values()].filter((o) => o.sleeping).length;
    if (s * 2 >= n) {
      this.time = DAY_SECONDS * 0.0; this.day++;
      for (const o of this.players.values()) o.sleeping = false;
      this.sysChat('Good morning!');
    } else this.sysChat(`${p.name} is sleeping (${s}/${n})`);
  }
  waystoneList() {
    const out = [];
    for (const [k, m] of this.meta) if (m.k === 'waystone') { const [x, y] = k.split(',').map(Number); out.push({ x, y, name: m.name, owner: m.owner }); }
    return out.slice(0, 64);
  }

  craft(p, ri, n) {
    const r = RECIPES[ri];
    if (!r || p.dead) return;
    n = clamp(n | 0, 1, 99);
    if (r.st !== 'hand' && !this.nearStation(p, r.st)) return this.send(p.id, { t: 'toast', text: 'You need a ' + r.st + ' nearby.' });
    for (let k = 0; k < n; k++) {
      if (!r.in.every(([id, c]) => this.countItem(p, id) >= c)) break;
      // check there will be room
      for (const [id, c] of r.in) this.takeItem(p, id, c);
      const left = this.addItem(p, r.out, r.n);
      if (left) this.dropItem(p.x, p.y - 1, r.out, left, { delay: 1 });
      this.event('craft', p.x, p.y - 1);
    }
    p.invDirty = true;
  }
  nearStation(p, st) {
    const px = Math.floor(p.x), py = Math.floor(p.y - 1);
    for (let x = px - 6; x <= px + 6; x++) for (let y = py - 5; y <= py + 5; y++) {
      const id = this.fgAt(x, y);
      if (id && BLOCKS[id].station === st) return true;
    }
    return false;
  }

  // ------------------------------------------------------------ combat
  hurtPlayer(p, dmg, by, kx = 0) {
    if (p.dead || p.hurtCd > 0) return;
    const armor = p.armor.reduce((a, s) => a + (s ? ITEMS[s.id].armor || 0 : 0), 0);
    dmg = Math.max(1, Math.round(dmg * (1 - Math.min(0.75, armor * 0.04))));
    p.hp -= dmg; p.hurtCd = 0.5;
    p.vx += kx * 7; p.vy = -7; p.onGround = false;
    this.event('hurt', p.x, p.y - 1, p.id);
    if (p.hp <= 0) this.kill(p, by);
  }
  kill(p, by) {
    p.dead = true; p.hp = 0; p.respawnAt = this.tick_n + TICK * 3; p.deaths++; p.mining = null; p.keys = 0;
    this.sysChat(`${p.name} ${by ? 'was defeated by ' + by : 'died'}`);
    this.event('die', p.x, p.y - 1, p.id);
  }
  respawn(p) {
    p.dead = false; p.hp = PLAYER.hp; p.food = Math.max(p.food, 12); p.breath = 10;
    p.x = p.spawnPt.x; p.y = p.spawnPt.y; p.vx = p.vy = 0; p.hurtCd = 2; p.sleeping = false;
    this.send(p.id, { t: 'respawn', x: p.x, y: p.y });
  }
  attack(p, ax, ay) {
    if (p.dead || p.atkCd > 0) return;
    const s = this.heldItem(p);
    const def = s && ITEMS[s.id];
    const dmg = def && def.dmg ? def.dmg : (def && def.tool === 'axe' ? 2 + def.tier * 0.8 : 1.5);
    p.atkCd = 0.4; p.swing = 0.25;
    p.dir = ax >= p.x ? 1 : -1;
    const range = 2.6;
    let hit = false;
    for (const m of this.mobs.values()) {
      const dx = m.x - p.x, dy = (m.y - m.h / 2) - (p.y - p.h / 2);
      if (dx * p.dir < -0.3 || Math.abs(dx) > range + m.w / 2 || Math.abs(dy) > 1.8) continue;
      damageMob(this, m, dmg, p, p.dir);
      hit = true;
    }
    if (this.pvp) {
      for (const o of this.players.values()) {
        if (o === p || o.dead) continue;
        const dx = o.x - p.x, dy = o.y - p.y;
        if (dx * p.dir < -0.3 || Math.abs(dx) > range || Math.abs(dy) > 1.8) continue;
        this.hurtPlayer(o, dmg, p.name, p.dir); hit = true;
      }
    }
    if (hit && def && def.dur) this.wear(p, p.sel, 1);
    this.event('swing', p.x, p.y - 1, p.dir);
  }
  shoot(p, ax, ay) {
    if (p.dead || p.shootCd > 0) return;
    const s = this.heldItem(p);
    if (!s || ITEMS[s.id].tool !== 'bow' || !this.countItem(p, I.arrow)) return;
    this.takeItem(p, I.arrow, 1);
    p.shootCd = 0.55;
    const ox = p.x, oy = p.y - 1.2;
    let dx = ax - ox, dy = ay - oy;
    const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
    const a = { id: this.nextEnt++, x: ox, y: oy, vx: dx * 30, vy: dy * 30, owner: p.id, age: 0 };
    this.arrows.set(a.id, a);
    this.wear(p, p.sel, 1);
    this.event('shoot', ox, oy);
  }

  // ------------------------------------------------------------ trading (items are held in escrow while offered)
  tradeSide(t, p) { return t.a === p.id ? 'a' : 'b'; }
  tradeState(t, p) {
    const me = this.tradeSide(t, p), other = me === 'a' ? 'b' : 'a';
    const op = this.players.get(t[other]);
    return { t: 'trade', with: op ? op.name : '?', mine: t.off[me], theirs: t.off[other], okMine: t.ok[me], okTheirs: t.ok[other] };
  }
  tradePush(t) { for (const id of [t.a, t.b]) { const q = this.players.get(id); if (q) this.send(id, this.tradeState(t, q)); } }
  tradeRequest(p, toId) {
    const o = this.players.get(toId);
    if (!o || o === p || o.dead || p.dead || this.trades.has(p.id) || this.trades.has(o.id)) return;
    if (dist2(p.x, p.y, o.x, o.y) > 16 * 16) return this.send(p.id, { t: 'toast', text: 'Too far away to trade.' });
    o.tradeFrom = p.id;
    this.send(o.id, { t: 'tradereq', from: p.id, name: p.name });
    this.send(p.id, { t: 'toast', text: `Trade request sent to ${o.name}.` });
  }
  tradeAccept(p, fromId) {
    const o = this.players.get(fromId);
    if (!o || p.tradeFrom !== fromId || this.trades.has(p.id) || this.trades.has(o.id)) return;
    p.tradeFrom = 0;
    const t = { a: o.id, b: p.id, off: { a: [], b: [] }, ok: { a: false, b: false } };
    this.trades.set(o.id, t); this.trades.set(p.id, t);
    this.tradePush(t);
  }
  tradeAdd(p, slot, n) {
    const t = this.trades.get(p.id); const s = p.inv[slot];
    if (!t || !s) return;
    const side = this.tradeSide(t, p);
    n = clamp(n | 0 || s.n, 1, s.n);
    if (t.off[side].length >= 6 && !t.off[side].some((q) => q.id === s.id && !q.d)) return;
    const ex = !s.d && t.off[side].find((q) => q.id === s.id);
    if (ex) ex.n += n; else t.off[side].push({ ...s, n });
    s.n -= n; if (!s.n) p.inv[slot] = null;
    t.ok.a = t.ok.b = false; p.invDirty = true; this.tradePush(t);
  }
  tradeRemove(p, i) {
    const t = this.trades.get(p.id);
    if (!t) return;
    const side = this.tradeSide(t, p), st = t.off[side][i];
    if (!st) return;
    t.off[side].splice(i, 1);
    this.returnStack(p, st);
    t.ok.a = t.ok.b = false; this.tradePush(t);
  }
  returnStack(p, st) {
    const left = this.addItem(p, st.id, st.n, st.d);
    if (left) this.dropItem(p.x, p.y - 1, st.id, left, { delay: 1, dur: st.d });
    p.invDirty = true;
  }
  tradeOk(p) {
    const t = this.trades.get(p.id);
    if (!t) return;
    t.ok[this.tradeSide(t, p)] = true;
    if (t.ok.a && t.ok.b) {
      const A = this.players.get(t.a), Bp = this.players.get(t.b);
      for (const st of t.off.a) this.returnStack(Bp, st);
      for (const st of t.off.b) this.returnStack(A, st);
      this.trades.delete(t.a); this.trades.delete(t.b);
      for (const q of [A, Bp]) { this.send(q.id, { t: 'trade', done: true }); this.send(q.id, { t: 'toast', text: 'Trade complete!' }); }
      this.event('craft', A.x, A.y - 1); this.event('craft', Bp.x, Bp.y - 1);
    } else this.tradePush(t);
  }
  cancelTrade(p, why) {
    const t = this.trades.get(p.id);
    p.tradeFrom = 0;
    if (!t) return;
    this.trades.delete(t.a); this.trades.delete(t.b);
    for (const id of [t.a, t.b]) {
      const q = this.players.get(id);
      if (!q) continue;
      for (const st of t.off[id === t.a ? 'a' : 'b']) this.returnStack(q, st);
      if (id !== p.id || why !== 'left') this.send(id, { t: 'trade', done: true });
      if (id !== p.id) this.send(id, { t: 'toast', text: 'The trade was cancelled.' });
    }
  }
  tradeCheck() {
    for (const t of new Set(this.trades.values())) {
      const A = this.players.get(t.a), Bp = this.players.get(t.b);
      if (!A || !Bp || A.dead || Bp.dead || dist2(A.x, A.y, Bp.x, Bp.y) > 24 * 24) this.cancelTrade(A || Bp, 'far');
    }
  }

  // nearest cell to (x,y) where a person can stand (open air above a floor), searching up and down in the column and beside it
  safeSpot(x, y) {
    for (let r = 0; r < 40; r++) for (const dx of r ? [0, -r, r] : [0]) for (const dy of [0, -1, 1].map((v) => v * r)) {
      const xx = x + dx, yy = y + dy;
      if (xx < 2 || xx >= W - 2 || yy < 3 || yy >= H - 3) continue;
      if (!this.solidAt(xx, yy) && !this.solidAt(xx, yy - 1) && this.solidAt(xx, yy + 1) && !this.liqAt(xx, yy)) return { x: xx + 0.5, y: yy + 1 - 0.01 };
    }
    return { x: x + 0.5, y };
  }
  summonBoss(p, slot) {
    if (p.dead) return;
    if (p.y < SEA + 40) return this.send(p.id, { t: 'toast', text: 'The sigil only stirs deep underground.' });
    for (const m of this.mobs.values()) if (m.type === 'stonewarden') return this.send(p.id, { t: 'toast', text: 'A Warden already walks this world.' });
    // find a roomy spot to one side
    let sx = null;
    for (const d of [8, -8, 10, -10, 6, -6, 12, -12]) {
      const x = Math.floor(p.x + d), y = Math.floor(p.y - 0.01);
      let free = this.solidAt(x, y + 1) || this.solidAt(x - 1, y + 1);
      for (let dx = -1; dx <= 1 && free; dx++) for (let dy = 0; dy <= 3; dy++) if (this.solidAt(x + dx, y - dy)) { free = false; break; }
      if (free) { sx = x + 0.5; break; }
    }
    if (sx === null) return this.send(p.id, { t: 'toast', text: 'No room for it here. Find a bigger cave.' });
    const s = p.inv[slot]; s.n--; if (!s.n) p.inv[slot] = null; p.invDirty = true;
    spawnMob(this, 'stonewarden', sx, p.y);
    this.sysChat(`${p.name} woke the Stone Warden!`);
    this.event('slam', sx, p.y - 1);
  }

  // ------------------------------------------------------------ chat and commands
  chatMsg(p, text) {
    text = String(text || '').replace(/[\u0000-\u001f]/g, '').slice(0, 160).trim();
    if (!text) return;
    if (p.chatBudget < 1) return this.send(p.id, { t: 'toast', text: 'Slow down a little.' });
    p.chatBudget--;
    if (text[0] === '/') return this.command(p, text.slice(1));
    this.broadcast({ t: 'chat', from: p.name, id: p.id, text });
  }
  command(p, line) {
    const [cmd, ...a] = line.split(/\s+/);
    const op = this.ops.has(p.name.toLowerCase());
    const say = (text) => this.send(p.id, { t: 'chat', from: '', text, sys: true });
    switch (cmd.toLowerCase()) {
      case 'help': return say('/who, /spawn, /me text, /home, /time (op), /tp name (op), /goto place|x y (op), /summon mob (op), /give item n (op), /pvp (op), /kick name (op)');
      case 'who': return say('Online: ' + [...this.players.values()].map((o) => o.name).join(', '));
      case 'me': return this.broadcast({ t: 'chat', from: '', text: `* ${p.name} ${a.join(' ')}`, sys: true });
      case 'spawn': case 'home': p.x = p.spawnPt.x; p.y = p.spawnPt.y; p.vx = p.vy = 0; return this.send(p.id, { t: 'respawn', x: p.x, y: p.y });
      case 'time': {
        if (!op) return say('Only operators can do that.');
        const v = (a[0] || '').toLowerCase();
        this.time = v === 'day' ? DAY_SECONDS * 0.05 : v === 'night' ? DAY_SECONDS * 0.7 : v === 'noon' ? DAY_SECONDS * 0.25 : (Number(v) || this.time);
        return say('Time set.');
      }
      case 'tp': {
        if (!op) return say('Only operators can do that.');
        const t = [...this.players.values()].find((o) => o.name.toLowerCase() === (a[0] || '').toLowerCase());
        if (!t) return say('No such player.');
        p.x = t.x; p.y = t.y; p.vx = p.vy = 0; return this.send(p.id, { t: 'respawn', x: p.x, y: p.y });
      }
      case 'goto': {
        if (!op) return say('Only operators can do that.');
        let x, y;
        if (a.length >= 2 && !isNaN(a[0])) { x = clamp(parseInt(a[0], 10), 2, W - 3); y = clamp(parseInt(a[1], 10), 2, H - 3); }
        else {
          const want = (a[0] || '').toLowerCase();
          const start = Math.floor(p.x);
          for (let d = 0; d < W && x === undefined; d += 4) for (const sx of [start + d, start - d]) {
            if (sx < 20 || sx > W - 20) continue;
            if (want === 'ocean' ? this.terrain.surface(sx) > SEA + 6 : this.terrain.biomeAt(sx) === want && this.terrain.surface(sx) < SEA - 2) { x = sx; break; }
          }
          if (x === undefined) return say('No such place. Try: plains forest desert tundra mountains ocean, or /goto x y');
          y = this.terrain.surface(x) - 3;
          if (want === 'ocean') y = SEA - 2;
        }
        const sp = this.safeSpot(x, y);
        p.x = sp.x; p.y = sp.y; p.vx = p.vy = 0; p.known.clear();
        return this.send(p.id, { t: 'respawn', x: p.x, y: p.y });
      }
      case 'summon': {
        if (!op) return say('Only operators can do that.');
        const t = (a[0] || '').toLowerCase();
        if (!MOBS[t]) return say('Creatures: ' + Object.keys(MOBS).join(', '));
        spawnMob(this, t, p.x + 5 * p.dir, p.y); return say('Summoned.');
      }
      case 'give': {
        if (!op) return say('Only operators can do that.');
        const id = I[(a[0] || '').toLowerCase()];
        if (!id) return say('Unknown item.');
        this.addItem(p, id, clamp(parseInt(a[1], 10) || 1, 1, 999)); return say('Given.');
      }
      case 'pvp': if (!op) return say('Only operators can do that.'); this.pvp = !this.pvp; return this.sysChat('PvP is ' + (this.pvp ? 'ON' : 'off'));
      case 'kick': {
        if (!op) return say('Only operators can do that.');
        const t = [...this.players.values()].find((o) => o.name.toLowerCase() === (a[0] || '').toLowerCase());
        if (!t) return say('No such player.');
        this.send(t.id, { t: 'deny', why: 'You were kicked.' }); return this.disconnect(t.id);
      }
      default: return say('Unknown command. Try /help');
    }
  }

  // ------------------------------------------------------------ the tick
  tick() {
    this.tick_n++;
    this.stats.ticks++;
    this.time += DT;
    if (this.time >= DAY_SECONDS) { this.time -= DAY_SECONDS; this.day++; for (const p of this.players.values()) p.sleeping = false; }
    if (this.players.size === 0) { this.tileQueue.length = 0; this.metaQueue.length = 0; this.events.length = 0; return; }

    for (const p of this.players.values()) this.tickPlayer(p);
    for (const d of this.drops.values()) this.tickDrop(d);
    for (const m of [...this.mobs.values()]) updateMob(this, m);
    for (const n of [...this.npcs.values()]) updateNpc(this, n);
    if (this.tick_n % TICK === 0) this.tradeCheck();
    for (const a of [...this.arrows.values()]) this.tickArrow(a);
    if (this.tick_n % 3 === 0) stepLiquids(this, 600);
    if (this.tick_n % (TICK * 10) === 0) for (const p of [...this.players.values()]) if (this.tick_n - p.lastReal > TICK * 60 * this.idleMinutes) { this.send(p.id, { t: 'deny', why: 'You were away for a while, so the slot was freed. Come back any time!' }); this.disconnect(p.id); }
    if (this.tick_n % TICK === 0) { spawnTick(this); this.randomTicks(); for (const p of this.players.values()) p.chatBudget = Math.min(8, p.chatBudget + 2); }
    if (this.tick_n % 2 === 0) this.snapshots();
    this.flushTiles();
    for (const p of this.players.values()) if (p.invDirty) this.sendInv(p);
    this.events.length = 0;
  }

  tickPlayer(p) {
    p.atkCd = Math.max(0, p.atkCd - DT); p.hurtCd = Math.max(0, p.hurtCd - DT); p.swing = Math.max(0, p.swing - DT); p.shootCd = Math.max(0, p.shootCd - DT);
    if (p.emoteT > 0) { p.emoteT -= DT; if (p.emoteT <= 0) p.emote = ''; }
    if (p.dead) {
      if (this.tick_n >= p.respawnAt) this.respawn(p);
      return;
    }
    const wasGround = p.onGround;
    const f = stepBody(this, p, this.tick_n - p.lastAct > TICK * 1.5 ? 0 : p.keys); // a silent client (hidden tab) stops walking
    p.x = clamp(p.x, 1, W - 1);
    if (p.y > H + 5) this.hurtPlayer(p, 99, null);
    // fall damage
    if (p.landV > 21 && !f.wet) {
      const dmg = Math.floor((p.landV - 21) * 0.9);
      if (dmg > 0) { p.hp -= dmg; this.event('hurt', p.x, p.y - 1, p.id); if (p.hp <= 0) this.kill(p, null); }
    }
    void wasGround;
    if (f.lava) { p.hurtCd = 0; this.hurtPlayer(p, 4, null); }
    else if (f.hurt && this.tick_n % 15 === 0) { p.hurtCd = 0; this.hurtPlayer(p, f.hurt, 'a cactus'); }
    // breath
    if (f.deepWater) { p.breath -= DT; if (p.breath <= 0) { p.breath = 0; if (this.tick_n % TICK === 0) { p.hurtCd = 0; this.hurtPlayer(p, 2, 'the water'); } } }
    else p.breath = Math.min(10, p.breath + DT * 4);
    // hunger and regen
    p.foodT += DT * (Math.abs(p.vx) > 1 ? 1.6 : 1);
    if (p.foodT > 40) { p.foodT = 0; p.food = Math.max(0, p.food - 1); }
    p.regenT += DT;
    if (p.regenT > 3) {
      p.regenT = 0;
      if (p.food >= 14 && p.hp < PLAYER.hp) p.hp++;
      else if (p.food <= 0) { p.hurtCd = 0; if (p.hp > 2) this.hurtPlayer(p, 1, 'hunger'); }
    }
    this.tickMining(p);
    if (p.fishing) this.tickFishing(p);
    // collect drops
    for (const d of this.drops.values()) {
      if (d.age < d.delay) continue;
      const dx = p.x - d.x, dy = (p.y - 0.8) - d.y;
      const dd = dx * dx + dy * dy;
      if (dd < 0.9 * 0.9 + 0.5) {
        const left = this.addItem(p, d.item, d.n, d.dur);
        if (left < d.n) this.event('pickup', d.x, d.y, d.item);
        if (left <= 0) this.drops.delete(d.id); else d.n = left;
      } else if (dd < 3.2 * 3.2) {
        const l = Math.sqrt(dd) || 1; // magnet
        if (this.canHold(p, d.item)) { d.vx += (dx / l) * 40 * DT; d.vy += (dy / l) * 40 * DT - 46 * DT; }
      }
    }
  }
  tickFishing(p) {
    const f = p.fishing, held = this.heldItem(p);
    if (!held || ITEMS[held.id].tool !== 'rod' || Math.abs(p.x - f.px) > 3 || (this.liqAt(f.x, f.y) >> 4) !== L_WATER) { p.fishing = null; return; }
    f.t -= DT;
    if (f.t > 0) return;
    f.t = 4 + this.rng() * 8;
    this.event('splash', f.x + 0.5, f.y + 0.5);
    const r = this.rng();
    const item = r < 0.78 ? I.fish : r < 0.88 ? I.string : r < 0.94 ? I.stick : r < 0.98 ? I.clay_ball : I.crystal_shard;
    const left = this.addItem(p, item, 1);
    if (left) this.dropItem(p.x, p.y - 1, item, 1);
    this.send(p.id, { t: 'toast', text: 'You caught ' + ITEMS[item].label + '!' });
    this.wear(p, p.sel, 1);
    this.event('pickup', p.x, p.y - 1, item);
  }
  canHold(p, id) {
    const st = ITEMS[id].stack || 99;
    for (const s of p.inv) if (!s || (s.id === id && s.n < st)) return true;
    return false;
  }

  tickDrop(d) {
    d.age += DT;
    if (d.age > 300) { this.drops.delete(d.id); return; }
    stepBody(this, d, 0);
    d.vx *= 0.96;
    if (d.y > H + 5) this.drops.delete(d.id);
    // merge with nearby identical drops
    if (d.onGround && this.tick_n % 15 === d.id % 15) {
      for (const o of this.drops.values()) {
        if (o !== d && o.item === d.item && !o.dur && !d.dur && Math.abs(o.x - d.x) < 0.6 && Math.abs(o.y - d.y) < 0.6 && o.n + d.n <= (ITEMS[d.item].stack || 99)) { o.n += d.n; o.age = Math.min(o.age, d.age); this.drops.delete(d.id); break; }
      }
    }
  }

  tickArrow(a) {
    a.age += DT;
    a.vy += 18 * DT;
    const steps = 3;
    for (let i = 0; i < steps; i++) {
      a.x += a.vx * DT / steps; a.y += a.vy * DT / steps;
      if (this.solidAt(Math.floor(a.x), Math.floor(a.y))) { this.arrows.delete(a.id); this.event('thunk', a.x, a.y); return; }
      for (const m of this.mobs.values()) {
        if (Math.abs(a.x - m.x) < m.w / 2 + 0.2 && a.y > m.y - m.h - 0.2 && a.y < m.y + 0.2) {
          const owner = this.players.get(a.owner);
          damageMob(this, m, 5, owner, Math.sign(a.vx) || 1);
          this.arrows.delete(a.id);
          return;
        }
      }
    }
    if (a.age > 4 || a.y > H) this.arrows.delete(a.id);
  }

  randomTicks() {
    const ps = [...this.players.values()];
    for (let n = 0; n < 40; n++) {
      const p = ps[(this.rng() * ps.length) | 0];
      const x = Math.floor(p.x + (this.rng() - 0.5) * 100), y = Math.floor(p.y + (this.rng() - 0.5) * 70);
      if (x < 2 || x >= W - 2 || y < 2 || y >= H - 2) continue;
      const id = this.fgAt(x, y);
      if (!id) continue;
      const bd = BLOCKS[id];
      if (bd.grow === 'tree' && this.rng() < 0.2) this.growTree(x, y);
      else if (bd.grow && bd.grow !== 'tree' && this.rng() < 0.3 && this.sky(x, y)) this.setTile(x, y, 0, B[bd.grow]);
      else if (id === B.dirt && !this.fgAt(x, y - 1) && this.rng() < 0.4) {
        // grass creeps
        if (this.fgAt(x - 1, y) === B.grass || this.fgAt(x + 1, y) === B.grass || this.fgAt(x - 1, y - 1) === B.grass || this.fgAt(x + 1, y - 1) === B.grass) this.setTile(x, y, 0, B.grass);
      } else if (id === B.grass && this.solidAt(x, y - 1) && this.rng() < 0.4) this.setTile(x, y, 0, B.dirt);
      else if ((id === B.leaves || id === B.pine_leaves) && this.rng() < 0.25 && !this.nearLog(x, y)) { this.setTile(x, y, 0, 0); if (this.rng() < 0.1) this.dropItem(x + 0.5, y + 0.5, I.sapling, 1); }
    }
  }
  nearLog(x, y) {
    for (let dx = -4; dx <= 4; dx++) for (let dy = -4; dy <= 4; dy++) if (this.fgAt(x + dx, y + dy) === B.log) return true;
    return false;
  }
  growTree(x, y) {
    const below = this.fgAt(x, y + 1);
    if (below !== B.dirt && below !== B.grass) return;
    const hgt = 4 + ((this.rng() * 3) | 0);
    for (let k = 0; k <= hgt + 2; k++) if (k && this.solidAt(x, y - k)) return;
    this.setTile(x, y, 0, 0);
    for (let k = 0; k < hgt; k++) this.setTile(x, y - k, 0, B.log);
    const ty = y - hgt;
    for (let dy = -2; dy <= 1; dy++) for (let dx = -2; dx <= 2; dx++) {
      if (dx * dx + dy * dy > 5 || (dx === 0 && dy >= 0)) continue;
      if (!this.fgAt(x + dx, ty + dy)) this.setTile(x + dx, ty + dy, 0, B.leaves);
    }
    this.setTile(x, ty, 0, B.log);
  }

  // ------------------------------------------------------------ networking out
  flushTiles() {
    if (this.tileQueue.length || this.metaQueue.length) {
      for (const p of this.players.values()) {
        const u = [];
        for (const t of this.tileQueue) if (p.known.has((t[0] / CHUNK) | 0)) u.push(t);
        const mm = this.metaQueue.filter((t) => p.known.has((t[0] / CHUNK) | 0));
        if (u.length || mm.length) this.send(p.id, { t: 'b', u, m: mm });
      }
      this.tileQueue.length = 0; this.metaQueue.length = 0;
    }
  }

  chunkMeta(cx) {
    const out = [];
    for (const [k, m] of this.meta) {
      const x = +k.split(',')[0];
      if (((x / CHUNK) | 0) === cx) { const [mx, my] = k.split(',').map(Number); out.push([mx, my, this.publicMeta(m)]); }
    }
    return out;
  }

  streamChunks(p) {
    const cx = clamp((p.x / CHUNK) | 0, 0, NC - 1);
    const want = [];
    for (let d = 0; d <= 3; d++) {
      for (const c of d ? [cx - d, cx + d] : [cx]) if (c >= 0 && c < NC && !p.known.has(c)) want.push(c);
    }
    let sent = 0;
    for (const c of want) {
      if (sent++ >= 2) break;
      const ch = this.chunk(c);
      p.known.add(c);
      this.send(p.id, { t: 'c', cx: c, d: packLayers(ch.fg, ch.bg, ch.liq), m: this.chunkMeta(c) });
    }
    for (const c of p.known) if (Math.abs(c - cx) > 5) { p.known.delete(c); this.send(p.id, { t: 'uc', cx: c }); }
  }

  snapshots() {
    const pl = [];
    for (const p of this.players.values()) {
      const held = p.inv[p.sel];
      pl.push([p.id, r2(p.x), r2(p.y), r2(p.vx), r2(p.vy), p.dir, (p.dead ? 1 : 0) | (p.onGround ? 2 : 0) | (p.swing > 0 ? 4 : 0) | (p.flags && p.flags.wet ? 8 : 0) | (p.flags && p.flags.climb ? 16 : 0) | (p.fishing ? 32 : 0), held ? held.id : 0, p.hp, p.emote || 0,
        p.armor[0] ? p.armor[0].id : 0, p.armor[1] ? p.armor[1].id : 0, p.armor[2] ? p.armor[2].id : 0, p.fishing ? p.fishing.x + 0.5 : 0, p.fishing ? p.fishing.y + 0.5 : 0]);
    }
    const mb = [...this.mobs.values()].map((m) => [m.id, m.type, r2(m.x), r2(m.y), r2(m.vx), m.dir, m.hp, m.hurtT > 0 ? 1 : 0]);
    const nc = [...this.npcs.values()].map((n) => [n.id, r2(n.x), r2(n.y), r2(n.vx), n.dir, JOBS.indexOf(n.job), (n.swing > 0 ? 4 : 0) | (n.onGround ? 2 : 0), n.owner, n.look]);
    const dr = [...this.drops.values()].map((d) => [d.id, d.item, r2(d.x), r2(d.y), d.n]);
    const ar = [...this.arrows.values()].map((a) => [a.id, r2(a.x), r2(a.y), r2(a.vx), r2(a.vy)]);
    for (const p of this.players.values()) {
      this.streamChunks(p);
      const px = p.x, py = p.y;
      const near = (x, y) => Math.abs(x - px) < 70 && Math.abs(y - py) < 50;
      this.send(p.id, {
        t: 's', n: this.tick_n, time: r2(this.time), day: this.day, seq: p.seq,
        you: { x: r2(p.x), y: r2(p.y), vx: r2(p.vx), vy: r2(p.vy), hp: p.hp, food: p.food, breath: r2(p.breath), mining: p.mining ? [p.mining.x, p.mining.y, p.mining.l, r2(p.mining.prog)] : null, dead: p.dead },
        p: pl.filter((o) => near(o[1], o[2])),
        n: nc.filter((o) => near(o[1], o[2])),
        m: mb.filter((o) => near(o[2], o[3])), d: dr.filter((o) => near(o[2], o[3])), a: ar.filter((o) => near(o[1], o[2])),
        e: this.events.filter((e) => near(e[1], e[2])),
      });
    }
  }

  // ------------------------------------------------------------ persistence
  exportState() {
    const accounts = {};
    for (const p of this.players.values()) this.savePlayer(p);
    for (const [k, v] of this.accounts) accounts[k] = v;
    const meta = [...this.meta.entries()];
    const npcs = [...this.npcs.values()].map((n) => ({ owner: n.owner, x: n.x, y: n.y, job: n.job }));
    return { v: 1, seed: this.seed, time: this.time, day: this.day, name: this.name, ops: [...this.ops], accounts, meta, npcs };
  }
  importState(s) {
    if (!s || s.v !== 1) return;
    this.seed = s.seed | 0;
    this.terrain = new Terrain(this.seed);
    this.spawn = spawnPoint(this.terrain);
    this.chunks.clear();
    this.time = s.time || 0; this.day = s.day || 1;
    if (s.name) this.name = s.name;
    this.ops = new Set(s.ops || []);
    this.accounts = new Map(Object.entries(s.accounts || {}));
    this.meta = new Map(s.meta || []);
    this.npcs.clear();
    for (const n of s.npcs || []) spawnNpc(this, n.owner, n.x, n.y, n.job);
  }
  // chunks changed since the last call, packed
  exportDirtyChunks() {
    const out = {};
    for (const [cx, c] of this.chunks) if (c.dirty) { c.dirty = false; out[cx] = packLayers(c.fg, c.bg, c.liq); }
    return out;
  }
  importChunk(cx, b64) {
    const { fg, bg, liq } = unpackLayers(b64, CHUNK * H);
    this.chunks.set(cx, { fg, bg, liq, mod: true, dirty: false });
    // liquids from a save may be unstable: wake them gently
    for (let i = 0; i < liq.length; i += 7) if (liq[i]) this.liqActive.add((i % H) * W + cx * CHUNK + ((i / H) | 0));
  }
  allModifiedChunks() {
    const out = {};
    for (const [cx, c] of this.chunks) if (c.mod) out[cx] = packLayers(c.fg, c.bg, c.liq);
    return out;
  }
}

const DUMMY = { sel: -1, inv: [], dummy: true };
function overlap(p, box) {
  return Math.abs(p.x - box.x) < (p.w + box.w) / 2 && p.y > box.y - box.h && p.y - p.h < box.y;
}

// ---------------------------------------------------------------- message handlers
const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const HANDLERS = {
  i(w, p, m) { // input
    if (!int(m.k, 0, 255)) return;
    p.keys = m.k; if (int(m.s, 0, 1e9)) p.seq = m.s; p.lastAct = w.tick_n;
  },
  sel(w, p, m) { if (int(m.i, 0, PLAYER.hotbar - 1)) { p.sel = m.i; p.mining = null; } },
  mine(w, p, m) { if (m.x === null) p.mining = null; else w.beginMine(p, m.x, m.y, m.l | 0); },
  place(w, p, m) { w.place(p, m.x, m.y, m.l | 0); },
  use(w, p, m) {
    if (!int(m.i, 0, SLOTS - 1)) return;
    const s = p.inv[m.i]; if (!s) return;
    const def = ITEMS[s.id];
    if (def.name === 'warden_sigil') { w.summonBoss(p, m.i); return; }
    if (def.food && p.food < 20) {
      p.food = Math.min(20, p.food + def.food); if (def.heal) p.hp = Math.min(PLAYER.hp, p.hp + def.heal);
      s.n--; if (!s.n) p.inv[m.i] = null; p.invDirty = true; w.event('eat', p.x, p.y - 1);
    } else if (def.armor) {
      const slot = PLAYER.armorSlots.indexOf(def.slot);
      const cur = p.armor[slot]; p.armor[slot] = s; p.inv[m.i] = cur; p.invDirty = true;
    }
  },
  move(w, p, m) { moveItem(w, p, m); },
  drop(w, p, m) {
    if (!int(m.i, 0, SLOTS - 1) || p.dead) return;
    const s = p.inv[m.i]; if (!s) return;
    const n = clamp(m.n | 0 || s.n, 1, s.n);
    w.dropItem(p.x + p.dir * 0.8, p.y - 1.3, s.id, n, { vx: p.dir * 5, vy: -3, delay: 1.2, dur: s.d });
    s.n -= n; if (!s.n) p.inv[m.i] = null; p.invDirty = true;
  },
  craft(w, p, m) { w.craft(p, m.r | 0, m.n | 0 || 1); },
  atk(w, p, m) { if (num(m.x) && num(m.y)) w.attack(p, m.x, m.y); },
  shoot(w, p, m) { if (num(m.x) && num(m.y)) w.shoot(p, m.x, m.y); },
  use2(w, p, m) { w.interact(p, m.x, m.y); },
  chat(w, p, m) { w.chatMsg(p, m.text); },
  emote(w, p, m) { if (int(m.e, 1, 9)) { p.emote = m.e; p.emoteT = 2.5; } },
  sign(w, p, m) {
    if (!int(m.x, 0, W - 1) || !int(m.y, 0, H - 1) || !w.inReach(p, m.x, m.y)) return;
    const meta = w.metaGet(m.x, m.y);
    if (meta && meta.k === 'sign') { meta.text = String(m.text || '').replace(/[\u0000-\u001f]/g, '').slice(0, 60); w.metaSet(m.x, m.y, meta); }
  },
  wname(w, p, m) {
    const meta = w.metaGet(m.x, m.y);
    if (meta && meta.k === 'waystone' && w.inReach(p, m.x, m.y)) { meta.name = cleanName(m.name) || meta.name; w.metaSet(m.x, m.y, meta); }
  },
  way(w, p, m) { // teleport between waystones for one glowshard
    if (p.dead) return;
    const from = [Math.floor(p.x), Math.floor(p.y - 1)];
    let near = false;
    for (let x = from[0] - 6; x <= from[0] + 6 && !near; x++) for (let y = from[1] - 5; y <= from[1] + 5; y++) if (w.fgAt(x, y) === B.waystone) { near = true; break; }
    const dest = w.metaGet(m.x, m.y);
    if (!near || !dest || dest.k !== 'waystone' || w.fgAt(m.x, m.y) !== B.waystone) return;
    if (w.countItem(p, I.glowshard) < 1) return w.send(p.id, { t: 'toast', text: 'Teleporting costs a glowshard.' });
    w.takeItem(p, I.glowshard, 1);
    p.x = m.x + 0.5; p.y = m.y + 1 - 0.01; p.vx = p.vy = 0; p.known.clear();
    w.send(p.id, { t: 'respawn', x: p.x, y: p.y });
    w.event('tp', p.x, p.y - 1);
  },
  chestclose(w, p) { p.openChest = null; },
  trade(w, p, m) { if (int(m.to, 1, 1e9)) w.tradeRequest(p, m.to); },
  tradeacc(w, p, m) { if (int(m.from, 1, 1e9)) w.tradeAccept(p, m.from); },
  tradeadd(w, p, m) { if (int(m.slot, 0, SLOTS - 1)) w.tradeAdd(p, m.slot, m.n); },
  traderem(w, p, m) { if (int(m.i, 0, 5)) w.tradeRemove(p, m.i); },
  tradeok(w, p) { w.tradeOk(p); },
  tradecancel(w, p) { w.cancelTrade(p, 'me'); },
  npc(w, p, m) {
    const n = w.npcs.get(m.id);
    if (!n || dist2(p.x, p.y, n.x, n.y) > 10 * 10) return;
    if (n.owner.toLowerCase() !== p.name.toLowerCase() && !w.ops.has(p.name.toLowerCase())) return w.send(p.id, { t: 'toast', text: 'This Buddy works for ' + n.owner + '.' });
    if (m.act === 'job' && JOBS.includes(m.job)) { setJob(n, m.job); w.send(p.id, { t: 'toast', text: `Buddy: ${m.job}` }); }
    else if (m.act === 'dismiss') { w.npcs.delete(n.id); w.addItem(p, I.buddy_bell, 1); p.invDirty = true; w.event('tp', n.x, n.y - 1); }
  },
  look(w, p, m) { p.look = w.cleanLook(m.look); w.broadcast({ t: 'look', id: p.id, look: p.look }); },
};

// slot refs: ['inv', i] | ['chest', i] | ['armor', i]
function slotRef(w, p, ref) {
  if (!Array.isArray(ref)) return null;
  const [k, i] = ref;
  if (k === 'inv' && int(i, 0, SLOTS - 1)) return { arr: p.inv, i };
  if (k === 'armor' && int(i, 0, 2)) return { arr: p.armor, i, armor: true };
  if (k === 'chest' && p.openChest && int(i, 0, 63)) {
    const m = w.metaGet(p.openChest.x, p.openChest.y);
    if (m && m.k === 'chest' && i < m.inv.length && w.inReach(p, p.openChest.x, p.openChest.y)) return { arr: m.inv, i, chest: p.openChest };
  }
  return null;
}
function moveItem(w, p, m) {
  const a = slotRef(w, p, m.from), b = slotRef(w, p, m.to);
  if (!a || !b || (a.arr === b.arr && a.i === b.i)) return;
  const sa = a.arr[a.i], sb = b.arr[b.i];
  if (!sa) return;
  const okFor = (ref, s) => !ref.armor || (s && ITEMS[s.id].slot === PLAYER.armorSlots[ref.i]);
  let n = int(m.n, 1, sa.n) ? m.n : sa.n;
  if (!okFor(b, sa)) return;
  if (sb && sb.id === sa.id && (ITEMS[sa.id].stack || 99) > 1) {
    const mv = Math.min(n, (ITEMS[sa.id].stack || 99) - sb.n);
    sb.n += mv; sa.n -= mv; if (!sa.n) a.arr[a.i] = null;
  } else if (!sb) {
    if (n < sa.n) { b.arr[b.i] = { ...sa, n }; sa.n -= n; } else { b.arr[b.i] = sa; a.arr[a.i] = null; }
  } else {
    if (!okFor(a, sb) || n < sa.n) return;
    a.arr[a.i] = sb; b.arr[b.i] = sa;
  }
  p.invDirty = true;
  for (const r of [a, b]) if (r.chest) {
    const cm = w.metaGet(r.chest.x, r.chest.y);
    for (const o of w.players.values()) if (o.openChest && o.openChest.x === r.chest.x && o.openChest.y === r.chest.y) w.send(o.id, { t: 'chest', x: r.chest.x, y: r.chest.y, inv: cm.inv });
  }
  w.dirtyState = true;
}
void hash2; void K_LEFT; void MOBS; void SEA;
