// Galaxy Pusher: the rules (no DOM, no clock, no Math.random). The machine itself (real rigid-body coins,
// pusher, shooters, towers) lives in machine.js; this file decides what the coins and tokens MEAN.
//
// Tokens (blue Rox, pink Jas, yellow Mew) that fall off the edge go into a row of 6. Three of a colour: that hero
// attacks and a shooter fires a free volley (blue 10, yellow 15, pink 25, sides taking turns). Every triple grows
// the combo (a points multiplier) and fills a segment of the meter; a full meter starts DOUBLE TIME. Six tokens
// without a triple break the combo. Coins are never reused: what falls off the edge scores POINTS (and each won
// coin is a laser shot at the enemy). Coins to shoot refill slowly and come back as rewards for beating enemies.
// A defeated enemy spins the Galaxy Wheel; the pocket builds a coin TOWER of 300, 400, 600, 900 or (jackpot) 1200 coins.
import { W, KINDS, isToken, mulberry } from './machine.js';
export { W, isToken, mulberry };
export const KIND = KINDS;

export const ROW = 6;
export const COL = ['B', 'P', 'Y'];   // blue = Rox, pink = Jas, yellow = Mew
export const TOWER = { B: 300, Y: 400, P: 600, V: 900, JP: 1200 };   // tower sizes like the cabinet's (1200 is the biggest)
// The wheel: 12 pockets clockwise from the top. c = tower colour, x2 = gold coins (pay double), lv = every hero levels up.
// 12 pockets: blue 300 (x4), yellow 400 (x3), pink 600 (x2), violet 900 (x2), one red jackpot 1200.
// lv = every hero levels up too; the violet and jackpot towers are gold coins (worth double).
export const WHEEL = [
  { c: 'B' }, { c: 'P' }, { c: 'Y' }, { c: 'JP' },
  { c: 'B' }, { c: 'V' }, { c: 'Y' }, { c: 'B', lv: true },
  { c: 'P' }, { c: 'Y', lv: true }, { c: 'B' }, { c: 'V' },
];
export const HEROES = [
  { id: 'rox', name: 'Rox', col: 'B', base: 12 },
  { id: 'jas', name: 'Jas', col: 'P', base: 12 },
  { id: 'mew', name: 'Mew', col: 'Y', base: 11 },
];
export const SECTORS = [
  { name: 'Neon Docks', foes: ['drone', 'drone2', 'crab', 'saucer', 'boss_mech'] },
  { name: 'Ion Reef', foes: ['saucer', 'crab', 'drone2', 'eel', 'boss_squid'] },
  { name: 'Comet Yard', foes: ['drone2', 'eel', 'crab', 'saucer', 'boss_mech'] },
  { name: 'Void Arcade', foes: ['eel', 'saucer', 'drone2', 'crab', 'boss_squid'] },
];
export const FOE_NAME = { drone: 'Buzz Drone', drone2: 'Twin Drones', crab: 'Scrap Crab', saucer: 'Hoverdisc', eel: 'Volt Eel', boss_mech: 'Titan Mech', boss_squid: 'Nebula Squid' };
export const FEVER_TIME = 20;
export const START_COINS = 150, REGEN_BELOW = 150, REGEN_EVERY = 1;   // a free coin every second while you hold fewer than 150
export const FIRE_GAP = 0.24, AUTO_GAP = 0.085;
export const COIN_PTS = 10;
export const AUTO_SHOTS = { B: 10, Y: 15, P: 25 };   // free coins a three-of-a-kind fires
export const COMBO_FULL = 6;                          // triples in a row to fill the meter (DOUBLE TIME)
export const comboMult = (c) => Math.min(4, 1 + 0.25 * c);
export const KILL_COINS = 40;
export const PORT_DELAY = 2, PORT_GAP = 0.35;   // a token comes back out of the back wall 2 s after it drops, one at a time
export const TOKEN_POP = 15, TOKEN_CAP = 24;
// the ENERGY ring's jackpot: coins lost in the gutters charge it (about 100 a minute in play: a jackpot every ~2 min)
export const JP_FULL = 180, JP_COINS = 40, JP_TOKENS = 3;
// coming back each day: a growing bonus (day 7 and on also gives a free wheel spin)
export const DAILY_BASE = 50, DAILY_STEP = 20, DAILY_MAX_DAY = 7;      // tokens kept in play (at least / at most)
// items (the cabinet's 道具 button): bought with coins
export const ITEMS = {
  refill: { name: 'Coin Pack', cost: 2500, coins: 80, desc: '80 more coins to shoot.' },
  quake: { name: 'Quake', cost: 1500, desc: 'Bump the table: every coin jolts forward.' },
  guard: { name: 'Wall Guard', cost: 3000, dur: 30, desc: 'Close both corner gutters for 30 s.' },
  turbo: { name: 'Turbo Push', cost: 3000, dur: 20, desc: 'The pusher runs at double speed for 20 s.' },
  rain: { name: 'Token Rain', cost: 4000, desc: 'The port fires 3 tokens, picked to match your row.' },
  wheel: { name: 'Tower Call', cost: 20000, desc: 'Spin the Galaxy Wheel right now.' },
};
export const ITEM_ORDER = ['refill', 'quake', 'guard', 'turbo', 'rain', 'wheel'];   // bought with points


