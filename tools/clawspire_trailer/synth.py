"""Clawspire 2.0 trailer: a small deterministic synth rack (numpy + scipy).

The base rack comes from tools/nrfh_trailer/synth.py; the arcade voices,
loudness meter and limiter at the bottom are new.

Everything is rendered offline into float stereo buses; the score in audio.py
places voices on the timeline that trailer.html uses (both read cues.json).
No randomness escapes the seeded generator, so the mix is bit-identical run
to run.
"""
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve

SR = 48000
_rng = np.random.default_rng(1337)


def T(dur):
    return np.arange(int(dur * SR)) / SR


def noise(dur):
    return _rng.standard_normal(int(dur * SR))


def noise_n(n):
    return _rng.standard_normal(n)


# ------------------------------------------------------------------ filters
def _sos(kind, f, order=2):
    if kind == 'band':
        lo, hi = f
        return butter(order, [max(20, lo) / (SR / 2), min(hi, SR / 2 - 100) / (SR / 2)], btype='band', output='sos')
    return butter(order, min(f, SR / 2 - 100) / (SR / 2), btype=kind, output='sos')


def lp(x, f, order=2):
    return sosfilt(_sos('low', f, order), x)


def hp(x, f, order=2):
    return sosfilt(_sos('high', f, order), x)


def bp(x, lo, hi, order=2):
    return sosfilt(_sos('band', (lo, hi), order), x)


def sweep_lp(x, f0, f1, curve=1.0, blocks=64):
    """time-varying low-pass, processed in blocks with filter state carried over"""
    out = np.zeros_like(x)
    n = len(x)
    edges = np.linspace(0, n, blocks + 1).astype(int)
    zi = None
    for b in range(blocks):
        k = (b + .5) / blocks
        f = f0 * (f1 / f0) ** (k ** curve)
        sos = _sos('low', f, 2)
        if zi is None:
            zi = np.zeros((sos.shape[0], 2))
        out[edges[b]:edges[b + 1]], zi = sosfilt(sos, x[edges[b]:edges[b + 1]], zi=zi)
    return out


def sweep_bp(x, f0, f1, q=0.6, curve=1.0, blocks=64):
    out = np.zeros_like(x)
    n = len(x)
    edges = np.linspace(0, n, blocks + 1).astype(int)
    zi = None
    for b in range(blocks):
        k = (b + .5) / blocks
        f = f0 * (f1 / f0) ** (k ** curve)
        sos = _sos('band', (f * (1 - q / 2), f * (1 + q / 2)), 2)
        if zi is None:
            zi = np.zeros((sos.shape[0], 2))
        out[edges[b]:edges[b + 1]], zi = sosfilt(sos, x[edges[b]:edges[b + 1]], zi=zi)
    return out


# ------------------------------------------------------------------ envelopes
def exp_env(n, tau):
    return np.exp(-np.arange(n) / (SR * tau))


def adsr(n, a=.005, d=.1, s=.7, r=.1):
    e = np.ones(n) * s
    na, nd, nr = int(a * SR), int(d * SR), int(r * SR)
    na = min(na, n); e[:na] = np.linspace(0, 1, na) if na else e[:na]
    nd = min(nd, n - na); e[na:na + nd] = np.linspace(1, s, nd) if nd else e[na:na + nd]
    nr = min(nr, n); e[n - nr:] *= np.linspace(1, 0, nr) if nr else 1
    return e


def fade_io(x, fi=.003, fo=.01):
    n = len(x)
    a, b = min(n, int(fi * SR)), min(n, int(fo * SR))
    if a: x[:a] *= np.linspace(0, 1, a)
    if b: x[n - b:] *= np.linspace(1, 0, b)
    return x


# ------------------------------------------------------------------ oscillators
def phase(freq, n):
    """freq: scalar or array (Hz) -> running phase in cycles"""
    f = np.broadcast_to(np.asarray(freq, float), (n,))
    return np.cumsum(f) / SR


def saw_p(ph):
    return 2 * (ph % 1.0) - 1


