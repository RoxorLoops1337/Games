// Headless balance harness: a bot plus random card picks, deterministic seeds.
// Accepts the same build the game passes to createGame: meta, skills, loadout, pets, petEquip, arts (keepsakes), outfit.
// `node tests/cell_serpent_ext/balance_harness.mjs [seeds]` prints the typical-player table per stage band.
import * as sim from '../../cell_serpent/sim.js';

export const DT = 1 / 30;   // the step the balance was tuned at; 1/20 is faster but bosses read about 40 percent harder
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// The cell cannot be hurt by touching cells (only the face reaching the line ends a run), so the stock bot's
// dodging only wastes time, and in circle stages it kept the cell away from the spiral. This bot just lines up
// with the furthest-along cell that the straight shot can reach (chests first), like a player would.
export function smartBot(g) {
  const p = g.p;
  let tgt = null, best = -1;
  for (const sn of g.snakes) for (const s of sn.segs) {
    if (s.hp <= 0 || s.shield || s.wave || s.y <= 40 || s.y >= p.y - 60) continue;
    if (s.x < p.zone.x0 - s.r || s.x > p.zone.x1 + s.r) continue;
    const sc = (s.carry === 'chest' ? 1e6 : 0) + s.ps;
    if (sc > best) { best = sc; tgt = s; }
  }
  return { mx: tgt ? clamp((tgt.x - p.x) / 40, -1, 1) : 0, my: 0, encore: g.encore >= 1 && !!tgt && Math.abs(tgt.x - p.x) < tgt.r };
}

// Informed picker (a real player reads the cards): the counter for this stage's snake first, then weapons, then the rarest card.
const COUNTER_OF = { frosty: 'brk', love: 'hbk', rust: 'oil', sour: 'swt', sneezy: 'tis' };
export function informedPick(g, pr) {
  const want = g.stage >= sim.TRAIT_FROM && !sim.isBossStage(g.stage) ? COUNTER_OF[sim.skinFor(g.stage)] : null;
  let best = 0, bs = -1;
  g.choices.forEach((c, i) => {
    const sc = (c.id === want ? 100 : 0) + (c.kind === 'weapon' ? 10 + (c.gain || 1) : 0) + (c.rarity || 0) * 2 + pr() * 0.5;
    if (sc > bs) { bs = sc; best = i; }
  });
  return best;
}
export function playRun(stage, seed, opts = {}) {
  const g = sim.createGame({ seed, stage, meta: opts.meta, skills: opts.skills, loadout: opts.loadout, pets: opts.pets, petEquip: opts.petEquip, arts: opts.arts, outfit: opts.outfit });
  const pr = sim.rng(seed * 7919 + 13);
  const dt = opts.dt || DT, cap = 900, bot = opts.bot || smartBot;
  while (g.t < cap && g.phase !== 'dead' && g.phase !== 'won') {
    sim.step(g, dt, bot(g));
    if (g.phase === 'levelup') sim.choose(g, opts.pick ? opts.pick(g, pr) : Math.min(g.choices.length - 1, Math.floor(pr() * g.choices.length)));
    g.events.length = 0;
  }
  const r = g.result || { coins: Math.floor(g.coins) };
  return { won: g.phase === 'won', coins: r.coins, progress: g.progress, time: g.t, frags: r.frags || {} };
}
// opts may be a plain meta object (old signature: winRate(stage, meta, n, skills)) or a full build when `build` is true.
export function runs(stage, opts, n = 8) {
  let w = 0, coins = 0, prog = 0, time = 0;
  for (let i = 0; i < n; i++) { const r = playRun(stage, 100 + i * 17 + stage, opts); if (r.won) w++; coins += r.coins; prog += r.progress; time += r.time; }
  return { win: w / n, coins: coins / n, prog: prog / n, time: time / n };
}
export function winRate(stage, meta, n = 8, skills) { return runs(stage, { meta, skills }, n); }

