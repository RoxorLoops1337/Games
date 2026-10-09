// Juice: the burst table for the simulation's fx actions, the instanced particles, synthesised sounds and floating words.
import { Color, Euler, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Scene, TetrahedronGeometry, Vector3 } from 'three';
import { groundY } from './ground';

export const C = { leaf: 0x5cb04f, lime: 0xd4f08a, wood: 0xa8703f, bark: 0x6a402f, stone: 0x9ea4b9, pebble: 0xd5d9e6, gold: 0xffd966, cream: 0xfff6e0, berry: 0xe85d62, blossom: 0xf79fc6, sea: 0x4ab2cf, foam: 0xcdf4ee, plum: 0x9d6fdb, pumpkin: 0xf8a24a, dirt: 0xd49a62, ink: 0x2a1d2c, sand: 0xf4deaa };
/** A juice burst: particle colours, count, speed, lift and size, the sound and the camera shake. */
export interface FxDef { colors: readonly number[]; y?: number; n: number; speed: number; up: number; size: number; sfx: string; shake: number }
export const FX: Record<string, FxDef | undefined> = {
    hitWood: { colors: [C.leaf, C.lime, C.wood], n: 9, speed: 2.2, up: 3, size: 0.9, sfx: 'chop', shake: 0.04 },
    breakTree: { colors: [C.leaf, C.lime, C.wood, C.bark], n: 22, speed: 3.2, up: 4, size: 1.1, sfx: 'fell', shake: 0.12 },
    hitStone: { colors: [C.stone, C.pebble], n: 8, speed: 2.4, up: 3, size: 0.8, sfx: 'rock', shake: 0.04 },
    hitEarth: { colors: [C.dirt, C.sand], n: 7, speed: 2, up: 2.6, size: 0.8, sfx: 'rock', shake: 0.03 },
    hitCrystal: { colors: [C.plum, C.cream, C.sea], n: 9, speed: 2.4, up: 3.2, size: 0.8, sfx: 'rock', shake: 0.04 },
    breakRock: { colors: [C.stone, C.pebble, 0x7a7f9e], n: 20, speed: 3, up: 4, size: 1.1, sfx: 'fell', shake: 0.1 },
    breakOre: { colors: [C.gold, C.stone, C.pebble], n: 20, speed: 3, up: 4, size: 1.1, sfx: 'fell', shake: 0.1 },
    breakEarth: { colors: [C.dirt, C.sand], n: 14, speed: 2.6, up: 3.4, size: 1, sfx: 'rock', shake: 0.07 },
    breakCrystal: { colors: [C.plum, C.cream, C.sea], n: 20, speed: 3, up: 4, size: 1, sfx: 'fell', shake: 0.1 },
    breakPlant: { colors: [C.leaf, C.berry, C.blossom], n: 12, speed: 2.4, up: 3, size: 0.8, sfx: 'pop', shake: 0.03 },
    openChest: { colors: [C.gold, C.cream, C.wood], n: 14, speed: 2.4, up: 3.6, size: 0.9, sfx: 'chest', shake: 0.05 },
    pickup: { colors: [C.gold, C.cream], n: 3, speed: 1, up: 1.6, size: 0.5, sfx: 'pick', shake: 0 },
    build: { colors: [C.sand, C.cream, C.wood], n: 10, speed: 2, up: 2.4, size: 0.8, sfx: 'build', shake: 0.04 },
    buyLand: { colors: [C.foam, C.sea, C.cream], n: 30, speed: 4, up: 5, size: 1.2, sfx: 'land', shake: 0.15 },
    levelUp: { colors: [C.gold, C.cream, C.lime], n: 30, speed: 3, up: 5, size: 1, sfx: 'level', shake: 0.08 },
    perk: { colors: [C.plum, C.cream], n: 14, speed: 2, up: 3, size: 0.8, sfx: 'level', shake: 0.04 },
    eat: { colors: [C.berry, C.cream], n: 6, speed: 1.6, up: 2.4, size: 0.6, sfx: 'pop', shake: 0 },
    plant: { colors: [C.dirt, C.leaf], n: 8, speed: 1.6, up: 2.2, size: 0.7, sfx: 'pop', shake: 0.02 },
    harvestCrop: { colors: [C.pumpkin, C.leaf, C.gold], n: 12, speed: 2.4, up: 3.2, size: 0.8, sfx: 'pop', shake: 0.03 },
    sell: { colors: [C.gold, C.cream], n: 12, speed: 2.4, up: 3.6, size: 0.7, sfx: 'coin', shake: 0 },
    smelt: { colors: [C.pumpkin, C.gold], n: 10, speed: 1.8, up: 3.2, size: 0.7, sfx: 'pop', shake: 0.02 },
    craft: { colors: [C.cream, C.gold], n: 10, speed: 1.8, up: 2.8, size: 0.7, sfx: 'build', shake: 0.02 },
    upgrade: { colors: [C.gold, C.cream], n: 16, speed: 2.4, up: 3.6, size: 0.8, sfx: 'level', shake: 0.04 },
    hurt: { colors: [C.berry, C.cream], n: 10, speed: 2.4, up: 2.6, size: 0.8, sfx: 'hurt', shake: 0.16 },
    heal: { colors: [C.lime, C.cream], n: 8, speed: 1.4, up: 2.6, size: 0.7, sfx: 'pick', shake: 0 },
    enemyHit: { colors: [C.cream, C.berry], n: 7, speed: 2.2, up: 2.4, size: 0.8, sfx: 'hit', shake: 0.05 },
    enemyDie: { colors: [C.cream, C.plum, C.stone], n: 18, speed: 2.8, up: 3.4, size: 1, sfx: 'fell', shake: 0.09 },
    bossDie: { colors: [C.gold, C.cream, C.berry, C.plum], n: 60, speed: 5, up: 6, size: 1.4, sfx: 'level', shake: 0.3 },
    downed: { colors: [C.berry, C.ink], n: 16, speed: 2.4, up: 3, size: 1, sfx: 'hurt', shake: 0.2 },
    revive: { colors: [C.lime, C.cream, C.gold], n: 22, speed: 2.6, up: 4, size: 1, sfx: 'level', shake: 0.06 },
    join: { colors: [C.cream, C.gold], n: 16, speed: 2.2, up: 3.6, size: 0.8, sfx: 'level', shake: 0 },
    win: { colors: [C.gold, C.cream, C.lime, C.blossom], n: 40, speed: 4, up: 5, size: 1.2, sfx: 'level', shake: 0.1 },
    deny: { colors: [C.berry, C.ink], n: 5, speed: 1.2, up: 1.6, size: 0.5, sfx: 'deny', shake: 0.02 },
    look: { colors: [C.blossom, C.cream, C.gold], n: 14, speed: 2, up: 3, size: 0.8, sfx: 'pop', shake: 0.02 },
    dash: { colors: [C.cream, C.sand], n: 8, speed: 1.6, up: 1.4, size: 0.7, sfx: 'dash', shake: 0.03 },
    slam: { colors: [C.dirt, C.stone], n: 24, speed: 4, up: 3, size: 1.2, sfx: 'fell', shake: 0.2 },
    roar: { colors: [C.berry, C.plum], n: 12, speed: 3, up: 2, size: 1, sfx: 'fell', shake: 0.12 },
    unlock: { colors: [C.gold, C.cream], n: 14, speed: 2.4, up: 3.4, size: 0.8, sfx: 'level', shake: 0.03 },
    // the Blight (sim/blight.ts, sim/raid.ts): a nest struck and destroyed, a nest spreading to the next isle, a raid setting out
    nestHit: { colors: [C.plum, C.berry, 0x2a1830], n: 7, speed: 2, up: 2.6, size: 0.8, sfx: 'hit', shake: 0.04 },
    nestDie: { colors: [C.berry, C.plum, 0x2a1830, C.cream], n: 44, speed: 4.2, up: 5.5, size: 1.3, sfx: 'fell', shake: 0.2 },
    nestSpread: { colors: [C.plum, 0x2a1830, C.berry], n: 20, speed: 2.4, up: 4, size: 1, sfx: 'pop', shake: 0.05 },
    raid: { colors: [C.berry, C.plum], n: 18, speed: 2.4, up: 6, size: 1, sfx: 'fell', shake: 0.06 },
    bedSet: { colors: [C.cream, C.blossom, C.gold], n: 10, speed: 1.6, up: 3, size: 0.7, sfx: 'level', shake: 0.02 },
    unbind: { colors: [C.foam, C.cream, C.plum], n: 8, speed: 1.6, up: 3, size: 0.7, sfx: 'pop', shake: 0.02 },
    // the Blight's raids on the defenses (sim/defense.ts): a chip off a wall, and a wall breaking into a puff of rubble
    bldHit: { colors: [C.stone, C.wood, C.cream], n: 6, speed: 1.8, up: 2.2, size: 0.7, sfx: 'rock', shake: 0.03 },
    bldBreak: { colors: [C.stone, C.wood, C.pebble, C.dirt], n: 26, speed: 3, up: 4.2, size: 1.25, sfx: 'fell', shake: 0.12 }
};
export const N = 300;
export class Particles {
    p = Array.from({ length: N }, () => ({ life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, spin: 0, size: 1 }));
    cur = 0;
    m = new Matrix4();
    q = new Quaternion();
    e = new Euler();
    s = new Vector3();
    pos = new Vector3();
    c = new Color();
    mesh = new InstancedMesh(new TetrahedronGeometry(0.1, 0), new MeshStandardMaterial({ flatShading: true, roughness: 0.8 }), N);
    constructor(scene: Scene) {
        for (let i = 0; i < N; i++) {
            this.m.makeScale(0, 0, 0);
            this.mesh.setMatrixAt(i, this.m);
            this.mesh.setColorAt(i, this.c.set(0xffffff));
        }
        this.mesh.frustumCulled = false;
        scene.add(this.mesh);
    }
    burst(x: number, y: number, z: number, colors: readonly number[], n: number, speed: number, up: number, size = 1) {
        for (let i = 0; i < n; i++) {
            const idx = this.cur, p = this.p[idx], a = Math.random() * Math.PI * 2, s = (0.4 + Math.random()) * speed;
            this.cur = (this.cur + 1) % N;
            Object.assign(p, { life: 0.7 + Math.random() * 0.5, x, y, z, vx: Math.cos(a) * s, vy: up * (0.5 + Math.random()), vz: Math.sin(a) * s, rx: Math.random() * 6, ry: Math.random() * 6, spin: (Math.random() - 0.5) * 12, size: (0.6 + Math.random() * 0.9) * size });
            this.mesh.setColorAt(idx, this.c.set(colors[Math.random() * colors.length | 0]));
        }
        if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    }
    update(dt: number) {
        for (let i = 0; i < N; i++) {
            const p = this.p[i];
            if (p.life > 0) {
                p.life -= dt;
                p.vy -= 11 * dt;
                p.x += p.vx * dt;
                p.y += p.vy * dt;
                p.z += p.vz * dt;
                const gy = groundY(p.x, p.z) + 0.05;
                if (p.y < gy) {
                    p.y = gy;
                    p.vy *= -0.3;
                    p.vx *= 0.6;
                    p.vz *= 0.6;
                }
                p.rx += p.spin * dt;
                const k = Math.min(1, p.life / 0.4) * p.size;
                this.pos.set(p.x, p.y, p.z);
                this.e.set(p.rx, p.ry, 0);
                this.q.setFromEuler(this.e);
                this.s.setScalar(k);
                this.m.compose(this.pos, this.q, this.s);
            } else this.m.makeScale(0, 0, 0);
            this.mesh.setMatrixAt(i, this.m);
        }
        this.mesh.instanceMatrix.needsUpdate = true;
    }
}
/** Little synthesised sounds (Web Audio), started on the first touch or key. */
export class Sound {
    ctx: AudioContext | null = null;
    on = true;
    unlock() {
        if (!this.ctx) {
            try {
                const w = window as Window & { webkitAudioContext?: typeof AudioContext };
                this.ctx = new (window.AudioContext || w.webkitAudioContext!)();
            } catch {
                this.ctx = null;
            }
        }
        if (this.ctx?.state === 'suspended') void this.ctx.resume();
    }
    tone(f: number, d: number, type: OscillatorType = 'sine', v = 0.08, slide = 0, at = 0) {
        const a = this.ctx;
        if (!a || !this.on) return;
        const t = a.currentTime + at, o = a.createOscillator(), g = a.createGain();
        o.type = type;
        o.frequency.setValueAtTime(f, t);
        if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + d);
        g.gain.setValueAtTime(v, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        o.connect(g).connect(a.destination);
        o.start(t);
        o.stop(t + d + 0.02);
    }
    noise(d: number, v = 0.1, hp = 800) {
        const a = this.ctx;
        if (!a || !this.on) return;
        const n = Math.floor(a.sampleRate * d), b = a.createBuffer(1, n, a.sampleRate), ch = b.getChannelData(0);
        for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / n);
        const s = a.createBufferSource(), g = a.createGain(), f = a.createBiquadFilter();
        s.buffer = b;
        f.type = 'highpass';
        f.frequency.value = hp;
        g.gain.value = v;
        s.connect(f).connect(g).connect(a.destination);
        s.start();
    }
    play(k: string) {
        const j = 1 + (Math.random() - 0.5) * 0.08;
        switch (k) {
            case 'chop':
                this.noise(0.12, 0.12, 500);
                this.tone(160 * j, 0.14, 'triangle', 0.1, -60);
                break;
            case 'rock':
                this.noise(0.1, 0.1, 1800);
                this.tone(540 * j, 0.09, 'square', 0.04, -200);
                break;
            case 'pick':
                this.tone(880 * j, 0.07, 'triangle', 0.05);
                this.tone(1320 * j, 0.09, 'triangle', 0.045, 0, 0.05);
                break;
            case 'fell':
                this.tone(130, 0.35, 'sawtooth', 0.06, -70);
                this.noise(0.3, 0.08, 300);
                break;
            case 'pop':
                this.tone(420 * j, 0.12, 'sine', 0.08, 500);
                break;
            case 'coin':
                this.tone(1200 * j, 0.06, 'square', 0.04);
                this.tone(1800 * j, 0.12, 'square', 0.04, 0, 0.06);
                break;
            case 'build':
                this.noise(0.08, 0.1, 900);
                this.tone(300 * j, 0.1, 'square', 0.05, 200);
                break;
            case 'chest':
                this.tone(400, 0.1, 'triangle', 0.06, 300);
                this.tone(800, 0.2, 'triangle', 0.05, 0, 0.1);
                break;
            case 'land':
                this.tone(110, 0.5, 'sine', 0.12, -40);
                this.noise(0.5, 0.06, 200);
                this.tone(660, 0.3, 'triangle', 0.05, 400, 0.15);
                break;
            case 'level':
                [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.07, 0, i * 0.08));
                break;
            case 'hurt':
                this.tone(220, 0.25, 'sawtooth', 0.09, -140);
                break;
            case 'hit':
                this.noise(0.07, 0.09, 1200);
                this.tone(300 * j, 0.08, 'square', 0.05, -120);
                break;
            case 'deny':
                this.tone(200, 0.12, 'square', 0.05, -60);
                break;
            case 'dash':
                this.noise(0.15, 0.06, 2500);
                break;
            default:
                this.tone(500 * j, 0.06, 'sine', 0.04);
        }
    }
}
/** Floating words over the world (+3 wood, -1 ...), DOM elements following projected points. */
export class Floats {
    host: HTMLElement;
    items: { el: HTMLDivElement; x: number; y: number; z: number; age: number }[] = [];
    constructor(host: HTMLElement) {
        this.host = host;
    }
    add(x: number, y: number, z: number, text: string, color: number) {
        const el = document.createElement('div');
        el.className = 'float';
        el.textContent = text;
        el.style.color = '#' + color.toString(16).padStart(6, '0');
        this.host.appendChild(el);
        this.items.push({ el, x, y, z, age: 0 });
    }
    update(dt: number, project: (x: number, y: number, z: number) => { x: number; y: number }) {
        for (let i = this.items.length - 1; i >= 0; i--) {
            const f = this.items[i];
            f.age += dt;
            const s = project(f.x, f.y + f.age * 0.9, f.z);
            f.el.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) translate(-50%, -100%)`;
            f.el.style.opacity = String(f.age < 0.7 ? 1 : Math.max(0, 1 - (f.age - 0.7) / 0.5));
            if (f.age > 1.3) {
                f.el.remove();
                this.items.splice(i, 1);
            }
        }
    }
}
