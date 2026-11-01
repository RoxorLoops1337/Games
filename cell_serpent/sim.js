// Cell Serpent: pure simulation (no DOM, no canvas). The browser and the headless test suite
// run this same file. All randomness comes from one seeded generator.
//
// One run is ONE snake (one stage). A long segmented virus crawls down a winding lane toward
// the bottom of the screen as one connected chain. Your cell slides left and right along the
// bottom row and fires notes straight up, so where you stand is your aim. Every cell takes
// 10 to 20 shots. Upgrades come only from the yellow upgrade cells on the snake. Its face is shielded
// until every other cell is gone. If the face reaches the membrane it drains your HP.
// Between runs you spend Beats and Sparkles on stats, loot boxes and skill levels (meta section).
export const W = 720;
export const H = 1280;
export const LINE_Y = 1190;   // the membrane at the bottom
export const ROW_Y = 1090;    // the cell's row
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

// ---------------------------------------------------------------- skills (weapons)
// `frag` is how many fragments unlock a locked skill (0 = owned from the start).
export const WEAPONS = [
  { id: 'swab', name: 'Sterile Swab', max: 5, frag: 0, desc: 'Plants a huge swab by the face. Bigger and longer with levels.' },
  { id: 'daggers', name: 'Spinning Daggers', max: 5, frag: 0, desc: 'Daggers orbit your cell and cut anything they touch.' },
  { id: 'tower', name: 'Medical Tower', max: 5, frag: 0, desc: 'Towers pulse area damage around your cell.' },
  { id: 'dragon', name: 'Snot Dragon', max: 5, frag: 0, desc: 'Fires homing snot balls that never miss.' },
  { id: 'needles', name: 'Acupuncture', max: 5, frag: 20, desc: 'A fan of piercing needles that skewer whole rows.' },
  { id: 'stick', name: 'Massage Stick', max: 5, frag: 20, desc: 'A stick sweeps in front of you and whacks cells.' },
  { id: 'bubble', name: 'Disinfectant Bubble', max: 5, frag: 30, desc: 'Floating bubbles burst on contact and slow the virus.' },
  { id: 'satellite', name: 'Satellite Storm', max: 5, frag: 40, desc: 'Lightning strikes that deal a percent of cell HP.' },
  { id: 'maw', name: 'Abyssal Maw', max: 5, frag: 60, desc: 'A maw that executes weakened cells outright.' },
];
const WEAPON = Object.fromEntries(WEAPONS.map(w => [w.id, w]));
export const WEAPON_STARTERS = WEAPONS.filter(w => !w.frag).map(w => w.id);

// The capsule is the cell's own gun; its upgrades are the first thing you are offered.
export const CAPSULE_UPS = [
  { id: 'aspd', name: 'Faster Notes', max: 8, w: 1.2, desc: '+15% attack speed' },
  { id: 'notes', name: 'Extra Note', max: 4, w: 1.0, desc: '+1 note per shot, side by side' },
  { id: 'burst', name: 'Double Burst', max: 3, w: 0.9, desc: '+1 burst per shot' },
  { id: 'cdmg', name: 'Louder Notes', max: 8, w: 1.2, desc: '+30% capsule damage' },
];
export const PASSIVES = [
  { id: 'power', name: 'Strong Antibodies', max: 5, w: 0.9, desc: '+20% damage for every skill', apply: () => {} },
  { id: 'haste', name: 'Hyper Metabolism', max: 5, w: 0.9, desc: 'Every skill recharges 10% faster', apply: () => {} },
  { id: 'crit', name: 'Lethal Mutation', max: 5, w: 0.7, desc: '+8% crit chance for the capsule and needles', apply: p => { p.crit += 0.08; } },
  { id: 'vital', name: 'Thick Membrane', max: 5, w: 0.7, desc: '+30 max HP and heal 30', apply: p => { p.maxHp += 30; p.hp = Math.min(p.maxHp, p.hp + 30); } },
  { id: 'guard', name: 'Tough Membrane', max: 4, w: 0.6, desc: 'Breaches hurt 15% less', apply: p => { p.guard += 0.15; } },
  { id: 'speed', name: 'Flagella', max: 4, w: 0.6, desc: '+12% move speed', apply: p => { p.speed *= 1.12; } },
];
const PASSIVE = Object.fromEntries(PASSIVES.map(u => [u.id, u]));
const CAP_UP = Object.fromEntries(CAPSULE_UPS.map(u => [u.id, u]));

// ---------------------------------------------------------------- meta: two currencies, stats, skills, loot boxes
// Beats (gold music-note coins) come from cells and clears. Sparkles (pink star gems) come from
// clearing a stage for the first time. Fragments come from chest cells and loot boxes.
export const META = [
  { id: 'atk', name: 'Attack', max: 12, base: 30, grow: 1.45, desc: l => `+${10 * l}% damage` },
  { id: 'crt', name: 'Crit', max: 10, base: 30, grow: 1.45, desc: l => `+${2 * l}% crit chance, +${8 * l}% crit damage` },
  { id: 'cdn', name: 'Cooldown', max: 10, base: 30, grow: 1.45, desc: l => `-${5 * l}% cooldowns` },
  { id: 'vit', name: 'Vitality', max: 10, base: 25, grow: 1.45, desc: l => `+${12 * l} max HP` },
  { id: 'for', name: 'Fortune', max: 10, base: 40, grow: 1.5, desc: l => `+${10 * l}% Beats` },
  { id: 'rev', name: 'Second Wind', max: 1, base: 400, grow: 1, desc: () => 'Revive once per run' },
];
export const metaCost = (def, lvl) => Math.round(def.base * Math.pow(def.grow, lvl));
export const SKILL_MAX_LV = 10;
export const skillMul = lv => 1 + 0.12 * (Math.max(1, lv) - 1);          // permanent skill level -> damage
export const skillUpgradeCost = lv => ({ frag: 5 * lv, beats: 40 * lv }); // lv -> lv + 1
export const BOXES = [
  { id: 'beat', name: 'Beat Box', cur: 'beats', price: 150, frags: 5, feature: 0, desc: '5 skill fragments' },
  { id: 'spark', name: 'Spark Box', cur: 'sparkles', price: 30, frags: 15, feature: 8, desc: '15 skill fragments, 8 of one skill' },
];

