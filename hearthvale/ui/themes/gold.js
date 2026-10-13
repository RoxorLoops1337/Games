// Gilded Fantasy: generates every ornament as inline SVG data URIs and publishes them as CSS custom properties on <html>.
// Assets: 9-slice rope/scallop frame edge, 4 filigree corners with gem inlays, folded ribbon banners (crimson, emerald),
// level medallion with laurel wreath, laurel sprigs, ornamental rule, brushed-metal streak noise (feTurbulence stretched
// horizontally) and a fine velvet grain. Everything is rasterised once by the browser (background images), no per-frame work.
// Also adds the "glint flash" on press and keeps a tiny pointer-tilt-free, listener-light footprint. Cleans up in dispose.
const uri = (svg) => 'url("data:image/svg+xml,' + encodeURIComponent(svg.replace(/\s+/g, ' ').trim()) + '")';
const NS = 'xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"';
const svg = (w, h, body, extra = '') => `<svg ${NS} width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" ${extra}>${body}</svg>`;

// shared gradient defs (ids are local to each SVG document)
const GOLD = `<linearGradient id="gv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3b8"/><stop offset=".3" stop-color="#f1c85a"/><stop offset=".55" stop-color="#b98524"/><stop offset=".62" stop-color="#8d5f14"/><stop offset=".85" stop-color="#e9bd4d"/><stop offset="1" stop-color="#fff0a8"/></linearGradient>
<linearGradient id="gd" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff6c2"/><stop offset=".35" stop-color="#e9bd4d"/><stop offset=".65" stop-color="#a8741a"/><stop offset="1" stop-color="#f6d56c"/></linearGradient>`;
const RUBY = `<radialGradient id="rb" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#ffb3bd"/><stop offset=".35" stop-color="#e0243d"/><stop offset="1" stop-color="#5e0618"/></radialGradient>`;
const SAPH = `<radialGradient id="sp" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#c3dcff"/><stop offset=".35" stop-color="#2f6fe0"/><stop offset="1" stop-color="#0c2466"/></radialGradient>`;
const DK = '#4a2d05';

function gem(cx, cy, r, fill) {
  return `<circle cx="${cx}" cy="${cy}" r="${r + 2.4}" fill="url(#gd)" stroke="${DK}" stroke-width=".7"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${fill})" stroke="#2a0710" stroke-width=".6"/>
  <ellipse cx="${cx - r * .32}" cy="${cy - r * .38}" rx="${r * .38}" ry="${r * .24}" fill="#fff" opacity=".8"/>`;
}

/* ---------- frame edge (9-slice source 96x96, slice 32, middle tile 32 long) ---------- */
function frameEdge() {
  // top edge band, thickness 32 units: outer line, rope, inner line, scallops. periods divide 32 (rope 8, scallop 16)
  let beads = '';
  for (let x = 4; x < 96; x += 8) beads += `<ellipse cx="${x}" cy="11" rx="6.2" ry="3.8" transform="rotate(-32 ${x} 11)" fill="url(#gv)" stroke="${DK}" stroke-width=".7"/>`;
  let scal = '';
  for (let x = 0; x < 96; x += 16) scal += `<path d="M${x} 21 a8 7.5 0 0 0 16 0" fill="#2a1a55" stroke="url(#gd)" stroke-width="2.2"/><circle cx="${x + 8}" cy="29" r="1.9" fill="#fff8dc" stroke="#b98524" stroke-width=".6"/>`;
  const edge = `<g id="e"><rect x="0" y="0" width="96" height="3.4" fill="url(#gv)"/><rect x="0" y="3.4" width="96" height="1" fill="${DK}" opacity=".7"/>
    <rect x="0" y="5" width="96" height="12" fill="#3a1a14" opacity=".55"/>${beads}
    <rect x="0" y="17.6" width="96" height="1" fill="${DK}" opacity=".7"/><rect x="0" y="18.4" width="96" height="2.6" fill="url(#gv)"/>${scal}</g>`;
  const body = `<defs>${GOLD}</defs>${edge}
    <use xlink:href="#e" transform="translate(0 96) scale(1 -1)"/>
    <use xlink:href="#e" transform="matrix(0 1 1 0 0 0)"/>
    <use xlink:href="#e" transform="matrix(0 1 -1 0 96 0)"/>`;
  return uri(svg(96, 96, body));
}

