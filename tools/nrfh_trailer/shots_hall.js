// Act I-II: one continuous camera through one world (0.9375 - 5.625).
//   march    0.94  the party walks the rain-soaked parapet outside the dungeon
//   whip     1.875 a pillar wipes, the camera whips right over the EMPTY slots to the throne
//   boss     2.34 YOU ARE / 2.81 THE FINAL BOSS (letterbox snaps open); 3.28 six-boss flicker
//   pullback 3.75 the camera pulls back until the whole corridor is in frame
//   build    3.75 BUILD YOUR DUNGEON; cards fly in: frost room 4.22, spikes STACK into it 4.69,
//            oil + flame room 5.16, tesla room 5.39; the party walks in from the left
//   dive     5.45 the camera dives into the frost room (zoom-through into the frost shot)
'use strict';
const DEMON_HI_AX = 526.5;                                 // hi-res Azzaroth overlays the in-game idle exactly
const CELLS = 3;                                           // built rooms; the throne is cell 3
const BX = CELLS * ROOM_W + ROOM_W * .6;                   // boss x
const ARENA_R = 870;                                       // the panorama's right edge (world x)
const SLAMS = [4.21875, 4.6875, 5.15625, 5.390625];
const CARDS = [
  { id: 'frost', name: 'FROST TRAP', icon: img('icons/frost.png'), col: '#5ec8ff', cell: 0 },
  { id: 'spike', name: 'SPIKE PIT', icon: img('icons/spike.png'), col: '#c8ccd8', cell: 0 },    // stacks into the frost room
  { id: 'flame', name: 'FLAME JET', icon: img('icons/flame.png'), col: '#ff7a2e', cell: 1 },
  { id: 'tesla', name: 'TESLA COIL', icon: img('icons/tesla.png'), col: '#ffe14d', cell: 2 },
];
const ROOM_SLAM = [SLAMS[0], SLAMS[2], SLAMS[3]];          // when each cell's room lands
const ROOM_CARD = [0, 2, 3];                               // which card built each cell
const BOSS_FLICKER = ['ignar', 'gormauth', 'karnak', 'mortis', 'thornheart'];
const FLICK0 = 3.28125;
const HALL_PARTY = [['warrior', 0], ['rogue', -46], ['mage', -92], ['cleric', -138]];
const MARCH_T0 = .9375;
const leadX = t => -300 + (t - MARCH_T0) * 52;
const ENTER_T = 4.7, ENTER_V = 110;                        // the party walks in during the build

function bossCam(tt) {
  const u = E.outCubic(clamp((tt - 2.11) / 1.64));
  const k = lerp(3.3, 3.62, u);
  return { x: BX - 380 / k, y: FLOOR + 2 - 395 / k, k, r: 0 };   // boss on the right third, feet low
}
const WIDE = { x: 410, y: 238, k: 2.15 };
function hallCam(t) {
  const mc = tt => ({ x: leadX(MARCH_T0) - 62 + (tt - MARCH_T0) * 44, y: FLOOR - 52, k: 5.1 - (tt - MARCH_T0) * .15, r: 0 });
  const wideCam = tt => ({ x: WIDE.x - (tt - 4.15) * 9, y: WIDE.y, k: WIDE.k, r: 0 });
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
  if (t < 5.45) return wideCam(t);
  const u = E.inOutCubic(clamp((t - 5.45) / .175));   // dive into the frost room
  const a = wideCam(5.45);
  return { x: lerp(a.x, 96, u), y: lerp(a.y, FLOOR - 70, u), k: a.k * Math.pow(5.4 / a.k, u), r: 0 };
}
// screen position of a world point under the hall camera at time t
function hallToScreen(t, wx, wy) { const c = hallCam(t); return [W / 2 + (wx - c.x) * c.k, H / 2 + (wy - c.y) * c.k]; }

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
  g.restore();
}

