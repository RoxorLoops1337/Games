// Gems: found deep in the mines, socketed into the weapon (two sockets: a spell on every hit) and the armour (head and body: a steady bonus),
// and merged three into one of the next cut. The kinds, what each does in a weapon and in armour, and how a cut scales it. Pure.

import type { Mods } from './stats';

export type GemKind = 'ruby' | 'sapphire' | 'emerald' | 'topaz' | 'amethyst' | 'diamond';
export const GEM_KINDS: GemKind[] = ['ruby', 'sapphire', 'emerald', 'topaz', 'amethyst', 'diamond'];
export type GemTier = 1 | 2 | 3;
export const GEM_TIERS: GemTier[] = [1, 2, 3];
export const CUT_NAMES: Record<GemTier, string> = { 1: 'Rough', 2: 'Cut', 3: 'Flawless' };

/** The four sockets: two in the weapon, one in the headgear, one in the body armour. */
export const GEM_SOCKETS = ['w1', 'w2', 'head', 'body'] as const;
export type GemSocket = typeof GEM_SOCKETS[number];
export const SOCKET_NAMES: Record<GemSocket, string> = { w1: 'Weapon', w2: 'Weapon', head: 'Head', body: 'Body' };
export const isWeaponSocket = (s: GemSocket) => s === 'w1' || s === 'w2';
export const isGemSocket = (s: unknown): s is GemSocket => typeof s === 'string' && (GEM_SOCKETS as readonly string[]).includes(s);

export const gemId = (kind: GemKind, tier: GemTier) => `gem_${kind}_${tier}` as const;
export const GEM_INFO: Record<GemKind, { name: string; color: number; light: number; weapon: string; armor: string; blurb: string }> = {
    ruby:     { name: 'Ruby',     color: 0xe85d62, light: 0xffb0a8, weapon: 'sets enemies on fire',                armor: 'more damage',        blurb: 'Fire.' },
    sapphire: { name: 'Sapphire', color: 0x4a8fe0, light: 0xa8d8ff, weapon: 'slows what it hits',                  armor: 'more armor',         blurb: 'Frost.' },
    emerald:  { name: 'Emerald',  color: 0x5cb04f, light: 0xb8f090, weapon: 'poisons what it hits, for a long time', armor: 'stronger healing',  blurb: 'Venom.' },
    topaz:    { name: 'Topaz',    color: 0xffd966, light: 0xfff0a0, weapon: 'lightning jumps to a nearby enemy',    armor: 'faster feet',        blurb: 'Storm.' },
    amethyst: { name: 'Amethyst', color: 0x9d6fdb, light: 0xe0c8ff, weapon: 'sometimes heals you on a hit',         armor: 'heal on kills',      blurb: 'Blood.' },
    diamond:  { name: 'Diamond',  color: 0xcdf4ee, light: 0xffffff, weapon: 'more critical hits',                   armor: 'more luck',          blurb: 'Precision.' },
};

/** What a socketed gem does, by cut (index 0 is a rough one). */
export const GEM_POWER = {
    burn: [0.35, 0.55, 0.85],         // × the hit's damage, every second, for `burnSecs`
    burnSecs: 3,
    slow: [0.7, 0.55, 0.4],           // the speed it leaves them, for `slowSecs`
    slowSecs: 2.5,
    poison: [0.15, 0.25, 0.4],        // × the hit's damage, every second, for `poisonSecs`
    poisonSecs: 6,
    chain: [0.2, 0.3, 0.42],          // the chance a hit jumps to another enemy…
    chainShare: 0.7,                  // … for this share of the damage…
    chainRange: 56,                   // … within this many px
    heal: [0.08, 0.12, 0.18],         // the chance a hit heals…
    healHearts: 0.5,                  // … this much
    crit: [0.03, 0.05, 0.08],         // a diamond in the weapon: critical chance
} as const;

/** What a gem in armour gives, by cut. */
export const GEM_ARMOR: Record<GemKind, Mods[]> = {
    ruby:     [{ dmgPct: 0.02 }, { dmgPct: 0.035 }, { dmgPct: 0.05 }],
    sapphire: [{ armor: 0.15 }, { armor: 0.25 }, { armor: 0.4 }],
    emerald:  [{ healPower: 0.06 }, { healPower: 0.1 }, { healPower: 0.15 }],
    topaz:    [{ moveSpeed: 0.025 }, { moveSpeed: 0.04 }, { moveSpeed: 0.06 }],
    amethyst: [{ vamp: 0.01 }, { vamp: 0.02 }, { vamp: 0.035 }],
    diamond:  [{ luck: 0.015 }, { luck: 0.025 }, { luck: 0.04 }],
};

/** "gem_ruby_2" -> { kind: 'ruby', tier: 2 }; anything else -> null. */
export function parseGem (id: string): { kind: GemKind; tier: GemTier } | null {
    const m = /^gem_([a-z]+)_([123])$/.exec(id);
    if (!m || !(GEM_KINDS as string[]).includes(m[1])) return null;
    return { kind: m[1] as GemKind, tier: Number(m[2]) as GemTier };
}

/** The passive bonuses of what is socketed (armour gems, and a diamond in the weapon). */
export function gemMods (sockets: Partial<Record<GemSocket, string>> | undefined): Mods {
    const m: Mods = {};
    if (!sockets) return m;
    const add = (x: Mods) => { for (const k of Object.keys(x) as (keyof Mods)[]) m[k] = (m[k] ?? 0) + (x[k] ?? 0); };
    for (const s of GEM_SOCKETS) {
        const g = parseGem(sockets[s] ?? '');
        if (!g) continue;
        if (isWeaponSocket(s)) { if (g.kind === 'diamond') add({ crit: GEM_POWER.crit[g.tier - 1] }); }
        else add(GEM_ARMOR[g.kind][g.tier - 1]);
    }
    return m;
}

/** Merge three of one cut into one of the next. (Flawless gems are as good as they get.) */
export const MERGE_COST = 3;
export const mergeTarget = (id: string): string | null => { const g = parseGem(id); return g && g.tier < 3 ? gemId(g.kind, (g.tier + 1) as GemTier) : null; };
