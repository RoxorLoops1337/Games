// Ludus Maximus 3D: gore budgets in a real fight (headless Chromium, swiftshader). The same scripted blows (six crits and a kill in a 3v3 on the low tier)
// run at Off, Low and Full: Off must leave NO gore object at all (no droplets, jets, props, lens canvas), Low must be cheaper than Full and carry no limbs or chunks,
// and Full must stay inside the phone budget (150 calls, 300k triangles) and the pool caps. SKIPPED (exit 0) when playwright or Chromium is missing.
import { launch, browserAvailable, stopServer } from '../tools/ludus3d_qa_lib.mjs';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  FAIL:', m); } };
if (!(await browserAvailable())) { console.log('ludus_maximus_3d_gore: skipped (no Chromium)'); process.exit(0); }
const dog = setTimeout(() => { console.error('FAIL: gore suite hung'); process.exit(1); }, 420000); dog.unref();

async function run(level) {
  const h = await launch({ vp: 'phone', query: `demo=1&team=3&lvl=8&tier=low&gore=${level}&manual=1&nowarm=1`, noBoot: true });
  await h.page.waitForFunction(() => window.__LM3D.game.fightView && window.__LM3D.game.fightView.F, null, { timeout: 120000 });
  const r = await h.page.evaluate(() => {
    const L = window.__LM3D; L.advance(9); const fv = L.game.fightView, F = fv.F, A = F.units.filter((u) => u.side === 'A'), B = F.units.filter((u) => u.side === 'B'), src = A[0], d = B[0];
    for (let i = 0; i < 6; i++) fv.onEvent({ k: 'hit', src: src.id, dst: B[i % B.length].id, dmg: Math.round(d.maxhp * 0.18), crit: true });
    d.hp = 0; d.down = true; d.s = {}; fv.onEvent({ k: 'hit', src: src.id, dst: d.id, dmg: Math.round(d.maxhp * 0.4), crit: true }); fv.onEvent({ k: 'down', dst: d.id, src: src.id });
    let peakDrops = 0, peakLens = 0, peakProps = 0, peakJets = 0, peakCalls = 0, peakTris = 0;
    for (let i = 0; i < 12; i++) { L.advance(0.25); const g = fv.gore.stats(), s = L.stats(); peakDrops = Math.max(peakDrops, g.drops); peakLens = Math.max(peakLens, g.lens); peakProps = Math.max(peakProps, g.props); peakJets = Math.max(peakJets, g.jets); peakCalls = Math.max(peakCalls, s.calls); peakTris = Math.max(peakTris, s.triangles); }
    const g = fv.gore.stats(); let gibsVisible = false; fv.scene.traverse((o) => { if (o.name === 'gore_gibs' && o.visible) gibsVisible = true; });
    return { peakDrops, peakLens, peakProps, peakJets, peakCalls, peakTris, splats: g.splats, pools: g.pools, lensCanvas: !!document.querySelector('.gore-lens'), gibsVisible, level: g.level };
  });
  ok(h.F.list.filter((f) => f.sev === 'high').length === 0, `${level}: no page errors ` + JSON.stringify(h.F.list.slice(0, 2)));
  await h.browser.close(); return r;
}

const off = await run('off'), low = await run('low'), full = await run('full');
ok(off.level === 'off' && off.peakDrops === 0 && off.peakJets === 0 && off.peakProps === 0 && off.splats === 0 && off.pools === 0, 'Off: not one droplet, jet, prop, splat or pool: ' + JSON.stringify(off));
ok(!off.lensCanvas && !off.gibsVisible && off.peakLens === 0, 'Off: no lens canvas and no gib mesh drawn');
ok(low.level === 'low' && low.peakDrops > 0 && low.peakProps === 0 && !low.gibsVisible, 'Low: blood but no limbs or chunks: ' + JSON.stringify(low));
ok(low.splats < full.splats && low.peakLens < full.peakLens && low.peakProps < full.peakProps, `Low is cheaper than Full (floor splats ${low.splats} < ${full.splats}, lens drops ${low.peakLens} < ${full.peakLens}, props ${low.peakProps} < ${full.peakProps}; droplet pools saturate on the low tier in both)`);
ok(full.level === 'full' && full.peakDrops > 60 && full.peakJets >= 2 && full.peakProps > 0 && full.peakLens >= 1, 'Full: spray, jets, props and lens drops appear: ' + JSON.stringify(full));
ok(full.peakDrops <= 240 && full.peakLens <= 8 && full.peakJets <= 20 && full.pools <= 26, 'pool caps hold (low tier: 240 droplets, 8 lens drops, 20 jets, 26 pools)');
ok(full.peakCalls <= 150 && full.peakTris <= 300000, `Full on the phone tier stays inside the mobile budget (calls ${full.peakCalls} <= 150, tris ${full.peakTris} <= 300000)`);
ok(full.peakCalls - off.peakCalls <= 3, `gore adds at most 3 draw calls (full ${full.peakCalls}, off ${off.peakCalls})`);
stopServer();
console.log(`ludus_maximus_3d_gore: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