export const heroAtk = (lv) => 12 + 3 * lv;
export const xpNeed = (lv) => 2 + lv;
export function foeAt(idx) {
  const sec = SECTORS[Math.floor(idx / 5) % SECTORS.length];
  const kind = sec.foes[idx % 5];
  const boss = idx % 5 === 4;
  const hp = Math.round(150 * Math.pow(1.17, idx) * (boss ? 2.4 : 1));
  return { idx, kind, boss, hp, max: hp, name: FOE_NAME[kind], sector: Math.floor(idx / 5) };
}

// ------------------------------------------------------------------------------------------------ the game
export class Game {
  constructor(seed = 1, machine) {
    this.rng = mulberry(seed);
    this.f = machine;            // a Machine from machine.js
    if (machine) machine.rng = this.rng;
    this.bank = START_COINS;   // coins to shoot
    this.score = 0;            // points: what you knock off the edge
    this.combo = 0; this.meter = 0;
    this.autoQ = []; this.autoCd = 0; this.nextSide = 'L';
    this.row = [];
    this.heroes = HEROES.map((h) => ({ id: h.id, col: h.col, lv: 1, xp: 0 }));
    this.foeIdx = 0;
    this.foe = foeAt(0);
    this.fever = 0;
    this.wheelQ = 0;        // wheels waiting to be spun
    this.pendingDmg = 0;    // damage dealt while no enemy stood (hits the next one)
    this.fireCd = 0;
    this.regen = 0;
    this.out = [];          // game events for the presentation layer
    this.stats = { shots: 0, paid: 0, lost: 0, tokens: 0, attacks: 0, kills: 0, towers: 0, best: 0, jp: 0, items: 0, bestCombo: 0, jackpots: 0 };
    this.time = 0;
    this.jp = 0; this.day = null; this.streak = 0;
    this.portQ = []; this.portCd = 0; this.popT = 0;   // tokens waiting to come back out of the port
    this.guardT = 0; this.turboT = 0;
  }
  newMachine() { this.f.seedCarpet(); }
  hero(col) { return this.heroes.find((h) => h.col === col); }
  atk(col) { return heroAtk(this.hero(col).lv); }

  canFire() { return this.bank >= 1 && this.fireCd <= 0; }
  fire(side = 'L') {
    if (!this.canFire()) return false;
    side = side === 'R' ? 'R' : 'L';
    this.bank -= 1; this.fireCd = FIRE_GAP; this.stats.shots++;
    this.f.shoot('c', side);
    this.out.push({ t: 'fire', side });
    return true;
  }

  tick(dt) {
    this.time += dt;
    this.fireCd -= dt;
    if (this.fever > 0) { this.fever -= dt; if (this.fever <= 0) { this.fever = 0; this.out.push({ t: 'feverEnd' }); } }
    if (this.guardT > 0) { this.guardT = Math.max(0, this.guardT - dt); if (!this.guardT) this.out.push({ t: 'itemEnd', id: 'guard' }); }
    if (this.turboT > 0) { this.turboT = Math.max(0, this.turboT - dt); if (!this.turboT) this.out.push({ t: 'itemEnd', id: 'turbo' }); }
    this.f.guard = this.guardT > 0; this.f.speed = this.turboT > 0 ? 2 : 1;
    // the free volley from a three-of-a-kind
    if (this.autoQ.length) {
      this.autoCd -= dt;
      while (this.autoQ.length && this.autoCd <= 0) {
        const A = this.autoQ[0];
        this.f.shoot('c', A.side); A.n--; this.autoCd += AUTO_GAP;
        this.out.push({ t: 'autoShot', side: A.side, left: A.n });
        if (A.n <= 0) this.autoQ.shift();
      }
    } else this.autoCd = 0;
    if (this.bank < REGEN_BELOW) { this.regen += dt; if (this.regen >= REGEN_EVERY) { this.regen = 0; this.bank++; this.out.push({ t: 'regen' }); } } else this.regen = 0;
    this.tickPort(dt);
    this.f.advance(dt);
    this.consume();
  }

