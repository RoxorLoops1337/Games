// Madame Fortuna's wheel: spin it (one free spin a day), watch it slow down tick by tick, and then press your luck on a
// coin prize for double or nothing. The server decides everything; this screen only shows it, so it can be as theatrical
// as it likes.

import type * as Phaser from 'phaser';
import { iconOf, type ItemId } from '../../../shared/data/items';
import { GAMBLE_MAX_CHAIN, GAMBLE_ODDS, WHEEL, wheelPrice, wheelSpans } from '../../../shared/data/loot';
import { FORTUNA_LINES, FORTUNES } from '../../../shared/data/story';
import { PAL } from '../../../shared/palette';
import type { SimEvent } from '../../../shared/sim/types';
import { SS } from '../../res';
import { Fx } from '../../juice/fx';
import { playSfx } from '../../juice/sfx';
import { mixc } from '../../art/paint';
import { button, Footer, GAP, icon, label, Section, showBtn, Slot, STYLES, tipOn, ts, Win } from '../kit';
import { itemTip } from '../tips';
import type { Screen, ScreenCtx } from './types';

type Spin = Extract<SimEvent, { e: 'spin' }>;
type Gamble = Extract<SimEvent, { e: 'gamble' }>;

const R = 150, TAU = Math.PI * 2;
const DISC = 'wheel_disc';

/** Paint the disc once (at screen density) so spinning it is just rotating an image. */
function ensureDisc (scene: Phaser.Scene) {
    if (scene.textures.exists(DISC)) return;
    const S = R * SS, pad = 8, c = S + pad;
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    const spans = wheelSpans();
    WHEEL.forEach((wd, i) => {
        const [a, b] = spans[i];
        const a0 = a * TAU - Math.PI / 2, a1 = b * TAU - Math.PI / 2;
        const steps = Math.max(2, Math.ceil((b - a) * 64));
        for (const [frac, lift] of [[0.94, 0], [0.64, 0.14], [0.34, 0.26]] as const) {
            g.fillStyle(mixc(wd.color, 0xffffff, lift), 1).beginPath().moveTo(c, c);
            for (let k = 0; k <= steps; k++) { const t = a0 + ((a1 - a0) * k) / steps; g.lineTo(c + Math.cos(t) * S * frac, c + Math.sin(t) * S * frac); }
            g.closePath().fillPath();
        }
        g.lineStyle(3, 0x2a1d2c, 0.75).beginPath().moveTo(c, c).lineTo(c + Math.cos(a0) * S * 0.94, c + Math.sin(a0) * S * 0.94).strokePath();
    });
    g.lineStyle(16, 0xe0a020, 1).strokeCircle(c, c, S * 0.96);
    g.lineStyle(5, 0xffd966, 1).strokeCircle(c, c, S * 0.99);
    g.lineStyle(4, 0x2a1d2c, 1).strokeCircle(c, c, S * 1.0 + 2);
    for (let k = 0; k < 26; k++) { const t = (k / 26) * TAU; g.fillStyle(0xfff6e0, 1).fillCircle(c + Math.cos(t) * S * 0.955, c + Math.sin(t) * S * 0.955, 5); }
    g.fillStyle(0x2a1d2c, 1).fillCircle(c, c, 30).fillStyle(0xffd966, 1).fillCircle(c, c, 26).fillStyle(0xfff3b0, 1).fillCircle(c - 6, c - 6, 9);
    g.generateTexture(DISC, c * 2, c * 2);
    g.destroy();
}

const pick = <T>(l: readonly T[]): T => l[Math.floor(Math.random() * l.length)];
const easeOut = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const wrap = (a: number) => ((a % TAU) + TAU) % TAU;

export class WheelScreen implements Screen {
    private win: Win;
    private fx: Fx;
    private disc: Phaser.GameObjects.Container;
    private pointer: Phaser.GameObjects.Graphics;
    private spans = wheelSpans();
    private rot = 0;
    private vel = 0.25;
    private phase: 'idle' | 'wait' | 'land' = 'idle';
    private land = { from: 0, to: 0, t: 0, dur: 4, last: -1 };
    private pending: Spin | null = null;
    private gamble = 0;
    private chain = 0;
    private speech: Phaser.GameObjects.Text;
    private fortune: Phaser.GameObjects.Text;
    private foot: Footer;
    private spinBtn: ReturnType<typeof button>;
    private takeBtn: ReturnType<typeof button>;
    private dblBtn: ReturnType<typeof button>;
    private gambleT: Phaser.GameObjects.Text;
    private prize: Phaser.GameObjects.Container;
    private prizeT: Phaser.GameObjects.Text;
    private prizeSec: Section;
    private key = '';
    private id: number;
    private cx: number;
    private cy: number;

