// The world's state is plain JSON: it is saved as-is, sent to clients as-is,
// and rebuilt into a Sim on load. No class instances, no Maps.

import type { Action } from '../actions';
import type { Biome, ModKind } from '../data/biomes';
import type { BuildingKind } from '../data/buildings';
import type { ItemId, Res, WeaponType, WornSlot } from '../data/items';
import type { NodeKind } from '../data/nodes';
import type { Pet, PostStatus, SpeciesId, TraitId, WorkKind } from '../data/creatures';
import type { Reward } from '../data/quests';
import type { MobKind, NestKindId, PatternId, ProjKind } from '../data/mobs';
import type { BuffId } from '../data/stats';
import type { CoStatus } from '../data/costatus';
import type { Look } from '../data/look';
import type { DevOp } from './dev';

export const STATE_VERSION = 7;

export type Inv = Partial<Record<ItemId, number>>;

export interface Plot {
    i: number;              // index = gy * GRID + gx
    gx: number;
    gy: number;
    biome: Biome;
    mod: ModKind | null;
    owned: boolean;
    buyer?: string;         // player id who raised it ('home:<slot>' for a starting island)
    nodes: number;          // live resource nodes on this plot
    home?: number;          // spawn slot whose home this is
    heart?: true;           // the centre plot (future boss arena)
    veins?: Vein[];         // ore veins in the ground (drills mine them)
    dread?: 1 | 2;          // part of a Dread block (2: its middle plot): always land, never for sale
    zone?: number;          // … which block (0..3)
    blight?: 1 | 2;         // a nest isle (sim/blight.ts): 1 while its Blight nest lives (land, nobody's, not for sale), 2 cleansed (land anybody may buy)
    nl?: number;            // … its nest's level (1 when it rises, +1 every night, summed when two merge)
    nk?: NestKind;          // … and its kind (the family of monsters it hatches)
}

/** The kinds of Blight nest (data/mobs.ts NEST_KINDS): each hatches its own family of raiders. */
export type NestKind = NestKindId;

/** [tile x, tile y, resource] */
export type Vein = [number, number, ItemId];

/**
 * A resource node. `plot` is the index of the island it was counted on; a node that stands on no island (the caves, the developer
 * menu's spawns on a rift island) carries plot 0's index (the client paints a node in its plot's biome and has no guard for a missing
 * one), so anything that reads a node's plot checks the node really stands on it (`world.plotAt(tx, ty) === plot`). `gold`: a golden
 * node, worth a lot more.
 */
export interface NodeE {
    id: number; k: 'node'; kind: NodeKind; tx: number; ty: number; hp: number; plot: number; gold?: 1;
    /** A Blight nest (sim/blight.ts): its full health (its level and kind are on its plot: `Plot.nl`, `Plot.nk`). */
    mhp?: number;
}
export interface BuildE {
    id: number; k: 'bld'; kind: BuildingKind;
    tx: number; ty: number;  // top-left tile of the footprint
    rot: number;             // 0..3, for directional machines
    inv?: Inv;               // chest contents / processor inputs (an Uber Chest's is the world's shared store: sim/uber.ts)
    cap?: number;            // an Uber Chest: the room all of them give together (sim/uber.ts: storageOf)
    out?: Inv;               // processor outputs
    fin?: Inv;               // the fuel ITEMS waiting to be burned (coal, planks…): what is loaded into the fuel slot
    rcp?: string;            // recipe currently being worked
    fuel?: number;           // seconds of burn LEFT from the item being burned now: when it reaches 0 the next item in `fin` is lit
    prog?: number;           // progress through the current recipe, seconds
    crop?: number;           // bed: -1 empty, 0 sprout, 1 leafy, 2 ripe
    plant?: ItemId;          // bed: which seed is growing
    growT?: number;
    by?: string;             // who owns the buffer's perks (smelter, planter)
    sel?: string;            // assembler: the recipe it is set to build
    belt?: (ItemId | null)[]; // belt: three slots, 0 = entry … 2 = exit
    hand?: ItemId;           // inserter: what it is holding
    flt?: ItemId;            // inserter: only moves this item; sorter: the item that goes straight on; export chute: the only item it sells
    rr?: number;             // splitter / sorter: round-robin turn
    chg?: number;            // battery: stored power (units x seconds)
    boost?: number;          // world time until a creature's stoking speeds this machine up
    bs?: number;             // … and by how much (0.25 = a quarter faster)
    par?: [string, string];  // hatchery: the two parents resting in it
    bt?: number;             // hatchery: seconds the egg has been forming
    bo?: string;             // hatchery: whose creatures they are
    egg?: { sp: SpeciesId; traits: TraitId[]; mu?: 1 };   // hatchery: an egg waiting to be hatched
    pw?: number;             // power satisfaction 0..1 (consumers)
    flag?: 1;                // mailbox: its owner has post waiting (the flag is up)
    dish?: Dish[];           // potluck table: the dishes set out (up to four, one row per kind; sim/potluck.ts)
    fc?: Record<string, number>;   // potluck table: when each farmer last feasted here (world seconds; old entries are dropped)
    act?: number;            // 1 while it is working (drives power demand)
    born?: number;           // a lost backpack: the world time it was dropped
    fl?: string[];           // a dedicated chest: what it takes (`#ore` for a category, or an item id); none = everything
    ic?: string;             // … and the item whose icon it wears (none: the first thing it takes lends its own)
    lnk?: number;            // a mine ladder: the shaft it leads up to
    hg?: number;             // a campfire, table or light at dusk: how far the evening hearth is kindled, 0..1 (1: it is, until night falls; sim/hearth.ts)
    ch?: ChuteS;             // an export chute: its books (see sim/chute.ts)
    xp?: number;             // a tower or spike trap: the XP it has earned (its level comes from it: data/towerperks.ts)
    pk?: string[];           // … and the perks it has taken, in order
    hp?: number;             // a wall, doorway or tower a raider has hurt: the hit points it has left (none: whole; it mends at dawn, sim/defense.ts)
}

