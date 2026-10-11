// The land price plates: one per plot for sale, hugging the shore it shares with your land. A plate that is in the way
// slides along the shore; one that fits nowhere in full size shrinks to a compact tag; one that fits nowhere hides.

import * as Phaser from 'phaser';
import { PLOT, TILE, VIEW_H, VIEW_W, ZOOM } from '../../shared/config';
import { BIOME_DEFS, MODS } from '../../shared/data/biomes';
import { css, PAL } from '../../shared/palette';
import type { PlayerS, Plot } from '../../shared/sim/types';
import type { World } from '../../shared/world';
import { SS } from '../res';
import { hideTip, label, onTap, tipOn } from './kit';
import { panel, rect, STYLES } from './px';
import { firstClear, slideCandidates, slots, type Rect } from './slots';

/** The slice of the Game scene the plates read: the land for sale, where you stand, the camera, your land price multiplier, and buying. */
interface PlatesHost {
    readonly ready: boolean;
    readonly world: World;
    readonly playerPos: { x: number; y: number };
    readonly cameras: { main: { zoom: number } };
    worldToScreen (x: number, y: number): { x: number; y: number };
    derivedMe (): { landMul: number };
    buyPlot (plot: Plot): void;
}

/** A land price plate: the full one (name, modifier, price) or, when it must be small, a tag with a biome swatch and the price. */
interface Tag { plot: Plot; root: Phaser.GameObjects.Container; full: Phaser.GameObjects.Container; mini: Phaser.GameObjects.Container; price: Phaser.GameObjects.Text; priceMini: Phaser.GameObjects.Text; zone: Phaser.GameObjects.Zone; fw: number; fh: number; compact: boolean; at: { x: number; y: number } | null; /** The price shown, negative while you cannot afford it (0: nothing shown yet). */ key: number }
const MINI_W = 72, MINI_H = 24, TAG_GAP = 8;
/** Where plates may go: the whole screen but a thin margin. */
const TAG_BOX: Rect = { x: 4, y: 4, w: VIEW_W - 8, h: VIEW_H - 8 };
const SIDES: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]];

export class LandPlates {
    private tags: Tag[] = [];

    constructor (private scene: Phaser.Scene, private farm: PlatesHost) {}

    /** The plots for sale changed: new plates for the new list. */
    rebuild () {
        const s = this.scene;
        hideTip();                                   // (the plate under the pointer is about to go: its card must not stay)
        for (const t of this.tags) t.root.destroy();
        if (!this.farm.ready) { this.tags = []; return; }
        this.tags = this.farm.world.purchasable().map((plot) => {
            const biome = BIOME_DEFS[plot.biome];
            const mod = plot.mod ? MODS[plot.mod] : null;
            const fw = 140, fh = mod ? 68 : 52;
            // the full plate
            const full = s.add.container(0, 0);
            const g = s.add.graphics();
            panel(g, -fw / 2, -fh / 2, fw, fh, { ...STYLES.deep, rim: biome.color, shadow: true });
            full.add([g, label(s, 0, -fh / 2 + 13, plot.heart ? 'The Old Heart' : biome.name, 15, plot.heart ? PAL.berry : biome.color, { origin: [0.5, 0.5] })]);
            if (mod) full.add(label(s, 0, -fh / 2 + 31, mod.name, 12, mod.color, { origin: [0.5, 0.5] }));
            const price = label(s, 0, fh / 2 - 15, '', 15, PAL.cream, { origin: [0, 0.5] });
            full.add([s.add.image(-12, fh / 2 - 15, 'i_coin', 0).setScale(1.5), price]);
            // the compact tag: a swatch of the biome (a dot of the modifier's colour in its corner), the coin and the price
            const mini = s.add.container(0, 0);
            const gm = s.add.graphics();
            panel(gm, -MINI_W / 2, -MINI_H / 2, MINI_W, MINI_H, { ...STYLES.deep, rim: biome.color, shadow: true });
            rect(gm, -MINI_W / 2 + 7, -6, 12, 12, PAL.ink); rect(gm, -MINI_W / 2 + 8, -5, 10, 10, plot.heart ? PAL.berry : biome.color);
            if (mod) { rect(gm, -MINI_W / 2 + 14, -8, 6, 6, PAL.ink); rect(gm, -MINI_W / 2 + 15, -7, 4, 4, mod.color); }
            const priceMini = label(s, MINI_W / 2 - 8, 0, '', 14, PAL.cream, { origin: [1, 0.5] });
            mini.add([gm, s.add.image(-MINI_W / 2 + 29, 0, 'i_coin', 0).setScale(1.2), priceMini]);
            const zone = s.add.zone(0, 0, fw, fh).setInteractive({ useHandCursor: true });
            onTap(zone, () => this.farm.buyPlot(plot));
            const root = s.add.container(0, 0, [full, mini, zone]).setDepth(9.5);      // (over the world's floating texts, under windows)
            const tag: Tag = { plot, root, full, mini, price, priceMini, zone, fw, fh, compact: false, at: null, key: 0 };
            tipOn(zone, () => !tag.compact ? null : {
                title: plot.heart ? 'The Old Heart' : biome.name, color: plot.heart ? PAL.berry : biome.color, sub: mod?.name, subColor: mod?.color,
                lines: [...(mod ? [{ t: mod.desc, c: PAL.pebble }] : []), { t: `For sale: ${price.text} coins`, c: PAL.gold }], foot: 'Click to buy',
            });
            return tag;
        });
    }

