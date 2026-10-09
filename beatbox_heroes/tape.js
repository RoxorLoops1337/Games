// BEATBOX HEROES -- tape.js: WATCH A BEATBOX TAPE. The VHS history tape on the couch: a procedural VHS "video" (canvas), kinetic fact cards (DOM), a muffled TV audio bed.
// Classic script, loaded after tape_facts.js and game.js. Works in 2D and 3D; the 3D camera push to the TV lives in park3d/tape.js (playTape(world, opts), exported from the r3 core).
//   BBH.Tape.video(w, h, { osd }) -> { canvas, setEra(era, year), setMode('blue'|'snow'|'play'|'rewind'|'black'), draw(t), hit(kind) }   the VHS picture (also the 3D TV texture)
//   BBH.Tape.mount(opts) -> ctrl     the overlay: ctrl.enter(rect) Promise (the picture grows from the TV rect to the full column), ctrl.run() Promise<result>, ctrl.exit(rect) Promise, ctrl.unmount()
//       ctrl.skip()  ctrl.next()  ctrl.skipped  ctrl.shown  ctrl.onSkip(fn)  ctrl.el  ctrl.audio (bed: start, clunk, rewind, stop)
//   BBH.Tape.play(null, opts) -> Promise<result>   the 2D experience (a CRT on the wall grows to fill the screen). opts: { facts, tape, speed, reduce }
//   G.watchTape(S) -> Promise<result | null>   the couch row: 3D (R3.lib.playTape on the flat world) or 2D, then G.do({ t: 'tape' }) (core rewards unchanged, core advances flags.tapeNext)
//   result = { tape, shown, ids, skipped }    BBH.Tape.ctrl (the overlay on screen, its .phase: intro title cut card out end rewind done)   BBH.Tape.playing (true while on screen)   BBH.Tape.speed (time scale, tests)   BBH.Tape.last (the last result)
// Input: tap = next fact, tap and hold (0.7 s) = skip, the SKIP button, Esc. Reduce motion (settings or prefers-reduced-motion): no kinetic type, a calm picture, no zoom.
(function (root) {
  'use strict';
  const BBH = root.BBH, TF = BBH && BBH.TAPE_FACTS, doc = root.document;
  if (!BBH || !TF || !doc) return;
  const E = BBH.Eng || BBH.E, G = BBH.G;
  const T = BBH.Tape = BBH.Tape || {};
  T.playing = false; T.last = null; T.speed = T.speed || 1;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v), ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
  const nowS = () => performance.now() / 1000;
  const reduceOn = () => { try { return !!(E && E.settings && E.settings.reduce) || !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // per era: 16-step groove (B kick, t hat, K snare, P breath clap, . rest), bpm, grade
  const GROOVE = {
    roots: ['B..tK..tB.B.K..t', 84], oldschool: ['B.t.K.tBB.t.K.t.', 92], newschool: ['B.tBK.t.B.tBK.tK', 94], battle: ['B.ttK.tBB.ttK.tP', 98],
    loop: ['B.t.K.t.BBt.K.tt', 100], science: ['B...K...B.B.K...', 86], roxor: ['BtBtKtBtBBtBKtPt', 100],
  };
  const ERA = (e) => TF.ERAS[e] || TF.ERAS.battle;
  const hex = (h, a) => { const n = parseInt(h.slice(1), 16); return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')'; };

  /* ================================================================== the VHS picture */
  T.video = function (W, H, o) {
    o = o || {};
    const cv = doc.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
    const A = doc.createElement('canvas'); A.width = W; A.height = H; const a = A.getContext('2d');
    const nz = []; for (let k = 0; k < 4; k++) { const c = doc.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), d = x.createImageData(64, 64); for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255 | 0; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; } x.putImageData(d, 0, 0); nz.push(g.createPattern(c, 'repeat')); }
    const S = { era: 'battle', year: '', mode: 'blue', cut: 0, env: { B: 0, K: 0, t: 0, P: 0 }, last: -1, lt: 0, tc: 0, calm: !!o.calm };
    const L = Math.min(W, H), land = W > H, fy = H * (land ? 0.8 : 0.7);
    const R = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
    function beatOf(t) {
      const gr = GROOVE[S.era] || GROOVE.battle, spb = 60 / gr[1] / 4, step = Math.floor(t / spb), ch = gr[0][((step % 16) + 16) % 16];
      if (step !== S.last) { S.last = step; if (ch !== '.') S.env[ch === 'P' ? 'K' : ch] = 1; if (ch === 'P') S.env.P = 1; }
      return { step, ph: (t / spb) % 1, bar: Math.floor(step / 16) };
    }
    // a backlit performer silhouette, feet at (x, y), height h, facing f (1 right, -1 left): drawn twice in the rim colour (up-left and up-right) under the dark body, so the stage light rims it
    function body(x, y, h, f, act, t, seed, hat) {
      const e = S.env, bob = (act ? e.B * 0.03 : 0.008 * Math.sin(t * 2 + seed)) * h, pump = act ? e.K : 0.15 + 0.1 * Math.sin(t * 1.7 + seed), hy = y - h * 0.885 + bob, sw = Math.sin(t * 1.3 + seed) * h * 0.006;
      const leg = (lx, kx) => { a.lineWidth = h * 0.078; a.beginPath(); a.moveTo(x + lx * h, y - h * 0.47 + bob * 0.8); a.lineTo(x + kx * h, y - h * 0.25 + bob * 0.45); a.stroke(); a.lineWidth = h * 0.062; a.beginPath(); a.moveTo(x + kx * h, y - h * 0.25 + bob * 0.45); a.lineTo(x + kx * h * 1.1, y - h * 0.04); a.stroke(); a.beginPath(); a.ellipse(x + kx * h * 1.1 + f * h * 0.03, y - h * 0.018, h * 0.058, h * 0.026, 0, 0, 7); a.fill(); };
      leg(-0.05, -0.065); leg(0.05, 0.07);
      a.beginPath(); a.moveTo(x - h * 0.115, y - h * 0.46 + bob * 0.8); a.quadraticCurveTo(x - h * 0.135, y - h * 0.62 + bob, x - h * 0.15, y - h * 0.745 + bob); a.quadraticCurveTo(x - h * 0.145, y - h * 0.8 + bob, x - h * 0.06, y - h * 0.81 + bob); a.lineTo(x + h * 0.06, y - h * 0.81 + bob); a.quadraticCurveTo(x + h * 0.145, y - h * 0.8 + bob, x + h * 0.15, y - h * 0.745 + bob); a.quadraticCurveTo(x + h * 0.135, y - h * 0.62 + bob, x + h * 0.115, y - h * 0.46 + bob * 0.8); a.closePath(); a.fill();
      a.fillRect(x - h * 0.028, y - h * 0.84 + bob, h * 0.056, h * 0.05);
      a.beginPath(); a.ellipse(x + f * h * 0.008 + sw, hy, h * 0.058, h * 0.068, 0, 0, 7); a.fill(); a.beginPath(); a.moveTo(x + f * h * 0.045 + sw, hy - h * 0.005); a.lineTo(x + f * h * 0.068 + sw, hy + h * 0.012); a.lineTo(x + f * h * 0.045 + sw, hy + h * 0.024); a.fill();
      if (hat === 'cap') { a.beginPath(); a.ellipse(x + sw, hy - h * 0.03, h * 0.064, h * 0.045, 0, Math.PI, 0); a.fill(); a.beginPath(); a.ellipse(x + f * h * 0.07 + sw, hy - h * 0.03, h * 0.05, h * 0.012, f * 0.12, 0, 7); a.fill(); }
      else if (hat === 'beanie') { a.beginPath(); a.ellipse(x + sw, hy - h * 0.035, h * 0.062, h * 0.06, 0, Math.PI, 0); a.fill(); }
      else if (hat === 'fedora') { a.beginPath(); a.ellipse(x + sw, hy - h * 0.045, h * 0.1, h * 0.014, 0, 0, 7); a.fill(); a.fillRect(x - h * 0.05 + sw, hy - h * 0.1, h * 0.1, h * 0.06); }
      else { a.beginPath(); a.arc(x - f * h * 0.01 + sw, hy - h * 0.035, h * 0.066, Math.PI * 0.95, Math.PI * 2.05); a.fill(); }
      const shx = x + f * h * 0.115, shy = y - h * 0.765 + bob, mx = x + f * h * 0.07 + sw, my = hy + h * 0.035;
      a.lineWidth = h * 0.06; a.beginPath(); a.moveTo(shx, shy); a.lineTo(x + f * h * 0.16, y - h * 0.62 + bob); a.stroke(); a.lineWidth = h * 0.05; a.beginPath(); a.moveTo(x + f * h * 0.16, y - h * 0.62 + bob); a.lineTo(mx, my + h * 0.05); a.stroke();
      a.beginPath(); a.arc(mx, my + h * 0.05, h * 0.03, 0, 7); a.fill();
      a.save(); a.translate(mx, my + h * 0.05); a.rotate(f * -0.55); a.fillRect(-h * 0.014, -h * 0.07, h * 0.028, h * 0.085); a.beginPath(); a.arc(0, -h * 0.075, h * 0.024, 0, 7); a.fill(); a.restore();
      const ang = 0.35 + pump * 1.25 + Math.sin(t * 3 + seed) * 0.12, ox = x - f * h * 0.115, ex = ox - f * Math.sin(0.5) * h * 0.15, ey = shy + h * 0.13, hx2 = ex - f * Math.cos(ang) * h * 0.13, hy3 = ey - Math.sin(ang) * h * 0.14;
      a.lineWidth = h * 0.06; a.beginPath(); a.moveTo(ox, shy); a.lineTo(ex, ey); a.stroke(); a.lineWidth = h * 0.05; a.beginPath(); a.moveTo(ex, ey); a.lineTo(hx2, hy3); a.stroke(); a.beginPath(); a.arc(hx2, hy3, h * 0.03, 0, 7); a.fill();
    }
    function dude(x, y, h, f, act, rim, t, seed, hat) {
      hat = hat || ['cap', 'none', 'beanie', 'cap'][seed % 4];
      a.save(); a.lineCap = 'round'; a.lineJoin = 'round';
      a.shadowColor = rim; a.shadowBlur = Math.max(5, h * (act ? 0.14 : 0.09)); a.fillStyle = a.strokeStyle = rim;
      for (const dx of [-1, 1]) { a.save(); a.translate(dx * h * 0.011, -h * 0.013); body(x, y, h, f, act, t, seed, hat); a.restore(); a.shadowBlur = 0; }
      a.fillStyle = a.strokeStyle = '#08050f'; body(x, y, h, f, act, t, seed, hat);
      a.restore();
    }
    function crowd(t, n, y0, sc, col, phones) {
      for (let i = 0; i < n; i++) {
        const x = (i + 0.5) / n * W + (R(i + y0) - 0.5) * W / n, hh = L * sc * (0.85 + R(i * 3) * 0.3), b = Math.abs(Math.sin(t * 3.1 + i * 1.7)) * hh * 0.12 + S.env.B * hh * 0.08 * R(i), y = y0 - b;
        a.fillStyle = col; a.beginPath(); a.ellipse(x, y + hh * 0.9, hh * 0.55, hh * 0.5, 0, Math.PI, 0); a.fill(); a.beginPath(); a.arc(x, y + hh * 0.2, hh * 0.24, 0, 7); a.fill();
        if (R(i * 7.3) > 0.78) { const up = 0.5 + 0.5 * Math.sin(t * 2.2 + i); a.strokeStyle = col; a.lineWidth = hh * 0.13; a.lineCap = 'round'; a.beginPath(); a.moveTo(x + hh * 0.3, y + hh * 0.5); a.lineTo(x + hh * 0.45, y - hh * (0.4 + up * 0.5)); a.stroke(); if (phones) { a.fillStyle = 'rgba(220,240,255,.85)'; a.fillRect(x + hh * 0.36, y - hh * (0.62 + up * 0.5), hh * 0.18, hh * 0.28); } }
      }
    }
    function beams(t, cols, n) {
      a.save(); a.globalCompositeOperation = 'lighter';
      for (let i = 0; i < n; i++) {
        const ox = W * (0.1 + 0.8 * i / Math.max(1, n - 1)), an = Math.PI / 2 + Math.sin(t * (0.5 + i * 0.13) + i * 2) * 0.42 + (ox - W / 2) / W * -0.6, len = H * 1.1, sp = 0.13 + S.env.B * 0.03;
        const gr = a.createLinearGradient(ox, 0, ox + Math.cos(an) * len, Math.sin(an) * len); gr.addColorStop(0, hex(cols[i % cols.length], 0.42)); gr.addColorStop(1, hex(cols[i % cols.length], 0));
        a.fillStyle = gr; a.beginPath(); a.moveTo(ox, -4); a.lineTo(ox + Math.cos(an - sp) * len, Math.sin(an - sp) * len); a.lineTo(ox + Math.cos(an + sp) * len, Math.sin(an + sp) * len); a.closePath(); a.fill();
      }
      a.restore();
    }
    function wave(t, y, amp, col) {
      a.save(); a.strokeStyle = col; a.lineWidth = Math.max(1.2, L * 0.012); a.shadowColor = col; a.shadowBlur = L * 0.04; a.beginPath();
      const e = S.env, k = 0.25 + e.B * 0.9 + e.K * 0.6 + e.t * 0.25;
      for (let i = 0; i <= 48; i++) { const u = i / 48, x = u * W, env = Math.sin(u * Math.PI), v = Math.sin(u * 23 + t * 9) * 0.5 + Math.sin(u * 51 - t * 13) * 0.3 * e.t + Math.sin(u * 7 + t * 3) * 0.4; if (i) a.lineTo(x, y + v * amp * k * env); else a.moveTo(x, y); }
      a.stroke(); a.restore();
    }
    function bars(t, x0, y0, w, h, col, n) { const e = S.env; a.fillStyle = col; for (let i = 0; i < n; i++) { const v = clamp(0.15 + Math.abs(Math.sin(i * 1.9 + t * 4)) * 0.35 + (i < n / 3 ? e.B : i < 2 * n / 3 ? e.K : e.t) * 0.6 * R(i + 9), 0, 1); a.fillRect(x0 + i * w / n, y0 - v * h, w / n * 0.7, v * h); } }
    function led(t, c, c2) {
      const s = Math.max(4, L * 0.035);
      for (let y = s; y < fy - s * 2; y += s) for (let x = s / 2; x < W; x += s) { const v = 0.5 + 0.5 * Math.sin(x * 0.05 + y * 0.03 + t * 2) * Math.sin(t * 1.3 - y * 0.02); a.fillStyle = hex(v > 0.6 ? c : c2, 0.05 + v * 0.16 + S.env.B * 0.06); a.fillRect(x, y, s * 0.55, s * 0.55); }
    }
    // name plates over a battle: LEFT  VS  RIGHT on the LED wall, the one on the mic glows
    function plates(cx, y, ph, cols, bar) {
      let fs = Math.max(7, ph * 0.085); a.save(); a.font = '700 ' + fs.toFixed(1) + 'px Fredoka, "Trebuchet MS", sans-serif'; const mw = Math.max(a.measureText(S.vs[0]).width, a.measureText(S.vs[1]).width); if (mw > ph * 0.46) fs *= ph * 0.46 / mw; a.textAlign = 'center'; a.textBaseline = 'middle';
      a.font = '700 ' + (fs * 1.9).toFixed(1) + 'px Fredoka, "Trebuchet MS", sans-serif'; a.fillStyle = 'rgba(255,246,232,.9)'; a.shadowColor = '#ffffff'; a.shadowBlur = fs * 0.8; a.fillText('VS', cx, y);
      a.font = '700 ' + fs.toFixed(1) + 'px Fredoka, "Trebuchet MS", sans-serif';
      [[-1, 0], [1, 1]].forEach(([s, i]) => { const on = bar === i; a.shadowColor = cols[i]; a.shadowBlur = on ? fs * 1.4 : fs * 0.4; a.fillStyle = on ? '#fff6e8' : hex(cols[i], 0.85); a.fillText(S.vs[i], cx + s * ph * 0.36, y + fs * 0.1); a.fillStyle = hex(cols[i], on ? 0.95 : 0.5); a.fillRect(cx + s * ph * 0.36 - ph * 0.14, y + fs * 0.85, ph * 0.28, Math.max(1, fs * 0.16)); });
      a.restore();
    }
    function scene(t) {
      const er = ERA(S.era), c = er.c, c2 = er.c2, e = S.env, gr = a.createLinearGradient(0, 0, 0, H);
      if (S.era === 'roots') { gr.addColorStop(0, '#1a0e08'); gr.addColorStop(0.7, '#3b1d10'); gr.addColorStop(1, '#120805'); } else { gr.addColorStop(0, '#0a0614'); gr.addColorStop(0.65, hex(c2, 0.22)); gr.addColorStop(1, '#05030a'); }
      a.fillStyle = '#05030a'; a.fillRect(0, 0, W, H); a.fillStyle = gr; a.fillRect(0, 0, W, H);
      const cx = W / 2, ph = land ? H * 0.6 : H * 0.36;
      if (S.era === 'roots') {
        for (let i = 0; i < 14; i++) { const x = i / 13 * W, fg = a.createLinearGradient(x - W / 28, 0, x + W / 28, 0); fg.addColorStop(0, 'rgba(90,16,20,.0)'); fg.addColorStop(0.5, 'rgba(150,34,30,.55)'); fg.addColorStop(1, 'rgba(90,16,20,.0)'); a.fillStyle = fg; a.fillRect(x - W / 28, 0, W / 14, fy); }
        const sp = a.createRadialGradient(cx, fy - ph * 0.5, 0, cx, fy - ph * 0.5, L * 0.75); sp.addColorStop(0, 'rgba(255,220,160,.55)'); sp.addColorStop(1, 'rgba(255,200,120,0)'); a.fillStyle = sp; a.fillRect(0, 0, W, H);
        a.fillStyle = '#0b0604'; a.fillRect(cx - L * 0.012, fy - ph * 0.62, L * 0.024, ph * 0.62); a.beginPath(); a.ellipse(cx, fy - ph * 0.66, L * 0.035, L * 0.05, 0, 0, 7); a.fill();
        const n = land ? 4 : 3; for (let i = 0; i < n; i++) dude(cx + (i - (n - 1) / 2) * ph * 0.42 + (i >= n / 2 ? ph * 0.12 : -ph * 0.12), fy, ph * (i === 1 ? 1.02 : 0.96), i < n / 2 ? 1 : -1, true, '#ffcf8a', t, i, 'fedora');
      } else if (S.era === 'oldschool') {
        for (let y = 0; y < fy; y += L * 0.06) for (let x = ((y / (L * 0.06)) % 2) * L * 0.06; x < W; x += L * 0.12) { a.fillStyle = 'rgba(120,40,60,' + (0.1 + R(x * 0.1 + y) * 0.12) + ')'; a.fillRect(x, y, L * 0.115, L * 0.055); }
        a.save(); a.globalCompositeOperation = 'lighter'; a.lineWidth = L * 0.03; a.lineCap = 'round'; [[c, 0.2], [c2, 0.55]].forEach(([cc, yy], i) => { a.strokeStyle = hex(cc, 0.5); a.beginPath(); a.moveTo(W * 0.05, fy * yy); a.bezierCurveTo(W * 0.3, fy * (yy - 0.12), W * 0.6, fy * (yy + 0.14), W * 0.95, fy * (yy - 0.04 + i * 0.05)); a.stroke(); }); a.restore();
        beams(t, [c, c2], 3);
        const bx = cx + ph * 0.42, bw = ph * 0.34, bh = ph * 0.17; a.fillStyle = '#0d0a14'; a.fillRect(bx - bw / 2, fy - bh, bw, bh); a.fillStyle = hex(c, 0.8); [-1, 1].forEach((s) => { a.beginPath(); a.arc(bx + s * bw * 0.27, fy - bh * 0.45, bh * (0.28 + e.B * 0.06), 0, 7); a.fill(); }); a.fillStyle = '#0d0a14'; a.fillRect(bx - bw * 0.3, fy - bh * 1.25, bw * 0.6, bh * 0.12);
        dude(cx - ph * 0.08, fy, ph, 1, true, c, t, 1);
      } else if (S.era === 'science') {
        a.strokeStyle = hex(c, 0.12); a.lineWidth = 1; for (let x = 0; x < W; x += L * 0.08) { a.beginPath(); a.moveTo(x, 0); a.lineTo(x, H); a.stroke(); } for (let y = 0; y < H; y += L * 0.08) { a.beginPath(); a.moveTo(0, y); a.lineTo(W, y); a.stroke(); }
        const hx = cx, hy2 = H * (land ? 0.45 : 0.4), r = L * 0.3; a.save(); a.shadowColor = c; a.shadowBlur = L * 0.05; a.strokeStyle = hex(c, 0.9); a.lineWidth = L * 0.012;
        a.beginPath(); a.moveTo(hx + r * 0.1, hy2 + r * 1.1); a.lineTo(hx + r * 0.05, hy2 + r * 0.55); a.bezierCurveTo(hx + r * 0.5, hy2 + r * 0.5, hx + r * 0.55, hy2 + r * 0.25, hx + r * 0.62, hy2 + r * 0.05); a.lineTo(hx + r * 0.75, hy2 - r * 0.08); a.lineTo(hx + r * 0.6, hy2 - r * 0.2); a.bezierCurveTo(hx + r * 0.6, hy2 - r * 0.9, hx - r * 0.7, hy2 - r * 1.0, hx - r * 0.65, hy2 - r * 0.1); a.bezierCurveTo(hx - r * 0.6, hy2 + r * 0.4, hx - r * 0.4, hy2 + r * 0.6, hx - r * 0.35, hy2 + r * 1.1); a.stroke();
        const op = e.B * 0.12 + e.K * 0.08; a.strokeStyle = hex(c2, 0.9); a.beginPath(); a.moveTo(hx + r * 0.5, hy2 + r * (0.02 + op)); a.quadraticCurveTo(hx + r * 0.1, hy2 + r * (0.15 + op), hx - r * 0.1, hy2 + r * 0.45); a.stroke(); a.beginPath(); a.moveTo(hx + r * 0.52, hy2 - r * 0.02); a.quadraticCurveTo(hx + r * 0.2, hy2 - r * (0.12 + e.t * 0.1), hx - r * 0.05, hy2 + r * 0.1); a.stroke(); a.restore();
        const sy = (t * 0.3 % 1) * H; a.fillStyle = hex(c, 0.08); a.fillRect(0, sy, W, L * 0.04);
        wave(t, H * (land ? 0.86 : 0.8), L * 0.07, hex(c2, 0.9)); return;
      } else {
        const loop = S.era === 'loop', rox = S.era === 'roxor', cols = rox ? ['#ffd35c', '#ff2f4f', '#ffffff'] : [c, c2, '#ffffff'];
        led(t, cols[0], cols[1]); beams(t, cols, land ? 5 : 4);
        const hz = a.createRadialGradient(cx, fy - ph * 0.5, 0, cx, fy - ph * 0.5, L * 0.6); hz.addColorStop(0, hex(cols[0], 0.32 + e.B * 0.1)); hz.addColorStop(1, hex(cols[0], 0)); a.fillStyle = hz; a.fillRect(0, 0, W, H);
        a.fillStyle = '#080510'; a.fillRect(0, fy, W, H - fy); a.fillStyle = hex(cols[0], 0.5); a.fillRect(0, fy, W, Math.max(1, L * 0.008));
        if (S.era === 'battle' || rox) { const bar = Math.floor(beatOf(t).bar / 2) % 2; dude(cx - ph * 0.3, fy, ph, 1, bar === 0, cols[0], t, 1); dude(cx + ph * 0.3, fy, ph * 0.98, -1, bar === 1, cols[1], t, 2); if (S.vs) plates(cx, fy - ph * 1.2, ph, cols, bar); }
        else if (loop) { dude(cx, fy - ph * 0.02, ph, 1, true, cols[0], t, 1); const lw = ph * 0.5, lx = cx - lw / 2, ly = fy - ph * 0.3; a.fillStyle = '#0a0712'; a.fillRect(lx, ly, lw, ph * 0.08); a.fillRect(lx + lw * 0.1, ly, lw * 0.06, ph * 0.3); a.fillRect(lx + lw * 0.84, ly, lw * 0.06, ph * 0.3); for (let i = 0; i < 5; i++) { const on = (beatOf(t).bar + i) % 5 < 3; a.fillStyle = on ? hex(i % 2 ? c2 : c, 0.9) : 'rgba(80,70,110,.6)'; a.beginPath(); a.arc(lx + lw * (0.15 + i * 0.175), ly + ph * 0.04, ph * 0.025, 0, 7); a.fill(); } }
        else { dude(cx, fy, ph, 1, true, cols[0], t, 1); [-1, 1].forEach((s) => { const sx = cx + s * W * 0.4, sw = L * 0.16, sh = ph * 0.55; a.fillStyle = '#0b0814'; a.fillRect(sx - sw / 2, fy - sh, sw, sh); a.fillStyle = hex(cols[1], 0.35); a.beginPath(); a.arc(sx, fy - sh * 0.3, sw * (0.3 + e.B * 0.05), 0, 7); a.fill(); a.beginPath(); a.arc(sx, fy - sh * 0.75, sw * 0.18, 0, 7); a.fill(); }); }
        bars(t, W * 0.08, fy - L * 0.01, W * 0.84, L * 0.06, hex(cols[1], 0.28), 24);
      }
      wave(t, fy + (H - fy) * 0.22, L * 0.05, hex(c, 0.85));
      const modern = S.era !== 'roots' && S.era !== 'oldschool';
      crowd(t, land ? 11 : 7, H - L * 0.2, 0.11, '#0c0816', modern); crowd(t * 1.1, land ? 8 : 5, H - L * 0.1, 0.15, '#040208', modern);
      if (S.era === 'roots') { a.save(); a.globalCompositeOperation = 'color'; a.fillStyle = 'rgba(112,66,20,.75)'; a.fillRect(0, 0, W, H); a.restore(); a.fillStyle = 'rgba(255,230,190,' + (0.03 + R(Math.floor(t * 24)) * 0.05) + ')'; a.fillRect(0, 0, W, H); }
    }
    function osd(t) {
      if (!o.osd) return; const fs = Math.max(6, Math.round(H / 18)), m = fs * 0.9; g.save(); g.font = fs + 'px "Press Start 2P", monospace'; g.textBaseline = 'top'; g.fillStyle = '#fff'; g.shadowColor = 'rgba(0,0,0,.9)'; g.shadowOffsetX = g.shadowOffsetY = Math.max(1, fs / 8);
      if (S.mode === 'blue') g.fillText('VIDEO', m, m);
      else if (S.mode === 'rewind') { g.fillText('REW', m + fs * 2.4, m); tri(m, m, fs, -1); tri(m + fs, m, fs, -1); }
      else if (S.mode === 'play' && (Math.floor(t * 1.5) % 2 === 0 || S.lt < 3)) { g.fillText('PLAY', m, m); tri(m + fs * 4.6, m, fs, 1); }
      if (S.mode === 'play' || S.mode === 'rewind') { const s = Math.max(0, S.tc) | 0; g.fillText('0:' + String(s / 60 | 0).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'), m, H - m - fs); if (S.year) { const y = String(S.year); g.fillText(y, W - m - g.measureText(y).width, H - m - fs); } g.fillText('SP', W - m - fs * 2, m); }
      g.restore();
    }
    function tri(x, y, s, d) { g.beginPath(); if (d > 0) { g.moveTo(x, y); g.lineTo(x + s * 0.9, y + s / 2); g.lineTo(x, y + s); } else { g.moveTo(x + s * 0.9, y); g.lineTo(x, y + s / 2); g.lineTo(x + s * 0.9, y + s); } g.closePath(); g.fill(); }
    function noise(al, sc) { g.save(); g.globalAlpha = al; g.fillStyle = nz[(Math.random() * 4) | 0]; g.translate(-Math.random() * 64, -Math.random() * 64); g.scale(sc || 1, sc || 1); g.fillRect(0, 0, W / (sc || 1) + 128, H / (sc || 1) + 128); g.restore(); }
    let pt = 0;
    function draw(t) {
      const dt = clamp(t - pt, 0, 0.1); pt = t; S.lt += dt; const calm = S.calm;
      for (const k in S.env) S.env[k] *= Math.exp(-dt * (k === 'B' ? 7 : k === 't' ? 14 : 6));
      S.cut = Math.max(0, S.cut - dt * 3.2);
      if (S.mode === 'black') { g.fillStyle = '#000'; g.fillRect(0, 0, W, H); return; }
      if (S.mode === 'blue') { const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#1c3cd8'); bg.addColorStop(1, '#0d24a8'); g.fillStyle = bg; g.fillRect(0, 0, W, H); noise(0.05); osd(t); return; }
      if (S.mode === 'snow') { g.fillStyle = '#777'; g.fillRect(0, 0, W, H); noise(0.95, H > 200 ? 2 : 1); noise(0.4); return; }
      const rew = S.mode === 'rewind', st = rew ? -t * 5 : t; S.tc += rew ? -dt * 40 : dt;
      beatOf(st); scene(st);
      const jit = calm ? 0 : (Math.random() - 0.5) * (0.6 + S.cut * 6 + (rew ? 4 : 0)); g.drawImage(A, jit, 0);
      g.save(); g.globalCompositeOperation = 'screen'; g.globalAlpha = 0.22; g.drawImage(A, 2 + S.cut * 6, 0); g.globalAlpha = 0.12; g.drawImage(A, -2 - S.cut * 4, 1); g.restore();
      const nb = rew ? 4 : 1 + (S.cut > 0.2 ? 2 : 0);
      for (let b = 0; b < nb; b++) {
        const bh = H * (rew ? 0.07 : 0.045), by = ((t * (rew ? 0.9 : 0.06) + b * 0.37) % 1.3) * H - H * 0.15;
        for (let y = by; y < by + bh; y += 2) { const dx = (Math.random() - 0.5) * W * (calm ? 0.01 : rew ? 0.12 : 0.035); if (y > 0 && y < H) g.drawImage(A, 0, y, W, 2, dx, y, W, 2); }
        g.save(); g.globalAlpha = calm ? 0.12 : 0.35; g.fillStyle = nz[b % 4]; g.fillRect(0, by + bh * 0.3, W, Math.max(1, bh * 0.25)); g.restore();
      }
      const hs = H * 0.035; for (let y = H - hs; y < H; y += 2) g.drawImage(A, 0, y, W, 2, 3 + Math.random() * 5, y, W, 2);
      noise(calm ? 0.04 : 0.07 + S.cut * 0.4 + (rew ? 0.12 : 0));
      if (!calm && Math.random() < 0.04 + S.cut * 0.3) { g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(Math.random() * W, Math.random() * H, W * (0.1 + Math.random() * 0.5), 1); }
      if (o.scan) { g.fillStyle = 'rgba(0,0,0,.28)'; for (let y = 0; y < H; y += 2) g.fillRect(0, y, W, 1); }
      const vg = g.createRadialGradient(W / 2, H / 2, L * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.6)'); g.fillStyle = vg; g.fillRect(0, 0, W, H);
      osd(t);
    }
    return {
      canvas: cv, state: S,
      setEra(er, year, vs) { if (er !== S.era || year !== S.year) S.cut = 1; S.era = TF.ERAS[er] ? er : 'battle'; S.year = year || ''; S.vs = vs && vs.length === 2 ? vs : null; },
      setMode(m) { if (m !== S.mode) { S.mode = m; S.lt = 0; if (m === 'play' && !S.tc) S.tc = 2 + Math.random() * 30; } },
      draw, hit(k) { if (S.env[k] !== undefined) S.env[k] = 1; },
    };
  };

  /* ================================================================== the TV audio bed */
  function bed(era) {
    const A = BBH.Audio; let ctx = null, out = null, nodes = [], timer = 0, t0 = 0, next = 0, step = 0, gr = GROOVE[era] || GROOVE.battle;
    const ok = () => { try { return !!(A && A.ctx && !A.muted && A.ctx.state === 'running'); } catch (e) { return false; } };
    function noiseBuf(sec) { const b = ctx.createBuffer(1, ctx.sampleRate * sec | 0, ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; }
    function src(sec, loop) { const s = ctx.createBufferSource(); s.buffer = noiseBuf(sec); s.loop = !!loop; return s; }
    const vol = () => { try { return clamp((A.volume && A.volume.sfx) || 0.9, 0, 1); } catch (e) { return 0.9; } };
    const api = {
      start() {
        if (ctx || !ok()) return; ctx = A.ctx; out = ctx.createGain(); out.gain.value = 0; out.connect(ctx.destination); out.gain.linearRampToValueAtTime(0.9 * vol(), ctx.currentTime + 0.6);
        const hs = src(2, true), hp = ctx.createBiquadFilter(), hg = ctx.createGain(); hp.type = 'highpass'; hp.frequency.value = 4200; hg.gain.value = 0.022; hs.connect(hp); hp.connect(hg); hg.connect(out); hs.start();
        const cs = src(3, true), bp = ctx.createBiquadFilter(), cg = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain(); bp.type = 'bandpass'; bp.frequency.value = 650; bp.Q.value = 0.6; cg.gain.value = 0.035; lfo.frequency.value = 0.21; lg.gain.value = 0.02; lfo.connect(lg); lg.connect(cg.gain); cs.connect(bp); bp.connect(cg); cg.connect(out); cs.start(); lfo.start();
        const hum = ctx.createOscillator(), hmg = ctx.createGain(); hum.frequency.value = 50; hmg.gain.value = 0.012; hum.connect(hmg); hmg.connect(out); hum.start();
        nodes.push(hs, cs, lfo, hum); api.crowd = cg;
      },
      groove(e, sp) { gr = GROOVE[e] || gr; if (!ctx || timer) return; t0 = ctx.currentTime + 0.05; next = t0; step = 0; const spb = () => 60 / gr[1] / 4 / (sp || 1);
        timer = setInterval(() => { if (!ctx) return; while (next < ctx.currentTime + 0.12) { const ch = gr[0][step % 16]; if (ch !== '.') { try { A.drum(ch === 't' ? 't' : ch === 'P' ? 'Pf' : ch, { when: next, vel: ch === 't' ? 0.28 : 0.46, pitch: 0.97 }); } catch (x) { /* ignore */ } } next += spb(); step++; } }, 30); },
      setEra(e) { gr = GROOVE[e] || gr; },
      cheer() { if (!api.crowd) return; const g = api.crowd.gain, t = ctx.currentTime; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0.11, t + 0.25); g.linearRampToValueAtTime(0.035, t + 1.6); },
      clunk() { if (!ctx) return; const t = ctx.currentTime, s = src(0.3), lp = ctx.createBiquadFilter(), g = ctx.createGain(); lp.type = 'lowpass'; lp.frequency.value = 500; g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18); s.connect(lp); lp.connect(g); g.connect(out); s.start(t);
        const o = ctx.createOscillator(), og = ctx.createGain(); o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.15); og.gain.setValueAtTime(0.5, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.2); o.connect(og); og.connect(out); o.start(t); o.stop(t + 0.25);
        const m = ctx.createOscillator(), ml = ctx.createBiquadFilter(), mg = ctx.createGain(); m.type = 'sawtooth'; m.frequency.value = 85; ml.type = 'lowpass'; ml.frequency.value = 300; mg.gain.setValueAtTime(0, t + 0.2); mg.gain.linearRampToValueAtTime(0.06, t + 0.35); mg.gain.linearRampToValueAtTime(0, t + 1.1); m.connect(ml); ml.connect(mg); mg.connect(out); m.start(t + 0.2); m.stop(t + 1.2); },
      rewind(sec) { if (!ctx) return; sec = sec || 1.6; const t = ctx.currentTime, o = ctx.createOscillator(), bp = ctx.createBiquadFilter(), g = ctx.createGain(); o.type = 'sawtooth'; o.frequency.setValueAtTime(180, t); o.frequency.exponentialRampToValueAtTime(1400, t + sec * 0.8); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 1.2; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.09, t + 0.1); g.gain.setValueAtTime(0.09, t + sec * 0.85); g.gain.linearRampToValueAtTime(0, t + sec); o.connect(bp); bp.connect(g); g.connect(out); o.start(t); o.stop(t + sec + 0.05);
        const s = src(sec), sg = ctx.createGain(), hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500; sg.gain.setValueAtTime(0.05, t); sg.gain.linearRampToValueAtTime(0, t + sec); s.connect(hp); hp.connect(sg); sg.connect(out); s.start(t); api.stopGroove(); },
      stopGroove() { if (timer) clearInterval(timer); timer = 0; },
      stop() { api.stopGroove(); if (!ctx || !out) return; const t = ctx.currentTime, o = out; o.gain.cancelScheduledValues(t); o.gain.setValueAtTime(o.gain.value, t); o.gain.linearRampToValueAtTime(0, t + 0.4); const ns = nodes; nodes = []; setTimeout(() => { ns.forEach((n) => { try { n.stop(); } catch (e) { /* ignore */ } }); try { o.disconnect(); } catch (e) { /* ignore */ } }, 600); ctx = null; out = null; },
    };
    return api;
  }

  /* ================================================================== the overlay */
  const CSS = `
@font-face { font-family: 'Fredoka'; font-weight: 500; src: url('fonts/Fredoka-500.woff2') format('woff2'); font-display: swap; }
@font-face { font-family: 'Fredoka'; font-weight: 700; src: url('fonts/Fredoka-700.woff2') format('woff2'); font-display: swap; }
#tape { position: fixed; top: 0; z-index: 43; overflow: hidden; pointer-events: auto; touch-action: none; user-select: none; -webkit-user-select: none; --u: 1px; font-family: 'Fredoka', 'Trebuchet MS', system-ui, sans-serif; color: #fff6e8; }
#tape .tp-bars::before, #tape .tp-bars::after { content: ''; position: absolute; left: 0; right: 0; height: 9%; background: #000; transition: transform .7s cubic-bezier(.2,.8,.2,1); z-index: 6; }
#tape .tp-bars::before { top: 0; transform: translateY(-100%); } #tape .tp-bars::after { bottom: 0; transform: translateY(100%); }
#tape.bars .tp-bars::before, #tape.bars .tp-bars::after { transform: none; }
#tape .tp-scr { position: absolute; left: 0; top: 0; width: 100%; height: 100%; overflow: hidden; background: #000; transform-origin: 0 0; opacity: 0; }
#tape .tp-scr canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; filter: brightness(var(--vd, .95)) blur(var(--vb, 0px)) saturate(1.15); transition: filter .6s ease; transform: scale(1.04); }
#tape .tp-scr::after { content: ''; position: absolute; inset: 0; pointer-events: none; background: repeating-linear-gradient(0deg, rgba(0,0,0,.26) 0 1px, transparent 1px 3px), radial-gradient(ellipse at 50% 45%, transparent 55%, rgba(0,0,0,.55) 100%); mix-blend-mode: multiply; }
#tape .tp-scrim { position: absolute; left: 0; right: 0; bottom: 0; height: 72%; background: linear-gradient(180deg, rgba(6,3,14,0) 0%, rgba(6,3,14,.55) 34%, rgba(6,3,14,.88) 100%); opacity: 0; transition: opacity .6s; pointer-events: none; }
#tape.carding .tp-scrim { opacity: 1; }
#tape .tp-osd { position: absolute; inset: 0; pointer-events: none; font: calc(11 * var(--u)) / 1 'Press Start 2P', monospace; color: #fff; text-shadow: 2px 2px 0 rgba(0,0,0,.85); opacity: 0; transition: opacity .3s; z-index: 3; }
#tape.on .tp-osd { opacity: .92; }
#tape .tp-osd > div { position: absolute; } #tape .tp-osd .tl { left: calc(18 * var(--u)); top: calc(env(safe-area-inset-top, 0px) + 18 * var(--u)); } #tape .tp-osd .tr { right: calc(18 * var(--u)); top: calc(env(safe-area-inset-top, 0px) + 18 * var(--u)); }
#tape .tp-osd .bl { left: calc(18 * var(--u)); bottom: calc(env(safe-area-inset-bottom, 0px) + 18 * var(--u)); } #tape .tp-osd .tl i { display: inline-block; width: 0; height: 0; border-left: calc(10 * var(--u)) solid #fff; border-top: calc(6 * var(--u)) solid transparent; border-bottom: calc(6 * var(--u)) solid transparent; margin-left: calc(8 * var(--u)); vertical-align: -1px; filter: drop-shadow(2px 2px 0 rgba(0,0,0,.85)); }
#tape .tp-osd .tl.rew i { border-left: 0; border-right: calc(10 * var(--u)) solid #fff; margin: 0 0 0 0; } #tape .tp-osd .tl.blink { animation: tpblink 1s steps(2) infinite; }
#tape .tp-prog { position: absolute; left: 50%; transform: translateX(-50%); top: calc(env(safe-area-inset-top, 0px) + 46 * var(--u)); display: flex; gap: calc(6 * var(--u)); z-index: 3; opacity: 0; transition: opacity .4s; pointer-events: none; }
#tape.on .tp-prog { opacity: 1; } #tape .tp-prog b { width: calc(22 * var(--u)); height: calc(4 * var(--u)); border-radius: 2px; background: rgba(255,246,232,.22); overflow: hidden; position: relative; }
#tape .tp-prog b i { position: absolute; inset: 0; background: var(--ec, #ffd35c); transform: scaleX(0); transform-origin: 0 0; } #tape .tp-prog b.done i { transform: none; }
#tape .tp-prog b.cur i { animation: tpfill var(--dur, 6s) linear forwards; }
#tape .tp-card { position: absolute; left: calc(22 * var(--u)); right: calc(22 * var(--u)); bottom: calc(env(safe-area-inset-bottom, 0px) + 86 * var(--u)); z-index: 4; pointer-events: none; }
#tape .tp-era { display: inline-flex; align-items: center; gap: calc(7 * var(--u)); font: 700 calc(12 * var(--u)) / 1 'Fredoka', sans-serif; letter-spacing: .22em; color: #120d1f; background: var(--ec); padding: calc(6 * var(--u)) calc(10 * var(--u)) calc(5 * var(--u)); border-radius: calc(4 * var(--u)); clip-path: inset(0 100% 0 0); transition: clip-path .5s cubic-bezier(.2,.8,.2,1); box-shadow: 0 0 calc(18 * var(--u)) var(--eg); }
#tape .tp-era s { text-decoration: none; opacity: .55; font-weight: 500; letter-spacing: .12em; }
#tape .tp-year { font: 700 calc(70 * var(--u)) / .92 'Fredoka', sans-serif; letter-spacing: -.01em; margin: calc(10 * var(--u)) 0 calc(8 * var(--u)) calc(-3 * var(--u)); overflow: hidden; white-space: nowrap; padding-bottom: calc(4 * var(--u)); }
#tape .tp-year.long { font-size: calc(46 * var(--u)); }
#tape .tp-year span { display: inline-block; transform: translateY(105%); transition: transform .55s cubic-bezier(.2,.9,.2,1.05); background: linear-gradient(180deg, #fff6e8 10%, var(--ec) 62%, var(--ec2) 100%); -webkit-background-clip: text; background-clip: text; color: transparent; filter: drop-shadow(0 calc(3 * var(--u)) 0 rgba(0,0,0,.45)); }
#tape .tp-rule { height: calc(3 * var(--u)); width: calc(64 * var(--u)); border-radius: 2px; background: linear-gradient(90deg, var(--ec), var(--ec2)); transform: scaleX(0); transform-origin: 0 50%; transition: transform .6s .15s cubic-bezier(.2,.8,.2,1); margin-bottom: calc(14 * var(--u)); }
#tape .tp-text { font: 500 calc(21 * var(--u)) / 1.32 'Fredoka', sans-serif; color: #fff6e8; text-shadow: 0 2px calc(10 * var(--u)) rgba(0,0,0,.75); text-wrap: pretty; }
#tape .tp-text span { display: inline-block; opacity: 0; transform: translateY(.45em); filter: blur(4px); transition: opacity .45s, transform .5s cubic-bezier(.2,.8,.2,1), filter .45s; white-space: pre; }
#tape .tp-text em { font-style: normal; color: var(--ec); }
#tape .tp-src { margin-top: calc(14 * var(--u)); font: 500 calc(11 * var(--u)) / 1.3 'Fredoka', sans-serif; letter-spacing: .08em; color: rgba(255,246,232,.6); opacity: 0; transition: opacity .6s .5s; text-transform: uppercase; }
#tape .tp-src b { color: var(--ec); font-weight: 700; margin-right: .5em; letter-spacing: .16em; }
#tape .tp-card.in .tp-era { clip-path: inset(0 0 0 0); } #tape .tp-card.in .tp-year span { transform: none; } #tape .tp-card.in .tp-rule { transform: none; }
#tape .tp-card.in .tp-text span { opacity: 1; transform: none; filter: none; } #tape .tp-card.in .tp-src { opacity: 1; }
#tape .tp-card.out { transition: opacity .42s, transform .42s, filter .42s; opacity: 0; transform: translateY(calc(-16 * var(--u))); filter: blur(6px); }
#tape .tp-title { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; z-index: 4; pointer-events: none; opacity: 0; transition: opacity .5s; gap: calc(10 * var(--u)); }
#tape .tp-title.in { opacity: 1; } #tape .tp-title .k { font: calc(10 * var(--u)) / 1.4 'Press Start 2P', monospace; color: #ffd35c; letter-spacing: .1em; text-shadow: 2px 2px 0 #000; }
#tape .tp-title .h { font: 700 calc(44 * var(--u)) / .95 'Fredoka', sans-serif; color: #fff6e8; text-shadow: 0 0 calc(24 * var(--u)) rgba(255,62,165,.75), 3px 3px 0 #ff3ea5, -3px -2px 0 rgba(46,230,255,.8); transform: scale(.92); transition: transform 2.6s cubic-bezier(.2,.8,.2,1); }
#tape .tp-title.in .h { transform: scale(1); } #tape .tp-title .s { font: 500 calc(14 * var(--u)) / 1.3 'Fredoka', sans-serif; letter-spacing: .3em; color: rgba(255,246,232,.8); }
#tape .tp-title .lbl { margin-top: calc(10 * var(--u)); padding: calc(8 * var(--u)) calc(14 * var(--u)); border: 2px solid rgba(255,246,232,.7); border-radius: calc(3 * var(--u)); font: calc(9 * var(--u)) / 1.6 'Press Start 2P', monospace; color: #fff6e8; background: rgba(0,0,0,.35); transform: rotate(-2deg); }
#tape .tp-skip { position: absolute; right: calc(16 * var(--u)); bottom: calc(env(safe-area-inset-bottom, 0px) + 22 * var(--u)); z-index: 7; display: flex; align-items: center; gap: calc(8 * var(--u)); padding: calc(10 * var(--u)) calc(16 * var(--u)) calc(10 * var(--u)) calc(12 * var(--u)); border-radius: 999px; border: 0; background: rgba(18,13,31,.72); color: #fff6e8; font: 700 calc(13 * var(--u)) / 1 'Fredoka', sans-serif; letter-spacing: .14em; cursor: pointer; box-shadow: 0 0 0 1px rgba(255,246,232,.25), 0 4px 14px rgba(0,0,0,.4); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
#tape .tp-skip .rg { width: calc(18 * var(--u)); height: calc(18 * var(--u)); border-radius: 50%; background: conic-gradient(#ffd35c calc(var(--hold, 0) * 360deg), rgba(255,246,232,.2) 0); -webkit-mask: radial-gradient(circle, transparent 52%, #000 54%); mask: radial-gradient(circle, transparent 52%, #000 54%); }
#tape .tp-hint { position: absolute; left: calc(18 * var(--u)); bottom: calc(env(safe-area-inset-bottom, 0px) + 52 * var(--u)); z-index: 5; font: 500 calc(11 * var(--u)) / 1 'Fredoka', sans-serif; letter-spacing: .14em; color: rgba(255,246,232,.55); transition: opacity .5s; pointer-events: none; opacity: 0; }
#tape.on .tp-hint { opacity: 1; } #tape.on .tp-hint.gone { opacity: 0; }
#tape .tp-flash { position: absolute; inset: 0; z-index: 5; background: #fff; opacity: 0; pointer-events: none; }
#tape.reduce .tp-text span, #tape.reduce .tp-year span, #tape.reduce .tp-era, #tape.reduce .tp-rule { transition: opacity .3s !important; transform: none !important; clip-path: none !important; filter: none !important; }
#tape.reduce .tp-card .tp-text span, #tape.reduce .tp-card .tp-era, #tape.reduce .tp-card .tp-year, #tape.reduce .tp-card .tp-rule { opacity: 0; } #tape.reduce .tp-card.in .tp-text span, #tape.reduce .tp-card.in .tp-era, #tape.reduce .tp-card.in .tp-year, #tape.reduce .tp-card.in .tp-rule { opacity: 1; }
#tape.reduce .tp-card.out { transform: none; filter: none; } #tape.reduce .tp-title .h { transform: none; transition: none; }
#tape.land .tp-scrim { top: 0; height: auto; background: linear-gradient(90deg, rgba(6,3,14,.86) 0%, rgba(6,3,14,.62) 34%, rgba(6,3,14,.12) 62%, rgba(6,3,14,0) 78%), linear-gradient(180deg, rgba(6,3,14,0) 45%, rgba(6,3,14,.7) 100%); }
#tape.land .tp-card { left: calc(56 * var(--u)); right: auto; width: min(46%, calc(600 * var(--u))); bottom: calc(env(safe-area-inset-bottom, 0px) + 96 * var(--u)); }
#tape.land .tp-year { font-size: calc(84 * var(--u)); } #tape.land .tp-year.long { font-size: calc(56 * var(--u)); }
#tape.land .tp-text { font-size: calc(24 * var(--u)); } #tape.land .tp-hint { left: calc(56 * var(--u)); bottom: calc(env(safe-area-inset-bottom, 0px) + 40 * var(--u)); }
#tape.land .tp-osd .tl, #tape.land .tp-osd .bl { left: calc(32 * var(--u)); } #tape.land .tp-osd .tr { right: calc(32 * var(--u)); } #tape.land .tp-skip { right: calc(28 * var(--u)); }
#tape.land .tp-title .h { font-size: calc(58 * var(--u)); }
body.tape-on #hud3, body.tape-on #ui > .hud, body.tape-on .h3-nav { visibility: hidden !important; }
@keyframes tpblink { 50% { opacity: 0; } } @keyframes tpfill { to { transform: none; } }
`;
  function ensureCss() { if (doc.getElementById('tape-css')) return; const st = doc.createElement('style'); st.id = 'tape-css'; st.textContent = CSS; doc.head.appendChild(st); }
  // the 9:16 column the game draws in (3D: #glwrap, 2D: the scaled #stage)
  function column() {
    const gw = doc.getElementById('glwrap'), st = doc.getElementById('stage'), r3 = doc.body.classList.contains('r3') && gw && gw.offsetWidth > 2;
    const r = (r3 ? gw : st || doc.body).getBoundingClientRect(); if (r.width > 2 && r.height > 2) return r3 ? { x: r.left, y: r.top, w: r.width, h: r.height } : { x: r.left, y: 0, w: r.width, h: root.innerHeight };
    const vw = root.innerWidth, vh = root.innerHeight, w = Math.min(vw, vh * 9 / 16); return { x: (vw - w) / 2, y: 0, w, h: vh };
  }

  T.mount = function (opts) {
    opts = opts || {}; ensureCss();
    const facts = (opts.facts && opts.facts.length ? opts.facts : TF.pick(opts.tape | 0)).slice(), reduce = opts.reduce !== undefined ? !!opts.reduce : reduceOn(), speed = () => opts.speed || T.speed || 1;
    const el = doc.createElement('div'); el.id = 'tape'; if (reduce) el.classList.add('reduce');
    el.innerHTML = '<div class="tp-scr"><canvas></canvas></div><div class="tp-scrim"></div><div class="tp-bars"></div>' +
      '<div class="tp-osd"><div class="tl blink">PLAY<i></i></div><div class="tr">SP</div><div class="bl">0:00:00</div></div>' +
      '<div class="tp-prog">' + facts.map(() => '<b><i></i></b>').join('') + '</div><div class="tp-title"></div><div class="tp-card"></div>' +
      '<div class="tp-hint">TAP: NEXT &bull; HOLD: SKIP</div><button type="button" class="tp-skip" aria-label="Skip the tape"><span class="rg"></span>SKIP</button><div class="tp-flash"></div>';
    doc.body.appendChild(el); doc.body.classList.add('tape-on');
    const $ = (s) => el.querySelector(s), scr = $('.tp-scr'), cvs = $('.tp-scr canvas'), card = $('.tp-card'), title = $('.tp-title'), osdL = $('.tp-osd .tl'), osdT = $('.tp-osd .bl'), flash = $('.tp-flash'), prog = [...el.querySelectorAll('.tp-prog b')], skipB = $('.tp-skip');
    let col = column(), vw = 0, vh = 0;
    // a landscape box (the 3D box goes wide for the tape on desktop): a 16:9 picture over the whole window, the cards as a lower-left block (class land)
    const layout = () => { col = column(); const land = col.w > col.h * 1.1; el.classList.toggle('land', land); Object.assign(el.style, { left: col.x + 'px', top: col.y + 'px', width: col.w + 'px', height: col.h + 'px' });
      el.style.setProperty('--u', (land ? Math.min(col.w / 1000, col.h / 560) : Math.min(col.w / 390, col.h / 700)).toFixed(4) + 'px');
      const s = col.w < 300 ? 0.6 : 0.55, w = Math.round(col.w * s), h = Math.round(col.h * s); if (w !== vw || h !== vh) { vw = w; vh = h; } };
    layout();
    const V = T.video(Math.max(160, vw), Math.max(280, vh), { calm: reduce }); cvs.replaceWith(V.canvas); V.setEra(facts[0].era, facts[0].year); V.setMode('blue');
    const audio = bed(facts[0].era);
    const ctrl = T.ctrl = { el, video: V, audio, facts, shown: 0, ids: [], skipped: false, done: false, phase: 'intro', reduce, tape: opts.tape | 0 };
    let raf = 0, t = 0, last = nowS(), wake = null, skipFns = [];
    const loop = () => { raf = root.requestAnimationFrame(loop); const n = nowS(), dt = Math.min(0.1, n - last); last = n; t += dt * speed(); V.draw(t); osdT.textContent = '0:' + String(Math.max(0, V.state.tc) / 60 | 0).padStart(2, '0') + ':' + String(Math.max(0, V.state.tc) % 60 | 0).padStart(2, '0'); };
    loop();
    const onResize = () => layout(); root.addEventListener('resize', onResize);
    // waits that a tap (next) or a skip cut short
    const wait = (ms, soft) => new Promise((res) => { const id = setTimeout(() => { wake = null; res(); }, ms / speed()); wake = () => { clearTimeout(id); wake = null; res(); }; if (ctrl.skipped && !soft) { clearTimeout(id); res(); } });
    const hard = (ms) => new Promise((res) => setTimeout(res, ms / speed()));
    ctrl.next = () => { if (ctrl.phase === 'card' && wake) wake(); };
    ctrl.skip = () => { if (ctrl.skipped || ctrl.done) return; ctrl.skipped = true; skipFns.forEach((f) => { try { f(); } catch (e) { /* ignore */ } }); if (wake) wake(); };
    ctrl.onSkip = (f) => skipFns.push(f);
    // input: tap = next, hold 0.7 s = skip, SKIP button, Esc / Enter / Space / ArrowRight
    let hold = null;
    const holdEnd = () => { if (hold) { cancelAnimationFrame(hold.raf); hold = null; el.style.setProperty('--hold', 0); } };
    el.addEventListener('pointerdown', (ev) => { if (ev.target.closest('.tp-skip')) return; ev.preventDefault(); const h0 = nowS(); holdEnd(); hold = { h0, raf: 0 };
      const step = () => { if (!hold) return; const k = (nowS() - h0) / 0.7; el.style.setProperty('--hold', clamp(k, 0, 1).toFixed(3)); if (k >= 1) { holdEnd(); hold = { used: true }; ctrl.skip(); return; } hold.raf = requestAnimationFrame(step); }; step(); });
    el.addEventListener('pointerup', () => { const h = hold; holdEnd(); if (h && !h.used && h.h0 && nowS() - h.h0 < 0.4) ctrl.next(); });
    el.addEventListener('pointercancel', holdEnd); el.addEventListener('pointerleave', holdEnd);
    skipB.addEventListener('click', (ev) => { ev.stopPropagation(); ctrl.skip(); });
    const onKey = (ev) => { if (ev.key === 'Escape') { ev.preventDefault(); ctrl.skip(); } else if (ev.key === ' ' || ev.key === 'Enter' || ev.key === 'ArrowRight') { ev.preventDefault(); ctrl.next(); } };
    root.addEventListener('keydown', onKey, true);
    // the picture grows from rect (where the TV screen is on the page) to the full column
    const place = (r, k) => { const x = r.x - col.x, y = r.y - col.y, sx = r.w / col.w, sy = r.h / col.h; scr.style.transform = 'translate(' + (x * (1 - k)).toFixed(1) + 'px,' + (y * (1 - k)).toFixed(1) + 'px) scale(' + (sx + (1 - sx) * k).toFixed(4) + ',' + (sy + (1 - sy) * k).toFixed(4) + ')'; scr.style.borderRadius = ((1 - k) * 18) + 'px'; };
    const tween = (ms, f) => new Promise((res) => { const t0 = nowS(), d = ms / 1000 / speed(); const st = () => { const k = clamp((nowS() - t0) / d, 0, 1); f(ease(k)); if (k < 1) requestAnimationFrame(st); else res(); }; st(); });
    ctrl.enter = async (r) => {
      el.classList.add('bars'); V.setMode('play'); scr.style.opacity = 1;
      if (r && !reduce) { place(r, 0); await tween(650, (k) => place(r, k)); } else { scr.style.transform = ''; await tween(300, (k) => { scr.style.opacity = k; }); }
      scr.style.transform = ''; scr.style.borderRadius = '0'; el.classList.remove('bars'); el.classList.add('on');
    };
    ctrl.exit = async (r) => {
      el.classList.remove('on', 'carding'); card.innerHTML = ''; title.classList.remove('in');
      if (r && !reduce) await tween(520, (k) => { place(r, 1 - k); scr.style.opacity = String(1 - k * 0.35); });
      await tween(260, (k) => { el.style.opacity = String(1 - k); });
    };
    function showTitle() {
      const n = String((ctrl.tape % TF.count()) + 1).padStart(2, '0');
      title.innerHTML = '<div class="k">BBH HOME VIDEO &bull; TAPE ' + n + '</div><div class="s">A HISTORY OF</div><div class="h">THE HUMAN<br>BEATBOX</div><div class="lbl">' + facts.length + ' FACTS &bull; ROOTS TO TODAY</div>';
      requestAnimationFrame(() => title.classList.add('in'));
    }
    function showCard(f, i) {
      const er = ERA(f.era), words = f.text.split(/(\s+)/), d = 0.04;
      el.style.setProperty('--ec', er.c); el.style.setProperty('--ec2', er.c2); el.style.setProperty('--eg', hex(er.c, 0.45));
      const yr = String(f.year), yl = yr.length > 6 ? ' long' : '';
      card.className = 'tp-card'; card.setAttribute('data-fact', f.id);
      card.innerHTML = '<div class="tp-era">' + esc(er.name) + '<s>' + String(i + 1).padStart(2, '0') + ' / ' + String(facts.length).padStart(2, '0') + '</s></div>' +
        '<div class="tp-year' + yl + '">' + [...yr].map((c, j) => '<span style="transition-delay:' + (0.08 + j * 0.045).toFixed(3) + 's">' + (c === ' ' ? '&nbsp;' : esc(c)) + '</span>').join('') + '</div><div class="tp-rule"></div>' +
        '<div class="tp-text">' + words.map((w, j) => /^\s+$/.test(w) ? ' ' : '<span style="transition-delay:' + (0.32 + j / 2 * d).toFixed(3) + 's">' + esc(w) + '</span>').join('') + '</div>' +
        '<div class="tp-src"><b>SOURCE</b>' + esc(f.src) + '</div>';
      void card.offsetWidth; card.classList.add('in');
    }
    const fdur = (f) => clamp(4600 + f.text.length * 32, 5200, 9000);
    ctrl.run = async () => {
      audio.start(); audio.groove(facts[0].era, speed()); ctrl.phase = 'title';
      if (!ctrl.skipped) { showTitle(); el.style.setProperty('--vd', '.5'); el.style.setProperty('--vb', '1.5px'); await wait(2600); title.classList.remove('in'); await wait(380); }
      osdL.classList.remove('blink');
      for (let i = 0; i < facts.length && !ctrl.skipped; i++) {
        const f = facts[i]; ctrl.phase = 'cut'; V.setEra(f.era, f.year, f.vs); audio.setEra(f.era); if (i) audio.cheer();
        if (!reduce) { flash.style.transition = 'none'; flash.style.opacity = '.18'; void flash.offsetWidth; flash.style.transition = 'opacity .35s'; flash.style.opacity = '0'; }
        el.style.setProperty('--vd', '.95'); el.style.setProperty('--vb', '0px'); el.classList.remove('carding'); await wait(reduce ? 500 : 900); if (ctrl.skipped) break;
        el.style.setProperty('--vd', '.48'); el.style.setProperty('--vb', '1.6px'); el.classList.add('carding');
        prog.forEach((b, j) => { b.className = j < i ? 'done' : j === i ? 'cur' : ''; }); el.style.setProperty('--dur', (fdur(f) / speed() / 1000).toFixed(2) + 's');
        ctrl.phase = 'card'; showCard(f, i); ctrl.shown = i + 1; ctrl.ids.push(f.id);
        await wait(fdur(f)); ctrl.phase = 'out'; card.classList.add('out'); prog[i].className = 'done'; await wait(420, true);
        if (i === 0) { const hn = $('.tp-hint'); if (hn) hn.classList.add('gone'); }
      }
      ctrl.phase = 'end'; el.classList.remove('carding'); card.innerHTML = '';
      if (!ctrl.skipped) { title.innerHTML = '<div class="k">END OF TAPE</div><div class="lbl">BE KIND, REWIND</div>'; title.classList.add('in'); el.style.setProperty('--vd', '.6'); await hard(1500); title.classList.remove('in'); }
      ctrl.phase = 'rewind'; osdL.innerHTML = '<i></i><i></i>&nbsp;REW'; osdL.classList.add('rew'); V.setMode('rewind'); el.style.setProperty('--vd', '.9'); el.style.setProperty('--vb', '0px'); audio.rewind(ctrl.skipped ? 0.9 : 1.6);
      await hard(ctrl.skipped ? 900 : 1600); V.setMode('blue'); audio.clunk(); await hard(300);
      ctrl.phase = 'done'; ctrl.done = true;
      return { tape: ctrl.tape, shown: ctrl.shown, ids: ctrl.ids.slice(), skipped: ctrl.skipped };
    };
    ctrl.unmount = () => { cancelAnimationFrame(raf); holdEnd(); root.removeEventListener('resize', onResize); root.removeEventListener('keydown', onKey, true); audio.stop(); try { el.remove(); } catch (e) { /* ignore */ } doc.body.classList.remove('tape-on'); if (T.ctrl === ctrl) T.ctrl = null; };
    return ctrl;
  };

  /* ================================================================== 2D: a CRT on the wall grows to fill the screen */
  T.play = async function (world, opts) {
    opts = opts || {}; const ctrl = T.mount(opts), col = column(), w = col.w * 0.62, h = w * 0.62, r = { x: col.x + (col.w - w) / 2, y: col.y + col.h * 0.36 - h / 2, w, h };
    try {
      ctrl.el.style.background = 'radial-gradient(ellipse at 50% 36%, #3a2466 0%, #1a1130 48%, #07040c 100%)';
      const tv = doc.createElement('div'), X = r.x - col.x, Y = r.y - col.y, hair = (G && G.ch && G.ch.look && G.ch.look.hair && G.ch.look.hair.color) || '#1a1420';
      tv.className = 'tp-room'; tv.style.cssText = 'position:absolute;inset:0;z-index:0;pointer-events:none;transition:opacity .4s';
      tv.innerHTML = '<div style="position:absolute;left:' + (X - 18) + 'px;top:' + (Y - 18) + 'px;width:' + (w + 36) + 'px;height:' + (h + 58) + 'px;border-radius:26px;background:linear-gradient(160deg,#4a4262,#211c33 60%,#16121f);box-shadow:0 30px 60px rgba(0,0,0,.7),0 0 80px rgba(110,150,255,.25),inset 0 2px 0 rgba(255,255,255,.16)">' +
        '<i style="position:absolute;right:22px;bottom:13px;width:9px;height:9px;border-radius:50%;background:#ff2f4f;box-shadow:0 0 10px #ff2f4f"></i><i style="position:absolute;left:22px;bottom:12px;width:40%;height:6px;border-radius:3px;background:repeating-linear-gradient(90deg,#0d0a16 0 3px,transparent 3px 6px)"></i></div>' +
        '<div style="position:absolute;left:' + (X + w * 0.5 - 2) + 'px;top:' + (Y - 18 - h * 0.55) + 'px;width:3px;height:' + (h * 0.58) + 'px;background:#5a5470;transform-origin:50% 100%;transform:rotate(-28deg)"></div><div style="position:absolute;left:' + (X + w * 0.5 - 2) + 'px;top:' + (Y - 18 - h * 0.55) + 'px;width:3px;height:' + (h * 0.58) + 'px;background:#5a5470;transform-origin:50% 100%;transform:rotate(24deg)"></div>' +
        '<div style="position:absolute;left:' + (X + w * 0.08) + 'px;top:' + (Y + h * 0.06) + 'px;width:' + (w * 0.4) + 'px;height:' + (h * 0.3) + 'px;border-radius:50%;background:radial-gradient(ellipse,rgba(255,255,255,.14),transparent 70%);z-index:3"></div>' +
        '<div style="position:absolute;left:-6%;right:-6%;bottom:0;height:24%;border-radius:40% 40% 0 0;background:linear-gradient(#c9922a,#7a5418);box-shadow:inset 0 6px 0 rgba(255,230,160,.35);z-index:4"></div>' +
        '<div style="position:absolute;left:' + (col.w * 0.18) + 'px;bottom:14%;width:' + (col.w * 0.3) + 'px;height:' + (col.w * 0.34) + 'px;border-radius:48% 48% 30% 30%;background:' + hair + ';box-shadow:0 0 30px rgba(120,160,255,.35);z-index:5"></div>' +
        '<div style="position:absolute;left:' + (col.w * 0.08) + 'px;bottom:0;width:' + (col.w * 0.5) + 'px;height:16%;border-radius:45% 45% 0 0;background:#1a1426;z-index:5"></div>';
      ctrl.el.insertBefore(tv, ctrl.el.firstChild);
      const scr = ctrl.el.querySelector('.tp-scr'); scr.style.opacity = 1; scr.style.transform = 'translate(' + (r.x - col.x) + 'px,' + (r.y - col.y) + 'px) scale(' + (w / col.w) + ',' + (h / col.h) + ')'; scr.style.borderRadius = '18px';
      const sp = opts.speed || T.speed || 1, z = (ms) => new Promise((res) => setTimeout(res, ms / sp)), skip = new Promise((res) => ctrl.onSkip(res)), pz = (ms) => Promise.race([z(ms), skip]);
      ctrl.el.classList.add('bars'); await pz(500); ctrl.audio.start(); ctrl.audio.clunk(); ctrl.video.setMode('snow'); await pz(350); ctrl.video.setMode('play'); await pz(900);
      await ctrl.enter(r); tv.style.opacity = '0';
      const res = await ctrl.run(); tv.style.opacity = '1'; await ctrl.exit(r); return res;
    } finally { ctrl.unmount(); }
  };

  /* ================================================================== the couch row */
  if (G) {
    G.watchTape = function (S) {
      const ch = G.ch; if (!ch) return Promise.resolve(null);
      if (ch.flags.tapeDay === ch.day || T.playing) { if (!T.playing) G.do({ t: 'tape' }); return Promise.resolve(null); }
      const k = ch.flags.tapeNext | 0, facts = TF.pick(k), R3 = BBH.R3, w = S && S.is3d && S.w, lib = R3 && R3.lib;
      T.playing = true; let mus = null; try { mus = BBH.Audio && BBH.Audio.music.current(); BBH.Audio.music.stop(0.6); } catch (e) { /* ignore */ }
      const p = w && lib && typeof lib.playTape === 'function' ? lib.playTape(w, { facts, tape: k, player: T, wide: typeof R3.setWide === 'function' ? (b) => R3.setWide(b) : null }) : T.play(null, { facts, tape: k });
      return Promise.resolve(p).catch((e) => { console.error('[tape]', e); return null; }).then((r) => {
        T.playing = false; T.last = r; try { const el = doc.getElementById('tape'); if (el) el.remove(); doc.body.classList.remove('tape-on'); } catch (e) { /* ignore */ }
        try { if (E && E.music) E.music(mus || (S && S.id) || 'home'); } catch (e) { /* ignore */ }
        G.do({ t: 'tape' }); return r;
      });
    };
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
