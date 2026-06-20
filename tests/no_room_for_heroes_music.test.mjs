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
t.ok(v.length === 240, `library complete: ${v.length} tracks (15 hand-written + 200 generated + 25 C-part bridges)`);
const bad = v.filter(x => !x.ok);
t.ok(bad.length === 0, 'all channels agree on loop length' + (bad.length ? ' — BAD: ' + bad.map(b => b.name).join(', ') : ''));

// the 5-per-theme C-part bridges all spliced on cleanly (5 in-game themes × 5)
const names = new Set(v.map(x => x.name));
const cParts = v.filter(x => / — .+/.test(x.name) && x.name.match(/Buried Cathedral|Hammers of the Hall|Throneblood|Thrash the Throne|Goomba Stomp Groove/));
t.ok(cParts.length === 25, `25 C-part variants present (got ${cParts.length})`);
t.ok(names.has('Throneblood — Blade Stabs') && names.has('The Buried Cathedral — Hollow Breakdown')
  && names.has('Goomba Stomp Groove — Warp Gallop'), 'spot-check: themed C-part bridges are in the list');

// the genre spread the songbook promises actually exists
const tags = new Set(v.map(x => x.name));
t.ok(tags.has('Junglist Throne') && tags.has('Crown of the Wild') && tags.has('Clockwork Waltz')
  && tags.has('Gateway 138') && tags.has('Goblin\'s Jig') && tags.has('Lo-Fi Lich'),
  'spot-check: dnb, long adventure, 3/4 waltz, 32-bar trance, 6/8 jig and boom bap present');

// long-form pieces really are longer (16/32 bars vs the 8-bar default)
const lens = v.map(x => x.lead);
t.ok(lens.some(L => L === 256) && lens.some(L => L === 512), 'library includes 16-bar and 32-bar songs');
t.done();
