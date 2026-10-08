// The guide (H): how to do each thing, step by step. A list of topics on the left (with a search box over it), the chosen page on the right.
// The words live in shared/data/guide.ts; here {move} and {fish} become the player's real keys.
// The last topic is special: Tips, every progression tip this browser has shown so far (shared/data/tips.ts), a page at a time.
// The topic list takes the room it has: it shows every row when they fit and scrolls (arrows, wheel, a finger) when there are more.

import { GUIDE, guideText, type GuideTopic } from '../../../shared/data/guide';
import type { Say } from '../../../shared/data/tutorial';
import { TIPS } from '../../../shared/data/tips';
import { PAL } from '../../../shared/palette';
import { isTouchUi, keyLabel, moveKeys } from '../../input/layout';
import { deviceText, fit, SearchBox, Win } from '../kit';
import { footButton, footHint, Pane } from '../menukit';
import { panel, rect, STYLES } from '../px';
import { seenTips, tutorialApi } from '../tutorial';
import { BRASS, PAPER } from '../theme';
import type { Screen, ScreenCtx } from './types';

/** Only shown on a phone: what the round buttons stand for. */
const TOUCH_TIP = 'On a phone: ACT = Space (harvest, fight), USE = E, EAT = F, FISH = Q, POD = T, TURN = R, REMOVE = hold X, DASH = Shift. BAG and BUILD open those windows; MENU has all the others (Crafting, Skills, Creatures, Journal, map).';

const subst = (s: Say) => guideText(s, isTouchUi(), { move: moveKeys(), fish: keyLabel('KeyQ') });

/** The Tips page is not in the shared guide data: what it holds depends on what this browser has seen. */
const TIPS_TOPIC: GuideTopic = { id: 'tips', name: 'Tips', icon: 'k_star', blurb: 'Hints that pop up as the game opens out. Every one you have met is kept here.', steps: [], tips: [] };
const TOPICS: GuideTopic[] = [...GUIDE, TIPS_TOPIC];

// window-local geometry: the topic list on the left, the page on the right, both 420 high under the window's ribbon
const LIST = { x: 16, y: 64, w: 224, h: 392 };
const PAGE = { x: 252, y: 36, w: 668, h: 420 };

export class GuideScreen implements Screen {
    private win: Win;
    private list: Pane;
    private pane: Pane;
    private search: SearchBox;
    private cur = 0;
    private tipPage = 0;
    /** Which page of a topic's steps is open: a phone's bigger words can run past the bottom, so the steps then come a page at a time. */
    private stepPage = 0;
    private offset = 0;
    /** Which topics the search lets through, and the rows shown (all of them unless the list has to scroll). */
    private shown: number[] = [];
    private pitch: number;
    private rows: number;
    private arrowH: number;
    private touch = isTouchUi();

    constructor (private ctx: ScreenCtx, arg?: unknown) {
        const s = ctx.scene, touch = this.touch;
        this.win = new Win(s, { size: 'large', title: 'How to play', icon: 'k_book', accent: PAL.lime, onClose: () => ctx.close() });
        const w = this.win;
        this.list = new Pane(w);
        this.pane = new Pane(w);
        this.arrowH = touch ? 30 : 0;
        // every topic fits at a readable size on a computer; a finger needs bigger rows, so there the list scrolls
        this.pitch = touch ? 38 : Math.floor((LIST.h - 8) / TOPICS.length);
        this.rows = touch ? Math.max(1, Math.floor((LIST.h - 12 - 2 * this.arrowH) / this.pitch)) : TOPICS.length;
        this.search = new SearchBox(w, LIST.x, 44, LIST.w, () => { this.offset = 0; this.refilter(); }, deviceText('Search the guide  ( / )', 'Search the guide'));
        if (touch) this.search.el.style.height = '34px';       // (a finger needs a taller field)
        footButton(w, 'right', 200, 'Back to the game', () => ctx.close(), { style: STYLES.gold });
        footButton(w, 'left', 176, 'Replay tutorial', () => { tutorialApi.replay(); ctx.close(); }, { style: STYLES.lime });
        footHint(w, w.w / 2, 380, true).setText(deviceText('Up / Down: next topic\nPress / to search', 'Tap a topic to read it\nDrag the list to scroll'));
        const want = (arg as { topic?: string } | undefined)?.topic;
        const at = want ? TOPICS.findIndex((t) => t.id === want) : -1;
        this.cur = at >= 0 ? at : 0;
        this.refilter();
    }

