// Quiet generative music and ambience on the shared Web Audio context. No audio files:
// a soft plucked pentatonic by day, slow bells at night, filtered noise for rain, and a
// heartbeat of drums and a low drone while a boss is awake. Everything sits far below the
// sound effects and follows the Music slider in Settings.

import { settings } from '../settings';

interface MusicState { night: number; rain: number; boss: number; phase: number; /** 0..1 down in the caves */ under?: number; /** 0..1 in the Dread Reaches */ dread?: number }

const DAY = [261.63, 293.66, 329.63, 392, 440, 523.25, 587.33, 659.26];
const NIGHT = [110, 130.81, 146.83, 164.81, 196, 220, 261.63, 329.63];
/** The caves: a low, hollow minor pentatonic, struck slowly like stones in a well. The Dread Reaches: a diminished scale that never quite resolves. */
const CAVE = [98, 116.54, 130.81, 146.83, 174.61, 196, 233.08, 261.63];
const DREAD = [110, 130.81, 155.56, 185, 220, 261.63, 311.13, 370];

let ctx: AudioContext | null = null;
let bus: GainNode | null = null;
let rainGain: GainNode | null = null;
let padGain: GainNode | null = null;
let droneGain: GainNode | null = null;
let pad: OscillatorNode[] = [];
let drone: OscillatorNode | null = null;
let noise: AudioBuffer | null = null;
let nextNote = 0, nextBeat = 0, beat = 0, nextDrip = 0;

export function initMusic (game: Phaser.Game) {
    const mgr = game.sound as Phaser.Sound.WebAudioSoundManager;
    if (!('context' in mgr) || !mgr.context) return;
    ctx = mgr.context;
    bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(ctx.destination);
    // soft pad: two sines a fifth apart, breathing slowly
    padGain = ctx.createGain(); padGain.gain.value = 0.0;
    padGain.connect(bus);
    pad = [130.81, 196].map((f, i) => {
        const o = ctx!.createOscillator();
        o.type = 'sine'; o.frequency.value = f; o.detune.value = i ? 4 : -3;
        o.connect(padGain!); o.start();
        return o;
    });
    // boss drone
    droneGain = ctx.createGain(); droneGain.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260;
    drone = ctx.createOscillator(); drone.type = 'sawtooth'; drone.frequency.value = 55;
    drone.connect(lp).connect(droneGain).connect(bus);
    drone.start();
    // rain: a loop of filtered noise
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noise.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) { last = (last + 0.06 * (Math.random() * 2 - 1)) / 1.06; d[i] = last * 3.2; }
    const src = ctx.createBufferSource(); src.buffer = noise; src.loop = true;
    const rf = ctx.createBiquadFilter(); rf.type = 'lowpass'; rf.frequency.value = 2400;
    rainGain = ctx.createGain(); rainGain.gain.value = 0;
    src.connect(rf).connect(rainGain).connect(bus);
    src.start();
}

function tone (freq: number, at: number, dur: number, vol: number, type: OscillatorType = 'triangle', bell = false) {
    if (!ctx || !bus) return;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    g.connect(bus);
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    o.connect(g); o.start(at); o.stop(at + dur + 0.05);
    if (bell) {
        const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = freq * 2.76;
        const g2 = ctx.createGain(); g2.gain.value = 0.35;
        o2.connect(g2).connect(g); o2.start(at); o2.stop(at + dur + 0.05);
    }
}

function thump (at: number, vol: number) {
    if (!ctx || !bus) return;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
    g.connect(bus);
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(95, at); o.frequency.exponentialRampToValueAtTime(42, at + 0.18);
    o.connect(g); o.start(at); o.stop(at + 0.26);
}

function tick (at: number, vol: number) {
    if (!ctx || !bus || !noise) return;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 6000;
    g.connect(bus);
    const n = ctx.createBufferSource(); n.buffer = noise;
    n.connect(hp).connect(g); n.start(at, Math.random()); n.stop(at + 0.06);
}

