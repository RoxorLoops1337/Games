// Cell Serpent: pure simulation (no DOM, no canvas). The browser and the headless
// test suite run this same file. All randomness comes from one seeded generator.
export const W = 720;
export const H = 1280;
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };

export function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- meta (shop)
export const META = [
  { id: 'vit', name: 'Vitality', max: 10, base: 40, grow: 1.5, desc: l => `+${12 * l} max HP` },
  { id: 'pow', name: 'Power', max: 12, base: 50, grow: 1.5, desc: l => `+${8 * l}% damage` },
  { id: 'rap', name: 'Rapid Fire', max: 10, base: 50, grow: 1.5, desc: l => `+${6 * l}% fire rate` },
  { id: 'mag', name: 'Magnetism', max: 6, base: 30, grow: 1.6, desc: l => `+${15 * l}% pickup range` },
  { id: 'for', name: 'Fortune', max: 10, base: 60, grow: 1.55, desc: l => `+${10 * l}% coins` },
  { id: 'xp', name: 'Quick Study', max: 8, base: 60, grow: 1.5, desc: l => `+${8 * l}% XP` },
  { id: 'rev', name: 'Second Wind', max: 1, base: 500, grow: 1, desc: l => (l ? 'Revive once per run' : 'Revive once per run') },
];
export const metaCost = (def, lvl) => Math.round(def.base * Math.pow(def.grow, lvl));

export function defaultSave() {
  return { v: 1, coins: 0, meta: {}, best: 0, runs: 0, kills: 0, muted: false };
}
export function sanitizeSave(raw) {
  const s = defaultSave();
  if (!raw || typeof raw !== 'object') return s;
  const num = (v, d = 0) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : d);
  s.coins = num(raw.coins); s.best = num(raw.best); s.runs = num(raw.runs); s.kills = num(raw.kills);
  s.muted = !!raw.muted;
  for (const d of META) s.meta[d.id] = Math.min(d.max, num(raw.meta && raw.meta[d.id]));
  return s;
}
export function buyMeta(save, id) {
  const d = META.find(m => m.id === id);
  if (!d) return false;
  const lvl = save.meta[id] || 0;
  if (lvl >= d.max) return false;
  const c = metaCost(d, lvl);
  if (save.coins < c) return false;
  save.coins -= c;
  save.meta[id] = lvl + 1;
  return true;
}

// ---------------------------------------------------------------- upgrades (per run)
export const UPGRADES = [
  { id: 'dmg', name: 'Sharper Spikes', max: 8, w: 1.2, desc: '+25% damage', apply: p => { p.dmg *= 1.25; } },
  { id: 'rate', name: 'Hyper Metabolism', max: 8, w: 1.2, desc: '+20% fire rate', apply: p => { p.rate *= 1.2; } },
  { id: 'multi', name: 'Split Shot', max: 4, w: 0.7, desc: '+1 projectile per volley', apply: p => { p.multi += 1; } },
  { id: 'pierce', name: 'Piercing Barbs', max: 4, w: 0.8, desc: 'Shots pierce 1 more segment', apply: p => { p.pierce += 1; } },
  { id: 'crit', name: 'Lethal Mutation', max: 5, w: 0.9, desc: '+12% crit chance (x2.5 damage)', apply: p => { p.crit += 0.12; } },
  { id: 'speed', name: 'Flagella', max: 5, w: 0.8, desc: '+12% move speed', apply: p => { p.speed *= 1.12; } },
  { id: 'hp', name: 'Thick Membrane', max: 6, w: 0.9, desc: '+25 max HP and heal 25', apply: p => { p.maxHp += 25; p.hp = Math.min(p.maxHp, p.hp + 25); } },
  { id: 'magnet', name: 'Gravity Well', max: 4, w: 0.7, desc: '+40% pickup range', apply: p => { p.magnet *= 1.4; } },
  { id: 'orbit', name: 'Orbiting Spores', max: 4, w: 0.8, desc: '+1 spore circles you and cuts segments', apply: p => { p.orbit += 1; } },
  { id: 'splash', name: 'Acid Bursts', max: 4, w: 0.8, desc: 'Hits splash nearby segments', apply: p => { p.splash += 1; } },
  { id: 'regen', name: 'Regeneration', max: 5, w: 0.7, desc: 'Heal 1 HP per second', apply: p => { p.regen += 1; } },
  { id: 'slow', name: 'Cryo Cells', max: 3, w: 0.7, desc: 'Hits slow the snake', apply: p => { p.slow += 1; } },
  { id: 'homing', name: 'Seeker Spores', max: 3, w: 0.6, desc: 'Shots curve toward segments', apply: p => { p.homing += 1; } },
];
const UP = Object.fromEntries(UPGRADES.map(u => [u.id, u]));

