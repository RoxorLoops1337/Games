// Fortune: loot crates, the Fortune Wheel and double-or-nothing, buried treasure, Lucky Finds, golden nodes, bottles.
//
// Luck here never touches the world's own random stream (`sim.rng`): every roll uses a small generator seeded from the
// world seed, the farmer and a counter that is saved with them. So adding or tuning loot cannot change how a world
// grows or how a fight goes, and a saved world rolls the same crate whether it was loaded or not.

import { PLOT, TILE } from '../config';
import { ITEMS, type ItemId, type Rarity, type Res } from '../data/items';
import {
    BOSS_CRATE, CRATE_ITEM, CRATE_PITY, CRATES, GAMBLE_MAX_CHAIN, GAMBLE_MAX_COINS, GAMBLE_ODDS, JACKPOT_COIN_MUL, LOOT_POOL, LUCK, MOB_CRATE, TITAN_CRATE, WHEEL, WHEEL_FREE_STAKE,
    WHEEL_JACKPOT_PITY, wheelPrice, type CrateTier,
} from '../data/loot';
import { NODES, type NodeKind } from '../data/nodes';
import { BOTTLES } from '../data/story';
import { PAL } from '../palette';
import { Rng } from '../rng';
import * as chronicle from './chronicle';
import * as quests from './quests';
import type { Sim } from './sim';
import { derived, takeItem } from './stats';
import type { Cmd, FortuneState, NodeE, PlayerS, Plot } from './types';

/** An item (or coins), how many, and how rare it was. */
type Got = [Res, number, number];

export const fortOf = (p: PlayerS): FortuneState => (p.fort ??= { fd: -1, pd: -1, pn: 0, pity: 0, cpity: 0, last: 0, chain: 0, n: 0 });

/** A fresh generator for one roll (see the note at the top). */
export const luckRng = (sim: Sim, p: PlayerS) => new Rng(`${sim.s.seed}:luck:${p.id}:${fortOf(p).n++}`);

const rarityOf = (r: Res): Rarity => (r === 'coin' ? 0 : ITEMS[r].rarity);

function merge (list: Got[]): Got[] {
    const out: Got[] = [];
    for (const g of list) {
        const row = out.find((x) => x[0] === g[0]);
        if (row) { row[1] += g[1]; row[2] = Math.max(row[2], g[2]); } else out.push([...g]);
    }
    return out;
}

// ── rolling ─────────────────────────────────────────────────────────────────
/** Pick a rarity class from the crate's odds; luck leans towards epic and legendary, `floor` rules out anything worse. */
function pickRarity (rng: Rng, cls: readonly number[], luck: number, floor: number): Rarity {
    const w: Record<number, number> = {};
    cls.forEach((x, i) => { if (i >= floor) w[i] = i >= 3 ? x * (1 + luck * 3) : x; });
    if (!Object.values(w).some((x) => x > 0)) w[floor] = 1;
    return Number(rng.weighted(w)) as Rarity;
}

function rollRow (rng: Rng, r: Rarity, mul: number): Got {
    const rows = LOOT_POOL[r];
    const row = rows[Number(rng.weighted(Object.fromEntries(rows.map((x, i) => [i, x.w]))))];
    let n = rng.int(row.min, row.max);
    if (row.item === 'coin' || ITEMS[row.item].kind !== 'gear') n = Math.max(1, Math.round(n * mul));
    return [row.item, n, r];
}

/** What a crate of this tier holds for this farmer (and who pays for the pity). */
export function rollCrate (sim: Sim, p: PlayerS, tier: CrateTier): Got[] {
    const rng = luckRng(sim, p), def = CRATES[tier], f = fortOf(p), luck = derived(p).luck;
    const count = rng.int(def.rolls[0], def.rolls[1]);
    const pity = tier !== 'wood' && f.cpity >= CRATE_PITY - 1;
    const out: Got[] = [];
    let best = 0;
    for (let i = 0; i < count; i++) {
        const floor = i === 0 ? Math.max(def.floor ?? 0, pity ? 3 : 0) : 0;
        const r = pickRarity(rng, def.cls, luck, floor);
        best = Math.max(best, r);
        out.push(rollRow(rng, r, def.mul));
    }
    if (def.shard && rng.chance(def.shard)) out.push(['lantern_shard', 1, 4]);
    if (tier !== 'wood') f.cpity = best >= 3 ? 0 : f.cpity + 1;
    return merge(out);
}