const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];

/** The last values handed to the AudioParams, and when: they glide on their own, so they are set again only five times a second or when a mood moves. */
const last = { at: -1, v: [0, 0, 0, 0, 0, 0, 0] };

/** Call every frame with the current mood. */
export function updateMusic (s: MusicState) {
    if (!ctx || !bus || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const vol = settings.sound ? settings.music * settings.volume : 0;
    const boss = Math.max(0, Math.min(1, s.boss));
    // pad follows day and night, and ducks for a boss
    const under = Math.max(0, Math.min(1, s.under ?? 0)), dread = Math.max(0, Math.min(1, s.dread ?? 0));
    const root = under > 0.5 ? [98, 146.83] : dread > 0.5 ? [87.31, 123.47] : s.night > 0.5 ? [110, 164.81] : [130.81, 196];
    const want = [vol * 0.9, root[0], root[1], 0.028 * (1 - boss * 0.7), 0.05 * boss + 0.02 * Math.max(dread, under * 0.5), 55 * (1 + s.phase * 0.06), 0.16 * s.rain];
    if (now - last.at >= 0.2 || want.some((w, i) => Math.abs(w - last.v[i]) > 0.01)) {
        last.at = now; last.v = want;
        bus.gain.setTargetAtTime(want[0], now, 0.4);
        pad[0].frequency.setTargetAtTime(want[1], now, 2.5);
        pad[1].frequency.setTargetAtTime(want[2], now, 2.5);
        padGain!.gain.setTargetAtTime(want[3], now, 1.5);
        droneGain!.gain.setTargetAtTime(want[4], now, 1.2);
        drone!.frequency.setTargetAtTime(want[5], now, 1);
        rainGain!.gain.setTargetAtTime(want[6], now, 1.5);
    }
    if (vol <= 0.001) return;
    // melody
    if (boss < 0.4 && now >= nextNote) {
        const hollow = under > 0.5 || dread > 0.5;
        const night = s.night > 0.5 || hollow;
        const scale = under > 0.5 ? CAVE : dread > 0.5 ? DREAD : night ? NIGHT : DAY;
        const f = pick(scale) * (night && Math.random() < 0.3 ? 2 : 1);
        tone(f, now + 0.05, hollow ? 4.2 : night ? 3.2 : 1.8, night ? 0.05 : 0.06, night ? 'sine' : 'triangle', night);
        if (!night && Math.random() < 0.35) tone(pick(scale), now + 0.35, 1.4, 0.04);
        nextNote = now + (hollow ? 4 + Math.random() * 5 : night ? 2.6 + Math.random() * 3.4 : 1.2 + Math.random() * 2.2) * (1 + s.rain * 0.8);
    }
    // water dripping somewhere in the dark
    if (under > 0.5 && now >= nextDrip) {
        tone(1100 + Math.random() * 1000, now + 0.02, 0.16, 0.022, 'sine');
        if (Math.random() < 0.4) tone(700 + Math.random() * 500, now + 0.2, 0.2, 0.014, 'sine');
        nextDrip = now + 2.2 + Math.random() * 6;
    }
    // night insects and day birds: a tiny tick now and then
    // boss drums
    if (boss > 0.1) {
        if (nextBeat < now - 1) nextBeat = now;
        while (nextBeat < now + 0.1) {
            const bpm = 92 + s.phase * 10;
            const step = 60 / bpm / 2;
            const k = beat % 8;
            if (k % 2 === 0) thump(nextBeat, 0.16 * boss * (k === 0 ? 1.25 : 1));
            else tick(nextBeat, 0.05 * boss);
            if (k === 4 && s.phase >= 1) tone(110, nextBeat, 0.5, 0.05 * boss, 'sawtooth');
            if (k === 6 && s.phase >= 2) tone(116.54, nextBeat, 0.35, 0.04 * boss, 'sawtooth');
            nextBeat += step; beat++;
        }
    } else { nextBeat = 0; beat = 0; }
}
