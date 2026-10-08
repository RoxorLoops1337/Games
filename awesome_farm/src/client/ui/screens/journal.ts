// The Journal: story chapters, side quests, daily bounties, production goals, a factory report, a fish log and medals.
//
// Every tab is the same page: the tabs along the top in a fixed order, a header (what this is for, and a count), the body in a
// well, and one footer row (a hint on the left, the buttons or the pager on the right). Progress is one bar everywhere (gold while
// under way, lime when complete), rewards are one row of chips, and a tab with nothing in it says what to do about that.
// What the footer says for a story step or a quest step is how to do it: hover a step (a computer) or tap it (a phone).

import type * as Phaser from 'phaser';
import { BUILDINGS } from '../../../shared/data/buildings';
import { FISH } from '../../../shared/data/fish';
import { ITEMS, ItemId, iconOf } from '../../../shared/data/items';
import { BOUNTY_POOL, CHAPTERS, GOALS, MEDALS, Reward, type Objective } from '../../../shared/data/quests';
import { GIVERS, QUESTS, type Quest } from '../../../shared/data/sidequests';
import { PAL } from '../../../shared/palette';
import { sunlight } from '../../../shared/daylight';
import { buildPowerGraph, netStats } from '../../../shared/sim/power';
import { MAX_ACTIVE_QUESTS, MAX_TRACKED, availableQuests, bountyHow, bountyProgress, isState, progressOf, qsOf, questDone, stateValue, stepProgress } from '../../../shared/sim/quests';
import { fit, forDevice, Win, type Btn, type TipData } from '../kit';
import { BODY, emptyState, footButton, footHint, Header, PAD, Pager, Pane, TabStrip, type Phase } from '../menukit';
import { inset, rect, STYLES } from '../px';
import { isTouchUi, keyLabel } from '../../input/layout';
import { BRASS, LOCKED, PAPER } from '../theme';
import type { Screen, ScreenCtx } from './types';

type Tab = 'story' | 'quests' | 'bounty' | 'goals' | 'factory' | 'fish' | 'medals' | 'chronicle';
const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: 'story', label: 'Story', icon: 'k_book' }, { id: 'quests', label: 'Quests', icon: 'k_flag' }, { id: 'bounty', label: 'Bounties', icon: 'k_coin' },
    { id: 'goals', label: 'Production', icon: 'k_gear' }, { id: 'factory', label: 'Factory', icon: 'k_drill' }, { id: 'fish', label: 'Fish log', icon: 'k_drop' }, { id: 'medals', label: 'Medals', icon: 'k_crown' }, { id: 'chronicle', label: 'Chronicle', icon: 'k_flag' },
];
const GOALS_PER = 7, MEDALS_PER = 12, FACTORY_ROWS = 5, CHRON_ROWS = 8;

// The page (window-local). The body well is x 16..920, y 108..454; the lists and the detail sit inside it.
const X0 = 24, X1 = 912;                      // inner left and right
const LIST_Y = 112, LIST_H = 334, LIST_W = 232;   // the chapter / quest list column
/** A list row is 21 high with a mouse and 27 under a finger. */
const rowH = () => (isTouchUi() ? 27 : 21);
/** How many rows of `total` show at once: all of them if they fit, otherwise what fits above a little pager. */
const rowsFor = (total: number) => (total * rowH() <= LIST_H ? total : Math.floor((LIST_H - 34) / rowH()));
const DX = X0 + LIST_W + 24, DR = X1 - 8;     // the detail's left edge and right edge (right-aligned numbers end here)
const BAR_W = 170, BAR_X = DR - 70 - BAR_W;   // objective rows: words, then a bar, then "3 / 8"
const STEP_H = 34;
const REWARD_Y = 418;

/** Hints are written in data with {fish} for the fishing key. */
const hintText = (s: string) => s.replace('{fish}', keyLabel('KeyQ'));
const rewardLine = (r: Reward) => [r.coin ? `${r.coin} coins` : '', r.points ? `${r.points} skill point${r.points > 1 ? 's' : ''}` : '', r.xp ? `${r.xp} xp` : ''].filter(Boolean).join('  ·  ');
const phaseOf = (have: number, need: number): Phase => (have >= need ? 'ready' : 'todo');

type Me = ReturnType<ScreenCtx['me']>;

/** How many things are waiting in the Journal: new quests, bounties ready to claim, production goals ready to claim (the phone menu shows it on its tile). */
export function journalAlerts (me: Me, prod: Record<string, number>) {
    const q = qsOf(me);
    return availableQuests(me).length + q.bounties.filter((b) => !b.done && bountyProgress(me, b) >= b.n).length + GOALS.filter((gl) => !q.goals.includes(gl.id) && (prod[gl.item] ?? 0) >= gl.n).length;
}
type Qs = ReturnType<typeof qsOf>;
type World = { plots: import('../../../shared/sim/types').Plot[] };

