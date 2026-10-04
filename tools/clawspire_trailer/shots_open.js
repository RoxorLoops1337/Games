// Act I: the cold open (b0-b4) and the new title (b4-b12).
'use strict';

// ---------------------------------------------------------------- shared shot helpers
function shakeAt(g, t, hitsB, amp, tau = .14, f = 16, seed = 0) {
  let a = 0;
  for (const hb of hitsB) a += amp * .6 * kick(t, b(hb), tau);
  if (a < .3) return;
  const s = shake(t, a, f, seed);
  g.translate(W / 2, H / 2); g.rotate(s[2] * 3); g.translate(-W / 2 + s[0], -H / 2 + s[1]);
}
// a camera move around a screen point: zoom z about (px, py), then offset
function camZoom(g, z, px = W / 2, py = H / 2, ox = 0, oy = 0) {
  g.translate(W / 2 + ox, H / 2 + oy); g.scale(z, z); g.translate(-px, -py);
}
// a slow living camera for held shots: push in + a little roll (lt in seconds)
function drift(g, lt, k = 1, px = W / 2, py = H / 2) {
  camZoom(g, 1 + .035 * k * lt, px, py);
  g.translate(px, py); g.rotate(.012 * k * Math.sin(lt * 1.4)); g.translate(-px, -py);
}
// beat-locked pulse in [0,1] (1 on the beat, decays) for the beats in [b0, b1)
function beatKick(t, b0, b1, tau = .12, every = 1) {
  const bt = t / BEAT;
  if (bt < b0 || bt >= b1) return 0;
  const n = Math.floor((bt - b0) / every) * every + b0;
  return kick(t, b(n), tau);
}

// ---------------------------------------------------------------- the coin slot
function coinSlot(g, x, y, lit) {
  g.save(); g.translate(x, y);
  glowEllipse(g, 0, 0, 340, 340, C.pink, .25 + .5 * lit);
  // chrome plate
  const pg = g.createLinearGradient(-140, -190, 140, 190);
  pg.addColorStop(0, '#5a4a7a'); pg.addColorStop(.5, '#21183a'); pg.addColorStop(1, '#3d2f5c');
  g.fillStyle = pg; g.beginPath(); g.roundRect(-140, -190, 280, 380, 40); g.fill();
  g.lineWidth = 8; g.strokeStyle = lit > .05 ? C.pink : '#6b4d8a'; g.stroke();
  // the slot itself
  g.fillStyle = '#05020a'; g.beginPath(); g.roundRect(-14, -110, 28, 220, 14); g.fill();
  if (lit > 0) { glowEllipse(g, 0, 0, 60, 160, C.gold, lit); }
  g.fillStyle = `rgba(255,201,77,${.25 + .75 * lit})`; g.beginPath(); g.roundRect(-5, -100, 10, 200, 5); g.fill();
  g.restore();
}

// ================================================================ OPEN (b0 - b4)
// title_neon: the claw dives for the star on top of the cabinet tower; the grab lands on b3
const OPEN_CROP = t => ({ cx: .5, cy: keys([[b(1), .27], [b(3), .28], [b(4), .2, E.inCubic]], t), zoom: L(1, 1.4) * keys([[b(1), 1.9], [b(3), 2.4, E.outCubic], [b(4), 3.0, E.inCubic]], t) });
const TN_GRAB = ['claw_closed', 'grab'];
shot({ id: 'open', t0: 0, t1: b(4),
  draw(g, lt, P, t) {
    if (t < b(1)) {
      // black, the slot, a coin falls in
      const u = clamp(t / b(1));
      coinSlot(g, W / 2, H * .55, 0);
      const cy = lerp(-140, H * .55 - 40, E.inQuad(u));
      g.save(); g.globalAlpha = clamp(t / .12);
      coin(g, W / 2, cy, 74, t * 14);
      g.restore();
      const blink = (Math.floor(t * 6) % 2) ? 1 : .35;
      g.save(); g.globalAlpha = blink;
      headline(g, { id: 'insert', rect: [96, 830, 1824, 960], lines: [CL_('INSERT COIN', 0, 1, FILL.candy, '#8a0f50', null, { ov: 1, tracking: 4 })] }, 1);
      g.restore();
      return;
    }
    // the claw macro
    const tg = b(3);
    const ft = rampTo(t, tg + .05, cue('title_neon', TN_GRAB, 1.2), [[b(1), 2.2], [b(2.4), 2.2], [b(2.9), .4], [tg, .0], [tg + .05, .0], [tg + .06, 2.6]]);
    const o = OPEN_CROP(t);
    shakeAt(g, t, [3], 26, .12);
    fullFrame(g, 'title_neon', ft, o);
    // the slot flash bleeding into the first footage frames
    wash(g, '#ffd27a', .9 * kick(t, b(1), .07), 'lighter');
    // grab: sparks + a ring around the star
    const [sx, sy] = ffPoint(o, .5, .29);
    burst(g, t - tg, { x: sx, y: sy, n: 60, seed: 3, speed: [500, 1700], life: [.25, .7], size: [3, 7], gy: 600, drag: 3, cols: [C.gold, '#fff3c0', C.pink], shape: 'spark', streak: .03 });
    ring(g, sx, sy, t - tg, { r0: 40, r1: 520, life: .4, col: C.gold, lw: 20 });
    vignetteDark(g, .7, .25);
  },
  post(lt, P, t) {
    P.letterbox = t < b(1) ? .0 : .1 * (1 - E.inExpo(inv(b(3.6), b(4), t)));
    P.flash = [1, .92, .75, t >= b(1) ? .9 * kick(t, b(1), .05) : 0];
    P.ca = .0008 + .02 * kick(t, b(3), .1);
    P.zoomBlur = .06 * kick(t, b(3), .08) + .22 * E.inQuad(inv(b(3.3), b(4), t)); P.zbCenter = [.5, .45];
    P.shocks = [{ x: .5, y: .45, r: E.outCubic(inv(b(3), b(3) + .5, t)) * .9, w: .08, a: .5 * (1 - inv(b(3), b(3) + .5, t)) }];
    if (t < b(1)) { P.bloom = .8; P.vignette = .6; }
  },
});

