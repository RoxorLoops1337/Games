// Starter layouts ("Factory 101"): every one is placed through the real `bp` command in a real Sim,
// fed, run, and has to make its product. Also checked turned a quarter, with locked skills and with too few materials.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BLUEPRINT_MAX, canTurn, extent, totalCost, turnItems } from '../src/shared/blueprint';
import { TILE } from '../src/shared/config';
import { BUILDINGS } from '../src/shared/data/buildings';
import type { ItemId } from '../src/shared/data/items';
import { ITEMS } from '../src/shared/data/items';
import { LAYOUT_BY_ID, layoutBlueprint, layoutReq, STARTER_LAYOUTS, type StarterLayout } from '../src/shared/data/layouts';
import { RECIPES } from '../src/shared/data/recipes';
import { SKILL_LIST } from '../src/shared/data/skills';
import { Sim } from '../src/shared/sim/sim';
import type { BuildE, BlueprintItem } from '../src/shared/sim/types';

const STEP = 1 / 20;
const run = (sim: Sim, seconds: number) => { for (let t = 0; t < seconds; t += STEP) sim.step(STEP); };

/** A fresh home yard, the skills the layout needs, the materials to build it, and the layout placed with one `bp` command. */
function stage (l: StarterLayout, opts: { turns?: number; skills?: boolean; materials?: number } = {}) {
    const turns = opts.turns ?? 0;
    const sim = Sim.create(`L-${l.id}-${turns}`, 'f');
    const p = sim.join('a', 'A')!;
    for (const e of Object.values(sim.s.ents)) if (e.k === 'node') sim.remove(e.id);
    const o = sim.world.plotOrigin(sim.homePlot(p.slot));
    p.x = (o.tx + 13) * TILE; p.y = (o.ty + 13) * TILE;                // well away from where the layout goes
    if (opts.skills !== false) for (const tok of layoutReq(l)) p.skills[SKILL_LIST.find((s) => s.unlock?.includes(tok))!.id] = 1;
    let items: BlueprintItem[] = l.items;
    for (let i = 0; i < turns; i++) items = turnItems(items);
    for (const k of Object.keys(p.inv)) delete p.inv[k as ItemId];
    for (const [res, n] of Object.entries(totalCost(items)) as [ItemId, number][]) sim.give(p, res, Math.floor(n * (opts.materials ?? 1)));
    const anchor = { tx: o.tx + 3, ty: o.ty + 3 };
    sim.command('a', { t: 'bp', tx: anchor.tx, ty: anchor.ty, items });
    const at = items.map((it) => sim.buildings(it.kind).find((b) => b.tx === anchor.tx + it.dx && b.ty === anchor.ty + it.dy));
    return { sim, p, o, items, anchor, at };
}

interface Proof {
    /** What the farmer puts in the first chest (or the chest at `into`). */
    stock: Partial<Record<ItemId, number>>;
    into?: number;
    secs: number;
    /** Put ore under the drill (the layout cannot know where the veins are). */
    veins?: ItemId;
    /** Look at the pieces (by index into the layout) and assert the product appeared. */
    check: (at: BuildE[]) => void;
}
const inv = (b: BuildE, id: ItemId) => b.inv?.[id] ?? 0;

