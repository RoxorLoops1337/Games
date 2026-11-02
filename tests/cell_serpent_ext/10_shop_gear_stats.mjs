// Shop, Gear and Stats polish: the icon module loads headless and the CSS block and markup hooks exist.
import fs from 'node:fs';
import assert from 'node:assert';
const { ICON_NAMES, iconURL, ico } = await import('../../cell_serpent/icons.js');
assert.ok(ICON_NAMES.includes('chestLid') && ICON_NAMES.includes('star'));
assert.strictEqual(iconURL('star'), '');           // no document in node: empty, never throws
assert.strictEqual(ico('star'), '');
const html = fs.readFileSync(new URL('../../cell_serpent/index.html', import.meta.url), 'utf8');
assert.ok(html.includes('/* @css:10-shop-gear-stats */') && html.includes('/* end @css:10-shop-gear-stats */'));
assert.ok(html.includes('class="stage"'));
const hub = fs.readFileSync(new URL('../../cell_serpent/hub2.js', import.meta.url), 'utf8');
assert.ok(!hub.includes('—') && !html.includes('—'));
console.log('ok 10_shop_gear_stats');
