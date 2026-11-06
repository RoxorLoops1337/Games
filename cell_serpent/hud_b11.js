// 06-hud b11: skill tile sprite memo, buff timer chips (Shield, Rage, Snack cookie) and the level-up sparkle.
// Pure helpers plus small painters that take the HUD's own drawing helpers; no sim state is touched.
import { SNACK_RAGE } from './sim.js';

const TAU = Math.PI * 2;
const TXT_MIN = 24;   // 12-hud-c: same floor as hud.js (24 units is 12 CSS px on a 360 wide phone)

// ---- tile sprite memo: the baked glass disc depends only on colour, radius and the contrast mode. The renderer used to
// build the string key 'tile06|col|r|hc' for every tile on every frame; this keeps a tiny list and compares the three
// values by identity, so a frame with a steady skill row builds no string and does no Map lookup at all.
export function createTileMemo(bake, paint) {
  const list = [];   // { col, r, hc, spr }
  const st = { builds: 0, hits: 0 };
  function get(col, r, hc) {
    for (let i = 0; i < list.length; i++) { const e = list[i]; if (e.r === r && e.hc === hc && e.col === col) { st.hits++; return e.spr; } }
    st.builds++;
    const spr = bake ? bake('tile06|' + col + '|' + r + '|' + hc, r * 2 + 8, r * 2 + 8, c => paint(c, col, r, hc)) : null;
    if (list.length >= 24) list.shift();   // colours x radii x contrast never gets near this; a cap keeps it honest
    list.push({ col, r, hc, spr });
    return spr;
  }
  return { get, stats: st, size: () => list.length };
}

// ---- buff timers. One state object per chip; update() returns what the painter needs.
export const LOW_LEFT = 3;
export function newBuffState() { return { max: 0, last: 0, snack: false, snacks: -1 }; }
// left: seconds remaining; snacks: g.snacks counter (rage granted by a Snack cookie shows the cookie)
export function buffUpdate(st, kind, left, snacks) {
  if (snacks !== undefined) {
    if (st.snacks >= 0 && snacks > st.snacks && kind === 'rage') { st.snack = true; st.max = Math.max(left, SNACK_RAGE); st.last = left; }
    st.snacks = snacks;
  }
  if (!(left > 0)) { st.max = 0; st.last = 0; st.snack = false; return null; }
  if (left > st.max + 0.001 || left > st.last + 0.5 || st.max <= 0) st.max = left;   // a fresh pickup raises the scale
  st.last = left;
  return { frac: Math.max(0, Math.min(1, left / st.max)), low: left < LOW_LEFT, secs: Math.ceil(left), snack: st.snack, kind };
}

export function createBuffChips(h) {
  const { ctx, text, blit, kit, S, glass, rr, reduce, fz, W, H } = h;
  const sh = newBuffState(), rg = newBuffState();
  const cols = { shield: '#7fe8ff', rage: '#ffd24a' };
  function chip(info, x, cy, k) {
    const w = 212, hh = 42, y = cy - hh / 2, col = cols[info.kind], blink = info.low && !reduce() ? 0.5 + 0.5 * Math.sin(S.t * 12) : 0;
    ctx.save(); ctx.translate(x + w / 2, cy); ctx.scale(k, k); ctx.translate(-(x + w / 2), -cy);
    glass(x, y, w, hh, 17, info.low ? 'rgba(255,' + (150 + Math.round(blink * 60)) + ',120,.9)' : info.kind === 'rage' ? 'rgba(255,210,74,.7)' : 'rgba(127,232,255,.7)', 'rgba(14,9,48,.55)');
    const ik = info.snack ? 'snack' : info.kind;
    blit(kit && kit.SPR.pickup(ik), x + 23, cy - 3, 34);
    text(info.snack ? 'SNACK' : info.kind === 'rage' ? 'RAGE' : 'SHIELD', x + 46, cy - 4, TXT_MIN, col, '#0b1020', 'left');
    text(info.secs + 's', x + w - 16, cy - 4, TXT_MIN, info.low ? '#ffd0c0' : '#ffffff', '#0b1020', 'right');
    ctx.save(); rr(x, y, w, hh, 17); ctx.clip();   // the timer bar drains along the bottom edge, inside the pill
    ctx.fillStyle = 'rgba(255,255,255,.16)'; ctx.fillRect(x + 14, y + hh - 8, w - 28, 4);
    ctx.fillStyle = info.low ? '#ff9a7a' : col; ctx.fillRect(x + 14, y + hh - 8, Math.max(3, (w - 28) * info.frac), 4);
    ctx.restore();
    ctx.restore();
  }
  // shield sits above the skill row, rage above it; both keep their old slots so nothing else moves
  return {
    draw(g, b, landBounce) {
      const p = g.p, a = buffUpdate(sh, 'shield', p.shield, undefined), r = buffUpdate(rg, 'rage', p.rage, g.snacks | 0);
      if (a) chip(a, W - 226, H - 126 - b, landBounce(S, 'shield'));   // 12-hud-c: wider and taller chips for 24 unit text, lifted clear of the level badges
      if (r) chip(r, W - 226, H - 176 - b, landBounce(S, 'rage'));
      return !!(a || r);
    },
    state: { sh, rg },
  };
}

// ---- level-up sparkle: six stars fly out of the tile and fade, a white sheen sweeps across the disc.
// k runs 1 down to 0 over 0.7 seconds (the HUD's lk). Pure geometry so a test can check the stars stay near the tile.
export const SPARK_N = 6;
export function sparkPoint(i, k, r) {
  const e = 1 - k, a = i / SPARK_N * TAU - Math.PI / 2 + 0.35, d = r + 6 + 26 * (1 - (1 - e) * (1 - e));
  return { x: Math.cos(a) * d, y: Math.sin(a) * d, s: 0.2 + 0.5 * Math.sin(Math.min(1, e * 1.6) * Math.PI) * k + 0.15 * k, a: Math.min(1, k * 1.6) };
}
export function levelSparkle(h, x, cy, r, col, k) {
  const { ctx, star } = h;
  ctx.save();
  for (let i = 0; i < SPARK_N; i++) { const q = sparkPoint(i, k, r); ctx.globalAlpha = q.a; star(x + q.x, cy + q.y, q.s, i % 2 ? '#ffffff' : col); }
  ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(x, cy, r - 1, 0, TAU); ctx.clip();   // sheen: a slanted white band sliding left to right
  const sx = x - r - 14 + (1 - k) * (2 * r + 28);
  ctx.globalAlpha = 0.55 * Math.sin((1 - k) * Math.PI); ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.moveTo(sx - 5, cy - r); ctx.lineTo(sx + 9, cy - r); ctx.lineTo(sx + 1, cy + r); ctx.lineTo(sx - 13, cy + r); ctx.closePath(); ctx.fill();
  ctx.restore();
}
