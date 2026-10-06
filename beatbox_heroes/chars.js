// BEATBOX HEROES -- chars.js
// BBH.Chars: the paper-doll character renderer (public API, composition order, caches, portraits, thumbs).
//
// SCRIPT LOAD ORDER (plain <script> tags, after pix.js, font.js, catalog.js):
//     chars_body.js   drawing kit, skeleton / poses, skin, face, marks, facial hair
//     chars_hair.js   hair styles (back + front layers) and hats
//     chars_gear.js   tops, bottoms, shoes, glasses, accessories
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
  }
  const { Pix, PAL, ramp, mix, C } = BBH;
  const Kit = BBH.CharsKit, CAT = BBH.CATALOG, Hair = BBH.CharsHair, Gear = BBH.CharsGear;
  const { W, H } = Kit;

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
      const list = CAT.ACCESSORIES.filter((a) => a.slot === slot), s = A[slot] || {}, d = D.acc[slot];
      o.acc[slot] = { id: pickId(s.id, list, 'none_' + slot) === s.id ? s.id : (slot in A && s.id === undefined ? d.id : 'none_' + slot), color: col(s.color, d.color) };
      if (ids(list).indexOf(o.acc[slot].id) < 0) o.acc[slot].id = d.id;
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
    const X = { P: new Pix(W, H), S, B, K, L, hairR: ramp(L.hair.color), o, Kit, frame, pose };
    const P = X.P;
    const hatId = o.noHat ? 'none' : L.hat.id;
    X.hatId = hatId;
    X.hatInfo = Hair.hatInfo(X);
    // 1. things behind the body
    if (!o.noBack) Gear.back(X);
    Hair.back(X);
    // 2. lower body
    if (!S.sit) { Kit.drawLegs(P, S, B, K); Gear.bottom(X); Gear.shoes(X); }
    // 3. torso
    X.torsoM = Kit.drawTorsoSkin(P, S, B, K);
    if (S.sit) { Kit.drawLegs(P, S, B, K); Gear.bottom(X); Gear.shoes(X); }
    Gear.top(X);
    Gear.neck(X);
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
    Kit.drawBrows(P, S, L, X.hairR);
    Hair.front(X);
    Hair.hat(X);
    Gear.glasses(X);
    Gear.ears(X);
    // 6. arms in front of the face
    for (const side of ['L', 'R']) if (S.front.indexOf(side) >= 0) Gear.arm(X, side);
    // 7. outline
    P.outline((c) => outlineCol(c));
    return { pix: P, S };
  }

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
      hit = draw(L, pn, frame, { blink, noHat: opts.noHat, noBack: opts.noBack }).pix;
      if (cache.size >= 400) cache.delete(cache.keys().next().value);
      cache.set(key, hit);
    }
    if (opts.flip) { const f = new Pix(W, H); f.blit(hit, 0, 0, { flip: true }); return f; }
    return hit;
  }

  function anchors(look, pose, frame) {
    const L = fix(look), pn = Kit.POSES[pose] ? pose : 'idle', S = Kit.skeleton(L.body, pn, frame || 0, {});
    const hx = Math.round(S.head.x), hy = Math.round(S.head.y);
    const hand = (side) => ({ x: Math.round(S.arms[side].ha[0]), y: Math.round(S.arms[side].ha[1]) });
    return {
      mouth: { x: hx, y: hy + 14 }, head: { x: hx, y: hy + 9 }, top: { x: hx, y: hy },
      handL: hand('L'), handR: hand('R'), feet: { x: 22, y: 63 },
    };
  }


  /* ------------------------------------------------------- portrait & thumbs */
  const pcache = new Map();
  const MOODS = {
    neutral: { mouth: 'closed', eyes: 'open', brow: 'neutral' }, happy: { mouth: 'grin', eyes: 'happy', brow: 'neutral' },
    sad: { mouth: 'sad', eyes: 'down', brow: 'sad' }, angry: { mouth: 'grit', eyes: 'open', brow: 'angry' }, shout: { mouth: 'shout', eyes: 'closed', brow: 'angry' },
  };
  function crop(src, x0, y0, w, h, scale) {
    const o = new Pix(w * scale, h * scale);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = ((y0 + y) * src.w + x0 + x) * 4; if (x0 + x < 0 || y0 + y < 0 || x0 + x >= src.w || y0 + y >= src.h || !src.data[i + 3]) continue;
      for (let j = 0; j < scale; j++) for (let k = 0; k < scale; k++) { const q = ((y * scale + j) * o.w + x * scale + k) * 4; o.data[q] = src.data[i]; o.data[q + 1] = src.data[i + 1]; o.data[q + 2] = src.data[i + 2]; o.data[q + 3] = src.data[i + 3]; }
    }
    return o;
  }
  function portrait(look, mood, opts) {
    opts = opts || {};
    const L = fix(look), md = MOODS[mood] ? mood : 'neutral';
    const key = 'p' + hashLook(L) + md + (opts.noHat ? 'h' : '') + (opts.blink ? 'b' : '');
    let hit = pcache.get(key);
    if (!hit) {
      const src = draw(L, 'idle', 0, { mood: MOODS[md], noHat: opts.noHat, noBack: true, blink: !!opts.blink }).pix;
      hit = crop(src, 8, 3, 28, 28, 2);
      if (pcache.size >= 200) pcache.delete(pcache.keys().next().value);
      pcache.set(key, hit);
    }
    return opts.flip ? new Pix(56, 56).blit(hit, 0, 0, { flip: true }) : hit;
  }
  const HEAD_G = { hat: 1, glasses: 1, hairStyle: 1, hairColor: 1, eyeStyle: 1, eyeColor: 1, brows: 1, facial: 1, marks: 1, skin: 1, body: 1 };
  function thumb(group, id, look) {
    const L = fix(look), key = 't' + group + id + hashLook(L);
    let hit = pcache.get(key); if (hit) return hit;
    let y0 = 4, pose = 'idle';
    switch (group) {
      case 'hat': L.hat.id = id; break;
      case 'glasses': L.glasses.id = id; if (L.hat.id !== 'none') L.hat.id = 'none'; break;
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
      case 'shoes': L.shoes.id = id; y0 = 36; break;
      case 'acc': {
        const a = CAT.ACCESSORIES.find((x) => x.id === id); if (!a) break;
        L.acc[a.slot] = { id, color: L.acc[a.slot].color };
        y0 = { neck: 16, ears: 4, back: 16, hand: 22, wrist: 28 }[a.slot];
        if (a.slot === 'hand') pose = 'idle';
        break;
      }
    }
    const F = fix(L);
    const src = draw(F, pose, 0, { noBack: false, blink: false }).pix;
    hit = crop(src, 8, y0, 28, 28, 1);
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
