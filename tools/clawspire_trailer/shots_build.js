// Act III: BUILD ANYTHING (b28-b36) and CAPSULE FEVER (b36-b44).
'use strict';

// ================================================================ BUILD ANYTHING montage (b28 - b32)
// one screen a beat, whipping in from alternating sides; a word per screen
const BUILD = [
  // the combo relic pick: the Weapon Rack is taken on b28.6
  { id: 'combo_pick', b0: 28, b1: 29, side: 1, x: .68, ry: -.34, col: C.gold, call: ['COMBO RELICS', .5, .5],
    ft: lt => cue('combo_pick', 'pick_take', 2.1) - b(.8) + lt },
  // the combos fire in the resolve row: ARMORY X5 on b29, MAGNETIZED X5 on b29.5 (full frame on the row)
  { id: 'combo_pick', b0: 29, b1: 29.75, side: -1, ff: { cx: .5, cy: .19, zoom: 1.12 }, col: C.gold,
    ft: lt => { const a = cue('combo_pick', 'row_card7_hit', 14.9), c = cue('combo_pick', 'row_card8_hit', 15.7);
      return lt < b(.5) ? a + (lt - .03) * (c - a) / b(.5) : c + (lt - b(.5)); } },
  // Joy Stick, the technician (b29.75), then her Cabinet Tech build in a fight (jump cut on b30.25)
  { id: 'crawlers_tech', b0: 29.75, b1: 31, side: -1, x: .32, ry: .34, col: C.teal, word: ['CABINET', 'TECH'], wx: .7, wordAt: b(.5),
    joy: [.33, .215], ft: lt => lt < b(.5) ? cue('crawlers_tech', 'joy_stick', 2.4) + .1 + lt : cue('crawlers_tech', 'cab_event_capsule_start', 5.7) + .25 + (lt - b(.5)) * 1.4 },
  // the press: feed done, slam on b31, lift on b31.5, COMPACTED! by b32
  { id: 'compactor', b0: 31, b1: 32, side: 1, x: .68, ry: -.3, col: C.pink, word: ['THE COMPACTOR', '3 IN, 1 OUT'], wx: .3,
    ft: lt => { const p = cue('compactor', 'phase_press', 2.47), l = cue('compactor', 'phase_lift', 3.63), d = cue('compactor', 'phase_done', 4.13) + .45;
      return lt < b(.5) ? lerp(p - .1, l, lt / b(.5)) : lerp(l, d, (lt - b(.5)) / b(.5)); } },
];
BUILD.forEach((s, i) => shot({ id: 'build' + i, t0: b(s.b0), t1: b(s.b1),
  draw(g, lt, P, t) {
    g.save();
    shakeAt(g, t, [s.b0], 14, .1, 24, i);
    if (s.ff) {
      shakeAt(g, t, [s.b0 + .5], 12, .1, 24, 7);
      const o = Object.assign({}, s.ff, { zoom: s.ff.zoom * (1 + .06 * lt), ox: s.side * (1 - E.outExpo(clamp(lt / .25))) * W * .5 });
      fullFrame(g, s.id, s.ft(lt), o);
      vignetteDark(g, .5, .3);
      g.restore();
      return;
    }
    const whip = 1 - E.outExpo(clamp(lt / .3));
    neonBg(g, t, { cam: [t * 240 + s.side * whip * 1200, 0], speed: 1.6 });
    const fly = E.outBack(clamp(lt / .2), 1.3);
    const pr = phone(g, { slot: 'b' + i, id: s.id, ft: s.ft(lt), flash: s.wordAt ? .6 * kick(lt, s.wordAt, .05) : 0, x: W * L(s.x, .5) + s.side * (1 - fly) * W * .3, y: H * L(.52, .6), h: L(900, 1250),
      ry: s.ry + s.side * (1 - fly) * -.6, rx: .05, rz: s.side * -.02, col: s.col, glare: .3 + lt * .3 });
    g.restore();
    if (s.call) {
      stagger(g, 'BUILD', W * L(.28, .5), H * L(.42, .1), lt, { font: F.disp(150), fill: FILL.white, depth: 14, depthCol: '#4a2a7a', per: .03 });
      stagger(g, 'ANYTHING', W * L(.28, .5), H * L(.66, .19), lt - .12, { font: F.disp(112), fill: FILL.gold, depth: 12, depthCol: '#7a4a08', per: .03, glow: C.gold });
      const [tx, ty] = pr.map(s.call[1], s.call[2]);
      callout(g, lt - b(.25), tx, ty, tx - L(240, 160), ty + L(300, 420), s.call[0], { col: C.gold, dur: 9, box: [L(420, 560), L(150, 200)] });
    } else if (s.word) {
      if (s.joy) {                                            // meet Joy Stick, the technician
        const [jx, jy] = pr.map(s.joy[0], s.joy[1]);
        callout(g, lt - .02, jx, jy, jx + 40, jy, '', { col: C.teal, dur: b(.4), box: [L(300, 420), L(110, 150)] });
        slam(g, 'JOY STICK', W * L(s.wx, .5), H * L(.52, .14), lt - .02, { font: F.disp(130), fill: FILL.teal, depth: 12, depthCol: '#06504c', glow: C.teal, dur: b(.42), out: .06, from: 2.2, rot: -.05 });
      }
      const wl = lt - (s.wordAt || 0);
      if (wl < 0) return;
      slam(g, s.word[0], W * L(s.wx, .5), H * L(.42, .1), wl - .04, { font: F.disp(fit(s.word[0], F.disp, 100, 760)), fill: FILL.white, depth: 10, depthCol: '#4a2a7a', dur: 9, from: 2.2 });
      slam(g, s.word[1], W * L(s.wx, .5), H * L(.63, .19), wl - .1, { font: F.disp(fit(s.word[1], F.disp, 150, 820)), fill: s.col === C.teal ? FILL.teal : FILL.candy, depth: 14, depthCol: s.col === C.teal ? '#06504c' : '#8a0f50', glow: s.col, dur: 9, from: 2.6, rot: s.side * .05 });
    }
  },
  post(lt, P, t) {
    P.zoomBlur = .16 * (1 - E.outExpo(clamp(lt / .3))); P.zbCenter = [s.x || .5, .5];
    P.flash = [1, 1, 1, .35 * kick(lt, 0, .04) + (s.ff ? .3 * kick(lt, b(.5), .04) : 0)];
    P.ca = .0008 + .012 * kick(lt, 0, .1) + (s.ff ? .01 * kick(lt, b(.5), .1) : 0);
    P.K = lt < .3 ? 6 : 4;
  },
}));

