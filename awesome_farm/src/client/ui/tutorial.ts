// The starting tutorial on screen: a coach card at the top (icon, title, a line or two, "3/16", Skip), a pointer that
// bobs over the tree / boulder / bed the step wants, and a ring that pulses round the HUD button it is about.
// What the steps ARE (and when they are done) is pure data in shared/data/tutorial.ts; this file only shows it,
// remembers how far you got (awesome_farm_tutorial_v1) and plays the little chime when a step is done.

import * as Phaser from 'phaser';
import { TILE } from '../../shared/config';
import { BUILDINGS } from '../../shared/data/buildings';
import { MOBS } from '../../shared/data/mobs';
import { NODES } from '../../shared/data/nodes';
import { advance, nearFacts, say, shown, STEPS, TOTAL, veteran, WORDS, type HudSpot, type NearFacts, type Spot, type TutorialView, type Words } from '../../shared/data/tutorial';
import { PAL } from '../../shared/palette';
import { TIP_BY_ID, TIP_PREFIX, TipRunner, tipFacts, type Tip, type TipView } from '../../shared/data/tips';
import { weatherAt } from '../../shared/weather';
import { isTouchUi, moveKeys } from '../input/layout';
import { Fx } from '../juice/fx';
import { hintStore } from './hints';
import { playSfx } from '../juice/sfx';
import { LAB } from '../lab';
import { TUTORIAL_KEY } from '../profile';
import type { GameScene } from '../scenes/Game';
import { MENU_BUTTONS, menuCell } from './hudlayer';
import { button, H, icon, label, onTap, TEXT_SCALE, W } from './kit';
import { hex, inset, panel, rect, STYLES } from './px';
import { edgeMarker, hotbarLayout, PLAY, slots, THUMB, TOP_SLOT, TOP_SLOT_MAX_H, TOUCH_BAR } from './slots';
import { BRASS, TEXT, WOOD } from './theme';

// ── what is remembered ──────────────────────────────────────────────────────
interface TutState {
    v: 1;
    /** The step you are on (TOTAL when finished). */
    i: number;
    /** Finished, skipped or switched off: the card stays away. */
    done: boolean;
    /** Counters when this run began ({} the first time, so work done before the tutorial counts). */
    base: Record<string, number>;
    /** Steps skipped with the Skip button. */
    skip: number[];
    /** "No more tips" switches this to false. */
    tips: boolean;
}

const fresh = (): TutState => ({ v: 1, i: 0, done: false, base: {}, skip: [], tips: true });

function loadTutorial (): TutState | null {
    if (LAB) return { ...fresh(), i: TOTAL, done: true, tips: false };       // (the Defense Lab: no tutorial, no tips)
    try {
        const s = JSON.parse(localStorage.getItem(TUTORIAL_KEY) ?? 'null') as Partial<TutState> | null;
        if (!s || typeof s.i !== 'number') return null;
        return { ...fresh(), ...s, v: 1, base: s.base ?? {}, skip: Array.isArray(s.skip) ? s.skip : [] };
    } catch { return null; }
}
function saveTutorial (s: TutState) {
    if (LAB) return;
    try { localStorage.setItem(TUTORIAL_KEY, JSON.stringify(s)); } catch { /* private mode: it comes back next visit */ }
}

/** Are tips switched on? (Read by the tip runner and the settings page.) */
const tipsEnabled = () => (loadTutorial() ?? fresh()).tips;

// ── where things are on screen ──────────────────────────────────────────────
const CARD_X = TOP_SLOT.x, CARD_Y = TOP_SLOT.y, CARD_W = TOP_SLOT.w;

interface Box { x: number; y: number; w: number; h: number; round?: boolean }
const ring = (cx: number, cy: number, r: number): Box => ({ x: cx - r, y: cy - r, w: 2 * r, h: 2 * r, round: true });

