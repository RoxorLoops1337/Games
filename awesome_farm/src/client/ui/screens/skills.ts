// The skill tree: a pannable, zoomable fan of six branches in its own camera viewport.
// Nodes glow when you can afford them, links light up along what you've learned, and
// learning a node bursts sparks in the branch colour.

import * as Phaser from 'phaser';
import { BRANCHES, BRANCH_ORDER, SKILL_LIST, SKILLS, SkillNode, skillPos, SKILL_POINT_TOTAL, UNLOCK_INFO, BranchId } from '../../../shared/data/skills';
import { modLine, StatKey } from '../../../shared/data/stats';
import { PAL } from '../../../shared/palette';
import { canLearn, rankOf } from '../../../shared/sim/stats';
import { button, fit, hex, icon, label, panel, rect, SearchBox, STYLES, tipOn, Win } from '../kit';
import { searchSkills } from '../../../shared/data/skillsearch';
import { PAD, ROW_H, TAB_Y } from '../menukit';
import { inset, notch } from '../px';
import { isTouchUi, physCode } from '../../input/layout';
import { playSfx } from '../../juice/sfx';
import type { Screen, ScreenCtx } from './types';
import { logical, SS } from '../../res';

const OX = 60000, OY = 60000;
// the tree's own camera looks through a hole in the window: window-local 20..916 across and 66..420 down (screen units once the window is placed)
const VW = 896, VH = 354;
const INFO_Y = 430;      // the info strip under the tree (window-local), 74 high
/** How far the baked tree reaches from the hub (the outer ring, the branch labels and their blurbs fit inside). */
const EXTENT = 1120;
type State = 'maxed' | 'learned' | 'afford' | 'avail' | 'locked' | 'fresh';

interface NodeView { n: SkillNode; c: Phaser.GameObjects.Container; g: Phaser.GameObjects.Graphics; im: Phaser.GameObjects.Image; x: number; y: number; state: State; rank: number }

export class SkillScreen implements Screen {
    private win: Win;
    /** Where the hole in the window is, on the screen (the window's own corner plus 20, 66). */
    private readonly vx: number;
    private readonly vy: number;
    private objs: Phaser.GameObjects.GameObject[] = [];
    private cam: Phaser.Cameras.Scene2D.Camera;
    private bgG: Phaser.GameObjects.Graphics;
    private linkG: Phaser.GameObjects.Graphics;
    private glowG: Phaser.GameObjects.Graphics;
    /** The backdrop, the links and every node's frame, drawn once into one texture (a Graphics replays all its commands every frame: on a phone
     *  the tree's thousands of them made the screen lag). Drawn again only when something changes: `bake()`. */
    private tree: Phaser.GameObjects.RenderTexture;
    private treeScale = 1;
    private views = new Map<string, NodeView>();
    private center = { x: 0, y: 0 };
    private zoom = 0.8;
    private pan: Phaser.Tweens.Tween | null = null;
    private dragging: { x: number; y: number } | null = null;
    private ptsT: Phaser.GameObjects.Text;
    private totalT: Phaser.GameObjects.Text;
    private invested = '';
    private infoG: Phaser.GameObjects.Graphics;
    private infoT: Phaser.GameObjects.Text[] = [];
    private infoIcon: Phaser.GameObjects.Image;
    private learnBtn: ReturnType<typeof button>;
    private hovered: string | null = null;
    private selected: string | null = null;
    private key = '';
    private t = 0;
    /** The search box, and the skills it matches (null: nothing typed, everything shows). */
    private search!: SearchBox;
    private found: Set<string> | null = null;
    private spark: Phaser.GameObjects.Particles.ParticleEmitter;
    private handlers: { ev: string; fn: (...a: never[]) => void }[] = [];

