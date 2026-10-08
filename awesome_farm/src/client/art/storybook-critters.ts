// Painted creatures: sixteen species × two walking frames, all facing right (the game flips them).
// A few body painters (a four-legged animal, a rodent) are tuned per species; five are one-offs.

import type { SpeciesId } from '../../shared/data/creatures';
import { INK, mixc, outlineOf, paint, paintFrames, Pix, RAMP } from './paint';

const EYE = 0x3a2433;
const ramp4 = (c: number) => [mixc(c, INK, 0.4), c, mixc(c, 0xffffff, 0.26), mixc(c, 0xffffff, 0.52)];

interface QuadOpts {
    body: number; belly?: number; head?: number; ear: number; earIn?: number; eye?: number; nose?: number;
    ears?: 'point' | 'long' | 'floppy';
    tail?: 'bush' | 'long' | 'curl' | 'flame' | 'flat' | 'none';
    tailC?: number; tailC2?: number;
    fat?: number; legs?: number;
    mane?: number; mane2?: number;
    teeth?: boolean; antlers?: number; glow?: number; stripe?: number; cheek?: number;
}

function quad (p: Pix, f: number, o: QuadOpts) {
    const R = ramp4(o.body), fat = o.fat ?? 0, legLen = 7 + (o.legs ?? 0) * 2, bob = f ? 1 : 0;
    const base = 39, bodyY = 27 - (o.legs ?? 0) * 1.5 - bob;
    const HR = ramp4(o.head ?? o.body);
    // the tail, behind everything
    const tc = ramp4(o.tailC ?? o.body), tc2 = o.tailC2 ?? R[3];
    switch (o.tail ?? 'bush') {
        case 'bush': p.ellipse(6, bodyY - 3, 6, 7, tc, { bias: 0.2 }); p.ellipse(5, bodyY - 5, 3, 3.6, [tc2]); break;
        case 'long': p.blade(10, bodyY, 3, bodyY + 2, 3, bodyY - 12, 2.2, tc); p.set(3, bodyY - 12, tc2); p.set(4, bodyY - 12, tc2); break;
        case 'curl': p.ellipse(7, bodyY - 6, 5, 6, tc, { bias: 0.2 }); p.ellipse(8, bodyY - 5, 2.2, 3, [mixc(tc[0], INK, 0.3)]); p.set(5, bodyY - 12, tc2); break;
        case 'flame': p.poly([[12, bodyY + 2], [9, bodyY - 6], [1, bodyY - 14], [6, bodyY - 5], [4, bodyY + 3]], (u, v) => (v < 0.5 ? 0xf79fc6 : 0xe85d62) + 0 * u); p.poly([[11, bodyY + 2], [8, bodyY - 3], [4, bodyY - 9], [7, bodyY]], 0xffd966); p.set(2, bodyY - 14, 0xfff3b0); break;
        case 'flat': p.poly([[10, bodyY + 3], [1, bodyY + 4], [1, bodyY - 1], [10, bodyY - 1]], (u) => (u < 0.5 ? tc[2] : tc[1])); for (let x = 3; x < 10; x += 2) p.set(x, bodyY + 1, tc[0]); break;
        default: break;
    }
    // far legs first (a little darker), then the body, then the near legs
    const L = (x: number, dy: number, dark: boolean) => { const len = legLen - dy; p.rect(x, base - len, 4, len, dark ? R[0] : R[1]); p.rect(x, base - len, 1, len, dark ? R[1] : R[2]); p.rect(x, base - 1, 4, 1, R[0]); };
    const a = f ? 2 : 0;
    L(16 + (f ? 1 : 0), 1 - a / 2, true); L(31 - (f ? 1 : 0), a / 2, true);
    p.ellipse(24, bodyY, 14 + fat, 9.5 + fat * 0.6, R, { bias: 0.25 });
    if (o.belly) p.ellipse(24, bodyY + 5, 9 + fat, 3.2, ramp4(o.belly), { bias: 0.4 });
    if (o.stripe) for (const x of [16, 22, 28]) p.line(x, bodyY - 6, x - 1, bodyY + 2, o.stripe);
    L(11 - (f ? 1 : 0), a / 2, false); L(35 + (f ? 1 : 0), 1 - a / 2, false);
    // mane and head
    if (o.mane) {
        // a ruff of pointed locks all round the head, then a fluffy ball under it
        const MR = ramp4(o.mane), cx = 35, cy = bodyY - 5;
        for (let i = 0; i < 9; i++) { const a = -Math.PI * 0.95 + i * ((Math.PI * 1.55) / 8); p.poly([[cx + Math.cos(a - 0.26) * 8, cy + Math.sin(a - 0.26) * 8], [cx + Math.cos(a) * 15.5, cy + Math.sin(a) * 15.5], [cx + Math.cos(a + 0.26) * 8, cy + Math.sin(a + 0.26) * 8]], i % 2 ? MR[2] : MR[1]); }
        p.ellipse(cx, cy, 10, 10, MR, { bias: 0.2 }); if (o.mane2) p.ellipse(cx, cy - 1, 6.6, 6.6, ramp4(o.mane2), { bias: 0.2 });
    }
    const hy = bodyY - 6;
    p.ellipse(37, hy, 8, 7.5, HR, { bias: 0.2 });
    p.ellipse(43, hy + 3, 5, 3.4, HR, { bias: 0.35 });
    p.rect(46, hy + 2, 2, 2, o.nose ?? INK);
    if (o.teeth) { p.set(44, hy + 6, 0xffffff); p.set(45, hy + 6, 0xffffff); }
    if (o.cheek) { p.rect(41, hy + 4, 3, 2, o.cheek); }
    // the eye
    const eye = o.eye ?? EYE;
    p.rect(39, hy - 3, 2, 3, eye); p.set(39, hy - 3, 0xffffff);
    if (o.glow) { p.rect(39, hy - 3, 2, 3, o.glow); p.set(39, hy - 3, 0xffffff); }
    // ears
    const e = o.ears ?? 'point', ER = ramp4(o.ear);
    if (e === 'point') { p.poly([[31, hy - 4], [36, hy - 8], [34, hy - 15]], ER[1]); p.poly([[36, hy - 8], [42, hy - 6], [41, hy - 15]], ER[2]); if (o.earIn) { p.poly([[33, hy - 5], [34, hy - 6], [34, hy - 11]], o.earIn); } }
    if (e === 'long') { p.ellipse(32, hy - 10, 2.6, 8, ER, { bias: 0.2 }); p.ellipse(38, hy - 11, 2.6, 8.4, ER, { bias: 0.2 }); if (o.earIn) { p.ellipse(32, hy - 10, 1, 6, [o.earIn]); p.ellipse(38, hy - 11, 1, 6.2, [o.earIn]); } }
    if (e === 'floppy') { p.ellipse(31, hy - 1, 3, 6, ER, { bias: 0.2 }); p.ellipse(40, hy - 2, 3, 5.5, ER, { bias: 0.4 }); }
    if (o.antlers) { const A = o.antlers; p.blade(33, hy - 6, 30, hy - 11, 31, hy - 16, 1.2, [A, A, A]); p.blade(31, hy - 11, 27, hy - 12, 25, hy - 15, 1, [A, A, A]); p.blade(39, hy - 7, 42, hy - 12, 41, hy - 17, 1.2, [A, A, A]); p.blade(41, hy - 12, 45, hy - 13, 47, hy - 16, 1, [A, A, A]); }
    p.outline((c) => (c === EYE || c === 0xffffff || c === o.glow ? c : outlineOf(c)));
}

