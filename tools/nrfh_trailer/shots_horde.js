// Act IV-V: RAISE MONSTERS (8.4375 - 10.78), CHAMPION APPROACHES (10.78 - 11.72),
// OVERDRIVE (11.72 - 12.66) and the stop-down (12.66 - 13.125).
'use strict';
const LAIR = img('rooms/lair.png');
const TAN15 = Math.tan(15 * Math.PI / 180);
const B8 = .234375;                                        // an 8th note
const PANELS = [
  // top-edge x range, landing beat, entry side, backing colours, cast, framing (screen anchor x, zoom, world anchor)
  { x0: -60, x1: 690, t: 8.90625, dir: -1, back: ['#5a0d10', '#1c0306'], mon: 'ogre', hero: 'warrior', rim: '#ff6a4a', sa: 230, K: 4.8, wa: 110, cy: FLOOR - 40, heroX: 88, monX: 132, lead: .25 },
  { x0: 690, x1: 1330, t: 9.375, dir: 1, back: ['#4a3a24', '#140e08'], mon: 'dragon', hero: 'cleric', rim: '#ffd8a0', sa: 820, K: 4.4, wa: 110, cy: FLOOR - 45, heroX: 84, monX: 140, lead: .2 },
  { x0: 1330, x1: 2260, t: 9.84375, dir: 1, back: ['#0f4a16', '#031405'], mon: 'slime', hero: 'mage', rim: '#9eff7a', sa: 1480, K: 5.6, wa: 110, cy: FLOOR - 40, heroX: 70, monX: 128, lead: .12 },
];
const ALLHIT = 10.3125;

function panelPath(g, p, ox) {
  g.beginPath();
  g.moveTo(p.x0 + ox, 0); g.lineTo(p.x1 + ox, 0);
  g.lineTo(p.x1 + ox - H * TAN15, H); g.lineTo(p.x0 + ox - H * TAN15, H);
  g.closePath();
}

