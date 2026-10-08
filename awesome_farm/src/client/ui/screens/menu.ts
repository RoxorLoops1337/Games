// The game menu (Esc / M): world map, farmers, settings, controls, and the way out.
//
// One page, five tabs in a fixed row (World map, Farmers, Settings, Controls, How to play; the sixth slot is kept for one more entry).
// The way out is always bottom left in red (Save & quit), the way back bottom right in gold (Resume), and a line between them says
// what world this is and that the game is paused.

import * as Phaser from 'phaser';
import { GRID } from '../../../shared/config';
import { BIOMES, BIOME_DEFS, MODS } from '../../../shared/data/biomes';
import { keyControls, TOUCH_CONTROLS, type ControlGroup } from '../../../shared/data/controls';
import { PAL } from '../../../shared/palette';
import { PLAYER_COLORS, derived } from '../../../shared/sim/stats';
import { saveSettings, settings } from '../../settings';
import { detectedName, KEYBOARD_CHOICES, keyLabel, moveKeys } from '../../input/layout';
import { setFullscreenSetting } from '../../input/screenMode';
import { isTouchUi } from '../../input/layout';
import { deviceText, fit, forDevice, icon, Obj, slider, tipOn, Win } from '../kit';
import { footButton, footHint, PAD, Pane, ROW_H, TabStrip } from '../menukit';
import { panel, rect, STYLES } from '../px';
import type { Screen, ScreenCtx } from './types';
import { logical } from '../../res';
import { tutorialApi } from '../tutorial';

const TABS = [
    { id: 'map', label: 'World map', icon: 'k_map' },
    { id: 'farmers', label: 'Farmers', icon: 'k_heart' },
    { id: 'settings', label: 'Settings', icon: 'k_gear' },
    { id: 'help', label: 'Controls', icon: 'k_hand' },
    { id: 'guide', label: 'How to play', icon: 'k_sprout' },
    { id: 'look', label: 'Your look', icon: 'k_eye' },
] as const;
type Tab = 'map' | 'farmers' | 'settings' | 'help';

type Group = ControlGroup;

// The page: the well all four tabs sit in (window-local), and the columns inside it.
const PAGE = { x: 16, y: 70, w: 904, h: 386 };
const IN_X = PAGE.x + 14, IN_R = PAGE.x + PAGE.w - 14, IN_Y = PAGE.y + 12;

export class MenuScreen implements Screen {
    private win: Win;
    private tab: Tab = 'map';
    private pane: Pane;
    private tabs: TabStrip;
    private mapG: Phaser.GameObjects.Graphics | null = null;
    private mapLabels: Phaser.GameObjects.Container | null = null;
    private t = 0;
    private farmersKey = '';
    /** The first farmer shown on the Farmers tab (eight fit; more scroll). */
    private fOffset = 0;
    /** Pixels per plot on the world map: the whole grid fits in the page's square (350 px, a tidy 10 per plot). */
    private readonly mapCell = Math.floor(352 / GRID);
    private readonly mapX = IN_X + 2;
    private readonly mapY = IN_Y + 2;

    constructor (private ctx: ScreenCtx, arg?: unknown) {
        const s = ctx.scene;
        const f = ctx.farm;
        const solo = f.conn.mode === 'solo';
        this.win = new Win(s, { size: 'large', title: 'Pause menu', icon: 'k_compass', accent: PAL.gold, onClose: () => ctx.close() });
        const w = this.win;
        this.pane = new Pane(w);
        this.tabs = new TabStrip(w, [...TABS], (id) => { if (id === 'guide' || id === 'look') ctx.open(id); else this.setTab(id as Tab); }, { slots: 6 });
        // footer: the way out (red, left), a line about this world, the way back (gold, right)
        footButton(w, 'left', 178, solo ? 'Save & quit' : 'Leave world', () => { ctx.close(); f.leave(); }, { style: STYLES.berry, ink: false });
        footButton(w, 'right', 178, 'Resume', () => ctx.close(), { style: STYLES.gold });
        const where = solo ? 'Solo world  ·  paused, saved in this browser' : `${f.serverName || 'Online world'}  ·  ${f.conn.label}  ·  the world keeps running`;
        footHint(w, w.w / 2, w.w - 2 * (PAD + 178 + 16), true).setText(`${where}\n${deviceText('Press Esc or M to go back to the game.', 'Tap Resume to go back to the game.')}`);
        const want = (arg as { tab?: Tab } | undefined)?.tab;
        this.setTab(want ?? 'map');
    }

    private add<T extends Obj> (o: T): T { return this.pane.add(o); }

