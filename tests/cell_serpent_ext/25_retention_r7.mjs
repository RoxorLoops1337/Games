// Round 7 retention polish: the Today rhythm strip is pure and kind, the Goals panel fills the screen above CLOSE.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const sim = await import(join(root, 'sim.js'));
globalThis.Element = globalThis.Element || { prototype: {} };
const gp = await import(join(root, 'goals_polish.js'));

const day = 20000, s = sim.defaultSave();
let t = gp.todayRhythm(s, day);
assert.equal(t.items.length, 4);
assert.ok(t.done >= 0 && t.done <= 4);
assert.ok(!t.line.includes(String.fromCharCode(0x2014)), "no em dash");
s.sign.day = day; s.addict.spin.day = day;
const t2 = gp.todayRhythm(s, day);
assert.ok(t2.items.find(i => i.id === 'sign').done, 'signed in today counts');
assert.ok(t2.done > t.done || t.items.find(i => i.id === 'sign').done, 'progress is counted');
const html = gp.todayHTML(s, day);
assert.ok(html.includes('class="tdy') && html.includes('Gigs'), 'strip markup');
// an old save without any of the optional fields still renders
const old = sim.sanitizeSave({ v: 8, beats: 10 });
assert.doesNotThrow(() => gp.todayHTML(old, day));
// flyChips never throws without a DOM and respects reduced motion
assert.equal(gp.flyChips([], false), 0);
assert.equal(gp.flyChips([{}], true), 0);

const html5 = readFileSync(join(root, 'index.html'), 'utf8');
assert.ok(html5.includes('@css:16-addiction round 7') && html5.includes('end @css:16-addiction round 7'), 'css marker pair');
assert.ok(/#panel \.panelbody\{max-height:calc\(100dvh/.test(html5), 'panel body is sized from the viewport so SPIN is not cut off');
const ui = readFileSync(join(root, 'addict_ui.js'), 'utf8');
assert.ok(ui.includes('cbIdle') && ui.includes('flyChips') && ui.includes('todayHTML'), 'wired into the panel');
console.log('25_retention_r7 ok');
