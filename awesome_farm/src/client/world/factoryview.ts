// Factory clarity, on the world side: a status badge over every machine (a green gear, a yellow hourglass, a red
// bolt, cross or flame), a pick-to-drop arrow on every inserter, a tooltip when you hover (or long-press) a
// building, and the Factory view (L): the ground dims and the power grids, flows and rates light up. It also runs the
// machines as you see them: belts rolling, items riding them, inserter arms swinging, frames that follow the clock, the
// weather vane turning, the power wires between poles and the squares and arrow under a building being placed.
//
// Everything is driven from a refresh a few times a second over what is on screen, never per frame:
// badges are pooled images, the overlays are two Graphics objects redrawn only when something changed, and
// the labels are handed to the HUD (which owns the crisp text) through `labels`. Only the arms, the belt items and
// the placement overlay move every frame.

import * as Phaser from 'phaser';
import { TILE } from '../../shared/config';
import { BUILDINGS, BuildingKind, isBeltLike } from '../../shared/data/buildings';
import { vaneIcon } from '../../shared/data/forecast';
import { HOWTO } from '../../shared/data/howto';
import { iconOf, ITEMS } from '../../shared/data/items';
import { PAL } from '../../shared/palette';
import { sunlight } from '../../shared/daylight';
import { forecast, hash } from '../../shared/weather';
import { DIRS, tunnelPartner } from '../../shared/sim/factory';
import { buildPowerGraph, nearestPole, netStats, PowerGraph, SUPPLY, wind } from '../../shared/sim/power';
import { badgeOf, isFactoryPiece, statusOf, type Badge, type PowerInfo, type Status, type StatusEnv, type StatusState } from '../../shared/sim/status';
import { hasUnlock } from '../../shared/sim/stats';
import type { BuildE, Ent, PlayerS } from '../../shared/sim/types';
import type { World } from '../../shared/world';
import { badgeTex, ensureBadgeArt } from '../art/badges';
import { playSfx } from '../juice/sfx';
import { SS } from '../res';
import type { TipData } from '../ui/kit';
import { squash } from './farmers';
import type { Placing } from './placing';
import { overlay3d } from './view3d-bridge';

type Img = Phaser.GameObjects.Image;
type Spr = Phaser.GameObjects.Sprite;

/** The slice of Game's EntView a running machine needs: its sprite and the little pictures that ride on it. */
interface BuildView {
    ent: Ent;
    sprite: Img | Spr;
    x: number;
    y: number;
    items?: Img[];         // belt: sprites for the three slots
    hand?: Img;            // inserter: what it is holding (sorter, chute: the filter item)
    swing?: number;        // inserter arm position 0..1 (smoothed)
    link?: Phaser.GameObjects.Graphics;    // tunnel entrance: the dotted line to its exit
    linkKey?: string;
    frame?: number;        // the frame the sprite was last given (so it is set only when it changes)
    blades?: Img;          // windmill, turbine: the blades; weather vane: the arrow
    sky?: Img;             // weather vane: a little picture of tomorrow's weather over it
    vday?: number;         // … and the day it was drawn for
    vang?: number;         // … the heading the arrow has swung to (radians)
}

interface FactoryHost {
    readonly world: World;
    readonly ents: Record<number, Ent>;
    readonly clock: { time: number; clock: number; day: number; nightLen: number };
    readonly seed: string;
    /** Every building in the world (poles and machines are picked out for the wires), and the version that changes when one comes or goes. */
    readonly blds: ReadonlyMap<number, BuildE>;
    readonly bldVersion: number;
    /** The views on screen this frame (the arms are drawn for the inserters among them). */
    readonly visViews: ReadonlyArray<{ ent: Ent; x: number; y: number; swing?: number; hand?: Img }>;
    readonly placing: Placing | null;
    me (): PlayerS | null;
    /** Hand the HUD a tooltip to show (null: take it away). */
    tip (d: TipData | null): void;
    /** A window is open, a build tool is on, or the pointer is over a HUD control: no hover tooltips. */
    busy (): boolean;
    /** A few sparks at a spot. */
    pop (x: number, y: number, n: number): void;
    /** A pointer onto the world through the view in use (world/view3d-bridge.ts); `aim` picks the thing under it. */
    toWorld (p: Phaser.Input.Pointer, out: { x: number; y: number }, aim?: boolean): unknown;
    /** The part of the world on screen (sim pixels), in the view in use (the 3D ground reaches a little further north and south). */
    view (): Phaser.Geom.Rectangle;
}

/** Buildings whose frame follows the clock (`t`, seconds) and their own state: `working` is act and power, `sun` the daylight. */
const FRAME_OF: Partial<Record<BuildingKind, (e: BuildE, t: number, working: boolean, sun: number) => number>> = {
    drill: (_e, t, working) => (working ? Math.floor(t * 8) % 2 : 0),
    assembler: (_e, t, working) => (working ? Math.floor(t * 8) % 2 : 0),
    coalgen: (e, t) => ((e.act ?? 0) > 0 ? Math.floor(t * 6) % 2 : 0),
    solar: (e, t, _w, sun) => (sun > 0.4 ? Math.floor(t * 0.9 + e.id) % 2 : 0),
    battery: (e) => Math.min(4, Math.round(((e.chg ?? 0) / BUILDINGS.battery.store!) * 4)),
    altar: (_e, t) => Math.floor(t * 1.8) % 2,
    dock: (e, t) => Math.floor(t * 1.6 + e.id) % 2,
    riftforge: (e, t) => Math.floor(t * 1.6 + e.id) % 2,
    hatchery: (e, t) => (e.egg ? 3 + (Math.floor(t * 3) % 2) : e.par ? 1 + (Math.floor(t * 1.5) % 2) : 0),
    waystone: (_e, t) => Math.floor(t * 1.2) % 2,
    fountain: (_e, t) => Math.floor(t * 3) % 2,
    banner: (e, t) => Math.floor(t * 1.5 + e.id) % 2,
    lamppost: (e, t) => Math.floor(t * 1.5 + e.id) % 2,
    mailbox: (e) => (e.flag ? 1 : 0),
};