    /**
     * Put each price plate beside the shore it belongs to: its inner edge just outside the owned land at any zoom, never over
     * the land, the farmer or the HUD. A plate that is in the way slides along the shore; one that fits nowhere in full size
     * shrinks to a compact tag (always, when zoomed out); one that fits nowhere hides until the view changes.
     * `show`: false while a window is open (the plates wait out of sight).
     */
    place (me: PlayerS, dt: number, show: boolean) {
        const f = this.farm, world = f.world;
        const z = f.cameras.main.zoom / SS, half = (PLOT * TILE) / 2, pp = f.playerPos;
        const fs = f.worldToScreen(pp.x, pp.y);
        const blockers: Rect[] = [...slots.obstacles(), { x: fs.x - 30, y: fs.y - 56, w: 60, h: 68 }];      // (the farmer stands at the middle of the screen)
        const bob = Math.sin(this.scene.time.now / 400) * 2, k = 1 - Math.exp(-dt * 16);
        const landMul = f.derivedMe().landMul;
        for (const tag of this.tags) {
            const was = tag.root.visible;
            tag.root.setVisible(false);
            if (!show) { tag.at = null; continue; }
            // the shore it hugs: the border with the owned neighbour nearest to you
            const c = world.plotCenter(tag.plot);
            let side: [number, number] | null = null, bd = Infinity;
            for (const [dx, dy] of SIDES) {
                if (!world.plot(tag.plot.gx + dx, tag.plot.gy + dy)?.owned) continue;
                const d = Math.hypot(c.x + dx * half - pp.x, c.y + dy * half - pp.y);
                if (d < bd) { bd = d; side = [dx, dy]; }
            }
            if (!side) { tag.at = null; continue; }
            const [dx, dy] = side;
            const shore = f.worldToScreen(c.x + dx * half, c.y + dy * half);
            if (shore.x < -300 || shore.x > VIEW_W + 300 || shore.y < -300 || shore.y > VIEW_H + 300) { tag.at = null; continue; }
            // the price and its colour are set only when they change: a text is drawn again every time its colour is touched
            const price = Math.max(1, Math.round(world.price(tag.plot, me.plotsBought) * landMul));
            const key = me.coins >= price ? price : -price;
            if (tag.key !== key) {
                tag.key = key;
                const txt = `${price}`, col = css(key > 0 ? PAL.cream : PAL.berry);
                tag.price.setText(txt).setColor(col); tag.priceMini.setText(txt).setColor(col);
            }
            const spotFor = (w: number, h: number) => {
                const ext = dx ? w / 2 : h / 2;
                const r: Rect = { x: shore.x - dx * (ext + TAG_GAP) - w / 2, y: shore.y - dy * (ext + TAG_GAP) - h / 2, w, h };
                return firstClear(slideCandidates(r, { x: dy ? 1 : 0, y: dx ? 1 : 0 }, Math.min(260, half * z + 40)), blockers, TAG_BOX, 4);
            };
            const small = z < ZOOM - 0.05;
            let spot = small ? null : spotFor(tag.fw, tag.fh), compact = false;
            if (!spot) { spot = spotFor(MINI_W, MINI_H); compact = true; }
            if (!spot) { tag.at = null; continue; }
            blockers.push(spot);
            if (tag.compact !== compact) hideTip();          // (the card was for the other size of plate)
            tag.compact = compact;
            tag.full.setVisible(!compact); tag.mini.setVisible(compact);
            const w = compact ? MINI_W : tag.fw, h = compact ? MINI_H : tag.fh;
            if (tag.zone.width !== w) tag.zone.setSize(w, h);
            // a plate that was already showing glides to its new spot (the farmer walking along a shore pushes it along)
            const to = { x: spot.x + w / 2, y: spot.y + h / 2 + bob };
            tag.at = was && tag.at ? { x: tag.at.x + (to.x - tag.at.x) * k, y: tag.at.y + (to.y - tag.at.y) * k } : to;
            tag.root.setPosition(Math.round(tag.at.x), Math.round(tag.at.y)).setVisible(true);
        }
    }
}
