// Creature views: wild ones that hop about and bolt, companions at your heels, workers
// lunging at their jobs round a den, and the pod that shakes while a catch is decided.

import { critTex } from '../art/storybook-critters';
import * as Phaser from 'phaser';
import { ACTIVITY, spOf, STATUS_INFO, WORK_INFO } from '../../shared/data/creatures';
import { PAL } from '../../shared/palette';
import type { CritE, SimEvent } from '../../shared/sim/types';

type Img = Phaser.GameObjects.Image;
type Spr = Phaser.GameObjects.Sprite;

interface CritViewLike {
    ent: unknown;
    sprite: Img | Spr;
    shadow?: Img;
    mark?: Img;
    born?: number;
    x: number;
    y: number;
    pod?: Img;               // the pod shaking over a creature being caught
    podWait?: number;        // seconds until the thrown pod lands
    lunge?: { t: number; dur: number; dx: number; dy: number };
    hop?: { t: number; dur: number };      // a hop for joy (petted, or sitting at a kindled fire)
    wicon?: Img;             // the little job icon that floats up
    wiconT?: number;
    stars?: Img[];           // awakening stars circling its head
    bub?: Img;               // a worker's status bubble, and the icon inside it
    cargo?: Img;             // what an island worker is carrying
    bubIcon?: Img;
}

const outBack = (t: number) => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2);

export function createCrit (scene: Phaser.Scene, e: CritE) {
    const sp = spOf(e.sp);
    const sprite = scene.add.sprite(e.x, e.y, critTex(scene, e.sp), 0).setOrigin(0.5, 1).setDepth(e.y);
    const w = sprite.width;
    const shadow = scene.add.image(e.x, e.y, 'shadow', 0).setTint(PAL.ink).setAlpha(sp.flies ? 0.18 : 0.25).setDepth(-5).setScale(Math.min(3, w / 12), 1);
    return { sprite, shadow };
}

/** The pose a frame builds up before it is put on the sprite: scale, offset from where the creature stands, and the frame. */
interface Pose { sx: number; sy: number; ox: number; oy: number; frame: number }

/** Pose a creature from its sim state. */
export function animateCrit (scene: Phaser.Scene, v: CritViewLike, e: CritE, dt: number, now: number) {
    const sp = spOf(e.sp);
    const spr = v.sprite as Spr;
    const k = Math.min(1, dt * (e.mode === 1 ? 9 : 12));
    v.x += (e.x - v.x) * k;
    v.y += (e.y - v.y) * k;
    const t = now / 1000;
    const moving = Math.hypot(e.vx, e.vy) > 4;
    const st = e.st ?? 0;
    const pose: Pose = { sx: 1, sy: 1, ox: 0, oy: 0, frame: 0 };
    popIn(v, pose, now);
    if (moving) {
        pose.frame = Math.floor(t * (st === 1 ? 14 : 8) + e.id) % 2;
        pose.oy -= Math.abs(Math.sin(t * (st === 1 ? 16 : 10) + e.id)) * (sp.flies ? 1 : 2.4);
    } else {
        pose.sy *= 1 + Math.sin(t * 2.4 + e.id) * 0.03;           // breathing
    }
    if (sp.flies) pose.oy -= 7 + Math.sin(t * 4 + e.id) * 2;
    lungeStep(v, pose, dt);
    hopStep(v, pose, dt);
    const inPod = podStep(scene, v, e, dt, now);
    if (e.mode === 0 && st === 1 && !v.mark) v.mark = undefined;
    if (Math.abs(e.vx) > 3) spr.setFlipX(e.vx < 0);
    else if (e.mode === 1 && v.lunge) spr.setFlipX(v.lunge.dx < 0);
    spr.setFrame(pose.frame).setPosition(v.x + pose.ox, v.y + pose.oy).setDepth(v.y).setScale(pose.sx, pose.sy).setRotation(0);
    v.shadow?.setPosition(v.x, v.y);
    drawStars(scene, v, e, spr, pose, t, inPod);
    drawBubble(scene, v, e, spr, pose, t, inPod);
    drawCargo(scene, v, e, spr, pose, t, inPod, moving);
    driftJobIcon(v, spr, dt);
}

/** A newcomer pops in: scaled up from nothing with a little overshoot over 300 ms. */
function popIn (v: CritViewLike, pose: Pose, now: number) {
    if (v.born === undefined) return;
    const a = Math.min(1, (now - v.born) / 300);
    const s = a < 1 ? Math.max(0.01, outBack(a)) : 1;
    pose.sx *= s; pose.sy *= s;
    if (a >= 1) v.born = undefined;
}

