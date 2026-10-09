// The 3D view's camera and controls (src/client3d/camera.ts, src/client/world/photocam.ts, `shakeNow` in the bridge): the
// prototype's angle and a follow that feels the same at any frame rate, the 2D zoom steps, the juice table's shake (taken from
// the 2D camera, so only your own actions shake it), the Perfect dash's beat, the dip into the caves, and photo mode's free
// camera, with the keys still moving the farmer up the screen however it is turned. All headless: no renderer is made.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Plane, Raycaster, Vector2, Vector3 } from 'three';
import { TILE, VIEW_H, ZOOM } from '../src/shared/config';
import { CameraRig, DIP, FOLLOW, WARP, type RigInput } from '../src/client3d/camera';
import { BASE_VIEW, EL } from '../src/client3d/render';
import { GAME_TILT, PHOTO_TILT_MAX, PHOTO_TILT_MIN, PHOTO_ZOOM_MAX, PhotoCam, screenToWorldMove } from '../src/client/world/photocam';
import { shakeNow } from '../src/client/world/view3d-bridge';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const base = (o: Partial<RigInput> = {}): RigInput => ({ dt: 1 / 60, x: 10, z: 10, zoom: 1, aspect: 16 / 9, under: false, ...o });

/** Run a rig for `secs` at `fps` with the same input every frame. */
function run (rig: CameraRig, secs: number, fps: number, o: Partial<RigInput> = {}) {
    const n = Math.round(secs * fps);
    for (let i = 0; i < n; i++) rig.update(base({ dt: 1 / fps, ...o }));
}

/** Where a world point lands on the HUD (logical units), through the rig's camera. */
function hud (rig: CameraRig, x: number, y: number, z: number) {
    const p = new Vector3(x, y, z).project(rig.cam);
    return { x: (p.x * 0.5 + 0.5) * 960, y: (-p.y * 0.5 + 0.5) * VIEW_H };
}

test('the camera looks down at the prototype angle, north, at the classic distance', () => {
    const rig = new CameraRig();
    rig.update(base());
    const d = rig.cam.position.clone().sub(rig.target).normalize();
    assert.ok(Math.abs(Math.asin(d.y) - EL) < 1e-9, '62 degrees above the ground');
    assert.ok(Math.abs(d.x) < 1e-9 && d.z > 0, 'from the south, looking north (up the screen is north, as in 2D)');
    assert.ok(Math.abs(rig.viewH - BASE_VIEW) < 1e-9, 'at zoom 1 the view is as tall as the 2D view: 540 / (16 x 3) tiles');
    assert.equal(BASE_VIEW, VIEW_H / (TILE * ZOOM));
    assert.ok(Math.abs(rig.target.x - 10) < 1e-9 && rig.target.z < 10 && rig.target.z > 9.7, 'the first frame is on the farmer (a little north of the feet)');
});

test('the follow glides, and feels the same at 30, 60 and 144 frames a second', () => {
    const ends = [30, 60, 144].map((fps) => {
        const rig = new CameraRig();
        rig.update(base());
        run(rig, 0.4, fps, { x: 15 });
        return rig.target.x;
    });
    const want = 15 - 5 * Math.exp(-FOLLOW * 0.4);
    for (const x of ends) assert.ok(Math.abs(x - want) < 0.02, `after 0.4 s: ${x} vs ${want}`);
    assert.ok(ends[0] < 15 - 0.1, 'it glides (it is not there yet)');
    // and it settles exactly
    const rig = new CameraRig();
    rig.update(base());
    run(rig, 3, 60, { x: 15 });
    assert.ok(Math.abs(rig.target.x - 15) < 1e-3);
});

test('zoom follows the 2D zoom steps and glides to them', () => {
    const rig = new CameraRig();
    rig.update(base({ zoom: 1 }));
    rig.update(base({ zoom: 2 }));
    assert.ok(rig.zoom > 1 && rig.zoom < 2, 'one frame in: on the way');
    run(rig, 2, 60, { zoom: 2 });
    assert.ok(Math.abs(rig.viewH - BASE_VIEW / 2) < 1e-3, 'zoom 2 shows half as much');
    run(rig, 2, 60, { zoom: 0.5 });
    assert.ok(Math.abs(rig.viewH - BASE_VIEW * 2) < 1e-2);
});