/**
 * An export chute's books. `w` is what it paid out in each of the last six ten-second slices, newest first, and `s` is the number of
 * the newest slice (world time / 10): together they give the rolling "coins a minute". `t0` is when the current run of selling began,
 * `p` the coins not yet shown as a "+N" over it, `f` when one was last shown and `r` the hundredths of a coin not paid out yet
 * (`p` and `f` are the server's own bookkeeping: they are not re-sent until the next sale, and nothing on a client reads them).
 */
export interface ChuteS { s: number; w: number[]; p: number; f: number; r: number; t0: number }
export interface DropE { id: number; k: 'drop'; res: Res; x: number; y: number; ox: number; oy: number; age: number } // ox/oy: where it popped out
export interface MobE {
    id: number; k: 'mob'; kind: MobKind;
    x: number; y: number; hp: number; mhp: number; vx: number; vy: number;
    t: number; hopT: number; knockT: number;
    lv?: number;             // the level this monster was tuned to (the party's average when it spawned)
    el?: 1;                  // elite: tougher, nastier, better loot
    guard?: 1;               // keeps its post: not swept away at dawn
    rift?: number;           // an expedition monster: the rift island it belongs to (never swept away at dawn)
    rb?: 1;                  // the guardian at the end of an expedition: fights with a boss's patterns
    dm?: number;             // expedition monsters: damage multiplier
    sm?: number;             // expedition monsters: speed multiplier (the Swift omen)
    rt?: number;             // expedition guardians: which tier's patterns they use
    st?: number;             // behaviour state: 0 walking, 1 winding up, 2 acting (charging…), 3 stunned
    a?: number;              // ability timer (s)
    dx?: number; dy?: number; // stored direction (charges, leaps)
    gx?: number; gy?: number; // stored target point (leap landing)
    stun?: number;
    // bosses
    ph?: number;             // phase index
    pat?: PatternId;         // the pattern being performed
    pt?: number;             // time into the pattern, or rest left between patterns
    pi?: number;             // next pattern index within the phase
    hx?: number; hy?: number; // home: the leash centre (the altar)
    alt?: number;            // altar entity id
    idle?: number;           // s without any player in the arena
    zone?: number;           // a Dread block's monster (1..4): the warden itself, or one of the things haunting it
    und?: 1;                 // a creature of the caves (they come and go with whoever is digging)
    rd?: [number, number];   // a raider from a Blight nest: the base it marches on (px); it wades across the sea (sim/raid.ts)
    nb?: number;             // the brood of a Blight nest: the nest isle's plot index (it melts away when nobody is near)
    dt?: number;             // a raider stepping round something in its way: seconds left of the sidestep…
    dd?: number;             // … and which way (1 left, -1 right)
    hb?: number;             // a raider at a wall: seconds until its next blow
}
/** A bolt, arrow or boulder in flight (fired by monsters; players' shots resolve instantly). */
export interface ProjE {
    id: number; k: 'proj'; kind: ProjKind; x: number; y: number; vx: number; vy: number; dmg: number; life: number;
    /** A tower's shot: harmless (the hit was dealt when it was fired), it only flies to show where the shot goes, over walls, and ends with its flight. */
    tw?: 1;
}
/** A wild creature, a companion at its owner's heels, or a worker living in a den. */
export interface CritE {
    id: number; k: 'crit'; sp: SpeciesId;
    x: number; y: number; vx: number; vy: number; t: number;
    lv: number;
    star?: number;           // awakening stars (companions and workers)
    mode: 0 | 1 | 2;         // 0 wild, 1 companion, 2 den worker
    st?: number;             // 0 idle, 1 fleeing, 2 inside a pod, 3 working
    /**
     * Three clocks that read alike. `a` is the seconds until the creature next ACTS (looks for a monster, picks a den job, leaves a pod,
     * stops fleeing); `t` is the wander clock (seconds until it picks a new direction to amble in); `w` is how long the work animation
     * has left (`st` 3 ends when it runs out).
     */
    a?: number;
    life?: number;           // wild: seconds before it wanders off
    hx?: number; hy?: number; // wander centre
    owner?: string; pid?: string; den?: number;
    tx?: number; ty?: number; wk?: WorkKind; // where it is working, and at what
    w?: number;              // seconds of work animation left
    cat?: { by: string; ok: boolean; pod: string }; // a pod is shaking on it
    jt?: number;             // companion field work: the entity it is heading for or working on
    jp?: number;             // … seconds spent on it so far
    js?: number;             // … seconds until it looks for the next job
    jq?: number;             // … seconds it has been stuck on the way
    ws?: PostStatus;         // a worker at a post: how it is getting on (the client shows a bubble when something is wrong)
    rb?: number;             // a workshop worker: 0 short of supplies, 1 ready, 2 nowhere to put the result
    ld?: [string, number][]; // an island worker: what it is carrying to a chest (or seeds from one)
    er?: number;             // … the chest it is walking to
    ek?: 0 | 1 | 2 | 3;      // … to put things in (0), fetch seeds (1), pick up something to sort (2), or put it where it belongs (3)
    ei?: string; en?: number; et?: number;   // … sorting: what to pick up, how many, and the chest it goes to
    ac?: string;             // what it is doing right now (`ACTIVITY` in data/creatures.ts): the client shows an icon and a caption
}
export type Ent = NodeE | BuildE | DropE | MobE | ProjE | CritE;