export class JournalScreen implements Screen {
    private win: Win;
    private pane: Pane;
    private tabs: TabStrip;
    private head: Header;
    private foot: Phaser.GameObjects.Text;
    private pager: Pager;
    private tab: Tab = 'story';
    private sel = -1;                    // story: the chapter being read
    private qSel = '';                   // quests: the quest being read
    private qPage = 0;
    private chPage = 0;                  // story: the page of the chapter list on show (a phone shows fewer rows)
    private page = 0;
    private objSel = -1;                 // the step whose how-to the footer shows (-1: the first one still to do)
    private key = '';
    private baseHint = '';
    private qList: { quest: Quest; state: 'active' | 'new' | 'done' }[] = [];
    private qBtns: Record<'accept' | 'track' | 'abandon', Btn>;

    constructor (private ctx: ScreenCtx, arg: unknown) {
        const s = ctx.scene;
        const a = (arg ?? {}) as { tab?: Tab };
        if (a.tab) this.tab = a.tab;
        this.win = new Win(s, { size: 'large', title: 'Journal', icon: 'k_book', accent: PAL.gold, onClose: () => ctx.close() });
        const w = this.win;
        this.pane = new Pane(w);
        this.tabs = new TabStrip(w, TABS, (id) => { this.tab = id as Tab; this.page = 0; this.objSel = -1; this.key = ''; });
        this.head = new Header(w);
        this.foot = footHint(w, PAD, 640);
        this.pager = new Pager(w, (p) => { if (this.tab === 'story') { this.sel = p; this.objSel = -1; } else this.page = p; this.key = ''; }, { textW: 100 });
        const qb = (label: string, side: 'left' | 'right', wd: number, op: 'accept' | 'track' | 'abandon', style: typeof STYLES.lime, ink?: boolean) => {
            const b = footButton(w, side, wd, label, () => { if (this.qSel) ctx.send({ t: 'quest', op, id: this.qSel }); }, { style, ...(ink === undefined ? {} : { ink }) });
            b.root.setVisible(false);
            return b;
        };
        this.qBtns = { accept: qb('Accept quest', 'right', 200, 'accept', STYLES.gold), track: qb('Pin to screen', 'right', 190, 'track', STYLES.gold), abandon: qb('Give up', 'left', 130, 'abandon', STYLES.berry, false) };
    }

    // ── per frame ───────────────────────────────────────────────────────────
    update () {
        const me = this.ctx.me();
        const q = qsOf(me);
        const world = this.ctx.farm.world;
        const k = JSON.stringify([this.tab, this.sel, this.qSel, this.qPage, this.chPage, this.page, this.objSel, q, me.cnt, me.level, me.coins, me.skills, me.inv, me.pets, me.dex, me.boss, this.ctx.farm.prod(), this.tab === 'factory' ? this.factoryKey() : 0, me.fishlog, this.ctx.farm.chronicle().length]);
        if (k === this.key) return;
        this.key = k;
        this.build(me, q, world);
    }

    private build (me: Me, q: Qs, world: World) {
        const p = this.pane;
        p.clear();
        this.tabs.set(this.tab);
        // badges: what is waiting
        const newQuests = availableQuests(me).length;
        const readyBounty = q.bounties.filter((b) => !b.done && bountyProgress(me, b) >= b.n).length;
        const prod = this.ctx.farm.prod();
        const readyGoals = GOALS.filter((gl) => !q.goals.includes(gl.id) && (prod[gl.item] ?? 0) >= gl.n).length;
        this.tabs.badge('quests', newQuests); this.tabs.badge('bounty', readyBounty); this.tabs.badge('goals', readyGoals);
        p.well(BODY.x, BODY.y, BODY.w, BODY.h);
        Object.values(this.qBtns).forEach((b) => b.root.setVisible(false));
        this.pager.set(0, 1);
        this.setHint('');
        if (this.tab === 'story') this.drawStory(me, q, world);
        else if (this.tab === 'quests') this.drawQuests(me, q, world);
        else if (this.tab === 'bounty') this.drawBounties(me, q);
        else if (this.tab === 'goals') this.drawGoals(q, prod);
        else if (this.tab === 'factory') this.drawFactory();
        else if (this.tab === 'fish') this.drawFish(me);
        else if (this.tab === 'chronicle') this.drawChronicle();
        else this.drawMedals(me, q, world);
    }

    /** The footer's words for now. `wide` leaves the room a button on the left takes. */
    private setHint (text: string, x = PAD, w = 660) {
        this.baseHint = text;
        this.foot.setText(forDevice(text)).setX(Math.round(x - this.win.w / 2)).setWordWrapWidth(w).setMaxLines(2);
    }

    /** A step, a bounty or a medal under the pointer: its words in the footer until the pointer leaves. */
    private hoverHint (text: string) { this.foot.setText(forDevice(text)); }
    private unhover () { this.foot.setText(forDevice(this.baseHint)); }

    // ── lists (chapters, quests) ────────────────────────────────────────────
    private listRow (p: Pane, i: number, selected: boolean, mark: 'done' | 'now' | 'open' | 'locked' | number, text: string, color: number, tip: () => TipData | null, onPick: () => void, dot?: number) {
        const RH = rowH(), y = LIST_Y + i * RH, g = p.g, m = Math.floor((RH - 10) / 2);
        if (selected) { rect(g, X0 - 2, y, LIST_W + 4, RH, PAPER.hi); rect(g, X0 - 2, y, 3, RH, BRASS.mid); rect(g, X0 - 2, y + RH - 1, LIST_W + 4, 1, PAPER.edge); }
        const mc = typeof mark === 'number' ? mark : mark === 'done' ? PAL.lime : mark === 'now' ? BRASS.mid : LOCKED;
        rect(g, X0 + 6, y + m, 10, 10, mc);
        if (mark === 'done') { rect(g, X0 + 8, y + m + 4, 2, 2, PAL.ink); rect(g, X0 + 10, y + m + 6, 4, 2, PAL.ink); }
        p.text(text, X0 + 24, y + (RH - 19) / 2, 13, color, { bold: false });
        if (dot !== undefined) rect(g, X0 + LIST_W - 12, y + m + 1, 7, 7, dot);
        p.zone(X0 - 2, y, LIST_W + 4, RH, tip, onPick);
    }

