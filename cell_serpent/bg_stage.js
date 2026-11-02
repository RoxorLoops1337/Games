// Stage atmosphere extras: drifting clouds, a plank floor with a footlight rail, boss arena light pillars
// and embers, phone lights in the crowd, vinyl grooves for the ring floor. Baked once or a few cheap draws per frame.
import { W, H, LINE_Y } from './sim.js';
import { mix } from './art_draw.js';

const TAU = Math.PI * 2;
function rnd(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }

// ---- baked into the background layer (after the speakers)
export function bakeStageExtras(c, th, boss) {
  const fh = H - LINE_Y;
  // plank seams in perspective, a soft sheen on the boards
  c.save(); c.strokeStyle = 'rgba(255,255,255,.05)'; c.lineWidth = 2;
  for (let i = 1; i < 6; i++) { const y = LINE_Y + fh * Math.pow(i / 6, 1.5); c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
  c.strokeStyle = 'rgba(0,0,0,.18)';
  for (let i = 1; i < 6; i++) { const y = LINE_Y + fh * Math.pow(i / 6, 1.5) + 2; c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
  const sh = c.createLinearGradient(0, LINE_Y, 0, LINE_Y + 60); sh.addColorStop(0, 'rgba(255,255,255,.1)'); sh.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = sh; c.fillRect(0, LINE_Y, W, 60);
  // the footlight rail: a dark strip with a brass edge, bulbs are animated on top
  c.fillStyle = '#0c0719'; c.beginPath(); c.roundRect(14, LINE_Y + 12, W - 28, 16, 8); c.fill();
  c.strokeStyle = mix(th.base, '#ffe9b0', 0.5) + '99'; c.lineWidth = 2; c.stroke();
  if (boss) {
    const g = c.createLinearGradient(0, LINE_Y, 0, H); g.addColorStop(0, 'rgba(255,40,80,.22)'); g.addColorStop(1, 'rgba(255,40,80,.05)');
    c.fillStyle = g; c.fillRect(0, LINE_Y, W, fh);
    // warning chevrons along the rail
    c.fillStyle = 'rgba(255,80,110,.35)';
    for (let x = 30; x < W - 30; x += 60) { c.beginPath(); c.moveTo(x, LINE_Y + 40); c.lineTo(x + 18, LINE_Y + 40); c.lineTo(x + 30, LINE_Y + 52); c.lineTo(x + 12, LINE_Y + 52); c.closePath(); c.fill(); }
  }
  c.restore();
}

// ---- clouds: one baked puffy sprite per world tint, five copies drifting at different depths
export const CLOUDS = [[170, 0.9, 7, 0], [300, 1.3, 4.5, 0.4], [430, 0.7, 10, 0.7], [560, 1.1, 5.5, 0.15], [680, 0.8, 8, 0.55]];
export function drawClouds(c, kit, skin, tint, k, t, boss, low) {
  const spr = kit && kit.bake('cloud|' + skin + '|' + tint, 260, 100, b => {
    const r = rnd(5); b.fillStyle = tint;
    for (const [x, y, s] of [[-80, 14, 30], [-40, -2, 42], [8, -12, 48], [58, 2, 38], [96, 14, 28], [0, 18, 52]]) { b.beginPath(); b.arc(x + (r() - 0.5) * 6, y, s, 0, TAU); b.fill(); }
    b.globalCompositeOperation = 'destination-out'; b.fillRect(-140, 34, 280, 60);   // flat bottom
  }, 1);
  if (!spr) return;
  const a = (boss ? 0.16 : 0.26) * (1 - 0.6 * k);
  c.save(); c.globalAlpha = a;
  const n = low ? 3 : CLOUDS.length;
  for (let i = 0; i < n; i++) {
    const [y, s, v, ph] = CLOUDS[i], span = W + 340, x = (((ph * span + t * v) % span) + span) % span - 170, w = 260 * s, h = 100 * s;
    c.drawImage(spr.c, x - w / 2, y - h / 2, w, h);
  }
  c.restore();
}

// ---- footlights: a bulb every 36px, a lit one chases along the rail and all of them kick on the beat
export function drawFootlights(c, t, pulse, th, boss) {
  c.save(); c.globalCompositeOperation = 'lighter';
  const n = 19, hot = Math.floor(t * 7) % n, col = boss ? '255,90,120' : '255,225,160', col2 = boss ? '255,150,90' : '140,230,255';
  for (let i = 0; i < n; i++) {
    const x = 28 + i * ((W - 56) / (n - 1)), d = Math.min(Math.abs(i - hot), n - Math.abs(i - hot)), on = d === 0 ? 1 : d === 1 ? 0.5 : 0, a = 0.35 + pulse * 0.25 + on * 0.4;
    c.fillStyle = `rgba(${i % 2 ? col : col2},${Math.min(1, a)})`; c.beginPath(); c.arc(x, LINE_Y + 20, 3.4 + on * 1.2, 0, TAU); c.fill();
    if (on || pulse > 0.5) { c.fillStyle = `rgba(${col},${0.08 + on * 0.08})`; c.beginPath(); c.arc(x, LINE_Y + 20, 14, 0, TAU); c.fill(); }
  }
  c.restore();
}

// ---- boss arena: red light pillars on both sides that breathe with the kick, embers rising off the floor
export function drawBossFx(c, t, pulse, low, kit) {
  c.save(); c.globalCompositeOperation = 'lighter';
  const spr = kit && kit.bake('bosspillar', 68, 560, b => {
    const g = b.createLinearGradient(0, -280, 0, 280); g.addColorStop(0, 'rgba(255,50,90,0)'); g.addColorStop(1, 'rgba(255,50,90,1)');
    b.fillStyle = g; b.fillRect(-34, -280, 68, 560); b.fillStyle = 'rgba(255,200,210,.9)'; b.fillRect(-5, -280 * 0.4, 10, 280 * 1.4);
  }, 1);
  if (spr) for (const x of [96, W - 96]) { c.globalAlpha = Math.min(1, 0.1 + pulse * 0.14 + Math.sin(t * 2 + x) * 0.03); c.drawImage(spr.c, x - 34, LINE_Y - 560); }
  c.globalAlpha = 1;
  const n = low ? 8 : 18;
  for (let i = 0; i < n; i++) {
    const ph = (t * (0.12 + (i % 5) * 0.03) + i * 0.173) % 1, x = (i * 97.3 + Math.sin(t + i) * 18) % W, y = H - 40 - ph * 520;
    c.fillStyle = `rgba(255,${120 + (i % 3) * 40},80,${0.6 * (1 - ph)})`; c.beginPath(); c.arc(x, y, 2.4 + (i % 3), 0, TAU); c.fill();
  }
  c.restore();
}

// ---- phone lights and glow sticks twinkling in the crowd
export function drawCrowdLights(c, t, th, boss, cheer, low) {
  c.save(); c.globalCompositeOperation = 'lighter';
  const n = low ? 6 : 14;
  for (let i = 0; i < n; i++) {
    const x = 20 + ((i * 53.7) % (W - 40)), y = H - 48 - (i % 3) * 9, b = 0.35 + 0.65 * Math.max(0, Math.sin(t * (1.1 + (i % 4) * 0.3) + i * 2.1)) + cheer * 0.3;
    c.fillStyle = `rgba(${i % 3 === 0 ? '255,240,180' : i % 3 === 1 ? '150,235,255' : '255,160,220'},${Math.min(0.9, 0.5 * b)})`;
    if (i % 2) { c.fillRect(x - 2, y - 7, 4, 12); } else { c.beginPath(); c.arc(x, y, 3.4, 0, TAU); c.fill(); }
    c.fillStyle = `rgba(255,255,255,${0.07 * b})`; c.beginPath(); c.arc(x, y, 13, 0, TAU); c.fill();
  }
  c.restore();
}

// ---- vinyl grooves + shine for the ring floor (drawn inside a baked disc, centre at x,y)
export function paintGrooves(b, x, y, R, boss) {
  b.save(); b.beginPath(); b.arc(x, y, R, 0, TAU); b.clip();
  b.strokeStyle = boss ? 'rgba(255,120,150,.10)' : 'rgba(255,210,235,.09)'; b.lineWidth = 1.2;
  for (let r = R * 0.22; r < R - 4; r += 7) { b.beginPath(); b.arc(x, y, r, 0, TAU); b.stroke(); }
  b.strokeStyle = 'rgba(255,255,255,.07)'; b.lineWidth = 8;
  for (const a0 of [-0.9, 2.25]) { b.beginPath(); b.arc(x, y, R * 0.62, a0, a0 + 0.55); b.stroke(); b.beginPath(); b.arc(x, y, R * 0.86, a0 + 0.1, a0 + 0.45); b.stroke(); }
  b.restore();
}
