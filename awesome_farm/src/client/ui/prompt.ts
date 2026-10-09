// The bottom line: what E (or USE) would do right now, in key names on a computer and button names on a phone.
// A pure string builder over what the Game scene knows; it never touches Phaser.

import { BIOME_DEFS, MODS } from '../../shared/data/biomes';
import { BUILDINGS, BuildingKind, CROPS, STATION_NAMES } from '../../shared/data/buildings';
import { spOf } from '../../shared/data/creatures';
import { ITEMS } from '../../shared/data/items';
import { NODES } from '../../shared/data/nodes';
import { NEST_KINDS } from '../../shared/data/mobs';
import { petsFirstAt } from '../../shared/data/bond';
import { pending } from '../../shared/data/towerperks';
import { maxHp } from '../../shared/sim/defense';
import { hasRod } from '../../shared/sim/fishing';
import * as potluck from '../../shared/sim/potluck';
import { hasUnlock } from '../../shared/sim/stats';
import type { PlayerView } from '../../shared/net/protocol';
import type { BuildE, PlayerS } from '../../shared/sim/types';
import type { World } from '../../shared/world';
import { isLinePiece, isOneOff, type Placing } from '../world/placing';
import type { Near, Target } from '../world/interact';
import { isTouchUi, keyLabel } from '../input/layout';
import { touchWords } from './gestures';

/** The bottom line beside a building that has no station, machine, storage or grave rule of its own (`hold`: the dismantle hint). */
const PROMPTS: Partial<Record<BuildingKind, (b: BuildE, hold: string) => string>> = {
    bed: (b, hold) => (b.crop === 2 ? 'E: Harvest' : (b.crop ?? -1) >= 0 ? `Growing ${b.plant ? CROPS[b.plant]?.name : ''}…${hold}` : `E: Plant a seed${hold}`),
    mineshaft: (_b, hold) => `E: Climb down the shaft${hold}`,
    mineladder: () => 'E: Climb up to the surface',
    market: (_b, hold) => `E: Trade${hold}`,
    fortune: (_b, hold) => `E: Spin the Fortune Wheel${hold}`,
    dock: (_b, hold) => `E: Plan an expedition${hold}`,
    hatchery: (b, hold) => (b.egg ? `E: Hatch the egg${hold}` : b.par ? `An egg is forming…${hold}` : `E: Breed two creatures${hold}`),
    campfire: (_b, hold) => `Campfire — monsters keep away${hold}`,
    weathervane: (_b, hold) => `E: Read the forecast${hold}`,
    chute: (_b, hold) => `E: Inspect Export Chute${hold}`,
};

/** What the prompt is built from: the farmer, what is in hand, what is near, and a few answers only the world view has. */
export interface PromptHost {
    readonly meS: PlayerS;
    readonly placing: Placing | null;
    /** The blueprint tool's own line while it is active, else null. */
    bpPrompt (): string | null;
    readonly near: Near;
    readonly target: Target | null;
    readonly world: World;
    readonly clock: { time: number };
    readonly players: Record<string, PlayerView>;
    readonly derived: { toolTier: number; reach: number; landMul: number };
    /** The rift gate you stand at on an expedition, or -1. */
    gateNear (): number;
    distToBuilding (b: BuildE): number;
    /** The line about petting your companion, or ''. */
    petPrompt (): string;
    /** Is there open water within casting range straight ahead? */
    canCast (): boolean;
    podFor (sp: string): { pod: 'pod' | 'pod_great' | 'pod_ultra'; chance: number } | null;
}

/** The bottom-of-screen prompt, in key names, or in button names on a phone. */
export function computePrompt (h: PromptHost): string {
    if (isTouchUi() && h.placing && h.meS.downed <= 0) return touchPlacingPrompt(h.placing);
    const t = promptText(h);
    if (!isTouchUi()) return t;
    return touchWords(t.replace(/^E: /, 'USE: ').replace('Hold E:', 'Hold USE:').replace('T: Throw', 'POD: Throw')
        .replace('hold X: dismantle', 'hold REMOVE').replace('Hold X: take down', 'Hold REMOVE: take down'));
}

/** What the bottom line says on a phone while a building is in hand: the buttons and taps, and why a red ghost is red. */
function touchPlacingPrompt (pl: Placing): string {
    const turn = BUILDINGS[pl.kind].dir ? '  ·  TURN: rotate' : '';
    if (pl.pin && pl.why) return `${pl.why}  ·  tap another tile`;
    if (isLinePiece(pl.kind)) return `Tap or drag to lay it${turn}  ·  CANCEL: stop`;
    if (pl.pin) return `Tap it again (or USE) to place it${turn}`;
    return `Tap a tile to aim, tap it again (or USE) to place${turn}`;
}

