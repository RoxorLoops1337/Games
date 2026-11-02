// Species themed stage floors: the boards under the duo and the surface inside the ring circle change with the world
// (barn planks, turf, wet tarmac, a starry rug, disco tiles, citrus stripes, stone slabs, ice, flagstones, hearts).
// Everything is baked into the stage layer or the cached ring disc, nothing runs per frame.
import { W, H, LINE_Y } from './sim.js';

const TAU = Math.PI * 2;
function rnd(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }

// the rim colour of the ring circle per species (r,g,b), boss keeps its red
export const RIM = { love: '255,90,140', piggy: '255,110,160', rust: '255,150,70', sneezy: '110,240,160', grumpy: '110,180,255', sleepy: '170,140,255', disco: '80,235,255', sour: '190,250,80', mighty: '200,210,240', frosty: '160,225,255', gloomy: '190,110,255' };
export const rimOf = (skin, boss) => (boss ? '255,50,90' : RIM[skin] || RIM.love);

// base tint and the style key per species
const FLOOR = {
  love: ['#c2417f', 'hearts'], piggy: ['#e58aa0', 'hearts'], rust: ['#a8602c', 'wood'], sneezy: ['#3f9a4c', 'turf'], grumpy: ['#2a4a7a', 'wet'],
  sleepy: ['#4b3a9a', 'rug'], disco: ['#2a9aa2', 'tiles'], sour: ['#8cc23c', 'citrus'], mighty: ['#6b7da3', 'slabs'], frosty: ['#9fd6f2', 'ice'], gloomy: ['#5a2f8c', 'flags'],
};

