// PUPPET WALK (graftwork/ui/puppet.js, data/gaits.js): the step cycle is checked NUMERICALLY, not by eye. Planted foot ground speed, strict L R L R,
// swing clearance, double support, stride = speed x period, no vertical drift, the bob phases, and that the part transforms really put the sole where the step
// cycle says. Plus the alpha analysis on synthetic silhouettes, the gait table and the lab wiring.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as P from '../graftwork/ui/puppet.js';
import { GAITS, PUPPET_PREF, GAIT_KINDS, wantsPuppet, gaitEntry } from '../graftwork/data/gaits.js';

const root = new URL('../graftwork/', import.meta.url).pathname;
let n = 0;
const t = async (name, fn) => { try { await fn(); n++; console.log('ok', name); } catch (e) { console.error('FAIL', name, '\n', e.stack); process.exitCode = 1; } };
const geom = { D0: 0.34, legH: 0.24, pu: 0.1, H: 1 };
const T = { ...P.TUNE_DEFAULT };
const S = P.strideOf(geom, T);
const pose = P.newPose();
const at = (ph, speed = 1) => P.walkPuppet(ph, speed, 'legged', T, pose, geom);
// foot position along the path in figure heights: distance walked (ph steps of S) + the foot offset
const worldL = (ph) => { at(ph); return ph * S + pose.footLx; };
const worldR = (ph) => { at(ph); return ph * S + pose.footRx; };
const DPH = 0.002;

await t('layers_the_left_leg_is_in_front_of_the_right_leg_in_the_puppet_and_in_the_rig', async () => {
  // puppet: record which leg part is drawn last
  const mk = (tag) => ({ c: { tag }, x: 0, y: 0, w: 0.1, h: 0.2 });
  const Pp = { legL: mk('L'), legR: mk('R'), upper: { c: { tag: 'U' }, x: 0, y: 0, w: 0.3, h: 0.5 }, pivLx: 0.4, pivRx: 0.6, pivY: 0.5, hipX: 0.5, hipY: 0.5 };
  const drawn = [];
  const g = new Proxy({}, { get: (_o, k) => (k === 'drawImage' ? (c) => drawn.push(c.tag) : () => {}) });
  const ps = P.newPose(); P.walkPuppet(0.3, 1, 'legged', T, ps, geom);
  P.drawLegged(g, Pp, ps, 1, 0, 0, 100, 100, 100);
  assert.deepEqual(drawn, ['R', 'L', 'U'], 'the far (right) leg first, then the near (left) leg, then the upper body');
  // rig: the left leg and arm have a higher z than the right ones
  const { HUMANOID } = await import('../graftwork/ui/rig.js');
  const z = (n) => HUMANOID.bones.find((b) => b.n === n).z;
  assert.ok(z('legL_up') > z('legR_up') && z('legL_lo') > z('legR_lo') && z('footL') > z('footR'), 'left leg in front of the right leg');
  assert.ok(z('armL_up') > z('armR_up'), 'the near arm goes with the near leg');
});