    focusSearch () { this.search.focus(); }

    // ── the topic list ──────────────────────────────────────────────────────
    /** Topics that match the search (all of them with nothing typed): by name, and by what their page says. */
    private refilter () {
        this.shown = TOPICS.map((_, i) => i).filter((i) => {
            const t = TOPICS[i];
            return this.search.matches(t.name, t.blurb, ...t.steps.map(subst), ...t.tips.map(subst));
        });
        if (this.shown.length && !this.shown.includes(this.cur)) this.cur = this.shown[0];
        this.show(this.cur);
    }

    private scrolls () { return this.touch && this.shown.length > this.rows; }

    private drawList () {
        const L = this.list, g = L.g;
        L.clear();
        L.well(LIST.x, LIST.y, LIST.w, LIST.h);
        const scroll = this.scrolls(), rows = scroll ? this.rows : this.shown.length;
        const pos = this.shown.indexOf(this.cur);
        if (pos >= 0) { if (pos < this.offset) this.offset = pos; if (pos >= this.offset + rows) this.offset = pos - rows + 1; }
        this.offset = Math.max(0, Math.min(Math.max(0, this.shown.length - rows), this.offset));
        const top = LIST.y + (scroll ? 6 + this.arrowH : 5);
        if (!this.shown.length) { L.text('No topic mentions that.\nTry another word.', LIST.x + LIST.w / 2, LIST.y + 24, fit(12), PAL.pebble, { origin: [0.5, 0], align: 'center', bold: false }); return; }
        this.shown.slice(this.offset, this.offset + rows).forEach((ti, k) => {
            const t = TOPICS[ti], y = top + k * this.pitch, on = ti === this.cur;
            if (on) { rect(g, LIST.x + 4, y, LIST.w - 8, this.pitch - 1, PAPER.hi); rect(g, LIST.x + 4, y, 3, this.pitch - 1, BRASS.mid); rect(g, LIST.x + 4, y + this.pitch - 1, LIST.w - 8, 1, PAPER.edge); }
            L.icon(this.win.scene.textures.exists(t.icon) ? t.icon : 'k_star', LIST.x + 20, y + this.pitch / 2, 1);
            L.text(t.name, LIST.x + 36, y + (this.pitch - 17) / 2, this.pitch < 24 ? 12 : 13, on ? PAL.gold : PAL.cream, { bold: false });
            L.zone(LIST.x + 4, y, LIST.w - 8, this.pitch - 1, undefined, () => this.show(ti));
        });
        if (scroll) {
            const mk = (text: string, y: number, d: number, enabled: boolean) => { const b = L.button(LIST.x + LIST.w / 2, y, LIST.w - 16, this.arrowH - 2, text, () => { this.offset += d * Math.max(1, rows - 1); this.drawList(); }, { style: STYLES.dark, size: 12, ink: false }); b.setEnabled(enabled); };
            mk('▲', LIST.y + 6 + this.arrowH / 2 - 1, -1, this.offset > 0);
            mk('▼', LIST.y + LIST.h - 6 - this.arrowH / 2 + 1, 1, this.offset + rows < this.shown.length);
        }
    }

    // ── the page ────────────────────────────────────────────────────────────
    private show (i: number) {
        const was = this.cur;
        this.cur = (i + TOPICS.length) % TOPICS.length;
        if (this.cur !== was) this.stepPage = 0;
        this.drawList();
        const P = this.pane;
        const attempt = (draw: () => boolean) => { P.clear(); P.well(PAGE.x, PAGE.y, PAGE.w, PAGE.h); return draw(); };
        if (!this.shown.length) { attempt(() => true); P.text('Nothing to show', PAGE.x + PAGE.w / 2, PAGE.y + 160, 16, PAL.gold, { origin: [0.5, 0], font: 'head' }); return; }
        if (TOPICS[this.cur].id === 'tips') { attempt(() => true); this.layoutTips(); return; }
        // the page must fit its panel: try the biggest text first (a phone gets bigger text), then a notch smaller until it does;
        // when even that runs past the bottom (a phone keeps its words readable), the steps come a page at a time
        const floor = this.touch ? Math.max(11, fit(13) - 1) : 11;
        let done = false;
        for (let size = fit(13); size >= floor && !done; size--) done = attempt(() => this.layout(TOPICS[this.cur], size));
        if (!done) attempt(() => this.layout(TOPICS[this.cur], floor, true));
    }

