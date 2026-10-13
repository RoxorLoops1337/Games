// All art is painted by code at boot: block tiles, item icons, characters and creatures. No image files.
import { BLOCKS, B, ITEMS, I } from '../shared/data.js';

export const S = 32; // native tile size in the atlas

function rngFor(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
export function rr(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = Math.max(0, Math.min(255, r + amt)); g = Math.max(0, Math.min(255, g + amt)); b = Math.max(0, Math.min(255, b + amt));
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}
export { shade };

function noiseFill(g, rnd, base, spread, dots, dotSize = 2) {
  g.fillStyle = base; g.fillRect(0, 0, S, S);
  for (let i = 0; i < dots; i++) {
    const a = (rnd() - 0.5) * spread;
    g.fillStyle = shade(base, a);
    const x = rnd() * S | 0, y = rnd() * S | 0, w = 1 + (rnd() * dotSize | 0), h = 1 + (rnd() * dotSize | 0);
    g.fillRect(x, y, w, h);
  }
}
function crack(g, rnd, x, y, len, col) {
  g.strokeStyle = col; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y);
  for (let i = 0; i < len; i++) { x += (rnd() - 0.5) * 6; y += 2 + rnd() * 3; g.lineTo(x, y); }
  g.stroke();
}
function gradFill(g, c1, c2, x = 0, y = 0, w = S, h = S) {
  const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, c1); gr.addColorStop(1, c2); g.fillStyle = gr; g.fillRect(x, y, w, h);
}

