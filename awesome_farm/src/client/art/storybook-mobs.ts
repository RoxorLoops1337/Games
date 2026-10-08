// Painted monsters, bosses, projectiles and markers: two frames each, the same logical sizes as before
// (the sim and the client animate states like telegraphs and stuns on top of these).

import { INK, mixc, outlineOf, paint, paintFrames, Pix, RAMP } from './paint';
import { lit } from './storybook-build';

const EYE = 0x3a2433;
const ramp4 = (c: number) => [mixc(c, INK, 0.4), c, mixc(c, 0xffffff, 0.26), mixc(c, 0xffffff, 0.52)];
const BONE = [0xbfb8a8, 0xe0dac8, 0xf4f0e2, 0xffffff];
const STONE = RAMP.stone, ICE = RAMP.ice, VI = RAMP.violet, WOOD = RAMP.wood;

const faced = (c: number) => (c === EYE || c === 0xffffff ? c : outlineOf(c));

// ── small monsters ─────────────────────────────────────────────────────────
function slime (p: Pix, f: number) {
    const R = [0x5d3a9a, 0x8b5cc8, 0xb48cec, 0xdcc4ff], tall = f ? 2 : 0;
    p.ellipse(12, 14 - tall / 2, 10.4 - tall * 0.4, 7.6 + tall, R, { bias: 0.3 });
    p.ellipse(8, 9 - tall / 2, 3.6, 1.8, [R[3]]);
    p.rect(7, 12 - tall / 2, 2, 3, EYE); p.rect(14, 12 - tall / 2, 2, 3, EYE); p.set(7, 12 - tall / 2, 0xffffff); p.set(14, 12 - tall / 2, 0xffffff);
    p.rect(11, 16 - tall / 2, 3, 1, 0x7a3a46);
    for (let x = 3; x < 21; x++) p.set(x, 20 - Math.floor(tall / 2), R[0]);
    p.outline(faced);
}

function skeleton (p: Pix, f: number) {
    // skull, ribs, arms and legs in bone
    p.ellipse(11, 6, 5.2, 4.8, BONE, { bias: 0.3 }); p.rect(7, 9, 8, 3, BONE[1]);
    p.rect(8, 6, 2, 2, INK); p.rect(12, 6, 2, 2, INK); p.rect(10, 8, 2, 1, BONE[0]);
    for (const x of [8, 10, 12]) p.rect(x, 11, 1, 2, INK);
    p.rect(10, 13, 2, 8, BONE[2]);
    for (const y of [15, 17, 19]) { p.rect(6, y, 10, 1, BONE[1]); p.rect(6, y, 10, 1, BONE[2]); p.set(6, y + 1, BONE[0]); p.set(15, y + 1, BONE[0]); }
    p.rect(3, 14, 3, 1, BONE[1]); p.rect(16, 14, 3, 1, BONE[1]); p.rect(3, 14, 1, 6, BONE[1]); p.rect(18, 14, 1, 6, BONE[1]);
    const a = f ? 1 : 0;
    p.rect(8, 21, 2, 4, BONE[1]); p.rect(12, 21, 2, 4, BONE[1]);
    p.rect(7 - a, 25, 4, 1, BONE[0]); p.rect(12 + a, 25, 4, 1, BONE[0]);
    p.outline();
}

function bat (p: Pix, f: number) {
    const B = ramp4(0x5d4a7c), up = f ? 0 : 5;
    // wings first: a scalloped sail of skin each side
    p.poly([[13, 9], [1, 1 + up], [3, 9 + up / 2], [6, 7 + up / 2], [8, 13], [11, 11]], (u) => (u < 0.5 ? B[1] : B[2]));
    p.poly([[17, 9], [29, 1 + up], [27, 9 + up / 2], [24, 7 + up / 2], [22, 13], [19, 11]], (u) => (u > 0.5 ? B[1] : B[2]));
    p.ellipse(15, 11, 4.6, 5.6, B, { bias: 0.2 });
    p.poly([[11, 6], [13, 2], [14, 7]], B[2]); p.poly([[19, 6], [17, 2], [16, 7]], B[2]);
    p.rect(12, 9, 2, 2, 0xe85d62); p.rect(17, 9, 2, 2, 0xe85d62);
    p.rect(14, 13, 1, 2, 0xffffff); p.rect(16, 13, 1, 2, 0xffffff);
    p.outline();
}

