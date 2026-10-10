// Everything about "how strong is this player right now": the stat ledger, skills,
// equipment, buffs, XP, inventory capacity and the cost helpers that need them.

import { TUNING } from '../config';
import { Cost, ITEMS, ItemId, Res, STARTER_GEAR } from '../data/items';
import type { GearDef, WeaponType, WornSlot } from '../data/items';
import { RING_SLOTS } from '../data/items';
import { gemMods } from '../data/gems';
import { RING_TAG, satchelResult, type RelicDef, type RelicTag } from '../data/relics';
import { BOON_BY_ID } from '../data/rift';
import { WISH_BY_ID } from '../data/wishes';
import { SKILLS } from '../data/skills';
import { BUFFS, Mods, StatKey } from '../data/stats';
import { PAL } from '../palette';
import type { Inv, PlayerS } from './types';

/** Name / minimap colours, one per spawn slot. */
export const PLAYER_COLORS = [PAL.berry, PAL.sea, PAL.gold, PAL.plum, PAL.lime, PAL.pumpkin, PAL.blossom, PAL.foam];

export function newPlayer (id: string, name: string, slot: number, x: number, y: number): PlayerS {
    return {
        id, name, color: slot % PLAYER_COLORS.length, slot, online: true,
        x, y, fx: 0, fy: 1, moving: false, warp: 0,
        hearts: TUNING.startHearts, energy: TUNING.maxEnergy,
        xp: 0, level: 1, points: 0, coins: 0,
        inv: {},
        equip: { ...STARTER_GEAR },
        skills: {}, buffs: [],
        plotsBought: 0, downed: 0, revive: 0, invuln: 0, swingCd: 0, windDay: 0,
        stats: { harvested: 0, built: 0, kills: 0, revives: 0, crafted: 0 },
    };
}

// ── inventory ──────────────────────────────────────────────────────────────
export const countOf = (p: { inv: Inv }, id: ItemId) => p.inv[id] ?? 0;
export const have = (p: PlayerS, r: Res) => (r === 'coin' ? p.coins : countOf(p, r));

/** What `n` of an item is worth at a market to this farmer, before rounding: its price times n times their selling bonus. The Market and the Export Chute both start from it. */
export const sellValue = (p: PlayerS, item: ItemId, n = 1) => ITEMS[item].sell * n * derived(p).sellMul;

/** Max of one item a player can carry. */
export function itemCap (p: PlayerS, id: ItemId) {
    const kind = ITEMS[id].kind;
    return kind === 'gear' ? 9 : TUNING.baseCarry + Math.floor(stat(p, 'carry'));      // (packs raise how many of each item you can hold; gear stays at nine)
}

/** Adds up to n; returns how many fit. */
export function addItem (p: PlayerS, id: ItemId, n: number): number {
    const room = Math.max(0, itemCap(p, id) - countOf(p, id));
    const add = Math.min(room, n);
    if (add > 0) p.inv[id] = countOf(p, id) + add;
    return add;
}

export function takeItem (p: PlayerS, id: ItemId, n: number): boolean {
    if (countOf(p, id) < n) return false;
    const left = countOf(p, id) - n;
    if (left > 0) p.inv[id] = left; else delete p.inv[id];
    return true;
}

export function addRes (p: PlayerS, r: Res, n: number) {
    if (r === 'coin') { p.coins += n; return n; }
    return addItem(p, r, n);
}

export const canAfford = (p: PlayerS, cost: Cost) => (Object.entries(cost) as [Res, number][]).every(([r, n]) => have(p, r) >= n);
export function pay (p: PlayerS, cost: Cost) {
    for (const [r, n] of Object.entries(cost) as [Res, number][]) {
        if (r === 'coin') p.coins -= n; else takeItem(p, r, n);
    }
}

/** Building costs after skills (coins are never discounted). */
export function scaledCost (p: PlayerS, cost: Cost): Cost {
    const mul = derived(p).buildMul;
    const out: Cost = {};
    for (const [r, n] of Object.entries(cost) as [Res, number][]) out[r] = r === 'coin' ? n : Math.max(1, Math.round(n * mul));
    return out;
}

// ── skills ─────────────────────────────────────────────────────────────────
export const rankOf = (p: PlayerS, id: string) => p.skills[id] ?? 0;

/** Unlock tokens granted by learned skills (plus anything granted by cheats). */
export function unlocks (p: PlayerS): Set<string> {
    const set = new Set<string>();
    for (const [id, rank] of Object.entries(p.skills)) {
        if (rank > 0) for (const t of SKILLS[id]?.unlock ?? []) set.add(t);
    }
    return set;
}
export const hasUnlock = (p: PlayerS, token?: string) => !token || unlocks(p).has(token);

export function canLearn (p: PlayerS, id: string): { ok: boolean; why: string } {
    const n = SKILLS[id];
    if (!n) return { ok: false, why: 'Unknown skill' };
    const rank = rankOf(p, id);
    if (rank >= n.max) return { ok: false, why: 'Maxed out' };
    if (!n.req.some((r) => r === 'hub' || rankOf(p, r) > 0)) return { ok: false, why: 'Learn a connected skill first' };
    if (p.points < n.cost) return { ok: false, why: `Needs ${n.cost} skill point${n.cost > 1 ? 's' : ''}` };
    return { ok: true, why: '' };
}