interface RodentOpts { body: number; belly: number; earIn: number; tail: 'puff' | 'squirrel' | 'stub'; tailC: number; tailC2?: number; cheek?: number; teeth?: boolean; crest?: number; spark?: boolean }

function rodent (p: Pix, f: number, o: RodentOpts) {
    const R = ramp4(o.body), hop = f ? 2 : 0;
    // the tail
    if (o.tail === 'puff') p.ellipse(5, 31 - hop, 5, 5, [0xd9bfae, 0xfff0d2, 0xffffff], { bias: 0.3 });
    if (o.tail === 'squirrel') { p.ellipse(8, 17, 7, 13, ramp4(o.tailC), { bias: 0.2 }); p.ellipse(6, 12, 3.6, 6, ramp4(o.tailC2 ?? o.body), { bias: 0.2 }); }
    if (o.tail === 'stub') p.ellipse(5, 31 - hop, 3.6, 3.6, ramp4(o.tailC));
    // ears, long and upright
    p.ellipse(25, 8, 3.4, 8.6, R, { bias: 0.2 }); p.ellipse(33, 10, 3.4, 8.2, R, { bias: 0.35 });
    p.ellipse(25, 9, 1.4, 5.8, [o.earIn]); p.ellipse(33, 11, 1.4, 5.4, [o.earIn]);
    // body, belly, head
    p.ellipse(19, 29 - hop, 12.5, 9.4, R, { bias: 0.25 });
    p.ellipse(21, 33 - hop, 8, 4, ramp4(o.belly), { bias: 0.4 });
    p.ellipse(31, 22 - hop, 8, 7, R, { bias: 0.2 });
    p.rect(36, 24 - hop, 4, 4, o.body); p.rect(38, 24 - hop, 2, 2, 0xf59aa8);
    p.rect(35, 19 - hop, 2, 3, EYE); p.set(35, 19 - hop, 0xffffff);
    if (o.cheek) p.rect(32, 25 - hop, 4, 2, o.cheek);
    if (o.teeth) p.rect(37, 28 - hop, 2, 2, 0xffffff);
    if (o.crest) p.poly([[27, 17 - hop], [33, 15 - hop], [29, 9 - hop]], o.crest);
    if (o.spark) { for (const [x, y] of [[3, 5], [11, 1], [1, 14]] as const) { p.set(x, y, 0xffd966); p.set(x - 1, y, 0xffffff); p.set(x + 1, y, 0xffffff); p.set(x, y - 1, 0xffffff); } }
    // feet
    p.ellipse(13 + (f ? 2 : 0), 39, 4, 1.6, [R[0], R[1]]); p.ellipse(27 - (f ? 2 : 0), 39, 4, 1.6, [R[0], R[1]]);
    p.outline((c) => (c === EYE || c === 0xffffff ? c : outlineOf(c)));
}