const PROOFS: Record<string, Proof> = {
    smelter: { stock: { iron: 8, coal: 6 }, secs: 70, check: (a) => { assert.ok(inv(a[4], 'ironbar') >= 4, `iron bars in the right chest: ${inv(a[4], 'ironbar')}`); } },
    flour: { stock: { wheat: 10 }, secs: 60, check: (a) => { assert.ok(inv(a[4], 'flour') >= 3, `flour: ${inv(a[4], 'flour')}`); } },
    planks: { stock: { wood: 8 }, secs: 60, check: (a) => { assert.equal(inv(a[4], 'plank'), 16, 'every log became two planks'); assert.equal(inv(a[0], 'wood'), 0, 'and the first chest is empty'); } },
    outpost: { stock: {}, secs: 90, veins: 'iron', check: (a) => { assert.ok(inv(a[4], 'iron') >= 5, `ore in the chest: ${inv(a[4], 'iron')}`); } },
    export: {
        stock: { ironbar: 10, pick_iron: 1 }, secs: 25,
        check: (a) => {
            const sold = a[2].ch ? a[2].ch.w.reduce((n, c) => n + c, 0) : 0;
            assert.ok(sold >= 50, `the chute paid out ${sold} coins for ten bars (59 are due)`);
            assert.equal(inv(a[0], 'ironbar'), 0, 'the chest emptied into the chute');
            assert.equal(inv(a[0], 'pick_iron'), 1, 'and the pick, which cannot be sold, stayed in it');
        },
    },
    gears: { stock: { ironbar: 12 }, secs: 90, check: (a) => { assert.ok(inv(a[4], 'gear') >= 4, `gears: ${inv(a[4], 'gear')}`); assert.equal(a[2].sel, 'assembler:gear', 'the assembler comes set to Gear'); } },
    sorter: {
        stock: { iron: 6, copper: 6 }, secs: 120,
        check: (a) => {
            assert.equal(inv(a[5], 'iron'), 6, 'all the iron went straight on');
            assert.equal(inv(a[5], 'copper'), 0, 'no copper went straight on');
            assert.equal(inv(a[6], 'copper'), 6, 'the copper turned off to the side chest');
            assert.equal(inv(a[6], 'iron'), 0);
        },
    },
    splitter: {
        stock: { wood: 18 }, secs: 120,
        check: (a) => {
            const shares = [a[5], a[6], a[7]].map((c) => inv(c, 'wood'));
            assert.ok(shares.every((n) => n >= 4), `every chest got a share: ${shares}`);
            assert.equal(shares.reduce((x, y) => x + y, 0), 18, 'and nothing was lost');
        },
    },
};

/** Place, feed, run, check. Returns the sim for further looking. */
function prove (l: StarterLayout, turns = 0) {
    const proof = PROOFS[l.id];
    assert.ok(proof, `${l.id} has a proof`);
    const s = stage(l, { turns });
    assert.equal(s.at.every(Boolean), true, `${l.id} (turned ${turns}): every piece was placed`);
    const at = s.at as BuildE[];
    if (proof.veins) {
        const d = at[0], plot = s.sim.world.plotAt(d.tx, d.ty)!;
        plot.veins = [[d.tx, d.ty, proof.veins], [d.tx + 1, d.ty, proof.veins], [d.tx, d.ty + 1, proof.veins], [d.tx + 1, d.ty + 1, proof.veins]];
    }
    const box = at[proof.into ?? 0];
    for (const [id, n] of Object.entries(proof.stock) as [ItemId, number][]) box.inv![id] = n;
    run(s.sim, proof.secs);
    proof.check(at);
    return s;
}

test('there are at least five starter layouts, each labelled, and every one has a proof below', () => {
    assert.ok(STARTER_LAYOUTS.length >= 5);
    assert.equal(new Set(STARTER_LAYOUTS.map((l) => l.id)).size, STARTER_LAYOUTS.length, 'unique ids');
    for (const l of STARTER_LAYOUTS) {
        assert.ok(PROOFS[l.id], `${l.id} needs an entry in PROOFS`);
        assert.ok(l.name.length >= 4 && l.name.length <= 22, `${l.id}: name fits its row`);
        for (const [k, text] of [['what', l.what], ['need', l.need], ['where', l.where], ['then', l.then]] as const) {
            assert.ok(text.length >= 20 && text.length <= 130, `${l.id}.${k}: one line (${text.length} chars)`);
        }
        assert.ok(BUILDINGS[l.icon as keyof typeof BUILDINGS]?.tex === l.icon, `${l.id}: the icon is a building texture`);
    }
    assert.deepEqual(Object.keys(PROOFS).sort(), STARTER_LAYOUTS.map((l) => l.id).sort(), 'no proof without a layout');
    assert.equal(LAYOUT_BY_ID.smelter.name, 'Smelter line');
});

