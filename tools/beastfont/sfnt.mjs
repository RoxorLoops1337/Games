/* ============================================================================
   sfnt.mjs — a minimal TrueType + WOFF writer.

   Takes glyphs as POLYGONS (arrays of [x,y] contours in a y-up em square,
   baseline at 0) and emits a real font file. No dependencies: the whole point
   is that `npm run check` can rebuild the typefaces from source on any machine
   and byte-compare them against what is embedded in the game.

   Only the tables a browser actually reads are written — cmap (format 4),
   glyf/loca, head, hhea, hmtx, maxp, name, OS/2, post — and `post` is version
   3.0, which drops glyph names entirely. Everything is authored with on-curve
   points only: a curve is a polygon with enough sides that the flats are gone
   by the time the rasterizer sees it, which costs a few hundred bytes per
   round letter and buys us an authoring model with no bezier bookkeeping.

   Winding is the one rule that bites: TrueType fills non-zero and expects an
   OUTER contour to run CLOCKWISE in y-up space. Author shapes any way you
   like — `glyph()` normalises positives to clockwise and counters to
   counter-clockwise, so overlapping positive blobs union and a counter always
   punches through.
   ========================================================================== */
import { deflateSync } from 'node:zlib';

/* --------------------------------------------------------------- writer --- */
class Buf {
  constructor() { this.b = []; }
  u8(v) { this.b.push(v & 0xff); return this; }
  u16(v) { return this.u8(v >> 8).u8(v); }
  i16(v) { return this.u16(v < 0 ? v + 0x10000 : v); }
  u32(v) { return this.u16((v >>> 16) & 0xffff).u16(v & 0xffff); }
  i32(v) { return this.u32(v < 0 ? v + 0x100000000 : v); }
  tag(s) { for (let i = 0; i < 4; i++) this.u8(s.charCodeAt(i)); return this; }
  bytes(a) { for (const v of a) this.u8(v); return this; }
  str16(s) { for (const c of s) this.u16(c.codePointAt(0)); return this; }
  out() { return Buffer.from(this.b); }
}

const pad4 = (b) => (b.length % 4 ? Buffer.concat([b, Buffer.alloc(4 - (b.length % 4))]) : b);

function checksum(buf) {
  const b = pad4(buf);
  let sum = 0;
  for (let i = 0; i < b.length; i += 4) sum = (sum + b.readUInt32BE(i)) >>> 0;
  return sum;
}

/* -------------------------------------------------------------- geometry --- */
export function area(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

// Drop consecutive duplicates (rounding collapses short segments) and any
// point that sits exactly on the line between its neighbours. Both are legal
// but they cost bytes in every glyph, and a zero-length segment upsets some
// rasterisers' scan conversion.
function clean(pts) {
  const r = [];
  for (const p of pts) {
    const q = [Math.round(p[0]), Math.round(p[1])];
    if (!r.length || r[r.length - 1][0] !== q[0] || r[r.length - 1][1] !== q[1]) r.push(q);
  }
  while (r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]) r.pop();
  if (r.length < 3) return null;
  const out = [];
  for (let i = 0; i < r.length; i++) {
    const a = r[(i - 1 + r.length) % r.length], b = r[i], c = r[(i + 1) % r.length];
    const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const dot = (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]);
    if (cross === 0 && dot > 0) continue;          // collinear, same direction
    out.push(b);
  }
  return out.length >= 3 ? out : null;
}

/* A glyph: positive contours wound clockwise, counters counter-clockwise. */
export function glyph(name, unicode, advance, positives, counters) {
  const cs = [];
  for (const p of positives || []) {
    const c = clean(p);
    if (c) cs.push(area(c) > 0 ? c.slice().reverse() : c);       // → clockwise
  }
  for (const p of counters || []) {
    const c = clean(p);
    if (c) cs.push(area(c) < 0 ? c.slice().reverse() : c);       // → ccw
  }
  return { name, unicode, advance, contours: cs };
}

