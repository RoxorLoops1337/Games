// Act IV: CLAW-O-WEEN (b44-b52), PLAY TOGETHER (b52-b56) and the lockup (b56-b60).
'use strict';

// dripping spooky type (orange candy with goo drips under the letters)
function spookyText(g, txt, x, y, lt, o = {}) {
  stagger(g, txt, x, y, lt, Object.assign({ font: o.font, fill: FILL.orange, depth: 14, depthCol: '#5a1a00', glow: C.orange, per: .035, spin: .25, outline: '#1a0608' }, o));
  // drips grow under the baseline
  const m = measure(txt, o.font, 0);
  const r = rng(o.seed || 31);
  g.save(); g.fillStyle = '#ff7a12';
  for (let i = 0; i < (o.drips || 9); i++) {
    const dx = x - m.w / 2 + r() * m.w, len = lerp(20, 80, r()) * E.outCubic(clamp((lt - .25 - r() * .3) / .5));
    if (len <= 1) continue;
    const w = lerp(8, 16, r());
    g.beginPath(); g.moveTo(dx - w / 2, y - 4); g.lineTo(dx + w / 2, y - 4); g.lineTo(dx + w / 2, y + len); g.arc(dx, y + len, w / 2, 0, Math.PI); g.closePath(); g.fill();
  }
  g.restore();
}

// ================================================================ BAT WIPE (b43.5 - b44.6)
shot({ id: 'bats', t0: b(43.4), t1: b(44.7), cut: false,
  draw(g, lt, P, t) {
    const u = inv(b(43.4), b(44.7), t);
    batSwarm(g, t, u, { n: 420, seed: 66, size: 1.6 });
  },
});

// ================================================================ CLAW-O-WEEN title (b44 - b47)
const HW_MOON = L([W * .83, H * .2], [W * .78, H * .1]);
shot({ id: 'halloween', t0: b(44), t1: b(47),
  draw(g, lt, P, t) {
    g.save();
    shakeAt(g, t, [44, 44.5], 18, .14);
    drift(g, lt, 1.3);
    neonBg(g, t, { cam: [t * 90, 0], halloween: 1, speed: .9, rays: .6 });
    moon(g, HW_MOON[0] - lt * 20, HW_MOON[1] + 10, 110);
    // a few bats circling the moon
    for (let i = 0; i < 6; i++) { const a = t * 1.4 + i * 1.05; bat(g, HW_MOON[0] + Math.cos(a) * (190 + i * 16), HW_MOON[1] + Math.sin(a) * 70 + 20, 1.1 + (i % 3) * .3, t * 20 + i, '#120610'); }
    for (const [px, s] of [[.06, 1.5], [.17, 1.0], [.95, 1.3]]) pumpkin(g, W * px, H * .9, s, .7 + .3 * Math.sin(t * 9 + px * 20));
    const fly = spring(lt, 7, 6);
    phone(g, { slot: 'hw', id: 'halloween_title', ft: cue('halloween_title', 'sheen_start', 1) - .3 + lt, x: W * L(.69, .5), y: lerp(H * 1.6, H * L(.53, .62), fly), h: L(900, 1200), ry: lerp(-1.2, -.28, fly) + .1 * Math.sin(lt * 1.5) * fly, rx: .06, rz: lerp(-.25, .02, fly), col: C.orange, glare: .3 + .2 * lt });
    motes(g, t, { n: 40, seed: 9, speed: [40, 120], size: [2, 4], cols: [C.orange, C.gold, C.purple], alpha: .8 });
    g.restore();
    spookyText(g, 'CLAW-', W * L(.3, .42), H * L(.43, .1), t - b(44.5), { font: F.disp(150) });
    spookyText(g, 'O-WEEN', W * L(.3, .55), H * L(.68, .2), t - b(44.62), { font: F.disp(150), seed: 32 });
  },
  post(lt, P, t) {
    P.tint = [1.0, .72, .5]; P.tintA = .22;
    P.lift = [.03, .0, .05];
    P.flash = [1, .7, .3, .4 * kick(t, b(44.5), .05)];
    P.ca = .0008 + .012 * kick(t, b(44.5), .1);
    P.bloom = .75;
  },
});

