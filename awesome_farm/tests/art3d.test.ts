// The 3D view's art pass (src/client3d: contact.ts, impacts.ts, wet.ts and the grade in sky.ts): contact shadows under what
// stands and none under what lies flat, a ring only for real actions, rain that wets the ground and dries slowly, a night that is
// moonlit slate rather than royal blue, an overcast rain, and cave rock with a lighter lip where it meets the floor.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Color, type Mesh, MeshStandardMaterial, Scene, SRGBColorSpace, Vector3 } from 'three';
import { CAVE_N } from '../src/shared/cave';
import { UNDER_Y } from '../src/shared/config';
import { ACTIONS } from '../src/shared/actions';
import { BUILDINGS, type BuildingKind } from '../src/shared/data/buildings';
import { MOBS } from '../src/shared/data/mobs';
import { Rng } from '../src/shared/rng';
import type { Ent, Plot } from '../src/shared/sim/types';
import { generatePlots } from '../src/shared/sim/worldgen';
import { World } from '../src/shared/world';
import { CaveTerrain, glintMat } from '../src/client3d/caves';
import { contactSize, ContactShadows } from '../src/client3d/contact';
import { Impacts, RINGS } from '../src/client3d/impacts';
import { Sky } from '../src/client3d/sky';
import { stepWet, Wetness } from '../src/client3d/wet';

// the soft discs are drawn on a 2D canvas when first asked for: give node a stand-in that draws nothing
if (typeof (globalThis as { document?: unknown }).document === 'undefined') {
    const ctx = new Proxy({}, { get: (_t, k) => (k === 'createRadialGradient' ? () => ({ addColorStop () {} }) : () => {}), set: () => true });
    (globalThis as { document?: unknown }).document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
}


const bld = (kind: string) => ({ id: 1, k: 'bld', kind, tx: 0, ty: 0, rot: 0 }) as unknown as Ent;
const mob = (kind: string) => ({ id: 2, k: 'mob', kind, x: 0, y: 0, hp: 1, mhp: 1 }) as unknown as Ent;

test('contact shadows: every standing building has one sized by its footprint; floors, paths, belts, walls and beds have none', () => {
    for (const kind of Object.keys(BUILDINGS) as BuildingKind[]) {
        const d = BUILDINGS[kind], sz = contactSize(bld(kind));
        if (d.floor || d.roof || d.walk) { assert.equal(sz, null, `${kind} lies flat`); continue; }
        if (!sz) continue;                           // (a piece of a joining family: walls, fences, belts, paths)
        assert.ok(sz[0] > 0 && sz[1] > 0 && Number.isFinite(sz[0]) && Number.isFinite(sz[1]), kind);
        assert.ok(sz[0] >= d.size[0] && sz[1] >= d.size[1] * 0.9, `${kind}: as wide as it stands`);
    }
    for (const flat of ['path', 'belt', 'fence']) assert.equal(contactSize(bld(flat)), null, flat);
    const boss = contactSize(mob('frostgiant'))!, slime = contactSize(mob('slime'))!;
    assert.ok(boss[0] > slime[0] * 1.5, 'a boss stands on a bigger shadow than a slime');
    for (const k of Object.keys(MOBS)) assert.ok(contactSize(mob(k))![0] >= 0.7, k);
});

test('contact shadows: one instanced mesh, only for what is shown, never more than its pool', () => {
    const scene = new Scene(), c = new ContactShadows(scene);
    const views = [
        { e: bld('furnace'), x: 1, z: 1, model: { obj: { visible: true } } },
        { e: bld('path'), x: 2, z: 1, model: { obj: { visible: true } } },
        { e: mob('slime'), x: 3, z: 1, model: { obj: { visible: false } } },
    ];
    c.begin(0.3);
    c.addViews(views);
    c.end();
    assert.equal(c.count, 1, 'the furnace only (the path lies flat, the slime is out of view)');
    assert.equal(scene.children.filter((o) => o.name === 'contact').length, 1);
    c.begin(0.3);
    for (let i = 0; i < 5000; i++) c.add(i, 0, 1, 1);
    c.end();
    assert.ok(c.mesh.count <= c.mesh.instanceMatrix.count, 'the pool is the cap');
    c.dispose();
});