  consume() {
    const ev = this.f.events;
    for (const e of ev) {
      if (e.t === 'pay') {
        if (isToken(e.k)) { this.stats.tokens++; this.out.push({ t: 'payToken', k: e.k, x: e.x }); this.pushToken(e.k); this.recycle(e.k); }
        else {
          // coins are not reused: a coin over the edge is points, times the combo and DOUBLE TIME
          const coins = KIND[e.k].v * (e.mul || 1);
          const v = Math.round(COIN_PTS * coins * comboMult(this.combo) * (this.fever > 0 ? 2 : 1));
          this.score += v; this.stats.paid += coins; this.stats.best = Math.max(this.stats.best, this.score);
          this.out.push({ t: 'pay', k: e.k, x: e.x, v, tw: e.tw, mul: e.mul || 1 });
          if (!e.tw) this.damage(this.fever > 0 ? 2 : 1, 'chip', null);   // every won coin is a laser shot (tower spills only pay)
        }
      } else if (e.t === 'lost') {
        this.stats.lost++; this.out.push({ t: 'lost', k: e.k, x: e.x }); if (isToken(e.k)) this.recycle(e.k);
        this.jp += e.mul || 1; if (this.jp >= JP_FULL) this.jackpot();
      }
      else this.out.push(e);
    }
    ev.length = 0;
  }


  // Tokens are recycled: one that drops into the collection box (or a gutter) comes back out of the port in the back
  // wall PORT_DELAY seconds later. The machine keeps at least TOKEN_POP in play and never recycles past TOKEN_CAP
  // (tower crowns and Token Rain add tokens). The port waits while a tower is coming up in front of it.
  recycle(k, delay = PORT_DELAY, force = false) {
    if (!force && this.f.fieldTokens() + this.portQ.length >= TOKEN_CAP) return false;
    const at = this.time + delay; let i = this.portQ.length;
    while (i > 0 && this.portQ[i - 1].at > at) i--;
    this.portQ.splice(i, 0, { k, at });
    return true;
  }
  tickPort(dt) {
    this.portCd -= dt; this.popT += dt;
    if (this.popT >= 1) { this.popT = 0; if (this.f.fieldTokens() + this.portQ.length < TOKEN_POP) this.recycle(COL[Math.floor(this.rng() * 3)]); }
    if (this.portQ.length && this.portQ[0].at <= this.time && this.portCd <= 0 && this.f.portFree()) {
      this.f.launch(this.portQ.shift().k); this.portCd = PORT_GAP;
    }
  }

  // the jackpot: both shooters pour out free coins and the port fires tokens
  jackpot() {
    this.jp = 0; this.stats.jackpots = (this.stats.jackpots || 0) + 1;
    this.autoQ.push({ side: 'L', n: JP_COINS / 2 }, { side: 'R', n: JP_COINS / 2 });
    for (let i = 0; i < JP_TOKENS; i++) this.recycle(COL[Math.floor(this.rng() * 3)], 0.4 + i * PORT_GAP, true);
    this.out.push({ t: 'jackpot', n: JP_COINS, tokens: JP_TOKENS });
  }
  // called once when the game opens, with today's local day number (passed in, so the rules stay testable):
  // a new day pays a bonus that grows while you keep coming back on consecutive days
  daily(day) {
    if (!Number.isFinite(day) || this.day === day) return null;
    this.streak = this.day === day - 1 ? this.streak + 1 : 1;
    this.day = day;
    const d = Math.min(DAILY_MAX_DAY, this.streak), coins = DAILY_BASE + DAILY_STEP * (d - 1), spin = this.streak >= DAILY_MAX_DAY;
    this.bank += coins; if (spin) this.wheelQ++;
    const e = { t: 'daily', streak: this.streak, coins, spin };
    this.out.push(e);
    return e;
  }