/** The rectangle of a HUD button (the places are in ui/slots.ts, so this follows them). */
function hudBox (spot: HudSpot, touch: boolean): Box | null {
    if (spot === 'hotbar') { const hb = hotbarLayout(touch); return { x: hb.x, y: hb.y, w: hb.w, h: hb.h }; }
    if (touch) {
        const bar = spot === 'bag' ? 0 : spot === 'build' ? 1 : spot === 'craft' || spot === 'skills' ? 2 : -1;
        if (bar >= 0) return { x: TOUCH_BAR.xs[bar] - TOUCH_BAR.w / 2, y: TOUCH_BAR.y - TOUCH_BAR.h / 2, w: TOUCH_BAR.w, h: TOUCH_BAR.h };
        if (spot === 'act') return ring(THUMB.act.x, THUMB.act.y, THUMB.act.r);
        if (spot === 'use') return ring(THUMB.use.x, THUMB.use.y, THUMB.use.r);
        if (spot === 'eat') return ring(THUMB.eat.x, THUMB.eat.y, THUMB.eat.r);
        return null;
    }
    const id = spot === 'bag' ? 'inventory' : spot === 'build' ? 'build' : spot === 'craft' ? 'craft' : spot === 'skills' ? 'skills' : '';
    const i = MENU_BUTTONS.findIndex((b) => b.id === id);
    return i < 0 ? null : menuCell(i);
}

const PRAISE = ['Nice!', 'Well done!', 'Lovely!', 'You are getting the hang of it!', 'Just like that!', 'Great job!'];

/** A target in the world: where its foot is, how big a ring to draw (in tiles) and how tall it stands (px), so the arrow clears its top. */
type Resolved = { world: { x: number; y: number; r: number; h: number } | null; boxes: Box[] };

export class Tutorial {
    private st: TutState = fresh();
    private ready = false;
    private skip = new Set<number>();
    private touch = false;
    private fx: Fx;
    // card
    private root: Phaser.GameObjects.Container;
    private frame: Phaser.GameObjects.Graphics;
    private ico: Phaser.GameObjects.Image;
    private titleT: Phaser.GameObjects.Text;
    private countT: Phaser.GameObjects.Text;
    private bodyT: Phaser.GameObjects.Text;
    private barG: Phaser.GameObjects.Graphics;
    private barT: Phaser.GameObjects.Text;
    private skipBtn: ReturnType<typeof button>;
    private tipsG: Phaser.GameObjects.Graphics;
    private tipsT: Phaser.GameObjects.Text;
    private tipsZone: Phaser.GameObjects.Zone;
    private pg: Phaser.GameObjects.Graphics;
    private cardKey = '';
    private shownIdx = -1;
    private flash: { idx: number; t: number; praise: string } | null = null;
    private pending: number[] = [];       // steps finished while a window was open: cheered when it closes
    private finale = 0;
    // facts about the world, refreshed a few times a second
    private tick = 0;
    private timer = 0;
    private bossNear = false;
    private mobNear = false;
    private tipT = 0;
    private near: NearFacts = { bld: {}, beds: { empty: 0, growing: 0, ripe: 0 } };
    private price: number | null = null;
    private resolved: Resolved = { world: null, boxes: [] };
    private ui = { walked: 0, opened: [] as string[], placing: null as TutorialView['ui']['placing'] };
    private last = { x: 0, y: 0, ok: false };
    private alpha = 0;
    private coachH = 90;
    // progression tips
    private tips = new TipRunner(hintStore);
    private tipFacts: Pick<TipView, 'bld' | 'chestFill' | 'chests'> = { bld: {}, chestFill: 0, chests: 0 };
    private tipCard: { root: Phaser.GameObjects.Container; t: number; dur: number; held: number; h: number } | null = null;
    private fell = false;
    private zoomed = false;
    private zoomSeen = 1;

