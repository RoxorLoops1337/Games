#!/usr/bin/env python3
"""Dungeon Pusher intro soundtrack — 20s, synced to the choreography.

Timeline anchors (must match intro.html):
  1.55 coin impact | 2.55/3.35/4.15 word slams | cuts 5.0 6.6 8.2 9.7 11.4
  13.0-15.2 vortex riser | 15.60 title slam | 16.15 tagline | 17.4+1.1k blinks
"""
import numpy as np, wave

SR = 44100
DUR = 20.0
N = int(SR * DUR)
t = np.arange(N) / SR
L = np.zeros(N); R = np.zeros(N)

def at(sig, t0, gain=1.0, pan=0.0):
    """mix sig (mono np array) into L/R at time t0. pan -1..1"""
    i0 = int(t0 * SR)
    if i0 >= N: return
    n = min(len(sig), N - i0)
    gl = gain * min(1.0, 1.0 - pan); gr = gain * min(1.0, 1.0 + pan)
    L[i0:i0+n] += sig[:n] * gl
    R[i0:i0+n] += sig[:n] * gr

def env_exp(n, tau):
    return np.exp(-np.arange(n) / (SR * tau))

def sine(f, dur, tau=None):
    n = int(dur * SR); tt = np.arange(n) / SR
    s = np.sin(2 * np.pi * f * tt)
    return s * env_exp(n, tau) if tau else s

rng = np.random.default_rng(8675309)

def noise(dur):
    return rng.standard_normal(int(dur * SR))

def lowpass(x, alpha):
    y = np.empty_like(x); acc = 0.0
    for i in range(len(x)):
        acc += alpha * (x[i] - acc); y[i] = acc
    return y

# vectorized one-pole via lfilter-free trick (fast enough at 20s)
def lp(x, cutoff):
    a = 1.0 - np.exp(-2 * np.pi * cutoff / SR)
    from numpy import frompyfunc
    y = np.empty_like(x); acc = 0.0
    # cheap loop in C-ish numpy: use cumulative filter identity
    # y[i] = a*x[i] + (1-a)*y[i-1]  -> IIR; do it with lfilter if available
    try:
        from scipy.signal import lfilter
        return lfilter([a], [1, -(1 - a)], x)
    except Exception:
        for i in range(len(x)):
            acc = a * x[i] + (1 - a) * acc; y[i] = acc
        return y

def hp(x, cutoff):
    return x - lp(x, cutoff)

# ---------------- instruments ----------------
def kick(gain=1.0):
    n = int(0.24 * SR); tt = np.arange(n) / SR
    f = 130 * np.exp(-tt * 26) + 42
    ph = 2 * np.pi * np.cumsum(f) / SR
    s = np.sin(ph) * env_exp(n, 0.075)
    s += lp(noise(0.24), 300)[:n] * env_exp(n, 0.012) * 0.8
    return s * gain

def boom(gain=1.0, dur=1.6):
    n = int(dur * SR); tt = np.arange(n) / SR
    f = 90 * np.exp(-tt * 7) + 34
    ph = 2 * np.pi * np.cumsum(f) / SR
    s = np.sin(ph) * env_exp(n, 0.42)
    s += np.sin(ph * 0.5) * env_exp(n, 0.6) * 0.6          # sub octave
    s += lp(noise(dur), 500)[:n] * env_exp(n, 0.05) * 1.1  # body thump
    return s * gain

def crash(gain=1.0, dur=0.9):
    n = int(dur * SR)
    s = hp(noise(dur), 4500)[:n] * env_exp(n, 0.22)
    return s * gain

def hat(gain=1.0, open_=False):
    dur = 0.24 if open_ else 0.05
    n = int(dur * SR)
    s = hp(noise(dur), 8000)[:n] * env_exp(n, 0.09 if open_ else 0.016)
    return s * gain

def ding(f0=2349.3, gain=1.0):
    """a gold piece landing on gold — two inharmonic partials, fast decay"""
    dur = 0.5; n = int(dur * SR); tt = np.arange(n) / SR
    s  = np.sin(2 * np.pi * f0 * tt) * 1.0
    s += np.sin(2 * np.pi * f0 * 2.756 * tt) * 0.45
    s += np.sin(2 * np.pi * f0 * 5.404 * tt) * 0.18
    s *= env_exp(n, 0.09) * (1 - np.exp(-tt * 900))
    return s * gain

