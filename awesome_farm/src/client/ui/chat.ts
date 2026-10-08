// Talking to your friends: a chat log and input (Enter), speech bubbles over heads, an
// emote bar (G, then 1-8), and map pings (middle-click or Alt+click) that show on screen
// edges as arrows so nobody gets lost in a big world.

import * as Phaser from 'phaser';
import { PAL } from '../../shared/palette';
import { PLAYER_COLORS } from '../../shared/sim/stats';
import type { SimEvent } from '../../shared/sim/types';
import type { GameScene } from '../scenes/Game';
import { playSfx } from '../juice/sfx';
import { isTouchUi, keyOf } from '../input/layout';
import { icon, label, W } from './kit';
import { hex, inset, panel, rect, STYLES } from './px';
import { CHAT_LINE, edgeMarker, hotbarLayout, PLAY, slots, type BottomStack } from './slots';
import { PAPER, WOOD } from './theme';

const EMOTES: { icon: string; text: string }[] = [
    { icon: 'k_hand', text: 'Hello!' }, { icon: 'k_heart', text: 'Thanks!' }, { icon: 'k_burst', text: 'Hooray!' }, { icon: 'k_skull', text: 'Danger!' },
    { icon: 'k_flag', text: 'Follow me' }, { icon: 'k_target', text: 'Help here' }, { icon: 'k_coin', text: "Let's trade" }, { icon: 'k_moon', text: 'Good night' },
];

interface Line { name: string; text: string; color: number; age: number }
interface Bubble { id: string; root: Phaser.GameObjects.Container; age: number; life: number; pop: number }
interface PingM { x: number; y: number; name: string; color: number; age: number; icon: Phaser.GameObjects.Image; label: Phaser.GameObjects.Text; ring: Phaser.GameObjects.Graphics }

export class ChatUI {
    private lines: Line[] = [];
    private lineT: Phaser.GameObjects.Text[] = [];
    private dom: Phaser.GameObjects.DOMElement | null = null;
    private bubbles: Bubble[] = [];
    private pings: PingM[] = [];
    private barG: Phaser.GameObjects.Graphics;
    private barIcons: Phaser.GameObjects.Image[] = [];
    private barZones: Phaser.GameObjects.Zone[] = [];
    private barKeys: Phaser.GameObjects.Text[] = [];
    private barOpen = false;
    private bg: Phaser.GameObjects.Graphics;
    isOpen = false;
    /** Where the things above the hotbar are (the HUD scene hands it over every frame). */
    private stack: BottomStack | null = null;

    constructor (private scene: Phaser.Scene, private farm: GameScene) {
        this.bg = scene.add.graphics().setDepth(6);
        for (let i = 0; i < 9; i++) this.lineT.push(label(scene, 0, 0, '', 13, PAL.cream, { stroke: 3, bold: false }).setDepth(7).setOrigin(0, 1));
        // emote bar
        this.barG = scene.add.graphics().setDepth(12).setVisible(false);
        EMOTES.forEach((e, i) => {
            this.barIcons.push(icon(scene, e.icon, 0, 0, 2).setDepth(13).setVisible(false));
            this.barKeys.push(label(scene, 0, 0, `${i + 1}`, 11, PAL.pebble, { stroke: 2 }).setDepth(14).setVisible(false));
            const z = scene.add.zone(0, 0, 42, 42).setOrigin(0).setInteractive({ useHandCursor: true }).setDepth(15);
            z.input!.enabled = false;
            z.on('pointerup', () => this.emote(i));
            this.barZones.push(z);
        });
    }

    /** The lines of chat on screen right now (they fade after a while; all of them show while you type). */
    get visibleLines (): number {
        return this.lines.filter((l) => this.isOpen || l.age < 9).slice(-(this.isOpen ? 9 : 6)).length;
    }

    /** The left edge of the chat: the hotbar's. */
    private get left () { return hotbarLayout(isTouchUi()).x; }

    private online () { return this.farm.conn.mode !== 'solo'; }

    // ── events from the game ────────────────────────────────────────────────
    onEvent (e: SimEvent) {
        if (e.e === 'chat') {
            this.lines.push({ name: e.name, text: e.text, color: PLAYER_COLORS[e.color], age: 0 });
            if (this.lines.length > 30) this.lines.shift();
            this.say(e.by, e.text);
            if (e.by !== this.farm.me) playSfx('pop', 1.4);
        } else if (e.e === 'emote') {
            this.emoteBubble(e.by, e.id);
        } else if (e.e === 'ping') {
            this.addPing(e.x, e.y, e.name, PLAYER_COLORS[e.color]);
        }
    }

