// The item catalogue. Texture key for any item is `i_<id>` (art/icons.ts generates them).

import type { BuffId, Mods } from './stats';

export type Rarity = 0 | 1 | 2 | 3 | 4;
export const RARITY_NAMES = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'] as const;

export type GearSlot = 'tool' | 'weapon' | 'head' | 'body' | 'charm' | 'bag';
export const GEAR_SLOTS: GearSlot[] = ['tool', 'weapon', 'head', 'body', 'charm', 'bag'];
export const SLOT_NAMES: Record<GearSlot, string> = { tool: 'Pick', weapon: 'Weapon', head: 'Head', body: 'Body', charm: 'Charm', bag: 'Pack' };
export type WeaponType = 'fist' | 'club' | 'dagger' | 'sword' | 'spear' | 'hammer' | 'bow' | 'staff';

export interface GearDef {
    slot: GearSlot;
    tier: number;             // 0 = flint … 4 = void; gates node minTier and recipes
    power?: number;           // pick: damage to resource nodes
    dmg?: number;             // weapon: damage to creatures (in hp; a slime has 2)
    wtype?: WeaponType;
    cd?: number;              // weapon swing-time multiplier
    reach?: number;           // weapon reach in px
    mods?: Mods;
}

type ItemKind = 'material' | 'food' | 'seed' | 'potion' | 'gear' | 'misc';

interface ItemDef {
    name: string;
    kind: ItemKind;
    sell: number;
    rarity: Rarity;
    desc: string;
    food?: number;            // energy restored
    heal?: number;            // hearts restored
    buff?: { id: BuffId; secs: number };
    gear?: GearDef;
    /** Click it in the backpack to open it: a loot crate (the tier) or a message in a bottle. */
    open?: 'wood' | 'silver' | 'gold' | 'mythic' | 'bottle';
    /** Drink it for XP at once: this share of what the farmer's current level needs (XP boosts count too). */
    xpPct?: number;
}

const it = (name: string, kind: ItemKind, sell: number, desc: string, extra: Partial<ItemDef> = {}): ItemDef =>
    ({ name, kind, sell, desc, rarity: 0, ...extra });

