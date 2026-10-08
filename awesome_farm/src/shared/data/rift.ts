// Expeditions: short, hard, roguelike runs on the four rift islands in the corners of the
// sea. A party of up to four launches from an Expedition Dock, fights a handful of waves,
// picks a boon between waves (they last only for the run) and faces a guardian at the end.
// Everything about how a run plays out lives here; sim/rift.ts executes it.

import { PAL } from '../palette';
import { Rng } from '../rng';
import type { ItemId } from './items';
import { type BossPhase, MOBS, MobKind, WILD_KINDS } from './mobs';
import type { Mods } from './stats';

export const RIFT_PARTY_MAX = 4;
/** Seconds to choose a boon before one is chosen for you. */
export const RIFT_PICK_SECONDS = 22;

interface RiftTier {
    id: number;
    name: string;
    blurb: string;
    color: number;
    waves: number;               // the last one is the guardian
    cap: number;                 // highest regular monster tier that appears
    hpMul: number;               // monster health compared with the wild
    dm: number;                  // monster damage compared with the wild
    phases: BossPhase[];         // how the guardian fights
    summon?: MobKind;            // what a 'summon' pattern calls
    elite: number;               // base chance a monster is an elite
    need: number;                // bosses you must have helped defeat
    level: number;               // the level it is meant for
    guardian: MobKind;
    guardianHp: number;          // × the guardian's normal health
    escorts?: MobKind;           // what stands beside the guardian
    shards: [number, number];    // rift shards for the party's trouble (each)
    coins: number;
    xp: number;
    loot: [item: ItemId, chance: number, min: number, max: number][];
    points: number;              // skill points the first time you clear it
    endless?: boolean;           // no last wave: a guardian every fifth, and you cash out when you choose (or fall)
}

