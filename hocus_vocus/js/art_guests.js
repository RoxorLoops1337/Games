// Hocus Vocus: ART.guest and ART.mascot: the 12 guest artists the Guest cards bring on stage (DESIGN 4.3 "Guests") and the 6 Mascots the
// tour bus can adopt (DESIGN 4.7 "The Mascot"), drawn in the owners' chibi style from the cast kit (ART.rj, ART.rj.foe). Extends ART (art.js),
// loads after art_enemies_3.js. One IIFE, no global. Tests: tests/hocus_vocus_art_guests.test.mjs.
//
// PUBLIC API (used by scene.js, screen_combat.js and the gallery)
//   ART.guest.draw(ctx, guestId, {x, y, s, pose, t, pt, flip, alpha, shadow})   (x, y) is the FEET CENTRE, nominal height about 150 * s, the
//        figure faces RIGHT (toward the enemies; flip mirrors it). pose: idle (a loop of t) | act (a bounce and a raised arm, 450 ms) | enter (two
//        hops in from the left wing, 520 ms) | exit (a wave, then a walk off to the left while fading, 1100 ms) | shove (a quick knock off the stage,
//        420 ms: what a replaced guest gets). One-shots derive from pt (seconds since the pose began) and hold their end frame; the exit poses end
//        invisible. shadow:false skips the ground ellipse. An unknown id draws a labelled placeholder, never throws (a drawing failure warns once).
//   ART.guest.bounds(guestId) -> {w, h, head:{x,y}, body:{x,y}, feet:{x,y}}   offsets from the feet centre at s = 1 (the same shape as ART.enemy.bounds)
//   ART.guest.poseMs(pose) -> ms   act 450, enter 520, exit 1100, shove 420, idle 0        ART.guest.ids() -> the 12 ids, in DATA.guests order
//   ART.mascot.draw(ctx, mascotId, {x, y, s, pose, t, pt, level, flip, alpha, shadow})   feet centre, nominal height about 90 * s, faces right.
//        pose: idle | cheer (a hop with sparkles, 800 ms, loops while held). level 2 adds a bandana, level 3 a tiny crown as well, so growth shows.
//   ART.mascot.bounds(mascotId) -> {w, h, head, body, feet}   ART.mascot.poseMs(pose)   ART.mascot.ids() -> the 6 ids
//   ART.has('guest', id) and ART.has('mascot', id) are true for every drawn id. Gallery sheets: guests (12 x 4 poses), mascots (6 x levels and poses),
//   guest_dev (params id= pose= t= pt= zoom=).
//
// HOW THEY ARE BUILT. Every figure is a small cutout puppet drawn live (a few hundred canvas calls, no sprite baking: at most three stand on the
//   stage at once). A POSE is resolved into channels P = {dx, dy, hop, lean, sx, sy, arm (0 rest .. 1 raised), wave, mouth, open (blink), look,
//   beat, notes, flip, alpha} by resolve(pose, t, pt, seed), and each spec draws its parts from them: the humanoids share one chibi body builder
//   (person), the creatures and machines draw themselves. Shared helpers keep the house look: the kit's warm brown line (RJ.C.ink, main width 2),
//   flat candy colour with ONE warm hard shadow and a thin lit highlight (RJ.cel), capsule limbs with one outline (RJ.blob), the foe kit's big
//   flat-cel eyes and mouths (FOE.eyes, FOE.mouth, with the warm line), blush hatch marks, notes and sparkles from the toolkit. A guest wears its
//   owner's accent (DATA.heroes[hero].color / dark / accent: Jasmin pink, RoxorLoops green, RawClaw violet, Andy orange); a mascot its own palette
//   family (DATA.mascots[id].art.c through ART.tk.fam). Deterministic: t drives every loop, blinks come from RJ.blinkOpen(t, seed), there is no
//   clock and no banned random call. Printable ASCII only.
(() => {
  'use strict';
  const tk = ART.tk, RJ = ART.rj, FOE = RJ.foe, C = RJ.C;
  const TAU = Math.PI * 2, PI = Math.PI, sin = Math.sin, cos = Math.cos, abs = Math.abs;
  const num = tk.num, clamp = tk.clamp, lerp = tk.lerp;
  const INK = C.ink, LW = 2.0, LWF = 1.3;
  const ell = (cx, cy, rx, ry, n, rot) => tk.ellipsePts(cx, cy, Math.max(0.6, rx), Math.max(0.6, ry), n || 14, rot || 0);
  const rr = (x, y, w, h, r) => tk.rrectPts(x, y, Math.max(1, w), Math.max(1, h), Math.max(0.5, Math.min(r, w / 2, h / 2)));
  const warned = {};
  const warnOnce = (key, e) => { if (warned[key]) return; warned[key] = true; if (typeof console !== 'undefined' && console.warn) console.warn('[art_guests] ' + key + ': ' + ((e && e.message) || e)); };
  const ease = tk.ease || {}, outCubic = ease.outCubic || ((p) => 1 - Math.pow(1 - p, 3)), inQuad = ease.inQuad || ((p) => p * p);

  // ---------------------------------------------------------------------------------------------------------------
  // the house strokes
  // ---------------------------------------------------------------------------------------------------------------
  // a cel shape: warm line, flat base, one warm shadow, a thin highlight (o.hi false turns it off)
  function cel(g, pts, base, o) {
    o = o || {};
    RJ.cel(g, pts, base, Object.assign({ line: o.line === undefined ? LW : o.line, lineColor: INK, hi: o.hi === undefined ? true : o.hi, wobble: 0.03, weightVar: 0.3 }, o));
  }
  const oval = (g, cx, cy, rx, ry, base, o) => cel(g, ell(cx, cy, rx, ry, clamp(Math.round(Math.max(rx, ry) / 3) + 8, 10, 22)), base, o);
  const box = (g, x, y, w, h, r, base, o) => cel(g, rr(x, y, w, h, r), base, o);
  // a stubby capsule limb [x, y] to [x, y], one outline
  function limb(g, a, b, w, col, o) {
    o = o || {};
    RJ.blob(g, [{ a: [num(a[0]), num(a[1])], b: [num(b[0]), num(b[1])], w: Math.max(1, num(w, 9)) }], { fill: col, shade: o.shade || RJ.shade(col), ink: INK, L: o.line || LW, lit: 1.4 });
  }
  const dot = (g, x, y, r, col) => { g.beginPath(); g.arc(num(x), num(y), Math.max(0.4, num(r, 1)), 0, TAU); g.fillStyle = col; g.fill(); };
  const line = (g, pts, o) => RJ.ink(g, pts, Object.assign({ w: LWF, color: INK, taper: 0.3, wobble: 0.02 }, o));
  function eyes(g, x, y, w, o) { FOE.eyes(g, x, y, w, Object.assign({ lineColor: INK, kind: 'round' }, o)); }
  function mouth(g, x, y, w, kind, o) { FOE.mouth(g, x, y, w, kind || 'smile', Object.assign({ ink: INK }, o)); }
  // two little blush hatches either side of the face centre
  function blush(g, x, y, d, s) { RJ.hatch(g, [[x - d - s * 0.6, y - s * 0.4, x - d - s * 0.1, y + s * 0.4], [x - d + s * 0.1, y - s * 0.4, x - d + s * 0.6, y + s * 0.4], [x + d - s * 0.6, y - s * 0.4, x + d - s * 0.1, y + s * 0.4], [x + d + s * 0.1, y - s * 0.4, x + d + s * 0.6, y + s * 0.4]], { color: C.blush, w: 1.5, alpha: 0.75 }); }
  // the ground shadow under the feet (drawn BEFORE the hop lift, so it stays on the floor and shrinks as the figure rises)
  function groundShadow(g, w, lift, al) {
    const k = clamp(1 - lift / 160, 0.4, 1);
    g.save(); g.scale(1, 0.22); g.globalAlpha *= 0.34 * al * k; g.beginPath(); g.arc(0, 0, Math.max(2, w * 0.5 * k), 0, TAU); g.fillStyle = tk.pal.ink; g.fill(); g.restore();
  }
  // notes rising above (x, y): k 0..1 strength, col the note colour
  function notesUp(g, x, y, t, k, col, n) {
    if (!(k > 0.02)) return;
    const m = tk.motion();
    for (let i = 0; i < (n || 3); i++) {
      const u = ((t * 0.55 * m + i / (n || 3)) % 1 + 1) % 1, a = sin(PI * u) * k;
      if (a <= 0.03) continue;
      tk.note(g, x + (i - 1) * 13 + sin(t * 2.2 + i) * 4, y - u * 34, 7.5, { kind: i === 1 ? 'quarter' : 'eighth', color: col, alpha: a });
    }
  }
  function sparklesAround(g, x, y, r, t, k, col) {
    if (!(k > 0.02)) return;
    for (let i = 0; i < 3; i++) { const an = t * 1.6 + i * TAU / 3, s = (4 + 2 * sin(t * 5 + i)) * k; tk.sparkle(g, x + cos(an) * r, y + sin(an) * r * 0.5 - 6, Math.max(0.5, s), { color: col, alpha: 0.9 * k, glow: 0.35, rot: an }); }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // colours: a guest wears its owner's accent, a mascot its palette family
  // ---------------------------------------------------------------------------------------------------------------
  const HERO_FALLBACK = { hanae: ['#ff7eb6', '#b0245c', '#fff4f8'], kuro: ['#3fcf6a', '#0f3a1e', '#c6ff3d'], suzu: ['#a77bff', '#3b2470', '#e9ddff'], raiga: ['#ff9a2e', '#5a2a0a', '#ffe45e'] };
  function accentOf(hero) {
    const d = typeof DATA !== 'undefined' && DATA.heroes ? DATA.heroes[hero] : null, f = HERO_FALLBACK[hero] || HERO_FALLBACK.hanae;
    const main = (d && d.color) || f[0], dark = (d && d.dark) || f[1], light = (d && d.accent) || f[2];
    return { main, dark, light, mid: RJ.shade(main, 0.08), pale: RJ.tint(main, 0.55) };
  }
  function famOf(name) {
    const f = tk.fam ? tk.fam(name) : null;
    return f ? { main: f.base, dark: f.dark, light: f.light, mid: RJ.shade(f.base, 0.08), pale: RJ.tint(f.base, 0.55) } : accentOf('hanae');
  }
  const GREY = '#c9c3d8', GREY_D = '#8a86a8', CREAM = '#fff4e6', GOLD = '#ffd84d', BLACK = '#2b2633', WHITE = '#fffaf1', WOOD = '#b9743a', CHROME = '#c9cbd6', RED = '#e8553f';

  // ---------------------------------------------------------------------------------------------------------------
  // poses
  // ---------------------------------------------------------------------------------------------------------------
  const GUEST_MS = { act: 450, enter: 520, exit: 1100, shove: 420, idle: 0 };
  const MASCOT_MS = { cheer: 800, idle: 0 };
  const basePose = () => ({ dx: 0, dy: 0, hop: 0, lean: 0, sx: 1, sy: 1, arm: 0.1, wave: 0, mouth: 'smile', open: 1, look: [0.3, 0.1], beat: 0, notes: 0, dust: 0, flip: false, alpha: 1, p: 0, pose: 'idle' });
  function idleLife(P, t, seed, amp) {
    const m = tk.motion(), a = amp === undefined ? 1 : amp;
    const br = sin(t * 2.4 + seed) * 0.013 * m * a;
    P.dy = sin(t * 2.4 + seed) * 1.5 * m * a; P.lean = sin(t * 0.9 + seed * 0.3) * 0.02 * m * a;
    P.sy = 1 + br; P.sx = 1 - br * 0.6;
    P.arm = 0.1 + sin(t * 1.3 + seed) * 0.05 * m;
    P.open = RJ.blinkOpen(t, seed);
    P.look = [0.3 + sin(t * 0.5 + seed) * 0.2, 0.1];
    P.beat = 0.5 + 0.5 * sin(t * 4.4 + seed);
    return P;
  }
  // the channels of a guest pose: idle loops on t, the one-shots on pt and hold (or end invisible)
  function resolve(pose, t, pt, seed) {
    const P = basePose();
    P.pose = pose;
    t = num(t); pt = Math.max(0, num(pt));
    const m = tk.motion();
    switch (pose) {
      case 'act': {
        const p = clamp(pt / 0.45, 0, 1);
        P.p = p;
        if (p >= 1) return idleLife(P, t, seed);
        const j = sin(PI * p);
        P.hop = j * 22 * m; P.arm = j; P.notes = j; P.mouth = 'happyOpen'; P.open = 1; P.look = [0.6, -0.3];
        const sq = p < 0.12 ? 1 - 0.12 * sin(PI * p / 0.12) : p > 0.86 ? 1 - 0.1 * sin(PI * (p - 0.86) / 0.14) : 1 + 0.05 * j;
        P.sy = sq; P.sx = 1 + (1 - sq) * 0.9; P.lean = 0.06 * j; P.beat = j;
        return P;
      }
      case 'enter': {
        const p = clamp(pt / 0.52, 0, 1);
        P.p = p;
        if (p >= 1) return idleLife(P, t, seed);
        const e = outCubic(p);
        P.dx = -150 * (1 - e) * (m === 1 ? 1 : 0.3); P.hop = abs(sin(p * PI * 2)) * 18 * (1 - p * 0.4) * m; P.alpha = clamp(p * 4, 0, 1);
        P.mouth = 'grin'; P.open = 1; P.arm = 0.35; P.lean = -0.06 * (1 - p); P.dust = p > 0.4 && p < 0.6 ? 1 : p > 0.9 ? 1 : 0;
        const land = p > 0.9 ? 1 - 0.14 * sin(PI * (p - 0.9) / 0.1) : 1;
        P.sy = land; P.sx = 1 + (1 - land) * 0.9;
        return P;
      }
      case 'exit': {
        const p = clamp(pt / 1.1, 0, 1);
        P.p = p;
        if (p < 0.45) {                                              // the goodbye wave
          const w = p / 0.45;
          P.arm = 1; P.wave = sin(w * PI * 5) * 0.5; P.mouth = 'smile'; P.open = RJ.blinkOpen(t, seed); P.look = [-0.5, 0]; P.dy = sin(w * PI * 5) * 1.2 * m; P.beat = w;
          return P;
        }
        const w = (p - 0.45) / 0.55, e = inQuad(w);                   // then the walk off to the left wing
        P.flip = true; P.dx = -230 * e; P.dy = -abs(sin(pt * 14)) * 3.5 * m; P.lean = 0.06; P.arm = 0.3 + 0.25 * sin(pt * 14);
        P.alpha = w > 0.55 ? clamp(1 - (w - 0.55) / 0.45, 0, 1) : 1; P.mouth = 'smile'; P.look = [0.4, 0];
        if (p >= 1) P.alpha = 0;
        return P;
      }
      case 'shove': {
        const p = clamp(pt / 0.42, 0, 1);
        P.p = p;
        P.dx = -260 * p * p; P.hop = sin(PI * p) * 30 * m; P.lean = -0.7 * p; P.alpha = clamp(1 - p * p * 1.1, 0, 1); P.mouth = 'ow'; P.open = 0.25; P.arm = 0.9; P.look = [-0.4, -0.6]; P.dust = p < 0.2 ? 1 : 0;
        if (p >= 1) P.alpha = 0;
        return P;
      }
      case 'cheer': {                                                // mascots: a happy hop that loops while held
        const u = ((pt / 0.8) % 1 + 1) % 1, j = abs(sin(u * PI));
        P.p = u; P.hop = j * 14 * m; P.arm = 1; P.mouth = 'happyOpen'; P.open = 1; P.notes = 1; P.beat = j; P.look = [0.4, -0.4];
        P.sy = 1 - 0.06 * Math.pow(cos(u * PI), 8); P.sx = 1 + (1 - P.sy) * 0.8;
        return P;
      }
      default: return idleLife(P, t, seed);
    }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // the chibi body shared by the human guests (feet at the origin, facing +x, head centre at o.headY, head radius o.headR)
  // ---------------------------------------------------------------------------------------------------------------
  // o: skin top pants shoes headY headR wide (torso half width) skirt (a skirt instead of legs) hair(g,S) backHair(g,S) hat(g,S) torso(g,S) front(g,S)
  //    face: {eye (w), mouthW, kind} armF (the front hand target when raised, [x, y]) armsFront (both hands forward on a prop) noBackArm
  function person(g, S, o) {
    const P = S.P, A = S.A;
    const skin = o.skin || C.skin, top = o.top || A.main, pants = o.pants || A.dark, shoes = o.shoes || BLACK;
    const hy = o.headY === undefined ? -120 : o.headY, hr = o.headR || 29, hw = o.wide || 19;
    const neck = hy + hr * 0.8, hip = o.hip === undefined ? -34 : o.hip, shY = neck + 10;
    const armLen = hip - neck - 4;
    // the back arm (toward the viewer's left)
    if (!o.noBackArm) {
      const sb = [-hw * 0.7, shY];
      const hb = o.armsFront ? [hw + 16, shY + 14] : [sb[0] - 8 - 6 * P.arm, shY + armLen * (1 - P.arm * 1.3)];
      limb(g, sb, hb, 9, o.sleeve || top); RJ.hand(g, 'fist', hb[0], hb[1], o.armsFront ? -0.2 : -PI / 2 + P.arm, { skin, shade: RJ.shade(skin), k: 0.72 });
    }
    if (o.backHair) o.backHair(g, S);
    // legs or a skirt
    if (o.skirt) {
      cel(g, [[-hw - 2, hip - 6, 1], [hw + 2, hip - 6, 1], [hw + 10, -4, 1], [-hw - 10, -4, 1]], o.skirt, { hi: true });
      oval(g, -8, -3, 8, 4.5, shoes, { hi: false }); oval(g, 9, -3, 8, 4.5, shoes, { hi: false });
    } else {
      limb(g, [-8, hip], [-10, -7], 11, pants); limb(g, [9, hip], [11, -7], 11, pants);
      oval(g, -11, -4, 9.5, 5, shoes, { hi: true }); oval(g, 12, -4, 9.5, 5, shoes, { hi: true });
    }
    // torso
    box(g, -hw, neck - 2, hw * 2, hip - neck + 8, hw * 0.55, top, { hi: true });
    if (o.torso) o.torso(g, S);
    // the front arm: rests by the side, rises with P.arm, waves with P.wave
    const sf = [hw * 0.7, shY];
    let hf;
    if (o.armsFront) hf = [hw + 18, shY + 12];
    else {
      const rest = [sf[0] + 7, shY + armLen], up = o.armF || [sf[0] + 18, shY - armLen * 1.1];
      hf = [lerp(rest[0], up[0], P.arm) + P.wave * 14, lerp(rest[1], up[1], P.arm) + abs(P.wave) * 4];
    }
    limb(g, sf, hf, 9.5, o.sleeve || top);
    RJ.hand(g, P.arm > 0.6 && !o.armsFront ? 'open' : 'fist', hf[0], hf[1], o.armsFront ? -0.3 : -PI / 2 + P.arm * 0.6 + P.wave, { skin, shade: RJ.shade(skin), k: 0.78 });
    // head and face
    oval(g, 0, hy, hr * 1.04, hr, skin, { hi: true });
    RJ.ear(g, -hr * 0.9, hy + hr * 0.08, { skin, k: hr / 50 });
    const f = o.face || {}, ex = hr * 0.26, ey = hy - hr * 0.08, ew = f.eye || hr * 0.4;
    eyes(g, ex, ey, ew, { open: P.open, look: P.look, kind: f.kind || 'round', gap: ew * 1.35, iris: f.iris });
    mouth(g, hr * 0.28, hy + hr * 0.46, f.mouthW || hr * 0.5, P.mouth);
    blush(g, hr * 0.22, hy + hr * 0.26, hr * 0.55, hr * 0.14);
    if (o.hair) o.hair(g, S);
    if (o.hat) o.hat(g, S);
    if (o.front) o.front(g, S);
  }
  // a plain round cap of hair on the skull: col, with a fringe tuft toward the face
  function hairCap(g, hy, hr, col, o) {
    o = o || {};
    cel(g, [[-hr * 1.1, hy - hr * 0.1], [-hr * 1.05, hy - hr * 0.7], [-hr * 0.4, hy - hr * 1.12], [hr * 0.5, hy - hr * 1.1], [hr * 1.05, hy - hr * 0.6], [hr * 0.9, hy - hr * 0.3, 1], [hr * 0.55, hy - hr * 0.55], [hr * 0.1, hy - hr * 0.42], [-hr * 0.5, hy - hr * 0.5]], col, { hi: o.hi === undefined ? true : o.hi });
  }

  // ---------------------------------------------------------------------------------------------------------------
  // the twelve guests: {hero, w, h, head:[x,y], body:[x,y], draw(g, S)}  (S = {P, A, t, seed, id})
  // ---------------------------------------------------------------------------------------------------------------
  const GUESTS = {};
  // ---- Jasmin's guests ------------------------------------------------------------------------------------------
  // BACKING CHOIR: three small singers in pink robes, the middle one a step forward, all three breathing on the same beat
  GUESTS.guest_backing_choir = {
    hero: 'hanae', w: 112, h: 128, head: [0, -108], body: [0, -60],
    draw(g, S) {
      const P = S.P, A = S.A, t = S.t;
      const singer = (x, k, ph, hairCol) => {
        const hy = -98 * k, hr = 22 * k, bob = sin(t * 2.4 + ph) * 1.4;
        g.save(); g.translate(x, bob);
        cel(g, [[-18 * k, hy + hr * 0.7, 1], [18 * k, hy + hr * 0.7, 1], [26 * k, -2, 1], [-26 * k, -2, 1]], A.main, { hi: true });
        line(g, [[0, hy + hr * 0.9], [0, -8]], { color: A.dark, w: 1.2, alpha: 0.6 });
        limb(g, [-14 * k, hy + hr * 1.3], [-20 * k, hy + hr * 2.2 - P.arm * 10], 7 * k, A.main);
        limb(g, [14 * k, hy + hr * 1.3], [20 * k, hy + hr * 2.2 - P.arm * 10], 7 * k, A.main);
        oval(g, 0, hy, hr * 1.04, hr, C.skin, { hi: true });
        hairCap(g, hy, hr, hairCol);
        eyes(g, hr * 0.25, hy - hr * 0.05, hr * 0.4, { open: P.open, look: P.look, gap: hr * 0.55 });
        mouth(g, hr * 0.28, hy + hr * 0.45, hr * 0.5, P.pose === 'idle' && P.beat > 0.5 ? 'O' : P.mouth === 'smile' ? 'O' : P.mouth);
        blush(g, hr * 0.22, hy + hr * 0.26, hr * 0.55, hr * 0.14);
        g.restore();
      };
      singer(-34, 0.86, 0, '#6b3a28'); singer(34, 0.86, 2.1, '#f2b63c');
      singer(0, 1, 1.05, '#2b2633');
      notesUp(g, 0, -118, t, 0.6 + 0.4 * P.notes, A.main, 3);
    },
  };
  // HARP GRANDMA: a grey bun, round glasses, a pink cardigan, a long skirt and a small golden harp she strums with the front hand
  GUESTS.guest_harp_grandma = {
    hero: 'hanae', w: 96, h: 150, head: [0, -118], body: [0, -70],
    draw(g, S) {
      const P = S.P, A = S.A;
      person(g, S, {
        top: A.main, skirt: A.dark, headY: -118, headR: 29, armF: [40, -112],
        hair(gg) { hairCap(gg, -118, 29, GREY); oval(gg, -8, -150, 13, 11, GREY, { hi: true }); oval(gg, -8, -152, 5, 4, A.main, { hi: false }); },
        torso(gg) { for (let i = 0; i < 3; i++) dot(gg, 0, -62 + i * 9, 2.2, CREAM); line(gg, [[-12, -64], [12, -64]], { color: A.dark, w: 1.2, alpha: 0.5 }); },
        front(gg, SS) {
          const hr = 29, hy = -118;
          // glasses
          gg.save(); gg.lineWidth = 1.8; gg.strokeStyle = INK;
          gg.beginPath(); gg.arc(hr * 0.1, hy - hr * 0.05, hr * 0.26, 0, TAU); gg.stroke(); gg.beginPath(); gg.arc(hr * 0.62, hy - hr * 0.05, hr * 0.26, 0, TAU); gg.stroke();
          gg.beginPath(); gg.moveTo(hr * 0.36, hy - hr * 0.05); gg.lineTo(hr * 0.36, hy - hr * 0.05); gg.stroke(); gg.restore();
          // the harp, leaning on her front hip: a golden frame with strings that shiver when she strums
          const hx = 30, hb = -4, ht = -92;
          cel(gg, [[hx - 10, hb, 1], [hx + 16, hb, 1], [hx + 20, ht + 30], [hx + 8, ht, 1], [hx + 2, ht, 1], [hx - 4, ht + 26]], GOLD, { hi: true });
          gg.save(); gg.strokeStyle = CREAM; gg.lineWidth = 1.1; gg.globalAlpha *= 0.9;
          for (let i = 0; i < 6; i++) { const u = i / 5, x0 = hx - 5 + u * 18, sh = sin(SS.t * 18 + i) * 1.4 * SS.P.arm; gg.beginPath(); gg.moveTo(x0, hb - 3); gg.quadraticCurveTo(x0 + sh, (hb + ht) / 2 + 8, lerp(hx + 3, hx + 8, u), ht + 4 + u * 20); gg.stroke(); }
          gg.restore();
          notesUp(gg, hx + 10, ht - 8, SS.t, SS.P.notes * 0.9 + 0.15, GOLD, 2);
        },
      });
      void P;
    },
  };
  // HYPE PARROT: a candy-pink parrot screaming every chorus from the top of a mic stand
  GUESTS.guest_hype_parrot = {
    hero: 'hanae', w: 84, h: 148, head: [8, -124], body: [4, -100],
    draw(g, S) {
      const P = S.P, A = S.A, t = S.t;
      // the mic stand: a round base, a chrome pole, a little clamp on top
      oval(g, 0, -3, 22, 6, BLACK, { hi: true });
      box(g, -3, -96, 6, 92, 3, CHROME, { hi: true });
      box(g, -9, -100, 18, 7, 3, BLACK, { hi: false });
      // body
      const bx = 4, by = -112 + P.hop * 0.1, flap = P.arm * 0.9 + sin(t * 9) * 0.1 * P.notes;
      oval(g, bx - 12, by + 2, 12, 20, A.dark, { hi: false });                                     // the far wing
      cel(g, [[bx - 2, by + 16, 1], [bx + 6, by + 10], [bx + 16, by + 28], [bx + 10, by + 34], [bx - 4, by + 24]], A.dark, { hi: false });   // the tail
      oval(g, bx, by + 6, 17, 22, A.main, { hi: true });                                           // body
      limb(g, [bx - 4, by + 26], [bx - 8, -98], 4, GOLD); limb(g, [bx + 6, by + 26], [bx + 8, -98], 4, GOLD);   // feet gripping the stand
      g.save(); g.translate(bx - 6, by + 4); g.rotate(-flap * 1.1);
      cel(g, [[0, -6, 1], [-18, 4], [-24, 18], [-12, 20], [2, 10]], A.mid, { hi: true });        // the near wing, raised on the hype
      g.restore();
      // head: a round skull, the crest, the big curved beak, a cheek patch
      const hy = by - 14, hx = bx + 6;
      oval(g, hx, hy, 15, 14, A.main, { hi: true });
      for (let i = 0; i < 3; i++) cel(g, [[hx - 8 + i * 5, hy - 10, 1], [hx - 14 + i * 5 + sin(t * 3 + i) * 1.5, hy - 26 - i * 3], [hx - 2 + i * 5, hy - 12, 1]], i === 1 ? GOLD : A.light, { hi: false, line: 1.6 });
      oval(g, hx + 6, hy + 4, 6, 5, CREAM, { hi: false, line: 1.2 });
      const open = P.mouth === 'happyOpen' || P.mouth === 'grin' ? 0.5 + 0.5 * P.beat : 0.1 + 0.1 * P.beat;
      cel(g, [[hx + 9, hy - 3, 1], [hx + 22, hy - 1], [hx + 24, hy + 6], [hx + 15, hy + 4, 1]], GOLD, { hi: true, line: 1.6 });   // the upper beak
      cel(g, [[hx + 9, hy + 3, 1], [hx + 20, hy + 5 + open * 6], [hx + 12, hy + 9 + open * 6, 1]], RJ.shade(GOLD, 0.1), { hi: false, line: 1.6 });   // the lower beak drops when it screams
      eyes(g, hx + 1, hy - 2, 8, { n: 1, open: P.open, look: P.look, iris: ['#2b2633', '#5a4a6a'] });
      notesUp(g, hx + 18, hy - 22, t, 0.35 + 0.65 * P.notes, A.main, 3);
    },
  };
  // ---- RoxorLoops's guests ------------------------------------------------------------------------------------------
  // DJ SCRATCHY: a green cap and headphones behind two turntables, one hand always on a record
  GUESTS.guest_dj_scratchy = {
    hero: 'kuro', w: 118, h: 150, head: [-6, -120], body: [0, -80],
    draw(g, S) {
      const P = S.P, A = S.A, t = S.t;
      person(g, S, {
        top: BLACK, pants: A.dark, headY: -120, headR: 28, armsFront: true, noBackArm: true,
        hair(gg) { hairCap(gg, -120, 28, '#3a2a24'); },
        hat(gg) {                                                                                 // cap with the peak forward and headphones over it
          const hy = -120, hr = 28;
          cel(gg, [[-hr * 1.05, hy - hr * 0.35], [-hr * 0.9, hy - hr * 0.95], [0, hy - hr * 1.18], [hr * 0.9, hy - hr * 0.95], [hr * 1.02, hy - hr * 0.35, 1]], A.main, { hi: true });
          cel(gg, [[hr * 0.6, hy - hr * 0.4, 1], [hr * 1.7, hy - hr * 0.45], [hr * 1.75, hy - hr * 0.25], [hr * 0.7, hy - hr * 0.2, 1]], A.dark, { hi: false });
          gg.save(); gg.strokeStyle = INK; gg.lineWidth = 4.2; gg.lineCap = 'round'; gg.beginPath(); gg.arc(0, hy - 2, hr * 1.12, PI * 1.08, PI * 1.92); gg.stroke(); gg.restore();
          oval(gg, -hr * 1.08, hy + 2, 7, 9, A.main, { hi: true }); oval(gg, hr * 1.06, hy + 2, 7, 9, A.main, { hi: true });
        },
      });
      // the table and decks in front of him
      box(g, -46, -60, 96, 14, 5, '#3a3345', { hi: true });
      box(g, -40, -46, 8, 44, 3, '#2b2633', { hi: false }); box(g, 36, -46, 8, 44, 3, '#2b2633', { hi: false });
      const deck = (x, spin, scratch) => {
        g.save(); g.translate(x, -62); g.scale(1, 0.42);
        cel(g, ell(0, 0, 22, 22, 20), BLACK, { hi: false }); cel(g, ell(0, 0, 17, 17, 18), '#1b1a24', { hi: false, line: 1.2 });
        g.rotate(spin); g.strokeStyle = GREY_D; g.lineWidth = 1; for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(0, 0, 6 + i * 3.6, 0, TAU); g.stroke(); }
        dot(g, 0, 0, 4.5, scratch ? A.light : A.main); line(g, [[0, -14], [0, -8]], { color: A.light, w: 1.6 });
        g.restore();
      };
      const m = tk.motion();
      deck(-20, t * 3 * m, false); deck(22, t * 3 * m + P.arm * sin(t * 30) * 0.6 * P.notes, P.notes > 0.3);
      box(g, -2, -66, 6, 20, 2, GREY_D, { hi: false, line: 1.2 });                                 // the crossfader
      if (P.notes > 0.05) tk.soundRings(g, 22, -74, 8, { n: 2, color: A.light, alpha: P.notes * 0.9, lw: 1.6 });
      notesUp(g, 22, -96, t, 0.3 + 0.7 * P.notes, A.main, 2);
    },
  };
  // LOOP PEDAL BOT: a boxy green robot that is mostly loop pedal, with a screen face, an antenna light and clamp hands
  GUESTS.guest_loop_bot = {
    hero: 'kuro', w: 88, h: 140, head: [0, -112], body: [0, -70],
    draw(g, S) {
      const P = S.P, A = S.A, t = S.t;
      // wheels and the pedal body
      oval(g, -22, -6, 10, 10, BLACK, { hi: true }); oval(g, 22, -6, 10, 10, BLACK, { hi: true }); dot(g, -22, -6, 3, GREY); dot(g, 22, -6, 3, GREY);
      box(g, -30, -62, 60, 50, 9, A.main, { hi: true });
      box(g, -24, -56, 48, 14, 4, A.dark, { hi: false });                                          // the knob row
      for (let i = 0; i < 4; i++) { dot(g, -17 + i * 11.3, -49, 4, CHROME); line(g, [[-17 + i * 11.3, -49], [-17 + i * 11.3 + cos(t * 0.7 + i) * 2.4, -49 + sin(t * 0.7 + i) * 2.4]], { color: INK, w: 1.2 }); }
      oval(g, -14, -28, 9, 9, GREY, { hi: true }); oval(g, 14, -28, 9, 9, GREY, { hi: true });    // the two stomp buttons
      const rec = 0.5 + 0.5 * sin(t * 6), recOn = P.notes > 0.2 || P.pose === 'idle';
      dot(g, 14, -28, 3.2, recOn ? RED : '#6a2a2a'); if (recOn) tk.glow(g, 14, -28, 10, RED, 0.3 * rec);
      dot(g, -14, -28, 3.2, A.light);
      // arms with clamp hands (the front one rises on the act)
      const armY = -50, af = [34, armY + 14 - P.arm * 30], ab = [-34, armY + 16 - P.arm * 10];
      limb(g, [-28, armY], ab, 6, GREY); limb(g, [28, armY], af, 6, GREY);
      [[ab, -1], [af, 1]].forEach(([h, d]) => { cel(g, [[h[0], h[1] - 6, 1], [h[0] + d * 9, h[1] - 9], [h[0] + d * 6, h[1] - 2, 1], [h[0] + d * 9, h[1] + 5], [h[0], h[1] + 4, 1]], GREY, { hi: false, line: 1.5 }); });
      // the head: a rounded box with a glass screen, two screen eyes and a wavy mouth line, an antenna with a blinking light
      const hy = -98 + P.hop * 0.05;
      box(g, -6, -118, 12, 10, 3, INK, { hi: false, line: 1 }); line(g, [[0, -118], [0, -132]], { w: 2.4 });
      dot(g, 0, -135, 4.5, 0.5 + 0.5 * sin(t * 4) > 0.5 ? A.light : A.dark); tk.glow(g, 0, -135, 12, A.light, 0.25 + 0.25 * sin(t * 4));
      box(g, -26, hy - 22, 52, 44, 10, A.mid, { hi: true });
      box(g, -20, hy - 16, 40, 30, 6, '#132050', { hi: false, line: 1.5 });
      eyes(g, 2, hy - 4, 9, { kind: 'screen', open: P.open, look: P.look, glow: A.light, gap: 15 });
      g.save(); g.strokeStyle = A.light; g.lineWidth = 1.6; g.lineCap = 'round'; g.beginPath();
      for (let i = 0; i <= 10; i++) { const u = i / 10, x = -10 + u * 22, y = hy + 8 + sin(u * TAU * 1.5 + t * 9) * (1.5 + 2.5 * P.beat * (P.mouth === 'happyOpen' ? 1 : 0.3)); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
      g.stroke(); g.restore();
      if (P.notes > 0.05) tk.soundRings(g, 30, hy - 10, 9, { n: 2, color: A.main, alpha: P.notes * 0.8, lw: 1.6 });
    },
  };
  // METRO GNOME: a tall pointed green hat, a big white beard, a red nose and a metronome whose needle never stops
  GUESTS.guest_drum_machine = {
    hero: 'kuro', w: 84, h: 150, head: [0, -96], body: [0, -60],
    draw(g, S) {
      const P = S.P, A = S.A, t = S.t;
      person(g, S, {
        top: A.dark, pants: '#5a3a2a', shoes: '#3a2a24', headY: -92, headR: 25, hip: -30, armF: [38, -98],
        hair(gg, SS) {                                                                              // the beard, the nose, the hat
          const hy = -92, hr = 25;
          cel(gg, [[-hr * 0.95, hy + hr * 0.1], [-hr * 0.7, hy + hr * 1.3], [0, hy + hr * 1.9 + sin(SS.t * 2) * 1.5], [hr * 0.8, hy + hr * 1.35], [hr * 1.05, hy + hr * 0.35], [hr * 0.6, hy + hr * 0.55], [0, hy + hr * 0.5], [-hr * 0.6, hy + hr * 0.35]], WHITE, { hi: true });
          dot(gg, hr * 0.55, hy + hr * 0.2, 5, RED); dot(gg, hr * 0.45, hy + hr * 0.08, 1.6, WHITE);
          cel(gg, [[-hr * 1.15, hy - hr * 0.5, 1], [hr * 1.15, hy - hr * 0.5, 1], [hr * 0.1 + sin(SS.t * 1.4) * 3, hy - hr * 2.45]], A.main, { hi: true });
          box(gg, -hr * 1.2, hy - hr * 0.62, hr * 2.4, 7, 3, A.dark, { hi: false });
        },
        front(gg, SS) {                                                                             // the metronome in the back hand's place, by the hip
          const mx = -34, my = -8, m = tk.motion(), sw = sin(SS.t * (SS.P.notes > 0.3 ? 14 : 5) * m) * 0.55;
          cel(gg, [[mx - 12, my, 1], [mx + 12, my, 1], [mx + 7, my - 36, 1], [mx - 7, my - 36, 1]], WOOD, { hi: true });
          box(gg, mx - 5, my - 30, 10, 24, 2, CREAM, { hi: false, line: 1.1 });
          gg.save(); gg.translate(mx, my - 6); gg.rotate(sw); line(gg, [[0, 0], [0, -30]], { w: 1.8 }); dot(gg, 0, -22, 2.6, INK); gg.restore();
          if (SS.P.notes > 0.05) tk.soundRings(gg, mx, my - 44, 7, { n: 2, color: A.light, alpha: SS.P.notes * 0.9, lw: 1.5 });
        },
      });
      void P; void t;
    },
  };
  // ---- RawClaw's guests ------------------------------------------------------------------------------------------
  // SOUND TECH: black tee, a violet beanie, a torch in her teeth, a roll of gaffer tape on the belt and a lanyard
  GUESTS.guest_sound_tech = {
    hero: 'suzu', w: 86, h: 150, head: [0, -120], body: [0, -72],
    draw(g, S) {
      const P = S.P, A = S.A;
      person(g, S, {
        top: BLACK, pants: '#3a3345', shoes: A.dark, headY: -120, headR: 28, armF: [36, -124],
        hair(gg) { hairCap(gg, -120, 28, '#3a2a24'); cel(gg, [[-30, -126], [-29, -144], [0, -156], [29, -144], [30, -126, 1], [0, -131]], A.main, { hi: true }); box(gg, -31, -130, 62, 7, 3, A.dark, { hi: false }); },
        torso(gg) { line(gg, [[-8, -94], [-3, -62]], { color: A.light, w: 1.4 }); line(gg, [[8, -94], [3, -62]], { color: A.light, w: 1.4 }); box(gg, -5, -64, 10, 8, 2, CREAM, { hi: false, line: 1.1 }); box(gg, 8, -40, 18, 10, 4, GREY, { hi: true, line: 1.4 }); dot(gg, 17, -35, 2.5, A.dark); },
        front(gg, SS) {                                                                             // the torch in her teeth and its beam
          const tx = 20, ty = -108;
          box(gg, tx - 4, ty - 3, 16, 6, 2, GREY, { hi: true, line: 1.3 });
          dot(gg, tx + 13, ty, 3.4, GOLD); tk.glow(gg, tx + 16, ty, 14, GOLD, 0.35);
          gg.save(); gg.globalAlpha *= 0.22 + 0.12 * SS.P.beat; gg.beginPath(); gg.moveTo(tx + 14, ty - 2); gg.lineTo(tx + 60, ty - 16 - SS.P.arm * 10); gg.lineTo(tx + 60, ty + 12 - SS.P.arm * 10); gg.lineTo(tx + 14, ty + 2); gg.closePath(); gg.fillStyle = GOLD; gg.fill(); gg.restore();
        },
      });
      void P;
    },
  };
  // CABLE GREMLIN: a small violet imp with huge ears, wrapped in a cable, a plug held up like a trophy
  GUESTS.guest_cable_gremlin = {
    hero: 'suzu', w: 84, h: 100, head: [0, -62], body: [0, -46],
    draw(g, S) {
      const P = S.P, A = S.A, t = S.t;
      const by = -40;
      limb(g, [-12, by + 18], [-16, -5], 8, A.dark); limb(g, [12, by + 18], [16, -5], 8, A.dark);
      oval(g, -17, -3, 9, 4.5, A.dark, { hi: false }); oval(g, 17, -3, 9, 4.5, A.dark, { hi: false });
      // ears first (behind the head), then the round body-head
      cel(g, [[-14, by - 10, 1], [-46, by - 40 + sin(t * 2) * 2], [-18, by + 6, 1]], A.main, { hi: true });
      cel(g, [[14, by - 10, 1], [46, by - 40 + sin(t * 2 + 1) * 2], [18, by + 6, 1]], A.main, { hi: true });
      cel(g, [[-10, by - 12, 1], [-36, by - 34 + sin(t * 2) * 2], [-15, by + 2, 1]], A.light, { hi: false, line: 1.2 });
      cel(g, [[10, by - 12, 1], [36, by - 34 + sin(t * 2 + 1) * 2], [15, by + 2, 1]], A.light, { hi: false, line: 1.2 });
      oval(g, 0, by, 26, 24, A.main, { hi: true });
      // the cable wrapped round the belly, a plug in the raised hand
      g.save(); g.strokeStyle = INK; g.lineWidth = 4.4; g.lineCap = 'round'; for (let i = 0; i < 3; i++) { g.beginPath(); g.ellipse(0, by + 6 + i * 6, 25 - i * 2, 6, 0, PI * 0.05, PI * 0.95); g.stroke(); } g.restore();
      g.save(); g.strokeStyle = A.dark; g.lineWidth = 2.2; g.lineCap = 'round'; for (let i = 0; i < 3; i++) { g.beginPath(); g.ellipse(0, by + 6 + i * 6, 25 - i * 2, 6, 0, PI * 0.05, PI * 0.95); g.stroke(); } g.restore();
      const hf = [28 + P.arm * 6, by + 8 - P.arm * 44], hb = [-28, by + 12 - P.arm * 10];
      limb(g, [-20, by + 2], hb, 6.5, A.main); limb(g, [20, by + 2], hf, 6.5, A.main);
      line(g, [[22, by + 12], [hf[0] - 2, hf[1] + 4]], { w: 2.6, color: INK }); line(g, [[22, by + 12], [hf[0] - 2, hf[1] + 4]], { w: 1.2, color: A.dark });
      box(g, hf[0] - 5, hf[1] - 12, 10, 12, 2, GREY, { hi: true, line: 1.3 }); line(g, [[hf[0] - 2, hf[1] - 12], [hf[0] - 2, hf[1] - 19]], { w: 1.6 }); line(g, [[hf[0] + 2, hf[1] - 12], [hf[0] + 2, hf[1] - 19]], { w: 1.6 });
      eyes(g, 4, by - 6, 11, { open: P.open, look: P.look, gap: 15, iris: ['#2b1b4a', '#7c5cc9'] });
      mouth(g, 5, by + 9, 14, P.mouth === 'smile' ? 'grin' : P.mouth, { teeth: true });
      blush(g, 4, by + 4, 12, 3.5);
      if (P.notes > 0.05) sparklesAround(g, hf[0], hf[1] - 16, 10, t, P.notes, A.light);
    },
  };
  // REVERB GHOST: a lilac sheet that hovers, with two fading echoes trailing behind it
  GUESTS.guest_reverb_ghost = {
    hero: 'suzu', w: 90, h: 128, head: [0, -96], body: [0, -70],
    draw(g, S) {
      const P = S.P, A = S.A, t = S.t, m = tk.motion();
      const hover = sin(t * 1.7) * 5 * m;
      const sheet = (gg, k, al, pale) => {
        const hem = [];
        for (let i = 0; i <= 6; i++) { const u = i / 6; hem.push([-28 + u * 56, -26 + (i % 2 ? 0 : -9) + sin(t * 3 + i) * 1.5, 1]); }
        const pts = [[-30, -40, 1]].concat(hem.map((p) => [p[0], p[1] + 6])).concat([[30, -40, 1], [30, -90], [0, -120], [-30, -90]]);
        gg.save(); gg.globalAlpha *= al; gg.translate(0, hover * k);
        cel(gg, pts, pale ? RJ.tint(A.light, 0.3) : A.light, { hi: !pale, line: pale ? 1.2 : LW, lineColor: pale ? A.main : INK, shadow: pale ? false : undefined });
        gg.restore();
      };
      sheet(g, 1.4, 0.18, true); g.save(); g.translate(-11, -4); sheet(g, 1.2, 0.3, true); g.restore();
      sheet(g, 1, 1, false);
      g.save(); g.translate(0, hover);
      const hf = [34, -74 - P.arm * 26], hb = [-34, -72 - P.arm * 8];
      limb(g, [-26, -78], hb, 8, A.light); limb(g, [26, -78], hf, 8, A.light);
      eyes(g, 3, -92, 12, { kind: 'sleepy', open: P.open, look: P.look, gap: 17, iris: ['#1b1430', '#4a3a7a'], lidColor: A.light });
      mouth(g, 4, -72, 13, P.mouth === 'smile' ? 'O' : P.mouth);
      blush(g, 3, -78, 13, 3.6);
      g.restore();
      if (P.notes > 0.05) tk.soundRings(g, 10, -120, 10, { n: 3, color: A.main, alpha: P.notes * 0.85, lw: 1.5 });
      notesUp(g, 0, -126, t, 0.2 + 0.5 * P.notes, A.main, 2);
    },
  };
  // ---- Andy's guests ------------------------------------------------------------------------------------------
  // FLIGHT CASE ROADIE: a backwards cap and a tee, leaning into a flight case the size of a fridge, on wheels
  GUESTS.guest_roadie = {
    hero: 'raiga', w: 124, h: 150, head: [-32, -120], body: [0, -70],
    draw(g, S) {
      const P = S.P, A = S.A, t = S.t;
      g.save(); g.translate(-34, 0); g.rotate(0.05);
      person(g, S, {
        top: A.main, pants: '#3a3345', shoes: BLACK, headY: -120, headR: 28, armsFront: true,
        hair(gg) { hairCap(gg, -120, 28, '#5a3a2a'); },
        hat(gg) { const hy = -120, hr = 28; cel(gg, [[-hr * 1.05, hy - hr * 0.35], [-hr * 0.9, hy - hr * 0.95], [0, hy - hr * 1.18], [hr * 0.9, hy - hr * 0.95], [hr * 1.02, hy - hr * 0.35, 1]], A.dark, { hi: true }); cel(gg, [[-hr * 0.6, hy - hr * 0.4, 1], [-hr * 1.7, hy - hr * 0.5], [-hr * 1.75, hy - hr * 0.3], [-hr * 0.7, hy - hr * 0.2, 1]], A.dark, { hi: false }); },
        torso(gg) { oval(gg, 0, -70, 9, 6, CREAM, { hi: false, line: 1.2 }); dot(gg, 0, -70, 3, A.main); },
      });
      g.restore();
      // the case: a black box with orange panels, chrome corners, a handle and two wheels (it rolls a little on the act)
      const cx = 24 + P.arm * 6, w = 68, h = 108, cy = -8;
      oval(g, cx - 20, -5, 9, 9, BLACK, { hi: true }); oval(g, cx + 22, -5, 9, 9, BLACK, { hi: true });
      g.save(); g.translate(cx - 20, -5); g.rotate(t * 2 * P.arm + cx * 0.1); line(g, [[-5, 0], [5, 0]], { color: GREY, w: 1.4 }); line(g, [[0, -5], [0, 5]], { color: GREY, w: 1.4 }); g.restore();
      box(g, cx - w / 2, cy - h, w, h, 6, BLACK, { hi: true });
      box(g, cx - w / 2 + 8, cy - h + 10, w - 16, 34, 3, A.main, { hi: true });
      box(g, cx - w / 2 + 8, cy - h + 52, w - 16, 44, 3, A.main, { hi: true });
      [[cx - w / 2, cy - h], [cx + w / 2 - 10, cy - h], [cx - w / 2, cy - 10], [cx + w / 2 - 10, cy - 10]].forEach((c) => box(g, c[0], c[1], 10, 10, 2, CHROME, { hi: false, line: 1.2 }));
      box(g, cx - 10, cy - h - 6, 20, 8, 3, CHROME, { hi: false, line: 1.3 });
      box(g, cx - w / 2 - 3, cy - h / 2 - 7, 6, 14, 2, CHROME, { hi: false, line: 1.2 });
      // a sticker on the case: a star
      tk.sparkle(g, cx + 12, cy - 30, 8, { color: A.light, glow: 0, rot: 0.3 });
      if (P.dust > 0 || P.notes > 0.3) tk.soundRings(g, cx + w / 2 + 6, cy - h * 0.6, 8, { n: 2, color: A.light, alpha: Math.max(P.dust, P.notes) * 0.8, lw: 1.5 });
    },
  };
  // ROLLING BASS AMP: an orange cabinet on four wheels, two knob eyes, the speaker cone as a mouth, a cable for a tail
  GUESTS.guest_bass_amp = {
    hero: 'raiga', w: 100, h: 118, head: [0, -84], body: [0, -60],
    draw(g, S) {
      const P = S.P, A = S.A, t = S.t;
      // the cable tail trailing behind
      g.save(); g.strokeStyle = INK; g.lineWidth = 4; g.lineCap = 'round'; g.beginPath(); g.moveTo(-40, -30); g.bezierCurveTo(-60, -40, -70, -10 + sin(t * 2) * 4, -82, -4); g.stroke(); g.strokeStyle = A.dark; g.lineWidth = 1.8; g.stroke(); g.restore();
      box(g, -84, -9, 8, 10, 2, CHROME, { hi: false, line: 1.2 });
      [-30, -10, 12, 32].forEach((x, i) => { oval(g, x, -6, 8.5, 8.5, BLACK, { hi: i % 2 === 0 }); dot(g, x, -6, 2.6, GREY); });
      box(g, -42, -110, 84, 100, 10, A.main, { hi: true });
      box(g, -36, -104, 72, 22, 4, A.dark, { hi: false });                                         // the control panel
      for (let i = 0; i < 3; i++) { dot(g, 20 + i * 8, -93, 2.4, CHROME); }
      line(g, [[-30, -96], [-10, -96]], { color: A.light, w: 1.6 });
      box(g, -36, -78, 72, 62, 6, '#3a3345', { hi: false });                                      // the grille cloth
      g.save(); g.globalAlpha *= 0.35; g.strokeStyle = A.light; g.lineWidth = 1; for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(-34, -74 + i * 10); g.lineTo(34, -74 + i * 10); g.stroke(); } g.restore();
      // the eyes are the two big knobs, the mouth the speaker cone
      eyes(g, 0, -93, 14, { open: P.open, look: P.look, gap: 28, iris: ['#2b2633', '#5a4a3a'] });
      g.save(); g.strokeStyle = INK; g.lineWidth = 1.8; g.beginPath(); g.arc(-14, -93, 9.6, 0, TAU); g.stroke(); g.beginPath(); g.arc(14, -93, 9.6, 0, TAU); g.stroke(); g.restore();
      const open = P.mouth === 'happyOpen' ? 1 : P.mouth === 'ow' ? 0.6 : 0.25 + 0.15 * P.beat;
      cel(g, ell(0, -46, 24, 24, 20), BLACK, { hi: false });
      cel(g, ell(0, -46, 18, 18 * (0.55 + 0.45 * open), 18), '#1b1a24', { hi: false, line: 1.4 });
      dot(g, 0, -46 + 4 * open, 5 + 2 * open, '#6a2a3a');
      g.save(); g.strokeStyle = GREY; g.lineWidth = 1; g.globalAlpha *= 0.7; g.beginPath(); g.arc(0, -46, 11, 0, TAU); g.stroke(); g.restore();
      if (P.notes > 0.05 || P.beat > 0.85) tk.soundRings(g, 50, -46, 10, { n: 3, color: A.light, alpha: Math.max(P.notes, P.beat > 0.85 ? 0.35 : 0) * 0.9, lw: 1.8 });
      if (P.notes > 0.3) { for (let i = 0; i < 3; i++) { const u = ((t * 1.3 + i / 3) % 1 + 1) % 1; tk.soundRings(g, 0, -4, 30 + u * 20, { n: 1, color: A.main, alpha: (1 - u) * 0.5 * P.notes, lw: 2 }); } }
    },
  };
  // MOSH PIT UNCLE: a big round man in an orange tank top and headband, both fists up, a moustache, always bouncing
  GUESTS.guest_mosh_uncle = {
    hero: 'raiga', w: 104, h: 148, head: [0, -118], body: [0, -70],
    draw(g, S) {
      const P = S.P, A = S.A, t = S.t;
      const bounce = P.pose === 'idle' ? abs(sin(t * 4.2)) * 3 : 0;
      g.save(); g.translate(0, -bounce);
      const hy = -116, hr = 27, hip = -36, neck = hy + hr * 0.8;
      // legs and shorts
      limb(g, [-12, hip], [-15, -7], 13, C.skin); limb(g, [12, hip], [15, -7], 13, C.skin);
      oval(g, -16, -4, 11, 5.5, BLACK, { hi: true }); oval(g, 17, -4, 11, 5.5, BLACK, { hi: true });
      box(g, -27, hip - 18, 54, 26, 8, '#3a3345', { hi: true });
      // the belly in a tank top, bare round arms raised
      cel(g, ell(0, neck + 26, 30, 32, 20), A.main, { hi: true });
      cel(g, [[-14, neck - 2, 1], [14, neck - 2, 1], [20, neck + 16], [-20, neck + 16]], C.skin, { hi: false, line: 1.4 });
      RJ.hatch(g, [[-6, neck + 6, -3, neck + 10], [2, neck + 5, 5, neck + 9], [-2, neck + 11, 1, neck + 14]], { color: C.inkSoft, w: 1.2, alpha: 0.6 });
      const arm = 0.75 + 0.25 * P.arm, pump = sin(t * 8.4) * 6 * (P.notes > 0 ? 1 : 0.4);
      const hb = [-40, neck - 10 - arm * 26 + pump], hf = [40, neck - 14 - arm * 26 - pump];
      limb(g, [-24, neck + 10], hb, 12, C.skin); limb(g, [24, neck + 10], hf, 12, C.skin);
      RJ.hand(g, 'fist', hb[0], hb[1] - 4, -PI / 2, { k: 1 }); RJ.hand(g, 'fist', hf[0], hf[1] - 4, -PI / 2, { k: 1 });
      // head: bald on top, a headband, a moustache
      oval(g, 0, hy, hr * 1.06, hr, C.skin, { hi: true });
      RJ.ear(g, -hr * 0.9, hy + hr * 0.08, { skin: C.skin, k: hr / 50 });
      box(g, -hr * 1.1, hy - hr * 0.55, hr * 2.2, 9, 4, A.main, { hi: true });
      cel(g, [[hr * 1.0, hy - hr * 0.5, 1], [hr * 1.5, hy - hr * 0.9], [hr * 1.7, hy - hr * 0.3], [hr * 1.15, hy - hr * 0.35, 1]], A.main, { hi: false, line: 1.5 });
      eyes(g, hr * 0.28, hy - hr * 0.1, hr * 0.38, { open: P.open, look: P.look, gap: hr * 0.6, kind: P.mouth === 'happyOpen' ? 'round' : 'glare', lidColor: C.skinSh });
      cel(g, [[hr * 0.05, hy + hr * 0.38], [hr * 0.3, hy + hr * 0.3], [hr * 0.55, hy + hr * 0.38], [hr * 0.62, hy + hr * 0.5], [hr * 0.3, hy + hr * 0.46], [-hr * 0.02, hy + hr * 0.5]], '#5a3a2a', { hi: false, line: 1.3 });
      mouth(g, hr * 0.3, hy + hr * 0.62, hr * 0.5, P.mouth === 'smile' ? 'grin' : P.mouth, { teeth: true });
      blush(g, hr * 0.22, hy + hr * 0.3, hr * 0.6, hr * 0.14);
      g.restore();
      if (P.notes > 0.05) sparklesAround(g, 0, -150, 30, t, P.notes, A.light);
    },
  };

  // ---------------------------------------------------------------------------------------------------------------
  // the six mascots: {w, h, head:[x,y], body:[x,y], neck:[x,y,w] (the bandana), crown:[x,y,w] (the crown), draw(g, S)}
  // ---------------------------------------------------------------------------------------------------------------
  const MASCOTS = {};
  // BEATBOX PUG: a fawn pug with a dark muzzle, wrinkles, bulgy eyes and a curly tail, panting on the beat
  MASCOTS.mascot_pug = {
    w: 70, h: 78, head: [8, -58], body: [-4, -30], neck: [4, -40, 30], crown: [8, -80, 16],
    draw(g, S) {
      const P = S.P, A = S.A, t = S.t, fawn = A.main, dark = '#3a2a24';
      g.save(); g.strokeStyle = INK; g.lineWidth = 6; g.lineCap = 'round'; g.beginPath(); g.arc(-30, -36, 7, PI * 0.2, PI * 1.6); g.stroke(); g.strokeStyle = fawn; g.lineWidth = 3; g.stroke(); g.restore();   // the curly tail
      limb(g, [-16, -22], [-20, -5], 8, fawn); limb(g, [14, -22], [18, -5], 8, fawn);
      oval(g, -21, -3, 7, 4, dark, { hi: false, line: 1.2 }); oval(g, 19, -3, 7, 4, dark, { hi: false, line: 1.2 });
      oval(g, -4, -30, 26, 20, fawn, { hi: true });
      const hy = -56 + P.hop * 0.05, hx = 8;
      oval(g, hx - 24, hy - 2, 7, 10, dark, { hi: false });                                        // the far ear
      oval(g, hx, hy, 24, 22, fawn, { hi: true });
      oval(g, hx + 20, hy - 4, 7, 10, dark, { hi: false });                                         // the near ear
      oval(g, hx + 9, hy + 8, 13, 10, dark, { hi: false });                                         // the muzzle mask
      line(g, [[hx - 14, hy - 12], [hx - 4, hy - 15], [hx + 6, hy - 12]], { color: C.inkSoft, w: 1.3 });
      line(g, [[hx - 12, hy - 7], [hx - 3, hy - 9], [hx + 5, hy - 7]], { color: C.inkSoft, w: 1.1, alpha: 0.7 });
      eyes(g, hx + 3, hy - 1, 12, { open: P.open, look: P.look, gap: 17, iris: ['#2b2633', '#5a4a3a'] });
      dot(g, hx + 13, hy + 5, 3.4, INK);
      const pant = P.pose === 'idle' ? 0.4 + 0.3 * sin(t * 6) : P.mouth === 'happyOpen' ? 1 : 0.5;
      mouth(g, hx + 11, hy + 13, 11, pant > 0.6 ? 'happyOpen' : 'smile', { tongue: C.tongue });
      if (pant > 0.6) oval(g, hx + 12, hy + 17, 4, 3 + pant * 2, C.tongue, { hi: false, line: 1 });
      if (P.notes > 0.05) tk.soundRings(g, hx + 28, hy + 8, 6, { n: 2, color: A.light, alpha: P.notes * 0.9, lw: 1.4 });
      sparklesAround(g, hx, hy - 24, 18, t, P.notes, GOLD);
    },
  };
  // LOOP PEDAL CAT: an indigo cat sitting on a green loop pedal, tail over the edge, eyes half shut
  MASCOTS.mascot_cat = {
    w: 72, h: 86, head: [6, -66], body: [0, -38], neck: [4, -50, 28], crown: [6, -90, 14],
    draw(g, S) {
      const P = S.P, A = S.A, t = S.t, pedal = '#3fcf6a';
      box(g, -32, -16, 64, 16, 5, pedal, { hi: true }); dot(g, -20, -9, 4, CHROME); dot(g, 20, -9, 4, CHROME); dot(g, 20, -9, 1.8, RED); for (let i = 0; i < 3; i++) dot(g, -6 + i * 6, -11, 2, '#1f7a3a');
      // the tail hanging over the pedal, swinging
      g.save(); g.strokeStyle = INK; g.lineWidth = 7; g.lineCap = 'round'; g.beginPath(); g.moveTo(-22, -28); g.bezierCurveTo(-40, -30, -44, -12 + sin(t * 1.8) * 5, -34 + sin(t * 1.8) * 4, 2); g.stroke(); g.strokeStyle = A.main; g.lineWidth = 3.6; g.stroke(); g.restore();
      oval(g, 0, -36, 22, 21, A.main, { hi: true });
      limb(g, [-10, -24], [-12, -14], 7, A.main); limb(g, [10, -24], [12, -14], 7, A.main);
      oval(g, 0, -28, 11, 9, A.light, { hi: false, line: 1.1 });                                    // the chest
      const hy = -64 + P.hop * 0.05, hx = 6;
      cel(g, [[hx - 18, hy - 8, 1], [hx - 20, hy - 30], [hx - 4, hy - 16, 1]], A.main, { hi: true }); cel(g, [[hx + 4, hy - 16, 1], [hx + 20, hy - 30], [hx + 18, hy - 8, 1]], A.main, { hi: true });
      cel(g, [[hx - 15, hy - 11, 1], [hx - 17, hy - 24], [hx - 7, hy - 15, 1]], C.blush, { hi: false, line: 1 }); cel(g, [[hx + 7, hy - 15, 1], [hx + 17, hy - 24], [hx + 15, hy - 11, 1]], C.blush, { hi: false, line: 1 });
      oval(g, hx, hy, 21, 18, A.main, { hi: true });
      eyes(g, hx + 3, hy - 2, 11, { kind: P.mouth === 'happyOpen' ? 'round' : 'sleepy', open: P.open, look: P.look, gap: 15, iris: ['#2b6a3a', '#7cf2a8'], lidColor: A.light });
      cel(g, [[hx + 5, hy + 4, 1], [hx + 10, hy + 7, 1], [hx + 5, hy + 9, 1]], C.blush, { hi: false, line: 1 });
      mouth(g, hx + 6, hy + 11, 9, P.mouth === 'smile' ? 'cat' : P.mouth);
      RJ.hatch(g, [[hx + 16, hy + 2, hx + 30, hy], [hx + 16, hy + 6, hx + 30, hy + 8], [hx - 14, hy + 2, hx - 28, hy], [hx - 14, hy + 6, hx - 28, hy + 8]], { color: INK, w: 1, alpha: 0.6 });
      if (P.notes > 0.05) tk.soundRings(g, hx + 26, hy - 14, 5, { n: 2, color: pedal, alpha: P.notes * 0.8, lw: 1.3 });
      sparklesAround(g, hx, hy - 30, 16, t, P.notes, GOLD);
    },
  };
  // TOUR BUS HAMSTER: a round golden hamster running inside a wheel that turns with the tour
  MASCOTS.mascot_hamster = {
    w: 86, h: 88, head: [10, -46], body: [0, -40], neck: [6, -36, 24], crown: [10, -66, 14],
    draw(g, S) {
      const P = S.P, A = S.A, t = S.t, m = tk.motion(), spin = t * 2.6 * m + P.notes * 4;
      // the wheel behind: a chrome ring with spokes, on a little stand
      box(g, -8, -10, 16, 10, 3, CHROME, { hi: false, line: 1.2 }); box(g, -22, -4, 44, 5, 2, CHROME, { hi: false, line: 1.2 });
      g.save(); g.translate(0, -44); g.rotate(spin);
      g.strokeStyle = INK; g.lineWidth = 7; g.beginPath(); g.arc(0, 0, 40, 0, TAU); g.stroke(); g.strokeStyle = CHROME; g.lineWidth = 4; g.stroke();
      g.strokeStyle = GREY_D; g.lineWidth = 1.6; for (let i = 0; i < 8; i++) { const a = i * TAU / 8; g.beginPath(); g.moveTo(cos(a) * 8, sin(a) * 8); g.lineTo(cos(a) * 38, sin(a) * 38); g.stroke(); }
      dot(g, 0, 0, 5, GREY_D); g.restore();
      // the hamster, legs running
      const run = sin(t * 14 * m) * 5;
      limb(g, [-6, -24], [-10 + run, -8], 6, A.main); limb(g, [8, -24], [12 - run, -8], 6, A.main);
      oval(g, 0, -34, 24, 18, A.main, { hi: true });
      oval(g, 2, -28, 12, 8, CREAM, { hi: false, line: 1.1 });
      const hx = 12, hy = -46 + P.hop * 0.05;
      oval(g, hx - 12, hy - 12, 6, 6, A.main, { hi: false }); oval(g, hx + 6, hy - 14, 6, 6, A.main, { hi: false });
      oval(g, hx, hy, 17, 15, A.main, { hi: true });
      oval(g, hx + 9, hy + 6, 9, 6, CREAM, { hi: false, line: 1.1 });
      eyes(g, hx + 3, hy - 2, 7, { kind: 'dot', open: P.open, look: P.look, gap: 12 });
      dot(g, hx + 12, hy + 2, 2.2, C.blush);
      mouth(g, hx + 9, hy + 9, 6, P.mouth === 'smile' ? 'tiny' : P.mouth);
      blush(g, hx + 2, hy + 4, 9, 2.4);
      sparklesAround(g, hx, hy - 24, 16, t, P.notes, GOLD);
    },
  };
  // STAGE GOOSE: a white goose with an orange beak and feet, a long neck and a security lanyard, glaring at the Gloss
  MASCOTS.mascot_goose = {
    w: 74, h: 92, head: [22, -76], body: [-6, -36], neck: [14, -58, 20], crown: [22, -92, 14],
    draw(g, S) {
      const P = S.P, A = S.A, t = S.t, orange = '#ff9a2e';
      limb(g, [-10, -22], [-14, -4], 5, orange); limb(g, [6, -22], [10, -4], 5, orange);
      cel(g, [[-20, -3, 1], [-8, -3, 1], [-12, 1, 1], [-22, 1, 1]], orange, { hi: false, line: 1.2 }); cel(g, [[4, -3, 1], [16, -3, 1], [12, 1, 1], [2, 1, 1]], orange, { hi: false, line: 1.2 });
      cel(g, [[-34, -44], [-40, -56 + sin(t * 1.4) * 2], [-26, -46, 1]], A.light, { hi: false });  // the tail
      oval(g, -6, -36, 28, 19, A.main, { hi: true });
      cel(g, [[-14, -42], [-30, -34], [-16, -26], [4, -30]], A.light, { hi: false, line: 1.3 });   // the wing
      // the neck: a thick S curve
      const nx = 16, hy = -74 + P.hop * 0.04, bob = sin(t * 2.1) * 2;
      g.save(); g.strokeStyle = INK; g.lineWidth = 14; g.lineCap = 'round'; g.beginPath(); g.moveTo(8, -46); g.bezierCurveTo(26, -50, 20, -64, nx + 4 + bob, hy + 2); g.stroke(); g.strokeStyle = A.main; g.lineWidth = 10; g.stroke(); g.restore();
      // the lanyard: a lace round the neck with a small blank tag (security)
      g.save(); g.strokeStyle = A.dark; g.lineWidth = 1.6; g.beginPath(); g.moveTo(10, -52); g.lineTo(20, -40); g.lineTo(28, -52); g.stroke(); g.restore(); box(g, 17, -42, 7, 9, 1.5, '#5fb4ff', { hi: false, line: 1 });
      const hx = nx + 6 + bob;
      oval(g, hx, hy, 13, 11, A.main, { hi: true });
      cel(g, [[hx + 9, hy - 3, 1], [hx + 26, hy - 1 + (P.mouth === 'happyOpen' ? -3 : 0)], [hx + 26, hy + 3], [hx + 9, hy + 4, 1]], orange, { hi: true, line: 1.5 });
      if (P.mouth === 'happyOpen' || P.mouth === 'grin') cel(g, [[hx + 9, hy + 3, 1], [hx + 24, hy + 7], [hx + 10, hy + 8, 1]], RJ.shade(orange, 0.1), { hi: false, line: 1.3 });
      eyes(g, hx + 2, hy - 3, 7, { n: 1, kind: P.mouth === 'happyOpen' ? 'round' : 'glare', open: P.open, look: P.look, iris: ['#2b2633', '#5fb4ff'], lidColor: A.light });
      if (P.notes > 0.05) tk.soundRings(g, hx + 30, hy, 6, { n: 2, color: orange, alpha: P.notes * 0.9, lw: 1.4 });
      sparklesAround(g, hx, hy - 20, 14, t, P.notes, GOLD);
    },
  };
  // MERCH FOX: a tomato-red fox in a tiny cream tee, bushy tail with a cream tip, a price tag in its teeth
  MASCOTS.mascot_fox = {
    w: 80, h: 88, head: [10, -66], body: [0, -36], neck: [6, -50, 28], crown: [10, -92, 14],
    draw(g, S) {
      const P = S.P, A = S.A, t = S.t;
      // the bushy tail
      cel(g, [[-18, -30, 1], [-38, -40 + sin(t * 1.9) * 3], [-52, -26 + sin(t * 1.9) * 3], [-40, -10], [-22, -16]], A.main, { hi: true });
      cel(g, [[-44, -24 + sin(t * 1.9) * 3], [-52, -26 + sin(t * 1.9) * 3], [-40, -10], [-36, -16]], CREAM, { hi: false, line: 1.2 });
      limb(g, [-12, -22], [-14, -5], 7, A.dark); limb(g, [12, -22], [14, -5], 7, A.dark);
      oval(g, 0, -36, 22, 19, A.main, { hi: true });
      box(g, -16, -48, 32, 24, 7, CREAM, { hi: true, line: 1.5 });                                  // the tee
      dot(g, 2, -38, 5, A.main); dot(g, 2, -38, 2.2, '#3fcf6a');                                    // the RJ disc on the tee
      const hx = 10, hy = -64 + P.hop * 0.05;
      cel(g, [[hx - 18, hy - 6, 1], [hx - 22, hy - 30], [hx - 4, hy - 14, 1]], A.main, { hi: true }); cel(g, [[hx + 4, hy - 14, 1], [hx + 22, hy - 30], [hx + 18, hy - 6, 1]], A.main, { hi: true });
      cel(g, [[hx - 15, hy - 9, 1], [hx - 18, hy - 24], [hx - 8, hy - 13, 1]], A.dark, { hi: false, line: 1 }); cel(g, [[hx + 8, hy - 13, 1], [hx + 18, hy - 24], [hx + 15, hy - 9, 1]], A.dark, { hi: false, line: 1 });
      cel(g, [[hx - 20, hy - 4], [hx, hy - 20], [hx + 20, hy - 4], [hx + 14, hy + 10], [hx, hy + 16], [hx - 14, hy + 10]], A.main, { hi: true });
      cel(g, [[hx - 4, hy + 2], [hx + 14, hy], [hx + 16, hy + 10], [hx + 2, hy + 15], [hx - 8, hy + 10]], CREAM, { hi: false, line: 1.2 });   // the white muzzle
      eyes(g, hx + 2, hy - 2, 9, { open: P.open, look: P.look, gap: 14, iris: ['#2b2633', '#ffb347'] });
      dot(g, hx + 13, hy + 7, 2.6, INK);
      mouth(g, hx + 8, hy + 11, 8, P.mouth === 'smile' ? 'smirk' : P.mouth);
      box(g, hx + 14, hy + 8, 10, 7, 1.5, GOLD, { hi: false, line: 1 }); dot(g, hx + 16, hy + 11.5, 1, INK);           // the price tag
      sparklesAround(g, hx, hy - 30, 16, t, P.notes, GOLD);
    },
  };
  // KARAOKE PARROT: a jade parrot with a crest, a tiny mic in its claw, singing the chorus with its eyes shut
  MASCOTS.mascot_parrot = {
    w: 66, h: 92, head: [8, -74], body: [0, -44], neck: [6, -56, 22], crown: [6, -98, 14],
    draw(g, S) {
      const P = S.P, A = S.A, t = S.t;
      oval(g, 0, -4, 20, 5, WOOD, { hi: true }); box(g, -3, -16, 6, 12, 2, WOOD, { hi: false, line: 1.2 });   // a little perch
      limb(g, [-6, -26], [-8, -14], 4, GOLD); limb(g, [6, -26], [8, -14], 4, GOLD);
      cel(g, [[-4, -28, 1], [-14, -16], [-22, -6], [-10, -8]], A.dark, { hi: false });               // the tail
      oval(g, -12, -42, 11, 18, A.dark, { hi: false });                                               // the far wing
      oval(g, 0, -44, 17, 22, A.main, { hi: true });
      oval(g, 3, -38, 9, 12, A.light, { hi: false, line: 1.1 });                                      // the belly
      const hx = 8, hy = -72 + P.hop * 0.05;
      oval(g, hx, hy, 15, 14, A.main, { hi: true });
      for (let i = 0; i < 3; i++) cel(g, [[hx - 8 + i * 5, hy - 10, 1], [hx - 12 + i * 5 + sin(t * 3 + i) * 1.5, hy - 26 - (i === 1 ? 4 : 0)], [hx - 2 + i * 5, hy - 12, 1]], i === 1 ? GOLD : A.light, { hi: false, line: 1.6 });
      oval(g, hx + 5, hy + 3, 6, 5, CREAM, { hi: false, line: 1.2 });
      const sing = P.pose === 'idle' ? 0.5 + 0.5 * sin(t * 5) : P.mouth === 'happyOpen' ? 1 : 0.3;
      cel(g, [[hx + 8, hy - 3, 1], [hx + 20, hy - 1], [hx + 22, hy + 5], [hx + 13, hy + 4, 1]], GOLD, { hi: true, line: 1.5 });
      cel(g, [[hx + 8, hy + 3, 1], [hx + 18, hy + 5 + sing * 5], [hx + 11, hy + 8 + sing * 5, 1]], RJ.shade(GOLD, 0.1), { hi: false, line: 1.5 });
      eyes(g, hx + 1, hy - 2, 7, { n: 1, open: P.pose === 'idle' && sing > 0.6 ? 0 : P.open, look: P.look, iris: ['#2b2633', '#5a4a6a'] });
      // the near wing holds a tiny mic up to the beak
      cel(g, [[8, -52, 1], [20, -58], [26, -50], [18, -40]], A.mid, { hi: true, line: 1.5 });
      RJ.mic(g, 22, -62, -PI / 2 + 0.5, { accent: A.main, headR: 5, len: 14, bands: 1 });
      notesUp(g, hx + 20, hy - 18, t, 0.4 + 0.6 * P.notes, A.main, 3);
    },
  };
  // level accessories: a pink bandana with cream dots round the neck (level 2 and up), a tiny gold crown on the head (level 3)
  function bandana(g, n, t) {
    const x = n[0], y = n[1], w = n[2], pink = '#ff7eb6', sway = sin(t * 2) * 2;
    cel(g, [[x - w / 2, y, 1], [x + w / 2, y, 1], [x + w * 0.1, y + w * 0.55 + sway, 1]], pink, { hi: true, line: 1.5 });
    g.save(); g.strokeStyle = INK; g.lineWidth = 3.2; g.lineCap = 'round'; g.beginPath(); g.moveTo(x - w / 2, y); g.quadraticCurveTo(x, y + 4, x + w / 2, y); g.stroke(); g.strokeStyle = pink; g.lineWidth = 1.6; g.stroke(); g.restore();
    dot(g, x - w * 0.12, y + w * 0.16, 1.4, CREAM); dot(g, x + w * 0.16, y + w * 0.24, 1.4, CREAM); dot(g, x + w * 0.02, y + w * 0.38 + sway * 0.5, 1.2, CREAM);
  }
  function crown(g, c, t) {
    const x = c[0], y = c[1], w = c[2];
    cel(g, [[x - w / 2, y + 2, 1], [x - w / 2, y - w * 0.5, 1], [x - w * 0.22, y - w * 0.18, 1], [x, y - w * 0.7, 1], [x + w * 0.22, y - w * 0.18, 1], [x + w / 2, y - w * 0.5, 1], [x + w / 2, y + 2, 1]], GOLD, { hi: true, line: 1.4 });
    dot(g, x, y - 2, 1.9, RED); dot(g, x - w * 0.5, y - w * 0.5, 1.4, CREAM); dot(g, x + w * 0.5, y - w * 0.5, 1.4, CREAM); dot(g, x, y - w * 0.7, 1.4, CREAM);
    tk.sparkle(g, x + w * 0.6, y - w * 0.8, 3 + sin(t * 4) * 1, { color: CREAM, glow: 0.3, rot: t });
  }

  // ---------------------------------------------------------------------------------------------------------------
  // the frame: translate to the feet, scale and flip, the ground shadow, the pose offsets, then the spec
  // ---------------------------------------------------------------------------------------------------------------
  function frame(ctx, spec, o, P, A, label, extra) {
    const s = num(o.s, 1) > 0 ? num(o.s, 1) : 1, x = num(o.x), y = num(o.y), t = num(o.t), flip = !!o.flip !== !!P.flip, al = clamp(num(o.alpha, 1), 0, 1) * P.alpha;
    if (al <= 0.005) return;
    const prevFlip = RJ._flip;
    ctx.save(); RJ._flip = flip;
    try {
      ctx.translate(x, y); ctx.scale(s * (flip ? -1 : 1), s); ctx.globalAlpha *= al;
      if (o.shadow !== false) { ctx.save(); ctx.translate(P.dx, 0); groundShadow(ctx, spec.w, P.hop, 1); ctx.restore(); }
      if (P.dust > 0 && tk.motion() === 1) { ctx.save(); ctx.globalAlpha *= 0.45 * P.dust; for (let i = 0; i < 3; i++) dot(ctx, P.dx - 14 + i * 14, -3 - (i % 2) * 3, 5 - i, '#e6d3a3'); ctx.restore(); }
      ctx.translate(P.dx, P.dy - P.hop);
      if (P.lean) ctx.rotate(P.lean);
      if (P.sx !== 1 || P.sy !== 1) ctx.scale(P.sx, P.sy);
      const S = { P, A, t, seed: spec.seed, id: label };
      spec.draw(ctx, S);
      if (extra) extra(ctx, S);
    } catch (e) {
      warnOnce('draw ' + label, e);
      ART.placeholder(ctx, label, -spec.w / 2, -spec.h, spec.w, spec.h, { color: A.main });
    } finally { RJ._flip = prevFlip; ctx.restore(); }
  }
  const boundsOf = (spec, dw, dh) => {
    const w = spec ? spec.w : dw, h = spec ? spec.h : dh, hd = spec ? spec.head : [0, -h * 0.82], bd = spec ? spec.body : [0, -h * 0.5];
    return { w, h, head: { x: hd[0], y: hd[1] }, body: { x: bd[0], y: bd[1] }, feet: { x: 0, y: 0 } };
  };
  const GUEST_IDS = Object.keys(GUESTS), MASCOT_IDS = Object.keys(MASCOTS);
  GUEST_IDS.forEach((id, i) => { GUESTS[id].seed = i + 1; });
  MASCOT_IDS.forEach((id, i) => { MASCOTS[id].seed = 20 + i; });
  const guestAccent = (id) => { const d = typeof DATA !== 'undefined' && DATA.guests ? DATA.guests[id] : null; return accentOf((d && d.hero) || (GUESTS[id] && GUESTS[id].hero) || 'hanae'); };
  const mascotAccent = (id) => { const d = typeof DATA !== 'undefined' && DATA.mascots ? DATA.mascots[id] : null; return famOf(d && d.art ? d.art.c : 'amber'); };

  ART.guest = {
    ids: () => GUEST_IDS.slice(),
    poseMs: (pose) => GUEST_MS[pose] || 0,
    bounds: (id) => boundsOf(GUESTS[id] || null, 84, 150),
    draw(ctx, id, o) {
      if (!ctx) return;
      o = o || {};
      const spec = GUESTS[id];
      if (!spec) { const s = num(o.s, 1) || 1; ART.placeholder(ctx, String(id), num(o.x) - 40 * s, num(o.y) - 150 * s, 80 * s, 150 * s, { color: '#8f5fe8' }); return; }
      const pose = typeof o.pose === 'string' && GUEST_MS[o.pose] !== undefined ? o.pose : 'idle';
      const P = resolve(pose, o.t, o.pt, spec.seed);
      frame(ctx, spec, o, P, guestAccent(id), id, null);
    },
  };
  ART.mascot = {
    ids: () => MASCOT_IDS.slice(),
    poseMs: (pose) => MASCOT_MS[pose] || 0,
    bounds: (id) => boundsOf(MASCOTS[id] || null, 70, 90),
    draw(ctx, id, o) {
      if (!ctx) return;
      o = o || {};
      const spec = MASCOTS[id];
      if (!spec) { const s = num(o.s, 1) || 1; ART.placeholder(ctx, String(id), num(o.x) - 35 * s, num(o.y) - 90 * s, 70 * s, 90 * s, { color: '#ffb640' }); return; }
      const pose = typeof o.pose === 'string' && MASCOT_MS[o.pose] !== undefined ? o.pose : 'idle';
      const P = resolve(pose, o.t, o.pt, spec.seed);
      if (pose === 'idle') idleLife(P, num(o.t), spec.seed, 1.2);
      const level = clamp(num(o.level, 1) | 0, 1, 3);
      frame(ctx, spec, o, P, mascotAccent(id), id, level >= 2 ? (g, S) => { bandana(g, spec.neck, S.t); if (level >= 3) crown(g, [spec.crown[0], spec.crown[1] - P.hop * 0.05, spec.crown[2]], S.t); } : null);
    },
  };
  ART.declare('guest', GUEST_IDS);
  ART.declare('mascot', MASCOT_IDS);

  // ---------------------------------------------------------------------------------------------------------------
  // gallery sheets
  // ---------------------------------------------------------------------------------------------------------------
  const nameOf = (kind, id) => { const d = typeof DATA !== 'undefined' && DATA[kind] ? DATA[kind][id] : null; return d && d.name ? d.name : id; };
  const floor = (g, w, h, y) => { g.save(); g.fillStyle = 'rgba(245,201,106,0.16)'; g.fillRect(0, y, w, h - y); g.strokeStyle = 'rgba(255,244,230,0.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); g.restore(); };
  const PT_AT = { act: 0.2, enter: 0.3, exit: 0.2, shove: 0.2, cheer: 0.2, idle: 0 };
  ART.sheet('guests', (canvas, params) => {
    const poses = ['idle', 'act', 'enter', 'exit'], t = num(+params.t, 0), cells = [];
    GUEST_IDS.forEach((id) => poses.forEach((pose) => cells.push({ id, pose, label: nameOf('guests', id) + ' ' + pose })));
    ART.sheetGrid(canvas, params, cells, (g, cell, w, h) => {
      tk.sky(g, 0, 0, w, h, 'night'); floor(g, w, h, h * 0.9);
      const s = Math.min(w / 180, (h * 0.86) / 160);
      ART.guest.draw(g, cell.id, { x: w / 2, y: h * 0.9, s, pose: cell.pose, t, pt: params.pt !== undefined ? num(+params.pt, 0) : PT_AT[cell.pose] + t * 0 });
    }, { cols: poses.length, title: 'ART.guest: the twelve guests (idle, act, enter, exit at pt ' + (params.pt !== undefined ? params.pt : '0.2 to 0.3') + ' s)', gap: 6, labelH: 16 });
  });
  ART.sheet('mascots', (canvas, params) => {
    const cols = [{ pose: 'idle', level: 1 }, { pose: 'idle', level: 2 }, { pose: 'idle', level: 3 }, { pose: 'cheer', level: 3 }], t = num(+params.t, 0), cells = [];
    MASCOT_IDS.forEach((id) => cols.forEach((c) => cells.push({ id, pose: c.pose, level: c.level, label: nameOf('mascots', id) + ' L' + c.level + ' ' + c.pose })));
    ART.sheetGrid(canvas, params, cells, (g, cell, w, h) => {
      tk.sky(g, 0, 0, w, h, 'night'); floor(g, w, h, h * 0.9);
      const s = Math.min(w / 120, (h * 0.86) / 110);
      ART.mascot.draw(g, cell.id, { x: w / 2, y: h * 0.9, s, pose: cell.pose, level: cell.level, t, pt: params.pt !== undefined ? num(+params.pt, 0) : PT_AT[cell.pose] });
    }, { cols: cols.length, title: 'ART.mascot: the six mascots at levels 1, 2 and 3 (a bandana at 2, a crown at 3), and the cheer', gap: 6, labelH: 16 });
  });
  // one figure big: ?sheet=guest_dev&id=guest_dj_scratchy&pose=act&pt=0.2&zoom=2  (a mascot id works too, with level=)
  ART.sheet('guest_dev', (canvas, params) => {
    const ctx = canvas.getContext('2d'), W = num(params.w, 1600), H = num(params.h, 900), t = num(+params.t, 0), pt = num(+params.pt, PT_AT[params.pose] || 0), zoom = num(+params.zoom, 2);
    const ids = typeof params.id === 'string' && params.id ? params.id.split(',') : [GUEST_IDS[0]];
    tk.sky(ctx, 0, 0, W, H, 'night'); floor(ctx, W, H, H * 0.86);
    const step = W / (ids.length + 1);
    ids.forEach((id, i) => {
      const x = step * (i + 1), y = H * 0.86;
      if (MASCOTS[id]) ART.mascot.draw(ctx, id, { x, y, s: zoom * 1.4, pose: params.pose || 'idle', level: num(+params.level, 3), t, pt });
      else ART.guest.draw(ctx, id, { x, y, s: zoom, pose: params.pose || 'idle', t, pt, flip: !!params.flip });
      ctx.font = '600 13px system-ui'; ctx.fillStyle = '#e9e2ff'; ctx.textAlign = 'center'; ctx.fillText(id + ' ' + (params.pose || 'idle'), x, H - 14);
    });
  });
})();