export function defaultSave() {
  const skills = {};
  for (const w of WEAPONS) skills[w.id] = { lv: w.frag ? 0 : 1, frag: 0 };
  return { v: 3, beats: 0, sparkles: 0, meta: {}, skills, cleared: 0, best: 0, runs: 0, kills: 0, muted: false };
}
export function sanitizeSave(raw) {
  const s = defaultSave();
  if (!raw || typeof raw !== 'object') return s;
  const num = (v, d = 0) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : d);
  s.beats = num(raw.beats ?? raw.coins); s.sparkles = num(raw.sparkles);
  s.cleared = num(raw.cleared); s.best = Math.max(s.cleared, num(raw.best)); s.runs = num(raw.runs); s.kills = num(raw.kills);
  s.muted = !!raw.muted;
  for (const d of META) s.meta[d.id] = Math.min(d.max, num(raw.meta && raw.meta[d.id]));
  for (const w of WEAPONS) {
    const r = raw.skills && raw.skills[w.id];
    if (r) { s.skills[w.id].lv = Math.min(SKILL_MAX_LV, num(r.lv, s.skills[w.id].lv)); s.skills[w.id].frag = num(r.frag); }
    if (!w.frag) s.skills[w.id].lv = Math.max(1, s.skills[w.id].lv);
  }
  return s;
}
export function buyMeta(save, id) {
  const d = META.find(m => m.id === id);
  if (!d) return false;
  const lvl = save.meta[id] || 0;
  if (lvl >= d.max) return false;
  const c = metaCost(d, lvl);
  if (save.beats < c) return false;
  save.beats -= c; save.meta[id] = lvl + 1;
  return true;
}
export function unlockSkill(save, id) {
  const w = WEAPON[id], k = save.skills[id];
  if (!w || !k || k.lv > 0 || k.frag < w.frag) return false;
  k.frag -= w.frag; k.lv = 1;
  return true;
}
export function levelSkill(save, id) {
  const k = save.skills[id];
  if (!k || k.lv < 1 || k.lv >= SKILL_MAX_LV) return false;
  const c = skillUpgradeCost(k.lv);
  if (k.frag < c.frag || save.beats < c.beats) return false;
  k.frag -= c.frag; save.beats -= c.beats; k.lv++;
  return true;
}
// Opens a loot box: pays, adds fragments, returns [{id, n}] sorted by amount.
export function openBox(save, boxId, rand = Math.random) {
  const b = BOXES.find(x => x.id === boxId);
  if (!b || save[b.cur] < b.price) return null;
  save[b.cur] -= b.price;
  const got = {};
  const pick = () => { // locked skills are a little more likely: the box is how you unlock them
    const pool = WEAPONS.map(w => ({ id: w.id, w: save.skills[w.id].lv ? 1 : 1.6 }));
    let r = rand() * pool.reduce((a, p) => a + p.w, 0), k = 0;
    for (; k < pool.length - 1; k++) { r -= pool[k].w; if (r <= 0) break; }
    return pool[k].id;
  };
  const featured = b.feature ? pick() : null;
  for (let i = 0; i < b.frags; i++) { const id = i < b.feature ? featured : pick(); got[id] = (got[id] || 0) + 1; }
  for (const id of Object.keys(got)) save.skills[id].frag += got[id];
  return Object.entries(got).map(([id, n]) => ({ id, n })).sort((a, b) => b.n - a.n);
}
export const canPlay = (save, n) => n >= 1 && n <= save.cleared + 1;
export const clearReward = n => ({ sparkles: (isBossStage(n) ? 40 : 15) + 3 * n });
// Applies a finished run to the save and returns what was earned.
export function applyResult(save, r) {
  const out = { beats: r.coins, sparkles: 0, first: false, frags: r.frags || {} };
  save.beats += r.coins; save.runs++; save.kills += r.kills;
  for (const id of Object.keys(out.frags)) save.skills[id].frag += out.frags[id];
  if (r.won) {
    if (r.stage > save.cleared) { out.first = true; out.sparkles = clearReward(r.stage).sparkles; save.sparkles += out.sparkles; save.cleared = r.stage; }
    save.best = Math.max(save.best, r.stage);
  }
  return out;
}

// ---------------------------------------------------------------- stages
export const isBossStage = n => n % 5 === 0;
export const hpBase = n => 10 * (14 * Math.pow(1.08, n - 1) + 0.5 * n);   // ~14 capsule shots per cell in stage 1
export const snakeLength = n => Math.min(60, 12 + 2 * (n - 1) + (isBossStage(n) ? 6 : 0));
export const arrivalTime = n => Math.max(45, 80 - 0.8 * n) + (isBossStage(n) ? 18 : 0);   // seconds for the face to reach the membrane if you do nothing
// Ten species, one per stage (then they repeat): own colour, cell style, face and headgear. No yellow: yellow means upgrade cell.
export const SKINS = ['love', 'rust', 'sneezy', 'grumpy', 'sleepy', 'disco', 'sour', 'mighty', 'frosty', 'gloomy'];
export const skinFor = n => SKINS[(n - 1) % SKINS.length];
const NAMES = ['Love-Struck Virus', 'Rustic Virus', 'Sneezy Virus', 'Grumpy Flu', 'Sleepy Spore', 'Disco Germ', 'Sour Strain', 'Mighty Mold', 'Frosty Fever', 'Gloomy Gunk'];
export const virusName = n => NAMES[(n - 1) % NAMES.length] + (n > NAMES.length ? ' ' + 'I'.repeat(1 + Math.floor((n - 1) / NAMES.length)) : '');
export const PATH_KINDS = ['Gentle waves', 'Hairpin lanes', 'Tight waves', 'Sharp zigzag', 'Wide S', 'Wild lanes'];
export const pathKind = n => (n - 1) % PATH_KINDS.length;
export const stageInfo = n => ({ n, name: virusName(n), skin: skinFor(n), boss: isBossStage(n), length: snakeLength(n), path: PATH_KINDS[pathKind(n)], hp: Math.round(hpBase(n)) });

