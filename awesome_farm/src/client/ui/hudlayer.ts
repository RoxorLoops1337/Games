// The always-on HUD layer: the farmer card, the world block (clock, season, coins, and the minimap from ui/minimap.ts),
// the lost-backpack marker, the hotbar with its status row, and the menu bar. Reads the Game scene's mirror of the world
// every frame. Where everything goes is decided in ui/slots.ts (the zones); this file draws it.

import { ensureFarmer } from '../art/storybook-chars';
import * as Phaser from 'phaser';
import { TILE, TUNING } from '../../shared/config';
import { hhmm } from '../../shared/fmt';
import { dist } from '../../shared/geom';
import { CO_INFO } from '../../shared/data/costatus';
import { BUFFS, BuffId, modLine, StatKey } from '../../shared/data/stats';
import { iconOf, ITEMS } from '../../shared/data/items';
import { seasonIndex, WISH_BY_ID } from '../../shared/data/wishes';
import { hotbarOf, hotKind } from '../../shared/sim/hotbar';
import { PAL } from '../../shared/palette';
import { seasonOf, SEASONS } from '../../shared/season';
import { countOf, derived, xpToNextOf } from '../../shared/sim/stats';
import type { PlayerS } from '../../shared/sim/types';
import type { GameScene } from '../scenes/Game';
import { bar, hex, inset, notch, panel, rect, RARITY_COLORS, STYLES } from './px';
import { BRASS, deepen, PAPER, TEXT, WOOD } from './theme';
import { Baked } from './bake';
import { isTouchUi } from '../input/layout';
import { button, H, icon, label, onTap, Slot, tipOn, W, type TipData } from './kit';
import { itemTip } from './tips';
import { Minimap } from './minimap';
import { CARD_H, CHIP_H, EDGE, edgeMarker, hotbarLayout, LEFT, MENU_BAR, PLAY, slots, TOUCH_BAR, worldBlock, type BottomStack, type Rect } from './slots';

const COLORS = RARITY_COLORS;
void COLORS;

interface MenuButton { id: string; label: string; key: string; icon: string }

/** On a phone: three big buttons (the rest of the windows are tiles in the Menu launcher). Positions are in slots.ts (TOUCH_BAR). */
const TOUCH_MENU = [
    { id: 'inventory', label: 'BAG', icon: 'k_bag' },
    { id: 'build', label: 'BUILD', icon: 'k_hammer' },
    { id: 'launcher', label: 'MENU', icon: 'k_gear' },
];
export const MENU_BUTTONS: MenuButton[] = [
    { id: 'inventory', label: 'Backpack', key: 'I', icon: 'k_bag' },
    { id: 'craft', label: 'Crafting', key: 'C', icon: 'k_anvil' },
    { id: 'skills', label: 'Skills', key: 'K', icon: 'k_star' },
    { id: 'creatures', label: 'Creatures', key: 'P', icon: 'k_paw' },
    { id: 'journal', label: 'Journal', key: 'J', icon: 'k_book' },
    { id: 'build', label: 'Build', key: 'B', icon: 'k_hammer' },
    { id: 'map', label: 'World map', key: 'M', icon: 'k_map' },
    { id: 'menu', label: 'Menu', key: 'Esc', icon: 'k_gear' },
];

/** The rectangle of a menu button on a computer (the strip's cells; the key letter sits under the icon). */
export function menuCell (i: number): Rect {
    return { x: MENU_BAR.x + 4 + i * MENU_BAR.cell, y: MENU_BAR.y + 3, w: MENU_BAR.cell, h: MENU_BAR.h - 6 };
}

/** The height of the farmer card for this many rows of hearts. */
const cardHeight = (rows: number) => 38 + (rows - 1) * 22 + 18 + 21;

function hourOf (clock: number, night: boolean, nightLen: number) {
    const h = night ? 20 + 10 * ((clock - TUNING.dayLength) / nightLen) : 6 + 14 * (clock / TUNING.dayLength);
    return h % 24;
}