    constructor (private scene: Phaser.Scene, private farm: GameScene, private screenName: () => string, private cheer: (text: string, icon?: string, color?: number) => void, private hintsCooling: () => boolean = () => false) {
        const s = scene;
        this.touch = isTouchUi();
        this.fx = new Fx(s, 3);
        const t = this.touch;
        this.root = s.add.container(CARD_X, CARD_Y).setDepth(7).setVisible(false);
        this.frame = s.add.graphics();
        this.ico = icon(s, 'k_sprout', 0, 0, 2);
        this.titleT = label(s, 0, 0, '', t ? 19 : 16, TEXT.ink, { font: 'head' });
        this.countT = label(s, 0, 0, '', t ? 15 : 13, TEXT.dim, { font: 'head', origin: [1, 0.5] });
        this.bodyT = label(s, 0, 0, '', t ? 16 : 14, TEXT.ink, { wrap: CARD_W - (t ? 12 + 52 + 10 + 14 : 9 + 44 + 10 + 12), bold: false });
        this.barG = s.add.graphics();
        this.barT = label(s, 0, 0, '', t ? 14 : 12, TEXT.dim, { font: 'head', origin: [0, 0.5] });
        this.skipBtn = button(s, 0, 0, t ? 100 : 70, t ? 34 : 22, 'Skip step', () => this.skipStep(), { style: STYLES.dark, size: t ? 14 : 11, ink: false });
        this.tipsG = s.add.graphics();
        this.tipsT = label(s, 0, 0, 'No more tips', t ? 14 : 12, TEXT.dim, { origin: [0, 0.5], bold: false });
        this.tipsZone = s.add.zone(0, 0, 10, 10).setOrigin(0).setInteractive({ useHandCursor: true });
        onTap(this.tipsZone, () => this.noMoreTips());
        this.root.add([this.frame, this.ico, this.titleT, this.countT, this.bodyT, this.barG, this.barT, this.skipBtn.root, this.tipsG, this.tipsT, this.tipsZone]);
        this.pg = s.add.graphics().setDepth(6);
        s.events.once('shutdown', () => this.destroy());
        const onBanner = (d: { text: string; sub?: string } | undefined) => { if (d?.text === 'You woke up at home' && d.sub !== 'Nothing was lost') this.fell = true; };
        farm.events.on('hud:banner', onBanner);
        s.events.once('shutdown', () => farm.events.off('hud:banner', onBanner));
        this.zoomSeen = farm.zoomLevel;
        this.zoomed = farm.zoomLevel !== 1;
        current = this;
    }

    private destroy () {
        if (current === this) current = null;
        this.fx.destroy();
    }

    // ── state ───────────────────────────────────────────────────────────────
    private words (): Words { return { ...WORDS[this.touch ? 'touch' : 'desktop'], ...(this.touch ? {} : { move: moveKeys() }) }; }

    private view (): TutorialView {
        const f = this.farm;
        return {
            me: f.meS!, base: this.st.base, clock: { clock: f.clock.clock, night: f.clock.night },
            ui: { walked: this.ui.walked, opened: this.ui.opened, placing: f.placing?.kind ?? this.ui.placing }, near: this.near, price: this.price,
        };
    }

    private save () { saveTutorial(this.st); }

    /** The first time in this browser: a farmer who has long since learnt the ropes is not bothered. */
    private begin () {
        const me = this.farm.meS!;
        const saved = loadTutorial();
        if (saved) this.st = saved;
        else { this.st = fresh(); if (veteran(me)) this.st.done = true; this.save(); }
        this.skip = new Set(this.st.skip);
        this.ready = true;
        this.refresh();
        // start from the first thing not done yet (silently: nobody gets a chime for old work)
        if (!this.st.done) { this.st.i = advance(this.st.i, this.view(), this.skip).index; this.save(); }
    }

    /** Start again from the first step, counting from now. */
    replay () {
        const me = this.farm.meS;
        if (!me) return;
        this.st = { ...fresh(), tips: this.st.tips, base: { ...(me.cnt ?? {}) } };
        this.skip.clear();
        this.ui = { walked: 0, opened: [], placing: null };
        this.flash = null; this.pending = []; this.finale = 0; this.shownIdx = -1; this.cardKey = '';
        this.save();
        this.cheer('Tutorial restarted. Follow the card at the top.', 'k_sprout', PAL.lime);
    }

    get active () { return this.ready && !this.st.done; }
    get tipsOn () { return this.st.tips; }
    setTips (on: boolean) { this.st.tips = on; this.save(); }

    private skipStep () {
        if (!this.active) return;
        playSfx('ui');
        const idx = shown(this.st.i, this.view(), this.skip);
        this.skip.add(idx);
        this.st.skip = [...this.skip];
        this.afterChange(false);
    }

    private noMoreTips () {
        playSfx('ui');
        this.st.tips = false;
        this.st.done = true;
        this.save();
        this.cheer('No more tips. You can bring them back in Menu > Settings.', 'k_book', PAL.pebble);
    }

    /** Move on past whatever is done now; `cheerful` plays the chime for the steps passed. */
    private afterChange (cheerful: boolean) {
        const r = advance(this.st.i, this.view(), this.skip);
        if (r.index === this.st.i) return;
        const last = r.passed[r.passed.length - 1];
        this.st.i = r.index;
        this.save();
        if (cheerful) this.pending.push(last);
        if (r.index >= TOTAL) { this.st.done = true; this.save(); }
    }

