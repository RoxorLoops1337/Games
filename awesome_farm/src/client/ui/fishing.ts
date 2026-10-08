// Fishing HUD: a prompt that tells you what the line is doing (and when to pull), and the card
// that pops up when you land something.

import type * as Phaser from 'phaser';
import { FISH_BY_ID, MAX_STRIKES } from '../../shared/data/fish';
import { ITEMS, iconOf, ItemId, RARITY_NAMES } from '../../shared/data/items';
import { PAL } from '../../shared/palette';
import type { PlayerS, SimEvent } from '../../shared/sim/types';
import { isTouchUi, keyLabel } from '../input/layout';
import { icon, label, W } from './kit';
import { bar, hex, inset, panel, rect, RARITY_COLORS, STYLES } from './px';
import { FISH_H, TOP_SLOT, type Rect } from './slots';
import { PAPER, WOOD } from './theme';

type Catch = Extract<SimEvent, { e: 'catch' }>;

/** The line panel is narrower on a phone, where the toasts take the strip to its right. */
const PH = FISH_H, CARD_W = 300, CARD_H = 84, CARD_LIFE = 3.4;
const panelW = () => (isTouchUi() ? 256 : 360);

export class FishHud {
    private g: Phaser.GameObjects.Graphics;
    private titleT: Phaser.GameObjects.Text;
    private subT: Phaser.GameObjects.Text;
    private pulse = 0;
    private shown = 0;
    // the catch card
    private cg: Phaser.GameObjects.Graphics;
    private cIcon: Phaser.GameObjects.Image;
    private cName: Phaser.GameObjects.Text;
    private cSub: Phaser.GameObjects.Text;
    private cTag: Phaser.GameObjects.Text;
    private cAge = 99;
    private cCol: number = PAL.cream;

    /** The catch card is on screen (it sits where the banners go). */
    get cardUp () { return this.cAge < CARD_LIFE; }

    /** Where the catch card is while it shows (it takes the top slot, so the cards and banners wait). */
    get cardRect (): Rect | null { return this.cardUp ? { x: Math.round(W / 2 - CARD_W / 2), y: TOP_SLOT.y, w: CARD_W, h: CARD_H } : null; }

    constructor (scene: Phaser.Scene) {
        this.g = scene.add.graphics().setDepth(8);
        this.titleT = label(scene, 0, 0, '', 20, PAL.cream, { origin: [0.5, 0.5], font: 'head' }).setDepth(9);
        this.subT = label(scene, 0, 0, '', 13, PAL.cream, { origin: [0.5, 0.5], bold: false }).setDepth(9);
        this.cg = scene.add.graphics().setDepth(9);
        this.cIcon = icon(scene, 'i_fish_carp', 0, 0, 3).setDepth(10).setVisible(false);
        this.cName = label(scene, 0, 0, '', 19, PAL.cream, { font: 'head' }).setDepth(10).setVisible(false);
        this.cSub = label(scene, 0, 0, '', 13, PAL.pebble, { bold: false }).setDepth(10).setVisible(false);
        this.cTag = label(scene, 0, 0, '', 13, PAL.gold, { origin: [1, 0], font: 'head' }).setDepth(10).setVisible(false);
    }

    /** You landed something. */
    showCatch (e: Catch) {
        const it = ITEMS[e.item as ItemId];
        const def = FISH_BY_ID[e.item];
        this.cAge = 0;
        this.cCol = e.junk ? PAL.pebble : RARITY_COLORS[it.rarity];
        this.cIcon.setTexture(iconOf(e.item), 0).setVisible(true);
        this.cName.setText(`${e.double ? '2× ' : ''}${it.name}`).setColor(hex(e.junk ? PAL.pebble : [PAL.cream, PAL.lime, PAL.foam, PAL.blossom, PAL.gold][it.rarity])).setVisible(true);
        this.cSub.setText(e.junk ? (e.item === 'fiber' ? 'Just some weed.' : e.item === 'pearl' ? 'A real pearl!' : 'Better luck next time.') : `${e.size ?? '?'} cm · ${RARITY_NAMES[it.rarity]}`).setVisible(true);
        const tags = [e.isNew && def ? 'NEW!' : '', e.best ? 'PERSONAL BEST' : '', e.double ? 'DOUBLE' : ''].filter(Boolean);
        this.cTag.setText(tags.join('  ')).setVisible(true);
    }

    /** `top`: where the fishing panel's top edge is this frame (above the chat and the prompt). */
    update (dt: number, me: PlayerS, top = 372) {
        this.pulse += dt;
        this.drawPrompt(dt, me, top);
        this.drawCard(dt);
    }

