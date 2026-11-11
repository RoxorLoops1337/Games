// GRAFTWORK painted character rigs (assets/rigs + ui/rig.js + ui/rigs.js, the rig preview of ui/preview.js; design/ART_MODULAR.md section 7,
// design/ANIMATOR_GUIDE.md section 6). What is guarded:
//   the manifest      valid, every atlas file there with the size it claims, every part rect inside its atlas and apart from the others, the bones
//                     a tree on the humanoid skeleton, every bone with its own part or empty on purpose, the figure as tall as its standing sprite
//   the walk          feet alternate (the screen-left foot plants first), never both in the air; a planted sole stands still in the WORLD at the
//                     game's speed, level and along both floor diagonals; reach by hidden stretch within limits; body lowest after contact,
//                     highest at passing; arms against the legs; cloth small, late and zero at rest; one-bone limbs stay rigid
//   the layers        far limbs before the torso, near limbs after it, the garment over both thighs, Marrow's saw in the character's RIGHT
//                     hand and in front, the hem over the hip joints in every frame
//   the game          preview off: nothing under assets/rigs is ever asked for and the actor is drawn as before; preview on: the manifest, then
//                     one atlas of the character on screen, the puppet until it is decoded, then the rig on the same feet and the same height
//   the lab           (Chromium, skipped when missing) the Rig lab page offers every rig of the manifest, shows the one chosen beside the puppet and the
//                     standing sprite, and runs at the game's pace table
//   battles           a fight with the preview on never asks for a rig
//   real pixels       (Chromium, skipped when missing) every shipped rig is ONE connected figure at every frame of the walk and of the idle
//   the build tool    byte-identical twice and equal to the committed files (skipped without Pillow or without the raw sheets)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fakeCtx, makeApp, frames, canvasCalls } from './graftwork_lib.mjs';
import { withChromium, labVisit, rigLimbEnds } from './graftwork_browser_lib.mjs';
const R = await import('../graftwork/ui/rig.js');
const { createRigs, rigs } = await import('../graftwork/ui/rigs.js');
const { previewOn, PREVIEW_DEFAULT } = await import('../graftwork/ui/preview.js');
const { RIG_GAITS, rigGait } = await import('../graftwork/data/gaits.js');
const { PACE } = await import('../graftwork/ui/ward.js');
const ISO = await import('../graftwork/ui/ward_iso.js');
const { assets } = await import('../graftwork/ui/assets.js');

const root = new URL('../graftwork/', import.meta.url).pathname, repo = path.resolve(root, '..');
const read = (f) => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
const MAN = read('assets/rigs/manifest.json'), WARD = read('assets/ward/manifest.json');
const IDS = Object.keys(MAN.rigs), NINE = ['marrow', 'wick', 'odile', 'candy_striper', 'knitter', 'night_nurse', 'npc_nurse', 'npc_patient', 'npc_porter'];
const SKELETON = R.HUMANOID.bones.filter((b) => b.n !== 'weapon'); // the painted rigs hang the prop on a hand, not on a bone of its own
const RIGS = Object.fromEntries(IDS.map((id) => [id, R.makeRig(id, MAN.rigs[id])]));
const HEADINGS = [[1, 0], [0.886, 0.463], [0.886, -0.463]]; // level, and the two floor diagonals the Ward walks (2:1 diamond)
const T = R.RIG_TUNE;
let n = 0;
const t = async (name, fn) => { try { await fn(); n++; console.log('ok', name); } catch (e) { console.error('FAIL', name, '\n', e.stack); process.exitCode = 1; } };
const angle = (m) => Math.atan2(m[1], m[0]);
function webpSize(file) {
  const b = fs.readFileSync(file); assert.equal(b.toString('ascii', 0, 4), 'RIFF', file); assert.equal(b.toString('ascii', 8, 12), 'WEBP', file);
  const tag = b.toString('ascii', 12, 16);
  if (tag === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3), alpha: !!(b[20] & 0x10) };
  if (tag === 'VP8L') { const v = b.readUInt32LE(21); return { w: 1 + (v & 0x3fff), h: 1 + ((v >>> 14) & 0x3fff), alpha: true }; }
  return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff, alpha: false };
}

// ---------------------------------------------------------------- the manifest
await t('manifest_names_the_nine_rigs_and_their_files', () => {
  assert.equal(MAN.version, 1); assert.deepEqual([...IDS].sort(), [...NINE].sort(), 'the nine characters that have a part sheet');
  let bytes = fs.statSync(path.join(root, 'assets/rigs/manifest.json')).size;
  for (const id of IDS) {
    const e = MAN.rigs[id], act = WARD.actors[id]; assert.ok(act, id + ' is a Ward actor');
    for (const [key, k] of [['file2x', 1], ['file1x', 2]]) {
      const f = path.join(root, 'assets/rigs', e[key]); assert.ok(fs.existsSync(f), 'missing ' + e[key]); bytes += fs.statSync(f).size;
      const s = webpSize(f); assert.equal(s.w, e.w / k, e[key] + ' width'); assert.equal(s.h, e.h / k, e[key] + ' height'); assert.ok(s.alpha, e[key] + ' has alpha');
    }
    assert.equal(typeof e.ship, 'boolean'); if (!e.ship) assert.ok(e.note && e.note.length > 30, id + ': a rig that does not ship says why');
    assert.ok(/SCREEN (LEFT|RIGHT)/.test(e.side), id + ': the side mapping is written down');
    // the figure at rest is the standing sprite's figure: same feet line, same height (the rig is drawn with the sprite's own contact point and scale)
    const sb = act.bbox, H = sb[3] - sb[1];
    assert.ok(Math.abs(e.height - H) <= 0.02 * H, `${id}: height ${e.height} vs standing ${H}`);
    assert.ok(Math.abs(e.bbox[3] - sb[3]) <= 1.5, `${id}: feet line ${e.bbox[3]} vs ${sb[3]}`); assert.ok(Math.abs(e.bbox[1] - sb[1]) <= 0.02 * H + 1, `${id}: top ${e.bbox[1]} vs ${sb[1]}`);
    assert.ok(e.foot.length === 3 && Math.abs(e.foot[1] - sb[3]) <= 1.5 && e.foot[0] > sb[0] && e.foot[0] < sb[2], id + ': the contact point is under the figure');
  }
  assert.equal(fs.readdirSync(path.join(root, 'assets/rigs')).length, IDS.length * 2 + 1, 'nothing else in assets/rigs');
  assert.ok(bytes < 600 * 1024, 'assets/rigs stays small: ' + (bytes / 1024).toFixed(0) + ' KB');
  console.log('   assets/rigs: ' + (bytes / 1024).toFixed(0) + ' KB, ' + IDS.filter((id) => MAN.rigs[id].ship).length + ' of ' + IDS.length + ' rigs ship');
});
await t('every_part_rect_is_inside_its_atlas_and_apart_from_the_others', () => {
  for (const id of IDS) {
    const e = MAN.rigs[id], seen = new Set();
    assert.ok(e.parts.length >= 9, id + ' has parts');
    for (const p of e.parts) {
      assert.ok(!seen.has(p.n), id + ': part twice ' + p.n); seen.add(p.n);
      const [x, y, w, h] = p.rect; for (const v of p.rect) assert.ok(Number.isInteger(v) && v % 2 === 0, `${id}.${p.n}: rects are even (whole px in the @1x file)`);
      assert.ok(x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= e.w && y + h <= e.h, `${id}.${p.n} rect inside the atlas`);
      assert.ok(p.px > -4 && p.py > -4 && p.px < w + 4 && p.py < h + 4, `${id}.${p.n}: the pivot is on the piece`);
    }
    for (const a of e.parts) for (const b of e.parts) if (a !== b) assert.ok(a.rect[0] + a.rect[2] <= b.rect[0] || b.rect[0] + b.rect[2] <= a.rect[0] || a.rect[1] + a.rect[3] <= b.rect[1] || b.rect[1] + b.rect[3] <= a.rect[1], `${id}: ${a.n} and ${b.n} overlap in the atlas`);
  }
});
await t('bones_form_the_humanoid_tree_and_each_has_a_part_or_is_empty_on_purpose', () => {
  for (const id of IDS) {
    const e = MAN.rigs[id], names = e.bones.map((b) => b.n);
    assert.deepEqual([...names].sort(), SKELETON.map((b) => b.n).sort(), id + ': exactly the bones of the humanoid skeleton');
    e.bones.forEach((b, i) => {
      assert.equal(b.p, SKELETON.find((q) => q.n === b.n).p, `${id}.${b.n} parent`);
      if (b.p === null) assert.equal(i, 0, 'one root'); else assert.ok(names.indexOf(b.p) < i, 'a parent comes first: a tree');
      const own = e.parts.find((p) => p.n === b.n);
      if (own) { assert.equal(own.bone, b.n, `${id}: part ${b.n} hangs on its bone`); assert.ok(!b.empty, `${id}.${b.n} has a part and is not empty`); assert.equal(own.x, b.x); assert.equal(own.y, b.y); }
      else assert.equal(b.empty, true, `${id}.${b.n}: no part of its own, so it is marked empty on purpose`);
    });
    for (const p of e.parts) assert.ok(p.bone === 'root' || names.includes(p.bone), `${id}.${p.n} hangs on a bone`);
    for (const g of e.garment) assert.ok(e.parts.find((p) => p.n === g && p.hem !== undefined), `${id}: garment ${g}`);
    if (e.prop) { const p = e.parts.find((q) => q.n === e.prop.part); assert.ok(p && p.bone === 'hand' + e.prop.hand, `${id}: the prop hangs on the hand it names`); }
    // a limb painted in one piece is one bone: its lower bones carry nothing
    for (const lim of e.rigid || []) { const s = lim.slice(-1), lo = lim.startsWith('leg') ? ['leg' + s + '_lo'] : ['arm' + s + '_lo']; for (const b of lo) assert.ok(e.bones.find((q) => q.n === b).empty, `${id}: ${b} of the one-piece ${lim} is empty`); }
  }
});

