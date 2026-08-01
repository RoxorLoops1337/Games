// EMBERKIN — art suite.
//
// The creature art is authored by hand as character grids, which means the
// rules in emberkin/art/BRIEF.md are the spec. This suite enforces the ones a
// machine can see: correct grid size, a complete palette, a continuous dark
// outline around the silhouette, feet planted on the ground line, evolutions
// visibly bigger than what they evolve from, and matched walk-cycle frames.
// It cannot tell you a sprite is beautiful. It can tell you it is broken.
//
// Run: node tests/emberkin_art.test.mjs
import { loadGame, ok, eq, done, section } from './emberkin_lib.mjs';

const EK = loadGame();
const { ART_CREATURES, ART_TILES, ART_ACTORS, DEX, DEX_ORDER } = EK;

const lum = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return (((n >> 16) & 255) * .299 + ((n >> 8) & 255) * .587 + (n & 255) * .114) / 255;
};
const isBlank = (ch) => ch === '.' || ch === ' ';

/** Bounding box + pixel stats for a char grid. */
function stats(def) {
  const r = def.r;
  let top = -1, bottom = -1, left = 1e9, right = -1, filled = 0, strays = 0, border = 0, darkBorder = 0;
  for (let y = 0; y < r.length; y++) {
    for (let x = 0; x < r[y].length; x++) {
      if (isBlank(r[y][x])) continue;
      filled++;
      if (top < 0) top = y;
      bottom = y;
      left = Math.min(left, x); right = Math.max(right, x);
      const nb = [[0, -1], [0, 1], [-1, 0], [1, 0]].map(([dx, dy]) => {
        const yy = y + dy, xx = x + dx;
        return (yy < 0 || yy >= r.length || xx < 0 || xx >= r[y].length) ? '.' : r[yy][xx];
      });
      const open = nb.filter(isBlank).length;
      if (open === 4) strays++;
      if (open > 0) {
        border++;
        if (lum(def.p[r[y][x]] || '#ffffff') < .45) darkBorder++;
      }
    }
  }
  return { top, bottom, left, right, filled, strays, border, darkBorder, h: bottom - top + 1, w: right - left + 1 };
}

section('every creature in the dex has art');
for (const id of DEX_ORDER) ok(!!ART_CREATURES[id], `${id} has a sprite`);