export const RIFT_TIERS: RiftTier[] = [
    {
        id: 0, name: 'Mossy Rift', blurb: 'A crack in the world, overgrown. Slimes, beasts and bones.', color: PAL.leaf,
        waves: 4, cap: 1, hpMul: 1.25, dm: 1, elite: 0.05, need: 0, level: 5, guardian: 'boar', guardianHp: 9,
        phases: [
            { at: 1, patterns: ['charge', 'slam'], pause: 1.5 },
            { at: 0.5, patterns: ['charge', 'sweep', 'charge', 'slam'], pause: 1.1, speed: 1.15, note: 'The Tusker is enraged!' },
        ],
        shards: [3, 5], coins: 70, xp: 140, points: 1,
        loot: [['potion_heal', 0.7, 1, 2], ['bone', 0.6, 2, 4], ['pod', 0.3, 1, 2]],
    },
    {
        id: 1, name: 'Gravel Rift', blurb: 'Stone gnashes in the dark. Rocklings and bone archers.', color: PAL.stone,
        waves: 5, cap: 2, hpMul: 2, dm: 1.15, elite: 0.08, need: 1, level: 12, guardian: 'rockling', guardianHp: 9, escorts: 'skeleton', summon: 'skeleton',
        phases: [
            { at: 1, patterns: ['slam', 'rain'], pause: 1.4 },
            { at: 0.55, patterns: ['slam', 'summon', 'rain', 'radial'], pause: 1.1, speed: 1.2, note: 'The ground splits!' },
        ],
        shards: [6, 9], coins: 160, xp: 320, points: 1,
        loot: [['potion_might', 0.5, 1, 2], ['goldbar', 0.45, 1, 3], ['crystal', 0.25, 1, 1]],
    },
    {
        id: 2, name: 'Hollow Rift', blurb: 'Armor with nobody inside. They are very sure of themselves.', color: PAL.plum,
        waves: 6, cap: 3, hpMul: 2.9, dm: 1.3, elite: 0.12, need: 2, level: 20, guardian: 'knight', guardianHp: 8, escorts: 'wraith', summon: 'wraith',
        phases: [
            { at: 1, patterns: ['sweep', 'leap', 'aimed'], pause: 1.2 },
            { at: 0.6, patterns: ['sweep', 'leap', 'chain', 'summon'], alone: { chain: 'radial' }, pause: 1, speed: 1.2, note: 'The armor rattles to life!' },
            { at: 0.25, patterns: ['leap', 'sweep', 'rain', 'radial'], pause: 0.8, speed: 1.35 },
        ],
        shards: [10, 14], coins: 300, xp: 600, points: 2,
        loot: [['crystal', 0.6, 1, 3], ['potion_guard', 0.6, 1, 2], ['ectoplasm', 0.5, 1, 3]],
    },
    {
        id: 3, name: 'Wraith Rift', blurb: 'Cold, fast and everywhere. Stay close to your friends.', color: PAL.foam,
        waves: 7, cap: 3, hpMul: 4, dm: 1.5, elite: 0.18, need: 3, level: 28, guardian: 'wraith', guardianHp: 13, escorts: 'knight', summon: 'wraith',
        phases: [
            { at: 1, patterns: ['aimed', 'spiral', 'charge'], pause: 1.1 },
            { at: 0.6, patterns: ['spiral', 'radial', 'hex', 'summon'], alone: { hex: 'aimed' }, pause: 0.9, speed: 1.2, note: 'It howls!' },
            { at: 0.25, patterns: ['spiral', 'rain', 'radial', 'charge'], pause: 0.7, speed: 1.4 },
        ],
        shards: [16, 22], coins: 480, xp: 1000, points: 2,
        loot: [['rift_core', 0.35, 1, 1], ['crystal', 0.7, 2, 4], ['potion_vigor', 0.6, 1, 2]],
    },
    {
        id: 4, name: 'Heart Rift', blurb: 'Where the world ends and begins. Few come back unchanged.', color: PAL.berry,
        waves: 8, cap: 3, hpMul: 5.5, dm: 1.75, elite: 0.26, need: 4, level: 36, guardian: 'knight', guardianHp: 18, escorts: 'wraith', summon: 'wraith',
        phases: [
            { at: 1, patterns: ['sweep', 'leap', 'radial', 'rain'], pause: 1 },
            { at: 0.65, patterns: ['leap', 'spiral', 'summon', 'chain', 'rain'], alone: { chain: 'sweep' }, pause: 0.8, speed: 1.2, note: 'The Heart beats faster!' },
            { at: 0.3, patterns: ['spiral', 'leap', 'freeze', 'rain', 'hex'], alone: { freeze: 'radial', hex: 'sweep' }, pause: 0.6, speed: 1.4, note: 'One last beat!' },
        ],
        shards: [26, 34], coins: 800, xp: 1700, points: 3,
        loot: [['rift_core', 1, 1, 2], ['crystal', 0.8, 3, 5], ['potion_night', 0.6, 1, 2]],
    },
    {
        id: 5, name: 'The Abyss', blurb: 'No end, no mercy. How deep can you go? Cash out whenever you like.', color: PAL.dusk,
        waves: 0, cap: 3, hpMul: 6, dm: 1.8, elite: 0.3, need: 5, level: 45, guardian: 'knight', guardianHp: 22, escorts: 'wraith', summon: 'wraith', endless: true,
        phases: [
            { at: 1, patterns: ['sweep', 'leap', 'radial', 'rain', 'aimed'], pause: 0.9 },
            { at: 0.6, patterns: ['leap', 'spiral', 'summon', 'chain', 'rain', 'radial'], alone: { chain: 'sweep' }, pause: 0.7, speed: 1.25, note: 'It is not going to stop!' },
            { at: 0.3, patterns: ['spiral', 'leap', 'freeze', 'rain', 'hex', 'summon'], alone: { freeze: 'radial', hex: 'sweep' }, pause: 0.55, speed: 1.45 },
        ],
        shards: [0, 0], coins: 0, xp: 0, points: 4, loot: [],
    },
];

/** The guardians the Abyss rotates through, one on every fifth wave. */
const ABYSS_GUARDIANS: { guardian: MobKind; escorts: MobKind }[] = [
    { guardian: 'boar', escorts: 'bat' }, { guardian: 'rockling', escorts: 'skeleton' }, { guardian: 'knight', escorts: 'wraith' }, { guardian: 'wraith', escorts: 'knight' },
];
const ABYSS_BOSS_EVERY = 5;
export const isBossWave = (t: RiftTier, wave: number) => (t.endless ? wave % ABYSS_BOSS_EVERY === 0 : wave >= t.waves);

// ── boons ──────────────────────────────────────────────────────────────────
/** Boons that do something other than change a stat (the sim looks for these ids). */
type BoonSpecial = 'regen' | 'aegis' | 'phoenix' | 'greed' | 'bounty';

interface Boon {
    id: string;
    name: string;
    desc: string;
    icon: string;
    rarity: 0 | 1 | 2;           // common, rare, legendary
    mods?: Mods;
    special?: BoonSpecial;
}

export const BOON_RARITY = ['Common', 'Rare', 'Legendary'] as const;