const KIND = { normal: { hp: 1 }, armor: { hp: 2.6 }, bomb: { hp: 1 }, upgrade: { hp: 1.6 } };

// ---------------------------------------------------------------- the track
// Every stage has its own lane shape. Control points are corner-cut into smooth curves.
function chaikin(pts, n) {
  for (let k = 0; k < n; k++) {
    const out = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1]; out.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 }, { x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 }); }
    out.push(pts[pts.length - 1]); pts = out;
  }
  return pts;
}
function resample(poly, step) {
  const out = [poly[0]]; let carry = 0;
  for (let i = 1; i < poly.length; i++) {
    const a = poly[i - 1], b = poly[i], d = Math.hypot(b.x - a.x, b.y - a.y);
    let t = step - carry;
    while (t <= d) { out.push({ x: a.x + ((b.x - a.x) * t) / d, y: a.y + ((b.y - a.y) * t) / d }); t += step; }
    carry = d - (t - step);
  }
  return out;
}
export function buildPath(n) {
  const R = rng(n * 7919 + 13), k = pathKind(n), end = LINE_Y + 40, cx = W / 2;
  let poly = [];
  const sine = (A, lam, ph, grow = 0) => { for (let y = -160; y <= end; y += 6) poly.push({ x: cx + (A + grow * (y / end)) * Math.sin((y / lam) * TAU + ph), y }); };
  const lanes = (pts, smooth) => { poly = [{ x: cx, y: -160 }, ...pts.map(([x, y]) => ({ x, y })), { x: cx, y: end }]; poly = chaikin(poly, smooth); };
  if (k === 0) sine(230, 640, R() * TAU);
  else if (k === 1) lanes([[560, 60], [120, 60], [120, 250], [560, 250], [560, 440], [120, 440], [120, 630], [560, 630], [560, 820], [120, 820], [120, 1010], [560, 1010]], 2);   // hairpin lanes
  else if (k === 2) sine(250, 410, R() * TAU, 20);
  else if (k === 3) lanes([[660, 40], [60, 190], [660, 340], [60, 490], [660, 640], [60, 790], [660, 940], [60, 1090]], 1);   // angular zigzag
  else if (k === 4) { for (let y = -160; y <= end; y += 6) poly.push({ x: cx + 250 * Math.sin((y / 900) * TAU + 0.8) + 70 * Math.sin((y / 300) * TAU), y }); }
  else {   // wild lanes: hairpins with random widths
    const pts = []; let y = 60, right = R() < 0.5;
    while (y < 1050) {
      const x0 = 60 + R() * 220, x1 = 440 + R() * 220, a = right ? x0 : x1, b = right ? x1 : x0;
      pts.push([a, y], [b, y]); y += 170 + R() * 60; right = !right; pts.push([b, y - 40]);
    }
    lanes(pts, 2);
  }
  poly = resample(poly, 6);
  const cum = [0];
  for (let i = 1; i < poly.length; i++) cum.push(cum[i - 1] + Math.hypot(poly[i].x - poly[i - 1].x, poly[i].y - poly[i - 1].y));
  // the lane ends where it first crosses the membrane for the last time
  let last = poly.length - 1;
  for (let i = poly.length - 1; i > 0; i--) if (poly[i].y >= LINE_Y) last = i; else break;
  return { pts: poly, cum, len: cum[last], kind: k };
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
    x: W / 2, y: ROW_Y, r: 16, kx: 0, maxHp, hp: maxHp, speed: 300, guard: 0,
    atk: 1 + 0.10 * m('atk'), crit: 0.05 + 0.02 * m('crt'), critMul: 2.5 + 0.08 * m('crt'), cdBase: 1 - 0.05 * m('cdn'),
    rate: 2.0, bspeed: 900,
    coinMul: 1 + 0.1 * m('for'), revive: m('rev') > 0 ? 1 : 0,
    iframes: 0, shield: 0, rage: 0, cd: 0, aim: -Math.PI / 2, orbAng: 0, mx: 0,
    zone: { x0: 40, x1: W - 40 },
  };
}

// ---------------------------------------------------------------- the snake
function pickKind(g, n, boss, i, len) {
  if (i === 0) return 'normal';
  const r = g.rand();
  if (n >= 3 && r < 0.12) return 'armor';
  if (n >= 2 && r < 0.2) return 'bomb';
  return 'normal';
}
export function segRadius(boss, i, len) {
  const sc = boss ? 1.3 : 1;
  if (i === 0) return 38 * sc;
  const fromTail = len - 1 - i;
  const taper = fromTail < 5 ? 0.62 + 0.38 * (fromTail / 5) : 1;
  return 30 * sc * taper;
}
const spacing = (a, b) => (a.r + b.r) * 0.78;

