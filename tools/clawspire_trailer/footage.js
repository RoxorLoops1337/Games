// Clawspire 2.0 trailer: real gameplay footage.
//
// A scene is a 60 fps JPEG sequence captured from the game (1080x1920, the
// 540x960 stage at DPR 2) in FOOT_ROOT/<id>/f_00000.jpg with meta.json
// ({frames, fps, cues}). Until a scene exists the edit runs on placeholder
// stills (PLACEHOLDERS below), so the whole timeline can be cut before the
// footage lands; a placeholder "plays" by stepping through its stills.
//
// Shots ask for a scene at a SOURCE time (seconds into the capture). Time
// remapping (speed ramps, reverse, freezes, slow motion) is just a function
// from shot time to source time; between two captured frames the draw blends
// f_n and f_n+1, so 0.2x slow motion stays smooth.
//
// Frames are decoded off-thread (createImageBitmap) into an LRU cache with a
// byte budget. A paint that touched a frame not yet in memory records it in
// MISS; the frame driver awaits the loads and repaints (render mode), so the
// written frame always has every pixel it asked for.
'use strict';

const FOOT_ROOT = '/__footage/';
const SCRATCH = '/__scratch/';
const STAGE_W = 1080, STAGE_H = 1920;                       // the source space every crop is in

// cue fallbacks (seconds) for placeholders, and for cues a capture lacks
const PH = (files, o = {}) => Object.assign({ files }, o);
const R16 = 'r16cab/r16_cab_', R17 = 'r17cap/en/', R22 = 'r22row/en/', M2 = 'r18m2/after/', M3 = 'r18m3/after/';
// the r22row walk has descriptive names; list the ones we use explicitly
const R22SEQ = ['0003_f1g1.jpg', '0006_f1g1.jpg', '0009_f1g1.jpg', '0012_f1g1.jpg', '0015_f1g1.jpg', '0018_f1g1.jpg', '0020_f1g1.jpg'].map(f => R22 + f);
const PLACEHOLDERS = {
  title_neon:       PH(['r20title/after/anim_0.png', 'r20title/after/anim_1.png', 'r20title/after/anim_2.png', 'r20title/after/anim_3.png', 'r20title/after/title_en_390.png'], { cues: { grab: 1.2 } }),
  resolve_row:      PH(['r21row/r21_1_row_filling_en.png', 'r21row/r21_2_row_lift_en.png', 'r21row/r21_3_row_toss_en.png', 'r21row/r21_4_row_hits_en.png', 'r21row/r21_5_row_chips_en.png', 'r21row/r21_6_row_done_en.png'], { cues: { hit1: 1.5, hit2: 2.0, hit3: 2.5, hit4: 3.0 } }),
  perfect_grab:     PH(R22SEQ.concat([R16 + 'perfect_en.png', R16 + 'perfect_b_en.png']), { cues: { release: 1.0, grab: 3.5, perfect: 3.5, delivery: 4.2 } }),
  cabinet_event_surge:   PH([R16 + 'after_surge_en.png'], { cues: { cab_event_surge_land: .2 } }),
  cabinet_event_coins:   PH([R16 + 'sign_land_coins_en.png', R16 + 'after_coins_en.png'], { cues: { cab_event_coins_land: .2 } }),
  cabinet_event_capsule: PH([R16 + 'sign_land_capsule_en.png', R16 + 'after_capsule_en.png'], { cues: { cab_event_capsule_land: .2 } }),
  cabinet_events:   PH([R16 + 'after_surge_en.png', R16 + 'sign_land_coins_en.png', R16 + 'after_coins_en.png', R16 + 'sign_land_capsule_en.png', R16 + 'after_capsule_en.png'], { cues: { surge: .2, coins: 1.2, capsule: 2.2 } }),
  lamp_fever:       PH([R16 + 'fever_beacon_en.png', R16 + 'fever_burst_en.png', R16 + 'fever_rain_en.png'], { cues: { fever: .6 } }),
  capsule_legend:   PH([R17 + '06_legend_primed.png', R17 + '06_legend_seq_0.png', R17 + '06_legend_seq_1.png', R17 + '06_legend_seq_2.png', R17 + '06_legend_seq_3.png', R17 + '06_legend_seq_4.png', R17 + '06_legend_seq_5.png', R17 + '06_legend_seq_6.png', R17 + '07_legend_card.png'], { cues: { crack: .6, legendary: 1.1 } }),
  combo_pick:       PH([M2 + 'boon_en.png', M2 + 'reward_en.png'], { cues: { pick: .6 } }),
  halloween_title:  PH(['r20title/after/halloween_en_390.png'], { cues: {} }),
  halloween_fight:  PH(R22SEQ, { cues: { hit1: 1.5 } }),
  depths:           PH(['r15_dep_fight.png', 'r15_dep_jelly.png', 'r15_dep_tide.png'], { cues: {} }),
  coop_online_host: PH([M3 + 'online_hostjoin_en.png', M3 + 'duo_setup_coop_en.png'], { cues: {} }),
  coop_online_guest:PH([M3 + 'online_join_en.png', M3 + 'duo_setup_open_en.png'], { cues: {} }),
  crawlers_tech:    PH([R16 + 'faces_ride_en.png', R16 + 'faces_full_en.png'], { cues: {} }),
  compactor:        PH([M2 + 'compactor_en.png'], { cues: {} }),
  shop_market:      PH([M2 + 'shop_en.png', M2 + 'petshop_en.png'], { cues: {} }),
  vault_minis:      PH([R17 + '16_vault_minis.png', R17 + '17_vault_minis_scrolled.png'], { cues: {} }),
  nl_row:           PH(['r21row/r21_4_row_hits_nl.png'], { cues: { row_GO: .1 } }),
  nl_title:         PH([M3 + 'title_nl.png'], { cues: {} }),
};
const CLAW_IDS = ['classic', 'tri', 'scoop', 'hand', 'magnet', 'hook', 'vacuum', 'twin'];
const CLAW_COL = { classic: '#c9d3e0', tri: '#ffc94d', scoop: '#ff8a2b', hand: '#ff9ad0', magnet: '#2ee6d6', hook: '#a6ff5e', vacuum: '#9b7bff', twin: '#ff5a9a' };
const CLAW_NAME = { classic: 'CLASSIC', tri: 'TRI-CLAW', scoop: 'SCOOP', hand: 'GRABBER', magnet: 'MAGNET', hook: 'HARPOON', vacuum: 'VACUUM', twin: 'TWIN' };
CLAW_IDS.forEach((c, i) => { PLACEHOLDERS['claw_' + c] = PH([R22SEQ[i % R22SEQ.length], R22SEQ[(i + 3) % R22SEQ.length]], { cues: { grab: .6 } }); });
// placeholder stills are 390x844 phone shots at DPR 2 with the 9:16 stage letterboxed inside
const PH_CROP = [0, 151, 780, 1386];
const PH_FPS = 2;                                            // a placeholder steps through its stills at 2 per second

