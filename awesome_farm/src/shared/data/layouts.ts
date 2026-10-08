// Starter layouts ("Factory 101"): small, working production lines that go down in one click through the
// ordinary blueprint paste (so costs, range, unlock tokens and placement rules all still apply). The Blueprint
// screen (V) lists them; `tests/layouts.test.ts` builds every one in a real Sim and checks the product appears.
//
// Coordinates are tiles from the layout's top-left corner; `rot` is 0 east, 1 south, 2 west, 3 north.
// To add one: write its pieces below, add a row to STARTER_LAYOUTS, then add its proof to tests/layouts.test.ts.

import { TUNING } from '../config';
import { BUILDINGS, type BuildingKind } from './buildings';
import type { Blueprint } from '../blueprint';
import type { BlueprintItem } from '../sim/types';

export interface StarterLayout {
    id: string;
    name: string;
    /** A building texture shown beside the name. */
    icon: string;
    /** One line: what it does. */
    what: string;
    /** One line: what you need before you place it (on top of the materials, which the window adds up). */
    need: string;
    /** One line: where to put it. */
    where: string;
    /** One line: the first thing to do once it stands. */
    then: string;
    /** Short captions drawn over pieces in the preview: which chest to fill, where the product lands. */
    marks: { i: number; t: string }[];
    items: BlueprintItem[];
}

const P = (kind: BuildingKind, dx: number, dy: number, rot = 0, extra: Partial<BlueprintItem> = {}): BlueprintItem => ({ kind, dx, dy, rot, ...extra });

/** The wind turbine and pole that power a layout: the pole's supply square (3 tiles each way) reaches both. */
const power = (poleX: number, poleY: number, turbines: [number, number][]): BlueprintItem[] => [
    P('pole', poleX, poleY),
    ...turbines.map(([x, y]) => P('windturbine', x, y)),
];

/** chest -> inserter -> machine -> inserter -> chest, with power: the shape most of the layouts share. */
const line = (machine: BuildingKind, extra: Partial<BlueprintItem> = {}): BlueprintItem[] => [
    P('chest', 0, 0), P('inserter', 1, 0), P(machine, 2, 0, 0, extra), P('inserter', 3, 0), P('chest', 4, 0),
    ...power(2, 2, [[3, 2]]),
];