    /** The page's title block: its picture, name, one line about it, where it is in the list. */
    private header (t: GuideTopic, blurb: string, x0: number) {
        const P = this.pane;
        P.icon(this.win.scene.textures.exists(t.icon) ? t.icon : 'k_star', x0 + 14, PAGE.y + 32, 3);
        P.text(t.name, x0 + 44, PAGE.y + 12, 22, PAL.gold, { font: 'head' });
        P.text(`Topic ${this.cur + 1} of ${TOPICS.length}`, PAGE.x + PAGE.w - 16, PAGE.y + 16, 12, PAL.pebble, { origin: [1, 0], bold: false });
        return P.text(blurb, x0 + 44, PAGE.y + 42, fit(12), PAL.pebble, { bold: false, wrap: PAGE.w - 110 });
    }

    /** Lay the page out at one text size; false when it ran past the bottom of the panel. With `paged`, what does not fit goes on
     *  further pages instead (the tips keep the bottom of the last page, or a page of their own when the steps leave no room). */
    private layout (t: GuideTopic, size: number, paged = false): boolean {
        const P = this.pane, g = P.g;
        const x0 = PAGE.x + 18, wrap = PAGE.w - 70, small = Math.max(11, size - 2);
        const blurb = this.header(t, subst(t.blurb), x0);
        const top = PAGE.y + 42 + Math.max(16, Math.ceil(blurb.height)) + 10;
        P.rule(x0, top, PAGE.w - 36);
        const bottom = PAGE.y + PAGE.h - 14;
        // measure first: every step and every tip at this size (the tips hang at the bottom of the page)
        const steps = t.steps.map((raw) => P.text(subst(raw), x0 + 34, 0, size, PAL.cream, { bold: false, wrap }));
        const hs = steps.map((tx) => Math.max(20, Math.ceil(tx.height)) + 9);
        const tips = [...t.tips, ...(t.id === 'start' && this.touch ? [TOUCH_TIP] : [])].map(subst).map((raw) => P.text(`${raw.startsWith('Tip') ? '' : '★ '}${raw}`, x0, 0, small, PAL.lime, { bold: false, wrap: PAGE.w - 36 }));
        let tipH = 0;
        for (const tp of tips) tipH += Math.ceil(tp.height) + 3;
        const y0 = top + 12;
        if (!paged && y0 + hs.reduce((a, b) => a + b, 0) > bottom - tipH) return false;
        // the pages: steps fill from the top; a pager row at the bottom takes its line when there is more than one page
        const pagerH = this.touch ? 40 : 30, room = bottom - y0 - (paged ? pagerH : 0);
        const pages: number[][] = [[]];
        let used = 0;
        hs.forEach((h, n) => {
            if (pages[pages.length - 1].length && used + h > room) { pages.push([]); used = 0; }
            pages[pages.length - 1].push(n); used += h;
        });
        if (paged && tips.length && pages[pages.length - 1].reduce((a, n) => a + hs[n], 0) + tipH + 8 > room) pages.push([]);
        const np = pages.length;
        this.stepPage = Math.max(0, Math.min(np - 1, this.stepPage));
        const page = pages[this.stepPage], last = this.stepPage === np - 1;
        // this page's steps; the others stay out of sight
        let y = y0;
        steps.forEach((tx, n) => {
            if (!page.includes(n)) { tx.setVisible(false); return; }
            this.win.at(tx, x0 + 34, y);
            panel(g, x0, y - 2, 24, 22, { ...STYLES.dark, r: 2 });
            P.text(String(n + 1), x0 + 12, y + 9, 12, PAL.gold, { origin: [0.5, 0.5] });
            y += hs[n];
        });
        // the tips, on the last page
        let ty = PAGE.y + PAGE.h - 10 - (np > 1 ? pagerH : 0) - tipH;
        if (tips.length && last) P.rule(x0, ty - 6, PAGE.w - 36);
        for (const tp of tips) { tp.setVisible(last); this.win.at(tp, x0, ty); ty += Math.ceil(tp.height) + 3; }
        if (np > 1) {
            const by = PAGE.y + PAGE.h - 20, bw = this.touch ? 100 : 84, bh = this.touch ? 36 : 26;
            P.button(PAGE.x + PAGE.w / 2 - 70, by, bw, bh, '‹ Back', () => { this.stepPage = (this.stepPage + np - 1) % np; this.show(this.cur); }, { style: STYLES.dark, size: 12, ink: false });
            P.button(PAGE.x + PAGE.w / 2 + 70, by, bw, bh, 'More ›', () => { this.stepPage = (this.stepPage + 1) % np; this.show(this.cur); }, { style: STYLES.dark, size: 12, ink: false });
            P.text(`${this.stepPage + 1} / ${np}`, PAGE.x + PAGE.w / 2, by, 12, PAL.pebble, { origin: [0.5, 0.5], bold: false });
        }
        return true;
    }

