// Cell Serpent: pure simulation (no DOM, no canvas). The browser and the headless test
// suite run this same file. All randomness comes from one seeded generator.
//
// The loop follows Cell Survivor - Shoot Defense: a long segmented virus crawls DOWN a
// winding track toward the bottom of the screen. Your cell sits near its spawn point,
// fires a capsule on its own, and you pick 1 of 3 random skills at every level-up and
// from the chests that appear at 25% and 50% of the virus's health. Kill every segment
// before they leak past the bottom line. Coins buy permanent Attack / Crit / Cooldown.
export const W = 720;
export const H = 1280;
export const LINE_Y = 1190;   // the membrane: segments that reach it leak and hurt
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

// ---------------------------------------------------------------- weapons (skills)
// Level 1..5. The first four are unlocked from the first run, the rest cost coins in the shop.
export const WEAPONS = [
  { id: 'swab', name: 'Sterile Swab', max: 5, cost: 0, desc: 'Plants a huge swab on the virus head. Bigger and longer with levels.' },
  { id: 'daggers', name: 'Spinning Daggers', max: 5, cost: 0, desc: 'Daggers orbit your cell and cut anything they touch.' },
  { id: 'tower', name: 'Medical Tower', max: 5, cost: 0, desc: 'Towers pulse area damage around your cell.' },
  { id: 'dragon', name: 'Snot Dragon', max: 5, cost: 0, desc: 'Fires homing snot balls that never miss.' },
  { id: 'needles', name: 'Acupuncture', max: 5, cost: 150, desc: 'A fan of piercing needles that skewer whole rows.' },
  { id: 'stick', name: 'Massage Stick', max: 5, cost: 150, desc: 'A stick sweeps in front of you and whacks segments.' },
  { id: 'bubble', name: 'Disinfectant Bubble', max: 5, cost: 250, desc: 'Floating bubbles burst on contact and slow the virus.' },
  { id: 'satellite', name: 'Satellite Storm', max: 5, cost: 400, desc: 'Lightning strikes that deal a percent of segment HP.' },
  { id: 'maw', name: 'Abyssal Maw', max: 5, cost: 600, desc: 'A maw that executes weakened segments outright.' },
];
const WEAPON = Object.fromEntries(WEAPONS.map(w => [w.id, w]));
export const PASSIVES = [
  { id: 'power', name: 'Strong Antibodies', max: 5, w: 0.9, desc: '+18% damage for every weapon', apply: () => {} },
  { id: 'haste', name: 'Hyper Metabolism', max: 5, w: 0.9, desc: 'Every weapon recharges 10% faster', apply: () => {} },
  { id: 'crit', name: 'Lethal Mutation', max: 5, w: 0.7, desc: '+8% crit chance for the capsule and needles', apply: p => { p.crit += 0.08; } },
  { id: 'vital', name: 'Thick Membrane', max: 5, w: 0.7, desc: '+30 max HP and heal 30', apply: p => { p.maxHp += 30; p.hp = Math.min(p.maxHp, p.hp + 30); } },
  { id: 'speed', name: 'Flagella', max: 4, w: 0.6, desc: '+12% move speed', apply: p => { p.speed *= 1.12; } },
  { id: 'magnet', name: 'Gravity Well', max: 4, w: 0.6, desc: '+40% pickup range', apply: p => { p.magnet *= 1.4; } },
];
const PASSIVE = Object.fromEntries(PASSIVES.map(u => [u.id, u]));
export const WEAPON_STARTERS = ['swab', 'daggers', 'tower', 'dragon'];

// ---------------------------------------------------------------- meta (shop)
export const META = [
  { id: 'atk', name: 'Attack', max: 12, base: 50, grow: 1.5, desc: l => `+${8 * l}% damage` },
  { id: 'crt', name: 'Crit', max: 10, base: 50, grow: 1.5, desc: l => `+${2 * l}% crit chance, +${8 * l}% crit damage` },
  { id: 'cdn', name: 'Cooldown', max: 10, base: 50, grow: 1.5, desc: l => `-${5 * l}% weapon cooldowns` },
  { id: 'vit', name: 'Vitality', max: 10, base: 40, grow: 1.5, desc: l => `+${12 * l} max HP` },
  { id: 'for', name: 'Fortune', max: 10, base: 60, grow: 1.55, desc: l => `+${10 * l}% coins` },
  { id: 'rev', name: 'Second Wind', max: 1, base: 500, grow: 1, desc: () => 'Revive once per run' },
];
export const metaCost = (def, lvl) => Math.round(def.base * Math.pow(def.grow, lvl));

export function defaultSave() {
  return { v: 2, coins: 0, meta: {}, unlocked: Object.fromEntries(WEAPON_STARTERS.map(id => [id, 1])), best: 0, runs: 0, kills: 0, muted: false };
}
export function sanitizeSave(raw) {
  const s = defaultSave();
  if (!raw || typeof raw !== 'object') return s;
  const num = (v, d = 0) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : d);
  s.coins = num(raw.coins); s.best = num(raw.best); s.runs = num(raw.runs); s.kills = num(raw.kills);
  s.muted = !!raw.muted;
  for (const d of META) s.meta[d.id] = Math.min(d.max, num(raw.meta && raw.meta[d.id]));
  for (const w of WEAPONS) if (raw.unlocked && raw.unlocked[w.id]) s.unlocked[w.id] = 1;
  return s;
}
export function buyMeta(save, id) {
  const d = META.find(m => m.id === id);
  if (!d) return false;
  const lvl = save.meta[id] || 0;
  if (lvl >= d.max) return false;
  const c = metaCost(d, lvl);
  if (save.coins < c) return false;
  save.coins -= c; save.meta[id] = lvl + 1;
  return true;
}
export function buyWeapon(save, id) {
  const w = WEAPON[id];
  if (!w || save.unlocked[id] || save.coins < w.cost) return false;
  save.coins -= w.cost; save.unlocked[id] = 1;
  return true;
}