// ---------------------------------------------------------------- block painters
const stoneBase = (g, r, base = '#8f929a') => {
  noiseFill(g, r, base, 22, 40, 3);
  g.fillStyle = 'rgba(255,255,255,0.06)'; for (let i = 0; i < 6; i++) g.fillRect(r() * 28 | 0, r() * 28 | 0, 4 + r() * 6, 2);
  crack(g, r, 6 + r() * 20, 0, 5, 'rgba(40,42,50,0.35)');
};
const ore = (col, hi) => (g, r) => {
  stoneBase(g, r);
  for (let i = 0; i < 4; i++) {
    const cx = 5 + r() * 22, cy = 5 + r() * 22, rad = 2 + r() * 2.2;
    g.fillStyle = shade(col, -50); g.beginPath(); g.arc(cx + 0.6, cy + 0.8, rad + 0.6, 0, 7); g.fill();
    g.fillStyle = col; g.beginPath(); g.arc(cx, cy, rad, 0, 7); g.fill();
    g.fillStyle = hi || shade(col, 70); g.fillRect(cx - rad * 0.5, cy - rad * 0.6, 1.6, 1.6);
  }
};
const PAINT = {
  grass(g, r) {
    noiseFill(g, r, '#8a5a36', 24, 26, 3);
    gradFill(g, '#6fd24c', '#4ea335', 0, 0, S, 11);
    g.fillStyle = '#4ea335';
    for (let x = 0; x < S; x += 2) { const h = 9 + (r() * 6 | 0); g.fillRect(x, 6, 2, h - 4); }
    g.fillStyle = '#86e45f'; for (let i = 0; i < 9; i++) g.fillRect(r() * 30 | 0, 1 + r() * 6 | 0, 2, 1);
    g.fillStyle = '#3b8a2a'; for (let x = 1; x < S; x += 4) g.fillRect(x, 12 + (r() * 3 | 0), 2, 2);
  },
  dirt(g, r) {
    noiseFill(g, r, '#8f5d38', 26, 46, 3);
    g.fillStyle = '#6e4529'; for (let i = 0; i < 5; i++) { const x = r() * 28 | 0, y = r() * 28 | 0; g.fillRect(x, y, 3, 2); }
    g.fillStyle = '#a9754a'; for (let i = 0; i < 6; i++) g.fillRect(r() * 30 | 0, r() * 30 | 0, 2, 1);
  },
  stone(g, r) { stoneBase(g, r); },
  sand(g, r) {
    noiseFill(g, r, '#ebd993', 14, 70, 1);
    g.strokeStyle = 'rgba(190,160,90,0.35)'; g.lineWidth = 1;
    for (let i = 0; i < 3; i++) { const y = 6 + i * 9 + (r() * 3 | 0); g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(10, y - 2, 20, y + 2, S, y); g.stroke(); }
  },
  sandstone(g, r) {
    noiseFill(g, r, '#dcc27b', 12, 30, 2);
    g.fillStyle = 'rgba(160,120,60,0.28)'; for (let y = 5; y < S; y += 8) g.fillRect(0, y, S, 2);
    g.fillStyle = 'rgba(255,255,255,0.18)'; for (let y = 7; y < S; y += 8) g.fillRect(0, y, S, 1);
  },
  snow(g, r) {
    noiseFill(g, r, '#f2f7ff', 10, 18, 3);
    g.fillStyle = '#cfe0f5'; for (let i = 0; i < 8; i++) g.fillRect(r() * 28 | 0, 14 + r() * 16 | 0, 4, 2);
    g.fillStyle = '#fff'; for (let i = 0; i < 6; i++) g.fillRect(r() * 30 | 0, r() * 30 | 0, 1, 1);
  },
  ice(g, r) {
    gradFill(g, '#c4eaff', '#8fcdf0');
    g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 2; g.beginPath(); g.moveTo(4, 14); g.lineTo(16, 2); g.moveTo(10, 28); g.lineTo(28, 10); g.stroke();
    g.strokeStyle = 'rgba(80,150,200,0.35)'; g.lineWidth = 1; crack(g, r, 10 + r() * 10, 2, 6, 'rgba(70,140,190,0.4)');
  },
  clay(g, r) {
    noiseFill(g, r, '#b9806a', 10, 24, 3);
    g.fillStyle = '#c99580'; for (let i = 0; i < 6; i++) g.fillRect(r() * 26 | 0, r() * 28 | 0, 6, 2);
  },
  gravel(g, r) {
    noiseFill(g, r, '#7b787d', 18, 20, 2);
    for (let i = 0; i < 16; i++) {
      const x = r() * 28 | 0, y = r() * 28 | 0, w = 3 + r() * 4 | 0;
      g.fillStyle = shade('#85828a', (r() - 0.5) * 50); g.fillRect(x, y, w, w - 1);
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x, y + w - 1, w, 1);
    }
  },
  bedrock(g, r) {
    noiseFill(g, r, '#2a2a34', 30, 70, 5);
    g.fillStyle = '#16161c'; for (let i = 0; i < 8; i++) g.fillRect(r() * 26 | 0, r() * 26 | 0, 6, 4);
  },
  log(g, r) {
    g.fillStyle = '#7a4e2a'; g.fillRect(0, 0, S, S);
    for (let x = 0; x < S; x += 4) { g.fillStyle = shade('#7a4e2a', (r() - 0.5) * 36); g.fillRect(x, 0, 3, S); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + 3, 0, 1, S); }
    g.fillStyle = 'rgba(255,200,140,0.18)'; for (let i = 0; i < 5; i++) g.fillRect(r() * 28 | 0, r() * 28 | 0, 2, 6);
    g.fillStyle = '#4e3018'; g.beginPath(); g.ellipse(8 + r() * 14, 8 + r() * 16, 2.5, 3.5, 0, 0, 7); g.fill();
  },
  leaves(g, r) {
    g.clearRect(0, 0, S, S);
    for (let i = 0; i < 46; i++) {
      const x = r() * S, y = r() * S, rad = 3 + r() * 3.4;
      g.fillStyle = shade('#3f9a3a', (r() - 0.5) * 60); g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill();
    }
    g.fillStyle = 'rgba(190,255,150,0.28)'; for (let i = 0; i < 12; i++) g.fillRect(r() * 28 | 0, r() * 26 | 0, 3, 2);
    g.globalCompositeOperation = 'destination-out'; for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(r() * S, r() * S, 1.4 + r() * 1.4, 0, 7); g.fill(); } g.globalCompositeOperation = 'source-over';
  },
  pine_leaves(g, r) {
    g.clearRect(0, 0, S, S);
    for (let i = 0; i < 40; i++) {
      const x = r() * S, y = r() * S;
      g.fillStyle = shade('#2f6e5a', (r() - 0.5) * 50); g.beginPath(); g.moveTo(x, y - 4); g.lineTo(x + 4.5, y + 3); g.lineTo(x - 4.5, y + 3); g.closePath(); g.fill();
    }
    g.fillStyle = 'rgba(255,255,255,0.55)'; for (let i = 0; i < 14; i++) g.fillRect(r() * 28 | 0, r() * 28 | 0, 3, 2);
  },
  cactus(g, r) {
    g.clearRect(0, 0, S, S);
    rr(g, 7, 0, 18, S, 7); g.fillStyle = '#3f8a4e'; g.fill();
    g.fillStyle = '#56a864'; g.fillRect(10, 0, 4, S); g.fillStyle = '#2f6e3c'; g.fillRect(19, 0, 3, S);
    g.fillStyle = '#f2f2d0'; for (let i = 0; i < 9; i++) g.fillRect(8 + (r() * 16 | 0), (r() * 30 | 0), 1, 2);
  },
  coal_ore: ore('#2a2b30', '#5a5c66'),
  copper_ore: ore('#d9803a', '#ffbf7a'),
  tin_ore: ore('#c7d0da', '#ffffff'),
  iron_ore: ore('#c99a7e', '#f0cdb5'),
  gold_ore: ore('#f5c935', '#fff1a0'),
  titanium_ore: ore('#a995ff', '#ddd4ff'),
  sunstone_ore: ore('#ff9a3d', '#ffe0a0'),
  obsidian(g, r) {
    gradFill(g, '#3b2a5c', '#1d1230');
    g.strokeStyle = 'rgba(190,150,255,0.5)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(3, 12); g.lineTo(14, 3); g.moveTo(8, 29); g.lineTo(28, 8); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.18)'; for (let i = 0; i < 6; i++) g.fillRect(r() * 28 | 0, r() * 28 | 0, 2, 2);
  },
  planks(g, r) {
    g.fillStyle = '#c88a4a'; g.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += 8) {
      g.fillStyle = shade('#c88a4a', (r() - 0.5) * 30); g.fillRect(0, y, S, 7);
      g.fillStyle = 'rgba(70,35,10,0.55)'; g.fillRect(0, y + 7, S, 1);
      g.strokeStyle = 'rgba(120,70,30,0.35)'; g.beginPath(); g.moveTo(0, y + 3 + r() * 2); g.bezierCurveTo(10, y + 1, 20, y + 5, S, y + 3); g.stroke();
      g.fillStyle = '#6a3d16'; g.fillRect(3, y + 3, 1, 1); g.fillRect(28, y + 3, 1, 1);
    }
  },
  brick(g, r) {
    g.fillStyle = '#d8c4b4'; g.fillRect(0, 0, S, S);
    for (let row = 0; row < 4; row++) {
      const off = row % 2 ? 8 : 0;
      for (let x = -off; x < S; x += 16) { g.fillStyle = shade('#b8553f', (r() - 0.5) * 36); g.fillRect(x + 1, row * 8 + 1, 14, 6); g.fillStyle = 'rgba(255,200,170,0.25)'; g.fillRect(x + 1, row * 8 + 1, 14, 1); }
    }
  },
  stone_brick(g, r) {
    g.fillStyle = '#6c6e78'; g.fillRect(0, 0, S, S);
    for (let row = 0; row < 2; row++) {
      const off = row ? 8 : 0;
      for (let x = -off; x < S; x += 16 + 0) { g.fillStyle = shade('#9a9ca6', (r() - 0.5) * 24); rr(g, x + 1, row * 16 + 1, 14, 14, 2); g.fill(); g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(x + 2, row * 16 + 2, 12, 1); }
    }
  },
  glass(g) {
    g.clearRect(0, 0, S, S); g.fillStyle = 'rgba(200,238,255,0.28)'; g.fillRect(0, 0, S, S);
    g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 2; g.strokeRect(1, 1, S - 2, S - 2);
    g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 3; g.beginPath(); g.moveTo(6, 16); g.lineTo(16, 6); g.stroke(); g.lineWidth = 1.5; g.beginPath(); g.moveTo(10, 24); g.lineTo(24, 10); g.stroke();
  },
  torch(g) {
    g.clearRect(0, 0, S, S);
    g.fillStyle = '#7a4e2a'; g.fillRect(14, 12, 4, 18); g.fillStyle = '#9a6a3a'; g.fillRect(14, 12, 2, 18);
    g.fillStyle = '#2e2a28'; g.fillRect(13, 10, 6, 4);
    const gr = g.createRadialGradient(16, 8, 1, 16, 8, 9); gr.addColorStop(0, '#fffbd0'); gr.addColorStop(0.5, '#ffc440'); gr.addColorStop(1, 'rgba(255,120,20,0)');
    g.fillStyle = gr; g.beginPath(); g.ellipse(16, 8, 6, 9, 0, 0, 7); g.fill();
  },
  ladder(g) {
    g.clearRect(0, 0, S, S); g.fillStyle = '#a8723a'; g.fillRect(6, 0, 4, S); g.fillRect(22, 0, 4, S);
    g.fillStyle = '#c38c4c'; g.fillRect(6, 0, 2, S); g.fillRect(22, 0, 2, S);
    g.fillStyle = '#8a5a2a'; for (let y = 3; y < S; y += 8) g.fillRect(8, y, 16, 3);
  },
  workbench(g) {
    g.clearRect(0, 0, S, S);
    g.fillStyle = '#7a4e2a'; g.fillRect(3, 14, 4, 18); g.fillRect(25, 14, 4, 18);
    rr(g, 1, 8, 30, 8, 2); g.fillStyle = '#c88a4a'; g.fill(); g.fillStyle = '#e0a868'; g.fillRect(2, 9, 28, 2);
    g.fillStyle = '#6a6e78'; g.fillRect(6, 3, 8, 3); g.fillStyle = '#8a5a2a'; g.fillRect(9, 5, 3, 4); // hammer
    g.fillStyle = '#d0d4da'; g.fillRect(19, 4, 8, 3); g.fillStyle = '#8a5a2a'; g.fillRect(22, 6, 2, 3);
  },
  furnace(g, r) {
    g.clearRect(0, 0, S, S); rr(g, 1, 2, 30, 30, 4); g.fillStyle = '#6f727c'; g.fill();
    for (let i = 0; i < 18; i++) { g.fillStyle = shade('#6f727c', (r() - 0.5) * 36); g.fillRect(r() * 26 + 2, r() * 26 + 3, 4, 3); }
    rr(g, 7, 12, 18, 14, 4); g.fillStyle = '#1b1416'; g.fill();
    const gr = g.createRadialGradient(16, 22, 1, 16, 20, 9); gr.addColorStop(0, '#fff2a0'); gr.addColorStop(0.5, '#ff9a2a'); gr.addColorStop(1, 'rgba(200,40,10,0.2)');
    g.fillStyle = gr; rr(g, 8, 14, 16, 12, 4); g.fill();
    g.fillStyle = '#4a4c54'; g.fillRect(12, 0, 8, 4);
  },
  anvil(g) {
    g.clearRect(0, 0, S, S); g.fillStyle = '#3a3c44'; g.fillRect(8, 24, 16, 7); g.fillRect(12, 17, 8, 8);
    g.fillStyle = '#5a5d68'; rr(g, 2, 8, 28, 10, 3); g.fill(); g.fillStyle = '#7a7e8a'; g.fillRect(4, 9, 22, 2);
    g.fillStyle = '#5a5d68'; g.beginPath(); g.moveTo(26, 9); g.lineTo(31, 12); g.lineTo(26, 17); g.fill();
  },
  chest(g) {
    g.clearRect(0, 0, S, S); rr(g, 2, 10, 28, 21, 3); g.fillStyle = '#9a6320'; g.fill();
    rr(g, 2, 6, 28, 11, 5); g.fillStyle = '#b6812f'; g.fill(); g.fillStyle = '#d29a45'; g.fillRect(4, 8, 24, 2);
    g.fillStyle = '#4a3418'; g.fillRect(2, 16, 28, 2); g.fillStyle = '#7a5a2a'; g.fillRect(2, 22, 28, 1);
    g.fillStyle = '#f0c040'; rr(g, 13, 14, 6, 8, 2); g.fill(); g.fillStyle = '#7a5a10'; g.fillRect(15, 17, 2, 3);
    g.fillStyle = '#6a6e78'; g.fillRect(4, 10, 3, 20); g.fillRect(25, 10, 3, 20);
  },
  bed(g) {
    g.clearRect(0, 0, S, S); g.fillStyle = '#7a4e2a'; g.fillRect(1, 18, 3, 14); g.fillRect(28, 18, 3, 14);
    rr(g, 1, 14, 30, 10, 3); g.fillStyle = '#c8434b'; g.fill(); g.fillStyle = '#e2606a'; g.fillRect(4, 15, 24, 2);
    rr(g, 2, 9, 11, 7, 3); g.fillStyle = '#f4efe6'; g.fill();
    g.fillStyle = '#9a2f38'; g.fillRect(14, 16, 16, 2);
  },
  sign(g) {
    g.clearRect(0, 0, S, S); g.fillStyle = '#7a4e2a'; g.fillRect(14, 18, 4, 14);
    rr(g, 3, 4, 26, 16, 3); g.fillStyle = '#d6aa6c'; g.fill(); g.strokeStyle = '#8a5a2a'; g.lineWidth = 2; g.stroke();
    g.fillStyle = 'rgba(90,50,20,0.7)'; g.fillRect(7, 9, 18, 2); g.fillRect(7, 13, 12, 2);
  },
  platform(g, r) {
    g.clearRect(0, 0, S, S); g.fillStyle = '#c88a4a'; rr(g, 0, 0, S, 9, 2); g.fill();
    g.fillStyle = '#e0a868'; g.fillRect(1, 1, S - 2, 2); g.fillStyle = 'rgba(70,35,10,0.5)'; g.fillRect(0, 8, S, 1);
    g.fillStyle = '#6a3d16'; g.fillRect(4, 4, 1, 1); g.fillRect(27, 4, 1, 1);
  },
  waystone(g) {
    g.clearRect(0, 0, S, S); g.fillStyle = '#4b4f5c'; g.beginPath(); g.moveTo(6, 32); g.lineTo(9, 6); g.lineTo(16, 0); g.lineTo(23, 6); g.lineTo(26, 32); g.fill();
    g.fillStyle = '#6a6f80'; g.beginPath(); g.moveTo(10, 32); g.lineTo(12, 8); g.lineTo(16, 3); g.lineTo(16, 32); g.fill();
    const gr = g.createRadialGradient(16, 16, 1, 16, 16, 9); gr.addColorStop(0, '#e8fbff'); gr.addColorStop(0.5, '#7ad8ff'); gr.addColorStop(1, 'rgba(60,140,220,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(16, 16, 9, 0, 7); g.fill();
    g.strokeStyle = '#cdf3ff'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(16, 10); g.lineTo(16, 22); g.moveTo(12, 14); g.lineTo(20, 14); g.stroke();
  },
  lamp(g) {
    gradFill(g, '#fff8c4', '#ffd96a'); g.strokeStyle = '#8a6a2a'; g.lineWidth = 2; g.strokeRect(1, 1, S - 2, S - 2);
    g.strokeStyle = '#8a6a2a'; g.beginPath(); g.moveTo(16, 1); g.lineTo(16, 31); g.moveTo(1, 16); g.lineTo(31, 16); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(4, 4, 6, 3);
  },
  copper_block: metalBlock('#d9834a'), iron_block: metalBlock('#cfd3d9'), gold_block: metalBlock('#ffd84a'),
  wool(g, r) {
    noiseFill(g, r, '#f3eee6', 12, 40, 2); g.strokeStyle = 'rgba(190,180,170,0.4)'; g.lineWidth = 1;
    for (let y = 4; y < S; y += 6) { g.beginPath(); for (let x = 0; x <= S; x += 4) g.lineTo(x, y + ((x / 4) % 2 ? 1.5 : 0)); g.stroke(); }
  },
  wool_red: dyedWool('#d9434b'), wool_yellow: dyedWool('#f2cf3c'), wool_blue: dyedWool('#3a78e0'), wool_green: dyedWool('#4aa84a'), wool_black: dyedWool('#2f2f36'), wool_pink: dyedWool('#f08ab8'),
  door_closed(g) { doorPart(g, false, true); }, door_top_closed(g) { doorPart(g, true, true); },
  door_open(g) { doorPart(g, false, false); }, door_top_open(g) { doorPart(g, true, false); },
  flower_red(g) { flower(g, '#e04a5a', '#ffd0d6'); }, flower_yellow(g) { flower(g, '#f2d33c', '#fff2a0'); },
  tallgrass(g, r) {
    g.clearRect(0, 0, S, S);
    for (let i = 0; i < 9; i++) {
      const x = 3 + i * 3 + r() * 2, h = 10 + r() * 14, lean = (r() - 0.5) * 8;
      g.strokeStyle = shade('#58b83c', (r() - 0.5) * 50); g.lineWidth = 2; g.beginPath(); g.moveTo(x, S); g.quadraticCurveTo(x, S - h * 0.6, x + lean, S - h); g.stroke();
    }
  },
  mushroom(g) {
    g.clearRect(0, 0, S, S); g.fillStyle = '#efe0cc'; g.fillRect(14, 22, 5, 9);
    g.fillStyle = '#d8b6a0'; g.beginPath(); g.ellipse(16, 22, 10, 7, 0, Math.PI, 0); g.fill(); g.fillStyle = '#fff'; g.fillRect(11, 17, 3, 2); g.fillRect(18, 19, 3, 2);
  },
  sapling(g) {
    g.clearRect(0, 0, S, S); g.strokeStyle = '#7a4e2a'; g.lineWidth = 2; g.beginPath(); g.moveTo(16, S); g.lineTo(16, 16); g.stroke();
    for (const [x, y, rad] of [[16, 12, 7], [10, 17, 5], [22, 17, 5]]) { g.fillStyle = '#4aa83a'; g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill(); g.fillStyle = '#76d05a'; g.fillRect(x - 2, y - 3, 3, 2); }
  },
  wheat0(g) { wheat(g, 0); }, wheat1(g) { wheat(g, 1); }, wheat2(g) { wheat(g, 2); },
  farmland(g, r) { noiseFill(g, r, '#5e3a22', 20, 40, 2); g.fillStyle = '#3e2414'; for (let x = 2; x < S; x += 6) g.fillRect(x, 0, 2, S); },
  cobweb(g) {
    g.clearRect(0, 0, S, S); g.strokeStyle = 'rgba(240,240,250,0.9)'; g.lineWidth = 1; g.beginPath();
    g.moveTo(0, 0); g.lineTo(S, S); g.moveTo(S, 0); g.lineTo(0, S); g.moveTo(16, 0); g.lineTo(16, S); g.moveTo(0, 16); g.lineTo(S, 16); g.stroke();
    for (const rad of [6, 12, 17]) { g.beginPath(); g.arc(16, 16, rad, 0, 7); g.stroke(); }
  },
  crystal(g, r) {
    stoneBase(g, r, '#585b66');
    for (const [x, h, w] of [[9, 20, 6], [17, 25, 7], [24, 16, 5]]) {
      g.fillStyle = '#7fe6ff'; g.beginPath(); g.moveTo(x, 30); g.lineTo(x + w / 2, 30 - h); g.lineTo(x + w, 30); g.fill();
      g.fillStyle = '#d6fbff'; g.beginPath(); g.moveTo(x + 1, 30); g.lineTo(x + w / 2, 30 - h); g.lineTo(x + w / 2, 30); g.fill();
    }
  },
  trampoline(g) {
    g.fillStyle = '#e8527a'; rr(g, 0, 0, S, S, 5); g.fill(); g.fillStyle = '#ff8aa6'; g.fillRect(3, 3, S - 6, 6);
    g.strokeStyle = '#8a1f3c'; g.lineWidth = 2; g.beginPath(); for (let x = 0; x <= S; x += 4) g.lineTo(x, 16 + (x / 4 % 2 ? 4 : -4)); g.stroke();
  },
};
function dyedWool(col) {
  return (g, r) => {
    noiseFill(g, r, col, 14, 40, 2); g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 1;
    for (let y = 4; y < S; y += 6) { g.beginPath(); for (let x = 0; x <= S; x += 4) g.lineTo(x, y + ((x / 4) % 2 ? 1.5 : 0)); g.stroke(); }
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(2, 2, S - 4, 3);
  };
}
function metalBlock(col) {
  return (g, r) => {
    gradFill(g, shade(col, 30), shade(col, -30)); g.strokeStyle = shade(col, -70); g.lineWidth = 2; g.strokeRect(1, 1, S - 2, S - 2);
    g.fillStyle = 'rgba(255,255,255,0.45)'; g.fillRect(4, 4, S - 8, 3); g.fillRect(4, 4, 3, S - 8);
    g.fillStyle = shade(col, -40); for (const [x, y] of [[5, 5], [26, 5], [5, 26], [26, 26]]) g.fillRect(x, y, 2, 2);
    void r;
  };
}
function doorPart(g, top, closed) {
  g.clearRect(0, 0, S, S);
  if (closed) {
    g.fillStyle = '#9a6a36'; g.fillRect(2, 0, 28, S);
    g.fillStyle = '#b4824a'; g.fillRect(4, 2, 11, S - 4); g.fillRect(17, 2, 11, S - 4);
    g.fillStyle = 'rgba(60,30,10,0.5)'; g.fillRect(2, 0, 28, 1); g.fillRect(15, 0, 2, S);
    g.fillStyle = '#e8c860'; g.beginPath(); g.arc(25, top ? S - 4 : 8, 2, 0, 7); g.fill();
  } else {
    g.fillStyle = '#7a5226'; g.fillRect(0, 0, 5, S); g.fillStyle = '#a07040'; g.fillRect(0, 0, 2, S);
  }
}
function flower(g, col, hi) {
  g.clearRect(0, 0, S, S); g.strokeStyle = '#3f8a2a'; g.lineWidth = 2; g.beginPath(); g.moveTo(16, S); g.quadraticCurveTo(14, 22, 16, 14); g.stroke();
  g.fillStyle = '#4ea335'; g.beginPath(); g.ellipse(12, 24, 4, 2, -0.6, 0, 7); g.fill();
  for (let i = 0; i < 5; i++) { const a = i / 5 * 6.283; g.fillStyle = col; g.beginPath(); g.arc(16 + Math.cos(a) * 4.4, 11 + Math.sin(a) * 4.4, 3.4, 0, 7); g.fill(); }
  g.fillStyle = hi; g.beginPath(); g.arc(16, 11, 2.6, 0, 7); g.fill();
}
function wheat(g, st) {
  g.clearRect(0, 0, S, S);
  const h = [10, 20, 28][st], col = ['#8bc34a', '#b5c23a', '#e6c24a'][st];
  for (let i = 0; i < 5; i++) {
    const x = 5 + i * 5.5;
    g.strokeStyle = shade(col, -20); g.lineWidth = 2; g.beginPath(); g.moveTo(x, S); g.quadraticCurveTo(x + (i % 2 ? 2 : -2), S - h / 2, x, S - h); g.stroke();
    if (st === 2) { g.fillStyle = '#f2d060'; g.beginPath(); g.ellipse(x, S - h - 2, 2, 5, 0, 0, 7); g.fill(); g.fillStyle = '#c8a030'; g.fillRect(x - 1, S - h - 6, 1, 8); }
    else if (st === 1) { g.fillStyle = col; g.beginPath(); g.ellipse(x, S - h, 2, 4, 0, 0, 7); g.fill(); }
  }
}

