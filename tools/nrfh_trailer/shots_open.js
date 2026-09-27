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
    const z = 2.5 * Math.pow(3.7 / 2.5, E.inQuad(lt / .9375));      // ease-in push toward the party
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
    g.drawImage(baked('scene7', 1280, 720, x => { x.filter = 'saturate(1.15)'; x.drawImage(SCENE7, 0, 0); }), 0, 0);
    g.save();
    if (bri < 1) { g.fillStyle = `rgba(0,0,0,${(1 - bri).toFixed(3)})`; g.fillRect(0, 0, 1280, 720); }
    else { g.globalCompositeOperation = 'lighter'; g.globalAlpha = bri - 1; g.drawImage(SCENE7, 0, 0); }
    g.restore();
    // the storm answers the painted bolts
    BOLTS.forEach((b0, i) => {
      if (lt < b0) return;
      const a = Math.exp(-(lt - b0) / .09);
      if (a < .03) return;
      g.save(); g.globalAlpha = a;
      bolt(g, 175 + i * 120, -20, 205 + i * 90, 250, 11 + i * 12, '#e2ccff', 2.4, 10, 34);
      bolt(g, 120 + i * 150, 0, 60 + i * 170, 190, 17 + i * 5, '#b163ff', 1.4, 7, 24);
      g.restore();
    });
    // the party's torchlight
    glow(g, 243, 340, 64, 'rgba(255,196,120,A)', .5 + .08 * Math.sin(lt * 23));
    g.restore();
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