// ---------------------------------------------------------------- layers and sides
await t('near_limbs_draw_after_the_torso_far_limbs_before_it_and_the_garment_over_both_thighs', () => {
  assert.equal(R.sideName('L'), 'R', 'bone ids are by screen side: the screen-left limb is the character\'s right');
  for (const id of IDS) {
    const e = MAN.rigs[id], at = (nm) => e.parts.findIndex((p) => p.n === nm), torso = at('torso'); assert.ok(torso >= 0, id + ' has a torso');
    for (const b of ['armR_up', 'armR_lo', 'handR', 'legR_up', 'legR_lo', 'footR']) if (at(b) >= 0) assert.ok(at(b) < torso, `${id}: far ${b} draws before the torso (behind the body)`);
    for (const b of ['armL_up', 'armL_lo', 'handL', 'legL_up', 'legL_lo', 'footL']) if (at(b) >= 0) assert.ok(at(b) > torso, `${id}: near ${b} draws after the torso (in front of the body)`);
    for (const g of e.garment) for (const b of ['legL_up', 'legR_up', 'legL_lo', 'legR_lo']) if (at(b) >= 0) assert.ok(at(g) > at(b), `${id}: ${g} is drawn over ${b}: legs come out from under the hem`);
    assert.ok(at('head') > torso, id + ': the head is over the torso');
    // the near leg and arm really are on the screen left of the far ones
    const bx = (nm) => e.bones.find((b) => b.n === nm).x;
    assert.ok(bx('footL') < bx('footR') && bx('armL_up') < bx('armR_up'), id + ': L is the screen-left side');
  }
  for (const id of ['marrow', 'wick', 'odile']) assert.ok(MAN.rigs[id].garment.length >= 1, id + ' wears a garment over the thighs');
});
await t('marrow_holds_the_saw_in_the_characters_right_hand_in_front', () => {
  const e = MAN.rigs.marrow, saw = e.parts.find((p) => p.n === 'saw'), at = (nm) => e.parts.findIndex((p) => p.n === nm);
  assert.deepEqual(e.prop, { part: 'saw', hand: 'L' }); assert.equal(saw.bone, 'handL'); assert.equal(R.sideName(e.prop.hand), 'R', 'the character\'s RIGHT hand');
  assert.ok(e.bones.find((b) => b.n === 'handL').x < e.bones.find((b) => b.n === 'torso').x, 'that hand is on the screen left');
  assert.ok(at('saw') > at('torso') && at('saw') > at('apron') && at('saw') > at('tunic'), 'the saw is in front of the body and the apron');
  assert.ok(at('armL_lo') > at('saw'), 'the gripping hand is over the handle');
  // it stays in that hand through the walk: the handle never leaves the fist by more than a few units
  const rig = RIGS.marrow;
  for (let i = 0; i < 80; i++) { R.poseRig(rig, { ph: i / 20, w: 1, t: 0, ux: 1, uy: 0 }); const h = rig.B.handL.m, p = rig.parts.find((q) => q.n === 'saw').m; assert.ok(Math.hypot(p[4] - h[4], p[5] - h[5]) < 8, 'the saw rides on the hand'); }
});