export class HudLayer {
    /** The frames of the always-on cards: drawn again only when their shape changes. */
    private chrome: Baked;
    private chromeKey = '';
    private card!: Phaser.GameObjects.Graphics;
    private cardKey = '';
    private lookRef: PlayerS['look'];
    private colorRef = 0;
    private hearts: Phaser.GameObjects.Image[] = [];
    private boltI!: Phaser.GameObjects.Image;
    private nameT!: Phaser.GameObjects.Text;
    private lvT!: Phaser.GameObjects.Text;
    private eneT!: Phaser.GameObjects.Text;
    private ptsT!: Phaser.GameObjects.Text;
    private portrait!: Phaser.GameObjects.Image;
    private right!: Phaser.GameObjects.Graphics;
    private dayT!: Phaser.GameObjects.Text;
    private timeT!: Phaser.GameObjects.Text;
    private seasonT!: Phaser.GameObjects.Text;
    private sunI!: Phaser.GameObjects.Image;
    private seasonName = '';
    private skyKey = '';
    private coinT!: Phaser.GameObjects.Text;
    private coinShown = 0;
    private minimap!: Minimap;
    private pkG!: Phaser.GameObjects.Graphics;
    private pkDrawn = false;
    private pkT!: Phaser.GameObjects.Text;
    private pkI!: Phaser.GameObjects.Image;
    private hot!: Phaser.GameObjects.Graphics;
    private hotKey = '';
    private hotSweep = false;
    private slots: Slot[] = [];
    private keyLabels: Phaser.GameObjects.Text[] = [];
    private selT!: Phaser.GameObjects.Text;
    private selShow = 0;
    private lastSel = -1;
    private lastSelName = '';
    private buffG!: Phaser.GameObjects.Graphics;
    private buffKey = '';
    private buffI: Phaser.GameObjects.Image[] = [];
    private buffT: Phaser.GameObjects.Text[] = [];
    private buffC: Phaser.GameObjects.Text[] = [];       // the first letter of the cook's name, on a buff that came from a potluck feast
    private buffZ: Phaser.GameObjects.Zone[] = [];       // what a buff is: a card on hover or tap, with the cook's name
    private wishZ!: Phaser.GameObjects.Zone;
    private coZ!: Phaser.GameObjects.Zone;
    private menuG!: Phaser.GameObjects.Graphics;
    private badgeMenuG!: Phaser.GameObjects.Graphics;
    private menuBadge!: Phaser.GameObjects.Text;
    private menuIcons: Phaser.GameObjects.Image[] = [];
    private menuKeys: Phaser.GameObjects.Text[] = [];
    private menuHot = -1;
    private menuKey = '';
    private flashR: Phaser.GameObjects.Rectangle;
    private lowHp: Phaser.GameObjects.Graphics;
    private lowDrawn = false;
    private lastHearts = -1;
    private t = 0;
    private touch = isTouchUi();
    /** The top slot (coach card, tip or banner) is in use: the backpack note waits. */
    slotBusy = false;
    /** Where the things above the hotbar are this frame (the HUD scene works it out from what is showing). */
    stack: BottomStack;
    /** The farmer card's rectangle (the column below it starts under it). */
    cardRect: Rect = { x: LEFT.x, y: EDGE, w: LEFT.w, h: CARD_H };

    constructor (private scene: Phaser.Scene, private farm: GameScene, private onMenu: (id: string) => void) {
        const s = scene;
        const touch = this.touch, wb = worldBlock(touch), hb = hotbarLayout(touch);
        this.stack = { status: hb.y - 4 - CHIP_H, chatBottom: 0, prompt: 0, demolish: 0, fishing: 0, input: 0, emote: 0 };
        this.lowHp = s.add.graphics().setDepth(1);
        this.flashR = s.add.rectangle(0, 0, W, H, PAL.berry, 0).setOrigin(0).setDepth(2);

        this.chrome = new Baked(s, 4.9, 0, 0, W, H);
        this.buildCard(s);
        this.buildWorldBlock(s, wb, touch);
        this.buildHotbar(s, hb);
        this.buildChips(s);
        this.buildMenu(s, touch);
    }

    /** The farmer card: portrait, name, the level tag, hearts, energy, skill points, and the tooltip with the numbers. */
    private buildCard (s: Phaser.Scene) {
        this.card = s.add.graphics().setDepth(5);
        this.portrait = s.add.image(36, 38, ensureFarmer(s, this.farm.meS?.look, this.farm.meS?.color ?? 0), 0).setScale(3).setDepth(6);
        this.lookRef = this.farm.meS?.look; this.colorRef = this.farm.meS?.color ?? 0;
        // the level on a brass tag at the corner of the portrait (over the picture, not under it: its frame is in the chrome)
        this.nameT = label(s, 70, 9, '', 16, PAL.cream, { font: 'head' }).setDepth(6);
        this.lvT = label(s, 48.5, 55.5, '1', 13, TEXT.ink, { origin: [0.5, 0.5], dark: true, font: 'head', shadow: false }).setDepth(7);
        this.eneT = label(s, 0, 0, '', 12, PAL.pebble).setDepth(6);
        this.ptsT = label(s, LEFT.x + LEFT.w - 12, 11, '', 13, PAL.gold, { font: 'head', origin: [1, 0] }).setDepth(6);
        this.boltI = icon(s, 'k_bolt', 72, 0, 1.5).setDepth(6);
        for (let i = 0; i < 16; i++) this.hearts.push(s.add.image(0, 0, 'heart', 0).setScale(2).setVisible(false).setDepth(6));
        // hovering the card gives the numbers behind the bars
        const cz = s.add.zone(LEFT.x, EDGE, LEFT.w, CARD_H).setOrigin(0).setInteractive().setDepth(5);
        tipOn(cz, () => {
            const me = this.me(), d = derived(me);
            const tipLines = [
                { t: `Hearts  ${Math.round(me.hearts * 2) / 2} / ${d.maxHearts}`, c: PAL.berry },
                { t: `Energy  ${Math.floor(me.energy)} / ${d.maxEnergy}`, c: PAL.gold },
                { t: `Experience  ${Math.floor(me.xp)} / ${xpToNextOf(me)}`, c: PAL.plum },
            ];
            if (me.points > 0) tipLines.push({ t: `${me.points} skill point${me.points > 1 ? 's' : ''} to spend (K)`, c: PAL.gold });
            return { title: me.name, color: PAL.cream, sub: `Level ${me.level}`, lines: tipLines };
        });
        this.cardZone = cz;
    }

