// Progression tips: short cards that turn up as the game opens out, each one the first time it matters.
// A tip has a trigger over a plain view of the farmer (their level, what they hold, what they have built, the
// weather…) and is shown once. The runner is pure logic: it says WHICH tip is due and keeps the rules about when
// (one at a time, a gap between two, never while you are fighting or a window is open). The client draws the card
// and remembers which ones were shown (the hints store); the guide's Tips page lists the ones you have seen.

import { TUNING } from '../config';
import { BUILDINGS, type BuildingKind } from './buildings';
import { seasonOf } from '../season';
import { PAL } from '../palette';
import { petsOf } from '../sim/petlib';
import { countOf, derived, hasUnlock } from '../sim/stats';
import type { Ent, PlayerS } from '../sim/types';
import type { HintStore } from './hints';

/** What the tips can see. `bld` counts buildings in view (anybody's), by kind. */
export interface TipView {
    me: PlayerS;
    day: number;
    clock: number;
    night: boolean;
    bld: Partial<Record<BuildingKind, number>>;
    /** How full the fullest chest in view is (0..1), and how many chests there are. */
    chestFill: number;
    chests: number;
    flags: {
        /** The player has used the zoom keys (or buttons) at some point. */
        zoomed: boolean;
        /** They woke up at home after a fall and lost something. */
        fell: boolean;
        /** Farmers online now. */
        online: number;
        /** A friend near you is down. */
        friendDown: boolean;
        rain: boolean;
        touch: boolean;
        /** An ore vein lies within a few tiles of you. */
        vein?: boolean;
    };
}

/** Count what is in view for the tips. */
export function tipFacts (ents: Iterable<Ent>): Pick<TipView, 'bld' | 'chestFill' | 'chests'> {
    const bld: Partial<Record<BuildingKind, number>> = {};
    let fill = 0, chests = 0;
    for (const e of ents) {
        if (e.k !== 'bld') continue;
        bld[e.kind] = (bld[e.kind] ?? 0) + 1;
        if (e.kind === 'chest' || e.kind === 'steelchest') {
            chests++;
            const total = Object.values(e.inv ?? {}).reduce((a, b) => a + (b ?? 0), 0);
            fill = Math.max(fill, total / (BUILDINGS[e.kind].storage ?? 400));
        }
    }
    return { bld, chestFill: fill, chests };
}

export interface Tip {
    id: string;
    /** A texture key: `k_…` glyph or `i_<item>`. */
    icon: string;
    color?: number;
    title: string;
    text: string;
    when: (v: TipView) => boolean;
    /** Lower comes first when several are due. */
    prio?: number;
    /** Not worth saying to a farmer past this level (the basics they know). */
    maxLevel?: number;
    /** May skip the gap between tips (a fall: where is my backpack?). It still waits for the tutorial to be over. */
    always?: boolean;
    /** About the evening itself (or a friend in trouble): may show while the dusk countdown is on, when every other tip waits. */
    dusk?: boolean;
}

const dayLeft = (v: TipView) => TUNING.dayLength - v.clock;
const has = (v: TipView, k: BuildingKind) => (v.bld[k] ?? 0) > 0;
const holds = (v: TipView, item: Parameters<typeof countOf>[1], n = 1) => countOf(v.me, item) >= n;
const chapter = (v: TipView) => v.me.qs?.ch ?? 0;
const lvl = (v: TipView, lo: number, hi = 999) => v.me.level >= lo && v.me.level < hi;
/** The dusk countdown is on: no time for a tip about something else. */
export const duskAlarm = (v: TipView) => !v.night && dayLeft(v) <= TUNING.duskWarn[0] && dayLeft(v) > 0;