    constructor (private ctx: ScreenCtx, arg: unknown) {
        const s = ctx.scene;
        this.id = (arg as { id: number }).id;
        this.win = new Win(s, { size: 'large', title: 'Fortune Wheel', icon: 'k_clover', accent: PAL.gold, onClose: () => ctx.close() });
        const w = this.win;
        this.fx = new Fx(s, 3);
        ensureDisc(s);
        this.foot = w.footer({
            primary: { label: 'FREE SPIN', w: 190, onClick: () => this.spin() },
            extras: [{ label: 'Keep it', w: 100, style: STYLES.lime, onClick: () => this.take() }, { label: 'Double or nothing', w: 190, style: STYLES.berry, onClick: () => this.double() }],
            info: '', infoW: 170, hint: '',
        });
        this.spinBtn = this.foot.primary!; this.takeBtn = this.foot.extras[0]; this.dblBtn = this.foot.extras[1];
        const body = w.body, lw = 456;
        // the wheel
        const stage = w.section(body.x, body.y, lw, body.h);
        this.cx = stage.x + lw / 2;
        this.cy = stage.y + 30 + R;
        this.disc = s.add.container(0, 0);
        const img = s.add.image(0, 0, DISC).setScale(1 / SS);
        this.disc.add(img);
        WHEEL.forEach((wd, i) => {
            const mid = ((this.spans[i][0] + this.spans[i][1]) / 2) * TAU;
            const r = R * 0.64;
            const t = label(s, Math.sin(mid) * r, -Math.cos(mid) * r, wd.label, wd.kind === 'jackpot' ? 10 : 13, PAL.cream, { origin: [0.5, 0.5], font: 'head', stroke: 3 });
            t.setRotation(mid < Math.PI ? mid - Math.PI / 2 : mid + Math.PI / 2);
            this.disc.add(t);
        });
        w.put(this.disc, this.cx, this.cy);
        const hub = icon(s, 'k_clover', 0, 0, 2);
        w.put(hub, this.cx, this.cy);
        this.pointer = s.add.graphics();
        w.put(this.pointer, this.cx, this.cy - R - 12);
        this.drawPointer(0);
        this.fortune = w.text('', this.cx, this.cy + R + 22, ts('cap'), PAL.pebble, { origin: [0.5, 0], align: 'center', wrap: lw - 40, bold: false });
        // Fortuna
        const rx = body.x + lw + GAP, rw = body.x + body.w - rx;
        const talk = w.section(rx, body.y, rw, 104);
        const face = icon(s, 'k_clover', 0, 0, 3);
        w.put(face, talk.inner.x + 22, talk.inner.y + 36);
        w.text('Madame Fortuna', talk.inner.x + 54, talk.inner.y + 2, ts('body'), PAL.gold, { font: 'head' });
        this.speech = w.text('', talk.inner.x + 54, talk.inner.y + 2 + Math.round(ts('body') * 1.2) + 4, ts('body'), PAL.cream, { bold: false, wrap: talk.inner.w - 60 });
        this.say('welcome');
        // the prize
        this.prizeSec = w.section(rx, body.y + 112, rw, 150, 'Your prize');
        const pi = this.prizeSec.inner;
        this.prize = s.add.container(0, 0);
        w.put(this.prize, pi.x, pi.y + 2);
        this.prizeT = w.text('Spin the wheel!', pi.x + pi.w / 2, pi.y + 62, ts('body'), PAL.cream, { origin: [0.5, 0], align: 'center', wrap: pi.w - 16, font: 'head' });
        // press your luck
        const gy = body.y + 112 + 150 + GAP;
        const gam = w.section(rx, gy, rw, body.y + body.h - gy, 'Press your luck');
        this.gambleT = w.text('', gam.inner.x, gam.inner.y + 2, ts('body'), PAL.cream, { bold: false, wrap: gam.inner.w });
        this.refresh();
    }

    private drawPointer (flick: number) {
        const p = this.pointer;
        p.clear();
        p.fillStyle(PAL.ink, 1).fillTriangle(-13, -4 + flick, 13, -4 + flick, 0, 28 + flick);
        p.fillStyle(PAL.berry, 1).fillTriangle(-10, -2 + flick, 10, -2 + flick, 0, 24 + flick);
        p.fillStyle(PAL.gold, 1).fillCircle(0, -2 + flick, 6);
    }

    private say (kind: keyof typeof FORTUNA_LINES) {
        this.speech.setText(pick(FORTUNA_LINES[kind]));
    }

