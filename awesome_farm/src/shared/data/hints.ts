// First-time hints: the first time you stand at the water with a rod, fill your pockets, find a pack, or lay
// your first floor, a short toast says what to do next and points at the guide (H). Each hint is shown once
// per browser and never while a window is open or you are down. The runner is plain logic: the client gives it
// somewhere to remember what was shown (localStorage) and the names of the player's keys.

import { TUNING } from '../config';
import { PAL } from '../palette';
import { ITEM_ORDER, ITEMS } from './items';
import { hasRod } from '../sim/fishing';
import { petsOf } from '../sim/petlib';
import { countOf, hasUnlock, itemCap } from '../sim/stats';
import type { PlayerS } from '../sim/types';

const FLOORS = ['planks', 'brickfloor', 'slatefloor', 'carpet', 'path'];

interface HintCtx {
    me: PlayerS;
    /** The bottom-of-screen prompt: "Q: Cast your line" when you stand at casting distance from water. */
    prompt: string;
    /** A monster close to you is winding up an attack (a boss's red warning, a charger crouching). Optional: the hint for the Perfect dash waits for it. */
    windup?: boolean;
    /** A Titan node (a Great Oak, a Titan Boulder) is close to you. Optional, like `windup`. */
    titan?: boolean;
    /** Your own companion walks beside you, close enough to pet. */
    petNear?: boolean;
    /** Rain still to come: 0 later today, 1 tomorrow, null (or left out) none in sight. */
    rain?: 0 | 1 | null;
    /** The dusk countdown is on (or it is night): only a hint about what is happening right now may speak. Optional. */
    alarm?: boolean;
}

/** The player's real keys, for text. */
interface HintKeys { fish: string }

interface Hint {
    id: string; icon: string; color?: number;
    text: (c: HintCtx, k: HintKeys) => string;
    when: (c: HintCtx) => boolean;
    /** About something happening to you right now (frozen, hexed, a titan in front of you): may speak during the dusk alarm. */
    now?: boolean;
}

const fullStack = (me: PlayerS) => ITEM_ORDER.find((id) => ITEMS[id].kind !== 'gear' && countOf(me, id) > 0 && countOf(me, id) >= itemCap(me, id));

