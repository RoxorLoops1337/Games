// Act II: THE GRAB (b12-b20) and THE CABINET IS ALIVE (b20-b28).
'use strict';

// ================================================================ PERFECT (b12 - b16)
// perfect_grab: release, the claw closes PERFECT on b14 in 0.2x slow motion, then it yanks the prize home at 2x
const PG = 'perfect_grab';
const PG_AT = b(14);
const pgFt = t => rampTo(t, PG_AT, cue(PG, ['PERFECT', 'perfect'], 3.5), [[b(12), 1.5], [b(13.3), 1.5], [b(13.9), .18], [b(15.1), .18], [b(15.5), 2.2]]);
// the crop rides the claw down and back up (re-aim once the capture's claw path is known)
const PG_CROP = t => ({ cx: keys([[b(12), .5], [PG_AT, .55]], t), cy: keys([[b(12), .58], [b(13.8), .72, E.inOutCubic], [b(15.3), .68], [b(16), .55, E.inCubic]], t),
  zoom: keys([[b(12), 1.0], [PG_AT, 1.2, E.outCubic], [b(15.3), 1.3], [b(16), 1.1, E.inCubic]], t) });
const PG_CLAW = [.57, .73];                                   // stage point of the claw at the PERFECT cue (re-aim with the capture)
shot({ id: 'perfect', t0: b(12), t1: b(16),
  draw(g, lt, P, t) {
    shakeAt(g, t, [12], 18, .1); shakeAt(g, t, [14], 30, .18, 20, 3);
    const o = PG_CROP(t);
    fullFrame(g, PG, pgFt(t), o);
    const [cx, cy] = ffPoint(o, PG_CLAW[0], PG_CLAW[1]);
    // slow motion: the world dims, the claw is lit
    const sm = inv(b(13.8), b(14), t) * (1 - inv(b(15.2), b(15.5), t));
    wash(g, '#140828', .35 * sm);
    glowEllipse(g, cx, cy, 380, 380, C.gold, .2 * sm);
    burst(g, t - PG_AT, { x: cx, y: cy, n: 80, seed: 14, speed: [300, 1300], life: [.6, 1.8], size: [3, 8], gy: 120, drag: 2.6, cols: [C.gold, '#fff6c8', C.pink], shape: 'star' });
    ring(g, cx, cy, t - PG_AT, { r0: 30, r1: 640, life: .55, col: C.gold, lw: 24 });
    callout(g, t - b(14.5), cx + 60, cy - 40, cx + L(520, 120), cy - L(300, 520), 'PERFECT', { col: C.gold, dur: b(1.4), r: 90 });
    // speed lines on the yank home
    speedLines(g, t, W / 2, H * .9, .5 * inv(b(15.4), b(15.6), t) * (1 - inv(b(15.8), b(16), t)), { n: 50, inner: 300, seed: 9 });
    vignetteDark(g, .55, .3);
  },
  post(lt, P, t) {
    P.flash = [1, .95, .8, .25 * kick(t, b(12), .04) + .7 * kick(t, PG_AT, .045)];
    P.ca = .0008 + .025 * kick(t, PG_AT, .12);
    const sm = inv(b(13.8), b(14), t) * (1 - inv(b(15.2), b(15.5), t));
    P.saturation = 1.12 - .35 * sm; P.contrast = 1.06 + .1 * sm;
    P.shocks = [{ x: .5, y: .6, r: E.outCubic(inv(PG_AT, PG_AT + .8, t)) * 1.2, w: .1, a: .6 * (1 - inv(PG_AT, PG_AT + .8, t)) }];
    P.zoomBlur = .12 * inv(b(15.4), b(15.6), t) * (1 - inv(b(15.8), b(16), t)) + .05 * kick(t, PG_AT, .1); P.zbCenter = [.5, .55];
    P.glitch = .35 * (1 - inv(b(12), b(12) + .06, t));
    P.K = sm > .5 ? 6 : 4;                                 // slow motion gets the smoothest shutter
  },
});