await t('planted_foot_ground_speed_is_zero', () => {
  let stance = 0, worst = 0;
  for (let ph = 0.02; ph < 8; ph += DPH) {
    for (const [side, w] of [['L', worldL], ['R', worldR]]) {
      at(ph); const planted = side === 'L' ? pose.plantL : pose.plantR; if (!planted) continue;
      // keep clear of the exact touch down and lift off instants
      const f = ((side === 'L' ? ph : ph + 1) * 0.5) % 1; if (f < 0.01 || f > T.duty - 0.01) continue;
      const v = (w(ph + DPH / 2) - w(ph - DPH / 2)) / DPH; // figure heights per step of phase; walking speed is S per step
      worst = Math.max(worst, Math.abs(v) / S); stance++;
    }
  }
  assert.ok(stance > 1000, 'plant samples ' + stance);
  assert.ok(worst < 0.05, 'a planted foot slides at ' + (worst * 100).toFixed(2) + ' percent of the stride speed (limit 5)');
  assert.ok(worst < 1e-6, 'by construction it is exactly zero, got ' + worst);
});
await t('feet_alternate_strictly_L_R_L_R', () => {
  const lifts = []; let pl = true, pr = true;
  for (let ph = 0; ph < 12; ph += 0.005) { at(ph); if (pl && !pose.plantL) lifts.push('L'); if (pr && !pose.plantR) lifts.push('R'); pl = pose.plantL; pr = pose.plantR; }
  assert.ok(lifts.length >= 10, 'lift offs ' + lifts.length);
  for (let i = 1; i < lifts.length; i++) assert.notEqual(lifts[i], lifts[i - 1], 'two lift offs of the same foot in a row at ' + i + ': ' + lifts.join(''));
  assert.equal(lifts[0], 'R', 'at the first contact the left foot leads and stays planted while the right swings first');
  // the leading foot at each contact (an integer phase) alternates and is the forward one
  for (let k = 0; k < 8; k++) { at(k + 0.0001); const lead = pose.footLx > pose.footRx ? 'L' : 'R'; assert.equal(lead, k % 2 === 0 ? 'L' : 'R', 'contact ' + k); assert.equal(pose.lead, k % 2 === 0 ? 'L' : 'R'); assert.ok(lead === 'L' ? pose.plantL : pose.plantR, 'the leading foot is planted at its contact'); }
});
await t('swing_foot_lifts_at_least_6_percent_of_the_height', () => {
  let maxL = 0, maxR = 0;
  for (let ph = 0; ph < 4; ph += 0.002) { at(ph); maxL = Math.max(maxL, pose.footLy); maxR = Math.max(maxR, pose.footRy); }
  assert.ok(maxL >= 0.06 && maxR >= 0.06, 'clearance L ' + maxL.toFixed(3) + ' R ' + maxR.toFixed(3));
  // the clearance is at the middle of the swing, and planted feet are on the ground (y 0)
  for (let ph = 0; ph < 4; ph += 0.01) { at(ph); if (pose.plantL) assert.equal(pose.footLy, 0); if (pose.plantR) assert.equal(pose.footRy, 0); }
  const fL = (T.duty + 1) / 2; at(2 * fL); assert.ok(pose.footLy >= 0.06, 'mid swing of the left foot lifts ' + pose.footLy);
});
await t('walk_not_run_double_support_is_brief_and_never_airborne', () => {
  let both = 0, none = 0, N = 0;
  for (let ph = 0; ph < 4; ph += 0.001) { at(ph); N++; if (pose.plantL && pose.plantR) both++; if (!pose.plantL && !pose.plantR) none++; }
  assert.equal(none, 0, 'both feet in the air (a run)');
  assert.ok(both / N <= 0.2 && both / N > 0, 'double support ' + (both / N).toFixed(3) + ' of the cycle');
});
await t('stride_length_equals_speed_times_period', () => {
  // two steps (one cycle) at speed v take period = 2 S / v; the same foot touches down 2 S apart; S = strideOf(geom)
  for (const v of [0.5, 1.2, 2.4]) {
    const period = 2 * S / v, dist = v * period;
    assert.ok(Math.abs(dist - 2 * S) < 1e-12);
    at(0.0001); const x0 = 0.0001 * S + pose.footLx; at(2.0001); const x1 = 2.0001 * S + pose.footLx;
    assert.ok(Math.abs((x1 - x0) - v * period) < 1e-3, 'the left foot lands ' + (x1 - x0) + ' further after one period, expected ' + v * period);
  }
  at(0); assert.ok(Math.abs(pose.stride - S) < 1e-12);
  assert.ok(S >= 0.2 && S <= 0.38, 'a sane stride ' + S);
  // a longer swing limit lets the legs take longer steps (never beyond what they can reach)
  assert.ok(P.strideOf(geom, { ...T, swing: 35 }) >= P.strideOf(geom, { ...T, swing: 12 }));
});
await t('no_vertical_drift_over_a_cycle_and_body_phases', () => {
  for (let ph = 0; ph < 2; ph += 0.05) { at(ph); const a = pose.down, f = [pose.footLy, pose.footRy]; at(ph + 2); assert.ok(Math.abs(pose.down - a) < 1e-12, 'down repeats each cycle'); assert.ok(Math.abs(pose.footLy - f[0]) < 1e-12 && Math.abs(pose.footRy - f[1]) < 1e-12); }
  let sum0 = 0, sum1 = 0, N = 0; for (let ph = 0; ph < 2; ph += 0.001) { at(ph); sum0 += pose.down; at(ph + 2); sum1 += pose.down; N++; }
  assert.ok(Math.abs(sum0 - sum1) / N < 1e-9, 'the mean height is the same every cycle');
  // lowest at contact / down (just after an integer phase), highest at passing (half way between); two bobs per cycle
  let lo = 0, hi = 0, minD = 9, maxD = -9; for (let ph = 0; ph < 2; ph += 0.001) { at(ph); if (pose.down > maxD) { maxD = pose.down; lo = ph; } if (pose.down < minD) { minD = pose.down; hi = ph; } }
  const fr = (x) => x - Math.floor(x);
  assert.ok(fr(lo) <= 0.15 || fr(lo) >= 0.97, 'lowest at contact/down, got phase ' + lo);
  assert.ok(fr(hi) >= 0.4 && fr(hi) <= 0.6, 'highest at passing, got phase ' + hi);
  let peaks = 0, prev = -1, dir = 0; for (let ph = 0; ph < 2; ph += 0.002) { at(ph); if (prev >= 0) { const d = Math.sign(pose.down - prev); if (dir > 0 && d < 0) peaks++; if (d !== 0) dir = d; } prev = pose.down; }
  assert.equal(peaks, 2, 'two bobs per stride cycle (one per step), got ' + peaks);
  // at passing the planted foot is under the hip and the other foot is lifted
  at(0.5); assert.ok(Math.abs(pose.footLx) < 0.25 * S || Math.abs(pose.footRx) < 0.25 * S);
  assert.ok(pose.plantL !== pose.plantR, 'passing: exactly one foot planted'); assert.ok((pose.plantL ? pose.footRy : pose.footLy) > 0.04, 'the other foot is lifted at passing');
});
await t('weight_sways_toward_the_planted_foot_and_the_body_leans_in', () => {
  at(0.29 * 2); const swL = pose.sway, lone = pose.plantL && !pose.plantR; assert.ok(lone, 'left foot alone at its passing'); at(0.79 * 2); const swR = pose.sway;
  assert.ok(swL < 0 && swR > 0, 'sway goes to the left over the left foot and to the right over the right foot: ' + swL + ' ' + swR);
  let lean = 0; for (let ph = 0; ph < 2; ph += 0.05) { at(ph); lean += pose.lean; assert.ok(pose.lean > 0, 'always leaning into the direction'); } assert.ok(lean > 0);
  at(0.0001); const sq0 = pose.sq; at(0.6); assert.ok(sq0 < pose.sq && sq0 < 1, 'squash on the plant, relaxed by the passing');
});
await t('part_transforms_put_the_sole_exactly_on_the_foot_target_within_the_swing_limit', () => {
  const o = { x: 0, y: 0 }; let maxRot = 0, maxSlide = 0;
  for (let ph = 0; ph < 8; ph += 0.013) {
    at(ph);
    for (const side of ['L', 'R']) {
      const leg = side === 'L' ? pose.legL : pose.legR, fx = side === 'L' ? pose.footLx : pose.footRx, fy = side === 'L' ? pose.footLy : pose.footRy;
      P.footPoint(pose, side, geom, o);
      assert.ok(Math.abs(o.x - fx) < 1e-9 && Math.abs(o.y - (geom.D0 - fy)) < 1e-9, side + ' sole at ' + o.x + ',' + o.y + ' wanted ' + fx + ',' + (geom.D0 - fy));
      maxRot = Math.max(maxRot, Math.abs(leg.rot)); maxSlide = Math.max(maxSlide, Math.abs(leg.dx)); assert.ok(leg.sy >= 0.6 && leg.sy <= 1.12);
    }
  }
  assert.ok(maxRot <= T.swing * Math.PI / 180 + 1e-9, 'rotation limit ' + maxRot);
  assert.ok(maxSlide < 0.09, 'the leg part stays under the hip, widest slide ' + maxSlide);
});
await t('fade_to_idle_and_non_finite_input', () => {
  at(3.3, 0); assert.ok(Math.abs(pose.footLx) < 1e-9 && Math.abs(pose.footRx) < 1e-9 && pose.footLy === 0 && pose.down === 0, 'speed 0: standing');
  for (const ph of [0, -5, NaN, 1e9]) { P.walkPuppet(ph, 1, 'legged', T, pose, geom); for (const k of ['down', 'sway', 'lean', 'sq', 'footLx', 'footRx']) assert.ok(Number.isFinite(pose[k]), k + ' at ' + ph); }
});
await t('body_gaits_hop_waddle_roll_flap', () => {
  const o = P.newPose(); const run = (kind, f) => { for (let ph = 0; ph < 4; ph += 0.01) { P.walkPuppet(ph, 1, kind, T, o); f(ph); } };
  let maxHop = 0, minSq = 9, maxSq = 0; run('hop', () => { maxHop = Math.max(maxHop, o.hop); minSq = Math.min(minSq, o.sq); maxSq = Math.max(maxSq, o.sq); assert.ok(o.hop >= 0); });
  assert.ok(maxHop > 0.1 && minSq < 0.9 && maxSq > 1.05, 'hop: spring, crouch and stretch ' + [maxHop, minSq, maxSq]);
  const signs = new Set(); run('waddle', (ph) => { if (Math.abs(ph - Math.round(ph)) < 1e-9) signs.add(Math.sign(o.rock)); assert.ok(Math.abs(o.rock) <= 0.11); });
  P.walkPuppet(0, 1, 'waddle', T, o); const r0 = o.rock; P.walkPuppet(1, 1, 'waddle', T, o); assert.ok(r0 * o.rock < 0, 'a waddle tips to the other corner every step'); assert.ok(signs.size >= 1);
  let hopRoll = 0; run('roll', () => { hopRoll = Math.max(hopRoll, o.hop); assert.ok(Math.abs(o.rock) < 0.02 && Math.abs(o.down) < 0.01); }); assert.equal(hopRoll, 0, 'a roll never hops');
  let lo = 9, hi = -9; run('flap', () => { lo = Math.min(lo, o.hop); hi = Math.max(hi, o.hop); }); assert.ok(lo > 0 && hi - lo > 0.05, 'a flyer hovers above the floor and bobs');
  for (const k of GAIT_KINDS) assert.ok(P.STRIDE_OF[k] > 0, 'stride of ' + k);
});