/** Set a sprite's frame only when it changes (setFrame looks the frame up and resizes every time). */
function frame (v: BuildView, f: number) {
    if (v.frame === f) return;
    v.frame = f;
    (v.sprite as Img).setFrame(f);
}

/** Give a small icon image a texture only when it changes (setTexture always looks it up and resets the frame). */
function icon (im: Img, tex: string) {
    if (im.texture.key !== tex) im.setTexture(tex, 0);
    return im;
}

/** One caption for the HUD to draw over the world (world position, in pixels). */
interface FvLabel { x: number; y: number; text: string; color: number; size: number }

interface Entry {
    e: BuildE;
    badge: Badge | null;
    st: Status | null;
    img: Phaser.GameObjects.Image | null;
    belt: boolean;
    /** The badge is popping in until this time (ms): leave its scale alone. */
    pop: number;
}

/** How often the world is looked at again (seconds). */
const REFRESH = 0.25;
const MARGIN = 3 * TILE;
const MAX_LABELS = 56;
const NET_COLORS = [PAL.gold, PAL.sea, PAL.blossom, PAL.lime, PAL.pumpkin, PAL.plum, PAL.foam];
const LONG_PRESS = 450;
/** In 3D: status badges float this high (tiles) over the ground, clear of the machine models. */
const BADGE_LIFT = 0.9;

/** The pole of a net closest to a member (where its feed wire is drawn from). */
export const STATE_WORDS: Record<StatusState, [string, number]> = {
    working: ['Working', PAL.lime], waiting: ['Waiting', PAL.gold], idle: ['Idle', PAL.pebble], ok: ['', PAL.pebble],
    nofuel: ['Out of fuel', PAL.berry], nopower: ['No power', PAL.berry], full: ['Blocked', PAL.berry], norecipe: ['No recipe', PAL.berry],
    noin: ['Blocked', PAL.berry], noout: ['Blocked', PAL.berry], noore: ['No ore', PAL.berry], locked: ['Locked', PAL.berry],
};

export class FactoryView {
    /** The Factory view toggle. */
    on = false;
    /** Captions for the HUD this frame (a fixed-size pool: only the first `nLabels` count). */
    readonly labels: FvLabel[] = [];
    nLabels = 0;

    private entries = new Map<number, Entry>();
    private all: Entry[] = [];
    private vis: Entry[] = [];
    private badged: Entry[] = [];
    private graph: PowerGraph | null = null;
    private graphDirty = true;
    private infos: PowerInfo[] = [];
    private pool: Phaser.GameObjects.Image[] = [];
    private t = 0;
    private refreshIn = 0;
    private dim: Phaser.GameObjects.Rectangle;
    private g: Phaser.GameObjects.Graphics;
    private mk: Phaser.GameObjects.Graphics;
    private env: StatusEnv;
    private drawn = { x: -1e9, y: -1e9, sig: -1, on: false, mk: -1 };
    private vec = new Phaser.Math.Vector2();
    // hover / long press
    private shownId = -1;
    private still = 0;
    private lastPx = -1;
    private lastPy = -1;
    private wasDown = false;
    private pressAt = 0;
    private pressX = 0;
    private pressY = 0;
    private tipUntil = 0;
    // the wires (poles to poles, feeds to machines) and the arms and placement overlay
    /** The power graph for every building (`v`: the bldVersion it was built from) and the nets with a generator on them. */
    private wires: { v: number; g: PowerGraph } | null = null;
    private wiresG: Phaser.GameObjects.Graphics;
    private wiresAt = { v: -1, x: -1e9, y: -1e9, w: 0 };
    private fxg: Phaser.GameObjects.Graphics;
    /** The inserter arms (their own Graphics, under the placement overlay as before, so the 3D view can leave them to its models). */
    private arms: Phaser.GameObjects.Graphics;
    private fxDrawn = false;

    constructor (private scene: Phaser.Scene, private h: FactoryHost) {
        const s = scene;
        ensureBadgeArt(s);
        for (let i = 0; i < MAX_LABELS; i++) this.labels.push({ x: 0, y: 0, text: '', color: PAL.cream, size: 12 });
        // (the dim, the Factory view, the inserter marks and the placement overlay are world overlays the 3D view shows too; its
        // models have their own wires, inserter arms and belt items, so those stay 2D only)
        this.dim = overlay3d(s.add.rectangle(0, 0, 10, 10, PAL.ink, 0.5).setOrigin(0).setDepth(-9.6).setVisible(false));
        this.g = overlay3d(s.add.graphics().setDepth(9.5e3));
        this.mk = overlay3d(s.add.graphics().setDepth(4.9e4));
        this.wiresG = s.add.graphics().setDepth(5e4 - 1);
        this.arms = s.add.graphics().setDepth(5e4);
        this.fxg = overlay3d(s.add.graphics().setDepth(5e4));
        const at = (tx: number, ty: number): BuildE | null => {
            const id = h.world.occAt(tx, ty) || h.world.floorAt(tx, ty);
            const e = id ? h.ents[id] : null;
            return e && e.k === 'bld' ? e : null;
        };
        this.env = {
            at,
            veinAt: (tx, ty) => h.world.veinAt(tx, ty),
            power: (b) => { const net = this.graph?.netOf.get(b.id); return net ? this.infos[net.id] ?? null : null; },
            wind: 0.68,
            sun: 1,
            unlocked: (req, owner) => {
                const me = h.me();
                return !req || !me || owner !== me.id || hasUnlock(me, req);
            },
        };
    }