function boar (p: Pix, f: number) {
    const R = ramp4(0x8f5a36), D = ramp4(0x4a2f2a), a = f ? 2 : 0;
    for (const [x, o] of [[8, a], [24, 2 - a]] as const) { p.rect(x, 16, 3, 6 - o / 2, D[1]); p.rect(x, 21 - o / 2, 3, 1, D[0]); }
    p.ellipse(16, 12, 12.6, 8.4, R, { bias: 0.25 });
    for (let x = 6; x < 24; x += 2) p.poly([[x, 5], [x + 1, 2], [x + 2, 5]], D[1]);
    p.ellipse(28, 13, 5.2, 5.4, R, { bias: 0.3 });
    p.rect(30, 13, 4, 4, 0xe8a0a8); p.rect(33, 14, 1, 2, INK);
    p.poly([[29, 17], [31, 21], [28, 19]], 0xfffbf4); p.poly([[24, 3], [27, 0], [27, 5]], D[1]);
    p.rect(27, 9, 2, 2, EYE); p.set(27, 9, 0xffffff);
    for (const [x, o] of [[11, 2 - a], [20, a]] as const) { p.rect(x, 16, 3, 6 - o / 2, R[1]); p.rect(x, 16, 1, 6 - o / 2, R[2]); p.rect(x, 21 - o / 2, 3, 1, R[0]); }
    p.outline(faced);
}

function wisp (p: Pix, f: number) {
    const F = [0x7ab84f, 0xb4e47a, 0xe4f6b4, 0xffffd6];
    // a pale flame with a face
    p.poly([[11, 1 + f], [16, 9], [18, 15], [11, 21], [4, 15], [6, 9]], (u) => (u < 0.3 ? F[2] : u < 0.7 ? F[1] : F[0]));
    p.ellipse(11, 14, 5, 6, [F[1], F[2], F[3]], { bias: 0.1 });
    p.poly([[11, 4 + f], [13, 9], [11, 11]], F[3]);
    p.rect(8, 12, 2, 3, EYE); p.rect(13, 12, 2, 3, EYE); p.set(8, 12, 0xffffff); p.set(13, 12, 0xffffff);
    p.rect(10, 17, 3, 1, 0x7a3a46);
    if (f) { p.set(6, 5, F[3]); p.set(17, 7, F[3]); } else { p.set(5, 8, F[3]); p.set(17, 4, F[3]); }
    p.outline((c) => (c === EYE || c === 0xffffff ? c : mixc(F[0], INK, 0.55)));
}

function scarab (p: Pix, f: number) {
    const B = [0x1f5a90, 0x2d7ac0, 0x4ab2cf, 0x9ae0ee], a = f ? 1 : 0;
    for (const x of [5, 11, 17]) { p.line(x, 11, x - 2 + a, 16, INK); p.line(x + 3, 11, x + 5 - a, 16, INK); }
    p.ellipse(11, 10, 8, 6, B, { bias: 0.2 }); p.ellipse(9, 7, 5, 2.4, [B[2], B[3]]);
    for (let y = 4; y < 15; y++) p.set(11, y, B[0]);
    p.ellipse(18, 9, 2.6, 2.6, [0x153a60, B[0]]); p.set(19, 8, 0xffd966);
    p.set(6, 9, 0xffd966); p.set(15, 9, 0xffd966);
    p.outline();
}

function archer (p: Pix, f: number) {
    p.ellipse(11, 6, 4.6, 4.4, BONE, { bias: 0.3 }); p.rect(8, 8, 6, 2, BONE[1]);
    p.rect(8, 5, 2, 2, INK); p.rect(12, 5, 2, 2, INK);
    p.rect(10, 11, 2, 7, BONE[2]); for (const y of [12, 14, 16]) p.rect(7, y, 8, 1, BONE[1]);
    p.rect(8, 18, 2, 5, BONE[1]); p.rect(12, 18, 2, 5, BONE[1]);
    p.rect(7 - (f ? 1 : 0), 23, 4, 1, BONE[0]); p.rect(12 + (f ? 1 : 0), 23, 4, 1, BONE[0]);
    // a bow in the near hand, drawn a little further in the second frame
    p.blade(21, 4, 26, 12, 21, 21, 1.2, WOOD); p.line(21, 4, 21 - (f ? 3 : 1), 12, 0xe0dac8); p.line(21 - (f ? 3 : 1), 12, 21, 21, 0xe0dac8);
    p.line(14, 12, 19, 12, BONE[1]);
    p.outline();
}

