// Clawspire -- RENDER. All canvas art, drawn with code. Nothing here mutates
// game state, every public call restores ctx state, and nothing touches the
// DOM at load time (glow sprites are built lazily and are optional).
//
// Conventions: chunky cartoon vector. Thick ink outlines, 2-tone shading
// (base + darker crescent + specular), neon arcade on damp dungeon.
// Items are drawn centred on the origin inside their physics bounds.
// Enemies are drawn with their feet on the origin, facing -x (the player).
const RENDER = (() => {
  const TAU = Math.PI * 2;
  const INK = '#12091f';
  const PAL = {
    ink: '#12091f', pink: '#ff2e88', cyan: '#2ee6d6', gold: '#ffc94d',
    lime: '#a6ff5e', blood: '#ff5a4a', paper: '#e9dcc4', chrome: '#c9d3e0',
  };
  const OL = 2.5;              // outline width at scale 1
  const FONT = 'system-ui, "Segoe UI", Helvetica, Arial, sans-serif';

  /* ---------------------------------------------------------- colours */
  const rgbCache = new Map();
  // '#rgb' / '#rrggbb' / 'rgb(a)(...)' -> [r,g,b]; cached, never throws.
  function rgb(col) {
    let c = rgbCache.get(col);
    if (c) return c;
    let r = 128, g = 128, b = 128;
    if (typeof col === 'string') {
      if (col[0] === '#') {
        const h = col.length < 7 ? col.slice(1, 4).split('').map(ch => ch + ch).join('') : col.slice(1, 7);
        const n = parseInt(h, 16);
        if (!isNaN(n)) { r = (n >> 16) & 255; g = (n >> 8) & 255; b = n & 255; }
      } else if (col.startsWith('rgb')) {
        const m = col.match(/[\d.]+/g);
        if (m && m.length >= 3) { r = +m[0]; g = +m[1]; b = +m[2]; }
      }
    }
    c = [r, g, b];
    rgbCache.set(col, c);
    return c;
  }
  const shadeCache = new Map();
  // f < 0 darkens toward the ink purple, f > 0 lightens toward white. Cached.
  function shade(col, f) {
    let m = shadeCache.get(col);
    if (!m) { m = {}; shadeCache.set(col, m); }
    const k = Math.round(f * 100);
    let s = m[k];
    if (s) return s;
    const c = rgb(col);
    let r, g, b;
    if (f < 0) {
      const t = -f, ik = rgb(INK);
      r = c[0] + (ik[0] - c[0]) * t; g = c[1] + (ik[1] - c[1]) * t; b = c[2] + (ik[2] - c[2]) * t;
    } else {
      r = c[0] + (255 - c[0]) * f; g = c[1] + (255 - c[1]) * f; b = c[2] + (255 - c[2]) * f;
    }
    s = 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
    m[k] = s;
    return s;
  }
  const alphaCache = new Map();
  function rgba(col, a) {
    let m = alphaCache.get(col);
    if (!m) { m = {}; alphaCache.set(col, m); }
    const k = Math.round(a * 100);
    let s = m[k];
    if (s) return s;
    const c = rgb(col);
    s = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (k / 100) + ')';
    m[k] = s;
    return s;
  }

  /* --------------------------------------------- flat-colour override */
  // When FLAT is set every fill/stroke uses it. Used for the hurt flash,
  // frozen tint and ghost passes: the art is drawn a second time as a
  // silhouette without needing a second code path per creature.
  let FLAT = null;
  const F = (ctx, c) => { ctx.fillStyle = FLAT || c; };
  const S = (ctx, c, w) => { ctx.strokeStyle = FLAT || c; if (w != null) ctx.lineWidth = w; };

  /* ------------------------------------------------------- path helpers */
  function rrect(c, x, y, w, h, r) {
    r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y); c.arcTo(x + w, y, x + w, y + r, r);
    c.lineTo(x + w, y + h - r); c.arcTo(x + w, y + h, x + w - r, y + h, r);
    c.lineTo(x + r, y + h); c.arcTo(x, y + h, x, y + h - r, r);
    c.lineTo(x, y + r); c.arcTo(x, y, x + r, y, r);
    c.closePath();
  }
  function circ(c, x, y, r) { c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU); }
  function ell(c, x, y, rx, ry, rot) { c.moveTo(x + rx * Math.cos(rot || 0), y + rx * Math.sin(rot || 0)); c.ellipse(x, y, rx, ry, rot || 0, 0, TAU); }
  function poly(c, pts) {
    c.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
    c.closePath();
  }
  function star(c, x, y, r, n, inner) {
    for (let i = 0; i < n * 2; i++) {
      const a = -Math.PI / 2 + i * Math.PI / n, rr = i % 2 ? r * inner : r;
      if (i) c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); else c.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    c.closePath();
  }
  // Pointy-top by default; flat (the map's portrait orientation) turns it 30 degrees.
  function hexPath(c, x, y, r, flat) {
    for (let i = 0; i < 6; i++) {
      const a = (flat ? 0 : -Math.PI / 2) + i * Math.PI / 3;
      if (i) c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); else c.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    c.closePath();
  }

  /* 2-tone shaded shape: fill base, a darker crescent toward the lower right,
     a specular blob upper-left, then the ink outline. pathFn builds the path
     (called twice: clip consumes it). (cx,cy,r) is the shape's rough centre
     and half size, used to place the shading. */
  function tone(ctx, pathFn, col, cx, cy, r, o) {
    o = o || tone.def;
    ctx.beginPath(); pathFn(ctx);
    F(ctx, col); ctx.fill();
    if (!FLAT && !o.flat) {
      ctx.save(); ctx.clip();
      ctx.fillStyle = shade(col, o.dark != null ? o.dark : -0.32);
      ctx.fillRect(cx - r * 3, cy - r * 3, r * 6, r * 6);
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(cx - r * 0.2, cy - r * 0.2, r * (o.crescent || 1.02), 0, TAU); ctx.fill();
      if (o.spec !== false) {
        ctx.fillStyle = 'rgba(255,255,255,0.38)';
        ctx.beginPath(); ctx.ellipse(cx - r * 0.42, cy - r * 0.42, r * 0.26, r * 0.15, -0.75, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
    if (o.ol !== 0) {
      ctx.beginPath(); pathFn(ctx);
      S(ctx, o.olc || INK, o.ol || OL); ctx.stroke();
    }
  }
  tone.def = {};
  const NOSPEC = { spec: false };
  const FLATO = { flat: true };
  // Thick cartoon line: ink under-stroke then colour core.
  function limb(ctx, x1, y1, x2, y2, w, col) {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    S(ctx, INK, w + OL * 1.6); ctx.stroke();
    S(ctx, col, w); ctx.stroke();
  }
  function line(ctx, x1, y1, x2, y2, col, w) {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); S(ctx, col, w); ctx.stroke();
  }
  // Cartoon eye: white with ink rim and a pupil that looks toward (lx,ly).
  function eye(ctx, x, y, r, lx, ly, col) {
    tone(ctx, c => circ(c, x, y, r), '#ffffff', x, y, r, NOSPEC);
    F(ctx, col || INK); ctx.beginPath(); ctx.arc(x + lx * r * 0.35, y + ly * r * 0.35, r * 0.5, 0, TAU); ctx.fill();
    if (!FLAT) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x + lx * r * 0.35 - r * 0.18, y + ly * r * 0.35 - r * 0.2, r * 0.16, 0, TAU); ctx.fill(); }
  }
  function txt(ctx, s, x, y, size, col, bold, align, ol) {
    ctx.font = (bold === false ? '' : 'bold ') + size + 'px ' + FONT;
    ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle';
    if (ol) { S(ctx, ol === true ? INK : ol, Math.max(2, size * 0.18)); ctx.lineJoin = 'round'; ctx.strokeText(s, x, y); }
    F(ctx, col); ctx.fillText(s, x, y);
  }

  /* -------------------------------------------- cached glow sprites */
  // Radial glows are the one thing worth caching: built once per
  // (colour, radius) on an offscreen canvas. Returns null when there is
  // no document or the canvas cannot be built (headless), and callers skip.
  const glowCache = new Map();
  function glowSprite(col, r) {
    r = Math.max(4, Math.round(r));
    let m = glowCache.get(col);
    if (!m) { m = {}; glowCache.set(col, m); }
    if (m[r] !== undefined) return m[r];
    let cv = null;
    try {
      if (typeof document !== 'undefined' && document && document.createElement) {
        const c = document.createElement('canvas');
        c.width = r * 2 + 2; c.height = r * 2 + 2;
        const g = c.getContext && c.getContext('2d');
        if (g && g.createRadialGradient) {
          const grad = g.createRadialGradient(r + 1, r + 1, 0, r + 1, r + 1, r);
          grad.addColorStop(0, rgba(col, 0.85));
          grad.addColorStop(0.45, rgba(col, 0.3));
          grad.addColorStop(1, rgba(col, 0));
          g.fillStyle = grad; g.fillRect(0, 0, c.width, c.height);
          cv = c;
        }
      }
    } catch (e) { cv = null; }
    m[r] = cv;
    return cv;
  }
  function glow(ctx, x, y, r, col, a) {
    const sp = glowSprite(col, r);
    if (!sp) return;
    ctx.save();
    ctx.globalAlpha = a == null ? 1 : a;
    ctx.globalCompositeOperation = 'lighter';
    try { ctx.drawImage(sp, x - r - 1, y - r - 1, r * 2 + 2, r * 2 + 2); } catch (e) { /* stub canvas */ }
    ctx.restore();
  }

  /* ------------------------------------------- illustrated overrides */
  // js/art.js may hold a PNG for any drawing here (see ART_PROMPTS.md). The
  // drawn art is always the fallback: no ART, no file, or a broken file all
  // land on the vector path.
  function artImg(kind, key) {
    if (typeof ART === 'undefined' || !ART || !ART.get || key == null) return null;
    try { const im = ART.get(kind, key); return im && (im.naturalWidth || im.width) ? im : null; } catch (e) { return null; }
  }
  const imW = (img) => img.naturalWidth || img.width || 1;
  const imH = (img) => img.naturalHeight || img.height || 1;
  function blit(ctx, img, x, y, w, h) { try { ctx.drawImage(img, x, y, w, h); } catch (e) { /* stub or broken image */ } }
  // Cover-fit: fills (x, y, w, h), cropping the overflow.
  function blitCover(ctx, img, x, y, w, h) {
    const k = Math.max(w / imW(img), h / imH(img)), dw = imW(img) * k, dh = imH(img) * k;
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    blit(ctx, img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    ctx.restore();
  }
  // Contain-fit: the whole picture inside a w x h box centred on (cx, cy).
  function blitContain(ctx, img, cx, cy, w, h) {
    const k = Math.min(w / imW(img), h / imH(img)), dw = imW(img) * k, dh = imH(img) * k;
    blit(ctx, img, cx - dw / 2, cy - dh / 2, dw, dh);
  }
  // One-colour silhouette of an image (hurt flash, frozen/poison tints),
  // built once per image + colour on a small offscreen canvas.
  const tintCache = new WeakMap();
  function tinted(img, col) {
    let m = tintCache.get(img);
    if (!m) { m = {}; tintCache.set(img, m); }
    if (m[col] !== undefined) return m[col];
    let cv = null;
    try {
      if (typeof document !== 'undefined' && document && document.createElement) {
        const k = Math.min(1, 384 / Math.max(imW(img), imH(img)));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(imW(img) * k)); c.height = Math.max(1, Math.round(imH(img) * k));
        const g = c.getContext && c.getContext('2d');
        if (g) {
          g.drawImage(img, 0, 0, c.width, c.height);
          g.globalCompositeOperation = 'source-in';
          g.fillStyle = col; g.fillRect(0, 0, c.width, c.height);
          cv = c;
        }
      }
    } catch (e) { cv = null; }
    m[col] = cv;
    return cv;
  }
  // Paints the silhouette over (x, y, w, h); without a canvas, a soft rect.
  function silhouette(ctx, img, x, y, w, h, col) {
    const sil = tinted(img, col);
    if (sil) blit(ctx, sil, x, y, w, h);
    else { ctx.beginPath(); rrect(ctx, x + w * 0.1, y + h * 0.1, w * 0.8, h * 0.9, Math.min(w, h) * 0.2); ctx.fillStyle = col; ctx.fill(); }
  }

  /* ======================================================== ITEM ART */
  // Each drawer fills a w x h box centred on the origin. c1/c2 are the
  // item tints from data (base / secondary).
  const IA = {};
  IA.sword = (ctx, w, h, c1, c2) => {
    const hw = w / 2, hh = h / 2, gl = w * 0.22, gw = Math.max(3, w * 0.07);
    const bx = -hw + gl + gw;
    tone(ctx, c => rrect(c, -hw, -hh * 0.5, gl + 2, h * 0.5, hh * 0.3), c2, -hw + gl / 2, 0, gl / 2, NOSPEC);
    tone(ctx, c => circ(c, -hw + hh * 0.6, 0, hh * 0.6), shade(c2, 0.2), -hw + hh * 0.6, 0, hh * 0.6);
    tone(ctx, c => poly(c, [bx, -hh * 0.6, hw - hh * 1.3, -hh * 0.6, hw, 0, hw - hh * 1.3, hh * 0.6, bx, hh * 0.6]), shade(c1, 0.08), (bx + hw) / 2, 0, (hw - bx) / 2, { dark: -0.4, spec: false });
    line(ctx, bx + 3, 0, hw - hh * 1.8, 0, shade(c1, -0.4), 1);
    line(ctx, bx + 2, -hh * 0.42, hw - hh * 1.4, -hh * 0.42, rgba('#ffffff', 0.7), 1);
    tone(ctx, c => rrect(c, bx - gw, -hh, gw, h, 1.5), shade(c2, 0.35), bx - gw / 2, 0, hh, NOSPEC);
  };
  IA.dagger = (ctx, w, h, c1, c2) => {
    const hw = w / 2, hh = h / 2, gl = w * 0.3;
    tone(ctx, c => rrect(c, -hw + 1, -hh * 0.45, gl, h * 0.45, hh * 0.3), c2, -hw + gl / 2, 0, gl / 2, NOSPEC);
    tone(ctx, c => circ(c, -hw + hh * 0.5, 0, hh * 0.5), shade(c2, -0.2), -hw + hh * 0.5, 0, hh * 0.5);
    const bx = -hw + gl;
    tone(ctx, c => poly(c, [bx, -hh * 0.55, hw * 0.45, -hh * 0.9, hw, 0, hw * 0.45, hh * 0.9, bx, hh * 0.55]), c1, (bx + hw) / 2, 0, (hw - bx) / 2);
    tone(ctx, c => ell(c, bx, 0, hh * 0.35, hh, 0), shade(c2, 0.3), bx, 0, hh, NOSPEC);
  };
  IA.axe = (ctx, w, h, c1, c2) => {
    const hw = w / 2, hh = h / 2;
    tone(ctx, c => rrect(c, -hw, -hh * 0.22, w * 0.82, hh * 0.44, hh * 0.15), c2, 0, 0, hw * 0.6, NOSPEC);
    const ax = hw - hh * 0.9;
    tone(ctx, c => { c.moveTo(ax - hh * 0.6, -hh); c.quadraticCurveTo(hw + hh * 0.3, -hh * 0.5, hw, 0); c.quadraticCurveTo(hw + hh * 0.3, hh * 0.5, ax - hh * 0.6, hh); c.quadraticCurveTo(ax - hh * 0.05, 0, ax - hh * 0.6, -hh); c.closePath(); }, c1, ax, 0, hh);
    line(ctx, hw - hh * 0.35, -hh * 0.6, hw - hh * 0.35, hh * 0.6, '#ffffff', 1.2);
  };
  IA.hammer = (ctx, w, h, c1, c2) => {
    const hw = w / 2, hh = h / 2, headW = Math.min(w * 0.36, hh * 2.2);
    tone(ctx, c => rrect(c, -hw, -hh * 0.24, w - headW * 0.6, hh * 0.48, hh * 0.15), c2, -hw * 0.3, 0, hw * 0.6, NOSPEC);
    tone(ctx, c => rrect(c, hw - headW, -hh, headW, h, hh * 0.25), c1, hw - headW / 2, 0, hh);
    line(ctx, hw - headW * 0.72, -hh * 0.7, hw - headW * 0.72, hh * 0.7, shade(c1, -0.4), 1.5);
  };
  IA.anvil = (ctx, w, h, c1, c2) => {
    const hw = w / 2, hh = h / 2;
    tone(ctx, c => rrect(c, -hw * 0.6, hh * 0.45, w * 0.6, hh * 0.55, 2), shade(c1, -0.2), -hw * 0.3, hh * 0.7, hw * 0.35, NOSPEC);
    tone(ctx, c => poly(c, [-hw * 0.4, -hh * 0.2, hw * 0.3, -hh * 0.2, hw * 0.15, hh * 0.5, -hw * 0.25, hh * 0.5]), shade(c1, -0.1), 0, hh * 0.15, hh * 0.35, NOSPEC);
    tone(ctx, c => { c.moveTo(-hw, -hh * 0.5); c.quadraticCurveTo(-hw * 0.6, -hh, -hw * 0.3, -hh); c.lineTo(hw, -hh); c.lineTo(hw, -hh * 0.1); c.lineTo(-hw * 0.3, -hh * 0.1); c.quadraticCurveTo(-hw * 0.7, -hh * 0.1, -hw, -hh * 0.5); c.closePath(); }, c1, hw * 0.2, -hh * 0.55, hw * 0.6);
    line(ctx, -hw * 0.2, -hh * 0.75, hw * 0.75, -hh * 0.75, c2, 1.5);
  };
  IA.shield = (ctx, w, h, c1, c2) => {
    const hw = w / 2, hh = h / 2;
    const p = c => { c.moveTo(-hw, -hh); c.lineTo(hw, -hh); c.lineTo(hw, hh * 0.1); c.quadraticCurveTo(hw, hh * 0.7, 0, hh); c.quadraticCurveTo(-hw, hh * 0.7, -hw, hh * 0.1); c.closePath(); };
    tone(ctx, p, c1, 0, -hh * 0.1, hw);
    ctx.save(); ctx.beginPath(); p(ctx); ctx.clip();
    F(ctx, c2); ctx.beginPath(); ctx.rect(-hw * 0.18, -hh, hw * 0.36, h); ctx.fill();
    ctx.beginPath(); ctx.rect(-hw, -hh * 0.45, w, hh * 0.35); ctx.fill();
    ctx.restore();
    F(ctx, shade(c1, 0.45));
    ctx.beginPath(); circ(ctx, -hw * 0.6, -hh * 0.7, 1.6); circ(ctx, hw * 0.6, -hh * 0.7, 1.6); ctx.fill();
  };
  IA.buckler = (ctx, w, h, c1, c2) => {
    const r = Math.min(w, h) / 2;
    tone(ctx, c => circ(c, 0, 0, r), c1, 0, 0, r);
    ctx.beginPath(); ctx.arc(0, 0, r * 0.62, 0, TAU); S(ctx, c2, Math.max(2, r * 0.16)); ctx.stroke();
    tone(ctx, c => circ(c, 0, 0, r * 0.28), c2, 0, 0, r * 0.28);
    F(ctx, INK);
    for (let i = 0; i < 6; i++) { const a = i * TAU / 6; ctx.beginPath(); ctx.arc(Math.cos(a) * r * 0.82, Math.sin(a) * r * 0.82, r * 0.07, 0, TAU); ctx.fill(); }
  };
  IA.potion = (ctx, w, h, c1, c2) => {
    const hw = w / 2, hh = h / 2, r = Math.min(hw, hh * 0.62), cy = hh - r;
    const nw = Math.max(3, r * 0.42);
    // glass body
    const body = c => { c.moveTo(-nw, -hh + hh * 0.3); c.lineTo(-nw, cy - r * 0.75); c.arc(0, cy, r, Math.PI * 1.3, Math.PI * 1.7, true); c.lineTo(nw, -hh + hh * 0.3); c.closePath(); };
    tone(ctx, body, rgba('#bfe8ff', 0.55), 0, cy, r, { spec: false, ol: 0 });
    // liquid
    ctx.save(); ctx.beginPath(); body(ctx); ctx.clip();
    tone(ctx, c => c.rect(-r, cy - r * 0.35, r * 2, r * 2), c1, 0, cy, r, { ol: 0, dark: -0.3 });
    if (!FLAT) { ctx.fillStyle = shade(c1, 0.5); ctx.beginPath(); circ(ctx, -r * 0.35, cy + r * 0.2, r * 0.12); circ(ctx, r * 0.2, cy + r * 0.5, r * 0.08); ctx.fill(); }
    ctx.restore();
    ctx.beginPath(); body(ctx); S(ctx, INK, OL); ctx.stroke();
    if (!FLAT) { ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.ellipse(-r * 0.45, cy - r * 0.3, r * 0.14, r * 0.35, 0.3, 0, TAU); ctx.fill(); }
    // cork
    tone(ctx, c => rrect(c, -nw - 1, -hh, nw * 2 + 2, hh * 0.32, 2), c2, 0, -hh + hh * 0.15, nw, NOSPEC);
  };
  IA.flask = (ctx, w, h, c1, c2) => {
    const hw = w / 2, hh = h / 2, nw = Math.max(3, hw * 0.28);
    const body = c => { c.moveTo(-nw, -hh + 3); c.lineTo(-nw, -hh * 0.3); c.lineTo(-hw, hh - 3); c.quadraticCurveTo(-hw, hh, -hw + 3, hh); c.lineTo(hw - 3, hh); c.quadraticCurveTo(hw, hh, hw, hh - 3); c.lineTo(nw, -hh * 0.3); c.lineTo(nw, -hh + 3); c.closePath(); };
    tone(ctx, body, rgba('#bfe8ff', 0.5), 0, hh * 0.3, hw, { spec: false, ol: 0 });
    ctx.save(); ctx.beginPath(); body(ctx); ctx.clip();
    tone(ctx, c => c.rect(-hw, hh * 0.2, w, hh), c1, 0, hh * 0.6, hw, { ol: 0 });
    ctx.restore();
    ctx.beginPath(); body(ctx); S(ctx, INK, OL); ctx.stroke();
    tone(ctx, c => rrect(c, -nw - 2, -hh, nw * 2 + 4, hh * 0.22, 2), c2, 0, -hh, nw, NOSPEC);
    if (!FLAT) { ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.beginPath(); ctx.moveTo(-hw * 0.55, hh * 0.75); ctx.lineTo(-hw * 0.25, -hh * 0.1); ctx.lineTo(-hw * 0.1, -hh * 0.1); ctx.lineTo(-hw * 0.35, hh * 0.75); ctx.fill(); }
  };
  IA.bomb = (ctx, w, h, c1, c2) => {
    const r = Math.min(w, h) / 2, br = r * 0.8, cy = r - br;
    tone(ctx, c => circ(c, 0, cy, br), c1, 0, cy, br, { dark: -0.5 });
    tone(ctx, c => rrect(c, -br * 0.3, cy - br - br * 0.12, br * 0.6, br * 0.3, 2), shade(c1, 0.3), 0, cy - br, br * 0.3, NOSPEC);
    ctx.beginPath(); ctx.moveTo(0, cy - br - 2); ctx.quadraticCurveTo(r * 0.1, -r * 0.9, r * 0.35, -r + 3);
    S(ctx, INK, OL + 1); ctx.stroke(); S(ctx, shade(c2, -0.3), 2); ctx.stroke();
    tone(ctx, c => star(c, r * 0.4, -r + 4, r * 0.2, 5, 0.5), c2, r * 0.4, -r + 4, r * 0.2, { ol: 1.5 });
  };
  IA.torch = (ctx, w, h, c1, c2) => {
    const hw = w / 2, hh = h / 2, sw = Math.max(3, hw * 0.34);
    tone(ctx, c => poly(c, [-sw, -hh * 0.15, sw, -hh * 0.15, sw * 0.6, hh, -sw * 0.6, hh]), c2, 0, hh * 0.4, hh * 0.5, NOSPEC);
    tone(ctx, c => rrect(c, -sw - 1.5, -hh * 0.25, sw * 2 + 3, hh * 0.16, 1), shade(c2, -0.4), 0, -hh * 0.17, sw, NOSPEC);
    tone(ctx, c => { c.moveTo(-hw, -hh * 0.2); c.quadraticCurveTo(-hw * 0.9, -hh * 0.75, 0, -hh); c.quadraticCurveTo(hw * 0.9, -hh * 0.75, hw, -hh * 0.2); c.closePath(); }, c1, 0, -hh * 0.55, hw, { dark: -0.15 });
    tone(ctx, c => { c.moveTo(-hw * 0.45, -hh * 0.2); c.quadraticCurveTo(-hw * 0.3, -hh * 0.6, 0, -hh * 0.75); c.quadraticCurveTo(hw * 0.3, -hh * 0.6, hw * 0.45, -hh * 0.2); c.closePath(); }, shade(c1, 0.55), 0, -hh * 0.45, hw * 0.4, { ol: 0, spec: false });
  };
  IA.iceshard = (ctx, w, h, c1, c2) => {
    const hw = w / 2, hh = h / 2;
    tone(ctx, c => poly(c, [-hw, 0, -hw * 0.35, -hh, hw * 0.3, -hh * 0.55, hw, hh * 0.1, hw * 0.2, hh, -hw * 0.5, hh * 0.5]), c1, 0, 0, hw, { dark: -0.25 });
    ctx.beginPath(); ctx.moveTo(-hw * 0.6, hh * 0.1); ctx.lineTo(hw * 0.6, -hh * 0.25); S(ctx, shade(c2, 0.4), 1.5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-hw * 0.3, -hh * 0.6); ctx.lineTo(hw * 0.1, hh * 0.6); S(ctx, rgba('#ffffff', 0.6), 1.2); ctx.stroke();
  };
  IA.snowball = (ctx, w, h, c1, c2) => {
    const r = Math.min(w, h) / 2;
    tone(ctx, c => circ(c, 0, 0, r), c1, 0, 0, r, { dark: -0.22 });
    F(ctx, shade(c2, -0.1));
    ctx.beginPath(); circ(ctx, -r * 0.2, r * 0.35, r * 0.1); circ(ctx, r * 0.4, -r * 0.05, r * 0.09); circ(ctx, r * 0.1, -r * 0.5, r * 0.07); ctx.fill();
  };
  IA.coin = (ctx, w, h, c1, c2) => {
    const r = Math.min(w, h) / 2;
    tone(ctx, c => circ(c, 0, 0, r), c1, 0, 0, r, { dark: -0.35 });
    ctx.beginPath(); ctx.arc(0, 0, r * 0.7, 0, TAU); S(ctx, shade(c2, -0.25), Math.max(1.5, r * 0.12)); ctx.stroke();
    tone(ctx, c => star(c, 0, r * 0.05, r * 0.42, 5, 0.5), c2, 0, 0, r * 0.4, { ol: 1.5, spec: false });
  };
  IA.gem = (ctx, w, h, c1, c2) => {
    const hw = w / 2, hh = h / 2, ty = -hh + hh * 0.7;
    tone(ctx, c => poly(c, [-hw * 0.6, -hh, hw * 0.6, -hh, hw, ty, 0, hh, -hw, ty]), c1, 0, -hh * 0.1, hw, { dark: -0.35 });
    if (!FLAT) {
      ctx.fillStyle = shade(c2, 0.35); ctx.beginPath(); poly(ctx, [-hw * 0.6, -hh + 1, hw * 0.6, -hh + 1, hw * 0.35, ty, -hw * 0.35, ty]); ctx.fill();
      ctx.strokeStyle = rgba('#ffffff', 0.55); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(-hw * 0.35, ty); ctx.lineTo(0, hh - 2); ctx.moveTo(hw * 0.35, ty); ctx.lineTo(0, hh - 2); ctx.moveTo(-hw + 1, ty); ctx.lineTo(hw - 1, ty); ctx.stroke();
    }
  };
  IA.rock = (ctx, w, h, c1, c2) => {
    const hw = w / 2, hh = h / 2;
    tone(ctx, c => poly(c, [-hw, hh * 0.2, -hw * 0.7, -hh * 0.6, -hw * 0.1, -hh, hw * 0.55, -hh * 0.75, hw, -hh * 0.05, hw * 0.75, hh, -hw * 0.55, hh]), c1, 0, 0, hw, { dark: -0.4 });
    ctx.beginPath(); ctx.moveTo(-hw * 0.3, -hh * 0.3); ctx.lineTo(hw * 0.05, hh * 0.05); ctx.lineTo(-hw * 0.1, hh * 0.5); S(ctx, shade(c2, -0.3), 1.5); ctx.stroke();
  };
  IA.slag = (ctx, w, h, c1, c2) => {
    const hw = w / 2, hh = h / 2;
    tone(ctx, c => poly(c, [-hw, hh * 0.4, -hw * 0.8, -hh * 0.3, -hw * 0.3, -hh * 0.7, hw * 0.1, -hh, hw * 0.6, -hh * 0.5, hw, hh * 0.1, hw * 0.6, hh, -hw * 0.4, hh]), c1, 0, 0, hw, { dark: -0.5 });
    ctx.beginPath(); ctx.moveTo(-hw * 0.6, hh * 0.2); ctx.lineTo(-hw * 0.2, -hh * 0.2); ctx.lineTo(hw * 0.2, hh * 0.1); ctx.lineTo(hw * 0.6, -hh * 0.3);
    S(ctx, c2, 2.5); ctx.stroke(); S(ctx, shade(c2, 0.6), 1); ctx.stroke();
  };
  IA.iceblock = (ctx, w, h, c1, c2) => {
    const hw = w / 2, hh = h / 2;
    tone(ctx, c => rrect(c, -hw, -hh, w, h, Math.min(hw, hh) * 0.3), rgba(c1, 0.85), 0, 0, Math.max(hw, hh), { dark: -0.2 });
    ctx.beginPath(); ctx.moveTo(-hw * 0.5, -hh * 0.6); ctx.lineTo(-hw * 0.1, 0); ctx.lineTo(hw * 0.4, hh * 0.5); ctx.moveTo(-hw * 0.1, 0); ctx.lineTo(hw * 0.35, -hh * 0.35);
    S(ctx, rgba('#ffffff', 0.8), 1.5); ctx.stroke();
    if (!FLAT) { ctx.fillStyle = rgba('#ffffff', 0.5); ctx.beginPath(); rrect(ctx, -hw * 0.75, -hh * 0.78, hw * 0.35, hh * 0.22, 2); ctx.fill(); }
    if (c2) { ctx.beginPath(); rrect(ctx, -hw + 2, -hh + 2, w - 4, h - 4, 3); S(ctx, rgba(c2, 0.5), 1); ctx.stroke(); }
  };
  IA.apple = (ctx, w, h, c1, c2) => {
    const hw = w / 2, hh = h / 2, r = Math.min(hw, hh * 0.85);
    tone(ctx, c => { c.moveTo(0, -hh * 0.55); c.bezierCurveTo(-r * 0.2, -hh, -hw, -hh * 0.9, -hw, -hh * 0.1); c.bezierCurveTo(-hw, hh * 0.6, -r * 0.5, hh, 0, hh * 0.85); c.bezierCurveTo(r * 0.5, hh, hw, hh * 0.6, hw, -hh * 0.1); c.bezierCurveTo(hw, -hh * 0.9, r * 0.2, -hh, 0, -hh * 0.55); c.closePath(); }, c1, 0, hh * 0.1, r);
    limb(ctx, 0, -hh * 0.55, hw * 0.15, -hh, 2, shade(c2, -0.4));
    tone(ctx, c => ell(c, hw * 0.35, -hh * 0.8, hw * 0.3, hh * 0.13, -0.5), c2, hw * 0.35, -hh * 0.8, hw * 0.3, { ol: 1.5, spec: false });
  };
  IA.bread = (ctx, w, h, c1, c2) => {
    const hw = w / 2, hh = h / 2;
    tone(ctx, c => rrect(c, -hw, -hh, w, h, Math.min(hw, hh) * 0.75), c1, 0, 0, hw, { dark: -0.28 });
    ctx.beginPath();
    for (let i = -1; i <= 1; i++) { ctx.moveTo(i * hw * 0.42 - hh * 0.3, -hh * 0.4); ctx.lineTo(i * hw * 0.42 + hh * 0.3, hh * 0.3); }
    S(ctx, shade(c2, -0.35), Math.max(1.5, hh * 0.18)); ctx.stroke();
  };
  IA.book = (ctx, w, h, c1, c2) => {
    const hw = w / 2, hh = h / 2, sp = Math.max(4, w * 0.16);
    tone(ctx, c => rrect(c, -hw, -hh, w, h, 2), c1, 0, 0, Math.max(hw, hh), { dark: -0.3 });
    tone(ctx, c => rrect(c, -hw, -hh, sp, h, 2), c2, -hw + sp / 2, 0, hh, NOSPEC);
    ctx.beginPath(); ctx.rect(hw - sp * 0.4, -hh + 3, sp * 0.4 - 1, h - 6);
    F(ctx, '#f4ecd6'); ctx.fill(); S(ctx, INK, 1.2); ctx.stroke();
    ctx.beginPath(); rrect(ctx, -hw + sp + 3, -hh * 0.45, w * 0.4, hh * 0.9, 1.5); S(ctx, shade(c2, 0.4), 1.2); ctx.stroke();
  };
  IA.scroll = (ctx, w, h, c1, c2) => {
    const hw = w / 2, hh = h / 2, rr = Math.min(hh, w * 0.14);
    tone(ctx, c => c.rect(-hw + rr, -hh * 0.8, w - rr * 2, h * 0.8), c1, 0, 0, hw, { dark: -0.15, spec: false });
    ctx.beginPath();
    for (let i = -1; i <= 1; i++) { ctx.moveTo(-hw + rr * 1.8, i * hh * 0.42); ctx.lineTo(hw - rr * 1.8 - (i === 1 ? w * 0.15 : 0), i * hh * 0.42); }
    S(ctx, c2, Math.max(1.2, hh * 0.12)); ctx.stroke();
    tone(ctx, c => rrect(c, -hw, -hh, rr * 2, h, rr), shade(c1, -0.12), -hw + rr, 0, hh, NOSPEC);
    tone(ctx, c => rrect(c, hw - rr * 2, -hh, rr * 2, h, rr), shade(c1, -0.12), hw - rr, 0, hh, NOSPEC);
  };
  IA.orb = (ctx, w, h, c1, c2) => {
    const r = Math.min(w, h) / 2;
    tone(ctx, c => circ(c, 0, 0, r), c1, 0, 0, r, { dark: -0.45, spec: false });
    if (!FLAT) {
      ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r - 1, 0, TAU); ctx.clip();
      ctx.strokeStyle = rgba(c2, 0.8); ctx.lineWidth = Math.max(1.5, r * 0.16); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-r * 0.6, r * 0.3); ctx.bezierCurveTo(-r * 0.2, -r * 0.6, r * 0.3, r * 0.6, r * 0.7, -r * 0.2); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.ellipse(-r * 0.4, -r * 0.42, r * 0.28, r * 0.16, -0.75, 0, TAU); ctx.fill();
      ctx.restore();
    }
  };
  IA.ring = (ctx, w, h, c1, c2) => {
    const hw = w / 2, hh = h / 2, r = Math.min(hw, hh * 0.8), cy = hh - r, band = Math.max(3, r * 0.3);
    ctx.beginPath(); ctx.arc(0, cy, r - band / 2, 0, TAU);
    S(ctx, INK, band + OL * 1.5); ctx.stroke();
    S(ctx, c1, band); ctx.stroke();
    if (!FLAT) { ctx.strokeStyle = rgba('#ffffff', 0.45); ctx.lineWidth = band * 0.35; ctx.beginPath(); ctx.arc(0, cy, r - band / 2, Math.PI * 0.95, Math.PI * 1.35); ctx.stroke(); }
    const gr = Math.min(hw * 0.5, hh - cy + r * 0.2, r * 0.7);
    tone(ctx, c => poly(c, [-gr, -hh + gr * 0.9, -gr * 0.5, -hh, gr * 0.5, -hh, gr, -hh + gr * 0.9, 0, -hh + gr * 1.9]), c2, 0, -hh + gr, gr, { dark: -0.35 });
  };
  IA.key = (ctx, w, h, c1, c2) => {
    const hw = w / 2, hh = h / 2, br = Math.min(hh, w * 0.24), sh = Math.max(3, hh * 0.32);
    tone(ctx, c => rrect(c, -hw + br, -sh / 2, w - br, sh, 1), c1, 0, 0, hw * 0.5, NOSPEC);
    tone(ctx, c => c.rect(hw - sh * 0.9, 0, sh * 0.6, hh), c1, hw - sh * 0.6, hh * 0.5, hh * 0.5, NOSPEC);
    tone(ctx, c => c.rect(hw - sh * 2.2, 0, sh * 0.6, hh * 0.75), c1, hw - sh * 1.9, hh * 0.4, hh * 0.4, NOSPEC);
    tone(ctx, c => circ(c, -hw + br, 0, br), c1, -hw + br, 0, br, { dark: -0.3 });
    F(ctx, c2 || INK); ctx.beginPath(); ctx.arc(-hw + br, 0, br * 0.42, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(-hw + br, 0, br * 0.42, 0, TAU); S(ctx, INK, 1.5); ctx.stroke();
  };
  IA.chain = (ctx, w, h, c1, c2) => {
    const hw = w / 2, hh = h / 2, n = Math.max(2, Math.round(w / (hh * 2.4))), lw = w / n;
    for (let i = 0; i < n; i++) {
      const cx = -hw + lw * (i + 0.5);
      ctx.beginPath(); ctx.ellipse(cx, 0, lw * 0.55, i % 2 ? hh * 0.45 : hh * 0.85, 0, 0, TAU);
      S(ctx, INK, Math.max(3, hh * 0.45) + OL); ctx.stroke();
      S(ctx, i % 2 ? shade(c2 || c1, -0.15) : c1, Math.max(3, hh * 0.45)); ctx.stroke();
      if (!FLAT) { ctx.strokeStyle = rgba('#ffffff', 0.4); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(cx, 0, lw * 0.55, i % 2 ? hh * 0.45 : hh * 0.85, 0, Math.PI * 1.1, Math.PI * 1.5); ctx.stroke(); }
    }
  };
  IA.horn = (ctx, w, h, c1, c2) => {
    const hw = w / 2, hh = h / 2;
    tone(ctx, c => { c.moveTo(-hw, hh * 0.1); c.quadraticCurveTo(-hw * 0.6, -hh, hw * 0.4, -hh); c.quadraticCurveTo(hw, -hh, hw, -hh * 0.2); c.quadraticCurveTo(hw, hh * 0.35, hw * 0.35, hh * 0.05); c.quadraticCurveTo(-hw * 0.2, -hh * 0.2, -hw * 0.6, hh); c.closePath(); }, c1, hw * 0.2, -hh * 0.3, hw * 0.7, { dark: -0.35 });
    tone(ctx, c => ell(c, hw * 0.55, -hh * 0.1, hw * 0.18, hh * 0.5, 0.3), c2, hw * 0.55, -hh * 0.1, hh * 0.4, NOSPEC);
    tone(ctx, c => ell(c, -hw * 0.8, hh * 0.55, hw * 0.16, hh * 0.28, -0.6), shade(c2, -0.2), -hw * 0.8, hh * 0.55, hh * 0.25, NOSPEC);
  };
  IA.whetstone = (ctx, w, h, c1, c2) => {
    const hw = w / 2, hh = h / 2;
    tone(ctx, c => rrect(c, -hw, -hh, w, h, Math.min(hh, hw) * 0.5), c1, 0, 0, hw, { dark: -0.3 });
    line(ctx, -hw * 0.7, 0, hw * 0.7, 0, shade(c2, -0.3), Math.max(1.5, hh * 0.22));
    F(ctx, shade(c2, 0.35)); ctx.beginPath(); circ(ctx, -hw * 0.5, -hh * 0.5, 1.2); circ(ctx, hw * 0.3, hh * 0.5, 1.2); circ(ctx, hw * 0.6, -hh * 0.45, 1.2); ctx.fill();
  };
  IA.feather = (ctx, w, h, c1, c2) => {
    const hw = w / 2, hh = h / 2;
    tone(ctx, c => { c.moveTo(-hw, hh * 0.3); c.quadraticCurveTo(-hw * 0.3, -hh, hw * 0.5, -hh); c.quadraticCurveTo(hw * 1.05, -hh, hw, -hh * 0.2); c.quadraticCurveTo(hw * 0.9, hh, hw * 0.2, hh); c.quadraticCurveTo(-hw * 0.5, hh, -hw, hh * 0.3); c.closePath(); }, c1, hw * 0.1, 0, hw * 0.8, { dark: -0.22 });
    ctx.beginPath(); ctx.moveTo(-hw, hh * 0.3); ctx.quadraticCurveTo(0, hh * 0.1, hw * 0.9, -hh * 0.2);
    S(ctx, shade(c2, -0.2), Math.max(1.5, hh * 0.22)); ctx.stroke();
    ctx.beginPath();
    for (let i = 1; i <= 4; i++) { const u = i / 5, x = -hw * 0.6 + w * 0.75 * u, y = hh * 0.2 - hh * 0.35 * u; ctx.moveTo(x, y); ctx.lineTo(x + hw * 0.12, y - hh * 0.7); }
    S(ctx, rgba(INK, 0.35), 1); ctx.stroke();
  };
  IA.skull = (ctx, w, h, c1, c2) => {
    const hw = w / 2, hh = h / 2, r = Math.min(hw, hh * 0.72);
    tone(ctx, c => rrect(c, -r * 0.62, hh - hh * 0.5, r * 1.24, hh * 0.5, 2), c1, 0, hh * 0.75, r * 0.6, NOSPEC);
    tone(ctx, c => circ(c, 0, -hh + r, r), c1, 0, -hh + r, r, { dark: -0.25 });
    F(ctx, c2 || INK);
    ctx.beginPath(); circ(ctx, -r * 0.4, -hh + r * 0.95, r * 0.3); circ(ctx, r * 0.4, -hh + r * 0.95, r * 0.3); ctx.fill();
    ctx.beginPath(); poly(ctx, [0, -hh + r * 1.3, -r * 0.14, -hh + r * 1.62, r * 0.14, -hh + r * 1.62]); ctx.fill();
    ctx.beginPath();
    for (let i = -1; i <= 1; i++) { ctx.moveTo(i * r * 0.3, hh * 0.5); ctx.lineTo(i * r * 0.3, hh - 2); }
    S(ctx, INK, 1.5); ctx.stroke();
  };
  IA.star = (ctx, w, h, c1, c2) => {
    const r = Math.min(w, h) / 2;
    tone(ctx, c => star(c, 0, 0, r, 5, 0.48), c1, 0, 0, r * 0.9, { dark: -0.35 });
    F(ctx, shade(c2 || c1, 0.5)); ctx.beginPath(); ctx.arc(-r * 0.15, -r * 0.05, r * 0.16, 0, TAU); ctx.fill();
  };
  IA.boot = (ctx, w, h, c1, c2) => {
    const hw = w / 2, hh = h / 2, sw = Math.min(w * 0.5, hh * 1.1);
    tone(ctx, c => { c.moveTo(-hw, -hh); c.lineTo(-hw + sw, -hh); c.lineTo(-hw + sw, hh * 0.25); c.quadraticCurveTo(hw, hh * 0.1, hw, hh * 0.75); c.lineTo(hw, hh); c.lineTo(-hw, hh); c.closePath(); }, c1, -hw + sw * 0.5, 0, hh, { dark: -0.3 });
    tone(ctx, c => rrect(c, -hw, hh * 0.65, w, hh * 0.35, 2), shade(c2, -0.4), 0, hh * 0.8, hw, NOSPEC);
    tone(ctx, c => rrect(c, -hw, -hh, sw, hh * 0.3, 2), c2, -hw + sw / 2, -hh * 0.85, sw / 2, NOSPEC);
    ctx.beginPath(); ctx.moveTo(-hw + sw * 0.35, -hh * 0.55); ctx.lineTo(-hw + sw * 0.75, -hh * 0.3); ctx.moveTo(-hw + sw * 0.35, -hh * 0.25); ctx.lineTo(-hw + sw * 0.75, 0);
    S(ctx, shade(c2, 0.3), 1.3); ctx.stroke();
  };
  IA.bone = (ctx, w, h, c1, c2) => {
    const hw = w / 2, hh = h / 2, kr = Math.min(hh * 0.62, w * 0.14);
    tone(ctx, c => rrect(c, -hw + kr, -hh * 0.4, w - kr * 2, hh * 0.8, hh * 0.3), c1, 0, 0, hw, { dark: -0.22 });
    const knob = (x, s) => tone(ctx, c => { circ(c, x, -hh + kr, kr); circ(c, x, hh - kr, kr); }, c1, x, s * 0, kr, { dark: -0.22 });
    knob(-hw + kr, -1); knob(hw - kr, 1);
    line(ctx, -hw + kr * 2.2, 0, hw - kr * 2.2, 0, shade(c2 || c1, -0.25), 1.2);
  };
  IA.bottle = (ctx, w, h, c1, c2) => {
    const hw = w / 2, hh = h / 2, nw = Math.max(3, hw * 0.35);
    const body = c => { c.moveTo(-nw, -hh + hh * 0.2); c.lineTo(-nw, -hh * 0.35); c.quadraticCurveTo(-hw, -hh * 0.2, -hw, hh * 0.1); c.lineTo(-hw, hh - 3); c.quadraticCurveTo(-hw, hh, -hw + 3, hh); c.lineTo(hw - 3, hh); c.quadraticCurveTo(hw, hh, hw, hh - 3); c.lineTo(hw, hh * 0.1); c.quadraticCurveTo(hw, -hh * 0.2, nw, -hh * 0.35); c.lineTo(nw, -hh + hh * 0.2); c.closePath(); };
    tone(ctx, body, c1, 0, hh * 0.3, hw, { dark: -0.35 });
    tone(ctx, c => c.rect(-hw + 1.5, hh * 0.15, w - 3, hh * 0.5), c2 || '#f4ecd6', 0, hh * 0.4, hw, { ol: 1.5, spec: false, dark: -0.1 });
    tone(ctx, c => rrect(c, -nw - 1.5, -hh, nw * 2 + 3, hh * 0.22, 1.5), shade(c1, -0.4), 0, -hh, nw, NOSPEC);
    if (!FLAT) { ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.beginPath(); ctx.rect(-hw * 0.7, -hh * 0.15, hw * 0.2, hh * 0.25); ctx.fill(); }
  };
  IA.heart = (ctx, w, h, c1, c2) => {
    const hw = w / 2, hh = h / 2;
    tone(ctx, c => { c.moveTo(0, hh); c.bezierCurveTo(-hw * 0.2, hh * 0.6, -hw, hh * 0.2, -hw, -hh * 0.35); c.bezierCurveTo(-hw, -hh, -hw * 0.1, -hh, 0, -hh * 0.45); c.bezierCurveTo(hw * 0.1, -hh, hw, -hh, hw, -hh * 0.35); c.bezierCurveTo(hw, hh * 0.2, hw * 0.2, hh * 0.6, 0, hh); c.closePath(); }, c1, 0, -hh * 0.15, hw, { dark: -0.32 });
    if (c2 && !FLAT) { ctx.fillStyle = shade(c2, 0.5); ctx.beginPath(); ctx.ellipse(-hw * 0.5, -hh * 0.5, hw * 0.18, hh * 0.12, -0.6, 0, TAU); ctx.fill(); }
  };
  IA.lantern = (ctx, w, h, c1, c2) => {
    const hw = w / 2, hh = h / 2, cap = hh * 0.22;
    tone(ctx, c => rrect(c, -hw * 0.75, hh - cap, hw * 1.5, cap, 2), c1, 0, hh - cap / 2, hw * 0.7, NOSPEC);
    tone(ctx, c => rrect(c, -hw * 0.62, -hh + cap * 1.4, hw * 1.24, h - cap * 2.4, 3), c2, 0, 0, hw * 0.6, { dark: -0.1 });
    if (!FLAT) { ctx.fillStyle = rgba('#ffffff', 0.55); ctx.beginPath(); ctx.ellipse(0, hh * 0.05, hw * 0.25, hh * 0.3, 0, 0, TAU); ctx.fill(); }
    ctx.beginPath(); ctx.moveTo(-hw * 0.2, -hh + cap * 1.4); ctx.lineTo(-hw * 0.2, hh - cap); ctx.moveTo(hw * 0.2, -hh + cap * 1.4); ctx.lineTo(hw * 0.2, hh - cap); S(ctx, shade(c1, -0.3), 1.5); ctx.stroke();
    tone(ctx, c => poly(c, [-hw * 0.8, -hh + cap * 1.4, hw * 0.8, -hh + cap * 1.4, hw * 0.35, -hh + cap * 0.5, -hw * 0.35, -hh + cap * 0.5]), c1, 0, -hh + cap, hw * 0.7, NOSPEC);
    ctx.beginPath(); ctx.arc(0, -hh + cap * 0.5, cap * 0.45, Math.PI, 0); S(ctx, INK, OL + 1); ctx.stroke(); S(ctx, c1, 2); ctx.stroke();
  };
  IA.wand = (ctx, w, h, c1, c2) => {
    const hw = w / 2, hh = h / 2, sr = Math.min(hh * 1.3, w * 0.22), st = Math.max(3, hh * 0.7);
    tone(ctx, c => rrect(c, -hw, -st / 2, w - sr, st, st * 0.4), c2, 0, 0, hw * 0.5, NOSPEC);
    tone(ctx, c => rrect(c, -hw, -st * 0.7, w * 0.22, st * 1.4, 1.5), shade(c2, -0.4), -hw + w * 0.11, 0, hh * 0.3, NOSPEC);
    tone(ctx, c => star(c, hw - sr, 0, sr, 5, 0.5), c1, hw - sr, 0, sr * 0.8, { dark: -0.25, ol: 2 });
    if (!FLAT) { ctx.strokeStyle = rgba('#ffffff', 0.7); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(hw - sr * 2.4, -hh * 0.75); ctx.lineTo(hw - sr * 2.4, -hh * 0.4); ctx.moveTo(hw - sr * 2.6, -hh * 0.58); ctx.lineTo(hw - sr * 2.2, -hh * 0.58); ctx.stroke(); }
  };
  IA.mask = (ctx, w, h, c1, c2) => {
    const hw = w / 2, hh = h / 2;
    tone(ctx, c => { c.moveTo(-hw, -hh * 0.5); c.quadraticCurveTo(-hw, -hh, 0, -hh); c.quadraticCurveTo(hw, -hh, hw, -hh * 0.5); c.quadraticCurveTo(hw, hh * 0.6, 0, hh); c.quadraticCurveTo(-hw, hh * 0.6, -hw, -hh * 0.5); c.closePath(); }, c1, 0, -hh * 0.1, hw, { dark: -0.28 });
    F(ctx, c2 || INK);
    ctx.beginPath(); ctx.ellipse(-hw * 0.42, -hh * 0.3, hw * 0.24, hh * 0.16, 0.3, 0, TAU); ctx.ellipse(hw * 0.42, -hh * 0.3, hw * 0.24, hh * 0.16, -0.3, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-hw * 0.4, hh * 0.35); ctx.quadraticCurveTo(0, hh * 0.75, hw * 0.4, hh * 0.35); ctx.quadraticCurveTo(0, hh * 0.5, -hw * 0.4, hh * 0.35); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-hw * 0.9, -hh * 0.45); ctx.lineTo(-hw, -hh * 0.1); ctx.moveTo(hw * 0.9, -hh * 0.45); ctx.lineTo(hw, -hh * 0.1); S(ctx, c2 || INK, 1.5); ctx.stroke();
  };
  IA.egg = (ctx, w, h, c1, c2) => {
    const hw = w / 2, hh = h / 2;
    tone(ctx, c => { c.moveTo(0, -hh); c.bezierCurveTo(hw * 0.9, -hh, hw, hh * 0.1, hw, hh * 0.3); c.bezierCurveTo(hw, hh * 0.75, hw * 0.55, hh, 0, hh); c.bezierCurveTo(-hw * 0.55, hh, -hw, hh * 0.75, -hw, hh * 0.3); c.bezierCurveTo(-hw, hh * 0.1, -hw * 0.9, -hh, 0, -hh); c.closePath(); }, c1, 0, hh * 0.1, hw, { dark: -0.25 });
    F(ctx, c2 || shade(c1, -0.3));
    ctx.beginPath(); circ(ctx, -hw * 0.3, hh * 0.2, hw * 0.16); circ(ctx, hw * 0.35, -hh * 0.2, hw * 0.13); circ(ctx, hw * 0.15, hh * 0.5, hw * 0.11); ctx.fill();
  };
  IA.dice = (ctx, w, h, c1, c2) => {
    const hw = w / 2, hh = h / 2, r = Math.min(hw, hh);
    tone(ctx, c => rrect(c, -hw, -hh, w, h, r * 0.3), c1, 0, 0, r, { dark: -0.28 });
    F(ctx, c2 || INK); const pr = Math.max(1.5, r * 0.14);
    ctx.beginPath();
    for (const [px, py] of [[-0.5, -0.5], [0.5, -0.5], [0, 0], [-0.5, 0.5], [0.5, 0.5]]) circ(ctx, px * r, py * r, pr);
    ctx.fill();
  };
  // Unknown art key: a labelled crate. Never throws, always visible.
  IA.crate = (ctx, w, h, c1, c2, label) => {
    const hw = w / 2, hh = h / 2;
    tone(ctx, c => rrect(c, -hw, -hh, w, h, 2), c1 || '#b07a3c', 0, 0, Math.max(hw, hh), { dark: -0.3 });
    ctx.beginPath(); ctx.moveTo(-hw, -hh); ctx.lineTo(hw, hh); ctx.moveTo(hw, -hh); ctx.lineTo(-hw, hh); S(ctx, c2 || shade(c1 || '#b07a3c', -0.4), 2); ctx.stroke();
    if (label) txt(ctx, String(label).slice(0, 6), 0, 0, Math.max(6, Math.min(10, h * 0.4)), '#fff', true, 'center', true);
  };
  const ITEM_KEYS = ['sword', 'dagger', 'axe', 'hammer', 'anvil', 'shield', 'buckler', 'potion', 'flask', 'bomb', 'torch', 'iceshard', 'snowball', 'coin', 'gem', 'rock', 'slag', 'iceblock', 'apple', 'bread', 'book', 'scroll', 'orb', 'ring', 'key', 'chain', 'horn', 'whetstone', 'feather', 'skull', 'star', 'boot', 'bone', 'bottle', 'heart', 'lantern', 'wand', 'mask', 'egg', 'dice'];
  const ITEM_DEFAULT = { sword: ['#c9d3e0', '#8a5a2b'], dagger: ['#c9d3e0', '#4a3a6a'], axe: ['#c9d3e0', '#8a5a2b'], hammer: ['#8e98a8', '#8a5a2b'], anvil: ['#5a6373', '#c9d3e0'], shield: ['#3b6fd6', '#ffc94d'], buckler: ['#8e98a8', '#ffc94d'], potion: ['#ff2e88', '#8a5a2b'], flask: ['#a6ff5e', '#8a5a2b'], bomb: ['#2b2340', '#ffc94d'], torch: ['#ff8a2b', '#8a5a2b'], iceshard: ['#9fe4ff', '#ffffff'], snowball: ['#f4f8ff', '#9fc8e8'], coin: ['#ffc94d', '#c98a1a'], gem: ['#2ee6d6', '#ffffff'], rock: ['#8e8a86', '#5a5652'], slag: ['#3a2f2f', '#ff8a2b'], iceblock: ['#bfe8ff', '#ffffff'], apple: ['#ff5a4a', '#a6ff5e'], bread: ['#d9a05b', '#8a5a2b'], book: ['#7a3b9c', '#ffc94d'], scroll: ['#f4ecd6', '#8a5a2b'], orb: ['#7a3bff', '#2ee6d6'], ring: ['#ffc94d', '#ff2e88'], key: ['#ffc94d', '#12091f'], chain: ['#8e98a8', '#5a6373'], horn: ['#f1e2c6', '#ffc94d'], whetstone: ['#7f8896', '#3a3f4a'], feather: ['#f4f8ff', '#8e98a8'], skull: ['#f1e9d6', '#12091f'], star: ['#ffc94d', '#ffffff'], boot: ['#8a5a2b', '#5a3a1b'], bone: ['#f1e9d6', '#c9b89a'], bottle: ['#2e8f5a', '#f4ecd6'], heart: ['#ff5a4a', '#ffffff'], lantern: ['#5a6373', '#ffc94d'], wand: ['#ffc94d', '#8a5a2b'], mask: ['#f4ecd6', '#12091f'], egg: ['#f4f8ff', '#8e98a8'], dice: ['#f4f8ff', '#12091f'] };

  const ORIENT = { sword: 'h', dagger: 'h', axe: 'h', hammer: 'h', wand: 'h', key: 'h', chain: 'h', bone: 'h', feather: 'h', scroll: 'h', whetstone: 'h', iceshard: 'h', torch: 'v', potion: 'v', flask: 'v', bottle: 'v', lantern: 'v', egg: 'v', book: 'v', boot: 'v' };
  // Physics bounds of a def -> {w, h}. Missing/odd shapes get a 32px box.
  function shapeDims(shape) {
    if (!shape) return dims32;
    if (shape.kind === 'circle') { const r = +shape.r || 16; return dimsOf(r * 2, r * 2); }
    if (shape.kind === 'box') return dimsOf(+shape.w || 32, +shape.h || 32);
    if (shape.kind === 'poly' && shape.verts && shape.verts.length) {
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const v of shape.verts) { if (v.x < x0) x0 = v.x; if (v.x > x1) x1 = v.x; if (v.y < y0) y0 = v.y; if (v.y > y1) y1 = v.y; }
      return dimsOf(x1 - x0, y1 - y0);
    }
    return dims32;
  }
  const dimsTmp = { w: 32, h: 32 };
  const dims32 = { w: 32, h: 32 };
  function dimsOf(w, h) { dimsTmp.w = Math.max(6, w); dimsTmp.h = Math.max(6, h); return dimsTmp; }

  // An item PNG stretched over the physics bounds (poly: its bbox). A picture
  // whose orientation disagrees with the body (a blade-right sword in a tall
  // box) is turned a quarter first, like the drawn art.
  function itemImage(ctx, img, shape, w, h) {
    if (shape && shape.kind === 'poly' && shape.verts && shape.verts.length) {
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const v of shape.verts) { if (v.x < x0) x0 = v.x; if (v.x > x1) x1 = v.x; if (v.y < y0) y0 = v.y; if (v.y > y1) y1 = v.y; }
      ctx.translate((x0 + x1) / 2, (y0 + y1) / 2);
    }
    const iw = imW(img), ih = imH(img);
    if (iw > ih * 1.15 && h > w * 1.15) { ctx.rotate(-Math.PI / 2); blit(ctx, img, -h / 2, -w / 2, h, w); }
    else if (ih > iw * 1.15 && w > h * 1.15) { ctx.rotate(Math.PI / 2); blit(ctx, img, -h / 2, -w / 2, h, w); }
    else blit(ctx, img, -w / 2, -h / 2, w, h);
  }

  /* RENDER.item(ctx, def, x, y, angle, scale, opts)
     def.shape sets the exact box the art fills; def.color/color2 tint it. */
  function item(ctx, def, x, y, angle, scale, opts) {
    ctx.save();
    try {
      def = def || {};
      opts = opts || {};
      const d = shapeDims(def.shape), w = d.w, h = d.h;
      const s = scale == null ? 1 : scale;
      const key = def.art;
      const fn = IA[key] && key !== 'crate' ? IA[key] : null;
      const dflt = ITEM_DEFAULT[key] || ITEM_DEFAULT.rock;
      const c1 = def.color || dflt[0], c2 = def.color2 || dflt[1];
      const R = Math.max(w, h) / 2;
      const img = artImg('itemId', def.id) || artImg('item', key);
      ctx.translate(x || 0, y || 0);
      if (opts.alpha != null) ctx.globalAlpha = opts.alpha;
      if (opts.glow) glow(ctx, 0, 0, R * 1.8 * s, opts.glow === true ? PAL.gold : opts.glow, opts.glowA == null ? 0.9 : opts.glowA);
      ctx.rotate(angle || 0);
      ctx.scale(s, s);
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      if (opts.plus) {
        // gold rim behind the ink outline
        ctx.beginPath(); rrect(ctx, -w / 2 - 2, -h / 2 - 2, w + 4, h + 4, Math.min(w, h) * 0.35);
        S(ctx, rgba(PAL.gold, 0.85), 3); ctx.stroke();
      }
      // Long items have a natural orientation; a vertical sword body gets
      // the horizontal drawing rotated to stand up (and vice versa).
      const nat = ORIENT[key];
      ctx.save();
      if (img) itemImage(ctx, img, def.shape, w, h);
      else if (nat === 'h' && h > w * 1.15) { ctx.rotate(-Math.PI / 2); if (fn) fn(ctx, h, w, c1, c2); }
      else if (nat === 'v' && w > h * 1.15) { ctx.rotate(Math.PI / 2); if (fn) fn(ctx, h, w, c1, c2); }
      else if (fn) fn(ctx, w, h, c1, c2);
      else IA.crate(ctx, w, h, def.color, def.color2, key || def.id || '?');
      ctx.restore();
      if (opts.plus) {
        const br = Math.max(5, Math.min(9, R * 0.4));
        tone(ctx, c => star(c, w / 2 - br * 0.3, -h / 2 + br * 0.3, br, 5, 0.5), PAL.gold, w / 2, -h / 2, br, { ol: 1.5, dark: -0.3 });
        txt(ctx, '+', w / 2 - br * 0.3, -h / 2 + br * 0.4, br * 1.3, INK, true);
      }
      if (opts.frozen) {
        const fw = w + 8, fh = h + 8;
        ctx.beginPath(); rrect(ctx, -fw / 2, -fh / 2, fw, fh, 5);
        F(ctx, rgba('#bfe8ff', 0.55)); ctx.fill();
        S(ctx, rgba('#e8f8ff', 0.9), 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-fw * 0.35, -fh * 0.4); ctx.lineTo(-fw * 0.1, 0); ctx.lineTo(fw * 0.25, fh * 0.35); ctx.moveTo(-fw * 0.1, 0); ctx.lineTo(fw * 0.2, -fh * 0.25);
        S(ctx, rgba('#ffffff', 0.85), 1.5); ctx.stroke();
      }
    } catch (e) { /* art must never throw */ }
    ctx.restore();
  }

  /* ============================================ CABINET MATERIALS (item fx) */
  // The standing looks of an item's material in the cabinet, drawn around
  // RENDER.item with the same (x, y, angle, scale). layer 'back' goes under
  // the art (glows), 'front' over it (liquid, cracks, sparkles, the fuse).
  // st: {mat (PHYS.materialOf), t, seed, crack 0..2, slosh rad, fuse turns
  // (0 = unlit), golden, mag 0..1 (in the magnet's pull), melt 0..1 (drips),
  // lucky}. layer 'top' is the fuse countdown badge, drawn over the whole pile.
  // Pure drawing; never throws; allocation free.
  const NOTRAITS = {};
  const CRACKS = [[-0.42, -0.3, -0.08, -0.02, 0.1, 0.34, 0.3, 0.2], [-0.08, -0.02, -0.28, 0.3], [0.36, -0.36, 0.12, -0.1, -0.2, 0.08], [0.12, -0.1, 0.3, 0.12]];
  function crackLines(ctx, w, h, n, seed) {
    const m = Math.min(CRACKS.length, n >= 2 ? 4 : 2), flip = seed % 2 ? -1 : 1;
    ctx.beginPath();
    for (let i = 0; i < m; i++) {
      const c = CRACKS[i];
      ctx.moveTo(c[0] * w * flip, c[1] * h);
      for (let k = 2; k < c.length; k += 2) ctx.lineTo(c[k] * w * flip, c[k + 1] * h);
    }
    S(ctx, rgba(INK, 0.55), 2.4); ctx.stroke();
    S(ctx, rgba('#ffffff', 0.95), 1.1); ctx.stroke();
  }
  // Liquid in a potion / flask: the surface stays level in the world (local
  // tilt -angle) and sloshes with st.slosh.
  function liquid(ctx, key, w, h, c1, tilt, t, seed) {
    const hw = w / 2, hh = h / 2;
    let cx = 0, cy, r;
    if (key === 'potion') { r = Math.min(hw, hh * 0.62); cy = hh - r; r *= 0.9; }
    else { r = Math.min(hw, hh) * 0.72; cy = hh * 0.42; }
    ctx.save();
    ctx.beginPath(); circ(ctx, cx, cy, r); ctx.clip();
    F(ctx, rgba('#bfe8ff', 0.55)); ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.translate(cx, cy); ctx.rotate(tilt);
    const lvl = -r * 0.25, wob = Math.sin(t * 9 + seed) * r * 0.06;
    ctx.beginPath(); ctx.moveTo(-r * 1.5, lvl + wob); ctx.quadraticCurveTo(0, lvl - wob * 2, r * 1.5, lvl - wob); ctx.lineTo(r * 1.5, r * 1.6); ctx.lineTo(-r * 1.5, r * 1.6); ctx.closePath();
    F(ctx, c1); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-r * 1.5, lvl + wob); ctx.quadraticCurveTo(0, lvl - wob * 2, r * 1.5, lvl - wob);
    S(ctx, shade(c1, 0.55), 1.6); ctx.stroke();
    // two bubbles rising through it
    F(ctx, rgba('#ffffff', 0.6));
    for (let i = 0; i < 2; i++) {
      const u = ((t * 0.7 + i * 0.5 + seed * 0.13) % 1);
      ctx.beginPath(); circ(ctx, (i ? 0.3 : -0.25) * r, r * 0.8 - u * r * 1.0, r * 0.1 * (1 - u * 0.5)); ctx.fill();
    }
    ctx.restore();
  }
  function itemFx(ctx, def, x, y, angle, scale, st, layer) {
    if (!st) return;
    ctx.save();
    try {
      def = def || {};
      const d = shapeDims(def.shape), w = d.w, h = d.h;
      const s = scale == null ? 1 : scale, R = Math.max(w, h) / 2 * s;
      const T = (st.mat && st.mat.traits) || NOTRAITS;
      const t = st.t || 0, seed = st.seed || 0;
      const dflt = ITEM_DEFAULT[def.art] || ITEM_DEFAULT.rock;
      const c1 = def.color || dflt[0];
      ctx.translate(x || 0, y || 0);
      if (layer === 'back') {
        if (st.golden) glow(ctx, 0, 0, R * 2.3, PAL.gold, 0.55 + Math.sin(t * 5 + seed) * 0.2);
        if (T.magic) glow(ctx, 0, 0, R * 1.9, c1, 0.18 + 0.14 * Math.sin(t * 2.6 + seed));
        if (T.fire) glow(ctx, 0, -R * 0.2, R * 1.5, '#ff8a2b', 0.16 + 0.1 * Math.sin(t * 13 + seed * 3));
        if (st.mag > 0) glow(ctx, 0, 0, R * 1.8, PAL.cyan, 0.45 * st.mag);
        if (st.fuse > 0) glow(ctx, 0, 0, R * 2, PAL.blood, (st.fuse === 1 ? 0.35 : 0.18) + 0.2 * Math.max(0, Math.sin(t * (st.fuse === 1 ? 14 : 7))));
      } else if (layer !== 'top') {
        ctx.save();
        ctx.rotate(angle || 0); ctx.scale(s, s);
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        if (T.liquid && (def.art === 'potion' || def.art === 'flask')) liquid(ctx, def.art, w, h, c1, -(angle || 0) + (st.slosh || 0), t, seed);
        if (st.crack > 0) crackLines(ctx, w, h, st.crack, seed);
        if (T.frost) {
          // a frosty rim (brighter while it melts)
          ctx.beginPath(); rrect(ctx, -w / 2, -h / 2, w, h, Math.min(w, h) * 0.4);
          S(ctx, rgba('#e8f8ff', 0.35 + 0.2 * st.melt), 1.5); ctx.stroke();
        }
        ctx.restore();
        if (T.frost && st.melt > 0.1) {
          // a drip falling off it while it melts
          const u = (t * 0.8 + seed * 0.37) % 1;
          F(ctx, rgba('#bfe8ff', 0.85 * (1 - u)));
          ctx.beginPath(); ell(ctx, R * 0.2, R * 0.8 + u * 8, 1.8, 2.6 + u * 1.5); ctx.fill();
        }
        if (T.magic) {
          // three sparkles orbiting on a tilted ring
          for (let i = 0; i < 3; i++) {
            const a = t * 1.8 + i * TAU / 3 + seed, ox = Math.cos(a) * R * 1.25, oy = Math.sin(a) * R * 0.45 - R * 0.1;
            const tw = 0.6 + 0.4 * Math.sin(t * 6 + i * 2 + seed);
            tone(ctx, c => star(c, ox, oy, 2.2 + tw * 1.6, 4, 0.4), i === 1 ? '#ffffff' : shade(c1, 0.5), ox, oy, 3, { ol: 0, spec: false });
          }
        }
        if (st.golden) {
          glint(ctx, 0, 0, R, t, seed, '#fff6c0');
          for (let i = 0; i < 4; i++) {
            const a = -t * 2.2 + i * TAU / 4 + seed, rr = R * (1.15 + 0.15 * Math.sin(t * 3 + i));
            const ox = Math.cos(a) * rr, oy = Math.sin(a) * rr, tw = 0.5 + 0.5 * Math.sin(t * 8 + i * 1.7);
            tone(ctx, c => star(c, ox, oy, 2 + tw * 2.2, 4, 0.35), PAL.gold, ox, oy, 3, { ol: 0, spec: false });
          }
        }
        if (st.mag > 0) {
          ctx.globalAlpha = U.clamp(st.mag, 0, 1) * (0.55 + 0.45 * Math.sin(t * 30 + seed));
          ctx.beginPath();
          for (let i = 0; i < 3; i++) { const a0 = t * 4 + i * 2.1 + seed; ctx.moveTo(Math.cos(a0) * R * 1.2, Math.sin(a0) * R * 1.2); ctx.arc(0, 0, R * 1.2, a0, a0 + 0.9); }
          S(ctx, PAL.cyan, 1.6); ctx.stroke();
          ctx.globalAlpha = 1;
        }
        if (st.fuse > 0) {
          // the sparkling fuse tip (the bomb art's star)
          const r0 = Math.min(w, h) / 2, ca = Math.cos(angle || 0), sa = Math.sin(angle || 0);
          const lx = r0 * 0.4 * s, ly = (-r0 + 4) * s, fx0 = lx * ca - ly * sa, fy0 = lx * sa + ly * ca;
          const fl = 0.6 + 0.4 * Math.sin(t * 40 + seed);
          glow(ctx, fx0, fy0, 10 + fl * 6, '#ffe066', 0.9);
          tone(ctx, c => star(c, fx0, fy0, 3 + fl * 2.5, 6, 0.35), '#fff6c0', fx0, fy0, 3, { ol: 0, spec: false });
        }
      }
      if (layer === 'top' && st.fuse > 0) {
        // the turn countdown over the bomb, pulsing red on its last turn
        {
          const urgent = st.fuse === 1, pop = urgent ? 1 + 0.18 * Math.max(0, Math.sin(t * 14)) : 1;
          const bx = 0, by = -R - 13, br = 8 * pop;
          ctx.beginPath(); circ(ctx, bx, by, br);
          F(ctx, urgent ? PAL.blood : '#ff8a2b'); ctx.fill(); S(ctx, INK, 2); ctx.stroke();
          txt(ctx, String(st.fuse), bx, by + 0.5, 11 * pop, '#ffffff', true, 'center');
        }
      }
    } catch (e) { /* never throws */ }
    ctx.restore();
  }
  /* A glass shard (the debris a shattered item leaves in the bin). */
  function shard(ctx, x, y, a, r, col) {
    ctx.save();
    try {
      ctx.translate(x || 0, y || 0); ctx.rotate(a || 0);
      const k = r || 5;
      ctx.beginPath(); ctx.moveTo(-k, k * 0.6); ctx.lineTo(-k * 0.2, -k); ctx.lineTo(k, k * 0.2); ctx.closePath();
      F(ctx, rgba(col || '#bfe8ff', 0.75)); ctx.fill(); S(ctx, INK, 1.2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-k * 0.45, k * 0.25); ctx.lineTo(-k * 0.1, -k * 0.5);
      S(ctx, rgba('#ffffff', 0.9), 1); ctx.stroke();
    } catch (e) { /* never throws */ }
    ctx.restore();
  }

  /* ======================================================= ENEMY ART */
  // Each entry: {w, h, draw(ctx, t, p)} drawn with the feet at the origin,
  // facing -x. p = {a: base colour, b: secondary, c: accent}. w/h are the
  // nominal body size at scale 1 (used for status effects and bubbles).
  const EA = {};
  // soft ground shadow shared by walkers
  function shadow(ctx, w, a) {
    ctx.beginPath(); ctx.ellipse(0, 2, w * 0.5, w * 0.14, 0, 0, TAU);
    F(ctx, rgba(INK, a == null ? 0.35 : a)); ctx.fill();
  }
  function mouth(ctx, x, y, w, open, col) {
    ctx.beginPath(); ctx.moveTo(x - w / 2, y); ctx.quadraticCurveTo(x, y + open, x + w / 2, y);
    if (open > 3) { ctx.closePath(); F(ctx, col || '#5a1030'); ctx.fill(); }
    S(ctx, INK, OL); ctx.stroke();
  }
  function fangs(ctx, x, y, n, s, col) {
    F(ctx, col || '#fff');
    ctx.beginPath();
    for (let i = 0; i < n; i++) { const fx = x + (i - (n - 1) / 2) * s * 1.4; ctx.moveTo(fx - s * 0.5, y); ctx.lineTo(fx + s * 0.5, y); ctx.lineTo(fx, y + s); ctx.closePath(); }
    ctx.fill(); S(ctx, INK, 1.2); ctx.stroke();
  }

  EA.rat = { w: 78, h: 44, draw(ctx, t, p) {
    shadow(ctx, 80);
    const tw = Math.sin(t * 4) * 6;
    ctx.beginPath(); ctx.moveTo(24, -12); ctx.quadraticCurveTo(44, -8 + tw, 52, -30 + tw * 0.5);
    S(ctx, INK, 7); ctx.stroke(); S(ctx, p.c, 3.5); ctx.stroke();
    tone(ctx, c => ell(c, 0, -20, 34, 19, 0), p.a, 0, -20, 30, { dark: -0.3 });
    tone(ctx, c => { c.moveTo(-18, -34); c.quadraticCurveTo(-42, -32, -46, -20); c.quadraticCurveTo(-40, -10, -18, -8); c.closePath(); }, p.a, -30, -22, 16, { dark: -0.3 });
    tone(ctx, c => circ(c, -18, -38, 8), p.a, -18, -38, 8, { dark: -0.3 });
    F(ctx, p.c); ctx.beginPath(); ctx.arc(-18, -38, 4, 0, TAU); ctx.fill();
    F(ctx, INK); ctx.beginPath(); ctx.arc(-46, -20, 3.2, 0, TAU); ctx.fill();
    eye(ctx, -32, -27, 4.5, -1, 0, '#d81f3a');
    ctx.beginPath(); ctx.moveTo(-40, -18); ctx.lineTo(-56, -22); ctx.moveTo(-40, -16); ctx.lineTo(-56, -12); S(ctx, INK, 1.2); ctx.stroke();
    fangs(ctx, -38, -14, 2, 3);
    limb(ctx, -10, -6, -14, 0, 4, p.c); limb(ctx, 12, -6, 16, 0, 4, p.c);
  } };
  EA.slime = { w: 64, h: 50, draw(ctx, t, p) {
    const wob = Math.sin(t * 3) * 0.06;
    ctx.save(); ctx.scale(1 + wob, 1 - wob);
    shadow(ctx, 66);
    tone(ctx, c => { c.moveTo(-32, 0); c.quadraticCurveTo(-34, -42, -6, -48); c.quadraticCurveTo(20, -52, 30, -30); c.quadraticCurveTo(38, -6, 32, 0); c.closePath(); }, rgba(p.a, 0.92), 0, -22, 30, { dark: -0.3 });
    if (!FLAT) { ctx.fillStyle = shade(p.a, -0.35); ctx.beginPath(); circ(ctx, 10, -12, 5); circ(ctx, 18, -26, 3); ctx.fill(); }
    eye(ctx, -16, -26, 6, -0.6, 0.2); eye(ctx, 2, -28, 6, -0.6, 0.2);
    mouth(ctx, -10, -14, 12, 5, '#3a6a1a');
    tone(ctx, c => circ(c, -24, -46 + Math.sin(t * 5) * 2, 4), p.a, -24, -46, 4, { dark: -0.2 });
    ctx.restore();
  } };
  EA.bat = { w: 90, h: 50, draw(ctx, t, p) {
    const fl = Math.sin(t * 9), y0 = -46 + Math.sin(t * 2.5) * 4;
    shadow(ctx, 40, 0.2);
    const wing = (dir) => tone(ctx, c => { c.moveTo(dir * 10, y0 - 4); c.quadraticCurveTo(dir * 26, y0 - 26 + fl * 8, dir * 46, y0 - 14 + fl * 10); c.quadraticCurveTo(dir * 38, y0 - 2 + fl * 6, dir * 30, y0 + 2 + fl * 6); c.quadraticCurveTo(dir * 24, y0 + 6 + fl * 4, dir * 16, y0 + 6); c.closePath(); }, p.a, dir * 28, y0 - 8, 22, { dark: -0.35, spec: false });
    wing(-1); wing(1);
    tone(ctx, c => ell(c, 0, y0, 14, 16, 0), p.b, 0, y0, 14, { dark: -0.3 });
    tone(ctx, c => { c.moveTo(-10, y0 - 10); c.lineTo(-14, y0 - 26); c.lineTo(-2, y0 - 14); c.closePath(); c.moveTo(10, y0 - 10); c.lineTo(14, y0 - 26); c.lineTo(2, y0 - 14); c.closePath(); }, p.b, 0, y0 - 16, 10, { spec: false, dark: -0.3 });
    eye(ctx, -6, y0 - 3, 4, -0.7, 0.3, '#ffcf3a'); eye(ctx, 6, y0 - 3, 4, -0.7, 0.3, '#ffcf3a');
    fangs(ctx, 0, y0 + 7, 2, 3);
  } };
  EA.gremlin = { w: 60, h: 66, draw(ctx, t, p) {
    const bob = Math.sin(t * 5) * 2;
    shadow(ctx, 56);
    limb(ctx, -8, -10, -12, 0, 5, p.a); limb(ctx, 8, -10, 14, 0, 5, p.a);
    tone(ctx, c => ell(c, 0, -26 + bob, 20, 18, 0), p.a, 0, -26, 18, { dark: -0.3 });
    limb(ctx, -14, -24 + bob, -30, -12 + bob * 0.5, 5, p.a); limb(ctx, 14, -24 + bob, 26, -10, 5, p.a);
    F(ctx, INK); ctx.beginPath(); for (let i = -1; i <= 1; i++) circ(ctx, -30 + i * 3, -12 + bob * 0.5 + 2, 1.8); ctx.fill();
    tone(ctx, c => circ(c, -2, -50 + bob, 18), p.a, -2, -50, 18, { dark: -0.3 });
    const ear = (d) => tone(ctx, c => { c.moveTo(d * 12, -56 + bob); c.lineTo(d * 34, -70 + bob); c.lineTo(d * 16, -44 + bob); c.closePath(); }, p.a, d * 20, -56, 10, { dark: -0.3, spec: false });
    ear(-1); ear(1);
    eye(ctx, -11, -54 + bob, 5.5, -0.5, 0.4, '#ff2e88'); eye(ctx, 4, -54 + bob, 5.5, -0.5, 0.4, '#ff2e88');
    ctx.beginPath(); ctx.moveTo(-14, -42 + bob); ctx.quadraticCurveTo(-4, -32 + bob, 10, -42 + bob); ctx.closePath(); F(ctx, '#5a1030'); ctx.fill(); S(ctx, INK, OL); ctx.stroke();
    fangs(ctx, -3, -41 + bob, 4, 2.5);
  } };
  EA.mimic = { w: 78, h: 62, draw(ctx, t, p) {
    const gape = 8 + Math.sin(t * 3) * 3;
    shadow(ctx, 80);
    tone(ctx, c => rrect(c, -36, -34, 72, 34, 4), p.a, 0, -17, 36, { dark: -0.35 });
    tone(ctx, c => rrect(c, -34, -30, 8, 28, 2), p.b, -30, -16, 6, NOSPEC);
    tone(ctx, c => rrect(c, 26, -30, 8, 28, 2), p.b, 30, -16, 6, NOSPEC);
    ctx.beginPath(); ctx.rect(-36, -34, 72, gape * 1.2); F(ctx, '#3a0a24'); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-4, -30, 16, 8, 0, 0, Math.PI); F(ctx, '#ff5a8a'); ctx.fill(); S(ctx, INK, 1.5); ctx.stroke();
    fangs(ctx, -2, -34, 6, 4);
    ctx.save(); ctx.translate(0, -34 - gape); ctx.rotate(-0.12 - gape * 0.01);
    tone(ctx, c => { c.moveTo(-36, 0); c.lineTo(-36, -10); c.quadraticCurveTo(-36, -28, -18, -28); c.lineTo(18, -28); c.quadraticCurveTo(36, -28, 36, -10); c.lineTo(36, 0); c.closePath(); }, p.a, 0, -14, 36, { dark: -0.35 });
    tone(ctx, c => rrect(c, -8, -14, 16, 12, 2), p.b, 0, -8, 8, NOSPEC);
    F(ctx, INK); ctx.beginPath(); ctx.rect(-2, -10, 4, 6); ctx.fill();
    ctx.save(); ctx.scale(1, -1);
    F(ctx, '#fff'); ctx.beginPath(); for (let i = 0; i < 6; i++) { ctx.moveTo(-30 + i * 12, 0); ctx.lineTo(-22 + i * 12, 0); ctx.lineTo(-26 + i * 12, 5); ctx.closePath(); } ctx.fill(); S(ctx, INK, 1.2); ctx.stroke();
    ctx.restore();
    eye(ctx, -14, -18, 5, -0.6, 0.6, '#ffcf3a'); eye(ctx, 12, -18, 5, -0.6, 0.6, '#ffcf3a');
    ctx.restore();
  } };
  EA.spider = { w: 84, h: 50, draw(ctx, t, p) {
    shadow(ctx, 84, 0.3);
    for (let i = 0; i < 4; i++) {
      const s = i % 2 ? 1 : -1, k = Math.sin(t * 6 + i) * 3, ax = -10 + i * 6;
      for (const d of [-1, 1]) {
        const kx = d * (26 + i * 4), ky = -34 - i * 2 + k * s;
        ctx.beginPath(); ctx.moveTo(d * 8, -24); ctx.lineTo(kx, ky); ctx.lineTo(kx + d * 14, 0);
        S(ctx, INK, 6); ctx.stroke(); S(ctx, p.a, 3); ctx.stroke();
      }
    }
    tone(ctx, c => ell(c, 12, -26, 24, 18, 0), p.a, 12, -26, 22, { dark: -0.4 });
    if (!FLAT) { ctx.fillStyle = p.b; ctx.beginPath(); ctx.moveTo(6, -40); ctx.lineTo(0, -22); ctx.lineTo(12, -30); ctx.lineTo(24, -22); ctx.lineTo(18, -40); ctx.closePath(); ctx.fill(); }
    tone(ctx, c => circ(c, -20, -22, 13), p.a, -20, -22, 13, { dark: -0.4 });
    F(ctx, '#ff2e30'); ctx.beginPath(); circ(ctx, -28, -26, 3.5); circ(ctx, -20, -28, 3.5); circ(ctx, -30, -19, 2.2); circ(ctx, -22, -21, 2.2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-30, -12); ctx.lineTo(-34, -6); ctx.moveTo(-22, -11); ctx.lineTo(-20, -5); S(ctx, INK, 2.5); ctx.stroke();
  } };
  EA.goblin = { w: 62, h: 80, draw(ctx, t, p) {
    const bob = Math.sin(t * 4) * 2;
    shadow(ctx, 58);
    limb(ctx, -8, -12, -12, 0, 6, p.a); limb(ctx, 8, -12, 12, 0, 6, p.a);
    tone(ctx, c => rrect(c, -16, -46 + bob, 32, 38, 8), p.b, 0, -28, 18, { dark: -0.3 });
    line(ctx, -8, -40 + bob, 8, -40 + bob, shade(p.b, -0.4), 2);
    limb(ctx, -14, -38 + bob, -30, -46 + bob, 5, p.a);
    ctx.save(); ctx.translate(-30, -46 + bob); ctx.rotate(-1.2 + Math.sin(t * 4) * 0.1);
    IA.dagger(ctx, 26, 8, '#c9d3e0', '#4a3a6a');
    ctx.restore();
    limb(ctx, 14, -36 + bob, 24, -26 + bob, 5, p.a);
    tone(ctx, c => circ(c, -2, -62 + bob, 16), p.a, -2, -62, 16, { dark: -0.3 });
    tone(ctx, c => { c.moveTo(-14, -66 + bob); c.lineTo(-30, -60 + bob); c.lineTo(-12, -54 + bob); c.closePath(); }, shade(p.a, 0.1), -20, -60, 8, { dark: -0.3, spec: false });
    tone(ctx, c => { c.moveTo(14, -70 + bob); c.lineTo(32, -74 + bob); c.lineTo(14, -58 + bob); c.closePath(); }, p.a, 22, -66, 8, { dark: -0.3, spec: false });
    tone(ctx, c => { c.moveTo(-18, -70 + bob); c.quadraticCurveTo(-4, -96 + bob, 4, -76 + bob); c.lineTo(14, -70 + bob); c.closePath(); }, p.c, -4, -78, 14, { dark: -0.3 });
    eye(ctx, -9, -64 + bob, 4.5, -0.6, 0.2, '#ffcf3a'); eye(ctx, 6, -64 + bob, 4.5, -0.6, 0.2, '#ffcf3a');
    mouth(ctx, -4, -52 + bob, 14, 3);
    fangs(ctx, -6, -52 + bob, 1, 3);
  } };
  EA.hoard = { w: 150, h: 120, draw(ctx, t, p) {
    const wob = Math.sin(t * 2) * 0.04;
    ctx.save(); ctx.scale(1 + wob, 1 - wob);
    shadow(ctx, 150);
    tone(ctx, c => { c.moveTo(-72, 0); c.quadraticCurveTo(-80, -70, -30, -100); c.quadraticCurveTo(20, -125, 60, -80); c.quadraticCurveTo(84, -40, 74, 0); c.closePath(); }, rgba(p.a, 0.86), 0, -50, 72, { dark: -0.3 });
    ctx.save(); ctx.globalAlpha = 0.9;
    const pr = [['coin', -44, -26, 18, 18, 0.3], ['gem', 14, -34, 22, 26, -0.2], ['star', 46, -20, 22, 22, 0.5], ['skull', -14, -74, 20, 24, 0.1], ['ring', 40, -58, 18, 20, 0.4], ['bone', -50, -54, 26, 10, -0.6], ['coin', 26, -8, 14, 14, 0], ['heart', -20, -32, 18, 16, -0.3], ['dice', 18, -74, 16, 16, 0.4]];
    for (const q of pr) { ctx.save(); ctx.translate(q[1], q[2] + Math.sin(t * 2 + q[1]) * 2); ctx.rotate(q[5]); IA[q[0]](ctx, q[3], q[4], ITEM_DEFAULT[q[0]][0], ITEM_DEFAULT[q[0]][1]); ctx.restore(); }
    ctx.restore();
    tone(ctx, c => { c.moveTo(-26, -98); c.lineTo(-24, -114); c.lineTo(-14, -104); c.lineTo(-6, -118); c.lineTo(2, -104); c.lineTo(12, -114); c.lineTo(14, -98); c.closePath(); }, '#ffe066', -6, -106, 18, { dark: -0.3, ol: 2 });
    F(ctx, PAL.pink); ctx.beginPath(); circ(ctx, -14, -106, 2.5); circ(ctx, 2, -106, 2.5); ctx.fill();
    eye(ctx, -34, -60, 12, -0.5, 0.2); eye(ctx, 4, -64, 12, -0.5, 0.2);
    ctx.beginPath(); ctx.moveTo(-40, -36); ctx.quadraticCurveTo(-14, -14, 14, -36); ctx.closePath(); F(ctx, '#3a6a1a'); ctx.fill(); S(ctx, INK, OL); ctx.stroke();
    ctx.restore();
  } };
  EA.imp = { w: 56, h: 66, draw(ctx, t, p) {
    const y0 = -14 + Math.sin(t * 3) * 4;
    shadow(ctx, 44, 0.25);
    ctx.beginPath(); ctx.moveTo(14, y0 - 10); ctx.quadraticCurveTo(38, y0 - 4, 34, y0 - 30);
    S(ctx, INK, 6); ctx.stroke(); S(ctx, p.a, 3); ctx.stroke();
    tone(ctx, c => poly(c, [34, y0 - 36, 28, y0 - 26, 40, y0 - 26]), p.a, 34, y0 - 30, 6, { dark: -0.3, spec: false });
    limb(ctx, -8, y0 - 12, -12, y0, 4, p.a); limb(ctx, 8, y0 - 12, 12, y0, 4, p.a);
    tone(ctx, c => ell(c, 0, y0 - 24, 15, 16, 0), p.a, 0, y0 - 24, 15, { dark: -0.35 });
    limb(ctx, -12, y0 - 26, -26, y0 - 40, 4, p.a);
    limb(ctx, -30, y0 - 14, -30, y0 - 56, 3, p.b);
    F(ctx, p.b); ctx.beginPath(); poly(ctx, [-36, y0 - 52, -24, y0 - 52, -30, y0 - 64]); ctx.fill(); S(ctx, INK, 1.5); ctx.stroke();
    tone(ctx, c => circ(c, 0, y0 - 48, 13), p.a, 0, y0 - 48, 13, { dark: -0.35 });
    tone(ctx, c => { c.moveTo(-9, y0 - 58); c.lineTo(-14, y0 - 72); c.lineTo(-2, y0 - 60); c.closePath(); c.moveTo(9, y0 - 58); c.lineTo(14, y0 - 72); c.lineTo(2, y0 - 60); c.closePath(); }, p.b, 0, y0 - 64, 8, { dark: -0.3, spec: false });
    eye(ctx, -6, y0 - 50, 4, -0.6, 0.3, '#ffcf3a'); eye(ctx, 5, y0 - 50, 4, -0.6, 0.3, '#ffcf3a');
    ctx.beginPath(); ctx.moveTo(-8, y0 - 41); ctx.quadraticCurveTo(-1, y0 - 34, 6, y0 - 41); S(ctx, INK, 2.5); ctx.stroke();
  } };
  EA.clockwork = { w: 64, h: 70, draw(ctx, t, p) {
    const tick = Math.floor(t * 2) % 2 ? 0.25 : -0.25;
    shadow(ctx, 60);
    limb(ctx, -10, -12, -14, 0, 6, p.b); limb(ctx, 10, -12, 14, 0, 6, p.b);
    ctx.save(); ctx.translate(22, -36); ctx.rotate(t * 2);
    tone(ctx, c => { c.moveTo(0, -6); c.lineTo(3, -20); c.lineTo(10, -20); c.lineTo(10, -14); c.lineTo(4, -14); c.lineTo(4, -6); c.closePath(); }, p.c, 5, -13, 8, { dark: -0.3, spec: false });
    ctx.restore();
    tone(ctx, c => rrect(c, -24, -56, 48, 46, 10), p.a, 0, -33, 24, { dark: -0.3 });
    ctx.beginPath(); ctx.arc(0, -34, 14, 0, TAU); F(ctx, '#f4ecd6'); ctx.fill(); S(ctx, INK, OL); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -34); ctx.lineTo(0, -44); ctx.moveTo(0, -34); ctx.lineTo(7 * Math.cos(t), -34 + 7 * Math.sin(t)); S(ctx, INK, 2); ctx.stroke();
    ctx.save(); ctx.translate(-20, -50); ctx.rotate(tick);
    tone(ctx, c => circ(c, 0, 0, 6), p.c, 0, 0, 6, { dark: -0.3 });
    F(ctx, INK); ctx.beginPath(); ctx.arc(0, 0, 2, 0, TAU); ctx.fill();
    ctx.restore();
    eye(ctx, -16, -30, 3.5, -0.6, 0, p.c);
    tone(ctx, c => rrect(c, -14, -68, 28, 12, 3), p.b, 0, -62, 14, NOSPEC);
    limb(ctx, -24, -40, -34, -22, 5, p.b); limb(ctx, 24, -40, 32, -24, 5, p.b);
  } };
  EA.golem = { w: 92, h: 96, draw(ctx, t, p) {
    const br = Math.sin(t * 1.5) * 2;
    shadow(ctx, 96);
    tone(ctx, c => rrect(c, -30, -22, 22, 22, 5), p.a, -19, -11, 12, { dark: -0.4 });
    tone(ctx, c => rrect(c, 8, -22, 22, 22, 5), p.a, 19, -11, 12, { dark: -0.4 });
    tone(ctx, c => { c.moveTo(-38, -24); c.lineTo(-30, -80 + br); c.lineTo(30, -84 + br); c.lineTo(40, -24); c.closePath(); }, p.a, 0, -52, 38, { dark: -0.4 });
    tone(ctx, c => rrect(c, -58, -70 + br, 22, 48, 8), p.a, -47, -46, 14, { dark: -0.4 });
    tone(ctx, c => rrect(c, 36, -70 + br, 22, 48, 8), p.a, 47, -46, 14, { dark: -0.4 });
    tone(ctx, c => rrect(c, -20, -104 + br, 40, 30, 6), p.a, 0, -89, 20, { dark: -0.4 });
    const g = 0.6 + Math.sin(t * 3) * 0.4;
    F(ctx, rgba(p.c, 0.5 + g * 0.5));
    ctx.beginPath(); ctx.rect(-12, -94 + br, 8, 4); ctx.rect(4, -94 + br, 8, 4); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-10, -60 + br); ctx.lineTo(0, -52 + br); ctx.lineTo(-6, -40 + br); ctx.lineTo(6, -34 + br); S(ctx, rgba(p.c, 0.6 + g * 0.4), 3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-26, -70 + br); ctx.lineTo(-18, -60 + br); ctx.moveTo(16, -36 + br); ctx.lineTo(28, -30 + br); S(ctx, shade(p.a, -0.5), 2); ctx.stroke();
  } };
  EA.furnace = { w: 76, h: 84, draw(ctx, t, p) {
    const fl = Math.sin(t * 12);
    shadow(ctx, 76);
    limb(ctx, -22, -8, -24, 0, 7, p.b); limb(ctx, 22, -8, 24, 0, 7, p.b);
    tone(ctx, c => rrect(c, 10, -96, 14, 30, 3), p.b, 17, -80, 8, { dark: -0.4 });
    tone(ctx, c => rrect(c, -34, -72, 68, 66, 10), p.a, 0, -38, 34, { dark: -0.4 });
    ctx.beginPath(); rrect(ctx, -24, -42, 48, 26, 5); F(ctx, '#2a0a10'); ctx.fill(); S(ctx, INK, OL); ctx.stroke();
    tone(ctx, c => { c.moveTo(-20, -18); c.lineTo(-18, -30 - fl * 3); c.lineTo(-12, -22); c.lineTo(-6, -38 + fl * 4); c.lineTo(0, -24); c.lineTo(6, -36 - fl * 3); c.lineTo(12, -22); c.lineTo(18, -32 + fl * 3); c.lineTo(20, -18); c.closePath(); }, p.c, 0, -26, 20, { ol: 0, dark: -0.1 });
    F(ctx, '#fff2a0'); ctx.beginPath(); ctx.moveTo(-10, -18); ctx.lineTo(-4, -28 + fl * 2); ctx.lineTo(2, -18); ctx.fill();
    fangs(ctx, 0, -42, 5, 4, p.b);
    ctx.save(); ctx.scale(1, -1); fangs(ctx, 0, 18, 5, 4, p.b); ctx.restore();
    eye(ctx, -14, -58, 6, -0.6, 0.2, p.c); eye(ctx, 12, -58, 6, -0.6, 0.2, p.c);
    F(ctx, rgba('#8e98a8', 0.6)); ctx.beginPath(); circ(ctx, 17, -100 - (t * 10 % 12), 5 + (t * 10 % 12) * 0.3); ctx.fill();
  } };
  EA.magnet = { w: 64, h: 70, draw(ctx, t, p) {
    const y0 = -12 + Math.sin(t * 3) * 4;
    shadow(ctx, 50, 0.25);
    ctx.beginPath(); ctx.arc(0, y0 - 40, 22, Math.PI, 0); ctx.lineTo(22, y0 - 6); ctx.lineTo(8, y0 - 6); ctx.lineTo(8, y0 - 40); ctx.arc(0, y0 - 40, 8, 0, Math.PI, true); ctx.lineTo(-8, y0 - 6); ctx.lineTo(-22, y0 - 6); ctx.closePath();
    F(ctx, p.a); ctx.fill(); S(ctx, INK, OL); ctx.stroke();
    tone(ctx, c => c.rect(-22, y0 - 20, 14, 14), '#c9d3e0', -15, y0 - 13, 7, { dark: -0.3, spec: false });
    tone(ctx, c => c.rect(8, y0 - 20, 14, 14), '#c9d3e0', 15, y0 - 13, 7, { dark: -0.3, spec: false });
    if (!FLAT) { ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.arc(0, y0 - 40, 17, Math.PI * 1.1, Math.PI * 1.5); ctx.arc(0, y0 - 40, 12, Math.PI * 1.5, Math.PI * 1.1, true); ctx.closePath(); ctx.fill(); }
    eye(ctx, -6, y0 - 48, 5, -0.6, 0.3, p.c); eye(ctx, 6, y0 - 48, 5, -0.6, 0.3, p.c);
    ctx.beginPath(); ctx.moveTo(-4, y0 - 36); ctx.lineTo(4, y0 - 36); S(ctx, INK, 2.5); ctx.stroke();
    const sp = (t * 3) % 1;
    F(ctx, p.c);
    ctx.beginPath(); circ(ctx, -15, y0 + 2 + sp * 10, 2.5 - sp * 2); circ(ctx, 15, y0 + 2 + ((sp + 0.5) % 1) * 10, 2.5 - ((sp + 0.5) % 1) * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-30, y0 - 30); ctx.lineTo(-38, y0 - 34); ctx.moveTo(30, y0 - 30); ctx.lineTo(38, y0 - 34); ctx.moveTo(-32, y0 - 50); ctx.lineTo(-38, y0 - 56); S(ctx, p.c, 2); ctx.stroke();
  } };
  EA.ironjaw = { w: 150, h: 150, draw(ctx, t, p) {
    const sw = Math.sin(t * 1.6) * 0.06;
    shadow(ctx, 150);
    tone(ctx, c => rrect(c, -70, -26, 140, 26, 10), p.b, 0, -13, 60, { dark: -0.4 });
    F(ctx, INK); ctx.beginPath(); for (let i = 0; i < 6; i++) circ(ctx, -55 + i * 22, -13, 6); ctx.fill();
    if (!FLAT) { ctx.fillStyle = p.c; ctx.beginPath(); for (let i = 0; i < 6; i++) circ(ctx, -55 + i * 22 + Math.cos(t * 2) * 2, -13 + Math.sin(t * 2) * 2, 2); ctx.fill(); }
    tone(ctx, c => rrect(c, -50, -96, 100, 72, 12), p.a, 0, -60, 50, { dark: -0.4 });
    ctx.beginPath(); ctx.rect(-40, -80, 80, 6); F(ctx, PAL.gold); ctx.fill(); ctx.beginPath(); for (let i = 0; i < 5; i++) ctx.rect(-40 + i * 16, -80, 8, 6); F(ctx, INK); ctx.fill();
    tone(ctx, c => rrect(c, -26, -56, 52, 22, 4), shade(p.a, -0.4), 0, -45, 26, NOSPEC);
    for (let i = 0; i < 3; i++) { ctx.beginPath(); circ(ctx, -14 + i * 14, -45, 4); F(ctx, i === Math.floor(t * 3) % 3 ? p.c : shade(p.c, -0.6)); ctx.fill(); S(ctx, INK, 1.5); ctx.stroke(); }
    const arm = (d) => { limb(ctx, d * 50, -70, d * 78, -40, 12, p.b); tone(ctx, c => rrect(c, d * 78 - 14, -44, 28, 24, 6), p.a, d * 78, -32, 14, { dark: -0.4 }); };
    arm(-1); arm(1);
    tone(ctx, c => rrect(c, -18, -122, 36, 30, 6), p.b, 0, -107, 18, { dark: -0.4 });
    ctx.save(); ctx.translate(0, -122); ctx.rotate(sw);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -16); S(ctx, INK, 5); ctx.stroke(); S(ctx, '#8e98a8', 2.5); ctx.stroke();
    tone(ctx, c => rrect(c, -16, -28, 32, 14, 4), '#c9d3e0', 0, -21, 16, { dark: -0.35 });
    const op = 0.35 + Math.sin(t * 2) * 0.15;
    for (const d of [-1, 1]) {
      ctx.save(); ctx.translate(d * 12, -16); ctx.rotate(d * op);
      tone(ctx, c => { c.moveTo(-5, 0); c.lineTo(5, 0); c.quadraticCurveTo(d * 8, 20, d * 4, 34); c.lineTo(d * 2, 34); c.quadraticCurveTo(d * 2, 18, -5, 6); c.closePath(); }, '#c9d3e0', d * 3, 16, 14, { dark: -0.35, spec: false });
      ctx.restore();
    }
    ctx.restore();
    F(ctx, p.c); ctx.beginPath(); circ(ctx, -8, -66, 5); circ(ctx, 8, -66, 5); ctx.fill();
    ctx.beginPath(); circ(ctx, -8, -66, 5); circ(ctx, 8, -66, 5); S(ctx, INK, 1.5); ctx.stroke();
  } };
  EA.wraith = { w: 62, h: 90, draw(ctx, t, p) {
    const y0 = -10 + Math.sin(t * 2) * 5;
    shadow(ctx, 40, 0.18);
    ctx.save(); ctx.globalAlpha = 0.86;
    tone(ctx, c => { c.moveTo(-26, y0 - 40); c.quadraticCurveTo(-30, y0 - 80, 0, y0 - 84); c.quadraticCurveTo(30, y0 - 80, 26, y0 - 40); c.lineTo(28, y0 - 8); c.lineTo(18, y0 - 18); c.lineTo(10, y0); c.lineTo(0, y0 - 14); c.lineTo(-10, y0 + 2); c.lineTo(-18, y0 - 16); c.lineTo(-28, y0 - 6); c.closePath(); }, p.a, 0, y0 - 44, 28, { dark: -0.35, spec: false });
    ctx.restore();
    ctx.beginPath(); ctx.moveTo(-20, y0 - 62); ctx.quadraticCurveTo(0, y0 - 40, 20, y0 - 62); ctx.quadraticCurveTo(0, y0 - 74, -20, y0 - 62); ctx.closePath(); F(ctx, INK); ctx.fill();
    F(ctx, p.c); ctx.beginPath(); ell(ctx, -8, y0 - 60, 4, 2.5, 0.3); ell(ctx, 6, y0 - 60, 4, 2.5, -0.3); ctx.fill();
    limb(ctx, -24, y0 - 44, -40, y0 - 30 + Math.sin(t * 3) * 3, 5, p.a);
    F(ctx, p.a); ctx.beginPath(); for (let i = 0; i < 3; i++) { ctx.moveTo(-40, y0 - 30); ctx.lineTo(-50 - i * 2, y0 - 36 + i * 6); } S(ctx, INK, 3); ctx.stroke(); S(ctx, p.a, 1.5); ctx.stroke();
  } };
  EA.yeti = { w: 104, h: 100, draw(ctx, t, p) {
    const br = Math.sin(t * 2) * 2;
    shadow(ctx, 100);
    limb(ctx, -18, -14, -22, 0, 12, p.a); limb(ctx, 18, -14, 22, 0, 12, p.a);
    tone(ctx, c => { c.moveTo(-40, -10); c.quadraticCurveTo(-46, -70 + br, 0, -76 + br); c.quadraticCurveTo(46, -70 + br, 40, -10); c.lineTo(32, 0); c.lineTo(-32, 0); c.closePath(); }, p.a, 0, -40, 40, { dark: -0.25 });
    limb(ctx, -34, -56 + br, -50, -80, 12, p.a); limb(ctx, 34, -56 + br, 50, -80, 12, p.a);
    F(ctx, INK); ctx.beginPath(); for (const d of [-1, 1]) for (let i = -1; i <= 1; i++) circ(ctx, d * 50 + i * 4, -88, 2.2); ctx.fill();
    tone(ctx, c => ell(c, -4, -46 + br, 20, 16, 0), p.b, -4, -46, 18, { dark: -0.25, spec: false });
    tone(ctx, c => circ(c, 0, -90 + br, 22), p.a, 0, -90, 22, { dark: -0.25 });
    tone(ctx, c => ell(c, -2, -86 + br, 15, 12, 0), p.b, -2, -86, 14, { dark: -0.25, spec: false });
    eye(ctx, -9, -90 + br, 4, -0.6, 0.3); eye(ctx, 5, -90 + br, 4, -0.6, 0.3);
    ctx.beginPath(); ctx.moveTo(-10, -78 + br); ctx.quadraticCurveTo(-2, -72 + br, 6, -78 + br); ctx.closePath(); F(ctx, '#5a1030'); ctx.fill(); S(ctx, INK, OL); ctx.stroke();
    fangs(ctx, -2, -78 + br, 2, 3);
    F(ctx, INK); ctx.beginPath(); ctx.moveTo(-12, -96 + br); ctx.lineTo(-4, -94 + br); ctx.moveTo(2, -94 + br); ctx.lineTo(10, -96 + br); S(ctx, INK, 2.5); ctx.stroke();
  } };
  EA.frostmage = { w: 66, h: 100, draw(ctx, t, p) {
    const bob = Math.sin(t * 2) * 2;
    shadow(ctx, 60);
    tone(ctx, c => { c.moveTo(-22, 0); c.lineTo(-16, -60 + bob); c.lineTo(16, -60 + bob); c.lineTo(22, 0); c.closePath(); }, p.a, 0, -30, 22, { dark: -0.35 });
    ctx.beginPath(); ctx.moveTo(-18, -8); ctx.lineTo(18, -8); S(ctx, shade(p.a, -0.5), 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-30, -6); ctx.lineTo(-30, -96 + bob); S(ctx, INK, 6); ctx.stroke(); S(ctx, '#8a5a2b', 3); ctx.stroke();
    tone(ctx, c => circ(c, -30, -100 + bob, 7), p.c, -30, -100, 7, { dark: -0.2 });
    limb(ctx, -14, -50 + bob, -28, -42 + bob, 5, p.a);
    tone(ctx, c => circ(c, 0, -72 + bob, 13), '#b9e6ff', 0, -72, 13, { dark: -0.2 });
    tone(ctx, c => { c.moveTo(-12, -68 + bob); c.lineTo(-8, -48 + bob); c.lineTo(-3, -58 + bob); c.lineTo(0, -44 + bob); c.lineTo(4, -58 + bob); c.lineTo(9, -50 + bob); c.lineTo(12, -68 + bob); c.closePath(); }, '#e8f8ff', 0, -58, 10, { dark: -0.15, spec: false });
    eye(ctx, -6, -74 + bob, 3.5, -0.6, 0, p.c); eye(ctx, 5, -74 + bob, 3.5, -0.6, 0, p.c);
    tone(ctx, c => { c.moveTo(-20, -80 + bob); c.lineTo(20, -80 + bob); c.lineTo(6, -84 + bob); c.lineTo(2, -116 + bob); c.lineTo(-6, -84 + bob); c.closePath(); }, p.b, 0, -90, 16, { dark: -0.35 });
    F(ctx, p.c); ctx.beginPath(); star(ctx, 0, -98 + bob, 4, 5, 0.5); ctx.fill();
  } };
  EA.icemimic = { w: 78, h: 62, draw(ctx, t, p) {
    shadow(ctx, 80);
    tone(ctx, c => rrect(c, -34, -32, 68, 32, 4), '#8a5a2b', 0, -16, 34, { dark: -0.35 });
    ctx.beginPath(); ctx.rect(-34, -32, 68, 8); F(ctx, '#3a0a24'); ctx.fill();
    ctx.save(); ctx.translate(0, -32); ctx.rotate(-0.1);
    tone(ctx, c => { c.moveTo(-34, 0); c.lineTo(-34, -8); c.quadraticCurveTo(-34, -24, -18, -24); c.lineTo(18, -24); c.quadraticCurveTo(34, -24, 34, -8); c.lineTo(34, 0); c.closePath(); }, '#8a5a2b', 0, -12, 34, { dark: -0.35 });
    eye(ctx, -12, -14, 4.5, -0.6, 0.5, p.c); eye(ctx, 12, -14, 4.5, -0.6, 0.5, p.c);
    ctx.restore();
    fangs(ctx, 0, -34, 6, 5, '#d8f4ff');
    ctx.save(); ctx.scale(1, -1); fangs(ctx, 0, 24, 5, 6, '#d8f4ff'); ctx.restore();
    ctx.save(); ctx.globalAlpha = 0.45;
    tone(ctx, c => rrect(c, -40, -64, 80, 64, 8), p.a, 0, -32, 40, { dark: -0.15 });
    ctx.restore();
    ctx.beginPath(); ctx.moveTo(-30, -50); ctx.lineTo(-12, -30); ctx.lineTo(10, -40); ctx.moveTo(-12, -30); ctx.lineTo(-6, -8); S(ctx, rgba('#ffffff', 0.85), 1.5); ctx.stroke();
    F(ctx, '#e8f8ff'); ctx.beginPath(); for (let i = 0; i < 4; i++) { const x = -26 + i * 17; ctx.moveTo(x - 4, -64); ctx.lineTo(x + 4, -64); ctx.lineTo(x, -64 + 8 + (i % 2) * 5); ctx.closePath(); } ctx.fill(); S(ctx, INK, 1.2); ctx.stroke();
  } };
  EA.prizemaster = { w: 130, h: 180, draw(ctx, t, p) {
    const bob = Math.sin(t * 1.8) * 3, sw = Math.sin(t * 1.2) * 4;
    shadow(ctx, 110);
    // ticket-roll cape
    tone(ctx, c => { c.moveTo(-16, -120 + bob); c.quadraticCurveTo(-60 + sw, -70, -66 + sw, -4); c.lineTo(58 - sw, -4); c.quadraticCurveTo(60, -70, 16, -120 + bob); c.closePath(); }, p.c, 0, -60, 60, { dark: -0.3, spec: false });
    ctx.beginPath(); for (let i = 0; i < 5; i++) { const x = -52 + sw * 0.8 + i * 26; ctx.moveTo(x, -8); ctx.lineTo(x + 8, -96 + bob); } S(ctx, rgba(INK, 0.35), 1.5); ctx.stroke();
    ctx.beginPath(); for (let i = 0; i < 9; i++) { ctx.rect(-62 + sw + i * 14, -12, 6, 4); ctx.rect(-56 + i * 14, -40, 6, 4); } F(ctx, rgba(INK, 0.3)); ctx.fill();
    limb(ctx, -12, -20, -14, 0, 9, INK); limb(ctx, 12, -20, 14, 0, 9, INK);
    tone(ctx, c => { c.moveTo(-24, -20); c.lineTo(-20, -112 + bob); c.lineTo(20, -112 + bob); c.lineTo(24, -20); c.closePath(); }, p.a, 0, -66, 24, { dark: -0.35 });
    ctx.beginPath(); ctx.moveTo(-12, -108 + bob); ctx.lineTo(0, -60 + bob); ctx.lineTo(12, -108 + bob); F(ctx, '#f4ecd6'); ctx.fill(); S(ctx, INK, 2); ctx.stroke();
    F(ctx, PAL.gold); ctx.beginPath(); circ(ctx, 0, -86 + bob, 2.5); circ(ctx, 0, -74 + bob, 2.5); ctx.fill();
    tone(ctx, c => { c.moveTo(-10, -96 + bob); c.lineTo(10, -96 + bob); c.lineTo(0, -84 + bob); c.closePath(); }, p.b, 0, -92, 8, { spec: false, dark: -0.3 });
    // cane arm + claw hand
    limb(ctx, 22, -90 + bob, 44, -70 + bob, 8, p.a);
    ctx.beginPath(); ctx.moveTo(44, -70 + bob); ctx.lineTo(48, -4); S(ctx, INK, 6); ctx.stroke(); S(ctx, PAL.gold, 3); ctx.stroke();
    limb(ctx, -22, -90 + bob, -50, -78 + bob, 8, p.a);
    ctx.save(); ctx.translate(-52, -76 + bob); ctx.rotate(0.3 + Math.sin(t * 2) * 0.15);
    tone(ctx, c => rrect(c, -9, -8, 18, 12, 3), '#c9d3e0', 0, -2, 9, { dark: -0.35 });
    for (const d of [-1, 0, 1]) tone(ctx, c => { c.moveTo(d * 6 - 3, 2); c.lineTo(d * 6 + 3, 2); c.quadraticCurveTo(d * 10, 14, d * 8, 24); c.lineTo(d * 6, 22); c.quadraticCurveTo(d * 4, 12, d * 6 - 3, 6); c.closePath(); }, '#c9d3e0', d * 6, 12, 10, { dark: -0.35, spec: false });
    ctx.restore();
    // head + hat
    tone(ctx, c => ell(c, 0, -130 + bob, 16, 19, 0), p.b, 0, -130, 17, { dark: -0.3 });
    eye(ctx, -7, -134 + bob, 4.5, -0.6, 0.3, p.c); eye(ctx, 7, -134 + bob, 4.5, -0.6, 0.3, p.c);
    ctx.beginPath(); ctx.moveTo(-12, -140 + bob); ctx.lineTo(-3, -136 + bob); ctx.moveTo(12, -140 + bob); ctx.lineTo(3, -136 + bob); S(ctx, INK, 2.5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-10, -120 + bob); ctx.quadraticCurveTo(0, -108 + bob, 10, -120 + bob); ctx.closePath(); F(ctx, '#5a1030'); ctx.fill(); S(ctx, INK, 2.5); ctx.stroke();
    fangs(ctx, 0, -120 + bob, 6, 2.5);
    tone(ctx, c => rrect(c, -24, -150 + bob, 48, 6, 2), p.a, 0, -147, 24, NOSPEC);
    tone(ctx, c => { c.moveTo(-15, -150 + bob); c.lineTo(-13, -192 + bob); c.lineTo(13, -192 + bob); c.lineTo(15, -150 + bob); c.closePath(); }, p.a, 0, -170, 16, { dark: -0.35 });
    ctx.beginPath(); ctx.rect(-14, -164 + bob, 28, 6); F(ctx, p.c); ctx.fill();
    F(ctx, PAL.gold); ctx.beginPath(); star(ctx, 0, -178 + bob, 6, 5, 0.5); ctx.fill();
  } };
  EA.mushroom = { w: 66, h: 66, draw(ctx, t, p) {
    const br = Math.sin(t * 2) * 2;
    shadow(ctx, 62);
    limb(ctx, -8, -8, -10, 0, 5, p.b); limb(ctx, 8, -8, 10, 0, 5, p.b);
    tone(ctx, c => rrect(c, -14, -40, 28, 36, 8), p.b, 0, -22, 14, { dark: -0.25 });
    eye(ctx, -6, -28, 3.5, -0.6, 0.2); eye(ctx, 5, -28, 3.5, -0.6, 0.2);
    ctx.beginPath(); ctx.moveTo(-5, -18); ctx.quadraticCurveTo(0, -14, 5, -18); S(ctx, INK, 2); ctx.stroke();
    tone(ctx, c => { c.moveTo(-32, -36 + br); c.quadraticCurveTo(-32, -66 + br, 0, -68 + br); c.quadraticCurveTo(32, -66 + br, 32, -36 + br); c.closePath(); }, p.a, 0, -50, 30, { dark: -0.3 });
    F(ctx, p.c); ctx.beginPath(); circ(ctx, -16, -50 + br, 5); circ(ctx, 6, -58 + br, 4); circ(ctx, 18, -44 + br, 3.5); circ(ctx, -4, -42 + br, 2.5); ctx.fill();
    const sp = (t * 0.6) % 1;
    F(ctx, rgba(p.c, 0.6 * (1 - sp))); ctx.beginPath(); circ(ctx, -36 - sp * 10, -50 - sp * 20, 3); circ(ctx, 34 + sp * 8, -56 - sp * 16, 2.5); ctx.fill();
  } };
  EA.knight = { w: 66, h: 92, draw(ctx, t, p) {
    const bob = Math.sin(t * 2) * 1.5;
    shadow(ctx, 62);
    limb(ctx, -10, -16, -12, 0, 8, p.a); limb(ctx, 10, -16, 12, 0, 8, p.a);
    tone(ctx, c => rrect(c, -20, -62 + bob, 40, 48, 8), p.a, 0, -38, 20, { dark: -0.35 });
    ctx.beginPath(); ctx.moveTo(-14, -44 + bob); ctx.lineTo(14, -44 + bob); S(ctx, p.c, 3); ctx.stroke();
    limb(ctx, 18, -54 + bob, 34, -40 + bob, 7, p.a);
    ctx.save(); ctx.translate(34, -44 + bob); ctx.rotate(-1.5);
    IA.sword(ctx, 44, 10, '#c9d3e0', '#8a5a2b'); ctx.restore();
    limb(ctx, -18, -54 + bob, -30, -44 + bob, 7, p.a);
    ctx.save(); ctx.translate(-36, -46 + bob); IA.shield(ctx, 26, 32, p.c, PAL.gold); ctx.restore();
    tone(ctx, c => rrect(c, -16, -92 + bob, 32, 34, 12), p.b, 0, -75, 16, { dark: -0.35 });
    ctx.beginPath(); ctx.rect(-14, -80 + bob, 28, 7); F(ctx, INK); ctx.fill();
    F(ctx, p.c); ctx.beginPath(); circ(ctx, -7, -76.5 + bob, 1.8); circ(ctx, 4, -76.5 + bob, 1.8); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-10, -66 + bob); ctx.lineTo(10, -66 + bob); ctx.moveTo(-10, -62 + bob); ctx.lineTo(10, -62 + bob); S(ctx, shade(p.b, -0.5), 1.5); ctx.stroke();
    tone(ctx, c => { c.moveTo(-4, -92 + bob); c.quadraticCurveTo(10, -110 + bob, 22, -96 + bob); c.quadraticCurveTo(12, -96 + bob, 6, -90 + bob); c.closePath(); }, p.c, 8, -96, 10, { spec: false, dark: -0.3 });
  } };
  EA.wisp = { w: 50, h: 60, draw(ctx, t, p) {
    const y0 = -34 + Math.sin(t * 3) * 6, fl = Math.sin(t * 8) * 3;
    shadow(ctx, 30, 0.15);
    ctx.save(); ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.moveTo(-8, y0 + 8); ctx.quadraticCurveTo(-4, y0 + 30 + fl, 14, y0 + 40); ctx.quadraticCurveTo(8, y0 + 24, 8, y0 + 8); ctx.closePath(); F(ctx, p.b); ctx.fill();
    ctx.restore();
    tone(ctx, c => { c.moveTo(-18, y0); c.quadraticCurveTo(-18, y0 - 26 + fl, 0, y0 - 32); c.quadraticCurveTo(18, y0 - 26 - fl, 18, y0); c.quadraticCurveTo(18, y0 + 16, 0, y0 + 16); c.quadraticCurveTo(-18, y0 + 16, -18, y0); c.closePath(); }, p.a, 0, y0 - 6, 18, { dark: -0.15 });
    tone(ctx, c => { c.moveTo(-9, y0 + 2); c.quadraticCurveTo(-8, y0 - 14 - fl, 0, y0 - 18); c.quadraticCurveTo(8, y0 - 14 + fl, 9, y0 + 2); c.quadraticCurveTo(8, y0 + 10, 0, y0 + 10); c.quadraticCurveTo(-8, y0 + 10, -9, y0 + 2); c.closePath(); }, p.b, 0, y0 - 4, 9, { ol: 0, spec: false, dark: -0.1 });
    F(ctx, INK); ctx.beginPath(); ell(ctx, -5, y0 - 2, 2.5, 4, 0.2); ell(ctx, 5, y0 - 2, 2.5, 4, -0.2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-4, y0 + 6); ctx.quadraticCurveTo(0, y0 + 9, 4, y0 + 6); S(ctx, INK, 1.5); ctx.stroke();
  } };
  EA.crab = { w: 96, h: 56, draw(ctx, t, p) {
    const sn = Math.sin(t * 4) * 0.15;
    shadow(ctx, 90);
    for (let i = 0; i < 3; i++) for (const d of [-1, 1]) { const k = Math.sin(t * 6 + i * 1.5) * 2; limb(ctx, d * (14 + i * 6), -16, d * (30 + i * 8), 0 + k, 4, p.a); }
    tone(ctx, c => ell(c, 0, -22, 32, 18, 0), p.a, 0, -22, 30, { dark: -0.35 });
    F(ctx, shade(p.a, -0.3)); ctx.beginPath(); circ(ctx, -8, -30, 2.5); circ(ctx, 6, -26, 2.5); circ(ctx, 14, -32, 2); ctx.fill();
    const claw = (d) => {
      ctx.save(); ctx.translate(d * 38, -34); ctx.rotate(d * sn);
      tone(ctx, c => { c.moveTo(d * -8, 6); c.quadraticCurveTo(d * 14, -18, d * 22, -6); c.lineTo(d * 10, -2); c.lineTo(d * 20, 8); c.quadraticCurveTo(d * 8, 14, d * -8, 6); c.closePath(); }, p.b, d * 6, 0, 14, { dark: -0.35 });
      ctx.restore();
    };
    limb(ctx, -24, -28, -38, -34, 6, p.a); limb(ctx, 24, -28, 38, -34, 6, p.a);
    claw(-1); claw(1);
    limb(ctx, -10, -36, -14, -50, 3, p.a); limb(ctx, 4, -36, 6, -50, 3, p.a);
    eye(ctx, -14, -52, 4.5, -0.6, 0.3); eye(ctx, 6, -52, 4.5, -0.6, 0.3);
    ctx.beginPath(); ctx.moveTo(-10, -12); ctx.lineTo(-6, -8); ctx.lineTo(-2, -12); ctx.lineTo(2, -8); ctx.lineTo(6, -12); S(ctx, INK, 2); ctx.stroke();
  } };
  EA.drone = { w: 70, h: 64, draw(ctx, t, p) {
    const y0 = -30 + Math.sin(t * 5) * 3, rot = (t * 40) % TAU;
    shadow(ctx, 50, 0.22);
    ctx.beginPath(); ctx.moveTo(0, y0 - 18); ctx.lineTo(0, y0 - 28); S(ctx, INK, 5); ctx.stroke(); S(ctx, p.b, 2.5); ctx.stroke();
    ctx.save(); ctx.translate(0, y0 - 28); ctx.scale(Math.cos(rot), 1);
    tone(ctx, c => rrect(c, -32, -3, 64, 6, 3), '#c9d3e0', 0, 0, 32, { dark: -0.3, spec: false });
    ctx.restore();
    tone(ctx, c => rrect(c, -22, y0 - 16, 44, 30, 10), p.a, 0, y0, 22, { dark: -0.35 });
    ctx.beginPath(); ctx.arc(-6, y0 - 1, 9, 0, TAU); F(ctx, INK); ctx.fill();
    F(ctx, p.c); ctx.beginPath(); ctx.arc(-7, y0 - 2, 5, 0, TAU); ctx.fill();
    if (!FLAT) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-9, y0 - 4, 1.8, 0, TAU); ctx.fill(); }
    for (const d of [-1, 1]) {
      limb(ctx, d * 14, y0 + 12, d * 18, y0 + 24, 4, p.b);
      ctx.beginPath(); ctx.moveTo(d * 14, y0 + 24); ctx.lineTo(d * 10, y0 + 32); ctx.moveTo(d * 22, y0 + 24); ctx.lineTo(d * 26, y0 + 32); S(ctx, INK, 4.5); ctx.stroke(); S(ctx, '#c9d3e0', 2); ctx.stroke();
    }
    F(ctx, Math.floor(t * 4) % 2 ? p.c : shade(p.c, -0.5)); ctx.beginPath(); ctx.arc(14, y0 - 8, 2.5, 0, TAU); ctx.fill();
  } };
  EA.tinker = { w: 70, h: 74, draw(ctx, t, p) {
    const bob = Math.sin(t * 5) * 2;
    shadow(ctx, 64);
    tone(ctx, c => rrect(c, 6, -58 + bob, 26, 34, 6), '#8a5a2b', 19, -41, 14, { dark: -0.35 });
    ctx.save(); ctx.translate(20, -62 + bob); ctx.rotate(t * 3);
    tone(ctx, c => { for (let i = 0; i < 8; i++) { const a = i * TAU / 8, a2 = a + TAU / 16; c.lineTo(Math.cos(a) * 8, Math.sin(a) * 8); c.lineTo(Math.cos(a2) * 5.5, Math.sin(a2) * 5.5); } c.closePath(); }, '#c9d3e0', 0, 0, 8, { dark: -0.35, spec: false });
    ctx.restore();
    limb(ctx, -8, -12, -10, 0, 5, p.b); limb(ctx, 8, -12, 12, 0, 5, p.b);
    tone(ctx, c => rrect(c, -16, -44 + bob, 32, 36, 8), p.b, 0, -26, 16, { dark: -0.3 });
    limb(ctx, -14, -36 + bob, -32, -30 + bob, 5, p.a);
    ctx.save(); ctx.translate(-34, -30 + bob); ctx.rotate(-0.8);
    tone(ctx, c => rrect(c, -3, -4, 6, 24, 2), '#c9d3e0', 0, 8, 10, { dark: -0.35, spec: false });
    tone(ctx, c => { c.moveTo(-8, -12); c.lineTo(8, -12); c.lineTo(8, -4); c.lineTo(3, -4); c.lineTo(3, -8); c.lineTo(-3, -8); c.lineTo(-3, -4); c.lineTo(-8, -4); c.closePath(); }, '#c9d3e0', 0, -8, 8, { dark: -0.35, spec: false });
    ctx.restore();
    limb(ctx, 14, -36 + bob, 24, -26 + bob, 5, p.a);
    tone(ctx, c => circ(c, -2, -60 + bob, 15), p.a, -2, -60, 15, { dark: -0.3 });
    tone(ctx, c => { c.moveTo(-14, -66 + bob); c.lineTo(-30, -74 + bob); c.lineTo(-12, -56 + bob); c.closePath(); c.moveTo(12, -66 + bob); c.lineTo(28, -74 + bob); c.lineTo(12, -56 + bob); c.closePath(); }, p.a, 0, -64, 12, { dark: -0.3, spec: false });
    tone(ctx, c => rrect(c, -16, -72 + bob, 28, 10, 5), '#8a5a2b', -2, -67, 14, NOSPEC);
    for (const x of [-9, 5]) { ctx.beginPath(); ctx.arc(x, -67 + bob, 5, 0, TAU); F(ctx, p.c); ctx.fill(); S(ctx, INK, 2); ctx.stroke(); if (!FLAT) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x - 1.5, -68.5 + bob, 1.5, 0, TAU); ctx.fill(); } }
    F(ctx, shade(p.a, -0.3)); ctx.beginPath(); ctx.arc(-14, -58 + bob, 3.5, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-10, -50 + bob); ctx.quadraticCurveTo(-2, -44 + bob, 6, -50 + bob); S(ctx, INK, 2.5); ctx.stroke();
  } };
  EA.cultist = { w: 60, h: 90, draw(ctx, t, p) {
    const bob = Math.sin(t * 1.5) * 2, fl = Math.sin(t * 9) * 2;
    shadow(ctx, 56);
    tone(ctx, c => { c.moveTo(-24, 0); c.lineTo(-14, -58 + bob); c.lineTo(0, -92 + bob); c.lineTo(14, -58 + bob); c.lineTo(24, 0); c.closePath(); }, p.a, 0, -36, 24, { dark: -0.4 });
    ctx.beginPath(); ctx.moveTo(-8, -66 + bob); ctx.quadraticCurveTo(0, -50 + bob, 8, -66 + bob); ctx.quadraticCurveTo(0, -80 + bob, -8, -66 + bob); ctx.closePath(); F(ctx, INK); ctx.fill();
    tone(ctx, c => ell(c, 0, -64 + bob, 8, 10, 0), p.b, 0, -64, 9, { dark: -0.2, spec: false });
    F(ctx, INK); ctx.beginPath(); ell(ctx, -3.5, -66 + bob, 2, 3, 0.3); ell(ctx, 3.5, -66 + bob, 2, 3, -0.3); ctx.fill();
    F(ctx, p.c); ctx.beginPath(); ctx.moveTo(0, -60 + bob); ctx.lineTo(-3, -56 + bob); ctx.lineTo(3, -56 + bob); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-14, -36 + bob); ctx.lineTo(14, -36 + bob); S(ctx, p.c, 2); ctx.stroke();
    limb(ctx, -14, -48 + bob, -30, -52 + bob, 5, p.a);
    tone(ctx, c => rrect(c, -34, -66 + bob, 8, 16, 2), '#f4ecd6', -30, -58, 8, { dark: -0.2, spec: false });
    tone(ctx, c => { c.moveTo(-34, -66 + bob); c.quadraticCurveTo(-33, -76 + bob + fl, -30, -80 + bob); c.quadraticCurveTo(-27, -76 + bob - fl, -26, -66 + bob); c.closePath(); }, '#ff8a2b', -30, -72, 5, { ol: 1.5, dark: -0.1 });
    F(ctx, '#fff2a0'); ctx.beginPath(); ctx.arc(-30, -69 + bob, 1.6, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(0, -20 + bob, 7, 0, TAU); ctx.moveTo(-6, -24 + bob); ctx.lineTo(6, -16 + bob); ctx.moveTo(6, -24 + bob); ctx.lineTo(-6, -16 + bob); S(ctx, p.c, 1.5); ctx.stroke();
  } };
  // ---- the monsters pass: three scavengers
  // Trash Panda: a raccoon with a bandit mask and a ringed tail, paws up.
  EA.raccoon = { w: 84, h: 62, draw(ctx, t, p) {
    const bob = Math.sin(t * 4) * 1.5, sw = Math.sin(t * 2.6) * 0.18;
    shadow(ctx, 82);
    ctx.save(); ctx.translate(22, -18); ctx.rotate(-0.55 + sw);
    tone(ctx, c => ell(c, 18, 0, 22, 10, 0), p.a, 18, 0, 20, { dark: -0.3 });
    ctx.save(); ctx.beginPath(); ell(ctx, 18, 0, 21, 9, 0); ctx.clip();
    F(ctx, p.b); ctx.beginPath(); for (let i = 0; i < 3; i++) ctx.rect(8 + i * 10, -12, 4.5, 24); ctx.fill();
    ctx.restore(); ctx.restore();
    limb(ctx, -14, -8, -18, 0, 6, p.b); limb(ctx, 10, -8, 14, 0, 6, p.b);
    tone(ctx, c => ell(c, 0, -22 + bob, 25, 19, 0), p.a, 0, -22, 24, { dark: -0.3 });
    tone(ctx, c => ell(c, -6, -18 + bob, 12, 11, 0), '#d8dae4', -6, -18, 10, { dark: -0.15, spec: false });
    limb(ctx, -16, -26 + bob, -30, -30 + bob, 5, p.b); limb(ctx, 4, -26 + bob, -20, -34 + bob, 5, p.b);
    const hx = -20, hy = -44 + bob;
    const ear = (d) => tone(ctx, c => { c.moveTo(hx + d * 6, hy - 10); c.lineTo(hx + d * 15, hy - 24); c.lineTo(hx + d * 16, hy - 6); c.closePath(); }, p.a, hx + d * 12, hy - 12, 7, { dark: -0.3, spec: false });
    ear(-1); ear(1);
    tone(ctx, c => circ(c, hx, hy, 16), p.a, hx, hy, 16, { dark: -0.3 });
    tone(ctx, c => ell(c, hx - 11, hy + 6, 9, 6, -0.2), '#e8eaf2', hx - 11, hy + 6, 7, { dark: -0.1, spec: false });
    F(ctx, p.b); ctx.beginPath(); ell(ctx, hx - 1, hy - 2, 16, 6, -0.12); ctx.fill();
    eye(ctx, hx - 7, hy - 2, 4.2, -0.8, 0.1, p.c); eye(ctx, hx + 6, hy - 3, 4.2, -0.8, 0.1, p.c);
    F(ctx, INK); ctx.beginPath(); ctx.arc(hx - 19, hy + 5, 3, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(hx - 16, hy + 10); ctx.quadraticCurveTo(hx - 11, hy + 13, hx - 6, hy + 9); S(ctx, INK, 1.5); ctx.stroke();
  } };
  // Scrap Goat: tin patches on its back, curled horns, a bolt in its teeth.
  EA.goat = { w: 94, h: 88, draw(ctx, t, p) {
    const chew = Math.sin(t * 9) * 1.4, bob = Math.sin(t * 2.2) * 1.2;
    shadow(ctx, 86);
    for (const lx of [-22, -10, 16, 28]) limb(ctx, lx, -26, lx + (lx < 0 ? -2 : 2), 0, 5, p.b);
    tone(ctx, c => ell(c, 6, -36 + bob, 34, 19, 0), p.a, 6, -36, 32, { dark: -0.3 });
    tone(ctx, c => rrect(c, -2, -56 + bob, 20, 11, 2), '#8e98a8', 8, -50, 9, NOSPEC);
    tone(ctx, c => rrect(c, 18, -52 + bob, 14, 9, 2), '#c98a1a', 25, -48, 7, NOSPEC);
    F(ctx, INK); ctx.beginPath(); circ(ctx, 1, -53 + bob, 1.3); circ(ctx, 15, -53 + bob, 1.3); circ(ctx, 21, -49 + bob, 1.2); ctx.fill();
    tone(ctx, c => { c.moveTo(38, -44 + bob); c.lineTo(48, -54 + bob); c.lineTo(42, -38 + bob); c.closePath(); }, p.b, 43, -46, 6, { dark: -0.2, spec: false });
    const hx = -28, hy = -58 + bob;
    tone(ctx, c => ell(c, -16, -46 + bob, 11, 14, -0.5), p.a, -16, -46, 11, { dark: -0.3 });
    const horn = (d) => {
      ctx.beginPath(); ctx.moveTo(hx + d * 4, hy - 10); ctx.quadraticCurveTo(hx + d * 4 + 14, hy - 34, hx + d * 4 + 22, hy - 16);
      S(ctx, INK, 8); ctx.stroke(); S(ctx, '#e8d8b0', 4.5); ctx.stroke();
    };
    horn(-1); horn(1);
    tone(ctx, c => ell(c, hx, hy, 13, 15, 0.35), p.a, hx, hy, 13, { dark: -0.3 });
    tone(ctx, c => ell(c, hx - 10, hy + 9, 8, 7, 0.3), shade(p.a, 0.25), hx - 10, hy + 9, 7, { dark: -0.15, spec: false });
    tone(ctx, c => { c.moveTo(hx + 8, hy - 6); c.lineTo(hx + 22, hy - 2); c.lineTo(hx + 10, hy + 2); c.closePath(); }, p.a, hx + 14, hy - 2, 6, { dark: -0.3, spec: false });
    tone(ctx, c => circ(c, hx - 2, hy - 3, 5), '#ffe066', hx - 2, hy - 3, 5, NOSPEC);
    F(ctx, INK); ctx.beginPath(); ctx.rect(hx - 5, hy - 4, 6, 2.2); ctx.fill();
    tone(ctx, c => { c.moveTo(hx - 12, hy + 14); c.lineTo(hx - 6, hy + 28); c.lineTo(hx - 2, hy + 14); c.closePath(); }, shade(p.a, 0.35), hx - 7, hy + 18, 5, { dark: -0.2, spec: false });
    ctx.save(); ctx.translate(hx - 18, hy + 10 + chew); ctx.rotate(0.3);
    tone(ctx, c => rrect(c, -9, -2.5, 14, 5, 1.5), '#c9d3e0', -2, 0, 6, NOSPEC);
    tone(ctx, c => rrect(c, 4, -4.5, 5, 9, 1), '#8e98a8', 6, 0, 4, NOSPEC);
    ctx.restore();
  } };
  // Crystal Magpie: a black and white thief with a cyan sheen and a long tail.
  EA.magpie = { w: 80, h: 84, draw(ctx, t, p) {
    const hop = Math.abs(Math.sin(t * 3.2)) * 4, cock = Math.sin(t * 1.7) * 0.12;
    shadow(ctx, 52);
    limb(ctx, -6, -14, -8, 0, 3, '#ffc94d'); limb(ctx, 6, -14, 8, 0, 3, '#ffc94d');
    tone(ctx, c => poly(c, [10, -34 - hop, 44, -6 - hop * 0.5, 38, 0 - hop * 0.5, 4, -24 - hop]), p.a, 26, -16, 14, { dark: -0.3 });
    ctx.beginPath(); ctx.moveTo(18, -26 - hop); ctx.lineTo(38, -6 - hop * 0.5); S(ctx, rgba(p.c, 0.6), 2); ctx.stroke();
    tone(ctx, c => ell(c, 0, -38 - hop, 21, 27, 0.25), p.a, 0, -38, 22, { dark: -0.3 });
    tone(ctx, c => ell(c, -6, -30 - hop, 12, 16, 0.25), p.b, -6, -30, 12, { dark: -0.15 });
    tone(ctx, c => ell(c, 10, -42 - hop, 11, 19, 0.55), shade(p.a, 0.15), 10, -42, 12, { dark: -0.3 });
    ctx.beginPath(); ctx.moveTo(4, -52 - hop); ctx.quadraticCurveTo(18, -46 - hop, 16, -30 - hop); S(ctx, p.c, 2.5); ctx.stroke();
    ctx.save(); ctx.translate(-8, -66 - hop); ctx.rotate(cock);
    tone(ctx, c => circ(c, 0, 0, 13), p.a, 0, 0, 13, { dark: -0.3 });
    tone(ctx, c => poly(c, [-10, -3, -27, 1, -10, 5]), '#ffc94d', -16, 1, 6, { dark: -0.25, spec: false });
    tone(ctx, c => { star(c, -28, 3, 5, 4, 0.45); }, '#9fe4ff', -28, 3, 4, { ol: 1.2, spec: false });
    eye(ctx, -3, -3, 4.2, -0.7, 0, '#ff2e88');
    ctx.restore();
  } };
  // Unknown key: a friendly blob wearing its name.
  EA.blob = { w: 60, h: 60, draw(ctx, t, p, name) {
    shadow(ctx, 60);
    tone(ctx, c => ell(c, 0, -26, 28, 26, 0), p.a, 0, -26, 26, { dark: -0.3 });
    eye(ctx, -10, -30, 5, -0.5, 0.3); eye(ctx, 8, -30, 5, -0.5, 0.3);
    mouth(ctx, -2, -16, 12, 3);
    if (name) txt(ctx, String(name).slice(0, 12), 0, -60, 11, '#fff', true, 'center', true);
  } };
  const ENEMY_KEYS = ['rat', 'slime', 'bat', 'gremlin', 'mimic', 'spider', 'goblin', 'hoard', 'imp', 'clockwork', 'golem', 'furnace', 'magnet', 'ironjaw', 'wraith', 'yeti', 'frostmage', 'icemimic', 'prizemaster', 'mushroom', 'knight', 'wisp', 'crab', 'drone', 'tinker', 'cultist', 'raccoon', 'goat', 'magpie'];
  const ENEMY_PAL = {
    raccoon: ['#8e92a0', '#2b2b38', '#ffcf3a'], goat: ['#b08a5a', '#5a4632', '#ffe066'], magpie: ['#2b3a5a', '#e8f4ff', '#2ee6d6'],
    rat: ['#8e8a96', '#5a5662', '#ffb0c0'], slime: ['#a6ff5e', '#5ab82e', '#ffffff'], bat: ['#6a3b9c', '#3b1f5a', '#ffcf3a'],
    gremlin: ['#5ab84a', '#2e7a2a', '#ff2e88'], mimic: ['#8a5a2b', '#ffc94d', '#ffcf3a'], spider: ['#2b2340', '#ff2e30', '#ff2e30'],
    goblin: ['#6aa84a', '#8a5a2b', '#3a2a5a'], hoard: ['#a6ff5e', '#5ab82e', '#ffc94d'], imp: ['#ff5a4a', '#ffc94d', '#ffcf3a'],
    clockwork: ['#c98a1a', '#8a5a2b', '#2ee6d6'], golem: ['#6b6f7a', '#4a4e58', '#ff8a2b'], furnace: ['#4a4e58', '#2b2340', '#ff8a2b'],
    magnet: ['#d81f3a', '#c9d3e0', '#2ee6d6'], ironjaw: ['#8e98a8', '#4a4e58', '#ff2e88'], wraith: ['#cfe3ff', '#8aa8d8', '#2ee6d6'],
    yeti: ['#f4f8ff', '#9fc8e8', '#2ee6d6'], frostmage: ['#3b6fd6', '#2b3a8a', '#9fe4ff'], icemimic: ['#9fe4ff', '#8a5a2b', '#9fe4ff'],
    prizemaster: ['#3a1f6a', '#f1e2c6', '#ff2e88'], mushroom: ['#ff5a4a', '#f1e2c6', '#f4f8ff'], knight: ['#7a8090', '#c9d3e0', '#ff2e88'],
    wisp: ['#2ee6d6', '#e8fff8', '#ffffff'], crab: ['#ff5a4a', '#ff8a2b', '#ffffff'], drone: ['#5a6373', '#8e98a8', '#ff2e88'],
    tinker: ['#6aa84a', '#8a5a2b', '#ffc94d'], cultist: ['#5a1f6a', '#f1e2c6', '#ff2e88'],
  };
  const palTmp = { a: '#888', b: '#555', c: '#fff' };
  function enemyPal(def, key) {
    const d = ENEMY_PAL[key] || ['#8e8a96', '#5a5662', '#ff2e88'];
    palTmp.a = def.color || d[0]; palTmp.b = def.color2 || d[1]; palTmp.c = def.color3 || d[2];
    return palTmp;
  }
  // nominal {w, h} of an enemy's body at the given scale (for bubbles/bars)
  function enemyBox(def, scale) {
    def = def || {};
    const art = EA[def.art] || EA.blob;
    const s = (def.size || 1) * (scale == null ? 1 : scale) * (def.tier === 'boss' ? 1.6 : 1);
    dimsTmp.w = art.w * s; dimsTmp.h = art.h * s;
    return dimsTmp;
  }

  // Flames used for burning enemies and the campfire tile.
  function flames(ctx, x, y, w, h, t, seed) {
    const n = 3;
    for (let i = 0; i < n; i++) {
      const ph = t * 7 + i * 2.1 + (seed || 0), fx = x + (i - 1) * w * 0.35, fh = h * (0.7 + 0.3 * Math.sin(ph));
      tone(ctx, c => { c.moveTo(fx - w * 0.2, y); c.quadraticCurveTo(fx - w * 0.22, y - fh * 0.5, fx + Math.sin(ph * 1.3) * w * 0.1, y - fh); c.quadraticCurveTo(fx + w * 0.22, y - fh * 0.5, fx + w * 0.2, y); c.closePath(); }, '#ff8a2b', fx, y - fh * 0.4, w * 0.3, { ol: 1.5, dark: -0.1, spec: false });
      F(ctx, '#ffe066'); ctx.beginPath(); ctx.moveTo(fx - w * 0.09, y); ctx.quadraticCurveTo(fx, y - fh * 0.55, fx + w * 0.09, y); ctx.fill();
    }
  }

  /* RENDER.enemy(ctx, def, x, y, scale, t, st) -- feet at (x, y). */
  function enemy(ctx, def, x, y, scale, t, st) {
    ctx.save();
    try {
      def = def || {}; st = st || {}; t = t || 0;
      const key = def.art;
      const art = EA[key] && key !== 'blob' ? EA[key] : EA.blob;
      const boss = def.tier === 'boss';
      const s = (def.size || 1) * (scale == null ? 1 : scale) * (boss ? 1.6 : 1);
      const p = enemyPal(def, key);
      const hurt = U.clamp(+st.hurt || 0, 0, 1), atk = U.clamp(+st.attack || 0, 0, 1), dead = U.clamp(+st.dead || 0, 0, 1);
      ctx.translate(x || 0, y || 0);
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      if (boss && dead < 1) {
        const r = Math.max(art.w, art.h) * s * 0.55, pul = 1 + Math.sin(t * 3) * 0.05;
        glow(ctx, 0, -art.h * s * 0.45, r * 1.3, p.c, 0.5 * (1 - dead));
        ctx.save(); ctx.globalAlpha = (0.55 + Math.sin(t * 3) * 0.2) * (1 - dead);
        ctx.beginPath(); ctx.ellipse(0, -art.h * s * 0.45, r * pul, r * pul * 0.9, t * 0.5, 0, TAU);
        ctx.setLineDash(dashAura); ctx.lineDashOffset = -t * 40;
        S(ctx, p.c, 3); ctx.stroke();
        ctx.restore();
      }
      // Phase two (the monsters pass): a red flame crown behind the body.
      if ((st.enraged || st.rage > 0) && dead < 1) rageCrown(ctx, art.w * s, art.h * s, t, U.clamp(+st.rage || 0, 0, 1));
      if (st.alpha != null) ctx.globalAlpha = st.alpha;
      if (dead > 0) {
        ctx.globalAlpha = (1 - dead) * (st.alpha != null ? st.alpha : 1);
        ctx.rotate(dead * 1.2); ctx.translate(0, dead * 10);
      }
      // Attack: a wind-up (st.windup, the beat before the hit: lean back and
      // tremble), then the strike (st.attack 1 -> 0: snap forward, recover).
      const wind = U.clamp(+st.windup || 0, 0, 1);
      const lunge = lungeCurve(atk) - wind * 0.3;
      const trem = wind > 0 ? Math.sin(t * 70) * 2 * wind : 0;
      ctx.translate(-lunge * 34 * s + trem, 0);
      const sq = Math.max(0, -lunge);
      // chomp (swallowing): squash; spit (items back up): stretch; rage: a
      // size pop into phase two, then 8% bigger for good.
      const chomp = Math.sin(U.clamp(+st.chomp || 0, 0, 1) * Math.PI), spitK = Math.sin(U.clamp(+st.spit || 0, 0, 1) * Math.PI);
      const rageK = (st.enraged ? 1.08 : 1) + Math.sin(U.clamp(+st.rage || 0, 0, 1) * Math.PI) * 0.22;
      const sx = (1 + hurt * 0.28 + Math.max(0, lunge) * 0.12 - sq * 0.25 + chomp * 0.16 - spitK * 0.1) * (1 - dead * 0.2) * rageK,
        sy = (1 - hurt * 0.28 - Math.max(0, lunge) * 0.08 + sq * 0.22 - chomp * 0.18 + spitK * 0.16) * (1 - dead * 0.5) * (1 + Math.sin(t * 3) * 0.02) * rageK;
      ctx.scale(s * sx, s * sy);
      // PNG override: height = the nominal body box, feet on the origin.
      const img = artImg('enemy', def.id) || artImg('enemy', key);
      const ih = art.h, iw = img ? ih * imW(img) / imH(img) : 0;
      if (img) blit(ctx, img, -iw / 2, -ih, iw, ih);
      else art.draw(ctx, t, p, art === EA.blob ? (def.name || key) : null);
      if (st.frozen) {
        if (img) silhouette(ctx, img, -iw / 2, -ih, iw, ih, 'rgba(120,200,255,0.45)');
        else { FLAT = 'rgba(120,200,255,0.45)'; try { art.draw(ctx, 0, p); } finally { FLAT = null; } }
        const iy = -art.h * 0.5, ic = ['#dff4ff', '#bfe8ff'];
        for (let i = 0; i < 4; i++) {
          const ix = -art.w * 0.4 + i * art.w * 0.27, ih = 10 + (i % 2) * 8;
          tone(ctx, c => poly(c, [ix - 5, iy, ix + 5, iy, ix, iy + ih]), ic[i % 2], ix, iy + ih * 0.3, 5, { ol: 1.5, dark: -0.15 });
        }
      }
      if (st.poisoned) {
        if (img) silhouette(ctx, img, -iw / 2, -ih, iw, ih, 'rgba(120,255,80,0.18)');
        else { FLAT = 'rgba(120,255,80,0.18)'; try { art.draw(ctx, t, p); } finally { FLAT = null; } }
        for (let i = 0; i < 3; i++) {
          const ph = (t * 0.9 + i * 0.37) % 1, dx = -art.w * 0.3 + i * art.w * 0.3, dy = -art.h * 0.6 + ph * art.h * 0.6;
          tone(ctx, c => { c.moveTo(dx, dy - 6); c.quadraticCurveTo(dx + 4, dy, dx, dy + 3); c.quadraticCurveTo(dx - 4, dy, dx, dy - 6); c.closePath(); }, PAL.lime, dx, dy, 4, { ol: 1.5, dark: -0.3, spec: false });
        }
      }
      if (st.chilled && !st.frozen) {
        if (img) silhouette(ctx, img, -iw / 2, -ih, iw, ih, 'rgba(140,210,255,0.28)');
        else { FLAT = 'rgba(140,210,255,0.28)'; try { art.draw(ctx, t, p); } finally { FLAT = null; } }
      }
      if (st.windup > 0) {
        const wa = U.clamp(+st.windup, 0, 1) * (0.25 + Math.sin(t * 30) * 0.1);
        if (img) silhouette(ctx, img, -iw / 2, -ih, iw, ih, rgba('#ff2e30', wa));
        else { FLAT = rgba('#ff2e30', wa); try { art.draw(ctx, t, p); } finally { FLAT = null; } }
      }
      if (st.burning) {
        flames(ctx, -art.w * 0.15, 2, art.w * 0.6, art.h * 0.45, t, 0);
        flames(ctx, art.w * 0.2, -art.h * 0.5, art.w * 0.35, art.h * 0.3, t, 3);
      }
      if (st.enraged || st.rage > 0) {
        // phase two: a pulsing red cast, white hot for the pop itself
        const rk = U.clamp(+st.rage || 0, 0, 1);
        const col = rk > 0.5 ? rgba('#ffffff', (rk - 0.5) * 1.4) : rgba('#ff2e30', 0.2 + Math.sin(t * 6) * 0.08 + rk * 0.4);
        if (img) silhouette(ctx, img, -iw / 2, -ih, iw, ih, col);
        else { FLAT = col; try { art.draw(ctx, t, p); } finally { FLAT = null; } }
      }
      if (hurt > 0) {
        FLAT = '#ffffff';
        ctx.globalAlpha = hurt * 0.85 * (1 - dead);
        if (img) { FLAT = null; silhouette(ctx, img, -iw / 2, -ih, iw, ih, '#ffffff'); }
        else { try { art.draw(ctx, t, p); } finally { FLAT = null; } }
      }
    } catch (e) { FLAT = null; }
    ctx.restore();
  }
  const dashAura = [10, 8];

  /* ---- the monsters pass (DESIGN.md "Enemies"): phase two, bellies,
     affixes, bin marks, the jammed rail. Pure functions of their args. */
  // A crown of red flame licks behind an enraged enemy (feet at the origin,
  // body w x h in stage px); pop 1 -> 0 is the transformation burst.
  function rageCrown(ctx, w, h, t, pop) {
    ctx.save();
    try {
      const cy = -h * 0.5, R = Math.max(w, h) * (0.55 + pop * 0.35);
      glow(ctx, 0, cy, R * 1.25, '#ff2e30', 0.45 + pop * 0.4 + Math.sin(t * 7) * 0.08);
      ctx.globalCompositeOperation = 'lighter';
      const n = 12;
      for (let i = 0; i < n; i++) {
        const a = i / n * TAU + t * 0.6, fl = 0.75 + 0.25 * Math.sin(t * 9 + i * 1.7);
        const x0 = Math.cos(a) * R * 0.55, y0 = cy + Math.sin(a) * R * 0.5, x1 = Math.cos(a) * R * (0.8 + 0.25 * fl), y1 = cy + Math.sin(a) * R * (0.72 + 0.2 * fl) - 10 * fl;
        ctx.beginPath(); ctx.moveTo(x0 - Math.sin(a) * 7, y0 + Math.cos(a) * 7); ctx.lineTo(x1, y1); ctx.lineTo(x0 + Math.sin(a) * 7, y0 - Math.cos(a) * 7); ctx.closePath();
        ctx.fillStyle = i % 2 ? 'rgba(255,90,74,0.55)' : 'rgba(255,201,77,0.45)'; ctx.fill();
      }
    } catch (e) { /* */ }
    ctx.restore();
  }
  const AFFIX_FALLBACK = { armored: ['A', '#aab3bd'], hasty: ['H', '#ffe066'], vampiric: ['V', '#d81f3a'], spiky: ['S', '#8fae3a'], explosive: ['X', '#ff8a2e'], regen: ['R', '#6bd35e'], greedy: ['G', '#ffc94d'] };
  function affixLook(id) {
    const d = typeof DATA !== 'undefined' && DATA && DATA.AFFIXES && DATA.AFFIXES[id];
    const fb = AFFIX_FALLBACK[id] || ['?', '#ff2e88'];
    affTmp.icon = (d && d.icon) || fb[0]; affTmp.col = (d && d.color) || fb[1];
    return affTmp;
  }
  const affTmp = { icon: '', col: '' };
  /* Affix aura behind an elite (feet at (x, y), body w x h): a soft glow in
     each affix colour and a dashed ring of motes that orbit. */
  function affixAura(ctx, x, y, w, h, ids, t) {
    if (!ids || !ids.length) return;
    ctx.save();
    try {
      const cy = y - h * 0.5, R = Math.max(w, h) * 0.62;
      for (let k = 0; k < ids.length; k++) {
        const L = affixLook(ids[k]);
        glow(ctx, x, cy, R * (1.1 - k * 0.12), L.col, 0.3 + Math.sin(t * 3 + k) * 0.08);
        ctx.globalAlpha = 0.55;
        ctx.beginPath(); ctx.ellipse(x, y - 2, w * 0.55 + k * 8, 10 + k * 3, 0, 0, TAU);
        ctx.setLineDash(dashAura); ctx.lineDashOffset = (k % 2 ? 1 : -1) * t * 36;
        S(ctx, L.col, 3); ctx.stroke(); ctx.setLineDash(NODASH);
        ctx.globalAlpha = 0.85;
        for (let i = 0; i < 4; i++) {
          const a = t * (1.2 + k * 0.4) + i * TAU / 4 + k, px = x + Math.cos(a) * R * 0.8, py = cy + Math.sin(a) * R * 0.45;
          ctx.beginPath(); ctx.arc(px, py, 2.6, 0, TAU); ctx.fillStyle = L.col; ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    } catch (e) { /* */ }
    ctx.restore();
  }
  const NODASH = [];
  // A column of affix chips (icon discs) upward from (x, y).
  function affixBadges(ctx, x, y, ids, t, size) {
    if (!ids || !ids.length) return;
    ctx.save();
    try {
      size = size || 22;
      for (let k = 0; k < ids.length; k++) {
        const L = affixLook(ids[k]), cy = y - k * (size + 4) - size / 2, pul = 1 + Math.sin(t * 4 + k * 1.3) * 0.06;
        ctx.save(); ctx.translate(x, cy); ctx.scale(pul, pul);
        glow(ctx, 0, 0, size, L.col, 0.45);
        ctx.beginPath(); ctx.arc(0, 0, size / 2, 0, TAU); F(ctx, shade(L.col, -0.6)); ctx.fill(); S(ctx, L.col, 2.5); ctx.stroke();
        const aimg = artImg('status', 'affix_' + ids[k]);
        if (aimg) blitContain(ctx, aimg, 0, 0, size * 0.8, size * 0.8);
        else txt(ctx, L.icon, 0, 0.5, size * 0.58, L.col, true, 'center', INK);
        ctx.restore();
      }
    } catch (e) { /* */ }
    ctx.restore();
  }
  /* The belly bubble: a wobbling translucent sac at (x, y), radius r, with
     the swallowed items tumbling inside. items: [{def, inst, t0}], o: {turns
     [n per item: its turns until digested], gut 0..1 (the hiccup meter), now
     (clock for t0 pop-ins)}. */
  function belly(ctx, x, y, r, items, t, o) {
    if (!items || !items.length) return;
    o = o || 0;
    ctx.save();
    try {
      const wob = Math.sin(t * 5) * 0.06, n = items.length;
      ctx.translate(x, y);
      ctx.save(); ctx.scale(1 + wob, 1 - wob);
      glow(ctx, 0, 0, r * 1.6, '#ff7ad9', 0.35);
      ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU);
      F(ctx, 'rgba(255,170,220,0.22)'); ctx.fill();
      ctx.setLineDash(dashAura); ctx.lineDashOffset = t * 12;
      S(ctx, 'rgba(255,255,255,0.7)', 2.5); ctx.stroke(); ctx.setLineDash(NODASH);
      ctx.restore();
      const now = o.now != null ? o.now : t;
      for (let i = 0; i < n; i++) {
        const it = items[i], def = it.def || {};
        const pop = it.t0 ? U.clamp((now - it.t0) / 0.25, 0, 1) : 1;
        if (pop <= 0) continue;
        const a = t * 0.9 + i * TAU / n, rr = n > 1 ? r * 0.42 : 0;
        const ix = Math.cos(a) * rr, iy = Math.sin(a) * rr * 0.8 + Math.sin(t * 2.3 + i) * 2;
        const d = shapeDims(def.shape || { kind: 'circle', r: 14 });
        const k = Math.min(1.1, (r * (n > 1 ? 0.95 : 1.4)) / Math.max(12, d.w, d.h)) * U.ease.outBack(pop);
        item(ctx, def, ix, iy, Math.sin(t * 1.5 + i * 2) * 0.6, k, { plus: it.inst && it.inst.plus, alpha: 0.95 });
        const left = o.turns ? o.turns[i] : 0;
        if (left > 0) {
          // turns until digested, on a little clock chip
          const cx = ix + 9, cy = iy - 9, col = left <= 1 ? PAL.blood : '#ffc94d';
          ctx.beginPath(); ctx.arc(cx, cy, 7, 0, TAU); F(ctx, INK); ctx.fill(); S(ctx, col, 1.5); ctx.stroke();
          txt(ctx, String(left), cx, cy + 0.5, 10, col, true, 'center', INK);
        }
      }
      // gloss, then the hiccup meter around the rim
      ctx.globalAlpha = 0.55; F(ctx, '#ffffff');
      ctx.beginPath(); ctx.ellipse(-r * 0.4, -r * 0.45, r * 0.28, r * 0.14, -0.6, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
      const g = U.clamp(+o.gut || 0, 0, 1);
      if (g > 0) {
        ctx.beginPath(); ctx.arc(0, 0, r + 5, -Math.PI / 2, -Math.PI / 2 + g * TAU);
        S(ctx, PAL.lime, 4); ctx.stroke();
        if (g > 0.6) glow(ctx, 0, 0, r * 1.3, PAL.lime, (g - 0.6) * 1.2);
      }
    } catch (e) { /* */ }
    ctx.restore();
  }
  /* Marks on a bin item's body (stage (x, y), radius r): 'rust' (orange
     speckles), 'fuse' (a sparking fuse and the turns left), 'egg' (a
     wobble and the turns until it hatches). */
  function binMark(ctx, kind, x, y, r, t, v) {
    ctx.save();
    try {
      if (kind === 'rust') {
        ctx.globalAlpha = 0.32;
        ctx.beginPath(); ctx.arc(x, y, r * 0.9, 0, TAU); ctx.fillStyle = '#c86a2e'; ctx.fill();
        ctx.globalAlpha = 0.85;
        for (let i = 0; i < 6; i++) {
          const a = i * 2.39, d = r * (0.25 + (i % 3) * 0.2);
          ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, 2.2 + (i % 2) * 1.5, 0, TAU);
          ctx.fillStyle = i % 2 ? '#c86a2e' : '#8a3a1a'; ctx.fill();
        }
      } else if (kind === 'fuse' || kind === 'egg') {
        const hot = v <= 1, pul = hot ? 1 + Math.abs(Math.sin(t * 10)) * 0.25 : 1 + Math.sin(t * 4) * 0.08;
        if (kind === 'fuse') {
          const sx = x + r * 0.5, sy = y - r * 0.9;
          // a red danger pulse around the bomb, faster on its last turn
          glow(ctx, x, y, r * 2.4, PAL.blood, (hot ? 0.45 : 0.25) + Math.abs(Math.sin(t * (hot ? 9 : 4))) * 0.3);
          ctx.globalCompositeOperation = 'lighter';
          glow(ctx, sx, sy, 10 + Math.sin(t * 30) * 2, '#ffe066', 0.8);
          ctx.globalCompositeOperation = 'source-over';
        }
        const col = kind === 'fuse' ? (hot ? PAL.blood : '#ff8a2b') : (hot ? PAL.pink : '#b08cff');
        const cx = x, cy = y - r - 12;
        ctx.save(); ctx.translate(cx, cy); ctx.scale(pul, pul);
        ctx.beginPath(); rrect(ctx, -12, -9, 24, 18, 6); F(ctx, INK); ctx.fill(); S(ctx, col, 2); ctx.stroke();
        txt(ctx, String(v), 0, 0.5, 13, col, true, 'center', INK);
        ctx.restore();
      }
    } catch (e) { /* */ }
    ctx.restore();
  }
  // A big wrench jammed across the claw rail (stage x, y; s scale; a angle).
  function wrench(ctx, x, y, s, a, noLabel) {
    ctx.save();
    try {
      ctx.translate(x, y); ctx.rotate(a || 0); ctx.scale(s || 1, s || 1);
      ctx.lineJoin = 'round';
      tone(ctx, c => rrect(c, -34, -5, 58, 10, 4), '#aab3bd', -5, 0, 20, { dark: -0.3 });
      tone(ctx, c => { c.moveTo(22, -12); c.lineTo(40, -12); c.lineTo(44, -4); c.lineTo(34, -4); c.lineTo(34, 4); c.lineTo(44, 4); c.lineTo(40, 12); c.lineTo(22, 12); c.closePath(); }, '#c9d3e0', 32, 0, 12, { dark: -0.3 });
      tone(ctx, c => circ(c, -34, 0, 9), '#aab3bd', -34, 0, 9, { dark: -0.3 });
      F(ctx, INK); ctx.beginPath(); ctx.arc(-34, 0, 3.5, 0, TAU); ctx.fill();
      if (!noLabel) txt(ctx, 'JAMMED', 0, 22, 12, PAL.gold, true, 'center', INK);
    } catch (e) { /* */ }
    ctx.restore();
  }
  /* Strike curve for st.attack (1 at the hit, decaying to 0): a fast snap
     forward to full reach, a short hold, an eased recovery. */
  function lungeCurve(atk) {
    if (!(atk > 0)) return 0;
    const u = 1 - atk;
    if (u < 0.12) return U.ease.outCubic(u / 0.12);
    if (u < 0.3) return 1;
    return 1 - U.ease.inOut((u - 0.3) / 0.7);
  }

  /* ========================================================= CABINET */
  // (x, y) is the interior's top-left (the physics origin); the frame is
  // drawn around it. cfg: {w, h, frame, chuteW, dividerH, railY, slopeW, slopeH}
  // (slopeW/slopeH: the floor wedges PHYS.cabinet builds, drawn as part of the floor).
  const ACT_NEON = { 1: PAL.pink, 2: '#ff8a2b', 3: PAL.cyan };
  const PARTY_COLS = [PAL.pink, PAL.gold, PAL.cyan, PAL.lime, '#9b7bff'];
  const cabTmp = { w: 480, h: 390, frame: 30, chuteW: 64, dividerH: 0.6, railY: 26, slopeW: 0, slopeH: 0 };
  function cabCfg(cfg) {
    cfg = cfg || {};
    cabTmp.w = cfg.w || 480; cabTmp.h = cfg.h || 390; cabTmp.frame = cfg.frame == null ? 30 : cfg.frame;
    cabTmp.chuteW = cfg.chuteW == null ? 64 : cfg.chuteW; cabTmp.dividerH = cfg.dividerH == null ? 0.6 : cfg.dividerH;
    cabTmp.railY = cfg.railY == null ? 26 : cfg.railY;
    cabTmp.slopeW = cfg.slopeW > 0 ? cfg.slopeW : 0; cabTmp.slopeH = cfg.slopeH > 0 ? cfg.slopeH : 0;
    return cabTmp;
  }
  function cabinetBack(ctx, x, y, cfg, st) {
    ctx.save();
    try {
      const c = cabCfg(cfg); st = st || {};
      const t = st.t || 0, neon = ACT_NEON[st.act] || (st.act && typeof st.act === 'string' ? st.act : PAL.pink);
      const w = c.w, h = c.h, f = c.frame;
      ctx.translate(x || 0, y || 0);
      ctx.lineJoin = 'round';
      // outer frame body
      ctx.beginPath(); rrect(ctx, -f, -f, w + f * 2, h + f * 2, 14);
      F(ctx, '#1d1233'); ctx.fill(); S(ctx, INK, 3); ctx.stroke();
      // neon tube hugging the interior
      ctx.beginPath(); rrect(ctx, -f * 0.5, -f * 0.5, w + f, h + f, 8);
      S(ctx, rgba(neon, 0.25), 9); ctx.stroke(); S(ctx, neon, 3); ctx.stroke();
      // chasing bulbs around the frame; st.party (0..1, a double or a
      // jackpot) turns them into a fast rainbow slot-machine chase
      const per = Math.max(4, (w + h) * 2 / 26), step = 26;
      const party = U.clamp(+st.party || 0, 0, 1);
      const chase = Math.floor(t * (8 + 26 * party)), mod = party > 0.05 ? 2 : 3;
      let k = 0;
      const bulb = (bx, by) => {
        const on = ((k - chase) % mod + mod) % mod === 0;
        const pc = party > 0.05 ? PARTY_COLS[(k + chase) % PARTY_COLS.length] : PAL.gold;
        ctx.beginPath(); ctx.arc(bx, by, 3.2 + party * 1.2, 0, TAU);
        F(ctx, on ? (party > 0.05 ? pc : '#fff6c0') : shade(neon, -0.55)); ctx.fill();
        if (on) glow(ctx, bx, by, 9 + party * 8, pc, 0.8);
        k++;
      };
      for (let i = 0; i * step < w; i++) bulb(i * step + 8, -f + 8);
      for (let i = 0; i * step < h; i++) bulb(w + f - 8, i * step + 8);
      for (let i = 0; i * step < w; i++) bulb(w - i * step - 8, h + f - 8);
      for (let i = 0; i * step < h; i++) bulb(-f + 8, h - i * step - 8);
      void per;
      // marquee text in the top band
      if (party > 0.3 && st.marquee) {
        const mc = PARTY_COLS[Math.floor(t * 12) % PARTY_COLS.length];
        txt(ctx, st.marquee, w / 2, -f * 0.5 + 1, 13 + party * 3, mc, true, 'center', INK);
      } else txt(ctx, 'CLAWSPIRE', w / 2, -f * 0.5 + 1, 13, neon, true, 'center', INK);
      // interior back panel
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
      F(ctx, '#0f0a1f'); ctx.fillRect(0, 0, w, h);
      ctx.translate(w / 2, h / 2); ctx.rotate((st.tilt || 0) * 0.06); ctx.translate(-w / 2, -h / 2);
      // back wall glow band
      F(ctx, rgba(neon, 0.08)); ctx.fillRect(0, 0, w, h * 0.35);
      // chevron floor band
      const fy = h * 0.72;
      F(ctx, '#1a1030'); ctx.fillRect(-w, fy, w * 3, h);
      ctx.beginPath();
      for (let i = -2; i * 40 < w + 80; i++) { const cx = i * 40; ctx.moveTo(cx, fy); ctx.lineTo(cx + 20, h); ctx.lineTo(cx + 40, fy); }
      S(ctx, rgba(neon, 0.35), 4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-w, fy); ctx.lineTo(w * 2, fy); S(ctx, rgba(neon, 0.5), 2); ctx.stroke();
      // dotted back panel
      F(ctx, rgba('#ffffff', 0.05));
      ctx.beginPath(); for (let yy = 16; yy < fy; yy += 24) for (let xx = 16; xx < w; xx += 24) circ(ctx, xx, yy, 1.5); ctx.fill();
      ctx.restore();
      const cx = w - c.chuteW, dy = h - h * c.dividerH;
      // floor wedges: the bowl the pile heaps into (same tread as the floor, lit top edge)
      if (c.slopeW > 0 && c.slopeH > 0) {
        const sw = c.slopeW, sh = c.slopeH, r = cx - 8;
        const wedge = (x0, x1, dir) => {
          // dir 1: high at x0, low at x1 (left wedge); dir -1: low at x0, high at x1
          const hiX = dir > 0 ? x0 : x1, loX = dir > 0 ? x1 : x0;
          ctx.save();
          ctx.beginPath(); ctx.moveTo(hiX, h - sh); ctx.lineTo(loX, h); ctx.lineTo(hiX, h); ctx.closePath();
          F(ctx, '#1a1030'); ctx.fill();
          ctx.clip();
          ctx.beginPath();
          for (let i = -1; i * 40 < sw + 40; i++) { const kx = Math.min(x0, x1) + i * 40; ctx.moveTo(kx, h - sh); ctx.lineTo(kx + 20, h + 6); ctx.lineTo(kx + 40, h - sh); }
          S(ctx, rgba(neon, 0.22), 4); ctx.stroke();
          ctx.restore();
          ctx.beginPath(); ctx.moveTo(hiX, h - sh); ctx.lineTo(loX, h);
          S(ctx, INK, 5); ctx.stroke(); S(ctx, rgba(neon, 0.7), 2.5); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(hiX, h - sh); ctx.lineTo(loX, h);
          S(ctx, rgba('#ffffff', 0.45), 1); ctx.stroke();
        };
        wedge(0, sw, 1);
        wedge(r - sw, r, -1);
      }
      // chute column
      F(ctx, rgba(INK, 0.55)); ctx.fillRect(cx, 0, c.chuteW, h);
      ctx.beginPath(); rrect(ctx, cx + 8, h - 40, c.chuteW - 16, 34, 5); F(ctx, '#05030a'); ctx.fill(); S(ctx, INK, 2); ctx.stroke();
      ctx.save(); ctx.beginPath(); ctx.rect(cx + 8, h - 42, c.chuteW - 16, 6); ctx.clip();
      ctx.beginPath(); for (let i = -1; i * 10 < c.chuteW; i++) { ctx.moveTo(cx + i * 10, h - 36); ctx.lineTo(cx + i * 10 + 6, h - 42); ctx.lineTo(cx + i * 10 + 12, h - 42); ctx.lineTo(cx + i * 10 + 6, h - 36); }
      F(ctx, PAL.gold); ctx.fill(); ctx.restore();
      ctx.save(); ctx.translate(cx + c.chuteW / 2, dy + (h - dy) * 0.45); ctx.rotate(-Math.PI / 2);
      txt(ctx, 'PRIZE', 0, 0, 16, rgba(neon, 0.8), true, 'center', INK);
      ctx.restore();
      glow(ctx, cx + c.chuteW / 2, h - 22, 30 + party * 30, party > 0.05 ? PAL.gold : neon, 0.35 + Math.sin(t * 4) * 0.12 + party * 0.5);
      // divider wall
      ctx.beginPath(); rrect(ctx, cx - 5, dy, 10, h - dy, 3);
      F(ctx, '#4a4e58'); ctx.fill(); S(ctx, INK, 2.5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - 2, dy + 6); ctx.lineTo(cx - 2, h - 6); S(ctx, '#c9d3e0', 1.5); ctx.stroke();
      tone(ctx, q => circ(q, cx, dy, 6), '#c9d3e0', cx, dy, 6, { dark: -0.35 });
      // rail at the top
      ctx.beginPath(); rrect(ctx, 4, c.railY - 5, w - 8, 10, 4);
      F(ctx, '#3a3f4a'); ctx.fill(); S(ctx, INK, 2.5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(10, c.railY - 2); ctx.lineTo(w - 10, c.railY - 2); S(ctx, '#8e98a8', 1.5); ctx.stroke();
      ctx.beginPath(); ctx.rect(0, c.railY - 9, 8, 18); ctx.rect(w - 8, c.railY - 9, 8, 18); F(ctx, '#1d1233'); ctx.fill(); S(ctx, INK, 2); ctx.stroke();
    } catch (e) { /* never throws */ }
    ctx.restore();
  }
  function cabinetFront(ctx, x, y, cfg, st) {
    ctx.save();
    try {
      const c = cabCfg(cfg); st = st || {};
      const t = st.t || 0, w = c.w, h = c.h, f = c.frame;
      ctx.translate(x || 0, y || 0);
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
      // glass tint + two diagonal reflections
      F(ctx, rgba('#9fe4ff', 0.05)); ctx.fillRect(0, 0, w, h);
      F(ctx, rgba('#ffffff', 0.07));
      ctx.beginPath(); ctx.moveTo(w * 0.05, 0); ctx.lineTo(w * 0.2, 0); ctx.lineTo(w * 0.55, h); ctx.lineTo(w * 0.4, h); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(w * 0.25, 0); ctx.lineTo(w * 0.3, 0); ctx.lineTo(w * 0.65, h); ctx.lineTo(w * 0.6, h); ctx.closePath(); ctx.fill();
      const fog = U.clamp(+st.fog || 0, 0, 1);
      if (fog > 0) {
        ctx.save(); ctx.globalAlpha = fog;
        F(ctx, rgba('#dfe9f5', 0.35)); ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 7; i++) {
          const px = (i * 97 + Math.sin(t * 0.4 + i) * 30) % (w + 80) - 40, py = (i * 61 + Math.cos(t * 0.3 + i * 2) * 20) % (h + 60) - 30;
          const sp = glowSprite('#f4f8ff', 70);
          if (sp) { try { ctx.drawImage(sp, px - 71, py - 71, 142, 142); } catch (e) { /* stub */ } }
          else { ctx.beginPath(); ctx.arc(px, py, 60, 0, TAU); F(ctx, rgba('#f4f8ff', 0.2)); ctx.fill(); }
        }
        ctx.restore();
      }
      const gr = U.clamp(+st.grease || 0, 0, 1);
      if (gr > 0) {
        ctx.save(); ctx.globalAlpha = gr * 0.7;
        S(ctx, rgba('#ffe066', 0.5), 6); ctx.lineCap = 'round';
        for (let i = 0; i < 5; i++) {
          const sx = w * (0.1 + i * 0.2), sy = h * (0.3 + (i % 2) * 0.4);
          ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(sx + 20, sy + 30 + Math.sin(t + i) * 6, sx + 50, sy + 24); ctx.stroke();
        }
        ctx.restore();
      }
      ctx.restore();
      // inner bevel over the frame edge
      ctx.beginPath(); ctx.rect(-1, -1, w + 2, h + 2);
      S(ctx, rgba('#ffffff', 0.35), 2); ctx.stroke();
      ctx.beginPath(); rrect(ctx, -f, -f, w + f * 2, h + f * 2, 14);
      S(ctx, rgba('#ffffff', 0.12), 2); ctx.stroke();
      // art/cabinet.png: a full frame overlay with a transparent window
      const cimg = artImg('cabinet', 'cabinet');
      if (cimg) blit(ctx, cimg, -f, -f, w + f * 2, h + f * 2);
    } catch (e) { /* never throws */ }
    ctx.restore();
  }
  function cabinet(ctx, x, y, cfg, st) { cabinetBack(ctx, x, y, cfg, st); cabinetFront(ctx, x, y, cfg, st); }

  /* ============================================================ CLAW */
  const CHROME = '#c9d3e0';
  const NOJUICE = {};
  function bodyPath(ctx, b, ox, oy) {
    const sh = b.shape;
    if (!sh) return false;
    if (sh.kind === 'circle') { ctx.moveTo(ox + b.x + sh.r, oy + b.y); ctx.arc(ox + b.x, oy + b.y, sh.r, 0, TAU); return true; }
    const vs = sh.verts; if (!vs || !vs.length) return false;
    const ca = Math.cos(b.a || 0), sa = Math.sin(b.a || 0);
    for (let i = 0; i < vs.length; i++) {
      const px = ox + b.x + vs[i].x * ca - vs[i].y * sa, py = oy + b.y + vs[i].x * sa + vs[i].y * ca;
      if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.closePath();
    return true;
  }
  /* One prong of the Claw Crawl rig: a chrome capsule chain (ink outline
     under a chrome stroke) with rivets at the knuckles and a pad at the tip:
     rubber (cfg.rubber) or a chrome glint. A ghost prong (the drawn-only
     third finger) is flat grey with no pad. pts are cabinet points. */
  function prongChain(ctx, pts, s, ox, oy, o) {
    if (!pts || pts.length < 2) return;
    const w = Math.max(3, 9 * s);
    const path = () => { ctx.moveTo(ox + pts[0].x, oy + pts[0].y); for (let i = 1; i < pts.length; i++) ctx.lineTo(ox + pts[i].x, oy + pts[i].y); };
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); path(); S(ctx, INK, w + OL * 1.6); ctx.stroke();
    ctx.beginPath(); path(); S(ctx, o.ghost ? '#8e98a8' : CHROME, w); ctx.stroke();
    if (o.ghost) return;
    // a darker seam down the middle reads as the bevel of a bent steel rod
    ctx.beginPath(); path(); S(ctx, shade(CHROME, -0.35), Math.max(1, w * 0.28)); ctx.stroke();
    for (let i = 1; i < pts.length - 1; i++) {
      const px = ox + pts[i].x, py = oy + pts[i].y, rr = Math.max(1.6, w * 0.26);
      tone(ctx, q => circ(q, px, py, rr), '#8e98a8', px, py, rr, { dark: -0.4, ol: 1.2, spec: false });
    }
    const a = pts[pts.length - 2], b = pts[pts.length - 1];
    if (o.rubber) {
      const kx = ox + a.x + (b.x - a.x) * 0.3, ky = oy + a.y + (b.y - a.y) * 0.3;
      ctx.beginPath(); ctx.moveTo(kx, ky); ctx.lineTo(ox + b.x, oy + b.y);
      S(ctx, INK, w + 1.5); ctx.stroke(); S(ctx, '#ff5a4a', Math.max(1.5, w - 2)); ctx.stroke();
    } else {
      F(ctx, '#ffffff'); ctx.beginPath(); ctx.arc(ox + b.x - w * 0.15, oy + b.y - w * 0.15, Math.max(1, w * 0.18), 0, TAU); ctx.fill();
    }
  }
  /* The claw. rig.bodies = {hub:{x,y,r}, prongs:[[pts],[pts]], ghost:[pts]|null}
     in cabinet coordinates; rig.cableTop, rig.sway, rig.phase and rig.cfg
     (rubber / magnet / prongs) come from PHYS.clawRig. cfg may carry the same
     flags (cfg.claw or cfg itself) for a rig without a cfg. */
  function claw(ctx, rig, x, y, cfg) {
    ctx.save();
    try {
      rig = rig || {}; cfg = cfg || {};
      const B = rig.bodies || {}, ox = x || 0, oy = y || 0;
      const flags = rig.cfg || cfg.claw || cfg;
      const hub = B.hub, prongs = B.prongs || [], ghost = B.ghost;
      const s = rig.geo && rig.geo.s ? rig.geo.s : (hub && hub.r ? hub.r / 13 : 0.8);
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      const top = rig.cableTop || { x: hub ? hub.x : 0, y: 0 };
      // cfg.juice (optional, from the game): {bend: px the cable bows,
      // squash: 0..1 hub squash, speed: px/s of the hub for motion lines,
      // t, idle: 0..1 parked sway, mood: ''|'happy'|'sad'|'wow'|'lucky'|'focus',
      // blink 0..1, look -1..1, chase 0..1 (the LED chase of a loaded return),
      // lucky 0..1 (flames on the prongs), pull/pullN (cabinet points the magnet tugs)}
      const J = cfg.juice || NOJUICE;
      const t = J.t || 0;
      // parked: the whole claw swings a hair on its cable, like it is breathing
      if (J.idle > 0 && hub) {
        const a = Math.sin(t * 1.3) * 0.035 * J.idle;
        ctx.translate(ox + top.x, oy + top.y); ctx.rotate(a); ctx.translate(-(ox + top.x), -(oy + top.y));
      }
      // cable (the top end sways, the hub does not); a wobble bows it
      if (hub) {
        const mx = (top.x + hub.x) / 2 + (J.bend || 0), my = (top.y + hub.y) / 2;
        ctx.beginPath(); ctx.moveTo(ox + top.x, oy + top.y); ctx.quadraticCurveTo(ox + mx, oy + my, ox + hub.x, oy + hub.y - hub.r * 0.6);
        S(ctx, INK, 5); ctx.stroke(); S(ctx, '#8e98a8', 2.2); ctx.stroke();
        if (Math.abs(J.speed || 0) > 160) {
          // speed lines trailing the hub while it travels
          const dir = J.speed > 0 ? -1 : 1, n = 3, a = U.clamp((Math.abs(J.speed) - 160) / 300, 0, 0.7);
          ctx.globalAlpha = a; S(ctx, '#ffffff', 2);
          for (let i = 0; i < n; i++) {
            const ly = oy + hub.y - hub.r * 0.4 + i * hub.r * 0.5, lx = ox + hub.x + dir * (hub.r + 6 + i * 4);
            ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + dir * (16 + i * 6), ly); ctx.stroke();
          }
          ctx.globalAlpha = 1;
        }
      }
      // carriage on the rail
      const carImg = artImg('claw', 'carriage');
      const cw = 30 + 6 * s, chh = 12;
      if (carImg) blit(ctx, carImg, ox + top.x - cw / 2, oy + top.y - chh / 2, cw, chh);
      else {
        ctx.beginPath(); rrect(ctx, ox + top.x - cw / 2, oy + top.y - chh / 2, cw, chh, 4);
        F(ctx, CHROME); ctx.fill(); S(ctx, INK, OL); ctx.stroke();
        F(ctx, INK); ctx.beginPath(); circ(ctx, ox + top.x - cw * 0.3, oy + top.y + 2, 3); circ(ctx, ox + top.x + cw * 0.3, oy + top.y + 2, 3); ctx.fill();
        F(ctx, '#ff5a4a'); ctx.beginPath(); ctx.arc(ox + top.x, oy + top.y - 1, 2.4, 0, TAU); ctx.fill();
      }
      if (J.chase > 0) {
        // a loaded return: the carriage lamp runs through the party colours
        const pc = PARTY_COLS[Math.floor(t * 14) % PARTY_COLS.length];
        glow(ctx, ox + top.x, oy + top.y - 1, 12 + J.chase * 10, pc, J.chase);
      }
      const ph = rig.phase;
      if (flags.magnet && hub) {
        const active = ph === 'dropping' || ph === 'closing' || ph === 'lifting';
        glow(ctx, ox + hub.x, oy + hub.y + 6 * s, active ? 60 : 34, PAL.cyan, active ? 0.9 : 0.4);
        // the field: wavy lines crackling from the palm to whatever metal it tugs
        const n = Math.min(J.pullN || 0, J.pull ? J.pull.length : 0);
        if (active && n > 0) {
          const hx = ox + hub.x, hy = oy + hub.y + 6 * s;
          for (let i = 0; i < n; i++) {
            const p = J.pull[i], px = ox + p.x, py = oy + p.y, dx = px - hx, dy = py - hy, L = Math.hypot(dx, dy) || 1;
            const nx = -dy / L, ny = dx / L, seg = 6;
            ctx.beginPath(); ctx.moveTo(hx, hy);
            for (let k = 1; k <= seg; k++) {
              const u = k / seg, wv = k === seg ? 0 : Math.sin(t * 38 + k * 2.3 + i) * 4;
              ctx.lineTo(hx + dx * u + nx * wv, hy + dy * u + ny * wv);
            }
            ctx.globalAlpha = 0.45 + 0.4 * Math.sin(t * 25 + i * 1.7);
            S(ctx, PAL.cyan, 2.2); ctx.stroke(); S(ctx, '#ffffff', 0.8); ctx.stroke();
          }
          ctx.globalAlpha = 1;
        }
      }
      // the ghost third finger sits behind the pair
      if (ghost) prongChain(ctx, ghost, s, ox, oy, { ghost: true });
      for (const p of prongs) prongChain(ctx, p, s, ox, oy, { rubber: !!flags.rubber });
      if (J.lucky > 0) {
        // Lucky Claw: the fingertips burn gold
        for (const p of prongs) {
          if (!p || !p.length) continue;
          const tip = p[p.length - 1], tx = ox + tip.x, ty = oy + tip.y;
          glow(ctx, tx, ty, 18, PAL.gold, 0.75 * J.lucky);
          flames(ctx, tx, ty + 3, 7 * s + 4, 12 * s + 6, t, tip.x * 0.07);
        }
      }
      // the hub
      if (hub) {
        const hx = ox + hub.x, hy = oy + hub.y, r = Math.max(4, hub.r);
        const sq = U.clamp(J.squash || 0, -1, 1);
        if (sq) { ctx.save(); ctx.translate(hx, hy); ctx.scale(1 + sq * 0.22, 1 - sq * 0.22); ctx.translate(-hx, -hy); }
        if (J.glow > 0) glow(ctx, hx, hy, r * 3, PAL.gold, J.glow);
        tone(ctx, q => circ(q, hx, hy, r), CHROME, hx, hy, r, { dark: -0.45 });
        tone(ctx, q => circ(q, hx, hy, r * 0.36), flags.magnet ? PAL.cyan : '#8e98a8', hx, hy, r * 0.36, { dark: -0.4, ol: 1.5, spec: false });
        ctx.beginPath(); ctx.moveTo(hx - r * 0.18, hy); ctx.lineTo(hx + r * 0.18, hy); S(ctx, INK, 1.2); ctx.stroke();
        clawHead(ctx, hx, hy - r * 1.02, r, J, t);
        if (sq) ctx.restore();
      }
    } catch (e) { /* never throws */ }
    ctx.restore();
  }
  /* The claw's little robot head above the palm: a chrome dome with a dark
     visor and two LED eyes that show its mood (J.mood), blink, look where it
     travels, and a row of LEDs that chase on a loaded return (J.chase). */
  const MOOD_COL = { '': PAL.cyan, focus: PAL.cyan, happy: PAL.gold, sad: '#6f8cff', wow: PAL.pink, lucky: PAL.gold };
  function clawHead(ctx, x, y, r, J, t) {
    const w = r * 2.3, h = r * 1.35, mood = J.mood || '';
    const col = MOOD_COL[mood] || PAL.cyan;
    tone(ctx, q => rrect(q, x - w / 2, y - h / 2, w, h, h * 0.45), CHROME, x, y - h * 0.2, w * 0.5, { dark: -0.4 });
    ctx.beginPath(); rrect(ctx, x - w * 0.4, y - h * 0.26, w * 0.8, h * 0.56, h * 0.25); F(ctx, '#0b0616'); ctx.fill();
    // LED chase across the brow
    const lit = J.chase > 0;
    for (let i = 0; i < 5; i++) {
      const lx = x - w * 0.32 + i * w * 0.16, ly = y - h * 0.4;
      const on = lit ? (Math.floor(t * 18) + i) % PARTY_COLS.length : -1;
      ctx.beginPath(); circ(ctx, lx, ly, Math.max(0.9, r * 0.07));
      F(ctx, on >= 0 ? PARTY_COLS[on] : shade(col, -0.55)); ctx.fill();
      if (on >= 0 && i % 2 === (Math.floor(t * 18) & 1)) glow(ctx, lx, ly, 5, PARTY_COLS[on], 0.9);
    }
    const ex = w * 0.2, er = Math.max(1.6, r * 0.2), look = U.clamp(J.look || 0, -1, 1) * w * 0.06;
    const blink = mood === '' || mood === 'focus' ? U.clamp(J.blink || 0, 0, 1) : 0;
    glow(ctx, x + look, y, w * 0.55, col, 0.35);
    ctx.lineCap = 'round';
    for (const sd of [-1, 1]) {
      const cx = x + sd * ex + look, cy = y + h * 0.02;
      ctx.beginPath();
      if (mood === 'happy') { ctx.arc(cx, cy + er * 0.5, er * 1.05, Math.PI * 1.1, Math.PI * 1.9); S(ctx, col, Math.max(1.4, er * 0.75)); ctx.stroke(); }
      else if (mood === 'sad') {
        ctx.moveTo(cx - er, cy - er * 0.2 * sd - er * 0.3); ctx.lineTo(cx + er, cy + er * 0.2 * sd - er * 0.3); S(ctx, col, Math.max(1.3, er * 0.7)); ctx.stroke();
        if (sd > 0) { const u = (t * 0.9) % 1; ctx.beginPath(); ell(ctx, cx + er * 0.3, cy + er + u * er * 3, er * 0.35, er * 0.5); F(ctx, rgba('#9fd8ff', 1 - u)); ctx.fill(); }
      } else if (mood === 'wow') { circ(ctx, cx, cy, er * 1.05); S(ctx, col, Math.max(1.2, er * 0.55)); ctx.stroke(); }
      else if (mood === 'lucky') tone(ctx, q => star(q, cx, cy, er * 1.5, 4, 0.4), col, cx, cy, er, { ol: 0, spec: false });
      else if (mood === 'focus') { ctx.rect(cx - er, cy - er * 0.35, er * 2, er * 0.7); F(ctx, col); ctx.fill(); }
      else { ell(ctx, cx, cy, er, er * Math.max(0.12, 1 - blink)); F(ctx, col); ctx.fill(); }
    }
    if (mood === 'happy' || mood === 'lucky') {
      F(ctx, rgba(PAL.pink, 0.55));
      ctx.beginPath(); ell(ctx, x - ex * 1.75, y + h * 0.28, er * 0.8, er * 0.4); ell(ctx, x + ex * 1.75, y + h * 0.28, er * 0.8, er * 0.4); ctx.fill();
    }
  }
  /* Debug overlay: item parts as circles, wall and claw segments as capsules,
     sleeping bodies dimmed, contact normals in red. Bodies with a plain shape
     (no parts) fall back to bodyPath. */
  function bodyDebug(ctx, W) {
    ctx.save();
    try {
      const bodies = (W && W.bodies) || [];
      ctx.lineWidth = 1;
      const capsule = (sg, col) => {
        ctx.beginPath(); ctx.moveTo(sg.ax, sg.ay); ctx.lineTo(sg.bx, sg.by);
        ctx.lineCap = 'round'; ctx.lineWidth = Math.max(1, sg.r * 2); ctx.strokeStyle = col; ctx.stroke(); ctx.lineWidth = 1;
      };
      for (const sg of (W && W.segs) || []) capsule(sg, 'rgba(46,230,214,0.35)');
      for (const sg of (W && W.csegs) || []) capsule(sg, 'rgba(255,201,77,0.5)');
      for (const b of bodies) {
        ctx.strokeStyle = b.type === 'static' ? '#2ee6d6' : b.type === 'kinematic' ? '#ffc94d' : b.sl ? '#7a6f9a' : '#ff2e88';
        if (b.parts && b.px && b.py) {
          for (let i = 0; i < b.parts.length; i++) { ctx.beginPath(); ctx.arc(b.px[i], b.py[i], b.parts[i].r, 0, TAU); ctx.stroke(); }
          ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x + Math.cos(b.a || 0) * 8, b.y + Math.sin(b.a || 0) * 8); ctx.stroke();
        } else {
          ctx.beginPath();
          if (!bodyPath(ctx, b, 0, 0)) continue;
          ctx.stroke();
        }
        if (W.contactsOf) {
          const cs = W.contactsOf(b) || [];
          for (const c of cs) {
            ctx.beginPath(); ctx.moveTo(c.px, c.py); ctx.lineTo(c.px + c.nx * 8, c.py + c.ny * 8);
            ctx.strokeStyle = '#ff5a4a'; ctx.stroke();
          }
        }
      }
    } catch (e) { /* debug only */ }
    ctx.restore();
  }

  /* ============================================================= HEX */
  const TILE_COL = { fight: '#5a2440', elite: '#6a1f3a', treasure: '#5a4a1a', gem: '#1f5a5a', ink: '#2a2a6a', brush: '#4a3a6a', event: '#3a3a5a', shop: '#4a4a1f', rest: '#5a3a1a', forge: '#3a3a3a', boss: '#3a0a24', start: '#1f4a3a', tower: '#2a3a6a', empty: '#2a2340' };
  const FOG = '#1a1230';
  const ROAD = '#c9a24a';   // the worn ochre of the start-to-boss road
  function hexIcon(ctx, type, r, t) {
    const s = r * 0.62;
    switch (type) {
      case 'fight':
        ctx.save(); ctx.rotate(-0.78); IA.sword(ctx, s * 1.8, s * 0.45, '#c9d3e0', '#8a5a2b'); ctx.restore();
        ctx.save(); ctx.rotate(0.78); ctx.scale(-1, 1); IA.sword(ctx, s * 1.8, s * 0.45, '#c9d3e0', '#8a5a2b'); ctx.restore();
        break;
      case 'elite':
        IA.skull(ctx, s * 1.3, s * 1.5, '#f1e9d6', INK);
        tone(ctx, c => poly(c, [-s * 0.6, -s * 0.7, -s * 0.45, -s * 1.15, -s * 0.2, -s * 0.85, 0, -s * 1.25, s * 0.2, -s * 0.85, s * 0.45, -s * 1.15, s * 0.6, -s * 0.7]), PAL.gold, 0, -s * 0.9, s * 0.5, { ol: 1.5, dark: -0.3 });
        break;
      case 'treasure':
        tone(ctx, c => rrect(c, -s, -s * 0.2, s * 2, s * 1.1, 2), '#8a5a2b', 0, s * 0.3, s, { dark: -0.35 });
        tone(ctx, c => { c.moveTo(-s, -s * 0.2); c.lineTo(-s, -s * 0.5); c.quadraticCurveTo(-s, -s * 0.95, -s * 0.6, -s * 0.95); c.lineTo(s * 0.6, -s * 0.95); c.quadraticCurveTo(s, -s * 0.95, s, -s * 0.5); c.lineTo(s, -s * 0.2); c.closePath(); }, '#a06a34', 0, -s * 0.55, s, { dark: -0.35 });
        tone(ctx, c => rrect(c, -s * 0.22, -s * 0.4, s * 0.44, s * 0.5, 2), PAL.gold, 0, -s * 0.15, s * 0.25, { ol: 1.5 });
        break;
      case 'gem': IA.gem(ctx, s * 1.6, s * 1.7, PAL.cyan, '#ffffff'); break;
      case 'ink': {
        // a box of marquee bulbs: an open crate with three bulbs glowing in it
        glow(ctx, 0, -s * 0.2, s * 1.1, PAL.gold, 0.3 + Math.sin((t || 0) * 4) * 0.1);
        tone(ctx, c => rrect(c, -s, -s * 0.1, s * 2, s * 1.1, 2), '#8a5a2b', 0, s * 0.4, s, { dark: -0.35 });
        for (let i = -1; i <= 1; i++) bulb(ctx, i * s * 0.62, -s * 0.25 - (i ? 0 : s * 0.15), s * 0.42, t, true);
        ctx.beginPath(); rrect(ctx, -s, -s * 0.1, s * 2, s * 0.3, 1); F(ctx, '#a06a34'); ctx.fill(); S(ctx, INK, 2); ctx.stroke();
        break;
      }
      case 'brush': {
        // a tool: a hanging lantern with a warm pane
        ctx.beginPath(); ctx.moveTo(0, -s * 1.25); ctx.lineTo(0, -s * 0.95); S(ctx, INK, 2.5); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, -s * 1.3, s * 0.16, 0, TAU); S(ctx, INK, 2.5); ctx.stroke();
        tone(ctx, c => rrect(c, -s * 0.55, -s * 0.95, s * 1.1, s * 0.22, 2), '#5a6373', 0, -s * 0.85, s * 0.5, NOSPEC);
        glow(ctx, 0, 0, s * 1.2, PAL.gold, 0.35 + Math.sin((t || 0) * 5) * 0.12);
        tone(ctx, c => rrect(c, -s * 0.5, -s * 0.75, s, s * 1.4, 3), '#ffd27a', 0, 0, s * 0.6, { dark: -0.2 });
        ctx.beginPath(); ctx.moveTo(-s * 0.15, -s * 0.75); ctx.lineTo(-s * 0.15, s * 0.65); ctx.moveTo(s * 0.15, -s * 0.75); ctx.lineTo(s * 0.15, s * 0.65); S(ctx, rgba(INK, 0.6), 1.5); ctx.stroke();
        tone(ctx, c => rrect(c, -s * 0.55, s * 0.6, s * 1.1, s * 0.25, 2), '#5a6373', 0, s * 0.72, s * 0.5, NOSPEC);
        break;
      }
      case 'event':
        IA.scroll(ctx, s * 1.9, s * 1.2, '#f4ecd6', '#8a5a2b');
        txt(ctx, '?', 0, s * 0.05, s * 1.3, INK, true);
        break;
      case 'shop':
        tone(ctx, c => { c.moveTo(-s * 0.4, -s * 0.7); c.lineTo(s * 0.4, -s * 0.7); c.quadraticCurveTo(s * 1.1, s * 0.1, s * 0.8, s); c.lineTo(-s * 0.8, s); c.quadraticCurveTo(-s * 1.1, s * 0.1, -s * 0.4, -s * 0.7); c.closePath(); }, '#b07a3c', 0, s * 0.2, s, { dark: -0.35 });
        ctx.beginPath(); ctx.moveTo(-s * 0.5, -s * 0.7); ctx.lineTo(s * 0.5, -s * 0.7); S(ctx, INK, 2); ctx.stroke();
        tone(ctx, c => circ(c, 0, s * 0.25, s * 0.35), PAL.gold, 0, s * 0.25, s * 0.35, { ol: 1.5 });
        tone(ctx, c => rrect(c, -s * 0.3, -s * 1.15, s * 0.6, s * 0.45, 2), '#8a5a2b', 0, -s, s * 0.3, NOSPEC);
        break;
      case 'rest':
        limb(ctx, -s, s * 0.6, s, s * 0.9, 4, '#8a5a2b'); limb(ctx, -s, s * 0.9, s, s * 0.6, 4, '#8a5a2b');
        flames(ctx, 0, s * 0.7, s * 1.5, s * 1.6, t || 0, 0);
        break;
      case 'forge': IA.anvil(ctx, s * 2, s * 1.5, '#5a6373', '#c9d3e0'); break;
      case 'tower': {
        // a squat keep: battlements, two windows, an arched door, a pennant
        tone(ctx, c => rrect(c, -s * 0.72, -s * 0.5, s * 1.44, s * 1.6, 2), '#6a6f8a', 0, s * 0.3, s, { dark: -0.35 });
        ctx.beginPath(); for (let i = -1; i <= 1; i++) rrect(ctx, i * s * 0.5 - s * 0.17, -s * 0.88, s * 0.34, s * 0.45, 1);
        F(ctx, '#7a7f9a'); ctx.fill(); S(ctx, INK, 2); ctx.stroke();
        ctx.beginPath(); rrect(ctx, -s * 0.24, s * 0.3, s * 0.48, s * 0.8, s * 0.24); F(ctx, INK); ctx.fill();
        ctx.beginPath(); circ(ctx, -s * 0.32, -s * 0.1, s * 0.11); circ(ctx, s * 0.32, -s * 0.1, s * 0.11); F(ctx, PAL.gold); ctx.fill();
        ctx.beginPath(); ctx.moveTo(0, -s * 0.88); ctx.lineTo(0, -s * 1.55); S(ctx, INK, 2.5); ctx.stroke();
        const wave = Math.sin((t || 0) * 6) * s * 0.08;
        tone(ctx, c => { c.moveTo(0, -s * 1.55); c.lineTo(s * 0.75, -s * 1.32 + wave); c.lineTo(0, -s * 1.08); c.closePath(); }, PAL.pink, s * 0.3, -s * 1.32, s * 0.3, { ol: 1.5, spec: false, dark: -0.2 });
        break;
      }
      case 'boss':
        glow(ctx, 0, 0, r * 0.9, PAL.pink, 0.5 + Math.sin((t || 0) * 3) * 0.2);
        IA.skull(ctx, s * 1.8, s * 2, '#f1e9d6', PAL.pink);
        break;
      case 'start':
        for (const [dx, dy, a] of [[-s * 0.45, s * 0.3, -0.2], [s * 0.35, -s * 0.4, -0.2]]) {
          tone(ctx, c => ell(c, dx, dy, s * 0.28, s * 0.42, a), '#f4ecd6', dx, dy, s * 0.3, { ol: 1.5, spec: false, dark: -0.2 });
          F(ctx, '#f4ecd6'); ctx.beginPath(); for (let i = 0; i < 3; i++) circ(ctx, dx - s * 0.2 + i * s * 0.2, dy - s * 0.6, s * 0.09); ctx.fill();
        }
        break;
      default:
        F(ctx, rgba('#f4ecd6', 0.45)); ctx.beginPath(); ctx.arc(0, 0, s * 0.25, 0, TAU); ctx.fill();
    }
  }
  // Brushed edge: a hex whose vertices are nudged by a hash of (q, r).
  function brushedHex(ctx, r, q, rr, flat) {
    const seed = ((q || 0) * 73856093) ^ ((rr || 0) * 19349663);
    for (let i = 0; i < 6; i++) {
      const a = (flat ? 0 : -Math.PI / 2) + i * Math.PI / 3, j = ((seed >> (i * 3)) & 7) / 7 - 0.5;
      const rad = r * (0.97 + j * 0.1);
      const px = Math.cos(a) * rad, py = Math.sin(a) * rad;
      if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.closePath();
  }
  // A hex of the map over its ground. Terrain mode (st.fill set, the ground
  // painted by terrainHex first): a dark tile is darkness, a deep purple
  // wash (lighter next to the light, st.nearLight) with the landmark
  // silhouettes showing through; a lit tile shows its ground with the
  // activity drawn as a pickup icon on top (a small shadow under it) that
  // is gone once tile.done. No plates, no check marks: a resolved hex is
  // just terrain. Without st.fill the old solid plate look stands (the
  // icon still vanishes when done). st: { t, orient, fill, mask, seed,
  // biome, nearLight, reachable, current, hover, canReveal, path, target,
  // flare, known, road, walking }.
  function hex(ctx, x, y, size, tile, st) {
    ctx.save();
    try {
      tile = tile || {}; st = st || {};
      const r = size || 30, t = st.t || 0, type = tile.type || 'empty';
      const flat = st.orient === 'v';   // portrait map: flat-top hexes, upright icons
      ctx.translate(x || 0, y || 0);
      ctx.lineJoin = 'round';
      const terr = st.fill ? (tile.terrain || 'land') : null;
      const ford = terr === 'shallow';
      if (terr && st.mask) coastEdges(ctx, r, st.mask, flat, biomePal(st.biome));
      const hidden = !tile.revealed && type !== 'boss';
      if (hidden) {
        ctx.beginPath(); brushedHex(ctx, r * (terr ? 1.01 : 0.96), tile.q, tile.r, flat);
        if (terr) { F(ctx, rgba(DARK, st.nearLight ? (ford ? 0.62 : 0.76) : 0.92)); ctx.fill(); }
        else { F(ctx, FOG); ctx.fill(); S(ctx, rgba(INK, 0.9), 3); ctx.stroke(); }
        if (!terr) { ctx.beginPath(); brushedHex(ctx, r * 0.8, tile.r, tile.q, flat); S(ctx, rgba('#6a5a8a', 0.18), 5); ctx.stroke(); }
        if (ford) {
          // a dark ford still shows its price
          txt(ctx, '2', 0, 1, r * 0.6, rgba('#f4ecd6', 0.5), true);
        } else if (tile.known && type !== 'empty') {
          // Landmark: the icon as a dim silhouette under the darkness, with
          // a dashed rim, so it can be planned for before it is lit.
          ctx.save();
          ctx.beginPath(); hexPath(ctx, 0, 0, r * 0.9, flat); ctx.clip();
          ctx.globalAlpha = 0.95;
          const limg = artImg('hex', type);
          if (limg) blitContain(ctx, limg, 0, 0, r * 1.2, r * 1.2); else hexIcon(ctx, type, r * 0.95, t);
          ctx.globalAlpha = terr ? 0.62 : 0.42;
          F(ctx, terr ? DARK : FOG); ctx.fillRect(-r, -r, r * 2, r * 2);
          ctx.restore();
          ctx.beginPath(); hexPath(ctx, 0, 0, r * 0.86, flat);
          ctx.setLineDash([3, 4]); S(ctx, rgba('#f4ecd6', 0.35), 1.5); ctx.stroke(); ctx.setLineDash([]);
        } else if (!terr || terr !== 'sea') txt(ctx, '?', 0, 1, r * (terr ? 0.55 : 0.8), rgba('#f4ecd6', terr ? 0.1 : 0.16), true);
      } else {
        if (terr) {
          // lit ground: a thin dark seam between hexes, nothing else
          ctx.beginPath(); hexPath(ctx, 0, 0, r * 0.99, flat);
          S(ctx, rgba(INK, 0.28), 1); ctx.stroke();
        } else {
          const base = tile.visited ? '#3a3648' : (TILE_COL[type] || TILE_COL.empty);
          ctx.beginPath(); hexPath(ctx, 0, 0, r * 0.96, flat);
          F(ctx, base); ctx.fill();
          ctx.save(); ctx.clip();
          F(ctx, rgba('#ffffff', 0.08)); ctx.fillRect(-r, -r, r * 2, r * 0.9);
          ctx.restore();
          S(ctx, INK, 3); ctx.stroke();
        }
        // the pickup: gone once the tile is done (taken, cleared, used)
        if (!ford && type !== 'empty' && !tile.done) {
          const himg = artImg('hex', type);
          ctx.beginPath(); ell(ctx, 0, r * 0.5, r * 0.5, r * 0.16, 0); F(ctx, rgba(INK, 0.32)); ctx.fill();
          ctx.save(); ctx.translate(0, -r * 0.08);
          if (himg) blitContain(ctx, himg, 0, 0, r * 1.3, r * 1.3); else hexIcon(ctx, type, r, t);
          ctx.restore();
        }
      }
      if (st.path) {
        // light the way / flare preview: a wash, stronger on the target
        const col = st.flare ? '#ffb347' : PAL.cyan;
        ctx.beginPath(); hexPath(ctx, 0, 0, r * 0.96, flat);
        F(ctx, rgba(col, st.target ? 0.32 : 0.18)); ctx.fill();
        ctx.setLineDash([4, 4]); ctx.lineDashOffset = -t * 20;
        S(ctx, rgba(col, 0.95), 2.5); ctx.stroke(); ctx.setLineDash([]);
      }
      if (st.reachable) {
        // walkable now: a thick pulsing cyan rim plus a steady inner line
        const pul = 0.6 + Math.sin(t * 4) * 0.3;
        ctx.beginPath(); hexPath(ctx, 0, 0, r * 0.84, flat);
        S(ctx, rgba(PAL.cyan, pul), 5); ctx.stroke();
        ctx.beginPath(); hexPath(ctx, 0, 0, r * 0.96, flat);
        S(ctx, rgba(PAL.cyan, 0.9), 2); ctx.stroke();
      }
      if (st.hover) {
        // a tool could go here: a gold dashed rim
        ctx.beginPath(); hexPath(ctx, 0, 0, r * 0.9, flat);
        ctx.setLineDash([5, 4]); ctx.lineDashOffset = -t * 15;
        S(ctx, rgba(PAL.gold, 0.8), 2); ctx.stroke(); ctx.setLineDash([]);
      }
      if (st.current) {
        // you are here: a gold rim that breathes, over a soft glow
        const pr = r * (1.02 + Math.sin(t * 3) * 0.04);
        glow(ctx, 0, 0, r * 1.3, PAL.gold, 0.35);
        ctx.beginPath(); hexPath(ctx, 0, 0, pr, flat); S(ctx, PAL.gold, 4); ctx.stroke();
        ctx.beginPath(); hexPath(ctx, 0, 0, pr * 0.86, flat); S(ctx, rgba(PAL.gold, 0.55 + Math.sin(t * 3) * 0.3), 2); ctx.stroke();
        // the crawler stands here, unless a walk is drawing it between hexes
        if (!st.walking) crawler(ctx, 0, 0, r, t);
      }
    } catch (e) { /* never throws */ }
    ctx.restore();
  }
  // The warm glow where the light meets the dark: drawn after every hex on
  // a lit tile's edges that face darkness (bit i = edge from corner i to
  // corner i+1, hexPath order, like coastEdges): a soft wide band that
  // spills onto the dark neighbour and a thin bright rim, flickering a
  // little like a bulb.
  function lightRim(ctx, x, y, size, mask, flat, t) {
    ctx.save();
    try {
      const r = size || 30; t = t || 0;
      if (!mask) { ctx.restore(); return; }
      ctx.translate(x || 0, y || 0);
      ctx.lineCap = 'round';
      const off = flat ? 0 : -Math.PI / 2;
      const flick = 0.85 + Math.sin(t * 7 + x * 0.05) * 0.1 + Math.sin(t * 2.3 + y * 0.03) * 0.05;
      for (let pass = 0; pass < 2; pass++) {
        const rr = pass ? r * 0.97 : r * 1.06;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          if (!(mask & (1 << i))) continue;
          const a0 = off + i * Math.PI / 3, a1 = off + (i + 1) * Math.PI / 3;
          ctx.moveTo(Math.cos(a0) * rr, Math.sin(a0) * rr); ctx.lineTo(Math.cos(a1) * rr, Math.sin(a1) * rr);
        }
        if (pass) S(ctx, rgba('#ffd27a', 0.5 * flick), Math.max(1.5, r * 0.09)); else S(ctx, rgba('#ff9a3c', 0.16 * flick), Math.max(4, r * 0.38));
        ctx.stroke();
      }
    } catch (e) { /* never throws */ }
    ctx.restore();
  }
  // A marquee bulb: the HUD's light stat, the box of bulbs, the cost pill.
  // r is the bulb's radius; on = lit (a warm glow and a glint).
  function bulb(ctx, x, y, r, t, on) {
    ctx.save();
    try {
      r = r || 8; t = t || 0; if (on == null) on = true;
      ctx.translate(x || 0, y || 0);
      if (on) glow(ctx, 0, 0, r * 2.2, PAL.gold, 0.45 + Math.sin(t * 6) * 0.1);
      tone(ctx, c => rrect(c, -r * 0.42, r * 0.55, r * 0.84, r * 0.6, r * 0.12), '#5a6373', 0, r * 0.85, r * 0.4, NOSPEC);
      ctx.beginPath(); ctx.moveTo(-r * 0.42, r * 0.75); ctx.lineTo(r * 0.42, r * 0.75); ctx.moveTo(-r * 0.42, r * 0.95); ctx.lineTo(r * 0.42, r * 0.95); S(ctx, rgba(INK, 0.6), 1); ctx.stroke();
      tone(ctx, c => circ(c, 0, 0, r), on ? '#ffe28a' : '#8a8ea0', 0, 0, r, { dark: -0.2, ol: Math.max(1.5, r * 0.18) });
      if (on) { F(ctx, rgba('#ffffff', 0.85)); ctx.beginPath(); ell(ctx, -r * 0.3, -r * 0.35, r * 0.2, r * 0.12, -0.6); ctx.fill(); }
    } catch (e) { /* never throws */ }
    ctx.restore();
  }
  // The crawler: a small figure with a claw-cabinet backpack, standing on
  // the hex centred at (x, y) (size is the hex size; it bobs with t). The
  // map draws it here on the current hex, or easing between two hexes
  // while a click-to-travel walk plays.
  function crawler(ctx, x, y, size, t) {
    ctx.save();
    try {
      const r = size || 30; t = t || 0;
      const bob = Math.sin(t * 4) * 1.5, k = r / 30;
      ctx.translate(x || 0, (y || 0) + r * 0.25 + bob); ctx.scale(k, k);
      ctx.lineJoin = 'round';
      tone(ctx, c => rrect(c, 2, -26, 14, 18, 3), '#1d1233', 9, -17, 9, { dark: -0.3 });
      ctx.beginPath(); rrect(ctx, 4, -24, 10, 10, 2); F(ctx, rgba(PAL.cyan, 0.7)); ctx.fill();
      F(ctx, PAL.pink); ctx.beginPath(); ctx.arc(9, -11, 1.8, 0, TAU); ctx.fill();
      limb(ctx, -4, -8, -6, 0, 4, '#4a3a6a'); limb(ctx, 4, -8, 6, 0, 4, '#4a3a6a');
      tone(ctx, c => rrect(c, -8, -24, 16, 18, 5), PAL.pink, 0, -15, 8, { dark: -0.3 });
      tone(ctx, c => circ(c, -2, -30, 8), '#f1c9a6', -2, -30, 8, { dark: -0.25 });
      F(ctx, INK); ctx.beginPath(); circ(ctx, -5, -31, 1.4); circ(ctx, 0, -31, 1.4); ctx.fill();
      tone(ctx, c => { c.moveTo(-10, -32); c.quadraticCurveTo(-2, -44, 8, -32); c.closePath(); }, '#4a3a6a', -1, -36, 8, { dark: -0.3, spec: false });
    } catch (e) { /* never throws */ }
    ctx.restore();
  }
  // The road: a worn ochre track through pts (consecutive road hex centres,
  // start first): a dark rut under a lighter band with a dashed pale core.
  // Static, drawn over the ground and the pickups (a little translucent so
  // an icon on the road stays readable) and under the crawler.
  function mapRoad(ctx, pts, size, t) {
    ctx.save();
    try {
      pts = pts || []; size = size || 30;
      if (pts.length > 1) {
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        S(ctx, rgba('#2a1c0c', 0.4), size * 0.3); ctx.stroke();
        S(ctx, rgba(ROAD, 0.5), size * 0.2); ctx.stroke();
        ctx.setLineDash([size * 0.2, size * 0.28]);
        S(ctx, rgba('#f2dc9a', 0.7), size * 0.07); ctx.stroke();
        ctx.setLineDash([]);
      }
    } catch (e) { /* never throws */ }
    ctx.restore();
  }
  // The start-to-boss axis: a faint dotted line with chevrons toward the
  // boss, clipped to the given hidden hex centres so it shows through the
  // fog only (lit tiles stay clean).
  function mapAxis(ctx, x0, y0, x1, y1, size, hidden, t, flat) {
    ctx.save();
    try {
      size = size || 30; t = t || 0;
      if (hidden && hidden.length) { ctx.beginPath(); for (const p of hidden) hexPath(ctx, p.x, p.y, size * 0.96, flat); ctx.clip(); }
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
      ctx.setLineDash([2, 9]); ctx.lineDashOffset = -((t * 12) % 11);
      S(ctx, rgba('#f4ecd6', 0.4), 3); ctx.stroke(); ctx.setLineDash([]);
      const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
      const step = size * 2.6, a = size * 0.3;
      for (let d = step; d < len - size; d += step) {
        const cx = x0 + ux * d, cy = y0 + uy * d;
        ctx.beginPath();
        ctx.moveTo(cx - ux * a - uy * a, cy - uy * a + ux * a);
        ctx.lineTo(cx + ux * a * 0.5, cy + uy * a * 0.5);
        ctx.lineTo(cx - ux * a + uy * a, cy - uy * a - ux * a);
        S(ctx, rgba('#f4ecd6', 0.35), 2.5); ctx.stroke();
      }
    } catch (e) { /* never throws */ }
    ctx.restore();
  }
  // "Light the way" preview: a dashed line through pts (lit origin first,
  // target last), the bulb cost in a pill under the target with a bulb
  // icon (pink when the player is short) and an optional label above it.
  // o: { cost, ink (the bulbs in hand), label, unit ('bulbs'), color, t }.
  // A flare preview passes color and no cost.
  function mapPath(ctx, pts, size, o) {
    ctx.save();
    try {
      o = o || {}; size = size || 30; const t = o.t || 0;
      const col = o.color || PAL.cyan;
      pts = pts || [];
      if (pts.length > 1) {
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        S(ctx, rgba(INK, 0.8), 7); ctx.stroke();
        ctx.setLineDash([size * 0.3, size * 0.3]); ctx.lineDashOffset = -t * 40;
        S(ctx, col, 3.5); ctx.stroke(); ctx.setLineDash([]);
        for (const p of pts) { ctx.beginPath(); circ(ctx, p.x, p.y, 2.5); F(ctx, col); ctx.fill(); }
      }
      const end = pts.length ? pts[pts.length - 1] : null;
      if (end && o.cost != null) {
        const enough = o.ink == null || o.ink >= o.cost;
        const unit = o.unit || 'bulbs';
        const s = o.cost + ' ' + (o.cost === 1 && unit.slice(-1) === 's' ? unit.slice(0, -1) : unit);
        const fs = Math.max(12, size * 0.5), ic = fs * 0.55, w = s.length * fs * 0.62 + 18 + ic * 1.6, hh = fs + 8;
        const by = end.y + size * 0.92 + hh / 2;
        tone(ctx, c => rrect(c, end.x - w / 2, by - hh / 2, w, hh, hh / 2), enough ? PAL.cyan : PAL.pink, end.x, by, w / 2, { spec: false, dark: -0.2, ol: 2 });
        bulb(ctx, end.x - w / 2 + 8 + ic * 0.6, by - ic * 0.15, ic * 0.5, t, enough);
        txt(ctx, s, end.x + ic * 0.7, by + 1, fs, INK, true);
      }
      if (end && o.label) txt(ctx, o.label, end.x, end.y - size * 1.05, Math.max(12, size * 0.5), '#f4ecd6', true, 'center', true);
    } catch (e) { /* never throws */ }
    ctx.restore();
  }
  function mapBg(ctx, w, h, act, t) {
    ctx.save();
    try {
      w = w || 540; h = h || 960; t = t || 0;
      const tint = act === 2 ? '#2a1410' : act === 3 ? '#0e1a2e' : '#12091f';
      F(ctx, tint); ctx.fillRect(0, 0, w, h);
      const mimg = artImg('mapbg', act || 1);
      if (mimg) blitCover(ctx, mimg, 0, 0, w, h);
      else {
        // ink washes
        F(ctx, rgba('#000000', 0.25));
        for (let i = 0; i < 6; i++) { const px = (i * 173) % w, py = (i * 257 + 80) % h; ctx.beginPath(); ctx.ellipse(px, py, 90 + i * 15, 50 + i * 8, i, 0, TAU); ctx.fill(); }
        F(ctx, rgba('#f4ecd6', 0.03));
        for (let i = 0; i < 40; i++) { ctx.beginPath(); ctx.arc((i * 131 + 20) % w, (i * 197 + 40) % h, 1.5, 0, TAU); ctx.fill(); }
      }
      // brushed border
      ctx.beginPath(); ctx.rect(6, 6, w - 12, h - 12); S(ctx, rgba('#f4ecd6', 0.08), 4); ctx.stroke();
    } catch (e) { /* */ }
    ctx.restore();
  }

  /* ========================================================= TERRAIN */
  // The darkness: what the map is before it is lit.
  const DARK = '#0c0518';
  // One palette per biome (act): a base and a deco colour per ground type
  // (grass, forest, dirt, sand, hill, mountain), water sea -> deep with
  // depth, a coast ink and a foam line. Act 1 (cellar) is a mossy overgrown
  // arcade: natural greens and browns under a purple tint. Act 2 (foundry)
  // is ash grass, cinder forest, lava for sea and obsidian mountains. Act 3
  // (vault) is snow grass, pine forest, ice water and white peaks.
  const BIOME_PAL = {
    cellar: {
      low: '#5f7a5c', high: '#93a06a',
      grass: '#5f7d58', grass2: '#3d5e3a', flower: '#c48ad6',
      forest: '#3d6247', tree: '#3a7a4a', tree2: '#25563a', trunk: '#4a3628',
      dirt: '#6e5542', dirt2: '#4a3a30', pebble: '#8f7d6a',
      sand: '#bfae7e', sand2: '#9c8a5c',
      hill: '#8a8e66', hill2: '#5e6247',
      mtn: '#6c6784', mtn2: '#3a3650', cap: '#cfc9e6',
      sea: '#173142', deep: '#0b1824', shallow: '#3b7d86', foam: '#9fd8d8', coast: '#15111f', hatch: '#3f3a2e', ripple: '#2e5b70',
      tint: 'rgba(90,40,140,0.12)', accent: 'moss', moss: '#4f8a5a', name: 'mossy arcade',
    },
    foundry: {
      low: '#6a655c', high: '#9a8f7a',
      grass: '#6e6c62', grass2: '#46443c', flower: '#ff8a2b',
      forest: '#4a423c', tree: '#2a2320', tree2: '#181310', trunk: '#1a1412', ember: '#ff6a2a',
      dirt: '#5e4d44', dirt2: '#3e3028', pebble: '#7a6a60',
      sand: '#8c847a', sand2: '#6a6258',
      hill: '#7c7268', hill2: '#4c443e',
      mtn: '#2e2934', mtn2: '#15111a', cap: '#5a5064',
      sea: '#a02a0c', deep: '#4e0e05', shallow: '#4a2318', foam: '#ffa03a', coast: '#1c0d08', hatch: '#2b2220', ripple: '#ff6a2a', lava: true,
      tint: 'rgba(120,40,10,0.1)', accent: 'ash', ash: '#2a2320', name: 'ash and slag',
    },
    vault: {
      low: '#c9d6e2', high: '#f1f5fa',
      grass: '#d9e4ee', grass2: '#9fb4c8', flower: '#9fd4ff',
      forest: '#a9c2cf', tree: '#3c6c64', tree2: '#274a46', trunk: '#3a2e28',
      dirt: '#8f95a8', dirt2: '#666c80', pebble: '#b0b6c8',
      sand: '#cdd8e4', sand2: '#a6b6c8',
      hill: '#c0cfdd', hill2: '#8898ac',
      mtn: '#8d9eb6', mtn2: '#55657e', cap: '#ffffff',
      sea: '#163a68', deep: '#08192f', shallow: '#5fa8cf', foam: '#d8f1fb', coast: '#22334f', hatch: '#6c8098', ripple: '#3c6f9c',
      tint: 'rgba(80,120,200,0.08)', accent: 'snow', snow: '#ffffff', name: 'ice and open water',
    },
  };
  function biomePal(biome) { return BIOME_PAL[biome] || BIOME_PAL.cellar; }
  // The ground type of a tile: its own, or read off the terrain, height
  // and coast for tiles from before the tileset (old saves, the intro).
  function groundOf(tile) {
    if (!tile) return 'grass';
    if (tile.ground) return tile.ground;
    const terr = tile.terrain || 'land';
    if (terr !== 'land') return terr;
    const e = tile.elev == null ? 0.35 : tile.elev;
    if (e >= 0.62) return 'hill';
    if (tile.coast && e < 0.06) return 'sand';
    return 'grass';
  }
  const mixCache = new Map();
  // Colour lerp a -> b by t, quantised to 24 steps and cached (never allocates in steady state).
  function mix(a, b, t) {
    const k = Math.round(U.clamp(t == null ? 0.5 : t, 0, 1) * 24);
    const ck = a + '|' + b + '|' + k;
    let s = mixCache.get(ck);
    if (s) return s;
    const A = rgb(a), B = rgb(b), f = k / 24;
    s = 'rgb(' + ((A[0] + (B[0] - A[0]) * f) | 0) + ',' + ((A[1] + (B[1] - A[1]) * f) | 0) + ',' + ((A[2] + (B[2] - A[2]) * f) | 0) + ')';
    mixCache.set(ck, s);
    return s;
  }
  // The ground colour of a tile: the ground type's base, a touch lighter
  // with height. ground is optional (read off the height when missing).
  // Precompute it once per tile, it is cached anyway.
  function terrainFill(biome, terrain, elev, ground) {
    const p = biomePal(biome);
    if (terrain === 'sea') return mix(p.sea, p.deep, elev);
    if (terrain === 'shallow') return p.shallow;
    const e = elev == null ? 0.5 : elev;
    const g = ground || groundOf({ terrain, elev: e });
    const base = p[g === 'mountain' ? 'mtn' : g] || p.grass;
    return mix(base, p.high, e * 0.25);
  }
  // The tileset: the ground under a hex, per ground type and biome, with
  // two or three seeded decorations each (tufts and flowers, trees, pebbles
  // and cracks, sand ripples, hill contours, peaks with caps), water with
  // drifting ripples (lava with a hot core) and a ford with stepping
  // stones. st: { fill, seed, biome, orient, t }.
  function terrainHex(ctx, x, y, size, tile, st) {
    ctx.save();
    try {
      tile = tile || {}; st = st || {};
      const r = size || 30, t = st.t || 0, flat = st.orient === 'v', p = biomePal(st.biome), seed = st.seed || 0;
      const terrain = tile.terrain || 'land';
      const ground = groundOf(tile);
      ctx.translate(x || 0, y || 0);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); hexPath(ctx, 0, 0, r * 1.02, flat);
      F(ctx, st.fill || terrainFill(st.biome, terrain, tile.elev, ground)); ctx.fill();
      // seeded positions inside the hex: j-th deco at (px(j), py(j))
      const px = (j) => ((((seed >>> (j * 5)) & 31) / 31) - 0.5) * r * 0.9;
      const py = (j) => ((((seed >>> (j * 5 + 3)) & 31) / 31) - 0.5) * r * 0.8;
      const lw = Math.max(1, r * 0.05);
      if (terrain === 'sea') {
        // ripples on two tiles in five, a lone wave or a pair, drifting slowly
        if ((seed % 5) < 2) {
          const ox = (((seed >> 2) & 15) / 15 - 0.5) * r * 0.7, oy = (((seed >> 6) & 15) / 15 - 0.5) * r * 0.6;
          const drift = Math.sin(t * 0.6 + (seed & 31)) * r * 0.05;
          const a0 = Math.PI * (1.1 + ((seed >> 10) & 3) * 0.03);
          S(ctx, rgba(p.ripple, p.lava ? 0.8 : 0.55), Math.max(1, r * 0.04));
          ctx.beginPath(); ctx.arc(ox + drift, oy, r * 0.22, a0, a0 + Math.PI * 0.72); ctx.stroke();
          if (seed & 64) { ctx.beginPath(); ctx.arc(ox - r * 0.24 + drift, oy + r * 0.3, r * 0.15, a0, a0 + Math.PI * 0.72); ctx.stroke(); }
        }
        if (p.lava && (seed & 3) !== 0) {
          F(ctx, rgba(p.foam, 0.07 + 0.05 * Math.sin(t * 1.4 + (seed & 7))));
          ctx.beginPath(); circ(ctx, 0, 0, r * (0.3 + ((seed >> 4) & 3) * 0.08)); ctx.fill();
        }
        if (p.accent === 'snow') {
          // an ice floe drifting on the vault's water
          const fx = px(1) * 0.5, fy = py(1) * 0.5, fs = r * 0.22;
          ctx.beginPath(); ctx.moveTo(fx - fs, fy - fs * 0.2); ctx.lineTo(fx - fs * 0.3, fy - fs * 0.7); ctx.lineTo(fx + fs * 0.9, fy - fs * 0.4); ctx.lineTo(fx + fs * 0.6, fy + fs * 0.5); ctx.lineTo(fx - fs * 0.6, fy + fs * 0.6); ctx.closePath();
          F(ctx, rgba(p.foam, 0.55)); ctx.fill(); S(ctx, rgba(p.deep, 0.5), 1); ctx.stroke();
        }
        S(ctx, rgba(p.deep, 0.45), 1); ctx.beginPath(); hexPath(ctx, 0, 0, r * 0.99, flat); ctx.stroke();
      } else if (terrain === 'shallow') {
        // a ford: a pale wave and three stepping stones
        S(ctx, rgba(p.foam, 0.55), Math.max(1, r * 0.045));
        ctx.beginPath(); ctx.moveTo(-r * 0.5, r * 0.4); ctx.quadraticCurveTo(-r * 0.25, r * 0.25, 0, r * 0.4); ctx.quadraticCurveTo(r * 0.25, r * 0.55, r * 0.5, r * 0.4); ctx.stroke();
        F(ctx, p.high); S(ctx, p.coast, Math.max(1, r * 0.04));
        ctx.beginPath(); ell(ctx, -r * 0.3, -r * 0.12, r * 0.15, r * 0.1, 0.2); ell(ctx, r * 0.05, 0.02 * r, r * 0.13, r * 0.09, -0.3); ell(ctx, r * 0.36, -r * 0.2, r * 0.12, r * 0.08, 0.1);
        ctx.fill(); ctx.stroke();
        if (p.accent === 'ash') { F(ctx, rgba(p.foam, 0.18)); ctx.beginPath(); circ(ctx, 0, r * 0.1, r * 0.4); ctx.fill(); }
        else if (p.accent === 'snow') { S(ctx, rgba(p.foam, 0.6), Math.max(1, r * 0.04)); ctx.beginPath(); hexPath(ctx, 0, 0, r * 0.86, flat); ctx.stroke(); }
        S(ctx, rgba(p.coast, 0.35), 1); ctx.beginPath(); hexPath(ctx, 0, 0, r * 0.99, flat); ctx.stroke();
      } else if (ground === 'mountain') {
        // two peaks, a lit face and a shaded face, a cap on the taller one
        const drawPeak = (cx, base, w, h, cap) => {
          ctx.beginPath(); ctx.moveTo(cx - w, base); ctx.lineTo(cx, base - h); ctx.lineTo(cx + w, base); ctx.closePath();
          F(ctx, p.mtn2); ctx.fill();
          ctx.beginPath(); ctx.moveTo(cx - w, base); ctx.lineTo(cx, base - h); ctx.lineTo(cx, base); ctx.closePath();
          F(ctx, mix(p.mtn, p.high, 0.15)); ctx.fill();
          ctx.beginPath(); ctx.moveTo(cx - w, base); ctx.lineTo(cx, base - h); ctx.lineTo(cx + w, base); ctx.closePath();
          S(ctx, rgba(INK, 0.7), lw); ctx.stroke();
          if (cap) {
            ctx.beginPath(); ctx.moveTo(cx - w * 0.32, base - h * 0.68); ctx.lineTo(cx, base - h); ctx.lineTo(cx + w * 0.32, base - h * 0.68);
            ctx.lineTo(cx + w * 0.16, base - h * 0.6); ctx.lineTo(cx, base - h * 0.7); ctx.lineTo(cx - w * 0.16, base - h * 0.6); ctx.closePath();
            F(ctx, p.cap); ctx.fill();
          }
        };
        ctx.beginPath(); ell(ctx, 0, r * 0.42, r * 0.8, r * 0.2, 0); F(ctx, rgba(INK, 0.18)); ctx.fill();
        const lean = (seed & 1) ? 1 : -1;
        drawPeak(lean * r * 0.28, r * 0.42, r * 0.42, r * 0.62, false);
        drawPeak(-lean * r * 0.12, r * 0.45, r * 0.55, r * 0.95, true);
      } else if (ground === 'hill') {
        // a mound: two contour arcs and a few hatch strokes on the upper side
        S(ctx, rgba(p.hill2, 0.8), Math.max(1.2, r * 0.06));
        ctx.beginPath(); ctx.arc(px(0) * 0.3, r * 0.15, r * 0.55, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
        ctx.beginPath(); ctx.arc(px(0) * 0.3, r * 0.2, r * 0.32, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
        S(ctx, rgba(p.hill2, 0.45), lw);
        ctx.beginPath();
        for (let i = 0; i < 3; i++) { const hx = px(0) * 0.3 + (i - 1) * r * 0.2; ctx.moveTo(hx + r * 0.32, r * 0.28); ctx.lineTo(hx + r * 0.42, r * 0.05); }
        ctx.stroke();
        S(ctx, rgba(p.grass2, 0.7), Math.max(1.2, r * 0.06));
        const gx = px(2) * 0.6, gy = -r * 0.45 + py(2) * 0.2, gs = r * 0.15;
        ctx.beginPath(); ctx.moveTo(gx - gs, gy + gs * 0.5); ctx.lineTo(gx - gs * 0.6, gy - gs * 0.6); ctx.moveTo(gx, gy + gs * 0.6); ctx.lineTo(gx, gy - gs); ctx.moveTo(gx + gs, gy + gs * 0.5); ctx.lineTo(gx + gs * 0.6, gy - gs * 0.6); ctx.stroke();
      } else if (ground === 'forest') {
        // two or three trees: round canopies (cellar), dead spikes with an
        // ember (foundry), snow-lined pines (vault)
        const n = 2 + (seed & 1);
        const spots = [[-r * 0.32, r * 0.18], [r * 0.3, r * 0.3], [0, -r * 0.28]];
        for (let i = 0; i < n; i++) {
          const tx = spots[i][0] + px(i) * 0.25, ty = spots[i][1] + py(i) * 0.2, s = r * (0.36 + ((seed >>> (i * 3)) & 3) * 0.03);
          if (p.accent === 'ash') {
            ctx.beginPath(); ctx.moveTo(tx, ty + s * 0.6); ctx.lineTo(tx, ty - s * 0.8); ctx.moveTo(tx, ty - s * 0.2); ctx.lineTo(tx - s * 0.5, ty - s * 0.7); ctx.moveTo(tx, ty); ctx.lineTo(tx + s * 0.5, ty - s * 0.5);
            S(ctx, p.tree, Math.max(1.5, r * 0.07)); ctx.stroke();
            F(ctx, rgba(p.ember, 0.55 + 0.35 * Math.sin(t * 3 + i + (seed & 7)))); ctx.beginPath(); circ(ctx, tx + s * 0.5, ty - s * 0.5, s * 0.14); ctx.fill();
          } else if (p.accent === 'snow') {
            ctx.beginPath(); ctx.moveTo(tx, ty + s * 0.7); ctx.lineTo(tx, ty + s * 0.3); S(ctx, p.trunk, Math.max(1.5, r * 0.06)); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(tx - s * 0.55, ty + s * 0.4); ctx.lineTo(tx, ty - s * 0.8); ctx.lineTo(tx + s * 0.55, ty + s * 0.4); ctx.closePath();
            F(ctx, p.tree); ctx.fill(); S(ctx, rgba(INK, 0.7), lw); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(tx - s * 0.32, ty); ctx.lineTo(tx, ty - s * 0.28); ctx.lineTo(tx + s * 0.32, ty); S(ctx, p.cap, Math.max(1.5, r * 0.06)); ctx.stroke();
          } else {
            ctx.beginPath(); ctx.moveTo(tx, ty + s * 0.75); ctx.lineTo(tx, ty + s * 0.2); S(ctx, p.trunk, Math.max(1.5, r * 0.07)); ctx.stroke();
            ctx.beginPath(); circ(ctx, tx, ty, s * 0.55); circ(ctx, tx - s * 0.32, ty + s * 0.18, s * 0.38); circ(ctx, tx + s * 0.32, ty + s * 0.18, s * 0.38);
            F(ctx, p.tree); ctx.fill(); S(ctx, rgba(INK, 0.6), lw); ctx.stroke();
            ctx.beginPath(); circ(ctx, tx - s * 0.15, ty - s * 0.2, s * 0.22); F(ctx, mix(p.tree, p.high, 0.3)); ctx.fill();
          }
        }
      } else if (ground === 'dirt') {
        // bare ground: two pebbles and a crack
        F(ctx, p.pebble); S(ctx, rgba(INK, 0.5), lw);
        ctx.beginPath(); ell(ctx, px(0) * 0.6, py(0) * 0.6, r * 0.12, r * 0.08, 0.3); ell(ctx, px(1) * 0.6, py(1) * 0.6 + r * 0.1, r * 0.09, r * 0.06, -0.4); ctx.fill(); ctx.stroke();
        F(ctx, rgba(p.dirt2, 0.25)); ctx.beginPath(); ell(ctx, px(3) * 0.5, py(3) * 0.5, r * 0.34, r * 0.2, py(4) * 0.03); ctx.fill();
        ctx.beginPath(); ctx.moveTo(px(2) * 0.5 - r * 0.3, py(2) * 0.4); ctx.lineTo(px(2) * 0.5 - r * 0.05, py(2) * 0.4 + r * 0.12); ctx.lineTo(px(2) * 0.5 + r * 0.25, py(2) * 0.4 + r * 0.05);
        ctx.moveTo(px(4) * 0.5 - r * 0.15, py(4) * 0.5 - r * 0.2); ctx.lineTo(px(4) * 0.5 + r * 0.05, py(4) * 0.5 - r * 0.05);
        S(ctx, rgba(p.dirt2, 0.85), Math.max(1.2, r * 0.055)); ctx.stroke();
      } else if (ground === 'sand') {
        // ripples in the sand and a shell
        S(ctx, rgba(p.sand2, 0.8), Math.max(1.2, r * 0.055));
        for (let i = 0; i < 3; i++) {
          const yy = -r * 0.4 + i * r * 0.36 + py(i) * 0.12;
          ctx.beginPath(); ctx.moveTo(-r * 0.5, yy); ctx.quadraticCurveTo(-r * 0.25, yy - r * 0.12, 0, yy); ctx.quadraticCurveTo(r * 0.25, yy + r * 0.12, r * 0.5, yy); ctx.stroke();
        }
        F(ctx, p.high); ctx.beginPath(); circ(ctx, px(2) * 0.5, py(2) * 0.5, r * 0.06); ctx.fill();
      } else {
        // grass: tufts and, on a few tiles, a flower or a speck of snow
        S(ctx, rgba(p.grass2, 0.85), Math.max(1.2, r * 0.06));
        const n = 2 + (seed & 1);
        for (let i = 0; i < n; i++) {
          const gx = px(i) * 0.8, gy = py(i) * 0.8, s = r * 0.19;
          ctx.beginPath(); ctx.moveTo(gx - s, gy + s * 0.5); ctx.lineTo(gx - s * 0.6, gy - s * 0.6); ctx.moveTo(gx, gy + s * 0.6); ctx.lineTo(gx, gy - s); ctx.moveTo(gx + s, gy + s * 0.5); ctx.lineTo(gx + s * 0.6, gy - s * 0.6); ctx.stroke();
        }
        if ((seed & 12) === 12) { F(ctx, p.flower); ctx.beginPath(); circ(ctx, px(3) * 0.7, py(3) * 0.7, r * 0.07); ctx.fill(); }
      }
      if (terrain === 'land') {
        // the biome's accent on every land hex: a moss patch (cellar), ash
        // flecks (foundry), snow specks (vault); then the tint and a seam
        if (p.accent === 'ash') {
          S(ctx, rgba(p.ash, 0.55), lw);
          ctx.beginPath(); ctx.moveTo(px(3) * 0.8 - r * 0.08, py(3) * 0.8); ctx.lineTo(px(3) * 0.8 + r * 0.08, py(3) * 0.8 - r * 0.05);
          ctx.moveTo(px(4) * 0.8 - r * 0.06, py(4) * 0.8 + r * 0.02); ctx.lineTo(px(4) * 0.8 + r * 0.06, py(4) * 0.8 - r * 0.03); ctx.stroke();
        } else if (p.accent === 'snow') {
          F(ctx, rgba(p.snow, 0.8)); ctx.beginPath();
          for (let i = 3; i < 6; i++) { ctx.moveTo(px(i) * 0.85 + r * 0.04, py(i) * 0.85); ctx.arc(px(i) * 0.85, py(i) * 0.85, r * 0.04, 0, TAU); }
          ctx.fill();
        } else {
          F(ctx, rgba(p.moss, 0.28)); ctx.beginPath(); ell(ctx, px(4) * 0.7, py(4) * 0.7, r * 0.22, r * 0.14, px(5) * 0.05); ctx.fill();
        }
        F(ctx, p.tint); ctx.beginPath(); hexPath(ctx, 0, 0, r * 1.02, flat); ctx.fill();
        S(ctx, rgba(p.coast, 0.25), 1); ctx.beginPath(); hexPath(ctx, 0, 0, r * 0.99, flat); ctx.stroke();
      }
    } catch (e) { /* never throws */ }
    ctx.restore();
  }
  // The coastline: thick ink on every edge (bit i = edge from corner i to
  // corner i+1, hexPath order) that faces water, plus a thin pale foam line
  // just outside it.
  function coastEdges(ctx, r, mask, flat, p) {
    const off = flat ? 0 : -Math.PI / 2;
    for (let pass = 0; pass < 2; pass++) {
      const rr = pass ? r * 1.08 : r;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        if (!(mask & (1 << i))) continue;
        const a0 = off + i * Math.PI / 3, a1 = off + (i + 1) * Math.PI / 3;
        ctx.moveTo(Math.cos(a0) * rr, Math.sin(a0) * rr); ctx.lineTo(Math.cos(a1) * rr, Math.sin(a1) * rr);
      }
      ctx.lineCap = 'round';
      if (pass) S(ctx, rgba(p.foam, 0.5), Math.max(1, r * 0.045)); else S(ctx, p.coast, Math.max(2.5, r * 0.095));
      ctx.stroke();
    }
  }
  // Compass rose: parchment disc, eight points, N at the top (the boss is north).
  function mapCompass(ctx, x, y, r, t) {
    ctx.save();
    try {
      r = r || 30; t = t || 0;
      ctx.translate(x || 0, y || 0);
      ctx.beginPath(); circ(ctx, 0, 0, r); F(ctx, rgba(PAL.paper, 0.9)); ctx.fill(); S(ctx, INK, 2.5); ctx.stroke();
      ctx.beginPath(); circ(ctx, 0, 0, r * 0.82); S(ctx, rgba(INK, 0.5), 1); ctx.stroke();
      ctx.beginPath(); star(ctx, 0, 0, r * 0.5, 4, 0.3); ctx.save(); ctx.rotate(Math.PI / 4); F(ctx, rgba(INK, 0.35)); ctx.fill(); ctx.restore();
      ctx.beginPath(); star(ctx, 0, 0, r * 0.74, 4, 0.22); F(ctx, INK); ctx.fill();
      ctx.beginPath(); ctx.moveTo(0, -r * 0.74); ctx.lineTo(-r * 0.16, 0); ctx.lineTo(0, r * 0.05); ctx.closePath(); F(ctx, PAL.pink); ctx.fill();
      txt(ctx, 'N', 0, -r * 0.45, r * 0.42, PAL.paper, true);
    } catch (e) { /* never throws */ }
    ctx.restore();
  }
  // A small parchment strip with a title and a sub line.
  function mapHeader(ctx, x, y, w, h, title, sub, t) {
    ctx.save();
    try {
      w = w || 200; h = h || 30;
      ctx.translate(x || 0, y || 0);
      ctx.rotate(-0.012);
      ctx.beginPath(); rrect(ctx, 0, 0, w, h, 4); F(ctx, rgba(PAL.paper, 0.92)); ctx.fill(); S(ctx, INK, 2.5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(6, h - 5); ctx.lineTo(w - 6, h - 5); S(ctx, rgba(INK, 0.25), 1); ctx.stroke();
      txt(ctx, String(title || ''), 10, h * 0.42, Math.max(11, h * 0.42), INK, true, 'left');
      if (sub) txt(ctx, String(sub), 10, h * 0.78, Math.max(9, h * 0.3), rgba(INK, 0.7), false, 'left');
    } catch (e) { /* never throws */ }
    ctx.restore();
  }
  // Edge arrow toward something off screen: a pulsing pink chevron with a label.
  function mapArrow(ctx, x, y, angle, size, t, label) {
    ctx.save();
    try {
      size = size || 18; t = t || 0;
      const k = 1 + Math.sin(t * 5) * 0.08;
      ctx.translate(x || 0, y || 0);
      ctx.beginPath(); circ(ctx, 0, 0, size * 1.25); F(ctx, rgba(INK, 0.75)); ctx.fill();
      ctx.save(); ctx.rotate(angle || 0); ctx.scale(k, k);
      ctx.beginPath(); ctx.moveTo(size, 0); ctx.lineTo(-size * 0.55, -size * 0.7); ctx.lineTo(-size * 0.2, 0); ctx.lineTo(-size * 0.55, size * 0.7); ctx.closePath();
      F(ctx, PAL.pink); ctx.fill(); S(ctx, INK, 2.5); ctx.lineJoin = 'round'; ctx.stroke();
      ctx.restore();
      if (label) txt(ctx, String(label), 0, size * 2.1, Math.max(10, size * 0.7), PAL.paper, true, 'center', true);
    } catch (e) { /* never throws */ }
    ctx.restore();
  }

  /* ============================================================== BG */
  function deadCabinet(ctx, x, y, w, h, on, t) {
    tone(ctx, c => rrect(c, x, y, w, h, 6), '#1d1233', x + w / 2, y + h / 2, w / 2, { dark: -0.4, spec: false });
    ctx.beginPath(); ctx.rect(x + 6, y + 8, w - 12, h * 0.45); F(ctx, on ? rgba(PAL.cyan, 0.2 + Math.sin(t * 5) * 0.1) : '#0a0614'); ctx.fill(); S(ctx, INK, 2); ctx.stroke();
    ctx.beginPath(); ctx.rect(x + 6, y + h * 0.6, w - 12, h * 0.3); F(ctx, '#140c24'); ctx.fill(); S(ctx, INK, 2); ctx.stroke();
  }
  function cobweb(ctx, x, y, r, flip) {
    ctx.beginPath();
    for (let i = 0; i <= 4; i++) { const a = (flip ? Math.PI : 0) + i * Math.PI / 8; ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * r * (flip ? -1 : 1), y + Math.sin(a) * r); }
    for (let k = 1; k <= 3; k++) { const rr = r * k / 3; ctx.moveTo(x + (flip ? -rr : rr), y); for (let i = 1; i <= 4; i++) { const a = i * Math.PI / 8; ctx.lineTo(x + Math.cos(a) * rr * (flip ? -1 : 1), y + Math.sin(a) * rr); } }
    S(ctx, rgba('#f4f8ff', 0.28), 1); ctx.stroke();
  }
  function gear(ctx, x, y, r, n, a, col) {
    tone(ctx, c => { for (let i = 0; i < n; i++) { const a0 = a + i * TAU / n, a1 = a0 + TAU / (n * 2); const p0x = x + Math.cos(a0) * r, p0y = y + Math.sin(a0) * r, p1x = x + Math.cos(a1) * r * 0.78, p1y = y + Math.sin(a1) * r * 0.78; if (i) c.lineTo(p0x, p0y); else c.moveTo(p0x, p0y); c.lineTo(p1x, p1y); } c.closePath(); }, col, x, y, r, { dark: -0.4, spec: false });
    ctx.beginPath(); ctx.arc(x, y, r * 0.3, 0, TAU); F(ctx, INK); ctx.fill();
  }
  // The arena is the top band of the stage (y 70..340 at 540x960), so the
  // backdrop composes around a floor line near y 330 rather than the canvas
  // bottom; everything below it is covered by the rig anyway.
  function bg(ctx, w, h, act, t) {
    ctx.save();
    try {
      w = w || 540; h = h || 340; t = t || 0; act = act || 1;
      // The fight arena's floor line: enemies stand with their feet on it (game.js ARENA.floor).
      const fy = h > 420 ? 302 : h * 0.82;
      ctx.lineJoin = 'round';
      const bimg = artImg('bg', act);
      if (bimg) {
        // art/bg/act<n>.png: full width, its 92% line (the stage floor) on fy
        const dh = w * imH(bimg) / imW(bimg), top = fy - dh * 0.92;
        F(ctx, act === 2 ? '#2a1410' : act === 3 ? '#0e1a2e' : '#12091f'); ctx.fillRect(0, 0, w, h);
        blit(ctx, bimg, 0, top, w, dh);
        // stretch the picture's top row up to the stage edge (no seam under the HUD)
        if (top > 0) { try { ctx.drawImage(bimg, 0, 0, imW(bimg), 1, 0, 0, w, top + 1); } catch (e) { /* stub */ } }
        if (top + dh < h) { F(ctx, '#0b0616'); ctx.fillRect(0, top + dh, w, h - top - dh); }
      } else if (act === 2) {
        F(ctx, '#2a1410'); ctx.fillRect(0, 0, w, h);
        F(ctx, rgba('#ff8a2b', 0.12 + Math.sin(t * 2) * 0.04)); ctx.fillRect(0, fy * 0.55, w, h - fy * 0.55);
        gear(ctx, w * 0.12, fy * 0.3, 46, 10, t * 0.4, '#5a3a2a');
        gear(ctx, w * 0.3, fy * 0.14, 30, 8, -t * 0.6, '#4a3020');
        gear(ctx, w * 0.9, fy * 0.36, 56, 12, -t * 0.3, '#5a3a2a');
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(w * (0.5 + i * 0.15), 0); ctx.lineTo(w * (0.5 + i * 0.15), fy * 0.35 + i * 20); S(ctx, '#3a2a20', 4); ctx.stroke(); }
        // lava channel right under the floor
        tone(ctx, c => { c.moveTo(0, fy + 8); c.quadraticCurveTo(w * 0.3, fy - 2, w * 0.5, fy + 10); c.quadraticCurveTo(w * 0.75, fy + 22, w, fy + 6); c.lineTo(w, h); c.lineTo(0, h); c.closePath(); }, '#ff6a1a', w / 2, fy + 30, w / 2, { ol: 0, dark: -0.1, spec: false });
        F(ctx, '#ffe066'); ctx.beginPath(); for (let i = 0; i < 6; i++) circ(ctx, (i * 97 + t * 20) % w, fy + 14 + Math.sin(t * 3 + i) * 4, 3); ctx.fill();
        glow(ctx, w * 0.5, fy + 20, w * 0.3, '#ff8a2b', 0.35);
        F(ctx, '#1e100c'); ctx.fillRect(0, fy - 6, w, 14);
        ctx.beginPath(); ctx.moveTo(0, fy - 6); ctx.lineTo(w, fy - 6); S(ctx, '#ff8a2b', 2); ctx.stroke();
      } else if (act === 3) {
        F(ctx, '#0e1a2e'); ctx.fillRect(0, 0, w, h);
        F(ctx, rgba('#9fe4ff', 0.08)); ctx.fillRect(0, 0, w, fy * 0.5);
        for (let i = 0; i < 5; i++) { const px = w * (0.08 + i * 0.22); tone(ctx, c => poly(c, [px - 14, fy, px - 8, 0, px + 10, 0, px + 16, fy]), '#1e3a5a', px, fy * 0.5, 20, { dark: -0.3, spec: false, ol: 2 }); }
        for (let i = 0; i < 4; i++) {
          const px = w * (0.2 + i * 0.2), py = 30 + i * 12 + Math.sin(t + i) * 3;
          ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, py); S(ctx, '#8aa8d8', 1.5); ctx.stroke();
          ctx.save(); ctx.translate(px, py + 10); ctx.rotate(Math.sin(t + i) * 0.1);
          const k = ['star', 'heart', 'gem', 'coin'][i]; IA[k](ctx, 18, 18, ITEM_DEFAULT[k][0], ITEM_DEFAULT[k][1]);
          ctx.restore();
        }
        for (let i = 0; i < 8; i++) { const px = w * i / 8 + 20; F(ctx, '#dff4ff'); ctx.beginPath(); poly(ctx, [px - 6, 0, px + 6, 0, px, 14 + (i % 3) * 10]); ctx.fill(); }
        F(ctx, rgba('#ffffff', 0.5)); for (let i = 0; i < 18; i++) { ctx.beginPath(); ctx.arc((i * 71 + t * 6) % w, (i * 53 + t * 12) % fy, 1.5, 0, TAU); ctx.fill(); }
        F(ctx, '#1a2e48'); ctx.fillRect(0, fy, w, h - fy);
        ctx.beginPath(); ctx.moveTo(0, fy); ctx.lineTo(w, fy); S(ctx, '#9fe4ff', 2); ctx.stroke();
        F(ctx, rgba('#9fe4ff', 0.12)); ctx.beginPath(); ctx.ellipse(w * 0.5, fy + 8, w * 0.3, 6, 0, 0, TAU); ctx.fill();
      } else {
        F(ctx, '#12091f'); ctx.fillRect(0, 0, w, h);
        S(ctx, rgba('#000000', 0.25), 1);
        ctx.beginPath(); for (let yy = 0; yy < fy; yy += 18) { ctx.moveTo(0, yy); ctx.lineTo(w, yy); } ctx.stroke();
        deadCabinet(ctx, w * 0.02, fy - fy * 0.6, 62, fy * 0.6, false, t);
        deadCabinet(ctx, w * 0.16, fy - fy * 0.52, 54, fy * 0.52, true, t);
        deadCabinet(ctx, w * 0.84, fy - fy * 0.56, 60, fy * 0.56, false, t);
        cobweb(ctx, 0, 0, 60, false); cobweb(ctx, w, 0, 80, true);
        // small flickering neon sign high on the wall, clear of the enemies
        const on = Math.sin(t * 7) + Math.sin(t * 13) > -1.2;
        txt(ctx, 'ARCADE', w * 0.27, fy * 0.3, Math.max(14, w * 0.045), on ? PAL.pink : shade(PAL.pink, -0.7), true, 'center', on ? rgba(PAL.pink, 0.35) : INK);
        if (on) glow(ctx, w * 0.27, fy * 0.3, w * 0.12, PAL.pink, 0.3);
        ctx.beginPath(); ctx.moveTo(w * 0.6, 0); ctx.lineTo(w * 0.6 + Math.sin(t) * 4, 34); S(ctx, '#3a3f4a', 2); ctx.stroke();
        glow(ctx, w * 0.6 + Math.sin(t) * 4, 40, 40, PAL.gold, 0.5);
        tone(ctx, c => circ(c, w * 0.6 + Math.sin(t) * 4, 40, 7), '#fff6c0', w * 0.6, 40, 7, { ol: 2 });
        F(ctx, '#0b0616'); ctx.fillRect(0, fy, w, h - fy);
        ctx.beginPath(); ctx.moveTo(0, fy); ctx.lineTo(w, fy); S(ctx, rgba(PAL.pink, 0.4), 2); ctx.stroke();
        F(ctx, rgba(PAL.cyan, 0.12)); ctx.beginPath(); ctx.ellipse(w * 0.35, fy + 10, 60, 6, 0, 0, TAU); ctx.fill();
      }
    } catch (e) { /* */ }
    ctx.restore();
  }

  /* ============================================================== UI */
  /* o (optional): {ghost: the hp the bar drains from (a white then red
     chunk that lags the real fill), flash: 0..1 white flash on the fill,
     shield: 0..1 block shimmer}. */
  function hpBar(ctx, x, y, w, h, hp, max, block, o) {
    ctx.save();
    try {
      w = w || 80; h = h || 12; hp = Math.max(0, +hp || 0); max = Math.max(1, +max || 1);
      ctx.translate(x || 0, y || 0);
      ctx.beginPath(); rrect(ctx, 0, 0, w, h, h / 2); F(ctx, '#2a1a30'); ctx.fill();
      const fw = Math.max(0, Math.min(1, hp / max)) * (w - 4);
      if (o && o.ghost > hp) {
        const gw = Math.max(0, Math.min(1, o.ghost / max)) * (w - 4);
        ctx.beginPath(); rrect(ctx, 2, 2, Math.max(gw, h - 4), h - 4, (h - 4) / 2);
        F(ctx, (o.flash || 0) > 0.4 ? '#ffffff' : '#ffb0a0'); ctx.fill();
      }
      if (fw > 0) {
        ctx.beginPath(); rrect(ctx, 2, 2, Math.max(fw, h - 4), h - 4, (h - 4) / 2);
        F(ctx, hp / max < 0.3 ? '#d81f3a' : PAL.blood); ctx.fill();
        ctx.beginPath(); rrect(ctx, 3, 3, Math.max(fw - 2, 1), (h - 6) * 0.4, 2); F(ctx, rgba('#ffffff', 0.3)); ctx.fill();
        if (o && o.flash > 0) { ctx.globalAlpha = U.clamp(o.flash, 0, 1) * 0.8; ctx.beginPath(); rrect(ctx, 2, 2, Math.max(fw, h - 4), h - 4, (h - 4) / 2); F(ctx, '#ffffff'); ctx.fill(); ctx.globalAlpha = 1; }
      }
      if (o && o.shield > 0 && block > 0) {
        // a sheen that sweeps the bar while block holds
        const sx = ((o.shield * 1.4) % 1.4 - 0.2) * w;
        ctx.save(); ctx.beginPath(); rrect(ctx, 0, 0, w, h, h / 2); ctx.clip();
        ctx.globalAlpha = 0.55; F(ctx, '#bfe8ff');
        ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx + 10, 0); ctx.lineTo(sx + 4, h); ctx.lineTo(sx - 6, h); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      ctx.beginPath(); rrect(ctx, 0, 0, w, h, h / 2); S(ctx, INK, 2); ctx.stroke();
      txt(ctx, Math.ceil(hp) + '/' + Math.ceil(max), w / 2, h / 2 + 0.5, Math.max(9, h * 0.85), '#fff', true, 'center', INK);
      if (block > 0) {
        ctx.beginPath(); ctx.moveTo(-6, -4); ctx.lineTo(-22, -4); ctx.lineTo(-22, h * 0.5); ctx.quadraticCurveTo(-22, h + 4, -14, h + 6); ctx.quadraticCurveTo(-6, h + 4, -6, h * 0.5); ctx.closePath();
        F(ctx, '#3b6fd6'); ctx.fill(); S(ctx, INK, 2); ctx.stroke();
        txt(ctx, String(block), -14, h * 0.45, Math.max(9, h * 0.8), '#fff', true, 'center', INK);
      }
    } catch (e) { /* */ }
    ctx.restore();
  }
  const STATUS_FALLBACK = { str: ['S', '#ff5a4a', 'buff'], weak: ['W', '#8e98a8', 'debuff'], vuln: ['V', '#ff2e88', 'debuff'], poison: ['P', '#a6ff5e', 'debuff'], burn: ['B', '#ff8a2b', 'debuff'], chill: ['C', '#9fe4ff', 'debuff'], freeze: ['F', '#2ee6d6', 'debuff'], regen: ['R', '#5ab82e', 'buff'], thorns: ['T', '#c98a1a', 'buff'], dodge: ['D', '#ffc94d', 'buff'], bleed: ['b', '#d81f3a', 'debuff'], stun: ['Z', '#ffc94d', 'debuff'], grease: ['G', '#ffe066', 'debuff'], fog: ['~', '#dfe9f5', 'debuff'], shield_up: ['U', '#3b6fd6', 'buff'], enrage: ['E', '#ff2e30', 'buff'], armor: ['A', '#8e98a8', 'buff'] };
  // pop (optional): {statusId: 0..1}, a chip that just changed bounces.
  function statusPips(ctx, x, y, status, size, pop) {
    ctx.save();
    try {
      status = status || {}; size = size || 18;
      ctx.translate(x || 0, y || 0);
      let dx = 0;
      const hasData = typeof DATA !== 'undefined' && DATA && DATA.STATUS;
      for (const id in status) {
        const n = status[id];
        if (!(n > 0)) continue;
        const d = hasData && DATA.STATUS[id];
        const fb = STATUS_FALLBACK[id] || ['?', '#8e98a8', 'debuff'];
        const icon = (d && d.icon) || fb[0], col = (d && d.color) || fb[1], kind = (d && d.kind) || fb[2];
        const pw = size * 2.1;
        const pk = pop && pop[id] > 0 ? pop[id] : 0;
        if (pk) { const sc = 1 + Math.sin(pk * Math.PI) * 0.45; ctx.save(); ctx.translate(dx + pw / 2, size / 2 - Math.sin(pk * Math.PI) * 5); ctx.scale(sc, sc); ctx.translate(-dx - pw / 2, -size / 2); glow(ctx, dx + pw / 2, size / 2, size * 1.4, col, pk); }
        ctx.beginPath(); rrect(ctx, dx, 0, pw, size, size / 2);
        F(ctx, shade(col, -0.55)); ctx.fill();
        S(ctx, kind === 'buff' ? PAL.cyan : PAL.pink, 2); ctx.stroke();
        const simg = artImg('status', id);
        if (simg) blitContain(ctx, simg, dx + size * 0.55, size / 2, size * 0.86, size * 0.86);
        else txt(ctx, String(icon), dx + size * 0.55, size / 2 + 0.5, size * 0.7, col, true, 'center', INK);
        txt(ctx, String(n), dx + size * 1.5, size / 2 + 0.5, size * 0.7, '#fff', true, 'center', INK);
        if (pk) ctx.restore();
        dx += pw + 4;
      }
    } catch (e) { /* */ }
    ctx.restore();
  }
  const BIN_KINDS = { shake: 1, grease: 1, fog: 1, junk: 1, tilt: 1, steal: 1, freezeItem: 1, gulp: 1, bomb: 1, corrode: 1, jam: 1, eggs: 1 };
  function intent(ctx, x, y, enemy, t) {
    ctx.save();
    try {
      enemy = enemy || {}; t = t || 0;
      const it = enemy.intent || {}; const k = it.k || 'attack';
      ctx.translate(x || 0, (y || 0) - Math.abs(Math.sin(t * 2.6)) * 4);
      if (k === 'charge' || enemy.charged) { const pu = 1 + Math.max(0, Math.sin(t * 8)) * 0.1; ctx.scale(pu, pu); }
      ctx.lineJoin = 'round';
      const wide = k === 'attack' || k === 'charge' || k === 'block' || k === 'heal';
      const bw = wide ? 52 : 34, bh = 30;
      ctx.beginPath(); rrect(ctx, -bw / 2, -bh, bw, bh, 8); ctx.moveTo(-6, 0); ctx.lineTo(0, 6); ctx.lineTo(6, 0);
      F(ctx, enemy.charged ? '#5a1030' : '#1d1233'); ctx.fill(); S(ctx, enemy.charged ? PAL.blood : INK, 2.5); ctx.stroke();
      const cy = -bh / 2;
      const shakeX = k in BIN_KINDS ? Math.sin(t * 30) * 1.5 : 0;
      switch (k) {
        case 'attack': {
          ctx.save(); ctx.translate(-bw / 2 + 12, cy); ctx.rotate(-0.8); IA.sword(ctx, 22, 6, '#c9d3e0', '#8a5a2b'); ctx.restore();
          const v = enemy.charged && it.v != null ? it.v : it.v;
          txt(ctx, String(v == null ? '' : v) + (it.n > 1 ? 'x' + it.n : ''), 8, cy + 0.5, 14, enemy.charged ? PAL.blood : '#fff', true, 'center', INK);
          break;
        }
        case 'block': {
          const bimg = artImg('status', 'block');
          if (bimg) blitContain(ctx, bimg, -bw / 2 + 12, cy, 20, 20);
          else { ctx.save(); ctx.translate(-bw / 2 + 12, cy); IA.shield(ctx, 16, 18, '#3b6fd6', PAL.gold); ctx.restore(); }
          txt(ctx, String(it.v == null ? '' : it.v), 8, cy + 0.5, 14, '#fff', true, 'center', INK);
          break;
        }
        case 'buff': case 'debuff': {
          const up = k === 'buff', col = up ? PAL.lime : PAL.pink, simg = artImg('status', it.s);
          if (simg) blitContain(ctx, simg, 0, cy, 22, 22);
          else tone(ctx, c => poly(c, up ? [0, cy - 9, 8, cy, 3, cy, 3, cy + 9, -3, cy + 9, -3, cy, -8, cy] : [0, cy + 9, 8, cy, 3, cy, 3, cy - 9, -3, cy - 9, -3, cy, -8, cy]), col, 0, cy, 8, { ol: 2, dark: -0.3 });
          break;
        }
        case 'heal': {
          tone(ctx, c => poly(c, [-3, cy - 9, 3, cy - 9, 3, cy - 3, 9, cy - 3, 9, cy + 3, 3, cy + 3, 3, cy + 9, -3, cy + 9, -3, cy + 3, -9, cy + 3, -9, cy - 3, -3, cy - 3]), PAL.lime, -8, cy, 9, { ol: 2, dark: -0.3 });
          txt(ctx, String(it.v == null ? '' : it.v), 10, cy + 0.5, 14, '#fff', true, 'center', INK);
          break;
        }
        case 'charge': {
          glow(ctx, 0, cy, 18, PAL.blood, 0.6 + Math.sin(t * 8) * 0.3);
          txt(ctx, '!', 0, cy + 1, 22, PAL.blood, true, 'center', INK);
          break;
        }
        case 'summon': {
          tone(ctx, c => ell(c, 0, cy + 2, 8, 6, 0), '#6a3b9c', 0, cy, 8, { ol: 2 });
          eye(ctx, -3, cy + 1, 2.5, 0, 0); eye(ctx, 3, cy + 1, 2.5, 0, 0);
          txt(ctx, '+', 10, cy - 6, 12, PAL.lime, true, 'center', INK);
          break;
        }
        case 'escape': txt(ctx, '>>', 0, cy + 0.5, 14, PAL.gold, true, 'center', INK); break;
        // the monsters pass: gulp (a chomping mouth), bomb, corrode, jam, eggs
        case 'gulp': {
          const open = 4 + Math.abs(Math.sin(t * 6)) * 5;
          ctx.save(); ctx.translate(shakeX - 3, cy);
          ctx.beginPath(); ctx.moveTo(-11, -2); ctx.quadraticCurveTo(0, -4 - open, 11, -2); ctx.quadraticCurveTo(0, 2 + open, -11, -2); ctx.closePath();
          F(ctx, '#5a1030'); ctx.fill(); S(ctx, PAL.pink, 2); ctx.stroke();
          fangs(ctx, 0, -3 - open * 0.3, 3, 2.4);
          tone(ctx, c => star(c, 3, 1 + Math.sin(t * 6) * 2, 3.5, 4, 0.45), PAL.gold, 3, 1, 3, { ol: 1, spec: false });
          ctx.restore();
          if (it.n > 1) txt(ctx, 'x' + it.n, 12, cy - 9, 11, PAL.pink, true, 'center', INK);
          break;
        }
        case 'bomb': {
          ctx.save(); ctx.translate(shakeX - 1, cy + 1); IA.bomb(ctx, 20, 20, '#2b2340', PAL.blood); ctx.restore();
          glow(ctx, 7, cy - 9, 6 + Math.sin(t * 30) * 1.5, '#ffe066', 0.9);
          break;
        }
        case 'corrode': {
          ctx.save(); ctx.translate(-4, cy); IA.sword(ctx, 20, 5, '#c86a2e', '#8a5a2b'); ctx.restore();
          const ph = (t * 1.2) % 1;
          F(ctx, '#c86a2e'); ctx.beginPath(); circ(ctx, 7, cy + 2 + ph * 8, 2.5); ctx.fill();
          break;
        }
        case 'jam': { wrench(ctx, 0, cy, 0.3, -0.4 + Math.sin(t * 20) * 0.08, true); break; }
        case 'eggs': {
          ctx.save(); ctx.translate(shakeX - 3, cy + 1); ctx.rotate(Math.sin(t * 9) * 0.15); IA.egg(ctx, 14, 18, '#e8d8f0', '#8a4a7a'); ctx.restore();
          txt(ctx, 'x' + (it.n || 1), 11, cy - 8, 11, PAL.pink, true, 'center', INK);
          break;
        }
        default: {
          // shaking box for bin attacks
          ctx.save(); ctx.translate(shakeX - 2, cy); ctx.rotate(Math.sin(t * 30) * 0.08);
          IA.crate(ctx, 22, 20, '#b07a3c', '#6a4a1c');
          ctx.restore();
          if (k === 'freezeItem') { F(ctx, PAL.cyan); ctx.beginPath(); star(ctx, 10, cy - 8, 4, 6, 0.5); ctx.fill(); }
          if (k === 'fog') { F(ctx, rgba('#dfe9f5', 0.8)); ctx.beginPath(); circ(ctx, 9, cy - 7, 4); circ(ctx, 12, cy - 3, 3); ctx.fill(); }
          if (k === 'grease') { F(ctx, '#ffe066'); ctx.beginPath(); circ(ctx, 10, cy + 7, 3); ctx.fill(); }
          if (k === 'steal') txt(ctx, '-', 11, cy - 7, 14, PAL.pink, true, 'center', INK);
          if (k === 'junk') txt(ctx, '+', 11, cy - 7, 12, '#8e8a86', true, 'center', INK);
          if (k === 'tilt') { ctx.beginPath(); ctx.moveTo(-13, cy + 9); ctx.lineTo(13, cy + 5); S(ctx, PAL.gold, 2); ctx.stroke(); }
        }
      }
      // Affixes riding on this next action: Hasty (x2), Greedy (a gulp too).
      const C = typeof COMBAT !== 'undefined' ? COMBAT : null;
      if (C && C.hasteNext && enemy.affix && enemy.affix.length) {
        let bx = bw / 2 + 9;
        const chip = (label, col) => {
          const pul = 1 + Math.abs(Math.sin(t * 7)) * 0.12;
          ctx.save(); ctx.translate(bx, cy); ctx.scale(pul, pul);
          ctx.beginPath(); ctx.arc(0, 0, 9, 0, TAU); F(ctx, shade(col, -0.6)); ctx.fill(); S(ctx, col, 2); ctx.stroke();
          txt(ctx, label, 0, 0.5, 10, col, true, 'center', INK);
          ctx.restore();
          bx += 20;
        };
        if (C.hasteNext(enemy)) chip('x2', '#ffe066');
        if (C.greedNext && C.greedNext(enemy) && k !== 'gulp') chip('+', PAL.gold);
      }
    } catch (e) { /* */ }
    ctx.restore();
  }
  const CHAR_COL = { knight: '#3b6fd6', alchemist: '#5ab82e', rogue: '#7a3b9c' };
  function portrait(ctx, charId, x, y, size, t) {
    ctx.save();
    try {
      size = size || 48; t = t || 0;
      const r = size / 2, col = CHAR_COL[charId] || '#8e98a8';
      ctx.translate(x || 0, y || 0);
      ctx.lineJoin = 'round';
      tone(ctx, c => circ(c, 0, 0, r), shade(col, -0.5), 0, 0, r, { dark: -0.3, spec: false, ol: 3, olc: col });
      const pimg = artImg('portrait', charId);
      ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r - 2, 0, TAU); ctx.clip();
      if (pimg) blitCover(ctx, pimg, -r, -r, r * 2, r * 2);
      else {
        const k = r / 24;
        ctx.scale(k, k); ctx.translate(0, 6);
        // shoulders
        tone(ctx, c => rrect(c, -20, 8, 40, 30, 8), col, 0, 20, 20, { dark: -0.3 });
        if (charId === 'knight') {
          tone(ctx, c => rrect(c, -13, -20, 26, 30, 10), '#c9d3e0', 0, -6, 13, { dark: -0.35 });
          ctx.beginPath(); ctx.rect(-11, -9, 22, 6); F(ctx, INK); ctx.fill();
          F(ctx, PAL.pink); ctx.beginPath(); circ(ctx, -5, -6, 1.6); circ(ctx, 5, -6, 1.6); ctx.fill();
          tone(ctx, c => { c.moveTo(-3, -20); c.quadraticCurveTo(6, -34, 16, -24); c.quadraticCurveTo(8, -24, 4, -18); c.closePath(); }, PAL.pink, 6, -24, 8, { dark: -0.3, spec: false });
        } else if (charId === 'alchemist') {
          tone(ctx, c => circ(c, 0, -6, 13), '#f1c9a6', 0, -6, 13, { dark: -0.25 });
          tone(ctx, c => { c.moveTo(-14, -8); c.quadraticCurveTo(-16, -30, 0, -24); c.quadraticCurveTo(16, -30, 14, -8); c.lineTo(10, -12); c.lineTo(4, -6 - 14); c.lineTo(-4, -20); c.lineTo(-10, -12); c.closePath(); }, '#ff8a2b', 0, -18, 14, { dark: -0.3, spec: false });
          for (const dx of [-5, 5]) { ctx.beginPath(); ctx.arc(dx, -7, 4.5, 0, TAU); F(ctx, PAL.lime); ctx.fill(); S(ctx, INK, 2); ctx.stroke(); }
          ctx.beginPath(); ctx.moveTo(-4, 2); ctx.quadraticCurveTo(0, 5, 4, 2); S(ctx, INK, 1.5); ctx.stroke();
        } else {
          tone(ctx, c => { c.moveTo(-15, 6); c.quadraticCurveTo(-16, -26, 0, -26); c.quadraticCurveTo(16, -26, 15, 6); c.closePath(); }, '#4a2a6a', 0, -8, 15, { dark: -0.35, spec: false });
          ctx.beginPath(); ctx.moveTo(-10, -4); ctx.quadraticCurveTo(0, 6, 10, -4); ctx.quadraticCurveTo(0, -18, -10, -4); ctx.closePath(); F(ctx, INK); ctx.fill();
          F(ctx, PAL.gold); ctx.beginPath(); ell(ctx, -4, -6, 2.5, 1.5, 0.2); ell(ctx, 4, -6, 2.5, 1.5, -0.2); ctx.fill();
          ctx.beginPath(); ctx.moveTo(-7, 6); ctx.lineTo(7, 6); S(ctx, INK, 2); ctx.stroke();
        }
      }
      ctx.restore();
      if (pimg) { ctx.beginPath(); ctx.arc(0, 0, r - 1.5, 0, TAU); S(ctx, col, 3); ctx.stroke(); }
      // claw backpack strap hint
      ctx.beginPath(); ctx.moveTo(-r * 0.3, r * 0.55); ctx.lineTo(-r * 0.15, r * 0.95); S(ctx, rgba(INK, 0.6), 3); ctx.stroke();
    } catch (e) { /* */ }
    ctx.restore();
  }
  const RARITY_COL = { c: '#8e98a8', u: '#2ee6d6', r: '#ffc94d', l: '#ff2e88', boss: '#ff5a4a', event: '#a6ff5e' };
  function relicIcon(ctx, def, x, y, size) {
    ctx.save();
    try {
      def = def || {}; size = size || 32;
      const r = size / 2, col = RARITY_COL[def.rarity] || RARITY_COL.c;
      ctx.translate(x || 0, y || 0);
      ctx.lineJoin = 'round';
      const rimg = artImg('relic', def.id);
      if (rimg) {
        // the emblem, plus a rarity pip so the tier still reads
        blitContain(ctx, rimg, 0, 0, size, size);
        tone(ctx, c => circ(c, r * 0.72, r * 0.72, r * 0.2), col, r * 0.72, r * 0.72, r * 0.2, { ol: 1.5, spec: false });
      } else {
        tone(ctx, c => poly(c, [-r * 0.55, -r, r * 0.55, -r, r, -r * 0.3, 0, r, -r, -r * 0.3]), shade(col, -0.55), 0, -r * 0.1, r, { dark: -0.3, ol: 2.5, olc: col });
        if (!FLAT) { ctx.fillStyle = rgba('#ffffff', 0.12); ctx.beginPath(); poly(ctx, [-r * 0.55, -r + 2, r * 0.55, -r + 2, r * 0.3, -r * 0.3, -r * 0.3, -r * 0.3]); ctx.fill(); }
        txt(ctx, String(def.icon || '?'), 0, -r * 0.1, size * 0.5, '#fff', true, 'center', INK);
      }
    } catch (e) { /* */ }
    ctx.restore();
  }

  /* ============================================================ TITLE */
  let titlePrizes = null;
  function title(ctx, w, h, t) {
    ctx.save();
    try {
      w = w || 540; h = h || 960; t = t || 0;
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      const cx = w / 2, timg = artImg('title', 'title'), limg = artImg('logo', 'logo');
      // art/title.png replaces the drawn scene, art/logo.png the drawn logo
      if (timg) blitCover(ctx, timg, 0, 0, w, h);
      else {
        F(ctx, '#0b0616'); ctx.fillRect(0, 0, w, h);
        F(ctx, rgba(PAL.pink, 0.08)); ctx.fillRect(0, h * 0.5, w, h * 0.5);
        // stars
        F(ctx, rgba('#ffffff', 0.5)); ctx.beginPath(); for (let i = 0; i < 40; i++) circ(ctx, (i * 131 + 17) % w, (i * 89 + 11) % (h * 0.6), 1 + (i % 3) * 0.4); ctx.fill();
        // the tower: stacked cabinets narrowing upward
        const base = h * 0.86;
        for (let i = 0; i < 7; i++) {
          const tw = w * (0.62 - i * 0.06), th = h * 0.075, ty = base - (i + 1) * th, neon = [PAL.pink, PAL.cyan, PAL.gold, PAL.lime][i % 4];
          tone(ctx, c => rrect(c, cx - tw / 2, ty, tw, th, 6), '#1d1233', cx, ty + th / 2, tw / 2, { dark: -0.35, spec: false });
          const n = Math.max(1, Math.floor(tw / 44));
          for (let j = 0; j < n; j++) {
            const wx = cx - tw / 2 + 10 + j * (tw - 20) / n, on = Math.floor(t * 3 + i + j) % 3 !== 0;
            ctx.beginPath(); rrect(ctx, wx, ty + 8, (tw - 20) / n - 8, th - 16, 3);
            F(ctx, on ? rgba(neon, 0.55) : '#0a0614'); ctx.fill(); S(ctx, INK, 1.5); ctx.stroke();
          }
          ctx.beginPath(); rrect(ctx, cx - tw / 2, ty, tw, th, 6); S(ctx, rgba(neon, 0.5), 2); ctx.stroke();
        }
        glow(ctx, cx, base - h * 0.55, w * 0.35, PAL.pink, 0.35);
        // ground
        F(ctx, '#05030a'); ctx.fillRect(0, base, w, h - base);
        ctx.beginPath(); ctx.moveTo(0, base); ctx.lineTo(w, base); S(ctx, PAL.pink, 2); ctx.stroke();
        // rain of tiny prizes
        if (!titlePrizes) {
          const r = U.rng(99); titlePrizes = [];
          for (let i = 0; i < 36; i++) titlePrizes.push({ k: ITEM_KEYS[r.int(0, ITEM_KEYS.length - 1)], x: r(), sp: 0.04 + r() * 0.08, ph: r() * 10, s: 0.35 + r() * 0.35, rot: r() * 3 });
        }
        for (const p of titlePrizes) {
          const py = ((p.ph + t * p.sp) % 1) * h * 1.1 - h * 0.05;
          ctx.save(); ctx.translate(p.x * w, py); ctx.rotate(p.rot + t * 0.8); ctx.scale(p.s, p.s); ctx.globalAlpha = 0.75;
          IA[p.k](ctx, 30, 30, ITEM_DEFAULT[p.k][0], ITEM_DEFAULT[p.k][1]);
          ctx.restore();
        }
        // giant claw descending
        const cy = h * 0.06 + Math.sin(t * 0.8) * 10, sw = Math.sin(t * 0.8) * 0.05;
        ctx.beginPath(); ctx.moveTo(cx, -10); ctx.lineTo(cx + Math.sin(sw) * 60, cy + 60); S(ctx, INK, 12); ctx.stroke(); S(ctx, '#8e98a8', 6); ctx.stroke();
        ctx.save(); ctx.translate(cx + Math.sin(sw) * 60, cy + 60); ctx.rotate(sw); ctx.scale(2.6, 2.6);
        tone(ctx, c => rrect(c, -18, -8, 36, 20, 6), CHROME, 0, 2, 18, { dark: -0.45 });
        const op = 0.4 + Math.sin(t * 0.8) * 0.12;
        for (const d of [-1, 1]) {
          ctx.save(); ctx.translate(d * 14, 10); ctx.rotate(d * op);
          tone(ctx, c => { c.moveTo(-6, 0); c.lineTo(6, 0); c.quadraticCurveTo(d * 10, 26, d * 5, 44); c.lineTo(d * 2, 43); c.quadraticCurveTo(d * 3, 22, -6, 8); c.closePath(); }, CHROME, d * 3, 20, 18, { dark: -0.45, spec: false });
          ctx.restore();
        }
        tone(ctx, c => circ(c, 0, 2, 5), '#8e98a8', 0, 2, 5, { dark: -0.4, ol: 2 });
        ctx.restore();
      }
      // logo
      const ly = h * 0.5, fs = Math.min(w * 0.16, 92);
      let subY = ly + fs * 0.72;
      if (limg) {
        const lw = Math.min(w * 0.9, 486), lh = lw * imH(limg) / imW(limg);
        blit(ctx, limg, cx - lw / 2, ly - lh / 2, lw, lh);
        subY = ly + lh / 2 + 12;
      } else {
        ctx.font = '900 ' + fs + 'px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = rgba(PAL.pink, 0.35); ctx.lineWidth = fs * 0.3; ctx.strokeText('CLAWSPIRE', cx, ly);
        ctx.strokeStyle = INK; ctx.lineWidth = fs * 0.16; ctx.strokeText('CLAWSPIRE', cx, ly);
        ctx.fillStyle = CHROME; ctx.fillText('CLAWSPIRE', cx, ly);
        ctx.save(); ctx.beginPath(); ctx.rect(0, ly - fs * 0.5, w, fs * 0.42); ctx.clip();
        ctx.fillStyle = '#ffffff'; ctx.fillText('CLAWSPIRE', cx, ly); ctx.restore();
        ctx.save(); ctx.beginPath(); ctx.rect(0, ly + fs * 0.05, w, fs * 0.5); ctx.clip();
        ctx.fillStyle = PAL.pink; ctx.fillText('CLAWSPIRE', cx, ly); ctx.restore();
        ctx.strokeStyle = rgba('#ffffff', 0.6); ctx.lineWidth = 1.5; ctx.strokeText('CLAWSPIRE', cx, ly);
      }
      txt(ctx, 'a claw machine roguelike', cx, subY, Math.max(12, fs * 0.2), PAL.cyan, true, 'center', INK);
    } catch (e) { /* */ }
    ctx.restore();
  }

  /* ============================================================== FX */
  /* The juice layer: pooled particles with presets, physics damage numbers,
     icon badges, impact rings, slash arcs, arcing flyers (coins to the gold
     counter, items to their target), a trauma camera shake (offset grows
     with trauma^2 and decays linearly) plus a directional kick, a screen
     flash and an edge vignette. Everything lives in fixed pools that are
     built once: a spawn past the cap recycles the oldest slot, a frame
     allocates nothing. api.reduced (the settings' Shake off) shrinks the
     shake to a fifth, drops the rotation and the kick, thins every preset
     burst to a third and skips the flash. */
  const fx = (() => {
    const MAXP = 400, MAXT = 48, MAXR = 64, MAXRING = 40, MAXSL = 16, MAXF = 48;
    // particle kinds
    const K = { dot: 0, sq: 1, spark: 2, star: 3, coin: 4, confetti: 5, bubble: 6, plus: 7, smoke: 8, shard: 9, ember: 10, snow: 11 };
    const ADD = [false, false, true, true, false, false, false, false, false, false, true, false];
    const parts = []; for (let i = 0; i < MAXP; i++) parts.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 3, col: '#fff', g: 0, drag: 1, kind: 0, rot: 0, vr: 0, grow: 0 });
    const texts = []; for (let i = 0; i < MAXT; i++) texts.push({ x: 0, y: 0, str: '', col: '#fff', life: 0, max: 1, size: 20, dy: -40, mode: 0, vx: 0, vy: 0, g: 0, crit: false, icon: '', ox: 0, oy: 0 });
    const trails = []; for (let i = 0; i < MAXR; i++) trails.push({ x: 0, y: 0, x2: 0, y2: 0, col: '#fff', life: 0, max: 1, w: 3 });
    const rings = []; for (let i = 0; i < MAXRING; i++) rings.push({ x: 0, y: 0, r0: 0, r1: 40, col: '#fff', life: 0, max: 1, w: 4, delay: 0 });
    const slashes = []; for (let i = 0; i < MAXSL; i++) slashes.push({ x: 0, y: 0, a: 0, len: 60, col: '#fff', life: 0, max: 1, w: 12, claw: false });
    const flyers = []; for (let i = 0; i < MAXF; i++) flyers.push({ x0: 0, y0: 0, x1: 0, y1: 0, cx: 0, cy: 0, t: 0, dur: 1, delay: 0, kind: 4, col: '#fff', size: 6, cb: null, px: 0, py: 0 });
    let pn = 0, tn = 0, rn = 0, gn = 0, sn = 0, fn = 0, pSpawn = 0;
    let trauma = 0, shakeT = 0, kx = 0, ky = 0;
    let flashA = 0, flashCol = '#fff', vigA = 0, vigCol = '#ff2e30', vigHold = 0, vigHoldCol = '#ff2e30';
    const off = { x: 0, y: 0, r: 0 };
    const scratch = { x: 0, y: 0, vx: 0, vy: 0, life: 1, max: 1, size: 6, col: '#fff', g: 0, drag: 1, kind: 4, rot: 0, vr: 0, grow: 0 };
    const rnd = U.rng(4242);
    const api = { reduced: false, MAXP };
    const cycle = [PAL.pink, PAL.cyan, PAL.gold, PAL.lime, '#9b7bff', '#ffffff'];

    // One pooled particle (the oldest live one when the pool is full).
    function spawn() {
      if (pn < MAXP) return parts[pn++];
      pSpawn = (pSpawn + 1) % MAXP;
      return parts[pSpawn];
    }
    /* The original burst: n particles from (x, y). o: {speed, size, life,
       spread, dir, gravity, drag, square, kind, cols, grow, spin}. */
    api.burst = (x, y, col, n, o) => {
      o = o || 0; n = n == null ? 12 : n;
      if (!(n > 0)) return;
      const sp = o.speed || 160, size = o.size || 4, life = o.life || 0.6, spread = o.spread == null ? TAU : o.spread, dir = o.dir == null ? -Math.PI / 2 : o.dir;
      const kind = o.kind != null ? (K[o.kind] != null ? K[o.kind] : 0) : (o.square ? 1 : 0);
      const cols = o.cols;
      for (let i = 0; i < n; i++) {
        const p = spawn();
        const a = dir + (rnd() - 0.5) * spread, v = sp * (0.4 + rnd() * 0.8);
        p.x = x + (o.jx ? (rnd() - 0.5) * o.jx : 0); p.y = y + (o.jy ? (rnd() - 0.5) * o.jy : 0);
        p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v;
        p.life = p.max = life * (0.6 + rnd() * 0.6); p.size = size * (0.6 + rnd() * 0.8);
        p.col = cols ? cols[i % cols.length] : (col || PAL.gold);
        p.g = o.gravity == null ? 600 : o.gravity; p.drag = o.drag == null ? 0.985 : o.drag;
        p.kind = kind; p.rot = rnd() * TAU; p.vr = (rnd() - 0.5) * (o.spin == null ? 12 : o.spin); p.grow = o.grow || 0;
      }
    };
    // How many particles a preset gets: a third when reduced, never zero.
    const cnt = (n, o) => Math.max(1, Math.round(n * (o && o.n != null ? o.n : 1) * (api.reduced ? 0.35 : 1)));
    /* Named effects. o: {n: count multiplier, col, dir, power}. Unknown names
       fall back to a plain burst. */
    api.emit = (name, x, y, o) => {
      o = o || 0;
      const col = o.col, pw = o.power == null ? 1 : o.power;
      switch (name) {
        case 'hit':
          api.burst(x, y, '#ffffff', cnt(7, o), { kind: 'spark', speed: 380 * pw, size: 3, life: 0.28, gravity: 200, drag: 0.9 });
          api.burst(x, y, col || PAL.blood, cnt(8, o), { speed: 220 * pw, size: 4, life: 0.5, gravity: 700 });
          break;
        case 'crit':
          api.burst(x, y, '#fff6c0', cnt(14, o), { kind: 'spark', speed: 520, size: 4, life: 0.35, gravity: 150, drag: 0.9 });
          api.burst(x, y, PAL.gold, cnt(6, o), { kind: 'star', speed: 260, size: 6, life: 0.7, gravity: 300 });
          api.burst(x, y, col || PAL.blood, cnt(12, o), { speed: 300, size: 5, life: 0.6, gravity: 800 });
          break;
        case 'sparks':
          api.burst(x, y, col || '#fff6c0', cnt(10, o), { kind: 'spark', speed: 260 * pw, size: 2.5, life: 0.32, gravity: 520, drag: 0.93, dir: o.dir, spread: o.spread });
          break;
        case 'dust':
          api.burst(x, y, col || 'rgba(214,200,232,0.55)', cnt(4 + 4 * pw, o), { kind: 'smoke', speed: 70 * (0.6 + pw), size: 7 + 5 * pw, life: 0.55, gravity: -30, drag: 0.9, dir: -Math.PI / 2, spread: Math.PI * 1.1, grow: 18, jx: 14 });
          break;
        case 'smoke': case 'poof':
          api.burst(x, y, col || 'rgba(220,210,240,0.7)', cnt(9, o), { kind: 'smoke', speed: 110, size: 12, life: 0.6, gravity: -40, drag: 0.9, grow: 26 });
          if (name === 'poof') api.burst(x, y, PAL.gold, cnt(5, o), { kind: 'star', speed: 160, size: 5, life: 0.6, gravity: 120 });
          break;
        case 'coins':
          api.burst(x, y, PAL.gold, cnt(12, o), { kind: 'coin', speed: 420 * pw, size: 6, life: 1.1, gravity: 1100, drag: 0.99, dir: o.dir == null ? -Math.PI / 2 : o.dir, spread: 1.1, spin: 16 });
          break;
        case 'confetti':
          api.burst(x, y, null, cnt(34, o), { kind: 'confetti', cols: cycle, speed: 520 * pw, size: 5, life: 1.6, gravity: 320, drag: 0.965, dir: o.dir == null ? -Math.PI / 2 : o.dir, spread: o.spread == null ? 1.6 : o.spread, spin: 20 });
          break;
        case 'poison':
          api.burst(x, y, col || PAL.lime, cnt(9, o), { kind: 'bubble', speed: 90, size: 5, life: 0.9, gravity: -90, drag: 0.95, jx: 20 });
          break;
        case 'burn':
          api.burst(x, y, col || '#ff8a2b', cnt(12, o), { kind: 'ember', cols: ['#ff8a2b', '#ffe066', '#ff5a4a'], speed: 150, size: 3.5, life: 0.8, gravity: -160, drag: 0.94, jx: 24 });
          break;
        case 'frost':
          api.burst(x, y, col || '#bfe8ff', cnt(10, o), { kind: 'shard', cols: ['#bfe8ff', '#ffffff', PAL.cyan], speed: 260, size: 5, life: 0.6, gravity: 380, spin: 18 });
          api.burst(x, y, '#ffffff', cnt(5, o), { kind: 'star', speed: 90, size: 4, life: 0.7, gravity: 0, drag: 0.9 });
          break;
        case 'shock':
          api.burst(x, y, col || '#ffe066', cnt(12, o), { kind: 'spark', cols: ['#ffe066', PAL.cyan, '#ffffff'], speed: 460, size: 3, life: 0.22, gravity: 0, drag: 0.86 });
          break;
        case 'blood':
          api.burst(x, y, col || '#d81f3a', cnt(9, o), { speed: 200, size: 3.5, life: 0.6, gravity: 900 });
          break;
        case 'heal':
          api.burst(x, y, col || PAL.lime, cnt(9, o), { kind: 'plus', speed: 80, size: 6, life: 1.0, gravity: -110, drag: 0.95, jx: 40, jy: 10, spin: 0 });
          api.burst(x, y, '#ffffff', cnt(5, o), { kind: 'star', speed: 70, size: 3, life: 0.8, gravity: -60, drag: 0.95, jx: 40 });
          break;
        case 'block':
          api.burst(x, y, col || PAL.cyan, cnt(8, o), { kind: 'shard', speed: 240, size: 4.5, life: 0.55, gravity: 700, spin: 20, dir: o.dir, spread: o.spread == null ? 2.2 : o.spread });
          break;
        case 'shatter':
          api.burst(x, y, col || '#bfe8ff', cnt(18, o), { kind: 'shard', cols: [col || '#bfe8ff', '#ffffff'], speed: 340, size: 6, life: 0.8, gravity: 900, spin: 24 });
          break;
        case 'death':
          api.burst(x, y, col || PAL.pink, cnt(20, o), { speed: 320, size: 5.5, life: 0.75, gravity: 500 });
          api.burst(x, y, 'rgba(230,220,250,0.6)', cnt(7, o), { kind: 'smoke', speed: 120, size: 14, life: 0.7, gravity: -40, drag: 0.9, grow: 30 });
          api.burst(x, y, '#ffffff', cnt(8, o), { kind: 'star', speed: 280, size: 5, life: 0.6, gravity: 200 });
          break;
        case 'glint':
          api.burst(x, y, col || '#ffffff', cnt(3, o), { kind: 'star', speed: 30, size: 4, life: 0.45, gravity: 0, drag: 0.9, spin: 4 });
          break;
        case 'trailDot':
          api.burst(x, y, col || PAL.gold, 1, { kind: 'star', speed: 25, size: 3.5, life: 0.35, gravity: 0, drag: 0.9 });
          break;
        // cabinet materials: food crumbs, a bomb going off in the bin
        case 'crumbs':
          api.burst(x, y, col || '#d9a05b', cnt(7, o), { kind: 'sq', cols: [col || '#d9a05b', '#f4e6c8'], speed: 150 * pw, size: 2.6, life: 0.5, gravity: 900, dir: -Math.PI / 2, spread: 2.4, spin: 14 });
          break;
        case 'blast':
          api.burst(x, y, '#fff6c0', cnt(16, o), { kind: 'spark', speed: 620 * pw, size: 3.5, life: 0.32, gravity: 200, drag: 0.9 });
          api.burst(x, y, null, cnt(18, o), { kind: 'ember', cols: ['#ff8a2b', '#ffe066', '#ff5a4a'], speed: 380 * pw, size: 4.5, life: 0.7, gravity: -60, drag: 0.93 });
          api.burst(x, y, 'rgba(90,80,110,0.8)', cnt(10, o), { kind: 'smoke', speed: 150 * pw, size: 16, life: 0.9, gravity: -50, drag: 0.9, grow: 40 });
          break;
        default:
          api.burst(x, y, col, cnt(12, o));
      }
    };
    /* Floating text. The classic mode rises dy px with an ease; o.phys (the
       damage numbers) pops with an overshoot, flies up and falls with gravity. */
    api.text = (x, y, str, col, o) => {
      o = o || 0;
      const p = tn < MAXT ? texts[tn++] : texts[0];
      p.x = x; p.y = y; p.str = String(str); p.col = col || '#fff'; p.life = p.max = o.life || 1; p.size = o.size || (o.big ? 28 : 20); p.dy = o.dy == null ? -46 : o.dy;
      p.mode = o.phys ? 1 : 0; p.crit = !!o.crit; p.icon = ''; p.ox = p.oy = 0;
      p.vx = o.vx == null ? (rnd() - 0.5) * 120 : o.vx; p.vy = o.vy == null ? -300 - rnd() * 80 : o.vy; p.g = o.gravity == null ? 900 : o.gravity;
      return p;
    };
    // A damage number: size by magnitude, a crit pops bigger and wobbles.
    api.num = (x, y, str, col, o) => {
      o = o || 0;
      const n = parseFloat(String(str).replace(/[^\d.]/g, '')) || 0;   // '\u221224' (a minus sign) is 24
      const size = o.size || U.clamp(20 + Math.sqrt(n) * 4, 20, 46) * (o.crit ? 1.25 : 1);
      return api.text(x, y, str, col, { phys: true, size, crit: o.crit, life: o.life || (o.crit ? 1.25 : 1.0), vx: o.vx, vy: o.vy, gravity: o.gravity });
    };
    // An icon pill with a label that rises (relic procs, pickups).
    api.badge = (x, y, icon, str, col, o) => {
      o = o || 0;
      const p = api.text(x, y, str, col, { life: o.life || 1.4, size: o.size || 15, dy: o.dy == null ? -64 : o.dy });
      p.mode = 2; p.icon = icon == null ? '' : String(icon);
      return p;
    };
    api.trail = (x, y, col, o) => {
      o = o || 0;
      const p = rn < MAXR ? trails[rn++] : trails[0];
      p.x = x; p.y = y; p.x2 = x - (o.vx || 0) * 0.05; p.y2 = y - (o.vy || 20) * 0.05; p.col = col || PAL.cyan; p.life = p.max = o.life || 0.25; p.w = o.w || 3;
    };
    // An expanding ring (impact, clank, bloom). o: {r0, r1, life, w, delay}.
    api.ring = (x, y, col, o) => {
      o = o || 0;
      const p = gn < MAXRING ? rings[gn++] : rings[(gn + 7) % MAXRING];
      p.x = x; p.y = y; p.col = col || '#fff'; p.r0 = o.r0 == null ? 6 : o.r0; p.r1 = o.r1 == null ? 60 : o.r1;
      p.life = p.max = o.life || 0.45; p.w = o.w || 5; p.delay = o.delay || 0;
    };
    /* A crescent slash arc across (x, y) at angle a, len px wide; o.claw
       draws three straight parallel rakes instead (a claw mark on the screen). */
    api.slash = (x, y, a, len, col, o) => {
      o = o || 0;
      const p = sn < MAXSL ? slashes[sn++] : slashes[0];
      p.x = x; p.y = y; p.a = a || 0; p.len = len || 70; p.col = col || '#fff'; p.life = p.max = o.life || 0.32; p.w = o.w || 14; p.claw = !!o.claw;
    };
    /* Something that arcs from (x0, y0) to (x1, y1) over dur s (after delay
       s): a coin to the gold counter, a star to a relic. cb() runs on arrival.
       o: {kind: 'coin'|'star'|'dot', col, dur, delay, arc (px of lift), size, cb} */
    api.fly = (x0, y0, x1, y1, o) => {
      o = o || 0;
      const p = fn < MAXF ? flyers[fn++] : flyers[0];
      if (p.cb && p.t < 1) { const cb = p.cb; p.cb = null; try { cb(); } catch (e) { /* */ } }
      p.x0 = x0; p.y0 = y0; p.x1 = x1; p.y1 = y1;
      const arc = o.arc == null ? 120 : o.arc;
      p.cx = (x0 + x1) / 2 + (o.side || 0); p.cy = Math.min(y0, y1) - arc;
      p.t = 0; p.dur = o.dur || 0.6; p.delay = o.delay || 0; p.kind = K[o.kind] != null ? K[o.kind] : K.coin;
      p.col = o.col || PAL.gold; p.size = o.size || 6; p.cb = o.cb || null; p.px = x0; p.py = y0;
    };
    // Trauma shake: amt 6 is a solid hit, 20+ is the ceiling.
    api.shake = (amt) => { trauma = Math.min(1, trauma + (amt == null ? 6 : amt) / 20); };
    api.trauma = () => trauma;
    // A one-off directional nudge (the claw thunking the floor).
    api.kick = (dx, dy) => { if (api.reduced) return; kx += dx || 0; ky += dy || 0; };
    api.flash = (col, a) => { a = a == null ? 0.5 : a; if (api.reduced) a = Math.min(a, 0.12); flashCol = col || '#fff'; flashA = Math.max(flashA, a); };
    // A pulse of colour on the screen edges (a hit on the player).
    api.vignette = (col, a) => { vigCol = col || '#ff2e30'; vigA = Math.max(vigA, a == null ? 0.6 : a); };
    // A standing edge glow the game sets every frame (low hp heartbeat); 0 clears.
    api.hold = (a, col) => { vigHold = a > 0 ? a : 0; if (col) vigHoldCol = col; };
    api.update = (dt) => {
      dt = dt > 0 ? Math.min(dt, 0.1) : 0;
      for (let i = 0; i < pn;) {
        const p = parts[i];
        p.life -= dt;
        if (p.life <= 0) { pn--; const q = parts[pn]; parts[pn] = p; parts[i] = q; continue; }
        p.vy += p.g * dt; p.vx *= p.drag; p.vy *= p.drag; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
        if (p.grow) p.size += p.grow * dt;
        i++;
      }
      if (pSpawn >= pn) pSpawn = 0;
      for (let i = 0; i < tn;) {
        const p = texts[i]; p.life -= dt;
        if (p.life <= 0) { tn--; const q = texts[tn]; texts[tn] = p; texts[i] = q; continue; }
        if (p.mode === 1) { p.vy += p.g * dt; p.vx *= 0.98; p.ox += p.vx * dt; p.oy += p.vy * dt; }
        i++;
      }
      for (let i = 0; i < rn;) { const p = trails[i]; p.life -= dt; if (p.life <= 0) { rn--; const q = trails[rn]; trails[rn] = p; trails[i] = q; continue; } i++; }
      for (let i = 0; i < gn;) {
        const p = rings[i];
        if (p.delay > 0) { p.delay -= dt; i++; continue; }
        p.life -= dt; if (p.life <= 0) { gn--; const q = rings[gn]; rings[gn] = p; rings[i] = q; continue; } i++;
      }
      for (let i = 0; i < sn;) { const p = slashes[i]; p.life -= dt; if (p.life <= 0) { sn--; const q = slashes[sn]; slashes[sn] = p; slashes[i] = q; continue; } i++; }
      for (let i = 0; i < fn;) {
        const p = flyers[i];
        if (p.delay > 0) { p.delay -= dt; i++; continue; }
        p.t += dt / p.dur;
        if (p.t >= 1) {
          const cb = p.cb; p.cb = null;
          fn--; const q = flyers[fn]; flyers[fn] = p; flyers[i] = q;
          if (cb) { try { cb(); } catch (e) { /* a callback never breaks the loop */ } }
          continue;
        }
        i++;
      }
      if (trauma > 0) { trauma = Math.max(0, trauma - dt * 1.4); shakeT += dt; }
      const kd = Math.exp(-dt * 14); kx *= kd; ky *= kd;
      if (Math.abs(kx) < 0.01) kx = 0; if (Math.abs(ky) < 0.01) ky = 0;
      if (flashA > 0) flashA = Math.max(0, flashA - dt * 2.2);
      if (vigA > 0) vigA = Math.max(0, vigA - dt * 1.6);
    };
    /* The camera: {x, y, r}. Shake is trauma^2 x 22 px of smooth noise (a
       fifth when reduced), r a small roll; the kick springs back on its own.
       One object, reused every frame. */
    api.offset = () => {
      const k = trauma * trauma * 16 * (api.reduced ? 0.2 : 1);
      const t = shakeT;
      off.x = U.clamp(k * (Math.sin(t * 47) * 0.62 + Math.sin(t * 83 + 1.3) * 0.38) + kx, -24, 24);
      off.y = U.clamp(k * (Math.cos(t * 41) * 0.62 + Math.sin(t * 71 + 0.4) * 0.38) + ky, -24, 24);
      off.r = api.reduced ? 0 : trauma * trauma * 0.012 * Math.sin(t * 37);
      return off;
    };
    // Edge glow sprite: a 135 x 240 radial vignette per colour, scaled up.
    const vigCache = new Map();
    function vigSprite(col) {
      if (vigCache.has(col)) return vigCache.get(col);
      let cv = null;
      try {
        if (typeof document !== 'undefined' && document && document.createElement) {
          const c = document.createElement('canvas');
          c.width = 135; c.height = 240;
          const g = c.getContext && c.getContext('2d');
          if (g && g.createRadialGradient) {
            const grad = g.createRadialGradient(67.5, 120, 40, 67.5, 120, 150);
            grad.addColorStop(0, rgba(col, 0)); grad.addColorStop(0.55, rgba(col, 0.25)); grad.addColorStop(1, rgba(col, 0.95));
            g.fillStyle = grad; g.fillRect(0, 0, 135, 240);
            cv = c;
          }
        }
      } catch (e) { cv = null; }
      vigCache.set(col, cv);
      return cv;
    }
    function drawVig(ctx, col, a) {
      if (a <= 0.005) return;
      ctx.globalAlpha = Math.min(1, a);
      const sp = vigSprite(col);
      if (sp) { try { ctx.drawImage(sp, -20, -20, 580, 1000); } catch (e) { /* stub */ } return; }
      ctx.fillStyle = col;
      ctx.fillRect(0, 0, 540, 26); ctx.fillRect(0, 934, 540, 26); ctx.fillRect(0, 0, 22, 960); ctx.fillRect(518, 0, 22, 960);
    }
    function drawPart(ctx, p, a) {
      const s = p.size * (p.kind === K.smoke ? 1 : (0.5 + a * 0.5));
      ctx.globalAlpha = a;
      switch (p.kind) {
        case K.sq: ctx.fillStyle = p.col; ctx.fillRect(p.x - s, p.y - s, s * 2, s * 2); break;
        case K.spark: {
          const vx = p.vx * 0.035, vy = p.vy * 0.035;
          ctx.strokeStyle = p.col; ctx.lineWidth = s; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(p.x - vx, p.y - vy); ctx.lineTo(p.x + vx * 0.3, p.y + vy * 0.3); ctx.stroke();
          break;
        }
        case K.star: {
          ctx.fillStyle = p.col;
          ctx.beginPath();
          const c = Math.cos(p.rot), sn2 = Math.sin(p.rot), l = s * 1.6, w = s * 0.35;
          ctx.moveTo(p.x + c * l, p.y + sn2 * l); ctx.lineTo(p.x - sn2 * w, p.y + c * w); ctx.lineTo(p.x - c * l, p.y - sn2 * l); ctx.lineTo(p.x + sn2 * w, p.y - c * w); ctx.closePath();
          ctx.moveTo(p.x - sn2 * l, p.y + c * l); ctx.lineTo(p.x - c * w, p.y - sn2 * w); ctx.lineTo(p.x + sn2 * l, p.y - c * l); ctx.lineTo(p.x + c * w, p.y + sn2 * w); ctx.closePath();
          ctx.fill();
          break;
        }
        case K.coin: {
          const sx = Math.abs(Math.cos(p.rot)) * s + 0.8;
          ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(p.x, p.y, sx + 1.5, s + 1.5, 0, 0, TAU); ctx.fill();
          ctx.fillStyle = p.col; ctx.beginPath(); ctx.ellipse(p.x, p.y, sx, s, 0, 0, TAU); ctx.fill();
          ctx.fillStyle = '#fff6c0'; ctx.beginPath(); ctx.ellipse(p.x - sx * 0.3, p.y - s * 0.3, sx * 0.35, s * 0.3, 0, 0, TAU); ctx.fill();
          break;
        }
        case K.confetti: {
          const c = Math.cos(p.rot), sn2 = Math.sin(p.rot * 1.7);
          ctx.fillStyle = p.col;
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(1, Math.abs(sn2) + 0.15);
          ctx.fillRect(-s, -s * 0.6, s * 2, s * 1.2); ctx.restore();
          void c;
          break;
        }
        case K.bubble:
          ctx.strokeStyle = p.col; ctx.lineWidth = 1.8; ctx.fillStyle = rgba(p.col, 0.35);
          ctx.beginPath(); ctx.arc(p.x, p.y, s, 0, TAU); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(p.x - s * 0.35, p.y - s * 0.35, s * 0.25, 0, TAU); ctx.fill();
          break;
        case K.plus: {
          const w = s * 0.38;
          ctx.fillStyle = INK; ctx.fillRect(p.x - s - 1.5, p.y - w - 1.5, s * 2 + 3, w * 2 + 3); ctx.fillRect(p.x - w - 1.5, p.y - s - 1.5, w * 2 + 3, s * 2 + 3);
          ctx.fillStyle = p.col; ctx.fillRect(p.x - s, p.y - w, s * 2, w * 2); ctx.fillRect(p.x - w, p.y - s, w * 2, s * 2);
          break;
        }
        case K.smoke: {
          const sp = glowSprite('#e8e0f5', 32);
          ctx.globalAlpha = a * 0.55;
          if (sp) { try { ctx.drawImage(sp, p.x - s, p.y - s, s * 2, s * 2); } catch (e) { /* stub */ } }
          else { ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(p.x, p.y, s, 0, TAU); ctx.fill(); }
          break;
        }
        case K.shard: {
          ctx.fillStyle = p.col; ctx.strokeStyle = INK; ctx.lineWidth = 1.2;
          const c = Math.cos(p.rot), sn2 = Math.sin(p.rot);
          ctx.beginPath(); ctx.moveTo(p.x + c * s * 1.3, p.y + sn2 * s * 1.3); ctx.lineTo(p.x - sn2 * s * 0.6, p.y + c * s * 0.6); ctx.lineTo(p.x - c * s, p.y - sn2 * s); ctx.closePath();
          ctx.fill(); ctx.stroke();
          break;
        }
        case K.ember: case K.snow:
          ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(p.x, p.y, s, 0, TAU); ctx.fill();
          break;
        default:
          ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(p.x, p.y, s, 0, TAU); ctx.fill();
      }
    }
    // Pops in with an overshoot, holds, fades out over the last 30%.
    function popScale(u) { return u < 0.12 ? U.ease.outBack(u / 0.12) * 1.18 : u < 0.22 ? 1.18 - (u - 0.12) / 0.1 * 0.18 : 1; }
    api.draw = (ctx) => {
      ctx.save();
      try {
        // rings and slashes under the particles
        for (let i = 0; i < gn; i++) {
          const p = rings[i];
          if (p.delay > 0) continue;
          const u = 1 - p.life / p.max, r = p.r0 + (p.r1 - p.r0) * U.ease.outCubic(u);
          ctx.globalAlpha = (1 - u) * 0.95; ctx.strokeStyle = p.col; ctx.lineWidth = Math.max(0.5, p.w * (1 - u));
          ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.1, r), 0, TAU); ctx.stroke();
        }
        for (let i = 0; i < sn; i++) {
          const p = slashes[i], u = 1 - p.life / p.max;
          const sweep = Math.min(1, u / 0.35), fade = u < 0.35 ? 1 : 1 - (u - 0.35) / 0.65;
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a);
          if (p.claw) {
            // three tapered rakes, drawn in with the sweep
            const L = p.len, e = -L / 2 + L * U.ease.outCubic(sweep);
            for (let k = -1; k <= 1; k++) {
              const oy = k * p.w * 1.5, w = p.w * (k ? 0.7 : 1);
              ctx.globalAlpha = fade * 0.5; ctx.fillStyle = p.col;
              ctx.beginPath(); ctx.moveTo(-L / 2, oy); ctx.quadraticCurveTo((e - L / 2) / 2, oy - w * 0.9, e, oy); ctx.quadraticCurveTo((e - L / 2) / 2, oy + w * 0.2, -L / 2, oy); ctx.fill();
              ctx.globalAlpha = fade; ctx.fillStyle = '#ffffff';
              ctx.beginPath(); ctx.moveTo(-L / 2 + 10, oy); ctx.quadraticCurveTo((e - L / 2) / 2, oy - w * 0.35, e - 6, oy); ctx.quadraticCurveTo((e - L / 2) / 2, oy, -L / 2 + 10, oy); ctx.fill();
            }
            ctx.restore();
            continue;
          }
          const R0 = p.len * 0.55, a0 = -1.2, a1 = a0 + 2.4 * U.ease.outCubic(sweep);
          ctx.globalAlpha = fade * 0.55; ctx.fillStyle = p.col;
          ctx.beginPath(); ctx.arc(0, R0 * 0.3, R0 + p.w * 0.6, a0, a1); ctx.arc(0, R0 * 0.3 + p.w * 0.5, R0 - p.w * 0.3, a1, a0, true); ctx.closePath(); ctx.fill();
          ctx.globalAlpha = fade; ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.arc(0, R0 * 0.3, R0, a0 + 0.15, a1); ctx.arc(0, R0 * 0.3 + p.w * 0.35, R0 - p.w * 0.15, a1, a0 + 0.15, true); ctx.closePath(); ctx.fill();
          ctx.restore();
        }
        for (let i = 0; i < rn; i++) {
          const p = trails[i], a = p.life / p.max;
          ctx.globalAlpha = a; ctx.strokeStyle = p.col; ctx.lineWidth = p.w * a; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x2, p.y2); ctx.stroke();
        }
        // normal particles, then the additive ones in one composite switch
        for (let i = 0; i < pn; i++) { const p = parts[i]; if (!ADD[p.kind]) drawPart(ctx, p, Math.min(1, p.life / p.max * 1.5)); }
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < pn; i++) { const p = parts[i]; if (ADD[p.kind]) drawPart(ctx, p, Math.min(1, p.life / p.max * 1.5)); }
        ctx.globalCompositeOperation = 'source-over';
        // flyers: the thing plus a short streak behind it
        for (let i = 0; i < fn; i++) {
          const p = flyers[i];
          if (p.delay > 0) continue;
          const u = U.ease.inOut(Math.min(1, p.t)), v = 1 - u;
          const x = v * v * p.x0 + 2 * v * u * p.cx + u * u * p.x1, y = v * v * p.y0 + 2 * v * u * p.cy + u * u * p.y1;
          ctx.globalAlpha = 0.6; ctx.strokeStyle = p.col; ctx.lineWidth = p.size * 0.9; ctx.lineCap = 'round';
          // a short streak behind it (capped: a slow frame never draws a long line)
          let dx = p.px - x, dy = p.py - y;
          const dl = Math.hypot(dx, dy);
          if (dl > 26) { dx *= 26 / dl; dy *= 26 / dl; }
          ctx.beginPath(); ctx.moveTo(x + dx, y + dy); ctx.lineTo(x, y); ctx.stroke();
          p.px = x; p.py = y;
          scratch.x = x; scratch.y = y; scratch.size = p.size; scratch.col = p.col; scratch.kind = p.kind; scratch.rot = p.t * 14;
          drawPart(ctx, scratch, 1);
        }
        ctx.globalAlpha = 1;
        ctx.font = 'bold 20px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
        for (let i = 0; i < tn; i++) {
          const p = texts[i], u = 1 - p.life / p.max;
          ctx.save();
          ctx.globalAlpha = u > 0.7 ? (1 - u) / 0.3 : 1;
          if (p.mode === 1) {
            const sc = popScale(u) * (p.size / 20);
            ctx.translate(p.x + p.ox, p.y + p.oy);
            if (p.crit) ctx.rotate(Math.sin(u * 40) * 0.12 * (1 - u));
            ctx.scale(sc, sc);
            if (p.crit) { ctx.strokeStyle = PAL.pink; ctx.lineWidth = 9; ctx.strokeText(p.str, 1.5, 2); }
            ctx.strokeStyle = INK; ctx.lineWidth = 5.5; ctx.strokeText(p.str, 0, 0);
            ctx.fillStyle = p.col; ctx.fillText(p.str, 0, 0);
            if (u < 0.1) { ctx.globalAlpha = 1 - u / 0.1; ctx.fillStyle = '#ffffff'; ctx.fillText(p.str, 0, 0); }
          } else if (p.mode === 2) {
            const sc = U.ease.outBack(Math.min(1, u * 5)) * (p.size / 15);
            ctx.translate(p.x, p.y + p.dy * U.ease.outCubic(u)); ctx.scale(sc, sc);
            ctx.font = 'bold 15px ' + FONT;
            const tw = Math.min(260, 15 * 0.6 * p.str.length + 8), w = tw + (p.icon ? 30 : 12);
            ctx.beginPath(); rrect(ctx, -w / 2, -14, w, 28, 14);
            ctx.fillStyle = 'rgba(18,9,31,0.92)'; ctx.fill(); ctx.strokeStyle = p.col; ctx.lineWidth = 2.5; ctx.stroke();
            if (p.icon) { ctx.font = 'bold 16px ' + FONT; ctx.fillStyle = '#ffffff'; ctx.fillText(p.icon, -w / 2 + 15, 1); ctx.font = 'bold 15px ' + FONT; }
            ctx.fillStyle = p.col; ctx.fillText(p.str, p.icon ? 9 : 0, 1);
          } else {
            const sc = U.ease.outBack(Math.min(1, u * 3)) * (p.size / 20);
            ctx.translate(p.x, p.y + p.dy * U.ease.outCubic(u)); ctx.scale(sc, sc);
            ctx.strokeStyle = INK; ctx.lineWidth = 5; ctx.strokeText(p.str, 0, 0);
            ctx.fillStyle = p.col; ctx.fillText(p.str, 0, 0);
          }
          ctx.restore();
        }
        ctx.globalAlpha = 1;
        drawVig(ctx, vigHoldCol, vigHold);
        drawVig(ctx, vigCol, vigA);
        if (flashA > 0) {
          ctx.globalAlpha = flashA; ctx.fillStyle = flashCol;
          const cv = ctx.canvas; ctx.fillRect(-40, -40, ((cv && cv.width) || 540) + 80, ((cv && cv.height) || 960) + 80);
        }
      } catch (e) { /* */ }
      ctx.restore();
    };
    api.count = () => pn;
    api.textCount = () => tn;
    api.ringCount = () => gn;
    api.flyCount = () => fn;
    api.slashCount = () => sn;
    api.clear = () => {
      for (let i = 0; i < fn; i++) flyers[i].cb = null;
      pn = tn = rn = gn = sn = fn = 0; trauma = 0; kx = ky = 0; flashA = 0; vigA = 0; vigHold = 0;
    };
    return api;
  })();

  /* ------------------------------------------------------------ loot */
  // Prize capsule colours by tier (common grey, uncommon cyan, rare pink,
  // legendary gold with a rainbow sheen). DESIGN.md "Loot".
  const CAP_COL = { c: '#b9b0cc', u: '#2ee6d6', r: '#ff2e88', l: '#ffc94d' };
  const CAP_RAINBOW = ['#ff2e88', '#ffc94d', '#a6ff5e', '#2ee6d6', '#9b7bff'];
  // A tiny deterministic hash in 0..1 (crack shapes stay the same every frame).
  const h01 = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
  /* A gacha capsule, centred at (x, y), radius r. st: {tier, t, rot (wobble
     angle), sq (squash, + is wide), crack 0..1 (glowing cracks spread from
     the seam), open 0..1 (the halves fly apart, light pours out), flash 0..1
     (white-hot), seed, glow (0..1 halo)}. The bottom half is solid tier
     plastic, the top a clear dome with a mystery silhouette inside. */
  function capsule(ctx, x, y, r, st) {
    st = st || {};
    const tier = CAP_COL[st.tier] ? st.tier : 'c', col = CAP_COL[tier], t = st.t || 0;
    const crack = U.clamp(st.crack || 0, 0, 1), open = U.clamp(st.open || 0, 0, 1), flash = U.clamp(st.flash || 0, 0, 1);
    const sq = st.sq || 0, seed = st.seed || 1;
    ctx.save();
    try {
      ctx.translate(x, y);
      if (st.glow) glow(ctx, 0, 0, r * 2.1, col, U.clamp(st.glow, 0, 1) * (0.55 + 0.15 * Math.sin(t * 4)));
      if (open > 0) glow(ctx, 0, 0, r * (1.4 + open * 2.2), '#ffffff', (1 - open) * 0.9 + 0.2);
      ctx.rotate(st.rot || 0);
      ctx.scale(1 + sq, 1 - sq);
      const lw = Math.max(2, r * 0.07);
      // ---- bottom half (solid plastic)
      ctx.save();
      ctx.translate(-open * r * 0.25, open * r * 0.9);
      ctx.rotate(open * 0.5);
      ctx.globalAlpha = 1 - open * open;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI); ctx.closePath();
      F(ctx, col); ctx.fill();
      if (tier === 'l' && !FLAT) {
        // the legendary rainbow sheen sweeps across the plastic
        ctx.save(); ctx.clip();
        ctx.globalAlpha *= 0.55;
        for (let i = 0; i < 5; i++) {
          const bx = -r * 1.6 + (((t * 0.6 + i * 0.2) % 1) * r * 3.2);
          ctx.fillStyle = CAP_RAINBOW[i]; ctx.beginPath(); ctx.moveTo(bx, 0); ctx.lineTo(bx + r * 0.22, 0); ctx.lineTo(bx - r * 0.3, r); ctx.lineTo(bx - r * 0.52, r); ctx.closePath(); ctx.fill();
        }
        ctx.restore();
      }
      F(ctx, 'rgba(0,0,0,0.22)'); ctx.beginPath(); ctx.arc(0, 0, r, 0.15, Math.PI * 0.62); ctx.arc(-r * 0.1, -r * 0.05, r * 0.92, Math.PI * 0.62, 0.15, true); ctx.closePath(); ctx.fill();
      F(ctx, 'rgba(255,255,255,0.28)'); ctx.beginPath(); ctx.ellipse(-r * 0.45, r * 0.32, r * 0.2, r * 0.1, -0.5, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI); ctx.closePath(); S(ctx, INK, lw); ctx.stroke();
      ctx.restore();
      // ---- top half (clear dome with a mystery prize inside)
      ctx.save();
      ctx.translate(open * r * 0.55, -open * r * 1.7);
      ctx.rotate(-open * 1.3);
      ctx.globalAlpha = 1 - open * open;
      ctx.beginPath(); ctx.arc(0, 0, r, Math.PI, TAU); ctx.closePath();
      F(ctx, rgba(col, 0.22)); ctx.fill();
      if (open < 0.2) {
        // the prize silhouette bobbing inside (a lumpy shadow and a '?')
        ctx.save(); ctx.clip();
        F(ctx, 'rgba(18,9,31,0.55)'); ctx.beginPath(); ctx.ellipse(0, -r * 0.18 + Math.sin(t * 3) * r * 0.04, r * 0.42, r * 0.34, 0.2, 0, TAU); ctx.fill();
        txt(ctx, '?', 0, -r * 0.22 + Math.sin(t * 3) * r * 0.04, Math.max(8, r * 0.5), rgba(col, 0.95), true);
        ctx.restore();
      }
      F(ctx, 'rgba(255,255,255,0.5)'); ctx.beginPath(); ctx.ellipse(-r * 0.42, -r * 0.55, r * 0.26, r * 0.13, -0.7, 0, TAU); ctx.fill();
      F(ctx, 'rgba(255,255,255,0.8)'); ctx.beginPath(); ctx.arc(-r * 0.6, -r * 0.34, r * 0.06, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(0, 0, r, Math.PI, TAU); ctx.closePath(); S(ctx, INK, lw); ctx.stroke();
      ctx.restore();
      if (open < 0.05) {
        // ---- the seam band with its clasp
        F(ctx, shade(col, 0.55)); ctx.beginPath(); rrect(ctx, -r * 1.02, -r * 0.09, r * 2.04, r * 0.18, r * 0.09); ctx.fill();
        S(ctx, INK, lw * 0.7); ctx.stroke();
        F(ctx, '#ffffff'); ctx.beginPath(); rrect(ctx, -r * 0.14, -r * 0.13, r * 0.28, r * 0.26, r * 0.06); ctx.fill(); S(ctx, INK, lw * 0.6); ctx.stroke();
      }
      // ---- cracks: jagged glowing lines spreading from the seam
      if (crack > 0 && open < 0.05 && !FLAT) {
        const n = Math.ceil(crack * 7);
        ctx.lineJoin = 'round';
        for (let k = 0; k < n; k++) {
          const a0 = (k / 7) * TAU + h01(seed, k) * 0.6, len = r * (0.35 + crack * 0.65) * (0.6 + h01(k, seed) * 0.5);
          let px = Math.cos(a0) * r * 0.2, py = Math.sin(a0) * r * 0.08 + (k % 2 ? r * 0.08 : -r * 0.08);
          const pts = [px, py];
          for (let s = 1; s <= 4; s++) {
            const a = a0 + (h01(seed + s, k) - 0.5) * 1.1, d = len / 4;
            px += Math.cos(a) * d; py += Math.sin(a) * d;
            const m = Math.hypot(px, py); if (m > r * 0.94) { px *= r * 0.94 / m; py *= r * 0.94 / m; }
            pts.push(px, py);
          }
          for (let pass = 0; pass < 2; pass++) {
            ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
            for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
            if (pass === 0) { S(ctx, rgba(tier === 'c' ? '#ffffff' : col, 0.75), lw * 1.6); } else { S(ctx, '#ffffff', lw * 0.55); }
            ctx.stroke();
          }
        }
        glow(ctx, 0, 0, r * (0.6 + crack * 0.8), col, crack * 0.7);
      }
      if (flash > 0 && !FLAT) {
        ctx.globalAlpha = flash;
        F(ctx, '#ffffff'); ctx.beginPath(); ctx.arc(0, 0, r * 1.04, 0, TAU); ctx.fill();
      }
    } catch (e) { /* */ }
    ctx.restore();
  }
  /* One arcade ticket (w x h, turned by a): paper in col with notched ends,
     a perforation and a star stamp. */
  function ticket(ctx, x, y, w, h, a, col) {
    ctx.save();
    try {
      ctx.translate(x, y); ctx.rotate(a || 0);
      const c = col || '#ff9ec7', hw = w / 2, hh = h / 2, n = Math.min(hh * 0.45, 3.5);
      ctx.beginPath();
      ctx.moveTo(-hw, -hh); ctx.lineTo(hw, -hh); ctx.lineTo(hw, -n); ctx.arc(hw, 0, n, -Math.PI / 2, Math.PI / 2, true);
      ctx.lineTo(hw, hh); ctx.lineTo(-hw, hh); ctx.lineTo(-hw, n); ctx.arc(-hw, 0, n, Math.PI / 2, -Math.PI / 2, true); ctx.closePath();
      F(ctx, c); ctx.fill();
      S(ctx, shade(c, 0.5), 1); ctx.stroke();
      F(ctx, shade(c, 0.72)); ctx.fillRect(-hw * 0.62, -hh * 0.55, hw * 0.12, hh * 1.1);
      F(ctx, '#ffffff'); ctx.beginPath(); star(ctx, hw * 0.2, 0, Math.min(hh * 0.62, hw * 0.35), 5, 0.45); ctx.fill();
    } catch (e) { /* */ }
    ctx.restore();
  }

  /* A four-point glint that sweeps over rare items now and then: visible for
     the first 0.35 of each period (seeded so items do not blink together). */
  function glint(ctx, x, y, r, t, seed, col) {
    const per = 2.6, ph = ((t + (seed || 0) * 0.37) % per) / per;
    if (ph > 0.35) return;
    const u = ph / 0.35, s = Math.sin(u * Math.PI) * Math.max(4, r * 0.5);
    const gx = x - r * 0.5 + r * u, gy = y - r * 0.5 + r * 0.3 * u;
    ctx.save();
    try {
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, gx, gy, s * 2.2, col || '#ffffff', 0.6);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(gx, gy - s); ctx.lineTo(gx + s * 0.18, gy - s * 0.18); ctx.lineTo(gx + s, gy); ctx.lineTo(gx + s * 0.18, gy + s * 0.18);
      ctx.lineTo(gx, gy + s); ctx.lineTo(gx - s * 0.18, gy + s * 0.18); ctx.lineTo(gx - s, gy); ctx.lineTo(gx - s * 0.18, gy - s * 0.18); ctx.closePath();
      ctx.fill();
    } catch (e) { /* */ }
    ctx.restore();
  }

  /* Persistent status looks around an enemy (stage space, feet at (x, y),
     body w x h). layer 'back' draws behind the sprite (the strength aura,
     the thorns ring), 'front' over it (poison drips, burn embers, frost
     crystals, weak / vuln / stun marks, bleed drops). Pure function of t. */
  function enemyAura(ctx, x, y, w, h, status, t, layer) {
    if (!status) return;
    ctx.save();
    try {
      t = t || 0;
      const cx = x, cy = y - h * 0.5;
      if (layer === 'back') {
        if (status.str > 0 || status.enrage > 0) {
          const pul = 0.75 + Math.sin(t * 5) * 0.25;
          glow(ctx, cx, cy, Math.max(w, h) * 0.75, '#ff2e30', 0.55 * pul);
          ctx.globalAlpha = 0.5 * pul; S(ctx, '#ff5a4a', 2);
          for (let i = 0; i < 6; i++) {
            const a = i / 6 * TAU + t * 0.8, px = cx + Math.cos(a) * w * 0.55, py = y - ((t * 60 + i * 23) % (h * 0.9));
            ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py - 10); ctx.stroke();
          }
          ctx.globalAlpha = 1;
        }
        if (status.thorns > 0) {
          const n = 14, R = Math.max(w * 0.58, 34), ry = R * 0.32;
          ctx.fillStyle = '#c98a1a'; S(ctx, INK, 1.5);
          for (let i = 0; i < n; i++) {
            const a = i / n * TAU + t * 0.4, ex = x + Math.cos(a) * R, ey = y + Math.sin(a) * ry, sp = 7 + Math.sin(t * 4 + i) * 1.5;
            ctx.beginPath(); ctx.moveTo(ex - 4, ey); ctx.lineTo(ex, ey - sp); ctx.lineTo(ex + 4, ey); ctx.closePath(); ctx.fill(); ctx.stroke();
          }
        }
        if (status.shield_up > 0 || status.armor > 0) {
          ctx.globalAlpha = 0.35 + Math.sin(t * 3) * 0.1;
          ctx.beginPath(); ctx.ellipse(cx, cy, w * 0.62, h * 0.62, 0, 0, TAU);
          S(ctx, '#8fb6ff', 3); ctx.stroke(); ctx.globalAlpha = 1;
        }
      } else {
        if (status.chill > 0 && !(status.freeze > 0)) {
          const a = 0.35 + Math.sin(t * 2) * 0.1;
          glow(ctx, cx, cy, Math.max(w, h) * 0.55, '#9fe4ff', a);
          ctx.fillStyle = '#e8f8ff';
          for (let i = 0; i < 5; i++) {
            const ph = (t * 0.35 + i * 0.21) % 1, px = cx - w * 0.45 + ((i * 37) % 100) / 100 * w * 0.9, py = y - h + ph * h;
            ctx.globalAlpha = Math.sin(ph * Math.PI) * 0.9; ctx.beginPath(); ctx.arc(px, py, 2.2, 0, TAU); ctx.fill();
          }
          ctx.globalAlpha = 1;
        }
        if (status.freeze > 0) {
          for (let i = 0; i < 3; i++) {
            const px = cx - w * 0.35 + i * w * 0.35, py = cy - h * 0.2 + (i % 2) * h * 0.3, s = 7 + (i % 2) * 3;
            glint(ctx, px, py, s * 2, t, i * 3.1, '#bfe8ff');
          }
        }
        if (status.poison > 0) {
          for (let i = 0; i < 3; i++) {
            const ph = (t * 0.8 + i * 0.33) % 1, px = cx + (i - 1) * w * 0.28, py = y - h * 0.15 - ph * h * 0.5;
            ctx.globalAlpha = Math.sin(ph * Math.PI) * 0.9;
            ctx.beginPath(); ctx.arc(px, py, 3 + ph * 3, 0, TAU); F(ctx, rgba(PAL.lime, 0.4)); ctx.fill(); S(ctx, PAL.lime, 1.5); ctx.stroke();
          }
          ctx.globalAlpha = 1;
        }
        if (status.burn > 0) {
          ctx.globalCompositeOperation = 'lighter';
          for (let i = 0; i < 6; i++) {
            const ph = (t * 1.3 + i * 0.17) % 1, px = cx + Math.sin(i * 2.3 + t * 3) * w * 0.35, py = y - ph * h * 1.05;
            ctx.globalAlpha = (1 - ph) * 0.9; ctx.fillStyle = i % 2 ? '#ffe066' : '#ff8a2b';
            ctx.beginPath(); ctx.arc(px, py, 2.6 * (1 - ph) + 1, 0, TAU); ctx.fill();
          }
          ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
        }
        if (status.bleed > 0) {
          for (let i = 0; i < 2; i++) {
            const ph = (t * 1.1 + i * 0.5) % 1, px = cx + (i ? 0.2 : -0.15) * w, py = cy + ph * h * 0.5;
            ctx.globalAlpha = 1 - ph; ctx.fillStyle = '#d81f3a';
            ctx.beginPath(); ctx.moveTo(px, py - 5); ctx.quadraticCurveTo(px + 3.5, py, px, py + 3); ctx.quadraticCurveTo(px - 3.5, py, px, py - 5); ctx.fill();
          }
          ctx.globalAlpha = 1;
        }
        if (status.stun > 0) {
          for (let i = 0; i < 3; i++) {
            const a = t * 3 + i * TAU / 3, px = cx + Math.cos(a) * w * 0.3, py = y - h - 6 + Math.sin(a) * 6;
            tone(ctx, c => star(c, px, py, 6, 5, 0.45), '#ffe066', px, py, 6, { ol: 1.5, spec: false });
          }
        }
        // weak / vuln marks pulse at the shoulder
        let mx = cx + w * 0.42;
        const mark = (label, col) => {
          const pul = 1 + Math.sin(t * 6) * 0.12;
          ctx.save(); ctx.translate(mx, y - h * 0.8); ctx.scale(pul, pul);
          ctx.beginPath(); ctx.arc(0, 0, 9, 0, TAU); F(ctx, shade(col, -0.5)); ctx.fill(); S(ctx, col, 2); ctx.stroke();
          txt(ctx, label, 0, 0.5, 11, col, true, 'center', INK);
          ctx.restore();
          mx += 16;
        };
        if (status.vuln > 0) mark('V', PAL.pink);
        if (status.weak > 0) mark('W', '#b3a4d6');
      }
    } catch (e) { /* */ }
    ctx.restore();
  }

  return {
    item, itemFx, shard, enemy, enemyBox, cabinet, cabinetBack, cabinetFront, claw, clawHead, bodyDebug, hex, mapBg, mapAxis, mapPath, mapRoad, crawler, bg, hpBar, statusPips, intent,
    terrainHex, terrainFill, biomePal, groundOf, lightRim, bulb, mapCompass, mapHeader, mapArrow, BIOME_PAL, DARK,
    portrait, relicIcon, title, fx, flames, glint, enemyAura, RARITY_COL,
    belly, affixAura, affixBadges, binMark, wrench, rageCrown,
    capsule, ticket, CAP_COL,
    ITEM_KEYS, ENEMY_KEYS, ITEM_DEFAULT, PAL, shade, rgba, glowSprite,
  };
})();