function promptText (h: PromptHost): string {
    const me = h.meS, pl = h.placing;
    if (me.downed > 0) return '';
    if (me.fishing) return '';
    if (pl) return isTouchUi() ? touchPlacingPrompt(pl) : `Click / Space: place${isOneOff(pl.kind) ? '' : ', and keep placing'}${BUILDINGS[pl.kind].dir ? '  ·  R: rotate' : ''}  ·  right-click / Esc: stop`;
    const bp = h.bpPrompt();
    if (bp !== null) return bp;
    const n = h.near, friend = n.friend;
    if (friend) return friend.downed > 0 ? `Hold E: help ${friend.name} up` : `Hold E: thaw ${friend.name}`;
    if (h.gateNear() >= 0) return me.rift?.ph === 3 ? 'E: Return to the dock' : me.rift && !me.rift.waves ? 'E: Cash out and leave the Abyss' : 'E: Leave the expedition (you keep what you earned)';
    const wild = n.wild;
    if (wild) {
        const def = spOf(wild.sp);
        const pick = h.podFor(wild.sp);
        if (pick) return `T: Throw ${ITEMS[pick.pod].name} at ${def.name} Lv${wild.lv}  (${Math.round(pick.chance * 100)}%)`;
        return hasUnlock(me, 'taming') ? `A wild ${def.name}! Craft Taming Pods at a Workbench` : `A wild ${def.name}! Learn Taming (K) to befriend it`;
    }
    const t = h.target, d = h.derived;
    if (t?.kind === 'ent' && t.ent.k === 'node') {
        const def = NODES[t.ent.kind];
        if (def.minTier !== undefined && d.toolTier < def.minTier) return `${def.name} — needs a better pick`;
        if (t.ent.kind === 'nest') { const pl = h.world.plots[t.ent.plot]; return `${pl?.nk ? NEST_KINDS[pl.nk].name : def.name} Lv ${pl?.nl ?? 1}: swing your weapon to destroy it`; }
    }
    if (t?.kind === 'rock') {
        const ore = h.world.oreAt(t.tx, t.ty);
        if (ore === 'crystal' && d.toolTier < 2) return 'Crystal in the rock — needs a better pick';
        return ore ? `${ITEMS[ore].name} in the rock: hold to dig` : 'Rock: hold to dig';
    }
    const b = n.bld;
    const pet = h.petPrompt();
    if (b && pet && petsFirstAt(b.kind)) return `${pet}  ·  hold X: dismantle`;
    if (b) {
        const def = BUILDINGS[b.kind];
        const hold = '  ·  hold X: dismantle';
        if (def.station) return `E: Use ${STATION_NAMES[def.station]}${hold}`;
        if (def.proc) return `E: Open ${def.name}${(b.prog ?? 0) > 0 ? ' (working…)' : ''}${hold}`;
        if (def.grave) return `E: Take your things back${hold}`;
        if (def.storage) return `E: Open ${def.name}${hold}`;
        if (b.kind === 'table') return `E: ${potluck.promptOf(me, b, h.clock.time, (id) => potluck.cookName(h.players, id))}${h.distToBuilding(b) < d.reach + 6 ? hold : ''}`;
        if (def.tower || def.spike) return `E: ${pending(b) > 0 ? 'Choose an upgrade' : def.name}${b.hp !== undefined ? ` (${Math.ceil(b.hp)} / ${maxHp(b)})` : ''}${hold}`;
        if (b.kind === 'sleepbed') return b.id === me.bed ? `Your bed: you wake up here after a fall${hold}` : `E: Sleep here (wake up here after a fall)${hold}`;
        const say = PROMPTS[b.kind];
        if (say) return say(b, hold);
        return `${def.dir || def.pole || def.gen || b.kind === 'drill' ? 'E: Inspect ' : ''}${def.name}${hold}`;
    }
    if (hasRod(me) && !n.plot && h.canCast()) return `${keyLabel('KeyQ')}: Cast your line`;
    const plot = n.plot;
    if (plot) {
        const name = BIOME_DEFS[plot.biome].name + (plot.mod ? ` · ${MODS[plot.mod].name}` : '');
        const price = Math.max(1, Math.round(h.world.price(plot, me.plotsBought) * d.landMul));
        return `E: Buy ${name} (${price} coins)`;
    }
    // pointing at a wall or doorway: say how to take it down
    if (pet) return pet;
    const piece = n.aimed;
    if (piece && (BUILDINGS[piece.kind].wall || BUILDINGS[piece.kind].gate)) return `Hold X: take down the ${BUILDINGS[piece.kind].name}${BUILDINGS[piece.kind].gate ? '' : ' (you get most of it back)'}`;
    return '';
}
