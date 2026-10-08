// Top-left stack under the player card: your companion, then the quest tracker.

import { critTex } from '../art/storybook-critters';

import * as Phaser from 'phaser';
import { ELEMENT_COLOR, FIELD_INFO, FIELD_TASKS, PET_MAX_LEVEL, petXpNeed, spOf, WORK_INFO, type Pet, type WorkKind } from '../../shared/data/creatures';
import { levelInfo } from '../../shared/data/bond';
import { CHAPTERS } from '../../shared/data/quests';
import { PAL } from '../../shared/palette';
import { petsOf, taskOk } from '../../shared/sim/creatures';
import { progressOf, qsOf, stepProgress } from '../../shared/sim/quests';
import { GIVERS, QUEST_BY_ID } from '../../shared/data/sidequests';
import type { Cmd, PlayerS } from '../../shared/sim/types';
import type { World } from '../../shared/world';
import { fitScale } from './screens/creatures';
import { logical } from '../res';
import { isTouchUi, keyLabel } from '../input/layout';
import { fit, icon, label, onTap, shrinkToFit, smallScreen, TEXT_SCALE, tipOn, type TipData } from './kit';
import { bar, hex, inset, panel, STYLES } from './px';
import { deepen } from './theme';
import { Baked } from './bake';
import { LEFT, type Rect } from './slots';

/** The slice of the Game scene the card and the tracker read: your farmer, the world (for the tracker's where-to hints) and the line out. */
interface CompanionHost {
    readonly meS: PlayerS | null;
    readonly world: World;
    send (c: Cmd): void;
}

/** The companion card's height. */
const COMP_H = 52;

export class CompanionCard {
    private baked: Baked;
    private g: Phaser.GameObjects.Graphics;
    private face: Phaser.GameObjects.Image;
    private nameT: Phaser.GameObjects.Text;
    private lvT: Phaser.GameObjects.Text;
    private taskI: Phaser.GameObjects.Image;
    private taskZone: Phaser.GameObjects.Zone;
    private shown = '';
    /** y where the next widget in the column may start. */
    bottom = 0;
    /** The card's rectangle while there is one (for things that must keep clear of it). */
    rect: Rect | null = null;

    constructor (private scene: Phaser.Scene, private farm: CompanionHost) {
        // (the farmer card above can be one, two or three rows of hearts tall: this card may start anywhere in this band)
        this.baked = new Baked(scene, 5, 0, 80, 280, 130);
        this.g = this.baked.g;
        this.face = icon(scene, 'px', 0, 0, 2).setDepth(7).setVisible(false);
        this.nameT = label(scene, 0, 0, '', 15, PAL.cream, { font: 'head' }).setDepth(7);
        this.lvT = label(scene, 0, 0, '', 12, PAL.pebble).setDepth(7);
        this.baked.setVisible(false); this.nameT.setVisible(false); this.lvT.setVisible(false);
        // the task button: click to cycle follow → gather → mine → farm → guard
        this.taskI = icon(scene, 'k_paw', 0, 0, 2).setDepth(7).setVisible(false);
        this.taskZone = scene.add.zone(0, 0, 30, 30).setOrigin(0).setInteractive({ useHandCursor: true }).setDepth(8).setVisible(false);
        onTap(this.taskZone, () => this.cycle());
        tipOn(this.taskZone, () => this.tip());
    }

    private pet (): Pet | undefined {
        const me = this.farm.meS;
        return me?.comp ? petsOf(me).find((p) => p.id === me.comp) : undefined;
    }

    private choices (pet: Pet): (WorkKind | undefined)[] { return [undefined, ...FIELD_TASKS.filter((k) => taskOk(pet, k))]; }

    private cycle () {
        const pet = this.pet();
        if (!pet) return;
        const list = this.choices(pet);
        const next = list[(list.indexOf(pet.task) + 1) % list.length];
        this.farm.send({ t: 'pet', op: 'task', pet: pet.id, task: next ?? null });
    }

    private tip (): TipData | null {
        const pet = this.pet();
        if (!pet) return null;
        const list = this.choices(pet);
        const title = pet.task ? `${pet.name}: ${WORK_INFO[pet.task].name} duty` : `${pet.name} stays at your heels`;
        const desc = pet.task ? FIELD_INFO[pet.task] : 'Follows you and fights alongside you. Give it a task to have it work the land around you.';
        const bond = levelInfo(pet);
        const foot = list.length > 1 ? 'Click to change its task  ·  P for the full list' : `${spOf(pet.sp).name} has no field job: open the Creatures screen (P)`;
        return { title, color: pet.task ? WORK_INFO[pet.task].color : PAL.cream, lines: [{ t: desc, c: PAL.cream }, { t: `${bond.level.name}: ${bond.aff} / 100 affection. ${isTouchUi() ? 'Tap USE' : 'Press E'} beside it to pet it.`, c: bond.level.color }], foot };
    }