/* ---------------------------------------------------------------- tables --- */
function glyfEntry(g) {
  if (!g.contours.length) return Buffer.alloc(0);
  const b = new Buf();
  let xMin = 32767, yMin = 32767, xMax = -32768, yMax = -32768;
  const flat = [];
  const ends = [];
  for (const c of g.contours) {
    for (const p of c) {
      flat.push(p);
      if (p[0] < xMin) xMin = p[0]; if (p[0] > xMax) xMax = p[0];
      if (p[1] < yMin) yMin = p[1]; if (p[1] > yMax) yMax = p[1];
    }
    ends.push(flat.length - 1);
  }
  b.i16(g.contours.length).i16(xMin).i16(yMin).i16(xMax).i16(yMax);
  for (const e of ends) b.u16(e);
  b.u16(0);                                                   // no instructions

  // flags + deltas. 0x01 = on-curve, 0x02/0x04 = short x/y, 0x10/0x20 = same
  // or positive-short. Repeats are folded with 0x08.
  const flags = [], xs = [], ys = [];
  let px = 0, py = 0;
  for (const p of flat) {
    let f = 0x01;
    const dx = p[0] - px, dy = p[1] - py;
    px = p[0]; py = p[1];
    if (dx === 0) f |= 0x10;
    else if (dx > -256 && dx < 256) { f |= 0x02; if (dx > 0) f |= 0x10; xs.push(['b', Math.abs(dx)]); }
    else xs.push(['s', dx]);
    if (dy === 0) f |= 0x20;
    else if (dy > -256 && dy < 256) { f |= 0x04; if (dy > 0) f |= 0x20; ys.push(['b', Math.abs(dy)]); }
    else ys.push(['s', dy]);
    flags.push(f);
  }
  for (let i = 0; i < flags.length;) {
    let n = 0;
    while (i + n + 1 < flags.length && flags[i + n + 1] === flags[i] && n < 254) n++;
    if (n > 0) { b.u8(flags[i] | 0x08).u8(n); i += n + 1; } else { b.u8(flags[i]); i++; }
  }
  for (const [k, v] of xs) k === 'b' ? b.u8(v) : b.i16(v);
  for (const [k, v] of ys) k === 'b' ? b.u8(v) : b.i16(v);
  return pad4(b.out());
}

// cmap format 4. Every character we cover is BMP, so one subtable does it,
// exposed under both the Windows (3,1) and Unicode (0,3) platform ids — the
// two records point at the same bytes.
function cmapTable(glyphs) {
  const map = glyphs.map((g, i) => [g.unicode, i]).filter(([u]) => u > 0).sort((a, b) => a[0] - b[0]);
  const segs = [];
  for (const [u, gid] of map) {
    const last = segs[segs.length - 1];
    if (last && u === last.end + 1 && gid === last.startGid + (u - last.start)) last.end = u;
    else segs.push({ start: u, end: u, startGid: gid });
  }
  segs.push({ start: 0xffff, end: 0xffff, startGid: 0, delta: 1 });

  const segX2 = segs.length * 2;
  let sr = 2, es = 0;
  while (sr * 2 <= segX2) { sr *= 2; es++; }

  const sub = new Buf();
  sub.u16(4).u16(16 + segs.length * 8).u16(0);
  sub.u16(segX2).u16(sr).u16(es).u16(segX2 - sr);
  for (const s of segs) sub.u16(s.end);
  sub.u16(0);                                                    // reservedPad
  for (const s of segs) sub.u16(s.start);
  for (const s of segs) sub.u16(s.delta != null ? s.delta : ((s.startGid - s.start) % 65536 + 65536) % 65536);
  for (const s of segs) sub.u16(0);                              // idRangeOffset
  const subBuf = sub.out();

  // The encoding records must be sorted by (platformID, encodingID) — the
  // browser's font sanitiser rejects the table outright if they are not, which
  // is a silent fallback to the system font rather than an error you can see.
  const hdr = new Buf();
  hdr.u16(0).u16(2);
  hdr.u16(0).u16(3).u32(20);
  hdr.u16(3).u16(1).u32(20);
  return Buffer.concat([hdr.out(), subBuf]);
}

function nameTable(recs) {
  const strings = [];
  const hdr = new Buf();
  hdr.u16(0).u16(recs.length).u16(6 + recs.length * 12);
  let off = 0;
  for (const [id, val] of recs) {
    const s = new Buf().str16(val).out();
    hdr.u16(3).u16(1).u16(0x409).u16(id).u16(s.length).u16(off);
    off += s.length;
    strings.push(s);
  }
  return Buffer.concat([hdr.out(), ...strings]);
}