// ================================================================ THE CLAW WALL (b32 - b36)
// eight phones on a curved wall, one claw type each, slamming in on 8ths
// eight phones on a concave arc (cover flow), revealed from the centre outwards
const WALL_ORDER = [3, 4, 2, 5, 1, 6, 0, 7];                 // slot -> reveal order
const WALL = CLAW_IDS.map((c, i) => ({ c, s: i - 3.5, at: 32 + WALL_ORDER.indexOf(i) * .5 }));
const wallGeom = (w, t) => {
  const dolly = E.inOutCubic(inv(b(32), b(36), t));
  const exit = E.inCubic(inv(b(35.6), b(36), t));
  if (VERT) {                                                 // two rows of four
    const i = w.s + 3.5, col = i % 4 - 1.5, row = Math.floor(i / 4);
    return { x: W / 2 + col * 262 * (1 + exit * .8) + lerp(30, -30, dolly), y: H * (.43 + row * .33), h: 500, ry: -col * .2, rx: (row ? -1 : 1) * .05, scale: 1 + exit * .9 };
  }
  return { x: W / 2 + w.s * 222 * (1 + exit * .8) + lerp(50, -50, dolly), y: H * .6, h: 600 * (1 - Math.abs(w.s) * .04),
    ry: -w.s * .2, rx: .04, rz: w.s * .006, scale: 1 + exit * .9 };
};
shot({ id: 'wall', t0: b(32), t1: b(36),
  draw(g, lt, P, t) {
    g.save();
    shakeAt(g, t, WALL.map(w => w.at), 9, .08);
    const exit = E.inCubic(inv(b(35.6), b(36), t));
    camZoom(g, 1 + exit * 1.4, W / 2, H / 2);
    neonBg(g, t, { cam: [t * 160, 0], speed: 1.8 });
    for (const w of [...WALL].sort((p, q) => Math.abs(q.s) - Math.abs(p.s))) {
      const age = t - b(w.at);
      if (age < 0) continue;
      const s = spring(age, 13, 7.5);
      const geo = wallGeom(w, t);
      phone(g, Object.assign({ slot: 'w' + w.c, id: 'claw_' + w.c, ft: cue('claw_' + w.c, ['claw_close', 'grab'], .6) - .3 + age, col: CLAW_COL[w.c], zoom: 1.3, cx: .5, cy: .6,
        flash: .7 * kick(age, 0, .05), glare: .5 + w.s * .1, glow: .6 }, geo, { scale: geo.scale * lerp(1.5, 1, s), y: geo.y - (1 - s) * 120, alpha: clamp(age / .05) }));
      ring(g, geo.x, geo.y, age, { r0: 60, r1: 420, life: .3, col: CLAW_COL[w.c], lw: 10 });
    }
    g.restore();
    // the headline on the wall
    const hb = b(34);
    if (t > hb) slam(g, '8 CLAW TYPES', W / 2, H * L(.2, .16), t - hb, { font: F.disp(fit('8 CLAW TYPES', F.disp, 120, 1300)), fill: FILL.candy, depth: 12, glow: C.pink, dur: 9, from: 2.6 });
  },
  post(lt, P, t) {
    P.flash = [1, 1, 1, .25 * kick(t, b(32), .05) + .4 * kick(t, b(34), .05)];
    P.ca = .0008 + .004 * WALL.map(w => kick(t, b(w.at), .08)).reduce((a, c) => a + c, 0);
    P.zoomBlur = .35 * E.inCubic(inv(b(35.6), b(36), t)); P.zbCenter = [.5, .5];
  },
});