    constructor (private ctx: ScreenCtx) {
        const s = ctx.scene;
        const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => { this.objs.push(o); return o; };
        // the window: ribbon, close button top right, the same frame as every other big screen
        this.win = new Win(s, { size: 'large', title: 'Skill tree', icon: 'k_star', accent: PAL.gold, onClose: () => ctx.close() });
        const w = this.win, touch = isTouchUi();
        this.vx = w.x + 20; this.vy = w.y + 66;
        const fg = s.add.graphics();
        w.put(fg, 0, 0);
        inset(fg, 20 - 4, 66 - 4, VW + 8, VH + 8, PAL.ink, PAL.slate);
        // the row of branches (jump to one), then your points at the right; a finger also gets the zoom buttons
        const cw = 88, cg = 3;
        BRANCH_ORDER.forEach((b, i) => {
            const def = BRANCHES[b];
            const chip = button(s, 0, 0, cw, ROW_H, def.name.split(' ')[0], () => this.focusBranch(b), { style: { fill: def.dark, rim: def.color, hi: def.color, lo: PAL.ink }, size: 12, ink: false, icon: def.icon });
            w.put(chip.root, PAD + cw / 2 + i * (cw + cg), TAB_Y);
        });
        this.search = new SearchBox(w, PAD + 6 * (cw + cg) + 6, TAB_Y, touch ? 124 : 170, (q) => this.onSearch(q), 'Find a skill…  ( / )');
        this.ptsT = w.text('', touch ? 778 : w.w - PAD, TAB_Y, 16, PAL.gold, { origin: [1, 0.5], font: 'head' });
        // tree camera + world
        this.cam = s.cameras.add(this.vx * SS, this.vy * SS, VW * SS, VH * SS).setBackgroundColor(0x161520).setAlpha(0);
        this.search.hideFrom(this.cam);
        s.tweens.add({ targets: this.cam, alpha: 1, duration: 160 });
        this.bgG = add(s.add.graphics().setPosition(OX, OY).setDepth(0).setVisible(false));       // (baked into the tree texture)
        this.linkG = add(s.add.graphics().setPosition(OX, OY).setDepth(1).setVisible(false));
        this.glowG = add(s.add.graphics().setPosition(OX, OY).setDepth(2));
        // a phone gets a texture at one pixel per unit (soft when zoomed right in, but light on memory); a computer one and a half
        this.treeScale = touch ? 1 : 1.5;
        const side = Math.ceil(EXTENT * 2 * this.treeScale);
        this.tree = add(s.add.renderTexture(OX - EXTENT, OY - EXTENT, side, side).setOrigin(0).setScale(1 / this.treeScale).setDepth(0));
        this.tree.camera.setOrigin(0, 0).setZoom(this.treeScale).setScroll(OX - EXTENT, OY - EXTENT);
        this.tree.camera.roundPixels = false;
        this.spark = s.add.particles(OX, OY, 'spark', { emitting: false, speed: { min: 40, max: 160 }, angle: { min: 0, max: 360 }, lifespan: 600, scale: { start: 1.2, end: 0 }, alpha: { start: 1, end: 0 } }).setDepth(9);
        this.objs.push(this.spark);
        this.buildBackdrop();
        this.buildNodes(add);
        // info strip: what you are pointing at, and the one button
        this.infoG = s.add.graphics();
        w.put(this.infoG, 0, 0);
        this.totalT = w.text('', w.w - 16 - 14, INFO_Y + 7, fit(11), PAL.pebble, { origin: [1, 0], bold: false });
        this.infoIcon = icon(s, 'k_star', 0, 0, 3);
        w.put(this.infoIcon, 0, 0);
        for (let i = 0; i < 4; i++) this.infoT.push(w.text('', 0, 0, i === 0 ? 16 : 12, PAL.cream, { bold: i === 0, wrap: 640 }));
        this.learnBtn = button(s, 0, 0, touch ? 170 : 150, touch ? 40 : 34, 'Learn', () => { if (this.selected) this.learn(this.selected); }, { style: STYLES.gold, size: touch ? 16 : 14 });
        w.put(this.learnBtn.root, w.w - 16 - 14 - (touch ? 85 : 75), INFO_Y + 50);
        if (touch) {
            // no wheel on a phone: zoom with these, beside the points (the tree's own camera covers the rest of the frame); a drag pans
            const zoomBtn = (x: number, text: string, dir: number) => { const b = button(s, 0, 0, 36, 36, text, () => this.wheel(dir, this.vx + VW / 2, this.vy + VH / 2), { style: STYLES.dark, size: 22, ink: false, sfx: false }); w.put(b.root, x, TAB_Y); };
            zoomBtn(806, '+', -1); zoomBtn(846, '−', 1);
        }
        // input (on a phone a drag may start on a node too: a node takes only a tap)
        const onDown = (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
            if (this.inView(p) && (touch || !over.some((o) => o.getData('skill')))) this.dragging = logical(p);
        };
        const onMove = (p: Phaser.Input.Pointer) => {
            if (!this.dragging || !p.isDown) { this.dragging = null; return; }
            this.pan?.stop();
            const q = logical(p);
            this.center.x -= (q.x - this.dragging.x) / this.zoom;
            this.center.y -= (q.y - this.dragging.y) / this.zoom;
            this.dragging = q;
        };
        const onUp = () => { this.dragging = null; };
        s.input.on('pointerdown', onDown); s.input.on('pointermove', onMove); s.input.on('pointerup', onUp);
        this.handlers.push({ ev: 'pointerdown', fn: onDown as never }, { ev: 'pointermove', fn: onMove as never }, { ev: 'pointerup', fn: onUp as never });
        this.cam.setZoom(this.zoom * SS).centerOn(OX, OY);
        this.center = { x: 0, y: 0 };
        // open on the first branch worth looking at
        this.syncAll();
        const first = SKILL_LIST.find((n) => canLearn(ctx.me(), n.id).ok);
        if (first) { const p = skillPos(first); this.center = { x: p.x * 0.7, y: p.y * 0.7 }; }
    }

