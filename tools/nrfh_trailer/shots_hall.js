// Act I-II: one continuous camera through one world (0.9375 - 5.625).
//   march    0.94  the party walks the rain-soaked parapet outside the dungeon
//   whip     1.875 whip-pan right over the EMPTY slots to the throne (lands 2.11)
//   boss     2.34 YOU ARE / 2.81 THE FINAL BOSS (letterbox snaps open)
//   pullback 3.75 the camera pulls back until the whole corridor is in frame
//   build    3.75 BUILD YOUR DUNGEON; cards fly in, rooms slam on 4.22 4.69 5.16 5.39
//   dive     5.50 the camera dives into room 1 (zoom-through into the frost shot)
'use strict';
const DEMON_HI_AX = 526.5, DEMON_HI_DX = 0;              // hi-res Azzaroth overlays the in-game idle exactly
const BX = 4 * ROOM_W + ROOM_W * .6;                       // boss x (throne cell 4)
const SLAMS = [4.21875, 4.6875, 5.15625, 5.390625];
const BUILD = ['frost', 'spike', 'flame', 'tesla'];
const CARDS = [
  { id: 'frost', name: 'FROST TRAP', icon: img('icons/frost.png'), col: '#5ec8ff' },
  { id: 'spike', name: 'SPIKE PIT', icon: img('icons/spike.png'), col: '#c8ccd8' },
  { id: 'flame', name: 'FLAME JET', icon: img('icons/flame.png'), col: '#ff7a2e' },
  { id: 'tesla', name: 'TESLA COIL', icon: img('icons/tesla.png'), col: '#ffe14d' },
];
const HALL_PARTY = [['warrior', 0], ['rogue', -46], ['mage', -92], ['cleric', -138]];
const MARCH_T0 = .9375;
const leadX = t => -300 + (t - MARCH_T0) * 52;

function hallCam(t) {
  // march: follow at ~85% of walking speed so the party creeps forward in frame
  const mc = tt => ({ x: leadX(MARCH_T0) - 62 + (tt - MARCH_T0) * 44, y: FLOOR - 52, k: 5.1 - (tt - MARCH_T0) * .15, r: 0 });
  const bossCam = tt => {
    const u = E.outCubic(clamp((tt - 2.11) / 1.64));
    const k = lerp(3.3, 3.62, u);
    return { x: BX - 42 / k, y: FLOOR + 2 - (395 / k), k, r: 0 };
  };
  const wideCam = tt => ({ x: 492 - (tt - 4.15) * 9, y: 262, k: 1.78, r: 0 });
  if (t < 1.875) return mc(t);
  if (t < 2.11) {                                  // whip, with a small overshoot on landing
    const u = (t - 1.875) / (2.11 - 1.875);
    const a = mc(1.875), b = bossCam(2.11);
    const e = E.outBack(E.inOutCubic(u), 1.2);
    return { x: lerp(a.x, b.x, e), y: lerp(a.y, b.y, E.inOutCubic(u)), k: a.k * Math.pow(b.k / a.k, E.inOutCubic(u)), r: Math.sin(u * Math.PI) * .045 };
  }
  if (t < 3.75) return bossCam(t);
  if (t < 4.15) {
    const u = E.inOutCubic((t - 3.75) / .4);
    const a = bossCam(3.75), b = wideCam(4.15);
    return { x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u), k: a.k * Math.pow(b.k / a.k, u), r: 0 };
  }
  if (t < 5.5) return wideCam(t);
  const u = E.inExpo(clamp((t - 5.5) / .125));   // dive into room 1
  const a = wideCam(5.5);
  return { x: lerp(a.x, 96, u), y: lerp(a.y, FLOOR - 70, u), k: a.k * Math.pow(5.2 / a.k, u), r: 0 };
}

