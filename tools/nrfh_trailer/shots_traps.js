// Act III: the trap chain (5.625 - 8.4375). One corridor, one combo:
//   frost 5.625  the knight freezes mid-stride        FROZEN    x1
//   spike 6.5625 match cut: spikes through the ice    SHATTER   x2
//   flame 7.5    the rogue in the oil, pillars cascade IGNITE   x3
//   tesla 7.97   arcs chain the party in the dark     OVERLOAD  x4
'use strict';
const COMBO_T = [5.625, 6.5625, 7.5, 7.96875];

// a translucent ice block around a frozen hero (world units)
function iceBlock(g, x, footY, w, h, a, seed = 1) {
  if (a <= 0) return;
  const r = rng(seed);
  g.save();
  g.globalAlpha *= a;
  const pts = [];
  const n = 9;
  for (let i = 0; i < n; i++) {
    const ang = -Math.PI / 2 + i / n * Math.PI * 2;
    pts.push([x + Math.cos(ang) * w * (.5 + r() * .12), footY - h / 2 + Math.sin(ang) * h * (.5 + r() * .08)]);
  }
  pts.forEach(p => { if (p[1] > footY + 2) p[1] = footY + 2; });
  const gr = g.createLinearGradient(x - w / 2, footY - h, x + w / 2, footY);
  gr.addColorStop(0, 'rgba(220,245,255,.55)'); gr.addColorStop(.5, 'rgba(120,200,255,.32)'); gr.addColorStop(1, 'rgba(60,140,230,.45)');
  g.fillStyle = gr;
  g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); g.fill();
  g.globalCompositeOperation = 'lighter';
  g.strokeStyle = 'rgba(210,245,255,.9)'; g.lineWidth = 1.1; g.stroke();
  // facets
  g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = .7;
  for (let i = 0; i < 5; i++) { const p = pts[Math.floor(r() * n)], q = pts[Math.floor(r() * n)]; g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(lerp(p[0], q[0], .6), lerp(p[1], q[1], .6)); g.stroke(); }
  g.restore();
}

// frost creeping in from the frame corners (screen space)
function frostCorners(g, u) {
  if (u <= 0) return;
  const r = rng(404);
  g.save(); g.globalCompositeOperation = 'lighter';
  for (const [cx, cy, dx, dy] of [[0, 0, 1, 1], [W, 0, -1, 1], [0, H, 1, -1], [W, H, -1, -1]]) {
    for (let i = 0; i < 14; i++) {
      const ang = Math.atan2(dy, dx) + (r() - .5) * 1.5, len = (80 + r() * 260) * E.outCubic(u), wd = 6 + r() * 14;
      const gr = g.createLinearGradient(cx, cy, cx + Math.cos(ang) * len, cy + Math.sin(ang) * len);
      gr.addColorStop(0, 'rgba(200,240,255,.55)'); gr.addColorStop(1, 'rgba(120,200,255,0)');
      g.fillStyle = gr;
      g.beginPath(); g.moveTo(cx + Math.cos(ang + 1.57) * wd, cy + Math.sin(ang + 1.57) * wd);
      g.lineTo(cx + Math.cos(ang) * len, cy + Math.sin(ang) * len);
      g.lineTo(cx + Math.cos(ang - 1.57) * wd, cy + Math.sin(ang - 1.57) * wd); g.fill();
    }
  }
  g.restore();
}

// the persistent combo header + counter
function comboHeader(g, t) {
  if (t < 5.625 || t >= 8.4375) return;
  tierA(g, 'CHAIN TRAP COMBOS', 150, t - 5.625, { size: 70, x: -60 });
  let n = 0, since = 0;
  COMBO_T.forEach((c, i) => { if (t >= c) { n = i + 1; since = t - c; } });
  const pop = since < .08 ? lerp(2, 1, since / .08) : 1 + .12 * Math.exp(-since * 10) * Math.cos(since * 30);
  g.save();
  g.translate(W / 2 + 470, 150); g.scale(pop, pop); g.rotate(-.08);
  g.shadowColor = '#ffb030'; g.shadowBlur = 24;
  strokeText(g, 'x' + n, 0, 0, { font: F.pix(64), fill: FILL.gold, outline: '#1a0b06', outlineW: 18 });
  g.restore();
}