    /** Typing in the search box: matching skills stay lit, the rest dim, and the tree glides to the nearest match. */
    private onSearch (q: string) {
        this.found = q ? new Set(searchSkills(q).map((n) => n.id)) : null;
        for (const v of this.views.values()) v.c.setAlpha(!this.found || this.found.has(v.n.id) ? 1 : 0.18);
        this.infoKey = '';
        if (!this.found?.size) return;
        let best: NodeView | null = null, bd = Infinity;
        for (const id of this.found) {
            const v = this.views.get(id)!;
            const d = Math.hypot(v.x - OX - this.center.x, v.y - OY - this.center.y);
            if (d < bd) { bd = d; best = v; }
        }
        if (best) {
            this.pan?.stop();
            this.pan = this.ctx.scene.tweens.add({ targets: this.center, x: best.x - OX, y: best.y - OY, duration: 380, ease: 'Cubic.easeInOut' });
        }
    }

    private inView (p: Phaser.Input.Pointer) { const q = logical(p); return q.x >= this.vx && q.x <= this.vx + VW && q.y >= this.vy && q.y <= this.vy + VH; }

    // ── static scenery ──────────────────────────────────────────────────────
    private buildBackdrop () {
        const g = this.bgG;
        // wedges
        for (const b of BRANCH_ORDER) {
            const def = BRANCHES[b];
            const a0 = ((def.angle - 30) * Math.PI) / 180, a1 = ((def.angle + 30) * Math.PI) / 180;
            const R = 40 + 8.6 * 115;
            const pts: Phaser.Math.Vector2[] = [new Phaser.Math.Vector2(0, 0)];
            for (let i = 0; i <= 24; i++) { const a = a0 + ((a1 - a0) * i) / 24; pts.push(new Phaser.Math.Vector2(Math.cos(a) * R, Math.sin(a) * R)); }
            g.fillStyle(def.dark, 0.2).fillPoints(pts, true);
            g.lineStyle(2, def.color, 0.16).strokePoints(pts, true);
        }
        // ring guides
        for (let u = 1; u <= 8; u++) { g.lineStyle(1, PAL.slate, 0.2).strokeCircle(0, 0, 40 + u * 115); }
        // stardust
        for (let i = 0; i < 260; i++) {
            const a = (i * 2.399963) % (Math.PI * 2), r = 60 + ((i * 37) % 900);
            rect(g, Math.cos(a) * r, Math.sin(a) * r, 2, 2, i % 5 === 0 ? PAL.cream : PAL.slate, i % 5 === 0 ? 0.35 : 0.5);
        }
        // hub
        g.fillStyle(PAL.ink, 1).fillCircle(0, 0, 36);
        g.lineStyle(4, PAL.gold, 1).strokeCircle(0, 0, 34);
        g.lineStyle(2, PAL.gold, 0.35).strokeCircle(0, 0, 44);
    }