const topRarity = (items: Got[]) => items.reduce((m, g) => Math.max(m, g[2]), 0);

function grant (sim: Sim, p: PlayerS, items: Got[], x = p.x, y = p.y - 8) {
    const rng = luckRng(sim, p);                                   // (what does not fit in the pockets lands on the ground: scattered with our dice too)
    for (const [res, n] of items) sim.give(p, res, n, x, y, rng);
    const rare = items.filter((g) => g[2] >= 3).length;
    if (rare) quests.count(p, 'lootrare', rare);
}

function show (sim: Sim, p: PlayerS, src: 'crate' | 'bottle' | 'dig' | 'wheel', items: Got[], tier?: string, text?: string) {
    sim.events.push({ e: 'loot', to: p.id, src, tier, items, rare: topRarity(items), text });
}

// ── crates and bottles ──────────────────────────────────────────────────────
export function cmdCrate (sim: Sim, p: PlayerS, c: Extract<Cmd, { t: 'crate' }>) {
    const id = c.item;
    if (typeof id !== 'string' || !Object.prototype.hasOwnProperty.call(ITEMS, id)) return;
    const kind = ITEMS[id as ItemId].open;
    if (!kind || p.downed > 0) return;
    if (!takeItem(p, id as ItemId, 1)) { sim.deny(p, 'You do not have one'); return; }
    if (kind === 'bottle') { openBottle(sim, p); return; }
    const items = rollCrate(sim, p, kind);
    grant(sim, p, items);
    const rare = topRarity(items);
    sim.fx('crateOpen', p.x, p.y - 12, p.id);
    if (rare >= 3) sim.fx('rare', p.x, p.y - 14, p.id);
    if (rare >= 4) sim.fx('jackpot', p.x, p.y - 16, p.id);
    quests.count(p, `crate:${kind}`);
    show(sim, p, 'crate', items, kind);
}

function openBottle (sim: Sim, p: PlayerS) {
    const rng = luckRng(sim, p);
    const items = [rollRow(rng, rng.chance(0.3) ? 1 : 0, 1)];
    grant(sim, p, items);
    const where = buryNear(sim, p, rng);
    const note = where ? `\n\nA mound of fresh earth has appeared on island ${where.gx + 1}·${where.gy + 1}. X marks the spot.` : '';
    quests.count(p, 'bottle');
    sim.fx('lucky', p.x, p.y - 12, p.id);
    show(sim, p, 'bottle', items, undefined, rng.pick(BOTTLES) + note);
}

// ── buried treasure ─────────────────────────────────────────────────────────
const moundsOn = (sim: Sim, plot: Plot) => sim.ents('node').filter((e) => e.kind === 'mound' && e.plot === plot.i && sim.world.plotAt(e.tx, e.ty) === plot).length;      // (a mound that names the plot and stands on it)

/** Raise a mound on a plot (one at a time per island). Returns whether it did. */
function bury (sim: Sim, plotIndex: number, rng: Rng): boolean {
    const plot = sim.s.plots[plotIndex];
    if (!plot?.owned || moundsOn(sim, plot) > 0) return false;
    const spot = sim.world.randomFreeTile(plot, rng, sim.online.map((q) => ({ x: q.x, y: q.y })), 1);
    if (!spot) return false;
    sim.add<NodeE>({ k: 'node', kind: 'mound', tx: spot.tx, ty: spot.ty, hp: NODES.mound.hp, plot: plot.i });
    return true;
}

/** A bottle's treasure goes on the island nearest you that has none. */
function buryNear (sim: Sim, p: PlayerS, rng: Rng) {
    const owned = sim.world.ownedPlots();
    const origin = (pl: typeof owned[number]) => sim.world.plotOrigin(pl);
    const d = (pl: typeof owned[number]) => { const o = origin(pl); return Math.hypot((o.tx + PLOT / 2) * TILE - p.x, (o.ty + PLOT / 2) * TILE - p.y); };
    for (const pl of [...owned].sort((a, b) => d(a) - d(b))) if (bury(sim, pl.i, rng)) return pl;
    return null;
}