// ── omens: optional curses a party takes on for a bigger payout ────────────
interface Omen {
    id: string;
    name: string;
    desc: string;
    icon: string;
    color: number;
    bonus: number;               // adds to the run's rewards (0.2 = +20% coins, xp and shards)
}

export const OMENS: Omen[] = [
    { id: 'swift',   name: 'Swift',      desc: 'Monsters move 30% faster.',                  icon: 'k_boot',   color: PAL.foam,    bonus: 0.15 },
    { id: 'brutal',  name: 'Brutal',     desc: 'Monsters hit 40% harder.',                   icon: 'k_fist',   color: PAL.berry,   bonus: 0.2 },
    { id: 'tough',   name: 'Tough',      desc: 'Monsters have 50% more health.',             icon: 'k_shield', color: PAL.stone,   bonus: 0.2 },
    { id: 'swarm',   name: 'Swarming',   desc: 'A third more monsters in every wave.',       icon: 'k_paw',    color: PAL.leaf,    bonus: 0.2 },
    { id: 'champs',  name: 'Champions',  desc: 'Elite monsters are three times as common.',  icon: 'k_crown',  color: PAL.gold,    bonus: 0.15 },
    { id: 'spartan', name: 'Spartan',    desc: 'No boons between waves.',                    icon: 'k_lock',   color: PAL.pumpkin, bonus: 0.3 },
    { id: 'cursed',  name: 'Cursed',     desc: 'Healing potions turn to dust.',              icon: 'k_flask',  color: PAL.plum,    bonus: 0.15 },
    { id: 'rush',    name: 'Relentless', desc: 'The next wave arrives almost at once.',      icon: 'k_bolt',   color: PAL.blossom, bonus: 0.1 },
];
export const OMEN_MAX = 3;
const OMEN_BY_ID: Record<string, Omen> = Object.fromEntries(OMENS.map((o) => [o.id, o]));
export const omenOf = (id: string): Omen | undefined => (Object.prototype.hasOwnProperty.call(OMEN_BY_ID, id) ? OMEN_BY_ID[id] : undefined);
/** A run's chosen omens, cleaned up: known, unique, at most OMEN_MAX. */
export function cleanOmens (ids: unknown): string[] {
    if (!Array.isArray(ids)) return [];
    const out: string[] = [];
    for (const id of ids) if (typeof id === 'string' && omenOf(id) && !out.includes(id)) out.push(id);
    return out.slice(0, OMEN_MAX);
}
/** The rift of the day: the same for everyone on a given day, with two omens already taken on. */
export const DAILY_BONUS = 0.25;                       // on top of the omens' bonus
export const dailyShards = (tier: number) => 4 + 3 * tier;   // a one-off extra for the first clear of the day
export function dailyRift (seed: string, day: number, bosses: number): { tier: number; omens: string[] } {
    const rng = new Rng(`${seed}:rift-of-the-day:${day}`);
    const open = RIFT_TIERS.filter((t) => !t.endless && bosses >= t.need).map((t) => t.id);
    const omens = rng.shuffle(OMENS.map((o) => o.id)).slice(0, 2);
    const tier = open.length ? open[Math.floor(rng.next() * open.length)] : -1;
    return { tier, omens };
}

/** Reward multiplier for a set of omens. */
export const omenMul = (ids: readonly string[] | undefined) => 1 + (ids ?? []).reduce((a, id) => a + (omenOf(id)?.bonus ?? 0), 0);


