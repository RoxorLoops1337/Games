// A phone's controls: the stick (any touch in the lower left), the thumb cluster (ACT, USE, EAT, DASH) and the context
// buttons that come and go with what you can do (FISH/TURN, POD/CANCEL, REMOVE), plus the pinch that zooms. Where each one
// sits is ui/slots.ts (THUMB); they write straight into the Game scene's `touch`.

import * as Phaser from 'phaser';
import { VIEW_H } from '../../shared/config';
import { PAL } from '../../shared/palette';
import { logical, SS } from '../res';
import { label } from './kit';
import { slots, stickZone, THUMB } from './slots';
import { BRASS, PAPER, TEXT, WOOD } from './theme';

/** The slice of the Game scene the controls drive: the touch state the stick and the held buttons write, and the one-shot actions. */
interface TouchHost {
    readonly ready: boolean;
    readonly touch: { mx: number; my: number; act: boolean; use: boolean; dem: boolean };
    /** Which context buttons apply right now. */
    touchContext (): { fish: string; pod: boolean; turn: boolean; cancel: boolean; take: boolean; dash: boolean };
    zoomBy (dir: number): void;
    interact (): void;
    eat (): void;
    fishKey (): void;
    throwPod (): void;
    turnPlacing (): void;
    cancelTools (): void;
    dash (): void;
}

type RoundBtn = { c: Phaser.GameObjects.Arc; t: Phaser.GameObjects.Text };

export class TouchControls {
    private btns: Record<'fish' | 'pod' | 'turn' | 'cancel' | 'take' | 'dash', RoundBtn>;
    /** The touch area that grabs a finger for the stick: the lower left, until a building is in hand (then only round the stick, so the ground there can be tapped). */
    private stickZone: Phaser.GameObjects.Zone;
    private stickWide = true;

    constructor (scene: Phaser.Scene, private farm: TouchHost, private screenOpen: () => boolean) {
        const s = scene;
        s.input.addPointer(2);
        // pinch: two fingers moving apart or together zoom in or out (a finger on the stick does not count)
        let pinch = 0;
        s.input.on('pointermove', () => {
            const a = s.input.pointer1, b = s.input.pointer2;
            if (!a?.isDown || !b?.isDown || this.screenOpen()) { pinch = 0; return; }
            const d = Math.hypot(a.x - b.x, a.y - b.y) / SS;
            if (!pinch) { pinch = d; return; }
            if (d > pinch * 1.25) { farm.zoomBy(1); pinch = d; } else if (d < pinch * 0.8) { farm.zoomBy(-1); pinch = d; }
        });
        s.input.on('pointerup', () => { pinch = 0; });
        const base = s.add.circle(120, VIEW_H - 120, 56, WOOD[0], 0.3).setStrokeStyle(5, PAPER.base, 0.75);
        const knob = s.add.circle(base.x, base.y, 26, PAPER.base, 0.88).setStrokeStyle(4, WOOD[1], 0.9);
        let stickId = -1;
        const z = stickZone(true);
        const stick = s.add.zone(z.x, z.y, z.w, z.h).setOrigin(0).setInteractive().setData('stick', true);
        this.stickZone = stick;
        slots.set('stick', z);
        stick.on('pointerdown', (p: Phaser.Input.Pointer) => {
            stickId = p.id;
            const q = logical(p);
            base.setPosition(q.x, q.y);
            knob.setPosition(q.x, q.y);
        });
        s.input.on('pointermove', (p: Phaser.Input.Pointer) => {
            if (p.id !== stickId) return;
            const q = logical(p), dx = q.x - base.x, dy = q.y - base.y, d = Math.hypot(dx, dy), m = Math.min(d, 50);
            knob.setPosition(base.x + (dx / (d || 1)) * m, base.y + (dy / (d || 1)) * m);
            farm.touch.mx = (dx / (d || 1)) * (m / 50);
            farm.touch.my = (dy / (d || 1)) * (m / 50);
        });
        s.input.on('pointerup', (p: Phaser.Input.Pointer) => {
            if (p.id !== stickId) return;
            stickId = -1;
            knob.setPosition(base.x, base.y);
            farm.touch.mx = 0; farm.touch.my = 0;
        });
        const round = (x: number, y: number, r: number, text: string, fill: number, down: () => void, up?: () => void, size = r > 40 ? 20 : 14): RoundBtn => {
            const c = s.add.circle(x, y, r, fill, 0.9).setStrokeStyle(5, WOOD[0]).setInteractive();
            const t = label(s, x, y, text, size, TEXT.ink, { origin: [0.5, 0.5], dark: true, font: 'head', shadow: false });
            c.on('pointerdown', () => { c.setScale(0.9); down(); });
            const release = () => { c.setScale(1); up?.(); };
            c.on('pointerup', release);
            c.on('pointerout', release);
            return { c, t };
        };
        // (where each one is lives in ui/slots.ts: THUMB)
        const T = THUMB;
        round(T.act.x, T.act.y, T.act.r, 'ACT', BRASS.mid, () => { farm.touch.act = true; }, () => { farm.touch.act = false; });
        round(T.use.x, T.use.y, T.use.r, 'USE', PAPER.base, () => { farm.touch.use = true; farm.interact(); }, () => { farm.touch.use = false; }, 16);
        round(T.eat.x, T.eat.y, T.eat.r, 'EAT', PAL.blossom, () => farm.eat(), undefined, 15);
        // buttons that come and go with what you can do right here: fishing, pods, placing, dismantling, dashing
        this.btns = {
            fish: round(T.fish.x, T.fish.y, T.fish.r, 'FISH', PAL.foam, () => farm.fishKey(), undefined, 15),
            pod: round(T.pod.x, T.pod.y, T.pod.r, 'POD', PAL.blossom, () => farm.throwPod(), undefined, 14),
            turn: round(T.turn.x, T.turn.y, T.turn.r, 'TURN', BRASS.mid, () => farm.turnPlacing(), undefined, 14),
            cancel: round(T.cancel.x, T.cancel.y, T.cancel.r, 'CANCEL', PAL.berry, () => farm.cancelTools(), undefined, 12),
            take: round(T.take.x, T.take.y, T.take.r, 'REMOVE', PAL.pumpkin, () => { farm.touch.dem = true; }, () => { farm.touch.dem = false; }, 12),
            dash: round(T.dash.x, T.dash.y, T.dash.r, 'DASH', PAL.sea, () => farm.dash(), undefined, 13),
        };
        this.update();
    }

    /** Show only the context buttons that do something right now. */
    update () {
        const b = this.btns, farm = this.farm;
        const k = farm.ready ? farm.touchContext() : { fish: '', pod: false, turn: false, cancel: false, take: false, dash: false };
        const set = (btn: RoundBtn, on: boolean, text?: string) => {
            btn.c.setVisible(on); btn.t.setVisible(on);
            if (btn.c.input) btn.c.input.enabled = on;
            if (on && text && btn.t.text !== text) btn.t.setText(text);
        };
        // a building in hand: the stick keeps a small patch round itself, so a tap on the ground in the lower left lands on the ground
        const wide = !k.cancel;
        if (wide !== this.stickWide) {
            this.stickWide = wide;
            const z = stickZone(wide);
            this.stickZone.setPosition(z.x, z.y).setSize(z.w, z.h);
            slots.set('stick', z);
        }
        set(b.fish, !!k.fish, k.fish);
        set(b.pod, k.pod); set(b.turn, k.turn); set(b.cancel, k.cancel); set(b.take, k.take); set(b.dash, k.dash);
        if (!k.take) farm.touch.dem = false;
    }
}