test('impact rings: only real sim actions have one, each spreads outwards, and a burst of events never grows the pool', () => {
    for (const [name, d] of Object.entries(RINGS)) {
        assert.ok((ACTIONS as readonly string[]).includes(name), `${name} is a sim action`);
        assert.ok(d!.r1 > d!.r0 && d!.r0 >= 0 && d!.dur > 0 && d!.dur <= 1, name);
    }
    const imp = new Impacts(new Scene());
    for (let i = 0; i < 500; i++) imp.fx('enemyHit', i % 20, 0);
    imp.fx('notAnAction', 0, 0);
    assert.ok(imp.alive.rings <= 40 && imp.alive.flashes <= 16);
    imp.update(2);
    assert.deepEqual(imp.alive, { rings: 0, flashes: 0, dust: 0 }, 'all gone after their time');
    // dust at running feet: a puff every few strides, none while standing or when switched off
    for (let i = 0; i < 30; i++) imp.feetOf('a', i * 0.1, 0, true, 1 / 30);
    assert.ok(imp.alive.dust >= 2 && imp.alive.dust <= 6, `${imp.alive.dust} puffs in a second of running`);
    imp.clear();
    imp.feet = false;
    for (let i = 0; i < 30; i++) imp.feetOf('a', i * 0.1, 0, true, 1 / 30);
    assert.equal(imp.alive.dust, 0);
    imp.dispose();
});

test('rain wets the ground quickly, it dries slowly, and puddles lie only on open land', () => {
    let w = 0;
    for (let i = 0; i < 40; i++) w = stepWet(w, 1, 0.1);
    assert.equal(w, 1, 'soaked after a few seconds of heavy rain');
    let t = 0;
    while (w > 0) { w = stepWet(w, 0, 0.1); t += 0.1; }
    assert.ok(t > 15, `drying takes a while (${t.toFixed(1)} s)`);
    assert.equal(stepWet(0, 0.02, 1), 0, 'a few drops do not wet it');
    const ground = new MeshStandardMaterial({ roughness: 0.95 }), scene = new Scene(), wet = new Wetness(scene, ground);
    for (let i = 0; i < 40; i++) wet.update(0.1, 1, 10, 10, new Color(0x8c97a6), true, (tx) => tx % 2 === 0);
    assert.ok(ground.roughness < 0.7 && ground.color.r < 0.9, 'wet ground is darker and glossier');
    assert.ok(wet.mesh.visible && wet.mesh.count > 0, 'puddles');
    const p = new Vector3();
    for (let i = 0; i < wet.mesh.count; i++) {
        wet.mesh.getMatrixAt(i, wet.mesh.matrix);
        p.setFromMatrixPosition(wet.mesh.matrix);
        assert.equal(Math.abs(Math.floor(p.x) % 2), 0, 'only on tiles that are open land');
    }
    wet.update(0.1, 1, 10, 10, new Color(0x8c97a6), false, () => true);
    assert.equal(wet.mesh.visible, false, 'no puddles where the level (or the caves) says none');
    wet.dispose();
    assert.equal(ground.roughness, 0.95);
});

const sat = (c: Color) => { const hsl = { h: 0, s: 0, l: 0 }; c.getHSL(hsl, SRGBColorSpace); return hsl.s; };

test('the grade: the night is moonlit slate, not royal blue; rain is an overcast that dims and greys the picture', () => {
    const sky = new Sky(new Scene(), 256), at = new Vector3();
    sky.apply(0, 0, at);
    assert.ok(sat(sky.hemi.color) < 0.4, `night sky light saturation ${sat(sky.hemi.color).toFixed(2)}`);
    assert.ok(sat(sky.moon.color) < 0.5, 'a silver moon');
    const nightSat = sky.saturation;
    sky.apply(12.5, 0, at);
    const day = { sat: sky.saturation, exp: sky.exposure, hemi: sat(sky.hemi.color), sun: sky.sun.intensity };
    assert.ok(nightSat < day.sat, 'night drains colour');
    sky.apply(12.5, 1, at);
    assert.ok(sky.saturation < day.sat * 0.8 && sky.exposure < day.exp && sky.sun.intensity < day.sun * 0.5, 'rain dims and greys');
    assert.ok(sky.hemi.intensity > 0.78, 'the overcast lights everything evenly from above');
});

test('cave rock has a lighter lip where it meets open floor', () => {
    const plots: Plot[] = generatePlots(new Rng('art3d'));
    plots[0].owned = true;
    const w = new World(plots, 'art3d');
    w.ensureCave();
    const caves = new CaveTerrain(w, new Scene());
    for (let i = 0; i < 10; i++) caves.update(CAVE_N / 2, UNDER_Y + CAVE_N / 2, true);
    let lipBlue = 0, chunks = 0;
    caves.group.traverse((o) => {
        const m = o as Mesh;
        if (!m.isMesh || m.material === glintMat) return;
        chunks++;
        const c = m.geometry.getAttribute('color');
        for (let i = 0; i < c.count; i++) lipBlue = Math.max(lipBlue, c.getZ(i));
    });
    assert.ok(chunks > 0);
    // the plain rock top is at most 0x77729a (its bluest colour, shaded up to x1.06); the south lip is lighter
    assert.ok(lipBlue > new Color(0x77729a).b * 1.07, `lightest blue ${lipBlue.toFixed(3)}`);
    caves.dispose();
});