  pushToken(k) {
    this.row.push(k);
    const n = this.row.filter((x) => x === k).length;
    if (n >= 3) {
      let left = 3; this.row = this.row.filter((x) => !(x === k && left-- > 0));
      this.combo++; this.meter++;
      this.stats.bestCombo = Math.max(this.stats.bestCombo || 0, this.combo);
      this.out.push({ t: 'combo', combo: this.combo, meter: this.meter, mult: comboMult(this.combo) });
      if (this.meter >= COMBO_FULL) { this.meter = 0; this.fever = FEVER_TIME; this.out.push({ t: 'fever' }); }
      this.attack(k);
    } else if (this.row.length >= ROW) {
      // six tokens and no three of a kind: the combo breaks
      this.row = [];
      this.out.push({ t: 'comboBreak', combo: this.combo });
      this.combo = 0; this.meter = 0;
    }
  }

  attack(col) {
    const h = this.hero(col);
    const dmg = heroAtk(h.lv) * 3 * (this.fever > 0 ? 2 : 1);
    this.stats.attacks++;
    this.out.push({ t: 'attack', col, dmg, lv: h.lv });
    this.damage(dmg, 'attack', col);
    h.xp++;
    if (h.xp >= xpNeed(h.lv)) { h.xp = 0; h.lv++; this.out.push({ t: 'levelUp', col, lv: h.lv }); }
    // and a shooter fires a free volley, sides taking turns
    const n = AUTO_SHOTS[col], side = this.nextSide;
    this.nextSide = side === 'L' ? 'R' : 'L';
    this.autoQ.push({ side, n });
    this.out.push({ t: 'autoStart', col, n, side });
  }

  // Tower Call gets dearer as the enemies (and the towers' value to you) grow
  itemCost(id) { const I = ITEMS[id]; return !I ? Infinity : id === 'wheel' ? I.cost + 2500 * this.foeIdx : I.cost; }
  canBuy(id) { return this.score >= this.itemCost(id); }
  buy(id) {
    if (!this.canBuy(id)) return false;
    this.score -= this.itemCost(id);
    if (id === 'refill') this.bank += ITEMS.refill.coins;
    else if (id === 'quake') this.f.quake();
    else if (id === 'guard') this.guardT += ITEMS.guard.dur;
    else if (id === 'turbo') this.turboT += ITEMS.turbo.dur;
    else if (id === 'rain') {
      // the colour you hold most of comes first, so the rain tends to finish a set
      const cnt = { B: 0, P: 0, Y: 0 }; for (const k of this.row) cnt[k]++;
      const best = COL.slice().sort((a, b) => cnt[b] - cnt[a] || this.rng() - 0.5);
      [best[0], best[0], best[1]].forEach((k, i) => this.recycle(k, 0.2 + i * PORT_GAP, true));
    } else if (id === 'wheel') this.wheelQ++;
    this.stats.items = (this.stats.items || 0) + 1;
    this.out.push({ t: 'item', id });
    return true;
  }

  damage(n, src, col) {
    if (!this.foe) { this.pendingDmg += n; return; }
    this.foe.hp -= n;
    this.out.push({ t: 'hit', n, src, col });
    if (this.foe.hp <= 0) {
      this.foe.hp = 0;
      this.stats.kills++;
      this.out.push({ t: 'kill', foe: this.foe });
      this.bank += KILL_COINS; this.out.push({ t: 'reward', coins: KILL_COINS });
      if (this.foe.boss) { const prize = 100 + 50 * this.foe.sector; this.bank += prize; this.out.push({ t: 'sector', n: this.foe.sector + 1, prize }); }
      this.foe = null;
      this.wheelQ++;
    }
  }

  // the wheel: pick a pocket now (the ball animation is aimed at it), resolve after the animation
  spinWheel() {
    if (this.wheelQ <= 0) return -1;
    this.wheelQ--;
    return Math.floor(this.rng() * WHEEL.length);
  }
  resolveWheel(i) {
    const P = WHEEL[i];
    this.stats.towers++;
    if (P.c === 'JP') this.stats.jp++;
    if (P.lv) for (const h of this.heroes) { h.lv++; h.xp = 0; this.out.push({ t: 'levelUp', col: h.col, lv: h.lv }); }
    const n = TOWER[P.c];
    const crown = P.c === 'JP' || P.c === 'V' ? ['B', 'P', 'Y'] : [P.c, P.c];
    this.f.placeTower(n, { gold: P.c === 'JP' || P.c === 'V', col: P.c, crown });
    this.out.push({ t: 'tower', P, n });
    this.nextFoe();
  }
  nextFoe() {
    if (this.foe || this.wheelQ > 0) return;
    this.foeIdx++;
    this.foe = foeAt(this.foeIdx);
    this.out.push({ t: 'foe', foe: this.foe });
    if (this.pendingDmg > 0) { const d = this.pendingDmg; this.pendingDmg = 0; this.damage(d, 'carry', null); }
  }

