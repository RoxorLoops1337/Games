// Generates the Drop the Bass PWA icons (drop_the_bass/icons/*.png) with Playwright Chromium canvas rendering.
// Crayon style: cream paper, a wobbly pink speaker with a green cone, and the duo busts from js/doodle_heroes.js.
// Run: node tools/dtb_make_icons.mjs   (needs playwright + chromium; then run tools/dtb_make_manifest.mjs)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pw = null;
for (const base of [ROOT, '/opt/node-tools', '/usr/lib/node_modules', '/usr/local/lib/node_modules']) {
  for (const dir of [base, path.join(base, 'node_modules')]) { try { pw = createRequire(path.join(dir, 'x.js'))('playwright'); if (pw && pw.chromium) break; } catch (e) { pw = null; } }
  if (pw) break;
}
if (!pw) { console.error('playwright not found'); process.exit(1); }
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  fs.readFile(path.join(ROOT, p), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); } else { res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(d); } });
});
await new Promise((r) => srv.listen(0, r));
const browser = await pw.chromium.launch();
const page = await browser.newPage();
await page.goto('http://localhost:' + srv.address().port + '/drop_the_bass/lab/doodle_heroes.html').catch(() => {});
const mod = '/drop_the_bass/js/doodle_heroes.js';
// kind: 'any' (full bleed square, rounded by the OS) | 'maskable' (art kept inside the central 80 percent safe zone)
const draw = async (size, kind) => page.evaluate(async ({ size, kind, mod }) => {
  const H = await import(mod);
  const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d');
  const s = size / 512, INK = '#2b2733';
  x.fillStyle = '#fbf6e6'; x.fillRect(0, 0, size, size);
  // paper grain, deterministic
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 260; i++) { x.fillStyle = 'rgba(180,160,120,' + (0.04 + rnd() * 0.05) + ')'; x.fillRect(rnd() * size, rnd() * size, 2 * s + rnd() * 5 * s, 1 * s); }
  const k = kind === 'maskable' ? 0.78 : 1;
  x.save(); x.translate(size / 2, size / 2); x.scale(s * k, s * k); x.translate(-256, -256);
  const wob = (cx, cy, r, fill, lw, n) => {
    x.beginPath();
    for (let i = 0; i <= 48; i++) { const a = i / 48 * Math.PI * 2, rr = r * (1 + Math.sin(a * 3 + n) * 0.025); const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr; i ? x.lineTo(px, py) : x.moveTo(px, py); }
    x.closePath(); if (fill) { x.fillStyle = fill; x.fill(); } x.lineWidth = lw; x.strokeStyle = INK; x.lineJoin = 'round'; x.lineCap = 'round'; x.stroke();
  };
  // speaker cabinet
  x.save(); x.rotate(-0.04); x.translate(0, 0);
  x.beginPath(); x.roundRect(86, 70, 340, 372, 44); x.fillStyle = '#ff5fb0'; x.fill(); x.lineWidth = 12; x.strokeStyle = INK; x.stroke();
  x.beginPath(); x.roundRect(104, 88, 304, 40, 20); x.fillStyle = 'rgba(255,255,255,0.35)'; x.fill();
  wob(256, 330, 92, '#9dff3a', 11, 1); wob(256, 330, 52, '#fbf6e6', 9, 2); wob(256, 330, 16, INK, 6, 3);
  wob(256, 150, 28, '#fbf6e6', 9, 4);
  x.restore();
  // the duo above the cabinet
  H.drawBust(x, 'roxor', 186, 168, 150, { t: 0.4, pose: 'hype' });
  H.drawBust(x, 'jasmin', 326, 168, 146, { t: 0.7, pose: 'idle' });
  x.restore();
  return c.toDataURL('image/png').split(',')[1];
}, { size, kind, mod });
const out = path.join(ROOT, 'drop_the_bass', 'icons'); fs.mkdirSync(out, { recursive: true });
const jobs = [['icon-192.png', 192, 'any'], ['icon-512.png', 512, 'any'], ['icon-maskable-512.png', 512, 'maskable'], ['apple-touch-icon.png', 180, 'any']];
for (const [name, size, kind] of jobs) { fs.writeFileSync(path.join(out, name), Buffer.from(await draw(size, kind), 'base64')); console.log('wrote', name); }
await browser.close(); srv.close();