export const STARTER_LAYOUTS: StarterLayout[] = [
    {
        id: 'smelter', name: 'Smelter line', icon: 'furnace',
        what: 'Turns ore into bars by itself: an inserter feeds the furnace, another empties it.',
        need: 'Logistics and Electricity skills, ore and coal (or wood) to put in the left chest.',
        where: 'Anywhere flat, 5 wide and 4 high. Leave the tile in front of the right chest free.',
        then: 'Open the left chest (E) and put in iron ore plus some coal. Bars pile up in the right chest.',
        marks: [{ i: 0, t: 'ore + coal' }, { i: 4, t: 'bars' }],
        items: line('furnace'),
    },
    {
        id: 'flour', name: 'Flour mill', icon: 'millstone',
        what: 'Grinds wheat into flour: two wheat make one flour, no fuel needed.',
        need: 'Logistics and Electricity skills, and wheat from your garden beds.',
        where: 'Anywhere flat, 5 wide and 4 high, near your garden so the wheat is a short walk.',
        then: 'Put wheat in the left chest. Flour collects in the right chest, ready for bread.',
        marks: [{ i: 0, t: 'wheat' }, { i: 4, t: 'flour' }],
        items: line('millstone'),
    },
    {
        id: 'planks', name: 'Plank mill', icon: 'sawmill',
        what: 'A sawmill that turns logs into twice as many planks, around the clock.',
        need: 'Logistics and Electricity skills, and a stack of wood for the left chest.',
        where: 'Anywhere flat, 6 wide and 4 high. It cannot be turned with R (the sawmill is not square).',
        then: 'Put wood in the left chest. Planks collect in the right chest.',
        marks: [{ i: 0, t: 'wood' }, { i: 4, t: 'planks' }],
        items: [
            P('chest', 0, 0), P('inserter', 1, 0), P('sawmill', 2, 0), P('inserter', 4, 0), P('chest', 5, 0),
            ...power(2, 2, [[3, 2]]),
        ],
    },
    {
        id: 'outpost', name: 'Mining outpost', icon: 'drill',
        what: 'A drill mines the ore under it for ever and a belt carries it into a chest.',
        need: 'Logistics, Mining Machines and Electricity skills, and an ore vein to stand it on.',
        where: 'Put the 2×2 drill (the left end) right on an ore patch. The belt and chest run east of it.',
        then: 'Wait a few seconds: the drill needs power, so check its badge. Ore piles up in the chest.',
        marks: [{ i: 0, t: 'on an ore patch' }, { i: 4, t: 'ore' }],
        items: [
            P('drill', 0, 0, 0), P('belt', 2, 0), P('belt', 3, 0), P('belt', 4, 0), P('chest', 5, 0),
            ...power(2, 2, [[3, 2]]),
        ],
    },
    {
        id: 'gears', name: 'Gear cell', icon: 'assembler',
        what: 'An assembler set to Gear: iron bars go in from one chest, gears come out into the other.',
        need: 'Logistics, Electricity and Assembly skills, and iron bars for the left chest.',
        where: 'Anywhere flat, 6 wide and 4 high. Two wind turbines keep the assembler running.',
        then: 'Put iron bars in the left chest (2 per gear). Open the assembler to pick another recipe.',
        marks: [{ i: 0, t: 'iron bars' }, { i: 4, t: 'gears' }],
        items: [
            P('chest', 0, 0), P('inserter', 1, 0), P('assembler', 2, 0, 0, { sel: 'assembler:gear' }), P('inserter', 4, 0), P('chest', 5, 0),
            ...power(1, 2, [[2, 2], [4, 2]]),
        ],
    },
    {
        id: 'sorter', name: 'Sorting belt', icon: 'sorter',
        what: 'Mixed goods ride a belt into a sorter: iron goes straight on, everything else turns off to the side.',
        need: 'Logistics and Electricity skills. A sorter costs a circuit.',
        where: 'Anywhere flat, 6 wide and 5 high. Both end chests must stay in place.',
        then: 'Put iron and something else (copper, stone…) in the left chest. Click the sorter to choose another item.',
        marks: [{ i: 0, t: 'mixed' }, { i: 5, t: 'iron' }, { i: 6, t: 'the rest' }],
        items: [
            P('chest', 0, 1), P('inserter', 1, 1), P('belt', 2, 1), P('belt', 3, 1), P('sorter', 4, 1, 0, { flt: 'iron' }),
            P('chest', 5, 1), P('chest', 4, 2),
            ...power(1, 3, [[2, 3]]),
        ],
    },
    {
        id: 'splitter', name: 'Splitter fan', icon: 'splitter',
        what: 'A splitter shares what arrives on the belt between three chests, taking turns.',
        need: 'Logistics and Electricity skills. A splitter needs two gears.',
        where: 'Anywhere flat, 6 wide and 5 high. A side with no chest is skipped.',
        then: 'Put anything in the left chest and watch the three chests fill evenly.',
        marks: [{ i: 0, t: 'anything' }, { i: 5, t: '1/3' }, { i: 6, t: '1/3' }, { i: 7, t: '1/3' }],
        items: [
            P('chest', 0, 1), P('inserter', 1, 1), P('belt', 2, 1), P('belt', 3, 1), P('splitter', 4, 1),
            P('chest', 5, 1), P('chest', 4, 0), P('chest', 4, 2),
            ...power(1, 3, [[2, 3]]),
        ],
    },
    {
        id: 'export', name: 'Export line', icon: 'chute',
        what: `Sells what you put in the chest: an inserter feeds an Export Chute that pays you in coins, ${Math.round(TUNING.chuteCut * 100)}% of the market price.`,
        need: 'Logistics and Electricity skills, and bars, crops or planks for the chest. Gear, tools and crates stay in the chest.',
        where: 'Anywhere flat, 4 wide and 4 high.',
        then: 'Put things in the chest (E) and watch the coins float up. Open the chute (E) to sell only one item.',
        marks: [{ i: 0, t: 'goods' }, { i: 2, t: 'coins' }],
        items: [
            P('chest', 0, 0), P('inserter', 1, 0), P('chute', 2, 0),
            ...power(1, 2, [[2, 2]]),
        ],
    },
];

export const LAYOUT_BY_ID: Record<string, StarterLayout> = Object.fromEntries(STARTER_LAYOUTS.map((l) => [l.id, l]));

/** A starter layout as a blueprint the paste tool understands. */
export const layoutBlueprint = (l: StarterLayout): Blueprint => ({ id: `starter:${l.id}`, name: l.name, items: l.items.map((it) => ({ ...it })) });

/** The unlock tokens a layout needs (one per skill gate, in a stable order). */
export function layoutReq (l: StarterLayout): string[] {
    return [...new Set(l.items.map((it) => BUILDINGS[it.kind].req).filter((r): r is string => !!r))].sort();
}
