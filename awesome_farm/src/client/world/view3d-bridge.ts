// The seam between the Game scene and the way the world is drawn.
//
// The Game scene always runs: the connection, the state mirror (ents, players, clock), your own movement, the keys, targeting,
// placing and the HUD's questions. What changes with the view setting is only who DRAWS the world and how a pointer on the screen
// becomes a spot in the world:
//
//   2D (the default)  the Game scene's own Phaser sprites, and `Pointer2D` (the Phaser camera).
//   3D (beta)         the Game scene is hidden (it still runs) and a three.js canvas under the transparent Phaser canvas draws the
//                     same state (`View3D`, made by `src/client3d/view3d.ts`, loaded on demand); `Pointer3D` raycasts into it.
//
// Everything in here is types plus two tiny classes, so the 2D bundle carries no three.js: the only way into src/client3d is the
// dynamic import in `loadView3D` (tests/view3d.test.ts checks that no static import reaches it).
//
// Coordinates: the world is in sim pixels (TILE = 16 per tile, x east, y south) everywhere on this side; the HUD is in logical
// units (VIEW_W x VIEW_H = 960 x 540). The 3D view works in tiles (x east, z south, y up) and converts at this seam.

import type * as Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../../shared/config';
import type { BuildingKind } from '../../shared/data/buildings';
import type { ItemId } from '../../shared/data/items';
import type { PlayerView } from '../../shared/net/protocol';
import type { Ent, Plot, SimEvent } from '../../shared/sim/types';
import type { World } from '../../shared/world';
import { SS } from '../res';

export interface XY { x: number; y: number }

// ── the input bridge ──────────────────────────────────────────────────────────

/**
 * Everything that turns the pointer into a place in the world goes through this: aiming swings, the building ghost, drag lines,
 * the touch aim, blueprint boxes, pings and the factory tooltips. Keyboard and stick movement never touch it.
 */
export interface WorldPointer {
    /**
     * Where a pointer (Phaser canvas pixels) is in the world, in sim pixels, written into `out`. `aim`: the pointer picks a THING
     * (a swing's target, a building's tooltip): in 3D a pointer over a model answers with that thing's aim point, so a tall tree is
     * picked by its crown and not by the ground behind it. Without `aim` it is always the ground (placing, lines, pings).
     */
    toWorld (p: Phaser.Input.Pointer, out: XY, aim?: boolean): XY;
    /** A world point (sim pixels, on the ground) on the HUD (logical units): name tags, floats, plates, chat bubbles, the tutorial's pointer. */
    toScreen (x: number, y: number): XY;
}

/** The classic view: the Game scene's own camera. */
export class Pointer2D implements WorldPointer {
    constructor (private cam: () => Phaser.Cameras.Scene2D.Camera) {}

    toWorld (p: Phaser.Input.Pointer, out: XY): XY {
        p.positionToCamera(this.cam(), out);
        return out;
    }

    toScreen (x: number, y: number): XY {
        const cam = this.cam(), v = cam.worldView, z = cam.zoom / SS;
        return { x: (x - v.x) * z, y: (y - v.y) * z };
    }
}

/** The 3D view: a ray from the camera through the pointer, onto the models or the ground. Falls back to 2D if the ray misses everything (it never should: the sea is a plane). */
export class Pointer3D implements WorldPointer {
    constructor (private view: View3D, private fallback: WorldPointer) {}

    toWorld (p: Phaser.Input.Pointer, out: XY, aim = false): XY {
        if (this.view.pointerToWorld(p.x / (VIEW_W * SS), p.y / (VIEW_H * SS), out, aim)) return out;
        return this.fallback.toWorld(p, out);
    }

    toScreen (x: number, y: number): XY { return this.view.worldToScreen(x, y); }
}

// ── the 3D view's interface ─────────────────────────────────────────────────

