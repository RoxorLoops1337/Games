// The Blight in the 3D view (src/client3d) draws what the 2D view draws for it (client/world/blight.ts, the blight tiles): a nest
// isle's ground is the bruised blight soil with smouldering cracks, the nest grows, darkens and throbs with its level and smoulders
// in the dark; walls, doorways and fortified walls crack, chip and crumble as raiders hurt them and break in a puff of rubble; a raider wades through the sea sunk to the waist, leaving foam, with the Blight's red glow.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Color, type Mesh, Scene } from 'three';
import { PLOT } from '../src/shared/config';
import { Rng } from '../src/shared/rng';
import type { Ent, MobE, NodeE, Plot } from '../src/shared/sim/types';
import { MOBS } from '../src/shared/data/mobs';
import { BUILDINGS } from '../src/shared/data/buildings';
import type { BuildE } from '../src/shared/sim/types';
import { buildingModel } from '../src/client3d/models/buildings';
import { DAMAGE_KINDS, damageStage } from '../src/client3d/models/b-damage';
import { FX } from '../src/client3d/fx';
import { Impacts, RINGS } from '../src/client3d/impacts';
import { Entities } from '../src/client3d/entities';
import { wadeDepth, Wading } from '../src/client3d/wade';
import { generatePlots } from '../src/shared/sim/worldgen';
import { World } from '../src/shared/world';
import { glowOf } from '../src/client3d/glow';
import { nestBeat, nestScale, nestTier } from '../src/client3d/models/nodes-nest';
import { nodeModel } from '../src/client3d/models/nodes';
import { BLIGHT_PAL, PALS, Soup, Terrain, WATER_Y } from '../src/client3d/terrain';

// the soft discs are drawn on a 2D canvas when first asked for: give node a stand-in that draws nothing
if (typeof (globalThis as { document?: unknown }).document === 'undefined') {
    const ctx = new Proxy({}, { get: (_t, k) => (k === 'createRadialGradient' ? () => ({ addColorStop () {} }) : () => {}), set: () => true });
    (globalThis as { document?: unknown }).document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
}

/** A world with one nest isle (`blight` 1) next to the home plot, and the plain plot beside it for comparison. */
function world (blight: 0 | 1 = 1) {
    const plots: Plot[] = generatePlots(new Rng('b3d'));
    plots[0].owned = true;
    const isle = plots.find((p) => !p.owned && !p.dread && !p.heart && Math.abs(p.gx - plots[0].gx) + Math.abs(p.gy - plots[0].gy) === 3)!;
    if (blight) { isle.blight = 1; isle.nl = 4; } else isle.owned = true;
    return { w: new World(plots, 'b3d'), isle };
}

/** The soup of one plot's tiles: the ground and the cracks. */
function soupOf (w: World, p: Plot) {
    const t = new Terrain(w, new Scene()), o = w.plotOrigin(p), list: number[] = [];
    for (let y = 0; y < PLOT; y++) for (let x = 0; x < PLOT; x++) list.push(o.tx + x, o.ty + y);
    const s = new Soup(), veins = new Soup();
    t.tiles(s, list, veins);
    return { s, veins, t };
}
const lum = (col: number[]) => { let sum = 0; for (let i = 0; i < col.length; i += 3) sum += 0.3 * col[i] + 0.59 * col[i + 1] + 0.11 * col[i + 2]; return sum / (col.length / 3); };

test('a nest isle is drawn as blighted ground: dark bruised soil with smouldering cracks, unlike the same plot as farmland', () => {
    const blighted = world(1), plain = world(0);
    const a = soupOf(blighted.w, blighted.isle), b = soupOf(plain.w, plain.isle);
    assert.ok(a.s.pos.length > 0 && b.s.pos.length > 0);
    assert.ok(lum(a.s.col) < lum(b.s.col) * 0.6, `blight soil is dark (${lum(a.s.col).toFixed(3)} vs ${lum(b.s.col).toFixed(3)})`);
    const top = new Color(BLIGHT_PAL.ground[0]);
    assert.ok(Math.abs(top.r - top.b) < 0.1 && top.r < 0.3, 'purple-grey, not green');
    assert.ok(a.veins.pos.length > 9 * 30, `cracks over much of the isle (${a.veins.pos.length / 9} triangles)`);
    assert.equal(b.veins.pos.length, 0, 'no cracks on ordinary land');
    assert.ok(PALS[blighted.isle.biome], 'the isle keeps its biome for when it is cleansed');
});