// ---------------------------------------------------------------- the walk
const contactRun = (rig, ux, uy, visit, steps = 800, span = 4) => { // walks `span` steps; visit(ph, side, leg, contact world x, y)
  const c = { x: 0, y: 0, bx: 0, by: 0 }, S = rig.stride * rig.H;
  for (let i = 0; i <= steps; i++) { const ph = i / steps * span; R.poseRig(rig, { ph, w: 1, t: 0, ux, uy }); for (const s of ['L', 'R']) { const L = rig.legs[s]; R.footContact(rig, s, c); visit(ph, s, L, c.x + ph * S * ux, c.y + ph * S * uy, c); } }
};
await t('feet_alternate_left_plant_then_right_plant', () => {
  for (const id of IDS) {
    const rig = RIGS[id], plants = [], was = { L: true, R: true }; let both = 0, none = 0, frames = 0;
    for (let i = 0; i <= 1600; i++) {
      const ph = i / 400; R.poseRig(rig, { ph, w: 1, t: 0, ux: 1, uy: 0 }); frames++;
      const I = rig.info; if (I.plantL && I.plantR) both++; if (!I.plantL && !I.plantR) none++;
      for (const s of ['L', 'R']) { const on = rig.legs[s].plant; if (on && !was[s]) plants.push(s); was[s] = on; }
      assert.equal(I.lead, Math.floor(ph + 1e-9) % 2 === 0 ? 'L' : 'R', 'the lead foot alternates every step');
    }
    assert.deepEqual(plants, ['R', 'L', 'R', 'L'], id + ': one foot plants, then the other'); // four steps; L is down at phase 0 (the first contact), so the next plant is R
    assert.equal(none, 0, id + ': never both feet in the air'); assert.ok(both / frames > 0.04 && both / frames < 0.45, id + ': a short double support (' + (both / frames).toFixed(2) + ')');
    // at the first contact the screen-left foot is the forward one; one step later the other
    R.poseRig(rig, { ph: 0, w: 1, t: 0 }); assert.ok(rig.legs.L.off > 0 && rig.legs.R.off < 0, id + ': L leads at contact 0');
    R.poseRig(rig, { ph: 1, w: 1, t: 0 }); assert.ok(rig.legs.R.off > 0 && rig.legs.L.off < 0, id + ': R leads at contact 1');
    // the swing foot is lifted, the planted one is not
    R.poseRig(rig, { ph: 0.75, w: 1, t: 0 }); assert.ok(rig.legs.R.lift > 0.02 * rig.H && rig.legs.L.lift === 0, id + ': the swinging foot clears the floor');
  }
});
await t('a_planted_sole_stands_still_in_the_world_at_game_speed_on_every_heading', () => {
  // game speed: one room (TW/2, TH/2) in PACE.normal.step seconds, the hero 44 world px tall on a 256 canvas, 60 frames a second.
  // Along the screen x a planted sole is exact on every heading. Along the screen y it follows RIG_TUNE.depth of the floor's travel (rig.js DEPTH):
  // with depth 1 it is exact on the floor diagonals too (the solver is exact), with the shipped depth what is left is bounded and stated here.
  const speed = Math.hypot(ISO.TW / 2, ISO.TH / 2) / PACE.normal.step, s0 = 44 / 256, depth0 = T.depth;
  const walk = (rig, ux, uy) => {
    const S = rig.stride * rig.H, c = { x: 0, y: 0, bx: 0, by: 0 }, seen = {}; let dx = 0, dy = 0, off = 0;
    for (let f = 0; f < 60 * 4; f++) {
      const dist = speed * f / 60 / s0, ph = dist / S; R.poseRig(rig, { ph, w: 1, t: f / 60, ux, uy });
      for (const s of ['L', 'R']) {
        const L = rig.legs[s]; if (!L.plant) continue; R.footContact(rig, s, c);
        off = Math.max(off, Math.hypot(c.x - c.bx, c.y - c.by)); // what is drawn is where the pose put it
        const wx = c.x + dist * ux, wy = c.y + dist * uy, k = s + Math.floor(ph / 2 + (s === 'L' ? 0 : 0.5)) + (L.phi > 0 ? 'toe' : 'heel');
        if (seen[k]) { dx = Math.max(dx, Math.abs(wx - seen[k][0])); dy = Math.max(dy, Math.abs(wy - seen[k][1])); } else seen[k] = [wx, wy];
      }
    }
    return { dx, dy, off };
  };
  try {
    for (const id of IDS) {
      const rig = RIGS[id], S = rig.stride * rig.H;
      for (const [ux, uy] of HEADINGS) {
        T.depth = depth0; const a = walk(rig, ux, uy);
        assert.ok(a.off < 1e-6, `${id}: the drawn sole is on its floor point (${a.off})`);
        assert.ok(a.dx < 0.12, `${id} heading ${ux},${uy}: a planted sole drifts ${a.dx.toFixed(3)} units along the screen x (tolerance 0.12, about 0.05% of the height)`);
        const left = (1 - depth0) * Math.abs(uy) * 2 * rig.duty * S; // the floor's screen-y travel during one stance that the feet do not follow
        assert.ok(a.dy <= left + 0.12, `${id} heading ${ux},${uy}: screen y drift ${a.dy.toFixed(2)} of at most ${left.toFixed(2)}`);
        if (uy === 0) assert.ok(a.dy < 0.12, id + ': level walking is exact in both axes');
        T.depth = 1; const b = walk(rig, ux, uy); assert.ok(b.dx < 0.12 && b.dy < 0.12 && b.off < 1e-6, `${id} heading ${ux},${uy}: with depth 1 the planted sole stands still in both axes (${b.dx.toFixed(3)}, ${b.dy.toFixed(3)})`);
      }
      // stride and speed agree: one step of the cycle covers exactly one stride of ground, so the cadence is speed / stride
      const cad = speed / (S * s0); assert.ok(cad > 2.2 && cad < 4.4, `${id}: ${cad.toFixed(2)} steps a second at the Normal pace`);
    }
  } finally { T.depth = depth0; }
  assert.ok(depth0 >= 0.4 && depth0 <= 1, 'the feet follow at least two fifths of the floor depth (the puppet follows none)');
  for (const id of ['marrow', 'wick', 'odile']) { const cad = speed / (RIGS[id].stride * RIGS[id].H * 44 / 256); assert.ok(cad >= 2.5 && cad <= 3.9, id + ' cadence at Normal: ' + cad.toFixed(2)); }
});
await t('the_sole_stays_on_the_floor_and_the_legs_reach_by_hidden_stretch_within_limits', () => {
  for (const id of IDS) {
    const rig = RIGS[id], H = rig.H;
    for (const [ux, uy] of HEADINGS) {
      let slip = 0, shin = 1, thigh = 1, under = 0;
      contactRun(rig, ux, uy, (ph, s, L, wx, wy, c) => {
        slip = Math.max(slip, L.slip); shin = Math.max(shin, L.one ? 1 : L.k2); thigh = Math.max(thigh, L.k1);
        if (L.plant) under = Math.max(under, Math.abs(c.y - (L.cy + L.sole))); // a planted sole is on its floor line
      }, 400);
      assert.ok(under < 1e-6, `${id}: planted soles on the floor line`);
      assert.ok(shin <= T.shin + 1e-9, `${id}: the visible shin stretches at most ${T.shin} (${shin.toFixed(3)})`);
      assert.ok(thigh <= Math.max(T.thigh, T.shin + 0.06) + 1e-9, `${id}: thigh stretch ${thigh.toFixed(3)}`);
      if (uy === 0) assert.ok(slip < 0.012 * H, `${id}: on the level the hip stays in its socket (slip ${slip.toFixed(2)})`);
      else assert.ok(slip < 0.04 * H, `${id}: on a floor diagonal the hidden hip gives at most 4% of the height (${slip.toFixed(2)})`);
    }
    assert.ok(rig.stride >= 0.2 && rig.stride <= T.stride * 1.2, id + ' stride ' + rig.stride);
  }
});
await t('contact_down_passing_up_and_arms_against_the_legs', () => {
  for (const id of ['marrow', 'wick', 'odile', 'night_nurse', 'knitter']) {
    const rig = RIGS[id], down = (ph) => { R.poseRig(rig, { ph, w: 1, t: 0 }); return rig.info.down; };
    assert.ok(down(0.06) > down(0.56) && down(1.06) > down(1.56) && down(0.56) < 0.2 * down(0.06) + 1e-9, id + ': lowest just after contact, highest at passing');
    assert.ok(down(0.06) > 0.004 * rig.H && down(0.06) < 0.045 * rig.H, id + ': a drop you can see and no more');
  }
  // arms: when the screen-left leg is forward its arm is back (clockwise), and the other way round; the far arm mirrors it
  for (const id of ['marrow', 'npc_patient']) {
    const rig = RIGS[id]; R.poseRig(rig, { ph: 0, w: 0, t: 0, calm: true }); const a0 = angle(rig.B.armL_up.m), b0 = angle(rig.B.armR_up.m);
    R.poseRig(rig, { ph: 0, w: 1, t: 0 }); const aL = angle(rig.B.armL_up.m) - a0, aR = angle(rig.B.armR_up.m) - b0;
    assert.ok(rig.legs.L.off > 0 && aL > 0.02, id + ': near leg forward, near arm back');
    if (rig.arms.R > 0) assert.ok(aR < aL, id + ': the far arm goes the other way');
    R.poseRig(rig, { ph: 1, w: 1, t: 0 }); assert.ok(angle(rig.B.armL_up.m) - a0 < aL - 0.04, id + ': and forward one step later');
  }
});
await t('cloth_and_prop_follow_late_small_and_are_still_at_rest', () => {
  for (const id of IDS) {
    const rig = RIGS[id], hems = rig.parts.filter((p) => p.hem !== undefined);
    R.poseRig(rig, { ph: 0.3, w: 0, t: 1.2, calm: true }); for (const p of hems) { assert.equal(p.hx, 0, id + ': hem still at rest'); assert.equal(p.hs, 1); }
    let mx = 0;
    for (let i = 0; i < 200; i++) { R.poseRig(rig, { ph: i / 50, w: 1, t: 0 }); for (const p of hems) { mx = Math.max(mx, Math.abs(p.hx)); assert.ok(p.hs > 0.93 && p.hs <= 1.0001, id + ' hem lift'); } }
    if (hems.length) assert.ok(mx > 0.03 && mx < 0.25, id + ': hem sway bounded (' + mx.toFixed(3) + ')');
  }
  // late: the hem reaches its forward extreme after the leg does
  const rig = RIGS.wick, hem = rig.parts.find((p) => p.hem !== undefined); let bestLeg = 0, bestHem = 0, vl = -9, vh = -9;
  for (let i = 0; i < 200; i++) { const ph = i / 100; R.poseRig(rig, { ph, w: 1, t: 0 }); const sp = rig.legs.L.off - rig.legs.R.off; if (sp > vl) { vl = sp; bestLeg = ph; } if (hem.hx > vh) { vh = hem.hx; bestHem = ph; } }
  const lag = ((bestHem - bestLeg) % 2 + 2) % 2; assert.ok(lag > 0.05 && lag < 0.5, 'the hem trails the legs by a fraction of a step: ' + lag.toFixed(2));
});
await t('idle_breathes_on_planted_feet_and_reduced_motion_is_the_rest_pose', () => {
  for (const id of IDS) {
    const rig = RIGS[id], e = MAN.rigs[id], c = { x: 0, y: 0, bx: 0, by: 0 };
    R.poseRig(rig, { ph: 0, w: 0, t: 3.3, calm: true });
    for (const b of ['hips', 'torso', 'head', 'armL_up', 'armR_up']) { const m = rig.B[b].m, r = e.bones.find((q) => q.n === b); assert.ok(Math.abs(m[4] - r.x) < 1e-9 && Math.abs(m[5] - r.y) < 1e-9 && Math.abs(angle(m)) < 1e-9, `${id}.${b} rests where the manifest puts it`); }
    for (const p of rig.parts) if (['torso', 'head'].includes(p.n)) { const q = e.parts.find((x) => x.n === p.n); assert.ok(Math.abs(p.m[4] - q.x) < 1e-9 && Math.abs(p.m[5] - q.y) < 1e-9, `${id}.${p.n} part at rest`); }
    for (const s of ['L', 'R']) { R.footContact(rig, s, c); assert.ok(Math.abs(c.y - (rig.legs[s].an.y + rig.legs[s].sole)) < 1e-6, id + ': soles on their floor line at rest'); }
    let chest = 0, moved = 0, hip = 0;
    for (let i = 0; i < 120; i++) {
      R.poseRig(rig, { ph: 0, w: 0, t: i * 0.1 }); const tp = rig.parts.find((p) => p.n === 'torso');
      chest = Math.max(chest, Math.abs(tp.m[3] - 1)); hip = Math.max(hip, Math.abs(rig.B.hips.m[4] - rig.B.hips.x));
      for (const s of ['L', 'R']) { const L = rig.legs[s]; R.footContact(rig, s, c); moved = Math.max(moved, Math.hypot(c.x - c.bx, c.y - c.by), Math.abs(L.cx - L.an.x), Math.abs(L.cy - L.an.y), L.lift); } // the sole edge on its floor point, the floor point under the resting ankle
    }
    assert.ok(chest > 0.004 && chest < 0.03, id + ': the chest breathes (' + chest.toFixed(4) + ')'); assert.ok(hip > 0.3 && hip < 0.02 * rig.H, id + ': a small weight shift');
    assert.ok(moved < 1e-6, id + ': the feet do not move while idling (' + moved + ')');
  }
});
await t('per_character_feel_comes_from_the_gait_table', () => {
  assert.deepEqual(Object.keys(RIG_GAITS).sort(), ['marrow', 'odile', 'wick']); assert.equal(rigGait('npc_nurse'), null); assert.equal(rigGait('marrow'), RIG_GAITS.marrow);
  const drop = (id) => { R.poseRig(RIGS[id], { ph: 0.06, w: 1, t: 0 }); return RIGS[id].info.down / RIGS[id].H; }, lean = (id) => { R.poseRig(RIGS[id], { ph: 0.3, w: 1, t: 0 }); return RIGS[id].info.lean; };
  assert.ok(drop('marrow') > drop('wick') && drop('wick') > drop('odile'), 'Marrow heavy, Wick light, Odile glides');
  assert.ok(lean('marrow') > lean('wick') && lean('wick') > lean('odile') && lean('odile') < 0.02, 'Odile walks upright');
  assert.ok(RIGS.wick.stride < RIGS.marrow.stride, 'Wick takes shorter, quicker steps at the same speed'); assert.ok(RIGS.marrow.duty > RIGS.wick.duty, 'Marrow\'s feet stay planted longer');
  const liftOf = (id) => { let m = 0; for (let i = 0; i < 100; i++) { R.poseRig(RIGS[id], { ph: i / 50, w: 1, t: 0 }); m = Math.max(m, RIGS[id].legs.L.lift / RIGS[id].H); } return m; };
  assert.ok(liftOf('wick') > liftOf('marrow') && liftOf('marrow') > liftOf('odile'), 'Wick picks her feet up, Odile keeps them low');
});
await t('a_limb_painted_in_one_piece_is_one_bone', () => {
  let legs = 0, arms = 0;
  for (const id of IDS) {
    const rig = RIGS[id], e = MAN.rigs[id];
    for (const lim of e.rigid || []) {
      const s = lim.slice(-1);
      for (let i = 0; i < 40; i++) {
        R.poseRig(rig, { ph: i / 10, w: 1, t: 0, ux: 0.886, uy: 0.463 });
        if (lim.startsWith('leg')) { const L = rig.legs[s]; assert.ok(L.one); assert.ok(Math.abs(angle(L.kn.m) - angle(L.hip.m)) < 1e-9 && Math.abs(angle(L.an.m) - angle(L.hip.m)) < 1e-9, id + ': the whole leg turns as one'); assert.ok(L.k1 >= 0.82 - 1e-9 && L.k1 <= T.shin + 0.06 + 1e-9, id + ': it barely stretches (it carries the boot)'); legs++; }
        else { assert.ok(Math.abs(angle(rig.B['arm' + s + '_lo'].m) - angle(rig.B['arm' + s + '_up'].m)) < 1e-9, id + ': the arm does not fold'); arms++; }
      }
    }
  }
  assert.ok(legs > 0 && arms > 0, 'the sheets have one-piece legs and arms');
});
// the x offset of a garment's cloth v units below its hem line, as drawRigged draws it: the shear, or the knots of the cloth strips read linearly
const clothAt = (p, v) => { if (!p.cloth) return p.hx * v; const K = p.kn.length - 1, hh = (p.h - Math.round(p.hem * p.h)) / K, i = Math.min(K - 1, Math.max(0, Math.floor(v / hh))); return p.kn[i] + (p.kn[i + 1] - p.kn[i]) * (v / hh - i); };
await t('the_knee_never_folds_past_its_limit_and_the_swing_foot_still_clears_the_floor', () => {
  // the drawn thigh (from its pinned top) and the shin meet at no more than RIG_TUNE.knee x the shin's share of the thigh (rig.js THE KNEE; the boot's
  // roll adds a little on top), on all three headings: a short shin never folds flat under the hem. The feet are where they were, so a swinging foot
  // is as high above the floor as its lift says.
  const ax = (m, x, y) => Math.atan2(m[1] * x + m[3] * y, m[0] * x + m[2] * y), c = { x: 0, y: 0, bx: 0, by: 0 };
  let seen = 0;
  for (const id of IDS.filter((q) => MAN.rigs[q].ship)) {
    const rig = RIGS[id];
    for (const s of ['L', 'R']) {
      const L = rig.legs[s]; if (L.one) continue; const km = T.knee * rig.feel.knee * L.kr; let worst = 0, at = '';
      for (const [ux, uy] of HEADINGS) for (let i = 0; i < 96; i++) {
        const ph = i / 48; R.poseRig(rig, { ph, w: 1, t: 0, ux, uy });
        let f = ax(L.kn.m, L.an.x - L.kn.x, L.an.y - L.kn.y) - ax(L.hip.m, L.kn.x - L.hip.x, L.kn.y - L.hip.y); f = Math.abs(Math.atan2(Math.sin(f), Math.cos(f)));
        if (f > worst) { worst = f; at = ph.toFixed(2) + ' heading ' + ux + ',' + uy; }
        if (!L.plant && L.lift > 0.5 * T.lift * rig.feel.lift * rig.H) { R.footContact(rig, s, c); assert.ok(c.y < L.cy + L.sole - 0.3 * L.lift, `${id}.${s}: the swinging foot clears the floor`); seen++; }
      }
      assert.ok(worst <= km + 0.25, `${id} leg ${s}: the knee folds ${(worst * 57.3).toFixed(0)} degrees at ${at}, limit ${(km * 57.3).toFixed(0)}`);
    }
  }
  assert.ok(seen > 100, 'swinging feet were checked');
});
await t('cloth_strips_follow_the_walk_without_a_seam_and_reduced_motion_keeps_the_single_hem', () => {
  // RIG_TUNE.cloth: below its hem line a garment is strips on a chain of knots (rig.js CLOTH STRIPS). The first knot sits on the rigid hem line, the
  // cloth trails the walk and the knee by a few units at most, reduced motion (calm) draws the one shear of before, and the cost is counted.
  const g = fakeCtx(), img = { width: 1, height: 1, naturalWidth: 1 }, cost = {};
  for (const id of IDS.filter((q) => MAN.rigs[q].ship)) {
    const rig = RIGS[id], cloth = rig.parts.filter((p) => p.hem !== undefined); let most = 0;
    for (const [ux, uy] of HEADINGS) for (let i = 0; i < 48; i++) {
      R.poseRig(rig, { ph: i / 24, w: 1, t: 0, ux, uy });
      for (const p of cloth) {
        assert.ok(p.cloth && p.kn[0] === 0, id + ': the strips hang from the rigid hem line');
        const y0 = Math.round(p.hem * p.h), hh = (p.h - y0) / (p.kn.length - 1);
        for (let j = 0; j < p.kn.length; j++) { most = Math.max(most, Math.abs(p.kn[j] - p.hx * j * hh)); assert.ok(Math.abs(clothAt(p, j * hh) - p.kn[j]) < 1e-9, 'neighbouring strips share their edge'); }
      }
    }
    assert.ok(most > 0.5 && most < 0.06 * rig.H, `${id}: the cloth moves on its own, a little (${most.toFixed(2)} units)`);
    R.poseRig(rig, { ph: 0.5, w: 1, t: 0, calm: true }); for (const p of cloth) assert.equal(p.cloth, false, id + ': reduced motion: the single shear');
    const calls = (on) => { T.cloth = on; R.poseRig(rig, { ph: 0.5, w: 1, t: 0, ux: 1, uy: 0 }); const c0 = canvasCalls(); R.drawRigged(g, rig, img); return canvasCalls() - c0; };
    try { cost[id] = [calls(0), calls(1)]; } finally { T.cloth = 1; }
    assert.ok(cost[id][1] - cost[id][0] <= cloth.length * 8 * 4, id + ': the strips cost a few calls each');
  }
  console.log('   canvas calls per frame, static hem / cloth strips: ' + Object.entries(cost).map(([k, v]) => k + ' ' + v.join('/')).join(', '));
});
await t('mirroring_flips_x_only', () => {
  const rig = RIGS.marrow; R.poseRig(rig, { ph: 0.3, w: 1, t: 0 });
  const a = R.rigPlace(rig, 300, 200, 0.5, false), b = R.rigPlace(rig, 300, 200, 0.5, true);
  assert.equal(b[0], -a[0]); assert.equal(b[3], a[3]); assert.equal(a[1], 0); assert.equal(a[2], 0); assert.equal(b[1], 0); assert.equal(b[2], 0);
  for (const bn of rig.bones) { const x = bn.m[4], y = bn.m[5], ax = a[0] * x + a[4], ay = a[3] * y + a[5], bx = b[0] * x + b[4], by = b[3] * y + b[5]; assert.ok(Math.abs(ay - by) < 1e-9, 'y is untouched'); assert.ok(Math.abs((ax - 300) + (bx - 300)) < 1e-9, 'x is mirrored about the floor point'); }
  assert.ok(Math.abs(a[0] * rig.foot[0] + a[4] - 300) < 1e-9 && Math.abs(a[3] * rig.foot[1] + a[5] - 200) < 1e-9, 'the contact point stands on the floor point');
});
// is (x, y) of figure space on a cloth part (its drawn quad, the hem shear included)?
function onCloth(p, x, y, margin) {
  const m = p.m, det = m[0] * m[3] - m[1] * m[2], dx = x - m[4], dy = y - m[5]; let lx = (m[3] * dx - m[2] * dy) / det + p.px, ly = (m[0] * dy - m[1] * dx) / det + p.py;
  const y0 = Math.round(p.hem * p.h); if (ly > y0) { const v = (ly - y0) / p.hs; lx -= clothAt(p, v); ly = y0 + v; }
  return lx >= margin && lx <= p.w - margin && ly >= 0 && ly <= p.h - margin;
}
await t('the_hem_covers_the_hip_joints_in_every_frame_of_the_cycle', () => {
  for (const id of IDS) {
    const rig = RIGS[id], cloth = rig.parts.filter((p) => p.hem !== undefined); if (!cloth.length) { assert.equal(MAN.rigs[id].ship, false, id + ': a rig with no garment over its hips does not ship'); continue; }
    for (const [ux, uy] of HEADINGS) for (let i = 0; i < 96; i++) {
      R.poseRig(rig, { ph: i / 24, w: 1, t: 0, ux, uy });
      for (const s of ['L', 'R']) { const h = rig.legs[s].hip.m; assert.ok(cloth.some((p) => onCloth(p, h[4], h[5], 1)), `${id}: hip ${s} shows at phase ${(i / 24).toFixed(2)} heading ${ux},${uy}`); }
    }
    R.poseRig(rig, { ph: 0, w: 0, t: 0, calm: true }); for (const s of ['L', 'R']) { const h = rig.legs[s].hip.m; assert.ok(cloth.some((p) => onCloth(p, h[4], h[5], 3)), id + ': hip under the cloth at rest'); }
  }
});