// ---------------------------------------------------------------- tuning
export const hpBase = n => 5 * Math.pow(1.14, n - 1) + 1.2 * n;
export const isBossStage = n => n % 5 === 0;
export const snakeLength = n => (isBossStage(n) ? Math.min(46, Math.round(24 + n * 0.8)) : Math.min(38, Math.round(9 + 2 * n)));
export const snakeSpeed = n => (isBossStage(n) ? Math.min(120, 52 + 2 * n) : Math.min(150, 60 + 4 * n));
export const xpNeed = lvl => Math.round(18 + 12 * (lvl - 1) + 2 * (lvl - 1) * (lvl - 1));

const KIND = {
  normal: { hp: 1, xp: 1 },
  armor: { hp: 2.6, xp: 2.2 },
  bomb: { hp: 1, xp: 1.2 },
  spitter: { hp: 1.2, xp: 1.4 },
  gold: { hp: 1.6, xp: 1.5 },
};

// ---------------------------------------------------------------- player
export function makePlayer(metaLv) {
  const m = id => (metaLv && metaLv[id]) || 0;
  const maxHp = 100 + 12 * m('vit');
  return {
    x: W / 2, y: H * 0.78, r: 16, kx: 0, ky: 0,
    maxHp, hp: maxHp, speed: 270,
    dmg: 3 * (1 + 0.08 * m('pow')), rate: 2.6 * (1 + 0.06 * m('rap')),
    multi: 1, pierce: 0, crit: 0.05, critMul: 2.5, bspeed: 900,
    magnet: 90 * (1 + 0.15 * m('mag')), orbit: 0, splash: 0, regen: 0, slow: 0, homing: 0,
    coinMul: 1 + 0.1 * m('for'), xpMul: 1 + 0.08 * m('xp'), revive: m('rev') > 0 ? 1 : 0,
    iframes: 0, shield: 0, rage: 0, cd: 0, aim: -Math.PI / 2, orbAng: 0, regenAcc: 0, mx: 0, my: 0,
  };
}

// ---------------------------------------------------------------- snakes
export const skinFor = n => (Math.floor((n - 1) / 5) % 2 === 0 ? 'pink' : 'purple');

// Small crawlers that swarm in beside the snake. `art` is the sprite key.
export const MINIONS = [
  { id: 'green', art: 'min_green', unlock: 2, hp: 0.8, speed: 82, r: 17, dmg: 8, w: 3 },
  { id: 'red', art: 'min_red', unlock: 4, hp: 0.6, speed: 130, r: 16, dmg: 9, w: 2 },
  { id: 'yellow', art: 'min_yellow', unlock: 5, hp: 1, speed: 100, r: 16, dmg: 9, w: 2 },
  { id: 'jelly', art: 'min_jelly', unlock: 6, hp: 3, speed: 58, r: 25, dmg: 12, w: 1.5 },
  { id: 'eye', art: 'min_eye', unlock: 7, hp: 1.4, speed: 96, r: 20, dmg: 10, w: 1.5 },
  { id: 'robot', art: 'min_robot', unlock: 8, hp: 2, speed: 110, r: 22, dmg: 11, w: 1.2 },
  { id: 'bat', art: 'mon_bat', unlock: 10, hp: 1.6, speed: 150, r: 24, dmg: 11, w: 1.2, erratic: true },
  { id: 'ghost', art: 'mon_ghost', unlock: 12, hp: 2.2, speed: 90, r: 26, dmg: 12, w: 1, erratic: true },
];

function spawnMinions(g, n) {
  const pool = MINIONS.filter(m => m.unlock <= g.stage);
  if (!pool.length) return;
  for (let i = 0; i < n; i++) {
    const tot = pool.reduce((a, m) => a + m.w, 0);
    let r = g.rand() * tot, k = 0;
    for (; k < pool.length - 1; k++) { r -= pool[k].w; if (r <= 0) break; }
    const t = pool[k];
    const side = Math.floor(g.rand() * 3);
    const x = side === 0 ? -20 : side === 1 ? W + 20 : 40 + g.rand() * (W - 80);
    const y = side === 2 ? -20 : 80 + g.rand() * 500;
    const hp = Math.max(1, Math.round(hpBase(g.stage) * 0.8 * t.hp));
    g.minions.push({ x, y, vx: 0, vy: 0, r: t.r, hp, max: hp, type: t, flash: 0, orbCd: 0, ph: g.rand() * TAU, kind: 'minion' });
  }
  g.events.push({ t: 'swarm', n });
}
function pickKind(g, n, boss, i, len) {
  if (i === 0) return 'normal';
  const r = g.rand();
  if (n >= 4 && r < 0.12) return 'armor';
  if (n >= 3 && r < 0.2) return 'spitter';
  if (n >= 2 && r < 0.27) return 'bomb';
  if (r > 0.95 || (boss && i === Math.floor(len / 2))) return 'gold';
  return 'normal';
}