    /** The little pager under a long list: previous, "2 / 3", next. `step` is called with -1 or +1. */
    private listPager (p: Pane, per: number, page: number, pages: number, step: (d: number) => void) {
        const by = LIST_Y + per * rowH() + 20;
        const mk = (text: string, x: number, d: number, on: boolean) => { const b = p.button(x, by, 44, 28, text, () => step(d), { style: STYLES.dark, size: 12, ink: false }); b.setEnabled(on); };
        mk('◀', X0 + 26, -1, page > 0); mk('▶', X0 + LIST_W - 26, 1, page < pages - 1);
        p.text(`${page + 1} / ${pages}`, X0 + LIST_W / 2, by - 8, 12, PAL.pebble, { origin: [0.5, 0], bold: false });
    }

    /** One step of a chapter or a quest: tick box, words, bar, count. Tap or hover it and the footer says how to do it. */
    private stepRow (p: Pane, y: number, idx: number, o: Objective, have: number, o2: { dim?: boolean; bar?: boolean; hint?: string }) {
        const ok = have >= o.n, g = p.g;
        if (idx === this.objSel) { rect(g, DX - 8, y - 2, DR - DX + 16, STEP_H - 2, PAPER.hi, 0.6); rect(g, DX - 8, y - 2, 3, STEP_H - 2, BRASS.mid); }
        p.check(DX, y + 7, ok);
        p.text(o.text + (o.opt ? '  (optional)' : ''), DX + 28, y + 6, 13, ok ? PAL.pebble : o2.dim ? PAL.slate : PAL.cream, { wrap: BAR_X - DX - 40 });
        if (o2.bar !== false) { p.meter(BAR_X, y + 8, BAR_W, 12, have, o.n, phaseOf(have, o.n)); p.count(DR, y + 6, have, o.n, phaseOf(have, o.n)); }
        const how = `${o.text}: ${hintText(o.how ?? 'Keep playing: this ticks off by itself.')}`;
        p.zone(DX - 8, y - 2, DR - DX + 16, STEP_H - 2, undefined, () => { this.objSel = idx; this.key = ''; }, () => this.hoverHint(how), () => this.unhover());
        return how;
    }

    /** The first step still to do (or the one picked): what the footer explains until the player points at another. */
    private hintFor (steps: Objective[], haves: number[]) {
        let i = this.objSel;
        if (i < 0 || i >= steps.length) { i = haves.findIndex((h, k) => h < steps[k].n); if (i < 0) i = 0; this.objSel = i; }
        return i;
    }

    private rewardBlock (p: Pane, r: Reward) {
        p.rule(DX, REWARD_Y - 13, DR - DX);
        p.reward(DX, REWARD_Y, r);
    }

    // ── story ───────────────────────────────────────────────────────────────
    private drawStory (me: Me, q: Qs, world: World) {
        const p = this.pane, g = p.g, N = CHAPTERS.length;
        if (this.sel < 0 || this.sel >= N) this.sel = Math.min(q.ch, N - 1);
        this.head.set('Story', `${N} chapters take you through the whole game. A chapter pays out the moment every step is ticked.`, `Chapter ${Math.min(q.ch + 1, N)} of ${N}`);
        const per = rowsFor(N), pages = Math.ceil(N / per);
        this.chPage = pages > 1 ? Math.max(0, Math.min(pages - 1, Math.floor(this.sel / per))) : 0;       // (the list follows the chapter being read)
        CHAPTERS.slice(this.chPage * per, (this.chPage + 1) * per).forEach((c, k) => {
            const i = this.chPage * per + k, done = i < q.ch, cur = i === q.ch;
            this.listRow(p, k, i === this.sel, done ? 'done' : cur ? 'now' : 'locked', c.title, done ? PAL.pebble : cur ? PAL.gold : i < q.ch + 2 ? PAL.cream : PAL.slate, () => this.listTip(i), () => { this.sel = i; this.objSel = -1; this.key = ''; });
        });
        if (pages > 1) this.listPager(p, per, this.chPage, pages, (d) => { this.sel = Math.max(0, Math.min(N - 1, this.sel + d * per)); this.objSel = -1; this.key = ''; });
        rect(g, X0 + LIST_W + 6, LIST_Y, 1, 332, PAPER.edge);
        const c = CHAPTERS[this.sel];
        const done = this.sel < q.ch, cur = this.sel === q.ch, locked = this.sel > q.ch;
        p.text(c.title, DX, 114, 20, done ? PAL.lime : cur ? PAL.gold : PAL.cream, { font: 'head' });
        p.text(`Chapter ${this.sel + 1} of ${N}  ·  ${done ? 'Completed' : cur ? 'Current chapter' : `Unlocks after ${CHAPTERS[this.sel - 1].title}`}`, DX, 143, fit(12), done ? PAL.lime : PAL.pebble, { bold: false });
        p.text(c.blurb, DX, 165, fit(12), PAL.cream, { bold: false, wrap: DR - DX });
        p.rule(DX, 206, DR - DX);
        const haves = c.objectives.map((o) => (done ? o.n : progressOf(world, me, o, q.start)));     // what you have already done counts, even in chapters you have not reached
        const hi = this.hintFor(c.objectives, haves);
        let how = '';
        c.objectives.forEach((o, i) => { const hw = this.stepRow(p, 214 + i * STEP_H, i, o, haves[i], { dim: locked }); if (i === hi) how = hw; });
        this.rewardBlock(p, c.reward);
        this.setHint(done ? 'Done: this chapter has been paid out.' : locked ? `Not reached yet: what you have already done still counts.  ${how}` : how, PAD, this.pager.left - PAD - 12);
        this.pager.set(this.sel, N, 'Chapter');
    }

