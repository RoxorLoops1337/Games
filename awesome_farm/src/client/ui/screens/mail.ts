// The mailbox. At your own: the post waiting for you (letters from friends and the morning postcards), each with a Take button.
// At a friend's: a small form to leave them a parcel (up to three kinds of things, and a short note), sent from here.

import type * as Phaser from 'phaser';
import { ITEM_ORDER, ITEMS, iconOf, type ItemId, type Res } from '../../../shared/data/items';
import { NOTE_PRESETS } from '../../../shared/data/postcards';
import { GIVERS } from '../../../shared/data/sidequests';
import { PAL } from '../../../shared/palette';
import { MAIL_CAP, NOTE_MAX, PARCEL_STACKS } from '../../../shared/sim/mail';
import { countOf } from '../../../shared/sim/stats';
import type { BuildE, Parcel } from '../../../shared/sim/types';
import { isTouchUi } from '../../input/layout';
import { GridItem, ItemGrid } from '../grid';
import { qtyAmount } from '../gestures';
import { button, deviceText, Footer, GAP, icon, QtyChips, rowBox, Section, ts, Win, type Btn } from '../kit';
import { STYLES } from '../px';
import { itemTip } from '../tips';
import type { Screen, ScreenCtx } from './types';

const PER_PAGE = 4;
const giverIcon = (from: string) => Object.values(GIVERS).find((g) => g.name === from)?.icon ?? 'k_flag';

export class MailScreen implements Screen {
    private win: Win;
    private id: number;
    private own: boolean;
    private foot: Footer;
    private key = '';
    private g: Phaser.GameObjects.Graphics;
    private dyn: Phaser.GameObjects.GameObject[] = [];
    private btns: Btn[] = [];
    private page = 0;
    // composing
    private parcel: [Res, number][] = [];
    private noteI = 0;
    private note = NOTE_PRESETS[0];
    private bag?: ItemGrid;
    private tray?: ItemGrid;
    private bagSec?: Section;
    private traySec?: Section;
    private noteT?: Phaser.GameObjects.Text;

    constructor (private ctx: ScreenCtx, arg: unknown) {
        this.id = (arg as { id: number }).id;
        const b = this.ent()!, me = ctx.me();
        this.own = b.by === me.id;
        const owner = b.by ? ctx.farm.players[b.by]?.name ?? 'a friend' : 'a friend';
        const s = ctx.scene;
        this.win = new Win(s, {
            size: 'large', title: this.own ? 'Your mailbox' : `${owner}'s mailbox`, icon: 'mailbox', accent: PAL.sea,
            sub: this.own ? 'Parcels from friends and a postcard every morning.' : `Leave ${owner} a parcel: up to ${PARCEL_STACKS} kinds of things and a short note. It waits in their mailbox.`,
            onClose: () => ctx.close(),
        });
        const w = this.win;
        this.g = w.put(s.add.graphics(), 0, 0);
        this.foot = w.footer(this.own
            ? { primary: { label: 'Take all', onClick: () => ctx.send({ t: 'mail', op: 'take', id: this.id }) }, hint: 'Take a letter and its things go into your backpack.' }
            : { primary: { label: 'Send parcel', onClick: () => this.send() }, hint: deviceText('Click an item to put it in the parcel. Click it in the parcel to take it out.', 'Tap an item to put it in the parcel (x1, x10 or All below). Tap it in the parcel to take it out.') });
        if (!this.own) this.buildForm();
    }

    private ent (): BuildE | null { const e = this.ctx.farm.ents[this.id]; return e && e.k === 'bld' ? e : null; }

    // ── writing to a friend ─────────────────────────────────────────────────
    private buildForm () {
        const w = this.win, s = this.ctx.scene, body = w.body, touch = isTouchUi();
        const cw = Math.floor((body.w - GAP) / 2);
        this.traySec = w.section(body.x, body.y, cw, body.h, 'Your parcel', { right: '' });
        this.bagSec = w.section(body.x + cw + GAP, body.y, body.w - cw - GAP, body.h, 'Your backpack', { right: '' });
        const ti = this.traySec.inner, bi = this.bagSec.inner;
        const trayH = 60;
        this.tray = new ItemGrid(w, ti.x, ti.y, PARCEL_STACKS, 1, 52, 6, 'Put things in the parcel.\nOr just send the note.');
        // the note: one tap on a preset walks through the list; Write… types your own
        const ny = ti.y + trayH + 14;
        w.text('Note', ti.x, ny, ts('cap'), PAL.pebble, { bold: false });
        const box = w.put(s.add.graphics(), 0, 0);
        rowBox(box, ti.x, ny + 18, ti.w, 40);
        this.noteT = w.text(this.note, ti.x + 10, ny + 18 + 20, ts('body'), PAL.cream, { origin: [0, 0.5], wrap: ti.w - 20, bold: false });
        const nb = button(s, 0, 0, 150, 28, 'Next note', () => { this.noteI = (this.noteI + 1) % (NOTE_PRESETS.length + 1); this.note = this.noteI < NOTE_PRESETS.length ? NOTE_PRESETS[this.noteI] : ''; this.key = ''; }, { style: STYLES.dark, size: 13 });
        w.put(nb.root, ti.x + 75, ny + 18 + 40 + 24);
        const wb = button(s, 0, 0, 150, 28, 'Write your own…', () => this.writeNote(), { style: STYLES.dark, size: 13 });
        w.put(wb.root, ti.x + 75 + 160, ny + 18 + 40 + 24);
        const gi = ItemGrid.fit(bi.w, bi.h - (touch ? 40 : 0), 48, 4);
        this.bag = new ItemGrid(w, bi.x, bi.y, gi.cols, gi.rows, 48, 4, 'Your pockets are empty.');
        if (touch) {
            w.text('A tap moves:', bi.x, bi.y + bi.h - 20, ts('body'), PAL.pebble, { origin: [0, 0.5], bold: false });
            this.bag.qty = new QtyChips(w, bi.x + 120, bi.y + bi.h - 20, [1, 10, 'all'], 'all');
        }
    }

