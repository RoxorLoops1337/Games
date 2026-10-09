// The 3D view's world (src/client3d: caves, terrain, seasons, lights, the mood) agrees with the 2D world it draws: the caves are
// built from the same map and rebuilt where rock is dug, the surface never draws the caves as meadow, ore veins join into patches
// as the 2D vein tiles do, the seasons glide to the calendar's season, and the lights are the 2D light map's sources.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Mesh, Scene } from 'three';
import { CAVE_N } from '../src/shared/cave';
import { PLOT, RIFT_ISLANDS, TILE, TUNING, UNDER_Y } from '../src/shared/config';
import { BUILDINGS } from '../src/shared/data/buildings';
import { Rng } from '../src/shared/rng';
import { seasonOf } from '../src/shared/season';
import type { BuildE, Ent, Plot } from '../src/shared/sim/types';
import { generatePlots } from '../src/shared/sim/worldgen';
import { World } from '../src/shared/world';
import { CaveTerrain, ROCK_H } from '../src/client3d/caves';
import { glowOf, Glows, lightColor } from '../src/client3d/glow';
import { caveTone } from '../src/client3d/mood';
import { RiftGates } from '../src/client3d/riftgates';
import { seasonU, stepSeason } from '../src/client3d/seasons';
import { Soup, Terrain } from '../src/client3d/terrain';
import { LightPool } from '../src/client3d/weather';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function world () {
    const plots: Plot[] = generatePlots(new Rng('w3d'));
    plots[0].owned = true;
    return new World(plots, 'w3d');
}

/** An open floor tile in the caves with rock right to its north (so its wall's front shows), near the middle of the map. */
function spot (w: World) {
    for (let r = 0; r < 200; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const tx = CAVE_N / 2 + dx, ty = UNDER_Y + CAVE_N / 2 + dy;
        if (!w.rockAt(tx, ty) && w.rockAt(tx, ty - 1)) return { tx, ty };
    }
    throw new Error('no cave floor');
}

const groundMeshes = (c: CaveTerrain) => c.group.children.filter((m): m is Mesh => (m as Mesh).isMesh);

test('the caves are built round the camera from the shared cave map, and only while the camera is down there', () => {
    const w = world(), scene = new Scene(), caves = new CaveTerrain(w, scene);
    caves.update(CAVE_N / 2, UNDER_Y + CAVE_N / 2, true);
    assert.equal(caves.size, 0, 'nothing before the caves are made (nobody has been down)');
    w.ensureCave();
    const at = spot(w);
    for (let i = 0; i < 40; i++) caves.update(at.tx, at.ty, true);
    assert.ok(caves.size >= 9, `chunks round the farmer (${caves.size})`);
    assert.equal(caves.group.visible, true);
    // the rock stands ROCK_H tall, the floor lies at 0
    let top = -1, low = 9;
    for (const m of groundMeshes(caves)) {
        const p = m.geometry.attributes.position.array;
        for (let i = 1; i < p.length; i += 3) { top = Math.max(top, p[i]); low = Math.min(low, p[i]); }
    }
    assert.ok(top > ROCK_H * 0.9 && top < ROCK_H + 0.4, `rock top ${top}`);
    assert.ok(low > -0.05, `floor ${low}`);
    caves.update(at.tx, at.ty, false);
    assert.equal(caves.group.visible, false, 'hidden on the surface');
});

test('digging rebuilds the chunk the rock was in (and only when something changed)', () => {
    const w = world(), caves = new CaveTerrain(w, new Scene());
    w.ensureCave();
    const at = spot(w);
    for (let i = 0; i < 40; i++) caves.update(at.tx, at.ty, true);
    const before = new Set(groundMeshes(caves).map((m) => m.geometry.uuid));
    caves.update(at.tx, at.ty, true);
    assert.deepEqual(new Set(groundMeshes(caves).map((m) => m.geometry.uuid)), before, 'nothing dug: nothing rebuilt');
    assert.ok(w.openTile(w.idx(at.tx, at.ty - 1)), 'the rock north of the spot is dug out');
    caves.update(at.tx, at.ty, true);
    const after = new Set(groundMeshes(caves).map((m) => m.geometry.uuid));
    const rebuilt = [...after].filter((u) => !before.has(u)).length;
    assert.ok(rebuilt >= 1 && rebuilt <= 4, `the dug chunk's meshes are new (${rebuilt})`);
});