  // ---------------------------------------------------------------- saves
  // v2 saves the machine (coins with their rotation, towers); a v1 save (the old 2.5D machine) keeps all
  // progress and starts a fresh machine.
  save() {
    const r2 = (v) => Math.round(v * 100) / 100;
    return {
      v: 2, bank: this.bank, row: this.row.slice(), heroes: this.heroes.map((h) => ({ ...h })), foeIdx: this.foeIdx,
      foe: this.foe ? { hp: this.foe.hp } : null, score: this.score, combo: this.combo, meter: this.meter, autoQ: this.autoQ.map((A) => ({ ...A })), nextSide: this.nextSide, fever: r2(this.fever), wheelQ: this.wheelQ, pendingDmg: this.pendingDmg,
      stats: { ...this.stats }, seed: this.rng.seed(), port: this.portQ.map((q) => q.k).join(''), jp: this.jp, day: this.day, streak: this.streak, guardT: r2(this.guardT), turboT: r2(this.turboT),
      machine: this.f.snapshot(),
    };
  }
  static load(s, machine, fallbackSeed = 1) {
    if (!s || (s.v !== 1 && s.v !== 2)) return null;
    const g = new Game(fallbackSeed, machine);
    const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
    g.bank = Math.max(0, Math.floor(num(s.bank, START_COINS)));
    g.row = (Array.isArray(s.row) ? s.row : []).filter(isToken).slice(0, ROW - 1);
    if (Array.isArray(s.heroes)) g.heroes.forEach((h, i) => { const o = s.heroes[i]; if (o) { h.lv = Math.max(1, Math.floor(num(o.lv, 1))); h.xp = Math.max(0, Math.floor(num(o.xp, 0))); } });
    g.foeIdx = Math.max(0, Math.floor(num(s.foeIdx, 0)));
    g.wheelQ = Math.max(0, Math.floor(num(s.wheelQ, 0)));
    g.foe = s.foe ? foeAt(g.foeIdx) : null;
    if (g.foe) g.foe.hp = Math.max(1, Math.min(g.foe.max, num(s.foe.hp, g.foe.max)));
    if (!g.foe && g.wheelQ === 0) { g.foeIdx++; g.foe = foeAt(g.foeIdx); }
    g.score = Math.max(0, Math.floor(num(s.score, 0)));
    g.combo = Math.max(0, Math.floor(num(s.combo, 0))); g.meter = Math.max(0, Math.min(COMBO_FULL - 1, Math.floor(num(s.meter, 0))));
    g.autoQ = (Array.isArray(s.autoQ) ? s.autoQ : []).filter((A) => A && (A.side === 'L' || A.side === 'R') && A.n > 0).map((A) => ({ side: A.side, n: Math.min(100, Math.floor(A.n)) }));
    g.nextSide = s.nextSide === 'R' ? 'R' : 'L';
    g.fever = Math.max(0, Math.min(FEVER_TIME, num(s.fever, 0)));
    g.pendingDmg = Math.max(0, num(s.pendingDmg, 0));
    g.guardT = Math.max(0, Math.min(600, num(s.guardT, 0))); g.turboT = Math.max(0, Math.min(600, num(s.turboT, 0)));
    if (s.stats) for (const k in g.stats) g.stats[k] = num(s.stats[k], 0);
    if (s.seed) g.rng.set(s.seed);
    if (s.v === 2 && s.machine && Array.isArray(s.machine.coins) && s.machine.coins.length > 20) g.f.restore(s.machine);
    else g.f.seedCarpet();
    g.jp = Math.max(0, Math.min(JP_FULL - 1, Math.floor(num(s.jp, 0))));
    g.day = Number.isFinite(s.day) ? s.day : null; g.streak = Math.max(0, Math.floor(num(s.streak, 0)));
    // tokens that were on their way back come out of the port soon after loading
    String(s.port || '').split('').filter(isToken).slice(0, TOKEN_CAP).forEach((k, i) => g.recycle(k, PORT_DELAY + i * PORT_GAP, true));
    g.f.events.length = 0;
    return g;
  }
}
