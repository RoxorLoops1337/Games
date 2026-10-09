// The world overlays in the 3D view (client/world/overlay3d.ts, client3d/groundview.ts, marks.ts, wires.ts): the 2D overlays land
// exactly on the 3D ground (the overlay camera's map is the 3D camera's own, for every zoom and lift), a boss's warnings are painted
// in the shapes and colours the 2D view uses and go away when they land, arenas follow their bosses, the power wires hang between
// the poles in the grid's colour, and the 2D code marks the overlays the 3D view is meant to show.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Color, type Mesh, type MeshBasicMaterial, OrthographicCamera, Scene } from 'three';
import { TILE, VIEW_H, VIEW_W } from '../src/shared/config';
import { PAL } from '../src/shared/palette';
import type { BuildE, Ent, MobE } from '../src/shared/sim/types';
import { overlay3d, overlayCamera, overlayLift, OVERLAY_LIFTS } from '../src/client/world/view3d-bridge';
import { groundToHud, groundViewOf } from '../src/client3d/groundview';
import { BASE_VIEW, EL } from '../src/client3d/render';
import { Arenas, Warnings } from '../src/client3d/marks';
import { Wires } from '../src/client3d/wires';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** A camera set up as the in-game 3D view sets its own (view3d.ts updateCamera), looking at (x, z) tiles at a zoom. */
function camera (x: number, z: number, zoom: number) {
    const cam = new OrthographicCamera(-10, 10, 6, -6, 1, 400);
    const H = BASE_VIEW / zoom, A = VIEW_W / VIEW_H;
    cam.left = -H * A / 2; cam.right = H * A / 2; cam.top = H / 2; cam.bottom = -H / 2;
    cam.updateProjectionMatrix();
    cam.position.set(x, Math.sin(EL) * 120, z + Math.cos(EL) * 120);
    cam.lookAt(x, 0, z);
    cam.updateMatrixWorld();
    return cam;
}

/** A point (tiles, y up) through the camera to HUD units. */
function project (cam: OrthographicCamera, x: number, y: number, z: number) {
    const p = cam.position.clone().set(x, y, z).project(cam);
    return { x: (p.x * 0.5 + 0.5) * VIEW_W, y: (-p.y * 0.5 + 0.5) * VIEW_H };
}

test('the overlays land on the 3D ground exactly where the 3D camera draws it, at every zoom and lift', () => {
    for (const [x, z, zoom] of [[441.3, 333.6, 1], [12, 900.5, 0.5], [1700.25, 40, 2], [300, 300, 1.6667]]) {
        const cam = camera(x, z, zoom);
        const gv = groundViewOf(cam, { x, z }, { cx: 0, cy: 0, sx: 0, sy: 0, up: 0 });
        assert.ok(Math.abs(gv.sy / gv.sx - Math.sin(EL)) < 1e-6, 'down the screen the ground is squashed by the elevation');
        assert.ok(Math.abs(gv.sx * TILE - (VIEW_H / BASE_VIEW) * zoom) < 1e-6, 'a tile across is as wide as in the 2D view at that zoom');
        for (let i = 0; i < 40; i++) {
            const px = x + (Math.sin(i * 7.1) * 12), pz = z + (Math.cos(i * 3.3) * 9), h = (i % 4) * 0.45;
            const want = project(cam, px, h, pz);
            const got = groundToHud(gv, px * TILE, pz * TILE, h);
            assert.ok(Math.abs(want.x - got.x) < 1e-3 && Math.abs(want.y - got.y) < 1e-3, `ground (${px}, ${pz}) at height ${h}: ${JSON.stringify(want)} vs ${JSON.stringify(got)}`);
            // the overlay camera (a Phaser camera: world to screen is (world - centre) * zoom from the middle, in canvas pixels) agrees
            const o = overlayCamera(gv, h), SSf = o.zx / gv.sx;
            const sx = ((px * TILE - o.x) * o.zx) / SSf + VIEW_W / 2, sy = ((pz * TILE - o.y) * o.zy) / SSf + VIEW_H / 2;
            assert.ok(Math.abs(sx - want.x) < 1e-3 && Math.abs(sy - want.y) < 1e-3, 'the overlay camera puts it in the same place');
        }
    }
});