test('a chunk over a nest isle carries its cracks as one unlit child mesh, and drops it with the chunk', () => {
    const { w, isle } = world(1), t = new Terrain(w, new Scene()), o = w.plotOrigin(isle);
    t.update(o.tx + PLOT / 2, o.ty + PLOT / 2, 4);
    const withVeins = [...t.chunks.values()].filter((c) => c.ground?.children.some((m) => m.name === 'veins'));
    assert.ok(withVeins.length > 0, 'a chunk with cracks');
    const v = withVeins[0].ground!.children[0] as Mesh;
    assert.equal((v.material as { type: string }).type, 'MeshBasicMaterial', 'unlit: the cracks glow at night as on the 2D tiles');
    t.invalidateAll();
    assert.equal(t.chunks.size, 0);
});

test('the nest grows, darkens and throbs with its level as the 2D nest does', () => {
    assert.equal(nestScale(1), 0.85);
    assert.ok(nestScale(10) > nestScale(5) && nestScale(5) > nestScale(1));
    assert.equal(nestScale(99), 1.9, 'it levels off');
    assert.deepEqual([1, 2, 3, 5, 6, 9, 10, 20].map(nestTier), [0, 0, 1, 1, 2, 2, 3, 3]);
    assert.ok(nestBeat(8) > nestBeat(1) && nestBeat(20) < 4, 'a slow pulse, a little quicker with age');
    let lv = 1;
    const m = nodeModel('nest', { biome: 'bog', gold: false, seed: 7, level: () => lv });
    const lvG = m.obj.children[0].children[0];
    const meshOf = () => lvG.children[0];
    for (let i = 0; i < 60; i++) m.update!(1 / 30, i / 30);
    const small = lvG.scale.x, young = meshOf();
    assert.ok(Math.abs(small - nestScale(1)) < 0.01);
    lv = 8;
    for (let i = 0; i < 120; i++) m.update!(1 / 30, 2 + i / 30);
    assert.ok(Math.abs(lvG.scale.x - nestScale(8)) < 0.02, `grown to level 8 (${lvG.scale.x})`);
    assert.notEqual(meshOf(), young, 'a new body for its tier (darker, more eggs)');
    // the throb: the body swells and settles
    const ys = new Set<number>();
    for (let i = 0; i < 40; i++) { m.update!(1 / 20, 10 + i / 20); ys.add(Math.round(meshOf().scale.y * 1000)); }
    assert.ok(ys.size > 5, 'it throbs');
});

test('a nest smoulders in the dark, as the 2D light map lights it; other nodes do not', () => {
    const nest = { id: 1, k: 'node', kind: 'nest', tx: 0, ty: 0, hp: 50, plot: 0 } as NodeE;
    const g = glowOf(nest as Ent, 3, 4);
    assert.ok(g && g.pulse && g.color === 0xff7080);
    assert.equal(glowOf({ ...nest, kind: 'tree' } as unknown as Ent, 0, 0), null);
});

/** A sea tile a few tiles off the home island's shore, and a land tile on it. */
function shore (w: World) {
    const o = w.plotOrigin(w.plots[0]);
    for (let x = o.tx + PLOT; x < o.tx + PLOT + 12; x++) if (!w.isLand(x, o.ty + 8) && !w.isLand(x + 1, o.ty + 8)) return { sea: { x: x + 3.5, z: o.ty + 8.5 }, land: { x: o.tx + 8.5, z: o.ty + 8.5 } };
    throw new Error('no sea');
}
const mob = (id: number, kind: string, x: number, z: number, rd?: [number, number]) => ({ id, k: 'mob', kind, x: x * 16, y: z * 16, vx: 0, vy: 0, hp: 10, mhp: 10, rd }) as unknown as MobE;

test('a raider in the sea wades sunk to the waist and leaves foam; on land, or not a raider, or flying, it stands on the ground', () => {
    const { w } = world(1), scene = new Scene(), ents = new Entities(scene, w), wading = new Wading(scene);
    ents.wading = wading;
    const at = shore(w);
    const walker = Object.keys(MOBS).find((k) => !(MOBS as Record<string, { flies?: boolean; boss?: unknown }>)[k].flies && !(MOBS as Record<string, { boss?: unknown }>)[k].boss)!;
    const flier = Object.keys(MOBS).find((k) => (MOBS as Record<string, { flies?: boolean }>)[k].flies);
    ents.upsert(mob(1, walker, at.sea.x, at.sea.z, [0, 0]));
    ents.upsert(mob(2, walker, at.sea.x, at.sea.z));
    ents.upsert(mob(3, walker, at.land.x, at.land.z, [0, 0]));
    if (flier) ents.upsert(mob(4, flier, at.sea.x, at.sea.z, [0, 0]));
    for (let i = 0; i < 40; i++) { ents.update(1 / 30, i / 30, at.sea.x, at.sea.z); wading.update(1 / 30); }
    const y = (id: number) => ents.views.get(id)!.model.obj.position.y;
    const r = (MOBS as Record<string, { r?: number }>)[walker].r ?? 6;
    assert.ok(Math.abs(y(1) - (WATER_Y - wadeDepth(r))) < 0.02, `the raider is in the water to its waist (${y(1)})`);
    assert.equal(y(2), 0, 'a monster that is no raider is drawn as before');
    assert.equal(y(3), 0, 'a raider on land stands on the ground');
    if (flier) assert.equal(y(4), 0, 'a flier never wades');
    assert.ok(wading.alive.rings > 0 && wading.alive.collars === 1, `foam round the one wading raider (${JSON.stringify(wading.alive)})`);
    // it comes back up out of the sea onto the land
    ents.upsert(mob(1, walker, at.land.x, at.land.z, [0, 0]));
    for (let i = 0; i < 60; i++) ents.update(1 / 30, 2 + i / 30, at.land.x, at.land.z);
    assert.equal(y(1), 0);
    ents.remove(1);
});

