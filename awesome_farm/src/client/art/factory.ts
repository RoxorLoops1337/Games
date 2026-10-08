// Factory sprites: belts (animated), drills, assemblers, generators (drawn top-down from
// code), poles and turbines (side view), and the ore-vein decals painted on the ground.

import { makeSprite } from './pixels';

const g = (...rows: string[]): string[] => {
    const w = Math.max(...rows.map((r) => r.length));
    return rows.map((r) => r.padEnd(w, '.'));
};

const blank = (w: number, h: number) => Array.from({ length: h }, () => Array(w).fill('.'));
const toRows = (m: string[][]) => m.map((r) => r.join(''));
const rect = (m: string[][], x: number, y: number, w: number, h: number, c: string) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (m[j]?.[i] !== undefined) m[j][i] = c;
};

// ── belt: 16×16 top-down, 4 frames of scrolling chevrons, drawn facing east ──
function beltFrame (f: number): string[] {
    const m = blank(16, 16);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        if (y < 2) m[y][x] = y === 0 ? 'T' : 't';
        else if (y > 13) m[y][x] = y === 15 ? 'k' : 'S';
        else m[y][x] = (x + y) % 5 === 0 ? 'S' : 'n';
    }
    for (let k = 0; k < 2; k++) {
        const cx = (f * 2 + k * 8) % 16;
        for (let d = -4; d <= 4; d++) {
            const x = (cx - Math.abs(d) + 16) % 16, y = 8 + d;
            if (y >= 2 && y <= 13) { m[y][x] = 'T'; m[y][(x + 1) % 16] = 't'; }
        }
    }
    return toRows(m);
}

// ── splitter and sorter: an open plate with a hub and arrows, drawn facing east ──
const px = (m: string[][], x: number, y: number, c: string) => { if (m[y]?.[x] !== undefined) m[y][x] = c; };
function junctionPlate (): string[][] {
    const m = blank(16, 16);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) m[y][x] = (x + y) % 5 === 0 ? 'S' : 'n';
    rect(m, 0, 0, 1, 16, 'S'); rect(m, 1, 0, 1, 16, 't');            // the back edge, where things arrive
    rect(m, 0, 0, 16, 1, 'k'); rect(m, 0, 15, 16, 1, 'k');
    return m;
}
function arm (m: string[][], dir: 'e' | 'n' | 's', c: string, pulse: number, pc: string) {
    if (dir === 'e') {
        rect(m, 10, 7, 4, 2, c); px(m, 14, 6, c); px(m, 14, 9, c); px(m, 15, 7, c); px(m, 15, 8, c);
        if (pulse >= 0) rect(m, 10 + pulse, 7, 1, 2, pc);
    } else if (dir === 'n') {
        rect(m, 7, 2, 2, 4, c); px(m, 6, 2, c); px(m, 9, 2, c); px(m, 7, 1, c); px(m, 8, 1, c);
        if (pulse >= 0) rect(m, 7, 5 - pulse, 2, 1, pc);
    } else {
        rect(m, 7, 10, 2, 4, c); px(m, 6, 13, c); px(m, 9, 13, c); px(m, 7, 14, c); px(m, 8, 14, c);
        if (pulse >= 0) rect(m, 7, 10 + pulse, 2, 1, pc);
    }
}
function splitterFrame (f: number): string[] {
    const m = junctionPlate();
    for (const d of ['e', 'n', 's'] as const) arm(m, d, 'T', f, 'y');
    rect(m, 5, 5, 6, 6, 'o'); rect(m, 6, 6, 4, 4, 'y'); px(m, 6, 6, 'w'); px(m, 7, 6, 'w');
    return toRows(m);
}
function sorterFrame (f: number): string[] {
    const m = junctionPlate();
    arm(m, 'e', 'T', f, 'w');
    arm(m, 'n', 'S', -1, 'S'); arm(m, 's', 'S', -1, 'S');
    rect(m, 5, 5, 6, 6, 'u'); rect(m, 6, 6, 4, 4, 'v'); rect(m, 7, 7, 2, 2, f % 2 ? 'k' : 'n');
    px(m, 6, 6, 'w');
    return toRows(m);
}