test('overlays are marked one by one, with their lift; everything else stays 2D only', () => {
    const a = {}, b = {}, c = {};
    assert.equal(overlay3d(a), a);
    overlay3d(b, 0.9);
    assert.equal(overlayLift(a), 0);
    assert.equal(overlayLift(b), 0.9);
    assert.equal(overlayLift(c), undefined);
    assert.ok(OVERLAY_LIFTS.has(0) && OVERLAY_LIFTS.has(0.9), 'one overlay camera per lift');
});

const live = (w: Warnings) => (w as unknown as { live: { g: { children: Mesh[] }; mats: MeshBasicMaterial[] }[] }).live;

test("a boss's warnings are painted in the 2D shapes and colours, fill up, flash and go", () => {
    const scene = new Scene(), w = new Warnings(scene);
    w.add({ e: 'tele', shape: 'circle', x: 160, y: 160, r: 48, t: 1 });
    w.add({ e: 'tele', shape: 'line', x: 160, y: 160, r: 12, t: 1, a: Math.PI / 2, len: 96 });
    w.add({ e: 'tele', shape: 'cone', x: 160, y: 160, r: 64, t: 1, a: 0, kind: 'frost' });
    w.add({ e: 'tele', shape: 'ring', x: 160, y: 160, r: 80, t: 1, kind: 'hex' });
    assert.equal(live(w).length, 4);
    assert.equal(scene.children.length, 4, 'each warning is one group on the ground');
    const [circle, line, cone, ring] = live(w);
    assert.equal(circle.mats[0].color.getHex(), new Color(PAL.berry).getHex(), 'a blow is red');
    assert.equal(cone.mats[0].color.getHex(), new Color(PAL.sea).getHex(), 'the frost pattern is ice blue');
    assert.equal(ring.mats[2].color.getHex(), new Color(PAL.plum).getHex(), 'the hex pattern is violet');
    // a line runs along its heading: a quarter turn is due south (+z)
    const lg = (line as unknown as { g: { rotation: { y: number } } }).g;
    assert.ok(Math.abs(lg.rotation.y + Math.PI / 2) < 1e-9);
    w.update(0.5);
    const fill = circle.g.children[1];
    assert.ok(Math.abs(fill.scale.x - 1.5) < 1e-6, 'the inner fill has grown half way (radius 3 tiles)');
    w.update(0.55);
    assert.equal(circle.mats[0].color.getHex(), 0xffffff, 'it flashes white as it lands');
    w.update(0.2);
    assert.equal(live(w).length, 0, 'and is gone a moment later');
    assert.equal(scene.children.length, 0);
});

test('a boss arena ring follows the boss and goes with it', () => {
    const scene = new Scene(), a = new Arenas(scene);
    const boss = { k: 'mob', id: 7, kind: 'slimeking', x: 100, y: 100, hx: 320, hy: 480, hp: 300, mhp: 300 } as unknown as MobE;
    const slime = { k: 'mob', id: 8, kind: 'slime', x: 10, y: 10, hp: 5, mhp: 5 } as unknown as MobE;
    a.update([{ e: boss }, { e: slime }], 0);
    assert.equal(scene.children.length, 1, 'only a boss has an arena');
    const g = scene.children[0];
    assert.deepEqual([g.position.x, g.position.z], [20, 30], 'centred where the fight began (tiles)');
    assert.ok(Math.abs(g.scale.x - 190 / TILE) < 1e-9, 'as wide as the leash');
    a.update([{ e: slime }], 1);
    assert.equal(scene.children.length, 0);
});