    /** How many factory buildings the world has (the HUD shows its toggle button once there are some). */
    get size () { return this.entries.size; }

    /** What the machine windows and tooltips ask the shared status rules with. */
    get statusEnv (): StatusEnv { return this.env; }
    statusFor (b: BuildE): Status { return statusOf(b, this.env); }

    // ── the world tells us what changed ─────────────────────────────────────
    add (e: BuildE) {
        if (!isFactoryPiece(e.kind)) return;
        let en = this.entries.get(e.id);
        if (!en) {
            en = { e, badge: null, st: null, img: null, belt: isBeltLike(e.kind), pop: 0 };
            this.entries.set(e.id, en);
            this.all.push(en);
        } else en.e = e;
        const d = BUILDINGS[e.kind];
        if (d.pole || d.gen || d.use || d.store) this.graphDirty = true;
        this.refreshIn = Math.min(this.refreshIn, 0.05);
    }

    touch (e: BuildE) {
        const en = this.entries.get(e.id);
        if (en) en.e = e; else this.add(e);
    }

    remove (id: number) {
        const en = this.entries.get(id);
        if (!en) return;
        this.release(en);
        this.entries.delete(id);
        const i = this.all.indexOf(en);
        if (i >= 0) { this.all[i] = this.all[this.all.length - 1]; this.all.pop(); }
        const d = BUILDINGS[en.e.kind];
        if (d.pole || d.gen || d.use || d.store) this.graphDirty = true;
        if (this.shownId === id) this.dropTip();
    }

    clear () {
        for (const en of this.all) this.release(en);
        this.entries.clear();
        this.all.length = 0; this.vis.length = 0; this.badged.length = 0;
        this.graph = null; this.graphDirty = true;
        this.dropTip();
    }

    toggle (on = !this.on) {
        playSfx('ui', on ? 1.15 : 0.9);       // (a window-style click: a UI toggle is not a world action, so no burst or shake)
        this.on = on;
        this.drawn.sig = -1;
        this.dim.setVisible(on);
        if (!on) { this.g.clear(); this.nLabels = 0; }
        this.refreshIn = 0;
    }

    // ── per frame (cheap) ───────────────────────────────────────────────────
    update (dt: number) {
        this.t += dt;
        this.refreshIn -= dt;
        if (this.refreshIn <= 0) { this.refreshIn = REFRESH; this.refresh(); }
        this.animateBadges();
        this.hover(dt);
        if (this.on) {
            const wv = this.h.view();
            this.dim.setPosition(wv.x - TILE, wv.y - TILE).setSize(wv.width + TILE * 2, wv.height + TILE * 2);         // (a tile spare: the 3D camera may glide a little before the next frame)
        }
    }

    // ── the refresh: a few times a second, over what is on screen ───────────
    private refresh () {
        const h = this.h, wv = h.view();
        const c = h.clock;
        this.env.wind = wind(c.time);
        this.env.sun = sunlight(c.clock, c.nightLen);
        this.env.time = c.time;
        if (this.graphDirty || !this.graph) {
            this.graph = buildPowerGraph(this.all.map((en) => en.e));
            this.graphDirty = false;
        }
        for (const net of this.graph.nets) {
            const st = netStats(net, c.time, this.env.sun);
            net.gen = st.gen; net.use = st.use; net.ratio = st.ratio;
            const info = (this.infos[net.id] ??= { poles: 0, members: 0, gen: 0, use: 0, ratio: 1 });
            info.poles = net.poles.length; info.members = net.members.length; info.gen = st.gen; info.use = st.use; info.ratio = st.ratio;
        }
        // what is near enough to bother with
        const x0 = wv.x - MARGIN, x1 = wv.right + MARGIN, y0 = wv.y - MARGIN, y1 = wv.bottom + MARGIN;
        this.vis.length = 0;
        let sig = 0;
        for (const en of this.all) {
            const e = en.e, d = BUILDINGS[e.kind];
            const px = e.tx * TILE, py = e.ty * TILE;
            const inside = px + d.size[0] * TILE >= x0 && px <= x1 && py + d.size[1] * TILE >= y0 && py <= y1;
            if (!inside) { if (en.img) this.release(en); en.badge = null; en.st = null; continue; }
            this.vis.push(en);
            if (en.belt) { en.badge = badgeOf(e, this.env); en.st = null; } else { en.st = statusOf(e, this.env); en.badge = en.st.badge; }
            // a cheap signature of what the overlay would show
            sig = (sig * 31 + e.id * 7 + (en.badge ? en.badge.charCodeAt(1) : 1) + ((e.rot & 3) << 3) + Math.round((en.st?.rate ?? 0) * 3) + Math.round(en.st?.coins ?? 0)) | 0;
        }
        // badges
        this.badged.length = 0;
        const now = this.scene.time.now;
        for (const en of this.vis) {
            if (!en.badge) { if (en.img) this.release(en); continue; }
            this.badged.push(en);
            const tex = badgeTex(en.badge);
            if (!en.img) {
                en.img = this.pool.pop() ?? overlay3d(this.scene.add.image(0, 0, tex, 0).setDepth(1e4), BADGE_LIFT);
                en.img.setVisible(true).setTexture(tex, 0).setAlpha(1);
                this.place(en);
                const im = en.img;
                im.setScale(0.2); en.pop = now + 200;
                this.scene.tweens.add({ targets: im, scale: 1, duration: 160, ease: 'Back.easeOut' });
            } else if (en.img.texture.key !== tex) {
                en.img.setTexture(tex, 0);
                const im = en.img;
                im.setScale(1.5); en.pop = now + 200;
                this.scene.tweens.add({ targets: im, scale: 1, duration: 150, ease: 'Back.easeOut' });
            }
        }
        this.drawMarks(sig);
        if (this.on) {
            const moved = Math.abs(wv.centerX - this.drawn.x) + Math.abs(wv.centerY - this.drawn.y) > 56;
            if (sig !== this.drawn.sig || !this.drawn.on || moved) { this.drawn.sig = sig; this.drawn.x = wv.centerX; this.drawn.y = wv.centerY; this.drawn.on = true; this.drawOverlay(); }
        } else this.drawn.on = false;
        // a tooltip that is up stays true to the building
        if (this.shownId >= 0) { const en = this.entries.get(this.shownId); if (en) this.h.tip(this.tipFor(en)); }
    }

