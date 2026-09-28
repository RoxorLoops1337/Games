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
  // Enemy life (BESTIARY block): RENDER.enemy sets these per draw (the blink,
  // the fidget, the wrench spin) and clears them after, so every other eye
  // and art stays as it was.
  const LIFE = { blink: 0, fid: 0, fk: 0, spin: 0, kind: '', boss: false, hpk: 1, sd: 0 };
  // Cartoon eye: white with ink rim and a pupil that looks toward (lx,ly).
  // Mid-blink (LIFE.blink) it is a shut lid: one curved ink stroke.
  function eye(ctx, x, y, r, lx, ly, col) {
    if (LIFE.blink > 0.45) { ctx.beginPath(); ctx.moveTo(x - r, y); ctx.quadraticCurveTo(x, y + r * 0.75, x + r, y); S(ctx, INK, Math.max(1.5, r * 0.42)); ctx.stroke(); return; }
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
  // ---- round 3: Lucky Lou's casino kit and the monster bait
  // A casino chip: a disc with a ring of edge stripes and an inlay.
  IA.chip = (ctx, w, h, c1, c2) => {
    const r = Math.min(w, h) / 2;
    tone(ctx, c => circ(c, 0, 0, r), c1, 0, 0, r, { dark: -0.3, spec: false });
    F(ctx, c2);
    for (let i = 0; i < 8; i++) {
      const a = i * TAU / 8;
      ctx.beginPath(); ctx.arc(0, 0, r - 1.5, a - 0.2, a + 0.2); ctx.arc(0, 0, r * 0.7, a + 0.16, a - 0.16, true); ctx.closePath(); ctx.fill();
    }
    ctx.beginPath(); circ(ctx, 0, 0, r * 0.52); F(ctx, shade(c1, 0.18)); ctx.fill(); S(ctx, c2, Math.max(1, r * 0.09)); ctx.stroke();
    F(ctx, c2); ctx.beginPath(); star(ctx, 0, 0, r * 0.28, 4, 0.45); ctx.fill();
    ctx.beginPath(); circ(ctx, 0, 0, r); S(ctx, INK, OL); ctx.stroke();
  };
  // A playing card (or a deck of them) standing up: a border, a panel, a diamond.
  IA.card = (ctx, w, h, c1, c2) => {
    const hw = w / 2, hh = h / 2, r = Math.min(hw, hh) * 0.28;
    tone(ctx, c => rrect(c, -hw, -hh, w, h, r), c1, 0, 0, Math.max(hw, hh), { dark: -0.22 });
    ctx.beginPath(); rrect(ctx, -hw * 0.72, -hh * 0.8, hw * 1.44, hh * 1.6, r * 0.6); F(ctx, c2); ctx.fill();
    F(ctx, c1);
    ctx.beginPath(); poly(ctx, [0, -hh * 0.46, hw * 0.4, 0, 0, hh * 0.46, -hw * 0.4, 0]); ctx.fill();
    ctx.beginPath(); circ(ctx, -hw * 0.46, -hh * 0.6, Math.max(1.2, hw * 0.1)); circ(ctx, hw * 0.46, hh * 0.6, Math.max(1.2, hw * 0.1)); ctx.fill();
  };
  // A horseshoe, points up (the luck stays in), nail holes and gold caulks.
  IA.horseshoe = (ctx, w, h, c1, c2) => {
    const hw = w / 2, hh = h / 2, R = Math.min(hw, hh) * 0.98, t = R * 0.38, cy = hh - R;
    tone(ctx, c => {
      c.moveTo(-R, -hh); c.lineTo(-R, cy); c.arc(0, cy, R, Math.PI, 0, true); c.lineTo(R, -hh);
      c.lineTo(R - t, -hh); c.lineTo(R - t, cy); c.arc(0, cy, R - t, 0, Math.PI, false); c.lineTo(-R + t, -hh); c.closePath();
    }, c1, 0, cy, R, { dark: -0.32 });
    F(ctx, INK);
    const m = R - t / 2;
    ctx.beginPath();
    for (const a of [0.12, 0.32, 0.68, 0.88]) circ(ctx, Math.cos(a * Math.PI) * m, cy + Math.sin(a * Math.PI) * m, Math.max(0.9, t * 0.14));
    ctx.fill();
    for (const s of [-1, 1]) tone(ctx, c => rrect(c, s * (R - t / 2) - t * 0.55, -hh - 1, t * 1.1, t * 0.7, 1.5), c2, s * (R - t / 2), -hh, t * 0.6, { ol: 1.5, spec: false });
  };
  // A four-leaf clover on a curled stem.
  IA.clover = (ctx, w, h, c1, c2) => {
    const r = Math.min(w, h) / 2, lr = r * 0.44, o = lr * 0.78;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(r * 0.35, r * 0.6, r * 0.2, r); S(ctx, c2, Math.max(1.5, r * 0.16)); ctx.stroke();
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) tone(ctx, c => circ(c, dx * o, dy * o, lr), c1, dx * o, dy * o, lr, { spec: false, ol: 1.5 });
    F(ctx, shade(c1, 0.45)); ctx.beginPath(); circ(ctx, 0, 0, lr * 0.4); ctx.fill();
  };
  // A tabletop slot machine: a dome, three reels of sevens and a lever.
  IA.slot = (ctx, w, h, c1, c2) => {
    const hw = w / 2, hh = h / 2, bx = hw * 0.72;
    ctx.beginPath(); ctx.moveTo(bx - 1, -hh * 0.05); ctx.lineTo(hw * 0.92, -hh * 0.62); S(ctx, INK, 3.4); ctx.stroke(); S(ctx, '#c9d3e0', 1.8); ctx.stroke();
    tone(ctx, c => circ(c, hw * 0.92, -hh * 0.66, Math.max(2.4, hw * 0.16)), c2, hw * 0.92, -hh * 0.66, hw * 0.16, { ol: 1.5 });
    tone(ctx, c => rrect(c, -hw, -hh * 0.72, hw + bx, hh * 1.72, 4), c1, 0, 0, Math.max(hw, hh), { dark: -0.3 });
    tone(ctx, c => { c.moveTo(-hw * 0.8, -hh * 0.72); c.quadraticCurveTo((bx - hw) / 2, -hh * 1.12, bx * 0.8 + 0.1, -hh * 0.72); c.closePath(); }, c2, 0, -hh * 0.8, hw * 0.6, { ol: 1.5, spec: false });
    const wx = -hw * 0.78, ww = hw * 0.78 + bx * 0.84, wy = -hh * 0.4, wh = hh * 0.56;
    ctx.beginPath(); rrect(ctx, wx, wy, ww, wh, 2); F(ctx, '#fff8ec'); ctx.fill(); S(ctx, INK, 1.5); ctx.stroke();
    const rw = ww / 3;
    for (let i = 0; i < 3; i++) txt(ctx, '7', wx + rw * (i + 0.5), wy + wh / 2 + 0.5, Math.max(6, wh * 0.8), '#ff2e4a', true, 'center');
    ctx.beginPath(); ctx.moveTo(wx + rw, wy); ctx.lineTo(wx + rw, wy + wh); ctx.moveTo(wx + rw * 2, wy); ctx.lineTo(wx + rw * 2, wy + wh); S(ctx, rgba(INK, 0.5), 1); ctx.stroke();
    F(ctx, INK); ctx.beginPath(); rrect(ctx, -hw * 0.5, hh * 0.45, hw * 0.5 + bx * 0.5, hh * 0.16, 1); ctx.fill();
  };
  // A lumpy potato with eyes, steaming hot.
  IA.potato = (ctx, w, h, c1, c2) => {
    const hw = w / 2, hh = h / 2;
    tone(ctx, c => { c.moveTo(-hw, 0); c.bezierCurveTo(-hw, -hh * 1.1, hw * 0.2, -hh * 1.1, hw * 0.9, -hh * 0.5); c.bezierCurveTo(hw * 1.1, 0, hw * 0.7, hh, 0, hh * 0.95); c.bezierCurveTo(-hw * 0.6, hh, -hw, hh * 0.5, -hw, 0); c.closePath(); }, c1, 0, 0, Math.max(hw, hh), { dark: -0.3 });
    F(ctx, shade(c1, -0.45)); ctx.beginPath(); circ(ctx, -hw * 0.45, -hh * 0.15, 1.4); circ(ctx, hw * 0.2, hh * 0.35, 1.2); circ(ctx, hw * 0.5, -hh * 0.3, 1.1); ctx.fill();
    ctx.beginPath();
    for (const x of [-hw * 0.3, hw * 0.12]) { ctx.moveTo(x, -hh * 0.25); ctx.quadraticCurveTo(x + 3, -hh * 0.55, x, -hh * 0.85); }
    S(ctx, rgba(c2, 0.9), 1.7); ctx.stroke();
  };
  // A two-tone capsule pill.
  IA.pill = (ctx, w, h, c1, c2) => {
    const hw = w / 2, hh = h / 2, r = Math.min(hw, hh);
    ctx.save(); ctx.beginPath(); rrect(ctx, -hw, -hh, w, h, r); ctx.clip();
    F(ctx, c1); ctx.fillRect(-hw, -hh, hw, h); F(ctx, c2); ctx.fillRect(0, -hh, hw, h);
    F(ctx, rgba('#ffffff', 0.45)); ctx.fillRect(-hw * 0.8, -hh * 0.62, w * 0.8, hh * 0.36);
    ctx.restore();
    ctx.beginPath(); ctx.moveTo(0, -hh); ctx.lineTo(0, hh); S(ctx, INK, 1.5); ctx.stroke();
    ctx.beginPath(); rrect(ctx, -hw, -hh, w, h, r); S(ctx, INK, OL); ctx.stroke();
  };
  // A fortune cookie with the slip poking out.
  IA.cookie = (ctx, w, h, c1, c2) => {
    const hw = w / 2, hh = h / 2;
    tone(ctx, c => { c.moveTo(-hw, hh * 0.3); c.quadraticCurveTo(-hw * 0.8, -hh * 1.1, 0, -hh * 0.9); c.quadraticCurveTo(hw * 0.8, -hh * 1.1, hw, hh * 0.3); c.quadraticCurveTo(hw * 0.3, hh * 0.2, 0, hh); c.quadraticCurveTo(-hw * 0.3, hh * 0.2, -hw, hh * 0.3); c.closePath(); }, c1, 0, 0, Math.max(hw, hh), { dark: -0.28 });
    ctx.beginPath(); ctx.moveTo(0, -hh * 0.85); ctx.quadraticCurveTo(-hw * 0.1, hh * 0.1, 0, hh * 0.95); S(ctx, shade(c1, -0.35), 1.5); ctx.stroke();
    ctx.beginPath(); rrect(ctx, hw * 0.1, hh * 0.02, hw * 0.78, hh * 0.3, 1); F(ctx, c2); ctx.fill(); S(ctx, INK, 1); ctx.stroke();
    F(ctx, '#ff2e4a'); ctx.beginPath(); circ(ctx, hw * 0.3, hh * 0.17, Math.max(0.8, hh * 0.06)); circ(ctx, hw * 0.5, hh * 0.17, Math.max(0.8, hh * 0.06)); ctx.fill();
  };
  // Unknown art key: a labelled crate. Never throws, always visible.
  IA.crate = (ctx, w, h, c1, c2, label) => {
    const hw = w / 2, hh = h / 2;
    tone(ctx, c => rrect(c, -hw, -hh, w, h, 2), c1 || '#b07a3c', 0, 0, Math.max(hw, hh), { dark: -0.3 });
    ctx.beginPath(); ctx.moveTo(-hw, -hh); ctx.lineTo(hw, hh); ctx.moveTo(hw, -hh); ctx.lineTo(-hw, hh); S(ctx, c2 || shade(c1 || '#b07a3c', -0.4), 2); ctx.stroke();
    if (label) txt(ctx, String(label).slice(0, 6), 0, 0, Math.max(6, Math.min(10, h * 0.4)), '#fff', true, 'center', true);
  };
  const ITEM_KEYS = ['sword', 'dagger', 'axe', 'hammer', 'anvil', 'shield', 'buckler', 'potion', 'flask', 'bomb', 'torch', 'iceshard', 'snowball', 'coin', 'gem', 'rock', 'slag', 'iceblock', 'apple', 'bread', 'book', 'scroll', 'orb', 'ring', 'key', 'chain', 'horn', 'whetstone', 'feather', 'skull', 'star', 'boot', 'bone', 'bottle', 'heart', 'lantern', 'wand', 'mask', 'egg', 'dice',
    'chip', 'card', 'horseshoe', 'clover', 'slot', 'potato', 'pill', 'cookie'];
  const ITEM_DEFAULT = { chip: ['#ff2e4a', '#ffffff'], card: ['#3b6fd6', '#ffffff'], horseshoe: ['#aab3bd', '#ffc94d'], clover: ['#3ddc84', '#1a6b3a'],
    slot: ['#ff2e4a', '#ffc94d'], potato: ['#c98a4a', '#ff5a2e'], pill: ['#a6ff5e', '#ff2e88'], cookie: ['#e8b25e', '#fff6e0'], sword: ['#c9d3e0', '#8a5a2b'], dagger: ['#c9d3e0', '#4a3a6a'], axe: ['#c9d3e0', '#8a5a2b'], hammer: ['#8e98a8', '#8a5a2b'], anvil: ['#5a6373', '#c9d3e0'], shield: ['#3b6fd6', '#ffc94d'], buckler: ['#8e98a8', '#ffc94d'], potion: ['#ff2e88', '#8a5a2b'], flask: ['#a6ff5e', '#8a5a2b'], bomb: ['#2b2340', '#ffc94d'], torch: ['#ff8a2b', '#8a5a2b'], iceshard: ['#9fe4ff', '#ffffff'], snowball: ['#f4f8ff', '#9fc8e8'], coin: ['#ffc94d', '#c98a1a'], gem: ['#2ee6d6', '#ffffff'], rock: ['#8e8a86', '#5a5652'], slag: ['#3a2f2f', '#ff8a2b'], iceblock: ['#bfe8ff', '#ffffff'], apple: ['#ff5a4a', '#a6ff5e'], bread: ['#d9a05b', '#8a5a2b'], book: ['#7a3b9c', '#ffc94d'], scroll: ['#f4ecd6', '#8a5a2b'], orb: ['#7a3bff', '#2ee6d6'], ring: ['#ffc94d', '#ff2e88'], key: ['#ffc94d', '#12091f'], chain: ['#8e98a8', '#5a6373'], horn: ['#f1e2c6', '#ffc94d'], whetstone: ['#7f8896', '#3a3f4a'], feather: ['#f4f8ff', '#8e98a8'], skull: ['#f1e9d6', '#12091f'], star: ['#ffc94d', '#ffffff'], boot: ['#8a5a2b', '#5a3a1b'], bone: ['#f1e9d6', '#c9b89a'], bottle: ['#2e8f5a', '#f4ecd6'], heart: ['#ff5a4a', '#ffffff'], lantern: ['#5a6373', '#ffc94d'], wand: ['#ffc94d', '#8a5a2b'], mask: ['#f4ecd6', '#12091f'], egg: ['#f4f8ff', '#8e98a8'], dice: ['#f4f8ff', '#12091f'] };

  const ORIENT = { sword: 'h', dagger: 'h', axe: 'h', hammer: 'h', wand: 'h', key: 'h', chain: 'h', bone: 'h', feather: 'h', scroll: 'h', whetstone: 'h', iceshard: 'h', torch: 'v', potion: 'v', flask: 'v', bottle: 'v', lantern: 'v', egg: 'v', book: 'v', boot: 'v', pill: 'h', card: 'v', slot: 'v' };
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
      const dflt = ITEM_DEFAULT[key] || ITEM_DEFAULT.rock;
      const c1 = def.color || dflt[0], c2 = def.color2 || dflt[1];
      const R = Math.max(w, h) / 2;
      const img = artImg('itemId', def.id) || artImg('item', key);
      ctx.translate(x || 0, y || 0);
      if (opts.alpha != null) ctx.globalAlpha = opts.alpha;
      if (opts.glow) glow(ctx, 0, 0, R * 1.8 * s, opts.glow === true ? PAL.gold : opts.glow, opts.glowA == null ? 0.9 : opts.glowA);
      ctx.rotate(angle || 0);
      // the art is static: blit the cached sprite when there is one
      const spr = itemSprite(ctx, def, s, opts, w, h, c1, c2, img);
      if (spr) { ctx.scale(s / spr.q, s / spr.q); ctx.drawImage(spr.cv, -spr.cx, -spr.cy); return; }
      ctx.scale(s, s);
      itemArt(ctx, def, opts, w, h, c1, c2, img);
    } catch (e) { /* art must never throw */ }
    finally { ctx.restore(); }
  }
  /* Item sprites (Polish and QA perf): an item's art never changes with
     time, so each (def, plus, frozen, device scale bucket) is drawn once on
     an offscreen canvas and blitted after that, instead of a dozen clipped
     paths per item per frame. The scale bucket is the live transform's
     scale x the item scale, rounded up to a quarter, so the sprite is never
     drawn larger than it was rendered. No canvas (headless), a flat-colour
     pass, a huge scale or a full cache: the live path. */
  const ITEM_SPR = new WeakMap();
  const ITEM_SPR_MAX = 700;
  let itemSprN = 0;
  function itemSprite(ctx, def, s, opts, w, h, c1, c2, img) {
    if (FLAT || typeof document === 'undefined' || !document || !document.createElement || typeof ctx.getTransform !== 'function') return null;
    let m = null;
    try { m = ctx.getTransform(); } catch (e) { m = null; }
    if (!m || !(Math.abs(m.a) + Math.abs(m.b) > 0)) return null;
    const q = Math.ceil(Math.hypot(m.a, m.b) * s * 4) / 4;
    if (!(q > 0) || q > 5) return null;
    const vk = (opts.plus ? 1 : 0) + (opts.frozen ? 2 : 0) + (img ? 4 : 0) + q * 32 + (opts.hc && !img ? 1000 : 0);   // ACCESS: the high-contrast rim is its own sprite
    let V = ITEM_SPR.get(def);
    if (!V) { V = {}; ITEM_SPR.set(def, V); }
    let sp = V[vk];
    // dk: the POLISH identity layer (decals, silhouette, rim) the sprite was drawn with
    const dk = img ? '' : polInfo(def).key;
    if (sp && sp.w === w && sp.h === h && sp.c1 === c1 && sp.c2 === c2 && sp.dk === dk) return sp;
    if (sp && sp.dk !== dk) sp = undefined;   // the identity layer changed: draw it again
    if (sp === null || itemSprN >= ITEM_SPR_MAX) return null;
    // a tight box: the art's w x h plus room for the outline, the gold rim,
    // the plus star on the corner and the ice block (a blit costs its area)
    const pad = 10;
    const pw = Math.ceil((w + pad * 2) * q) + 2, ph = Math.ceil((h + pad * 2) * q) + 2;
    let cv = null, g = null;
    try { cv = document.createElement('canvas'); cv.width = pw; cv.height = ph; g = cv.getContext && cv.getContext('2d'); } catch (e) { g = null; }
    if (!g || typeof g.getTransform !== 'function') { V[vk] = null; return null; }
    g.translate(pw / 2, ph / 2); g.scale(q, q);
    try { itemArt(g, def, opts, w, h, c1, c2, img); } catch (e) { /* art must never throw */ }
    if (!V[vk]) itemSprN++;
    sp = { cv, cx: pw / 2, cy: ph / 2, q, w, h, c1, c2, dk };
    V[vk] = sp;
    return sp;
  }
  // The item's own drawing, in a w x h box at the origin (scaled already).
  function itemArt(ctx, def, opts, w, h, c1, c2, img) {
    const key = def.art;
    // POLISH (round 5): the item's own silhouette when it has one (a PNG still wins)
    const pi = img ? null : polInfo(def);
    const fn = (pi && pi.sil) || (IA[key] && key !== 'crate' ? IA[key] : null);
    const R = Math.max(w, h) / 2;
    {
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      if (opts.plus) {
        // gold rim behind the ink outline
        ctx.beginPath(); rrect(ctx, -w / 2 - 2, -h / 2 - 2, w + 4, h + 4, Math.min(w, h) * 0.35);
        S(ctx, rgba(PAL.gold, 0.85), 3); ctx.stroke();
      }
      // Long items have a natural orientation; a vertical sword body gets
      // the horizontal drawing rotated to stand up (and vice versa).
      const nat = (pi && pi.sil) ? (POL_ORIENT[def.id] || ORIENT[key]) : ORIENT[key];
      const body = () => {
        if (nat === 'h' && h > w * 1.15) { ctx.rotate(-Math.PI / 2); if (fn) fn(ctx, h, w, c1, c2); }
        else if (nat === 'v' && w > h * 1.15) { ctx.rotate(Math.PI / 2); if (fn) fn(ctx, h, w, c1, c2); }
        else if (fn) fn(ctx, w, h, c1, c2);
        else IA.crate(ctx, w, h, def.color, def.color2, key || def.id || '?');
      };
      if (opts.hc && !img) accRim(ctx, body);   // ACCESS: a thick dark rim and a light halo (items in the bin)
      if (pi && pi.rim) polRim(ctx, pi, body);
      ctx.save();
      if (img) itemImage(ctx, img, def.shape, w, h);
      else body();
      ctx.restore();
      if (pi && pi.decals.length) polDecals(ctx, def, pi, w, h, c1, c2);
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
    }
  }

  /* ================================== POLISH (round 5): item identity */
  // About 130 items share 48 art keys, so two flasks differed only by
  // colour. Three layers give each its own face, all drawn into the item
  // sprite (RENDER.item caches per def, plus, frozen, scale and this key):
  //  - a silhouette of its own for the starters, the bags and the rares
  //    (POL_SIL, same bounds as the physics shape),
  //  - decals read off the keywords: a skull stamp for poison, flame licks
  //    for fire, frost rime and a snowflake for frost, glass glints, a rune
  //    for magic (echo), dice pips for luck, a coin stamp for greed; at most
  //    two (one on a small item), plus a star on a legendary. POL_DECAL[id]
  //    overrides the pick. Glass gets glints, not cracks: cracks already
  //    mean "cracked in the bin, plays for +50%".
  //  - a rarity rim light (uncommon cyan, rare gold, legendary pink + gold).
  // A PNG override (art.js) replaces all three. RENDER.pol.on = false turns
  // the layer off (the before / after comparison), which re-keys the sprites.
  const POL = { on: true, v: 1, stats: { sil: 0, decal: 0, rim: 0, badge: 0 } };
  const POL_INFO = new WeakMap();
  const POL_OFF = { key: 'off', decals: [], sil: null, rim: null };
  const POL_RIM = { u: ['#2ee6d6'], r: ['#ffc94d'], l: ['#ff2e88', '#ffc94d'] };
  const POL_DECAL = { iceblock: [], hoardcoin: [] };
  const POL_ORIENT = {};
  // art keys that already show the keyword, so the decal would repeat it
  const POL_NOT = { flame: ['torch', 'slag'], rime: ['snowball', 'iceblock', 'iceshard'], glint: ['iceblock'], pips: ['dice', 'clover', 'chip', 'card', 'slot', 'horseshoe', 'cookie'], coin: ['coin'] };
  const polHash = (s) => { let h = 7; s = String(s || ''); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h >>> 0; };
  /* The identity of a def: {decals, sil, rim, key}. key goes into the item
     sprite's cache check, so a change here redraws the sprite. Cached. */
  function polInfo(def) {
    if (!POL.on || !def) return POL_OFF;
    let I = POL_INFO.get(def);
    if (I && I.v === POL.v && I.id === def.id && I.rar === def.rarity) return I;
    let ids = [];
    try { ids = (typeof DATA !== 'undefined' && DATA && DATA.kwIds) ? (DATA.kwIds(def) || []) : []; } catch (e) { ids = []; }
    const art = def.art || '', tags = def.tags || [];
    let decals = POL_DECAL[def.id];
    if (decals) decals = decals.slice();
    else {
      decals = [];
      if (def.rarity !== 'junk' && tags.indexOf('junk') < 0) {
        const want = (d, kw) => { if (ids.indexOf(kw) >= 0 && !(POL_NOT[d] && POL_NOT[d].indexOf(art) >= 0) && decals.indexOf(d) < 0) decals.push(d); };
        want('skull', 'poison'); want('flame', 'burn'); want('rime', 'frost'); want('glint', 'glass');
        want('rune', 'echo'); want('pips', 'luck'); want('coin', 'greed');
      }
      const d = shapeDims(def.shape);
      decals.length = Math.min(decals.length, Math.max(d.w, d.h) < 22 || def.rarity === 'l' ? 1 : 2);
    }
    if (def.rarity === 'l') decals.push('star');
    const sil = POL_SIL[def.id] || null, rim = POL_RIM[def.rarity] || null;
    I = { v: POL.v, id: def.id, rar: def.rarity, decals, sil, rim,
      key: 'p' + POL.v + ':' + decals.join(',') + (sil ? ':s' : '') + (rim ? ':' + def.rarity : '') };
    POL_INFO.set(def, I);
    return I;
  }
  // The rim light: the art's silhouette in the rarity colour, nudged up-left
  // (and down-right in gold for a legendary) behind the real drawing.
  function polRim(ctx, pi, body) {
    const prev = FLAT, o = 1.4;
    try {
      for (let i = 0; i < pi.rim.length; i++) {
        FLAT = rgba(pi.rim[i], 0.95);
        ctx.save(); ctx.translate(i ? o : -o, i ? o : -o);
        try { body(); } catch (e) { /* art never throws */ }
        ctx.restore();
      }
    } finally { FLAT = prev; }
    POL.stats.rim++;
  }
  const POL_P = { x: 0, y: 0 };
  // Where the i-th stamp sits: on the lower corners, or along a long item.
  function polSlot(i, w, h, sr) {
    const L = Math.max(w, h), long = L / Math.max(1, Math.min(w, h)) >= 2.2;
    if (long) { const a = (i ? -0.1 : 0.22) * L; POL_P.x = h > w ? 0 : a; POL_P.y = h > w ? a : 0; }
    else { POL_P.x = (i ? -1 : 1) * Math.max(0, w / 2 - sr * 0.95); POL_P.y = Math.max(0, h / 2 - sr * 0.95); }
    return POL_P;
  }
  function polDecals(ctx, def, pi, w, h) {
    const L = Math.max(w, h), sr = Math.min(U.clamp(L * 0.17, 4.6, 7.2), Math.min(w, h) * 0.5 + 2.5);
    const round = def.shape && def.shape.kind === 'circle';
    let slot = 0;
    for (const d of pi.decals) {
      ctx.save();
      try {
        if (d === 'flame') polFlame(ctx, w, h, round);
        else if (d === 'rime') { if (round) polRime(ctx, w, h); const p = polSlot(slot++, w, h, sr); polStamp(ctx, 'flake', p.x, p.y, sr, def); }
        else if (d === 'glint') polGlint(ctx, w, h);
        else if (d === 'star') {
          const sr2 = sr * 1.1, x = -w / 2 + sr2 * 0.55, y = -h / 2 + sr2 * 0.55;
          tone(ctx, c => star(c, x, y, sr2, 5, 0.48), PAL.gold, x, y, sr2, { ol: 1.4, spec: false, dark: -0.25 });
          F(ctx, PAL.pink); ctx.beginPath(); circ(ctx, x, y + sr2 * 0.05, sr2 * 0.2); ctx.fill();
        } else { const p = polSlot(slot++, w, h, sr); polStamp(ctx, d, p.x, p.y, sr, def); }
      } catch (e) { /* a decal never throws */ }
      ctx.restore();
    }
    POL.stats.decal++;
  }
  // A stamp: a small inked disc with a pictogram (skull, rune, pips, coin, flake).
  function polStamp(ctx, d, x, y, r, def) {
    ctx.save();
    ctx.translate(x, y);
    const disc = (fill, ring) => {
      ctx.beginPath(); circ(ctx, 0, 0, r); F(ctx, fill); ctx.fill(); S(ctx, INK, 1.4); ctx.stroke();
      ctx.beginPath(); circ(ctx, 0, 0, r - 1.5); S(ctx, ring, 1.1); ctx.stroke();
    };
    if (d === 'skull') {
      disc('#1f3d14', PAL.lime);
      F(ctx, '#f4f8ec'); ctx.beginPath(); circ(ctx, 0, -r * 0.14, r * 0.46); ctx.fill();
      ctx.beginPath(); rrect(ctx, -r * 0.27, r * 0.1, r * 0.54, r * 0.34, r * 0.1); ctx.fill();
      F(ctx, INK); ctx.beginPath(); circ(ctx, -r * 0.18, -r * 0.14, r * 0.14); circ(ctx, r * 0.18, -r * 0.14, r * 0.14); ctx.fill();
    } else if (d === 'rune') {
      disc('#2a1452', '#b08cff');
      const v = polHash(def && def.id) % 3, k = r * 0.5;
      ctx.beginPath();
      if (v === 0) { ctx.moveTo(0, -k); ctx.lineTo(0, k); ctx.moveTo(-k * 0.8, -k * 0.6); ctx.lineTo(0, 0); ctx.lineTo(k * 0.8, -k * 0.6); }
      else if (v === 1) { ctx.moveTo(0, -k); ctx.lineTo(k * 0.75, 0); ctx.lineTo(0, k); ctx.lineTo(-k * 0.75, 0); ctx.closePath(); ctx.moveTo(-k * 0.3, k * 0.3); ctx.lineTo(-k * 0.9, k); }
      else { ctx.moveTo(-k * 0.8, k * 0.7); ctx.lineTo(0, -k); ctx.lineTo(k * 0.8, k * 0.7); ctx.closePath(); ctx.moveTo(0, k * 0.1); ctx.lineTo(0, k * 0.25); }
      S(ctx, '#7ff7ff', Math.max(1.1, r * 0.2)); ctx.stroke();
    } else if (d === 'pips') {
      ctx.rotate(0.28);
      const s = r * 0.85;
      ctx.beginPath(); rrect(ctx, -s, -s, s * 2, s * 2, s * 0.4); F(ctx, '#fbf6ea'); ctx.fill(); S(ctx, INK, 1.4); ctx.stroke();
      F(ctx, '#e8243c'); ctx.beginPath(); circ(ctx, -s * 0.5, -s * 0.5, s * 0.22); circ(ctx, 0, 0, s * 0.22); circ(ctx, s * 0.5, s * 0.5, s * 0.22); ctx.fill();
    } else if (d === 'coin') {
      disc(PAL.gold, '#8a5a12');
      txt(ctx, '$', 0, r * 0.06, Math.max(6, r * 1.3), '#7a4a00', true, 'center');
    } else if (d === 'flake') {
      disc('#123a5c', '#bfefff');
      ctx.beginPath();
      for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3, c = Math.cos(a) * r * 0.6, s2 = Math.sin(a) * r * 0.6; ctx.moveTo(-c, -s2); ctx.lineTo(c, s2); }
      S(ctx, '#ffffff', Math.max(1.1, r * 0.18)); ctx.stroke();
    }
    ctx.restore();
  }
  // Flame licks rising from the item's lower edge (the bottom arc on a ball).
  function polFlame(ctx, w, h, round) {
    const hw = w / 2, hh = h / 2, fh = U.clamp(Math.min(w, h) * 0.34, 4, 8), n = w > h * 1.6 ? 3 : 2, fw = fh * 0.45;
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n - 0.5;
      let x = u * w * 0.62, y = hh;
      if (round) { const a = Math.PI / 2 - u * 1.6; x = Math.cos(a) * hw * 0.92; y = Math.sin(a) * hh * 0.92; }
      const k = i % 2 ? 0.78 : 1, tip = y - fh * k * 1.25;
      const lick = (c, s) => { c.moveTo(x - fw * s, y); c.quadraticCurveTo(x - fw * s * 1.1, y - fh * k * s * 0.6, x + fw * 0.35 * s, tip + (1 - s) * fh * 0.6); c.quadraticCurveTo(x + fw * s * 0.4, y - fh * k * s * 0.45, x + fw * s, y); c.closePath(); };
      ctx.beginPath(); lick(ctx, 1); F(ctx, '#ff6a1a'); ctx.fill(); S(ctx, INK, 1.2); ctx.stroke();
      ctx.beginPath(); lick(ctx, 0.55); F(ctx, '#ffe066'); ctx.fill();
    }
  }
  // Frost rime capping a ball: a white rim of frost over the top with two drips.
  function polRime(ctx, w, h) {
    const r = Math.min(w, h) / 2;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.86, Math.PI * 1.12, Math.PI * 1.88);
    S(ctx, rgba('#9fe4ff', 0.95), Math.max(2.6, r * 0.3)); ctx.stroke();
    S(ctx, '#ffffff', Math.max(1.4, r * 0.16)); ctx.stroke();
    F(ctx, '#ffffff');
    ctx.beginPath(); poly(ctx, [-r * 0.42, -r * 0.62, -r * 0.3, -r * 0.62, -r * 0.36, -r * 0.34]); poly(ctx, [r * 0.12, -r * 0.8, r * 0.26, -r * 0.8, r * 0.19, -r * 0.5]); ctx.fill();
  }
  // Glass: two parallel glints across the upper left and a four point twinkle.
  function polGlint(ctx, w, h) {
    const hw = w / 2, hh = h / 2, k = Math.min(w, h), l = Math.max(2.5, k * 0.2);
    ctx.beginPath();
    ctx.moveTo(-hw * 0.42, -hh * 0.02); ctx.lineTo(-hw * 0.42 + l, -hh * 0.02 - l);
    ctx.moveTo(-hw * 0.22, -hh * 0.02); ctx.lineTo(-hw * 0.22 + l * 0.6, -hh * 0.02 - l * 0.6);
    S(ctx, rgba('#ffffff', 0.9), Math.max(1.2, k * 0.07)); ctx.stroke();
    const sx = hw * 0.3, sy = -hh * 0.45, sr = Math.max(2.4, k * 0.14);
    F(ctx, '#ffffff'); ctx.beginPath(); star(ctx, sx, sy, sr, 4, 0.28); ctx.fill();
  }

  /* ---- unique silhouettes (POL_SIL[id](ctx, w, h, c1, c2), the physics box) */
  const POL_SIL = {};
  const polShield = (c, hw, hh) => { c.moveTo(-hw, -hh); c.lineTo(hw, -hh); c.lineTo(hw, hh * 0.1); c.quadraticCurveTo(hw, hh * 0.7, 0, hh); c.quadraticCurveTo(-hw, hh * 0.7, -hw, hh * 0.1); c.closePath(); };
  // A crude shiv: a chipped shard of steel, the grip wrapped in rags.
  POL_SIL.shiv = (ctx, w, h, c1, c2) => {
    const hw = w / 2, hh = h / 2, gl = w * 0.38, bx = -hw + gl;
    tone(ctx, c => poly(c, [bx - 1, -hh * 0.55, hw * 0.25, -hh * 0.75, hw * 0.45, -hh * 0.35, hw, hh * 0.05, hw * 0.3, hh * 0.55, hw * 0.05, hh * 0.3, bx - 1, hh * 0.6]), shade(c1, 0.05), (bx + hw) / 2, 0, (hw - bx) / 2, { dark: -0.4, spec: false });
    line(ctx, bx + 3, -hh * 0.3, hw * 0.3, -hh * 0.5, rgba('#ffffff', 0.7), 1);
    tone(ctx, c => rrect(c, -hw, -hh * 0.7, gl, h * 0.7, hh * 0.35), c2, -hw + gl / 2, 0, gl / 2, NOSPEC);
    ctx.beginPath();
    for (let i = 0; i < 3; i++) { const x = -hw + gl * (0.2 + i * 0.28); ctx.moveTo(x, -hh * 0.7); ctx.lineTo(x + gl * 0.16, hh * 0.7); }
    S(ctx, PAL.paper, 1.6); ctx.stroke();
  };
  // A serrated kitchen knife: teeth along the edge, a riveted red grip.
  POL_SIL.serrated_knife = (ctx, w, h, c1, c2) => {
    const hw = w / 2, hh = h / 2, gl = w * 0.32, bx = -hw + gl;
    const pts = [bx, -hh * 0.7, hw * 0.6, -hh * 0.7, hw, -hh * 0.1];
    const n = 6;
    for (let i = 0; i <= n; i++) { const x = hw * 0.9 - (hw * 0.9 - bx) * (i / n); pts.push(x, i % 2 ? hh * 0.45 : hh * 0.8); }
    pts.push(bx, hh * 0.45);
    tone(ctx, c => poly(c, pts), shade(c1, 0.08), (bx + hw) / 2, 0, (hw - bx) / 2, { dark: -0.35, spec: false });
    line(ctx, bx + 2, -hh * 0.35, hw * 0.55, -hh * 0.35, rgba('#ffffff', 0.7), 1);
    tone(ctx, c => rrect(c, -hw, -hh * 0.62, gl + 1, hh * 1.24, hh * 0.3), c2, -hw + gl / 2, 0, gl / 2, NOSPEC);
    F(ctx, PAL.chrome); ctx.beginPath(); circ(ctx, -hw + gl * 0.3, 0, 1.3); circ(ctx, -hw + gl * 0.72, 0, 1.3); ctx.fill();
  };
  // Twin daggers: two small blades side by side, pommels out.
  POL_SIL.twin_daggers = (ctx, w, h, c1, c2) => {
    const hw = w / 2, hh = h / 2;
    for (const s of [-1, 1]) {
      ctx.save(); ctx.translate(s * hw * 0.08, s * hh * 0.48); ctx.scale(s, 1);
      const bw = w * 0.9, bh = hh * 0.95, g = bw * 0.3, x0 = -bw / 2;
      tone(ctx, c => poly(c, [x0 + g, -bh * 0.55, bw / 2 - bh, -bh * 0.55, bw / 2, 0, bw / 2 - bh, bh * 0.55, x0 + g, bh * 0.55]), shade(c1, 0.05), 0, 0, bw / 3, { dark: -0.35, spec: false, ol: 1.8 });
      tone(ctx, c => rrect(c, x0, -bh * 0.45, g, bh * 0.9, bh * 0.3), c2, x0 + g / 2, 0, g / 2, { spec: false, ol: 1.8 });
      tone(ctx, c => rrect(c, x0 + g - 1.5, -bh, 3, bh * 2, 1), PAL.gold, x0 + g, 0, 2, { spec: false, ol: 1.4 });
      ctx.restore();
    }
  };
  // A blowgun dart: fletching, a green barrel, a needle with a venom drop.
  POL_SIL.venom_dart = (ctx, w, h, c1, c2) => {
    const hw = w / 2, hh = h / 2;
    tone(ctx, c => poly(c, [-hw, -hh, -hw * 0.45, -hh * 0.2, -hw * 0.45, hh * 0.2, -hw, hh, -hw * 0.75, 0]), c2, -hw * 0.7, 0, hh, { spec: false, ol: 1.6 });
    tone(ctx, c => rrect(c, -hw * 0.55, -hh * 0.5, w * 0.5, hh, hh * 0.45), c1, -hw * 0.3, 0, hh, { dark: -0.3, ol: 1.8 });
    tone(ctx, c => poly(c, [-hw * 0.06, -hh * 0.3, hw, 0, -hw * 0.06, hh * 0.3]), PAL.chrome, hw * 0.4, 0, hh * 0.6, { spec: false, ol: 1.5 });
    tone(ctx, c => circ(c, hw * 0.78, hh * 0.55, Math.max(1.6, hh * 0.38)), PAL.lime, hw * 0.78, hh * 0.55, 2, { spec: false, ol: 1.2 });
  };
  // An ice pick: a blue grip, a ferrule and a long round spike.
  POL_SIL.ice_pick = (ctx, w, h, c1, c2) => {
    const hw = w / 2, hh = h / 2, gl = w * 0.38;
    tone(ctx, c => poly(c, [-hw + gl, -hh * 0.3, hw * 0.55, -hh * 0.16, hw, 0, hw * 0.55, hh * 0.16, -hw + gl, hh * 0.3]), shade(c1, 0.25), 0, 0, hw * 0.5, { spec: false, dark: -0.3 });
    tone(ctx, c => rrect(c, -hw, -hh * 0.8, gl, h * 0.8, hh * 0.5), c2, -hw + gl / 2, 0, gl / 2, { dark: -0.3 });
    tone(ctx, c => rrect(c, -hw + gl - 2, -hh * 0.62, 4, hh * 1.24, 1.2), PAL.chrome, -hw + gl, 0, 2, { spec: false, ol: 1.5 });
    F(ctx, rgba('#ffffff', 0.85)); ctx.beginPath(); star(ctx, hw * 0.3, -hh * 0.55, Math.max(2, hh * 0.5), 4, 0.3); ctx.fill();
  };
  // The rusty sword: a notched blade with rust blooms.
  POL_SIL.rusty_sword = (ctx, w, h, c1, c2) => {
    IA.sword(ctx, w, h, c1, c2);
    const hw = w / 2, hh = h / 2, bx = -hw + w * 0.22 + Math.max(3, w * 0.07);
    F(ctx, INK); ctx.beginPath(); poly(ctx, [hw * 0.25, -hh * 0.62, hw * 0.33, -hh * 0.2, hw * 0.41, -hh * 0.62]); poly(ctx, [bx + w * 0.18, hh * 0.62, bx + w * 0.23, hh * 0.25, bx + w * 0.28, hh * 0.62]); ctx.fill();
    F(ctx, rgba('#b8561e', 0.85)); ctx.beginPath(); ell(ctx, bx + w * 0.1, -hh * 0.1, w * 0.06, hh * 0.3, 0); ell(ctx, hw * 0.05, hh * 0.15, w * 0.045, hh * 0.25, 0); ell(ctx, hw * 0.55, -hh * 0.05, w * 0.035, hh * 0.2, 0); ctx.fill();
  };
  // Dented Shield: a round-top shield knocked out of true, a riveted patch and a boss.
  POL_SIL.dented_shield = (ctx, w, h, c1, c2) => {
    const hw = w / 2, hh = h / 2;
    const p = c => { c.moveTo(-hw, -hh * 0.55); c.quadraticCurveTo(-hw * 0.9, -hh, -hw * 0.1, -hh); c.lineTo(hw * 0.2, -hh); c.lineTo(hw * 0.42, -hh * 0.74); c.lineTo(hw * 0.66, -hh * 0.94); c.quadraticCurveTo(hw, -hh * 0.9, hw, -hh * 0.4); c.lineTo(hw, hh * 0.1); c.quadraticCurveTo(hw, hh * 0.7, 0, hh); c.quadraticCurveTo(-hw, hh * 0.7, -hw, hh * 0.1); c.closePath(); };
    tone(ctx, p, c1, 0, -hh * 0.1, hw, { dark: -0.35 });
    tone(ctx, c => rrect(c, -hw * 0.72, hh * 0.05, hw * 0.62, hh * 0.46, 2), shade(c2, 0.25), -hw * 0.4, hh * 0.28, hw * 0.3, { spec: false, ol: 1.6 });
    F(ctx, shade(c1, 0.5)); ctx.beginPath(); for (const [x, y] of [[-hw * 0.64, hh * 0.13], [-hw * 0.18, hh * 0.13], [-hw * 0.64, hh * 0.43], [-hw * 0.18, hh * 0.43]]) circ(ctx, x, y, 1.2); ctx.fill();
    tone(ctx, c => circ(c, hw * 0.18, -hh * 0.18, Math.min(hw, hh) * 0.28), c2, hw * 0.18, -hh * 0.18, hw * 0.28, { dark: -0.3 });
    ctx.beginPath(); ctx.moveTo(hw * 0.42, -hh * 0.72); ctx.lineTo(hw * 0.5, -hh * 0.4); ctx.lineTo(hw * 0.38, -hh * 0.3); S(ctx, rgba(INK, 0.7), 1.3); ctx.stroke();
  };
  // Heater Shield: a heraldic chevron and a gold border.
  POL_SIL.heater_shield = (ctx, w, h, c1, c2) => {
    const hw = w / 2, hh = h / 2;
    tone(ctx, c => polShield(c, hw, hh), c1, 0, -hh * 0.1, hw, { dark: -0.3 });
    ctx.save(); ctx.beginPath(); polShield(ctx, hw, hh); ctx.clip();
    F(ctx, c2); ctx.beginPath(); poly(ctx, [-hw, hh * 0.05, 0, -hh * 0.55, hw, hh * 0.05, hw, hh * 0.45, 0, -hh * 0.15, -hw, hh * 0.45]); ctx.fill();
    ctx.restore();
    ctx.beginPath(); polShield(ctx, hw * 0.8, hh * 0.84); S(ctx, rgba(shade(c1, 0.55), 0.9), 1.3); ctx.stroke();
    F(ctx, shade(c1, 0.6)); ctx.beginPath(); circ(ctx, 0, hh * 0.45, Math.max(1.5, hw * 0.12)); ctx.fill();
  };
  // Aegis of the Rig: a sunburst face, a pink gem boss and gold wings on the shoulders.
  POL_SIL.aegis = (ctx, w, h, c1, c2) => {
    const hw = w / 2, hh = h / 2;
    for (const s of [-1, 1]) tone(ctx, c => { c.moveTo(s * hw * 0.55, -hh * 0.75); c.quadraticCurveTo(s * hw * 1.02, -hh * 1.02, s * hw * 1.02, -hh * 0.45); c.quadraticCurveTo(s * hw * 0.85, -hh * 0.55, s * hw * 0.55, -hh * 0.4); c.closePath(); }, c2, s * hw * 0.8, -hh * 0.7, hw * 0.3, { spec: false, ol: 1.6 });
    tone(ctx, c => polShield(c, hw * 0.86, hh * 0.9), c1, 0, -hh * 0.1, hw, { dark: -0.25 });
    ctx.save(); ctx.beginPath(); polShield(ctx, hw * 0.86, hh * 0.9); ctx.clip();
    F(ctx, rgba(c2, 0.9)); ctx.beginPath();
    for (let i = 0; i < 8; i++) { const a = i * TAU / 8 + 0.2; ctx.moveTo(0, -hh * 0.05); ctx.lineTo(Math.cos(a) * w, -hh * 0.05 + Math.sin(a) * w); ctx.lineTo(Math.cos(a + 0.22) * w, -hh * 0.05 + Math.sin(a + 0.22) * w); ctx.closePath(); }
    ctx.fill();
    ctx.restore();
    ctx.beginPath(); polShield(ctx, hw * 0.86, hh * 0.9); S(ctx, INK, OL); ctx.stroke();
    tone(ctx, c => poly(c, [0, -hh * 0.38, hw * 0.28, -hh * 0.05, 0, hh * 0.3, -hw * 0.28, -hh * 0.05]), PAL.pink, 0, -hh * 0.05, hw * 0.28, { dark: -0.3, ol: 1.6 });
  };
  // Glass Shield: a faceted, see-through pane.
  POL_SIL.glass_shield = (ctx, w, h, c1, c2) => {
    const hw = w / 2, hh = h / 2;
    tone(ctx, c => polShield(c, hw, hh), rgba(c1, 0.78), 0, -hh * 0.1, hw, { dark: -0.15, spec: false });
    ctx.save(); ctx.beginPath(); polShield(ctx, hw, hh); ctx.clip();
    ctx.beginPath(); ctx.moveTo(-hw, -hh); ctx.lineTo(0, -hh * 0.1); ctx.lineTo(hw, -hh); ctx.moveTo(0, -hh * 0.1); ctx.lineTo(0, hh); ctx.moveTo(-hw, hh * 0.1); ctx.lineTo(0, -hh * 0.1); ctx.lineTo(hw, hh * 0.1);
    S(ctx, rgba(c2, 0.9), 1.3); ctx.stroke();
    F(ctx, rgba('#ffffff', 0.35)); ctx.beginPath(); poly(ctx, [-hw, -hh, 0, -hh * 0.1, -hw, hh * 0.1]); ctx.fill();
    ctx.restore();
    ctx.beginPath(); polShield(ctx, hw, hh); S(ctx, INK, OL); ctx.stroke();
  };
  // Cherry Bomb: two cherry bombs on one stem, a leaf and a lit knot.
  POL_SIL.cherry_bomb = (ctx, w, h, c1, c2) => {
    const r = Math.min(w, h) / 2, br = r * 0.48;
    ctx.beginPath(); ctx.moveTo(-r * 0.42, r * 0.3); ctx.quadraticCurveTo(-r * 0.36, -r * 0.35, 0, -r * 0.62); ctx.moveTo(r * 0.45, r * 0.42); ctx.quadraticCurveTo(r * 0.4, -r * 0.3, 0, -r * 0.62);
    S(ctx, INK, 3); ctx.stroke(); S(ctx, '#6b9a2e', 1.5); ctx.stroke();
    tone(ctx, c => ell(c, r * 0.3, -r * 0.7, r * 0.28, r * 0.13, -0.5), '#7ad13a', r * 0.3, -r * 0.7, r * 0.25, { ol: 1.3, spec: false });
    tone(ctx, c => circ(c, -r * 0.42, r * 0.38, br), c1, -r * 0.42, r * 0.38, br, { dark: -0.4 });
    tone(ctx, c => circ(c, r * 0.46, r * 0.48, br * 0.92), shade(c1, -0.08), r * 0.46, r * 0.48, br, { dark: -0.4 });
    tone(ctx, c => star(c, 0, -r * 0.78, r * 0.24, 5, 0.45), '#ffe066', 0, -r * 0.78, r * 0.2, { ol: 1, spec: false });
  };
  // Smoke Bomb: a puff of grey smoke with the bomb peeking out.
  POL_SIL.smoke_bomb = (ctx, w, h, c1, c2) => {
    const r = Math.min(w, h) / 2;
    const puff = c => { circ(c, -r * 0.48, r * 0.22, r * 0.44); circ(c, r * 0.44, r * 0.28, r * 0.46); circ(c, r * 0.02, -r * 0.2, r * 0.56); circ(c, -r * 0.05, r * 0.48, r * 0.44); };
    ctx.beginPath(); puff(ctx); S(ctx, INK, OL * 2); ctx.stroke(); F(ctx, c1); ctx.fill();
    if (!FLAT) {
      ctx.save(); ctx.beginPath(); puff(ctx); ctx.clip();
      ctx.fillStyle = shade(c1, -0.22); ctx.beginPath(); ctx.arc(r * 0.35, r * 0.75, r * 0.75, 0, TAU); ctx.fill();
      ctx.fillStyle = rgba('#ffffff', 0.3); ctx.beginPath(); ctx.arc(-r * 0.2, -r * 0.45, r * 0.3, 0, TAU); ctx.fill();
      ctx.restore();
    }
    tone(ctx, c => circ(c, r * 0.12, r * 0.12, r * 0.34), c2, r * 0.12, r * 0.12, r * 0.34, { dark: -0.3, ol: 1.8 });
    ctx.beginPath(); ctx.moveTo(r * 0.25, -r * 0.16); ctx.quadraticCurveTo(r * 0.55, -r * 0.45, r * 0.42, -r * 0.7); S(ctx, INK, 1.6); ctx.stroke();
  };
  // Firecracker: three red sticks in a gold band, one fuse.
  POL_SIL.firecracker = (ctx, w, h, c1, c2) => {
    const r = Math.min(w, h) / 2, sw = r * 0.46, sh = r * 1.3;
    for (const [x, y, a] of [[-r * 0.46, r * 0.18, -0.2], [r * 0.46, r * 0.18, 0.2], [0, r * 0.02, 0]]) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      tone(ctx, c => rrect(c, -sw / 2, -sh / 2, sw, sh, sw * 0.3), c1, 0, 0, sw, { dark: -0.3, ol: 1.8 });
      F(ctx, c2); ctx.beginPath(); ctx.rect(-sw / 2 + 0.8, -sh * 0.32, sw - 1.6, sh * 0.12); ctx.fill();
      ctx.restore();
    }
    tone(ctx, c => rrect(c, -r * 0.82, r * 0.18, r * 1.64, r * 0.3, 2), PAL.gold, 0, r * 0.33, r * 0.8, { spec: false, ol: 1.6 });
    ctx.beginPath(); ctx.moveTo(0, -r * 0.62); ctx.quadraticCurveTo(r * 0.32, -r * 0.8, r * 0.16, -r * 0.94); S(ctx, INK, 2.2); ctx.stroke(); S(ctx, '#c9a36a', 1.1); ctx.stroke();
    tone(ctx, c => star(c, r * 0.18, -r * 0.94, r * 0.2, 5, 0.45), '#ffe066', r * 0.18, -r * 0.94, r * 0.2, { ol: 1, spec: false });
  };
  // Peppermint: a pinwheel candy with the wrapper twisted at both ends.
  POL_SIL.peppermint = (ctx, w, h, c1, c2) => {
    const r = Math.min(w, h) / 2, cr = r * 0.66;
    for (const s of [-1, 1]) tone(ctx, c => poly(c, [s * cr * 0.8, 0, s * r, -r * 0.5, s * r * 0.9, r * 0.5]), '#e8f4ff', s * r * 0.8, 0, r * 0.3, { spec: false, ol: 1.3 });
    tone(ctx, c => circ(c, 0, 0, cr), c1, 0, 0, cr, { dark: -0.15, spec: false });
    if (!FLAT) {
      ctx.save(); ctx.beginPath(); circ(ctx, 0, 0, cr); ctx.clip();
      ctx.fillStyle = c2; ctx.beginPath();
      for (let i = 0; i < 6; i++) { const a = i * TAU / 6; ctx.moveTo(0, 0); ctx.quadraticCurveTo(Math.cos(a + 0.5) * cr * 0.6, Math.sin(a + 0.5) * cr * 0.6, Math.cos(a) * cr * 1.2, Math.sin(a) * cr * 1.2); ctx.lineTo(Math.cos(a + 0.45) * cr * 1.2, Math.sin(a + 0.45) * cr * 1.2); ctx.closePath(); }
      ctx.fill(); ctx.restore();
    }
    ctx.beginPath(); circ(ctx, 0, 0, cr); S(ctx, INK, 1.8); ctx.stroke();
  };
  // Sour Drop: a sugared hard candy in a twist of wrapper.
  POL_SIL.sour_drop = (ctx, w, h, c1, c2) => {
    const r = Math.min(w, h) / 2;
    for (const s of [-1, 1]) tone(ctx, c => poly(c, [s * r * 0.45, 0, s * r, -r * 0.55, s * r * 0.95, r * 0.55]), rgba('#fff6d0', 0.95), s * r * 0.7, 0, r * 0.3, { spec: false, ol: 1.2 });
    tone(ctx, c => ell(c, 0, 0, r * 0.62, r * 0.5, 0), c1, 0, 0, r * 0.6, { dark: -0.25, ol: 1.8 });
    F(ctx, '#ffffff'); ctx.beginPath(); for (const [x, y] of [[-0.25, -0.15], [0.2, -0.22], [0.05, 0.18], [-0.3, 0.2], [0.34, 0.1]]) circ(ctx, x * r, y * r, 0.9); ctx.fill();
  };
  // Lead Shot: a dull cast ball with its sprue nub and a seam.
  POL_SIL.lead_shot = (ctx, w, h, c1, c2) => {
    const r = Math.min(w, h) / 2;
    tone(ctx, c => rrect(c, -r * 0.2, -r * 1.0, r * 0.4, r * 0.4, 1), c2, 0, -r * 0.8, r * 0.2, { spec: false, ol: 1.4 });
    tone(ctx, c => circ(c, 0, r * 0.04, r * 0.9), c1, 0, 0, r * 0.9, { dark: -0.4 });
    ctx.beginPath(); ctx.moveTo(-r * 0.86, r * 0.04); ctx.quadraticCurveTo(0, r * 0.3, r * 0.86, r * 0.04); S(ctx, rgba(INK, 0.55), 1.1); ctx.stroke();
  };
  // Bouncy Ball: a rubber ball with a wide stripe and a star on it.
  POL_SIL.bouncy_ball = (ctx, w, h, c1, c2) => {
    const r = Math.min(w, h) / 2;
    tone(ctx, c => circ(c, 0, 0, r * 0.95), c1, 0, 0, r, { dark: -0.3 });
    if (!FLAT) {
      ctx.save(); ctx.beginPath(); circ(ctx, 0, 0, r * 0.95); ctx.clip();
      ctx.fillStyle = c2; ctx.beginPath(); ctx.moveTo(-r, -r * 0.05); ctx.quadraticCurveTo(0, -r * 0.45, r, -r * 0.2); ctx.lineTo(r, r * 0.25); ctx.quadraticCurveTo(0, 0, -r, r * 0.4); ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.beginPath(); circ(ctx, 0, 0, r * 0.95); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
    }
    F(ctx, '#ffffff'); ctx.beginPath(); star(ctx, -r * 0.05, r * 0.02, r * 0.26, 5, 0.45); ctx.fill();
  };
  // A drawstring pouch with its contents peeking out (the bags of small things).
  const polBag = (kind) => (ctx, w, h, c1, c2) => {
    const r = Math.min(w, h) / 2, pr = r * 0.25;
    const pk = [[-r * 0.3, -r * 0.5], [r * 0.26, -r * 0.54], [-r * 0.02, -r * 0.7]];
    pk.forEach(([x, y], i) => {
      const col = i % 2 ? c2 : c1;
      if (kind === 'bolts') tone(ctx, c => hexPath(c, x, y, pr * 1.05, true), c1, x, y, pr, { spec: false, ol: 1.3 });
      else tone(ctx, c => circ(c, x, y, pr), kind === 'sweets' && i === 2 ? c2 : col, x, y, pr, { ol: 1.3 });
      if (kind === 'beads' || kind === 'bolts') { F(ctx, INK); ctx.beginPath(); circ(ctx, x, y, pr * 0.32); ctx.fill(); }
      if (kind === 'sweets') { ctx.beginPath(); ctx.moveTo(x - pr * 0.6, y - pr * 0.3); ctx.lineTo(x + pr * 0.6, y + pr * 0.3); S(ctx, i === 2 ? c1 : c2, 1.2); ctx.stroke(); }
    });
    tone(ctx, c => { c.moveTo(-r * 0.5, -r * 0.42); c.bezierCurveTo(-r * 1.06, -r * 0.1, -r * 1.02, r * 0.96, 0, r * 0.96); c.bezierCurveTo(r * 1.02, r * 0.96, r * 1.06, -r * 0.1, r * 0.5, -r * 0.42); c.closePath(); }, '#c08a4e', 0, r * 0.25, r * 0.8, { dark: -0.3 });
    tone(ctx, c => rrect(c, -r * 0.56, -r * 0.5, r * 1.12, r * 0.24, 2), '#7a4a22', 0, -r * 0.38, r * 0.5, { spec: false, ol: 1.4 });
    ctx.beginPath(); ctx.moveTo(r * 0.3, -r * 0.3); ctx.quadraticCurveTo(r * 0.55, r * 0.05, r * 0.4, r * 0.3); S(ctx, '#7a4a22', 1.4); ctx.stroke();
    tone(ctx, c => circ(c, -r * 0.1, r * 0.38, r * 0.3), c1, -r * 0.1, r * 0.38, r * 0.3, { spec: false, ol: 1.4 });
  };
  POL_SIL.bag_marbles = polBag('marbles');
  POL_SIL.bag_beads = polBag('beads');
  POL_SIL.bag_sweets = polBag('sweets');
  POL_SIL.bag_bolts = polBag('bolts');
  // Iron Nut: a hex nut with its threaded hole.
  POL_SIL.iron_nut = (ctx, w, h, c1, c2) => {
    const r = Math.min(w, h) / 2;
    tone(ctx, c => hexPath(c, 0, 0, r * 0.98, true), c1, 0, 0, r, { dark: -0.35 });
    ctx.beginPath(); circ(ctx, 0, 0, r * 0.42); F(ctx, '#1a1224'); ctx.fill(); S(ctx, INK, 1.5); ctx.stroke();
    ctx.beginPath(); circ(ctx, 0, 0, r * 0.3); S(ctx, rgba(c2, 0.9), 1); ctx.stroke();
  };
  // Thorn Ring: a band of vine with thorns all round.
  POL_SIL.thorn_ring = (ctx, w, h, c1, c2) => {
    const r = Math.min(w, h) / 2, rr = r * 0.62;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) { const a = i * TAU / 8 + 0.2, ca = Math.cos(a), sa = Math.sin(a); ctx.moveTo(ca * rr * 0.9 - sa * 2.2, sa * rr * 0.9 + ca * 2.2); ctx.lineTo(ca * r, sa * r); ctx.lineTo(ca * rr * 0.9 + sa * 2.2, sa * rr * 0.9 - ca * 2.2); ctx.closePath(); }
    F(ctx, c2); ctx.fill(); S(ctx, INK, 1.1); ctx.stroke();
    ctx.beginPath(); circ(ctx, 0, 0, rr); S(ctx, INK, r * 0.42 + 2.4); ctx.stroke(); S(ctx, c1, r * 0.42); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, rr, Math.PI * 1.1, Math.PI * 1.5); S(ctx, rgba('#ffffff', 0.5), 1.2); ctx.stroke();
  };
  // Lucky Coin: a clover struck on the face.
  POL_SIL.lucky_coin = (ctx, w, h, c1, c2) => {
    const r = Math.min(w, h) / 2;
    tone(ctx, c => circ(c, 0, 0, r), c1, 0, 0, r, { dark: -0.35 });
    ctx.beginPath(); ctx.arc(0, 0, r * 0.74, 0, TAU); S(ctx, shade(c2, -0.2), Math.max(1.2, r * 0.1)); ctx.stroke();
    F(ctx, '#2e9a50'); ctx.beginPath();
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) circ(ctx, dx * r * 0.2, dy * r * 0.2, r * 0.22);
    ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(r * 0.15, r * 0.35, r * 0.05, r * 0.55); S(ctx, '#2e9a50', 1.3); ctx.stroke();
  };
  // Arcade Token: a punched token with a milled edge.
  POL_SIL.arcade_token = (ctx, w, h, c1, c2) => {
    const r = Math.min(w, h) / 2;
    tone(ctx, c => circ(c, 0, 0, r), c1, 0, 0, r, { dark: -0.35 });
    ctx.beginPath();
    for (let i = 0; i < 14; i++) { const a = i * TAU / 14; ctx.moveTo(Math.cos(a) * r * 0.78, Math.sin(a) * r * 0.78); ctx.lineTo(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95); }
    S(ctx, rgba(c2, 0.9), 1.1); ctx.stroke();
    ctx.beginPath(); circ(ctx, 0, 0, r * 0.26); F(ctx, INK); ctx.fill();
    ctx.beginPath(); circ(ctx, 0, 0, r * 0.45); S(ctx, shade(c1, 0.5), 1.2); ctx.stroke();
  };
  // Floating Token: a coin on little wings.
  POL_SIL.floating_token = (ctx, w, h, c1, c2) => {
    const r = Math.min(w, h) / 2, cr = r * 0.6;
    for (const s of [-1, 1]) tone(ctx, c => { c.moveTo(s * cr * 0.6, -cr * 0.2); c.quadraticCurveTo(s * r * 1.02, -r * 0.95, s * r, -r * 0.05); c.quadraticCurveTo(s * r * 0.8, r * 0.1, s * cr * 0.7, cr * 0.3); c.closePath(); }, '#f4f8ff', s * r * 0.8, -r * 0.3, r * 0.3, { spec: false, ol: 1.3 });
    tone(ctx, c => circ(c, 0, r * 0.12, cr), c1, 0, r * 0.12, cr, { dark: -0.35 });
    tone(ctx, c => star(c, 0, r * 0.14, cr * 0.5, 5, 0.5), c2, 0, r * 0.14, cr * 0.5, { spec: false, ol: 1.2 });
  };
  // Double or Nothing: a two-faced coin, one side struck x2.
  POL_SIL.double_or_nothing = (ctx, w, h, c1, c2) => {
    const r = Math.min(w, h) / 2;
    tone(ctx, c => circ(c, 0, 0, r), c1, 0, 0, r, { dark: -0.3 });
    F(ctx, c2); ctx.beginPath(); ctx.moveTo(-r * 0.7, r * 0.7); ctx.arc(0, 0, r - 1.2, Math.PI * 0.75, Math.PI * 1.75, true); ctx.closePath(); ctx.fill();
    txt(ctx, 'x2', -r * 0.1, -r * 0.12, Math.max(6, r * 0.8), c2, true, 'center');
    ctx.beginPath(); circ(ctx, 0, 0, r); S(ctx, INK, OL); ctx.stroke();
  };
  // Ghost Pepper: a curled chili with a tiny spooky face.
  POL_SIL.ghost_pepper = (ctx, w, h, c1, c2) => {
    const r = Math.min(w, h) / 2;
    tone(ctx, c => { c.moveTo(-r * 0.55, -r * 0.55); c.bezierCurveTo(r * 0.45, -r * 0.75, r * 1.02, -r * 0.1, r * 0.72, r * 0.98); c.bezierCurveTo(r * 0.3, r * 0.35, -r * 0.3, -r * 0.02, -r * 0.8, -r * 0.2); c.closePath(); }, c1, r * 0.1, -r * 0.1, r * 0.7, { dark: -0.35 });
    tone(ctx, c => ell(c, -r * 0.66, -r * 0.4, r * 0.24, r * 0.17, 0.5), c2, -r * 0.66, -r * 0.4, r * 0.2, { spec: false, ol: 1.4 });
    ctx.beginPath(); ctx.moveTo(-r * 0.74, -r * 0.5); ctx.quadraticCurveTo(-r * 0.9, -r * 0.85, -r * 0.6, -r * 0.95); S(ctx, INK, 2.4); ctx.stroke(); S(ctx, c2, 1.2); ctx.stroke();
    F(ctx, INK); ctx.beginPath(); circ(ctx, r * 0.02, -r * 0.2, r * 0.08); circ(ctx, r * 0.3, -r * 0.1, r * 0.08); ctx.fill();
    ctx.beginPath(); ctx.moveTo(r * 0.05, r * 0.06); ctx.quadraticCurveTo(r * 0.15, 0, r * 0.2, r * 0.1); ctx.quadraticCurveTo(r * 0.26, r * 0.2, r * 0.34, r * 0.12); S(ctx, INK, 1); ctx.stroke();
  };
  // Blood Orange: a whole orange with a wedge cut out to show the red flesh.
  POL_SIL.blood_orange = (ctx, w, h, c1, c2) => {
    const r = Math.min(w, h) / 2 * 0.95;
    tone(ctx, c => { c.moveTo(0, 0); c.arc(0, 0, r, Math.PI * 0.55, Math.PI * 2.05); c.closePath(); }, c1, 0, 0, r, { dark: -0.3 });
    tone(ctx, c => { c.moveTo(r * 0.04, r * 0.04); c.arc(r * 0.04, r * 0.04, r, Math.PI * 0.05, Math.PI * 0.55); c.closePath(); }, '#ffd9b0', r * 0.4, r * 0.4, r * 0.4, { spec: false, ol: 1.6 });
    F(ctx, c2); ctx.beginPath(); ctx.moveTo(r * 0.1, r * 0.1); ctx.arc(r * 0.04, r * 0.04, r * 0.84, Math.PI * 0.07, Math.PI * 0.53); ctx.closePath(); ctx.fill();
    ctx.beginPath(); for (const a of [0.2, 0.32, 0.44]) { ctx.moveTo(r * 0.06, r * 0.06); ctx.lineTo(r * 0.04 + Math.cos(a * Math.PI) * r * 0.82, r * 0.04 + Math.sin(a * Math.PI) * r * 0.82); } S(ctx, rgba('#ffd9b0', 0.9), 1); ctx.stroke();
    tone(ctx, c => ell(c, -r * 0.2, -r * 0.95, r * 0.26, r * 0.12, -0.4), '#6bd33a', -r * 0.2, -r * 0.95, r * 0.2, { spec: false, ol: 1.2 });
  };
  // Dragon Egg: scaled shell, a glowing crack.
  POL_SIL.dragon_egg = (ctx, w, h, c1, c2) => {
    const hw = w / 2, hh = h / 2;
    const p = c => { c.moveTo(0, -hh); c.bezierCurveTo(hw * 0.9, -hh, hw, hh * 0.1, hw, hh * 0.3); c.bezierCurveTo(hw, hh * 0.75, hw * 0.55, hh, 0, hh); c.bezierCurveTo(-hw * 0.55, hh, -hw, hh * 0.75, -hw, hh * 0.3); c.bezierCurveTo(-hw, hh * 0.1, -hw * 0.9, -hh, 0, -hh); c.closePath(); };
    tone(ctx, p, c1, 0, hh * 0.1, hw, { dark: -0.35 });
    ctx.save(); ctx.beginPath(); p(ctx); ctx.clip();
    ctx.beginPath();
    for (let row = 0; row < 5; row++) { const y = -hh * 0.55 + row * hh * 0.34, off = row % 2 ? hw * 0.22 : 0; for (let x = -hw + off; x < hw; x += hw * 0.44) { ctx.moveTo(x - hw * 0.2, y); ctx.quadraticCurveTo(x, y + hh * 0.28, x + hw * 0.2, y); } }
    S(ctx, rgba(INK, 0.45), 1.2); ctx.stroke();
    ctx.restore();
    ctx.beginPath(); ctx.moveTo(-hw * 0.5, -hh * 0.1); ctx.lineTo(-hw * 0.15, hh * 0.05); ctx.lineTo(-hw * 0.3, hh * 0.3); ctx.lineTo(hw * 0.2, hh * 0.45);
    S(ctx, INK, 3); ctx.stroke(); S(ctx, c2, 1.6); ctx.stroke();
  };
  // Stolen Gem: a brilliant cut stone with its price tag still on.
  POL_SIL.stolen_gem = (ctx, w, h, c1, c2) => {
    const hw = w / 2, hh = h / 2, ty = -hh * 0.35;
    tone(ctx, c => poly(c, [-hw * 0.55, -hh * 0.8, hw * 0.45, -hh * 0.8, hw * 0.85, ty, 0, hh, -hw * 0.95, ty]), c1, 0, -hh * 0.1, hw, { dark: -0.35 });
    ctx.beginPath(); ctx.moveTo(-hw * 0.95, ty); ctx.lineTo(hw * 0.85, ty); ctx.moveTo(-hw * 0.3, -hh * 0.8); ctx.lineTo(-hw * 0.45, ty); ctx.lineTo(0, hh); ctx.moveTo(hw * 0.2, -hh * 0.8); ctx.lineTo(hw * 0.35, ty); ctx.lineTo(0, hh);
    S(ctx, rgba('#ffffff', 0.75), 1.1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(hw * 0.55, -hh * 0.72); ctx.lineTo(hw * 0.75, -hh * 0.92); S(ctx, INK, 1.2); ctx.stroke();
    ctx.save(); ctx.translate(hw * 0.78, -hh * 0.9); ctx.rotate(0.5);
    tone(ctx, c => poly(c, [0, 0, hw * 0.2, -hh * 0.14, hw * 0.46, -hh * 0.14, hw * 0.46, hh * 0.14, hw * 0.2, hh * 0.14]), '#f4ecd6', hw * 0.25, 0, hw * 0.2, { spec: false, ol: 1.2 });
    ctx.restore();
  };
  // Gumball Jar: a gumball machine, glass globe of colours on a red stand.
  POL_SIL.gumball_jar = (ctx, w, h, c1, c2) => {
    const hw = w / 2, hh = h / 2, gr = Math.min(hw, h * 0.33), gy = -hh + gr;
    tone(ctx, c => poly(c, [-hw * 0.62, hh, hw * 0.62, hh, hw * 0.46, gy + gr * 0.7, -hw * 0.46, gy + gr * 0.7]), '#e8243c', 0, hh * 0.5, hw * 0.6, { dark: -0.3 });
    F(ctx, INK); ctx.beginPath(); rrect(ctx, -hw * 0.18, hh * 0.35, hw * 0.36, hh * 0.18, 1); ctx.fill();
    tone(ctx, c => circ(c, 0, gy, gr), rgba('#e8f8ff', 0.55), 0, gy, gr, { spec: false, dark: -0.1 });
    const cols = [c1, c2, PAL.gold, PAL.lime, '#7a5aff'];
    ctx.save(); ctx.beginPath(); circ(ctx, 0, gy, gr - 1.2); ctx.clip();
    for (let i = 0; i < 7; i++) { const a = i * 2.3, rr = gr * (i ? 0.52 : 0), x = Math.cos(a) * rr, y = gy + gr * 0.25 + Math.sin(a) * rr * 0.6; F(ctx, cols[i % 5]); ctx.beginPath(); circ(ctx, x, y, gr * 0.3); ctx.fill(); }
    ctx.restore();
    ctx.beginPath(); circ(ctx, 0, gy, gr); S(ctx, INK, OL); ctx.stroke();
    F(ctx, rgba('#ffffff', 0.6)); ctx.beginPath(); ell(ctx, -gr * 0.4, gy - gr * 0.4, gr * 0.25, gr * 0.14, -0.7); ctx.fill();
    tone(ctx, c => rrect(c, -hw * 0.2, -hh - 1, hw * 0.4, gr * 0.3, 1.5), '#e8243c', 0, -hh, hw * 0.2, { spec: false, ol: 1.4 });
  };
  // Crystal Ball: the ball on a little claw-footed stand.
  POL_SIL.crystal_ball = (ctx, w, h, c1, c2) => {
    const r = Math.min(w, h) / 2;
    tone(ctx, c => poly(c, [-r * 0.62, r * 0.98, r * 0.62, r * 0.98, r * 0.4, r * 0.5, -r * 0.4, r * 0.5]), '#5a3a7a', 0, r * 0.75, r * 0.5, { dark: -0.3, ol: 1.8 });
    tone(ctx, c => circ(c, 0, -r * 0.14, r * 0.78), c1, 0, -r * 0.14, r * 0.78, { dark: -0.35 });
    if (!FLAT) { ctx.save(); ctx.beginPath(); circ(ctx, 0, -r * 0.14, r * 0.74); ctx.clip(); ctx.fillStyle = rgba(c2, 0.55); ctx.beginPath(); ell(ctx, r * 0.1, r * 0.05, r * 0.5, r * 0.3, -0.5); ctx.fill(); ctx.restore(); }
  };
  // Blizzard Orb: a snow globe, a tiny pine in a flurry, a wooden base.
  POL_SIL.blizzard_orb = (ctx, w, h, c1, c2) => {
    const r = Math.min(w, h) / 2;
    tone(ctx, c => rrect(c, -r * 0.72, r * 0.55, r * 1.44, r * 0.42, 3), '#8a5a2b', 0, r * 0.75, r * 0.6, { dark: -0.3, ol: 1.8 });
    tone(ctx, c => circ(c, 0, -r * 0.14, r * 0.8), c1, 0, -r * 0.14, r * 0.8, { dark: -0.15, spec: false });
    tone(ctx, c => poly(c, [0, -r * 0.6, r * 0.3, r * 0.2, -r * 0.3, r * 0.2]), '#2e8f5a', 0, -r * 0.1, r * 0.3, { spec: false, ol: 1.3 });
    F(ctx, c2); ctx.beginPath(); for (const [x, y] of [[-0.5, -0.4], [0.45, -0.5], [-0.35, 0.05], [0.5, 0.1], [0.1, -0.75]]) circ(ctx, x * r, y * r, 1.1); ctx.fill();
    F(ctx, rgba('#ffffff', 0.6)); ctx.beginPath(); ell(ctx, -r * 0.38, -r * 0.55, r * 0.22, r * 0.12, -0.7); ctx.fill();
  };
  // Elixir: a heart-shaped flask with a gold cap.
  POL_SIL.elixir = (ctx, w, h, c1, c2) => {
    const hw = w / 2, hh = h / 2, k = Math.min(hw * 0.95, hh * 0.72);
    const cy = hh - k * 1.05;
    tone(ctx, c => rrect(c, -hw * 0.24, -hh * 0.78, hw * 0.48, hh * 0.62, 2), rgba('#e8f8ff', 0.85), 0, -hh * 0.5, hw * 0.24, { spec: false, ol: 1.8 });
    tone(ctx, c => rrect(c, -hw * 0.34, -hh, hw * 0.68, hh * 0.3, 3), c2, 0, -hh * 0.85, hw * 0.3, { spec: false, ol: 1.8 });
    tone(ctx, c => { c.moveTo(0, hh); c.bezierCurveTo(-k * 1.4, cy + k * 0.2, -k * 1.1, cy - k * 1.1, 0, cy - k * 0.45); c.bezierCurveTo(k * 1.1, cy - k * 1.1, k * 1.4, cy + k * 0.2, 0, hh); c.closePath(); }, c1, 0, cy, k, { dark: -0.3 });
    F(ctx, rgba('#ffffff', 0.55)); ctx.beginPath(); ell(ctx, -k * 0.45, cy - k * 0.25, k * 0.22, k * 0.12, -0.7); ctx.fill();
  };
  // Pet Rock: a rock with googly eyes and a bow. It loves you.
  POL_SIL.pet_rock = (ctx, w, h, c1, c2) => {
    IA.rock(ctx, w, h, c1, c2);
    const hw = w / 2, hh = h / 2, er = Math.max(2.2, Math.min(hw, hh) * 0.26);
    for (const s of [-1, 1]) { tone(ctx, c => circ(c, s * er * 1.1, -hh * 0.05, er), '#ffffff', s * er * 1.1, -hh * 0.05, er, { spec: false, ol: 1.3 }); F(ctx, INK); ctx.beginPath(); circ(ctx, s * er * 1.1 + er * 0.25, -hh * 0.05 + er * 0.3, er * 0.5); ctx.fill(); }
    tone(ctx, c => { c.moveTo(hw * 0.3, -hh * 0.62); c.lineTo(hw * 0.05, -hh * 0.85); c.lineTo(hw * 0.05, -hh * 0.4); c.closePath(); c.moveTo(hw * 0.3, -hh * 0.62); c.lineTo(hw * 0.55, -hh * 0.85); c.lineTo(hw * 0.55, -hh * 0.4); c.closePath(); }, c2, hw * 0.3, -hh * 0.62, hw * 0.25, { spec: false, ol: 1.2 });
    ctx.beginPath(); ctx.moveTo(-er, hh * 0.35); ctx.quadraticCurveTo(0, hh * 0.5, er, hh * 0.35); S(ctx, INK, 1.3); ctx.stroke();
  };
  // Pot Lid: a kitchen lid, a knob handle on top and a rolled rim.
  POL_SIL.pot_lid = (ctx, w, h, c1, c2) => {
    const r = Math.min(w, h) / 2;
    tone(ctx, c => circ(c, 0, 0, r * 0.96), c1, 0, 0, r, { dark: -0.3 });
    ctx.beginPath(); circ(ctx, 0, 0, r * 0.8); S(ctx, rgba('#ffffff', 0.45), 1.2); ctx.stroke();
    ctx.beginPath(); circ(ctx, 0, 0, r * 0.55); S(ctx, rgba(INK, 0.35), 1); ctx.stroke();
    tone(ctx, c => rrect(c, -r * 0.34, -r * 0.2, r * 0.68, r * 0.4, r * 0.18), c2, 0, 0, r * 0.3, { ol: 1.8 });
  };
  // Scrap Shield: a buckler patched with bolted scrap plates.
  POL_SIL.scrap_shield = (ctx, w, h, c1, c2) => {
    const r = Math.min(w, h) / 2;
    tone(ctx, c => circ(c, 0, 0, r * 0.96), c1, 0, 0, r, { dark: -0.35 });
    tone(ctx, c => poly(c, [-r * 0.7, -r * 0.5, r * 0.1, -r * 0.62, r * 0.05, r * 0.05, -r * 0.62, r * 0.12]), shade(c1, 0.3), -r * 0.3, -r * 0.25, r * 0.4, { spec: false, ol: 1.5 });
    tone(ctx, c => poly(c, [r * 0.05, r * 0.1, r * 0.7, -r * 0.15, r * 0.6, r * 0.6, 0, r * 0.7]), c2, r * 0.35, r * 0.3, r * 0.4, { spec: false, ol: 1.5 });
    F(ctx, INK); ctx.beginPath(); for (const [x, y] of [[-0.55, -0.4], [-0.05, -0.5], [-0.5, 0.02], [0.55, -0.05], [0.12, 0.55], [0.5, 0.45]]) circ(ctx, x * r, y * r, Math.max(0.9, r * 0.07)); ctx.fill();
  };
  // Junk Cannon: a stubby barrel on a wheel, scrap poking out of the muzzle.
  POL_SIL.junk_cannon = (ctx, w, h, c1, c2) => {
    const hw = w / 2, hh = h / 2;
    ctx.save(); ctx.rotate(-0.3);
    tone(ctx, c => rrect(c, -hw * 0.85, -hh * 0.42, hw * 1.6, hh * 0.84, hh * 0.3), c1, 0, 0, hw * 0.8, { dark: -0.35 });
    tone(ctx, c => rrect(c, hw * 0.62, -hh * 0.55, hw * 0.24, hh * 1.1, 2), shade(c1, -0.2), hw * 0.74, 0, hh * 0.5, { spec: false, ol: 1.8 });
    tone(ctx, c => circ(c, hw * 0.92, -hh * 0.1, hh * 0.26), '#8e8a86', hw * 0.92, -hh * 0.1, hh * 0.26, { spec: false, ol: 1.4 });
    ctx.restore();
    tone(ctx, c => circ(c, -hw * 0.15, hh * 0.5, hh * 0.45), c2, -hw * 0.15, hh * 0.5, hh * 0.45, { dark: -0.3, ol: 2 });
    F(ctx, INK); ctx.beginPath(); circ(ctx, -hw * 0.15, hh * 0.5, hh * 0.12); ctx.fill();
  };
  // Frost Pearl: a pearl with a cold sheen and a pale ring.
  POL_SIL.frost_pearl = (ctx, w, h, c1, c2) => {
    const r = Math.min(w, h) / 2;
    tone(ctx, c => circ(c, 0, 0, r * 0.9), c1, 0, 0, r, { dark: -0.18, spec: false });
    ctx.beginPath(); ctx.arc(0, 0, r * 0.55, Math.PI * 0.1, Math.PI * 0.9); S(ctx, rgba(c2, 0.9), Math.max(1.1, r * 0.18)); ctx.stroke();
    F(ctx, '#ffffff'); ctx.beginPath(); ell(ctx, -r * 0.3, -r * 0.35, r * 0.28, r * 0.16, -0.7); ctx.fill();
  };
  // Hoard Coin: a coin stamped with the Hoard's crown.
  POL_SIL.hoardcoin = (ctx, w, h, c1, c2) => {
    const r = Math.min(w, h) / 2;
    tone(ctx, c => circ(c, 0, 0, r), c1, 0, 0, r, { dark: -0.35 });
    tone(ctx, c => poly(c, [-r * 0.5, r * 0.3, -r * 0.55, -r * 0.3, -r * 0.25, 0, 0, -r * 0.45, r * 0.25, 0, r * 0.55, -r * 0.3, r * 0.5, r * 0.3]), c2, 0, 0, r * 0.4, { spec: false, ol: 1.3 });
  };
  // Brood Egg: a leathery egg with veins and a hairline crack.
  POL_SIL.broodegg = (ctx, w, h, c1, c2) => {
    IA.egg(ctx, w, h, c1, c2);
    const hw = w / 2, hh = h / 2;
    ctx.beginPath(); ctx.moveTo(-hw * 0.5, -hh * 0.2); ctx.quadraticCurveTo(-hw * 0.1, hh * 0.1, -hw * 0.3, hh * 0.6); ctx.moveTo(hw * 0.4, -hh * 0.5); ctx.quadraticCurveTo(hw * 0.1, 0, hw * 0.45, hh * 0.45);
    S(ctx, rgba(c2, 0.85), 1.3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-hw * 0.2, -hh * 0.85); ctx.lineTo(0, -hh * 0.6); ctx.lineTo(-hw * 0.1, -hh * 0.45); ctx.lineTo(hw * 0.12, -hh * 0.3); S(ctx, INK, 1.2); ctx.stroke();
  };
  // Glass Bead: a round bead with its hole bored through.
  POL_SIL.glass_bead = (ctx, w, h, c1, c2) => {
    const r = Math.min(w, h) / 2;
    tone(ctx, c => circ(c, 0, 0, r * 0.92), rgba(c1, 0.9), 0, 0, r, { dark: -0.25 });
    ctx.beginPath(); ell(ctx, 0, 0, r * 0.28, r * 0.42, 0); F(ctx, shade(c2, -0.3)); ctx.fill(); S(ctx, INK, 1.2); ctx.stroke();
  };

  /* ---- relic badges: a medallion per rarity around the emoji (round 5).
     common bronze, uncommon silver, rare gold (a sunburst edge), boss and
     legendary a turning rainbow, event jade. A shine sweeps across every
     few seconds (t given), each relic on its own phase. */
  const POL_BADGE = {
    c: { a: '#ffd2a1', b: '#c8804a', c: '#6b3a16', n: 8 },
    u: { a: '#ffffff', b: '#b8c3d2', c: '#586274', n: 12 },
    r: { a: '#fff2b0', b: '#ffc94d', c: '#9a6410', n: 16, burst: true },
    event: { a: '#d4ffe2', b: '#3ddc84', c: '#15603a', n: 10 },
    l: { a: '#ffffff', b: '#ff2e88', c: '#7a1a50', n: 16, burst: true, rainbow: true },
  };
  const POL_SHINE = { period: 4.6, dur: 0.75 };
  const polTier = (def) => (def && (def.rarity === 'boss' || def.rarity === 'l')) ? 'l' : (def && POL_BADGE[def.rarity] ? def.rarity : 'c');
  // Shine progress 0..1 while the sweep crosses this relic at time t, else -1.
  function polShine(def, t) {
    if (!(t >= 0)) return -1;
    const off = (polHash(def && def.id) % 1000) / 1000 * POL_SHINE.period;
    const u = ((t + off) % POL_SHINE.period) / POL_SHINE.dur;
    return u < 1 ? u : -1;
  }
  /* Does a relic badge drawn at time t look different from a still one?
     (the game redraws its DOM relic canvases only then) */
  function relicLive(def, t) { return !artImg('relic', def && def.id) && (polTier(def) === 'l' || polShine(def, t) >= 0); }
  function polBadge(ctx, def, r, t) {
    const tier = polTier(def), B = POL_BADGE[tier], tt = t >= 0 ? t : 0;
    ctx.lineJoin = 'round';
    // the rare / legendary sunburst edge
    if (B.burst) {
      ctx.beginPath(); star(ctx, 0, 0, r, B.n, 0.84);
      F(ctx, B.rainbow ? '#ffe066' : B.b); ctx.fill(); S(ctx, INK, 1.6); ctx.stroke();
    }
    const R0 = B.burst ? r * 0.86 : r;
    // the metal ring
    ctx.beginPath(); circ(ctx, 0, 0, R0);
    if (B.rainbow) {
      F(ctx, '#ff2e88'); ctx.fill();
      const n = 12, w = R0 * 0.24;
      for (let i = 0; i < n; i++) {
        const a0 = i * TAU / n + tt * 1.2;
        ctx.beginPath(); ctx.arc(0, 0, R0 - w / 2, a0, a0 + TAU / n + 0.02);
        S(ctx, 'hsl(' + Math.round((i * 360 / n + tt * 90) % 360) + ',95%,62%)', w); ctx.stroke();
      }
    } else {
      let g = B.b;
      try { const lg = ctx.createLinearGradient(-R0, -R0, R0, R0); lg.addColorStop(0, B.a); lg.addColorStop(0.45, B.b); lg.addColorStop(1, B.c); g = lg; } catch (e) { g = B.b; }
      ctx.fillStyle = FLAT || g; ctx.fill();
    }
    ctx.beginPath(); circ(ctx, 0, 0, R0); S(ctx, INK, Math.max(1.6, r * 0.09)); ctx.stroke();
    // studs round the ring
    F(ctx, B.rainbow ? '#ffffff' : B.c); ctx.beginPath();
    for (let i = 0; i < B.n; i++) { const a = i * TAU / B.n + (B.rainbow ? tt * 0.6 : 0); circ(ctx, Math.cos(a) * R0 * 0.88, Math.sin(a) * R0 * 0.88, Math.max(0.8, R0 * 0.045)); }
    ctx.fill();
    // the dark inner disc the emoji sits on
    const ri = R0 * 0.74;
    ctx.beginPath(); circ(ctx, 0, 0, ri);
    let g2 = '#1d1236';
    try { const rg = ctx.createRadialGradient(-ri * 0.3, -ri * 0.4, ri * 0.1, 0, 0, ri); rg.addColorStop(0, '#3a2660'); rg.addColorStop(1, '#130a24'); g2 = rg; } catch (e) { g2 = '#1d1236'; }
    ctx.fillStyle = FLAT || g2; ctx.fill(); S(ctx, INK, 1.4); ctx.stroke();
    ctx.beginPath(); circ(ctx, 0, 0, ri - 1.6); S(ctx, rgba(B.rainbow ? '#ffe066' : B.b, 0.7), Math.max(1, r * 0.04)); ctx.stroke();
    // a fixed specular on the ring (the metal reads even in a still)
    ctx.beginPath(); ctx.arc(0, 0, R0 * 0.9, Math.PI * 1.08, Math.PI * 1.42); S(ctx, rgba('#ffffff', 0.55), Math.max(1.2, r * 0.07)); ctx.stroke();
    // the glyph
    txt(ctx, String((def && def.icon) || '?'), 0, r * 0.06, Math.max(8, Math.round(ri * 1.3)), '#ffffff', true, 'center');
    if (B.rainbow) {
      for (let i = 0; i < 3; i++) {
        const a = tt * 0.9 + i * 2.1, k = 0.5 + 0.5 * Math.sin(tt * 4 + i * 2), x = Math.cos(a) * r * 0.62, y = Math.sin(a) * r * 0.62;
        F(ctx, rgba('#ffffff', 0.4 + 0.6 * k)); ctx.beginPath(); star(ctx, x, y, r * (0.06 + 0.07 * k), 4, 0.3); ctx.fill();
      }
    }
    // the shine sweep, clipped to the medallion
    const sh = polShine(def, t);
    if (sh >= 0) {
      const x = -r * 1.7 + sh * r * 3.4, bw = r * 0.34;
      ctx.save(); ctx.beginPath(); circ(ctx, 0, 0, R0); ctx.clip();
      ctx.beginPath(); poly(ctx, [x - bw, -r * 1.2, x, -r * 1.2, x - r * 0.5, r * 1.2, x - r * 0.5 - bw, r * 1.2]);
      F(ctx, rgba('#ffffff', 0.32)); ctx.fill();
      ctx.beginPath(); poly(ctx, [x + bw * 0.35, -r * 1.2, x + bw * 0.6, -r * 1.2, x - r * 0.5 + bw * 0.6, r * 1.2, x - r * 0.5 + bw * 0.35, r * 1.2]);
      F(ctx, rgba('#ffffff', 0.55)); ctx.fill();
      ctx.restore();
    }
    POL.stats.badge++;
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
    // its wrench (the fidget twirls it a full turn: LIFE.spin)
    ctx.save(); ctx.translate(-30, -46 + bob); ctx.rotate(-1.2 + Math.sin(t * 4) * 0.1 + LIFE.spin);
    wrench(ctx, 6, 0, 0.36, 0, true);
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
    const art = EA[def.look] || EA[def.art] || EA.blob;   // (def.look: The Machine's own drawing, SECRET)
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
      const key = (def.look && EA[def.look]) ? def.look : def.art;   // SECRET: The Machine has its own drawing (def.look)
      const art = EA[key] && key !== 'blob' ? EA[key] : EA.blob;
      const boss = def.tier === 'boss';
      const s = (def.size || 1) * (scale == null ? 1 : scale) * (boss ? 1.6 : 1);
      const p = enemyPal(def, key);
      const hurt = U.clamp(+st.hurt || 0, 0, 1), atk = U.clamp(+st.attack || 0, 0, 1), dead = U.clamp(+st.dead || 0, 0, 1);
      bestLife(def, key, t, st, x || 0, boss, dead);   // blink, fidget, breath, low hp (BESTIARY block)
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
      bestPose(ctx, art, t);   // the idle breath and this enemy's fidget (BESTIARY block)
      // PNG override: height = the nominal body box, feet on the origin.
      const img = artImg('enemy', def.id) || artImg('enemy', key);
      const ih = art.h, iw = img ? ih * imW(img) / imH(img) : 0;
      if (img) blit(ctx, img, -iw / 2, -ih, iw, ih);
      else art.draw(ctx, t, p, art === EA.blob ? (def.name || key) : null);
      bestHurtLook(ctx, art, t);   // sweat, cracks, dizzy stars at low hp (BESTIARY block)
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
    LIFE.blink = 0; LIFE.spin = 0; LIFE.fid = 0;   // the next art (a portrait, a claw face) blinks on its own
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
        if (left > 9) {
          // kept for good (the Claw Collector's case): a gold star, no clock
          ctx.beginPath(); star(ctx, ix + 9, iy - 9, 6, 5, 0.45); F(ctx, PAL.gold); ctx.fill(); S(ctx, INK, 1.2); ctx.stroke();
        } else if (left > 0) {
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
      // st.alarm (the Prize Master's final phase): the neon and the bulbs go red
      const alarm = st.alarm > 0;
      // the Prize Vault's skin and marquee (VAULT block): st.skin / st.mqId, else the equipped ones
      const skd = vLook('skin', st.skin), sk = skd ? skd.look : null, mqd = vLook('marquee', st.mqId);
      const t = st.t || 0, neon = alarm ? '#ff2e30' : (sk && sk.neon) || ACT_NEON[st.act] || (st.act && typeof st.act === 'string' ? st.act : PAL.pink);
      const w = c.w, h = c.h, f = c.frame;
      ctx.translate(x || 0, y || 0);
      ctx.lineJoin = 'round';
      // the static back (frame, neon tube, back panel, chute) is one cached
      // layer when the canvas can hold one, else drawn live (Polish and QA perf)
      const tilt = st.tilt || 0;
      const lay = cabLayer(ctx, c, neon, tilt, skd);
      if (lay) { try { ctx.drawImage(lay.cv, lay.x0, lay.y0, lay.lw, lay.lh); } catch (e) { /* stub canvas */ } }
      else cabStatic(ctx, c, neon, tilt, sk);
      if (sk && sk.rainbow && !alarm) vRainbowTube(ctx, c, t);
      // chasing bulbs around the frame; st.party (0..1, a double or a
      // jackpot) turns them into a fast rainbow slot-machine chase
      const party = U.clamp(+st.party || 0, 0, 1);
      cabBulbs(ctx, c, t, neon, alarm, party, sk, mqd ? mqd.look.bulbs : '');
      // marquee text in the top band
      if (party > 0.3 && st.marquee) {
        const mc = PARTY_COLS[Math.floor(t * 12) % PARTY_COLS.length];
        txt(ctx, st.marquee, w / 2, -f * 0.5 + 1, 13 + party * 3, mc, true, 'center', INK);
      } else if (st.noText) { /* a thumbnail: no words */ }
      else if (mqd && !alarm) vMarquee(ctx, mqd.look, w / 2, -f * 0.5 + 1, 13, t, neon);
      else txt(ctx, 'CLAWSPIRE', w / 2, -f * 0.5 + 1, 13, neon, true, 'center', INK);
      const cx = w - c.chuteW, dy = h - h * c.dividerH;
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
  // The cabinet's static back: the frame body, the neon tube, the back panel
  // (turned by a tilt), the floor wedges and the chute column. cabinetBack
  // draws it live or blits it from cabLayer.
  function cabStatic(ctx, c, neon, tilt, sk) {
    const w = c.w, h = c.h, f = c.frame;
    {
      ctx.lineJoin = 'round';
      // outer frame body (sk: a Prize Vault skin's look, VAULT block)
      ctx.beginPath(); rrect(ctx, -f, -f, w + f * 2, h + f * 2, 14);
      F(ctx, sk ? sk.frame : '#1d1233'); ctx.fill(); S(ctx, INK, 3); ctx.stroke();
      if (sk) vFrame(ctx, sk, c);
      // neon tube hugging the interior
      ctx.beginPath(); rrect(ctx, -f * 0.5, -f * 0.5, w + f, h + f, 8);
      S(ctx, rgba(neon, 0.25), 9); ctx.stroke(); S(ctx, neon, 3); ctx.stroke();
      // interior back panel
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
      F(ctx, sk ? sk.panel : '#0f0a1f'); ctx.fillRect(0, 0, w, h);
      ctx.translate(w / 2, h / 2); ctx.rotate((tilt || 0) * 0.06); ctx.translate(-w / 2, -h / 2);
      // back wall glow band
      F(ctx, rgba(neon, 0.08)); ctx.fillRect(0, 0, w, h * 0.35);
      // chevron floor band
      const fy = h * 0.72;
      F(ctx, '#1a1030'); ctx.fillRect(-w, fy, w * 3, h);
      ctx.beginPath();
      for (let i = -2; i * 40 < w + 80; i++) { const cx = i * 40; ctx.moveTo(cx, fy); ctx.lineTo(cx + 20, h); ctx.lineTo(cx + 40, fy); }
      S(ctx, rgba(neon, 0.35), 4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-w, fy); ctx.lineTo(w * 2, fy); S(ctx, rgba(neon, 0.5), 2); ctx.stroke();
      // dotted back panel (a skin's own pattern, VAULT block)
      if (sk) vPanel(ctx, sk, w, fy, neon);
      else {
        F(ctx, rgba('#ffffff', 0.05));
        ctx.beginPath(); for (let yy = 16; yy < fy; yy += 24) for (let xx = 16; xx < w; xx += 24) circ(ctx, xx, yy, 1.5); ctx.fill();
      }
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
    }
  }
  /* The cached static back, one offscreen canvas per (size, neon, tilt,
     device scale bucket), redrawn only when one of those changes. Returns
     null without a real canvas (headless, the tests' stub): the live path. */
  const CABL = { list: [], on: true };
  function devScale(ctx) {
    if (typeof ctx.getTransform !== 'function') return 0;
    let m = null;
    try { m = ctx.getTransform(); } catch (e) { m = null; }
    return m && (m.a || m.b) ? Math.hypot(m.a, m.b) : 0;
  }
  function cabLayer(ctx, c, neon, tilt, skd) {
    if (!CABL.on || FLAT || typeof document === 'undefined' || !document || !document.createElement) return null;
    const ds = devScale(ctx);
    if (!(ds > 0) || ds > 4) return null;
    const q = Math.ceil(ds * 4) / 4;
    const key = c.w + 'x' + c.h + ':' + c.frame + ':' + c.chuteW + ':' + c.dividerH + ':' + c.slopeW + ':' + c.slopeH + ':' + neon + ':' + tilt + ':' + q + (skd ? ':' + skd.id : '');
    for (const L of CABL.list) if (L.key === key) return L;
    const pad = 6, lw = c.w + c.frame * 2 + pad * 2, lh = c.h + c.frame * 2 + pad * 2;
    let cv = null, g = null;
    try { cv = document.createElement('canvas'); cv.width = Math.ceil(lw * q); cv.height = Math.ceil(lh * q); g = cv.getContext && cv.getContext('2d'); } catch (e) { g = null; }
    if (!g || typeof g.getTransform !== 'function') return null;
    g.scale(q, q); g.translate(c.frame + pad, c.frame + pad);
    try { cabStatic(g, c, neon, tilt, skd ? skd.look : null); } catch (e) { return null; }
    const L = { key, cv, x0: -c.frame - pad, y0: -c.frame - pad, lw, lh };
    CABL.list.push(L);
    if (CABL.list.length > 8) CABL.list.shift();   // a few acts, tilts and the alarm red
    return L;
  }
  /* The chasing bulbs, batched: one path for the dark ones, one per lit
     colour, then every glow under one additive composite (instead of a
     save / composite / restore per bulb). Same look as one at a time. */
  const BULB = { key: '', pts: [] };
  function cabBulbs(ctx, c, t, neon, alarm, party, sk, pat) {
    const w = c.w, h = c.h, f = c.frame, step = 26;
    const key = w + 'x' + h + ':' + f;
    if (BULB.key !== key) {
      BULB.key = key; BULB.pts.length = 0;
      for (let i = 0; i * step < w; i++) BULB.pts.push(i * step + 8, -f + 8);
      for (let i = 0; i * step < h; i++) BULB.pts.push(w + f - 8, i * step + 8);
      for (let i = 0; i * step < w; i++) BULB.pts.push(w - i * step - 8, h + f - 8);
      for (let i = 0; i * step < h; i++) BULB.pts.push(-f + 8, h - i * step - 8);
    }
    const P = BULB.pts, n = P.length / 2;
    const chase = Math.floor(accStrobe(t) * (8 + 26 * party)), mod = party > 0.05 ? 2 : 3, pty = party > 0.05;   // ACCESS: reduced flashing slows the strobe
    const r = 3.2 + party * 1.2;
    // a Prize Vault marquee's bulb pattern and a skin's bulb colours (VAULT block); the party and the alarm win
    const vp = !pty && !alarm && pat ? pat : '';
    const isOn = vp ? (k) => vBulbOn(vp, k, t, chase, mod) : (k) => ((k - chase) % mod + mod) % mod === 0;
    const rbw = !pty && !alarm && ((sk && sk.rainbow) || vp === 'rainbow');
    const litCol = (k) => (alarm ? '#ff2e30' : pty ? PARTY_COLS[(k + chase) % PARTY_COLS.length] : rbw ? RB[((k + Math.floor(t * 10)) % 6) * 4] : sk ? sk.glow : PAL.gold);
    // the dark bulbs
    ctx.beginPath();
    for (let k = 0; k < n; k++) if (!isOn(k)) circ(ctx, P[k * 2], P[k * 2 + 1], r);
    F(ctx, shade(neon, -0.55)); ctx.fill();
    // the lit ones, one path per colour
    const ncol = rbw ? 6 : pty && !alarm ? PARTY_COLS.length : 1;
    for (let ci = 0; ci < ncol; ci++) {
      ctx.beginPath();
      for (let k = 0; k < n; k++) if (isOn(k) && (ncol === 1 || (rbw ? (k + Math.floor(t * 10)) % 6 : (k + chase) % PARTY_COLS.length) === ci)) circ(ctx, P[k * 2], P[k * 2 + 1], r);
      F(ctx, alarm ? '#ff6a6a' : rbw ? RB[ci * 4] : pty ? PARTY_COLS[ci] : sk ? sk.bulb : '#fff6c0'); ctx.fill();
    }
    // their glows, additive, in one go
    const gr = 9 + party * 8;
    ctx.save();
    ctx.globalAlpha = 0.8;
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < n; k++) {
      if (!isOn(k)) continue;
      const sp = glowSprite(litCol(k), gr);
      if (!sp) break;
      try { ctx.drawImage(sp, P[k * 2] - gr - 1, P[k * 2 + 1] - gr - 1, gr * 2 + 2, gr * 2 + 2); } catch (e) { /* stub canvas */ }
    }
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
  const CHROME0 = '#c9d3e0';
  let CHROME = CHROME0;   // the claw's paint swaps it while one claw draws (VAULT block)
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
    // the steel, or the Prize Vault's paint (a rainbow runs along the prong; VAULT block)
    const body = PAINT.on && PAINT.fx === 'rainbow' && !o.ghost ? vRainbowStroke(ctx, ox + pts[0].x, oy + pts[0].y, ox + pts[pts.length - 1].x, oy + pts[pts.length - 1].y, PAINT.t) : CHROME;
    ctx.beginPath(); path(); S(ctx, o.ghost ? (PAINT.on ? shade(CHROME, -0.25) : '#8e98a8') : body, w); ctx.stroke();
    if (o.ghost) return;
    if (PAINT.on && PAINT.fx === 'stripe') { ctx.setLineDash([w * 0.9, w * 0.9]); ctx.beginPath(); path(); S(ctx, PAINT.c2, w * 0.8); ctx.stroke(); ctx.setLineDash([]); }
    // a darker seam down the middle reads as the bevel of a bent steel rod
    ctx.beginPath(); path(); S(ctx, shade(CHROME, -0.35), Math.max(1, w * 0.28)); ctx.stroke();
    for (let i = 1; i < pts.length - 1; i++) {
      const px = ox + pts[i].x, py = oy + pts[i].y, rr = Math.max(1.6, w * 0.26);
      tone(ctx, q => circ(q, px, py, rr), o.tri ? '#ffc94d' : PAINT.on ? PAINT.c2 : '#8e98a8', px, py, rr, { dark: -0.4, ol: 1.2, spec: false });
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
  /* ---- round 3: Lucky Lou's Luck meter (DESIGN.md "Lucky Lou and the
     synergy pass"). A column of clover lamps on the cabinet's left frame,
     centred on x, from y0 to y1 (stage px). st: {luck, max (10), t, pop 0..1
     (the newest lamp just lit), cash 0..1 (a cash out: a gold chase runs up
     and the plate reads CASH OUT), on (the meter is this crawler's gift; off,
     it only shows while Luck is held)}. Allocation free; never throws. */
  function luckMeter(ctx, x, y0, y1, st) {
    ctx.save();
    try {
      st = st || {};
      const max = Math.max(1, st.max | 0 || 10), luck = U.clamp(st.luck | 0, 0, max), t = st.t || 0;
      const pop = U.clamp(st.pop || 0, 0, 1), cash = U.clamp(st.cash || 0, 0, 1);
      const top = y0 + 26, step = (y1 - top) / max, r = Math.min(9, step * 0.36);
      // the plate: LUCK (or CASH OUT while it pays)
      tone(ctx, q => rrect(q, x - 13, y0, 26, 20, 5), cash > 0 ? PAL.gold : '#1a6b3a', x, y0 + 10, 12, { dark: -0.35, spec: false, ol: 2 });
      ctx.font = 'bold 7px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      F(ctx, cash > 0 ? INK : '#c8ffd8'); ctx.fillText(cash > 0 ? 'CASH' : 'LUCK', x, y0 + 7, 24);
      F(ctx, cash > 0 ? INK : '#ffffff'); ctx.font = 'bold 8px ' + FONT; ctx.fillText(cash > 0 ? 'OUT!' : String(luck), x, y0 + 15, 24);
      // the tube behind the lamps
      ctx.beginPath(); rrect(ctx, x - 11, top - 4, 22, y1 - top + 6, 10); F(ctx, '#0c1a12'); ctx.fill(); S(ctx, INK, 2); ctx.stroke();
      // lamps fill bottom up
      const chase = cash > 0 ? Math.floor((1 - cash) * 18) : -1;
      for (let i = 0; i < max; i++) {
        const cy = y1 - step * (i + 0.5), lit = i < luck;
        const hot = cash > 0 && ((chase - i) % 4 + 4) % 4 === 0;
        const newest = lit && i === luck - 1 && pop > 0;
        const rr = r * (newest ? 1 + pop * 0.45 : 1);
        if (lit || hot) glow(ctx, x, cy, rr * 2.4, hot ? PAL.gold : '#3ddc84', hot ? 0.9 : 0.35 + 0.15 * Math.sin(t * 4 + i));
        const col = hot ? PAL.gold : lit ? '#3ddc84' : '#1f3a2a';
        // four little leaves
        const o = rr * 0.42, lr = rr * 0.5;
        F(ctx, col);
        ctx.beginPath(); circ(ctx, x - o, cy - o, lr); circ(ctx, x + o, cy - o, lr); circ(ctx, x - o, cy + o, lr); circ(ctx, x + o, cy + o, lr); ctx.fill();
        S(ctx, INK, 1.2); ctx.stroke();
        if (lit || hot) { F(ctx, '#e8fff0'); ctx.beginPath(); circ(ctx, x - o * 0.9, cy - o * 1.1, lr * 0.3); ctx.fill(); }
      }
    } catch (e) { /* never throws */ }
    ctx.restore();
  }
  /* ---- claw types (DESIGN.md "Claw types"): each has its own body art. */
  const CLAW_DRAW = { classic: 1, tri: 1, scoop: 1, hand: 1, magnet: 1, hook: 1 };
  /* The cabinet's coin slot (centred at x, y, stage px): a chrome plate with
     a slot, a coin-return button and an INSERT COIN lamp. st: {t, coin 0..1
     (a coin sliding into the slot, 1 = just dropped in), flash 0..1 (the
     clunk: the lamp and slot light up)}. */
  function coinSlot(ctx, x, y, st) {
    ctx.save();
    try {
      st = st || {};
      const t = st.t || 0, coin = U.clamp(st.coin || 0, 0, 1), fl = U.clamp(st.flash || 0, 0, 1);
      tone(ctx, q => rrect(q, x - 26, y - 13, 52, 26, 6), CHROME, x, y, 22, { dark: -0.4 });
      // the INSERT COIN lamp bar (blinks; solid on the clunk)
      ctx.beginPath(); rrect(ctx, x - 22, y - 10.5, 44, 10, 3); F(ctx, '#1d1233'); ctx.fill();
      const on = fl > 0.05 || Math.floor(t * 2) % 2 === 0;
      F(ctx, on ? '#fff6c0' : shade(PAL.gold, -0.5));
      ctx.font = 'bold 6px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('INSERT COIN', x, y - 5.3, 40);
      // the slot, lit gold on the clunk, and the coin-return button
      ctx.beginPath(); rrect(ctx, x - 14, y + 3, 15, 4, 2); F(ctx, fl > 0.05 ? PAL.gold : INK); ctx.fill();
      if (fl > 0.05) glow(ctx, x - 6.5, y + 5, 18, PAL.gold, fl);
      tone(ctx, q => circ(q, x + 13, y + 5, 4.5), '#ff5a4a', x + 13, y + 5, 4.5, NOSPEC);
      if (coin > 0) {
        // the coin (st.coin runs 1 -> 0) drops edge-on into the slot and vanishes in it
        const cy = y - 3 - coin * 20;
        ctx.save(); ctx.beginPath(); ctx.rect(x - 20, y - 44, 40, 49); ctx.clip();
        tone(ctx, q => ell(q, x - 6.5, cy, 3.2, 7), PAL.gold, x - 6.5, cy, 5, NOSPEC);
        ctx.restore();
      }
    } catch (e) { /* never throws */ }
    ctx.restore();
  }
  // Where the Lucky Claw's flames sit on each type.
  function clawTips(type, rig, hub, prongs, s) {
    const out = [];
    if (!hub) return out;
    if (type === 'magnet') { for (let i = -1; i <= 1; i++) out.push({ x: hub.x + i * hub.r * 0.7, y: hub.y + hub.r * 0.75 }); return out; }
    if (type === 'hook') { const tp = rig.bodies && rig.bodies.tip; out.push(tp || { x: hub.x, y: hub.y + 28 * s }); return out; }
    for (const p of prongs) if (p && p.length) out.push(p[p.length - 1]);
    return out;
  }
  // How open a live rig (or a PHYS.clawPose) is, 0 closed .. 1 open.
  function openness(rig, type) {
    const T = typeof PHYS !== 'undefined' && PHYS.CLAW_TYPES ? PHYS.CLAW_TYPES[type] : null;
    if (rig.openU != null) return U.clamp(rig.openU, 0, 1);
    if (!T || !rig.ctl || !(T.open > T.closed)) return 1;
    return U.clamp(((rig.ctl.pL + rig.ctl.pR) * 0.5 - T.closed) / (T.open - T.closed), 0, 1);
  }
  /* A crackling electric arc from (x0, y0) to (x1, y1): a jittered zig-zag,
     cyan with a white core, flickering with t. */
  function arc(ctx, x0, y0, x1, y1, t, seed, a) {
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L, seg = 7;
    ctx.beginPath(); ctx.moveTo(x0, y0);
    for (let k = 1; k <= seg; k++) {
      const u = k / seg, wv = k === seg ? 0 : Math.sin(t * 43 + k * 2.7 + seed * 1.9) * 4.5 + Math.sin(t * 71 + k * 5.1 + seed) * 2;
      ctx.lineTo(x0 + dx * u + nx * wv, y0 + dy * u + ny * wv);
    }
    ctx.globalAlpha = a * (0.55 + 0.45 * Math.sin(t * 29 + seed * 1.3));
    S(ctx, PAL.cyan, 2.6); ctx.stroke(); S(ctx, '#ffffff', 1); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  /* The Magnet Crane: a red electromagnet drum on the cable with a hazard
     band and a copper-coil face plate. rig.field (0..1) lights the face
     cyan; arcs crackle to everything it holds (J.hold) and to the metal it
     tugs (J.pull), with a hum ring while it is live. */
  function magnetCrane(ctx, rig, hub, s, ox, oy, J, t) {
    if (!hub) return;
    const x = ox + hub.x, y = oy + hub.y, r = Math.max(6, hub.r);
    const f = U.clamp(rig.field != null ? rig.field : (J.field || 0), 0, 1);
    const w = r * 1.02, top = y - r * 0.86, bot = y + r * 0.58;
    if (f > 0.02) {
      glow(ctx, x, bot + r * 0.2, r * (2 + f * 1.4), PAL.cyan, 0.3 + 0.55 * f);
      // the hum: a soft ring pulsing out of the face
      const u = (t * 2.2) % 1;
      ctx.beginPath(); ell(ctx, x, bot + r * 0.2, r * (1.1 + u * 1.3), r * (0.35 + u * 0.4));
      ctx.globalAlpha = f * (1 - u) * 0.7; S(ctx, PAL.cyan, 2); ctx.stroke(); ctx.globalAlpha = 1;
    }
    // housing: a squat drum with a domed top
    tone(ctx, q => { q.moveTo(x - w, bot); q.lineTo(x - w, top + r * 0.35); q.quadraticCurveTo(x - w, top, x, top); q.quadraticCurveTo(x + w, top, x + w, top + r * 0.35); q.lineTo(x + w, bot); q.closePath(); }, PAINT.on ? CHROME : '#d8343a', x, y - r * 0.2, r, { dark: -0.35 });
    // hazard band
    const by = y - r * 0.1, bh = r * 0.34;
    ctx.save(); ctx.beginPath(); ctx.rect(x - w, by, w * 2, bh); ctx.clip();
    F(ctx, PAL.gold); ctx.fillRect(x - w, by, w * 2, bh);
    F(ctx, INK); ctx.beginPath();
    for (let i = -4; i < 5; i++) { const bx = x + i * r * 0.4; ctx.moveTo(bx, by); ctx.lineTo(bx + r * 0.2, by); ctx.lineTo(bx + r * 0.02, by + bh); ctx.lineTo(bx - r * 0.18, by + bh); ctx.closePath(); }
    ctx.fill(); ctx.restore();
    ctx.beginPath(); ctx.rect(x - w, by, w * 2, bh); S(ctx, INK, 1.5); ctx.stroke();
    // bolts on the dome
    F(ctx, '#ffd0d0'); ctx.beginPath(); circ(ctx, x - w * 0.55, top + r * 0.42, Math.max(1, r * 0.07)); circ(ctx, x + w * 0.55, top + r * 0.42, Math.max(1, r * 0.07)); ctx.fill();
    // face plate with three copper coil bars; it glows when live
    tone(ctx, q => rrect(q, x - w * 1.08, bot - r * 0.06, w * 2.16, r * 0.34, r * 0.12), '#4a4e58', x, bot + r * 0.1, w, NOSPEC);
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath(); rrect(ctx, x + i * w * 0.62 - w * 0.22, bot + r * 0.02, w * 0.44, r * 0.18, r * 0.06);
      F(ctx, f > 0.05 ? (Math.sin(t * 30 + i) > 0 ? '#bffcff' : PAL.cyan) : '#c8783a'); ctx.fill(); S(ctx, INK, 1); ctx.stroke();
    }
    // arcs to what it holds, and to the metal it is pulling
    const fx0 = x, fy0 = bot + r * 0.2;
    const nh = Math.min(J.holdN || 0, J.hold ? J.hold.length : 0);
    for (let i = 0; i < nh; i++) arc(ctx, fx0 + (i % 3 - 1) * w * 0.5, fy0, ox + J.hold[i].x, oy + J.hold[i].y, t, i + 1, 0.4 + 0.6 * f);
    const np = Math.min(J.pullN || 0, J.pull ? J.pull.length : 0);
    for (let i = 0; i < np; i++) arc(ctx, fx0, fy0, ox + J.pull[i].x, oy + J.pull[i].y, t, i + 7, 0.25 + 0.5 * f);
  }
  /* The Harpoon: a steel shaft under the rope's eye with a barbed head.
     A catch (J.hold) gets a little impact star at the barb. */
  function harpoon(ctx, rig, hub, s, ox, oy, J, t) {
    if (!hub) return;
    const tip = rig.bodies && rig.bodies.tip;
    const x = ox + hub.x, y = oy + hub.y, tx = tip ? ox + tip.x : x, ty = tip ? oy + tip.y : y + 28 * s;
    const hw = 9 * s + 3, hh = 15 * s + 4;
    limb(ctx, x, y, tx, ty - hh * 0.8, Math.max(2.5, 4 * s), '#8e98a8');
    // the eye the rope is tied through
    ctx.beginPath(); ctx.arc(x, y - 1, 4 * s + 2.5, 0, TAU); S(ctx, INK, 4.5); ctx.stroke(); S(ctx, CHROME, 2.2); ctx.stroke();
    // fletching-like collar under the eye
    tone(ctx, q => poly(q, [x - 5 * s - 2, y + 4, x + 5 * s + 2, y + 4, x + 3 * s + 1, y + 10 * s + 4, x - 3 * s - 1, y + 10 * s + 4]), '#ff5a4a', x, y + 7, 6, NOSPEC);
    // the barbed head
    tone(ctx, q => poly(q, [tx, ty + 3, tx - hw, ty - hh * 0.55, tx - hw * 0.35, ty - hh * 0.45, tx - hw * 0.8, ty - hh * 1.05,
      tx, ty - hh * 0.8, tx + hw * 0.8, ty - hh * 1.05, tx + hw * 0.35, ty - hh * 0.45, tx + hw, ty - hh * 0.55]), CHROME, tx, ty - hh * 0.4, hw, { dark: -0.4 });
    line(ctx, tx, ty - hh * 0.75, tx, ty + 1, shade(CHROME, -0.4), 1.2);
    if ((J.holdN || 0) > 0) {
      // speared: a star of impact lines where the barb went in
      S(ctx, '#fff6c0', 1.6);
      for (let i = 0; i < 5; i++) {
        const a = i * TAU / 5 + t * 1.5, r0 = hw * 0.9, r1 = hw * (1.5 + 0.3 * Math.sin(t * 12 + i));
        ctx.beginPath(); ctx.moveTo(tx + Math.cos(a) * r0, ty - hh * 0.3 + Math.sin(a) * r0); ctx.lineTo(tx + Math.cos(a) * r1, ty - hh * 0.3 + Math.sin(a) * r1); ctx.stroke();
      }
    }
  }
  /* One clamshell jaw of the Scoop: a painted steel shell (the curve closed
     by its chord), a thick rim along the curve, teeth at the lip. */
  function scoopJaw(ctx, pts, s, ox, oy, rubber) {
    if (!pts || pts.length < 2) return;
    const n = pts.length, cx = (pts[0].x + pts[n - 1].x) / 2, cy = (pts[0].y + pts[n - 1].y) / 2;
    // the shell is see-through enough to show the haul inside
    ctx.globalAlpha = 0.62;
    tone(ctx, q => { q.moveTo(ox + pts[0].x, oy + pts[0].y); for (let i = 1; i < n; i++) q.lineTo(ox + pts[i].x, oy + pts[i].y); q.closePath(); },
      PAINT.on ? CHROME : '#ffb02e', ox + cx, oy + cy, 22 * s + 4, { dark: -0.3, ol: 0 });
    ctx.globalAlpha = 1;
    const w = Math.max(3, 8 * s);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const path = () => { ctx.beginPath(); ctx.moveTo(ox + pts[0].x, oy + pts[0].y); for (let i = 1; i < n; i++) ctx.lineTo(ox + pts[i].x, oy + pts[i].y); };
    path(); S(ctx, INK, w + OL * 1.6); ctx.stroke();
    path(); S(ctx, PAINT.on ? shade(CHROME, -0.12) : '#e0902a', w); ctx.stroke();
    path(); S(ctx, 'rgba(255,255,255,0.35)', Math.max(1, w * 0.25)); ctx.stroke();
    // rivets on the shell
    F(ctx, '#7a4a10');
    ctx.beginPath(); for (let i = 1; i < n - 1; i++) circ(ctx, ox + (pts[i].x * 2 + cx) / 3, oy + (pts[i].y * 2 + cy) / 3, Math.max(1, 1.5 * s)); ctx.fill();
    // teeth (or a rubber lip) at the end of the curve
    const a = pts[n - 2], b = pts[n - 1], dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
    if (rubber) { line(ctx, ox + b.x - ux * 6 * s, oy + b.y - uy * 6 * s, ox + b.x + ux * 2, oy + b.y + uy * 2, '#ff5a4a', Math.max(2, w - 2)); return; }
    F(ctx, CHROME);
    ctx.beginPath();
    for (let i = 0; i < 2; i++) {
      const bx = ox + b.x - ux * i * 6 * s, by = oy + b.y - uy * i * 6 * s;
      ctx.moveTo(bx - uy * 2.5, by + ux * 2.5); ctx.lineTo(bx + ux * 6 * s + 2, by + uy * 6 * s + 2); ctx.lineTo(bx + uy * 2.5, by - ux * 2.5); ctx.closePath();
    }
    ctx.fill(); S(ctx, INK, 1.2); ctx.stroke();
  }
  /* The Grabber Hand: a cartoon rubber glove. Two back fingers, the palm
     with its stitching and a pink cuff, then the thumb and the index
     finger over the prong polylines, curling harder as the hand closes. */
  function glove(ctx, rig, hub, prongs, s, ox, oy, J, t) {
    if (!hub) return;
    const x = ox + hub.x, y = oy + hub.y, r = Math.max(6, hub.r);
    const curl = 1 - openness(rig, 'hand');
    const W = Math.max(5, 12 * s);
    const WHITE = PAINT.on ? CHROME : '#f6f2e8', BACK = PAINT.on ? shade(CHROME, -0.14) : '#dcd5c6';   // (a Prize Vault paint dyes the glove)
    // a finger through pts, each joint bent a bit more inward as it curls
    const finger = (pts, sd, col, k) => {
      if (!pts || pts.length < 2) return;
      const P = [{ x: ox + pts[0].x, y: oy + pts[0].y }];
      let ang = 0;
      for (let i = 1; i < pts.length; i++) {
        ang += sd * curl * 0.24;
        const vx = (pts[i].x - pts[i - 1].x) * k, vy = (pts[i].y - pts[i - 1].y) * k, c = Math.cos(ang), sn = Math.sin(ang);
        const p = P[i - 1];
        P.push({ x: p.x + vx * c - vy * sn, y: p.y + vx * sn + vy * c });
      }
      const path = () => { ctx.beginPath(); ctx.moveTo(P[0].x, P[0].y); for (let i = 1; i < P.length; i++) ctx.lineTo(P[i].x, P[i].y); };
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      path(); S(ctx, INK, W + OL * 1.8); ctx.stroke();
      path(); S(ctx, col, W); ctx.stroke();
      // knuckle creases and a shine along the finger
      S(ctx, 'rgba(18,9,31,0.35)', 1.2);
      for (let i = 1; i < P.length - 1; i++) {
        const dx = P[i + 1].x - P[i - 1].x, dy = P[i + 1].y - P[i - 1].y, L = Math.hypot(dx, dy) || 1, nx = -dy / L * W * 0.38, ny = dx / L * W * 0.38;
        ctx.beginPath(); ctx.moveTo(P[i].x - nx, P[i].y - ny); ctx.lineTo(P[i].x + nx * 0.2, P[i].y + ny * 0.2); ctx.stroke();
      }
      const e = P[P.length - 1];
      F(ctx, 'rgba(255,255,255,0.8)'); ctx.beginPath(); ctx.arc(e.x - W * 0.15, e.y - W * 0.12, Math.max(1, W * 0.16), 0, TAU); ctx.fill();
    };
    const L = prongs[0], R2 = prongs[1];
    if (L && R2 && L.length && R2.length) {
      // the two back fingers run between the thumb and the index finger
      for (const m of [0.36, 0.64]) {
        const mid = L.map((p, i) => ({ x: p.x + (R2[i].x - p.x) * m, y: p.y + (R2[i].y - p.y) * m }));
        finger(mid, m < 0.5 ? -1 : 1, BACK, 0.9);
      }
    }
    // palm, stitching, cuff
    tone(ctx, q => ell(q, x, y + r * 0.15, r * 1.25, r * 1.05), WHITE, x, y, r * 1.1, { dark: -0.18 });
    S(ctx, 'rgba(18,9,31,0.4)', 1.3);
    for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(x + i * r * 0.38, y - r * 0.35); ctx.lineTo(x + i * r * 0.32, y + r * 0.35); ctx.stroke(); }
    tone(ctx, q => rrect(q, x - r * 0.95, y - r * 1.5, r * 1.9, r * 0.62, r * 0.25), PAINT.on ? PAINT.c2 : '#ff5a9a', x, y - r * 1.2, r, { dark: -0.3 });
    S(ctx, 'rgba(18,9,31,0.35)', 1.2);
    for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(x + i * r * 0.34, y - r * 1.44); ctx.lineTo(x + i * r * 0.34, y - r * 0.94); ctx.stroke(); }
    // thumb and index finger in front
    finger(L, -1, WHITE, 1);
    finger(R2, 1, WHITE, 1);
    // a squish on a fresh grab (J.squish 0..1): little sweat drops of effort
    if (J.squish > 0) {
      F(ctx, rgba('#9fd8ff', J.squish));
      for (const sd of [-1, 1]) { ctx.beginPath(); ell(ctx, x + sd * r * 1.5, y - r * (0.4 + (1 - J.squish) * 0.8), 2, 3); ctx.fill(); }
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
      vPaintBegin(cfg, t);   // the Prize Vault's claw paint: cfg.paint, else the equipped one (VAULT block)
      // the claw type (DESIGN.md "Claw types"): rig.type, else the flags / cfg
      const type = CLAW_DRAW[rig.type] ? rig.type : CLAW_DRAW[flags.type] ? flags.type : CLAW_DRAW[cfg.clawType] ? cfg.clawType : 'classic';
      // parked: the whole claw swings a hair on its cable, like it is breathing
      if (J.idle > 0 && hub) {
        const a = Math.sin(t * 1.3) * 0.035 * J.idle;
        ctx.translate(ox + top.x, oy + top.y); ctx.rotate(a); ctx.translate(-(ox + top.x), -(oy + top.y));
      }
      // cable (the top end sways, the hub does not); a wobble bows it
      if (hub) {
        const mx = (top.x + hub.x) / 2 + (J.bend || 0), my = (top.y + hub.y) / 2;
        const endY = hub.y - hub.r * (type === 'hook' ? 1 : type === 'magnet' ? 0.8 : 0.6);
        ctx.beginPath(); ctx.moveTo(ox + top.x, oy + top.y); ctx.quadraticCurveTo(ox + mx, oy + my, ox + hub.x, oy + endY);
        if (type === 'hook') {
          // the harpoon hangs on a twisted rope, not a steel cable
          S(ctx, INK, 5.5); ctx.stroke(); S(ctx, '#c79a5a', 3); ctx.stroke();
          ctx.setLineDash([3, 4]); ctx.lineDashOffset = -hub.y * 0.6; S(ctx, '#7a5530', 1.6); ctx.stroke(); ctx.setLineDash([]);
        } else { S(ctx, INK, 5); ctx.stroke(); S(ctx, '#8e98a8', 2.2); ctx.stroke(); }
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
      // spin-up (a new turn, a jackpot twirl) turns the claw about its cable
      // (an x squash through two turns); the idle glass tap leans it at you
      const spin = U.clamp(J.spin || 0, 0, 1), tap = U.clamp(J.tap || 0, 0, 1);
      const bodyXf = !!hub && (spin > 0 || tap > 0);
      if (bodyXf) {
        const c2 = spin > 0 ? Math.cos((1 - spin) * TAU * 2) : 1, k = 1 + tap * 0.16;
        const sx = (Math.abs(c2) < 0.12 ? (c2 < 0 ? -0.12 : 0.12) : c2) * k;
        ctx.save(); ctx.translate(ox + hub.x, oy + hub.y); ctx.scale(sx, k); ctx.translate(-(ox + hub.x), -(oy + hub.y));
        if (spin > 0.05) glow(ctx, ox + hub.x, oy + hub.y, hub.r * 3.2, PAL.cyan, spin * 0.55);
      }
      if (flags.magnet && hub && type !== 'magnet') {
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
      // the body of each claw type (the ghost third finger sits behind the pair)
      if (PAINT.on) vPaintFx(ctx, hub, prongs, ox, oy, t, 0);   // a paint's glow behind it (VAULT block)
      if (type === 'magnet') magnetCrane(ctx, rig, hub, s, ox, oy, J, t);
      else if (type === 'hook') harpoon(ctx, rig, hub, s, ox, oy, J, t);
      else if (type === 'scoop') { for (const p of prongs) scoopJaw(ctx, p, s, ox, oy, !!flags.rubber); }
      else if (type === 'hand') glove(ctx, rig, hub, prongs, s, ox, oy, J, t);
      else {
        if (ghost) prongChain(ctx, ghost, s, ox, oy, { ghost: type !== 'tri', tri: type === 'tri' });
        for (const p of prongs) prongChain(ctx, p, s, ox, oy, { rubber: !!flags.rubber, tri: type === 'tri' });
      }
      if (J.lucky > 0) {
        // Lucky Claw: the fingertips (the magnet's rim, the barb) burn gold
        const tips = clawTips(type, rig, hub, prongs, s);
        for (const tip of tips) {
          const tx = ox + tip.x, ty = oy + tip.y;
          glow(ctx, tx, ty, 18, PAL.gold, 0.75 * J.lucky);
          flames(ctx, tx, ty + 3, 7 * s + 4, 12 * s + 6, t, tip.x * 0.07);
        }
      }
      if (PAINT.on) vPaintFx(ctx, hub, prongs, ox, oy, t, 1);   // a paint's sparkles and frost (VAULT block)
      // the hub
      if (hub) {
        const hx = ox + hub.x, hy = oy + hub.y, r = Math.max(4, hub.r);
        const sq = U.clamp(J.squash || 0, -1, 1);
        if (sq) { ctx.save(); ctx.translate(hx, hy); ctx.scale(1 + sq * 0.22, 1 - sq * 0.22); ctx.translate(-hx, -hy); }
        if (J.glow > 0) glow(ctx, hx, hy, r * 3, PAL.gold, J.glow);
        let headR = r, headY = hy - r * 1.02;
        if (type === 'classic' || type === 'tri') {
          if (type === 'tri') tone(ctx, q => star(q, hx, hy + r * 0.1, r * 1.45, 3, 0.62), '#ffc94d', hx, hy, r * 1.2, { dark: -0.4, spec: false });
          tone(ctx, q => circ(q, hx, hy, r), CHROME, hx, hy, r, { dark: -0.45 });
          tone(ctx, q => circ(q, hx, hy, r * 0.36), flags.magnet ? PAL.cyan : PAINT.on ? PAINT.c2 : '#8e98a8', hx, hy, r * 0.36, { dark: -0.4, ol: 1.5, spec: false });
          ctx.beginPath(); ctx.moveTo(hx - r * 0.18, hy); ctx.lineTo(hx + r * 0.18, hy); S(ctx, INK, 1.2); ctx.stroke();
        } else if (type === 'scoop') {
          // a yellow hydraulic block with its piston
          tone(ctx, q => rrect(q, hx - r * 1.15, hy - r * 0.8, r * 2.3, r * 1.45, r * 0.3), PAINT.on ? CHROME : '#ffb02e', hx, hy, r, { dark: -0.35 });
          ctx.beginPath(); ctx.rect(hx - r * 1.15, hy - r * 0.1, r * 2.3, r * 0.26); F(ctx, INK); ctx.fill();
          F(ctx, '#ffe066'); ctx.beginPath(); for (let i = -1; i <= 1; i += 2) circ(ctx, hx + i * r * 0.78, hy + r * 0.4, Math.max(1.2, r * 0.12)); ctx.fill();
          headY = hy - r * 1.3;
        } else if (type === 'magnet') { headR = r * 0.62; headY = hy - r * 0.86 - headR * 0.55; }
        else if (type === 'hand') { headR = Math.max(r * 0.8, 9); headY = hy - r * 1.55 - headR * 0.3; }
        else if (type === 'hook') { headR = Math.max(9.5 * s + 3, r); headY = hy - headR * 1.05; }
        clawHead(ctx, hx, headY, headR, J, t);
        if (sq) ctx.restore();
      }
      if (bodyXf) ctx.restore();
    } catch (e) { /* never throws */ }
    vPaintEnd();   // back to the steel for everything else (VAULT block)
    ctx.restore();
  }
  /* The claw's little robot head above the palm: a chrome dome with a dark
     visor and two LED eyes that show its mood (J.mood), blink, look where it
     travels, and a row of LEDs that chase on a loaded return (J.chase). */
  const MOOD_COL = { '': PAL.cyan, focus: PAL.cyan, happy: PAL.gold, sad: '#6f8cff', wow: PAL.pink, lucky: PAL.gold, sleepy: '#9b7bff' };
  function clawHead(ctx, x, y, r, J, t) {
    const w = r * 2.3, h = r * 1.35, mood = J.mood || '';
    const col = PAINT.on && PAINT.fx === 'stealth' ? '#ff2e30' : MOOD_COL[mood] || PAL.cyan;   // Stealth Black paint: red eyes (VAULT block)
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
      else if (mood === 'sleepy') { ctx.arc(cx, cy - er * 0.3, er, Math.PI * 0.15, Math.PI * 0.85); S(ctx, col, Math.max(1.3, er * 0.6)); ctx.stroke(); }
      else { ell(ctx, cx, cy, er, er * Math.max(0.12, 1 - blink)); F(ctx, col); ctx.fill(); }
    }
    if (mood === 'sleepy') {
      // zZ drifting up off the head
      for (let i = 0; i < 2; i++) {
        const u = (t * 0.5 + i * 0.5) % 1;
        ctx.globalAlpha = Math.sin(u * Math.PI);
        txt(ctx, 'z', x + w * 0.55 + u * r * 1.2, y - h * 0.6 - u * r * 2, Math.max(7, r * (0.55 + u * 0.4)), '#d9ccff', true, 'center', INK);
      }
      ctx.globalAlpha = 1;
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
      // ARCADE: the mini-game cabinets
      case 'plinko': case 'wheel': case 'slots': arcIcon(ctx, type, s, t); break;
      // PETS (round 5): whack-a-mole, skee-ball, the pet shop
      case 'moles': case 'skee': case 'petshop': petIcon(ctx, type, s, t); break;
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
          // the biome's props on lit land, under the pickup (BESTIARY block; map draws pass the tile seed)
          if (terr === 'land' && st.seed != null) { const g = groundOf(tile); if (g !== 'mountain') bestDecor(ctx, r, biomePal(st.biome), g, st.seed >>> 0, t, flat); }
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
          // ACCESS: a fight to come wears a warning triangle, a pickup a round plus (colour is never the only cue)
          if (ACC.mode !== 'off') { const ak = accTileKind(type); if (ak) accMark(ctx, ak, r * 0.5, -r * 0.46, Math.max(4, r * 0.19)); }
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
    if ((st && st.biome === 'machine') || (tile && tile.biome === 'machine')) return secTerrain(ctx, x, y, size, tile, st);   // the Back Room (SECRET)
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
  /* o (optional): {maxW, center, rows}. With maxW the chips wrap onto a
     second row (rows: 1 keeps one) instead of running into the next enemy's,
     and past the last row the last chip reads "+N"; center puts each row's
     middle on x (Polish and QA). */
  function statusPips(ctx, x, y, status, size, pop, o) {
    ctx.save();
    try {
      status = status || {}; size = size || 18;
      ctx.translate(x || 0, y || 0);
      let dx = 0, row = 0, k = 0;
      const hasData = typeof DATA !== 'undefined' && DATA && DATA.STATUS;
      const pw0 = size * 2.1, step = pw0 + 4;
      let total = 0;
      for (const id in status) if (status[id] > 0) total++;
      const per = o && o.maxW > 0 ? Math.max(1, Math.floor((o.maxW + 4) / step)) : total || 1;
      const cap = per * (o && o.rows === 1 ? 1 : 2), shown = total > cap ? cap - 1 : total;
      // chips per row: the first row is full or holds them all; the second holds the rest (and the +N chip)
      const rowN = (r) => (r === 0 ? Math.min(per, shown + (total > cap && cap === per ? 1 : 0)) : total > cap ? per : Math.max(0, shown - per));
      const x0 = (r) => (o && o.center ? -Math.max(0, rowN(r) * step - 4) / 2 : 0);
      if (o) dx = x0(0);
      for (const id in status) {
        const n = status[id];
        if (!(n > 0)) continue;
        if (o && k === per && row === 0) { row = 1; ctx.translate(0, size + 3); dx = x0(1); }
        if (o && k >= shown) {
          // the rest, as one chip
          ctx.beginPath(); rrect(ctx, dx, 0, pw0, size, size / 2); F(ctx, '#2a1a3a'); ctx.fill(); S(ctx, PAL.gold, 2); ctx.stroke();
          txt(ctx, '+' + (total - shown), dx + pw0 / 2, size / 2 + 0.5, size * 0.7, '#fff', true, 'center', INK);
          break;
        }
        k++;
        const d = hasData && DATA.STATUS[id];
        const fb = STATUS_FALLBACK[id] || ['?', '#8e98a8', 'debuff'];
        const icon = (d && d.icon) || fb[0], col = accC((d && d.color) || fb[1]), kind = (d && d.kind) || fb[2];
        const pw = size * 2.1;
        const pk = pop && pop[id] > 0 ? pop[id] : 0;
        if (pk) { const sc = 1 + Math.sin(pk * Math.PI) * 0.45; ctx.save(); ctx.translate(dx + pw / 2, size / 2 - Math.sin(pk * Math.PI) * 5); ctx.scale(sc, sc); ctx.translate(-dx - pw / 2, -size / 2); glow(ctx, dx + pw / 2, size / 2, size * 1.4, col, pk); }
        ctx.beginPath(); accChip(ctx, dx, 0, pw, size, kind);   // ACCESS: a debuff is angular in a colour-blind mode
        F(ctx, shade(col, -0.55)); ctx.fill();
        S(ctx, accC(kind === 'buff' ? PAL.cyan : PAL.pink), 2); ctx.stroke();
        if (ACC.mode !== 'off') accMark(ctx, kind === 'buff' ? 'up' : 'down', dx + pw - size * 0.2, size * 0.12, size * 0.2, accC(kind === 'buff' ? PAL.cyan : PAL.pink));
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
  const BIN_KINDS = { shake: 1, grease: 1, fog: 1, junk: 1, tilt: 1, steal: 1, freezeItem: 1, gulp: 1, bomb: 1, corrode: 1, jam: 1, eggs: 1,
    tickle: 1, glue: 1, ceiling: 1, plow: 1, vanish: 1, bury: 1, wheel: 1 };   // (the bestiary's too)
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
      F(ctx, enemy.charged ? '#5a1030' : '#1d1233'); ctx.fill(); S(ctx, enemy.charged ? accC(PAL.blood) : INK, 2.5); ctx.stroke();
      const cy = -bh / 2;
      const shakeX = k in BIN_KINDS ? Math.sin(t * 30) * 1.5 : 0;
      switch (k) {
        case 'attack': {
          ctx.save(); ctx.translate(-bw / 2 + 12, cy); ctx.rotate(-0.8); IA.sword(ctx, 22, 6, '#c9d3e0', '#8a5a2b'); ctx.restore();
          const v = enemy.charged && it.v != null ? it.v : it.v;
          txt(ctx, String(v == null ? '' : v) + (it.n > 1 ? 'x' + it.n : ''), 8, cy + 0.5, 14, enemy.charged ? accC(PAL.blood) : '#fff', true, 'center', INK);
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
          const up = k === 'buff', col = accC(up ? PAL.lime : PAL.pink), simg = artImg('status', it.s);
          if (simg) blitContain(ctx, simg, 0, cy, 22, 22);
          else tone(ctx, c => poly(c, up ? [0, cy - 9, 8, cy, 3, cy, 3, cy + 9, -3, cy + 9, -3, cy, -8, cy] : [0, cy + 9, 8, cy, 3, cy, 3, cy - 9, -3, cy - 9, -3, cy, -8, cy]), col, 0, cy, 8, { ol: 2, dark: -0.3 });
          break;
        }
        case 'heal': {
          tone(ctx, c => poly(c, [-3, cy - 9, 3, cy - 9, 3, cy - 3, 9, cy - 3, 9, cy + 3, 3, cy + 3, 3, cy + 9, -3, cy + 9, -3, cy + 3, -9, cy + 3, -9, cy - 3, -3, cy - 3]), accC(PAL.lime), -8, cy, 9, { ol: 2, dark: -0.3 });
          txt(ctx, String(it.v == null ? '' : it.v), 10, cy + 0.5, 14, '#fff', true, 'center', INK);
          break;
        }
        case 'charge': {
          glow(ctx, 0, cy, 18, accC(PAL.blood), 0.6 + Math.sin(t * 8) * 0.3);
          txt(ctx, '!', 0, cy + 1, 22, accC(PAL.blood), true, 'center', INK);
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
          if (bestIntentIcon(ctx, k, it, cy, t, shakeX)) break;   // the bestiary's machine tricks (BESTIARY block)
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
      // A boss signature rides on this action: a pulsing ribbon over the bubble.
      if (C && C.sigNext && enemy.def && enemy.def.sig && C.sigNext(enemy)) {
        const si = C.sigInfo ? C.sigInfo(enemy) : null;
        const label = si ? (si.id === 'machine' ? si.sign : si.part === 'lid' ? 'CHUTE ICE' : si.part === 'rail' ? 'RAIL ICE' : si.sign) : 'SPECIAL';   // (The Machine signs its own: SECRET)
        const col = SIG_COL[enemy.def.sig.id] || PAL.gold, pul = 1 + Math.abs(Math.sin(t * 5)) * 0.08;
        const lw = Math.max(60, String(label).length * 8 + 26);
        // left of the bubble (the affix chips ride on its right; above it is the top bar)
        ctx.save(); ctx.translate(-bw / 2 - lw / 2 - 6, cy); ctx.scale(pul, pul);
        glow(ctx, 0, 0, lw * 0.6, col, 0.4 + Math.sin(t * 7) * 0.15);
        ctx.beginPath(); rrect(ctx, -lw / 2, -10, lw, 20, 10); F(ctx, shade(col, -0.62)); ctx.fill(); S(ctx, col, 2); ctx.stroke();
        txt(ctx, String(label), 0, 0.5, 11, col, true, 'center', INK);
        ctx.restore();
      }
      bestIntentRide(ctx, enemy, bw, cy, t);   // the Claw Collector's claw chip (BESTIARY block)
    } catch (e) { /* */ }
    ctx.restore();
  }
  const CHAR_COL = { knight: '#3b6fd6', alchemist: '#5ab82e', rogue: '#7a3b9c', gambler: '#1f8a4c' };
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
        } else if (charId === 'gambler') {
          // Lucky Lou: slick hair, a green dealer's visor with a card in the
          // band, one wink, a pencil moustache, a gold tooth and a bow tie
          tone(ctx, c => rrect(c, -6, 10, 12, 7, 3), '#ff2e4a', 0, 13, 6, { ol: 1.5, spec: false });
          tone(ctx, c => circ(c, 0, -5, 13), '#e8b890', 0, -5, 13, { dark: -0.25 });
          tone(ctx, c => { c.moveTo(-13, -8); c.quadraticCurveTo(-14, -22, 0, -21); c.quadraticCurveTo(14, -22, 13, -8); c.quadraticCurveTo(0, -14, -13, -8); c.closePath(); }, '#2a1a12', 0, -15, 12, { dark: -0.2, spec: false });
          ctx.save(); ctx.globalAlpha = FLAT ? 1 : 0.82;
          tone(ctx, c => poly(c, [-17, -12, 17, -12, 12, -4, -12, -4]), '#3ddc84', 0, -8, 14, { dark: -0.25, spec: false, ol: 2 });
          ctx.restore();
          tone(ctx, c => rrect(c, -14, -14, 28, 3, 1.5), '#1a6b3a', 0, -13, 14, { ol: 1.5, spec: false });
          ctx.save(); ctx.translate(10, -19); ctx.rotate(0.35);
          tone(ctx, c => rrect(c, -3.5, -5, 7, 10, 1.5), '#fff8ec', 0, 0, 5, { ol: 1.2, spec: false });
          F(ctx, '#ff2e4a'); ctx.beginPath(); poly(ctx, [0, -2.6, 1.8, 0, 0, 2.6, -1.8, 0]); ctx.fill();
          ctx.restore();
          F(ctx, INK); ctx.beginPath(); circ(ctx, 5, -1, 1.7); ctx.fill();
          ctx.beginPath(); ctx.moveTo(-7.5, -1); ctx.quadraticCurveTo(-5, 1, -2.5, -1); S(ctx, INK, 1.6); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(-6, 3.5); ctx.quadraticCurveTo(0, 2, 6, 3.5); S(ctx, '#2a1a12', 1.8); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(-5, 6); ctx.quadraticCurveTo(0, 10, 6, 5.5); S(ctx, INK, 1.5); ctx.stroke();
          F(ctx, PAL.gold); ctx.beginPath(); rrect(ctx, 1.2, 6.3, 2.4, 2.2, 0.6); ctx.fill();
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
      vOutfit(ctx, charId, r, t);   // the Prize Vault outfit on top (VAULT block)
    } catch (e) { /* */ }
    ctx.restore();
  }
  const RARITY_COL = { c: '#8e98a8', u: '#2ee6d6', r: '#ffc94d', l: '#ff2e88', boss: '#ff5a4a', event: '#a6ff5e' };
  /* RENDER.relicIcon(ctx, def, x, y, size, t): t (seconds) animates the
     badge's shine and the legendary rainbow; without it the badge is still. */
  function relicIcon(ctx, def, x, y, size, t) {
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
      } else if (POL.on) {
        polBadge(ctx, def, r, t);   // POLISH (round 5): the rarity medallion
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
    const texts = []; for (let i = 0; i < MAXT; i++) texts.push({ x: 0, y: 0, str: '', col: '#fff', life: 0, max: 1, size: 20, dy: -40, mode: 0, vx: 0, vy: 0, g: 0, crit: false, icon: '', ox: 0, oy: 0,
      lay: false, lx: 0, ly: 0, n: 1, base: '', born: 0, born0: 0, pop: 0, w: 0, h: 0, ms: '', mm: -1, hide: false });
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
    const api = { reduced: false, lite: false, MAXP };
    const cycle = [PAL.pink, PAL.cyan, PAL.gold, PAL.lime, '#9b7bff', '#ffffff'];

    // One pooled particle (the oldest live one when the pool is full). In
    // lite mode (api.lite: the game's frame governor saw slow frames) the
    // pool is half as deep.
    function spawn() {
      if (pn < (api.lite ? MAXP >> 1 : MAXP)) return parts[pn++];
      pSpawn = (pSpawn + 1) % pn;
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
    const cnt = (n, o) => Math.max(1, Math.round(n * (o && o.n != null ? o.n : 1) * (api.reduced ? 0.35 : api.lite ? 0.5 : 1)));
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
      str = String(str); col = accC(col || '#fff');   // ACCESS: the colour-blind palette
      const lay = !o.phys && !o.free && api.layout;
      // the same label again within a moment merges into the live one ("x2")
      if (lay && !o.noMerge) {
        const mode = o.badge ? 2 : 0;
        for (let i = 0; i < tn; i++) {
          const q = texts[i];
          if (!q.lay || q.base !== str || q.col !== col || q.mode !== mode || clock - q.born > LAYOUT.merge || q.life <= 0) continue;
          if (Math.abs(q.x - x) > LAYOUT.mergeR || Math.abs(q.y - y) > LAYOUT.mergeR || (o.badge && q.icon !== String(o.icon == null ? '' : o.icon))) continue;
          q.n++; q.str = str + ' x' + q.n; q.life = Math.max(q.life, q.max * 0.75); q.pop = 1; q.born = clock;
          return q;
        }
      }
      const p = tn < MAXT ? texts[tn++] : texts[0];
      p.x = x; p.y = y; p.str = str; p.col = col; p.life = p.max = o.life || 1; p.size = (o.size || (o.big ? 28 : 20)) * ACC.textK; p.dy = o.dy == null ? -46 : o.dy;   // ACCESS: the text size
      p.mode = o.phys ? 1 : 0; p.crit = !!o.crit; p.icon = ''; p.ox = p.oy = 0;
      p.vx = o.vx == null ? (rnd() - 0.5) * 120 : o.vx; p.vy = o.vy == null ? -300 - rnd() * 80 : o.vy; p.g = o.gravity == null ? 900 : o.gravity;
      p.lay = lay; p.lx = 0; p.ly = 0; p.n = 1; p.base = str; p.born = clock; p.born0 = ++seq; p.pop = 0; p.ms = ''; p.mm = -1; p.hide = false;
      if (lay) {
        // a long label lives longer (there is more to read) and shrinks to fit the screen
        p.life = p.max = Math.min(LAYOUT.lifeMax, Math.max(p.max, LAYOUT.life0 + str.length * LAYOUT.lifeK));
        const w = textW(str, p.size, !!o.badge, o.badge && o.icon);
        if (w > LAYOUT.maxW) p.size *= LAYOUT.maxW / w;
        if (o.badge) { p.mode = 2; p.icon = o.icon == null ? '' : String(o.icon); }
        layoutPass();
      }
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
      const p = api.text(x, y, str, col, { life: o.life || 1.4, size: o.size || 15, dy: o.dy == null ? -64 : o.dy, badge: true, icon, free: o.free });
      p.mode = 2; p.icon = icon == null ? '' : String(icon);
      return p;
    };
    /* ---- the label layout manager. Labels (the classic texts and the
       badges, not the physics damage numbers) reserve their rect every
       frame, oldest first: a label that would overlap an older one, a keep
       out zone (the cabinet marquee, the HUD) or the screen edge is nudged
       to the nearest free spot above or below, and eases back toward its own
       path when that frees up. The same label again within LAYOUT.merge s
       merges into the live one ("x2"); long labels shrink to fit the width
       and live longer. o.free opts a label out. */
    const LAYOUT = { merge: 0.5, mergeR: 120, maxW: 516, life0: 0.55, lifeK: 0.055, lifeMax: 2.8, pad: 3, edge: 6, back: 0.9, sw: 540, sh: 960 };
    api.layout = true;
    api.LAYOUT = LAYOUT;
    let clock = 0, seq = 0;
    const zones = [];
    /* A keep-out rect for labels (stage px): zone(id, x0, y0, x1, y1);
       zone(id) removes it. */
    api.zone = (id, x0, y0, x1, y1) => {
      for (let i = zones.length - 1; i >= 0; i--) if (zones[i].id === id) zones.splice(i, 1);
      if (x1 > x0 && y1 > y0) zones.push({ id, x0, y0, x1, y1 });
    };
    api.zones = () => zones.slice();
    // Estimated drawn width of a label (bold system font, ~0.62 em per glyph).
    function textW(str, size, badge, icon) {
      const n = String(str).length;
      if (badge) { const tw = Math.min(260, 15 * 0.6 * n + 8); return (tw + (icon ? 30 : 12)) * size / 15; }
      return n * size * 0.62 + 6;
    }
    // A label's rect size, cached until its text changes (a merge renames it).
    function dims(p) {
      if (p.ms === p.str && p.mm === p.mode) return;
      p.ms = p.str; p.mm = p.mode;
      p.w = textW(p.str, p.size, p.mode === 2, p.icon);
      p.h = p.mode === 2 ? 28 * p.size / 15 : p.size * 1.2 + 4;
    }
    // Where the label sits on its own path (no nudge): its centre.
    const natY = (p) => p.y + p.dy * U.ease.outCubic(U.clamp(1 - p.life / p.max, 0, 1));
    const order = [], placed = [], ivs = [];
    for (let i = 0; i < MAXT; i++) { placed.push({ x0: 0, y0: 0, x1: 0, y1: 0 }); }
    for (let i = 0; i < MAXT + 16; i++) ivs.push({ lo: 0, hi: 0 });
    let np = 0;
    function blocked(x0, y0, x1, y1) {
      const pd = LAYOUT.pad;
      for (let i = 0; i < np; i++) { const r = placed[i]; if (x0 < r.x1 + pd && x1 > r.x0 - pd && y0 < r.y1 + pd && y1 > r.y0 - pd) return true; }
      for (const z of zones) if (x0 < z.x1 && x1 > z.x0 && y0 < z.y1 && y1 > z.y0) return true;
      return y0 < LAYOUT.edge || y1 > LAYOUT.sh - LAYOUT.edge;
    }
    // The nearest free top for a label of height h across [x0, x1], from top0.
    function freeTop(x0, x1, h, top0) {
      const pd = LAYOUT.pad;
      let n = 0;
      const add = (lo, hi) => { if (n < ivs.length) { ivs[n].lo = lo; ivs[n].hi = hi; n++; } };
      for (let i = 0; i < np; i++) { const r = placed[i]; if (x0 < r.x1 + pd && x1 > r.x0 - pd) add(r.y0 - pd - h, r.y1 + pd); }
      for (const z of zones) if (x0 < z.x1 && x1 > z.x0) add(z.y0 - h, z.y1);
      const lo0 = LAYOUT.edge, hi0 = LAYOUT.sh - LAYOUT.edge - h;
      // walk the forbidden intervals that chain through top0, both ways
      let up = top0, down = top0, moved = true, guard = 0;
      while (moved && guard++ < 64) {
        moved = false;
        for (let i = 0; i < n; i++) { const v = ivs[i]; if (up > v.lo && up < v.hi) { up = v.lo; moved = true; } }
      }
      moved = true; guard = 0;
      while (moved && guard++ < 64) {
        moved = false;
        for (let i = 0; i < n; i++) { const v = ivs[i]; if (down > v.lo && down < v.hi) { down = v.hi; moved = true; } }
      }
      const upOk = up >= lo0, downOk = down <= hi0;
      if (upOk && downOk) return top0 - up <= down - top0 ? up : down;
      if (upOk) return up;
      if (downOk) return down;
      return NaN;   // no room anywhere in this column
    }
    /* Place every live label, oldest first (see above). */
    function layoutPass() {
      order.length = 0;
      for (let i = 0; i < tn; i++) if (texts[i].lay && texts[i].life > 0) order.push(texts[i]);
      order.sort((a, b) => a.born0 - b.born0);
      np = 0;
      for (const p of order) {
        dims(p);
        const w = p.w, h = p.h, cy = natY(p);
        // keep it on the screen sideways
        let x0 = p.x - w / 2;
        p.lx = x0 < LAYOUT.edge ? LAYOUT.edge - x0 : x0 + w > LAYOUT.sw - LAYOUT.edge ? LAYOUT.sw - LAYOUT.edge - (x0 + w) : 0;
        x0 += p.lx;
        const x1 = x0 + w, nat = cy - h / 2;
        let top = nat + p.ly;
        if (!blocked(x0, top, x1, top + h)) {
          // free where it is: drift back toward its own path while that stays free
          if (p.ly !== 0) {
            const back = nat + p.ly * LAYOUT.back;
            if (!blocked(x0, back, x1, back + h)) top = Math.abs(p.ly) < 0.5 && !blocked(x0, nat, x1, nat + h) ? nat : back;
          }
        } else top = freeTop(x0, x1, h, top);
        if (!(top === top)) {
          // the screen is full: this one waits (hidden) while the oldest label hurries off
          p.hide = true;
          for (const q of order) if (!q.hide && q !== p) { if (q.life > 0.25) q.life = 0.25; break; }
          continue;
        }
        p.hide = false;
        p.ly = top - nat;
        if (np < placed.length) { const r = placed[np++]; r.x0 = x0; r.y0 = top; r.x1 = x1; r.y1 = top + h; r.str = p.str; }
      }
    }
    // The laid-out rects of the live labels (tests and debug): [{x0, y0, x1, y1, str}]
    api.labels = () => {
      layoutPass();
      const out = [];
      for (let i = 0; i < np; i++) out.push({ x0: placed[i].x0, y0: placed[i].y0, x1: placed[i].x1, y1: placed[i].y1, str: placed[i].str || '' });
      return out;
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
      p.x = x; p.y = y; p.col = accC(col || '#fff'); p.r0 = o.r0 == null ? 6 : o.r0; p.r1 = o.r1 == null ? 60 : o.r1;
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
    api.flash = (col, a) => { a = a == null ? 0.5 : a; if (api.reduced) a = Math.min(a, 0.12); if (ACC.noFlash) a = Math.min(a, ACC_FLASH); flashCol = col || '#fff'; flashA = Math.max(flashA, a); };   // ACCESS: reduced flashing caps it too
    // A pulse of colour on the screen edges (a hit on the player).
    api.vignette = (col, a) => { vigCol = col || '#ff2e30'; a = a == null ? 0.6 : a; if (ACC.noFlash) a = Math.min(a, ACC_VIG); vigA = Math.max(vigA, a); };
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
        if (p.pop > 0) p.pop = Math.max(0, p.pop - dt * 5);
        i++;
      }
      clock += dt;
      if (api.layout && tn) layoutPass();
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
          if (p.lay && p.hide) continue;   // waiting for room (the layout manager)
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
            const sc = U.ease.outBack(Math.min(1, u * 5)) * (p.size / 15) * (1 + p.pop * 0.25);
            ctx.translate(p.x + p.lx, p.y + p.dy * U.ease.outCubic(u) + p.ly); ctx.scale(sc, sc);
            ctx.font = 'bold 15px ' + FONT;
            const tw = Math.min(260, 15 * 0.6 * p.str.length + 8), w = tw + (p.icon ? 30 : 12);
            ctx.beginPath(); rrect(ctx, -w / 2, -14, w, 28, 14);
            ctx.fillStyle = 'rgba(18,9,31,0.92)'; ctx.fill(); ctx.strokeStyle = p.col; ctx.lineWidth = 2.5; ctx.stroke();
            if (p.icon) { ctx.font = 'bold 16px ' + FONT; ctx.fillStyle = '#ffffff'; ctx.fillText(p.icon, -w / 2 + 15, 1); ctx.font = 'bold 15px ' + FONT; }
            ctx.fillStyle = p.col; ctx.fillText(p.str, p.icon ? 9 : 0, 1);
          } else {
            let sc = U.ease.outBack(Math.min(1, u * 3)) * (p.size / 20) * (1 + p.pop * 0.3);
            if (p.lay && p.w > 0) {
              // never wider than the rect the layout reserved for it
              const mw = ctx.measureText(p.str).width * (p.size / 20);
              if (mw > p.w - 4 && mw > 0) sc *= (p.w - 4) / mw;
            }
            ctx.translate(p.x + p.lx, p.y + p.dy * U.ease.outCubic(u) + p.ly); ctx.scale(sc, sc);
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

  /* ========================================================= BOSSES */
  /* Boss and elite spectacle (DESIGN.md "Bosses"): the versus card, the
     cabinet signs and the four signature looks inside the machine, the elite
     / boss badge, red hot items and the death finale's title card. Pure
     functions of their arguments (the game passes the clocks), and every
     one survives the no-op test context. */
  const SIG_COL = { spill: PAL.gold, heat: '#ff8a2b', ice: '#8dfff5', rig: PAL.pink };
  const VS = { slide: 0.32, slam: 0.36, name: 0.58, taunt: 0.8, badges: 1.0, exit: 0.3 };
  // A tiny seeded LCG for flicker (lightning bolts, sparks): same seed, same shape.
  function lcg(seed) { let s = (seed >>> 0) || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  // A jagged lightning bolt from (x0, y0) to (x1, y1), drawn glow then core.
  function bolt(ctx, x0, y0, x1, y1, seed, w, col, a) {
    const r = lcg(seed), n = 9, dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
    ctx.save();
    ctx.globalAlpha = a == null ? 1 : a;
    ctx.globalCompositeOperation = 'lighter';
    ctx.beginPath(); ctx.moveTo(x0, y0);
    for (let i = 1; i < n; i++) { const k = i / n, o = (r() - 0.5) * len * 0.22; ctx.lineTo(x0 + dx * k + nx * o, y0 + dy * k + ny * o); }
    ctx.lineTo(x1, y1);
    ctx.lineJoin = 'miter';
    S(ctx, rgba(col, 0.35), w * 3.5); ctx.stroke();
    S(ctx, col, w * 1.4); ctx.stroke();
    S(ctx, '#ffffff', w * 0.6); ctx.stroke();
    ctx.restore();
  }
  // Chrome lettering (the logo's look): pink under-glow, ink rim, a white top half, a coloured bottom half.
  function chrome(ctx, s, x, y, size, low, glowCol) {
    const sp = chromeSprite(ctx, s, size, low, glowCol);
    if (sp) { try { ctx.drawImage(sp.cv, x - sp.cx / sp.q, y - sp.cy / sp.q, sp.cv.width / sp.q, sp.cv.height / sp.q); return; } catch (e) { /* stub canvas: draw it live */ } }
    chromeLive(ctx, s, x, y, size, low, glowCol);
  }
  /* The chrome title as a cached sprite (Polish and QA perf): five passes of
     big stroked, clipped text are the costliest thing on the versus card and
     the finale, and the words never change while they slam in. One sprite
     per (text, size, colours, device scale in half steps); live without a
     real canvas. */
  const CHROME_SPR = new Map();
  function chromeSprite(ctx, s, size, low, glowCol) {
    if (FLAT || typeof document === 'undefined' || !document || !document.createElement) return null;
    const ds = devScale(ctx);
    if (!(ds > 0) || ds > 8) return null;
    const q = Math.ceil(ds * 2) / 2;
    const key = s + '|' + size + '|' + (low || '') + '|' + (glowCol || '') + '|' + q;
    let sp = CHROME_SPR.get(key);
    if (sp) return sp;
    let cv = null, g = null;
    try { cv = document.createElement('canvas'); g = cv.getContext && cv.getContext('2d'); } catch (e) { g = null; }
    if (!g || typeof g.measureText !== 'function' || typeof g.getTransform !== 'function') return null;
    g.font = '900 ' + size + 'px ' + FONT;
    const tw = (g.measureText(s).width || size * s.length * 0.7) + size * 0.4 + 8, th = size * 1.5 + 8;
    cv.width = Math.ceil(tw * q); cv.height = Math.ceil(th * q);
    g.scale(q, q);
    chromeLive(g, s, tw / 2, th / 2, size, low, glowCol);
    sp = { cv, cx: (tw / 2) * q, cy: (th / 2) * q, q };
    CHROME_SPR.set(key, sp);
    if (CHROME_SPR.size > 48) CHROME_SPR.delete(CHROME_SPR.keys().next().value);
    return sp;
  }
  function chromeLive(ctx, s, x, y, size, low, glowCol) {
    ctx.save();
    ctx.font = '900 ' + size + 'px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    if (glowCol) { ctx.strokeStyle = rgba(glowCol, 0.45); ctx.lineWidth = size * 0.32; ctx.strokeText(s, x, y); }
    ctx.strokeStyle = INK; ctx.lineWidth = size * 0.17; ctx.strokeText(s, x, y);
    ctx.fillStyle = CHROME; ctx.fillText(s, x, y);
    ctx.save(); ctx.beginPath(); ctx.rect(x - 2000, y - size * 0.55, 4000, size * 0.47); ctx.clip();
    ctx.fillStyle = '#ffffff'; ctx.fillText(s, x, y); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.rect(x - 2000, y + size * 0.06, 4000, size * 0.5); ctx.clip();
    ctx.fillStyle = low || PAL.pink; ctx.fillText(s, x, y); ctx.restore();
    ctx.strokeStyle = rgba('#ffffff', 0.55); ctx.lineWidth = 1.5; ctx.strokeText(s, x, y);
    ctx.restore();
  }
  // Diagonal hazard stripes filling the rect (x, y, w, h), scrolling with t.
  function stripes(ctx, x, y, w, h, c1, c2, t) {
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    F(ctx, c1); ctx.fillRect(x, y, w, h);
    F(ctx, c2); ctx.beginPath();
    const off = ((t || 0) * 40) % 28;
    for (let i = -2; i * 28 < w + h + 28; i++) { const sx = x + i * 28 + off; ctx.moveTo(sx, y + h); ctx.lineTo(sx + 14, y + h); ctx.lineTo(sx + 14 + h, y); ctx.lineTo(sx + h, y); ctx.closePath(); }
    ctx.fill();
    ctx.restore();
  }
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

  /* RENDER.vsCard(ctx, w, h, st): the fighting-game versus splash before an
     elite or boss fight. st {t (timeline s), dur, boss, title, name, taunt,
     affixes: [{icon, name, color}], charId, charName, def, color, reduced, now}.
     Timeline (VS): the panels slide in (0..0.32), VS slams with lightning
     (0.36), the name slams (0.58), the taunt types (0.8), the badges pop
     (1.0 on), everything slides out over the last 0.3 s. Reduced: fades only. */
  function vsCard(ctx, w, h, st) {
    ctx.save();
    try {
      st = st || {};
      w = w || 540; h = h || 960;
      const t = +st.t || 0, dur = Math.max(0.6, +st.dur || 2), now = +st.now || t, red = !!st.reduced;
      const boss = !!st.boss, ecol = st.color || PAL.pink, pcol = CHAR_COL[st.charId] || PAL.cyan;
      const out = clamp01((t - (dur - VS.exit)) / VS.exit);
      const inK = red ? clamp01(t / 0.2) : U.ease.outCubic(clamp01(t / VS.slide));
      const vis = red ? inK * (1 - out) : 1 - out;
      const slideOut = red ? 0 : U.ease.inCubic(out);
      const y0 = 250, y1 = 700, midX = w / 2;
      // backdrop
      ctx.globalAlpha = 0.96 * clamp01(t / 0.12) * (1 - out);
      F(ctx, '#07030d'); ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = vis;
      // player panel (left) and enemy panel (right), split by a slanted seam
      const lx = red ? 0 : -(1 - inK) * w * 0.8 - slideOut * w, rx = red ? 0 : (1 - inK) * w * 0.8 + slideOut * w;
      const seamT = midX + 70, seamB = midX - 70;
      ctx.save(); ctx.translate(lx, 0);
      ctx.beginPath(); ctx.moveTo(-20, y0); ctx.lineTo(seamT, y0); ctx.lineTo(seamB, y1); ctx.lineTo(-20, y1); ctx.closePath();
      F(ctx, shade(pcol, -0.55)); ctx.fill();
      ctx.save(); ctx.clip();
      // speed lines streaking right
      S(ctx, rgba(pcol, 0.35), 3);
      for (let i = 0; i < 14; i++) { const yy = y0 + 18 + i * 31, sx = ((now * (380 + i * 23) + i * 97) % (w + 200)) - 200; ctx.beginPath(); ctx.moveTo(sx, yy); ctx.lineTo(sx + 60 + (i % 3) * 30, yy); ctx.stroke(); }
      glow(ctx, 140, 440, 190, pcol, 0.35);
      ctx.restore();
      portrait(ctx, st.charId, 140, 440, 170, now);
      // the crawler's name, fitted between the left edge and the seam (a long
      // name like SIR GRABSWORTH used to run into the lightning)
      const seamAt = (y) => seamT + (seamB - seamT) * (y - y0) / (y1 - y0);
      const cn = String(st.charName || 'YOU'), nx1 = seamAt(560) - 16;
      let ns = Math.min(22, 250 / Math.max(4, cn.length) * 1.5), nw = 0;
      ctx.font = 'bold ' + ns + 'px ' + FONT;
      try { const m = ctx.measureText(cn); nw = m && m.width > 0 ? m.width : 0; } catch (e) { nw = 0; }
      if (!(nw > 0)) nw = cn.length * ns * 0.68;
      nw += ns * 0.36;   // the ink outline
      if (nw > nx1 - 10) { ns *= (nx1 - 10) / nw; nw = nx1 - 10; }
      txt(ctx, cn, Math.min(132, nx1 - nw / 2), 560, ns, '#ffffff', true, 'center', INK);
      ctx.restore();
      ctx.save(); ctx.translate(rx, 0);
      ctx.beginPath(); ctx.moveTo(seamT, y0); ctx.lineTo(w + 20, y0); ctx.lineTo(w + 20, y1); ctx.lineTo(seamB, y1); ctx.closePath();
      F(ctx, shade(ecol, -0.62)); ctx.fill();
      ctx.save(); ctx.clip();
      S(ctx, rgba(ecol, 0.35), 3);
      for (let i = 0; i < 14; i++) { const yy = y0 + 18 + i * 31, sx = w + 200 - ((now * (380 + i * 23) + i * 131) % (w + 200)); ctx.beginPath(); ctx.moveTo(sx, yy); ctx.lineTo(sx - 60 - (i % 3) * 30, yy); ctx.stroke(); }
      glow(ctx, 395, 470, 210, ecol, boss ? 0.55 : 0.4);
      ctx.restore();
      // the enemy, scaled to stand about 250px tall on the panel's floor
      if (st.def) {
        const b = enemyBox(st.def, 1), fit = Math.min((boss ? 270 : 240) / Math.max(1, b.h), 250 / Math.max(1, b.w));
        const pop = t < VS.slam ? 0 : Math.max(0, 1 - (t - VS.slam) / 0.25);
        enemy(ctx, st.def, 395, 670, fit, now, { hurt: 0, attack: pop * 0.6, enraged: false });
      }
      ctx.restore();
      // the seam: a white hot edge with lightning crackling along it
      const seamA = clamp01((t - 0.2) / 0.15) * vis;
      if (seamA > 0) {
        ctx.save(); ctx.globalAlpha = seamA;
        ctx.beginPath(); ctx.moveTo(seamT, y0 - 30); ctx.lineTo(seamB, y1 + 30);
        S(ctx, rgba('#ffffff', 0.3), 16); ctx.stroke(); S(ctx, '#ffffff', 4); ctx.stroke();
        ctx.restore();
        const fl = Math.floor(now * 14);
        bolt(ctx, seamT + 6, y0 - 40, seamB - 6, y1 + 40, fl * 7 + 3, 2.4, boss ? PAL.pink : PAL.cyan, seamA * 0.9);
        if (t > VS.slam) {
          const k = clamp01(1 - (t - VS.slam) / 0.6);
          if (k > 0 || boss) {
            const a = red ? 0.5 : Math.max(boss ? 0.35 : 0, k);
            bolt(ctx, midX, 470, 30, y0 - 60, fl * 13 + 1, 2, PAL.gold, a);
            bolt(ctx, midX, 470, w - 30, y1 + 60, fl * 17 + 5, 2, PAL.cyan, a);
            if (boss) bolt(ctx, midX, 470, w - 60, y0 - 90, fl * 19 + 9, 1.6, PAL.pink, a * 0.8);
          }
        }
      }
      // the crawler's own comeback (DATA.CHARACTERS[id].vsLine), typed after
      // the name slams; drawn over both panels and kept left of the seam, so
      // the enemy's panel never cuts the end of the line off
      const cdef = typeof DATA !== 'undefined' && DATA.CHARACTERS ? DATA.CHARACTERS[st.charId] : null;
      const vl = String(st.charLine || (cdef && cdef.vsLine) || '');
      if (vl && t >= VS.name) {
        const n = red ? vl.length : Math.min(vl.length, Math.floor((t - VS.name) * 40));
        const bx1 = seamAt(596) - 12;
        let fs = 14;
        ctx.save(); ctx.translate(lx, 0);
        ctx.font = 'italic bold ' + fs + 'px ' + FONT;
        let tw = vl.length * 7.4;
        try { const m = ctx.measureText(vl); if (m && m.width > 0) tw = m.width; } catch (e) { /* stub */ }
        // too long for the panel: the words shrink to fit (the text scales with the font)
        if (tw + 20 > bx1 - 8) { const k = (bx1 - 28) / tw; fs *= k; tw *= k; }
        const bw = tw + 20;
        const bcx = Math.min(126, bx1 - bw / 2);
        ctx.translate(bcx, 596); ctx.rotate(-0.04);
        ctx.beginPath(); rrect(ctx, -bw / 2, -13, bw, 26, 11); F(ctx, rgba('#ffffff', 0.95)); ctx.fill(); S(ctx, INK, 2.5); ctx.stroke();
        ctx.beginPath(); poly(ctx, [-8 + (126 - bcx), -12, 4 + (126 - bcx), -12, 2 + (126 - bcx), -22]); F(ctx, rgba('#ffffff', 0.95)); ctx.fill();
        ctx.font = 'italic bold ' + fs + 'px ' + FONT;
        txt(ctx, vl.slice(0, n), -bw / 2 + 10, 0.5, fs, INK, true, 'left');
        ctx.restore();
      }
      // VS: slams from 3x to 1x with an overshoot, a white flash on impact
      if (t >= VS.slam - 0.12) {
        const u = clamp01((t - (VS.slam - 0.12)) / 0.12);
        const sc = red ? 1 : (u < 1 ? 3 - 2 * U.ease.inCubic(u) : 1 + Math.sin(clamp01((t - VS.slam) / 0.3) * Math.PI) * 0.12);
        ctx.save(); ctx.translate(midX, 468); ctx.rotate(-0.12); ctx.scale(sc, sc);
        ctx.globalAlpha = vis * (red ? clamp01((t - VS.slam + 0.12) / 0.2) : u);
        glow(ctx, 0, 0, 120, boss ? PAL.pink : PAL.cyan, 0.6 + Math.sin(now * 9) * 0.15);
        chrome(ctx, 'VS', 0, 0, 118, boss ? PAL.pink : PAL.cyan, boss ? PAL.blood : PAL.pink);
        ctx.restore();
        const fk = clamp01(1 - (t - VS.slam) / 0.18);
        if (fk > 0 && t >= VS.slam && !red) { ctx.save(); ctx.globalAlpha = fk * 0.75 * vis; F(ctx, '#ffffff'); ctx.fillRect(0, 0, w, h); ctx.restore(); }
      }
      // the title band on top: ACT n BOSS on hazard stripes, or ELITE
      if (st.title) {
        const u = red ? 1 : U.ease.outBack(clamp01((t - 0.05) / 0.3));
        const ty = y0 - 58 - (1 - u) * 120;
        ctx.save(); ctx.globalAlpha = vis;
        if (boss) {
          stripes(ctx, 0, ty - 26, w, 52, '#1a0c10', rgba(PAL.blood, 0.9), now);
          ctx.beginPath(); ctx.rect(0, ty - 26, w, 52); S(ctx, INK, 3); ctx.stroke();
          chrome(ctx, st.title, midX, ty, 38, PAL.gold, PAL.blood);
        } else {
          ctx.beginPath(); rrect(ctx, midX - 110, ty - 22, 220, 44, 22); F(ctx, '#1d1233'); ctx.fill(); S(ctx, ecol, 3); ctx.stroke();
          txt(ctx, st.title, midX, ty + 1, 26, ecol, true, 'center', INK);
        }
        ctx.restore();
      }
      // the name slams in, the taunt types itself, the affix badges pop
      if (t >= VS.name) {
        const u = clamp01((t - VS.name) / 0.18), sc = red ? 1 : 1.7 - 0.7 * U.ease.outBack(u);
        ctx.save(); ctx.globalAlpha = vis * u; ctx.translate(midX, 752); ctx.scale(sc, sc);
        const nm = String(st.name || '').toUpperCase(), size = Math.min(42, (w - 40) / Math.max(4, nm.length) * 1.55);
        chrome(ctx, nm, 0, 0, size, boss ? PAL.gold : ecol, boss ? PAL.blood : null);
        ctx.restore();
      }
      if (t >= VS.taunt && st.taunt) {
        const s = String(st.taunt), n = red ? s.length : Math.min(s.length, Math.floor((t - VS.taunt) * 48));
        ctx.save(); ctx.globalAlpha = vis;
        // typed from a fixed left edge (the whole line's width), so it does not slide as it grows
        ctx.font = 'italic bold 17px ' + FONT; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        let fw = s.length * 8.5;
        try { const m = ctx.measureText('"' + s + '"'); if (m && m.width > 40) fw = m.width; } catch (e) { /* stub */ }
        const lx0 = midX - fw / 2, line = '"' + s.slice(0, n) + (n < s.length ? '' : '"');
        S(ctx, INK, 4); ctx.lineJoin = 'round'; ctx.strokeText(line, lx0, 796);
        F(ctx, '#f4ecff'); ctx.fillText(line, lx0, 796);
        ctx.restore();
      }
      const af = st.affixes || [];
      if (af.length && t >= VS.badges) {
        const bw = 118, gap = 8, tot = af.length * bw + (af.length - 1) * gap;
        af.forEach((a, i) => {
          const u = clamp01((t - VS.badges - i * 0.12) / 0.2);
          if (u <= 0) return;
          const x = midX - tot / 2 + i * (bw + gap) + bw / 2, sc = red ? 1 : U.ease.outBack(u);
          ctx.save(); ctx.globalAlpha = vis * u; ctx.translate(x, 842); ctx.scale(sc, sc);
          ctx.beginPath(); rrect(ctx, -bw / 2, -16, bw, 32, 16); F(ctx, shade(a.color || PAL.gold, -0.62)); ctx.fill(); S(ctx, a.color || PAL.gold, 2.5); ctx.stroke();
          txt(ctx, (a.icon ? a.icon + ' ' : '') + String(a.name || '').toUpperCase(), 0, 1, 13, a.color || PAL.gold, true, 'center', INK);
          ctx.restore();
        });
      }
      // skip hint
      if (t > 0.5 && out <= 0) { ctx.globalAlpha = vis * (0.45 + Math.sin(now * 4) * 0.2); txt(ctx, 'tap to skip', midX, 918, 13, '#b3a4d6', true, 'center', INK); }
    } catch (e) { /* never throws */ }
    ctx.restore();
  }

  /* RENDER.bossSign(ctx, x, y, label, col, t, k): the warning plate a boss
     hangs on the cabinet's top frame a turn before its trick (and while it
     lasts). k 0..1 drops it in on its chains; it swings, the border chases. */
  function bossSign(ctx, x, y, label, col, t, k) {
    ctx.save();
    try {
      t = t || 0; k = k == null ? 1 : clamp01(k);
      if (k <= 0) { ctx.restore(); return; }
      col = col || PAL.gold;
      label = String(label || '').toUpperCase();
      ctx.font = 'bold 15px ' + FONT;
      let tw = 120;
      try { const m = ctx.measureText(label); if (m && m.width > 0) tw = m.width; } catch (e) { /* stub */ }
      const pw = Math.max(150, tw + 58), ph = 32;
      const drop = (1 - U.ease.outBack(k)) * -60;
      ctx.translate(x, y + drop);
      ctx.rotate(Math.sin(t * 2.2) * 0.035 + (1 - k) * 0.3);
      // chains
      S(ctx, '#8e98a8', 2);
      for (const cx of [-pw * 0.32, pw * 0.32]) { ctx.beginPath(); ctx.moveTo(cx, -ph / 2 - 14); ctx.lineTo(cx, -ph / 2); ctx.stroke(); }
      glow(ctx, 0, 0, pw * 0.6, col, 0.35 + Math.sin(t * 6) * 0.12);
      ctx.beginPath(); rrect(ctx, -pw / 2, -ph / 2, pw, ph, 7);
      F(ctx, '#140a1c'); ctx.fill();
      ctx.save(); ctx.clip();
      stripes(ctx, -pw / 2, -ph / 2, 16, ph, '#140a1c', col, t);
      stripes(ctx, pw / 2 - 16, -ph / 2, 16, ph, '#140a1c', col, t);
      ctx.restore();
      ctx.beginPath(); rrect(ctx, -pw / 2, -ph / 2, pw, ph, 7); S(ctx, INK, 3); ctx.stroke();
      ctx.beginPath(); rrect(ctx, -pw / 2 + 2, -ph / 2 + 2, pw - 4, ph - 4, 6); S(ctx, rgba(col, 0.7 + Math.sin(t * 8) * 0.3), 1.5); ctx.stroke();
      // a blinking warning triangle and the label
      const on = Math.sin(t * 7) > -0.3;
      ctx.beginPath(); ctx.moveTo(-tw / 2 - 16, -8); ctx.lineTo(-tw / 2 - 7, 8); ctx.lineTo(-tw / 2 - 25, 8); ctx.closePath();
      F(ctx, on ? col : shade(col, -0.5)); ctx.fill(); S(ctx, INK, 1.5); ctx.stroke();
      txt(ctx, '!', -tw / 2 - 16, 3, 10, INK, true, 'center');
      txt(ctx, label, 6, 1, 15, col, true, 'center', INK);
    } catch (e) { /* never throws */ }
    ctx.restore();
  }

  /* RENDER.bossCab(ctx, x, y, cfg, st, layer): the boss signatures inside
     the machine. (x, y) is the interior's top-left, cfg the cabinet cfg
     (w, h, chuteX, dividerH, railY, frame). st {t, heat 0..1, snow 0..1,
     ice: null|{part, hp, k 0..1 (forming)}, rigged 0..1, alarm 0..1,
     hijack 0..1, hx (carriage x), coins 0..1}. Layer 'back' draws behind the
     pile (the glowing floor, snow drifts), 'front' over the glass (heat
     haze, slag drips, the iced lip or rail, puppet strings, the red alarm). */
  function bossCab(ctx, x, y, cfg, st, layer) {
    ctx.save();
    try {
      const c = cabCfg(cfg); st = st || {};
      const t = st.t || 0, w = c.w, h = c.h, f = c.frame;
      const chuteX = cfg && cfg.chuteX != null ? cfg.chuteX : w - c.chuteW, dTop = h - h * c.dividerH;
      const heat = clamp01(+st.heat || 0), snow = clamp01(+st.snow || 0), alarm = clamp01(+st.alarm || 0);
      ctx.translate(x || 0, y || 0);
      if (layer === 'back') {
        ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
        if (heat > 0) {
          // the floor glows like a grate over coals, pulsing
          const pul = 0.75 + Math.sin(t * 3.1) * 0.15 + Math.sin(t * 7.3) * 0.08;
          const g = ctx.createLinearGradient ? ctx.createLinearGradient(0, h * 0.5, 0, h) : null;
          if (g && g.addColorStop) { g.addColorStop(0, 'rgba(255,90,20,0)'); g.addColorStop(1, rgba('#ff5a14', 0.8 * heat * pul)); F(ctx, g); ctx.fillRect(0, h * 0.45, w, h * 0.55); }
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = heat * pul;
          for (let i = 0; i < 4; i++) glow(ctx, chuteX * (0.14 + i * 0.25), h - 6, 70, '#ff5a14', 0.7 * heat * pul);
          S(ctx, 'rgba(255,170,60,0.9)', 4);
          ctx.beginPath(); for (let gx = 14; gx < chuteX; gx += 22) { ctx.moveTo(gx, h - 3); ctx.lineTo(gx + 11, h - 3); } ctx.stroke();
          for (let i = 0; i < 10; i++) {
            const ph = (t * 0.45 + i * 0.137) % 1, ex = ((i * 97 + Math.sin(t + i) * 12) % Math.max(40, chuteX - 20)) + 10, ey = h - ph * h * 0.8;
            ctx.globalAlpha = heat * (1 - ph); F(ctx, i % 2 ? '#ffe066' : '#ff8a2b'); ctx.beginPath(); circ(ctx, ex, ey, 2.2 * (1 - ph) + 0.8); ctx.fill();
          }
          ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
        }
        if (snow > 0) {
          // drifts heaped in the corners and along the floor
          const hs = 10 + snow * 34;
          const drift = (x0, x1, peak) => {
            ctx.beginPath(); ctx.moveTo(x0, h + 2);
            ctx.quadraticCurveTo(x0 + (x1 - x0) * 0.15, h - peak, (x0 + x1) / 2, h - peak * 0.8);
            ctx.quadraticCurveTo(x0 + (x1 - x0) * 0.85, h - peak * 0.55, x1, h + 2); ctx.closePath();
            F(ctx, '#eef8ff'); ctx.fill(); S(ctx, rgba('#9fc8e8', 0.9), 2); ctx.stroke();
          };
          drift(-10, 150, hs * 1.3);
          drift(chuteX - 170, chuteX - 4, hs);
          drift(130, chuteX - 150, hs * 0.45);
          F(ctx, '#ffffff'); ctx.globalAlpha = 0.85;
          for (let i = 0; i < 18; i++) { const px = (i * 53 + t * 18 + Math.sin(t * 0.7 + i) * 16) % w, py = (i * 71 + t * (30 + i % 5 * 6)) % h; ctx.beginPath(); circ(ctx, px, py, 1.4 + (i % 3) * 0.6); ctx.fill(); }
          ctx.globalAlpha = 1;
        }
      } else {
        // over the glass
        if (heat > 0) {
          ctx.save(); ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
          // heat haze: wavering bright ribbons rising through the cabinet
          ctx.globalAlpha = 0.16 * heat; S(ctx, '#ffd9a0', 3);
          for (let i = 0; i < 6; i++) {
            const bx = 30 + i * (w - 60) / 5, ph = (t * 0.6 + i * 0.21) % 1;
            ctx.beginPath();
            for (let k = 0; k <= 10; k++) { const yy = h - k * h / 10 - ph * 40, xx = bx + Math.sin(t * 5 + k * 0.9 + i) * 7; if (k) ctx.lineTo(xx, yy); else ctx.moveTo(xx, yy); }
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
          F(ctx, rgba('#ff5a14', 0.1 * heat)); ctx.fillRect(0, 0, w, h);
          // the glass glows hot at its edges
          ctx.beginPath(); ctx.rect(4, 4, w - 8, h - 8);
          S(ctx, rgba('#ff6a1a', (0.22 + Math.sin(t * 3) * 0.06) * heat), 10); ctx.stroke();
          // slag drips from the rail: three streams, a drop every ~1.7 s
          for (let i = 0; i < 3; i++) {
            const dx = [w * 0.22, w * 0.47, w * 0.7][i], ph = ((t + i * 0.57) / 1.7) % 1;
            // the lump gathering on the rail
            const gk = ph < 0.35 ? ph / 0.35 : 1;
            tone(ctx, q => { q.moveTo(dx - 7, c.railY + 4); q.quadraticCurveTo(dx, c.railY + 8 + gk * 10, dx + 7, c.railY + 4); q.closePath(); }, '#ff8a2b', dx, c.railY + 8, 6, { ol: 1.5, spec: false, dark: 0.1 });
            if (ph > 0.35) {
              const u = (ph - 0.35) / 0.65, yy = c.railY + 14 + u * u * (h - c.railY - 20);
              glow(ctx, dx, yy, 12, '#ff8a2b', heat * 0.9);
              F(ctx, '#ffe066'); ctx.beginPath(); ell(ctx, dx, yy, 3.5, 5 + u * 3, 0); ctx.fill();
            }
          }
          ctx.restore();
        }
        const ice = st.ice;
        if (ice && ice.part) {
          const k = clamp01(ice.k == null ? 1 : +ice.k), cracked = ice.hp != null && ice.hp < 2;
          ctx.save(); ctx.globalAlpha = k;
          if (ice.part === 'lid') {
            // a slab of ice over the chute mouth, sloping down toward the bin
            const x0 = chuteX - 10, x1 = w + 2, yl = dTop - 8, yr = dTop - 30, th = 16;
            ctx.beginPath(); ctx.moveTo(x0, yl - th); ctx.lineTo(x1, yr - th); ctx.lineTo(x1, yr + 6); ctx.lineTo(x0, yl + 4); ctx.closePath();
            F(ctx, 'rgba(190,235,255,0.82)'); ctx.fill(); S(ctx, INK, 2.5); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(x0 + 4, yl - th + 4); ctx.lineTo(x1 - 4, yr - th + 4); S(ctx, 'rgba(255,255,255,0.9)', 2); ctx.stroke();
            // icicles under it
            for (let i = 0; i < 5; i++) { const ix = x0 + 8 + i * (x1 - x0 - 16) / 4, iy = yl + (yr - yl) * (i / 4) + 3, il = 8 + (i % 2) * 7; ctx.beginPath(); ctx.moveTo(ix - 4, iy); ctx.lineTo(ix + 4, iy); ctx.lineTo(ix, iy + il * k); ctx.closePath(); F(ctx, '#dff4ff'); ctx.fill(); S(ctx, INK, 1.2); ctx.stroke(); }
            if (cracked) { S(ctx, INK, 1.8); ctx.beginPath(); ctx.moveTo(x0 + 18, yl - 12); ctx.lineTo(x0 + 30, yl - 4); ctx.lineTo(x0 + 26, yl + 2); ctx.moveTo(x0 + 30, yl - 4); ctx.lineTo(x0 + 44, yr - 6); ctx.stroke(); }
            glint(ctx, x0 + 20 + ((t * 30) % 40), yl - 10, 10, t, 2, '#ffffff');
          } else {
            // frost crusted along the claw rail, icicles hanging off it
            const ry = c.railY;
            ctx.beginPath(); rrect(ctx, 2, ry - 9, w - 4, 18, 7); F(ctx, 'rgba(210,240,255,0.85)'); ctx.fill(); S(ctx, INK, 2); ctx.stroke();
            for (let i = 0; i < 16; i++) { const ix = 14 + i * (w - 28) / 15, il = (7 + ((i * 37) % 11)) * k; ctx.beginPath(); ctx.moveTo(ix - 4, ry + 8); ctx.lineTo(ix + 4, ry + 8); ctx.lineTo(ix + 0.5, ry + 8 + il); ctx.closePath(); F(ctx, '#e8f8ff'); ctx.fill(); S(ctx, INK, 1.2); ctx.stroke(); }
            for (let i = 0; i < 5; i++) glint(ctx, 40 + i * (w - 80) / 4, ry, 9, t, i * 1.7, '#ffffff');
          }
          ctx.restore();
        }
        const hj = clamp01(+st.hijack || 0);
        if (hj > 0) {
          // puppet strings: the Prize Master works the claw from above
          const hx = st.hx != null ? st.hx : w / 2, bar = -f - 30 + Math.sin(t * 3) * 3;
          ctx.save(); ctx.globalAlpha = hj;
          glow(ctx, hx, c.railY, 40, PAL.pink, 0.5 + Math.sin(t * 8) * 0.2);
          S(ctx, rgba(PAL.pink, 0.85), 1.6);
          for (const o of [-18, 0, 18]) { ctx.beginPath(); ctx.moveTo(hx + o * 1.6 + Math.sin(t * 4 + o) * 4, bar); ctx.quadraticCurveTo(hx + o, (bar + c.railY) / 2, hx + o * 0.5, c.railY + 4); ctx.stroke(); }
          ctx.beginPath(); rrect(ctx, hx - 42, bar - 5, 84, 10, 4); F(ctx, '#3a1030'); ctx.fill(); S(ctx, PAL.pink, 2); ctx.stroke();
          ctx.restore();
        }
        if (alarm > 0) {
          // final phase: a red wash and two siren beams sweeping from the top corners
          const pul = 0.5 + Math.sin(t * 6) * 0.5;
          ctx.save(); ctx.beginPath(); ctx.rect(-f, -f, w + f * 2, h + f * 2); ctx.clip();
          F(ctx, rgba('#ff1e2e', (0.06 + pul * 0.1) * alarm)); ctx.fillRect(-f, -f, w + f * 2, h + f * 2);
          ctx.globalCompositeOperation = 'lighter';
          for (const [sx, dir] of [[8, 1], [w - 8, -1]]) {
            const a = Math.PI / 2 + dir * (0.6 + Math.sin(t * 2.4 + (dir > 0 ? 0 : 1.6)) * 0.5);
            ctx.beginPath(); ctx.moveTo(sx, 4);
            ctx.lineTo(sx + Math.cos(a - 0.12) * 520, 4 + Math.sin(a - 0.12) * 520); ctx.lineTo(sx + Math.cos(a + 0.12) * 520, 4 + Math.sin(a + 0.12) * 520); ctx.closePath();
            F(ctx, rgba('#ff3a3a', 0.12 * alarm)); ctx.fill();
            glow(ctx, sx, 6, 22, '#ff2e30', alarm * (0.6 + pul * 0.4));
          }
          ctx.restore();
        }
      }
    } catch (e) { /* never throws */ }
    ctx.restore();
  }

  /* RENDER.hotItem(ctx, x, y, r, t, seed): a red hot item's glow and the
     heat shimmer above it (drawn over the item). */
  function hotItem(ctx, x, y, r, t, seed) {
    ctx.save();
    try {
      t = t || 0; r = Math.max(6, r || 14);
      const pul = 0.7 + Math.sin(t * 6 + (seed || 0)) * 0.3;
      glow(ctx, x, y, r * 2.2, '#ff4a1a', 0.95 * pul);
      glow(ctx, x, y, r * 1.2, '#ffe066', 0.55 * pul);
      // a red hot rim
      ctx.beginPath(); ctx.arc(x, y, r * 1.05, 0, TAU);
      S(ctx, rgba('#ff5a1a', 0.55 + 0.35 * pul), 2.5); ctx.stroke();
      ctx.globalAlpha = 0.6; S(ctx, '#ffb070', 1.6);
      for (let i = -1; i <= 1; i++) {
        const ph = (t * 0.9 + i * 0.3 + (seed || 0) * 0.1) % 1, bx = x + i * r * 0.5;
        ctx.globalAlpha = 0.6 * (1 - ph);
        ctx.beginPath(); ctx.moveTo(bx, y - r - ph * 18); ctx.quadraticCurveTo(bx + 5, y - r - 6 - ph * 18, bx, y - r - 12 - ph * 18); ctx.stroke();
      }
    } catch (e) { /* */ }
    ctx.restore();
  }

  /* RENDER.eliteBadge(ctx, x, y, tier, t, size): a gold crown for a boss, a
     skull for an elite, beside the hp bar. */
  function eliteBadge(ctx, x, y, tier, t, size) {
    ctx.save();
    try {
      t = t || 0; const s = (size || 22) / 22;
      ctx.translate(x, y + Math.sin(t * 2.5) * 1.2); ctx.scale(s, s);
      if (tier === 'boss') {
        glow(ctx, 0, 0, 20, PAL.gold, 0.45 + Math.sin(t * 4) * 0.15);
        tone(ctx, q => poly(q, [-12, 7, -13, -6, -6, 0, 0, -10, 6, 0, 13, -6, 12, 7]), PAL.gold, 0, 0, 12, { ol: 2, dark: -0.35 });
        F(ctx, PAL.pink); ctx.beginPath(); circ(ctx, 0, 2, 2.4); ctx.fill();
        F(ctx, PAL.cyan); ctx.beginPath(); circ(ctx, -7, 3, 1.8); circ(ctx, 7, 3, 1.8); ctx.fill();
      } else {
        ctx.beginPath(); circ(ctx, 0, 0, 11); F(ctx, '#3a0a1c'); ctx.fill(); S(ctx, PAL.blood, 2); ctx.stroke();
        tone(ctx, q => { q.moveTo(-6, 2); q.quadraticCurveTo(-7, -8, 0, -8); q.quadraticCurveTo(7, -8, 6, 2); q.lineTo(4, 6); q.lineTo(-4, 6); q.closePath(); }, '#f1e9d6', 0, -2, 7, { ol: 1.5, spec: false });
        F(ctx, INK); ctx.beginPath(); circ(ctx, -2.6, -1.5, 1.8); circ(ctx, 2.6, -1.5, 1.8); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-2, 6); ctx.lineTo(-2, 3.5); ctx.moveTo(0, 6); ctx.lineTo(0, 3.5); ctx.moveTo(2, 6); ctx.lineTo(2, 3.5); S(ctx, INK, 1); ctx.stroke();
      }
    } catch (e) { /* */ }
    ctx.restore();
  }

  /* RENDER.finale(ctx, w, h, st): the death finale's screen layer. st {white
     0..1 (the whiteout), card: seconds since the title card began (< 0: none),
     boss, title, sub, color, reduced, now}. The card is a dark band with rays
     behind, the title slamming in from 2.2x and the enemy's epitaph under it. */
  function finale(ctx, w, h, st) {
    ctx.save();
    try {
      st = st || {}; w = w || 540; h = h || 960;
      const now = +st.now || 0, red = !!st.reduced;
      const wh = clamp01(+st.white || 0);
      if (wh > 0) { ctx.globalAlpha = wh; F(ctx, '#ffffff'); ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1; }
      const ct = st.card == null ? -1 : +st.card;
      if (ct >= 0) {
        const cy = st.y || 200, boss = !!st.boss, col = st.color || PAL.gold;
        const inK = red ? clamp01(ct / 0.2) : U.ease.outCubic(clamp01(ct / 0.22));
        const bh = (boss ? 150 : 110) * inK;
        // rays
        ctx.save(); ctx.translate(w / 2, cy); ctx.globalAlpha = 0.55 * inK;
        ctx.globalCompositeOperation = 'lighter';
        // two fills (the white rays, the coloured ones) rather than fourteen
        for (let odd = 0; odd < 2; odd++) {
          ctx.beginPath();
          for (let i = odd; i < 14; i += 2) {
            const a = i / 14 * TAU + now * 0.5;
            ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a - 0.09) * 520, Math.sin(a - 0.09) * 520); ctx.lineTo(Math.cos(a + 0.09) * 520, Math.sin(a + 0.09) * 520); ctx.closePath();
          }
          F(ctx, rgba(odd ? col : '#ffffff', 0.16)); ctx.fill();
        }
        ctx.restore();
        ctx.save(); ctx.globalAlpha = 0.92;
        F(ctx, '#0b0614'); ctx.fillRect(0, cy - bh / 2, w, bh);
        ctx.globalAlpha = 1;
        S(ctx, col, 3); ctx.beginPath(); ctx.moveTo(0, cy - bh / 2); ctx.lineTo(w, cy - bh / 2); ctx.moveTo(0, cy + bh / 2); ctx.lineTo(w, cy + bh / 2); ctx.stroke();
        ctx.restore();
        const u = clamp01((ct - 0.08) / 0.2), sc = red ? 1 : 2.2 - 1.2 * U.ease.outBack(u);
        if (u > 0) {
          ctx.save(); ctx.globalAlpha = u; ctx.translate(w / 2, cy - (boss ? 16 : 10)); ctx.rotate(-0.04); ctx.scale(sc, sc);
          const title = String(st.title || (boss ? 'BOSS DEFEATED' : 'ELITE DOWN'));
          chrome(ctx, title, 0, 0, Math.min(boss ? 52 : 46, (w - 40) / Math.max(4, title.length) * 1.35), col, boss ? PAL.pink : null);
          ctx.restore();
        }
        if (st.sub && ct > 0.35) {
          ctx.save(); ctx.globalAlpha = clamp01((ct - 0.35) / 0.25);
          txt(ctx, String(st.sub), w / 2, cy + (boss ? 42 : 30), 17, '#f4ecff', true, 'center', INK);
          ctx.restore();
        }
      }
    } catch (e) { /* never throws */ }
    ctx.restore();
  }

  /* ============================================================ BESTIARY
     Round 4 (DESIGN.md "Enemies", the bestiary). Three things live here:
     1. Enemy life. Every enemy breathes (bosses heave, slow and deep),
        blinks (eye() draws a shut lid mid-blink), fidgets now and then in
        its own way (the rat sniffs, slimes jiggle, the goblin twirls its
        wrench, bats loop the loop, mimics snap) and looks hurt at low hp
        (sweat under 40%, cracks under 25%, dizzy stars under 15%).
        RENDER.enemy calls bestLife (reads t, the enemy's x so two rats
        never sync, st.seed and st.hpk), bestPose (the transform) and
        bestHurtLook; LIFE is cleared after every enemy. No allocations.
     2. The new enemies' art (tickler, jelly, barker, magbat, mole, dozer,
        ghost, collector) and their machine tricks: the intent icons, the
        magnetic lid, goo strands, dirt mounds, invisible items, the plow
        blade, the prize wheel sign, tickling feathers and the rival claw.
     3. Map decor on lit land (drawn by terrainHex, under the pickups):
        tickets and neon puddles (act 1), gears and steam vents (act 2),
        icicles, snow drifts and glints (act 3), and an aurora on the sky
        edge of the act 3 map (bestSky, from the map's draw). */
  const FIDGET = {
    rat: 'sniff', raccoon: 'sniff', mole: 'peek', slime: 'jiggle', jelly: 'jiggle', bat: 'loop', magbat: 'loop',
    gremlin: 'hop', tinker: 'hop', goat: 'hop', clockwork: 'hop', goblin: 'spin', mimic: 'snap', icemimic: 'snap', ironjaw: 'snap',
    spider: 'tap', crab: 'tap', imp: 'twirl', frostmage: 'twirl', wisp: 'flicker', wraith: 'flicker', ghost: 'peekaboo',
    golem: 'shrug', yeti: 'shrug', knight: 'shrug', mushroom: 'puff', drone: 'bank', magnet: 'buzz', dozer: 'rev',
    cultist: 'sway', magpie: 'preen', tickler: 'wiggle', barker: 'tip', collector: 'tip', prizemaster: 'tip', hoard: 'rattle', furnace: 'rattle',
  };
  const FID_T = 0.9;   // a fidget lasts this long (s)
  // The ctx's alpha right now (a stub ctx may not keep it: then 1).
  function alphaOf(ctx) { const a = +ctx.globalAlpha; return a >= 0 && a <= 1 ? a : 1; }
  const lifeSeeds = new Map();
  // A stable 0..1 number per art key (cached: no string work per frame).
  function lifeSeed(key) {
    let s = lifeSeeds.get(key);
    if (s == null) {
      const k = String(key || '');
      s = 7;
      for (let i = 0; i < k.length; i++) s = (s * 31 + k.charCodeAt(i)) % 997;
      s /= 997;
      lifeSeeds.set(key, s);
    }
    return s;
  }
  // Set LIFE for one enemy draw: the blink, the fidget, low hp.
  function bestLife(def, key, t, st, x, boss, dead) {
    LIFE.blink = 0; LIFE.fid = 0; LIFE.fk = 0; LIFE.spin = 0;
    LIFE.kind = FIDGET[key] || 'shrug'; LIFE.boss = !!boss;
    LIFE.hpk = st.hpk == null ? 1 : clamp01(+st.hpk || 0);
    const sd = lifeSeed(key) + (st.seed != null ? (+st.seed || 0) * 0.37 : 0) + x * 0.0131;
    LIFE.sd = sd;
    if (dead > 0 || st.frozen || st.still) { LIFE.hpk = 1; return; }
    // a blink every 2.6..4.3 s (0.14 s long), a double blink for some
    const bp = 2.6 + (sd * 7.3) % 1.7, bu = (t + sd * 11.3) % bp;
    const b1 = bu < 0.14 ? 1 - Math.abs(bu / 0.07 - 1) : 0;
    const b2 = (sd * 5) % 1 > 0.6 && bu > 0.24 && bu < 0.38 ? 1 - Math.abs((bu - 0.24) / 0.07 - 1) : 0;
    LIFE.blink = b1 > b2 ? b1 : b2;
    // a fidget every 5..7.5 s (bosses 7..9.5 s), never mid-strike or mid-flinch
    const fp = (boss ? 7 : 5) + (sd * 13.1) % 2.5, fu = (t + sd * 17.9) % fp;
    if (fu < FID_T && !(st.attack > 0) && !(st.hurt > 0.2) && !(st.windup > 0)) { LIFE.fk = fu / FID_T; LIFE.fid = Math.sin(LIFE.fk * Math.PI); }
    if (LIFE.kind === 'spin' && LIFE.fid > 0) LIFE.spin = U.ease.inOut(LIFE.fk) * TAU;
  }
  // The breath (about the feet) and the fidget, applied before the art.
  function bestPose(ctx, art, t) {
    const h = art.h, w = art.w, sd = LIFE.sd;
    const br = LIFE.boss ? Math.sin(t * 1.6 + sd * 9) * 0.04 : Math.sin(t * 2.3 + sd * 9) * 0.018;
    const low = LIFE.hpk < 0.35 ? 0.03 : 0;   // a tired slump
    ctx.scale(1 - br * 0.45 + low * 0.3, 1 + br - low);
    const f = LIFE.fid, k = LIFE.fk;
    if (!(f > 0)) return;
    switch (LIFE.kind) {
      case 'sniff': ctx.translate(-w * 0.35, -h * 0.45); ctx.rotate(Math.sin(k * Math.PI * 10) * 0.06 * f); ctx.translate(w * 0.35, h * 0.45); break;
      case 'jiggle': { const j = Math.sin(k * Math.PI * 9) * 0.13 * f; ctx.scale(1 + j, 1 - j); break; }
      case 'loop': { const a = U.ease.inOut(k) * TAU; ctx.translate(0, -h * 0.6); ctx.rotate(-a); ctx.translate(0, h * 0.6); break; }
      case 'hop': ctx.translate(0, -Math.abs(Math.sin(k * Math.PI * 2)) * 11); break;
      case 'snap': { const j = Math.abs(Math.sin(k * Math.PI * 4)) * 0.1 * f; ctx.scale(1 + j, 1 - j); break; }
      case 'tap': ctx.translate(Math.sin(k * Math.PI * 12) * 2.2 * f, 0); break;
      case 'twirl': ctx.translate(0, -h * 0.5); ctx.rotate(Math.sin(k * TAU) * 0.14 * f); ctx.translate(0, h * 0.5); break;
      case 'flicker': ctx.globalAlpha = alphaOf(ctx) * (1 - 0.55 * f * (0.5 + 0.5 * Math.sin(k * 60))); break;
      case 'peekaboo': ctx.globalAlpha = alphaOf(ctx) * (1 - 0.85 * f); break;   // gone... and back
      case 'shrug': ctx.scale(1, 1 + 0.07 * f); break;
      case 'puff': ctx.scale(1 + 0.09 * f, 1 - 0.09 * f); break;
      case 'bank': ctx.translate(0, -h * 0.5); ctx.rotate(0.25 * f); ctx.translate(0, h * 0.5); break;
      case 'buzz': ctx.translate(Math.sin(k * 90) * 1.6 * f, 0); break;
      case 'rev': ctx.translate(Math.sin(k * 110) * 1.5 * f, Math.cos(k * 97) * f); break;
      case 'sway': ctx.rotate(Math.sin(k * TAU) * 0.07 * f); break;
      case 'wiggle': ctx.rotate(Math.sin(k * Math.PI * 6) * 0.1 * f); break;
      case 'preen': ctx.rotate(-0.16 * f); break;
      case 'tip': ctx.rotate(-0.09 * f); break;
      case 'rattle': ctx.translate(Math.sin(k * 70) * 2.4 * f, 0); break;
      default: break;   // spin and peek are drawn by the art itself
    }
  }
  const DASH_GHOST = [5, 4];
  // Low hp: sweat drops slide off the brow, then cracks, then dizzy stars.
  function bestHurtLook(ctx, art, t) {
    const hk = LIFE.hpk;
    if (!(hk < 0.4) || FLAT) return;
    const w = art.w, h = art.h, sd = LIFE.sd, a0 = alphaOf(ctx);
    for (let i = 0; i < 2; i++) {
      const u = (t * 0.9 + i * 0.5 + sd) % 1, x = i ? w * 0.1 : -w * 0.32, y = -h * 0.84 + u * h * 0.22;
      ctx.globalAlpha = a0 * (1 - u);
      ctx.beginPath(); ctx.moveTo(x, y - 7); ctx.quadraticCurveTo(x + 5.5, y + 2.5, x, y + 5.5); ctx.quadraticCurveTo(x - 5.5, y + 2.5, x, y - 7);
      F(ctx, '#9fe4ff'); ctx.fill(); S(ctx, INK, 1.4); ctx.stroke();
    }
    ctx.globalAlpha = a0;
    if (hk < 0.25) {
      ctx.beginPath();
      ctx.moveTo(-w * 0.12, -h * 0.72); ctx.lineTo(-w * 0.04, -h * 0.6); ctx.lineTo(-w * 0.14, -h * 0.5); ctx.lineTo(-w * 0.02, -h * 0.38);
      ctx.moveTo(w * 0.14, -h * 0.5); ctx.lineTo(w * 0.06, -h * 0.42); ctx.lineTo(w * 0.16, -h * 0.34);
      S(ctx, rgba(INK, 0.85), 2.2); ctx.stroke();
    }
    if (hk < 0.15) {
      for (let i = 0; i < 3; i++) {
        const a = t * 3.2 + i * TAU / 3, sx = Math.cos(a) * w * 0.22, sy = -h * 1.04 + Math.sin(a) * 4;
        ctx.beginPath(); star(ctx, sx, sy, 4.5, 5, 0.45); F(ctx, PAL.gold); ctx.fill(); S(ctx, INK, 1); ctx.stroke();
      }
    }
  }
  // A small gold claw on a cable (the Claw Collector's rival claw): hub at
  // (x, y), s scale, open 0..1, a the swing angle.
  function bestMiniClaw(ctx, x, y, s, open, t, a) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(-(a || 0)); ctx.scale(s, s);
    const o = clamp01(open);
    for (let d = -1; d <= 1; d += 2) {
      ctx.save(); ctx.translate(d * 6, 5); ctx.rotate(-d * (0.12 + o * 0.62));
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(d * 8, 14); ctx.lineTo(d * 2, 25);
      S(ctx, INK, 7.5); ctx.stroke(); S(ctx, PAL.gold, 4.2); ctx.stroke();
      ctx.restore();
    }
    tone(ctx, c => circ(c, 0, 0, 9), PAL.gold, 0, 0, 9, { dark: -0.3 });
    F(ctx, PAL.blood); ctx.beginPath(); circ(ctx, 0, 1, 3); ctx.fill();
    ctx.restore();
  }

  // ---- the new enemies' art (feet at the origin, facing -x)
  EA.tickler = { w: 72, h: 76, draw(ctx, t, p) {
    const wig = LIFE.kind === 'wiggle' ? LIFE.fid : 0, cy = -38 + Math.sin(t * 4.2) * 2;
    shadow(ctx, 60);
    // four long arms, each ending in a feather that never stops tickling the air
    for (let i = 0; i < 4; i++) {
      const side = i < 2 ? -1 : 1, up = i % 2;
      const a = (side < 0 ? Math.PI : 0) + side * (-0.3 - up * 0.8) + Math.sin(t * (5 + wig * 12) + i * 1.9) * (0.3 + wig * 0.3) * side;
      const x0 = side * 14, y0 = cy + 2 - up * 6, x1 = x0 + Math.cos(a) * 30, y1 = y0 + Math.sin(a) * 30;
      limb(ctx, x0, y0, x1, y1, 3.5, p.b);
      ctx.save(); ctx.translate(x1, y1); ctx.rotate(a + Math.sin(t * 9 + i) * 0.4); IA.feather(ctx, 18, 9, '#ffe066', '#ff9a2e'); ctx.restore();
    }
    tone(ctx, c => { ell(c, -11, -3, 8, 4, 0); ell(c, 11, -3, 8, 4, 0); }, p.b, 0, -3, 10, NOSPEC);
    // a fuzzy ball of a body
    tone(ctx, c => {
      for (let i = 0; i <= 18; i++) { const a = i / 18 * TAU, rr = i % 2 ? 26 : 29.5, px = Math.cos(a) * rr, py = cy + Math.sin(a) * rr * 0.95; if (i) c.lineTo(px, py); else c.moveTo(px, py); }
      c.closePath();
    }, p.a, 0, cy, 26, { dark: -0.28 });
    if (!FLAT) { F(ctx, shade(p.a, 0.35)); ctx.beginPath(); ell(ctx, 3, cy + 11, 13, 8, 0); ctx.fill(); }
    eye(ctx, -11, cy - 9, 7, -0.6, 0.1, '#7a3aa8'); eye(ctx, 7, cy - 11, 6, -0.6, 0.1, '#7a3aa8');
    // the grin
    ctx.beginPath(); ctx.moveTo(-17, cy + 3); ctx.quadraticCurveTo(-3, cy + 18 + wig * 3, 13, cy + 2); ctx.quadraticCurveTo(-3, cy + 8, -17, cy + 3); ctx.closePath();
    F(ctx, '#5a1030'); ctx.fill(); S(ctx, INK, OL); ctx.stroke();
    fangs(ctx, -3, cy + 5, 4, 2.6);
  } };
  EA.jelly = { w: 66, h: 62, draw(ctx, t, p) {
    const wob = Math.sin(t * 3.4) * 0.06;
    shadow(ctx, 64, 0.3);
    ctx.save(); ctx.transform(1, 0, -wob * 0.6, 1, 0, 0); ctx.scale(1 + wob * 0.4, 1 - wob * 0.4);
    // the see-through cube: whatever it absorbed floats inside
    tone(ctx, c => rrect(c, -30, -58, 60, 58, 13), rgba(p.a, 0.62), 0, -30, 28, { dark: -0.22 });
    if (!FLAT) {
      const a0 = alphaOf(ctx);
      ctx.globalAlpha = a0 * 0.75;
      ctx.save(); ctx.translate(-12, -16 + Math.sin(t * 1.3) * 2); ctx.rotate(t * 0.4); IA.coin(ctx, 13, 13, '#ffc94d', '#b08a2b'); ctx.restore();
      ctx.save(); ctx.translate(12, -26 + Math.sin(t * 1.1 + 1) * 2); ctx.rotate(-0.6 + Math.sin(t * 0.7) * 0.3); IA.key(ctx, 20, 9, '#c9d3e0', '#4a4e58'); ctx.restore();
      ctx.globalAlpha = a0;
      F(ctx, rgba('#ffffff', 0.5)); ctx.beginPath();
      for (let i = 0; i < 3; i++) { const u = (t * 0.35 + i * 0.33) % 1; circ(ctx, -18 + i * 16, -6 - u * 44, 1.6 + i * 0.6); }
      ctx.fill();
      F(ctx, rgba('#ffffff', 0.42)); ctx.beginPath(); rrect(ctx, -24, -53, 9, 24, 4.5); ctx.fill();
    }
    eye(ctx, -13, -40, 5.5, -0.6, 0.2); eye(ctx, 3, -42, 5.5, -0.6, 0.2);
    mouth(ctx, -6, -30, 11, 4, '#2e6a4a');
    tone(ctx, c => { c.moveTo(11, -2); c.quadraticCurveTo(14, 7 + Math.sin(t * 2) * 2, 18, -2); c.closePath(); }, rgba(p.a, 0.85), 14, 0, 3, NOSPEC);
    ctx.restore();
  } };
  EA.barker = { w: 66, h: 102, draw(ctx, t, p) {
    const bob = Math.sin(t * 3.1) * 1.5, talk = Math.abs(Math.sin(t * 7));
    shadow(ctx, 56);
    limb(ctx, -8, -24, -10, -3, 7, '#3a2a5a'); limb(ctx, 8, -24, 10, -3, 7, '#3a2a5a');
    tone(ctx, c => { ell(c, -13, -2, 8, 3.5, 0); ell(c, 12, -2, 7, 3.5, 0); }, INK, 0, -2, 8, NOSPEC);
    // the cane in the back hand
    limb(ctx, 25, -36 + bob, 27, -1, 3, '#8a5a2b');
    ctx.beginPath(); ctx.arc(21, -37 + bob, 4.5, Math.PI, 0); S(ctx, INK, 6); ctx.stroke(); S(ctx, '#8a5a2b', 3); ctx.stroke();
    limb(ctx, 14, -54 + bob, 24, -39 + bob, 5, p.a);
    // the striped jacket
    tone(ctx, c => rrect(c, -18, -64 + bob, 36, 42, 9), p.a, 0, -44, 20, { dark: -0.3 });
    if (!FLAT) { F(ctx, rgba('#ffffff', 0.85)); ctx.fillRect(-11, -62 + bob, 5, 38); ctx.fillRect(1, -62 + bob, 5, 38); ctx.fillRect(12, -60 + bob, 3, 34); }
    ctx.beginPath(); rrect(ctx, -18, -64 + bob, 36, 42, 9); S(ctx, INK, OL); ctx.stroke();
    tone(ctx, c => { poly(c, [0, -63 + bob, -8, -68 + bob, -8, -58 + bob]); poly(c, [0, -63 + bob, 8, -68 + bob, 8, -58 + bob]); }, p.b, 0, -63, 6, NOSPEC);
    // the head, a curly moustache, the straw boater
    tone(ctx, c => circ(c, -1, -77 + bob, 13), '#f1c6a0', -1, -77, 13, { dark: -0.25 });
    eye(ctx, -7, -81 + bob, 3.6, -0.7, 0); eye(ctx, 3, -82 + bob, 3.6, -0.7, 0);
    F(ctx, '#5a1030'); ctx.beginPath(); ell(ctx, -6, -69 + bob, 4, 1 + talk * 2, 0); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-2, -73 + bob); ctx.quadraticCurveTo(-9, -76 + bob, -15, -71 + bob); ctx.quadraticCurveTo(-18, -75 + bob, -13, -78 + bob);
    ctx.moveTo(-2, -73 + bob); ctx.quadraticCurveTo(6, -76 + bob, 10, -71 + bob); ctx.quadraticCurveTo(14, -74 + bob, 10, -78 + bob);
    S(ctx, INK, 3.2); ctx.stroke();
    tone(ctx, c => ell(c, -1, -89 + bob, 19, 4, 0), p.b, -1, -89, 16, NOSPEC);
    tone(ctx, c => rrect(c, -12, -101 + bob, 22, 12, 3), p.b, -1, -95, 10, NOSPEC);
    F(ctx, PAL.blood); ctx.fillRect(-12, -93 + bob, 22, 3.5);
    // the megaphone at its mouth
    limb(ctx, -14, -52 + bob, -22, -64 + bob, 5, p.a);
    tone(ctx, c => poly(c, [-20, -70 + bob, -42, -79 + bob, -42, -55 + bob, -20, -63 + bob]), p.b, -31, -67, 10, { dark: -0.3 });
    ctx.beginPath(); ell(ctx, -42, -67 + bob, 3, 12, 0); F(ctx, PAL.blood); ctx.fill(); S(ctx, INK, 2); ctx.stroke();
  } };
  EA.magbat = { w: 92, h: 62, draw(ctx, t, p) {
    const fl = Math.sin(t * 9), y0 = -42 + Math.sin(t * 2.5) * 4;
    shadow(ctx, 40, 0.2);
    for (let dir = -1; dir <= 1; dir += 2) {
      tone(ctx, c => { c.moveTo(dir * 10, y0 - 4); c.quadraticCurveTo(dir * 26, y0 - 26 + fl * 8, dir * 46, y0 - 14 + fl * 10); c.quadraticCurveTo(dir * 38, y0 - 2 + fl * 6, dir * 30, y0 + 2 + fl * 6); c.quadraticCurveTo(dir * 24, y0 + 6 + fl * 4, dir * 16, y0 + 6); c.closePath(); }, p.b, dir * 28, y0 - 8, 22, { dark: -0.35, spec: false });
    }
    if (!FLAT) { F(ctx, shade(p.b, -0.45)); ctx.beginPath(); for (let d = -1; d <= 1; d += 2) { circ(ctx, d * 24, y0 - 11 + fl * 5, 1.8); circ(ctx, d * 35, y0 - 9 + fl * 7, 1.8); } ctx.fill(); }
    // a horseshoe magnet for a head, poles up, a spark jumping between them
    ctx.beginPath(); ctx.moveTo(-10, y0 - 30); ctx.lineTo(-10, y0 - 18); ctx.arc(0, y0 - 18, 10, Math.PI, 0, true); ctx.lineTo(10, y0 - 30);
    S(ctx, INK, 12); ctx.stroke(); S(ctx, p.a, 7.5); ctx.stroke();
    tone(ctx, c => { c.rect(-14, y0 - 37, 8, 7); c.rect(6, y0 - 37, 8, 7); }, '#c9d3e0', 0, y0 - 33, 8, NOSPEC);
    if (!FLAT) {
      const k = Math.sin(t * 23) > 0 ? 1 : -1;
      glow(ctx, 0, y0 - 35, 12, PAL.cyan, 0.5);
      ctx.beginPath(); ctx.moveTo(-6, y0 - 34); ctx.lineTo(-2, y0 - 38 - k * 2); ctx.lineTo(2, y0 - 31 + k * 2); ctx.lineTo(6, y0 - 34); S(ctx, PAL.cyan, 2); ctx.stroke();
    }
    tone(ctx, c => ell(c, 0, y0, 14, 15, 0), p.a, 0, y0, 14, { dark: -0.3 });
    eye(ctx, -6, y0 - 3, 4, -0.7, 0.3, '#ffcf3a'); eye(ctx, 6, y0 - 3, 4, -0.7, 0.3, '#ffcf3a');
    fangs(ctx, 0, y0 + 7, 2, 3);
  } };
  EA.mole = { w: 72, h: 64, draw(ctx, t, p) {
    // the fidget: it ducks into its hole and pops back up
    const dip = LIFE.kind === 'peek' ? Math.sin(LIFE.fk * Math.PI) * LIFE.fid * 18 : 0, b = Math.sin(t * 3) * 1.5 + dip;
    shadow(ctx, 72);
    ctx.save(); ctx.beginPath(); ctx.rect(-42, -90, 84, 82); ctx.clip();
    tone(ctx, c => { c.moveTo(-21, 0); c.quadraticCurveTo(-25, -50 + b, 0, -52 + b); c.quadraticCurveTo(25, -50 + b, 21, 0); c.closePath(); }, p.a, 0, -30 + b, 22, { dark: -0.3 });
    if (!FLAT) { F(ctx, shade(p.a, 0.25)); ctx.beginPath(); ell(ctx, -2, -20 + b, 10, 12, 0); ctx.fill(); }
    // a hard hat with a lamp (the foundry floor is dark)
    tone(ctx, c => { c.moveTo(-19, -44 + b); c.arc(0, -44 + b, 19, Math.PI, 0); c.closePath(); }, '#ffc94d', 0, -52 + b, 16, { dark: -0.3 });
    tone(ctx, c => rrect(c, -24, -46 + b, 44, 5, 2), '#e8a82a', -2, -44, 20, NOSPEC);
    tone(ctx, c => circ(c, -12, -54 + b, 5), '#fff6c0', -12, -54, 5, NOSPEC);
    if (!FLAT) glow(ctx, -14, -54 + b, 16, '#fff6c0', 0.5 + Math.sin(t * 5) * 0.1);
    eye(ctx, -11, -36 + b, 3.4, -0.7, 0.3); eye(ctx, 2, -37 + b, 3.4, -0.7, 0.3);
    tone(ctx, c => star(c, -18, -26 + b, 7, 8, 0.55), p.b, -18, -26, 7, { dark: -0.2 });
    tone(ctx, c => { ell(c, -20, -12 + b * 0.5, 7, 5, -0.4); ell(c, 17, -10 + b * 0.5, 7, 5, 0.4); }, p.b, 0, -11, 8, { dark: -0.25 });
    ctx.restore();
    // the mound it pops out of
    tone(ctx, c => { c.moveTo(-36, 0); c.quadraticCurveTo(-30, -16, -10, -10); c.quadraticCurveTo(0, -16, 12, -10); c.quadraticCurveTo(30, -16, 36, 0); c.closePath(); }, '#6a4428', 0, -6, 30, { dark: -0.3 });
    F(ctx, '#3e2616'); ctx.beginPath(); circ(ctx, -22, -6, 3); circ(ctx, 8, -8, 2.4); circ(ctx, 24, -5, 2.8); ctx.fill();
  } };
  EA.dozer = { w: 112, h: 80, draw(ctx, t, p) {
    const y = Math.sin(t * 38) * 0.6;   // the engine idles
    shadow(ctx, 112);
    if (!FLAT) for (let i = 0; i < 3; i++) { const u = (t * 0.8 + i / 3) % 1; F(ctx, rgba('#8e8a96', 0.45 * (1 - u))); ctx.beginPath(); circ(ctx, 36 + u * 8, -86 - u * 26 + y, 4 + u * 7); ctx.fill(); }
    tone(ctx, c => rrect(c, 32, -88 + y, 7, 26, 2), '#4a4e58', 35, -76, 5, NOSPEC);
    // tracks and wheels
    tone(ctx, c => rrect(c, -42, -20, 90, 20, 10), '#2b2340', 3, -10, 40, { dark: -0.25, spec: false });
    for (let i = 0; i < 4; i++) {
      const wx = -30 + i * 24, a = -t * 6 + i;
      tone(ctx, c => circ(c, wx, -10, 7), '#6b6f7a', wx, -10, 7, NOSPEC);
      ctx.beginPath(); ctx.moveTo(wx + Math.cos(a) * 6, -10 + Math.sin(a) * 6); ctx.lineTo(wx - Math.cos(a) * 6, -10 - Math.sin(a) * 6); S(ctx, INK, 1.6); ctx.stroke();
    }
    // the body and the cab
    tone(ctx, c => rrect(c, -36, -46 + y, 64, 28, 5), p.a, -4, -32, 30, { dark: -0.3 });
    tone(ctx, c => rrect(c, -2, -76 + y, 34, 32, 4), p.a, 15, -60, 16, { dark: -0.3 });
    if (!FLAT) {
      F(ctx, rgba('#9fd8ff', 0.75)); ctx.beginPath(); rrect(ctx, 2, -72 + y, 25, 17, 3); ctx.fill();
      F(ctx, rgba('#ffffff', 0.6)); ctx.beginPath(); poly(ctx, [6, -70 + y, 12, -70 + y, 8, -57 + y, 4, -57 + y]); ctx.fill();
      ctx.save(); ctx.beginPath(); ctx.rect(-36, -24 + y, 64, 5); ctx.clip();
      for (let i = 0; i < 9; i++) { F(ctx, i % 2 ? INK : PAL.gold); ctx.beginPath(); poly(ctx, [-40 + i * 8, -19 + y, -34 + i * 8, -24 + y, -28 + i * 8, -24 + y, -34 + i * 8, -19 + y]); ctx.fill(); }
      ctx.restore();
    }
    // headlight eyes under angry brows, a grille grin
    eye(ctx, -26, -37 + y, 5.5, -0.8, 0, '#ff5a4a'); eye(ctx, -12, -38 + y, 5, -0.8, 0, '#ff5a4a');
    ctx.beginPath(); ctx.moveTo(-32, -46 + y); ctx.lineTo(-20, -43 + y); ctx.moveTo(-17, -46 + y); ctx.lineTo(-6, -44 + y); S(ctx, INK, 3); ctx.stroke();
    tone(ctx, c => rrect(c, -30, -30 + y, 22, 7, 2), '#4a4e58', -19, -27, 10, NOSPEC);
    ctx.beginPath(); for (let i = 0; i < 4; i++) { ctx.moveTo(-26 + i * 5, -29 + y); ctx.lineTo(-26 + i * 5, -24 + y); } S(ctx, INK, 1.4); ctx.stroke();
    // the push arm and the blade, facing you
    limb(ctx, -30, -30 + y, -48, -22, 5, '#4a4e58');
    tone(ctx, c => { c.moveTo(-46, -3); c.quadraticCurveTo(-54, -22, -48, -48); c.lineTo(-58, -48); c.quadraticCurveTo(-65, -22, -58, -2); c.closePath(); }, '#aab3bd', -52, -24, 14, { dark: -0.35 });
    if (!FLAT) { F(ctx, PAL.gold); ctx.beginPath(); poly(ctx, [-48, -48, -58, -48, -59, -43, -49, -43]); ctx.fill(); }
  } };
  EA.ghost = { w: 62, h: 82, draw(ctx, t, p) {
    const y0 = -14 + Math.sin(t * 2) * 5, wv = t * 5;
    shadow(ctx, 44, 0.15);
    tone(ctx, c => { ell(c, -25, y0 - 30 + Math.sin(t * 3) * 3, 7, 4.5, -0.7); ell(c, 24, y0 - 28 - Math.sin(t * 3) * 3, 7, 4.5, 0.7); }, rgba(p.a, 0.9), 0, y0 - 29, 8, NOSPEC);
    tone(ctx, c => {
      c.moveTo(-24, y0 - 6); c.lineTo(-24, y0 - 40); c.arc(0, y0 - 40, 24, Math.PI, 0); c.lineTo(24, y0 - 6);
      for (let i = 0; i < 4; i++) { const x = 24 - i * 12; c.quadraticCurveTo(x - 6, y0 + 4 + Math.sin(wv + i * 1.6) * 4, x - 12, y0 - 6); }
      c.closePath();
    }, rgba(p.a, 0.9), 0, y0 - 30, 26, { dark: -0.18 });
    const sh = 1 - LIFE.blink * 0.9;
    F(ctx, INK); ctx.beginPath(); ell(ctx, -10, y0 - 42, 4.5, 7 * sh, 0); ell(ctx, 6, y0 - 43, 4.5, 7 * sh, 0); ctx.fill();
    if (!FLAT && sh > 0.5) { F(ctx, '#fff'); ctx.beginPath(); circ(ctx, -11.5, y0 - 45, 1.5); circ(ctx, 4.5, y0 - 46, 1.5); ctx.fill(); }
    F(ctx, INK); ctx.beginPath(); ell(ctx, -3, y0 - 28, 4, 5 + Math.sin(t * 4) * 1.2, 0); ctx.fill();
    if (!FLAT) { F(ctx, rgba('#ff9ec7', 0.55)); ctx.beginPath(); ell(ctx, -17, y0 - 33, 4, 2.5, 0); ell(ctx, 12, y0 - 34, 4, 2.5, 0); ctx.fill(); }
  } };
  EA.collector = { w: 80, h: 120, draw(ctx, t, p) {
    const bob = Math.sin(t * 2.6) * 1.5, sw = Math.sin(t * 1.8) * 0.3;
    shadow(ctx, 64);
    // the crane arm off its back, its own mini claw swinging on a cable
    limb(ctx, 13, -62 + bob, 30, -110 + bob, 4, '#4a4e58');
    limb(ctx, 30, -110 + bob, 40, -112 + bob, 4, '#4a4e58');
    const cx = 40, cy = -112 + bob, hx = cx + Math.sin(sw) * 20, hy = cy + Math.cos(sw) * 20;
    line(ctx, cx, cy, hx, hy, INK, 1.5);
    bestMiniClaw(ctx, hx, hy, 0.55, 0.35 + Math.sin(t * 2) * 0.15, t, sw);
    // legs, the long coat, gold buttons, a cravat
    limb(ctx, -9, -18, -11, -2, 6, '#2b2340'); limb(ctx, 9, -18, 11, -2, 6, '#2b2340');
    tone(ctx, c => { c.moveTo(-24, -16); c.lineTo(-17, -70 + bob); c.lineTo(17, -70 + bob); c.lineTo(25, -16); c.closePath(); }, p.a, 0, -44, 24, { dark: -0.32 });
    F(ctx, p.b); ctx.beginPath(); for (let i = 0; i < 3; i++) circ(ctx, -3, -58 + bob + i * 12, 2.2); ctx.fill();
    tone(ctx, c => poly(c, [-6, -70 + bob, 6, -70 + bob, 0, -57 + bob]), '#f4ecff', 0, -64, 5, NOSPEC);
    // the cane arm
    limb(ctx, -15, -58 + bob, -26, -42 + bob, 5, p.a);
    limb(ctx, -27, -46 + bob, -29, -1, 3, '#1d1233');
    tone(ctx, c => circ(c, -27, -48 + bob, 4), p.b, -27, -48, 4, NOSPEC);
    // the head, a monocle on a chain, a thin smile, the top hat
    tone(ctx, c => circ(c, 0, -82 + bob, 13), '#d8cdea', 0, -82, 13, { dark: -0.25 });
    eye(ctx, -6, -84 + bob, 4, -0.7, 0.1); eye(ctx, 5, -84 + bob, 3.4, -0.7, 0.1);
    ctx.beginPath(); circ(ctx, -6, -84 + bob, 6.2); S(ctx, p.b, 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-6, -78 + bob); ctx.quadraticCurveTo(-11, -70 + bob, -4, -64 + bob); S(ctx, p.b, 1.2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-8, -75 + bob); ctx.quadraticCurveTo(-2, -72 + bob, 5, -76 + bob); S(ctx, INK, 2); ctx.stroke();
    tone(ctx, c => ell(c, 0, -94 + bob, 17, 3.5, 0), '#1d1233', 0, -94, 16, NOSPEC);
    tone(ctx, c => rrect(c, -10, -117 + bob, 20, 23, 2), '#1d1233', 0, -106, 10, NOSPEC);
    F(ctx, p.b); ctx.fillRect(-10, -100 + bob, 20, 3.5);
  } };
  ENEMY_KEYS.push('tickler', 'jelly', 'barker', 'magbat', 'mole', 'dozer', 'ghost', 'collector');
  Object.assign(ENEMY_PAL, {
    tickler: ['#ff8ad8', '#7a3aa8', '#ffe066'], jelly: ['#7af0c8', '#2e9e8a', '#ffffff'], barker: ['#ff2e88', '#ffc94d', '#ffffff'],
    magbat: ['#d81f3a', '#c9d3e0', '#2ee6d6'], mole: ['#8a5a3a', '#ffb0c0', '#ffc94d'], dozer: ['#ffc94d', '#3a3230', '#ff5a4a'],
    ghost: ['#e8f4ff', '#9fd8ff', '#ff9ec7'], collector: ['#7a3aa8', '#ffc94d', '#d8cdea'],
  });

  // ---- intent icons (the bubble over the head) and the rival claw chip
  const BW_SHORT = { str: 'STR', block: 'BLK', heal: 'HP', gold: '$', thorns: 'SPK' };
  function bestIntentIcon(ctx, k, it, cy, t, shakeX) {
    switch (k) {
      case 'tickle':
        ctx.save(); ctx.translate(shakeX, cy); ctx.rotate(-0.6 + Math.sin(t * 14) * 0.35); IA.feather(ctx, 22, 10, '#ffe066', '#ff9a2e'); ctx.restore();
        return true;
      case 'glue': {
        const d = Math.sin(t * 3) * 2;
        tone(ctx, c => { c.moveTo(-9, cy - 6); c.quadraticCurveTo(0, cy - 12, 9, cy - 6); c.lineTo(9, cy + 1); c.quadraticCurveTo(5, cy + 2, 4, cy + 6 + d); c.quadraticCurveTo(2, cy + 10 + d, 0, cy + 6 + d); c.quadraticCurveTo(-2, cy + 2, -9, cy + 2); c.closePath(); }, '#7af0c8', 0, cy - 2, 9, { dark: -0.25 });
        return true;
      }
      case 'ceiling':
        ctx.save(); ctx.translate(shakeX, cy + 2);
        ctx.beginPath(); ctx.moveTo(-7, 6); ctx.lineTo(-7, -1); ctx.arc(0, -1, 7, Math.PI, 0); ctx.lineTo(7, 6);
        S(ctx, INK, 7); ctx.stroke(); S(ctx, '#d81f3a', 4); ctx.stroke();
        F(ctx, '#c9d3e0'); ctx.fillRect(-9, 4, 4, 4); ctx.fillRect(5, 4, 4, 4);
        ctx.restore();
        txt(ctx, '^', 12, cy - 7 - Math.abs(Math.sin(t * 5)) * 2, 12, PAL.cyan, true, 'center', INK);
        return true;
      case 'plow':
        ctx.save(); ctx.translate(shakeX + 3, cy);
        tone(ctx, c => { c.moveTo(-4, -9); c.quadraticCurveTo(-10, 0, -4, 9); c.lineTo(2, 9); c.quadraticCurveTo(-3, 0, 2, -9); c.closePath(); }, '#aab3bd', -2, 0, 8, NOSPEC);
        F(ctx, PAL.gold); ctx.fillRect(1, -3, 9, 6);
        ctx.restore();
        txt(ctx, '<', -10 - (t * 16) % 4, cy + 0.5, 12, PAL.gold, true, 'center', INK);
        return true;
      case 'vanish':
        ctx.save(); ctx.setLineDash(DASH_GHOST); ctx.lineDashOffset = -t * 20;
        ctx.beginPath(); circ(ctx, 0, cy, 8.5); S(ctx, '#e8f4ff', 2); ctx.stroke(); ctx.setLineDash(NODASH); ctx.restore();
        txt(ctx, '?', 0, cy + 0.5, 11, '#e8f4ff', true, 'center', INK);
        return true;
      case 'bury':
        tone(ctx, c => { c.moveTo(-12, cy + 8); c.quadraticCurveTo(0, cy - 6, 12, cy + 8); c.closePath(); }, '#7a5230', 0, cy + 3, 8, NOSPEC);
        txt(ctx, 'v', 0, cy - 7 + Math.abs(Math.sin(t * 4)) * 3, 11, PAL.gold, true, 'center', INK);
        return true;
      case 'wheel':
        bestWheelDisc(ctx, 0, cy, 11, t * 3, -1, false);
        return true;
      default: return false;
    }
  }
  function bestIntentRide(ctx, e, bw, cy, t) {
    if (!e || !e.def || !e.def.rival) return;
    const pul = 1 + Math.abs(Math.sin(t * 5)) * 0.08;
    ctx.save(); ctx.translate(-bw / 2 - 16, cy); ctx.scale(pul, pul);
    glow(ctx, 0, 0, 18, PAL.gold, 0.35);
    ctx.beginPath(); ctx.arc(0, 0, 11, 0, TAU); F(ctx, shade(PAL.gold, -0.62)); ctx.fill(); S(ctx, PAL.gold, 2); ctx.stroke();
    bestMiniClaw(ctx, 0, -4, 0.42, 0.4 + Math.sin(t * 4) * 0.3, t, 0);
    ctx.restore();
    if (e.enraged) txt(ctx, 'x2', -bw / 2 - 16, cy + 15, 9, PAL.gold, true, 'center', INK);
  }

  // ---- the machine tricks inside the cabinet (stage coordinates)
  // The magnetized lid (Magnet Bat): a red bar under the lid, field ripples.
  function bestCeiling(ctx, x, y, w, k, t) {
    if (!(k > 0.01)) return;
    ctx.save();
    try {
      const a = clamp01(k);
      ctx.globalAlpha = a;
      glow(ctx, x + w * 0.5, y + 10, 150, PAL.cyan, 0.3 + Math.sin(t * 6) * 0.08);
      ctx.beginPath(); rrect(ctx, x + 6, y, w - 12, 12, 5); F(ctx, '#d81f3a'); ctx.fill(); S(ctx, INK, 2.5); ctx.stroke();
      for (let i = 0; i < 8; i++) txt(ctx, i % 2 ? '-' : '+', x + 16 + i * (w - 32) / 7, y + 6.5, 10, i % 2 ? '#c9d3e0' : '#ffffff', true, 'center');
      S(ctx, PAL.cyan, 2);
      for (let i = 0; i < 3; i++) {
        const u = (t * 0.9 + i / 3) % 1;
        ctx.globalAlpha = a * (1 - u) * 0.6;
        ctx.beginPath(); ctx.moveTo(x + 22, y + 16 + u * 80); ctx.quadraticCurveTo(x + w / 2, y + 28 + u * 80, x + w - 22, y + 16 + u * 80); ctx.stroke();
      }
    } catch (e) { /* */ }
    ctx.restore();
  }
  // A crackling field line from the lid to one hanging item.
  function bestField(ctx, x0, y0, x1, y1, t, k, seed) {
    ctx.save();
    try {
      ctx.globalAlpha = clamp01(k) * (0.5 + 0.3 * Math.sin(t * 17 + seed));
      ctx.beginPath(); ctx.moveTo(x0, y0);
      for (let i = 1; i < 5; i++) { const u = i / 5, j = ((i + Math.floor(t * 14 + seed)) % 2 ? 1 : -1) * 4; ctx.lineTo(x0 + (x1 - x0) * u + j, y0 + (y1 - y0) * u); }
      ctx.lineTo(x1, y1);
      S(ctx, PAL.cyan, 1.6); ctx.stroke();
    } catch (e) { /* */ }
    ctx.restore();
  }
  // A goo strand between two glued items (Jelly Cube); s = stretch 0..1.
  function bestGoo(ctx, ax, ay, bx, by, s, t) {
    ctx.save();
    try {
      s = clamp01(s);
      const mx = (ax + bx) / 2, my = (ay + by) / 2 + 5 + s * 10 + Math.sin(t * 3 + ax * 0.1) * 1.5;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(mx, my, bx, by);
      S(ctx, 'rgba(46,158,138,0.55)', 6.5 - s * 4); ctx.stroke();
      S(ctx, 'rgba(157,255,216,0.75)', 3.2 - s * 2); ctx.stroke();
      F(ctx, 'rgba(122,240,200,0.8)'); ctx.beginPath(); ell(ctx, mx, (ay + by) / 2 + 7 + s * 5, 2.2, 3.2 + s * 2, 0); ctx.fill();
    } catch (e) { /* */ }
    ctx.restore();
  }
  // The slime coat on a glued item: a sheen and a drip.
  function bestSlimed(ctx, x, y, r, t, seed) {
    ctx.save();
    try {
      ctx.beginPath(); ctx.arc(x, y, r * 0.95, 0, TAU); F(ctx, 'rgba(122,240,200,0.16)'); ctx.fill(); S(ctx, 'rgba(157,255,216,0.5)', 1.6); ctx.stroke();
      const u = (t * 0.6 + seed) % 1;
      F(ctx, rgba('#7af0c8', 0.8 * (1 - u))); ctx.beginPath(); ell(ctx, x + r * 0.3, y + r * 0.8 + u * 8, 2, 3, 0); ctx.fill();
    } catch (e) { /* */ }
    ctx.restore();
  }
  // A dirt mound on the floor with the buried item's tip poking out (Mole):
  // the claw dropped on it digs it up. k 0..1 grows it in.
  function bestMound(ctx, x, y, def, t, k, seed) {
    ctx.save();
    try {
      k = clamp01(k == null ? 1 : k);
      const tw = Math.sin(t * 0.9 + seed) > 0.85 ? Math.sin(t * 40 + seed) * 1.5 : 0;   // it twitches now and then
      ctx.translate(x + tw, y); ctx.scale(k * 1.3, k * 1.3);
      if (def) { ctx.save(); ctx.beginPath(); ctx.rect(-30, -44, 60, 32); ctx.clip(); item(ctx, def, 4, -12, -0.5 + (seed % 1) * 0.4, 0.75, NOEST); ctx.restore(); }
      tone(ctx, c => { c.moveTo(-27, 2); c.quadraticCurveTo(-21, -19, 0, -19); c.quadraticCurveTo(21, -19, 27, 2); c.closePath(); }, '#7a5230', 0, -8, 20, { dark: -0.3 });
      F(ctx, '#4a2e18'); ctx.beginPath(); circ(ctx, -12, -6, 2.4); circ(ctx, 7, -11, 2); circ(ctx, 15, -3, 2.6); ctx.fill();
      const pul = 0.5 + 0.5 * Math.sin(t * 5 + seed);
      ctx.setLineDash(DASH_GHOST); ctx.lineDashOffset = -t * 18;
      ctx.beginPath(); ell(ctx, 0, -6, 32 + pul * 3, 15 + pul * 2, 0); S(ctx, rgba(PAL.gold, 0.5 + pul * 0.35), 2); ctx.stroke();
      ctx.setLineDash(NODASH);
      txt(ctx, 'DIG', 0, -30 - pul * 3, 10, PAL.gold, true, 'center', INK);
    } catch (e) { /* */ }
    ctx.restore();
  }
  // An invisible item (Peekaboo Ghost): a faint ghost of it, a dashed
  // outline and a glint crawling round it. k 1 = hidden, 0 = back to normal.
  const GHOSTO = { plus: false, alpha: 0.1 };
  function bestGhostItem(ctx, def, x, y, a, r, t, k, plus, seed) {
    ctx.save();
    try {
      k = clamp01(k);
      GHOSTO.plus = !!plus; GHOSTO.alpha = 1 - k * 0.9;
      item(ctx, def, x, y, a, 1, GHOSTO);
      if (k > 0.05) {
        ctx.globalAlpha = k;
        glow(ctx, x, y, r * 1.6, '#bfe8ff', 0.25 + Math.sin(t * 2.5 + seed) * 0.08);
        ctx.setLineDash(DASH_GHOST); ctx.lineDashOffset = -t * 14 - seed * 10;
        ctx.beginPath(); circ(ctx, x, y, r * 0.8 + 3 + Math.sin(t * 3 + seed) * 1.5); S(ctx, '#e8f4ff', 2.4); ctx.stroke();
        ctx.setLineDash(NODASH);
        const ga = t * 1.7 + seed * 3;
        ctx.beginPath(); star(ctx, x + Math.cos(ga) * (r * 0.8 + 3), y + Math.sin(ga) * (r * 0.8 + 3), 4.5, 4, 0.35); F(ctx, '#ffffff'); ctx.fill();
        txt(ctx, '?', x, y + 0.5, 13, 'rgba(232,244,255,0.9)', true, 'center', INK);
      }
    } catch (e) { /* */ }
    ctx.restore();
  }
  // The Bulldozer's blade sweeping the bin: a steel plate at x from y0 to
  // y1, its hydraulic arms back to xr (the chute side wall).
  function bestBlade(ctx, x, y0, y1, xr, t, k) {
    if (!(k > 0.01)) return;
    ctx.save();
    try {
      ctx.globalAlpha = clamp01(k);
      const h = y1 - y0;
      limb(ctx, x + 8, y0 + h * 0.4, xr, y0 + h * 0.36, 8, '#4a4e58');
      limb(ctx, x + 8, y0 + h * 0.75, xr, y0 + h * 0.7, 6, '#6b6f7a');
      tone(ctx, c => { c.moveTo(x, y1); c.quadraticCurveTo(x - 16, y0 + h * 0.5, x, y0); c.lineTo(x + 18, y0); c.quadraticCurveTo(x + 4, y0 + h * 0.5, x + 18, y1); c.closePath(); }, '#aab3bd', x + 4, y0 + h * 0.5, 16, { dark: -0.35 });
      ctx.save(); ctx.beginPath(); ctx.rect(x - 4, y0, 24, 16); ctx.clip();
      for (let i = 0; i < 6; i++) { F(ctx, i % 2 ? INK : PAL.gold); ctx.beginPath(); poly(ctx, [x - 6, y0 + i * 7, x + 22, y0 + i * 7 - 11, x + 22, y0 + i * 7 - 4, x - 6, y0 + i * 7 + 7]); ctx.fill(); }
      ctx.restore();
      // rivets down the plate
      F(ctx, INK); ctx.beginPath(); for (let i = 1; i < 5; i++) circ(ctx, x + 7 - Math.sin(i / 5 * Math.PI) * 5, y0 + h * i / 5, 1.8); ctx.fill();
    } catch (e) { /* */ }
    ctx.restore();
  }
  // The prize wheel's disc: eight wedges (yours cyan / gold / green, its own
  // pink), hi = the landed wedge (it glows), labels at big sizes.
  function bestWheelDisc(ctx, x, y, r, rot, hi, labels) {
    const Wd = (typeof COMBAT !== 'undefined' && COMBAT.BEST_WHEEL) || null;
    const n = Wd ? Wd.length : 8, wd = TAU / n;
    for (let i = 0; i < n; i++) {
      const w = Wd ? Wd[i] : null, you = w ? w.who === 'you' : i % 2 === 1;
      const a0 = rot + i * wd - Math.PI / 2 - wd / 2;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r, a0, a0 + wd); ctx.closePath();
      F(ctx, you ? (w ? w.col : PAL.cyan) : (i % 4 === 0 ? '#ff2e88' : '#c21f6a'));
      ctx.fill();
      if (i === hi) { F(ctx, 'rgba(255,255,255,0.35)'); ctx.fill(); }
      S(ctx, INK, r > 20 ? 2 : 1.2); ctx.stroke();
      if (labels && r >= 30 && w) {
        ctx.save(); ctx.translate(x + Math.cos(a0 + wd / 2) * r * 0.66, y + Math.sin(a0 + wd / 2) * r * 0.66); ctx.rotate(a0 + wd / 2 + Math.PI / 2);
        txt(ctx, BW_SHORT[w.k] || '?', 0, -3, Math.max(8, r * 0.2), '#ffffff', true, 'center', INK);
        txt(ctx, you ? 'YOU' : 'IT', 0, 7, Math.max(7, r * 0.15), you ? '#12091f' : '#ffe0f0', true, 'center');
        ctx.restore();
      }
    }
    ctx.beginPath(); circ(ctx, x, y, r); S(ctx, PAL.gold, r > 20 ? 3.5 : 2); ctx.stroke();
    ctx.beginPath(); star(ctx, x, y, r * 0.2, 5, 0.5); F(ctx, PAL.gold); ctx.fill(); S(ctx, INK, 1.2); ctx.stroke();
  }
  /* The Carnival Barker's prize wheel sign, hung by chains at (x, y) with
     radius r. st: {rot, hi, t, k (0..1 grow in), label, who, flash 0..1}. */
  function bestWheelSign(ctx, x, y, r, st) {
    ctx.save();
    try {
      const t = st.t || 0, k = clamp01(st.k == null ? 1 : st.k);
      if (k <= 0) { ctx.restore(); return; }
      ctx.translate(x, y); ctx.scale(k, k);
      S(ctx, '#8e98a8', 2);
      ctx.beginPath(); ctx.moveTo(-r * 0.6, -r - 30); ctx.lineTo(-r * 0.5, -r * 0.8); ctx.moveTo(r * 0.6, -r - 30); ctx.lineTo(r * 0.5, -r * 0.8); ctx.stroke();
      glow(ctx, 0, 0, r * 1.6, st.who === 'you' ? PAL.cyan : PAL.pink, 0.25 + (st.flash || 0) * 0.5);
      tone(ctx, c => circ(c, 0, 0, r + 9), '#5a3414', 0, 0, r + 9, { dark: -0.35 });
      for (let i = 0; i < 16; i++) {
        const a = i / 16 * TAU, on = (i + Math.floor(t * (st.hi >= 0 ? 14 : 5))) % 3 === 0;
        ctx.beginPath(); circ(ctx, Math.cos(a) * (r + 4.5), Math.sin(a) * (r + 4.5), 2.4); F(ctx, on ? '#fff6c0' : '#8a6a2a'); ctx.fill();
      }
      bestWheelDisc(ctx, 0, 0, r, st.rot || 0, st.hi == null ? -1 : st.hi, true);
      // the flapper on top
      tone(ctx, c => poly(c, [-7, -r - 12, 7, -r - 12, 0, -r + 4]), PAL.gold, 0, -r - 5, 7, { dark: -0.3 });
      if (st.label && st.hi >= 0) {
        const col = st.who === 'you' ? PAL.cyan : PAL.pink;
        ctx.font = 'bold 13px ' + FONT;
        let tw = 90;
        try { const m = ctx.measureText(String(st.label)); if (m && m.width > 0) tw = m.width; } catch (e) { /* stub */ }
        const pw = tw + 20;
        ctx.beginPath(); rrect(ctx, -pw / 2, r + 12, pw, 22, 8); F(ctx, shade(col, -0.62)); ctx.fill(); S(ctx, col, 2); ctx.stroke();
        txt(ctx, String(st.label), 0, r + 23.5, 13, col, true, 'center', INK);
      }
    } catch (e) { /* */ }
    ctx.restore();
  }
  // Tickling feathers poking at the claw (Tickle Monster): hub at (x, y).
  function bestFeathers(ctx, x, y, t, k) {
    if (!(k > 0.01)) return;
    ctx.save();
    try {
      ctx.globalAlpha = clamp01(k);
      for (let d = -1; d <= 1; d += 2) {
        const ex = x + d * 26, ey = y + 12 + Math.sin(t * 11 + d * 2) * 4;
        limb(ctx, x + d * 72, y - 26, ex + d * 8, ey, 3, '#b06ad8');
        ctx.save(); ctx.translate(ex, ey); ctx.rotate((d < 0 ? 0 : Math.PI) + Math.sin(t * 16 + d) * 0.5); IA.feather(ctx, 32, 14, '#ffe066', '#ff9a2e'); ctx.restore();
      }
      txt(ctx, 'hee hee', x, y - 34 + Math.sin(t * 7) * 3, 12, '#ff8ad8', true, 'center', INK);
    } catch (e) { /* */ }
    ctx.restore();
  }
  // The rival claw in the cabinet (Claw Collector): its trolley under the
  // lid at top, the cable, the gold claw at (x, y), open 0..1, lamp on.
  function bestRival(ctx, x, y, top, open, t, lamp) {
    ctx.save();
    try {
      tone(ctx, c => rrect(c, x - 13, top - 7, 26, 11, 3), '#5a3a7a', x, top - 1, 12, NOSPEC);
      if (lamp) glow(ctx, x, top - 2, 14, PAL.blood, 0.6 + Math.sin(t * 12) * 0.2);
      F(ctx, lamp ? PAL.blood : '#5a1030'); ctx.beginPath(); circ(ctx, x, top - 2, 2.6); ctx.fill();
      line(ctx, x, top + 4, x, y - 6, INK, 2);
      bestMiniClaw(ctx, x, y, 1, open, t, 0);
    } catch (e) { /* */ }
    ctx.restore();
  }
  // The red crosshair on the item the rival claw has its eye on.
  function bestReticle(ctx, x, y, r, t) {
    ctx.save();
    try {
      const rr = r + 6 + Math.sin(t * 6) * 2;
      ctx.translate(x, y); ctx.rotate(t * 0.8);
      ctx.beginPath(); circ(ctx, 0, 0, rr); S(ctx, rgba(PAL.blood, 0.85), 2); ctx.stroke();
      ctx.beginPath();
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; ctx.moveTo(Math.cos(a) * (rr - 5), Math.sin(a) * (rr - 5)); ctx.lineTo(Math.cos(a) * (rr + 6), Math.sin(a) * (rr + 6)); }
      S(ctx, PAL.blood, 2.5); ctx.stroke();
    } catch (e) { /* */ }
    ctx.restore();
  }

  // ---- map decor (terrainHex, lit land only, under the pickups)
  // A small cog of n teeth, radius R, turned a.
  function bestGear(ctx, x, y, R, n, a, col) {
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const a0 = a + i * Math.PI / n, rr = i % 2 ? R * 0.74 : R, hw = Math.PI / n * 0.42;
      ctx.lineTo(x + Math.cos(a0 - hw) * rr, y + Math.sin(a0 - hw) * rr); ctx.lineTo(x + Math.cos(a0 + hw) * rr, y + Math.sin(a0 + hw) * rr);
    }
    ctx.closePath();
    F(ctx, col); ctx.fill(); S(ctx, rgba(INK, 0.7), Math.max(1, R * 0.12)); ctx.stroke();
    ctx.beginPath(); circ(ctx, x, y, R * 0.3); F(ctx, rgba(INK, 0.6)); ctx.fill();
  }
  /* The biome's props on one lit land hex (origin at its centre, radius r):
     about four hexes in eleven get one, picked from the tile's seed so the
     map is stable. Cheap: a handful of paths, no gradients. */
  function bestDecor(ctx, r, p, ground, seed, t, flat) {
    let sel = ((seed >>> 13) ^ (seed >>> 5)) % 11;
    if (sel > 4) return;
    if (sel === 4) sel = 1;   // the signature prop (a puddle, a vent, icicles) is the common one
    const ox = ((((seed >>> 17) & 15) / 15) - 0.5) * r * 0.6, oy = ((((seed >>> 21) & 15) / 15) - 0.5) * r * 0.45;
    const ph = (seed & 255) / 40, lw = Math.max(1, r * 0.04);
    const busy = ground === 'forest';   // trees fill the hex: only small props there
    // props read at map zoom: drawn 1.5x about their spot (1.1x among trees)
    const K = busy ? 1.1 : 1.5;
    ctx.save(); ctx.translate(ox, oy); ctx.scale(K, K); ctx.translate(-ox, -oy);
    bestProp(ctx, r, p, sel, busy, ox, oy, ph, lw, seed, t);
    ctx.restore();
  }
  function bestProp(ctx, r, p, sel, busy, ox, oy, ph, lw, seed, t) {
    if (p.accent === 'ash') {
      // the foundry: half-sunk gears turning, steam vents puffing
      if (sel === 1 && !busy) {
        tone(ctx, c => rrect(c, ox - r * 0.14, oy - r * 0.06, r * 0.28, r * 0.12, r * 0.03), '#3a3230', ox, oy, r * 0.12, NOSPEC);
        S(ctx, rgba(INK, 0.8), lw); ctx.beginPath();
        for (let i = 0; i < 3; i++) { ctx.moveTo(ox - r * 0.08 + i * r * 0.08, oy - r * 0.04); ctx.lineTo(ox - r * 0.08 + i * r * 0.08, oy + r * 0.04); }
        ctx.stroke();
        for (let i = 0; i < 3; i++) {
          const u = (t * 0.45 + i / 3 + ph) % 1;
          F(ctx, rgba('#f4ecff', 0.4 * (1 - u))); ctx.beginPath(); circ(ctx, ox + Math.sin(u * 6 + i) * r * 0.05, oy - r * 0.08 - u * r * 0.6, r * (0.06 + 0.1 * u)); ctx.fill();
        }
      } else {
        const R = r * (sel === 3 || busy ? 0.12 : 0.19), dir = seed & 2 ? 1 : -1;
        bestGear(ctx, ox, oy, R, 8, t * 0.5 * dir + ph, '#5a5a66');
        if (sel === 2 && !busy) bestGear(ctx, ox + R * 1.55, oy - R * 0.7, R * 0.62, 6, -t * 0.8 * dir + ph + 0.3, '#8a6a3a');
      }
    } else if (p.accent === 'snow') {
      // the vault: snow drifts, icicles on an ice ledge, twinkling glints
      if (sel === 0 && !busy) {
        tone(ctx, c => { c.moveTo(ox - r * 0.38, oy + r * 0.12); c.quadraticCurveTo(ox - r * 0.12, oy - r * 0.16, ox + r * 0.1, oy - r * 0.04); c.quadraticCurveTo(ox + r * 0.3, oy - r * 0.12, ox + r * 0.4, oy + r * 0.12); c.closePath(); }, '#f4f8ff', ox, oy, r * 0.25, { dark: -0.12, ol: lw, olc: rgba('#6a8ab8', 0.7), spec: false });
      } else if (sel === 1) {
        const ly = oy - r * 0.12;
        ctx.beginPath(); rrect(ctx, ox - r * 0.26, ly - r * 0.05, r * 0.52, r * 0.08, r * 0.04); F(ctx, '#dff4ff'); ctx.fill(); S(ctx, rgba('#6a8ab8', 0.8), lw); ctx.stroke();
        ctx.beginPath();
        for (let i = 0; i < 5; i++) { const ix = ox - r * 0.2 + i * r * 0.1, len = r * (0.1 + ((seed >>> (i * 3)) & 3) * 0.06); ctx.moveTo(ix - r * 0.035, ly + r * 0.02); ctx.lineTo(ix, ly + r * 0.02 + len); ctx.lineTo(ix + r * 0.035, ly + r * 0.02); }
        F(ctx, '#bfe8ff'); ctx.fill(); S(ctx, rgba('#6a8ab8', 0.8), lw * 0.8); ctx.stroke();
        const u = (t * 0.5 + ph) % 1;   // a drop falls off the longest
        if (u < 0.6) { F(ctx, rgba('#dff4ff', 1 - u / 0.6)); ctx.beginPath(); circ(ctx, ox, ly + r * 0.3 + u * r * 0.3, r * 0.025); ctx.fill(); }
      }
      if (sel >= 2 || busy) {
        for (let i = 0; i < 2; i++) {
          const a = 0.5 + 0.5 * Math.sin(t * 2.2 + ph * 3 + i * 2.4);
          if (a < 0.35) continue;
          F(ctx, rgba('#ffffff', a)); ctx.beginPath(); star(ctx, ox + (i ? r * 0.2 : -r * 0.1), oy + (i ? -r * 0.12 : r * 0.1), r * 0.05 + a * r * 0.04, 4, 0.3); ctx.fill();
        }
      }
    } else {
      // the damp arcade: dropped tickets, neon puddles, a lost token
      if (sel === 1 && !busy) {
        const col = seed & 64 ? PAL.cyan : PAL.pink, pul = 0.5 + 0.3 * Math.sin(t * 1.8 + ph);
        glow(ctx, ox, oy, r * 0.42, col, 0.3 * pul);
        ctx.beginPath(); ell(ctx, ox, oy, r * 0.3, r * 0.12, 0); F(ctx, 'rgba(26,15,46,0.72)'); ctx.fill();
        S(ctx, rgba(col, pul), Math.max(1, r * 0.05)); ctx.stroke();
        if (Math.sin(t * 9 + ph * 3) > -0.8) { F(ctx, rgba(col, 0.6 * pul)); ctx.beginPath(); rrect(ctx, ox - r * 0.15, oy - r * 0.03, r * 0.2, r * 0.05, r * 0.025); ctx.fill(); }
        const u = (t * 0.35 + ph) % 1;
        S(ctx, rgba(col, 0.4 * (1 - u)), 1); ctx.beginPath(); ell(ctx, ox + r * 0.05, oy, r * 0.28 * u + 1, r * 0.1 * u + 0.5, 0); ctx.stroke();
      } else {
        const tw = r * 0.3, th = r * 0.14;
        ticket(ctx, ox, oy, tw, th, ((seed >>> 9) & 7) * 0.4 - 1.4, seed & 128 ? '#ffc94d' : '#ff9ec7');
        if (sel === 0 && !busy) ticket(ctx, ox + r * 0.2, oy + r * 0.1, tw, th, ((seed >>> 12) & 7) * 0.4 - 1.2, '#ff9ec7');
        if (sel === 2 && !busy) { F(ctx, PAL.gold); ctx.beginPath(); circ(ctx, ox - r * 0.22, oy + r * 0.12, r * 0.07); ctx.fill(); S(ctx, rgba(INK, 0.7), lw); ctx.stroke(); }
      }
    }
  }
  /* The aurora on the sky edge of the act 3 map: three slow ribbons, added
     light, over the top of the map area (x, y, w wide). Other acts: nothing. */
  const AURORA = ['#3dffb0', '#2ee6d6', '#b06aff'];
  function bestSky(ctx, x, y, w, act, t) {
    if (act !== 3) return;
    ctx.save();
    try {
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        for (let i = 0; i <= 18; i++) {
          const u = i / 18, px = x + u * w, py = y + 16 + k * 15 + Math.sin(u * 5 + t * (0.35 + k * 0.12) + k * 2) * 10 + Math.sin(u * 13 - t * 0.6 + k) * 3;
          if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
        }
        S(ctx, rgba(AURORA[k], 0.1 + 0.04 * Math.sin(t * 0.8 + k)), 30 - k * 6); ctx.stroke();
        S(ctx, rgba(AURORA[k], 0.18), 5); ctx.stroke();
      }
      for (let i = 0; i < 10; i++) {
        const u = (i + 0.5) / 10, px = x + u * w + Math.sin(t * 0.3 + i) * 8, a = 0.04 + 0.04 * Math.sin(t * 1.3 + i * 2.1);
        ctx.beginPath(); ctx.moveTo(px, y + 20 + Math.sin(u * 5 + t * 0.35) * 10); ctx.lineTo(px + 4, y + 70);
        S(ctx, rgba(AURORA[i % 3], a), 9); ctx.stroke();
      }
    } catch (e) { /* */ }
    ctx.restore();
  }
  // For tests and the screenshot drivers: the life of one enemy draw.
  function bestLifeOf(def, t, st, x) {
    def = def || {}; st = st || NOEST_B;
    bestLife(def, def.art, t || 0, st, x || 0, def.tier === 'boss', +st.dead || 0);
    const out = { blink: LIFE.blink, fid: LIFE.fid, fk: LIFE.fk, spin: LIFE.spin, kind: LIFE.kind, hpk: LIFE.hpk };
    LIFE.blink = 0; LIFE.fid = 0; LIFE.spin = 0;
    return out;
  }
  const NOEST_B = {};
  const BEST = { FIDGET, life: bestLifeOf, miniClaw: bestMiniClaw, ceiling: bestCeiling, field: bestField, goo: bestGoo, slimed: bestSlimed,
    mound: bestMound, ghostItem: bestGhostItem, blade: bestBlade, wheelSign: bestWheelSign, wheelDisc: bestWheelDisc, feathers: bestFeathers,
    rival: bestRival, reticle: bestReticle, decor: bestDecor, sky: bestSky };
  /* ============================================================ end BESTIARY */

  /* ============================================================ ARCADE */
  /* The map's arcade (DESIGN.md "Arcade"): the cabinet icons on the hexes,
     the three machines (plinko, the prize wheel, the slots) inside one
     neon cabinet, the roaming monster tokens with their next-step arrow,
     the event vignettes and the dice. Pure drawing from the state the game
     hands over; every function saves, restores and never throws. */
  const ARC_RAINBOW = [PAL.pink, PAL.gold, PAL.lime, PAL.cyan, '#9b7bff'];
  const NOEST = {};

  // The map hex icons: an upright peg board, a wheel on a stand, a slot machine.
  function arcIcon(ctx, type, s, t) {
    t = t || 0;
    if (type === 'plinko') {
      glow(ctx, 0, 0, s * 1.4, PAL.cyan, 0.22 + Math.sin(t * 4) * 0.08);
      tone(ctx, c => rrect(c, -s * 0.85, -s * 1.1, s * 1.7, s * 2.15, s * 0.25), '#1e3a4a', 0, 0, s, { dark: -0.35 });
      ctx.beginPath(); rrect(ctx, -s * 0.66, -s * 0.9, s * 1.32, s * 1.35, 3); F(ctx, '#0e1f2a'); ctx.fill();
      ctx.beginPath();
      for (let i = 0; i < 3; i++) { const n = 3 - (i % 2); for (let j = 0; j < n; j++) circ(ctx, (j - (n - 1) / 2) * s * 0.4, -s * 0.66 + i * s * 0.34, s * 0.07); }
      F(ctx, PAL.cyan); ctx.fill();
      for (let j = 0; j < 4; j++) { ctx.beginPath(); rrect(ctx, -s * 0.62 + j * s * 0.32, s * 0.52, s * 0.26, s * 0.36, 2); F(ctx, j === 1 || j === 2 ? PAL.gold : PAL.pink); ctx.fill(); }
      const bx = Math.sin(t * 2.2) * s * 0.35, by = -s * 0.2 - Math.abs(Math.sin(t * 3.3)) * s * 0.3;
      tone(ctx, c => circ(c, bx, by, s * 0.17), PAL.gold, bx, by, s * 0.17, { ol: 1.5 });
    } else if (type === 'wheel') {
      const cy = -s * 0.18, r = s * 0.92, n = 8, rot = t * 0.9;
      limb(ctx, -s * 0.5, s * 1.08, 0, cy, 3, '#5a6373'); limb(ctx, s * 0.5, s * 1.08, 0, cy, 3, '#5a6373');
      glow(ctx, 0, cy, s * 1.3, PAL.gold, 0.2 + Math.sin(t * 3) * 0.08);
      for (let i = 0; i < n; i++) {
        ctx.beginPath(); ctx.moveTo(0, cy); ctx.arc(0, cy, r, rot + i * TAU / n, rot + (i + 1) * TAU / n); ctx.closePath();
        F(ctx, [PAL.gold, PAL.pink, PAL.cyan, PAL.lime][i % 4]); ctx.fill();
      }
      ctx.beginPath(); circ(ctx, 0, cy, r); S(ctx, INK, 2.5); ctx.stroke();
      tone(ctx, c => circ(c, 0, cy, r * 0.22), '#fff6c0', 0, cy, r * 0.22, { ol: 1.5 });
      tone(ctx, c => poly(c, [-s * 0.2, cy - r - s * 0.3, s * 0.2, cy - r - s * 0.3, 0, cy - r + s * 0.12]), PAL.blood, 0, cy - r - s * 0.1, s * 0.2, { ol: 1.5, spec: false });
    } else {
      glow(ctx, 0, 0, s * 1.3, PAL.pink, 0.22 + Math.sin(t * 4) * 0.08);
      tone(ctx, c => rrect(c, -s * 0.85, -s * 1.05, s * 1.45, s * 2.05, s * 0.2), '#6a1f4a', -s * 0.1, 0, s, { dark: -0.35 });
      ctx.beginPath(); rrect(ctx, -s * 0.68, -s * 0.5, s * 1.1, s * 0.72, 3); F(ctx, '#f4ecd6'); ctx.fill(); S(ctx, INK, 2); ctx.stroke();
      for (let i = 0; i < 3; i++) txt(ctx, '7', -s * 0.5 + i * s * 0.37, -s * 0.13, s * 0.55, PAL.blood, true);
      for (let i = 0; i < 4; i++) { ctx.beginPath(); circ(ctx, -s * 0.6 + i * s * 0.32, -s * 0.8, s * 0.07); F(ctx, (Math.floor(t * 6) + i) % 2 ? PAL.gold : rgba(PAL.gold, 0.3)); ctx.fill(); }
      limb(ctx, s * 0.62, s * 0.2, s * 0.86, -s * 0.62, 2.5, CHROME);
      tone(ctx, c => circ(c, s * 0.86, -s * 0.66, s * 0.17), PAL.blood, s * 0.86, -s * 0.66, s * 0.17, { ol: 1.5 });
      ctx.beginPath(); rrect(ctx, -s * 0.6, s * 0.5, s * 0.95, s * 0.28, 2); F(ctx, '#2a0d20'); ctx.fill();
    }
  }

  // A point on the rounded frame's perimeter, d px along it from the top-left (for the chasing bulbs).
  const PERI = { x: 0, y: 0 };
  function periAt(x, y, w, h, d) {
    const p = 2 * (w + h);
    d = ((d % p) + p) % p;
    if (d < w) { PERI.x = x + d; PERI.y = y; } else if (d < w + h) { PERI.x = x + w; PERI.y = y + d - w; } else if (d < 2 * w + h) { PERI.x = x + w - (d - w - h); PERI.y = y + h; } else { PERI.x = x; PERI.y = y + h - (d - 2 * w - h); }
    return PERI;
  }
  /* The machine's cabinet: a purple body, a chrome marquee with the name,
     chasing bulbs round the frame (a rainbow strobe in st.party), a white
     flash (st.flash). st: {t, col, title, party, flash}. */
  function arcCabinet(ctx, x, y, w, h, st) {
    ctx.save();
    try {
      st = st || NOEST;
      const t = st.t || 0, col = st.col || PAL.gold, party = st.party || 0;
      tone(ctx, c => rrect(c, x, y, w, h, 26), '#241441', x + w / 2, y + h / 2, w / 2, FLATO);
      ctx.beginPath(); rrect(ctx, x + 6, y + 6, w - 12, 60, 20); F(ctx, rgba('#ffffff', 0.04)); ctx.fill();
      ctx.beginPath(); rrect(ctx, x + 14, y + 72, w - 28, h - 86, 16); F(ctx, '#0f0820'); ctx.fill(); S(ctx, rgba(col, 0.55), 3); ctx.stroke();
      const pul = Math.pow(Math.sin(t * 3), 2);
      ctx.beginPath(); rrect(ctx, x + 4, y + 4, w - 8, h - 8, 22); S(ctx, rgba(col, 0.3 + 0.3 * pul + Math.min(0.4, party * 0.3)), 4); ctx.stroke();
      glow(ctx, x + w / 2, y + 38, 170, col, 0.22 + Math.min(0.5, party * 0.2));
      ctx.beginPath(); rrect(ctx, x + 44, y + 12, w - 88, 52, 14); F(ctx, '#1a0d2e'); ctx.fill(); S(ctx, col, 3); ctx.stroke();
      chrome(ctx, String(st.title || 'ARCADE'), x + w / 2, y + 39, 32, col, col);
      const n = 48, per = 2 * (w - 24 + h - 24);
      for (let i = 0; i < n; i++) {
        const p = periAt(x + 12, y + 12, w - 24, h - 24, (i / n) * per);
        const on = party > 0 ? ((i + Math.floor(accStrobe(t) * 14)) % 2 === 0) : ((i + Math.floor(t * 7)) % 4 === 0);
        const bc = party > 0 ? ARC_RAINBOW[(i + Math.floor(accStrobe(t) * 10)) % 5] : col;
        ctx.beginPath(); circ(ctx, p.x, p.y, 4.2); F(ctx, on ? bc : rgba(bc, 0.22)); ctx.fill();
        if (on) glow(ctx, p.x, p.y, 13, bc, 0.55);
      }
      if (st.flash > 0) {
        ctx.globalAlpha = Math.min(0.45, st.flash * 0.35);
        ctx.beginPath(); rrect(ctx, x, y, w, h, 26); F(ctx, '#ffffff'); ctx.fill();
        ctx.globalAlpha = 1;
      }
    } catch (e) { /* never throws */ }
    ctx.restore();
  }
  // The gold play token (plinko).
  function arcToken(ctx, x, y, r, t) {
    glow(ctx, x, y, r * 2.6, PAL.gold, 0.45);
    tone(ctx, c => circ(c, x, y, r), PAL.gold, x, y, r, { ol: 2 });
    ctx.save(); ctx.translate(x, y); ctx.rotate(t * 3);
    ctx.beginPath(); star(ctx, 0, 0, r * 0.55, 5, 0.45); F(ctx, '#fff6c0'); ctx.fill();
    ctx.restore();
  }
  // A small prize icon (a slot's or a wedge's): coin, ticket, bulb, capsule, heart, star, skull.
  function arcPrizeIcon(ctx, k, x, y, r, t, tier) {
    switch (k) {
      case 'gold': tone(ctx, c => circ(c, x, y, r), PAL.gold, x, y, r, { ol: 1.5 }); txt(ctx, '$', x, y + 0.5, r * 1.2, '#8a5a10', true); break;
      case 'tix': ticket(ctx, x, y, r * 2.4, r * 1.4, -0.2, '#ff9ec7'); break;
      case 'ink': bulb(ctx, x, y, r * 0.95, t, true); break;
      case 'cap': capsule(ctx, x, y, r * 1.05, { tier: tier || 'u', t, seed: 3, glow: 0.4 }); break;
      case 'heal': tone(ctx, c => { c.moveTo(x, y + r * 0.9); c.bezierCurveTo(x - r * 1.6, y - r * 0.2, x - r * 0.6, y - r * 1.4, x, y - r * 0.45); c.bezierCurveTo(x + r * 0.6, y - r * 1.4, x + r * 1.6, y - r * 0.2, x, y + r * 0.9); c.closePath(); }, PAL.blood, x, y, r, { ol: 1.5 }); break;
      case 'curse': IA.skull(ctx, r * 1.7, r * 1.9, '#d9cbe8', INK); break;
      case 'double': txt(ctx, 'x2', x, y, r * 1.4, PAL.cyan, true, 'center', true); break;
      default: ctx.beginPath(); star(ctx, x, y, r * 1.15, 5, 0.45); F(ctx, ARC_RAINBOW[Math.floor(t * 8) % 5]); ctx.fill(); S(ctx, INK, 1.5); ctx.stroke();
    }
  }
  /* PLINKO. st: {t, pegs: [{x, y, row}], lit: {i: 0..1}, slots: [{k, label,
     col, tier}], x0, x1, top, divTop, floor, ballR, pegR, ball: {x, y} |
     null, aim: x | -1, win: slot | -1, party}. */
  function arcPlinko(ctx, st) {
    ctx.save();
    try {
      const t = st.t || 0, x0 = st.x0, x1 = st.x1, fl = st.floor, R = st.ballR || 12, pr = st.pegR || 6;
      const slots = st.slots || [], n = Math.max(1, slots.length), sw0 = (x1 - x0) / n;
      const ed = (i) => (st.edges && st.edges.length > n ? st.edges[i] : x0 + sw0 * i);
      ctx.beginPath(); rrect(ctx, x0 - 8, st.top - 34, x1 - x0 + 16, fl - st.top + 76, 12); F(ctx, '#0d1a2c'); ctx.fill(); S(ctx, INK, 3); ctx.stroke();
      // glass sheen
      ctx.save(); ctx.globalAlpha = 0.06; F(ctx, '#ffffff');
      ctx.beginPath(); ctx.moveTo(x0 + 40, st.top - 34); ctx.lineTo(x0 + 110, st.top - 34); ctx.lineTo(x0 + 10, fl - 60); ctx.lineTo(x0 - 8, fl - 60); ctx.closePath(); ctx.fill();
      ctx.restore();
      for (let i = 0; i < n; i++) {
        const s = slots[i], sx = ed(i), sw = ed(i + 1) - sx, win = st.win === i, jp = s.k === 'jackpot';
        const c = jp ? ARC_RAINBOW[Math.floor(t * 8 + i) % 5] : s.col;
        ctx.beginPath(); ctx.rect(sx + 2, st.divTop, sw - 4, fl - st.divTop);
        F(ctx, rgba(c, win ? 0.5 + 0.3 * Math.sin(t * 20) : jp ? 0.3 : 0.14)); ctx.fill();
        if (win) glow(ctx, sx + sw / 2, fl - 30, 70, c, 0.8);
        arcPrizeIcon(ctx, s.k, sx + sw / 2, fl + 17, 9, t, s.tier);
        const lab = String(s.label || '');
        // the narrow jackpot slot writes its name a row lower, wider than itself
        if (jp) txt(ctx, lab, sx + sw / 2, fl + 52, 13, ARC_RAINBOW[Math.floor(t * 6) % 5], true, 'center', INK);
        else txt(ctx, lab, sx + sw / 2, fl + 36, Math.min(12, (sw * 1.3) / Math.max(3, lab.length)), '#f4ecff', true, 'center', INK);
        if (jp) glow(ctx, sx + sw / 2, fl - 40, 40, ARC_RAINBOW[Math.floor(t * 6) % 5], 0.35 + 0.15 * Math.sin(t * 8));
      }
      for (let k = 1; k < n; k++) { const ex = ed(k); limb(ctx, ex, st.divTop, ex, fl, 3, '#8e98a8'); }
      limb(ctx, x0 - 2, fl + 2, x1 + 2, fl + 2, 3, '#5a6373');
      // pegs: lit ones glow and swell
      const lit = st.lit || NOEST;
      for (let i = 0; i < (st.pegs || []).length; i++) {
        const p = st.pegs[i], L = lit[i] || 0;
        if (L > 0) glow(ctx, p.x, p.y, 18, PAL.cyan, L);
        ctx.beginPath(); circ(ctx, p.x, p.y, pr + L * 2); F(ctx, L > 0 ? '#ffffff' : '#8fb2cc'); ctx.fill(); S(ctx, INK, 1.5); ctx.stroke();
      }
      if (st.aim >= 0) {
        const ax = st.aim, ay = st.top - 6 + Math.sin(t * 5) * 3;
        ctx.setLineDash([4, 6]); ctx.lineDashOffset = -t * 30;
        ctx.beginPath(); ctx.moveTo(ax, ay + R + 4); ctx.lineTo(ax, (st.pegs && st.pegs[0] ? st.pegs[0].y : ay + 80) - 14); S(ctx, rgba(PAL.gold, 0.6), 2); ctx.stroke();
        ctx.setLineDash([]);
        txt(ctx, '◀', ax - R - 12, ay, 12, rgba(PAL.gold, 0.7), true);
        txt(ctx, '▶', ax + R + 12, ay, 12, rgba(PAL.gold, 0.7), true);
        arcToken(ctx, ax, ay, R, t);
      }
      if (st.ball) arcToken(ctx, st.ball.x, st.ball.y, R, t);
    } catch (e) { /* never throws */ }
    ctx.restore();
  }
  /* The PRIZE WHEEL. st: {t, cx, cy, r, rot, flap, wedges: [{k, label, col}],
     win: wedge | -1, mult, spinning, party}. Wedge i spans the pointer
     (the top) when rot puts it there: clockwise from up, i..i+1 wedges. */
  function arcWheel(ctx, st) {
    ctx.save();
    try {
      const t = st.t || 0, cx = st.cx, cy = st.cy, r = st.r, Wg = st.wedges || [], n = Math.max(1, Wg.length), wd = TAU / n, party = st.party || 0;
      tone(ctx, c => poly(c, [cx - 34, cy, cx + 34, cy, cx + 96, cy + r + 84, cx - 96, cy + r + 84]), '#3a2a5a', cx, cy + r * 0.6, 80, { dark: -0.35, spec: false });
      tone(ctx, c => rrect(c, cx - 140, cy + r + 76, 280, 26, 8), '#4a3570', cx, cy + r + 88, 140, { dark: -0.3, spec: false });
      glow(ctx, cx, cy, r * 1.45, st.spinning ? PAL.gold : '#9b7bff', 0.22 + Math.min(0.5, party * 0.2));
      tone(ctx, c => circ(c, cx, cy, r + 20), '#5a3414', cx, cy, r + 20, { dark: -0.35 });
      ctx.beginPath(); circ(ctx, cx, cy, r + 20); S(ctx, PAL.gold, 4); ctx.stroke();
      for (let i = 0; i < 24; i++) {
        const a = i / 24 * TAU, bx = cx + Math.cos(a) * (r + 10), by = cy + Math.sin(a) * (r + 10);
        const on = party > 0 ? (i + Math.floor(accStrobe(t) * 16)) % 2 === 0 : st.spinning ? (i + Math.floor(accStrobe(t) * 12)) % 3 === 0 : (i + Math.floor(t * 4)) % 6 === 0;
        const bc = party > 0 ? ARC_RAINBOW[(i + Math.floor(accStrobe(t) * 10)) % 5] : PAL.gold;
        ctx.beginPath(); circ(ctx, bx, by, 3.6); F(ctx, on ? '#fff6c0' : rgba(bc, 0.35)); ctx.fill();
        if (on) glow(ctx, bx, by, 11, bc, 0.6);
      }
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(st.rot || 0);
      for (let i = 0; i < n; i++) {
        const w = Wg[i], a0 = -Math.PI / 2 + i * wd, jp = w.k === 'jackpot';
        if (jp) {
          for (let j = 0; j < 5; j++) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r, a0 + j * wd / 5, a0 + (j + 1) * wd / 5 + 0.01); ctx.closePath(); F(ctx, ARC_RAINBOW[(j + Math.floor(t * 6)) % 5]); ctx.fill(); }
        } else { ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r, a0, a0 + wd); ctx.closePath(); F(ctx, w.col || PAL.gold); ctx.fill(); }
        // a darker inner band for depth
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r * 0.34, a0, a0 + wd); ctx.closePath(); F(ctx, rgba(INK, 0.25)); ctx.fill();
        if (st.win === i) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, r, a0, a0 + wd); ctx.closePath(); F(ctx, rgba('#ffffff', 0.25 + 0.25 * Math.sin(t * 18))); ctx.fill(); }
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a0) * r, Math.sin(a0) * r); S(ctx, INK, 2.5); ctx.stroke();
        const mid = a0 + wd / 2;
        // labels (and icons) on the left half turn over so they never read upside down
        const flip = Math.cos(mid + (st.rot || 0)) < 0;
        ctx.save(); ctx.rotate(mid); ctx.translate(r * 0.84, 0); if (flip) ctx.rotate(Math.PI);
        arcPrizeIcon(ctx, w.k, 0, 0, 11, t, w.tier);
        ctx.restore();
        ctx.save(); ctx.rotate(mid); ctx.translate(r * 0.56, 0); if (flip) ctx.rotate(Math.PI);
        txt(ctx, String(w.label || ''), 0, 0, w.label && w.label.length > 5 ? 13 : 17, w.k === 'curse' ? '#e8dcff' : '#ffffff', true, 'center', INK);
        ctx.restore();
        const pa = a0;
        ctx.beginPath(); circ(ctx, Math.cos(pa) * (r - 5), Math.sin(pa) * (r - 5), 4.5); F(ctx, CHROME); ctx.fill(); S(ctx, INK, 1.5); ctx.stroke();
      }
      ctx.beginPath(); circ(ctx, 0, 0, r); S(ctx, INK, 4); ctx.stroke();
      ctx.restore();
      tone(ctx, c => circ(c, cx, cy, r * 0.17), PAL.gold, cx, cy, r * 0.17, { ol: 2.5 });
      if ((st.mult || 1) > 1) txt(ctx, 'x' + st.mult, cx, cy + 1, 22, PAL.blood, true, 'center', '#ffffff');
      else { ctx.beginPath(); star(ctx, cx, cy, r * 0.1, 5, 0.45); F(ctx, '#fff6c0'); ctx.fill(); }
      // the flapper, hinged above the rim, flicked by each peg
      ctx.save(); ctx.translate(cx, cy - r - 28); ctx.rotate((st.flap || 0) * 0.55);
      glow(ctx, 0, 20, 30, PAL.blood, 0.35);
      tone(ctx, c => poly(c, [-15, 0, 15, 0, 0, 46]), PAL.blood, 0, 16, 15, { ol: 2.5, dark: -0.3 });
      ctx.restore();
      tone(ctx, c => circ(c, cx, cy - r - 28, 8), CHROME, cx, cy - r - 28, 8, { ol: 2 });
    } catch (e) { /* never throws */ }
    ctx.restore();
  }
  // One slot symbol centred at (x, y), about s px: cherries, a bell, a bulb, a lucky 7, or an item.
  function arcSym(ctx, sym, x, y, s, items, t) {
    ctx.save();
    try {
      ctx.translate(x, y);
      switch (sym) {
        case 'cherry':
          ctx.beginPath(); ctx.moveTo(-s * 0.2, s * 0.05); ctx.quadraticCurveTo(-s * 0.05, -s * 0.35, s * 0.12, -s * 0.4); ctx.moveTo(s * 0.22, s * 0.12); ctx.quadraticCurveTo(s * 0.2, -s * 0.2, s * 0.12, -s * 0.4);
          S(ctx, '#3a8a2a', 3); ctx.stroke();
          tone(ctx, c => ell(c, s * 0.2, -s * 0.42, s * 0.16, s * 0.07, -0.5), PAL.lime, s * 0.2, -s * 0.42, s * 0.1, { ol: 1.2, spec: false });
          tone(ctx, c => circ(c, -s * 0.2, s * 0.18, s * 0.2), '#e0203a', -s * 0.2, s * 0.18, s * 0.2, { ol: 2 });
          tone(ctx, c => circ(c, s * 0.22, s * 0.24, s * 0.2), '#ff3a4a', s * 0.22, s * 0.24, s * 0.2, { ol: 2 });
          break;
        case 'bell':
          tone(ctx, c => { c.moveTo(-s * 0.36, s * 0.26); c.quadraticCurveTo(-s * 0.3, -s * 0.38, 0, -s * 0.4); c.quadraticCurveTo(s * 0.3, -s * 0.38, s * 0.36, s * 0.26); c.closePath(); }, PAL.gold, 0, 0, s * 0.4, { ol: 2 });
          tone(ctx, c => circ(c, 0, s * 0.32, s * 0.09), '#c98a1a', 0, s * 0.32, s * 0.09, { ol: 1.5 });
          tone(ctx, c => circ(c, 0, -s * 0.44, s * 0.06), '#c98a1a', 0, -s * 0.44, s * 0.06, { ol: 1.2 });
          break;
        case 'bulb': bulb(ctx, 0, 0, s * 0.36, t || 0, true); break;
        case 'seven': chrome(ctx, '7', 0, s * 0.04, s * 0.95, PAL.blood, PAL.gold); break;
        default: {
          const id = items && items['ABC'.indexOf(sym)];
          const def = id && typeof DATA !== 'undefined' && DATA && DATA.ITEMS ? DATA.ITEMS[id] : null;
          if (def) { const d = shapeDims(def.shape), k = Math.min(1.4, s * 0.92 / Math.max(8, d.w, d.h)); item(ctx, def, 0, 0, d.w > d.h * 1.6 ? -0.6 : 0, k, NOEST); }
          else { ctx.beginPath(); star(ctx, 0, 0, s * 0.35, 5, 0.45); F(ctx, PAL.cyan); ctx.fill(); }
        }
      }
    } catch (e) { /* never throws */ }
    ctx.restore();
  }
  const SLOTG = { x: 70, y: 318, w: 356, h: 250, cell: 78, lx: 470, ly: 560 };
  /* LUCKY SLOTS. st: {t, reels: [{pos, flash, blur}], strips: [[sym]],
     items: [ids], lever 0..1, tease, winTier, near, party, cost, free, tix}.
     A reel's pos is in symbols: symbol i sits on the payline at pos === i
     and the strip rolls down as pos grows. */
  function arcSlots(ctx, st) {
    ctx.save();
    try {
      const t = st.t || 0, G = SLOTG, party = st.party || 0, L = st.strips && st.strips[0] ? st.strips[0].length : 12;
      const payY = G.y + G.h / 2, rw = (G.w - 16) / 3;
      tone(ctx, c => rrect(c, G.x - 26, G.y - 90, G.w + 52, G.h + 250, 22), '#5a1a3e', G.x + G.w / 2, G.y + G.h / 2, G.w / 2, FLATO);
      ctx.beginPath(); rrect(ctx, G.x - 18, G.y - 82, 14, G.h + 234, 7); F(ctx, rgba('#ffffff', 0.08)); ctx.fill();
      // the lamp row and the 777 sign
      ctx.beginPath(); rrect(ctx, G.x + 40, G.y - 74, G.w - 80, 46, 12); F(ctx, '#1a0d2e'); ctx.fill(); S(ctx, PAL.gold, 3); ctx.stroke();
      for (let i = 0; i < 3; i++) chrome(ctx, '7', G.x + G.w / 2 + (i - 1) * 46, G.y - 50, 34, PAL.blood, party > 0 ? ARC_RAINBOW[(i + Math.floor(t * 10)) % 5] : PAL.gold);
      for (let i = 0; i < 14; i++) {
        const side = i < 7 ? 0 : 1, j = i % 7, bx = side ? G.x + G.w + 12 : G.x - 12, by = G.y + 10 + j * (G.h - 20) / 6;
        const on = party > 0 || st.tease ? (i + Math.floor(accStrobe(t) * 14)) % 2 === 0 : (j + Math.floor(t * 5)) % 3 === 0;
        const bc = party > 0 ? ARC_RAINBOW[(i + Math.floor(accStrobe(t) * 10)) % 5] : st.tease ? PAL.pink : PAL.gold;
        ctx.beginPath(); circ(ctx, bx, by, 4.5); F(ctx, on ? bc : rgba(bc, 0.25)); ctx.fill();
        if (on) glow(ctx, bx, by, 12, bc, 0.6);
      }
      // the window and the reels
      ctx.beginPath(); rrect(ctx, G.x - 6, G.y - 6, G.w + 12, G.h + 12, 12); F(ctx, INK); ctx.fill();
      for (let k = 0; k < 3; k++) {
        const rx = G.x + 4 + k * (rw + 4), R = st.reels && st.reels[k] ? st.reels[k] : NOEST, strip = st.strips ? st.strips[k] : null;
        ctx.save();
        ctx.beginPath(); ctx.rect(rx, G.y, rw, G.h); ctx.clip();
        F(ctx, '#f7efdd'); ctx.fillRect(rx, G.y, rw, G.h);
        const pos = R.pos || 0, base = Math.floor(pos), fr = pos - base, blur = R.blur || 0;
        if (strip) {
          for (let j = -2; j <= 2; j++) {
            const idx = (((base + j) % L) + L) % L, sy = payY + (fr - j) * G.cell;
            if (sy < G.y - G.cell || sy > G.y + G.h + G.cell) continue;
            if (blur > 0.2) { ctx.save(); ctx.globalAlpha = 0.55; ctx.translate(rx + rw / 2, sy); ctx.scale(1, 1 + blur * 0.8); arcSym(ctx, strip[idx], 0, 0, 58, st.items, t); ctx.restore(); }
            else arcSym(ctx, strip[idx], rx + rw / 2, sy, 58, st.items, t);
          }
        }
        if (blur > 0.2) { for (let i = 0; i < 5; i++) { const ly = G.y + ((i * 53 + t * 900) % G.h); F(ctx, rgba('#ffffff', 0.35)); ctx.fillRect(rx + 8, ly, rw - 16, 3); } }
        // curved glass shading top and bottom
        F(ctx, rgba(INK, 0.28)); ctx.fillRect(rx, G.y, rw, 30); ctx.fillRect(rx, G.y + G.h - 30, rw, 30);
        if (R.flash > 0) { F(ctx, rgba('#ffffff', R.flash * 0.6)); ctx.fillRect(rx, G.y, rw, G.h); }
        if (k === 2 && st.tease) { ctx.beginPath(); ctx.rect(rx + 2, G.y + 2, rw - 4, G.h - 4); S(ctx, (Math.floor(t * 12) % 2) ? PAL.gold : PAL.pink, 5); ctx.stroke(); }
        ctx.restore();
      }
      // the payline
      const win = (st.winTier || 0) > 0;
      if (win) glow(ctx, G.x + G.w / 2, payY, G.w * 0.6, PAL.gold, 0.5 + 0.3 * Math.sin(t * 16));
      ctx.beginPath(); ctx.moveTo(G.x - 10, payY); ctx.lineTo(G.x + G.w + 10, payY);
      S(ctx, win ? (Math.floor(t * 10) % 2 ? PAL.gold : '#ffffff') : rgba(PAL.blood, 0.75), win ? 5 : 3); ctx.stroke();
      tone(ctx, c => poly(c, [G.x - 16, payY - 9, G.x - 4, payY, G.x - 16, payY + 9]), PAL.blood, G.x - 10, payY, 8, { ol: 1.5, spec: false });
      tone(ctx, c => poly(c, [G.x + G.w + 16, payY - 9, G.x + G.w + 4, payY, G.x + G.w + 16, payY + 9]), PAL.blood, G.x + G.w + 10, payY, 8, { ol: 1.5, spec: false });
      // the price panel and the tray
      ctx.beginPath(); rrect(ctx, G.x + 30, G.y + G.h + 18, G.w - 60, 34, 8); F(ctx, '#12091f'); ctx.fill(); S(ctx, rgba(PAL.gold, 0.7), 2); ctx.stroke();
      txt(ctx, st.free > 0 ? `FREE PULL x${st.free}` : `${st.cost || 3} TICKETS A PULL`, G.x + G.w / 2, G.y + G.h + 35, 16, (Math.floor(t * 3) % 2 || st.free > 0) ? PAL.gold : '#ff9ec7', true);
      tone(ctx, c => rrect(c, G.x + 10, G.y + G.h + 66, G.w - 20, 60, 14), '#2a0d20', G.x + G.w / 2, G.y + G.h + 96, G.w / 2, { dark: -0.3, spec: false });
      ctx.beginPath(); rrect(ctx, G.x + 26, G.y + G.h + 78, G.w - 52, 30, 10); F(ctx, '#0a0410'); ctx.fill();
      for (let i = 0; i < 7; i++) { const cxx = G.x + 60 + i * 42 + ((i * 17) % 11), cyy = G.y + G.h + 98 - (i % 3) * 3; tone(ctx, c => ell(c, cxx, cyy, 10, 5, 0), PAL.gold, cxx, cyy, 8, { ol: 1.2, spec: false }); }
      // the paytable under the machine
      const PT = [[['seven', 'seven', 'seven'], 'JACKPOT'], [['A', 'A', 'A'], 'UPGRADE'], [['cherry', 'cherry', 'cherry'], '25 GOLD'], [['bell', 'bell', 'bell'], '10 TIX'], [['bulb', 'bulb', 'bulb'], '3 BULBS'], [['cherry', 'cherry'], '8 GOLD']];
      const py0 = G.y + G.h + 172;
      ctx.beginPath(); rrect(ctx, G.x - 20, py0 - 16, G.w + 40, 92, 10); F(ctx, rgba(INK, 0.7)); ctx.fill(); S(ctx, rgba(PAL.gold, 0.35), 1.5); ctx.stroke();
      PT.forEach(([syms, pay], i) => {
        const col = i % 2, row = Math.floor(i / 2), px = G.x - 6 + col * (G.w / 2 + 18), py = py0 + row * 28 + 2;
        syms.forEach((s, j) => arcSym(ctx, s, px + 12 + j * 22, py, 20, st.items, t));
        txt(ctx, pay, px + 80 + (i === 0 && party > 0 ? Math.sin(t * 20) * 1.5 : 0), py, 13, i === 0 ? ARC_RAINBOW[Math.floor(t * 5) % 5] : '#f4ecff', true, 'left', INK);
      });
      // the lever: a chrome arm on a hub at the side, the red knob comes down with st.lever
      const lv = U.clamp(st.lever || 0, -0.2, 1), a = -Math.PI / 2 - 0.12 + lv * 2.1, len = 150;
      const kx = G.lx + Math.cos(a) * len * 0.3, ky = G.ly + Math.sin(a) * len;
      tone(ctx, c => rrect(c, G.lx - 16, G.ly - 30, 32, 60, 8), '#3a2a5a', G.lx, G.ly, 16, { dark: -0.3, spec: false });
      limb(ctx, G.lx, G.ly, kx, ky, 7, CHROME);
      glow(ctx, kx, ky, 34, PAL.blood, 0.35 + (lv > 0.5 ? 0.3 : 0));
      tone(ctx, c => circ(c, kx, ky, 17), PAL.blood, kx, ky, 17, { ol: 2.5 });
      if (lv < 0.05 && (st.free > 0 || (st.tix || 0) >= (st.cost || 3))) txt(ctx, 'PULL', kx, ky - 30 + Math.sin(t * 6) * 3, 13, PAL.gold, true, 'center', INK);
    } catch (e) { /* never throws */ }
    ctx.restore();
  }
  /* A roaming monster on the map. st: {def, awake, t, arrow: {x, y, a} |
     null, hop 0..1, seed, woke 0..1.4}. Asleep: zZ and a slow breath.
     Awake: a pulsing red rim on its hex and a chevron toward its next hex. */
  function arcRoamer(ctx, x, y, size, st) {
    ctx.save();
    try {
      st = st || NOEST;
      const t = st.t || 0, awake = !!st.awake, def = st.def || {}, ph = (st.seed || 0) * 0.37, hop = st.hop || 0;
      if (awake) {
        const p = 0.5 + 0.5 * Math.sin(t * 5 + ph);
        glow(ctx, x, y, size * 1.1, PAL.blood, 0.16 + p * 0.14);
        ctx.beginPath(); hexPath(ctx, x, y, size * 0.84, true); S(ctx, rgba(PAL.blood, 0.45 + p * 0.45), 3); ctx.stroke();
        if (st.arrow) {
          // the hex it steps to next: a dashed red rim, a dotted trail, a chevron on the way
          const ar = st.arrow, a = ar.a, d = size * 0.98 + Math.sin(t * 6) * 4;
          ctx.save();
          ctx.setLineDash([6, 5]); ctx.lineDashOffset = -t * 24;
          ctx.beginPath(); hexPath(ctx, ar.x, ar.y, size * 0.8, true); S(ctx, rgba(PAL.blood, 0.55 + 0.3 * p), 2.5); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * size * 0.45, y + Math.sin(a) * size * 0.45); ctx.lineTo(ar.x, ar.y); S(ctx, rgba(PAL.blood, 0.5), 3); ctx.stroke();
          ctx.setLineDash([]);
          F(ctx, rgba(PAL.blood, 0.12 + 0.08 * p)); ctx.beginPath(); hexPath(ctx, ar.x, ar.y, size * 0.8, true); ctx.fill();
          ctx.restore();
          ctx.save(); ctx.translate(x + Math.cos(a) * d, y + Math.sin(a) * d); ctx.rotate(a);
          const k = size * 0.4;
          ctx.beginPath(); ctx.moveTo(k, 0); ctx.lineTo(-k * 0.6, -k * 0.75); ctx.lineTo(-k * 0.25, 0); ctx.lineTo(-k * 0.6, k * 0.75); ctx.closePath();
          F(ctx, PAL.blood); ctx.fill(); S(ctx, INK, 2); ctx.lineJoin = 'round'; ctx.stroke();
          ctx.restore();
        }
      }
      ctx.beginPath(); ell(ctx, x, y + size * 0.42, size * 0.42 * (1 - hop * 0.3), size * 0.13, 0); F(ctx, rgba(INK, 0.42)); ctx.fill();
      const b = enemyBox(def, 1), k = (size * 1.08) / Math.max(8, b.h, b.w * 0.85);
      const breathe = awake ? 0 : Math.sin(t * 2 + ph) * 0.03;
      if (!awake) ctx.globalAlpha = 0.88;
      enemy(ctx, def, x, y + size * 0.42 - hop * size * 0.5, k * (1 + breathe), t + ph, NOEST);
      ctx.globalAlpha = 1;
      if (!awake) {
        for (let i = 0; i < 3; i++) {
          const u = (t * 0.55 + i / 3 + ph) % 1;
          ctx.globalAlpha = 1 - u;
          txt(ctx, i % 2 ? 'z' : 'Z', x + size * 0.3 + u * size * 0.35, y - size * 0.55 - u * size * 0.6, size * (0.24 + i * 0.05), '#dfe9ff', true, 'center', INK);
        }
        ctx.globalAlpha = 1;
      }
      if ((st.woke || 0) > 0) {
        const u = clamp01((1.4 - st.woke) / 0.25), sc = 0.3 + 0.7 * U.ease.outBack(u);
        ctx.save(); ctx.translate(x, y - size * 1.05); ctx.scale(sc, sc);
        tone(ctx, c => circ(c, 0, 0, size * 0.34), '#ffffff', 0, 0, size * 0.34, { ol: 2.5, spec: false });
        txt(ctx, '!', 0, 1, size * 0.52, PAL.blood, true);
        ctx.restore();
      }
    } catch (e) { /* never throws */ }
    ctx.restore();
  }
  // A die: a rounded white cube face with pips (face 1..6), turned rot.
  const PIPS = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] };
  function arcDice(ctx, x, y, s, rot, face) {
    ctx.save();
    try {
      ctx.translate(x, y); ctx.rotate(rot || 0);
      tone(ctx, c => rrect(c, -s / 2, -s / 2, s, s, s * 0.2), '#f4f8ff', 0, 0, s / 2, { ol: 2.5 });
      F(ctx, face === 6 || face === 1 ? PAL.pink : INK);
      ctx.beginPath();
      for (const [px, py] of PIPS[face] || PIPS[1]) circ(ctx, px * s * 0.26, py * s * 0.26, s * (face === 1 ? 0.13 : 0.09));
      ctx.fill();
    } catch (e) { /* never throws */ }
    ctx.restore();
  }
  // Event vignettes: a backroom per act, a prop per event, the subject in a spotlight.
  const SCENE_PAL = { 1: ['#1c1233', '#2b1d45', '#6fd35a'], 2: ['#2a1410', '#3b1f15', '#ff8a2b'], 3: ['#0f1a2e', '#1b2b45', '#8dfff5'] };
  const EV_PROPS = { out_of_order: 'cab', fortune_crane: 'cab', frozen_crane: 'cabIce', under_the_machine: 'cab', wishing_well: 'fountain', steam_vent: 'steam',
    one_armed_bandit: 'slot', ring_toss: 'bottles', goblin_toll: 'booth', refund_shrine: 'shrine', stuffed_adventurer: 'shelf', ghost_smith: 'forge', map_mole: 'crates',
    ink_squid: 'bowl', goblin_mechanic: 'tools', lonely_anvil: 'forge', suspicious_chest: 'crates', cursed_plushie: 'shelf' };
  const NEON_WORD = { cab: 'PLAY', cabIce: 'COLD', fountain: 'WISH', steam: 'HOT', slot: 'LUCK', bottles: 'WIN!', booth: 'TOLL', shrine: 'HELP', shelf: 'TOYS', forge: 'FORGE', crates: 'SALE', bowl: 'GLOW', tools: 'FIX' };
  function sceneProp(ctx, kind, x, y, t) {
    switch (kind) {
      case 'cab': case 'cabIce': {
        tone(ctx, c => rrect(c, x - 36, y - 118, 72, 118, 8), '#3a1f5e', x, y - 60, 36, { dark: -0.35, spec: false });
        ctx.beginPath(); rrect(ctx, x - 28, y - 104, 56, 58, 4); F(ctx, rgba(PAL.cyan, 0.2 + Math.sin(t * 4) * 0.08)); ctx.fill(); S(ctx, INK, 2); ctx.stroke();
        limb(ctx, x, y - 104, x, y - 84, 2, CHROME);
        ctx.beginPath(); ctx.moveTo(x - 8, y - 76); ctx.lineTo(x, y - 84); ctx.lineTo(x + 8, y - 76); S(ctx, CHROME, 2.5); ctx.stroke();
        ctx.beginPath(); circ(ctx, x - 10, y - 54, 6); circ(ctx, x + 8, y - 52, 7); F(ctx, PAL.gold); ctx.fill();
        ctx.beginPath(); rrect(ctx, x - 30, y - 130, 60, 14, 4); F(ctx, PAL.pink); ctx.fill(); S(ctx, INK, 2); ctx.stroke();
        if (kind === 'cabIce') {
          ctx.beginPath(); rrect(ctx, x - 42, y - 124, 84, 126, 10); F(ctx, rgba('#bfe8ff', 0.4)); ctx.fill(); S(ctx, rgba('#ffffff', 0.8), 2); ctx.stroke();
          line(ctx, x - 30, y - 110, x - 10, y - 70, rgba('#ffffff', 0.7), 2); line(ctx, x + 18, y - 100, x + 30, y - 80, rgba('#ffffff', 0.6), 2);
        }
        break;
      }
      case 'fountain':
        tone(ctx, c => ell(c, x, y - 10, 60, 18, 0), '#6a6f8a', x, y - 10, 60, { dark: -0.3, spec: false });
        ctx.beginPath(); ell(ctx, x, y - 14, 50, 12, 0); F(ctx, '#2a5f86'); ctx.fill();
        for (let i = 0; i < 5; i++) { const u = (t * 0.8 + i / 5) % 1; ctx.beginPath(); ell(ctx, x - 30 + i * 15, y - 14, 4 + u * 10, 2 + u * 3, 0); S(ctx, rgba('#bfe8ff', 1 - u), 1.5); ctx.stroke(); }
        for (let i = 0; i < 4; i++) { ctx.beginPath(); circ(ctx, x - 24 + i * 16, y - 12 + (i % 2) * 3, 3); F(ctx, PAL.gold); ctx.fill(); }
        limb(ctx, x, y - 14, x, y - 56, 6, '#8e98a8');
        for (let i = 0; i < 6; i++) { const u = (t * 1.3 + i / 6) % 1, dir = i % 2 ? 1 : -1; ctx.beginPath(); circ(ctx, x + dir * u * 26, y - 58 + u * u * 44 - u * 14, 2.5); F(ctx, rgba('#bfe8ff', 1 - u * 0.6)); ctx.fill(); }
        break;
      case 'steam':
        tone(ctx, c => rrect(c, x - 40, y - 12, 80, 14, 3), '#5a6373', x, y - 6, 40, { dark: -0.3, spec: false });
        for (let i = 0; i < 5; i++) line(ctx, x - 32 + i * 16, y - 10, x - 32 + i * 16, y, INK, 2);
        for (let i = 0; i < 7; i++) { const u = (t * 0.5 + i / 7) % 1; ctx.beginPath(); circ(ctx, x + Math.sin(u * 6 + i) * 16, y - 16 - u * 110, 10 + u * 22); F(ctx, rgba('#e8e0f4', 0.35 * (1 - u))); ctx.fill(); }
        break;
      case 'slot': ctx.save(); ctx.translate(x, y - 58); arcIcon(ctx, 'slots', 50, t); ctx.restore(); break;
      case 'bottles':
        tone(ctx, c => rrect(c, x - 56, y - 44, 112, 44, 4), '#8a5a2b', x, y - 22, 56, { dark: -0.35, spec: false });
        for (let i = 0; i < 3; i++) { ctx.save(); ctx.translate(x - 30 + i * 30, y - 66); IA.bottle(ctx, 18, 44, ['#2e8f5a', '#3b6fd6', '#ff5a4a'][i], '#f4ecd6'); ctx.restore(); }
        for (let i = 0; i < 2; i++) { const u = (t * 0.7 + i * 0.5) % 1; ctx.beginPath(); ell(ctx, x - 20 + i * 44, y - 90 - Math.sin(u * Math.PI) * 30, 12, 4, 0); S(ctx, PAL.gold, 3); ctx.stroke(); }
        break;
      case 'booth':
        tone(ctx, c => rrect(c, x - 44, y - 96, 88, 96, 4), '#b88a4a', x, y - 48, 44, { dark: -0.3, spec: false });
        ctx.beginPath(); rrect(ctx, x - 30, y - 80, 60, 34, 3); F(ctx, '#1a0d2e'); ctx.fill(); S(ctx, INK, 2); ctx.stroke();
        ctx.beginPath(); rrect(ctx, x - 40, y - 118, 80, 22, 4); F(ctx, PAL.blood); ctx.fill(); S(ctx, INK, 2); ctx.stroke();
        txt(ctx, 'TOLL', x, y - 107, 14, '#fff', true);
        limb(ctx, x + 44, y - 40, x + 110, y - 40 + Math.sin(t * 2) * 4, 4, (Math.floor(t * 2) % 2) ? PAL.blood : '#f4ecd6');
        break;
      case 'shrine':
        tone(ctx, c => rrect(c, x - 34, y - 70, 68, 70, 4), '#7a2a2a', x, y - 35, 34, { dark: -0.35, spec: false });
        tone(ctx, c => poly(c, [x - 52, y - 70, x + 52, y - 70, x + 30, y - 96, x - 30, y - 96]), '#3a1a1a', x, y - 82, 50, { dark: -0.3, spec: false });
        ctx.save(); ctx.translate(x, y - 46 + Math.sin(t * 3) * 1.5); ctx.rotate(Math.sin(t * 2.4) * 0.2);
        tone(ctx, c => { c.moveTo(-12, 8); c.quadraticCurveTo(-10, -12, 0, -13); c.quadraticCurveTo(10, -12, 12, 8); c.closePath(); }, PAL.gold, 0, 0, 12, { ol: 1.5 });
        ctx.restore();
        break;
      case 'shelf':
        tone(ctx, c => rrect(c, x - 60, y - 70, 120, 10, 2), '#8a5a2b', x, y - 65, 60, { dark: -0.3, spec: false });
        tone(ctx, c => rrect(c, x - 60, y - 20, 120, 10, 2), '#8a5a2b', x, y - 15, 60, { dark: -0.3, spec: false });
        for (let i = 0; i < 3; i++) { const px = x - 38 + i * 38, py = y - 84; tone(ctx, c => circ(c, px, py, 12), ['#ff9ec7', '#c3adff', '#a6ff5e'][i], px, py, 12, { ol: 1.5 }); eye(ctx, px - 4, py - 2, 2.5, 0, 0); eye(ctx, px + 4, py - 2, 2.5, 0, 0); }
        for (let i = 0; i < 2; i++) { const px = x - 20 + i * 40, py = y - 34; tone(ctx, c => rrect(c, px - 12, py - 12, 24, 24, 5), ['#ffc94d', '#2ee6d6'][i], px, py, 12, { ol: 1.5 }); }
        break;
      case 'forge':
        glow(ctx, x, y - 30, 70, '#ff8a2b', 0.35 + Math.sin(t * 5) * 0.1);
        ctx.save(); ctx.translate(x, y - 26); IA.anvil(ctx, 90, 56, '#5a6373', '#c9d3e0'); ctx.restore();
        for (let i = 0; i < 5; i++) { const u = (t * 0.9 + i / 5) % 1; ctx.beginPath(); circ(ctx, x - 20 + i * 10 + Math.sin(u * 9) * 6, y - 60 - u * 60, 2.5); F(ctx, rgba('#ffb347', 1 - u)); ctx.fill(); }
        break;
      case 'crates':
        for (const [dx, dy, s] of [[-30, 0, 44], [18, 0, 40], [-8, -40, 36]]) { tone(ctx, c => rrect(c, x + dx - s / 2, y + dy - s, s, s, 3), '#9a6a34', x + dx, y + dy - s / 2, s / 2, { dark: -0.35, spec: false }); line(ctx, x + dx - s / 2 + 4, y + dy - s + 4, x + dx + s / 2 - 4, y + dy - 4, rgba(INK, 0.5), 2); }
        break;
      case 'bowl':
        ctx.beginPath(); circ(ctx, x, y - 44, 38); F(ctx, rgba('#8dfff5', 0.18)); ctx.fill(); S(ctx, rgba('#ffffff', 0.7), 2.5); ctx.stroke();
        for (let i = 0; i < 5; i++) { const u = (t * 0.6 + i / 5) % 1; ctx.beginPath(); circ(ctx, x - 16 + i * 8, y - 20 - u * 50, 3 + i % 2); S(ctx, rgba('#ffffff', 1 - u), 1.5); ctx.stroke(); }
        break;
      case 'tools':
        tone(ctx, c => rrect(c, x - 44, y - 40, 88, 40, 5), PAL.blood, x, y - 20, 44, { dark: -0.35, spec: false });
        limb(ctx, x - 20, y - 40, x - 20, y - 52, 3, '#5a6373'); limb(ctx, x + 20, y - 40, x + 20, y - 52, 3, '#5a6373'); limb(ctx, x - 20, y - 52, x + 20, y - 52, 3, '#5a6373');
        ctx.save(); ctx.translate(x + 50, y - 60); ctx.rotate(-0.6 + Math.sin(t * 2) * 0.1); wrench(ctx, 0, 0, 1.2, 0, true); ctx.restore();
        break;
      default: break;
    }
  }
  /* The event vignette for a w x h scene: the act's backroom (a wall with
     a flickering neon word, a floor), the event's prop on the left, the
     subject (st.enemy or st.item) bobbing in a spotlight, drifting motes,
     and the dice when the choice was random (st.roll 0..1 tumbling, 1
     landed on st.face; -1 none). st: {id, t, act, enemy, item, roll, face}. */
  function arcScene(ctx, w, h, st) {
    ctx.save();
    try {
      st = st || NOEST;
      const t = st.t || 0, pal = SCENE_PAL[st.act] || SCENE_PAL[1], fy = h * 0.74;
      F(ctx, pal[0]); ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 10; i++) { F(ctx, rgba('#ffffff', i % 2 ? 0.02 : 0.045)); ctx.fillRect(i * w / 10, 0, w / 10, fy); }
      const kind = EV_PROPS[st.id] || 'cab';
      const on = Math.sin(t * 23) > -0.8 || Math.sin(t * 3.1) > 0.2;
      const word = NEON_WORD[kind] || 'OPEN';
      if (on) glow(ctx, w * 0.82, h * 0.2, 60, pal[2], 0.35);
      txt(ctx, word, w * 0.82, h * 0.2, 22, on ? pal[2] : rgba(pal[2], 0.25), true, 'center', on ? rgba(pal[2], 0.3) : false);
      F(ctx, pal[1]); ctx.fillRect(0, fy, w, h - fy);
      ctx.beginPath();
      for (let i = -6; i <= 6; i++) { ctx.moveTo(w / 2 + i * 22, fy); ctx.lineTo(w / 2 + i * 90, h); }
      ctx.moveTo(0, fy + 14); ctx.lineTo(w, fy + 14); ctx.moveTo(0, fy + 34); ctx.lineTo(w, fy + 34);
      S(ctx, rgba('#ffffff', 0.05), 1.5); ctx.stroke();
      line(ctx, 0, fy, w, fy, rgba(INK, 0.6), 2);
      const sx = w * 0.56;
      // the spotlight
      ctx.beginPath(); ctx.moveTo(sx - 16, 0); ctx.lineTo(sx + 16, 0); ctx.lineTo(sx + 110, fy + 20); ctx.lineTo(sx - 110, fy + 20); ctx.closePath();
      F(ctx, rgba('#fff3c4', 0.07 + Math.sin(t * 1.7) * 0.015)); ctx.fill();
      ctx.beginPath(); ell(ctx, sx, fy + 8, 96, 16, 0); F(ctx, rgba('#fff3c4', 0.12)); ctx.fill();
      sceneProp(ctx, kind, w * 0.2, fy + 6, t);
      if (st.enemy) {
        const b = enemyBox(st.enemy, 1), k = Math.min(1.9, 118 / Math.max(8, b.h), 170 / Math.max(8, b.w));
        ctx.beginPath(); ell(ctx, sx, fy + 6, 50, 10, 0); F(ctx, rgba(INK, 0.4)); ctx.fill();
        enemy(ctx, st.enemy, sx, fy + 6, k, t, NOEST);
      } else if (st.item) {
        const d = shapeDims(st.item.shape), k = Math.min(1.9, 72 / Math.max(8, d.w, d.h)), iy = fy - 56 + Math.sin(t * 2.2) * 6;
        ctx.beginPath(); ell(ctx, sx, fy + 6, 30 - Math.sin(t * 2.2) * 4, 7, 0); F(ctx, rgba(INK, 0.4)); ctx.fill();
        glow(ctx, sx, iy, 70, PAL.gold, 0.4);
        item(ctx, st.item, sx, iy, Math.sin(t * 1.3) * 0.18, k, NOEST);
        for (let i = 0; i < 3; i++) { const a = t * 2 + i * TAU / 3; ctx.beginPath(); star(ctx, sx + Math.cos(a) * 46, iy + Math.sin(a) * 18, 4, 4, 0.4); F(ctx, rgba('#fff6c0', 0.8)); ctx.fill(); }
      }
      // dust motes in the light
      for (let i = 0; i < 12; i++) {
        const u = (t * 0.05 + i * 0.137) % 1, mx = sx - 80 + ((i * 61) % 160) + Math.sin(t + i) * 6, my = fy - u * fy;
        ctx.beginPath(); circ(ctx, mx, my, 1.2 + (i % 3) * 0.5); F(ctx, rgba('#fff3c4', 0.25 * Math.sin(u * Math.PI))); ctx.fill();
      }
      if (st.roll != null && st.roll >= 0) {
        const u = clamp01(st.roll), landed = u >= 1;
        const dx = landed ? w * 0.82 : w * 0.06 + (w * 0.76) * u;
        const dy = landed ? fy - 14 : fy - 14 - Math.abs(Math.sin(u * Math.PI * 3.2)) * (1 - u) * 90;
        const face = landed ? (st.face || 6) : 1 + (Math.floor(u * 19) % 6);
        if (landed) { glow(ctx, dx, dy, 56, PAL.gold, 0.45 + Math.sin(t * 6) * 0.1); for (let i = 0; i < 8; i++) { const a = i * TAU / 8 + t; line(ctx, dx + Math.cos(a) * 26, dy + Math.sin(a) * 26, dx + Math.cos(a) * 38, dy + Math.sin(a) * 38, rgba(PAL.gold, 0.6), 2); } }
        ctx.beginPath(); ell(ctx, dx, fy + 4, 16, 4, 0); F(ctx, rgba(INK, 0.4)); ctx.fill();
        arcDice(ctx, dx, dy, 30, landed ? 0.12 : u * 16, face);
      }
      // vignette edges
      F(ctx, rgba(INK, 0.35)); ctx.fillRect(0, 0, 10, h); ctx.fillRect(w - 10, 0, 10, h); ctx.fillRect(0, 0, w, 8);
    } catch (e) { /* never throws */ }
    ctx.restore();
  }

  /* ================================================================ FEEL (round 4)
     DESIGN.md "Feel (round 4)": the tip card illustrations, the shopkeeper,
     the rest stop's campfire and the forge's anvil. Pure drawing from the
     state the game hands over (st.t in seconds); every function saves,
     restores and never throws. Deterministic: no random calls, particles are
     placed from t and their index. */
  const FEEL_CHAR = { knight: '#3b6fd6', alchemist: '#5ab82e', rogue: '#7a3b9c', gambler: '#1f8a4c' };
  const FEEL_TIERS = ['c', 'u', 'r', 'l'];
  const FEEL_BADGES = ['armored', 'hasty', 'vampiric'];
  const FEEL_TOWER = { type: 'tower', revealed: true, terrain: 'land', ground: 'hill', biome: 'cellar', elev: 0.7 };
  const FEEL_TOOL = { type: 'brush', revealed: true, terrain: 'land', ground: 'grass', biome: 'cellar', elev: 0.3 };
  const FEEL_HEX = { type: 'empty', revealed: true, terrain: 'land', ground: 'grass', biome: 'cellar', elev: 0.2 };
  const FEEL_DARK = { type: 'empty', revealed: false, terrain: 'land', ground: 'grass', biome: 'cellar', elev: 0.2 };
  const FEEL_V = { t: 0, orient: 'v' };
  // Fit an item def inside a box of side s (the art is drawn at its real size).
  function feelItemK(def, s) { const d = shapeDims(def && def.shape); return s / Math.max(8, d.w, d.h); }
  // A crooked white crack across an item (the cracked glass tip).
  function feelCrack(ctx, r, t) {
    const a = 0.6 + Math.sin(t * 5) * 0.25;
    ctx.beginPath();
    ctx.moveTo(-r * 0.7, -r * 0.5); ctx.lineTo(-r * 0.2, -r * 0.1); ctx.lineTo(-r * 0.35, r * 0.25); ctx.lineTo(r * 0.15, r * 0.1); ctx.lineTo(r * 0.55, r * 0.6);
    ctx.moveTo(-r * 0.2, -r * 0.1); ctx.lineTo(r * 0.3, -r * 0.55);
    S(ctx, rgba('#ffffff', a), 2.2); ctx.lineJoin = 'round'; ctx.stroke();
  }
  /* RENDER.feelTipArt(ctx, id, s, t, o): the little picture on a tip card,
     centred on (0, 0) inside an s x s box. o carries the defs the game looks
     up: {enemy, item, items: [def, def], clover}. Unknown ids get a "?". */
  function feelTipArt(ctx, id, s, t, o) {
    ctx.save();
    try {
      o = o || NOEST; t = t || 0; s = s || 56;
      const r = s / 2;
      glow(ctx, 0, 0, r * 1.2, PAL.cyan, 0.12);
      if (id === 'hungry' && o.enemy) {
        const b = enemyBox(o.enemy, 1), k = (s * 0.86) / Math.max(8, b.h, b.w);
        enemy(ctx, o.enemy, -r * 0.08, r * 0.46, k, t, NOEST);
        if (o.item) { const u = (t * 0.7) % 1; item(ctx, o.item, r * 0.62 - u * r * 0.5, -r * 0.55 + Math.sin(u * Math.PI) * -r * 0.3, u * 4, feelItemK(o.item, s * 0.3) * (1 - u * 0.5), NOEST); }
      } else if ((id === 'bomb' || id === 'fuse') && o.item) {
        const k = feelItemK(o.item, s * 0.72), p = 0.5 + 0.5 * Math.sin(t * (id === 'bomb' ? 12 : 7));
        glow(ctx, 0, 0, r * 1.1, PAL.blood, 0.25 + p * 0.3);
        item(ctx, o.item, 0, r * 0.08, Math.sin(t * 3) * 0.12, k, NOEST);
        ctx.beginPath(); star(ctx, r * 0.36, -r * 0.62, 5 + p * 4, 6, 0.45); F(ctx, '#fff6c0'); ctx.fill();
        ctx.beginPath(); circ(ctx, r * 0.62, r * 0.52, r * 0.3); F(ctx, PAL.blood); ctx.fill(); S(ctx, INK, 2); ctx.stroke();
        txt(ctx, id === 'bomb' ? '1' : '2', r * 0.62, r * 0.54, r * 0.4, '#ffffff', true, 'center');
      } else if (id === 'crack' && o.item) {
        const k = feelItemK(o.item, s * 0.8);
        glow(ctx, 0, 0, r, '#8dfff5', 0.3);
        ctx.save(); ctx.rotate(Math.sin(t * 2) * 0.1); item(ctx, o.item, 0, 0, 0, k, NOEST); feelCrack(ctx, r * 0.62, t); ctx.restore();
        for (let i = 0; i < 4; i++) { const u = (t * 0.8 + i * 0.25) % 1, a = i * 1.7 + 0.4; ctx.save(); ctx.translate(Math.cos(a) * r * (0.4 + u * 0.6), Math.sin(a) * r * (0.4 + u * 0.6)); ctx.globalAlpha = 1 - u; ctx.beginPath(); poly(ctx, [0, -3, 3, 0, 0, 3, -2, 0]); F(ctx, '#dffcff'); ctx.fill(); ctx.restore(); }
      } else if (id === 'capsule') {
        const tier = FEEL_TIERS[Math.floor(t * 0.8) % 4];
        capsule(ctx, 0, r * 0.05, r * 0.72, { tier, t, rot: Math.sin(t * 5) * 0.12, crack: 0.25 + 0.2 * Math.sin(t * 2), glow: 0.7, seed: 3 });
      } else if (id === 'tickets') {
        for (let i = 0; i < 3; i++) ticket(ctx, (i - 1) * r * 0.3, (i - 1) * r * 0.22 + Math.sin(t * 3 + i) * 2, s * 0.64, s * 0.3, -0.35 + i * 0.28, i === 1 ? '#ffc94d' : '#ff9ec7');
      } else if (id === 'combo' && o.items && o.items.length > 1) {
        const bump = 1 + Math.max(0, Math.sin(t * 4)) * 0.08;
        item(ctx, o.items[0], -r * 0.38, 0, -0.5, feelItemK(o.items[0], s * 0.55) * bump, NOEST);
        item(ctx, o.items[1], r * 0.38, 0, 0.5, feelItemK(o.items[1], s * 0.55) * bump, NOEST);
        ctx.beginPath(); star(ctx, 0, -r * 0.1, r * 0.38, 8, 0.5); F(ctx, PAL.gold); ctx.fill(); S(ctx, INK, 2); ctx.stroke();
        txt(ctx, '+', 0, -r * 0.08, r * 0.5, INK, true, 'center');
      } else if (PET_TIPS[id]) {
        petTipArt(ctx, id, r, t);   // PETS (round 5): pets, the pet shop, whack-a-mole, skee-ball
      } else if (id === 'arcade') {
        ctx.save(); ctx.translate(0, r * 0.1); arcIcon(ctx, ['slots', 'plinko', 'wheel'][Math.floor(t * 0.5) % 3], r * 0.62, t); ctx.restore();
      } else if (id === 'roam' && o.enemy) {
        arcRoamer(ctx, 0, r * 0.05, r * 0.8, { def: o.enemy, awake: true, t, seed: 1, arrow: null, hop: Math.max(0, Math.sin(t * 5)) * 0.4 });
      } else if (id === 'tower') {
        FEEL_V.t = t; hex(ctx, 0, 0, r * 0.9, FEEL_TOWER, FEEL_V);
      } else if (id === 'tool') {
        FEEL_V.t = t; hex(ctx, 0, 0, r * 0.9, FEEL_TOOL, FEEL_V);
      } else if (id === 'map') {
        FEEL_V.t = t; hex(ctx, -r * 0.36, r * 0.24, r * 0.62, FEEL_HEX, FEEL_V); hex(ctx, r * 0.4, -r * 0.24, r * 0.62, FEEL_DARK, FEEL_V);
        const on = Math.sin(t * 3) > -0.3;
        if (on) glow(ctx, r * 0.4, -r * 0.3, r * 0.7, PAL.gold, 0.45);
        bulb(ctx, r * 0.4, -r * 0.3, r * 0.34, t, on);
      } else if (id === 'luck') {
        const n = 5, lit = Math.floor(t * 2.5) % (n + 2);
        for (let i = 0; i < n; i++) {
          const a = Math.PI + (i / (n - 1)) * Math.PI, x = Math.cos(a) * r * 0.62, y = r * 0.3 + Math.sin(a) * r * 0.62, on = i < lit;
          if (on) glow(ctx, x, y, r * 0.35, '#3ddc84', 0.5);
          ctx.beginPath(); circ(ctx, x, y, r * 0.17); F(ctx, on ? '#3ddc84' : '#1b3a28'); ctx.fill(); S(ctx, INK, 1.5); ctx.stroke();
        }
        if (o.clover) item(ctx, o.clover, 0, r * 0.28, Math.sin(t * 2) * 0.2, feelItemK(o.clover, s * 0.42), NOEST);
        else txt(ctx, '☘', 0, r * 0.3, r * 0.6, '#3ddc84', true, 'center');
      } else if (id === 'sig') {
        ctx.save(); ctx.scale(s / 170, s / 170); bossSign(ctx, 0, 6, 'NEXT TURN', PAL.blood, t, 1); ctx.restore();
        txt(ctx, '!', 0, -r * 0.62, r * 0.5, PAL.blood, true, 'center', INK);
      } else if (id === 'affix') {
        if (o.enemy) { const b = enemyBox(o.enemy, 1), k = (s * 0.8) / Math.max(8, b.h, b.w); enemy(ctx, o.enemy, -r * 0.25, r * 0.46, k, t, NOEST); }
        affixBadges(ctx, r * 0.62, -r * 0.62, FEEL_BADGES, t, r * 0.42);
      } else {
        ctx.beginPath(); circ(ctx, 0, 0, r * 0.62); F(ctx, '#241836'); ctx.fill(); S(ctx, PAL.cyan, 2.5); ctx.stroke();
        txt(ctx, '?', 0, 1, r * 0.8, PAL.cyan, true, 'center');
      }
    } catch (e) { /* never throws */ }
    ctx.restore();
  }

  // A warm backroom wall with a few dead cabinets (the rooms share it).
  function feelRoomBack(ctx, w, h, top, bot, t) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, top); g.addColorStop(1, bot);
    ctx.fillStyle = FLAT || g; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 9; i++) {
      const x = 8 + i * 58, y = 10 + (i % 3) * 5;
      ctx.beginPath(); rrect(ctx, x, y, 44, h, 6); F(ctx, rgba(INK, 0.35)); ctx.fill();
      const on = Math.sin(t * (1.3 + i * 0.37) + i * 2.1) > 0.75;
      ctx.beginPath(); rrect(ctx, x + 7, y + 10, 30, 22, 3); F(ctx, rgba(i % 2 ? PAL.cyan : PAL.pink, on ? 0.16 : 0.06)); ctx.fill();
    }
  }
  /* RENDER.feelKeeper(ctx, w, h, st): the shop. Chester, a prize chest
     mimic in a tiny top hat, sits on the counter under a flickering SHOP
     sign with loot on the shelves behind. st: {t, mood 'idle' | 'happy'
     (a purchase: the lid flies open, the eyes smile, coins glint) | 'broke'
     (you are short: the lid clamps, the brows knit, a head shake) | 'talk',
     moodK 0..1 (how fresh the mood is), talk 0..1 (the lid flaps with the
     speech bubble), blink 0..1, look -1..1}. */
  function feelKeeper(ctx, w, h, st) {
    ctx.save();
    try {
      st = st || NOEST;
      const t = st.t || 0, mood = st.mood || 'idle', mk = clamp01(st.moodK == null ? 1 : st.moodK);
      feelRoomBack(ctx, w, h, '#1d1236', '#2c1846', t);
      // the neon sign
      const fl = Math.sin(t * 13) > 0.93 ? 0.35 : 1;
      glow(ctx, 70, 30, 60, PAL.pink, 0.35 * fl);
      txt(ctx, 'SHOP', 70, 30, 30, rgba('#ffd1e6', fl), true, 'center', PAL.pink);
      // shelves of loot
      for (let row = 0; row < 2; row++) {
        const y = 44 + row * 40;
        ctx.beginPath(); rrect(ctx, 300, y, 196, 7, 2); F(ctx, '#5a3a24'); ctx.fill(); S(ctx, INK, 2); ctx.stroke();
        for (let i = 0; i < 6; i++) {
          const x = 316 + i * 32, c = [PAL.gold, PAL.cyan, PAL.pink, PAL.lime, '#c3adff', PAL.blood][(i + row * 2) % 6];
          ctx.beginPath();
          if ((i + row) % 3 === 0) circ(ctx, x, y - 10, 9); else if ((i + row) % 3 === 1) rrect(ctx, x - 7, y - 22, 14, 22, 4); else poly(ctx, [x, y - 22, x + 9, y - 8, x, y, x - 9, y - 8]);
          F(ctx, c); ctx.fill(); S(ctx, INK, 2); ctx.stroke();
          if (Math.sin(t * 2 + i * 1.7 + row) > 0.96) feelGlint(ctx, x + 2, y - 14, 7);
        }
      }
      // the counter
      const cy = h - 32;
      ctx.beginPath(); ctx.rect(0, cy, w, h - cy); F(ctx, '#6b4326'); ctx.fill();
      ctx.beginPath(); ctx.rect(0, cy, w, 6); F(ctx, PAL.gold); ctx.fill();
      for (let x = 20; x < w; x += 70) { ctx.beginPath(); ctx.rect(x, cy + 12, 40, h - cy - 16); F(ctx, rgba(INK, 0.22)); ctx.fill(); }
      line(ctx, 0, cy, w, cy, INK, 2.5);
      // the cash register
      const rx = 420, happy = mood === 'happy', broke = mood === 'broke';
      tone(ctx, c => rrect(c, rx - 34, cy - 40, 68, 40, 6), '#8e98a8', rx, cy - 20, 34, { dark: -0.35 });
      ctx.beginPath(); rrect(ctx, rx - 22, cy - 34, 44, 16, 3); F(ctx, '#0d1a14'); ctx.fill();
      txt(ctx, happy ? '+$' : broke ? '0' : '$', rx, cy - 26, 12, happy ? PAL.lime : broke ? PAL.blood : PAL.gold, true, 'center');
      if (happy) { ctx.beginPath(); rrect(ctx, rx - 26, cy - 4 + 8 * mk, 52, 8, 2); F(ctx, '#6d7888'); ctx.fill(); S(ctx, INK, 2); ctx.stroke(); }
      // Chester
      const kx = 170, shake = broke ? Math.sin(t * 34) * 3 * mk : 0, hop = happy ? Math.abs(Math.sin(t * 9)) * 7 * mk : Math.sin(t * 1.6) * 1.2;
      let open = 0.24 + Math.sin(t * 1.6) * 0.05;
      if (happy) open = 0.62 + 0.18 * mk + Math.sin(t * 9) * 0.05;
      else if (broke) open = 0.05;
      open += (st.talk || 0) * Math.abs(Math.sin(t * 15)) * 0.28;
      const bw = 108, bh = 44, base = cy - hop, gap = open * 34;
      ctx.save(); ctx.translate(kx + shake, 0);
      ctx.beginPath(); ell(ctx, 0, cy + 2, bw * 0.55, 6, 0); F(ctx, rgba(INK, 0.4)); ctx.fill();
      // stubby arms (behind the chest)
      const wave = mood === 'idle' ? Math.max(0, Math.sin(t * 0.9)) * Math.sin(t * 9) * 0.5 : 0;
      const armUp = happy ? -1 : broke ? 0.2 : 0;
      for (const sd of [-1, 1]) {
        const ax = sd * bw * 0.5, ay = base - bh * 0.55;
        const ang = sd < 0 ? Math.PI * (0.85 + armUp * 0.35) : Math.PI * (0.15 - armUp * 0.35) + wave;
        const hx = ax + Math.cos(ang) * 26, hy = ay - Math.sin(ang) * 26 * (armUp < 0 ? 1 : -0.4);
        limb(ctx, ax, ay, hx, hy, 7, '#7a4a28');
        tone(ctx, c => circ(c, hx, hy, 7), '#fff8ec', hx, hy, 7, { ol: 2, spec: false });
      }
      // the base: wood, gold bands, a lock plate
      tone(ctx, c => rrect(c, -bw / 2, base - bh, bw, bh, 8), '#8a5a30', 0, base - bh / 2, bw / 2, { dark: -0.3 });
      for (const bx of [-bw * 0.3, bw * 0.3]) { ctx.beginPath(); ctx.rect(bx - 5, base - bh, 10, bh); F(ctx, PAL.gold); ctx.fill(); S(ctx, INK, 1.5); ctx.stroke(); }
      tone(ctx, c => rrect(c, -10, base - bh * 0.62, 20, 20, 4), PAL.gold, 0, base - bh * 0.5, 10, { ol: 2 });
      ctx.beginPath(); circ(ctx, 0, base - bh * 0.46, 3); F(ctx, INK); ctx.fill();
      // the mouth: dark red inside, teeth on both rims, a tongue
      const my = base - bh;
      if (gap > 2) {
        ctx.beginPath(); rrect(ctx, -bw / 2 + 5, my - gap, bw - 10, gap + 4, 6); F(ctx, '#3a0a1c'); ctx.fill();
        const tw = (st.talk || 0) > 0 || happy ? 1 : 0;
        F(ctx, '#ff6b9a');
        ctx.beginPath(); ell(ctx, Math.sin(t * 4) * 6 * tw, my - 2, 22, Math.min(9, gap * 0.4 + 2), 0); ctx.fill();
        for (let i = 0; i < 7; i++) {
          const tx0 = -bw / 2 + 12 + i * ((bw - 24) / 6);
          F(ctx, '#fffaf0');
          ctx.beginPath(); poly(ctx, [tx0 - 5, my, tx0 + 5, my, tx0, my - Math.min(9, gap * 0.45)]); ctx.fill(); S(ctx, INK, 1.2); ctx.stroke();
          ctx.beginPath(); poly(ctx, [tx0 - 5, my - gap, tx0 + 5, my - gap, tx0, my - gap + Math.min(9, gap * 0.45)]); ctx.fill(); ctx.stroke();
        }
      }
      // the lid, riding up by the gap, with the eyes and a tiny top hat
      const ly = my - gap, lh = 30;
      ctx.save(); ctx.translate(0, ly); ctx.rotate(broke ? 0 : -open * 0.12);
      tone(ctx, c => { c.moveTo(-bw / 2, 0); c.lineTo(-bw / 2, -lh * 0.45); c.quadraticCurveTo(0, -lh * 1.35, bw / 2, -lh * 0.45); c.lineTo(bw / 2, 0); c.closePath(); }, '#9a6536', 0, -lh * 0.4, bw / 2, { dark: -0.28 });
      ctx.beginPath(); ctx.rect(-bw / 2, -5, bw, 5); F(ctx, PAL.gold); ctx.fill(); S(ctx, INK, 1.5); ctx.stroke();
      const lk = clamp01(st.look || 0) - clamp01(-(st.look || 0)), bl = clamp01(st.blink || 0);
      for (const sd of [-1, 1]) {
        const ex = sd * 20, ey = -lh * 0.52;
        ctx.beginPath(); ell(ctx, ex, ey, 11, 11 * (1 - bl * 0.9), 0); F(ctx, '#ffffff'); ctx.fill(); S(ctx, INK, 2); ctx.stroke();
        if (happy) { ctx.beginPath(); ctx.moveTo(ex - 7, ey + 2); ctx.quadraticCurveTo(ex, ey - 8, ex + 7, ey + 2); S(ctx, INK, 3); ctx.stroke(); }
        else if (bl < 0.6) { ctx.beginPath(); circ(ctx, ex + lk * 4, ey + (broke ? 2 : 1), 4.5); F(ctx, INK); ctx.fill(); ctx.beginPath(); circ(ctx, ex + lk * 4 - 1.5, ey - 0.5, 1.4); F(ctx, '#ffffff'); ctx.fill(); }
        if (broke) { ctx.beginPath(); ctx.moveTo(ex - 11 * sd, ey - 15); ctx.lineTo(ex + 9 * sd, ey - 8); S(ctx, INK, 3.5); ctx.stroke(); ctx.beginPath(); ctx.rect(ex - 11, ey - 12, 22, 7); F(ctx, '#9a6536'); ctx.fill(); }
      }
      ctx.save(); ctx.translate(22, -lh * 0.98); ctx.rotate(0.18 + (happy ? Math.sin(t * 9) * 0.2 * mk : 0));
      tone(ctx, c => rrect(c, -16, -2, 32, 5, 2), '#1b1030', 0, 0, 16, { ol: 2, spec: false });
      tone(ctx, c => rrect(c, -10, -20, 20, 19, 3), '#1b1030', 0, -10, 10, { ol: 2 });
      ctx.beginPath(); ctx.rect(-10, -7, 20, 4); F(ctx, PAL.pink); ctx.fill();
      ctx.restore();
      ctx.restore();
      ctx.restore();
      if (happy) for (let i = 0; i < 6; i++) { const u = (t * 1.2 + i / 6) % 1; ctx.globalAlpha = (1 - u) * mk; feelGlint(ctx, kx - 50 + i * 20, base - 70 - u * 40, 9); }
      ctx.globalAlpha = 1;
    } catch (e) { /* never throws */ }
    ctx.restore();
  }
  // A four-point sparkle.
  function feelGlint(ctx, x, y, r) {
    ctx.beginPath(); star(ctx, x, y, r, 4, 0.28); F(ctx, '#fff6c0'); ctx.fill();
  }
  /* RENDER.feelCampfire(ctx, w, h, st): the rest stop. A fire in a stone
     ring between dead cabinets, sparks and smoke rising, the crawler on a log
     warming their hands and toasting a marshmallow, the Rig on their back.
     st: {t, charId, heal 0..1 (a rest just healed: green glow, hearts rise;
     counts down to 0), sit 0..1}. */
  function feelCampfire(ctx, w, h, st) {
    ctx.save();
    try {
      st = st || NOEST;
      const t = st.t || 0, heal = clamp01(st.heal || 0), col = FEEL_CHAR[st.charId] || '#8e98a8';
      feelRoomBack(ctx, w, h, '#150b24', '#2a1430', t);
      const fx0 = 300, fy = h - 28;
      const flick = 0.8 + 0.2 * Math.sin(t * 11) * Math.sin(t * 7.3);
      glow(ctx, fx0, fy - 30, 170, '#ff8a2b', 0.3 * flick);
      glow(ctx, fx0, fy - 20, 80, '#ffd27a', 0.3 * flick);
      ctx.beginPath(); ctx.rect(0, fy, w, h - fy); F(ctx, '#1a0f14'); ctx.fill();
      ctx.beginPath(); ell(ctx, fx0, fy + 4, 190, 16, 0); F(ctx, rgba('#ff8a2b', 0.12 * flick)); ctx.fill();
      // smoke
      for (let i = 0; i < 5; i++) {
        const u = (t * 0.18 + i / 5) % 1;
        ctx.globalAlpha = 0.18 * Math.sin(u * Math.PI);
        ctx.beginPath(); circ(ctx, fx0 + Math.sin(u * 5 + i) * 18 + u * 30, fy - 60 - u * 90, 10 + u * 22); F(ctx, '#8e7aa8'); ctx.fill();
      }
      ctx.globalAlpha = 1;
      // logs and stones
      limb(ctx, fx0 - 34, fy - 2, fx0 + 30, fy - 12, 9, '#6b4326');
      limb(ctx, fx0 + 34, fy - 2, fx0 - 28, fy - 13, 9, '#7a4a28');
      for (let i = 0; i < 7; i++) { const a = Math.PI * (i / 6); tone(ctx, c => ell(c, fx0 - Math.cos(a) * 44, fy + 2 - Math.sin(a) * 3, 10, 7, 0), '#5a5068', fx0 - Math.cos(a) * 44, fy, 9, { dark: -0.3, ol: 2 }); }
      // the fire
      flames(ctx, fx0, fy - 8, 70, 80 * flick, t, 1);
      flames(ctx, fx0 + 4, fy - 8, 36, 44 * flick, t * 1.3, 4);
      // sparks
      for (let i = 0; i < 16; i++) {
        const u = (t * 0.55 + i * 0.0731 + (i % 3) * 0.21) % 1;
        const x = fx0 + Math.sin(i * 12.9 + t * 2) * 16 * u + ((i % 5) - 2) * 5, y = fy - 30 - u * 115;
        ctx.globalAlpha = 1 - u;
        ctx.beginPath(); circ(ctx, x, y, 1.6 + (i % 3) * 0.6); F(ctx, i % 2 ? '#ffd27a' : '#ff8a2b'); ctx.fill();
      }
      ctx.globalAlpha = 1;
      // the crawler on a log, left of the fire, leaning in
      const cx = 176, sy = fy - 14, breathe = Math.sin(t * 1.8) * 1.2, lean = 0.12 + Math.sin(t * 0.7) * 0.03;
      limb(ctx, cx - 36, fy - 4, cx + 30, fy - 4, 13, '#6b4326');
      if (heal > 0) glow(ctx, cx, sy - 30, 70, PAL.lime, 0.55 * heal);
      ctx.save(); ctx.translate(cx, sy); ctx.rotate(lean);
      // legs toward the fire
      limb(ctx, 4, -2, 30, 2, 7, '#4a3a6a'); limb(ctx, 30, 2, 36, 14, 7, '#4a3a6a');
      limb(ctx, -2, -2, 24, 4, 7, '#3d2f5a'); limb(ctx, 24, 4, 28, 15, 7, '#3d2f5a');
      // the Rig on the back
      tone(ctx, c => rrect(c, -30, -46 + breathe, 20, 30, 4), '#1d1233', -20, -31, 12, { dark: -0.3 });
      ctx.beginPath(); rrect(ctx, -27, -42 + breathe, 14, 14, 2); F(ctx, rgba(PAL.cyan, 0.7)); ctx.fill();
      F(ctx, PAL.pink); ctx.beginPath(); circ(ctx, -20, -21 + breathe, 2); ctx.fill();
      // body
      tone(ctx, c => rrect(c, -14, -40 + breathe, 28, 38, 9), col, 0, -21, 14, { dark: -0.3 });
      // arms out to the fire: the far one warming its hand, the near one on a toasting stick
      const armF = shade(col, -0.32), armN = shade(col, -0.12);
      limb(ctx, 3, -31 + breathe, 17, -19, 6, armF); limb(ctx, 17, -19, 31, -23, 5, armF);
      tone(ctx, c => circ(c, 32, -23, 4.2), '#f1c9a6', 32, -23, 4, { ol: 1.5, spec: false });
      limb(ctx, 8, -30 + breathe, 21, -21, 6, armN); limb(ctx, 21, -21, 36, -31, 5, armN);
      tone(ctx, c => circ(c, 37, -31, 4.4), '#f1c9a6', 37, -31, 4, { ol: 1.5, spec: false });
      ctx.restore();
      const cl = Math.cos(lean), sl = Math.sin(lean);
      const sx0 = cx + 37 * cl + 31 * sl, sy0 = sy + 37 * sl - 31 * cl, sx1 = fx0 - 12, sy1 = fy - 70 + Math.sin(t * 1.2) * 3;
      line(ctx, sx0, sy0, sx1, sy1, '#7a4a28', 2.5);
      const toast = clamp01((t % 14) / 12);
      tone(ctx, c => rrect(c, sx1 - 6, sy1 - 5, 12, 10, 4), toast < 0.5 ? '#fff8ec' : shade('#e0a060', -toast * 0.4), sx1, sy1, 6, { ol: 1.5, spec: false });
      // the head: the crawler's portrait as a bobble head
      portrait(ctx, st.charId, cx - 2 + Math.sin(lean) * 40, sy - 58 + breathe, 34, t);
      // hearts rise while the rest heals
      if (heal > 0) {
        for (let i = 0; i < 5; i++) {
          const u = clamp01((1 - heal) * 1.4 - i * 0.12);
          if (u <= 0 || u >= 1) continue;
          const hx = cx - 20 + i * 12 + Math.sin(u * 6 + i) * 6, hy = sy - 60 - u * 60;
          ctx.globalAlpha = 1 - u;
          ctx.save(); ctx.translate(hx, hy); ctx.scale(0.8 + u * 0.4, 0.8 + u * 0.4);
          ctx.beginPath(); ctx.moveTo(0, 5); ctx.bezierCurveTo(-9, -2, -5, -10, 0, -5); ctx.bezierCurveTo(5, -10, 9, -2, 0, 5); F(ctx, PAL.lime); ctx.fill(); S(ctx, INK, 1.5); ctx.stroke();
          ctx.restore();
        }
        ctx.globalAlpha = 1;
      }
    } catch (e) { /* never throws */ }
    ctx.restore();
  }
  /* RENDER.feelForge(ctx, w, h, st): the forge. A furnace glowing in a
     brick wall, an anvil, and a hammer on a piston arm. st: {t, item (the
     def on the anvil, or null), heat 0..1 (the item glows orange), hit (s
     since the last strike, big when idle), strikes: [s since each strike]
     (sparks fly from each for 0.7 s), done 0..1 (the upgrade sparkle)}. */
  const FORGE_HIT = { x: 250, y: 0 };
  function feelForge(ctx, w, h, st) {
    ctx.save();
    try {
      st = st || NOEST;
      const t = st.t || 0, heat = clamp01(st.heat || 0), done = clamp01(st.done || 0);
      // bricks
      ctx.fillStyle = FLAT || '#2a1420'; ctx.fillRect(0, 0, w, h);
      for (let row = 0; row < 8; row++) for (let i = 0; i < 12; i++) {
        const x = i * 46 - (row % 2) * 23, y = row * 20;
        ctx.beginPath(); rrect(ctx, x + 2, y + 2, 42, 16, 3); F(ctx, (i + row) % 3 ? '#3a1c26' : '#44202c'); ctx.fill();
      }
      // the furnace
      const fx0 = 430, fl = 0.8 + 0.2 * Math.sin(t * 9) * Math.sin(t * 5.3);
      glow(ctx, fx0, h - 50, 150, '#ff6a2b', 0.35 * fl);
      ctx.beginPath(); ctx.moveTo(fx0 - 56, h); ctx.lineTo(fx0 - 56, h - 70); ctx.arc(fx0, h - 70, 56, Math.PI, 0); ctx.lineTo(fx0 + 56, h); ctx.closePath(); F(ctx, '#5a2a2a'); ctx.fill(); S(ctx, INK, 3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(fx0 - 38, h - 18); ctx.lineTo(fx0 - 38, h - 64); ctx.arc(fx0, h - 64, 38, Math.PI, 0); ctx.lineTo(fx0 + 38, h - 18); ctx.closePath(); F(ctx, '#1a0606'); ctx.fill();
      glow(ctx, fx0, h - 40, 50, '#ffb347', 0.6 * fl);
      flames(ctx, fx0, h - 20, 48, 40 * fl, t, 2);
      // floor
      const fy = h - 18;
      ctx.beginPath(); ctx.rect(0, fy, w, 18); F(ctx, '#1a0d12'); ctx.fill();
      // the anvil
      const ax = 230, at = h - 64;
      tone(ctx, c => { c.moveTo(ax - 64, at); c.lineTo(ax + 50, at); c.lineTo(ax + 50, at + 14); c.lineTo(ax + 26, at + 18); c.lineTo(ax + 30, fy - 10); c.lineTo(ax + 44, fy); c.lineTo(ax - 44, fy); c.lineTo(ax - 30, fy - 10); c.lineTo(ax - 26, at + 18); c.lineTo(ax - 40, at + 14); c.quadraticCurveTo(ax - 64, at + 10, ax - 86, at + 2); c.closePath(); }, '#6d7888', ax, at + 20, 50, { dark: -0.4 });
      ctx.beginPath(); ctx.rect(ax - 60, at, 108, 3); F(ctx, '#c9d3e0'); ctx.fill();
      // the item on it, glowing hot
      if (st.item) {
        const k = feelItemK(st.item, 44);
        if (heat > 0) glow(ctx, ax - 4, at - 12, 46, '#ff8a2b', 0.8 * heat);
        item(ctx, st.item, ax - 4, at - 11, 0, k, NOEST);
        if (heat > 0) { ctx.save(); ctx.globalAlpha = 0.35 * heat; ctx.globalCompositeOperation = 'lighter'; ctx.beginPath(); circ(ctx, ax - 4, at - 11, 18); F(ctx, '#ff8a2b'); ctx.fill(); ctx.restore(); }
        if (done > 0) for (let i = 0; i < 6; i++) { const a = i * TAU / 6 + t * 2, rr = 24 + (1 - done) * 20; ctx.globalAlpha = done; feelGlint(ctx, ax - 4 + Math.cos(a) * rr, at - 11 + Math.sin(a) * rr * 0.7, 6); }
        ctx.globalAlpha = 1;
        if (done > 0) txt(ctx, '+', ax + 24, at - 30 - (1 - done) * 10, 26, PAL.lime, true, 'center', INK);
      } else {
        // a hot ingot waits on the anvil
        const p = 0.5 + 0.5 * Math.sin(t * 2.4);
        glow(ctx, ax - 4, at - 7, 34, '#ff8a2b', 0.35 + p * 0.25);
        tone(ctx, c => rrect(c, ax - 24, at - 12, 40, 12, 3), '#ff9a3b', ax - 4, at - 6, 20, { dark: -0.25, ol: 2 });
      }
      // the hammer on a piston arm hung from a rail
      const px = 330, py = 22;
      ctx.beginPath(); rrect(ctx, 250, 10, 160, 10, 4); F(ctx, '#3d3548'); ctx.fill(); S(ctx, INK, 2); ctx.stroke();
      const hit = st.hit == null ? 9 : st.hit;
      let raise = 0.85 - 0.08 * Math.sin(t * 1.5);
      if (hit < 0.07) raise = 1 - hit / 0.07; else if (hit < 0.45) raise = (hit - 0.07) / 0.38;
      FORGE_HIT.y = at - 26;
      const dx = FORGE_HIT.x - px, dy = FORGE_HIT.y - py, L = Math.hypot(dx, dy), th = Math.atan2(dy, dx) + raise * 0.52;
      const hx = px + Math.cos(th) * L, hy = py + Math.sin(th) * L;
      limb(ctx, px, py, hx, hy, 6, '#8e6a44');
      tone(ctx, c => circ(c, px, py, 8), '#6d7888', px, py, 8, { ol: 2 });
      ctx.save(); ctx.translate(hx, hy); ctx.rotate(th - Math.PI / 2);
      tone(ctx, c => rrect(c, -22, -12, 44, 24, 5), '#8e98a8', 0, 0, 22, { dark: -0.35 });
      ctx.restore();
      // strike flashes and sparks
      const sk = st.strikes || [];
      for (let j = 0; j < sk.length; j++) {
        const s = sk[j];
        if (s < 0 || s > 0.7) continue;
        if (s < 0.25) glow(ctx, FORGE_HIT.x - 4, at - 8, 90, '#ffd27a', 0.9 * (1 - s / 0.25));
        for (let i = 0; i < 14; i++) {
          const a = -Math.PI * (0.1 + 0.8 * ((i * 0.618 + j * 0.27) % 1)), v = 120 + ((i * 37) % 90);
          const x = FORGE_HIT.x - 4 + Math.cos(a) * v * s, y = at - 8 + Math.sin(a) * v * s + 420 * s * s;
          ctx.globalAlpha = 1 - s / 0.7;
          line(ctx, x, y, x - Math.cos(a) * 6, y - Math.sin(a) * 6 + 4, i % 2 ? '#ffd27a' : '#fff6c0', 2);
        }
        ctx.globalAlpha = 1;
      }
    } catch (e) { /* never throws */ }
    ctx.restore();
  }

  /* ================================================================ VAULT (round 5)
     The Prize Vault's cosmetics (DESIGN.md "Prize Vault"). The game sets the
     equipped ones with RENDER.vault.equip; they change the cabinet (frame,
     trim, back panel, bulbs, neon: cabStatic / cabBulbs), the marquee (its
     text, style and bulb pattern), the claw's paint (every type), the
     crawler's outfit (drawn over RENDER.portrait: the HUD, the map token,
     the versus card) and the trail the crawler leaves on the map. A draw can
     pass its own: st.skin / st.marquee on the cabinet, cfg.paint on the claw,
     vault.withOutfit for a portrait (null = the default look). The looks are
     DATA.COSMETICS fields; with no DATA every slot is the default. */
  const VEQ = { skin: null, paint: null, marquee: null, trail: null, outfit: {} };
  const VFORCE = { on: false, outfit: null };
  const vDef = (id) => (id && typeof DATA !== 'undefined' && DATA && DATA.COSMETICS ? DATA.COSMETICS[id] || null : null);
  const vDefault = (cat) => ((typeof DATA !== 'undefined' && DATA && DATA.VAULT_DEFAULT) || {})[cat];
  // The def of a slot (over: an explicit id, undefined = the equipped one); null for the default look.
  function vLook(cat, over) {
    const id = over !== undefined ? over : VEQ[cat];
    if (!id || id === vDefault(cat)) return null;
    const d = vDef(id);
    return d && d.cat === cat && d.look ? d : null;
  }
  function vEquip(eq) {
    eq = eq || {};
    for (const k of ['skin', 'paint', 'marquee', 'trail']) VEQ[k] = typeof eq[k] === 'string' ? eq[k] : null;
    VEQ.outfit = {};
    const o = eq.outfit && typeof eq.outfit === 'object' ? eq.outfit : {};
    for (const c in o) if (typeof o[c] === 'string') VEQ.outfit[c] = o[c];
  }
  // 24 hues as hex (the rainbow looks), so the colour caches stay small.
  const RB = [];
  for (let i = 0; i < 24; i++) {
    const hh = i / 24 * 6, x = 1 - Math.abs((hh % 2) - 1), seg = Math.floor(hh) % 6;
    const [r, g, b] = [[1, x, 0], [x, 1, 0], [0, 1, x], [0, x, 1], [x, 0, 1], [1, 0, x]][seg];
    const c = (v) => ('0' + Math.round(90 + v * 165).toString(16)).slice(-2);
    RB.push('#' + c(r) + c(g) + c(b));
  }
  const rbCol = (t, k) => RB[(((Math.floor(t * 10) + Math.floor(k || 0)) % 24) + 24) % 24];

  // ---- the cabinet: the frame's pattern (clipped to the frame ring) and trim
  function vFrame(ctx, L, c) {
    const w = c.w, h = c.h, f = c.frame;
    ctx.save();
    ctx.beginPath(); rrect(ctx, -f, -f, w + f * 2, h + f * 2, 14); ctx.rect(w, 0, -w, h);
    ctx.clip('evenodd');
    const tr = L.trim || '#ffffff', fp = L.fp;
    if (fp === 'stripes') {
      F(ctx, rgba(tr, 0.6)); ctx.beginPath();
      for (let i = -h - f * 2; i < w + h + f * 2; i += 24) { ctx.moveTo(i - f, -f); ctx.lineTo(i - f + 11, -f); ctx.lineTo(i - f + 11 + h + f * 2, h + f); ctx.lineTo(i - f + h + f * 2, h + f); ctx.closePath(); }
      ctx.fill();
    } else if (fp === 'grain') {
      S(ctx, rgba(shade(L.frame, 0.3), 0.55), 1.5); ctx.beginPath();
      for (let yy = -f + 4; yy < h + f; yy += 7) { ctx.moveTo(-f, yy); for (let xx = -f; xx <= w + f; xx += 20) ctx.lineTo(xx, yy + Math.sin(xx * 0.05 + yy) * 2.2); }
      ctx.stroke();
    } else if (fp === 'rivets') {
      try { const g = ctx.createLinearGradient(-f, -f, w + f, h + f); g.addColorStop(0, rgba('#ffffff', 0.35)); g.addColorStop(0.5, rgba('#ffffff', 0)); g.addColorStop(1, rgba('#ffffff', 0.25)); ctx.fillStyle = g; ctx.fillRect(-f, -f, w + f * 2, h + f * 2); } catch (e) { /* stub */ }
      F(ctx, tr); ctx.beginPath();
      for (let xx = 10; xx < w; xx += 34) { circ(ctx, xx, -f + 5, 2); circ(ctx, xx, h + f - 5, 2); }
      for (let yy = 16; yy < h; yy += 34) { circ(ctx, -f + 5, yy, 2); circ(ctx, w + f - 5, yy, 2); }
      ctx.fill();
    } else if (fp === 'vines') {
      S(ctx, '#1f7a2a', 3); ctx.beginPath();
      for (let xx = -f; xx <= w + f; xx += 6) { const yy = -f * 0.3 + Math.sin(xx * 0.07) * f * 0.28; if (xx === -f) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy); }
      for (let yy = 0; yy <= h; yy += 6) { const xx = -f * 0.3 + Math.sin(yy * 0.08) * f * 0.28; if (yy === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy); }
      ctx.stroke();
      F(ctx, tr); ctx.beginPath();
      for (let xx = 0; xx < w; xx += 28) ell(ctx, xx, -f * 0.3 + Math.sin(xx * 0.07) * f * 0.28 - 4, 5, 2.5, -0.6);
      for (let yy = 14; yy < h; yy += 28) ell(ctx, -f * 0.3 + Math.sin(yy * 0.08) * f * 0.28 + 4, yy, 5, 2.5, 0.9);
      ctx.fill();
    } else if (fp === 'drips') {
      F(ctx, rgba(tr, 0.8)); ctx.beginPath();
      for (let xx = 6; xx < w; xx += 22) { const d = 4 + ((xx * 7) % 11); ctx.moveTo(xx - 4, -f); ctx.lineTo(xx + 4, -f); ctx.lineTo(xx + 2, -f + d); ctx.arc(xx, -f + d, 2, 0, Math.PI); ctx.closePath(); }
      ctx.fill();
      S(ctx, rgba('#ffffff', 0.35), 1); ctx.beginPath();
      for (let k = 0; k < 4; k++) { ctx.moveTo(-f, -f); ctx.lineTo(-f + 24 * Math.cos(k * 0.5), -f + 24 * Math.sin(k * 0.5)); }
      for (let rr = 8; rr <= 24; rr += 8) { ctx.moveTo(-f + rr, -f); ctx.quadraticCurveTo(-f + rr * 0.8, -f + rr * 0.8, -f, -f + rr); }
      ctx.stroke();
    } else if (fp === 'stars') {
      F(ctx, '#ffffff'); ctx.beginPath();
      for (let i = 0; i < 40; i++) { const u = (i * 0.618) % 1, v = (i * 0.379) % 1, px = -f + u * (w + f * 2), py = -f + v * (h + f * 2); circ(ctx, px, py, 0.6 + (i % 3) * 0.5); }
      ctx.fill();
      tone(ctx, q => circ(q, w + f * 0.45, -f * 0.45, f * 0.34), '#ff9ad0', w + f * 0.45, -f * 0.45, f * 0.34, NOSPEC);
      ctx.beginPath(); ell(ctx, w + f * 0.45, -f * 0.45, f * 0.55, f * 0.14, -0.4); S(ctx, tr, 1.5); ctx.stroke();
    } else if (fp === 'cracks') {
      S(ctx, rgba(tr, 0.9), 2); ctx.beginPath();
      for (let i = 0; i < 16; i++) {
        const u = (i * 0.618) % 1, side = i % 4;
        let px = side === 0 ? -f + u * (w + f * 2) : side === 1 ? w + f * 0.5 : side === 2 ? -f + u * (w + f * 2) : -f * 0.5;
        let py = side === 0 ? -f * 0.5 : side === 1 ? -f + u * (h + f * 2) : side === 2 ? h + f * 0.5 : -f + u * (h + f * 2);
        ctx.moveTo(px, py);
        for (let s = 0; s < 3; s++) { px += ((i * 13 + s * 7) % 9) - 4; py += ((i * 5 + s * 11) % 9) - 4; ctx.lineTo(px, py); }
      }
      ctx.stroke();
    } else if (fp === 'coins') {
      for (let xx = 12; xx < w; xx += 40) for (const yy of [-f * 0.5, h + f * 0.5]) tone(ctx, q => circ(q, xx, yy, f * 0.26), '#ffe066', xx, yy, f * 0.26, { ol: 1.2, dark: -0.3 });
      try { const g = ctx.createLinearGradient(-f, -f, w + f, h + f); g.addColorStop(0, rgba('#fff6c0', 0.35)); g.addColorStop(0.45, rgba('#fff6c0', 0)); g.addColorStop(0.55, rgba('#fff6c0', 0.3)); g.addColorStop(1, rgba('#fff6c0', 0)); ctx.fillStyle = g; ctx.fillRect(-f, -f, w + f * 2, h + f * 2); } catch (e) { /* stub */ }
    } else if (fp === 'rainbow') {
      for (let i = 0; i < 6; i++) { ctx.beginPath(); rrect(ctx, -f + 3 + i * 3, -f + 3 + i * 3, w + f * 2 - 6 - i * 6, h + f * 2 - 6 - i * 6, 12); S(ctx, rgba(RB[i * 4], 0.55), 3); ctx.stroke(); }
    }
    ctx.restore();
    ctx.beginPath(); rrect(ctx, -f + 3, -f + 3, w + f * 2 - 6, h + f * 2 - 6, 11); S(ctx, rgba(tr, 0.7), 2); ctx.stroke();
  }
  // ---- the back panel above the floor band (inside the tilted, clipped panel)
  function vPanel(ctx, L, w, fy, neon) {
    const pp = L.pp, tr = L.trim || neon;
    if (pp === 'candy') {
      for (let i = 0; i * 26 < w; i++) { F(ctx, rgba(i % 2 ? '#ff9ad0' : '#fff0f7', 0.08)); ctx.fillRect(i * 26, 0, 13, fy); }
      F(ctx, rgba('#ffffff', 0.12)); ctx.beginPath();
      for (let yy = 18; yy < fy; yy += 36) for (let xx = (yy / 36 % 2) * 18 + 10; xx < w; xx += 36) circ(ctx, xx, yy, 3.5);
      ctx.fill();
    } else if (pp === 'planks') {
      S(ctx, rgba('#000000', 0.45), 2); ctx.beginPath();
      for (let yy = 24; yy < fy; yy += 24) { ctx.moveTo(0, yy); ctx.lineTo(w, yy); }
      for (let yy = 0; yy < fy; yy += 24) for (let xx = ((yy / 24) % 2) * 60 + 40; xx < w; xx += 120) { ctx.moveTo(xx, yy); ctx.lineTo(xx, yy + 24); }
      ctx.stroke();
      F(ctx, rgba('#c9a24a', 0.5)); ctx.beginPath();
      for (let yy = 12; yy < fy; yy += 24) for (let xx = ((yy / 24 | 0) % 2) * 60 + 30; xx < w; xx += 120) circ(ctx, xx, yy, 1.4);
      ctx.fill();
    } else if (pp === 'grid') {
      S(ctx, rgba(tr, 0.12), 1); ctx.beginPath();
      for (let xx = 0; xx < w; xx += 20) { ctx.moveTo(xx, 0); ctx.lineTo(xx, fy); }
      for (let yy = 0; yy < fy; yy += 20) { ctx.moveTo(0, yy); ctx.lineTo(w, yy); }
      ctx.stroke();
    } else if (pp === 'leaves') {
      F(ctx, rgba('#3ddc84', 0.14)); ctx.beginPath();
      for (let i = 0; i < 22; i++) { const px = ((i * 0.618) % 1) * w, py = ((i * 0.41) % 1) * fy; ell(ctx, px, py, 16, 6, i * 0.7); }
      ctx.fill();
      S(ctx, rgba('#1f7a2a', 0.5), 2); ctx.beginPath();
      for (let xx = 30; xx < w; xx += 90) { ctx.moveTo(xx, 0); ctx.quadraticCurveTo(xx + 20, fy * 0.4, xx - 6, fy * 0.8); }
      ctx.stroke();
    } else if (pp === 'bats') {
      glow(ctx, w * 0.78, fy * 0.3, 40, '#e8f0ff', 0.35);
      F(ctx, rgba('#e8f0ff', 0.25)); ctx.beginPath(); circ(ctx, w * 0.78, fy * 0.3, 16); ctx.fill();
      F(ctx, rgba('#000000', 0.55)); ctx.beginPath();
      for (let i = 0; i < 7; i++) {
        const bx = ((i * 0.618 + 0.1) % 1) * w * 0.9 + 12, by = ((i * 0.37 + 0.2) % 1) * fy * 0.8 + 8, s = 5 + (i % 3) * 2;
        ctx.moveTo(bx, by); ctx.quadraticCurveTo(bx - s, by - s, bx - s * 2, by); ctx.quadraticCurveTo(bx - s, by - s * 0.3, bx, by + s * 0.4);
        ctx.quadraticCurveTo(bx + s, by - s * 0.3, bx + s * 2, by); ctx.quadraticCurveTo(bx + s, by - s, bx, by); ctx.closePath();
      }
      ctx.fill();
    } else if (pp === 'stars') {
      glow(ctx, w * 0.3, fy * 0.5, 90, '#9b7bff', 0.25);
      glow(ctx, w * 0.7, fy * 0.3, 70, '#2ee6d6', 0.15);
      F(ctx, '#ffffff'); ctx.beginPath();
      for (let i = 0; i < 46; i++) circ(ctx, ((i * 0.618) % 1) * w, ((i * 0.271 + 0.05) % 1) * fy, 0.5 + (i % 4) * 0.4);
      ctx.fill();
    } else if (pp === 'lava') {
      S(ctx, rgba('#ff5a1f', 0.45), 2.5); ctx.beginPath();
      for (let i = 0; i < 9; i++) { let px = ((i * 0.618) % 1) * w, py = 0; ctx.moveTo(px, py); for (let s = 0; s < 6; s++) { px += ((i * 7 + s * 13) % 21) - 10; py += fy / 6; ctx.lineTo(px, py); } }
      ctx.stroke();
      F(ctx, rgba('#ff8a2b', 0.12)); ctx.fillRect(0, fy * 0.6, w, fy * 0.4);
    } else if (pp === 'coins') {
      ctx.font = 'bold 14px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      F(ctx, rgba('#ffc94d', 0.14));
      for (let yy = 20; yy < fy; yy += 34) for (let xx = ((yy / 34 | 0) % 2) * 22 + 16; xx < w; xx += 44) ctx.fillText('$', xx, yy);
    } else if (pp === 'rainbow') {
      for (let i = 0; i < 12; i++) { F(ctx, rgba(RB[(i * 2) % 24], 0.07)); ctx.beginPath(); ctx.moveTo(i * 60 - 120, 0); ctx.lineTo(i * 60 - 90, 0); ctx.lineTo(i * 60 - 90 + fy, fy); ctx.lineTo(i * 60 - 120 + fy, fy); ctx.closePath(); ctx.fill(); }
    } else {
      F(ctx, rgba('#ffffff', 0.05)); ctx.beginPath(); for (let yy = 16; yy < fy; yy += 24) for (let xx = 16; xx < w; xx += 24) circ(ctx, xx, yy, 1.5); ctx.fill();
    }
  }
  // A rainbow skin's tube runs through the colours live (the cached back stays still).
  function vRainbowTube(ctx, c, t) {
    const w = c.w, h = c.h, f = c.frame;
    ctx.save();
    try {
      const g = ctx.createLinearGradient(-f, 0, w + f, 0);
      for (let i = 0; i <= 6; i++) g.addColorStop(i / 6, RB[(Math.floor(t * 12) + i * 4) % 24]);
      ctx.beginPath(); rrect(ctx, -f * 0.5, -f * 0.5, w + f, h + f, 8);
      ctx.globalAlpha = 0.85; ctx.strokeStyle = g; ctx.lineWidth = 3.5; ctx.stroke();
    } catch (e) { /* stub */ }
    ctx.restore();
  }
  // Is bulb k lit under a marquee's bulb pattern (chase is the old way)?
  function vBulbOn(pat, k, t, chase, mod) {
    switch (pat) {
      case 'blink': return Math.floor(t * 2.5) % 2 === 0 || k % 4 === 0;
      case 'wave': return Math.sin(k * 0.45 - t * 6) > 0.25;
      case 'sparkle': return h01(k, Math.floor(t * 7)) > 0.62;
      case 'alt': return (k + Math.floor(t * 1.6)) % 2 === 0;
      case 'fast': return ((k - Math.floor(t * 26)) % 3 + 3) % 3 === 0;
      case 'rainbow': return ((k - Math.floor(t * 12)) % 2 + 2) % 2 === 0;
      default: return ((k - chase) % mod + mod) % mod === 0;
    }
  }
  /* A marquee's words in its style at (x, y), size px (the cabinet's top
     band, the thumbnail, the share card). L: {text, style, col}. */
  function vMarquee(ctx, L, x, y, size, t, neon) {
    const s = String(L.text || 'CLAWSPIRE'), col = L.col || neon || PAL.pink;
    ctx.save();
    try {
      switch (L.style) {
        case 'retro':
          txt(ctx, s, x + size * 0.12, y + size * 0.14, size, INK, true, 'center');
          txt(ctx, s, x, y, size, col, true, 'center', '#7a3b00');
          break;
        case 'dots': {
          txt(ctx, s, x, y, size, col, true, 'center', INK);
          // the dot matrix: a screen door of ink over the letters, a bright bar sweeping through
          const tw = s.length * size * 0.72, x0 = x - tw / 2;
          S(ctx, rgba(INK, 0.55), Math.max(0.6, size * 0.08)); ctx.beginPath();
          for (let xx = x0; xx < x0 + tw; xx += size * 0.2) { ctx.moveTo(xx, y - size * 0.6); ctx.lineTo(xx, y + size * 0.6); }
          ctx.stroke();
          const bx = x0 + ((t * 0.8) % 1) * tw;
          glow(ctx, bx, y, size * 1.2, col, 0.6);
          break;
        }
        case 'glitch': {
          const j = h01(Math.floor(t * 9), 3) > 0.8 ? (h01(Math.floor(t * 9), 7) - 0.5) * size * 0.5 : 0;
          ctx.globalAlpha = 0.8;
          txt(ctx, s, x - size * 0.1 + j, y, size, PAL.pink, true, 'center');
          txt(ctx, s, x + size * 0.1 - j, y, size, PAL.cyan, true, 'center');
          ctx.globalAlpha = 1;
          txt(ctx, s, x + j * 0.3, y, size, '#ffffff', true, 'center', INK);
          if (j) { F(ctx, rgba(PAL.cyan, 0.5)); ctx.fillRect(x - s.length * size * 0.4, y - size * 0.1 + j * 0.4, s.length * size * 0.8, size * 0.14); }
          break;
        }
        case 'fire': {
          const tw = s.length * size * 0.66;
          for (let i = 0; i < 5; i++) flames(ctx, x - tw / 2 + (i + 0.5) * tw / 5, y - size * 0.25, size * 0.9, size * 0.9, t, i * 1.7);
          let fill = '#ffe066';
          try { const g = ctx.createLinearGradient(0, y - size * 0.6, 0, y + size * 0.6); g.addColorStop(0, '#fff6c0'); g.addColorStop(0.5, '#ffb347'); g.addColorStop(1, '#ff2e30'); fill = g; } catch (e) { /* stub */ }
          ctx.font = 'bold ' + size + 'px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          S(ctx, INK, Math.max(2, size * 0.2)); ctx.lineJoin = 'round'; ctx.strokeText(s, x, y);
          ctx.fillStyle = FLAT || fill; ctx.fillText(s, x, y);
          break;
        }
        case 'gold': {
          let fill = PAL.gold;
          try { const g = ctx.createLinearGradient(0, y - size * 0.6, 0, y + size * 0.6); g.addColorStop(0, '#fff6c0'); g.addColorStop(0.45, '#ffc94d'); g.addColorStop(0.55, '#b8860b'); g.addColorStop(1, '#ffe28a'); fill = g; } catch (e) { /* stub */ }
          ctx.font = 'bold ' + size + 'px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          S(ctx, INK, Math.max(2, size * 0.2)); ctx.lineJoin = 'round'; ctx.strokeText(s, x, y);
          ctx.fillStyle = FLAT || fill; ctx.fillText(s, x, y);
          glint(ctx, x, y, s.length * size * 0.4, t, 2, '#fff6c0');
          break;
        }
        case 'rainbow': {
          const adv = size * 0.74, x0 = x - (s.length - 1) * adv / 2;
          for (let i = 0; i < s.length; i++) txt(ctx, s[i], x0 + i * adv, y + Math.sin(t * 6 - i * 0.8) * size * 0.14, size, rbCol(t, i * 3), true, 'center', INK);
          break;
        }
        default:
          glow(ctx, x, y, size * 2.2, col, 0.25 + 0.1 * Math.sin(t * 3));
          txt(ctx, s, x, y, size, col, true, 'center', INK);
      }
    } catch (e) { /* never throws */ }
    ctx.restore();
  }

  // ---- the claw's paint: CHROME (declared with the claw) and PAINT stand in for the steel while one claw draws
  const PAINT = { on: false, c1: CHROME0, c2: '#8e98a8', fx: '', glow: null, t: 0 };
  function vPaintBegin(cfg, t) {
    const d = vLook('paint', cfg && cfg.paint !== undefined ? cfg.paint : undefined);
    if (!d) { PAINT.on = false; CHROME = CHROME0; return false; }
    const L = d.look;
    PAINT.on = true; PAINT.fx = L.fx || ''; PAINT.c2 = L.c2 || '#8e98a8'; PAINT.glow = L.glow || null; PAINT.t = t || 0;
    PAINT.c1 = PAINT.fx === 'rainbow' ? rbCol(t || 0, 0) : (L.c1 || CHROME0);
    CHROME = PAINT.c1;
    return true;
  }
  function vPaintEnd() { PAINT.on = false; CHROME = CHROME0; }
  // The paint's looks around the claw: 0 behind the body (glows), 1 in front (sparkles, frost, stealth).
  function vPaintFx(ctx, hub, prongs, ox, oy, t, layer) {
    if (!PAINT.on || !hub) return;
    const hx = ox + hub.x, hy = oy + hub.y, r = Math.max(6, hub.r), fx = PAINT.fx;
    if (layer === 0) {
      if (fx === 'glow' || fx === 'frost') glow(ctx, hx, hy + r, r * 4.2, PAINT.glow || PAINT.c2, 0.45 + 0.2 * Math.sin(t * 3));
      if (fx === 'rainbow') glow(ctx, hx, hy + r, r * 4, rbCol(t, 12), 0.4);
      return;
    }
    const tips = [];
    for (const p of prongs || []) if (p && p.length) tips.push(p[p.length - 1], p[1] || p[0]);
    if (fx === 'sparkle' || fx === 'rainbow' || fx === 'frost') {
      const n = Math.min(tips.length, 4);
      for (let i = 0; i < n; i++) glint(ctx, ox + tips[i].x, oy + tips[i].y, 10, t + i * 0.7, i * 3 + 1, fx === 'frost' ? '#dff6ff' : fx === 'rainbow' ? rbCol(t, i * 6) : '#fff6c0');
    }
    if (fx === 'frost') {
      F(ctx, rgba('#ffffff', 0.8)); ctx.beginPath();
      for (let i = 0; i < 4; i++) { const u = (t * 0.6 + i * 0.25) % 1; circ(ctx, hx + Math.sin(i * 2.3 + t) * r * 1.6, hy + r * 0.5 + u * r * 3, 1.3 * (1 - u) + 0.4); }
      ctx.fill();
    }
    if (fx === 'glow') { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35; for (const p of tips) glow(ctx, ox + p.x, oy + p.y, 12, PAINT.glow || '#6bff9a', 0.9); ctx.restore(); }
  }
  // A rainbow stroke along a prong (the Rainbow Chrome paint).
  function vRainbowStroke(ctx, x0, y0, x1, y1, t) {
    try {
      const g = ctx.createLinearGradient(x0, y0, x1, y1);
      for (let i = 0; i <= 3; i++) g.addColorStop(i / 3, rbCol(t, i * 6));
      return g;
    } catch (e) { return CHROME; }
  }

  // ---- crawler outfits, drawn over the portrait (portrait-local, r = the disc radius)
  const VHEAD = { knight: { top: -0.6, eye: 0.0, w: 0.56, ex: 0.21 }, alchemist: { top: -0.74, eye: -0.04, w: 0.62, ex: 0.21 },
    rogue: { top: -0.82, eye: 0.0, w: 0.6, ex: 0.18 }, gambler: { top: -0.62, eye: 0.2, w: 0.56, ex: 0.2 } };
  function vOutfit(ctx, charId, r, t) {
    const id = VFORCE.on ? VFORCE.outfit : (VEQ.outfit || {})[charId];
    const d = id ? vDef(id) : null;
    if (!d || d.cat !== 'outfit' || !d.look || (d.char && d.char !== charId)) return;
    const L = d.look, Hd = VHEAD[charId] || VHEAD.knight;
    ctx.save();
    try {
      ctx.lineJoin = 'round';
      if (L.kind === 'cape') {
        ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r - 1.5, 0, TAU); ctx.clip();
        const ny = r * 0.5;
        tone(ctx, q => { q.moveTo(-r * 0.3, ny); q.quadraticCurveTo(-r * 0.9, ny + r * 0.1, -r * 1.05, r * 1.1); q.lineTo(-r * 0.45, r * 1.1); q.quadraticCurveTo(-r * 0.5, ny + r * 0.3, -r * 0.2, ny + r * 0.1); q.closePath(); }, L.c1, -r * 0.6, r * 0.8, r * 0.4, { dark: -0.3 });
        tone(ctx, q => { q.moveTo(r * 0.3, ny); q.quadraticCurveTo(r * 0.9, ny + r * 0.1, r * 1.05, r * 1.1); q.lineTo(r * 0.45, r * 1.1); q.quadraticCurveTo(r * 0.5, ny + r * 0.3, r * 0.2, ny + r * 0.1); q.closePath(); }, L.c1, r * 0.6, r * 0.8, r * 0.4, { dark: -0.3 });
        // the collar (ermine dots on a pale collar, or a gold one with a clover pin)
        tone(ctx, q => { q.moveTo(-r * 0.46, ny - r * 0.02); q.quadraticCurveTo(0, ny + r * 0.26, r * 0.46, ny - r * 0.02); q.lineTo(r * 0.4, ny + r * 0.14); q.quadraticCurveTo(0, ny + r * 0.4, -r * 0.4, ny + r * 0.14); q.closePath(); }, L.c2, 0, ny + r * 0.12, r * 0.3, NOSPEC);
        F(ctx, charId === 'knight' ? INK : '#ffffff'); ctx.beginPath();
        for (let i = -2; i <= 2; i++) circ(ctx, i * r * 0.16, ny + r * 0.16 + Math.abs(i) * -r * 0.03, Math.max(0.8, r * 0.025));
        ctx.fill();
        ctx.restore();
      } else if (L.kind === 'shades') {
        const y = Hd.eye * r, ex = Hd.ex * r, lr = r * 0.16;
        if (L.style === 'star') {
          for (const sd of [-1, 1]) { tone(ctx, q => star(q, sd * ex, y, lr * 1.35, 5, 0.5), L.c1, sd * ex, y, lr, { ol: 1.6, spec: false }); }
          F(ctx, rgba(L.c2, 0.8)); ctx.beginPath(); circ(ctx, -ex - lr * 0.3, y - lr * 0.4, lr * 0.22); circ(ctx, ex - lr * 0.3, y - lr * 0.4, lr * 0.22); ctx.fill();
        } else {
          for (const sd of [-1, 1]) { ctx.beginPath(); rrect(ctx, sd * ex - lr * 1.15, y - lr * 0.75, lr * 2.3, lr * 1.5, lr * 0.5); F(ctx, L.c1); ctx.fill(); S(ctx, INK, 1.6); ctx.stroke(); }
          line(ctx, -ex + lr * 1.1, y - lr * 0.3, ex - lr * 1.1, y - lr * 0.3, INK, 2);
          S(ctx, rgba(L.c2, 0.9), Math.max(1, r * 0.035)); ctx.beginPath();
          for (const sd of [-1, 1]) { ctx.moveTo(sd * ex - lr * 0.7, y - lr * 0.1); ctx.lineTo(sd * ex - lr * 0.2, y - lr * 0.55); }
          ctx.stroke();
        }
        // a glint slides across the lenses now and then
        glint(ctx, ex, y - lr * 0.2, lr * 1.4, t, 5, '#ffffff');
      } else if (L.kind === 'hat') {
        const top = Hd.top * r, hw = Hd.w * r;
        if (L.style === 'wizard') {
          const tipX = r * 0.3 + Math.sin(t * 1.5) * r * 0.05;
          tone(ctx, q => { q.moveTo(-hw * 0.8, top + r * 0.1); q.quadraticCurveTo(-hw * 0.2, top - r * 0.5, tipX, top - r * 0.95); q.quadraticCurveTo(hw * 0.25, top - r * 0.4, hw * 0.8, top + r * 0.1); q.closePath(); }, L.c1, 0, top - r * 0.3, r * 0.45, { dark: -0.3 });
          tone(ctx, q => ell(q, 0, top + r * 0.1, hw * 1.25, r * 0.12), shade(L.c1, -0.15), 0, top + r * 0.1, hw, NOSPEC);
          F(ctx, L.c2); ctx.beginPath(); star(ctx, -r * 0.08, top - r * 0.28, r * 0.09, 5, 0.45); star(ctx, r * 0.14, top - r * 0.55, r * 0.06, 5, 0.45); ctx.fill();
          glow(ctx, tipX, top - r * 0.95, r * 0.3, L.c2, 0.5 + 0.3 * Math.sin(t * 5));
        } else if (L.style === 'flowers') {
          for (let i = 0; i < 5; i++) {
            const a = Math.PI + (i + 0.5) / 5 * Math.PI, fx0 = Math.cos(a) * hw * 1.02, fy0 = top + r * 0.2 + Math.sin(a) * r * 0.2;
            F(ctx, '#3ddc84'); ctx.beginPath(); ell(ctx, fx0 + r * 0.08, fy0 + r * 0.04, r * 0.08, r * 0.04, 0.5); ctx.fill();
            tone(ctx, q => { for (let k = 0; k < 5; k++) circ(q, fx0 + Math.cos(k * TAU / 5) * r * 0.07, fy0 + Math.sin(k * TAU / 5) * r * 0.07, r * 0.06); }, i % 2 ? L.c1 : '#ffffff', fx0, fy0, r * 0.1, { ol: 1, spec: false });
            F(ctx, L.c2); ctx.beginPath(); circ(ctx, fx0, fy0, r * 0.045); ctx.fill();
          }
        } else if (L.style === 'tricorn') {
          tone(ctx, q => { q.moveTo(-hw * 1.35, top + r * 0.12); q.quadraticCurveTo(-hw * 0.9, top - r * 0.5, 0, top - r * 0.42); q.quadraticCurveTo(hw * 0.9, top - r * 0.5, hw * 1.35, top + r * 0.12); q.quadraticCurveTo(0, top - r * 0.06, -hw * 1.35, top + r * 0.12); q.closePath(); }, L.c1, 0, top - r * 0.2, r * 0.5, { dark: -0.35 });
          ctx.beginPath(); ctx.moveTo(-hw * 1.3, top + r * 0.1); ctx.quadraticCurveTo(0, top - r * 0.1, hw * 1.3, top + r * 0.1); S(ctx, L.c2, Math.max(1.2, r * 0.04)); ctx.stroke();
          // the skull and crossbones
          const sy = top - r * 0.22;
          line(ctx, -r * 0.1, sy - r * 0.05, r * 0.1, sy + r * 0.1, '#ffffff', Math.max(1, r * 0.035));
          line(ctx, r * 0.1, sy - r * 0.05, -r * 0.1, sy + r * 0.1, '#ffffff', Math.max(1, r * 0.035));
          F(ctx, '#ffffff'); ctx.beginPath(); circ(ctx, 0, sy - r * 0.02, r * 0.07); ctx.fill();
          F(ctx, INK); ctx.beginPath(); circ(ctx, -r * 0.025, sy - r * 0.02, r * 0.018); circ(ctx, r * 0.025, sy - r * 0.02, r * 0.018); ctx.fill();
        } else if (L.style === 'cowboy') {
          tone(ctx, q => { q.moveTo(-hw * 0.62, top + r * 0.06); q.quadraticCurveTo(-hw * 0.7, top - r * 0.46, -hw * 0.2, top - r * 0.4); q.quadraticCurveTo(0, top - r * 0.3, hw * 0.2, top - r * 0.4); q.quadraticCurveTo(hw * 0.7, top - r * 0.46, hw * 0.62, top + r * 0.06); q.closePath(); }, L.c1, 0, top - r * 0.2, r * 0.4, { dark: -0.3 });
          ctx.beginPath(); rrect(ctx, -hw * 0.64, top - r * 0.08, hw * 1.28, r * 0.1, r * 0.03); F(ctx, L.c2); ctx.fill(); S(ctx, INK, 1.2); ctx.stroke();
          tone(ctx, q => { q.moveTo(-hw * 1.5, top - r * 0.02); q.quadraticCurveTo(-hw * 1.2, top + r * 0.22, 0, top + r * 0.14); q.quadraticCurveTo(hw * 1.2, top + r * 0.22, hw * 1.5, top - r * 0.02); q.quadraticCurveTo(0, top + r * 0.3, -hw * 1.5, top - r * 0.02); q.closePath(); }, shade(L.c1, -0.1), 0, top + r * 0.1, hw, NOSPEC);
        }
      }
    } catch (e) { /* never throws */ }
    ctx.restore();
  }

  /* ---- trails: pts [{x, y, a (age s), s (seed)}], n live, the newest last.
     A mark fades over VTRAIL_LIFE; the rainbow is a ribbon through them all. */
  const VTRAIL_LIFE = 2.6;
  const CONFETTI = [PAL.pink, PAL.gold, PAL.cyan, PAL.lime, '#9b7bff'];
  function vTrail(ctx, pts, n, t, id, size) {
    const d = vLook('trail', id);
    if (!d || !pts || !n) return;
    const art = d.look.art, col = d.look.col || '#ffffff', k = (size || 46) / 46;
    ctx.save();
    try {
      if (art === 'rainbow' && n > 1) {
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        for (let b = 0; b < 5; b++) {
          ctx.beginPath();
          let first = true;
          for (let i = 0; i < n; i++) { const p = pts[i]; if (p.a > VTRAIL_LIFE) continue; const off = (b - 2) * 2.6 * k; if (first) { ctx.moveTo(p.x, p.y + off); first = false; } else ctx.lineTo(p.x, p.y + off); }
          ctx.globalAlpha = 0.75; S(ctx, RB[(b * 5 + Math.floor(t * 6)) % 24], 2.8 * k); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
      for (let i = 0; i < n; i++) {
        const p = pts[i], u = p.a / VTRAIL_LIFE;
        if (u >= 1) continue;
        const a = 1 - u, x = p.x, y = p.y, sd = p.s || i;
        ctx.globalAlpha = a;
        switch (art) {
          case 'sparkle': { const s = (3 + 2 * Math.sin(t * 8 + sd)) * k; F(ctx, col); ctx.beginPath(); star(ctx, x, y - u * 8 * k, Math.max(1, s), 4, 0.3); ctx.fill(); break; }
          case 'hearts': {
            const s = 4 * k * (0.6 + a * 0.4), hy = y - u * 14 * k;
            F(ctx, col); ctx.beginPath(); ctx.moveTo(x, hy + s); ctx.bezierCurveTo(x - s * 1.6, hy - s * 0.2, x - s * 0.6, hy - s * 1.4, x, hy - s * 0.4);
            ctx.bezierCurveTo(x + s * 0.6, hy - s * 1.4, x + s * 1.6, hy - s * 0.2, x, hy + s); ctx.fill(); break;
          }
          case 'fire': flames(ctx, x, y + 3 * k, 8 * k * a + 2, 12 * k * a + 2, t, sd); break;
          case 'snow': {
            S(ctx, col, Math.max(0.8, 1.3 * k)); ctx.beginPath();
            const s = 4 * k;
            for (let j = 0; j < 3; j++) { const an = j * Math.PI / 3 + sd; ctx.moveTo(x - Math.cos(an) * s, y + u * 6 * k - Math.sin(an) * s); ctx.lineTo(x + Math.cos(an) * s, y + u * 6 * k + Math.sin(an) * s); }
            ctx.stroke(); break;
          }
          case 'coins': { const sx = Math.abs(Math.cos(t * 5 + sd)) * 3.5 * k + 0.6; tone(ctx, q => ell(q, x, y - Math.sin(u * Math.PI) * 8 * k, sx, 3.5 * k), col, x, y, 3.5 * k, { ol: 1, spec: false }); break; }
          case 'confetti': { ctx.save(); ctx.translate(x + Math.sin(sd * 3) * 5 * k, y + u * 10 * k); ctx.rotate(t * 4 + sd); F(ctx, CONFETTI[(sd | 0) % 5 < 0 ? 0 : (sd | 0) % 5]); ctx.fillRect(-2.5 * k, -1.2 * k, 5 * k, 2.4 * k); ctx.restore(); break; }
          case 'rainbow': F(ctx, '#ffffff'); ctx.beginPath(); star(ctx, x, y, 2.5 * k * a + 0.5, 4, 0.35); ctx.fill(); break;
          default: F(ctx, rgba(col, 0.6)); ctx.beginPath(); circ(ctx, x, y, (2 + u * 3) * k); ctx.fill();
        }
      }
    } catch (e) { /* never throws */ }
    ctx.restore();
  }

  /* ---- a thumbnail of any cosmetic, fitted to an s x s box centred on (x, y):
     a mini cabinet, a painted claw, the marquee plate, the crawler in the
     outfit, a stretch of trail. */
  const VT_PTS = [];
  for (let i = 0; i < 9; i++) VT_PTS.push({ x: 0, y: 0, a: 0, s: i * 1.7 });
  const VT_ITEMS = [['#ff5a4a', -16, 14, 7], ['#2ee6d6', -2, 16, 6], ['#ffc94d', 10, 13, 8], ['#a6ff5e', -10, 6, 5]];
  function vThumb(ctx, id, x, y, s, t) {
    ctx.save();
    try {
      const d = vDef(id);
      ctx.translate(x || 0, y || 0);
      const k = (s || 100) / 100;
      ctx.scale(k, k);
      t = t || 0;
      if (!d) { txt(ctx, '?', 0, 0, 40, PAL.gold, true, 'center', INK); ctx.restore(); return; }
      if (d.cat === 'skin') {
        const cfg = { w: 62, h: 50, frame: 13, chuteW: 14, dividerH: 0.45, railY: 8 };
        const st = { t, act: 1, skin: id, noText: true };
        cabinetBack(ctx, -31, -18, cfg, st);
        for (const [c, ix, iy, r] of VT_ITEMS) { tone(ctx, q => circ(q, ix, iy, r), c, ix, iy, r, { ol: 1.2 }); }
        cabinetFront(ctx, -31, -18, cfg, st);
      } else if (d.cat === 'paint') {
        const pose = typeof PHYS !== 'undefined' && PHYS && PHYS.clawPose ? PHYS.clawPose('classic', { x: 0, y: -8, open: 0.7, cable: 36, width: 1.35 }) : vFakePose(0, -8, 1.1);
        claw(ctx, pose, 0, 0, { paint: id, juice: { t, mood: 'happy' } });
      } else if (d.cat === 'marquee') {
        tone(ctx, q => rrect(q, -48, -22, 96, 44, 10), '#1d1233', 0, 0, 40, { ol: 2.5, dark: -0.2, spec: false });
        const P = [];
        for (let i = 0; i < 10; i++) P.push(-42 + i * 9.3);
        for (let i = 0; i < 10; i++) for (const yy of [-16, 16]) {
          const kk = yy < 0 ? i : 19 - i, on = vBulbOn(d.look.bulbs, kk, t, Math.floor(t * 8), 3);
          F(ctx, on ? (d.look.bulbs === 'rainbow' ? rbCol(t, kk * 2) : '#fff6c0') : '#3a2a50'); ctx.beginPath(); circ(ctx, P[i], yy, 2.4); ctx.fill();
        }
        const L = d.look, n = String(L.text).length;
        vMarquee(ctx, L, 0, 1, Math.min(16, 118 / Math.max(5, n)), t, PAL.pink);
      } else if (d.cat === 'outfit') {
        VFORCE.on = true; VFORCE.outfit = id;
        try { portrait(ctx, d.char || 'knight', 0, 8, 74, t); } finally { VFORCE.on = false; VFORCE.outfit = null; }
      } else if (d.cat === 'trail') {
        for (let i = 0; i < VT_PTS.length; i++) {
          const u = i / (VT_PTS.length - 1), p = VT_PTS[i];
          p.x = -40 + u * 80; p.y = 24 - u * 40 + Math.sin(u * 6) * 8; p.a = (1 - u) * VTRAIL_LIFE * 0.85;
        }
        vTrail(ctx, VT_PTS, VT_PTS.length, t, id, 60);
        crawler(ctx, 40, -16, 22, t);
      }
    } catch (e) { /* never throws */ }
    ctx.restore();
  }
  // A two prong pose without PHYS (the render-only suite).
  function vFakePose(x, y, s) {
    const prong = (d) => [[0, 0], [14, 28], [9, 48], [1, 57]].map(([lx, ly]) => ({ x: x + d * (7 + lx) * s * 0.74, y: y + (7 + ly) * s * 0.74 }));
    return { bodies: { hub: { x, y, r: 13 * s * 0.74 }, prongs: [prong(-1), prong(1)], ghost: null }, cableTop: { x, y: y - 36 }, sway: 0, phase: 'idle', geo: { s: s * 0.74 } };
  }

  /* ---- the Prize Vault wall (the vault screen's canvas): a pegboard wall
     behind glass, a neon PRIZE VAULT sign in a ring of bulbs, a counter
     window framing the live preview (st.win {x, y, w, h}), glass sheen. */
  function vWall(ctx, w, h, t, st) {
    ctx.save();
    try {
      st = st || {};
      try { const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#1d0f36'); g.addColorStop(0.5, '#150b28'); g.addColorStop(1, '#0c0618'); ctx.fillStyle = g; } catch (e) { ctx.fillStyle = '#150b28'; }
      ctx.fillRect(0, 0, w, h);
      // the pegboard
      F(ctx, 'rgba(0,0,0,0.35)'); ctx.beginPath();
      for (let yy = 12; yy < h; yy += 22) for (let xx = ((yy / 22 | 0) % 2) * 11 + 8; xx < w; xx += 22) circ(ctx, xx, yy, 2.2);
      ctx.fill();
      // shelf glows down the wall (under the prize cards)
      for (let i = 0; i < 4; i++) { const yy = 560 + i * 110; glow(ctx, w / 2, yy, 260, i % 2 ? PAL.cyan : PAL.pink, 0.08); }
      // the neon sign in its bulb ring
      const sx = w / 2 - 6, sy = 40, sw = 236, sh = 50;
      tone(ctx, q => rrect(q, sx - sw / 2, sy - sh / 2, sw, sh, 14), '#241244', sx, sy, sw / 2, { dark: -0.25, spec: false, ol: 3 });
      const nb = 22;
      for (let i = 0; i < nb; i++) {
        const u = i / nb, per = 2 * (sw + sh), d0 = u * per;
        let bx, by;
        if (d0 < sw) { bx = sx - sw / 2 + d0; by = sy - sh / 2; } else if (d0 < sw + sh) { bx = sx + sw / 2; by = sy - sh / 2 + d0 - sw; } else if (d0 < 2 * sw + sh) { bx = sx + sw / 2 - (d0 - sw - sh); by = sy + sh / 2; } else { bx = sx - sw / 2; by = sy + sh / 2 - (d0 - 2 * sw - sh); }
        const on = ((i - Math.floor(t * 9)) % 3 + 3) % 3 === 0;
        F(ctx, on ? '#fff6c0' : '#5a3f2a'); ctx.beginPath(); circ(ctx, bx, by, 3.4); ctx.fill();
        if (on) glow(ctx, bx, by, 10, PAL.gold, 0.8);
      }
      const flick = h01(Math.floor(t * 12), 9) > 0.96 ? 0.45 : 1;
      ctx.globalAlpha = flick;
      glow(ctx, sx, sy, 130, PAL.pink, 0.35);
      txt(ctx, 'PRIZE VAULT', sx, sy + 2, 27, '#ffd6ea', true, 'center', PAL.pink);
      ctx.globalAlpha = 1;
      // the counter window
      const W0 = st.win;
      if (W0) {
        tone(ctx, q => rrect(q, W0.x - 8, W0.y - 8, W0.w + 16, W0.h + 16, 16), '#3a2466', W0.x + W0.w / 2, W0.y, W0.w / 2, { dark: -0.35, spec: false, ol: 3 });
        ctx.beginPath(); rrect(ctx, W0.x - 8, W0.y - 8, W0.w + 16, W0.h + 16, 16); S(ctx, rgba(PAL.gold, 0.7), 2); ctx.stroke();
        ctx.beginPath(); rrect(ctx, W0.x, W0.y, W0.w, W0.h, 10); F(ctx, '#0c0618'); ctx.fill();
        glow(ctx, W0.x + W0.w / 2, W0.y + W0.h * 0.35, W0.w * 0.45, PAL.cyan, 0.12);
      }
    } catch (e) { /* never throws */ }
    ctx.restore();
  }
  // The glass over the counter window (drawn after the preview).
  function vGlass(ctx, W0, t) {
    if (!W0) return;
    ctx.save();
    try {
      ctx.beginPath(); rrect(ctx, W0.x, W0.y, W0.w, W0.h, 10); ctx.clip();
      F(ctx, rgba('#9fe4ff', 0.04)); ctx.fillRect(W0.x, W0.y, W0.w, W0.h);
      const u = (t * 0.12) % 1.6 - 0.3;
      F(ctx, rgba('#ffffff', 0.07));
      ctx.beginPath(); ctx.moveTo(W0.x + W0.w * u, W0.y); ctx.lineTo(W0.x + W0.w * (u + 0.12), W0.y); ctx.lineTo(W0.x + W0.w * (u - 0.1), W0.y + W0.h); ctx.lineTo(W0.x + W0.w * (u - 0.22), W0.y + W0.h); ctx.closePath(); ctx.fill();
      F(ctx, rgba('#ffffff', 0.05));
      ctx.beginPath(); ctx.moveTo(W0.x + W0.w * 0.05, W0.y); ctx.lineTo(W0.x + W0.w * 0.12, W0.y); ctx.lineTo(W0.x, W0.y + W0.h * 0.4); ctx.lineTo(W0.x, W0.y + W0.h * 0.2); ctx.closePath(); ctx.fill();
      ctx.restore(); ctx.save();
      ctx.beginPath(); rrect(ctx, W0.x, W0.y, W0.w, W0.h, 10); S(ctx, rgba('#ffffff', 0.25), 2); ctx.stroke();
    } catch (e) { /* never throws */ }
    ctx.restore();
  }

  /* ---- the share card (1080 x 1350, drawn on an offscreen canvas by the
     game): st {char, name, title, won, score, mode, tilt, loop, act, muts
     [{icon, name, color}], combo {name, tier}, bigHit, boss, items [defs],
     skin, paint, marquee, outfit, clawType, url, date, t}. */
  function vShare(ctx, st) {
    ctx.save();
    try {
      st = st || {};
      const W1 = 1080, H1 = 1350, t = st.t || 0.8;
      try { const g = ctx.createLinearGradient(0, 0, 0, H1); g.addColorStop(0, '#2a0f4a'); g.addColorStop(0.55, '#170a2c'); g.addColorStop(1, '#0a0514'); ctx.fillStyle = g; } catch (e) { ctx.fillStyle = '#170a2c'; }
      ctx.fillRect(0, 0, W1, H1);
      // neon stripes and a sunburst behind the crawler
      ctx.save(); ctx.globalAlpha = 0.07;
      for (let i = 0; i < 18; i++) { F(ctx, i % 2 ? PAL.pink : PAL.cyan); ctx.beginPath(); ctx.moveTo(300, 470); ctx.arc(300, 470, 900, i * TAU / 18, i * TAU / 18 + TAU / 36); ctx.closePath(); ctx.fill(); }
      ctx.restore();
      // a ring of marquee bulbs round the card
      const B = 26;
      for (let i = 0; i * 44 < W1 - 40; i++) for (const yy of [B, H1 - B]) { const on = i % 3 === 0; F(ctx, on ? '#fff6c0' : '#4a2f5a'); ctx.beginPath(); circ(ctx, 34 + i * 44, yy, 7); ctx.fill(); if (on) glow(ctx, 34 + i * 44, yy, 22, PAL.gold, 0.8); }
      for (let i = 1; i * 44 < H1 - 60; i++) for (const xx of [B, W1 - B]) { const on = i % 3 === 1; F(ctx, on ? '#fff6c0' : '#4a2f5a'); ctx.beginPath(); circ(ctx, xx, 26 + i * 44, 7); ctx.fill(); if (on) glow(ctx, xx, 26 + i * 44, 22, PAL.gold, 0.8); }
      // the logo and the headline
      chrome(ctx, 'CLAWSPIRE', W1 / 2, 118, 112, PAL.pink, PAL.pink);
      const head = st.won ? (st.mode === 'endless' ? 'ENDLESS RUN' : 'VICTORY!') : 'RUN OVER';
      txt(ctx, head, W1 / 2, 208, 44, st.won ? PAL.gold : '#ff9ec7', true, 'center', INK);
      // the crawler with the outfit
      glow(ctx, 300, 440, 260, PAL.cyan, 0.3);
      VFORCE.on = true; VFORCE.outfit = st.outfit || null;
      try { portrait(ctx, st.char || 'knight', 300, 450, 330, t); } finally { VFORCE.on = false; VFORCE.outfit = null; }
      txt(ctx, st.name || 'Crawler', 300, 668, 46, '#ffffff', true, 'center', INK);
      if (st.title) txt(ctx, st.title, 300, 714, 28, PAL.cyan, true, 'center');
      // the score
      txt(ctx, 'SCORE', 770, 318, 34, PAL.cyan, true, 'center');
      const sc = String(Math.max(0, Math.round(+st.score || 0))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      glow(ctx, 770, 400, 200, PAL.gold, 0.35);
      txt(ctx, sc, 770, 400, sc.length > 7 ? 92 : 118, PAL.gold, true, 'center', INK);
      const where = st.loop ? 'LOOP ' + st.loop : 'ACT ' + (st.act || 1);
      txt(ctx, (String(st.mode || 'classic').toUpperCase()) + ' · ' + where, 770, 486, 30, '#ffffff', true, 'center', INK);
      // the Tilt badge
      tone(ctx, q => rrect(q, 680, 522, 180, 70, 18), (st.tilt | 0) > 0 ? '#a0165c' : '#2c1d4a', 770, 557, 90, { spec: false, ol: 3 });
      txt(ctx, 'TILT ' + (st.tilt | 0), 770, 558, 40, (st.tilt | 0) > 0 ? '#ffd6ea' : PAL.cyan, true, 'center', INK);
      // the tiles: best combo, biggest hit, the boss, the mutators
      const tile = (x, y, w, h, k, v, col) => {
        tone(ctx, q => rrect(q, x, y, w, h, 20), '#221440', x + w / 2, y + h / 2, w / 2, { spec: false, ol: 3, dark: -0.2 });
        ctx.beginPath(); rrect(ctx, x, y, w, h, 20); S(ctx, rgba(col, 0.8), 3); ctx.stroke();
        txt(ctx, k, x + 28, y + 34, 26, rgba(col, 0.95), true, 'left');
        const vs = String(v);
        txt(ctx, vs, x + 28, y + 88, vs.length > 16 ? 32 : 42, '#ffffff', true, 'left', INK);
      };
      const combo = st.combo ? st.combo.name + ' ' + '★'.repeat(U.clamp(st.combo.tier | 0, 1, 3)) : 'none yet';
      tile(70, 760, 460, 124, 'BEST COMBO', combo, PAL.gold);
      tile(550, 760, 460, 124, 'BIGGEST HIT', (st.bigHit | 0) + ' dmg', PAL.pink);
      tile(70, 902, 940, 124, 'BOSS DEFEATED', st.boss || 'not yet', PAL.lime);
      const muts = st.muts || [];
      if (muts.length) {
        let mx = 90;
        txt(ctx, 'MUTATORS', mx, 1050, 22, PAL.cyan, true, 'left');
        mx += 140;
        for (const m of muts.slice(0, 4)) {
          const label = (m.icon || '') + ' ' + (m.name || '');
          const mw = Math.min(250, 40 + label.length * 14);
          tone(ctx, q => rrect(q, mx, 1032, mw, 36, 12), '#2c1d4a', mx + mw / 2, 1050, mw / 2, { spec: false, ol: 2 });
          txt(ctx, label, mx + mw / 2, 1051, 20, m.color || '#ffffff', true, 'center');
          mx += mw + 10;
          if (mx > 980) break;
        }
      }
      // the mini cabinet in its skin, a few items from the bin, the claw in its paint
      const cfg = { w: 600, h: 132, frame: 22, chuteW: 70, dividerH: 0.45, railY: 20 };
      const cx0 = (W1 - cfg.w) / 2, cy0 = 1102;
      const cst = { t, act: 1, skin: st.skin, mqId: st.marquee };
      cabinetBack(ctx, cx0, cy0, cfg, cst);
      ctx.save(); ctx.beginPath(); ctx.rect(cx0, cy0, cfg.w, cfg.h); ctx.clip();
      const items = st.items || [];
      for (let i = 0; i < Math.min(9, items.length); i++) {
        const def = items[i], ix = cx0 + 40 + i * 50, iy = cy0 + cfg.h - 20 - (i % 2) * 14;
        item(ctx, def, ix, iy, (i * 0.9) % 1.6 - 0.8, 1.05, {});
      }
      if (typeof PHYS !== 'undefined' && PHYS && PHYS.clawPose) {
        const pose = PHYS.clawPose(st.clawType || 'classic', { x: cx0 + 320, y: cy0 + 56, open: 0.8, cable: 36, width: 1 });
        claw(ctx, pose, 0, 0, { paint: st.paint !== undefined ? st.paint : undefined, juice: { t, mood: st.won ? 'happy' : 'wow' } });
      }
      ctx.restore();
      cabinetFront(ctx, cx0, cy0, cfg, cst);
      // the footer: the game's address
      txt(ctx, 'PLAY FREE' + (st.date ? ' · ' + st.date : ''), W1 / 2, 1276, 22, PAL.cyan, true, 'center');
      txt(ctx, String(st.url || 'https://games-71g.pages.dev/clawspire/'), W1 / 2, 1306, 30, '#ffffff', true, 'center', INK);
    } catch (e) { /* never throws */ }
    ctx.restore();
  }
  const VAULT_R = {
    equip: vEquip, get equipped() { return VEQ; }, look: vLook, marquee: vMarquee, outfit: vOutfit, trail: vTrail, thumb: vThumb,
    wall: vWall, glass: vGlass, share: vShare, bulbOn: vBulbOn, TRAIL_LIFE: VTRAIL_LIFE, RB,
    // a portrait in a given outfit (null: none), whatever is equipped
    withOutfit(ctx, charId, x, y, size, t, id) { VFORCE.on = true; VFORCE.outfit = id || null; try { portrait(ctx, charId, x, y, size, t); } finally { VFORCE.on = false; VFORCE.outfit = null; } },
  };
  /* ============================================================ end VAULT */

  /* ============================================================ PETS (round 5) */
  /* Companion pets (DESIGN.md "Pets"): the eight pets in every pose and mood
     with their level looks (a scarf from Lv 2, a crown from Lv 4, sparkles at
     Lv 5), the name tag on the cabinet frame, the pet bed on the map token,
     the pet shop / whack-a-mole / skee-ball map icons and machines, and the
     round's tip pictures. Pure drawing from the state the game hands over;
     every function saves, restores and never throws. A pet is drawn in its
     own units (about 38 tall) with the feet at the origin, facing right. */
  const PET_COL = {
    hamster: ['#f0a860', '#fff1dc'], parrot: ['#3ddc84', '#ff5a4a'], cat: ['#ff9a3c', '#fff1dc'], octopus: ['#c77dff', '#ffd1f0'],
    firefly: ['#ffe066', '#a6ff5e'], mouse: ['#b8c0cc', '#ff5a4a'], raccoon: ['#8e8a9a', '#2a2433'], goose: ['#fff6d6', '#ffc94d'],
  };
  const PET_KEYS = Object.keys(PET_COL);
  const PET_SCARF = { hamster: '#2ee6d6', parrot: '#ffc94d', cat: '#ff2e88', octopus: '#a6ff5e', firefly: '#ff2e88', mouse: '#2ee6d6', raccoon: '#ff5a4a', goose: '#ff2e88' };
  const NOPET = {};
  // Where the level looks sit on the pet drawn last (the neck band, the head top).
  const PA = { nx: 0, ny: -8, nw: 14, hx: 0, hy: -30 };
  // One eye: open (a glint), shut (a blink, asleep), happy arcs, scared (a pin pupil), sad (a droop).
  function petEye(ctx, x, y, r, st, side) {
    const mood = st.mood || '', lk = U.clamp(st.look || 0, -1, 1);
    if (mood === 'happy' || mood === 'cheer' || mood === 'eat') { ctx.beginPath(); ctx.moveTo(x - r, y + r * 0.35); ctx.quadraticCurveTo(x, y - r * 1.2, x + r, y + r * 0.35); S(ctx, INK, Math.max(1.4, r * 0.6)); ctx.stroke(); return; }
    if (mood === 'sleep' || st.blink) { ctx.beginPath(); ctx.moveTo(x - r, y); ctx.quadraticCurveTo(x, y + r, x + r, y); S(ctx, INK, Math.max(1.2, r * 0.5)); ctx.stroke(); return; }
    if (mood === 'scared') {
      ctx.beginPath(); circ(ctx, x, y, r * 1.2); F(ctx, '#ffffff'); ctx.fill(); S(ctx, INK, 1.2); ctx.stroke();
      ctx.beginPath(); circ(ctx, x + lk * r * 0.35, y, r * 0.38); F(ctx, INK); ctx.fill();
      return;
    }
    ctx.beginPath(); ell(ctx, x + lk * r * 0.28, y, r * 0.8, r, 0); F(ctx, INK); ctx.fill();
    ctx.beginPath(); circ(ctx, x + lk * r * 0.28 - r * 0.28, y - r * 0.38, r * 0.34); F(ctx, '#ffffff'); ctx.fill();
    if (mood === 'sad' || mood === 'focus') {
      const d = mood === 'sad' ? 1 : -1;
      ctx.beginPath(); ctx.moveTo(x - r * 1.1, y - r * 1.5 + (side > 0 ? 0 : r * 0.5 * d)); ctx.lineTo(x + r * 1.1, y - r * 1.5 + (side > 0 ? r * 0.5 * d : 0)); S(ctx, INK, 1.3); ctx.stroke();
    }
  }
  function petEyes(ctx, x1, x2, y, r, st) { petEye(ctx, x1, y, r, st, -1); petEye(ctx, x2, y, r, st, 1); }
  function petWhiskers(ctx, x, y, w) {
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x + w, y - 2); ctx.moveTo(x, y + 1.5); ctx.lineTo(x + w, y + 2.5);
    S(ctx, rgba(INK, 0.7), 0.9); ctx.stroke();
  }
  function petHamster(ctx, st, c1, c2, t) {
    const run = st.pose === 'run', k = st.k || 0;
    ctx.translate(0, run ? -Math.abs(Math.sin(t * 18)) * 3 : Math.sin(t * 2.2) * 0.6);
    if (run) { const a = Math.sin(t * 18) * 3; F(ctx, '#ffb3a0'); ctx.beginPath(); ell(ctx, -6 + a, -1, 3, 2, 0); ell(ctx, 7 - a, -1, 3, 2, 0); ctx.fill(); }
    tone(ctx, c => circ(c, -13, -11, 3), shade(c1, -0.1), -13, -11, 3, NOSPEC);
    tone(ctx, c => ell(c, 0, -12, 15, 12, 0), c1, 0, -12, 13);
    F(ctx, c2); ctx.beginPath(); ell(ctx, 3, -8, 9, 6.5, 0); ctx.fill();
    for (const [ex, ey] of [[-7, -22], [6, -23]]) { tone(ctx, c => circ(c, ex, ey, 4.6), c1, ex, ey, 4.6, NOSPEC); F(ctx, '#ffb3c1'); ctx.beginPath(); circ(ctx, ex, ey + 0.5, 2.4); ctx.fill(); }
    petEyes(ctx, 2, 10, -15, 2.3, st);
    F(ctx, rgba('#ff6b8b', 0.5)); ctx.beginPath(); circ(ctx, -1.5, -10, 2.8); circ(ctx, 13.5, -10, 2.4); ctx.fill();
    F(ctx, '#ff7aa2'); ctx.beginPath(); ell(ctx, 7, -11.5, 1.8, 1.3, 0); ctx.fill();
    const push = st.pose === 'act' ? Math.sin(Math.min(1, k * 1.6) * Math.PI) * 6 : 0;
    F(ctx, '#ffd9c7'); ctx.beginPath(); ell(ctx, 9 + push, -4, 2.8, 2.1, 0); ell(ctx, 14 + push, -5.5, 2.8, 2.1, 0); ctx.fill(); S(ctx, rgba(INK, 0.6), 1); ctx.stroke();
    PA.nx = 1; PA.ny = -2.5; PA.nw = 20; PA.hx = -1; PA.hy = -24;
  }
  function petParrot(ctx, st, c1, c2, t) {
    const fly = st.pose === 'fly' || st.pose === 'act' || st.air, k = st.k || 0;
    ctx.translate(0, fly ? Math.sin(t * 9) * 2 : Math.sin(t * 2) * 0.6);
    ctx.beginPath(); ctx.moveTo(-4, -8); ctx.quadraticCurveTo(-10, 0, -16, 6); ctx.lineTo(-12, 8); ctx.quadraticCurveTo(-7, 0, -1, -6); ctx.closePath(); F(ctx, '#3d7bff'); ctx.fill(); S(ctx, INK, 1.8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-2, -8); ctx.quadraticCurveTo(-6, 2, -9, 10); ctx.lineTo(-5, 10); ctx.quadraticCurveTo(-3, 2, 1, -6); ctx.closePath(); F(ctx, c2); ctx.fill(); S(ctx, INK, 1.8); ctx.stroke();
    if (!fly) { limb(ctx, -1, -3, -2, 0, 1.5, '#8a8ea0'); limb(ctx, 3, -3, 4, 0, 1.5, '#8a8ea0'); }
    tone(ctx, c => ell(c, 0, -13, 9, 12, 0.25), c1, 0, -13, 10);
    F(ctx, '#c9ffd8'); ctx.beginPath(); ell(ctx, 3, -11, 4.5, 7, 0.25); ctx.fill();
    const fa = fly ? Math.sin(t * 30) * 0.9 : 0.15;
    ctx.save(); ctx.translate(-2, -17); ctx.rotate(-0.4 - fa);
    tone(ctx, c => ell(c, -6, 0, 9, 5, 0), shade(c1, -0.18), -6, 0, 7, NOSPEC);
    F(ctx, '#3d7bff'); ctx.beginPath(); ell(ctx, -12, 1, 4, 3, 0); ctx.fill();
    ctx.restore();
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ell(ctx, 1 + i * 2.5, -34 + i * 0.5, 2, 5, -0.5 + i * 0.35); F(ctx, c2); ctx.fill(); S(ctx, INK, 1.4); ctx.stroke(); }
    tone(ctx, c => circ(c, 4, -27, 7.5), c1, 4, -27, 7.5);
    const peck = st.pose === 'act' ? Math.abs(Math.sin(k * 16)) : 0;
    const open = st.talk ? Math.abs(Math.sin(t * 20)) * 2 : peck * 1.5;
    ctx.save(); ctx.translate(10, -27); ctx.rotate(peck * 0.5);
    ctx.beginPath(); ctx.moveTo(-1, -3); ctx.quadraticCurveTo(7, -3, 5, 5 - open * 0.3); ctx.lineTo(0, 2); ctx.closePath(); F(ctx, '#ffc94d'); ctx.fill(); S(ctx, INK, 1.6); ctx.stroke();
    if (open > 0.3) { ctx.beginPath(); ctx.moveTo(0, 3); ctx.lineTo(4, 5 + open); ctx.lineTo(-1, 5); ctx.closePath(); F(ctx, '#e0a020'); ctx.fill(); S(ctx, INK, 1.2); ctx.stroke(); }
    ctx.restore();
    F(ctx, '#ffffff'); ctx.beginPath(); circ(ctx, 5, -28.5, 3.6); ctx.fill();
    petEye(ctx, 5.6, -28.5, 2, st, 1);
    PA.nx = 3; PA.ny = -19; PA.nw = 12; PA.hx = 3; PA.hy = -35;
  }
  function petCat(ctx, st, c1, c2, t) {
    const act = st.pose === 'act', k = st.k || 0, run = st.pose === 'run';
    ctx.translate(0, run ? -Math.abs(Math.sin(t * 14)) * 3 : 0);
    const sw = Math.sin(t * 2.4) * (st.mood === 'scared' ? 0.1 : 0.5);
    ctx.beginPath(); ctx.moveTo(-10, -5); ctx.bezierCurveTo(-22, -6, -20 + sw * 6, -22, -14 + sw * 8, -29);
    ctx.lineCap = 'round'; S(ctx, INK, 7.5); ctx.stroke(); S(ctx, c1, 4.5); ctx.stroke();
    tone(ctx, c => ell(c, -1, -11, 12, 11, 0), c1, -1, -11, 11);
    S(ctx, shade(c1, -0.3), 2); ctx.beginPath();
    for (let i = 0; i < 3; i++) { ctx.moveTo(-10 + i * 4, -19 + i); ctx.quadraticCurveTo(-7.5 + i * 4, -15, -10 + i * 4, -10); }
    ctx.stroke();
    F(ctx, c2); ctx.beginPath(); ell(ctx, 4, -8, 6, 7, 0); ctx.fill();
    const lift = act ? Math.sin(Math.min(1, k * 1.8) * Math.PI) : 0;
    tone(ctx, c => ell(c, 2, -2, 3.4, 2.6, 0), c2, 2, -2, 3, NOSPEC);
    ctx.save(); ctx.translate(7, -4); ctx.rotate(-lift * 1.8);
    limb(ctx, 0, 0, 6, 1, 3.6, c1); tone(ctx, c => circ(c, 7, 1, 3.2), c2, 7, 1, 3, NOSPEC);
    ctx.restore();
    for (const pts of [[-3, -29, 0, -39, 5, -32], [8, -32, 13, -39, 15, -28]]) {
      tone(ctx, c => poly(c, pts), c1, pts[2], pts[3] + 4, 4, NOSPEC);
      F(ctx, '#ffb3c1'); ctx.beginPath(); poly(ctx, [(pts[0] + pts[2]) / 2 + 0.5, (pts[1] + pts[3]) / 2 + 1.5, pts[2], pts[3] + 3, (pts[2] + pts[4]) / 2 - 0.5, (pts[3] + pts[5]) / 2 + 1.5]); ctx.fill();
    }
    tone(ctx, c => circ(c, 6, -26, 9.5), c1, 6, -26, 9.5);
    if (!st.mood && !st.blink) { F(ctx, '#a6ff5e'); ctx.beginPath(); circ(ctx, 2.5, -27, 2.4); circ(ctx, 9.8, -27, 2.4); ctx.fill(); }
    petEyes(ctx, 2.5, 9.8, -27, st.mood ? 2.2 : 1.6, st);
    F(ctx, '#ff7aa2'); ctx.beginPath(); poly(ctx, [4.8, -23.5, 7.2, -23.5, 6, -22]); ctx.fill();
    ctx.beginPath(); ctx.moveTo(4, -20.5); ctx.quadraticCurveTo(5, -19.5, 6, -21); ctx.quadraticCurveTo(7, -19.5, 8, -20.5); S(ctx, INK, 1); ctx.stroke();
    petWhiskers(ctx, 10, -22, 8); ctx.save(); ctx.scale(-1, 1); petWhiskers(ctx, -2, -22, 8); ctx.restore();
    PA.nx = 5; PA.ny = -15; PA.nw = 13; PA.hx = 6; PA.hy = -35;
  }
  function petOctopus(ctx, st, c1, c2, t) {
    const busy = st.pose === 'ride' || st.pose === 'act' ? 1.8 : 1;
    ctx.translate(0, Math.sin(t * 2.6) * 0.8);
    for (let i = 0; i < 6; i++) {
      const x0 = -10 + i * 4, ph = t * 3 * busy + i * 1.1;
      const x1 = x0 + (i - 2.5) * 2.4 + Math.sin(ph) * 3, y1 = -1 + Math.cos(ph) * 1.5;
      ctx.beginPath(); ctx.moveTo(x0, -12); ctx.quadraticCurveTo(x0 + Math.sin(ph + 1) * 5, -6, x1, y1);
      ctx.lineCap = 'round'; S(ctx, INK, 7); ctx.stroke(); S(ctx, i % 2 ? c1 : shade(c1, -0.12), 4.2); ctx.stroke();
    }
    // the long arm that holds a prize (st.reach: the item, in pet units)
    if (st.reach) {
      const rx = st.reach.x, ry = st.reach.y, mx = rx * 0.5 + Math.sin(t * 5) * 4, my = Math.min(ry, -6) * 0.5 - 10;
      ctx.beginPath(); ctx.moveTo(6, -12); ctx.quadraticCurveTo(mx, my, rx, ry);
      S(ctx, INK, 7.5); ctx.stroke(); S(ctx, c1, 4.6); ctx.stroke();
      F(ctx, c2); ctx.beginPath();
      for (let i = 1; i < 5; i++) { const u = i / 5, v = 1 - u; circ(ctx, v * v * 6 + 2 * v * u * mx + u * u * rx, v * v * -12 + 2 * v * u * my + u * u * ry, 1.2); }
      ctx.fill();
      ctx.beginPath(); circ(ctx, rx, ry, 4); S(ctx, INK, 5); ctx.stroke(); S(ctx, c1, 3); ctx.stroke();
    }
    tone(ctx, c => { c.moveTo(-13, -12); c.bezierCurveTo(-14, -38, 14, -38, 13, -12); c.quadraticCurveTo(0, -8, -13, -12); c.closePath(); }, c1, 0, -22, 13);
    F(ctx, shade(c1, 0.3)); ctx.beginPath(); circ(ctx, -6, -28, 2.2); circ(ctx, 7, -30, 1.6); circ(ctx, 2, -33, 1.4); ctx.fill();
    petEyes(ctx, -4.5, 4.5, -20, 3, st);
    F(ctx, rgba(c2, 0.85)); ctx.beginPath(); circ(ctx, -8.5, -15.5, 2.2); circ(ctx, 8.5, -15.5, 2.2); ctx.fill();
    ctx.beginPath(); circ(ctx, 0, -14.5, st.mood === 'scared' || st.mood === 'cheer' ? 2 : 1.2); F(ctx, INK); ctx.fill();
    PA.nx = 0; PA.ny = -12; PA.nw = 22; PA.hx = 0; PA.hy = -34;
  }
  function petFirefly(ctx, st, c1, c2, t) {
    ctx.translate(0, -9 + Math.sin(t * 4) * 2.5);
    const pul = 0.6 + 0.4 * Math.sin(t * 5), lit = st.glow != null ? st.glow : 1;
    glow(ctx, -7, -10, 24 + pul * 10 + lit * 12, c2, (0.45 + pul * 0.3) * (0.6 + lit * 0.4));
    const wa = Math.sin(t * 50) * 0.5;
    for (const s2 of [-1, 1]) {
      ctx.save(); ctx.translate(1, -18); ctx.rotate((-0.5 + wa) * s2 - 0.2);
      ctx.beginPath(); ell(ctx, 0, -7, 4, 8, 0); F(ctx, rgba('#e8f4ff', 0.55)); ctx.fill(); S(ctx, rgba(INK, 0.6), 1.2); ctx.stroke();
      ctx.restore();
    }
    tone(ctx, c => ell(c, -7, -10, 8, 6.5, -0.3), '#fff6a0', -7, -10, 7, NOSPEC);
    F(ctx, rgba(c2, 0.5 + pul * 0.4)); ctx.beginPath(); ell(ctx, -8, -10, 5.5, 4.2, -0.3); ctx.fill();
    S(ctx, rgba(INK, 0.35), 1); ctx.beginPath(); ctx.moveTo(-6, -15.5); ctx.lineTo(-4, -5); ctx.moveTo(-10, -15); ctx.lineTo(-9, -5); ctx.stroke();
    limb(ctx, 0, -10, -1, -5, 1, INK); limb(ctx, 3, -10, 3, -5, 1, INK);
    tone(ctx, c => circ(c, 1, -14, 5), '#4a3a6a', 1, -14, 5, NOSPEC);
    tone(ctx, c => circ(c, 7, -17, 6), '#5a4a7a', 7, -17, 6);
    F(ctx, '#ffffff'); ctx.beginPath(); circ(ctx, 5.3, -17.5, 2.4); circ(ctx, 10, -17.5, 2.4); ctx.fill();
    petEyes(ctx, 5.3, 10, -17.5, 1.7, st);
    ctx.beginPath(); ctx.moveTo(6, -22); ctx.quadraticCurveTo(5, -30, 1, -30); ctx.moveTo(9, -22); ctx.quadraticCurveTo(11, -30, 15, -30); S(ctx, INK, 1.4); ctx.stroke();
    F(ctx, c1); ctx.beginPath(); circ(ctx, 1, -30, 1.9); circ(ctx, 15, -30, 1.9); ctx.fill();
    PA.nx = 1; PA.ny = -12; PA.nw = 10; PA.hx = 7; PA.hy = -23;
  }
  function petMouse(ctx, st, c1, c2, t) {
    const run = st.pose === 'run', on = st.pose === 'act';
    ctx.translate(0, run ? -Math.abs(Math.sin(t * 20)) * 2.5 : 0);
    ctx.beginPath(); ctx.moveTo(-10, -5); ctx.bezierCurveTo(-20, -2, -18, -16, -26, -14 + Math.sin(t * 3) * 3);
    ctx.lineCap = 'round'; S(ctx, INK, 3.6); ctx.stroke(); S(ctx, '#ffb3c1', 1.8); ctx.stroke();
    tone(ctx, c => ell(c, -1, -9, 11, 9, 0), c1, -1, -9, 10);
    F(ctx, '#eef0f4'); ctx.beginPath(); ell(ctx, 3, -6, 6, 5, 0); ctx.fill();
    for (const [ex, ey, er] of [[1, -25, 6.5], [12, -24, 5.5]]) { tone(ctx, c => circ(c, ex, ey, er), c1, ex, ey, er, NOSPEC); F(ctx, '#ffb3c1'); ctx.beginPath(); circ(ctx, ex, ey, er * 0.55); ctx.fill(); }
    tone(ctx, c => circ(c, 7, -17, 7.5), c1, 7, -17, 7.5);
    petEyes(ctx, 4.5, 10.5, -18.5, 1.8, st);
    F(ctx, '#ff7aa2'); ctx.beginPath(); circ(ctx, 14.5, -15, 1.9); ctx.fill();
    petWhiskers(ctx, 14, -14, 7);
    // the horseshoe magnet, raised and humming when it pulls
    ctx.save(); ctx.translate(15, -8); ctx.rotate(on ? -0.9 : 0.4);
    ctx.beginPath(); ctx.arc(0, 0, 5.5, Math.PI * 0.1, Math.PI * 0.9 + Math.PI, true);
    ctx.lineCap = 'butt'; S(ctx, INK, 6); ctx.stroke(); S(ctx, c2, 3.6); ctx.stroke();
    F(ctx, '#e8eef6'); ctx.beginPath(); ctx.rect(3.4, -1.6, 3.6, 3); ctx.rect(-7, -1.6, 3.6, 3); ctx.fill(); S(ctx, INK, 1); ctx.stroke();
    if (on) for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + (i - 1) * 0.5, rr = 10 + ((t * 30 + i * 4) % 10); ctx.beginPath(); ctx.arc(0, -2, rr, a - 0.3, a + 0.3); S(ctx, rgba(PAL.cyan, 0.9 - ((t * 30 + i * 4) % 10) / 12), 1.6); ctx.stroke(); }
    ctx.restore();
    PA.nx = 4; PA.ny = -9.5; PA.nw = 11; PA.hx = 7; PA.hy = -26;
  }
  function petRaccoon(ctx, st, c1, c2, t) {
    const run = st.pose === 'run', eat = st.pose === 'act';
    ctx.translate(0, run ? -Math.abs(Math.sin(t * 15)) * 3 : 0);
    for (let i = 0; i < 6; i++) {
      const u = i / 5, x = -10 - u * 12 + Math.sin(t * 2 + u * 2) * 1.5, y = -6 - u * 16;
      tone(ctx, c => circ(c, x, y, 5 - u * 1.3), i % 2 ? c2 : c1, x, y, 4, NOSPEC);
    }
    tone(ctx, c => ell(c, -1, -11, 12, 10.5, 0), c1, -1, -11, 11);
    F(ctx, '#c9c5d4'); ctx.beginPath(); ell(ctx, 3, -8, 6, 6, 0); ctx.fill();
    for (const pts of [[-2, -30, 0, -38, 5, -32], [8, -33, 13, -38, 14, -29]]) tone(ctx, c => poly(c, pts), c1, pts[2], pts[3] + 4, 4, NOSPEC);
    tone(ctx, c => circ(c, 6, -25, 9.5), c1, 6, -25, 9.5);
    ctx.beginPath(); ell(ctx, 6, -26.5, 9.2, 3.8, 0); F(ctx, c2); ctx.fill();
    F(ctx, '#ffffff'); ctx.beginPath(); circ(ctx, 2.5, -26.5, 2.5); circ(ctx, 9.5, -26.5, 2.5); ctx.fill();
    petEyes(ctx, 2.5, 9.5, -26.5, 1.7, st);
    F(ctx, '#e9e6f0'); ctx.beginPath(); ell(ctx, 8.5, -20.5, 5, 3.4, 0); ctx.fill();
    F(ctx, INK); ctx.beginPath(); circ(ctx, 12.5, -21.5, 1.8); ctx.fill();
    if (eat) { const m = Math.abs(Math.sin((st.k || 0) * 22)) * 2; ctx.beginPath(); ell(ctx, 9, -18.5, 2.6, 0.6 + m, 0); F(ctx, INK); ctx.fill(); }
    tone(ctx, c => ell(c, 6, -5, 3, 2.4, 0), c2, 6, -5, 3, NOSPEC); tone(ctx, c => ell(c, 11, -6, 3, 2.4, 0), c2, 11, -6, 3, NOSPEC);
    PA.nx = 5; PA.ny = -14; PA.nw = 13; PA.hx = 6; PA.hy = -34;
  }
  function petGoose(ctx, st, c1, c2, t) {
    const lay = st.pose === 'act', k = st.k || 0, run = st.pose === 'run';
    const squat = lay ? Math.sin(Math.min(1, k * 1.5) * Math.PI) * 3 : 0;
    ctx.translate(0, squat + (run ? -Math.abs(Math.sin(t * 12)) * 2 : 0));
    for (const fx0 of [-4, 3]) { ctx.beginPath(); poly(ctx, [fx0 - 3, -squat, fx0 + 4, -squat, fx0, -4 - squat]); F(ctx, '#ff9a3c'); ctx.fill(); S(ctx, INK, 1.2); ctx.stroke(); }
    tone(ctx, c => ell(c, -3, -11, 15, 10, -0.15), c1, -3, -11, 12);
    const fl = lay ? Math.sin(t * 26) * 0.6 : 0;
    ctx.save(); ctx.translate(-4, -14); ctx.rotate(-0.25 - fl);
    tone(ctx, c => ell(c, -3, 0, 10, 6, 0), shade(c1, -0.06), -3, 0, 7, NOSPEC);
    ctx.beginPath(); ctx.arc(-3, 0, 8, 0.2, 2.6); S(ctx, c2, 1.8); ctx.stroke();
    ctx.restore();
    ctx.beginPath(); ctx.moveTo(7, -14); ctx.bezierCurveTo(12, -20, 5, -26, 9, -32);
    ctx.lineCap = 'round'; S(ctx, INK, 9); ctx.stroke(); S(ctx, c1, 6); ctx.stroke();
    tone(ctx, c => circ(c, 10, -34, 6.2), c1, 10, -34, 6);
    const honk = st.talk || lay ? Math.abs(Math.sin(t * 18)) * 1.6 : 0;
    ctx.beginPath(); poly(ctx, [14.5, -36.5, 22, -34 - honk * 0.3, 14.5, -32]); F(ctx, '#ff9a3c'); ctx.fill(); S(ctx, INK, 1.4); ctx.stroke();
    if (honk > 0.4) { ctx.beginPath(); poly(ctx, [14.5, -33.5, 21, -33 + honk, 14.5, -31.5]); F(ctx, '#e07a20'); ctx.fill(); }
    petEye(ctx, 11.5, -35.5, 1.6, st, 1);
    ctx.beginPath(); star(ctx, -9, -16, 2.6, 4, 0.4); F(ctx, rgba(c2, 0.6 + 0.4 * Math.sin(t * 3))); ctx.fill();
    PA.nx = 8.5; PA.ny = -24; PA.nw = 9; PA.hx = 10; PA.hy = -40;
  }
  const PET_ART = { hamster: petHamster, parrot: petParrot, cat: petCat, octopus: petOctopus, firefly: petFirefly, mouse: petMouse, raccoon: petRaccoon, goose: petGoose };
  // Lv 2: a scarf round the neck, its tails fluttering.
  function petScarf(ctx, col, t) {
    const x = PA.nx, y = PA.ny, w = PA.nw;
    ctx.beginPath(); ell(ctx, x, y, w * 0.5, 1.8, 0); S(ctx, INK, 4.6); ctx.stroke(); S(ctx, col, 2.6); ctx.stroke();
    const fl = Math.sin(t * 6) * 1.2;
    ctx.beginPath(); ctx.moveTo(x - w * 0.28, y + 1); ctx.lineTo(x - w * 0.4 - 2, y + 6 + fl); ctx.lineTo(x - w * 0.28 + 2, y + 5.5 - fl); ctx.closePath();
    F(ctx, col); ctx.fill(); S(ctx, INK, 1.1); ctx.stroke();
  }
  // Lv 4: a little gold crown on the head.
  function petCrown(ctx, t) {
    const x = PA.hx, y = PA.hy + 1, s = 5.2;
    tone(ctx, c => poly(c, [x - s, y, x - s * 1.15, y - s * 1.3, x - s * 0.45, y - s * 0.7, x, y - s * 1.7, x + s * 0.45, y - s * 0.7, x + s * 1.15, y - s * 1.3, x + s, y]), PAL.gold, x, y - s * 0.7, s, { ol: 1.4 });
    F(ctx, PAL.pink); ctx.beginPath(); circ(ctx, x, y - s * 0.4, 1.3); ctx.fill();
    F(ctx, rgba('#ffffff', 0.5 + 0.5 * Math.sin(t * 4))); ctx.beginPath(); circ(ctx, x - s * 0.9, y - s * 1.2, 0.9); ctx.fill();
  }
  // Lv 5: sparkles orbiting and a soft gold glow.
  function petAura(ctx, t, col) {
    glow(ctx, 0, -16, 34, PAL.gold, 0.28 + 0.1 * Math.sin(t * 3));
    for (let i = 0; i < 4; i++) {
      const a = t * 1.6 + i * TAU / 4, x = Math.cos(a) * 20, y = -17 + Math.sin(a) * 9, r = 2.2 + Math.sin(t * 5 + i) * 0.8;
      ctx.beginPath(); star(ctx, x, y, r * 1.6, 4, 0.35); F(ctx, i % 2 ? PAL.gold : col); ctx.fill();
    }
  }
  // Hearts (happy), stars (cheer), a sweat drop and a "!" (scared), zZ (asleep), a drip (sad), crumbs (eating).
  function petMoodFx(ctx, st, t) {
    const m = st.mood || '', k = st.moodK == null ? 1 : st.moodK;
    if (!m || k <= 0) return;
    ctx.save(); ctx.globalAlpha = Math.min(1, k * 1.5);
    if (m === 'happy') {
      for (let i = 0; i < 2; i++) {
        const u = (t * 0.9 + i * 0.5) % 1, x = 10 + i * 6 + Math.sin(u * 7 + i) * 3, y = -34 - u * 16, r = 3.2 * (1 - u * 0.4);
        ctx.globalAlpha = Math.min(1, k * 1.5) * (1 - u);
        ctx.beginPath(); ctx.moveTo(x, y + r); ctx.bezierCurveTo(x - r * 1.8, y - r * 0.2, x - r * 0.7, y - r * 1.6, x, y - r * 0.5); ctx.bezierCurveTo(x + r * 0.7, y - r * 1.6, x + r * 1.8, y - r * 0.2, x, y + r);
        F(ctx, PAL.pink); ctx.fill(); S(ctx, INK, 1); ctx.stroke();
      }
    } else if (m === 'cheer') {
      for (let i = 0; i < 3; i++) { const a = t * 3 + i * TAU / 3, x = Math.cos(a) * 14, y = -40 + Math.sin(a) * 4; ctx.beginPath(); star(ctx, x, y, 3.4, 5, 0.45); F(ctx, [PAL.gold, PAL.cyan, PAL.pink][i]); ctx.fill(); S(ctx, INK, 0.8); ctx.stroke(); }
    } else if (m === 'scared') {
      ctx.beginPath(); ctx.moveTo(15, -34); ctx.quadraticCurveTo(19, -28, 15, -26); ctx.quadraticCurveTo(11, -28, 15, -34); F(ctx, '#8dd8ff'); ctx.fill(); S(ctx, INK, 1); ctx.stroke();
      txt(ctx, '!', -10, -40 + Math.sin(t * 14) * 1.5, 13, PAL.blood, true, 'center', INK);
    } else if (m === 'sleep') {
      for (let i = 0; i < 2; i++) { const u = (t * 0.5 + i * 0.5) % 1; ctx.globalAlpha = Math.min(1, k * 1.5) * (1 - u); txt(ctx, 'z', 12 + u * 10, -30 - u * 14, 8 + u * 5, '#e8f4ff', true, 'center', INK); }
    } else if (m === 'sad') {
      const u = (t * 1.2) % 1; ctx.globalAlpha = Math.min(1, k * 1.5) * (1 - u);
      ctx.beginPath(); circ(ctx, 5, -18 + u * 12, 1.6); F(ctx, '#8dd8ff'); ctx.fill();
    } else if (m === 'eat') {
      for (let i = 0; i < 3; i++) { const u = (t * 2 + i * 0.33) % 1; ctx.beginPath(); ctx.rect(10 + i * 3 - u * 6, -16 + u * 14, 2, 2); F(ctx, '#c8a070'); ctx.fill(); }
    }
    ctx.restore();
  }
  /* A pet. (x, y) its feet, s its scale (1: about 38 px tall). st: {t, lv,
     mood: ''|happy|cheer|scared|sleep|sad|eat|focus, moodK, blink, look -1..1,
     dir 1|-1, pose: sit|run|fly|act|ride, k (the action's progress), sq
     (squash), air (no shadow), glow (the firefly's lamp), reach {x, y} (the
     octopus's holding arm, in pet units), talk, lvUp (0..1 flash)}. */
  function pet(ctx, id, x, y, s, st) {
    ctx.save();
    try {
      st = st || NOPET;
      const t = st.t || 0, lv = st.lv || 1, cols = PET_COL[id] || PET_COL.hamster;
      ctx.translate(x || 0, y || 0); ctx.scale(s || 1, s || 1);
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      if (!st.air) { ctx.beginPath(); ell(ctx, 0, 0, 14, 3.5, 0); F(ctx, rgba(INK, 0.35)); ctx.fill(); }
      if (lv >= 5) petAura(ctx, t, cols[0]);
      if (st.lvUp > 0) glow(ctx, 0, -16, 44, PAL.gold, Math.min(1, st.lvUp));
      ctx.save();
      if ((st.dir || 1) < 0) ctx.scale(-1, 1);
      if (st.sq) ctx.scale(1 + st.sq * 0.18, 1 - st.sq * 0.18);
      if (st.mood === 'scared') ctx.translate(Math.sin(t * 60) * 0.8, 0);
      (PET_ART[id] || petHamster)(ctx, st, cols[0], cols[1], t);
      if (lv >= 2) petScarf(ctx, PET_SCARF[id] || PAL.pink, t);
      if (lv >= 4) petCrown(ctx, t);
      ctx.restore();
      petMoodFx(ctx, st, t);
    } catch (e) { /* never throws */ }
    ctx.restore();
  }
  /* The name tag on the cabinet frame: the name, the level and a thin xp bar.
     st: {name, lv, col, xpK 0..1, t, flash 0..1}. */
  function petTag(ctx, x, y, st) {
    ctx.save();
    try {
      st = st || NOPET;
      const name = String(st.name || 'Buddy').toUpperCase(), lab = name + ' ' + 'LV' + (st.lv || 1);
      const w = Math.max(64, lab.length * 7.4 + 14), h = 18, col = st.col || PAL.gold;
      ctx.beginPath(); rrect(ctx, x - w / 2, y - h / 2, w, h, 7); F(ctx, rgba('#12091f', 0.92)); ctx.fill(); S(ctx, col, 2); ctx.stroke();
      if (st.flash > 0) { ctx.globalAlpha = Math.min(1, st.flash); glow(ctx, x, y, w * 0.6, PAL.gold, 0.8); ctx.globalAlpha = 1; }
      txt(ctx, name, x - w / 2 + 7, y - 0.5, 12, '#ffffff', true, 'left');
      txt(ctx, 'LV' + (st.lv || 1), x + w / 2 - 7, y - 0.5, 11, col, true, 'right');
      const k = U.clamp(st.xpK == null ? 0 : st.xpK, 0, 1);
      ctx.beginPath(); ctx.rect(x - w / 2 + 6, y + h / 2 - 3.5, (w - 12), 2); F(ctx, rgba('#ffffff', 0.15)); ctx.fill();
      if (k > 0) { ctx.beginPath(); ctx.rect(x - w / 2 + 6, y + h / 2 - 3.5, (w - 12) * k, 2); F(ctx, PAL.lime); ctx.fill(); }
    } catch (e) { /* never throws */ }
    ctx.restore();
  }
  // The pet bed on the map token: a plush cushion.
  function petBed(ctx, x, y, s, col) {
    ctx.save();
    try {
      ctx.translate(x || 0, y || 0); ctx.scale(s || 1, s || 1);
      col = col || PAL.pink;
      ctx.beginPath(); ell(ctx, 0, 2, 19, 5.5, 0); F(ctx, rgba(INK, 0.35)); ctx.fill();
      tone(ctx, c => ell(c, 0, 0, 18, 7, 0), col, 0, 0, 12, NOSPEC);
      ctx.beginPath(); ell(ctx, 0, -1.2, 12.5, 4, 0); F(ctx, shade(col, 0.35)); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-15, -1); ctx.quadraticCurveTo(0, 5, 15, -1); S(ctx, rgba(INK, 0.4), 1.2); ctx.stroke();
    } catch (e) { /* never throws */ }
    ctx.restore();
  }
  // The map icons: a pet shop (a kennel with a heart), a mole in its hole under a mallet, a skee-ball lane.
  function petIcon(ctx, type, s, t) {
    t = t || 0;
    if (type === 'petshop') {
      glow(ctx, 0, 0, s * 1.3, PAL.pink, 0.2 + Math.sin(t * 3) * 0.08);
      tone(ctx, c => rrect(c, -s * 0.8, -s * 0.35, s * 1.6, s * 1.3, 3), '#c98a4a', 0, s * 0.3, s, { dark: -0.3 });
      tone(ctx, c => poly(c, [-s * 1.05, -s * 0.3, 0, -s * 1.15, s * 1.05, -s * 0.3]), PAL.blood, 0, -s * 0.6, s * 0.7, { dark: -0.3 });
      ctx.beginPath(); ctx.moveTo(-s * 0.35, s * 0.95); ctx.lineTo(-s * 0.35, s * 0.25); ctx.arc(0, s * 0.25, s * 0.35, Math.PI, 0); ctx.lineTo(s * 0.35, s * 0.95); ctx.closePath(); F(ctx, INK); ctx.fill();
      const hb = 1 + Math.max(0, Math.sin(t * 5)) * 0.15, hx = 0, hy = -s * 1.45, r = s * 0.28 * hb;
      ctx.beginPath(); ctx.moveTo(hx, hy + r); ctx.bezierCurveTo(hx - r * 1.8, hy - r * 0.2, hx - r * 0.7, hy - r * 1.6, hx, hy - r * 0.5); ctx.bezierCurveTo(hx + r * 0.7, hy - r * 1.6, hx + r * 1.8, hy - r * 0.2, hx, hy + r);
      F(ctx, PAL.pink); ctx.fill(); S(ctx, INK, 1.5); ctx.stroke();
      F(ctx, '#f4ecd6'); ctx.beginPath(); circ(ctx, 0, -s * 0.52, s * 0.13); for (let i = 0; i < 3; i++) circ(ctx, (i - 1) * s * 0.17, -s * 0.72, s * 0.07); ctx.fill();
    } else if (type === 'moles') {
      const up = 0.5 + 0.5 * Math.sin(t * 3);
      glow(ctx, 0, 0, s * 1.2, '#c8a070', 0.2);
      ctx.beginPath(); ell(ctx, 0, s * 0.55, s * 0.95, s * 0.32, 0); F(ctx, '#2a1a10'); ctx.fill(); S(ctx, INK, 2); ctx.stroke();
      ctx.save(); ctx.beginPath(); ctx.rect(-s * 1.2, -s * 2, s * 2.4, s * 2.55); ctx.clip();
      const my = s * 0.55 - up * s * 0.9;
      tone(ctx, c => { c.moveTo(-s * 0.55, my + s * 0.9); c.lineTo(-s * 0.55, my); c.arc(0, my, s * 0.55, Math.PI, 0); c.lineTo(s * 0.55, my + s * 0.9); c.closePath(); }, '#9a6a44', 0, my, s * 0.55);
      F(ctx, INK); ctx.beginPath(); circ(ctx, -s * 0.2, my - s * 0.08, s * 0.08); circ(ctx, s * 0.2, my - s * 0.08, s * 0.08); ctx.fill();
      F(ctx, '#ff7aa2'); ctx.beginPath(); circ(ctx, 0, my + s * 0.12, s * 0.12); ctx.fill();
      ctx.restore();
      ctx.beginPath(); ctx.ellipse(0, s * 0.55, s * 0.95, s * 0.32, 0, 0, Math.PI); S(ctx, '#6a4a30', 3); ctx.stroke();
      ctx.save(); ctx.translate(s * 0.6, -s * 0.9); ctx.rotate(-0.6 + Math.max(0, Math.sin(t * 3 + 1.2)) * 0.8);
      limb(ctx, 0, 0, 0, s * 0.9, 2.5, '#c98a4a');
      tone(ctx, c => rrect(c, -s * 0.45, -s * 0.22, s * 0.9, s * 0.44, 3), PAL.blood, 0, 0, s * 0.4, NOSPEC);
      ctx.restore();
    } else {
      glow(ctx, 0, -s * 0.5, s * 1.2, PAL.cyan, 0.2 + Math.sin(t * 3) * 0.08);
      tone(ctx, c => poly(c, [-s * 0.95, s * 1.0, s * 0.95, s * 1.0, s * 0.45, -s * 0.35, -s * 0.45, -s * 0.35]), '#b07a3c', 0, s * 0.3, s, { dark: -0.3 });
      ctx.beginPath(); ctx.moveTo(-s * 0.25, -s * 0.3); ctx.lineTo(-s * 0.5, s); ctx.moveTo(s * 0.25, -s * 0.3); ctx.lineTo(s * 0.5, s); S(ctx, rgba(INK, 0.4), 1.2); ctx.stroke();
      for (let i = 0; i < 3; i++) { ctx.beginPath(); circ(ctx, 0, -s * 0.85, s * (0.62 - i * 0.2)); F(ctx, [PAL.pink, PAL.gold, PAL.cyan][i]); ctx.fill(); S(ctx, INK, 1.5); ctx.stroke(); }
      const u = (t * 0.7) % 1, by = s * 0.85 - u * s * 1.5, br = s * (0.24 - u * 0.1);
      tone(ctx, c => circ(c, 0, by, br), '#f4ecd6', 0, by, br, { ol: 1.4 });
    }
  }
  /* WHACK-A-MOLE. st: {t, holes: [{x, y}], moles: [{hole, kind: mole|gold|bomb,
     up 0..1, hit 0..1}], score, best, combo, time, dur, phase, count, mallet:
     {x, y, k}, party, flash}. The scoreboard on top, a 3 x 3 table of holes. */
  function arcMoles(ctx, st) {
    ctx.save();
    try {
      st = st || NOPET;
      const t = st.t || 0, holes = st.holes || [];
      // the scoreboard
      ctx.beginPath(); rrect(ctx, 50, 176, 440, 72, 14); F(ctx, '#0b0616'); ctx.fill(); S(ctx, '#c8a070', 3); ctx.stroke();
      txt(ctx, 'SCORE', 110, 194, 12, '#b3a4d6', true, 'center');
      txt(ctx, String(st.score | 0), 110, 222, 30, PAL.gold, true, 'center', INK);
      txt(ctx, st.combo > 1 ? 'COMBO' : 'BEST', 430, 194, 12, '#b3a4d6', true, 'center');
      txt(ctx, st.combo > 1 ? 'x' + st.combo : String(st.best | 0), 430, 222, 26, st.combo > 1 ? PAL.pink : '#e8f4ff', true, 'center', INK);
      const dur = st.dur || 14, k = U.clamp((st.time == null ? dur : st.time) / dur, 0, 1), low = k < 0.25 && st.phase === 'play';
      txt(ctx, 'TIME', 270, 194, 12, '#b3a4d6', true, 'center');
      ctx.beginPath(); rrect(ctx, 190, 210, 160, 20, 8); F(ctx, '#1d1233'); ctx.fill(); S(ctx, INK, 2); ctx.stroke();
      if (k > 0) { ctx.beginPath(); rrect(ctx, 192, 212, 156 * k, 16, 7); F(ctx, low && Math.sin(t * 16) > 0 ? PAL.blood : k < 0.5 ? PAL.gold : PAL.lime); ctx.fill(); }
      txt(ctx, (Math.max(0, st.time == null ? dur : st.time)).toFixed(1), 270, 239, 11, '#e8f4ff', true, 'center');
      // the table
      tone(ctx, c => rrect(c, 46, 262, 448, 498, 20), '#5a3a28', 270, 500, 240, { dark: -0.2, spec: false });
      ctx.beginPath(); rrect(ctx, 58, 274, 424, 474, 14); F(ctx, '#6e4a32'); ctx.fill();
      S(ctx, rgba('#000000', 0.18), 1.5); ctx.beginPath();
      for (let i = 0; i < 9; i++) { ctx.moveTo(62, 300 + i * 52); ctx.lineTo(478, 300 + i * 52); }
      ctx.stroke();
      const moles = st.moles || [];
      for (let i = 0; i < holes.length; i++) {
        const hx = holes[i].x, hy = holes[i].y;
        const fl = st.flash && st.flash[i] ? st.flash[i] : 0;
        ctx.beginPath(); ell(ctx, hx, hy + 4, 60, 22, 0); F(ctx, '#3a2418'); ctx.fill();
        ctx.beginPath(); ell(ctx, hx, hy, 54, 18, 0); F(ctx, '#140a06'); ctx.fill();
        if (fl > 0) glow(ctx, hx, hy - 20, 70, fl > 0.5 ? PAL.gold : PAL.blood, fl * 0.8);
        // what is up in this hole, clipped at the rim
        for (const m of moles) {
          if (m.hole !== i || !(m.up > 0)) continue;
          ctx.save();
          ctx.beginPath(); ctx.rect(hx - 70, hy - 170, 140, 170); ctx.clip();
          moleArt(ctx, m, hx, hy + (1 - m.up) * 96, t);
          ctx.restore();
        }
        // the front lip over the bottom of the mole
        ctx.beginPath(); ctx.ellipse(hx, hy, 54, 18, 0, 0, Math.PI); S(ctx, '#8a5a3a', 6); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(hx, hy + 4, 60, 22, 0, 0.1, Math.PI - 0.1); S(ctx, INK, 2); ctx.stroke();
      }
      // the mallet
      const ml = st.mallet;
      if (ml && ml.k > 0) {
        ctx.save(); ctx.translate(ml.x + 44, ml.y - 30); ctx.rotate(-1.25 * ml.k + 0.1);
        limb(ctx, 0, 0, -70, 0, 7, '#c98a4a');
        tone(ctx, c => rrect(c, -98, -22, 34, 44, 8), PAL.blood, -81, 0, 20);
        ctx.beginPath(); ctx.rect(-98, -22, 6, 44); F(ctx, '#ffffff'); ctx.fill();
        ctx.restore();
      }
      if (st.phase === 'count' && st.count != null) {
        const c = st.count, u = st.countK || 0;
        if (c <= 0) { ctx.beginPath(); star(ctx, 270, 510, 190 * (1.2 - u * 0.2), 14, 0.62); F(ctx, rgba(PAL.pink, 0.85)); ctx.fill(); S(ctx, INK, 4); ctx.stroke(); }
        txt(ctx, c > 0 ? String(c) : 'WHACK!', 270, 510, (c > 0 ? 110 : 70) * (1.3 - u * 0.3), c > 0 ? '#ffffff' : PAL.gold, true, 'center', INK);
      }
      if (st.phase === 'idle' && !moles.length) {
        const pk = (Math.floor(t * 0.8) % 9), u = Math.sin((t * 0.8 % 1) * Math.PI);
        const hp = holes[pk];
        if (hp && u > 0) { ctx.save(); ctx.beginPath(); ctx.rect(hp.x - 70, hp.y - 170, 140, 170); ctx.clip(); moleArt(ctx, { kind: 'mole', up: u * 0.55, hit: 0 }, hp.x, hp.y + (1 - u * 0.55) * 96, t); ctx.restore(); }
      }
    } catch (e) { /* never throws */ }
    ctx.restore();
  }
  // One mole (or a golden one, or a bomb) standing at (x, y) = the bottom of its body.
  function moleArt(ctx, m, x, y, t) {
    const hit = m.hit || 0, sq = 1 - hit * 0.45;
    ctx.save(); ctx.translate(x, y); ctx.scale(1 + hit * 0.25, sq);
    if (m.kind === 'bomb') {
      tone(ctx, c => circ(c, 0, -40, 34), '#2a2433', 0, -40, 34);
      limb(ctx, 14, -70, 22, -84, 3, '#c8a070');
      if (!hit) { const f = 0.6 + 0.4 * Math.sin(t * 30); glow(ctx, 24, -88, 16, '#ffb347', f); ctx.beginPath(); star(ctx, 24, -88, 6 * f + 2, 6, 0.4); F(ctx, '#fff6c0'); ctx.fill(); }
      ctx.beginPath(); ctx.moveTo(-18, -54); ctx.lineTo(-6, -48); ctx.moveTo(18, -54); ctx.lineTo(6, -48); S(ctx, PAL.blood, 3); ctx.stroke();
      F(ctx, PAL.blood); ctx.beginPath(); circ(ctx, -11, -42, 4); circ(ctx, 11, -42, 4); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-10, -26); ctx.quadraticCurveTo(0, -32, 10, -26); S(ctx, '#ffffff', 2.5); ctx.stroke();
      txt(ctx, 'BOMB', 0, -12, 11, PAL.blood, true, 'center', INK);
    } else {
      const gold = m.kind === 'gold', col = gold ? PAL.gold : '#9a6a44';
      if (gold) glow(ctx, 0, -46, 60, PAL.gold, 0.5 + 0.2 * Math.sin(t * 8));
      tone(ctx, c => { c.moveTo(-36, 10); c.lineTo(-36, -44); c.arc(0, -44, 36, Math.PI, 0); c.lineTo(36, 10); c.closePath(); }, col, 0, -40, 36);
      F(ctx, gold ? '#fff0b0' : '#d8b08a'); ctx.beginPath(); ell(ctx, 0, -20, 22, 18, 0); ctx.fill();
      if (hit > 0) {
        ctx.beginPath(); for (const ex of [-13, 13]) { ctx.moveTo(ex - 5, -55); ctx.lineTo(ex + 5, -45); ctx.moveTo(ex + 5, -55); ctx.lineTo(ex - 5, -45); } S(ctx, INK, 3); ctx.stroke();
        for (let i = 0; i < 3; i++) { const a = t * 6 + i * TAU / 3; ctx.beginPath(); star(ctx, Math.cos(a) * 30, -86 + Math.sin(a) * 8, 6, 5, 0.45); F(ctx, PAL.gold); ctx.fill(); S(ctx, INK, 1.2); ctx.stroke(); }
      } else {
        F(ctx, INK); ctx.beginPath(); ell(ctx, -13, -50, 4.5, 6, 0); ell(ctx, 13, -50, 4.5, 6, 0); ctx.fill();
        F(ctx, '#ffffff'); ctx.beginPath(); circ(ctx, -14.5, -52, 1.8); circ(ctx, 11.5, -52, 1.8); ctx.fill();
      }
      tone(ctx, c => ell(c, 0, -36, 9, 7, 0), '#ff7aa2', 0, -36, 8, NOSPEC);
      ctx.beginPath(); ctx.rect(-7, -28, 6, 9); ctx.rect(1, -28, 6, 9); F(ctx, '#ffffff'); ctx.fill(); S(ctx, INK, 1.5); ctx.stroke();
      ctx.beginPath(); for (const sd of [-1, 1]) { ctx.moveTo(sd * 12, -34); ctx.lineTo(sd * 30, -38); ctx.moveTo(sd * 12, -31); ctx.lineTo(sd * 30, -29); } S(ctx, rgba(INK, 0.7), 1.4); ctx.stroke();
      if (gold) { const s = 11; tone(ctx, c => poly(c, [-s, -78, -s * 1.1, -92, -s * 0.4, -85, 0, -97, s * 0.4, -85, s * 1.1, -92, s, -78]), '#fff6c0', 0, -86, s, { ol: 1.5 }); }
    }
    ctx.restore();
  }
  /* SKEE-BALL. st: {t, board: {cx, cy, rings: [r...], cups: [{x, y, r}]}, lane:
     {x0, x1, y0, x2, x3, y1} (top edge x0..x1 at y0, bottom x2..x3 at y1), ball
     {x, y, r} | null, balls (left), thrown [scores], total, lit: {i: 0..1} (ring
     i, or 'c0' / 'c1' for the 100 cups), aim, pow, phase, swipe {x0, y0, x1, y1}}. */
  const SKEE_RING_COL = ['#3d2a63', '#5a2a63', '#7a2a5a', '#a02a50', '#d02a48'];
  const SKEE_DEF = { board: { cx: 270, cy: 322, rings: [108, 84, 62, 42, 22], cups: [{ x: 140, y: 196, r: 15 }, { x: 400, y: 196, r: 15 }] }, lane: { x0: 205, x1: 335, y0: 452, x2: 135, x3: 405, y1: 790 } };
  function arcSkee(ctx, st) {
    ctx.save();
    try {
      st = st || NOPET;
      const t = st.t || 0, B = st.board || SKEE_DEF.board, L = st.lane || SKEE_DEF.lane;
      const lit = st.lit || NOPET;
      // the target board
      ctx.beginPath(); rrect(ctx, 96, 166, 348, 272, 18); F(ctx, '#1a0d2e'); ctx.fill(); S(ctx, '#ffc94d', 3); ctx.stroke();
      const vals = [10, 20, 30, 40, 50];
      for (let i = 0; i < B.rings.length; i++) {
        const r = B.rings[i], L2 = lit[i] || 0;
        ctx.beginPath(); circ(ctx, B.cx, B.cy, r); F(ctx, L2 > 0 ? shade(PAL.gold, -0.2 + L2 * 0.2) : SKEE_RING_COL[i]); ctx.fill(); S(ctx, i === B.rings.length - 1 ? PAL.gold : '#ff9ec7', 2.5); ctx.stroke();
        if (L2 > 0) glow(ctx, B.cx, B.cy, r + 20, PAL.gold, L2 * 0.6);
        const ly = i === B.rings.length - 1 ? B.cy : B.cy + (r + B.rings[i + 1]) / 2;
        txt(ctx, String(vals[i]), B.cx, ly, i === B.rings.length - 1 ? 17 : 14, '#ffffff', true, 'center', INK);
      }
      ctx.beginPath(); circ(ctx, B.cx, B.cy, (B.rings[B.rings.length - 1] || 20) * 0.55); F(ctx, rgba(INK, 0.55)); ctx.fill();
      txt(ctx, '50', B.cx, B.cy, 17, '#ffffff', true, 'center', INK);
      for (let i = 0; i < (B.cups || []).length; i++) {
        const c = B.cups[i], L2 = lit['c' + i] || 0;
        const rb = ARC_RAINBOW[Math.floor(t * 8 + i * 2) % 5];
        glow(ctx, c.x, c.y, c.r * 2.2, rb, 0.35 + L2 * 0.6);
        ctx.beginPath(); circ(ctx, c.x, c.y, c.r); F(ctx, INK); ctx.fill(); S(ctx, rb, 3); ctx.stroke();
        txt(ctx, '100', c.x, c.y + c.r + 11, 12, rb, true, 'center', INK);
      }
      // the lane: planks in perspective, neon rails, the hop at the top
      ctx.beginPath(); poly(ctx, [L.x0, L.y0, L.x1, L.y0, L.x3, L.y1, L.x2, L.y1]); F(ctx, '#b07a3c'); ctx.fill();
      ctx.save(); ctx.clip();
      for (let i = 1; i < 6; i++) { const u = i / 6; ctx.beginPath(); ctx.moveTo(L.x0 + (L.x1 - L.x0) * u, L.y0); ctx.lineTo(L.x2 + (L.x3 - L.x2) * u, L.y1); S(ctx, rgba(INK, 0.22), 1.5); ctx.stroke(); }
      for (let i = 0; i < 7; i++) { const u = Math.pow(i / 7, 1.6), y = L.y0 + (L.y1 - L.y0) * u; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(540, y); S(ctx, rgba('#ffffff', 0.06), 2); ctx.stroke(); }
      ctx.restore();
      ctx.beginPath(); poly(ctx, [L.x0, L.y0, L.x1, L.y0, L.x3, L.y1, L.x2, L.y1]); S(ctx, INK, 3); ctx.stroke();
      const rc = ARC_RAINBOW[Math.floor(t * 4) % 5];
      limb(ctx, L.x0 - 6, L.y0, L.x2 - 12, L.y1, 5, rc); limb(ctx, L.x1 + 6, L.y0, L.x3 + 12, L.y1, 5, rc);
      tone(ctx, c => { c.moveTo(L.x0 - 4, L.y0 + 4); c.quadraticCurveTo((L.x0 + L.x1) / 2, L.y0 - 16, L.x1 + 4, L.y0 + 4); c.lineTo(L.x1 + 4, L.y0 + 12); c.lineTo(L.x0 - 4, L.y0 + 12); c.closePath(); }, '#8a5a2b', (L.x0 + L.x1) / 2, L.y0, 40, NOSPEC);
      // the aim guide while waiting for a roll
      if (st.phase === 'idle' && st.aim != null && st.balls > 0) {
        const ax = st.aim, bx = (L.x2 + L.x3) / 2;
        ctx.setLineDash([6, 8]); ctx.lineDashOffset = -t * 40;
        ctx.beginPath(); ctx.moveTo(bx, L.y1 - 30); ctx.lineTo(ax, L.y0 + 20); S(ctx, rgba(PAL.cyan, 0.75), 3); ctx.stroke(); ctx.setLineDash([]);
        const p = U.clamp(st.pow == null ? 0.5 : st.pow, 0, 1.2);
        ctx.beginPath(); rrect(ctx, 456, 470, 22, 280, 8); F(ctx, '#1d1233'); ctx.fill(); S(ctx, INK, 2); ctx.stroke();
        const ph = 276 * Math.min(1, p / 1.2);
        ctx.beginPath(); rrect(ctx, 458, 748 - ph, 18, ph, 6); F(ctx, p > 1 ? PAL.pink : p > 0.7 ? PAL.gold : PAL.lime); ctx.fill();
        txt(ctx, 'POWER', 467, 764, 10, '#b3a4d6', true, 'center');
      }
      if (st.swipe) { const w = st.swipe; ctx.beginPath(); ctx.moveTo(w.x0, w.y0); ctx.lineTo(w.x1, w.y1); S(ctx, rgba('#ffffff', 0.5), 6); ctx.stroke(); }
      // the ball
      if (st.ball) {
        const b = st.ball;
        if (!b.air) { ctx.beginPath(); ell(ctx, b.x, b.y + b.r * 0.7, b.r * 0.9, b.r * 0.3, 0); F(ctx, rgba(INK, 0.35)); ctx.fill(); }
        else {
          ctx.beginPath(); ell(ctx, b.x, (b.sy || b.y) + b.r, b.r * 0.8, b.r * 0.25, 0); F(ctx, rgba(INK, 0.25)); ctx.fill();
          // in the air: a speed streak under it
          ctx.beginPath(); ctx.moveTo(b.x, b.y + b.r); ctx.lineTo(b.x, b.y + b.r * 4); S(ctx, rgba('#ffffff', 0.35), b.r * 1.2); ctx.stroke();
        }
        tone(ctx, c => circ(c, b.x, b.y, b.r), '#f4ecd6', b.x, b.y, b.r, { ol: 1.6 });
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.72, (b.spin || 0), (b.spin || 0) + 1.2); S(ctx, PAL.blood, Math.max(1.2, b.r * 0.22)); ctx.stroke();
      }
      // the balls left in the return tray, and the frames of this game
      const n = st.balls | 0;
      for (let i = 0; i < 5; i++) { const x = 170 + i * 30, y = 808; tone(ctx, c => circ(c, x, y, 10), i < n ? '#f4ecd6' : '#3a2a4a', x, y, 10, { ol: 1.4, spec: i < n }); }
      const th = st.thrown || [];
      for (let i = 0; i < th.length; i++) txt(ctx, String(th[i]), 330 + i * 34, 808, 13, th[i] >= 100 ? PAL.pink : th[i] >= 40 ? PAL.gold : '#e8f4ff', true, 'center', INK);
      txt(ctx, 'TOTAL ' + (st.total | 0), 270, 190, 17, PAL.gold, true, 'center', INK);
    } catch (e) { /* never throws */ }
    ctx.restore();
  }
  // The round's tip pictures (RENDER.feelTipArt): a pet with hearts, the pet shop, a mole, the skee-ball lane.
  const PET_TIPS = { pet: 1, petshop: 1, moles: 1, skee: 1 };
  const PET_TIP_ST = { t: 0, lv: 1, mood: 'happy', moodK: 1, look: 0.4 };
  function petTipArt(ctx, id, r, t) {
    if (id === 'pet') {
      const k = PET_KEYS[Math.floor(t * 0.5) % PET_KEYS.length];
      PET_TIP_ST.t = t; PET_TIP_ST.lv = 1 + (Math.floor(t * 0.5) % 5);
      pet(ctx, k, 0, r * 0.62, r * 0.04, PET_TIP_ST);
    } else {
      ctx.save(); ctx.translate(0, r * 0.1); petIcon(ctx, id, r * 0.6, t); ctx.restore();
    }
  }
  const PETS_R = { COL: PET_COL, KEYS: PET_KEYS, SCARF: PET_SCARF, ART: PET_ART, tipArt: petTipArt, TIPS: PET_TIPS };
  /* ============================================================ end PETS */

  /* ============================================================ SECRET (round 6) */
  /* The secret act's look (DESIGN.md "Secret act (round 6)"): the golden
     key and its glint, the Back Room's biome (the inside of the machine:
     circuit-board catwalks over a dark void of gears, coin hoppers, cable
     runs and flickering service lights), its map and arena backdrops, The
     Machine itself (EA.machine, def.look 'machine': the claw cabinet as a
     boss), its face on the Rig (big bulb eyes in the marquee, the HP bar as
     the marquee's lights, a mouth in a giant coin slot), its cabinet events
     (the live rail, the steel shutter, zero g, the cracking glass, the light
     show per phase), the long power down, the hidden door and the true
     ending. Pure functions of their arguments (the game sets SECV.phase for
     the enemy art before it draws) and they never throw. */
  const SEC_COL = { key: '#ffc94d', cyan: '#2ee6d6', pink: '#ff2e88', red: '#ff3b3b', steel: '#8e98a8', board: '#123a30', trace: '#3ad6a0', amber: '#ffb347' };
  const SEC_PH = ['#2ee6d6', '#ff2e88', '#ff3b3b'];
  const SECV = { phase: 0, t: 0 };
  // the cabinet's warning sign in The Machine's colours (bossSign)
  Object.assign(SIG_COL, { machine: SEC_COL.cyan, secShut: SEC_COL.key, secZap: SEC_COL.cyan, secGrav: '#b08cff' });
  BIOME_PAL.machine = {
    low: '#1a3a32', high: '#2f5a4e',
    grass: '#1c3b33', grass2: '#12291f', flower: SEC_COL.amber,
    forest: '#1c3b33', tree: '#2f5a4e', tree2: '#12291f', trunk: '#0b1a15',
    dirt: '#1c3b33', dirt2: '#12291f', pebble: '#6b7686',
    sand: '#1c3b33', sand2: '#12291f', hill: '#24463d', hill2: '#12291f',
    mtn: '#3a4450', mtn2: '#1f252e', cap: '#8e98a8',
    sea: '#0b1512', deep: '#050a08', shallow: '#1c3b33', foam: '#3ad6a0', coast: '#050a08', hatch: '#12291f', ripple: '#3ad6a0',
    tint: 'rgba(46,230,214,0.05)', accent: 'machine', name: 'inside the machine',
  };
  // A four point twinkle with a soft glow (a golden key's glint in the dark).
  function secGlint(ctx, x, y, r, t, a) {
    ctx.save();
    try {
      const k = (0.72 + 0.28 * Math.sin(t * 3.1)) * (a == null ? 1 : a), rr = r * (0.85 + 0.3 * Math.sin(t * 5.3));
      glow(ctx, x, y, r * 2.2, SEC_COL.key, 0.6 * k);
      ctx.globalAlpha = U.clamp(k, 0, 1);
      ctx.translate(x, y); ctx.rotate(t * 0.4);
      ctx.beginPath(); star(ctx, 0, 0, rr, 4, 0.18); F(ctx, '#fff6c0'); ctx.fill();
      ctx.rotate(Math.PI / 4); ctx.beginPath(); star(ctx, 0, 0, rr * 0.55, 4, 0.2); F(ctx, SEC_COL.key); ctx.fill();
    } catch (e) { /* never throws */ }
    ctx.restore();
  }
  // The golden key (centred, about 40 x 20 at s 1). o: {rot, alpha, glow}.
  function secKey(ctx, x, y, s, t, o) {
    o = o || {};
    ctx.save();
    try {
      t = t || 0;
      ctx.translate(x || 0, y || 0); ctx.rotate(o.rot || 0); ctx.scale(s || 1, s || 1);
      if (o.alpha != null) ctx.globalAlpha = U.clamp(o.alpha, 0, 1);
      if (o.glow !== false) glow(ctx, 0, 0, 34, SEC_COL.key, 0.5 + Math.sin(t * 4) * 0.15);
      ctx.lineJoin = 'round';
      tone(ctx, c => { circ(c, -11, 0, 9.5); }, SEC_COL.key, -11, 0, 9.5, { dark: -0.35 });
      ctx.beginPath(); circ(ctx, -11, 0, 4); F(ctx, INK); ctx.fill();
      tone(ctx, c => rrect(c, -2, -3, 22, 6, 2), SEC_COL.key, 9, 0, 11, { dark: -0.35, spec: false });
      tone(ctx, c => { c.moveTo(12, 2); c.lineTo(12, 9); c.lineTo(15, 9); c.lineTo(15, 6); c.lineTo(18, 6); c.lineTo(18, 10); c.lineTo(20, 10); c.lineTo(20, 2); c.closePath(); }, SEC_COL.key, 16, 6, 4, NOSPEC);
      const tw = 0.5 + 0.5 * Math.sin(t * 6);
      ctx.globalAlpha *= tw;
      ctx.beginPath(); star(ctx, -16, -7, 5, 4, 0.2); F(ctx, '#ffffff'); ctx.fill();
    } catch (e) { /* never throws */ }
    ctx.restore();
  }
  // The Back Room's tiles: circuit-board catwalks, the void full of machinery.
  function secTerrain(ctx, x, y, size, tile, st) {
    ctx.save();
    try {
      tile = tile || {}; st = st || {};
      const r = size || 30, t = st.t || 0, flat = st.orient === 'v', seed = (st.seed || 0) >>> 0, P = BIOME_PAL.machine;
      const lw = Math.max(1, r * 0.05);
      ctx.translate(x || 0, y || 0);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); hexPath(ctx, 0, 0, r * 1.02, flat);
      const sea = (tile.terrain || 'land') === 'sea';
      F(ctx, sea ? P.sea : P.grass); ctx.fill();
      ctx.save(); ctx.beginPath(); hexPath(ctx, 0, 0, r * 1.02, flat); ctx.clip();
      const px = (j) => ((((seed >>> (j * 5)) & 31) / 31) - 0.5) * r * 0.8;
      const py = (j) => ((((seed >>> (j * 5 + 3)) & 31) / 31) - 0.5) * r * 0.7;
      if (sea) {
        const k = seed % 4, dir = (seed & 16) ? 1 : -1;
        if (k === 0) {
          gear(ctx, px(0) * 0.6, py(0) * 0.6, r * 0.5, 9, t * 0.5 * dir, '#39424e');
          gear(ctx, px(0) * 0.6 + r * 0.62, py(0) * 0.6 - r * 0.3, r * 0.3, 7, -t * 0.75 * dir, '#2c343e');
        } else if (k === 1) {
          // a coin hopper: a funnel of coins
          tone(ctx, c => { c.moveTo(-r * 0.5, -r * 0.35); c.lineTo(r * 0.5, -r * 0.35); c.lineTo(r * 0.14, r * 0.3); c.lineTo(-r * 0.14, r * 0.3); c.closePath(); }, '#3a4450', 0, -r * 0.05, r * 0.4, { dark: -0.4, spec: false, ol: lw });
          F(ctx, rgba(PAL.gold, 0.8));
          ctx.beginPath(); for (let i = 0; i < 5; i++) ell(ctx, -r * 0.3 + i * r * 0.15, -r * 0.34 - (i % 2) * r * 0.05, r * 0.08, r * 0.035, 0); ctx.fill();
          const drop = (t * 0.9 + (seed & 7) * 0.13) % 1;
          ctx.beginPath(); ell(ctx, 0, r * 0.3 + drop * r * 0.5, r * 0.05, r * 0.03, 0); ctx.fill();
        } else if (k === 2) {
          // a run of cables
          const cols = ['#ff2e88', '#2ee6d6', '#ffc94d'];
          for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-r, py(i) * 0.5 - r * 0.2 + i * r * 0.18); ctx.bezierCurveTo(-r * 0.3, py(i + 1) + r * 0.3, r * 0.3, py(i + 2) - r * 0.3, r, py(i) * 0.5 + i * r * 0.12); S(ctx, shade(cols[i], -0.45), Math.max(1.5, r * 0.09)); ctx.stroke(); }
        } else {
          // a caged service light, flickering
          const fl = Math.sin(t * 13 + seed) * Math.sin(t * 7.3 + seed * 0.3) > -0.55 ? 1 : 0.15;
          glow(ctx, px(1) * 0.5, py(1) * 0.5, r * 0.9, SEC_COL.amber, 0.35 * fl);
          tone(ctx, c => circ(c, px(1) * 0.5, py(1) * 0.5, r * 0.14), fl > 0.5 ? '#ffe2a6' : '#5a4a30', px(1) * 0.5, py(1) * 0.5, r * 0.14, NOSPEC);
          ctx.beginPath(); for (let i = -1; i <= 1; i++) { ctx.moveTo(px(1) * 0.5 + i * r * 0.1, py(1) * 0.5 - r * 0.16); ctx.lineTo(px(1) * 0.5 + i * r * 0.1, py(1) * 0.5 + r * 0.16); } S(ctx, '#39424e', lw); ctx.stroke();
        }
        F(ctx, 'rgba(0,0,0,0.25)'); ctx.fillRect(-r, -r, r * 2, r * 2);
      } else {
        // a circuit board plate: traces with pads, a chip on some, a pulse running along a trace
        S(ctx, rgba(SEC_COL.trace, 0.55), lw);
        ctx.beginPath();
        for (let i = 0; i < 3; i++) { const a = px(i), b = py(i); ctx.moveTo(-r, b); ctx.lineTo(a, b); ctx.lineTo(a + r * 0.25, b - r * 0.25); ctx.lineTo(r, b - r * 0.25); }
        ctx.stroke();
        F(ctx, rgba(SEC_COL.trace, 0.8));
        ctx.beginPath(); for (let i = 0; i < 3; i++) circ(ctx, px(i), py(i), r * 0.05); ctx.fill();
        if (seed & 2) {
          tone(ctx, c => rrect(c, px(3) * 0.4 - r * 0.2, py(3) * 0.4 - r * 0.14, r * 0.4, r * 0.28, 2), '#1b1f26', px(3) * 0.4, py(3) * 0.4, r * 0.2, { dark: -0.3, spec: false, ol: lw });
          S(ctx, '#8e98a8', Math.max(1, r * 0.03)); ctx.beginPath();
          for (let i = 0; i < 4; i++) { const cx = px(3) * 0.4 - r * 0.15 + i * r * 0.1, cy = py(3) * 0.4; ctx.moveTo(cx, cy - r * 0.14); ctx.lineTo(cx, cy - r * 0.2); ctx.moveTo(cx, cy + r * 0.14); ctx.lineTo(cx, cy + r * 0.2); }
          ctx.stroke();
        }
        const u = (t * 0.6 + (seed & 15) / 15) % 1, b0 = py(0);
        glow(ctx, -r + u * (px(0) + r), b0, r * 0.22, SEC_COL.trace, 0.9);
        // rivets and a steel rim
        F(ctx, '#6b7686'); ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = (flat ? 0 : -Math.PI / 2) + i * Math.PI / 3; circ(ctx, Math.cos(a) * r * 0.78, Math.sin(a) * r * 0.78, r * 0.04); } ctx.fill();
      }
      ctx.restore();
      ctx.beginPath(); hexPath(ctx, 0, 0, r * 0.99, flat); S(ctx, sea ? 'rgba(0,0,0,0.5)' : '#4a5664', sea ? 1 : lw * 1.4); ctx.stroke();
    } catch (e) { /* never throws */ }
    ctx.restore();
  }
  // The Back Room map's backdrop: a dark circuit board with service lights.
  function secMapBg(ctx, w, h, t) {
    ctx.save();
    try {
      w = w || 540; h = h || 960; t = t || 0;
      F(ctx, '#040b09'); ctx.fillRect(0, 0, w, h);
      S(ctx, 'rgba(58,214,160,0.13)', 2);
      ctx.beginPath();
      for (let i = 0; i < 14; i++) { const y = 40 + i * 68, x = (i * 97) % w; ctx.moveTo(0, y); ctx.lineTo(x, y); ctx.lineTo(x + 40, y + 40); ctx.lineTo(w, y + 40); }
      for (let i = 0; i < 8; i++) { const x = 30 + i * 70; ctx.moveTo(x, 0); ctx.lineTo(x, h); }
      ctx.stroke();
      for (let i = 0; i < 18; i++) {
        const x = (i * 131 + 40) % w, y = (i * 211 + 90) % h, u = (t * 0.35 + i * 0.17) % 1;
        glow(ctx, x, y, 14, SEC_COL.trace, 0.25 + 0.5 * Math.max(0, Math.sin(u * TAU)));
      }
      for (let i = 0; i < 5; i++) {
        const x = 60 + i * 105, y = 110 + (i % 2) * 720, fl = Math.sin(t * 9 + i * 2) * Math.sin(t * 4.1 + i) > -0.6 ? 1 : 0.1;
        glow(ctx, x, y, 90, SEC_COL.amber, 0.22 * fl);
      }
      gear(ctx, -30, 300, 110, 14, t * 0.08, '#0f1a17');
      gear(ctx, w + 20, 640, 130, 16, -t * 0.06, '#0f1a17');
    } catch (e) { /* never throws */ }
    ctx.restore();
  }
  // The arena of a Back Room fight: the machine's insides behind the fight
  // (big gears, a coin hopper pouring, cable runs, service lights). machine:
  // The Machine's own fight (its screen glows on the back wall per phase).
  function secArena(ctx, w, h, t, phase, machine, pd) {
    ctx.save();
    try {
      w = w || 540; t = t || 0; phase = phase | 0; pd = U.clamp(+pd || 0, 0, 1);
      const top = 70, floor = 318;
      const g = ctx.createLinearGradient(0, top, 0, floor);
      g.addColorStop(0, '#040b09'); g.addColorStop(1, '#0d1f1a');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, floor + 90);
      gear(ctx, 70, 150, 90, 12, t * 0.25, '#16261f');
      gear(ctx, 190, 110, 50, 9, -t * 0.45, '#1a2c25');
      gear(ctx, w - 60, 170, 110, 14, -t * 0.2, '#16261f');
      // the coin hopper, pouring
      tone(ctx, c => { c.moveTo(330, 80); c.lineTo(430, 80); c.lineTo(395, 150); c.lineTo(365, 150); c.closePath(); }, '#2c343e', 380, 110, 40, { dark: -0.35, spec: false });
      F(ctx, PAL.gold);
      for (let i = 0; i < 6; i++) { const u = (t * 1.3 + i / 6) % 1; ctx.beginPath(); ell(ctx, 380 + Math.sin(i * 2.1) * 6, 150 + u * (floor - 150), 5, 2.5, u * 3); ctx.fill(); }
      // cable runs
      const cols = ['#ff2e88', '#2ee6d6', '#ffc94d'];
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(0, 90 + i * 14); ctx.bezierCurveTo(160, 200 + i * 10, 330, 60 + i * 12, w, 130 + i * 16); S(ctx, shade(cols[i], -0.55), 6); ctx.stroke(); }
      if (machine) {
        // its glow floods the back wall in the phase's colour, scanlines over it
        const col = SEC_PH[Math.min(2, phase)];
        glow(ctx, w / 2, 190, 230, col, 0.35 + 0.1 * Math.sin(t * 2) + phase * 0.1);
        F(ctx, rgba('#000000', 0.18)); for (let y = top; y < floor; y += 6) ctx.fillRect(0, y, w, 2);
        if (phase >= 1) {
          ctx.save(); ctx.globalCompositeOperation = 'lighter';
          for (let i = 0; i < 2; i++) {
            const a = -Math.PI / 2 + Math.sin(t * (1.3 + i * 0.4) + i * 2) * 0.9, x0 = 150 + i * 240, y0 = 70;
            ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + Math.cos(a - 0.12) * 600, y0 - Math.sin(a - 0.12) * -600); ctx.lineTo(x0 + Math.cos(a + 0.12) * 600, y0 - Math.sin(a + 0.12) * -600); ctx.closePath();
            F(ctx, rgba(col, 0.09)); ctx.fill();
          }
          ctx.restore();
        }
      }
      // service lights along the ceiling
      for (let i = 0; i < 4; i++) {
        const x = 60 + i * 140, fl = Math.sin(t * 11 + i * 3) * Math.sin(t * 5.3 + i) > -0.5 ? 1 : 0.12;
        glow(ctx, x, top + 6, 70, SEC_COL.amber, 0.28 * fl);
        tone(ctx, c => rrect(c, x - 10, top - 2, 20, 8, 3), fl > 0.5 ? '#ffe2a6' : '#4a3a20', x, top + 2, 10, NOSPEC);
      }
      // the catwalk floor: steel grating
      F(ctx, '#1b232b'); ctx.fillRect(0, floor, w, 90);
      S(ctx, '#2c3640', 2); ctx.beginPath();
      for (let x = 0; x < w; x += 18) { ctx.moveTo(x, floor); ctx.lineTo(x - 30, floor + 90); }
      ctx.stroke();
      F(ctx, '#ffc94d'); for (let x = -((t * 20) % 40); x < w; x += 40) { ctx.beginPath(); ctx.moveTo(x, floor); ctx.lineTo(x + 20, floor); ctx.lineTo(x + 14, floor + 6); ctx.lineTo(x - 6, floor + 6); ctx.closePath(); ctx.fill(); }
      // the power down: the machine's insides go dark with it
      if (pd > 0) { F(ctx, rgba('#020106', pd * 0.88)); ctx.fillRect(0, 0, w, floor + 90); }
    } catch (e) { /* never throws */ }
    ctx.restore();
  }
  // The Machine: the claw cabinet itself as a boss (feet on the origin,
  // facing -x). Its bulb eyes and its coin slot mouth burn in the phase's
  // colour (SECV.phase); claw arms on cables sway either side.
  EA.machine = { w: 150, h: 196, draw(ctx, t, p) {
    const ph = Math.min(2, SECV.phase | 0), col = SEC_PH[ph], sw = Math.sin(t * 1.3) * 5, bob = Math.sin(t * 1.9) * 2;
    shadow(ctx, 150);
    // the cable arms and their claws (behind the body)
    for (const s of [-1, 1]) {
      const ax = s * 58, ay = -150 + bob, hx = s * (84 + sw * s), hy = -70 + Math.sin(t * 2 + s) * 8;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(s * 100, -150, hx, hy - 12); S(ctx, INK, 7); ctx.stroke(); S(ctx, '#39424e', 4); ctx.stroke();
      ctx.save(); ctx.translate(hx, hy); ctx.rotate(Math.sin(t * 2.4 + s) * 0.25);
      tone(ctx, c => rrect(c, -9, -14, 18, 12, 4), CHROME, 0, -8, 9, { dark: -0.35 });
      for (const d of [-1, 1]) tone(ctx, c => { c.moveTo(d * 4, -3); c.lineTo(d * 8, -3); c.quadraticCurveTo(d * 14, 8, d * 6, 18); c.lineTo(d * 4, 16); c.quadraticCurveTo(d * 8, 8, d * 4, -3); c.closePath(); }, CHROME, d * 8, 6, 8, { dark: -0.35, spec: false });
      ctx.restore();
    }
    // the cabinet body: a tall trapezoid with chrome trim and pink side art
    tone(ctx, c => { c.moveTo(-62, 0); c.lineTo(62, 0); c.lineTo(54, -152 + bob); c.lineTo(-54, -152 + bob); c.closePath(); }, '#241640', 0, -76, 60, { dark: -0.35 });
    ctx.beginPath(); for (let i = 0; i < 4; i++) { ctx.moveTo(-60 + i * 7, -10); ctx.lineTo(-52 + i * 7, -140 + bob); ctx.moveTo(60 - i * 7, -10); ctx.lineTo(52 - i * 7, -140 + bob); } S(ctx, rgba(p.b, 0.5), 2.5); ctx.stroke();
    // the glass window with a little claw inside (cracked in the meltdown)
    ctx.beginPath(); rrect(ctx, -40, -134 + bob, 80, 70, 6); F(ctx, rgba(col, 0.16)); ctx.fill(); S(ctx, INK, 3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -134 + bob); ctx.lineTo(0, -112 + bob + Math.sin(t * 2) * 5); S(ctx, CHROME, 1.5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-6, -104 + bob); ctx.lineTo(0, -112 + bob); ctx.lineTo(6, -104 + bob); S(ctx, CHROME, 2.5); ctx.stroke();
    F(ctx, rgba('#ffffff', 0.18)); ctx.beginPath(); ctx.moveTo(-34, -130 + bob); ctx.lineTo(-20, -130 + bob); ctx.lineTo(-36, -76 + bob); ctx.closePath(); ctx.fill();
    if (ph >= 2) { ctx.beginPath(); ctx.moveTo(-30, -126 + bob); ctx.lineTo(-8, -100 + bob); ctx.lineTo(12, -118 + bob); ctx.moveTo(-8, -100 + bob); ctx.lineTo(-2, -72 + bob); ctx.moveTo(-8, -100 + bob); ctx.lineTo(30, -84 + bob); S(ctx, rgba('#ffffff', 0.85), 1.5); ctx.stroke(); }
    // the coin slot mouth: chrome lips, teeth, the phase's glow inside
    const open = 5 + (0.5 + 0.5 * Math.sin(t * 3.2)) * 7 + ph * 2;
    tone(ctx, c => rrect(c, -34, -52 - open / 2, 68, open + 12, 7), CHROME, 0, -46, 34, { dark: -0.35 });
    ctx.beginPath(); rrect(ctx, -28, -46 - open / 2, 56, open, 4); F(ctx, '#0a0414'); ctx.fill();
    glow(ctx, 0, -46, 30, col, 0.5);
    F(ctx, '#f4f8ff'); ctx.beginPath();
    for (let i = 0; i < 6; i++) { const x = -24 + i * 9.6; ctx.moveTo(x, -46 - open / 2); ctx.lineTo(x + 7, -46 - open / 2); ctx.lineTo(x + 3.5, -46 - open / 2 + 5); ctx.closePath(); ctx.moveTo(x, -46 + open / 2); ctx.lineTo(x + 7, -46 + open / 2); ctx.lineTo(x + 3.5, -46 + open / 2 - 5); ctx.closePath(); }
    ctx.fill();
    // overclocked: exhaust vents on its flanks spit steam and sparks
    if (ph >= 1) {
      for (const s of [-1, 1]) {
        const vx = s * 50, vy = -96 + bob;
        ctx.beginPath(); rrect(ctx, vx - 6, vy - 14, 12, 28, 3); F(ctx, '#0a0414'); ctx.fill(); S(ctx, INK, 2); ctx.stroke();
        glow(ctx, vx, vy, 18, col, 0.6 + 0.3 * Math.sin(t * 9 + s));
        for (let i = 0; i < 3; i++) { const u = (t * 1.6 + i / 3 + (s > 0 ? 0.5 : 0)) % 1; ctx.beginPath(); circ(ctx, vx + s * (8 + u * 26), vy - 6 + i * 6 - u * 18, 2 + u * 6); F(ctx, rgba('#e8e8f0', 0.45 * (1 - u))); ctx.fill(); }
      }
      if (ph >= 2) { S(ctx, '#ffe066', 2); ctx.beginPath(); for (let i = 0; i < 4; i++) { const a = t * 11 + i * 1.7, r0 = 58 + (i % 2) * 8; ctx.moveTo(Math.cos(a) * r0 * 0.5, -120 + Math.sin(a) * 20); ctx.lineTo(Math.cos(a) * r0 * 0.5 + 6, -126 + Math.sin(a) * 20); } ctx.stroke(); }
    }
    // the prize door at the foot
    ctx.beginPath(); rrect(ctx, -22, -24, 44, 18, 4); F(ctx, '#0a0414'); ctx.fill(); S(ctx, INK, 2.5); ctx.stroke();
    txt(ctx, 'PRIZE', 0, -15, 9, rgba(PAL.gold, 0.8 + 0.2 * Math.sin(t * 4)), true);
    // the marquee head: bulbs all round, two big bulb eyes
    tone(ctx, c => rrect(c, -64, -196 + bob, 128, 46, 10), '#1a0f2e', 0, -173, 60, { dark: -0.3 });
    for (let i = 0; i < 16; i++) {
      const u = i / 15, x = -58 + u * 116, on = ((i + Math.floor(t * (6 + ph * 4))) % 3) === 0;
      ctx.beginPath(); circ(ctx, x, -193 + bob, 2.6); circ(ctx, x, -153 + bob, 2.6); F(ctx, on ? '#fff6c0' : shade(col, -0.35)); ctx.fill();
    }
    for (const s of [-1, 1]) {
      const ex = s * 26, ey = -173 + bob, lk = -0.35;
      glow(ctx, ex, ey, 30, col, 0.7);
      ctx.beginPath(); circ(ctx, ex, ey, 15); F(ctx, INK); ctx.fill();
      for (let i = 0; i < 10; i++) { const a = i / 10 * TAU + t * (ph ? 2 : 0.6) * s; ctx.beginPath(); circ(ctx, ex + Math.cos(a) * 12, ey + Math.sin(a) * 12, 2.3); F(ctx, i % 2 ? col : '#fff6c0'); ctx.fill(); }
      tone(ctx, c => circ(c, ex + lk * 5, ey + 1, 6.5), col, ex + lk * 5, ey + 1, 6.5, NOSPEC);
      ctx.beginPath(); circ(ctx, ex + lk * 6, ey + 1, 2.6); F(ctx, '#ffffff'); ctx.fill();
      // the brow: level, then angry, then furious
      const tilt = [0.1, 0.35, 0.55][ph];
      ctx.beginPath(); ctx.moveTo(ex - 16, ey - 16 - s * tilt * 10); ctx.lineTo(ex + 16, ey - 16 + s * tilt * 10); S(ctx, INK, 5); ctx.stroke();
    }
  } };
  // The Machine's face on the Rig (drawn over the cabinet front): two big
  // bulb eyes in the marquee that follow the claw, the HP bar as the
  // marquee's lights (a bulb per 1/24 of its hp, going dark as it drops),
  // a mouth in a giant coin slot on the bottom rail that bites on its
  // attacks. c: {x, y, w, h, frame}; st: {t, phase, hpk, atk, hurt, look, blink, pd (power down 0..1)}.
  const SEC_BULBS = 24;
  function secFace(ctx, c, st) {
    ctx.save();
    try {
      st = st || {};
      const t = st.t || 0, ph = Math.min(2, st.phase | 0), pd = U.clamp(st.pd || 0, 0, 1), live = 1 - pd;
      const col = SEC_PH[ph], fr = c.frame || 30, top = c.y - fr, my = c.y - fr / 2;
      const flick = pd > 0 ? (Math.sin(t * 37) * Math.sin(t * 23) > 0.2 - pd * 0.8 ? 1 : 0.25) : 1;
      // the marquee lights: the HP bar
      const n = SEC_BULBS, lit = Math.ceil(U.clamp(st.hpk == null ? 1 : st.hpk, 0, 1) * n - 1e-6);
      const ex0 = c.x + c.w * 0.17, ex1 = c.x + c.w * 0.83, er = 22;   // wide apart: the cabinet's warning sign hangs between them
      for (let i = 0; i < n; i++) {
        const x = c.x + 8 + (i + 0.5) * (c.w - 16) / n;
        if (Math.abs(x - ex0) < er + 6 || Math.abs(x - ex1) < er + 6) continue;
        const on = i < lit && pd < 1 - i / n;
        ctx.beginPath(); circ(ctx, x, top + 5, 3.4);
        F(ctx, on ? (ph === 1 && (i + Math.floor(t * 12)) % 4 === 0 ? '#ffffff' : col) : '#1d1233'); ctx.fill();
        S(ctx, INK, 1); ctx.stroke();
        if (on) glow(ctx, x, top + 5, 9, col, 0.55 * flick);
      }
      // the eyes
      const look = U.clamp(st.look || 0, -1, 1), blink = U.clamp(st.blink || 0, 0, 1), hurt = U.clamp(st.hurt || 0, 0, 1);
      for (const ex of [ex0, ex1]) {
        const ey = my + 1;
        if (live > 0.02) glow(ctx, ex, ey, er * 2.4, col, 0.55 * live * flick + hurt * 0.4);
        ctx.beginPath(); circ(ctx, ex, ey, er + 4); F(ctx, INK); ctx.fill(); S(ctx, CHROME, 2); ctx.stroke();
        for (let i = 0; i < 12; i++) {
          const a = i / 12 * TAU + t * (ph ? 1.6 : 0.5), on = live > 0.02 && ((i + Math.floor(t * (4 + ph * 5))) % 2 === 0 || ph === 2);
          ctx.beginPath(); circ(ctx, ex + Math.cos(a) * er, ey + Math.sin(a) * er, 2.6);
          F(ctx, on ? (i % 3 ? col : '#fff6c0') : '#2a1f40'); ctx.fill();
        }
        const pr = er * (0.46 - hurt * 0.12) * (0.4 + live * 0.6);
        tone(ctx, q => circ(q, ex + look * 7, ey + 2, pr), live > 0.05 ? col : '#2a1f40', ex + look * 7, ey + 2, pr, NOSPEC);
        if (live > 0.05) { ctx.beginPath(); circ(ctx, ex + look * 8 - 2, ey, pr * 0.35); F(ctx, '#ffffff'); ctx.fill(); }
        // the lid: blinks, droops shut as it powers down
        const shut = Math.max(blink, pd * 0.95);
        if (shut > 0.02) { ctx.beginPath(); ctx.rect(ex - er - 5, ey - er - 5, (er + 5) * 2, (er + 5) * 2 * shut); ctx.save(); ctx.beginPath(); circ(ctx, ex, ey, er + 4); ctx.clip(); F(ctx, '#140b24'); ctx.fillRect(ex - er - 5, ey - er - 5, (er + 5) * 2, (er + 5) * 2 * shut); ctx.restore(); }
        // the brow over each eye: level, angry, furious
        const s = ex < c.x + c.w / 2 ? 1 : -1, tilt = [0.12, 0.3, 0.5][ph] * live;
        ctx.beginPath(); ctx.moveTo(ex - er, ey - er - 5 - s * tilt * 14); ctx.lineTo(ex + er, ey - er - 5 + s * tilt * 14); S(ctx, INK, 6); ctx.stroke(); S(ctx, rgba(col, 0.6 * live), 2); ctx.stroke();
      }
      // the mouth: a giant coin slot on the bottom rail
      const mx = c.x + c.w / 2, mY = c.y + c.h + fr / 2, open = (4 + U.clamp(st.atk || 0, 0, 1) * 14 + (ph === 2 ? Math.abs(Math.sin(t * 9)) * 3 : 0)) * (1 - pd * 0.8);
      tone(ctx, q => rrect(q, mx - 62, mY - open / 2 - 7, 124, open + 14, 8), CHROME, mx, mY, 60, { dark: -0.4 });
      ctx.beginPath(); rrect(ctx, mx - 54, mY - open / 2, 108, open, 4); F(ctx, '#07030f'); ctx.fill();
      if (live > 0.05) glow(ctx, mx, mY, 44, col, 0.5 * live * flick);
      F(ctx, '#f4f8ff'); ctx.beginPath();
      for (let i = 0; i < 9; i++) {
        const x = mx - 50 + i * 11.2, th = Math.min(5, open * 0.45);
        ctx.moveTo(x, mY - open / 2); ctx.lineTo(x + 8, mY - open / 2); ctx.lineTo(x + 4, mY - open / 2 + th); ctx.closePath();
        ctx.moveTo(x + 2, mY + open / 2); ctx.lineTo(x + 10, mY + open / 2); ctx.lineTo(x + 6, mY + open / 2 - th); ctx.closePath();
      }
      ctx.fill();
      // a bite: chomp lines burst off the lips
      const atk = U.clamp(st.atk || 0, 0, 1);
      if (atk > 0.2 && live > 0.05) {
        glow(ctx, mx, mY, 70, col, atk * 0.8);
        ctx.beginPath();
        for (const s of [-1, 1]) for (let i = 0; i < 3; i++) { const a = (i - 1) * 0.45; ctx.moveTo(mx + s * (70 + i * 2), mY + a * 20); ctx.lineTo(mx + s * (86 + atk * 12), mY + a * 30); }
        S(ctx, rgba('#ffffff', atk), 3); ctx.stroke();
      }
    } catch (e) { /* never throws */ }
    ctx.restore();
  }
  // The Machine's cabinet events and light show over the Rig. c: {x, y, w,
  // h, frame, chuteX, chuteW, dividerTop}; st: {t, phase, rail, hx, shut
  // {hp, max, k}, grav, crack, seed, pd, flash}; layer 'back' (inside the
  // glass, under the pile) or 'front' (over it).
  function secCab(ctx, c, st, layer) {
    ctx.save();
    try {
      st = st || {};
      const t = st.t || 0, ph = Math.min(2, st.phase | 0), col = SEC_PH[ph];
      if (layer === 'back') {
        ctx.beginPath(); ctx.rect(c.x, c.y, c.w, c.h); ctx.clip();
        if (st.grav > 0.01) {
          // zero g: motes and chevrons drift up the back panel
          ctx.globalAlpha = U.clamp(st.grav, 0, 1);
          F(ctx, rgba(SEC_COL.cyan, 0.5));
          for (let i = 0; i < 26; i++) { const x = c.x + ((i * 83) % c.w), y = c.y + c.h - ((t * (40 + (i % 5) * 12) + i * 57) % c.h); ctx.beginPath(); circ(ctx, x, y, 1.6 + (i % 3)); ctx.fill(); }
          S(ctx, rgba(SEC_COL.cyan, 0.22), 3); ctx.beginPath();
          for (let i = 0; i < 5; i++) { const x = c.x + 50 + i * 90, y = c.y + c.h - ((t * 60 + i * 70) % (c.h - 40)); ctx.moveTo(x - 12, y + 8); ctx.lineTo(x, y - 4); ctx.lineTo(x + 12, y + 8); }
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
        if (ph >= 1) {
          // the light show: beams sweep the glass from the eyes
          ctx.globalCompositeOperation = 'lighter';
          for (let i = 0; i < 2; i++) {
            const x0 = c.x + c.w * (0.3 + i * 0.4), a = Math.PI / 2 + Math.sin(t * (1.1 + i * 0.35) + i * 1.7) * 0.7;
            ctx.beginPath(); ctx.moveTo(x0, c.y - 10); ctx.lineTo(x0 + Math.cos(a - 0.13) * 520, c.y + Math.sin(a - 0.13) * 520); ctx.lineTo(x0 + Math.cos(a + 0.13) * 520, c.y + Math.sin(a + 0.13) * 520); ctx.closePath();
            F(ctx, rgba(col, ph === 2 ? 0.1 : 0.07)); ctx.fill();
          }
        }
      } else {
        // the live rail: arcs crawl along it, a spark shower at the carriage
        if (st.rail > 0.01) {
          const y = c.y + 26, x0 = c.x + 8, x1 = c.x + (c.chuteX || c.w - 64) + (c.chuteW || 64) - 8;
          ctx.globalCompositeOperation = 'lighter';
          for (let k = 0; k < 2; k++) {
            ctx.beginPath(); ctx.moveTo(x0, y);
            for (let x = x0; x <= x1; x += 14) ctx.lineTo(x, y + Math.sin(x * 0.7 + t * 60 + k * 9) * Math.sin(t * 31 + x) * 7);
            S(ctx, rgba(k ? '#ffffff' : SEC_COL.cyan, 0.75 * st.rail), k ? 1.4 : 3.5); ctx.stroke();
          }
          if (st.hx != null) glow(ctx, c.x + st.hx, y, 30 + Math.sin(t * 40) * 6, SEC_COL.cyan, 0.8 * st.rail);
          ctx.globalCompositeOperation = 'source-over';
          txt(ctx, 'LIVE RAIL', c.x + 60, y + 16, 11, rgba(SEC_COL.cyan, 0.9 * st.rail), true, 'center', INK);
        }
        // the shutter over the chute mouth: steel slats, dents, hazard stripes
        const sh = st.shut;
        if (sh && sh.k > 0.01) {
          const x0 = c.x + (c.chuteX || c.w - 64) - 4, w = c.x + c.w + 2 - x0, dt = c.y + (c.dividerTop || 214);
          const h = 46 * U.clamp(sh.k, 0, 1), y0 = dt - 46;
          ctx.save(); ctx.beginPath(); ctx.rect(x0, y0, w, h + 2); ctx.clip();
          tone(ctx, q => rrect(q, x0, y0, w, h, 3), '#6b7686', x0 + w / 2, y0 + h / 2, w / 2, { dark: -0.35, spec: false });
          S(ctx, rgba(INK, 0.6), 2); ctx.beginPath(); for (let y = y0 + 9; y < y0 + h; y += 9) { ctx.moveTo(x0 + 2, y); ctx.lineTo(x0 + w - 2, y); } ctx.stroke();
          const dents = Math.max(0, (sh.max || 2) - (sh.hp || 0));
          for (let i = 0; i < dents; i++) { const dx = x0 + w * (0.3 + i * 0.35), dy = y0 + h * 0.5; ctx.beginPath(); ell(ctx, dx, dy, 9, 6, 0.3); F(ctx, rgba(INK, 0.45)); ctx.fill(); S(ctx, '#c9d3e0', 1.5); ctx.stroke(); }
          ctx.restore();
          ctx.save(); ctx.beginPath(); ctx.rect(x0, y0 + h - 7, w, 7); ctx.clip();
          F(ctx, '#ffc94d'); ctx.fillRect(x0, y0 + h - 7, w, 7);
          F(ctx, INK); for (let x = x0 - 10; x < x0 + w; x += 12) { ctx.beginPath(); ctx.moveTo(x, y0 + h); ctx.lineTo(x + 6, y0 + h - 7); ctx.lineTo(x + 12, y0 + h - 7); ctx.lineTo(x + 6, y0 + h); ctx.closePath(); ctx.fill(); }
          ctx.restore();
          if (sh.k > 0.9) txt(ctx, 'HEAVY ONLY', x0 + w / 2, y0 - 9, 10, '#ffc94d', true, 'center', INK);
        }
        // the cracking glass (the meltdown): impact stars that spread with st.crack
        const ck = U.clamp(st.crack || 0, 0, 1);
        if (ck > 0.01) {
          const seed = (st.seed || 7) >>> 0, pts = 2 + Math.round(ck * 4);
          ctx.save();
          ctx.beginPath(); ctx.rect(c.x, c.y, c.w, c.h); ctx.clip();
          for (let i = 0; i < pts; i++) {
            const hx = c.x + 40 + (((seed * (i + 3) * 2654435761) >>> 8) % 1000) / 1000 * (c.w - 80);
            const hy = c.y + 30 + (((seed * (i + 7) * 40503) >>> 6) % 1000) / 1000 * (c.h - 120);
            const R = (40 + ck * 130) * (0.6 + (i % 3) * 0.2), rays = 6 + (i % 3);
            ctx.beginPath();
            for (let k = 0; k < rays; k++) {
              const a = k / rays * TAU + i, r1 = R * (0.55 + ((k * 37 + i * 11) % 10) / 22);
              ctx.moveTo(hx, hy); ctx.lineTo(hx + Math.cos(a) * r1 * 0.5, hy + Math.sin(a) * r1 * 0.5 + 4); ctx.lineTo(hx + Math.cos(a + 0.08) * r1, hy + Math.sin(a + 0.08) * r1);
            }
            if (ck > 0.4) for (let ring = 1; ring <= 2; ring++) { const rr = R * 0.22 * ring; ctx.moveTo(hx + rr, hy); for (let k = 1; k <= rays; k++) { const a = k / rays * TAU; ctx.lineTo(hx + Math.cos(a) * rr * (0.85 + (k % 2) * 0.2), hy + Math.sin(a) * rr); } }
            S(ctx, 'rgba(10,4,20,0.35)', 3); ctx.stroke();
            S(ctx, 'rgba(235,245,255,0.8)', 1.3); ctx.stroke();
            glow(ctx, hx, hy, 14, '#ffffff', 0.5);
          }
          ctx.restore();
        }
        // the meltdown: sparks rain from the top frame
        if (ph === 2 && !(st.pd > 0.6)) {
          F(ctx, '#ffe066');
          for (let i = 0; i < 14; i++) {
            const u = (t * 0.9 + i * 0.137) % 1, x = c.x + ((i * 97) % c.w), y = c.y - 10 + u * u * 220;
            ctx.beginPath(); circ(ctx, x + Math.sin(i + t) * 6, y, 2 - u); ctx.fill();
          }
        }
        // the power down: the cabinet goes dark, the tube collapses to a line, then a dot
        const pd = U.clamp(st.pd || 0, 0, 1);
        if (pd > 0) {
          ctx.globalCompositeOperation = 'source-over';
          F(ctx, rgba('#05020b', Math.min(0.92, pd * 1.1))); ctx.fillRect(c.x - (c.frame || 30), c.y - (c.frame || 30), c.w + 2 * (c.frame || 30), c.h + 2 * (c.frame || 30));
          if (pd > 0.72) {
            const u = (pd - 0.72) / 0.28, cx = c.x + c.w / 2, cy = c.y + c.h / 2;
            const lw = c.w * Math.max(0.02, 1 - u * 1.4), lh = Math.max(2, 10 * (1 - u));
            ctx.globalCompositeOperation = 'lighter';
            if (u < 0.95) { glow(ctx, cx, cy, Math.max(20, lw * 0.35), '#bfe8ff', 0.9 * (1 - u)); F(ctx, rgba('#e8fbff', 1 - u * 0.7)); ctx.fillRect(cx - lw / 2, cy - lh / 2, lw, lh); }
          }
        }
      }
    } catch (e) { /* never throws */ }
    ctx.restore();
  }
  /* The hidden door (the full screen after the Prize Master falls): the dead
     arcade, the back wall's STAFF ONLY panel with three keyholes; the keys
     fly in and turn (st.keys 0..3, fractional while one flies), the door
     splits open (st.open 0..1) and light pours out of the machine. */
  function secDoor(ctx, w, h, st) {
    ctx.save();
    try {
      st = st || {};
      w = w || 540; h = h || 960;
      const t = st.t || 0, keys = U.clamp(st.keys || 0, 0, 3), open = U.clamp(st.open || 0, 0, 1);
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#0a0616'); g.addColorStop(1, '#16092a');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      // cables sag from the dark ceiling; a dying neon sign over the door
      const cols = ['#ff2e88', '#2ee6d6', '#ffc94d', '#6a4a9a'];
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-10, 80 + i * 26); ctx.quadraticCurveTo(w / 2, 170 + i * 34 + Math.sin(t * 0.7 + i) * 4, w + 10, 70 + i * 22); S(ctx, shade(cols[i], -0.55), 5); ctx.stroke(); }
      const fl = Math.sin(t * 17) * Math.sin(t * 5.3) > -0.6 ? 1 : 0.2;
      glow(ctx, w / 2, 212, 150, PAL.pink, 0.3 * fl);
      txt(ctx, 'NO PLAYERS BEYOND', w / 2, 200, 22, fl > 0.5 ? '#ffd0e6' : '#5a2a44', true, 'center', PAL.pink);
      txt(ctx, 'THIS POINT', w / 2, 228, 22, fl > 0.5 ? '#ffd0e6' : '#5a2a44', true, 'center', PAL.pink);
      // dead cabinets either side
      for (let i = 0; i < 3; i++) { deadCabinet(ctx, 12 + i * 34, 430 + i * 30, 70, 200, false, t); deadCabinet(ctx, w - 82 - i * 34, 430 + i * 30, 70, 200, i === 1 && Math.sin(t * 7) > 0.6, t); }
      // the floor
      F(ctx, '#0d0718'); ctx.fillRect(0, 700, w, h - 700);
      S(ctx, 'rgba(255,255,255,0.04)', 2); ctx.beginPath(); for (let i = -8; i < 9; i++) { ctx.moveTo(w / 2 + i * 20, 700); ctx.lineTo(w / 2 + i * 120, h); } ctx.stroke();
      // the doorway: light pours out as it opens
      const dx = w / 2, dy = 420, dw = 220, dh = 300;
      if (open > 0) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const lg = ctx.createLinearGradient(0, dy - dh / 2, 0, h);
        lg.addColorStop(0, rgba(SEC_COL.cyan, 0.35 * open)); lg.addColorStop(1, rgba(SEC_COL.cyan, 0));
        ctx.fillStyle = lg;
        ctx.beginPath(); ctx.moveTo(dx - dw / 2 * open, dy - dh / 2); ctx.lineTo(dx + dw / 2 * open, dy - dh / 2); ctx.lineTo(dx + dw * 1.3 * open, h); ctx.lineTo(dx - dw * 1.3 * open, h); ctx.closePath(); ctx.fill();
        ctx.restore();
        // the machine's insides behind the door
        ctx.save(); ctx.beginPath(); ctx.rect(dx - dw / 2, dy - dh / 2, dw, dh); ctx.clip();
        F(ctx, '#06231c'); ctx.fillRect(dx - dw / 2, dy - dh / 2, dw, dh);
        gear(ctx, dx - 50, dy - 60, 70, 12, t * 0.6, '#1f4a3e'); gear(ctx, dx + 60, dy + 40, 55, 10, -t * 0.8, '#1f4a3e');
        glow(ctx, dx, dy, 160, SEC_COL.cyan, 0.6 * open);
        S(ctx, rgba(SEC_COL.trace, 0.6), 2); ctx.beginPath(); for (let i = 0; i < 6; i++) { ctx.moveTo(dx - dw / 2, dy - 120 + i * 45); ctx.lineTo(dx - 20 + i * 8, dy - 120 + i * 45); ctx.lineTo(dx + 10 + i * 8, dy - 90 + i * 45); ctx.lineTo(dx + dw / 2, dy - 90 + i * 45); } ctx.stroke();
        ctx.restore();
      }
      // the two door halves slide apart
      for (const s of [-1, 1]) {
        const hw = dw / 2, off = open * hw * 1.02;
        const x0 = s < 0 ? dx - hw - off : dx + off;
        ctx.save(); ctx.beginPath(); ctx.rect(dx - dw / 2 - 4, dy - dh / 2 - 4, dw + 8, dh + 8); ctx.clip();
        tone(ctx, q => rrect(q, x0, dy - dh / 2, hw, dh, 4), '#3a4450', x0 + hw / 2, dy, hw / 2, { dark: -0.35, spec: false });
        S(ctx, rgba(INK, 0.5), 2); ctx.beginPath(); for (let y = dy - dh / 2 + 30; y < dy + dh / 2; y += 30) { ctx.moveTo(x0 + 6, y); ctx.lineTo(x0 + hw - 6, y); } ctx.stroke();
        ctx.restore();
      }
      // the frame, the stencil and the keyholes
      ctx.beginPath(); rrect(ctx, dx - dw / 2 - 12, dy - dh / 2 - 12, dw + 24, dh + 24, 8); S(ctx, '#1b232b', 14); ctx.stroke(); S(ctx, '#ffc94d', 2); ctx.stroke();
      if (open < 0.2) txt(ctx, 'STAFF ONLY', dx, dy - dh / 2 + 34, 22, rgba('#ffc94d', 0.85 * (1 - open * 5)), true, 'center', INK);
      // (the keyholes ride the door halves apart and fade as it opens)
      const hk = 1 - U.clamp(open * 1.6, 0, 1);
      for (let i = 0; i < 3 && hk > 0.01; i++) {
        const kx = dx - 60 + i * 60 + (i - 1) * open * 120, ky = dy + 40, has = keys >= i + 1, fly = keys > i && keys < i + 1 ? keys - i : 0;
        ctx.save(); ctx.globalAlpha = hk;
        ctx.beginPath(); circ(ctx, kx, ky, 18); F(ctx, '#140b24'); ctx.fill(); S(ctx, has ? '#ffc94d' : '#5a4a30', 3); ctx.stroke();
        glow(ctx, kx, ky, 34, SEC_COL.key, has ? 0.9 : 0.25 + 0.15 * Math.sin(t * 3 + i));
        ctx.beginPath(); circ(ctx, kx, ky - 4, 5); ctx.moveTo(kx - 3, ky); ctx.lineTo(kx + 3, ky); ctx.lineTo(kx + 4, ky + 10); ctx.lineTo(kx - 4, ky + 10); ctx.closePath(); F(ctx, INK); ctx.fill();
        if (has) secKey(ctx, kx + 8, ky, 0.8, t, { rot: Math.PI / 2, glow: false, alpha: hk });
        else if (fly > 0) { const u = U.ease.outCubic(fly); secKey(ctx, U.lerp(w / 2, kx + 6, u), U.lerp(h - 120, ky, u), 1.4 - u * 0.6, t, { rot: (1 - u) * 5 }); }
        ctx.restore();
      }
      // dust motes in the light
      F(ctx, rgba('#e8fbff', 0.5 * open));
      for (let i = 0; i < 30; i++) { const x = dx + Math.sin(i * 12.9 + t * 0.3) * 200 * open, y = dy + ((i * 71 + t * 20) % 420) - 140; ctx.beginPath(); circ(ctx, x, y, 1.4); ctx.fill(); }
    } catch (e) { /* never throws */ }
    ctx.restore();
  }
  /* The true ending: dawn over the Clawspire, the crawler walking out of the
     arcade into daylight. st: {t, dawn 0..1, walk 0..1, charId}. */
  function secEnding(ctx, w, h, st) {
    ctx.save();
    try {
      st = st || {};
      w = w || 540; h = h || 960;
      const t = st.t || 0, dawn = U.clamp(st.dawn == null ? 1 : st.dawn, 0, 1), walk = U.clamp(st.walk || 0, 0, 1);
      const g = ctx.createLinearGradient(0, 0, 0, h * 0.62);
      g.addColorStop(0, dawn > 0.5 ? '#3a5aa8' : '#140b2e');
      g.addColorStop(0.55, dawn > 0.3 ? '#ff9ec7' : '#3a1a4a');
      g.addColorStop(1, dawn > 0.15 ? '#ffd27a' : '#5a2a3a');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      // the sun rising behind the tower
      const sy = h * 0.6 - dawn * 190;
      glow(ctx, w * 0.62, sy, 260, '#ffe08a', 0.9 * dawn);
      tone(ctx, q => circ(q, w * 0.62, sy, 58), '#fff2c0', w * 0.62, sy, 58, { ol: 0, spec: false, dark: -0.05 });
      // the Clawspire: a dark tower of cabinets, its lights going out
      F(ctx, '#2a1838');
      ctx.beginPath(); ctx.moveTo(w * 0.22, h * 0.6); ctx.lineTo(w * 0.27, h * 0.2); ctx.lineTo(w * 0.33, h * 0.14); ctx.lineTo(w * 0.39, h * 0.2); ctx.lineTo(w * 0.44, h * 0.6); ctx.closePath(); ctx.fill();
      for (let i = 0; i < 12; i++) { const on = (i * 7) % 12 > dawn * 12; ctx.beginPath(); ctx.rect(w * 0.285 + (i % 3) * 18, h * 0.24 + Math.floor(i / 3) * 60, 8, 12); F(ctx, on ? '#ff2e88' : '#3a2448'); ctx.fill(); }
      // the hills and the path into the light
      F(ctx, '#4a7a5a'); ctx.beginPath(); ctx.moveTo(0, h * 0.62); ctx.quadraticCurveTo(w * 0.3, h * 0.55, w * 0.55, h * 0.61); ctx.quadraticCurveTo(w * 0.8, h * 0.66, w, h * 0.58); ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath(); ctx.fill();
      F(ctx, '#3a6048'); ctx.beginPath(); ctx.moveTo(0, h * 0.72); ctx.quadraticCurveTo(w * 0.5, h * 0.66, w, h * 0.74); ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath(); ctx.fill();
      F(ctx, '#e8c890'); ctx.beginPath(); ctx.moveTo(w * 0.08, h); ctx.quadraticCurveTo(w * 0.4, h * 0.8, w * 0.62, h * 0.66); ctx.lineTo(w * 0.66, h * 0.665); ctx.quadraticCurveTo(w * 0.5, h * 0.82, w * 0.34, h); ctx.closePath(); ctx.fill();
      // the arcade door behind, dark now
      tone(ctx, q => rrect(q, 20, h * 0.6, 110, 170, 6), '#1d1233', 75, h * 0.68, 55, { dark: -0.35, spec: false });
      ctx.beginPath(); rrect(ctx, 38, h * 0.63, 74, 140, 4); F(ctx, '#07030f'); ctx.fill();
      txt(ctx, 'CLAWSPIRE', 75, h * 0.6 - 16, 16, '#3a2448', true, 'center', INK);
      // the crawler walks out along the path, a long shadow behind
      const u = U.ease.inOut(walk), cx = U.lerp(75, w * 0.56, u), cy = U.lerp(h * 0.8, h * 0.675, u), k = U.lerp(2.4, 1.1, u);
      ctx.beginPath(); ctx.ellipse(cx - 30 * k, cy + 4, 40 * k, 6 * k, -0.2, 0, TAU); F(ctx, 'rgba(20,10,30,0.25)'); ctx.fill();
      crawler(ctx, cx, cy, 30 * k, t * (walk < 1 ? 1.6 : 0.3));
      // birds over the dawn
      S(ctx, rgba('#2a1838', 0.8 * dawn), 2);
      for (let i = 0; i < 5; i++) { const bx = ((t * 30 + i * 120) % (w + 80)) - 40, by = h * 0.18 + i * 26 + Math.sin(t * 2 + i) * 6, f = Math.sin(t * 8 + i) * 5; ctx.beginPath(); ctx.moveTo(bx - 8, by - f); ctx.quadraticCurveTo(bx - 3, by - 3, bx, by); ctx.quadraticCurveTo(bx + 3, by - 3, bx + 8, by - f); ctx.stroke(); }
      // warm light over everything
      F(ctx, rgba('#ffe08a', 0.08 * dawn)); ctx.fillRect(0, 0, w, h);
    } catch (e) { /* never throws */ }
    ctx.restore();
  }
  const SEC_R = { COL: SEC_COL, PH: SEC_PH, V: SECV, BULBS: SEC_BULBS, key: secKey, glint: secGlint, terrain: secTerrain, mapBg: secMapBg, arena: secArena, face: secFace, cab: secCab, door: secDoor, ending: secEnding };
  /* ============================================================ end SECRET */

  /* ============================================================ ACCESS (round 6)
     Accessibility looks, every one off by default (the defaults draw the
     old art exactly). The game sets them from its Settings screen through
     RENDER.acc.set({mode, text, noFlash, hc}):
      - mode: a colour-blind palette ('deutan', 'protan', 'tritan') for the
        signal colours. The game's canonical signal hexes map to a role
        (damage red, the lime of heal / poison / buffs, the cyan of block /
        uncommon, the pink of crits / debuffs / legendary, gold, burn) and
        each mode gives every role a colour that mode can tell apart. It
        reaches the floating numbers and labels (fx.text / num / badge /
        ring), the status chips, the intent bubbles, the rarity colours
        (RARITY_COL and the item rim light, which re-keys the item sprites)
        and the map. Colour is never the only cue: numbers carry their sign
        (a minus for damage, a plus for healing, "block" in words), status
        chips have their own icons and, in a colour-blind mode, buffs are a
        round pill with an up triangle, debuffs an angular pill with a down
        triangle; map hexes that start a fight wear a warning triangle,
        pickups a round plus badge.
      - text: the scale of the canvas labels (1, 1.15, 1.3).
      - noFlash: reduced flashing. fx.flash is capped (0.08) and fades in
        instead of popping; the strobing bulbs (the cabinet's party chase,
        the arcade machines) run at a fifth of their rate (accStrobe).
      - hc: a thick dark rim with a thin light halo round every item the
        game draws with opts.hc (the items in the bin), cached in the sprite. */
  const ACC = { mode: 'off', textK: 1, noFlash: false, hc: false, v: 0, key: 'off:false' };
  const ACC_MODES = ['off', 'deutan', 'protan', 'tritan'];
  const ACC_TEXT = { n: 1, l: 1.15, xl: 1.3 };
  const ACC_ROLE = {
    '#ff5a4a': 'dmg', '#ff2e30': 'dmg', '#d81f3a': 'dmg',
    '#a6ff5e': 'lime', '#5ab82e': 'lime', '#c6ff8e': 'lime',
    '#2ee6d6': 'cyan', '#8dfff5': 'cyan', '#bfe8ff': 'cyan',
    '#3b6fd6': 'block', '#8fb6ff': 'block',
    '#ff2e88': 'pink', '#ff6bb0': 'pink',
    '#ffc94d': 'gold',
    '#ff8a2b': 'burn',
  };
  // Per mode, a colour per role (blue / orange for the red-green modes,
  // red / green on white-silver for the blue-yellow one).
  const ACC_PAL = {
    deutan: { dmg: '#ff9e1f', lime: '#3fa9ff', cyan: '#c4f1ff', block: '#8fb4ff', pink: '#e46cff', gold: '#ffe14d', burn: '#ff7a00' },
    protan: { dmg: '#ffb31a', lime: '#3fa9ff', cyan: '#c4f1ff', block: '#8fb4ff', pink: '#f08cff', gold: '#fff06a', burn: '#ff8f00' },
    tritan: { dmg: '#ff4040', lime: '#48e060', cyan: '#f2f2f2', block: '#c9c9d6', pink: '#b04dff', gold: '#ffd24d', burn: '#ff7a1a' },
  };
  const ACC_RAR0 = Object.assign({}, RARITY_COL);
  const ACC_RIM0 = { u: POL_RIM.u.slice(), r: POL_RIM.r.slice(), l: POL_RIM.l.slice() };
  // The signal colour c in the current palette (anything else passes through).
  function accC(c) {
    if (ACC.mode === 'off' || typeof c !== 'string') return c;
    const r = ACC_ROLE[c.length === 7 ? c.toLowerCase() : c];
    return r ? ACC_PAL[ACC.mode][r] : c;
  }
  // Time for strobing lights: a fifth of the rate under reduced flashing.
  function accStrobe(t) { return ACC.noFlash ? t * 0.2 : t; }
  const ACC_FLASH = 0.08, ACC_VIG = 0.4;   // reduced flashing: the screen flash and the edge pulse caps
  function accSet(o) {
    o = o || {};
    if (o.mode != null) ACC.mode = ACC_MODES.indexOf(o.mode) >= 0 ? o.mode : 'off';
    if (o.text != null) ACC.textK = ACC_TEXT[o.text] || (+o.text >= 1 && +o.text <= 1.6 ? +o.text : 1);
    if (o.noFlash != null) ACC.noFlash = !!o.noFlash;
    if (o.hc != null) ACC.hc = !!o.hc;
    // rarity: the shared table the game reads too, and the item rim light
    for (const k in ACC_RAR0) RARITY_COL[k] = k === 'c' ? ACC_RAR0.c : accC(ACC_RAR0[k]);
    for (const k in ACC_RIM0) POL_RIM[k] = ACC_RIM0[k].map(accC);
    const key = ACC.mode + ':' + ACC.hc;
    if (ACC.key !== key) { ACC.key = key; POL.v++; ACC.v++; }   // re-keys the item sprites
    return accState();
  }
  function accState() { return { mode: ACC.mode, textK: ACC.textK, noFlash: ACC.noFlash, hc: ACC.hc, v: ACC.v }; }
  // A status chip's cue besides colour: 'round' + an up triangle for a buff,
  // 'angular' + a down triangle for a debuff.
  function accShape(kind) { return kind === 'buff' ? { outline: 'round', mark: 'up' } : { outline: 'angular', mark: 'down' }; }
  // The chip outline: a pill, or (debuffs in a colour-blind mode) a pill with pointed ends.
  function accChip(ctx, x, y, w, h, kind) {
    if (ACC.mode === 'off' || kind === 'buff') { rrect(ctx, x, y, w, h, h / 2); return; }
    const p = h * 0.34;
    poly(ctx, [x + p, y, x + w - p, y, x + w, y + h / 2, x + w - p, y + h, x + p, y + h, x, y + h / 2]);
  }
  /* A small shape marker at (x, y), s its half size: 'up' / 'down'
     triangles (buff / debuff), 'danger' (a warning triangle with a bang),
     'pickup' (a round badge with a plus). */
  function accMark(ctx, kind, x, y, s, col) {
    ctx.save();
    try {
      ctx.translate(x, y); ctx.lineJoin = 'round';
      if (kind === 'up' || kind === 'down') {
        const d = kind === 'up' ? -1 : 1;
        ctx.beginPath(); poly(ctx, [0, d * s, s, -d * s * 0.8, -s, -d * s * 0.8]);
        F(ctx, col || '#fff'); ctx.fill(); S(ctx, INK, Math.max(1, s * 0.35)); ctx.stroke();
      } else if (kind === 'danger') {
        ctx.beginPath(); poly(ctx, [0, -s * 1.1, s * 1.15, s * 0.85, -s * 1.15, s * 0.85]);
        F(ctx, col || accC(PAL.blood)); ctx.fill(); S(ctx, INK, Math.max(1.5, s * 0.3)); ctx.stroke();
        txt(ctx, '!', 0, s * 0.18, s * 1.3, INK, true);
      } else {
        ctx.beginPath(); circ(ctx, 0, 0, s);
        F(ctx, col || accC(PAL.lime)); ctx.fill(); S(ctx, INK, Math.max(1.5, s * 0.3)); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-s * 0.5, 0); ctx.lineTo(s * 0.5, 0); ctx.moveTo(0, -s * 0.5); ctx.lineTo(0, s * 0.5); S(ctx, INK, Math.max(1.5, s * 0.32)); ctx.stroke();
      }
    } catch (e) { /* never throws */ }
    ctx.restore();
  }
  // Map tiles that start a fight (a warning) vs the ones that give (a plus).
  const ACC_DANGER = { fight: 1, elite: 1, boss: 1, tower: 1 };
  const ACC_PICKUP = { treasure: 1, gem: 1, ink: 1, brush: 1, shop: 1, rest: 1, forge: 1, petshop: 1 };
  function accTileKind(type) { return ACC_DANGER[type] ? 'danger' : ACC_PICKUP[type] ? 'pickup' : null; }
  // The high-contrast rim: the item's silhouette as a light halo, then a
  // thick dark rim, behind the art (drawn into the item sprite).
  function accRim(ctx, body) {
    const prev = FLAT;
    try {
      const ring = (col, r, n) => {
        FLAT = col;
        for (let i = 0; i < n; i++) {
          const a = i / n * TAU;
          ctx.save(); ctx.translate(Math.cos(a) * r, Math.sin(a) * r);
          try { body(); } catch (e) { /* art never throws */ }
          ctx.restore();
        }
      };
      ring('rgba(255,255,255,0.92)', 3.6, 10);
      ring(INK, 2.2, 8);
    } finally { FLAT = prev; }
  }
  const ACC_R = {
    set: accSet, get state() { return accState(); }, col: accC, strobe: accStrobe, shape: accShape, mark: accMark, chip: accChip,
    tileKind: accTileKind, MODES: ACC_MODES, TEXT: ACC_TEXT, ROLE: ACC_ROLE, PAL: ACC_PAL, RAR0: ACC_RAR0,
    get textK() { return ACC.textK; }, get noFlash() { return ACC.noFlash; }, get hc() { return ACC.hc; }, get mode() { return ACC.mode; },
  };
  /* ============================================================ end ACCESS */

  /* ============================================================ SETS (round 6)
     The boon draft's backdrop (the machine offering a deal) and the
     Compactor's hydraulic press. Pure functions of their state; the game's
     DOM carries the cards, the buttons and the words on top. */
  // A deterministic 0..1 from two numbers (no rng state: the same frame draws the same).
  const setH = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
  // st {t, w, h, up: [bool], pick, done, tilt}
  function boonBack(ctx, st) {
    ctx.save();
    try {
      st = st || NOEST;
      const t = st.t || 0, w = st.w || 540, h = st.h || 960, tilt = st.tilt | 0, cx = w / 2;
      const spicy = tilt >= 5;
      // the back room
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#0b0514'); g.addColorStop(0.45, '#1a0b2c'); g.addColorStop(1, '#07030d');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      // the arcade floor: a neon grid running to the horizon
      const hz = 560;
      ctx.save(); ctx.globalAlpha = 0.55;
      for (let i = -8; i <= 8; i++) line(ctx, cx + i * 22, hz, cx + i * 150, h, spicy ? '#5a1030' : '#3a1860', 2);
      for (let j = 0; j < 9; j++) { const y = hz + Math.pow(j / 8, 1.8) * (h - hz) + ((t * 18) % 12) * (j / 8); line(ctx, 0, y, w, y, spicy ? '#5a1030' : '#3a1860', 1.5); }
      ctx.restore();
      // the spotlight
      ctx.save(); ctx.globalAlpha = 0.16 + 0.04 * Math.sin(t * 1.3); ctx.globalCompositeOperation = 'lighter';
      ctx.beginPath(); ctx.moveTo(cx - 40, 0); ctx.lineTo(cx + 40, 0); ctx.lineTo(cx + 260, h * 0.86); ctx.lineTo(cx - 260, h * 0.86); ctx.closePath();
      F(ctx, spicy ? '#ff2e30' : '#ffc94d'); ctx.fill(); ctx.restore();
      // THE MACHINE: a giant cabinet leaning out of the dark
      const mx = cx - 175, my = 128, mw = 350, mh = 370;
      glow(ctx, cx, my + mh * 0.5, 260, spicy ? '#ff2e30' : '#ff2e88', 0.22);
      ctx.beginPath(); rrect(ctx, mx, my, mw, mh, 26); F(ctx, '#241238'); ctx.fill(); S(ctx, INK, 5); ctx.stroke();
      ctx.beginPath(); rrect(ctx, mx + 10, my + 10, mw - 20, mh - 20, 18); S(ctx, spicy ? '#ff5a4a' : '#ff2e88', 3); ctx.stroke();
      // the marquee and its chasing bulbs
      ctx.beginPath(); rrect(ctx, mx + 24, my + 20, mw - 48, 54, 12); F(ctx, '#12091f'); ctx.fill(); S(ctx, PAL.gold, 3); ctx.stroke();
      const word = spicy ? 'NO REFUNDS' : "LET'S DEAL";
      glow(ctx, cx, my + 47, 90, spicy ? '#ff2e30' : PAL.gold, 0.35 + 0.1 * Math.sin(t * 6));
      txt(ctx, word, cx, my + 48, 30, spicy ? '#ff8a7a' : '#ffe9a8', true, 'center', INK);
      for (let i = 0; i < 18; i++) {
        const u = i / 17, bx = mx + 30 + u * (mw - 60), on = ((i + Math.floor(t * 8)) % 3) === 0;
        ctx.beginPath(); circ(ctx, bx, my + 84, 4); F(ctx, on ? PAL.gold : '#4a3310'); ctx.fill();
        if (on) glow(ctx, bx, my + 84, 10, PAL.gold, 0.6);
      }
      // the glass, dark inside, and the thing looking out of it
      const gx = mx + 34, gy = my + 100, gw = mw - 68, gh = 190;
      ctx.beginPath(); rrect(ctx, gx, gy, gw, gh, 12); F(ctx, '#07030d'); ctx.fill(); S(ctx, '#5a3f8f', 3); ctx.stroke();
      // the claw inside, swaying on its cable
      const sw = Math.sin(t * 0.9) * 0.08, hx = cx + Math.sin(t * 0.9) * 18, hy = gy + 70;
      line(ctx, cx, gy + 4, hx, hy - 14, '#8d7fb3', 3);
      ctx.save(); ctx.translate(hx, hy); ctx.rotate(sw);
      ctx.beginPath(); circ(ctx, 0, 0, 12); F(ctx, '#c9d3e0'); ctx.fill(); S(ctx, INK, 3); ctx.stroke();
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * 7, 6); ctx.quadraticCurveTo(s * 26, 22, s * 12, 44); S(ctx, INK, 8); ctx.stroke(); S(ctx, '#c9d3e0', 4); ctx.stroke(); }
      ctx.restore();
      // the eyes: they blink, they watch the cards, they smile (or sulk) at the pick
      const blink = (t % 4.2) > 4.05, ey = gy + 128, er = spicy ? 16 : 13;
      const look = st.done ? 0 : Math.sin(t * 0.7) * 6;
      for (const s of [-1, 1]) {
        const ex = cx + s * 58 + look;
        glow(ctx, ex, ey, 40, spicy ? '#ff2e30' : '#ff2e88', 0.7);
        if (blink) { line(ctx, ex - er, ey, ex + er, ey, '#ff6b6b', 4); continue; }
        if (st.done && st.pick >= 0) { ctx.beginPath(); ctx.arc(ex, ey + 4, er, Math.PI * 1.15, Math.PI * 1.85); S(ctx, '#ffd0e0', 5); ctx.stroke(); continue; }
        if (st.done) {   // walked away: a sulk under a scowling brow
          ctx.beginPath(); ctx.arc(ex, ey - 8, er, Math.PI * 0.15, Math.PI * 0.85); S(ctx, '#ffd0e0', 5); ctx.stroke();
          line(ctx, ex - s * er * 1.1, ey - er - 10, ex + s * er * 0.9, ey - er - 2, '#ff6b6b', 4);
          continue;
        }
        ctx.beginPath(); ctx.ellipse(ex, ey, er, er * 0.62, 0, 0, TAU); F(ctx, spicy ? '#ff3b30' : '#ff2e88'); ctx.fill();
        ctx.beginPath(); ctx.ellipse(ex + look * 0.3, ey, er * 0.28, er * 0.5, 0, 0, TAU); F(ctx, INK); ctx.fill();
      }
      if (spicy) { // cracked glass at high Tilt
        ctx.save(); ctx.globalAlpha = 0.6;
        line(ctx, gx + gw - 60, gy + 10, gx + gw - 90, gy + 60, '#d8f0ff', 1.5); line(ctx, gx + gw - 90, gy + 60, gx + gw - 70, gy + 100, '#d8f0ff', 1.5); line(ctx, gx + gw - 90, gy + 60, gx + gw - 130, gy + 80, '#d8f0ff', 1.5);
        ctx.restore();
      }
      // glass sheen
      ctx.save(); ctx.globalAlpha = 0.08; ctx.beginPath(); ctx.moveTo(gx + 20, gy); ctx.lineTo(gx + 90, gy); ctx.lineTo(gx + 40, gy + gh); ctx.lineTo(gx - 30, gy + gh); ctx.closePath(); F(ctx, '#ffffff'); ctx.fill(); ctx.restore();
      // the prize chute: where the cards come out
      const cy0 = my + mh - 58;
      ctx.beginPath(); rrect(ctx, cx - 90, cy0, 180, 34, 10); F(ctx, '#07030d'); ctx.fill(); S(ctx, PAL.gold, 3); ctx.stroke();
      glow(ctx, cx, cy0 + 17, 110, PAL.pink, 0.3 + 0.15 * Math.sin(t * 3));
      txt(ctx, 'PUSH', mx + 44, cy0 + 17, 12, '#8d7fb3', true, 'center');
      txt(ctx, 'TO WIN', mx + mw - 46, cy0 + 17, 12, '#8d7fb3', true, 'center');
      // drifting dust in the light
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 26; i++) {
        const px = (setH(i, 1) * w + t * (6 + setH(i, 2) * 10)) % w, py = (setH(i, 3) * h * 0.85 + Math.sin(t * 0.6 + i) * 20);
        ctx.globalAlpha = 0.25 + 0.25 * Math.sin(t * 2 + i);
        ctx.beginPath(); circ(ctx, px, py, 1.2 + setH(i, 4) * 1.6); F(ctx, '#ffe9c4'); ctx.fill();
      }
      ctx.restore();
    } finally { ctx.restore(); }
  }

  // Where the press plate is (0 up .. 1 down) at k seconds into a crush.
  function cmpPlate(phase, k, K) {
    K = K || { feed: 0.55, slam: 0.95, lift: 1.7, pop: 2.2 };
    if (phase === 'press' || (phase === 'feed' && k >= K.feed)) { const u = clamp01((k - K.feed) / (K.slam - K.feed)); return u * u * u; }
    if (phase === 'grind') return 1;
    if (phase === 'lift') { const u = clamp01((k - K.lift) / (K.pop - K.lift)); return 1 - (1 - (1 - u) * (1 - u)); }
    return 0;
  }
  // st {t, x, y, w, h, phase: idle|feed|press|grind|lift|done, k, K, ins: [{def, plus}], res: {def, plus}, shake, reduced}
  function cmpScene(ctx, st) {
    ctx.save();
    try {
      st = st || NOEST;
      const t = st.t || 0, X0 = st.x || 0, Y0 = st.y == null ? 70 : st.y, w = st.w || 540, h = st.h || 350;
      const ph = st.phase || 'idle', k = st.k || 0, K = st.K || { feed: 0.55, slam: 0.95, lift: 1.7, pop: 2.2 };
      // the workshop wall behind everything
      ctx.fillStyle = '#140a1f'; ctx.fillRect(0, 0, 540, 960);
      for (let r = 0; r < 12; r++) for (let c = 0; c < 6; c++) {
        const px = c * 92 - (r % 2) * 46, py = r * 82;
        ctx.beginPath(); rrect(ctx, px + 3, py + 3, 86, 76, 6); F(ctx, (r + c) % 2 ? '#1e1230' : '#22153a'); ctx.fill();
        F(ctx, '#3d2a63'); for (const [a, b] of [[10, 10], [79, 10], [10, 69], [79, 69]]) { ctx.beginPath(); circ(ctx, px + a, py + b, 2); ctx.fill(); }
      }
      const sh = st.reduced ? 0 : (st.shake || 0) * 6;
      ctx.translate(X0 + (sh ? (setH(t * 60, 1) - 0.5) * sh : 0), Y0 + (sh ? (setH(t * 60, 2) - 0.5) * sh : 0));
      const cx = w / 2, bedY = h - 70, pw = 290, travel = 150;
      // the warning lamp spins while the press works
      const busy = ph === 'press' || ph === 'grind' || ph === 'lift';
      glow(ctx, cx, 40, 180, busy ? '#ff5a4a' : '#9fb4ff', busy ? 0.25 + 0.15 * Math.sin(t * 14) : 0.12);
      // the frame: two columns and the crossbeam
      for (const s of [-1, 1]) {
        const colX = cx + s * (pw / 2 + 26);
        tone(ctx, c => rrect(c, colX - 16, 18, 32, bedY + 30, 6), '#5a6478', colX, bedY / 2, 30, NOSPEC);
        for (let i = 0; i < 6; i++) { ctx.beginPath(); circ(ctx, colX, 44 + i * 40, 3); F(ctx, '#2a303c'); ctx.fill(); }
      }
      tone(ctx, c => rrect(c, cx - pw / 2 - 50, 8, pw + 100, 52, 10), '#6d7888', cx, 34, 60, NOSPEC);
      ctx.beginPath(); rrect(ctx, cx - 92, 20, 184, 28, 6); F(ctx, '#12091f'); ctx.fill();
      txt(ctx, 'COMPACTOR', cx, 35, 18, busy ? '#ffb0a0' : '#c9d3e0', true, 'center');
      // the lamp
      const lx = cx + pw / 2 + 26, lit = busy && Math.sin(t * 14) > 0;
      ctx.beginPath(); circ(ctx, lx, 10, 9); F(ctx, lit ? '#ff5a4a' : '#5a1a1a'); ctx.fill(); S(ctx, INK, 2); ctx.stroke();
      if (lit) glow(ctx, lx, 10, 34, '#ff5a4a', 0.9);
      // the ram and the plate
      const p = cmpPlate(ph, k, K), jit = ph === 'grind' && !st.reduced ? Math.sin(t * 70) * 1.6 : 0;
      const plateY = 70 + p * travel + jit, plateB = plateY + 28;
      tone(ctx, c => rrect(c, cx - 22, 58, 44, 20, 4), '#8a96a8', cx, 66, 20, NOSPEC);
      ctx.beginPath(); rrect(ctx, cx - 10, 60, 20, plateY - 58, 3); F(ctx, '#c9d3e0'); ctx.fill(); S(ctx, INK, 2.5); ctx.stroke();
      ctx.beginPath(); ctx.rect(cx - 6, 62, 4, Math.max(0, plateY - 62)); F(ctx, 'rgba(255,255,255,0.5)'); ctx.fill();
      tone(ctx, c => rrect(c, cx - pw / 2, plateY, pw, 28, 5), '#7a8494', cx, plateY + 14, 60, NOSPEC);
      // hazard stripes along the plate's edge
      ctx.save(); ctx.beginPath(); ctx.rect(cx - pw / 2 + 4, plateY + 16, pw - 8, 9); ctx.clip();
      F(ctx, '#ffc94d'); ctx.fillRect(cx - pw / 2, plateY + 16, pw, 9);
      F(ctx, INK); for (let i = -2; i < pw / 14 + 2; i++) { const sx = cx - pw / 2 + i * 14; ctx.beginPath(); ctx.moveTo(sx, plateY + 25); ctx.lineTo(sx + 7, plateY + 16); ctx.lineTo(sx + 14, plateY + 16); ctx.lineTo(sx + 7, plateY + 25); ctx.closePath(); ctx.fill(); }
      ctx.restore();
      // the bed
      tone(ctx, c => rrect(c, cx - pw / 2 - 20, bedY, pw + 40, 30, 6), '#4a5262', cx, bedY + 15, 60, NOSPEC);
      ctx.beginPath(); ctx.rect(cx - pw / 2 - 14, bedY + 30, pw + 28, 34); F(ctx, '#1a1426'); ctx.fill();
      ctx.save(); ctx.globalAlpha = 0.5; for (let i = 0; i < 9; i++) line(ctx, cx - pw / 2 + i * 36, bedY + 36, cx - pw / 2 + i * 36 + 18, bedY + 60, '#ffc94d', 3); ctx.restore();
      // what is in the chamber
      const ins = st.ins || [], xs = [cx - 82, cx, cx + 82];
      const crushed = ph === 'grind' || ph === 'lift' || ph === 'done';
      if (!crushed) {
        ins.forEach((it, i) => {
          if (!it || !it.def) return;
          const d = shapeDims(it.def.shape), sc = feelItemK(it.def, 64), ih = Math.max(d.w, d.h) * sc;
          let y = bedY - ih / 2 - 2;
          if (ph === 'feed' || ph === 'press') {
            const t0 = 0.02 + i * 0.14, u = clamp01((k - t0) / 0.24);
            if (k < t0) return;
            const drop = 1 - u;
            y = bedY - ih / 2 - 2 - drop * drop * 190;
          }
          // squeeze under the plate
          const room = bedY - plateB, sy = clamp01(room / Math.max(8, ih + 2));
          ctx.save();
          ctx.translate(xs[i], bedY - 2);
          if (sy < 1) ctx.scale(1 + (1 - sy) * 0.5, Math.max(0.15, sy));
          item(ctx, it.def, 0, y - (bedY - 2), (i - 1) * 0.2, sc, { plus: it.plus });
          ctx.restore();
        });
      } else {
        // the bale: everything pressed into one striped block, glowing as it lifts
        const lift = ph === 'lift' ? clamp01((k - K.lift) / (K.pop - K.lift)) : ph === 'done' ? 1 : 0;
        const res = st.res && st.res.def;
        const rc = res ? (RARITY_COL[res.rarity] || '#9fb4ff') : '#9fb4ff';
        if (ph !== 'done') {
          const bh = 30, bw = 170;
          if (lift > 0) glow(ctx, cx, bedY - bh / 2, 90 + lift * 60, rc, 0.4 + lift * 0.5);
          ctx.beginPath(); rrect(ctx, cx - bw / 2, bedY - bh, bw, bh, 4); F(ctx, '#3a2e48'); ctx.fill();
          ctx.save(); ctx.beginPath(); rrect(ctx, cx - bw / 2, bedY - bh, bw, bh, 4); ctx.clip();
          ins.forEach((it, i) => { if (!it || !it.def) return; F(ctx, it.def.color || '#888'); ctx.fillRect(cx - bw / 2 + i * (bw / 3), bedY - bh, bw / 3 + 1, bh); });
          ctx.globalAlpha = 0.5; for (let i = 0; i < 7; i++) line(ctx, cx - bw / 2 + i * 26, bedY - bh, cx - bw / 2 + i * 26 + 14, bedY, INK, 2);
          ctx.restore();
          ctx.beginPath(); rrect(ctx, cx - bw / 2, bedY - bh, bw, bh, 4); S(ctx, INK, 3); ctx.stroke();
          if (lift > 0) { ctx.save(); ctx.globalAlpha = lift * 0.8; ctx.globalCompositeOperation = 'lighter'; ctx.beginPath(); rrect(ctx, cx - bw / 2, bedY - bh, bw, bh, 4); F(ctx, rc); ctx.fill(); ctx.restore(); }
        } else if (res) {
          // the new item, floating over the bed with rays behind it
          const bob = Math.sin(t * 2.4) * 5, iy = bedY - 60 + bob;
          ctx.save(); ctx.translate(cx, iy); ctx.globalCompositeOperation = 'lighter';
          for (let i = 0; i < 12; i++) { ctx.rotate(TAU / 12); ctx.globalAlpha = 0.12; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-10, -150); ctx.lineTo(10, -150); ctx.closePath(); F(ctx, rc); ctx.fill(); }
          ctx.restore();
          glow(ctx, cx, iy, 90, rc, 0.8);
          item(ctx, res, cx, iy, Math.sin(t * 1.3) * 0.12, feelItemK(res, 86), { plus: st.res.plus, glow: rc });
        }
      }
      // the steel guard rails in front
      ctx.save(); ctx.globalAlpha = 0.9;
      for (const s of [-1, 1]) line(ctx, cx + s * (pw / 2 + 8), 70, cx + s * (pw / 2 + 8), bedY, '#ffc94d', 3);
      ctx.restore();
      if (ph === 'idle') {
        const n = ins.filter(Boolean).length;
        txt(ctx, n >= 3 ? 'READY' : `FEED ME ${3 - n}`, cx, bedY + 48, 16, n >= 3 ? PAL.lime : '#c9d3e0', true, 'center', INK);
      }
    } finally { ctx.restore(); }
  }
  const SETS_R = { boonBack, cmpScene, cmpPlate };
  /* ============================================================ end SETS */

  return {
    // SETS (round 6): the boon draft's machine, the Compactor's press
    boonBack, cmpScene, sets: SETS_R,
    item, itemFx, shard, enemy, enemyBox, cabinet, cabinetBack, cabinetFront, claw, clawHead, bodyDebug, hex, mapBg, mapAxis, mapPath, mapRoad, crawler, bg, hpBar, statusPips, intent,
    vsCard, bossSign, bossCab, hotItem, eliteBadge, finale, SIG_COL, VS,
    terrainHex, terrainFill, biomePal, groundOf, lightRim, bulb, mapCompass, mapHeader, mapArrow, BIOME_PAL, DARK,
    portrait, relicIcon, title, fx, flames, glint, enemyAura, RARITY_COL,
    belly, affixAura, affixBadges, binMark, wrench, rageCrown,
    capsule, ticket, CAP_COL,
    ITEM_KEYS, ENEMY_KEYS, ITEM_DEFAULT, PAL, shade, rgba, glowSprite,
    coinSlot, CLAW_DRAW, luckMeter,
    // Polish and QA: the draw caches (item sprites, the cabinet's static back)
    perf: { get cabLayer() { return CABL.on; }, set cabLayer(v) { CABL.on = !!v; CABL.list.length = 0; } },
    // ARCADE (DESIGN.md "Arcade")
    arcIcon, arcCabinet, arcPlinko, arcWheel, arcSlots, arcSym, arcRoamer, arcScene, arcDice,
    // BESTIARY (round 4): enemy life, the new enemies' machine tricks, map decor
    best: BEST,
    // FEEL (round 4): tip card art, the shopkeeper, the campfire, the forge
    feelTipArt, feelKeeper, feelCampfire, feelForge,
    // PETS (round 5): companion pets, the pet shop, whack-a-mole, skee-ball
    pet, petTag, petBed, petIcon, arcMoles, arcSkee, pets: PETS_R,
    // VAULT (round 5): the Prize Vault's cosmetics (equip, looks, thumbnails, trails, outfits, the wall, the share card)
    vault: VAULT_R,
    // SECRET (round 6): the golden keys, the Back Room, The Machine, the door and the true ending
    sec: SEC_R,
    // POLISH (round 5): item identity (decals, silhouettes, rim light) and the relic medallions
    relicLive,
    // ACCESS (round 6): colour-blind palettes, label size, reduced flashing, high-contrast items
    acc: ACC_R,
    pol: {
      get on() { return POL.on; }, set on(v) { POL.on = !!v; },
      stats: POL.stats, SIL: POL_SIL, DECAL: POL_DECAL, BADGE: POL_BADGE, SHINE: POL_SHINE,
      info: (def) => polInfo(def), shine: polShine, tier: polTier,
      // the full sprite cache key of an item (tests: decals are in it)
      key: (def, o) => { o = o || {}; return (o.plus ? 1 : 0) + ':' + (o.frozen ? 1 : 0) + ':' + polInfo(def).key; },
      sprites: (def) => ITEM_SPR.get(def) || null,
      // the item's art without the sprite cache or the safety net (tests)
      art: (ctx, def, o) => { const d = shapeDims(def.shape), w = d.w, h = d.h, dflt = ITEM_DEFAULT[def.art] || ITEM_DEFAULT.rock; itemArt(ctx, def, o || {}, w, h, def.color || dflt[0], def.color2 || dflt[1], artImg('itemId', def.id) || artImg('item', def.art)); },
      badge: (ctx, def, r, t) => polBadge(ctx, def, r, t),
    },
  };
})();