function rockling (p: Pix, f: number) {
    const bob = f ? 1 : 0;
    p.ellipse(13, 12 + bob, 10.5, 8.5, STONE, { bias: 0.2 });
    p.ellipse(9, 8 + bob, 5, 3, [STONE[3], STONE[4]]);
    p.rect(8, 11 + bob, 3, 2, 0xf8a24a); p.rect(15, 11 + bob, 3, 2, 0xf8a24a); p.set(8, 11 + bob, 0xfff3b0); p.set(15, 11 + bob, 0xfff3b0);
    p.line(12, 14 + bob, 14, 14 + bob, STONE[0]);
    p.line(18, 6 + bob, 21, 10 + bob, STONE[0]);
    p.ellipse(3, 14, 2.4, 3, STONE); p.ellipse(23, 14, 2.4, 3, STONE);
    p.rect(7, 19 + bob, 5, 3 - bob, STONE[1]); p.rect(14, 19 + bob, 5, 3 - bob, STONE[1]);
    p.outline();
}

function frostling (p: Pix, f: number) {
    const bob = f ? 1 : 0;
    // a spiky crown, a pale body and a little frozen smile
    p.poly([[9, 0 + bob], [11, 6 + bob], [7, 6 + bob]], ICE[3]); p.poly([[4, 3 + bob], [8, 7 + bob], [4, 9 + bob]], ICE[2]); p.poly([[14, 3 + bob], [10, 7 + bob], [14, 9 + bob]], ICE[2]);
    p.ellipse(9, 12 + bob, 6, 6.4, ICE, { bias: 0.3 });
    p.rect(6, 11 + bob, 2, 3, EYE); p.rect(10, 11 + bob, 2, 3, EYE); p.set(6, 11 + bob, 0xffffff); p.set(10, 11 + bob, 0xffffff);
    p.rect(8, 16 + bob, 3, 1, ICE[0]);
    p.poly([[4, 17 + bob], [14, 17 + bob], [12, 23], [6, 23]], ICE[2]); p.rect(6, 22, 6, 2, ICE[1]);
    p.outline((c) => (c === EYE || c === 0xffffff ? c : mixc(ICE[0], INK, 0.55)));
}

function bogtoad (p: Pix, f: number) {
    const G = ramp4(0x5cb04f), a = f ? 1 : 0;
    p.ellipse(14, 13, 12.6, 6.8, G, { bias: 0.25 });
    p.ellipse(10, 9, 6, 2.4, [G[3]]);
    for (const [x, y] of [[8, 14], [14, 16], [20, 13]] as const) p.ellipse(x, y, 1.8, 1.4, [G[0]]);
    // bulging eyes on top of the head
    p.ellipse(22, 6, 3.2, 3.2, [0xb89a20, 0xffd966]); p.rect(22, 5, 2, 2, EYE); p.ellipse(16, 5, 3, 3, [0xb89a20, 0xffd966]); p.rect(16, 4, 2, 2, EYE);
    p.rect(22, 15, 6, 1, G[0]);
    p.ellipse(5, 17, 4, 2.2, [G[0], G[1]]); p.rect(20 + a, 17, 6, 3, G[1]); p.rect(6 - a, 18, 5, 2, G[0]);
    p.outline(faced);
}

