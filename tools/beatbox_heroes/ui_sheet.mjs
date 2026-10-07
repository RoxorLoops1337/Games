// Contact sheet: node tools/beatbox_heroes/ui_sheet.mjs <dir> <out.png> name1,name2,...   (stitches <dir>/<name>.png side by side)
import path from 'node:path'; import { fileURLToPath } from 'node:url'; import { createRequire } from 'node:module';
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..'); const sharp = createRequire(import.meta.url)(path.join(REPO, 'node_modules', 'sharp'));
const [dir, out, names] = process.argv.slice(2); const ims = names.split(',').map((n) => path.join(dir, n + '.png')); const metas = await Promise.all(ims.map((f) => sharp(f).metadata()));
const w = metas.reduce((a, m) => a + m.width + 12, 0), hh = Math.max(...metas.map((m) => m.height)); let x = 0;
await sharp({ create: { width: w, height: hh, channels: 3, background: '#0b0814' } }).composite(ims.map((f, i) => { const c = { input: f, left: x, top: 0 }; x += metas[i].width + 12; return c; })).png().toFile(path.join(dir, out));