    /** The world block: the day dial, clock, season and day, the coins, the minimap and the lost-backpack marker. */
    private buildWorldBlock (s: Phaser.Scene, wb: ReturnType<typeof worldBlock>, touch: boolean) {
        this.right = s.add.graphics().setDepth(5);
        this.sunI = s.add.image(0, 0, 'sun', 0).setScale(2).setDepth(7);
        const fx = wb.frame.x, fw = wb.frame.w;
        this.timeT = label(s, fx + 12, wb.headY, '', 14, PAL.pebble, { font: 'head' }).setDepth(7);
        this.seasonT = label(s, fx + fw / 2 + 4, wb.headY, '', 13, PAL.cream, { origin: [0.5, 0], font: 'head' }).setDepth(7);
        this.dayT = label(s, fx + fw - 12, wb.headY, '', 15, PAL.cream, { origin: [1, 0], font: 'head' }).setDepth(7);
        label(s, fx + 16, wb.coinY, 'Coins', 12, PAL.pebble, { origin: [0, 0.5] }).setDepth(7);
        this.coinT = label(s, fx + fw - 38, wb.coinY, '0', 16, PAL.gold, { origin: [1, 0.5], font: 'head' }).setDepth(7);
        s.add.image(fx + fw - 24, wb.coinY, 'i_coin', 0).setScale(1.6).setDepth(7);
        this.minimap = new Minimap(s, this.farm, touch);
        this.pkG = s.add.graphics().setDepth(6);
        this.pkT = label(s, 0, 0, '', 12, PAL.cream, { origin: [0.5, 1], stroke: 3 }).setDepth(7).setVisible(false);
        this.pkI = icon(s, 'lostpack', 0, 0, 1).setDepth(7).setVisible(false);
        // tapping the map opens the big one
        const mz = s.add.zone(wb.map.x, wb.map.y, wb.map.w, wb.map.h).setOrigin(0).setInteractive({ useHandCursor: true }).setDepth(6);
        onTap(mz, () => this.onMenu('map'));
        tipOn(mz, () => ({ title: 'World map', sub: 'Key: M', color: PAL.cream, lines: [{ t: 'Click the map to see the whole world.', c: PAL.pebble }] }));
    }

    /** The hotbar: eight slots with their key labels and tooltips, and the name of what you just selected. */
    private buildHotbar (s: Phaser.Scene, hb: ReturnType<typeof hotbarLayout>) {
        this.hot = s.add.graphics().setDepth(5);
        for (let i = 0; i < 8; i++) {
            const sx = hb.x + hb.pad + i * hb.pitch, sy = hb.y + hb.pad;
            const slot = new Slot(s, sx, sy, hb.size);
            slot.root.setDepth(6);
            this.slots.push(slot);
            this.keyLabels.push(label(s, sx + 4, sy + 3, `${i + 1}`, 11, PAL.pebble).setDepth(7));
            onTap(slot.interactive, () => this.farm.hotSelect(i));
            tipOn(slot.interactive, () => {
                const p = this.me();
                const id = hotbarOf(p)[i];
                if (!id) return { title: `Slot ${i + 1}`, color: PAL.pebble, lines: [{ t: isTouchUi() ? 'Empty. Open the BAG and hold an item to pin it here.' : 'Empty. Open the Backpack (I) and right-click an item to pin it here.', c: PAL.pebble }] };
                const foot = (isTouchUi() ? { gear: 'Tap to equip', use: 'Tap to use', seed: 'Selected seeds are planted when you tap USE at a Garden Bed', pod: 'Selected pods are the ones POD throws', item: 'Pinned here as a reminder' } : { gear: `Press ${i + 1} or click to equip`, use: `Press ${i + 1} or click to use  ·  scroll only selects`, seed: 'Selected seeds are planted when you press E at a Garden Bed', pod: 'Selected pods are the ones T throws', item: 'Pinned here as a reminder' })[hotKind(id)];
                return itemTip(id, { count: countOf(p, id), foot });
            });
        }
        this.selT = label(s, hb.x + hb.w - 2, 0, '', 14, PAL.cream, { origin: [1, 1], font: 'head', stroke: 3 }).setDepth(8).setAlpha(0);
    }

    /** The status row: the buff chips, the season wish chip and the co-op boss status chip. */
    private buildChips (s: Phaser.Scene) {
        this.buffG = s.add.graphics().setDepth(5);
        for (let i = 0; i < 8; i++) {
            this.buffI.push(s.add.image(0, 0, 'i_bread', 0).setScale(1).setVisible(false).setDepth(7));
            this.buffT.push(label(s, 0, 0, '', 11, PAL.cream, { origin: [1, 1], stroke: 3 }).setDepth(7));
            this.buffC.push(label(s, 0, 0, '', 9, PAL.gold, { origin: [1, 0], stroke: 3, font: 'head' }).setDepth(7.5).setVisible(false));
            const bz = s.add.zone(0, 0, CHIP_H, CHIP_H).setOrigin(0).setInteractive().setDepth(8).setVisible(false);
            tipOn(bz, () => this.buffTip(i));
            this.buffZ.push(bz);
        }

        // the season wish chip: sits after the buffs and opens the Season wish window
        this.wishZ = s.add.zone(0, 0, CHIP_H, CHIP_H).setOrigin(0).setInteractive({ useHandCursor: true }).setDepth(8).setVisible(false);
        onTap(this.wishZ, () => this.onMenu('wish'));
        tipOn(this.wishZ, () => this.wishTip());
        // the co-op boss status chip (frozen, hexed, chained) opens the row: its words are the same as the warning's
        this.coZ = s.add.zone(0, 0, CHIP_H, CHIP_H).setOrigin(0).setInteractive().setDepth(8).setVisible(false);
        tipOn(this.coZ, () => { const co = this.farm.meS?.co; if (!co) return null; const i = CO_INFO[co.k]; return { title: i.name, color: i.color, icon: i.icon, lines: [{ t: i.tip, c: PAL.pebble }] }; });
    }

