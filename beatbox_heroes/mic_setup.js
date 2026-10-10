/* BBH.MicSetup: the MIC SETUP screens (browser only). Loaded after mic_play.js and engine.js.
 *   open({ slot, onDone(saved) })   say B, T, K, Pf (4 times each) -> your own voice profile; then an optional MIC TIMING check (8 clicks)
 *   firstRun(next)                  once per device: "PLAY WITH YOUR VOICE?" before the first set; always calls next() afterwards
 * The overlay lives in E.ui, so it sits on top of the 2D game and the 3D scenes alike. Nothing here runs a set.
 *
 * No em dashes anywhere in this file (project rule).
 */
(function (root) {
  'use strict';
  const BBH = root.BBH || (root.BBH = {});
  const COLORS = ['#ff4d6d', '#2ee6ff', '#ffd23f', '#9dff4a'];
  const HINT = ['A low thump, like "boots"', 'A short hiss, like "ts"', 'A crisp snare crack, like "k"', 'A breathy puff, like "pf"'];
  const supported = () => !!(BBH.Mic && BBH.Mic.open && BBH.MicPlay && root.navigator && root.navigator.mediaDevices && root.navigator.mediaDevices.getUserMedia);

  function open(o) {
    o = o || {};
    const E = BBH.E, h = E.h, MP = BBH.MicPlay, M = BBH.Mic, slot = o.slot || (BBH.G && BBH.G.slot) || 1;
    if (!supported()) { E.toast('No microphone available on this device.', 'warn'); if (o.onDone) o.onDone(false); return { close() {} }; }
    let stopL = null, raf = 0, dead = false, saved = false, cal = null, probe = null, clickTimers = [];
    const veil = h('div.full', { style: { background: 'rgba(10,6,24,.86)', zIndex: 70 } });
    const box = h('div.panel.pop', { style: { left: '12px', right: '12px', top: '56px', zIndex: 71, padding: '8px' } });
    const meter = E.bar('#2ee6ff', 0), fill = meter.firstChild;
    const listen = (cb) => { unlisten(); stopL = M.listen(cb); };
    const unlisten = () => { if (stopL) { try { stopL(); } catch (e) { /* ignore */ } stopL = null; } };
    const pump = () => { if (dead) return; fill.style.width = Math.round(Math.min(1, M.level() * 4) * 100) + '%'; raf = requestAnimationFrame(pump); };
    const close = () => { if (dead) return; dead = true; cancelAnimationFrame(raf); clickTimers.forEach(clearTimeout); unlisten(); try { M.close(); } catch (e) { /* ignore */ } veil.remove(); box.remove(); if (o.onDone) o.onDone(saved); };
    const show = (...kids) => { box.replaceChildren(...kids); };
    const title = (t) => h('div.h1.ctr', { style: { marginBottom: '6px' } }, t);

    function intro() {
      show(title('MIC SETUP'),
        h('div.t.ctr', { style: { marginBottom: '6px' } }, 'Beatbox into your mic and the game hears every sound. This takes 30 seconds.'),
        h('div.ts', { style: { marginBottom: '8px' } }, 'Hold your phone or mic about a hand away from your mouth. Find a quiet spot. You will say B, T, K and Pf four times each.'),
        h('div.row', { style: { justifyContent: 'center', gap: '6px' } }, E.btn('LATER', '', close), E.btn('START', 'green', begin)));
    }
    async function begin() {
      show(title('MIC SETUP'), h('div.t.ctr', null, 'Asking for your microphone...'));
      const r = await M.open();
      if (dead) { try { M.close(); } catch (e) { /* ignore */ } return; }
      if (!r || !r.ok) { show(title('NO MIC'), h('div.t.ctr', { style: { marginBottom: '8px' } }, r && r.error === 'denied' ? 'The browser blocked the microphone. Allow it in the site settings, then try again. Taps work fine meanwhile.' : 'The microphone is not available. Taps work fine meanwhile.'), E.btn('OK', 'gold', close)); return; }
      raf = requestAnimationFrame(pump);
      cal = MP.Calibrator();
      listen((ev) => { const res = cal.add(ev); feedback(res.reason); step(); });
      step();
    }
    let note = '';
    function feedback(reason) { note = reason === 'quiet' ? 'A bit louder, please.' : reason === 'odd' ? 'That sounded different. Try the same sound again.' : reason === 'ok' ? 'Got it!' : ''; }
    function step() {
      if (dead || !cal) return;
      const p = cal.prompt();
      if (!p) { unlisten(); results(); return; }
      const dots = h('div.row', { style: { justifyContent: 'center', gap: '4px', margin: '6px 0' } });
      for (let i = 0; i < p.of; i++) dots.appendChild(h('div', { style: { width: '14px', height: '14px', background: i < p.index ? COLORS[p.lane] : '#2a2140', border: '1px solid #5a4d86' } }));
      show(title('SAY ' + p.name.toUpperCase()), h('div.t.ctr', { style: { fontSize: '40px', lineHeight: '48px', height: '48px', color: COLORS[p.lane], margin: '4px 0' } }, p.name), h('div.ts.ctr', null, HINT[p.lane]), dots,
        h('div', { style: { margin: '4px 0' } }, meter), h('div.ts.ctr', { style: { minHeight: '12px', color: '#9dff4a' } }, note), h('div.tp.ctr', { style: { color: '#a7a3c4', marginTop: '4px' } }, 'Step ' + (p.step + 1) + ' of ' + p.steps),
        h('div.row', { style: { justifyContent: 'center', gap: '6px', marginTop: '6px' } }, E.btn('CANCEL', '', close), E.btn('UNDO', '', () => { cal.undo(); note = ''; step(); })));
    }
    function results() {
      const r = cal.result(), rows = r.profiles.map((_, l) => {
        const pct = Math.round(r.perLane[l] * 100);
        return h('div.row', { style: { gap: '6px', alignItems: 'center' } }, h('div.t', { style: { width: '22px', color: COLORS[l] } }, MP.LANES[l]), h('div.grow', null, E.bar(pct >= 75 ? COLORS[l] : '#ff7b7b', pct / 100)), h('div.tp', { style: { width: '30px', textAlign: 'right' } }, pct + '%'));
      });
      const bad = r.confused.map((c) => MP.LANES[c[0]] + ' and ' + MP.LANES[c[1]]);
      const msg = r.ok ? 'Great, the game knows your voice.' : bad.length ? bad.join(', ') + ' sound too alike. Make them more different (hiss for T, soft puff for Pf) and retry, or keep it anyway.' : 'Some sounds were not clear enough. Retry in a quieter spot, or keep it anyway.';
      show(title(r.ok ? 'VOICE READY' : 'ALMOST'), h('div.col', { style: { gap: '4px', margin: '4px 0' } }, rows), h('div.ts.ctr', { style: { margin: '6px 0', color: r.ok ? '#9dff4a' : '#ffd23f' } }, msg),
        h('div.row', { style: { justifyContent: 'center', gap: '6px' } }, E.btn('RETRY', '', () => { cal = MP.Calibrator(); note = ''; listen((ev) => { const q = cal.add(ev); feedback(q.reason); step(); }); step(); }),
          E.btn(r.ok ? 'SAVE' : 'KEEP IT', 'green', () => { MP.saveProfile(slot, r); saved = true; E.settings.mic = true; E.settings.micAsked = true; E.saveSettings(); E.sfx('confirm'); timingIntro(); })));
    }
    function timingIntro() {
      show(title('MIC TIMING'), h('div.t.ctr', { style: { marginBottom: '6px' } }, 'Last check: say "T" on every click.'), h('div.ts', { style: { marginBottom: '8px' } }, 'This fixes the small delay between your voice and the game. 8 clicks, about 5 seconds.'),
        h('div.row', { style: { justifyContent: 'center', gap: '6px' } }, E.btn('SKIP', '', close), E.btn('GO', 'green', timing)));
    }
    function timing() {
      const t0 = performance.now() + 1200, clicks = []; for (let i = 0; i < 8; i++) clicks.push(t0 + i * 600);
      probe = MP.LatencyProbe(clicks);
      const lamp = h('div', { style: { width: '60px', height: '60px', margin: '8px auto', background: '#2a2140', border: '2px solid #5a4d86' } });
      show(title('SAY T ON EACH CLICK'), lamp, h('div', { style: { margin: '4px 0' } }, meter), h('div.ts.ctr', null, 'Count 1, 2, 3 then follow the clicks.'));
      listen((ev) => { probe.add(ev.time); });
      clicks.forEach((c) => clickTimers.push(setTimeout(() => { if (dead) return; try { E.A().sfx('click'); } catch (e) { /* ignore */ } lamp.style.background = '#ffd23f'; clickTimers.push(setTimeout(() => { lamp.style.background = '#2a2140'; }, 120)); }, Math.max(0, c - performance.now()))));
      clickTimers.push(setTimeout(() => { if (dead) return; unlisten(); timingDone(); }, Math.max(0, clicks[7] - performance.now()) + 900));
    }
    function timingDone() {
      const r = probe.result(M.latencyMs());
      if (r.ok) { E.settings.micLat = r.lagMs; E.saveSettings(); M.setLatencyMs(r.lagMs); }
      show(title(r.ok ? 'TIMING SET' : 'COULD NOT TIME YOU'), h('div.t.ctr', { style: { marginBottom: '8px' } }, r.ok ? 'Mic delay is now ' + r.lagMs + ' ms.' : 'I heard ' + r.n + ' of 8 clicks, or your timing was uneven. The default timing stays. You can try again from SETTINGS.'), E.btn('DONE', 'gold', close));
    }

    E.ui.append(veil, box); intro();
    return { close };
  }

  /** once per device, before the first set: ask whether to play with the voice. Always ends in next(). Never asks a player who already chose. */
  function firstRun(next) {
    const E = BBH.E;
    if (!E || !supported() || E.settings.micAsked || E.settings.mic !== undefined) { next(); return; }
    E.settings.micAsked = true; E.saveSettings();
    E.modal({ title: 'PLAY WITH YOUR VOICE?', body: E.h('div.ts.ctr', null, 'Beatbox into your mic and the game hears your B, T, K and Pf. A 30 second setup tunes it to you. Taps always work too.'),
      buttons: [{ label: 'TAPS ONLY', fn: () => { E.settings.mic = false; E.saveSettings(); next(); } }, { label: 'SET UP MIC', cls: 'green', fn: () => open({ onDone: () => next() }) }] });
  }

  BBH.MicSetup = { open, firstRun, supported };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