// ── one-offs ───────────────────────────────────────────────────────────────
function fuzzle (p: Pix, f: number) {
    const W = RAMP.wool, bob = f ? 1 : 0, D = [0x25223f, 0x35305c, 0x4a4580, 0x6a64a8];
    // legs under a heap of wool
    for (const x of [12, 18, 31, 37]) { const lift = (x === 12 || x === 31) === !!f ? 1 : 0; p.rect(x, 33 + lift, 4, 6 - lift, D[1]); p.rect(x, 33 + lift, 1, 6 - lift, D[2]); }
    // wool: a ring of tufts, then one smooth ball over them
    for (let k = 0; k < 11; k++) { const a = (k / 11) * Math.PI * 2 + 0.2; p.ellipse(22 + Math.cos(a) * 12, 25 - bob + Math.sin(a) * 7.5, 4.4, 4.2, [Math.cos(a) < 0.1 && Math.sin(a) < 0.1 ? W[3] : W[2]]); }
    p.ellipse(22, 25 - bob, 13, 8.4, W, { bias: 0.5 });
    p.ellipse(16, 20 - bob, 6.4, 2.8, [W[3]]);
    for (const [x, y] of [[26, 22], [14, 30], [30, 29]] as const) { p.set(x, y - bob, W[0]); p.set(x + 1, y - bob, W[0]); p.set(x + 1, y + 1 - bob, W[0]); }
    // the dark face with a bright eye, and a floppy ear
    p.ellipse(38, 24 - bob, 8, 8.2, D, { bias: 0.25 });
    p.ellipse(44, 28 - bob, 3.4, 2.8, D, { bias: 0.4 }); p.rect(46, 27 - bob, 2, 2, 0xf08a96);
    p.rect(38, 21 - bob, 3, 4, 0xffffff); p.rect(39, 22 - bob, 2, 3, EYE);
    p.ellipse(31, 25 - bob, 3, 5.4, [D[0], D[1], D[2]], { bias: 0.4 });
    p.outline((c) => (c === EYE || c === 0xffffff ? c : outlineOf(c)));
}