    private setTab (t: Tab) {
        this.tab = t;
        this.pane.clear();
        this.mapG = null; this.mapLabels = null;
        this.tabs.set(t);
        this.pane.well(PAGE.x, PAGE.y, PAGE.w, PAGE.h);
        if (t === 'map') this.buildMap();
        else if (t === 'farmers') this.farmersKey = '';
        else if (t === 'settings') this.buildSettings();
        else this.buildHelp();
    }

    /** A heading over a group: head font, a ruled line under it. */
    private heading (x: number, y: number, w: number, text: string, note = '') {
        const t = this.pane.text(text, x, y, 14, PAL.gold, { font: 'head' });
        if (note) this.pane.text(note, x + w, y + 3, fit(11), PAL.pebble, { origin: [1, 0], bold: false });
        this.pane.rule(x, y + 24, w);
        return t;
    }

    // ── map ─────────────────────────────────────────────────────────────────
    private buildMap () {
        const w = this.win, s = this.ctx.scene, f = this.ctx.farm, pane = this.pane;
        const cell = this.mapCell, x = this.mapX, y = this.mapY;
        this.mapG = this.add(s.add.graphics());
        w.put(this.mapG, 0, 0);
        this.mapLabels = this.add(s.add.container(0, 0));
        w.putAt(this.mapLabels, 0, 0);
        const zone = this.add(w.put(s.add.zone(0, 0, GRID * cell, GRID * cell).setOrigin(0).setInteractive(), x, y));
        tipOn(zone, () => {
            const p = s.input.activePointer;
            const q = logical(p), gx = Math.floor((q.x - w.x - x) / cell), gy = Math.floor((q.y - w.y - y) / cell);
            const plot = f.world.plot(gx, gy);
            if (!plot) return null;
            const me = this.ctx.me();
            const b = BIOME_DEFS[plot.biome];
            const lines = [];
            if (plot.mod) lines.push({ t: `${MODS[plot.mod].name}: ${MODS[plot.mod].desc}`, c: MODS[plot.mod].color });
            if (plot.heart) lines.push({ t: 'The Old Heart — something ancient sleeps here.', c: PAL.berry });
            if (plot.owned) {
                const owner = Object.values(f.players).find((q) => q.id === plot.buyer);
                const home = plot.home !== undefined ? Object.values(f.players).find((q) => q.slot === plot.home) : null;
                lines.push({ t: home ? `${home.name}'s home island` : owner ? `Raised by ${owner.name}` : 'Raised land', c: PAL.cream });
            } else if (f.world.isPurchasable(plot)) {
                lines.push({ t: `For sale: ${Math.max(1, Math.round(f.world.price(plot, me.plotsBought) * derived(me).landMul))} coins`, c: PAL.gold });
            } else lines.push({ t: 'Open sea. Raise land next to it first.', c: PAL.pebble });
            return { title: `${b.name}  (${gx + 1}, ${gy + 1})`, color: b.color, lines };
        });
        // the right column: biomes, how to read the map, who is here
        const cx = x + GRID * cell + 28, cw = IN_R - cx;
        this.heading(cx, IN_Y, cw, 'Biomes');
        BIOMES.forEach((id, i) => {
            const b = BIOME_DEFS[id], col = i % 3, row = Math.floor(i / 3);
            const bx = cx + col * Math.floor(cw / 3), by = IN_Y + 36 + row * 26;
            rect(pane.g, bx, by + 1, 16, 16, PAL.ink); rect(pane.g, bx + 2, by + 3, 12, 12, b.color);
            pane.text(b.name, bx + 24, by, 13, PAL.cream);
        });
        this.heading(cx, IN_Y + 96, cw, 'Reading the map');
        const key = (i: number, draw: (g: Phaser.GameObjects.Graphics, kx: number, ky: number) => void, text: string, color: number = PAL.cream) => {
            const ky = IN_Y + 132 + i * 38;
            draw(pane.g, cx + 2, ky + 1);
            pane.text(forDevice(text), cx + 30, ky, fit(12), color, { bold: false, wrap: cw - 30 });
        };
        key(0, (g, kx, ky) => { rect(g, kx, ky, 16, 16, PAL.ink); rect(g, kx + 1, ky + 1, 14, 14, 0xe9f4f8); }, 'Light squares are for sale: walk to the edge of your land and press E.');
        key(1, (g, kx, ky) => { rect(g, kx, ky, 16, 16, PAL.berry); rect(g, kx + 2, ky + 2, 12, 12, PAL.sea); }, 'The red outline is the Old Heart, at the centre of the world.');
        key(2, (g, kx, ky) => { rect(g, kx, ky, 16, 16, PAL.ink); rect(g, kx + 1, ky + 1, 14, 14, 0x5d3f8c); rect(g, kx + 6, ky + 5, 4, 4, PAL.snow); }, 'Dark violet blocks with a skull are the Dread Reaches: the dead walk there, and a warden guards the middle.', PAL.plum);
        // who is here
        const online = Object.values(f.players).filter((p) => p.online);
        this.heading(cx, IN_Y + 254, cw, 'Farmers here', `${online.length} online`);
        online.slice(0, 6).forEach((p, i) => {
            const col = i % 2, row = Math.floor(i / 2), fx = cx + col * Math.floor(cw / 2), fy = IN_Y + 288 + row * 22;
            rect(pane.g, fx, fy + 2, 14, 14, PAL.ink); rect(pane.g, fx + 2, fy + 4, 10, 10, PLAYER_COLORS[p.color]);
            pane.text(`${p.name}${p.id === f.me ? ' (you)' : ''}`, fx + 22, fy, 13, PLAYER_COLORS[p.color]);
        });
        if (online.length > 6) pane.text(`+ ${online.length - 6} more on the Farmers tab`, cx, IN_Y + 288 + 3 * 22, fit(11), PAL.pebble, { bold: false });
    }