export const TIPS: Tip[] = [
    // ── the first hours ──
    { id: 'zoom', icon: 'k_eye', title: 'See more of your farm', prio: 6, text: 'Press + or − to zoom the view in and out (on a phone, pinch). Zoom out to plan your farm, in to look closely.', when: (v) => !v.flags.zoomed && v.me.level >= 2 },
    { id: 'journal', icon: 'k_book', color: PAL.gold, title: 'A chapter is done!', prio: 2, text: 'It pays out by itself: coins, skill points and gear. The Journal (J) shows the next chapter, bounties and side quests.', when: (v) => chapter(v) >= 1 && v.me.level < 15 },
    { id: 'bounty', icon: 'k_target', color: PAL.pumpkin, title: 'Bounties', prio: 5, text: 'The Journal (J) lists bounties: small jobs that pay coins, XP and now and then a skill point. New ones keep coming.', when: (v) => chapter(v) >= 2 && v.me.level < 20 },
    { id: 'sidequests', icon: 'k_flag', color: PAL.blossom, title: 'Side quests', prio: 5, text: 'People on the island have side quests. Open the Journal (J), the Quests tab, and press Accept. You can pin one to the tracker.', when: (v) => v.me.level >= 4 && v.me.level < 25 },
    { id: 'dusk', icon: 'k_moon', color: PAL.plum, title: 'Night is coming', prio: 1, dusk: true, text: 'Monsters wander out after dark. Light a Campfire or Lantern, swing your weapon with Space and eat or drink to heal.', when: (v) => !v.night && dayLeft(v) <= TUNING.duskWarn[0] && dayLeft(v) > 0, maxLevel: 12 },
    { id: 'hearth', icon: 'k_flame', color: PAL.pumpkin, title: 'Gather round the fire', prio: 3, dusk: true, text: 'Stand at a Campfire or Table with a friend, or with your companion beside you, before night falls: a ring fills, and you all earn Hearthside until dawn (+15% XP, faster hearts and energy).', when: (v) => !v.night && dayLeft(v) <= TUNING.duskWarn[0] && dayLeft(v) > 0 && ((v.bld.campfire ?? 0) + (v.bld.table ?? 0) > 0) && (v.flags.online >= 2 || petsOf(v.me).length > 0), maxLevel: 40 },
    { id: 'fall', icon: 'k_heart', color: PAL.berry, title: 'Back on your feet', prio: 0, always: true, dusk: true, text: 'A fall costs half your XP towards the next level and your backpack, unless a friend picks you up (hold E): that is free. Your things wait in a Lost Backpack where you fell: walk back and press E.', when: (v) => v.flags.fell },
    { id: 'points', icon: 'k_star', color: PAL.gold, title: 'Skill points waiting', prio: 4, text: 'You have unspent skill points. Press K and spend them: every point makes you a little stronger.', when: (v) => v.me.points >= 2, maxLevel: 30 },
    { id: 'level5', icon: 'k_sword', title: 'Level 5!', prio: 3, text: 'From here monsters hit at full strength, so wear armor and keep food or potions handy. Tougher elite monsters show up from level 6.', when: (v) => lvl(v, 5, 10) },
    { id: 'level10', icon: 'k_anvil', title: 'Level 10!', prio: 3, text: 'Steel and crystal gear need Steelwork and Crystalwork in the Industry branch (K). Taming, expeditions and bosses are the next big steps.', when: (v) => lvl(v, 10, 20) },
    { id: 'level20', icon: 'k_crown', color: PAL.gold, title: 'Level 20!', prio: 3, text: 'You are strong now. Try an Expedition, call a boss at the Altar, and bring friends: the best gear and skill points come from them.', when: (v) => lvl(v, 20, 40) },
    // ── materials ──
    { id: 'copper', icon: 'i_copper', title: 'Copper!', prio: 5, text: 'Smelt copper ore in a Furnace. Copper bars become wire at the Anvil, and you need wire for Power Poles and circuits.', when: (v) => holds(v, 'copper'), maxLevel: 16 },
    { id: 'iron', icon: 'i_iron', title: 'Iron ore', prio: 5, text: 'Smelt iron in a Furnace, then the Anvil (Blacksmithing in the skill tree, K) turns the bars into a real pick, swords and armor.', when: (v) => holds(v, 'iron'), maxLevel: 14 },
    { id: 'sand', icon: 'i_sand', title: 'Sand', prio: 6, text: 'Melt sand in a Furnace to make glass. Lanterns, window walls and potions all need glass.', when: (v) => holds(v, 'sand'), maxLevel: 18 },
    { id: 'clay', icon: 'i_clay', title: 'Clay', prio: 6, text: 'Bake clay in a Furnace into bricks: for the Kitchen, brick walls, tile roofs and floors.', when: (v) => holds(v, 'clay'), maxLevel: 18 },
    { id: 'crystal', icon: 'i_crystal', title: 'Crystals need a better pick', prio: 6, text: 'Crystal clusters only break with a Golden Pick or better: learn Steelwork (K), then forge one at the Anvil.', when: (v) => v.me.level >= 8 && derived(v.me).toolTier < 2, maxLevel: 30 },
    { id: 'armor', icon: 'k_shield', title: 'Wear some armor', prio: 4, text: 'An Iron Helm is 4 iron bars at the Anvil, Iron Mail is 8 bars and 2 cloth. Put it on in the Backpack (I).', when: (v) => v.me.level >= 4 && !v.me.equip.head && !v.me.equip.body && holds(v, 'ironbar', 4), maxLevel: 25 },
    { id: 'cooking', icon: 'i_bread', title: 'Cooking', prio: 6, text: 'A Kitchen turns crops and fish into meals that fill your energy and give lasting buffs. Learn Kitchen Know-How in the Farming branch (K).', when: (v) => v.me.level >= 5 && !hasUnlock(v.me, 'cooking'), maxLevel: 25 },
    { id: 'energy', icon: 'i_berry', title: 'Running on empty', prio: 2, text: 'With no energy you move and swing slower. Press F to eat: berries are a quick fix, cooked meals last longer.', when: (v) => v.me.energy < 12, maxLevel: 20 },
    // ── machines and power ──
    { id: 'machine', icon: 'k_gear', title: 'Your first machine', prio: 4, text: 'Machines keep working while you are away. Press E to load them. A creature (P) can keep a furnace stocked for you.', when: (v) => has(v, 'furnace') || has(v, 'sawmill') || has(v, 'millstone'), maxLevel: 25 },
    { id: 'veins', icon: 'k_drill', title: 'Ore veins', prio: 5, text: 'The dark, cracked patches on the ground are ore veins. A Mining Drill set on one digs it for ever, once it has power. Drills come with Mining Machines in the Industry skills (K).', when: (v) => !!v.flags.vein && v.me.level >= 3 && !has(v, 'drill'), maxLevel: 25 },
    { id: 'drill', icon: 'k_drill', title: 'A mining drill!', prio: 3, text: 'Drills mine the ore veins under them forever, but they need power: a Wind Turbine, and Power Poles to wire them up.', when: (v) => has(v, 'drill') },
    { id: 'pole', icon: 'k_bolt', title: 'Power Poles', prio: 3, text: 'A pole wires machines within 3 tiles and links to other poles up to 7 tiles away. A machine with a blinking bolt has no power.', when: (v) => has(v, 'pole') },
    { id: 'belt', icon: 'k_belt', title: 'Belts', prio: 4, text: 'Drag to lay a line of belts and press R to turn them. Inserters move items on and off belts, chests and machines.', when: (v) => has(v, 'belt') },
    { id: 'starter', icon: 'k_belt', title: 'Ready-made lines', prio: 4, text: 'Not sure how to wire a factory? Press V and open Starter layouts: a smelter, a flour mill, a mining outpost and more, each placed in one click.', when: (v) => hasUnlock(v.me, 'logistics') && (v.bld.inserter ?? 0) + (v.bld.belt ?? 0) === 0 },
    { id: 'factoryview', icon: 'k_gear', title: 'Factory view', prio: 5, text: 'Press L (or the belt button under the map) to see how your factory is doing: power grids, what is stuck, and how much each machine makes.', when: (v) => (v.bld.furnace ?? 0) + (v.bld.drill ?? 0) + (v.bld.inserter ?? 0) + (v.bld.assembler ?? 0) >= 4 },
    { id: 'assembler', icon: 'k_robot', title: 'The Assembler', prio: 4, text: 'Open it (E) and pick what it builds: gears, wire, circuits… Then feed it with belts and inserters.', when: (v) => has(v, 'assembler') },
    { id: 'blueprints', icon: 'k_target', title: 'Blueprints', prio: 6, text: 'Press V and drag a box round part of your farm to copy it, then paste it anywhere. R turns the paste.', when: (v) => v.me.stats.built >= 15 },
    // ── storage ──
    { id: 'chestFull', icon: 'k_chest', title: 'A full Chest', prio: 3, text: 'A Chest holds 400 items. Build more, or a Steel Chest, which holds 1500 (Logistics in the skill tree).', when: (v) => v.chestFill >= 0.9 },
    { id: 'sortChests', icon: 'k_chest', title: 'Label your chests', prio: 4, text: 'Open a Chest and press Sort & label: it then takes only what you choose (all ores, just seeds…) and wears its icon. Inserters and helpers respect that.', when: (v) => v.chests >= 2 },
    // ── fighting and the big stuff ──
    { id: 'altar', icon: 'k_skull', color: PAL.plum, title: 'A Boss Altar', prio: 2, text: 'Craft a sigil here (E) from monster drops and use it to call the boss. Bring friends, food and potions, and watch for the red warnings on the ground.', when: (v) => has(v, 'altar') },
    { id: 'expedition', icon: 'k_compass', color: PAL.foam, title: 'Expeditions', prio: 2, text: 'Build an Expedition Dock by the water and launch up to four farmers into a rift: waves, a boon between waves and a guardian. Falling costs nothing there.', when: (v) => hasUnlock(v.me, 'expedition') },
    { id: 'blight', icon: 'i_blightcore', color: PAL.berry, title: 'The Blight', prio: 3, text: `The red marks out at sea on the map (M) are Blight nests. One within ${TUNING.blight.raidRange} plots of your base sends a raid at night. Go out and break it with your weapon: the isle is yours to buy.`, when: (v) => v.me.plotsBought >= 3 || v.me.level >= 8 },
    { id: 'defense', icon: 'k_tower', color: PAL.berry, title: 'Hold the walls', prio: 3, text: 'Raiders break walls, doorways and towers in their way, and what is hurt mends at dawn. Build Archer Towers and Spike Traps (Build, Defense) behind stone or Fortified Walls.', when: (v) => hasUnlock(v.me, 'towers') && !has(v, 'tower_archer') },
    { id: 'bed', icon: 'k_heart', color: PAL.cream, title: 'A bed far from home', prio: 5, text: 'A Bed (Build, Floors & walls) is where you wake up after a fall instead of at home. Put one in an outpost near the nests you mean to break.', when: (v) => (v.me.cnt?.raid ?? 0) > 0 && !(v.me.cnt?.['build:sleepbed'] ?? 0), maxLevel: 60 },
    { id: 'dread', icon: 'k_skull', color: PAL.plum, title: 'The Dread Reaches', prio: 3, text: 'The dark violet blocks with a skull on the map (M) are haunted land far out in the wilds. A warden boss guards each one: go in with a party, armor and potions.', when: (v) => v.me.level >= 12 || v.me.plotsBought >= 8 },
    { id: 'dash', icon: 'k_boot', title: 'Dash!', prio: 3, text: 'Press Shift (or the DASH button) to roll away with a moment of safety: step out of the red warnings on the ground.', when: (v) => hasUnlock(v.me, 'dash') },
    { id: 'revive', icon: 'k_heart', color: PAL.lime, title: 'A friend is down!', prio: 1, dusk: true, text: 'Walk up next to them and hold E: they get back up for free.', when: (v) => v.flags.friendDown },
    // ── creatures ──
    { id: 'taming', icon: 'k_paw', color: PAL.blossom, title: 'Taming', prio: 4, text: 'Craft pods at a Workbench, then throw one (T) at a wild creature. They are rare and shy: walk up slowly. Stronger pods catch better.', when: (v) => hasUnlock(v.me, 'taming') && petsOf(v.me).length === 0 },
    { id: 'tamed', icon: 'k_paw', color: PAL.blossom, title: 'A new friend!', prio: 3, text: 'Press P to see your creatures. Click one to bring it along, or press Give a job… to put it to work while you are away.', when: (v) => petsOf(v.me).length >= 1 && !petsOf(v.me).some((p) => p.post || p.den !== undefined || p.task || p.id === v.me.comp), maxLevel: 30 },
    { id: 'breeding', icon: 'k_heart', color: PAL.blossom, title: 'The Hatchery', prio: 4, text: 'Put two creatures and a few treats in a Hatchery and, after a while, there is an egg. The baby inherits traits from its parents.', when: (v) => hasUnlock(v.me, 'breeding') },
    // ── the world ──
    { id: 'rain', icon: 'k_drop', color: PAL.sea, title: 'Rain!', prio: 6, text: 'Rain waters your crops, so they grow faster. It also draws wild creatures out of hiding.', when: (v) => v.flags.rain, maxLevel: 16 },
    { id: 'winter', icon: 'k_drop', color: PAL.foam, title: 'Winter', prio: 4, text: 'Crops grow at less than half speed and the nights are longer. Keep a fire lit and food in your pockets.', when: (v) => seasonOf(v.day) === 'winter' && v.me.level >= 3 },
    { id: 'waystone', icon: 'k_compass', title: 'Waystones', prio: 4, text: 'Build two or more Waystones, then press E on one to step between them in an instant.', when: (v) => hasUnlock(v.me, 'waystone') },
    { id: 'fortune', icon: 'k_clover', color: PAL.lime, title: 'The Fortune Wheel', prio: 6, text: 'The Fortune Wheel (Build, Special) gives one free spin every day: coins, crates and a jackpot.', when: (v) => v.me.level >= 10, maxLevel: 40 },
    { id: 'shaft', icon: 'k_drill', title: 'The mine', prio: 3, text: 'The Mine Shaft leads down to caves as big as the world. Press E to climb down, hold the action key at rock to dig, light a campfire or lantern, and use the ladder to come back up.', when: (v) => Object.keys(v.bld).some((k) => k.includes('shaft')) },
    // ── comfort ──
    { id: 'photo', icon: 'k_eye', title: 'Photo mode', prio: 7, text: 'Press F2 to hide the whole HUD for a screenshot, and F2 or Esc to bring it back.', when: (v) => v.me.level >= 8 && !v.flags.touch, maxLevel: 40 },
    { id: 'chat', icon: 'k_ear', title: 'Say hello', prio: 5, text: 'Press Enter to chat, G then 1 to 8 for an emote, and middle-click to ping a spot for your friends.', when: (v) => v.flags.online >= 2 && !v.flags.touch },
];