// ================================================================ the Halloween fight (b47 - b49)
const HF_CROP = t => ({ cx: .5, cy: lerp(.2, .24, inv(b(47), b(49), t)), zoom: lerp(1.05, 1.18, inv(b(47), b(49), t)) });
shot({ id: 'hfight', t0: b(47), t1: b(49),
  draw(g, lt, P, t) {
    shakeAt(g, t, [47, 47.5, 48.5], 20, .12);
    // the first two cards hit the costumed foes on b47.5 and b48.5
    const h1 = cue('halloween_fight', ['row_card1_hit', 'hit1'], 1.5), h2 = cue('halloween_fight', ['row_card2_hit', 'hit2'], 2.5);
    const hft = t < b(47.5) ? h1 + (t - b(47.5)) : t < b(48.5) ? lerp(h1, h2, (t - b(47.5)) / b(1)) : h2 + (t - b(48.5));
    fullFrame(g, 'halloween_fight', hft, HF_CROP(t));
    batSwarm(g, t, .2 + .5 * inv(b(47), b(49), t), { n: 30, seed: 9, size: .8, dir: -1 });
    vignetteDark(g, .6, .25);
    pill(g, 'COSTUMED FOES', W / 2, H * L(.92, .9), { font: F.cond(88), bg: 'rgba(20,6,10,.9)', border: C.orange, fg: '#ffe2c2', h: 110, padX: 70, tracking: 3, glow: C.orange });
  },
  post(lt, P, t) {
    P.tint = [1.0, .72, .5]; P.tintA = .18;
    P.flash = [1, .6, .2, .45 * kick(t, b(47), .05)];
    P.ca = .0008 + .015 * kick(t, b(47), .1) + .01 * kick(t, b(48), .1);
  },
});

// ================================================================ NEON DEPTHS flash (b49 - b50)
shot({ id: 'depths', t0: b(49), t1: b(50),
  draw(g, lt, P, t) {
    shakeAt(g, t, [49], 18, .12);
    fullFrame(g, 'depths', cue('depths', 'tide_high', 1) - .25 + lt, { cx: .5, cy: .27, zoom: 1.0 + lt * .25 });   // the Drowned Jukebox over High Tide
    burst(g, lt, { x: W / 2, y: H + 40, n: 70, seed: 49, speed: [200, 700], angle: [-Math.PI * .7, -Math.PI * .3], life: [.6, 1.2], size: [6, 16], gy: -300, drag: 1, cols: ['#8bfff2', '#ffffff', '#2ee6d6'], shape: 'dot', alpha: .5 });
    slam(g, 'NEON DEPTHS', W / 2, H * L(.8, .62), lt - .02, { font: F.disp(fit('NEON DEPTHS', F.disp, 170, 1600)), fill: FILL.teal, depth: 14, depthCol: '#06504c', glow: C.teal, dur: 9, from: 2.4 });
  },
  post(lt, P) {
    P.tint = [.5, 1.0, 1.1]; P.tintA = .2;
    P.glitch = .8 * (1 - clamp(lt / .1)); P.rgb = .02 * (1 - clamp(lt / .12));
    P.heat = .6;
  },
});

