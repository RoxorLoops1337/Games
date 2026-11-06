// 01 enemy art b11: when one head of a two-snake stage pops, the surviving heads react in their own species style.
// Three moods: frown (worried brows, a sweat drop, a species glyph), cheer (a wide grin and sparkles) and shock (a round mouth and a pop-up "!").
// Pure drawing in face space (R = the head radius in bake units), no allocations, no sprites needed: a handful of paths for ~1.7 seconds.
const TAU = Math.PI * 2;
export const SIB_TIME = 1.7;   // seconds the reaction lasts
export const SIB_MOOD = {
  love: 'frown', rust: 'shock', sneezy: 'frown', grumpy: 'cheer', sleepy: 'shock', disco: 'cheer',
  sour: 'frown', mighty: 'cheer', frosty: 'frown', piggy: 'frown', gloomy: 'cheer',
};
export const sibMood = skin => SIB_MOOD[skin] || 'frown';
const INK = '#2d170f';
// u = elapsed 0..1 of the reaction; t = the head's own clock (for wobble)
export function drawSiblingReact(g, R, skin, u, t) {
  if (!(u >= 0 && u < 1)) return;
  const mood = sibMood(skin), pop = Math.min(1, u * 6), a = u < 0.75 ? 1 : Math.max(0, 1 - (u - 0.75) / 0.25), s = 0.6 + 0.4 * pop + Math.sin(u * 18) * 0.04 * (1 - u);
  g.save(); g.globalAlpha *= a; g.lineCap = 'round'; g.lineJoin = 'round';
  const stroke = (w, c) => { g.lineWidth = w; g.strokeStyle = c; g.stroke(); };
  if (mood === 'frown') {
    // worried brows: the inner ends climb, drawn over the normal face
    for (const q of [-1, 1]) { g.beginPath(); g.moveTo(q * R * 0.7, -R * 0.2); g.lineTo(q * R * 0.12, -R * 0.52 - Math.sin(u * 14) * R * 0.02); stroke(R * 0.15, INK); }
    // a quivering little frown over the mouth area
    g.fillStyle = '#7a1633'; g.beginPath(); g.ellipse(0, R * 0.5, R * 0.17 * s, R * 0.1 * s, 0, 0, TAU); g.fill(); stroke(R * 0.06, INK);
    // sweat drop sliding down the temple
    const dy = u * R * 0.6; g.fillStyle = '#bfe9ff'; g.beginPath(); g.moveTo(-R * 0.84, -R * 0.5 + dy); g.quadraticCurveTo(-R * 0.66, -R * 0.2 + dy, -R * 0.84, -R * 0.1 + dy); g.quadraticCurveTo(-R * 1.02, -R * 0.2 + dy, -R * 0.84, -R * 0.5 + dy); g.fill(); stroke(R * 0.05, INK);
    // the species glyph above the head: love and piggy see a broken heart, frosty a shiver mark, the others a gloomy squiggle
    g.save(); g.translate(R * 0.78, -R * 1.02 - u * R * 0.25); g.scale(s, s);
    if (skin === 'love' || skin === 'piggy') {
      for (const q of [-1, 1]) { g.beginPath(); g.moveTo(0, R * 0.34); g.bezierCurveTo(q * R * 0.5, R * 0.05, q * R * 0.3, -R * 0.34, q * R * 0.02, -R * 0.12); g.lineTo(q * R * 0.02, R * 0.34); g.closePath(); g.fillStyle = '#ff3d7a'; g.fill(); stroke(R * 0.06, INK); }
      g.beginPath(); g.moveTo(0, -R * 0.14); g.lineTo(-R * 0.08, R * 0.04); g.lineTo(R * 0.08, R * 0.12); g.lineTo(0, R * 0.34); stroke(R * 0.05, '#fff8ec');
    } else {
      g.beginPath(); for (let i = 0; i <= 8; i++) { const x = (i / 8 - 0.5) * R * 0.7, y = (i & 1 ? 1 : -1) * R * 0.1; if (i) g.lineTo(x, y); else g.moveTo(x, y); } stroke(R * 0.09, INK); stroke(R * 0.04, '#bfe9ff');
    }
    g.restore();
  } else if (mood === 'cheer') {
    // a wide open grin with a tongue, drawn over the mouth, and two happy sparkles
    g.fillStyle = '#7a1633'; g.beginPath(); g.moveTo(-R * 0.34, R * 0.34); g.quadraticCurveTo(0, R * (0.34 + 0.5 * s), R * 0.34, R * 0.34); g.closePath(); g.fill(); stroke(R * 0.07, INK);
    g.fillStyle = '#ff7a9a'; g.beginPath(); g.ellipse(0, R * 0.62, R * 0.14, R * 0.08 * s, 0, 0, TAU); g.fill();
    g.fillStyle = '#fffaf0'; g.fillRect(-R * 0.28, R * 0.35, R * 0.56, R * 0.07);
    for (const q of [-1, 1]) {   // joyful ^ ^ brows lift
      g.beginPath(); g.moveTo(q * R * 0.62, -R * 0.42); g.lineTo(q * R * 0.34, -R * 0.55 - Math.abs(Math.sin(u * 20)) * R * 0.05); g.lineTo(q * R * 0.1, -R * 0.42); stroke(R * 0.1, INK);
    }
    for (const [x, y, k] of [[-0.86, -0.62, 0], [0.9, -0.36, 0.5]]) {
      const q = 0.5 + 0.5 * Math.sin(t * 9 + k * 6), r = R * (0.12 + 0.1 * q) * s;
      g.save(); g.translate(R * x, R * y - u * R * 0.2); g.beginPath(); for (let i = 0; i < 8; i++) { const rr = i & 1 ? r * 0.25 : r, an = i * Math.PI / 4; g.lineTo(Math.cos(an) * rr, Math.sin(an) * rr); } g.closePath(); g.fillStyle = skin === 'disco' ? '#ff7eb6' : '#fff8ec'; g.fill(); stroke(R * 0.04, INK); g.restore();
    }
  } else {
    // shock: eyes spring wide, a round mouth and an exclamation mark pops over the head
    for (const q of [-1, 1]) { g.fillStyle = '#fff'; g.beginPath(); g.ellipse(q * R * 0.36, -R * 0.1, R * 0.28 * s, R * 0.33 * s, 0, 0, TAU); g.fill(); stroke(R * 0.08, INK); g.fillStyle = INK; g.beginPath(); g.arc(q * R * 0.36, -R * 0.08, R * 0.07, 0, TAU); g.fill(); }
    g.fillStyle = '#7a1633'; g.beginPath(); g.ellipse(0, R * 0.5, R * 0.14 * s, R * 0.2 * s, 0, 0, TAU); g.fill(); stroke(R * 0.07, INK);
    g.save(); g.translate(R * 0.8, -R * 1.08 - Math.abs(Math.sin(u * 10)) * R * 0.08 * (1 - u)); g.scale(s, s);
    g.beginPath(); g.moveTo(-R * 0.1, -R * 0.3); g.lineTo(R * 0.1, -R * 0.3); g.lineTo(R * 0.06, R * 0.08); g.lineTo(-R * 0.06, R * 0.08); g.closePath(); g.fillStyle = '#ff5a78'; g.fill(); stroke(R * 0.06, INK);
    g.beginPath(); g.arc(0, R * 0.26, R * 0.08, 0, TAU); g.fill(); stroke(R * 0.05, INK);
    g.restore();
  }
  g.restore();
}

