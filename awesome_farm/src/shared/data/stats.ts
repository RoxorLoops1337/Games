// Every number that skills, gear and buffs can modify. One ledger, one formula (sim/stats.ts):
// a player's final stat = sum of (rank × value) over skills + equipped gear + active buffs.

export const STAT_KEYS = [
    // survival
    'maxHearts', 'maxEnergy', 'energyRegen', 'armor', 'healPower', 'foodPower', 'buffTime',
    // movement / hands
    'moveSpeed', 'swingSpeed', 'swingCost', 'reach', 'magnet', 'carry',
    // combat
    'dmg', 'dmgPct', 'crit', 'bossDmg', 'nightDmg', 'vamp', 'dodge',
    // gathering
    'wood', 'stone', 'ore', 'plant', 'luck', 'regrow', 'chestLoot', 'nodeCrit',
    // farming
    'grow', 'cropYield', 'seedChance',
    // economy
    'xp', 'sell', 'landCost', 'buildCost', 'craftSave',
    // industry
    'smelt', 'fuelSave', 'machineSpeed', 'powerSave', 'beltSpeed', 'drillYield',
    // taming
    'catch', 'creatureSlots', 'work', 'creatureXp', 'crewXp', 'companionDmg', 'breed',
    // fishing
    'fishSpeed', 'fishLuck',
] as const;

export type StatKey = typeof STAT_KEYS[number];
export type Mods = Partial<Record<StatKey, number>>;

/** How a stat is shown: `pct` multiplies by 100 and adds %, `flat` is a plain number, `hearts` adds ♥. */
export const STAT_INFO: Record<StatKey, { label: string; fmt: 'pct' | 'flat' | 'hearts' | 'secs' }> = {
    maxHearts: { label: 'Max hearts', fmt: 'hearts' },
    maxEnergy: { label: 'Max energy', fmt: 'flat' },
    energyRegen: { label: 'Energy regen / s', fmt: 'flat' },
    armor: { label: 'Armor', fmt: 'hearts' },
    healPower: { label: 'Healing power', fmt: 'pct' },
    foodPower: { label: 'Food power', fmt: 'pct' },
    buffTime: { label: 'Buff duration', fmt: 'pct' },
    moveSpeed: { label: 'Move speed', fmt: 'pct' },
    swingSpeed: { label: 'Swing speed', fmt: 'pct' },
    swingCost: { label: 'Swing energy cost', fmt: 'pct' },
    reach: { label: 'Reach', fmt: 'pct' },
    magnet: { label: 'Pickup range', fmt: 'pct' },
    carry: { label: 'Carry capacity', fmt: 'flat' },
    dmg: { label: 'Damage', fmt: 'flat' },
    dmgPct: { label: 'Damage', fmt: 'pct' },
    crit: { label: 'Critical chance', fmt: 'pct' },
    bossDmg: { label: 'Boss damage', fmt: 'pct' },
    nightDmg: { label: 'Night damage', fmt: 'pct' },
    vamp: { label: 'Heal-on-kill chance', fmt: 'pct' },
    dodge: { label: 'Dodge chance', fmt: 'pct' },
    wood: { label: 'Wood per tree', fmt: 'flat' },
    stone: { label: 'Stone per rock', fmt: 'flat' },
    ore: { label: 'Ore per vein', fmt: 'flat' },
    plant: { label: 'Plants gathered', fmt: 'flat' },
    luck: { label: 'Double-drop chance', fmt: 'pct' },
    regrow: { label: 'Resource regrowth', fmt: 'pct' },
    chestLoot: { label: 'Chest loot', fmt: 'pct' },
    nodeCrit: { label: 'Double-hit chance', fmt: 'pct' },
    grow: { label: 'Crop growth speed', fmt: 'pct' },
    cropYield: { label: 'Crop yield', fmt: 'flat' },
    seedChance: { label: 'Seed chance', fmt: 'pct' },
    xp: { label: 'XP gain', fmt: 'pct' },
    sell: { label: 'Selling price', fmt: 'pct' },
    landCost: { label: 'Land price', fmt: 'pct' },
    buildCost: { label: 'Building cost', fmt: 'pct' },
    craftSave: { label: 'Free-craft chance', fmt: 'pct' },
    smelt: { label: 'Furnace speed', fmt: 'pct' },
    fuelSave: { label: 'Fuel savings', fmt: 'pct' },
    machineSpeed: { label: 'Machine speed', fmt: 'pct' },
    powerSave: { label: 'Power savings', fmt: 'pct' },
    beltSpeed: { label: 'Belt speed', fmt: 'pct' },
    drillYield: { label: 'Drill output', fmt: 'pct' },
    catch: { label: 'Catch chance', fmt: 'pct' },
    creatureSlots: { label: 'Creature slots', fmt: 'flat' },
    work: { label: 'Creature work speed', fmt: 'pct' },
    creatureXp: { label: 'Creature XP', fmt: 'pct' },
    crewXp: { label: 'XP from working creatures', fmt: 'pct' },
    companionDmg: { label: 'Companion damage', fmt: 'pct' },
    breed: { label: 'Breeding speed', fmt: 'pct' },
    fishSpeed: { label: 'Bite speed', fmt: 'pct' },
    fishLuck: { label: 'Fishing luck', fmt: 'pct' },
};

/** Stats where more is worse (shown with a minus when a skill lowers them). */
const COST_STATS = new Set<StatKey>(['swingCost', 'landCost', 'buildCost']);

