// Headless suite for drop_the_bass/js/art_world.js: every function and id runs against a mock 2D context without throwing,
// save/restore stay balanced, drawing is deterministic (same t gives the same call log), and nothing reads Math.random or Date.
import assert from 'node:assert/strict';
import * as A from '../drop_the_bass/js/art_world.js';
import { MAPS, WORLDS } from '../drop_the_bass/js/data_core.js';

function mockCtx() {
  const log = []; let depth = 0, maxDepth = 0, minDepth = 0;
  const grad = { addColorStop() {} };
  const state = {};
  const ctx = new Proxy(state, {
    get(target, prop) {
      if (prop === '__log') return log; if (prop === '__depth') return depth; if (prop === '__min') return minDepth;
      if (prop === 'save') return () => { depth++; maxDepth = Math.max(maxDepth, depth); log.push('save'); };
      if (prop === 'restore') return () => { depth--; minDepth = Math.min(minDepth, depth); log.push('restore'); };
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient' || prop === 'createPattern') return () => grad;
      if (prop === 'measureText') return (s) => ({ width: String(s).length * 40 });
      if (prop in target) return target[prop];
      return (...a) => { log.push(String(prop) + ':' + a.map((v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : typeof v)).join(',')); };
    },
    set(target, prop, v) { target[prop] = v; return true; },
  });
  return ctx;
}
const realRandom = Math.random, realNow = Date.now;
let forbidden = 0;
Math.random = () => { forbidden++; return 0.5; };
Date.now = () => { forbidden++; return 0; };

function run(name, fn) {
  const c = mockCtx();
  fn(c);
  assert.equal(c.__depth, 0, name + ': save/restore unbalanced (' + c.__depth + ')');
  assert.ok(c.__min >= 0, name + ': restore without save');
  return c.__log.join('|');
}
function det(name, fn) {
  const a = run(name, fn), b = run(name, fn);
  assert.equal(a, b, name + ': not deterministic');
  assert.ok(a.length > 20, name + ': drew nothing');
}

const poses = ['idle', 'cheer', 'sing', 'beat', 'sad', 'shock', 'talk', 'point', 'hype', 'nonsense'];
for (const who of ['roxor', 'jasmin']) for (const outfit of ['default', 'onesie']) for (const pose of poses) for (const talk of [false, true]) {
  det('hero ' + who + outfit + pose, (c) => { A.drawHero(c, who, 100, 300, 200, { t: 1.7, pose, outfit, talk, flip: talk }); A.drawBust(c, who, 100, 100, 90, { t: 2.2, pose, outfit, talk }); });
}
det('hero default opts', (c) => { A.drawHero(c, 'roxor', 10, 10, 50); A.drawBust(c, 'jasmin', 10, 10, 50); });
for (const mood of ['happy', 'worried', 'excited', 'sleepy']) for (const talk of [false, true]) det('loopy ' + mood, (c) => A.drawLoopy(c, 50, 50, 100, { t: 3.1, mood, talk }));
det('loopy default', (c) => A.drawLoopy(c, 50, 50, 100));
det('logo', (c) => { A.drawLogo(c, 270, 190, 440, 0.3); A.drawLogo(c, 270, 190, 300, 7.9); });

const sizes = [[540, 960], [1280, 720], [390, 800], [1920, 1080]];
for (const id of ['title', 'hub', 'garage', 'busk', 'club', 'festival', 'arena', 'unknown']) for (const [w, h] of sizes) {
  det('backdrop ' + id + w, (c) => A.drawBackdrop(c, id, w, h, 4.2, { beat: 0.6, staticAmt: 0.5 }));
}
det('backdrop no opts', (c) => A.drawBackdrop(c, 'club', 540, 960, 0));
det('backdrop static full', (c) => A.drawBackdrop(c, 'garage', 540, 960, 2, { staticAmt: 1 }));

for (const w of WORLDS) {
  det('board ' + w.id, (c) => A.drawBoard(c, w.map, w.id, 3.3, { beat: 0.5, slotHint: [[0, 0], [1, 1]], hoverSlot: [2, 2], dropSlot: [3, 3] }));
  det('board plain ' + w.id, (c) => A.drawBoard(c, w.map, w.id, 0));
  for (const hp of [1, 0.5, 0.1, 0]) for (const hit of [0, 0.8]) det('stage ' + w.id, (c) => A.drawStageBase(c, w.id, 300, 400, { t: 2.1, hp, hit, beat: 0.4 }));
}
for (const m of Object.keys(MAPS)) det('board map ' + m, (c) => A.drawBoard(c, m, 'club', 1));
det('stage default', (c) => A.drawStageBase(c, 'arena', 10, 10));

const SCENES = ['garage_day', 'static_arrives', 'silent_town', 'build', 'van_night', 'boss_reveal',
  'world_garage', 'world_busk', 'world_club', 'world_festival', 'world_arena',
  'boss_compressor', 'boss_noisegate', 'boss_reverb', 'boss_djglitch', 'boss_playback',
  'victory_stage', 'credits_van', 'defeat_quiet', 'no_such_scene'];
assert.deepEqual(A.SCENE_IDS.slice().sort(), SCENES.filter((s) => s !== 'no_such_scene').sort(), 'SCENE_IDS matches the contract list');
for (const id of SCENES) for (const [w, h] of [[540, 960], [1280, 720]]) for (const p of [0, 0.5, 1]) det('scene ' + id + w + p, (c) => A.drawScene(c, id, w, h, 5.5, { progress: p }));
det('scene no opts', (c) => A.drawScene(c, 'build', 540, 960, 0));
for (const [w, h] of sizes) det('title scene ' + w, (c) => A.drawTitle(c, w, h, 6.6, { beat: 0.7 }));
det('title scene no opts', (c) => A.drawTitle(c, 540, 960, 0));

// animation really moves with t
assert.notEqual(run('t1', (c) => A.drawHero(c, 'roxor', 0, 0, 100, { t: 0.1, pose: 'cheer' })), run('t2', (c) => A.drawHero(c, 'roxor', 0, 0, 100, { t: 0.5, pose: 'cheer' })), 'hero animates with t');
assert.notEqual(run('b1', (c) => A.drawBackdrop(c, 'club', 540, 960, 0.1, {})), run('b2', (c) => A.drawBackdrop(c, 'club', 540, 960, 1.1, {})), 'backdrop animates with t');

// helpers
assert.equal(A.makeCanvas(10, 10), null, 'makeCanvas is null-safe without a DOM');
A.setArtScale(1); A.setArtScale(2);

Math.random = realRandom; Date.now = realNow;
assert.equal(forbidden, 0, 'draw code must not call Math.random or Date.now (' + forbidden + ' calls)');
console.log('drop_the_bass art_world: all checks passed');