    // ── facts (a few times a second) ────────────────────────────────────────
    private refresh () {
        const f = this.farm, me = f.meS!;
        const ents = Object.values(f.ents), pos = f.playerPos;
        this.near = nearFacts(ents, pos);
        this.tipFacts = tipFacts(ents);
        this.bossNear = ents.some((e) => e.k === 'mob' && MOBS[e.kind].boss && Math.hypot(e.x - pos.x, e.y - pos.y) < 420);
        this.mobNear = ents.some((e) => e.k === 'mob' && Math.hypot(e.x - pos.x, e.y - pos.y) < 190);
        if (this.tick++ % 4 === 0) {
            const prices = f.world.purchasable().map((pl) => Math.max(1, Math.round(f.world.price(pl, me.plotsBought) * f.derivedMe().landMul)));
            this.price = prices.length ? Math.min(...prices) : null;
        }
    }

    private resolve (spots: Spot[]): Resolved {
        const f = this.farm, p = f.playerPos;
        const out: Resolved = { world: null, boxes: [] };
        let best = Infinity;
        const offer = (x: number, y: number, r: number, h: number) => { const d = Math.hypot(x - p.x, y - p.y); if (d < best) { best = d; out.world = { x, y, r, h }; } };
        for (const sp of spots) {
            if ('hud' in sp) { const b = hudBox(sp.hud, this.touch); if (b) out.boxes.push(b); continue; }
            if ('plot' in sp) {
                for (const pl of f.world.purchasable()) { const a = f.world.tagAnchor(pl, p); offer(a.x, a.y, 1.6, 16); }
                continue;
            }
            for (const e of Object.values(f.ents)) {
                if ('node' in sp && e.k === 'node' && e.kind === sp.node) offer((e.tx + 0.5) * TILE, (e.ty + 1) * TILE - (NODES[e.kind].tall ? 3 : 6), 0.6, NODES[e.kind].tall ? 30 : 12);
                else if ('bld' in sp && e.k === 'bld' && e.kind === sp.bld && (!sp.ripe || e.crop === 2)) {
                    const [w, h] = BUILDINGS[e.kind].size;
                    offer((e.tx + w / 2) * TILE, (e.ty + h) * TILE - 4, Math.max(0.7, w / 2), h * TILE);
                }
            }
            // a bed that is not ripe yet still counts when nothing is ripe
            if ('bld' in sp && sp.ripe && !out.world) for (const e of Object.values(f.ents)) if (e.k === 'bld' && e.kind === sp.bld) { const [w, h] = BUILDINGS[e.kind].size; offer((e.tx + w / 2) * TILE, (e.ty + h) * TILE - 4, 0.7, h * TILE); }
        }
        return out;
    }

    // ── per frame ───────────────────────────────────────────────────────────
    /** `quiet`: a window is open, you are down or the HUD is hidden. `bannerUp`: a big centre banner is showing or queued (the cards step aside for it). */
    update (dt: number, quiet: boolean, bannerUp = false, bossUp = false) {
        const f = this.farm;
        if (!f.ready || !f.meS) return;
        if (!this.ready) this.begin();
        // what the client alone can see
        const pos = f.playerPos;
        if (this.last.ok) { const d = Math.hypot(pos.x - this.last.x, pos.y - this.last.y); if (d < 24) this.ui.walked += d; }
        this.last = { x: pos.x, y: pos.y, ok: true };
        const scr = this.screenName();
        if (scr && !this.ui.opened.includes(scr)) this.ui.opened.push(scr);
        this.timer -= dt;
        if (this.timer <= 0) { this.timer = 0.25; this.refresh(); if (this.active) this.afterChange(true); }
        const me = f.meS;
        const hide = quiet || !!me.rift || this.bossNear || bossUp || f.menuOpen || bannerUp;
        this.coach(dt, hide);
        this.tipsUpdate(dt, quiet, hide);
        // what holds the top slot right now, for the things that must keep clear of it (toasts, land plates)
        const h = this.alpha > 0.05 ? this.coachH : this.tipShown ? this.tipCard!.h : 0;
        slots.set('card', h ? { x: CARD_X, y: CARD_Y, w: CARD_W, h } : null);
    }

    /** A tip card is on screen (not waiting). */
    private get tipShown () { return !!this.tipCard && this.tipCard.root.visible; }

