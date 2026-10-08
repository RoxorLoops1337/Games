// The Hatchery: choose two of your creatures, give them treats, wait for the egg, hatch it.

import { clock } from '../../../shared/fmt';
import { critTex } from '../../art/storybook-critters';
import type * as Phaser from 'phaser';
import { BREED_TREATS, ELEMENT_COLOR, RARITY_COLORS, spOf, TRAITS } from '../../../shared/data/creatures';
import { PAL } from '../../../shared/palette';
import { breedTime, petsOf, rosterCap } from '../../../shared/sim/creatures';
import { countOf } from '../../../shared/sim/stats';
import { Footer, GAP, icon, onTap, Pager, rowBox, Section, ts, Win } from '../kit';
import { bar, hex, inset } from '../px';
import { fitScale } from './creatures';
import type { Screen, ScreenCtx } from './types';

const ROWS = 7;

export class HatcheryScreen implements Screen {
    private win: Win;
    private id: number;
    private g: Phaser.GameObjects.Graphics;
    private key = '';
    private page = 0;
    private selA = '';
    private selB = '';
    private t = 0;
    private rowH: number;
    private rowI: Phaser.GameObjects.Image[] = [];
    private rowN: Phaser.GameObjects.Text[] = [];
    private rowS: Phaser.GameObjects.Text[] = [];
    private rowT: Phaser.GameObjects.Text[] = [];
    private zones: Phaser.GameObjects.Zone[] = [];
    private ids: string[] = [];
    private wellI: Phaser.GameObjects.Image[] = [];
    private wellT: Phaser.GameObjects.Text[] = [];
    private egg: Phaser.GameObjects.Image;
    private infoT: Phaser.GameObjects.Text;
    private list: Section;
    private parents: Section;
    private foot: Footer;
    private pager: Pager;

    constructor (private ctx: ScreenCtx, arg: unknown) {
        const s = ctx.scene;
        this.id = (arg as { id: number }).id;
        this.win = new Win(s, { size: 'large', title: 'Hatchery', icon: 'k_den', accent: PAL.blossom, onClose: () => ctx.close() });
        const w = this.win;
        this.foot = w.footer({
            primary: { label: `Start breeding (${BREED_TREATS} treats)`, w: 250, onClick: () => this.primary() },
            extras: [{ label: 'Call it off', onClick: () => ctx.send({ t: 'breed', op: 'cancel', id: this.id }) }],
            hint: '',
        });
        const body = w.body, lw = 440;
        this.g = w.put(s.add.graphics(), 0, 0);
        // ── your creatures: pick two ──
        this.list = w.section(body.x, body.y, lw, body.h, 'Your creatures', { right: '' });
        const li = this.list.inner;
        this.rowH = Math.floor((li.h - 38) / ROWS);
        for (let i = 0; i < ROWS; i++) {
            const y = li.y + i * this.rowH;
            this.rowI.push(w.put(icon(s, 'px', 0, 0, 2), li.x + 28, y + this.rowH / 2 - 2).setVisible(false));
            this.rowN.push(w.text('', li.x + 56, y + 5, ts('body'), PAL.cream, { font: 'head' }));
            this.rowS.push(w.text('', li.x + 56, y + 5 + Math.round(ts('body') * 1.2) + 1, ts('cap'), PAL.pebble, { bold: false }));
            this.rowT.push(w.text('', li.x + li.w - 10, y + 7, ts('cap'), PAL.gold, { bold: false, origin: [1, 0], align: 'right' }));
            const z = s.add.zone(0, 0, li.w, this.rowH - 4).setOrigin(0).setInteractive({ useHandCursor: true });
            w.put(z, li.x, y);
            onTap(z, () => this.pickRow(i));
            this.zones.push(z);
        }
        this.pager = new Pager(w, li.x + li.w / 2, li.y + li.h - 16, (d) => { this.page = Math.max(0, this.page + d); this.key = ''; });
        // ── the parents, and the egg ──
        const rx = body.x + lw + GAP;
        this.parents = w.section(rx, body.y, body.w - lw - GAP, body.h, 'Parents', { right: '' });
        const pi = this.parents.inner;
        for (let i = 0; i < 2; i++) {
            const cx = pi.x + (i ? pi.w - 70 : 70);
            this.wellI.push(w.put(icon(s, 'px', 0, 0, 3), cx, pi.y + 56).setVisible(false));
            this.wellT.push(w.text('', cx, pi.y + 118, ts('body'), PAL.cream, { origin: [0.5, 0], align: 'center' }));
        }
        w.put(icon(s, 'k_heart', 0, 0, 2), pi.x + pi.w / 2, pi.y + 60);
        this.egg = w.put(icon(s, 'egg', 0, 0, 5), pi.x + pi.w / 2, pi.y + 200).setVisible(false);
        this.infoT = w.text('', pi.x, pi.y + 262, ts('body'), PAL.cream, { bold: false, wrap: pi.w });
    }

