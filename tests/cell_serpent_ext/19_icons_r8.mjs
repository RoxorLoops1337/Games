// Round 8 (agent 19): SVG settings icons, drawn empty states, button done and busy states.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SET_ICONS, emptyPic, EMPTY_PIC } from '../../cell_serpent/icons_b8.js';
import { emptyCardHTML } from '../../cell_serpent/empty_ux.js';

const html = fs.readFileSync(new URL('../../cell_serpent/index.html', import.meta.url), 'utf8');
const keys = [...html.matchAll(/class="tgl" data-k="(\w+)"/g)].map(m => m[1]);
assert.ok(keys.length >= 14, 'settings rows found');
for (const k of keys) { assert.ok(SET_ICONS[k], 'icon for ' + k); assert.ok(/^#[0-9a-f]{6}$/i.test(SET_ICONS[k][0]) && SET_ICONS[k][1].startsWith('<svg'), 'valid icon ' + k); }
assert.ok(SET_ICONS.volume, 'volume row icon');
for (const e of Object.keys(EMPTY_PIC)) assert.ok(emptyPic(e).includes('<svg'), 'empty picture ' + e);
assert.ok(!/[\u{1F300}-\u{1FAFF}]/u.test(emptyCardHTML('gear', 'Owned')), 'no emoji left in the empty state');
assert.ok(emptyCardHTML('pets', 'Owned').includes('em-svg'));
assert.ok(emptyCardHTML('gear', 'Upgrade').includes('Nothing to level'));

// button state helper with a tiny fake button
const { flashDone, setBusy } = await import('../../cell_serpent/btn_state.js');
const cls = new Set(), attrs = {};
const btn = { innerHTML: 'COPY CODE', offsetWidth: 120, style: {}, classList: { add: c => cls.add(c), remove: c => cls.delete(c), toggle: (c, on) => on ? cls.add(c) : cls.delete(c) }, setAttribute: (k, v) => { attrs[k] = v; }, removeAttribute: k => { delete attrs[k]; } };
assert.equal(flashDone(btn, 'COPIED', 20), true);
assert.ok(cls.has('done8') && btn.innerHTML.includes('COPIED'));
assert.equal(flashDone(btn, 'COPIED', 20), false, 'a second tap while done does nothing');
await new Promise(r => setTimeout(r, 60));
assert.ok(!cls.has('done8') && btn.innerHTML === 'COPY CODE' && btn.style.minWidth === '', 'restored');
setBusy(btn, true); assert.ok(cls.has('busy8') && btn.disabled && attrs['aria-busy'] === 'true');
setBusy(btn, false); assert.ok(!cls.has('busy8') && !btn.disabled && !attrs['aria-busy']);
assert.ok(/@css:19-buttons round 8/.test(html) && !/—/.test(html.slice(html.indexOf('@css:19-buttons round 8'), html.indexOf('end @css:19-buttons round 8'))), 'css block, no em dash');