// ---------------------------------------------------------------- tuning
export const hpBase = n => 5 * Math.pow(1.34, n - 1) + 1.5 * n;
export const isBossStage = n => n % 5 === 0;
export const snakeLength = n => (isBossStage(n) ? Math.min(46, Math.round(22 + n)) : Math.min(40, Math.round(10 + 2 * n)));
export const snakeSpeed = n => (isBossStage(n) ? Math.min(66, 30 + 1.2 * n) : Math.min(80, 34 + 1.6 * n));
export const xpNeed = lvl => Math.round(16 + 11 * (lvl - 1) + 2 * (lvl - 1) * (lvl - 1));
export const SKINS = ['pink', 'purple', 'mint', 'sun', 'sky'];
export const skinFor = n => SKINS[(n - 1 + Math.floor((n - 1) / 5)) % SKINS.length];
const NAMES = ['Love-Struck Virus', 'Rustic Virus', 'Sneezy Virus', 'Grumpy Flu', 'Sleepy Spore', 'Disco Germ', 'Sour Strain', 'Mighty Mold', 'Frosty Fever', 'Gloomy Gunk'];
export const virusName = n => NAMES[(n - 1) % NAMES.length] + (n > NAMES.length ? ' ' + 'I'.repeat(1 + Math.floor((n - 1) / NAMES.length)) : '');
export const spawnMode = n => (n % 2 === 1 ? 'bottom' : 'center');

const KIND = { normal: { hp: 1, xp: 1 }, armor: { hp: 2.6, xp: 2.2 }, bomb: { hp: 1, xp: 1.2 }, spitter: { hp: 1.2, xp: 1.4 }, gold: { hp: 1.6, xp: 1.5 } };

// Small crawlers that swarm in beside the virus. `art` is the drawing-kit sprite id.
export const MINIONS = [
  { id: 'green', art: 'green', unlock: 2, hp: 0.8, speed: 82, r: 17, dmg: 8, w: 3 },
  { id: 'red', art: 'red', unlock: 4, hp: 0.6, speed: 130, r: 16, dmg: 9, w: 2 },
  { id: 'yellow', art: 'yellow', unlock: 5, hp: 1, speed: 100, r: 16, dmg: 9, w: 2 },
  { id: 'jelly', art: 'jelly', unlock: 6, hp: 3, speed: 58, r: 25, dmg: 12, w: 1.5 },
  { id: 'eye', art: 'eye', unlock: 7, hp: 1.4, speed: 96, r: 20, dmg: 10, w: 1.5 },
  { id: 'robot', art: 'robot', unlock: 8, hp: 2, speed: 110, r: 22, dmg: 11, w: 1.2 },
  { id: 'bat', art: 'bat', unlock: 10, hp: 1.6, speed: 150, r: 24, dmg: 11, w: 1.2, erratic: true },
  { id: 'ghost', art: 'ghost', unlock: 12, hp: 2.2, speed: 90, r: 26, dmg: 12, w: 1, erratic: true },
];

// ---------------------------------------------------------------- the track
// A winding lane from above the screen down to the membrane. Segments ride it by arc length.
export function buildPath(n) {
  const k = n % 3, A = [230, 250, 205][k], lam = [640, 500, 780][k], ph = (n * 0.7) % TAU;
  const pts = [];
  for (let y = -160; y <= LINE_Y + 40; y += 6) pts.push({ x: W / 2 + A * Math.sin((y / lam) * TAU + ph), y });
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const end = pts.findIndex(p => p.y >= LINE_Y);
  return { pts, cum, len: cum[end < 0 ? cum.length - 1 : end] };
}
export function pointAt(path, s) {
  const { pts, cum } = path;
  if (s <= 0) { const a = pts[0], b = pts[1], d = Math.hypot(b.x - a.x, b.y - a.y) || 1; return { x: a.x + ((b.x - a.x) / d) * s, y: a.y + ((b.y - a.y) / d) * s }; }
  if (s >= cum[cum.length - 1]) { const p = pts[pts.length - 1]; return { x: p.x, y: p.y + (s - cum[cum.length - 1]) }; }
  let lo = 0, hi = cum.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
  const t = (s - cum[lo]) / (cum[hi] - cum[lo] || 1);
  return { x: pts[lo].x + (pts[hi].x - pts[lo].x) * t, y: pts[lo].y + (pts[hi].y - pts[lo].y) * t };
}

// ---------------------------------------------------------------- player
export function makePlayer(metaLv) {
  const m = id => (metaLv && metaLv[id]) || 0;
  const maxHp = 100 + 12 * m('vit');
  return {
    x: W / 2, y: 1090, r: 16, kx: 0, ky: 0, maxHp, hp: maxHp, speed: 270,
    atk: 1 + 0.08 * m('atk'), crit: 0.05 + 0.02 * m('crt'), critMul: 2.5 + 0.08 * m('crt'), cdBase: 1 - 0.05 * m('cdn'),
    rate: 2.6, bspeed: 900, magnet: 130,
    coinMul: 1 + 0.1 * m('for'), revive: m('rev') > 0 ? 1 : 0,
    iframes: 0, shield: 0, rage: 0, cd: 0, aim: -Math.PI / 2, orbAng: 0, regenAcc: 0, mx: 0, my: 0,
    zone: { x0: 40, x1: W - 40, y0: 930, y1: 1200 },
  };
}

// ---------------------------------------------------------------- snakes
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
  const sc = boss ? 1.3 : 1;
  if (i === 0) return 38 * sc;
  const fromTail = len - 1 - i;
  const taper = fromTail < 5 ? 0.62 + 0.38 * (fromTail / 5) : 1;
  return 30 * sc * taper;
}