// ── underground belt: a belt that runs into (or out of) a stone arch, drawn facing east ──
function tunnelFrame (f: number, exit: boolean): string[] {
    const m = blank(16, 16);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        if (y < 2) m[y][x] = y === 0 ? 'T' : 't';
        else if (y > 13) m[y][x] = y === 15 ? 'k' : 'S';
        else m[y][x] = (x + y) % 5 === 0 ? 'S' : 'n';
    }
    // the open half of the belt keeps its scrolling chevrons
    for (let k = 0; k < 2; k++) {
        const cx = (f * 2 + k * 8) % 16;
        for (let d = -4; d <= 4; d++) {
            const x = (cx - Math.abs(d) + 16) % 16, y = 8 + d;
            if (y >= 2 && y <= 13) { m[y][x] = 'T'; m[y][(x + 1) % 16] = 't'; }
        }
    }
    // the arch: an entrance swallows items on the right, an exit gives them back on the left
    const x0 = exit ? 0 : 8;
    rect(m, x0, 1, 8, 14, 'S');
    rect(m, x0, 1, 8, 1, 'T'); rect(m, x0, 14, 8, 1, 't');
    rect(m, x0 + (exit ? 0 : 1), 3, 7, 10, 'T');
    rect(m, x0 + (exit ? 0 : 1), 4, 6, 8, 'k');
    rect(m, x0 + (exit ? 0 : 2), 5, 5, 6, 'n');
    rect(m, x0 + (exit ? 0 : 3), 6, 3, 4, 'k');
    // a coloured keystone tells the two ends apart at a glance: orange goes in, foam comes out
    const key = exit ? 'F' : 'o';
    rect(m, exit ? 5 : 8, 2, 3, 2, key); px(m, exit ? 6 : 9, 1, 'w');
    // a bright chevron on the plate shows which way it runs
    px(m, exit ? 8 : 5, 7, key); px(m, exit ? 8 : 5, 8, key); px(m, exit ? 9 : 4, 6, key); px(m, exit ? 9 : 4, 9, key);
    return toRows(m);
}

// ── top-down machines: 30×30 (32×32 with the outline = exactly 2×2 tiles) ──
function housing (m: string[][]) {
    rect(m, 0, 0, 30, 30, 'S');
    rect(m, 1, 1, 28, 28, 't');
    rect(m, 2, 2, 26, 26, 'T');
    rect(m, 2, 2, 26, 2, 'w');
    rect(m, 2, 26, 26, 2, 't');
    rect(m, 3, 4, 24, 22, 'S');
    for (const [x, y] of [[4, 5], [24, 5], [4, 22], [24, 22]]) { m[y][x] = 'k'; m[y][x + 1] = 'k'; m[y + 1][x] = 'k'; m[y + 1][x + 1] = 'T'; }   // rivets
}

function drillGrid (f: number): string[] {
    const m = blank(30, 30);
    housing(m);
    // the well and the spinning bit
    for (let y = 0; y < 30; y++) for (let x = 0; x < 30; x++) {
        const d = Math.hypot(x - 14.5, y - 14.5);
        if (d < 9.5) m[y][x] = d < 8.5 ? 'k' : 'n';
    }
    const arms = 4;
    for (let a = 0; a < arms; a++) {
        const ang = (a * Math.PI * 2) / arms + (f ? Math.PI / 4 : 0);
        for (let r = 1; r < 8; r++) {
            const x = Math.round(14.5 + Math.cos(ang) * r), y = Math.round(14.5 + Math.sin(ang) * r);
            m[y][x] = r < 5 ? 'T' : 'w';
            if (r > 3) { m[y + 1][x] = 't'; }
        }
    }
    rect(m, 12, 12, 5, 5, 'o'); rect(m, 13, 13, 3, 3, 'y');
    // output nozzle on the east edge
    rect(m, 24, 11, 6, 8, 'S'); rect(m, 25, 12, 5, 6, 'n'); rect(m, 26, 13, 4, 4, 'k');
    for (let i = 0; i < 3; i++) m[14 + (i % 2)][27 + i] = 'y';
    return toRows(m);
}

