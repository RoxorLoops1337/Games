// The 3D view's camera: the prototype's angle (an orthographic camera 62 degrees above the ground, looking north), a smooth
// follow, the game's zoom steps, the screen shake the 2D juice table asks for, the Perfect dash's push and slow-motion beat,
// photo mode's free camera, and the dip to black when the farmer climbs down into the caves (or warps).
//
// Pure three.js maths, no renderer and no DOM, so tests/camera3d.test.ts runs it headless. The view (view3d.ts) owns one and
// calls `update` once a frame with what the Game scene says (`View3DCamera` in client/world/view3d-bridge.ts); it never decides
// anything about the game: the shake comes from the 2D camera (only YOUR actions shake it), the zoom from the 2D zoom steps.
//
// Units: tiles (x east, z south, y up).

import { OrthographicCamera, Vector3 } from 'three';
import type { PhotoView } from '../client/world/photocam';
import { BASE_VIEW, EL } from './render';

/** How quickly the camera catches up with the farmer (per second, frame-rate independent: 1 - e^(-k dt)). */
export const FOLLOW = 7;
/** How quickly the zoom glides to a new step, and the photo camera to a new angle. */
const ZOOM_RATE = 8;
const PHOTO_RATE = 10;
/** The camera looks a little north of the feet, so the farmer stands just under the middle as in 2D. */
const LOOK_AHEAD_Z = -0.2;
/** A jump further than this (tiles) is a warp (waystone, respawn, a shaft): the camera does not glide across the map. */
export const WARP = 12;
/** How far the camera sits from what it looks at (the frustum is orthographic: this only keeps everything between near and far). */
const DIST = 120;

/** A dip to black between two places: out (fade in the dark, the camera still where it was), cut, in (fade back at the new place). */
interface Dip {
    kind: 'down' | 'up' | 'warp';
    t: number;
    out: number;
    hold: number;
    in: number;
    cut: boolean;
}
/** Seconds of the dip: darkening, black, lightening. The caves get a longer, deeper one (you climb down a shaft); a waystone a quick blink. */
export const DIP = { down: { out: 0.24, hold: 0.08, in: 0.5 }, up: { out: 0.2, hold: 0.05, in: 0.42 }, warp: { out: 0.1, hold: 0, in: 0.26 } } as const;

export interface RigInput {
    /** Real seconds this frame (the camera keeps real time in the Perfect beat while the world crawls). */
    dt: number;
    /** What to follow (tiles): your farmer. */
    x: number;
    z: number;
    /** The game's zoom (1: the classic distance; the 2D zoom steps / ZOOM). */
    zoom: number;
    /** The canvas's width over its height. */
    aspect: number;
    /** Is what the camera follows down in the caves? A change is a climb down (or up): the dip. */
    under: boolean;
    /** The Perfect dash's push in (0 normally, a few hundredths during the beat). */
    punch?: number;
    /** How fast the world runs (1: normal; 0.2 at the bottom of the Perfect beat). */
    slow?: number;
    /** The screen shake running now: its amplitude in tiles (0: none). */
    shake?: number;
    /** Photo mode's free camera, or nothing (the game camera). */
    photo?: PhotoView | null;
}

export class CameraRig {
    readonly cam = new OrthographicCamera(-10, 10, 6, -6, 1, 400);
    /** The point the camera looks at (tiles, on the ground). Everything that streams around the camera (terrain, sea, rain) reads it. */
    readonly target = new Vector3();
    /** 0..1: how dark the dip is now (the view multiplies the picture's exposure by 1 - fade). */
    fade = 0;
    /** 0..1: how deep in the Perfect dash's slow motion the world is (the view drains a little colour with it). */
    beat = 0;
    /** The zoom in use (glides to the asked one), and the view's height in tiles that it gives. */
    zoom = 1;
    viewH = BASE_VIEW;
    /** The angle in use: turn around the target (radians) and height above the ground (radians), and photo mode's own zoom. */
    yaw = 0;
    el = EL;
    photoZoom = 1;
    /** The last shake offset (tiles, along the screen's right and up), for tests and the debug readout. */
    readonly shakeOff = { x: 0, y: 0 };
    private set = false;
    private under = false;
    private dip: Dip | null = null;
    private readonly right = new Vector3();
    private readonly up = new Vector3();

    /** A new world arrived: the next frame puts the camera straight on the farmer, no glide and no dip. */
    reset () { this.set = false; this.dip = null; this.fade = 0; }

    /** Has the camera been put on the farmer since the last new world? */
    get placed () { return this.set; }

    /** Is a dip running (and which)? */
    get dipping () { return this.dip?.kind ?? null; }

