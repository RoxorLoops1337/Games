// What a building wears as its state changes: a wall's frame that joins up with its neighbours, a bed's crop, a sorted
// chest's little plate, the dishes on a potluck table, a belt's or drill's facing. Game.ts calls `refresh` when a building
// arrives or is updated.

import * as Phaser from 'phaser';
import { TILE } from '../../shared/config';
import { BUILDINGS, CROPS, isBeltLike } from '../../shared/data/buildings';
import { chestIcon } from '../../shared/data/filters';
import { iconOf } from '../../shared/data/items';
import { PAL } from '../../shared/palette';
import * as potluck from '../../shared/sim/potluck';
import type { BuildE, Ent } from '../../shared/sim/types';
import type { World } from '../../shared/world';
import { squash } from './farmers';
import type { EntView } from './views';

type Img = Phaser.GameObjects.Image;
type Spr = Phaser.GameObjects.Sprite;

interface BuildViewsHost {
    readonly world: World;
    readonly ents: Record<number, Ent>;
    readonly views: ReadonlyMap<number, EntView>;
    /** Roof pieces by entity id (the ambience fades the one you are under). */
    readonly roofs: Map<number, Img>;
    /** A few sparks at a spot. */
    pop (x: number, y: number, n: number): void;
    /** The ground shadow under something that stands. */
    shadowFor (x: number, y: number, w: number): Img;
}

export class BuildViews {
    constructor (private scene: Phaser.Scene, private h: BuildViewsHost) {}

    /** The sprite (and what hangs on it) for a building, placed by its footprint and layered as its kind asks. */
    create (e: BuildE): EntView {
        const s = this.scene, def = BUILDINGS[e.kind], [w, h] = def.size;
        const x = (e.tx + w / 2) * TILE, y = (e.ty + h) * TILE - 1;
        let v: EntView;
        if (isBeltLike(e.kind)) {
            const cx = (e.tx + 0.5) * TILE, cy = (e.ty + 0.5) * TILE;
            const sprite = s.add.sprite(cx, cy, e.kind, 0).setDepth(-7.5).setAngle((e.rot & 3) * 90);
            v = { ent: e, sprite, x: cx, y: cy, items: [] };
        } else if (def.floor) {
            const sprite = s.add.image(e.tx * TILE, e.ty * TILE, def.tex, 0).setOrigin(0, 0).setDepth(-8);
            v = { ent: e, sprite, x, y };
        } else if (def.roof) {
            // hangs over everything on its tile; the roof you are under fades away (Ambience.updateRoofs)
            const sprite = s.add.image(e.tx * TILE, e.ty * TILE, def.tex, 0).setOrigin(0, 0).setDepth(4000);
            this.h.roofs.set(e.id, sprite);
            v = { ent: e, sprite, x, y };
        } else if (def.wall) {
            const sprite = s.add.image(x, y, def.tex, this.wallMask(e.tx, e.ty)).setOrigin(0.5, 1).setDepth(y);
            v = { ent: e, sprite, x, y };
        } else if (e.kind === 'doorway') {
            const cx = (e.tx + 0.5) * TILE, cy = (e.ty + 0.5) * TILE;
            const sprite = s.add.image(cx, cy, 'doorway', 0).setAngle((e.rot & 1) * 90).setDepth(e.ty * TILE);       // you walk over it
            v = { ent: e, sprite, x: cx, y: cy };
        } else if (e.kind === 'inserter') {
            const cx = (e.tx + 0.5) * TILE, cy = (e.ty + 0.5) * TILE;
            const sprite = s.add.image(cx, cy, 'inserter', 0).setDepth(cy);
            v = { ent: e, sprite, x: cx, y: cy, swing: 0 };
        } else if (e.kind === 'drill') {
            const cx = (e.tx + 1) * TILE, cy = (e.ty + 1) * TILE;
            const sprite = s.add.sprite(cx, cy, 'drill', 0).setDepth(cy + 8).setAngle((e.rot & 3) * 90);
            v = { ent: e, sprite, x: cx, y: cy };
        } else {
            const sprite = s.add.image(x, y, def.tex, 0).setOrigin(0.5, 1).setDepth(def.walk ? y - h * TILE : y);       // (something you walk over is drawn under whoever stands on it)
            v = { ent: e, sprite, shadow: this.h.shadowFor(x, y, sprite.width), x, y };
            if (e.kind === 'mill') v.blades = s.add.image(x, y - 30, 'mill_blades', 0).setDepth(y + 0.5);
            if (e.kind === 'windturbine') v.blades = s.add.image(x, y - 19, 'turbine_blades', 0).setDepth(y + 0.5);
            if (e.kind === 'weathervane') {
                v.blades = s.add.image(x, y - 24, 'weathervane_arrow', 0).setDepth(y + 0.5);
                v.sky = s.add.image(x, y - 38, 'k_sun', 0).setDepth(y + 0.6).setAlpha(0);
            }
            if (def.light) v.glow = s.add.image(x, y - 6, 'light', 0).setTint(e.kind === 'waystone' || e.kind === 'altar' ? PAL.foam : PAL.pumpkin).setAlpha(0).setScale((def.light * 2.4) / 96).setDepth(-4).setBlendMode(Phaser.BlendModes.ADD);
        }
        this.refresh(v, e);
        return v;
    }

