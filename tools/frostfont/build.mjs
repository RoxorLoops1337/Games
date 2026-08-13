/* ============================================================================
   build.mjs — cut the Frostfell typefaces and embed them in the game.

     node tools/frostfont/build.mjs            # rebuild + rewrite the @font-face
     node tools/frostfont/build.mjs --check    # fail if what is embedded is stale
     node tools/frostfont/build.mjs --specimen # also write frostfell/fonts.html
     node tools/frostfont/build.mjs --woff     # drop the .woff files on disk

   frostfell/index.html is one self-contained document — markup, CSS, script and
   now the type. A web font is the one asset that would quietly break that, so
   it goes in the same way everything else does: inline, as base64 WOFF, between
   the FROSTFONT markers. Nothing outside those markers is ever touched.

   Two families, three files:
     FROSTCUT   the display face. One weight, already heavy; declared across the
                whole 100-900 range so no browser synthesises a bold on top of
                a face that is as black as it gets.
     FROSTWORK  the UI/text face, Regular + Bold, the Bold cut from its own
                metric bundle rather than smeared by the renderer.
   ========================================================================== */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildFace } from './alphabet.mjs';
import { buildFont, glyph } from '../beastfont/sfnt.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const GAME = join(REPO, 'frostfell', 'index.html');
const SPEC = join(REPO, 'frostfell', 'fonts.html');
const EM = 1000;

/* ------------------------------------------------------------- the faces --- */

/* FROSTCUT — heavy, slightly condensed (wf 0.90), and faceted: four segments to
   the quarter means an O is a sixteen-sided stone, which is the whole point. It
   has to hold at 60px with 6px of tracking on a dark ground, so the counters
   are kept large and the aperture angle is wide enough to stay open under a
   glow. `ic` hangs the icicle; `oneA` gives it the geometric single-storey a. */
export const FROSTCUT = {
  cap: 730, xh: 545, asc: 785, desc: -195,
  st: 158, th: 132, e: 0.72, N: 4, ch: 34, ov: 16,
  wf: 0.90, side: 34,
  ic: 34, ap: 46, spur: 0, bar: 0.515,
  sT: 0.56, sB: 0.60, sA: -14,
  dia: true, wedge: true, oneA: true, tailL: false,
  weight: 400,
};

/* FROSTWORK — the text face. x-height 530 on a 700 cap (0.757, which is tall),
   contrast of six units, terminals cut flat by the spur, and apertures opened
   to 30°. It has to survive an 11px uppercase label with 2px of tracking and a
   card set at 13px, so nothing here is decorative: no chamfer, no icicle, a
   double-storey a and a tailed l to keep the letters apart. */
export const FROSTWORK = {
  cap: 700, xh: 530, asc: 748, desc: -200,
  st: 84, th: 78, e: 0.86, N: 7, ch: 0, ov: 12,
  wf: 1.0, side: 46,
  ic: 0, ap: 30, spur: 62, bar: 0.525,
  sT: 0.545, sB: 0.585, sA: -12,
  dia: false, wedge: false, oneA: false, tailL: true,
  weight: 400,
};

/* The Bold is a second cut, not a smear: heavier stem AND thin, a touch wider
   to hold the counters open, and tighter sidebearings so the colour evens out. */
export const FROSTWORK_BOLD = {
  ...FROSTWORK,
  st: 148, th: 134, wf: 1.03, side: 42, ov: 13, spur: 56,
  sT: 0.55, sB: 0.60,
  weight: 700,
};

/* ------------------------------------------------------------- coverage ---
   Everything the three faces promise. The test reads this list back out of the
   built binaries, so a glyph that quietly stops being drawn fails the suite
   rather than turning into a hole in a card. */
export const CHARSET = [
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  ...'abcdefghijklmnopqrstuvwxyz',
  ...'0123456789',
  ...' .,:;!?\'"()[]-+=/\\%&*@#$<>_|~^',
  '–', '—', '−', '×', '·', '•', '°', '…', '’', '“', '”',
  '→', '←', '↑', '↓', '♥', '✦',
  '\u00a0',                                            // mapped to the space advance
];

/* ------------------------------------------------------------- assembly --- */
function notdef(adv, cap) {
  const m = Math.round(cap * 0.11);
  return glyph('.notdef', 0, adv,
    [[[m, 0], [adv - m, 0], [adv - m, cap], [m, cap]]],
    [[[m * 2, m * 2], [adv - m * 2, m * 2], [adv - m * 2, cap - m * 2], [m * 2, cap - m * 2]]]);
}