    /** The Tips page: the tips you have met, a few to a page. */
    private layoutTips () {
        const P = this.pane, g = P.g, s = this.ctx.scene, touch = this.touch;
        const x0 = PAGE.x + 18, seen = seenTips();
        const roomy = PAGE.h > 400, perPage = roomy ? 3 : 5, rowH = roomy ? 100 : 58, size = roomy ? fit(11) : 11;
        this.header(TIPS_TOPIC, `You have met ${seen.length} of ${TIPS.length}. The rest turn up as you play.`, x0);
        const on = tutorialApi.tipsOn();
        const sw = P.button(PAGE.x + PAGE.w - (touch ? 90 : 80), PAGE.y + 50, touch ? 130 : 120, touch ? 36 : 28, on ? 'Tips: On' : 'Tips: Off', () => { tutorialApi.setTips(!tutorialApi.tipsOn()); this.show(this.cur); }, { style: on ? STYLES.lime : STYLES.dark, size: 13, ink: on });
        void sw;
        const pages = Math.max(1, Math.ceil(seen.length / perPage));
        this.tipPage = Math.max(0, Math.min(pages - 1, this.tipPage));
        P.rule(x0, PAGE.y + 72, PAGE.w - 36);
        if (!seen.length) P.text('Nothing yet. Keep playing: a small card pops up at the top of the screen when something new matters.\n\nTips you have met are kept here, so you can read them again.', x0 + 8, PAGE.y + 96, fit(13), PAL.cream, { bold: false, wrap: PAGE.w - 60 });
        seen.slice(this.tipPage * perPage, (this.tipPage + 1) * perPage).forEach((t, i) => {
            const y = PAGE.y + 84 + i * rowH;
            panel(g, x0 - 6, y - 4, PAGE.w - 24, rowH - 4, { ...STYLES.dark, rim: t.color ?? PAL.sea, r: 2 });
            P.icon(s.textures.exists(t.icon) ? t.icon : 'k_star', x0 + 18, y + rowH / 2 - 6, 2);
            P.text(t.title, x0 + 44, y, roomy ? fit(13) : 13, PAL.gold);
            P.text(t.text, x0 + 44, y + (roomy ? 22 : 17), size, PAL.cream, { bold: false, wrap: PAGE.w - 100 });
        });
        if (pages > 1) {
            const by = PAGE.y + PAGE.h - 20, bw = touch ? 100 : 84;
            P.button(PAGE.x + PAGE.w / 2 - 70, by, bw, touch ? 36 : 26, '‹ Back', () => { this.tipPage = (this.tipPage + pages - 1) % pages; this.show(this.cur); }, { style: STYLES.dark, size: 12, ink: false });
            P.button(PAGE.x + PAGE.w / 2 + 70, by, bw, touch ? 36 : 26, 'More ›', () => { this.tipPage = (this.tipPage + 1) % pages; this.show(this.cur); }, { style: STYLES.dark, size: 12, ink: false });
            P.text(`${this.tipPage + 1} / ${pages}`, PAGE.x + PAGE.w / 2, by, 12, PAL.pebble, { origin: [0.5, 0.5], bold: false });
        }
    }

    wheel (dy: number) {
        if (!this.scrolls()) return;
        this.offset += dy > 0 ? 1 : -1;
        this.drawList();
    }

    onKey (k: string) {
        const step = (d: number) => {
            if (!this.shown.length) return;
            const at = this.shown.indexOf(this.cur);
            this.show(this.shown[(at + d + this.shown.length) % this.shown.length]);
        };
        if (k === 'ArrowDown' || k === 'ArrowRight') { step(1); return true; }
        if (k === 'ArrowUp' || k === 'ArrowLeft') { step(-1); return true; }
        if (k === 'h' || k === 'H') { this.ctx.close(); return true; }
        return false;
    }

    update () { /* static */ }
    destroy () { this.search.destroy(); this.win.destroy(); }
}