// ---- the alpha analysis on synthetic silhouettes (fractions of the image) ----
const mask = (w, h, fn) => { const a = new Uint8Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) a[y * w + x] = fn(x, y) ? 255 : 0; return a; };
await t('analysis_finds_the_hip_line_and_the_valley', () => {
  const W = 100, H = 160, a = mask(W, H, (x, y) => (y >= 10 && y < 100 && x >= 30 && x < 70) || (y >= 100 && y < 150 && ((x >= 32 && x < 48) || (x >= 52 && x < 68))));
  const an = P.analyseAlpha(a, W, H);
  assert.ok(an.ok && an.legs, an.reason);
  assert.ok(Math.abs(an.hip - 100 / H) < 0.02, 'hip ' + an.hip); assert.ok(Math.abs(an.valley - 0.5) < 0.02, 'valley ' + an.valley);
  assert.ok(Math.abs(an.top - 10 / H) < 0.01 && Math.abs(an.bot - 150 / H) < 0.01);
  assert.ok(an.legTopL < an.valley && an.legTopR > an.valley);
  assert.equal(P.classify('someone', an), 'legged');
  const g = P.geomOf(an); assert.ok(g.legH > 0.3 && g.legH < 0.4 && g.D0 > g.legH && g.stride >= 0.2);
});
await t('analysis_rejects_blobs_merged_legs_and_tiny_gaps', () => {
  const W = 100, H = 120;
  const blob = P.analyseAlpha(mask(W, H, (x, y) => ((x - 50) / 40) ** 2 + ((y - 70) / 40) ** 2 <= 1), W, H); assert.ok(!blob.legs); assert.equal(P.classify('x_blob', blob), 'waddle');
  const slime = P.analyseAlpha(mask(W, H, (x, y) => y > 40 && y < 110 && x > 8 && x < 92), W, H); assert.ok(!slime.legs); assert.equal(P.classify('x_slime', slime), 'hop', 'a wide solid base hops');
  const one = P.analyseAlpha(mask(W, H, (x, y) => y > 10 && y < 110 && x > 40 && x < 60), W, H); assert.ok(!one.legs);
  assert.equal(P.analyseAlpha(new Uint8Array(W * H), W, H).ok, false);
});
await t('analysis_ignores_a_third_run_such_as_a_cart_wheel', () => {
  const W = 120, H = 160, a = mask(W, H, (x, y) => (y >= 10 && y < 100 && x >= 50 && x < 90) || (y >= 100 && y < 150 && ((x >= 52 && x < 68) || (x >= 72 && x < 88))) || (y >= 120 && y < 150 && x >= 10 && x < 24));
  const an = P.analyseAlpha(a, W, H); assert.ok(an.legs, an.reason); assert.ok(an.valley > 0.55 && an.valley < 0.68, 'valley between the two LEGS, not the wheel: ' + an.valley);
});
await t('the_gait_table_wins_and_the_policy_defaults_to_puppet', () => {
  assert.equal(P.classify('bedpan_slime', null), 'hop'); assert.equal(P.classify('gurney_foot', { ok: true, legs: true }), 'roll'); assert.equal(P.classify('suture_wasp', null), 'flap'); assert.equal(P.classify('leech_jar', null), 'waddle');
  assert.equal(P.classify('the_resident_l2', { ok: true, legs: false, bottomFill: 0.1 }), 'legged', 'Level 2 shares the Level 1 entry');
  assert.equal(P.classify('unknown', null), null);
  for (const [id, e] of Object.entries(GAITS)) { assert.ok(GAIT_KINDS.includes(e.gait), id); if (e.split) assert.ok(e.split.hip > 0.4 && e.split.hip < 0.95 && e.split.valley > 0.2 && e.split.valley < 0.8, 'split of ' + id); }
  assert.equal(wantsPuppet('marrow'), true); assert.equal(wantsPuppet('anything'), true);
  assert.ok(gaitEntry('the_resident_l2') === GAITS.the_resident);
  assert.equal(P.prepare({ width: 0, height: 0 }, 'marrow', 1), null, 'no pixels (node): the caller keeps the old walk');
});
await t('actor_table_and_art_meta_agree_and_ids_exist', () => {
  const man = JSON.parse(readFileSync(root + 'assets/ward/manifest.json', 'utf8')), meta = JSON.parse(readFileSync(new URL('../tools/graftwork_art_meta.json', import.meta.url).pathname, 'utf8'));
  for (const id of Object.keys(GAITS)) assert.ok(man.actors[id], 'gait table id ' + id + ' is in the manifest');
  for (const [id, v] of Object.entries(PUPPET_PREF)) { assert.ok(man.actors[id], id); if (meta[id] && meta[id].puppet !== undefined) assert.equal(meta[id].puppet, v, 'meta puppet flag of ' + id); }
  for (const [id, m] of Object.entries(meta)) if (m.puppet !== undefined) assert.equal(PUPPET_PREF[id], m.puppet, 'the art meta flag for ' + id + ' must match data/gaits.js PUPPET_PREF');
});
await t('lab_and_game_are_wired_to_the_puppet', () => {
  const js = readFileSync(root + 'lab/anim.js', 'utf8'), iso = readFileSync(root + 'ui/ward_iso.js', 'utf8'), ca = readFileSync(root + 'ui/combat_art.js', 'utf8');
  for (const w of ['Source: Puppet walk', 'Leg split', 'Leg swing', "'Lift'", "'Bob'", "'Sway'", "'Lean'", 'foot slide', 'plantL', "source: Q.get('source') || 'puppet'", 'gaitRows', 'PUP.infoOf']) assert.ok(js.includes(w), 'lab: ' + w);
  for (const w of ['PUP.walkPuppet(', 'PUP.drawLegged(', 'PUP.prepare(', 'wantsPuppet(', "r.pm"]) assert.ok(iso.includes(w), 'ward_iso: ' + w);
  assert.ok(ca.length > 0);
  for (const [name, s] of [['puppet.js', readFileSync(root + 'ui/puppet.js', 'utf8')], ['gaits.js', readFileSync(root + 'data/gaits.js', 'utf8')], ['anim.js', js]]) assert.ok(!/[—–]/.test(s), 'dash in ' + name);
});
console.log(n + ' puppet checks passed');