/** One piece of a blueprint: a building, where it goes relative to the anchor, and its settings. */
export interface BlueprintItem { kind: BuildingKind; dx: number; dy: number; rot: number; flt?: ItemId; sel?: string }

/** A line in the water. ph: 0 waiting for a bite, 1 a bite (pull now), 2 the fish is fighting, 3 a tug (pull now). */
export interface FishState {
    x: number; y: number;          // where the bobber floats
    ox: number; oy: number;        // where you stood when you cast
    ph: 0 | 1 | 2 | 3;
    t: number;                     // seconds left in this phase
    rod: number;                   // rod tier
    bait?: 1;
    item: ItemId;                  // what is on the other end (rolled at the cast)
    size?: number;
    round: number;                 // tugs answered so far
    rounds: number;                // tugs needed
    strikes: number;               // slips so far
}

/** An expedition as one of its party sees it (kept in their own record, so the HUD can draw it). */
export interface RiftView {
    arena: number;
    tier: number;
    wave: number;
    waves: number;
    ph: 0 | 1 | 2 | 3;       // 0 getting ready, 1 fighting, 2 choosing a boon, 3 over
    omens?: string[];        // the curses this party took on for a bigger payout
    daily?: true;            // this is the rift of the day
    left: number;            // monsters still to come or alive this wave
    t: number;               // whole seconds left of the countdown / the choice
    party: number;
    kills: number;
    offer?: string[];        // boons to choose from, until you have chosen
    win?: boolean;           // phase 3: how it ended
}