// ---------------------------------------------------------------- the loader and the game
const tick = () => new Promise((r) => setTimeout(r, 0));
function recCtx() { // a canvas that keeps its transform and remembers where every image went
  const g = fakeCtx(), st = [], draws = []; let m = [1, 0, 0, 1, 0, 0];
  const mul = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
  g.save = () => { st.push(m); }; g.restore = () => { if (st.length) m = st.pop(); };
  g.translate = (x, y) => { m = mul(m, [1, 0, 0, 1, x, y]); }; g.scale = (x, y) => { m = mul(m, [x, 0, 0, y, 0, 0]); }; g.rotate = (r) => { m = mul(m, [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0]); };
  g.transform = (a, b, c, d, e, f) => { m = mul(m, [a, b, c, d, e, f]); };
  g.drawImage = (img, ...a) => { const [x, y, w, h] = a.length === 8 ? a.slice(4) : a; draws.push({ img, pts: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map(([px, py]) => [m[0] * px + m[2] * py + m[4], m[1] * px + m[3] * py + m[5]]) }); };
  return { g, draws };
}
const box = (draws) => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const d of draws) for (const [x, y] of d.pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } return { x0, y0, x1, y1 }; };
const REQ = [], IMGS = [];
function hook() {
  assets.reset(); rigs.reset(); ISO.resetIso(); REQ.length = 0; IMGS.length = 0;
  const mk = () => { const img = { width: 256, height: 256 }; let src = ''; Object.defineProperty(img, 'src', { get: () => src, set(v) { src = v; REQ.push(v); IMGS.push(img); const e = Object.values(MAN.rigs).find((q) => v.endsWith('/' + q.file2x)); if (e) { img.width = e.w; img.height = e.h; } } }); return img; };
  assets.fetchJson = async (url) => { REQ.push(url); return read(url); }; assets.makeImage = mk;
  rigs.fetchJson = async (url) => { REQ.push(url); return read(url); }; rigs.makeImage = mk;
}
function unhook() { assets.fetchJson = assets.makeImage = null; rigs.fetchJson = rigs.makeImage = null; assets.reset(); rigs.reset(); ISO.resetIso(); }
const settle = () => { let k = 0; for (const img of IMGS) if (!img.done) { img.done = true; img.onload(); k++; } return k; };
const rigReq = () => REQ.filter((u) => u.includes('assets/rigs'));
const newRec = (kind, id, h) => ({ kind, id, x: 400, y: 300, h, flip: 1, bob: 0, sq: 1, ph: 0, lvl: 1, alpha: 1, tilt: 0, ring: 0, stride: 0.4, cycle: true, vk: 1, ux: 1, uy: 0, t: 0, calm: false });

