// Load the real game (the classic scripts from ../index.html, in order) into a lab page, headless-style, so 3D modules can read live game state
// (S, geoOf, BIOMES, UPG_POS ...) exactly as they do in the game. Usage:
//   import { loadGame } from './gamelab.js'; const g = await loadGame({ lands: 3, wallet: 5e5 });   // g.EI, g.S
// After this, `S`, `HUB`, `geoOf` ... exist as globals for module code (classic-script top-level bindings), and EI.draw is NOT running.
export async function loadGame(o = {}) {
  window.__EI_HEADLESS__ = true;
  const html = await (await fetch('../index.html')).text();
  const srcs = [...html.matchAll(/<script src="(js\/[^"]+)"/g)].map((m) => m[1]);
  const cv = document.createElement('canvas'); cv.id = 'game'; cv.width = 800; cv.height = 600; cv.style.display = 'none'; document.body.appendChild(cv);
  for (const s of srcs) await new Promise((res, rej) => { const el = document.createElement('script'); el.src = '../' + s; el.onload = res; el.onerror = () => rej(new Error('load ' + s)); document.head.appendChild(el); });
  const EI = window.EI; EI.setupCtx(cv.getContext('2d')); try { EI.resize && EI.resize(); } catch (e) { /* no main canvas in the lab (boot() is not run) */ }
  EI.initGame(true); const S = EI.S; S.started = true; S.t = 0;
  try { const T = EI.FEATS.find((f) => f.id === 'tutorial').api; S.feat.tutorial.off = true; T.finish(); } catch (e) { /* tutorial optional */ }
  for (let i = 0; i < (o.lands || 0); i++) EI.addLand();
  if (o.wallet) S.wallet = o.wallet; if (o.gems) S.gems = o.gems; if (o.fans) { S.houses = 3; for (let i = 0; i < o.fans; i++) EI.recruit(); }
  if (o.enemies) { EI.seedMain(7); for (const z of S.lands) for (let i = 0; i < o.enemies; i++) EI.spawnEnemy(z); for (const e of S.enemies) e.born = 1; }
  await new Promise((r) => { const t0 = Date.now(); (function w() { if (typeof ART !== 'undefined' && ART.ready || Date.now() - t0 > 4000) r(); else setTimeout(w, 50); })(); });
  window.__game = { EI, S: () => EI.S }; return window.__game;
}