    /** Nothing holds the top slot: the coach card has faded out and no tip is showing (a banner may take it). */
    get slotClear () { return this.alpha <= 0.02 && !this.tipShown; }

    private coach (dt: number, hide: boolean) {
        // cheer for steps finished a moment ago, once the card is back
        if (!hide && this.pending.length) {
            const idx = this.pending[this.pending.length - 1];
            this.pending = [];
            this.flash = { idx, t: 0.9, praise: PRAISE[Math.floor(Math.random() * PRAISE.length)] };
            this.fx.play('tutorial', CARD_X + 34, CARD_Y + 34);
            if (this.st.done) { this.finale = 5; this.fx.play('unlock', CARD_X + CARD_W / 2, CARD_Y + 30); this.cheer('Tutorial complete! Tips will keep coming. Replay it any time in Menu > Settings.', 'k_crown', PAL.gold); }
        }
        if (this.flash) { this.flash.t -= dt; if (this.flash.t <= 0) this.flash = null; }
        if (this.finale > 0) this.finale -= dt;
        const showing = !hide && (!this.st.done || this.finale > 0);
        this.show(showing, dt);
        if (!showing) { this.pg.clear(); return; }
        const v = this.view();
        const idx = this.st.done ? TOTAL - 1 : shown(this.st.i, v, this.skip);
        this.card(idx, v);
        this.point(idx, v);
    }

    private show (on: boolean, dt: number) {
        this.alpha = Phaser.Math.Clamp(this.alpha + (on ? 1 : -1) * dt * 6, 0, 1);
        this.root.setVisible(this.alpha > 0).setAlpha(this.alpha);
    }

    // ── the card ────────────────────────────────────────────────────────────
    private card (idx: number, v: TutorialView) {
        const flashing = !!this.flash;
        const step = STEPS[flashing ? this.flash!.idx : idx];
        const done = flashing || (this.st.done && this.finale > 0);
        const text = this.st.done && !flashing ? 'You know the basics now. Tips will pop up as you play.' : flashing ? this.flash!.praise : say(step.text(v), this.touch, this.words());
        const prog = flashing ? null : step.progress?.(v) ?? null;
        const key = `${step.id}|${done}|${text}|${prog ? prog.join('/') : ''}`;
        if (idx !== this.shownIdx && !flashing) {
            this.shownIdx = idx;
            this.root.setY(CARD_Y - 12);
            this.scene.tweens.killTweensOf(this.root);
            this.scene.tweens.add({ targets: this.root, y: CARD_Y, duration: 220, ease: 'Back.easeOut' });
        }
        if (key === this.cardKey) return;
        this.cardKey = key;
        const t = this.touch, pad = t ? 12 : 9, iconW = t ? 52 : 44, bx = pad + iconW + 10, topH = t ? 34 : 22, rowH = t ? 28 : 16;
        const showSkip = !this.st.done && !flashing;
        const title = step.title;
        // the top row: the title, then "3/16" and the Skip button
        const skipW = this.skipBtn.w;
        this.titleT.setText(done && !this.st.done ? `✓ ${title}` : this.st.done ? 'All done!' : title).setOrigin(0, 0.5).setPosition(bx, pad + topH / 2).setColor(hex(done ? 0x2a6e34 : TEXT.ink));
        const n = Math.min(TOTAL, (flashing ? this.flash!.idx : idx) + 1);
        this.countT.setText(this.st.done ? '' : `${n}/${TOTAL}`).setOrigin(1, 0.5).setPosition(CARD_W - pad - (showSkip ? skipW + 8 : 0), pad + topH / 2);
        // the words, then one row for "No more tips" and the count to reach
        const maxH = t ? 144 : TOP_SLOT_MAX_H;
        let px = Math.round((t ? 16 : 14) * TEXT_SCALE);
        let rowY = 0, h = 0;
        for (;;) {
            this.bodyT.setFontSize(px).setText(text).setPosition(bx, pad + topH + 1);
            rowY = this.bodyT.y + Math.ceil(this.bodyT.height) + 5;
            h = Math.max(rowY + rowH + pad, pad * 2 + iconW + 6);
            if (h <= maxH || px <= 13) break;
            px--;                                                  // the words must not reach down to the farmer: a notch smaller until they fit
        }
        this.coachH = h;
        this.frame.clear();
        panel(this.frame, 0, 0, CARD_W, h, { ...STYLES.dark, rim: done ? PAL.lime : PAL.gold, shadow: true });
        inset(this.frame, pad, pad, iconW, iconW, PAL.deepSea, PAL.slate);
        const key2 = step.icon;
        const tex = this.scene.textures.exists(key2) ? key2 : 'k_sprout';
        const fr = this.scene.textures.getFrame(tex, 0);
        const sc = Math.max(1, Math.min(3, Math.floor((iconW - 10) / Math.max(fr.realWidth, fr.realHeight))));
        this.ico.setTexture(tex, 0).setScale(sc).setPosition(pad + iconW / 2, pad + iconW / 2).setVisible(true);
        this.skipBtn.root.setVisible(showSkip).setPosition(CARD_W - pad - skipW / 2 - 1, pad + topH / 2);
        this.skipBtn.zone.input!.enabled = showSkip;
        // the bottom row: the "no more tips" tick on the left, a progress bar on the right
        const box = t ? 20 : 13, ty = rowY + rowH / 2, tx = bx;
        this.tipsG.clear();
        inset(this.tipsG, tx, ty - box / 2, box, box, PAL.night, PAL.slate);
        this.tipsT.setPosition(tx + box + 6, ty);
        this.tipsZone.setPosition(tx - 4, rowY - 4).setSize(box + 14 + this.tipsT.width + 6, rowH + 8);
        this.tipsZone.input!.enabled = !this.st.done;
        this.tipsG.setVisible(!this.st.done); this.tipsT.setVisible(!this.st.done);
        this.barG.clear(); this.barT.setVisible(false);
        if (prog) {
            const bw = t ? 110 : 92, bxr = CARD_W - pad - bw - (t ? 62 : 52), bh = t ? 11 : 9;
            rect(this.barG, bxr, ty - bh / 2, bw, bh, WOOD[1]);
            rect(this.barG, bxr + 1, ty - bh / 2 + 1, bw - 2, bh - 2, 0x3a2420);
            rect(this.barG, bxr + 1, ty - bh / 2 + 1, Math.round((bw - 2) * Math.min(1, prog[0] / prog[1])), bh - 2, PAL.lime);
            this.barT.setVisible(true).setText(`${prog[0]} / ${prog[1]}`).setPosition(bxr + bw + 7, ty);
        }
    }