await t('preview_switch_is_off_by_default_and_reads_the_url_and_the_setting', () => {
  assert.deepEqual(PREVIEW_DEFAULT, { art: false, rig: false });
  assert.equal(previewOn('rig', undefined, ''), false); assert.equal(previewOn('rig', {}, ''), false); assert.equal(previewOn('rig', { previewArt: true }, ''), true);
  assert.equal(previewOn('rig', {}, '?rig=1'), true); assert.equal(previewOn('rig', {}, '?preview=1'), true); assert.equal(previewOn('rig', { previewArt: true }, '?rig=0'), false); assert.equal(previewOn('rig', {}, '?art=1'), false);
});
await t('preview_off_requests_nothing_and_draws_the_actor_as_before', async () => {
  hook();
  try {
    const { g, draws } = recCtx(), app = { frame: 1, px: 1, scale: 1, ctx: g, text() {} };
    assets.ensure(app); await tick(); assert.ok(assets.ready());
    const rec = newRec('hero', 'marrow', 44), run = { hero: 'marrow' };
    for (let i = 0; i < 4; i++) { app.frame++; ISO.drawActor(app, g, rec, run); settle(); await tick(); }
    assert.deepEqual(rigReq(), [], 'with the preview off nothing under assets/rigs is asked for'); assert.equal(rigs.state, 'idle', 'the rig loader was never touched');
    draws.length = 0; app.frame++; ISO.drawActor(app, g, rec, run);
    const sprite = draws.filter((d) => d.img.src && d.img.src.includes('actors/marrow'));
    assert.equal(sprite.length, 1, 'the standing sprite is what is drawn (the puppet cannot cut it without pixels)'); assert.equal(draws.filter((d) => d.img.src && d.img.src.includes('rigs')).length, 0);
    // a monster and a title figure the same
    const mon = newRec('monster', 'night_nurse', 30); for (let i = 0; i < 3; i++) { app.frame++; ISO.drawActor(app, g, mon, run); settle(); await tick(); }
    assert.deepEqual(rigReq(), []);
  } finally { unhook(); }
});
await t('preview_on_asks_for_the_manifest_then_one_atlas_and_stands_the_rig_on_the_same_feet_at_the_same_height', async () => {
  hook();
  try {
    const { g, draws } = recCtx(), app = { frame: 1, px: 1, scale: 1, ctx: g, text() {}, settings: { previewArt: true } };
    assets.ensure(app); await tick();
    const rec = newRec('hero', 'marrow', 44), run = { hero: 'marrow' }; rec.cycle = false; rec.vk = 0; rec.calm = true; rec.stride = 0;
    app.frame++; ISO.drawActor(app, g, rec, run); settle(); await tick(); // the sprite arrives
    assert.deepEqual(rigReq(), [], 'no sprite yet: the rig is not asked for either');
    draws.length = 0; app.frame++; ISO.drawActor(app, g, rec, run);
    assert.deepEqual(rigReq(), ['assets/rigs/manifest.json'], 'first the manifest, nothing else');
    const before = draws.filter((d) => d.img.src && d.img.src.includes('actors/marrow')); assert.equal(before.length, 1, 'still the figure of today while the rig is on its way');
    const shadow0 = { ...rec.shadow };
    await tick(); draws.length = 0; app.frame++; ISO.drawActor(app, g, rec, run);
    assert.deepEqual(rigReq(), ['assets/rigs/manifest.json', 'assets/rigs/marrow@2x.webp'], 'then the atlas of the character on screen: one file, one size');
    assert.equal(draws.filter((d) => d.img.src.includes('rigs')).length, 0, 'not decoded yet: no part is drawn');
    settle(); draws.length = 0; app.frame++; ISO.drawActor(app, g, rec, run);
    const parts = draws.filter((d) => d.img.src.includes('rigs/marrow')); assert.equal(parts.length, MAN.rigs.marrow.parts.length + MAN.rigs.marrow.garment.length, 'every part once, cloth in two slices');
    assert.equal(draws.filter((d) => d.img.src.includes('actors/marrow')).length, 0, 'the rig replaces the sprite');
    assert.deepEqual({ ...rec.shadow }, shadow0, 'the same shadow in the same place: no pop');
    // same feet, same height: where the standing sprite's figure was, the rig's figure is (the sprite canvas is 256 wide, drawn sz * scale / 256 per px)
    const d = WARD.actors.marrow, s = 44 * d.scale / d.h, b0 = before[0].pts, x0 = Math.min(...b0.map((p) => p[0])), y0 = Math.min(...b0.map((p) => p[1]));
    const fig = { top: y0 + d.bbox[1] * s, bot: y0 + d.bbox[3] * s, left: x0 + d.bbox[0] * s, right: x0 + d.bbox[2] * s }, rb = box(parts);
    assert.ok(Math.abs(fig.bot - 300) < 1e-6, 'the sprite stands on the floor point'); assert.ok(Math.abs(rb.y1 - fig.bot) <= 2.5 * s, `feet on the same line: ${rb.y1.toFixed(2)} vs ${fig.bot.toFixed(2)}`);
    assert.ok(Math.abs(rb.y0 - fig.top) <= 4 * s, `same height: top ${rb.y0.toFixed(2)} vs ${fig.top.toFixed(2)}`); assert.ok(rb.x0 > fig.left - 12 * s && rb.x1 < fig.right + 12 * s, 'and the same place');
    // walking: the stride the gait uses is the rig's own, so the step phase follows the distance and the planted foot holds
    const S = { t: 0, fx: { burst() {} } }; rec.calm = false; let gt = null;
    for (let i = 0; i < 90; i++) { S.t = i / 60; rec.x = 400 + i * 0.8; gt = ISO.gait('rigtest', rec, rec.x, rec.y, 1 / 60, false, 44, S, 0); app.frame++; ISO.drawActor(app, g, rec, run); }
    assert.ok(Math.abs(gt.sl - RIGS.marrow.stride * RIGS.marrow.H * s / 44) < 1e-9, 'the step length of the gait is the rig\'s stride'); assert.ok(rec.cycle && rec.vk > 0.9 && rec.ux > 0.99);
    assert.equal(rec.bob, 0); assert.equal(rec.sq, 1); assert.equal(rec.tilt, 0); // nothing of the hop is left on a rig
    // a second hero frame asks for nothing more; a character without a rig asks for nothing
    const k = REQ.length; app.frame++; ISO.drawActor(app, g, rec, run); const slime = newRec('monster', 'bedpan_slime', 30); for (let i = 0; i < 3; i++) { app.frame++; ISO.drawActor(app, g, slime, run); settle(); await tick(); }
    assert.deepEqual(rigReq(), ['assets/rigs/manifest.json', 'assets/rigs/marrow@2x.webp']); assert.ok(REQ.length >= k);
  } finally { unhook(); }
});
await t('a_rig_that_does_not_ship_is_never_asked_for_by_the_game_and_the_loader_is_lazy', async () => {
  const off = IDS.filter((id) => !MAN.rigs[id].ship); assert.ok(off.length >= 1, 'this set has rigs that stay in the lab');
  const req = [], imgs = [], L = createRigs({ base: 'assets/rigs/', fetchJson: async (u) => { req.push(u); return read(u); }, makeImage: () => { const img = { width: 192, height: 192 }; let src = ''; Object.defineProperty(img, 'src', { get: () => src, set(v) { src = v; req.push(v); imgs.push(img); } }); return img; } });
  assert.deepEqual(req, [], 'creating the loader asks for nothing'); assert.equal(L.entry('marrow'), null); assert.deepEqual(L.ids(), []);
  assert.equal(L.get(off[0], { px: 1 }), null); await tick(); assert.deepEqual(L.ids(), IDS);
  assert.equal(L.get(off[0], { px: 1 }), null); assert.deepEqual(req, ['assets/rigs/manifest.json'], 'the game never downloads a rig that does not ship');
  assert.equal(L.get(off[0], { px: 1 }, true), null); assert.equal(req.length, 2, 'the lab may'); imgs[0].onload(); const got = L.get(off[0], { px: 1 }, true); assert.ok(got && got.rig.id === off[0] && got.img === imgs[0]);
  assert.equal(L.get('wick', { px: 0.5 }), null); assert.ok(req[2].endsWith('wick@1x.webp'), 'a small backing store asks for the @1x atlas'); imgs[1].onerror(); assert.equal(L.get('wick', { px: 0.5 }), null); assert.ok(req[3].endsWith('wick@2x.webp'), 'a failed file falls back to the other size');
  assert.equal(L.get('nobody', { px: 1 }), null); assert.equal(req.length, 4);
  // one atlas per character: when the wanted size changes (a quality tier), the file that is in stays, nothing new is asked for and the rig stays a rig
  assert.equal(L.get('marrow', { px: 1 }), null); assert.ok(req[4].endsWith('marrow@2x.webp')); assert.equal(L.get('marrow', { px: 0.5 }), null, 'still loading: the other size is not started'); assert.equal(req.length, 5);
  imgs[3].onload(); assert.ok(L.get('marrow', { px: 1 })); const low = L.get('marrow', { px: 0.5 }); assert.ok(low && low.img === imgs[3], 'the decoded @2x atlas is drawn on'); assert.equal(req.length, 5);
  const dead = createRigs({ fetchJson: async () => { throw new Error('404'); } }); dead.get('marrow', {}); await tick(); assert.equal(dead.state, 'none'); assert.equal(dead.get('marrow', {}), null, 'no manifest: the puppet for good');
  assert.equal(createRigs().get('marrow', {}), null, 'headless: no fetch, no Image, no request');
});
await t('with_the_preview_on_the_labs_pm_switch_still_shows_the_puppet_and_the_hop_and_asks_for_no_rig', async () => {
  hook();
  try {
    const { g, draws } = recCtx(), app = { frame: 1, px: 1, scale: 1, ctx: g, text() {}, settings: { previewArt: true } };
    assets.ensure(app); await tick(); const run = { hero: 'marrow' };
    for (const pm of ['puppet', 'off']) {
      const rec = newRec('hero', 'marrow', 44); rec.pm = pm;
      for (let i = 0; i < 5; i++) { app.frame++; ISO.drawActor(app, g, rec, run); settle(); await tick(); }
      assert.deepEqual(rigReq(), [], `pm ${pm}: the preview is on and the rig is still not asked for`); assert.equal(rigs.state, 'idle');
      draws.length = 0; app.frame++; ISO.drawActor(app, g, rec, run);
      assert.equal(draws.filter((d) => d.img.src && d.img.src.includes('actors/marrow')).length, 1, `pm ${pm}: the standing sprite is what is drawn`); assert.equal(draws.filter((d) => d.img.src && d.img.src.includes('rigs')).length, 0);
    }
  } finally { unhook(); }
});
await t('a_fight_with_the_preview_on_never_asks_for_a_rig_and_still_paints_the_heroes_and_the_enemy', async () => {
  hook();
  try {
    const RUN = await import('../graftwork/engine/run.js'), combat = (await import('../graftwork/ui/combat.js')).default, audio = await import('../graftwork/ui/audio.js');
    const run = RUN.newRun({ hero: 'marrow', seed: 'rigfight' }); run.phase = 'combat'; run.pending = { kind: 'combat', fightKind: 'normal', enemies: ['night_nurse'] }; // marrow and night_nurse both have a rig
    const app = await makeApp({ run, audio, flow: { RUN, route() {}, openDeck() {}, openSettings() {} } }); Object.defineProperty(app, 'settings', { value: { previewArt: true }, configurable: true }); // app.settings is a getter over meta.settings since the painted UI work
    app.register('combat', combat); app.go('combat', { run });
    for (let i = 0; i < 6; i++) { frames(app, 20); settle(); await tick(); }
    assert.ok(REQ.some((u) => u.includes('actors/marrow')) && REQ.some((u) => u.includes('actors/night_nurse')), 'the painted hero and enemy are asked for: the fight draws them');
    assert.deepEqual(rigReq(), [], 'and no rig is'); assert.equal(rigs.state, 'idle', 'the rig loader was never touched');
  } finally { unhook(); }
});

