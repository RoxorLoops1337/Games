// The Defense Lab's panel (`?lab=defense`, shared/sim/lab.ts): a small HUD card in the left column, under the farmer card.
// Pick a monster, how many, their level and where they come from, then Send wave; Night, God mode, Mend, Clear, game speed and Reset;
// and a live readout of the wave. Every button sends a developer op (`devdo`, shared/sim/dev.ts) through the normal command path,
// so the panel changes nothing itself. A button in its corner folds it down to one small button and back.

import * as Phaser from 'phaser';
import { LAB_COUNTS, LAB_DIRS, LAB_MOBS, LAB_SPEEDS, type LabReadout } from '../../shared/sim/lab';
import { MAX_LEVEL } from '../../shared/sim/stats';
import type { Cmd } from '../../shared/sim/types';
import { PAL } from '../../shared/palette';
import { button, label, panel, STYLES, type Btn } from './kit';
import { LEFT, type Rect } from './slots';

const MOB_NAMES: Record<string, string> = { slime: 'Slime', skeleton: 'Skeleton', bat: 'Night Bat', boar: 'Tusker', archer: 'Archer', mixed: 'Mixed' };
const DIR_NAMES: Record<string, string> = { n: 'North', e: 'East', s: 'South', w: 'West', sea: 'Sea' };
const LV_NAMES: Record<string, string> = { tower_archer: 'A', ballista: 'B', tesla: 'T' };
const MOB_CHOICES = [...LAB_MOBS, 'mixed'] as const;

export class LabPanel {
    /** Where it is on screen while it shows (published as an obstacle). */
    rect: Rect | null = null;
    private readonly root: Phaser.GameObjects.Container;
    private readonly g: Phaser.GameObjects.Graphics;
    private readonly body: Phaser.GameObjects.Container;
    private readonly fold: Btn;
    private readonly open: Btn;
    private readonly mobB: Btn; private readonly countB: Btn; private readonly dirB: Btn;
    private readonly lvT: Phaser.GameObjects.Text;
    private readonly nightB: Btn; private readonly godB: Btn; private readonly speedB: Btn;
    private readonly readT: Phaser.GameObjects.Text;
    private mob = MOB_CHOICES.length - 1;          // (Mixed)
    private count = 2;                             // (20)
    private dir = LAB_DIRS.indexOf('sea');
    private lv = 3;
    private folded = false;
    private shown = '';
    private readIn = 0;
    private top = -1;
    private readonly h: number;