// ---- FROST ------------------------------------------------------------------
const FROST_X = 72;
shot({ id: 'frost', t0: 5.625, t1: 6.5625,
  draw(g, lt, P, t) {
    const T = FRAME_T - 5.625;
    // time slows as the ice closes: 1.0x -> 0.35x
    const slow = u => u < .15 ? u : .15 + (u - .15) * .35 + (u - .15) * .65 * Math.exp(-(u - .15) * 4) * 0;
    const ts = slow(lt), Ts = slow(T);
    const K = 5.7 * Math.pow(1.22, E.inOutCubic(clamp(lt / .9375)));
    const sk = shake(t, 10 * kick(lt, .02, .12), 30);
    camera(g, FROST_X + 8, FLOOR - 58, K, -.012 + lt * .01 + sk[2], sk[0], sk[1]);
    const now = 9000 + Ts * 1000;
    corridor(g, now, [{ types: ['frost'], e: Math.min(Ts * 1000 + 20, 199), glow: .38 }, { types: ['spike'], e: null }], { throne: false });
    const frozenAt = .1;
    const walkT = Math.min(T, frozenAt);
    const hx = FROST_X - 18 + walkT * 46;
    const fr = lt > frozenAt ? Math.exp(-(lt - frozenAt) / .08) : 0;
    drawHero(g, 'warrior', 'walk', 1.3 + walkT, hx, FOOT, { fx: { tint: '#9adfff', tintA: lt > frozenAt ? .55 : 0, flash: fr * .8 } });
    iceBlock(g, hx - 2, FOOT + 1, 44, 60 * clamp((lt - frozenAt) / .12), .62 * clamp((lt - frozenAt) / .06), 7);
    burst(g, lt - frozenAt, { x: hx, y: FOOT - 30, n: 40, seed: 12, speed: [40, 180], life: [.4, .9], size: [.8, 2], gy: 60, drag: 2, cols: ['#e8fbff', '#9adfff', '#5ec8ff'], shape: 'spark', streak: .03 });
    embers(g, t, { box: [hx - 90, FOOT - 120, 180, 120], n: 30, seed: 3, speed: [8, 30], size: [.8, 1.6], cols: ['#cff4ff', '#9adfff'] });
    floater(g, '-24', hx + 4, FOOT - 64, lt - .16, '#9adfff', 11, 18);
    g.setTransform(1, 0, 0, 1, 0, 0);
    frostCorners(g, clamp((lt - .1) / .7));
    comboHeader(g, t);
    tierB(g, 'FROZEN', 1330, 520, lt - .1, '#9adfff', { size: 76, dur: .8, fill: FILL.ice, glow: '#4db8ff' });
  },
  post(lt, P) {
    P.K = lt < 3 / 60 ? 6 : 4; P.shutter = lt < 3 / 60 ? 1 : .5;
    if (lt < 4 / 60) { P.zoomBlur = .1 * (1 - lt / (4 / 60)); }
    P.saturation = lerp(1.1, .55, clamp((lt - .08) / .3));
    P.gain = [.92, 1.0, 1.16]; P.lift = [0, .01, .04];
    P.bloom = .5; P.bloomThr = .8;
    P.ca = .0006 + .006 * kick(lt, .1, .08) * (lt > .1);
  },
});