def sq_p(ph, duty=.5):
    return np.where((ph % 1.0) < duty, 1.0, -1.0)


def tri_p(ph):
    return 2 * np.abs(2 * (ph % 1.0) - 1) - 1


def supersaw(f, dur, voices=7, detune=.012):
    n = int(dur * SR)
    s = np.zeros(n)
    for i in range(voices):
        d = 1 + detune * (i - (voices - 1) / 2) / ((voices - 1) / 2)
        s += saw_p(phase(f * d, n) + _rng.random())
    return s / np.sqrt(voices)


# ------------------------------------------------------------------ drums & hits
def kick(g=1.0, dur=.42, f0=150, f1=44):
    n = int(dur * SR); t = T(dur)
    f = f1 + (f0 - f1) * np.exp(-t * 30)
    s = np.sin(2 * np.pi * phase(f, n)) * exp_env(n, .16)
    s += lp(noise(dur), 3000) * exp_env(n, .004) * .5          # beater click
    return np.tanh(s * 1.6) * g


def taiko(g=1.0, dur=1.4, f0=120, f1=52):
    n = int(dur * SR); t = T(dur)
    f = f1 + (f0 - f1) * np.exp(-t * 18)
    s = np.sin(2 * np.pi * phase(f, n)) * exp_env(n, .32)
    s += np.sin(2 * np.pi * phase(f * 1.59, n)) * exp_env(n, .12) * .35
    s += lp(noise(dur), 700) * exp_env(n, .05) * 1.2           # skin slap
    s += bp(noise(dur), 1500, 4500) * exp_env(n, .012) * .5   # stick
    return np.tanh(s * 1.3) * g


def snare(g=1.0, dur=.35):
    n = int(dur * SR); t = T(dur)
    s = bp(noise(dur), 1200, 9000) * exp_env(n, .09)
    s += np.sin(2 * np.pi * phase(190 + 60 * np.exp(-t * 40), n)) * exp_env(n, .05) * .8
    return s * g


def clap(g=1.0):
    dur = .3; n = int(dur * SR)
    s = np.zeros(n)
    for k, off in enumerate([0, .011, .022, .034]):
        i = int(off * SR)
        m = n - i
        s[i:] += bp(noise_n(m), 900, 6000) * exp_env(m, .012 if k < 3 else .12)
    return s * g


def hat(g=1.0, open_=False):
    dur = .35 if open_ else .06
    n = int(dur * SR)
    return hp(noise(dur), 7500, 3) * exp_env(n, .1 if open_ else .014) * g


def crash(g=1.0, dur=2.2):
    n = int(dur * SR)
    s = hp(noise(dur), 3500, 2) * exp_env(n, .55)
    s += bp(noise(dur), 6000, 12000) * exp_env(n, .9) * .4
    return fade_io(s, .001, .3) * g


def reverse_crash(dur=1.2, g=1.0):
    return crash(1.0, dur)[::-1].copy() * g


def sub_drop(g=1.0, dur=1.6, f0=90, f1=28):
    n = int(dur * SR); t = T(dur)
    f = f1 + (f0 - f1) * np.exp(-t * 3.2)
    return fade_io(np.sin(2 * np.pi * phase(f, n)) * exp_env(n, .7), .002, .2) * g


def impact(g=1.0, dur=2.6, bright=1.0):
    """the cinematic hit: taiko + sub + noise body + metallic ring"""
    n = int(dur * SR); t = T(dur)
    s = np.zeros(n)
    tk = taiko(1.0, dur, 110, 42); s[:len(tk)] += tk
    sd = sub_drop(.9, dur, 75, 30); s[:len(sd)] += sd
    s += lp(noise(dur), 1800) * exp_env(n, .09) * .9
    s += hp(noise(dur), 5000) * exp_env(n, .35) * .25 * bright
    for f, a in [(212, .25), (338, .18), (547, .12), (891, .08)]:
        s += np.sin(2 * np.pi * f * t + 2 * np.sin(2 * np.pi * f * 1.41 * t) * exp_env(n, .2)) * exp_env(n, .6) * a * bright
    return np.tanh(s * 1.1) * g