// ================================================================ TITLE (b4 - b12)
const T0 = b(4);
const titleFt = t => cue('title_neon', 'sheen_start', .2) - .1 + (t - T0);   // the logo sheen sweeps as the phone lands
const HERO = t => {                                         // the title phone: flies in, orbits
  const u = t - T0;
  const fly = spring(u + .05, 8.5, 5.5);
  return { x: W / 2 + lerp(0, L(-40, 0), inv(b(5), b(7.5), t)), y: lerp(H + 560, H * .5 + 6, fly), h: L(880, 1300),
    rx: lerp(.9, .1, fly) + .03 * Math.sin(u * 1.3), ry: lerp(-.8, .2, fly) - .3 * E.inOutCubic(inv(b(5), b(7.5), t)), rz: lerp(-.25, .02, fly),
    glare: lerp(.1, .8, inv(T0, b(7.5), t)) };
};
// the zoom-through: camera scale about the logo's on-screen point, from 1 at b6.5 to Z_IN at b7.5
const Z_IN = L(4.05, 1920 / 1300 * 1.0);                    // the screen fills the frame at the cut
const zoomThrough = t => t < b(6.5) ? 1 + .1 * E.outCubic(inv(b(6), b(6.4), t)) : 1.1 * Math.pow(Z_IN / 1.1, E.inCubic(inv(b(6.5), b(7.5), t)));
shot({ id: 'title-phone', t0: T0, t1: b(7.5),
  draw(g, lt, P, t) {
    const z = zoomThrough(t);
    const ph = Object.assign({ slot: 'hero', id: 'title_neon', ft: titleFt(t), col: C.pink }, HERO(t));
    const [lx, ly] = phoneGeom(ph).map(.5, L(.15, .5));
    g.save();
    shakeAt(g, t, [4, 6], 22, .14);
    camZoom(g, z, lerp(W / 2, lx, inv(b(6), b(7.2), t)), lerp(H / 2, ly, inv(b(6), b(7.2), t)));
    neonBg(g, t, { cam: [(t - T0) * 120, 0], speed: 1.2 });
    // the tower of screens: two phones behind, from the sides on b5
    const side = spring(t - b(5), 7, 6);
    if (t > b(5)) {
      phone(g, { slot: 'sideL', id: 'halloween_title', ft: t - b(5), x: lerp(-400, W * L(.2, .1), side), y: H * L(.54, .4), h: L(640, 900), ry: .55, rz: -.05, col: C.orange, dim: .45, glow: .5 });
      phone(g, { slot: 'sideR', id: 'lamp_fever', ft: 2 + t - b(5), x: lerp(W + 400, W * L(.8, .9), side), y: H * L(.54, .4), h: L(640, 900), ry: -.55, rz: .05, col: C.teal, dim: .45, glow: .5 });
    }
    // sparkles orbiting the hero
    motes(g, t, { n: 50, seed: 12, box: [W * .2, 0, W * .6, H], speed: [60, 200], size: [2, 5], cols: [C.gold, C.pink, C.teal, '#fff'], alpha: .9 });
    phone(g, ph);
    burst(g, t - T0, { x: W / 2, y: H * .5, n: 90, seed: 41, speed: [600, 2200], life: [.4, 1.1], size: [3, 8], gy: 500, drag: 2.4, cols: [C.pink, C.teal, C.gold, '#fff'], shape: 'confetti', spin: 20 });
    g.restore();
  },
  post(lt, P, t) {
    P.flash = [1, .8, .95, .85 * kick(t, T0, .06)];
    P.shocks = [{ x: .5, y: .5, r: E.outCubic(inv(T0, T0 + .6, t)) * 1.2, w: .1, a: .6 * (1 - inv(T0, T0 + .6, t)) }];
    P.ca = .0008 + .015 * kick(t, T0, .12) + .01 * kick(t, b(6), .1);
    P.zoomBlur = .05 * kick(t, T0, .1) + .35 * E.inCubic(inv(b(6.5), b(7.5), t)); P.zbCenter = [.5, .45];
    P.bloom = .75;
  },
});
// full frame on the title, the 2.0 reveal
const TITLE_FF = t => ({ cx: .5, cy: .21, zoom: 1 + .03 * E.outCubic(inv(b(7.5), b(12), t)) });
shot({ id: 'title-ff', t0: b(7.5), t1: b(12),
  draw(g, lt, P, t) {
    shakeAt(g, t, [8], 34, .16); shakeAt(g, t, [10], 12, .1, 24, 5);
    const tfo = TITLE_FF(t);
    fullFrame(g, 'title_neon', titleFt(t), tfo);
    if (!VERT) { const [a, c] = ffPoint(tfo, .06, .1), [d, e] = ffPoint(tfo, .94, .207); keepClear('game logo', [a, c, d, e]); }
    // pull the bottom down so the numeral reads
    const gr = g.createLinearGradient(0, H * L(.3, .5), 0, H);
    gr.addColorStop(0, 'rgba(10,5,22,0)'); gr.addColorStop(.45, 'rgba(10,5,22,.72)'); gr.addColorStop(1, 'rgba(10,5,22,.9)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    const tb = b(8);
    // the numeral: light behind it, then the slam
    glowEllipse(g, W / 2, H * .64, 700 * (1 + .3 * kick(t, tb, .3)), 300, C.pink, t > tb ? .55 : 0);
    shafts(g, W / 2, H * .62, t > tb ? .5 * (.4 + .6 * kick(t, tb, .6)) : 0, { n: 16, dir: -Math.PI / 2, spread: Math.PI * 2, len: 1300, seed: 8, t, col: 'rgba(255,120,190,A)', spin: .05 });
    burst(g, t - tb, { x: W / 2, y: H * .62, n: 140, seed: 21, speed: [500, 2400], life: [.4, 1.3], size: [3, 9], gy: 700, drag: 2.2, cols: [C.gold, C.pink, '#fff', C.teal], shape: 'star' });
    motes(g, t, { n: 70, seed: 81, speed: [80, 260], size: [2, 5], cols: [C.gold, C.pink, '#fff', C.teal], alpha: .9 });
    // 2.0 under the game's own logo; THE BIG UPDATE on a plate sized from its text
    headline(g, { id: '2.0', rect: [96, 580, 1824, 878], lines: [CL_('2.0', tb, 1, FILL.candy, '#8a0f50', C.pink, { depthK: .085 })] }, t);
    flare(g, W / 2 - 6, 790, 1.1 * kick(t, tb + .05, .35) + .5 * kick(t, b(10), .3));
    headline(g, { id: 'big update', rect: [96, 905, 1824, 1026], plate: true, pad: 24, plateStyle: { bg: 'rgba(6,30,34,.85)', border: 'rgba(46,230,214,.6)' },
      lines: [CL_('THE BIG UPDATE', b(10) + POP_IN, 1, FILL.teal, '#06504c', null, { depthK: .07, tracking: 4 })] }, t);
  },
  post(lt, P, t) {
    const tb = b(8);
    P.flash = [1, .95, 1, t < b(7.5) + 1 / 60 ? .9 : .8 * kick(t, tb, .05)];
    P.zoomBlur = .3 * (1 - E.outCubic(inv(b(7.5), b(7.9), t))) + .08 * kick(t, tb, .08); P.zbCenter = [.5, .3];
    P.shocks = [{ x: .5, y: .66, r: E.outCubic(inv(tb, tb + .7, t)) * 1.1, w: .1, a: .7 * (1 - inv(tb, tb + .7, t)) }];
    P.ca = .0008 + .025 * kick(t, tb, .1);
    P.rays = .9 * kick(t, tb, .8); P.raysPos = [.5, .66];
    P.bloom = .8;
    // glitch out
    const gl = inv(b(11.4), b(12), t);
    P.glitch = gl > 0 ? .3 + .7 * gl : 0; P.rgb = .02 * gl * (Math.floor(t * 30) % 2 ? 1 : -1);
  },
});
