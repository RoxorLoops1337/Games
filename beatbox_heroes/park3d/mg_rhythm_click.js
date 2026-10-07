// RHYTHM GAMES RUN WITH THE MUSIC OFF (TRAINING_PLAN 2): no scene music, no backing groove. Only a soft shaker metronome on the quarter notes
// (accent on 1), aligned to the chart clock and the player's offset setting, plus the beatbox sounds of whoever is playing.
//   const click = createClick();  click.musicOff();  const g = click.start({ bpm, t0?, offsetMs, lead });  ...  click.stop();  click.musicOn();
//   start() returns { t0, spb } like the old groove.start() so the chart can run on the audio clock (t0 null when the audio clock is not running).
//   Uses BBH.Audio.gameMode(on, { metronome: bpm, start }) when audio.js has it (start = audio time of beat 0 minus the offset); otherwise a local fallback: the scene music is held off
//   (music.play is parked until musicOn) and the ticks are scheduled on the audio clock with Audio.shaker(accent, { when }) or a quiet hat.
const BBH = () => (typeof window !== 'undefined' && window.BBH) || {};
const A = () => BBH().Audio || null;
const safe = (fn) => { try { return fn(); } catch (e) { return undefined; } };

export function createClick() {
  let held = false, metro = null, timer = null, parked = null, ticks = 0;
  const hasGM = () => { const a = A(); return !!(a && typeof a.gameMode === 'function'); };
  function musicOff() {
    const a = A(); if (!a || held) return; held = true;
    safe(() => a.groove && a.groove.stop(0.1));
    if (hasGM()) { safe(() => a.gameMode(true, { metronome: 0 })); return; }
    safe(() => a.music.stop(0.3));
    if (a.music && !a.music.__parked) { const play = a.music.play; a.music.__parked = play; a.music.play = () => false; parked = () => { if (a.music.__parked === play) { a.music.play = play; delete a.music.__parked; } }; }
  }
  function musicOn() {
    stop(); if (!held) return; held = false; const a = A();
    if (hasGM()) safe(() => a.gameMode(false)); if (parked) { parked(); parked = null; }
  }
  // ticks at t0 + k * spb - offset (a player who follows the shaker lands exactly where the judge wants them)
  function start(o) {
    o = o || {}; stop(); const a = A(), bpm = Math.max(30, o.bpm || 100), spb = 60 / bpm, off = (o.offsetMs || 0) / 1000;
    const now = a ? (safe(() => a.now()) || 0) : 0, t0 = now > 0 ? (o.t0 !== undefined ? o.t0 : now + (o.lead === undefined ? 0.2 : o.lead)) : null;
    metro = { bpm, spb, t0, off, next: t0 === null ? 0 : Math.ceil((now - t0 + off) / spb - 1e-6), via: hasGM() ? 'gameMode' : 'fallback', on: true };
    if (!held) musicOff();
    if (hasGM()) safe(() => a.gameMode(true, t0 === null ? { metronome: bpm } : { metronome: bpm, start: t0 - off }));         // audio.js: start = audio time of beat 0
    else if (t0 !== null) { pump(); timer = setInterval(pump, 30); }
    return { t0, spb };
  }
  function pump() {
    const a = A(), m = metro; if (!a || !m || m.t0 === null) return; const now = safe(() => a.now()) || 0;
    while (m.t0 + m.next * m.spb - m.off < now + 0.12) {
      const when = Math.max(now, m.t0 + m.next * m.spb - m.off), acc = ((m.next % 4) + 4) % 4 === 0; m.next++; ticks++;
      if (typeof a.shaker === 'function') safe(() => a.shaker(acc, { when })); else safe(() => a.drum(1, { when, vel: acc ? 0.3 : 0.17, pitch: 1.7 }));
    }
  }
  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
    if (metro && hasGM() && held) { const a = A(); safe(() => a.gameMode(true, { metronome: 0 })); }
    metro = null;
  }
  return { musicOff, musicOn, start, stop, state: () => ({ music: !held, metro: metro ? { bpm: metro.bpm, t0: metro.t0, offset: metro.off, via: metro.via } : null, ticks }) };
}