    /** The menu bar (a computer) or the BAG / BUILD / MENU buttons (a phone). */
    private buildMenu (s: Phaser.Scene, touch: boolean) {
        this.menuG = s.add.graphics().setDepth(5);
        this.badgeMenuG = s.add.graphics().setDepth(8.6);       // (the skill-point badge sits over the icon and over a phone's button)
        this.menuBadge = label(s, 0, 0, '', 11, TEXT.ink, { origin: [0.5, 0.5], dark: true, font: 'head', shadow: false }).setDepth(9);
        if (touch) {
            TOUCH_MENU.forEach((b, i) => {
                const btn = button(s, TOUCH_BAR.xs[i], TOUCH_BAR.y, TOUCH_BAR.w, TOUCH_BAR.h, b.label, () => this.onMenu(b.id), { style: STYLES.dark, size: 11, icon: b.icon, ink: false });
                btn.root.setDepth(8);
            });
        } else MENU_BUTTONS.forEach((b, i) => {
            const c = menuCell(i);
            this.menuIcons.push(icon(s, b.icon, c.x + c.w / 2, c.y + 12, 2).setDepth(7));
            this.menuKeys.push(label(s, c.x + c.w / 2, c.y + c.h - 2, b.key, 11, PAL.pebble, { origin: [0.5, 1] }).setDepth(7));
            const z = s.add.zone(c.x, c.y, c.w, c.h).setOrigin(0).setInteractive({ useHandCursor: true }).setDepth(8);
            onTap(z, () => this.onMenu(b.id));
            z.on('pointerover', () => { this.menuHot = i; });
            z.on('pointerout', () => { if (this.menuHot === i) this.menuHot = -1; });
            tipOn(z, () => ({ title: b.label, sub: `Key: ${b.key}`, color: PAL.cream }));
        });
    }

    private cardZone!: Phaser.GameObjects.Zone;

    private me () { return this.farm.meS!; }

    /** There is something in the status row above the hotbar (a buff), so the stack above it makes room. (The name of what you just picked floats over the right end for a moment and takes no room.) */
    get statusRow (): boolean { const me = this.farm.meS; return !!me && (me.buffs.length > 0 || !!me.co || !!this.wishChip()); }

    flash (color: number, alpha = 0.35) {
        this.flashR.setFillStyle(color, 1).setAlpha(alpha);
        this.scene.tweens.add({ targets: this.flashR, alpha: 0, duration: 380 });
    }

    // ── per-frame ───────────────────────────────────────────────────────────
    update (dt: number) {
        this.t += dt;
        const f = this.farm, me = f.meS!, d = f.derivedMe();
        this.drawChrome(me, d);
        this.drawCard(me, d);
        this.drawRight(me, dt);
        this.drawHotbar(me);
        this.selShow = Math.max(0, this.selShow - dt);
        this.selT.setAlpha(Math.min(1, this.selShow * 2.5)).setY(hotbarLayout(this.touch).y - 6);
        this.drawBuffs(me);
        this.drawMenu(me);
        // low-health pulse at the screen edges
        const frac = me.hearts / d.maxHearts;
        const low = frac < 0.34 && me.downed <= 0;
        if (low || this.lowDrawn) this.lowHp.clear();
        this.lowDrawn = low;
        if (low) {
            const a = 0.1 + 0.08 * Math.sin(this.t * 6) + (0.34 - frac) * 0.4;
            for (let i = 0; i < 6; i++) { rect(this.lowHp, i * 6, i * 6, W - i * 12, 6, PAL.berry, a * (1 - i / 6)); rect(this.lowHp, i * 6, H - i * 6 - 6, W - i * 12, 6, PAL.berry, a * (1 - i / 6)); }
        }
        if (me.hearts < this.lastHearts - 0.01) this.flash(PAL.berry, 0.3);
        this.lastHearts = me.hearts;
    }

