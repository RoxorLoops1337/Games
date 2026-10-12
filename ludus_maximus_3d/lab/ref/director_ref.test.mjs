// node ludus_maximus_3d/lab/ref/director_ref.test.mjs
import { FightDirector, projectPose } from './director_ref.js';
let seed = 12345; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const R = 8.6; let fails = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { fails++; if (fails < 25) console.log('FAIL', m); } };
function layout(n) { return Array.from({ length: n }, (_, i) => { const a = rnd() * 6.283, r = Math.sqrt(rnd()) * 7.6; return { id: i + 1, team: i % 2, x: Math.cos(a) * r, y: Math.sin(a) * r, vx: 0, vy: 0, alive: true }; }); }
function step(us, dt) { for (const u of us) { if (!u.alive) continue; if (rnd() < 0.02) { const a = rnd() * 6.283, v = rnd() * 4; u.vx = Math.cos(a) * v; u.vy = Math.sin(a) * v; }
  u.x += u.vx * dt; u.y += u.vy * dt; const r = Math.hypot(u.x, u.y); if (r > 7.8) { u.x *= 7.8 / r; u.y *= 7.8 / r; u.vx = -u.vx; u.vy = -u.vy; } } }
function inFrustum(pose, aspect, us, tol = 1.0) { // foot + head of each living unit inside the frame
  for (const u of us) { if (u.alive === false) continue; for (const h of [0, 2.0]) { const p = projectPose(pose, aspect, [u.x, h, u.y]); if (!(p.depth > 0.3 && Math.abs(p.x) <= tol && Math.abs(p.y) <= tol)) return `unit ${u.id} h${h} ndc(${p.x.toFixed(2)},${p.y.toFixed(2)}) depth ${p.depth.toFixed(1)}`; } } return null; }

const aspects = [0.5, 0.56, 0.75, 1, 1.33, 1.78, 2];
// 1) framing guarantee for all-fighter shots (follow, victory), random layouts 1v1..3v3, moving units, all aspects
for (const shotName of ['follow', 'victory']) for (const asp of aspects) for (let trial = 0; trial < 40; trial++) {
  const n = 2 + Math.floor(rnd() * 5), us = layout(n), d = new FightDirector({ aspect: asp }); d.setShot(shotName, {}, 0); let worst = null;
  for (let f = 0; f < 240; f++) { step(us, 1 / 60); if (f === 120 && n > 2) us[0].alive = false; const pose = d.update(1 / 60, us);
    const live = us.filter((u) => u.alive); const bad = inFrustum(pose, asp, live); if (bad) worst = `${shotName} asp ${asp} n${n} frame ${f}: ${bad}`;
    ok(Number.isFinite(pose.pos.x + pose.pos.y + pose.pos.z + pose.fov), 'finite pose'); ok(pose.pos.y >= 0.5, 'above floor'); }
  ok(!worst, worst);
}
// 2) camera stays inside the bowl (follow/victory/establishing), at any aspect
for (const sh of ['follow', 'victory', 'establishing']) for (const asp of aspects) { const us = layout(4), d = new FightDirector({ aspect: asp }); d.setShot(sh, {}, 0); let maxR = 0;
  for (let f = 0; f < 200; f++) { step(us, 1 / 60); const p = d.update(1 / 60, us); maxR = Math.max(maxR, Math.hypot(p.pos.x, p.pos.z)); }
  ok(maxR <= R + 0.01, `${sh} asp ${asp}: camera radius ${maxR.toFixed(2)} outside bowl`); }
// 3) duel frames both duelists, camera sits behind the first
for (const asp of aspects) for (let t = 0; t < 30; t++) { const us = layout(2), d = new FightDirector({ aspect: asp }); d.setShot('duel', { a: 1, b: 2 }, 0); let pose;
  for (let f = 0; f < 150; f++) { step(us, 1 / 60); pose = d.update(1 / 60, us); } const bad = inFrustum(pose, asp, us); ok(!bad, `duel asp ${asp}: ${bad}`); }