// ---------------------------------------------------------------- the lab (a real page in Chromium; skipped when it is missing)
await t('the_rig_lab_offers_every_rig_shows_it_beside_the_puppet_and_the_standing_sprite_and_runs_at_the_games_pace', async () => {
  await withChromium(async ({ br, base }) => {
    const v = await labVisit(br, base, '?scene=rig&who=marrow&anim=walk', `window.__drawn.has('STANDING sprite')`);
    try {
      let S = await v.read();
      assert.deepEqual(v.errors, [], 'the page raised nothing'); assert.equal(S.banner, '', 'and shows no error');
      assert.ok(v.requests.some((q) => q.url === '/graftwork/assets/rigs/manifest.json' && q.status === 200) && v.requests.some((q) => /^\/graftwork\/assets\/rigs\/marrow@[12]x\.webp$/.test(q.url) && q.status === 200), 'it loads the rig manifest and the atlas of the character');
      // every rig of the manifest is offered; the ones that do not ship say so
      assert.deepEqual(S.groups, ['Painted rigs', 'No art']);
      const offered = new Map(S.options.flat().map(([val, text]) => [val, text]));
      for (const id of IDS) { assert.ok(offered.has(id), id + ' is offered'); assert.equal(/\(lab only\)/.test(offered.get(id)), !MAN.rigs[id].ship, id + (MAN.rigs[id].ship ? ' ships, so it is not marked' : ' stays in the lab, so it says so')); }
      assert.ok(offered.has('placeholder'), 'and the capsule placeholder');
      for (const w of ['Walk speed', 'Slow', 'Game', 'Fast', 'Heading on the floor', 'Bones', 'Floor marks', 'Onion skin', 'Flip', 'Idle', 'Walk']) assert.ok(S.ctl.includes(w), 'lab control: ' + w);
      // the three figures of the comparison, on one canvas, and the readout of the rig from the manifest
      for (const w of ['RIG: Marrow (ships in the preview)', 'PUPPET (the game today)', 'STANDING sprite']) assert.ok(S.drawn.includes(w), 'drawn: ' + w);
      const e = MAN.rigs.marrow; assert.match(S.readout, new RegExp(`^rig Marrow: ${e.parts.length} parts, atlas ${e.w} x ${e.h}`), 'the readout is the manifest\'s');
      assert.match(S.plant, /sole slide/, 'the sole slide is measured');
      // the pace: the lab's speeds are the game's pace table
      const hyp = Math.hypot(ISO.TW / 2, ISO.TH / 2);
      assert.match(S.readout, new RegExp(`pace game: ${Math.round(hyp / PACE.normal.step)} world px/s`), 'Game = the hero at the Normal pace'); assert.ok(S.titles.Game.includes(PACE.normal.step + ' s'), S.titles.Game);
      await v.page.click('button:text-is("Fast")'); await v.until(`document.getElementById('read').innerText.includes('pace fast')`); S = await v.read();
      assert.match(S.readout, new RegExp(`pace fast: ${Math.round(hyp / PACE.fast.step)} world px/s`), 'Fast = the Fast walk setting');
    } finally { await v.close(); }
    const lab = await labVisit(br, base, '?scene=rig&who=candy_striper&anim=walk', `window.__drawn.has('STANDING sprite')`);
    try {
      const S = await lab.read(), e = MAN.rigs.candy_striper; assert.equal(e.ship, false);
      assert.ok(S.drawn.includes('RIG: Candy Striper (lab only, the game keeps the puppet)'), 'a rig that does not ship is drawn by the lab'); assert.ok(S.readout.includes('ships no: ' + e.note), 'with the reason from the manifest');
      assert.ok(lab.requests.some((q) => /\/candy_striper@[12]x\.webp$/.test(q.url) && q.status === 200), 'the lab may ask for it, the game never does'); assert.deepEqual(lab.errors, []);
    } finally { await lab.close(); }
  });
});

