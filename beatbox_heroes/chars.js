// BEATBOX HEROES -- chars.js
// BBH.Chars: the paper-doll character renderer (public API, composition order, caches, portraits, thumbs).
//
// SCRIPT LOAD ORDER (plain <script> tags, after pix.js, font.js, catalog.js):
//     chars_body.js   drawing kit, skeleton / poses, skin, face, marks, facial hair
//     chars_hair.js   hair styles (back + front layers) and hats
//     chars_gear.js   tops, bottoms, shoes, arms (skin + sleeves + hands)
//     chars_acc.js    glasses and accessories (neck, ears, back, hand, wrist)
//     chars.js        this file: composition + API (must be last)
// Each file guards its own dependencies with require() in node, so loading just chars.js also works there.
(function (root) {
  'use strict';
  const BBH = root.BBH || (root.BBH = {});
  if (typeof require !== 'undefined') {
    if (!BBH.Pix) require('./pix.js');
    if (!BBH.CATALOG) require('./catalog.js');
    if (!BBH.CharsKit) require('./chars_body.js');
    if (!BBH.CharsHair) require('./chars_hair.js');
    if (!BBH.CharsGear) require('./chars_gear.js');
    if (!BBH.CharsAcc) require('./chars_acc.js');
  }
  const { Pix, PAL, ramp, mix, C } = BBH;
  const Kit = BBH.CharsKit, CAT = BBH.CATALOG, Hair = BBH.CharsHair, Gear = BBH.CharsGear, Acc = BBH.CharsAcc;
  const W = 58, H = 85;                     // sprite grid (design units are 44x64, rasterised natively)
  const PW = 96, PH = 140;                  // portrait grid: about 2.2x design, cropped to 72x72
  const GR = Kit.GR;

  /* ---------------------------------------------------------------- look utils */
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const HEX = /^#[0-9a-fA-F]{6}$/;
  const col = (v, d) => (typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : d);
  const ids = (arr) => arr.map((x) => x.id);
  const pickId = (v, arr, d) => (typeof v === 'string' && ids(arr).indexOf(v) >= 0 ? v : d);

  // Fill every missing field from DEFAULT_LOOK, validate ids and colours, return a fresh clone.
  function fix(look) {
    const D = CAT.DEFAULT_LOOK, L = look || {};
    const o = {};
    o.name = typeof L.name === 'string' && L.name ? L.name.slice(0, 16) : D.name;
    o.body = pickId(L.body, CAT.BODIES, D.body);
    o.skin = col(L.skin, D.skin);
    const hr = L.hair || {};
    o.hair = { style: pickId(hr.style, CAT.HAIR_STYLES, D.hair.style), color: col(hr.color, D.hair.color), tip: hr.tip ? col(hr.tip, null) : null };
    const ey = L.eyes || {};
    o.eyes = { style: pickId(ey.style, CAT.EYE_STYLES, D.eyes.style), color: col(ey.color, D.eyes.color) };
    o.brows = pickId(L.brows, CAT.BROWS, D.brows);
    o.facial = pickId(L.facial, CAT.FACIAL, D.facial);
    o.marks = Array.isArray(L.marks) ? L.marks.filter((m, i, a) => ids(CAT.MARKS).indexOf(m) >= 0 && a.indexOf(m) === i) : [];
    const it = (g, arr, d, k2) => {
      const s = L[g] || {}, r = { id: pickId(s.id, arr, d.id), color: col(s.color, d.color) };
      if (k2) r.color2 = col(s.color2, d.color2);
      return r;
    };
    o.top = it('top', CAT.TOPS, D.top, true);
    o.bottom = it('bottom', CAT.BOTTOMS, D.bottom);
    o.shoes = it('shoes', CAT.SHOES, D.shoes);
    o.hat = it('hat', CAT.HATS, D.hat);
    o.glasses = it('glasses', CAT.GLASSES, D.glasses);
    o.acc = {};
    const A = L.acc || {};
    for (const slot of CAT.ACC_SLOTS) {
      const list = CAT.ACCESSORIES.filter((a2) => a2.slot === slot), s2 = A[slot], d = D.acc[slot];
      if (!s2 || typeof s2 !== 'object') { o.acc[slot] = { id: d.id, color: d.color }; continue; }
      o.acc[slot] = { id: ids(list).indexOf(s2.id) >= 0 ? s2.id : 'none_' + slot, color: col(s2.color, d.color) };
    }
    return o;
  }

  // a nice random look (isUnlocked(group,id) filters choices; free picker colours are allowed only if the fantasy skins are)
  function random(rng, isUnlocked) {
    rng = rng || BBH.rng(Date.now() & 0xffffff);
    const can = (g, id) => (isUnlocked ? !!isUnlocked(g, id) : true);
    const pick = (g, arr) => { const ok = arr.filter((x) => can(g, x.id)); const list = ok.length ? ok : arr.filter((x) => x.unlock && x.unlock.t === 'free'); return rng.pick(list.length ? list : arr); };
    const L = clone(CAT.DEFAULT_LOOK);
    L.name = 'Hero';
    L.body = pick('body', CAT.BODIES).id;
    const skins = CAT.SKINS.concat(CAT.SKINS_FANTASY.filter((s) => can('skin', s.id) && rng() < 0.25));
    L.skin = rng.pick(skins.filter((s) => can('skin', s.id)).length ? skins.filter((s) => can('skin', s.id)) : CAT.SKINS).color;
    L.hair = { style: pick('hairStyle', CAT.HAIR_STYLES).id, color: pick('hairColor', CAT.HAIR_COLORS).color, tip: null };
    if (rng() < 0.25) L.hair.tip = pick('hairColor', CAT.HAIR_COLORS).color;
    L.eyes = { style: pick('eyeStyle', CAT.EYE_STYLES).id, color: pick('eyeColor', CAT.EYE_COLORS).color };
    L.brows = pick('brows', CAT.BROWS).id;
    L.facial = L.body === 'girl' ? 'none' : (rng() < 0.2 ? pick('facial', CAT.FACIAL).id : 'none');
    L.marks = [];
    if (rng() < 0.3) L.marks.push(pick('marks', CAT.MARKS).id);
    const oc = () => rng.pick(CAT.OUTFIT_COLORS);
    L.top = { id: pick('top', CAT.TOPS).id, color: oc(), color2: oc() };
    L.bottom = { id: pick('bottom', CAT.BOTTOMS).id, color: oc() };
    L.shoes = { id: pick('shoes', CAT.SHOES).id, color: oc() };
    L.hat = { id: rng() < 0.4 ? pick('hat', CAT.HATS).id : 'none', color: oc() };
    L.glasses = { id: rng() < 0.3 ? pick('glasses', CAT.GLASSES).id : 'none', color: oc() };
    L.acc = {};
    for (const slot of CAT.ACC_SLOTS) {
      const list = CAT.ACCESSORIES.filter((a) => a.slot === slot && can('acc', a.id));
      const real = list.filter((a) => a.id.indexOf('none_') !== 0);
      const id = real.length && rng() < (slot === 'hand' ? 0.8 : 0.3) ? rng.pick(real).id : 'none_' + slot;
      L.acc[slot] = { id, color: oc() };
    }
    return fix(L);
  }

  /* ------------------------------------------------------------------ render */
  const cache = new Map();
  const hashLook = (L) => BBH.hashStr(JSON.stringify(L));
  function outlineCol(c) {
    const k = (c[0] << 16) | (c[1] << 8) | c[2];
    let r = outlineCol.m.get(k);
    if (!r) {
      const [h, sat, l] = BBH.toHsl([c[0], c[1], c[2]]);
      r = mix(BBH.hsl(h + (268 - h > 180 || 268 - h < -180 ? 0 : (268 - h) * 0.12), Math.min(sat, 0.5) * 0.7, Math.max(0.06, l * 0.3)), PAL.ink, 0.35);
      outlineCol.m.set(k, r);
    }
    return r;
  }
  outlineCol.m = new Map();

  function draw(L, pose, frame, o) {
    o = o || {};
    const S = Kit.skeleton(L.body, pose, frame, { blink: o.blink, mood: o.mood });
    const B = Kit.bodyMasks(S), K = Kit.skinCols(L.skin);
    const P = new Pix(GR.W, GR.H);
    const X = { P, D: new Kit.Painter(P), S, B, K, L, hairR: Kit.softRamp(L.hair.color), o, Kit, frame, pose, Acc };
    const hatId = o.noHat ? 'none' : L.hat.id;
    X.hatId = hatId;
    X.hatInfo = Hair.hatInfo(X);
    // 1. things behind the body
    if (!o.noBack) Acc.back(X);
    Hair.back(X);
    // 2. lower body
    if (!S.sit && !o.bust) { Kit.drawLegs(P, S, B, K); Gear.bottom(X); Gear.shoes(X); }
    // 3. torso
    X.torsoM = Kit.drawTorsoSkin(P, S, B, K);
    if (S.sit && !o.bust) { Kit.drawLegs(P, S, B, K); Gear.bottom(X); Gear.shoes(X); }
    Gear.top(X);
    if (!o.noBack) Acc.front(X);
    Acc.neck(X);
    // 4. arms behind the head
    for (const side of ['L', 'R']) if (S.front.indexOf(side) < 0) Gear.arm(X, side);
    // 5. head
    Kit.drawHeadSkin(P, S, L, K);
    Hair.hatShadow(X);
    Kit.drawNose(P, S, K);
    Kit.drawMarks(P, S, L, K);
    Kit.drawFacial(P, S, L, X.hairR);
    Kit.drawEyes(P, S, L, K);
    Kit.drawMouth(P, S, L, K);
    Kit.drawBrows(P, S, L, X.hairR, K);
    Hair.front(X);
    Hair.hat(X);
    Acc.glasses(X);
    Acc.ears(X);
    // 6. arms in front of the face
    for (const side of ['L', 'R']) if (S.front.indexOf(side) >= 0) Gear.arm(X, side);
    // 7. outline: coloured and selective, never pure black
    P.outline((c) => outlineCol(c));
    return { pix: P, S };
  }
  // run fn on a given grid, restoring the previous one
  function onGrid(w, h, fn) { const ow = GR.W, oh = GR.H; Kit.setGrid(w, h); try { return fn(); } finally { Kit.setGrid(ow, oh); } }

  function blinkAt(t) { return (t % 3600) < 130; }
  function render(look, pose, tMs, opts) {
    opts = opts || {};
    const L = opts.fixed ? look : fix(look);
    const def = Kit.POSES[pose] || Kit.POSES.idle, pn = Kit.POSES[pose] ? pose : 'idle';
    const frame = opts.frame !== undefined ? opts.frame : Math.floor(((tMs || 0) / 1000) * def.fps) % def.frames;
    const blink = opts.blink !== undefined ? opts.blink : blinkAt(tMs || 0);
    const key = hashLook(L) + '|' + pn + '|' + frame + '|' + (blink ? 1 : 0) + (opts.noHat ? 'h' : '') + (opts.noBack ? 'b' : '');
    let hit = cache.get(key);
    if (!hit) {
      hit = onGrid(W, H, () => draw(L, pn, frame, { blink, noHat: opts.noHat, noBack: opts.noBack }).pix);
      if (cache.size >= 400) cache.delete(cache.keys().next().value);
      cache.set(key, hit);
    }
    if (opts.flip) { const f = new Pix(W, H); f.blit(hit, 0, 0, { flip: true }); return f; }
    return hit;
  }

  function anchors(look, pose, frame) {
    const L = fix(look), pn = Kit.POSES[pose] ? pose : 'idle';
    return onGrid(W, H, () => {
      const S = Kit.skeleton(L.body, pn, frame || 0, {}), f = Kit.faceCtx(S), ax = (W - 1) / 2 + f.ox;
      const hand = (side) => ({ x: Math.round(Kit.X(S.arms[side].ha[0])), y: Math.round(Kit.Y(S.arms[side].ha[1])) });
      const hy = (v) => Math.round(Kit.Y(Kit.HY + v) + f.oy);
      return { mouth: { x: Math.round(ax), y: hy(14.6) }, head: { x: Math.round(ax), y: hy(9) }, top: { x: Math.round(ax), y: hy(0) }, handL: hand('L'), handR: hand('R'), feet: { x: 29, y: H - 1 } };
    });
  }

  /* ------------------------------------------------------- portrait & thumbs */
  const pcache = new Map();
  const MOODS = {
    neutral: { mouth: 'closed', eyes: 'open', brow: 'neutral' }, happy: { mouth: 'grin', eyes: 'happy', brow: 'neutral' },
    sad: { mouth: 'sad', eyes: 'down', brow: 'sad' }, angry: { mouth: 'grit', eyes: 'open', brow: 'angry' }, shout: { mouth: 'shout', eyes: 'closed', brow: 'angry' },
  };
  function crop(src, x0, y0, w, h) {
    const o = new Pix(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const sx = x0 + x, sy = y0 + y; if (sx < 0 || sy < 0 || sx >= src.w || sy >= src.h) continue;
      const i = (sy * src.w + sx) * 4; if (!src.data[i + 3]) continue;
      const q = (y * w + x) * 4; o.data[q] = src.data[i]; o.data[q + 1] = src.data[i + 1]; o.data[q + 2] = src.data[i + 2]; o.data[q + 3] = src.data[i + 3];
    }
    return o;
  }
  // 72x72 head+shoulders, painted natively on a bigger grid so the face keeps real detail (no doubled pixels)
  function portrait(look, mood, opts) {
    opts = opts || {};
    const L = fix(look), md = MOODS[mood] ? mood : 'neutral';
    const key = 'p' + hashLook(L) + md + (opts.noHat ? 'h' : '') + (opts.blink ? 'b' : '');
    let hit = pcache.get(key);
    if (!hit) {
      hit = onGrid(PW, PH, () => {
        const src = draw(L, 'idle', 0, { mood: MOODS[md], noHat: opts.noHat, noBack: true, blink: !!opts.blink, bust: true }).pix;
        return crop(src, 12, Math.round(1 * GR.ky), 72, 72);
      });
      if (pcache.size >= 200) pcache.delete(pcache.keys().next().value);
      pcache.set(key, hit);
    }
    return opts.flip ? new Pix(72, 72).blit(hit, 0, 0, { flip: true }) : hit;
  }
  function thumb(group, id, look) {
    const L = fix(look), key = 't' + group + id + hashLook(L);
    let hit = pcache.get(key); if (hit) return hit;
    let y0 = 4;
    switch (group) {
      case 'hat': L.hat.id = id; break;
      case 'glasses': L.glasses.id = id; L.hat.id = 'none'; break;
      case 'hairStyle': L.hair.style = id; L.hat.id = 'none'; break;
      case 'hairColor': L.hair.color = (CAT.HAIR_COLORS.find((c) => c.id === id) || {}).color || L.hair.color; L.hat.id = 'none'; break;
      case 'eyeStyle': L.eyes.style = id; L.hat.id = 'none'; break;
      case 'eyeColor': L.eyes.color = (CAT.EYE_COLORS.find((c) => c.id === id) || {}).color || L.eyes.color; L.hat.id = 'none'; break;
      case 'brows': L.brows = id; L.hat.id = 'none'; break;
      case 'facial': L.facial = id; L.hat.id = 'none'; break;
      case 'marks': L.marks = id === 'none' ? [] : [id]; L.hat.id = 'none'; break;
      case 'skin': L.skin = (CAT.GROUPS.skin.find((c) => c.id === id) || {}).color || L.skin; break;
      case 'body': L.body = id; y0 = 12; break;
      case 'top': L.top.id = id; y0 = 22; break;
      case 'bottom': L.bottom.id = id; y0 = 36; break;
      case 'shoes': L.shoes.id = id; y0 = 37; break;
      case 'acc': {
        const a = CAT.ACCESSORIES.find((x) => x.id === id); if (!a) break;
        L.acc[a.slot] = { id, color: L.acc[a.slot].color };
        y0 = { neck: 16, ears: 4, back: 16, hand: 22, wrist: 28 }[a.slot];
        break;
      }
    }
    const F = fix(L);
    hit = onGrid(W, H, () => crop(draw(F, 'idle', 0, { blink: false }).pix, 11, Math.round(y0 * GR.ky), 36, 36));
    if (pcache.size >= 600) pcache.delete(pcache.keys().next().value);
    pcache.set(key, hit);
    return hit;
  }

  Object.assign(BBH, {
    Chars: {
      W, H, POSES: Kit.POSES, render, anchors, portrait, thumb, fix, random, draw, _cache: cache,
    },
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = BBH.Chars;
})(typeof globalThis !== 'undefined' ? globalThis : this);
