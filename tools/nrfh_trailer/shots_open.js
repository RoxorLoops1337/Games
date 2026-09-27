// Act I, shot 1: the storm (0 - 0.9375). Frame 0 is a lightning strike on the
// painted party (intro_scene07); the camera pushes in and match-cuts to the
// in-game party at the same screen spot.
'use strict';
const SCENE7 = img('intro/intro_scene07.jpg');
const LB = .128;                       // 2.39:1 letterbox, snaps open on THE FINAL BOSS
const BOLTS = [0, .46875];

shot({ id: 'open', t0: 0, t1: .9375,
  draw(g, lt, P) {
    if (!ok(SCENE7)) return;
    const z = 2.85 * Math.pow(3.9 / 2.85, E.inQuad(lt / .9375));    // ease-in push; the painting always fills the frame
    const k = (W / 1280) * z;
    const fx = 236 + lt * 10, fy = 330;
    const sh = shake(lt, 5 * kick(lt, 0, .1) + 5 * kick(lt, .46875, .1) * (lt >= .46875), 30);
    const lit = BOLTS.reduce((a, b0) => a + (lt >= b0 ? Math.exp(-(lt - b0) / .07) : 0), 0);
    g.save();
    g.translate(W * .5 + sh[0], H * .62 + sh[1]);
    g.scale(k, k);
    g.translate(-fx, -fy);
    const bri = .62 + .75 * clamp(lit);
    g.imageSmoothingEnabled = false;
    // resample to 640x360 and back up, nearest: at this zoom the frame shows clean square
    // pixels instead of magnified JPEG blocks
    const grid = baked('scene7grid', 640, 360, x => { x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; x.filter = 'saturate(1.15)'; x.drawImage(SCENE7, 0, 0, 640, 360); });
    g.drawImage(grid, 0, 0, 1280, 720);
    g.save();
    if (bri < 1) { g.fillStyle = `rgba(0,0,0,${(1 - bri).toFixed(3)})`; g.fillRect(0, 0, 1280, 720); }
    else { g.globalCompositeOperation = 'lighter'; g.globalAlpha = bri - 1; g.drawImage(SCENE7, 0, 0); }
    g.restore();
    // the party's torchlight
    glow(g, 243, 340, 64, 'rgba(255,196,120,A)', .5 + .08 * Math.sin(lt * 23));
    g.restore();
    // the storm answers: forked bolts in screen space across the painted sky
    BOLTS.forEach((b0, i) => {
      if (lt < b0) return;
      const a = Math.exp(-(lt - b0) / .085);
      if (a < .03) return;
      lightning(g, [620, 1260][i], -20, [540, 1400][i], [330, 300][i], 11 + i * 12, { lw: 3.2, depth: 6, alpha: a, col: '#efe4ff', glow: '#a55cff' });
    });
    // the second strike reveals who is waiting: Azzaroth's silhouette in the storm clouds
    const rev = lt >= BOLTS[1] ? Math.exp(-(lt - BOLTS[1]) / .16) : 0;
    const dim = DEMON_HI[0];
    if (rev > .02 && ok(dim)) {
      // a dark shape cut out of the lightning-lit sky, rim-lit on its edges
      const rimC = tintedCell(dim, 0, 0, dim.naturalWidth, dim.naturalHeight, { tint: '#e2b8ff', tintA: 1 });
      const sil = tintedCell(dim, 0, 0, dim.naturalWidth, dim.naturalHeight, { tint: '#0a0310', tintA: 1 });
      const hh = 560, ww = hh * dim.naturalWidth / dim.naturalHeight, cx = 1500, cy = 300 + (1 - rev) * 18;
      g.save(); g.imageSmoothingEnabled = true;
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = .75 * rev;
      g.drawImage(rimC, cx - ww / 2 - 6, cy - hh / 2 - 7, ww, hh);
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = .88 * rev;
      g.drawImage(sil, cx - ww / 2, cy - hh / 2, ww, hh);
      g.restore();
      for (const ex of [-40, 40]) { glow(g, cx + ex - 21, cy - 131, 34, 'rgba(255,40,30,A)', rev); glow(g, cx + ex - 21, cy - 131, 12, 'rgba(255,220,200,A)', rev); }
    }
    // a soft sky layer drifting faster than the painting (cheap parallax)
    g.save(); g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
      const x = ((i * 530 - lt * 260) % 2600 + 2600) % 2600 - 340, y = 120 + (i % 3) * 90;
      const gr = g.createRadialGradient(x, y, 0, x, y, 380);
      gr.addColorStop(0, 'rgba(120,70,190,.10)'); gr.addColorStop(1, 'rgba(120,70,190,0)');
      g.fillStyle = gr; g.fillRect(x - 380, y - 380, 760, 760);
    }
    g.restore();
    rain(g, lt, { n: 180, seed: 5, speed: 2600, angle: .2, len: 70, col: 'rgba(190,175,255,.32)', lw: 2 });
    rain(g, lt + 3, { n: 50, seed: 9, speed: 3600, angle: .2, len: 140, col: 'rgba(215,205,255,.16)', lw: 5 });
    vignetteDark(g, .5, .3);
    tierA(g, 'THE HEROES', 232, lt - .02);
  },
  post(lt, P) {
    const f = BOLTS.reduce((a, b0) => a + (lt >= b0 ? Math.exp(-(lt - b0) / .05) : 0), 0);
    P.exposure = 1 + .35 * f;
    P.ca = .0006 + .004 * f;
    P.letterbox = LB;
    P.vignette = .45;
    // zoom blur builds over the last 8 frames into the match cut
    const zb = clamp((lt - (.9375 - 8 / 60)) / (8 / 60));
    if (zb > 0) { P.zoomBlur = .06 * zb * zb; P.zbCenter = [.5, .62]; P.K = 6; P.shutter = 1; }
  },
});
