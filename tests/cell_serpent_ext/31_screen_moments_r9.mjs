// 05 screen moments round 9: resume count-in follows the real beat, hub preview sting per species, clear card facts, species milestone ribbon
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const rd = f => readFileSync(join(root, f), 'utf8');
const { createScreenFx } = await import(join(root, 'screenfx.js'));
const noop = () => {};
const grad = () => ({ addColorStop: noop });
const mk = beat => {
  const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : /Gradient/.test(String(k)) ? grad : k === "measureText" ? () => ({ width: 100 }) : noop), set: (t, k, v) => { t[k] = v; return true; } });
  const S = { t: 0, trauma: 0, flash: 0 };
  const fx = createScreenFx({ ctx, W: 1080, H: 2340, kit: { SPECIES: { love: { lite: '#ff99cc' } } }, art: null, text: noop, glow: noop, S, OPT: {}, ring: noop, burst: noop });
  fx.setBeat(() => beat);
  return fx;
};
const g = { p: { x: 540, y: 2000 }, snakes: [], phase: 'play', groove: 0, stage: 5, progress: 0.5, skin: 'love', t: 83, faceMax: 0.624 };

// 1) the resume count-in ticks at the tempo of the song and starts on the next kick
{
  const fx = mk({ bpm: 100, phase: 0.5 }); fx.resumeFx(g);
  const o = fx.state.go;
  assert.ok(o && o.res && o.cnt, 'resume count-in exists');
  assert.ok(Math.abs(o.p - 0.5) < 1e-9, 'one number per beat at 100 bpm (clamped to 0.5 s): ' + o.p);
  assert.ok(Math.abs(o.w - 0.3) < 1e-9, 'waits for the next kick: ' + o.w);
  assert.ok(Math.abs(o.ready - (o.w + 3 * o.p)) < 1e-9 && fx.timeScale() === 0, 'the sim holds until the third beat');
  const fast = mk({ bpm: 200, phase: 0 }); fast.resumeFx(g);
  assert.ok(fast.state.go.p >= 0.27 && fast.state.go.p <= 0.3, 'fast songs do not tick faster than 0.27 s');
  const none = mk(null); none.resumeFx(g);
  assert.ok(Math.abs(none.state.go.p - 0.27) < 1e-9 && none.state.go.w === 0, 'no music: the old 0.27 s count');
  for (let i = 0; i < 300; i++) fx.update(0.016, g);
  assert.ok(!fx.state.go || !fx.state.go.res || fx.state.go.t >= fx.state.go.ready, 'the count-in ends');
  assert.deepEqual(fx.takeSounds().filter(s => s.startsWith('resumetick')), ['resumetick3', 'resumetick2', 'resumetick1']);
}

// 2) clear card remembers the song length and the closest the serpent got
{
  const fx = mk(null); fx.onEvent({ t: 'stage', n: 5, boss: false, name: 'x' }, g); fx.onEvent({ t: 'won' }, g);
  const c = fx.state.clear; assert.ok(c, 'clear card');
  assert.equal(c.secs, 83); assert.equal(c.close, 62);
  fx.drawCard(g);
  for (let i = 0; i < 200; i++) { fx.update(0.016, g); fx.drawCard(g); }
}

// 3) milestone ribbon wears the species colour
{
  const fx = mk(null); fx.onEvent({ t: 'stage', n: 5, boss: false, name: 'x' }, g); fx.onEvent({ t: 'checkpoint', k: 2 }, g);
  assert.equal(fx.state.mile.col, '#ff99cc'); fx.drawCard(g);
}

// 4) the hub preview sting: a new species or boss on the preview plays its own short voice, no riser
{
  const main = rd('main.js'), aud = rd('audio.js');
  assert.ok(main.includes("audio.play('stageprev', { skin: info.skin, boss: info.boss })") && main.includes('sk !== pvSting'), 'hub preview wired, only on a new species');
  assert.ok(aud.includes('sfx.stageprev = e =>') && aud.includes("stageVoice(e && e.skin, !!(e && e.boss))"), 'sound registered');
  const { STAGE_VOICE, BOSS_VOICE } = await import(join(root, 'audio_stage.js'));
  for (const sk of Object.keys(STAGE_VOICE)) { const v = STAGE_VOICE[sk]; const base = Math.min(...v.n.map(m => m[5]), ...(v.z || []).map(m => m[5])); assert.ok(base < 1, sk + ' preview starts at once'); }
  for (const sk of Object.keys(BOSS_VOICE)) assert.ok(BOSS_VOICE[sk].n.length, sk);
}
console.log('31_screen_moments_r9 ok');
