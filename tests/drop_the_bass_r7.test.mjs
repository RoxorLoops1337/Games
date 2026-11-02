// Drop the Bass round 7 (headless): the new run counters and their quests, the version 3 changelog entry, pad selling.
import assert from 'node:assert/strict';
import { Run } from '../drop_the_bass/js/sim.js';
import * as M from '../drop_the_bass/js/meta.js';
import { QUESTS } from '../drop_the_bass/js/data_meta.js';
import { CHANGELOG } from '../drop_the_bass/js/data_changelog.js';
import { GAME } from '../drop_the_bass/js/data_core.js';
import { PadControl } from '../drop_the_bass/js/gamepad.js';
let n = 0;
const ok = (c, m) => { n++; assert.ok(c, m); };
const ALL = ['kick', 'snare', 'hat', 'sub', 'mic', 'synth', 'horn', 'scratch', 'loop', 'cowbell', 'amp', 'vocal'];

// ---- counters
const r = new Run({ world: 'garage', seed: 11, loadout: ALL, mode: 'story' });
r.coins = 99999;
const ids = [];
for (let i = 0; i < 6; i++) { const d = r.deploy(null, { onBeat: false }); if (d.ok) ids.push(d.turret.id); }
ok(ids.length === 6 && r.sells === 0 && r.moves === 0, 'fresh counters');
const empty = r.emptySlots()[0];
ok(r.move(ids[0], empty.idx).ok && r.moves === 1, 'a move counts');
ok(r.sell(ids[1]).ok && r.sells === 1, 'a sell counts');
for (let i = 0; i < 3; i++) r.rerollNext('coins');
ok(r.dropRerolls >= 1, 'drop re-rolls count');
r.startWave(true);
ok(r.bestSyn >= 0, 'synergy pairs are measured at a wave start');
const snap = Run.restore(r.snapshot());
ok(snap.sells === 1 && snap.moves === 1 && snap.dropRerolls === r.dropRerolls, 'counters survive snapshot and restore');
r.finish(false);
const res = r.result;
ok(res.sells === 1 && res.moves === 1 && res.dropRerolls === r.dropRerolls && typeof res.synergies === 'number' && typeof res.branches === 'number', 'the result carries them');

// ---- quests read them
const p = M.newProfile(0);
const fake = Object.assign({}, res, { branches: 2, synergies: 3, sells: 4, moves: 8, dropRerolls: 6 });
M.applyRunResult(p, fake, null, 1e9);
const by = (id) => QUESTS.find((q) => q.id === id);
ok(['q_reroll', 'q_branch', 'q_move', 'q_sell', 'q_syn'].every((id) => by(id) && M.questProgress(p, by(id)) >= by(id).goal), 'the five round 7 quests complete from one run result');
ok(new Set(QUESTS.map((q) => q.id)).size === QUESTS.length, 'quest ids stay unique');
ok(QUESTS.every((q) => !(q.text + '').includes(String.fromCharCode(8212))), 'no em dash in quest text');

// ---- changelog
ok(GAME.version >= 3 && CHANGELOG[0].id === 'v3' && CHANGELOG[0].version === GAME.version && CHANGELOG[0].items.length >= 4, 'version 3 has a What\'s new entry');

// ---- pad: R3 twice sells the selected turret, once only asks
{
  const fx = []; let sold = null;
  const b = { t: 10, selected: 7, hintQueue: [],  tutAllows: () => true, fx: { floater: (...a) => fx.push(a) }, sfx() {}, run: { sell: (id) => { sold = id; }, turretById: () => ({ x: 100, y: 100 }) }, tut: null };
  const pad = new PadControl({ getPads: () => [] });
  ok(pad.press('R3', b) && sold === null && fx.length === 1, 'the first R3 only asks');
  b.t = 11; ok(pad.press('R3', b) && sold === 7 && b.selected === null, 'the second R3 within 2 s sells');
  b.selected = 8; b.t = 20; pad.press('R3', b); b.t = 23; sold = null; pad.press('R3', b);
  ok(sold === null, 'a second press after 2 s asks again instead of selling');
}
console.log('drop_the_bass r7: ' + n + ' checks passed');