section('creature grids follow the brief');
for (const id of DEX_ORDER) {
  const def = ART_CREATURES[id];
  if (!def) continue;
  eq(def.r.length, 40, `${id} is 40 rows`);
  def.r.forEach((row, i) => eq(row.length, 40, `${id} row ${i} is 40 wide`));

  const pal = def.p;
  const cols = Object.values(pal);
  ok(cols.length >= 5, `${id} uses at least 5 colours (${cols.length})`);
  ok(cols.length <= 16, `${id} uses at most 16 colours (${cols.length})`);
  cols.forEach((c) => ok(/^#[0-9a-fA-F]{6}$/.test(c), `${id} colour ${c} is #rrggbb`));
  ok(!cols.some((c) => c.toLowerCase() === '#000000'), `${id} avoids pure black`);
  for (const row of def.r) for (const ch of row) ok(isBlank(ch) || !!pal[ch], `${id} char "${ch}" is in the palette`);

  const st = stats(def);
  ok(st.filled > 150, `${id} is actually drawn (${st.filled} px)`);
  ok(st.h >= 18, `${id} is at least 18 rows tall (${st.h})`);
  ok(st.bottom >= 30 && st.bottom <= 38, `${id} stands on the ground line (bottom row ${st.bottom})`);
  ok(st.left >= 1 && st.right <= 38, `${id} keeps a margin (cols ${st.left}-${st.right})`);
  // Loose pixels are a defect everywhere except Vespyr's tail, where the brief
  // asks for the body to break up into vapour rather than end on an outline.
  const strayCap = id === 'vespyr' ? 20 : 8;
  ok(st.strays <= strayCap, `${id} has few floating pixels (${st.strays})`);
  ok(st.darkBorder / st.border >= .8, `${id} is outlined (${Math.round(100 * st.darkBorder / st.border)}% of its edge is dark)`);
  // Some tonal range — a flat two-tone fill reads as programmer art.
  const lums = cols.map(lum).sort((a, b) => a - b);
  ok(lums[lums.length - 1] - lums[0] > .4, `${id} has light and dark tones`);
}

section('evolutions are visibly bigger than what they came from');
for (const id of DEX_ORDER) {
  const evo = DEX[id].evo;
  if (!evo || !ART_CREATURES[id] || !ART_CREATURES[evo[0]]) continue;
  const a = stats(ART_CREATURES[id]), b = stats(ART_CREATURES[evo[0]]);
  ok(b.h > a.h, `${evo[0]} (${b.h} rows) towers over ${id} (${a.h} rows)`);
}

section('the roster reads as one world');
// A shared outline family is what makes 19 separately drawn creatures cohere.
const outlines = new Set();
for (const id of DEX_ORDER) {
  const def = ART_CREATURES[id];
  if (!def) continue;
  const darkest = Object.values(def.p).sort((a, b) => lum(a) - lum(b))[0];
  outlines.add(darkest.toLowerCase());
  ok(lum(darkest) < .3, `${id}'s darkest tone is dark enough to outline with`);
}
ok(outlines.size <= 12, `outline colours stay in one family (${outlines.size} distinct)`);

section('tiles are 16×16 and terrain is opaque');
const TERRAIN = ['grass', 'tallgrass', 'path', 'water', 'sand', 'tree', 'roof', 'wall'];
for (const [id, def] of Object.entries(ART_TILES)) {
  eq(def.r.length, 16, `tile ${id} is 16 rows`);
  def.r.forEach((row, i) => eq(row.length, 16, `tile ${id} row ${i} is 16 wide`));
  for (const row of def.r) for (const ch of row) ok(isBlank(ch) || !!def.p[ch], `tile ${id} char "${ch}" is in the palette`);
  if (TERRAIN.includes(id)) {
    const holes = def.r.join('').split('').filter(isBlank).length;
    eq(holes, 0, `terrain tile ${id} has no transparent holes`);
  }
}
for (const id of ['grass', 'tallgrass', 'path', 'water', 'tree']) ok(!!ART_TILES[id], `the world has a ${id} tile`);
if (ART_TILES.grass && ART_TILES.tallgrass) {
  const avg = (d) => {
    let s = 0, n = 0;
    for (const row of d.r) for (const ch of row) { if (isBlank(ch)) continue; s += lum(d.p[ch]); n++; }
    return s / Math.max(1, n);
  };
  ok(avg(ART_TILES.tallgrass) < avg(ART_TILES.grass), 'tall grass is darker than short grass, so encounters read at a glance');
}

section('the player has a full walk cycle');
const DIRS = ['down', 'up', 'left', 'right'];
for (const d of DIRS) {
  for (const f of [0, 1]) ok(!!ART_ACTORS[`player_${d}_${f}`], `player_${d}_${f} exists`);
}
for (const [id, def] of Object.entries(ART_ACTORS)) {
  eq(def.r.length, 22, `actor ${id} is 22 rows`);
  def.r.forEach((row, i) => eq(row.length, 16, `actor ${id} row ${i} is 16 wide`));
  for (const row of def.r) for (const ch of row) ok(isBlank(ch) || !!def.p[ch], `actor ${id} char "${ch}" is in the palette`);
  const st = stats(def);
  ok(st.filled > 40, `actor ${id} is actually drawn`);
  ok(st.bottom >= 18, `actor ${id} stands near the bottom of its frame`);
}
// Walk frames must be the same character, or animation reads as a glitch.
for (const d of DIRS) {
  const a = ART_ACTORS[`player_${d}_0`], b = ART_ACTORS[`player_${d}_1`];
  if (!a || !b) continue;
  const sa = stats(a), sb = stats(b);
  ok(Math.abs(sa.top - sb.top) <= 2, `${d} frames start at the same height (${sa.top} vs ${sb.top})`);
  ok(Math.abs(sa.h - sb.h) <= 3, `${d} frames are the same height (${sa.h} vs ${sb.h})`);
  ok(Math.abs(sa.w - sb.w) <= 4, `${d} frames are the same width (${sa.w} vs ${sb.w})`);
  const pa = new Set(Object.values(a.p).map((c) => c.toLowerCase()));
  const shared = Object.values(b.p).filter((c) => pa.has(c.toLowerCase())).length;
  ok(shared >= Math.min(Object.keys(a.p).length, Object.keys(b.p).length) - 2, `${d} frames share a palette`);
}
for (const id of ['npc_elder', 'npc_rival', 'npc_ranger']) ok(!!ART_ACTORS[id], `${id} exists`);

done('emberkin_art');
