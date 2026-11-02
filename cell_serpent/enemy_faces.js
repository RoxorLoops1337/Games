// Enemy art, round 7 (agent 01): yell mouth on dashing faces, wail on hurt faces, per-species surge colours (ring + streaks),
// the dazed face that pops out of a killed head, and the tail tip. Everything is baked once per species / face through the
// kit's memoised bake(), and only drawn (drawImage or one arc) every frame. Coordinates are in bake units (R = 40).
const TAU = Math.PI * 2;
const MOUTH_Y = { love: 0.4, goggles: 0.5, sneeze: 0.46, grumpy: 0.58, sleepy: 0.48, shades: 0.52, sour: 0.5, cyclops: 0.6, shy: 0.52, sad: 0.58 };
const NO_BROW = { grumpy: 1, cyclops: 1, shades: 1, goggles: 1, sad: 1, sleepy: 1 };

export function createEnemyFaces(H) {
  const { bake, cel, poly, circ, ell, line, heartPath, sparkle, shade, INK, mix } = H;
  const ink = (g, w, col = INK) => { g.lineWidth = w; g.strokeStyle = col; g.lineCap = 'round'; g.lineJoin = 'round'; };

  // a big open mouth, baked per size: dark throat, tongue, two top teeth
  function mouthSpr(key, rx, ry, R, teeth) {
    const sz = R * 1.4;
    return bake(key, sz, sz, g => {
      ell(0, 0, rx, ry)(g); g.fillStyle = '#6a1230'; g.fill();
      g.save(); ell(0, 0, rx, ry)(g); g.clip();
      cel(g, '#ff7a9a', ell(0, ry * 0.78, rx * 0.8, ry * 0.5), { r: rx * 0.7, hi: false, lw: R * 0.04, shadow: '#d9486a' });
      if (teeth) { g.fillStyle = '#fffaf0'; for (const s of [-1, 1]) { g.beginPath(); g.rect(s * rx * 0.45 - rx * 0.3, -ry, rx * 0.6, ry * 0.42); g.fill(); } }
      g.restore();
      ink(g, R * 0.09); ell(0, 0, rx, ry)(g); g.stroke();
    }, 2);
  }
  // YELL: the face of a surging head opens wide and shakes (drawn over the normal mouth, after the face, face space)
  function yell(g, R, P, t) {
    const f = P.face, y = R * (MOUTH_Y[f] || 0.48), pulse = 0.9 + Math.abs(Math.sin(t * 26)) * 0.2;
    const spr = mouthSpr('yell|mouth', R * 0.3, R * 0.36, R, true);
    if (!NO_BROW[f]) for (const s of [-1, 1]) line(g, [[s * R * 0.66, -R * 0.52], [s * R * 0.14, -R * 0.34]], R * 0.13);
    if (!spr) return;
    const w = spr.w * 1.0, h = spr.h * pulse;
    g.drawImage(spr.c, -w / 2 + Math.sin(t * 50) * R * 0.02, y - h / 2, w, h);
    // two short shout ticks on each cheek
    g.save(); ink(g, R * 0.07, '#fffaf0'); for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * R * 0.62, y - R * 0.1); g.lineTo(s * R * 0.82, y - R * 0.22); g.moveTo(s * R * 0.66, y + R * 0.08); g.lineTo(s * R * 0.9, y + R * 0.1); g.stroke(); } g.restore();
  }
  // HURT: a small wobbling "ow" mouth and a tear, on top of the blink and the sparkles
  function wail(g, R, P, t) {
    const f = P.face, y = R * ((MOUTH_Y[f] || 0.48) + 0.02), spr = mouthSpr('wail|mouth', R * 0.17, R * 0.2, R, false);
    if (spr) g.drawImage(spr.c, -spr.w / 2 + Math.sin(t * 60) * R * 0.03, y - spr.h / 2, spr.w, spr.h);
    g.fillStyle = '#bfe9ff'; ink(g, R * 0.05); g.beginPath(); g.moveTo(-R * 0.62, R * 0.02); g.quadraticCurveTo(-R * 0.5, R * 0.22, -R * 0.62, R * 0.3); g.quadraticCurveTo(-R * 0.74, R * 0.22, -R * 0.62, R * 0.02); g.fill(); g.stroke();
  }
  // SURGE colours: ring around the head in the species palette (dashed and turning while it winds up, a hot solid ring while it runs)
  function surgeRing(g, R, P, t, warn) {
    g.save(); g.lineCap = 'round';
    if (warn) { g.globalAlpha = 0.65 + Math.sin(t * 40) * 0.25; g.strokeStyle = P.acc; g.lineWidth = R * 0.1; g.setLineDash([R * 0.36, R * 0.3]); g.lineDashOffset = -t * 60; g.beginPath(); g.arc(0, 0, R * 1.3, 0, TAU); g.stroke(); }
    else { const k = 1 + Math.sin(t * 36) * 0.04; g.globalAlpha = 0.95; g.strokeStyle = INK; g.lineWidth = R * 0.2; g.beginPath(); g.arc(0, 0, R * 1.26 * k, 0, TAU); g.stroke(); g.strokeStyle = P.acc; g.lineWidth = R * 0.11; g.stroke(); g.globalAlpha = 0.7; g.strokeStyle = P.lite; g.lineWidth = R * 0.035; g.beginPath(); g.arc(0, 0, R * 1.26 * k, -2.4, -0.7); g.stroke(); }
    g.restore();
  }
  // the speed streaks behind a non-boss surge, in the species colours (replaces the white ones)
  function streaks(c, R, P) {
    for (const dy of [-0.5, 0.5]) line(c, [[-R * 1.25, R * dy], [-R * 1.9, R * dy]], R * 0.09, P.acc);
    line(c, [[-R * 1.15, 0], [-R * 2.15, 0]], R * 0.13, P.lite);
    for (const s of [-1, 1]) cel(c, P.sh, poly([[-R * 0.95, s * R * 0.72], [-R * 1.35, s * R * 0.98], [-R * 1.2, s * R * 0.62]]), { r: R * 0.3, hi: false, lw: 2, shadow: shade(P.sh, 0.3) });
  }

  // DAZED: what is left of a popped face: x eyes, tongue out, a halo (baked per species body)
  function dazed(g, R, P) {
    const f = P.face;
    for (const s of [-1, 1]) { const x = s * R * 0.36, y = -R * 0.1, q = R * 0.17; line(g, [[x - q, y - q], [x + q, y + q]], R * 0.1); line(g, [[x - q, y + q], [x + q, y - q]], R * 0.1); }
    g.fillStyle = '#7a1633'; ell(0, R * 0.4, R * 0.2, R * 0.12)(g); g.fill(); ink(g, R * 0.07); g.stroke();
    cel(g, '#ff7a9a', ell(R * 0.06, R * 0.56, R * 0.11, R * 0.17), { r: R * 0.17, hi: false, lw: 2, shadow: '#d9486a' });
    if (f === 'love' || f === 'shy') for (const s of [-1, 1]) { g.globalAlpha = 0.55; g.fillStyle = '#ff6fa8'; ell(s * R * 0.62, R * 0.2, R * 0.16, R * 0.1)(g); g.fill(); g.globalAlpha = 1; }
    // the halo hovers above the head
    g.save(); g.translate(0, -R * 1.08); ink(g, R * 0.2); ell(0, 0, R * 0.52, R * 0.17)(g); g.stroke(); ink(g, R * 0.1, '#ffe066'); g.stroke(); g.restore();
  }

  // TAIL TIP: a little tapered tail with a species flourish, baked pointing along +x (backwards from the last cell is applied by the caller)
  function tailTip(g, R, P, skin) {
    const base = P.base, L = R * 1.15;
    cel(g, base, poly([[0, -R * 0.34], [L * 0.7, -R * 0.14], [L, 0], [L * 0.7, R * 0.14], [0, R * 0.34]]), { r: R * 0.5, hi: false, lw: R * 0.07, shadow: P.sh });
    const tx = L + R * 0.12;
    if (skin === 'love' || skin === 'piggy') cel(g, '#ff5a8a', heartPath(tx + R * 0.14, 0, R * 0.3), { r: R * 0.3, hi: false, lw: R * 0.06, shadow: '#c42a54' });
    else if (skin === 'sleepy') cel(g, '#fff8ec', circ(tx + R * 0.1, 0, R * 0.2), { r: R * 0.2, hi: false, lw: R * 0.06, shadow: '#e6d6c8' });
    else if (skin === 'frosty') { g.save(); g.translate(tx + R * 0.1, 0); sparkle(g, 0, 0, R * 0.34, '#f0fbff'); g.restore(); }
    else if (skin === 'rust') { cel(g, '#c98a4a', poly(Array.from({ length: 12 }, (_, i) => { const a = i / 12 * TAU, q = i % 2 ? R * 0.17 : R * 0.27; return [tx + R * 0.05 + Math.cos(a) * q, Math.sin(a) * q]; })), { r: R * 0.3, hi: false, lw: R * 0.05, shadow: '#8a4f22' }); }
    else if (skin === 'disco') cel(g, '#ff7eb6', poly([[tx - R * 0.08, 0], [tx + R * 0.14, -R * 0.2], [tx + R * 0.36, 0], [tx + R * 0.14, R * 0.2]]), { r: R * 0.3, hi: false, lw: R * 0.05, shadow: '#c93a8f' });
    else if (skin === 'sneezy') for (const dy of [-0.2, 0, 0.2]) line(g, [[L * 0.9, R * dy * 0.4], [tx + R * 0.3, R * dy]], R * 0.07);
    else if (skin === 'sour') cel(g, '#8fe058', poly([[L * 0.8, 0], [tx + R * 0.34, -R * 0.2], [tx + R * 0.1, 0], [tx + R * 0.34, R * 0.2]]), { r: R * 0.3, hi: false, lw: R * 0.05, shadow: '#3f9a3a' });
    else cel(g, P.acc, poly([[L * 0.8, -R * 0.16], [tx + R * 0.34, 0], [L * 0.8, R * 0.16]]), { r: R * 0.3, hi: false, lw: R * 0.05, shadow: shade(P.acc) });   // grumpy, mighty, gloomy: a pointy devil tip
  }

  return {
    yell, wail, surgeRing, streaks, dazed,
    tailSpr: (skin, P, R) => bake('tailtip|' + skin, R * 4.6, R * 1.6, g => { g.translate(R * 0.55, 0); tailTip(g, R, P, skin); }, 2),
  };
}