    /** Frames that only change shape rarely: the farmer card, the world block, the hotbar and the menu bar. */
    private drawChrome (me: PlayerS, d: ReturnType<typeof derived>) {
        const rows = Math.ceil(Math.ceil(d.maxHearts) / 7);
        const hot = me.points > 0;
        const key = `${rows}:${hot}`;
        if (key === this.chromeKey) return;
        this.chromeKey = key;
        this.chrome.thaw();
        const g = this.chrome.g, touch = this.touch;
        // the farmer card
        const ch = cardHeight(rows);
        this.cardRect = { x: LEFT.x, y: EDGE, w: LEFT.w, h: ch };
        this.cardZone.setSize(LEFT.w, ch);
        panel(g, LEFT.x, EDGE, LEFT.w, ch, { ...STYLES.dark, shadow: true });
        inset(g, 12, 12, 48, 48, PAL.deepSea, PAL.slate);
        // the brass tag the level sits on, at the corner of the portrait
        notch(g, 36, 47, 25, 17, WOOD[0], 1, 1.5);
        notch(g, 37, 48, 23, 15, BRASS.mid, 1, 1);
        rect(g, 38, 49, 21, 1, BRASS.hi, 0.9); rect(g, 38, 61, 21, 1, BRASS.lo, 0.8);
        // the world block: one frame for the clock, the coins and the map
        const wb = worldBlock(touch);
        panel(g, wb.frame.x, wb.frame.y, wb.frame.w, wb.frame.h, { ...STYLES.dark, shadow: true });
        inset(g, wb.map.x - 4, wb.map.y - 4, wb.map.w + 8, wb.map.h + 8, PAL.night, PAL.slate);
        notch(g, wb.frame.x + 10, wb.coinY - 12, wb.frame.w - 20, 24, PAPER.well, 1, 2);
        // the hotbar
        const hb = hotbarLayout(touch);
        panel(g, hb.x, hb.y, hb.w, hb.h, { ...STYLES.dark, shadow: true });
        rect(g, hb.x + hb.pad + 2 * hb.pitch - 2, hb.y + 8, 1, hb.size - 4, PAL.slate, 0.8);
        // the menu bar (a phone has big buttons instead)
        if (!touch) {
            panel(g, MENU_BAR.x, MENU_BAR.y, MENU_BAR.w, MENU_BAR.h, { ...STYLES.dark, shadow: true });
            MENU_BUTTONS.forEach((b, i) => {
                const c = menuCell(i);
                if (b.id === 'skills' && hot) notch(g, c.x + 1, c.y, c.w - 2, c.h, PAL.gold, 0.45, 3);
                if (i > 0) rect(g, c.x, c.y + 3, 0.5, c.h - 6, PAL.slate, 0.35);
            });
        }
        this.chrome.freeze();
    }

    private drawCard (me: PlayerS, d: ReturnType<typeof derived>) {
        const g = this.card;
        const maxH = Math.ceil(d.maxHearts);
        const rows = Math.ceil(maxH / 7);
        const ey = 38 + (rows - 1) * 22 + 18;
        const w = LEFT.w;
        if (me.look !== this.lookRef || me.color !== this.colorRef) {               // the face you chose in the character creator
            this.lookRef = me.look; this.colorRef = me.color;
            const pk = ensureFarmer(this.scene, me.look, me.color);
            if (this.portrait.texture.key !== pk) this.portrait.setTexture(pk, 0);
        }
        this.nameT.setText(me.name);
        this.lvT.setText(`${me.level}`);
        // hearts
        const full = Math.floor(me.hearts), half = me.hearts - full >= 0.5;
        for (let i = 0; i < this.hearts.length; i++) {
            const im = this.hearts[i];
            if (i >= maxH) { im.setVisible(false); continue; }
            const col = i % 7, row = Math.floor(i / 7);
            const tex = i < full ? 'heart' : i === full && half ? 'heart_half' : 'heart_empty';
            if (im.texture.key !== tex) im.setTexture(tex, 0);
            im.setVisible(true).setPosition(80 + col * 25, 38 + row * 22);
            if (me.hearts - 0.01 <= i + 0.5 && me.hearts > 0 && i === full) im.setScale(2 + Math.max(0, Math.sin(this.t * 8)) * (me.hearts < 1.5 ? 0.25 : 0));
            else im.setScale(2);
        }
        // energy (a bolt, the bar, the number) and xp: the bars are drawn again only when a pixel of them would move
        const ew = Math.round(Math.min(150, 70 + d.maxEnergy * 0.4));
        const blink = me.energy <= 0 && Math.floor(this.t * 4) % 2 === 1;
        const next = xpToNextOf(me);
        const key = `${rows}|${ew}|${Math.round((me.energy / d.maxEnergy) * ew)}|${blink}|${Math.round((me.xp / next) * (w - 20))}|${d.maxEnergy}`;
        if (key !== this.cardKey) {
            this.cardKey = key;
            g.clear();
            this.boltI.setPosition(72, ey + 5);
            bar(g, 80, ey, ew, 11, me.energy / d.maxEnergy, blink ? PAL.berry : PAL.gold, { ticks: Math.round(d.maxEnergy / 25) });
            bar(g, 14, ey + 16, w - 20, 7, me.xp / next, PAL.plum);
            this.eneT.setPosition(80 + ew + 6, ey - 2);
        }
        this.eneT.setText(`${Math.floor(me.energy)}`);
        // skill points
        if (me.points > 0) {
            const pulse = 1 + Math.sin(this.t * 5) * 0.1;
            this.ptsT.setText(`★ ${me.points}`).setScale(pulse).setVisible(true);
        } else this.ptsT.setVisible(false);
    }