// ================================================================ SEE EVERY HIT (b16 - b20)
// resolve_row: the row's hits are re-timed so each lands on an 8th (b17, b17.5, b18, b18.5)
const RR = 'resolve_row';
const RR_B = [17, 17.5, 18, 18.5, 19];
function rrFt(t) {
  const src = RR_B.map((_, i) => cue(RR, ['row_card' + (i + 1) + '_hit', 'hit' + (i + 1)], 1 + i * .5));
  const dst = RR_B.map(b), n = RR_B.length;
  if (t <= dst[0]) return src[0] + (t - dst[0]);
  for (let i = 1; i < n; i++) if (t <= dst[i]) return lerp(src[i - 1], src[i], (t - dst[i - 1]) / (dst[i] - dst[i - 1]));
  return src[n - 1] + (t - dst[n - 1]);
}
const RR_ROW = [.5, .39];                                    // the YOUR HITS band (stage fractions); cards at x .17 + i * .165
shot({ id: 'resolve', t0: b(16), t1: b(20),
  draw(g, lt, P, t) {
    const hits = RR_B.map(x => kick(t, b(x), .12)).reduce((a, c) => a + c, 0);
    g.save();
    shakeAt(g, t, RR_B, 12, .1);
    const push = 1 + .05 * E.outCubic(inv(b(16), b(20), t)) + .02 * hits;
    camZoom(g, push, W * L(.6, .5), H * L(.45, .55));
    neonBg(g, t, { cam: [(t - b(16)) * 160, 0], speed: 1.4 });
    const fly = spring(t - b(16), 8, 6);
    const ph = { slot: 'rr', id: RR, ft: rrFt(t), x: lerp(W + 500, W * L(.655, .5), fly), y: H * L(.52, .6), h: L(900, 1250), ry: lerp(-.9, -.32, fly), rx: .06, rz: .02, col: C.teal, glare: .3 + .1 * lt };
    const pr = phone(g, ph);
    const [rx_, ry_] = pr.map(RR_ROW[0], RR_ROW[1]);
    RR_B.forEach((x, i) => {
      const [hx, hy] = pr.map(.17 + i * .165, .2);            // the hit lands on the enemies
      ring(g, hx, hy, t - b(x), { r0: 20, r1: 200, life: .35, col: [C.gold, C.pink, C.teal, '#fff', C.gold][i], lw: 12 });
      burst(g, t - b(x), { x: hx, y: hy, n: 26, seed: 30 + i, speed: [300, 900], life: [.25, .6], size: [3, 6], gy: 600, cols: [C.gold, '#fff', C.pink], shape: 'spark' });
    });
    const [bl, bt_] = pr.map(.01, .385), [br, bb_] = pr.map(.99, .475);
    callout(g, t - b(16.5), (bl + br) / 2, (bt_ + bb_) / 2, L(br + 70, bl + 40), L(bt_ - 150, bb_ + 190), 'YOUR HITS', { col: C.teal, dur: b(3.1), box: [br - bl + 30, bb_ - bt_ + 30] });
    g.restore();
    // the words, left
    const x0 = W * L(.27, .5);
    stagger(g, 'SEE EVERY', x0, H * L(.36, .085), t - b(16), { font: F.disp(84), fill: FILL.white, depth: 8, depthCol: '#4a2a7a', tracking: 2, per: .03 });
    slam(g, 'HIT', L(x0, W * .4), H * L(.6, .2), t - b(16.5), { font: F.disp(190), fill: FILL.candy, depth: 18, glow: C.pink, dur: 9, from: 3, rot: -.06 });
    // the hit counter ticks on every hit
    const n = RR_B.filter(x => t >= b(x)).length;
    if (n > 0) {
      const lh = t - b(RR_B[n - 1]);
      g.save(); g.translate(L(x0, W * .8), H * L(.82, .2)); const s = 1 + .35 * Math.exp(-lh * 12); g.scale(s, s);
      candyText(g, 'x' + n, 0, 0, { font: F.disp(120), fill: FILL.gold, depth: 10, depthCol: '#7a4a08', glow: C.gold });
      g.restore();
    }
  },
  post(lt, P, t) {
    P.flash = [1, 1, 1, .5 * kick(t, b(16), .05)];
    P.ca = .0008 + .006 * RR_B.map(x => kick(t, b(x), .1)).reduce((a, c) => a + c, 0);
    P.zoomBlur = .06 * (1 - inv(b(16), b(16.3), t)); P.zbCenter = [.7, .5];
  },
});