// ---------------------------------------------------------------- atlas
export const VARIANTS = 4;
const atlas = new Map(); // id -> [canvas x4]
export function tileArt(id, v = 0) {
  let a = atlas.get(id);
  if (!a) {
    a = [];
    const name = BLOCKS[id].name;
    const paint = PAINT[name];
    for (let k = 0; k < VARIANTS; k++) {
      const c = mk(S, S), g = c.getContext('2d');
      if (paint) paint(g, rngFor(id * 131 + k * 7919 + 17), k);
      else { g.fillStyle = BLOCKS[id].color; g.fillRect(0, 0, S, S); }
      a.push(c);
    }
    atlas.set(id, a);
  }
  return a[v & 3];
}

// ---------------------------------------------------------------- item icons
const TIER_COL = { wood: '#c0844a', stone: '#a4a9b2', copper: '#e08a4a', bronze: '#d0a040', iron: '#dfe3ea', titanium: '#b9a6ff', gold: '#ffd84a', leather: '#a5723c' };
const iconCache = new Map();
export function itemIcon(id) {
  let c = iconCache.get(id);
  if (c) return c;
  c = mk(S, S);
  const g = c.getContext('2d');
  const def = ITEMS[id];
  if (!def) { iconCache.set(id, c); return c; }
  if (def.place && (def.kind === 'block' || def.place)) {
    const bid = def.place;
    const bd = BLOCKS[bid];
    if (bd.plant || bd.station || bd.climb || bd.sign || bd.bed || bd.container || bd.waystone || bd.oneway || bd.door || id === I.torch || bid === B.leaves || bid === B.pine_leaves || bid === B.cactus || bid === B.glass) {
      g.drawImage(tileArt(bid === B.door_closed ? B.door_closed : bid), 0, 0);
    } else {
      g.fillStyle = 'rgba(0,0,0,0.25)'; rr(g, 3, 4, 27, 27, 5); g.fill();
      g.save(); rr(g, 2, 2, 27, 27, 5); g.clip(); g.drawImage(tileArt(bid), 2, 2, 27, 27); g.restore();
      g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 1.5; rr(g, 2, 2, 27, 27, 5); g.stroke();
    }
    iconCache.set(id, c); return c;
  }
  paintItem(g, def.name);
  iconCache.set(id, c);
  return c;
}
function paintItem(g, name) {
  const outline = (fn) => { g.save(); g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = 2; g.shadowOffsetY = 1; fn(); g.restore(); };
  const m = /^(wood|stone|copper|bronze|iron|titanium|gold|leather)_(pickaxe|axe|shovel|sword|helmet|chest|boots)$/.exec(name);
  if (m) {
    const col = TIER_COL[m[1]], kind = m[2];
    outline(() => {
      if (kind === 'sword') {
        g.fillStyle = '#7a4e2a'; g.save(); g.translate(7, 25); g.rotate(-Math.PI / 4); g.fillRect(-2, -2, 4, 9); g.fillStyle = '#d0a040'; g.fillRect(-6, -4, 12, 3); g.restore();
        g.fillStyle = col; g.beginPath(); g.moveTo(10, 22); g.lineTo(26, 4); g.lineTo(28, 5); g.lineTo(26, 9); g.lineTo(12, 24); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.6)'; g.beginPath(); g.moveTo(12, 21); g.lineTo(26, 5); g.lineTo(27, 6); g.lineTo(14, 22); g.fill();
      } else if (kind === 'pickaxe' || kind === 'axe' || kind === 'shovel') {
        g.strokeStyle = '#7a4e2a'; g.lineWidth = 3.5; g.lineCap = 'round'; g.beginPath(); g.moveTo(6, 27); g.lineTo(22, 11); g.stroke();
        g.fillStyle = col; g.strokeStyle = shade(col, -60); g.lineWidth = 1;
        if (kind === 'pickaxe') { g.beginPath(); g.moveTo(10, 8); g.quadraticCurveTo(22, 2, 29, 13); g.lineTo(26, 15); g.quadraticCurveTo(21, 8, 12, 12); g.closePath(); g.fill(); g.stroke(); }
        else if (kind === 'axe') { g.beginPath(); g.moveTo(17, 5); g.lineTo(28, 8); g.lineTo(26, 19); g.lineTo(20, 15); g.closePath(); g.fill(); g.stroke(); }
        else { g.beginPath(); g.ellipse(24, 8, 5, 7, 0.78, 0, 7); g.fill(); g.stroke(); }
      } else if (kind === 'helmet') {
        g.fillStyle = col; rr(g, 6, 6, 20, 14, 8); g.fill(); g.fillRect(6, 14, 20, 8); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(10, 15, 12, 4); g.fillStyle = 'rgba(255,255,255,0.45)'; g.fillRect(9, 8, 8, 2);
      } else if (kind === 'chest') {
        g.fillStyle = col; rr(g, 6, 5, 20, 22, 4); g.fill(); g.fillStyle = shade(col, -45); g.fillRect(13, 5, 6, 8); g.fillStyle = 'rgba(255,255,255,0.4)'; g.fillRect(8, 8, 3, 14);
        g.fillStyle = col; rr(g, 2, 6, 8, 8, 3); g.fill(); rr(g, 22, 6, 8, 8, 3); g.fill();
      } else {
        g.fillStyle = col; rr(g, 5, 12, 10, 14, 3); g.fill(); rr(g, 17, 12, 10, 14, 3); g.fill(); g.fillStyle = shade(col, -50); g.fillRect(5, 22, 10, 4); g.fillRect(17, 22, 10, 4);
      }
    });
    return;
  }
  const ingot = /^(copper|tin|bronze|iron|gold|titanium)_ingot$/.exec(name);
  if (ingot) {
    const col = { copper: '#e08a4a', tin: '#c9d3de', bronze: '#d0a040', iron: '#dfe3ea', gold: '#ffd84a', titanium: '#b9a6ff' }[ingot[1]];
    outline(() => {
      g.fillStyle = shade(col, -45); g.beginPath(); g.moveTo(4, 24); g.lineTo(9, 12); g.lineTo(28, 12); g.lineTo(28, 24); g.closePath(); g.fill();
      g.fillStyle = col; g.beginPath(); g.moveTo(5, 22); g.lineTo(10, 12); g.lineTo(27, 12); g.lineTo(26, 21); g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(11, 14, 14, 2);
    });
    return;
  }
  const f = {
    stick() { g.strokeStyle = '#7a4e2a'; g.lineWidth = 3.5; g.lineCap = 'round'; g.beginPath(); g.moveTo(7, 26); g.lineTo(25, 6); g.stroke(); g.strokeStyle = '#a0703a'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(8, 24); g.lineTo(24, 7); g.stroke(); },
    coal() { for (const [x, y, r] of [[11, 20, 6], [21, 17, 5], [16, 11, 5]]) { g.fillStyle = '#25262b'; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.fillStyle = '#5a5c66'; g.fillRect(x - r / 2, y - r / 2, 2, 2); } },
    flint() { g.fillStyle = '#4a4c52'; g.beginPath(); g.moveTo(6, 22); g.lineTo(14, 6); g.lineTo(26, 14); g.lineTo(22, 27); g.closePath(); g.fill(); g.fillStyle = '#8a8d96'; g.beginPath(); g.moveTo(10, 20); g.lineTo(15, 9); g.lineTo(20, 14); g.closePath(); g.fill(); },
    string() { g.strokeStyle = '#f2f2f2'; g.lineWidth = 2; g.beginPath(); g.moveTo(6, 24); g.bezierCurveTo(10, 4, 20, 30, 26, 8); g.stroke(); },
    feather() { g.fillStyle = '#f4f4fa'; g.beginPath(); g.moveTo(5, 27); g.quadraticCurveTo(10, 4, 27, 5); g.quadraticCurveTo(24, 20, 5, 27); g.fill(); g.strokeStyle = '#9aa4c0'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(5, 27); g.lineTo(24, 8); g.stroke(); },
    leather() { g.fillStyle = '#a5723c'; rr(g, 5, 7, 22, 19, 6); g.fill(); g.fillStyle = '#c28e52'; g.fillRect(8, 10, 8, 3); g.strokeStyle = '#6a4220'; g.setLineDash([2, 2]); g.strokeRect(8, 10, 16, 13); g.setLineDash([]); },
    seeds() { for (const [x, y] of [[10, 14], [17, 19], [22, 11], [13, 24], [24, 22]]) { g.fillStyle = '#d8c070'; g.beginPath(); g.ellipse(x, y, 2.4, 3.6, 0.5, 0, 7); g.fill(); g.fillStyle = '#8a7030'; g.fillRect(x - 1, y - 1, 1, 2); } },
    wheat() { wheat(g, 2); },
    bread() { outline(() => { g.fillStyle = '#c98a3a'; rr(g, 3, 11, 26, 14, 7); g.fill(); g.fillStyle = '#e8b060'; rr(g, 5, 12, 22, 8, 5); g.fill(); g.strokeStyle = '#8a5a20'; g.lineWidth = 1.5; for (const x of [10, 16, 22]) { g.beginPath(); g.moveTo(x - 2, 14); g.lineTo(x + 1, 19); g.stroke(); } }); },
    apple() { outline(() => { g.fillStyle = '#d83a3a'; g.beginPath(); g.arc(12, 19, 8, 0, 7); g.arc(20, 19, 8, 0, 7); g.fill(); g.fillStyle = '#ff7a7a'; g.fillRect(8, 15, 3, 3); g.strokeStyle = '#6a4220'; g.lineWidth = 2; g.beginPath(); g.moveTo(16, 13); g.lineTo(18, 5); g.stroke(); g.fillStyle = '#4ea335'; g.beginPath(); g.ellipse(21, 7, 5, 2.5, -0.4, 0, 7); g.fill(); }); },
    golden_apple() { outline(() => { g.fillStyle = '#f4c430'; g.beginPath(); g.arc(12, 19, 8, 0, 7); g.arc(20, 19, 8, 0, 7); g.fill(); g.fillStyle = '#fff6a0'; g.fillRect(8, 15, 3, 3); g.strokeStyle = '#6a4220'; g.lineWidth = 2; g.beginPath(); g.moveTo(16, 13); g.lineTo(18, 5); g.stroke(); g.fillStyle = '#4ea335'; g.beginPath(); g.ellipse(21, 7, 5, 2.5, -0.4, 0, 7); g.fill(); }); },
    raw_meat() { outline(() => { g.fillStyle = '#e07890'; rr(g, 5, 10, 22, 15, 7); g.fill(); g.fillStyle = '#f4b0c0'; g.fillRect(9, 12, 8, 3); g.fillStyle = '#f2ead0'; g.fillRect(22, 6, 3, 8); g.beginPath(); g.arc(24, 5, 3, 0, 7); g.fill(); }); },
    cooked_meat() { outline(() => { g.fillStyle = '#9a5428'; rr(g, 5, 10, 22, 15, 7); g.fill(); g.fillStyle = '#c47a3c'; g.fillRect(9, 12, 8, 3); g.fillStyle = '#f2ead0'; g.fillRect(22, 6, 3, 8); g.beginPath(); g.arc(24, 5, 3, 0, 7); g.fill(); }); },
    crystal_shard() { outline(() => { g.fillStyle = '#6fdcff'; g.beginPath(); g.moveTo(16, 3); g.lineTo(25, 14); g.lineTo(16, 29); g.lineTo(7, 14); g.closePath(); g.fill(); g.fillStyle = '#d6fbff'; g.beginPath(); g.moveTo(16, 3); g.lineTo(16, 29); g.lineTo(7, 14); g.closePath(); g.fill(); }); },
    sunstone() { outline(() => { g.fillStyle = '#ff9a3d'; g.beginPath(); g.moveTo(16, 4); g.lineTo(27, 12); g.lineTo(23, 27); g.lineTo(9, 27); g.lineTo(5, 12); g.closePath(); g.fill(); g.fillStyle = '#ffe0a0'; g.beginPath(); g.moveTo(16, 4); g.lineTo(5, 12); g.lineTo(16, 16); g.closePath(); g.fill(); }); },
    clay_ball() { outline(() => { g.fillStyle = '#b9806a'; g.beginPath(); g.arc(16, 17, 10, 0, 7); g.fill(); g.fillStyle = '#d8a090'; g.fillRect(10, 11, 5, 3); }); },
    bucket() { outline(() => { g.fillStyle = '#9aa0aa'; g.beginPath(); g.moveTo(6, 10); g.lineTo(26, 10); g.lineTo(23, 27); g.lineTo(9, 27); g.closePath(); g.fill(); g.strokeStyle = '#6a6e78'; g.lineWidth = 2; g.beginPath(); g.arc(16, 10, 9, Math.PI, 0); g.stroke(); g.fillStyle = 'rgba(255,255,255,0.4)'; g.fillRect(9, 12, 3, 12); }); },
    water_bucket() { f.bucket(); g.fillStyle = '#4a9cf0'; g.fillRect(8, 11, 16, 5); },
    lava_bucket() { f.bucket(); g.fillStyle = '#ff6a1a'; g.fillRect(8, 11, 16, 5); g.fillStyle = '#ffd040'; g.fillRect(11, 12, 5, 2); },
    glowshard() { outline(() => { const gr = g.createRadialGradient(16, 16, 1, 16, 16, 15); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,240,150,0.8)'); gr.addColorStop(1, 'rgba(255,200,60,0)'); g.fillStyle = gr; g.fillRect(0, 0, S, S); g.fillStyle = '#fff7c0'; g.beginPath(); g.moveTo(16, 3); g.lineTo(21, 14); g.lineTo(29, 16); g.lineTo(21, 19); g.lineTo(16, 29); g.lineTo(11, 19); g.lineTo(3, 16); g.lineTo(11, 14); g.closePath(); g.fill(); }); },
    arrow() { g.strokeStyle = '#8a5a2a'; g.lineWidth = 2; g.beginPath(); g.moveTo(5, 27); g.lineTo(24, 8); g.stroke(); g.fillStyle = '#9aa0aa'; g.beginPath(); g.moveTo(28, 4); g.lineTo(20, 8); g.lineTo(24, 12); g.closePath(); g.fill(); g.fillStyle = '#e8e8f0'; g.beginPath(); g.moveTo(5, 27); g.lineTo(5, 20); g.lineTo(11, 23); g.closePath(); g.fill(); g.beginPath(); g.moveTo(5, 27); g.lineTo(12, 27); g.lineTo(9, 21); g.closePath(); g.fill(); },
    bone() { outline(() => { g.strokeStyle = '#f2ead0'; g.lineWidth = 5; g.lineCap = 'round'; g.beginPath(); g.moveTo(8, 24); g.lineTo(24, 8); g.stroke(); for (const [x, y] of [[6, 22], [10, 26], [22, 6], [26, 10]]) { g.fillStyle = '#f2ead0'; g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); } }); },
    mob_gel() { outline(() => { g.fillStyle = '#7ad04a'; g.beginPath(); g.moveTo(5, 26); g.quadraticCurveTo(4, 8, 16, 8); g.quadraticCurveTo(28, 8, 27, 26); g.closePath(); g.fill(); g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(10, 12, 5, 3); }); },
    bow() { outline(() => { g.strokeStyle = '#8a5a2a'; g.lineWidth = 3; g.beginPath(); g.arc(6, 16, 16, -1.2, 1.2); g.stroke(); g.strokeStyle = '#f2f2f2'; g.lineWidth = 1; g.beginPath(); g.moveTo(11, 3); g.lineTo(11, 29); g.stroke(); }); },
    door() { g.drawImage(tileArt(B.door_closed), 0, 0); },
    dye_red() { dye(g, '#d9434b'); }, dye_yellow() { dye(g, '#f2cf3c'); }, dye_blue() { dye(g, '#3a78e0'); }, dye_green() { dye(g, '#4aa84a'); }, dye_black() { dye(g, '#2f2f36'); }, dye_pink() { dye(g, '#f08ab8'); },
    buddy_bell() { outline(() => { g.fillStyle = '#e8b030'; g.beginPath(); g.moveTo(6, 24); g.quadraticCurveTo(6, 6, 16, 6); g.quadraticCurveTo(26, 6, 26, 24); g.closePath(); g.fill(); g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(9, 10, 3, 9); g.fillStyle = '#8a5a1a'; g.fillRect(4, 24, 24, 3); g.beginPath(); g.arc(16, 28, 3, 0, 7); g.fill(); g.strokeStyle = '#4ad8ff'; g.lineWidth = 2; g.beginPath(); g.arc(16, 6, 3, 0, 7); g.stroke(); }); },
    warden_sigil() { outline(() => { g.fillStyle = '#5a5d68'; rr(g, 4, 4, 24, 24, 5); g.fill(); g.strokeStyle = '#ff9a3d'; g.lineWidth = 2; g.shadowColor = '#ff9a3d'; g.shadowBlur = 6; g.beginPath(); g.arc(16, 16, 7, 0, 7); g.moveTo(16, 6); g.lineTo(16, 26); g.moveTo(6, 16); g.lineTo(26, 16); g.stroke(); }); },
    fishing_rod() { outline(() => { g.strokeStyle = '#7a4e2a'; g.lineWidth = 3; g.lineCap = 'round'; g.beginPath(); g.moveTo(5, 28); g.lineTo(24, 6); g.stroke(); g.strokeStyle = '#fff'; g.lineWidth = 1; g.beginPath(); g.moveTo(24, 6); g.quadraticCurveTo(30, 14, 26, 24); g.stroke(); g.fillStyle = '#e63950'; g.beginPath(); g.arc(26, 25, 3, 0, 7); g.fill(); g.fillStyle = '#9aa0aa'; g.fillRect(9, 20, 5, 4); }); },
    fish() { outline(() => { g.fillStyle = '#6aa8e0'; g.beginPath(); g.moveTo(5, 16); g.quadraticCurveTo(14, 5, 24, 16); g.quadraticCurveTo(14, 27, 5, 16); g.fill(); g.fillStyle = '#4a82c0'; g.beginPath(); g.moveTo(22, 16); g.lineTo(29, 9); g.lineTo(29, 23); g.closePath(); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(10, 14, 2, 0, 7); g.fill(); g.fillStyle = '#222'; g.fillRect(10, 14, 1.5, 1.5); }); },
    cooked_fish() { outline(() => { g.fillStyle = '#c98a4a'; g.beginPath(); g.moveTo(5, 16); g.quadraticCurveTo(14, 5, 24, 16); g.quadraticCurveTo(14, 27, 5, 16); g.fill(); g.fillStyle = '#9a5a28'; g.beginPath(); g.moveTo(22, 16); g.lineTo(29, 9); g.lineTo(29, 23); g.closePath(); g.fill(); g.strokeStyle = '#6a3a18'; g.lineWidth = 1.5; for (const x of [11, 15, 19]) { g.beginPath(); g.moveTo(x, 12); g.lineTo(x, 20); g.stroke(); } }); },
  };
  (f[name] || (() => { g.fillStyle = '#c0c0c0'; rr(g, 6, 6, 20, 20, 5); g.fill(); }))();
}