export const BOONS: Boon[] = [
    // offence
    { id: 'edge', name: 'Keen Edge', desc: '+1 damage with your weapon.', icon: 'k_sword', rarity: 0, mods: { dmg: 1 } },
    { id: 'fury', name: 'Fury', desc: 'Swing 20% faster.', icon: 'k_bolt', rarity: 0, mods: { swingSpeed: 0.2 } },
    { id: 'deadeye', name: 'Deadeye', desc: '+15% critical chance.', icon: 'k_target', rarity: 0, mods: { crit: 0.15 } },
    { id: 'reach', name: 'Long Blade', desc: '+30% reach.', icon: 'k_reach', rarity: 0, mods: { reach: 0.3 } },
    { id: 'pack', name: 'Pack Leader', desc: 'Your companion hits 60% harder.', icon: 'k_paw', rarity: 0, mods: { companionDmg: 0.6 } },
    { id: 'slayer', name: 'Giant Slayer', desc: '+50% damage against guardians and bosses.', icon: 'k_skull', rarity: 1, mods: { bossDmg: 0.5 } },
    { id: 'glass', name: 'Glass Cannon', desc: '+60% damage, but 1.5 fewer hearts.', icon: 'k_flame', rarity: 1, mods: { dmgPct: 0.6, maxHearts: -1.5 } },
    { id: 'exec', name: 'Executioner', desc: '+25% damage and +10% critical chance.', icon: 'k_fist', rarity: 1, mods: { dmgPct: 0.25, crit: 0.1 } },
    { id: 'vamp', name: 'Bloodthirst', desc: 'Kills have a 20% chance to heal you.', icon: 'k_heart', rarity: 1, mods: { vamp: 0.2 } },
    { id: 'storm', name: 'Storm Caller', desc: '+30% damage and 30% faster swings.', icon: 'k_burst', rarity: 2, mods: { dmgPct: 0.3, swingSpeed: 0.3 } },
    { id: 'siphon', name: 'Soul Siphon', desc: 'Kills heal often, and healing is stronger.', icon: 'k_moon', rarity: 2, mods: { vamp: 0.35, healPower: 0.3 } },
    // defence
    { id: 'hearty', name: 'Hearty', desc: '+2 hearts.', icon: 'k_heart', rarity: 0, mods: { maxHearts: 2 } },
    { id: 'skin', name: 'Thick Skin', desc: 'Take half a heart less from every hit.', icon: 'k_shield', rarity: 0, mods: { armor: 0.5 } },
    { id: 'heal', name: 'Healing Hands', desc: 'Food and potions heal 50% more.', icon: 'k_drop', rarity: 0, mods: { healPower: 0.5 } },
    { id: 'nimble', name: 'Nimble', desc: '+15% chance to dodge a hit.', icon: 'k_boot', rarity: 1, mods: { dodge: 0.15 } },
    { id: 'regen', name: 'Regeneration', desc: 'Heal half a heart every 8 seconds.', icon: 'k_lung', rarity: 1, special: 'regen' },
    { id: 'aegis', name: 'Aegis', desc: 'Untouchable for 4 seconds when each wave begins.', icon: 'k_shield', rarity: 1, special: 'aegis' },
    { id: 'titan', name: 'Titan', desc: '+3 hearts and more armor, but slower.', icon: 'k_crown', rarity: 2, mods: { maxHearts: 3, armor: 0.5, moveSpeed: -0.1 } },
    { id: 'phoenix', name: 'Phoenix Feather', desc: 'Once, when you fall, rise again at half health.', icon: 'k_flame', rarity: 2, special: 'phoenix' },
    // utility
    { id: 'boots', name: 'Fleet Foot', desc: '+20% movement speed.', icon: 'k_boot', rarity: 0, mods: { moveSpeed: 0.2 } },
    { id: 'stamina', name: 'Deep Breaths', desc: '+50 energy and swings cost less.', icon: 'k_lung', rarity: 0, mods: { maxEnergy: 50, energyRegen: 0.5, swingCost: -0.3 } },
    { id: 'magnet', name: 'Magnetism', desc: 'Loot flies to you from far away.', icon: 'k_magnet', rarity: 0, mods: { magnet: 0.8 } },
    { id: 'study', name: 'Quick Study', desc: '+50% experience from this run.', icon: 'k_book', rarity: 0, mods: { xp: 0.5 } },
    { id: 'brew', name: 'Brew Master', desc: 'Buffs last 50% longer.', icon: 'k_flask', rarity: 0, mods: { buffTime: 0.5 } },
    { id: 'lucky', name: 'Rift Luck', desc: '+25% double-drops and better chests.', icon: 'k_clover', rarity: 1, mods: { luck: 0.25, chestLoot: 0.3 } },
    { id: 'greed', name: 'Greed', desc: '+40% coins and shards when the run ends well.', icon: 'k_coin', rarity: 1, special: 'greed' },
    { id: 'bounty', name: 'Bounty Hunter', desc: 'Every wave you clear pays out twice.', icon: 'k_flag', rarity: 1, special: 'bounty' },
];
export const BOON_BY_ID: Record<string, Boon> = Object.fromEntries(BOONS.map((b) => [b.id, b]));

/** Three different boons to choose from, never one you already hold; later waves lean rarer. */
export function offerBoons (rng: Rng, held: string[], wave: number, count = 3): string[] {
    const pool = BOONS.filter((b) => !held.includes(b.id));
    const out: string[] = [];
    const rare = Math.min(0.5, 0.12 + wave * 0.05);
    while (out.length < count && pool.length) {
        const r = rng.next();
        const rarity = r < rare * 0.35 ? 2 : r < rare ? 1 : 0;
        let cands = pool.filter((b) => b.rarity === rarity);
        if (!cands.length) cands = pool;
        const b = rng.pick(cands);
        out.push(b.id);
        pool.splice(pool.indexOf(b), 1);
    }
    return out;
}