// ---------------------------------------------------------------- scenes
const SCN = {};                                            // id -> {id, real, frames, fps, cues, url(n), crop}
async function loadScenes() {
  const ids = Object.keys(PLACEHOLDERS);
  await Promise.all(ids.map(async id => {
    const ph = PLACEHOLDERS[id];
    let meta = null;
    try { const r = await fetch(FOOT_ROOT + id + '/meta.json', { cache: 'no-store' }); if (r.ok) meta = await r.json(); } catch (e) { meta = null; }
    if (meta && meta.frames > 0) {
      const fps = meta.fps || 60, cues = {};
      for (const [k, v] of Object.entries(meta.cues || {})) {
        const n = typeof v === 'number' ? v : v && v.frame != null ? v.frame : v && v.t != null ? v.t * fps : null;
        if (n != null) cues[k] = n / fps;
      }
      const pat = meta.pattern || 'f_%05d.jpg';
      SCN[id] = { id, real: true, frames: meta.frames, fps, cues, meta, crop: [0, 0, meta.width || STAGE_W, meta.height || STAGE_H],
        url: n => FOOT_ROOT + id + '/' + pat.replace('%05d', String(n).padStart(5, '0')) };
    } else {
      SCN[id] = { id, real: false, frames: ph.files.length, fps: PH_FPS, cues: Object.assign({}, ph.cues), crop: PH_CROP,
        url: n => SCRATCH + ph.files[n] };
    }
  }));
  window.SCENES_REAL = Object.values(SCN).filter(s => s.real).map(s => s.id);
}
// a cue of a scene in source seconds (fallback when the capture has no such cue)
// name may be a list of aliases (the capture's own cue names first)
function cue(id, name, fb = 0) {
  const s = SCN[id], names = Array.isArray(name) ? name : [name];
  for (const n of names) if (s && s.cues[n] != null) return s.cues[n];
  const ph = PLACEHOLDERS[id];
  for (const n of names) if (ph && ph.cues && ph.cues[n] != null) return ph.cues[n];
  return fb;
}
function sceneDur(id) { const s = SCN[id]; return s ? s.frames / s.fps : 1; }