function spawnSnake(g, n) {
  const boss = isBossStage(n), len = snakeLength(n), segs = [];
  let ps = 240;   // the face starts just inside the top edge
  for (let i = 0; i < len; i++) {
    const kind = pickKind(g, n, boss, i, len), r = segRadius(boss, i, len);
    let hp = hpBase(n) * KIND[kind].hp * (boss ? 1.5 : 1) * (0.9 + g.rand() * 0.2);
    hp = i === 0 ? 1 : Math.max(1, Math.round(hp));   // the face has no real HP: it is shielded until it is alone
    const pos = pointAt(g.path, ps);
    segs.push({ ps, x: pos.x, y: pos.y, ang: Math.PI / 2, r, hp, max: hp, kind, flash: 0, orbCd: 0, i, carry: null, shield: i === 0, isHead: i === 0 });
    ps -= (r + segRadius(boss, i + 1, len)) * 0.78;
  }
  // yellow upgrade cells: pop one to choose an upgrade. About one per 7 cells (at least 3), spread along the snake.
  const ups = Math.max(3, Math.round(len / 7));
  for (let k = 0; k < ups; k++) {
    const c = segs[clamp(3 + Math.round(((len - 5) * (k + 0.5)) / ups), 1, len - 1)];
    c.kind = 'upgrade'; c.max = c.hp = Math.max(1, Math.round(hpBase(n) * KIND.upgrade.hp * (boss ? 1.5 : 1)));
  }
  // chest cells (a chest on the cell): aim for them first too
  for (const f of [0.3, 0.62]) {
    let j = clamp(Math.round(len * f), 1, len - 1);
    while (j < len - 1 && (segs[j].kind !== 'normal' || segs[j].carry)) j++;
    segs[j].carry = 'chest';
  }
  g.upgradeLeft = ups;
  const speed = (g.path.len - 240) / arrivalTime(n);
  g.snakes.push({ id: ++g.sid, segs, tail: segs[segs.length - 1].ps, breach: false, breachT: 0, speed, slow: 0, boss, skin: skinFor(n), name: virusName(n), surge: 'idle', surgeT: 4 + g.rand() * 3 });
  g.stageHpMax += segs.reduce((a, s) => a + s.max, 0);
}

export function startStage(g, n) {
  g.stage = n;
  g.snakes.length = 0; g.stageHpMax = 0; g.zones.length = 0; g.maws.length = 0; g.bullets.length = 0; g.vq.length = 0;
  g.path = buildPath(n);
  const p = g.p;
  p.zone = { x0: 40, x1: W - 40 }; p.x = W / 2; p.y = ROW_Y; p.kx = 0;
  spawnSnake(g, n);
  rebuildTowers(g);
  g.phase = 'play'; g.clearT = 0; g.progress = 0;
  g.events.push({ t: 'stage', n, boss: isBossStage(n), name: virusName(n) });
}

// ---------------------------------------------------------------- game
export function createGame(opts = {}) {
  const unlocked = Object.fromEntries(WEAPON_STARTERS.map(id => [id, 1]));
  const skillLv = Object.fromEntries(WEAPON_STARTERS.map(id => [id, 1]));
  if (opts.skills) for (const id of Object.keys(opts.skills)) { const lv = opts.skills[id]; if (lv > 0) { unlocked[id] = 1; skillLv[id] = lv; } else if (!WEAPON_STARTERS.includes(id)) delete unlocked[id]; }
  if (opts.unlocked) for (const id of Object.keys(opts.unlocked)) { unlocked[id] = 1; skillLv[id] = skillLv[id] || 1; }
  const g = {
    rand: rng(opts.seed || 1), t: 0, phase: 'play', stage: 0, sid: 0, path: null,
    p: makePlayer(opts.meta), snakes: [], bullets: [], vq: [], pickups: [], zones: [], maws: [], towers: [],
    events: [], ups: {}, weap: {}, unlocked, skillLv,
    level: 1, cells: 0, upgradeLeft: 0, pending: 0, choices: [], resume: 'play', rerolls: 4,
    coins: 0, kills: 0, score: 0, combo: 0, lastKill: -99, stageHp: 0, stageHpMax: 0, progress: 0, clearT: 0, lastKillPos: { x: W / 2, y: 300 },
    frags: {}, revived: false, result: null, bot: !!opts.bot, shots: 0, leaks: 0,
  };
  startStage(g, opts.stage || 1);
  return g;
}

const visible = s => s.y > 8 && s.y < H - 8 && s.x > 8 && s.x < W - 8;
const lv = (g, id) => (g.weap[id] ? g.weap[id].lv : 0);
const dmgMul = g => 10 * g.p.atk * (1 + 0.2 * (g.ups.power || 0));   // x10: damage and HP are shown as big numbers
const cdMul = g => g.p.cdBase * Math.pow(0.9, g.ups.haste || 0);

function eachTarget(g, fn) {
  for (const sn of g.snakes) for (const s of sn.segs) if (s.hp > 0 && !s.shield) fn(s, sn);
}
function nearestTarget(g, x, y, maxD = 1e9) {
  let best = null, bd = maxD;
  eachTarget(g, s => {
    if (!visible(s)) return;
    const d = Math.hypot(s.x - x, s.y - y) - s.r;
    if (d < bd) { bd = d; best = s; }
  });
  return best;
}
const frontSegs = g => g.snakes.map(sn => sn.segs[0]).filter(s => s && visible(s));

function damageSeg(g, s, dmg, crit, x, y) {
  if (s.hp <= 0 || s.shield) return;
  s.hp -= dmg; s.flash = 0.12;
  g.events.push({ t: 'hit', x: x ?? s.x, y: y ?? s.y, d: dmg, crit: !!crit, s });
}
function dropPickup(g, kind, x, y, v) {
  const a = g.rand() * TAU, sp = 90 + g.rand() * 170;
  g.pickups.push({ kind, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, v, age: 0, vac: false });
}
function randomFragment(g) {
  const ids = WEAPONS.map(w => w.id);
  return ids[Math.floor(g.rand() * ids.length)];
}

