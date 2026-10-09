// Photo mode's free camera in the 3D view (F2 hides the HUD in both views; only the 3D view can also turn the camera).
//
// Plain numbers, no three.js: the Game scene owns them (input is the Game scene's job), and the 3D view only draws from them
// (`View3DCamera.photo` in view3d-bridge.ts). In 2D nothing here is used: photo mode there is the HUD hiding, exactly as before.
//
//   drag (mouse or one finger)   turn around the farmer (left and right) and tilt (up and down)
//   wheel, + and -, pinch        zoom, further in and out than the game camera goes
//   leaving photo mode           the camera glides back to the game's own angle and zoom

/** The tilt range (degrees above the ground): low enough for a horizon shot, never quite straight down. */
export const PHOTO_TILT_MIN = 18;
export const PHOTO_TILT_MAX = 86;
/** The game camera's own tilt (src/client3d/render.ts `EL`; kept here as a number so the 2D bundle carries no three.js). */
export const GAME_TILT = 62;
export const PHOTO_ZOOM_MIN = 0.35;
export const PHOTO_ZOOM_MAX = 3.2;
/** Radians of turn and degrees of tilt per HUD unit dragged (a drag across the whole 960-wide screen is about one and a half turns). */
const TURN_PER = 0.01;
const TILT_PER = 0.12;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export interface PhotoView {
    /** Turn around the farmer, radians (0: the game's view, looking north; positive turns the camera to the east of the farmer). */
    yaw: number;
    /** Degrees above the ground. */
    tilt: number;
    /** Zoom over the game camera's zoom (1: as it was when photo mode began). */
    zoom: number;
}

export class PhotoCam implements PhotoView {
    yaw = 0;
    tilt = GAME_TILT;
    zoom = 1;
    private drag: { id: number; x: number; y: number } | null = null;

    /** Photo mode began: start from the game's own view, so nothing jumps. */
    reset () { this.yaw = 0; this.tilt = GAME_TILT; this.zoom = 1; this.drag = null; }

    /** A pointer went down (HUD units): it now turns the camera until it comes up. A second finger makes it a pinch (zoom), not a turn. */
    down (id: number, x: number, y: number) { this.drag = this.drag && this.drag.id !== id ? null : { id, x, y }; }

    /** A pointer moved (HUD units): turn and tilt by how far the dragging one went. Other pointers (a second finger) are ignored. */
    move (id: number, x: number, y: number) {
        const d = this.drag;
        if (!d || d.id !== id) return;
        this.turn(x - d.x, y - d.y);
        d.x = x; d.y = y;
    }

    up (id: number) { if (this.drag?.id === id) this.drag = null; }

    get dragging () { return !!this.drag; }

    /** Turn by a drag of (dx, dy) HUD units: right turns the world to the right under you, down tilts towards the horizon. */
    turn (dx: number, dy: number) {
        this.yaw = wrap(this.yaw - dx * TURN_PER);
        this.tilt = clamp(this.tilt - dy * TILT_PER, PHOTO_TILT_MIN, PHOTO_TILT_MAX);
    }

    /** Zoom one step in (+1) or out (-1): the wheel, + and -, a pinch. */
    zoomStep (dir: number) { this.zoom = clamp(this.zoom * (dir > 0 ? 1.15 : 1 / 1.15), PHOTO_ZOOM_MIN, PHOTO_ZOOM_MAX); }
}

/** An angle into -PI..PI. */
export function wrap (a: number) {
    const t = Math.PI * 2;
    return a - Math.floor((a + Math.PI) / t) * t;
}

/**
 * Keys and the stick move the farmer in SCREEN directions (up the screen is north in the game camera). With the photo camera
 * turned by `yaw`, the same push is turned with it, so up the screen is still up the screen. At yaw 0 (always, outside photo
 * mode in 3D, and always in 2D) this returns the push unchanged.
 */
export function screenToWorldMove (mx: number, my: number, yaw: number): { x: number; y: number } {
    if (!yaw) return { x: mx, y: my };
    const c = Math.cos(yaw), s = Math.sin(yaw);
    return { x: mx * c + my * s, y: -mx * s + my * c };
}
