// What a creature holds while it works: one small tool or load per activity (`ACTIVITY` in shared/data/creatures.ts), worn on its
// side, on its back or over its head, and moved in time with the rig's work bob (chopping, stabbing, tipping a can, holding up).
// An activity with no prop on purpose is null here: `idle` sleeps (the rig's z's) and `walk` is the walk itself.
import * as THREE from 'three';
import { RAMP } from './data';
import { bake, clamp, type MB, mix } from './kit';

/** Where a prop sits on the creature and how it moves while the creature works. */
export interface WorkProp { at: 'hand' | 'back' | 'over'; motion: 'chop' | 'stab' | 'tilt' | 'bob' | 'hold'; build (mb: MB): void }

const W = RAMP.wood, I = RAMP.steel, G = RAMP.gold;
const handle = (mb: MB, h = 0.3) => mb.main.rod([0, 0, 0], [0, h, 0], 0.016, 4, (_x, y) => mix(W[2], W[3], clamp(y * 3)), 0.014, { ao: false, v: 0.03 });

export const WORK_PROPS: Record<string, WorkProp | null> = {
    chop: { at: 'hand', motion: 'chop', build (mb) {
        handle(mb);
        mb.shiny().hull([[0, 0.24, 0], [0, 0.32, 0], [0.11, 0.35, 0], [0.11, 0.2, 0], [0, 0.24, 0.02], [0, 0.32, 0.02], [0.11, 0.35, 0.02], [0.11, 0.2, 0.02]], I[2], { z: -0.01, ao: false, v: 0.04 });
    } },
    mine: { at: 'hand', motion: 'chop', build (mb) {
        handle(mb);
        mb.shiny().rod([-0.13, 0.27, 0], [0.13, 0.27, 0], 0.022, 4, I[2], 0.008, { ao: false, v: 0.04 });
        mb.shiny().rod([0.02, 0.29, 0], [-0.14, 0.24, 0], 0.02, 4, I[1], 0.006, { ao: false, v: 0.04 });
    } },
    pick: { at: 'hand', motion: 'bob', build (mb) {
        mb.main.cyl(0.08, 0.06, 0.08, 7, (x, y) => ((Math.round(x * 40) + Math.round(y * 40)) % 2 ? RAMP.straw[1] : RAMP.straw[2]), { y: 0.04, ao: false, v: 0.04 });
        mb.main.torus(0.07, 0.008, 3, 8, RAMP.straw[0], { y: 0.1, rz: Math.PI / 2, ao: false });
        for (const [x, z] of [[-0.03, 0.02], [0.03, -0.01], [0, 0.03]]) mb.main.ico(0.025, 0, RAMP.red[2], { x, y: 0.085, z, ao: false });
    } },
    plant: { at: 'hand', motion: 'stab', build (mb) {
        handle(mb, 0.14);
        mb.shiny().hull([[-0.035, 0.14, 0], [0.035, 0.14, 0], [0, 0.26, 0], [-0.035, 0.14, 0.012], [0.035, 0.14, 0.012], [0, 0.26, 0.012]], I[2], { z: -0.006, ao: false, v: 0.03 });
        mb.main.oct(0.03, RAMP.leaf[3], { x: 0.06, y: 0.05, sy: 1.6, ao: false });
    } },
    harvest: { at: 'hand', motion: 'chop', build (mb) {
        handle(mb, 0.16);
        for (let i = 0; i < 5; i++) {
            const a0 = i / 5 * Math.PI * 0.9, a1 = (i + 1) / 5 * Math.PI * 0.9;
            mb.shiny().rod([Math.cos(a0) * 0.09 - 0.09, 0.16 + Math.sin(a0) * 0.09, 0], [Math.cos(a1) * 0.09 - 0.09, 0.16 + Math.sin(a1) * 0.09, 0], 0.012 - i * 0.0015, 3, I[3], 0.012 - (i + 1) * 0.0015, { ao: false, v: 0.03 });
        }
    } },
    water: { at: 'hand', motion: 'tilt', build (mb) {
        const c = RAMP.ice;
        mb.shiny().cyl(0.065, 0.075, 0.12, 8, c[1], { y: 0.06, ao: false, v: 0.04 });
        mb.shiny().rod([0.05, 0.05, 0], [0.16, 0.13, 0], 0.012, 4, c[1], 0.016, { ao: false });
        mb.shiny().torus(0.045, 0.008, 3, 8, c[0], { y: 0.13, x: -0.02, rx: Math.PI / 2, ry: Math.PI / 2, ao: false });
        mb.glow(0x74cce0, 1.2).oct(0.016, 0xcdf4ee, { x: 0.18, y: 0.1, sy: 1.6, ao: false, v: 0 });
    } },
    haul: { at: 'back', motion: 'bob', build (mb) {
        mb.main.box(0.2, 0.14, 0.16, (_x, y) => mix(W[2], W[4], clamp(y * 5)), { y: 0.07, j: 0.004, v: 0.06 });
        for (const y of [0.03, 0.11]) mb.main.box(0.21, 0.015, 0.17, W[1], { y, ao: false, v: 0 });
    } },
    carry: { at: 'back', motion: 'bob', build (mb) { sack(mb, RAMP.wool, null); } },
    fetch: { at: 'back', motion: 'bob', build (mb) { sack(mb, RAMP.straw, RAMP.leaf[3]); } },
    sortpick: { at: 'over', motion: 'bob', build (mb) { smallChest(mb); } },
    sortput: { at: 'over', motion: 'bob', build (mb) { smallChest(mb); } },
    fight: { at: 'hand', motion: 'chop', build (mb) {
        handle(mb, 0.07);
        mb.shiny().box(0.08, 0.016, 0.02, G[2], { y: 0.07, ao: false });
        mb.shiny().hull([[-0.016, 0.08, 0], [0.016, 0.08, 0], [0, 0.3, 0], [-0.016, 0.08, 0.012], [0.016, 0.08, 0.012], [0, 0.3, 0.012]], I[3], { z: -0.006, ao: false, v: 0.04 });
    } },
    guard: { at: 'hand', motion: 'hold', build (mb) {
        mb.main.cyl(0.11, 0.11, 0.025, 8, (x, y) => (Math.abs(x) < 0.02 || Math.abs(y - 0.11) < 0.02 ? G[2] : RAMP.red[1]), { y: 0.11, rx: Math.PI / 2, ao: false, v: 0.04 });
        mb.shiny().ico(0.025, 0, G[3], { y: 0.11, z: 0.015, ao: false });
    } },
    keep: { at: 'hand', motion: 'stab', build (mb) {
        mb.main.rod([0, 0, 0], [0, 0.3, 0], 0.012, 4, I[1], 0.01, { ao: false });
        mb.glow(0xf07a22, 2.2).oct(0.03, 0xffb040, { y: 0.31, sy: 1.4, ao: false, v: 0 });
    } },
    make: { at: 'hand', motion: 'chop', build (mb) {
        handle(mb, 0.24);
        mb.shiny().box(0.12, 0.06, 0.06, I[2], { y: 0.25, j: 0.003, v: 0.04 });
    } },
    stuck: { at: 'over', motion: 'bob', build (mb) {
        mb.glow(0xe85d62, 1.6).box(0.04, 0.12, 0.04, 0xe85d62, { y: 0.12, ao: false, v: 0 });
        mb.glow(0xe85d62, 1.6).box(0.04, 0.04, 0.04, 0xe85d62, { y: 0.02, ao: false, v: 0 });
    } },
    idle: null,
    walk: null,
};

