// The world overlays in the 3D view: the Game scene's own 2D drawing of badges, the Factory view, belt items, inserter arms,
// the placement and blueprint overlays, fishing lines, Titan rings, swing arcs and the rest, laid onto the 3D ground.
//
// In 3D the Game scene keeps running and keeps drawing its overlays exactly as in 2D; only what reaches the screen changes:
// the main camera (which still follows the farmer, so culling, `worldView` and the 2D pointer keep working) draws nothing and
// paints no background, and one more camera per lift draws only the objects marked with `overlay3d` (world/view3d-bridge.ts).
// That camera copies the 3D camera after every frame (`GroundView`): the 3D camera is orthographic with no yaw, so the ground
// maps to the screen by an affine map, and a Phaser camera zoomed `sy / sx` less down than across reproduces it exactly. A
// marked thing therefore sits on its spot of the 3D ground, drawn by the same code (and the same art) as in 2D.

import * as Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../../shared/config';
import { OVERLAY_LIFTS, overlayCamera, overlayLift, type GroundView } from './view3d-bridge';

type Cam = Phaser.Cameras.Scene2D.Camera;
type GO = Phaser.GameObjects.GameObject;

export class Overlay3D {
    /** One camera per lift (tiles above the ground), and the lift each one draws. */
    private cams = new Map<number, Cam>();
    private liftOf = new Map<Cam, number>();
    private on = false;
    /** The ground the 3D view shows (sim pixels), as of the last frame. */
    readonly rect = new Phaser.Geom.Rectangle();

    constructor (private scene: Phaser.Scene, private background: number) {}

    get active () { return this.on; }

    /** The 3D view took over the picture: the main camera stops drawing, the overlay cameras start. */
    start () {
        if (this.on) return;
        this.on = true;
        const mgr = this.scene.cameras;
        mgr.main.setBackgroundColor('rgba(0,0,0,0)');
        // (the camera manager asks this, per camera, which children to draw: an own property shadows the prototype's method, and
        // deleting it in stop() puts the 2D view back exactly as it was)
        (mgr as unknown as { getVisibleChildren: (c: GO[], cam: Cam) => GO[] }).getVisibleChildren = (children, cam) => this.visible(children, cam);
    }

    /** Back to 2D: the main camera draws everything again, on its own background. */
    stop () {
        if (!this.on) return;
        this.on = false;
        const mgr = this.scene.cameras;
        delete (mgr as unknown as { getVisibleChildren?: unknown }).getVisibleChildren;
        for (const cam of this.cams.values()) mgr.remove(cam);
        this.cams.clear();
        this.liftOf.clear();
        mgr.main?.setBackgroundColor(this.background);
    }

    /** After the 3D view drew a frame: put the overlay cameras where its camera is. */
    sync (gv: GroundView | null) {
        if (!this.on) return;
        const mgr = this.scene.cameras, main = mgr.main;
        // the 2D code may paint the main camera's background meanwhile (the caves' dark, `Ambience.updateUnder`): keep it for the
        // way back to 2D, and keep the camera see-through, or it would hide the 3D picture under it
        if (main.backgroundColor.alpha > 0) {
            this.background = main.backgroundColor.color;
            main.setBackgroundColor('rgba(0,0,0,0)');
        }
        for (const lift of OVERLAY_LIFTS) {
            let cam = this.cams.get(lift);
            if (!cam) {
                cam = mgr.add(0, 0, main.width, main.height, false, `overlay3d:${lift}`);
                cam.setRoundPixels(main.roundPixels);
                this.cams.set(lift, cam);
                this.liftOf.set(cam, lift);
            }
            cam.setVisible(!!gv);
            if (!gv) continue;
            const o = overlayCamera(gv, lift);
            cam.setZoom(o.zx, o.zy);
            cam.centerOn(o.x, o.y);
        }
        if (gv) this.rect.setTo(gv.cx - VIEW_W / 2 / gv.sx, gv.cy - VIEW_H / 2 / gv.sy, VIEW_W / gv.sx, VIEW_H / gv.sy);
    }

    /** What a camera of this scene draws: the main camera nothing, an overlay camera the marked objects of its lift. */
    private visible (children: GO[], cam: Cam): GO[] {
        const lift = this.liftOf.get(cam);
        if (lift === undefined) return [];
        const out: GO[] = [];
        for (const c of children) if (overlayLift(c) === lift && c.willRender(cam)) out.push(c);
        return out;
    }
}
