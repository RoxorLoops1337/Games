// Batch 6 title and onboarding: first goal chip, welcome back text, step 3 face burst markup.
import assert from 'node:assert/strict';
import { firstGoalHTML, welcomeBack, welcomeHTML, awayText, faceBurstHTML } from '../../cell_serpent/title12b.js';
assert.ok(firstGoalHTML({ runs: 0 }).includes('goal12'));
assert.equal(firstGoalHTML({ runs: 3 }), '');
assert.equal(welcomeBack({ runs: 0 }, 0, 50), null);
const w = welcomeBack({ runs: 5, cleared: 14, eggs: 2, streak: { n: 3 } }, 0, 30);
assert.equal(w.head, 'Welcome back!'); assert.ok(w.sub.includes('Stage 15') && w.sub.includes('1 day away')); assert.equal(w.bits.length, 2);
assert.equal(welcomeBack({ runs: 5, cleared: 60, eggs: 0, streak: { n: 0 } }, 0, 0).head, 'Ready for more?');
assert.ok(welcomeBack({ runs: 5, cleared: 60, eggs: 0, streak: { n: 0 } }, 0, 0).sub.includes('Stage 50'));
assert.equal(awayText(1), ''); assert.equal(awayText(5), '5h away'); assert.equal(awayText(80), '3 days away');
assert.ok(welcomeHTML(w).includes('wb12-t')); assert.equal(welcomeHTML(null), '');
assert.equal(faceBurstHTML(null), ''); assert.equal((faceBurstHTML({ spark: 'x' }).match(/class="fspk/g) || []).length, 8);
assert.ok(!/—/.test(JSON.stringify([w, faceBurstHTML({ spark: 'x' })])));
console.log('24_title_r6 ok');