    // ── progression tips ────────────────────────────────────────────────────
    private tipView (): TipView {
        const f = this.farm, me = f.meS!;
        if (f.zoomLevel !== this.zoomSeen) { this.zoomSeen = f.zoomLevel; this.zoomed = true; }
        const players = Object.values(f.players);
        return {
            me, day: f.clock.day, clock: f.clock.clock, night: f.clock.night, ...this.tipFacts,
            flags: {
                zoomed: this.zoomed, fell: this.fell, online: players.filter((p) => p.online).length, touch: this.touch,
                friendDown: players.some((p) => p.id !== f.me && p.online && p.downed > 0 && Math.hypot(p.x - f.playerPos.x, p.y - f.playerPos.y) < 260),
                rain: weatherAt(f.serverSeed(), f.clock.day, f.clock.clock).rain > 0.25,
                vein: this.veinClose(),
            },
        };
    }

    /** Is an ore vein within a few tiles? (a cheap look at the plot you stand on) */
    private veinClose () {
        const f = this.farm, tx = Math.floor(f.playerPos.x / TILE), ty = Math.floor(f.playerPos.y / TILE);
        return !!f.world.plotAt(tx, ty)?.veins?.some((v) => Math.abs(v[0] - tx) <= 3 && Math.abs(v[1] - ty) <= 3);
    }

    /** Monsters close, hearts low, a line in the water or an expedition: no time to read. */
    private fighting () {
        const me = this.farm.meS!;
        return !!me.rift || !!me.fishing || me.hearts <= this.farm.derivedMe().maxHearts * 0.4 || this.mobNear;
    }