function onKill(g, s, sn) {
  const st = g.stage;
  g.kills++; g.cells++;
  if (s.kind === 'upgrade') { g.pending++; g.upgradeLeft = Math.max(0, g.upgradeLeft - 1); g.events.push({ t: 'upgradecell', x: s.x, y: s.y }); }   // yellow cell: pick an upgrade
  g.lastKillPos = { x: s.x, y: s.y };
  g.combo = g.t - g.lastKill < 2.2 ? Math.min(99, g.combo + 1) : 1; g.lastKill = g.t;
  g.score += Math.round(s.max * (1 + Math.min(g.combo, 50) * 0.05));
  const coinV = (1 + Math.floor(st / 2)) * (s.isHead ? 3 : 1) * (s.kind === 'armor' ? 2 : 1);
  if (s.kind === 'upgrade') { for (let k = 0; k < 3; k++) dropPickup(g, 'coin', s.x, s.y, coinV); if (g.rand() < 0.3) dropPickup(g, ['heal', 'shield', 'rage'][Math.floor(g.rand() * 3)], s.x, s.y, 1); }
  else dropPickup(g, 'coin', s.x, s.y, coinV);
  if (s.carry === 'chest') { g.pickups.push({ kind: 'chest', x: s.x, y: s.y, vx: 0, vy: 40, v: 1, age: 0, vac: false }); g.events.push({ t: 'chestdrop', x: s.x, y: s.y }); }
  g.events.push({ t: 'kill', x: s.x, y: s.y, r: s.r, kind: s.kind, head: s.isHead, boss: sn.boss, i: s.i, skin: sn.skin });
  if (s.kind === 'bomb') {
    const R = 150;
    g.events.push({ t: 'boom', x: s.x, y: s.y, r: R });
    for (const o of g.snakes) for (const q of o.segs) if (q !== s && q.hp > 0 && Math.hypot(q.x - s.x, q.y - s.y) < R + q.r) damageSeg(g, q, Math.max(2, s.max * 0.9), false, q.x, q.y);
    if (Math.hypot(g.p.x - s.x, g.p.y - s.y) < R) hurtPlayer(g, 14, s.x, s.y);
  }
}

// Remove dead cells. The virus stays one connected chain: the cells in front of a gap slide back to
// close it (see the chain update in step), so it just gets shorter. The face pops once it is alone.
function reap(g) {
  for (let pass = 0; pass < 8; pass++) {
    let any = false;
    for (const sn of g.snakes) {
      if (sn.segs.length === 1 && sn.segs[0].hp > 0) { sn.segs[0].shield = false; sn.segs[0].hp = 0; }
      if (!sn.segs.some(q => q.hp <= 0)) continue;
      any = true;
      for (const q of sn.segs) if (q.hp <= 0) onKill(g, q, sn);
      sn.segs = sn.segs.filter(q => q.hp > 0);
      g.events.push({ t: 'close' });
    }
    g.snakes = g.snakes.filter(sn => sn.segs.length > 0);
    if (!any) break;
  }
}

function hurtPlayer(g, dmg, fx, fy) {
  const p = g.p;
  if (p.iframes > 0 || g.phase === 'dead') return;
  if (p.shield > 0) { p.iframes = 0.3; g.events.push({ t: 'block', x: p.x, y: p.y }); return; }
  p.hp -= dmg; p.iframes = 0.9;
  p.kx = (p.x >= fx ? 1 : -1) * 420;
  g.combo = 0;
  g.events.push({ t: 'hurt', x: p.x, y: p.y, d: dmg });
  if (p.hp <= 0) {
    if (p.revive > 0 && !g.revived) {
      g.revived = true; p.revive = 0; p.hp = Math.round(p.maxHp * 0.5); p.iframes = 2.2;
      g.events.push({ t: 'revive' });
    } else { p.hp = 0; g.phase = 'dead'; g.result = makeResult(g, false); g.events.push({ t: 'dead' }); }
  }
}
function makeResult(g, won) {
  return { won, stage: g.stage, kills: g.kills, coins: Math.floor(g.coins), score: g.score, level: g.level, time: g.t, boss: isBossStage(g.stage), name: virusName(g.stage), frags: { ...g.frags } };
}
// the face has reached the membrane and is chewing through it: HP drains until you finish the cells
// behind it (each kill pushes the face back off the membrane)
function breachTick(g, sn) {
  const dmg = (4 + g.stage * 0.4) * (1 - Math.min(0.6, g.p.guard)), p = g.p, keep = p.iframes;
  p.iframes = 0; g.leaks++;
  g.events.push({ t: 'leak', x: sn.segs[0].x, y: LINE_Y, d: dmg });
  hurtPlayer(g, dmg, sn.segs[0].x, LINE_Y - 80);
  p.iframes = Math.max(keep, 0);
}