function spawnSnake(g, n) {
  const boss = isBossStage(n), len = snakeLength(n), segs = [];
  let ps = 240;   // the head starts just inside the top edge
  for (let i = 0; i < len; i++) {
    const kind = pickKind(g, n, boss, i, len), r = segRadius(boss, i, len);
    let hp = hpBase(n) * KIND[kind].hp * (boss ? 1.5 : 1) * (0.9 + g.rand() * 0.2);
    if (i === 0) hp *= boss ? 3 : 2;
    hp = Math.max(1, Math.round(hp));
    const pos = pointAt(g.path, ps);
    segs.push({ ps, x: pos.x, y: pos.y, ang: Math.PI / 2, r, hp, max: hp, kind, flash: 0, orbCd: 0, spit: 1.5 + g.rand() * 2.5, i });
    ps -= (r + segRadius(boss, i + 1, len)) * 0.78;
  }
  g.snakes.push({ id: ++g.sid, segs, speed: snakeSpeed(n), slow: 0, boss, skin: skinFor(n), name: virusName(n), fan: 2.5, ring: 6 });
  g.stageHpMax += segs.reduce((a, s) => a + s.max, 0);
}

export function startStage(g, n) {
  g.stage = n;
  g.snakes.length = 0; g.stageHpMax = 0; g.ebullets.length = 0; g.minions.length = 0; g.zones.length = 0; g.maws.length = 0; g.bullets.length = 0;
  g.wave = isBossStage(n) ? 4 : 9;
  g.path = buildPath(n);
  g.chestsDone = { 25: false, 50: false };
  const p = g.p, bottom = spawnMode(n) === 'bottom';
  p.zone = bottom ? { x0: 40, x1: W - 40, y0: 930, y1: 1200 } : { x0: 40, x1: W - 40, y0: 560, y1: 900 };
  p.x = W / 2; p.y = bottom ? 1090 : 740; p.kx = p.ky = 0;
  spawnSnake(g, n);
  rebuildTowers(g);
  g.phase = 'play'; g.clearT = 0; g.progress = 0;
  g.events.push({ t: 'stage', n, boss: isBossStage(n), name: virusName(n), mode: bottom ? 'bottom' : 'center' });
}

// ---------------------------------------------------------------- game
export function createGame(opts = {}) {
  const g = {
    rand: rng(opts.seed || 1), t: 0, phase: 'play', stage: 0, sid: 0, path: null,
    p: makePlayer(opts.meta), snakes: [], minions: [], wave: 9, bullets: [], ebullets: [], pickups: [], zones: [], maws: [], towers: [],
    events: [], ups: {}, weap: {}, unlocked: Object.assign(Object.fromEntries(WEAPON_STARTERS.map(id => [id, 1])), opts.unlocked || {}),
    level: 1, xp: 0, xpNeed: xpNeed(1), pending: 0, choices: [], resume: 'play', chest: false,
    coins: 0, kills: 0, score: 0, combo: 0, lastKill: -99, stageHp: 0, stageHpMax: 0, progress: 0, clearT: 0, chestsDone: {}, lastKillPos: { x: W / 2, y: 300 },
    revived: false, result: null, bot: !!opts.bot, shots: 0, leaks: 0,
  };
  startStage(g, opts.stage || 1);
  if (opts.firstPick) { g.pending = 1; g.chest = true; }
  return g;
}

const visible = s => s.y > 8 && s.y < H - 8 && s.x > 8 && s.x < W - 8;
const lv = (g, id) => (g.weap[id] ? g.weap[id].lv : 0);
const dmgMul = g => g.p.atk * (1 + 0.18 * (g.ups.power || 0));
const cdMul = g => g.p.cdBase * Math.pow(0.9, g.ups.haste || 0);

function eachTarget(g, fn) {
  for (const sn of g.snakes) for (const s of sn.segs) if (s.hp > 0) fn(s, sn);
  for (const s of g.minions) if (s.hp > 0) fn(s, null);
}
function nearestTarget(g, x, y, maxD = 1e9, needVisible = true) {
  let best = null, bd = maxD;
  eachTarget(g, (s, sn) => {
    if (needVisible && !visible(s)) return;
    const d = Math.hypot(s.x - x, s.y - y) - s.r - (sn ? 0 : 30);
    if (d < bd) { bd = d; best = s; }
  });
  return best;
}
// the segment closest to leaking: the front of the most advanced piece
function frontSegs(g) {
  return g.snakes.map(sn => sn.segs[0]).filter(s => s && visible(s)).sort((a, b) => b.ps - a.ps);
}

function damageSeg(g, s, dmg, crit, x, y) {
  if (s.hp <= 0) return;
  s.hp -= dmg; s.flash = 0.12;
  g.events.push({ t: 'hit', x: x ?? s.x, y: y ?? s.y, d: dmg, crit: !!crit, s });
}
function dropPickup(g, kind, x, y, v) {
  const a = g.rand() * TAU, sp = 90 + g.rand() * 170;
  g.pickups.push({ kind, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, v, age: 0, vac: false });
}

function onMinionKill(g, m) {
  g.kills++;
  g.combo = g.t - g.lastKill < 2.2 ? Math.min(99, g.combo + 1) : 1; g.lastKill = g.t;
  g.score += Math.round(m.max * 12 * (1 + Math.min(g.combo, 50) * 0.05));
  dropPickup(g, 'gem', m.x, m.y, (1.2 + g.stage * 0.2) * m.type.hp);
  if (g.rand() < 0.4) dropPickup(g, 'coin', m.x, m.y, 1);
  if (g.rand() < 0.05) dropPickup(g, ['heal', 'shield', 'rage'][Math.floor(g.rand() * 3)], m.x, m.y, 1);
  g.events.push({ t: 'kill', x: m.x, y: m.y, r: m.r, kind: 'minion', art: m.type.art });
}