    // ── farmers ─────────────────────────────────────────────────────────────
    private buildFarmers () {
        const w = this.win, s = this.ctx.scene, f = this.ctx.farm, pane = this.pane;
        pane.clear();
        pane.well(PAGE.x, PAGE.y, PAGE.w, PAGE.h);
        const g = pane.g;
        const players = Object.values(f.players).sort((a, b) => Number(b.online) - Number(a.online) || a.slot - b.slot);
        const online = players.filter((p) => p.online).length;
        const L = IN_X, R = IN_R, cols = { name: L + 30, level: L + 330, hearts: L + 470, status: L + 520, gear: L + 650 };
        this.heading(L, IN_Y, R - L, `Everyone in this world  (${players.length})`, `${online} online`);
        const head = (text: string, x: number, right = false) => pane.text(text, x, IN_Y + 32, fit(11), PAL.pebble, { origin: [right ? 1 : 0, 0], bold: false });
        head('Farmer', cols.name); head('Level', cols.level, true); head('Hearts', cols.hearts, true); head('Status', cols.status); head('Gear', cols.gear);
        const top = IN_Y + 54, pitch = 36, per = 8;
        this.fOffset = Math.max(0, Math.min(this.fOffset, players.length - per));
        players.slice(this.fOffset, this.fOffset + per).forEach((p, i) => {
            const y = top + i * pitch, me = p.id === f.me;
            if (me) rect(g, L - 4, y, R - L + 8, pitch - 2, 0xfff3d6, 0.55);
            rect(g, L - 4, y + pitch - 2, R - L + 8, 1, PAL.slate, 0.3);
            rect(g, L + 2, y + 9, 18, 18, PAL.ink); rect(g, L + 4, y + 11, 14, 14, PLAYER_COLORS[p.color]);
            pane.text(`${p.name}${me ? ' (you)' : ''}`, cols.name, y + 9, 14, p.online ? PLAYER_COLORS[p.color] : PAL.pebble);
            pane.text(`${p.level}`, cols.level, y + 9, 14, PAL.plum, { origin: [1, 0] });
            pane.text(p.online ? `${Math.round(p.hearts * 2) / 2} / ${p.mh}` : '—', cols.hearts, y + 9, 14, PAL.blossom, { origin: [1, 0] });
            pane.text(!p.online ? 'offline' : p.downed > 0 ? 'down!' : 'online', cols.status, y + 9, 14, !p.online ? PAL.pebble : p.downed > 0 ? PAL.berry : PAL.lime);
            for (const [j, slot] of (['tool', 'weapon', 'head', 'body', 'charm'] as const).entries()) {
                const id = p.equip?.[slot];
                if (id) this.add(w.put(icon(s, `i_${id}`, 0, 0, 2), cols.gear + 14 + j * 34, y + pitch / 2 - 1));
            }
        });
        if (players.length > per) pane.text(`${this.fOffset + 1} to ${Math.min(players.length, this.fOffset + per)} of ${players.length}  ·  ${deviceText('scroll for more', 'drag the list for more')}`, R, top + per * pitch + 2, fit(11), PAL.pebble, { origin: [1, 0], bold: false });
    }

