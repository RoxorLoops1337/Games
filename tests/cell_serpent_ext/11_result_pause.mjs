// Result, revive, pause and settings screens: markup and CSS hooks exist, no em dash.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const html = readFileSync(join(root, 'index.html'), 'utf8'), main = readFileSync(join(root, 'main.js'), 'utf8'), fx = readFileSync(join(root, 'result_fx.js'), 'utf8');
for (const id of ['rRibbon', 'rLevel', 'rLbar', 'rvArc', 'rvSec', 'rStars', 'rNext', 'rRetry', 'rHub']) assert(html.includes('id="' + id + '"'), id);
assert(html.includes('@css:11-result-pause') && html.includes('end @css:11-result-pause'));
assert.ok((html.match(/class="tgl"/g) || []).length >= 6);
for (const f of ['revealStars', 'countUp', 'levelBar', 'reviveRing']) { assert(fx.includes('export function ' + f)); assert(main.includes(f)); }
assert(!/—/.test(html + main + fx));
// round 2: star sounds, confetti, heartbeat, gentle revive, loss hint
{
  const au = readFileSync(join(root, 'audio.js'), 'utf8');
  assert(main.includes("audio.play('star' + (i + 1))") && main.includes('confetti(') && au.includes('sfx.heartbeat'));
  assert(fx.includes('holdEls') && fx.includes('onBeat') && html.includes('id="rvTimer"') && html.includes('id="rHint"'));
  const { lossHint } = await import('../../cell_serpent/result_fx.js');
  const names = { daggers: 'Chick Circle', swab: 'Kitty Paws' };
  assert.equal(lossHint({ won: false, progress: 0.8 }, ['swab'], names), 'The snake got past at 80%: try the Chick Circle');
  assert.equal(lossHint({ won: true }, [], names), '');
  assert.equal(lossHint({ won: false, progress: 0.1 }, [], names), 'Grab the yellow upgrade cells early');
}