// ================================================================ Dutch flash (b50 - b51.5)
shot({ id: 'nl', t0: b(50), t1: b(52),
  draw(g, lt, P, t) {
    g.save();
    shakeAt(g, t, [50], 14, .1);
    drift(g, lt, 1.5);
    neonBg(g, t, { cam: [t * 200, 0], speed: 2 });
    const fly = E.outBack(clamp(lt / .25), 1.5), ex = E.inCubic(inv(b(1.55), b(2), lt));
    phone(g, { slot: 'nl', id: 'nl_row', ft: cue('nl_row', 'row_GO', 6.43) - .05 + lt,   // JOUW TREFFERS + GAAN!, before the first card's English-only floater
       x: W * L(.72, .5) - ex * W * .9, y: H * L(.52, .62) + (1 - fly) * 900, h: L(900, 1200), ry: -.3, rx: .05, col: '#ff7a3a', glare: .5 });
    g.restore();
    slam(g, 'NU OOK IN HET', W * L(.3, .5), H * L(.45, .09), lt - .03, { font: F.disp(78), fill: FILL.white, depth: 8, depthCol: '#4a2a7a', dur: 9, from: 2 });
    slam(g, 'NEDERLANDS', W * L(.3, .5), H * L(.65, .17), lt - .1, { font: F.disp(fit('NEDERLANDS', F.disp, 140, 960)), fill: FILL.orange, depth: 12, depthCol: '#5a1a00', glow: '#ff7a3a', dur: 9, from: 2.6, rot: -.05 });
    // the Dutch tricolour as a swipe of light under the word
    const sw = E.outExpo(clamp((lt - .1) / .3));
    [['#ae1c28', -26], ['#ffffff', 0], ['#21468b', 26]].forEach(([c, dy]) => { g.fillStyle = c; g.fillRect(W * L(.3, .5) - L(470, 440) * sw, H * L(.73, .21) + dy, L(940, 880) * sw, 18); });
  },
  post(lt, P) {
    P.glitch = .7 * (1 - clamp(lt / .08)); P.flash = [1, 1, 1, .3 * kick(lt, 0, .04)];
    P.zoomBlur = .14 * (1 - E.outCubic(clamp(lt / .25)));
    P.zoomBlur += .3 * E.inCubic(inv(b(1.55), b(2), lt)); P.zbCenter = [.5, .5];
  },
});