    // ── settings ────────────────────────────────────────────────────────────
    private buildSettings () {
        const s = this.ctx.scene, pane = this.pane;
        const colW = 420, L = IN_X, Rx = IN_R - colW;
        /** A row: the name (and a line under it), the control at the right edge of the column. */
        const label = (x: number, y: number, name: string, note?: string) => {
            pane.text(name, x, y, 14, PAL.cream);
            if (note) pane.text(note, x, y + 21, fit(11), PAL.pebble, { bold: false, wrap: colW - 130 });
        };
        const toggle = (x: number, y: number, name: string, note: string | undefined, get: () => boolean, set: (v: boolean) => void) => {
            label(x, y, name, note);
            const b = pane.button(x + colW - 44, y + 10, 88, ROW_H, get() ? 'On' : 'Off', () => { set(!get()); b.setLabel(get() ? 'On' : 'Off'); b.setStyle(get() ? STYLES.lime : STYLES.dark); saveSettings(); }, { style: get() ? STYLES.lime : STYLES.dark, size: 14, ink: get() });
            return b;
        };
        // left: what you hear and what the screen does
        this.heading(L, IN_Y, colW, 'Sound');
        toggle(L, IN_Y + 38, 'Sound effects', undefined, () => settings.sound, (v) => { settings.sound = v; });
        label(L, IN_Y + 82, 'Effects volume');
        pane.add(this.win.put(slider(s, 0, 0, 200, settings.volume, (v) => { settings.volume = v; saveSettings(); }).root, L + colW - 204, IN_Y + 92));
        label(L, IN_Y + 122, 'Music volume');
        pane.add(this.win.put(slider(s, 0, 0, 200, settings.music, (v) => { settings.music = v; saveSettings(); }, PAL.plum).root, L + colW - 204, IN_Y + 132));
        this.heading(L, IN_Y + 176, colW, 'Screen');
        toggle(L, IN_Y + 214, 'Screen shake', undefined, () => settings.shake, (v) => { settings.shake = v; });
        toggle(L, IN_Y + 258, 'Show FPS', undefined, () => settings.fps, (v) => { settings.fps = v; });
        // full screen: on a phone the first tap goes full screen by itself; this is the switch (and works on a computer too)
        label(L, IN_Y + 302, 'Full screen', deviceText('Phones go full screen, sideways, on the first tap.', 'Goes full screen, sideways, on the first tap.'));
        const fs = pane.button(L + colW - 44, IN_Y + 312, 88, ROW_H, s.scale.isFullscreen ? 'On' : 'Off', () => {
            setFullscreenSetting(s.game, !s.scale.isFullscreen);
            s.time.delayedCall(250, () => { if (!fs.root.scene) return; fs.setLabel(s.scale.isFullscreen ? 'On' : 'Off'); fs.setStyle(s.scale.isFullscreen ? STYLES.lime : STYLES.dark); });
        }, { style: s.scale.isFullscreen ? STYLES.lime : STYLES.dark, size: 14, ink: s.scale.isFullscreen });
        // right: hints and the keyboard
        this.heading(Rx, IN_Y, colW, 'Help');
        toggle(Rx, IN_Y + 38, 'Tips', deviceText('Short hints now and then. The guide (H) keeps them.', 'Short hints now and then. How to play keeps them.'), () => tutorialApi.tipsOn(), (v) => { tutorialApi.setTips(v); });
        label(Rx, IN_Y + 98, 'Tutorial', 'Walk through the starting steps again.');
        pane.button(Rx + colW - 70, IN_Y + 108, 140, ROW_H, 'Replay tutorial', () => { tutorialApi.replay(); this.ctx.close(); }, { style: STYLES.lime, size: 14 });
        this.heading(Rx, IN_Y + 176, colW, 'Keyboard');
        const kbNote = pane.text('', Rx, IN_Y + 235, fit(11), PAL.pebble, { bold: false, wrap: colW - 160 });
        const kbLabel = () => settings.keyboard === 'auto' ? 'Auto' : settings.keyboard.toUpperCase();
        const showKb = () => kbNote.setText(`${settings.keyboard === 'auto' ? `Detected ${detectedName()}` : 'Set by you'}  ·  move with ${moveKeys(' ')}`);
        pane.text('Key hints', Rx, IN_Y + 214, 14, PAL.cream);
        showKb();
        const kb = pane.button(Rx + colW - 70, IN_Y + 224, 140, ROW_H, kbLabel(), () => {
            settings.keyboard = KEYBOARD_CHOICES[(KEYBOARD_CHOICES.indexOf(settings.keyboard) + 1) % KEYBOARD_CHOICES.length];
            kb.setLabel(kbLabel()); kb.setStyle(settings.keyboard === 'auto' ? STYLES.dark : STYLES.lime);
            showKb(); saveSettings();
        }, { style: settings.keyboard === 'auto' ? STYLES.dark : STYLES.lime, size: 14, ink: settings.keyboard !== 'auto' });
        pane.text('Movement follows the key positions, so any layout plays the same. This only changes the hints.', Rx, IN_Y + 266, fit(11), PAL.pebble, { bold: false, wrap: colW });
        // where things are kept
        pane.rule(Rx, IN_Y + 316, colW);
        pane.text(`Your name and game data are saved in this browser.\nServer: ${this.ctx.farm.conn.mode === 'solo' ? 'solo (this browser)' : this.ctx.farm.conn.label}`, Rx, IN_Y + 326, fit(11), PAL.pebble, { bold: false, wrap: colW });
    }

