// The blueprint tool: copy a stretch of the farm by dragging a rectangle, keep it in your
// blueprint book (per browser), and paste it as a ghost you can turn and drop anywhere in reach.
// Everything the server does with it is one `bp` command; see sim/economy.ts.

import * as Phaser from 'phaser';
import { BLUEPRINT_MAX, BLUEPRINT_RANGE, canTurn, captureItems, extent, totalCost, turnItems, type Blueprint } from '../../shared/blueprint';
import { TILE } from '../../shared/config';
import { feetTile } from '../../shared/geom';
import { BUILDINGS, BuildingKind, isBeltLike } from '../../shared/data/buildings';
import { ITEMS, ItemId } from '../../shared/data/items';
import { PAL } from '../../shared/palette';
import { canAfford, scaledCost } from '../../shared/sim/stats';
import type { BuildE, Cmd, Ent, PlayerS } from '../../shared/sim/types';
import { isTouchUi } from '../input/layout';
import { BLUEPRINT_KEY } from '../profile';
import { overlay3d, type View3DPlacing } from './view3d-bridge';

// ── the book ────────────────────────────────────────────────────────────────
export const MAX_SAVED = 14;

export function loadBlueprints (): Blueprint[] {
    try {
        const raw = JSON.parse(localStorage.getItem(BLUEPRINT_KEY) ?? '[]');
        if (!Array.isArray(raw)) return [];
        // anything that no longer matches the game's buildings is dropped quietly
        return raw.filter((b): b is Blueprint => b && typeof b.id === 'string' && Array.isArray(b.items) && b.items.every((it: { kind: string }) => !!BUILDINGS[it.kind as BuildingKind])).slice(0, MAX_SAVED);
    } catch { return []; }
}
export function saveBlueprints (list: Blueprint[]) {
    try { localStorage.setItem(BLUEPRINT_KEY, JSON.stringify(list.slice(0, MAX_SAVED))); } catch { /* private mode: it just will not persist */ }
}

// ── the tool ────────────────────────────────────────────────────────────────
interface BpHost {
    ents: Record<number, Ent>;
    local: { x: number; y: number; face: { x: number; y: number } };
    pointer (): { x: number; y: number; aimed: boolean };
    me (): PlayerS;
    send (c: Cmd): void;
    valid (kind: BuildingKind, tx: number, ty: number): boolean;
    say (text: string, color?: number): void;
    saved (bp: Blueprint): void;
}

interface Ghost { img: Phaser.GameObjects.Image; kind: BuildingKind }

export class BlueprintTool {
    mode: 'off' | 'select' | 'paste' = 'off';
    private g: Phaser.GameObjects.Graphics;
    private from: { tx: number; ty: number } | null = null;
    private to: { tx: number; ty: number } | null = null;
    private bp: Blueprint | null = null;
    private items: Blueprint['items'] = [];
    private ghosts: Ghost[] = [];
    private anchor = { tx: 0, ty: 0 };
    private fit = 0;
    private missing = '';
    private inRange = true;
    /** Where each piece of the layout being pasted would go, and whether it fits (the 3D view's ghosts; updated with the 2D ones). */
    readonly ghostSpots: View3DPlacing[] = [];

    constructor (private scene: Phaser.Scene, private h: BpHost) {
        this.g = overlay3d(scene.add.graphics().setDepth(1e5 + 5));          // (the box and outline are world overlays; the 3D view builds its own ghosts from `ghostSpots`)
    }

    get active () { return this.mode !== 'off'; }

    /** Is this tile under the layout being pasted? (On a phone a second tap on the ghost drops it.) */
    covers (tx: number, ty: number) {
        if (this.mode !== 'paste') return false;
        const box = extent(this.items);
        return tx >= this.anchor.tx && tx < this.anchor.tx + box.w && ty >= this.anchor.ty && ty < this.anchor.ty + box.h;
    }

    startSelect () {
        this.cancel();
        this.mode = 'select';
    }

    startPaste (bp: Blueprint) {
        this.cancel();
        this.bp = bp;
        this.items = bp.items.map((it) => ({ ...it }));
        this.mode = 'paste';
        this.buildGhosts();
    }

    cancel () {
        for (const g of this.ghosts) g.img.destroy();
        this.ghosts = [];
        this.mode = 'off';
        this.from = this.to = null;
        this.bp = null;
        this.ghostSpots.length = 0;
        this.g.clear();
    }