test('power wires hang from pole to pole, gold on a grid with a generator, and are rebuilt only on a change', () => {
    const scene = new Scene(), w = new Wires(scene);
    const b = (id: number, kind: string, tx: number, ty: number) => ({ e: { k: 'bld', id, kind, tx, ty, rot: 0 } as unknown as BuildE as Ent });
    const dead = [b(1, 'pole', 10, 10), b(2, 'pole', 15, 10), b(3, 'assembler', 16, 12)];
    w.update(1, dead, 12, 10);
    const [wires, feeds] = scene.children as Mesh[];
    const colors = () => [...(wires.geometry.getAttribute('color').array as Float32Array)];
    const has = (hex: number) => { const c = new Color(hex); const a = colors(); for (let i = 0; i < a.length; i += 3) if (Math.abs(a[i] - c.r) < 1e-6 && Math.abs(a[i + 1] - c.g) < 1e-6 && Math.abs(a[i + 2] - c.b) < 1e-6) return true; return false; };
    assert.ok(wires.geometry.getAttribute('position').count > 0, 'a wire between the two poles');
    assert.ok(has(PAL.stone) && !has(PAL.gold), 'grey while nothing makes power');
    assert.ok(feeds.geometry.getAttribute('position').count > 0, 'a feed down to the machine');
    // a generator joins: gold
    const live = [...dead, b(4, 'coalgen', 8, 11)];
    w.update(0.1, live, 12, 10);
    assert.ok(has(PAL.stone), 'not looked at again before its time (four times a second)');
    w.update(0.3, live, 12, 10);
    assert.ok(has(PAL.gold) && !has(PAL.stone), 'gold once a generator is on the grid');
    // the wire hangs: its middle is lower than its ends
    const pos = wires.geometry.getAttribute('position');
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < pos.count; i++) { lo = Math.min(lo, pos.getY(i)); hi = Math.max(hi, pos.getY(i)); }
    assert.ok(hi > 1.6 && lo < hi - 0.15, 'from the pole tops, sagging in the middle');
    const before = wires.geometry;
    w.update(0.5, live, 12.5, 10);
    assert.equal(wires.geometry, before, 'nothing changed: nothing rebuilt');
    w.dispose();
});

test('the 2D code marks the overlays the 3D view shows (and leaves to the 3D models what they draw themselves)', () => {
    const src = (f: string) => readFileSync(join(ROOT, 'src/client', f), 'utf8');
    const marked = (f: string, what: RegExp, n = 1) => {
        const s = src(f);
        const count = (s.match(new RegExp(`overlay3d\\(${what.source}`, 'g')) ?? []).length;
        assert.ok(count >= n, `${f}: ${what.source} is a world overlay the 3D view shows (marked with overlay3d)`);
    };
    // the Factory view and its dim, the inserter marks, the placement overlay, the status badges (lifted over the machines), tunnel links, filter icons
    marked('world/factoryview.ts', /s\.add\.rectangle/);
    marked('world/factoryview.ts', /s\.add\.graphics\(\)/, 3);
    marked('world/factoryview.ts', /this\.scene\.add\.image\(0, 0, tex, 0\)\.setDepth\(1e4\), BADGE_LIFT/);
    marked('world/factoryview.ts', /this\.scene\.add\.graphics\(\)\.setDepth\(-8\.2\)/);
    // blueprint box, dismantle outline, fishing line and bite mark, swing arcs, monster marks, the Perfect ring, chest tags
    marked('world/blueprints.ts', /scene\.add\.graphics/);
    marked('world/interact.ts', /this\.scene\.add\.graphics/);
    marked('world/fishing.ts', /scene\.add\.graphics/);
    marked('world/fishing.ts', /this\.scene\.add\.image\(0, 0, 'mark_alert'/);
    marked('world/combat.ts', /scene\.add\.graphics\(\)\.setDepth\(8e4\)/, 3);
    marked('world/combat.ts', /scene\.add\.image\(0, 0, wantMark/);
    marked('juice/slowmo.ts', /s\.add\.circle/);
    // the Blight: a nest's plate, its health bar and ground ring, and the bars over walls a raider has hurt
    marked('world/blight.ts', /scene\.add\.graphics/);
    marked('world/blight.ts', /this\.scene\.add\.text/);
    marked('world/buildviews.ts', /s\.add\.image\(v\.x, y/, 3);
    // the 3D models carry their own wires, inserter arms, belt items and Titan ring, badge and bar: those stay 2D only (no double drawing)
    assert.doesNotMatch(src('world/titan.ts'), /overlay3d\(/);
    const fv = src('world/factoryview.ts');
    assert.match(fv, /this\.wiresG = s\.add\.graphics\(\)/);
    assert.match(fv, /this\.arms = s\.add\.graphics\(\)/);
    // and the main camera draws nothing in 3D (only marked overlays reach the screen there), so the 2D sprites never show through
    const ov = src('world/overlay3d.ts');
    assert.match(ov, /if \(lift === undefined\) return \[\];/);
    // and stays see-through when the 2D code paints its background (the caves' dark), or the 3D picture would be hidden under it
    assert.match(ov, /if \(main\.backgroundColor\.alpha > 0\) \{\s*this\.background = main\.backgroundColor\.color;\s*main\.setBackgroundColor\('rgba\(0,0,0,0\)'\);/);
});