    // ── input ───────────────────────────────────────────────────────────────
    /** Returns true when the key was consumed. */
    handleKey (ev: KeyboardEvent): boolean {
        if (this.isOpen) return true;                                   // typing: the DOM input has the keys
        if (this.farm.menuOpen && !this.barOpen) return false;
        const k = keyOf(ev);
        if (this.barOpen) {
            if (k >= '1' && k <= '8') { this.emote(Number(k) - 1); ev.preventDefault(); return true; }
            if (k === 'g' || k === 'G' || k === 'Escape') { this.toggleBar(false); ev.preventDefault(); return true; }
            return false;
        }
        if (k === 'Enter' && this.online()) { this.open(); ev.preventDefault(); return true; }
        if (k === 'g' || k === 'G') { this.toggleBar(true); ev.preventDefault(); return true; }
        return false;
    }

    private open () {
        if (this.isOpen || !this.farm.ready) return;
        this.isOpen = true;
        this.farm.menuOpen = true;
        const el = document.createElement('input');
        el.type = 'text'; el.maxLength = 100; el.spellcheck = false; el.autocomplete = 'off'; el.placeholder = 'Say something… (Enter to send, Esc to cancel)';
        Object.assign(el.style, {
            width: '472px', height: '30px', boxSizing: 'border-box', padding: '0 10px', font: "17px 'Jersey 15', 'Pixelify Sans', monospace",
            color: hex(PAL.ink), background: hex(PAL.cream), border: `3px solid ${hex(PAL.ink)}`, borderRadius: '2px', outline: 'none',
        });
        el.addEventListener('keydown', (ev) => {
            ev.stopPropagation();
            if (ev.key === 'Enter') { const t = el.value.trim(); if (t) this.farm.send({ t: 'chat', text: t }); this.close(); }
            else if (ev.key === 'Escape') this.close();
        });
        this.dom = this.scene.add.dom(this.left, this.stack?.input || 440, el).setOrigin(0, 0.5).setDepth(20);
        setTimeout(() => el.focus(), 0);
    }

    private close () {
        this.dom?.destroy();
        this.dom = null;
        this.isOpen = false;
        this.farm.menuOpen = false;
        this.farm.releaseInput();
    }

    private toggleBar (on: boolean) {
        this.barOpen = on;
        this.barG.setVisible(on);
        this.barIcons.forEach((i) => i.setVisible(on));
        this.barKeys.forEach((i) => i.setVisible(on));
        this.barZones.forEach((z) => { z.input!.enabled = on; });
        if (on) this.layoutBar();
    }

    /** The emote bar sits above the status row, clear of the chat, wherever the stack puts it. */
    private layoutBar () {
        const top = Math.round(this.stack?.emote ?? 380), g = this.barG;
        g.clear();
        panel(g, W / 2 - 4 * 46 - 4, top, 8 * 46 + 8, 56, { ...STYLES.dark, shadow: true });
        EMOTES.forEach((_, i) => {
            const x = W / 2 - 4 * 46 + 23 + i * 46, y = top + 28;
            inset(g, x - 21, top + 6, 42, 42, PAL.night, PAL.slate);
            this.barIcons[i].setPosition(x, y);
            this.barKeys[i].setPosition(x + 14, y + 10);
            this.barZones[i].setPosition(x - 21, top + 6);
        });
    }

    private emote (i: number) {
        this.farm.send({ t: 'emote', id: i });
        this.toggleBar(false);
    }

    // ── bubbles ─────────────────────────────────────────────────────────────
    private spot (id: string) {
        if (id === this.farm.me) return { x: this.farm.playerPos.x, y: this.farm.playerPos.y };
        const p = this.farm.playerScreenPos(id);
        return p;
    }

    private bubble (id: string, build: (root: Phaser.GameObjects.Container, g: Phaser.GameObjects.Graphics) => { w: number; h: number }, life: number) {
        this.bubbles = this.bubbles.filter((b) => { if (b.id === id) { b.root.destroy(); return false; } return true; });
        const g = this.scene.add.graphics();
        const root = this.scene.add.container(0, 0, [g]).setDepth(8);
        const { w, h } = build(root, g);
        // draw the bubble behind the content, centred on x with a little tail
        g.clear();
        panel(g, -w / 2, -h - 6, w, h, { ...STYLES.cream, shadow: true, r: 2 });
        g.fillStyle(WOOD[0], 1).fillTriangle(-4.5, -7, 4.5, -7, 0, 0);
        g.fillStyle(PAPER.base, 1).fillTriangle(-3, -8, 3, -8, 0, -2.5);
        root.sendToBack(g);
        this.bubbles.push({ id, root, age: 0, life, pop: 0 });
    }

    private say (id: string, text: string) {
        this.bubble(id, (root) => {
            const t = label(this.scene, 0, 0, text, 12, PAL.ink, { origin: [0.5, 0.5], shadow: false, wrap: 170, align: 'center' });
            root.add(t);
            const w = Math.max(40, Math.ceil(t.width) + 18), h = Math.ceil(t.height) + 12;
            t.setPosition(0, -6 - h / 2);
            return { w, h };
        }, 2.5 + Math.min(4, text.length / 18));
    }