/** An expedition in progress on a rift island. */
export interface RiftRun {
    arena: number;
    tier: number;
    party: string[];
    from: Record<string, { x: number; y: number }>;   // where each farmer launched from (and returns to)
    started: number;
    wave: number;
    ph: 0 | 1 | 2 | 3;
    t: number;
    queue: { kind: MobKind; elite: boolean; guardian?: boolean; at: number }[];
    offers: Record<string, string[]>;
    kills: number;
    banked: Record<string, { coins: number; xp: number }>;   // wave payouts already given
    stall?: number;          // seconds the last few monsters have gone unkilled
    win?: boolean;
    omens?: string[];        // the curses the party took on at the dock
    daily?: true;            // the rift of the day
}

/** A daily errand: counted from `start`, or (for deliveries) taken from your pockets. */
export interface Bounty { id: string; key: string; n: number; label: string; item?: ItemId; start: number; reward: Reward; done?: true }
export interface QuestState {
    ch: number;                          // current story chapter
    start: Record<string, number>;       // counters when the chapter began
    seen: string[];                      // objectives already announced
    bounties: Bounty[];
    bday: number;                        // day the bounties were made for
    goals: string[];                     // production goals claimed
    medals: string[];                    // medals earned
    /** Side quests you have accepted: counters at the moment you accepted (steps count from there), and whether it is pinned to the HUD. */
    log?: { id: string; start: Record<string, number>; track?: boolean }[];
    fin?: string[];                      // side quests finished
    offered?: string[];                  // side quests you have been told about
}

export interface PlayerS {
    id: string;
    name: string;
    color: number;          // index into PLAYER_COLORS (also the scarf)
    look?: Look;            // body tone, sprout, eyes, mouth (unset until the farmer has used the character creator)
    slot: number;           // spawn slot on the ring
    online: boolean;
    x: number; y: number;   // feet position (px)
    fx: number; fy: number; // facing
    moving: boolean;
    warp: number;           // bumps when the server teleports the player (client snaps)
    hearts: number; energy: number;
    xp: number; level: number;
    points: number;         // unspent skill points
    coins: number;
    inv: Inv;
    equip: Partial<Record<WornSlot, ItemId>>;
    /** The Relic Satchel: the relics puzzled into it (data/relics.ts). */
    satchel?: { it: ItemId; x: number; y: number; r?: 1 }[];
    hot?: (ItemId | null)[];   // your hotbar, once you have pinned something (see sim/hotbar.ts)
    skills: Record<string, number>;
    buffs: { id: BuffId; t: number; by?: string }[];       // `by`: the cook, when the buff came from a potluck feast
    co?: CoStatus;          // a co-op boss status: frozen, hexed or chained (sim/costatus.ts); public, so friends see it, and never saved
    plotsBought: number;
    downed: number;         // s of bleed-out left; 0 = up
    revive: number;         // s of revive progress while downed
    invuln: number;
    swingCd: number;
    windDay: number;        // day Second Wind was last used
    stats: { harvested: number; built: number; kills: number; revives: number; crafted: number };
    boss?: Record<string, number>;   // bosses this player has helped defeat, by boss id
    pets?: Pet[];            // tamed creatures
    comp?: string;           // id of the pet walking beside you
    petSeq?: number;
    dex?: string[];          // species you have befriended at least once
    cnt?: Record<string, number>;   // counters behind quests and medals
    daily?: number;                 // the day you last cleared the rift of the day
    rift?: RiftView;         // the expedition you are on
    boons?: string[];        // boons held for the current expedition
    mail?: Parcel[];         // post waiting in the mailbox: parcels from friends and the morning postcards (sim/mail.ts)
    lessons?: number;        // XP the farmer's working creatures taught them since the last dawn (or since they were last here): told at dawn and on arrival (sim/petlib.ts)
    wish?: string;           // this season's wish, which blesses every farmer until the season ends (sim/wish.ts, data/wishes.ts)
    fishing?: FishState;     // your line in the water
    line?: { x: number; y: number; ph: 0 | 1 | 2 | 3 };   // what other farmers see of it
    pk?: { x: number; y: number };   // where your last lost backpack lies (the HUD points the way to it)
    bed?: number;            // the Bed you wake up in after a fall (a building id; gone or never set: at home; sim/bed.ts)
    fishlog?: Record<string, { n: number; best: number }>;   // every species you have caught: how many, and the biggest (cm)
    qs?: QuestState;
    fort?: FortuneState;
    /** Own view only (net/host.ts adds it to the message you get, never to the world or the save): the developer menu is unlocked for you. */
    dev?: true;
}

