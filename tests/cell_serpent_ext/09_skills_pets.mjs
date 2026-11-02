// Skills and Pets tab design: static checks on markup hooks and CSS.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const main = fs.readFileSync(new URL('../../cell_serpent/main.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../../cell_serpent/index.html', import.meta.url), 'utf8');
const css = html.slice(html.indexOf('/* @css:09-skills-pets */'), html.indexOf('/* end @css:09-skills-pets */'));
assert.ok(css.length > 500, 'css block present');
for (const sel of ['.tile.ready', '.eggstage', '.tile .lk', '.slot .slv', '#bLoot.reveal']) assert.ok(css.includes(sel), 'css has ' + sel);
for (const hook of ['UPGRADE READY', 'eggstage', "'coll", 'class="star', 'slv']) assert.ok(main.includes(hook), 'main has ' + hook);
assert.ok(!/—/.test(css + main), 'no em dash');
console.log('09 skills/pets ok');