    private ent () {
        const e = this.ctx.farm.ents[this.id];
        return e && e.k === 'bld' ? e : null;
    }

    private primary () {
        const h = this.ent();
        if (!h) return;
        if (h.egg) this.ctx.send({ t: 'breed', op: 'hatch', id: this.id });
        else if (!h.par && this.selA && this.selB) this.ctx.send({ t: 'breed', op: 'start', id: this.id, a: this.selA, b: this.selB });
    }

    private pickRow (i: number) {
        const id = this.ids[i];
        if (!id) return;
        const me = this.ctx.me();
        const pet = petsOf(me).find((p) => p.id === id);
        if (!pet || pet.den || pet.nest !== undefined) return;
        if (this.selA === id) this.selA = '';
        else if (this.selB === id) this.selB = '';
        else if (!this.selA) this.selA = id;
        else if (!this.selB) this.selB = id;
        else { this.selA = this.selB; this.selB = id; }
        this.key = '';
    }

    update (dt: number) {
        const h = this.ent();
        if (!h) { this.ctx.close(); return; }
        this.t += dt;
        const me = this.ctx.me();
        const pets = petsOf(me);
        const mine = h.bo === me.id;
        const busy = !!h.par, ready = !!h.egg;
        const eggFrac = busy ? Math.min(1, (h.bt ?? 0) / breedTime(me)) : 0;
        // the egg wobbles when it is ready
        if (this.egg.visible) this.egg.setAngle(ready ? Math.sin(this.t * 9) * 6 : Math.sin(this.t * 2) * 2);
        const k = JSON.stringify([pets.map((p) => [p.id, p.lv, p.traits, p.den, p.nest]), this.selA, this.selB, this.page, h.par, h.egg, Math.floor((h.bt ?? 0) / 2), h.bo, countOf(me, 'treat'), pets.length]);
        if (k === this.key) return;
        this.key = k;
        const g = this.g, li = this.list.inner, pi = this.parents.inner;
        g.clear();
        // the roster
        const pages = Math.max(1, Math.ceil(pets.length / ROWS));
        this.page = Math.min(this.page, pages - 1);
        this.ids = [];
        this.list.setRight(`${pets.length} of ${rosterCap(me)}`);
        for (let i = 0; i < ROWS; i++) {
            const p = pets[this.page * ROWS + i];
            const y = li.y + i * this.rowH;
            if (!p) { this.rowI[i].setVisible(false); this.rowN[i].setText(''); this.rowS[i].setText(''); this.rowT[i].setText(''); this.zones[i].disableInteractive(); continue; }
            this.zones[i].setInteractive();
            this.ids.push(p.id);
            const free = !p.den && p.nest === undefined;
            const chosen = p.id === this.selA || p.id === this.selB;
            rowBox(g, li.x, y, li.w, this.rowH - 4, { on: chosen, off: !free, accent: PAL.blossom });
            const def = spOf(p.sp);
            this.rowI[i].setVisible(true).setTexture(critTex(this.ctx.scene, p.sp), 0).setScale(fitScale(this.ctx.scene, critTex(this.ctx.scene, p.sp), 32, 2)).setAlpha(free ? 1 : 0.4);
            this.win.at(this.rowI[i], li.x + 28, y + this.rowH / 2 - 2);
            this.rowN[i].setText(p.name).setColor(hex(free ? PAL.cream : PAL.pebble));
            this.rowS[i].setText(`${def.name} · Lv ${p.lv}${p.den ? ' · working in a den' : p.nest !== undefined ? ' · in a hatchery' : ''}`).setColor(hex(RARITY_COLORS[def.rarity]));
            this.rowT[i].setText(p.traits.map((t) => TRAITS[t].name).join(' · ') || 'no traits');
        }
        this.pager.set(this.page, pages);
        // the parents
        const A = pets.find((p) => p.id === (busy && h.par ? h.par[0] : this.selA));
        const B = pets.find((p) => p.id === (busy && h.par ? h.par[1] : this.selB));
        [A, B].forEach((p, i) => {
            const cx = pi.x + (i ? pi.w - 70 : 70);
            inset(g, cx - 54, pi.y, 108, 108, PAL.ink, p ? RARITY_COLORS[spOf(p.sp).rarity] : PAL.slate);
            if (p) { this.wellI[i].setVisible(true).setTexture(critTex(this.ctx.scene, p.sp), 0).setScale(fitScale(this.ctx.scene, critTex(this.ctx.scene, p.sp), 72, 4)); this.win.at(this.wellI[i], cx, pi.y + 56); }
            else this.wellI[i].setVisible(false);
            this.wellT[i].setText(p ? `${p.name}\nLv ${p.lv}` : i ? 'Second parent' : 'First parent').setColor(hex(p ? PAL.cream : PAL.slate));
        });
        // the egg
        this.egg.setVisible(busy || ready);
        if (busy || ready) {
            const el = ready ? ELEMENT_COLOR[spOf(h.egg!.sp).element] : PAL.cream;
            this.egg.setTint(el).setScale(5);
            this.win.at(this.egg, pi.x + pi.w / 2, pi.y + 196);
        }
        let infoY = pi.y + 118 + 2 * Math.round(ts('body') * 1.2) + 8;
        if (busy) {
            bar(g, pi.x + 40, pi.y + 232, pi.w - 80, 14, eggFrac, PAL.blossom);
            const left = Math.max(0, Math.ceil(breedTime(me) - (h.bt ?? 0)));
            this.infoT.setText(`An egg is forming… ${clock(left)} to go`);
            infoY = pi.y + 256;
        } else if (ready) {
            this.infoT.setText(mine ? 'The egg is ready! The colour of its shell hints at what is inside.' : 'This egg belongs to someone else.');
            infoY = pi.y + 236;
        } else if (A && B) {
            const sp = A.sp === B.sp ? [spOf(A.sp).name] : [spOf(A.sp).name, spOf(B.sp).name];
            const tr = [...new Set([...A.traits, ...B.traits])];
            this.infoT.setText(`The baby will be ${sp.join(' or ')}${A.sp === B.sp ? '' : ' (even odds)'}, now and then a close relative one step rarer.\nIt may inherit: ${tr.length ? tr.map((t) => TRAITS[t].name).join(', ') : 'nothing (but may come with a new trait)'}.\nTakes about ${Math.round(breedTime(me) / 60 * 10) / 10} minutes.`);
            infoY = pi.y + 118 + 2 * Math.round(ts('body') * 1.2) + 8;
        } else this.infoT.setText('Pick two creatures from the list on the left. They rest in the hatchery while the egg forms, then walk free.');
        this.win.at(this.infoT, pi.x, infoY);
        // the buttons: start, then hatch; or call it off
        const treats = countOf(me, 'treat');
        const full = pets.length >= rosterCap(me);
        const f = this.foot;
        if (ready) {
            f.primary!.setLabel('Hatch it!');
            f.primary!.setEnabled(mine && !full);
            f.setHint(!mine ? 'This egg belongs to someone else.' : full ? 'Your roster is full: make room for the baby first.' : 'Press Hatch it! to meet the baby.', !mine || full ? PAL.berry : PAL.lime);
        } else if (busy) {
            f.primary!.setLabel('Egg forming…');
            f.primary!.setEnabled(false);
            f.setHint(mine ? 'Come back when it is ready, or call it off to get your creatures back.' : 'Someone else is breeding here.');
        } else {
            f.primary!.setLabel(`Start breeding (${BREED_TREATS} treats)`);
            f.primary!.setEnabled(!!A && !!B && treats >= BREED_TREATS && !full);
            f.setHint(`${BREED_TREATS} creature treats are used up each time (you have ${treats}). ${full ? 'Your roster is full: make room for the baby first.' : ''}`, treats < BREED_TREATS || full ? PAL.berry : PAL.pebble);
        }
        const off = f.extras[0];
        off.root.setVisible(busy && mine);
        if (off.zone.input) off.zone.input.enabled = busy && mine;
    }

    destroy () { this.win.destroy(); }
}
