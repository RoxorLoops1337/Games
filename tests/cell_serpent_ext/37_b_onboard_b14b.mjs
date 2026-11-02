// 37 b: onboarding polish (batch 14): stat teaser, locked tab wording, welcome chest pacing, wiring.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = f => fs.readFileSync(path.join(ROOT, 'cell_serpent', f), 'utf8');
const html = read('index.html'), dash = String.fromCharCode(8212);
const O = await import(path.join(ROOT, 'cell_serpent', 'onboard_b14b.js'));
const sim = await import(path.join(ROOT, 'cell_serpent', 'sim.js'));

// css block placement, no em dash
const a = html.indexOf('@css:37-b-onboard'), z = html.indexOf('end @css:37-b-onboard');
assert.ok(a > 0 && z > a && z < html.indexOf('/* @css:34-phone-hub */'), 'css block before the phone block');
assert.ok(!html.slice(a, z).includes(dash) && !read('onboard_b14b.js').includes(dash));
assert.ok(/statTeaserEl/.test(read('hub2.js')) && /glowB14/.test(read('unlock_ui_b12p.js')) && /lockedLabel/.test(read('unlock_ui_b12p.js')), 'wired');

// locked tab wording
assert.equal(O.lockedLabel(3, true), 'Clear stage 3'); assert.equal(O.lockedLabel(3, false), 'Stage 3');

// stat teaser: only when a stat is held back by the cap
{
  const s = sim.defaultSave(); assert.equal(O.statTeaser(s), null, 'fresh: nothing owned, nothing held back');
  s.cleared = 2; s.meta = { atk: sim.statCap(s) };   // cap 3, Volume at 3
  const t = O.statTeaser(s); assert.ok(t, 'a stat at the cap shows the teaser');
  assert.equal(t.stage, sim.statCapStage(sim.statCap(s) + 1)); assert.ok(t.stage > s.cleared, 'the stage is still ahead');
  assert.ok(/stage \d+/.test(t.text));
  s.cleared = t.stage; const t2 = O.statTeaser(s); assert.ok(!t2 || t2.stage > t.stage, 'after the stage the cap rose, next target is later or none');
  const m = sim.defaultSave(); m.cleared = 40; m.meta = Object.fromEntries(sim.META.map(d => [d.id, d.max])); assert.equal(O.statTeaser(m), null, 'everything maxed: no teaser');
}

// the Welcome Chest (3000 Beats at stage 5) cannot buy past the stat cap, and does not cover all of it either
{
  const s = sim.defaultSave(); s.cleared = 5;
  const w = O.welcomeBudget(s, 3000);
  assert.equal(w.cap, 4);
  assert.ok(w.cover > 0.4 && w.cover < 1.0, 'the chest covers part of the capped stat shop, not all of it: ' + w.cover.toFixed(2));
}
console.log('37_b_onboard_b14b: ok');