    // ── what the server tells us ─────────────────────────────────────────────
    private state () {
        const me = this.ctx.me(), f = me.fort, day = this.ctx.farm.clock.day;
        const free = !f || f.fd !== day;
        const paid = f && f.pd === day ? f.pn : 0;
        return { free, price: free ? 0 : wheelPrice(paid), coins: me.coins };
    }

    private spin () {
        if (this.phase !== 'idle') return;
        const st = this.state();
        if (!st.free && st.coins < st.price) { this.say('broke'); playSfx('deny'); return; }
        this.phase = 'wait'; this.vel = 2; this.gamble = 0; this.chain = 0;
        this.ctx.send({ t: 'fortune', op: 'spin', id: this.id });
        this.fx.play('spin', this.win.x + this.cx, this.win.y + this.cy);
        this.prize.removeAll(true);
        this.prizeT.setText('…');
        this.fortune.setText('');
        // the server may refuse (not enough coins, too far): give up waiting after a moment
        this.ctx.scene.time.delayedCall(2500, () => { if (this.phase === 'wait') this.phase = 'idle'; });
    }

    onEvent (e: SimEvent) {
        if (e.e === 'spin') this.onSpin(e);
        else if (e.e === 'gamble') this.onGamble(e);
    }

    private onSpin (e: Spin) {
        if (this.phase !== 'wait') return;
        this.pending = e;
        const [a, b] = this.spans[e.seg];
        const u = a + (b - a) * (0.2 + Math.random() * 0.6);        // where in the wedge it stops
        const to = -u * TAU;                                         // the disc turns the other way round the pointer
        const from = this.rot;
        let end = to + Math.ceil((from - to) / TAU) * TAU;           // the nearest stop at or ahead of where we are...
        while (end < from + 14 * 3.4 / 3) end += TAU;                // ...at least as far as the slowdown needs
        this.land = { from, to: end, t: 0, dur: 4, last: -1 };
        this.phase = 'land';
    }

    private landed (e: Spin) {
        const s = this.ctx.scene, x = this.win.x + this.cx, y = this.win.y + this.cy;
        const wd = WHEEL[e.seg];
        // show what it paid
        this.prize.removeAll(true);
        const n = e.items.length, size = 46;
        const x0 = this.prizeSec.inner.w / 2 - (n * (size + 6) - 6) / 2;
        e.items.forEach(([res, count, rarity], i) => {
            const sl = new Slot(s, x0 + i * (size + 6), 0, size, { iconScale: 2 });
            sl.set({ icon: res === 'coin' ? 'i_coin' : iconOf(res as ItemId), count, rarity: rarity as never });
            if (res !== 'coin') tipOn(sl.interactive, () => itemTip(res as ItemId, { count }));
            this.prize.add(sl.root);
            sl.root.setScale(0.2).setAlpha(0);
            s.tweens.add({ targets: sl.root, scale: 1, alpha: 1, duration: 300, delay: i * 120, ease: 'Back.easeOut' });
        });
        const coins = e.items.find((i) => i[0] === 'coin');
        this.prizeT.setText(e.jackpot ? 'JACKPOT!' : wd.kind === 'bust' ? 'A consolation prize' : wd.kind === 'coin' ? `${coins?.[1] ?? 0} coins!` : wd.kind === 'crate' ? 'A crate! Open it from your backpack' : 'A bundle!');
        this.fortune.setText(`“${pick(FORTUNES)}”`);
        // juice, by how good it was
        const best = Math.max(...e.items.map((i) => i[2]));
        if (e.jackpot) {
            this.fx.play('jackpot', x, y);
            for (const [dx, dy, d] of [[-120, -60, 180], [120, -60, 360], [0, 80, 540]] as const) s.time.delayedCall(d, () => this.fx.play('jackpot', x + dx, y + dy, { quiet: true }));
            s.cameras.main.flash(420, 255, 230, 150);
            this.say('jackpot');
        } else if (wd.kind === 'bust') { this.fx.play('deny', x, y); this.say('bust'); }
        else if (best >= 3) { this.fx.play('rare', x, y); this.say('win'); }
        else if (wd.kind === 'crate') { this.fx.play('crateOpen', x, y); this.say('win'); }
        else { this.fx.play(wd.kind === 'coin' ? 'sell' : 'collect', x, y); this.say('win'); }
        this.gamble = e.gamble; this.chain = e.chain;
        this.pending = null;
        this.vel = 0;                                  // it stays where it stopped, the prize under the pointer
        this.phase = 'idle';
        this.key = '';
        this.refresh();
    }