export function segRadius(boss, i, len) {
  const sc = boss ? 1.35 : 1;
  if (i === 0) return 38 * sc;
  const fromTail = len - 1 - i;
  const taper = fromTail < 5 ? 0.62 + 0.38 * (fromTail / 5) : 1;
  return 30 * sc * taper;
}

function spawnSnake(g, n) {
  const boss = isBossStage(n);
  const len = snakeLength(n);
  const segs = [];
  let y = 200;
  const x = W / 2 + (g.rand() - 0.5) * 240;
  for (let i = 0; i < len; i++) {
    const kind = pickKind(g, n, boss, i, len);
    const r = segRadius(boss, i, len);
    let hp = hpBase(n) * KIND[kind].hp * (boss ? 1.6 : 1) * (0.9 + g.rand() * 0.2);
    if (i === 0) hp *= boss ? 3 : 2;
    hp = Math.max(1, Math.round(hp));
    segs.push({ x, y, vx: 0, vy: 0, r, hp, max: hp, kind, flash: 0, orbCd: 0, spit: 1.5 + g.rand() * 2.5, i });
    const nr = segRadius(boss, i + 1, len);
    y -= (r + nr) * 0.78;
  }
  const sn = {
    id: ++g.sid, segs, ang: Math.PI / 2, speed: snakeSpeed(n), turn: 1.5 + Math.min(1, n * 0.05),
    wf: 1.1 + g.rand() * 0.8, wp: g.rand() * TAU, wamp: boss ? 0.55 : 0.8, slow: 0, boss, fan: 2.5, ring: 6,
    skin: skinFor(n),
  };
  g.snakes.push(sn);
  g.stageHpMax += segs.reduce((a, s) => a + s.max, 0);
}

export function startStage(g, n) {
  g.stage = n;
  g.snakes.length = 0;
  g.stageHpMax = 0;
  g.ebullets.length = 0;
  g.minions.length = 0;
  g.wave = isBossStage(n) ? 4 : 9;
  spawnSnake(g, n);
  g.phase = 'play';
  g.clearT = 0;
  g.events.push({ t: 'stage', n, boss: isBossStage(n) });
}

// ---------------------------------------------------------------- game
export function createGame(opts = {}) {
  const g = {
    rand: rng(opts.seed || 1), t: 0, phase: 'play', stage: 0, sid: 0,
    p: makePlayer(opts.meta), snakes: [], minions: [], wave: 9, bullets: [], ebullets: [], pickups: [],
    events: [], ups: {}, level: 1, xp: 0, xpNeed: xpNeed(1), pending: 0, choices: [], resume: 'play',
    coins: 0, kills: 0, score: 0, combo: 0, lastKill: -99, stageHp: 0, stageHpMax: 0, clearT: 0,
    revived: false, result: null, bot: !!opts.bot, shots: 0,
  };
  startStage(g, opts.stage || 1);
  return g;
}

const visible = s => s.y > 8 && s.y < H - 8 && s.x > 8 && s.x < W - 8;