/** "+12%" / "-8%" / "+0.5 ♥" for a stat change, as the player should read it. */
function fmtStat (key: StatKey, v: number): string {
    const info = STAT_INFO[key];
    const sign = v > 0 ? '+' : v < 0 ? '-' : '';
    const abs = Math.abs(v);
    const n = (x: number) => (Number.isInteger(x) ? `${x}` : x.toFixed(2).replace(/0+$/, '').replace(/\.$/, ''));
    switch (info.fmt) {
        case 'pct': return `${sign}${n(Math.round(abs * 1000) / 10)}%`;
        case 'hearts': return `${sign}${n(abs)} ♥`;
        case 'secs': return `${sign}${n(abs)}s`;
        default: return `${sign}${n(abs)}`;
    }
}

/** A skill/gear line like "+12% Crop growth speed" (cost stats are stored negative = cheaper). */
export function modLine (key: StatKey, v: number): string {
    const good = COST_STATS.has(key) ? v < 0 : v > 0;
    return `${fmtStat(key, v)} ${STAT_INFO[key].label}${good ? '' : ' ⚠'}`;
}

// ── buffs ──────────────────────────────────────────────────────────────────
export type BuffId = 'sated' | 'swift' | 'mighty' | 'ironhide' | 'mending' | 'lucky' | 'focus' | 'harvest' | 'featherfoot' | 'vigor' | 'nightowl'
    | 'studious' | 'insight' | 'kinship'   // (the XP brews of the Alchemy Table: data/items.ts)
    | 'scholarday'    // (Scholar's Day: everybody learns twice as much until dawn: sim/scholar.ts)
    | 'perfect'       // (a Perfect dash: every hit is a critical one, and the next swing at a monster spends it: sim/sim.ts + sim/combat.ts)
    | 'hearth'      // (Hearthside: earned at a fire at dusk with company, lasts until dawn: sim/hearth.ts)
    | 'devgod' | 'devspeed';       // (the developer menu's: sim/dev.ts hands them out and takes them back; they never reach a save)

export const BUFFS: Record<BuffId, { name: string; desc: string; icon: string; mods: Mods; good: boolean }> = {
    sated:    { name: 'Well fed',   desc: 'A hearty meal keeps you going.', icon: 'i_bread',        good: true, mods: { energyRegen: 0.6, maxEnergy: 15 } },
    swift:    { name: 'Swift',      desc: 'Light on your feet.',            icon: 'i_potion_swift', good: true, mods: { moveSpeed: 0.25 } },
    mighty:   { name: 'Mighty',     desc: 'Hit harder.',                    icon: 'i_stew',         good: true, mods: { dmgPct: 0.25 } },
    ironhide: { name: 'Ironhide',   desc: 'Tough as old boots.',            icon: 'i_pie',          good: true, mods: { armor: 0.5 } },
    mending:  { name: 'Mending',    desc: 'Wounds close on their own.',     icon: 'i_potion_heal',  good: true, mods: { vamp: 0.2, healPower: 0.2 } },
    lucky:    { name: 'Lucky',      desc: 'Fortune smiles.',                icon: 'i_charm_lucky',  good: true, mods: { luck: 0.12 } },
    focus:    { name: 'Focused',    desc: 'Every swing counts.',            icon: 'i_potion_energy', good: true, mods: { swingSpeed: 0.2, nodeCrit: 0.1 } },
    featherfoot: { name: 'Featherfoot', desc: 'Quick hands and quicker feet.', icon: 'i_cornbread', good: true, mods: { moveSpeed: 0.15, swingSpeed: 0.1 } },
    vigor:    { name: 'Vigorous',   desc: 'Extra hearts, and they mend faster.', icon: 'i_potion_vigor', good: true, mods: { maxHearts: 1.5, healPower: 0.1 } },
    nightowl: { name: 'Night Owl',  desc: 'Sharp eyes and sharper strikes after dark.', icon: 'i_potion_night', good: true, mods: { nightDmg: 0.2, crit: 0.08, magnet: 0.3 } },
    studious: { name: 'Studious',   desc: 'Everything you do teaches you more.', icon: 'i_potion_study', good: true, mods: { xp: 0.5 } },
    insight:  { name: 'Insight',    desc: 'The world is an open book: XP comes twice as fast.', icon: 'i_potion_insight', good: true, mods: { xp: 1 } },
    kinship:  { name: 'Kinship',    desc: 'Your creatures learn faster, and you learn from them.', icon: 'i_potion_kin', good: true, mods: { creatureXp: 0.5, work: 0.15, crewXp: 0.25 } },
    scholarday: { name: "Scholar's Day", desc: 'Everybody learns twice as much today, until dawn.', icon: 'k_book', good: true, mods: { xp: 1 } },
    devgod:   { name: 'God mode',  desc: 'Developer menu: nothing can hurt you.', icon: 'i_potion_heal',  good: true, mods: { armor: 99 } },
    devspeed: { name: 'Dev speed', desc: 'Developer menu: twice as fast on your feet.', icon: 'i_potion_swift', good: true, mods: { moveSpeed: 1, swingSpeed: 0.5 } },
    perfect:  { name: 'Perfect',    desc: 'Your next hit on a monster is a critical one.', icon: 'k_star', good: true, mods: { crit: 1 } },
    harvest:  { name: 'Bountiful',  desc: 'The land gives more.',           icon: 'i_carrot',       good: true, mods: { wood: 1, stone: 1, ore: 1, plant: 1 } },
    hearth:   { name: 'Hearthside', desc: 'Warm company: hearts and energy come back faster, and +15% XP until dawn.', icon: 'i_soup', good: true, mods: { energyRegen: 0.8, healPower: 0.25, xp: 0.15 } },
};