function onKill(g, s, sn) {
  const st = g.stage;
  if (s.leaked) return;
  g.kills++;
  g.lastKillPos = { x: s.x, y: s.y };
  g.combo = g.t - g.lastKill < 2.2 ? Math.min(99, g.combo + 1) : 1; g.lastKill = g.t;
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
    for (const o of g.snakes) for (const q of o.segs) if (q !== s && q.hp > 0 && Math.hypot(q.x - s.x, q.y - s.y) < R + q.r) damageSeg(g, q, Math.max(2, s.max * 0.9), false, q.x, q.y);
    for (const q of g.minions) if (q.hp > 0 && Math.hypot(q.x - s.x, q.y - s.y) < R + q.r) damageSeg(g, q, Math.max(3, s.max), false, q.x, q.y);
    if (Math.hypot(g.p.x - s.x, g.p.y - s.y) < R) hurtPlayer(g, 14, s.x, s.y);
  }
}

// Remove dead segments. A kill in the middle splits the virus in two pieces; both keep crawling.
function reap(g) {
  if (g.minions.some(m => m.hp <= 0)) g.minions = g.minions.filter(m => { if (m.hp > 0) return true; onMinionKill(g, m); return false; });
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
      parts.forEach(segs => {
        if (segs[0] === sn.segs[0]) { sn.segs = segs; next.push(sn); return; }
        next.push({ ...sn, id: ++g.sid, segs, boss: false, slow: 0 });
        g.events.push({ t: 'split', x: segs[0].x, y: segs[0].y });
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
  p.hp -= dmg; p.iframes = 0.9;
  const a = Math.atan2(p.y - fy, p.x - fx);
  p.kx = Math.cos(a) * 520; p.ky = Math.sin(a) * 520;
  g.combo = 0;
  g.events.push({ t: 'hurt', x: p.x, y: p.y, d: dmg });
  if (p.hp <= 0) {
    if (p.revive > 0 && !g.revived) {
      g.revived = true; p.revive = 0; p.hp = Math.round(p.maxHp * 0.5); p.iframes = 2.2; g.ebullets.length = 0;
      g.events.push({ t: 'revive' });
    } else {
      p.hp = 0; g.phase = 'dead';
      g.result = { stage: g.stage, kills: g.kills, coins: Math.floor(g.coins), score: g.score, level: g.level, time: g.t, boss: isBossStage(g.stage), name: virusName(g.stage) };
      g.events.push({ t: 'dead' });
    }
  }
}
// a segment slipped past the membrane: leaks always hurt, whatever i-frames you have
function leak(g, s, sn) {
  s.leaked = true; s.hp = 0; g.leaks++;
  const dmg = (s === sn.segs[0] ? 10 + g.stage * 0.5 : 4 + g.stage * 0.35);
  const p = g.p, keep = p.iframes;
  p.iframes = 0;
  g.events.push({ t: 'leak', x: s.x, y: LINE_Y, d: dmg });
  hurtPlayer(g, dmg, s.x, LINE_Y - 80);
  p.iframes = Math.max(keep, 0);
}

// ---------------------------------------------------------------- level-up and chests
function rollChoices(g) {
  const pool = [];
  const owned = Object.keys(g.weap).length;
  for (const w of WEAPONS) {
    if (!g.unlocked[w.id]) continue;
    const l = lv(g, w.id);
    if (l >= w.max) continue;
    if (!l && owned >= 6) continue;
    pool.push({ id: w.id, kind: 'weapon', name: w.name, desc: w.desc, lvl: l, max: w.max, isNew: !l, w: l ? (g.chest ? 2.2 : 1.7) : (g.chest ? 1.6 : 1.2) });
  }
  for (const u of PASSIVES) { const l = g.ups[u.id] || 0; if (l < u.max) pool.push({ id: u.id, kind: 'passive', name: u.name, desc: u.desc, lvl: l, max: u.max, isNew: !l, w: g.chest ? 0.4 : u.w }); }
  const out = [];
  while (out.length < 3 && pool.length) {
    const tot = pool.reduce((a, u) => a + u.w, 0);
    let r = g.rand() * tot, k = 0;
    for (; k < pool.length - 1; k++) { r -= pool[k].w; if (r <= 0) break; }
    out.push(pool.splice(k, 1)[0]);
  }
  return out;
}
function maybeLevelUp(g) {
  if (g.pending > 0 && (g.phase === 'play' || g.phase === 'clear')) {
    g.resume = g.phase; g.phase = 'levelup';
    g.choices = rollChoices(g);
    if (!g.choices.length) { g.pending = 0; g.phase = g.resume; return; }
    g.events.push({ t: 'levelup', level: g.level, chest: g.chest });
  }
}
function rebuildTowers(g) {
  const L = lv(g, 'tower'), n = L ? 1 + (L >= 3 ? 1 : 0) + (L >= 5 ? 1 : 0) : 0;
  const offs = [[-150, -40], [150, -40], [0, -150]], p = g.p;
  g.towers = Array.from({ length: n }, (_, i) => ({ x: p.x + offs[i][0], y: p.y + offs[i][1], cd: 0.8 + i * 0.4, pulse: 0 }));
}
export function choose(g, idx) {
  if (g.phase !== 'levelup') return false;
  const c = g.choices[idx];
  if (!c) return false;
  if (c.kind === 'weapon') {
    const w = g.weap[c.id] || (g.weap[c.id] = { lv: 0, cd: 0.5 });
    w.lv++;
    if (c.id === 'tower') rebuildTowers(g);
  } else { PASSIVE[c.id].apply(g.p); g.ups[c.id] = (g.ups[c.id] || 0) + 1; }
  g.pending--;
  g.events.push({ t: 'upgrade', id: c.id, kind: c.kind });
  if (g.pending > 0) { g.choices = rollChoices(g); if (!g.choices.length) { g.pending = 0; g.phase = g.resume; } } else { g.phase = g.resume; g.chest = false; }
  return true;
}
function collect(g, pk) {
  const p = g.p;
  if (pk.kind === 'heal') { p.hp = Math.min(p.maxHp, p.hp + Math.round(p.maxHp * 0.3)); g.events.push({ t: 'power', kind: 'heal', x: pk.x, y: pk.y }); return; }
  if (pk.kind === 'shield') { p.shield = 6; g.events.push({ t: 'power', kind: 'shield', x: pk.x, y: pk.y }); return; }
  if (pk.kind === 'rage') { p.rage = 8; g.events.push({ t: 'power', kind: 'rage', x: pk.x, y: pk.y }); return; }
  if (pk.kind === 'chest') {
    g.coins += (10 + g.stage * 2) * p.coinMul; g.pending++; g.chest = true;
    g.events.push({ t: 'chest', x: pk.x, y: pk.y }); return;
  }
  if (pk.kind === 'coin') { g.coins += pk.v * p.coinMul; g.events.push({ t: 'coin', x: pk.x, y: pk.y, v: pk.v }); return; }
  g.xp += pk.v;
  g.events.push({ t: 'gem', x: pk.x, y: pk.y });
  while (g.xp >= g.xpNeed) { g.xp -= g.xpNeed; g.level++; g.xpNeed = xpNeed(g.level); g.pending++; }
}
function fireEnemy(g, x, y, a, sp, dmg, r) {
  g.ebullets.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: r || 9, dmg, life: 6 });
  g.events.push({ t: 'spit', x, y });
}

