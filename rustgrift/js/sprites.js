'use strict';
// ===================== SPRITES: optional external art that overrides procedural drawing =====================
// Drop PNGs into assets/ and they are picked up automatically:
//   assets/sprites/<key>.png   character/enemy sheet (3 cols x 2 rows, 512px cells, see SHEET)
//   assets/sprites/icons.png   icon sheet (7 cols x 6 rows, 224px cells, order = ICON_ORDER)
//   assets/bg/<kind>.png       full backdrop 1280x720 (alley, desert, foundry, market, night, camp)
const SHEET = { cell: 512, cols: 3, rows: 2, scale: 1.5, feetX: 256, feetY: 468 };
const POSES = ['idle', 'windup', 'strike', 'hurt', 'talk', 'dead'];
const ICON_CELL = 224, ICON_COLS = 7, ICON_ROWS = 6;
const BG_KINDS = ['alley', 'desert', 'foundry', 'market', 'night', 'camp'];
const MAGENTA = '#ff00ff';
let ICON_ORDER = [];

const SPR = {
  sheets: {}, icons: null, bgs: {}, taintWarned: false,
  keys() { return CHARS.map(c => c.id).concat(Object.keys(ENEMIES)); },
  specFor(key) { const ch = CHARS.find(c => c.id === key); return ch ? ch.spec : ENEMIES[key].spec; },
  init() {
    ICON_ORDER = Object.keys(IC).filter(k => IC[k].parts.length);
    CHARS.forEach(c => { c.spec.spriteKey = c.id; });
    Object.keys(ENEMIES).forEach(k => { ENEMIES[k].spec.spriteKey = k; });
  },
  load() {
    this.keys().forEach(k => this.fetch(`assets/sprites/${k}.png`, im => { this.sheets[k] = this.key(im); }));
    this.fetch('assets/sprites/icons.png', im => { this.icons = this.key(im); });
    BG_KINDS.forEach(k => this.fetch(`assets/bg/${k}.png`, im => { this.bgs[k] = im; }));
  },
  fetch(url, cb) { const im = new Image(); im.onload = () => cb(im); im.onerror = () => { }; im.src = url; },
  // turn magenta backdrop into transparency (skipped when the image already has real alpha)
  key(im) {
    const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0);
    let d; try { d = x.getImageData(0, 0, c.width, c.height); } catch (e) {
      if (!this.taintWarned) { this.taintWarned = true; console.warn('Sprites loaded from file:// cannot be chroma-keyed. Run play.bat (local server) or supply transparent PNGs.'); }
      return c;
    }
    const px = d.data; let hasAlpha = false;
    for (let i = 3; i < px.length; i += 4 * 997) if (px[i] < 250) { hasAlpha = true; break; }
    if (!hasAlpha) {
      for (let i = 0; i < px.length; i += 4) {
        const r = px[i], g = px[i + 1], b = px[i + 2], m = Math.min(r, b) - g;
        if (m > 95) px[i + 3] = 0;
        else if (m > 45) { px[i + 3] = px[i + 3] * (95 - m) / 50; const avg = (r + b) / 2; px[i] = Math.min(r, avg); px[i + 2] = Math.min(b, avg); }
      }
      x.putImageData(d, 0, 0);
    }
    return c;
  },
  cellIndex(p) {
    if (p.hurt) return 3;
    if (p.atk > 0) return p.atk < .35 ? 1 : 2;
    if (p.talk > 0 && Math.sin(p.t * 14) > 0) return 4;
    return 0;
  },
  draw(c, s, p) {
    const sh = this.sheets[s.spriteKey]; if (!sh || p.sit || p.mug) return false;
    const idx = this.cellIndex(p), col = idx % SHEET.cols, row = (idx / SHEET.cols) | 0;
    const bob = Math.sin(p.t * 2.4 + (s.seed || 0)) * 2;
    const cw = sh.width / SHEET.cols, ch = sh.height / SHEET.rows, k = SHEET.scale * (SHEET.cell / cw);
    if (!p.noShadow) { c.fillStyle = 'rgba(30,15,5,.3)'; c.beginPath(); c.ellipse(0, 4, 56, 10, 0, 0, 6.3); c.fill(); }
    c.drawImage(sh, col * cw, row * ch, cw, ch, -SHEET.feetX / SHEET.scale, (-SHEET.feetY / SHEET.scale) + bob, cw / k, ch / k);
    return true;
  },
  icon(c, name, x, y, s) {
    if (!this.icons) return false; const i = ICON_ORDER.indexOf(name); if (i < 0) return false;
    const w = this.icons.width / ICON_COLS, h = this.icons.height / ICON_ROWS, col = i % ICON_COLS, row = (i / ICON_COLS) | 0;
    c.drawImage(this.icons, col * w, row * h, w, h, x - s * 1.15, y - s * 1.15, s * 2.3, s * 2.3);
    return true;
  },
  // ---------- export (used by export.html) ----------
  renderSheet(key) {
    const spec = Object.assign({}, this.specFor(key)); delete spec.spriteKey; spec.scale = 1;
    const cv = document.createElement('canvas'); cv.width = SHEET.cell * SHEET.cols; cv.height = SHEET.cell * SHEET.rows; const c = cv.getContext('2d');
    c.fillStyle = MAGENTA; c.fillRect(0, 0, cv.width, cv.height);
    POSES.forEach((name, i) => {
      const col = i % SHEET.cols, row = (i / SHEET.cols) | 0;
      c.save(); c.translate(col * SHEET.cell + SHEET.feetX, row * SHEET.cell + SHEET.feetY); c.scale(SHEET.scale, SHEET.scale);
      const p = { t: 0.4, atk: 0, talk: 0, noShadow: true };
      if (name === 'windup') p.atk = .3; if (name === 'strike') p.atk = .7; if (name === 'talk') p.talk = 1;
      if (name === 'hurt') { c.rotate(-.13); c.translate(-14, 0); }
      if (name === 'dead') { c.translate(-150, 0); c.rotate(1.35); c.translate(0, -26); }
      drawFigureProc(c, spec, p);
      c.restore();
    });
    return cv;
  },
  renderIcons() {
    const cv = document.createElement('canvas'); cv.width = ICON_CELL * ICON_COLS; cv.height = ICON_CELL * ICON_ROWS; const c = cv.getContext('2d');
    c.fillStyle = MAGENTA; c.fillRect(0, 0, cv.width, cv.height);
    const saved = this.icons; this.icons = null;
    ICON_ORDER.forEach((n, i) => { icon(c, n, (i % ICON_COLS) * ICON_CELL + ICON_CELL / 2, ((i / ICON_COLS) | 0) * ICON_CELL + ICON_CELL / 2, 70, { lw: 5 }); });
    this.icons = saved; return cv;
  },
  renderBg(kind) {
    const saved = this.bgs[kind]; delete this.bgs[kind];
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d');
    delete BG_CACHE[kind + 1]; drawBackdrop(c, kind, 1, 0); if (saved) this.bgs[kind] = saved; return cv;
  }
};
