// Tower levels and perks: a tower earns XP from what it kills, and every level it reaches lets its builder (or anyone in reach) pick one of
// three upgrades drawn from its own pool, rarest ones last. Pure data and pure functions (no sim, no Phaser): the sim (sim/defense.ts), the
// Tower window, the world badges, the tests and the wiki all read this one file, so they cannot disagree about what a perk does.
// Every number is a dial in TUNING.towers (config.ts).

import { TUNING } from '../config';
import { BUILDINGS, type BuildingKind } from './buildings';
import { Rng } from '../rng';

/** The four kinds of defense that level up. */
export type TowerType = 'archer' | 'ballista' | 'tesla' | 'spike';
export type Rarity = 'common' | 'uncommon' | 'rare' | 'legendary';
export const RARITIES: readonly Rarity[] = ['common', 'uncommon', 'rare', 'legendary'];
export const RARITY_NAME: Record<Rarity, string> = { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', legendary: 'Legendary' };

export interface PerkDef {
    id: string; name: string; icon: string; rarity: Rarity;
    desc: string;
    /** Which towers may be offered it. */
    on: readonly TowerType[];
    /** How many times one tower may take it (1: once). */
    max: number;
}

const T = TUNING.towers;
const pct = (x: number) => `${Math.round(x * 100)}%`;
const SHOOTERS = ['archer', 'ballista', 'tesla'] as const;
const ALL = ['archer', 'ballista', 'tesla', 'spike'] as const;

export const PERKS: readonly PerkDef[] = [
    // common
    { id: 'range', name: 'Long Sight', icon: 'tp_range', rarity: 'common', max: 3, on: SHOOTERS, desc: `+${pct(T.range)} range.` },
    { id: 'haste', name: 'Quick Hands', icon: 'tp_haste', rarity: 'common', max: 3, on: SHOOTERS, desc: `+${pct(T.haste)} attack speed.` },
    { id: 'power', name: 'Sharpened', icon: 'tp_power', rarity: 'common', max: 4, on: ALL, desc: `+${pct(T.power)} damage.` },
    { id: 'sturdy', name: 'Reinforced', icon: 'tp_sturdy', rarity: 'common', max: 3, on: SHOOTERS, desc: `+${pct(T.sturdy)} tower health.` },
    { id: 'rapid', name: 'Hair Trigger', icon: 'tp_haste', rarity: 'common', max: 3, on: ['spike'], desc: `+${pct(T.rapid)} faster bites.` },
    { id: 'wider', name: 'Wide Spikes', icon: 'tp_wider', rarity: 'common', max: 1, on: ['spike'], desc: 'Also bites monsters on the tiles around it.' },
    // uncommon
    { id: 'pierce', name: 'Piercing', icon: 'tp_pierce', rarity: 'uncommon', max: 1, on: ['archer', 'ballista'], desc: `The shot also hits a second monster in line (${pct(T.pierceDmg)} damage).` },
    { id: 'multi', name: 'Multishot', icon: 'tp_multi', rarity: 'uncommon', max: 2, on: ['archer'], desc: `+1 arrow at another monster, each for ${pct(T.multiDmg)} damage.` },
    { id: 'crit', name: 'Keen Eye', icon: 'tp_crit', rarity: 'uncommon', max: 3, on: ALL, desc: `+${pct(T.crit)} chance to hit twice as hard.` },
    { id: 'slow', name: 'Slowing Shots', icon: 'tp_slow', rarity: 'uncommon', max: 1, on: ['archer', 'ballista', 'tesla', 'spike'], desc: `Hit monsters move ${pct(T.slow)} slower for ${T.slowSecs} s.` },
    { id: 'veteran', name: 'Veteran', icon: 'tp_veteran', rarity: 'uncommon', max: 1, on: ALL, desc: `+${pct(T.veteran)} XP from kills.` },
    { id: 'mending', name: 'Self-Mending', icon: 'tp_mending', rarity: 'uncommon', max: 3, on: SHOOTERS, desc: `Heals itself ${T.mendMul + 1} times as fast (and ${T.mendMul} more times the base per extra rank).` },
    { id: 'repairs', name: 'Field Repairs', icon: 'tp_repairs', rarity: 'common', max: 2, on: ALL, desc: `Repairs by hand cost ${pct(T.repairCut)} less.` },
    { id: 'bleed', name: 'Barbed Spikes', icon: 'tp_bleed', rarity: 'uncommon', max: 1, on: ['spike'], desc: `Bitten monsters bleed for ${T.bleedSecs} s.` },
    { id: 'lasting', name: 'Lingering', icon: 'tp_lasting', rarity: 'uncommon', max: 1, on: ['spike'], desc: 'Bleeding and slowing last twice as long.' },
    // rare
    { id: 'execute', name: 'Executioner', icon: 'tp_execute', rarity: 'rare', max: 1, on: ALL, desc: `+${pct(T.execute)} damage to monsters under ${pct(T.executeBelow)} health.` },
    { id: 'splash', name: 'Splash', icon: 'tp_splash', rarity: 'rare', max: 1, on: ['ballista'], desc: `The bolt also hits monsters around where it lands (${pct(T.splashDmg)} damage).` },
    { id: 'chain', name: 'Long Chain', icon: 'tp_chain', rarity: 'rare', max: 2, on: ['tesla'], desc: '+1 monster the lightning leaps to.' },
    { id: 'overcharge', name: 'Overcharge', icon: 'tp_overcharge', rarity: 'rare', max: 1, on: SHOOTERS, desc: `Every ${T.overEvery}th shot hits ${T.overMul} times as hard.` },
    { id: 'aura', name: 'Vampiric Aura', icon: 'tp_aura', rarity: 'rare', max: 1, on: SHOOTERS, desc: `Every kill mends the hurt walls and towers within ${T.auraTiles} tiles (${pct(T.auraMend)} of their health).` },
    { id: 'barbs', name: 'Cruel Barbs', icon: 'tp_barbs', rarity: 'rare', max: 1, on: ['spike'], desc: `Bites hit ${T.barbs} times as hard.` },
    // legendary
    { id: 'fire', name: 'Fire Arrows', icon: 'tp_fire', rarity: 'legendary', max: 1, on: ['archer', 'ballista'], desc: `Shots set monsters ablaze: ${pct(T.burnDps)} of the damage every second for ${T.burnSecs} s.` },
    { id: 'frost', name: 'Frost Bolts', icon: 'tp_frost', rarity: 'legendary', max: 1, on: SHOOTERS, desc: `Hit monsters freeze solid for ${T.freezeSecs} s.` },
    { id: 'storm', name: 'Storm', icon: 'tp_storm', rarity: 'legendary', max: 1, on: ['tesla'], desc: `Lightning strikes every monster in range at once (up to ${T.stormMax}).` },
];
export const PERK_BY_ID: Record<string, PerkDef> = Object.fromEntries(PERKS.map((p) => [p.id, p]));
const own = (id: unknown): id is string => typeof id === 'string' && Object.prototype.hasOwnProperty.call(PERK_BY_ID, id);
export const isPerk = own;

// ── XP and levels ───────────────────────────────────────────────────────────
/** XP it takes to go from level `lv - 1` to `lv` (level 2: `xpFirst`, growing steadily to about five times that at level 10). */
export const xpStep = (lv: number) => Math.round(T.xpFirst * (1 + Math.max(0, lv - 2) * T.xpGrow));
/** Total XP at which a tower reaches `lv`. */
export function xpAt (lv: number): number { let n = 0; for (let l = 2; l <= Math.min(lv, T.maxLevel); l++) n += xpStep(l); return n; }
/** The level a tower with this much XP has. */
export function levelOf (xp: number | undefined): number {
    const x = typeof xp === 'number' && Number.isFinite(xp) ? xp : 0;
    let lv = 1;
    while (lv < T.maxLevel && x >= xpAt(lv + 1)) lv++;
    return lv;
}
/** How far through the current level (0..1; 1 at the top). */
export function levelFrac (xp: number | undefined): number {
    const lv = levelOf(xp);
    if (lv >= T.maxLevel) return 1;
    const x = typeof xp === 'number' && Number.isFinite(xp) ? xp : 0;
    return (x - xpAt(lv)) / xpStep(lv + 1);
}
/** XP a kill earns a tower: the monster's own XP, more for an elite, much more for a boss. */
export const killXp = (monsterXp: number, elite: boolean, boss: boolean) => Math.max(1, Math.round(monsterXp * (elite ? T.eliteXp : 1) * (boss ? T.bossXp : 1)));

// ── what a tower has ────────────────────────────────────────────────────────
export interface TowerLike { xp?: number; pk?: readonly string[] }
/** How many times a perk was taken. */
export const count = (pk: readonly string[] | undefined, id: string) => (Array.isArray(pk) ? pk.filter((x) => x === id).length : 0);
/** The perks a tower really has (a damaged save or a hostile record may hold anything: only known ids count). */
export const perksOf = (pk: unknown): string[] => (Array.isArray(pk) ? pk.filter(own) : []);
/** Picks waiting: one for every level reached beyond the picks already made. */
export const pending = (t: TowerLike) => Math.max(0, levelOf(t.xp) - 1 - perksOf(t.pk).length);

/** Which tower family a building kind belongs to (none: not a tower). */
export function towerType (kind: string): TowerType | null {
    return kind === 'tower_archer' ? 'archer' : kind === 'ballista' ? 'ballista' : kind === 'tesla' ? 'tesla' : kind === 'spike' ? 'spike' : null;
}

/** May this tower take this perk now? */
export function canTake (type: TowerType, taken: readonly string[] | undefined, id: string, lv: number): boolean {
    const d = own(id) ? PERK_BY_ID[id] : undefined;
    if (!d || !d.on.includes(type)) return false;
    if (d.rarity === 'legendary' && lv < T.legendaryFrom) return false;
    return count(taken, id) < d.max;
}

/** The three perks offered for a tower's next pick (the level it reached for it): the same every time, from the world seed, the tower and the level. */
export function offer (seed: string, id: number, type: TowerType, t: TowerLike): string[] {
    const pk = perksOf(t.pk);
    const lv = pk.length + 2;                                   // (the level that earned this pick)
    const rng = new Rng(`${seed}:tp:${id}:${lv}`);
    const pool = PERKS.filter((p) => canTake(type, pk, p.id, lv));
    const out: string[] = [];
    while (out.length < T.offers && pool.length) {
        const w: Partial<Record<Rarity, number>> = {};
        for (const r of RARITIES) if (pool.some((p) => p.rarity === r)) w[r] = T.weights[r];
        const r = rng.weighted(w);
        const of = pool.filter((p) => p.rarity === r);
        const pick = rng.pick(of);
        out.push(pick.id);
        pool.splice(pool.indexOf(pick), 1);
    }
    return out;
}

// ── what the numbers come to ────────────────────────────────────────────────
export interface TowerStats {
    /** Damage per shot (before crits and the like). */
    dmg: number;
    /** Range in px (a spike trap: 0). */
    range: number;
    /** Seconds between shots (a spike: between bites of one monster). */
    every: number;
    /** Hit points (0: none). */
    hp: number;
    crit: number; multi: number; pierce: boolean; slow: boolean; freeze: boolean; burn: boolean; bleed: boolean; lasting: boolean; wider: boolean;
    execute: boolean; splash: boolean; chain: number; overcharge: boolean; aura: boolean; mend: boolean; storm: boolean;
    xpMul: number;
}

/** The share of its health a defense mends each second once it has been left alone: the base, times more for Self-Mending ranks. */
export const regenShare = (pk: unknown) => T.regen * (1 + T.mendMul * count(perksOf(pk), 'mending'));

/**
 * What a repair by hand costs: the missing share of the health (0..1) of the base amount for this kind, less for Field Repairs; always
 * at least one of each thing while anything is missing. A wall's base is a share of its build cost.
 */
export function repairCost (kind: string, missing: number, pk?: unknown): Record<string, number> {
    const base: Record<string, number> = T.repair[kind] ?? Object.fromEntries(Object.entries(BUILDINGS[kind as BuildingKind]?.cost ?? {}).filter(([r]) => r !== 'coin').map(([r, n]) => [r, (n as number) * T.wallRepair]));
    const cut = Math.max(0.1, 1 - T.repairCut * count(perksOf(pk), 'repairs'));
    const f = Math.max(0, Math.min(1, Number.isFinite(missing) ? missing : 0));
    const out: Record<string, number> = {};
    if (f <= 0) return out;
    for (const [r, n] of Object.entries(base)) out[r] = Math.max(1, Math.ceil(n * f * cut - 1e-9));
    return out;
}

/** A tower's numbers from its type, its perks and its builder's level (the one function the sim, the window and the tests all use). */
export function statsOf (type: TowerType, pk: readonly string[] | undefined, ownerLevel = 1): TowerStats {
    pk = perksOf(pk);
    const B = TUNING.blight, n = (id: string) => count(pk, id), has = (id: string) => n(id) > 0;
    const spec = type === 'spike' ? { range: 0, every: B.spikeEvery, dmg: B.spikeDmg } : B[type];
    const base = type === 'spike' ? 0 : type === 'archer' ? B.hp.archer : type === 'ballista' ? B.hp.ballista : B.hp.tesla;
    const mul = 1 + B.towerLevel * Math.max(0, ownerLevel - 1);
    const dmg = spec.dmg * mul * (1 + T.power * n('power')) * (has('barbs') ? T.barbs : 1);
    return {
        dmg,
        range: spec.range * (1 + T.range * n('range')),
        every: type === 'spike' ? spec.every / (1 + T.rapid * n('rapid')) : spec.every / (1 + T.haste * n('haste')),
        hp: Math.round(base * (1 + T.sturdy * n('sturdy'))),
        crit: Math.min(1, T.crit * n('crit')),
        multi: n('multi'),
        pierce: has('pierce'), slow: has('slow'), freeze: has('frost'), burn: has('fire'), bleed: has('bleed'), lasting: has('lasting'), wider: has('wider'),
        execute: has('execute'), splash: has('splash'), chain: type === 'tesla' ? B.tesla.chain + n('chain') : 0, overcharge: has('overcharge'), aura: has('aura'), mend: has('mending'), storm: has('storm'),
        xpMul: 1 + T.veteran * n('veteran'),
    };
}