    private place (en: Entry) {
        const d = BUILDINGS[en.e.kind], e = en.e;
        const flat = !!d.floor || e.kind === 'inserter';
        // centred over the building, just above its top edge (belts and inserters are flat: above the tile)
        en.img!.setPosition(Math.round((e.tx + d.size[0] / 2) * TILE), Math.round(e.ty * TILE + (flat ? -2 : -1) - (d.size[1] > 1 ? 0 : 3)));
    }

    private release (en: Entry) {
        if (!en.img) return;
        this.scene.tweens.killTweensOf(en.img);
        en.img.setVisible(false).setScale(1);
        en.pop = 0;
        this.pool.push(en.img);
        en.img = null;
    }

    private animateBadges () {
        const t = this.t, now = this.scene.time.now;
        for (const en of this.badged) {
            const im = en.img;
            if (!im || now < en.pop) continue;
            if (en.badge === 'work') im.setScale(1);
            else if (en.badge === 'wait') im.setScale(1);
            else im.setScale(1 + 0.1 * Math.max(0, Math.sin(t * 6 + en.e.id)));
        }
    }

    // ── permanent marks: inserters show where they pick up and where they drop ─
    private drawMarks (sig: number) {
        let key = sig;
        for (const en of this.vis) if (en.e.kind === 'inserter') key = (key * 17 + en.e.id + (en.e.pw ?? 0) * 40 + (en.e.rot & 3)) | 0;
        if (key === this.drawn.mk) return;
        this.drawn.mk = key;
        const g = this.mk;
        g.clear();
        for (const en of this.vis) {
            const e = en.e;
            if (e.kind !== 'inserter') continue;
            const [dx, dy] = DIRS[e.rot & 3];
            const cx = (e.tx + 0.5) * TILE, cy = (e.ty + 0.5) * TILE;
            const live = (e.pw ?? 0) > 0.05;
            // pick-up end: a small ring; drop end: a bold arrowhead
            const bx = cx - dx * 6.5, by = cy - dy * 6.5;
            g.fillStyle(PAL.ink, 1).fillCircle(bx, by, 2.2);
            g.fillStyle(live ? PAL.cream : PAL.stone, 1).fillCircle(bx, by, 1.2);
            const tx = cx + dx * 8, ty = cy + dy * 8, hx = cx + dx * 3.2, hy = cy + dy * 3.2;
            g.fillStyle(PAL.ink, 1).fillTriangle(hx - dy * 4, hy + dx * 4, hx + dy * 4, hy - dx * 4, tx + dx * 1, ty + dy * 1);
            g.fillStyle(live ? PAL.gold : PAL.stone, 1).fillTriangle(hx - dy * 2.8 + dx * 0.6, hy + dx * 2.8 + dy * 0.6, hx + dy * 2.8 + dx * 0.6, hy - dx * 2.8 + dy * 0.6, tx - dx * 0.4, ty - dy * 0.4);
        }
    }

    // ── the Factory view ────────────────────────────────────────────────────
    private label (x: number, y: number, text: string, color: number, size = 12) {
        if (this.nLabels >= MAX_LABELS) return;
        const l = this.labels[this.nLabels++];
        l.x = x; l.y = y; l.text = text; l.color = color; l.size = size;
    }