/** The travelling trader's stock, shared by the whole world and refreshed every couple of days. */
export interface Shop { day: number; stock: { item: ItemId; n: number; price: number }[] }

export interface WorldState {
    version: number;
    /** The store every Uber Chest opens (sim/uber.ts); kept when the last one is taken down. */
    uber?: { inv: Inv };
    seed: string;
    /** Farmers who signed in with a name and a secret word: lower-case name → their player id and the salted hash of the word. Never sent to clients. */
    accounts?: Record<string, { id: string; salt: string; h: string }>;
    homes?: Record<number, { gx: number; gy: number }>;      // where farmers nine and up were given their islands (the first eight are on the ring)
    name: string;           // party code or 'solo'
    tick: number;
    time: number;           // total simulated seconds
    clock: number;          // s since this day's dawn
    day: number;
    night: boolean;
    nightLen: number;       // s — shortened by the Night Watch skill
    paused: boolean;        // solo only: menus pause the world
    plots: Plot[];
    ents: Record<number, Ent>;
    nextId: number;
    players: Record<string, PlayerS>;
    prod?: Record<string, number>;   // items made by machines, ever ('coin': what the export chutes have paid out, ever)
    bosses?: Record<string, number>; // bosses defeated by this world, by boss id
    shop?: Shop;             // the trader's current stock
    rifts?: Record<number, RiftRun>;   // expeditions in progress, by rift island
    dread?: Record<number, DreadState>;   // the Dread blocks, by the index of their middle plot
    mine?: MineState;                     // the caves under the world, once somebody has gone down
    chron?: ChronEntry[];                 // the farm chronicle, oldest first (sim/chronicle.ts)
    wish?: WishState;                     // the season wish on offer or chosen (sim/wish.ts)
    blight?: { v: 1 };                    // the Blight's starting nests have been placed (sim/blight.ts); the nests themselves are plots marked `blight` and their nodes
}

/** One dish on a potluck table: the item (one with a buff), the portions left and the id of the farmer who cooked it (only they can take it back). */
export interface Dish { it: ItemId; n: number; by: string }

/** One letter in a farmer's mail: who it is from (`fid` is the sending farmer's id; a postcard from the island folk has none and `pc`), the day, a short note and what is in it. */
export interface Parcel { from: string; fid?: string; d: number; note: string; items: [Res, number][]; pc?: 1 }

/** The season wish vote: which season it is for (0 = the first spring), the day it opened, the three wishes on offer, who voted for what, and the winner once chosen. */
export interface WishState { k: number; day: number; opts: string[]; votes: Record<string, string>; won?: string }

/** One line of the farm chronicle: the day it happened, the words, an icon (an item or a `k_` glyph) and, for a line that is written only once, its key. */
export interface ChronEntry { d: number; t: string; i: string; k?: string }

/** The caves are made from the seed; this is what has been done to them: the rock that has been dug out (world tile indexes). */
interface MineState { dug: number[]; stocked?: 1 }

/** The warden of one Dread block. */
interface DreadState { boss: string; set?: 1; down?: number }