export const ITEMS = {
    // ── raw materials ──
    wood:     it('Wood',        'material', 1, 'Sturdy logs. The start of every farm.'),
    stone:    it('Stone',       'material', 1, 'Grey and heavy. Builds almost everything.'),
    coal:     it('Coal',        'material', 2, 'Burns hot and long. Fuel for furnaces.'),
    iron:     it('Iron Ore',    'material', 3, 'Rusty rock with a metal heart. Smelt it in a furnace.', { rarity: 1 }),
    copper:   it('Copper Ore',  'material', 3, 'Orange-green ore. Makes wire and warm-coloured trinkets.', { rarity: 1 }),
    goldore:  it('Gold Ore',    'material', 4, 'Flecked with gold. Smelts into shining bars.', { rarity: 1 }),
    sand:     it('Sand',        'material', 1, 'Fine and warm. Melts into glass.'),
    clay:     it('Clay',        'material', 1, 'Cool and sticky. Bakes into bricks.'),
    fiber:    it('Plant Fiber', 'material', 1, 'Stringy reeds. Twist into rope.'),
    crystal:  it('Crystal Shard', 'material', 10, 'Hums faintly when you hold it. Needs a gold pick to mine.', { rarity: 3 }),
    peat:     it('Peat',        'material', 1, 'Dark bog turf. Burns slow and smoky.'),
    herb:     it('Swamp Herb',  'material', 2, 'Bitter leaves. Alchemists love them.'),
    cotton:   it('Cotton',      'material', 2, 'Soft white bolls, ready for the loom.'),
    // ── processed materials ──
    plank:    it('Plank',       'material', 2, 'Smooth sawn wood.'),
    brick:    it('Brick',       'material', 3, 'Fired clay. Solid walls and fine furnaces.'),
    glass:    it('Glass',       'material', 3, 'Clear and fragile. Lanterns and lenses.'),
    ironbar:  it('Iron Bar',    'material', 7, 'The backbone of a growing farm.', { rarity: 1 }),
    copperbar: it('Copper Bar', 'material', 7, 'Conducts power and looks lovely doing it.', { rarity: 1 }),
    goldbar:  it('Gold Bar',    'material', 14, 'Soft, bright, valuable.', { rarity: 2 }),
    steel:    it('Steel',       'material', 18, 'Iron tempered with coal. Hard and keen.', { rarity: 2 }),
    cloth:    it('Cloth',       'material', 6, 'Woven cotton. Clothes, bags and banners.'),
    rope:     it('Rope',        'material', 3, 'Twisted fiber.'),
    gear:     it('Gear',        'material', 10, 'Toothed wheel. Every machine wants a few.', { rarity: 1 }),
    wire:     it('Copper Wire', 'material', 8, 'Thin and springy.', { rarity: 1 }),
    circuit:  it('Circuit',     'material', 30, 'A tiny brain for machines.', { rarity: 2 }),
    flour:    it('Flour',       'material', 4, 'Ground wheat.'),
    motor:    it('Motor',       'material', 40, 'Spins forever if you let it. Drills and generators need them.', { rarity: 2 }),
    core:     it('Power Core',  'material', 180, 'A heart of crystal and copper. The most advanced thing you can build.', { rarity: 3 }),
    // ── food & crops ──
    berry:    it('Berry',       'food', 1, 'Sweet and juicy.', { food: 6 }),
    mushroom: it('Mushroom',    'food', 3, 'Earthy and filling.', { food: 14 }),
    wheat:    it('Wheat',       'material', 2, 'Golden stalks. Mill it into flour.'),
    carrot:   it('Carrot',      'food', 3, 'Crunchy. Good raw, better in stew.', { food: 10 }),
    pumpkin:  it('Pumpkin',     'food', 6, 'Big and orange.', { food: 22 }),
    bread:    it('Bread',       'food', 7, 'Warm from the kitchen. Keeps you energised.', { food: 30, buff: { id: 'sated', secs: 120 }, rarity: 1 }),
    stew:     it('Hearty Stew', 'food', 14, 'Carrots, mushrooms and pride.', { food: 45, buff: { id: 'mighty', secs: 150 }, rarity: 1 }),
    pie:      it('Pumpkin Pie', 'food', 16, 'Sweet, sturdy, delicious.', { food: 55, buff: { id: 'ironhide', secs: 150 }, rarity: 2 }),
    // ── seeds ──
    seed_wheat:   it('Wheat Seeds',   'seed', 1, 'Plant in a garden bed. Fast and cheap.'),
    seed_carrot:  it('Carrot Seeds',  'seed', 1, 'Plant in a garden bed.'),
    seed_pumpkin: it('Pumpkin Seeds', 'seed', 2, 'Plant in a garden bed. Slow but rewarding.'),
    seed_cotton:  it('Cotton Seeds',  'seed', 2, 'Plant in a garden bed. Cotton for the loom.'),
    // ── potions ──
    potion_heal:   it('Healing Potion',  'potion', 12, 'Restores two hearts.', { heal: 2, rarity: 1 }),
    potion_energy: it('Energy Tonic',    'potion', 10, 'Restores a big burst of energy.', { food: 70, rarity: 1 }),
    potion_swift:  it('Swift Brew',      'potion', 14, 'Quick feet for a minute and a half.', { buff: { id: 'swift', secs: 90 }, rarity: 1 }),
    // ── picks (tool slot) ──
    pick_flint:   it('Flint Pick',   'gear', 2,  'Chipped flint on a stick. It works.', { gear: { slot: 'tool', tier: 0, power: 1 } }),
    pick_iron:    it('Iron Pick',    'gear', 30, 'A proper pick. Bites into copper and iron.', { rarity: 1, gear: { slot: 'tool', tier: 1, power: 2 } }),
    pick_gold:    it('Golden Pick',  'gear', 80, 'Gleaming and fast. Mines crystals.', { rarity: 2, gear: { slot: 'tool', tier: 2, power: 3, mods: { swingSpeed: 0.1 } } }),
    pick_crystal: it('Crystal Pick', 'gear', 220, 'Sings as it cuts.', { rarity: 3, gear: { slot: 'tool', tier: 3, power: 4, mods: { swingSpeed: 0.15, ore: 1 } } }),
    // ── weapons ──
    club:         it('Wooden Club',  'gear', 2,  'Better than your fists.', { gear: { slot: 'weapon', tier: 0, dmg: 1.2, wtype: 'club', cd: 1, reach: 20 } }),
    sword_iron:   it('Iron Sword',   'gear', 40, 'Quick and reliable. Swings in a wide arc.', { rarity: 1, gear: { slot: 'weapon', tier: 1, dmg: 2, wtype: 'sword', cd: 0.85, reach: 24 } }),
    sword_steel:  it('Steel Sword',  'gear', 110, 'Keen edge, fine balance.', { rarity: 2, gear: { slot: 'weapon', tier: 2, dmg: 3, wtype: 'sword', cd: 0.8, reach: 26 } }),
    spear_iron:   it('Iron Spear',   'gear', 45, 'Long reach, hits everything in a line.', { rarity: 1, gear: { slot: 'weapon', tier: 1, dmg: 2.2, wtype: 'spear', cd: 1.05, reach: 38 } }),
    hammer_iron:  it('Iron Hammer',  'gear', 55, 'Slow and heavy. Smashes everything around you.', { rarity: 1, gear: { slot: 'weapon', tier: 1, dmg: 2.8, wtype: 'hammer', cd: 1.5, reach: 24 } }),
    bow_wood:     it('Hunting Bow',  'gear', 35, 'Shoot first. Costs a little energy per shot.', { rarity: 1, gear: { slot: 'weapon', tier: 1, dmg: 1.8, wtype: 'bow', cd: 1.1, reach: 96 } }),
    staff_crystal: it('Crystal Staff', 'gear', 260, 'A bolt of light that bursts on impact.', { rarity: 3, gear: { slot: 'weapon', tier: 3, dmg: 3.4, wtype: 'staff', cd: 1.2, reach: 84 } }),
    // ── armor ──
    cap_cloth:    it('Cloth Cap',    'gear', 14, 'A soft, snug cap.', { gear: { slot: 'head', tier: 0, mods: { armor: 0.25 } } }),
    tunic_cloth:  it('Cloth Tunic',  'gear', 24, 'Comfortable and a little bit tough.', { gear: { slot: 'body', tier: 0, mods: { armor: 0.5, maxEnergy: 10 } } }),
    helm_iron:    it('Iron Helm',    'gear', 38, 'Dented already. Good.', { rarity: 1, gear: { slot: 'head', tier: 1, mods: { armor: 0.5 } } }),
    mail_iron:    it('Iron Mail',    'gear', 70, 'Heavy rings of iron.', { rarity: 1, gear: { slot: 'body', tier: 1, mods: { armor: 1, moveSpeed: -0.04 } } }),
    helm_steel:   it('Steel Helm',   'gear', 90, 'Polished to a mirror shine.', { rarity: 2, gear: { slot: 'head', tier: 2, mods: { armor: 0.75, maxHearts: 0.5 } } }),
    plate_steel:  it('Steel Plate',  'gear', 160, 'A proper suit of armor.', { rarity: 2, gear: { slot: 'body', tier: 2, mods: { armor: 1.5, maxHearts: 0.5, moveSpeed: -0.05 } } }),
    // ── charms ──
    charm_lucky:  it('Lucky Charm',  'gear', 60, 'Warm in your pocket.', { rarity: 2, gear: { slot: 'charm', tier: 1, mods: { luck: 0.08, chestLoot: 0.2 } } }),
    charm_swift:  it('Swift Charm',  'gear', 60, 'A feather that never falls.', { rarity: 2, gear: { slot: 'charm', tier: 1, mods: { moveSpeed: 0.1 } } }),
    charm_vital:  it('Vital Charm',  'gear', 90, 'A tiny beating heart of amber.', { rarity: 2, gear: { slot: 'charm', tier: 1, mods: { maxHearts: 1 } } }),
    // ── monster drops ──
    slimegel:    it('Slime Gel',      'material', 2, 'Wobbly and faintly warm. Alchemists love it.'),
    bone:        it('Bone',           'material', 3, 'Clean and strong. Knives, arrows and charms.'),
    batwing:     it('Bat Wing',       'material', 4, 'Leathery and light.', { rarity: 1 }),
    hide:        it('Tough Hide',     'material', 5, 'Thick boar leather. Armor starts here.', { rarity: 1 }),
    ectoplasm:   it('Ectoplasm',      'material', 7, 'Cold, glowing slime from something that is not quite alive.', { rarity: 1 }),
    scarabshell: it('Scarab Shell',   'material', 6, 'Gleaming blue-green wing cases.', { rarity: 1 }),
    rockheart:   it('Rock Heart',     'material', 16, 'A warm red core from deep inside a rockling.', { rarity: 2 }),
    frostshard:  it('Frost Shard',    'material', 14, 'Never melts. Hurts to hold.', { rarity: 2 }),
    toadskin:    it('Toad Skin',      'material', 7, 'Slick and waterproof.', { rarity: 1 }),
    shroud:      it('Wraith Shroud',  'material', 18, 'Cloth woven from the night itself.', { rarity: 2 }),
    // ── boss sigils (summon at an altar) and trophies (proof you won) ──
    sigil_slime: it('Slime Sigil',    'misc', 40, 'A wobbling seal. Bring it to an altar to call the Slime King.', { rarity: 2 }),
    sigil_stone: it('Stone Sigil',    'misc', 80, 'Heavy as a gravestone. Calls the Stone Colossus.', { rarity: 2 }),
    sigil_bog:   it('Murk Sigil',     'misc', 80, 'Smells of swamp. Calls the Bog Witch.', { rarity: 2 }),
    sigil_dune:  it('Dune Sigil',     'misc', 120, 'Hot to the touch. Calls the Dune Pharaoh.', { rarity: 3 }),
    sigil_frost: it('Frost Sigil',    'misc', 120, 'Your fingers stick to it. Calls the Frost Giant.', { rarity: 3 }),
    sigil_heart: it('Heart Sigil',    'misc', 400, 'It beats. Wakes the Old Heart — only at the centre of the world.', { rarity: 4 }),
    trophy_slime: it('Royal Gel',     'misc', 150, 'Proof you beat the Slime King.', { rarity: 3 }),
    trophy_stone: it('Colossus Core', 'misc', 250, 'Proof you beat the Stone Colossus.', { rarity: 3 }),
    trophy_bog:   it("Witch's Eye",   'misc', 250, 'Proof you beat the Bog Witch. It still watches you.', { rarity: 3 }),
    trophy_dune:  it("Pharaoh's Scarab", 'misc', 350, 'Proof you beat the Dune Pharaoh.', { rarity: 3 }),
    trophy_frost: it('Frozen Heart',  'misc', 350, 'Proof you beat the Frost Giant.', { rarity: 3 }),
    trophy_heart: it('Heart Fragment', 'misc', 1000, 'A sliver of the Old Heart. It is still warm.', { rarity: 4 }),
    // ── brews from monster parts ──
    potion_might: it('Might Draught', 'potion', 16, 'Hit much harder for a couple of minutes.', { buff: { id: 'mighty', secs: 120 }, rarity: 1 }),
    potion_guard: it('Ironhide Tonic', 'potion', 18, 'Your skin turns tough as boots.', { buff: { id: 'ironhide', secs: 150 }, rarity: 1 }),
    potion_mend:  it('Mending Salve', 'potion', 20, 'Wounds close on their own for a while.', { buff: { id: 'mending', secs: 120 }, heal: 1, rarity: 2 }),
    // ── more weapons ──
    dagger_bone:  it('Bone Dagger',   'gear', 24, 'Tiny, quick, and good at finding weak spots.', { rarity: 1, gear: { slot: 'weapon', tier: 1, dmg: 1.5, wtype: 'dagger', cd: 0.5, reach: 18, mods: { crit: 0.1 } } }),
    dagger_steel: it('Steel Stiletto', 'gear', 100, 'Almost a blur in the hand.', { rarity: 2, gear: { slot: 'weapon', tier: 2, dmg: 2.4, wtype: 'dagger', cd: 0.45, reach: 18, mods: { crit: 0.16 } } }),
    staff_apprentice: it('Apprentice Staff', 'gear', 50, 'A glass bead, a crooked stick, and big dreams.', { rarity: 1, gear: { slot: 'weapon', tier: 1, dmg: 2.2, wtype: 'staff', cd: 1.3, reach: 78 } }),
    bow_long:     it('Longbow',       'gear', 90, 'More range, more punch.', { rarity: 2, gear: { slot: 'weapon', tier: 2, dmg: 3, wtype: 'bow', cd: 1, reach: 124 } }),
    spear_steel:  it('Steel Spear',   'gear', 120, 'A long, mean point.', { rarity: 2, gear: { slot: 'weapon', tier: 2, dmg: 3.4, wtype: 'spear', cd: 1, reach: 42 } }),
    hammer_steel: it('Steel Maul',    'gear', 140, 'Smashes whatever stands near you.', { rarity: 2, gear: { slot: 'weapon', tier: 2, dmg: 4.6, wtype: 'hammer', cd: 1.4, reach: 26 } }),
    sword_crystal: it('Crystal Blade', 'gear', 300, 'Sings when it swings.', { rarity: 3, gear: { slot: 'weapon', tier: 3, dmg: 4.8, wtype: 'sword', cd: 0.72, reach: 28, mods: { dmgPct: 0.1 } } }),
    // ── more armor ──
    cap_hide:     it('Hide Cap',      'gear', 26, 'Boarskin, stitched tight.', { rarity: 1, gear: { slot: 'head', tier: 1, mods: { armor: 0.25, dodge: 0.02 } } }),
    tunic_hide:   it('Hide Tunic',    'gear', 48, 'Light and flexible.', { rarity: 1, gear: { slot: 'body', tier: 1, mods: { armor: 0.75, dodge: 0.03, moveSpeed: 0.03 } } }),
    cloak_shroud: it('Wraith Cloak',  'gear', 160, 'Colder than the night. Hard to hit.', { rarity: 2, gear: { slot: 'body', tier: 2, mods: { armor: 0.75, dodge: 0.08, moveSpeed: 0.05 } } }),
    helm_crystal: it('Crystal Helm',  'gear', 260, 'Faceted and fierce.', { rarity: 3, gear: { slot: 'head', tier: 3, mods: { armor: 1, maxHearts: 1, crit: 0.04 } } }),
    plate_crystal: it('Crystal Plate', 'gear', 420, 'The best armor a smith can make.', { rarity: 3, gear: { slot: 'body', tier: 3, mods: { armor: 2, maxHearts: 1, moveSpeed: -0.02 } } }),
    // ── boss gear ──
    crown_slime:  it('Slime Crown',   'gear', 220, 'Still a little sticky. Heals more, hurts less.', { rarity: 3, gear: { slot: 'head', tier: 2, mods: { armor: 0.5, maxHearts: 1, healPower: 0.25 } } }),
    staff_slime:  it('Gelatin Staff', 'gear', 240, 'Its bolts burst into slime.', { rarity: 3, gear: { slot: 'weapon', tier: 2, dmg: 3.2, wtype: 'staff', cd: 1, reach: 90, mods: { healPower: 0.1, vamp: 0.04 } } }),
    hammer_colossus: it('Colossus Maul', 'gear', 400, 'Slow and earth-shaking.', { rarity: 3, gear: { slot: 'weapon', tier: 3, dmg: 6.4, wtype: 'hammer', cd: 1.5, reach: 28, mods: { armor: 0.25 } } }),
    plate_colossus: it('Colossus Plate', 'gear', 440, 'A hundred pounds of living stone.', { rarity: 3, gear: { slot: 'body', tier: 3, mods: { armor: 2.5, maxHearts: 1, moveSpeed: -0.08 } } }),
    staff_witch:  it("Witch's Staff", 'gear', 400, 'Curses everything it touches.', { rarity: 3, gear: { slot: 'weapon', tier: 3, dmg: 4.4, wtype: 'staff', cd: 0.9, reach: 98, mods: { vamp: 0.06 } } }),
    charm_hex:    it('Hex Charm',     'gear', 300, 'Bad luck for others, good luck for you.', { rarity: 3, gear: { slot: 'charm', tier: 3, mods: { dodge: 0.08, luck: 0.06 } } }),
    sword_pharaoh: it("Pharaoh's Khopesh", 'gear', 460, 'A curved golden blade.', { rarity: 3, gear: { slot: 'weapon', tier: 3, dmg: 5.2, wtype: 'sword', cd: 0.7, reach: 30, mods: { crit: 0.08 } } }),
    charm_scarab: it('Scarab Charm',  'gear', 320, 'Everything comes your way.', { rarity: 3, gear: { slot: 'charm', tier: 3, mods: { moveSpeed: 0.12, magnet: 0.35, sell: 0.08 } } }),
    bow_frost:    it('Frostbow',      'gear', 460, 'Arrows that leave a chill behind.', { rarity: 3, gear: { slot: 'weapon', tier: 3, dmg: 5, wtype: 'bow', cd: 0.95, reach: 134 } }),
    helm_frost:   it('Giant\u2019s Helm', 'gear', 380, 'Rimed with permanent frost.', { rarity: 3, gear: { slot: 'head', tier: 3, mods: { armor: 1.25, maxHearts: 0.5, nightDmg: 0.1 } } }),
    // ── rift spoils ──
    rift_shard:   it('Rift Shard',     'material', 14, 'A splinter of somewhere else. The Rift Forge turns it into legend.', { rarity: 3 }),
    rift_core:    it('Rift Core',      'material', 60, 'The heart of a guardian, still beating out of time.', { rarity: 4 }),
    sword_rift:   it('Riftblade',      'gear', 600, 'Cuts a little further than the blade is long.', { rarity: 4, gear: { slot: 'weapon', tier: 4, dmg: 6.6, wtype: 'sword', cd: 0.66, reach: 31, mods: { crit: 0.1, dmgPct: 0.1 } } }),
    bow_rift:     it('Riftbow',        'gear', 600, 'Its arrows arrive just before you let go.', { rarity: 4, gear: { slot: 'weapon', tier: 4, dmg: 6.2, wtype: 'bow', cd: 0.82, reach: 150, mods: { crit: 0.08 } } }),
    helm_rift:    it('Rift Helm',      'gear', 520, 'Its visor looks onto another sky.', { rarity: 4, gear: { slot: 'head', tier: 4, mods: { armor: 1.5, maxHearts: 1, crit: 0.05 } } }),
    plate_rift:   it('Rift Plate',     'gear', 760, 'Plates that are never quite where you hit them.', { rarity: 4, gear: { slot: 'body', tier: 4, mods: { armor: 3, maxHearts: 1.5, dodge: 0.05 } } }),
    charm_rift:   it('Riftheart Charm', 'gear', 900, 'Hums when something dangerous is near.', { rarity: 4, gear: { slot: 'charm', tier: 4, mods: { dmgPct: 0.2, vamp: 0.08, luck: 0.08, maxHearts: 1 } } }),
    charm_heart:  it('Heartstone',    'gear', 1500, 'It beats in time with yours.', { rarity: 4, gear: { slot: 'charm', tier: 4, mods: { maxHearts: 2, dmgPct: 0.15, armor: 0.5, healPower: 0.3 } } }),
    // ── packs: carry more of every item ──
    bag_satchel:  it('Satchel',         'gear', 40,  'A leather satchel with a good strap. Carry 40 more of every item.', { gear: { slot: 'bag', tier: 0, mods: { carry: 40 } } }),
    bag_rucksack: it('Rucksack',        'gear', 110, 'Roomy, with pockets for everything. Carry 100 more of every item.', { rarity: 1, gear: { slot: 'bag', tier: 1, mods: { carry: 100 } } }),
    bag_pack:     it('Explorer\u2019s Pack', 'gear', 260, 'Canvas, iron buckles, a bedroll. Carry 220 more of every item.', { rarity: 2, gear: { slot: 'bag', tier: 2, mods: { carry: 220 } } }),
    bag_frame:    it('Hauler\u2019s Frame', 'gear', 520, 'A steel frame with straps for an absurd load. Carry 450 more of every item.', { rarity: 3, gear: { slot: 'bag', tier: 3, mods: { carry: 450, moveSpeed: -0.03 } } }),
    bag_rift:     it('Rift Pack',       'gear', 900, 'Bigger on the inside than it has any right to be. Carry 900 more of every item.', { rarity: 4, gear: { slot: 'bag', tier: 4, mods: { carry: 900 } } }),
    // ── creatures ──
    pod:        it('Taming Pod',   'misc', 4, 'Throw it at a wild creature (T) to befriend it.', { rarity: 0 }),
    pod_great:  it('Greater Pod',  'misc', 14, 'A sturdier pod. Better odds on uncommon creatures.', { rarity: 1 }),
    pod_ultra:  it('Master Pod',   'misc', 60, 'Humming with old magic. Gives rare creatures a real chance.', { rarity: 2 }),
    treat:      it('Creature Treat', 'misc', 5, 'Fed to a creature for a big chunk of experience.', { rarity: 1 }),
    // ── more crops, dishes and brews ──
    beet:      it('Beet',          'food', 3, 'Earthy and sweet. Great in soup.', { food: 12 }),
    corn:      it('Corn',          'food', 3, 'Golden kernels, sweet and crisp.', { food: 16 }),
    melon:     it('Melon',         'food', 8, 'Heavy, cool and full of juice.', { food: 26 }),
    pepper:    it('Chili Pepper',  'material', 4, 'Small and furious. Cooks love it.'),
    flax:      it('Flax',          'material', 2, 'Tall blue-flowered stalks. Spun into rope at the loom, three cords for two stalks.'),
    seed_beet:   it('Beet Seeds',   'seed', 1, 'Plant in a garden bed. Quick.'),
    seed_corn:   it('Corn Seeds',   'seed', 1, 'Plant in a garden bed.'),
    seed_melon:  it('Melon Seeds',  'seed', 3, 'Plant in a garden bed. Slow, but worth it.'),
    seed_pepper: it('Pepper Seeds', 'seed', 2, 'Plant in a garden bed.'),
    seed_flax:   it('Flax Seeds',   'seed', 2, 'Plant in a garden bed. Rope for the loom.'),
    soup:      it('Beet Soup',     'food', 12, 'Warm, red and filling.', { food: 38, buff: { id: 'sated', secs: 150 }, rarity: 1 }),
    cornbread: it('Cornbread',     'food', 12, 'Crumbly and sweet. Puts a spring in your step.', { food: 34, buff: { id: 'featherfoot', secs: 150 }, rarity: 1 }),
    melon_ice: it('Melon Slush',   'food', 14, 'Cold, sweet and soothing.', { food: 30, heal: 1, buff: { id: 'mending', secs: 90 }, rarity: 1 }),
    jam:       it('Berry Jam',     'food', 9, 'A spoonful of luck.', { food: 20, buff: { id: 'lucky', secs: 120 }, rarity: 1 }),
    spicy_stew: it('Spicy Stew',   'food', 24, 'Your ears will ring. Your fists will too.', { food: 50, buff: { id: 'mighty', secs: 180 }, rarity: 2 }),
    potion_vigor: it('Vigor Elixir', 'potion', 26, 'Extra hearts for three minutes.', { buff: { id: 'vigor', secs: 180 }, rarity: 2 }),
    potion_night: it('Owl Brew',    'potion', 28, 'See and strike better in the dark.', { buff: { id: 'nightowl', secs: 150 }, rarity: 2 }),
    // ── the XP brews ──
    potion_study:   it("Scholar's Tea",     'potion', 18, '+50% XP from everything for five minutes.', { buff: { id: 'studious', secs: 300 }, rarity: 1 }),
    potion_insight: it('Elixir of Insight', 'potion', 45, 'Double XP from everything for four minutes.', { buff: { id: 'insight', secs: 240 }, rarity: 2 }),
    potion_memory:  it('Bottled Memories',  'potion', 60, 'Drink a quarter of a level at once, whatever your level (XP boosts count too).', { xpPct: 0.25, rarity: 3 }),
    potion_kin:     it('Kinship Tonic',     'potion', 24, 'For five minutes your creatures learn faster and work harder, and you learn more from their work.', { buff: { id: 'kinship', secs: 300 }, rarity: 2 }),
    // ── fishing ──
    rod:        it('Fishing Rod',  'misc', 10, 'Face the water and press Q. Wait for the bite, then pull in time.'),
    rod_fine:   it('Steel Rod',    'misc', 60, 'Quicker bites, more time to react, and better fish.', { rarity: 2 }),
    rod_master: it('Crystal Rod',  'misc', 220, 'The water seems to offer up its secrets.', { rarity: 3 }),
    bait:       it('Bait',         'misc', 1, 'Used up automatically when you cast: fish bite sooner and rarer ones come.'),
    fish_minnow:   it('Minnow',        'food', 1, 'Tiny and silver. Good bait.', { food: 4 }),
    fish_carp:     it('Carp',          'food', 4, 'Plump and golden.', { food: 6 }),
    fish_perch:    it('Perch',         'food', 5, 'Striped and spiny.', { food: 6 }),
    fish_trout:    it('Trout',         'food', 12, 'Quick and cold-water pink.', { food: 8, rarity: 1 }),
    fish_bass:     it('Bass',          'food', 13, 'A fighter with a big mouth.', { food: 8, rarity: 1 }),
    fish_eel:      it('Eel',           'food', 15, 'Long, dark and slippery.', { food: 7, rarity: 1 }),
    fish_catfish:  it('Catfish',       'food', 14, 'Whiskers and a bad temper.', { food: 8, rarity: 1 }),
    fish_koi:      it('Koi',           'food', 38, 'Only bites in the rain. Brings good luck.', { food: 6, rarity: 2 }),
    fish_pike:     it('Pike',          'food', 42, 'All teeth. Needs a steel rod.', { food: 9, rarity: 2 }),
    fish_lantern:  it('Lanternfish',   'food', 40, 'Carries its own light, and only after dark.', { food: 6, rarity: 2 }),
    fish_goldkoi:  it('Golden Koi',    'food', 320, 'A legend of the water. Rain, daylight and a crystal rod.', { food: 6, rarity: 4 }),
    junk_boot:  it('Soggy Boot',   'misc', 1, 'Somebody lost this a long time ago.'),
    pearl:      it('Pearl',        'material', 45, 'A perfect little moon from the deep.', { rarity: 3 }),
    fish_pie:      it('Fish Pie',        'food', 14, 'Flaky crust, a little of everything.', { food: 36, buff: { id: 'sated', secs: 150 }, rarity: 1 }),
    smoked_trout:  it('Smoked Trout',    'food', 26, 'Smoky and rich. Light on your feet.', { food: 40, buff: { id: 'featherfoot', secs: 180 }, rarity: 1 }),
    stewed_eel:    it('Stewed Eel',      'food', 34, 'Dark, deep and surprisingly good.', { food: 42, buff: { id: 'nightowl', secs: 120 }, rarity: 2 }),
    baked_bass:    it('Baked Bass',      'food', 28, 'Crisp skin, tough constitution.', { food: 36, buff: { id: 'ironhide', secs: 150 }, rarity: 1 }),
    catfish_stew:  it('Catfish Stew',    'food', 36, 'Hot enough to heal what ails you.', { food: 48, heal: 1, buff: { id: 'mending', secs: 120 }, rarity: 2 }),
    koi_sashimi:   it('Koi Sashimi',     'food', 80, 'Thin, cold and lucky.', { food: 30, buff: { id: 'lucky', secs: 240 }, rarity: 2 }),
    lantern_soup:  it('Lantern Soup',    'food', 80, 'It glows in the bowl. You will too.', { food: 34, buff: { id: 'nightowl', secs: 240 }, rarity: 2 }),
    pike_roast:    it('Pike Roast',      'food', 90, 'Peppery, heavy and strong.', { food: 46, buff: { id: 'mighty', secs: 200 }, rarity: 2 }),
    // ── fortune: crates, bottles and the lantern ──
    crate_wood:    it('Wooden Crate',    'misc', 12, 'A battered crate that rattles when you shake it. Click it in your backpack to open it.', { rarity: 1, open: 'wood' }),
    crate_silver:  it('Silver Crate',    'misc', 45, 'Silver bands and a heavy lock. Something good is inside. Click it to open.', { rarity: 2, open: 'silver' }),
    crate_gold:    it('Golden Crate',    'misc', 150, 'It hums. Click it in your backpack to open it, and stand back.', { rarity: 3, open: 'gold' }),
    crate_mythic:  it('Mythic Crate',    'misc', 600, 'Stars leak out of the cracks. Open it when you are ready.', { rarity: 4, open: 'mythic' }),
    bottle:        it('Message in a Bottle', 'misc', 15, 'Somebody sealed a letter in this a long time ago. Click it to read it.', { rarity: 1, open: 'bottle' }),
    lantern_shard: it('Lantern Shard',   'material', 120, 'A sliver of warm glass. It glows a little when nobody is looking.', { rarity: 3 }),
    charm_fortune: it('Fortune\u2019s Lantern', 'gear', 1200, 'Madame Fortuna swears it can smell where the luck is.', { rarity: 4, gear: { slot: 'charm', tier: 4, mods: { luck: 0.12, chestLoot: 0.4, nodeCrit: 0.06 } } }),
} satisfies Record<string, ItemDef>;