function wraith (p: Pix, f: number) {
    const R = [0x35305c, 0x5d4a7c, 0x8b5cc8, 0xb48cec];
    // a hooded ghost with a ragged hem and glowing eyes
    p.poly([[15, 1], [24, 6], [27, 18], [24, 22], [21, 18 + f], [18, 24], [15, 20 + f], [12, 24], [9, 18], [6, 22], [3, 18], [6, 6]], (u, v) => (u < 0.3 ? R[2] : u < 0.7 ? R[1] : R[0]) + 0 * v);
    p.ellipse(15, 9, 6, 6, [R[0], R[1]], { bias: 0.1 });
    p.rect(11, 8, 3, 3, 0xcdf4ee); p.rect(17, 8, 3, 3, 0xcdf4ee); p.set(12, 9, 0xffffff); p.set(18, 9, 0xffffff);
    p.rect(14, 14, 3, 2, R[0]);
    p.outline((c) => (c === 0xcdf4ee || c === 0xffffff ? c : mixc(R[0], INK, 0.5)));
}

function knight (p: Pix, f: number) {
    const A = [0x5a5f7a, 0x8c92ac, 0xb8bed4, 0xe4e8f4], a = f ? 1 : 0;
    // a plume, a helmet with a visor slit, a breastplate, and boots
    p.poly([[11, 0], [15, 3], [12, 6], [9, 3]], 0xe85d62); p.poly([[11, 0], [13, 2], [11, 4]], 0xf59a96);
    p.ellipse(11, 9, 5.4, 5.4, A, { bias: 0.3 }); p.rect(7, 9, 9, 2, INK); p.rect(8, 9, 7, 1, 0xf8a24a);
    lit(p, 5, 14, 12, 8, A); p.rect(5, 17, 12, 1, A[0]);
    p.rect(2, 15, 3, 7, A[1]); p.rect(17, 15, 3, 7, A[0]);
    lit(p, 6, 22, 4, 5, A); lit(p, 12, 22, 4, 5, A);
    p.rect(5 - a, 27, 6, 1, A[0]); p.rect(12 + a, 27, 6, 1, A[0]);
    p.outline();
}

// ── bosses ─────────────────────────────────────────────────────────────────
function slimeKing (p: Pix, f: number) {
    const R = [0x5d3a9a, 0x8b5cc8, 0xb48cec, 0xdcc4ff], sq = f ? 2 : 0, GOLD = RAMP.brass;
    p.ellipse(32, 34 + sq, 29, 18 - sq, R, { bias: 0.3 });
    p.ellipse(22, 26 + sq, 14, 5.6, [R[3]]);
    for (let x = 8; x < 56; x++) p.set(x, 46 + sq, R[0]);
    // the crown
    const cy = 8 + sq;
    p.rect(18, cy + 8, 28, 7, GOLD[2]); p.rect(18, cy + 8, 28, 2, GOLD[3]); p.rect(18, cy + 13, 28, 2, GOLD[1]);
    for (const x of [18, 29, 40]) p.poly([[x, cy + 8], [x + 6, cy + 8], [x + 3, cy]], GOLD[2]);
    p.rect(31, cy + 10, 3, 3, 0xe85d62); p.rect(21, cy + 10, 2, 2, 0xffffff); p.rect(41, cy + 10, 2, 2, 0xffffff);
    // the face
    p.rect(19, 32 + sq, 9, 9, 0xffffff); p.rect(36, 32 + sq, 9, 9, 0xffffff);
    p.rect(24, 34 + sq, 4, 6, EYE); p.rect(41, 34 + sq, 4, 6, EYE); p.set(24, 34 + sq, 0xffffff); p.set(41, 34 + sq, 0xffffff);
    p.line(25, 44 + sq, 39, 44 + sq, EYE); p.line(23, 42 + sq, 25, 44 + sq, EYE); p.line(39, 44 + sq, 41, 42 + sq, EYE);
    p.outline((c) => (c === EYE || c === 0xffffff ? c : mixc(GOLD.includes(c) ? GOLD[0] : R[0], INK, 0.5)));
}