    // ── help ────────────────────────────────────────────────────────────────
    /**
     * Two columns, each a group of key + words. A row is as tall as its words (they wrap inside their column), and the text size
     * comes down a notch at a time until both columns fit the page.
     */
    private buildHelp () {
        const w = this.win, pane = this.pane, g = pane.g;
        const groups: Group[] = isTouchUi() ? TOUCH_CONTROLS : keyControls(moveKeys(' '), keyLabel('KeyQ'));
        const KEY_W = 128, COL_W = 426, COL_GAP = 16, GAP = 3, TOP = IN_Y + 32, ROOM = PAGE.y + PAGE.h - 36 - TOP;
        const top = fit(11), sizes = [top, 12, 11, 10].filter((z, i, all) => z <= top && all.indexOf(z) === i);
        groups.forEach((grp, ci) => this.heading(IN_X + ci * (COL_W + COL_GAP), IN_Y, COL_W, grp.title));
        for (const size of sizes) {
            const made: { key: Phaser.GameObjects.Text; desc: Phaser.GameObjects.Text; h: number; col: number }[] = [];
            groups.forEach((grp, col) => {
                for (const [k, d] of grp.rows) {
                    const key = w.text(k, 0, 0, size, PAL.gold, { origin: [0.5, 0.5], align: 'center', wrap: KEY_W - 12 });
                    const desc = w.text(d, 0, 0, size, PAL.cream, { bold: false, wrap: COL_W - KEY_W - 14 });
                    made.push({ key, desc, h: Math.max(24, Math.ceil(Math.max(desc.height, key.height)) + 8), col });
                }
            });
            const used = [0, 0];
            for (const r of made) used[r.col] += r.h + GAP;
            if (Math.max(...used) > ROOM && size > sizes[sizes.length - 1]) { for (const r of made) { r.key.destroy(); r.desc.destroy(); } continue; }
            const y = [TOP, TOP];
            for (const r of made) {
                const x = IN_X + r.col * (COL_W + COL_GAP), yy = y[r.col];
                panel(g, x, yy, KEY_W, r.h, { ...STYLES.dark, r: 2 });
                w.at(r.key, x + KEY_W / 2, yy + r.h / 2);
                w.at(r.desc, x + KEY_W + 12, yy + Math.max(4, (r.h - r.desc.height) / 2));
                this.add(r.key); this.add(r.desc);
                y[r.col] += r.h + GAP;
            }
            break;
        }
        pane.text(deviceText('Tip: a friend who goes down can be revived by standing next to them and holding E.', 'Tip: a friend who goes down can be revived by standing next to them and holding USE.'), IN_X, PAGE.y + PAGE.h - 28, fit(12), PAL.pebble, { bold: false });
    }

    update (dt: number) {
        this.t += dt;
        const f = this.ctx.farm;
        if (this.tab === 'map' && this.mapG && this.mapLabels) {
            // redraw a few times a second (players move)
            if (Math.floor(this.t * 6) !== Math.floor((this.t - dt) * 6)) {
                this.mapLabels.removeAll(true);
                this.ctx.drawMap(this.mapG, this.mapX, this.mapY, this.mapCell, this.mapLabels);
            }
        } else if (this.tab === 'farmers') {
            const k = JSON.stringify([this.fOffset, Object.values(f.players).map((p) => [p.id, p.online, p.level, Math.round(p.hearts * 2), p.downed > 0, p.equip])]);
            if (k !== this.farmersKey) { this.farmersKey = k; this.buildFarmers(); }
        }
    }

    /** The wheel (or a finger dragging) scrolls the Farmers list when it is longer than the page. */
    wheel (dy: number) {
        if (this.tab !== 'farmers') return;
        this.fOffset += dy > 0 ? 1 : -1;
        this.farmersKey = '';
    }

    onKey (k: string) {
        if (k === 'm' || k === 'M') { this.ctx.close(); return true; }
        return false;
    }

    destroy () { this.win.destroy(); }
}