    /** Which of the four sides (north 1, east 2, south 4, west 8) have another wall piece or a doorway: picks the frame that joins up. */
    wallMask (tx: number, ty: number) {
        const h = this.h;
        const joins = (x: number, y: number) => {
            const id = h.world.occAt(x, y) || h.world.softAt(x, y);
            const e = id ? h.ents[id] : undefined;
            return !!e && e.k === 'bld' && (!!BUILDINGS[e.kind].wall || !!BUILDINGS[e.kind].gate);
        };
        return (joins(tx, ty - 1) ? 1 : 0) | (joins(tx + 1, ty) ? 2 : 0) | (joins(tx, ty + 1) ? 4 : 0) | (joins(tx - 1, ty) ? 8 : 0);
    }

    /** A wall appeared or went: it and its neighbours pick new frames so the run joins up. */
    rejoinWalls (b: BuildE) {
        const h = this.h;
        for (const [dx, dy] of [[0, 0], [0, -1], [1, 0], [0, 1], [-1, 0]]) {
            const id = h.world.occAt(b.tx + dx, b.ty + dy) || h.world.softAt(b.tx + dx, b.ty + dy);
            const e = id ? h.ents[id] : undefined;
            const v = id ? h.views.get(id) : undefined;
            if (e?.k === 'bld' && v && BUILDINGS[e.kind].wall) (v.sprite as Img).setFrame(this.wallMask(e.tx, e.ty));
        }
    }

    refresh (v: EntView, b: BuildE) {
        if (isBeltLike(b.kind) || b.kind === 'drill') (v.sprite as Spr).setAngle((b.rot & 3) * 90);
        if (b.kind === 'doorway') (v.sprite as Img).setAngle((b.rot & 1) * 90);
        if (BUILDINGS[b.kind].wall || BUILDINGS[b.kind].gate) this.rejoinWalls(b);
        if (BUILDINGS[b.kind].storage && !BUILDINGS[b.kind].pets) this.refreshTag(v, b);
        if (b.kind === 'table') { this.refreshDishes(v, b); return; }
        if (b.kind !== 'bed') return;
        const crop = b.plant ? CROPS[b.plant] : undefined;
        const tex = b.crop === 0 ? 'crop1' : b.crop === 1 ? 'crop2' : b.crop === 2 && crop ? crop.tex : null;
        if (!tex) { v.crop?.destroy(); v.crop = undefined; return; }
        if (v.crop?.texture.key === tex) return;
        if (!v.crop) v.crop = this.scene.add.image(v.x, v.y - 2, tex, 0).setOrigin(0.5, 1).setDepth(v.y - TILE + 0.5);       // a bed is walked over: the plant too
        else v.crop.setTexture(tex, 0);
        squash(this.scene, v.crop, 1.3, 0.7, 90);
        this.h.pop(v.x, v.y - 6, 3);
    }

    /** A chest that has been given an icon (or a filter) shows it on a little plate above it, so you can read a row of chests from across the farm. */
    private refreshTag (v: EntView, b: BuildE) {
        const s = this.scene, ic = chestIcon(b);
        const tex = ic ? iconOf(ic) : null;
        const shown = v.tag?.[2]?.texture.key;
        if (!tex) { v.tag?.forEach((i) => i.destroy()); v.tag = undefined; return; }
        if (shown === tex) return;
        if (!v.tag) {
            const y = v.y - 15;
            const edge = s.add.image(v.x, y, 'px').setDisplaySize(14, 14).setTint(PAL.ink).setDepth(v.y + 0.4);
            const plate = s.add.image(v.x, y, 'px').setDisplaySize(12, 12).setTint(PAL.cream).setDepth(v.y + 0.41);
            const icon = s.add.image(v.x, y, tex, 0).setDisplaySize(10, 10).setDepth(v.y + 0.42);
            v.tag = [edge, plate, icon];
        } else v.tag[2].setTexture(tex, 0).setDisplaySize(10, 10);
        squash(s, v.tag[2], 1.5, 0.6, 110);
        this.h.pop(v.x, v.y - 15, 2);
    }

    /** A potluck table shows what is on it: a clean runner and a little icon of each dish (up to four), side by side. */
    private refreshDishes (v: EntView, b: BuildE) {
        const s = this.scene;
        const rows = potluck.rowsOf(b), key = rows.map((d) => `${d.it}:${d.n > 2 ? 3 : d.n}`).join(',');
        if (v.dishKey === key) return;
        const first = v.dishKey === undefined;
        v.dishKey = key;
        (v.sprite as Img).setFrame(rows.length ? 1 : 0);
        const list = (v.dishes ??= []);
        const step = rows.length <= 2 ? 12 : rows.length === 3 ? 10 : 8.5;
        rows.forEach((d, i) => {
            const tex = iconOf(d.it), x = Math.round(v.x + (i - (rows.length - 1) / 2) * step), y = v.y - 11;
            let im = list[i];
            if (!im) { im = s.add.image(x, y, tex, 0).setOrigin(0.5, 1).setScale(0.5).setDepth(v.y + 0.4); list[i] = im; }
            const changed = im.texture.key !== tex;
            im.setTexture(tex, 0).setPosition(x, y).setVisible(true).setAlpha(d.n <= 1 ? 0.75 : 1);
            if (!first && changed) { squash(s, im, 1.5, 0.6, 110); this.h.pop(x, y - 4, 2); }
        });
        for (let i = rows.length; i < list.length; i++) list[i].setVisible(false);
    }
}
