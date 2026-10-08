// A little floor plan of a few buildings, drawn with the real building pictures: the Blueprint screen's
// starter layouts and the Build menu's "how it is used" examples. Pure drawing, no game state.

import type * as Phaser from 'phaser';
import { extent } from '../../shared/blueprint';
import { TILE } from '../../shared/config';
import { BUILDINGS, isBeltLike } from '../../shared/data/buildings';
import { DIRS } from '../../shared/sim/factory';
import { PAL } from '../../shared/palette';
import type { BlueprintItem } from '../../shared/sim/types';
import { label } from './kit';
import { rect } from './px';

interface PreviewOpts {
    /** Screen units per art unit: 2 makes a tile 32 wide. */
    scale?: number;
    /** Short captions over pieces (index into `items`). */
    marks?: { i: number; t: string }[];
    /** Draw the grass under it. */
    ground?: boolean;
}

export interface Preview { root: Phaser.GameObjects.Container; w: number; h: number; /** Room the captions need above the plan (units). */ pad: number }

/** The facing arrow for pieces that carry things one way (inserters and drills; belts and sorters draw their own). */
function arrow (g: Phaser.GameObjects.Graphics, cx: number, cy: number, rot: number, size: number, color: number) {
    const [dx, dy] = DIRS[rot & 3];
    const px = cx + dx * size, py = cy + dy * size;
    g.fillStyle(PAL.ink, 1).fillTriangle(px + dx * size * 0.9 - dy * size * 0.9, py + dy * size * 0.9 + dx * size * 0.9, px + dx * size * 0.9 + dy * size * 0.9, py + dy * size * 0.9 - dx * size * 0.9, px + dx * size * 1.9, py + dy * size * 1.9);
    g.fillStyle(color, 1).fillTriangle(px + dx * size * 0.6 - dy * size * 0.65, py + dy * size * 0.6 + dx * size * 0.65, px + dx * size * 0.6 + dy * size * 0.65, py + dy * size * 0.6 - dx * size * 0.65, px + dx * size * 1.55, py + dy * size * 1.55);
}

export function layoutPreview (scene: Phaser.Scene, items: BlueprintItem[], o: PreviewOpts = {}): Preview {
    const S = o.scale ?? 2, U = TILE * S;
    const box = extent(items);
    const root = scene.add.container(0, 0);
    if (o.ground !== false) {
        const g = scene.add.graphics();
        for (let y = 0; y < box.h; y++) for (let x = 0; x < box.w; x++) rect(g, x * U, y * U, U, U, (x + y) & 1 ? PAL.grass : 0x86c85a);
        root.add(g);
    }
    // flat things first (belts), then everything else from the back to the front
    const order = items.map((it, i) => ({ it, i })).sort((a, b) => {
        const fa = BUILDINGS[a.it.kind].floor ? 0 : 1, fb = BUILDINGS[b.it.kind].floor ? 0 : 1;
        return fa - fb || (a.it.dy + BUILDINGS[a.it.kind].size[1]) - (b.it.dy + BUILDINGS[b.it.kind].size[1]);
    });
    const over = scene.add.graphics();
    const at: { x: number; y: number }[] = [];
    for (const { it, i } of order) {
        const def = BUILDINGS[it.kind], [w, h] = def.size;
        const cx = (it.dx + w / 2) * U, cy = (it.dy + h / 2) * U;
        at[i] = { x: cx, y: (it.dy + h) * U - 1 };
        let img: Phaser.GameObjects.Image;
        if (isBeltLike(it.kind)) img = scene.add.image(cx, cy, def.tex, 0).setAngle((it.rot & 3) * 90);
        else if (it.kind === 'drill') img = scene.add.image(cx, cy, def.tex, 0).setAngle((it.rot & 3) * 90);
        else if (def.floor) img = scene.add.image(it.dx * U, it.dy * U, def.tex, 0).setOrigin(0, 0);
        else img = scene.add.image(cx, (it.dy + h) * U - 1, def.tex, 0).setOrigin(0.5, 1);
        img.setScale(S);
        root.add(img);
        if (it.kind === 'windturbine') root.add(scene.add.image(cx, (it.dy + h) * U - 1 - 19 * S, 'turbine_blades', 0).setScale(S));
    }
    root.add(over);
    for (const { it } of order) {
        const def = BUILDINGS[it.kind], [w, h] = def.size;
        if (it.kind === 'inserter') arrow(over, (it.dx + 0.5) * U, (it.dy + 0.5) * U, it.rot, U * 0.12, PAL.gold);
        else if (it.kind === 'drill') arrow(over, (it.dx + w / 2) * U, (it.dy + h / 2) * U, it.rot, U * 0.5, PAL.gold);
    }
    // which tiles hold a piece, so a caption can go below a piece that has a neighbour above it
    const used = new Set<string>();
    for (const it of items) { const [w, h] = BUILDINGS[it.kind].size; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) used.add(`${it.dx + x},${it.dy + y}`); }
    (o.marks ?? []).forEach((m, k) => {
        const p = at[m.i], it = items[m.i];
        if (!p || !it) return;
        const def = BUILDINGS[it.kind];
        const blocked = used.has(`${it.dx},${it.dy - 1}`) || used.has(`${it.dx + def.size[0] - 1},${it.dy - 1}`);
        const t = blocked
            ? label(scene, p.x, p.y + 2 * S, m.t, 10, PAL.cream, { dark: true, stroke: 3, origin: [0.5, 0], font: 'head', shadow: false })
            : label(scene, p.x, p.y - def.size[1] * U - 3 * S - (S < 2 && k % 2 ? 10 : 0), m.t, 10, PAL.cream, { dark: true, stroke: 3, origin: [0.5, 1], font: 'head', shadow: false });
        root.add(t);
    });
    return { root, w: box.w * U, h: box.h * U, pad: S < 2 ? 26 : 14 };
}