export const TIP_BY_ID: Record<string, Tip> = Object.fromEntries(TIPS.map((t) => [t.id, t]));

/** Seconds between two tips, and the quiet at the start of a session. */
export const TIP_GAP = 150;
export const TIP_FIRST = 60;
/** What the store holds for a tip: its id behind this prefix, so tips and first-time hints share one list. */
export const TIP_PREFIX = 'tip:';

/** The tips due right now, best first (not counting what was seen). */
export function due (v: TipView, seen: ReadonlySet<string>, inTutorial = false): Tip[] {
    const alarm = duskAlarm(v);
    return TIPS.filter((t) => !seen.has(t.id) && !inTutorial && (!alarm || t.dusk) && (t.maxLevel === undefined || v.me.level <= t.maxLevel) && t.when(v))
        .sort((a, b) => (a.prio ?? 5) - (b.prio ?? 5));
}

export interface TipGate {
    /** A window is open, or you are down. */
    quiet: boolean;
    /** Monsters near, or your hearts are low. */
    fighting: boolean;
    /** The tutorial is still running. */
    tutorial: boolean;
    /** Tips are switched off. */
    off: boolean;
}

export class TipRunner {
    private seen: Set<string>;
    private cool = TIP_FIRST;
    private t = 0;

    constructor (private store: HintStore) {
        this.seen = new Set(store.load().filter((id) => id.startsWith(TIP_PREFIX)).map((id) => id.slice(TIP_PREFIX.length)));
    }

    has (id: string) { return this.seen.has(id); }
    get seenIds () { return [...this.seen]; }

    /** Called every frame; looks around once a second. Returns the tip to show now, if any. */
    update (dt: number, v: TipView, g: TipGate): Tip | null {
        this.cool = Math.max(0, this.cool - dt);
        this.t -= dt;
        if (this.t > 0) return null;
        this.t = 1;
        if (g.off || g.quiet || g.fighting) return null;
        const list = due(v, this.seen, g.tutorial);
        const tip = list.find((x) => x.always || this.cool <= 0);
        if (!tip) return null;
        this.seen.add(tip.id);
        this.store.save(this.seenIds.map((id) => TIP_PREFIX + id));
        this.cool = TIP_GAP;
        return tip;
    }
}
