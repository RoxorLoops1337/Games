// The Blight in the 3D view (src/client3d) draws what the 2D view draws for it (client/world/blight.ts, the blight tiles): a nest
// isle's ground is the bruised blight soil with smouldering cracks, the nest grows, darkens and throbs with its level and smoulders
// in the dark.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Color, type Mesh, Scene } from 'three';
import { PLOT } from '../src/shared/config';
import { Rng } from '../src/shared/rng';
import type { Ent, NodeE, Plot } from '../src/shared/sim/types';
import { generatePlots } from '../src/shared/sim/worldgen';
import { World } from '../src/shared/world';
import { glowOf } from '../src/client3d/glow';
import { nestBeat, nestScale, nestTier } from '../src/client3d/models/nodes-nest';
import { nodeModel } from '../src/client3d/models/nodes';
import { BLIGHT_PAL, PALS, Soup, Terrain } from '../src/client3d/terrain';

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
