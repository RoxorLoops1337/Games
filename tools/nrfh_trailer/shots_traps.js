// Act III: the trap chain (5.625 - 8.4375). One corridor, one combo:
//   frost 5.625  the knight freezes mid-stride        FROZEN    x1
//   spike 6.5625 match cut: spikes through the ice    SHATTER   x2
//   flame 7.5    the rogue in the oil, pillars cascade IGNITE   x3
//   tesla 7.97   arcs chain the party in the dark     OVERLOAD  x4
'use strict';
const COMBO_T = [5.625, 6.5625, 7.5, 7.96875];

// a translucent ice block around a frozen hero, rasterised at 1 world px per pixel and
// blown up nearest-neighbour, so it has the same chunky pixels as the sprites
const _iceCv = document.createElement('canvas'); _iceCv.width = 96; _iceCv.height = 96;
function iceBlock(g, x, footY, w, h, a, seed = 1) {
  if (a <= 0 || h < 1) return;
  const x2 = _iceCv.getContext('2d');
  x2.setTransform(1, 0, 0, 1, 0, 0); x2.clearRect(0, 0, 96, 96);
  x2.imageSmoothingEnabled = false;
  x2.translate(48 - Math.round(x), 90 - Math.round(footY));
  iceShape(x2, Math.round(x), Math.round(footY), w, h, seed);
  g.save(); g.globalAlpha *= a; g.imageSmoothingEnabled = false;
  g.drawImage(_iceCv, Math.round(x) - 48, Math.round(footY) - 90, 96, 96);
  g.restore();
}
function iceShape(g, x, footY, w, h, seed) {
  const r = rng(seed);
  g.save();
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

// the cold creeping in: a cyan frost glow closing from the frame edges (screen space)
function frostCorners(g, u) {
  if (u <= 0) return;
  g.save(); g.globalCompositeOperation = 'lighter';
  const gr = g.createRadialGradient(W / 2, H / 2, H * lerp(.95, .55, E.outCubic(u)), W / 2, H / 2, H * 1.15);
  gr.addColorStop(0, 'rgba(90,180,255,0)'); gr.addColorStop(1, `rgba(150,215,255,${(.42 * u).toFixed(3)})`);
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  g.restore();
}

// the persistent combo header + counter
function comboHeader(g, t) {
  if (t < 5.625 || t >= 8.4375) return;
  tierA(g, 'CHAIN TRAP COMBOS', 150, t - 5.625, { size: 70, x: -90 });
  let n = 0, since = 0;
  COMBO_T.forEach((c, i) => { if (t >= c) { n = i + 1; since = t - c; } });
  const pop = since < .08 ? lerp(2, 1, since / .08) : 1 + .12 * Math.exp(-since * 10) * Math.cos(since * 30);
  g.save();
  g.translate(W / 2 + 470, 150); g.scale(Math.min(pop, 1.5), Math.min(pop, 1.5)); g.rotate(-.08);
  g.shadowColor = '#ffb030'; g.shadowBlur = 24;
  strokeText(g, 'x' + n, 0, 0, { font: F.pix(56), fill: FILL.gold, outline: '#1a0b06', outlineW: 16, align: 'left' });
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
    // slow push, accelerating into the match cut (the spike shot opens at the same zoom)
    const K = lt < .7 ? 5.7 * Math.pow(1.08, lt / .7) : lerp(5.7 * 1.08, 6.6, E.inQuad((lt - .7) / .2375));
    const sk = shake(t, 10 * kick(lt, .02, .12) * (lt >= .02), 30);
    camera(g, FROST_X + 8, FLOOR - 58, K, -.012 + lt * .01 + sk[2], sk[0], sk[1]);
    const now = 9000 + Ts * 1000;
    corridor(g, now, [{ types: ['frost'], e: Math.min(Ts * 1000 + 100, 199), glow: .38 }, { types: ['oil', 'flame'], e: null }], { throne: false });
    const frozenAt = .02;
    const walkT = Math.min(T, frozenAt);
    const hx = FROST_X - 18 + walkT * 46;
    const fr = lt > frozenAt ? Math.exp(-(lt - frozenAt) / .08) : 0;
    drawHero(g, 'warrior', 'walk', 1.3 + walkT, hx, FOOT, { fx: { tint: '#9adfff', tintA: lt > frozenAt ? .55 : 0, flash: fr * .8 } });
    iceBlock(g, hx - 2, FOOT + 1, 44, 60 * clamp((lt - frozenAt) / .12), .62 * clamp((lt - frozenAt) / .06), 7);
    // the ice starts to crack before the spikes come
    const cr = clamp((lt - .5) / .4);
    if (cr > 0) {
      const r = rng(77);
      g.save(); g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = .6; g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 6; i++) {
        let x = hx - 2 + (r() - .5) * 20, y = FOOT - 30 + (r() - .5) * 30; g.beginPath(); g.moveTo(x, y);
        const n = Math.ceil(5 * cr);
        for (let k = 0; k < n; k++) { x += (r() - .5) * 12; y += (r() - .5) * 12; g.lineTo(x, y); }
        g.stroke();
      }
      g.restore();
    }
    burst(g, lt - frozenAt, { x: hx, y: FOOT - 30, n: 40, seed: 12, speed: [40, 180], life: [.4, .9], size: [.8, 2], gy: 60, drag: 2, cols: ['#e8fbff', '#9adfff', '#5ec8ff'], shape: 'spark', streak: .03 });
    embers(g, t, { box: [hx - 90, FOOT - 120, 180, 120], n: 30, seed: 3, speed: [8, 30], size: [.8, 1.6], cols: ['#cff4ff', '#9adfff'] });
    floater(g, '-24', hx + 22, FOOT - 50, lt - .08, '#9adfff', 11, 8);
    g.setTransform(1, 0, 0, 1, 0, 0);
    frostCorners(g, clamp((lt - .1) / .7));
    comboHeader(g, t);
    tierB(g, 'FROZEN', 1330, 520, lt - .02, '#9adfff', { size: 76, dur: .85, fill: FILL.ice, glow: '#4db8ff' });
  },
  post(lt, P) {
    P.K = lt < 3 / 60 ? 6 : 4; P.shutter = lt < 3 / 60 ? 1 : .5;
    if (lt < 4 / 60) { P.zoomBlur = .1 * (1 - lt / (4 / 60)); }
    P.saturation = lerp(1.1, .55, clamp((lt - .08) / .3));
    P.gain = [.92, 1.0, 1.16]; P.lift = [0, .01, .04];
    P.bloom = .5; P.bloomThr = .8;
    P.ca = .0006 + .006 * kick(lt, .02, .08) * (lt > .02);
    if (lt > .8) { P.K = 6; P.shutter = 1; }
  },
});

