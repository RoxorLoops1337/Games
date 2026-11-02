// 05 screen feel round 7: species card poses, wipeout bridge chip, resume fx, count-in flash, panic face
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const rd = f => readFileSync(join(root, f), 'utf8');
const { cardPose, cardFlair } = await import(join(root, 'card_flair.js'));
const SK = ['love', 'rust', 'sneezy', 'grumpy', 'sleepy', 'disco', 'sour', 'mighty', 'frosty', 'piggy', 'gloomy'];
const calls = [];
const ctx = new Proxy({}, { get: (_, k) => (...a) => { calls.push(k); }, set: () => true });
for (const sk of SK) {
  for (const t of [0, 0.3, 0.6, 1.0, 1.7, 2.2]) {
    const p = cardPose(sk, t);
    for (const k of ['dx', 'dy', 'rot', 'sx', 'sy']) assert.ok(Number.isFinite(p[k]), `${sk} ${k} finite at ${t}`);
    assert.ok(p.sx > 0.5 && p.sy > 0.5 && Math.abs(p.dy) < 200, `${sk} pose stays on the band at ${t}`);
    cardFlair(ctx, sk, t, 132, 290, 70, '#fff');
  }
  const settled = cardPose(sk, 2.2);
  assert.ok(Math.abs(settled.dy) < 25 && Math.abs(settled.dx) < 8, `${sk} settles near the rest spot`);
}
assert.ok(calls.length > 100, 'flairs draw something');
const fx = rd('screenfx.js'), main = rd('main.js'), html = rd('index.html'), art = rd('art_draw.js'), rend = rd('render.js');
assert.ok(fx.includes('cardPose(c.skin, t)') && fx.includes('resumeFx'), 'card pose and resume fx are wired');
assert.ok(fx.includes('S.flash = Math.max(S.flash, 0.14 + i * 0.05)'), 'count-in ticks flash the screen');
assert.ok(main.includes("$('rvWipe')") && html.includes('id="rvWipe"'), 'revive card carries the wipeout chip');
assert.ok(main.includes('R.resumeFx(g)'), 'resume calls the fx');
assert.ok(art.includes('o.panic > 0') && rend.includes('panic:'), 'panic face is wired');
assert.ok(!/—/.test(rd('card_flair.js') + fx + html), 'no em dash');
