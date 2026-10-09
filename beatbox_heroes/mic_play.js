/* BBH.MicPlay: playing the rhythm game with your voice (the one shared mic layer for the 2D and the 3D rhythm scenes).
 *
 * Pure logic (node-testable, no DOM):
 *   Calibrator       prompts B, T, K, Pf a few times each, rejects weak and outlier hits, builds the player's own voice profiles + a quality score
 *   LatencyProbe     says "t" on metronome clicks -> median lag of your voice path in ms
 *   resolveLane      an unsure hit snaps to the nearest unhit note
 *   nearestNote      distance (s) from now to the nearest unhit note of a lane
 *   adapt            confident hits that land on a note of their lane keep tuning the classifier during play
 *   Watchdog         "I can't hear you" after a long silence while notes are due
 *   serialize / parseProfile / loadProfile / saveProfile   the calibration profile, per save slot (localStorage bbh:micprof:<slot>)
 * Browser glue:
 *   buildClassifier(slot)   calibration profile > Sound Lab samples > default voices
 *   start(opts)             open the mic, build the classifier, apply the saved mic timing, listen. Returns { ok, stop, cls, source } or { ok:false, error }
 *
 * No em dashes anywhere in this file (project rule).
 */
(function (root) {
  'use strict';
  const BBH = root.BBH || (root.BBH = {});
  if (typeof require !== 'undefined' && !BBH.Mic) require('./mic.js');

  const LANES = ['B', 'T', 'K', 'Pf'];
  const PROFILE_VER = 1;
  const MIN_STRENGTH = 0.2;            // detector strength 0..1 (-40..0 dB): quieter than this is not a deliberate hit
  const AUTO_ADAPT_CONF = 0.8;

  /* ------------------------------------------------------------------ calibration profile storage */
  const store = () => { try { return root.localStorage || null; } catch (e) { return null; } };
  const profKey = (slot) => 'bbh:micprof:' + ((slot | 0) || 1);
  function serialize(res) {
    return JSON.stringify({ v: PROFILE_VER, q: res.quality, p: res.profiles.map((p) => ({ name: p.name, mean: Array.from(p.mean), std: Array.from(p.std), n: p.n, rms: p.rms })) });
  }
  function parseProfile(text) {
    try {
      const o = typeof text === 'string' ? JSON.parse(text) : text;
      if (!o || o.v !== PROFILE_VER || !Array.isArray(o.p) || o.p.length !== 4) return null;
      for (const p of o.p) if (!p || !Array.isArray(p.mean) || !Array.isArray(p.std) || p.mean.length !== 10 || p.std.length !== 10 || !p.mean.every(isFinite) || !p.std.every(isFinite)) return null;
      return { profiles: o.p, quality: typeof o.q === 'number' ? o.q : 0 };
    } catch (e) { return null; }
  }
  function loadProfile(slot, st) { st = st || store(); try { return st ? parseProfile(st.getItem(profKey(slot))) : null; } catch (e) { return null; } }
  function saveProfile(slot, res, st) { st = st || store(); try { if (st) { st.setItem(profKey(slot), serialize(res)); return true; } } catch (e) { /* ignore */ } return false; }
  function clearProfile(slot, st) { st = st || store(); try { if (st) st.removeItem(profKey(slot)); } catch (e) { /* ignore */ } }

  /* ------------------------------------------------------------------ Calibrator */
  function vdist(a, b, std) { let s = 0; for (let d = 0; d < a.length; d++) { const z = (a[d] - b[d]) / std[d]; s += z * z; } return Math.sqrt(s / a.length); }

  /**
   * new Calibrator({ per: 4, order: [0,1,2,3] }). Loop: prompt() -> { lane, name, index, of, step, steps } | null (done);
   * add(ev) with a detector/listen event ({ vec, strength }) -> { accepted, reason }. result() -> { profiles, quality 0..1, perLane[4], confused:[[a,b],..], ok }.
   */
  function Calibrator(o) {
    o = o || {};
    const per = o.per || 4, order = o.order || [0, 1, 2, 3], M = BBH.Mic, def = M.defaultProfiles();
    const got = order.map(() => []);
    let pos = 0;
    const total = order.length * per;
    const api = {
      per, order,
      prompt() {
        if (pos >= order.length) return null;
        return { lane: order[pos], name: LANES[order[pos]], index: got[pos].length, of: per, step: pos * per + got[pos].length, steps: total };
      },
      add(ev) {
        if (pos >= order.length) return { accepted: false, reason: 'done' };
        if (!ev || !ev.vec || ev.vec.length < 10) return { accepted: false, reason: 'bad' };
        if ((ev.strength || 0) < MIN_STRENGTH) return { accepted: false, reason: 'quiet' };
        const lane = order[pos], list = got[pos];
        if (list.length >= 2) {                    // outlier: far from what this lane already sounds like (a cough, a different sound)
          const mean = new Float32Array(10); for (const v of list) for (let d = 0; d < 10; d++) mean[d] += v[d] / list.length;
          let spread = 0; for (const v of list) spread += vdist(v, mean, def[lane].std) / list.length;
          if (vdist(ev.vec, mean, def[lane].std) > Math.max(3 * spread, 1.2)) return { accepted: false, reason: 'odd' };
        }
        list.push(Float32Array.from(ev.vec));
        if (list.length >= per) pos++;
        return { accepted: true, reason: 'ok' };
      },
      undo() { if (pos >= order.length) pos = order.length - 1; if (pos >= 0 && got[pos] && got[pos].length) got[pos].pop(); else if (pos > 0) { pos--; got[pos].pop(); } },
      done: () => pos >= order.length,
      progress: () => got.reduce((a, l) => a + l.length, 0) / total,
      result() { return buildResult(order, got); },
    };
    return api;
  }

  function profilesFrom(order, lists, def) {
    const out = def.map((p) => ({ name: p.name, mean: Float32Array.from(p.mean), std: Float32Array.from(p.std), n: p.n, rms: p.rms }));
    order.forEach((lane, i) => {
      const vs = lists[i];
      if (!vs.length) return;
      const mean = new Float32Array(10), std = new Float32Array(10);
      for (let d = 0; d < 10; d++) {
        let m = 0; for (const v of vs) m += v[d]; m /= vs.length;
        let q = 0; for (const v of vs) q += (v[d] - m) * (v[d] - m);
        mean[d] = m; std[d] = Math.max(Math.sqrt(q / vs.length), 0.6 * def[lane].std[d], 0.04);
      }
      out[lane] = { name: def[lane].name, mean, std, n: vs.length, rms: def[lane].rms };
    });
    return out;
  }
  function buildResult(order, lists) {
    const M = BBH.Mic, def = M.defaultProfiles(), profiles = profilesFrom(order, lists, def);
    const perLane = [0, 0, 0, 0], tot = [0, 0, 0, 0], conf = {};
    order.forEach((lane, i) => {
      lists[i].forEach((v, k) => {                  // leave one out: train without this example, then classify it
        if (lists[i].length < 2) return;
        const rest = lists.map((l, j) => (j === i ? l.filter((_, q) => q !== k) : l));
        const c = M.makeClassifier(profilesFrom(order, rest, def)).classify(v);
        tot[lane]++; if (c.lane === lane) perLane[lane]++; else conf[lane + '>' + c.lane] = (conf[lane + '>' + c.lane] || 0) + 1;
      });
    });
    const lanes = order.filter((l) => tot[l] > 0);
    for (const l of lanes) perLane[l] = perLane[l] / tot[l];
    const quality = lanes.length ? lanes.reduce((a, l) => a + perLane[l], 0) / lanes.length : 0;
    const confused = Object.keys(conf).filter((k) => conf[k] >= 2).map((k) => k.split('>').map(Number));
    return { profiles, quality, perLane, confused, ok: lanes.length === order.length && quality >= 0.75 };
  }

  /* ------------------------------------------------------------------ LatencyProbe */
  /**
   * new LatencyProbe(clickTimesMs): the player says "t" on each click. add(hitTimeMs) pairs a hit with the nearest click within +-250 ms.
   * result(currentLatMs) -> { ok, medianMs, lagMs (new total latency to store), n, spreadMs }. Needs 4 pairs. hit times are the
   * latency-corrected times Mic.listen reports, so the lag it finds is ADDED to the current latency.
   */
  function LatencyProbe(clicks) {
    const diffs = [], used = new Set();
    const med = (a) => { const s = a.slice().sort((x, y) => x - y), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
    return {
      add(t) {
        let bi = -1, bd = 1e9;
        clicks.forEach((c, i) => { const d = Math.abs(t - c); if (d < bd && !used.has(i)) { bd = d; bi = i; } });
        if (bi < 0 || bd > 250) return false;
        used.add(bi); diffs.push(t - clicks[bi]); return true;
      },
      count: () => diffs.length,
      result(currentLat) {
        const cur = typeof currentLat === 'number' && isFinite(currentLat) ? currentLat : 0;
        if (diffs.length < 4) return { ok: false, medianMs: 0, lagMs: cur, n: diffs.length, spreadMs: 0 };
        const m = med(diffs), spread = med(diffs.map((d) => Math.abs(d - m)));
        return { ok: spread <= 60, medianMs: m, lagMs: Math.max(0, Math.min(400, Math.round(cur + m))), n: diffs.length, spreadMs: spread };
      },
    };
  }

  /* ------------------------------------------------------------------ in-play helpers */
  /** nearest unhit note of `lane` (or any lane when lane < 0): { note, dt } with dt in seconds (abs), or null */
  function nearestNote(notes, lane, T, timeOf) {
    let best = null, bd = 1e9;
    for (const n of notes) {
      if (n.state || (lane >= 0 && n.lane !== lane)) continue;
      const d = Math.abs(T - timeOf(n)); if (d < bd) { bd = d; best = n; }
    }
    return best ? { note: best, dt: bd } : null;
  }
  /** an unsure hit (confidence < 0.5) takes the lane of the nearest unhit note within 200 ms. -> { lane, snapped } */
  function resolveLane(ev, notes, T, timeOf) {
    if (ev.confidence !== undefined && ev.confidence >= 0.5) return { lane: ev.lane, snapped: false };
    const n = nearestNote(notes, -1, T, timeOf);
    return n && n.dt < 0.2 ? { lane: n.note.lane, snapped: n.note.lane !== ev.lane } : { lane: ev.lane, snapped: false };
  }
  /** keep tuning: a confident, deliberate hit that landed on a note of its own lane within 150 ms teaches the classifier. -> bool */
  function adapt(cls, ev, lane, notes, T, timeOf) {
    if (!cls || !ev || !ev.vec || ev.confidence < AUTO_ADAPT_CONF || (ev.strength || 0) < MIN_STRENGTH || ev.lane !== lane) return false;
    const n = nearestNote(notes, lane, T, timeOf);
    return !!(n && n.dt <= 0.15 && cls.learn(lane, ev.vec));
  }
  /** "I can't hear you": arm(nowMs) when a set starts, hit(nowMs) on every onset, tick(nowMs, notesDue) -> true ONCE per silence */
  function Watchdog(o) {
    const silence = (o && o.silenceMs) || 6000;
    let last = 0, fired = false;
    return {
      arm(t) { last = t; fired = false; },
      hit(t) { last = t; fired = false; },
      tick(t, due) { if (!due || fired || t - last < silence) return false; fired = true; return true; },
    };
  }

  /* ------------------------------------------------------------------ browser glue */
  async function buildClassifier(slot) {
    const M = BBH.Mic, saved = loadProfile(slot);
    if (saved) return { cls: M.makeClassifier(saved.profiles), source: 'calibrated', quality: saved.quality };
    try {
      const by = {}, S = BBH.Samples; let any = false;
      if (S && S.get) for (let l = 0; l < 4; l++) { const sm = await S.get(slot || 1, l); if (sm) { by[l] = sm.f32 || sm.data; any = true; } }
      if (any) return { cls: M.makeClassifier(M.trainFromSamples(by, M.sampleRate() || 44100)), source: 'samples', quality: 0 };
    } catch (e) { /* fall through */ }
    return { cls: M.makeClassifier(), source: 'default', quality: 0 };
  }
  /** start({ slot, settings, onHit(ev), classifier? }) -> { ok, stop, cls, source } | { ok:false, error } */
  async function start(o) {
    const M = BBH.Mic;
    if (!M || !M.open) return { ok: false, error: 'unsupported' };
    const r = await M.open();
    if (!r || !r.ok) return { ok: false, error: (r && r.error) || 'unavailable' };
    const st = o.settings || {};
    if (typeof st.micLat === 'number' && isFinite(st.micLat)) M.setLatencyMs(st.micLat);
    const b = o.classifier ? { cls: o.classifier, source: 'custom', quality: 0 } : await buildClassifier(o.slot);
    const unsub = M.listen((ev) => o.onHit(ev), { classifier: b.cls });
    return { ok: true, cls: b.cls, source: b.source, quality: b.quality, stop() { try { unsub(); } catch (e) { /* ignore */ } try { M.close(); } catch (e) { /* ignore */ } } };
  }

  BBH.MicPlay = { LANES, MIN_STRENGTH, Calibrator, LatencyProbe, Watchdog, nearestNote, resolveLane, adapt, serialize, parseProfile, loadProfile, saveProfile, clearProfile, profKey, buildClassifier, start };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