// one panel's little fight: the monster's blow lands an 8th note after the panel does
function panelScene(g, p, i, t, T) {
  const hitT = p.t + B8;                                   // the contact beat
  const strike = t - (hitT - p.lead), strike2 = t - (ALLHIT - p.lead);
  const K = p.K * (1 + .1 * clamp((t - p.t) / 1.8)) * (1 + .06 * clamp((t - ALLHIT) / .47));
  g.save();
  camAt(g, p.sa, 600, p.wa, p.cy, K);
  // the room, pre-washed in the panel colour (baked once per panel)
  const room = ROOMIMG.empty;
  if (ok(room)) {
    const tinted = baked('panelroom' + i, room.naturalWidth, room.naturalHeight, x => {
      x.drawImage(room, 0, 0);
      x.globalCompositeOperation = 'color'; x.globalAlpha = .75; x.fillStyle = p.back[0]; x.fillRect(0, 0, room.naturalWidth, room.naturalHeight);
      x.globalCompositeOperation = 'multiply'; x.globalAlpha = 1; x.fillStyle = '#8a7a9a'; x.fillRect(0, 0, room.naturalWidth, room.naturalHeight);
      x.globalCompositeOperation = 'destination-in'; x.drawImage(room, 0, 0);
    });
    const dh = Math.round(ROOM_W * room.naturalHeight / room.naturalWidth);
    for (const cx of [-ROOM_W, 0, ROOM_W]) blit(g, tinted, 0, 0, tinted.width, tinted.height, cx, FLOOR + ROOM_ART_DROP - dh, ROOM_W, dh);
  }
  drawCandles(g, 3000 + T * 1000, 0, i);
  const heroX = p.heroX + Math.min(Math.max(0, T - p.t + .3), .5) * 40;
  const dead = t >= hitT + .02;
  const monX = p.monX;
  const monY = p.mon === 'dragon' ? FOOT - 30 + Math.sin(T * 1000 / 450) * 5 : FOOT;
  const atk = (strike >= 0 && strike < .6) || (strike2 >= 0 && strike2 < .55);
  const at = strike2 >= 0 ? strike2 : strike;
  // the slime lunges with a squash, the others swing
  let sx = 1, sy = 1, lunge = 0;
  if (p.mon === 'slime' && atk) { const u = clamp(at / .12); sx = lerp(1, .82, Math.sin(u * Math.PI)) + (u >= 1 ? .08 * Math.exp(-(at - .12) * 12) * Math.cos(at * 50) : 0); sy = 2 - sx; lunge = -18 * Math.sin(clamp(at / .25) * Math.PI); }
  g.save(); g.translate(monX + lunge, monY); g.scale(sx, sy); g.translate(-(monX + lunge), -monY);
  drawMon(g, p.mon, atk ? 'slash' : 'idle', atk ? at : T, monX + lunge, monY, { once: atk, fx: p.mon === 'slime' ? null : { rim: { col: p.rim, dx: -1.4, dy: -.6, a: .9 } }, shadow: p.mon !== 'dragon' });
  g.restore();
  if (p.mon === 'dragon' && atk) {
    // breath aimed down at the hero, leaving just before the beat
    burst(g, at - .1, { x: monX - 28, y: monY - 20, n: 70, seed: 5 + i, speed: [180, 420], angle: [Math.PI * .78, Math.PI * .9], life: [.2, .5], size: [2, 5], gy: 80, drag: 1.4, cols: ['#fff3b0', '#ffb03a', '#ff5a1a'], shape: 'dot' });
    drawGlowW(g, monX - 45, monY - 8, 50, 'rgba(255,140,40,1)', .9 * clamp((at - .1) / .05) * (1 - clamp((at - .4) / .2)));
  }
  if (!dead) {
    drawHero(g, p.hero, 'walk', T + i * .3, heroX, FOOT, { fx: { rim: { col: p.rim, dx: 1.2, dy: -.4, a: .6 } } });
  } else {
    // the kill, on the beat: a white pop, gold, a skull
    const d = t - (hitT + .02);
    burst(g, d, { x: heroX, y: FOOT - 24, n: 36, seed: 40 + i, speed: [60, 260], angle: [-Math.PI * .95, -Math.PI * .05], life: [.5, 1.1], size: [2, 4], gy: 520, drag: 1, cols: ['#ffd34d', '#ffe98a', '#e0a020'], add: false, shape: 'sq' });
    burst(g, d, { x: heroX, y: FOOT - 24, n: 24, seed: 50 + i, speed: [120, 360], life: [.15, .4], size: [1, 2], gy: 0, drag: 3, cols: ['#ffffff'], shape: 'spark', streak: .02 });
    if (d < 2 / 60) drawHero(g, p.hero, 'walk', 1, heroX, FOOT, { fx: { tint: '#fff', tintA: 1 } });
    const sk = E.outBack(clamp(d / .15), 2.2);
    pixSkull(g, heroX, FOOT - 34 - sk * 8, 2.1 * sk, clamp(d / .05));
  }
  g.restore();
}