function mossback (p: Pix, f: number) {
    const M = [0x3a6a3a, 0x4f8a4a, 0x6ab45a, 0x9ad870], S = [0x4a2f2a, 0x6a432f, 0x8f5a36];
    // head and four stubby legs
    p.ellipse(43, 28, 6, 5.6, ramp4(0x6ab45a), { bias: 0.2 }); p.rect(46, 29, 3, 3, 0x6ab45a); p.rect(40, 25, 2, 3, EYE); p.set(40, 25, 0xffffff);
    for (const [x, o] of [[10, f ? 1 : 0], [22, f ? 0 : 1], [32, f ? 1 : 0]] as const) { p.rect(x, 31 + o, 6, 6 - o, M[1]); p.rect(x, 31 + o, 1, 6 - o, M[2]); p.rect(x, 36, 6, 1, M[0]); }
    // the dome of a shell, with a brown underside and plates of moss
    p.ellipse(22, 31, 16, 4, S, { bias: 0.2 });
    p.ellipse(22, 22, 17, 13, M, { bias: 0.2 });
    p.ellipse(18, 16, 11, 6, [M[2], M[3]], { bias: 0.1 });
    for (const [x, y] of [[10, 18], [20, 12], [27, 20], [14, 26]] as const) { p.rect(x, y, 4, 1, M[0]); p.rect(x + 1, y + 1, 2, 1, M[0]); }
    // a little garden on its back
    for (const [x, y] of [[15, 5], [22, 3], [10, 7]] as const) { p.blade(x, y + 6, x - 2, y + 3, x - 2, y, 1.2, RAMP.leaf); p.blade(x, y + 6, x + 2, y + 3, x + 3, y + 1, 1.2, RAMP.leaf); }
    p.ellipse(25, 6, 2.4, 2.4, [0xd8588c, 0xf79fc6, 0xffdce8]); p.set(25, 6, 0xfff3b0);
    p.ellipse(12, 5, 2, 2, [0xd49a1a, 0xffd966]);
    p.outline((c) => (c === EYE || c === 0xffffff ? c : outlineOf(c)));
}

function bogsprout (p: Pix, f: number) {
    const V = ramp4(0x8b5cc8), bob = f ? 2 : 0;
    // a cream body with a face, under a big violet spotted cap
    p.rect(9, 19 + bob, 14, 14 - bob, RAMP.cream[2]); p.rect(9, 19 + bob, 2, 14 - bob, RAMP.cream[3]); p.rect(21, 19 + bob, 2, 14 - bob, RAMP.cream[1]);
    p.ellipse(16, 18 + bob, 15, 11, V, { bias: 0.15 });
    p.rect(1, 20 + bob, 30, 3, V[0]);
    for (const [x, y] of [[7, 12], [22, 11], [14, 17], [25, 18]] as const) p.ellipse(x, y + bob, 2.4, 2, [0xe8fbff, 0xffffff]);
    p.ellipse(11, 8 + bob, 4, 2, [0xf79fc6]);
    p.rect(12, 24 + bob, 2, 3, EYE); p.rect(19, 24 + bob, 2, 3, EYE); p.set(12, 24 + bob, 0xffffff); p.set(19, 24 + bob, 0xffffff);
    p.rect(15, 29 + bob, 3, 1, 0xe85d62);
    // sprouting feet
    p.rect(8 + (f ? 2 : 0), 34, 6, 4, RAMP.leaf[2]); p.rect(19 - (f ? 2 : 0), 34, 6, 4, RAMP.leaf[2]);
    p.outline((c) => (c === EYE || c === 0xffffff ? c : outlineOf(c)));
}

function glimmoth (p: Pix, f: number) {
    const up = f ? 0 : 6;
    // wings: pale blue above, white below, flapping between frames
    p.poly([[20, 12], [2, 2 + up], [3, 20 + up / 2]], (u, v) => (u > 0.5 ? 0xaee8f0 : 0xcdf4ee) + 0 * v);
    p.poly([[24, 12], [42, 2 + up], [41, 20 + up / 2]], (u, v) => (u < 0.5 ? 0xaee8f0 : 0xcdf4ee) + 0 * v);
    p.poly([[20, 14], [4, 18 + up / 2], [12, 26]], 0xffffff);
    p.poly([[24, 14], [40, 18 + up / 2], [32, 26]], 0xffffff);
    for (const [x, y] of [[10, 10 + up], [34, 10 + up]] as const) { p.rect(x, y, 3, 3, 0xffd966); p.rect(x + 1, y + 1, 1, 1, 0xfff3b0); }
    // body and antennae
    p.ellipse(22, 19, 3.8, 8, RAMP.cream, { bias: 0.2 }); p.ellipse(22, 10, 3.6, 3.4, RAMP.cream, { bias: 0.2 });
    p.rect(20, 9, 2, 2, EYE); p.rect(24, 9, 2, 2, EYE);
    p.blade(20, 7, 17, 4, 14, 0, 0.9, [0xe8e0c8, 0xe8e0c8]); p.blade(24, 7, 27, 4, 30, 0, 0.9, [0xe8e0c8, 0xe8e0c8]);
    p.rect(13, 0, 2, 2, 0xffd966); p.rect(30, 0, 2, 2, 0xffd966);
    for (const y of [20, 24]) p.rect(21, y, 2, 2, 0xffd966);
    p.outline((c) => (c === EYE ? c : mixc(0x7ab0c0, INK, 0.6)));
}