function colossus (p: Pix, f: number) {
    const S = STONE;
    // legs, torso, head, and arms that rise in the second frame
    lit(p, 16, 52, 14, 22, S); lit(p, 40, 52, 14, 22, S); p.rect(14, 70, 18, 4, S[0]); p.rect(38, 70, 18, 4, S[0]);
    lit(p, 12, 22, 46, 32, S);
    for (const [x, y] of [[18, 30], [28, 36], [40, 28], [22, 46]] as const) { p.rect(x, y, 6, 3, 0x6c9a49); p.rect(x + 1, y + 1, 4, 1, 0x4f7e3e); }
    p.ellipse(35, 38, 6, 6, [0xa83a2a, 0xe85d62, 0xf8a24a]); p.ellipse(35, 38, 3, 3, [0xffd966, 0xfff3b0]);
    lit(p, 24, 6, 22, 18, S); p.rect(24, 6, 22, 4, S[4]);
    p.rect(28, 14, 4, 4, 0xf8a24a); p.rect(38, 14, 4, 4, 0xf8a24a); p.set(28, 14, 0xfff3b0); p.set(38, 14, 0xfff3b0); p.rect(31, 20, 8, 2, S[0]);
    const up = f ? 10 : 0;
    lit(p, 0, 26 - up, 12, 28, S); lit(p, 58, 26 - up, 12, 28, S);
    lit(p, 0, 52 - up, 14, 12, S); lit(p, 56, 52 - up, 14, 12, S);
    p.rect(0, 60 - up, 14, 4, S[0]); p.rect(56, 60 - up, 14, 4, S[0]);
    p.outline();
}

function witch (p: Pix, f: number) {
    const sway = f ? 2 : -2;
    // hat, face, hair, robe and an orb
    p.poly([[26, 0], [10, 24], [42, 24]], (u) => (u < 0.4 ? VI[2] : u < 0.75 ? VI[1] : VI[0]));
    lit(p, 6, 22, 40, 6, VI); p.rect(12, 18, 28, 4, 0xe0a020); p.rect(12, 18, 28, 1, 0xffd966);
    p.set(26, 4, 0xf79fc6); p.set(24, 8, 0xf79fc6);
    p.rect(12, 30, 6, 16, 0x35305c); p.rect(34, 30, 6, 16, 0x35305c);
    p.ellipse(26, 34, 10, 9, [0x3a7a3a, 0x5cb04f, 0x9ad870], { bias: 0.3 });
    p.rect(18, 30, 4, 4, 0xffd966); p.rect(30, 30, 4, 4, 0xffd966); p.rect(19, 31, 2, 2, EYE); p.rect(31, 31, 2, 2, EYE);
    p.poly([[26, 34], [22, 42], [30, 42]], 0x3a7a3a); p.rect(22, 44, 8, 1, EYE);
    p.poly([[26, 40], [8, 62], [44, 62]], (u) => (u < 0.5 ? 0x5d4a7c : 0x35305c)); lit(p, 14, 48, 24, 14, [0x25222f, 0x35305c, 0x5d4a7c, 0x7a64a0]);
    for (let x = 8; x <= 42; x += 6) p.poly([[x, 60], [x + 6, 60], [x + 3 + sway, 67]], 0x35305c);
    p.rect(18, 48, 16, 2, VI[2]);
    p.ellipse(6, 48, 5, 5, [0x7ac0c0, 0xcdf4ee, 0xffffff]); p.set(4, 46, 0xffffff);
    p.rect(10, 52, 6, 2, 0x5cb04f); p.rect(44, 50, 6, 2, 0x5cb04f);
    p.outline((c) => (c === EYE || c === 0xffffff ? c : outlineOf(c)));
}