// ================================================================ ONLINE CO-OP (b52 - b56)
const COOP_STOP0 = b(55), COOP_STOP1 = b(55.75);
// the tape stop: picture time slows to a halt with the music
// both phones were captured in lockstep: the lobby with the shared room code, a jump cut on b53
// to the guest's turn, the claw drop on b54 and the host cheering on b55
const CO = 'coop_online_host';
function coopFt(t) {
  const fr = n => n / 60;
  const segs = [[b(52), fr(40)], [b(52.95), fr(cue(CO, 'host_ready', 110 / 60) * 60)], null,
    [b(53), cue(CO, 'turn_start_guest_active', 5.4) - .05], [b(54), cue(CO, 'claw_drop', 6.47)], [b(55), cue(CO, 'watcher_cheer', 7.67)]];
  if (t < b(52.95)) return lerp(segs[0][1], segs[1][1], clamp((t - segs[0][0]) / (segs[1][0] - segs[0][0])));
  if (t < b(53)) return segs[1][1];
  if (t < b(54)) return lerp(segs[3][1], segs[4][1], (t - segs[3][0]) / b(1));
  if (t < b(55)) return lerp(segs[4][1], segs[5][1], (t - segs[4][0]) / b(1));
  return segs[5][1] + (t - b(55));
}
const coopT = t => t < COOP_STOP0 ? t : COOP_STOP0 + (COOP_STOP1 - COOP_STOP0) * (1 - Math.pow(1 - inv(COOP_STOP0, COOP_STOP1, t), 2)) / 2;
shot({ id: 'coop', t0: b(52), t1: b(56),
  draw(g, lt, P, t0) {
    const t = coopT(t0), l = t - b(52);
    g.save();
    shakeAt(g, t, [52, 53, 54], 14, .12);
    drift(g, l, 1.2);
    neonBg(g, t, { cam: [t * 120, 0], speed: 1.4 });
    const fly = spring(l + .04, 9, 6.5);
    // the host shows the coin toss while the guest is in the lobby with the room code
    const host = { slot: 'host', id: 'coop_online_host', ft: t < b(53) ? lerp(cue(CO, 'toss', 1.87), cue(CO, 'toss', 1.87) + .7, (t - b(52)) / b(1)) : coopFt(t), flash: .5 * kick(t, b(53), .06), x: lerp(-200, W * L(.25, .27), fly), y: H * L(.58, .6), h: L(780, 820), ry: .42, rx: .05, rz: -.03, col: C.pink, glare: .2 };
    const guest = { slot: 'guest', id: 'coop_online_guest', ft: coopFt(t), flash: .5 * kick(t, b(53), .06), x: lerp(W + 200, W * L(.75, .73), fly), y: H * L(.58, .6), h: L(780, 820), ry: -.42, rx: .05, rz: .03, col: C.teal, glare: .8 };
    const ph = phone(g, host), pg = phone(g, guest);
    // the link: an arc between the inner edges, re-struck on every beat
    const [ax, ay] = ph.map(1.02, .45), [bx, by] = pg.map(-.02, .45);
    const bk = beatKick(t, 52.5, 55, .18, .5);
    if (l > b(.5)) {
      lightning(g, ax, ay, bx, by, 300 + Math.floor(t / (BEAT / 2)), { alpha: .35 + .65 * bk, lw: 4, glow: C.pink, col: '#ffe6f2', depth: 6, jit: 120 });
      lightning(g, ax, ay + 40, bx, by + 40, 900 + Math.floor(t / (BEAT / 2)), { alpha: .25 + .5 * bk, lw: 3, glow: C.teal, depth: 6, jit: 90 });
      glowEllipse(g, ax, ay, 90, 90, C.pink, .6 * (.5 + bk)); glowEllipse(g, bx, by, 90, 90, C.teal, .6 * (.5 + bk));
    }
    // the shared room code, on the host's lobby
    const [cx_, cy_] = pg.map(.5, .095);
    callout(g, t - b(52.25), cx_, cy_, L(W / 2 + 120, cx_ - 60), cy_ + L(110, -150), 'SHARE A CODE', { col: C.teal, dur: b(.55), box: [pg.w * .7, pg.h * .1] });
    g.restore();
    const word = t < b(54) ? 'ONLINE CO-OP' : 'PLAY TOGETHER';
    const wt = t < b(54) ? t - b(52.5) : t - b(54);
    slam(g, word, W / 2, H * L(.19, .14), wt, { font: F.disp(fit(word, F.disp, 128, 1500)), fill: t < b(54) ? FILL.candy : FILL.teal, depth: 12, depthCol: t < b(54) ? '#8a0f50' : '#06504c', glow: t < b(54) ? C.pink : C.teal, dur: 9, from: 2.4 });
    // tape stop: the picture sags and goes dark
    const st = inv(COOP_STOP0, COOP_STOP1, t0);
    wash(g, '#000', E.inQuad(st) * .92 + (t0 > b(55.8) ? 1 : 0));
  },
  post(lt, P, t) {
    const st = inv(COOP_STOP0, COOP_STOP1, t);
    P.flash = [1, 1, 1, .4 * kick(t, b(52), .05)];
    P.saturation = 1.12 - .9 * st; P.barrel = .25 * st; P.ca = .0008 + .02 * st;
    P.zoomBlur = .08 * (1 - E.outCubic(inv(b(52), b(52.3), t)));
  },
});

