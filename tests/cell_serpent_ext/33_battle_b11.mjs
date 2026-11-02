// Batch 11 Battle tab: named worlds on the strip, power gap shortcut, claim counts on side chips, stage overview sheet.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ACTS, actOf, actDone, actTarget, actStripHTML, gapFix, gapFixHTML, GAIN, alertLabel, hasAlert, overviewHTML } from '../../cell_serpent/battle_b11.js';
import { isBossStage, stageKind, MAX_STAGE } from '../../cell_serpent/sim.js';
const rd = f => fs.readFileSync(new URL('../../cell_serpent/' + f, import.meta.url), 'utf8');
const main = rd('main.js'), html = rd('index.html'), hub2 = rd('hub2.js'), ui = rd('battle_b11.js');

// worlds: five of ten stages, each named
assert.equal(ACTS.length, 5);
assert.deepEqual(ACTS.map(a => a.to - a.from + 1), [10, 10, 10, 10, 10]);
assert.equal(ACTS[4].to, MAX_STAGE);
assert.ok(ACTS.every(a => a.name && a.ic) && new Set(ACTS.map(a => a.name)).size === 5);
assert.equal(actOf(1), 0); assert.equal(actOf(10), 0); assert.equal(actOf(11), 1); assert.equal(actOf(50), 4); assert.equal(actOf(99), 4); assert.equal(actOf(0), 0);
assert.equal(actDone(0, 14), 10); assert.equal(actDone(1, 14), 4); assert.equal(actDone(2, 14), 0);
// tap targets: the next stage inside its world, else the world's first, locked past the reach
assert.deepEqual(actTarget(1, 14, 18), { stage: 15 });
assert.deepEqual(actTarget(0, 14, 18), { stage: 1 });
assert.deepEqual(actTarget(2, 14, 18), { locked: true, need: 17 });
assert.deepEqual(actTarget(2, 17, 21), { stage: 21 }, 'reachable world opens on its first stage');
assert.equal(actTarget(9, 1, 5), null);
const strip = actStripHTML(14, 15, 50, isBossStage, 18);
assert.equal((strip.match(/<button /g) || []).length, 5);
assert.equal((strip.match(/<i class=/g) || []).length, 50, 'all fifty ticks inside the worlds');
assert.equal((strip.match(/ on"/g) || []).length, 1, 'one current world');
assert.equal((strip.match(/ lock"/g) || []).length, 3, 'three locked worlds');
assert.ok(strip.includes('4/10') && strip.includes('10/10') && strip.includes('Snack Bar'));
assert.ok(strip.includes('aria-label="Snack Bar, stages 11 to 20, 4 of 10 cleared"'));

// gap shortcut: the biggest power gain that is ready, nothing when there is no gap
assert.equal(gapFix(0, { Pets: 3 }), null);
assert.equal(gapFix(100, {}), null);
assert.equal(gapFix(100, null), null);
assert.deepEqual(gapFix(500, { Stats: 2, Skills: 1, Gear: 4 }), { tab: 'Stats', n: 2, gain: 120 });
assert.deepEqual(gapFix(500, new Map([['Pets', 1], ['Stats', 3]])), { tab: 'Pets', n: 1, gain: 80 });
assert.deepEqual(gapFix(500, { Gear: 1 }), { tab: 'Gear', n: 1, gain: GAIN.Gear });
assert.ok(gapFixHTML({ tab: 'Pets', n: 1, gain: 80 }, 30).includes('up to +30 PWR'), 'never promises more than the gap');
assert.ok(gapFixHTML({ tab: 'Pets', n: 2, gain: 160 }, 900).includes('up to +160 PWR'));
assert.equal(gapFixHTML(null, 5), '');

// side chips: numbers for counted claims, "!" for plain alerts
assert.equal(alertLabel(true), '!'); assert.equal(alertLabel(3), '3'); assert.equal(alertLabel(12), '9+');
assert.ok(!hasAlert(false) && !hasAlert(0) && hasAlert(1) && hasAlert(true));

// overview sheet: every stage, locked past the reach, crowns on bosses
const save = { cleared: 14, hardCleared: 2, stars: { 1: 3, 2: 2 } };
const ov = overviewHTML(save, 50, isBossStage, stageKind, 18, 15);
assert.equal((ov.match(/class="ovc/g) || []).length, 50);
assert.equal((ov.match(/ovc[^"]* lock/g) || []).length, 32, 'stages past the reach are locked');
assert.equal((ov.match(/ovc[^"]* sel/g) || []).length, 1);
assert.equal((ov.match(/ovc[^"]* nxt/g) || []).length, 1);
assert.equal((ov.match(/class="ovh"/g) || []).length, 12, 'cleared stages whose first Hard clear is open');
assert.equal((ov.match(/disabled/g) || []).length, 32);
assert.ok(ov.includes('5/30') && ov.includes('Warm-Up') && ov.includes('Encore'));
assert.ok(ov.includes('data-n="50"') && ov.includes('Stage 50, boss'));

// wiring and css
assert.ok(main.includes('actStripHTML(save.cleared') && main.includes('gapFix(gap, badgeCounts())') && main.includes("$('stOverview').onclick") && main.includes('actTarget('), 'main wired');
assert.ok(hub2.includes("from './battle_b11.js'") && hub2.includes('alertLabel(alert)') && hub2.includes('FUND.filter(f => fundReady(s, f)).length'), 'hub2 wired');
assert.ok(html.includes('id="gapFix"') && html.includes('id="stOverview"') && html.includes('@css:33-battle-b11') && html.includes('.wact.on') && html.includes('.ovc.nxt'), 'markup and css');
assert.ok(!ui.includes('—') && !main.includes('—') && !html.includes('—') && !hub2.includes('—'), 'no em dash');
