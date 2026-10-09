// Lab helper for the hub pages: loads the real game scripts like gamelab.js but skips EI.resize() (it needs the boot canvas) and waits for the art.
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
  if (o.wallet) S.wallet = o.wallet; if (o.gems) S.gems = o.gems; if (o.fans) { S.houses = 3; for (let i = 0; i < o.fans; i++) EI.recruit(); }
  await new Promise((r) => { const t0 = Date.now(); (function w() { if (typeof ART !== 'undefined' && ART.ready || Date.now() - t0 > 4000) r(); else setTimeout(w, 50); })(); });
  window.__game = { EI, S: () => EI.S }; return window.__game;
}