function assemblerGrid (f: number): string[] {
    const m = blank(30, 30);
    housing(m);
    // screen
    rect(m, 6, 7, 14, 12, 'k');
    rect(m, 7, 8, 12, 10, 'W');
    rect(m, 7, 8, 12, 4, 'F');
    rect(m, 8, 9, 5, 1, 'w');
    for (let i = 0; i < 4; i++) m[12 + i][9 + ((i + f) % 3) * 3] = 'w';
    // arm + conveyor to the east
    rect(m, 21, 7, 6, 12, 'n');
    for (let y = 8; y < 18; y += 2) rect(m, 22, y + (f ? 1 : 0), 4, 1, 't');
    // lights and vents
    rect(m, 6, 21, 3, 3, f ? 'g' : 'l'); rect(m, 10, 21, 3, 3, 'o'); rect(m, 14, 21, 3, 3, 'y');
    for (let i = 0; i < 4; i++) rect(m, 19 + i * 2, 22, 1, 3, 'k');
    return toRows(m);
}

function coalgenGrid (f: number): string[] {
    const m = blank(30, 30);
    housing(m);
    // furnace door
    rect(m, 6, 12, 14, 12, 'k');
    rect(m, 7, 13, 12, 10, 'n');
    rect(m, 9, 15, 8, 7, 'o');
    rect(m, 10, 16, 6, 5, 'y');
    rect(m, f ? 11 : 12, 17, 3, 3, 'w');
    // chimney seen from above
    for (let y = 0; y < 30; y++) for (let x = 0; x < 30; x++) {
        const d = Math.hypot(x - 22, y - 8);
        if (d < 5.5) m[y][x] = d < 3.6 ? 'k' : d < 4.6 ? 'S' : 't';
    }
    // generator coil
    rect(m, 22, 17, 5, 8, 'b'); for (let i = 0; i < 4; i++) rect(m, 22, 18 + i * 2, 5, 1, 'y');
    return toRows(m);
}

// ── solar panel (2×2, glinting) and battery (1×1, five charge levels) ──────
function solarGrid (f: number): string[] {
    const m = blank(30, 30);
    rect(m, 0, 0, 30, 30, 'S'); rect(m, 1, 1, 28, 28, 't'); rect(m, 2, 2, 26, 26, 'S');
    for (const cx of [3, 16]) for (const cy of [3, 16]) {
        rect(m, cx, cy, 11, 11, 'k');
        rect(m, cx + 1, cy + 1, 9, 9, 'D');
        for (let i = 0; i < 3; i++) { rect(m, cx + 1, cy + 4 + i * 3 - 3, 9, 1, 'W'); }
        rect(m, cx + 5, cy + 1, 1, 9, 'W');
        rect(m, cx + 1, cy + 1, 9, 1, 'F');
        if (f) { px(m, cx + 2, cy + 8, 'w'); px(m, cx + 3, cy + 7, 'w'); px(m, cx + 4, cy + 6, 'w'); }
    }
    for (const [x, y] of [[3, 14], [14, 3], [26, 14], [14, 26]]) { px(m, x, y, 'k'); px(m, x + 1, y, 'k'); }
    return toRows(m);
}
function batteryFrame (level: number): string[] {
    const m = blank(14, 14);
    rect(m, 1, 2, 12, 11, 'S'); rect(m, 1, 2, 12, 1, 'T'); rect(m, 1, 12, 12, 1, 't');
    rect(m, 2, 3, 10, 8, 'n');
    rect(m, 5, 0, 4, 2, 'T'); rect(m, 6, 0, 2, 1, 'w');
    for (let i = 0; i < 4; i++) if (i < level) rect(m, 3, 9 - i * 2, 8, 1, i === 3 ? 'l' : 'y');
    if (level === 0) { px(m, 6, 6, 'r'); px(m, 7, 6, 'r'); }
    return toRows(m);
}

// ── side-view props ────────────────────────────────────────────────────────
const POLE = g(
    '..TT..',
    '.TttT.',
    'bbbbbb',
    '..bd..',
    '..bd..',
    '..bd..',
    '..bB..',
    '..bB..',
    '..bB..',
    '.bBBb.',
);

const TURBINE_TOWER = g(
    '...........ww...........',
    '..........wTTw..........',
    '.........wTkkTw.........',
    '..........wTTw..........',
    '..........cccc..........',
    '..........cwcc..........',
    '..........cwcc..........',
    '..........cwcs..........',
    '..........cwcs..........',
    '..........cwcs..........',
    '..........cwcs..........',
    '..........cwcs..........',
    '..........cwcs..........',
    '..........cwcs..........',
    '..........cwcs..........',
    '..........cwcs..........',
    '.........ccwcss.........',
    '........ccccssss........',
    '.......ccccccssss.......',
    '.....SSSSSSSSSSSSSS.....',
);