    private buildNodes (add: <T extends Phaser.GameObjects.GameObject>(o: T) => T) {
        const s = this.ctx.scene;
        const hub = s.add.image(OX, OY - 2, 'sprout', 0).setScale(3).setDepth(3);
        this.objs.push(hub);
        // branch emblems around the hub and labels at the ends
        for (const b of BRANCH_ORDER) {
            const def = BRANCHES[b];
            const a = (def.angle * Math.PI) / 180;
            const lab = label(s, OX + Math.cos(a) * (40 + 8.55 * 115), OY + Math.sin(a) * (40 + 8.55 * 115), def.name.toUpperCase(), 18, def.color, { origin: [0.5, 0.5], stroke: 3 }).setDepth(3);
            this.objs.push(lab);
            const sub = label(s, lab.x, lab.y + 20, def.blurb, 11, PAL.pebble, { origin: [0.5, 0.5], bold: false, wrap: 220, align: 'center' }).setDepth(3);
            this.objs.push(sub);
        }
        for (const n of SKILL_LIST) {
            const { x, y } = skillPos(n);
            const size = n.key ? 52 : 40;
            const g = add(s.add.graphics().setPosition(OX + x, OY + y).setVisible(false));       // (its frame: baked into the tree texture)
            const im = s.add.image(0, 0, n.icon, 0).setScale(n.icon.startsWith('k_') ? (n.key ? 4 : 3) : (n.key ? 3 : 2));
            const zone = s.add.zone(0, 0, size, size).setInteractive({ useHandCursor: true }).setData('skill', n.id);       // (a drag that starts on a node is a tap, not a pan)
            const c = s.add.container(OX + x, OY + y, [im, zone]).setDepth(4);
            add(c);
            const v: NodeView = { n, c, g, im, x: OX + x, y: OY + y, state: 'fresh', rank: 0 };
            this.views.set(n.id, v);
            zone.on('pointerover', () => { this.hovered = n.id; });
            zone.on('pointerout', () => { if (this.hovered === n.id) this.hovered = null; });
            let down: { x: number; y: number } | null = null;
            zone.on('pointerdown', (p: Phaser.Input.Pointer) => { down = logical(p); });
            zone.on('pointerup', (p: Phaser.Input.Pointer) => {
                if (!down || Math.hypot(logical(p).x - down.x, logical(p).y - down.y) > (isTouchUi() ? 12 : 6)) return;
                down = null;
                this.selected = n.id;
                // a mouse hovers to read, so a click learns; a finger cannot hover: the first tap reads it (and selects it), the Learn button takes it
                if (isTouchUi()) { this.infoKey = ''; playSfx('ui'); } else this.learn(n.id);
            });
        }
        void tipOn;
    }

    // ── state & drawing ─────────────────────────────────────────────────────
    private stateOf (n: SkillNode): State {
        const me = this.ctx.me();
        const r = rankOf(me, n.id);
        if (r >= n.max) return 'maxed';
        if (r > 0) return 'learned';
        const ok = canLearn(me, n.id);
        if (ok.ok) return 'afford';
        return n.req.some((q) => q === 'hub' || rankOf(me, q) > 0) ? 'avail' : 'locked';
    }

    private drawNode (v: NodeView) {
        const { n, g, im } = v;
        const br = BRANCHES[n.branch];
        const size = n.key ? 52 : 40, h = size / 2;
        g.clear();
        const st = v.state;
        const rim = st === 'maxed' ? PAL.gold : st === 'locked' ? PAL.slate : st === 'avail' ? br.dark : br.color;
        const fill = st === 'learned' || st === 'maxed' ? br.dark : st === 'locked' ? PAL.ink : PAL.night;
        notch(g, -h - 3, -h - 3, size + 6, size + 6, PAL.ink, 1, 3);
        notch(g, -h, -h, size, size, rim, 1, 3);
        notch(g, -h + 3, -h + 3, size - 6, size - 6, fill, 1, 2);
        if (st !== 'locked') rect(g, -h + 4, -h + 4, size - 8, 2, 0xffffff, 0.14);
        if (n.key) {
            for (const [dx, dy] of [[-h - 1, -h - 1], [h + 1, -h - 1], [-h - 1, h + 1], [h + 1, h + 1]]) { g.fillStyle(PAL.ink, 1).fillCircle(dx, dy, 5); g.fillStyle(st === 'locked' ? PAL.slate : PAL.gold, 1).fillCircle(dx, dy, 3.5); }
        }
        im.setAlpha(st === 'locked' ? 0.3 : st === 'avail' ? 0.65 : 1);
        if (st === 'locked' || st === 'avail') im.setTint(PAL.pebble).setTintMode(Phaser.TintModes.MULTIPLY); else im.clearTint();
        // rank pips
        if (n.max > 1) {
            if (n.max <= 6) {
                const pw = 5, gap = 2, total = n.max * pw + (n.max - 1) * gap;
                for (let i = 0; i < n.max; i++) {
                    const px = -total / 2 + i * (pw + gap);
                    rect(g, px - 1, h + 5, pw + 2, pw + 2, PAL.ink);
                    rect(g, px, h + 6, pw, pw, i < v.rank ? (st === 'maxed' ? PAL.gold : br.color) : PAL.slate);
                }
            }
        }
    }