    private take () {
        if (this.gamble <= 0) return;
        this.ctx.send({ t: 'fortune', op: 'take', id: this.id });
        this.gamble = 0; this.chain = 0; this.key = ''; this.refresh();
        playSfx('pop');
    }

    private double () {
        if (this.gamble <= 0 || this.phase !== 'idle') return;
        this.ctx.send({ t: 'fortune', op: 'double', id: this.id });
        this.phase = 'wait';
        this.ctx.scene.time.delayedCall(2500, () => { if (this.phase === 'wait' && !this.pending) this.phase = 'idle'; });
    }

    private onGamble (e: Gamble) {
        const x = this.win.x + this.prizeSec.inner.x + this.prizeSec.inner.w / 2, y = this.win.y + this.prizeSec.inner.y + 30;
        this.phase = 'idle';
        this.chain = e.chain; this.gamble = e.next;
        if (e.win) {
            this.say('gambleWin');
            this.prizeT.setText(`DOUBLED! ${e.coins} coins`);
            this.fx.play('gambleWin', x, y);
        } else {
            this.say('gambleLose');
            this.prizeT.setText(`Gone... ${e.coins} coins`);
            this.fx.play('gambleLose', x, y);
            this.ctx.scene.cameras.main.flash(160, 120, 40, 60);
        }
        this.key = '';
        this.refresh();
    }

    // ── showing it ───────────────────────────────────────────────────────────
    private refresh () {
        const st = this.state();
        const busy = this.phase !== 'idle';
        const k = JSON.stringify([st, this.gamble, this.chain, busy]);
        if (k === this.key) return;
        this.key = k;
        this.foot.setHint(st.free ? 'Today’s first spin is free!' : st.coins >= st.price ? `Another spin costs ${st.price} coins.` : `Another spin costs ${st.price} coins: you have ${st.coins}.`, st.free || st.coins >= st.price ? PAL.pebble : PAL.berry);
        this.spinBtn.setLabel(st.free ? 'FREE SPIN' : `SPIN (${st.price})`);
        this.spinBtn.setEnabled(!busy && (st.free || st.coins >= st.price));
        this.foot.setInfo(`${st.coins} coins`);
        const g = this.gamble > 0 && !busy && this.chain < GAMBLE_MAX_CHAIN;
        const can = g && st.coins >= this.gamble;
        this.gambleT.setText(this.gamble > 0 ? (this.chain >= GAMBLE_MAX_CHAIN ? `${this.gamble} coins: it cannot get any luckier. Keep it!` : `Risk ${this.gamble} coins for ${this.gamble * 2}?  ${Math.round(GAMBLE_ODDS * 100)}% to win.${this.chain ? `  (${this.chain} in a row)` : ''}`) : 'Win coins and you may press your luck: double or nothing.');
        showBtn(this.takeBtn, this.gamble > 0 && !busy);
        showBtn(this.dblBtn, this.gamble > 0 && !busy && this.chain < GAMBLE_MAX_CHAIN);
        this.dblBtn.setEnabled(can);
    }

    onKey (k: string) {
        if (k === 'Enter' || k === ' ') { if (this.gamble > 0 && this.phase === 'idle') this.take(); else this.spin(); return true; }
        return false;
    }

    update (dt: number) {
        // the disc: a slow drift at rest, a whirl while waiting, then a long slowdown with a tick on every wedge
        if (this.phase === 'idle') this.rot += this.vel * dt * 0.4;
        else if (this.phase === 'wait') { this.vel = Math.min(14, this.vel + dt * 30); this.rot += this.vel * dt; }
        else {
            const l = this.land;
            l.t += dt;
            const p = l.t / l.dur;
            this.rot = l.from + (l.to - l.from) * easeOut(p);
            if (p >= 1) { this.rot = l.to; if (this.pending) this.landed(this.pending); }
        }
        this.disc.setRotation(this.rot);
        // a tick whenever a wedge boundary passes the pointer
        const u = wrap(-this.rot) / TAU;
        const idx = this.spans.findIndex(([a, b]) => u >= a && u < b);
        if (this.phase !== 'idle' && idx !== this.land.last && idx >= 0) {
            if (this.land.last >= 0) { playSfx('tick', 0.9 + (this.phase === 'land' ? 0.5 * (1 - this.land.t / this.land.dur) : 0.6)); this.drawPointer(5); this.ctx.scene.time.delayedCall(60, () => this.drawPointer(0)); }
            this.land.last = idx;
        }
        this.refresh();
    }

    destroy () { this.win.destroy(); this.fx.destroy(); }
}