/** A lunge at work: dart towards the target and back. */
function lungeStep (v: CritViewLike, pose: Pose, dt: number) {
    if (!v.lunge) return;
    v.lunge.t += dt;
    const p = Math.min(1, v.lunge.t / v.lunge.dur);
    const s = Math.sin(p * Math.PI);
    pose.ox += v.lunge.dx * s; pose.oy += v.lunge.dy * s - s * 3; pose.sx *= 1 + s * 0.12; pose.sy *= 1 - s * 0.08;
    pose.frame = 1;
    if (p >= 1) v.lunge = undefined;
}

/** A hop for joy: two little jumps, a squash on each landing. */
function hopStep (v: CritViewLike, pose: Pose, dt: number) {
    if (!v.hop) return;
    v.hop.t += dt;
    const p = Math.min(1, v.hop.t / v.hop.dur), air = Math.abs(Math.sin(p * Math.PI * 2)), rest = 1 - p;
    pose.oy -= air * 7 * (1 - p * 0.3);
    pose.sx *= 1 + (1 - air) * 0.09 * rest; pose.sy *= 1 - (1 - air) * 0.11 * rest;
    pose.frame = 1;
    if (p >= 1) v.hop = undefined;
}

/** Inside a pod the creature is gone and the pod wobbles in its place. Returns whether it is in one this frame. */
function podStep (scene: Phaser.Scene, v: CritViewLike, e: CritE, dt: number, now: number) {
    if ((v.podWait ?? 0) > 0) v.podWait = (v.podWait ?? 0) - dt;
    const inPod = (e.st ?? 0) === 2 && (v.podWait ?? 0) <= 0;
    v.sprite.setVisible(!inPod);
    v.shadow?.setVisible(!inPod);
    if (inPod) {
        if (!v.pod) v.pod = scene.add.image(0, 0, `i_${e.cat?.pod ?? 'pod'}`, 0).setScale(1.4).setDepth(v.y + 2);
        const a = e.a ?? 0;
        const shaking = (a < 1.55 && a > 1.25) || (a < 1.05 && a > 0.75) || (a < 0.55 && a > 0.25);
        v.pod.setVisible(true).setPosition(Math.round(v.x), Math.round(v.y - 5)).setDepth(v.y + 2).setRotation(shaking ? Math.sin(now / 38) * 0.45 : 0);
        v.pod.setTint(a < 0.22 ? PAL.cream : 0xffffff);
    } else v.pod?.setVisible(false);
    return inPod;
}

/** Awakening stars circle the head; from two stars up the shadow turns gold. */
function drawStars (scene: Phaser.Scene, v: CritViewLike, e: CritE, spr: Spr, pose: Pose, t: number, inPod: boolean) {
    const stars = e.star ?? 0;
    if (stars > 0 && !inPod) {
        v.stars ??= [];
        while (v.stars.length < stars) v.stars.push(scene.add.image(0, 0, 'k_star', 0).setScale(0.75));
        const top = v.y + pose.oy - spr.displayHeight - 4;
        v.stars.forEach((im, i) => {
            const a = t * 1.9 + (i / stars) * Math.PI * 2;
            im.setVisible(i < stars).setPosition(Math.round(v.x + pose.ox + Math.cos(a) * 9), Math.round(top + Math.sin(a) * 2.5)).setDepth(v.y + (Math.sin(a) > 0 ? 3 : -1));
        });
    } else v.stars?.forEach((im) => im.setVisible(false));
    if (v.shadow) { if (stars >= 2) v.shadow.setTint(PAL.gold).setAlpha(0.45); else if (stars === 0) v.shadow.setTint(PAL.ink); }
}

