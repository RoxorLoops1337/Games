// Batch 14 (agent e): breakdown bar, world win/lose motifs, moment haptics.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isBreakdown, isDrop, worldMotif, hapticPattern, buzzFor, bindMomentHaptics, HAP } from '../../cell_serpent/audio_b14e.js';
import { SKINS } from '../../cell_serpent/sim.js';
const rd = p => readFileSync(new URL('../../cell_serpent/' + p, import.meta.url), 'utf8');

// breakdown: every 8th section, bars 0..2, never boss, never in danger, never the first sections
{
  const hits = []; for (let sec = 0; sec < 17; sec++) for (let bar = 0; bar < 4; bar++) if (isBreakdown(sec, bar, false, 0)) hits.push(sec + ':' + bar);
  assert.deepEqual(hits, ['7:0', '7:1', '7:2', '15:0', '15:1', '15:2']);
  assert.ok(!isBreakdown(7, 0, true, 0) && !isBreakdown(7, 0, false, 0.6), 'boss and danger keep the drums');
  assert.ok(isDrop(8, 0, 0, false) && !isDrop(8, 0, 1, false) && !isDrop(0, 0, 0, false) && !isDrop(8, 0, 0, true));
  const a = rd('audio.js');
  assert.ok(/const bk = isBreakdown\(sec, bar, boss, m\.danger\)/.test(a) && /if \(bk\) \{ \/\* breakdown/.test(a), 'pump uses the breakdown');
  assert.ok(/!bk && s % 2 === 0\) tone\(hz\(bassM/.test(a) && /\|\| boss \|\| bk\)\) \{ \[c0/.test(a), 'bass drops, pad stays');
}
// motifs: every world has a distinct 4 note win and lose phrase, win climbs, lose sinks, short
{
  const wins = new Set(), loses = new Set();
  for (const sk of SKINS) {
    const w = worldMotif(sk, true), l = worldMotif(sk, false);
    assert.equal(w.length, 4); assert.equal(l.length, 4);
    assert.ok(w[3].hz > w[0].hz, sk + ' win ends higher'); assert.ok(l[3].hz < l[0].hz, sk + ' lose ends lower');
    for (const n of [...w, ...l]) assert.ok(n.hz > 80 && n.hz < 3000 && n.vol <= 0.06);
    assert.ok(Math.max(...w.map(n => n.at + n.dur)) < 1.5 && Math.max(...l.map(n => n.at + n.dur)) < 1.5);
    wins.add(w.map(n => Math.round(n.hz)).join()); loses.add(l.map(n => Math.round(n.hz)).join());
  }
  assert.equal(wins.size, SKINS.length); assert.equal(loses.size, SKINS.length);
  assert.equal(worldMotif('nope', true).length, 4, 'unknown world falls back');
  assert.ok(/audio\.play\('worldmotif'/.test(rd('main.js')) && /registerB14e\(sfx/.test(rd('audio.js')));
}
// haptics: respects vibrate and reduce motion, statbuy grows with level, capped
{
  const calls = [], nav = { vibrate: p => { calls.push(p); return true; } };
  assert.equal(buzzFor('unlock', {}, { vibrate: true }, nav), true); assert.deepEqual(calls[0], HAP.unlock);
  assert.equal(buzzFor('unlock', {}, { vibrate: false }, nav), false);
  assert.equal(buzzFor('unlock', {}, { vibrate: true, reduceMotion: true }, nav), false);
  assert.equal(buzzFor('nothing', {}, { vibrate: true }, nav), false);
  assert.equal(buzzFor('unlock', {}, { vibrate: true }, {}), false, 'no vibrate api');
  const len = n => hapticPattern('statbuy', { n }).filter((_, i) => i % 2 === 0).length;
  assert.deepEqual([1, 3, 4, 7, 10, 30].map(len), [1, 1, 2, 3, 4, 4]);
  for (const k of Object.keys(HAP)) assert.ok(HAP[k].reduce((a, b) => a + b, 0) < 260, k + ' short');
  assert.deepEqual(hapticPattern('worldmotif', { won: true }), HAP.winmotif);
  const log = [], au = { play: n => { log.push(n); return 1; } };
  bindMomentHaptics(au, () => ({ vibrate: true })); bindMomentHaptics(au, () => ({ vibrate: true }));
  au.play('click'); assert.deepEqual(log, ['click']);
}
console.log('37_e_moments_b14e ok');
