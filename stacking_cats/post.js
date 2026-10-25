// Post processing and lighting for the 2D canvas: a light map (ambient light plus coloured lights), bloom,
// colour grading, film grain and a sun lens flare. Everything is optional and cheap: the light map and the
// bloom buffer are small canvases that get scaled up, so the cost stays low on phones.
import { TAU, mix } from './art_util.js';

const HAS_FILTER = (() => { try { return typeof CanvasRenderingContext2D !== 'undefined' && 'filter' in CanvasRenderingContext2D.prototype; } catch (e) { return false; } })();

const glowCache = new Map();
// a soft round light sprite in a colour (white centre fading to transparent)
export function lightSprite(col, size = 64) {
  const key = col + size;
  let c = glowCache.get(key);
  if (!c) {
    c = document.createElement('canvas'); c.width = c.height = size;
    const x = c.getContext('2d'), g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, col); g.addColorStop(0.35, col); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.globalAlpha = 1; x.fillStyle = g; x.fillRect(0, 0, size, size);
    glowCache.set(key, c);
  }
  return c;
}

function mk(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return [c, c.getContext('2d')]; }

export function createPost(W, H) {
  const LS = 3, BS = 4;                                  // light map is 1/3 size, bloom buffer 1/4
  const [lightCv, lctx] = mk(W / LS, H / LS);
  const [bloomCv, bctx] = mk(W / BS, H / BS);
  const [noiseCv, nctx] = mk(128, 128);
  const img = nctx.createImageData(128, 128);
  for (let i = 0; i < img.data.length; i += 4) { const v = 90 + Math.random() * 90; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
  nctx.putImageData(img, 0, 0);

  return {
    hasFilter: HAS_FILTER,
    // ambient: css colour. lights: [{x,y,r,col,a}] in world pixels. shadowBlobs: moving cloud shadows [{x,y,rx,ry,a}].
    // Multiplied over the scene: dark where there is no light, untouched where there is.
    light(ctx, ambient, lights, blobs) {
      lctx.setTransform(1, 0, 0, 1, 0, 0);
      lctx.globalCompositeOperation = 'source-over';
      lctx.fillStyle = ambient; lctx.fillRect(0, 0, lightCv.width, lightCv.height);
      if (blobs) for (const b of blobs) {
        lctx.globalAlpha = b.a; lctx.fillStyle = '#6a60a0'; lctx.beginPath(); lctx.ellipse(b.x / LS, b.y / LS, b.rx / LS, b.ry / LS, 0, 0, TAU); lctx.fill();
      }
      lctx.globalAlpha = 1; lctx.globalCompositeOperation = 'lighter';
      for (const l of lights) {
        const r = l.r / LS;
        lctx.globalAlpha = Math.min(1, l.a == null ? 1 : l.a);
        lctx.drawImage(lightSprite(l.col), l.x / LS - r, l.y / LS - r, r * 2, r * 2);
      }
      lctx.globalAlpha = 1; lctx.globalCompositeOperation = 'source-over';
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(lightCv, -24, -24, W + 48, H + 48);
      ctx.restore();
    },
    // soft glow around the brightest parts: a thresholded, blurred copy of the frame added back on top. It fades out
    // toward the top of the screen so the sky does not wash everything out.
    bloom(ctx, src, strength = 0.3) {
      bctx.setTransform(1, 0, 0, 1, 0, 0);
      bctx.globalCompositeOperation = 'copy';
      if (HAS_FILTER) bctx.filter = 'brightness(0.62) contrast(3.2) blur(2.2px)';
      bctx.drawImage(src, 0, 0, bloomCv.width, bloomCv.height);
      if (HAS_FILTER) bctx.filter = 'none';
      else { bctx.globalCompositeOperation = 'multiply'; bctx.drawImage(bloomCv, 0, 0); bctx.drawImage(bloomCv, 0, 0); }
      bctx.globalCompositeOperation = 'destination-in';
      const m = bctx.createLinearGradient(0, 0, 0, bloomCv.height);
      m.addColorStop(0, 'rgba(0,0,0,.1)'); m.addColorStop(0.4, 'rgba(0,0,0,.8)'); m.addColorStop(1, 'rgba(0,0,0,1)');
      bctx.fillStyle = m; bctx.fillRect(0, 0, bloomCv.width, bloomCv.height);
      bctx.globalCompositeOperation = 'source-over';
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = strength;
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bloomCv, 0, 0, src.width, src.height);
      ctx.restore();
    },
    // colour grade laid over the picture: top and bottom colours, plus a warm dusk glow near the horizon
    grade(ctx, top, bottom, dusk = 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'soft-light';
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, top); g.addColorStop(1, bottom);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      if (dusk > 0.02) {
        const d = ctx.createLinearGradient(0, H * 0.35, 0, H * 0.85);
        d.addColorStop(0, 'rgba(255,120,90,0)'); d.addColorStop(1, `rgba(255,120,90,${0.28 * dusk})`);
        ctx.fillStyle = d; ctx.fillRect(0, 0, W, H);
      }
      ctx.restore();
    },
    grain(ctx, t, strength = 0.05) {
      ctx.save();
      ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = strength;
      const ox = Math.floor(t * 997) % 128, oy = Math.floor(t * 613) % 128;
      for (let y = -oy; y < H; y += 128) for (let x = -ox; x < W; x += 128) ctx.drawImage(noiseCv, x, y);
      ctx.restore();
    },
    // a few soft discs along the line from the sun through the middle of the screen
    flare(ctx, sx, sy, strength = 0.12) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const cx = W / 2, cy = H / 2;
      for (const [u, r, col] of [[0.35, 26, '#ffe9b0'], [0.6, 14, '#ffb8e0'], [0.85, 36, '#b8e8ff'], [1.15, 18, '#fff3c0']]) {
        const x = sx + (cx - sx) * u, y = sy + (cy - sy) * u;
        ctx.globalAlpha = strength * (u > 1 ? 0.7 : 1);
        ctx.drawImage(lightSprite(col), x - r, y - r, r * 2, r * 2);
      }
      ctx.restore();
    },
  };
}

// ambient colour for the current moment: day colour early in a stage, dusk at the nest, a darker red on a nest wave
export function ambientFor(theme, waveInStage, stageLen, boss, nestAlive) {
  const u = stageLen > 1 ? (waveInStage - 1) / (stageLen - 1) : 0;
  let c = mix(theme.amb[0], theme.amb[1], Math.min(1, Math.max(0, u)));
  if (boss && nestAlive) c = mix(c, '#7a5478', 0.28);
  return { color: c, dusk: Math.min(1, u * 0.9 + (boss ? 0.15 : 0)) };
}