/** Every dawn a few islands grow a mound. */
export function dawn (sim: Sim) {
    if (!sim.online.length) return;
    const rng = new Rng(`${sim.s.seed}:bury:${sim.s.day}`);
    for (const pl of sim.world.ownedPlots()) {
        if (pl.mod === 'ruins' || pl.mod === 'treasure' || pl.heart) continue;          // (not on the Old Heart's arena or the vaults)
        if (rng.chance(LUCK.bury)) bury(sim, pl.i, rng);
    }
}

/** Whether a node that has just grown is golden: a fixed fraction, decided by where it stands (so it never uses the world's dice). */
const GOLDABLE: NodeKind[] = ['tree', 'rock', 'iron', 'copper', 'gold', 'coal', 'crystal'];
export function isGolden (seed: string, kind: NodeKind, tx: number, ty: number, n: number): boolean {
    if (!GOLDABLE.includes(kind)) return false;
    return new Rng(`${seed}:gold:${kind}:${tx}:${ty}:${n}`).chance(LUCK.golden);
}

function dig (sim: Sim, p: PlayerS, c: { x: number; y: number }) {
    const rng = luckRng(sim, p), luck = derived(p).luck;
    const out: Got[] = [];
    for (let i = 0; i < 2; i++) out.push(rollRow(rng, pickRarity(rng, [30, 40, 22, 7, 1], luck, 0), 1.2));
    out.push(['coin', rng.int(40, 90) + p.level * 6, 0]);
    if (rng.chance(LUCK.shardDig)) out.push(['lantern_shard', 1, 4]);
    if (rng.chance(0.25)) { const t: CrateTier = rng.chance(0.2) ? 'silver' : 'wood'; out.push([CRATE_ITEM[t], 1, rarityOf(CRATE_ITEM[t])]); }
    const items = merge(out);
    grant(sim, p, items, c.x, c.y);
    quests.count(p, 'dig');
    sim.fx('crateOpen', c.x, c.y - 6, p.id);
    if (topRarity(items) >= 3) sim.fx('rare', c.x, c.y - 10, p.id);
    show(sim, p, 'dig', items);
}

// ── things that happen as you work ──────────────────────────────────────────
/** A small surprise: coins, something useful, now and then a crate. */
function lucky (sim: Sim, p: PlayerS, c: { x: number; y: number }) {
    const rng = luckRng(sim, p);
    const r = rng.next();
    let got: Got;
    if (r < 0.55) got = ['coin', rng.int(10, 30) + p.level * 2, 0];
    else if (r < 0.8) got = rollRow(rng, 1, 1);
    else if (r < 0.92) got = rollRow(rng, 2, 1);
    else if (r < 0.98) got = [CRATE_ITEM.wood, 1, 1];
    else got = [CRATE_ITEM.silver, 1, 2];
    sim.give(p, got[0], got[1], c.x, c.y, rng);
    quests.count(p, 'lucky');
    sim.fx('lucky', c.x, c.y - 8, p.id);
    sim.float(c.x, c.y - 22, `Lucky find! +${got[1]} ${got[0] === 'coin' ? 'coins' : ITEMS[got[0]].name}`, PAL.gold, p.id);
}

/** A golden node broke: a good roll, often a crate, sometimes a shard. */
function golden (sim: Sim, p: PlayerS, c: { x: number; y: number }) {
    const rng = luckRng(sim, p), luck = derived(p).luck;
    const out: Got[] = [rollRow(rng, pickRarity(rng, [10, 35, 35, 17, 3], luck, 0), 1.5)];
    if (rng.chance(0.4)) out.push([CRATE_ITEM.silver, 1, 2]); else out.push([CRATE_ITEM.wood, 1, 1]);
    if (rng.chance(0.06)) out.push(['lantern_shard', 1, 4]);
    const items = merge(out);
    grant(sim, p, items, c.x, c.y);
    quests.count(p, 'golden');
    sim.fx('golden', c.x, c.y - 8, p.id);
    sim.float(c.x, c.y - 24, 'GOLDEN!', PAL.gold, p.id);
    sim.toast(p.id, `Golden find: ${items.map(([r, n]) => `${n > 1 ? n + '× ' : ''}${r === 'coin' ? 'coins' : ITEMS[r].name}`).join(', ')}`, 'k_star', PAL.gold);
}

