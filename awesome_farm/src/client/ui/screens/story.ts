// The story cards: when a chapter ends (and the next begins) a few short pages are told by whoever is speaking.
// The words appear letter by letter; click, Space or Enter finishes the line, then turns the page.

import type * as Phaser from 'phaser';
import { CHAPTERS } from '../../../shared/data/quests';
import { GIVERS } from '../../../shared/data/sidequests';
import { EPILOGUE, STORY } from '../../../shared/data/story';
import { PAL } from '../../../shared/palette';
import { playSfx } from '../../juice/sfx';
import { button, icon, inset, STYLES, Win } from '../kit';
import { FOOT_H, PAD, SIZE } from '../menukit';
import type { Screen, ScreenCtx } from './types';

interface StoryStep { head: string; sub?: string; speaker: string; text: string }
interface StoryArg { steps: StoryStep[] }

const CPS = 46;

/** The pages for "you finished chapter `ch - 1` and now begin chapter `ch`" (or, past the last one, the epilogue). */
export function storySteps (ch: number): StoryStep[] {
    const out: StoryStep[] = [];
    const prev = CHAPTERS[ch - 1], next = CHAPTERS[ch];
    if (prev) for (const pg of STORY[prev.id]?.outro ?? []) out.push({ head: 'Chapter complete', sub: prev.title, speaker: pg.speaker, text: pg.text });
    if (next) for (const pg of STORY[next.id]?.intro ?? []) out.push({ head: `Chapter ${ch + 1}`, sub: next.title, speaker: pg.speaker, text: pg.text });
    else for (const pg of EPILOGUE) out.push({ head: 'The end, for now', sub: 'Thank you for playing', speaker: pg.speaker, text: pg.text });
    return out;
}

export class StoryScreen implements Screen {
    private win: Win;
    private i = 0;
    private shown = 0;
    private t = 0;
    private gap = 0;
    private body: Phaser.GameObjects.Text;
    private sub: Phaser.GameObjects.Text;
    private who: Phaser.GameObjects.Text;
    private role: Phaser.GameObjects.Text;
    private face: Phaser.GameObjects.Image;
    private frame: Phaser.GameObjects.Graphics;
    private dots: Phaser.GameObjects.Graphics;
    private next: ReturnType<typeof button>;
    private kick: Phaser.GameObjects.Text;

    private arg: StoryArg;

    constructor (private ctx: ScreenCtx, a: unknown) {
        const arg = a as StoryArg;
        this.arg = arg;
        const s = ctx.scene;
        // a medium window: the speaker on the left, the page on the right, the way on at the bottom (Skip left, Next right)
        const M = SIZE.medium;
        this.win = new Win(s, { size: 'medium', title: 'The Story', icon: 'k_book', accent: PAL.gold, onClose: () => this.close() });
        const w = this.win, footY = M.h - 32;
        this.frame = s.add.graphics();
        w.put(this.frame, 0, 0);
        inset(this.frame, PAD, 46, 150, 262, PAL.night, PAL.slate);
        inset(this.frame, PAD + 162, 46, M.w - 2 * PAD - 162, 262, PAL.cream, PAL.wood);
        this.face = icon(s, 'k_book', 0, 0, 5);
        w.put(this.face, PAD + 75, 130);
        this.who = w.text('', PAD + 75, 196, 15, PAL.cream, { origin: [0.5, 0], align: 'center', wrap: 136, font: 'head' });
        this.role = w.text('', PAD + 75, 220, 12, PAL.pebble, { origin: [0.5, 0], align: 'center', wrap: 136, bold: false });
        const tx = PAD + 162 + 16, tw = M.w - 2 * PAD - 162 - 32;
        this.kick = w.text('', tx, 54, 12, PAL.pumpkin, { bold: false });
        this.sub = w.text('', tx, 72, 20, PAL.ink, { font: 'head', wrap: tw });
        this.body = w.text('', tx, 108, 15, PAL.ink, { wrap: tw, bold: false, spacing: 4 });
        this.dots = s.add.graphics();
        w.put(this.dots, 0, 0);
        const skip = button(s, 0, 0, 120, FOOT_H, 'Skip', () => this.close(), { style: STYLES.dark, size: 14, ink: false });
        w.put(skip.root, PAD + 60, footY);
        this.next = button(s, 0, 0, 170, FOOT_H, 'Next', () => this.advance(), { style: STYLES.gold, size: 15 });
        w.put(this.next.root, M.w - PAD - 85, footY);
        this.show(0);
        // anywhere on the card turns the page
        const z = s.add.zone(0, 0, M.w - 2 * PAD - 162, 262).setOrigin(0).setInteractive({ useHandCursor: true });
        w.put(z, PAD + 162, 46);
        z.on('pointerup', () => this.advance());
    }

    private step () { return this.arg.steps[this.i]; }

    private show (i: number) {
        this.i = i;
        const st = this.step();
        const g = GIVERS[st.speaker];
        this.face.setTexture(g ? g.icon : 'k_book', 0);
        this.who.setText(g ? g.name : 'Story');
        this.role.setText(g ? g.role : '');
        this.kick.setText(st.head);
        this.sub.setText(st.sub ?? '');
        this.body.setText('');
        this.shown = 0; this.t = 0; this.gap = 0;
        this.next.setLabel(i === this.arg.steps.length - 1 ? 'Continue' : 'Next');
        const last = this.dots;
        last.clear();
        for (let k = 0; k < this.arg.steps.length; k++) last.fillStyle(k === i ? PAL.gold : PAL.slate, 1).fillCircle(this.win.w / 2 + (k - (this.arg.steps.length - 1) / 2) * 14, this.win.h - 32, k === i ? 4 : 3);
        // a gentle pop on the portrait each time the speaker changes
        this.ctx.scene.tweens.add({ targets: this.face, scale: { from: 4.4, to: 5 }, duration: 200, ease: 'Back.easeOut' });
    }

    private advance () {
        const full = this.step().text;
        if (this.shown < full.length) { this.shown = full.length; this.body.setText(full); return; }
        if (this.i >= this.arg.steps.length - 1) { this.close(); return; }
        playSfx('pop');
        this.show(this.i + 1);
    }

    private close () { this.ctx.close(); }

    onKey (k: string) {
        if (k === 'Enter' || k === ' ' || k === 'e' || k === 'E') { this.advance(); return true; }
        return false;
    }

    update (dt: number) {
        const full = this.step().text;
        if (this.shown >= full.length) return;
        this.t += dt;
        if (this.gap > 0) { this.gap -= dt; return; }
        const want = Math.min(full.length, Math.floor(this.t * CPS));
        if (want > this.shown) {
            const prev = full[want - 1];
            if (want % 3 === 0) playSfx('tick', 1.2 + ((want * 7) % 5) * 0.06);
            this.shown = want;
            this.body.setText(full.slice(0, want));
            if (prev === '.' || prev === '!' || prev === '?') this.gap = 0.28; else if (prev === ',') this.gap = 0.1;
        }
    }

    destroy () { this.win.destroy(); }
}
