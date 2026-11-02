// Drop the Bass round 9 (headless): season goals finished by a run are reported.
import assert from 'node:assert/strict';
import * as M from '../drop_the_bass/js/meta.js';
import { SEASON_GOALS } from '../drop_the_bass/js/data_meta.js';
let n = 0;
const ok = (c, m) => { n++; assert.ok(c, m); };
const NOW = Date.UTC(2026, 10, 10, 12);
const p = M.newProfile(0);
M.ensureSeason(p, NOW);
const g = SEASON_GOALS.find((x) => x.stat === 'kills');
p.season.progress.kills = g.goal - 5;
const res = { won: false, kills: 50, merges: 0, deploys: 1, cleared: 1, bossKills: 0, bestCombo: 1, coinsEarned: 1, mode: 'story', world: 'garage', encore: 0, relics: [], modifiers: [], maxLevel: 1, stars: 0, leaks: 0, bossTypes: [] };
const o1 = M.applyRunResult(p, res, null, NOW);
ok(o1.seasonNew === 1, 'a run that finishes a season goal reports it (' + o1.seasonNew + ')');
const o2 = M.applyRunResult(p, res, null, NOW);
ok(o2.seasonNew === 0, 'an already finished goal is not reported again');
// ---- a new player is never dealt the Endless quest (Endless is locked until the first stage clear)
{
  let seen = 0;
  for (let d = 0; d < 200; d++) { const q = M.newProfile(0); M.ensureDaily(q, Date.UTC(2026, 0, 1) + d * 86400000); if (q.daily.quests.some((x) => x.id === 'q_endless')) seen++; }
  ok(seen === 0, 'q_endless is never dealt before the first clear');
  let later = 0;
  for (let d = 0; d < 200; d++) { const q = M.newProfile(0); q.prog.garage.cleared = true; M.ensureDaily(q, Date.UTC(2026, 0, 1) + d * 86400000); if (q.daily.quests.some((x) => x.id === 'q_endless')) later++; }
  ok(later > 0, 'q_endless is dealt once Endless is open');
}
console.log('drop_the_bass r9: ' + n + ' checks passed');
