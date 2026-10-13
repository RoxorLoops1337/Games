// Ludus Maximus 3D: fighter readability test (headless, software GL).
//   node tools/ludus3d_readability.mjs [--w 1100] [--h 650] [--t 7] [--team 3] [--tier high] [--url <base>] [--shots <prefix>] [--json]
// Renders one frame of a team fight five times with the camera frozen (everything, team A only, team B only, nobody, plus the normal frame is reused), diffs
// them to get exact fighter masks and the background behind them, then measures from the real pixels:
//   contrast   : share of fighter core pixels whose CIE76 delta E against the empty background is >= 12, and the mean delta E
//   exposure   : share of core pixels clipped (max channel >= 247) and washed (bright and nearly grey, the pink-white look)
//   teams      : dominant saturated hue of each team's accent pixels (hues outside the skin / sand band 5..55 deg) and their separation,
//                plus each team's distance to the sand hue
//   palette    : number of distinct 30 degree hue sectors with real chroma among fighter pixels (skin, cloth, leather, metal must not collapse into one hue)
// Exit code 1 when a threshold fails. Thresholds were set from the round 3 build with margin; the baseline (pink-washed) build failed exposure and teams.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const a = process.argv.slice(2), opt = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
const W = +opt('w', 1100), H = +opt('h', 650), T = +opt('t', 7), TEAM = +opt('team', 3), TIER = opt('tier', 'high'), shots = opt('shots', '');
const base = opt('url', 'http://localhost:8211/ludus_maximus_3d/index.html');
const url = `${base}?nowarm=1&demo=1&team=${TEAM}&a=murmillo&b=thraex&tier=${TIER}&manual=1`;
export const LIMITS = { contrastShare: 0.8, contrastMean: 24, clipped: 0.06, washed: 0.1, teamHueSep: 60, teamSandSep: 28, minAccentShare: 0.012, hueSectors: 4 };
const exe = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H } }); page.setDefaultTimeout(900000);
let errs = 0; page.on('pageerror', (e) => { errs++; console.log('PAGE ERROR', e.message.slice(0, 300)); });
await page.goto(url, { timeout: 900000 }); await page.waitForFunction(() => window.__LM3D, null, { timeout: 900000 });
await page.evaluate((s) => window.__LM3D.advance(s), T);
await page.evaluate(() => { const fv = window.__LM3D.game.fightView; fv.applyCamera = function () {}; });   // freeze the camera
const vis = (mode) => page.evaluate((m) => { const fv = window.__LM3D.game.fightView; for (const u of fv.F.units) { const f = fv.fm.get(u.id); if (!f) continue; f.rig.root.visible = m === 'all' || (m === 'A' && u.side === 'A') || (m === 'B' && u.side === 'B'); } window.__LM3D.advance(0.001, 0.001); }, mode);
const grab = async (m, name) => { await vis(m); const buf = await page.screenshot(); if (shots) (await import('node:fs')).writeFileSync(`${shots}_${name}.png`, buf); return buf.toString('base64'); };
const imgs = { all: await grab('all', 'all'), A: await grab('A', 'a'), B: await grab('B', 'b'), none: await grab('none', 'none') };
const R = await page.evaluate(async ({ imgs, W, H }) => {
  const load = async (b64) => { const im = new Image(); im.src = 'data:image/png;base64,' + b64; await im.decode(); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0); return x.getImageData(0, 0, im.width, im.height); };
  const I = {}; for (const k in imgs) I[k] = await load(imgs[k]);
  const w = I.all.width, h = I.all.height, N = w * h;
  const mask = (A, B) => { const m = new Uint8Array(N); for (let i = 0; i < N; i++) { const o = i * 4; if (Math.max(Math.abs(A.data[o] - B.data[o]), Math.abs(A.data[o + 1] - B.data[o + 1]), Math.abs(A.data[o + 2] - B.data[o + 2])) > 14) m[i] = 1; } return m; };
  const core = (m) => { const c = new Uint8Array(N); for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; if (m[i] && m[i - 1] && m[i + 1] && m[i - w] && m[i + w]) c[i] = 1; } return c; };
  const mAll = core(mask(I.all, I.none)), mA = core(mask(I.A, I.none)), mB = core(mask(I.B, I.none));
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lab = (r, g, b) => { r = lin(r); g = lin(g); b = lin(b); let X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, Y = 0.2126 * r + 0.7152 * g + 0.0722 * b, Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883; const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116); X = f(X); Y = f(Y); Z = f(Z); return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)]; };
  const hsv = (r, g, b) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let hh = 0; if (d > 0) { if (mx === r) hh = ((g - b) / d + 6) % 6; else if (mx === g) hh = (b - r) / d + 2; else hh = (r - g) / d + 4; hh *= 60; } return [hh, mx ? d / mx : 0, mx / 255]; };
  const D = I.all.data, E = I.none.data; let n = 0, hi = 0, dsum = 0, clip = 0, wash = 0; const sectors = new Array(12).fill(0);
  for (let i = 0; i < N; i++) if (mAll[i]) { const o = i * 4; n++;
    const l1 = lab(D[o], D[o + 1], D[o + 2]), l2 = lab(E[o], E[o + 1], E[o + 2]); const de = Math.hypot(l1[0] - l2[0], l1[1] - l2[1], l1[2] - l2[2]); dsum += de; if (de >= 12) hi++;
    const [hh, s, v] = hsv(D[o], D[o + 1], D[o + 2]); if (Math.max(D[o], D[o + 1], D[o + 2]) >= 247) clip++; if (v > 0.82 && s < 0.22) wash++; if (s > 0.28 && v > 0.15) sectors[Math.floor(hh / 30) % 12]++; }
  const accent = (m, src) => { const bins = new Array(36).fill(0); let cnt = 0, tot = 0; for (let i = 0; i < N; i++) if (m[i]) { tot++; const o = i * 4, [hh, s, v] = hsv(src[o], src[o + 1], src[o + 2]); if (s >= 0.4 && v >= 0.18 && v <= 0.97 && (hh < 5 || hh > 55)) { bins[Math.floor(hh / 10) % 36] += s * v; cnt++; } }
    let bi = 0; for (let k = 1; k < 36; k++) if (bins[k] + bins[(k + 1) % 36] * 0.5 + bins[(k + 35) % 36] * 0.5 > bins[bi] + bins[(bi + 1) % 36] * 0.5 + bins[(bi + 35) % 36] * 0.5) bi = k; return { hue: bi * 10 + 5, share: tot ? cnt / tot : 0, n: tot }; };   // dominant hue = peak of a 10 degree histogram (robust against shadowed skin)
  const tA = accent(mA, I.A.data), tB = accent(mB, I.B.data);
  let bx = 0, by = 0, bw = 0; for (let i = 0; i < N; i++) { if (!mAll[i]) { /* sand: background pixels around the fighters */ } } // sand hue from the empty frame's lower half
  for (let y = Math.floor(h * 0.55); y < Math.floor(h * 0.8); y++) for (let x = Math.floor(w * 0.2); x < Math.floor(w * 0.8); x++) { const o = (y * w + x) * 4, [hh, s, v] = hsv(E[o], E[o + 1], E[o + 2]); if (s > 0.25 && v > 0.3) { const r = hh * Math.PI / 180; bx += Math.cos(r) * s; by += Math.sin(r) * s; bw += s; } }
  const sand = ((Math.atan2(by, bx) * 180 / Math.PI) + 360) % 360, hd = (p, q) => { const d = Math.abs(p - q) % 360; return d > 180 ? 360 - d : d; };
  return { fighterPixels: n, contrastShare: n ? hi / n : 0, contrastMean: n ? dsum / n : 0, clipped: n ? clip / n : 0, washed: n ? wash / n : 0, teamA: tA, teamB: tB, teamHueSep: hd(tA.hue, tB.hue), sandHue: sand, teamSandSep: Math.min(hd(tA.hue, sand), hd(tB.hue, sand)), hueSectors: sectors.filter((c) => c > n * 0.01).length };
}, { imgs, W, H });
const L = LIMITS, fails = [];
const chk = (c, m) => { if (!c) fails.push(m); };
chk(R.fighterPixels > 4000, 'fighter pixels found (' + R.fighterPixels + ')');
chk(R.contrastShare >= L.contrastShare, `contrast share ${R.contrastShare.toFixed(2)} >= ${L.contrastShare}`);
chk(R.contrastMean >= L.contrastMean, `contrast mean dE ${R.contrastMean.toFixed(1)} >= ${L.contrastMean}`);
chk(R.clipped <= L.clipped, `clipped ${R.clipped.toFixed(3)} <= ${L.clipped}`);
chk(R.washed <= L.washed, `washed ${R.washed.toFixed(3)} <= ${L.washed}`);
chk(R.teamA.share >= L.minAccentShare && R.teamB.share >= L.minAccentShare, `both teams show accent colour (${R.teamA.share.toFixed(3)}, ${R.teamB.share.toFixed(3)})`);
chk(R.teamHueSep >= L.teamHueSep, `team hue separation ${R.teamHueSep.toFixed(0)} >= ${L.teamHueSep}`);
chk(R.teamSandSep >= L.teamSandSep, `team vs sand hue ${R.teamSandSep.toFixed(0)} >= ${L.teamSandSep}`);
chk(R.hueSectors >= L.hueSectors, `hue sectors ${R.hueSectors} >= ${L.hueSectors}`);
chk(!errs, 'no page errors');
console.log(JSON.stringify(R, (k, v) => (typeof v === 'number' ? +v.toFixed(3) : v)));
console.log(fails.length ? 'FAIL\n - ' + fails.join('\n - ') : 'PASS readability');
await browser.close(); process.exit(fails.length ? 1 : 0);