function nearestSeg(g, x, y, maxD = 1e9, needVisible = true) {
  let best = null, bd = maxD;
  for (const sn of g.snakes) for (const s of sn.segs) {
    if (needVisible && !visible(s)) continue;
    const d = Math.hypot(s.x - x, s.y - y) - s.r;
    if (d < bd) { bd = d; best = s; }
  }
  for (const s of g.minions) {
    if (s.hp <= 0) continue;
    const d = Math.hypot(s.x - x, s.y - y) - s.r - 30;
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

function damageSeg(g, s, dmg, crit, x, y) {
  if (s.hp <= 0) return;
  s.hp -= dmg;
  s.flash = 0.12;
  g.events.push({ t: 'hit', x: x ?? s.x, y: y ?? s.y, d: dmg, crit: !!crit, s });
}

function dropPickup(g, kind, x, y, v) {
  const a = g.rand() * TAU, sp = 90 + g.rand() * 170;
  g.pickups.push({ kind, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, v, age: 0, vac: false });
}

function onMinionKill(g, m) {
  g.kills++;
  g.combo = g.t - g.lastKill < 2.2 ? Math.min(99, g.combo + 1) : 1;
  g.lastKill = g.t;
  g.score += Math.round(m.max * 12 * (1 + Math.min(g.combo, 50) * 0.05));
  dropPickup(g, 'gem', m.x, m.y, (1.2 + g.stage * 0.2) * m.type.hp);
  if (g.rand() < 0.4) dropPickup(g, 'coin', m.x, m.y, 1);
  if (g.rand() < 0.05) dropPickup(g, ['heal', 'shield', 'rage'][Math.floor(g.rand() * 3)], m.x, m.y, 1);
  g.events.push({ t: 'kill', x: m.x, y: m.y, r: m.r, kind: 'minion', art: m.type.art });
}

function onKill(g, s, sn) {
  const st = g.stage;
  g.kills++;
  g.combo = g.t - g.lastKill < 2.2 ? Math.min(99, g.combo + 1) : 1;
  g.lastKill = g.t;
  g.score += Math.round(s.max * 10 * (1 + Math.min(g.combo, 50) * 0.05));
  const xpV = (1.6 + st * 0.3) * KIND[s.kind].xp * (sn.boss ? 1.3 : 1);
  const n = s.kind === 'armor' ? 3 : s.kind === 'gold' ? 2 : 1;
  for (let k = 0; k < n; k++) dropPickup(g, 'gem', s.x, s.y, xpV / n);
  if (s.kind === 'gold') { for (let k = 0; k < 5; k++) dropPickup(g, 'coin', s.x, s.y, 1 + Math.floor(st / 3)); if (g.rand() < 0.3) dropPickup(g, ['heal', 'shield', 'rage'][Math.floor(g.rand() * 3)], s.x, s.y, 1); }
  else if (g.rand() < 0.55) dropPickup(g, 'coin', s.x, s.y, 1 + (s.i === 0 || s.kind === 'armor' ? 2 : 0));
  if (sn.boss && s === sn.segs[0]) dropPickup(g, 'heal', s.x, s.y, 1);
  g.events.push({ t: 'kill', x: s.x, y: s.y, r: s.r, kind: s.kind, head: s === sn.segs[0], boss: sn.boss, i: s.i, skin: sn.skin });
  if (s.kind === 'bomb') {
    const R = 150;
    g.events.push({ t: 'boom', x: s.x, y: s.y, r: R });
    for (const o of g.snakes) for (const q of o.segs) {
      if (q === s || q.hp <= 0) continue;
      if (Math.hypot(q.x - s.x, q.y - s.y) < R + q.r) damageSeg(g, q, Math.max(2, s.max * 0.9), false, q.x, q.y);
    }
    for (const q of g.minions) if (q.hp > 0 && Math.hypot(q.x - s.x, q.y - s.y) < R + q.r) damageSeg(g, q, Math.max(3, s.max), false, q.x, q.y);
    if (Math.hypot(g.p.x - s.x, g.p.y - s.y) < R) hurtPlayer(g, 14, s.x, s.y);
  }
}

// Remove dead segments. A kill in the middle splits the snake in two; the cut-off
// tail gets its own head and runs a little faster.
function reap(g) {
  if (g.minions.some(m => m.hp <= 0)) { g.minions = g.minions.filter(m => { if (m.hp > 0) return true; onMinionKill(g, m); return false; }); }
  for (let pass = 0; pass < 6; pass++) {
    let any = false;
    const next = [];
    for (const sn of g.snakes) {
      if (!sn.segs.some(q => q.hp <= 0)) { next.push(sn); continue; }
      any = true;
      const parts = [];
      let cur = [];
      for (const q of sn.segs) {
        if (q.hp <= 0) { onKill(g, q, sn); if (cur.length) { parts.push(cur); cur = []; } } else cur.push(q);
      }
      if (cur.length) parts.push(cur);
      parts.forEach((segs, pi) => {
        const keepsHead = segs[0] === sn.segs[0];
        if (keepsHead) { sn.segs = segs; next.push(sn); return; }
        const h = segs[0], b = segs[1];
        const ang = b ? Math.atan2(h.y - b.y, h.x - b.x) : Math.atan2(g.p.y - h.y, g.p.x - h.x);
        next.push({ ...sn, id: ++g.sid, segs, ang, speed: Math.min(170, sn.speed * 1.1), wp: g.rand() * TAU, boss: false, slow: 0 });
        if (pi > 0 || !keepsHead) g.events.push({ t: 'split', x: h.x, y: h.y });
      });
    }
    g.snakes = next;
    if (!any) break;
  }
}

function hurtPlayer(g, dmg, fx, fy) {
  const p = g.p;
  if (p.iframes > 0 || g.phase === 'dead') return;
  if (p.shield > 0) { p.iframes = 0.3; g.events.push({ t: 'block', x: p.x, y: p.y }); return; }
  p.hp -= dmg;
  p.iframes = 0.9;
  const a = Math.atan2(p.y - fy, p.x - fx);
  p.kx = Math.cos(a) * 520; p.ky = Math.sin(a) * 520;
  g.combo = 0;
  g.events.push({ t: 'hurt', x: p.x, y: p.y, d: dmg });
  if (p.hp <= 0) {
    if (p.revive > 0 && !g.revived) {
      g.revived = true; p.revive = 0; p.hp = Math.round(p.maxHp * 0.5); p.iframes = 2.2;
      g.ebullets.length = 0;
      g.events.push({ t: 'revive' });
    } else {
      p.hp = 0;
      g.phase = 'dead';
      g.result = { stage: g.stage, kills: g.kills, coins: Math.floor(g.coins), score: g.score, level: g.level, time: g.t, boss: isBossStage(g.stage) };
      g.events.push({ t: 'dead' });
    }
  }
}

function rollChoices(g) {
  const pool = UPGRADES.filter(u => (g.ups[u.id] || 0) < u.max);
  const out = [];
  while (out.length < 3 && pool.length) {
    const tot = pool.reduce((a, u) => a + u.w, 0);
    let r = g.rand() * tot, k = 0;
    for (; k < pool.length - 1; k++) { r -= pool[k].w; if (r <= 0) break; }
    const u = pool.splice(k, 1)[0];
    out.push({ id: u.id, name: u.name, desc: u.desc, lvl: g.ups[u.id] || 0, max: u.max });
  }
  return out;
}

function maybeLevelUp(g) {
  if (g.pending > 0 && (g.phase === 'play' || g.phase === 'clear')) {
    g.resume = g.phase;
    g.phase = 'levelup';
    g.choices = rollChoices(g);
    if (!g.choices.length) { g.pending = 0; g.phase = g.resume; return; }
    g.events.push({ t: 'levelup', level: g.level });
  }
}

export function choose(g, idx) {
  if (g.phase !== 'levelup') return false;
  const c = g.choices[idx];
  if (!c) return false;
  UP[c.id].apply(g.p);
  g.ups[c.id] = (g.ups[c.id] || 0) + 1;
  g.pending--;
  g.events.push({ t: 'upgrade', id: c.id });
  if (g.pending > 0) { g.choices = rollChoices(g); if (!g.choices.length) { g.pending = 0; g.phase = g.resume; } } else g.phase = g.resume;
  return true;
}

function collect(g, pk) {
  const p = g.p;
  if (pk.kind === 'heal') { p.hp = Math.min(p.maxHp, p.hp + Math.round(p.maxHp * 0.3)); g.events.push({ t: 'power', kind: 'heal', x: pk.x, y: pk.y }); return; }
  if (pk.kind === 'shield') { p.shield = 6; g.events.push({ t: 'power', kind: 'shield', x: pk.x, y: pk.y }); return; }
  if (pk.kind === 'rage') { p.rage = 8; g.events.push({ t: 'power', kind: 'rage', x: pk.x, y: pk.y }); return; }
  if (pk.kind === 'coin') { g.coins += pk.v * p.coinMul; g.events.push({ t: 'coin', x: pk.x, y: pk.y, v: pk.v }); return; }
  g.xp += pk.v * p.xpMul;
  g.events.push({ t: 'gem', x: pk.x, y: pk.y });
  while (g.xp >= g.xpNeed) { g.xp -= g.xpNeed; g.level++; g.xpNeed = xpNeed(g.level); g.pending++; }
}

function fireEnemy(g, x, y, a, sp, dmg, r) {
  g.ebullets.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: r || 9, dmg, life: 6 });
  g.events.push({ t: 'spit', x, y });
}