// ---------------------------------------------------------------- skill picks
// what the capsule does now and after this pick, so every upgrade is visible in numbers
function capStat(id, l) {
  if (id === 'notes') return `Notes per shot: ${1 + l} → ${2 + l}`;
  if (id === 'burst') return `Bursts per shot: ${1 + l} → ${2 + l}`;
  if (id === 'aspd') return `Attack speed: +${15 * l}% → +${15 * (l + 1)}%`;
  return `Capsule damage: +${30 * l}% → +${30 * (l + 1)}%`;
}
function rollChoices(g) {
  const pool = [];
  const early = g.level < 3;   // the first two picks are capsule upgrades only
  for (const u of CAPSULE_UPS) { const l = g.ups[u.id] || 0; if (l < u.max) pool.push({ id: u.id, kind: 'capsule', name: u.name, desc: u.desc, stat: capStat(u.id, l), lvl: l, max: u.max, isNew: !l, w: u.w * (early ? 2 : 1) }); }
  if (!early) {
    const owned = Object.keys(g.weap).length;
    for (const w of WEAPONS) {
      if (!g.unlocked[w.id]) continue;
      const l = lv(g, w.id);
      if (l >= w.max || (!l && owned >= 6)) continue;
      pool.push({ id: w.id, kind: 'weapon', name: w.name, desc: w.desc, lvl: l, max: w.max, isNew: !l, w: l ? 1.7 : 1.2 });
    }
    for (const u of PASSIVES) { const l = g.ups[u.id] || 0; if (l < u.max) pool.push({ id: u.id, kind: 'passive', name: u.name, desc: u.desc, lvl: l, max: u.max, isNew: !l, w: u.w }); }
  }
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
    g.events.push({ t: 'levelup', level: g.level });
  }
}
export function reroll(g) {
  if (g.phase !== 'levelup' || g.rerolls <= 0) return false;
  g.rerolls--; g.choices = rollChoices(g);
  return true;
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
  } else if (c.kind === 'passive') { PASSIVE[c.id].apply(g.p); g.ups[c.id] = (g.ups[c.id] || 0) + 1; }
  else g.ups[c.id] = (g.ups[c.id] || 0) + 1;
  g.pending--; g.level++;
  g.events.push({ t: 'upgrade', id: c.id, kind: c.kind });
  if (g.pending > 0) { g.choices = rollChoices(g); if (!g.choices.length) { g.pending = 0; g.phase = g.resume; } } else g.phase = g.resume;
  return true;
}
function collect(g, pk) {
  const p = g.p;
  if (pk.kind === 'heal') { p.hp = Math.min(p.maxHp, p.hp + Math.round(p.maxHp * 0.3)); g.events.push({ t: 'power', kind: 'heal', x: pk.x, y: pk.y }); return; }
  if (pk.kind === 'shield') { p.shield = 6; g.events.push({ t: 'power', kind: 'shield', x: pk.x, y: pk.y }); return; }
  if (pk.kind === 'rage') { p.rage = 8; g.events.push({ t: 'power', kind: 'rage', x: pk.x, y: pk.y }); return; }
  if (pk.kind === 'chest') {   // chests give Beats and a skill fragment, never a skill pick
    const id = randomFragment(g);
    g.coins += (4 + g.stage * 2) * p.coinMul; g.frags[id] = (g.frags[id] || 0) + 1;
    g.events.push({ t: 'chest', x: pk.x, y: pk.y, frag: id }); return;
  }
  if (pk.kind === 'coin') { g.coins += pk.v * p.coinMul; g.events.push({ t: 'coin', x: pk.x, y: pk.y, v: pk.v }); }
}

