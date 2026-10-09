// What the farmer can reach and what the keys do with it: the target of a swing (a node, a monster, rock to dig), the
// building, plot, wild creature and friend near enough to use, buy, tame or help, the swing cooldown and the revive hold.

import * as Phaser from 'phaser';
import { TILE, TUNING } from '../../shared/config';
import { BODY_Y, distToBuilding as distToBld, feetTile } from '../../shared/geom';
import { BUILDINGS, StationId } from '../../shared/data/buildings';
import { MOBS } from '../../shared/data/mobs';
import { PAL } from '../../shared/palette';
import { petsFirstAt } from '../../shared/data/bond';
import { patInfo } from '../../shared/sim/bond';
import { hotKind } from '../../shared/sim/hotbar';
import type { PlayerView } from '../../shared/net/protocol';
import { countOf, derived } from '../../shared/sim/stats';
import type { ItemId } from '../../shared/data/items';
import type { BuildE, Cmd, CritE, Ent, PlayerS, Plot } from '../../shared/sim/types';
import type { World } from '../../shared/world';
import { isTouchUi } from '../input/layout';
import type { BlueprintTool } from './blueprints';
import type { Farmers, Local } from './farmers';
import type { Placer } from './placing';

export type Target = { kind: 'ent'; ent: Ent } | { kind: 'rock'; tx: number; ty: number };

/** What is close to the farmer this frame (scanNear), read by the keys, the prompt, the touch buttons and the revive hold. */
export interface Near { bld: BuildE | null; aimed: BuildE | null; take: BuildE | null; wild: CritE | null; plot: Plot | null; friend: PlayerView | null }

/** The slice of a view that targeting needs: where the thing is drawn. */
interface ViewLike { ent: Ent; x: number; y: number }

/** The slice of the Game scene interaction reads. */
interface InteractHost {
    readonly ready: boolean;
    readonly me: string;
    readonly meS: PlayerS | null;
    readonly players: Record<string, PlayerView>;
    readonly world: World;
    readonly ents: Record<number, Ent>;
    readonly clock: { day: number };
    readonly menuOpen: boolean;
    readonly views: ReadonlyMap<number, ViewLike>;
    readonly blds: ReadonlyMap<number, BuildE>;
    readonly local: Local;
    readonly keys: Record<string, Phaser.Input.Keyboard.Key>;
    readonly touch: { act: boolean; use: boolean; dem: boolean };
    readonly pointerWorld: Phaser.Math.Vector2;
    mouseAimT: number;
    readonly mouseHeld: boolean;
    readonly aimPointer: Phaser.Input.Pointer | null;
    readonly placer: Placer;
    readonly bp: BlueprintTool;
    readonly farmers: Farmers;
    /** Is the farmer down in the caves (rock within reach can be dug)? */
    readonly underNow: boolean;
    derivedMe (): ReturnType<typeof derived>;
    heldItem (): ItemId | null;
    send (c: Cmd): void;
    buyPlot (plot: Plot): void;
    /** A few sparks at a spot (the revive hold). */
    pop (x: number, y: number, n: number): void;
    /** A pointer onto the world through the view in use (world/view3d-bridge.ts); `aim` picks a thing rather than the ground. */
    toWorld (p: Phaser.Input.Pointer, out: { x: number; y: number }, aim?: boolean): unknown;
}

export class Interact {
    target: Target | null = null;
    readonly near: Near = { bld: null, aimed: null, take: null, wild: null, plot: null, friend: null };
    private swingCd = 0;
    private swingMax = 0.3;
    private reviveT = 0;
    /** The entity id of your companion's view (found once, then remembered). */
    private petViewId = -1;
    /** The hold-to-dismantle: how long X (or REMOVE) has been held, and the outline round what it would take down. */
    private demolishT = 0;
    private demoG?: Phaser.GameObjects.Graphics;
    private demoDrawn = false;