// ================================================================ the lockup (b56 - b60)
const LOGO_T = b(56), HOLD_T = 24.0;
function logoMark(g, x, y, s) {
  g.save(); g.translate(x, y); g.scale(s, s);
  candyText(g, 'CLAWSPIRE', 0, 0, { font: F.candy(250), fill: FILL.candy, depth: 22, depthCol: '#6a0a3a', outline: '#2a0a22', outlineW: 26, glow: C.pink, tracking: 4 });
  star4(g, -500, -170, 34, '#ffffff');
  g.restore();
}
shot({ id: 'logo', t0: LOGO_T, t1: DUR,
  draw(g, lt, P, t) {
    const lf = Math.min(t, HOLD_T) - LOGO_T;                 // a clock that stops at the hold
    g.save();
    shakeAt(g, Math.min(t, HOLD_T), [56], 30, .14);
    neonBg(g, LOGO_T + lf * .6, { cam: [lf * 60, 0], halloween: 1, speed: .5, rays: .8 });
    moon(g, W * .5, H * L(.27, .27), L(190, 230) + 10 * E.outCubic(clamp(lf / .6)), .85);
    for (let i = 0; i < 9; i++) { const a = (LOGO_T + lf) * .9 + i * .7; bat(g, W * .5 + Math.cos(a) * (360 + i * 28), H * .3 + Math.sin(a * 1.3) * 120, 1.2 + (i % 3) * .4, (LOGO_T + lf) * 22 + i, '#100510'); }
    for (const [px, s] of [[.07, 1.6], [.18, 1.1], [.82, 1.2], [.94, 1.7]]) pumpkin(g, W * px, H * .93, s * .85, .55);
    // the logo: slams from huge, overshoots, settles before the hold
    const inT = .12;
    let s;
    if (lf < inT) s = lerp(2.6, .96, E.inQuad(lf / inT));
    else s = 1 - .05 * Math.exp(-(lf - inT) * 9) * Math.cos((lf - inT) * 30);
    glowEllipse(g, W / 2, H * .4, 900, 260, C.pink, .35 + .4 * kick(lf, 0, .4));
    burst(g, lf, { x: W / 2, y: H * .4, n: 160, seed: 56, speed: [500, 2600], life: [.4, 1.2], size: [3, 9], gy: 600, drag: 2.4, cols: [C.gold, C.pink, C.teal, '#fff'], shape: 'star' });
    g.globalAlpha = clamp(lf / .03);
    logoMark(g, W / 2, H * L(.47, .42), s * fit('CLAWSPIRE', F.candy, 250, L(1460, 980)) / 250);
    // 2.0 badge
    const bu = spring(lf - .1, 12, 7);
    if (bu > 0) {
      g.save(); g.translate(W * L(.73, .7), H * L(.58, .49)); g.rotate(-.12); g.scale(bu, bu);
      g.fillStyle = '#1a0a2a'; g.beginPath(); g.roundRect(-150, -92, 300, 150, 40); g.fill();
      g.lineWidth = 8; g.strokeStyle = C.gold; g.stroke();
      candyText(g, '2.0', 0, 40, { font: F.disp(104), fill: FILL.gold, depth: 8, depthCol: '#7a4a08' });
      g.restore();
    }
    g.globalAlpha = 1;
    g.restore();
    // call to action + where
    const ca = clamp((t - b(56.75)) / .14);
    if (ca > 0) {
      g.save(); g.translate(W / 2, H * L(.725, .62)); const sc = lerp(1.35, 1, E.outBack(ca, 2)) * L(1, .74); g.scale(sc, sc); g.globalAlpha = ca;
      pill(g, 'PLAY FREE IN YOUR BROWSER', 0, 0, { font: F.ui(74), bg: '#c8126a', border: '#ffb3d6', borderW: 6, fg: '#ffffff', h: 120, padX: 110, tracking: 3 });
      g.restore();
    }
    const ua = clamp((t - b(57.25)) / .14);
    if (ua > 0) {
      g.save(); g.globalAlpha = ua;
      g.font = F.ui(L(76, 62)); g.textAlign = 'center'; g.lineJoin = 'round'; g.letterSpacing = '1px';
      const y = H * L(.875, .7) + (1 - E.outCubic(ua)) * 16;
      g.lineWidth = 14; g.strokeStyle = '#0b0618'; g.strokeText('games-71g.pages.dev/clawspire', W / 2, y);
      g.fillStyle = C.mint; g.fillText('games-71g.pages.dev/clawspire', W / 2, y);
      g.restore();
    }
  },
  post(lt, P, t) {
    const lf = Math.min(t, HOLD_T) - LOGO_T;
    P.flash = [1, .95, .98, lf < 1 / 60 ? .95 : .7 * Math.exp(-lf / .05)];
    P.shocks = [{ x: .5, y: .45, r: E.outCubic(clamp(lf / .7)) * 1.3, w: .1, a: .6 * (1 - clamp(lf / .7)) }];
    P.ca = .0008 + .02 * kick(lf, 0, .1);
    P.rays = .45 * (.3 + .7 * kick(lf, 0, .6)); P.raysPos = [.5, .27];
    P.tint = [1.0, .8, .7]; P.tintA = .1;
    P.bloom = .5; P.bloomThr = .8;
    P.zoomBlur = .05 * kick(lf, 0, .06); P.zbCenter = [.5, .45];
    if (t >= HOLD_T) { P.K = 1; P.seedT = HOLD_T; }          // dead still: one paint, frozen grain
  },
});