// ---------------------------------------------------------------- LRU frame cache
const BUDGET = (+(QS.get('cacheMB') || 2200)) * 1048576;
const CACHE = new Map();                                    // key -> {bmp, bytes} (Map order = recency)
const LOADING = new Map();                                  // key -> Promise
let cacheBytes = 0;
const MISS = new Set();                                     // keys a paint wanted but did not have
const SEEN = new Map();                                     // id -> last frame index drawn (prefetch direction)
// decode size: full res for the master; previews decode smaller (a full-frame crop never needs more than ~1.9x)
const DEC_W = Math.min(STAGE_W, Math.ceil(STAGE_W * SCALE * 1.9));
function fkey(id, n) { return id + ':' + n; }
function getFrame(id, n) {
  const k = fkey(id, n), e = CACHE.get(k);
  if (e) { CACHE.delete(k); CACHE.set(k, e); return e.bmp; }
  MISS.add(k);
  loadFrame(id, n);
  return null;
}
function loadFrame(id, n) {
  const k = fkey(id, n);
  if (CACHE.has(k)) return Promise.resolve();
  if (LOADING.has(k)) return LOADING.get(k);
  const s = SCN[id];
  const p = (async () => {
    try {
      const r = await fetch(s.url(n));
      if (!r.ok) throw new Error(r.status);
      const blob = await r.blob();
      const [cx, cy, cw, ch] = s.crop;
      const dw = Math.min(DEC_W, cw), dh = Math.round(dw * ch / cw);
      const bmp = await createImageBitmap(blob, cx, cy, cw, ch, { resizeWidth: dw, resizeHeight: dh, resizeQuality: 'high' });
      const bytes = bmp.width * bmp.height * 4;
      CACHE.set(k, { bmp, bytes }); cacheBytes += bytes;
      while (cacheBytes > BUDGET && CACHE.size > 8) {
        const [ok_, ov] = CACHE.entries().next().value;
        CACHE.delete(ok_); cacheBytes -= ov.bytes; try { ov.bmp.close(); } catch (e) { /* closed */ }
      }
    } catch (e) {
      console.warn('frame load failed', k, String(e));
      CACHE.set(k, { bmp: null, bytes: 0 });               // remember the hole; draws skip it
    } finally { LOADING.delete(k); }
  })();
  LOADING.set(k, p);
  return p;
}
async function awaitMisses() {
  const ks = [...MISS]; MISS.clear();
  await Promise.all(ks.map(k => { const i = k.lastIndexOf(':'); return loadFrame(k.slice(0, i), +k.slice(i + 1)); }));
  return ks.length;
}
// warm the next frames of every scene drawn this frame, in the direction it moves
function prefetch(ahead = 6) {
  for (const [id, st] of SEEN) {
    const s = SCN[id]; if (!s) continue;
    const dir = st.dir || 1;
    for (let j = 1; j <= ahead; j++) {
      const n = st.n + dir * j;
      if (n >= 0 && n < s.frames) loadFrame(id, n);
    }
  }
  SEEN.clear();
}

// ---------------------------------------------------------------- source time -> pixels
// the frame pair for source time ft: [bmpA, bmpB, mix]
function framePair(id, ft) {
  const s = SCN[id]; if (!s) return null;
  if (!s.real) {
    // placeholders hold each still (no blending: they are different shots)
    const n = clamp(Math.floor(ft * s.fps), 0, s.frames - 1);
    const a = getFrame(id, n);
    return a ? [a, null, 0] : null;
  }
  const f = clamp(ft * s.fps, 0, s.frames - 1);
  const n0 = Math.floor(f), fr = f - n0;
  const prev = SEEN.get(id);
  SEEN.set(id, { n: n0, dir: prev && n0 < prev.n ? -1 : 1 });
  const a = getFrame(id, n0);
  if (fr < .04 || n0 + 1 >= s.frames) return a ? [a, null, 0] : null;
  if (fr > .96) { const c = getFrame(id, n0 + 1); return c ? [c, null, 0] : null; }
  const bb = getFrame(id, n0 + 1);
  if (!a || !bb) return null;
  return [a, bb, fr];
}
// draw scene `id` at source time ft so that the stage (STAGE_W x STAGE_H) lands
// under the current transform at (0,0)-(STAGE_W,STAGE_H)
function drawStage(g, id, ft, o = {}) {
  const pr = framePair(id, ft);
  if (!pr) { g.fillStyle = '#1a1030'; g.fillRect(0, 0, STAGE_W, STAGE_H); return false; }
  const [a, bb, m] = pr;
  g.save();
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = o.hq ? 'high' : 'medium';
  g.drawImage(a, 0, 0, a.width, a.height, 0, 0, STAGE_W, STAGE_H);
  if (bb && m > 0) { g.globalAlpha *= m; g.drawImage(bb, 0, 0, bb.width, bb.height, 0, 0, STAGE_W, STAGE_H); }
  g.restore();
  return true;
}