function pharaoh (p: Pix, f: number) {
    const C = RAMP.cream, G = RAMP.brass, BL = [0x1f5a90, 0x2d7ac0, 0x4ab2cf];
    // wrapped body, golden collar, headdress with blue stripes, a staff with a golden orb
    lit(p, 14, 32, 28, 36, C); for (let y = 38; y < 68; y += 6) p.rect(14, y, 28, 1, C[0]);
    p.rect(16, 66, 10, 4, 0x666b86); p.rect(30, 66, 10, 4, 0x666b86);
    lit(p, 12, 30, 32, 8, G); p.rect(16, 38, 24, 2, G[1]);
    for (const x of [20, 28, 36]) p.rect(x, 33, 3, 3, BL[2]);
    lit(p, 18, 6, 20, 24, G); for (let y = 6; y < 30; y += 4) p.rect(18, y, 20, 2, BL[1]);
    lit(p, 10, 12, 8, 22, G); lit(p, 38, 12, 8, 22, G); for (let y = 14; y < 34; y += 4) { p.rect(10, y, 8, 2, BL[1]); p.rect(38, y, 8, 2, BL[1]); }
    p.rect(20, 12, 16, 16, 0xe0c08a); p.rect(22, 16, 4, 4, EYE); p.rect(30, 16, 4, 4, EYE); p.rect(22, 16, 2, 2, 0xcdf4ee); p.rect(30, 16, 2, 2, 0xcdf4ee);
    p.rect(24, 24, 8, 2, G[1]); p.rect(26, 28, 4, 6, BL[1]); p.set(28, 8, 0xe85d62); p.set(28, 10, 0x5cb04f);
    const lift = f ? 6 : 0;
    lit(p, 6, 36 - lift, 8, 20, C); lit(p, 42, 36, 8, 20, C);
    p.rect(0, 8 - lift, 4, 56, WOOD[2]); p.ellipse(2, 6 - lift, 5, 5, G, { bias: 0.1 }); p.set(2, 4 - lift, 0xe85d62);
    p.outline((c) => (c === EYE || c === 0xcdf4ee ? c : outlineOf(c)));
}

function frostGiant (p: Pix, f: number) {
    const I = ICE;
    lit(p, 16, 54, 14, 20, [I[0], I[1], I[2], I[3]]); lit(p, 40, 54, 14, 20, [I[0], I[1], I[2], I[3]]); p.rect(14, 70, 18, 4, I[0]); p.rect(38, 70, 18, 4, I[0]);
    lit(p, 12, 24, 46, 32, [I[0], I[1], I[2], I[3]]);
    for (const x of [16, 26, 36, 46]) p.poly([[x, 24], [x + 5, 24], [x + 2, 17]], I[3]);
    lit(p, 20, 44, 30, 12, [0xc8d8e8, 0xdce8f2, 0xf0f6fb, 0xffffff]);
    lit(p, 22, 6, 26, 22, [0x585c7c, 0x7a7f9e, 0x9ea4bf, 0xc4c9dc]); p.rect(22, 6, 26, 4, 0xc4c9dc);
    lit(p, 26, 16, 18, 10, [0xc8d8e8, 0xdce8f2, 0xf0f6fb, 0xffffff]); p.rect(29, 18, 4, 4, I[1]); p.rect(37, 18, 4, 4, I[1]); p.rect(30, 19, 2, 2, EYE); p.rect(38, 19, 2, 2, EYE);
    p.poly([[22, 10], [16, 0], [24, 6]], 0xe4e8f4); p.poly([[48, 10], [54, 0], [46, 6]], 0xe4e8f4);
    const up = f ? 10 : 0;
    lit(p, 0, 28 - up, 12, 28, [I[0], I[1], I[2], I[3]]); lit(p, 58, 28 - up, 12, 28, [I[0], I[1], I[2], I[3]]);
    lit(p, 0, 54 - up, 14, 12, [0xc8d8e8, 0xdce8f2, 0xf0f6fb, 0xffffff]); lit(p, 56, 54 - up, 14, 12, [0xc8d8e8, 0xdce8f2, 0xf0f6fb, 0xffffff]);
    p.outline((c) => (c === EYE ? c : outlineOf(c)));
}