function makeFont(map, spec) {
  const chars = Object.keys(map).sort((a, b) => a.codePointAt(0) - b.codePointAt(0));
  const space = map[' '];
  const glyphs = [notdef(Math.round(space.adv * 1.45), spec.capHeight)];
  for (const ch of chars) {
    const gl = map[ch];
    glyphs.push(glyph(ch, ch.codePointAt(0), gl.adv, gl.pos, gl.cut));
  }
  glyphs.push(glyph('nbsp', 0x00a0, space.adv, [], []));   // never a visible gap
  return buildFont({ ...spec, unitsPerEm: EM, glyphs });
}

function names(family, style, ver) {
  const full = style === 'Regular' ? family : `${family} ${style}`;
  return [
    [0, 'Drawn for Frostfell. Generated by tools/frostfont.'],
    [1, family], [2, style], [3, `${full}:frostfont`], [4, full],
    [5, `Version ${ver}`], [6, full.replace(/[^A-Za-z0-9]/g, '')],
    [8, 'Frostfell'], [11, 'https://games-71g.pages.dev/frostfell/'],
  ];
}

export function cutFonts() {
  const face = (M) => {
    const g = buildFace(M);
    const missing = CHARSET.filter((c) => c !== ' ' && c !== '\u00a0' && !g[c]);
    if (missing.length) throw new Error('frostfont: undrawn glyphs ' + missing.join(' '));
    return g;
  };
  const mk = (id, family, style, M, cssWeight) => ({
    id, family, style, weight: M.weight, cssWeight,
    font: makeFont(face(M), {
      ascender: 800, descender: -215, lineGap: 0,
      capHeight: M.cap, xHeight: M.xh, weight: M.weight,
      names: names(family, style, '1.000'),
    }),
  });
  return [
    mk('frostcut', 'Frostcut', 'Regular', FROSTCUT, '100 900'),
    mk('frostwork', 'Frostwork', 'Regular', FROSTWORK, '400'),
    mk('frostwork-bold', 'Frostwork', 'Bold', FROSTWORK_BOLD, '700 900'),
  ];
}

/* --------------------------------------------------------------- embed --- */
const BEGIN = '/* FROSTFONT:BEGIN — generated by tools/frostfont/build.mjs, do not hand-edit */';
const END = '/* FROSTFONT:END */';

export function faceBlock(cut) {
  const face = (c) =>
    `  @font-face{ font-family:'${c.family}'; font-style:normal; font-weight:${c.cssWeight};\n` +
    `    src:url(data:font/woff;base64,${c.font.woff.toString('base64')}) format('woff'); font-display:block; }`;
  return [BEGIN, ...cut.map(face), END].join('\n');
}

function main() {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const cut = cutFonts();
  const block = faceBlock(cut);

  // The game's own CSS lives around the block, so it is spliced in — never
  // rewritten. Anything outside the two markers is off limits by contract.
  const src = readFileSync(GAME, 'utf8');
  const i = src.indexOf(BEGIN), j = src.indexOf(END);
  if (i < 0 || j < 0) {
    console.error('frostfont: no FROSTFONT:BEGIN/END markers in frostfell/index.html');
    process.exit(1);
  }

  // The specimen carries the same three faces, so it is regenerated alongside
  // the embed whenever it exists — the two can never drift apart.
  const page = specimen(block);
  const hasSpec = existsSync(SPEC);

  if (check) {
    let stale = false;
    if (src.slice(i, j + END.length) !== block) {
      console.error('frostfont: frostfell/index.html is STALE'); stale = true;
    }
    if (hasSpec && readFileSync(SPEC, 'utf8') !== page) {
      console.error('frostfont: frostfell/fonts.html is STALE'); stale = true;
    }
    if (stale) { console.error('frostfont: run `node tools/frostfont/build.mjs`'); process.exit(1); }
    console.log('frostfont: embedded fonts match source ✓');
  } else {
    writeFileSync(GAME, src.slice(0, i) + block + src.slice(j + END.length));
    if (hasSpec) writeFileSync(SPEC, page);
    const kb = (n) => (n / 1024).toFixed(1) + 'kB';
    for (const c of cut) {
      console.log(`  ${c.family} ${c.style}: ${kb(c.font.ttf.length)} ttf → ${kb(c.font.woff.length)} woff`);
    }
    console.log(`frostfont: embedded ${kb(block.length)} into frostfell/index.html`);
  }

  if (args.includes('--specimen') && !check) {
    writeFileSync(SPEC, page);
    console.log('frostfont: wrote frostfell/fonts.html');
  }
  if (args.includes('--woff')) {
    const out = join(HERE, 'out');
    mkdirSync(out, { recursive: true });
    for (const c of cut) writeFileSync(join(out, c.id + '.woff'), c.font.woff);
    console.log('frostfont: wrote tools/frostfont/out/*.woff');
  }
}