// the bone-filled undercroft from the key art, under the rooms (set dressing)
const KEY_ART = img('title/bg.png');
function catacombs(g) {
  g.fillStyle = '#07040c'; g.fillRect(-3000, FLOOR + 8, 7000, 900);
  if (!ok(KEY_ART)) return;
  g.save();
  const strip = baked('catacombs', 830, 235, x => { x.filter = 'brightness(1.5) saturate(.9)'; x.drawImage(KEY_ART, 330, 790, 830, 235, 0, 0, 830, 235); });
  for (let k = 0; k < 4; k++) blit(g, strip, 0, 0, 830, 235, -600 + k * 560, FLOOR + 6, 560, 159);
  const fg = g.createLinearGradient(0, FLOOR + 60, 0, FLOOR + 260);
  fg.addColorStop(0, 'rgba(7,4,12,0)'); fg.addColorStop(1, 'rgba(7,4,12,.55)');
  g.fillStyle = fg; g.fillRect(-3000, FLOOR + 6, 7000, 900);
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
  if (ok(c.icon)) { g.imageSmoothingEnabled = true; g.drawImage(c.icon, -56, -h / 2 + 16, 112, 112); }
  g.font = F.pix(26); g.textAlign = 'center';
  g.lineWidth = 7; g.strokeStyle = '#0a0612'; g.lineJoin = 'round';
  c.name.split(' ').forEach((wd, k) => { const yy = h / 2 - 66 + k * 34; g.strokeText(wd, 0, yy); g.fillStyle = '#fff3d0'; g.fillText(wd, 0, yy); });
  g.restore();
}