// ---------------------------------------------------------------- weapons
function fire(g, o) {
  g.bullets.push({ x: o.x, y: o.y, vx: Math.cos(o.a) * o.sp, vy: Math.sin(o.a) * o.sp, dmg: o.dmg, crit: !!o.crit, pierce: o.pierce || 0, r: o.r || 6, life: o.life || 1.3, hit: [], kind: o.kind || 'pill', home: o.home || 0, splash: o.splash || 0, slow: o.slow || 0 });
}
function updateWeapons(g, dt, canFire) {
  const p = g.p, dm = dmgMul(g), cm = cdMul(g);
  const wantTowers = lv(g, 'tower') ? 1 + (lv(g, 'tower') >= 3 ? 1 : 0) + (lv(g, 'tower') >= 5 ? 1 : 0) : 0;
  if (g.towers.length !== wantTowers) rebuildTowers(g);
  const tgt = nearestTarget(g, p.x, p.y, 1400);
  const aim = tgt ? Math.atan2(tgt.y - p.y, tgt.x - p.x) : -Math.PI / 2;
  for (const id of Object.keys(g.weap)) {
    const w = g.weap[id], L = w.lv;
    if (id === 'daggers' || id === 'stick' || id === 'tower') continue;   // continuous / own timers below
    w.cd -= dt;
    if (w.cd > 0 || !canFire) continue;
    if (id === 'swab') {
      const fronts = frontSegs(g);
      if (!fronts.length) { w.cd = 0.3; continue; }
      const n = 1 + (L >= 4 ? 1 : 0);
      for (let k = 0; k < n; k++) {
        const t = fronts[k] || fronts[0], off = k >= fronts.length ? 90 : 0, dur = 2.6 + 0.5 * L;
        g.zones.push({ x: t.x + off, y: t.y, r: 62 + 16 * L, life: dur, max: dur, tick: 0, dmg: 2.4 * (1 + 0.3 * L) * dm });
      }
      g.events.push({ t: 'swab' }); w.cd = (4.2 - 0.3 * L) * cm;
    } else if (id === 'dragon') {
      if (!tgt) { w.cd = 0.3; continue; }
      const n = 1 + Math.floor((L + 1) / 2);
      for (let k = 0; k < n; k++) fire(g, { x: p.x, y: p.y - 20, a: -Math.PI / 2 + (k - (n - 1) / 2) * 0.7, sp: 440, dmg: 7 * (1 + 0.4 * L) * dm, r: 11, life: 2.6, kind: 'snot', home: 7, splash: 46 });
      g.events.push({ t: 'dragon' }); w.cd = (1.8 - 0.1 * L) * cm;
    } else if (id === 'needles') {
      if (!tgt) { w.cd = 0.3; continue; }
      const n = 3 + L;
      for (let k = 0; k < n; k++) {
        const crit = g.rand() < p.crit;
        fire(g, { x: p.x, y: p.y - 10, a: aim + (k - (n - 1) / 2) * 0.09, sp: 1100, dmg: 2.6 * (1 + 0.3 * L) * dm * (crit ? p.critMul : 1), crit, pierce: 2 + L, r: 5, life: 1.2, kind: 'needle' });
      }
      g.events.push({ t: 'needles' }); w.cd = (1.8 - 0.12 * L) * cm;
    } else if (id === 'bubble') {
      if (!tgt) { w.cd = 0.3; continue; }
      for (let k = 0; k < (L >= 4 ? 2 : 1); k++) fire(g, { x: p.x, y: p.y - 30, a: aim + (k ? 0.5 : 0), sp: 190, dmg: 4 * (1 + 0.3 * L) * dm, r: 22 + 3 * L, life: 3.2, kind: 'bubble', splash: 70 + 10 * L, slow: 2 });
      g.events.push({ t: 'bubble' }); w.cd = (3.4 - 0.2 * L) * cm;
    } else if (id === 'satellite') {
      const vis = []; eachTarget(g, s => { if (visible(s)) vis.push(s); });
      if (!vis.length) { w.cd = 0.3; continue; }
      vis.sort((a, b) => b.hp - a.hp);
      for (let k = 0; k < 1 + Math.floor((L + 1) / 2); k++) {
        const s = vis[Math.floor(g.rand() * Math.min(vis.length, 5))];
        damageSeg(g, s, Math.max(6 * (1 + 0.3 * L) * dm, s.max * (0.05 + 0.015 * L) * Math.min(dm, 3)), false, s.x, s.y);
        g.events.push({ t: 'strike', x: s.x, y: s.y });
      }
      w.cd = (3.6 - 0.25 * L) * cm;
    } else if (id === 'maw') {
      const vis = []; eachTarget(g, s => { if (visible(s)) vis.push(s); });
      if (!vis.length) { w.cd = 0.3; continue; }
      vis.sort((a, b) => b.hp - a.hp);
      const t = vis[Math.floor(g.rand() * Math.min(vis.length, 3))];
      g.maws.push({ x: t.x, y: t.y, r: 110 + 12 * L, life: 1.6, max: 1.6, tick: 0, exec: 0.15 + 0.04 * L, dmg: 3 * (1 + 0.3 * L) * dm });
      g.events.push({ t: 'maw', x: t.x, y: t.y }); w.cd = (7.5 - 0.6 * L) * cm;
    }
  }
  // spinning daggers (orbit)
  const dl = lv(g, 'daggers');
  if (dl) {
    p.orbAng += dt * (3.2 + 0.2 * dl);
    for (let i = 0; i < 1 + dl; i++) {
      const pos = daggerPos(g, i);
      eachTarget(g, s => { if (s.orbCd <= 0 && Math.hypot(s.x - pos.x, s.y - pos.y) < s.r + 12) { s.orbCd = 0.3; damageSeg(g, s, 4 * (1 + 0.3 * dl) * dm, false, pos.x, pos.y); } });
    }
  }
  // massage stick (sweeping bar)
  const sl = lv(g, 'stick');
  if (sl) {
    for (let k = 0; k < (sl >= 4 ? 2 : 1); k++) {
      const sg = stickSeg(g, k);
      eachTarget(g, s => {
        if (s.orbCd > 0) return;
        if (distToSeg(s.x, s.y, sg.x0, sg.y0, sg.x1, sg.y1) < s.r + 12) { s.orbCd = 0.35; damageSeg(g, s, 6 * (1 + 0.35 * sl) * dm, false, s.x, s.y); }
      });
    }
  }
  // medical towers pulse
  const tl = lv(g, 'tower');
  for (const t of g.towers) {
    t.cd -= dt; if (t.pulse > 0) t.pulse -= dt;
    if (t.cd <= 0 && canFire) {
      t.cd = (2.4 - 0.15 * tl) * cm; t.pulse = 0.5;
      const R = 170 + 18 * tl;
      g.events.push({ t: 'pulse', x: t.x, y: t.y, r: R });
      eachTarget(g, s => { if (Math.hypot(s.x - t.x, s.y - t.y) < R + s.r) damageSeg(g, s, 5 * (1 + 0.35 * tl) * dm, false, s.x, s.y); });
    }
  }
  // swab zones tick
  for (let i = g.zones.length - 1; i >= 0; i--) {
    const z = g.zones[i]; z.life -= dt; z.tick -= dt;
    if (z.tick <= 0) { z.tick = 0.25; eachTarget(g, s => { if (Math.hypot(s.x - z.x, s.y - z.y) < z.r + s.r) damageSeg(g, s, z.dmg, false, s.x, s.y); }); }
    if (z.life <= 0) g.zones.splice(i, 1);
  }
  // maws execute
  for (let i = g.maws.length - 1; i >= 0; i--) {
    const m = g.maws[i]; m.life -= dt; m.tick -= dt;
    if (m.tick <= 0) {
      m.tick = 0.2;
      eachTarget(g, s => {
        if (Math.hypot(s.x - m.x, s.y - m.y) >= m.r + s.r) return;
        if (s.hp <= s.max * m.exec) damageSeg(g, s, s.hp + 1, false, s.x, s.y); else damageSeg(g, s, m.dmg, false, s.x, s.y);
      });
    }
    if (m.life <= 0) g.maws.splice(i, 1);
  }
}
export function daggerPos(g, i) {
  const dl = lv(g, 'daggers'), p = g.p, a = p.orbAng + (i / Math.max(1, 1 + dl)) * TAU, R = 92 + 8 * dl;
  return { x: p.x + Math.cos(a) * R, y: p.y + Math.sin(a) * R, a };
}
export function stickSeg(g, k = 0) {
  const sl = lv(g, 'stick'), p = g.p, len = 150 + 12 * sl;
  const a = -Math.PI / 2 + Math.sin(g.t * 2.2 + k * Math.PI) * 1.15;
  return { x0: p.x, y0: p.y, x1: p.x + Math.cos(a) * len, y1: p.y + Math.sin(a) * len, a, len };
}
function distToSeg(px, py, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy || 1;
  const t = clamp(((px - x0) * dx + (py - y0) * dy) / l2, 0, 1);
  return Math.hypot(px - (x0 + dx * t), py - (y0 + dy * t));
}