test('the shake is the 2D camera\'s: the juice table\'s pixels, along the screen, nothing when it is not running', () => {
    // what Fx.shake asks of the Phaser camera, and what shakeNow reads back from it
    const cam = { width: 1920, zoom: 6, shakeEffect: { isRunning: true, progress: 0, intensity: { x: 0, y: 0 } } };
    const px = 7;                                           // getting hurt
    cam.shakeEffect.intensity.x = cam.shakeEffect.intensity.y = px / (cam.width * cam.zoom);
    const read = (c: typeof cam) => shakeNow(c as unknown as Parameters<typeof shakeNow>[0]);
    assert.ok(Math.abs(read(cam) - px) < 1e-9, 'the peak is the table\'s number (Phaser moves the world by intensity x width x zoom)');
    cam.shakeEffect.progress = 0.5;
    assert.ok(Math.abs(read(cam) - px / 2) < 1e-9, 'and it tapers away');
    cam.shakeEffect.isRunning = false;
    assert.equal(read(cam), 0, 'no shake running (or Screen shake off: Fx never starts one): none in 3D either');

    const rig = new CameraRig();
    rig.update(base());
    const still = rig.cam.position.clone(), at = hud(rig, 10, 0, 10);
    const amp = px / TILE;
    let moved = 0;
    for (let i = 0; i < 40; i++) {
        rig.update(base({ dt: 0, shake: amp }));
        const off = rig.cam.position.clone().sub(still);
        const fwd = new Vector3();
        rig.cam.getWorldDirection(fwd);
        assert.ok(Math.abs(off.dot(fwd)) < 1e-9, 'the camera moves across the screen, never towards it');
        assert.ok(Math.abs(rig.shakeOff.x) <= amp + 1e-9 && Math.abs(rig.shakeOff.y) <= amp + 1e-9);
        const s = hud(rig, 10, 0, 10);
        moved = Math.max(moved, Math.abs(s.x - at.x), Math.abs(s.y - at.y));
        // a shake of px world pixels moves the 2D picture px x ZOOM HUD units: the same here
        assert.ok(Math.abs(s.x - at.x) <= px * ZOOM + 1e-6 && Math.abs(s.y - at.y) <= px * ZOOM + 1e-6);
    }
    assert.ok(moved > px * ZOOM * 0.3, 'and it does move');
    rig.update(base({ dt: 0, shake: 0 }));
    assert.ok(rig.cam.position.distanceTo(still) < 1e-9, 'back at rest the moment the shake ends');
});

test('the 3D view shakes only through the 2D camera: no event shakes it by itself (a friend\'s action never shakes yours)', () => {
    const src = readFileSync(join(ROOT, 'src/client3d/view3d.ts'), 'utf8');
    assert.ok(!/spec\.shake|shake\.p\b/.test(src), 'view3d.ts must not start a shake from an event');
    const game = readFileSync(join(ROOT, 'src/client/scenes/Game.ts'), 'utf8');
    assert.match(game, /noShake: !mine/, 'the 2D rule: only the acting farmer (or "*") shakes');
    assert.match(game, /shake: shakeNow\(this\.cameras\.main\)/, 'and the 3D camera is fed that same shake');
});

test('the Perfect dash: a push in and a drained beat, on real time while the world crawls', () => {
    const rig = new CameraRig();
    rig.update(base());
    run(rig, 1, 60);
    const h0 = rig.viewH;
    rig.update(base({ punch: 0.04, slow: 0.2 }));
    assert.ok(Math.abs(rig.viewH - h0 / 1.04) < 1e-3, 'the push in (slowmo.ts punch) is the 2D one');
    assert.equal(rig.beat, 1, 'at the bottom of the beat the colour drains');
    rig.update(base({ slow: 1 }));
    assert.equal(rig.beat, 0);
});

test('climbing down into the caves dips to black, holds on the shaft, then comes up on the farmer below', () => {
    const rig = new CameraRig();
    rig.update(base({ x: 20, z: 20 }));
    run(rig, 1, 60, { x: 20, z: 20 });
    // the shaft: the farmer is now hundreds of tiles south, in the caves
    rig.update(base({ x: 21, z: 320, under: true }));
    assert.equal(rig.dipping, 'down');
    assert.ok(rig.target.z < 21, 'while it darkens the camera stays where you were');
    run(rig, DIP.down.out * 0.9, 60, { x: 21, z: 320, under: true });
    assert.ok(rig.fade > 0.5 && rig.target.z < 21, 'nearly black, still above');
    run(rig, DIP.down.out * 0.2, 60, { x: 21, z: 320, under: true });
    assert.ok(rig.target.z > 319, 'cut at black to the farmer below');
    assert.ok(rig.fade > 0.8, 'still dark for a moment down there');
    run(rig, DIP.down.hold + DIP.down.in + 0.1, 60, { x: 21, z: 320, under: true });
    assert.equal(rig.dipping, null);
    assert.equal(rig.fade, 0, 'and the picture is back');
    assert.ok(Math.abs(rig.viewH - BASE_VIEW) < 0.05, 'at the zoom you had');
    // and back up
    rig.update(base({ x: 21, z: 22, under: false }));
    assert.equal(rig.dipping, 'up');
    run(rig, DIP.up.out + DIP.up.hold + DIP.up.in + 0.1, 60, { x: 21, z: 22 });
    assert.equal(rig.fade, 0);
    assert.ok(Math.abs(rig.target.z - 21.8) < 0.05);
});