    private tipsUpdate (dt: number, quiet: boolean, hide: boolean) {
        const f = this.farm;
        this.tipT += dt;
        if (this.tipT >= 0.5) {
            const tip = this.tips.update(this.tipT, this.tipView(), { quiet: quiet || f.meS!.downed > 0, fighting: this.fighting(), tutorial: this.active || this.finale > 0, off: !this.st.tips || this.hintsCooling() });
            this.tipT = 0;
            if (tip) this.showTip(tip);
        }
        const c = this.tipCard;
        if (!c) return;
        // The coach card, the tip cards and the banners share ONE slot (TOP_SLOT) and never show together. A tip waits, hidden and
        // with its clock stopped, while the coach card is up or coming back, a banner shows or a window is open.
        if (hide || this.active || this.finale > 0 || this.alpha > 0.02) {
            c.root.setVisible(false);
            c.held += dt;
            if (c.held > 90) this.dismissTip();          // (whatever it was about is old news by now)
            return;
        }
        c.t += dt;
        c.root.setVisible(true).setY(CARD_Y).setAlpha(Math.min(1, c.t / 0.2) * Math.max(0, Math.min(1, (c.dur - c.t) / 0.5)));
        if (c.t >= c.dur) this.dismissTip();
    }

    private dismissTip () {
        this.tipCard?.root.destroy();
        this.tipCard = null;
    }

    private showTip (tip: Tip) {
        this.dismissTip();
        const s = this.scene, t = this.touch, pad = t ? 12 : 10, iconW = t ? 48 : 40, bx = iconW + pad + 12;
        // the red button owns the strip at the right edge, and the words stop short of it
        const closeW = t ? 38 : 22, closeX = CARD_W - pad - closeW, colR = closeX - 10;
        const root = s.add.container(CARD_X, CARD_Y).setDepth(7).setVisible(false);
        const g = s.add.graphics();
        const title = label(s, bx, pad - 1, tip.title, t ? 18 : 16, TEXT.ink, { font: 'head' });
        const tag = label(s, colR, pad + 2, 'TIP', t ? 13 : 11, TEXT.gold, { font: 'head', origin: [1, 0] });
        const body = label(s, bx, pad + (t ? 26 : 22), tip.text, t ? 15 : 13, TEXT.ink, { wrap: colR - bx, bold: false });
        // never taller than the slot allows, so the card stays off the farmer: a notch smaller until it fits
        const maxH = t ? 144 : TOP_SLOT_MAX_H;
        const height = () => Math.max(iconW + 2 * pad, Math.ceil(body.y + body.height) + pad + 4);
        let px = Math.round((t ? 15 : 13) * TEXT_SCALE), h = height();
        while (h > maxH && px > 13) { px--; body.setFontSize(px); h = height(); }
        panel(g, 0, 0, CARD_W, h, { ...STYLES.dark, rim: tip.color ?? PAL.sea, shadow: true });
        inset(g, pad, pad, iconW, iconW, PAL.deepSea, PAL.slate);
        const tex = s.textures.exists(tip.icon) ? tip.icon : 'k_star';
        const fr = s.textures.getFrame(tex, 0);
        const ico = icon(s, tex, pad + iconW / 2, pad + iconW / 2, Math.max(1, Math.min(3, Math.floor((iconW - 10) / Math.max(fr.realWidth, fr.realHeight)))));
        const close = button(s, closeX + closeW / 2, pad + closeW / 2, closeW, closeW, '×', () => this.dismissTip(), { style: STYLES.berry, size: t ? 20 : 15, ink: false });
        root.add([g, title, tag, body, ico, close.root]);
        root.setAlpha(0);
        this.tipCard = { root, t: 0, dur: Math.max(8, 3 + tip.text.length * 0.07), held: 0, h };
        playSfx('ui');
    }

    /** The tips this farmer has seen, for the guide. */
    get seenTips (): Tip[] { return seenTips(); }

    // ── the pointer ─────────────────────────────────────────────────────────
    private point (idx: number, v: TutorialView) {
        const g = this.pg;
        g.clear();
        if (this.flash || this.st.done) return;
        const step = STEPS[idx];
        this.pointKey = (this.pointKey + 1) % 6;
        if (this.pointKey === 0 || this.resolvedFor !== step.id) { this.resolved = this.resolve(step.target?.(v) ?? []); this.resolvedFor = step.id; }
        const now = this.scene.time.now / 1000;
        for (const b of this.resolved.boxes) this.drawBox(g, b, now);
        const w = this.resolved.world;
        if (w) this.drawWorld(g, w, now);
    }
    private pointKey = 0;
    private resolvedFor = '';

