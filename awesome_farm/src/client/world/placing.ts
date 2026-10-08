// Putting a building down: the ghost that follows the farmer (or the mouse, or a finger), the rules that colour it red,
// lines of floor and belt laid in a drag, and what ends the mode. A blueprint paste (blueprints.ts) is aimed the same way.

import * as Phaser from 'phaser';
import { TILE } from '../../shared/config';
import { feetTile } from '../../shared/geom';
import { BUILDINGS, BuildingKind, isBeltLike } from '../../shared/data/buildings';
import { PAL } from '../../shared/palette';
import { placeWhy, tilesBetween, type PlaceEnv } from '../../shared/placement';
import { canAfford, hasUnlock, scaledCost } from '../../shared/sim/stats';
import type { Cmd, Ent, PlayerS } from '../../shared/sim/types';
import type { World } from '../../shared/world';
import { SS } from '../res';
import type { BlueprintTool } from './blueprints';

type Img = Phaser.GameObjects.Image;
const MULTIPLY = Phaser.TintModes.MULTIPLY;

/** How far (canvas pixels) a finger may wander and still be a tap. */
const TAP_SLOP = 14 * SS;
/** Floor pieces placed one at a time (belts and floors are laid in a drag). */
const SINGLE_PIECES: BuildingKind[] = ['splitter', 'sorter', 'tunnel', 'tunnelx'];
/** Pieces you lay in a line by holding and dragging: floors, belts, walls and roofs (not splitters, sorters and tunnels). */
export const isLinePiece = (kind: BuildingKind) => { const d = BUILDINGS[kind]; return !!(d.floor || d.wall || d.roof) && !SINGLE_PIECES.includes(kind); };
/** The landmarks you raise one of at a time, over and above what the data says (stations, processors and workplaces). */
const SITES = new Set<BuildingKind>(['mill', 'dock', 'altar', 'riftforge', 'den', 'hatchery', 'waystone', 'mailbox', 'table', 'fortune', 'weathervane', 'mineshaft', 'market']);
/**
 * Placing one of these ends the building mode: a crafting station, a processor, a workplace or a landmark is raised once and
 * walked up to (a newcomer clicking on would drop a second 6-wood bench), where floors, walls, beds, chests, fences, belts
 * and lamps are laid by the dozen until you stop. (A rule over BUILDINGS; a `once` flag in the data could replace it.)
 */
export const isOneOff = (kind: BuildingKind) => { const d = BUILDINGS[kind]; return !!(d.work || d.proc || d.station || d.pets) || SITES.has(kind); };

/** `why`: what is wrong with the tile (null when it fits). `pin`: the tile a finger put the ghost on (phones: the ghost stays there until you walk). */
export interface Placing { kind: BuildingKind; ghost: Img; tx: number; ty: number; valid: boolean; why: string | null; pin: { tx: number; ty: number } | null; rot: number }

/** The slice of the Game scene placing reads and the pointer state it shares with targeting. */
interface PlacingHost {
    readonly world: World;
    readonly ents: Record<number, Ent>;
    readonly meS: PlayerS | null;
    readonly local: { x: number; y: number; face: { x: number; y: number } };
    readonly touch: { mx: number; my: number };
    readonly bp: BlueprintTool;
    /** Where the pointer is in the world, and for how long a mouse (not a finger) has been aiming. */
    readonly pointerWorld: { x: number; y: number };
    readonly mouseAimT: number;
    /** The mouse button is held (a line is being laid, or a swing). */
    mouseHeld: boolean;
    /** Phones: the finger that is aiming a building or a blueprint (not the one on the stick). */
    aimPointer: Phaser.Input.Pointer | null;
    send (c: Cmd): void;
    /** "Can't do that": a buzz and a few words over your head. */
    deny (why: string | null): void;
    /** Which sides of a wall tile join up (the frame the ghost shows). */
    wallMask (tx: number, ty: number): number;
}