    /** The world block: the day dial, the clock, the season, the coins and the map (its frame is in the chrome). */
    private drawRight (me: PlayerS, dt: number) {
        const f = this.farm, g = this.right, c = f.clock, wb = worldBlock(this.touch);
        const { sky } = wb;
        const hour = hourOf(c.clock, c.night, c.nightLen);
        // the last minute of daylight: the dial's rim warms up and pulses
        const left = TUNING.dayLength - c.clock;
        const dusk = !c.night && left <= TUNING.duskWarn[0] && left > 0;
        const urgent = dusk && left <= TUNING.duskWarn[1];
        // the dial is drawn again when the sky changes (and every frame through the dusk pulse)
        const skyKey = `${c.night}|${dusk}|${urgent}`;
        if (skyKey !== this.skyKey || dusk) {
            this.skyKey = skyKey;
            g.clear();
            const rim = dusk ? (urgent ? PAL.berry : PAL.pumpkin) : WOOD[0];
            notch(g, sky.x, sky.y, sky.w, sky.h, rim, 1, 1);
            rect(g, sky.x + 1, sky.y + 1, sky.w - 2, sky.h - 2, c.night ? PAL.night : PAL.sea);
            if (!c.night) { rect(g, sky.x + 1, sky.y + 1, sky.w - 2, 6, PAL.foam, 0.35); rect(g, sky.x + 1, sky.y + 12, sky.w - 2, 5, PAL.grass, 0.55); }
            else for (let i = 0; i < 9; i++) rect(g, sky.x + 6 + ((i * 53) % (sky.w - 12)), sky.y + 3 + ((i * 7) % 9), 1, 1, PAL.cream, 0.8);
            if (dusk) rect(g, sky.x + 1, sky.y + 1, sky.w - 2, sky.h - 2, rim, (urgent ? 0.32 : 0.18) + (urgent ? 0.14 * Math.abs(Math.sin(this.farm.time.now / 160)) : 0));
            const sunTex = c.night ? 'moon' : 'sun';
            if (this.sunI.texture.key !== sunTex) this.sunI.setTexture(sunTex, 0).setScale(c.night ? 1.4 : 1.3);
        }
        const frac = c.night ? (c.clock - TUNING.dayLength) / c.nightLen : c.clock / TUNING.dayLength;
        const px = sky.x + 6 + frac * (sky.w - 12), py = sky.y + 14 - Math.sin(Math.PI * frac) * 11;
        this.sunI.setPosition(Math.round(px), Math.round(py));
        this.dayT.setText(`${c.night ? 'Night' : 'Day'} ${c.day}`);
        this.timeT.setText(hhmm(hour));
        const sd = SEASONS[seasonOf(c.day)];
        if (this.seasonName !== sd.name) { this.seasonName = sd.name; this.seasonT.setText(sd.name).setColor(hex(deepen(sd.color, 0.72))); }
        // coins
        if (this.coinShown !== me.coins) {
            const diff = me.coins - this.coinShown;
            this.coinShown += Math.sign(diff) * Math.max(1, Math.ceil(Math.abs(diff) * 0.2));
            if (Math.sign(me.coins - this.coinShown) !== Math.sign(diff)) this.coinShown = me.coins;
        }
        this.coinT.setText(`${this.coinShown}`);
        this.drawPackMarker(me);
        this.minimap.update(dt, this.touch);
    }

    /** The big map (the World map window asks for it through the screen context). */
    drawMinimap (g: Phaser.GameObjects.Graphics, x: number, y: number, cell: number, labels?: Phaser.GameObjects.Container, big = false, framed = true, view?: { gx: number; gy: number; span: number }) {
        this.minimap.draw(g, x, y, cell, labels, big, framed, view);
    }

    /** An arrow at the edge of the play area toward your lost backpack (and how far), until you pick it up. In the other layer (caves or surface) only a note. */
    private drawPackMarker (me: PlayerS) {
        const g = this.pkG, f = this.farm;
        if (this.pkDrawn) g.clear();
        this.pkDrawn = false;
        const pk = me.pk;
        if (!pk || me.downed > 0) { this.pkT.setVisible(false); this.pkI.setVisible(false); return; }
        const P = f.playerPos, tiles = Math.round(dist(pk.x, pk.y, P.x, P.y) / TILE);
        if (f.world.isUnderPx(pk.y) !== f.underground) {
            this.pkI.setVisible(false);
            const top = slots.get('top');
            this.pkT.setVisible(!this.slotBusy).setText(f.underground ? 'Your backpack is up on the surface' : 'Your backpack is down in the caves').setPosition(W / 2, Math.max(74, top ? top.y + top.h + 8 : 0)).setAlpha(0.9);       // (in the top slot: it waits while a card or a banner holds it)
            return;
        }
        const s = f.worldToScreen(pk.x, pk.y);
        const mk = edgeMarker(s, slots.obstacles(), PLAY, 26);
        if (mk.inside && tiles < 5) { this.pkT.setVisible(false); this.pkI.setVisible(false); return; }
        const bob = mk.inside ? Math.abs(Math.sin(this.t * 4)) * 4 : 0;
        this.pkI.setVisible(true).setPosition(Math.round(mk.x), Math.round(mk.y - 6 - bob)).setScale(1);
        this.pkT.setVisible(true).setText(`Backpack · ${tiles} tiles`).setPosition(Math.round(mk.x), Math.round(mk.y - 20 - bob)).setAlpha(1);
        if (!mk.inside) {
            this.pkDrawn = true;
            const a = Math.atan2(s.y - mk.y, s.x - mk.x), cx = mk.x, cy = mk.y;
            g.fillStyle(PAL.ink, 1).fillTriangle(cx + Math.cos(a) * 21, cy + Math.sin(a) * 21, cx + Math.cos(a + 2.5) * 13, cy + Math.sin(a + 2.5) * 13, cx + Math.cos(a - 2.5) * 13, cy + Math.sin(a - 2.5) * 13);
            g.fillStyle(PAL.gold, 1).fillTriangle(cx + Math.cos(a) * 18, cy + Math.sin(a) * 18, cx + Math.cos(a + 2.5) * 11, cy + Math.sin(a + 2.5) * 11, cx + Math.cos(a - 2.5) * 11, cy + Math.sin(a - 2.5) * 11);
        }
    }