// one flat pattern inside the box x0,y0,w,h (used for the ring disc and, squeezed, for the stage floor)
function pattern(c, style, x0, y0, w, h, r) {
  const x1 = x0 + w, y1 = y0 + h;
  c.save(); c.beginPath(); c.rect(x0, y0, w, h); c.clip();
  switch (style) {
    case 'wood': {
      const ph = 34;
      for (let y = y0, i = 0; y < y1; y += ph, i++) {
        c.fillStyle = i % 2 ? 'rgba(60,24,6,.16)' : 'rgba(255,190,110,.08)'; c.fillRect(x0, y, w, ph);
        c.fillStyle = 'rgba(20,6,0,.5)'; c.fillRect(x0, y, w, 2);
        const off = (i * 97) % 211;
        c.fillStyle = 'rgba(20,6,0,.4)'; for (let x = x0 - off; x < x1; x += 211) c.fillRect(x, y, 2, ph);
        c.strokeStyle = 'rgba(255,200,130,.09)'; c.lineWidth = 1; c.beginPath();
        for (let k = 0; k < 3; k++) { const gy = y + 7 + k * 9 + r() * 3; c.moveTo(x0, gy); for (let x = x0; x <= x1; x += 40) c.lineTo(x, gy + Math.sin(x * 0.03 + i + k) * 1.6); }
        c.stroke();
        c.fillStyle = 'rgba(255,220,160,.22)'; for (let x = x0 - off + 8; x < x1; x += 211) { c.fillRect(x, y + 6, 2, 2); c.fillRect(x, y + ph - 8, 2, 2); }
      }
      break;
    }
    case 'turf': {
      for (let x = x0, i = 0; x < x1; x += 46, i++) { c.fillStyle = i % 2 ? 'rgba(10,50,16,.2)' : 'rgba(190,255,150,.07)'; c.fillRect(x, y0, 46, h); }
      c.strokeStyle = 'rgba(200,255,160,.2)'; c.lineWidth = 1.6; c.beginPath();
      for (let i = 0; i < w * h / 700; i++) { const x = x0 + r() * w, y = y0 + r() * h, l = 5 + r() * 6; c.moveTo(x, y); c.lineTo(x - 2, y - l); c.moveTo(x, y); c.lineTo(x + 2.5, y - l * 0.85); }
      c.stroke();
      break;
    }
    case 'wet': {
      c.fillStyle = 'rgba(0,0,10,.18)'; c.fillRect(x0, y0, w, h);
      for (let i = 0, n = Math.round(w * h / 22000); i < n; i++) {
        const x = x0 + r() * w, y = y0 + 10 + r() * (h - 20), rw = 26 + r() * 40, rh = rw * 0.28;
        c.fillStyle = 'rgba(150,200,255,.15)'; c.beginPath(); c.ellipse(x, y, rw, rh, 0, 0, TAU); c.fill();
        c.fillStyle = 'rgba(220,240,255,.16)'; c.beginPath(); c.ellipse(x - rw * 0.25, y - rh * 0.25, rw * 0.45, rh * 0.3, 0, 0, TAU); c.fill();
        c.strokeStyle = 'rgba(200,230,255,.2)'; c.lineWidth = 1; c.beginPath(); c.ellipse(x + rw * 0.3, y + rh * 0.2, rw * 0.3, rh * 0.35, 0, 0, TAU); c.stroke();
      }
      break;
    }
    case 'rug': {
      c.fillStyle = 'rgba(30,10,80,.2)'; c.fillRect(x0, y0, w, h);
      c.strokeStyle = 'rgba(255,220,140,.16)'; c.lineWidth = 2;
      for (let x = x0 - h; x < x1; x += 30) { c.beginPath(); c.moveTo(x, y1); c.lineTo(x + h, y0); c.stroke(); c.beginPath(); c.moveTo(x, y0); c.lineTo(x + h, y1); c.stroke(); }
      c.fillStyle = 'rgba(255,240,190,.55)';
      for (let i = 0, n = Math.round(w * h / 5200); i < n; i++) { const x = x0 + r() * w, y = y0 + r() * h, s = 1.2 + r() * 2.2; c.beginPath(); c.moveTo(x, y - s * 1.6); c.lineTo(x + s * 0.5, y - s * 0.4); c.lineTo(x + s * 1.6, y); c.lineTo(x + s * 0.5, y + s * 0.4); c.lineTo(x, y + s * 1.6); c.lineTo(x - s * 0.5, y + s * 0.4); c.lineTo(x - s * 1.6, y); c.lineTo(x - s * 0.5, y - s * 0.4); c.closePath(); c.fill(); }
      break;
    }
    case 'tiles': {
      const t = 60;
      for (let y = y0, j = 0; y < y1; y += t, j++) for (let x = x0, i = 0; x < x1; x += t, i++) {
        c.fillStyle = (i + j) % 2 ? 'rgba(255,90,200,.16)' : 'rgba(90,255,240,.13)'; c.fillRect(x + 2, y + 2, t - 4, t - 4);
        if (r() < 0.12) { c.fillStyle = 'rgba(255,255,255,.2)'; c.fillRect(x + 2, y + 2, t - 4, t - 4); }
      }
      c.strokeStyle = 'rgba(0,10,30,.4)'; c.lineWidth = 3; c.beginPath();
      for (let x = x0; x <= x1; x += t) { c.moveTo(x, y0); c.lineTo(x, y1); }
      for (let y = y0; y <= y1; y += t) { c.moveTo(x0, y); c.lineTo(x1, y); }
      c.stroke();
      break;
    }
    case 'citrus': {
      for (let x = x0 - h, i = 0; x < x1; x += 38, i++) { c.fillStyle = i % 2 ? 'rgba(255,240,90,.12)' : 'rgba(20,80,20,.18)'; c.beginPath(); c.moveTo(x, y1); c.lineTo(x + 38, y1); c.lineTo(x + 38 + h, y0); c.lineTo(x + h, y0); c.closePath(); c.fill(); }
      c.fillStyle = 'rgba(255,255,200,.18)';
      for (let i = 0, n = Math.round(w * h / 9000); i < n; i++) { c.beginPath(); c.arc(x0 + r() * w, y0 + r() * h, 2 + r() * 4, 0, TAU); c.fill(); }
      break;
    }
    case 'slabs': {
      const sh = 48, sw = 96;
      for (let y = y0, j = 0; y < y1; y += sh, j++) {
        const off = (j % 2) * sw / 2;
        for (let x = x0 - off, i = 0; x < x1; x += sw, i++) { c.fillStyle = (i * 7 + j * 3) % 5 < 2 ? 'rgba(255,255,255,.07)' : 'rgba(0,0,20,.14)'; c.fillRect(x + 2, y + 2, sw - 4, sh - 4); }
      }
      c.strokeStyle = 'rgba(5,8,25,.5)'; c.lineWidth = 3; c.beginPath();
      for (let y = y0, j = 0; y <= y1; y += sh, j++) { c.moveTo(x0, y); c.lineTo(x1, y); const off = (j % 2) * 48; for (let x = x0 - off; x < x1; x += sw) { c.moveTo(x, y); c.lineTo(x, y + sh); } }
      c.stroke();
      break;
    }
    case 'ice': {
      c.fillStyle = 'rgba(230,248,255,.1)'; c.fillRect(x0, y0, w, h);
      c.fillStyle = 'rgba(255,255,255,.12)';
      for (let x = x0 - h; x < x1; x += 120) { c.beginPath(); c.moveTo(x, y1); c.lineTo(x + 26, y1); c.lineTo(x + 26 + h * 0.6, y0); c.lineTo(x + h * 0.6, y0); c.closePath(); c.fill(); }
      c.strokeStyle = 'rgba(255,255,255,.42)'; c.lineWidth = 1.3;
      for (let i = 0, n = Math.max(3, Math.round(w * h / 38000)); i < n; i++) {
        let x = x0 + r() * w, y = y0 + r() * h; c.beginPath(); c.moveTo(x, y);
        for (let k = 0; k < 5; k++) { x += (r() - 0.5) * 60; y += (r() - 0.35) * 40; c.lineTo(x, y); }
        c.stroke();
      }
      break;
    }
    case 'flags': {
      c.fillStyle = 'rgba(0,0,0,.16)'; c.fillRect(x0, y0, w, h);
      c.strokeStyle = 'rgba(5,0,20,.55)'; c.lineWidth = 3;
      for (let y = y0, j = 0; y < y1; y += 52, j++) { c.beginPath(); c.moveTo(x0, y); c.lineTo(x1, y); c.stroke(); for (let x = x0 - (j % 2) * 40 - (j * 23) % 50; x < x1; x += 80 + (j * 17) % 30) { c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + 52); c.stroke(); } }
      c.strokeStyle = 'rgba(190,150,255,.18)'; c.lineWidth = 1.2; c.beginPath();
      for (let i = 0, n = Math.round(w * h / 30000); i < n; i++) { let x = x0 + r() * w, y = y0 + r() * h; c.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (r() - 0.5) * 36; y += r() * 18; c.lineTo(x, y); } }
      c.stroke();
      break;
    }
    default: {   // hearts: a lacquered dance floor with tiny hearts
      c.fillStyle = 'rgba(255,200,230,.2)';
      for (let i = 0, n = Math.round(w * h / 7000); i < n; i++) { const x = x0 + r() * w, y = y0 + r() * h, s = 3 + r() * 3.5; c.save(); c.translate(x, y); c.scale(s, s); c.beginPath(); c.moveTo(0, 0.7); c.bezierCurveTo(-1.2, -0.1, -0.7, -0.9, 0, -0.35); c.bezierCurveTo(0.7, -0.9, 1.2, -0.1, 0, 0.7); c.fill(); c.restore(); }
    }
  }
  c.restore();
}