export class Placer {
    /** The building in hand, or null. */
    cur: Placing | null = null;
    /** Phones: the tile a blueprint was aimed at, and whether the touch began on the ghost (so lifting it places). */
    bpPin: { tx: number; ty: number } | null = null;
    private touchConfirm = false;
    private lastPlaced: { tx: number; ty: number } | null = null;
    private lastRot = 0;
    /** What the placement rules look at: the world, the pieces in it and where the farmer stands (shared/placement.ts). */
    private env: PlaceEnv;

    constructor (private scene: Phaser.Scene, private h: PlacingHost) {
        this.env = { get world () { return h.world; }, ent: (id: number) => h.ents[id], get x () { return h.local.x; }, get y () { return h.local.y; } };
    }

    /** Where a blueprint is aimed: the tile a finger pinned, else the pointer. */
    pointerSpot () {
        return this.bpPin ? { x: (this.bpPin.tx + 0.5) * TILE, y: (this.bpPin.ty + 0.5) * TILE, aimed: true } : { x: this.h.pointerWorld.x, y: this.h.pointerWorld.y, aimed: this.h.mouseAimT > 0 };
    }

    /** A phone has no click: USE (or a tap on the ghost) drops the layout being pasted. */
    dropBlueprint () { this.h.bp.pointerDown(false); this.bpPin = null; }

    /** Mirrors the server's placement rules (leaving reach out: blueprints have their own) so the ghost can show red before you click. */
    valid (kind: BuildingKind, tx: number, ty: number) {
        return placeWhy(this.env, kind, tx, ty, null) === null;
    }

    start (kind: BuildingKind) {
        const me = this.h.meS!, def = BUILDINGS[kind];
        if (!hasUnlock(me, def.req)) return;
        if (!canAfford(me, scaledCost(me, def.cost))) return;
        this.cancel();
        const centred = isBeltLike(kind) || kind === 'drill' || kind === 'doorway';
        const ghost = this.scene.add.image(0, 0, def.tex, 0).setOrigin(centred ? 0.5 : def.floor || def.roof ? 0 : 0.5, centred ? 0.5 : def.floor || def.roof ? 0 : 1).setAlpha(0.65);
        this.cur = { kind, ghost, tx: 0, ty: 0, valid: false, why: null, pin: null, rot: def.dir ? this.lastRot : 0 };
        this.update();
    }

    cancel () {
        this.cur?.ghost.destroy();
        this.cur = null;
        this.h.aimPointer = null; this.touchConfirm = false; this.h.mouseHeld = false;
    }

    /** The scene starts again: nothing in hand, no finger remembered. */
    reset () { this.cur = null; this.bpPin = null; this.touchConfirm = false; this.lastPlaced = null; }

    /** Held input let go (window blur, menus closing). */
    release () { this.touchConfirm = false; }

    rotate () { if (this.cur) { this.cur.rot = (this.cur.rot + 1) & 3; this.lastRot = this.cur.rot; } }

    /** Turn what you are placing (R, or the phone's TURN button). */
    turn () {
        if (this.cur) this.rotate();
        else if (this.h.bp.mode === 'paste') this.h.bp.rotate();
    }

    private doorwayRotAt (tx: number, ty: number) {
        const h = this.h;
        const isW = (x: number, y: number) => { const e = h.ents[h.world.occAt(x, y) || h.world.softAt(x, y)]; return e?.k === 'bld' && (!!BUILDINGS[e.kind].wall || !!BUILDINGS[e.kind].gate); };
        return (isW(tx, ty - 1) || isW(tx, ty + 1)) && !isW(tx - 1, ty) && !isW(tx + 1, ty) ? 1 : 0;
    }

    // ── the mouse ───────────────────────────────────────────────────────────
    /** A click with a building in hand: place it, and hold to lay a line of floor or belt. */
    click () {
        this.lastPlaced = null;
        this.tryPlace();
        this.h.mouseHeld = !!this.cur && isLinePiece(this.cur.kind);
    }

    /** The button came up: a line ends here. */
    pointerUp () { this.lastPlaced = null; }

