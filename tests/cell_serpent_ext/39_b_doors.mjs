// 39_b: Risk Doors. The loud door is a harder twist for double Beats, saved in the run result; the calm door changes nothing.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const sim = await import(path.join(ROOT, 'cell_serpent', 'sim.js'));
const rd = f => fs.readFileSync(path.join(ROOT, 'cell_serpent', f), 'utf8');
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };

// doors come before the stage after each boss, never before stage 1 to 5, never on a boss
ok([6, 11, 16, 21, 46].every(sim.hasDoors), 'doors before 6, 11, 16 ...');
ok(![1, 2, 5, 10, 7, 50].some(sim.hasDoors), 'no doors elsewhere');
ok(sim.RISK_LOUD.length === 4 && sim.RISK_LOUD.every(r => r.id.startsWith('rk_') && r.name && r.blurb), 'four loud twists');
ok(sim.riskLoud(6).id !== sim.riskLoud(11).id, 'the twist rotates');

// calm door: identical to a run without doors (same seed, same snake, same coin factor)
const base = sim.createGame({ seed: 9, stage: 6 }), calm = sim.createGame({ seed: 9, stage: 6, risk: '' });
ok(base.snakes[0].speed === calm.snakes[0].speed && base.snakes[0].segs[3].max === calm.snakes[0].segs[3].max && base.coinK === calm.coinK, 'calm changes nothing');
ok(base.risk === '' && base.mod === null, 'no risk on the plain run');

// loud door: harder and pays double
for (const r of sim.RISK_LOUD) {
  let stage = 6; while (sim.riskLoud(stage).id !== r.id) stage += 5;
  const a = sim.createGame({ seed: 9, stage }), b = sim.createGame({ seed: 9, stage, risk: r.id });
  ok(b.risk === r.id && b.mod && b.mod.risk, 'risk is set ' + r.id);
  ok(b.coinK === a.coinK * 2 * (a.mod && a.mod.coin ? 1 : 1) || a.mod, 'double beats ' + r.id);
  ok(b.coinK >= a.coinK * 2 - 1e-9, 'coinK doubled ' + r.id);
  if (r.speed) ok(b.snakes[0].speed > a.snakes[0].speed * 1.15, 'faster');
  if (r.hp) ok(b.snakes[0].segs[8].max > a.snakes[0].segs[8].max * 1.2, 'tougher');
  const res = sim.quitResult(b);
  ok(res.risk === r.id, 'saved in the run result');
}

// never applies to boss stages, hard mode, pig/inv modes or unknown ids
ok(sim.createGame({ seed: 1, stage: 10, risk: 'rk_bass' }).mod === null, 'not on a boss stage');
ok(sim.createGame({ seed: 1, stage: 6, risk: 'rk_bass', hard: true }).risk === '', 'not in hard mode');
ok(sim.createGame({ seed: 1, stage: 6, risk: 'nope' }).risk === '', 'unknown ids are ignored');
ok(sim.createGame({ seed: 1, stage: 6, risk: 'rk_bass', mode: 'pig' }).risk === '', 'not in pig mode');

// a stage that already has a natural twist (16 is Fragile) merges instead of replacing it
{
  const a = sim.createGame({ seed: 4, stage: 16 }), b = sim.createGame({ seed: 4, stage: 16, risk: 'rk_tempo' });
  ok(a.mod && b.mod && b.mod.name.includes(a.mod.name) && b.mod.speed > 1.19, 'merged twist');
}

// the save: counters with defaults, cleaned on load, counted once per door run
{
  const s = sim.sanitizeSave({});
  ok(s.risk && s.risk.taken === 0 && s.risk.won === 0 && s.risk.calm === 0, 'default save field');
  ok(sim.sanitizeSave({ risk: { taken: -4, won: 'x', calm: 3.9 } }).risk.calm === 3, 'sanitized');
  const base2 = { stage: 6, kills: 5, coins: 10, won: true, stars: 1, mode: '', hard: false, progress: 1, frags: {}, risk: 'rk_bass' };
  sim.applyResult(s, base2); sim.applyResult(s, { ...base2, risk: '', won: false });
  ok(s.risk.taken === 1 && s.risk.won === 1 && s.risk.calm === 1, 'counters');
  const old = sim.sanitizeSave({ cleared: 20 }); ok(old.risk && old.cleared === 20, 'legacy save loads');
}

// wiring
const main = rd('main.js'), ui = rd('risk_b16b.js'), html = rd('index.html'), unl = rd('unlock_b12p.js');
ok(/showDoors\(\{ stage/.test(main) && /risk: riskId/.test(main) && /riskPick = null/.test(main), 'main is wired');
ok(/id: 'doors', step: 5/.test(unl), 'registered in the unlock table');
ok(html.includes('/* @css:39-b-doors */') && html.indexOf('@css:39-b-doors') < html.indexOf('@css:34-phone-hub'), 'css block before phone-hub');
ok(!/—/.test(ui + main.match(/riskPick[^\n]*/g).join('')), 'no em dash');
ok(/min-height: 44px/.test(html.slice(html.indexOf('@css:39-b-doors'), html.indexOf('end @css:39-b-doors'))), '44px targets');
console.log('39_b_doors ok (' + n + ')');