def braam(f=55.0, dur=2.5, g=1.0, open_=2400):
    """the trailer horn: detuned saws at root/octave/fifth through an opening filter, driven"""
    n = int(dur * SR)
    s = supersaw(f, dur, 7, .010) + supersaw(f * 2, dur, 5, .008) * .7 + supersaw(f * 1.5, dur, 5, .009) * .45
    s += np.sin(2 * np.pi * phase(f / 2, n)) * 1.2
    env_f = sweep_lp(s, 180, open_, curve=.35)
    e = adsr(n, .03, .5, .75, min(1.2, dur * .5))
    return np.tanh(env_f * e * 1.8) * g * .6


def growl(f0=70, dur=1.2, g=1.0):
    n = int(dur * SR); t = T(dur)
    vib = 1 + .06 * np.sin(2 * np.pi * 23 * t) * (1 - np.exp(-t * 4))
    ph = phase(f0 * vib * (1 + .25 * np.exp(-t * 5)), n)
    s = saw_p(ph) + saw_p(ph * 1.013 + .3) + saw_p(ph * .5) * .9 + sq_p(ph * 1.5, .3) * .3
    s = lp(s, 1100)
    s += bp(noise(dur), 300, 2400) * .9 * np.exp(-t * 2.5)
    s *= (1 - np.exp(-t * 60)) * np.exp(-t / (dur * .45))
    return np.tanh(s * 1.5) * g * .7


# ------------------------------------------------------------------ transitions
def riser(dur, f0=180, f1=4800, g=1.0, tone=True):
    n = int(dur * SR); t = T(dur); k = t / dur
    s = sweep_bp(noise(dur), f0 * 2, f1, q=.9, curve=1.4) * k ** 1.8 * 2.2
    if tone:
        f = f0 * (f1 / f0) ** (k ** 1.4)
        s += (saw_p(phase(f, n)) * .25 + saw_p(phase(f * 1.5, n)) * .15) * k ** 2
    return fade_io(s, .05, .005) * g


def whoosh(dur=.5, g=1.0, f0=300, f1=4000, pan_from=-1, pan_to=1):
    """returns (L, R): the air moves across the stereo field"""
    n = int(dur * SR); t = T(dur); k = t / dur
    s = sweep_bp(noise(dur), f0, f1, q=1.1, curve=1.0) * np.sin(np.pi * k) ** 1.5 * 2.4
    p = pan_from + (pan_to - pan_from) * k
    return s * np.sqrt((1 - p) / 2) * g, s * np.sqrt((1 + p) / 2) * g


def tape_stop(x, dur):
    """slow a signal to a halt (resample with decaying speed)"""
    n = int(dur * SR)
    speed = np.linspace(1, 0, n) ** 1.3
    pos = np.cumsum(speed)
    pos = pos[pos < len(x) - 1]
    return np.interp(pos, np.arange(len(x)), x)


# ------------------------------------------------------------------ chiptune voices (the game's own tongue)
def chip_sq(f, dur, g=1.0, duty=.25, vib=0.0, slide=0.0, tau=None):
    n = int(dur * SR); t = T(dur)
    ff = f * (1 + vib * np.sin(2 * np.pi * 6 * t) * np.clip(t * 4, 0, 1)) * (1 + slide * np.exp(-t * 30))
    s = sq_p(phase(ff, n), duty)
    e = exp_env(n, tau) if tau else adsr(n, .002, .05, .8, .02)
    return s * e * g * .5


def chip_tri(f, dur, g=1.0):
    n = int(dur * SR)
    # quantised triangle, like the NES bass channel
    s = np.round(tri_p(phase(f, n)) * 7.5) / 7.5
    return s * adsr(n, .002, .02, .9, .02) * g * .7