/* ---------- filigree corner (60x60, top-left), 4 orientations ---------- */
function corner(flipX, flipY, gemId = 'rb') {
  const curl = `<path d="M30 3.2 C39 3.2 46 5.5 50 10 C54.5 15 50 21 45 18.5 C41.5 16.6 43 12.4 46.6 13" fill="none" stroke="${DK}" stroke-width="4.2" stroke-linecap="round"/>
    <path d="M30 3.2 C39 3.2 46 5.5 50 10 C54.5 15 50 21 45 18.5 C41.5 16.6 43 12.4 46.6 13" fill="none" stroke="url(#gd)" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M34 8 C37 12 33 15 29.5 13.5" fill="none" stroke="url(#gd)" stroke-width="1.6" stroke-linecap="round"/>
    <circle cx="57" cy="4" r="2" fill="#fff8dc" stroke="#b98524" stroke-width=".6"/>
    <path d="M40 2.2 l3 -0 -1.5 3z" fill="url(#gd)"/>`;
  const inner = `<g>${curl}</g><g transform="matrix(0 1 1 0 0 0)">${curl}</g>
    <path d="M1.5 31 V19 Q1.5 1.5 19 1.5 H31 C30 7 25 9.5 21 11 C15 13 13 15 11 21 C9.5 25 7 30 1.5 31 Z" fill="url(#gv)" stroke="${DK}" stroke-width="1.1"/>
    <path d="M5 5 H25 C22 8 18 9 14 11 C11 13 9 17 8 22" fill="none" stroke="#fff6c8" stroke-width="1" opacity=".75" stroke-linecap="round"/>
    ${gem(14.5, 14.5, 6.1, gemId)}
    <path d="M24 24 l4 4 -4 4 -4 -4z" fill="url(#gd)" stroke="${DK}" stroke-width=".7"/><circle cx="24" cy="28" r="1.2" fill="url(#sp)"/>`;
  const t = `translate(${flipX ? 60 : 0} ${flipY ? 60 : 0}) scale(${flipX ? -1 : 1} ${flipY ? -1 : 1})`;
  return uri(svg(60, 60, `<defs>${GOLD}${RUBY}${SAPH}</defs><g transform="${t}">${inner}</g>`));
}

/* ---------- ribbons (128x56): folded left cap, tile, folded right cap ---------- */
function ribbon(pal) {
  const [a, b, c, d] = pal; // bright, mid, dark, fold
  const defs = `<defs>${GOLD}<linearGradient id="rg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset=".5" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient>
    <linearGradient id="rt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${b}"/><stop offset="1" stop-color="${d}"/></linearGradient>
    <pattern id="dm" width="20" height="44" patternUnits="userSpaceOnUse" x="0" y="3"><path d="M10 12 l5 10 -5 10 -5 -10z" fill="none" stroke="#ffe9a0" stroke-width=".9" opacity=".28"/></pattern></defs>`;
  const band = (x0, w) => `<rect x="${x0}" y="3" width="${w}" height="44" fill="url(#rg)"/><rect x="${x0}" y="3" width="${w}" height="44" fill="url(#dm)"/>
    <rect x="${x0}" y="3" width="${w}" height="3.2" fill="url(#gv)"/><rect x="${x0}" y="6.2" width="${w}" height=".8" fill="${DK}" opacity=".6"/>
    <rect x="${x0}" y="43.8" width="${w}" height="3.2" fill="url(#gv)"/><rect x="${x0}" y="43" width="${w}" height=".8" fill="${DK}" opacity=".6"/>
    <rect x="${x0}" y="7" width="${w}" height="12" fill="#fff" opacity=".12"/>`;
  const cap = (mirror) => `<g ${mirror ? 'transform="translate(128 0) scale(-1 1)"' : ''}>
      <polygon points="0.5,12 27,12 27,56 0.5,56 10,34" fill="url(#rt)" stroke="${DK}" stroke-width=".8"/>
      <rect x="0.5" y="12" width="26.5" height="2.6" fill="url(#gv)" opacity=".85"/><rect x="0.5" y="53.4" width="26.5" height="2.6" fill="url(#gv)" opacity=".85"/>
      <polygon points="22,47 32,47 22,56" fill="${d}" stroke="${DK}" stroke-width=".6" opacity=".95"/>
      ${band(22, 22)}</g>`;
  // one image: left cap 0..44, tile 44..84, right cap 84..128 (border-image slice 44, so alignment is exact)
  const body = defs + `<g transform="translate(44 0)">${band(0, 40)}</g>` + cap(false) + cap(true);
  return uri(svg(128, 56, body));
}

