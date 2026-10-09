// One-line explanations of the automation buildings: what each one does (hover tooltips in the world) and how it
// is used (the Build menu), with a tiny example floor plan where a picture says it faster. Numbers that the rules
// decide (tunnel reach, pole range, power made) are read from the same constants the simulation uses, so they cannot drift.

import { TUNING } from '../config';
import { SUPPLY, WIRE_RANGE } from '../sim/power';
import { TUNNEL_RANGE } from '../sim/factory';
import type { BlueprintItem } from '../sim/types';
import { BUILDINGS, type BuildingKind } from './buildings';

/** The key that toggles the Factory view (the HUD listens for it; the guide and the Controls list name it). */
export const FACTORY_VIEW_KEY = 'L';

interface HowTo {
    /** What it does, in a few words (the hover tooltip). */
    role: string;
    /** How you use it, in one line (the Build menu). */
    how: string;
    /** A little floor plan: pieces, and captions over some of them (by index). */
    example?: { items: BlueprintItem[]; marks: { i: number; t: string }[] };
}

const P = (kind: BuildingKind, dx: number, dy: number, rot = 0, extra: Partial<BlueprintItem> = {}): BlueprintItem => ({ kind, dx, dy, rot, ...extra });
const lineOf = (machine: BuildingKind): HowTo['example'] => ({
    items: [P('chest', 0, 0), P('inserter', 1, 0), P(machine, 2, 0), P('inserter', 3, 0), P('chest', 4, 0)],
    marks: [{ i: 0, t: 'in' }, { i: 4, t: 'out' }],
});
const wind = BUILDINGS.windturbine.gen!;

