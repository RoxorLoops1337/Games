// The farmer: rig, dressing (look, scarf colour, gear) and the per-frame pose (walk, swing, downed, blink, springs).
import * as THREE from 'three';
import { BODY_TONES, DEFAULT_LOOK, EYES, Look, MOUTHS, SCARF_COLORS, SPROUTS } from '../../shared/data/look';
import { approach, BR, BY, CMAT, easeInOut, FMAT, SMAT, Spring, TOP, wrapAngle } from './farmer-base';
import { bodyGroup, EYE_LINE, eyesGroup, footGroup, handGroup, KNOT, koEyesGroup, mouthGroup, scarfGroup, sproutGroup, tailGroup } from './farmer-body';
import { bagPart, bodyPart, type BodyPart, charmPart, type GearPart, headPart } from './farmer-gear';
import { newCh, swingAt } from './farmer-swing';
import { arrowPart, stowPart, toolPart, type ToolPart } from './farmer-tools';
import type { PlayerS } from '../../shared/sim/types';
import type { CoStatus } from '../../shared/data/costatus';
import { animateStatus, STATUS_MODELS } from './costatus';

/** What a farmer wears and holds, by slot. */
export type Equip = PlayerS['equip'];
import { clamp, env, flashMeshes, lerp, meshesOf, smooth } from './kit';