function dye(g, col) {
  g.save(); g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = 2; g.shadowOffsetY = 1;
  g.fillStyle = '#e8d8b0'; rr(g, 9, 14, 14, 14, 4); g.fill(); g.fillStyle = '#9a7a4a'; g.fillRect(12, 10, 8, 5);
  g.fillStyle = col; g.beginPath(); g.ellipse(16, 18, 5.5, 3.5, 0, 0, 7); g.fill(); g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(13, 17, 3, 1.5); g.restore();
}

// ---------------------------------------------------------------- characters
export const SKINS = ['#ffd9b5', '#f2c38f', '#d9a066', '#b97a4a', '#8a5532', '#5e3a22', '#c9e8c0', '#cfd8ff'];
export const HAIRS = ['#2a1d16', '#5a3a22', '#8a5a2a', '#d8b050', '#d84a2a', '#f4f4f4', '#3a5ad8', '#d84aa8', '#4aa84a', '#8a3ad8'];
export const SHIRTS = ['#e04a4a', '#e8903a', '#f2d33c', '#6fcf4a', '#3aa0e8', '#6a5ad8', '#d84aa8', '#f4f4f4', '#2a2a30', '#4a8a6a', '#a05a2a', '#4ad8c8'];
export const PANTS = ['#3a4a8a', '#2a2a30', '#6a4a2a', '#4a6a3a', '#8a3a3a', '#d8d8d8', '#5a3a8a', '#2a6a7a'];
export const HAIR_STYLES = 6;

