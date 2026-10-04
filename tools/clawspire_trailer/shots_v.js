// The vertical cut (1080x1920, ?fmt=v), the main deliverable, on its own clock
// (cues.json + audio.py). Fewer topics, held longer: fast punch shots (the coin,
// the claw dive, the claw types, the bat wipe, the depths) between hold shots
// where one short headline and the real UI stay up long enough to read
// (at least 0.35 s per word + 0.6 s, never replaced while still animating in).
//
// The captures are natively 1080x1920, so the game is shown whole: full bleed
// at zoom 1 (at most a ~8 percent push for emphasis) or inside a fully visible
// phone. Words stay in the platform safe zone: not in the top 12 percent or the
// bottom 20 percent, 6 percent side margins.
'use strict';

const VS = { x0: 65, x1: 1015, y0: 230, y1: 1536 };          // the safe zone
const VW = VS.x1 - VS.x0;                                  // 950
const vfit = (txt, fontFn, size, maxW = VW) => fontFn(fit(txt, fontFn, size, maxW));
const vff = (zoom = 1, o = {}) => Object.assign({ cx: .5, cy: .5, zoom: Math.min(zoom, o.max || 1.09) }, o);
// the top band for a headline above a phone, and that phone (bezel top 610, below the band)
const V_TOP = [65, 236, 1015, 575];
const V_PH = { x: W / 2, y: 1140, h: 1000 };
// PL_DARK, CL_, hitsLine and spookyLine live in fx.js
function vplate(g, y0, y1, a = .62) {
  if (a <= 0) return;
  const gr = g.createLinearGradient(0, y0 - 80, 0, y1 + 80);
  gr.addColorStop(0, 'rgba(8,4,18,0)'); gr.addColorStop(.25, `rgba(8,4,18,${a})`); gr.addColorStop(.75, `rgba(8,4,18,${a})`); gr.addColorStop(1, 'rgba(8,4,18,0)');
  g.fillStyle = gr; g.fillRect(0, y0 - 80, W, y1 - y0 + 160);
}
// a quiet sub-line (Outfit), fades and rises in, stays put
function subline(g, txt, y, lt, o = {}) {
  if (lt < 0) return;
  const u = E.outCubic(clamp(lt / .25));
  g.save(); g.globalAlpha *= u;
  g.font = vfit(txt, F.ui, o.size || 70, 900); g.textAlign = 'center'; g.lineJoin = 'round'; g.letterSpacing = '1px';
  const yy = y + (1 - u) * 24;
  g.lineWidth = 14; g.strokeStyle = '#0b0618'; g.strokeText(txt, W / 2, yy);
  g.fillStyle = o.col || '#ffffff'; g.fillText(txt, W / 2, yy);
  { const m = g.measureText(txt); layText(g, txt, W / 2 - m.actualBoundingBoxLeft - 7, yy - m.actualBoundingBoxAscent - 7, W / 2 + m.actualBoundingBoxRight + 7, yy + m.actualBoundingBoxDescent + 7); }
  g.restore();
}
const vshot = def => shot(Object.assign({ vert: true }, def));
// keep-clear rects: game UI in stage fractions under a full-frame crop, or a whole phone
function kcFF(o, id, r) { const [a, c] = ffPoint(o, r[0], r[1]), [d, e] = ffPoint(o, r[2], r[3]); keepClear(id, [a, c, d, e]); }
function kcPhone(pr, id) { const [a, c] = pr.map(-.04, -.025), [d, e] = pr.map(1.04, 1.025); keepClear(id, [Math.min(a, d), Math.min(c, e), Math.max(a, d), Math.max(c, e)]); }
const KC_HUD = [0, 0, 1, .066], KC_HP = [0, .31, 1, .345];
// a piecewise source-time map: pts [[beat, sourceSeconds], ...], 1x outside
function pmap(t, pts) {
  const p = pts.map(([bb, s]) => [b(bb), s]);
  if (t <= p[0][0]) return p[0][1] + (t - p[0][0]);
  for (let i = 1; i < p.length; i++) if (t <= p[i][0]) return lerp(p[i - 1][1], p[i][1], (t - p[i - 1][0]) / (p[i][0] - p[i - 1][0]));
  return p[p.length - 1][1] + (t - p[p.length - 1][0]);
}

// ================================================================ OPEN (b0 - b4) fast
vshot({ id: 'v-open', t0: 0, t1: b(4),
  draw(g, lt, P, t) {
    if (t < b(1)) {
      const u = clamp(t / b(1));
      coinSlot(g, W / 2, 900, 0);
      g.save(); g.globalAlpha = clamp(t / .12); coin(g, W / 2, lerp(-140, 860, E.inQuad(u)), 80, t * 14); g.restore();
      headline(g, { id: 'insert', rect: [65, 1200, 1015, 1400], lines: [CL_('INSERT COIN', 0, 1, FILL.candy, '#8a0f50', null, { ov: 1 })] }, 1);
      return;
    }
    const tg = b(3);
    const ft = rampTo(t, tg + .05, cue('title_neon', TN_GRAB, 1.2), [[b(1), 2.2], [b(2.4), 2.2], [b(2.9), .4], [tg, 0], [tg + .05, 0], [tg + .06, 2.6]]);
    const o = vff(keys([[b(1), 1.0], [b(3), 1.08, E.outCubic], [b(3.55), 1.08], [b(4), 1.5, E.inCubic]], t), { cy: .3, max: 1.6 });
    shakeAt(g, t, [3], 26, .12);
    fullFrame(g, 'title_neon', ft, o);
    wash(g, '#ffd27a', .9 * kick(t, b(1), .07), 'lighter');
    const [sx, sy] = ffPoint(o, .5, .29);
    burst(g, t - tg, { x: sx, y: sy, n: 60, seed: 3, speed: [500, 1500], life: [.25, .7], size: [3, 7], gy: 600, drag: 3, cols: [C.gold, '#fff3c0', C.pink], shape: 'spark', streak: .03 });
    ring(g, sx, sy, t - tg, { r0: 30, r1: 420, life: .4, col: C.gold, lw: 18 });
    vignetteDark(g, .55, .3);
  },
  post(lt, P, t) {
    P.flash = [1, .92, .75, t >= b(1) ? .9 * kick(t, b(1), .05) : 0];
    P.ca = .0008 + .02 * kick(t, b(3), .1);
    P.zoomBlur = .06 * kick(t, b(3), .08) + .25 * E.inQuad(inv(b(3.55), b(4), t)); P.zbCenter = [.5, .3];
    P.shocks = [{ x: .5, y: .29, r: E.outCubic(inv(b(3), b(3) + .5, t)) * .9, w: .08, a: .5 * (1 - inv(b(3), b(3) + .5, t)) }];
    if (t < b(1)) { P.bloom = .8; P.vignette = .6; }
  },
});