// ---------------------------------------------------------------- real pixels (needs Chromium; skipped when it is missing)
await t('every_shipped_rig_is_one_connected_figure_at_every_frame', async () => {
  await withChromium(async ({ br, base }) => {
    const pg = await br.newPage(); await pg.goto(`${base}/graftwork/design/README.md`);
    const res = await pg.evaluate(async (heads) => {
      const RIG = await import('/graftwork/ui/rig.js'), man = await (await fetch('/graftwork/assets/rigs/manifest.json')).json(), out = {};
      for (const id of Object.keys(man.rigs)) {
        const e = man.rigs[id]; if (!e.ship) continue;
        const img = new Image(); img.src = '/graftwork/assets/rigs/' + e.file2x; await img.decode();
        const rig = RIG.makeRig(id, e), W = 420, H = 420, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d', { willReadFrequently: true });
        const o = { pieces: 0, at: '', hipShown: 0 };
        const pieces = (st) => { // connected pieces of the drawn figure (specks under 30 px do not count)
          RIG.poseRig(rig, st); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H); const m = RIG.rigPlace(rig, 210, 340, 1, false); g.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]); RIG.drawRigged(g, rig, img, { contact: false });
          const d = g.getImageData(0, 0, W, H).data, seen = new Uint8Array(W * H), stack = []; let big = 0;
          for (let i = 0; i < W * H; i++) { if (seen[i] || d[i * 4 + 3] <= 60) continue; let area = 0; seen[i] = 1; stack.push(i);
            while (stack.length) { const q = stack.pop(), x = q % W; area++; for (const k of [x > 0 ? q - 1 : -1, x < W - 1 ? q + 1 : -1, q - W, q + W]) if (k >= 0 && k < W * H && !seen[k] && d[k * 4 + 3] > 60) { seen[k] = 1; stack.push(k); } }
            if (area >= 30) big++; }
          return big;
        };
        for (const [ux, uy] of heads) for (let i = 0; i < 32; i++) { const ph = i / 16, k = pieces({ ph, w: 1, t: 0, ux, uy }); if (k > o.pieces) { o.pieces = k; o.at = 'walk ' + ph.toFixed(2) + ' heading ' + ux + ',' + uy; } }
        for (let i = 0; i < 8; i++) { const k = pieces({ ph: 0, w: 0, t: i * 0.6, ux: 1, uy: 0 }); if (k > o.pieces) { o.pieces = k; o.at = 'idle ' + i; } }
        out[id] = o;
      }
      return out;
    }, HEADINGS);
    const ids = Object.keys(res); assert.ok(ids.length >= 5 && ids.includes('marrow'), 'shipped rigs were drawn');
    for (const id of ids) assert.equal(res[id].pieces, 1, `${id}: the figure falls apart into ${res[id].pieces} pieces at ${res[id].at} (a limb or a prop floats)`);
    console.log('   one piece at 104 poses each: ' + ids.join(', '));
  });
});