/** Scatter for the extra drops of a golden node: our dice, not the world's. */
export const dropRng = (sim: Sim, p: PlayerS) => luckRng(sim, p);

/** Called when a node breaks: buried treasure pays out, golden nodes pay extra, and any node may hold a Lucky Find. */
export function afterBreak (sim: Sim, p: PlayerS, n: NodeE, c: { x: number; y: number }) {
    if (n.kind === 'mound') { dig(sim, p, c); return; }
    if (n.gold) { golden(sim, p, c); return; }
    const rng = luckRng(sim, p);
    if (rng.chance(LUCK.strike * (1 + derived(p).luck * 2))) lucky(sim, p, c);
}

// ── monsters and bosses ─────────────────────────────────────────────────────
/** A monster you beat may leave a crate. */
export function mobCrate (sim: Sim, by: PlayerS, tier: number, elite: boolean, x: number, y: number) {
    const rng = luckRng(sim, by);
    const [ct, chance] = MOB_CRATE[Math.min(MOB_CRATE.length - 1, Math.max(0, tier) + (elite ? 1 : 0))];
    if (!rng.chance(chance * (elite ? 2 : 1) * (1 + derived(by).luck))) return;
    sim.spawnDrop(CRATE_ITEM[ct], x, y - 5, rng);
    sim.fx('lucky', x, y - 8, by.id);
    sim.float(x, y - 22, 'A crate!', CRATES[ct].color, by.id);
}

/** The crates a guardian leaves each farmer who beat it. */
export function bossCrates (sim: Sim, p: PlayerS, bossId: string): [ItemId, number][] {
    const rng = luckRng(sim, p);
    const out: [ItemId, number][] = [[CRATE_ITEM[BOSS_CRATE.guaranteed], 1]];
    if (bossId === 'heart') out.push([CRATE_ITEM.mythic, 1]);
    else if (rng.chance(BOSS_CRATE.bonusChance)) out.push([CRATE_ITEM[BOSS_CRATE.bonus], 1]);
    return out;
}

/** An expedition win pays a crate: silver, golden from the third tier on. */
export function riftCrate (tier: number): [ItemId, number] { return [CRATE_ITEM[tier >= 3 ? 'gold' : 'silver'], 1]; }

/** A bottle now and then rides in on the line. */
export function fishingBottle (sim: Sim, p: PlayerS, x: number, y: number) {
    const rng = luckRng(sim, p);
    if (!rng.chance(LUCK.bottle * (1 + (derived(p).mods.fishLuck ?? 0)))) return;
    sim.give(p, 'bottle', 1, x, y, rng);
    sim.fx('lucky', x, y - 6, p.id);
    sim.float(x, y - 22, 'A bottle came up too!', PAL.foam, p.id);
}

// ── Titan nodes ─────────────────────────────────────────────────────────────
/** A farmer who helped fell a Titan node rolls for a crate (straight into their pockets); `boost` is the hands multiplier of the payout. Returns the tier that came up, if any. */
export function titanCrate (sim: Sim, p: PlayerS, boost: number, x: number, y: number): CrateTier | null {
    const rng = luckRng(sim, p), luck = 1 + derived(p).luck;
    let got: CrateTier | null = null;
    for (const [tier, chance] of TITAN_CRATE) if (!got && rng.chance(Math.min(1, chance * boost * luck))) got = tier;
    if (!got) return null;
    sim.give(p, CRATE_ITEM[got], 1, x, y, rng);
    sim.fx('lucky', x, y - 8, p.id);
    sim.float(x, y - 22, 'A crate!', CRATES[got].color, p.id);
    return got;
}

// ── the Fortune Wheel ───────────────────────────────────────────────────────
const coinRarity = (mul: number): number => (mul >= 12 ? 3 : mul >= 5 ? 2 : mul >= 2 ? 1 : 0);

