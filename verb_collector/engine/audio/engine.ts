// AudioEngine — singleton-ish wrapper around the Web Audio API.
//
// Routing graph:
//
//   sfxGain  ─┐
//             ├──► masterGain ──► AudioContext.destination
//   musicGain ┘
//
// Each SFX is dispatched to the SoundLib with `sfxGain` as the output node;
// music tracks receive `musicGain`. Per-channel gains are independent so the
// player can mix music down without losing combat SFX feedback.
//
// AudioContext creation is gated on a user gesture (browser autoplay policy)
// — we install one-shot pointerdown/keydown listeners on construction and
// also expose ensureStarted() so other code can opportunistically resume.
//
// Settings persist to localStorage under `verb_collector:audio:v1`. The schema
// is versioned in the key so future revisions can migrate or discard cleanly.

import { MusicHandle, sounds } from './sounds';

export type SfxName =
  | 'click' | 'token' | 'cast' | 'hit' | 'burn' | 'freeze' | 'heal'
  | 'block' | 'enemy_attack' | 'enemy_death' | 'reward' | 'scene_enter'
  | 'victory' | 'defeat' | 'ink';

export type MusicTrack = 'menu' | 'world' | 'combat' | 'boss';

export interface AudioSettings {
  master: number;
  music: number;
  sfx: number;
  muted: boolean;
}

const STORAGE_KEY = 'verb_collector:audio:v1';

const DEFAULT_SETTINGS: AudioSettings = {
  master: 0.7,
  music: 0.6,
  sfx: 0.8,
  muted: false,
};

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function loadSettings(): AudioSettings {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      return { ...DEFAULT_SETTINGS };
    }
    const rec = parsed as Record<string, unknown>;
    return {
      master: typeof rec['master'] === 'number' ? clamp01(rec['master']) : DEFAULT_SETTINGS.master,
      music:  typeof rec['music']  === 'number' ? clamp01(rec['music'])  : DEFAULT_SETTINGS.music,
      sfx:    typeof rec['sfx']    === 'number' ? clamp01(rec['sfx'])    : DEFAULT_SETTINGS.sfx,
      muted:  typeof rec['muted']  === 'boolean' ? rec['muted']           : DEFAULT_SETTINGS.muted,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(s: AudioSettings): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Quota or privacy mode — silently ignore. The settings remain in-memory.
  }
}

