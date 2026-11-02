// Batch 10 Battle tab: Hard power gap hint, world progress strip, portrait spring.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { powerGap, powerHTML, bestTag, worldStrip, portraitSpring } from '../../cell_serpent/battle_ui.js';
const rd = f => fs.readFileSync(new URL('../../cell_serpent/' + f, import.meta.url), 'utf8');
const main = rd('main.js'), html = rd('index.html'), ui = rd('battle_ui.js');

// power gap
assert.deepEqual(powerGap(445, 900), { low: true, gap: 455, pct: 49 });
assert.deepEqual(powerGap(900, 900), { low: false, gap: 0, pct: 100 });
assert.deepEqual(powerGap(5000, 900), { low: false, gap: 0, pct: 100 }, 'meter never overflows');
assert.ok(Number.isFinite(powerGap(0, 0).pct) && Number.isFinite(powerGap(5, 0).pct), 'no divide by zero');
const ph = powerHTML(445, 900, true);
assert.ok(ph.includes('+455 to go') && ph.includes('hardrec') && ph.includes('low') && ph.includes('width:49%'));
assert.ok(powerHTML(950, 900, false).includes('ready') && !powerHTML(950, 900, false).includes('low'));
// best flag tags only on Hard
assert.equal(bestTag(false, 300), '');
assert.ok(bestTag(true, 0).includes('HARD') && !bestTag(true, 0).includes('PWR'));
assert.ok(bestTag(true, 300).includes('+300 PWR') && bestTag(true, 300).includes('gap'));

// world strip: one tick per stage, the right classes
const s = worldStrip(12, 5, 50, n => n % 5 === 0);
assert.equal((s.match(/<i /g) || []).length, 50);
assert.equal((s.match(/class="d/g) || []).length, 12, 'cleared');
assert.equal((s.match(/class="x/g) || []).length, 1, 'the next stage');
assert.equal((s.match(/class="l/g) || []).length, 37, 'locked');
assert.equal((s.match(/ b/g) || []).length, 10, 'ten boss ticks');
assert.equal((s.match(/ s"/g) || []).length, 1, 'selected');
assert.equal(worldStrip(0, 1, 3, () => false), '<i class="x s"></i><i class="l"></i><i class="l"></i>');

// portrait spring: starts small, overshoots no more than 12 percent, settles at exactly 1
assert.equal(portraitSpring(-1), 0.6); assert.equal(portraitSpring(0.6), 1); assert.equal(portraitSpring(9), 1);
let mx = 0, last = 0; for (let a = 0; a < 0.6; a += 0.01) { const v = portraitSpring(a); assert.ok(v > 0 && v < 1.12, 'bounded'); mx = Math.max(mx, v); last = v; }
assert.ok(mx > 1.0 && Math.abs(last - 1) < 0.03, 'a small overshoot, then rest');

// wiring and css
assert.ok(main.includes('powerHTML(mine, rp, hard)') && main.includes('bestTag(hard') && main.includes("worldStrip(save.cleared, sel, MAX_STAGE, isBossStage)") && main.includes('portraitSpring(t - pvT0)'), 'wired');
assert.ok(html.includes('id="wStrip"') && html.includes('.wstrip i.x') && html.includes('.rec .pneed') && html.includes('.pgh.gap') && html.includes('stprog:has(.pgh.gap)'), 'css and markup');
assert.ok(!ui.includes('—') && !main.includes('—') && !html.includes('—'), 'no em dash');