test('the surface terrain never draws the caves (their rows are ground in the World, but not land up here)', () => {
    const w = world();
    w.ensureCave();
    const t = new Terrain(w, new Scene());
    const at = spot(w);
    assert.equal(w.isLand(at.tx, at.ty), true);
    assert.equal(t.landAt(at.tx, at.ty), false);
    const o = w.plotOrigin(w.plots[0]);
    assert.equal(t.landAt(o.tx + PLOT / 2, o.ty + PLOT / 2), true, 'owned land still is');
});

test('the ground under the camera is built on the very first frame (nearest chunks first, never the far corner)', () => {
    const w = world(), t = new Terrain(w, new Scene());
    const o = w.plotOrigin(w.plots[0]), x = o.tx + PLOT / 2, z = o.ty + PLOT / 2;
    t.update(x, z);
    const CH = 16, fx = Math.floor(x / CH), fz = Math.floor(z / CH);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) assert.ok(t.chunks.has((fz + dy) * 1000 + fx + dx), `chunk ${dx},${dy} round the camera`);
    assert.ok(t.chunks.size <= 12, `the rest waits for later frames (${t.chunks.size})`);
});

test('an ore vein reaches into its neighbours of the same ore, as the 2D vein tiles join into one patch', () => {
    const w = world(), t = new Terrain(w, new Scene());
    const o = w.plotOrigin(w.plots[0]), tx = o.tx + 4, ty = o.ty + 4;
    const extent = (veins: [number, number, string][]) => {
        t.veins.clear();
        for (const [x, y, k] of veins) t.veins.set(t.idx(x, y), k);
        const s = new Soup();
        t.decal(s, tx, ty, 'coal', [0, 0, 0, 0]);
        let maxX = -Infinity;
        for (let i = 0; i < s.pos.length; i += 3) maxX = Math.max(maxX, s.pos[i]);
        return maxX - tx;
    };
    assert.ok(extent([[tx, ty, 'coal']]) < 0.95, 'a lone vein tile stays inside its tile');
    assert.ok(extent([[tx, ty, 'coal'], [tx + 1, ty, 'coal']]) > 1.05, 'it reaches into the next coal tile');
    assert.ok(extent([[tx, ty, 'coal'], [tx + 1, ty, 'iron']]) < 0.95, 'not into a different ore');
});

test('the seasons glide to the calendar\'s season and the weights always sum to one', () => {
    stepSeason('summer', 0, true);
    assert.deepEqual(seasonU.uSeason.value.toArray(), [0, 1, 0, 0]);
    for (let i = 0; i < 30; i++) stepSeason(seasonOf(22), 0.1);
    const v = seasonU.uSeason.value;
    assert.equal(seasonOf(22), 'winter');
    assert.ok(v.w > 0.8 && v.y < 0.2, `winter is coming (${v.toArray()})`);
    assert.ok(Math.abs(v.x + v.y + v.z + v.w - 1) < 1e-6);
    stepSeason('autumn', 0, true);
    assert.deepEqual(seasonU.uSeason.value.toArray(), [0, 0, 1, 0]);
});