function oldHeart (p: Pix, f: number) {
    const H = [0x7a1a30, 0xb02a44, 0xe8434f, 0xf59aa0], e = f ? 2 : 0;
    // roots under it, the two lobes and a point, veins, and a great yellow eye
    for (const [x0, x1] of [[12, 4], [24, 16], [40, 40], [56, 64], [68, 76]] as const) { p.line(x0, 56, x1, 72, WOOD[0]); p.line(x0 + 1, 56, x1 + 1, 72, WOOD[1]); p.line(x0 + 2, 56, x1 + 2, 72, WOOD[2]); }
    for (const x of [6, 76, 40]) p.set(x, 72, 0x5cb04f);
    p.ellipse(27, 26, 19 + e, 17 + e, H, { bias: 0.2 }); p.ellipse(53, 26, 19 + e, 17 + e, H, { bias: 0.25 });
    p.poly([[8 - e, 30], [72 + e, 30], [40, 68 + e]], (u, v) => (u < 0.35 ? H[2] : u < 0.7 ? H[1] : H[0]) + 0 * v);
    p.ellipse(20, 18, 8, 5, [H[3]]);
    for (const [x0, y0, x1, y1] of [[16, 28, 24, 44], [60, 24, 52, 44], [40, 12, 40, 28]] as const) p.line(x0, y0, x1, y1, 0xf8a24a);
    p.ellipse(40, 38, 12, 8, [0xe8e0c8, 0xffffff]); p.ellipse(40, 38, 6, 7, [0xe0a020, 0xffd966, 0xfff3b0]); p.rect(39, 32, 3, 14, EYE); p.set(36, 34, 0xffffff);
    p.outline((c) => (c === EYE || c === 0xffffff ? c : mixc(H[0], INK, 0.55)));
}

// ── projectiles and markers ────────────────────────────────────────────────
function arrow (p: Pix) { p.rect(0, 4, 14, 2, WOOD[3]); p.poly([[14, 1], [16, 5], [14, 9]], 0xc4c9dc); p.poly([[0, 1], [4, 5], [0, 9]], 0xf4f0e2); p.outline(); }
function orb (p: Pix) { p.ellipse(6, 6, 5, 5, [0x4ab2cf, 0x9ae0ee, 0xe8fbff, 0xffffff], { bias: 0.1 }); p.outline((c) => mixc(0x2d7ac0, INK, 0.5) + 0 * c); }
function rockShot (p: Pix) { p.ellipse(7, 6, 6, 5, STONE, { bias: 0.2 }); p.outline(); }
function spore (p: Pix) { p.ellipse(6, 6, 5, 5, [0x3a7a3a, 0x5cb04f, 0xb4e47a], { bias: 0.1 }); p.set(4, 4, 0xe4f6b4); p.outline(); }
function frostShot (p: Pix) { p.poly([[7, 0], [9, 5], [14, 7], [9, 9], [7, 14], [5, 9], [0, 7], [5, 5]], (u) => (u < 0.5 ? 0xe8fbff : 0xaee8f0)); p.set(7, 7, 0xffffff); p.outline((c) => mixc(0x5a8fb8, INK, 0.4) + 0 * c); }
function fireShot (p: Pix) { p.poly([[7, 0], [11, 7], [10, 13], [4, 13], [3, 7]], (u, v) => (v < 0.4 ? 0xffe08a : v < 0.7 ? 0xffb040 : 0xf07a22) + 0 * u); p.ellipse(7, 10, 2.4, 2.8, [0xe85d62, 0xffd966]); p.outline((c) => mixc(0xa83a14, INK, 0.3) + 0 * c); }
function bolt (p: Pix) { p.ellipse(6, 6, 5, 5, [0x6a52a6, 0x9a74d8, 0xc4a4f0, 0xf79fc6], { bias: 0.1 }); p.outline((c) => mixc(0x4a3a7a, INK, 0.4) + 0 * c); }
function markElite (p: Pix) { p.poly([[0, 8], [0, 2], [3, 5], [5, 0], [7, 5], [10, 2], [10, 8]], RAMP.brass[2]); p.rect(0, 6, 10, 2, RAMP.brass[1]); p.set(5, 4, 0xe85d62); p.outline(); }
function markAlert (p: Pix) { p.rect(0, 0, 4, 8, 0xe85d62); p.rect(0, 0, 1, 8, 0xf59a96); p.rect(0, 10, 4, 2, 0xe85d62); p.outline(); }
function markStun (p: Pix) { for (const [x, y] of [[1, 5], [8, 1], [5, 6]] as const) p.poly([[x + 2, y], [x + 3, y + 2], [x + 5, y + 2], [x + 3, y + 4], [x + 4, y + 6], [x + 2, y + 5], [x, y + 6], [x + 1, y + 4], [x - 1, y + 2], [x + 1, y + 2]], RAMP.brass[2]); p.outline(); }