// full-frame footage: the 9:16 stage cropped to fill the frame.
// o.cx, o.cy: crop centre in stage fractions; o.zoom: 1 = stage width fills the frame width
// (16:9) or stage height fills the frame height (9:16); o.rot, o.ox, o.oy (screen px)
function fullFrame(g, id, ft, o = {}) {
  const zoom = o.zoom || 1;
  const k = (VERT ? H / STAGE_H : W / STAGE_W) * zoom;      // screen px per stage px
  // keep the crop inside the stage unless the shot allows overscan
  let cx = (o.cx != null ? o.cx : .5) * STAGE_W, cy = (o.cy != null ? o.cy : .5) * STAGE_H;
  if (!o.free) {
    const hw = W / 2 / k, hh = H / 2 / k;
    cx = hw * 2 >= STAGE_W ? STAGE_W / 2 : clamp(cx, hw, STAGE_W - hw);
    cy = hh * 2 >= STAGE_H ? STAGE_H / 2 : clamp(cy, hh, STAGE_H - hh);
  }
  g.save();
  g.translate(W / 2 + (o.ox || 0), H / 2 + (o.oy || 0));
  if (o.rot) g.rotate(o.rot);
  g.scale(k, k);
  g.translate(-cx, -cy);
  const r = drawStage(g, id, ft, o);
  g.restore();
  return r;
}
// where a stage point lands on screen for fullFrame(o) (to aim callouts at the game's own UI)
function ffPoint(o, sx, sy) {
  const zoom = o.zoom || 1, k = (VERT ? H / STAGE_H : W / STAGE_W) * zoom;
  let cx = (o.cx != null ? o.cx : .5) * STAGE_W, cy = (o.cy != null ? o.cy : .5) * STAGE_H;
  if (!o.free) {
    const hw = W / 2 / k, hh = H / 2 / k;
    cx = hw * 2 >= STAGE_W ? STAGE_W / 2 : clamp(cx, hw, STAGE_W - hw);
    cy = hh * 2 >= STAGE_H ? STAGE_H / 2 : clamp(cy, hh, STAGE_H - hh);
  }
  let x = (sx * STAGE_W - cx) * k, y = (sy * STAGE_H - cy) * k;
  if (o.rot) { const c = Math.cos(o.rot), s = Math.sin(o.rot); [x, y] = [x * c - y * s, x * s + y * c]; }
  return [W / 2 + (o.ox || 0) + x, H / 2 + (o.oy || 0) + y];
}

// ---------------------------------------------------------------- time remaps
// anchor: source cue `at` (seconds) plays at shot time `lt0`, at `speed`
const anchor = (lt, lt0, at, speed = 1) => at + (lt - lt0) * speed;
// speed ramp: a list of [shotTime, speed] keys, integrated (smooth speed changes),
// starting at source time src0 at shotTime keys[0][0]
function ramp(lt, src0, ks) {
  let src = src0;
  for (let i = 0; i < ks.length; i++) {
    const [t0, s0] = ks[i];
    const [t1, s1] = i + 1 < ks.length ? ks[i + 1] : [Infinity, s0];
    if (lt <= t0) break;
    const tt = Math.min(lt, t1), d = tt - t0;
    if (t1 === Infinity) { src += s0 * d; break; }
    // linear speed change across the segment: integral of a line
    const u = d / (t1 - t0);
    src += d * (s0 + (s1 - s0) * u / 2);
  }
  return src;
}
// same, but solved for the source time at which the cue `at` lands exactly at shot time `ltAt`
function rampTo(lt, ltAt, at, ks) { return at + ramp(lt, 0, ks) - ramp(ltAt, 0, ks); }
