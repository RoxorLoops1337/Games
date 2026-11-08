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
const geom = { D0: 0.414, legH: 0.234, pu: 0.18, H: 1 }; // a hero: visible leg 23 percent of the figure, 18 percent tucked under the garment
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

await t('side_names_follow_the_character_not_the_screen_and_the_weapon_is_in_the_right_arm', async () => {
  const R = await import('../graftwork/ui/rig.js');
  assert.equal(R.sideName('L'), 'R'); assert.equal(R.sideName('R'), 'L'); assert.equal(R.sideName('x'), 'x');
  const bone = (n) => R.HUMANOID.bones.find((b) => b.n === n);
  // the figure is seen from the front: the screen-left bones are the character's RIGHT ones, and the weapon belongs to the right hand
  assert.ok(bone('handL').x <= 0 || bone('armL_up').x < 0, 'the L bones are on the screen-left side');
  assert.equal(bone('weapon').p, 'handL', 'the saw is in the character\'s right hand: the bone on the screen-left arm (named L by screen side)');
  assert.ok(bone('weapon').z > bone('armL_up').z, 'the weapon is drawn in front of its arm');
  const lab = readFileSync(root + 'lab/anim.js', 'utf8');
  assert.ok(/sideName/.test(lab) && /SN\(/.test(lab), 'the lab shows the character\'s own sides');
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
  assert.ok(S >= 0.2 && S <= T.strideMax + 1e-9, 'a sane stride ' + S);
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
      maxRot = Math.max(maxRot, Math.abs(leg.rot)); maxSlide = Math.max(maxSlide, Math.abs(leg.dx)); assert.ok(leg.se >= 0.5 - 1e-9 && leg.se <= 1.12 + 1e-9, 'the hidden extension stretches at most 12 percent: ' + leg.se); assert.ok(leg.ss >= 0.85 - 1e-9 && leg.ss <= 1.08 + 1e-9, 'the shin changes at most 15 percent down and 8 up: ' + leg.ss);
    }
  }
  assert.ok(maxRot <= T.swing * Math.PI / 180 + 1e-9, 'rotation limit ' + maxRot);
  assert.ok(maxSlide < 0.04, 'the leg part stays on its hip (never slides off it to reach the foot), widest slide ' + maxSlide);
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

// ---- garment, tuck, cadence (the legs come from UNDER the apron; the cloth follows the legs) ----
const nurse = { D0: 0.357, legH: 0.177, pu: 0.18, H: 1 }; // a short visible leg under a long skirt
await t('tuck_extends_the_geometry_and_the_actor_override_wins', () => {
  const an = { ok: true, legs: true, top: 0.1, bot: 0.95, hip: 0.74 }, H = 0.85, legH = (0.95 - 0.74) / H;
  const g = P.geomOf(an); assert.ok(Math.abs(g.pu - P.TUNE.tuck) < 1e-12 && g.pu >= 0.14 && g.pu <= 0.22, 'default tuck 14 to 22 percent of the figure: ' + g.pu);
  assert.ok(Math.abs(g.D0 - (legH + g.pu)) < 1e-12, 'the pivot is at the TOP of the extension: D0 = visible leg + tuck');
  assert.ok(Math.abs(P.geomOf(an, { ...P.TUNE, tuck: 0.3 }).D0 - (legH + 0.3)) < 1e-12);
  assert.ok(P.tuneFor('orderly').tuck < P.TUNE.tuck && P.tuneFor('marrow') === P.TUNE, 'data/gaits.js tuck overrides per actor, others use the global tune');
  assert.equal(P.tuneFor('the_resident_l2').tuck, GAITS.the_resident.tuck, 'Level 2 shares the entry');
});
await t('legs_stretch_only_in_the_hidden_part_and_the_foot_still_lands_exactly', () => {
  let maxSe = 0, minSe = 9, maxSs = 0, minSs = 9, slide = 0; const o = { x: 0, y: 0 };
  for (const g of [geom, nurse]) for (let ph = 0; ph < 4; ph += 0.01) {
    P.walkPuppet(ph, 1, 'legged', T, pose, g);
    for (const side of ['L', 'R']) { const L = side === 'L' ? pose.legL : pose.legR; maxSe = Math.max(maxSe, L.se); minSe = Math.min(minSe, L.se); maxSs = Math.max(maxSs, L.ss); minSs = Math.min(minSs, L.ss); slide = Math.max(slide, Math.abs(L.dx));
      P.footPoint(pose, side, g, o); const fx = side === 'L' ? pose.footLx : pose.footRx, fy = side === 'L' ? pose.footLy : pose.footRy; assert.ok(Math.abs(o.x - fx) < 1e-9 && Math.abs(o.y - (g.D0 - fy)) < 1e-9, 'sole on the target'); }
  }
  assert.ok(maxSe <= 1.12 + 1e-9 && maxSe > 1.0, 'the extension stretches up to 12 percent, got ' + maxSe); assert.ok(minSe < 0.8 && minSe >= 0.5 - 1e-9, 'and takes the squash of a lifted foot: ' + minSe);
  assert.ok(maxSs <= 1.08 + 1e-9 && minSs >= 0.85 - 1e-9, 'the shin changes a little, the boot never (drawn unscaled): ' + [minSs, maxSs]);
  assert.ok(slide < 0.04, 'even a short leg never slides off its hip to reach the foot: ' + slide);
});
await t('garment_sways_with_a_lag_stays_bounded_and_is_still_at_rest', () => {
  let mx = 0, mdy = 0, lo = 9, hi = -9; const hems = [];
  for (let ph = 0; ph < 4; ph += 0.01) { at(ph); mx = Math.max(mx, Math.abs(pose.hem)); mdy = Math.max(mdy, Math.abs(pose.hemDy)); lo = Math.min(lo, pose.hemS); hi = Math.max(hi, pose.hemS); hems.push(pose.hem); }
  assert.ok(mx <= P.SWAY_MAX && mx > 0.05, 'shear bounded and visible: ' + mx); assert.ok(mdy <= P.HEM_DY_MAX, 'vertical lag bounded: ' + mdy); assert.ok(lo > 0.85 && hi < 1.1, 'the band stretch stays small: ' + [lo, hi]);
  assert.ok(Math.max(...hems) - Math.min(...hems) > 0.1, 'it swings each step');
  at(1.3, 0); assert.ok(pose.hem === 0 && pose.hemS === 1 && pose.hemDy === 0, 'no sway while standing');
  const rigid = { ...T, garment: 0 }; P.walkPuppet(1.3, 1, 'legged', rigid, pose, geom); assert.ok(pose.hem === 0 && pose.hemS === 1, 'garment 0 is rigid cloth');
  // lag: the hem follows the legs a little later (cloth by sine lag): the zero crossings of the hem come after those of the leg spread
  const spread = (ph) => { at(ph); return pose.footLx - pose.footRx; }; let cross = (f) => { for (let ph = 0.05; ph < 2; ph += 0.001) if (f(ph - 0.001) < 0 && f(ph) >= 0) return ph; return -1; };
  const cs = cross(spread), ch = cross((ph) => { at(ph); return pose.hem + 0.04; }); assert.ok(cs > 0 && ch > 0 && ch !== cs, 'the hem has its own phase (it lags the legs): ' + [cs, ch]);
  P.walkPuppet(0.7, 1, 'legged', T, pose, geom); const a = pose.hem; P.walkPuppet(0.7, 1, 'hop', T, pose); assert.equal(pose.hem, 0, 'body gaits have no hem'); assert.ok(Number.isFinite(a));
});
await t('cadence_is_about_3_steps_a_second_at_the_normal_ward_pace_and_the_fast_pace_is_quicker', async () => {
  const W = await import('../graftwork/ui/ward.js'), ISO = await import('../graftwork/ui/ward_iso.js'), cell = Math.hypot(ISO.TW / 2, ISO.TH / 2); // one room = one cell step in world px
  const H = 0.88 * 44; // the hero: 44 px tall, figure about 88 percent of it
  for (const g of [geom, nurse]) {
    const S2 = P.strideOf(g, T), n = P.cadence(cell / W.PACE.normal.step, S2, H), f = P.cadence(cell / W.PACE.fast.step, S2, H);
    assert.ok(S2 <= T.strideMax + 1e-9 && S2 >= 0.2, 'stride ' + S2);
    if (g === geom) { assert.ok(n >= 2.5 && n <= 3.4, 'hero cadence at Normal: ' + n.toFixed(2) + ' steps/s'); assert.ok(f > n * 1.4 && f < 6, 'Fast is clearly quicker: ' + f.toFixed(2)); }
    else assert.ok(S2 < P.strideOf(geom, T), 'a shorter leg takes a shorter step (higher cadence for the same speed)');
  }
  assert.ok(W.PACE.normal.step >= 0.9 && W.PACE.fast.step < W.PACE.normal.step * 0.7, 'the pace table');
});

// ---- real pixels: legs run under the hem (needs Chromium; skipped when it is missing) ----
await t('legs_run_under_a_skirt_hem_with_no_transparent_gap_at_any_swing', async () => {
  let chromium = null; const { createRequire } = await import('node:module'), req = createRequire(import.meta.url); for (const m of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { chromium = req(m).chromium; break; } catch (e) { /* try the next */ } }
  if (!chromium) { console.log('skip: playwright missing'); return; }
  const http = await import('node:http'), fs = await import('node:fs'), path = await import('node:path'), repo = path.resolve(root, '..');
  const srv = http.createServer((q, r) => { const f = path.join(repo, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : 'text/html' }); r.end(d); } }); });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok)); const port = srv.address().port; let br = null;
  try {
    try { br = await chromium.launch(); } catch (e) { console.log('skip: no chromium'); return; }
    const pg = await br.newPage(); await pg.goto(`http://127.0.0.1:${port}/graftwork/design/README.md`);
    const res = await pg.evaluate(async () => {
      const PUP = await import('/graftwork/ui/puppet.js');
      // a synthetic skirted figure: head and torso, a wide skirt, then two thin legs under it (the legs are NARROWER than the hem, like the real sprites)
      const W = 200, Hh = 300, c = document.createElement('canvas'); c.width = W; c.height = Hh; const x = c.getContext('2d');
      x.fillStyle = '#c33'; x.fillRect(70, 10, 60, 60); x.fillRect(60, 70, 80, 110); x.beginPath(); x.moveTo(60, 180); x.lineTo(30, 235); x.lineTo(170, 235); x.lineTo(140, 180); x.fill(); // head, torso, skirt (hem at 235)
      x.fillStyle = '#365'; x.fillRect(78, 236, 16, 54); x.fillRect(106, 236, 16, 54); x.fillStyle = '#222'; x.fillRect(74, 282, 24, 10); x.fillRect(102, 282, 24, 10); // legs and boots
      const alphaOf = (g, w, h) => { const d = g.getImageData(0, 0, w, h).data, a = new Uint8Array(w * h); for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3]; return a; };
      const out = { worst: { cover: 0, gap: 0, poke: 0, pokeN: 0 }, parts: false, ext: 0 }, tune = Object.assign({}, PUP.TUNE, { swing: 40 }), id = 'synthetic_skirt_figure';
      const e = PUP.prepare(c, id, 1, tune); const parts = PUP.partsOf(e, 1, tune); out.parts = !!parts; if (!parts) return out; out.ext = parts.ext; out.hung = parts.hung;
      const geom = PUP.geomFor ? PUP.geomFor(e, tune) : e.geom, s = 1, Hd = geom.H * Hh, vw = 400, vh = 400, ox = 100, oy = 290, mkc = () => { const k = document.createElement('canvas'); k.width = vw; k.height = vh; return k; };
      const empty = { c: document.createElement('canvas'), x: 0, y: 0, w: 0.001, h: 0.001 }; empty.c.width = empty.c.height = 1;
      for (let ph = 0; ph < 4; ph += 0.05) {
        const pose = PUP.newPose(); PUP.walkPuppet(ph, 1, 'legged', tune, pose, geom);
        const draw = (Pp) => { const k = mkc(), g = k.getContext('2d'); g.translate(150, 340); PUP.drawLegged(g, Pp, pose, s, ox, oy, W, Hh, Hd); return alphaOf(g, vw, vh); };
        const legs = draw({ ...parts, upper: empty, band: null }), up = draw({ ...parts, legL: empty, legR: empty }), all = draw(parts);
        // the lowest row of the upper body (the hem) in this pose
        let hemRow = -1; for (let y = vh - 1; y >= 0 && hemRow < 0; y--) for (let q = 0; q < vw; q++) if (up[y * vw + q] > 40) { hemRow = y; break; }
        // the first row where a leg shows
        let legTop = -1; for (let y = 0; y < vh && legTop < 0; y++) for (let q = 0; q < vw; q++) if (legs[y * vw + q] > 40) { legTop = y; break; }
        out.worst.cover = Math.max(out.worst.cover, hemRow - legTop); // rows the legs run up under the hem (must stay positive and large)
        out.coverMin = Math.min(out.coverMin === undefined ? 1e9 : out.coverMin, hemRow - legTop);
        // a gap = a leg that is not attached to the garment: the opaque pixels of the whole figure must form ONE 4-connected piece (floaty legs are separate pieces)
        let gap = 0; { const seen = new Uint8Array(vw * vh), st = []; let comps = 0;
          for (let i = 0; i < vw * vh; i++) if (all[i] > 128 && !seen[i]) { comps++; seen[i] = 1; st.push(i);
            while (st.length) { const j = st.pop(), jx = j % vw, jy = (j - jx) / vw; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = jx + dx, ny = jy + dy; if (nx < 0 || ny < 0 || nx >= vw || ny >= vh) continue; const k = ny * vw + nx; if (all[k] > 128 && !seen[k]) { seen[k] = 1; st.push(k); } } } }
          gap = comps - 1; if (gap > 0 && !out.bad) { const k2 = mkc(), g2 = k2.getContext('2d'); g2.fillStyle = '#2c6b3f'; g2.fillRect(0, 0, vw, vh); g2.translate(150, 340); PUP.drawLegged(g2, parts, pose, s, ox, oy, W, Hh, Hd); out.img = k2.toDataURL(); } if (gap > 0 && !out.bad) out.bad = { ph, gap, se: [pose.legL.se, pose.legR.se], dx: [pose.legL.dx, pose.legR.dx], rot: [pose.legL.rot, pose.legR.rot], lift: [pose.footLy, pose.footRy] }; }
        out.worst.gap = Math.max(out.worst.gap, gap);
        // hidden under the cloth: leg pixels above the hem row that the garment does NOT cover (they would poke out beside it)
        let poke = 0, tot = 0; for (let y = 0; y < hemRow; y++) for (let q = 0; q < vw; q++) if (legs[y * vw + q] > 40) { tot++; if (up[y * vw + q] <= 40) poke++; }
        out.worst.poke = Math.max(out.worst.poke, poke); out.worst.pokeN = Math.max(out.worst.pokeN, tot);
      }
      return out;
    });
    if (res.img && process.env.DUMP) fs.writeFileSync(process.env.DUMP, Buffer.from(res.img.split(',')[1], 'base64'));
    assert.ok(res.parts, 'the parts of the synthetic figure were built');
    assert.equal(res.worst.gap, 0, 'no leg detached from the garment at any swing (the figure is one piece): ' + res.worst.gap + ' extra pieces ' + JSON.stringify(res.bad));
    assert.ok(res.coverMin >= 2, 'at every swing the legs run up under the hem (the part above the hem is clipped away, only its margin shows): ' + res.coverMin);
    assert.ok(res.worst.pokeN > 100 && res.worst.poke <= 0.02 * res.worst.pokeN, 'the hidden part stays under the cloth: ' + res.worst.poke + ' of ' + res.worst.pokeN + ' px show beside it');
    assert.ok(res.hung, 'the skirt is detected as a garment hanging over the legs'); assert.ok(res.ext > 20, 'the legs were extended upward: ' + res.ext + ' rows');
  } finally { if (br) await br.close(); srv.close(); }
});
await t('lab_has_the_tuck_garment_and_outline_controls_and_the_hem_no_longer_fades_over_a_garment', () => {
  const js = readFileSync(root + 'lab/anim.js', 'utf8'), pj = readFileSync(root + 'ui/puppet.js', 'utf8');
  for (const w of ["'Tuck/overlap'", "'Garment sway'", "'Leg outlines'", "'Stride cap'", 'PUP.DEBUG.outlines']) assert.ok(js.includes(w), 'lab: ' + w);
  assert.ok(/hung \? 0\.005 : 0\.025/.test(pj) && /if \(!hung && upper\)/.test(pj), 'the feather is kept only where the legs are bare');
  for (const f of ['ui/ward.js', 'data/gaits.js', 'lab/anim.js']) assert.ok(!/[—–]/.test(readFileSync(root + f, 'utf8')), 'dash in ' + f);
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