// ---------------------------------------------------------------- shooting and skills
function fire(g, o) {
  g.bullets.push({ x: o.x, y: o.y, vx: Math.cos(o.a) * o.sp, vy: Math.sin(o.a) * o.sp, dmg: o.dmg, crit: !!o.crit, pierce: o.pierce || 0, r: o.r || 6, life: o.life || 1.4, hit: [], kind: o.kind || 'pill', home: o.home || 0, splash: o.splash || 0, slow: o.slow || 0 });
}
// the capsule: straight up, [1 + extra notes] side by side, [1 + extra bursts] volleys per shot
function shootCapsule(g, dt) {
  const p = g.p, up = id => g.ups[id] || 0;
  p.aim = -Math.PI / 2;
  p.cd -= dt;
  while (p.cd <= 0) {
    p.cd += (1 / p.rate) * cdMul(g) / (1 + 0.15 * up('aspd')) * (p.rage > 0 ? 0.77 : 1);
    for (let b = 0; b <= up('burst'); b++) g.vq.push({ t: b * 0.1 });
    if (p.cd < -0.2) p.cd = 0;
  }
  for (let i = g.vq.length - 1; i >= 0; i--) {
    const v = g.vq[i]; v.t -= dt;
    if (v.t > 0) continue;
    g.vq.splice(i, 1);
    const n = 1 + up('notes');
    for (let k = 0; k < n; k++) {
      const crit = g.rand() < p.crit;
      fire(g, { x: p.x + (k - (n - 1) / 2) * 42, y: p.y - 30, a: p.aim, sp: p.bspeed, dmg: dmgMul(g) * (1 + 0.3 * up('cdmg')) * (p.rage > 0 ? 1.6 : 1) * (crit ? p.critMul : 1), crit, r: 6, life: 1.4, kind: 'pill' });
    }
    g.shots++; g.events.push({ t: 'shoot' });
  }
}
function updateWeapons(g, dt, canFire) {
  const p = g.p, cm = cdMul(g);
  const dm = id => dmgMul(g) * skillMul(g.skillLv[id] || 1);   // permanent skill level scales that skill's damage
  const wantTowers = lv(g, 'tower') ? 1 + (lv(g, 'tower') >= 3 ? 1 : 0) + (lv(g, 'tower') >= 5 ? 1 : 0) : 0;
  if (g.towers.length !== wantTowers) rebuildTowers(g);
  const aim = -Math.PI / 2;   // nothing auto-aims except the Snot Dragon's homing
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
        const t = fronts[0], dur = 2.6 + 0.5 * L;
        g.zones.push({ x: t.x + (k ? 90 : 0), y: t.y, r: 62 + 16 * L, life: dur, max: dur, tick: 0, dmg: 0.8 * (1 + 0.3 * L) * dm('swab') });
      }
      g.events.push({ t: 'swab' }); w.cd = (4.2 - 0.3 * L) * cm;
    } else if (id === 'dragon') {
      if (!nearestTarget(g, p.x, p.y, 1400)) { w.cd = 0.3; continue; }
      const n = 1 + Math.floor((L + 1) / 2);
      for (let k = 0; k < n; k++) fire(g, { x: p.x, y: p.y - 20, a: -Math.PI / 2 + (k - (n - 1) / 2) * 0.7, sp: 440, dmg: 2.0 * (1 + 0.4 * L) * dm('dragon'), r: 11, life: 2.6, kind: 'snot', home: 7, splash: 46 });
      g.events.push({ t: 'dragon' }); w.cd = (1.8 - 0.1 * L) * cm;
    } else if (id === 'needles') {
      const n = 3 + L;
      for (let k = 0; k < n; k++) {
        const crit = g.rand() < p.crit;
        fire(g, { x: p.x, y: p.y - 10, a: aim + (k - (n - 1) / 2) * 0.09, sp: 1100, dmg: 0.8 * (1 + 0.3 * L) * dm('needles') * (crit ? p.critMul : 1), crit, pierce: 2 + L, r: 5, life: 1.2, kind: 'needle' });
      }
      g.events.push({ t: 'needles' }); w.cd = (1.8 - 0.12 * L) * cm;
    } else if (id === 'bubble') {
      for (let k = 0; k < (L >= 4 ? 2 : 1); k++) fire(g, { x: p.x, y: p.y - 30, a: aim + (k ? 0.5 : 0), sp: 190, dmg: 1.2 * (1 + 0.3 * L) * dm('bubble'), r: 22 + 3 * L, life: 3.2, kind: 'bubble', splash: 70 + 10 * L, slow: 2 });
      g.events.push({ t: 'bubble' }); w.cd = (3.4 - 0.2 * L) * cm;
    } else if (id === 'satellite') {
      const vis = []; eachTarget(g, s => { if (visible(s)) vis.push(s); });
      if (!vis.length) { w.cd = 0.3; continue; }
      vis.sort((a, b) => b.hp - a.hp);
      for (let k = 0; k < 1 + Math.floor((L + 1) / 2); k++) {
        const s = vis[Math.floor(g.rand() * Math.min(vis.length, 5))];
        damageSeg(g, s, Math.max(1.8 * (1 + 0.3 * L) * dm('satellite'), s.max * (0.02 + 0.008 * L) * Math.min(dm('satellite') / 10, 3)), false, s.x, s.y);
        g.events.push({ t: 'strike', x: s.x, y: s.y });
      }
      w.cd = (3.6 - 0.25 * L) * cm;
    } else if (id === 'maw') {
      const vis = []; eachTarget(g, s => { if (visible(s)) vis.push(s); });
      if (!vis.length) { w.cd = 0.3; continue; }
      vis.sort((a, b) => b.hp - a.hp);
      const t = vis[Math.floor(g.rand() * Math.min(vis.length, 3))];
      g.maws.push({ x: t.x, y: t.y, r: 110 + 12 * L, life: 1.6, max: 1.6, tick: 0, exec: 0.1 + 0.03 * L, dmg: 0.9 * (1 + 0.3 * L) * dm('maw') });
      g.events.push({ t: 'maw', x: t.x, y: t.y }); w.cd = (7.5 - 0.6 * L) * cm;
    }
  }
  // spinning daggers (orbit)
  const dl = lv(g, 'daggers');
  if (dl) {
    p.orbAng += dt * (3.2 + 0.2 * dl);
    for (let i = 0; i < 1 + dl; i++) {
      const pos = daggerPos(g, i);
      eachTarget(g, s => { if (s.orbCd <= 0 && Math.hypot(s.x - pos.x, s.y - pos.y) < s.r + 12) { s.orbCd = 0.3; damageSeg(g, s, 1.2 * (1 + 0.3 * dl) * dm('daggers'), false, pos.x, pos.y); } });
    }
  }
  // massage stick (sweeping bar)
  const sl = lv(g, 'stick');
  if (sl) {
    for (let k = 0; k < (sl >= 4 ? 2 : 1); k++) {
      const sg = stickSeg(g, k);
      eachTarget(g, s => {
        if (s.orbCd > 0) return;
        if (distToSeg(s.x, s.y, sg.x0, sg.y0, sg.x1, sg.y1) < s.r + 12) { s.orbCd = 0.35; damageSeg(g, s, 1.8 * (1 + 0.35 * sl) * dm('stick'), false, s.x, s.y); }
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
      eachTarget(g, s => { if (Math.hypot(s.x - t.x, s.y - t.y) < R + s.r) damageSeg(g, s, 1.5 * (1 + 0.35 * tl) * dm('tower'), false, s.x, s.y); });
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

  // the cell slides left and right along its row
  p.mx = input ? clamp(input.mx || 0, -1, 1) : 0;
  p.x += (p.mx * p.speed + p.kx) * dt;
  p.kx *= Math.exp(-9 * dt);
  p.x = clamp(p.x, p.zone.x0, p.zone.x1); p.y = ROW_Y;
  if (p.iframes > 0) p.iframes -= dt;
  if (p.shield > 0) p.shield -= dt;
  if (p.rage > 0) p.rage -= dt;

  // the virus rides the track as one connected chain driven by its tail. Cells in front of a gap
  // slide back to close it, so every kill also pushes the face away from the membrane.
  let stageHp = 0;
  for (const sn of g.snakes) {
    sn.slow = Math.max(0, sn.slow - dt);
    // now and then it surges for a second (with a warning beforehand)
    if (g.phase === 'play') {
      sn.surgeT -= dt;
      if (sn.surge === 'idle' && sn.surgeT <= 0) { sn.surge = 'warn'; sn.surgeT = 0.6; g.events.push({ t: 'surgewarn' }); }
      else if (sn.surge === 'warn' && sn.surgeT <= 0) { sn.surge = 'go'; sn.surgeT = 1.1; g.events.push({ t: 'surge' }); }
      else if (sn.surge === 'go' && sn.surgeT <= 0) { sn.surge = 'idle'; sn.surgeT = (sn.boss ? 3.5 : 5.5) + g.rand() * (sn.boss ? 3 : 5); }
    }
    const v = sn.speed * (sn.slow > 0 ? 0.55 : 1) * (sn.surge === 'go' ? 2.6 : 1) * (g.phase === 'clear' ? 0 : 1);
    const segs = sn.segs, last = segs.length - 1;
    let total = 0;
    for (let i = 0; i < last; i++) total += spacing(segs[i], segs[i + 1]);
    const maxTail = g.path.len - total;
    sn.tail = Math.min(sn.tail + v * dt, maxTail);
    sn.breach = sn.tail >= maxTail - 0.5;
    let target = sn.tail;
    for (let i = last; i >= 0; i--) {
      if (i < last) target += spacing(segs[i], segs[i + 1]);
      segs[i].tp = target;
    }
    segs[0].shield = segs.length > 1;
    if (sn.breach && g.phase === 'play') { sn.breachT -= dt; if (sn.breachT <= 0) { sn.breachT = 0.5; breachTick(g, sn); } } else sn.breachT = 0;
    for (const s of segs) {
      const ox = s.x, oy = s.y;
      s.ps = s.tp >= s.ps ? s.tp : Math.max(s.tp, s.ps - 320 * dt);
      const pos = pointAt(g.path, s.ps), pa = pointAt(g.path, s.ps - 8), pb = pointAt(g.path, s.ps + 8);
      s.x = pos.x; s.y = pos.y; s.ang = Math.atan2(pb.y - pa.y, pb.x - pa.x);
      s.vx = (s.x - ox) / dt; s.vy = (s.y - oy) / dt;
      stageHp += Math.max(0, s.hp);
      if (s.flash > 0) s.flash -= dt;
      if (s.orbCd > 0) s.orbCd -= dt;
      if (s.hp > 0 && Math.hypot(s.x - p.x, s.y - p.y) < s.r + p.r * 0.75) hurtPlayer(g, 9 + g.stage * 0.5, s.x, s.y);
    }
  }
  g.stageHp = stageHp;
  g.progress = g.stageHpMax ? clamp(1 - stageHp / g.stageHpMax, 0, 1) : 0;

  // the capsule never aims: it fires straight up, so you aim by sliding
  const canFire = g.phase === 'play';
  if (canFire) shootCapsule(g, dt);
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
      for (const sn of g.snakes) for (const s of sn.segs) {
        if (dead || s.hp <= 0 || s.shield || b.hit.includes(s) || Math.hypot(s.x - b.x, s.y - b.y) >= s.r + b.r) continue;
        b.hit.push(s);
        damageSeg(g, s, b.dmg, b.crit, b.x, b.y);
        if (b.slow) sn.slow = Math.max(sn.slow, b.slow);
        if (b.splash > 0) {
          const sd = b.dmg * (b.kind === 'bubble' ? 2.2 : 0.5);
          eachTarget(g, (q, qs) => { if (q !== s && Math.hypot(q.x - s.x, q.y - s.y) < b.splash + q.r) { damageSeg(g, q, sd, false, q.x, q.y); if (b.slow) qs.slow = Math.max(qs.slow, b.slow); } });
          g.events.push({ t: b.kind === 'bubble' ? 'burst' : 'splash', x: s.x, y: s.y, r: b.splash });
        }
        if (b.pierce-- <= 0) dead = true;
      }
    }
    if (dead) g.bullets.splice(bi, 1);
  }

  reap(g);

  // pickups always fly to the cell (it cannot chase them up the screen)
  for (let i = g.pickups.length - 1; i >= 0; i--) {
    const pk = g.pickups[i];
    pk.age += dt;
    const d = Math.hypot(p.x - pk.x, p.y - pk.y);
    if (pk.age > 0.5 || g.phase === 'clear') pk.vac = true;
    if (pk.vac) {
      const sp = (pk.kind === 'chest' ? 300 : 460) + pk.age * 90, a = Math.atan2(p.y - pk.y, p.x - pk.x);
      pk.vx = Math.cos(a) * sp; pk.vy = Math.sin(a) * sp;
    } else { const f = Math.exp(-4 * dt); pk.vx *= f; pk.vy *= f; pk.vy += 40 * dt; }
    pk.x += pk.vx * dt; pk.y += pk.vy * dt;
    pk.x = clamp(pk.x, 6, W - 6); pk.y = clamp(pk.y, 6, H - 6);
    if (d < (pk.kind === 'chest' ? 40 : 26)) { collect(g, pk); g.pickups.splice(i, 1); }
  }

  // stage clear: the run is won once the loot is in
  if (g.phase === 'play' && !g.snakes.length) {
    g.phase = 'clear'; g.clearT = 0;
    const bonus = (6 + g.stage * 3) * (isBossStage(g.stage) ? 3 : 1);
    g.coins += bonus * p.coinMul;
    g.pickups.push({ kind: 'chest', x: W / 2, y: 300, vx: 0, vy: 0, v: 1, age: 0, vac: false });
    g.events.push({ t: 'clear', n: g.stage, bonus: Math.round(bonus * p.coinMul), boss: isBossStage(g.stage), name: virusName(g.stage) });
  }
  if (g.phase === 'clear') {
    g.clearT += dt;
    if (g.clearT > 2.4 && !g.pickups.length) { g.phase = 'won'; g.result = makeResult(g, true); g.events.push({ t: 'won' }); }
  }
  maybeLevelUp(g);
}

// ---------------------------------------------------------------- bot (tests + title attract mode)
export function botInput(g) {
  const p = g.p;
  let ax = 0;
  for (const sn of g.snakes) for (const s of sn.segs) {
    const dx = p.x - s.x, dy = p.y - s.y, d = Math.hypot(dx, dy) || 1, reach = 170 + s.r;
    if (d < reach) ax += (dx >= 0 ? 1 : -1) * ((reach - d) / reach) * 2.6;
  }
  // aim: chest cells first, otherwise the cell closest to the membrane
  let tgt = null;
  for (const sn of g.snakes) for (const s of sn.segs) if (s.hp > 0 && !s.shield && s.y > 40 && s.y < p.y - 120) {
    if (s.carry === 'chest') { tgt = s; break; }
    if (!tgt || s.ps > tgt.ps) tgt = s;
  }
  if (tgt) ax += clamp((tgt.x - p.x) / 120, -1, 1) * 0.9;
  return { mx: clamp(ax, -1, 1), my: 0 };
}