function scarabeau (p: Pix, f: number) {
    const B = [0x1f5a90, 0x2d7ac0, 0x4ab2cf, 0x9ae0ee], a = f ? 2 : 0;
    // six legs
    for (const x of [9, 19, 29]) { p.line(x, 20, x - 4 + a, 29, INK); p.line(x + 5, 20, x + 9 - a, 29, INK); }
    // the shell: a polished dome with a seam, glints, and a dark underside
    p.ellipse(20, 20, 16, 11, B, { bias: 0.2 });
    p.ellipse(17, 14, 10, 5, [B[2], B[3]], { bias: 0.1 });
    for (let y = 8; y < 28; y++) p.set(20, y, B[0]);
    p.ellipse(20, 27, 14, 3, [0x153a60]);
    for (const [x, y] of [[10, 17], [29, 17], [12, 22], [27, 22]] as const) p.rect(x, y, 2, 2, 0xffd966);
    // the head with its horn
    p.ellipse(36, 17, 5.4, 5, [0x153a60, 0x1f5a90]); p.set(38, 15, 0xffd966); p.set(39, 15, 0xffd966);
    p.poly([[36, 13], [41, 13], [40, 5]], 0x153a60);
    p.outline((c) => (c === 0xffd966 ? mixc(0xb8741a, INK, 0.4) : outlineOf(c)));
}

function crystalisk (p: Pix, f: number) {
    const S = [0x4a475c, 0x6c708c, 0x9aa0bb, 0xc4c9dc], I = RAMP.ice, a = f ? 2 : 0;
    // a tapering tail, then the body and head
    p.poly([[14, 24], [14, 32], [0, 34]], S[1]); p.poly([[12, 26], [10, 31], [0, 31]], S[2]);
    for (const [x, o] of [[12, a], [18, 2 - a], [26, 2 - a], [32, a]] as const) { p.rect(x, 30, 4, 7 - o / 2, S[1]); p.rect(x, 35 - o / 2, 4, 2, S[0]); }
    p.ellipse(22, 25, 13, 7, S, { bias: 0.2 });
    p.ellipse(20, 22, 9, 3, [S[2], S[3]]);
    p.ellipse(36, 22, 6, 5.2, S, { bias: 0.25 }); p.rect(40, 22, 7, 4, S[1]); p.rect(40, 22, 7, 1, S[2]);
    p.rect(39, 19, 2, 2, 0xffd966); p.rect(45, 23, 2, 1, INK);
    // crystals standing up along the spine
    for (let i = 0; i < 4; i++) { const x = 13 + i * 6, h = 8 + (i % 2) * 3; p.poly([[x - 2, 21], [x + 2, 21], [x, 21 - h]], i % 2 ? I[3] : I[2]); p.line(x, 21 - h + 2, x, 20, I[1]); }
    p.poly([[32, 18], [36, 18], [34, 8]], I[3]);
    p.outline((c) => (I.includes(c) || c === 0xffd966 ? mixc(I[0], INK, 0.5) : outlineOf(c)));
}

