// Offline mix gate: renders every sfx and music mode in headless chromium (see tools/graftwork_audio_check.mjs).
// Hard asserts (calibrated against the measured mix): no clipping (stacks included), no silent or inaudible sfx, no harsh sfx,
// hit tiers ordered, heartbeat and Thread sounds unmasked by music, music clearly below sfx, muted means silent.
// Skips cleanly only when Playwright or chromium is missing; a page error with chromium present FAILS.
import assert from 'node:assert/strict';
import { runAudioCheck, masking, SEAMS } from '../tools/graftwork_audio_check.mjs';

// Skips ONLY when playwright/chromium is unavailable. If chromium runs and the page throws, runAudioCheck throws and this test fails.
const r = await runAudioCheck();
if (r.skipped) { console.log('graftwork audio mix skipped: ' + r.skipped); process.exit(0); }

const warns = [];
const soft = (ok, msg) => assert.ok(ok, msg);
assert.equal((r.errors || []).length, 0, 'audio page threw');

for (const n of r.names) {
  const m = r.sfx[n];
  assert.ok(!m.silent, 'sfx is silent: ' + n);
  assert.equal(m.clip, 0, 'sfx clips: ' + n);
  soft(!m.cutEnd, 'sfx ends abruptly (no fade): ' + n);
  soft(m.startAbs <= 0.03, 'sfx starts with a click: ' + n);
  soft(Math.abs(m.dc) < 0.002, 'sfx DC offset: ' + n);
  soft(m.centroid < 5000, 'sfx is harsh (centroid ' + m.centroid + ' Hz): ' + n);
  soft(m.stDb > -40 && m.peakDb > -28, 'sfx is nearly inaudible (peak ' + m.peakDb.toFixed(1) + ', st ' + m.stDb.toFixed(1) + ' dB): ' + n);
  if (/^ui|comboTick|cardDraw|shuffle|intentReveal|burnApply/.test(n)) soft(m.peakDb > -24 && m.peakDb < -8, 'UI sfx outside the quiet-UI band (-24..-8 dB peak): ' + n + ' ' + m.peakDb.toFixed(1));
  soft(m.peakDb < -1, 'sfx peaks above -1 dBFS: ' + n);
}
for (const k of ['music', 'musicHot']) for (const n of r.modes) {
  const m = r[k][n];
  assert.equal(m.clip, 0, k + ' clips: ' + n);
  assert.ok(!m.silent, k + ' is silent: ' + n);
  soft(Math.abs(m.dc) < 0.002, 'music DC offset: ' + n);
  soft(m.stDb < r.sfx.hitMedium.stDb - 6, 'music is not clearly below sfx: ' + n);
}
for (const [k, m] of Object.entries(r.stack)) {
  assert.equal(m.clip, 0, 'stack clips: ' + k);
  soft(m.peakDb < -1, 'stack peaks too hot: ' + k + ' ' + m.peakDb.toFixed(1));
  soft(m.voices <= 40, 'stack voice cap exceeded: ' + k + ' voices=' + m.voices);
}
assert.ok(r.muted.peakDb < -60, 'muted audio is not silent: ' + r.muted.peakDb.toFixed(1) + ' dB');

const st = n => r.sfx[n].stDb;
for (const [a, b] of [['hitLight', 'hitMedium'], ['hitMedium', 'hitHeavy'], ['hitHeavy', 'hitCrush']]) soft(r.sfx[a].peakDb < r.sfx[b].peakDb, 'hit tier peak order ' + a + ' < ' + b);
soft(st('hitLight') < st('hitMedium') && st('hitMedium') < st('hitHeavy') && st('hitHeavy') < st('hitCrush'), 'hit tiers not ordered light < medium < heavy < crush');
for (const m of r.modes) {
  const k = masking(r, m);
  soft(k.heartbeat >= 6, 'heartbeat masked by music ' + m + ' (' + k.heartbeat.toFixed(1) + ' dB)');
  for (const s of SEAMS) soft(k[s] >= 0, s + ' masked by music ' + m + ' (' + k[s].toFixed(1) + ' dB)');
}
for (const w of warns) console.log('WARN ' + w);
console.log('graftwork audio mix ok: ' + r.names.length + ' sfx, ' + r.modes.length + ' modes, ' + warns.length + ' warnings');