/** The ice block a frozen farmer stands in (world/costatus.ts): a chunky pale-blue block, see-through enough to show the farmer inside. */
function iceBlock (p: Pix) {
    const solid: number[] = [];
    p.poly([[2, 4], [5, 1], [29, 1], [32, 4], [33, 33], [30, 37], [5, 37], [2, 34]], (u, v) => (v < 0.15 ? ICE[3] : u > 0.8 || v > 0.88 ? ICE[0] : u < 0.18 ? ICE[2] : ICE[1]));
    for (const [x0, y0, x1, y1] of [[6, 7, 6, 21], [7, 7, 7, 12], [12, 3, 24, 3]]) p.line(x0, y0, x1, y1, 0xffffff);                         // the glint down the lit edge and along the top
    for (const [x0, y0, x1, y1] of [[14, 33, 20, 26], [20, 26, 19, 21], [20, 26, 27, 24]]) p.line(x0, y0, x1, y1, ICE[0]);                       // a crack that has not given way yet
    for (const [x, y] of [[10, 5], [27, 10], [4, 28]]) { p.set(x, y, 0xffffff); p.set(x + 1, y, 0xffffff); p.set(x, y + 1, 0xffffff); }          // sparkles
    for (let i = 0; i < p.d.length; i++) if (p.d[i] !== -1) solid.push(i);
    p.outline((c) => mixc(0x3d6a9a, INK, 0.35) + 0 * c);
    for (const i of solid) p.a[i] = p.d[i] === 0xffffff ? 0.95 : p.d[i] === ICE[3] ? 0.7 : 0.5;                                                     // (see-through: the outline stays solid)
}

/** The texture of every monster painted here (checked by a test against the monster table). */
export const MOB_TEXTURES = ['slime', 'skeleton', 'bat', 'boar', 'wisp', 'scarab', 'archer', 'rockling', 'frostling', 'bogtoad', 'wraith', 'knight', 'slimeking', 'colossus', 'witch', 'pharaoh', 'frostgiant', 'oldheart'];

/** Paint the monsters, bosses, shots, marks and the ice block the first time one is needed (a fresh island by day has none). */
export function ensureMobArt (scene: Phaser.Scene) {
    if (!scene.textures.exists('slime')) registerStorybookMobs(scene);
}

function registerStorybookMobs (scene: Phaser.Scene) {
    const two = (key: string, w: number, h: number, draw: (p: Pix, f: number) => void) => paintFrames(scene, key, w, h, 2, (p, _r, f) => draw(p, f), 1);
    two('slime', 12, 10, slime); two('skeleton', 11, 13, skeleton); two('bat', 15, 9, bat); two('boar', 17, 11, boar); two('wisp', 11, 11, wisp);
    two('scarab', 11, 9, scarab); two('archer', 13, 13, archer); two('rockling', 13, 11, rockling); two('frostling', 9, 12, frostling);
    two('bogtoad', 15, 10, bogtoad); two('wraith', 15, 12, wraith); two('knight', 11, 14, knight);
    two('slimeking', 32, 28, slimeKing); two('colossus', 36, 40, colossus); two('witch', 28, 34, witch);
    two('pharaoh', 30, 38, pharaoh); two('frostgiant', 36, 40, frostGiant); two('oldheart', 42, 40, oldHeart);
    paint(scene, 'proj_arrow', 8, 5, (p) => arrow(p), 1); paint(scene, 'proj_orb', 6, 6, (p) => orb(p), 1); paint(scene, 'proj_rock', 7, 6, (p) => rockShot(p), 1);
    paint(scene, 'proj_spore', 6, 6, (p) => spore(p), 1); paint(scene, 'proj_frost', 7, 7, (p) => frostShot(p), 1); paint(scene, 'proj_fire', 7, 7, (p) => fireShot(p), 1);
    paint(scene, 'proj_bolt', 6, 6, (p) => bolt(p), 1);
    paint(scene, 'mark_elite', 5, 4, (p) => markElite(p), 1); paint(scene, 'mark_alert', 2, 6, (p) => markAlert(p), 1); paint(scene, 'mark_stun', 6, 6, (p) => markStun(p), 1);
    paint(scene, 'fx_ice', 17, 19, (p) => iceBlock(p), 1);
}