export const PI = Math.PI;
export const TAU = PI * 2;
export const HAND_R = { x: 0.385, y: 0.42, z: 0.07 };
export const HAND_L = { x: -0.385, y: 0.42, z: 0.07 };
export const TOOL_SCALE = 1.3;
export const SPROUT_K = 1.22;
export const WALK_W = TAU * 2.4;
export let serial = 0;
export class Farmer {
    obj = new THREE.Group();
    // the rig: obj > lie (lying down) > yawG (facing) > feet + bodyG (bob, lean, squash) > everything else
    lie = new THREE.Group();
    yawG = new THREE.Group();
    bodyG = new THREE.Group();
    feet = [new THREE.Group(), new THREE.Group()];
    bodySlot = new THREE.Group();
    eyeG = new THREE.Group();
    eyeSlot = new THREE.Group();
    koSlot = new THREE.Group();
    mouthSlot = new THREE.Group();
    sproutP = new THREE.Group();
    sproutSlot = new THREE.Group();
    scarfSlot = new THREE.Group();
    tailP = new THREE.Group();
    tailSlot = new THREE.Group();
    handR = new THREE.Group();
    handRSlot = new THREE.Group();
    toolP = new THREE.Group();
    toolSlot = new THREE.Group();
    handL = new THREE.Group();
    handLSlot = new THREE.Group();
    offP = new THREE.Group();
    offSlot = new THREE.Group();
    headSlot = new THREE.Group();
    armourSlot = new THREE.Group();
    capeSlot = new THREE.Group();
    bagSlot = new THREE.Group();
    charmSlot = new THREE.Group();
    stowP = new THREE.Group();
    stowSlot = new THREE.Group();
    arrow: THREE.Group | null = null;
    // what is worn / held
    // what dress() last saw (compared field by field: calling it every frame must not allocate)
    built = false;
    lb = -1;
    ll = -1;
    le = -1;
    lm = -1;
    lc = -1;
    gearOn = false;
    holdOverride: string | null | undefined = undefined;
    look: Look = DEFAULT_LOOK;
    head: GearPart | null = null;
    armour: BodyPart | null = null;
    bag: GearPart | null = null;
    charm: GearPart | null = null;
    tool: ToolPart | null = null;
    gh?: string;
    gb?: string;
    gc?: string;
    gg?: string;
    gw?: string;
    gt?: string;
    equip?: Equip;
    // animation state
    T = 0;
    ph = 0;
    mv = 0;
    yaw = 0;
    yawRate = 0;
    downT = 0;
    side = 1;
    wasDown = false;
    first = true;
    blink = 2 + serial % 5 * 0.7;
    blinking = 0;
    rs = 2654435769 ^ ++serial * 7919;
    sq = new Spring(180, 13);
    bob = new Spring(160, 14);
    sprX = new Spring(70, 6);
    sprZ = new Spring(60, 5);
    sprY = new Spring(120, 9);
    tailX = new Spring(60, 5.5);
    tailZ = new Spring(55, 4.5);
    koOn = false;
    ch = newCh();
    swingW = 0;
    toolShown = 1;
    // what happened to the farmer: a hit (flash and recoil), the blink of invulnerability, the call for help while downed
    hurtT = 0;
    lastHearts = Number.NaN;
    flashing: THREE.Mesh[] | null = null;
    helpRing: THREE.Mesh | null = null;
    /** the co-op status shown on the farmer (ice block, hex wisps), and which kind it is */
    coObj: THREE.Object3D | null = null;
    coK = '';
    // ── dressing ─────────────────────────────────────────────────────────────
    safeLook = { b: 0, l: 0, e: 0, m: 0 };
    constructor(look: Look | undefined, color: number, equip: Equip | undefined) {
        const bg = this.bodyG;
        this.obj.add(this.lie);
        this.lie.add(this.yawG);
        this.yawG.add(this.feet[0], this.feet[1], bg);
        bg.add(this.bodySlot, this.scarfSlot, this.capeSlot, this.stowP, this.bagSlot, this.armourSlot, this.charmSlot, this.eyeG, this.mouthSlot, this.headSlot);
        this.stowP.add(this.stowSlot);
        this.eyeG.position.y = EYE_LINE;
        this.eyeG.add(this.eyeSlot);
        bg.add(this.sproutP);
        this.sproutP.position.set(0, TOP - 0.03, 0);
        this.sproutP.add(this.sproutSlot);
        this.sproutP.rotation.order = 'ZXY';
        bg.add(this.tailP);
        this.tailP.position.set(KNOT.x, KNOT.y - 0.03, KNOT.z);
        this.tailP.add(this.tailSlot);
        this.tailP.rotation.order = 'ZXY';
        bg.add(this.handR, this.handL);
        this.handR.position.set(HAND_R.x, HAND_R.y, HAND_R.z);
        this.handR.add(this.handRSlot, this.toolP);
        this.toolP.rotation.order = 'YXZ';
        this.toolP.add(this.toolSlot);
        this.handL.position.set(HAND_L.x, HAND_L.y, HAND_L.z);
        this.handL.add(this.handLSlot, this.offP);
        this.offP.rotation.order = 'YXZ';
        this.offP.add(this.offSlot);
        this.feet[0].position.set(-0.14, 0, 0.1);
        this.feet[1].position.set(0.14, 0, 0.1);
        for (const f of this.feet) f.add(footGroup());
        this.stowP.position.set(-0.1, 0.5, -0.3);
        this.stowP.rotation.set(0.15, 0, 0.9);
        this.stowP.scale.setScalar(0.9);
        this.toolSlot.scale.setScalar(TOOL_SCALE);
        this.offSlot.scale.setScalar(TOOL_SCALE);
        this.dress(look, color, equip);
    }
    /** A look with every number inside its range (the sim guarantees it, the model does not trust it). */
    safe(look: Look | undefined) {
        const l = look ?? DEFAULT_LOOK, s = this.safeLook, k = (v: number, n: number) => v >= 0 && v < n ? v | 0 : 0;
        s.b = k(l.b, BODY_TONES.length);
        s.l = k(l.l, SPROUTS.length);
        s.e = k(l.e, EYES.length);
        s.m = k(l.m, MOUTHS.length);
        return s;
    }
    dress(look: Look | undefined, color: number, equip: Equip | undefined) {
        const l = this.safe(look), n = SCARF_COLORS.length, col = ((color | 0) % n + n) % n;
        if (!this.built || l.b !== this.lb || l.l !== this.ll || l.e !== this.le || l.m !== this.lm || col !== this.lc) {
            const sub = (s: THREE.Group, g: THREE.Group) => {
                s.clear();
                s.add(g);
            };
            const toneChanged = !this.built || this.lb !== l.b;
            this.look = l;
            this.lb = l.b;
            this.ll = l.l;
            this.le = l.e;
            this.lm = l.m;
            this.lc = col;
            if (toneChanged) {
                sub(this.bodySlot, bodyGroup(l.b));
                this.gearOn = false;
            }
            sub(this.eyeSlot, eyesGroup(l.e));
            sub(this.koSlot, koEyesGroup());
            sub(this.mouthSlot, mouthGroup(l.m));
            sub(this.sproutSlot, sproutGroup(l.l));
            sub(this.scarfSlot, scarfGroup(SCARF_COLORS[col]));
            sub(this.tailSlot, tailGroup(SCARF_COLORS[col]));
            this.built = true;
        }
        const e = equip;
        if (!this.gearOn || e?.head !== this.gh || e?.body !== this.gb || e?.charm !== this.gc || e?.bag !== this.gg || e?.weapon !== this.gw || e?.tool !== this.gt) {
            this.gh = e?.head;
            this.gb = e?.body;
            this.gc = e?.charm;
            this.gg = e?.bag;
            this.gw = e?.weapon;
            this.gt = e?.tool;
            this.gearOn = true;
            this.equip = e ? { ...e } : undefined;
            this.wear();
        }
    }
    /** What is in the hand: any gear item id, '' / null for nothing, undefined to go back to the worn weapon (else the pick). */
    hold(item: string | null | undefined) {
        this.holdOverride = item;
        this.holdTool();
    }
    wear() {
        const e: Equip = this.equip ?? {};
        const sub = (s: THREE.Group, g: THREE.Object3D | null | undefined) => {
            s.clear();
            if (g) s.add(g);
        };
        this.head = headPart(e.head);
        this.armour = bodyPart(e.body);
        this.bag = bagPart(e.bag);
        this.charm = charmPart(e.charm);
        sub(this.headSlot, this.head?.g);
        sub(this.armourSlot, this.armour?.g);
        sub(this.capeSlot, this.armour?.cape?.g);
        sub(this.bagSlot, this.bag?.g);
        sub(this.charmSlot, this.charm?.g);
        this.sproutP.position.y = TOP - 0.03 + (this.head?.lift ?? 0);
        this.holdTool();
    }
    holdTool() {
        const e: Equip = this.equip ?? {};
        const id = this.holdOverride === undefined ? e.weapon ?? e.tool : this.holdOverride || undefined;
        const stow = this.holdOverride === undefined && e.weapon && e.tool ? e.tool : undefined;
        this.tool = toolPart(id);
        const t = this.tool;
        this.toolSlot.clear();
        this.offSlot.clear();
        this.stowSlot.clear();
        if (this.arrow) {
            this.toolP.remove(this.arrow);
            this.arrow = null;
        }
        const hand = (g: THREE.Group) => {
            g.clear();
            g.add(handGroup(this.look.b, this.armour?.glove));
        };
        hand(this.handRSlot);
        hand(this.handLSlot);
        if (t) (t.left ? this.offSlot : this.toolSlot).add(t.g);
        if (t && t.bow) this.arrow = arrowPart();
        const s = stowPart(stow);
        if (s) this.stowSlot.add(s);
        this.stowP.visible = !!s;
        this.toolShown = 1;
    }
    // ── per frame ────────────────────────────────────────────────────────────
    rnd() {
        this.rs = this.rs + 1831565813 | 0;
        let t = Math.imul(this.rs ^ this.rs >>> 15, 1 | this.rs);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
    pose(fx: number, fy: number, moving: boolean, swing: number, downed: boolean, dt: number) {
        if (!(dt > 0)) dt = 0.0001;
        if (dt > 0.1) dt = 0.1;
        this.T += dt;
        const T = this.T, c = this.ch;
        const fill = 0.36 - 0.24 * env.night;
        FMAT.emissiveIntensity = fill;
        SMAT.emissiveIntensity = fill * 0.78;
        CMAT.emissiveIntensity = fill * 0.9;
        const flen = Math.hypot(fx, fy);
        if (this.first && flen > 0.01) {
            this.yaw = Math.atan2(fx, fy);
            this.first = false;
        }
        if (downed && !this.wasDown) this.side = flen > 0.01 ? fx >= 0 ? 1 : -1 : this.yaw >= 0 ? 1 : -1;
        this.wasDown = downed;
        this.downT += ((downed ? 1 : 0) - this.downT) * approach(dt, 4.2);
        if (Math.abs(this.downT - (downed ? 1 : 0)) < 0.002) this.downT = downed ? 1 : 0;
        const d = easeInOut(this.downT), up = 1 - d;
        const want = flen > 0.01 ? Math.atan2(fx, fy) : this.yaw;
        const target = d > 0.02 ? this.yaw * (1 - d) : want;
        const yaw0 = this.yaw;
        this.yaw = wrapAngle(this.yaw + wrapAngle(target - this.yaw) * approach(dt, downed ? 5 : 15));
        this.yawRate += (wrapAngle(this.yaw - yaw0) / dt - this.yawRate) * approach(dt, 12);
        this.mv += ((moving && !downed ? 1 : 0) - this.mv) * approach(dt, 11);
        if (this.mv < 0.003) this.mv = 0;
        const mv = this.mv;
        this.ph += dt * WALK_W * mv;
        const ph = this.ph;
        const tl = this.tool, tt = tl ? tl.type : 'fist';
        const p = downed ? 0 : clamp(swing);
        let w = 0;
        if (p > 0 && p < 1) {
            w = smooth(0, 0.06, p) * (1 - smooth(0.93, 1, p));
            swingAt(tt, p, c);
        } else {
            c.hx = c.hy = c.hz = c.wx = c.wy = c.wz = c.lean = c.twist = c.sq = c.bz = c.by = c.lhx = c.lhy = c.lhz = c.glow = c.draw = c.two = 0;
        }
        this.swingW += (w - this.swingW) * approach(dt, 30);
        const s2 = Math.cos(2 * ph);
        const idle = Math.sin(T * 2.3);
        const bob = this.bob.step(mv * 0.062 * (0.5 + 0.5 * s2) + c.by * w, dt);
        const sq = this.sq.step(mv * -0.04 * s2 + idle * -0.014 * (1 - mv) + c.sq * w, dt);
        const hk = this.hurtT > 0 ? Math.sin(Math.min(1, this.hurtT / 0.35) * Math.PI) : 0;
        const lean = mv * 0.12 + c.lean * w - hk * 0.42;
        const roll = Math.sin(ph) * 0.08 * mv + clamp(-this.yawRate * 0.012, -0.12, 0.12);
        const bg = this.bodyG;
        bg.position.set(0, bob * up, c.bz * w * up);
        bg.rotation.set(lean * up, (c.twist * w + Math.sin(ph) * -0.05 * mv) * up, roll * up);
        bg.scale.set(1 + sq * 0.55, 1 - sq, 1 + sq * 0.55);
        const th = -this.side * (PI / 2) * d, cy = BY;
        this.lie.rotation.z = th;
        this.lie.position.set(cy * Math.sin(th), lerp(cy, BR * 0.95, d) - cy * Math.cos(th), 0);
        this.yawG.rotation.y = this.yaw;
        for (let i = 0; i < 2; i++) {
            const f = this.feet[i], pp = ph + i * PI, s = Math.sin(pp), cc = Math.cos(pp), sgn = i ? 1 : -1;
            f.position.set(sgn * (0.14 + d * 0.04), Math.max(0, cc) * 0.11 * mv * up, 0.1 + 0.2 * s * mv * up - d * 0.1);
            f.rotation.set(-Math.max(0, cc) * 0.35 * mv * up, sgn * d * 0.25, 0);
        }
        const walkSwing = Math.sin(ph) * mv, restBob = idle * 0.008;
        let rhx = HAND_R.x + c.hx * w, rhy = HAND_R.y + restBob + c.hy * w + Math.abs(walkSwing) * 0.02, rhz = HAND_R.z - (tl && !tl.left ? 0.03 : 0.09) * walkSwing + c.hz * w;
        let lhx = HAND_L.x + c.lhx * w, lhy = HAND_L.y + restBob + c.lhy * w - Math.abs(walkSwing) * 0.02, lhz = HAND_L.z + 0.09 * walkSwing + c.lhz * w;
        const inR = !!tl && !tl.left;
        const wx = (inR ? tl.rwx - 0.05 * walkSwing + idle * 0.02 : 0) + c.wx * w, wz = (inR ? tl.rwz : 0) + c.wz * w, wy = c.wy * w;
        const hold2 = tl && tl.twoHand ? clamp(c.two) * w : 0;
        if (hold2 > 0.001) {
            const ux = -Math.sin(wz), uy = Math.cos(wz) * Math.cos(wx), uz = Math.cos(wz) * Math.sin(wx), L = 0.24;
            lhx = lerp(lhx, rhx - ux * L - 0.02, hold2);
            lhy = lerp(lhy, rhy - uy * L, hold2);
            lhz = lerp(lhz, rhz - uz * L, hold2);
        }
        rhx = lerp(rhx, 0.42, d);
        rhy = lerp(rhy, 0.3, d);
        rhz = lerp(rhz, 0.12, d);
        lhx = lerp(lhx, -0.42, d);
        lhy = lerp(lhy, 0.3, d);
        lhz = lerp(lhz, 0.12, d);
        this.handR.position.set(rhx, rhy, rhz);
        this.handL.position.set(lhx, lhy, lhz);
        this.toolP.rotation.set(wx, wy, wz);
        if (tl && tl.left && tl.bow) {
            this.offP.rotation.set(tl.rwx, 0, tl.rwz * (1 - w));
            const dr = clamp(c.draw, -0.2, 1), nz = -tl.bow.sag - dr * 0.27;
            const a2 = Math.atan2(-(nz + tl.bow.sag), tl.bow.half), k = Math.hypot(tl.bow.half, nz + tl.bow.sag) / tl.bow.half;
            tl.bow.top.rotation.x = a2;
            tl.bow.top.scale.y = k;
            tl.bow.bot.rotation.x = -a2;
            tl.bow.bot.scale.y = k;
            if (this.arrow) {
                const on = w > 0.02 && p < 0.6 && c.draw > 0.04 && d < 0.1;
                if (on !== (this.arrow.parent === this.toolP)) {
                    if (on) this.toolP.add(this.arrow);
                    else this.toolP.remove(this.arrow);
                }
            }
        }
        this.toolShown += ((downed ? 0 : 1) - this.toolShown) * approach(dt, 9);
        const ts = clamp(this.toolShown);
        this.toolP.scale.setScalar(Math.max(0.001, ts));
        this.offP.scale.setScalar(Math.max(0.001, ts));
        this.toolP.visible = ts > 0.01;
        this.offP.visible = ts > 0.01;
        if (tl && tl.orb) tl.orb.scale.setScalar(1 + c.glow * w + idle * 0.05);
        this.blink -= dt;
        if (this.blinking > 0) {
            this.blinking -= dt;
            if (this.blinking <= 0) this.blink = 2.2 + this.rnd() * 3.6;
        } else if (this.blink <= 0) {
            this.blinking = 0.13;
            if (this.rnd() < 0.18) this.blink = 0.28;
        }
        const koShow = d > 0.35;
        if (koShow !== this.koOn) {
            this.koOn = koShow;
            if (koShow) {
                this.eyeG.add(this.koSlot);
                this.eyeG.remove(this.eyeSlot);
            } else {
                this.eyeG.remove(this.koSlot);
                this.eyeG.add(this.eyeSlot);
            }
        }
        this.eyeG.scale.y = this.blinking > 0 ? 0.12 : 1;
        const sway = Math.sin(T * 1.25) * 0.07 + Math.sin(T * 2.3 + 1) * 0.025;
        const lag = this.sprY.step(bob * up, dt) - bob * up;
        this.sprZ.step(sway * (1 - d) + -this.yawRate * 0.02 * up + -this.side * d * 1.25 + mv * Math.sin(ph) * 0.1, dt);
        this.sprX.step(0.05 * up + mv * 0.16 + c.lean * w * -0.4 + lag * 7 * up + d * 0.1, dt);
        this.sproutP.rotation.set(this.sprX.x, 0, this.sprZ.x);
        this.sproutP.scale.set(SPROUT_K * (1 - lag * 1.2), SPROUT_K * (1 + lag * 2.2 - sq * 0.6), SPROUT_K * (1 - lag * 1.2));
        this.tailX.step(0.1 + mv * (0.65 + 0.1 * Math.sin(ph * 2 + 1)) - c.lean * w * 0.5 + d * 0.25 + Math.sin(T * 1.7) * 0.04, dt);
        this.tailZ.step(mv * Math.sin(T * 9 + 0.5) * 0.22 + Math.sin(T * 1.3) * 0.05 + this.side * d * 0.7, dt);
        this.tailP.rotation.set(this.tailX.x, 0, this.tailZ.x);
        const a = this.armour, h = this.head, b = this.bag, ch = this.charm;
        if (a?.tick) a.tick(T, mv, d);
        if (a?.cape?.tick) a.cape.tick(T, mv, d);
        if (h?.tick) h.tick(T, mv, d);
        if (b?.tick) b.tick(T, mv, d);
        if (ch?.tick) ch.tick(T, mv, d);
    }
    /**
     * What the farmer's record says happened, once a frame after `pose`: fewer hearts than last time is a hit (a white flash and a
     * recoil, like a monster's), `invuln` makes the farmer blink as the 2D sprite does, and a downed farmer gets a berry ring that
     * pulses on the ground, calling for a friend.
     */
    react(hearts: number, invuln: number, downed: boolean, dt: number) {
        if (!(dt > 0)) dt = 0.016;
        if (hearts < this.lastHearts && !downed) {
            this.hurtT = 0.35;
            this.sq.kick(2.2);
        }
        this.lastHearts = hearts;
        this.hurtT = Math.max(0, this.hurtT - dt);
        const flash = this.hurtT > 0.22;
        if (flash && !this.flashing) {
            this.flashing = meshesOf(this.bodyG);
            flashMeshes(this.flashing, true);
        } else if (!flash && this.flashing) {
            flashMeshes(this.flashing, false);
            this.flashing = null;
        }
        this.yawG.visible = !(invuln > 0 && !downed && Math.floor(invuln * 12) % 2 === 0);
        if (downed && !this.helpRing) {
            this.helpRing = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.58, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xe85d62, transparent: true, opacity: 0.6, depthWrite: false }));
            this.helpRing.position.y = 0.04;
            this.helpRing.renderOrder = 2;
            this.helpRing.raycast = () => {};
            this.obj.add(this.helpRing);
        }
        if (this.helpRing) {
            this.helpRing.visible = downed;
            if (downed) {
                const u = (this.T * 0.9) % 1;
                this.helpRing.scale.setScalar(0.8 + u * 0.7);
                (this.helpRing.material as THREE.MeshBasicMaterial).opacity = 0.65 * (1 - u);
            }
        }
    }
    /** A co-op boss status (`PlayerS.co`): the ice block or the hex wisps (the chain between two farmers is the entity layer's). */
    status(co: CoStatus | undefined) {
        const k = co && co.k !== 'tether' ? co.k : '';
        if (k !== this.coK) {
            if (this.coObj) this.obj.remove(this.coObj);
            this.coObj = k ? STATUS_MODELS[k as 'frozen' | 'hexed']() : null;
            if (this.coObj) this.obj.add(this.coObj);
            this.coK = k;
        }
        if (this.coObj && co) animateStatus(co.k, this.coObj, this.T, co.th ? co.th / 1.5 : 0);
    }
    dispose() {
        if (this.helpRing) {
            this.helpRing.geometry.dispose();
            (this.helpRing.material as THREE.Material).dispose();
        }
    }
}
export function farmerModel(look: Look | undefined, color: number, equip: Equip | undefined) {
    return new Farmer(look, color, equip);
}