export function learnSkill (p: PlayerS, id: string): boolean {
    if (!canLearn(p, id).ok) return false;
    p.points -= SKILLS[id].cost;
    p.skills[id] = rankOf(p, id) + 1;
    return true;
}

// ── the stat ledger ────────────────────────────────────────────────────────
function gearOf (p: PlayerS, slot: WornSlot): GearDef | null {
    const id = p.equip[slot];
    return id ? ITEMS[id].gear ?? null : null;
}

/** What an item is as a relic (undefined: not one). */
const relicOf = (it: string): RelicDef | undefined => (ITEMS as Record<string, { relic?: RelicDef }>)[it]?.relic;
/** The tags of the rings worn: each attunes the relics of its tag. */
export const ringTags = (p: PlayerS): RelicTag[] => RING_SLOTS.map((r) => RING_TAG[p.equip[r] ?? '']).filter((t): t is RelicTag => !!t);

export function modsOf (p: PlayerS): Mods {
    const m: Mods = {};
    const add = (mods: Mods | undefined, mul = 1) => {
        if (!mods) return;
        for (const k of Object.keys(mods) as StatKey[]) m[k] = (m[k] ?? 0) + (mods[k] ?? 0) * mul;
    };
    for (const [id, rank] of Object.entries(p.skills)) add(SKILLS[id]?.mods, rank);
    for (const id of Object.values(p.equip)) add(ITEMS[id!]?.gear?.mods);
    if (p.gems) add(gemMods(p.gems));
    if (p.satchel?.length) add(satchelResult(relicOf, p.satchel, ringTags(p)).mods);
    for (const b of p.buffs) add(BUFFS[b.id]?.mods);
    for (const id of p.boons ?? []) add(BOON_BY_ID[id]?.mods);
    if (p.wish) add(WISH_BY_ID[p.wish]?.mods);
    return m;
}

/** One stat by key — handy outside the hot path. */
export const stat = (p: PlayerS, key: StatKey) => modsOf(p)[key] ?? 0;

export interface Derived {
    mods: Mods;
    maxHearts: number;
    maxEnergy: number;
    armor: number;
    toolPower: number;
    toolTier: number;
    weapon: { dmg: number; wtype: WeaponType; cd: number; reach: number };
    reach: number;
    speed: number;
    magnet: number;
    swingCd: number;
    swingEnergy: number;
    xpMul: number;
    sellMul: number;
    landMul: number;
    buildMul: number;
    growMul: number;
    respawnMul: number;
    nightShorten: number;
    luck: number;
    crit: number;
    dodge: number;
    energyRegen: number;
    foodMul: number;
    healMul: number;
    buffMul: number;
}

export function derived (p: PlayerS): Derived {
    const m = modsOf(p);
    const g = (k: StatKey) => m[k] ?? 0;
    const tool = gearOf(p, 'tool');
    const wgear = gearOf(p, 'weapon');
    const starving = p.energy <= 0;
    const wcd = wgear?.cd ?? 1;
    return {
        mods: m,
        maxHearts: TUNING.startHearts + g('maxHearts'),
        maxEnergy: TUNING.maxEnergy + g('maxEnergy'),
        armor: g('armor'),
        toolPower: tool?.power ?? 1,
        toolTier: tool?.tier ?? 0,
        weapon: {
            dmg: ((wgear?.dmg ?? 1) + g('dmg')) * (1 + g('dmgPct')),
            wtype: wgear?.wtype ?? 'fist',
            cd: wcd,
            reach: wgear?.reach ?? 18,
        },
        reach: TUNING.reach * (1 + g('reach')),
        speed: TUNING.moveSpeed * Math.max(0.4, 1 + g('moveSpeed')) * (starving ? TUNING.lowEnergySlow : 1),
        magnet: TUNING.magnetRadius * (1 + g('magnet')),
        swingCd: TUNING.swingCooldown / Math.max(0.3, 1 + g('swingSpeed')) * (starving ? 2 : 1),
        swingEnergy: Math.max(0.1, TUNING.swingEnergy * (1 + g('swingCost'))),
        xpMul: 1 + g('xp'),
        sellMul: 1 + g('sell'),
        landMul: Math.max(0.3, 1 + g('landCost')),
        buildMul: Math.max(0.3, 1 + g('buildCost')),
        growMul: 1 + g('grow'),
        respawnMul: 1 + g('regrow'),
        nightShorten: 0,
        luck: g('luck'),
        crit: g('crit'),
        dodge: Math.min(0.6, g('dodge')),
        energyRegen: g('energyRegen'),
        foodMul: 1 + g('foodPower'),
        healMul: 1 + g('healPower'),
        buffMul: 1 + g('buffTime'),
    };
}

// ── levels ─────────────────────────────────────────────────────────────────
export const MAX_LEVEL = 80;
export const xpToNext = (level: number) => Math.round(10 + 4 * Math.pow(level, 1.6));
export const xpToNextOf = (p: PlayerS) => xpToNext(p.level);

/** Adds XP; returns how many levels were gained (each grants a skill point). */
export function grantXp (p: PlayerS, amount: number): number {
    if (p.level >= MAX_LEVEL) return 0;
    p.xp += amount * derived(p).xpMul;
    let gained = 0;
    while (p.level < MAX_LEVEL && p.xp >= xpToNext(p.level)) {
        p.xp -= xpToNext(p.level);
        p.level++;
        p.points++;
        gained++;
    }
    if (p.level >= MAX_LEVEL) p.xp = 0;
    return gained;
}