    private drawOverlay () {
        const g = this.g, graph = this.graph!;
        g.clear();
        this.nLabels = 0;
        const wv = this.h.view();
        const near = (x: number, y: number, m = 120) => x > wv.x - m && x < wv.right + m && y > wv.y - m && y < wv.bottom + m;
        // power grids: each its own colour
        for (const net of graph.nets) {
            const col = NET_COLORS[net.id % NET_COLORS.length];
            const info = this.infos[net.id];
            for (const [a, b] of graph.links) {
                if (graph.netOf.get(a.id) !== net) continue;
                const ax = (a.tx + 0.5) * TILE, ay = (a.ty + 0.5) * TILE, bx = (b.tx + 0.5) * TILE, by = (b.ty + 0.5) * TILE;
                if (!near(ax, ay) && !near(bx, by)) continue;
                g.lineStyle(3, PAL.ink, 0.9).lineBetween(ax, ay, bx, by);
                g.lineStyle(1.5, col, 1).lineBetween(ax, ay, bx, by);
            }
            let lx = 0, ly = 0, ln = 0;
            for (const p of net.poles) {
                const px = (p.tx + 0.5) * TILE, py = (p.ty + 0.5) * TILE;
                if (near(px, py)) { g.fillStyle(PAL.ink, 1).fillCircle(px, py, 4.5); g.fillStyle(col, 1).fillCircle(px, py, 3.2); }
                lx += px; ly += py; ln++;
            }
            for (const m of net.members) {
                const d = BUILDINGS[m.kind], mx = (m.tx + d.size[0] / 2) * TILE, my = (m.ty + d.size[1] / 2) * TILE;
                if (!near(mx, my)) continue;
                const nearest = nearestPole(net, m);
                g.lineStyle(1, col, 0.55).lineBetween((nearest.tx + 0.5) * TILE, (nearest.ty + 0.5) * TILE, mx, my);
                g.lineStyle(2, PAL.ink, 0.8).strokeRect(m.tx * TILE - 1, m.ty * TILE - 1, d.size[0] * TILE + 2, d.size[1] * TILE + 2);
                g.lineStyle(1, col, 1).strokeRect(m.tx * TILE - 0.5, m.ty * TILE - 0.5, d.size[0] * TILE + 1, d.size[1] * TILE + 1);
            }
            if (ln && info && near(lx / ln, ly / ln, 40)) {
                const pct = Math.round(info.ratio * 100);
                this.label(lx / ln, ly / ln - 18, `${pct}%  ·  makes ${Math.round(info.gen)}, uses ${Math.round(info.use)}`, pct < 50 ? PAL.berry : col, 13);
            }
        }
        // consumers that are on no grid: a red frame
        for (const en of this.vis) {
            const e = en.e, d = BUILDINGS[e.kind];
            if (d.use && !graph.netOf.has(e.id)) {
                g.lineStyle(2, PAL.berry, 1).strokeRect(e.tx * TILE - 1, e.ty * TILE - 1, d.size[0] * TILE + 2, d.size[1] * TILE + 2);
            }
        }
        // flows: arrows along belts (every third piece), what each machine makes per minute, blocked things in red
        const heavy = this.vis.length > 420;
        for (const en of this.vis) {
            const e = en.e, d = BUILDINGS[e.kind];
            const cx = (e.tx + d.size[0] / 2) * TILE, cy = (e.ty + d.size[1] / 2) * TILE;
            if (en.belt) {
                if (heavy || (e.tx + e.ty) % 3 !== 0 || e.kind === 'tunnelx') continue;
                const [dx, dy] = DIRS[e.rot & 3];
                const full = e.belt?.some(Boolean);
                g.fillStyle(PAL.ink, 1).fillTriangle(cx - dy * 5 - dx * 2.5, cy + dx * 5 - dy * 2.5, cx + dy * 5 - dx * 2.5, cy - dx * 5 - dy * 2.5, cx + dx * 6, cy + dy * 6);
                g.fillStyle(full ? PAL.gold : PAL.snow, 1).fillTriangle(cx - dy * 3.4 - dx * 1.5, cy + dx * 3.4 - dy * 1.5, cx + dy * 3.4 - dx * 1.5, cy - dx * 3.4 - dy * 1.5, cx + dx * 4.4, cy + dy * 4.4);
                continue;
            }
            if (e.kind === 'drill') {
                const [dx, dy] = DIRS[e.rot & 3];
                const ax = cx + dx * 20, ay = cy + dy * 20;
                g.fillStyle(PAL.ink, 1).fillTriangle(ax - dy * 5 - dx * 2, ay + dx * 5 - dy * 2, ax + dy * 5 - dx * 2, ay - dx * 5 - dy * 2, ax + dx * 7, ay + dy * 7);
                g.fillStyle(PAL.gold, 1).fillTriangle(ax - dy * 3.4 - dx * 1, ay + dx * 3.4 - dy * 1, ax + dy * 3.4 - dx * 1, ay - dx * 3.4 - dy * 1, ax + dx * 5, ay + dy * 5);
            }
            const st = en.st;
            if (!st) continue;
            if (st.badge === 'block' || st.badge === 'power' || st.badge === 'fuel') {
                g.lineStyle(2, PAL.berry, 0.6 + 0.4 * Math.sin(this.t * 7)).strokeRect(e.tx * TILE - 1.5, e.ty * TILE - 1.5, d.size[0] * TILE + 3, d.size[1] * TILE + 3);
            }
            if (st.coins) this.label(cx, e.ty * TILE - 14, `${Math.round(st.coins)} coins/min`, PAL.gold, 12);
            else if (st.rate && st.item && e.kind !== 'inserter') this.label(cx, e.ty * TILE - 14, `${Math.round(st.rate)}/min`, PAL.lime, 12);
            else if (e.kind === 'chest' || e.kind === 'steelchest' || e.kind === 'uberchest') {
                const n = Object.values(e.inv ?? {}).reduce((a, b) => a + (b ?? 0), 0);
                if (n > 0) this.label(cx, e.ty * TILE - 10, `${n} stored`, PAL.cream, 11);
            }
        }
    }

