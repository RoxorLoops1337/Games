// One outline for the whole roster.
//
// A set of sprites reads as a set when they share the tone they are drawn
// against. Fourteen of the nineteen kin already used the same near-black
// violet; the other five each had their own, which is enough to make those
// five look like they wandered in from a different game. This finds the colour
// each sprite actually uses along its silhouette — not simply its darkest,
// which on a dark creature is a body tone — and moves that one entry onto the
// shared tone. Nothing else in the palette is touched.
//
//   node tools/spritegrid/outline.mjs            # report only
//   node tools/spritegrid/outline.mjs --write    # …and fix the strays
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ART = join(REPO, 'emberkin', 'art');

/** The tone the roster is drawn against. */
export const OUTLINE = '#2a1b2e';

const blank = (ch) => ch === '.' || ch === ' ';

/**
 * Which palette entry does this sprite use along its silhouette? A pixel is on
 * the silhouette when it is filled and at least one of its four neighbours is
 * not — that ring is what an outline is, so the colour holding most of it is
 * the outline whatever the artist called it.
 */
export function edgeColour(sp) {
  const h = sp.rows.length, w = sp.rows[0].length;
  const count = {};
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = sp.rows[y][x];
      if (blank(ch)) continue;
      const open = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
        const nx = x + dx, ny = y + dy;
        return nx < 0 || nx >= w || ny < 0 || ny >= h || blank(sp.rows[ny][nx]);
      });
      if (open) count[ch] = (count[ch] || 0) + 1;
    }
  }
  const best = Object.entries(count).sort((a, b) => b[1] - a[1])[0];
  return best ? { key: best[0], hex: sp.palette[best[0]], share: best[1] / Object.values(count).reduce((a, b) => a + b, 0) } : null;
}

const write = process.argv.includes('--write');
let changed = 0;
for (const f of readdirSync(ART).filter((f) => f.endsWith('.json')).sort()) {
  const path = join(ART, f);
  const sp = JSON.parse(readFileSync(path, 'utf8'));
  const edge = edgeColour(sp);
  if (!edge) continue;
  const same = (edge.hex || '').toLowerCase() === OUTLINE;
  const mark = same ? '   ' : ' → ';
  console.log(`${sp.id.padEnd(12)} ${edge.key}  ${edge.hex}  ${(edge.share * 100).toFixed(0)}% of the edge${mark}${same ? '' : OUTLINE}`);
  if (same || !write) continue;
  // Only the entry that holds the edge moves. If some other entry already sits
  // on the shared tone, fold this one into it rather than leaving a duplicate.
  const twin = Object.entries(sp.palette).find(([k, v]) => k !== edge.key && v.toLowerCase() === OUTLINE);
  if (twin) {
    sp.rows = sp.rows.map((r) => r.split('').map((c) => (c === edge.key ? twin[0] : c)).join(''));
    delete sp.palette[edge.key];
  } else {
    sp.palette[edge.key] = OUTLINE;
  }
  writeFileSync(path, JSON.stringify(sp, null, 2) + '\n');
  changed++;
}
console.log(write ? `\nmoved ${changed} sprites onto the shared outline` : '\n(report only — pass --write to fix)');