    private buildGhosts () {
        for (const g of this.ghosts) g.img.destroy();
        this.ghosts = this.items.map((it) => {
            const def = BUILDINGS[it.kind];
            const centred = isBeltLike(it.kind) || it.kind === 'drill';
            const img = this.scene.add.image(0, 0, def.tex, 0).setOrigin(centred ? 0.5 : def.floor ? 0 : 0.5, centred ? 0.5 : def.floor ? 0 : 1).setAlpha(0.6).setDepth(1e5 + 1);
            return { img, kind: it.kind };
        });
    }

    /** Turn the layout a quarter clockwise, if it can be turned. */
    rotate () {
        if (this.mode !== 'paste') return;
        if (!canTurn(this.items)) { this.h.say('This layout cannot be turned (it has pieces that are not square)', PAL.cream); return; }
        this.items = turnItems(this.items);
    }

    /** A click. Returns true when the tool used it. */
    pointerDown (right: boolean): boolean {
        if (this.mode === 'off') return false;
        if (right) { this.cancel(); return true; }
        const p = this.h.pointer();
        if (this.mode === 'select') {
            const t = { tx: Math.floor(p.x / TILE), ty: Math.floor(p.y / TILE) };
            this.from = t; this.to = t;
            return true;
        }
        this.place();
        return true;
    }

    pointerUp () {
        if (this.mode !== 'select' || !this.from || !this.to) return;
        const x0 = Math.min(this.from.tx, this.to.tx), x1 = Math.max(this.from.tx, this.to.tx), y0 = Math.min(this.from.ty, this.to.ty), y1 = Math.max(this.from.ty, this.to.ty);
        this.from = this.to = null;
        const blds = Object.values(this.h.ents).filter((e): e is BuildE => e.k === 'bld');
        const items = captureItems(blds, x0, y0, x1, y1);
        if (!items) { this.h.say('Nothing to copy in there: drag around the buildings you want', PAL.cream); return; }
        if (items.length > BLUEPRINT_MAX) { this.h.say(`Too big: a blueprint holds up to ${BLUEPRINT_MAX} pieces (that was ${items.length})`, PAL.berry); return; }
        const bp: Blueprint = { id: Date.now().toString(36), name: '', items };
        this.h.saved(bp);                 // the scene names and stores it
        this.startPaste(bp);
    }

    private place () {
        if (!this.bp) return;
        if (!this.inRange) { this.h.say('Too far from you: step closer or aim nearer', PAL.berry); return; }
        if (this.fit === 0) { this.h.say("Nothing fits there", PAL.berry); return; }
        this.h.send({ t: 'bp', tx: this.anchor.tx, ty: this.anchor.ty, items: this.items });
    }

    /** What the HUD prompt says while the tool is on. */
    prompt (): string {
        const touch = isTouchUi();
        if (this.mode === 'select') return this.from ? (touch ? 'Lift your finger to copy everything inside the box' : 'Release to copy everything inside the box') : touch ? 'Drag a box around what you want to copy  ·  CANCEL: stop' : 'Drag a box around what you want to copy  ·  right-click / Esc: cancel';
        if (this.mode === 'paste') {
            const n = this.items.length;
            if (touch) return `Tap to aim, tap again (or USE) to place ${n} piece${n > 1 ? 's' : ''} (${this.fit} fit)${canTurn(this.items) ? '  ·  TURN' : ''}${this.missing ? `  ·  ${this.missing}` : ''}`;
            const turn = canTurn(this.items) ? '  ·  R: turn' : '';
            return `Click: place ${n} piece${n > 1 ? 's' : ''} (${this.fit} fit)${turn}  ·  right-click / Esc: stop${this.missing ? `  ·  ${this.missing}` : ''}`;
        }
        return '';
    }