    private drawHotbar (me: PlayerS) {
        const g = this.hot;
        const hb = hotbarLayout(this.touch);
        const bar = hotbarOf(me);
        const sel = this.farm.hotSel;
        // the slots are touched only when what they show could have changed (each setText or setTexture would cost a redraw)
        const counts = bar.map((id) => (id ? countOf(me, id) : 0));
        const worn = Object.values(me.equip);
        const key = `${bar.join(',')}|${counts.join(',')}|${worn.join(',')}|${sel}`;
        if (key !== this.hotKey) {
            this.hotKey = key;
            const equipped = new Set(worn);
            this.slots.forEach((slot, i) => {
                const id = bar[i], n = counts[i];
                slot.setSelected(i === sel);
                slot.set(id ? { icon: iconOf(id), count: hotKind(id) === 'gear' ? 0 : n, rarity: ITEMS[id].rarity, dim: n === 0 && !equipped.has(id) } : null);
            });
        }
        // the name of what you just selected, for a moment
        const held = bar[sel];
        const name = held ? ITEMS[held].name : '';
        if (sel !== this.lastSel || name !== this.lastSelName) { this.lastSel = sel; this.lastSelName = name; if (name) { this.selT.setText(name); this.selShow = 1.4; } }
        // swing cooldown sweep on the slot holding your pick
        const cd = this.farm.swingCooldownFrac();
        const sweep = cd > 0;
        if (sweep || this.hotSweep) g.clear();
        this.hotSweep = sweep;
        if (!sweep) return;
        const ti = bar.findIndex((id) => !!id && id === me.equip.tool);
        const inner = hb.size - 4;
        if (ti >= 0) rect(g, hb.x + hb.pad + ti * hb.pitch + 2, hb.y + hb.pad + 2 + inner * (1 - cd), inner, inner * cd, PAL.ink, 0.5);
    }

    /** The season wish: the blessing you carry, or a pulsing star while the farm is still voting. */
    private wishChip (): { icon: string; rim: number; pending: boolean } | null {
        const me = this.farm.meS, w = this.farm.wishState();
        if (!me) return null;
        const def = me.wish ? WISH_BY_ID[me.wish] : undefined;
        if (def) return { icon: def.icon, rim: def.color, pending: false };
        if (w && w.won === undefined && w.k === seasonIndex(this.farm.clock.day)) return { icon: 'k_star', rim: PAL.gold, pending: true };
        return null;
    }

    private wishTip (): TipData | null {
        const c = this.wishChip(), me = this.farm.meS;
        if (!c || !me) return null;
        const def = me.wish ? WISH_BY_ID[me.wish] : undefined;
        if (!def) return { title: 'Season wish', color: PAL.gold, icon: 'k_star', lines: [{ t: 'The farm is choosing a blessing for the season.', c: PAL.pebble }], foot: isTouchUi() ? 'Tap to vote' : 'Click to vote' };
        return {
            title: def.name, sub: 'Season wish', color: def.color, icon: def.icon,
            lines: [{ t: def.blurb, c: PAL.pebble }, ...(Object.entries(def.mods) as [StatKey, number][]).map(([k, v]) => ({ t: modLine(k, v), c: PAL.lime }))],
            foot: 'Lasts until the season ends',
        };
    }

    /** The card for a buff chip: what it does, how long is left and, from a potluck feast, who cooked it. */
    private buffTip (i: number): TipData | null {
        const b = this.farm.meS?.buffs[i], def = b && BUFFS[b.id as BuffId];
        if (!b || !def) return null;
        const secs = Math.ceil(b.t);
        return {
            title: def.name, color: def.good ? PAL.lime : PAL.berry, icon: def.icon, sub: b.by ? `Cooked by ${b.by}` : undefined, subColor: PAL.gold,
            lines: [{ t: def.desc, c: PAL.pebble }, ...(Object.entries(def.mods) as [StatKey, number][]).map(([k, v]) => ({ t: modLine(k, v), c: PAL.lime })), { t: `${secs >= 60 ? `${Math.floor(secs / 60)}m ${secs % 60}s` : `${secs}s`} left`, c: PAL.gold }],
        };
    }