    update (inp: RigInput) {
        const dt = Math.max(0, Math.min(0.25, inp.dt));
        const gx = inp.x, gz = inp.z + LOOK_AHEAD_Z, T = this.target;
        if (!this.set) {
            T.set(gx, 0, gz);
            this.set = true;
            this.under = inp.under;
            this.zoom = inp.zoom;
        } else if (inp.under !== this.under) {
            this.under = inp.under;
            this.startDip(inp.under ? 'down' : 'up');
        } else if (!this.dip && Math.hypot(gx - T.x, gz - T.z) > WARP) {
            this.startDip('warp');
        }
        // the dip: hold still while it darkens, cut at black, then follow again as it lightens
        let dipZoom = 1, dipTilt = 0;
        const d = this.dip;
        if (d) {
            d.t += dt;
            if (d.t < d.out) {
                const u = d.t / d.out;
                this.fade = u * u;
                if (d.kind !== 'warp') { dipZoom = 1 + 0.22 * u * u * (d.kind === 'down' ? 1 : -0.6); dipTilt = (d.kind === 'down' ? 1 : -1) * 0.12 * u; }
            } else {
                if (!d.cut) { d.cut = true; T.set(gx, 0, gz); }
                const u = Math.max(0, Math.min(1, (d.t - d.out - d.hold) / d.in)), e = 1 - Math.pow(1 - u, 3);
                this.fade = 1 - e;
                if (d.kind !== 'warp') { dipZoom = 1 + (d.kind === 'down' ? -0.16 : 0.14) * (1 - e); dipTilt = (d.kind === 'down' ? 1 : -1) * 0.1 * (1 - e); }
                if (u >= 1) { this.dip = null; this.fade = 0; }
            }
        }
        if (!d || d.cut) {
            const k = 1 - Math.exp(-dt * FOLLOW);
            T.x += (gx - T.x) * k;
            T.z += (gz - T.z) * k;
        }
        // zoom, the photo camera's angle, the Perfect push
        this.zoom += (inp.zoom - this.zoom) * (1 - Math.exp(-dt * ZOOM_RATE));
        const ph = inp.photo ?? null, kp = 1 - Math.exp(-dt * PHOTO_RATE);
        this.yaw += wrapAngle((ph ? ph.yaw : 0) - this.yaw) * kp;
        if (!ph && Math.abs(this.yaw) < 1e-4) this.yaw = 0;
        this.el += ((ph ? ph.tilt * Math.PI / 180 : EL) - this.el) * kp;
        this.photoZoom += ((ph ? ph.zoom : 1) - this.photoZoom) * kp;
        const slow = inp.slow ?? 1;
        this.beat = Math.max(0, Math.min(1, (1 - slow) / 0.8));
        const z = Math.max(0.05, this.zoom * this.photoZoom * (1 + (inp.punch ?? 0)) * dipZoom);
        this.viewH = BASE_VIEW / z;
        this.place(inp.aspect, Math.max(0.2, Math.min(Math.PI / 2 - 0.01, this.el + dipTilt)), inp.shake ?? 0);
    }

    /** Set the frustum and put the camera on its arm, then nudge it along the screen's own axes by the shake. */
    private place (aspect: number, el: number, shake: number) {
        const cam = this.cam, T = this.target, H = this.viewH, A = Math.max(0.1, aspect);
        cam.left = -H * A / 2;
        cam.right = H * A / 2;
        cam.top = H / 2;
        cam.bottom = -H / 2;
        cam.updateProjectionMatrix();
        const c = Math.cos(el);
        cam.position.set(T.x + Math.sin(this.yaw) * c * DIST, Math.sin(el) * DIST, T.z + Math.cos(this.yaw) * c * DIST);
        cam.up.set(0, 1, 0);
        cam.lookAt(T.x, 0, T.z);
        const so = this.shakeOff;
        if (shake > 0) {
            so.x = (Math.random() * 2 - 1) * shake;
            so.y = (Math.random() * 2 - 1) * shake;
            cam.updateMatrixWorld();
            this.right.setFromMatrixColumn(cam.matrixWorld, 0);
            this.up.setFromMatrixColumn(cam.matrixWorld, 1);
            cam.position.addScaledVector(this.right, so.x).addScaledVector(this.up, so.y);
        } else { so.x = 0; so.y = 0; }
        cam.updateMatrixWorld();
    }

    private startDip (kind: Dip['kind']) {
        const s = DIP[kind];
        // a dip already running (a shaft right after a waystone) carries on from how dark it already is
        const was = this.fade;
        this.dip = { kind, t: s.out * Math.sqrt(was), out: s.out, hold: s.hold, in: s.in, cut: false };
    }
}

/** An angle difference into -PI..PI (so a turn takes the short way round). */
export function wrapAngle (a: number) {
    const t = Math.PI * 2;
    return a - Math.floor((a + Math.PI) / t) * t;
}