    private emoteBubble (id: string, n: number) {
        const e = EMOTES[n];
        if (!e) return;
        this.bubble(id, (root) => {
            const im = icon(this.scene, e.icon, 0, -6 - 16, 3);
            root.add(im);
            return { w: 38, h: 38 };
        }, 2.4);
        if (id !== this.farm.me) playSfx('pop', 1.2 + n * 0.05);
        else playSfx('ui', 1.4);
    }

    // ── pings ───────────────────────────────────────────────────────────────
    private addPing (x: number, y: number, name: string, color: number) {
        const ic = icon(this.scene, 'k_target', 0, 0, 2).setDepth(9).setTint(color);
        const lb = label(this.scene, 0, 0, name, 11, color, { origin: [0.5, 1], stroke: 3 }).setDepth(9);
        const ring = this.scene.add.graphics().setDepth(8);
        this.pings.push({ x, y, name, color, age: 0, icon: ic, label: lb, ring });
        if (this.pings.length > 6) { const o = this.pings.shift()!; o.icon.destroy(); o.label.destroy(); o.ring.destroy(); }
        playSfx('perk', 1.3);
    }

    /** World-space pings, for the minimap. */
    get activePings () { return this.pings.map((p) => ({ x: p.x, y: p.y, color: p.color, age: p.age })); }

    // ── per frame ───────────────────────────────────────────────────────────
    update (dt: number, stack: BottomStack) {
        this.stack = stack;
        if (this.barOpen) this.layoutBar();
        if (this.dom) this.dom.setPosition(this.left, Math.round(stack.input));
        // chat log, from the bottom of its place in the stack upward
        const g = this.bg;
        g.clear();
        const shown = this.lines.filter((l) => this.isOpen || l.age < 9).slice(-(this.isOpen ? 9 : 6));
        for (const l of this.lines) l.age += dt;
        const x = this.left, bottom = Math.round(stack.chatBottom);
        this.lineT.forEach((t, i) => {
            const l = shown[shown.length - 1 - i];
            if (!l) { t.setVisible(false); return; }
            const a = this.isOpen ? 1 : Math.max(0, Math.min(1, (9 - l.age) / 1.5));
            t.setVisible(true).setText(`${l.name}: ${l.text}`).setColor(hex(l.color)).setAlpha(a).setPosition(x, bottom - i * CHAT_LINE);
        });
        if (this.isOpen) { const n = shown.length; if (n) rect(g, x - 6, bottom - n * CHAT_LINE - 4, 484, n * CHAT_LINE + 6, PAL.ink, 0.45); }
        // bubbles follow their owners
        for (let i = this.bubbles.length - 1; i >= 0; i--) {
            const b = this.bubbles[i];
            b.age += dt; b.pop = Math.min(1, b.pop + dt * 8);
            const p = this.spot(b.id);
            if (!p || b.age > b.life) { b.root.destroy(); this.bubbles.splice(i, 1); continue; }
            const s = this.farm.worldToScreen(p.x, p.y - 26);
            const k = b.pop < 1 ? 0.6 + 0.4 * Math.sin(b.pop * Math.PI / 2) : 1;
            b.root.setPosition(Math.round(s.x), Math.round(s.y)).setScale(k).setAlpha(b.age > b.life - 0.4 ? Math.max(0, (b.life - b.age) / 0.4) : 1);
        }
        // pings
        for (let i = this.pings.length - 1; i >= 0; i--) {
            const p = this.pings[i];
            p.age += dt;
            if (p.age > 6) { p.icon.destroy(); p.label.destroy(); p.ring.destroy(); this.pings.splice(i, 1); continue; }
            const s = this.farm.worldToScreen(p.x, p.y);
            // on the spot when it is in view and clear of the HUD; otherwise an arrow at the edge of the play area, never under a card
            const mk = edgeMarker(s, slots.obstacles(), PLAY, 22), inside = mk.inside, cx = mk.x, cy = mk.y;
            const bounce = Math.abs(Math.sin(p.age * 6)) * 6;
            p.icon.setPosition(Math.round(cx), Math.round(cy - 14 - (inside ? bounce : 0))).setAlpha(p.age > 5 ? 6 - p.age : 1);
            p.label.setPosition(Math.round(cx), Math.round(cy - 26 - (inside ? bounce : 0))).setAlpha(p.age > 5 ? 6 - p.age : 1);
            p.ring.clear();
            if (inside) {
                const r = (p.age * 40) % 30;
                p.ring.lineStyle(2, p.color, 1 - r / 30).strokeCircle(s.x, s.y, 6 + r);
            } else {
                // an arrow pointing the way
                const a = Math.atan2(s.y - cy, s.x - cx);
                p.ring.fillStyle(p.color, 0.9).fillTriangle(cx + Math.cos(a) * 16, cy + Math.sin(a) * 16, cx + Math.cos(a + 2.5) * 9, cy + Math.sin(a + 2.5) * 9, cx + Math.cos(a - 2.5) * 9, cy + Math.sin(a - 2.5) * 9);
            }
        }
    }
}