    /** Hover text for a row of the chapter or quest list. */
    private listTip (i: number): TipData | null {
        if (this.tab === 'story') {
            const c = CHAPTERS[i];
            if (!c) return null;
            const q = qsOf(this.ctx.me());
            return { title: c.title, color: PAL.gold, sub: i < q.ch ? 'Completed' : i === q.ch ? 'Current chapter' : 'Not reached yet', lines: [{ t: c.blurb, c: PAL.cream }, { t: `Reward: ${rewardLine(c.reward)}`, c: PAL.gold }] };
        }
        const e = this.qList[this.qPage * rowsFor(this.qList.length) + i];
        if (!e) return null;
        const gv = GIVERS[e.quest.giver];
        return { title: e.quest.title, color: gv.color, sub: `${gv.name}  ·  ${e.state === 'done' ? 'Done' : e.state === 'active' ? 'In progress' : 'Ready to accept'}`, lines: [{ t: e.quest.offer, c: PAL.cream }, { t: `Reward: ${rewardLine(e.quest.reward)}`, c: PAL.gold }] };
    }

    // ── quests ──────────────────────────────────────────────────────────────
    private drawQuests (me: Me, q: Qs, world: World) {
        const p = this.pane, g = p.g;
        const active = (q.log ?? []).map((e) => QUESTS.find((x) => x.id === e.id)).filter((x): x is Quest => !!x);
        const fresh = availableQuests(me);
        const done = QUESTS.filter((x) => q.fin?.includes(x.id));
        this.qList = [...active.map((quest) => ({ quest, state: 'active' as const })), ...fresh.map((quest) => ({ quest, state: 'new' as const })), ...done.map((quest) => ({ quest, state: 'done' as const }))];
        const per = Math.max(1, rowsFor(this.qList.length)), pages = Math.max(1, Math.ceil(this.qList.length / per));
        this.qPage = Math.max(0, Math.min(this.qPage, pages - 1));
        if (!this.qList.some((e) => e.quest.id === this.qSel)) this.qSel = this.qList[0]?.quest.id ?? '';
        this.head.set('Quests', `Errands from the people of the island. Up to ${MAX_ACTIVE_QUESTS} at once; their steps count from the moment you accept.`, `${active.length} active  ·  ${fresh.length} new  ·  ${done.length} done`);
        if (!this.qList.length) {
            emptyState(p, 468, 150, 560, 'k_flag', 'Nobody has asked you for anything yet', 'As you level up, the people of the island will come to you with errands: a gardener, a trader, a creature keeper, an old sailor, a smith and the Night Watcher. New quests show up here, and as a number on this tab.');
            this.setHint('');
            return;
        }
        this.qList.slice(this.qPage * per, (this.qPage + 1) * per).forEach((e, i) => {
            const gv = GIVERS[e.quest.giver];
            this.listRow(p, i, e.quest.id === this.qSel, e.state === 'done' ? 'done' : gv.color, e.quest.title, e.state === 'done' ? PAL.pebble : e.state === 'new' ? PAL.cream : PAL.gold, () => this.listTip(i), () => { this.qSel = e.quest.id; this.objSel = -1; this.key = ''; }, e.state === 'new' ? PAL.berry : e.state === 'active' ? PAL.gold : undefined);
        });
        if (pages > 1) this.listPager(p, per, this.qPage, pages, (d) => { this.qPage += d; this.key = ''; });
        rect(g, X0 + LIST_W + 6, LIST_Y, 1, 332, PAPER.edge);
        const sel = this.qList.find((e) => e.quest.id === this.qSel)!;
        const quest = sel.quest, gv = GIVERS[quest.giver], entry = q.log?.find((x) => x.id === quest.id);
        // who is asking
        inset(g, DX, 114, 52, 52, PAL.ink, gv.color);
        p.icon(gv.icon, DX + 26, 140, 3);
        p.text(gv.name, DX + 64, 118, 14, gv.color, { font: 'head' });
        p.text(gv.role, DX + 64, 140, fit(12), PAL.pebble, { bold: false });
        p.text(sel.state === 'done' ? 'Completed' : sel.state === 'active' ? 'In progress' : 'Ready to accept', DR, 118, 14, sel.state === 'done' ? PAL.lime : sel.state === 'active' ? PAL.gold : PAL.pebble, { origin: [1, 0], font: 'head' });
        p.text(quest.title, DX, 174, 18, sel.state === 'done' ? PAL.lime : PAL.gold, { font: 'head' });
        const quote = p.text(`"${sel.state === 'done' ? quest.thanks : quest.offer}"`, DX, 200, fit(12), PAL.cream, { bold: false, wrap: DR - DX });
        for (let px = parseFloat(String(quote.style.fontSize)); quote.height > 58 && px > 12; ) quote.setFontSize(--px);
        p.rule(DX, 258, DR - DX);
        const haves = quest.steps.map((o) => (sel.state === 'done' ? o.n : entry ? stepProgress(world, me, o, entry.start) : 0));
        const hi = this.hintFor(quest.steps, haves);
        let how = '';
        quest.steps.forEach((o, i) => { const hw = this.stepRow(p, 264 + i * STEP_H, i, o, haves[i], { dim: sel.state === 'new', bar: sel.state !== 'new' }); if (i === hi) how = hw; });
        this.rewardBlock(p, quest.reward);
        // the footer: give up on the left, the one thing to do on the right
        let hx = PAD, hw = 700;
        if (sel.state === 'new') {
            this.qBtns.accept.root.setVisible(true);
            const full = (q.log?.length ?? 0) >= MAX_ACTIVE_QUESTS;
            this.qBtns.accept.setEnabled(!full);
            this.qBtns.accept.setLabel(full ? `Finish one first (${MAX_ACTIVE_QUESTS} at once)` : 'Accept quest');
            hw = 600;
        } else if (sel.state === 'active' && entry) {
            this.qBtns.track.root.setVisible(true); this.qBtns.abandon.root.setVisible(true);
            this.qBtns.track.setLabel(entry.track ? 'Unpin from screen' : 'Pin to screen');
            this.qBtns.track.setEnabled(!!entry.track || (q.log ?? []).filter((x) => x.track).length < MAX_TRACKED);
            hx = PAD + 130 + 14; hw = 520;
        }
        this.setHint(sel.state === 'active' && questDone(world, me, quest, entry!.start) ? 'Done! It pays out in a moment.' : sel.state === 'done' ? 'Done: this quest has been paid out.' : sel.state === 'new' ? `Steps count from the moment you accept.  ${how}` : how, hx, hw);
    }