    constructor (private scene: Phaser.Scene, private h: InteractHost) {}

    /** 0..1: how much of the swing cooldown is left (for the hotbar sweep). */
    swingCooldownFrac () { return this.swingMax > 0 ? Math.max(0, Math.min(1, this.swingCd / this.swingMax)) : 0; }

    /** 0..1 progress of the hold-to-dismantle action, for the HUD ring. */
    get demolishFrac () { return this.demolishT / 0.8; }

    /** Hold X to dismantle the building you're next to (walls and doorways too; else the roof or floor you are standing under). */
    updateDismantle (dt: number) {
        const h = this.h;
        const b = h.placer.cur ? null : this.near.take;
        const holding = (h.keys.X.isDown || h.touch.dem) && !!b;
        if (holding) {
            this.demolishT += dt;
            if (this.demolishT >= 0.8) { this.demolishT = 0; h.send({ t: 'demolish', id: b!.id }); }
        } else this.demolishT = 0;
        // show what it would take down, and how far along the hold is
        const g = (this.demoG ??= this.scene.add.graphics().setDepth(9e4));
        const show = !!b && !h.menuOpen && (holding || this.near.aimed === b);
        if (show || this.demoDrawn) g.clear();
        this.demoDrawn = show;
        if (b && show) {
            const [w, hh] = BUILDINGS[b.kind].size, x = b.tx * TILE, y = b.ty * TILE;
            g.lineStyle(1, holding ? PAL.berry : PAL.cream, holding ? 1 : 0.7).strokeRect(x - 0.5, y - 0.5, w * TILE + 1, hh * TILE + 1);
            if (holding) { const p = Math.min(1, this.demolishT / 0.8); g.fillStyle(PAL.ink, 0.8).fillRect(x, y - 5, w * TILE, 3).fillStyle(PAL.berry, 1).fillRect(x, y - 5, w * TILE * p, 3); }
        }
    }

    /** Once per frame: what is near, looked for once (each key used to walk the entities again for itself). */
    scanNear () {
        const n = this.near;
        n.plot = this.plotInFront();
        n.bld = this.nearestBuilding();
        n.aimed = this.aimedPiece();
        n.take = this.dismantleTarget(n.aimed);
        n.wild = this.wildNear(70);
        n.friend = this.downedFriend();
    }

    // ── targeting and swinging ──────────────────────────────────────────────
    updateTargetAndSwing (dt: number) {
        const h = this.h;
        h.mouseAimT = Math.max(0, h.mouseAimT - dt);
        h.toWorld(h.aimPointer?.isDown ? h.aimPointer : this.scene.input.activePointer, h.pointerWorld, !h.placer.cur && !h.bp.active);       // (placing and blueprints aim at the ground)
        const me = h.meS!;
        this.target = h.placer.cur || h.bp.active || me.downed > 0 ? null : this.findTarget();
        this.swingCd -= dt;
        const held = (h.keys.SPACE.isDown || h.mouseHeld || h.touch.act) && me.co?.k !== 'frozen';       // (frozen: no swinging)
        if (held && this.target?.kind === 'rock' && this.swingCd <= 0 && !h.menuOpen) {
            const t = this.target;
            this.swingMax = this.swingCd = h.derivedMe().swingCd;
            h.send({ t: 'dig', tx: t.tx, ty: t.ty });
            h.farmers.swingAnim(h.farmers.get(h.me), (t.tx + 0.5) * TILE);
        }
        if (held && this.target?.kind === 'ent' && this.swingCd <= 0 && !h.menuOpen) {
            const e = this.target.ent;
            const d = h.derivedMe();
            this.swingMax = this.swingCd = d.swingCd * (e.k === 'mob' ? d.weapon.cd : 1);
            h.send({ t: 'swing', id: e.id });
            const c = this.entCenter(e);
            h.farmers.swingAnim(h.farmers.get(h.me), c.x, e.k === 'mob' ? me.equip.weapon : undefined);
        }
    }

