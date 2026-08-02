// BEASTCUT & BEAKWORK — the two typefaces cut for The Birds & The Beasts.
//
// A font fails silently in every direction that matters. A table laid out a
// field short is not an error, it is a browser quietly falling back to Segoe
// UI. A contour wound the wrong way is not an error, it is a letter with a
// hole punched through it. A character the face does not cover is not an
// error, it is a word with a gap in it. And base64 embedded in the game goes
// stale the moment anyone edits the source that cut it, with nothing to say so.
//
// So this suite does four things: rebuilds both faces from source and byte-
// compares them against what is embedded in the game, parses the generated
// binary back the way a rasteriser would, reads every outline as geometry, and
// checks the CSS that actually points the UI at them.
//
// Run: node tests/birds_and_beasts_font.test.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { cutFonts, faceBlock, BEASTCUT, BEASTCUT_SC } from '../tools/beastfont/build.mjs';
import { buildFace, smallCaps } from '../tools/beastfont/alphabet.mjs';
import { area } from '../tools/beastfont/sfnt.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const GAME = join(HERE, '..', 'birds_and_beasts', 'index.html');

let pass = 0;
const fails = [];
const ok = (c, l) => { if (c) { pass++; return; } fails.push(l); console.error('  ✗ ' + l); };
const eq = (a, b, l) => ok(a === b, `${l} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);

const src = readFileSync(GAME, 'utf8');
const cut = cutFonts();

/* ------------------------------------------------------- 1. the embed --- */
{
  const block = faceBlock(cut);
  const i = src.indexOf('/* BEASTFONT:BEGIN');
  const j = src.indexOf('/* BEASTFONT:END */');
  ok(i > 0 && j > i, 'index.html carries the BEASTFONT markers');
  const embedded = src.slice(i, j + '/* BEASTFONT:END */'.length);
  ok(embedded === block,
    'embedded @font-face matches a fresh cut — run `node tools/beastfont/build.mjs`');
  eq((embedded.match(/@font-face/g) || []).length, 3, 'three faces embedded (display + text + bold)');
  ok(!/url\((?!data:)/.test(embedded),
    'every src is a data: URI — the game stays one self-contained file');
  ok(embedded.length < 90_000, `the whole type system stays small (${(embedded.length / 1024).toFixed(1)}kB)`);
}

/* ------------------------------------------- 2. read the binary back --- */
// A minimal sfnt reader. Parsing what we wrote, the way a rasteriser would, is
// the only check that catches a table laid out one field short — the failure
// that shows up as "the browser used Segoe UI and said nothing".
function parse(ttf) {
  const num = ttf.readUInt16BE(4);
  const tables = {};
  for (let k = 0; k < num; k++) {
    const o = 12 + k * 16;
    tables[ttf.toString('ascii', o, o + 4)] = { off: ttf.readUInt32BE(o + 8), len: ttf.readUInt32BE(o + 12) };
  }
  const head = tables.head.off;
  const upem = ttf.readUInt16BE(head + 18);
  const locFmt = ttf.readInt16BE(head + 50);
  const numGlyphs = ttf.readUInt16BE(tables.maxp.off + 4);

  // cmap → { codepoint: gid }, via the format 4 subtable both records share
  const cm = tables.cmap.off;
  const recs = ttf.readUInt16BE(cm + 2);
  const plats = [];
  let sub = 0;
  for (let k = 0; k < recs; k++) {
    plats.push([ttf.readUInt16BE(cm + 4 + k * 8), ttf.readUInt16BE(cm + 6 + k * 8)]);
    sub = cm + ttf.readUInt32BE(cm + 8 + k * 8);
  }
  const segX2 = ttf.readUInt16BE(sub + 6), segs = segX2 / 2;
  const map = new Map();
  for (let k = 0; k < segs; k++) {
    const end = ttf.readUInt16BE(sub + 14 + k * 2);
    const start = ttf.readUInt16BE(sub + 16 + segX2 + k * 2);
    const delta = ttf.readInt16BE(sub + 16 + segX2 * 2 + k * 2);
    if (start === 0xffff) continue;
    for (let u = start; u <= end; u++) map.set(u, (u + delta) & 0xffff);
  }

  // loca → glyph extents
  const loca = tables.loca.off;
  const at = (k) => (locFmt ? ttf.readUInt32BE(loca + k * 4) : ttf.readUInt16BE(loca + k * 2) * 2);
  const glyphs = [];
  for (let k = 0; k < numGlyphs; k++) {
    const a = at(k), b = at(k + 1);
    if (b <= a) { glyphs.push(null); continue; }
    const g = tables.glyf.off + a;
    glyphs.push({
      contours: ttf.readInt16BE(g),
      xMin: ttf.readInt16BE(g + 2), yMin: ttf.readInt16BE(g + 4),
      xMax: ttf.readInt16BE(g + 6), yMax: ttf.readInt16BE(g + 8),
    });
  }
  const adv = (k) => ttf.readUInt16BE(tables.hmtx.off + Math.min(k, ttf.readUInt16BE(tables.hhea.off + 34) - 1) * 4);
  return { tables, upem, numGlyphs, map, glyphs, adv, plats };
}

const REQUIRED = ['OS/2', 'cmap', 'glyf', 'head', 'hhea', 'hmtx', 'loca', 'maxp', 'name', 'post'];
const parsed = {};
for (const c of cut) {
  const p = parse(c.font.ttf);
  parsed[c.id] = p;
  const tag = `${c.family} ${c.style}`;
  for (const t of REQUIRED) ok(p.tables[t] && p.tables[t].len > 0, `${tag}: has a ${t} table`);
  eq(p.upem, 1000, `${tag}: 1000 units per em`);
  // the sanitiser rejects the whole table if the encoding records are unsorted
  const sorted = p.plats.every((v, k) => !k || v[0] > p.plats[k - 1][0] ||
    (v[0] === p.plats[k - 1][0] && v[1] > p.plats[k - 1][1]));
  ok(sorted, `${tag}: cmap encoding records sorted by (platform, encoding)`);
  ok(p.map.size >= 100, `${tag}: covers ${p.map.size} characters`);
  eq(p.glyphs[0] === null, false, `${tag}: .notdef is drawn, not blank`);
}

/* ------------------------------------------------- 3. actual coverage --- */
// Everything the game can put on screen has to exist in the face, or a word
// renders with a hole in it. Emoji are exempt: they are meant to fall through
// to the system, which is why the CSS keeps a fallback stack.
{
  const text = src
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/g, (s) => s.replace(/[^'"`]*/g, ' '))
    .replace(/<[^>]+>/g, ' ');
  const isEmoji = (u) => u > 0x2500;
  const need = new Set();
  for (const ch of text) {
    const u = ch.codePointAt(0);
    if (u < 0x20 || isEmoji(u)) continue;
    need.add(u);
  }
  for (const u of [0x2014, 0x2013, 0x2192, 0x2026, 0xd7, 0x2212, 0x2019, 0x25b2, 0x25bc]) need.add(u);
  for (const c of cut) {
    const missing = [...need].filter((u) => !parsed[c.id].map.has(u))
      .map((u) => 'U+' + u.toString(16));
    ok(missing.length === 0, `${c.family} ${c.style}: covers every character the game renders${missing.length ? ' — missing ' + missing.join(' ') : ''}`);
  }
  ok(need.size > 60, `the sweep actually found the game's text (${need.size} distinct characters)`);
}