def chip_noise(dur=.08, g=1.0, tau=.03, period=1):
    n = int(dur * SR)
    x = np.repeat(np.sign(_rng.standard_normal(n // period + 1)), period)[:n]
    return x * exp_env(n, tau) * g * .4


# ------------------------------------------------------------------ pads
def choir(freqs, dur, g=1.0, vowel='ah'):
    """a sawtooth 'choir' through vowel formants: cheap, dark, huge with reverb"""
    F = {'ah': [(800, 1.0), (1150, .5), (2900, .25)], 'oh': [(450, 1.0), (800, .45), (2830, .2)]}[vowel]
    n = int(dur * SR); t = T(dur)
    src = np.zeros(n)
    for f in freqs:
        for d in (-.006, 0, .006):
            src += saw_p(phase(f * (1 + d) * (1 + .004 * np.sin(2 * np.pi * 5.1 * t + f)), n) + _rng.random())
    out = np.zeros(n)
    for fc, a in F:
        out += bp(src, fc * .88, fc * 1.12) * a
    return out * adsr(n, .35, .4, .85, min(1.0, dur * .4)) * g * .35 / max(1, len(freqs))


# ------------------------------------------------------------------ game SFX
def fire_burst(dur=.9, g=1.0):
    n = int(dur * SR); t = T(dur)
    roar = lp(noise(dur), 900) * 2.0 + bp(noise(dur), 900, 3500) * .6
    crackle = np.zeros(n)
    idx = (_rng.random(int(dur * 90)) * n).astype(int)
    for i in idx:
        m = min(n - i, int(.004 * SR))
        crackle[i:i + m] += _rng.standard_normal(m) * exp_env(m, .0008) * 2
    s = (roar + crackle) * (1 - np.exp(-t * 40)) * np.exp(-t / (dur * .45))
    return np.tanh(s) * g * .8


def ice_crack(dur=1.0, g=1.0):
    n = int(dur * SR); t = T(dur)
    s = hp(noise(dur), 2500) * exp_env(n, .02) * 1.5
    for k in range(6):
        i = int((.01 + k * .035) * SR)
        m = n - i
        s[i:] += hp(noise_n(m), 3000) * exp_env(m, .006) * (1 - k * .12)
    for f in [2637, 3136, 3951, 5274]:                # glassy shimmer
        s += np.sin(2 * np.pi * f * t) * exp_env(n, .35) * .12
    return s * g


def zap(dur=.7, g=1.0):
    n = int(dur * SR); t = T(dur)
    steps = np.repeat(_rng.uniform(80, 900, int(dur * 60) + 1), int(SR / 60) + 1)[:n]
    s = sq_p(phase(steps, n), .5) * .6 + saw_p(phase(steps * 2.01, n)) * .4
    s = hp(s, 200) + hp(noise(dur), 4000) * .5 * (np.sin(2 * np.pi * 37 * t) > .2)
    return np.tanh(s * 2) * np.exp(-t / (dur * .5)) * g * .5


def clang(g=1.0, dur=1.2, f=420):
    n = int(dur * SR); t = T(dur)
    s = np.zeros(n)
    for r, a, tau in [(1, 1, .35), (2.76, .6, .25), (5.4, .35, .15), (8.93, .2, .08), (1.49, .4, .5)]:
        s += np.sin(2 * np.pi * f * r * t) * a * exp_env(n, tau)
    s += hp(noise(dur), 3000) * exp_env(n, .01)
    return s * g * .35


def slash(g=1.0, dur=.22):
    n = int(dur * SR); t = T(dur)
    s = sweep_bp(noise(dur), 1500, 7000, q=1.2) * np.sin(np.pi * t / dur) ** .7 * 3
    return s * g


def coin(g=1.0, f=1975.5):
    dur = .5; n = int(dur * SR); t = T(dur)
    s = chip_sq(f, .06, 1, .5)
    s2 = chip_sq(f * 1.335, dur - .06, 1, .5, tau=.12)
    return np.concatenate([s, s2]) * g


def blip(f=880, g=1.0, dur=.05):
    return chip_sq(f, dur, g, .5, tau=.03)


# ------------------------------------------------------------------ space & glue
def reverb_ir(dur=2.6, predelay=.02, damp=6000, seed=7):
    r = np.random.default_rng(seed)
    n = int(dur * SR); t = T(dur)
    irs = []
    for ch in range(2):
        x = r.standard_normal(n) * np.exp(-t * 6.9 / dur)       # -60 dB at dur
        x = lp(x, damp) * (1 - np.exp(-t * 200))
        x = np.concatenate([np.zeros(int(predelay * SR)), x])
        irs.append(x / np.sqrt(np.sum(x ** 2)))
    return irs


def reverb(L, R, wet=.25, dur=2.6):
    irL, irR = reverb_ir(dur)
    m = (L + R) * .5
    wl = fftconvolve(m, irL)[:len(L)]
    wr = fftconvolve(m, irR)[:len(R)]
    return L + wl * wet, R + wr * wet


def duck_env(n, hits, depth=.6, attack=.004, release=.22):
    """sidechain gain curve: dips at each hit time"""
    e = np.ones(n)
    for (t0, d) in hits:
        i = int(t0 * SR)
        if i >= n: continue
        m = min(n - i, int((attack + release * 5) * SR))
        tt = np.arange(m) / SR
        curve = np.where(tt < attack, tt / attack, np.exp(-(tt - attack) / release))
        e[i:i + m] = np.minimum(e[i:i + m], 1 - depth * d * curve)
    return e


def master(L, R, ceiling=.93, drive=1.15):
    x = np.stack([L, R])
    x = np.tanh(x * drive) / np.tanh(drive)
    peak = np.max(np.abs(x))
    if peak > 0:
        x *= ceiling / peak
    return x[0], x[1]


def write_wav(path, L, R):
    import wave
    x = np.stack([L, R], axis=1)
    pcm = (np.clip(x, -1, 1) * 32767).astype('<i2')
    with wave.open(path, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(pcm.tobytes())


# ================================================================== Clawspire additions
def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


def pluck_saw(f, dur, g=1.0, cutoff=4000, tau=.18, voices=3, detune=.01):
    """a bright plucked supersaw (the drop chords), filter closing with the envelope"""
    n = int(dur * SR)
    s = supersaw(f, dur, voices, detune)
    s = sweep_lp(s, cutoff, max(300, cutoff * .15), curve=.5, blocks=16)
    return s * exp_env(n, tau) * adsr(n, .002, .01, 1, .02) * g * .5


def pad(freqs, dur, g=1.0, cutoff=2400, width=.012):
    """wide supersaw pad, stereo: returns (L, R)"""
    n = int(dur * SR)
    L = np.zeros(n); R = np.zeros(n)
    for f in freqs:
        L += supersaw(f * (1 - width * .3), dur, 5, width)
        R += supersaw(f * (1 + width * .3), dur, 5, width)
    e = adsr(n, .08, .3, .85, min(.4, dur * .3))
    L = lp(L, cutoff) * e; R = lp(R, cutoff) * e
    k = g * .22 / max(1, len(freqs)) ** .5
    return L * k, R * k


def sub_bass(f, dur, g=1.0, drive=1.4):
    n = int(dur * SR)
    ph = phase(f, n)
    s = np.sin(2 * np.pi * ph) + .35 * lp(saw_p(ph * 2), 900)
    return np.tanh(s * drive) * adsr(n, .003, .05, .9, .03) * g * .6


def chip_lead(f, dur, g=1.0, duty=.25, vib=.012, tau=None, glide=0.0):
    """the game's square lead with a little vibrato, plus an octave-up sparkle"""
    n = int(dur * SR); t = T(dur)
    ff = f * (1 + vib * np.sin(2 * np.pi * 5.5 * t) * np.clip(t * 5, 0, 1)) * (1 + glide * np.exp(-t * 40))
    s = sq_p(phase(ff, n), duty) * .7 + sq_p(phase(ff * 2.003, n), .5) * .18
    e = exp_env(n, tau) if tau else adsr(n, .003, .06, .75, .03)
    return lp(s, 7000) * e * g * .45


def organ(freqs, dur, g=1.0, vib=.006):
    """spooky drawbar organ with a leslie-ish wobble"""
    n = int(dur * SR); t = T(dur)
    s = np.zeros(n)
    w = 1 + vib * np.sin(2 * np.pi * 6.2 * t)
    for f in freqs:
        for k, a in ((1, 1), (2, .55), (3, .3), (4, .2), (.5, .45)):
            s += np.sin(2 * np.pi * phase(f * k * w, n)) * a
    s *= adsr(n, .015, .1, .9, .05) * (1 + .15 * np.sin(2 * np.pi * 6.2 * t))
    return np.tanh(s * .25) * g * .5


def theremin(f, dur, g=1.0, f_from=None):
    n = int(dur * SR); t = T(dur)
    f0 = f_from or f
    ff = (f + (f0 - f) * np.exp(-t * 12)) * (1 + .025 * np.sin(2 * np.pi * 5.8 * t) * np.clip(t * 3, 0, 1))
    s = np.sin(2 * np.pi * phase(ff, n)) + .2 * np.sin(4 * np.pi * phase(ff, n))
    return s * adsr(n, .06, .1, .9, .15) * g * .4


def chime(f, dur=1.6, g=1.0):
    """a gold bell: inharmonic partials, long ring"""
    n = int(dur * SR); t = T(dur)
    s = np.zeros(n)
    for r, a, tau in ((1, 1, .9), (2.0, .5, .6), (3.01, .3, .4), (4.17, .2, .25), (5.43, .12, .15), (.5, .2, 1.2)):
        s += np.sin(2 * np.pi * f * r * t) * a * exp_env(n, tau)
    return s * (1 - np.exp(-t * 600)) * g * .25


def sparkle(dur=.8, g=1.0, seed=3):
    r = np.random.default_rng(seed)
    n = int(dur * SR)
    s = np.zeros(n)
    for k in range(18):
        i = int(r.random() * n * .7); m = min(n - i, int(.12 * SR))
        f = r.uniform(3000, 7000)
        s[i:i + m] += np.sin(2 * np.pi * f * np.arange(m) / SR) * exp_env(m, .03) * r.uniform(.3, 1)
    return s * g * .3


def servo(dur=.8, g=1.0, f0=180, f1=320):
    """claw motor whine"""
    n = int(dur * SR); t = T(dur)
    f = f0 + (f1 - f0) * t / dur
    s = saw_p(phase(f, n)) * .5 + sq_p(phase(f * 2.01, n), .3) * .25
    s = bp(s, 300, 2500) * (1 + .3 * np.sin(2 * np.pi * 31 * t))
    return fade_io(s, .03, .08) * g * .5


def clank(g=1.0, f=620, dur=.6):
    """the claw closing: metal clank + latch click"""
    n = int(dur * SR)
    s = clang(1.0, dur, f) * 1.4
    s += hp(noise(dur), 2500) * exp_env(n, .006) * .9
    s += lp(noise(dur), 900) * exp_env(n, .02) * .7
    return s * g


def thwack(g=1.0, f=180):
    """a card hit: a punchy body + slap"""
    k = kick(1.0, .3, f * 1.6, f * .5)
    n = len(k)
    s = k + bp(noise(.3), 900, 5000) * exp_env(n, .03) * 1.2
    return np.tanh(s * 1.3) * g


def cheer(dur=1.8, g=1.0, seed=11):
    """a crowd-ish swell: many band-passed noise 'voices' with vowel formants, rising then falling"""
    r = np.random.default_rng(seed)
    n = int(dur * SR); t = T(dur)
    s = np.zeros(n)
    for k in range(14):
        f0 = r.uniform(180, 420)
        src = saw_p(phase(f0 * (1 + .04 * np.sin(2 * np.pi * r.uniform(3, 7) * t + k)), n)) + r.standard_normal(n) * .4
        v = bp(src, 650, 1250) + bp(src, 2300, 3200) * .5
        s += v * np.clip((t - r.uniform(0, .15)) * 8, 0, 1)
    s += bp(r.standard_normal(n), 800, 6000) * .6
    env = (1 - np.exp(-t * 10)) * np.exp(-t / (dur * .55))
    return s / 6 * env * g


def glass_crack(dur=.9, g=1.0):
    n = int(dur * SR)
    s = ice_crack(dur, 1.0)
    s += lp(noise(dur), 2500) * exp_env(n, .015) * .8
    return s * g


def bubble(f=600, g=1.0, dur=.12):
    n = int(dur * SR); t = T(dur)
    ff = f * (1 + 2.5 * t / dur)
    return np.sin(2 * np.pi * phase(ff, n)) * np.sin(np.pi * t / dur) * g * .4


def squeak(f=3200, g=1.0, dur=.07):
    n = int(dur * SR); t = T(dur)
    ff = f * (1 + .4 * np.sin(np.pi * t / dur))
    return np.sin(2 * np.pi * phase(ff, n)) * np.sin(np.pi * t / dur) ** 2 * g * .3


def hydraulic(g=1.0, dur=.7):
    n = int(dur * SR); t = T(dur)
    s = sub_drop(1.0, dur, 90, 40) * .8 + lp(noise(dur), 400) * exp_env(n, .08) * 1.2
    s += bp(noise(dur), 3000, 9000) * np.clip(t * 10, 0, 1) * np.exp(-t / .25) * .4
    return np.tanh(s * 1.2) * g


# ------------------------------------------------------------------ mastering
def k_weight(x):
    from scipy.signal import lfilter
    b1 = [1.53512485958697, -2.69169618940638, 1.19839281085285]; a1 = [1, -1.69065929318241, .73248077421585]
    b2 = [1.0, -2.0, 1.0]; a2 = [1, -1.99004745483398, .99007225036621]
    return lfilter(b2, a2, lfilter(b1, a1, x))


def lufs(L, R):
    """integrated loudness, ITU-R BS.1770 (48 kHz coefficients) with both gates"""
    kl, kr = k_weight(L), k_weight(R)
    blk, hop = int(.4 * SR), int(.1 * SR)
    ms = []
    for i in range(0, len(kl) - blk, hop):
        ms.append(np.mean(kl[i:i + blk] ** 2) + np.mean(kr[i:i + blk] ** 2))
    ms = np.array(ms)
    ld = -.691 + 10 * np.log10(ms + 1e-12)
    g1 = ms[ld > -70]
    rel = -.691 + 10 * np.log10(np.mean(g1)) - 10
    g2 = ms[ld > max(-70, rel)]
    return -.691 + 10 * np.log10(np.mean(g2))


def true_peak(L, R):
    from scipy.signal import resample_poly
    return max(np.max(np.abs(resample_poly(L, 4, 1))), np.max(np.abs(resample_poly(R, 4, 1))))


def limiter(L, R, ceiling=.85, look=.0015, release=.08):
    """lookahead brickwall: gain = min over the lookahead window, smoothed attack, one-pole release"""
    from scipy.ndimage import minimum_filter1d, uniform_filter1d
    from scipy.signal import resample_poly
    # true-peak aware: the envelope is the max over 4x oversampled audio
    up = np.maximum(np.abs(resample_poly(L, 4, 1)), np.abs(resample_poly(R, 4, 1)))
    pk = up[:len(L) * 4].reshape(-1, 4).max(axis=1)
    g = np.minimum(1, ceiling / np.maximum(pk, 1e-9))
    la = max(1, int(look * SR))
    g = minimum_filter1d(g, la * 2 + 1, origin=-la)
    g = uniform_filter1d(g, la, origin=0)
    g = minimum_filter1d(g, la + 1)
    # release: gain may only rise slowly
    a = np.exp(-1 / (release * SR))
    out = np.empty_like(g); cur = 1.0
    gl = g.tolist()
    for i, v in enumerate(gl):
        cur = v if v < cur else v + (cur - v) * a
        out[i] = cur
    return L * out, R * out