    /** The buffs you carry, in a row above the hotbar's left end, then the season wish. */
    private drawBuffs (me: PlayerS) {
        const g = this.buffG;
        const hb = hotbarLayout(this.touch), by = this.stack.status;
        const co = me.co, sh = co ? 1 : 0;                       // (a co-op boss status takes the first place in the row)
        const wish = this.wishChip(), nb = Math.min(me.buffs.length, (wish ? 7 : 8) - sh);
        // the chips' frames are drawn again only when the row changes (which chips, their colours, where the row sits)
        let key = `${by}|${co?.k ?? ''}|${wish?.icon ?? ''}|${wish?.rim ?? ''}`;
        for (let i = 0; i < nb; i++) key += `|${me.buffs[i].id}`;
        const redraw = key !== this.buffKey;
        if (redraw) { this.buffKey = key; g.clear(); }
        const setTex = (im: Phaser.GameObjects.Image, tex: string) => { if (im.texture.key !== tex) im.setTexture(tex, 0); return im; };
        if (co) {
            const info = CO_INFO[co.k], pulse = 0.7 + 0.3 * Math.sin(this.t * 7);
            if (redraw) panel(g, hb.x, by, CHIP_H, CHIP_H, { ...STYLES.deep, rim: info.color });
            setTex(this.buffI[0], info.icon).setPosition(hb.x + 13, by + 11).setVisible(true).setScale(1).setAlpha(pulse);
            this.buffT[0].setText(`${Math.max(0, Math.ceil(co.u - this.farm.clock.time))}`).setPosition(hb.x + CHIP_H - 2, by + CHIP_H - 1).setVisible(true);
            this.coZ.setPosition(hb.x, by).setVisible(true);
        } else this.coZ.setVisible(false);
        if (wish) {
            const x = hb.x + (nb + sh) * 30, pulse = wish.pending ? 0.6 + 0.4 * Math.sin(this.t * 5) : 1;
            if (redraw) panel(g, x, by, CHIP_H, CHIP_H, { ...STYLES.deep, rim: wish.rim });
            setTex(this.buffI[nb + sh], wish.icon).setPosition(x + 13, by + 11).setVisible(true).setScale(1).setAlpha(pulse);
            this.buffT[nb + sh].setVisible(false);
            this.wishZ.setPosition(x, by).setVisible(true);
        } else this.wishZ.setVisible(false);
        for (let i = 0; i < nb; i++) {
            const b = me.buffs[i], def = BUFFS[b.id as BuffId];
            const x = hb.x + (i + sh) * 30;
            if (redraw) panel(g, x, by, CHIP_H, CHIP_H, { ...STYLES.deep, rim: def.good ? PAL.lime : PAL.berry });
            setTex(this.buffI[i + sh], def.icon).setPosition(x + 13, by + 11).setVisible(true).setScale(1).setAlpha(1);
            this.buffT[i + sh].setText(`${Math.ceil(b.t)}`).setPosition(x + CHIP_H - 2, by + CHIP_H - 1).setVisible(true);
            const mark = b.by ? b.by.slice(0, 1).toUpperCase() : '';
            if (this.buffC[i].text !== mark) this.buffC[i].setText(mark);
            this.buffC[i].setPosition(x + CHIP_H - 2, by + 1).setVisible(!!b.by);
            this.buffZ[i].setPosition(x, by).setVisible(true);
        }
        for (let i = nb + sh + (wish ? 1 : 0); i < 8; i++) { this.buffI[i].setVisible(false); this.buffT[i].setVisible(false); }
        for (let i = nb; i < 8; i++) { this.buffC[i].setVisible(false); this.buffZ[i].setVisible(false); }       // (the wish chip and the co-op chip have their own zones)
    }

    private drawMenu (me: PlayerS) {
        const g = this.menuG, bg = this.badgeMenuG;
        // the hover highlight and the badge are drawn again when the pointer moves to another button or the badge appears (it pulses: every frame while it shows)
        const key = `${this.menuHot}|${me.points > 0}`;
        if (key === this.menuKey && me.points <= 0) return;
        this.menuKey = key;
        g.clear(); bg.clear();
        let sx: number, sy: number;
        if (this.touch) { sx = TOUCH_BAR.xs[2] + TOUCH_BAR.w / 2 - 6; sy = TOUCH_BAR.y - TOUCH_BAR.h / 2 + 2; }
        else {
            const si = MENU_BUTTONS.findIndex((b) => b.id === 'skills'), c = menuCell(si);
            sx = c.x + c.w - 4; sy = c.y + 3;
            if (this.menuHot >= 0) { const hc = menuCell(this.menuHot); notch(g, hc.x + 1, hc.y, hc.w - 2, hc.h, PAL.snow, 0.5, 3); }
        }
        if (me.points > 0) {
            const pulse = 1 + Math.sin(this.t * 6) * 0.12;
            bg.fillStyle(WOOD[0], 1).fillCircle(sx, sy, 8.5 * pulse);
            bg.fillStyle(BRASS.mid, 1).fillCircle(sx, sy, 7 * pulse);
            this.menuBadge.setText(`${Math.min(me.points, 99)}`).setPosition(sx, sy).setVisible(true);
        } else this.menuBadge.setVisible(false);
    }

    /** All the little pieces of text that read as part of the HUD (for hiding behind full-screen menus). */
    setHidden (_on: boolean) { /* HUD stays visible behind modals */ }
}