/* ---------- laurel sprig (60x80), leaves along a curved stem ---------- */
function laurelPath(n, r0, a0, a1, cx, cy, leaf = 'url(#lf)') {
  let s = '';
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), a = (a0 + (a1 - a0) * t) * Math.PI / 180, r = r0;
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r, rot = a * 180 / Math.PI;
    const len = 12 - t * 3.5;
    for (const side of [-1, 1]) {
      s += `<path d="M0 0 C${len * .3} ${side * len * .55} ${len * .8} ${side * len * .5} ${len} 0 C${len * .8} ${-side * 0} ${len * .3} ${side * 0.8} 0 0z" transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${(rot + side * 52 + 90).toFixed(1)})" fill="${leaf}" stroke="#0b3a22" stroke-width=".6"/>`;
    }
  }
  return s;
}
const LEAF = `<linearGradient id="lf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe9a0"/><stop offset=".45" stop-color="#e2b640"/><stop offset="1" stop-color="#9b6a17"/></linearGradient>`;
function laurel(mirror) {
  const body = `<defs>${GOLD}${LEAF}</defs><g ${mirror ? 'transform="translate(46 0) scale(-1 1)"' : ''}>
    <path d="M40 74 C14 62 8 34 22 6" fill="none" stroke="${DK}" stroke-width="3.4" stroke-linecap="round"/><path d="M40 74 C14 62 8 34 22 6" fill="none" stroke="url(#gd)" stroke-width="1.8" stroke-linecap="round"/>
    ${laurelBranch()}</g>`;
  return uri(svg(46, 80, body));
}
function laurelBranch() {
  // leaves positioned along the same cubic curve
  let s = '';
  const P = [[40, 74], [14, 62], [8, 34], [22, 6]];
  const pt = (t) => { const u = 1 - t; return [u * u * u * P[0][0] + 3 * u * u * t * P[1][0] + 3 * u * t * t * P[2][0] + t * t * t * P[3][0], u * u * u * P[0][1] + 3 * u * u * t * P[1][1] + 3 * u * t * t * P[2][1] + t * t * t * P[3][1]]; };
  for (let i = 1; i <= 8; i++) {
    const t = i / 9, [x, y] = pt(t), [x2, y2] = pt(Math.min(1, t + .02));
    const ang = Math.atan2(y2 - y, x2 - x) * 180 / Math.PI, len = 15 - t * 5;
    for (const side of [-1, 1]) s += `<path d="M0 0 C${len * .25} ${-side * len * .5} ${len * .75} ${-side * len * .45} ${len} 0 C${len * .75} 0 ${len * .25} 0 0 0z" transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${(ang + side * 48).toFixed(1)})" fill="url(#lf)" stroke="#5a3a08" stroke-width=".6"/>`;
  }
  const [tx, ty] = pt(1);
  return s + `<ellipse cx="${tx}" cy="${ty - 2}" rx="3" ry="5" fill="url(#lf)" stroke="#5a3a08" stroke-width=".6"/>`;
}