// an empty slot: the room's ghost, dim and cold, waiting to be built
function ghostSlot(g, cell, a, lines = 1) {
  const im = ROOMIMG.empty; if (!ok(im)) return;
  const x0 = cell * ROOM_W, dh = ROOM_W * im.naturalHeight / im.naturalWidth;
  g.save();
  g.globalAlpha *= a;
  const gh = baked('ghostroom', im.naturalWidth, im.naturalHeight, x => { x.filter = 'grayscale(1) brightness(.35)'; x.drawImage(im, 0, 0); });
  blit(g, gh, 0, 0, gh.width, gh.height, x0, FLOOR + ROOM_ART_DROP - dh, ROOM_W, dh);
  if (lines > 0) {
    g.globalAlpha *= lines;
    g.fillStyle = 'rgba(120,60,200,.10)'; g.fillRect(x0 + 8, FLOOR + ROOM_ART_DROP - dh + 10, ROOM_W - 16, dh - 22);
    g.strokeStyle = 'rgba(200,150,255,.85)'; g.lineWidth = 2.4; g.setLineDash([9, 7]);
    g.strokeRect(x0 + 8, FLOOR + ROOM_ART_DROP - dh + 10, ROOM_W - 16, dh - 22);
  }
  g.setLineDash([]);
  g.restore();
}

// the bone-filled undercroft from the key art, under the rooms (dim, it is set dressing)
const KEY_ART = img('title/bg.png');
function catacombs(g) {
  g.fillStyle = '#07040c'; g.fillRect(-20, FLOOR + 8, 1100, 900);
  if (!ok(KEY_ART)) return;
  g.save();
  // src rows 790..1025 hold the skulls; tile it twice across the corridor
  const strip = baked('catacombs', 830, 235, x => { x.filter = 'brightness(.42) saturate(.8)'; x.drawImage(KEY_ART, 330, 790, 830, 235, 0, 0, 830, 235); });
  for (let k = 0; k < 2; k++) blit(g, strip, 0, 0, 830, 235, -20 + k * 560, FLOOR + 6, 560, 159);
  const fg = g.createLinearGradient(0, FLOOR + 6, 0, FLOOR + 170);
  fg.addColorStop(0, 'rgba(7,4,12,.2)'); fg.addColorStop(1, 'rgba(7,4,12,1)');
  g.fillStyle = fg; g.fillRect(-20, FLOOR + 6, 1100, 170);
  g.restore();
}

function drawCard(g, c, x, y, s, rot, a, glowA = 0) {
  const w = 172, h = 236;
  g.save();
  g.translate(x, y); g.rotate(rot); g.scale(s, s);
  g.globalAlpha *= a;
  if (glowA > 0) { g.save(); g.shadowColor = c.col; g.shadowBlur = 40; g.fillStyle = c.col; g.globalAlpha *= glowA; g.beginPath(); g.roundRect(-w / 2, -h / 2, w, h, 14); g.fill(); g.restore(); }
  const gr = g.createLinearGradient(0, -h / 2, 0, h / 2);
  gr.addColorStop(0, '#3a2a5e'); gr.addColorStop(1, '#170f2c');
  g.fillStyle = gr; g.strokeStyle = '#e8c07a'; g.lineWidth = 5;
  g.beginPath(); g.roundRect(-w / 2, -h / 2, w, h, 14); g.fill(); g.stroke();
  g.strokeStyle = c.col; g.lineWidth = 2; g.beginPath(); g.roundRect(-w / 2 + 8, -h / 2 + 8, w - 16, h - 16, 9); g.stroke();
  if (ok(c.icon)) { g.imageSmoothingEnabled = true; g.drawImage(c.icon, -66, -h / 2 + 20, 132, 132); }
  g.font = F.pix(15); g.textAlign = 'center';
  g.lineWidth = 5; g.strokeStyle = '#0a0612'; g.lineJoin = 'round';
  const words = c.name.split(' ');
  words.forEach((wd, k) => { g.strokeText(wd, 0, h / 2 - 50 + k * 24); g.fillStyle = '#fff3d0'; g.fillText(wd, 0, h / 2 - 50 + k * 24); });
  g.restore();
}

