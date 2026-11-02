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
  function dazed(g, R, P, boss) {
    const f = P.face;
    for (const s of [-1, 1]) { const x = s * R * 0.36, y = -R * 0.1, q = R * 0.17; line(g, [[x - q, y - q], [x + q, y + q]], R * 0.1); line(g, [[x - q, y + q], [x + q, y - q]], R * 0.1); }
    g.fillStyle = '#7a1633'; ell(0, R * 0.4, R * 0.2, R * 0.12)(g); g.fill(); ink(g, R * 0.07); g.stroke();
    cel(g, '#ff7a9a', ell(R * 0.06, R * 0.56, R * 0.11, R * 0.17), { r: R * 0.17, hi: false, lw: 2, shadow: '#d9486a' });
    if (f === 'love' || f === 'shy') for (const s of [-1, 1]) { g.globalAlpha = 0.55; g.fillStyle = '#ff6fa8'; ell(s * R * 0.62, R * 0.2, R * 0.16, R * 0.1)(g); g.fill(); g.globalAlpha = 1; }
    // the halo hovers above the head
    g.save(); g.translate(0, -R * (boss ? 1.5 : 1.08)); ink(g, R * 0.2); ell(0, 0, R * 0.52, R * 0.17)(g); g.stroke(); ink(g, R * 0.1, '#ffe066'); g.stroke(); g.restore();
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

  // SPINE (r8): a mid-snake cell reads as one body: a belly stripe on the +y side and a species back ridge on the -y side. Cells
  // rotate along the path, so these line up from cell to cell. Baked into the body sprite once per species.
  const BELLY = { love: 'band', sneezy: 'band', sleepy: 'dots', disco: 'sequin', piggy: 'band', frosty: 'band', sour: 'band', rust: 'band', grumpy: 'band', mighty: 'band', gloomy: 'dots' };
  const RIDGE = { love: 'hearts', rust: 'bolts', sneezy: 'fluff', grumpy: 'shards', sleepy: 'puffs', disco: 'gems', sour: 'fin', mighty: 'moss', frosty: 'ice', piggy: 'curl', gloomy: 'spikes' };
  function spine(g, r, P, k, o) {   // r9: o = { clip: path fn for the armor/mender silhouettes, ridge: false to skip the back ridge }
    const kind = BELLY[k], bc = k === 'frosty' ? '#8cc4e6' : '#fff3dc';
    if (kind) {
      g.save(); (o && o.clip ? o.clip : circ(0, 0, r * 0.88))(g); g.clip(); g.lineCap = 'round';
      if (kind === 'band') { g.globalAlpha = 0.88; g.fillStyle = bc; g.beginPath(); g.moveTo(-r, r * 0.4); g.quadraticCurveTo(0, r * 0.64, r, r * 0.4); g.lineTo(r, r * 1.1); g.lineTo(-r, r * 1.1); g.closePath(); g.fill(); g.globalAlpha = 0.65; g.strokeStyle = P.sh; g.lineWidth = r * 0.05; g.beginPath(); g.moveTo(-r, r * 0.4); g.quadraticCurveTo(0, r * 0.64, r, r * 0.4); g.stroke(); }
      else if (kind === 'dots') { g.globalAlpha = 0.95; g.fillStyle = bc; for (let i = -2; i <= 2; i++) { circ(i * r * 0.34, r * 0.62 + (i & 1 ? 0 : r * 0.04), r * 0.075)(g); g.fill(); } }
      else { for (let i = -3; i <= 3; i++) { g.globalAlpha = 0.9; g.fillStyle = i & 1 ? '#ff9ad6' : '#ffffff'; circ(i * r * 0.27, r * 0.64, r * 0.065)(g); g.fill(); } }
      g.restore();
    }
    const q = o && o.ridge === false ? null : RIDGE[k], sd = (fn) => { g.save(); fn(); g.restore(); };
    const stud = (x, w, h, col, sh) => cel(g, col, poly([[x - w, -r * 0.8], [x + w, -r * 0.8], [x, -r * (0.8 + h)]]), { r: r * 0.3, hi: false, lw: 2, shadow: sh });
    if (q === 'hearts') sd(() => cel(g, '#ff5a8a', heartPath(r * 0.02, -r * 0.92, r * 0.2), { r: r * 0.2, hi: false, lw: 1.8, shadow: '#c42a54' }));
    else if (q === 'bolts') sd(() => cel(g, '#c98a4a', circ(r * 0.02, -r * 0.9, r * 0.15), { r: r * 0.15, hi: false, lw: 2, shadow: '#8a4f22' }));
    else if (q === 'fluff') sd(() => { for (const dx of [-0.08, 0.1]) line(g, [[r * dx, -r * 0.86], [r * (dx * 1.8), -r * 1.08]], r * 0.07); });
    else if (q === 'shards') stud(r * 0.02, r * 0.12, 0.34, '#ff5a78', '#c42a54');
    else if (q === 'puffs') sd(() => cel(g, '#fff8ec', circ(r * 0.02, -r * 0.92, r * 0.13), { r: r * 0.13, hi: false, lw: 1.8, shadow: '#e6d6c8' }));
    else if (q === 'gems') sd(() => { g.translate(r * 0.02, -r * 0.92); cel(g, '#ff9ac6', poly([[0, -r * 0.16], [r * 0.12, 0], [0, r * 0.16], [-r * 0.12, 0]]), { r: r * 0.16, hi: false, lw: 1.8, shadow: '#d9488f' }); });
    else if (q === 'fin') stud(r * 0.02, r * 0.16, 0.3, '#2f7a3a', '#1f4f27');
    else if (q === 'moss') sd(() => { cel(g, '#7ad04a', circ(r * 0.02, -r * 0.9, r * 0.13), { r: r * 0.13, hi: false, lw: 1.8, shadow: '#4a8f2a' }); });
    else if (q === 'ice') sd(() => { g.translate(r * 0.02, -r * 0.95); sparkle(g, 0, 0, r * 0.2, '#ffffff'); });
    else if (q === 'curl') sd(() => { cel(g, '#ffd84d', circ(r * 0.02, -r * 0.9, r * 0.13), { r: r * 0.13, hi: false, lw: 1.8, shadow: '#d98f1a' }); });
    else if (q === 'spikes') stud(r * 0.02, r * 0.14, 0.36, '#9dff6d', '#4fb02a');
  }

  // BOSS DAZED (r8): a popped boss face keeps its crown, knocked askew, so the kill reads as a king falling
  function dazedCrown(g, R, crownFn) { g.save(); g.translate(R * 0.2, -R * 0.78); g.rotate(0.38); crownFn(g); g.restore(); }

  // IDLE BITS (r10): small living details for the quiet species, drawn over the face when it is calm (no allocations, only arcs and lines).
  // sleepy: a snore bubble swells from its mouth and pops; sad: a tear rolls down from the eye and falls; shy: the scarf end flutters.
  function idleBits(g, R, P, t, boss) {
    const f = P.face;
    if (f === 'sleepy' && !boss) {
      const k = (t % 4.2) / 4.2, grow = k < 0.8 ? k / 0.8 : 1, rr = R * (0.05 + 0.28 * grow * grow + Math.sin(t * 3) * 0.01 * grow);
      if (k < 0.8) { g.save(); g.globalAlpha = 0.85; g.fillStyle = 'rgba(200,235,255,.55)'; g.beginPath(); g.arc(R * 0.18 + rr * 0.6, R * 0.44 + rr * 0.2, rr, 0, TAU); g.fill(); ink(g, R * 0.05, '#ffffff'); g.stroke(); g.fillStyle = '#fff'; g.beginPath(); g.arc(R * 0.18 + rr * 0.15, R * 0.44 - rr * 0.1, rr * 0.22, 0, TAU); g.fill(); g.restore(); }
      else if (k < 0.88) { const q = (k - 0.8) / 0.08; g.save(); g.globalAlpha = 1 - q; ink(g, R * 0.045, '#ffffff'); const rp = R * 0.25 * (1 + q * 0.5); for (let i = 0; i < 6; i++) { const a = i * 1.047 + 0.3; g.beginPath(); g.moveTo(R * 0.18 + R * 0.15 + Math.cos(a) * rp, R * 0.5 + Math.sin(a) * rp); g.lineTo(R * 0.18 + R * 0.15 + Math.cos(a) * (rp + R * 0.1), R * 0.5 + Math.sin(a) * (rp + R * 0.1)); g.stroke(); } g.restore(); }
    } else if (f === 'sad') {
      const k = (t % 2.6) / 2.6, x = R * 0.34 + R * 0.04, y = R * 0.18 + k * k * R * 0.95;
      g.save(); g.globalAlpha = k < 0.85 ? 0.95 : (1 - k) / 0.15 * 0.95; g.fillStyle = '#9fd8ff'; ink(g, R * 0.035, '#5aa8e0'); g.beginPath(); g.moveTo(x, y - R * 0.1); g.quadraticCurveTo(x + R * 0.08, y + R * 0.02, x, y + R * 0.07); g.quadraticCurveTo(x - R * 0.08, y + R * 0.02, x, y - R * 0.1); g.fill(); g.stroke(); g.restore();
    } else if (f === 'shy') {
      const fl = Math.sin(t * 4.2) * R * 0.1;
      g.save(); ink(g, R * 0.14, '#ff7eb6'); g.beginPath(); g.moveTo(R * 0.7, R * 0.62); g.quadraticCurveTo(R * 0.9, R * 0.7 + fl, R * 1.0, R * 0.9 + fl * 1.6); g.stroke(); ink(g, R * 0.04, '#fff'); g.globalAlpha = 0.7; g.beginPath(); g.moveTo(R * 0.74, R * 0.6); g.quadraticCurveTo(R * 0.92, R * 0.68 + fl, R * 1.0, R * 0.86 + fl * 1.6); g.stroke(); g.restore();
    }
  }

  return {
    idleBits, yell, wail, surgeRing, streaks, dazed, spine, dazedCrown,
    tailSpr: (skin, P, R) => bake('tailtip|' + skin, R * 4.6, R * 1.6, g => { g.translate(R * 0.55, 0); tailTip(g, R, P, skin); }, 2),
  };
}