    // ── tooltips: hover on a computer, a long press on a phone ──────────────
    private pick (wx: number, wy: number): Entry | null {
        const tx = Math.floor(wx / TILE), ty = Math.floor(wy / TILE), w = this.h.world;
        let id = w.occAt(tx, ty) || w.floorAt(tx, ty);
        // machines are drawn taller than their footprint: the upper half counts too
        if (!id) { id = w.occAt(tx, ty + 1); const e = id ? this.h.ents[id] : null; if (e?.k === 'bld' && BUILDINGS[e.kind].floor) id = 0; }
        const en = id ? this.entries.get(id) ?? null : null;
        // (plain chests stay quiet: they are all over every base, and wear their own label)
        return en && !(BUILDINGS[en.e.kind].storage && !BUILDINGS[en.e.kind].proc) ? en : null;
    }

    private hover (dt: number) {
        const s = this.scene, p = s.input.activePointer, now = s.time.now;
        if (this.h.busy()) { this.dropTip(); this.wasDown = false; return; }
        if (p.wasTouch) {
            if (p.isDown && !this.wasDown) { this.pressAt = now; this.pressX = p.x; this.pressY = p.y; this.dropTip(); }
            this.wasDown = p.isDown;
            if (p.isDown) {
                if (now - this.pressAt >= LONG_PRESS && Math.hypot(p.x - this.pressX, p.y - this.pressY) / SS < 14 && this.shownId < 0) {
                    this.h.toWorld(p, this.vec, true);
                    const en = this.pick(this.vec.x, this.vec.y);
                    if (en) { this.shownId = en.e.id; this.h.tip(this.tipFor(en)); this.tipUntil = 0; }
                }
            } else if (this.shownId >= 0) {
                if (!this.tipUntil) this.tipUntil = now + 4500;
                else if (now > this.tipUntil) this.dropTip();
            }
            return;
        }
        // a mouse: rest on a building for a moment
        if (p.x !== this.lastPx || p.y !== this.lastPy) { this.lastPx = p.x; this.lastPy = p.y; this.still = 0; if (this.shownId >= 0) { this.h.toWorld(p, this.vec, true); if (this.pick(this.vec.x, this.vec.y)?.e.id !== this.shownId) this.dropTip(); } return; }
        this.still += dt;
        if (this.still >= 0.2 && this.shownId < 0) {
            this.h.toWorld(p, this.vec, true);
            const en = this.pick(this.vec.x, this.vec.y);
            if (en) { this.shownId = en.e.id; this.h.tip(this.tipFor(en)); }
        }
    }

    private dropTip () {
        if (this.shownId < 0) return;
        this.shownId = -1; this.tipUntil = 0;
        this.h.tip(null);
    }

    /** What the tooltip over a building says: what it is for, what it is doing right now, what to do, how fast. */
    private tipFor (en: Entry): TipData {
        const e = en.e, def = BUILDINGS[e.kind];
        const st = statusOf(e, this.env);
        const [word, col] = STATE_WORDS[st.state];
        const how = HOWTO[e.kind];
        const lines: TipData['lines'] = [];
        if (how) lines.push({ t: how.role + '.', c: PAL.pebble });
        lines.push({ t: st.text, c: st.state === 'ok' ? PAL.cream : col, size: 13 });
        if (st.hint) lines.push({ t: st.hint, c: st.state === 'ok' || st.state === 'idle' || st.state === 'working' ? PAL.pebble : PAL.gold });
        if (st.rate && st.item) lines.push({ t: `About ${Math.round(st.rate)} ${ITEMS[st.item].name} a minute`, c: PAL.lime });
        if (st.note) lines.push({ t: st.note, c: PAL.foam });
        const foot = def.proc || def.storage ? 'E: open it' : e.kind === 'drill' || e.kind === 'inserter' || e.kind === 'sorter' || e.kind === 'chute' || def.gen || def.pole || def.store ? 'E: inspect and change settings' : undefined;
        const sub = word && !st.text.toLowerCase().startsWith(word.toLowerCase()) ? word : undefined;
        return { title: def.name, color: st.state === 'ok' ? PAL.cream : col, sub, subColor: col, icon: def.tex, lines, foot };
    }