test('every layout is well formed: real buildings, no overlaps, valid filters and recipes, inside the paste limit', () => {
    for (const l of STARTER_LAYOUTS) {
        assert.ok(l.items.length > 0 && l.items.length <= BLUEPRINT_MAX, `${l.id}: size`);
        const taken = new Map<string, string>();
        for (const it of l.items) {
            const def = BUILDINGS[it.kind];
            assert.ok(def && !def.hidden, `${l.id}: ${it.kind} is a real building`);
            assert.ok(it.dx >= 0 && it.dy >= 0 && Number.isInteger(it.dx) && Number.isInteger(it.dy) && it.rot >= 0 && it.rot <= 3, `${l.id}: ${it.kind} position`);
            for (let y = 0; y < def.size[1]; y++) for (let x = 0; x < def.size[0]; x++) {
                const key = `${it.dx + x},${it.dy + y}`;
                assert.ok(!taken.has(key), `${l.id}: ${it.kind} overlaps ${taken.get(key)} at ${key}`);
                taken.set(key, it.kind);
            }
            if (it.flt) assert.ok(ITEMS[it.flt], `${l.id}: filter ${it.flt}`);
            if (it.sel) assert.equal(RECIPES[it.sel]?.station, 'assembler', `${l.id}: recipe ${it.sel}`);
        }
        assert.ok(l.marks.length >= 2 && l.marks.every((m) => m.i >= 0 && m.i < l.items.length && m.t.length <= 16), `${l.id}: captions point at real pieces`);
        const box = extent(l.items);
        assert.ok(box.w <= 7 && box.h <= 5, `${l.id}: ${box.w}×${box.h} fits the preview`);
        assert.ok(layoutReq(l).length > 0 && layoutReq(l).every((t) => SKILL_LIST.some((s) => s.unlock?.includes(t))), `${l.id}: its unlock tokens come from skills`);
        assert.deepEqual(layoutBlueprint(l).items, l.items);
        assert.notEqual(layoutBlueprint(l).items[0], l.items[0], 'the paste gets its own copy');
    }
});

for (const l of STARTER_LAYOUTS) {
    test(`starter layout "${l.name}" works: placed in one click, it makes its product`, () => {
        const s = prove(l);
        // the farmer paid the ordinary price: what they were given is all spent
        assert.ok(s.p.stats.built >= l.items.length);
        for (const res of Object.keys(totalCost(l.items))) assert.equal(s.p.inv[res as ItemId] ?? 0, 0, `${res} was all spent`);
    });
    if (canTurn(l.items)) {
        test(`starter layout "${l.name}" still works turned a quarter, and twice`, () => {
            prove(l, 1);
            prove(l, 2);
        });
    }
}

test('the ordinary rules still apply: locked skills stop the pieces they gate, and too few materials stop the layout part-way', () => {
    const l = LAYOUT_BY_ID.smelter;
    const locked = stage(l, { skills: false });
    assert.equal(locked.sim.buildings('inserter').length, 0, 'no Logistics skill: no inserters');
    assert.equal(locked.sim.buildings('windturbine').length, 0, 'no Electricity skill: no turbine');
    assert.ok(locked.sim.buildings('furnace').length === 1 && locked.sim.buildings('chest').length === 2, 'what is not locked is still built');
    assert.ok(locked.sim.events.some((e) => e.e === 'banner' && /Built \d+ of 7/.test(e.text) && /still locked/.test(e.sub ?? '')), 'and it says so');
    const poor = stage(l, { materials: 0.9 });
    const built = poor.items.filter((_, i) => poor.at[i]).length;
    assert.ok(built > 0 && built < l.items.length, `ran out of materials part-way: ${built} of ${l.items.length}`);
    // too far away
    const far = Sim.create('L-far', 'f');
    const p = far.join('a', 'A')!;
    p.skills.i_belts = 1; p.skills.i_power = 1;
    for (const [res, n] of Object.entries(totalCost(l.items)) as [ItemId, number][]) far.give(p, res, n);
    far.command('a', { t: 'bp', tx: Math.floor(p.x / TILE) + 40, ty: Math.floor(p.y / TILE), items: l.items });
    assert.equal(far.buildings().filter((b) => b.kind === 'inserter').length, 0, 'out of range: nothing is placed');
});
