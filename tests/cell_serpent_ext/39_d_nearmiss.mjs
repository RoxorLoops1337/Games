// b16d: near-miss moment (close call), exact "so close" copy and the one-tap retry on the Encore card.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const m = await import(path.join(ROOT, 'near_miss_b16d.js'));
const { closeCall } = await import(path.join(ROOT, 'result_goal.js'));

const LEN = 3000;
const G = (ps, t, extra = {}) => Object.assign({ phase: 'play', t, mode: '', path: { len: LEN }, snakes: [{ segs: [{ ps, x: 100, y: 900, hp: 5 }] }] }, extra);
m.nmReset();
assert.equal(m.nmWatch(G(1000, 1)), 0, 'far from the line: nothing');
assert.equal(m.nmWatch(G(LEN - 60, 2)), 0, 'armed, no call yet');
assert.equal(m.nmWatch(G(LEN - 40, 3)), 0, 'closer: still armed');
assert.equal(m.nmWatch(G(LEN - 120, 4)), 0, 'pushed back a little: not enough');
assert.equal(m.nmWatch(G(LEN - 200, 5)), 40, 'pushed back well: the call reports the closest gap');
assert.equal(m.closeCalls(), 1);
assert.equal(m.nmWatch(G(LEN - 30, 6)), 0);
assert.equal(m.nmWatch(G(LEN - 400, 7)), 0, 'cooldown holds a second call back');
assert.equal(m.nmWatch(G(LEN - 30, 14)), 0);
assert.equal(m.nmWatch(G(LEN - 400, 15)), 30, 'after the cooldown it fires again');
// a breach is a loss, never a call; other modes and phases are ignored
m.nmReset(); m.nmWatch(G(LEN - 50, 1)); assert.equal(m.nmWatch(G(LEN + 5, 2)), 0); assert.equal(m.nmWatch(G(LEN - 400, 3)), 0, 'a breach disarms');
m.nmReset(); m.nmWatch(G(LEN - 50, 1, { mode: 'pig' })); assert.equal(m.nmWatch(G(LEN - 500, 9, { mode: 'pig' })), 0, 'pig and invader modes skip it');
m.nmReset(); m.nmWatch(G(LEN - 50, 1)); assert.equal(m.nmWatch(G(LEN - 500, 9, { phase: 'dead' })), 0, 'only while playing');
m.nmReset(); assert.equal(m.nmWatch(G(LEN - 50, 1, { snakes: [{ segs: [{ ps: LEN - 50, hp: 0 }] }] })), 0, 'a dead face is no target');
// two snakes: the closest face counts, each snake uses its own path length
m.nmReset(); m.nmWatch(G(0, 1, { snakes: [{ segs: [{ ps: 100, hp: 1 }] }, { path: { len: 500 }, segs: [{ ps: 450, hp: 1 }] }] }));
assert.equal(m.nmState().low, 50, 'the second snake on its own path is the closest');

// result copy
assert.equal(closeCall({ won: false, progress: 0.91, kills: 9 }).title, 'SO CLOSE!');
assert.match(closeCall({ won: false, progress: 0.91, kills: 9 }).sub, /91% popped/);
assert.match(closeCall({ won: false, progress: 0.91, kills: 9 }).sub, /9% left/);
assert.ok(closeCall({ won: false, progress: 0.99, kills: 9 }).sub.includes('1% left'));
assert.equal(closeCall({ won: false, progress: 0.3 }), null);
assert.equal(closeCall({ won: true, progress: 1 }), null);

// wiring
const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const main = rd('main.js'), html = rd('index.html'), fx = rd('screenfx.js'), rend = rd('render.js');
assert.ok(/nmWatch\(g\)/.test(main) && /nmReset\(\)/.test(main), 'main watches the face and resets per run');
assert.ok(/case 'nearmiss'/.test(fx) && /case 'nearmiss'/.test(rend), 'the event has a screen effect and a text');
assert.ok(/id="rvRetry"/.test(html) && /rvRetry/.test(main), 'the Encore card has a one-tap RETRY');
assert.ok(html.indexOf('@css:39-d-retry') > 0 && html.indexOf('@css:39-d-retry') < html.indexOf('@css:34-phone-hub'), 'css block sits before the phone block');
const dash = String.fromCharCode(0x2014);
for (const f of ['near_miss_b16d.js', 'main.js', 'screenfx.js', 'render.js', 'result_goal.js', 'index.html']) assert.ok(!rd(f).includes(dash), 'no em dash in ' + f);