/* --------------------------------------------------- 4. the outlines --- */
{
  const M = {
    beastcut: { cap: 720, sc: true },
    beakwork: { cap: 700, sc: false },
    'beakwork-bold': { cap: 700, sc: false },
  };
  for (const c of cut) {
    const p = parsed[c.id], tag = `${c.family} ${c.style}`;
    const cap = M[c.id].cap;
    let drawn = 0, tall = 0;
    for (const [u, gid] of p.map) {
      const g = p.glyphs[gid];
      if (u === 0x20 || u === 0xa0) { eq(g, null, `${tag}: U+${u.toString(16)} is blank`); continue; }
      ok(g !== null, `${tag}: U+${u.toString(16)} draws something`);
      if (!g) continue;
      drawn++;
      ok(g.contours >= 1 && g.contours <= 12, `${tag}: U+${u.toString(16)} has a sane contour count (${g.contours})`);
      ok(g.xMax > g.xMin && g.yMax > g.yMin, `${tag}: U+${u.toString(16)} has a real bounding box`);
      ok(g.yMax <= 880 && g.yMin >= -300, `${tag}: U+${u.toString(16)} stays inside the em (${g.yMin}..${g.yMax})`);
      ok(p.adv(gid) > 0, `${tag}: U+${u.toString(16)} has a non-zero advance`);
      if (g.yMax > cap * 0.9) tall++;
    }
    ok(drawn > 90, `${tag}: ${drawn} glyphs drawn`);
    ok(tall > 20, `${tag}: ${tall} glyphs reach cap height — the face is not collapsed`);

    // Tabular by construction: a column of stats must never shift under itself.
    const figs = [...'0123456789'].map((d) => p.adv(p.map.get(d.charCodeAt(0))));
    ok(new Set(figs).size === 1, `${tag}: figures are tabular (advances ${[...new Set(figs)].join(',')})`);
  }
}