function sack (mb: MB, ramp: readonly number[], mark: number | null) {
    mb.main.ico(0.1, 1, (_x, y) => mix(ramp[1], ramp[3], clamp(y * 4)), { y: 0.09, sy: 0.9, j: 0.01, v: 0.05 });
    mb.main.cone(0.04, 0.06, 5, ramp[0], { y: 0.19, ao: false });
    if (mark) mb.main.oct(0.03, mark, { y: 0.1, z: 0.09, sz: 0.4, ao: false });
}
function smallChest (mb: MB) {
    mb.main.box(0.18, 0.1, 0.12, (_x, y) => mix(W[2], W[3], clamp(y * 6)), { y: 0.05, j: 0.004, v: 0.05 });
    mb.main.box(0.19, 0.04, 0.13, W[3], { y: 0.12, j: 0.004 });
    mb.shiny().box(0.03, 0.03, 0.01, G[2], { y: 0.09, z: 0.065, ao: false });
}

/** A prop's object, built once per activity. */
export const workProp = (ac: string) => {
    const spec = WORK_PROPS[ac];
    return spec ? bake(`crit.work.${ac}`, spec.build, 2) : null;
};

/**
 * Hang and move the prop for activity `ac` on a creature: `top` is the head height (tiles), `busy` 0..1 how hard it is working,
 * `t` its clock. `slot` is the creature's own group for the prop (kept between frames); `load` shows a bundle on its back too.
 */
export class WorkSlot {
    group = new THREE.Group();
    private hold = new THREE.Group();
    private back = new THREE.Group();
    private ac = '';
    private spec: WorkProp | null = null;
    /** how far out to the side a held prop sits, and how far back a load rides (the creature's half width and depth, in tiles) */
    side = 0.2;
    rear = 0.16;
    constructor () { this.group.add(this.hold, this.back); this.back.visible = false; this.hold.scale.setScalar(1.45); this.back.scale.setScalar(1.35); }
    set (ac: string | undefined, load: boolean) {
        const a = ac ?? '';
        if (a !== this.ac) {
            this.ac = a;
            this.hold.clear();
            this.spec = WORK_PROPS[a] ?? null;
            const p = workProp(a);
            if (p) this.hold.add(p);
        }
        const backProp = this.spec?.at === 'back';
        if (load && !backProp && !this.back.children.length) this.back.add(workProp('carry')!);
        this.back.visible = load && !backProp;
    }
    pose (top: number, busy: number, t: number) {
        const s = this.spec, h = this.hold;
        h.visible = !!s;
        this.back.position.set(0, top * 0.8, -this.rear * 0.6);
        if (!s) return;
        const k = 0.5 + 0.5 * Math.sin(t * 8), w = clamp(busy);
        h.rotation.set(0, 0, 0);
        if (s.at === 'back') { h.position.set(0, top * 0.8 + k * 0.02 * w, -this.rear * 0.6); return; }
        if (s.at === 'over') { h.position.set(0, top + 0.14 + Math.abs(Math.sin(t * 3)) * 0.05, 0); h.rotation.y = Math.sin(t * 1.3) * 0.4; return; }
        h.position.set(this.side, top * 0.5, 0.08);
        switch (s.motion) {
            case 'chop': h.rotation.x = 0.35 - w * (0.2 + 1.3 * Math.pow(k, 3)); h.rotation.z = -0.25; break;
            case 'stab': h.rotation.x = 0.4 + w * 0.5 * k; h.position.y -= w * 0.05 * k; break;
            case 'tilt': h.rotation.z = -w * (0.5 + 0.35 * k); break;
            case 'bob': h.position.y += w * 0.03 * k; h.rotation.y = Math.sin(t * 2) * 0.2; break;
            case 'hold': h.rotation.y = -0.6; h.position.z = 0.16; h.position.y += w * 0.02 * Math.sin(t * 5); break;
        }
    }
}