// ---------------------------------------------------------------- step
export function step(g, dt, input) {
  if (g.phase !== 'play' && g.phase !== 'clear') return;
  g.t += dt;
  const p = g.p;

  // player movement
  const mx = input ? clamp(input.mx || 0, -1, 1) : 0, my = input ? clamp(input.my || 0, -1, 1) : 0;
  const ml = Math.hypot(mx, my);
  const k = ml > 1 ? 1 / ml : 1;
  p.mx = mx * k; p.my = my * k;
  p.x += (p.mx * p.speed + p.kx) * dt;
  p.y += (p.my * p.speed + p.ky) * dt;
  const kd = Math.exp(-9 * dt); p.kx *= kd; p.ky *= kd;
  p.x = clamp(p.x, p.r, W - p.r);
  p.y = clamp(p.y, 130, H - p.r);
  if (p.iframes > 0) p.iframes -= dt;
  if (p.shield > 0) p.shield -= dt;
  if (p.rage > 0) p.rage -= dt;
  if (p.regen > 0 && p.hp < p.maxHp) { p.regenAcc += p.regen * dt; if (p.regenAcc >= 1) { p.hp = Math.min(p.maxHp, p.hp + 1); p.regenAcc -= 1; } }
  p.orbAng += dt * 3.2;

  // snakes
  let stageHp = 0;
  for (const sn of g.snakes) {
    const h = sn.segs[0];
    sn.slow = Math.max(0, sn.slow - dt);
    const sp = sn.speed * (sn.slow > 0 ? 0.55 : 1) * (g.phase === 'clear' ? 0 : 1);
    const dx = p.x - h.x, dy = p.y - h.y, dist = Math.hypot(dx, dy);
    const wig = Math.sin(g.t * sn.wf + sn.wp) * sn.wamp * clamp(dist / 360, 0.2, 1);
    let tx = Math.cos(Math.atan2(dy, dx) + wig), ty = Math.sin(Math.atan2(dy, dx) + wig);
    const m = 120;
    if (h.x < m) tx += ((m - h.x) / m) * 2.4; else if (h.x > W - m) tx -= ((h.x - (W - m)) / m) * 2.4;
    if (h.y < m && h.y > -m) ty += ((m - h.y) / m) * 2.4; else if (h.y > H - m) ty -= ((h.y - (H - m)) / m) * 2.4;
    const want = Math.atan2(ty, tx);
    const maxT = sn.turn * dt;
    sn.ang += clamp(angDiff(want, sn.ang), -maxT, maxT);
    const ox = h.x, oy = h.y;
    h.x += Math.cos(sn.ang) * sp * dt;
    h.y += Math.sin(sn.ang) * sp * dt;
    if (h.y > 40 || sn.segs.length < 2) h.y = clamp(h.y, h.r, H - h.r);
    h.x = clamp(h.x, h.r, W - h.r);
    h.vx = (h.x - ox) / dt; h.vy = (h.y - oy) / dt;
    for (let i = 1; i < sn.segs.length; i++) {
      const a = sn.segs[i - 1], b = sn.segs[i];
      const bx = b.x, by = b.y;
      const want = (a.r + b.r) * 0.78;
      const ddx = a.x - b.x, ddy = a.y - b.y, dd = Math.hypot(ddx, ddy) || 1;
      if (dd > want) { b.x = a.x - (ddx / dd) * want; b.y = a.y - (ddy / dd) * want; }
      b.vx = (b.x - bx) / dt; b.vy = (b.y - by) / dt;
    }
    for (const s of sn.segs) {
      stageHp += Math.max(0, s.hp);
      if (s.flash > 0) s.flash -= dt;
      if (s.orbCd > 0) s.orbCd -= dt;
      // contact damage
      if (Math.hypot(s.x - p.x, s.y - p.y) < s.r + p.r * 0.75) hurtPlayer(g, (s === h ? 18 : 12) + g.stage * 0.6, s.x, s.y);
      // spitters
      if (s.kind === 'spitter' && visible(s) && g.phase === 'play') {
        s.spit -= dt;
        if (s.spit <= 0) { s.spit = Math.max(1.6, 4 - g.stage * 0.12) + g.rand() * 1.5; fireEnemy(g, s.x, s.y, Math.atan2(p.y - s.y, p.x - s.x), 230, 9 + g.stage * 0.3); }
      }
    }
    if (sn.boss && visible(h) && g.phase === 'play') {
      sn.fan -= dt; sn.ring -= dt;
      if (sn.fan <= 0) {
        sn.fan = Math.max(1.7, 3 - g.stage * 0.03);
        const base = Math.atan2(p.y - h.y, p.x - h.x), cnt = 5 + Math.min(4, Math.floor(g.stage / 10)) * 2;
        for (let j = 0; j < cnt; j++) fireEnemy(g, h.x, h.y, base + (j - (cnt - 1) / 2) * 0.2, 250, 10 + g.stage * 0.3, 10);
        g.events.push({ t: 'roar' });
      }
      if (sn.ring <= 0) {
        sn.ring = 7;
        const mid = sn.segs[Math.floor(sn.segs.length / 2)];
        if (mid && visible(mid)) for (let j = 0; j < 12; j++) fireEnemy(g, mid.x, mid.y, (j / 12) * TAU + g.t, 180, 9 + g.stage * 0.3, 9);
      }
    }
  }
  g.stageHp = stageHp;

  // minions
  if (g.phase === 'play') {
    g.wave -= dt;
    if (g.wave <= 0 && g.stage >= 2) {
      g.wave = isBossStage(g.stage) ? 9 : 13;
      spawnMinions(g, Math.min(8, 1 + Math.floor(g.stage / 3) + (isBossStage(g.stage) ? 2 : 0)));
    }
  }
  for (const m of g.minions) {
    const dx = p.x - m.x, dy = p.y - m.y, d = Math.hypot(dx, dy) || 1;
    let ax = dx / d, ay = dy / d;
    if (m.type.erratic) { const w = Math.sin(g.t * 3 + m.ph) * 0.9; const c = Math.cos(w), s2 = Math.sin(w); const nx = ax * c - ay * s2; ay = ax * s2 + ay * c; ax = nx; }
    const sp = m.type.speed * (1 + Math.min(0.5, g.stage * 0.02));
    m.vx += (ax * sp - m.vx) * Math.min(1, dt * 4); m.vy += (ay * sp - m.vy) * Math.min(1, dt * 4);
    m.x += m.vx * dt; m.y += m.vy * dt;
    if (m.flash > 0) m.flash -= dt;
    if (m.orbCd > 0) m.orbCd -= dt;
    if (d < m.r + p.r * 0.75) hurtPlayer(g, m.type.dmg + g.stage * 0.4, m.x, m.y);
  }

  // shooting
  if (g.phase === 'play') {
    const tgt = nearestSeg(g, p.x, p.y, 1100);
    if (tgt) {
      const dx = tgt.x - p.x, dy = tgt.y - p.y, d = Math.hypot(dx, dy);
      const tt = d / p.bspeed;
      p.aim = Math.atan2(dy + (tgt.vy || 0) * tt * 0.9, dx + (tgt.vx || 0) * tt * 0.9);
      p.cd -= dt;
      while (p.cd <= 0) {
        p.cd += 1 / (p.rate * (p.rage > 0 ? 1.3 : 1));
        const n = p.multi, spread = 0.13;
        for (let j = 0; j < n; j++) {
          const a = p.aim + (j - (n - 1) / 2) * spread;
          const crit = g.rand() < p.crit;
          g.bullets.push({ x: p.x + Math.cos(p.aim) * 22, y: p.y + Math.sin(p.aim) * 22, vx: Math.cos(a) * p.bspeed, vy: Math.sin(a) * p.bspeed, dmg: p.dmg * (p.rage > 0 ? 1.6 : 1) * (crit ? p.critMul : 1), crit, pierce: p.pierce, r: 6, life: 1.3, hit: [] });
        }
        g.shots++;
        g.events.push({ t: 'shoot' });
        if (p.cd < -0.2) p.cd = 0;
      }
    } else p.cd = Math.min(p.cd, 0);
  }

  // orbiting spores
  for (let i = 0; i < p.orbit; i++) {
    const a = p.orbAng + (i / p.orbit) * TAU;
    const ox = p.x + Math.cos(a) * 74, oy = p.y + Math.sin(a) * 74;
    for (const sn of g.snakes) for (const s of sn.segs) {
      if (s.orbCd <= 0 && s.hp > 0 && Math.hypot(s.x - ox, s.y - oy) < s.r + 10) { s.orbCd = 0.3; damageSeg(g, s, p.dmg * 0.8, false, ox, oy); }
    }
    for (const s of g.minions) if (s.orbCd <= 0 && s.hp > 0 && Math.hypot(s.x - ox, s.y - oy) < s.r + 10) { s.orbCd = 0.3; damageSeg(g, s, p.dmg * 0.8, false, ox, oy); }
  }

  // player bullets
  for (let bi = g.bullets.length - 1; bi >= 0; bi--) {
    const b = g.bullets[bi];
    if (p.homing > 0) {
      const t = nearestSeg(g, b.x, b.y, 260);
      if (t) {
        const sp = Math.hypot(b.vx, b.vy), cur = Math.atan2(b.vy, b.vx);
        const na = cur + clamp(angDiff(Math.atan2(t.y - b.y, t.x - b.x), cur), -p.homing * 2.2 * dt, p.homing * 2.2 * dt);
        b.vx = Math.cos(na) * sp; b.vy = Math.sin(na) * sp;
      }
    }
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    let dead = b.life <= 0 || b.x < -20 || b.x > W + 20 || b.y < -20 || b.y > H + 20;
    if (!dead) {
      const targets = [];
      for (const sn of g.snakes) for (const s of sn.segs) targets.push(s, sn);
      for (const s of g.minions) targets.push(s, null);
      outer: for (let ti = 0; ti < targets.length; ti += 2) {
        const s = targets[ti], sn = targets[ti + 1];
        if (s.hp <= 0 || b.hit.includes(s)) continue;
        if (Math.hypot(s.x - b.x, s.y - b.y) < s.r + b.r) {
          b.hit.push(s);
          damageSeg(g, s, b.dmg, b.crit, b.x, b.y);
          if (p.slow > 0 && sn) { sn.slow = 0.6 + p.slow * 0.5; }
          if (p.splash > 0) {
            const R = 40 + p.splash * 18;
            const sd = b.dmg * 0.4 * (0.5 + p.splash * 0.25);
            for (const o of g.snakes) for (const q of o.segs) if (q !== s && q.hp > 0 && Math.hypot(q.x - s.x, q.y - s.y) < R + q.r) damageSeg(g, q, sd, false, q.x, q.y);
            for (const q of g.minions) if (q !== s && q.hp > 0 && Math.hypot(q.x - s.x, q.y - s.y) < R + q.r) damageSeg(g, q, sd, false, q.x, q.y);
            g.events.push({ t: 'splash', x: s.x, y: s.y, r: R });
          }
          if (b.pierce-- <= 0) { dead = true; break outer; }
        }
      }
    }
    if (dead) g.bullets.splice(bi, 1);
  }

  // enemy bullets
  for (let i = g.ebullets.length - 1; i >= 0; i--) {
    const b = g.ebullets[i];
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    let dead = b.life <= 0 || b.x < -30 || b.x > W + 30 || b.y < -30 || b.y > H + 30;
    if (!dead && Math.hypot(b.x - p.x, b.y - p.y) < b.r + p.r * 0.7) { hurtPlayer(g, b.dmg, b.x - b.vx * 0.05, b.y - b.vy * 0.05); dead = true; }
    if (dead) g.ebullets.splice(i, 1);
  }

  reap(g);

  // pickups
  for (let i = g.pickups.length - 1; i >= 0; i--) {
    const pk = g.pickups[i];
    pk.age += dt;
    const d = Math.hypot(p.x - pk.x, p.y - pk.y);
    if (g.phase === 'clear' || (pk.age > 0.35 && d < p.magnet)) pk.vac = true;
    if (pk.vac) {
      const sp = 420 + pk.age * 90, a = Math.atan2(p.y - pk.y, p.x - pk.x);
      pk.vx = Math.cos(a) * sp; pk.vy = Math.sin(a) * sp;
    } else { const f = Math.exp(-4 * dt); pk.vx *= f; pk.vy *= f; }
    pk.x += pk.vx * dt; pk.y += pk.vy * dt;
    pk.x = clamp(pk.x, 6, W - 6); pk.y = clamp(pk.y, 6, H - 6);
    if (d < 26) { collect(g, pk); g.pickups.splice(i, 1); }
  }

  // stage clear
  if (g.phase === 'play' && !g.snakes.length) {
    g.phase = 'clear';
    g.clearT = 0;
    g.ebullets.length = 0;
    for (const m of g.minions) { dropPickup(g, 'gem', m.x, m.y, 1); g.events.push({ t: 'kill', x: m.x, y: m.y, r: m.r, kind: 'minion', art: m.type.art }); }
    g.minions.length = 0;
    const bonus = (10 + g.stage * 5) * (isBossStage(g.stage) ? 3 : 1);
    g.coins += bonus * p.coinMul;
    g.events.push({ t: 'clear', n: g.stage, bonus: Math.round(bonus * p.coinMul), boss: isBossStage(g.stage) });
  }
  if (g.phase === 'clear') {
    g.clearT += dt;
    if (g.clearT > 2.4 && !g.pickups.length) {
      p.hp = Math.min(p.maxHp, p.hp + Math.round(p.maxHp * 0.25));
      startStage(g, g.stage + 1);
    }
  }
  maybeLevelUp(g);
}