test('the lights are the 2D light map\'s: the same glowing monsters and creatures, lit buildings, working furnaces only', () => {
    const src = readFileSync(join(ROOT, 'src/client/scenes/Game.ts'), 'utf8'), mine = readFileSync(join(ROOT, 'src/client3d/glow.ts'), 'utf8');
    for (const name of ['LIGHT_MOBS', 'LIGHT_SPECIES']) {
        const list = (s: string) => new Set([...(s.match(new RegExp(`const ${name} = new Set(?:<string>)?\\(\\[([^\\]]*)\\]`))?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]));
        assert.deepEqual(list(mine), list(src), name);
        assert.ok(list(src).size > 0, `${name} found in Game.ts`);
    }
    const bld = (kind: string, extra: Partial<BuildE> = {}) => ({ id: 1, k: 'bld', kind, tx: 0, ty: 0, rot: 0, ...extra }) as unknown as Ent;
    for (const [kind, def] of Object.entries(BUILDINGS)) if (def.light) assert.ok(glowOf(bld(kind), 0, 0), `${kind} shines`);
    assert.equal(glowOf(bld('furnace'), 0, 0), null, 'a cold furnace is dark');
    assert.ok(glowOf(bld('furnace', { prog: 2 }), 0, 0), 'a working furnace glows');
    assert.equal(glowOf(bld('coalgen'), 0, 0), null);
    assert.ok(glowOf(bld('coalgen', { act: 1 }), 0, 0));
    assert.equal(lightColor('waystone'), 0xa8d8ff);
    assert.ok(glowOf({ id: 2, k: 'mob', kind: 'wisp', x: 0, y: 0 } as unknown as Ent, 0, 0));
    assert.equal(glowOf({ id: 3, k: 'mob', kind: 'slime', x: 0, y: 0 } as unknown as Ent, 0, 0), null);
});

test('the four rift gates stand at the rift islands\' hearts, six draw calls each', () => {
    const w = world(), scene = new Scene();
    new RiftGates(w, scene);
    const group = scene.children.find((c) => c.name === 'riftgates')!;
    assert.equal(group.children.length, RIFT_ISLANDS);
    group.children.forEach((g, i) => {
        assert.equal(g.children.length, 6);
        const c = w.riftCenter(i);
        assert.ok(Math.abs(g.position.x - c.x / TILE) < 1e-9 && Math.abs(g.position.z - (c.y + 12) / TILE) < 1e-9);
    });
});

test('the evening hearth circle shows round a campfire near you in the dusk countdown, and not at noon', () => {
    if (typeof (globalThis as { document?: unknown }).document === 'undefined') {
        const ctx = new Proxy({}, { get: (_t, k) => (k === 'createRadialGradient' ? () => ({ addColorStop () {} }) : () => {}), set: () => true });
        (globalThis as { document?: unknown }).document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
    }
    const scene = new Scene(), glows = new Glows(scene, new LightPool(scene, 2));
    const fire = { e: { id: 7, k: 'bld', kind: 'campfire', tx: 10, ty: 10, rot: 0 } as unknown as Ent };
    const shown = () => scene.children.find((c) => c.type === 'Group' && c.children.some((m) => (m as Mesh).isMesh && m.visible))?.children.filter((m) => m.visible).length ?? 0;
    glows.updateHearth(0.1, 0, [fire], { clock: TUNING.dayLength / 2, night: false }, { x: 11, z: 11 });
    assert.equal(shown(), 0, 'noon: no circle');
    glows.updateHearth(0.1, 0, [fire], { clock: TUNING.dayLength - 30, night: false }, { x: 11, z: 11 });
    assert.ok(shown() >= 1, 'dusk: the dotted circle shows');
    glows.updateHearth(0.1, 0, [fire], { clock: TUNING.dayLength - 30, night: false }, { x: 40, z: 40 });
    assert.equal(shown(), 0, 'too far away: none');
});

test('the caves are tinted by depth as the 2D light map tints them', () => {
    assert.equal(caveTone(0), 0x2e2c52, 'violet in the middle');
    assert.equal(caveTone(0.5), 0x24444e, 'teal further out');
    assert.equal(caveTone(1), 0x5a302c, 'ember at the edge');
    const night = readFileSync(join(ROOT, 'src/client/ui/night.ts'), 'utf8');
    for (const hex of ['0x2e2c52', '0x24444e', '0x5a302c']) assert.ok(night.includes(hex), `the 2D layer still uses ${hex}`);
});