const BLADES = (() => {
    const s = 33, c = 16;
    const m = blank(s, s);
    for (let b = 0; b < 3; b++) {
        const a = (b * 2 * Math.PI) / 3 - Math.PI / 2;
        for (let r = 2; r < 16; r++) {
            for (let w = -1; w <= 1; w++) {
                const x = Math.round(c + Math.cos(a) * r - Math.sin(a) * w * Math.max(0.4, 1 - r / 20));
                const y = Math.round(c + Math.sin(a) * r + Math.cos(a) * w * Math.max(0.4, 1 - r / 20));
                if (x >= 0 && x < s && y >= 0 && y < s) m[y][x] = w === 0 ? 'w' : 'c';
            }
        }
    }
    for (let y = c - 2; y <= c + 2; y++) for (let x = c - 2; x <= c + 2; x++) if (Math.hypot(x - c, y - c) <= 2.3) m[y][x] = 'T';
    m[c][c] = 'k';
    return toRows(m);
})();

const INSERTER_BASE = g(
    '..tttt..',
    '.tTTTTt.',
    '.tTSSTt.',
    '.tTSSTt.',
    '.SSSSSS.',
);

export const FACTORY_GRIDS: Record<string, string[]> = {
    pole: POLE, turbine_tower: TURBINE_TOWER, turbine_blades: BLADES, inserter_base: INSERTER_BASE,
    drill0: drillGrid(0), drill1: drillGrid(1), assembler0: assemblerGrid(0), assembler1: assemblerGrid(1),
    coalgen0: coalgenGrid(0), coalgen1: coalgenGrid(1),
    belt0: beltFrame(0), belt1: beltFrame(1), belt2: beltFrame(2), belt3: beltFrame(3),
    splitter0: splitterFrame(0), splitter1: splitterFrame(1), splitter2: splitterFrame(2), splitter3: splitterFrame(3),
    sorter0: sorterFrame(0), sorter1: sorterFrame(1), sorter2: sorterFrame(2), sorter3: sorterFrame(3),
    solar0: solarGrid(0), solar1: solarGrid(1),
    battery0: batteryFrame(0), battery1: batteryFrame(1), battery2: batteryFrame(2), battery3: batteryFrame(3), battery4: batteryFrame(4),
    tunnel0: tunnelFrame(0, false), tunnel1: tunnelFrame(1, false), tunnel2: tunnelFrame(2, false), tunnel3: tunnelFrame(3, false),
    tunnelx0: tunnelFrame(0, true), tunnelx1: tunnelFrame(1, true), tunnelx2: tunnelFrame(2, true), tunnelx3: tunnelFrame(3, true),
};

export function registerFactoryArt (scene: Phaser.Scene) {
    makeSprite(scene, 'belt', [0, 1, 2, 3].map(beltFrame), false);
    makeSprite(scene, 'splitter', [0, 1, 2, 3].map(splitterFrame), false);
    makeSprite(scene, 'sorter', [0, 1, 2, 3].map(sorterFrame), false);
    makeSprite(scene, 'tunnel', [0, 1, 2, 3].map((f) => tunnelFrame(f, false)), false);
    makeSprite(scene, 'tunnelx', [0, 1, 2, 3].map((f) => tunnelFrame(f, true)), false);
    makeSprite(scene, 'drill', [drillGrid(0), drillGrid(1)]);
    makeSprite(scene, 'assembler', [assemblerGrid(0), assemblerGrid(1)]);
    makeSprite(scene, 'coalgen', [coalgenGrid(0), coalgenGrid(1)]);
    makeSprite(scene, 'solar', [solarGrid(0), solarGrid(1)]);
    makeSprite(scene, 'battery', [0, 1, 2, 3, 4].map(batteryFrame));
    makeSprite(scene, 'inserter', INSERTER_BASE);
    makeSprite(scene, 'pole', POLE);
    makeSprite(scene, 'windturbine', TURBINE_TOWER);
    makeSprite(scene, 'turbine_blades', BLADES, false);
}