    /** `top`: where the card starts (just under the farmer card). */
    update (top: number) {
        const me = this.farm.meS;
        const pet = me?.comp ? petsOf(me).find((p) => p.id === me.comp) : undefined;
        if (!pet) { this.baked.setVisible(false); this.face.setVisible(false); this.nameT.setVisible(false); this.lvT.setVisible(false); this.taskI.setVisible(false); this.taskZone.setVisible(false); this.shown = ''; this.bottom = top; this.rect = null; return; }
        this.bottom = top + COMP_H + LEFT.gap;
        this.rect = { x: LEFT.x, y: top, w: LEFT.w, h: COMP_H };
        const sp = spOf(pet.sp);
        const key = `${pet.id}:${pet.lv}:${Math.floor(pet.xp)}:${pet.name}:${pet.task ?? ''}:${pet.aff ?? 0}:${top}`;
        if (key === this.shown) return;
        this.shown = key;
        this.baked.thaw();
        const g = this.g, x = LEFT.x, w = LEFT.w, accent = ELEMENT_COLOR[sp.element], bx = x + 6 + 38 + 10;
        panel(g, x, top, w, COMP_H, { ...STYLES.dark, rim: accent, hi: accent, shadow: true });
        inset(g, x + 6, top + 7, 38, 38, PAL.deepSea, PAL.slate);
        // the task button on the right, with the job in words beside the name
        const tx = x + w - 12 - 30;
        inset(g, tx, top + 10, 30, 30, PAL.night, pet.task ? WORK_INFO[pet.task].color : PAL.slate);
        this.taskI.setVisible(true).setTexture(pet.task ? WORK_INFO[pet.task].icon : 'k_paw', 0).setPosition(tx + 15, top + 25);
        this.taskZone.setVisible(true).setPosition(tx, top + 10);
        this.face.setVisible(true).setTexture(critTex(this.scene, pet.sp), 0).setScale(fitScale(this.scene, critTex(this.scene, pet.sp), 32, 2)).setPosition(x + 25, top + 26);
        this.nameT.setVisible(true).setText(pet.name).setColor(hex(deepen(accent, 0.5))).setPosition(bx, top + 5);
        const bond = levelInfo(pet);
        shrinkToFit(this.lvT.setVisible(true).setText(`Lv ${pet.lv}  ·  ${bond.level.name}  ·  ${pet.task ? `${WORK_INFO[pet.task].name} duty` : 'at heel'}`).setColor(hex(bond.aff >= 40 ? bond.level.color : PAL.pebble)).setPosition(bx, top + 23), tx - bx - 8, 10);
        bar(g, bx, top + 40, tx - bx - 8, 6, pet.lv >= PET_MAX_LEVEL ? 1 : pet.xp / petXpNeed(pet.lv), PAL.blossom);
        this.baked.freeze();
    }
}

interface TrackRow { text: string; p: number; n: number; how?: string; opt?: boolean }
interface TrackSection { title: string; color: number; blurb: string; rows: TrackRow[]; more: number }
const rowKey = (r: TrackRow) => `${r.text}${Math.floor(r.p)}`;

/** The current chapter's open objectives and your pinned quests, always in view. Hover a line for how to do it; click to open the Journal. */
export class QuestTracker {
    private baked: Baked;
    private g: Phaser.GameObjects.Graphics;
    private titles: Phaser.GameObjects.Text[] = [];
    private lines: Phaser.GameObjects.Text[] = [];
    private zone: Phaser.GameObjects.Zone;
    private shown = '';
    /** Where each hoverable row is on screen (logical y), and what it says. */
    private hot: { y0: number; y1: number; tip: TipData }[] = [];
    /** The whole tracker's rectangle while it shows (for things that must keep clear of it). */
    rect: Rect | null = null;

    constructor (scene: Phaser.Scene, private farm: CompanionHost, onClick: () => void) {
        // (it starts under the farmer card, the companion and the party, so anywhere from y = 90 down)
        this.baked = new Baked(scene, 5, 0, 84, 280, 420);
        this.g = this.baked.g;
        for (let i = 0; i < 4; i++) this.titles.push(label(scene, 0, 0, '', 15, PAL.gold, { font: 'head' }).setDepth(7));
        for (let i = 0; i < 12; i++) this.lines.push(label(scene, 0, 0, '', 12, PAL.cream, { bold: false }).setDepth(7));
        this.zone = scene.add.zone(LEFT.x, 0, LEFT.w, 20).setOrigin(0).setInteractive({ useHandCursor: true }).setDepth(8);
        this.zone.on('pointerup', onClick);
        tipOn(this.zone, () => {
            const y = logical(scene.input.activePointer).y;
            return this.hot.find((h) => y >= h.y0 && y < h.y1)?.tip ?? null;
        });
    }