// 01 enemy art b11: a boss in phase 2 is furious: bared teeth over the mouth and two steam puffs that rise from the sides of the head.
export function drawBossRage(g, R, t) {
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
  const my = R * 0.5, w = R * 0.4, ch = Math.sin(t * 24) * R * 0.015;
  g.fillStyle = '#7a1633'; g.beginPath(); g.moveTo(-w, my - R * 0.1); g.lineTo(w, my - R * 0.1); g.lineTo(w * 0.85, my + R * 0.14 + ch); g.lineTo(-w * 0.85, my + R * 0.14 + ch); g.closePath(); g.fill();
  g.lineWidth = R * 0.07; g.strokeStyle = INK; g.stroke();
  g.fillStyle = '#fffaf0'; g.beginPath(); g.moveTo(-w * 0.9, my - R * 0.1); for (let i = 0; i < 6; i++) { g.lineTo(-w * 0.9 + (i + 0.5) * w * 0.3, my + R * 0.06); g.lineTo(-w * 0.9 + (i + 1) * w * 0.3, my - R * 0.1); } g.fill();
  for (const q of [-1, 1]) for (let k = 0; k < 2; k++) {
    const u = (t * 1.3 + k * 0.5 + (q > 0 ? 0.25 : 0)) % 1, x = q * (R * 1.0 + u * R * 0.28), y = -R * 0.45 - u * R * 0.8, r = R * (0.1 + u * 0.16);
    g.globalAlpha = (1 - u) * 0.85; g.fillStyle = '#fff8ec'; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.lineWidth = R * 0.04; g.strokeStyle = INK; g.stroke();
  }
  g.restore();
}