// Typical players: what a regular player plausibly owns when they reach each band (see report for the economy behind it).
const STARTERS = { swab: 1, daggers: 1, tower: 1, dragon: 1, needles: 1 };
const lv = n => Object.fromEntries(Object.keys(STARTERS).map(k => [k, n]));
export const PROFILES = [
  { band: [1, 5], name: 'newcomer', build: { meta: { atk: 3, cdn: 3, crt: 2, vit: 1 }, skills: lv(2), pets: { kitten: 1 }, petEquip: ['kitten'] } },
  { band: [6, 10], name: 'regular', build: { meta: { atk: 6, cdn: 5, crt: 5, vit: 3, for: 3 }, skills: { ...lv(3), stick: 2 }, loadout: ['swab', 'tower', 'dragon', 'needles', 'stick'], pets: { kitten: 2, puppy: 1, hamster: 1 }, petEquip: ['kitten', 'hamster'], arts: { stand: 3, jam: 3, vest: 2, soap: 2 }, outfit: 'overalls' } },
  { band: [11, 20], name: 'dedicated', build: { meta: { atk: 8, cdn: 7, crt: 7, vit: 5, for: 5 }, skills: { ...lv(5), stick: 4, bubble: 3, satellite: 2 }, loadout: ['tower', 'dragon', 'bubble', 'stick', 'needles'], pets: { kitten: 3, puppy: 2, hamster: 2, turtle: 2, lamb: 1 }, petEquip: ['kitten', 'hamster'], arts: { stand: 5, jam: 5, vest: 5, soap: 4, wheel: 4, clock: 3, scarf: 3, mallet: 1 }, outfit: 'overalls' } },
  { band: [21, 35], name: 'veteran', build: { meta: { atk: 10, cdn: 9, crt: 9, vit: 7, for: 7 }, skills: { ...lv(7), stick: 6, bubble: 6, satellite: 5, maw: 3 }, loadout: ['tower', 'dragon', 'bubble', 'maw', 'satellite'], pets: { kitten: 4, puppy: 3, hamster: 3, turtle: 3, lamb: 3, piglet: 2 }, petEquip: ['kitten', 'hamster'], arts: { stand: 5, jam: 5, vest: 5, soap: 5, wheel: 5, clock: 5, scarf: 5, glove: 5, mallet: 4, megaphone: 3, ring: 4, gourd: 3 }, outfit: 'overalls' } },
  { band: [36, 50], name: 'master', build: { meta: { atk: 12, cdn: 10, crt: 10, vit: 10, for: 10, rev: 1 }, skills: { ...lv(9), stick: 8, bubble: 8, satellite: 8, maw: 8 }, loadout: ['tower', 'dragon', 'bubble', 'maw', 'satellite'], pets: { kitten: 5, puppy: 5, hamster: 5, turtle: 5, lamb: 5, piglet: 5 }, petEquip: ['kitten', 'hamster'], arts: { stand: 5, jam: 5, vest: 5, soap: 5, wheel: 5, clock: 5, scarf: 5, glove: 5, mallet: 10, megaphone: 10, ring: 10, gourd: 10, tea: 5, milk: 5 }, outfit: 'overalls' } },
];
export const profileFor = stage => PROFILES.find(p => stage >= p.band[0] && stage <= p.band[1]);
export const typicalRate = (stage, n = 4) => runs(stage, profileFor(stage).build, n);

if (process.argv[1] && process.argv[1].endsWith('balance_harness.mjs')) {
  const n = +process.argv[2] || 6, t0 = Date.now();
  const stages = process.argv[3] ? process.argv[3].split(',').map(Number) : null;
  for (const P of PROFILES) {
    const row = [];
    for (let s = P.band[0]; s <= P.band[1]; s++) {
      if (stages && !stages.includes(s)) continue;
      const r = runs(s, P.build, n), k = sim.stageKind(s), tag = (sim.isBossStage(s) ? 'B' : '') + (k === 'ring' ? 'R' : k === 'double' ? 'D' : '');
      row.push(s + (tag ? '(' + tag + ')' : '') + ':' + Math.round(r.win * 100) + '%');
    }
    console.log(P.name.padEnd(10), 'stages ' + P.band.join('-') + '  ', row.join(' '));
  }
  console.log('seconds', ((Date.now() - t0) / 1000).toFixed(1));
}