function armorColor(id) {
  const n = ITEMS[id] ? ITEMS[id].name : '';
  const m = /^(leather|copper|iron|gold|titanium)_/.exec(n);
  return m ? TIER_COL[m[1]] : null;
}

// feet at (x, y) in px; s = pixels per tile. st: {dir, t (walk phase), speed 0..1, air, swing 0..1, climb, held, armor:[h,b,f], blink, dead}
export function drawBlockhead(g, x, y, s, look, st) {
  const skin = SKINS[look.skin % SKINS.length], hair = HAIRS[look.hair % HAIRS.length];
  const shirt = SHIRTS[look.shirt % SHIRTS.length], pants = PANTS[look.pants % PANTS.length];
  const u = s / 32;
  g.save();
  g.translate(x, y);
  g.scale(st.dir < 0 ? -u : u, u);
  if (st.dead) { g.rotate(1.4); g.translate(0, -6); }
  const sw = Math.sin(st.t) * st.speed;
  const bob = st.air ? 0 : Math.abs(Math.sin(st.t)) * st.speed * 1.6;
  const legA = st.climb ? Math.sin(st.t * 1.4) * 0.6 : st.air ? 0.5 : sw * 0.7;
  const outline = 'rgba(30,20,30,0.9)';
  const limb = (px, py, w, h, ang, col, cap) => {
    g.save(); g.translate(px, py); g.rotate(ang);
    rr(g, -w / 2, 0, w, h, w * 0.45); g.fillStyle = col; g.fill(); g.lineWidth = 1.4; g.strokeStyle = outline; g.stroke();
    if (cap) { g.fillStyle = cap; rr(g, -w / 2, h - 5, w, 5, 2); g.fill(); }
    g.restore();
  };
  const bootCol = armorColor(st.armor && st.armor[2]);
  // back arm and leg
  limb(-3, -29 - bob, 5, 14, -sw * 0.6 + (st.air ? -0.5 : 0), shade(shirt, -35), skin);
  limb(-3, -17 - bob * 0.2, 6, 17, -legA, shade(pants, -30), bootCol || '#3a2a22');
  limb(3, -17 - bob * 0.2, 6, 17, legA, pants, bootCol || '#3a2a22');
  // torso
  const chest = armorColor(st.armor && st.armor[1]);
  g.save(); g.translate(0, -bob);
  rr(g, -8, -32, 16, 17, 5); g.fillStyle = chest || shirt; g.fill(); g.lineWidth = 1.4; g.strokeStyle = outline; g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(-6, -30, 4, 12);
  if (chest) { g.fillStyle = shade(chest, -50); g.fillRect(-8, -22, 16, 2); g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(-4, -30, 8, 2); }
  else { g.fillStyle = shade(shirt, -28); g.fillRect(-8, -18, 16, 3); }
  g.restore();
  // head
  g.save(); g.translate(1, -34 - bob);
  rr(g, -11, -22, 22, 22, 8); g.fillStyle = skin; g.fill(); g.lineWidth = 1.5; g.strokeStyle = outline; g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.28)'; g.fillRect(-8, -19, 5, 4);
  g.fillStyle = 'rgba(255,120,120,0.28)'; g.beginPath(); g.arc(6, -7, 2.6, 0, 7); g.fill();
  // hair styles
  g.fillStyle = hair;
  const hs = look.hairStyle % HAIR_STYLES;
  if (hs === 1) { rr(g, -12, -24, 24, 10, 6); g.fill(); g.fillRect(-12, -17, 5, 9); }
  else if (hs === 2) { g.beginPath(); for (let i = 0; i < 5; i++) { g.moveTo(-11 + i * 5, -19); g.lineTo(-9 + i * 5, -29 - (i % 2) * 3); g.lineTo(-6 + i * 5, -19); } g.fill(); rr(g, -11, -22, 22, 6, 3); g.fill(); }
  else if (hs === 3) { rr(g, -12, -24, 24, 12, 7); g.fill(); rr(g, -13, -20, 8, 24, 4); g.fill(); }
  else if (hs === 4) { rr(g, -3, -30, 7, 14, 3); g.fill(); }
  else if (hs === 5) { rr(g, -11, -23, 22, 7, 4); g.fill(); g.fillRect(-9, -3, 18, 3); }
  const blink = st.blink > 0;
  const ex = 3.4;
  // eyes
  if (st.dead) { g.strokeStyle = '#222'; g.lineWidth = 1.6; for (const dx of [1, 8]) { g.beginPath(); g.moveTo(dx - 2, -13); g.lineTo(dx + 2, -9); g.moveTo(dx + 2, -13); g.lineTo(dx - 2, -9); g.stroke(); } }
  else if (blink) { g.strokeStyle = '#222'; g.lineWidth = 1.5; for (const dx of [2, 8.5]) { g.beginPath(); g.moveTo(dx - 2, -10); g.lineTo(dx + 2, -10); g.stroke(); } }
  else for (const dx of [2, 8.5]) {
    g.fillStyle = '#fff'; g.beginPath(); g.ellipse(dx, -11, ex, 4, 0, 0, 7); g.fill(); g.lineWidth = 1; g.strokeStyle = outline; g.stroke();
    g.fillStyle = ['#2a2a30', '#2a62c8', '#2a9a4a', '#8a4a1a', '#8a2ac8'][look.eyes % 5]; g.beginPath(); g.arc(dx + 1, -10.5, 2, 0, 7); g.fill();
    g.fillStyle = '#fff'; g.fillRect(dx + 0.4, -12, 1, 1);
  }
  // mouth
  g.strokeStyle = '#7a2a2a'; g.lineWidth = 1.4; g.beginPath();
  if (st.hurt) { g.arc(6, -3, 2, Math.PI, 0); } else g.arc(6, -5.5, 3, 0.2, Math.PI - 0.2);
  g.stroke();
  if (st.band) { g.fillStyle = st.band; g.fillRect(-11, -17, 22, 4); g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(-11, -17, 22, 1); g.fillStyle = st.band; g.fillRect(-14, -16, 4, 3); g.fillRect(-16, -13, 4, 3); }
  // helmet
  const hel = armorColor(st.armor && st.armor[0]);
  if (hel) { g.fillStyle = hel; g.beginPath(); g.moveTo(-12, -12); g.quadraticCurveTo(-12, -26, 0, -26); g.quadraticCurveTo(12, -26, 12, -12); g.lineTo(12, -16); g.lineTo(-12, -16); g.closePath(); g.fill(); g.lineWidth = 1.4; g.strokeStyle = outline; g.stroke(); g.fillStyle = 'rgba(255,255,255,0.4)'; g.fillRect(-8, -24, 8, 2); g.fillStyle = shade(hel, -50); g.fillRect(-12, -17, 24, 2); }
  g.restore();
  // front arm (+ held item)
  g.save(); g.translate(5, -29 - bob);
  let ang = -sw * 0.6 * -1;
  if (st.climb) ang = Math.sin(st.t * 1.4 + 1) * 0.8 - 2.6;
  else if (st.swing > 0) ang = -1.2 - Math.sin((1 - st.swing) * Math.PI) * 1.6;
  else if (st.air) ang = -2.4;
  g.rotate(ang);
  rr(g, -2.5, 0, 5, 14, 2.2); g.fillStyle = shirt; g.fill(); g.lineWidth = 1.4; g.strokeStyle = outline; g.stroke();
  g.fillStyle = skin; rr(g, -2.5, 10, 5, 4, 2); g.fill();
  if (st.held) {
    const ic = itemIcon(st.held), def = ITEMS[st.held];
    g.translate(0, 13);
    const isTool = def && (def.tool || def.name === 'bow');
    g.rotate(isTool ? 0.9 : -0.3);
    const sz = isTool ? 22 : 15;
    g.drawImage(ic, -sz * 0.3, -sz * 0.78, sz, sz);
  }
  g.restore();
  g.restore();
}