    private drawBox (g: Phaser.GameObjects.Graphics, b: Box, now: number) {
        const pulse = 0.5 + 0.5 * Math.sin(now * 6), grow = 2 + pulse * 3;
        g.lineStyle(3, PAL.ink, 0.8);
        if (b.round) g.strokeCircle(b.x + b.w / 2, b.y + b.h / 2, b.w / 2 + grow + 1);
        else g.strokeRoundedRect(b.x - grow - 1, b.y - grow - 1, b.w + 2 * grow + 2, b.h + 2 * grow + 2, 5);
        g.lineStyle(2.5, BRASS.mid, 0.7 + 0.3 * pulse);
        if (b.round) g.strokeCircle(b.x + b.w / 2, b.y + b.h / 2, b.w / 2 + grow);
        else g.strokeRoundedRect(b.x - grow, b.y - grow, b.w + 2 * grow, b.h + 2 * grow, 4);
        // a bouncing arrow over a button
        const ax = b.x + b.w / 2, ay = b.y - grow - 8 - Math.abs(Math.sin(now * 5)) * 5;
        this.arrow(g, ax, ay, Math.PI / 2, 1.3);
    }

    private drawWorld (g: Phaser.GameObjects.Graphics, w: { x: number; y: number; r: number; h: number }, now: number) {
        const f = this.farm, s = f.worldToScreen(w.x, w.y), z = f.cameras.main.zoom / 2;
        const m = { x0: 24, x1: W - 24, y0: 112, y1: H - 82 };
        const on = s.x > m.x0 && s.x < m.x1 && s.y > m.y0 - 30 && s.y < m.y1 + 40 && !slots.obstacles('card').some((o) => s.x > o.x && s.x < o.x + o.w && s.y > o.y - 6 && s.y < o.y + o.h + 6);
        const pulse = 0.5 + 0.5 * Math.sin(now * 6);
        if (on) {
            const r = w.r * TILE * z * (0.9 + 0.1 * pulse);
            g.lineStyle(3, PAL.ink, 0.55).strokeCircle(s.x, s.y, r + 1);
            g.lineStyle(2, BRASS.mid, 0.6 + 0.4 * pulse).strokeCircle(s.x, s.y, r);
            // the arrow hangs over the top; if the card is in the way it points up from underneath instead
            const bob = Math.abs(Math.sin(now * 5)) * 6, ay = s.y - w.h * z - 10 - bob;
            const hidden = this.alpha > 0.1 && s.x > CARD_X - 16 && s.x < CARD_X + CARD_W + 16 && ay < CARD_Y + this.coachH + 16;
            if (hidden) this.arrow(g, s.x, s.y + r + 10 + bob, -Math.PI / 2, 1.3);
            else this.arrow(g, s.x, ay, Math.PI / 2, 1.3);
            return;
        }
        // off screen: an arrow at the edge, turned towards it
        const mk = edgeMarker(s, slots.obstacles('card'), PLAY, 22);
        this.arrow(g, mk.x, mk.y, Math.atan2(s.y - mk.y, s.x - mk.x), 1 + 0.12 * pulse);
    }

    /** A chunky arrow pointing along `ang`, its tip at (x, y). */
    private arrow (g: Phaser.GameObjects.Graphics, x: number, y: number, ang: number, sc: number) {
        const pts = (grow: number) => [[0, 0], [-12 - grow, -9 - grow], [-12 - grow, 9 + grow]].map(([px, py]) => new Phaser.Math.Vector2(x + (px * Math.cos(ang) - py * Math.sin(ang)) * sc, y + (px * Math.sin(ang) + py * Math.cos(ang)) * sc));
        const a = pts(2), b = pts(0);
        g.fillStyle(PAL.ink, 1).fillTriangle(a[0].x, a[0].y, a[1].x, a[1].y, a[2].x, a[2].y);
        g.fillStyle(BRASS.mid, 1).fillTriangle(b[0].x, b[0].y, b[1].x, b[1].y, b[2].x, b[2].y);
    }
}

let current: Tutorial | null = null;

/** The tips this browser has shown so far, in the order they are written. */
export function seenTips (): Tip[] {
    const seen = new Set(hintStore.load().filter((id) => id.startsWith(TIP_PREFIX)).map((id) => id.slice(TIP_PREFIX.length)));
    return Object.values(TIP_BY_ID).filter((t) => seen.has(t.id));
}

/** What the settings page and the guide can ask of the tutorial. */
export const tutorialApi = {
    replay: () => current?.replay(),
    active: () => !!current?.active,
    tipsOn: () => current?.tipsOn ?? tipsEnabled(),
    setTips: (on: boolean) => { if (current) current.setTips(on); },
};