shot({ id: 'monsters', t0: 8.4375, t1: 10.78125,
  draw(g, lt, P, t) {
    const T = FRAME_T;
    // behind the panels: the lair, eyes burning in the dark, pushing in
    g.fillStyle = '#050208'; g.fillRect(0, 0, W, H);
    if (ok(LAIR)) {
      g.save();
      const z = 10.5 + lt * .9;
      g.translate(W / 2, H * .5); g.scale(z, z); g.translate(-92, -104);
      g.imageSmoothingEnabled = false;
      g.drawImage(baked('lair', LAIR.naturalWidth, LAIR.naturalHeight, x => { x.filter = 'brightness(.8) contrast(1.15)'; x.drawImage(LAIR, 0, 0); }), 0, 0);
      g.restore();
      glow(g, W / 2, H * .5, 520, 'rgba(255,110,30,A)', .22 + .08 * Math.sin(t * 9));
    }
    embers(g, t, { n: 60, seed: 61, speed: [30, 120], size: [2, 4], cols: ['#ff9a3a', '#ffcc66'] });
    // the last tesla arc strikes where the first panel's gutter will be, and holds until it lands
    const p0 = PANELS[0], draw0 = clamp(lt / .1), hold = 1 - clamp((t - p0.t) / .06);
    if (hold > 0) lightning(g, p0.x1, -20, p0.x1 - H * TAN15 * draw0, H * draw0, 7 + (Math.floor(t * 30) % 3), { col: '#fff7b0', glow: '#ffb000', lw: 3, depth: 6, alpha: hold });
    // panels: each slides in inside its own slot and lands on its beat
    PANELS.forEach((p, i) => {
      const u = (t - (p.t - 10 / 60)) / (10 / 60);
      if (u < 0) return;
      const ox = p.dir * W * .45 * (1 - E.outCubic(clamp(u))) - p.dir * 22 * Math.exp(-(t - p.t) / .05) * (t >= p.t)
        + (t >= ALLHIT ? shake(t, 14 * kick(t, ALLHIT, .15), 30)[0] : 0);
      g.save();
      panelPath(g, p, 0); g.clip();
      const gr = g.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, p.back[0]); gr.addColorStop(1, p.back[1]);
      g.fillStyle = gr; g.fillRect(-400, 0, W + 800, H);
      g.translate(ox, 0);
      panelScene(g, p, i, t, T);
      g.restore();
      // glowing gutters, only once the panel has landed
      const ga = clamp(u * 2 - 1);
      if (ga > 0) {
        g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = ga;
        g.strokeStyle = '#ffd8a0'; g.lineWidth = 5; g.shadowColor = '#ff9a3a'; g.shadowBlur = 24;
        panelPath(g, p, 0); g.stroke();
        g.restore();
      }
    });
    // 10.31: every monster strikes at once and a hero is blown across the seams
    const fa = t - (ALLHIT + .02);
    if (fa >= 0) {
      const u = clamp(fa / .65), e = E.outCubic(u);
      const x = lerp(200, W + 260, e), y = lerp(760, 320, e) - Math.sin(u * Math.PI) * 60;
      g.save(); g.translate(x, y); g.rotate(u * 2.5);
      g.scale(6.5, 6.5);
      drawHero(g, 'rogue', 'walk', 1, 0, 26, { shadow: false, fx: { rim: { col: '#ffffff', dx: -1, dy: -.5, a: 1 }, flash: [PANELS[0].x1 - 240, PANELS[1].x1 - 240].some(sx => Math.abs(x - sx) < 70) ? .8 : 0 } });
      g.restore();
      burst(g, fa, { x: 360, y: 640, n: 50, seed: 91, speed: [300, 1200], life: [.3, .8], size: [3, 7], gy: 400, drag: 2, cols: ['#fff', '#ffd8a0', '#ff9a3a'], shape: 'spark', streak: .03 });
    }
    tierA(g, 'RAISE MONSTERS', 150, lt - .02, { size: 100 });
  },
  post(lt, P, t) {
    const entering = PANELS.some(p => t >= p.t - 10 / 60 && t < p.t);
    const flying = t >= ALLHIT && t < ALLHIT + .35;
    P.K = entering ? 16 : flying ? 12 : 4; P.shutter = entering ? .6 : flying ? .35 : .5;
    const allhit = t >= ALLHIT ? kick(t, ALLHIT, .1) : 0;
    P.ca = .0006 + .01 * allhit + PANELS.reduce((a, p) => a + (t >= p.t ? .004 * kick(t, p.t, .06) : 0), 0);
    P.flash = [1, .85, .6, .18 * allhit];
    P.bloom = .65;
  },
});