// ================================================================ THE CABINET IS ALIVE (b20 - b24)
const EVENTS = [
  { k: 'surge', at: 21.5, x: L(.2, .2), y: L(.53, .44), col: C.teal, label: 'SURGE', ry: .38, up: 1 },
  { k: 'coins', at: 22.25, x: L(.5, .5), y: L(.53, .6), col: C.gold, label: 'COIN SHOWER', ry: 0, up: L(1, 0) },
  { k: 'capsule', at: 23, x: L(.8, .8), y: L(.53, .44), col: C.pink, label: 'CAPSULE DROP', ry: -.38, up: 1 },
];
shot({ id: 'cabinet', t0: b(20), t1: b(24),
  draw(g, lt, P, t) {
    g.save();
    shakeAt(g, t, [20, 21.5, 22.25, 23], 16, .12);
    // whip in: the camera arrives from the right
    const whip = 1 - E.outExpo(inv(b(20), b(20.6), t));
    const zt = E.inCubic(inv(b(23.5), b(24), t));
    camZoom(g, 1 + zt * 3.2, W / 2, H * .5, -whip * W * .9, 0);
    neonBg(g, t, { cam: [(t - b(20)) * 140 + whip * 900, 0], speed: 1.5 });
    EVENTS.forEach((ev, i) => {
      const on = inv(b(ev.at) - .03, b(ev.at), t);
      const fly = spring(t - b(20.3) - i * .07, 7, 6);
      const id = 'cabinet_event_' + ev.k;
      const ft = cue(id, 'cab_event_' + ev.k + '_land', .2) + (t - b(ev.at));
      const pr = phone(g, { slot: 'ev' + i, id, ft, x: W * ev.x, y: lerp(H * 1.6, H * ev.y, fly) - 18 * kick(t, b(ev.at), .15), h: L(700, 620),
        ry: ev.ry, rx: .05, col: ev.col, dim: .55 * (1 - on), glow: .4 + on * .8, flash: .6 * kick(t, b(ev.at), .06), glare: .4 + i * .1 });
      const [px, py] = pr.map(.5, .5), [tx, ty] = ev.up ? pr.map(.5, -.02) : pr.map(.5, 1.12);
      const age = t - b(ev.at);
      if (ev.k === 'surge' && age >= 0 && age < .5) {
        for (let j = 0; j < 3; j++) lightning(g, px + (j - 1) * 120, -20, px + (j - 1) * 60 + 40 * Math.sin(j), py + 120, 100 + j + Math.floor(age * 30), { alpha: 1 - age / .5, lw: 4, glow: C.teal });
      }
      if (ev.k === 'coins') burst(g, age, { x: px, y: py - 260, n: 46, seed: 51, speed: [400, 1300], angle: [-Math.PI * .95, -Math.PI * .05], life: [.6, 1.3], size: [16, 30], gy: 2200, drag: .6, cols: [C.gold], shape: 'coin', add: false });
      if (ev.k === 'capsule') { ring(g, px, py, age, { r0: 30, r1: 420, life: .45, col: C.pink, lw: 18 }); burst(g, age, { x: px, y: py, n: 50, seed: 61, speed: [300, 1100], life: [.4, .9], size: [4, 8], gy: 400, cols: [C.pink, '#fff', C.teal], shape: 'star' }); }
      // the label chip above the phone
      if (age >= 0) {
        const s = spring(age, 12, 7);
        g.save(); g.translate(tx, ty - 46 * (ev.up ? 1 : -1)); g.scale(s * L(1, .85), s * L(1, .85));
        pill(g, ev.label, 0, 0, { font: F.cond(84), bg: 'rgba(11,6,24,.94)', border: ev.col, fg: '#fff', h: 104, padX: 60, tracking: 3, glow: ev.col });
        g.restore();
      }
    });
    g.restore();
    // the headline arrives with the whip, leaves before the first event
    const hl = t - b(20.15);
    slam(g, 'THE CABINET', W / 2, H * L(.42, .45), hl, { font: F.disp(124), fill: FILL.white, depth: 12, depthCol: '#4a2a7a', dur: b(1.25), exitTo: 'up', out: .12, from: 2.4 });
    slam(g, 'IS ALIVE', W / 2, H * L(.66, .56), hl - .08, { font: F.disp(170), fill: FILL.candy, depth: 16, glow: C.pink, dur: b(1.25) - .04, exitTo: 'up', out: .12, from: 2.8, rot: .05 });
  },
  post(lt, P, t) {
    P.zoomBlur = .3 * (1 - E.outExpo(inv(b(20), b(20.6), t))) + .3 * E.inCubic(inv(b(23.5), b(24), t)); P.zbCenter = [.5, .5];
    P.flash = [.8, 1, 1, .5 * kick(t, b(21.5), .05)];
    P.ca = .0008 + .012 * (kick(t, b(21.5), .1) + kick(t, b(22.25), .1) + kick(t, b(23), .1));
    P.K = t < b(20.6) ? 6 : 4;
  },
});