test('a waystone or a respawn blinks; walking, even fast, never does; a new world snaps', () => {
    const rig = new CameraRig();
    rig.update(base());
    for (let i = 0; i < 120; i++) rig.update(base({ x: 10 + i * 0.15 }));       // a dash and a run: 9 tiles a second
    assert.equal(rig.dipping, null);
    assert.equal(rig.fade, 0);
    rig.update(base({ x: 10 + 119 * 0.15 + WARP + 5 }));
    assert.equal(rig.dipping, 'warp');
    run(rig, DIP.warp.out + DIP.warp.in + 0.05, 60, { x: 10 + 119 * 0.15 + WARP + 5 });
    assert.equal(rig.fade, 0);
    rig.reset();
    rig.update(base({ x: 400, z: 400 }));
    assert.equal(rig.dipping, null, 'a welcome (join, reconnect) puts the camera straight there');
    assert.ok(Math.abs(rig.target.x - 400) < 1e-9);
});

test('photo mode: drag turns and tilts within limits, the wheel zooms further, and leaving glides back', () => {
    const pc = new PhotoCam();
    assert.equal(pc.tilt, GAME_TILT);
    assert.ok(Math.abs(GAME_TILT * Math.PI / 180 - EL) < 1e-9, 'the photo camera starts at the game camera\'s angle');
    pc.down(1, 100, 100);
    pc.move(2, 400, 100);
    assert.equal(pc.yaw, 0, 'another pointer moving does not turn it');
    pc.move(1, 200, 100);
    assert.ok(pc.yaw < 0, 'dragging right turns the world under you');
    pc.move(1, 200, 2000);
    assert.equal(pc.tilt, PHOTO_TILT_MIN, 'never below the lowest tilt');
    pc.move(1, 200, -4000);
    assert.equal(pc.tilt, PHOTO_TILT_MAX, 'never straight down');
    pc.down(2, 500, 300);
    assert.ok(!pc.dragging, 'a second finger is a pinch, not a turn');
    for (let i = 0; i < 40; i++) pc.zoomStep(1);
    assert.equal(pc.zoom, PHOTO_ZOOM_MAX);
    pc.move(1, 9000, 0);
    for (let i = 0; i < 200; i++) pc.turn(37, 0);
    assert.ok(pc.yaw >= -Math.PI && pc.yaw <= Math.PI, 'the turn stays in one circle');

    const rig = new CameraRig();
    rig.update(base());
    run(rig, 2, 60, { photo: { yaw: Math.PI / 2, tilt: 40, zoom: 1.5 } });
    const d = rig.cam.position.clone().sub(rig.target).normalize();
    assert.ok(d.x > 0.7 && Math.abs(d.z) < 0.02, 'turned a quarter: the camera looks west from the east');
    assert.ok(Math.abs(Math.asin(d.y) - 40 * Math.PI / 180) < 1e-3);
    assert.ok(Math.abs(rig.viewH - BASE_VIEW / 1.5) < 1e-3);
    run(rig, 2, 60, { photo: null });
    const back = rig.cam.position.clone().sub(rig.target).normalize();
    assert.ok(Math.abs(back.x) < 1e-3 && Math.abs(Math.asin(back.y) - EL) < 1e-3 && Math.abs(rig.viewH - BASE_VIEW) < 1e-3, 'out of photo mode: the game camera again');
});

test('the pointer lands where it points at every camera angle (touch aim and long press go through this ray)', () => {
    const ray = new Raycaster(), ground = new Plane(new Vector3(0, 1, 0), 0), hit = new Vector3();
    for (const photo of [null, { yaw: 0.8, tilt: 35, zoom: 0.6 }, { yaw: -2.6, tilt: 80, zoom: 2.5 }]) {
        const rig = new CameraRig();
        rig.update(base({ x: 50, z: 70 }));
        run(rig, 2, 60, { x: 50, z: 70, photo });
        for (const [x, z] of [[50, 70], [52.5, 68.25], [47, 73]]) {
            const p = new Vector3(x, 0, z).project(rig.cam);
            ray.setFromCamera(new Vector2(p.x, p.y), rig.cam);
            assert.ok(ray.ray.intersectPlane(ground, hit));
            assert.ok(Math.abs(hit.x - x) < 1e-6 && Math.abs(hit.z - z) < 1e-6, `round trip at ${x},${z} (${JSON.stringify(photo)})`);
        }
    }
});

test('keys and the stick move the farmer up the screen however the photo camera is turned', () => {
    assert.deepEqual(screenToWorldMove(0.3, -1, 0), { x: 0.3, y: -1 }, 'unturned (2D, and 3D outside photo mode): unchanged');
    for (const yaw of [0.4, Math.PI / 2, -2.2, Math.PI]) {
        const rig = new CameraRig();
        rig.update(base());
        run(rig, 3, 60, { photo: { yaw, tilt: 50, zoom: 1 } });
        const from = hud(rig, rig.target.x, 0, rig.target.z);
        for (const [mx, my, sx, sy] of [[0, -1, 0, -1], [1, 0, 1, 0], [0, 1, 0, 1], [-1, 0, -1, 0]]) {
            const w = screenToWorldMove(mx, my, rig.yaw);
            const to = hud(rig, rig.target.x + w.x, 0, rig.target.z + w.y);
            const dx = to.x - from.x, dy = to.y - from.y, len = Math.hypot(dx, dy);
            assert.ok((dx * sx + dy * sy) / len > 0.99, `yaw ${yaw}: push ${mx},${my} goes ${sx},${sy} on screen`);
        }
    }
});
