// 38: the snake comes in from UNDER a gate line below the HUD (it no longer slides behind the HUD), and the intro says what to do.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as sim from '../../cell_serpent/sim.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const rd = f => fs.readFileSync(path.join(ROOT, 'cell_serpent', f), 'utf8');
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const EM = String.fromCharCode(8212);

// the gate sits below the HUD (the boss bar pushes the stat row down 35 units) and above the playfield
const g = sim.createGame({ seed: 5, stage: 9 }), gb = sim.createGame({ seed: 5, stage: 10 });
ok(sim.gateY(g) === 182 && sim.gateY(gb) === 215, 'gate heights');
ok(sim.gateY(sim.createGame({ seed: 5, stage: 6 })) === 8, 'circle stages have no gate');
ok(sim.gateY(g) > 150 && sim.gateY(gb) > 185, 'below the HUD stat row (150, boss 185)');
ok(sim.gateY(gb) < sim.LINE_Y / 4, 'a small strip of the field');

// a cell above the gate cannot be shot: aim a shot at the head while it is still under the HUD
{
  const gm = sim.createGame({ seed: 7, stage: 9 });
  let hits = 0;
  for (let i = 0; i < 400 && hits === 0; i++) {
    sim.step(gm, 1 / 30, { mx: 0, my: 0 });
    const head = gm.snakes[0].segs[6];   // the face starts at the gate, the cells behind it are still coming out from under it
    if (head.y > 20 && head.y < sim.gateY(gm) - 30) {
      const before = head.hp;
      gm.bullets.push({ x: head.x, y: head.y + 10, vx: 0, vy: -10, dmg: 999, crit: false, pierce: 0, r: 8, life: 1, hit: [], beat: false, kind: 'p' });
      sim.step(gm, 1 / 120, { mx: 0, my: 0 });
      ok(head.hp === before, 'a cell above the gate is not hit');
      hits++;
    }
  }
  ok(hits === 1, 'the head was seen above the gate during the entry');
}

// the renderer clips the snake to the gate and draws the rail
const rn = rd('render.js');
ok(/gateY\(g\)/.test(rn) && /ctx\.rect\(0, gy, W, H - gy\)/.test(rn) && /drawGate\(g, gy\)/.test(rn), 'the snake is clipped below the gate and the rail is drawn');
ok(/function gateX\(/.test(rn), 'chevrons find where the path crosses the gate');

// intro wording
const ob = rd('onboard12.js'), mj = rd('main.js'), tt = rd('title12b.js');
ok(ob.includes('AUTO SHOOT') && ob.includes('POP THE CELLS') && !ob.includes('POP THE FACE</div>'), 'tutorial captions');
ok(/class="tsub">Drag to move\. Your shots fly straight up\./.test(ob) && /class="tsub">You shoot by yourself/.test(ob) && /class="tsub">Pop all the cells, then the face!/.test(ob), 'one plain line under each caption');
ok(mj.includes('You shoot by yourself') && !mj.includes('shoot up, keep the snake'), 'first-run hint under PLAY');
ok(tt.includes('pop all the cells of stage 1'), 'the first goal says cells');
for (const f of [ob, mj, tt]) ok(!f.includes(EM), 'no em dash');
console.log('38_gate_b15 ok', n);
