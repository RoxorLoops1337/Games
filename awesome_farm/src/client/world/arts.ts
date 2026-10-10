// The Combat Arts, drawn: the hook's chain, the arrow's streak, the ring of a Scorch, the lunge of a Headbutt and the Frost Zone lying on the
// ground until it melts. (The bursts and sounds are the `FX` table's: the sim sends them as actions.) Everything here is a world overlay lifted
// a little, so the 3D view shows it too (`overlay3d`).

import * as Phaser from 'phaser';
import { ARTS, type ArtId } from '../../shared/data/arts';
import type { SimEvent } from '../../shared/sim/types';
import { overlay3d } from './view3d-bridge';

type ArtEvent = Extract<SimEvent, { e: 'art' }>;
interface Shape { k: ArtId; x: number; y: number; tx: number; ty: number; r: number; t0: number; life: number; hit: boolean }
interface Zone { x: number; y: number; r: number; t0: number; until: number }

export class ArtFx {
    private g: Phaser.GameObjects.Graphics;
    private shapes: Shape[] = [];
    private zones: Zone[] = [];

    constructor (private scene: Phaser.Scene) {
        this.g = overlay3d(scene.add.graphics().setDepth(8.5e4), 0.7);
    }

    play (e: ArtEvent) {
        const now = this.scene.time.now, k = e.k as ArtId;
        if (!ARTS[k]) return;
        if (k === 'frost') { this.zones.push({ x: e.tx, y: e.ty, r: e.r ?? 46, t0: now, until: now + (e.secs ?? 4) * 1000 }); return; }
        const life = k === 'hook' ? 420 : k === 'arrow' ? 360 : k === 'ram' ? 300 : k === 'scorch' ? 480 : 700;
        this.shapes.push({ k, x: e.x, y: e.y, tx: e.tx, ty: e.ty, r: e.r ?? 0, t0: now, life, hit: !!e.hit });
    }

    update (now: number) {
        const g = this.g;
        if (!this.shapes.length && !this.zones.length) { if (g.visible) g.clear().setVisible(false); return; }
        g.clear().setVisible(true);
        this.shapes = this.shapes.filter((s) => now - s.t0 < s.life);
        for (const s of this.shapes) {
            const f = (now - s.t0) / s.life, a = 1 - f, col = ARTS[s.k].color;
            switch (s.k) {
                case 'hook': {
                    // the chain goes out then is hauled back; a hook on its end
                    const out = Math.min(1, f * 2.2), back = s.hit ? Math.max(0, (f - 0.35) * 1.5) : Math.max(0, (f - 0.5) * 2);
                    const l = Math.max(0, out - back);
                    const ex = s.x + (s.tx - s.x) * l, ey = s.y + (s.ty - s.y) * l;
                    g.lineStyle(3, 0x2a1d2c, a).lineBetween(s.x, s.y, ex, ey).lineStyle(1.5, col, a).lineBetween(s.x, s.y, ex, ey);
                    g.fillStyle(0xd5d9e6, a).fillCircle(ex, ey, 2.4);
                    break;
                }
                case 'arrow': {
                    const head = Math.min(1, f * 3), tail = Math.max(0, f * 3 - 0.8);
                    const hx = s.x + (s.tx - s.x) * head, hy = s.y + (s.ty - s.y) * head, tx = s.x + (s.tx - s.x) * tail, ty = s.y + (s.ty - s.y) * tail;
                    g.lineStyle(4, col, a * 0.35).lineBetween(tx, ty, hx, hy).lineStyle(1.6, 0xffffff, a).lineBetween(tx, ty, hx, hy);
                    g.fillStyle(0xffffff, a).fillCircle(hx, hy, 2.2);
                    break;
                }
                case 'scorch': {
                    const r = s.r * (0.25 + 0.75 * Math.sqrt(f));
                    g.lineStyle(5 * a + 1, 0xf8a24a, a).strokeCircle(s.x, s.y + 5, r).lineStyle(2, 0xffd966, a).strokeCircle(s.x, s.y + 5, r * 0.82);
                    break;
                }
                case 'shroud': {
                    const r = 10 + 20 * f;
                    g.lineStyle(2, col, a * 0.8).strokeCircle(s.x, s.y + 5, r).lineStyle(1, 0xe0c8ff, a * 0.6).strokeCircle(s.x, s.y + 5, r * 0.6);
                    break;
                }
                case 'ram': {
                    for (let i = 0; i < 3; i++) {
                        const o = (i - 1) * 4, nx = -(s.ty - s.y), ny = s.tx - s.x, l = Math.hypot(nx, ny) || 1;
                        g.lineStyle(2, i === 1 ? 0xffffff : col, a * 0.8).lineBetween(s.x + (nx / l) * o, s.y + (ny / l) * o, s.tx + (nx / l) * o, s.ty + (ny / l) * o);
                    }
                    break;
                }
                default: break;
            }
        }
        this.zones = this.zones.filter((z) => now < z.until);
        for (const z of this.zones) {
            const f = (now - z.t0) / (z.until - z.t0), fade = Math.min(1, (1 - f) * 4, f * 8), pulse = 0.5 + 0.5 * Math.sin(now / 220);
            g.fillStyle(0xcdf4ee, 0.16 * fade).fillCircle(z.x, z.y + 4, z.r);
            g.lineStyle(2, 0xffffff, (0.5 + 0.3 * pulse) * fade).strokeCircle(z.x, z.y + 4, z.r);
            for (let i = 0; i < 6; i++) {
                const a = (i / 6) * Math.PI * 2 + now / 1500, r = z.r * (0.35 + 0.4 * ((i * 0.37 + f) % 1));
                g.fillStyle(0xffffff, 0.8 * fade).fillRect(z.x + Math.cos(a) * r - 1, z.y + 4 + Math.sin(a) * r * 0.8 - 1, 2, 2);
            }
        }
    }
}
