// Act VIII: the logo slam (13.125 - 15.0). One white frame, the slam, then an end
// card that is completely still from 14.06 (it is the thumbnail and the loop point).
'use strict';
const LOGO = img('title/logo.png');
const KEYART = img('title/bg.png');
const LOGO_W = 900, LOGO_H = LOGO_W * 1909 / 2958, LOGO_Y = 360;
const HOLD = 14.0625 - 13.125;                             // lt at which the card freezes

// the logo, plus a sheen masked to its solid pixels (no haze on the soft edges)
function logoMask() {
  return baked('logomask', LOGO_W, Math.ceil(LOGO_H), x => {
    x.imageSmoothingQuality = 'high'; x.drawImage(LOGO, 36, 48, 2958, 1909, 0, 0, LOGO_W, LOGO_H);
    const d = x.getImageData(0, 0, LOGO_W, Math.ceil(LOGO_H)), a = d.data;
    for (let i = 3; i < a.length; i += 4) a[i] = a[i] > 200 ? 255 : 0;
    x.putImageData(d, 0, 0);
  });
}
const _sheen = document.createElement('canvas'); _sheen.width = LOGO_W; _sheen.height = Math.ceil(LOGO_H);

shot({ id: 'logo', t0: 13.125, t1: 15.0,
  draw(g, lt, P, t) {
    const lf = Math.min(lt, HOLD);                         // motion clock that stops at the hold
    // key art, soft and dark, drifting until the hold
    if (ok(KEYART)) {
      const kb = r => baked('keyart' + r, 1536, 1025, x => { x.filter = `blur(${r}px) saturate(1.25)`; x.drawImage(KEYART, 0, 0); });
      const sharpU = E.outCubic(clamp(lf / 1.2));
      const drawK = (im, a) => { g.save(); g.globalAlpha = a; const s = Math.max(W / 1535, H / 1025) * (1.12 + lf * .035); g.drawImage(im, W / 2 - 1535 * s * .5 - lf * 18, H / 2 - 1025 * s * .45, 1535 * s, 1025 * s); g.restore(); };
      drawK(kb(9), 1);
      drawK(kb(3), sharpU);
      g.fillStyle = `rgba(0,0,0,${(1 - lerp(.9, .42, E.outCubic(clamp(lt / .5)))).toFixed(3)})`; g.fillRect(0, 0, W, H);
    }
    vignetteDark(g, .75, .2);

    const sk = shake(lt, 26 * Math.exp(-lt / .16) * (lt < .78 ? 1 : 0), 24);
    g.translate(sk[0], sk[1]);
    // the light behind the logo (feeds bloom + god rays)
    const lx = W / 2, ly = LOGO_Y;
    const hot = .55 + .45 * kick(lt, 0, .5);
    glow(g, lx, ly, 780, 'rgba(255,90,60,A)', .55 * hot);
    glow(g, lx, ly - 40, 480, 'rgba(255,210,150,A)', .7 * hot);
    shafts(g, lx, ly - 30, .55 * hot, { n: 14, dir: -Math.PI / 2, spread: Math.PI * 2, len: 1300, seed: 21, t: lf, col: 'rgba(255,170,110,A)' });

    // embers stream up (the only motion left in the hold) + the ember explosion of the slam
    embers(g, lt + 3, { n: 90, seed: 41, speed: [80, 260], size: [2, 5], cols: ['#ffb066', '#ff7a2e', '#ffd34d', '#b985ff'], glow: true });
    burst(g, lt, { x: lx, y: ly, n: 140, seed: 77, speed: [300, 1800], life: [.5, 1.6], size: [2, 6], gy: 260, drag: 2.2, cols: ['#ffd34d', '#ff7a2e', '#fff3c0', '#ff5470'], shape: 'spark', streak: .03 });
    burst(g, lt, { x: lx, y: ly + 160, n: 40, seed: 78, speed: [400, 1400], angle: [-Math.PI * .95, -Math.PI * .05], life: [.6, 1.3], size: [5, 12], gy: 1600, drag: .8, cols: ['#3a3430', '#6d6154', '#9aa4b2'], add: false, shape: 'shard', spin: 25 });

    // the logo: slams from huge, overshoots, settles, breathes, then holds dead still
    if (ok(LOGO)) {
      const inT = .13;
      const breathe = 1 - clamp((lt - .8) / .14);
      let s;
      if (lt < inT) s = lerp(2.2, .96, E.inQuad(lt / inT));
      else s = 1 + (-.04) * Math.exp(-(lt - inT) * 9) * Math.cos((lt - inT) * 30) + .01 * Math.sin(lf * 2.4) * breathe;
      const rot = lt < inT ? lerp(-.1, 0, lt / inT) : .01 * Math.exp(-(lt - inT) * 6) * Math.sin((lt - inT) * 28);
      g.save();
      g.translate(lx, ly); g.rotate(rot); g.scale(s, s);
      g.globalAlpha = clamp(lt / .03);
      const shadow = baked('logoshadow2', LOGO_W + 120, LOGO_H + 120, x => { x.filter = 'blur(18px) brightness(0)'; x.drawImage(LOGO, 36, 48, 2958, 1909, 60, 60, LOGO_W, LOGO_H); });
      g.save(); g.globalAlpha *= .6; g.drawImage(shadow, -LOGO_W / 2 - 60 + 14, -LOGO_H / 2 - 60 + 26); g.restore();
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      g.drawImage(baked('logoimg', LOGO_W, Math.ceil(LOGO_H), x => { x.imageSmoothingQuality = 'high'; x.drawImage(LOGO, 36, 48, 2958, 1909, 0, 0, LOGO_W, LOGO_H); }), -LOGO_W / 2, -LOGO_H / 2);
      // a light sweep across the stone letters, finished before the hold
      const sw = inv(.45, .9, lt);
      if (sw > 0 && sw < 1) {
        const x = _sheen.getContext('2d');
        x.globalCompositeOperation = 'source-over'; x.clearRect(0, 0, _sheen.width, _sheen.height);
        const sx = lerp(-300, LOGO_W + 300, E.inOutCubic(sw));
        const gr = x.createLinearGradient(sx - 60, 0, sx + 60, 120);
        gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.5, 'rgba(255,248,225,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        x.fillStyle = gr; x.fillRect(0, 0, _sheen.width, _sheen.height);
        x.globalCompositeOperation = 'destination-in'; x.drawImage(logoMask(), 0, 0);
        g.globalCompositeOperation = 'lighter';
        g.drawImage(_sheen, -LOGO_W / 2, -LOGO_H / 2);
      }
      g.restore();
    }

    // what it is, what's in it
    const fa = clamp((lt - .6) / .15);
    if (fa > 0) {
      g.save(); g.globalAlpha = fa;
      strokeText(g, 'REVERSE TOWER DEFENSE  ·  6 BOSSES  ·  50 WAVES  ·  ENDLESS', W / 2, 712, { font: F.epic(36), fill: '#f2e6c8', outline: '#0b0612', outlineW: 9, tracking: 2 });
      g.restore();
    }
    // call to action + where to play (sized for a phone feed)
    const ca = clamp((lt - .47) / .15);
    if (ca > 0) {
      const pul = 1 + .02 * Math.sin((lt - .47) * 8.4) * (1 - clamp((lt - .8) / .14));
      g.save();
      g.translate(W / 2, 810); const sc = lerp(1.4, 1, E.outBack(ca, 2)) * pul; g.scale(sc, sc);
      g.globalAlpha = ca;
      g.font = F.pix(44);
      const tw = g.measureText('PLAY FREE IN YOUR BROWSER').width + 90;
      g.save(); g.shadowColor = '#ff5a3a'; g.shadowBlur = 34;
      g.fillStyle = 'rgba(120,20,16,.94)';
      g.beginPath(); g.roundRect(-tw / 2, -52, tw, 96, 18); g.fill(); g.restore();
      g.strokeStyle = '#ffd34d'; g.lineWidth = 5; g.beginPath(); g.roundRect(-tw / 2, -52, tw, 96, 18); g.stroke();
      g.fillStyle = '#fff3d0'; g.textAlign = 'center'; g.fillText('PLAY FREE IN YOUR BROWSER', 0, 18);
      g.restore();
    }
    const ua = clamp((lt - .52) / .18);
    if (ua > 0) {
      g.save(); g.globalAlpha = ua;
      strokeText(g, 'games-71g.pages.dev/no_room_for_heroes', W / 2, 935 + (1 - E.outCubic(ua)) * 12, { font: F.pix(34), fill: '#ffffff', outline: '#0b0612', outlineW: 10 });
      g.restore();
    }
  },
  post(lt, P) {
    // one white frame, then clean blacks within a few frames
    P.flash = [1, .95, .9, lt < 1 / 60 ? .95 : .55 * Math.exp(-lt / .03)];
    P.shocks = [{ x: .5, y: LOGO_Y / H, r: E.outCubic(clamp(lt / .7)) * 1.1, w: .09, a: .55 * (1 - clamp(lt / .7)) }];
    P.ca = .0006 + .02 * kick(lt, 0, .1);
    P.bloom = .7; P.bloomThr = .6;
    P.rays = .9 * (.3 + .7 * kick(lt, 0, .5)); P.raysPos = [.5, 330 / H]; P.raysDecay = .95;
    P.zoomBlur = .04 * kick(lt, 0, .06); P.zbCenter = [.5, LOGO_Y / H];
    P.vignette = .5;
    if (lt >= HOLD) P.K = 2;                               // the hold is still; only embers move
  },
});