def bass_note(f, dur, gain=1.0):
    n = int(dur * SR); tt = np.arange(n) / SR
    # detuned saw pair through a soft LP — the dungeon's engine room
    def saw(freq): return 2 * ((freq * tt) % 1.0) - 1.0
    s = saw(f) * 0.6 + saw(f * 1.004) * 0.6 + np.sin(2 * np.pi * f * 0.5 * tt) * 0.5
    s = lp(s, 620)
    a = int(0.006 * SR)
    envl = np.ones(n); envl[:a] = np.linspace(0, 1, a)
    rel = int(0.05 * SR); envl[-rel:] *= np.linspace(1, 0, rel)
    return s * envl * gain

def pluck(f, dur=0.30, gain=1.0):
    n = int(dur * SR); tt = np.arange(n) / SR
    s = (2 * ((f * tt) % 1.0) - 1.0) * 0.7 + np.sin(2 * np.pi * f * tt) * 0.5
    s = lp(s, 2400)
    return s * env_exp(n, 0.085) * gain

def pad(freqs, dur, gain=1.0, tau=None):
    n = int(dur * SR); tt = np.arange(n) / SR
    s = np.zeros(n)
    for f in freqs:
        s += np.sin(2 * np.pi * f * tt) + 0.4 * np.sin(2 * np.pi * f * 2.002 * tt)
    s /= len(freqs)
    a = int(0.4 * SR)
    envl = np.ones(n); envl[:a] = np.linspace(0, 1, a)
    if tau: envl *= env_exp(n, tau)
    rel = int(0.8 * SR); envl[-rel:] *= np.linspace(1, 0, rel)
    return lp(s, 1800) * envl * gain

def riser(dur, f0=200, f1=3200, gain=1.0):
    n = int(dur * SR); tt = np.arange(n) / SR
    k = tt / dur
    s = hp(noise(dur), 800)[:n] * (k ** 2.2)
    ph = 2 * np.pi * np.cumsum(f0 * (f1 / f0) ** k) / SR
    s += np.sin(ph) * k * 0.35
    return s * gain

def whoosh(dur=1.2, gain=1.0):
    n = int(dur * SR); tt = np.arange(n) / SR
    k = tt / dur
    s = lp(hp(noise(dur), 300), 2500)[:n]
    return s * (k ** 2.6) * gain

# ---------------- notes ----------------
D2, F2, G2, A2, C3, D3 = 73.42, 87.31, 98.0, 110.0, 130.81, 146.83
D4, F4, A4, C5, E5, D5, F5, A5 = 293.66, 349.23, 440.0, 523.25, 659.26, 587.33, 698.46, 880.0

BPM = 132.0
B = 60.0 / BPM          # 0.4545
S16 = B / 4

# ---- A: the fall, the hit ----
at(whoosh(1.45, 0.5), 0.15)
at(boom(1.25, 1.8), 1.55)
at(ding(2349.3, 0.6), 1.575)
at(ding(1760.0, 0.35), 1.66, pan=0.25)
# low drone wakes under the aftermath
at(pad([D2, A2], 3.6, 0.30, tau=1.4), 1.7)

# ---- B: three words, three punches ----
for i, (tw, fz) in enumerate([(2.55, 2349.3), (3.35, 2637.0), (4.15, 2093.0)]):
    at(boom(0.9 - i * 0.08, 1.0), tw)
    at(crash(0.30), tw)
    at(ding(fz, 0.5), tw + 0.03, pan=(-0.3 + 0.3 * i))
# ticking hats build under the storm
tt0 = 2.55
while tt0 < 4.95:
    at(hat(0.16 + 0.10 * (tt0 - 2.55) / 2.4), tt0, pan=0.2 if int(tt0 / (B/2)) % 2 else -0.2)
    tt0 += B / 2
# scattered coin rain dings
for i in range(14):
    tc = 2.4 + (i * 0.183) % 2.5
    at(ding(1500 + (i * 397) % 1400, 0.10), tc, pan=((i * 73) % 100 - 50) / 60)

# ---- C: the groove (5.0 - 13.0) ----
CUTS = [5.0, 6.6, 8.2, 9.7, 11.4]
GROOVE_END = 12.9
# kick: four on the floor
tk = 5.0
while tk < GROOVE_END - 0.05:
    at(kick(0.95), tk)
    tk += B
# backbeat crash-lite hats
tk = 5.0 + B / 2
while tk < GROOVE_END:
    at(hat(0.30), tk, pan=0.15)
    at(hat(0.13), tk - B / 4, pan=-0.25)
    tk += B
