// Drop the Bass round 8 (headless): quests completed by a run are reported, the pad rumbles from haptic patterns, the menu pad on a fake DOM-less setup is inert.
import assert from 'node:assert/strict';
import * as M from '../drop_the_bass/js/meta.js';
import { PadControl, MenuPad } from '../drop_the_bass/js/gamepad.js';
let n = 0;
const ok = (c, m) => { n++; assert.ok(c, m); };

// ---- questsDone
const p = M.newProfile(0);
M.ensureDaily(p, 1e9);
p.daily.quests[0] = { id: 'q_sell', claimed: false };
const res = { won: false, kills: 5, merges: 0, deploys: 3, cleared: 2, bossKills: 0, bestCombo: 1, coinsEarned: 10, mode: 'story', world: 'garage', encore: 0, relics: [], modifiers: [], sells: 4, moves: 0, dropRerolls: 0, branches: 0, synergies: 0, maxLevel: 1, stars: 0, leaks: 0, bossTypes: [] };
const o1 = M.applyRunResult(p, res, null, 1e9);
ok(Array.isArray(o1.questsDone) && o1.questsDone.includes('q_sell'), 'a run that sells 4 turrets completes the sell quest');
const o2 = M.applyRunResult(p, Object.assign({}, res, { sells: 0 }), null, 1e9);
ok(!o2.questsDone.includes('q_sell'), 'an already finished quest is not reported twice');

// ---- pad rumble
{
  const calls = [];
  const gp = { connected: true, buttons: [], axes: [], vibrationActuator: { playEffect: (t, o) => { calls.push([t, o]); return Promise.resolve(); } } };
  const pad = new PadControl({ getPads: () => [gp] });
  ok(pad.rumble([12, 12, 12, 12, 30, 40, 55]) && calls.length === 1 && calls[0][0] === 'dual-rumble', 'a pattern rumbles');
  ok(calls[0][1].duration >= 30 && calls[0][1].duration <= 450 && calls[0][1].strongMagnitude <= 1, 'duration and strength are clamped');
  ok(pad.rumble(90) && calls.length === 2, 'a plain number works too');
  const none = new PadControl({ getPads: () => [{ connected: true, buttons: [], axes: [] }] });
  ok(none.rumble([20]) === false, 'a pad without an actuator is fine');
  const off = new PadControl({ getPads: () => [] });
  ok(off.rumble([20]) === false, 'no pad, no rumble');
}
// ---- MenuPad without a document does nothing
{
  const m = new MenuPad({ getPads: () => [{ connected: true, buttons: [], axes: [] }] });
  ok(m.poll(0.016) === 0, 'no document: inert');
}
console.log('drop_the_bass r8: ' + n + ' checks passed');