    update () {
        const g = this.g;
        g.clear();
        if (this.mode === 'select') {
            const p = this.h.pointer();
            const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE);
            if (this.from) this.to = { tx, ty };
            if (this.from && this.to) {
                const x0 = Math.min(this.from.tx, this.to.tx), x1 = Math.max(this.from.tx, this.to.tx), y0 = Math.min(this.from.ty, this.to.ty), y1 = Math.max(this.from.ty, this.to.ty);
                g.fillStyle(PAL.foam, 0.16).fillRect(x0 * TILE, y0 * TILE, (x1 - x0 + 1) * TILE, (y1 - y0 + 1) * TILE);
                g.lineStyle(1, PAL.foam, 0.95).strokeRect(x0 * TILE + 0.5, y0 * TILE + 0.5, (x1 - x0 + 1) * TILE - 1, (y1 - y0 + 1) * TILE - 1);
                // pieces that would be taken light up
                const blds = Object.values(this.h.ents).filter((e): e is BuildE => e.k === 'bld');
                for (const b of blds) {
                    const [w, h] = BUILDINGS[b.kind].size;
                    if (b.tx >= x0 && b.ty >= y0 && b.tx + w - 1 <= x1 && b.ty + h - 1 <= y1) g.lineStyle(1, PAL.gold, 0.9).strokeRect(b.tx * TILE + 0.5, b.ty * TILE + 0.5, w * TILE - 1, h * TILE - 1);
                }
            } else g.lineStyle(1, PAL.foam, 0.8).strokeRect(tx * TILE + 0.5, ty * TILE + 0.5, TILE - 1, TILE - 1);
            return;
        }
        if (this.mode !== 'paste') return;
        // where the layout would land: under the pointer, or in front of the player
        const l = this.h.local, p = this.h.pointer();
        const { tx: ptx, ty: pty } = feetTile(l);
        const box = extent(this.items);
        let ax = ptx + Math.round(l.face.x * 3), ay = pty + Math.round(l.face.y * 3);
        if (p.aimed) { ax = Math.floor(p.x / TILE); ay = Math.floor(p.y / TILE); }
        this.anchor = { tx: ax, ty: ay };
        this.inRange = Math.max(Math.abs(ax - ptx), Math.abs(ay - pty)) <= BLUEPRINT_RANGE && Math.max(Math.abs(ax + box.w - 1 - ptx), Math.abs(ay + box.h - 1 - pty)) <= BLUEPRINT_RANGE + 6;
        let fit = 0;
        const me = this.h.me();
        const need: Record<string, number> = {};
        const spots = this.ghostSpots;
        spots.length = this.items.length;
        this.items.forEach((it, i) => {
            const tx = ax + it.dx, ty = ay + it.dy;
            const def = BUILDINGS[it.kind];
            const [w, h] = def.size;
            const ok = this.inRange && this.h.valid(it.kind, tx, ty);
            if (ok) { fit++; for (const [res, n] of Object.entries(scaledCost(me, def.cost))) need[res] = (need[res] ?? 0) + n; }
            const spot = (spots[i] ??= { kind: it.kind, tx, ty, rot: 0, valid: ok });
            spot.kind = it.kind; spot.tx = tx; spot.ty = ty; spot.rot = it.rot ?? 0; spot.valid = ok;
            const ghost = this.ghosts[i];
            if (!ghost) return;
            const centred = isBeltLike(it.kind) || it.kind === 'drill';
            const y = (ty + h) * TILE - 1;
            if (isBeltLike(it.kind)) ghost.img.setPosition((tx + 0.5) * TILE, (ty + 0.5) * TILE).setAngle((it.rot & 3) * 90);
            else if (it.kind === 'drill') ghost.img.setPosition((tx + 1) * TILE, (ty + 1) * TILE).setAngle((it.rot & 3) * 90);
            else if (def.floor) ghost.img.setPosition(tx * TILE, ty * TILE);
            else ghost.img.setPosition((tx + w / 2) * TILE, y);
            void centred;
            if (ok) ghost.img.clearTint().setTintMode(Phaser.TintModes.MULTIPLY); else ghost.img.setTint(PAL.berry).setTintMode(Phaser.TintModes.MULTIPLY);
            ghost.img.setAlpha(0.5 + Math.sin(this.scene.time.now / 140) * 0.1);
        });
        this.fit = fit;
        // what is missing for the pieces that fit
        const lack = Object.entries(need).filter(([res, n]) => !canAfford(me, { [res]: n } as never));
        this.missing = lack.length ? `short of ${lack.slice(0, 3).map(([res, n]) => `${n}× ${ITEMS[res as ItemId]?.name ?? res}`).join(', ')}` : '';
        // an outline around the whole layout
        g.lineStyle(1, this.inRange ? PAL.lime : PAL.berry, 0.7).strokeRect(ax * TILE + 0.5, ay * TILE + 0.5, box.w * TILE - 1, box.h * TILE - 1);
    }

    /** The blueprint being pasted (for the HUD). */
    get current () { return this.bp; }
    get cost () { return this.bp ? totalCost(this.items) : {}; }

    destroy () { this.cancel(); this.g.destroy(); }
}