// 4) ultimate hero shot: caster inside frame, slow-mo cue, returns to base shot afterwards
for (const asp of aspects) { const us = layout(4), d = new FightDirector({ aspect: asp }); d.setShot('follow', {}, 0); for (let f = 0; f < 60; f++) d.update(1 / 60, us);
  d.cue('ultimate', { unit: 1, target: 2 }); let minTs = 1, bad = null, sawUlt = false;
  for (let f = 0; f < 150; f++) { const p = d.update(1 / 60, us); if (p.shot === 'ultimate') sawUlt = true; minTs = Math.min(minTs, p.timeScale); if (f > 20 && f < 60) { const b = inFrustum(p, asp, [us[0]]); if (b) bad = b; } }
  ok(!bad, `ultimate asp ${asp}: ${bad}`); ok(minTs <= 0.25, 'ultimate slow-mo cue'); ok(sawUlt && d.shot.name === 'follow', 'ultimate returns to follow'); }
// 5) kill cam: victim inside frame, orbit moves, time scale ramps back
for (const asp of aspects) { const us = layout(4), d = new FightDirector({ aspect: asp }); d.setShot('follow', {}, 0); for (let f = 0; f < 60; f++) d.update(1 / 60, us);
  us[1].alive = false; d.cue('kill', { victim: 2, killer: 1 }); let bad = null, y0, y1, ts;
  for (let f = 0; f < 150; f++) { const p = d.update(1 / 60, us); if (f === 30) y0 = Math.atan2(p.pos.z - p.look.z, p.pos.x - p.look.x); if (f === 100) y1 = Math.atan2(p.pos.z - p.look.z, p.pos.x - p.look.x); ts = p.timeScale;
    if (f > 20 && f < 100) { const b = inFrustum(p, asp, [{ ...us[1], alive: true }]); if (b) bad = b; } }
  ok(!bad, `kill asp ${asp}: ${bad}`); ok(Math.abs(Math.atan2(Math.sin(y1 - y0), Math.cos(y1 - y0))) > 0.3, 'kill cam orbits'); ok(ts > 0.9, 'timescale restored'); }
// 6) establishing -> gate -> follow auto chain finishes; free orbit override and release
{ const us = layout(4), d = new FightDirector({ aspect: 1.78 }); const seen = new Set(); for (let f = 0; f < 60 * 12; f++) { seen.add(d.update(1 / 60, us).shot); }
  ok(seen.has('establishing') && seen.has('gate') && seen.has('follow'), 'auto chain ' + [...seen]);
  const before = { ...d.pose.pos }; for (let f = 0; f < 60; f++) { d.freeOrbit(0.03, 0.002, 0); d.update(1 / 60, us); } ok(d.pose.shot === 'free', 'free override');
  ok(Math.hypot(d.pose.pos.x - before.x, d.pose.pos.z - before.z) > 0.5, 'free orbit moved camera');
  d.release(); for (let f = 0; f < 120; f++) d.update(1 / 60, us); ok(d.pose.shot === 'follow', 'release returns to director'); ok(!inFrustum(d.pose, 1.78, us), 'framed after release'); }
// 7) smoothness: follow cam never jumps (> 1.2 m per frame) while units wander
for (const asp of [0.5, 1.78]) { const us = layout(6), d = new FightDirector({ aspect: asp }); d.setShot('follow', {}, 0); let prev = null, maxJ = 0;
  for (let f = 0; f < 600; f++) { step(us, 1 / 60); const p = d.update(1 / 60, us); if (prev && f > 30) maxJ = Math.max(maxJ, Math.hypot(p.pos.x - prev.x, p.pos.y - prev.y, p.pos.z - prev.z)); prev = { ...p.pos }; }
  ok(maxJ < 1.2, `follow smoothness asp ${asp}: max step ${maxJ.toFixed(2)} m`); }
console.log(`${checks - fails}/${checks} checks passed`); process.exit(fails ? 1 : 0);