test('a raider carries the Blight\'s red glow (the 2D light map\'s), which goes with it into the sea', () => {
    const r = glowOf(mob(1, 'slime', 3, 4, [0, 0]) as Ent, 3, 4);
    assert.ok(r && r.color === 0xff8a96 && r.day, 'red, and faintly by day');
    assert.equal(glowOf(mob(2, 'slime', 3, 4) as Ent, 3, 4), null, 'an ordinary slime is dark');
    assert.equal(glowOf(mob(3, 'wisp', 3, 4, [0, 0]) as Ent, 3, 4)?.color, 0xb8f0c0, 'a wisp keeps its own light');
});

test('a hurt wall, doorway or fortified wall shows cracks, chips and rubble by its hit points, and is whole again at dawn', () => {
    assert.deepEqual(DAMAGE_KINDS.sort(), ['doorway', 'wall_brick', 'wall_fort', 'wall_stone', 'wall_window', 'wall_wood'].sort());
    assert.equal(damageStage(undefined, 100), 0);
    assert.deepEqual([100, 90, 60, 20, 0].map((hp) => damageStage(hp, 100)), [0, 1, 2, 3, 3]);
    const tris = (o: { traverse: (f: (m: unknown) => void) => void }) => { let n = 0; o.traverse((m) => { const g = (m as Mesh).geometry; if ((m as Mesh).isMesh && g) n += g.attributes.position.count / 3; }); return n; };
    for (const kind of DAMAGE_KINDS) {
        const max = (BUILDINGS as Record<string, { hp?: number }>)[kind].hp!;
        const e = (hp?: number) => ({ id: 5, k: 'bld', kind, tx: 0, ty: 0, rot: 0, hp }) as BuildE;
        const m = buildingModel(kind, { rot: 0, seed: 5, mask: 10 });
        m.apply!(e());
        const whole = tris(m.obj);
        const dmg = () => m.obj.children.find((c) => c.name === 'damage');
        assert.equal(dmg(), undefined, `${kind}: whole, no marks`);
        m.apply!(e(max * 0.9));
        const t1 = tris(m.obj) - whole;
        m.apply!(e(max * 0.1));
        const t3 = tris(m.obj) - whole;
        assert.ok(t1 > 0 && t3 > t1 * 1.5, `${kind}: more marks as it crumbles (${t1} -> ${t3})`);
        const other = buildingModel(kind, { rot: 0, seed: 7, mask: 10 });
        other.apply!(e(max * 0.1));
        const a = dmg() as Mesh | undefined, b = other.obj.children.find((c) => c.name === 'damage');
        assert.ok(a && b, `${kind}: marks on both`);
        m.apply!(e());
        assert.equal(dmg(), undefined, `${kind}: mended at dawn`);
    }
});

test('a wall breaking is mapped in the 3D fx table: a puff of rubble and dust, a ring and a flash', () => {
    for (const k of ['bldHit', 'bldBreak']) assert.ok(FX[k] && RINGS[k], k);
    assert.ok(FX.bldBreak!.n >= 20 && FX.bldBreak!.colors.length >= 3);
    const im = new Impacts(new Scene());
    im.fx('bldBreak', 3, 4);
    const a = im.alive;
    assert.ok(a.rings === 1 && a.flashes === 1 && a.dust >= 6, JSON.stringify(a));
});

test('every Blight action has its own 3D burst (not the default puff), and the big ones a ring', () => {
    for (const k of ['nestHit', 'nestDie', 'nestSpread', 'raid', 'bldHit', 'bldBreak', 'bedSet', 'unbind']) assert.ok(FX[k], `${k} burst`);
    for (const k of ['nestHit', 'nestDie', 'nestSpread', 'raid', 'bldHit', 'bldBreak']) assert.ok(RINGS[k], `${k} ring`);
    assert.ok(FX.nestDie!.n > FX.nestHit!.n * 4, 'a nest dying is a big burst');
});
