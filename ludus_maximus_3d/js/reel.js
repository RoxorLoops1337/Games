// Highlight reel (Ludus Maximus 3D): the three best moments of a fight, replayed with cinematic cuts, and a "Share clip" that records the canvas.
//   record(F, e)   live fights only: scores sim events (big hits, crits, ultimates, big blasts, falls, revives, our orders) by sim step F.n
//   finish(F)      at the end of the fight: clusters the scores into at most 3 segments {a, b, n, kind, label, src, dst} stored in F.replay.moments
//   begin(R)       a replay opened with {reel:true}: seeks to each segment in turn (FightView.seekTo, silent fast-forward), cuts the camera with the director,
//                  shows a lower third caption, then an end card (Replay reel / Share clip / Done)
//   share()        MediaRecorder on canvas.captureStream() while the reel plays -> .webm (or .mp4 where that is what the browser records) saved or shared;
//                  without MediaRecorder / captureStream a PNG screenshot of the current frame instead
// Nothing here touches the sim: the reel is a replay (same seed, same snapshot, same taps) so it is deterministic and costs nothing to store.
const D = () => globalThis.LM_D, L = () => globalThis.LM;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const STEP = 1 / 30, PRE = 72, POST = 54, FINAL_PRE = 96;

/** pure: turn scored moments into at most `max` segments (testable without a DOM) */
export function pickSegments(moments, total, max = 3) {
  total = Math.max(1, total | 0); const ms = (moments || []).filter((m) => m && m.score > 0 && m.n >= 0 && m.n <= total);
  if (!ms.length) return [];
  const W = 45, smooth = (n) => ms.reduce((s, m) => (Math.abs(m.n - n) <= W ? s + m.score : s), 0);
  const final = ms.filter((m) => m.final).sort((x, y) => y.n - x.n)[0], cand = ms.map((m) => ({ m, s: smooth(m.n) + (m.final ? 120 : 0) })).sort((x, y) => y.s - x.s || x.m.n - y.m.n);
  const chosen = []; const clash = (n) => chosen.some((c) => Math.abs(c.n - n) < PRE + POST + 18);
  if (final) chosen.push(final);
  for (const c of cand) { if (chosen.length >= max) break; if (!clash(c.m.n)) chosen.push(c.m); }
  chosen.sort((x, y) => x.n - y.n);
  return chosen.map((m, i) => {
    const isFinal = !!m.final, a = clamp(m.n - (isFinal ? FINAL_PRE : PRE), 0, total), b = isFinal ? total + 90 : clamp(m.n + POST, 0, total);
    // the best-scoring neighbour names the segment
    const near = ms.filter((x) => Math.abs(x.n - m.n) <= W).sort((p, q) => q.score - p.score)[0] || m;
    return { a, b, n: m.n, kind: near.kind, label: isFinal ? 'The final blow' : near.label, src: near.src || m.src || null, dst: near.dst || m.dst || null, score: Math.round(smooth(m.n)), final: isFinal };
  }).filter((s, i, arr) => i === 0 || s.a >= arr[i - 1].b - 1 || (arr[i - 1].b = s.a));
}