// ---- SPIKE: match cut on the same encased knight ------------------------------
const HIT = 6.5625 + 1 / 60;
shot({ id: 'spike', t0: 6.5625, t1: 7.5,
  draw(g, lt, P, t) {
    const tt = hitstop(t, HIT, 6 / 60);                 // the world stops for 6 frames on the impact
    const Tt = hitstop(FRAME_T, HIT, 6 / 60);
    const since = tt - HIT;
    const out = since > 0 ? E.outCubic(clamp(since / .25)) : 0;
    const K = lerp(8.4, 6.4, out) * (1 + lt * .04);
    const sk = shake(t, (since >= 0 ? 16 : 0) * Math.exp(-Math.max(0, since) / .15), 34);
    camera(g, FROST_X + 14 - lt * 6, FLOOR - 40, K, .07 - out * .04, sk[0] * .3, -Math.abs(sk[1]));
    const now = 12000 + Tt * 1000;
    // the spike pit fires so its peak lands on the beat (rise 70 ms)
    const eSpike = (tt - (HIT - .07)) * 1000;
    corridor(g, now, [{ types: ['frost', 'spike'], e: Math.min(eSpike, 69), glow: .38 }, { types: [] }], { throne: false });
    const hx = FROST_X - 18 + .1 * 46;
    if (since < 0) {
      drawHero(g, 'warrior', 'walk', 1.4, hx, FOOT, { fx: { tint: '#9adfff', tintA: .55 } });
      iceBlock(g, hx - 2, FOOT + 1, 44, 60, .62, 7);
    } else {
      // shattered: the hero and his ice fly apart as pixels
      burst(g, since, { x: hx, y: FOOT - 28, n: 90, seed: 66, speed: [60, 340], angle: [-Math.PI * .95, -Math.PI * .05], life: [.5, 1.2], size: [1.4, 3.2], gy: 520, drag: 1.2, cols: ['#e8fbff', '#9adfff', '#5ec8ff', '#c9ced8', '#e8c07a'], add: false, shape: 'sq' });
      burst(g, since, { x: hx, y: FOOT - 28, n: 50, seed: 67, speed: [150, 520], life: [.2, .6], size: [.8, 1.6], gy: 200, drag: 2, cols: ['#ffffff', '#bff0ff'], shape: 'spark', streak: .025 });
      if (since < 2 / 60) { drawHero(g, 'warrior', 'walk', 1.4, hx, FOOT, { fx: { tint: '#ffffff', tintA: 1 } }); }
      floater(g, '-88', hx + 6, FOOT - 66, since - .02, '#ffffff', 14, 16);
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    frostCorners(g, 1 - clamp(since / .4));
    comboHeader(g, t);
    // SHATTER: sliced along a horizontal cut, the halves snap back together
    if (since >= 0) {
      const off = 18 * Math.exp(-since / .07);
      for (const [y0, y1, dx] of [[-200, -28, -off], [-28, 200, off]]) {
        g.save(); g.beginPath(); g.rect(0, 440 + y0, W, y1 - y0); g.clip();
        tierB(g, 'SHATTER', 1340 + dx, 440, since, '#e8f4ff', { size: 80, dur: .75, fill: FILL.ice, glow: '#9adfff', rot: -.07 });
        g.restore();
      }
    }
    // ice shards across the lens: the wipe into the flame shot
    const wipe = clamp((lt - .8) / .1375);
    if (wipe > 0) {
      const r = rng(88);
      g.save(); g.globalAlpha = .85;
      for (let i = 0; i < 26; i++) {
        const y = r() * H, sz = 140 + r() * 320, x = lerp(-500 - r() * 500, W + 600, E.inCubic(wipe) + r() * .25);
        g.fillStyle = `rgba(${180 + r() * 60 | 0},${230 + r() * 25 | 0},255,.8)`;
        g.beginPath(); g.moveTo(x, y - sz * .3); g.lineTo(x + sz, y); g.lineTo(x - sz * .2, y + sz * .4); g.fill();
      }
      g.restore();
    }
  },
  post(lt, P, t) {
    const since = t - HIT;
    P.K = since >= 0 && since < 6 / 60 ? 1 : (lt > .8 ? 8 : 4);
    P.shutter = lt > .8 ? 1 : .5;
    P.saturation = lerp(.6, 1.1, clamp(since / .3));
    P.gain = [.94, 1, 1.1];
    P.ca = .0006 + (since >= 0 ? .012 * Math.exp(-since / .09) : 0);
    P.flash = [.85, .95, 1, since >= 0 ? .28 * Math.exp(-since / .05) : 0];
    if (since >= 0 && since < .5) P.shocks = [{ x: .5, y: .66, r: .02 + since * 1.1, w: .03, a: .7 * (1 - since / .5) }];
    P.bloom = .75;
  },
});

// ---- FLAME: the rogue walks into the oil, the pillars cascade ----------------
shot({ id: 'flame', t0: 7.5, t1: 7.96875,
  draw(g, lt, P, t) {
    const T = FRAME_T - 7.5;
    // the camera tracks at the cascade's speed (a pillar every 70 ms, 42 px apart)
    const pan = clamp((lt - .04) / .3);
    const K = 5.2;
    camera(g, 2 * ROOM_W + lerp(40, 150, E.inOutCubic(pan)), FLOOR - 62, K, .015, ...shake(t, 9 * kick(lt, .05, .2), 28).slice(0, 2));
    const now = 15000 + T * 1000;
    const eF = (lt - .03) * 1000;
    corridor(g, now, [{ types: [] }, { types: [] }, { types: ['oil', 'flame'], e: eF < 0 ? null : Math.min(eF, 150 + lt * 80) }, { types: [] }], { throne: false });
    const hx = 2 * ROOM_W + 88 + T * 40;
    const burn = clamp((lt - .1) / .08);
    drawHero(g, 'rogue', 'walk', 2 + T, hx, FOOT, { fx: { tint: '#ff7a2e', tintA: .4 * burn, flash: .7 * Math.exp(-Math.max(0, lt - .1) / .05) * (lt > .1) } });
    // the oil ignites under him
    burst(g, lt - .1, { x: 2 * ROOM_W + 127, y: FOOT - 4, n: 70, seed: 21, speed: [80, 420], angle: [-Math.PI * .92, -Math.PI * .08], life: [.3, .8], size: [1.5, 4], gy: -60, drag: 2.5, cols: ['#fff3b0', '#ffb03a', '#ff5a1a', '#ff3b2f'], shape: 'spark', streak: .04 });
    drawGlowW(g, 2 * ROOM_W + 127, FOOT - 10, 90, 'rgba(255,140,40,1)', 1.2 * kick(lt, .1, .15) * (lt > .1));
    embers(g, t, { box: [2 * ROOM_W, FLOOR - 170, 200, 170], n: 50, seed: 8, speed: [40, 140], size: [.8, 2], cols: ['#ffd34d', '#ff7a2e'] });
    floater(g, '-56', hx + 4, FOOT - 62, lt - .13, '#ff7a2e', 11, 14);
    g.setTransform(1, 0, 0, 1, 0, 0);
    comboHeader(g, t);
    // IGNITE: the letters light one after another, in step with the pillars
    g.save(); g.translate(1330, 470); g.rotate(-.08);
    const pk = lt - .06, sc = pk < .07 ? lerp(2.2, 1, E.outCubic(clamp(pk / .07))) : 1 + .1 * Math.exp(-(pk - .07) * 9) * Math.cos((pk - .07) * 30);
    if (pk >= 0) { g.scale(sc, sc); stagger(g, 'IGNITE', 0, 0, pk, { font: F.pix(78), fill: FILL.fire, outline: '#1a0804', outlineW: 26, per: .035, in: .06, dy: 0, from: 1.6 }); }
    g.restore();
    // flames sucked out into black: the cut to the tesla room
    const suck = clamp((lt - .41) / .06);
    if (suck > 0) wash(g, '#000', suck);
  },
  post(lt, P) {
    P.heat = 1; P.bloom = .85; P.bloomThr = .68;
    P.gain = [1.08, .98, .9];
    P.ca = .0006 + .006 * kick(lt, .1, .08) * (lt > .1);
    if (lt > .4) { P.zoomBlur = .08 * clamp((lt - .4) / .07); P.zbCenter = [.5, .55]; P.K = 6; P.shutter = 1; }
  },
});

// ---- TESLA: darkness, then the arcs light the party --------------------------
const ZAPS = [.05, .15, .25];
shot({ id: 'tesla', t0: 7.96875, t1: 8.4375,
  draw(g, lt, P, t) {
    const T = FRAME_T - 7.96875;
    if (lt < 2 / 60) return;                              // two frames of black
    const hop = ZAPS.reduce((a, z, i) => lt >= z ? i : a, 0);
    const heroesX = [3 * ROOM_W + 40, 3 * ROOM_W + 88, 3 * ROOM_W + 140];
    // snap-zoom along the chain
    const K = 4.6 + .5 * kick(lt, ZAPS[hop], .08);
    camera(g, lerp(3 * ROOM_W + 70, heroesX[hop], .35), FLOOR - 60, K, -.02, ...shake(t, 7, 40).slice(0, 2));
    const now = 17000 + T * 1000;
    corridor(g, now, [{}, {}, {}, { types: ['tesla'], e: ((lt - .03) % .24) * 1000 }], { throne: false });
    g.save(); g.fillStyle = 'rgba(4,2,10,.6)'; g.fillRect(-2000, -1000, 6000, 3000); g.restore();
    drawTrapPart(g, now, 3 * ROOM_W, 'tesla', LAYOUT.traps.tesla[0], 0, 3, ((lt - .03) % .24) * 1000, {});
    const cls = ['mage', 'cleric', 'warrior'];
    heroesX.forEach((x, i) => {
      const zapped = lt >= ZAPS[i];
      const xr = zapped && (lt - ZAPS[i]) < 2 / 60;          // 2-frame X-ray silhouette
      drawHero(g, cls[i], zapped ? 'walk' : 'walk', zapped ? 1.1 + i * .2 : 1 + T + i * .2, x, FOOT,
        { fx: { tint: xr ? '#ffffff' : '#fff34d', tintA: xr ? 1 : zapped ? .22 : 0, flash: 0, rim: { col: '#9adfff', dx: -1.2, dy: -.4, a: .8 } } });
      if (zapped) floater(g, '-31', x + 3, FOOT - 60, lt - ZAPS[i] - .02, '#fff34d', 10, 12);
    });
    // the arcs: coil -> hero 1 -> hero 2 -> hero 3, flickering every 2 frames
    const cx = 3 * ROOM_W + 100, cy = FLOOR - 50;
    const fl = Math.floor(t * 30);
    ZAPS.forEach((z, i) => {
      if (lt < z) return;
      const from = i === 0 ? [cx, cy] : [heroesX[i - 1], FOOT - 30];
      bolt(g, from[0], from[1], heroesX[i], FOOT - 30, 31 + i * 7 + fl, i === 0 ? '#fff34d' : '#9adfff', 2.4, 7, 16);
      drawGlowW(g, heroesX[i], FOOT - 26, 40, 'rgba(255,240,120,1)', .32 * (.6 + .4 * Math.sin(t * 90 + i)));
    });
    drawGlowW(g, cx, cy, 60, 'rgba(255,225,77,1)', .7);
    g.setTransform(1, 0, 0, 1, 0, 0);
    comboHeader(g, t);
    const j = [(hash(fl) - .5) * 5, (hash(fl + 9) - .5) * 5];
    tierB(g, 'OVERLOAD', 1330 + j[0], 480 + j[1], lt - .06, '#fff7b0', { size: 70, dur: .45, fill: FILL.volt, glow: '#4dc3ff', rot: -.06 });
  },
  post(lt, P) {
    P.bloom = .8; P.bloomThr = .72;
    P.gain = [1, 1, 1.08];
    P.ca = .0006 + .005 * ZAPS.reduce((a, z) => a + (lt >= z ? kick(lt, z, .06) : 0), 0);
  },
});