/** Things a player asks the world to do. The server validates every one. */
export type Cmd =
    | { t: 'move'; x: number; y: number; fx: number; fy: number; moving: boolean }
    | { t: 'swing'; id: number }
    /** Dig the rock at a tile of the caves. */
    | { t: 'dig'; tx: number; ty: number }
    | { t: 'use'; id: number; seed?: ItemId }
    /** Open a loot crate or a bottle from your pockets. */
    | { t: 'crate'; item: ItemId }
    /** The Fortune Wheel: spin it, or press your luck with the last coin prize (`double`), or `take` it as it is. */
    | { t: 'fortune'; op: 'spin' | 'double' | 'take'; id: number }
    | { t: 'buy'; plot: number }
    | { t: 'build'; kind: BuildingKind; tx: number; ty: number; rot?: number }
    | { t: 'demolish'; id: number }
    | { t: 'eat'; item?: ItemId }
    | { t: 'sell'; item: ItemId; n: number }
    | { t: 'craft'; recipe: string; n: number }
    | { t: 'equip'; item: ItemId; slot?: WornSlot }     // (`slot`: which ring finger, when it matters)
    | { t: 'hot'; slot: number; item: ItemId | null }
    | { t: 'look'; look: Look; color: number }     // the character creator: how the farmer looks
    | { t: 'respawn' }                 // you are down: give up waiting for a friend and wake up at home
    | { t: 'unequip'; slot: WornSlot }
    | { t: 'satchel'; op: 'put'; item: ItemId; x: number; y: number; r?: 1 }     // lay a relic from your pockets in the Relic Satchel, its top-left cell at (x, y)
    | { t: 'satchel'; op: 'take'; i: number }                                    // pick the i-th relic back up into your pockets
    | { t: 'skill'; id: string }
    | { t: 'xfer'; id: number; item: ItemId; n: number; dir: 'put' | 'take'; part?: 'inv' | 'out' | 'fuel' }
    | { t: 'load'; id: number }
    | { t: 'config'; id: number; sel?: string; flt?: ItemId | null; rot?: number; fl?: string[]; ic?: string | null }
    | { t: 'collect'; id: number }
    | { t: 'revive'; who: string }
    | { t: 'dash'; fx: number; fy: number }
    | { t: 'summon'; id: number; boss: string }
    | { t: 'tame'; id: number; pod: ItemId }
    | { t: 'quest'; op: 'claim' | 'goal' | 'bounty' | 'reroll' | 'accept' | 'abandon' | 'track'; id?: string }
    | { t: 'chat'; text: string }
    /** Vote for one of the season's wishes. */
    | { t: 'wish'; id: string }
    /** At a mailbox: leave a parcel for its owner (one to three kinds of things and a short note), or take the post waiting for you (one letter by index, or all). */
    | { t: 'mail'; op: 'send'; id: number; items: [Res, number][]; note: string }
    | { t: 'mail'; op: 'take'; id: number; i?: number }
    /** At a potluck table: set a dish out (`put`, from your pockets), take one of your own back (`take`), or feast now (`feast`: one portion of each dish that helps you). */
    | { t: 'potluck'; op: 'put' | 'take'; id: number; item: ItemId; n: number }
    | { t: 'potluck'; op: 'feast'; id: number }
    | { t: 'emote'; id: number }
    | { t: 'ping'; x: number; y: number }
    | { t: 'travel'; to: number }
    | { t: 'shop'; i: number; n: number }
    /** Pet your companion: it must be yours and beside you (sim/bond.ts). */
    | { t: 'pat' }
    /** Take the i-th upgrade a tower offers (sim/defense.ts `cmdPick`). */
    | { t: 'towerpick'; id: number; i: number }
    /** Mend a hurt wall, doorway or tower for materials (sim/defense.ts `cmdRepair`). */
    | { t: 'towerrepair'; id: number }
    | { t: 'pet'; op: 'companion' | 'rest' | 'assign' | 'unassign' | 'feed' | 'release' | 'rename' | 'awaken' | 'task' | 'post' | 'order'; pet: string; den?: number; item?: ItemId; name?: string; task?: WorkKind | null; at?: { plot?: number; job?: WorkKind; bld?: number }; rcp?: string; n?: number }
    | { t: 'rift'; op: 'launch'; id: number; tier: number; omens?: string[]; daily?: boolean }
    | { t: 'rift'; op: 'pick'; i: number }
    | { t: 'rift'; op: 'leave' }
    | { t: 'bp'; tx: number; ty: number; items: BlueprintItem[] }
    | { t: 'fish'; op: 'cast'; x: number; y: number }
    | { t: 'fish'; op: 'reel' | 'cancel' }
    | { t: 'breed'; op: 'start'; id: number; a: string; b: string }
    | { t: 'breed'; op: 'hatch' | 'cancel'; id: number }
    | { t: 'pause'; on: boolean }
    /** The developer menu: ask to unlock it with the server's key (the host checks it, rate-limited; solo is open), then run ops. See sim/dev.ts. */
    | { t: 'dev'; key: string }
    | { t: 'devdo'; op: DevOp; id?: string; who?: string; n?: number; lv?: number; x?: number; y?: number; at?: 'feet' | 'front'; elite?: boolean; on?: boolean };

export type UiKind = 'fortune' | 'market' | 'station' | 'proc' | 'chest' | 'bed' | 'device' | 'altar' | 'den' | 'waystone' | 'dock' | 'hatchery' | 'wish' | 'mail' | 'vane' | 'table' | 'tower';