// ── the roster ─────────────────────────────────────────────────────────────
const QUADS: Partial<Record<SpeciesId, QuadOpts>> = {
    gnaw: { body: 0xa8703f, belly: 0xf4deaa, ear: 0x6a402f, ears: 'floppy', tail: 'flat', tailC: 0x6a402f, tailC2: 0xa8703f, teeth: true, fat: 0.8 },
    cinderkit: { body: 0xf8a24a, belly: 0xfff6e0, ear: 0xf8a24a, earIn: 0x2a1d2c, ears: 'point', tail: 'flame' },
    sandpaw: { body: 0xf4deaa, belly: 0xfff6e0, ear: 0xf4deaa, earIn: 0xf79fc6, ears: 'long', tail: 'long', tailC: 0xf4deaa, tailC2: 0x6a402f },
    frostpup: { body: 0xd5d9e6, belly: 0xfffbf4, ear: 0x666b86, ears: 'point', tail: 'curl', tailC: 0xfffbf4, tailC2: 0xcdf4ee, eye: 0x3f8fd8, stripe: 0x9ea4b9 },
    duskmaw: { body: 0x5d4a7c, belly: 0x78629a, ear: 0x5d4a7c, earIn: 0xf79fc6, ears: 'point', tail: 'long', tailC: 0x9d6fdb, tailC2: 0xf79fc6, glow: 0xffd966, teeth: true, nose: 0xf79fc6 },
    pyrelion: { body: 0xffd966, belly: 0xfff6e0, ear: 0xf8a24a, ears: 'point', tail: 'long', tailC: 0xffd966, tailC2: 0xe85d62, mane: 0xf8a24a, mane2: 0xe85d62, fat: 1 },
    aurorin: { body: 0xfffbf4, belly: 0xfff6e0, ear: 0xfffbf4, ears: 'point', tail: 'none', legs: 2, antlers: 0xffd966, eye: 0x5cb0d8, glow: 0xcdf4ee, nose: 0xf79fc6 },
};
const RODENTS: Partial<Record<SpeciesId, RodentOpts>> = {
    hopper: { body: 0xb4e47a, belly: 0xe4f6b4, earIn: 0xf79fc6, tail: 'puff', tailC: 0xffffff, cheek: 0xf79fc6 },
    pebbit: { body: 0x9ea4b9, belly: 0xd5d9e6, earIn: 0x666b86, tail: 'stub', tailC: 0xd5d9e6, crest: 0x666b86 },
    sparkit: { body: 0xf8a24a, belly: 0xfff6e0, earIn: 0xffd966, tail: 'squirrel', tailC: 0xf8a24a, tailC2: 0xffd966, spark: true, teeth: true },
};

/** Every species painted here (checked by a test against the species table). */
export const PAINTED_SPECIES = ['hopper', 'fuzzle', 'mossback', 'pebbit', 'gnaw', 'cinderkit', 'sparkit', 'sandpaw', 'scarabeau', 'frostpup', 'bogsprout', 'glimmoth', 'crystalisk', 'duskmaw', 'pyrelion', 'aurorin'];

/** A round speech bubble with a little tail: a worker's status icon floats inside it. */
function bubble (p: Pix) {
    const cx = 13, cy = 12;
    p.poly([[cx - 4, cy + 8], [cx + 4, cy + 8], [cx, cy + 16]], 0xfff6e0);
    p.ellipse(cx, cy, 11, 10, [0xe3cb9a, 0xf6e6c4, 0xfff0d2, 0xfffaf0], { bias: 0.2 });
    p.outline((c) => outlineOf(c, 0.55));
}

/** Paint every creature and the speech bubble the first time one is needed. */
function ensureCritterArt (scene: Phaser.Scene) {
    if (!scene.textures.exists('bubble')) registerStorybookCritters(scene);
}

/** The texture key of a species, painting the creatures first if they are not yet. */
export function critTex (scene: Phaser.Scene, sp: string) {
    ensureCritterArt(scene);
    return `crit_${sp}`;
}

function registerStorybookCritters (scene: Phaser.Scene) {
    paint(scene, 'bubble', 13, 15, (p) => bubble(p), 1);
    for (const [id, o] of Object.entries(QUADS)) paintFrames(scene, `crit_${id}`, 24, 21, 2, (p, _r, f) => quad(p, f, o), 1);
    for (const [id, o] of Object.entries(RODENTS)) paintFrames(scene, `crit_${id}`, 22, 21, 2, (p, _r, f) => rodent(p, f, o), 1);
    paintFrames(scene, 'crit_fuzzle', 24, 21, 2, (p, _r, f) => fuzzle(p, f), 1);
    paintFrames(scene, 'crit_mossback', 24, 19, 2, (p, _r, f) => mossback(p, f), 1);
    paintFrames(scene, 'crit_bogsprout', 16, 20, 2, (p, _r, f) => bogsprout(p, f), 1);
    paintFrames(scene, 'crit_glimmoth', 22, 18, 2, (p, _r, f) => glimmoth(p, f), 1);
    paintFrames(scene, 'crit_scarabeau', 22, 16, 2, (p, _r, f) => scarabeau(p, f), 1);
    paintFrames(scene, 'crit_crystalisk', 26, 19, 2, (p, _r, f) => crystalisk(p, f), 1);
}