// ================================================================ CAPSULE FEVER (b36 - b41)
const CL = 'capsule_legend';
const CL_CAP = [.5, .48];                                    // the capsule (stage fractions)
const CL_TITLE = [.5, .115];                                 // the game's LEGENDARY title
// the taps upgrade it uncommon -> rare -> legendary on 8ths, the burst lands on b38
const CL_MAP = [[36.5, ['tap_1'], .8], [37, ['upgrade_to_r', 'tap_2'], 1.3], [37.5, ['upgrade_to_l', 'tap_3'], 1.7], [38, ['phase_burst', 'legendary'], 2.15]];
function clFt(t) {
  const pts = CL_MAP.map(([bb, names, fb]) => [b(bb), cue(CL, names, fb)]);
  if (t < pts[0][0]) return pts[0][1] + (t - pts[0][0]);
  for (let i = 1; i < pts.length; i++) if (t < pts[i][0]) return lerp(pts[i - 1][1], pts[i][1], (t - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0]));
  return rampTo(t, b(38), pts[3][1], [[b(38), 1.6], [b(38.7), 1.6], [b(38.9), .35], [b(40), .35], [b(40.2), 4.5], [b(40.8), 4.5], [b(41), 1]]);
}
const CL_CROP = t => ({ cx: .5, cy: keys([[b(36), .46], [b(38.4), .44], [b(39.2), .235, E.inOutCubic]], t), zoom: keys([[b(36), 1.15], [b(37.9), 1.55, E.inQuad], [b(38), 1.2, E.outExpo], [b(39.6), 1.02], [b(41), 1.06]], t) });
shot({ id: 'capsule', t0: b(36), t1: b(41),
  draw(g, lt, P, t) {
    const tr = t < b(38) ? 3 * inv(b(36), b(38), t) : 0;      // the tremble before the burst
    g.save();
    if (tr > 0) { const s = shake(t, tr * 3, 30, 4); g.translate(s[0], s[1]); }
    shakeAt(g, t, [36.5, 37, 37.5], 16, .1); shakeAt(g, t, [38], 40, .25, 18, 2);
    const o = CL_CROP(t);
    fullFrame(g, CL, clFt(t), o);
    g.restore();
    const [cx, cy] = ffPoint(o, CL_CAP[0], CL_CAP[1]);
    // anticipation: darkness closes in, a held breath
    wash(g, '#05020c', .5 * inv(b(36), b(37.9), t) * (1 - inv(b(38), b(38.1), t)));
    const lg = b(38);
    if (t >= lg) {
      const a = .35 + .4 * kick(t, lg, .8);
      shafts(g, cx, cy, .4 * a, { n: 22, dir: 0, spread: Math.PI * 2, len: 1600, seed: 18, t, col: 'rgba(255,214,120,A)', spin: .12, width: 1.3 });
      flare(g, cx, cy, a * .7, { size: 1.0 });
      burst(g, t - lg, { x: cx, y: cy, n: 200, seed: 38, speed: [400, 2600], life: [.7, 2.2], size: [3, 9], gy: 150, drag: 1.8, cols: [C.gold, '#fff6c8', C.pink, C.teal], shape: 'star' });
      ring(g, cx, cy, t - lg, { r0: 40, r1: 1100, life: .5, col: '#ffd68a', lw: 22 });
    }
    // each tap upgrades it: uncommon, rare, legendary (rings in the tier colour)
    [[36.5, C.teal], [37, C.pink], [37.5, C.gold]].forEach(([bb, col], i) => {
      ring(g, cx, cy, t - b(bb), { r0: 120, r1: 700, life: .4, col, lw: 22 });
      burst(g, t - b(bb), { x: cx, y: cy, n: 30, seed: 37 + i, speed: [400, 1200], life: [.3, .7], size: [4, 9], gy: 600, cols: [col, '#fff'], shape: 'star' });
    });
    const [lx, ly] = ffPoint(o, CL_TITLE[0], CL_TITLE[1]);
    callout(g, t - b(39.15), lx + L(330, 240), ly + 10, lx + L(640, 120), ly + L(260, 330), 'LEGENDARY', { col: C.gold, dur: b(.6), box: [700, 150] });
    if (t > b(40)) {
      slam(g, 'CAPSULE', W / 2, H * L(.52, .62), t - b(40), { font: F.disp(150), fill: FILL.white, depth: 14, depthCol: '#4a2a7a', dur: 9, from: 2.6 });
      slam(g, 'FEVER', W / 2, H * L(.8, .73), t - b(40.12), { font: F.disp(220), fill: FILL.gold, depth: 20, depthCol: '#7a4a08', glow: C.gold, dur: 9, from: 3, rot: -.06 });
    }
    vignetteDark(g, .5, .3);
  },
  post(lt, P, t) {
    const lg = b(38);
    P.flash = [1, .97, .88, t >= lg ? (t < lg + 2 / 60 ? .9 : .6 * kick(t, lg + 2 / 60, .06)) : .3 * kick(t, b(37.5), .04)];
    P.rays = t >= lg ? .6 * (.4 + .6 * kick(t, lg, 1.0)) : 0; P.raysPos = [.5, .55]; P.raysDecay = .955;
    P.shocks = [{ x: .5, y: .55, r: E.outCubic(inv(lg, lg + .9, t)) * 1.5, w: .12, a: .7 * (1 - inv(lg, lg + .9, t)) },
      { x: .5, y: .55, r: E.outCubic(inv(b(37.5), b(37.5) + .5, t)) * .7, w: .06, a: .4 * (1 - inv(b(37.5), b(37.5) + .5, t)) }];
    P.ca = .0008 + .03 * kick(t, lg, .15) + .01 * kick(t, b(37.5), .1);
    P.saturation = t < lg ? 1.0 - .25 * inv(b(36), b(37.9), t) : 1.2;
    P.bloom = t < lg ? .55 : .7; P.bloomThr = t < lg ? .74 : .72;
    P.vignette = t < lg ? .38 + .3 * inv(b(36), b(37.9), t) : .4;
    P.K = t > b(38.8) && t < b(40.1) ? 6 : 4;
    P.flash[3] += .55 * kick(t, b(40), .04);
  },
});