export type ItemId = keyof typeof ITEMS;
/** Things that can drop or be paid: items plus coins. */
export type Res = ItemId | 'coin';
export type Cost = Partial<Record<Res, number>>;

export const ITEM_ORDER = Object.keys(ITEMS) as ItemId[];
export const iconOf = (id: Res) => (id === 'coin' ? 'i_coin' : `i_${id}`);
export const resName = (r: Res) => (r === 'coin' ? 'Coins' : ITEMS[r].name);
/** "6 Wood + 2 Stone": a cost in words (a status line, a tooltip). */
export const costText = (cost: Cost) => (Object.entries(cost) as [Res, number][]).map(([r, k]) => `${k} ${resName(r)}`).join(' + ');
/** "6 wood + 2 stone": the same inside a sentence. */
export const costWords = (cost: Cost) => costText(cost).toLowerCase();

/** Seconds of furnace burn time one item gives. */
export const FUEL: Partial<Record<ItemId, number>> = { wood: 14, plank: 18, peat: 26, coal: 50 };
/** Seconds of burn time an item gives: 0 for one that does not burn. */
export const fuelValue = (i: ItemId) => FUEL[i] ?? 0;
/** The longest-burning fuel among what `has` counts (a tray, a farmer's pockets), or undefined when nothing there burns. */
export function bestFuel (has: (i: ItemId) => number): ItemId | undefined {
    let best: ItemId | undefined;
    for (const i of Object.keys(FUEL) as ItemId[]) if (has(i) > 0 && (!best || fuelValue(i) > fuelValue(best))) best = i;
    return best;
}

export const STARTER_GEAR: Partial<Record<GearSlot, ItemId>> = { tool: 'pick_flint', weapon: 'club' };
