// FROSTCUT & FROSTWORK — the two typefaces cut for Frostfell.
//
// A font fails silently in every direction that matters. A table laid out one
// field short is not an error, it is the browser quietly falling back to
// Trebuchet. A contour wound the wrong way is not an error, it is a letter with
// a hole punched through it. A character the face does not cover is not an
// error, it is a card with a gap in the middle of a word. And base64 embedded
// in the game goes stale the moment anyone edits the source that cut it, with
// nothing anywhere to say so.
//
// So this suite does five things: rebuilds all three faces from source and
// byte-compares them against what is embedded in frostfell/index.html, parses
// the generated binary back the way a rasteriser would, reads every promised
// codepoint out of the cmap, reads the outlines as geometry, and checks the CSS
// that actually points the game at them.
//
// Run: node tests/frostfell_font.test.mjs

import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  cutFonts, faceBlock, CHARSET, FROSTCUT, FROSTWORK, FROSTWORK_BOLD,
} from '../tools/frostfont/build.mjs';
import { buildFace } from '../tools/frostfont/alphabet.mjs';
import { area, glyph } from '../tools/beastfont/sfnt.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const GAME = join(HERE, '..', 'frostfell', 'index.html');

let pass = 0;
const fails = [];
const ok = (c, l) => { if (c) { pass++; return; } fails.push(l); console.error('  ✗ ' + l); };
const eq = (a, b, l) => ok(a === b, `${l} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);

const src = readFileSync(GAME, 'utf8');
const cut = cutFonts();

/* ------------------------------------------------------- 1. the embed --- */
{
  const block = faceBlock(cut);
  const i = src.indexOf('/* FROSTFONT:BEGIN');
  const j = src.indexOf('/* FROSTFONT:END */');
  ok(i > 0 && j > i, 'index.html carries the FROSTFONT markers');
  const embedded = src.slice(i, j + '/* FROSTFONT:END */'.length);
  ok(embedded === block,
    'embedded @font-face matches a fresh cut — run `node tools/frostfont/build.mjs`');
  eq((embedded.match(/@font-face/g) || []).length, 3, 'three faces embedded (display + text + bold)');
  ok(!/url\((?!data:)/.test(embedded),
    'every src is a data: URI — the game stays one self-contained file');
  ok(embedded.length < 120_000,
    `the whole type system stays small (${(embedded.length / 1024).toFixed(1)}kB)`);

  // Frostcut is one weight and already heavy: it must claim the whole range so
  // no browser ever synthesises a bold on top of it.
  ok(/font-family:'Frostcut'; font-style:normal; font-weight:100 900;/.test(embedded),
    'Frostcut is declared across 100 900 — nothing can synthesise a bold');
  ok(/font-family:'Frostwork'; font-style:normal; font-weight:400;/.test(embedded),
    'Frostwork Regular is declared at 400');
  ok(/font-family:'Frostwork'; font-style:normal; font-weight:700 900;/.test(embedded),
    'Frostwork Bold is declared at 700 900');
}

/* ------------------------------------------- 2. read the binary back --- */
// A minimal sfnt reader. Parsing what we wrote, the way a rasteriser would, is
// the only check that catches a table laid out one field short — the failure
// that shows up as "the browser used Trebuchet and said nothing".
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
    const gg = tables.glyf.off + a;
    glyphs.push({
      contours: ttf.readInt16BE(gg),
      xMin: ttf.readInt16BE(gg + 2), yMin: ttf.readInt16BE(gg + 4),
      xMax: ttf.readInt16BE(gg + 6), yMax: ttf.readInt16BE(gg + 8),
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
  eq(p.numGlyphs, p.map.size + 1, `${tag}: every glyph in the font is reachable from the cmap`);
}

/* ------------------------------------------ 2b. the WOFF the browser gets --- */
// Everything above reads the TTF. The browser never sees it: what is embedded
// in the game is the WOFF wrapper, and a wrapper with a wrong length or a table
// that does not inflate is rejected outright — silently, as a fallback font.
{
  for (const c of cut) {
    const w = c.font.woff, tag = `${c.family} ${c.style}`;
    eq(w.toString('ascii', 0, 4), 'wOFF', `${tag}: WOFF signature`);
    eq(w.readUInt32BE(4), 0x00010000, `${tag}: WOFF flavor is TrueType`);
    eq(w.readUInt32BE(8), w.length, `${tag}: WOFF header length matches the file`);
    const n = w.readUInt16BE(12);
    eq(n, Object.keys(REQUIRED).length, `${tag}: WOFF carries ${n} tables`);
    let bad = 0;
    for (let k = 0; k < n; k++) {
      const o = 44 + k * 20;
      const off = w.readUInt32BE(o + 4), comp = w.readUInt32BE(o + 8), orig = w.readUInt32BE(o + 12);
      if (off + comp > w.length) { bad++; continue; }
      const raw = w.slice(off, off + comp);
      let out;
      try { out = comp === orig ? raw : inflateSync(raw); } catch { bad++; continue; }
      if (out.length !== orig) bad++;
    }
    eq(bad, 0, `${tag}: every WOFF table inflates to its declared length`);
  }
}

/* ------------------------------------------------- 3. actual coverage --- */
// The promise is the CHARSET the build exports. A glyph that quietly stops
// being drawn has to fail here rather than turn into a hole in a card.
{
  const need = new Set([...CHARSET.map((c) => c.codePointAt(0)), 0x00a0]);
  ok(need.size > 100, `the promised set is the real one (${need.size} codepoints)`);
  for (const c of cut) {
    const missing = [...need].filter((u) => !parsed[c.id].map.has(u))
      .map((u) => 'U+' + u.toString(16).toUpperCase().padStart(4, '0'));
    ok(missing.length === 0,
      `${c.family} ${c.style}: covers every promised codepoint${missing.length ? ' — missing ' + missing.join(' ') : ''}`);
  }
  // the four arrows and the two pips are the ones most likely to be dropped
  for (const c of cut) {
    for (const ch of ['→', '←', '↑', '↓', '♥', '✦', '–', '—', '×', '·', '•', '°']) {
      const gid = parsed[c.id].map.get(ch.codePointAt(0));
      ok(gid != null && parsed[c.id].glyphs[gid] !== null, `${c.family} ${c.style}: '${ch}' is drawn`);
    }
  }
}

/* --------------------------------------------------- 4. the outlines --- */
{
  const M = { frostcut: FROSTCUT, frostwork: FROSTWORK, 'frostwork-bold': FROSTWORK_BOLD };
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
    ok(drawn > 100, `${tag}: ${drawn} glyphs drawn`);
    ok(tall > 25, `${tag}: ${tall} glyphs reach cap height — the face is not collapsed`);

    // Tabular by construction: a stat column must never shift under itself.
    const figs = [...'0123456789'].map((d) => p.adv(p.map.get(d.charCodeAt(0))));
    ok(new Set(figs).size === 1, `${tag}: figures are tabular (advances ${[...new Set(figs)].join(',')})`);

    // The x-height has to be genuinely tall and genuinely below the caps.
    const X = p.glyphs[p.map.get(120)], C = p.glyphs[p.map.get(88)];   // x and X
    ok(X.yMax < C.yMax, `${tag}: lowercase x is shorter than cap X (${X.yMax} vs ${C.yMax})`);
    ok(X.yMax > C.yMax * 0.68, `${tag}: the x-height is tall (${(X.yMax / C.yMax).toFixed(2)} of the cap)`);

    // Descenders actually descend, ascenders actually ascend.
    ok(p.glyphs[p.map.get(112)].yMin < -60, `${tag}: 'p' has a real descender`);
    ok(p.glyphs[p.map.get(98)].yMax > C.yMax * 0.98, `${tag}: 'b' rises to the ascender`);
  }

  // Bold is a second cut, not a smear: the stem itself has to be heavier.
  const stem = (id) => {
    const p = parsed[id], g = p.glyphs[p.map.get(73)];   // cap I is one stem
    return g.xMax - g.xMin;
  };
  ok(stem('frostwork-bold') > stem('frostwork') * 1.5,
    `Frostwork Bold is cut heavier, not synthesised (${stem('frostwork')} → ${stem('frostwork-bold')})`);
  ok(stem('frostcut') > stem('frostwork') * 1.5,
    `Frostcut is a display weight (${stem('frostcut')} vs ${stem('frostwork')})`);

  // Frostcut is the condensed one: the same word has to set narrower.
  const setWidth = (id, str) => [...str].reduce((a, ch) =>
    a + parsed[id].adv(parsed[id].map.get(ch.codePointAt(0))), 0);
  ok(setWidth('frostcut', 'FROSTFELL') < setWidth('frostwork', 'FROSTFELL'),
    'Frostcut sets narrower than Frostwork at the same weight class');

  // The two families are genuinely different drawings, not one file twice.
  const bin = cut.map((c) => c.font.ttf.toString('base64'));
  ok(new Set(bin).size === 3, 'all three faces are distinct binaries');
}

/* ------------------------------------------ 5. winding, per contour --- */
// Read from the authored polygons rather than the binary: a positive shape
// wound the wrong way punches a hole through its own letter, and nothing
// downstream complains. The real bundles are imported — a second copy here
// would drift the day anyone retunes a face, and this check would go on
// passing regardless.
{
  for (const [name, bundle] of [['Frostcut', FROSTCUT], ['Frostwork', FROSTWORK],
    ['Frostwork Bold', FROSTWORK_BOLD]]) {
    const face = buildFace(bundle);
    let checked = 0, degenerate = 0;
    for (const [ch, g] of Object.entries(face)) {
      for (const p of [...g.pos, ...g.cut]) {
        checked++;
        if (Math.abs(area(p)) < 60) degenerate++;
        ok(p.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y)),
          `${name} '${ch}': no NaN in the outline`);
      }
      ok(g.adv > 0, `${name} '${ch}': positive advance`);
    }
    ok(checked > 250, `${name}: read ${checked} authored contours`);
    ok(degenerate === 0, `${name}: no degenerate contours (${degenerate})`);

    // glyph() is what normalises winding on the way into the binary: positives
    // clockwise (negative area, y-up), counters counter-clockwise.
    const sample = ['A', 'O', 'S', 'e', 'g', 'a', '8', '%', '@', '&', '♥', '✦', '?'];
    for (const ch of sample) {
      const g = face[ch];
      ok(!!g, `${name}: '${ch}' exists`);
      if (!g) continue;
      for (const cn of glyph(ch, 0, g.adv, g.pos, []).contours) {
        ok(area(cn) < 0, `${name} '${ch}': positive contour runs clockwise`);
      }
      for (const cn of glyph(ch, 0, g.adv, [], g.cut).contours) {
        ok(area(cn) > 0, `${name} '${ch}': counter runs counter-clockwise`);
      }
    }

    // An O is a ring: the counter has to be real, and smaller than the bowl.
    const O = face.O;
    const outer = Math.abs(area(O.pos[0])), inner = Math.abs(area(O.cut[0]));
    ok(inner > outer * 0.10 && inner < outer * 0.75,
      `${name}: the O keeps an open counter (${(inner / outer * 100).toFixed(0)}% of the bowl)`);
  }

  // Frostcut is the faceted one by construction — fewer segments to the
  // quarter means fewer points around a bowl than Frostwork spends.
  const facet = (M) => buildFace(M).O.pos[0].length;
  ok(facet(FROSTCUT) < facet(FROSTWORK),
    `Frostcut's bowls are faceted (${facet(FROSTCUT)} points vs Frostwork's ${facet(FROSTWORK)})`);

  // The icicle is a Frostcut-only move: its T hangs below the crossbar's
  // underside where Frostwork's is cut dead flat.
  const lowT = (M) => Math.min(...buildFace(M).T.pos[0].map(([, y]) => y));
  ok(lowT(FROSTCUT) < FROSTCUT.cap - FROSTCUT.th - 10, 'Frostcut hangs an icicle off the T');
  eq(lowT(FROSTWORK), FROSTWORK.cap - FROSTWORK.th, 'Frostwork cuts the T dead flat');
}

/* -------------------------------------------------- 6. the CSS wiring --- */
// Only what the game genuinely has to keep true — the rest of index.html is
// written by hand and reformatted freely, so nothing here depends on its shape.
{
  const css = src.slice(0, src.indexOf('</style>'));
  const body = css.slice(css.indexOf('/* FROSTFONT:END */'));   // the hand-written half
  ok(/font-family:'Frostwork'/.test(body), "the hand-written CSS sets something in 'Frostwork'");
  ok(/font-family:'Frostcut'/.test(body), "the hand-written CSS sets something in 'Frostcut'");
  ok(/font-family:'Frostwork'[^;]*(sans-serif|system-ui|serif|monospace)/.test(body),
    'Frostwork keeps a system fallback behind it');
  ok(/font-family:'Frostcut'[^;]*(sans-serif|system-ui|serif|monospace)/.test(body),
    'Frostcut keeps a system fallback behind it');
  ok(/html,body\{[\s\S]*?font-family:'Frostwork'/.test(body), 'the body is set in the text face');
  ok(!/font-family:\s*(?!['"]Frost)[^;]*Trebuchet[^;]*;/.test(body),
    'nothing is still hard-wired to Trebuchet ahead of the new faces');
}

/* ------------------------------------------------------------ report --- */
if (fails.length) {
  console.error(`\nfrostfell_font: ${pass} passed, ${fails.length} FAILED`);
  process.exit(1);
}
console.log(`frostfell_font: ${pass} checks passed`);