// ================================================================ COLLECT MINIS (b41 - b44)
const VM = 'vault_minis';
shot({ id: 'minis', t0: b(41), t1: b(44),
  draw(g, lt, P, t) {
    g.save();
    shakeAt(g, t, [41], 14, .1);
    drift(g, lt, 1.2);
    neonBg(g, t, { cam: [t * 120, 0], speed: 1.2 });
    const fly = spring(lt, 7, 6);
    const pr = phone(g, { slot: 'vm', id: VM, ft: cue(VM, 'minis_tab', .5) + .1 + lt * 1.25, x: lerp(W * .3, W * L(.66, .5), fly), y: lerp(H * 1.5, H * L(.52, .6), fly), h: L(900, 1250), ry: lerp(.9, -.28, fly) + .1 * Math.sin(lt * 1.7) * fly, rz: lerp(.3, .02, fly), rx: .05, col: C.purple, glare: .3 + lt * .2 });
    // the minis bounce out of the screen as sparkles
    burst(g, lt - .25, { x: pr.map(.5, .3)[0], y: pr.map(.5, .3)[1], n: 40, seed: 44, speed: [200, 900], angle: [-Math.PI * .9, -Math.PI * .1], life: [.8, 1.6], size: [5, 10], gy: 700, cols: [C.teal, C.pink, C.gold], shape: 'star' });
    g.restore();
    stagger(g, 'COLLECT', W * L(.28, .5), H * L(.44, .09), lt - .05, { font: F.disp(120), fill: FILL.white, depth: 12, depthCol: '#4a2a7a', per: .03 });
    stagger(g, 'MINIS', W * L(.28, .5), H * L(.7, .2), lt - .2, { font: F.disp(190), fill: FILL.teal, depth: 16, depthCol: '#06504c', per: .05, glow: C.teal, spin: .3 });
  },
  post(lt, P, t) {
    P.flash = [1, 1, 1, .35 * kick(lt, 0, .05)];
    P.zoomBlur = .12 * (1 - E.outCubic(clamp(lt / .3))); P.zbCenter = [.6, .5];
  },
});