    // ── aiming with a finger (phones) ───────────────────────────────────────
    // A mouse hovers, so the ghost is already under it when you click. A finger cannot hover, so a touch has to do two things:
    // put the ghost under the finger, and place it. Lines (floors, belts, walls, roofs) just go down under the finger and a
    // drag lays the rest. Anything else is aimed with one tap and placed by tapping the ghost again (or the USE button), so a
    // thumb that lands a tile off costs nothing, and the ghost says (in red, in words) when it will not fit.
    private tileUnder () { return { tx: Math.floor(this.h.pointerWorld.x / TILE), ty: Math.floor(this.h.pointerWorld.y / TILE) }; }

    touchAimDown (p: Phaser.Input.Pointer) {
        const h = this.h;
        h.aimPointer = p;
        p.positionToCamera(this.scene.cameras.main, h.pointerWorld as Phaser.Math.Vector2);
        const t = this.tileUnder();
        this.lastPlaced = null;
        const pl = this.cur;
        if (pl) {
            if (isLinePiece(pl.kind)) { pl.pin = t; this.touchConfirm = false; this.update(); this.tryPlace(); h.mouseHeld = true; return; }
            const [w, hh] = BUILDINGS[pl.kind].size;
            this.touchConfirm = !!pl.pin && t.tx >= pl.tx && t.tx < pl.tx + w && t.ty >= pl.ty && t.ty < pl.ty + hh;
            if (!this.touchConfirm) { pl.pin = t; this.update(); if (!pl.valid) h.deny(pl.why); }
            return;
        }
        // a blueprint being pasted
        this.touchConfirm = !!this.bpPin && h.bp.covers(t.tx, t.ty);
        if (!this.touchConfirm) this.bpPin = t;
    }

    touchAimUp (p: Phaser.Input.Pointer) {
        const tap = this.touchConfirm && p.getDistance() <= TAP_SLOP;
        const pl = this.cur;
        if (tap && pl) this.tryPlace();
        else if (tap && this.h.bp.mode === 'paste') this.dropBlueprint();
        if (pl && isLinePiece(pl.kind)) pl.pin = null;              // (the ghost goes back to your feet once a line is laid)
        this.touchConfirm = false;
        this.h.aimPointer = null;
    }

    /** Each frame: a finger that is down drags the ghost along; walking lets go of it. */
    updateTouchAim () {
        const h = this.h, pl = this.cur, bp = h.bp.mode === 'paste';
        if (!pl && !bp) { this.bpPin = null; return; }
        const f = h.aimPointer;
        if (!f?.isDown && Math.abs(h.touch.mx) + Math.abs(h.touch.my) > 0.1) { if (pl) pl.pin = null; this.bpPin = null; }
        if (!f?.isDown) return;
        if (this.touchConfirm && f.getDistance() <= TAP_SLOP) return;          // (it began on the ghost and has not moved: it is a tap that will place)
        this.touchConfirm = false;
        if (pl) pl.pin = this.tileUnder(); else this.bpPin = this.tileUnder();
    }