    private syncAll () {
        const me = this.ctx.me();
        const linkChanged = [];
        for (const v of this.views.values()) {
            const st = this.stateOf(v.n), r = rankOf(me, v.n.id);
            if (st !== v.state || r !== v.rank) {
                const grew = r > v.rank && v.state !== 'fresh';
                v.state = st; v.rank = r;
                this.drawNode(v);
                linkChanged.push(v.n.id);
                if (grew) this.pop(v);
            }
        }
        if (linkChanged.length || !this.key) { this.drawLinks(); this.bake(); }
        this.ptsT.setText(`★ ${me.points} point${me.points === 1 ? '' : 's'}`);
        const learned = Object.entries(me.skills).reduce((a, [id, r]) => a + (SKILLS[id] ? SKILLS[id].cost * r : 0), 0);
        this.invested = `${learned} / ${SKILL_POINT_TOTAL} points invested in the tree`;
        this.totalT.setText(this.invested).setColor(hex(PAL.pebble));
    }

    /** Draw the backdrop, the links and the node frames into the tree texture (on opening, and when a node changes). */
    private bake () {
        const parts: Phaser.GameObjects.Graphics[] = [this.bgG, this.linkG, ...[...this.views.values()].map((v) => v.g)];
        this.tree.clear();
        for (const g of parts) { g.setVisible(true); this.tree.draw(g); g.setVisible(false); }
        this.tree.render();      // (Phaser 4 queues texture commands until told to run them)
    }

    private drawLinks () {
        const g = this.linkG;
        g.clear();
        for (const v of this.views.values()) {
            const br = BRANCHES[v.n.branch];
            for (const rq of v.n.req) {
                const from = rq === 'hub' ? { x: OX, y: OY, rank: 1, state: 'maxed' as State } : this.views.get(rq);
                if (!from) continue;
                const a = { x: from.x - OX, y: from.y - OY }, b = { x: v.x - OX, y: v.y - OY };
                const learned = from.rank > 0 && v.rank > 0;
                const open = from.rank > 0 && !learned;
                g.lineStyle(7, PAL.ink, 1).lineBetween(a.x, a.y, b.x, b.y);
                if (learned) { g.lineStyle(4, br.color, 1).lineBetween(a.x, a.y, b.x, b.y); g.lineStyle(1, 0xffffff, 0.45).lineBetween(a.x, a.y, b.x, b.y); }
                else if (open) g.lineStyle(3, br.color, 0.55).lineBetween(a.x, a.y, b.x, b.y);
                else g.lineStyle(3, PAL.slate, 0.6).lineBetween(a.x, a.y, b.x, b.y);
            }
        }
    }

    private pop (v: NodeView) {
        const s = this.ctx.scene;
        const br = BRANCHES[v.n.branch];
        s.tweens.add({ targets: v.c, scale: { from: 1.45, to: 1 }, duration: 320, ease: 'Back.easeOut' });
        this.spark.setParticleTint(br.color);
        this.spark.explode(v.state === 'maxed' ? 26 : 14, v.x - OX, v.y - OY);
        this.cam.shake(120, (v.n.key ? 0.008 : 0.004) / (SS * SS));
    }

    private learn (id: string) {
        const n = SKILLS[id];
        const check = canLearn(this.ctx.me(), id);
        if (!check.ok) { this.ctx.toast(check.why, n.icon, PAL.berry); return; }
        this.ctx.send({ t: 'skill', id });
    }