// ---------------------------------------------------------------- step
export function step(g, dt, input) {
  if (g.phase !== 'play' && g.phase !== 'clear') return;
  g.t += dt;
  const p = g.p;

  // player movement, kept inside the spawn zone
  const mx = input ? clamp(input.mx || 0, -1, 1) : 0, my = input ? clamp(input.my || 0, -1, 1) : 0;
  const ml = Math.hypot(mx, my), k = ml > 1 ? 1 / ml : 1;
  p.mx = mx * k; p.my = my * k;
  p.x += (p.mx * p.speed + p.kx) * dt; p.y += (p.my * p.speed + p.ky) * dt;
  const kd = Math.exp(-9 * dt); p.kx *= kd; p.ky *= kd;
  p.x = clamp(p.x, p.zone.x0, p.zone.x1); p.y = clamp(p.y, p.zone.y0, p.zone.y1);
  if (p.iframes > 0) p.iframes -= dt;
  if (p.shield > 0) p.shield -= dt;
  if (p.rage > 0) p.rage -= dt;

  // the virus rides the track
  let stageHp = 0;
  for (const sn of g.snakes) {
    sn.slow = Math.max(0, sn.slow - dt);
    const v = sn.speed * (sn.slow > 0 ? 0.55 : 1) * (g.phase === 'clear' ? 0 : 1);
    for (const s of sn.segs) {
      const ox = s.x, oy = s.y;
      s.ps += v * dt;
      const pos = pointAt(g.path, s.ps), pa = pointAt(g.path, s.ps - 8), pb = pointAt(g.path, s.ps + 8);
      s.x = pos.x; s.y = pos.y; s.ang = Math.atan2(pb.y - pa.y, pb.x - pa.x);
      s.vx = (s.x - ox) / dt; s.vy = (s.y - oy) / dt;
      stageHp += Math.max(0, s.hp);
      if (s.flash > 0) s.flash -= dt;
      if (s.orbCd > 0) s.orbCd -= dt;
      if (s.hp > 0 && Math.hypot(s.x - p.x, s.y - p.y) < s.r + p.r * 0.75) hurtPlayer(g, 12 + g.stage * 0.6, s.x, s.y);
      if (s.kind === 'spitter' && visible(s) && g.phase === 'play' && s.hp > 0) {
        s.spit -= dt;
        if (s.spit <= 0) { s.spit = Math.max(1.6, 4 - g.stage * 0.12) + g.rand() * 1.5; fireEnemy(g, s.x, s.y, Math.atan2(p.y - s.y, p.x - s.x), 230, 9 + g.stage * 0.3); }
      }
    }
    const h = sn.segs[0];
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
  g.progress = g.stageHpMax ? clamp(1 - stageHp / g.stageHpMax, 0, 1) : 0;
  for (const sn of g.snakes) for (const s of sn.segs) if (s.hp > 0 && s.ps >= g.path.len) leak(g, s, sn);

  // minions walk in from the top and chase
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
    if (m.type.erratic) { const w = Math.sin(g.t * 3 + m.ph) * 0.9, c = Math.cos(w), s2 = Math.sin(w); const nx = ax * c - ay * s2; ay = ax * s2 + ay * c; ax = nx; }
    const sp = m.type.speed * (1 + Math.min(0.5, g.stage * 0.02));
    m.vx += (ax * sp - m.vx) * Math.min(1, dt * 4); m.vy += (ay * sp - m.vy) * Math.min(1, dt * 4);
    m.x += m.vx * dt; m.y += m.vy * dt;
    if (m.flash > 0) m.flash -= dt;
    if (m.orbCd > 0) m.orbCd -= dt;
    if (d < m.r + p.r * 0.75) hurtPlayer(g, m.type.dmg + g.stage * 0.4, m.x, m.y);
  }

  // the capsule is always on; skills fire on their own timers
  const canFire = g.phase === 'play';
  if (canFire) {
    const tgt = nearestTarget(g, p.x, p.y, 1400);
    if (tgt) {
      const dx = tgt.x - p.x, dy = tgt.y - p.y, tt = Math.hypot(dx, dy) / p.bspeed;
      p.aim = Math.atan2(dy + (tgt.vy || 0) * tt * 0.9, dx + (tgt.vx || 0) * tt * 0.9);
      p.cd -= dt;
      while (p.cd <= 0) {
        p.cd += (1 / p.rate) * cdMul(g) * (p.rage > 0 ? 0.77 : 1);
        const crit = g.rand() < p.crit;
        fire(g, { x: p.x + Math.cos(p.aim) * 22, y: p.y + Math.sin(p.aim) * 22, a: p.aim, sp: p.bspeed, dmg: 3 * dmgMul(g) * (p.rage > 0 ? 1.6 : 1) * (crit ? p.critMul : 1), crit, r: 6, life: 1.3, kind: 'pill' });
        g.shots++; g.events.push({ t: 'shoot' });
        if (p.cd < -0.2) p.cd = 0;
      }
    } else p.cd = Math.min(p.cd, 0);
  }
  updateWeapons(g, dt, canFire);

  // projectiles
  for (let bi = g.bullets.length - 1; bi >= 0; bi--) {
    const b = g.bullets[bi];
    if (b.home > 0) {
      const t = nearestTarget(g, b.x, b.y, 320);
      if (t) {
        const sp = Math.hypot(b.vx, b.vy), cur = Math.atan2(b.vy, b.vx);
        const na = cur + clamp(angDiff(Math.atan2(t.y - b.y, t.x - b.x), cur), -b.home * dt, b.home * dt);
        b.vx = Math.cos(na) * sp; b.vy = Math.sin(na) * sp;
      }
    }
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    let dead = b.life <= 0 || b.x < -30 || b.x > W + 30 || b.y < -30 || b.y > H + 30;
    if (!dead) {
      const test = (s, sn) => {
        if (dead || s.hp <= 0 || b.hit.includes(s) || Math.hypot(s.x - b.x, s.y - b.y) >= s.r + b.r) return;
        b.hit.push(s);
        damageSeg(g, s, b.dmg, b.crit, b.x, b.y);
        if (b.slow && sn) sn.slow = Math.max(sn.slow, b.slow);
        if (b.splash > 0) {
          const sd = b.dmg * (b.kind === 'bubble' ? 2.2 : 0.5);
          eachTarget(g, (q, qs) => { if (q !== s && Math.hypot(q.x - s.x, q.y - s.y) < b.splash + q.r) { damageSeg(g, q, sd, false, q.x, q.y); if (b.slow && qs) qs.slow = Math.max(qs.slow, b.slow); } });
          g.events.push({ t: b.kind === 'bubble' ? 'burst' : 'splash', x: s.x, y: s.y, r: b.splash });
        }
        if (b.pierce-- <= 0) dead = true;
      };
      for (const sn of g.snakes) for (const s of sn.segs) test(s, sn);
      for (const s of g.minions) test(s, null);
    }
    if (dead) g.bullets.splice(bi, 1);
  }
  for (let i = g.ebullets.length - 1; i >= 0; i--) {
    const b = g.ebullets[i];
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    let dead = b.life <= 0 || b.x < -30 || b.x > W + 30 || b.y < -30 || b.y > H + 30;
    if (!dead && Math.hypot(b.x - p.x, b.y - p.y) < b.r + p.r * 0.7) { hurtPlayer(g, b.dmg, b.x - b.vx * 0.05, b.y - b.vy * 0.05); dead = true; }
    if (dead) g.ebullets.splice(i, 1);
  }

  reap(g);

  // chests at 25% and 50% of the virus's health
  for (const th of [25, 50]) {
    if (!g.chestsDone[th] && g.progress >= th / 100 && g.phase === 'play') {
      g.chestsDone[th] = true;
      g.pickups.push({ kind: 'chest', x: clamp(g.lastKillPos.x, 80, W - 80), y: clamp(g.lastKillPos.y, 160, 700), vx: 0, vy: 0, v: 1, age: 0, vac: false });
      g.events.push({ t: 'chestdrop', pct: th });
    }
  }

  // pickups drift toward you
  for (let i = g.pickups.length - 1; i >= 0; i--) {
    const pk = g.pickups[i];
    pk.age += dt;
    const d = Math.hypot(p.x - pk.x, p.y - pk.y);
    const range = pk.kind === 'chest' ? 99999 : p.magnet;
    if (g.phase === 'clear' || (pk.age > 0.35 && d < range)) pk.vac = true;
    if (pk.vac) {
      const sp = (pk.kind === 'chest' ? 260 : 420) + pk.age * 90, a = Math.atan2(p.y - pk.y, p.x - pk.x);
      pk.vx = Math.cos(a) * sp; pk.vy = Math.sin(a) * sp;
    } else { const f = Math.exp(-4 * dt); pk.vx *= f; pk.vy *= f; pk.vy += 40 * dt; }
    pk.x += pk.vx * dt; pk.y += pk.vy * dt;
    pk.x = clamp(pk.x, 6, W - 6); pk.y = clamp(pk.y, 6, H - 6);
    if (d < (pk.kind === 'chest' ? 40 : 26)) { collect(g, pk); g.pickups.splice(i, 1); }
  }

  // chapter clear
  if (g.phase === 'play' && !g.snakes.length) {
    g.phase = 'clear'; g.clearT = 0; g.ebullets.length = 0;
    for (const m of g.minions) { dropPickup(g, 'gem', m.x, m.y, 1); g.events.push({ t: 'kill', x: m.x, y: m.y, r: m.r, kind: 'minion', art: m.type.art }); }
    g.minions.length = 0;
    const bonus = (10 + g.stage * 5) * (isBossStage(g.stage) ? 3 : 1);
    g.coins += bonus * p.coinMul;
    g.pickups.push({ kind: 'chest', x: W / 2, y: 300, vx: 0, vy: 0, v: 1, age: 0, vac: false });
    g.events.push({ t: 'clear', n: g.stage, bonus: Math.round(bonus * p.coinMul), boss: isBossStage(g.stage), name: virusName(g.stage) });
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

function spawnMinions(g, n) {
  const pool = MINIONS.filter(m => m.unlock <= g.stage);
  if (!pool.length) return;
  for (let i = 0; i < n; i++) {
    const tot = pool.reduce((a, m) => a + m.w, 0);
    let r = g.rand() * tot, k = 0;
    for (; k < pool.length - 1; k++) { r -= pool[k].w; if (r <= 0) break; }
    const t = pool[k], side = Math.floor(g.rand() * 3);
    const x = side === 0 ? -20 : side === 1 ? W + 20 : 40 + g.rand() * (W - 80), y = side === 2 ? -20 : 80 + g.rand() * 400;
    const hp = Math.max(1, Math.round(hpBase(g.stage) * 0.8 * t.hp));
    g.minions.push({ x, y, vx: 0, vy: 0, r: t.r, hp, max: hp, type: t, flash: 0, orbCd: 0, ph: g.rand() * TAU, kind: 'minion' });
  }
  g.events.push({ t: 'swarm', n });
}

// ---------------------------------------------------------------- bot (tests + title attract mode)
export function botInput(g) {
  const p = g.p;
  let ax = 0, ay = 0;
  for (const sn of g.snakes) for (const s of sn.segs) {
    const dx = p.x - s.x, dy = p.y - s.y, d = Math.hypot(dx, dy) || 1, reach = 150 + s.r;
    if (d < reach) { const w = (reach - d) / reach; ax += (dx / d) * w * 2.6; ay += (dy / d) * w * 2.6; }
  }
  for (const s of g.minions) {
    const dx = p.x - s.x, dy = p.y - s.y, d = Math.hypot(dx, dy) || 1, reach = 110 + s.r;
    if (d < reach) { const w = (reach - d) / reach; ax += (dx / d) * w * 1.8; ay += (dy / d) * w * 1.8; }
  }
  for (const b of g.ebullets) {
    const dx = p.x - b.x, dy = p.y - b.y, d = Math.hypot(dx, dy) || 1;
    if (d < 120) { const w = (120 - d) / 120; ax += (dx / d) * w * 1.6; ay += (dy / d) * w * 1.6; }
  }
  const z = p.zone, cx = (z.x0 + z.x1) / 2, cy = (z.y0 + z.y1) / 2;
  ax += (cx - p.x) / W * 0.8; ay += (cy - p.y) / 300 * 0.8;
  let best = null, bd = 220;
  for (const pk of g.pickups) { const d = Math.hypot(pk.x - p.x, pk.y - p.y); if (d < bd) { bd = d; best = pk; } }
  if (best) { ax += (best.x - p.x) / bd * 0.4; ay += (best.y - p.y) / bd * 0.4; }
  const l = Math.hypot(ax, ay);
  return l > 1 ? { mx: ax / l, my: ay / l } : { mx: ax, my: ay };
}