    // ── the machines as they run (every frame, for the buildings on screen) ──
    /** Pose a building's sprite from its state and the clock: belts roll, items ride them, frames flicker, the vane turns, the arm swings. */
    animate (v: BuildView, e: BuildE, dt: number, sun: number) {
        const s = this.scene, t = s.time.now / 1000;
        const working = (e.act ?? 0) > 0 && (e.pw ?? 0) > 0.05;
        if (isBeltLike(e.kind)) {
            frame(v, Math.floor(t * 9) % 4);
            if (e.kind === 'tunnel') this.drawTunnelLink(v, e);
            if (e.kind === 'sorter') {
                // the filter item sits on the hub, so you can read the whole line at a glance
                if (e.flt) { if (!v.hand) v.hand = overlay3d(s.add.image(v.x, v.y, iconOf(e.flt), 0).setScale(0.5).setDepth(-6.9)); icon(v.hand, iconOf(e.flt)).setVisible(true).setPosition(v.x, v.y); }
                else v.hand?.setVisible(false);
            }
            const [dx, dy] = DIRS[e.rot & 3];
            const items = v.items!;
            for (let i = 0; i < 3; i++) {
                const id = e.belt?.[i];
                let im = items[i];
                if (!id) { im?.setVisible(false); continue; }
                if (!im) { im = s.add.image(0, 0, 'i_wood', 0).setScale(0.5).setDepth(-7); items[i] = im; }
                icon(im, iconOf(id)).setVisible(true).setPosition(Math.round(v.x + dx * (i - 1) * 5), Math.round(v.y + dy * (i - 1) * 5 - 1));
            }
            return;
        }
        const fr = FRAME_OF[e.kind];
        if (fr) frame(v, fr(e, t, working, sun));
        else if (e.kind === 'windturbine' && v.blades) v.blades.rotation += dt * (0.4 + wind(this.h.clock.time) * 2.4);
        else if (e.kind === 'weathervane') this.animateVane(v, e, dt, t);
        else if (e.kind === 'chute') {
            // the one item it sells wears its icon on the coin plate (nothing there: it sells anything)
            if (e.flt) { if (!v.hand) v.hand = overlay3d(s.add.image(v.x, v.y - 6, iconOf(e.flt), 0).setScale(0.5).setDepth(v.y + 0.2)); icon(v.hand, iconOf(e.flt)).setVisible(true); }
            else v.hand?.setVisible(false);
        }
        else if (e.kind === 'inserter') {
            const target = e.hand ? Math.min(1, (e.prog ?? 0)) : 0;
            v.swing = (v.swing ?? 0) + (target - (v.swing ?? 0)) * Math.min(1, dt * (e.hand ? 14 : 9));
            const hand = e.hand;
            if (hand) {
                if (!v.hand) v.hand = s.add.image(0, 0, iconOf(hand), 0).setScale(0.5).setDepth(5.1e4);
                icon(v.hand, iconOf(hand)).setVisible(true);
            } else v.hand?.setVisible(false);
        }
        // (the "no power" bolt and the other status badges are drawn by the refresh above)
    }

    /**
     * The weather vane: its arrow swings round to the day's wind (a heading from the seed and the day, eased, with a gust now and
     * then, turned by squashing it sideways as a vane looks from the side), and the little picture over it is tomorrow's weather.
     */
    private animateVane (v: BuildView, e: BuildE, dt: number, t: number) {
        const h = this.h, arrow = v.blades;
        if (arrow) {
            const day = h.clock.day;
            const want = hash(h.seed, day, 21) * Math.PI * 2 + Math.sin(t * 0.9 + e.id) * 0.18 * wind(h.clock.time);
            const cur = v.vang ?? want;
            const d = Math.atan2(Math.sin(want - cur), Math.cos(want - cur));
            v.vang = cur + d * Math.min(1, dt * (0.6 + wind(h.clock.time)));
            const c = Math.cos(v.vang);
            arrow.setScale(Math.sign(c || 1) * Math.max(0.4, Math.abs(c)), 1);
        }
        const sky = v.sky;
        if (sky) {
            const day = h.clock.day;
            if (v.vday !== day) {
                const first = v.vday === undefined;
                v.vday = day;
                sky.setTexture(vaneIcon(forecast(h.seed, day, 2)[1]), 0);
                if (first) sky.setAlpha(1); else { squash(this.scene, sky, 1.5, 0.5, 120); h.pop(v.x, v.y - 38, 3); }
            }
            sky.setAlpha(1).setPosition(v.x, v.y - 38 + Math.round(Math.sin(t * 1.8 + e.id) * 1.2));
        }
    }

    /** A faint dotted line under the ground from a tunnel entrance to its exit, so the route can be read. */
    private drawTunnelLink (v: BuildView, e: BuildE) {
        const h = this.h;
        const other = tunnelPartner((tx, ty) => { const f = h.ents[h.world.occAt(tx, ty) || h.world.floorAt(tx, ty)]; return f?.k === 'bld' ? f : null; }, e);
        const key = other ? `${other.tx},${other.ty}` : '';
        if (key === v.linkKey) return;
        v.linkKey = key;
        v.link?.destroy(); v.link = undefined;
        if (!other) return;
        const x0 = (e.tx + 0.5) * TILE, y0 = (e.ty + 0.5) * TILE, x1 = (other.tx + 0.5) * TILE, y1 = (other.ty + 0.5) * TILE;
        const len = Math.hypot(x1 - x0, y1 - y0);
        const g = overlay3d(this.scene.add.graphics().setDepth(-8.2));
        g.fillStyle(PAL.ink, 0.38);
        for (let d = 11; d < len - 7; d += 5) g.fillRect(Math.round(x0 + ((x1 - x0) * d) / len) - 1, Math.round(y0 + ((y1 - y0) * d) / len) - 1, 2, 2);
        v.link = g;
    }