    // ── bounties ────────────────────────────────────────────────────────────
    private drawBounties (me: Me, q: Qs) {
        const p = this.pane, g = p.g;
        const doneN = q.bounties.filter((b) => b.done).length;
        this.head.set('Daily bounties', 'Errands from your neighbours. New ones every three days, or as soon as you finish them all.', q.bounties.length ? `${doneN} of ${q.bounties.length} done` : '');
        if (!q.bounties.length) {
            emptyState(p, 468, 130, 520, 'k_coin', 'No bounties yet', 'Your neighbours post three new errands every three days, or as soon as you finish all three. Check back soon.');
            this.setHint('');
            return;
        }
        const first = q.bounties.findIndex((b) => !b.done);
        if (this.objSel < 0 || this.objSel >= q.bounties.length) this.objSel = Math.max(0, first);
        let how = '';
        q.bounties.forEach((b, i) => {
            const y = 116 + i * 108, h = 100;
            const have = bountyProgress(me, b), ready = have >= b.n && !b.done;
            p.card(X0, y, X1 - X0, h, { hot: ready, dim: !!b.done });
            if (i === this.objSel) rect(g, X0 + 2, y + 2, 4, h - 4, BRASS.mid);
            const tpl = BOUNTY_POOL.find((t) => t.label(b.n) === b.label);
            const ic = b.item ? iconOf(b.item as ItemId) : tpl?.kind === 'kill' ? 'k_sword' : tpl?.kind === 'tame' ? 'k_paw' : tpl?.kind === 'make' ? 'k_flame' : tpl?.kind === 'crop' ? 'k_sprout' : tpl?.kind === 'harvest' ? 'k_axe' : 'k_anvil';
            inset(g, X0 + 14, y + 20, 60, 60, PAL.ink, PAL.slate);
            p.icon(ic, X0 + 44, y + 50, 3).setAlpha(b.done ? 0.4 : 1);
            p.text(b.label, X0 + 94, y + 14, 17, b.done ? PAL.pebble : PAL.cream, { font: 'head', wrap: 440 });
            p.meter(X0 + 94, y + 48, 360, 14, have, b.n, b.done ? 'done' : phaseOf(have, b.n));
            p.count(X0 + 94 + 360 + 66, y + 47, have, b.n, b.done ? 'done' : phaseOf(have, b.n), 13);
            p.reward(X0 + 94, y + 72, b.reward, { caption: 'Reward' });
            const how1 = `${b.label}: ${bountyHow(b)}${b.key.startsWith('deliver:') ? ' Items are taken from your pockets when you hand in.' : ' Counts from when the bounty appeared.'}`;
            if (i === this.objSel) how = how1;
            // the buttons: one thing to do, one small way to change the errand
            if (b.done) p.text('Done: well done!', X1 - 24, y + 40, 15, PAL.lime, { origin: [1, 0], font: 'head' });
            else {
                const bn = p.button(X1 - 24 - 70, y + 30, 140, 34, b.item ? (ready ? 'Hand in' : 'In progress') : ready ? 'Claim' : 'In progress', () => this.ctx.send({ t: 'quest', op: 'bounty', id: b.id }), { style: ready ? STYLES.lime : STYLES.dark, size: 14, ink: ready });
                bn.setEnabled(ready);
                const can = me.coins >= 25;
                const rr = p.button(X1 - 24 - 70, y + 74, 140, 24, 'Reroll · 25 coins', () => this.ctx.send({ t: 'quest', op: 'reroll', id: b.id }), { style: STYLES.dark, size: 12, ink: false });
                rr.setEnabled(can);
            }
            p.zone(X0, y, X1 - X0 - 160, h, undefined, () => { this.objSel = i; this.key = ''; }, () => this.hoverHint(how1), () => this.unhover());
        });
        this.setHint(how || '');
        void g;
    }