    // ── the ghost ───────────────────────────────────────────────────────────
    update () {
        const pl = this.cur;
        if (!pl) return;
        const h = this.h, l = h.local, def = BUILDINGS[pl.kind], [w, hh] = def.size;
        const { tx: ptx, ty: pty } = feetTile(l);
        let tx = ptx + Math.round(l.face.x * 1.4), ty = pty + Math.round(l.face.y * 1.4);
        if (tx === ptx && ty === pty) ty += 1;
        if (h.mouseAimT > 0) {
            const mtx = Math.floor(h.pointerWorld.x / TILE), mty = Math.floor(h.pointerWorld.y / TILE);
            if (Math.abs(mtx - ptx) <= 5 && Math.abs(mty - pty) <= 4) { tx = mtx; ty = mty; }
        }
        if (pl.pin) { tx = pl.pin.tx; ty = pl.pin.ty; }          // (a finger put it here)
        pl.tx = tx; pl.ty = ty;
        pl.why = placeWhy(this.env, pl.kind, tx, ty);
        pl.valid = pl.why === null;
        if (pl.kind === 'doorway') { const o = h.ents[h.world.occAt(tx, ty)]; if (o?.k === 'bld' && BUILDINGS[o.kind].wall) pl.rot = this.doorwayRotAt(tx, ty); }       // set into a wall, it turns to fit it
        if (def.wall) pl.ghost.setFrame(h.wallMask(tx, ty));      // show how it will join up
        const y = (ty + hh) * TILE - 1;
        if (isBeltLike(pl.kind)) pl.ghost.setPosition((tx + 0.5) * TILE, (ty + 0.5) * TILE).setDepth(-7).setAngle((pl.rot & 3) * 90);
        else if (pl.kind === 'drill') pl.ghost.setPosition((tx + 1) * TILE, (ty + 1) * TILE).setDepth(1e4).setAngle((pl.rot & 3) * 90);
        else if (pl.kind === 'doorway') pl.ghost.setPosition((tx + 0.5) * TILE, (ty + 0.5) * TILE).setDepth(1e4).setAngle((pl.rot & 1) * 90);
        else if (def.floor) pl.ghost.setPosition(tx * TILE, ty * TILE).setDepth(-7);
        else if (def.roof) pl.ghost.setPosition(tx * TILE, ty * TILE).setDepth(4001);
        else pl.ghost.setPosition((tx + w / 2) * TILE, y).setDepth(y + 0.5);
        // hold the mouse to lay a whole line of belts or floor; the line's direction sets the belts' direction
        if (h.mouseHeld && isLinePiece(pl.kind) && pl.valid && (!this.lastPlaced || this.lastPlaced.tx !== tx || this.lastPlaced.ty !== ty)) {
            const last = this.lastPlaced;
            // a quick flick can cover several tiles between two frames: lay every tile the drag passed over
            const path = last && Math.max(Math.abs(tx - last.tx), Math.abs(ty - last.ty)) <= 8 ? tilesBetween(last, { tx, ty }) : [{ tx, ty }];
            let prev = last;
            for (const t of path) {
                if (def.dir && prev && Math.abs(t.tx - prev.tx) + Math.abs(t.ty - prev.ty) === 1) { pl.rot = t.tx > prev.tx ? 0 : t.ty > prev.ty ? 1 : t.tx < prev.tx ? 2 : 3; this.lastRot = pl.rot; }
                prev = t;
                if ((t.tx !== tx || t.ty !== ty) && placeWhy(this.env, pl.kind, t.tx, t.ty) !== null) continue;       // (a tile on the way that does not fit is skipped)
                h.send({ t: 'build', kind: pl.kind, tx: t.tx, ty: t.ty, rot: pl.rot });
            }
            this.lastPlaced = { tx, ty };
        }
        if (pl.valid) pl.ghost.clearTint().setTintMode(MULTIPLY);
        else pl.ghost.setTint(PAL.berry).setTintMode(MULTIPLY);
        pl.ghost.setAlpha(0.55 + Math.sin(this.scene.time.now / 120) * 0.15);
    }

    tryPlace () {
        const pl = this.cur, h = this.h;
        if (!pl) return;
        if (!pl.valid) { h.deny(pl.why); return; }
        const me = h.meS!, def = BUILDINGS[pl.kind];
        if (!canAfford(me, scaledCost(me, def.cost))) { h.deny('Not enough materials'); this.cancel(); return; }
        h.send({ t: 'build', kind: pl.kind, tx: pl.tx, ty: pl.ty, rot: pl.rot });
        this.lastPlaced = { tx: pl.tx, ty: pl.ty };
        // you keep building the same thing until you stop (Esc, right-click, the cancel button) or run out of materials…
        if (isOneOff(pl.kind)) this.cancel();                    // …except a station, a machine or a landmark: one is enough
        else if (!isLinePiece(pl.kind)) pl.pin = null;           // (on a phone the ghost goes back to your feet, ready to be aimed again)
    }
}