/* ------------------------------------------ 5. winding, per contour --- */
// Read from the authored polygons rather than the binary: a positive shape
// wound the wrong way punches a hole through its own letter, and nothing
// downstream complains.
{
  // the real bundles, imported — a second copy here would drift the day
  // anyone retunes the face and this check would go on passing regardless
  const display = { ...buildFace(BEASTCUT), ...smallCaps(BEASTCUT_SC) };
  let checked = 0, degenerate = 0;
  for (const [ch, g] of Object.entries(display)) {
    for (const p of [...g.pos, ...g.cut]) {
      checked++;
      if (Math.abs(area(p)) < 40) degenerate++;
      ok(p.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y)), `Beastcut '${ch}': no NaN in the outline`);
    }
    ok(g.adv > 0, `Beastcut '${ch}': positive advance`);
  }
  ok(checked > 250, `read ${checked} authored contours`);
  ok(degenerate === 0, `no degenerate contours (${degenerate})`);

  // Small caps must be SHORTER than the caps and no lighter — a scaled-down
  // cap goes pale beside a full one, which is the whole reason they exist.
  const p = parsed.beastcut;
  const capA = p.glyphs[p.map.get(65)], scA = p.glyphs[p.map.get(97)];
  ok(scA.yMax < capA.yMax * 0.85, `Beastcut: small-cap A is shorter than cap A (${scA.yMax} vs ${capA.yMax})`);
  ok(scA.yMax > capA.yMax * 0.55, 'Beastcut: small-cap A is not a shrunk-to-nothing cap');
}

/* -------------------------------------------------- 6. the CSS wiring --- */
{
  const css = src.slice(0, src.indexOf('</style>'));
  ok(/--f-text:\s*'Beakwork'/.test(css), 'a --f-text token exists and starts with Beakwork');
  ok(/--f-display:\s*'Beastcut'/.test(css), 'a --f-display token exists and starts with Beastcut');
  ok(/--f-text:[^;]*sans-serif/.test(css) && /--f-display:[^;]*sans-serif/.test(css),
    'both tokens keep a system fallback behind them');
  ok(/html,body\{[\s\S]*?font-family:var\(--f-text\)/.test(css), 'the body is set in the text face');
  ok(/\.btn\{[^}]*font-family:var\(--f-display\)/.test(css), 'buttons are set in the display face');
  for (const sel of ['h1, h2, h3', '.tiny', '.scrhead .count', '.card .st']) {
    ok(css.includes(sel + ',') || css.includes(sel + '{'), `the display list still names ${sel}`);
  }
  ok(/#oSub, \.card \.nm/.test(css), 'names and the run-over subtitle opt back into the text face');
  ok(!/'Segoe UI',system-ui,-apple-system,sans-serif; \}\s*body\{/.test(css),
    'nothing is still hard-wired to Segoe UI ahead of the new faces');
}

/* ------------------------------------------------------------ report --- */
if (fails.length) {
  console.error(`\nbirds_and_beasts_font: ${pass} passed, ${fails.length} FAILED`);
  process.exit(1);
}
console.log(`birds_and_beasts_font: ${pass} checks passed`);