    private sections (): TrackSection[] {
        const me = this.farm.meS!, world = this.farm.world, q = qsOf(me);
        const out: TrackSection[] = [];
        const ch = CHAPTERS[q.ch];
        if (ch) {
            const rows = ch.objectives.map((o): TrackRow => ({ text: o.text, p: progressOf(world, me, o, q.start), n: o.n, how: o.how, opt: o.opt })).filter((r) => r.p < r.n);
            out.push({ title: `${q.ch + 1}. ${ch.title}`, color: PAL.gold, blurb: ch.blurb, rows, more: 0 });
        }
        for (const e of q.log ?? []) {
            if (!e.track) continue;
            const quest = QUEST_BY_ID[e.id];
            if (!quest) continue;
            const rows = quest.steps.map((o): TrackRow => ({ text: o.text, p: stepProgress(world, me, o, e.start), n: o.n, how: o.how, opt: o.opt })).filter((r) => r.p < r.n);
            out.push({ title: quest.title, color: GIVERS[quest.giver].color, blurb: `${GIVERS[quest.giver].name}: ${quest.offer}`, rows, more: 0 });
        }
        return out;
    }

    /**
     * `y0`: where the tracker starts (under the farmer card, the companion and the party). `compact`: one line per section (the coach
     * card is up and says what to do). `limit`: the lowest it may reach; a section that would go past it is left out.
     */
    update (y0: number, compact = false, limit = 470) {
        const me = this.farm.meS;
        if (!me || !this.farm.world) return;
        const secs = this.sections();
        const big = smallScreen();
        const key = `${big}:${y0}:${compact}:${limit}:${secs.map((s) => `${s.title}|${s.rows.map(rowKey).join(',')}`).join('#')}`;
        if (key === this.shown) return;
        this.shown = key;
        this.baked.thaw();
        const g = this.g;
        this.titles.forEach((t) => t.setVisible(false));
        this.lines.forEach((l) => l.setVisible(false));
        this.hot = [];
        if (!secs.length) { this.zone.setVisible(false); this.rect = null; this.baked.freeze(); return; }
        // on a small screen the lines are bigger (and a little further apart); a line that is still too wide shrinks to fit
        const rh = big ? 21 : 16, head = big ? 30 : 26, linePx = Math.round(fit(12) * TEXT_SCALE);
        const line = (l: Phaser.GameObjects.Text, text: string, x: number, y: number) => shrinkToFit(l.setFontSize(linePx).setText(text).setPosition(x, y), LEFT.w - 28, 13);
        const x = LEFT.x, w = LEFT.w;
        let y = y0, li = 0, si = 0;
        for (const sec of secs) {
            // the chapter shows three open objectives (two on a phone), a pinned quest two (one); a compact tracker shows one
            const want = compact ? 1 : si === 0 ? (big ? 2 : 3) : (big ? 1 : 2);
            let show = Math.min(want, sec.rows.length), more = sec.rows.length - show;
            const height = (n: number, m: number) => head + ((n + (m ? 1 : 0)) || 1) * rh + 9;
            if (y + height(show, more) > limit && show > 1) { show = 1; more = sec.rows.length - 1; }
            if (y + height(show, more) > limit && si > 0) break;
            const h = height(show, more);
            panel(g, x, y, w, h, { ...STYLES.dark, rim: si === 0 ? PAL.slate : sec.color, hi: si === 0 ? PAL.dusk : sec.color, shadow: true });
            this.titles[si].setVisible(true).setText(sec.title).setPosition(x + 10, y + 8).setColor(hex(sec.color));
            this.hot.push({ y0: y, y1: y + head, tip: { title: sec.title, color: sec.color, lines: [{ t: sec.blurb, c: PAL.cream }], foot: 'Click to open the Journal' } });
            let ry = y + head + 2;
            for (const r of sec.rows.slice(0, show)) {
                const l = this.lines[li++];
                line(l.setVisible(true).setColor(hex(PAL.cream)), `• ${r.text}  ${Math.floor(r.p)}/${r.n}`, x + 10, ry);
                this.hot.push({ y0: ry - 1, y1: ry + rh - 1, tip: { title: r.text, color: PAL.gold, sub: `${Math.floor(r.p)} / ${r.n}${r.opt ? '  ·  optional' : ''}`, lines: [{ t: (r.how ?? 'Keep playing: this ticks off by itself.').replace('{fish}', keyLabel('KeyQ')), c: PAL.cream }], foot: 'Click to open the Journal' } });
                ry += rh;
            }
            if (more) { const l = this.lines[li++]; line(l.setVisible(true).setColor(hex(PAL.pebble)), `…and ${more} more  ${isTouchUi() ? '(tap)' : '(J)'}`, x + 10, ry); ry += rh; }
            if (!sec.rows.length) { const l = this.lines[li++]; line(l.setVisible(true).setColor(hex(PAL.lime)), si === 0 ? 'All done here: it pays out in a moment' : 'Done: it pays out in a moment', x + 10, ry); }
            y += h + LEFT.gap;
            si++;
        }
        this.zone.setVisible(true).setPosition(x, y0).setSize(w, y - y0 - LEFT.gap);
        this.rect = { x, y: y0, w, h: y - y0 - LEFT.gap };
        this.baked.freeze();
    }
}