    constructor (scene: Phaser.Scene, private send: (c: Cmd) => void, private read: () => LabReadout | null, touch: boolean) {
        const w = LEFT.w, pad = 8, gap = touch ? 6 : 5, rh = touch ? 36 : 28, cols = 3;
        const cw = (w - 2 * pad - (cols - 1) * gap) / cols;
        const size = touch ? 14 : 13;
        const head = touch ? 30 : 24;
        const cx = (c: number, span = 1) => pad + c * (cw + gap) + (span * cw + (span - 1) * gap) / 2;
        const ry = (r: number) => head + r * (rh + gap) + rh / 2;
        this.root = scene.add.container(LEFT.x, 0).setDepth(6);
        this.g = scene.add.graphics();
        this.body = scene.add.container(0, 0);
        const mk = (c: number, r: number, span: number, text: string, fn: () => void, style = STYLES.dark) => {
            const b = button(scene, cx(c, span), ry(r), span * cw + (span - 1) * gap, rh, text, fn, { style, size, ink: style === STYLES.dark ? false : undefined });
            this.body.add(b.root);
            return b;
        };
        const title = label(scene, pad + 2, head / 2 + 1, 'Defense Lab', touch ? 17 : 15, PAL.berry, { origin: [0, 0.5], font: 'head' });
        this.body.add(title);
        this.mobB = mk(0, 0, 1, '', () => { this.mob = (this.mob + 1) % MOB_CHOICES.length; this.labels(); });
        this.countB = mk(1, 0, 1, '', () => { this.count = (this.count + 1) % LAB_COUNTS.length; this.labels(); });
        this.dirB = mk(2, 0, 1, '', () => { this.dir = (this.dir + 1) % LAB_DIRS.length; this.labels(); });
        mk(0, 1, 1, '−', () => { this.lv = Math.max(1, this.lv - 1); this.labels(); });
        this.lvT = label(scene, cx(1), ry(1), '', size + 1, PAL.cream, { origin: [0.5, 0.5], font: 'head' });
        this.body.add(this.lvT);
        mk(2, 1, 1, '+', () => { this.lv = Math.min(MAX_LEVEL, this.lv + 1); this.labels(); });
        mk(0, 2, 2, 'Send wave', () => this.send({ t: 'devdo', op: 'labWave', id: MOB_CHOICES[this.mob], n: LAB_COUNTS[this.count], lv: this.lv, who: LAB_DIRS[this.dir] }), STYLES.gold);
        this.nightB = mk(2, 2, 1, 'Day', () => this.send({ t: 'devdo', op: 'labNight', on: !(this.read()?.night ?? false) }));
        this.godB = mk(0, 3, 1, 'God', () => this.send({ t: 'devdo', op: 'god', on: !(this.read()?.god ?? false) }));
        mk(1, 3, 1, 'Mend', () => this.send({ t: 'devdo', op: 'labMend' }));
        mk(2, 3, 1, 'Clear', () => this.send({ t: 'devdo', op: 'labClear' }));
        this.speedB = mk(0, 4, 1, 'x1', () => { const s = this.read()?.speed ?? 1; const i = (LAB_SPEEDS as readonly number[]).indexOf(s); this.send({ t: 'devdo', op: 'labSpeed', n: LAB_SPEEDS[(i + 1) % LAB_SPEEDS.length] }); });
        mk(1, 4, 1, 'Hurt', () => this.send({ t: 'devdo', op: 'labHurt' }));
        mk(2, 4, 1, 'Reset', () => this.send({ t: 'devdo', op: 'labReset' }), STYLES.berry);
        mk(0, 5, 1, 'XP +', () => this.send({ t: 'devdo', op: 'labXp', n: 40 }));
        mk(1, 5, 1, 'Level +', () => this.send({ t: 'devdo', op: 'labXp', id: 'level' }), STYLES.gold);
        mk(2, 5, 1, 'No perks', () => this.send({ t: 'devdo', op: 'labPerks' }));
        const readY = ry(5) + rh / 2 + gap + 2;
        this.readT = label(scene, pad + 2, readY, '', touch ? 13 : 12, PAL.cream, { origin: [0, 0], bold: false });
        this.body.add(this.readT);
        this.h = Math.round(readY + (touch ? 52 : 46) + pad);
        this.root.add([this.g, this.body]);
        panel(this.g, 0, 0, w, this.h, { ...STYLES.dark, rim: PAL.pumpkin, hi: PAL.gold, shadow: true });
        // fold it down to one button (and back)
        const fw = touch ? 40 : 30, fh = touch ? 30 : 20;
        this.fold = button(scene, w - pad - fw / 2, head / 2 + 1, fw, fh, '−', () => this.setFolded(true), { style: STYLES.dark, size, ink: false });
        this.body.add(this.fold.root);
        this.open = button(scene, 46, (touch ? 36 : 28) / 2, 92, touch ? 36 : 28, 'Lab  ▸', () => this.setFolded(false), { style: STYLES.gold, size });
        this.root.add(this.open.root);
        this.open.root.setVisible(false);
        this.labels();
    }

    private setFolded (on: boolean) {
        this.folded = on;
        this.g.setVisible(!on); this.body.setVisible(!on);
        this.open.root.setVisible(on);
        if (this.open.zone.input) this.open.zone.input.enabled = on;
        this.top = -1;
    }

    private labels () {
        this.mobB.setLabel(MOB_NAMES[MOB_CHOICES[this.mob]]);
        this.countB.setLabel(`x${LAB_COUNTS[this.count]}`);
        this.dirB.setLabel(DIR_NAMES[LAB_DIRS[this.dir]]);
        this.lvT.setText(`Level ${this.lv}`);
    }

    /** `top`: the first free row of the left column. `hide`: a window is open. */
    update (dt: number, top: number, hide: boolean) {
        this.root.setVisible(!hide);
        if (hide) { this.rect = null; return; }
        if (Math.round(top) !== this.top) { this.top = Math.round(top); this.root.setY(this.top); }
        this.rect = this.folded ? { x: LEFT.x, y: this.top, w: 92, h: 36 } : { x: LEFT.x, y: this.top, w: LEFT.w, h: this.h };
        if ((this.readIn -= dt) > 0) return;
        this.readIn = 0.25;
        const r = this.read();
        if (!r) return;
        const key = `${r.levels.map((l) => `${l.kind}${l.lv}${l.pending}`).join()}|${r.alive}|${r.towers}|${r.you}|${r.dmg}|${r.broken}|${r.night}|${r.god}|${r.speed}`;
        if (key === this.shown) return;
        this.shown = key;
        this.readT.setText(`Alive ${r.alive}   Towers ${r.towers}   You ${r.you}\nWall damage ${r.dmg}   Broken ${r.broken}\nLevels ${r.levels.map((l) => `${LV_NAMES[l.kind] ?? '?'}${l.lv}${l.pending ? '*' : ''}`).join('  ')}`);
        this.nightB.setLabel(r.night ? 'Night' : 'Day');
        this.nightB.setStyle(r.night ? STYLES.plum : STYLES.dark);
        this.godB.setLabel(r.god ? 'God on' : 'God off');
        this.godB.setStyle(r.god ? STYLES.lime : STYLES.dark);
        this.speedB.setLabel(`Speed x${r.speed}`);
        this.speedB.setStyle(r.speed > 1 ? STYLES.sea : STYLES.dark);
    }
}