shot({ id: 'hall', t0: MARCH_T0, t1: 5.625,
  draw(g, lt, P, t) {
    const T = FRAME_T;                             // animation clock (frame-centred)
    const now = 4000 + T * 1000;
    const cam = hallCam(t);
    // shake: boss hit, room slams (small, downward)
    let sk = shake(t, 20 * kick(t, 2.8125, .2) * (t >= 2.8125), 26);
    SLAMS.forEach(s => { if (t >= s) sk[1] += 5 * Math.exp(-(t - s) / .06) * Math.cos((t - s) * 70); });
    camera(g, cam.x, cam.y, cam.k, cam.r + sk[2], sk[0], sk[1]);

    // ---- world
    const rooms = BUILD.map((type, i) => {
      const s = SLAMS[i];
      if (t < s - 8 / 60) return null;
      const u = clamp((t - (s - 8 / 60)) / (8 / 60));
      return { types: type === 'flame' ? ['oil', 'flame'] : [type], drop: E.inQuad(u), e: t >= s ? (t - s - .02) * 1000 : null };
    });
    g.fillStyle = '#0c0916'; g.fillRect(-3000, -1000, 7000, 3000);
    drawArena(g, 5 * ROOM_W + 20 - 150);
    if (t < 2.25) {
      // outside the walls the march happens under the storm half of the panorama
      g.save(); g.beginPath(); g.rect(-3000, -1000, 2985, 3000); g.clip();
      drawArena(g, 5 * ROOM_W + 20 - 150 - 900);
      g.fillStyle = 'rgba(12,6,28,.42)'; g.fillRect(-3000, -1000, 2985, 3000);
      g.restore();
    }
    // floor and parapet shade inside the dungeon only (outside is the painted parapet)
    catacombs(g);
    drawGaps(g, 4);
    const front = [];
    for (let i = 0; i < 4; i++) {
      if (!rooms[i] || rooms[i].drop < 1) ghostSlot(g, i, (rooms[i] ? 1 - rooms[i].drop : 1), t > 3.7 ? 1 : 0);
      const r = rooms[i]; if (!r) continue;
      g.save();
      // drop from above with gravity, land on the beat, 3% squash for 2 frames
      const land = t - SLAMS[i];
      g.translate(0, -(1 - r.drop) * 150);
      if (land >= 0 && land < 2 / 60) { g.translate(i * ROOM_W + 100, FLOOR); g.scale(1.02, .97); g.translate(-(i * ROOM_W + 100), -FLOOR); }
      drawRoom(g, now, i, { types: r.types, e: r.e, glow: land >= 0 ? 1 : 0 }, front);
      if (land >= 0) { const f = Math.exp(-land / .14); g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = .24 * f; g.fillStyle = CARDS[i].col; g.fillRect(i * ROOM_W + 6, 138, ROOM_W - 12, FLOOR - 134); g.restore(); }
      g.restore();
    }
    drawThrone(g, 4, 'purple');
    // the throne sinks into shadow so the horned silhouette separates
    g.save(); g.globalAlpha = 1 - clamp((t - 3.75) / .4); g.fillStyle = 'rgba(8,3,14,.6)'; g.fillRect(4 * ROOM_W - 20, 60, 260, FLOOR - 48); g.restore();
    // boss: red rim light + back glow that feed the god rays
    const heat = clamp((t - 2.0) / .5);
    if (heat > 0) {
      drawGlowW(g, BX - 26, FLOOR - 105, 185, 'rgba(255,50,30,1)', .8 * heat + .8 * kick(t, 2.8125, .3) * (t >= 2.8125));
      drawGlowW(g, BX - 20, FLOOR - 150, 80, 'rgba(255,190,150,1)', .55 * heat);
      drawGlowW(g, BX - 26, FLOOR - 4, 110, 'rgba(190,90,255,1)', .7 * heat);
    }
    demonAura(g, T, BX, FLOOR, 250, BOSS_H, false, 1.15);
    const atkT = t - 2.8125;
    const rim = { col: '#ff6a3a', dx: -2.6, dy: -.8, a: heat };
    if (atkT >= 0 && atkT < .62) {
      drawBoss(g, 'azzaroth', 'attack', Math.max(0, T - 2.8125), BX, FLOOR + 2, BOSS_H, { castMs: 560, fx: { rim } });
    } else {
      const f = bossFrameIdx(4, T);
      const im = DEMON_HI[f];
      if (ok(im)) drawCell(g, im, 0, 0, im.naturalWidth, im.naturalHeight, DEMON_HI_AX, im.naturalHeight, BX + DEMON_HI_DX, FLOOR + 2, BOSS_H / 800, 1, { rim });
    }
    demonAura(g, T, BX, FLOOR, 250, BOSS_H, true);
    if (atkT >= 0) burst(g, atkT, { x: BX - 90, y: FLOOR - 92, n: 80, seed: 31, speed: [150, 620], angle: [Math.PI * .55, Math.PI * 1.45], life: [.4, 1], size: [1.5, 4], gy: -40, drag: 2.4, cols: ['#e7b8ff', '#b163ff', '#ffffff', '#ff7ad9'], shape: 'spark', streak: .04 });

    // the party: outside on the parapet, then back at the dungeon mouth for the build
    const partyAt = (x0, tt) => HALL_PARTY.forEach(([cls, off], i) => {
      const x = x0 + off;
      drawHero(g, cls, 'walk', tt + i * .19, x, FOOT, { fx: { rim: { col: '#cbb8ff', dx: 1.4, dy: -.5, a: .7 } } });
      const step = (tt + i * .19) % .36;
      dust(g, step, x - 6, FOOT, 50 + i * 7 + Math.floor((tt + i * .19) / .36), 4, 30, .28, .45);
    });
    if (t < 2.2) partyAt(leadX(T), T);
    if (t >= 5.0) partyAt(28 + (T - 5.0) * 52, T);
    // tesla preview arcs on the landing
    if (rooms[3] && t >= SLAMS[3] && t < SLAMS[3] + .2) {
      bolt(g, 3 * ROOM_W + 100, FLOOR - 50, 3 * ROOM_W + 30, FLOOR - 20, 7 + Math.floor(t * 30), '#fff34d', 2, 6, 14);
      bolt(g, 3 * ROOM_W + 100, FLOOR - 50, 3 * ROOM_W + 175, FLOOR - 26, 9 + Math.floor(t * 30), '#fff34d', 2, 6, 14);
    }
    // slam dust plumes
    SLAMS.forEach((s, i) => { if (t >= s) { dust(g, t - s, i * ROOM_W + 60, FLOOR, 90 + i, 16, 150); dust(g, t - s, i * ROOM_W + 140, FLOOR, 95 + i, 16, 150); } });
    flush(front);

    // ---- screen space
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (t < 2.2) rain(g, t, { n: 150, seed: 5, speed: 2600, angle: .2, len: 70, col: 'rgba(190,175,255,.26)', lw: 2, alpha: 1 - clamp((t - 1.875) / .3) });
    // foreground pillar sweeping past the lens during the march (depth)
    if (t < 1.875) {
      const px = lerp(W + 200, -520, E.inOutCubic(clamp(lt / .9375)));
      const pg = g.createLinearGradient(px - 30, 0, px + 260, 0);
      pg.addColorStop(0, 'rgba(6,3,11,0)'); pg.addColorStop(.12, '#06030b'); pg.addColorStop(.88, '#06030b'); pg.addColorStop(1, 'rgba(6,3,11,0)');
      g.save(); g.fillStyle = pg; g.fillRect(px - 30, -50, 290, H + 100); g.restore();
    }
    // cards: dealt at 3.75, each flies to its slot and becomes the room
    for (let i = 0; i < 4; i++) {
      const c = CARDS[i];
      const deal = clamp((t - 3.75 - i * .045) / .22);
      if (deal <= 0) continue;
      const fly0 = SLAMS[i] - 8 / 60 - 10 / 60, fly1 = SLAMS[i] - 8 / 60;
      const hx = W / 2 + (i - 1.5) * 205, hy = 830 + Math.abs(i - 1.5) * 16, hr = (i - 1.5) * .07;
      if (t < fly0) {
        const e = E.outBack(deal, 1.4);
        drawCard(g, c, lerp(W / 2, hx, e), lerp(H + 200, hy, e), 1, hr * e, 1, .25 + .2 * Math.sin(t * 8 + i));
      } else if (t < fly1 + 3 / 60) {
        // arc into the room (screen position of the room centre) with ghost trails
        const cam2 = hallCam(t);
        const rx = W / 2 + ((i * ROOM_W + 100) - cam2.x) * cam2.k, ry = H / 2 + ((FLOOR - 110) - cam2.y) * cam2.k;
        for (let gh = 4; gh >= 0; gh--) {
          const u = clamp((t - gh * .012 - fly0) / (fly1 - fly0));
          const e = E.inCubic(u);
          const x = lerp(hx, rx, e), y = lerp(hy, ry, e) - Math.sin(u * Math.PI) * 160;
          drawCard(g, c, x, y, lerp(1, .35, e), lerp(hr, 0, e) + u * 1.2, (gh ? .3 : 1) * (1 - clamp((t - fly1) / (3 / 60))), gh ? 0 : .8);
        }
      }
    }
    // captions
    if (t < 1.9) {
      tierA(g, 'THE HEROES', 232, t - .02, { until: 1.875 - .02 });
      tierA(g, 'ARE COMING', 348, t - MARCH_T0, { until: 1.875 - MARCH_T0 - .02 });
    }
    if (t < 3.8) {
      tierA(g, 'YOU ARE', 196, t - 2.34375, { size: 76, until: 3.75 - 2.34375 - .05 });
      tierA(g, 'THE FINAL BOSS', 316, t - 2.8125, { size: 120, fill: FILL.blood, from: 2.2, until: 3.75 - 2.8125 - .05 });
    }
    tierA(g, 'BUILD YOUR DUNGEON', 180, t - 3.75, { size: 100, until: 5.5 - 3.75 });
  },
  post(lt, P, t) {
    const moving = (t >= 1.875 - .02 && t < 2.13) || (t >= 3.75 && t < 4.15) || t >= 5.48;
    P.K = moving ? 8 : 4; P.shutter = moving ? 1 : .5;
    if (t >= 1.875 && t < 2.11) { P.zoomBlur = .045 * Math.sin((t - 1.875) / .235 * Math.PI); P.zbCenter = [.6, .5]; }
    if (t >= 5.5) { P.zoomBlur = .12 * E.inQuad(clamp((t - 5.5) / .125)); P.zbCenter = [.5 - (492 - 96) * 0 / W, .5]; }
    P.letterbox = t < 2.8125 ? LB : 0;
    const hit = t >= 2.8125 ? kick(t, 2.8125, .09) : 0;
    P.ca = .0006 + .009 * hit;
    P.flash = [1, .55, .5, .3 * hit];
    if (t >= 2.8125 && t < 3.4) P.shocks = [{ x: .52, y: .62, r: .02 + E.outCubic(clamp((t - 2.8125) / .5)) * .35, w: .025, a: .9 * (1 - clamp((t - 2.8125) / .5)) }];
    const heat = clamp((t - 2.0) / .5) * (t < 3.9 ? 1 : 1 - clamp((t - 3.9) / .3));
    if (heat > 0) { P.rays = .8 * heat; P.raysPos = [.5, .55]; P.raysDecay = .955; }
    P.vignette = .45;
    // the whole build reads a touch brighter
    if (t > 4.0) P.exposure = 1.05;
  },
});