/* ------------------------------------------------------------ assemble --- */
export function buildFont(spec) {
  const { unitsPerEm, ascender, descender, lineGap = 0, capHeight, xHeight, glyphs } = spec;
  const gs = glyphs;

  const glyfParts = gs.map(glyfEntry);
  const loca = new Buf();
  let acc = 0;
  for (const p of glyfParts) { loca.u32(acc); acc += p.length; }
  loca.u32(acc);

  let xMin = 32767, yMin = 32767, xMax = -32768, yMax = -32768, maxPts = 0, maxCon = 0, advMax = 0;
  for (const g of gs) {
    advMax = Math.max(advMax, g.advance);
    maxCon = Math.max(maxCon, g.contours.length);
    let n = 0;
    for (const c of g.contours) {
      n += c.length;
      for (const p of c) {
        if (p[0] < xMin) xMin = p[0]; if (p[0] > xMax) xMax = p[0];
        if (p[1] < yMin) yMin = p[1]; if (p[1] > yMax) yMax = p[1];
      }
    }
    maxPts = Math.max(maxPts, n);
  }
  if (xMin > xMax) { xMin = 0; yMin = 0; xMax = 0; yMax = 0; }

  const head = new Buf();
  head.u32(0x00010000).u32(0x00010000).u32(0).u32(0x5f0f3cf5);
  head.u16(0x000b).u16(unitsPerEm);
  head.u32(0).u32(0x9d0e0000).u32(0).u32(0x9d0e0000);   // fixed dates → reproducible
  head.i16(xMin).i16(yMin).i16(xMax).i16(yMax);
  head.u16(0).u16(8).i16(2).i16(1).i16(0);

  const hhea = new Buf();
  hhea.u32(0x00010000).i16(ascender).i16(descender).i16(lineGap);
  hhea.u16(advMax).i16(0).i16(0).i16(xMax);
  hhea.i16(1).i16(0).i16(0);                                    // caret slope/offset
  hhea.i16(0).i16(0).i16(0).i16(0);                             // reserved
  hhea.i16(0).u16(gs.length);                                   // format, numHMetrics

  const hmtx = new Buf();
  for (const g of gs) hmtx.u16(g.advance).i16(0);

  const maxp = new Buf();
  maxp.u32(0x00010000).u16(gs.length).u16(maxPts).u16(maxCon);
  maxp.u16(0).u16(0).u16(2).u16(0);                             // composite, zones, twilight
  maxp.u16(0).u16(0).u16(0).u16(0).u16(0).u16(0).u16(0);        // storage … componentDepth

  const w = spec.weight || 400;
  const os2 = new Buf();
  os2.u16(4).i16(Math.round(advMax * 0.55)).u16(w).u16(3).u16(0);
  os2.i16(650).i16(650).i16(0).i16(75);                         // subscript
  os2.i16(650).i16(650).i16(0).i16(350);                        // superscript
  os2.i16(Math.round(unitsPerEm * 0.05)).i16(Math.round(xHeight * 0.55));
  os2.i16(0);                                                   // sFamilyClass
  os2.bytes([2, 0, w >= 700 ? 8 : 5, 6, 3, 0, 0, 2, 0, 4]);     // panose
  os2.u32(0x00000003).u32(0).u32(0).u32(0);                     // unicode ranges
  os2.tag('BBST');
  os2.u16(w >= 700 ? 0x0020 : 0x0040);                          // fsSelection: bold / regular
  os2.u16(0x20).u16(0x2192);                                    // first/last char
  os2.i16(ascender).i16(descender).i16(lineGap);
  os2.u16(ascender).u16(-descender);
  os2.u32(1).u32(0);                                            // code page: latin-1
  os2.i16(xHeight).i16(capHeight).u16(0).u16(0).u16(2);

  const post = new Buf();
  post.u32(0x00030000).u32(0).i16(-100).i16(50).u32(0).u32(0).u32(0).u32(0).u32(0);

  const tables = {
    'OS/2': os2.out(),
    cmap: cmapTable(gs),
    glyf: Buffer.concat(glyfParts),
    head: head.out(),
    hhea: hhea.out(),
    hmtx: hmtx.out(),
    loca: loca.out(),
    maxp: maxp.out(),
    name: nameTable(spec.names),
    post: post.out(),
  };

  const tags = Object.keys(tables).sort();
  const numTables = tags.length;
  let sr = 16, es = 0;
  while (sr * 2 <= numTables * 16) { sr *= 2; es++; }

  const dir = new Buf();
  dir.u32(0x00010000).u16(numTables).u16(sr).u16(es).u16(numTables * 16 - sr);
  let off = 12 + numTables * 16;
  const entries = [];
  for (const t of tags) {
    const b = pad4(tables[t]);
    entries.push({ tag: t, off, len: tables[t].length, buf: b, sum: checksum(tables[t]) });
    off += b.length;
  }
  for (const e of entries) dir.tag(e.tag).u32(e.sum).u32(e.off).u32(e.len);
  const ttf = Buffer.concat([dir.out(), ...entries.map((e) => e.buf)]);

  // head.checkSumAdjustment, patched in place once the whole file exists.
  const headEntry = entries.find((e) => e.tag === 'head');
  const total = checksum(ttf);
  ttf.writeUInt32BE((0xb1b0afba - total) >>> 0, headEntry.off + 8);

  return { ttf, woff: toWoff(ttf, entries) };
}

function toWoff(ttf, entries) {
  const parts = entries.map((e) => {
    const raw = ttf.slice(e.off, e.off + e.len);
    const z = deflateSync(raw, { level: 9 });
    return { tag: e.tag, raw, comp: z.length < raw.length ? z : raw, origLen: e.len, sum: e.sum };
  });
  const hdr = new Buf();
  let off = 44 + parts.length * 20;
  const dir = new Buf();
  const bodies = [];
  for (const p of parts) {
    dir.tag(p.tag).u32(off).u32(p.comp.length).u32(p.origLen).u32(p.sum);
    const padded = pad4(p.comp);
    bodies.push(padded);
    off += padded.length;
  }
  const totalSfnt = 12 + parts.length * 16 + parts.reduce((a, p) => a + pad4(p.raw).length, 0);
  hdr.tag('wOFF').u32(0x00010000).u32(off).u16(parts.length).u16(0);
  hdr.u32(totalSfnt).u16(1).u16(0).u32(0).u32(0).u32(0).u32(0).u32(0);
  return Buffer.concat([hdr.out(), dir.out(), ...bodies]);
}