// ---- SPIKE: match cut on the same encased knight ------------------------------
const HIT = 6.5625 + 1 / 60;
// the frozen hero breaks into sprite chunks that tumble away (each chunk is the sprite clipped to a wedge)
function shatterHero(g, cls, x, footY, age, seed) {
  const r = rng(seed), n = 9;
  for (let i = 0; i < n; i++) {
    const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2;
    const ang = (a0 + a1) / 2 + (r() - .5) * .4, sp = 60 + r() * 150;
    const [dx, dy] = ballistic(0, 0, Math.cos(ang) * sp, Math.sin(ang) * sp - 90, age, 1.2, 520);
    const rot = (r() - .5) * 14 * age;
    const cx = x, cy = footY - 26;
    g.save();
    g.translate(cx + dx, cy + dy); g.rotate(rot); g.translate(-cx, -cy);
    g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, 60, a0, a1); g.closePath(); g.clip();
    g.globalAlpha *= 1 - clamp((age - .5) / .4);
    drawHero(g, cls, 'walk', 1.4, x, footY, { shadow: false, fx: { tint: '#9adfff', tintA: .55 } });
    g.restore();
  }
}
shot({ id: 'spike', t0: 6.5625, t1: 7.5,
  draw(g, lt, P, t) {
    const tt = hitstop(t, HIT, 6 / 60);                 // the world stops for 6 frames on the impact
    const Tt = hitstop(FRAME_T, HIT, 6 / 60);
    const since = tt - HIT;
    const out = since > 0 ? E.outCubic(clamp(since / .25)) : 0;
    // after the kill the camera whips right down the corridor, into the flame room
    const whip = E.inCubic(clamp((lt - .74) / .1975));
    const K = lerp(6.6, 5.2, out) * (1 + lt * .04);
    const sk = shake(t, (since >= 0 ? 16 : 0) * Math.exp(-Math.max(0, since) / .15), 34);
    camera(g, FROST_X + 10 - lt * 6 + whip * 230, FLOOR - 66, K, .06 - out * .035 - whip * .06, sk[0] * .3, -Math.abs(sk[1]));
    const now = 12000 + Tt * 1000;
    // the spike pit fires so its peak lands on the beat (rise 70 ms)
    const eSpike = (tt - (HIT - .07)) * 1000;
    corridor(g, now, [{ types: ['frost', 'spike'], e: Math.min(eSpike, 69), glow: .38 }, { types: ['oil', 'flame'], e: null }], { throne: false });
    const hx = FROST_X - 18 + .02 * 46;
    if (since < 0) {
      drawHero(g, 'warrior', 'walk', 1.4, hx, FOOT, { fx: { tint: '#9adfff', tintA: .55 } });
      iceBlock(g, hx - 2, FOOT + 1, 44, 60, .62, 7);
    } else {
      if (since < 2 / 60) drawHero(g, 'warrior', 'walk', 1.4, hx, FOOT, { fx: { tint: '#ffffff', tintA: 1 } });
      else shatterHero(g, 'warrior', hx, FOOT, since - 2 / 60, 404);
      // the ice goes too
      burst(g, since, { x: hx, y: FOOT - 28, n: 70, seed: 66, speed: [60, 340], angle: [-Math.PI * .95, -Math.PI * .05], life: [.5, 1.2], size: [1.4, 3.2], gy: 520, drag: 1.2, cols: ['#e8fbff', '#9adfff', '#5ec8ff'], add: false, shape: 'sq' });
      burst(g, since, { x: hx, y: FOOT - 28, n: 50, seed: 67, speed: [150, 520], life: [.2, .6], size: [.8, 1.6], gy: 200, drag: 2, cols: ['#ffffff', '#bff0ff'], shape: 'spark', streak: .025 });
      // and he leaves gold and a skull behind
      const d = since - .15;
      burst(g, d, { x: hx, y: FOOT - 20, n: 28, seed: 68, speed: [50, 200], angle: [-Math.PI * .9, -Math.PI * .1], life: [.6, 1.1], size: [2, 3.5], gy: 480, drag: 1, cols: ['#ffd34d', '#ffe98a', '#e0a020'], add: false, shape: 'sq' });
      if (d > 0) { const sk2 = E.outBack(clamp(d / .15), 2.2); pixSkull(g, hx, FOOT - 36 - sk2 * 8, 2.1 * sk2, clamp(d / .05)); }
      floater(g, '-88', hx + 26, FOOT - 44, since - .02, '#ffffff', 14, 8);
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    frostCorners(g, 1 - clamp(since / .4));
    comboHeader(g, t);
    // SHATTER: on real time (it slams in DURING the freeze frames), sliced along a
    // horizontal cut whose halves snap back together
    const sinceR = t - HIT;
    if (sinceR >= 0) {
      const off = 18 * Math.exp(-sinceR / .07);
      for (const [y0, y1, dx] of [[-200, -28, -off], [-28, 200, off]]) {
        g.save(); g.beginPath(); g.rect(0, 440 + y0, W, y1 - y0); g.clip();
        tierB(g, 'SHATTER', 1340 + dx, 440, sinceR + .03, '#e8f4ff', { size: 80, dur: .7, fill: FILL.ice, glow: '#9adfff', rot: -.07 });
        g.restore();
      }
    }
  },
  post(lt, P, t) {
    const since = t - HIT;
    const whip = lt > .74;
    P.K = since >= 0 && since < 8 / 60 ? 1 : (whip ? 10 : 4);
    P.shutter = whip ? 1 : .5;
    if (whip) { P.zoomBlur = .05 * clamp((lt - .74) / .2); P.zbCenter = [.62, .55]; }
    P.saturation = lerp(.6, 1.1, clamp(since / .3));
    P.gain = [.94, 1, 1.1];
    P.ca = .0006 + (since >= 0 ? .012 * Math.exp(-since / .09) : 0);
    P.flash = [.85, .95, 1, since >= 0 ? .28 * Math.exp(-since / .05) : 0];
    if (since >= 0 && since < .5) P.shocks = [{ x: .5, y: .66, r: .02 + since * 1.1, w: .03, a: .7 * (1 - since / .5) }];
    P.bloom = .75;
  },
});

// ---- FLAME: the rogue walks into the oil, all four pillars cascade -------------
shot({ id: 'flame', t0: 7.5, t1: 7.96875,
  draw(g, lt, P, t) {
    const T = FRAME_T - 7.5;
    // the camera drifts with the cascade once it is lit (a pillar every 70 ms)
    const pan = clamp((lt - .1) / .3);
    const K = 5.2;
    camera(g, 1 * ROOM_W + lerp(70, 130, E.inOutCubic(pan)), FLOOR - 88, K, .015, ...shake(t, 9 * kick(lt, .02, .2) * (lt >= .02), 28).slice(0, 2));
    const now = 15000 + T * 1000;
    // the first column is already at its peak on the cut; the fourth peaks at lt .32
    const eF = (lt + .11) * 1000;
    corridor(g, now, [{ types: ['frost', 'spike'] }, { types: ['oil', 'flame'], e: Math.min(eF, 330) }, { types: ['tesla'] }, {}], { throne: false });
    const hx = 1 * ROOM_W + 112 + T * 20;          // standing in the third pillar
    const burn = clamp((lt - .02) / .08);
    drawHero(g, 'rogue', 'walk', 2 + T, hx, FOOT, { fx: { tint: '#ff7a2e', tintA: .4 * burn, flash: .7 * Math.exp(-Math.max(0, lt - .02) / .05) * (lt > .02) } });
    // the oil ignites under him
    burst(g, lt - .02, { x: 1 * ROOM_W + 118, y: FOOT - 4, n: 70, seed: 21, speed: [80, 420], angle: [-Math.PI * .92, -Math.PI * .08], life: [.3, .8], size: [1.5, 4], gy: -60, drag: 2.5, cols: ['#fff3b0', '#ffb03a', '#ff5a1a', '#ff3b2f'], shape: 'spark', streak: .04 });
    drawGlowW(g, 1 * ROOM_W + 118, FOOT - 10, 90, 'rgba(255,140,40,1)', 1.2 * kick(lt, .02, .15) * (lt > .02));
    embers(g, t, { box: [1 * ROOM_W, FLOOR - 170, 200, 170], n: 50, seed: 8, speed: [40, 140], size: [.8, 2], cols: ['#ffd34d', '#ff7a2e'] });
    floater(g, '-56', hx - 26, FOOT - 50, lt - .05, '#ff7a2e', 11, 8);
    g.setTransform(1, 0, 0, 1, 0, 0);
    comboHeader(g, t);
    // IGNITE: the letters light one after another, fast, in step with the pillars
    g.save(); g.translate(1420, 390); g.rotate(-.08);
    const pk = lt - .03, sc = pk < .06 ? lerp(1.6, 1, E.outCubic(clamp(pk / .06))) : 1 + .1 * Math.exp(-(pk - .06) * 9) * Math.cos((pk - .06) * 30);
    if (pk >= 0) { g.scale(sc, sc); stagger(g, 'IGNITE', 0, 0, pk, { font: F.pix(78), fill: FILL.fire, outline: '#1a0804', outlineW: 26, per: .018, in: .04, dy: 0, from: 1.6 }); }
    g.restore();
    // flames sucked out into black: the cut to the tesla room lands on black
    const suck = clamp((lt - .38) / .08);
    if (suck > 0) wash(g, '#000', suck);
  },
  post(lt, P) {
    P.heat = 1; P.bloom = .8; P.bloomThr = .7;
    P.gain = [1.08, .98, .9];
    P.ca = .0006 + .006 * kick(lt, .02, .08) * (lt > .02);
    if (lt > .08 && lt < .32) { P.K = 8; P.shutter = .6; }
    if (lt > .38) { P.zoomBlur = .08 * clamp((lt - .38) / .08); P.zbCenter = [.5, .55]; P.K = 6; P.shutter = 1; }
  },
});

// ---- TESLA: from black, the coil fires ON the beat and the arcs light the party ---
const ZAPS = [0, .1, .2];
shot({ id: 'tesla', t0: 7.96875, t1: 8.4375,
  draw(g, lt, P, t) {
    const T = FRAME_T - 7.96875;
    const hop = ZAPS.reduce((a, z, i) => lt >= z ? i : a, 0);
    const heroesX = [2 * ROOM_W + 30, 2 * ROOM_W + 62, 2 * ROOM_W + 150];   // the coil stands clear, between cleric and warrior
    // snap-zoom along the chain
    const K = 4.6 + .5 * kick(lt, ZAPS[hop], .08);
    camera(g, lerp(2 * ROOM_W + 80, heroesX[hop], .35), FLOOR - 90, K, -.02, ...shake(t, 7, 40).slice(0, 2));
    const now = 17000 + T * 1000;
    const eT = ((lt + .02) % .24) * 1000;
    corridor(g, now, [{}, {}, { types: ['tesla'], e: eT, glow: .5 }, {}], { throne: false });
    g.save(); g.fillStyle = 'rgba(4,2,10,.45)'; g.fillRect(-2000, -1000, 6000, 3000); g.restore();
    const cls = ['mage', 'cleric', 'warrior'];
    heroesX.forEach((x, i) => {
      const zapped = lt >= ZAPS[i];
      const xr = zapped && (lt - ZAPS[i]) < 2 / 60;          // 2-frame X-ray silhouette
      drawHero(g, cls[i], 'walk', zapped ? 1.1 + i * .2 : 1 + T + i * .2, x, FOOT,
        { fx: { tint: xr ? '#ffffff' : '#fff34d', tintA: xr ? 1 : zapped ? .08 : 0, flash: 0, rim: { col: '#9adfff', dx: -1.2, dy: -.4, a: .8 } } });
      if (zapped) floater(g, '-31', x - 10, FOOT - 54, lt - ZAPS[i] - .02, '#fff34d', 10, 6);
    });
    // the coil in front of the party, with its own white pulse on every zap
    const zapNow = ZAPS.some(z => lt >= z && lt - z < 2 / 60);
    drawTrapPart(g, now, 2 * ROOM_W, 'tesla', LAYOUT.traps.tesla[0], 0, 2, eT, { glow: .5 });
    if (zapNow) drawGlowW(g, 2 * ROOM_W + 100, FLOOR - 50, 40, 'rgba(255,255,255,1)', .8);
    // the arcs: coil -> hero 1 -> hero 2 -> hero 3, strobing (lit, lit, dark)
    const cx = 2 * ROOM_W + 100, cy = FLOOR - 50;
    const fl = Math.floor(t * 30);
    if (fl % 3 !== 2) ZAPS.forEach((z, i) => {
      if (lt < z) return;
      const from = i === 0 ? [cx, cy] : [heroesX[i - 1], FOOT - 30];
      bolt(g, from[0], from[1], heroesX[i], FOOT - 30, 31 + i * 7 + fl, i === 0 ? '#fff34d' : '#9adfff', 1.6, 7, 16);
      drawGlowW(g, heroesX[i], FOOT - 26, 36, 'rgba(255,240,120,1)', .12);
    });
    drawGlowW(g, cx, cy, 60, 'rgba(255,225,77,1)', .35);
    g.setTransform(1, 0, 0, 1, 0, 0);
    comboHeader(g, t);
    const j = [(hash(fl) - .5) * 5, (hash(fl + 9) - .5) * 5];
    tierB(g, 'OVERLOAD', 1420 + j[0], 380 + j[1], lt - .02, '#fff7b0', { size: 70, dur: .42, fill: FILL.volt, glow: '#4dc3ff', rot: -.06 });
  },
  post(lt, P) {
    P.bloom = .6; P.bloomThr = .85;
    P.gain = [1, 1, 1.08];
    P.ca = .0006 + .005 * ZAPS.reduce((a, z) => a + (lt >= z ? kick(lt, z, .06) : 0), 0);
  },
});