// ---------------------------------------------------------------- long hidden limbs (needs Chromium; skipped when it is missing)
await t('no_leg_shows_its_cut_end_in_any_pose_what_is_drawn_over_it_covers_it', async () => {
  await withChromium(async ({ br, base }) => {
    const pg = await br.newPage(); await pg.goto(`${base}/graftwork/design/README.md`);
    const ship = IDS.filter((id) => MAN.rigs[id].ship), res = await rigLimbEnds(pg, { base: '/graftwork/assets/rigs/' }, ship, HEADINGS), bad = [];
    const arms = [];
    for (const id of ship) for (const L of res[id]) if (L.fails) (L.n.startsWith('leg') ? bad : arms).push(`${id}.${L.n}: ${L.px} end px outside in ${L.fails} of 104 poses (worst ${L.worst} px at ${L.at})`);
    console.log('   shoulder caps beside the body (not asserted): ' + (arms.length ? arms.length + ' arms' : 'none'));
    assert.deepEqual(bad, [], 'a leg shows its cut end where nothing covers it');
    // a full tube that begins inside the body: at rest each thigh reaches RISE of its own length above the hip joint (a leg painted in one piece
    // RISE_ONE of the whole leg), the floor the build tool's fit starts from (tools/graftwork_rig_build.py RISE, RISE_ONE)
    const short = [];
    for (const id of ship) for (const L of res[id]) if (L.n.startsWith('leg') && L.short) short.push(`${id}.${L.n}: ${L.above.toFixed(1)} units above the hip, needs ${L.rise.toFixed(1)}`);
    assert.deepEqual(short, [], 'a thigh that stops at its hip joint (its tube must run on up into the pelvis)');
    console.log('   leg ends hidden in 104 poses each: ' + ship.join(', '));
  });
});

// ---------------------------------------------------------------- the build tool (needs Pillow and the raw sheets, which are not in the repo)
await t('the_build_tool_is_deterministic_and_the_committed_rigs_are_its_output', () => {
  const tool = path.join(repo, 'tools/graftwork_rig_build.py'), meta = JSON.parse(fs.readFileSync(path.join(repo, 'tools/graftwork_rig_meta.json'), 'utf8'));
  assert.ok(fs.existsSync(tool)); assert.deepEqual(Object.keys(meta.rigs), IDS, 'the meta file and the manifest list the same rigs in the same order');
  for (const id of IDS) { assert.equal(!!meta.rigs[id].ship, MAN.rigs[id].ship); assert.equal(meta.rigs[id].side, MAN.rigs[id].side); assert.deepEqual(meta.rigs[id].parts.map((p) => p.part), MAN.rigs[id].parts.map((p) => p.n), id + ': parts back to front as in the meta'); }
  const raw = process.env.GRAFTWORK_RIG_RAW || '/tmp/claude-0/art/shop/art_raw/shop';
  if (!fs.existsSync(path.join(raw, 'batch1/rig.marrow.png'))) { console.log('skip: raw part sheets not on this machine (set GRAFTWORK_RIG_RAW)'); return; }
  if (spawnSync('python3', ['-I', '-c', 'import PIL'], { stdio: 'ignore' }).status !== 0) { console.log('skip: Pillow missing'); return; }
  const dirs = [0, 1].map((i) => fs.mkdtempSync(path.join(os.tmpdir(), 'gw_rig' + i + '_')));
  try {
    for (const d of dirs) execFileSync('python3', ['-I', tool, '--raw', raw, '--out', d], { stdio: 'ignore' });
    const files = fs.readdirSync(dirs[0]).sort(); assert.deepEqual(files, fs.readdirSync(path.join(root, 'assets/rigs')).sort(), 'the tool writes exactly the committed file set');
    for (const f of files) {
      const a = fs.readFileSync(path.join(dirs[0], f)); assert.ok(a.equals(fs.readFileSync(path.join(dirs[1], f))), 'two builds differ: ' + f);
      assert.ok(a.equals(fs.readFileSync(path.join(root, 'assets/rigs', f))), 'the committed ' + f + ' is not what the tool builds from the meta file: run tools/graftwork_rig_build.py');
    }
  } finally { for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }); }
});

console.log(process.exitCode ? 'FAILED' : `${n} rig checks passed`);