/* -------------------------------------------------------------- specimen --- */
function specimen(block) {
  const esc = (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c);
  const cell = (c) => `<span>${esc(c)}</span>`;
  const rows = [
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    'abcdefghijklmnopqrstuvwxyz',
    '0123456789&@#%$()[]',
    '.,:;!?\'"-–—+=/\\<>*^~_|·•°×',
    '→←↑↓♥✦',
  ].join('');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Frostcut &amp; Frostwork — the type of Frostfell</title>
<style>
${block}
  :root{ --bg:#05080f; --ink:#e9f2ff; --dim:#7fa0c8; --ice:#8fdcff; --ember:#ffab5e; --rule:#15243c; }
  *{ box-sizing:border-box; }
  body{ margin:0; padding:34px 26px 90px; color:var(--ink);
    background:
      radial-gradient(1100px 640px at 50% -14%, rgba(90,180,255,.14), transparent 70%),
      radial-gradient(720px 500px at 90% 112%, rgba(255,150,70,.075), transparent 70%), var(--bg);
    font-family:'Frostwork','Trebuchet MS',system-ui,sans-serif; font-size:15px; line-height:1.55; }
  main{ max-width:920px; margin:0 auto; }
  .d{ font-family:'Frostcut','Trebuchet MS',sans-serif; }
  .row{ border-top:1px solid var(--rule); padding:26px 0 22px; }
  .row:first-of-type{ border-top:none; padding-top:0; }
  .lab{ font-family:'Frostcut',sans-serif; font-size:11px; letter-spacing:2.6px;
    text-transform:uppercase; color:#5f7d9f; margin-bottom:14px; }
  .hero{ font-size:clamp(40px,10.5vw,88px); line-height:1.02; letter-spacing:6px; color:var(--ice);
    text-shadow:0 4px 0 #17385f, 0 8px 0 #0d2039, 0 16px 38px rgba(90,180,255,.42); }
  .hero em{ font-style:normal; color:var(--ember);
    text-shadow:0 4px 0 #6a3410, 0 8px 0 #3a1c08, 0 16px 38px rgba(255,150,70,.34); }
  .lede{ color:#c3d8f2; max-width:58ch; }
  .big{ font-size:clamp(26px,5.4vw,46px); line-height:1.16; letter-spacing:2px; }
  .mid{ font-size:24px; } .sm{ font-size:13px; }
  .xs{ font-size:11px; letter-spacing:2px; text-transform:uppercase; color:var(--dim); }
  .card{ display:inline-block; vertical-align:top; width:210px; margin:6px 10px 6px 0; padding:14px 15px 16px;
    border:1px solid #23405f; border-radius:14px; background:linear-gradient(180deg,#0e1b2e,#0a1322);
    box-shadow:0 6px 0 #060c16, 0 14px 30px rgba(0,0,0,.5); }
  .card h4{ font-family:'Frostcut',sans-serif; font-weight:400; font-size:18px; letter-spacing:1.4px;
    color:#dff0ff; margin:0 0 2px; }
  .card .cost{ float:right; font-family:'Frostcut',sans-serif; color:var(--ember); }
  .card p{ margin:8px 0 0; font-size:13px; color:#a9c4e2; }
  .btn{ display:inline-block; font-family:'Frostcut',sans-serif; font-size:16px; letter-spacing:3px;
    text-transform:uppercase; color:#08131f; padding:13px 26px; border-radius:13px; margin:5px 8px 5px 0;
    background:linear-gradient(#9fe6ff,#4fb8f0); box-shadow:0 5px 0 #1c6b9c; }
  .btn.warm{ background:linear-gradient(#ffd39a,#ff9a45); box-shadow:0 5px 0 #a3541a; }
  .grid{ display:grid; grid-template-columns:repeat(auto-fill,minmax(52px,1fr)); gap:5px; }
  .grid span{ background:#0c1727; border:1px solid var(--rule); text-align:center;
    padding:9px 2px; font-size:25px; border-radius:6px; }
  table{ border-collapse:collapse; width:100%; max-width:480px; }
  td{ padding:3px 16px 3px 0; } td.n{ text-align:right; font-family:'Frostcut',sans-serif; }
  footer{ color:#5f7d9f; font-size:12px; margin-top:26px; }
  footer a{ color:var(--ice); }
</style></head><body><main>

<div class="row">
  <div class="lab">Two families, drawn for one game</div>
  <div class="hero d">FROSTCUT<br><em>FROSTWORK</em></div>
  <p class="lede" style="margin-top:18px"><b>Frostcut</b> is the display face: heavy, slightly condensed,
  and faceted — its bowls are cut at four segments to the quarter, so an O is a sixteen-sided stone rather
  than a circle. A few terminals hang an icicle. <b>Frostwork</b> is the UI face in Regular and Bold: tall
  x-height, open apertures, low contrast, terminals cut flat. One holds a title at 60px, the other holds a
  card at 13px.</p>
</div>

<div class="row"><div class="lab">Frostcut — display</div>
  <div class="big d">ABCDEFGHIJKLMNOPQRSTUVWXYZ<br>abcdefghijklmnopqrstuvwxyz<br>0123456789 &amp; ? ! % @ — → ♥ ✦</div>
  <div style="margin-top:16px"><span class="btn">March on</span><span class="btn warm">Burn a charm</span></div>
</div>

<div class="row"><div class="lab">Frostwork — cards at 13px</div>
  <div class="card"><span class="cost d">2</span><h4>Rimeguard</h4><p>Gain <b>7 Ward</b>. If you are
    Chilled, gain 3 more and clear one stack.</p><div class="xs" style="margin-top:9px">Common · Ward</div></div>
  <div class="card"><span class="cost d">1</span><h4>Ember Draught</h4><p>Deal <b>9</b> damage. Melt 2 —
    the next Frost card this turn costs 1 less.</p><div class="xs" style="margin-top:9px">Uncommon · Ember</div></div>
  <div class="card"><span class="cost d">3</span><h4>Long Winter</h4><p>Exhaust. At the start of each turn,
    all enemies take 4 and lose 1 Ward. Ends when you leave the pass.</p><div class="xs" style="margin-top:9px">Rare · Curse</div></div>
</div>

<div class="row"><div class="lab">Frostwork — regular, bold, and the small stuff</div>
  <p class="lede">The caravan is nine wagons and a fire that will not last. Every camp you keep is a card
  you did not draw; every card you burn is a mile you did not walk. <b>Bold is a second cut, not a smear</b> —
  heavier stem and thin, a touch wider, so a headline in it holds its counters.</p>
  <div class="sm" style="margin-top:10px">Ward 14 · Ember 3 · Chill ×2 · 68% · −9 · +12 · 4°</div>
  <div class="xs" style="margin-top:8px">Deck · Relics · Map · Hall of the long winter</div>
</div>

<div class="row"><div class="lab">Tabular figures — a stat column never shifts under itself</div>
  <table>
    <tr><td><b>WARD</b></td><td class="n">1,204</td><td class="n">−18</td><td class="n">96%</td></tr>
    <tr><td><b>EMBER</b></td><td class="n">0,911</td><td class="n">+70</td><td class="n">07%</td></tr>
    <tr><td><b>CHILL</b></td><td class="n">3,388</td><td class="n">×12</td><td class="n">50%</td></tr>
  </table>
</div>

<div class="row"><div class="lab">The whole set — Frostwork above, Frostcut below</div>
  <div class="grid">${[...rows].map(cell).join('')}</div>
  <div class="grid d" style="margin-top:10px">${[...rows].map(cell).join('')}</div>
</div>

<footer>Cut by <code>tools/frostfont</code> in the games repo —
  <a href="./">back to Frostfell</a>.</footer>
</main></body></html>
`;
}

if (process.argv[1] && process.argv[1].endsWith('build.mjs')) main();
