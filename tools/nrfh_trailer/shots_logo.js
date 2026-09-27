// Act VIII: the logo slam (13.125 - 15.0)
'use strict';
const LOGO = img('title/logo.png');
const KEYART = img('title/bg.png');
const _logoCv = document.createElement('canvas'); _logoCv.width = 1200; _logoCv.height = 812;
const _lg = _logoCv.getContext('2d');

shot({ id: 'logo', t0: 13.125, t1: 15.0,
  draw(g, lt, P, t) {
    // key art, soft and dark, drifting
    if (ok(KEYART)) {
      const kb = r => baked('keyart' + r, 1536, 1025, x => { x.filter = `blur(${r}px) saturate(1.25)`; x.drawImage(KEYART, 0, 0); });
      const sharpU = E.outCubic(clamp(lt / 1.2));
      const drawK = (im, a) => { g.save(); g.globalAlpha = a; const s = Math.max(W / 1535, H / 1025) * (1.12 + lt * .035); g.drawImage(im, W / 2 - 1535 * s * .5 - lt * 18, H / 2 - 1025 * s * .45, 1535 * s, 1025 * s); g.restore(); };
      drawK(kb(9), 1);
      drawK(kb(3), sharpU);
      g.fillStyle = `rgba(0,0,0,${(1 - lerp(.9, .42, E.outCubic(clamp(lt / .5)))).toFixed(3)})`; g.fillRect(0, 0, W, H);
    }
    vignetteDark(g, .75, .2);

    const sk = shake(lt, 26 * Math.exp(-lt / .16) * (lt < .78 ? 1 : 0), 24);
    g.translate(sk[0], sk[1]);
    // the light behind the logo (feeds bloom + god rays)
    const lx = W / 2, ly = 400;
    const hot = .55 + .45 * kick(lt, 0, .5);
    glow(g, lx, ly, 820, 'rgba(255,90,60,A)', .55 * hot);
    glow(g, lx, ly - 40, 520, 'rgba(255,210,150,A)', .7 * hot);
    shafts(g, lx, ly - 30, .55 * hot, { n: 14, dir: -Math.PI / 2, spread: Math.PI * 2, len: 1300, seed: 21, t: lt, col: 'rgba(255,170,110,A)' });

    // embers streaming up + an initial ember explosion from the slam
    embers(g, lt + 3, { n: 90, seed: 41, speed: [80, 260], size: [2, 5], cols: ['#ffb066', '#ff7a2e', '#ffd34d', '#b985ff'], glow: true });
    burst(g, lt, { x: lx, y: ly, n: 140, seed: 77, speed: [300, 1800], life: [.5, 1.6], size: [2, 6], gy: 260, drag: 2.2, cols: ['#ffd34d', '#ff7a2e', '#fff3c0', '#ff5470'], shape: 'spark', streak: .03 });
    burst(g, lt, { x: lx, y: ly + 180, n: 40, seed: 78, speed: [400, 1400], angle: [-Math.PI * .95, -Math.PI * .05], life: [.6, 1.3], size: [5, 12], gy: 1600, drag: .8, cols: ['#3a3430', '#6d6154', '#9aa4b2'], add: false, shape: 'shard', spin: 25 });

    // the logo: slams from huge, overshoots, settles, then breathes
    if (ok(LOGO)) {
      const inT = .13;
      let s;
      if (lt < inT) s = lerp(2.6, .96, E.inQuad(lt / inT));
      else s = 1 + (-.04) * Math.exp(-(lt - inT) * 9) * Math.cos((lt - inT) * 30) + .012 * Math.sin(lt * 2.4);
      const rot = lt < inT ? lerp(-.12, 0, lt / inT) : .01 * Math.exp(-(lt - inT) * 6) * Math.sin((lt - inT) * 28);
      const lw = 1060, lh = lw * 1909 / 2958;
      // shine sweep, clipped to the logo alpha on an offscreen
      _lg.clearRect(0, 0, 1200, 812);
      _lg.imageSmoothingEnabled = true; _lg.imageSmoothingQuality = 'high';
      _lg.globalCompositeOperation = 'source-over';
      _lg.drawImage(LOGO, 36, 48, 2958, 1909, 10, 10, lw, lh);
      const sw = inv(.45, 1.05, lt);
      if (sw > 0 && sw < 1) {
        _lg.globalCompositeOperation = 'source-atop';
        const sx = lerp(-400, 1600, E.inOutCubic(sw));
        const gr = _lg.createLinearGradient(sx - 70, 0, sx + 70, 140);
        gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.5, 'rgba(255,248,225,.42)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        _lg.fillStyle = gr; _lg.fillRect(0, 0, 1200, 812);
        _lg.globalCompositeOperation = 'source-over';
      }
      g.save();
      g.translate(lx, ly); g.rotate(rot); g.scale(s, s);
      g.globalAlpha = clamp(lt / .05);
      // dark drop shadow for depth
      const shadow = baked('logoshadow', 1300, 912, x => { x.filter = 'blur(18px) brightness(0)'; x.drawImage(LOGO, 36, 48, 2958, 1909, 60, 60, lw, lh); });
      g.save(); g.globalAlpha *= .6; g.drawImage(shadow, -lw / 2 - 60 + 14, -lh / 2 - 60 + 26); g.restore();
      g.imageSmoothingEnabled = true;
      g.drawImage(_logoCv, -lw / 2 - 10, -lh / 2 - 10);
      g.restore();
    }

    // a glint rides across HEROES at 14.53 (the last sting)
    const gl = lt - (14.53 - 13.125);
    if (gl > 0 && gl < .5) {
      const gx = lerp(lx - 380, lx + 380, E.inOutCubic(gl / .5)), gy = ly + 140, a = Math.sin(gl / .5 * Math.PI);
      g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = a;
      g.fillStyle = '#fff6e0';
      for (const [w, h] of [[160, 5], [5, 90]]) { g.beginPath(); g.ellipse(gx, gy, w / 2, h / 2, 0, 0, 7); g.fill(); }
      glow(g, gx, gy, 90, 'rgba(255,230,190,A)', .7 * a);
      g.restore();
    }
    // call to action + where to play
    const ca = clamp((lt - .47) / .15);
    if (ca > 0) {
      const pul = 1 + .025 * Math.sin((lt - .47) * 8.4);
      g.save();
      g.translate(W / 2, 858); const sc = lerp(1.5, 1, E.outBack(ca, 2)) * pul; g.scale(sc, sc);
      g.globalAlpha = ca;
      g.font = F.pix(30);
      const tw = g.measureText('PLAY FREE IN YOUR BROWSER').width + 80;
      g.save(); g.shadowColor = '#ff5a3a'; g.shadowBlur = 34;
      g.fillStyle = 'rgba(120,20,16,.94)'; g.strokeStyle = '#ffd34d'; g.lineWidth = 4;
      g.beginPath(); g.roundRect(-tw / 2, -40, tw, 74, 16); g.fill(); g.restore();
      g.strokeStyle = '#ffd34d'; g.lineWidth = 4; g.beginPath(); g.roundRect(-tw / 2, -40, tw, 74, 16); g.stroke();
      g.fillStyle = '#fff3d0'; g.textAlign = 'center'; g.fillText('PLAY FREE IN YOUR BROWSER', 0, 12);
      g.restore();
    }
    const ua = clamp((lt - .62) / .2);
    if (ua > 0) {
      g.save(); g.globalAlpha = ua;
      strokeText(g, 'games-71g.pages.dev/no_room_for_heroes', W / 2, 948 + (1 - E.outCubic(ua)) * 12, { font: F.pix(20), fill: '#d9c8ff', outline: '#0b0612', outlineW: 7 });
      g.restore();
    }
  },
  post(lt, P) {
    P.flash = [1, .92, .85, Math.pow(Math.max(0, 1 - lt / .2), 1.5) * .95];
    P.shocks = [{ x: .5, y: 400 / H, r: E.outCubic(clamp(lt / .7)) * 1.1, w: .09, a: .55 * (1 - clamp(lt / .7)) }];
    P.ca = .0018 + .02 * kick(lt, 0, .12);
    P.bloom = .75; P.bloomThr = .55;
    P.rays = .9 * (.3 + .7 * kick(lt, 0, .5)); P.raysPos = [.5, 370 / H]; P.raysDecay = .95;
    P.zoomBlur = .09 * kick(lt, 0, .09); P.zbCenter = [.5, 400 / H];
    P.vignette = .5;
  },
});