    private drawPrompt (dt: number, me: PlayerS, top: number) {
        const f = me.fishing;
        this.shown += ((f ? 1 : 0) - this.shown) * Math.min(1, dt * 9);
        const g = this.g;
        if (!f && this.shown < 0.02) { g.clear(); this.titleT.setVisible(false); this.subT.setVisible(false); return; }
        if (!f) { g.setAlpha(this.shown); return; }
        const touch = isTouchUi(), PW = panelW();
        const x = touch ? 272 : Math.round(W / 2 - PW / 2), y = Math.round(top) + Math.round((1 - this.shown) * 14);
        g.clear().setAlpha(this.shown);
        const rod = [1.15, 1.35, 1.6][f.rod] ?? 1.15;
        const hot = f.ph === 1 || f.ph === 3;
        const flash = hot && Math.floor(this.pulse * 8) % 2 === 0;
        const rim = hot ? (f.ph === 3 ? PAL.foam : PAL.gold) : PAL.slate;
        panel(g, x, y, PW, PH, { ...STYLES.dark, rim, hi: rim, fill: flash ? 0xfbd9a0 : PAPER.base, shadow: true });
        let title = '', sub = '', col: number = PAL.cream;
        const fk = keyLabel('KeyQ');
        if (f.ph === 0) { title = `Fishing${'.'.repeat(1 + (Math.floor(this.pulse * 2) % 3))}`; sub = touch ? 'Wait for the bite' : `Wait for the bite  ·  ${fk}: pull in early`; col = PAL.foam; }
        else if (f.ph === 1) { title = touch ? 'BITE!  Tap PULL' : `BITE!  Press ${fk}`; sub = 'Now!'; col = PAL.gold; }
        else if (f.ph === 2) { title = 'It is fighting…'; sub = touch ? 'Wait for the tug' : 'Wait for the tug. Pulling now slips the line.'; col = PAL.cream; }
        else { title = touch ? 'PULL!  Tap PULL' : `PULL!  Press ${fk}`; sub = 'The fish is tugging'; col = PAL.foam; }
        this.titleT.setVisible(true).setAlpha(this.shown).setText(title).setColor(hex(col)).setPosition(x + PW / 2, y + 18);
        this.subT.setVisible(true).setAlpha(this.shown).setText(sub).setPosition(x + PW / 2, y + 40);
        if (hot) {
            const total = f.ph === 1 ? rod : 0.9 + 0.12 * f.rod;
            bar(g, x + 24, y + PH - 12, PW - 48, 8, Math.min(1, f.t / total), f.ph === 1 ? PAL.gold : PAL.foam);
        } else if (f.ph === 2 || f.rounds > 0) {
            // tugs answered / needed, and slips
            const n = f.rounds + 1;
            for (let i = 0; i < n; i++) {
                const px = x + PW / 2 - (n * 14) / 2 + i * 14, py = y + PH - 14;
                const done = i === 0 ? f.ph >= 2 : f.round >= i;
                rect(g, px, py, 10, 8, WOOD[0]); rect(g, px + 1, py + 1, 8, 6, done ? PAL.lime : PAPER.deep);
            }
            for (let i = 0; i < MAX_STRIKES; i++) { const px = x + PW - 20 - i * 12, py = y + 8; rect(g, px, py, 8, 8, WOOD[0]); rect(g, px + 1, py + 1, 6, 6, i < f.strikes ? PAL.berry : PAPER.deep); }
        }
    }

    private drawCard (dt: number) {
        this.cAge += dt;
        const g = this.cg;
        const life = CARD_LIFE;
        if (this.cAge > life) { g.clear(); this.cIcon.setVisible(false); this.cName.setVisible(false); this.cSub.setVisible(false); this.cTag.setVisible(false); return; }
        const a = Math.min(1, this.cAge / 0.18) * Math.min(1, (life - this.cAge) / 0.5);
        const slide = (1 - Math.min(1, this.cAge / 0.25)) * 24;
        const w = CARD_W, h = CARD_H, x = Math.round(W / 2 - w / 2), y = Math.round(TOP_SLOT.y - slide);
        g.clear().setAlpha(a);
        panel(g, x, y, w, h, { ...STYLES.dark, rim: this.cCol, hi: this.cCol, shadow: true });
        inset(g, x + 10, y + 12, 60, 60, PAL.deepSea, PAL.slate);
        this.cIcon.setVisible(true).setAlpha(a).setPosition(x + 40, y + 42 + Math.sin(this.cAge * 6) * 1.5).setScale(3);
        this.cName.setAlpha(a).setPosition(x + 82, y + 14);
        this.cSub.setAlpha(a).setPosition(x + 82, y + 40);
        this.cTag.setAlpha(a).setPosition(x + w - 12, y + h - 22);
    }
}
