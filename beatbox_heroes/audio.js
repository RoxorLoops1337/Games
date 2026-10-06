/* BBH.Audio: the whole Beatbox Heroes soundscape, synthesised with Web Audio (no audio files).
 *
 *   - Mouth-beatbox drum voices (B kick, T hat, K snare, Pf breath-clap), humanised on every hit.
 *   - 29 UI / game sfx.
 *   - 12 music tracks composed deterministically in code (chords, bass lines, drum grids, arps, motifs),
 *     scheduled with a 25 ms timer and ~180 ms lookahead, seamless loops, sidechain pump, lo-fi tape touches,
 *     a feedback-delay-network reverb and a filtered echo.
 *   - A backing groove generator for the rhythm game.
 *   - Master bus: compressor + soft clipper (hard ceiling 0.89), so stacked sounds never clip.
 *
 * Audio.create(ctxFactory, {log, manual}) builds an instance on an injected context (tests / offline render);
 * BBH.Audio is such an instance, made lazily with new AudioContext() on first use.
 */
(function (root) {
  'use strict';
  const BBH = root.BBH || (root.BBH = {});

  const MASTER = 0.78, SFXBOOST = 2.3, MUSTRIM = 0.82;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  function hash(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
  function mulberry32(a) { return function () { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  /* ================================================================== COMPOSER (pure, no audio) */
  const PC = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
  const QUAL = {
    '': [0, 4, 7], m: [0, 3, 7], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], '7': [0, 4, 7, 10], m9: [0, 3, 7, 10, 14], maj9: [0, 4, 7, 11, 14],
    '9': [0, 4, 7, 10, 14], '13': [0, 4, 10, 14, 21], sus4: [0, 5, 7], sus2: [0, 2, 7], dim: [0, 3, 6], m7b5: [0, 3, 6, 10], add9: [0, 4, 7, 14],
    '6': [0, 4, 7, 9], m6: [0, 3, 7, 9], '7sus4': [0, 5, 7, 10], '7b9': [0, 4, 7, 10, 13], m11: [0, 3, 7, 10, 14, 17],
  };
  const MODES = {
    minor: [0, 2, 3, 5, 7, 8, 10], major: [0, 2, 4, 5, 7, 9, 11], dorian: [0, 2, 3, 5, 7, 9, 10], mixo: [0, 2, 4, 5, 7, 9, 10], harm: [0, 2, 3, 5, 7, 8, 11],
  };
  function parseChord(name) {
    const m = /^([A-G][#b]?)(.*)$/.exec(name);
    const pc = m && PC[m[1]], iv = m && QUAL[m[2]];
    if (pc == null || !iv) throw new Error('bad chord ' + name);
    return { pc, iv, name };
  }
  const fit = (pc, lo) => { let m = lo - (lo % 12) + pc; if (m < lo) m += 12; return m; };
  function scaleMidi(keyPc, mode, idx, lo) {
    const sc = MODES[mode], L = sc.length, o = Math.floor(idx / L), i = ((idx % L) + L) % L;
    return fit(keyPc, lo) + sc[i] + 12 * o;
  }
  function chordRootIdx(keyPc, mode, pc) {
    const rel = (pc - keyPc + 12) % 12, sc = MODES[mode];
    let best = 0, bd = 99;
    for (let i = 0; i < sc.length; i++) { const d = Math.abs(sc[i] - rel); if (d < bd) { bd = d; best = i; } }
    return best;
  }
  function voicing(ch, lo, hi) {
    let iv = ch.iv.slice();
    if (iv.length > 4) iv = iv.filter((x) => x !== 7).slice(0, 4);
    const base = fit(ch.pc, lo);
    return iv.map((i) => { let n = base + i; while (n > hi) n -= 12; return n; });
  }
  function bassNote(tok, ch, next, lo) {
    const root = fit(ch.pc, lo);
    switch (tok) {
      case '5': return root + 7;
      case '8': return root + 12;
      case '7': return root + (ch.iv[3] != null ? ch.iv[3] % 12 : 10);
      case '3': return root + ch.iv[1];
      case 'a': { const nr = fit(next.pc, lo); return nr === root ? root : nr - 1; }
      default: return root;
    }
  }
  const CELLS_DEFAULT = [[0, 3, 6, 8, 11, 14], [0, 4, 6, 8, 12], [0, 2, 6, 8, 10, 14], [0, 3, 8, 10], [0, 6, 8, 12, 14]];

  function makeMotif(R, id) {
    const L = R.lead, rng = mulberry32(hash(R.id + '/' + id));
    const cells = L.cells || CELLS_DEFAULT;
    const pick = (a) => a[Math.floor(rng() * a.length)];
    const c1 = pick(cells);
    let c2 = pick(cells); if (c2 === c1 && cells.length > 1) c2 = cells[(cells.indexOf(c1) + 1) % cells.length];
    const lo = L.relLo != null ? L.relLo : -2, hi = L.relHi != null ? L.relHi : 8;
    let cur = pick([0, 2, 4]);
    const bars = [];
    [c1, c2].forEach((cell, bi) => {
      const notes = [];
      cell.forEach((s, j) => {
        let rel;
        const lastOn = j === cell.length - 1;
        if (lastOn) rel = bi === 1 ? pick([0, 0, 2, 4]) : pick([1, 2, 4, -1]);
        else if (j === 0) rel = bi === 1 ? pick([0, 2, 4]) : pick([0, 4, 7]);
        else if (s % 4 === 0) {
          const tones = [0, 2, 4, 7, -3, -1, 9].filter((x) => x >= lo && x <= hi);
          rel = tones.reduce((b, x) => (Math.abs(x - cur) + rng() * 1.5 < Math.abs(b - cur) + rng() * 1.5 ? x : b), tones[0]);
        } else rel = clamp(cur + pick([-2, -1, -1, 1, 1, 2]), lo, hi);
        cur = rel;
        const nxt = j < cell.length - 1 ? cell[j + 1] : 16;
        const len = L.stacc ? 1.2 : Math.min(nxt - s, lastOn ? 6 : 5) * (L.hold || 0.92);
        notes.push({ s, rel, len, acc: s % 4 === 0 ? 1 : 0.82 });
      });
      bars.push(notes);
    });
    return bars;
  }

  function compose(R) {
    if (typeof R === 'string') R = RECIPES[R];
    if (!R) return null;
    const rng = mulberry32(hash(R.id));
    const ev = [];
    const keyPc = PC[R.key || 'C'], mode = R.mode || 'minor';
    const motifs = {};
    const swing = R.swing || 0;
    const stepB = (s) => (s + (s & 1 ? swing : 0)) * 0.25;
    let bar0 = 0;
    const push = (e, L) => { if (L) e.L = L; ev.push(e); };
    if (R.build) { R.build(ev); } else
    for (const sec of R.sections) {
      const prog = sec.prog.map((p) => p.split(' ').map(parseChord));
      const SL = sec.L || {};
      for (let bi = 0; bi < sec.bars; bi++) {
        const segs = prog[bi % prog.length], nextSeg = prog[(bi + 1) % prog.length];
        const chordAt = (s) => segs[segs.length === 1 ? 0 : (s < 8 ? 0 : 1)];
        const nextCh = nextSeg[0];
        const B = (bar0 + bi) * 4;
        const last = bi === sec.bars - 1;
        /* drums */
        if (sec.drums) {
          let pat = R.drums[sec.drums];
          if (Array.isArray(pat)) pat = pat[bi % pat.length];
          const fill = last && sec.fill ? sec.fill : null;
          const fs = fill ? (sec.fillFrom != null ? sec.fillFrom : 12) : 16;
          for (const key in pat) {
            const str = pat[key];
            for (let s = 0; s < 16; s++) {
              const c = str[s];
              if (c === '.' || c === ' ' || c === undefined) continue;
              if (s >= fs && 'ksho'.includes(key)) continue;
              const v = c === 'x' ? 1 : c === 'X' ? 1.12 : c === 'o' ? 0.5 : 0.75;
              push({ b: B + stepB(s), k: 'd', d: key, v: v * (0.93 + rng() * 0.1) }, 'hop'.includes(key) ? SL.h : 0);
            }
          }
          if (fill) {
            for (let s = fs; s < 16; s++) {
              const f = (s - fs + 1) / (16 - fs);
              if (fill === 'snare') push({ b: B + stepB(s), k: 'd', d: 's', v: 0.5 + 0.55 * f });
              else if (fill === 'tom') { if (s % 1 === 0) push({ b: B + stepB(s), k: 'd', d: 't', v: 0.8, p: 1.5 - 0.7 * f }); }
              else if (fill === 'beatbox') push({ b: B + stepB(s), k: 'd', d: 'ksch'[(s - fs) % 4], v: 0.8 + 0.2 * f });
              else if (fill === 'kick') { if (s % 2 === 0 || s === 15) push({ b: B + stepB(s), k: 'd', d: 'k', v: 0.9 }); }
              else if (fill === 'hats') push({ b: B + stepB(s), k: 'd', d: s === 15 ? 'o' : 'h', v: 0.5 + 0.4 * f });
            }
          }
        }
        /* bass */
        if (sec.bass) {
          const bp = R.bass[sec.bass];
          const lo = R.bassLo || 31;
          if (bp === 'walk') {
            for (let q = 0; q < 4; q++) {
              const ch = chordAt(q * 4);
              const root = fit(ch.pc, lo);
              let n;
              if (q === 0) n = root;
              else if (q === 3) n = bassNote('a', ch, q === 3 && segs.length === 1 ? nextCh : nextCh, lo);
              else n = root + ch.iv[Math.floor(rng() * 3)] + (rng() < 0.2 ? -12 : 0);
              if (q === 3 && rng() < 0.4) n = fit(nextCh.pc, lo) + 1;
              ev.push({ b: B + q, k: 'bass', n: Math.max(lo - 2, n), d: 0.9, v: q === 0 ? 1 : 0.8 });
            }
          } else {
            const on = [];
            for (let s = 0; s < 16; s++) if (bp[s] !== '.' && bp[s] !== ' ') on.push([s, bp[s]]);
            on.forEach(([s, ch], i) => {
              const nxt = on[i + 1] ? on[i + 1][0] : 16;
              const tok = ch.toLowerCase();
              const ghost = tok === 'g';
              const d = ghost ? 0.12 : Math.min((nxt - s) * 0.25 * (R.bassLeg || 0.92), 2);
              push({ b: B + stepB(s), k: 'bass', n: bassNote(ghost ? 'r' : tok, chordAt(s), nextCh, lo), d, v: ghost ? 0.4 : /[A-Z]/.test(ch) ? 1 : 0.8 }, SL.bass);
            });
          }
        }
        /* pads / keys (chord layers) */
        for (const lay of ['pad', 'keys']) {
          const spec = sec[lay];
          if (!spec) continue;
          const lo = R[lay + 'Lo'] || 50, hi = R[lay + 'Hi'] || 74;
          if (spec === 'hold') {
            segs.forEach((ch, i) => {
              const half = segs.length === 2;
              push({ b: B + (half ? i * 2 : 0), k: lay, n: voicing(ch, lo, hi), d: (half ? 2 : 4) - 0.06, v: 0.9 }, SL[lay]);
            });
          } else {
            const pat = R.pads[spec], on = [];
            for (let s = 0; s < 16; s++) if (pat[s] !== '.' && pat[s] !== ' ') on.push(s);
            on.forEach((s, i) => {
              const nxt = on[i + 1] != null ? on[i + 1] : 16;
              push({ b: B + stepB(s), k: lay, n: voicing(chordAt(s), lo, hi), d: Math.min((nxt - s) * 0.25 * 0.9, R.padLen || 1.5), v: pat[s] === 'X' ? 1 : 0.8 }, SL[lay]);
            });
          }
        }
        /* arp */
        if (sec.arp) {
          const ap = R.arps[sec.arp];
          for (let s = 0; s < 16; s++) {
            const c = ap[s];
            if (c === '.' || c === ' ') continue;
            const vn = voicing(chordAt(s), R.arpLo || 57, R.arpHi || 79);
            const ladder = vn.concat(vn.map((x) => x + 12));
            push({ b: B + stepB(s), k: 'pluck', n: ladder[+c % ladder.length], d: R.arpDur || 0.22, v: (s % 4 === 0 ? 0.95 : 0.7) * (0.9 + rng() * 0.15) }, SL.arp);
          }
        }
        /* lead motif */
        if (sec.lead && R.lead) {
          const id = sec.lead;
          const motif = motifs[id] || (motifs[id] = makeMotif(R, id));
          const barNotes = motif[bi % 2];
          const skip = sec.leadRest && (bi % 4) === 3;
          const ch = chordAt(0);
          const cidx = chordRootIdx(keyPc, mode, ch.pc);
          if (!skip) barNotes.forEach((n, j) => {
            const ch2 = chordAt(n.s);
            let p = scaleMidi(keyPc, mode, chordRootIdx(keyPc, mode, ch2.pc) + n.rel, R.lead.lo || 60);
            void cidx;
            while (p > (R.lead.hi || 88)) p -= 12;
            const e = { b: B + stepB(n.s), k: 'lead', n: p, d: n.len * 0.25, v: n.acc };
            if (R.lead.glide && j > 0 && rng() < R.lead.glide) e.g = barNotes[j - 1].last || p - 2;
            push(e, SL.lead);
          });
        }
        if (sec.crash && bi === 0) ev.push({ b: B, k: 'd', d: 'x', v: 1 });
        if (sec.riser && last) ev.push({ b: B, k: 'riser', d: 4, v: 1 });
      }
      bar0 += sec.bars;
    }
    ev.sort((a, b) => a.b - b.b);
    const beats = R.build ? R.beats : bar0 * 4;
    return { id: R.id, bpm: R.bpm, beats, loop: R.loop !== false, events: ev, key: R.key + (R.mode === 'major' ? '' : ' ' + (R.mode || 'minor')), recipe: R, tail: R.tail || 2 };
  }

  /* -------- recipes -------- */
  const RECIPES = {};
  const D = (o) => o; // readability marker
  RECIPES.title = D({
    id: 'title', bpm: 100, key: 'A', mode: 'minor', kit: 'synth', pump: 0.5, rev: 0.32, dly: 0.28, swing: 0, bassLo: 29, arpLo: 57, arpHi: 81, arpDur: 0.2,
    v: { bass: 'sub', pad: 'synth', pluck: 'saw', lead: 'synth' }, lead: { lo: 64, hi: 88, cells: [[0, 3, 6, 8, 11, 14], [0, 4, 6, 8, 12], [0, 2, 6, 8, 10, 14]] },
    drums: {
      H: { k: 'x..o....x..o....', h: '..o...o...o...o.' },
      A: { k: 'x..o....x..o....', s: '....x.......x...', h: 'o.x.o.x.o.x.o.x.', o: '......x.......x.' },
      B: { k: 'x..o....x..o..x.', s: '....x.......x...', h: 'xoxoxoxoxoxoxoxo', o: '......x.......x.' },
    },
    bass: { A: 'R.r.r.r.R.r.r.8.', B: 'R.rr.r.rR.rr.r.a' },
    arps: { A: '0121324301214352', B: '0.1.2.3.4.3.2.1.', C: '0120120120120125' },
    sections: [
      { bars: 4, prog: ['Am', 'F', 'C', 'G'], drums: 'H', pad: 'hold', arp: 'B', L: { arp: 0 } },
      { bars: 8, prog: ['Am', 'F', 'C', 'G'], drums: 'A', fill: 'snare', bass: 'A', pad: 'hold', arp: 'A', crash: true },
      { bars: 8, prog: ['F', 'G', 'Am', 'Am'], drums: 'B', fill: 'snare', bass: 'B', pad: 'hold', arp: 'A', lead: 'A' },
      { bars: 4, prog: ['Dm', 'Dm', 'E', 'E'], pad: 'hold', arp: 'C', lead: 'B', riser: true },
      { bars: 8, prog: ['Am', 'F', 'Dm', 'E'], drums: 'B', fill: 'snare', bass: 'B', pad: 'hold', arp: 'A', lead: 'B', crash: true },
    ],
  });
  RECIPES.creator = D({
    id: 'creator', bpm: 84, key: 'C', mode: 'major', kit: 'lofi', pump: 0.18, rev: 0.34, dly: 0.2, swing: 0.28, bassLo: 31, lofi: { lp: 5600, crackle: 0.012, wobble: 1 },
    v: { bass: 'lofi', pad: 'warm', keys: 'rhodesSoft', lead: 'kalimbaLead' }, lead: { lo: 64, hi: 84, cells: [[0, 6, 10], [0, 4, 8, 12], [2, 6, 8, 14], [0, 3, 8]], relLo: -1, relHi: 7 },
    pads: { comp: 'x.....x.x.......', sus: 'x...............' },
    drums: {
      A: { k: 'x.....o.x.x.....', s: '....x.......x...', h: 'x.o.x.o.x.o.x.oo' },
      B: { k: 'x.....o.x.x...o.', s: '....x.......x..o', h: 'x.o.x.o.x.o.x.o.', p: '..o...o...o...o.' },
    },
    bass: { A: 'r.....r...5.r...', B: 'r..g..r.g.5...a.' },
    sections: [
      { bars: 4, prog: ['Cmaj9', 'Am9', 'Dm9', 'G13'], keys: 'sus', pad: 'hold' },
      { bars: 8, prog: ['Cmaj9', 'Am9', 'Dm9', 'G13'], drums: 'A', fill: 'hats', bass: 'A', keys: 'comp', pad: 'hold' },
      { bars: 8, prog: ['Fmaj9', 'Em7 A7', 'Dm9', 'G13'], drums: 'B', fill: 'snare', bass: 'B', keys: 'comp', pad: 'hold', lead: 'A', leadRest: true },
      { bars: 8, prog: ['Cmaj9', 'Am9', 'Dm9', 'G13'], drums: 'A', fill: 'hats', bass: 'A', keys: 'comp', pad: 'hold', lead: 'B', leadRest: true },
      { bars: 4, prog: ['Fmaj9', 'Em7 A7', 'Dm9', 'G13'], keys: 'sus', pad: 'hold' },
    ],
  });
  RECIPES.street = D({
    id: 'street', bpm: 92, key: 'E', mode: 'dorian', kit: 'night', pump: 0.25, rev: 0.4, dly: 0.35, swing: 0.12, bassLo: 28, lofi: { lp: 7000, crackle: 0.006 },
    v: { bass: 'moog', pad: 'dark', keys: 'rhodes', pluck: 'pizz', lead: 'muted' }, lead: { lo: 64, hi: 86, cells: [[0, 6, 10, 14], [2, 8, 11], [0, 3, 6, 12], [0, 8, 10]], relLo: -2, relHi: 7 },
    pads: { stab: 'x.....x.....x...', sus: 'x...............' },
    arps: { A: '..0...1...2...1.', B: '0.2.1.2.0.2.1.3.' },
    drums: {
      A: { k: 'x.....x..x......', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', o: '..............x.' },
      B: { k: 'x.....x..x...o..', s: '....x.......x..o', h: 'xox.xox.xox.xox.', r: '..............x.' },
    },
    bass: { A: 'R..g..r..r.g.5..', B: 'R.....r.g.r..a..' },
    sections: [
      { bars: 4, prog: ['Em9', 'Em9', 'Cmaj7', 'D6'], pad: 'hold', arp: 'A', bass: 'A', L: {} },
      { bars: 8, prog: ['Em9', 'Em9', 'Cmaj7', 'D6'], drums: 'A', fill: 'hats', bass: 'A', pad: 'hold', arp: 'A', keys: 'stab' },
      { bars: 8, prog: ['Am9', 'Bm7', 'Cmaj7', 'B7sus4'], drums: 'B', fill: 'snare', bass: 'B', pad: 'hold', arp: 'B', keys: 'stab', lead: 'A', leadRest: true },
      { bars: 8, prog: ['Em9', 'Em9', 'Cmaj7', 'D6'], drums: 'A', fill: 'hats', bass: 'B', pad: 'hold', arp: 'B', keys: 'stab', lead: 'B', leadRest: true },
      { bars: 4, prog: ['Am9', 'Bm7', 'Cmaj7', 'B7sus4'], pad: 'hold', arp: 'A', riser: true },
    ],
  });
  RECIPES.home = D({
    id: 'home', bpm: 78, key: 'F', mode: 'major', kit: 'soft', pump: 0.1, rev: 0.4, dly: 0.2, swing: 0.2, bassLo: 29, lofi: { lp: 5000, crackle: 0.015, wobble: 1 }, arpLo: 55, arpHi: 79, arpDur: 0.5,
    v: { bass: 'lofi', pad: 'warm', keys: 'rhodesSoft', pluck: 'kal', lead: 'flute' }, lead: { lo: 65, hi: 84, cells: [[0, 8], [0, 6, 10], [2, 8, 12], [0, 4, 8, 12]], relLo: -1, relHi: 7, hold: 0.98 },
    arps: { A: '0.1.2.3.2.1.0.1.', B: '0.12.3.1.2.4.3.2' },
    pads: { sus: 'x...............', comp: 'x.......x.......' },
    drums: { A: { k: 'x.......x.x.....', r: '....x.......x...', p: 'o.o.o.o.o.o.o.o.' }, B: { k: 'x.....o.x.x.....', r: '....x.......x..o', p: 'o.x.o.x.o.x.o.x.' } },
    bass: { A: 'r.......5.....r.', B: 'r.....r.....5.a.' },
    sections: [
      { bars: 4, prog: ['Fmaj9', 'Dm9', 'Bbmaj7', 'C13'], pad: 'hold', arp: 'A' },
      { bars: 8, prog: ['Fmaj9', 'Dm9', 'Bbmaj7', 'C13'], drums: 'A', fill: 'hats', bass: 'A', pad: 'hold', arp: 'A', keys: 'comp' },
      { bars: 8, prog: ['Gm9', 'C13', 'Fmaj9', 'Dm9'], drums: 'B', bass: 'B', pad: 'hold', arp: 'B', keys: 'comp', lead: 'A', leadRest: true },
      { bars: 8, prog: ['Fmaj9', 'Dm9', 'Bbmaj7', 'C13'], drums: 'A', fill: 'hats', bass: 'B', pad: 'hold', arp: 'B', keys: 'comp', lead: 'B', leadRest: true },
      { bars: 4, prog: ['Gm9', 'C13', 'Fmaj9', 'Fmaj9'], pad: 'hold', arp: 'A' },
    ],
  });
  RECIPES.park = D({
    id: 'park', bpm: 96, key: 'G', mode: 'major', kit: 'soft', pump: 0.1, rev: 0.45, dly: 0.3, swing: 0.06, bassLo: 31, arpLo: 55, arpHi: 83, arpDur: 0.45,
    v: { bass: 'soft', pad: 'air', keys: 'rhodesSoft', pluck: 'harp', lead: 'flute' }, lead: { lo: 67, hi: 88, cells: [[0, 4, 8, 10, 12], [0, 3, 6, 8, 12], [2, 4, 8, 14], [0, 6, 8, 11, 14]], relLo: -1, relHi: 8, hold: 0.9 },
    arps: { A: '0.1.2.3.2.1.2.4.', B: '012.234.432.210.', C: '0.2.1.3.2.4.3.5.' },
    drums: { A: { k: 'x.......x.......', r: '....x.......x...', p: 'o.o.o.o.o.o.o.o.' }, B: { k: 'x.....x.x.......', r: '....x.......x..x', p: 'xoxoxoxoxoxoxoxo', c: '................' } },
    bass: { A: 'r.....5.r.....5.', B: 'r..5..r.r..5..a.' },
    sections: [
      { bars: 4, prog: ['G', 'D', 'Em7', 'C'], pad: 'hold', arp: 'A' },
      { bars: 8, prog: ['G', 'D', 'Em7', 'C'], drums: 'A', bass: 'A', pad: 'hold', arp: 'B', fill: 'hats' },
      { bars: 8, prog: ['C', 'G', 'Am7', 'D'], drums: 'B', bass: 'B', pad: 'hold', arp: 'C', lead: 'A', fill: 'hats' },
      { bars: 8, prog: ['G', 'D', 'Em7', 'C'], drums: 'B', bass: 'B', pad: 'hold', arp: 'B', lead: 'B', leadRest: true, fill: 'hats' },
      { bars: 4, prog: ['C', 'D', 'G', 'G'], pad: 'hold', arp: 'A' },
    ],
  });
  RECIPES.shop = D({
    id: 'shop', bpm: 104, key: 'C', mode: 'major', kit: 'jazz', pump: 0, rev: 0.3, dly: 0.15, swing: 0.33, bassLo: 29, padLen: 0.6,
    v: { bass: 'upright', pad: 'warm', keys: 'rhodes', pluck: 'pizz', lead: 'brass' }, lead: { lo: 67, hi: 88, stacc: true, cells: [[2, 6, 7, 10, 14], [0, 3, 6, 9, 12], [1, 4, 7, 8, 11, 14], [0, 4, 6, 10, 12]], relLo: -2, relHi: 8 },
    pads: { charl: 'x.....x.........', comp: 'x..x....x..x....' },
    drums: { A: { h: 'x..xx..xx..xx..x', k: 'o...o...o...o...', r: '....o.......o...' }, B: { h: 'x..xx..xx..xx..x', k: 'o...o...o...o..o', s: '....o.......o...', r: '..o...........o.' } },
    bass: { W: 'walk' },
    sections: [
      { bars: 4, prog: ['Dm7', 'G7', 'Cmaj7', 'A7'], bass: 'W', keys: 'charl' },
      { bars: 8, prog: ['Dm7', 'G7', 'Cmaj7', 'A7'], drums: 'A', bass: 'W', keys: 'charl', fill: 'snare', fillFrom: 14 },
      { bars: 8, prog: ['Dm7', 'G7', 'Em7 A7', 'Dm7 G7'], drums: 'B', bass: 'W', keys: 'comp', lead: 'A', leadRest: true, fill: 'snare', fillFrom: 14 },
      { bars: 8, prog: ['Dm7', 'G7', 'Cmaj7', 'A7'], drums: 'B', bass: 'W', keys: 'charl', lead: 'B', leadRest: true, fill: 'snare', fillFrom: 14 },
      { bars: 4, prog: ['Em7 A7', 'Dm7 G7', 'Cmaj7', 'Cmaj7'], drums: 'A', bass: 'W', keys: 'charl' },
    ],
  });
  RECIPES.bar = D({
    id: 'bar', bpm: 98, key: 'E', mode: 'dorian', kit: 'funk', pump: 0, rev: 0.28, dly: 0.2, swing: 0.14, bassLo: 28, padLen: 0.5,
    v: { bass: 'funk', pad: 'dark', keys: 'organ', lead: 'sax' }, lead: { lo: 64, hi: 86, cells: [[0, 3, 6, 8, 11, 14], [2, 4, 7, 10, 12], [0, 3, 6, 10, 13], [0, 6, 8, 11]], relLo: -2, relHi: 7, glide: 0.2 },
    pads: { stab: 'x..x..x...x..x..', long: 'x...............', off: '..x...x...x...x.' },
    drums: {
      A: { k: 'x..x..x...x.....', s: '....x..o..o.x..o', h: 'xoxoxoxoxoxoxoxo', o: '..............x.' },
      B: { k: 'x..x...xx.x.....', s: '....x..o.o..x.xo', h: 'xoxoxoxoxoxoxoxo', o: '......x.......x.' },
    },
    bass: { A: 'R..g.r.g..r.g5r.', B: 'R.rg..Rg..r.g.a.' },
    sections: [
      { bars: 4, prog: ['Em9', 'A13', 'Em9', 'Bm7 A7'], bass: 'A', keys: 'long', drums: 'A', L: {} },
      { bars: 8, prog: ['Em9', 'A13', 'Em9', 'Bm7 A7'], drums: 'A', bass: 'A', keys: 'stab', pad: 'long', fill: 'snare', fillFrom: 13 },
      { bars: 8, prog: ['Gmaj7', 'A9', 'Em9', 'Em9'], drums: 'B', bass: 'B', keys: 'off', pad: 'long', lead: 'A', leadRest: true, fill: 'snare', fillFrom: 13 },
      { bars: 8, prog: ['Em9', 'A13', 'Em9', 'Bm7 A7'], drums: 'B', bass: 'B', keys: 'stab', pad: 'long', lead: 'B', leadRest: true, fill: 'snare', fillFrom: 13 },
      { bars: 4, prog: ['Am9', 'A13', 'Em9', 'Em9'], drums: 'A', bass: 'A', keys: 'stab' },
    ],
  });
  RECIPES.studio = D({
    id: 'studio', bpm: 88, key: 'C', mode: 'major', kit: 'clean', pump: 0.5, rev: 0.45, dly: 0.35, swing: 0, bassLo: 31, arpLo: 60, arpHi: 88, arpDur: 0.3, padLo: 52, padHi: 76,
    v: { bass: 'warm', pad: 'glass', keys: 'rhodesSoft', pluck: 'glock', lead: 'bell' }, lead: { lo: 72, hi: 93, cells: [[0, 6, 12], [0, 4, 8, 12], [2, 8, 14], [0, 6, 8]], relLo: -1, relHi: 7, hold: 0.95 },
    arps: { A: '0.1.2.3.4.3.2.1.', B: '0..1..2..3..4..2', C: '0.2.4.2.0.2.4.5.' },
    drums: { A: { k: 'x.......x.......', c: '........x.......', h: '..o...o...o...o.' }, B: { k: 'x...x...x...x...', c: '....x.......x...', h: '..o...o...o...o.', p: 'o.o.o.o.o.o.o.o.' } },
    bass: { A: 'r.......5.......', B: 'r.....r.r.....5.' },
    sections: [
      { bars: 4, prog: ['Cmaj7', 'Em7', 'Fmaj7', 'G6'], pad: 'hold', arp: 'A' },
      { bars: 8, prog: ['Cmaj7', 'Em7', 'Fmaj7', 'G6'], drums: 'A', bass: 'A', pad: 'hold', arp: 'B', fill: 'hats' },
      { bars: 8, prog: ['Am7', 'Fmaj7', 'Cmaj7', 'G6'], drums: 'B', bass: 'B', pad: 'hold', arp: 'C', lead: 'A', fill: 'hats', leadRest: true },
      { bars: 8, prog: ['Cmaj7', 'Em7', 'Fmaj7', 'G6'], drums: 'B', bass: 'B', pad: 'hold', arp: 'B', lead: 'B', fill: 'hats', leadRest: true },
      { bars: 4, prog: ['Am7', 'Fmaj7', 'Cmaj7', 'Cmaj7'], pad: 'hold', arp: 'A' },
    ],
  });
  RECIPES.battle = D({
    id: 'battle', bpm: 140, key: 'E', mode: 'minor', kit: 'bb', pump: 0.3, rev: 0.2, dly: 0.2, swing: 0, bassLo: 28, arpLo: 52, arpHi: 80, arpDur: 0.2, padLen: 0.35, padLo: 52, padHi: 72,
    v: { bass: 'reese', pad: 'synth', pluck: 'saw', lead: 'synth' }, lead: { lo: 64, hi: 88, cells: [[0, 2, 6, 8, 10, 14], [0, 3, 6, 8, 12, 14], [0, 2, 4, 8, 11, 14], [0, 6, 8, 10, 12]], relLo: -2, relHi: 8 },
    pads: { stab: 'x..x..x.x..x....', hit: 'x.......x.......' },
    arps: { A: '0.1.2.0.1.2.0.1.', B: '0120120120120120', C: '0.2.0.2.0.2.0.2.' },
    drums: {
      A: { k: 'x.....x...x.....', s: '....x..o.o..x..o', h: 'xoxoxoxoxoxoxoxo', o: '..............x.' },
      B: { k: 'x.....x..xx...x.', s: '....x..o.o..x.o.', h: 'xxxoxxxoxxxoxxxo', o: '......x.......x.' },
      H: { k: 'x.......x.......', s: '........x.......', h: 'x.x.x.x.x.x.x.x.' },
    },
    bass: { A: 'R.rr.r.rR.r.rr.r', B: 'R.rrRr.rR.rrr.a.' },
    sections: [
      { bars: 4, prog: ['Em', 'Em', 'C', 'D'], drums: 'A', fill: 'beatbox', keys: 'hit', arp: 'A' },
      { bars: 8, prog: ['Em', 'Em', 'C', 'D'], drums: 'A', fill: 'beatbox', bass: 'A', pad: 'stab', arp: 'B', crash: true },
      { bars: 8, prog: ['Em', 'C', 'G', 'D'], drums: 'B', fill: 'snare', bass: 'B', pad: 'stab', arp: 'B', lead: 'A' },
      { bars: 4, prog: ['C', 'C', 'D', 'D'], drums: 'H', fill: 'tom', arp: 'C', pad: 'hold', riser: true },
      { bars: 8, prog: ['Em', 'C', 'G', 'D'], drums: 'B', fill: 'beatbox', bass: 'B', pad: 'stab', arp: 'B', lead: 'B', crash: true },
    ],
  });
  RECIPES.intro = D({
    id: 'intro', bpm: 66, key: 'D', mode: 'minor', kit: 'soft', pump: 0, rev: 0.55, dly: 0.3, swing: 0, bassLo: 26, arpLo: 50, arpHi: 74, arpDur: 1.1, padLo: 48, padHi: 70,
    v: { bass: 'warm', pad: 'strings', keys: 'piano', pluck: 'pianoNote', lead: 'piano' }, lead: { lo: 62, hi: 82, cells: [[0, 8], [0, 6, 10], [0, 4, 8, 12], [2, 8]], relLo: -2, relHi: 7, hold: 1.4 },
    arps: { A: '0.1.2.1.0.1.2.4.', B: '0...1...2...1...' },
    pads: { sus: 'x...............' },
    bass: { A: 'r...............' },
    sections: [
      { bars: 4, prog: ['Dm', 'Bb', 'Gm', 'A'], arp: 'A' },
      { bars: 8, prog: ['Dm', 'Bb', 'Gm', 'A'], arp: 'A', lead: 'A', bass: 'A', leadRest: true },
      { bars: 8, prog: ['Bb', 'F', 'Gm', 'A7'], arp: 'B', pad: 'hold', lead: 'B', bass: 'A', leadRest: true },
      { bars: 4, prog: ['Dm', 'Bb', 'Gm', 'Dm'], arp: 'B', pad: 'hold' },
    ],
  });
  /* stings: hand-written, not looping */
  RECIPES.victory = D({
    id: 'victory', bpm: 126, key: 'C', mode: 'major', kit: 'bb', pump: 0, rev: 0.35, dly: 0.2, loop: false, beats: 8, tail: 2.5,
    v: { bass: 'sub', pad: 'brassPad', pluck: 'glock', lead: 'brass' },
    build(ev) {
      const L = (b, n, d, v) => ev.push({ b, k: 'lead', n, d, v: v == null ? 0.9 : v });
      L(0, 67, 0.4); L(0.5, 72, 0.4); L(1, 76, 0.4); L(1.5, 79, 1.2, 1);
      L(2.75, 76, 0.2, 0.8); L(3, 79, 0.2, 0.8); L(3.25, 84, 2.2, 1);
      ev.push({ b: 3, k: 'pad', n: [60, 64, 67, 72], d: 3, v: 1 }, { b: 3, k: 'bass', n: 36, d: 2.5, v: 1 }, { b: 3, k: 'd', d: 'x', v: 1 });
      ev.push({ b: 0, k: 'd', d: 'k', v: 1 }, { b: 1, k: 'd', d: 'k', v: 0.9 }, { b: 3, k: 'd', d: 'k', v: 1 });
      for (let i = 0; i < 4; i++) ev.push({ b: 2 + i * 0.25, k: 'd', d: 's', v: 0.5 + i * 0.15 });
      ev.push({ b: 1, k: 'd', d: 'c', v: 0.8 }, { b: 2, k: 'd', d: 'c', v: 0.8 });
      [84, 88, 91, 96, 100].forEach((n, i) => ev.push({ b: 4.5 + i * 0.25, k: 'pluck', n, d: 0.4, v: 0.7 }));
    },
  });
  RECIPES.defeat = D({
    id: 'defeat', bpm: 72, key: 'A', mode: 'minor', kit: 'soft', pump: 0, rev: 0.5, dly: 0.25, loop: false, beats: 8, tail: 3,
    v: { bass: 'warm', pad: 'dark', pluck: 'kal', lead: 'sad' },
    build(ev) {
      const L = (b, n, d, v, g) => { const e = { b, k: 'lead', n, d, v: v == null ? 0.9 : v }; if (g) e.g = g; ev.push(e); };
      L(0, 64, 0.9); L(1, 62, 0.9); L(2, 60, 0.9); L(3, 59, 0.9, 0.9); L(4, 57, 3, 1, 59);
      ev.push({ b: 0, k: 'pad', n: [57, 60, 64], d: 3.9, v: 0.9 }, { b: 4, k: 'pad', n: [57, 60, 64], d: 3.5, v: 1 }, { b: 0, k: 'bass', n: 33, d: 3.8, v: 1 }, { b: 4, k: 'bass', n: 33, d: 3.5, v: 1 });
      ev.push({ b: 0, k: 'd', d: 'k', v: 0.9 }, { b: 2, k: 'd', d: 't', v: 0.7, p: 0.7 }, { b: 4, k: 'd', d: 'k', v: 0.8 });
    },
  });
  const MUSIC_IDS = ['title', 'creator', 'street', 'home', 'park', 'shop', 'bar', 'studio', 'battle', 'victory', 'defeat', 'intro'];
  const composed = {};
  function composeCached(id) { return composed[id] || (composed[id] = compose(id)); }

  /* ----- groove (rhythm game backing) ----- */
  const GROOVE = [
    { name: 'boombap', key: 'A', mode: 'minor', prog: ['Am7', 'Fmaj7', 'Dm7', 'E7'], swing: 0.2, bass: 'r.....r...5.....', kick: 'x.........x.....', snare: '..........x.....', hat: 'x.x.x.x.x.x.x.x.', pad: 'x.......x.......' },
    { name: 'house', key: 'C', mode: 'minor', prog: ['Cm7', 'Ab', 'Eb', 'Bb'], swing: 0, bass: '..r...r...r...r.', kick: 'x...x...x...x...', snare: '................', hat: '..x...x...x...x.', pad: 'x.......x.......' },
    { name: 'trap', key: 'F', mode: 'minor', prog: ['Fm', 'Db', 'Ab', 'Eb'], swing: 0, bass: 'R.......r.r.....', kick: 'x.......x.......', snare: '........x.......', hat: 'x.x.x.xxx.x.x.xx', pad: 'x...............' },
    { name: 'twostep', key: 'G', mode: 'minor', prog: ['Gm7', 'Eb', 'Bb', 'F'], swing: 0.08, bass: 'r.....r.....r...', kick: 'x.........x.....', snare: '....x.......x...', hat: 'x.x.xxx.x.x.xxx.', pad: 'x.......x.......' },
  ];
  function composeGroove(bpm, style, bars) {
    const G = GROOVE[clamp(Math.floor(num(style, 0)), 0, 3)];
    const R = {
      id: 'groove' + G.name, bpm, key: G.key, mode: G.mode, kit: 'groove', pump: 0.35, rev: 0.12, dly: 0.1, swing: G.swing, bassLo: 29, arpLo: 55, arpHi: 79, padLo: 50, padHi: 72,
      v: { bass: style === 2 ? 'reese' : 'lofi', pad: 'warm', keys: 'rhodesSoft', pluck: 'pizz' },
      pads: { c: G.pad }, bass: { A: G.bass }, arps: { A: '0.1.2.1.0.1.2.3.' },
      drums: { A: { k: G.kick, s: G.snare.replace(/x/g, 'o'), h: G.hat.replace(/x/g, 'o') } },
      sections: [{ bars, prog: G.prog, drums: 'A', bass: 'A', keys: 'c', pad: 'hold', arp: 'A', L: { h: 0.2, bass: 0.4, keys: 0.6, pad: 0.7, arp: 0.85 } }],
    };
    const C = compose(R);
    C.beats = bars * 4;
    return C;
  }

  /* ================================================================== KITS and PRESETS */
  const KIT_BASE = {
    kick: { f0: 170, f1: 52, drop: 0.04, len: 0.32, click: 0.6, lip: 0.4, sat: 3.2, lv: 0.95 },
    snare: { f: 190, len: 0.15, nlen: 0.17, bp: 2100, hp: 700, body: 0.7, noise: 1, click: 0.7, lv: 1 },
    hat: { hp: 5200, bp: 8800, q: 1.0, len: 0.05, open: 0.2, lv: 1.7 },
    clap: { bp: 3000, q: 0.8, len: 0.11, lip: 0.55, lv: 1.15 },
    rim: { f: 1700, lv: 0.8 },
    tom: { f: 150, len: 0.3, lv: 0.9 },
    shaker: { bp: 6500, len: 0.06, lv: 0.9 },
    lp: 0, gain: 1,
  };
  const KITS = {
    bb: {},
    synth: { kick: { f0: 140, f1: 42, len: 0.42, click: 0.3, lip: 0.15, sat: 1.6 }, snare: { f: 205, len: 0.2, nlen: 0.26, body: 0.4 }, hat: { len: 0.045, lv: 1.2 }, gain: 0.95 },
    lofi: { kick: { f0: 120, f1: 50, len: 0.3, click: 0.1, lip: 0.2, sat: 1.4, lv: 0.95 }, snare: { f: 175, nlen: 0.19, bp: 2000, hp: 700, click: 0.2, body: 0.7, lv: 0.9 }, hat: { hp: 4200, bp: 7000, len: 0.04, lv: 1.0 }, lp: 6000, gain: 0.9 },
    night: { kick: { f0: 150, f1: 46, len: 0.34, click: 0.25, lip: 0.2 }, snare: { f: 180, bp: 2300, nlen: 0.22, click: 0.3 }, hat: { len: 0.04, lv: 1.2 }, rim: { f: 1500, lv: 0.9 }, lp: 8000, gain: 0.95 },
    soft: { kick: { f0: 110, f1: 52, len: 0.26, click: 0.08, lip: 0.15, sat: 1.2, lv: 0.85 }, snare: { f: 170, nlen: 0.12, body: 0.5, click: 0.15, lv: 0.6 }, rim: { f: 1250, lv: 0.9 }, hat: { hp: 4800, len: 0.035, lv: 0.9 }, shaker: { lv: 0.9 }, lp: 7500, gain: 0.85 },
    jazz: { kick: { f0: 100, f1: 55, len: 0.22, click: 0.05, lip: 0.1, sat: 1, lv: 0.8 }, snare: { f: 200, nlen: 0.2, bp: 4200, hp: 1800, body: 0.2, click: 0.05, lv: 0.6 }, hat: { hp: 5500, bp: 8000, len: 0.1, lv: 0.9, open: 0.3 }, rim: { f: 1900, lv: 0.9 }, lp: 9000, gain: 0.9 },
    funk: { kick: { f0: 160, f1: 54, len: 0.22, click: 0.5, lip: 0.2, sat: 2.4 }, snare: { f: 215, nlen: 0.14, click: 0.85, body: 0.6 }, hat: { len: 0.04, lv: 1.3 }, gain: 0.95 },
    clean: { kick: { f0: 135, f1: 48, len: 0.3, click: 0.25, lip: 0.1, sat: 1.2 }, clap: { len: 0.14, lv: 1.0 }, hat: { len: 0.04, lv: 1.0 }, gain: 0.9 },
    groove: { kick: { f0: 120, f1: 48, len: 0.26, click: 0.2, lip: 0.2, lv: 0.7 }, snare: { f: 170, nlen: 0.1, lv: 0.5 }, hat: { len: 0.03, lv: 0.9 }, clap: { lv: 0.7 }, lp: 5500, gain: 0.8 },
  };
  function kitOf(name) {
    const k = KITS[name] || {}, o = {};
    for (const key in KIT_BASE) o[key] = typeof KIT_BASE[key] === 'object' ? Object.assign({}, KIT_BASE[key], k[key] || {}) : (k[key] != null ? k[key] : KIT_BASE[key]);
    return o;
  }
  const BASS = {
    sub: { w: 'sawtooth', w2: 'square', det: 7, sub: 0.75, c1: 1100, c0: 280, fd: 0.2, q: 3, a: 0.004, d: 0.18, s: 0.7, r: 0.06, lv: 0.5, drive: 1.5 },
    reese: { w: 'sawtooth', w2: 'sawtooth', det: 20, sub: 0.7, c1: 1800, c0: 320, fd: 0.22, q: 5, a: 0.004, d: 0.2, s: 0.75, r: 0.05, lv: 0.42, drive: 2.5 },
    lofi: { w: 'triangle', w2: 'sine', det: 0, sub: 0.0, c1: 700, c0: 380, fd: 0.2, q: 1, a: 0.01, d: 0.3, s: 0.65, r: 0.12, lv: 0.62, drive: 0 },
    moog: { w: 'sawtooth', w2: 'square', det: 4, sub: 0.6, c1: 1600, c0: 230, fd: 0.2, q: 8, a: 0.004, d: 0.14, s: 0.6, r: 0.06, lv: 0.5, drive: 1.5 },
    funk: { w: 'sawtooth', w2: 'square', det: 3, sub: 0.55, c1: 2600, c0: 330, fd: 0.1, q: 5, a: 0.003, d: 0.09, s: 0.4, r: 0.04, lv: 0.5, drive: 1.8 },
    upright: { w: 'triangle', w2: 'sine', det: 0, sub: 0.0, c1: 1100, c0: 450, fd: 0.12, q: 0.7, a: 0.006, d: 0.34, s: 0.2, r: 0.1, lv: 0.75, click: 0.35, drive: 0 },
    soft: { w: 'triangle', w2: 'sine', det: 0, sub: 0, c1: 900, c0: 420, fd: 0.2, q: 0.7, a: 0.012, d: 0.3, s: 0.55, r: 0.14, lv: 0.62, drive: 0 },
    warm: { w: 'sine', w2: 'triangle', det: 0, sub: 0, c1: 600, c0: 400, fd: 0.2, q: 0.7, a: 0.015, d: 0.3, s: 0.75, r: 0.18, lv: 0.6, drive: 0 },
  };
  const PAD = {
    warm: { w: 'triangle', w2: 'sawtooth', a2: 0.28, det: 9, c0: 700, c1: 1500, a: 0.3, r: 0.7, lv: 0.2, lfo: [0.55, 7] },
    synth: { w: 'sawtooth', w2: 'sawtooth', a2: 1, det: 13, c0: 500, c1: 2600, a: 0.1, r: 0.45, lv: 0.15, lfo: null },
    glass: { w: 'sine', w2: 'triangle', a2: 0.5, det: 5, c0: 2500, c1: 4800, a: 0.6, r: 1.0, lv: 0.22, lfo: [0.3, 4], oct: 0.35 },
    dark: { w: 'sawtooth', w2: 'triangle', a2: 0.4, det: 10, c0: 380, c1: 800, a: 0.5, r: 1.0, lv: 0.2, lfo: [0.3, 5] },
    air: { w: 'triangle', w2: 'sine', a2: 0.7, det: 6, c0: 1800, c1: 3200, a: 0.35, r: 0.8, lv: 0.16, lfo: [0.4, 4], oct: 0.25 },
    strings: { w: 'sawtooth', w2: 'triangle', a2: 0.3, det: 11, c0: 600, c1: 1400, a: 0.9, r: 1.2, lv: 0.17, lfo: [5.2, 9] },
    brassPad: { w: 'sawtooth', w2: 'square', a2: 0.3, det: 8, c0: 1800, c1: 3600, a: 0.02, r: 0.9, lv: 0.16, lfo: null },
  };
  const KEYS = {
    rhodes: { ratio: 1, idx: 1.7, ie: 0.22, tine: 0.07, dec: 1.7, lp: 4200, lv: 0.2, chor: 0 },
    rhodesSoft: { ratio: 1, idx: 1.1, ie: 0.2, tine: 0.04, dec: 1.4, lp: 2800, lv: 0.2, chor: 0 },
    piano: { ratio: 1, idx: 2.4, ie: 0.3, tine: 0.1, dec: 2.8, lp: 6500, lv: 0.24, chor: 3, hammer: 0.1 },
    organ: { ratio: 2, idx: 0.7, ie: 0.7, tine: 0, dec: 0, sus: 0.8, lp: 3400, lv: 0.14, chor: 5 },
    bell: { ratio: 3.5, idx: 1.4, ie: 0.15, tine: 0, dec: 2.2, lp: 9000, lv: 0.17, chor: 0 },
  };
  const PLUCK = {
    saw: { w: 'sawtooth', w2: 'square', det: 8, c1: 4200, c0: 600, fd: 0.14, q: 4, dec: 0.24, lv: 0.28 },
    kal: { w: 'sine', c1: 5000, c0: 5000, fd: 0.1, q: 0.5, dec: 0.55, lv: 0.34, part: [[4.0, 0.2, 0.12], [9.2, 0.05, 0.05]], tick: 0.06 },
    harp: { w: 'triangle', w2: 'sine', det: 0, c1: 3800, c0: 1400, fd: 0.35, q: 0.7, dec: 1.0, lv: 0.3, part: [[2, 0.2, 0.4]] },
    pizz: { w: 'triangle', w2: 'sine', det: 0, c1: 2200, c0: 420, fd: 0.14, q: 1, dec: 0.2, lv: 0.34 },
    glock: { w: 'sine', c1: 9000, c0: 9000, fd: 0.1, q: 0.5, dec: 0.9, lv: 0.26, part: [[2.76, 0.3, 0.4], [5.4, 0.12, 0.18]], tick: 0.05 },
    pianoNote: { eng: 'keys', keys: 'piano', vscale: 0.35 },
  };
  const LEAD = {
    synth: { osc: [['sawtooth', -9, 0.5], ['sawtooth', 9, 0.5], ['square', 0, 0.22]], c1: 4200, c0: 2200, fd: 0.25, q: 2, a: 0.012, r: 0.14, lv: 0.2, vib: [5.5, 12, 0.18] },
    brass: { osc: [['sawtooth', -5, 0.6], ['sawtooth', 4, 0.6]], c1: 3200, c0: 1400, fd: 0.09, q: 1.5, a: 0.022, r: 0.08, lv: 0.2, vib: [5, 7, 0.2] },
    flute: { osc: [['sine', 0, 0.85], ['triangle', 0, 0.12]], c1: 5200, c0: 5200, fd: 0.1, q: 0.5, a: 0.06, r: 0.16, lv: 0.26, vib: [5, 9, 0.25], breath: 0.04 },
    sax: { osc: [['sawtooth', 0, 0.55], ['square', 0, 0.2]], c1: 2600, c0: 1400, fd: 0.15, q: 3, a: 0.03, r: 0.1, lv: 0.4, vib: [5.2, 10, 0.3], breath: 0.03 },
    muted: { osc: [['square', 0, 0.5], ['sawtooth', 0, 0.2]], c1: 1800, c0: 900, fd: 0.2, q: 4, a: 0.02, r: 0.12, lv: 0.2, vib: [4.5, 8, 0.25] },
    sad: { osc: [['sawtooth', -6, 0.5], ['sawtooth', 6, 0.5]], c1: 1100, c0: 450, fd: 0.6, q: 1.5, a: 0.08, r: 0.35, lv: 0.22, vib: [4.5, 16, 0.1] },
    piano: { eng: 'keys', keys: 'piano', vscale: 0.6 },
    bell: { eng: 'keys', keys: 'bell', vscale: 1.0 },
    kalimbaLead: { eng: 'pluck', pluck: 'kal', vscale: 0.5 },
  };

  const MIXK = { bass: 1, pad: 0.75, keys: 1.4, pluck: 2.4, lead: 3.4 };

  /* ================================================================== ENGINE */
  function create(ctxFactory, copts) {
    copts = copts || {};
    const LOG = copts.log ? [] : null;
    let ctx = null, dead = false, G = null;
    let muted = false;
    const vol = { music: 0.8, sfx: 0.9 };
    let pending = null, track = null, groove = null, intensity = 0.6, timer = null;
    const dying = [];
    let voices = 0;
    let RND = Math.random;
    const rnd = () => RND();
    let noiseBuf = null, pinkBuf = null;
    let curDomain = null;

    const usable = () => !!ctx && ctx.state !== 'closed';
    const running = () => usable() && (ctx.state === undefined || ctx.state === 'running');

    function ensure() {
      if (ctx) return usable() ? ctx : null;
      if (dead) return null;
      try {
        const c = ctxFactory();
        if (!c || typeof c.createGain !== 'function') { dead = true; return null; }
        ctx = c;
        build();
      } catch (e) { ctx = null; G = null; dead = true; return null; }
      return ctx;
    }

    /* ---- graph ---- */
    const mkGain = (v) => { const g = ctx.createGain(); g.gain.value = v; return g; };
    const biq = (type, f, q) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q != null) b.Q.value = q; return b; };
    function chain() { for (let i = 0; i < arguments.length - 1; i++) arguments[i].connect(arguments[i + 1]); return arguments[arguments.length - 1]; }
    function setp(p, v) {
      try { const t = ctx.currentTime; p.cancelScheduledValues(t); p.setTargetAtTime(v, t, 0.03); } catch (e) { try { p.value = v; } catch (e2) { /* ignore */ } }
    }
    function makeNoise() {
      const sr = ctx.sampleRate, n = Math.floor(sr * 2.2);
      const r = mulberry32(0xB0B0);
      noiseBuf = ctx.createBuffer(1, n, sr);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = r() * 2 - 1;
      pinkBuf = ctx.createBuffer(1, n, sr);
      const p = pinkBuf.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < n; i++) { const w = r() * 2 - 1; b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913; p[i] = (b0 + b1 + b2 + w * 0.1848) * 0.3; }
    }
    function build() {
      G = {};
      makeNoise();
      G.master = mkGain(MASTER);
      const comp = ctx.createDynamicsCompressor();
      try { comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.2; } catch (e) { /* ignore */ }
      G.shaper = ctx.createWaveShaper();
      const N = 2049, cv = new Float32Array(N);
      for (let i = 0; i < N; i++) { const x = (i / (N - 1)) * 2 - 1, a = Math.abs(x); cv[i] = (a < 0.6 ? a : 0.6 + 0.36 * Math.tanh((a - 0.6) / 0.36)) * (x < 0 ? -1 : 1); }
      G.shaper.curve = cv;
      chain(G.master, comp, G.shaper, ctx.destination);
      G.mus = mkGain(vol.music * MUSTRIM); G.sfx = mkGain(vol.sfx * SFXBOOST);
      G.mus.connect(G.master); G.sfx.connect(G.master);
      /* reverb: 6-line feedback delay network, damped, circulant feedback */
      G.revIn = mkGain(1);
      const pre = ctx.createDelay(0.1); pre.delayTime.value = 0.012;
      const hp = biq('highpass', 220, 0.7);
      chain(G.revIn, hp, pre);
      const times = [0.0233, 0.0297, 0.0371, 0.0411, 0.0437, 0.0509];
      const lines = times.map((t) => { const d = ctx.createDelay(0.2); d.delayTime.value = t; const lp = biq('lowpass', 3200, 0); const fb = mkGain(0.41); chain(d, lp, fb); return { d, fb }; });
      const revOut = mkGain(0.34);
      lines.forEach((l, i) => { pre.connect(l.d); l.fb.connect(l.d); l.fb.connect(lines[(i + 1) % lines.length].d); l.fb.connect(revOut); });
      revOut.connect(G.master);
      /* echo */
      G.dlyIn = mkGain(1);
      G.dly = ctx.createDelay(2); G.dly.delayTime.value = 0.36;
      const dlp = biq('lowpass', 2400, 0), dhp = biq('highpass', 250, 0.7), dfb = mkGain(0.36), dout = mkGain(0.5);
      chain(G.dlyIn, dhp, G.dly, dlp); dlp.connect(dfb); dfb.connect(G.dly); dlp.connect(dout); dout.connect(G.master);
      /* per-domain send levels follow the user volumes */
      G.mRev = mkGain(vol.music); G.sRev = mkGain(vol.sfx * SFXBOOST); G.mDly = mkGain(vol.music);
      G.drum = mkGain(vol.sfx); G.drum.connect(G.master); G.sRevD = mkGain(vol.sfx); G.sRevD.connect(G.revIn);
      G.mRev.connect(G.revIn); G.sRev.connect(G.revIn); G.mDly.connect(G.dlyIn);
      G.SFX = { bus: G.sfx, rev: G.sRev, dly: null };
      G.DRUM = { bus: G.drum, rev: G.sRevD, dly: null };
      G.MUS = { bus: G.mus, rev: G.mRev, dly: G.mDly };
    }
    function applyVol() {
      if (!G) return;
      setp(G.master.gain, muted ? 0 : MASTER);
      setp(G.mus.gain, vol.music * MUSTRIM); setp(G.sfx.gain, vol.sfx * SFXBOOST); setp(G.drum.gain, vol.sfx); setp(G.sRevD.gain, vol.sfx);
      setp(G.mRev.gain, vol.music); setp(G.sRev.gain, vol.sfx * SFXBOOST); setp(G.mDly.gain, vol.music);
    }

    /* ---- voice plumbing ---- */
    function vc(out) {
      const v = {
        n: 0,
        add(s) { v.n++; voices++; s.onended = () => { voices--; if (--v.n <= 0) { try { out.disconnect(); } catch (e) { /* ignore */ } } }; return s; },
      };
      return v;
    }
    function O(v, type, f, t, t1) { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.start(t); o.stop(t1); return v.add(o); }
    function N(v, t, dur, pink) {
      const s = ctx.createBufferSource(); s.buffer = pink ? pinkBuf : noiseBuf; s.loop = true;
      s.start(t, rnd() * 1.4); s.stop(t + dur); return v.add(s);
    }
    function route(node, o, rev, dly) {
      node.connect(o.bus);
      if (rev > 0 && o.rev) { const g = mkGain(rev); node.connect(g); g.connect(o.rev); }
      if (dly > 0 && o.dly) { const g = mkGain(dly); node.connect(g); g.connect(o.dly); }
    }
    const FLOOR = 0.0003;
    function envAD(p, t, peak, a, dec) {
      if (!(peak > 1e-4)) peak = 1e-4;
      p.setValueAtTime(0, t); p.linearRampToValueAtTime(peak, t + a);
      p.exponentialRampToValueAtTime(Math.max(peak * 0.001, 1e-5), t + a + dec); p.setValueAtTime(0, t + a + dec + 0.002);
    }
    function envADSR(p, t, peak, a, d, s, dur, r) {
      if (!(peak > 1e-4)) peak = 1e-4;
      a = Math.min(a, dur * 0.5); d = Math.min(d, Math.max(0.01, dur - a));
      p.setValueAtTime(0, t); p.linearRampToValueAtTime(peak, t + a);
      const sl = Math.max(peak * s, FLOOR);
      p.exponentialRampToValueAtTime(sl, t + a + d);
      p.setValueAtTime(sl, t + dur);
      p.exponentialRampToValueAtTime(FLOOR, t + dur + r);
      p.setValueAtTime(0, t + dur + r + 0.002);
    }
    function sat(k) {
      const s = ctx.createWaveShaper();
      const N2 = 513, c = new Float32Array(N2), nk = Math.tanh(k);
      for (let i = 0; i < N2; i++) { const x = (i / (N2 - 1)) * 2 - 1; c[i] = Math.tanh(x * k) / nk; }
      s.curve = c; return s;
    }
    const SATC = {};
    function satShared(k) { const key = String(k); if (!SATC[key] || SATC[key].ctx !== ctx) { SATC[key] = { ctx, curve: sat(k).curve }; } const s = ctx.createWaveShaper(); s.curve = SATC[key].curve; return s; }

    /* ================= drums ================= */
    function hum(vv, hv) { return { p: 1 + (rnd() - 0.5) * 0.07 * (hv == null ? 1 : hv), len: 1 + (rnd() - 0.5) * 0.18 * (hv == null ? 1 : hv), v: vv * (1 + (rnd() - 0.5) * 0.14 * (hv == null ? 1 : hv)) }; }
    function kickV(t, vel, K, o, pm, h, rev) {
      const dur = K.len * h.len, mix = mkGain(1), v = vc(mix);
      const g = mkGain(0), g2 = mkGain(0);
      const f0 = K.f0 * pm * h.p, f1 = K.f1 * pm * h.p;
      const body = O(v, 'sine', f0, t, t + dur + 0.05);
      body.frequency.setValueAtTime(f0, t); body.frequency.exponentialRampToValueAtTime(f1 * 1.9, t + K.drop); body.frequency.exponentialRampToValueAtTime(f1, t + K.drop + 0.1);
      const tri = O(v, 'triangle', f0, t, t + dur * 0.6 + 0.05);
      tri.frequency.setValueAtTime(f0, t); tri.frequency.exponentialRampToValueAtTime(f1 * 1.9, t + K.drop); tri.frequency.exponentialRampToValueAtTime(f1, t + K.drop + 0.1);
      const s = satShared(K.sat);
      body.connect(g); tri.connect(g2); g2.gain.value = 0.22;
      envAD(g.gain, t, vel * K.lv * 0.95, 0.0015, dur); envAD(g2.gain, t, vel * K.lv * 0.9 * 0.22, 0.0015, dur * 0.5);
      g.connect(s); g2.connect(s); s.connect(mix);
      if (K.click > 0) { // click: tongue/lip transient
        const n = N(v, t, 0.03), hp = biq('highpass', 1900, 0.7), gc = mkGain(0);
        chain(n, hp, gc); envAD(gc.gain, t, vel * K.click * 0.5, 0.0004, 0.012); gc.connect(mix);
        const tk = O(v, 'triangle', 1500 * pm, t, t + 0.02), gt = mkGain(0);
        tk.frequency.setValueAtTime(1500 * pm, t); tk.frequency.exponentialRampToValueAtTime(250, t + 0.012);
        tk.connect(gt); envAD(gt.gain, t, vel * K.click * 0.22, 0.0004, 0.012); gt.connect(mix);
      }
      if (K.lip > 0) { // lip thump: plosive "b" burst
        const n = N(v, t, 0.06), bp = biq('bandpass', 260 * pm, 1.1), gl = mkGain(0);
        chain(n, bp, gl); envAD(gl.gain, t, vel * K.lip * 1.3, 0.001, 0.03); gl.connect(mix);
        const po = O(v, 'sine', 340 * pm, t, t + 0.05), gp = mkGain(0);
        po.frequency.setValueAtTime(340 * pm, t); po.frequency.exponentialRampToValueAtTime(95 * pm, t + 0.02);
        po.connect(gp); envAD(gp.gain, t, vel * K.lip * 0.45, 0.001, 0.025); gp.connect(mix);
      }
      route(mix, o, rev, 0);
    }
    function snareV(t, vel, S, o, pm, h, rev) {
      const mix = mkGain(1), v = vc(mix);
      const dur = S.len * h.len, nlen = S.nlen * h.len;
      const b1 = O(v, 'triangle', S.f * pm * h.p, t, t + dur + 0.05), g1 = mkGain(0);
      b1.frequency.setValueAtTime(S.f * 1.35 * pm * h.p, t); b1.frequency.exponentialRampToValueAtTime(S.f * pm * h.p, t + 0.04);
      b1.connect(g1); envAD(g1.gain, t, vel * S.body * 0.55, 0.001, dur); g1.connect(mix);
      const b2 = O(v, 'sine', S.f * 1.9 * pm * h.p, t, t + 0.1), g2 = mkGain(0);
      b2.connect(g2); envAD(g2.gain, t, vel * S.body * 0.3, 0.001, 0.07); g2.connect(mix);
      const n = N(v, t, nlen + 0.05), hp = biq('highpass', S.hp * h.p, 0.7), bp = biq('bandpass', S.bp * pm * h.p, 0.65), gn = mkGain(0);
      chain(n, hp, bp, gn); envAD(gn.gain, t, vel * S.noise * 1.5 * S.lv, 0.0012, nlen); gn.connect(mix);
      if (S.click > 0) { // glottal "K" click
        const n2 = N(v, t, 0.02), hp2 = biq('highpass', 3200, 0.7), g3 = mkGain(0);
        chain(n2, hp2, g3); envAD(g3.gain, t, vel * S.click * 0.6, 0.0003, 0.007); g3.connect(mix);
      }
      const s = satShared(1.6); mix.connect(s); route(s, o, rev, 0);
    }
    function hatV(t, vel, H, o, open, pm, h, rev) {
      const dur = (open ? H.open : H.len) * h.len, g = mkGain(0), v = vc(g);
      const n = N(v, t, dur + 0.04), hp = biq('highpass', H.hp * h.p * pm, 0.7), bp = biq('bandpass', H.bp * h.p * pm, H.q);
      chain(n, hp, bp, g);
      const pk = Math.max(vel * H.lv, 1e-4);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(pk, t + 0.0008); g.gain.exponentialRampToValueAtTime(pk * 0.35, t + 0.011);
      g.gain.exponentialRampToValueAtTime(Math.max(pk * 0.001, 1e-5), t + dur); g.gain.setValueAtTime(0, t + dur + 0.002);
      route(g, o, rev, 0);
    }
    function clapV(t, vel, C, o, pm, h, rev) {
      const mix = mkGain(1), v = vc(mix);
      const bp = biq('bandpass', C.bp * pm * h.p, C.q), hp = biq('highpass', 500, 0.7);
      chain(hp, bp, mix);
      [0, 0.011, 0.021].forEach((dt, i) => {
        const n = N(v, t + dt, 0.04), g = mkGain(0);
        n.connect(g); g.connect(hp); envAD(g.gain, t + dt, vel * C.lv * (0.9 + i * 0.2), 0.0006, 0.009);
      });
      const n = N(v, t + 0.02, C.len * h.len + 0.05), g = mkGain(0), bp2 = biq('bandpass', C.bp * 1.1 * pm * h.p, 0.6);
      chain(n, bp2, g); envAD(g.gain, t + 0.02, vel * C.lv * 1.3, 0.003, C.len * h.len); g.connect(mix);
      const po = O(v, 'sine', 460 * pm, t, t + 0.04), gp = mkGain(0); // lip "p" pop
      po.frequency.setValueAtTime(460 * pm, t); po.frequency.exponentialRampToValueAtTime(170 * pm, t + 0.015);
      po.connect(gp); envAD(gp.gain, t, vel * C.lip * 0.25, 0.001, 0.02); gp.connect(mix);
      route(mix, o, rev, 0);
    }
    function rimV(t, vel, Rm, o, pm, h, rev) {
      const mix = mkGain(1), v = vc(mix);
      [1, 2.37].forEach((r, i) => {
        const os = O(v, 'triangle', Rm.f * 0.5 * r * pm, t, t + 0.05), g = mkGain(0);
        os.connect(g); envAD(g.gain, t, vel * Rm.lv * 0.3 / (i + 1), 0.0005, 0.02 * h.len); g.connect(mix);
      });
      const n = N(v, t, 0.03), hp = biq('highpass', 2500, 0.7), g = mkGain(0);
      chain(n, hp, g); envAD(g.gain, t, vel * Rm.lv * 0.4, 0.0004, 0.01); g.connect(mix);
      route(mix, o, rev, 0);
    }
    function tomV(t, vel, T, o, pm, h, rev) {
      const dur = T.len * h.len, g = mkGain(0), v = vc(g);
      const os = O(v, 'sine', T.f * pm * 1.6, t, t + dur + 0.05);
      os.frequency.setValueAtTime(T.f * pm * 1.6, t); os.frequency.exponentialRampToValueAtTime(T.f * pm, t + 0.06);
      const s = satShared(1.5); chain(os, g, s);
      envAD(g.gain, t, vel * T.lv * 0.8, 0.002, dur);
      const n = N(v, t, 0.03), hp = biq('highpass', 1500, 0.7), gc = mkGain(0); chain(n, hp, gc); envAD(gc.gain, t, vel * 0.12, 0.0005, 0.01); gc.connect(s);
      route(s, o, rev, 0);
    }
    function shakerV(t, vel, S, o, pm, h, rev) {
      const dur = S.len * h.len, g = mkGain(0), v = vc(g);
      const n = N(v, t, dur + 0.04), bp = biq('bandpass', S.bp * pm, 1.3), hp = biq('highpass', 3500, 0.7);
      chain(n, hp, bp, g);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(Math.max(vel * S.lv * 1.5, 1e-4), t + 0.012); g.gain.exponentialRampToValueAtTime(1e-4, t + dur); g.gain.setValueAtTime(0, t + dur + 0.002);
      route(g, o, rev, 0);
    }
    function crashV(t, vel, o, rev) {
      const dur = 1.7, g = mkGain(0), v = vc(g);
      const n = N(v, t, dur + 0.05), hp = biq('highpass', 4200, 0.7), bp = biq('peaking', 8000, 0.8); bp.gain.value = 6;
      chain(n, hp, bp, g);
      g.gain.setValueAtTime(0, t); vel = Math.max(vel, 1e-4); g.gain.linearRampToValueAtTime(vel * 0.6, t + 0.004); g.gain.exponentialRampToValueAtTime(vel * 0.16, t + 0.25); g.gain.exponentialRampToValueAtTime(1e-4, t + dur); g.gain.setValueAtTime(0, t + dur + 0.002);
      route(g, o, rev, 0);
    }
    function riserV(t, dur, o, rev) {
      const g = mkGain(0), v = vc(g), n = N(v, t, dur + 0.1, true), bp = biq('bandpass', 400, 2.5);
      chain(n, bp, g);
      bp.frequency.setValueAtTime(400, t); bp.frequency.exponentialRampToValueAtTime(7000, t + dur);
      g.gain.setValueAtTime(0.0004, t); g.gain.exponentialRampToValueAtTime(0.55, t + dur); g.gain.linearRampToValueAtTime(0, t + dur + 0.04);
      route(g, o, rev, 0);
    }
    /** one drum hit by key letter in a kit. pm = pitch multiplier. hv = humanise amount. */
    function kitHit(kit, key, t, vel, o, pm, hv, rev) {
      const h = hum(vel, hv), vv = clamp(h.v * kit.gain, 0, 1.3);
      let dest = o;
      switch (key) {
        case 'k': return kickV(t, vv, kit.kick, dest, pm, h, rev);
        case 's': return snareV(t, vv, kit.snare, dest, pm, h, rev);
        case 'h': return hatV(t, vv, kit.hat, dest, false, pm, h, rev);
        case 'o': return hatV(t, vv, kit.hat, dest, true, pm, h, rev);
        case 'c': return clapV(t, vv, kit.clap, dest, pm, h, rev);
        case 'r': return rimV(t, vv, kit.rim, dest, pm, h, rev);
        case 't': return tomV(t, vv, kit.tom, dest, pm, h, rev);
        case 'p': return shakerV(t, vv, kit.shaker, dest, pm, h, rev);
        case 'x': return crashV(t, vv, dest, rev);
        default: return null;
      }
    }
    const BBKIT = kitOf('bb');
    const LANE_KEYS = ['k', 'h', 's', 'c'];
    function drum(lane, opts) {
      opts = opts || {};
      lane = Math.floor(num(lane, -1));
      if (lane < 0 || lane > 3) return false;
      if (!ensure() || !running() || muted || voices > 260) { if (usable() && !running()) tryResume(); return false; }
      try {
        const vel = Math.pow(clamp(num(opts.vel, 0.9), 0, 1), 1.35), t = Math.max(num(opts.when, 0), ctx.currentTime), pm = clamp(num(opts.pitch, 1), 0.25, 4);
        RND = Math.random;
        let key = LANE_KEYS[lane];
        if (lane === 1 && opts.open) key = 'o';
        kitHit(BBKIT, key, t, vel, G.DRUM, pm, 1, 0.07);
        if (LOG) LOG.push({ k: 'drum', lane, t, vel });
        return true;
      } catch (e) { return false; }
    }

    /* ================= sfx ================= */
    function tone(o, t, p) {
      const dur = p.d, a = p.a == null ? 0.004 : p.a, g = mkGain(0), v = vc(g);
      const os = O(v, p.type || 'sine', p.f, t, t + a + dur + 0.05);
      if (p.f2) { os.frequency.setValueAtTime(p.f, t); os.frequency.exponentialRampToValueAtTime(p.f2, t + (p.fd || dur)); }
      let node = os;
      if (p.lp) { const f = biq('lowpass', p.lp, p.q || 0.7); os.connect(f); node = f; }
      node.connect(g);
      if (p.sus) envADSR(g.gain, t, p.v, a, p.dd || 0.06, p.sus, dur, p.r || 0.08); else envAD(g.gain, t, p.v, a, dur);
      if (p.vib) { const l = O(v, 'sine', p.vib[0], t, t + a + dur + 0.05), lg = mkGain(p.vib[1]); l.connect(lg); lg.connect(os.detune); }
      route(g, o, p.rev || 0, 0);
    }
    function noiz(o, t, p) {
      const dur = p.d, g = mkGain(0), v = vc(g), n = N(v, t, dur + 0.06, p.pink);
      const f = biq(p.ft || 'bandpass', p.f, p.q == null ? 1 : p.q);
      if (p.f2) { f.frequency.setValueAtTime(p.f, t); f.frequency.exponentialRampToValueAtTime(p.f2, t + (p.fd || dur)); }
      chain(n, f, g);
      if (p.swell) { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(p.v, t + p.swell); g.gain.linearRampToValueAtTime(p.v * 0.0, t + dur); }
      else envAD(g.gain, t, p.v, p.a == null ? 0.002 : p.a, dur);
      route(g, o, p.rev || 0, 0);
    }
    const SEMI = (n) => Math.pow(2, n / 12);
    const SFX = {
      click(o, t, p) { tone(o, t, { f: 1500 * p, f2: 950 * p, d: 0.035, v: 0.2, type: 'triangle' }); noiz(o, t, { f: 3500, q: 1, d: 0.012, v: 0.12 }); },
      back(o, t, p) { tone(o, t, { f: 560 * p, f2: 330 * p, d: 0.09, v: 0.22, type: 'triangle', lp: 2500 }); },
      confirm(o, t, p) { tone(o, t, { f: 659 * p, d: 0.1, v: 0.2, type: 'triangle' }); tone(o, t + 0.07, { f: 988 * p, d: 0.2, v: 0.22, type: 'triangle', rev: 0.15 }); tone(o, t + 0.07, { f: 1976 * p, d: 0.12, v: 0.05 }); },
      error(o, t, p) { [0, 0.13].forEach((d) => tone(o, t + d, { f: 150 * p, f2: 120 * p, d: 0.11, v: 0.24, type: 'square', lp: 900 })); tone(o, t, { f: 158 * p, d: 0.2, v: 0.12, type: 'sawtooth', lp: 700 }); },
      coin(o, t, p) { tone(o, t, { f: 1319 * p, d: 0.07, v: 0.22, type: 'square', lp: 6000 }); tone(o, t + 0.06, { f: 1760 * p, d: 0.38, v: 0.22, type: 'square', lp: 6000, rev: 0.1 }); tone(o, t + 0.06, { f: 3520 * p, d: 0.2, v: 0.06 }); },
      buy(o, t, p) { [0, 0.06, 0.12].forEach((d, i) => tone(o, t + d, { f: 1319 * p * SEMI(i * 3), d: 0.08, v: 0.18, type: 'square', lp: 6000 })); tone(o, t + 0.2, { f: 2093 * p, d: 0.5, v: 0.2, type: 'triangle', rev: 0.2 }); tone(o, t + 0.2, { f: 5600 * p, d: 0.25, v: 0.05 }); noiz(o, t, { f: 5000, q: 1, d: 0.03, v: 0.1 }); },
      unlock(o, t, p) { [523, 659, 784, 1046].forEach((f, i) => tone(o, t + i * 0.07, { f: f * p, d: 0.16, v: 0.2, type: 'triangle', rev: 0.15 })); [523, 659, 784, 1046].forEach((f) => tone(o, t + 0.3, { f: f * p, d: 0.9, v: 0.08, type: 'sine', a: 0.02, rev: 0.4 })); },
      levelup(o, t, p) { [392, 494, 587, 784, 988, 1175].forEach((f, i) => tone(o, t + i * 0.075, { f: f * p, d: 0.14, v: 0.17, type: 'sawtooth', lp: 4000 })); [392, 494, 587, 784].forEach((f) => tone(o, t + 0.45, { f: f * p, d: 1.0, v: 0.1, type: 'sawtooth', lp: 2500, a: 0.01, rev: 0.35 })); noiz(o, t + 0.45, { ft: 'highpass', f: 5000, q: 0.7, d: 0.8, v: 0.06, rev: 0.3 }); },
      achievement(o, t, p) { [659, 784, 1319].forEach((f, i) => tone(o, t + i * 0.11, { f: f * p, d: 0.25, v: 0.2, type: 'triangle', rev: 0.25 })); tone(o, t + 0.3, { f: 2637 * p, d: 1.1, v: 0.08, type: 'sine', rev: 0.45 }); tone(o, t + 0.3, { f: 3951 * p, d: 0.8, v: 0.04, type: 'sine', rev: 0.45 }); },
      hit_perfect(o, t, p) { tone(o, t, { f: 2093 * p, d: 0.2, v: 0.22, type: 'triangle', rev: 0.1 }); tone(o, t, { f: 3136 * p, d: 0.12, v: 0.1 }); noiz(o, t, { ft: 'highpass', f: 6000, q: 0.7, d: 0.02, v: 0.09 }); },
      hit_good(o, t, p) { tone(o, t, { f: 1318 * p, d: 0.11, v: 0.18, type: 'triangle' }); },
      miss(o, t, p) { tone(o, t, { f: 150 * p, f2: 70 * p, d: 0.2, v: 0.28, type: 'sine', fd: 0.15 }); noiz(o, t, { ft: 'lowpass', f: 300, q: 0.7, d: 0.1, v: 0.18 }); },
      combo(o, t, p, n) { const s = SEMI(clamp(num(n, 1), 0, 16) * 1); tone(o, t, { f: 880 * p * s, d: 0.08, v: 0.18, type: 'triangle' }); tone(o, t + 0.06, { f: 1320 * p * s, d: 0.22, v: 0.2, type: 'triangle', rev: 0.15 }); tone(o, t + 0.06, { f: 2640 * p * s, d: 0.1, v: 0.05 }); },
      win(o, t, p) { [523, 659, 784, 1046, 1318].forEach((f, i) => tone(o, t + i * 0.09, { f: f * p, d: 0.2, v: 0.18, type: 'sawtooth', lp: 3600 })); [523, 659, 784, 1046].forEach((f) => tone(o, t + 0.5, { f: f * p, d: 1.1, v: 0.1, type: 'sawtooth', lp: 2800, a: 0.01, rev: 0.4 })); crashV(t + 0.5, 0.5, o, 0.2); },
      lose(o, t, p) { [392, 349, 311, 262].forEach((f, i) => tone(o, t + i * 0.2, { f: f * p, f2: f * p * 0.96, d: 0.3, v: 0.2, type: 'sawtooth', lp: 900 + i * -120, rev: 0.25, vib: [5, 14] })); tone(o, t + 0.8, { f: 131 * p, d: 1.0, v: 0.2, type: 'sine', rev: 0.3 }); },
      equip(o, t, p) { noiz(o, t, { f: 2600, q: 1.2, d: 0.05, v: 0.2 }); tone(o, t + 0.03, { f: 880 * p, f2: 1320 * p, d: 0.08, v: 0.15, type: 'square', lp: 4000 }); tone(o, t + 0.1, { f: 1760 * p, d: 0.12, v: 0.1, type: 'triangle' }); },
      swoosh(o, t, p) { noiz(o, t, { f: 500 * p, f2: 2600 * p, q: 1.2, d: 0.28, v: 0.25, swell: 0.1 }); },
      sleep(o, t, p) { [659, 523, 392].forEach((f, i) => tone(o, t + i * 0.3, { f: f * p, d: 0.7, v: 0.14, type: 'sine', a: 0.05, rev: 0.5 })); tone(o, t, { f: 98 * p, d: 1.6, v: 0.1, type: 'sine', a: 0.3, rev: 0.4 }); },
      eat(o, t, p) { [0, 0.11, 0.22].forEach((d, i) => { noiz(o, t + d, { f: 1400 + i * 250, q: 0.9, d: 0.05, v: 0.22 }); tone(o, t + d, { f: 320 * p, f2: 180 * p, d: 0.06, v: 0.2, type: 'triangle' }); }); },
      step(o, t, p) { const j = 0.9 + Math.random() * 0.2; tone(o, t, { f: 120 * p * j, f2: 70 * p * j, d: 0.07, v: 0.2, type: 'sine' }); noiz(o, t, { ft: 'lowpass', f: 700 * j, q: 0.5, d: 0.05, v: 0.1 }); },
      door(o, t, p) { tone(o, t, { f: 140 * p, f2: 70 * p, d: 0.14, v: 0.3, type: 'sine' }); noiz(o, t, { ft: 'lowpass', f: 900, q: 0.7, d: 0.1, v: 0.2 }); noiz(o, t + 0.1, { f: 1800, q: 2, d: 0.03, v: 0.12 }); noiz(o, t + 0.16, { f: 400 * p, f2: 1300 * p, q: 1.5, d: 0.3, v: 0.12, swell: 0.12 }); },
      crowd_cheer(o, t) { [0, 1].forEach((i) => noiz(o, t, { f: i ? 1900 : 780, q: 1.8, d: 1.5, v: 0.22, swell: 0.35, pink: true, rev: 0.2 })); [0, 0.2, 0.45].forEach((d, i) => tone(o, t + d, { f: 480 + i * 70, f2: 760 + i * 90, d: 0.45, v: 0.06, type: 'sawtooth', lp: 1400, a: 0.05, rev: 0.2 })); noiz(o, t + 0.3, { ft: 'highpass', f: 4000, q: 0.7, d: 1.0, v: 0.05, swell: 0.4 }); },
      crowd_boo(o, t) { noiz(o, t, { f: 420, q: 2, d: 1.5, v: 0.3, swell: 0.4, pink: true, rev: 0.2 }); [0, 0.12].forEach((d) => tone(o, t + d, { f: 150, f2: 105, d: 1.3, v: 0.07, type: 'sawtooth', lp: 500, a: 0.2, rev: 0.2, vib: [5.5, 20] })); },
      applause(o, t) {
        const dur = 2.2, g = mkGain(0), v = vc(g), n = N(v, t, dur + 0.1, false), bp = biq('bandpass', 2600, 0.5), hp = biq('highpass', 900, 0.7);
        chain(n, hp, bp, g);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.1, t + 0.25);
        let x = t + 0.25; while (x < t + dur - 0.35) { const a = 0.05 + Math.random() * 0.2; g.gain.linearRampToValueAtTime(a, x + 0.004); g.gain.linearRampToValueAtTime(0.03, x + 0.016); x += 0.012 + Math.random() * 0.03; }
        g.gain.linearRampToValueAtTime(0, t + dur);
        route(g, o, 0.15, 0);
      },
      sparkle(o, t, p) { for (let i = 0; i < 8; i++) tone(o, t + i * 0.045 + Math.random() * 0.02, { f: (2200 + Math.random() * 3800) * p, d: 0.22, v: 0.09, type: 'sine', rev: 0.4 }); },
      whoosh(o, t, p) { noiz(o, t, { f: 200 * p, f2: 3200 * p, q: 1.0, d: 0.55, v: 0.3, swell: 0.28, rev: 0.1 }); tone(o, t, { f: 90 * p, f2: 220 * p, d: 0.4, v: 0.1, type: 'sine', a: 0.15 }); },
      record(o, t, p) { tone(o, t, { f: 1000 * p, d: 0.08, v: 0.18, type: 'square', lp: 3000 }); tone(o, t + 0.11, { f: 1500 * p, d: 0.14, v: 0.18, type: 'square', lp: 3000 }); noiz(o, t, { f: 6000, q: 0.7, d: 0.25, v: 0.04, ft: 'highpass' }); tone(o, t, { f: 70 * p, d: 0.3, v: 0.12, type: 'sine' }); },
      countdown(o, t, p) { tone(o, t, { f: 660 * p, d: 0.12, v: 0.24, type: 'square', lp: 3000 }); tone(o, t, { f: 1320 * p, d: 0.07, v: 0.05, type: 'sine' }); },
      go(o, t, p) { tone(o, t, { f: 1320 * p, d: 0.3, v: 0.24, type: 'square', lp: 4000, rev: 0.1 }); tone(o, t, { f: 1980 * p, d: 0.25, v: 0.1, type: 'triangle' }); tone(o, t, { f: 2640 * p, d: 0.2, v: 0.04 }); },
    };
    const SFX_NAMES = Object.keys(SFX);
    function sfx(name, opts) {
      opts = opts || {};
      if (typeof name !== 'string' || !SFX[name]) return false;
      if (!ensure() || !running() || muted || voices > 260) { if (usable() && ctx.state !== 'running') tryResume(); return false; }
      try {
        const t = Math.max(num(opts.when, 0), ctx.currentTime) + 0.002;
        const o = G.SFX;
        RND = Math.random;
        const vv = clamp(num(opts.vol, 1), 0, 1.5);
        let dest = o;
        if (vv !== 1) { const g = mkGain(vv); g.connect(o.bus); dest = { bus: g, rev: o.rev, dly: o.dly }; if (typeof setTimeout === 'function') setTimeout(() => { try { g.disconnect(); } catch (e) { /* ignore */ } }, 4000); }
        SFX[name](dest, t, clamp(num(opts.pitch, 1), 0.25, 4), opts.n);
        if (LOG) LOG.push({ k: 'sfx', name, t });
        return true;
      } catch (e) { return false; }
    }

    /* ================= music voices ================= */
    function bassV(t, midi, dur, vel, P, o, rev, dly) {
      const f = mtof(midi), g = mkGain(0), v = vc(g), end = t + dur + P.r + 0.05;
      const lp = biq('lowpass', P.c1, P.q);
      lp.frequency.setValueAtTime(P.c1, t); lp.frequency.exponentialRampToValueAtTime(P.c0, t + P.fd);
      const mixIn = mkGain(1);
      const a = O(v, P.w, f, t, end); a.connect(mixIn);
      if (P.w2 && P.det) { const b = O(v, P.w2, f, t, end), c = O(v, P.w, f, t, end); b.detune.value = P.det; c.detune.value = -P.det; const gb = mkGain(0.6); b.connect(gb); gb.connect(mixIn); c.connect(mixIn); }
      else if (P.w2 && !P.det) { const b = O(v, P.w2, f * 2, t, end), gb = mkGain(0.18); b.connect(gb); gb.connect(mixIn); }
      if (P.sub) { const s = O(v, 'sine', f, t, end), gs = mkGain(P.sub); s.connect(gs); gs.connect(mixIn); }
      mixIn.gain.value = 0.55;
      let node = chain(mixIn, lp);
      if (P.drive) { const s = satShared(P.drive); node.connect(s); node = s; }
      node.connect(g);
      envADSR(g.gain, t, vel * P.lv, P.a, P.d, P.s, dur, P.r);
      if (P.click) { const n = N(v, t, 0.03), bp = biq('bandpass', 1400, 1), gc = mkGain(0); chain(n, bp, gc); envAD(gc.gain, t, vel * P.click * 0.25, 0.0005, 0.012); gc.connect(g.gain.value === 0 ? mixIn : mixIn); }
      route(g, o, rev, dly);
    }
    function padV(t, notes, dur, vel, P, o, rev, dly) {
      const out = mkGain(0), v = vc(out), end = t + dur + P.r + 0.1;
      const lpL = biq('lowpass', P.c1, 0.5), lpR = biq('lowpass', P.c1, 0.5);
      lpL.frequency.setValueAtTime(P.c0, t); lpL.frequency.linearRampToValueAtTime(P.c1, t + P.a + 0.35);
      lpR.frequency.setValueAtTime(P.c0, t); lpR.frequency.linearRampToValueAtTime(P.c1, t + P.a + 0.35);
      const gl = mkGain(0.5), gr = mkGain(0.5);
      let lfo = null, lg = null;
      if (P.lfo) { lfo = O(v, 'sine', P.lfo[0] * (0.9 + rnd() * 0.2), t, end); lg = mkGain(P.lfo[1]); lfo.connect(lg); }
      notes.slice(0, 4).forEach((m) => {
        const f = mtof(m);
        const oa = O(v, P.w, f, t, end), ob = O(v, P.w, f, t, end);
        oa.detune.value = -P.det; ob.detune.value = P.det;
        oa.connect(gl); ob.connect(gr);
        if (P.w2 && dur >= 0.6) { const oc = O(v, P.w2, f * 0.5 * 2, t, end), gc = mkGain(P.a2); oc.detune.value = P.det * 0.5; oc.connect(gc); gc.connect(gl); const od = O(v, P.w2, f, t, end), gd = mkGain(P.a2); od.detune.value = -P.det * 0.5; od.connect(gd); gd.connect(gr); if (lg) { lg.connect(oc.detune); lg.connect(od.detune); } }
        if (P.oct) { const oe = O(v, 'sine', f * 2, t, end), ge = mkGain(P.oct * 0.5); oe.connect(ge); ge.connect(gl); ge.connect(gr); }
        if (lg) { lg.connect(oa.detune); lg.connect(ob.detune); }
      });
      gl.connect(lpL); gr.connect(lpR);
      if (ctx.createStereoPanner) {
        const pl = ctx.createStereoPanner(), pr = ctx.createStereoPanner(); pl.pan.value = -0.55; pr.pan.value = 0.55;
        lpL.connect(pl); lpR.connect(pr); pl.connect(out); pr.connect(out);
      } else { lpL.connect(out); lpR.connect(out); }
      envADSR(out.gain, t, vel * P.lv / Math.sqrt(Math.max(1, notes.length) / 3), P.a, 0.4, 0.9, dur, P.r);
      route(out, o, rev, dly);
    }
    function keysV(t, notes, dur, vel, P, o, rev, dly) {
      const out = mkGain(0), v = vc(out), lp = biq('lowpass', P.lp, 0.6);
      lp.connect(out);
      const dec = P.dec ? clamp(dur * 1.4 + 0.25, 0.25, P.dec) : 0;
      const end = t + (P.sus ? dur + 0.3 : dec) + 0.1;
      notes.slice(0, 4).forEach((m, ni) => {
        const f = mtof(m) * (1 + (ni * 0.0005));
        const car = O(v, 'sine', f, t, end), mod = O(v, 'sine', f * P.ratio, t, end), mg = mkGain(f * P.idx);
        mod.connect(mg); mg.connect(car.frequency);
        mg.gain.setValueAtTime(f * P.idx, t); mg.gain.exponentialRampToValueAtTime(Math.max(f * P.idx * P.ie, 0.01), t + Math.max(0.2, dec * 0.35 || 0.5));
        car.connect(lp);
        if (P.chor) { const c2 = O(v, 'sine', f, t, end); c2.detune.value = P.chor; const gc = mkGain(0.5); c2.connect(gc); gc.connect(lp); mg.connect(c2.frequency); }
        if (P.tine) { const tn = O(v, 'sine', f * 5.01, t, t + 0.2), gt = mkGain(0); tn.connect(gt); envAD(gt.gain, t, P.tine, 0.002, 0.07); gt.connect(lp); }
        if (P.hammer) { const n = N(v, t, 0.04), hp = biq('highpass', 2500, 0.7), gh = mkGain(0); chain(n, hp, gh); envAD(gh.gain, t, P.hammer * 0.6, 0.0008, 0.015); gh.connect(lp); }
      });
      const peak = Math.max(vel * P.lv / Math.sqrt(Math.max(1, notes.length) / 2), 1e-4);
      if (P.sus) envADSR(out.gain, t, peak, 0.012, 0.1, P.sus, dur, 0.12);
      else { out.gain.setValueAtTime(0, t); out.gain.linearRampToValueAtTime(peak, t + 0.004); out.gain.exponentialRampToValueAtTime(Math.max(peak * 0.0008, 1e-5), t + dec); out.gain.setValueAtTime(0, t + dec + 0.002); }
      route(out, o, rev, dly);
    }
    function pluckV(t, midi, dur, vel, P, o, rev, dly, T) {
      if (P.eng === 'keys') return keysV(t, [midi], dur, vel * (P.vscale || 1), KEYS[P.keys], o, rev, dly);
      const f = mtof(midi), g = mkGain(0), v = vc(g), end = t + P.dec * 1.2 + 0.05;
      const lp = biq('lowpass', P.c1, P.q);
      lp.frequency.setValueAtTime(P.c1, t); lp.frequency.exponentialRampToValueAtTime(Math.max(P.c0, 60), t + P.fd);
      const mixIn = mkGain(0.6);
      const a = O(v, P.w, f, t, end); a.connect(mixIn);
      if (P.w2) { const b = O(v, P.w2, f, t, end); b.detune.value = P.det || 0; const gb = mkGain(0.5); b.connect(gb); gb.connect(mixIn); }
      chain(mixIn, lp, g);
      envAD(g.gain, t, vel * P.lv, 0.003, P.dec);
      if (P.part) P.part.forEach(([r, am, dc]) => { const pp = O(v, 'sine', f * r, t, t + dc + 0.05), gp = mkGain(0); pp.connect(gp); envAD(gp.gain, t, vel * P.lv * am, 0.002, dc); gp.connect(g.gain.value === 0 ? lp : lp); });
      if (P.tick) { const n = N(v, t, 0.03), hp = biq('highpass', 3000, 0.7), gk = mkGain(0); chain(n, hp, gk); envAD(gk.gain, t, vel * P.tick, 0.0005, 0.012); gk.connect(lp); }
      route(g, o, rev, dly);
      void T;
    }
    function leadV(t, midi, dur, vel, P, o, rev, dly, glideFrom) {
      if (P.eng === 'keys') return keysV(t, [midi], dur, vel * (P.vscale || 1), KEYS[P.keys], o, rev, dly);
      if (P.eng === 'pluck') return pluckV(t, midi, dur, vel * (P.vscale || 1), PLUCK[P.pluck], o, rev, dly);
      const f = mtof(midi), g = mkGain(0), v = vc(g), end = t + dur + P.r + 0.05;
      const lp = biq('lowpass', P.c1, P.q);
      lp.frequency.setValueAtTime(P.c1, t); lp.frequency.exponentialRampToValueAtTime(P.c0, t + P.fd);
      const mixIn = mkGain(0.55);
      let vib = null;
      if (P.vib) { const l = O(v, 'sine', P.vib[0], t, end), lg = mkGain(0); lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(P.vib[1], t + P.vib[2] + 0.2); l.connect(lg); vib = lg; }
      P.osc.forEach(([type, det, am]) => {
        const os = O(v, type, f, t, end); os.detune.value = det;
        if (glideFrom) { const f0 = mtof(glideFrom); os.frequency.setValueAtTime(f0, t); os.frequency.exponentialRampToValueAtTime(f, t + Math.min(0.12, dur * 0.5)); }
        if (vib) vib.connect(os.detune);
        const ga = mkGain(am); os.connect(ga); ga.connect(mixIn);
      });
      chain(mixIn, lp);
      if (P.breath) { const n = N(v, t, dur + P.r + 0.05, true), bp = biq('bandpass', 2200, 0.8), gb = mkGain(0); chain(n, bp, gb); envADSR(gb.gain, t, P.breath * vel, P.a, 0.1, 0.6, dur, P.r); gb.connect(lp); }
      lp.connect(g);
      envADSR(g.gain, t, vel * P.lv, P.a, 0.12, 0.8, dur, P.r);
      route(g, o, rev, dly);
    }

    /* ================= track (music + groove) scheduling ================= */
    function makeBus(C) {
      const R = C.recipe;
      const out = mkGain(0);
      const pumpB = mkGain(1), pumpP = mkGain(1), dr = mkGain(1), ld = mkGain(1);
      let tail = out;
      if (R.lofi) { const lp = biq('lowpass', R.lofi.lp, 0.5); out.connect(lp); tail = lp; }
      tail.connect(G.mus);
      pumpB.connect(out); pumpP.connect(out); dr.connect(out); ld.connect(out);
      const kit = kitOf(R.kit);
      const bus = { out, tail, pumpB, pumpP, dr, ld, kit, nodes: [out, tail, pumpB, pumpP, dr, ld] };
      bus.d = { bus: dr, rev: G.MUS.rev, dly: G.MUS.dly }; bus.b = { bus: pumpB, rev: G.MUS.rev, dly: G.MUS.dly };
      bus.p = { bus: pumpP, rev: G.MUS.rev, dly: G.MUS.dly }; bus.l = { bus: ld, rev: G.MUS.rev, dly: G.MUS.dly };
      return bus;
    }
    function startTrack(C, kind, fade, startAt) {
      const R = C.recipe, spb = 60 / C.bpm, t0 = startAt;
      const bus = makeBus(C);
      bus.out.gain.setValueAtTime(0, t0 - 0.001);
      bus.out.gain.linearRampToValueAtTime(1, t0 + Math.max(0.01, fade));
      bus.pumpB.gain.setValueAtTime(1, t0); bus.pumpP.gain.setValueAtTime(1, t0);
      try { G.dly.delayTime.setValueAtTime(clamp(spb * 0.75, 0.15, 1.2), t0); } catch (e) { /* ignore */ }
      if (R.lofi && R.lofi.crackle) { // vinyl crackle bed
        const cg = mkGain(0), s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
        const hp = biq('highpass', 1800, 0.7), bp = biq('bandpass', 4200, 0.4);
        chain(s, hp, bp, cg); cg.connect(bus.tail); cg.gain.setValueAtTime(R.lofi.crackle, t0);
        try { s.start(t0, rnd()); } catch (e) { /* ignore */ }
        bus.crackle = s; bus.nodes.push(cg);
      }
      const T = {
        kind, C, R, spb, t0, bus, idx: 0, iter: 0, loopLen: C.beats * spb, ended: false, endAt: C.loop ? Infinity : t0 + C.beats * spb + (C.tail || 2),
        rng: mulberry32(hash(C.id) ^ 0x5bd1e995), kit: bus.kit, id: C.id, bpm: C.bpm,
      };
      return T;
    }
    function duck(T, t, amt) {
      const dpr = Math.min(0.26, T.spb * 0.5);
      for (const gnode of [T.bus.pumpB, T.bus.pumpP]) {
        const p = gnode.gain;
        p.linearRampToValueAtTime(1 - amt, t + 0.012);
        p.linearRampToValueAtTime(1, t + 0.012 + dpr);
      }
    }
    function playEvent(T, e, t) {
      const R = T.R, bus = T.bus, v = R.v || {};
      RND = T.rng;
      const spb = T.spb;
      const gate = T.kind === 'groove' && e.L && e.L > intensity;
      if (gate) return;
      const mixg = 1;
      const mk = (k) => (MIXK[k] || 1) * ((R.mix && R.mix[k]) || 1);
      switch (e.k) {
        case 'd': {
          const key = e.d;
          if (key === 'k' && R.pump > 0 && T.kind !== 'sting') duck(T, t, R.pump * clamp(e.v, 0.3, 1.1));
          kitHit(T.kit, key, t, clamp(e.v * mixg, 0, 1.2), bus.d, e.p || 1, 0.6, key === 's' || key === 'c' ? (R.rev || 0.2) * 0.8 : (key === 'x' ? 0.3 : 0.05));
          break;
        }
        case 'bass': bassV(t, e.n, e.d * spb, e.v * mk('bass'), BASS[v.bass || 'sub'], bus.b, 0, 0); break;
        case 'pad': padV(t, e.n, e.d * spb, e.v * mk('pad'), PAD[v.pad || 'warm'], bus.p, R.rev * 0.9, R.dly * 0.15); break;
        case 'keys': keysV(t, e.n, e.d * spb, e.v * mk('keys'), KEYS[v.keys || 'rhodes'], bus.p, R.rev * 0.8, R.dly * 0.35); break;
        case 'pluck': pluckV(t, e.n, e.d * spb, e.v * mk('pluck'), PLUCK[v.pluck || 'saw'], bus.l, R.rev * 0.8, R.dly); break;
        case 'lead': leadV(t, e.n, e.d * spb, e.v * mk('lead'), LEAD[v.lead || 'synth'], bus.l, R.rev, R.dly * 0.9, e.g); break;
        case 'riser': riserV(t, e.d * spb, bus.d, 0.2); break;
        default: break;
      }
      RND = Math.random;
    }
    /** schedule events of track T up to `horizon` (audio seconds). */
    function pump(T, now, horizon) {
      const ev = T.C.events, n = ev.length;
      if (!n) { T.ended = !T.C.loop; return; }
      let guard = 0;
      while (guard++ < 400) {
        if (T.idx >= n) {
          if (!T.C.loop) break;
          T.idx = 0; T.iter++;
        }
        const e = ev[T.idx];
        const t = T.t0 + (T.iter * T.C.beats + e.b) * T.spb;
        if (t >= horizon) break;
        T.idx++;
        if (t < now - 0.12) continue; // timer stalled: drop stale notes instead of bursting them
        if (muted) continue;
        try { playEvent(T, e, Math.max(t, now)); } catch (err) { /* keep going */ }
        if (LOG) LOG.push({ k: 'note', track: T.id, kind: e.k, d: e.d, b: e.b + T.iter * T.C.beats, t, n: e.n, v: e.v });
      }
      if (!T.C.loop && T.idx >= n && now >= T.endAt) T.ended = true;
    }
    function disposeBus(T, fade) {
      const now = ctx.currentTime, b = T.bus;
      try { b.out.gain.cancelScheduledValues(now); b.out.gain.setValueAtTime(b.out.gain.value, now); b.out.gain.linearRampToValueAtTime(0, now + Math.max(0.02, fade)); } catch (e) { /* ignore */ }
      try { if (b.crackle) b.crackle.stop(now + fade + 0.05); } catch (e) { /* ignore */ }
      dying.push({ bus: b, at: now + fade + 0.1, T });
    }
    function reap(now) {
      for (let i = dying.length - 1; i >= 0; i--) {
        if (now >= dying[i].at) { try { dying[i].bus.out.disconnect(); dying[i].bus.tail.disconnect(); } catch (e) { /* ignore */ } dying.splice(i, 1); }
      }
    }
    function tick() {
      if (!usable()) return;
      try {
        const now = ctx.currentTime, hidden = typeof document !== 'undefined' && document && document.hidden, horizon = now + (hidden ? 1.4 : 0.18);
        if (track) {
          pump(track, now, horizon);
          if (track.ended) { const T = track; track = null; disposeBus(T, 0.2); if (LOG) LOG.push({ k: 'music', ev: 'end', id: T.id, t: now }); if (T.onend) { try { T.onend(); } catch (e) { /* ignore */ } } }
        }
        if (groove) pump(groove, now, horizon);
        reap(now);
        if (!track && !groove && !dying.length) stopTimer();
      } catch (e) { /* never throw out of the timer */ }
    }
    function startTimer() { if (timer || copts.manual) return; if (typeof setInterval === 'function') timer = setInterval(tick, 25); }
    function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }
    function tryResume() { try { if (ctx && ctx.state !== 'running' && ctx.state !== 'closed' && typeof ctx.resume === 'function') { const p = ctx.resume(); if (p && p.then) p.then(onRunning, () => {}); } } catch (e) { /* ignore */ } }
    function onRunning() { if (pending && running()) { const p = pending; pending = null; music.play(p.id, p.opts); } }

    /* ================= public API ================= */
    function unlock() {
      try {
        if (!ensure()) return false;
        tryResume();
        try { const b = ctx.createBuffer(1, 1, 22050), s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination); s.start(0); } catch (e) { /* ignore */ }
        if (running()) onRunning();
        return true;
      } catch (e) { return false; }
    }
    function now() { try { return ctx && usable() ? ctx.currentTime : 0; } catch (e) { return 0; } }
    function setMuted(b) { muted = !!b; try { if (G && usable()) applyVol(); } catch (e) { /* ignore */ } }
    function setVolume(o) {
      o = o || {};
      if (typeof o.music === 'number' && isFinite(o.music)) vol.music = clamp(o.music, 0, 1);
      if (typeof o.sfx === 'number' && isFinite(o.sfx)) vol.sfx = clamp(o.sfx, 0, 1);
      try { if (G && usable()) applyVol(); } catch (e) { /* ignore */ }
    }
    const music = {
      play(id, opts) {
        opts = opts || {};
        try {
          const C = typeof id === 'string' && MUSIC_IDS.includes(id) ? composeCached(id) : null;
          if (!C) return false;
          if (!ensure()) return false;
          if (!running()) { pending = { id, opts }; tryResume(); return true; }
          if (track && track.id === id && C.loop && !opts.restart) return true;
          const fade = clamp(num(opts.fade, 0.5), 0, 8);
          if (track) { const old = track; track = null; disposeBus(old, fade); }
          const t0 = ctx.currentTime + 0.06;
          track = startTrack(C, 'music', C.loop ? fade : 0.02, t0);
          track.onend = opts.onend;
          if (LOG) LOG.push({ k: 'music', ev: 'play', id, t: t0 });
          pump(track, ctx.currentTime, ctx.currentTime + 0.18);
          startTimer();
          return true;
        } catch (e) { return false; }
      },
      stop(fade) {
        pending = null;
        try {
          if (!track) return;
          const T = track; track = null;
          disposeBus(T, clamp(num(fade, 0.5), 0.02, 8));
          if (LOG) LOG.push({ k: 'music', ev: 'stop', id: T.id, t: now() });
        } catch (e) { /* ignore */ }
      },
      current() { return track ? track.id : null; },
      bpm() { return track ? track.bpm : groove ? groove.bpm : 0; },
      beat() {
        try {
          if (!track || !usable()) return 0;
          const lat = num(ctx.outputLatency, 0) + num(ctx.baseLatency, 0);
          return Math.max(0, (ctx.currentTime - lat - track.t0) / track.spb);
        } catch (e) { return 0; }
      },
      ids: MUSIC_IDS.slice(),
    };
    const grooveApi = {
      start(o) {
        o = o || {};
        const bpm = clamp(num(o.bpm, 100), 50, 220), bars = clamp(Math.floor(num(o.bars, 8)), 1, 64);
        const spb = 60 / bpm;
        try {
          if (!ensure()) return { t0: 0.2, spb };
          groove = null;
          if (!running()) { tryResume(); return { t0: now() + 0.2, spb }; }
          const C = composeGroove(bpm, num(o.style, 0), bars);
          const t0 = ctx.currentTime + 0.2;
          const T = startTrack(C, 'groove', 0.05, t0);
          if (groove) disposeBus(groove, 0.05);
          groove = T;
          if (LOG) LOG.push({ k: 'groove', ev: 'start', bpm, style: o.style, bars, t0 });
          pump(T, ctx.currentTime, ctx.currentTime + 0.18);
          startTimer();
          return { t0, spb };
        } catch (e) { return { t0: now() + 0.2, spb }; }
      },
      stop(fade) {
        try { if (groove) { const T = groove; groove = null; disposeBus(T, clamp(num(fade, 0.15), 0.02, 4)); if (LOG) LOG.push({ k: 'groove', ev: 'stop', t: now() }); } } catch (e) { /* ignore */ }
      },
      setIntensity(v) { intensity = clamp(num(v, 0.6), 0, 1); },
    };
    // groove.start must replace a running groove cleanly
    const _gs = grooveApi.start;
    grooveApi.start = function (o) { if (groove) { const T = groove; groove = null; try { disposeBus(T, 0.05); } catch (e) { /* ignore */ } } return _gs(o); };

    return {
      unlock, setMuted, setVolume, now, sfx, drum, music, groove: grooveApi,
      get log() { return LOG; },
      get muted() { return muted; },
      get volume() { return { music: vol.music, sfx: vol.sfx }; },
      get ctx() { return ctx; },
      _tick: tick,
    };
  }

  /* ================================================================== lazy shared instance */
  let shared = null;
  function inst() {
    if (!shared) {
      shared = create(() => {
        const AC = root.AudioContext || root.webkitAudioContext;
        if (!AC) throw new Error('no AudioContext');
        return new AC();
      });
    }
    return shared;
  }
  const Factory = { create, compose: (id) => composeCached(id), composeGroove, MUSIC_IDS, SFX_NAMES: ['click', 'back', 'confirm', 'error', 'coin', 'buy', 'unlock', 'levelup', 'achievement', 'hit_perfect', 'hit_good', 'miss', 'combo', 'win', 'lose', 'equip', 'swoosh', 'sleep', 'eat', 'step', 'door', 'crowd_cheer', 'crowd_boo', 'applause', 'sparkle', 'whoosh', 'record', 'countdown', 'go'], RECIPES };
  BBH.AudioFactory = Factory;
  BBH.Audio = {
    create, compose: Factory.compose, composeGroove, MUSIC_IDS, SFX_NAMES: Factory.SFX_NAMES,
    unlock: () => inst().unlock(),
    setMuted: (b) => inst().setMuted(b),
    setVolume: (o) => inst().setVolume(o),
    now: () => inst().now(),
    sfx: (n, o) => inst().sfx(n, o),
    drum: (l, o) => inst().drum(l, o),
    music: {
      play: (id, o) => inst().music.play(id, o), stop: (f) => inst().music.stop(f), current: () => inst().music.current(),
      beat: () => inst().music.beat(), bpm: () => inst().music.bpm(), ids: MUSIC_IDS.slice(),
    },
    groove: { start: (o) => inst().groove.start(o), stop: (f) => inst().groove.stop(f), setIntensity: (v) => inst().groove.setIntensity(v) },
    get log() { return inst().log; },
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
