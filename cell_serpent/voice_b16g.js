// Batch 16 (agent g): VOICE CLIPS. Five beatbox and vocal stings (kick, hat, snare, "uh", "yeah") that are synthesized
// (no audio files are shipped) and unlocked by milestones. They answer key moments (stage clear, boss entrance, a new
// best time, a perfect clear, a rare card, an unlock). Optional: real recordings in cell_serpent/assets/voice/<id>.mp3 replace the synth
// when voice files are switched on (see assets/voice/README.md). Pure helpers first, then the synth registrar and the card.
// Save: save.voice = { got: { id: 1 }, n: plays heard } (append-only, sanitizeVoice keeps only known ids).

export const STINGS = [
  { id: 'kick', name: 'Kick', word: 'BOOM', icon: '\u{1F941}', stat: 'cleared', need: 2, text: 'Clear 2 stages' },
  { id: 'hat', name: 'Hat', word: 'TSS', icon: '\u{1F3A7}', stat: 'runs', need: 6, text: 'Play 6 gigs' },
  { id: 'snare', name: 'Snare', word: 'PAH', icon: '\u{1F3B6}', stat: 'kills', need: 300, text: 'Pop 300 cells' },
  { id: 'uh', name: 'Uh', word: 'UH!', icon: '\u{1F5E3}️', stat: 'cleared', need: 8, text: 'Clear 8 stages' },
  { id: 'yeah', name: 'Yeah', word: 'YEAH!', icon: '\u{1F3A4}', stat: 'cleared', need: 15, text: 'Clear 15 stages' },
];
export const STING = Object.fromEntries(STINGS.map(s => [s.id, s]));
export const VOICE_IDS = STINGS.map(s => s.id);

// which sting answers which sound, first unlocked one of the list wins; VOICE_GAP = min ms between any two stings
export const MOMENTS = {
  clear: ['yeah', 'uh', 'kick'],
  bossintro: ['kick'],
  besttime: ['snare', 'hat', 'kick'],
  perfect: ['snare', 'yeah', 'kick'],
  stinger: ['hat', 'uh'],
  unlockfan: ['uh', 'yeah'],
};
export const VOICE_GAP = 2500;

