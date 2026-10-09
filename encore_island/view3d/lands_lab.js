// Lab helper for lands3d (lab_lands.html): loads the real game scripts like gamelab.js, but tolerates the headless canvas-less resize().
// Also holds the scenario setups the lab pages use (build every tower, drain/fill the wallet, fake a prestige reset ...). Lab only.
export async function loadGame(o = {}) {
  window.__EI_HEADLESS__ = true;
  const html = await (await fetch('../index.html')).text();
  const srcs = [...html.matchAll(/<script src="(js\/[^"]+)"/g)].map((m) => m[1]);
  const cv = document.createElement('canvas'); cv.id = 'game'; cv.width = 800; cv.height = 600; cv.style.display = 'none'; document.body.appendChild(cv);
  for (const s of srcs) await new Promise((res, rej) => { const el = document.createElement('script'); el.src = '../' + s; el.onload = res; el.onerror = () => rej(new Error('load ' + s)); document.head.appendChild(el); });
  const EI = window.EI; EI.setupCtx(cv.getContext('2d'));
  EI.initGame(true); const S = EI.S; S.started = true; S.t = 0;
  try { const T = EI.FEATS.find((f) => f.id === 'tutorial').api; S.feat.tutorial.off = true; T.finish(); } catch (e) { /* tutorial optional */ }
  for (let i = 0; i < (o.lands || 0); i++) EI.addLand();
  S.wallet = o.wallet || 0;
  window.__game = { EI, S: () => EI.S }; return window.__game;
}
/** build a plate by id on land k exactly like paying for it (applies its effect, marks it built) */
export function buildPlate(k, id, n = 1) {
  const S = window.EI.S, z = S.lands[k - 1], pl = z.plates.find((p) => p.id === id); if (!pl) return null;
  for (let i = 0; i < n; i++) { applyPlate(z, pl); if (pl.repeat) { pl.lvl++; pl.paid = 0; pl.cost = Math.ceil(pl.base * Math.pow(pl.mul, pl.lvl)); if (pl.lvl >= pl.maxLvl) pl.built = true; } else pl.built = true; }
  return pl;
}