// ---------------------------------------------------------------- bot (tests + title attract mode)
export function botInput(g) {
  const p = g.p;
  let ax = 0, ay = 0;
  for (const sn of g.snakes) for (const s of sn.segs) {
    const dx = p.x - s.x, dy = p.y - s.y, d = Math.hypot(dx, dy) || 1, reach = 200 + s.r;
    if (d < reach) { const w = (reach - d) / reach; ax += (dx / d) * w * 2.4; ay += (dy / d) * w * 2.4; }
  }
  for (const s of g.minions) {
    const dx = p.x - s.x, dy = p.y - s.y, d = Math.hypot(dx, dy) || 1, reach = 110 + s.r;
    if (d < reach) { const w = (reach - d) / reach; ax += (dx / d) * w * 1.8; ay += (dy / d) * w * 1.8; }
  }
  for (const b of g.ebullets) {
    const dx = p.x - b.x, dy = p.y - b.y, d = Math.hypot(dx, dy) || 1;
    if (d < 120) { const w = (120 - d) / 120; ax += (dx / d) * w * 1.6; ay += (dy / d) * w * 1.6; }
  }
  ax += (W / 2 - p.x) / W * 0.6; ay += (H * 0.72 - p.y) / H * 1.0;
  if (p.x < 90) ax += 1.2; if (p.x > W - 90) ax -= 1.2; if (p.y > H - 90) ay -= 1.2;
  let best = null, bd = 260;
  for (const pk of g.pickups) { const d = Math.hypot(pk.x - p.x, pk.y - p.y); if (d < bd) { bd = d; best = pk; } }
  if (best) { ax += (best.x - p.x) / bd * 0.35; ay += (best.y - p.y) / bd * 0.35; }
  const l = Math.hypot(ax, ay);
  return l > 1 ? { mx: ax / l, my: ay / l } : { mx: ax, my: ay };
}
