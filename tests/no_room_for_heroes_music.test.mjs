// Music player: every track (hand-written + the generated songbook) must have
// all four channels agreeing on loop length, and the library must be complete.
//
//   node tests/no_room_for_heroes_music.test.mjs   (or: npm run test:boss)
import { readFileSync } from 'node:fs';
import { harness } from './no_room_for_heroes_lib.mjs';

const t = harness('music library');
const html = readFileSync(new URL('../no_room_for_heroes/music.html', import.meta.url), 'utf8');
const code = html.match(/<script>([\s\S]*)<\/script>/)[1];

const el = () => ({ innerHTML: '', textContent: '', value: '', checked: false, style: {},
  addEventListener: () => {}, clientWidth: 300,
  getContext: () => ({ clearRect() {}, fillRect() {} }) });
global.document = { getElementById: () => el(), addEventListener: () => {} };
global.window = {};
global.requestAnimationFrame = () => {};
global.devicePixelRatio = 1;

eval(code);   // compose() self-checks every generated track at load (throws on drift)

const v = global.window.validateTracks();
t.ok(v.length === 115, `library complete: ${v.length} tracks (15 hand-written + 100 generated)`);
const bad = v.filter(x => !x.ok);
t.ok(bad.length === 0, 'all channels agree on loop length' + (bad.length ? ' — BAD: ' + bad.map(b => b.name).join(', ') : ''));

// the genre spread the songbook promises actually exists
const tags = new Set(v.map(x => x.name));
t.ok(tags.has('Junglist Throne') && tags.has('Crown of the Wild') && tags.has('Clockwork Waltz'),
  'spot-check: dnb, long adventure and 3/4 waltz tracks present');

// long-form pieces really are longer (16/32 bars vs the 8-bar default)
const lens = v.map(x => x.lead);
t.ok(lens.some(L => L === 256) && lens.some(L => L === 512), 'library includes 16-bar and 32-bar songs');
t.done();