    private focusBranch (b: BranchId) {
        const nodes = SKILL_LIST.filter((n) => n.branch === b);
        const pts = nodes.map(skillPos);
        const tx = pts.reduce((a, p) => a + p.x, 0) / pts.length, ty = pts.reduce((a, p) => a + p.y, 0) / pts.length;
        this.pan?.stop();
        this.pan = this.ctx.scene.tweens.add({ targets: this.center, x: tx, y: ty, duration: 420, ease: 'Cubic.easeInOut' });
        const z = { v: this.zoom };
        this.ctx.scene.tweens.add({ targets: z, v: 0.75, duration: 420, onUpdate: () => { this.zoom = z.v; } });
    }

    wheel (dy: number, x: number, y: number) {
        if (!(x >= this.vx && x <= this.vx + VW && y >= this.vy && y <= this.vy + VH)) return;
        const before = this.cam.getWorldPoint(x * SS, y * SS);
        const nz = Phaser.Math.Clamp(this.zoom * (dy < 0 ? 1.18 : 1 / 1.18), 0.4, 1.7);
        this.zoom = nz;
        this.cam.setZoom(nz * SS);
        this.cam.centerOn(OX + this.center.x, OY + this.center.y);
        const after = this.cam.getWorldPoint(x * SS, y * SS);
        this.center.x += before.x - after.x;
        this.center.y += before.y - after.y;
    }

    onKey (k: string, ev?: KeyboardEvent) {
        const c = physCode(ev);                   // pan with the WASD key positions, whatever the layout
        if (k === '/') { this.search.focus(); return true; }
        if (k === 'Home') { this.focusBranch('gather'); this.center = { x: 0, y: 0 }; return true; }
        if (k === '+' || k === '=') { this.wheel(-1, this.vx + VW / 2, this.vy + VH / 2); return true; }
        if (k === '-') { this.wheel(1, this.vx + VW / 2, this.vy + VH / 2); return true; }
        if (k === 'ArrowLeft' || c === 'KeyA') { this.center.x -= 80 / this.zoom; return true; }
        if (k === 'ArrowRight' || c === 'KeyD') { this.center.x += 80 / this.zoom; return true; }
        if (k === 'ArrowUp' || c === 'KeyW') { this.center.y -= 80 / this.zoom; return true; }
        if (k === 'ArrowDown' || c === 'KeyS') { this.center.y += 80 / this.zoom; return true; }
        return false;
    }

    // ── per frame ───────────────────────────────────────────────────────────
    update (dt: number) {
        this.t += dt;
        const me = this.ctx.me();
        const k = JSON.stringify([me.skills, me.points]);
        if (k !== this.key) { this.syncAll(); this.key = k; this.infoKey = ''; }
        this.cam.setZoom(this.zoom * SS);
        this.cam.centerOn(OX + this.center.x, OY + this.center.y);
        // glow on learnable nodes
        const g = this.glowG;
        g.clear();
        const pulse = 0.5 + 0.5 * Math.sin(this.t * 4);
        const sel = isTouchUi() && this.selected ? this.views.get(this.selected) : undefined;
        if (sel) {      // the node being read: a plain bright frame (the pulsing one means "you can afford it")
            const size = sel.n.key ? 52 : 40;
            g.lineStyle(3, 0xffffff, 0.95).strokeRect(sel.x - OX - size / 2 - 4, sel.y - OY - size / 2 - 4, size + 8, size + 8);
        }
        if (this.found) {
            for (const id of this.found) {
                const v = this.views.get(id)!, size = v.n.key ? 52 : 40;
                g.lineStyle(3, 0xffffff, 0.5 + pulse * 0.5).strokeRect(v.x - OX - size / 2 - 5, v.y - OY - size / 2 - 5, size + 10, size + 10);
            }
        }
        for (const v of this.views.values()) {
            if (v.state !== 'afford') continue;
            const size = v.n.key ? 52 : 40;
            g.lineStyle(3, BRANCHES[v.n.branch].color, 0.35 + pulse * 0.55).strokeRect(v.x - OX - size / 2 - 6 - pulse * 2, v.y - OY - size / 2 - 6 - pulse * 2, size + 12 + pulse * 4, size + 12 + pulse * 4);
        }
        this.drawInfo();
    }

