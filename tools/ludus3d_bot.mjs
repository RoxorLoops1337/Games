// Ludus Maximus 3D: bot playtest. Plays N weeks through the real UI flow (dialogs auto-clicked), fights stepped with __LM3D.advance().
//   node tools/ludus3d_bot.mjs "<url with ?new=1&rich=1&empty=1&tier=low&manual=1>" [--weeks 3] [--shots /tmp/dir] [--w 390 --h 800]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const a = process.argv.slice(2), url = a[0], opt = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
const weeks = +opt('weeks', 3), shots = opt('shots', ''), W = +opt('w', 390), H = +opt('h', 800);
const exe = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
let errs = 0; page.on('pageerror', (e) => { errs++; console.log('PAGE ERROR', e.message.slice(0, 400)); });
page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) { errs++; console.log('CONSOLE', m.text().slice(0, 300)); } });
await page.goto(url); await page.waitForFunction(() => window.__LM3D && window.__LM3D.game && window.__LM3D.game.S, null, { timeout: 90000 });
// set up: three fighters, enter every available event for the first league
const setup = await page.evaluate(() => {
  const g = window.__LM3D.game, LM = globalThis.LM, S = g.S;
  if (!S.glads.length) { ['murmillo', 'thraex', 'hoplomachus'].forEach((st, i) => { const gl = LM.makeGlad({ id: S.nextId++, style: st, lvl: 3 + i }); S.glads.push(gl); }); }
  S.flags.auto = true; return { glads: S.glads.length };
});
console.log('setup', JSON.stringify(setup));
// --move: a scripted MOVE (rearrange mode): open it with the hammer button, lift a building, preview an empty plot, confirm, let the cinematic play, leave the mode
if (a.includes('--move')) {
  const info = await page.evaluate(async () => {
    const g = window.__LM3D.game, LM = globalThis.LM, S = g.S; S.gold = Math.max(S.gold, 800);
    const from = S.plots.findIndex((p, i) => p && !LM.moveWhySource(S, i)), to = S.plots.findIndex((p, i) => !p && i < S.rows * LM.COLS);
    if (from < 0 || to < 0) return { err: 'no movable building or no empty plot' };
    document.querySelector('.lx-rr-fab').click(); await new Promise((r) => setTimeout(r, 600));
    if (!g.rearr.active) return { err: 'mode did not open' };
    g.rearr.tap(from); g.rearr.tap(to); await new Promise((r) => setTimeout(r, 300));
    const card = document.querySelector('.lx-rr-confirm'); if (!card) return { err: 'no confirm card', st: g.rearr.state };
    const b = S.plots[from].b, gold0 = S.gold; card.querySelector('[data-rr=ok]').click();
    return { from, to, b, gold0 };
  });
  console.log('move', JSON.stringify(info)); if (info.err) errs++;
  for (let k = 0; k < 16; k++) { await page.evaluate(() => window.__LM3D.advance(0.5)); if (!(await page.evaluate(() => window.__LM3D.game.rearr.state.cine))) break; }
  const after = await page.evaluate(() => { const g = window.__LM3D.game, S = g.S; const r = { moving: S.plots.map((p, i) => (p && p.mv ? i + ':' + p.b + ' until ' + p.mv.u : null)).filter(Boolean), gold: S.gold, active: g.rearr.active }; g.rearr.stop(); return r; });
  console.log('after move', JSON.stringify(after));
  if (shots) await page.screenshot({ path: `${shots}/bot_move.png` });
}
let n = 0, shotN = 0;
for (let wk = 0; wk < weeks; wk++) {
  const info = await page.evaluate(() => {
    const g = window.__LM3D.game, LM = globalThis.LM, S = g.S; const evs = LM.events(S, S.week, 0) || []; let entered = 0;
    const free = S.glads.filter((x) => x.inj <= 0 && x.en >= 30);
    for (const ev of evs) { if (!free.length) break; const size = LM.teamSize ? LM.teamSize(ev) : 1; const pick = free.splice(0, size || 1); if (pick.length < (size || 1)) break; const e = LM.enter(S, ev, pick.map((x) => x.id), 'bal'); if (!e) entered++; }
    window.__bot = { done: false, err: null }; g.advance().then(() => { window.__bot.done = true; }).catch((e) => { window.__bot.err = String(e); window.__bot.done = true; });
    return { week: S.week, events: evs.length, entered, gold: S.gold };
  });
  console.log('week', JSON.stringify(info));
  let guard = 0, last = '';
  while (guard++ < 600) {
    const st = await page.evaluate(() => {
      if (window.__bot.done) return { done: true, err: window.__bot.err };
      const btn = [...document.querySelectorAll('.lx-scrim .lx-actions .lx-btn')].filter((b) => !b.disabled).slice(-1)[0] || document.querySelector('.lx-scrim .lx-actions .lx-btn');
      const title = (document.querySelector('.lx-scrim .lx-panel-title, .lx-scrim .lx-title, .lx-scrim h2') || {}).textContent || '';
      if (btn && !window.__botClick) { const first = document.querySelector('.lx-scrim .lx-actions .lx-btn:not([disabled])'); window.__botTitle = title; (first || btn).click(); return { clicked: title || (first && first.textContent) }; }
      return { adv: true, scene: window.__LM3D.game.scene };
    });
    if (st.done) { if (st.err) { console.log('flow error', st.err); errs++; } break; }
    if (st.clicked !== undefined) { if (st.clicked !== last) console.log('  dialog:', String(st.clicked).slice(0, 60)); last = st.clicked; await page.waitForTimeout(250); continue; }
    await page.evaluate(() => window.__LM3D.advance(1.5));
    if (shots && shotN < 6 && guard % 12 === 0) { await page.screenshot({ path: `${shots}/bot_${shotN++}.png` }); }
  }
  console.log('  week finished after', guard, 'steps');
}
const fin = await page.evaluate(() => { const S = window.__LM3D.game.S; return { building: S.plots.filter((p) => p && p.mv).length ? 'still rebuilding' : 'all ready', week: S.week, gold: S.gold, fame: S.fame, fights: S.stats.fights, wins: S.stats.wins }; });
console.log('final', JSON.stringify(fin), errs ? errs + ' errors' : 'ok');
await browser.close(); process.exit(errs ? 1 : 0);