// ================================================================ LAMP FEVER (b24 - b28)
const LF = 'lamp_fever';
const LF_LAMP = [.87, .385];                                 // the fever lamp on the cabinet roof (stage fractions)
const LF_TEXT = [.5, .48];                                   // the game's own LAMP FEVER! banner
const LF_AT = () => cue(LF, ['LAMP_FEVER', 'fever'], 0) + .6;   // the banner pops ~36 frames after the lamp fills
const LF_CROP = t => ({ cx: keys([[b(24), .5], [b(25.9), .5], [b(26.3), .5, E.outExpo]], t), cy: keys([[b(24), .48], [b(25.9), .47], [b(26.3), .7, E.outExpo], [b(28), .72]], t), zoom: keys([[b(23.9), 1.0], [b(24.15), 1.35, E.outExpo], [b(25.9), 1.42], [b(26.3), 1.3, E.outExpo], [b(28), 1.45]], t) });
const LF_PILE = [.42, .78];
shot({ id: 'fever', t0: b(24), t1: b(28),
  draw(g, lt, P, t) {
    shakeAt(g, t, [24, 26], 26, .16); shakeAt(g, t, [25, 27], 8, .1, 24, 9);
    const o = LF_CROP(t);
    fullFrame(g, LF, LF_AT() + (t - b(24)), o);
    const [lx, ly] = ffPoint(o, LF_LAMP[0], LF_LAMP[1]);
    // the fever light: beat strobes, rays from the lamp, a gold flare
    const bk = beatKick(t, 24, 28, .12, .5);
    shafts(g, lx, ly, .55 + .35 * bk, { n: 12, dir: Math.PI * .72, spread: 1.4, len: 1500, seed: 77, t, col: 'rgba(255,215,110,A)', width: 1.4 });
    flare(g, lx, ly, .6 + .5 * bk);
    // confetti from the top on the two downbeats
    for (const [bt, sd] of [[24, 1], [26, 2]]) {
      burst(g, t - b(bt), { x: W / 2, y: -60, n: 160, seed: 90 + sd, speed: [300, 1600], angle: [Math.PI * .1, Math.PI * .9], life: [1.2, 2.4], size: [8, 16], gy: 700, drag: 1.4, cols: [C.pink, C.teal, C.gold, '#fff', C.purple], shape: 'confetti', spin: 18, add: false });
    }
    burst(g, t - b(24), { x: lx, y: ly, n: 70, seed: 7, speed: [600, 2000], life: [.4, 1], size: [4, 9], gy: 900, cols: [C.gold, '#fff'], shape: 'spark' });
    vignetteDark(g, .45, .3);
    const [fx_, fy_] = ffPoint(o, LF_TEXT[0], LF_TEXT[1]);
    ring(g, fx_, fy_, t - b(24), { r0: 80, r1: 900, life: .5, col: C.gold, lw: 26 });
    callout(g, t - b(24.6), lx - 30, ly + 10, lx - L(420, 300), ly + L(300, 420), 'JACKPOT LAMP', { col: C.gold, dur: b(1.2), r: 100 });
    const [px_, py_] = ffPoint(o, LF_PILE[0], LF_PILE[1]);
    callout(g, t - b(26.4), px_, py_, px_ + L(380, 60), py_ - L(300, 420), 'PRIZES RAIN', { col: C.gold, dur: b(1.4), box: [700, 260] });
  },
  post(lt, P, t) {
    const bk = beatKick(t, 24, 28, .1, .5);
    P.exposure = 1 + .12 * bk;
    P.flash = [1, .95, .7, .3 * kick(t, b(24), .04) + .25 * kick(t, b(26), .05)];
    P.shocks = [{ x: .5, y: .55, r: E.outCubic(inv(b(24), b(24) + .7, t)) * 1.3, w: .1, a: .6 * (1 - inv(b(24), b(24) + .7, t)) }];
    P.ca = .0008 + .02 * kick(t, b(24), .12) + .01 * kick(t, b(26), .1);
    P.zoomBlur = .3 * (1 - E.outCubic(inv(b(24), b(24.3), t))) + .14 * kick(t, b(26), .12); P.zbCenter = [.8, .4];
    P.rays = (.5 + .3 * bk) * (1 - inv(b(26), b(26.3), t)); P.raysPos = [.82, .38];
    P.bloom = .85; P.saturation = 1.2;
  },
});