    entCenter (e: Ent, v = this.h.views.get(e.id)) {
        if (e.k === 'node') return { x: (e.tx + 0.5) * TILE, y: (e.ty + 1) * TILE - 7 };
        if (e.k === 'bld') { const [w, h] = BUILDINGS[e.kind].size; return { x: (e.tx + w / 2) * TILE, y: (e.ty + h) * TILE - 7 }; }
        const big = e.k === 'mob' ? Math.min(14, MOBS[e.kind].r * 0.8) : 0;
        return { x: v?.x ?? e.x, y: (v?.y ?? e.y) - 4 - big };
    }

    private findTarget (): Target | null {
        const h = this.h, l = h.local;
        const dd = h.derivedMe();
        const hx = l.x + l.face.x * 4, hy = l.y - 5 + l.face.y * 4;
        const aim = h.mouseAimT > 0 && h.mouseHeld ? h.pointerWorld : null;
        let best: Target | null = null, bestScore = Infinity;
        const consider = (t: Target, x: number, y: number, bias: number, reach: number) => {
            const dist = Math.hypot(x - hx, y - hy);
            if (dist > reach) return;
            const dot = ((x - l.x) * l.face.x + (y - l.y) * l.face.y) / Math.max(dist, 1);
            const score = aim ? Math.hypot(x - aim.x, y - aim.y) : dist - dot * 4 + bias;
            if (score < bestScore) { bestScore = score; best = t; }
        };
        for (const v of h.views.values()) {
            const e = v.ent;
            if (e.k === 'node' || e.k === 'mob' || (e.k === 'bld' && e.kind === 'bed' && e.crop === 2)) {
                const c = this.entCenter(e, v);
                consider({ kind: 'ent', ent: e }, c.x, c.y, e.k === 'mob' ? -8 : 0, e.k === 'mob' ? Math.max(dd.reach, dd.weapon.reach) : dd.reach);
            }
        }
        if (h.underNow) {
            // rock you could dig: tiles within reach that touch open ground (the same rule the server uses)
            const w = h.world, ptx = Math.floor(l.x / TILE), pty = Math.floor((l.y - 5) / TILE);
            for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
                const tx = ptx + dx, ty = pty + dy;
                if (!w.rockAt(tx, ty) || ![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ax, ay]) => !w.rockAt(tx + ax, ty + ay) && w.isLand(tx + ax, ty + ay))) continue;
                consider({ kind: 'rock', tx, ty }, (tx + 0.5) * TILE, (ty + 0.5) * TILE, 3, dd.reach + 10);
            }
        }
        return best;
    }

    // ── friends ─────────────────────────────────────────────────────────────
    /** A friend within reach who needs a hand: one who is down (hold E to get them up) or frozen (hold E to thaw them). */
    private downedFriend (): PlayerView | null {
        const h = this.h;
        if (h.meS?.co?.k === 'frozen') return null;
        for (const p of Object.values(h.players)) {
            if (p.id === h.me || !p.online || (p.downed <= 0 && p.co?.k !== 'frozen')) continue;
            const pv = h.farmers.get(p.id);
            if (pv && Math.hypot(pv.x - h.local.x, pv.y - h.local.y) <= TUNING.reviveRange) return p;
        }
        return null;
    }

    updateRevive (dt: number) {
        const h = this.h, friend = this.near.friend;
        const holding = h.keys.E.isDown || h.touch.use;
        if (!friend || !holding || h.meS!.downed > 0 || h.menuOpen) { this.reviveT = 0; return; }
        this.reviveT -= dt;
        if (this.reviveT <= 0) {
            this.reviveT = 0.1;
            h.send({ t: 'revive', who: friend.id });
            h.pop(friend.x, friend.y - 8, 1);
        }
    }

    // ── creatures ───────────────────────────────────────────────────────────
    /** The nearest wild creature in throwing range. */
    wildNear (range = TUNING.podRange) {
        const h = this.h;
        let best: CritE | null = null, bd = range;
        for (const v of h.views.values()) {
            const e = v.ent;
            if (e.k !== 'crit' || e.mode !== 0 || e.st === 2) continue;
            const d = Math.hypot(v.x - h.local.x, v.y - h.local.y);
            if (d < bd) { bd = d; best = e; }
        }
        return best;
    }

    /** Your own companion, when it stands close enough to pet (a little nearer than the server asks, so a press is never refused). */
    petBeside (): CritE | null {
        const h = this.h, me = h.meS;
        if (!h.ready || !me?.comp || me.downed > 0) return null;
        const mine = (v: ViewLike | undefined) => (v && v.ent.k === 'crit' && v.ent.mode === 1 && v.ent.owner === h.me && v.ent.pid === me.comp ? v : undefined);
        let v = mine(h.views.get(this.petViewId));
        if (!v) {                                   // (found by looking once; after that it is remembered)
            for (const x of h.views.values()) if (mine(x)) { v = x; this.petViewId = x.ent.id; break; }
        }
        if (!v) return null;
        return Math.hypot(v.x - h.local.x, v.y - h.local.y) <= TUNING.patReach - 8 ? (v.ent as CritE) : null;
    }

    /** The bottom line while you stand still beside your companion and a pet would earn something today (affection, or the day's gift). */
    petPrompt (): string {
        const h = this.h;
        if (h.farmers.stillT < 0.6 || !this.petBeside()) return '';
        const info = patInfo(h.meS!, h.clock.day);
        return info && (info.earns || info.gift) ? `E: Pet ${info.pet.name}${info.gift ? '  (it may dig something up)' : ''}` : '';
    }

    // ── buildings and land ──────────────────────────────────────────────────
    /** The floor or roof tile at your feet (or just in front of you), for dismantling. */
    pieceHere (): BuildE | null {
        const h = this.h, l = h.local;
        const { tx, ty } = feetTile(l);
        for (const [x, y] of [[tx, ty], [tx + Math.round(l.face.x), ty + Math.round(l.face.y)]]) {
            const id = h.world.roofAt(x, y) || h.world.floorAt(x, y);
            const e = id ? h.ents[id] : undefined;
            if (e?.k === 'bld') return e;
        }
        return null;
    }

    /** The piece (wall, doorway, floor, roof or any building) you are pointing at with the mouse, or facing, if it is within reach. */
    aimedPiece (): BuildE | null {
        const h = this.h, l = h.local, reach = h.derivedMe().reach + 6;
        const aim = h.mouseAimT > 0;
        const tx = aim ? Math.floor(h.pointerWorld.x / TILE) : Math.floor(l.x / TILE) + Math.round(l.face.x);
        const ty = aim ? Math.floor(h.pointerWorld.y / TILE) : feetTile(l).ty + Math.round(l.face.y);
        const id = h.world.occAt(tx, ty) || h.world.softAt(tx, ty) || h.world.roofAt(tx, ty) || h.world.floorAt(tx, ty);
        const e = id ? h.ents[id] : undefined;
        return e?.k === 'bld' && this.distToBuilding(e) <= reach ? e : null;
    }

    /** What a press of X (or the REMOVE button) would take down: what you point at (`aimed`), else the nearest thing, else the floor or roof you stand on. */
    private dismantleTarget (aimed: BuildE | null): BuildE | null {
        const t = aimed ?? this.nearestBuilding(true) ?? this.pieceHere();
        return t && BUILDINGS[t.kind].hidden && !BUILDINGS[t.kind].grave ? null : t;          // (a ladder goes with its shaft: there is nothing to take down)
    }

    /** The building you could use or dismantle: not the floors and roofs underfoot, and (unless `any`) not walls and doorways, which have nothing to use. */
    nearestBuilding (any = false): BuildE | null {
        const reach = this.h.derivedMe().reach;
        let best: BuildE | null = null, bd = Infinity;
        for (const e of this.h.blds.values()) {
            const bd2 = BUILDINGS[e.kind];
            if (bd2.floor || bd2.roof || (!any && (bd2.wall || bd2.gate))) continue;
            const d = this.distToBuilding(e), rank = bd2.grave ? d - 24 : d;                // (your fallen backpack wins over whatever stands beside it)
            // (a potluck table is used from a few tiles away, unless land for sale is in front of you: then E buys it)
            const range = e.kind === 'table' && !any && d >= reach + 6 && d < TUNING.feastRange * TILE && !this.plotInFront() ? TUNING.feastRange * TILE : reach + 6;
            if (d < range && rank < bd) { bd = rank; best = e; }
        }
        return best;
    }

    /** From the farmer's body (the same point the server measures from) to the edge of a building. */
    distToBuilding (b: BuildE, x = this.h.local.x, y = this.h.local.y - BODY_Y) {
        return distToBld(x, y, b);
    }

    /** A crafting station of this kind within the same range the server uses. */
    stationNear (station: StationId): BuildE | null {
        if (station === 'hand') return null;
        for (const e of this.h.blds.values()) {
            if (BUILDINGS[e.kind].station === station && this.distToBuilding(e) <= TUNING.stationRange * TILE) return e;
        }
        return null;
    }

    /** The purchasable plot the player is standing at the edge of, if any. */
    plotInFront (): Plot | null {
        const h = this.h, l = h.local;
        const { tx: ptx, ty: pty } = feetTile(l);
        const dirs = [[Math.sign(Math.round(l.face.x)), Math.sign(Math.round(l.face.y))], [1, 0], [-1, 0], [0, 1], [0, -1]];
        for (const [dx, dy] of dirs) {
            if (!dx && !dy) continue;
            for (const step of [1, 2]) {
                const plot = h.world.plotAt(ptx + dx * step, pty + dy * step);
                if (plot && h.world.isPurchasable(plot)) return plot;
            }
        }
        return null;
    }

    /** The rift gate you are standing at while on an expedition (its island), or -1. */
    gateNear (): number {
        const h = this.h, me = h.meS;
        if (!me?.rift) return -1;
        const c = h.world.riftCenter(me.rift.arena);
        return Math.hypot(h.local.x - c.x, h.local.y - (c.y + 6)) < 36 ? me.rift.arena : -1;
    }

    /** E (or USE): place, drop a layout, leave the expedition, use the building, buy the land, or pet your companion. */
    interact () {
        const h = this.h;
        if (!h.ready || h.menuOpen || h.meS!.downed > 0 || h.meS!.co?.k === 'frozen') return;
        if (h.placer.cur) { h.placer.tryPlace(); return; }
        if (h.bp.active) { if (isTouchUi() && h.bp.mode === 'paste') h.placer.dropBlueprint(); return; }       // (a phone has no click: USE drops the layout)
        if (this.downedFriend()) return;   // holding E revives (updateRevive)
        if (this.gateNear() >= 0) { h.send({ t: 'rift', op: 'leave' }); return; }
        const b = this.nearestBuilding();
        if (b && !(petsFirstAt(b.kind) && this.petBeside())) {        // (a campfire or a table has nothing to use: E pets your companion instead)
            const held = h.heldItem();
            const seed = b.kind === 'bed' && held && hotKind(held) === 'seed' && countOf(h.meS!, held) > 0 ? held : undefined;   // plant the seed you have chosen
            h.send({ t: 'use', id: b.id, ...(seed ? { seed } : {}) });
            return;
        }
        const plot = this.plotInFront();
        if (plot) { h.buyPlot(plot); return; }
        if (this.petBeside()) h.send({ t: 'pat' });          // nothing else to use: pet your companion
    }
}