export const HOWTO: Partial<Record<BuildingKind, HowTo>> = {
    belt: {
        role: 'Carries items one tile at a time', how: 'Drag to lay a line from a drill or inserter to a chest or machine. R turns it.',
        example: { items: [P('drill', 0, 0), P('belt', 2, 0), P('belt', 3, 0), P('chest', 4, 0)], marks: [{ i: 0, t: 'ore' }, { i: 3, t: 'ore' }] },
    },
    splitter: {
        role: 'Shares a belt three ways', how: 'Put it in a belt line: items leave forward, left and right in turn. A side with nothing there is skipped.',
        example: { items: [P('belt', 0, 1), P('splitter', 1, 1), P('chest', 2, 1), P('chest', 1, 0), P('chest', 1, 2)], marks: [{ i: 1, t: 'splits' }] },
    },
    sorter: {
        role: 'Sends one item straight on, the rest aside', how: 'Put it in a belt line and press E to pick an item: that item goes straight on, everything else turns off the sides.',
        example: { items: [P('belt', 0, 1), P('sorter', 1, 1, 0, { flt: 'iron' }), P('chest', 2, 1), P('chest', 1, 2)], marks: [{ i: 2, t: 'iron' }, { i: 3, t: 'the rest' }] },
    },
    tunnel: {
        role: 'Dives a belt underground', how: `Place the entrance, then an exit facing the same way up to ${TUNNEL_RANGE} tiles ahead: items pass under anything between.`,
        example: { items: [P('belt', 0, 0), P('tunnel', 1, 0), P('chest', 3, 0), P('tunnelx', 5, 0), P('belt', 6, 0)], marks: [{ i: 1, t: 'in' }, { i: 3, t: 'passes under' }, { i: 4, t: 'out' }] },
    },
    tunnelx: {
        role: 'Where an underground belt comes up', how: `Face it the same way as its entrance, in line and up to ${TUNNEL_RANGE} tiles away. Click the entrance to check they are linked.`,
        example: { items: [P('belt', 0, 0), P('tunnel', 1, 0), P('chest', 3, 0), P('tunnelx', 5, 0), P('belt', 6, 0)], marks: [{ i: 1, t: 'in' }, { i: 4, t: 'out' }] },
    },
    inserter: {
        role: 'Moves items from behind it to in front', how: 'Picks up from the tile behind, drops on the tile in front: chests, belts and machines. Needs power. R turns it.',
        example: { items: [P('chest', 0, 0), P('inserter', 1, 0), P('furnace', 2, 0)], marks: [{ i: 0, t: 'picks from' }, { i: 2, t: 'drops into' }] },
    },
    drill: {
        role: 'Mines the ore under it for ever', how: 'Put it on coloured ore. Needs power, and a belt, chest or inserter on the tile in front (the arrow shows the front).',
        example: { items: [P('drill', 0, 0), P('chest', 2, 0)], marks: [{ i: 0, t: 'on ore' }, { i: 1, t: 'ore' }] },
    },
    assembler: {
        role: 'Builds parts from what it is fed', how: 'Needs power. Press E, pick what to build, then feed it from a chest with an inserter and empty it the same way.',
        example: { items: [P('chest', 0, 0), P('inserter', 1, 0), P('assembler', 2, 0), P('inserter', 4, 0), P('chest', 5, 0)], marks: [{ i: 0, t: 'bars' }, { i: 4, t: 'gears' }] },
    },
    furnace: {
        role: 'Smelts ore into bars', how: 'Press E to load ore and fuel by hand, or have an inserter feed it from a chest that holds ore and coal.',
        example: lineOf('furnace'),
    },
    sawmill: {
        role: 'Turns logs into planks', how: 'Feed it logs by hand (E) or with an inserter; planks come out of it the same way.',
        example: { items: [P('chest', 0, 0), P('inserter', 1, 0), P('sawmill', 2, 0), P('inserter', 4, 0), P('chest', 5, 0)], marks: [{ i: 0, t: 'wood' }, { i: 4, t: 'planks' }] },
    },
    millstone: {
        role: 'Grinds wheat into flour', how: 'Feed it wheat by hand (E) or with an inserter; flour comes out. It needs no fuel and no power.',
        example: lineOf('millstone'),
    },
    pole: {
        role: 'Wires machines to a power grid', how: `Place it within ${SUPPLY} tiles of machines and within ${WIRE_RANGE} tiles of the next pole. Poles that reach each other form one grid.`,
        example: { items: [P('windturbine', 0, 0), P('pole', 2, 1), P('inserter', 3, 1), P('drill', 4, 0)], marks: [{ i: 0, t: 'makes' }, { i: 1, t: 'wires' }, { i: 3, t: 'uses' }] },
    },
    windturbine: {
        role: 'Makes free power from the wind', how: `Free power, up to ${wind} units as the wind blows. Put a Power Pole within ${SUPPLY} tiles so it goes somewhere.`,
        example: { items: [P('windturbine', 0, 0), P('pole', 2, 1), P('inserter', 3, 1)], marks: [{ i: 0, t: 'makes' }, { i: 1, t: 'wires' }, { i: 2, t: 'uses' }] },
    },
    solar: {
        role: 'Makes free power in daylight', how: 'Power by day, nothing at night: put a Battery on the same grid to carry it through.',
        example: { items: [P('solar', 0, 0), P('pole', 2, 1), P('battery', 3, 1)], marks: [{ i: 0, t: 'by day' }, { i: 2, t: 'at night' }] },
    },
    battery: {
        role: 'Stores spare power', how: 'Fills when the grid has spare power and gives it back when it runs short. Pair it with solar panels.',
        example: { items: [P('solar', 0, 0), P('pole', 2, 1), P('battery', 3, 1)], marks: [{ i: 0, t: 'by day' }, { i: 2, t: 'at night' }] },
    },
    coalgen: {
        role: 'Makes steady power from fuel', how: `Burns coal, wood or peat for ${BUILDINGS.coalgen.gen} units. Fuel it (E): it only burns while something on the grid is working.`,
        example: { items: [P('coalgen', 0, 0), P('pole', 2, 1), P('inserter', 3, 1)], marks: [{ i: 0, t: 'burns coal' }, { i: 1, t: 'wires' }] },
    },
    chute: {
        role: 'Sells whatever arrives for coins', how: `A belt or inserter feeding it sells everything at ${Math.round(TUNING.chuteCut * 100)}% of the market price, paid to you. Press E to sell just one item.`,
        example: { items: [P('drill', 0, 0), P('belt', 2, 0), P('belt', 3, 0), P('chute', 4, 0)], marks: [{ i: 0, t: 'ore' }, { i: 3, t: 'coins' }] },
    },
    chest: {
        role: 'Stores items', how: `Holds ${BUILDINGS.chest.storage} things. Inserters and drills fill and empty it; Sort & label (E) sets what it takes.`,
        example: { items: [P('belt', 0, 0), P('chest', 1, 0), P('inserter', 2, 0), P('furnace', 3, 0)], marks: [{ i: 1, t: 'stores' }] },
    },
    steelchest: {
        role: 'Stores lots of items', how: `Holds ${BUILDINGS.steelchest.storage} things. Inserters and drills fill and empty it, just like a chest.`,
    },
    uberchest: {
        role: 'One store, everywhere', how: `Every Uber Chest opens the same store, shared by the farm; each one adds ${BUILDINGS.uberchest.storage} room. Inserters and creatures use it like any chest.`,
    },
    // ── base defense (sim/defense.ts): raids come from the Blight nests at night ──
    tower_archer: {
        role: 'Shoots the nearest monster in range', how: `Build it behind a wall: an arrow every ${TUNING.blight.archer.every} s at a monster within ${Math.round(TUNING.blight.archer.range / 16)} tiles. Its kills are yours, and it levels up from them: use it to choose an upgrade. Hurt towers and walls mend slowly by themselves; use one to repair it faster for materials.`,
        example: { items: [P('wall_stone', 0, 0), P('wall_stone', 0, 1), P('wall_stone', 0, 2), P('tower_archer', 1, 1), P('spike', -1, 1)], marks: [{ i: 3, t: 'shoots' }, { i: 4, t: 'bites' }] },
    },
    ballista: { role: 'A heavy bolt at long range', how: `A slow, hard-hitting bolt every ${TUNING.blight.ballista.every} s at a monster up to ${Math.round(TUNING.blight.ballista.range / 16)} tiles away. Put it behind a wall. It levels up as it kills: use it to choose an upgrade.` },
    tesla: {
        role: 'Zaps monsters, the bolt leaps on', how: `Needs power: a pole within ${SUPPLY} tiles on a grid with a generator. Its bolt leaps to ${TUNING.blight.tesla.chain - 1} more monsters nearby. It levels up as it kills: use it to choose an upgrade.`,
        example: { items: [P('windturbine', 0, 0), P('pole', 2, 1), P('tesla', 3, 1)], marks: [{ i: 0, t: 'power' }, { i: 2, t: 'zaps' }] },
    },
    spike: { role: 'Hurts monsters that walk over it', how: 'Drag a line of spikes in front of your walls: every monster that crosses gets bitten. You walk over them safely. Spikes level up from their bites too: use one to choose an upgrade.' },
    wall_fort: { role: 'The toughest wall raiders face', how: `Iron-bound stone with ${TUNING.blight.hp.fortified} hit points (wood has ${TUNING.blight.hp.wood}). Joins up with other walls; mends at dawn.` },
};
