// 05 screen feel round 8: per-species stage sounds, boss stings, resume count-in with a frozen sim, pets answer, level-up entrance
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const rd = f => readFileSync(join(root, f), 'utf8');
const { STAGE_VOICE, BOSS_VOICE, stageVoice } = await import(join(root, 'audio_stage.js'));
const { SKINS } = await import(join(root, 'sim.js'));
for (const sk of [...SKINS, 'piggy']) {
  const v = STAGE_VOICE[sk]; assert.ok(v && v.n.length >= 2, 'stage voice for ' + sk);
  for (const n of v.n) assert.ok(n.length === 6 && n[0] > 0 && n[1] > 0 && n[3] > 0 && n[3] <= 0.14, 'note shape ' + sk);
  if (sk !== 'piggy') { assert.ok(BOSS_VOICE[sk], 'boss sting for ' + sk); assert.equal(stageVoice(sk, true), BOSS_VOICE[sk]); }
  assert.equal(stageVoice(sk, false), v);
}
assert.equal(stageVoice('nope', false), null);
const sigs = new Set(SKINS.map(k => JSON.stringify(STAGE_VOICE[k].n)));
assert.equal(sigs.size, SKINS.length, 'every species sounds different');
const aud = rd('audio.js'), fx = rd('screenfx.js'), main = rd('main.js'), r = rd('render.js'), html = rd('index.html');
assert.ok(aud.includes('stageVoice(e.skin, e.boss)') && aud.includes('sfx.resumetick3'), 'audio wired');
assert.ok(rd('sim.js').includes("t: 'stage', n, boss: isBossStage(n), skin: g.skin"), 'stage event carries the species');
assert.ok(fx.includes('F.go.res && F.go.t < F.go.ready') && fx.includes("'resumetick' + (3 - i)") && fx.includes('BOSS_TAG') && fx.includes('cardFlair(ctx, c.skin, t, 0, -116'), 'count-in hold, tick sounds, boss flair');
assert.ok(r.includes('S.petWake') && main.includes('petsCall()'), 'pets answer the resume');
assert.ok(html.includes('@keyframes lvBan') && html.includes('#levelup::before'), 'level-up entrance css');
console.log('05_screen_feel_r8 ok');