/** One farmer to draw this frame: where the Game scene has them (your own walked here, the others glided), facing and walking. */
export interface View3DFarmer {
    id: string;
    p: PlayerView;
    x: number;
    y: number;
    fx: number;
    fy: number;
    moving: boolean;
    /** The tool or weapon in hand (your hotbar's gear; others show their equipped tool). */
    hold?: ItemId | null;
}

/** The building in hand: the ghost to show (green when it fits, red when not). Tiles, top-left, as the `build` command takes them. */
export interface View3DPlacing { kind: BuildingKind; tx: number; ty: number; rot: number; valid: boolean }

/** What the view needs every frame, read from the Game scene (nothing in here is the view's to change). */
export interface View3DFrame {
    me: string;
    /** What the camera follows (sim pixels), and the zoom (1 is the classic distance; the Game scene's zoom steps divided by ZOOM). */
    camX: number;
    camY: number;
    zoom: number;
    /** The world clock (`clock` seconds into the day, which day, how long the night is) and the world's seed (weather). */
    clock: { clock: number; day: number; nightLen: number };
    seed: string;
    farmers: readonly View3DFarmer[];
    placing: View3DPlacing | null;
    /** The thing a swing would hit (a ring is drawn under it): a point in sim pixels and a radius in tiles. */
    target: { x: number; y: number; r: number } | null;
    /** The player's Screen shake setting. */
    shake: boolean;
}

/**
 * The 3D world view (implemented by `src/client3d/view3d.ts`). It never sends commands and never changes shared state: it is fed
 * the same mirror and events the 2D view draws from, in the same order (welcome, then per tick: plots, events, entities, gone).
 */
export interface View3D {
    /** A world arrived (join, reconnect): forget everything and build it from this state. */
    welcome (world: World, ents: Iterable<Ent>): void;
    /** An entity is new or changed (the latest state, as the tick carried it). */
    upsert (e: Ent): void;
    /** An entity is gone. */
    remove (id: number): void;
    /** Land changed: `risen` plots were just bought (they rise out of the sea), the rest only need redrawing. */
    plots (changed: readonly Plot[], risen: readonly Plot[]): void;
    /** A sim event, after the Game scene has handled it (fx bursts, telegraphs, knocks, swings). `me`: your farmer's id. */
    event (e: SimEvent, me: string): void;
    /** A farmer swung (your own swing starts here, before the server answers). */
    swing (id: string): void;
    /** Draw a frame. `dt` is the world's own time (slower in the Perfect beat). */
    frame (dt: number, f: View3DFrame): void;
    /** A pointer at (u, v), 0..1 across the canvas, onto the world (see WorldPointer.toWorld). False: nothing under it. */
    pointerToWorld (u: number, v: number, out: XY, aim: boolean): boolean;
    /** A ground point (sim pixels) to HUD units. */
    worldToScreen (x: number, y: number): XY;
    /** Take the canvas away and free the GPU. */
    dispose (): void;
}

/** What the 3D view asks of the page and of the Game scene. */
export interface View3DHost {
    /** The Phaser canvas: the 3D canvas is laid exactly under it (same box, so a pointer means the same spot on both). */
    canvas: HTMLCanvasElement;
    /** The point a swing aims at on a thing (Interact.entCenter), so a model picked in 3D scores as a direct hit in targeting. */
    entCenter (e: Ent): XY;
}

export type View3DFactory = (host: View3DHost) => View3D;

/** Load the 3D view (its own chunk, with three.js: a 2D player never downloads it). */
export function loadView3D (): Promise<View3DFactory> {
    return import('../../client3d/view3d').then((m) => m.createView3D);
}

/**
 * Can the view be switched on this page without a reload? The 3D canvas shows through the Phaser canvas, which needs a canvas made
 * transparent when the game booted (it is, when the game booted in 3D). Booted in 2D the canvas is opaque, exactly as before the
 * 3D view existed, so going to 3D takes one reload back into the same world.
 */
export function canSwitchLive (game: Phaser.Game) {
    return !!game.config.transparent;
}