// ================================================================ 1. THE NEW TITLE / 2.0 (b4 - b10) hold
const V_HERO_H = 1250;
const vHero = t => {
  const u = t - T0, fly = spring(u + .05, 9, 5.5);
  return { x: W / 2, y: lerp(H + 700, 990, fly), h: V_HERO_H, rx: lerp(.9, .08, fly), ry: lerp(-.8, .14, fly) - .14 * E.inOutCubic(inv(b(4.5), b(6), t)),
    rz: lerp(-.25, .02, fly), glare: lerp(.1, .8, inv(T0, b(6), t)) };
};
vshot({ id: 'v-title-phone', t0: T0, t1: b(6),
  draw(g, lt, P, t) {
    const zIn = H / V_HERO_H;
    const z = t < b(5) ? 1 : Math.pow(zIn, E.inCubic(inv(b(5), b(6), t)));
    const ph = Object.assign({ slot: 'hero', id: 'title_neon', ft: titleFt(t), col: C.pink }, vHero(t));
    const [lx, ly] = phoneGeom(ph).map(.5, .5);
    g.save();
    shakeAt(g, t, [4], 22, .14);
    camZoom(g, z, lerp(W / 2, lx, inv(b(5), b(5.8), t)), lerp(H / 2, ly, inv(b(5), b(5.8), t)));
    neonBg(g, t, { cam: [(t - T0) * 120, 0], speed: 1.2 });
    motes(g, t, { n: 50, seed: 12, box: [0, 0, W, H], speed: [60, 200], size: [2, 5], cols: [C.gold, C.pink, C.teal, '#fff'], alpha: .9 });
    phone(g, ph);
    burst(g, t - T0, { x: W / 2, y: H * .5, n: 90, seed: 41, speed: [600, 2200], life: [.4, 1.1], size: [3, 8], gy: 500, drag: 2.4, cols: [C.pink, C.teal, C.gold, '#fff'], shape: 'confetti', spin: 20 });
    g.restore();
  },
  post(lt, P, t) {
    P.flash = [1, .8, .95, .85 * kick(t, T0, .06)];
    P.shocks = [{ x: .5, y: .5, r: E.outCubic(inv(T0, T0 + .6, t)) * 1.2, w: .1, a: .6 * (1 - inv(T0, T0 + .6, t)) }];
    P.ca = .0008 + .015 * kick(t, T0, .12);
    P.zoomBlur = .05 * kick(t, T0, .1) + .3 * E.inCubic(inv(b(5), b(6), t)); P.zbCenter = [.5, .5];
    P.bloom = .75;
  },
});
vshot({ id: 'v-title-ff', t0: b(6), t1: b(10),
  draw(g, lt, P, t) {
    const tb = b(6);
    shakeAt(g, t, [6], 30, .16); shakeAt(g, t, [8], 10, .1, 24, 5);
    { const o = vff(1 + .06 * E.outCubic(inv(b(6), b(10), t))); fullFrame(g, 'title_neon', titleFt(t), o); kcFF(o, 'game logo', [.06, .1, .94, .228]); }
    const gr = g.createLinearGradient(0, 560, 0, 1700);
    gr.addColorStop(0, 'rgba(10,5,22,0)'); gr.addColorStop(.3, 'rgba(10,5,22,.62)'); gr.addColorStop(1, 'rgba(10,5,22,.8)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    glowEllipse(g, W / 2, 1000, 620 * (1 + .3 * kick(t, tb, .3)), 380, C.pink, .55);
    shafts(g, W / 2, 980, .5 * (.4 + .6 * kick(t, tb, .6)), { n: 16, dir: -Math.PI / 2, spread: Math.PI * 2, len: 1300, seed: 8, t, col: 'rgba(255,120,190,A)', spin: .05 });
    burst(g, t - tb, { x: W / 2, y: 980, n: 140, seed: 21, speed: [500, 2400], life: [.4, 1.3], size: [3, 9], gy: 700, drag: 2.2, cols: [C.gold, C.pink, '#fff', C.teal], shape: 'star' });
    motes(g, t, { n: 70, seed: 81, speed: [80, 260], size: [2, 5], cols: [C.gold, C.pink, '#fff', C.teal], alpha: .9 });
    // 2.0 lands on b6 exactly; THE BIG UPDATE sits on its own plate under it
    headline(g, { id: '2.0', rect: [65, 600, 1015, 1250], maxSize: 330, lines: [CL_('2.0', tb, 1, FILL.candy, '#8a0f50', C.pink, { depthK: .085 })] }, t);
    flare(g, W / 2 - 6, 1080, 1.1 * kick(t, tb + .05, .35));
    headline(g, { id: 'big update', rect: [65, 1290, 1015, 1480], plate: true, plateStyle: { bg: 'rgba(6,30,34,.85)', border: 'rgba(46,230,214,.6)' },
      lines: [CL_('THE BIG UPDATE', b(6.4), 1, FILL.teal, '#06504c', null, { depthK: .07 })] }, t);
  },
  post(lt, P, t) {
    const tb = b(6);
    P.flash = [1, .95, 1, t < tb + 1 / 60 ? .9 : .8 * kick(t, tb, .05)];
    P.zoomBlur = .3 * (1 - E.outCubic(inv(b(6), b(6.4), t))); P.zbCenter = [.5, .5];
    P.shocks = [{ x: .5, y: .53, r: E.outCubic(inv(tb, tb + .7, t)) * 1.1, w: .1, a: .7 * (1 - inv(tb, tb + .7, t)) }];
    P.ca = .0008 + .025 * kick(t, tb, .1);
    P.rays = .9 * kick(t, tb, .8); P.raysPos = [.5, .53];
    P.bloom = .8;
    const gl = inv(b(9.7), b(10), t);
    P.glitch = gl > 0 ? .3 + .7 * gl : 0; P.rgb = .02 * gl * (Math.floor(t * 30) % 2 ? 1 : -1);
  },
});

// ================================================================ 2. SEE EVERY HIT (b10 - b21) the longest hold
// the resolve row uncut: the prizes land, GO! on b11, the five cards hit on the grid
const V_HITS = [12.5, 14.25, 16, 17.75, 19.5];
const vrrFt = t => pmap(t, [[10, cue(RR, 'delivered_1', 5.35) - .25], [11, cue(RR, 'row_GO', 6.43)]].concat(
  V_HITS.map((bb, i) => [bb, cue(RR, 'row_card' + (i + 1) + '_hit', 7.65 + i)])));
vshot({ id: 'v-hits', t0: b(10), t1: b(21),
  draw(g, lt, P, t) {
    const hk = V_HITS.map(x => kick(t, b(x), .12)).reduce((a, c) => a + c, 0);
    g.save();
    shakeAt(g, t, V_HITS, 9, .1);
    const fly = E.outExpo(clamp((t - b(10)) / .3));
    const o = vff(1 + .025 * hk, { cy: .3 });
    o.ox = (1 - fly) * W;
    fullFrame(g, RR, vrrFt(t), o);
    kcFF(o, 'HUD', KC_HUD); kcFF(o, 'enemy HP bars', KC_HP); kcFF(o, 'YOUR HITS row', [0, .345, 1, .5]); kcFF(o, 'card panels', [0, .865, 1, .94]);
    V_HITS.forEach((x, i) => {
      const [hx, hy] = ffPoint(o, .1 + .2 * i, .43);              // the card that strikes
      ring(g, hx, hy, t - b(x), { r0: 30, r1: 240, life: .35, col: [C.gold, C.pink, C.teal, '#fff', C.gold][i], lw: 12 });
      burst(g, t - b(x), { x: hx, y: hy, n: 22, seed: 30 + i, speed: [300, 900], life: [.25, .6], size: [3, 6], gy: 600, cols: [C.gold, '#fff', C.pink], shape: 'spark' });
    });
    const [bl, bt_] = ffPoint(o, .015, .385), [br, bb_] = ffPoint(o, .985, .475);
    g.restore();
    // bracket the row as it fills and GO! stamps it
    callout(g, t - b(10.75), (bl + br) / 2, (bt_ + bb_) / 2, (bl + br) / 2, (bt_ + bb_) / 2, '', { col: C.teal, dur: b(2.2), box: [br - bl + 20, bb_ - bt_ + 24] });
    // the words live on a plate over the cabinet (idle once the row runs); the row and the enemies stay clear
    const n = V_HITS.filter(x => t >= b(x)).length, lh = n ? t - b(V_HITS[n - 1]) : 9;
    headline(g, { id: 'hits', rect: [65, 1000, 1015, 1530], plate: true, plateStyle: PL_DARK, gap: .12, lines: [
      CL_('SEE EVERY', b(10.25) + POP_IN, .52, FILL.white, '#4a2a7a', null, { depthK: .07 }),
      CL_('HIT  x5', b(10.5) + POP_IN, 1, FILL.candy, '#8a0f50', C.pink, { ov: 1.12, depthK: .09, id: 'HIT', draw(g, l, opts) {
        const xL = l.x - measure('HIT  x5', l.font).w / 2;
        candyText(g, 'HIT', xL, l.y, Object.assign({}, opts, { align: 'left', id: 'HIT' }));
        if (!n) return;
        const xc = xL + measure('HIT  ', l.font).w, cw = measure('x' + n, l.font, 0, 'left'), ps = 1 + .08 * Math.exp(-lh * 12);
        g.save(); g.translate(xc + (cw.l + cw.r) / 2 - cw.l, l.y - cw.asc / 2); g.scale(ps, ps); g.translate(-(xc + (cw.l + cw.r) / 2 - cw.l), -(l.y - cw.asc / 2));
        candyText(g, 'x' + n, xc, l.y, Object.assign({}, opts, { align: 'left', fill: FILL.gold, depthCol: '#7a4a08', glow: C.gold, id: 'counter' }));
        g.restore();
      } }),
      { txt: 'Every hit, one by one', at: b(11.5), k: .3, font: F.ui, fill: C.mint, depthK: 0, outline: '#0b0618', outlineK: .12, ov: 1 },
    ] }, t);
  },
  post(lt, P, t) {
    P.flash = [1, 1, 1, .45 * kick(t, b(10), .05) + .25 * kick(t, b(11), .04)];
    P.ca = .0008 + .005 * V_HITS.map(x => kick(t, b(x), .1)).reduce((a, c) => a + c, 0);
    P.zoomBlur = .08 * (1 - inv(b(10), b(10.3), t)); P.zbCenter = [.5, .4];
    // the breath: the picture cools a touch with the music, then warms into the build
    const br = inv(b(13.5), b(14), t) * (1 - inv(b(17.5), b(21), t));
    P.saturation = 1.12 - .12 * br;
  },
});

// ================================================================ 3. THE CABINET IS ALIVE (b21 - b29) hold
const V_EV = [
  { id: 'cabinet_event_surge', land: 'cab_event_surge_land', b0: 21, b1: 23.5, at: 21.5, col: C.teal },
  { id: 'cabinet_event_coins', land: 'cab_event_coins_land', b0: 23.5, b1: 26, at: 24, col: C.gold },
];
V_EV.forEach((ev, i) => vshot({ id: 'v-ev' + i, t0: b(ev.b0), t1: b(ev.b1),
  draw(g, lt, P, t) {
    g.save();
    shakeAt(g, t, [ev.b0, ev.at], 14, .12, 24, i);
    const o = vff(1 + .04 * kick(t, b(ev.at), .25), { cy: 0 });   // zoom anchored at the top: the HUD and HP bars stay put
    o.ox = (i ? 1 : -1) * (1 - E.outExpo(clamp(lt / .25))) * W * .7;
    fullFrame(g, ev.id, cue(ev.id, ev.land, 1.52) + (t - b(ev.at)), o);
    kcFF(o, 'HUD', KC_HUD); kcFF(o, 'enemy HP bars', KC_HP); kcFF(o, 'GRABS', [.6, .35, 1, .395]); kcFF(o, 'event sign', [.05, .52, .95, .65]);
    const [px, py] = ffPoint(o, .5, .6), age = t - b(ev.at);
    if (i === 0 && age >= 0 && age < .55) for (let j = 0; j < 3; j++) lightning(g, px + (j - 1) * 220, 560, px + (j - 1) * 90, py + 80, 100 + j + Math.floor(age * 30), { alpha: 1 - age / .55, lw: 5, glow: C.teal });
    if (i === 1) burst(g, age, { x: W / 2, y: 900, n: 46, seed: 51, speed: [400, 1300], angle: [-Math.PI * .95, -Math.PI * .05], life: [.6, 1.3], size: [18, 34], gy: 2200, drag: .6, cols: [C.gold], shape: 'coin', add: false });
    ring(g, px, py, age, { r0: 40, r1: 560, life: .45, col: ev.col, lw: 16 });
    g.restore();
    // one headline across both events (the second cut finds it already settled)
    headline(g, { id: 'cabinet', rect: [65, 240, 1015, 585], plate: true, plateStyle: PL_DARK, lines: [
      CL_('THE CABINET', b(21.25) + POP_IN, .72, FILL.white, '#4a2a7a'),
      CL_('IS ALIVE', b(21.4) + POP_IN, 1, FILL.candy, '#8a0f50', C.pink)] }, t);
  },
  post(lt, P, t) {
    P.zoomBlur = .22 * (1 - E.outExpo(clamp(lt / .25))); P.zbCenter = [.5, .5];
    P.flash = [1, 1, 1, .3 * kick(lt, 0, .04) + .18 * kick(t, b(ev.at), .04)];
    P.ca = .0008 + .012 * kick(t, b(ev.at), .1);
    P.K = lt < .25 ? 6 : 4;
  },
}));
vshot({ id: 'v-fever', t0: b(26), t1: b(29),
  draw(g, lt, P, t) {
    shakeAt(g, t, [26], 24, .16); shakeAt(g, t, [27, 28], 8, .1, 24, 9);
    const o = vff(keys([[b(26), 1.0], [b(26.25), 1.07, E.outExpo], [b(29), 1.04]], t), { cy: 0 });
    fullFrame(g, LF, LF_AT() - .1 + (t - b(26)), o);
    kcFF(o, 'HUD', KC_HUD); kcFF(o, 'enemy HP bars', KC_HP); kcFF(o, 'game LAMP FEVER banner', [.25, .505, .75, .565]);
    const [lx, ly] = ffPoint(o, LF_LAMP[0], LF_LAMP[1]);
    const bk = beatKick(t, 26, 29, .12, .5);
    shafts(g, lx, ly, .5 + .3 * bk, { n: 12, dir: Math.PI * .72, spread: 1.4, len: 1500, seed: 77, t, col: 'rgba(255,215,110,A)', width: 1.4 });
    flare(g, lx, ly, .5 + .4 * bk, { size: .7 });
    burst(g, t - b(26), { x: W / 2, y: -60, n: 170, seed: 91, speed: [300, 1500], angle: [Math.PI * .1, Math.PI * .9], life: [1.4, 2.6], size: [8, 16], gy: 650, drag: 1.4, cols: [C.pink, C.teal, C.gold, '#fff', C.purple], shape: 'confetti', spin: 18, add: false });
    burst(g, t - b(26), { x: lx, y: ly, n: 70, seed: 7, speed: [600, 2000], life: [.4, 1], size: [4, 9], gy: 900, cols: [C.gold, '#fff'], shape: 'spark' });
    headline(g, { id: 'fever', rect: [65, 240, 1015, 585], plate: true, plateStyle: PL_DARK, lines: [
      CL_('LAMP FEVER', b(26) + POP_IN * .5, 1, FILL.gold, '#7a4a08', C.gold)] }, t);
  },
  post(lt, P, t) {
    const bk = beatKick(t, 26, 29, .1, .5);
    P.exposure = 1 + .08 * bk;
    P.flash = [1, .95, .7, .35 * kick(t, b(26), .04)];
    P.shocks = [{ x: .5, y: .48, r: E.outCubic(inv(b(26), b(26) + .7, t)) * 1.3, w: .1, a: .6 * (1 - inv(b(26), b(26) + .7, t)) }];
    P.ca = .0008 + .02 * kick(t, b(26), .12);
    P.zoomBlur = .25 * (1 - E.outCubic(inv(b(26), b(26.3), t))); P.zbCenter = [.5, .45];
    P.rays = .5 + .3 * bk; P.raysPos = [.87, .39];
    P.bloom = .8; P.saturation = 1.2;
  },
});

// ================================================================ 4. BUILD YOUR WAY (b29 - b35.5) hold, then the claws fast
function buildTitle(g, t) {
  headline(g, { id: 'build', rect: V_TOP, until: b(35.1) - .12, lines: [
    CL_('BUILD', b(29) + POP_IN, .7, FILL.white, '#4a2a7a'),
    CL_('YOUR WAY', b(29) + POP_IN + .14, 1, FILL.gold, '#7a4a08', C.gold)] }, t);
}
vshot({ id: 'v-build', t0: b(29), t1: b(31.5),
  draw(g, lt, P, t) {
    g.save();
    shakeAt(g, t, [29], 14, .1);
    neonBg(g, t, { cam: [t * 200, 0], speed: 1.6 });
    const fly = E.outBack(clamp(lt / .25), 1.3);
    const pr = phone(g, { slot: 'vb', id: 'combo_pick', ft: cue('combo_pick', 'pick_take', 2.08) + (t - b(31)), x: V_PH.x + (1 - fly) * W * .5, y: V_PH.y, h: V_PH.h,
      ry: -.1 + (1 - fly) * -.6, rx: .04, col: C.gold, glare: .3 + lt * .3, flash: .4 * kick(t, b(31), .05) });
    // the Weapon Rack card is the one taken (bottom of the three)
    const [cx_, cy_] = pr.map(.5, .44);
    callout(g, t - b(30.2), cx_, cy_, cx_, cy_, '', { col: C.gold, dur: b(1.1), box: [pr.w * .68, pr.h * .1] });
    g.restore();
    buildTitle(g, t);
  },
  post(lt, P, t) {
    P.zoomBlur = .16 * (1 - E.outExpo(clamp(lt / .3))); P.zbCenter = [.5, .55];
    P.flash = [1, 1, 1, .35 * kick(lt, 0, .04)];
    P.ca = .0008 + .012 * kick(lt, 0, .1);
  },
});
const V_CLAWS = CLAW_IDS.map((c, k) => ({ c, k, at: 31.5 + k * .5 }));
const vGrid = k => ({ x: 65 + 119 + (k % 4) * 237, y: 815 + Math.floor(k / 4) * 370, h: 310 });
vshot({ id: 'v-claws', t0: b(31.5), t1: b(35.5),
  draw(g, lt, P, t) {
    g.save();
    shakeAt(g, t, V_CLAWS.map(w => w.at), 8, .08);
    const exit = E.inCubic(inv(b(35.1), b(35.5), t));
    camZoom(g, 1 + exit * 1.2, W / 2, 1000);
    neonBg(g, t, { cam: [t * 160, 0], speed: 1.8 });
    for (const w of V_CLAWS) {
      const age = t - b(w.at);
      if (age < 0) continue;
      const s = spring(age, 13, 7.5), geo = vGrid(w.k);
      phone(g, Object.assign({ slot: 'vw' + w.c, id: 'claw_' + w.c, ft: cue('claw_' + w.c, ['claw_close', 'grab'], .6) - .3 + age, col: CLAW_COL[w.c],
        flash: .6 * kick(age, 0, .05), glare: .5, glow: .6, rx: .03, ry: ((w.k % 4) - 1.5) * -.1 }, geo, { scale: lerp(1.1, 1, s), alpha: clamp(age / .05) }));
      ring(g, geo.x, geo.y, age, { r0: 60, r1: 360, life: .3, col: CLAW_COL[w.c], lw: 10 });
    }
    g.restore();
    buildTitle(g, t);
    headline(g, { id: 'claws', rect: [65, 1384, 1015, 1530], until: b(35.1) - .12, lines: [CL_('8 CLAW TYPES', b(31.5) + POP_IN, 1, FILL.candy, '#8a0f50', C.pink)] }, t);
  },
  post(lt, P, t) {
    P.flash = [1, 1, 1, .2 * kick(t, b(31.5), .05)];
    P.ca = .0008 + .004 * V_CLAWS.map(w => kick(t, b(w.at), .08)).reduce((a, c) => a + c, 0);
    P.zoomBlur = .35 * E.inCubic(inv(b(35.1), b(35.5), t)); P.zbCenter = [.5, .52];
    const gl = inv(b(34.9), b(35.5), t); P.glitch = gl > 0 ? .2 + .5 * gl : 0;
  },
});

// ================================================================ 5. CAPSULE FEVER (b35.5 - b42)
const vclFt = t => {
  const burst_ = cue(CL, ['phase_burst', 'legendary'], 2.15);
  if (t < b(37.5)) return pmap(t, [[35.5, cue(CL, 'tap_1', .83) - .5], [36, cue(CL, 'tap_1', .83)], [36.5, cue(CL, ['upgrade_to_r', 'tap_2'], 1.28)], [37, cue(CL, ['upgrade_to_l', 'tap_3'], 1.72)], [37.5, burst_]]);
  return rampTo(t, b(37.5), burst_, [[b(37.5), 1.5], [b(38), 1.5], [b(38.2), .4]]);
};
vshot({ id: 'v-capsule', t0: b(35.5), t1: b(42),
  draw(g, lt, P, t) {
    const lg = b(37.5);
    const tr = t < lg ? 3 * inv(b(35.5), lg, t) : 0;
    g.save();
    if (tr > 0) { const s = shake(t, tr * 3, 30, 4); g.translate(s[0], s[1]); }
    shakeAt(g, t, [36, 36.5, 37], 14, .1); shakeAt(g, t, [37.5], 34, .25, 18, 2);
    const o = vff(keys([[b(35.5), 1.0], [b(37.4), 1.08, E.inQuad], [b(37.5), 1.0, E.outExpo]], t), { cy: .48 });
    fullFrame(g, CL, vclFt(t), o);
    kcFF(o, 'game LEGENDARY title', [.18, .09, .82, .225]); kcFF(o, 'capsule', [.28, .4, .72, .62]);
    g.restore();
    const [cx, cy] = ffPoint(o, CL_CAP[0], CL_CAP[1]);
    wash(g, '#05020c', .45 * inv(b(35.5), b(37.4), t) * (1 - inv(lg, lg + .06, t)));
    [[36, C.teal], [36.5, C.pink], [37, C.gold]].forEach(([bb, col], i) => {
      ring(g, cx, cy, t - b(bb), { r0: 120, r1: 600, life: .4, col, lw: 20 });
      burst(g, t - b(bb), { x: cx, y: cy, n: 30, seed: 37 + i, speed: [400, 1200], life: [.3, .7], size: [4, 9], gy: 600, cols: [col, '#fff'], shape: 'star' });
    });
    if (t >= lg) {
      const a = .35 + .4 * kick(t, lg, .8);
      shafts(g, cx, cy, .4 * a, { n: 22, dir: 0, spread: Math.PI * 2, len: 1700, seed: 18, t, col: 'rgba(255,214,120,A)', spin: .12, width: 1.3 });
      flare(g, cx, cy, a * .7, { size: .8 });
      burst(g, t - lg, { x: cx, y: cy, n: 200, seed: 38, speed: [400, 2600], life: [.7, 2.2], size: [3, 9], gy: 150, drag: 1.8, cols: [C.gold, '#fff6c8', C.pink, C.teal], shape: 'star' });
      ring(g, cx, cy, t - lg, { r0: 40, r1: 1000, life: .5, col: '#ffd68a', lw: 22 });
    }
    headline(g, { id: 'capsule', rect: [65, 1240, 1015, 1536], plate: true, plateStyle: PL_DARK, gap: .06, lines: [
      CL_('CAPSULE', b(38) + POP_IN, .72, FILL.white, '#4a2a7a'),
      CL_('FEVER', b(38) + POP_IN + .12, 1, FILL.gold, '#7a4a08', C.gold)] }, t);
    vignetteDark(g, .4, .35);
  },
  post(lt, P, t) {
    const lg = b(37.5);
    P.flash = [1, .97, .88, t >= lg ? (t < lg + 2 / 60 ? .9 : .6 * kick(t, lg + 2 / 60, .06)) : .25 * kick(t, b(37), .04)];
    P.rays = t >= lg ? .6 * (.4 + .6 * kick(t, lg, 1.0)) : 0; P.raysPos = [.5, .48]; P.raysDecay = .955;
    P.shocks = [{ x: .5, y: .48, r: E.outCubic(inv(lg, lg + .9, t)) * 1.5, w: .12, a: .7 * (1 - inv(lg, lg + .9, t)) }];
    P.ca = .0008 + .03 * kick(t, lg, .15);
    P.saturation = t < lg ? 1.0 - .25 * inv(b(35.5), b(37.4), t) : 1.2;
    P.bloom = t < lg ? .55 : .7; P.bloomThr = t < lg ? .74 : .72;
    P.vignette = t < lg ? .38 + .3 * inv(b(35.5), b(37.4), t) : .4;
    P.K = t > b(38.1) && t < b(39.6) ? 6 : 4;
  },
});

// ================================================================ bats wipe (b41.5 - b42.6), 6. CLAW-O-WEEN (b42 - b45.5)
vshot({ id: 'v-bats', t0: b(41.4), t1: b(42.7), cut: false,
  draw(g, lt, P, t) { batSwarm(g, t, inv(b(41.4), b(42.7), t), { n: 520, seed: 66, size: 1.7 }); },
});
vshot({ id: 'v-halloween', t0: b(42), t1: b(45.5),
  draw(g, lt, P, t) {
    g.save();
    shakeAt(g, t, [42], 18, .14);
    drift(g, lt, 1.0, W / 2, 1000);
    neonBg(g, t, { cam: [t * 90, 0], halloween: 1, speed: .9, rays: .6 });
    const mx = 850 - lt * 14, my = 640;
    moon(g, mx, my, 120);
    for (let i = 0; i < 6; i++) { const a = t * 1.4 + i * 1.05; bat(g, mx + Math.cos(a) * (190 + i * 14), my + Math.sin(a) * 70, 1.1 + (i % 3) * .3, t * 20 + i, '#120610'); }
    for (const [px, s] of [[.1, 1.3], [.9, 1.2]]) pumpkin(g, W * px, 1800, s, .7 + .3 * Math.sin(t * 9 + px * 20));
    const fly = E.outExpo(clamp(lt / .5));               // no overshoot: the phone never rises into the headline
    phone(g, { slot: 'vhw', id: 'halloween_title', ft: cue('halloween_title', 'sheen_start', 1) - .2 + lt, x: W / 2, y: lerp(H * 1.5, V_PH.y, fly), h: V_PH.h,
      ry: lerp(-1.0, -.1, fly) + .06 * Math.sin(lt * 1.5) * fly, rx: .04, rz: lerp(-.25, .02, fly), col: C.orange, glare: .3 + .2 * lt });
    motes(g, t, { n: 40, seed: 9, speed: [40, 120], size: [2, 4], cols: [C.orange, C.gold, C.purple], alpha: .8 });
    g.restore();
    headline(g, { id: 'halloween', rect: V_TOP, lines: [CL_('CLAW-O-WEEN', b(42.25) + POP_IN, 1, FILL.orange, '#5a1a00', C.orange, { outline: '#1a0608', extraBot: 92, ov: 1.06, draw(g, l, opts, lt) {
      layBegin('CLAW-O-WEEN');
      candyText(g, l.ln.txt, l.x, l.y, opts);
      const m = measure(l.ln.txt, l.font), r = rng(31);           // goo drips grow under the letters
      g.save(); g.fillStyle = '#ff7a12';
      for (let i = 0; i < 12; i++) {
        const dx = l.x - m.l + 20 + r() * (m.l + m.r - 40), len = lerp(20, 80, r()) * E.outCubic(clamp((lt - .1 - r() * .3) / .5)), w = lerp(8, 16, r());
        if (len <= 1) continue;
        g.beginPath(); g.moveTo(dx - w / 2, l.y - 4); g.lineTo(dx + w / 2, l.y - 4); g.lineTo(dx + w / 2, l.y + len); g.arc(dx, l.y + len, w / 2, 0, Math.PI); g.closePath(); g.fill();
        layText(g, 'drip', dx - w / 2, l.y - 4, dx + w / 2, l.y + len + w / 2);
      }
      g.restore();
      layEnd();
    } })] }, t);
  },
  post(lt, P, t) {
    P.tint = [1.0, .72, .5]; P.tintA = .22; P.lift = [.03, .0, .05];
    P.flash = [1, .7, .3, .35 * kick(t, b(42.25), .05)];
    P.ca = .0008 + .012 * kick(t, b(42.25), .1);
    P.bloom = .75;
  },
});

// ================================================================ NEON DEPTHS punch (b45.5 - b48.5)
vshot({ id: 'v-depths', t0: b(45.5), t1: b(48.5),
  draw(g, lt, P, t) {
    shakeAt(g, t, [45.5], 16, .12);
    { const o = vff(1 + lt * .05, { cy: .4 }); fullFrame(g, 'depths', cue('depths', 'tide_high', 4.93) - .4 + lt, o);
      kcFF(o, 'HUD', [0, 0, 1, .075]); kcFF(o, 'boss HP bar', [.2, .31, .8, .36]); kcFF(o, 'HIGH TIDE sign', [.3, .395, .7, .44]); }
    burst(g, lt, { x: W / 2, y: H + 40, n: 70, seed: 49, speed: [200, 700], angle: [-Math.PI * .7, -Math.PI * .3], life: [.6, 1.4], size: [6, 16], gy: -300, drag: 1, cols: ['#8bfff2', '#ffffff', '#2ee6d6'], shape: 'dot', alpha: .5 });
    headline(g, { id: 'depths', rect: [65, 1180, 1015, 1500], plate: true, plateStyle: { bg: 'rgba(4,22,30,.82)', border: 'rgba(46,230,214,.5)' }, lines: [
      CL_('NEON DEPTHS', b(45.5) + POP_IN, 1, FILL.teal, '#06504c', C.teal)] }, t);
  },
  post(lt, P) {
    P.tint = [.5, 1.0, 1.1]; P.tintA = .2;
    P.glitch = .8 * (1 - clamp(lt / .1)); P.rgb = .02 * (1 - clamp(lt / .12));
    P.heat = .6;
    P.zoomBlur = .3 * E.inCubic(inv(b(2.6), b(3), lt)); P.zbCenter = [.5, .5];
  },
});

// ================================================================ 7. PLAY TOGETHER (b48.5 - b53) hold
const VC_STOP0 = b(52.25), VC_STOP1 = b(52.9);
const vcT = t => t < VC_STOP0 ? t : VC_STOP0 + (VC_STOP1 - VC_STOP0) * (1 - Math.pow(1 - inv(VC_STOP0, VC_STOP1, t), 2)) / 2;
// host: the coin toss; guest: the lobby, then a jump cut (b49.5) to the guest's turn, the drop (b50.5), the host cheering (b51.5)
const vcoopFt = (t, host) => t < b(49.5)
  ? (host ? cue(CO, 'toss', 1.87) + (t - b(48.5)) * .7 : cue(CO, 'host_ready', 1.83) - .35 + (t - b(48.5)) * .35)
  : host ? pmap(t, [[49.5, cue(CO, 'turn_start_guest_active', 5.4) - .05], [50.5, cue(CO, 'claw_drop', 6.47)], [51.5, cue(CO, 'watcher_cheer', 7.67)]])
         : pmap(t, [[49.5, cue(CO, 'claw_drop', 6.47) - .25], [51.5, cue(CO, 'watcher_cheer', 7.67)]]);   // the guest is already grabbing
vshot({ id: 'v-coop', t0: b(48.5), t1: b(53),
  draw(g, lt, P, t0) {
    const t = vcT(t0), l = t - b(48.5);
    g.save();
    shakeAt(g, t, [48.5, 49.5], 12, .12);
    drift(g, l, .8, W / 2, 1000);
    neonBg(g, t, { cam: [t * 120, 0], speed: 1.4 });
    const fly = spring(l + .04, 9, 6.5);
    const ph_h = 745;
    const ph = phone(g, { slot: 'vhost', id: 'coop_online_host', ft: vcoopFt(t, true), flash: .5 * kick(t, b(49.5), .06),
      x: lerp(-300, 290, fly), y: 1000, h: ph_h, ry: .22, rx: .03, rz: -.02, col: C.pink, glare: .2 });
    const pg = phone(g, { slot: 'vguest', id: 'coop_online_guest', ft: vcoopFt(t, false), flash: .5 * kick(t, b(49.5), .06),
      x: lerp(W + 300, 790, fly), y: 1000, h: ph_h, ry: -.22, rx: .03, rz: .02, col: C.teal, glare: .8 });
    const [ax, ay] = ph.map(1.0, .55), [bx, by] = pg.map(0, .55);
    const bk = beatKick(t, 49, 52.25, .18, .5);
    if (l > b(.5)) {
      lightning(g, ax, ay, bx, by, 300 + Math.floor(t / (BEAT / 2)), { alpha: .35 + .65 * bk, lw: 4, glow: C.pink, col: '#ffe6f2', depth: 5, jit: 70 });
      glowEllipse(g, ax, ay, 70, 70, C.pink, .6 * (.5 + bk)); glowEllipse(g, bx, by, 70, 70, C.teal, .6 * (.5 + bk));
    }
    g.restore();
    headline(g, { id: 'together', rect: [65, 236, 1015, 560], lines: [CL_('PLAY TOGETHER', b(48.5) + POP_IN, 1, FILL.teal, '#06504c', C.teal)] }, t);
    const ps = popScale(t - b(49) - POP_IN);
    if (ps > 0) {
      g.save(); g.globalAlpha *= popAlpha(t - b(49) - POP_IN); g.translate(W / 2, 1468); g.scale(ps, ps);
      pill(g, 'ONLINE CO-OP', 0, 0, { font: pillFit('ONLINE CO-OP', F.cond, 104, 720, { tracking: 3 }), bg: 'rgba(11,6,24,.94)', border: C.pink, borderW: 6, fg: '#fff', padY: 18, tracking: 3, glow: C.pink });
      g.restore();
    }
    wash(g, '#000', t0 > b(52.9) ? 1 : 0);
  },
  post(lt, P, t) {
    const st = inv(VC_STOP0, VC_STOP1, t);
    P.flash = [1, 1, 1, .4 * kick(t, b(48.5), .05) + .25 * kick(t, b(49.5), .04)];
    P.saturation = 1.12 - .5 * st; P.barrel = .18 * st; P.ca = .0008 + .015 * st;
    P.zoomBlur = .1 * (1 - E.outCubic(inv(b(48.5), b(48.8), t))); P.zbCenter = [.5, .5];
  },
});

// ================================================================ the lockup (b53 - b60), dead still from 24.0 s
const V_LOGO_T = b(53), V_HOLD_T = 24.0;
vshot({ id: 'v-logo', t0: V_LOGO_T, t1: DUR,
  draw(g, lt, P, t) {
    const lf = Math.min(t, V_HOLD_T) - V_LOGO_T;
    g.save();
    shakeAt(g, Math.min(t, V_HOLD_T), [53], 28, .14);
    neonBg(g, V_LOGO_T + lf * .6, { cam: [lf * 60, 0], halloween: 1, speed: .5, rays: .8 });
    const MY = 640;
    moon(g, W / 2, MY, 230 + 10 * E.outCubic(clamp(lf / .6)), .85);
    for (let i = 0; i < 9; i++) { const a = (V_LOGO_T + lf) * .9 + i * .7; bat(g, W / 2 + Math.cos(a) * (300 + i * 18), MY + Math.sin(a * 1.3) * 150, 1.2 + (i % 3) * .4, (V_LOGO_T + lf) * 22 + i, '#100510'); }
    for (const [px, s] of [[.13, 1.4], [.36, .9], [.66, .95], [.88, 1.45]]) pumpkin(g, W * px, 1780, s * .85, .55);
    glowEllipse(g, W / 2, 900, 640, 260, C.pink, .35 + .4 * kick(lf, 0, .4));
    burst(g, lf, { x: W / 2, y: 900, n: 160, seed: 56, speed: [500, 2600], life: [.4, 1.2], size: [3, 9], gy: 600, drag: 2.4, cols: [C.gold, C.pink, C.teal, '#fff'], shape: 'star' });
    g.restore();
    // the lockup, stacked and measured: logo, the 2.0 badge, the call to action on one plate, the URL
    const tt = Math.min(t, V_HOLD_T);
    headline(g, { id: 'logo', rect: [65, 830, 1015, 1060], lines: [{ txt: 'CLAWSPIRE', at: V_LOGO_T + POP_IN, font: F.candy, fill: FILL.candy, depthK: .09, depthCol: '#6a0a3a', outline: '#2a0a22', outlineK: .1, glow: C.pink, tracking: 4 }] }, tt);
    headline(g, { id: 'badge', rect: [380, 1062, 700, 1192], plate: true, pad: 22, plateStyle: { bg: '#1a0a2a', border: C.gold, bw: 6, r: 30 },
      lines: [CL_('2.0', V_LOGO_T + POP_IN + .12, 1, FILL.gold, '#7a4a08', null, { depthK: .08 })] }, tt);
    headline(g, { id: 'cta', rect: [65, 1200, 1015, 1440], plate: true, pad: 34, gap: .16, plateStyle: { bg: '#c8126a', border: '#ffb3d6', bw: 6, r: 40 }, lines: [
      { txt: 'PLAY FREE IN', at: b(53.75) + POP_IN, fill: '#ffffff', depthK: 0, outline: '#7a0838', outlineK: .05 },
      { txt: 'YOUR BROWSER', at: b(53.75) + POP_IN, fill: '#ffffff', depthK: 0, outline: '#7a0838', outlineK: .05 }] }, tt);
    headline(g, { id: 'url', rect: [65, 1452, 1015, 1528], lines: [{ txt: 'games-71g.pages.dev/clawspire', at: b(54) + POP_IN, font: F.ui, fill: C.mint, depthK: 0, outline: '#0b0618', outlineK: .18 }] }, tt);
  },
  post(lt, P, t) {
    const lf = Math.min(t, V_HOLD_T) - V_LOGO_T;
    P.flash = [1, .95, .98, lf < 1 / 60 ? .95 : .7 * Math.exp(-lf / .05)];
    P.shocks = [{ x: .5, y: .5, r: E.outCubic(clamp(lf / .7)) * 1.3, w: .1, a: .6 * (1 - clamp(lf / .7)) }];
    P.ca = .0008 + .02 * kick(lf, 0, .1);
    P.rays = .45 * (.3 + .7 * kick(lf, 0, .6)); P.raysPos = [.5, .33];
    P.tint = [1.0, .8, .7]; P.tintA = .1;
    P.bloom = .5; P.bloomThr = .8;
    P.zoomBlur = .05 * kick(lf, 0, .06); P.zbCenter = [.5, .5];
    if (t >= V_HOLD_T) { P.K = 1; P.seedT = V_HOLD_T; }
  },
});
