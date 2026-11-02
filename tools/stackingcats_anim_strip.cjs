// Contact sheets of the walking cat (Stacking Cats, Whiskerton Walk) in a real browser. Usage:
//   node tools/stackingcats_anim_strip.cjs [outDir] [baseUrl]     (defaults: ./anim_strips, http://localhost:8765)
// Serve the repo first: nohup python3 -m http.server 8765 -d /home/user/Games &
// Writes cats.png (4 cats, idle/run/sit/sleep/jump/fall/land over time), sweep.png (walk, trot, run speed sweep),
// transitions.png (idle, run, stop, jump, land) and tail.png (tail angle trace while running), all at 2x zoom, via drawWalkCat on a plain canvas.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const OUT = path.resolve(process.argv[2] || 'anim_strips');
const BASE = process.argv[3] || 'http://localhost:8765';
fs.mkdirSync(OUT, { recursive: true });

const PAGE = async (page) => {
  await page.goto(BASE + '/stacking_cats/');
  await page.waitForTimeout(800);
  return page.evaluate(async () => {
    const m = await import('/stacking_cats/kingdom_cat.js');
    window.__cat = m; return Object.keys(m);
  });
};

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  console.log('exports', (await PAGE(p)).join(','));
  const sheet = async (name, spec) => {
    spec = { ...spec, rows: spec.rows.map((r) => ({ cat: r.cat, key: r.key, label: r.label, frames: Array.from({ length: spec.cols }, (_, c) => r.frame(c)) })) };
    const url = await p.evaluate(async (spec) => {
      const { drawWalkCat } = window.__cat; const Z = 2, CW = 100, CH = 100;
      const rows = spec.rows, cols = spec.cols;
      const cv = document.createElement('canvas'); cv.width = cols * CW * Z; cv.height = rows.length * CH * Z + 14 * rows.length;
      const ctx = cv.getContext('2d'); ctx.fillStyle = '#9ad0e8'; ctx.fillRect(0, 0, cv.width, cv.height); ctx.font = '12px sans-serif';
      rows.forEach((row, r) => {
        const y0 = r * (CH * Z + 14);
        ctx.fillStyle = '#123'; ctx.fillText(row.label, 4, y0 + 11);
        ctx.fillStyle = '#7bb35a'; ctx.fillRect(0, y0 + 14 + 90 * Z, cv.width, 10 * Z);
        for (let c = 0; c < cols; c++) {
          const f = row.frames[c];   // { pose, t, face, dx, lift, tag }
          ctx.save(); ctx.translate(c * CW * Z, y0 + 14); ctx.scale(Z, Z);
          // a fresh key per column would reset the pose clock, so one key per row keeps the pose timing continuous
          drawWalkCat(ctx, row.cat, f.pose, 50 + (f.dx || 0), 90 - (f.lift || 0), f.face || 1, f.t, !!spec.reduced, row.key);
          ctx.restore();
          ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillText(f.tag || '', c * CW * Z + 3, y0 + 14 + CH * Z - 3);
        }
      });
      return cv.toDataURL('image/png');
    }, spec);
    fs.writeFileSync(path.join(OUT, name), Buffer.from(url.split(',')[1], 'base64'));
    console.log('wrote', path.join(OUT, name));
  };
  // The drawWalkCat clock is the caller's t: frames are 1/30 s apart. Each row uses a distinct key so cats do not share state.
  const CATS = ['tabby', 'ember', 'mochi', 'sparky'];
  const POSES = [['idle', 6], ['run', 8], ['sit', 3], ['sleep', 3], ['jump', 4], ['fall', 3], ['land', 4]];
  const catRows = [];
  for (const cat of CATS) for (const [pose, nf] of POSES) {
    catRows.push({ cat, key: 'sheet_' + cat + '_' + pose, label: cat + ' ' + pose, frame: (c) => ({ pose, t: 10 + c / 30 * (pose === 'run' ? 1 : 3), face: 1, tag: c % 4 === 0 ? ('f' + c) : '' }) });
  }
  // keep the sheet readable: 12 columns, 28 rows is tall, so split into one sheet per cat
  for (const cat of CATS) await sheet('cats_' + cat + '.png', { cols: 12, rows: catRows.filter((r) => r.cat === cat) });
  // speed sweep: run pose at three paces (the walk module owns kind selection, so this shows the rig's response over time)
  const sweep = ['walk', 'trot', 'run'].map((k, i) => ({ cat: 'tabby', key: 'sweep' + k, label: 'sweep ' + k, frame: (c) => ({ pose: 'run', t: 20 + c / 30, face: 1, dx: ((c * (60 + i * 80) / 30) % 60) - 30, tag: k + ' f' + c }) }));
  await sheet('sweep.png', { cols: 12, rows: sweep });
  // transitions idle -> run -> stop -> jump -> land (frames every 1/20 s; the pose names mirror the walk sim)
  const seq = [['idle', 6], ['run', 12], ['idle', 5], ['jump', 5], ['fall', 3], ['land', 5], ['idle', 4]];
  const flat = []; seq.forEach(([pose, n]) => { for (let i = 0; i < n; i++) flat.push(pose); });
  const trans = ['tabby', 'mochi', 'sparky'].map((cat) => ({ cat, key: 'trans_' + cat, label: 'transitions ' + cat, frame: (c) => ({ pose: flat[c % flat.length], t: 30 + c / 20, face: 1, lift: flat[c] === 'jump' ? 25 : flat[c] === 'fall' ? 12 : 0, tag: flat[c] + ' f' + c }) }));
  await sheet('transitions.png', { cols: flat.length, rows: trans });
  console.log('errors', errs.slice(0, 5).join(' | ') || 'none');
  await b.close();
})();