/** A worker that needs something (or has finished) shows a speech bubble with what it is; one that is simply busy shows what it is doing, in a smaller bubble. */
function drawBubble (scene: Phaser.Scene, v: CritViewLike, e: CritE, spr: Spr, pose: Pose, t: number, inPod: boolean) {
    const wst = e.mode === 2 && e.ws && e.ws !== 'work' && e.ws !== 'idle' && e.ws !== 'tidy' && e.ws !== 'noorder' && e.ws !== 'done' ? STATUS_INFO[e.ws] : null;
    const act = !wst && (e.mode === 2 || e.mode === 1) && e.ac ? ACTIVITY[e.ac] : undefined;
    const icon = wst ? wst.icon : act?.icon;
    if (icon && !inPod && scene.textures.exists(icon)) {
        if (!v.bub) { v.bub = scene.add.image(0, 0, 'bubble', 0); v.bubIcon = scene.add.image(0, 0, icon, 0).setScale(0.75); }
        const hop = Math.abs(Math.sin(t * 3 + e.id)) * (wst ? 2 : 1);
        const bx = Math.round(v.x + pose.ox), by = Math.round(v.y + pose.oy - spr.displayHeight - 8 - hop);
        const quiet = !wst && (e.ac === 'idle' || e.ac === 'walk');
        v.bub.setVisible(true).setPosition(bx, by).setDepth(v.y + 40).setScale(wst ? 1 : 0.8).setAlpha(quiet ? 0.5 : 1);
        if (v.bubIcon!.texture.key !== icon) v.bubIcon!.setTexture(icon, 0);
        v.bubIcon!.setVisible(true).setScale(wst ? 0.75 : 0.58).setPosition(bx, by - (wst ? 3 : 2)).setDepth(v.y + 41);
        if (wst?.bad) v.bubIcon!.setAlpha(0.55 + 0.45 * Math.abs(Math.sin(t * 4))); else v.bubIcon!.setAlpha(quiet ? 0.6 : 1);
    } else { v.bub?.setVisible(false); v.bubIcon?.setVisible(false); }
}

/** What an island worker carries to the chest (or the seeds it carries to the beds). */
function drawCargo (scene: Phaser.Scene, v: CritViewLike, e: CritE, spr: Spr, pose: Pose, t: number, inPod: boolean, moving: boolean) {
    const cargo = e.mode === 2 && !inPod ? e.ld?.[0] : undefined;
    const cargoTex = cargo ? `i_${cargo[0]}` : '';
    if (cargo && scene.textures.exists(cargoTex)) {
        if (!v.cargo) v.cargo = scene.add.image(0, 0, cargoTex, 0).setScale(0.7);
        else if (v.cargo.texture.key !== cargoTex) v.cargo.setTexture(cargoTex, 0);
        v.cargo.setVisible(true).setPosition(Math.round(v.x + pose.ox + (spr.flipX ? -7 : 7)), Math.round(v.y + pose.oy - spr.displayHeight * 0.45 + Math.sin(t * 9 + e.id) * (moving ? 1 : 0))).setDepth(v.y + 2);
    } else v.cargo?.setVisible(false);
}

/** The job icon rises and fades. */
function driftJobIcon (v: CritViewLike, spr: Spr, dt: number) {
    if (!v.wicon) return;
    v.wiconT = (v.wiconT ?? 0) + dt;
    const p = (v.wiconT ?? 0) / 1.1;
    v.wicon.setPosition(Math.round(v.x), Math.round(v.y - spr.displayHeight - 4 - p * 10)).setAlpha(p < 0.6 ? 1 : Math.max(0, 1 - (p - 0.6) / 0.4));
    if (p >= 1) { v.wicon.destroy(); v.wicon = undefined; }
}

export class CritFx {
    constructor (private scene: Phaser.Scene) {}

    /** A thrown pod flies in an arc to the creature; the creature hides when it lands. */
    pod (e: Extract<SimEvent, { e: 'pod' }>, v: CritViewLike | undefined) {
        const scene = this.scene;
        const ball = scene.add.image(e.px, e.py, `i_${e.pod}`, 0).setDepth(8e4).setScale(1.2);
        const dur = Math.max(260, Math.hypot(e.x - e.px, e.y - e.py) * 3.2);
        const arc = { t: 0 };
        scene.tweens.add({
            targets: arc, t: 1, duration: dur, ease: 'Linear',
            onUpdate: () => ball.setPosition(e.px + (e.x - e.px) * arc.t, e.py + (e.y - e.py) * arc.t - Math.sin(arc.t * Math.PI) * 22).setRotation(arc.t * 9),
            onComplete: () => ball.destroy(),
        });
        if (v) v.podWait = dur / 1000;
    }

    /** A creature hops for joy: petted, or glad to sit at a kindled fire. */
    hop (v: CritViewLike | undefined) {
        if (v) v.hop = { t: 0, dur: 0.72 };
    }

    /** A worker or companion strikes at `x,y`. */
    work (e: Extract<SimEvent, { e: 'work' }>, v: CritViewLike | undefined) {
        if (!v) return;
        const dx = e.x - v.x, dy = e.y - v.y, l = Math.max(1, Math.hypot(dx, dy)), reach = Math.min(16, l * 0.6);
        v.lunge = { t: 0, dur: e.kind === 'guard' ? 0.34 : 0.7, dx: (dx / l) * reach, dy: (dy / l) * reach * 0.6 };
        v.wicon?.destroy();
        const info = WORK_INFO[e.kind];
        v.wicon = this.scene.add.image(v.x, v.y, info.icon, 0).setScale(1).setDepth(9e4);
        v.wiconT = 0;
    }
}