// Dispatch table from SfxName → SoundLib method. Centralising this keeps
// playSfx tiny and means the parallel composition agent only has to fill in
// sounds.ts without us touching engine.ts.
type SfxFn = (ctx: AudioContext, out: AudioNode) => void;
const SFX_DISPATCH: Record<SfxName, SfxFn> = {
  click:        (c, o) => sounds.playClick(c, o),
  token:        (c, o) => sounds.playToken(c, o),
  cast:         (c, o) => sounds.playCast(c, o),
  hit:          (c, o) => sounds.playHit(c, o),
  burn:         (c, o) => sounds.playBurn(c, o),
  freeze:       (c, o) => sounds.playFreeze(c, o),
  heal:         (c, o) => sounds.playHeal(c, o),
  block:        (c, o) => sounds.playBlock(c, o),
  enemy_attack: (c, o) => sounds.playEnemyAttack(c, o),
  enemy_death:  (c, o) => sounds.playEnemyDeath(c, o),
  reward:       (c, o) => sounds.playReward(c, o),
  scene_enter:  (c, o) => sounds.playSceneEnter(c, o),
  victory:      (c, o) => sounds.playVictory(c, o),
  defeat:       (c, o) => sounds.playDefeat(c, o),
  ink:          (c, o) => sounds.playInk(c, o),
};

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private currentMusic: MusicHandle | null = null;
  private currentTrack: MusicTrack | null = null;
  settings: AudioSettings;
  private gestureBound = false;

  constructor() {
    this.settings = loadSettings();
    this.installGestureListeners();
  }

  // Browser autoplay policy: AudioContexts created before a user gesture stay
  // in 'suspended' state and emit silence. We install one-shot listeners on
  // pointerdown + keydown to do the heavy lift at the right moment.
  private installGestureListeners(): void {
    if (this.gestureBound) return;
    if (typeof document === 'undefined') return;
    this.gestureBound = true;
    const wake = (): void => { this.ensureStarted(); };
    document.addEventListener('pointerdown', wake, { once: true });
    document.addEventListener('keydown', wake, { once: true });
  }

  ensureStarted(): void {
    if (this.ctx !== null) {
      // If the user has already gestured but the context drifted to suspended
      // (some mobile browsers do this on tab focus loss), resume it.
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      return;
    }
    if (typeof window === 'undefined') return;
    const Ctor: typeof AudioContext | undefined =
      (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
        .AudioContext
      ?? (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    const master = ctx.createGain();
    const sfx = ctx.createGain();
    const music = ctx.createGain();
    sfx.connect(master);
    music.connect(master);
    master.connect(ctx.destination);
    this.ctx = ctx;
    this.masterGain = master;
    this.sfxGain = sfx;
    this.musicGain = music;
    this.applyGains();
    // If a music track was requested before the context existed, start it now.
    if (this.currentTrack !== null) {
      this.startMusicInternal(this.currentTrack);
    }
  }

  private applyGains(): void {
    if (!this.masterGain || !this.sfxGain || !this.musicGain || !this.ctx) return;
    const now = this.ctx.currentTime;
    const m = this.settings.muted ? 0 : this.settings.master;
    this.masterGain.gain.setTargetAtTime(m, now, 0.01);
    this.sfxGain.gain.setTargetAtTime(this.settings.sfx, now, 0.01);
    this.musicGain.gain.setTargetAtTime(this.settings.music, now, 0.01);
  }

  playSfx(name: SfxName): void {
    if (this.settings.muted) return;
    this.ensureStarted();
    if (!this.ctx || !this.sfxGain) return;
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    try {
      SFX_DISPATCH[name](this.ctx, this.sfxGain);
    } catch {
      // SoundLib is a stub today; swallow any errors so we don't break the UI.
    }
  }

  setMusic(track: MusicTrack | null): void {
    if (this.currentTrack === track) return;
    this.currentTrack = track;
    // Crossfade by stopping the current handle (the SoundLib implementation
    // handles the actual fade ramp internally) and starting a new one.
    if (this.currentMusic) {
      try { this.currentMusic.stop(600); } catch { /* ignore */ }
      this.currentMusic = null;
    }
    if (track === null) return;
    this.startMusicInternal(track);
  }

  private startMusicInternal(track: MusicTrack): void {
    if (!this.ctx || !this.musicGain) {
      // Context not ready yet — setMusic will be replayed by ensureStarted().
      return;
    }
    try {
      this.currentMusic = sounds.startMusic(this.ctx, this.musicGain, track);
    } catch {
      this.currentMusic = null;
    }
  }

  setMasterVolume(v: number): void {
    this.settings = { ...this.settings, master: clamp01(v) };
    saveSettings(this.settings);
    this.applyGains();
  }

  setMusicVolume(v: number): void {
    this.settings = { ...this.settings, music: clamp01(v) };
    saveSettings(this.settings);
    this.applyGains();
  }

  setSfxVolume(v: number): void {
    this.settings = { ...this.settings, sfx: clamp01(v) };
    saveSettings(this.settings);
    this.applyGains();
  }

  setMuted(m: boolean): void {
    this.settings = { ...this.settings, muted: m };
    saveSettings(this.settings);
    this.applyGains();
  }
}

// Module-level singleton. Lazy so SSR / test environments don't crash on
// `document` access — the constructor guards `typeof document`.
let _engine: AudioEngine | null = null;
export function getAudioEngine(): AudioEngine {
  if (!_engine) _engine = new AudioEngine();
  return _engine;
}