export function createReel(fv) {
  const R = { list: [], on: false, state: 'idle', segs: [], i: 0, segT: 0, rec: null, lastClip: null, els: {} };
  const el = (t, c, txt) => { const e = document.createElement(t); if (c) e.className = c; if (txt != null) e.textContent = txt; return e; };
  const unit = (id) => (id && fv.F ? fv.F.units.find((u) => u.id === id) : null);

  // ---------------------------------------------------------------- scoring (live fights)
  R.reset = () => { R.list = []; };
  R.record = (F, e) => {
    if (fv.replaying || !F) return; const n = F.n || 0, ml = R.list; if (ml.length > 600) return;
    switch (e.k) {
      case 'hit': {
        if (e.hz) return; const dst = unit(e.dst); if (!dst) return; const fr = e.dmg / dst.maxhp; if (fr < 0.07 && !e.crit) return;
        ml.push({ n, kind: 'hit', score: fr * 100 + (e.crit ? 20 : 0), label: e.crit ? 'Critical blow' : fr > 0.2 ? 'Crushing blow' : 'Heavy hit', src: e.src, dst: e.dst }); break;
      }
      case 'ult': { const nm = (D().ULTS[e.id] || (D().DUOS && D().DUOS[(e.id || '').slice(4)]) || { n: 'Ultimate' }).n; ml.push({ n, kind: 'ult', score: 45, label: nm, src: e.src, dst: null }); break; }
      case 'aoe': if (e.big && !e.haz) ml.push({ n, kind: 'aoe', score: 30, label: 'Shockwave', src: null, dst: null }); break;
      case 'down': { const last = !F.units.some((u) => u.side === (unit(e.dst) || {}).side && !u.down && u.id !== e.dst); ml.push({ n, kind: 'down', score: last ? 100 : 70, label: last ? 'The final blow' : 'Fighter down', src: e.src, dst: e.dst, final: last }); break; }
      case 'revive': ml.push({ n, kind: 'revive', score: 55, label: 'Back from the dead', src: null, dst: e.dst }); break;
      case 'cmd': if (e.side === 'A') ml.push({ n, kind: 'cmd', score: 16, label: 'A bold order', src: e.src, dst: null }); break;
      default: break;
    }
  };
  R.finish = (F) => {
    if (!F || !F.replay) return; const total = F.n || 0, segs = pickSegments(R.list, total, 3);
    F.replay.moments = segs; R.list = []; return segs;
  };

  // ---------------------------------------------------------------- playback
  const build = () => {
    R.clear(); const host = fv.hud, e = R.els;
    e.bars = el('div', 'reel-bars'); e.bars.innerHTML = '<i></i><i></i>';
    e.dots = el('div', 'reel-dots'); e.cap = el('div', 'reel-cap'); e.rec = el('div', 'reel-rec', 'REC'); e.rec.style.display = 'none';
    host.append(e.bars, e.dots, e.cap, e.rec);
    e.share = document.createElement('button'); e.share.type = 'button'; e.share.className = 'lx-btn lx-btn-bronze lx-fv-btn reel-sharebtn'; e.share.innerHTML = '<span class="lx-btn-label">Share clip</span>'; e.share.onclick = () => R.share();
    fv.topRow.prepend(e.share);
  };
  R.clear = () => { for (const k in R.els) { const v = R.els[k]; if (v && v.remove) v.remove(); } R.els = {}; };
  const caption = (seg, i) => {
    const e = R.els; if (!e.cap) return; const a = unit(seg.src), b = unit(seg.dst);
    e.cap.innerHTML = ''; const k = el('span', 'reel-k', 'Highlight ' + (i + 1) + ' of ' + R.segs.length), t = el('b', 'reel-t', seg.label), w = el('span', 'reel-w', a && b ? a.name + ' vs ' + b.name : a ? a.name : b ? b.name : '');
    e.cap.append(k, t, w); e.cap.classList.remove('in'); void e.cap.offsetWidth; e.cap.classList.add('in');
    e.dots.innerHTML = ''; R.segs.forEach((_, j) => e.dots.append(Object.assign(el('i'), { className: j === i ? 'on' : j < i ? 'done' : '' })));
  };
  const cut = (seg, i) => {
    const F = fv.F; if (seg.a > (F.n || 0)) fv.seekTo(seg.a); fv.setCam('auto');
    fv.dir.setShot('follow', {}, 0); const s = unit(seg.src), d = unit(seg.dst);
    if ((seg.kind === 'hit' || seg.kind === 'ult' || seg.kind === 'cmd') && s && d && !s.down && !d.down) fv.dir.setShot('duel', { a: s.id, b: d.id, side: i % 2 ? -1 : 1 }, 0);
    R.segT = 0; R.cam = 'duel'; caption(seg, i); try { fv.feel.flash(0, 0, 0, 1, 7); fv.audio.sfx('swish', { gain: 0.5 }); fv.audio.sfx('crowdCheer', { gain: 0.35 }); } catch (er) { /* feel and audio are optional */ }
    if (F && F.done) R.segT = 0;
  };
  R.begin = (Rep) => {
    R.segs = (Rep && Rep.moments) || []; R.on = true; R.i = 0; R.state = 'play'; R.recording = false; build();
    if (!R.segs.length) { R.end(); return; }
    cut(R.segs[0], 0);
  };
  /** from the first cut again: the replay restarts from its snapshot (FightView.start runs begin() again, a running recording carries on) */
  R.restart = () => { if (!R.on) return; fv.paused && fv.pause(false); fv.restartReplay(); };
  R.tick = (dt) => {
    if (!R.on || R.state !== 'play' || fv.paused) return; const F = fv.F, seg = R.segs[R.i]; if (!seg) return; R.segT += dt;
    if (R.cam === 'duel' && R.segT > 1.7 && fv.phase === 'fight') { R.cam = 'follow'; fv.dir.setShot('follow', {}, 0.9); }
    if (R.els.cap && R.segT > 3.2) R.els.cap.classList.remove('in');
    const over = (F.n || 0) >= seg.b || (F.done && R.segT > (seg.final ? 5.2 : 1));
    if (over || R.segT > 14) { R.i++; if (R.i < R.segs.length) cut(R.segs[R.i], R.i); else R.end(); }
  };
  R.end = () => {
    if (R.state === 'end') return; R.state = 'end'; if (R.rec) R.stopRec(); const e = R.els; if (e.cap) e.cap.classList.remove('in'); if (!fv.F.done && !fv.paused) fv.pause(true);
    const box = e.end = el('div', 'reel-end'); const card = el('div', 'reel-card');
    card.append(el('div', 'reel-ek', 'Highlights'), el('b', 'reel-et', R.segs.length ? 'That was a fight' : 'Nothing worth a reel'), el('span', 'reel-es', R.segs.length ? 'Share it with the world, or watch it again.' : 'A quiet bout. Try the full replay.'));
    const row = el('div', 'reel-acts'), mk = (label, variant, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'lx-btn lx-btn-' + variant; b.innerHTML = '<span class="lx-btn-label"></span>'; b.firstChild.textContent = label; b.onclick = fn; return b; };
    if (R.segs.length) row.append(mk('Share clip', 'gold', () => R.share()), mk('Watch again', 'bronze', () => R.restart()));
    row.append(mk('Done', R.segs.length ? 'ghost' : 'gold', () => { fv.skip = true; })); card.append(row); box.append(card); fv.hud.append(box); box.style.pointerEvents = 'auto';
  };
  R.hideEnd = () => { if (R.els.end) { R.els.end.remove(); R.els.end = null; } };
  /** soft: the fight view is rebuilding itself (restart), a running recording is kept. hard: leaving the replay, the recording is dropped. */
  R.stop = (soft) => {
    if (!soft && R.rec) { const r = R.rec; R.rec = null; try { r.mr.onstop = null; r.mr.stop(); r.stream.getTracks().forEach((t) => t.stop()); } catch (e) { /* already stopped */ } }
    R.on = false; R.state = 'idle'; R.clear(); R.i = 0;
  };

  // ---------------------------------------------------------------- share clip
  R.canRecord = () => { const c = fv.renderer.domElement; return !!(window.MediaRecorder && c.captureStream); };
  const mime = () => { const c = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4']; return c.find((t) => { try { return MediaRecorder.isTypeSupported(t); } catch (e) { return false; } }) || ''; };
  R.share = () => {
    if (!R.on) return false; fv.audio.sfx('uiConfirm', { gain: 0.5 });
    if (!R.canRecord() || !R.segs.length) { R.screenshot(); return false; }
    if (R.rec) return true;
    try {
      const cv = fv.renderer.domElement, stream = cv.captureStream(30), type = mime(), mr = new MediaRecorder(stream, Object.assign(type ? { mimeType: type } : {}, { videoBitsPerSecond: 5e6 })), chunks = [];
      mr.ondataavailable = (ev) => { if (ev.data && ev.data.size) chunks.push(ev.data); };
      mr.onstop = () => { const blob = new Blob(chunks, { type: mr.mimeType || type || 'video/webm' }); R.rec = null; if (R.els.rec) R.els.rec.style.display = 'none'; if (!blob.size) { R.lastClip = { size: 0, type: blob.type, name: '' }; R.screenshot(); return; } R.deliver(blob); };   // an empty recording (no frames reached the encoder) falls back to a screenshot
      mr.onerror = () => { R.rec = null; R.screenshot(); };
      R.rec = { mr, stream }; mr.start(250); if (R.els.rec) R.els.rec.style.display = '';
      R.restart();                                               // the clip is the whole reel from its first cut to its last
      return true;
    } catch (e) { R.rec = null; R.screenshot(); return false; }
  };
  R.stopRec = () => { const r = R.rec; if (!r) return; try { setTimeout(() => { try { r.mr.requestData(); r.mr.stop(); } catch (e) { /* stopped */ } r.stream.getTracks().forEach((t) => t.stop()); }, 300); } catch (e) { /* stopped */ } };
  const fname = (ext) => { const S = globalThis.__LM3D && globalThis.__LM3D.game && globalThis.__LM3D.game.S; const nm = String((S && S.name) || 'ludus').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); return `ludus-maximus-${nm}-highlights.${ext}`; };
  R.deliver = async (blob) => {
    const ext = /mp4/.test(blob.type) ? 'mp4' : 'webm', name = fname(ext); R.lastClip = { size: blob.size, type: blob.type, name };
    try { const file = new File([blob], name, { type: blob.type }); if ('ontouchstart' in window && navigator.canShare && navigator.share && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Ludus Maximus highlights' }); fv.banner('Clip shared', 'info'); return; } } catch (e) { /* share cancelled: fall through to a download */ }
    R.download(blob, name); fv.banner('Clip saved: ' + name, 'info');
  };
  R.download = (blob, name) => { try { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 8000); } catch (e) { /* downloads blocked */ } };
  /** fallback: one PNG of the current frame (render, then copy the GL canvas in the same task: no preserveDrawingBuffer needed) */
  R.screenshot = () => {
    try {
      const gl = fv.renderer.domElement, w = gl.width, h = gl.height, c = document.createElement('canvas'); c.width = w; c.height = h; fv.renderer.info.reset(); fv.post.render(0.0001, fv.t); c.getContext('2d').drawImage(gl, 0, 0, w, h);
      c.toBlob((blob) => { if (!blob) { fv.banner('Could not capture the frame', 'info'); return; } R.lastClip = { size: blob.size, type: 'image/png', name: fname('png') }; R.download(blob, R.lastClip.name); fv.banner('Screenshot saved (this browser cannot record video)', 'info'); }, 'image/png');
    } catch (e) { fv.banner('Could not capture the frame', 'info'); }
  };
  return R;
}

const CSS = `
.reel-bars i{position:absolute;left:0;right:0;height:calc(9vh + var(--lx-sat,0px));pointer-events:none;z-index:20}
.reel-bars i:first-child{top:0;background:linear-gradient(180deg,rgba(8,5,14,.88),rgba(8,5,14,0))}
.reel-bars i:last-child{bottom:0;height:calc(11vh + var(--lx-sab,0px));background:linear-gradient(0deg,rgba(8,5,14,.9),rgba(8,5,14,0))}
.reel-dots{position:absolute;left:50%;top:calc(var(--lx-sat,0px) + 52px);transform:translateX(-50%);display:flex;gap:7px;z-index:22;pointer-events:none}
.reel-dots i{width:22px;height:5px;border-radius:3px;background:rgba(246,234,208,.35)}
.reel-dots i.on{background:#f2c14e;box-shadow:0 0 8px #f2c14e}.reel-dots i.done{background:rgba(242,193,78,.6)}
.reel-cap{position:absolute;left:var(--lx-gut,14px);bottom:calc(var(--lx-sab,0px) + 14px);z-index:22;pointer-events:none;display:flex;flex-direction:column;gap:2px;padding:8px 14px 9px;border-left:4px solid #f2c14e;background:linear-gradient(90deg,rgba(18,12,30,.86),rgba(18,12,30,0));max-width:min(80vw,460px);opacity:0;transform:translateX(-24px);transition:opacity .35s,transform .35s}
.reel-cap.in{opacity:1;transform:none}
.reel-k{font:800 10px/1 var(--lx-sans,system-ui);letter-spacing:.3em;text-transform:uppercase;color:#f2c14e}
.reel-t{font:900 clamp(20px,5.8vw,32px)/1.05 var(--lx-serif,Georgia,serif);letter-spacing:.06em;text-transform:uppercase;color:#fff3d6;text-shadow:0 2px 0 #000,0 0 16px rgba(0,0,0,.8)}
.reel-w{font:700 12px/1.2 var(--lx-sans,system-ui);color:#e8dcc0;text-shadow:0 1px 3px #000}
.reel-rec{position:absolute;right:calc(var(--lx-sar,0px) + 14px);top:calc(var(--lx-sat,0px) + 54px);z-index:23;pointer-events:none;font:900 11px/1 var(--lx-sans,system-ui);letter-spacing:.16em;color:#fff;padding:4px 8px 4px 20px;border-radius:999px;background:rgba(194,57,47,.9)}
.reel-rec::before{content:'';position:absolute;left:8px;top:50%;width:7px;height:7px;margin-top:-3.5px;border-radius:50%;background:#fff;animation:reel-blink 1s steps(2) infinite}
@keyframes reel-blink{50%{opacity:.15}}
.reel-end{position:absolute;inset:0;z-index:40;display:grid;place-items:center;background:radial-gradient(ellipse at center,rgba(14,9,26,.35),rgba(14,9,26,.82));padding:16px}
.reel-card{display:flex;flex-direction:column;align-items:center;gap:8px;padding:18px 20px;border-radius:14px;background:linear-gradient(180deg,rgba(58,45,82,.96),rgba(26,19,44,.96));border:2px solid #b8803a;box-shadow:0 14px 40px rgba(0,0,0,.7);max-width:min(92vw,380px);text-align:center;animation:bk-rise .4s ease-out both}
.reel-ek{font:800 11px/1 var(--lx-sans,system-ui);letter-spacing:.34em;text-transform:uppercase;color:#f2c14e}
.reel-et{font:900 clamp(20px,6vw,28px)/1.1 var(--lx-serif,Georgia,serif);letter-spacing:.06em;text-transform:uppercase;color:#fff3d6}
.reel-es{font:600 13px/1.35 var(--lx-sans,system-ui);color:#d8ccb2}
.reel-acts{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:6px}.reel-acts .lx-btn{flex:1 1 120px}
@media (prefers-reduced-motion:reduce){.reel-cap{transition:none}.reel-rec::before{animation:none}.reel-card{animation:none}}
`;
export function injectReelCss() { if (document.getElementById('reel-css')) return; const s = document.createElement('style'); s.id = 'reel-css'; s.textContent = CSS; document.head.append(s); }