    private writeNote () {
        const v = typeof window !== 'undefined' && typeof window.prompt === 'function' ? window.prompt(`A short note (up to ${NOTE_MAX} letters):`, this.note) : null;
        if (v !== null) { this.note = v.replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, NOTE_MAX); this.noteI = NOTE_PRESETS.length; this.key = ''; }
    }

    private inParcel = (r: Res) => this.parcel.find((x) => x[0] === r)?.[1] ?? 0;
    private have = (r: Res) => (r === 'coin' ? this.ctx.me().coins : countOf(this.ctx.me(), r as ItemId));

    private add (r: Res, n: number) {
        const room = this.have(r) - this.inParcel(r);
        const take = Math.min(n, room);
        if (take <= 0) return;
        const row = this.parcel.find((x) => x[0] === r);
        if (row) row[1] += take;
        else if (this.parcel.length < PARCEL_STACKS) this.parcel.push([r, take]);
        else { this.ctx.toast(`A parcel holds ${PARCEL_STACKS} kinds of things`, undefined, PAL.pebble); return; }
        this.key = '';
    }

    private send () {
        if (!this.parcel.length) { this.ctx.toast('Put something in the parcel first', undefined, PAL.pebble); return; }
        this.ctx.send({ t: 'mail', op: 'send', id: this.id, items: this.parcel.map(([r, n]) => [r, n] as [Res, number]), note: this.note });
        this.ctx.close();
    }

    wheel (dy: number, x: number, y: number) { if (this.bag?.contains(x, y)) this.bag.scroll(dy); }

    // ── per frame ───────────────────────────────────────────────────────────
    update () {
        const b = this.ent();
        if (!b) { this.ctx.close(); return; }
        const me = this.ctx.me();
        const k = JSON.stringify([me.mail, this.page, this.parcel, this.note, me.inv, me.coins]);
        if (k === this.key) return;
        this.key = k;
        if (this.own) this.drawPost(me.mail ?? []); else this.drawForm();
    }

    private drawForm () {
        const me = this.ctx.me();
        // what is left in your pockets once the parcel is packed
        const left = (r: Res) => this.have(r) - this.inParcel(r);
        this.tray!.setItems(this.parcel.map(([r, n]): GridItem => ({
            data: { icon: iconOf(r), count: n, rarity: r === 'coin' ? 0 : ITEMS[r].rarity },
            tip: () => r === 'coin' ? { title: 'Coins', color: PAL.gold, lines: [{ t: `${n} in the parcel`, c: PAL.cream }], foot: deviceText('Click to take them back out', 'Tap to take them back out') } : itemTip(r, { count: n, foot: deviceText('Click to take them back out', 'Tap to take them back out') }),
            click: () => { this.parcel = this.parcel.filter((x) => x[0] !== r); this.key = ''; },
        })));
        this.traySec!.setRight(`${this.parcel.length} / ${PARCEL_STACKS} kinds`);
        this.noteT!.setText(this.note || '(no note)').setColor(this.note ? '#fff6e0' : '#9ec4d4');
        const ids: Res[] = [...(me.coins > 0 ? ['coin' as Res] : []), ...ITEM_ORDER.filter((id) => countOf(me, id) > 0)];
        this.bagSec!.setRight(`${ids.length} kind${ids.length === 1 ? '' : 's'}`);
        this.bag!.setItems(ids.map((r): GridItem => ({
            data: { icon: iconOf(r), count: left(r), rarity: r === 'coin' ? 0 : ITEMS[r].rarity, dim: left(r) <= 0 },
            tip: () => r === 'coin' ? { title: 'Coins', color: PAL.gold, lines: [{ t: `${me.coins} in your purse`, c: PAL.cream }], foot: deviceText('Click: add 10 · Shift: add 100 · Right-click: add 1', 'Tap adds 1, 10 or all as picked') } : itemTip(r, { count: left(r), foot: deviceText('Click: add all · Right-click: add one', 'Tap adds x1, x10 or All as picked · Hold: add one') }),
            click: (shift, q) => this.add(r, r === 'coin' ? (shift ? 100 : q !== undefined ? qtyAmount(q, left(r), shift, 10) : 10) : qtyAmount(q, left(r), shift, 'all')),
            right: () => this.add(r, 1),
        })));
    }

    private drawPost (mail: Parcel[]) {
        const w = this.win, s = this.ctx.scene, g = this.g, body = w.body;
        g.clear();
        for (const o of this.dyn) o.destroy();
        for (const b of this.btns) b.root.destroy();
        this.dyn = []; this.btns = [];
        const pages = Math.max(1, Math.ceil(mail.length / PER_PAGE));
        this.page = Math.min(this.page, pages - 1);
        if (!mail.length) {
            this.dyn.push(w.put(icon(s, 'mailbox', 0, 0, 3), body.x + body.w / 2, body.y + 70));
            this.dyn.push(w.text('No post today', body.x + body.w / 2, body.y + 112, ts('head'), PAL.gold, { origin: [0.5, 0], font: 'head' }));
            this.dyn.push(w.text('A postcard comes with every morning, and friends can leave you parcels at a mailbox you built.', body.x + body.w / 2, body.y + 138, ts('body'), PAL.pebble, { origin: [0.5, 0], wrap: 560, align: 'center', bold: false }));
            this.foot.primary?.setEnabled(false);
            return;
        }
        this.foot.primary?.setEnabled(true);
        // newest first
        const list = mail.map((m, i) => ({ m, i })).reverse().slice(this.page * PER_PAGE, this.page * PER_PAGE + PER_PAGE);
        const rowH = Math.floor((body.h - 40) / PER_PAGE) - 6;
        list.forEach(({ m, i }, row) => {
            const y = body.y + row * (rowH + 6);
            rowBox(g, body.x, y, body.w, rowH, { accent: m.pc ? PAL.gold : PAL.lime });
            this.dyn.push(w.put(icon(s, m.pc ? giverIcon(m.from) : 'k_flag', 0, 0, 2), body.x + 28, y + rowH / 2));
            this.dyn.push(w.text(m.from, body.x + 56, y + 8, ts('head'), m.pc ? PAL.gold : PAL.cream, { font: 'head' }));
            this.dyn.push(w.text(`${m.pc ? 'Postcard' : 'Parcel'} · day ${m.d}`, body.x + 56, y + 8 + Math.round(ts('head') * 1.25), ts('cap'), PAL.pebble, { bold: false }));
            this.dyn.push(w.text(m.note || '(no note)', body.x + 56, y + 8 + Math.round(ts('head') * 1.25) + Math.round(ts('cap') * 1.3) + 2, ts('body'), m.note ? PAL.cream : PAL.pebble, { wrap: body.w - 56 - 330, bold: false }));
            m.items.forEach(([r, n], j) => {
                const x = body.x + body.w - 300 + j * 62;
                this.dyn.push(w.put(icon(s, iconOf(r), 0, 0, 2), x + 18, y + rowH / 2 - 6));
                this.dyn.push(w.text(`×${n}`, x + 18, y + rowH / 2 + 14, ts('cap'), PAL.cream, { origin: [0.5, 0] }));
            });
            const bt = button(s, 0, 0, 80, 28, 'Take', () => this.ctx.send({ t: 'mail', op: 'take', id: this.id, i }), { style: STYLES.gold, size: 14 });
            w.put(bt.root, body.x + body.w - 50, y + rowH / 2);
            this.btns.push(bt);
        });
        if (pages > 1) {
            const py = body.y + body.h - 18, x = body.x + body.w / 2;
            const prev = button(s, 0, 0, 44, 28, '◀', () => { this.page--; this.key = ''; }, { style: STYLES.dark, size: 12, ink: false });
            const next = button(s, 0, 0, 44, 28, '▶', () => { this.page++; this.key = ''; }, { style: STYLES.dark, size: 12, ink: false });
            prev.setEnabled(this.page > 0); next.setEnabled(this.page < pages - 1);
            w.put(prev.root, x - 70, py); w.put(next.root, x + 70, py);
            this.btns.push(prev, next);
            this.dyn.push(w.text(`${this.page + 1} / ${pages}  ·  ${mail.length} of ${MAIL_CAP}`, x, py - 8, ts('cap'), PAL.pebble, { origin: [0.5, 0], bold: false }));
        }
    }

    destroy () { this.win.destroy(); }
}
