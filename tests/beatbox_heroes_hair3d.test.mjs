// 3D hair, hats and facial hair (beatbox_heroes/park3d/char_hair.js, char_body.js): a numeric fit audit of every hair style x every hat (none included) on the three body types,
// plus facial hair, and hanging hair and hats posed through the clips. The audit itself lives in tools/beatbox_heroes/hair_audit_lib.mjs (it also draws the contact sheets:
// node tools/beatbox_heroes/hair_gallery.mjs /tmp/chars_head). Everything runs in node, on the CPU geometry.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ok, done } from './beatbox_heroes_lib.mjs';
import { loadChars, audit, tris } from '../tools/beatbox_heroes/hair_audit_lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url)), CAT = createRequire(import.meta.url)(path.join(HERE, '..', 'beatbox_heroes', 'catalog.js'));
const watchdog = setTimeout(() => { console.error('FAIL: hair3d suite hung'); process.exit(1); }, 240000);
const M = await loadChars(), ch = M.createCharacter({ quality: 'high' }, CAT.DEFAULT_LOOK);
const HAIRS = CAT.HAIR_STYLES.map((h) => h.id), HATS = CAT.HATS.map((h) => h.id), BODIES = ['boy', 'girl', 'neutral'], SKINS = ['#f2c4ae', '#c68b5e', '#5e3823', '#fde7d9', '#2b1b16'];
const COVER = M.HAT_COVER;
// per slot triangle caps (lit triangles; the budget governor in characters.js keeps the whole character under TRI_BUDGET by dropping outlines)
const CAP = { hair: 380, hat: 240, facial: 170 };
ok(HATS.every((h) => COVER[h] !== undefined), 'every catalog hat has a HAT_COVER entry');
ok(HAIRS.length >= 25 && HATS.length >= 25, 'catalog lists the hair styles and hats (' + HAIRS.length + ' x ' + HATS.length + ')');

// a cheap fingerprint of the head, hair, hat and facial geometry: bodies share the head, so most combos repeat exactly and the audit result is reused
const fp = () => { const T = tris(ch, ['head', 'hair', 'hat', 'facial']); let a = T.length, b = 0; for (let i = 0; i < T.length; i++) { a = (a * 31 + Math.round(T[i] * 1e4)) | 0; b += T[i] * ((i % 7) + 1); } return a + ':' + b.toFixed(3); };
const seen = new Map(), bad = {}, flag = (k, tag) => { (bad[k] = bad[k] || []).push(tag); };
const check = (r, tag, look) => {
  const cover = COVER[look.hat] || 0;
  if (r.floatHair.length) flag('hair piece floats off the head', tag + ' ' + JSON.stringify(r.floatHair[0]));
  if (r.floatHat.length) flag('hat piece floats', tag + ' ' + JSON.stringify(r.floatHat[0]));
  if (r.floatFacial.length) flag('facial hair floats off the face', tag + ' ' + JSON.stringify(r.floatFacial[0]));
  if (r.uncovered > 0.02) flag('scalp shows through the hair', tag + ' ' + r.uncovered.toFixed(3) + ' ' + JSON.stringify(r.uncoveredAt[0]));
  if (cover >= 0.7 && r.poke > 0.004) flag('hair pokes through a covering hat', tag + ' ' + r.poke.toFixed(3) + ' ' + JSON.stringify(r.pokeAt));
  if (r.hatBuried > 0.1) flag('band hat buried in the hair', tag + ' ' + r.hatBuried.toFixed(2));
  if (r.rimGap > 0.015) flag('hat floats over a visible gap at its edge', tag + ' ' + r.rimGap.toFixed(3) + ' ' + JSON.stringify(r.rimGapAt));
  if (r.hatSink > 0.01) flag('hat sinks into the forehead', tag + ' ' + r.hatSink.toFixed(3));
  if (r.hatEyes) flag('hat covers the eyes or brows', tag + ' ' + r.hatEyes);
  if (r.inverted) flag('inverted piece', tag + ' ' + JSON.stringify(r.invertedAt[0]));
  if (r.zfight) flag('hair coplanar with the scalp (z-fighting)', tag + ' ' + JSON.stringify(r.zfightAt && r.zfightAt[0]));
  for (const k in CAP) if (r.tris[k] > CAP[k]) flag(k + ' over its triangle cap', tag + ' ' + r.tris[k] + ' > ' + CAP[k]);
};

// ---- 1. every hair x every hat on the three bodies (skin tones and ages vary; they must not change the fit)
let combos = 0, audits = 0;
for (const [bi, body] of BODIES.entries()) for (const [hi, hs] of HAIRS.entries()) for (const [ti, hat] of HATS.entries()) {
  const look = { body, skin: SKINS[(hi + ti + bi) % SKINS.length], age: (hi + ti) % 4 === 0 ? 'old' : undefined, hair: { style: hs, color: '#3b2418' }, hat: { id: hat, color: '#e63946' }, top: { id: 'tee' } };
  ch.setLook(look); combos++;
  const key = fp(); let r = seen.get(key); if (!r) { r = audit(ch, M); seen.set(key, r); audits++; }
  check(r, body + ' ' + hs + '/' + hat, { hat });
}
ok(combos === BODIES.length * HAIRS.length * HATS.length, 'audited every hair x hat x body (' + combos + ' looks, ' + audits + ' distinct geometries)');

