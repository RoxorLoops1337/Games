// r3 FRAMES gate (PERF): the REAL game in 3D (?r=3d, headless Chromium + swiftshader, phone viewport 390x844 @3x) on a short route (title -> street -> home -> street -> park -> a resize),
// sampling the visible composite on every animation frame with tools/beatbox_heroes/blackframes.mjs. Fails on ANY near-black or flat-dark frame while no opaque cover (#fade, splash, opaque DOM) is up,
// on a resize that leaves a cleared canvas, and on a post-chain ladder step on valid worlds (the guard must not misread dark scenes).
// SKIPPED (exit 0) when playwright-core or Chromium is missing, unless BBH_BROWSER=1.
import { ok, done } from './beatbox_heroes_lib.mjs';
import { r3env } from './beatbox_heroes_r3lib.mjs';
import { probeRun, summarize } from '../tools/beatbox_heroes/blackframes.mjs';

const watchdog = setTimeout(() => { console.error('FAIL: r3frames suite hung'); process.exit(1); }, 900000);
const env = await r3env('beatbox_heroes_r3frames');
try {
  for (const q of ['med', 'low']) {
    const r = await probeRun(env, { view: 'mobile', q, route: 'short' });
    if (process.env.BBH_TRACE) console.log(summarize(r));
    ok(Object.values(r.steps).every(Boolean), q + ': every route step reached its 3D scene (' + Object.entries(r.steps).filter(([, v]) => !v).map(([k]) => k).join(',') + ')');
    ok(r.frames > 30, q + ': frames were sampled (' + r.frames + ')');
    ok(r.dark.length === 0, q + ': no uncovered black or flat-dark frame' + (r.dark.length ? ': ' + JSON.stringify(r.dark.slice(0, 3)) : ''));
    ok(r.resize && r.resize.cleared === 0, q + ': a resize never leaves a cleared canvas (' + JSON.stringify(r.resize) + ')');
    ok(!r.post || r.post.rung <= 2, q + ': the blank-frame guard did not step down on valid worlds (rung 2 is the default 8-bit floor, 3 would be a guard step; rung ' + (r.post && r.post.rung) + ')');
    ok(r.errs.length === 0, q + ': no page errors' + (r.errs.length ? ': ' + r.errs.slice(0, 3).join(' | ') : ''));
  }
} catch (e) { ok(false, 'r3frames threw: ' + (e && e.stack || e)); }
await env.stop(); clearTimeout(watchdog);
done('beatbox_heroes_r3frames');