    // ── production goals ────────────────────────────────────────────────────
    private drawGoals (q: Qs, prod: Record<string, number>) {
        const p = this.pane;
        const pages = Math.ceil(GOALS.length / GOALS_PER);
        this.page = Math.min(this.page, pages - 1);
        const claimedN = GOALS.filter((gl) => q.goals.includes(gl.id)).length;
        this.head.set('Production goals', 'Everything your machines make counts. Every farmer can claim each goal once.', `${claimedN} of ${GOALS.length} claimed`);
        const next = GOALS.findIndex((gl) => !q.goals.includes(gl.id) && (prod[gl.item] ?? 0) < gl.n);
        for (let i = 0; i < GOALS_PER; i++) {
            const idx = this.page * GOALS_PER + i, gl = GOALS[idx];
            if (!gl) continue;
            const y = 114 + i * 47, h = 44, x = X0;
            const have = Math.min(gl.n, prod[gl.item] ?? 0), claimed = q.goals.includes(gl.id), ready = have >= gl.n && !claimed;
            p.card(x, y, X1 - X0, h, { hot: ready, gold: idx === next, dim: claimed });
            p.icon(iconOf(gl.item), x + 26, y + h / 2, 2).setAlpha(claimed ? 0.4 : 1);
            p.text(`Make ${gl.n} ${ITEMS[gl.item].name}`, x + 54, y + 5, 13, claimed ? PAL.pebble : PAL.cream, { font: 'head' });
            const ph: Phase = claimed ? 'done' : phaseOf(have, gl.n);
            p.meter(x + 54, y + 26, 330, 12, have, gl.n, ph);
            p.count(x + 54 + 330 + 76, y + 24, have, gl.n, ph);
            p.reward(x + 500, y + 14, gl.reward, { caption: null });
            const bn = p.button(X1 - 14 - 54, y + h / 2, 108, 28, claimed ? 'Claimed' : 'Claim', () => this.ctx.send({ t: 'quest', op: 'goal', id: gl.id }), { style: ready ? STYLES.lime : STYLES.dark, size: 13, ink: ready });
            bn.setEnabled(ready);
        }
        this.setHint('Everything the whole farm\'s machines make counts, not just yours: furnaces, sawmills, assemblers and drills. Hand-crafting does not.', PAD, this.pager.left - PAD - 12);
        this.pager.set(this.page, pages, 'Page');
    }

    // ── factory ─────────────────────────────────────────────────────────────
    /** Something that changes whenever the factory report would: machine states, power and the production totals. */
    private factoryKey () {
        const f = this.ctx.farm;
        return f.buildings().reduce((a, b) => a + (b.act ?? 0) * 7 + b.id, 0) + Math.floor(f.clock.time / 5);
    }