export function cmdFortune (sim: Sim, p: PlayerS, c: Extract<Cmd, { t: 'fortune' }>) {
    const wheel = typeof c.id === 'number' ? sim.s.ents[c.id] : undefined;
    if (!wheel || wheel.k !== 'bld' || wheel.kind !== 'fortune' || !sim.inReach(p, wheel, 150)) { sim.deny(p, 'Stand next to the wheel'); return; }
    if (p.downed > 0) return;
    const f = fortOf(p);
    const at = sim.center(wheel);
    if (c.op === 'take') { f.last = 0; f.chain = 0; return; }
    if (c.op === 'double') {
        if (f.last <= 0 || f.chain >= GAMBLE_MAX_CHAIN) { sim.deny(p, 'Nothing to double'); return; }
        if (f.last > GAMBLE_MAX_COINS || p.coins < f.last) { f.last = 0; f.chain = 0; sim.deny(p, 'You need those coins in your pocket to risk them'); return; }
        const rng = luckRng(sim, p);
        const win = rng.chance(Math.min(0.5, GAMBLE_ODDS + derived(p).luck * 0.2));
        const stake = f.last;
        if (win) { p.coins += stake; f.last = stake * 2; f.chain++; } else { p.coins -= stake; f.last = 0; f.chain = 0; }
        quests.count(p, win ? 'gamble:win' : 'gamble:lose');
        sim.fx(win ? 'gambleWin' : 'gambleLose', at.x, at.y - 10, p.id);
        sim.events.push({ e: 'gamble', to: p.id, win, coins: win ? stake * 2 : stake, chain: f.chain, next: f.last });
        return;
    }
    if (c.op !== 'spin') return;
    const day = sim.s.day;
    if (f.pd !== day) { f.pd = day; f.pn = 0; }
    const free = f.fd !== day;
    const price = free ? 0 : wheelPrice(f.pn);
    if (!free && p.coins < price) { sim.deny(p, `A spin costs ${price} coins`); return; }
    if (free) f.fd = day; else { p.coins -= price; f.pn++; f.pity++; }
    const rng = luckRng(sim, p);
    const weights: Record<number, number> = {};
    WHEEL.forEach((w, i) => { weights[i] = w.kind === 'jackpot' ? w.w + f.pity * WHEEL_JACKPOT_PITY : w.w; });
    const seg = Number(rng.weighted(weights));
    const wedge = WHEEL[seg];
    const stake = free ? WHEEL_FREE_STAKE : price;
    const items: Got[] = [];
    f.last = 0; f.chain = 0;
    let jackpot = false;
    switch (wedge.kind) {
        case 'bust': items.push(['coin', Math.max(5, Math.round(stake * (wedge.mul ?? 0.2))), 0]); break;
        case 'coin': {
            const coins = Math.round(stake * (wedge.mul ?? 1));
            items.push(['coin', coins, coinRarity(wedge.mul ?? 1)]);
            f.last = Math.min(coins, GAMBLE_MAX_COINS);
            break;
        }
        case 'items': for (const [r, n] of wedge.items ?? []) items.push([r, n, rarityOf(r)]); break;
        case 'crate': { const it = CRATE_ITEM[wedge.crate!]; items.push([it, 1, rarityOf(it)]); break; }
        case 'jackpot':
            jackpot = true; f.pity = 0;
            items.push(['coin', stake * JACKPOT_COIN_MUL, 4], [CRATE_ITEM.gold, 1, 3], ['lantern_shard', 1, 4]);
            break;
    }
    grant(sim, p, items, at.x, at.y);
    quests.count(p, free ? 'spin:free' : 'spin:paid');
    if (jackpot) { quests.count(p, 'jackpot'); chronicle.note(sim, `jackpot:${p.id}:${sim.s.day}`, `${p.name} hit the jackpot on the Fortune Wheel!`, 'k_coin'); }
    sim.fx('spin', at.x, at.y - 8, p.id);
    sim.events.push({ e: 'spin', to: p.id, seg, items, gamble: f.last, chain: 0, free, price: wheelPrice(f.pd === day ? f.pn : 0), ...(jackpot ? { jackpot: true } : {}) });
}
