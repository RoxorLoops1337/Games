// SHELL: canvas-painted textures for the title alley (bricks, graffiti mural, the BEATBOX HEROES sign, blade signs, soft glow). No em dashes.
import { THREE, canvasTex } from './kit.js';

const FONT = '"Fredoka","Arial Black","Trebuchet MS",system-ui,sans-serif';
const rr = (g, x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
function lcg(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }

// tileable brick: 4 bricks across, 8 courses; one tile = 1.2 m x 1.12 m (brick 0.3 x 0.14)
export function brickTex(gray) {
  const t = canvasTex(256, 256, (g, W, H) => {
    const R = lcg(7), cw = W / 4, ch = H / 8, pal = gray ? ['#9a9a9a', '#8a8a8a', '#aaaaaa', '#808080', '#b4b4b4', '#929292'] : ['#a8503f', '#9a4638', '#b9604a', '#8f4034', '#c27050', '#a04a3a'];
    g.fillStyle = gray ? '#cfcfcf' : '#c9b2a0'; g.fillRect(0, 0, W, H);
    for (let j = 0; j < 8; j++) for (let i = -1; i < 5; i++) {
      const x = i * cw + (j % 2 ? cw / 2 : 0) + 2, y = j * ch + 2, w = cw - 4, h = ch - 4;
      g.fillStyle = pal[Math.floor(R() * pal.length)]; g.fillRect(x, y, w, h);
      g.fillStyle = 'rgba(255,200,150,0.16)'; g.fillRect(x, y, w, 3);            // lit top edge
      g.fillStyle = 'rgba(40,10,30,0.22)'; g.fillRect(x, y + h - 4, w, 4);       // shaded bottom
      for (let k = 0; k < 5; k++) { g.fillStyle = R() < 0.5 ? 'rgba(40,16,20,0.16)' : 'rgba(255,220,180,0.10)'; g.fillRect(x + R() * w, y + R() * h, 2 + R() * 6, 1 + R() * 2); }
    }
    for (let i = 0; i < 26; i++) { const x = R() * W, y = R() * H; g.fillStyle = 'rgba(30,20,50,0.10)'; g.fillRect(x, y, 3 + R() * 18, 3 + R() * 10); }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

// the big graffiti piece behind the stage: equalizer bars, a boombox face, sound waves, stars, drips, tags. 512x256 (2:1)
export function muralTex() {
  return canvasTex(1024, 512, (g, W, H) => {
    const R = lcg(31);
    const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#2b2160'); bg.addColorStop(1, '#17123a'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(123,92,255,' + (0.05 + R() * 0.08) + ')'; g.beginPath(); g.arc(R() * W, R() * H, 20 + R() * 60, 0, 7); g.fill(); }
    // equalizer skyline
    const cols = ['#ff3ea5', '#2ee6ff', '#ffe14d', '#9dff4a', '#a86bff'];
    for (let i = 0; i < 20; i++) { const h = 70 + R() * 190, x = 30 + i * 47; g.fillStyle = cols[i % 5]; rr(g, x, H - h, 34, h, 8); g.fill(); g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x + 4, H - h + 4, 6, h - 14); g.fillStyle = 'rgba(30,10,60,0.35)'; for (let y = H - h + 18; y < H; y += 20) g.fillRect(x, y, 34, 3); }
    // giant boombox face
    const bx = W / 2, by = 215; g.fillStyle = '#17123a'; rr(g, bx - 250, by - 120, 500, 240, 36); g.fill(); g.lineWidth = 12; g.strokeStyle = '#ffe14d'; rr(g, bx - 250, by - 120, 500, 240, 36); g.stroke();
    [-1, 1].forEach((s) => { const cx = bx + s * 150, cy = by + 8; g.fillStyle = '#2b2160'; g.beginPath(); g.arc(cx, cy, 92, 0, 7); g.fill(); g.lineWidth = 10; g.strokeStyle = s < 0 ? '#ff3ea5' : '#2ee6ff'; g.stroke(); g.fillStyle = s < 0 ? '#ff3ea5' : '#2ee6ff'; g.beginPath(); g.arc(cx, cy, 44, 0, 7); g.fill(); g.fillStyle = '#fff6e8'; g.beginPath(); g.arc(cx - 12, cy - 12, 14, 0, 7); g.fill(); });
    g.fillStyle = '#ffe14d'; rr(g, bx - 74, by - 90, 148, 56, 12); g.fill(); g.fillStyle = '#17123a'; g.font = '900 36px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('BEATZ', bx, by - 62);
    for (let i = 0; i < 7; i++) { g.fillStyle = cols[i % 5]; g.fillRect(bx - 66 + i * 20, by - 8 - (i % 3) * 12, 12, 26 + (i % 3) * 12); }
    // sound waves + stars + drips
    g.lineWidth = 8; g.lineCap = 'round'; for (let k = 1; k <= 3; k++) { g.strokeStyle = 'rgba(255,225,77,' + (0.9 - k * 0.2) + ')'; g.beginPath(); g.arc(bx, by - 150, 36 + k * 30, Math.PI * 1.15, Math.PI * 1.85); g.stroke(); }
    for (let i = 0; i < 14; i++) { const x = R() * W, y = 20 + R() * 220, s = 5 + R() * 11; g.fillStyle = '#fff6e8'; g.beginPath(); for (let a = 0; a < 8; a++) { const r = a % 2 ? s * 0.4 : s; g.lineTo(x + Math.cos(a * Math.PI / 4) * r, y + Math.sin(a * Math.PI / 4) * r); } g.closePath(); g.fill(); }
    g.lineWidth = 5; for (let i = 0; i < 9; i++) { const x = 60 + R() * (W - 120); g.strokeStyle = cols[i % 5]; g.beginPath(); g.moveTo(x, H - 8 - R() * 100); g.lineTo(x, H - 8); g.stroke(); }
    g.save(); g.translate(120, 90); g.rotate(-0.12); g.font = '900 70px ' + FONT; g.lineWidth = 12; g.strokeStyle = '#17123a'; g.strokeText('FOXY', 0, 0); g.fillStyle = '#ff3ea5'; g.fillText('FOXY', 0, 0); g.restore();
    g.save(); g.translate(W - 150, 110); g.rotate(0.1); g.font = '900 64px ' + FONT; g.lineWidth = 12; g.strokeStyle = '#17123a'; g.strokeText('TAY', 0, 0); g.fillStyle = '#2ee6ff'; g.fillText('TAY', 0, 0); g.restore();
  });
}

// the hero element: BEATBOX HEROES, brand look of the 2D logo (gold bevel + violet extrusion, cyan and pink equalizer bars, gold underline) on a dark plaque with a marquee frame.
// phase 0/1 = which bulbs of the chase are lit; mask = draw ONLY the dead letter (used for the flicker overlay)
export function signTex(phase, mask) {
  return canvasTex(1024, 512, (g, W, H) => {
    g.clearRect(0, 0, W, H);
    if (!mask) {
      const pl = g.createLinearGradient(0, 0, 0, H); pl.addColorStop(0, '#2a1a58'); pl.addColorStop(1, '#170f36'); g.fillStyle = pl; rr(g, 14, 14, W - 28, H - 28, 54); g.fill();
      g.lineWidth = 10; const nb = g.createLinearGradient(0, 0, W, 0); nb.addColorStop(0, '#2ee6ff'); nb.addColorStop(1, '#ff3ea5'); g.strokeStyle = nb; rr(g, 30, 30, W - 60, H - 60, 44); g.stroke();
      g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,0.6)'; rr(g, 30, 30, W - 60, H - 60, 44); g.stroke();
      // marquee bulbs on the outer rim
      const n = 36, per = 2 * (W - 120 + H - 120);
      for (let i = 0; i < n; i++) {
        let d = (i / n) * per, x, y; const wA = W - 120, hA = H - 120;
        if (d < wA) { x = 60 + d; y = 22; } else if ((d -= wA) < hA) { x = W - 22; y = 60 + d; } else if ((d -= hA) < wA) { x = W - 60 - d; y = H - 22; } else { d -= wA; x = 22; y = H - 60 - d; }
        const on = (i + phase) % 2 === 0; g.fillStyle = on ? '#fff0a0' : '#6a4a20'; g.beginPath(); g.arc(x, y, on ? 9 : 6, 0, 7); g.fill();
      }
    }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const word = (str, y, size, track) => {
      g.font = '900 ' + size + 'px ' + FONT; try { g.letterSpacing = track + 'px'; } catch (e) { /* older engines */ }
      const full = g.measureText(str).width, x0 = W / 2 - full / 2; let x = x0; const spans = [];
      for (const ch of str) { const w = g.measureText(ch).width; spans.push([ch, x + w / 2, w]); x += w + track; }
      return spans;
    };
    const drawWord = (str, y, size, track, deadIdx) => {
      g.font = '900 ' + size + 'px ' + FONT; try { g.letterSpacing = track + 'px'; } catch (e) { /* ignore */ } { const wfull = g.measureText(str).width, maxW = W - 150; if (wfull > maxW) { size = Math.floor(size * maxW / wfull); track = Math.floor(track * maxW / wfull); } }
      const sp = word(str, y, size, track); g.textAlign = 'center';
      g.font = '900 ' + size + 'px ' + FONT; try { g.letterSpacing = '0px'; } catch (e) { /* ignore */ }
      sp.forEach(([ch, cx], i) => {
        if (mask && i !== deadIdx) return;
        if (mask) { g.fillStyle = '#1a1038'; g.fillText(ch, cx, y); return; }
        for (let k = 12; k >= 1; k--) { g.fillStyle = k > 8 ? '#2c1d4d' : k > 4 ? '#4c2f86' : '#6a46ae'; g.fillText(ch, cx + k * 0.9, y + k * 0.9); }
        const gr = g.createLinearGradient(0, y - size * 0.5, 0, y + size * 0.5); gr.addColorStop(0, '#fffbd8'); gr.addColorStop(0.18, '#ffe66a'); gr.addColorStop(0.5, '#ffd23a'); gr.addColorStop(0.75, '#d4a017'); gr.addColorStop(1, '#8c5410');
        g.lineWidth = size * 0.07; g.strokeStyle = '#6a3f0c'; g.lineJoin = 'round'; g.strokeText(ch, cx, y); g.fillStyle = gr; g.fillText(ch, cx, y);
        g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,230,0.75)'; g.strokeText(ch, cx - 1.5, y - 1.5);
      });
      return sp;
    };
    drawWord('BEATBOX', 205, 190, 6, mask ? 6 : -1);
    drawWord('HEROES', 360, 120, 24, -1);
    if (!mask) {
      const bars = [[44, 5, 2], [66, 5, 1], [88, 5, 3], [110, 5, 2]];
      [-1, 1].forEach((s) => bars.forEach(([off, , h], i) => { const hh = [34, 70, 100, 52][i] * (0.8 + 0.1 * h); const x = s < 0 ? 80 + i * 24 : W - 80 - i * 24 - 14; g.fillStyle = (i + (s < 0 ? 0 : 1)) % 2 ? '#2ee6ff' : '#ff3ea5'; rr(g, x, 360 - hh / 2, 14, hh, 5); g.fill(); g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(x + 2, 360 - hh / 2 + 3, 3, hh - 6); void off; }));
      g.fillStyle = '#d4a017'; rr(g, W / 2 - 250, 438, 500, 14, 6); g.fill(); g.fillStyle = '#fff0a0'; g.fillRect(W / 2 - 246, 440, 492, 3);
      ['#ff3ea5', '#2ee6ff', '#fff6b8', '#ff3ea5'].forEach((c, i) => { g.fillStyle = c; g.fillRect(W / 2 - 150 + i * 100, 426 - (i % 2) * 8, 8, 28 + (i % 2) * 8); });
    }
  });
}

// vertical blade sign (hangs from the wall): text stacked, neon tube style
export function bladeTex(text, color, sub) {
  return canvasTex(128, 384, (g, W, H) => {
    g.clearRect(0, 0, W, H); g.fillStyle = '#150e30'; rr(g, 6, 6, W - 12, H - 12, 22); g.fill();
    g.lineWidth = 7; g.strokeStyle = color; rr(g, 14, 14, W - 28, H - 28, 16); g.stroke(); g.lineWidth = 2.5; g.strokeStyle = 'rgba(255,255,255,0.8)'; rr(g, 14, 14, W - 28, H - 28, 16); g.stroke();
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '900 56px ' + FONT; const L = text.split(''), step = 62, y0 = H / 2 - (L.length - 1) * step / 2 - (sub ? 14 : 0);
    L.forEach((c, i) => { g.shadowColor = color; g.shadowBlur = 14; g.lineWidth = 6; g.strokeStyle = color; g.strokeText(c, W / 2, y0 + i * step); g.fillStyle = '#fff6e8'; g.fillText(c, W / 2, y0 + i * step); g.shadowBlur = 0; });
    if (sub) { g.font = '800 24px ' + FONT; g.fillStyle = color; g.fillText(sub, W / 2, H - 38); }
  });
}

// small flat poster / sticker sheet used on walls (stripes of colour with a face), fully procedural
export function posterTex(seed, a, b) {
  return canvasTex(128, 192, (g, W, H) => {
    const R = lcg(seed); g.fillStyle = a; g.fillRect(0, 0, W, H); g.fillStyle = b; for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(R() * W, R() * H, 20 + R() * 40, 0, 7); g.fill(); }
    g.fillStyle = 'rgba(255,246,232,0.92)'; rr(g, 12, 14, W - 24, 46, 8); g.fill(); g.fillStyle = '#17123a'; g.font = '900 30px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(['LIVE', 'BEATS', 'BATTLE', 'OPEN MIC'][seed % 4], W / 2, 38);
    g.fillStyle = 'rgba(23,18,58,0.85)'; g.beginPath(); g.arc(W / 2, 112, 30, 0, 7); g.fill(); g.fillStyle = b; g.beginPath(); g.arc(W / 2, 112, 16, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,246,232,0.8)'; g.fillRect(14, H - 28, W - 28, 6); g.fillRect(14, H - 16, W - 60, 5);
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 3; g.strokeRect(1, 1, W - 2, H - 2);
  });
}

// soft round glow (white centre fading out), tinted per use through Points colour / material colour
export function glowTex() {
  return canvasTex(64, 64, (g, W, H) => { const r = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W / 2); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,0.55)'); r.addColorStop(0.6, 'rgba(255,255,255,0.14)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, W, H); });
}
// vertical streak ripple on a puddle (mirror of a neon light): used as reflection card
export function reflectTex(color) {
  return canvasTex(64, 256, (g, W, H) => { const r = g.createLinearGradient(0, 0, 0, H); r.addColorStop(0, color); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(W * 0.3, 0, W * 0.4, H); const s = g.createLinearGradient(0, 0, W, 0); s.addColorStop(0, 'rgba(0,0,0,1)'); s.addColorStop(0.5, 'rgba(0,0,0,0)'); s.addColorStop(1, 'rgba(0,0,0,1)'); g.globalCompositeOperation = 'destination-out'; g.fillStyle = s; g.fillRect(0, 0, W, H); });
}