const num = v => (Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
export const voiceDefault = () => ({ got: {}, n: 0 });
export function sanitizeVoice(raw) {
  const v = voiceDefault();
  if (raw && typeof raw === 'object') {
    if (raw.got && typeof raw.got === 'object') for (const id of VOICE_IDS) if (raw.got[id]) v.got[id] = 1;
    v.n = Math.min(1e9, num(raw.n));
  }
  return v;
}
// milestones are derived from the save, so an old account earns what it already did
export const stingEarned = (save, id) => { const s = STING[id]; return !!s && !!save && num(save[s.stat]) >= s.need; };
export function voiceStatus(save) {
  return STINGS.map(s => { const have = num(save && save[s.stat]); return { ...s, have: Math.min(have, s.need), earned: have >= s.need }; });
}
// ids earned but not yet recorded; marks them (the caller persists)
export function voiceCollect(save) {
  if (!save) return [];
  if (!save.voice || typeof save.voice !== 'object') save.voice = voiceDefault();
  if (!save.voice.got) save.voice.got = {};
  const out = [];
  for (const s of STINGS) if (stingEarned(save, s.id) && !save.voice.got[s.id]) { save.voice.got[s.id] = 1; out.push(s.id); }
  return out;
}
export const stingFor = (moment, save) => { const l = MOMENTS[moment]; if (!l) return null; for (const id of l) if (stingEarned(save, id)) return id; return null; };

// ---- the synth recipes as data (checked offline). k: tone | noise | vox (a sawtooth through two formant filters)
export function recipe(id) {
  switch (id) {
    case 'kick': return [{ k: 'tone', f: 170, d: 0.2, w: 'sine', v: 0.5, s: -125 }, { k: 'noise', d: 0.03, v: 0.16, f0: 3200, f1: 900, t: 'lowpass' }];
    case 'hat': return [{ k: 'noise', d: 0.06, v: 0.2, f0: 9500, f1: 7000, t: 'highpass' }, { k: 'noise', d: 0.05, v: 0.12, f0: 9500, f1: 7000, t: 'highpass', at: 0.09 }];
    case 'snare': return [{ k: 'noise', d: 0.17, v: 0.3, f0: 3600, f1: 1400, t: 'bandpass' }, { k: 'tone', f: 210, d: 0.1, w: 'triangle', v: 0.2, s: -90 }];
    case 'uh': return [{ k: 'vox', f: 128, d: 0.2, v: 0.2, a: [560, 1050], b: [520, 1000], g: -18 }];
    case 'yeah': return [{ k: 'vox', f: 150, d: 0.42, v: 0.2, a: [380, 2300], b: [720, 1750], g: 38 }, { k: 'noise', d: 0.03, v: 0.06, f0: 5000, f1: 3000, t: 'highpass' }];
    default: return [];
  }
}

// ---- the real recordings hook (opt in): voice files are only fetched when switched on, so a missing file never
// logs a failed request in a normal session. On: window.CS_VOICE_FILES = 1, ?voicefiles=1, or localStorage cs_voice_files = '1'.
export function voiceFilesOn() {
  try {
    if (typeof window !== 'undefined' && window.CS_VOICE_FILES) return true;
    if (typeof location !== 'undefined' && /[?&]voicefiles=1\b/.test(location.search)) return true;
    if (typeof localStorage !== 'undefined' && localStorage.getItem('cs_voice_files') === '1') return true;
  } catch (e) { /* ignore */ }
  return false;
}
export const voiceFileUrl = id => new URL('./assets/voice/' + id + '.mp3', import.meta.url).href;

// env = { ac: () => AudioContext | null, out: () => sfx bus, muted: () => bool }
export function registerB16g(sfx, tone, noise, duck, gate, env) {
  const bufs = {}, tried = {};
  function vox(o, delay) {
    const ac = env.ac(), out = env.out(); if (!ac || !out || env.muted()) return;
    const t = ac.currentTime + delay, d = o.d;
    const src = ac.createOscillator(), g = ac.createGain(), f1 = ac.createBiquadFilter(), f2 = ac.createBiquadFilter();
    src.type = 'sawtooth'; src.frequency.setValueAtTime(o.f, t); src.frequency.linearRampToValueAtTime(o.f + o.g, t + d);
    f1.type = f2.type = 'bandpass'; f1.Q.value = f2.Q.value = 5;
    f1.frequency.setValueAtTime(o.a[0], t); f1.frequency.linearRampToValueAtTime(o.b[0], t + d);
    f2.frequency.setValueAtTime(o.a[1], t); f2.frequency.linearRampToValueAtTime(o.b[1], t + d);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(o.v, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0008, t + d);
    src.connect(f1); src.connect(f2); f1.connect(g); f2.connect(g); g.connect(out); src.start(t); src.stop(t + d + 0.02);
  }
  sfx.voice = e => {
    const id = e && e.id; if (!STING[id] || !gate('voice_' + id, 250)) return;
    const ac = env.ac();
    if (bufs[id] && ac && !env.muted()) { try { const s = ac.createBufferSource(); s.buffer = bufs[id]; s.connect(env.out()); s.start(); duck(0.25, 0.4); return; } catch (err) { /* fall back to the synth */ } }
    for (const op of recipe(id)) {
      if (op.k === 'tone') tone(op.f, op.d, op.w, op.v, op.s || 0, op.at || 0);
      else if (op.k === 'noise') noise(op.d, op.v, op.f0, op.f1, op.t, op.at || 0);
      else if (op.k === 'vox') vox(op, op.at || 0);
    }
    duck(0.2, 0.3);
  };
  // load the recordings that exist (once per id); safe to call any time after the audio is unlocked
  sfx.voiceload = e => {
    const ac = env.ac(); if (!ac || !voiceFilesOn() || typeof fetch !== 'function') return;
    for (const id of (e && e.ids) || VOICE_IDS) {
      if (tried[id]) continue; tried[id] = 1;
      fetch(voiceFileUrl(id)).then(r => (r.ok ? r.arrayBuffer() : null)).then(b => (b ? ac.decodeAudioData(b) : null)).then(buf => { if (buf) bufs[id] = buf; }).catch(() => { /* no recording: the synth stays */ });
    }
  };
  sfx.voicehas = e => !!(e && bufs[e.id]);
}

// wrap audio.play: a few sounds are answered by the best unlocked sting (not more often than VOICE_GAP)
export function bindVoice(audio, getSave) {
  if (!audio || audio.__voiceB16g) return audio;
  const play = audio.play.bind(audio); let last = -1e9, loaded = false;
  audio.play = (name, e) => {
    const r = play(name, e);
    if (name === 'click' && !loaded) { loaded = true; play('voiceload'); }
    if (MOMENTS[name]) {
      const sv = getSave(), id = sv && stingFor(name, sv), t = Date.now();
      if (id && t - last > VOICE_GAP) { last = t; setTimeout(() => play('voice', { id }), name === 'clear' ? 260 : 90); }
    }
    return r;
  };
  audio.__voiceB16g = true; return audio;
}

// ---- the Stats card: five tiles, tap an earned one to hear it
export function voiceCard(save, onPlay) {
  if (typeof document === 'undefined' || !save) return null;
  const box = document.createElement('div'); box.className = 'voiceb16g';
  const st = voiceStatus(save), got = st.filter(s => s.earned).length;
  let h = '<div class="vc-h">Voice Clips<span class="vc-n">' + got + ' / ' + st.length + '</span></div><div class="vc-row">';
  for (const s of st) {
    h += s.earned
      ? '<button type="button" class="vc-t on" data-id="' + s.id + '" aria-label="Play ' + s.name + '"><span class="vc-i">' + s.icon + '</span><b>' + s.word + '</b><small>' + s.name + '</small></button>'
      : '<div class="vc-t off" data-id="' + s.id + '"><span class="vc-i">\u{1F512}</span><b>' + s.text + '</b><i class="vc-bar"><u style="width:' + Math.round(100 * s.have / s.need) + '%"></u></i></div>';
  }
  box.innerHTML = h + '</div>';
  box.addEventListener('click', ev => { const b = ev.target.closest('.vc-t.on'); if (!b) return; onPlay(b.dataset.id); b.classList.remove('hit'); void b.offsetWidth; b.classList.add('hit'); });
  return box;
}
// after a run: record new clips, tell the player, let the new one ring
export function voiceAfterRun(save, audio, toast, persist) {
  const ids = voiceCollect(save); if (!ids.length) return ids;
  persist();
  const s = STING[ids[ids.length - 1]];
  setTimeout(() => { try { audio.play('voice', { id: s.id }); toast('New voice clip: ' + s.word); } catch (e) { /* ignore */ } }, 1800);
  return ids;
}