// ── waves ──────────────────────────────────────────────────────────────────
interface WaveMob { kind: MobKind; elite: boolean; guardian?: boolean; at: number }

const THEMES = ['mixed', 'swarm', 'ranged', 'heavy'] as const;

/** What arrives in a wave: count and kinds scale with the tier, the wave and the party size. */
export function waveSpec (tier: number, wave: number, party: number, rng: Rng, omens: readonly string[] = []): WaveMob[] {
    const t = RIFT_TIERS[tier];
    const last = isBossWave(t, wave);
    const base = Math.min(34, Math.round((4 + wave * 2.1 + tier * 2.2) * (0.6 + 0.4 * party) * (last ? 0.55 : 1)));
    const size = omens.includes('swarm') ? Math.min(46, Math.round(base * 1.34)) : base;
    const theme = last ? 'mixed' : THEMES[(tier + wave) % THEMES.length];
    const all = WILD_KINDS.filter((k) => MOBS[k].tier <= t.cap);
    const ai = (k: MobKind) => MOBS[k].ai;
    let pool = all.filter((k) => (theme === 'swarm' ? ai(k) === 'swarm' || ai(k) === 'flit' || ai(k) === 'hop'
        : theme === 'ranged' ? ai(k) === 'ranged'
        : theme === 'heavy' ? ai(k) === 'brute' || ai(k) === 'charge' || (ai(k) === 'chase' && MOBS[k].tier >= Math.max(1, t.cap - 1))
        : true));
    if (!pool.length) pool = all;
    const weights = pool.map((k) => 1 + Math.max(0, 3 - (t.cap - MOBS[k].tier)) * 0.6);
    const sum = weights.reduce((a, b) => a + b, 0);
    const pick = () => { let r = rng.next() * sum; for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r <= 0) return pool[i]; } return pool[0]; };
    const span = Math.min(8, 2 + size * 0.4);
    const eliteBase = Math.min(0.6, t.elite + wave * 0.02);
    const eliteP = omens.includes('champs') ? Math.min(0.9, eliteBase * 3) : eliteBase;
    const out: WaveMob[] = [];
    for (let i = 0; i < size; i++) {
        const kind = pick();
        out.push({ kind, elite: MOBS[kind].tier >= 1 && rng.chance(eliteP), at: 1 + rng.next() * span });
    }
    if (last) {
        const g = t.endless ? ABYSS_GUARDIANS[(wave / ABYSS_BOSS_EVERY - 1) % ABYSS_GUARDIANS.length] : { guardian: t.guardian, escorts: t.escorts };
        out.push({ kind: g.guardian, elite: true, guardian: true, at: 1 });
        if (g.escorts) for (let i = 0; i < 2 + party; i++) out.push({ kind: g.escorts, elite: false, at: 3 + i * 1.5 });
    }
    return out.sort((a, b) => a.at - b.at);
}

/** Rewards for the end of a run (before the Greed boon): shards and coins scale with the party. */
export function riftReward (tier: number, wave: number, rng: Rng, partySize: number) {
    const t = RIFT_TIERS[tier];
    if (t.endless) {
        // the deeper you got, the more it pays, and a little faster than linearly
        const w = Math.max(0, wave);
        const shards = Math.round(Math.pow(w, 1.2) * 1.7 * (0.85 + 0.075 * partySize));
        const loot: [ItemId, number][] = [];
        for (let i = 1; i <= Math.floor(w / ABYSS_BOSS_EVERY); i++) { if (rng.chance(0.3)) loot.push(['rift_core', 1]); if (rng.chance(0.5)) loot.push(['crystal', rng.int(1, 3)]); }
        return { shards, coins: Math.round(w * 38 * (0.8 + 0.1 * partySize)), xp: Math.round(w * 55), loot };
    }
    const cleared = Math.min(1, wave / t.waves);
    const shards = Math.round(rng.int(t.shards[0], t.shards[1]) * cleared);
    const loot: [ItemId, number][] = [];
    if (cleared >= 1) for (const [item, chance, lo, hi] of t.loot) if (rng.chance(chance)) loot.push([item, rng.int(lo, hi)]);
    return { shards, coins: Math.round(t.coins * cleared * (0.8 + 0.1 * partySize)), xp: Math.round(t.xp * cleared), loot };
}