// the boards under the duo, called after the floor gradient: a flat pattern squeezed so the boards recede
export function bakeFloor(c, skin) {
  const [col, style] = FLOOR[skin] || FLOOR.love, fh = H - LINE_Y, r = rnd(skin.length * 977 + 11);
  const tint = c.createLinearGradient(0, LINE_Y, 0, H); tint.addColorStop(0, col + '5a'); tint.addColorStop(1, col + '1c');
  c.fillStyle = tint; c.fillRect(0, LINE_Y, W, fh);
  c.save(); c.beginPath(); c.rect(0, LINE_Y, W, fh); c.clip();
  c.translate(0, LINE_Y); c.scale(1, 0.62);
  pattern(c, style, 0, 0, W, fh / 0.62, r);
  c.restore();
  const far = c.createLinearGradient(0, LINE_Y, 0, LINE_Y + 70); far.addColorStop(0, 'rgba(0,0,0,.28)'); far.addColorStop(1, 'rgba(0,0,0,0)');   // keep the line zone calm
  c.fillStyle = far; c.fillRect(0, LINE_Y, W, 70);
}

// the surface inside the ring disc (centre x,y, radius R). Vinyl species keep their grooves (the caller paints them)
export const hasVinyl = skin => { const s = (FLOOR[skin] || FLOOR.love)[1]; return s === 'hearts' || s === 'tiles'; };
export function ringSurface(b, x, y, R, skin, boss) {
  const [col, style] = FLOOR[skin] || FLOOR.love;
  b.save(); b.beginPath(); b.arc(x, y, R, 0, TAU); b.clip();
  b.fillStyle = col + (boss ? '22' : '30'); b.fillRect(x - R, y - R, R * 2, R * 2);
  pattern(b, style, x - R, y - R, R * 2, R * 2, rnd(skin.length * 313 + 5));
  b.restore();
}
