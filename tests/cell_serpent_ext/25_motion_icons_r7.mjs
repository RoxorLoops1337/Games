// Round 7 (agent 19): sliding tab fill, press sweep, shared button glyphs, empty state.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const css = html.slice(html.indexOf('/* @css:19-buttons round 7 */'), html.indexOf('/* end @css:19-buttons round 7 b */'));
assert.ok(css.length > 500, 'round 7 css block exists');
assert.ok(css.includes('.tabs button.on{background:none}'), 'the per-button tab fill is gone (the sliding panel replaces it)');
assert.ok(/chip:active::after/.test(css) && /arrow:active::after/.test(css), 'chips and arrows have a press sweep');
assert.ok(!css.includes('—'), 'no em dash');
const src = readFileSync(join(root, 'btn_glyphs.js'), 'utf8');
assert.ok(!src.includes('—'), 'no em dash in glyphs');
const { GLYPH, RECAP } = await import(join(root, 'btn_glyphs.js'));
for (const k of ['stats', 'gear', 'pause']) assert.ok(GLYPH[k].startsWith('<svg') && GLYPH[k].includes('currentColor'), 'glyph ' + k);
for (const k of ['flag', 'clock', 'target']) assert.ok(RECAP[k].startsWith('<svg'), 'recap ' + k);