    private drawFactory () {
        const p = this.pane, g = p.g, farm = this.ctx.farm;
        // ── the numbers across the top
        const blds = farm.buildings();
        const machines = blds.filter((b) => BUILDINGS[b.kind].proc || b.kind === 'drill');
        const working = machines.filter((b) => (b.act ?? 0) > 0).length;
        const graph = buildPowerGraph(blds);
        let gen = 0, use = 0, starved = 0;
        for (const net of graph.nets) {
            const st = netStats(net, farm.clock.time, sunlight(farm.clock.clock, farm.clock.nightLen));
            gen += st.gen; use += st.use;
            if (st.use > 0 && st.ratio < 0.99) starved++;
        }
        const belts = blds.filter((b) => b.kind === 'belt').length, inserters = blds.filter((b) => b.kind === 'inserter').length;
        const rates = farm.prodRates();
        const made = rates.filter((r) => r.item !== 'coin').reduce((a, r) => a + r.total, 0);
        this.head.set('Factory report', 'What your machines are making right now. Shared by the whole farm.', machines.length ? `${working} of ${machines.length} machines working` : '');
        const tiles: { big: string; label: string; col: number }[] = [
            { big: `${working} / ${machines.length}`, label: 'machines working', col: working > 0 ? PAL.lime : PAL.pebble },
            { big: use > 0 || gen > 0 ? `${Math.round(gen)} / ${Math.round(use)}` : '—', label: starved ? `power made / used  ·  ${starved} grid${starved > 1 ? 's' : ''} short` : 'power made / used', col: starved ? PAL.berry : gen > 0 ? PAL.gold : PAL.pebble },
            { big: `${belts + inserters}`, label: `belts and inserters (${belts} + ${inserters})`, col: PAL.foam },
            { big: made >= 10000 ? `${(made / 1000).toFixed(1)}k` : `${made}`, label: 'items made, ever', col: PAL.cream },
        ];
        const tw = (X1 - X0 - 3 * 8) / 4;
        tiles.forEach((t, i) => {
            const x = X0 + i * (tw + 8), y = 116;
            p.card(x, y, tw, 58);
            p.text(t.big, x + 12, y + 6, 22, t.col, { font: 'head' });
            p.text(t.label, x + 12, y + 36, fit(11), PAL.pebble, { bold: false, wrap: tw - 20 });
        });
        // ── the list, busiest first
        // (the coins the export chutes pay are kept in the same books under 'coin': they lead the list, as the farm's income per minute)
        const coin = rates.find((r) => r.item === 'coin' && r.total > 0);
        const live = [...(coin ? [coin] : []), ...rates.filter((r) => r.total > 0 && ITEMS[r.item as ItemId])];
        const pages = Math.max(1, Math.ceil(live.length / FACTORY_ROWS));
        this.page = Math.min(this.page, pages - 1);
        if (!live.length) {
            emptyState(p, 468, 190, 620, 'k_drill', 'Nothing has come out of a machine yet', 'Put a drill on an ore vein, feed a furnace with an inserter or a belt, and give them power from a wind turbine. Everything they make shows up here, with how fast it is coming.');
            this.setHint('');
            return;
        }
        const hy = 184, C = { name: 62, rate: 318, hist: 488, total: X1 - 16 };
        p.text('Item', C.name, hy, fit(11), PAL.pebble, { bold: false }); p.text('Per minute', C.rate, hy, fit(11), PAL.pebble, { bold: false });
        p.text('Last few minutes', C.hist, hy, fit(11), PAL.pebble, { bold: false }); p.text('Made in total', C.total, hy, fit(11), PAL.pebble, { origin: [1, 0], bold: false });
        p.rule(X0, hy + 20, X1 - X0);
        const top = Math.max(0.0001, ...live.map((r) => r.perMin));
        for (let j = 0; j < FACTORY_ROWS; j++) {
            const r = live[this.page * FACTORY_ROWS + j];
            if (!r) continue;
            const id = r.item as ItemId, y = hy + 28 + j * 42;
            p.card(X0, y, X1 - X0, 38);
            p.icon(iconOf(id), X0 + 22, y + 19, 2);
            p.text(r.item === 'coin' ? 'Coins from export chutes' : ITEMS[id].name, C.name, y + 9, 14, r.item === 'coin' ? PAL.gold : PAL.cream, { font: 'head' });
            const per = r.perMin;
            p.text(per > 0 ? `${per >= 10 ? Math.round(per) : per.toFixed(1)}${r.item === 'coin' ? ' coins' : ''} / min` : 'idle', C.rate, y + 4, 12, per > 0 ? PAL.lime : PAL.pebble, { bold: false });
            p.meter(C.rate, y + 22, 140, 8, per, top, per > 0 ? 'ready' : 'done');
            // the bars: what was made in each of the last stretches of time
            const mx = Math.max(1, ...r.bars);
            r.bars.forEach((v, k) => {
                const h = v > 0 ? Math.max(2, Math.round((v / mx) * 24)) : 1;
                rect(g, C.hist + k * 6, y + 31 - h, 5, h, v > 0 ? (k === r.bars.length - 1 ? PAL.gold : PAL.leaf) : PAL.slate);
            });
            p.text(`${Math.floor(r.total)}`, C.total, y + 9, 14, r.item === 'coin' ? PAL.gold : PAL.cream, { origin: [1, 0], font: 'head' });
        }
        this.setHint('Updated every few seconds. The bars show what each item made in the last stretches of time; the gold one is now.', PAD, this.pager.left - PAD - 12);
        this.pager.set(this.page, pages, 'Page');
    }

    // ── fish log ────────────────────────────────────────────────────────────
    /** Every kind of fish: a silhouette and a hint until you have caught one, then your best and your count. */
    private drawFish (me: Me) {
        const p = this.pane, g = p.g;
        const log = me.fishlog ?? {};
        const caught = FISH.filter((f) => log[f.id]).length;
        this.head.set('Fish log', `Face open water and press ${keyLabel('KeyQ')} with a rod. Every kind you catch is kept here.`, `${caught} of ${FISH.length} kinds caught`);
        const cw = (X1 - X0 - 3 * 8) / 4, ch = 104;
        FISH.forEach((f, i) => {
            const col = i % 4, row = Math.floor(i / 4);
            const x = X0 + col * (cw + 8), y = 116 + row * (ch + 8);
            const e = log[f.id], it = ITEMS[f.id];
            const rim = e ? [PAL.slate, PAL.lime, PAL.sea, PAL.plum, PAL.gold][f.rarity] : PAL.slate;
            p.card(x, y, cw, ch);
            inset(g, x + 8, y + 8, 56, 56, PAL.ink, rim);
            const im = p.icon(iconOf(f.id), x + 36, y + 36, 3);
            if (!e) im.setTint(PAL.night);
            p.text(e ? it.name : '???', x + 74, y + 8, 14, e ? PAL.cream : PAL.pebble, { font: 'head' });
            if (e) {
                p.text(['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'][f.rarity], x + 74, y + 28, fit(11), [PAL.pebble, PAL.lime, PAL.foam, PAL.blossom, PAL.gold][f.rarity], { bold: false });
                p.text(`Biggest ${e.best} cm\nCaught ${e.n}×`, x + 74, y + 46, fit(12), PAL.cream, { bold: false });
            } else p.text(f.hint, x + 8, y + 70, fit(11), PAL.pebble, { bold: false, wrap: cw - 16 });
        });
        this.setHint(caught >= FISH.length ? 'You have caught every kind. Well fished!' : 'A shadow is a kind you have not caught yet: its hint says where and when to try.');
    }

