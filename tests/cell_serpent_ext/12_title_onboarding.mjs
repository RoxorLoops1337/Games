// Title screen and first-run guide: pure checks (no DOM). Each assert runs when the file is imported.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const sim = await import(join(root, 'sim.js'));
const { drawHints } = await import(join(root, 'hints.js'));
const { titleInfoHTML } = await import(join(root, 'title_fx.js'));

const noop = () => {};
const ctx = new Proxy({}, { get: () => noop, set: () => true });
let glows = 0, texts = 0;
const h = { glow: () => glows++, text: () => texts++ };

// a fresh account shows nothing on the title info line, a veteran shows best stage, stars and streak
assert.equal(titleInfoHTML({ runs: 0, best: 0, streak: { n: 0 } }, 0), '');
const info = titleInfoHTML({ runs: 5, best: 12, streak: { n: 3 } }, 8);
assert.ok(info.includes('Best stage 12') && info.includes('8') && info.includes('3 days'));
assert.ok(!titleInfoHTML({ runs: 5, best: 1, streak: { n: 0 } }, 1).includes('days'));

// the guide draws without throwing over a few seconds of a real run and stops nagging
const g = sim.createGame({ seed: 5, stage: 1 });
const S = { t: 0 };
for (let i = 0; i < 60 * 30; i++) { sim.step(g, 1 / 60, { x: 0 }); S.t += 1 / 60; drawHints(ctx, g, S, h); if (g.phase === 'levelup') sim.choose(g, 0); }
assert.ok(glows > 0, 'slide hint glow drawn at the start');
// once the player has moved a lot, the slide hint is learned and gone
const g2 = sim.createGame({ seed: 6, stage: 1 }); const S2 = { t: 0 };
drawHints(ctx, g2, S2, h);
for (let i = 0; i < 30; i++) { g2.p.x = 100 + (i % 2) * 300; S2.t += 0.05; drawHints(ctx, g2, S2, h); }
assert.equal(S2.hint.learned, true);

// the markup keeps the ids main.js needs and the css markers exist
const html = readFileSync(join(root, 'index.html'), 'utf8');
for (const id of ['playBtn', 'titleInfo', 'peeks']) assert.ok(html.includes(`id="${id}"`), id);
assert.ok(html.includes('/* @css:12-title-onboarding */') && html.includes('/* end @css:12-title-onboarding */'));
assert.ok(!/—/.test(readFileSync(join(root, 'hints.js'), 'utf8') + readFileSync(join(root, 'title_fx.js'), 'utf8')), 'no em dash');
// round 2: onboarding module (pure parts)
{
  const ob = await import(join(root, 'onboard12.js'));
  const audioSrc = readFileSync(join(root, 'audio.js'), 'utf8');
  for (const [pet, snd] of Object.entries(ob.ANIMAL_SOUND)) assert.ok(new RegExp('\\b' + snd + ':').test(audioSrc), 'audio has ' + snd + ' for ' + pet);
  assert.equal(Object.keys(ob.ANIMAL_SOUND).length, 6);
  const d = sim.createGame({ seed: 2, stage: 1, bot: true }); ob.richDemo(d);
  assert.ok(Object.keys(d.weap).length >= 6);
  for (let i = 0; i < 600; i++) { sim.step(d, 1 / 60, sim.botInput(d)); if (d.phase === 'levelup') sim.choose(d, 0); }
  assert.equal(ob.needsTutorial({ runs: 0 }), true); assert.equal(ob.needsTutorial({ runs: 3 }), false);
  assert.equal(ob.needsPetHint({ eggs: 1 }), true); assert.equal(ob.needsPetHint({ eggs: 0 }), false);
  const main = readFileSync(join(root, 'main.js'), 'utf8');
  for (const s of ['showTutorial', 'setupTapAnimals', 'petHint', 'richDemo']) assert.ok(main.includes(s), s);
  assert.ok(!/—/.test(readFileSync(join(root, 'onboard12.js'), 'utf8')), 'no em dash');
}
console.log('12_title_onboarding ok');
// round 3: title life + richer tutorial markup
{
  const ob = readFileSync(join(root, 'onboard12.js'), 'utf8');
  for (const w of ['setupTitleLife', 'playBurst', 'tcap', 'GO!']) assert.ok(ob.includes(w), w);
  assert.ok(html.includes('id="notes12"') && html.includes('drop12') && html.includes('pop12'));
  assert.ok(!/—/.test(ob), 'no em dash in onboard12');
}
// round 4: tutorial with real art, goal line, short-phone title
{
  const ob4 = await import(join(root, 'onboard12.js'));
  assert.equal(ob4.tutorialArt(null, null), null, 'no kit: emoji fallback');
  const hintsSrc = readFileSync(join(root, 'hints.js'), 'utf8');
  assert.ok(hintsSrc.includes('CLEAR THE CHAIN') && hintsSrc.includes('CELLS LEFT'), 'first-run goal line');
  assert.ok(readFileSync(join(root, 'main.js'), 'utf8').includes('showTutorial(() => startRun(1), audio, kit, art)'));
  assert.ok(html.includes('tyelimg') && html.includes('slidedu12') && html.includes('peeks img:nth-child(5)'));
  for (const stage of [1, 2]) {
    const gg = sim.createGame({ seed: 9, stage }), SS = { t: 0 }; let goal = 0;
    for (let i = 0; i < 60 * 4; i++) { sim.step(gg, 1 / 60, { x: 0 }); SS.t += 1 / 60; drawHints(ctx, gg, SS, { glow: noop, text: s => { if (s === 'CLEAR THE CHAIN') goal++; } }); if (gg.phase === 'levelup') sim.choose(gg, 0); }
    assert.equal(goal > 0, stage === 1, 'goal line only on stage 1, stage ' + stage);
  }
}
// round 5: title snake, tutorial shot art, first-pop celebration
{
  const o5 = await import(join(root, 'onboard5.js'));
  const src5 = readFileSync(join(root, 'onboard5.js'), 'utf8'), main5 = readFileSync(join(root, 'main.js'), 'utf8');
  assert.equal(o5.setupTitleSnake(null, null), null, 'no host: no snake');
  assert.equal(o5.tutorialShotArt(null), null, 'no kit: no shot art');
  assert.equal(o5.tutorialShotHTML(null), '', 'no art: the old css shot is used');
  assert.ok(o5.tutorialShotHTML({ shot: 'a', crit: 'b', spark: 'c' }).includes('tpop'), 'pop sticker markup');
  assert.equal(o5.needsFirstPop({ runs: 0 }), true); assert.equal(o5.needsFirstPop({ runs: 1 }), false, 'only brand new accounts');
  assert.ok(main5.includes("setupTitleSnake($('title'), kit)") && main5.includes('firstPop(audio, buzz)'), 'wired in main');
  assert.ok(html.includes('.snake5') && html.includes('note5') && html.includes('fpcard5'), 'css present');
  assert.ok(!/—/.test(src5), 'no em dash in onboard5');
}