# bass line: D D F D | C C A, C  (one bar = 4 beats, 8th notes)
BASSPAT = [D2, D2, F2, D2, C3, C3, A2, C3]
tb = 5.0; step = B / 2; bi = 0
while tb < GROOVE_END - 0.1:
    at(bass_note(BASSPAT[bi % 8], step * 0.92, 0.62), tb)
    bi += 1; tb += step
# arp: Dm add9 16ths, echoed
ARP = [D4, F4, A4, C5, E5, C5, A4, F4]
ta = 5.0; ai = 0
while ta < GROOVE_END - 0.1:
    g = 0.20 + 0.05 * ((ai % 8) in (0, 4))
    at(pluck(ARP[ai % 8], 0.26, g), ta, pan=-0.4 + 0.8 * ((ai % 4) / 3))
    at(pluck(ARP[ai % 8] * 2, 0.22, g * 0.35), ta + S16 * 3, pan=0.4 - 0.8 * ((ai % 4) / 3))  # echo up the octave
    ai += 1; ta += S16
# a hit on every cut
for i, tc in enumerate(CUTS):
    at(boom(0.85, 0.9), tc)
    at(crash(0.5), tc)
    at(ding(2349.3 if i % 2 == 0 else 2793.8, 0.4), tc + 0.02)
# TILT gets a rattle — coins thrown against glass
for i in range(10):
    at(ding(900 + (i * 613) % 2200, 0.16), 8.22 + i * 0.035, pan=((i * 41) % 100 - 50) / 55)
at(boom(0.5, 0.5), 8.2 + 0.12)

# ---- D: the vortex (13.0-15.2) ----
at(riser(2.55, 150, 3400, 0.6), 12.95)
# accelerating dings spiralling in
td = 13.1; gap = 0.30
while td < 15.05:
    at(ding(1400 + ((td * 997) % 1600), 0.16), td, pan=np.sin(td * 9) * 0.7)
    gap *= 0.86; td += max(0.045, gap)
# heartbeat kick halves, then doubles
for tb2 in [13.0, 13.9, 14.55, 14.9, 15.05]:
    at(kick(0.8), tb2)

# ---- E: the title (15.60) ----
at(boom(1.5, 2.4), 15.58)
at(crash(0.8, 1.4), 15.60)
# gong: the sign is bronze and it knows it
n = int(3.2 * SR); tg = np.arange(n) / SR
gong = np.zeros(n)
for f, g in [(D3, 1.0), (D3 * 1.504, 0.55), (D3 * 2.51, 0.30), (D3 * 3.98, 0.18), (D3 * 0.5, 0.5)]:
    gong += np.sin(2 * np.pi * f * tg + 0.3 * np.sin(2 * np.pi * f * 2.756 * tg)) * g
gong *= np.exp(-tg / 1.1) / 2.5
at(gong, 15.60, 0.85)
# coin cascade — the jackpot answers
for i in range(26):
    tc = 15.66 + i * 0.028 + (i * i) * 0.0012
    at(ding(1200 + (i * 331) % 2400, 0.22 * (1 - i / 34)), tc, pan=((i * 67) % 100 - 50) / 50)
# tagline shimmer
at(riser(0.55, 900, 4200, 0.16), 16.10)
at(ding(3520.0, 0.25), 16.35)
# closing pad — Dm, warm, patient
at(pad([D2, A2, D3, F2 * 2], 4.4, 0.34, tau=2.6), 15.9)

# ---- F: insert coin blinks ----
bt = 17.4
while bt < 19.3:
    at(ding(2349.3, 0.10), bt, pan=0.1)
    at(hat(0.10), bt + 0.02)
    bt += 1.1

# ---------------- master ----------------
mix = np.stack([L, R])
# gentle glue + soft clip
mix = np.tanh(mix * 1.25)
# master fade matching the picture (19.45-20.0)
fade = np.ones(N)
i0 = int(19.4 * SR)
fade[i0:] = np.linspace(1, 0, N - i0) ** 1.5
mix *= fade
mix /= max(1e-9, np.abs(mix).max()) / 0.89

pcm = (mix.T * 32767).astype(np.int16)
with wave.open('/tmp/claude-0/-home-user-Games/fbb4dcc7-2eb2-53c9-86b1-2ce4db73749f/scratchpad/intro/audio.wav', 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print('audio.wav written', pcm.shape, 'peak', np.abs(mix).max())
