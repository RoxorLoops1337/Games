// Drop the Bass doodle style: enemies and bosses (doodle_enemies.js), headless with a mock 2D context.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as D from '../drop_the_bass/js/doodle_enemies.js';
import { ENEMY_IDS, BOSS_IDS, AFFIXES } from '../drop_the_bass/js/data_core.js';

let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
function mock() {
  const st = { saves: 0, restores: 0, calls: 0, nan: 0 };
  const chk = (a) => { for (const v of a) if (typeof v === 'number' && !Number.isFinite(v)) st.nan++; };
  const ctx = new Proxy({ globalAlpha: 1, lineWidth: 1, fillStyle: '#000', strokeStyle: '#000', globalCompositeOperation: 'source-over' }, {
    get(t, k) {
      if (k === '__st') return st;
      if (k === 'save') return () => { st.saves++; };
      if (k === 'restore') return () => { st.restores++; };
      if (k === 'measureText') return () => ({ width: 5 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (k in t) return t[k];
      return (...a) => { st.calls++; chk(a); };
    },
    set(t, k, v) { if (typeof v === 'number' && !Number.isFinite(v)) st.nan++; t[k] = v; return true; },
  });
  return ctx;
}

// every enemy, every affix, every status and option combination
const ctx = mock();
const OPTS = [{}, { t: 3.3, ang: 2, id: 7 }, { hp: 0.4, hit: 0.7, slow: true }, { stun: true, burn: true, mark: true, shield: 0.6 }, { rage: true, scale: 1.4, alpha: 0.5, id: 'abc' }, { shield: 0, hp: 1.2, hit: 0 }, undefined];
for (const id of ENEMY_IDS) for (const aff of [null, ...Object.keys(AFFIXES)]) for (const o of OPTS) { D.drawEnemy(ctx, id, 50, 60, o ? Object.assign({ affix: aff }, o) : undefined); }
for (const id of BOSS_IDS) for (const ph of [1, 2, 3]) for (const g of [false, true]) for (const o of [{}, { t: 5, ang: 1, hp: 0.3, hit: 0.5, scale: 1.2 }]) D.drawBoss(ctx, id, 80, 90, Object.assign({ gated: g, phase: ph }, o));
D.drawBoss(ctx, 'playback', 0, 0); D.drawEnemy(ctx, 'fuzz', 0, 0);
ok(ctx.__st.saves === ctx.__st.restores, 'save and restore balance ' + ctx.__st.saves + '/' + ctx.__st.restores);
ok(ctx.__st.nan === 0, 'no NaN reached the context: ' + ctx.__st.nan);
ok(ctx.__st.calls > 5000, 'something was drawn');
// unknown ids are ignored
D.drawEnemy(ctx, 'nope', 0, 0, {}); D.drawBoss(ctx, 'nope', 0, 0, {}); ok(true, 'unknown ids do not throw');
// setArtScale is safe
D.setArtScale(1); D.setArtScale(3); D.drawEnemy(ctx, 'brick', 1, 1, { t: 1 }); D.setArtScale(2);
// determinism: the same calls draw the same sequence of operations
const trace = () => { const log = []; const c = new Proxy({ globalAlpha: 1 }, { get(t, k) { if (k === 'measureText') return () => ({ width: 5 }); if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} }); if (k in t) return t[k]; return (...a) => { log.push(k + ':' + a.map((v) => (typeof v === 'number' ? v.toFixed(3) : typeof v)).join(',')); }; }, set(t, k, v) { t[k] = v; return true; } }); for (const id of ['fuzz', 'zip', 'mute']) D.drawEnemy(c, id, 5, 5, { t: 1.5, ang: 1, id: 2, affix: id === 'fuzz' ? 'golden' : null }); D.drawBoss(c, 'djglitch', 0, 0, { t: 2 }); return log.join('|'); };
ok(trace() === trace(), 'drawing is deterministic'); 
// the module obeys the house rules
const src = readFileSync(new URL('../drop_the_bass/js/doodle_enemies.js', import.meta.url), 'utf8');
ok(!src.includes('Math.random') && !/Date\.now|new Date/.test(src), 'no Math.random or Date');
ok(!src.includes(String.fromCharCode(8212)), 'no em dash');
console.log('drop_the_bass doodle enemies: ' + n + ' checks passed');