export const HINTS: Hint[] = [
    {
        id: 'fish', icon: 'i_rod', color: PAL.foam,
        when: (c) => hasRod(c.me) && c.prompt.includes('Cast your line'),
        text: (_c, k) => `Fishing: press ${k.fish} to cast, then ${k.fish} again the moment a ! appears. More in the guide (H).`,
    },
    {
        id: 'full', icon: 'k_bag', color: PAL.gold,
        when: (c) => !c.me.equip.bag && !!fullStack(c.me),
        text: (c) => `Your pockets are full of ${ITEMS[fullStack(c.me)!].name}. A Satchel (Workbench) lets you carry more, and a chest holds a lot.`,
    },
    // co-op boss statuses (sim/costatus.ts): the first time one lands on you, or a friend needs thawing
    {
        id: 'frozen', icon: 'i_frostshard', color: PAL.foam, now: true,
        when: (c) => c.me.co?.k === 'frozen',
        text: () => 'Frozen solid! Nothing can hurt you, but you cannot move until a friend thaws you: they stand next to you and hold E. If nobody comes, you thaw by yourself.',
    },
    {
        id: 'thaw', icon: 'i_frostshard', color: PAL.lime, now: true,
        when: (c) => c.prompt.includes(': thaw '),                      // ("Hold E: thaw Bo", or "Hold USE: thaw Bo" on a phone)
        text: () => 'A friend is frozen! Stand next to them and hold E: it takes about a second and a half to thaw them.',
    },
    {
        id: 'hexed', icon: 'i_ectoplasm', color: PAL.plum, now: true,
        when: (c) => c.me.co?.k === 'hexed',
        text: () => 'Hexed! The curse hurts a little more every second. Stand next to a friend for a moment and it jumps to them, then keep moving.',
    },
    {
        id: 'chained', icon: 'k_lock', color: PAL.gold, now: true,
        when: (c) => c.me.co?.k === 'tether',
        text: () => `Chained to a friend! Stay within ${TUNING.coop.chainTiles} tiles of each other, or the chain pulls and hurts you both.`,
    },
    {
        id: 'pack', icon: 'k_bag', color: PAL.lime,
        when: (c) => !c.me.equip.bag && ITEM_ORDER.some((id) => id.startsWith('bag_') && countOf(c.me, id) > 0),
        text: () => 'You have a pack! Open your Backpack (I) and click it to wear it: you can carry more of everything.',
    },
    {
        id: 'house', icon: 'k_hammer', color: PAL.pumpkin,
        when: (c) => FLOORS.some((k) => (c.me.cnt?.[`build:${k}`] ?? 0) > 0),
        text: () => 'A floor is the start of a house: Build (B) has walls, a doorway and a roof. More in the guide (H).',
    },
    {
        id: 'crate', icon: 'i_crate_wood', color: PAL.gold,
        when: (c) => ITEM_ORDER.some((id) => !!ITEMS[id].open && countOf(c.me, id) > 0),
        text: () => 'You have a crate! Open your Backpack (I) and click it to see what is inside. More in the guide (H).',
    },
    {
        id: 'post', icon: 'k_paw', color: PAL.lime,
        // (only while no creature has any job at all: a post, a den, or a task it does beside you)
        when: (c) => petsOf(c.me).length >= 2 && !petsOf(c.me).some((p) => p.post || p.den !== undefined || p.task),
        text: () => 'Your creatures can work for you: press P, pick one and choose Give a job… to put it on an island or at a furnace. More in the guide (H).',
    },
    {
        id: 'mailbox', icon: 'k_flag', color: PAL.sea,
        when: (c) => c.me.level >= 3 && !(c.me.cnt?.['build:mailbox'] ?? 0),
        text: () => 'Build a Mailbox (B, Storage): friends can leave you parcels, and the island folk send you a postcard with a small present every morning.',
    },
    {
        id: 'potluck', icon: 'i_stew', color: PAL.gold,
        when: (c) => (c.me.cnt?.['build:table'] ?? 0) > 0 && !(c.me.cnt?.feast ?? 0) && ITEM_ORDER.some((id) => !!ITEMS[id].buff && countOf(c.me, id) > 0),
        text: () => 'Your Table is waiting for a potluck: press E at it and set out a dish. Everyone who presses E there eats a portion of every dish at once, each with its cook’s name.',
    },
    {
        id: 'chronicle', icon: 'k_book', color: PAL.gold,
        when: (c) => c.me.plotsBought >= 1 || c.me.level >= 5,
        text: () => 'Your farm writes its own story: big moments are saved in the Journal (J), on the Chronicle tab.',
    },
    {
        id: 'perfect', icon: 'k_boot', color: PAL.foam, now: true,
        when: (c) => hasUnlock(c.me, 'dash') && !!c.windup,
        text: () => 'Dash through an attack at the last moment for a Perfect dash: your energy comes back and your next hit is a critical one.',
    },
    {
        id: 'titan', icon: 'i_wood', color: PAL.gold, now: true,
        when: (c) => !!c.titan,
        text: () => 'A Titan! It only breaks when two farmers hit it within three seconds of each other. Bring a friend: everyone who helps gets a big share, and more with more hands.',
    },
    {
        id: 'pat', icon: 'k_heart', color: PAL.blossom,
        when: (c) => !!c.petNear && !!c.me.comp,
        text: () => 'Press E next to your companion to pet it: it grows fonder, and a fond one digs up a gift each day (guide: H).',
    },
    {
        id: 'chute', icon: 'k_coin', color: PAL.gold,
        when: (c) => (c.me.cnt?.['build:chute'] ?? 0) > 0,
        text: () => `Export Chute: point a belt or an inserter at it and it sells what arrives, ${Math.round(TUNING.chuteCut * 100)}% of the market price, straight into your pocket. Press E to sell only one item.`,
    },
    {
        id: 'vane', icon: 'k_rain', color: PAL.foam,
        when: (c) => (c.me.cnt?.['build:weathervane'] ?? 0) > 0,
        text: () => 'Weather Vane: press E on it to read the next three days: rain, fog and the night to come. The little picture over it is tomorrow. More in the guide (H).',
    },
    {
        id: 'raid', icon: 'k_tower', color: PAL.berry, now: true,
        when: (c) => (c.me.cnt?.raid ?? 0) > 0,
        text: () => 'A raid from a Blight nest! Raiders break the walls in their way (stone holds longer than wood, and what they hurt mends at dawn). Wall your base in and fight them at the walls, or go and break the nest.',
    },
    {
        id: 'bedset', icon: 'k_heart', color: PAL.blossom,
        when: (c) => (c.me.cnt?.['build:sleepbed'] ?? 0) > 0,
        text: () => 'Your Bed is where you wake up now after a fall, instead of at home. Press E on any bed to make it yours.',
    },
    {
        id: 'rain', icon: 'k_rain', color: PAL.sea,
        when: (c) => c.rain != null && (c.me.cnt?.['build:bed'] ?? 0) > 0 && (c.me.cnt?.['build:weathervane'] ?? 0) === 0,
        text: (c) => `Rain ${c.rain === 0 ? 'is coming later today' : 'is coming tomorrow'}: crops grow up to ${Math.round(TUNING.rainGrow * 100)}% faster while it falls. A Weather Vane (Build, Decor) shows the next three days.`,
    },
];

export interface HintStore { load (): string[]; save (ids: string[]): void }

export class Hints {
    private seen: Set<string>;
    private t = 4;
    private cool = 0;

    /** `alarm`: is the dusk countdown on right now (when the context does not say)? Hints about later things then wait. */
    constructor (private toast: (text: string, icon?: string, color?: number) => void, private store: HintStore, private keys: () => HintKeys, private alarm: () => boolean = () => false) {
        this.seen = new Set(store.load());
    }

    /** Is a hint's toast still fresh? (The tips wait for it.) */
    get cooling () { return this.cool > 0; }

    /** Called every frame; looks around twice a second. `quiet` is true while a window is open or you are down. */
    update (dt: number, c: HintCtx, quiet: boolean) {
        this.cool = Math.max(0, this.cool - dt);
        this.t -= dt;
        if (this.t > 0) return;
        this.t = 0.5;
        if (quiet || this.cool > 0) return;
        const alarm = c.alarm ?? this.alarm();
        const h = HINTS.find((x) => !this.seen.has(x.id) && (!alarm || x.now) && x.when(c));
        if (!h) return;
        this.seen.add(h.id);
        this.store.save([...this.seen]);
        this.cool = 25;
        this.toast(h.text(c, this.keys()), h.icon, h.color);
    }
}