/** Things that happened — clients turn them into FX, floating text and banners. */
/** One farmer's luck: the daily free spin, the spin price, the jackpot and crate pity, and the coin prize they may still gamble. */
export interface FortuneState {
    fd: number;       // the day the free spin was last used
    pd: number;       // the day `pn` counts paid spins for
    pn: number;       // paid spins that day
    pity: number;     // paid spins since the last jackpot
    cpity: number;    // crates opened since the last epic find
    last: number;     // the coin prize that can still be doubled
    chain: number;    // doubles in a row
    n: number;        // rolls made so far (each roll seeds its own dice from this)
}

export type SimEvent =
    | { e: 'fx'; fx: Action; x: number; y: number; by?: string; pitch?: number }
    | { e: 'float'; x: number; y: number; text: string; color?: number; to?: string; key?: string }
    | { e: 'banner'; text: string; sub?: string; color?: number; to?: string }
    | { e: 'pickup'; id: number; by: string; res: Res }
    | { e: 'swing'; by: string; x: number; y: number; w?: WeaponType; px?: number; py?: number }
    /** A tower fired (sim/defense.ts): an arrow, a ballista bolt or a Tesla's zap from `x,y` through the points in `to` (the hit lands at once). */
    | { e: 'shot'; k: 'arrow' | 'bolt' | 'zap'; x: number; y: number; to: [number, number][]; fx?: 'fire' | 'frost'; big?: 1 }
    | { e: 'ways'; to: string; from: number; list: { id: number; x: number; y: number; plot: number; by?: string }[] }
    | { e: 'chat'; by: string; name: string; text: string; color: number }
    /** The season wish vote changed (opened, a vote came in, it was decided). */
    | { e: 'wish'; wish: WishState }
    /** A line was written in the farm chronicle. */
    | { e: 'chron'; entry: ChronEntry }
    | { e: 'emote'; by: string; id: number; x: number; y: number }
    | { e: 'ping'; by: string; name: string; x: number; y: number; color: number }
    /** A pod flies from `px,py` to a creature at `x,y`; `ok` is how it will end. */
    | { e: 'pod'; by: string; id: number; px: number; py: number; x: number; y: number; ok: boolean; pod: string }
    /** A den worker does a bit of work at `x,y`. */
    | { e: 'work'; id: number; kind: WorkKind; x: number; y: number }
    /** A creature hops for joy (it was petted, or the fire it sits at was kindled). */
    | { e: 'hop'; id: number; x: number; y: number }
    /** A warning on the ground: red until it resolves after `t` seconds. */
    | { e: 'tele'; shape: 'circle' | 'line' | 'cone' | 'ring'; x: number; y: number; r: number; t: number; a?: number; len?: number; kind?: 'frost' | 'hex' | 'chain' }     // (`kind`: the co-op patterns are drawn in their own colour)
    | { e: 'knock'; to: string; vx: number; vy: number; soft?: 1 }                // (`soft`: a pull, not a blow: no flash)
    | { e: 'toast'; to: string; text: string; icon?: string; color?: number }
    /** Loot to show off: the reveal screen. `src` says where it came from; `rare` is the best rarity in it (0–4); each item carries its rarity as the third number. */
    | { e: 'loot'; to: string; src: 'crate' | 'bottle' | 'dig' | 'wheel'; tier?: string; items: [Res, number, number][]; rare: number; text?: string }
    /** The wheel stopped: where, what it pays, and what you can do next. */
    | { e: 'spin'; to: string; seg: number; items: [Res, number, number][]; gamble: number; chain: number; free: boolean; price: number; jackpot?: boolean }
    /** A double-or-nothing came out: `win` says which. */
    | { e: 'gamble'; to: string; win: boolean; coins: number; chain: number; next: number }
    /** The story moves on: the card for the chapter you finished and the one you start. */
    | { e: 'story'; to: string; ch: number }
    | { e: 'open'; to: string; ui: UiKind; id: number }
    /** You landed something: the card the HUD shows. */
    | { e: 'catch'; to: string; item: ItemId; size?: number; isNew: boolean; best: boolean; junk?: boolean; double?: boolean }
    /** An expedition is over: the summary the results screen shows. */
    | { e: 'riftend'; to: string; win: boolean; tier: number; wave: number; waves: number; kills: number; secs: number; coins: number; xp: number; loot: [ItemId, number][]; points: number; first: boolean; boons: string[]; endless?: boolean; bonus?: number; daily?: number };