    // ── medals ──────────────────────────────────────────────────────────────
    private drawMedals (me: Me, q: Qs, world: World) {
        const p = this.pane, g = p.g;
        const pages = Math.ceil(MEDALS.length / MEDALS_PER);
        this.page = Math.min(this.page, pages - 1);
        this.head.set('Medals', 'Long-term feats. Each pays out the moment you earn it.', `${q.medals.length} / ${MEDALS.length} earned`);
        const cw = (X1 - X0 - 3 * 8) / 4, ch = 104;
        for (let i = 0; i < MEDALS_PER; i++) {
            const m = MEDALS[this.page * MEDALS_PER + i];
            if (!m) continue;
            const col = i % 4, row = Math.floor(i / 4);
            const x = X0 + col * (cw + 8), y = 116 + row * (ch + 8);
            const earned = q.medals.includes(m.id);
            const v = m.state || isState(m.key) ? stateValue(world, me, m.key) : me.cnt?.[m.key] ?? 0;
            const have = Math.min(m.n, v);
            p.card(x, y, cw, ch, { gold: earned });
            inset(g, x + 8, y + 8, 40, 40, PAL.ink, PAL.slate);
            p.icon(m.icon, x + 28, y + 28, 2).setAlpha(earned ? 1 : 0.4);
            p.text(m.name, x + 56, y + 7, 13, earned ? PAL.gold : PAL.cream, { font: 'head', wrap: cw - 64 });
            p.text(m.desc, x + 56, y + 27, fit(11), PAL.pebble, { bold: false, wrap: cw - 64 });
            p.meter(x + 8, y + 68, cw - 16, 10, have, m.n, earned ? 'ready' : 'todo');
            p.reward(x + 8, y + 83, m.reward, { caption: null, size: 11, items: false });
            if (earned) p.text('Earned', x + cw - 8, y + 83, 12, PAL.lime, { origin: [1, 0], font: 'head' });
            else p.count(x + cw - 8, y + 83, have, m.n, 'todo', 11);
        }
        this.setHint('Medals pay out the moment you earn them. The bar shows how far along each one is.', PAD, this.pager.left - PAD - 12);
        this.pager.set(this.page, pages, 'Page');
    }

    // ── chronicle ───────────────────────────────────────────────────────────
    /** The farm's story, newest first: the day it happened, an icon, one storybook line. A page of eight; the first page is the newest. */
    private drawChronicle () {
        const p = this.pane, g = p.g;
        const log = this.ctx.farm.chronicle();
        const pages = Math.max(1, Math.ceil(log.length / CHRON_ROWS));
        this.page = Math.min(this.page, pages - 1);
        this.head.set('Farm chronicle', 'The story of your farm, written as it happens: islands raised, bosses felled, nights survived.', `${log.length} ${log.length === 1 ? 'entry' : 'entries'}`);
        if (!log.length) {
            emptyState(p, 468, 130, 560, 'k_flag', 'The first page is still blank', 'Raise land, fell a boss, finish a chapter or live through a Blood Moon, and the farm writes it down here for everyone.');
            this.setHint('Entries are shared: everyone on the farm reads the same story.');
            return;
        }
        const RH = 38, Y0 = 114, newest = log.length - 1 - this.page * CHRON_ROWS;
        let lastDay = -1;
        for (let i = 0; i < CHRON_ROWS; i++) {
            const e = log[newest - i];
            if (!e) break;
            const y = Y0 + i * RH;
            if (i % 2 === 0) rect(g, X0 - 4, y, X1 - X0 + 8, RH - 2, PAPER.hi, 0.35);
            if (e.d !== lastDay) p.text(`Day ${e.d}`, X0 + 6, y + 9, 15, PAL.gold, { font: 'head' });
            lastDay = e.d;
            inset(g, X0 + 84, y + 4, 30, 30, PAL.ink, PAL.slate);
            p.icon(e.i, X0 + 99, y + 19, 1.5);
            p.text(e.t, X0 + 128, y + 5, fit(13), PAL.cream, { wrap: X1 - X0 - 144, bold: false });
        }
        this.setHint('Entries are shared: everyone on the farm reads the same story. Newest first.', PAD, this.pager.left - PAD - 12);
        this.pager.set(this.page, pages, 'Page');
    }

    destroy () { this.win.destroy(); }
}