// ---- CHAMPION APPROACHES ----------------------------------------------------
const SMASH = 11.25;
shot({ id: 'champion', t0: 10.78125, t1: 11.71875,
  draw(g, lt, P, t) {
    const tt = hitstop(t, SMASH, 5 / 60), Tt = hitstop(FRAME_T, SMASH, 5 / 60);
    const since = tt - SMASH;
    const K = 3.7 + .35 * E.outCubic(clamp(lt / .47)) + (since >= 0 ? 1.0 * kick(tt, SMASH, .25) : 0);
    const sk = shake(t, since >= 0 ? 24 * Math.exp(-since / .2) : 0, 26);
    camera(g, 1 * ROOM_W + 60 + lt * 12, FLOOR - 96, K, -.02, sk[0], sk[1] * .3);
    const now = 21000 + Tt * 1000;
    const broken = since >= 0;
    corridor(g, now, [{ types: ['frost', 'spike'] }, { types: ['oil', 'flame'], broken }, { types: ['tesla'] }, {}], { throne: false });
    // a normal knight beside him, for scale
    drawHero(g, 'warrior', 'walk', Tt, 1 * ROOM_W - 30 + (Tt - 10.78) * 46, FOOT, { fx: { rim: { col: '#ffd34d', dx: 1.2, a: .5 } } });
    // the champion: stride, then the swing lands exactly on the downbeat (frame 11 on 11.25)
    const cx = 1 * ROOM_W + 40 + Math.min(Tt - 10.78, .47) * 52;
    const aT = Tt - (SMASH - 11 / 24.4);
    g.save();
    drawGlowW(g, cx, FOOT - 44, 70, 'rgba(255,211,77,1)', .35 + .1 * Math.sin(t * 12));
    g.restore();
    if (aT < 0) drawChampion(g, 'walk', Tt, cx, FOOT, { fx: { rim: { col: '#ffd34d', dx: 1.5, dy: -.5, a: .8 } } });
    else {
      // attack frames at 24.4 fps up to the hit, then 0.4x on the hit pose for 0.2 s
      const f = aT < 11 / 24.4 ? Math.floor(aT * 24.4) : aT < 11 / 24.4 + .2 ? 11 : Math.min(13, 11 + Math.floor((aT - 11 / 24.4 - .2) * 20));
      const im = CHAMP.atk[f];
      if (ok(im)) drawCell(g, im, 0, 0, im.naturalWidth, im.naturalHeight, im.naturalWidth / 2, im.naturalHeight - 2 * im.naturalHeight / CHAMP.atkDH, cx, FOOT, CHAMP.atkDH / im.naturalHeight, 1, { rim: { col: '#ffd34d', dx: 1.5, dy: -.5, a: .8 } });
    }
    if (since >= 0) {
      debris(g, since, 1 * ROOM_W + 120, FLOOR - 90, 71, 40, 1.4);
      debris(g, since, 1 * ROOM_W + 170, FLOOR - 140, 72, 26, 1.1);
      dust(g, since, 1 * ROOM_W + 110, FLOOR, 73, 26, 200);
      burst(g, since, { x: 1 * ROOM_W + 120, y: FLOOR - 70, n: 40, seed: 74, speed: [200, 700], life: [.2, .5], size: [1, 2.2], gy: 100, drag: 2, cols: ['#cdbaff', '#ffffff'], shape: 'spark', streak: .03 });
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    // speed lines on the smash
    if (since >= 0 && since < 3 / 60) speedLines(g, t, W * .58, H * .55, 1, { n: 80, inner: 260, seed: 3 });
    // chunks of the real wall fly up and away from him, toward the lens, defocused
    if (since >= 0 && ok(ROOMIMG.empty)) {
      const chunks = baked('wallchunks', 523, 545, x => { x.filter = 'blur(4px)'; x.drawImage(ROOMIMG.empty, 0, 0); });
      const r = rng(19);
      g.save(); g.imageSmoothingEnabled = true;
      for (let i = 0; i < 12; i++) {
        const a = since, ang = -.35 * Math.PI + r() * .6 * Math.PI - .25, sp = 1400 + r() * 1000, sz = 50 + r() * 110;
        const x = W * .7 + Math.cos(ang) * sp * a, y = H * .5 + Math.sin(ang) * sp * a + 900 * a * a;
        const sc = 1 + a * 3;
        g.globalAlpha = .6 * (1 - clamp(a / .35));
        g.save(); g.translate(x, y); g.rotate(a * 8 + i); g.scale(sc, sc);
        g.drawImage(chunks, 60 + r() * 380, 60 + r() * 380, 40, 28, -sz / 2, -sz / 3, sz, sz * .7);
        g.restore();
      }
      g.restore();
    }
    // the red alarm: pulsing vignette on the beat
    const pulseA = .35 + .25 * Math.cos((t - 10.78125) / .46875 * Math.PI * 2);
    g.save(); const vg = g.createRadialGradient(W / 2, H / 2, H * .3, W / 2, H / 2, H);
    vg.addColorStop(0, 'rgba(160,0,0,0)'); vg.addColorStop(1, `rgba(160,0,0,${pulseA})`);
    g.fillStyle = vg; g.fillRect(0, 0, W, H); g.restore();
    // the game's banner, with its subline
    banner(g, 'CHAMPION APPROACHES', 'Aldric the Shieldbearer', 222, lt);
  },
  post(lt, P, t) {
    const since = t - SMASH;
    P.letterbox = LB;                                     // bars snap in with the alarm
    if (since >= 0 && since < 2 / 60) P.flash = [1, .95, .9, .5];
    P.K = since >= 0 && since < 5 / 60 ? 1 : 4;
    P.ca = .0006 + (since >= 0 ? .012 * Math.exp(-since / .09) : 0);
    P.gain = [1.08, .97, .95];
    P.zoomBlur = since >= 5 / 60 && since < .2 ? .05 * (1 - (since - 5 / 60) / .12) : 0;
    P.zbCenter = [.6, .55];
  },
});

// the in-game banner look: gold pixel text on a blood ribbon that slides open
function banner(g, title, sub, y, lt) {
  if (lt < 0) return;
  const u = E.outCubic(clamp(lt / .12));
  g.save();
  g.translate(W / 2, y);
  g.font = F.pix(46);
  const tw = g.measureText(title).width;
  const bw = (tw + 140) * u, bh = 128;
  const gr = g.createLinearGradient(0, -bh / 2, 0, bh / 2);
  gr.addColorStop(0, 'rgba(120,10,14,.94)'); gr.addColorStop(1, 'rgba(40,2,6,.94)');
  g.fillStyle = gr; g.beginPath(); g.moveTo(-bw / 2 - 30, -bh / 2); g.lineTo(bw / 2 + 30, -bh / 2); g.lineTo(bw / 2, 0); g.lineTo(bw / 2 + 30, bh / 2); g.lineTo(-bw / 2 - 30, bh / 2); g.lineTo(-bw / 2, 0); g.closePath(); g.fill();
  g.strokeStyle = '#ffd34d'; g.lineWidth = 3; g.stroke();
  if (u > .6) {
    // a red light sweeps across the ribbon
    const sx = lerp(-bw, bw, clamp((lt - .1) / .35));
    const sg = g.createLinearGradient(sx - 80, 0, sx + 80, 0);
    sg.addColorStop(0, 'rgba(255,90,70,0)'); sg.addColorStop(.5, 'rgba(255,120,90,.45)'); sg.addColorStop(1, 'rgba(255,90,70,0)');
    g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = sg; g.fillRect(-bw / 2, -bh / 2, bw, bh); g.restore();
    g.globalAlpha = clamp((u - .6) / .4);
    strokeText(g, title, 0, -4, { font: F.pix(46), fill: FILL.gold, outline: '#1a0306', outlineW: 12 });
    strokeText(g, sub, 0, 46, { font: F.pix(24), fill: '#ffe2b0', outline: '#1a0306', outlineW: 7 });
  }
  g.restore();
}

// ---- OVERDRIVE: the counterattack, blasting LEFT from the throne ---------------
const NOVA = 11.953125;
const OD_PARTY = [['cleric', 520], ['mage', 580], ['rogue', 640]];
shot({ id: 'overdrive', t0: 11.71875, t1: 12.65625,
  draw(g, lt, P, t) {
    const T = FRAME_T;
    const since = t - NOVA;
    // dolly-zoom on the boss during the charge, then pull wide as the nova rolls left
    const charge = clamp(lt / (NOVA - 11.71875));
    const K = since < 0 ? lerp(2.8, 3.15, E.inCubic(charge)) : lerp(3.15, 2.7, E.outCubic(clamp(since / .5)));
    const sk = shake(t, since >= 0 ? 26 * Math.exp(-since / .25) : 6 * charge, 24);
    camera(g, 650 + (since < 0 ? 40 * charge : 40 - 60 * E.outCubic(clamp(since / .6))), FLOOR - 130, K, sk[2], sk[0], sk[1]);
    const now = 24000 + T * 1000;
    corridor(g, now, [{ types: ['frost', 'spike'] }, { types: ['oil', 'flame'], broken: true }, { types: ['tesla'] }, {}], { throne: 'purple' });
    const bx = 4 * ROOM_W + ROOM_W * .6;
    const casting = since >= -.12 && since < .6;
    demonAura(g, T, bx, FLOOR, 250, BOSS_H, false, 1.3 + charge);
    drawGlowW(g, bx - 40, FLOOR - 95, 140, 'rgba(200,110,255,1)', .5 + 1.2 * charge * (since < 0) + .8 * (since >= 0 ? Math.exp(-since / .2) : 0));
    drawBoss(g, 'azzaroth', casting ? 'attack' : 'idle', casting ? since + .12 : T, bx, FLOOR + 2, BOSS_H, { castMs: 520 });
    demonAura(g, T, bx, FLOOR, 250, BOSS_H, true);
    // particles sucked into the boss's hands during the charge
    if (since < 0) {
      const r = rng(5);
      g.save(); g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 70; i++) {
        const ang = r() * 6.28, d0 = 120 + r() * 260, ph = r();
        const u = ((lt * 2.2 + ph) % 1);
        const d = d0 * (1 - E.inCubic(u));
        g.globalAlpha = u; g.fillStyle = r() < .5 ? '#e7b8ff' : '#ffffff';
        g.fillRect(bx - 50 + Math.cos(ang) * d, FLOOR - 95 + Math.sin(ang) * d * .7, 2.2, 2.2);
      }
      g.restore();
    }
    // the raid: champion leading, the party behind; the nova front erases them
    const front = bx - 60 - Math.max(0, since) * 1400;
    const champX = 700;
    const hitAt = x => NOVA + (bx - 60 - x) / 1400;
    OD_PARTY.forEach(([cls, x], i) => {
      const h = t - hitAt(x);
      if (h < 0) drawHero(g, cls, 'walk', T + i * .2, x, FOOT, {});
      else if (h < 2 / 60) drawHero(g, cls, 'walk', 1, x, FOOT, { fx: { tint: '#fff', tintA: 1 } });
      else {
        burst(g, h, { x, y: FOOT - 24, n: 50, seed: 200 + i, speed: [40, 260], angle: [-Math.PI * 1.1, -Math.PI * .45], life: [.5, 1.1], size: [1.5, 3], gy: 300, drag: 1.3, cols: ['#e7b8ff', '#ffffff', '#b163ff'], add: false, shape: 'sq' });
        burst(g, h - .1, { x, y: FOOT - 20, n: 20, seed: 220 + i, speed: [50, 200], angle: [-Math.PI * .9, -Math.PI * .1], life: [.6, 1.1], size: [2, 3.5], gy: 480, drag: 1, cols: ['#ffd34d', '#ffe98a', '#e0a020'], add: false, shape: 'sq' });
        const sk2 = E.outBack(clamp((h - .15) / .15), 2.2);
        if (h > .15) pixSkull(g, x, FOOT - 36 - sk2 * 8, 2 * sk2, clamp((h - .15) / .05));
      }
    });
    const ch = t - hitAt(champX);
    if (ch < 0) drawChampion(g, 'walk', T, champX, FOOT, {});
    else if (ch < 2 / 60) drawChampion(g, 'walk', T, champX, FOOT, { fx: { tint: '#fff', tintA: 1 } });
    else {
      drawChampion(g, 'death', (ch - 2 / 60) * 1.5, champX, FOOT, { fx: { tint: '#b163ff', tintA: Math.round(5 * .25 * Math.exp(-ch / .3)) / 5 } });
      burst(g, ch - .45, { x: champX, y: FOOT - 20, n: 30, seed: 230, speed: [50, 220], angle: [-Math.PI * .9, -Math.PI * .1], life: [.6, 1.1], size: [2, 4], gy: 480, drag: 1, cols: ['#ffd34d', '#ffe98a', '#e0a020'], add: false, shape: 'sq' });
    }
    // the nova: an expanding ring of arcane fire centred on the boss's hands
    if (since >= 0) {
      const R = Math.max(1, bx - 60 - front);
      g.save(); g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 1 - clamp((since - .3) / .35);
      const rg = g.createRadialGradient(bx - 60, FLOOR - 90, R * .55, bx - 60, FLOOR - 90, R + 30);
      rg.addColorStop(0, 'rgba(120,40,200,0)'); rg.addColorStop(.7, 'rgba(160,70,240,.35)'); rg.addColorStop(.93, 'rgba(250,230,255,.95)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = rg; g.beginPath(); g.arc(bx - 60, FLOOR - 90, R + 30, 0, 7); g.fill();
      g.restore();
      burst(g, since, { x: bx - 60, y: FLOOR - 90, n: 120, seed: 210, speed: [500, 1500], angle: [Math.PI * .6, Math.PI * 1.4], life: [.3, .8], size: [1.2, 3], gy: 0, drag: 1.2, cols: ['#ffffff', '#e7b8ff', '#b163ff'], shape: 'spark', streak: .04 });
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (since < 0) wash(g, '#000', .4 * charge);
    tierB(g, 'OVERDRIVE!', 1330, 330, since, '#e7b8ff', { size: 64, dur: .6, fill: FILL.arcane, glow: '#b163ff', rot: -.05 });
    tierA(g, 'BURY THE HEROES.', 190, since - .05, { size: 100, fill: FILL.blood });
  },
  post(lt, P, t) {
    const since = t - NOVA;
    P.K = since >= 0 && since < .3 ? 8 : 4; P.shutter = since >= 0 && since < .3 ? 1 : .5;
    if (since >= 0) {
      P.shocks = [{ x: .78, y: .52, r: .02 + E.outCubic(clamp(since / .6)) * 1.0, w: .12, a: .7 * (1 - clamp(since / .6)) }];
      P.ca = .0006 + .012 * Math.exp(-since / .1);
      P.flash = [.85, .6, 1, .32 * Math.exp(-since / .06)];
      P.zoomBlur = .05 * Math.exp(-since / .1); P.zbCenter = [.78, .52];
    }
    P.bloom = .85; P.gain = [1.02, .95, 1.1];
    P.letterbox = since < 0 ? LB : 0;                      // the nova blows the bars open (as THE FINAL BOSS did)
  },
});

// ---- the stop-down: slow motion on the fallen champion, then black ------------
shot({ id: 'stopdown', t0: 12.65625, t1: 13.125,
  draw(g, lt, P, t) {
    if (t >= 13.0625) return;                               // four frames of pure black
    const st = lt * .25;                                    // 0.25x
    const K = 5.4 + lt * .7;
    camera(g, 700, FLOOR - 62, K, .01);
    const now = 26000 + st * 1000;
    corridor(g, now, [{ types: ['frost', 'spike'] }, { types: ['oil', 'flame'], broken: true }, { types: ['tesla'] }, {}], { throne: 'purple' });
    drawChampion(g, 'death', 1.2 + st, 700, FOOT, {});
    pixSkull(g, 700, FOOT - 46, 2.2, 1);
    embers(g, st * 4, { box: [560, FLOOR - 200, 280, 200], n: 40, seed: 88, speed: [10, 40], size: [1, 2.4], cols: ['#b985ff', '#e7b8ff'] });
    g.setTransform(1, 0, 0, 1, 0, 0);
    wash(g, '#000', lt / .4 * .5);
    tierA(g, 'BURY THE HEROES.', 190, 1 + lt, { size: 100, fill: FILL.blood, until: 1 + (13.0 - 12.65625) });   // carried over from the nova
  },
  post(lt, P) {
    P.saturation = .3; P.K = 1; P.vignette = .7; P.exposure = .9;
  },
});