/* ---------- level medallion (160x160): scalloped ring, rope, wreath, enamel disc, gems ---------- */
function medal() {
  let bumps = '', rope = '', wreath = '';
  for (let i = 0; i < 28; i++) { const a = i / 28 * Math.PI * 2; bumps += `<circle cx="${(80 + Math.cos(a) * 71).toFixed(1)}" cy="${(80 + Math.sin(a) * 71).toFixed(1)}" r="8.2"/>`; }
  for (let i = 0; i < 40; i++) { const a = i / 40 * 360; rope += `<ellipse cx="80" cy="${80 - 61}" rx="4.6" ry="2.7" transform="rotate(${a} 80 80) rotate(-30 80 19)" />`; }
  // wreath: two branches meeting at the bottom, leaves in a ring at r=50
  for (const side of [-1, 1]) for (let i = 0; i < 11; i++) {
    const a = (100 + side * (i * 13.5)) * Math.PI / 180, x = 80 + Math.cos(a) * 49, y = 80 + Math.sin(a) * 49;
    const rot = a * 180 / Math.PI + (side > 0 ? 90 : -90) - side * 10;
    wreath += `<path d="M0 0 C4 -3 11 -3 15 0 C11 3 4 3 0 0z" transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${(rot).toFixed(1)}) scale(${(1.15 - i * .035).toFixed(2)})" fill="url(#lf)" stroke="#5a3a08" stroke-width=".7"/>`;
  }
  const body = `<defs>${GOLD}${LEAF}${RUBY}${SAPH}<radialGradient id="em" cx=".5" cy=".35" r=".75"><stop offset="0" stop-color="#7d55d8"/><stop offset=".6" stop-color="#3c2490"/><stop offset="1" stop-color="#1c0f52"/></radialGradient>
    <radialGradient id="eg" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#b6ffd2"/><stop offset=".4" stop-color="#17a460"/><stop offset="1" stop-color="#05452a"/></radialGradient>
    <linearGradient id="sh" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
    <circle cx="80" cy="84" r="76" fill="#000" opacity=".28"/>
    <g fill="url(#gv)" stroke="${DK}" stroke-width="1.2"><circle cx="80" cy="80" r="70"/>${bumps}</g>
    <circle cx="80" cy="80" r="69" fill="url(#gd)" stroke="${DK}" stroke-width="1"/>
    <circle cx="80" cy="80" r="62" fill="#4a1f10" opacity=".55"/><g fill="url(#gv)" stroke="${DK}" stroke-width=".7">${rope}</g>
    <circle cx="80" cy="80" r="54.5" fill="url(#gd)" stroke="${DK}" stroke-width="1"/>
    <circle cx="80" cy="80" r="51" fill="url(#em)" stroke="${DK}" stroke-width="1.2"/>
    <g>${wreath}</g>
    <circle cx="80" cy="80" r="36" fill="url(#em)" stroke="url(#gd)" stroke-width="3"/><circle cx="80" cy="80" r="33.4" fill="none" stroke="${DK}" stroke-width=".8"/>
    <ellipse cx="68" cy="58" rx="22" ry="11" fill="url(#sh)" transform="rotate(-24 68 58)"/>
    ${gem(80, 12, 6.6, 'rb')}${gem(80, 148, 6.6, 'eg')}${gem(12, 80, 6.6, 'sp')}${gem(148, 80, 6.6, 'sp')}
    <path d="M80 2 l6 8 -6 4 -6 -4z" fill="url(#gv)" stroke="${DK}" stroke-width=".8"/>`;
  return uri(svg(160, 160, body));
}

/* ---------- ornamental rule (240x14) ---------- */
function rule() {
  const body = `<defs>${GOLD}</defs><path d="M2 7 H100 M140 7 H238" stroke="url(#gd)" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M100 7 C106 1 112 1 116 7 M140 7 C134 1 128 1 124 7" fill="none" stroke="url(#gd)" stroke-width="1.6"/>
    <path d="M120 1.5 l6 5.5 -6 5.5 -6 -5.5z" fill="url(#gv)" stroke="${DK}" stroke-width=".7"/><circle cx="120" cy="7" r="1.6" fill="#e0243d"/>
    <circle cx="96" cy="7" r="1.6" fill="#fff3b8"/><circle cx="144" cy="7" r="1.6" fill="#fff3b8"/>`;
  return uri(svg(240, 14, body));
}