    // ── wires, arms and the placement overlay ───────────────────────────────
    /**
     * The power wires (poles to poles, faint feeds to what they power) stand still: they are drawn again only when a building
     * came or went or the camera moved on. The inserter arms and the placement overlay move, so they are drawn each frame.
     */
    private drawWires () {
        const wv = this.h.view(), at = this.wiresAt;
        const moved = Math.abs(wv.centerX - at.x) + Math.abs(wv.centerY - at.y) > 56 || Math.abs(wv.width - at.w) > 1;
        if (at.v === this.h.bldVersion && !moved) return;
        at.v = this.h.bldVersion; at.x = wv.centerX; at.y = wv.centerY; at.w = wv.width;
        const g = this.wiresG, graph = this.wires!.g;
        g.clear();
        const near = (x: number, y: number, m: number) => x > wv.x - m && x < wv.right + m && y > wv.y - m && y < wv.bottom + m;       // (a margin covers the camera's drift until the next redraw)
        for (const [a, b] of graph.links) {
            const ax = (a.tx + 0.5) * TILE, ay = (a.ty + 1) * TILE - 11, bx = (b.tx + 0.5) * TILE, by = (b.ty + 1) * TILE - 11;
            if (!near(ax, ay, 180) && !near(bx, by, 180)) continue;
            const mx = (ax + bx) / 2, my = (ay + by) / 2 + 3;
            g.lineStyle(1, PAL.ink, 1).lineBetween(ax, ay + 1, mx, my + 1).lineBetween(mx, my + 1, bx, by + 1);
            g.lineStyle(1, graph.netOf.get(a.id)!.live ? PAL.gold : PAL.stone, 1).lineBetween(ax, ay, mx, my).lineBetween(mx, my, bx, by);
        }
        for (const net of graph.nets) {
            for (const m of net.members) {
                const def = BUILDINGS[m.kind];
                const mx = (m.tx + def.size[0] / 2) * TILE, my = (m.ty + def.size[1] / 2) * TILE;
                if (!near(mx, my, 100)) continue;
                const pole = nearestPole(net, m);
                g.lineStyle(1, def.gen ? PAL.gold : PAL.pumpkin, 0.35).lineBetween((pole.tx + 0.5) * TILE, (pole.ty + 1) * TILE - 11, mx, my);
            }
        }
    }

    /** Once a frame: the wires (when they changed), the inserter arms on screen and, with a building in hand, the supply squares, wire reach and facing arrow. */
    drawWorld () {
        const h = this.h;
        if (!this.wires || this.wires.v !== h.bldVersion) {
            const g = buildPowerGraph([...h.blds.values()]);
            this.wires = { v: h.bldVersion, g };
        }
        this.drawWires();
        const g = this.fxg, arms = this.arms;
        const drawing = h.visViews.length > 0 || !!h.placing;
        if (drawing || this.fxDrawn) { g.clear(); arms.clear(); }
        this.fxDrawn = drawing;
        if (!drawing) return;
        // inserter arms
        for (const v of h.visViews) {
            const e = v.ent;
            if (e.k !== 'bld' || e.kind !== 'inserter') continue;
            const base = ((e.rot & 3) + 2) * (Math.PI / 2);
            const ang = base + Math.PI * (v.swing ?? 0);
            const len = 7, tx = v.x + Math.cos(ang) * len, ty = v.y + Math.sin(ang) * len;
            arms.lineStyle(3, PAL.ink, 1).lineBetween(v.x, v.y, tx, ty);
            arms.lineStyle(1, (e.pw ?? 0) > 0.05 ? PAL.pumpkin : PAL.stone, 1).lineBetween(v.x, v.y, tx, ty);
            arms.fillStyle(PAL.ink, 1).fillRect(Math.round(tx) - 2, Math.round(ty) - 2, 4, 4);
            arms.fillStyle(PAL.pebble, 1).fillRect(Math.round(tx) - 1, Math.round(ty) - 1, 2, 2);
            v.hand?.setPosition(Math.round(tx), Math.round(ty) - 1);
        }
        // placement overlay: supply squares, wire reach, facing arrow
        const pl = h.placing;
        if (!pl) return;
        const def = BUILDINGS[pl.kind];
        const showSupply = pl.kind === 'pole' || !!def.use || !!def.gen;
        if (showSupply) {
            for (const b of h.blds.values()) {
                if (!BUILDINGS[b.kind].pole) continue;
                g.fillStyle(PAL.gold, 0.07).fillRect((b.tx - SUPPLY) * TILE, (b.ty - SUPPLY) * TILE, (SUPPLY * 2 + 1) * TILE, (SUPPLY * 2 + 1) * TILE);
                g.lineStyle(1, PAL.gold, 0.35).strokeRect((b.tx - SUPPLY) * TILE + 0.5, (b.ty - SUPPLY) * TILE + 0.5, (SUPPLY * 2 + 1) * TILE - 1, (SUPPLY * 2 + 1) * TILE - 1);
            }
        }
        if (pl.kind === 'pole') {
            const col = pl.valid ? PAL.grass : PAL.berry;
            g.fillStyle(col, 0.12).fillRect((pl.tx - SUPPLY) * TILE, (pl.ty - SUPPLY) * TILE, (SUPPLY * 2 + 1) * TILE, (SUPPLY * 2 + 1) * TILE);
            g.lineStyle(1, col, 0.8).strokeRect((pl.tx - SUPPLY) * TILE + 0.5, (pl.ty - SUPPLY) * TILE + 0.5, (SUPPLY * 2 + 1) * TILE - 1, (SUPPLY * 2 + 1) * TILE - 1);
        }
        if (def.dir) {
            const [dx, dy] = DIRS[pl.rot & 3];
            const [w, hh] = def.size;
            const cx = (pl.tx + w / 2) * TILE, cy = (pl.ty + hh / 2) * TILE;
            const reach = Math.max(w, hh) * 8 + 4;
            const px = cx + dx * reach, py = cy + dy * reach;
            g.fillStyle(0xffffff, 0.9).fillTriangle(px + dx * 5 - dy * 5, py + dy * 5 + dx * 5, px + dx * 5 + dy * 5, py + dy * 5 - dx * 5, px + dx * 11, py + dy * 11);
        }
    }

    destroy () {
        this.clear();
        for (const im of this.pool) im.destroy();
        this.pool.length = 0;
        this.dim.destroy(); this.g.destroy(); this.mk.destroy(); this.wiresG.destroy(); this.arms.destroy(); this.fxg.destroy();
    }
}