// ---------------------------------------------------------------- creatures (feet at x,y; faces right)
export function drawMob(g, x, y, s, type, st) {
  const u = s / 32;
  g.save(); g.translate(x, y); g.scale(st.dir < 0 ? -u : u, u);
  const t = st.t, o = 'rgba(30,20,30,0.9)';
  const hurt = st.hurt;
  const col = (c) => (hurt ? '#ffffff' : c);
  const body = (px, py, rx, ry, c) => { g.beginPath(); g.ellipse(px, py, rx, ry, 0, 0, 7); g.fillStyle = col(c); g.fill(); g.lineWidth = 1.5; g.strokeStyle = o; g.stroke(); };
  const eye = (px, py, r = 2.4) => { g.fillStyle = '#fff'; g.beginPath(); g.arc(px, py, r, 0, 7); g.fill(); g.fillStyle = '#222'; g.beginPath(); g.arc(px + 0.8, py, r * 0.55, 0, 7); g.fill(); };
  if (type === 'waddler') {
    const w = Math.sin(t) * 2;
    g.fillStyle = col('#f2a23a'); g.fillRect(-5 + w, -4, 3, 4); g.fillRect(3 - w, -4, 3, 4);
    body(0, -14, 12, 11, '#f4f1ea'); body(-1, -11, 8, 7, '#fffdf4');
    body(-9, -14, 5, 7, '#cfc8bc');
    g.fillStyle = col('#f2a23a'); g.beginPath(); g.moveTo(10, -18); g.lineTo(17, -15); g.lineTo(10, -12); g.closePath(); g.fill(); g.stroke();
    eye(6, -19); g.fillStyle = col('#e04a4a'); g.fillRect(2, -26, 4, 3);
  } else if (type === 'hoppit') {
    const hop = st.air ? -3 : 0;
    body(-6, -7 + hop, 9, 7, '#d8c0a0'); body(5, -11 + hop, 6, 6, '#e6d0b2');
    g.save(); g.translate(5, -17 + hop); for (const r of [-0.15, 0.2]) { g.rotate(r); body(0, -6, 2.2, 7, '#e6d0b2'); } g.restore();
    eye(8, -12 + hop, 1.8); g.fillStyle = '#e08a9a'; g.beginPath(); g.arc(11, -9 + hop, 1.4, 0, 7); g.fill(); body(-14, -9 + hop, 3.4, 3.4, '#fff');
  } else if (type === 'gloomling') {
    const w = Math.sin(t) * 3;
    g.fillStyle = col('#1c1626'); g.fillRect(-5 + w, -14, 4, 14); g.fillRect(2 - w, -14, 4, 14);
    g.beginPath(); g.moveTo(-9, -12); g.quadraticCurveTo(-11, -34, 0, -40); g.quadraticCurveTo(11, -34, 9, -12); g.closePath(); g.fillStyle = col('#2b2040'); g.fill(); g.lineWidth = 1.5; g.strokeStyle = o; g.stroke();
    g.fillStyle = hurt ? '#fff' : '#ff4a6a'; g.shadowColor = '#ff4a6a'; g.shadowBlur = 6; g.beginPath(); g.ellipse(-2, -27, 2, 3, 0, 0, 7); g.ellipse(5, -27, 2, 3, 0, 0, 7); g.fill(); g.shadowBlur = 0;
    g.strokeStyle = col('#2b2040'); g.lineWidth = 4; g.beginPath(); g.moveTo(8, -24); g.lineTo(15, -20 + w); g.stroke();
  } else if (type === 'skitter') {
    g.strokeStyle = col('#2a2630'); g.lineWidth = 2.2;
    for (let i = 0; i < 4; i++) for (const sd of [-1, 1]) { const a = Math.sin(t * 1.5 + i) * 3; g.beginPath(); g.moveTo(sd * 3, -9); g.lineTo(sd * (9 + i * 2), -14 + a); g.lineTo(sd * (13 + i * 2), -1); g.stroke(); }
    body(0, -10, 10, 7, '#3a3340'); body(8, -11, 5, 4.5, '#2f2a36');
    g.fillStyle = hurt ? '#fff' : '#ffd23a'; for (const [ex, ey] of [[9, -13], [12, -12], [7, -12]]) { g.beginPath(); g.arc(ex, ey, 1.2, 0, 7); g.fill(); }
    g.fillStyle = '#c8344a'; g.beginPath(); g.arc(-4, -12, 2.4, 0, 7); g.fill();
  } else if (type === 'fishy') {
    const wag = Math.sin(t * 2) * 3;
    g.fillStyle = col('#f08a3a'); g.beginPath(); g.moveTo(-8, -2); g.lineTo(-16, -2 - 5 + wag); g.lineTo(-16, -2 + 5 + wag); g.closePath(); g.fill();
    body(0, -2, 9, 5.5, '#f6a84a'); g.fillStyle = 'rgba(255,255,255,0.4)'; g.fillRect(-3, -5, 8, 2); eye(5, -3, 1.6);
  } else if (type === 'stonewarden') {
    const w = Math.sin(t) * 3;
    g.fillStyle = col('#6c6f7a'); g.fillRect(-12 + w, -22, 10, 22); g.fillRect(3 - w, -22, 10, 22);
    rr(g, -20, -66, 40, 48, 8); g.fillStyle = col('#8a8d98'); g.fill(); g.lineWidth = 2; g.strokeStyle = o; g.stroke();
    g.fillStyle = 'rgba(0,0,0,0.2)'; for (const [cx, cy] of [[-12, -56], [6, -44], [-6, -30]]) g.fillRect(cx, cy, 10, 4);
    rr(g, -12, -86, 26, 24, 7); g.fillStyle = col('#9ea1ac'); g.fill(); g.stroke();
    g.fillStyle = hurt ? '#fff' : '#ff9a3d'; g.shadowColor = '#ff9a3d'; g.shadowBlur = 10; g.fillRect(-6, -78, 6, 4); g.fillRect(4, -78, 6, 4); g.shadowBlur = 0;
    rr(g, -34, -62 + w, 12, 40, 5); g.fillStyle = col('#7a7d88'); g.fill(); g.stroke(); rr(g, 22, -62 - w, 12, 40, 5); g.fill(); g.stroke();
    g.fillStyle = '#ff9a3d'; g.beginPath(); g.arc(0, -44, 5, 0, 7); g.fill();
  }
  g.restore();
}

export function drawChar(canvas, look) {
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, canvas.width, canvas.height);
  drawBlockhead(g, canvas.width / 2, canvas.height - 6, canvas.height / 60 * 32, look, { dir: 1, t: 0, speed: 0, blink: 0, held: 0, armor: [] });
}