/* ---------- textures ---------- */
// brushed metal: fractal noise with very low x frequency and high y frequency = horizontal streaks; white and black layers
function brush() {
  const body = `<defs><filter id="n" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.006 0.85" numOctaves="2" seed="7" stitchTiles="stitch" result="t"/>
    <feColorMatrix in="t" type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 .95 1.9 0 0 0 -.95" result="w"/>
    <feColorMatrix in="t" type="matrix" values="0 0 0 0 .15 0 0 0 0 .05 0 0 0 0 0 -2.2 0 0 0 1.15" result="k"/><feMerge><feMergeNode in="w"/><feMergeNode in="k"/></feMerge></filter></defs>
    <rect width="200" height="96" filter="url(#n)" opacity=".42"/>`;
  return uri(svg(200, 96, body));
}
// velvet: fine isotropic grain, very faint
function velvet() {
  const body = `<defs><filter id="n" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.95" numOctaves="2" seed="3" stitchTiles="stitch" result="t"/>
    <feColorMatrix in="t" type="matrix" values="0 0 0 0 1 0 0 0 0 .9 0 0 0 0 1 2.2 0 0 0 -1.05" result="w"/>
    <feColorMatrix in="t" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 .1 -2.2 0 0 0 1.15" result="k"/><feMerge><feMergeNode in="w"/><feMergeNode in="k"/></feMerge></filter></defs>
    <rect width="128" height="128" filter="url(#n)" opacity=".22"/>`;
  return uri(svg(128, 128, body));
}

export default function init({ root, id }) {
  const t0 = performance.now();
  const props = {};
  try {
    props['--g-edge'] = frameEdge();
    props['--g-c-tl'] = corner(false, false);
    props['--g-c-tr'] = corner(true, false, 'sp');
    props['--g-c-bl'] = corner(false, true, 'sp');
    props['--g-c-br'] = corner(true, true);
    const rc = ribbon(['#c82a46', '#a3122f', '#5e0a1d', '#3d0613']);
    props['--g-rib'] = rc;
    const re = ribbon(['#1fa468', '#0f8a54', '#064a2d', '#03301e']);
    props['--g-ribe'] = re;
    props['--g-laurel-l'] = laurel(false); props['--g-laurel-r'] = laurel(true);
    props['--g-medal'] = medal(); props['--g-rule'] = rule();
    props['--g-brush'] = brush(); props['--g-velvet'] = velvet();
  } catch (e) { console.warn('[gold] asset build failed', e); }
  const st = root.style;
  for (const k in props) st.setProperty(k, props[k]);
  if (Object.keys(props).length) root.dataset.gd = '1';

  // glint flash on press: restart a CSS animation on the pressed metal plate (class removed after it ends)
  const sel = '.b, .rb, .pill, .gp, #card, .mini-b, .chipb';
  const timers = new Map();
  const down = (e) => {
    const el = e.target.closest && e.target.closest(sel); if (!el || el.classList.contains('off')) return;
    el.classList.remove('gd-flash'); void el.offsetWidth; el.classList.add('gd-flash');
    clearTimeout(timers.get(el)); timers.set(el, setTimeout(() => { el.classList.remove('gd-flash'); timers.delete(el); }, 520));
  };
  document.addEventListener('pointerdown', down, true);
  window.__gdMs = Math.round(performance.now() - t0);
  return function dispose() {
    document.removeEventListener('pointerdown', down, true);
    for (const [el, h] of timers) { clearTimeout(h); el.classList.remove('gd-flash'); }
    for (const k in props) st.removeProperty(k);
    delete root.dataset.gd; delete window.__gdMs;
  };
}
