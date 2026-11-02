// Round 3 UI motion: compact currency numbers, directional tab slide, drawn close button.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fmtCur } from '../../cell_serpent/motion.js';

assert.equal(fmtCur(0), '0');
assert.equal(fmtCur(9999), '9999');
assert.equal(fmtCur(10000), '10k');
assert.equal(fmtCur(12345), '12.3k');
assert.equal(fmtCur(123456), '123k');
assert.equal(fmtCur(999999), '999k', 'never rounds up into the next unit');
assert.equal(fmtCur(1234607), '1.23M');
assert.equal(fmtCur(25000000), '25M');
assert.equal(fmtCur(3200000000), '3.2B');
for (const v of [10000, 15000, 99999, 100000, 1e6, 1.5e6, 9.99e8]) assert.ok(fmtCur(v).length <= 5, 'short: ' + fmtCur(v));

const html = fs.readFileSync(new URL('../../cell_serpent/index.html', import.meta.url), 'utf8');
const css = html.match(/\/\* @css:19-transitions \*\/([\s\S]*?)\/\* end @css:19-transitions \*\//)[1];
assert.ok(/translateX\(var\(--tdx/.test(css), 'tab slide uses the direction variable');
assert.ok(/\.dsx::before/.test(css), 'close button X is drawn in CSS');
assert.ok(!css.includes('—'));
const main = fs.readFileSync(new URL('../../cell_serpent/main.js', import.meta.url), 'utf8');
assert.ok(main.includes('motion.tabDir('), 'renderHub feeds the tab direction');