// ---- 2. facial hair with and without hair and hats
for (const f of CAT.FACIAL.map((x) => x.id)) for (const hs of ['bald', 'crop', 'long', 'afro', 'mohawk']) for (const hat of ['none', 'cap', 'hood', 'headband']) {
  ch.setLook({ body: 'boy', facial: f, hair: { style: hs }, hat: { id: hat }, glasses: { id: 'round' } }); check(audit(ch, M), 'facial ' + f + ' ' + hs + '/' + hat, { hat });
}

// ---- 3. hats and hanging hair stay attached through the clips (posed in the head bone frame: springs show up as motion against the head)
const CLIP_HAIRS = ['long', 'bob', 'mullet', 'ponytail', 'pigtails', 'braids', 'locs', 'twists', 'buns', 'dreadbun', 'afro', 'crop'], CLIP_HATS = ['none', 'cap', 'beanie', 'hood', 'durag', 'headphonehat'], CLIPS = ['idle', 'walk', 'run', 'dance', 'beatbox', 'battle', 'cheer', 'sit', 'hit'];
let posed = 0;
for (const hs of CLIP_HAIRS) for (const hat of CLIP_HATS) for (const c of CLIPS) {
  ch.setLook({ body: 'girl', hair: { style: hs }, hat: { id: hat }, top: { id: 'tee' } }); ch.play(c, { speed: c === 'run' ? 4 : 1.4, bpm: 100 });
  let t = 0; for (let i = 0; i < 75; i++) { t += 1 / 60; ch.update(1 / 60, t); }
  const r = audit(ch, M, { posed: true }), tag = 'posed ' + c + ' ' + hs + '/' + hat; posed++;
  if (r.floatHair.length || r.floatHat.length) flag('piece comes off the head during a clip', tag + ' ' + JSON.stringify(r.floatHair.concat(r.floatHat)[0]));
  if (r.uncovered > 0.02) flag('scalp shows during a clip', tag + ' ' + r.uncovered.toFixed(3));
  if ((COVER[hat] || 0) >= 0.7 && r.poke > 0.006) flag('hair pokes through the hat during a clip', tag + ' ' + r.poke.toFixed(3) + ' ' + JSON.stringify(r.pokeAt));
}
ok(posed === CLIP_HAIRS.length * CLIP_HATS.length * CLIPS.length, 'posed audits ran (' + posed + ')');

// ---- 4. long hair falls over a backpack (char_gear.js 'backpack' sits on the upper back), not through it: no hair vertex inside the pack's body
{
  let inside = 0, n = 0;
  for (const hs of ['long', 'bob', 'mullet', 'ponytail', 'locs']) for (const body of BODIES) {
    ch.setLook({ body, hair: { style: hs }, acc: { back: { id: 'backpack', color: '#3a5fcd' } }, top: { id: 'hoodie' } });
    const A = tris(ch, ['acc']), H = tris(ch, ['hair']), bb = [[1e9, 1e9, 1e9], [-1e9, -1e9, -1e9]];
    for (let i = 0; i < A.length; i += 3) if (A[i + 2] < -0.12 && Math.abs(A[i]) < 0.15) for (let k = 0; k < 3; k++) { bb[0][k] = Math.min(bb[0][k], A[i + k]); bb[1][k] = Math.max(bb[1][k], A[i + k]); }
    n++; for (let i = 0; i < H.length; i += 3) if (H[i] > bb[0][0] + 0.01 && H[i] < bb[1][0] - 0.01 && H[i + 1] > bb[0][1] + 0.01 && H[i + 1] < bb[1][1] - 0.01 && H[i + 2] > bb[0][2] + 0.01 && H[i + 2] < bb[1][2] - 0.01) { inside++; flag('hair passes through a backpack', hs + ' ' + body); break; }
  }
  ok(n === 15, 'backpack looks built (' + n + ')'); void inside;
}

for (const k of ['hair passes through a backpack', 'hair piece floats off the head', 'hat piece floats', 'facial hair floats off the face', 'scalp shows through the hair', 'hair pokes through a covering hat', 'band hat buried in the hair', 'hat floats over a visible gap at its edge', 'hat sinks into the forehead', 'hat covers the eyes or brows', 'inverted piece', 'hair coplanar with the scalp (z-fighting)', 'hair over its triangle cap', 'hat over its triangle cap', 'facial over its triangle cap', 'piece comes off the head during a clip', 'scalp shows during a clip', 'hair pokes through the hat during a clip'])
  ok(!bad[k], k + (bad[k] ? ': ' + bad[k].length + ' cases, e.g. ' + bad[k].slice(0, 4).join(' | ') : ''));
for (const k in bad) if (!/floats|scalp|pokes|buried|gap|sinks|eyes|inverted|coplanar|cap|clip|backpack/.test(k)) ok(false, k);
clearTimeout(watchdog);
done();