shot({ id: 'hall', t0: MARCH_T0, t1: 5.625,
  draw(g, lt, P, t) {
    const T = FRAME_T;                             // animation clock (frame-centred)
    const now = 4000 + T * 1000;
    const cam = hallCam(t);
    let sk = shake(t, 20 * kick(t, 2.8125, .2) * (t >= 2.8125), 26);
    SLAMS.forEach(s => { if (t >= s) sk[1] += 5 * Math.exp(-(t - s) / .06) * Math.cos((t - s) * 70); });
    camera(g, cam.x, cam.y, cam.k, cam.r + sk[2], sk[0], sk[1]);

    // ---- world
    g.fillStyle = '#0c0916'; g.fillRect(-3000, -1000, 7000, 3000);
    drawArena(g, ARENA_R);
    g.save(); g.translate(2 * ARENA_R, 0); g.scale(-1, 1); drawArena(g, ARENA_R); g.restore();   // mirrored: the storm continues past the throne
    if (t < 2.25) {
      // outside the walls the march happens under the storm half of the panorama
      g.save(); g.beginPath(); g.rect(-3000, -1000, 2985, 3000); g.clip();
      drawArena(g, ARENA_R - 900);
      g.fillStyle = 'rgba(12,6,28,.42)'; g.fillRect(-3000, -1000, 2985, 3000);
      g.restore();
    }
    catacombs(g);
    drawGaps(g, CELLS);
    const front = [];
    for (let i = 0; i < CELLS; i++) {
      const s = ROOM_SLAM[i];
      const drop = t < s - 8 / 60 ? 0 : E.inQuad(clamp((t - (s - 8 / 60)) / (8 / 60)));
      if (drop < 1) ghostSlot(g, i, 1 - drop, t > 3.7 ? 1 : 0);
      if (drop <= 0) continue;
      const land = t - s;
      let types = [['frost'], ['oil', 'flame'], ['tesla']][i], e = land >= 0 ? (land - .02) * 1000 : null;
      if (i === 0 && t >= SLAMS[1]) { types = ['frost', 'spike']; e = (t - SLAMS[1] - .02) * 1000; }   // both fire on the stack
      g.save();
      g.translate(0, -(1 - drop) * 150);
      if (land >= 0 && land < 2 / 60) { g.translate(i * ROOM_W + 100, FLOOR); g.scale(1.02, .97); g.translate(-(i * ROOM_W + 100), -FLOOR); }
      drawRoom(g, now, i, { types, e, glow: land >= 0 ? 1 : 0 }, front);
      // landing / stacking flash, in the card's colour
      const lf = land >= 0 ? Math.exp(-land / .07) * .16 : 0;
      const sf = i === 0 && t >= SLAMS[1] ? Math.exp(-(t - SLAMS[1]) / .07) * .2 : 0;
      const fa = Math.max(lf, sf);
      if (fa > .01) drawGlowW(g, i * ROOM_W + 100, FLOOR - 40, 140, CARDS[sf > lf ? 1 : ROOM_CARD[i]].col, fa * 4.5);
      g.restore();
    }
    // throne room, and a darker mirrored chamber beyond it
    drawThrone(g, CELLS, 'purple');
    if (ok(ROOMIMG.throne_purple)) {
      const im = ROOMIMG.throne_purple, tw = ROOM_W * BOSS_ROOM_SCALE, th = tw * im.naturalHeight / im.naturalWidth, x1 = CELLS * ROOM_W + ROOM_W * .5 + tw / 2;
      g.save(); g.translate(2 * x1, 0); g.scale(-1, 1); blitAll(g, im, x1, FLOOR + ROOM_ART_DROP - th, tw, th); g.restore();
      g.save(); g.fillStyle = 'rgba(6,3,12,.72)'; g.fillRect(x1, 0, 600, FLOOR + 40); g.restore();
    }
    // the throne sinks into shadow so the horned silhouette separates
    g.save(); g.globalAlpha = 1 - clamp((t - 3.75) / .4); g.fillStyle = 'rgba(8,3,14,.6)'; g.fillRect(CELLS * ROOM_W - 20, 60, 260, FLOOR - 48); g.restore();
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
    const flick = t >= FLICK0 && t < FLICK0 + 10 / 60 ? Math.floor((t - FLICK0) * 30) : -1;
    if (flick >= 0) {
      // six bosses to choose from: the throne flickers through the other five
      const fr = Math.floor((t - FLICK0) * 60) % 2 === 0;
      drawBoss(g, BOSS_FLICKER[flick], 'idle', T, BX, FLOOR + 2, BOSS_H, { fx: { rim, tint: '#ffffff', tintA: fr ? .55 : 0 } });
    } else {
      // the hi-res Azzaroth throughout; the strike is a punch-scale and a lunge, not a sprite swap
      const f = bossFrameIdx(4, T), im = DEMON_HI[f];
      const punch = atkT >= 0 ? Math.exp(-atkT / .12) : 0;
      const lunge = atkT >= 0 ? -8 * Math.sin(clamp(atkT / .25) * Math.PI) : 0;
      if (ok(im)) drawCell(g, im, 0, 0, im.naturalWidth, im.naturalHeight, DEMON_HI_AX, im.naturalHeight, BX + lunge, FLOOR + 2, BOSS_H / 800 * (1 + .07 * punch), 1, { rim, flash: atkT >= 0 && atkT < .05 ? .5 : 0 });
    }
    demonAura(g, T, BX, FLOOR, 250, BOSS_H, true);
    if (atkT >= 0) {
      burst(g, atkT, { x: BX - 70, y: FLOOR - 92, n: 90, seed: 31, speed: [150, 620], angle: [Math.PI * .55, Math.PI * 1.45], life: [.4, 1], size: [1.5, 4], gy: -40, drag: 2.4, cols: ['#e7b8ff', '#b163ff', '#ffffff', '#ff7ad9'], shape: 'spark', streak: .04 });
      drawGlowW(g, BX - 70, FLOOR - 92, 90, 'rgba(210,120,255,1)', 1.4 * Math.exp(-atkT / .15));
    }

    // the party: outside on the parapet, then walking in at the dungeon mouth during the build
    const partyAt = (x0, tt, sp = 1) => HALL_PARTY.forEach(([cls, off], i) => {
      const x = x0 + off;
      drawHero(g, cls, 'walk', (tt + i * .19) * sp, x, FOOT, { fx: { rim: { col: '#cbb8ff', dx: 1.4, dy: -.5, a: .7 } } });
      const step = ((tt + i * .19) * sp) % .36;
      dust(g, step, x - 6, FOOT, 50 + i * 7 + Math.floor((tt + i * .19) * sp / .36), 4, 30, .28, .45);
    });
    if (t < 2.2) partyAt(leadX(T), T);
    if (t >= ENTER_T) partyAt(-60 + (T - ENTER_T) * ENTER_V, T, 2);
    // the path they take: gold dashes flowing from the door to the throne
    const pa = clamp((t - 5.1) / .1) * (1 - clamp((t - 5.45) / .1));
    if (pa > 0) {
      g.save(); g.globalAlpha = .7 * pa; g.strokeStyle = '#ffd07a'; g.lineWidth = 3; g.setLineDash([10, 9]); g.lineDashOffset = -t * 120;
      g.shadowColor = '#ffb030'; g.shadowBlur = 8;
      g.beginPath(); g.moveTo(-20, FOOT + 8); g.lineTo(BX - 60, FOOT + 8); g.stroke();
      g.setLineDash([]); g.fillStyle = '#ffd07a';
      g.beginPath(); g.moveTo(BX - 40, FOOT + 8); g.lineTo(BX - 62, FOOT - 2); g.lineTo(BX - 62, FOOT + 18); g.fill();
      g.restore();
    }
    // tesla preview arcs on the landing
    if (t >= SLAMS[3] && t < SLAMS[3] + .2) {
      bolt(g, 2 * ROOM_W + 100, FLOOR - 50, 2 * ROOM_W + 30, FLOOR - 20, 7 + Math.floor(t * 30), '#fff34d', 2, 6, 14);
      bolt(g, 2 * ROOM_W + 100, FLOOR - 50, 2 * ROOM_W + 175, FLOOR - 26, 9 + Math.floor(t * 30), '#fff34d', 2, 6, 14);
    }
    // slam dust plumes
    ROOM_SLAM.forEach((s, i) => { if (t >= s) { dust(g, t - s, i * ROOM_W + 60, FLOOR, 90 + i, 16, 150); dust(g, t - s, i * ROOM_W + 140, FLOOR, 95 + i, 16, 150); } });
    flush(front);

    // ---- screen space
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (t < 2.2) rain(g, t, { n: 150, seed: 5, speed: 2600, angle: .2, len: 70, col: 'rgba(190,175,255,.26)', lw: 2, alpha: 1 - clamp((t - 1.875) / .3) });
    // a stone pillar sweeps across the lens: the wipe into the whip
    if (t >= 1.72 && t < 1.97) {
      const px = lerp(W + 150, -400, E.inCubic(clamp((t - 1.72) / .22)));
      const gap = ROOMIMG.gap;
      g.save();
      if (ok(gap)) { g.imageSmoothingEnabled = false; g.drawImage(baked('pillar', gap.naturalWidth, gap.naturalHeight, x => { x.filter = 'brightness(.45)'; x.drawImage(gap, 0, 0); }), px, -60, 240, H + 120); }
      g.fillStyle = 'rgba(255,176,112,.5)'; g.fillRect(px + 236, -60, 6, H + 120);
      g.restore();
    }
    // cards: dealt at 3.75, each flies to its room on its beat
    for (let i = 0; i < 4; i++) {
      const c = CARDS[i];
      const deal = clamp((t - 3.75 - i * .045) / .22);
      if (deal <= 0) continue;
      const fly0 = SLAMS[i] - 8 / 60 - 10 / 60, fly1 = SLAMS[i] - 8 / 60;
      const hx = W / 2 + (i - 1.5) * 235, hy = 880 + Math.abs(i - 1.5) * 16, hr = (i - 1.5) * .07;
      if (t < fly0) {
        const e = E.outBack(deal, 1.4);
        drawCard(g, c, lerp(W / 2, hx, e), lerp(H + 200, hy, e), 1, hr * e, 1, .25 + .2 * Math.sin(t * 8 + i));
      } else if (t < fly1 + 3 / 60) {
        const [rx, ry] = hallToScreen(t, c.cell * ROOM_W + 100, FLOOR - 110);
        for (let gh = 4; gh >= 0; gh--) {
          const u = clamp((t - gh * .012 - fly0) / (fly1 - fly0));
          const e = E.inCubic(u);
          const x = lerp(hx, rx, e), y = lerp(hy, ry, e) - Math.sin(u * Math.PI) * 160;
          drawCard(g, c, x, y, lerp(1, .35, e), lerp(hr, 0, e) + u * 1.2, (gh ? .3 : 1) * (1 - clamp((t - fly1) / (3 / 60))), gh ? 0 : .8);
        }
      }
      // name the trap as it lands, above its room
      if (t >= SLAMS[i]) {
        const [rx] = hallToScreen(t, c.cell * ROOM_W + 100, 0);
        tierB(g, c.name, rx, 330, t - SLAMS[i], c.col, { size: 30, dur: .4, rot: -.05 });
      }
    }
    // captions
    if (t < 1.9) {
      tierA(g, 'THE HEROES', 232, t - .02, { until: 1.875 - .02 });
      tierA(g, 'ARE COMING', 348, t - MARCH_T0, { until: 1.875 - MARCH_T0 - .02 });
      tierA(g, 'FOR YOU.', 452, t - 1.40625, { size: 76, fill: FILL.blood, until: 1.875 - 1.40625 - .02 });
    }
    if (t < 3.7) {
      tierA(g, 'YOU ARE', 214, t - 2.34375, { size: 70, until: 3.75 - 2.34375 - .12 });
      tierA(g, 'THE FINAL BOSS', 316, t - 2.8125, { size: 120, fill: FILL.blood, from: 2.2, until: 3.75 - 2.8125 - .12 });
    }
    tierA(g, 'BUILD YOUR DUNGEON', 180, t - 3.75, { size: 100, until: 5.45 - 3.75 });
  },
  post(lt, P, t) {
    const whip = t >= 1.875 - .02 && t < 2.13;
    const moving = whip || (t >= 3.75 && t < 4.15) || t >= 5.43;
    P.K = whip ? 16 : moving ? 8 : 4; P.shutter = moving ? 1 : .5;
    if (whip) { P.zoomBlur = .045 * Math.sin(clamp((t - 1.875) / .235) * Math.PI); P.zbCenter = [.6, .5]; }
    if (t >= 5.45) {
      const [fx, fy] = hallToScreen(5.45, 96, FLOOR - 70);
      P.zoomBlur = .12 * E.inQuad(clamp((t - 5.45) / .175)); P.zbCenter = [fx / W, fy / H];
    }
    P.letterbox = t < 2.8125 ? LB : 0;
    const hit = t >= 2.8125 ? kick(t, 2.8125, .09) : 0;
    const swap = t >= FLICK0 && t < FLICK0 + 10 / 60 ? 1 : 0;
    P.ca = .0006 + .009 * hit + .006 * swap;
    P.glitch = swap && Math.floor((t - FLICK0) * 60) % 2 === 0 ? .35 : 0;
    P.flash = [1, .55, .5, .12 * hit];
    P.exposure = 1 + .9 * (t >= 2.8125 ? kick(t, 2.8125, .05) : 0);
    const [sx, sy] = hallToScreen(2.9, BX - 70, FLOOR - 92);
    if (t >= 2.8125 && t < 3.4) P.shocks = [{ x: sx / W, y: sy / H, r: .02 + E.outCubic(clamp((t - 2.8125) / .5)) * .35, w: .025, a: .9 * (1 - clamp((t - 2.8125) / .5)) }];
    const heat = clamp((t - 2.0) / .5) * (t < 3.9 ? 1 : 1 - clamp((t - 3.9) / .3));
    const [bx, by] = hallToScreen(3, BX - 20, FLOOR - 110);
    if (heat > 0) { P.rays = .8 * heat; P.raysPos = [bx / W, by / H]; P.raysDecay = .955; }
    P.vignette = .45;
    if (t > 4.0) P.exposure = 1.05;
  },
});