    private infoKey = '';
    private drawInfo () {
        const me = this.ctx.me();
        const id = this.hovered ?? this.selected;
        const k = `${id}|${id ? rankOf(me, id) : 0}|${me.points}`;
        if (k === this.infoKey) return;
        this.infoKey = k;
        const g = this.infoG;
        g.clear();
        const w = this.win, sx = 16, sy = INFO_Y;
        panel(g, sx, sy, 904, 74, { ...STYLES.deep, rim: PAL.night });
        if (!id) {
            this.infoIcon.setVisible(false);
            const touch = isTouchUi();
            this.infoT[0].setText(this.found ? 'Searching the tree' : touch ? 'Tap a skill to read it, tap Learn to take it' : 'Hover a skill to read it — click to learn').setColor(hex(PAL.pebble));
            w.at(this.infoT[0], sx + 24, sy + 14);
            this.infoT[1].setText(this.found ? (this.found.size ? `${this.found.size} skill${this.found.size === 1 ? '' : 's'} match: the tree moved to the nearest one` : 'Nothing matches that') : touch ? 'Drag to pan · + and − zoom · pick a branch above to jump to it' : 'Drag to pan · scroll to zoom · pick a branch above to jump to it').setColor(hex(PAL.pebble));
            w.at(this.infoT[1], sx + 24, sy + 40);
            this.infoT[2].setText(''); this.infoT[3].setText('');
            this.totalT.setText(this.invested).setColor(hex(PAL.pebble));
            this.learnBtn.root.setVisible(false);
            return;
        }
        const n = SKILLS[id], br = BRANCHES[n.branch], rank = rankOf(me, id);
        const check = canLearn(me, id);
        this.infoIcon.setTexture(n.icon, 0).setVisible(true);
        w.at(this.infoIcon, sx + 34, sy + 37);
        inset(g, sx + 12, sy + 10, 44, 54, PAL.deepSea, PAL.slate);
        this.infoT[0].setText(`${n.name}`).setColor(hex(br.color)); w.at(this.infoT[0], sx + 68, sy + 4);
        this.infoT[1].setText(`${br.name} · rank ${rank}/${n.max}${n.key ? ' · keystone' : ''} · ${n.cost} point${n.cost > 1 ? 's' : ''} per rank`).setColor(hex(PAL.pebble)).setFontSize(fit(11)); w.at(this.infoT[1], sx + 68, sy + 4 + Math.ceil(this.infoT[0].height) - 2);
        const fx = [...(n.desc ? [n.desc] : []), ...Object.entries(n.mods ?? {}).map(([k2, v]) => `${modLine(k2 as StatKey, v as number)}${n.max > 1 ? ' per rank' : ''}`), ...(n.unlock ?? []).map((t) => UNLOCK_INFO[t] ?? t)];
        this.infoT[2].setText(fx.join('   ·   ')).setColor(hex(PAL.lime)).setFontSize(fit(12)); w.at(this.infoT[2], sx + 68, sy + 4 + Math.ceil(this.infoT[0].height) - 2 + Math.ceil(this.infoT[1].height) + 1);
        this.infoT[3].setText('');
        // the reason it cannot be learned (or that it is done) takes the place of the running total at the top right
        if (rank >= n.max) this.totalT.setText('Mastered').setColor(hex(PAL.lime));
        else if (!check.ok) this.totalT.setText(check.why).setColor(hex(PAL.berry));
        else this.totalT.setText(this.invested).setColor(hex(PAL.pebble));
        this.learnBtn.root.setVisible(rank < n.max);
        this.learnBtn.setEnabled(check.ok);
        this.learnBtn.setLabel(check.ok ? `Learn  (${n.cost}★)` : 'Locked');
    }

    destroy () {
        const s = this.ctx.scene;
        for (const h of this.handlers) s.input.off(h.ev, h.fn as never);
        this.pan?.stop();
        s.tweens.killTweensOf(this.cam);
        s.cameras.remove(this.cam);
        s.tweens.killTweensOf([...this.views.values()].map((v) => v.c));
        for (const o of this.objs) o.destroy();
        this.search.destroy();
        this.win.destroy();
    }
}

