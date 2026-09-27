#!/usr/bin/env python3
"""No Room For Heroes trailer soundtrack: 15.0 s, 128 BPM, D minor.

Every hit is placed from cues.json (the same file trailer.html reads), so the
picture and the sound share one clock. Deterministic: run it twice, get the
same WAV.

    python3 tools/nrfh_trailer/audio.py [out.wav]
"""
import json, os, sys
import numpy as np
from synth import *

HERE = os.path.dirname(os.path.abspath(__file__))
CUES = json.load(open(os.path.join(HERE, 'cues.json')))
BPM = CUES['bpm']
B = 60.0 / BPM                    # 0.46875
DUR = CUES['dur'] + 1.2           # render a tail, trimmed to 15.0 at the end
N = int(DUR * SR)
HIT = {}
for h in CUES['hits']:
    HIT.setdefault(h['k'], []).append(h['t'])

# buses: music gets ducked by the hits; sfx/hits ride on top
BUS = {k: [np.zeros(N), np.zeros(N)] for k in ('music', 'sfx', 'hit', 'late')}


def at(sig, t0, gain=1.0, pan=0.0, bus='sfx'):
    """mix a mono signal (or an (L, R) tuple) into a bus at time t0"""
    i0 = int(round(t0 * SR))
    if i0 >= N:
        return
    if isinstance(sig, tuple):
        l, r = sig
    else:
        l = r = sig
    if i0 < 0:
        l, r = l[-i0:], r[-i0:]; i0 = 0
    n = min(len(l), N - i0)
    gl = gain * np.sqrt((1 - pan) / 2) * 1.414
    gr = gain * np.sqrt((1 + pan) / 2) * 1.414
    BUS[bus][0][i0:i0 + n] += l[:n] * gl
    BUS[bus][1][i0:i0 + n] += r[:n] * gr


def b(n):
    return n * B


# ------------------------------------------------------------------ notes
def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


D1, A1, D2, E2, F2, G2, A2, Bb1, Bb2, C2, C3, D3 = [hz(m) for m in (26, 33, 38, 40, 41, 43, 45, 34, 46, 36, 48, 50)]
# chord tones for the chip arp, per bar (bars start at 3.75 = bar 3)
CHORDS = {
    2: [62, 65, 69, 72],          # Dm   (3.75)
    3: [58, 62, 65, 69],          # Bb   (5.625)
    4: [55, 58, 62, 67],          # Gm   (7.5)
    5: [62, 65, 69, 74],          # Dm   (9.375)
    6: [57, 61, 64, 69],          # A    (11.25)
}
BASS = {2: [38, 38, 41, 38, 36, 36, 33, 36], 3: [34, 34, 38, 34, 36, 36, 41, 36], 4: [31, 31, 34, 31, 33, 33, 37, 33],
        5: [38, 38, 41, 38, 36, 36, 33, 36], 6: [33, 33, 37, 33, 33, 33, 40, 33]}

# ================================================================== I. storm (0 - 0.94)
def thunder(dur=2.6, g=1.0):
    n = int(dur * SR); t = T(dur)
    crack = hp(noise(dur), 1200) * exp_env(n, .05) * 1.4
    rumble = lp(noise(dur), 220) * (1 - np.exp(-t * 30)) * np.exp(-t / .9) * 3.0
    rumble += lp(noise(dur), 90) * np.exp(-t / 1.4) * 2.5
    return np.tanh((crack + rumble) * .9) * g

at(thunder(2.8, 1.0), 0.0, .9, -.2, 'hit')
at(thunder(2.2, .75), HIT['thunder2'][0], .7, .3, 'hit')
# rain bed until the whip
rain_ = bp(noise(2.4), 1500, 9000) * .18
rain_ = fade_io(rain_, .01, .4)
at((rain_ * .9, bp(noise(2.4), 1500, 9000) * .16), 0.0, 1.0, 0, 'sfx')
# low drone, D, under everything until the build
drone = np.sin(2 * np.pi * phase(D1 * (1 + .002 * np.sin(2 * np.pi * .3 * T(3.9))), int(3.9 * SR))) * .5
drone += lp(supersaw(D2, 3.9, 5, .006), 300) * .4
drone = fade_io(drone * adsr(len(drone), .02, .1, 1, .6), .01, .5)
at(drone, 0.0, .3, 0, 'music')

# ================================================================== II. march (0.94 - 1.875)
t_cut = HIT['cut'][0]
at(impact(.6, 1.5, .4), t_cut, .55, 0, 'hit')
for k in range(2):                                    # marching drums: taiko on the beat, snare ruffs
    t0 = t_cut + b(k)
    at(taiko(1.0, 1.1, 110, 55), t0, .75, -.1, 'music')
    for j, off in enumerate((b(.5), b(.75))):
        at(snare(.5), t0 + off, .45 + j * .1, .2, 'music')
for j in range(8):                                    # footsteps on 8ths
    at(lp(noise(.08), 900) * exp_env(int(.08 * SR), .02), t_cut + j * b(.5), .35, (j % 2 - .5) * .4, 'sfx')
# ostinato strings (driven saws) in 8ths, rising into the whip
for j in range(8):
    f = [D2, D2, D2, F2, D2, D2, E2, F2][j]
    s = lp(supersaw(f, b(.5) * .9, 5, .008), 900 + j * 120) * adsr(int(b(.5) * .9 * SR), .005, .1, .7, .04)
    at(s, t_cut + j * b(.5), .28, 0, 'music')
at(reverse_crash(.8, .9), HIT['whip'][0] - .8, .5, 0, 'sfx')

# ================================================================== III. the boss (1.875 - 3.75)
t_w = HIT['whip'][0]
at(whoosh(.42, 1.0, 300, 5000, -1, 1), t_w - .12, .8, 0, 'sfx')
at(sub_drop(.8, 1.2, 80, 30), t_w + .2, .7, 0, 'hit')
at(choir([hz(50), hz(53), hz(57)], 1.9, 1.0, 'oh'), t_w, .9, 0, 'music')
t_you = HIT['word'][0]
at(braam(D2, .5, .9, 900), t_you, .5, 0, 'music')
at(taiko(1.0, 1.2), t_you, .6, 0, 'hit')
t_boss = HIT['impact'][0]
at(impact(1.3, 3.2, 1.0), t_boss, 1.0, 0, 'hit')
at(braam(D1 * 2, 2.6, 1.0, 2600), t_boss, 1.0, 0, 'hit')
at(crash(.9, 2.6), t_boss, .55, 0, 'hit')
at(growl(62, 1.4, 1.0), t_boss + .05, .8, .1, 'sfx')
at(choir([hz(50), hz(53), hz(57), hz(62)], 1.8, 1.0, 'ah'), t_boss, 1.1, 0, 'music')
# held breath: heartbeat
for k, tt in enumerate((3.28125, 3.28125 + .28)):
    at(kick(.9 - k * .2, .4, 90, 40), tt, .7, 0, 'music')

# ================================================================== IV. build (3.75 - 5.625)
t_deal = HIT['deal'][0]
at(impact(.7, 1.6, .6), t_deal, .7, 0, 'hit')
for k in range(4):                                     # four cards flick out of the hand
    at(slash(.8, .12), t_deal + .02 + k * .045, .35, -.45 + k * .3, 'sfx')
for k, tr in enumerate(HIT['room']):
    at(taiko(1.0, 1.4, 95, 40), tr, 1.0, 0, 'hit')
    at(lp(noise(.5), 1400) * exp_env(int(.5 * SR), .08), tr, .8, 0, 'hit')      # stone crunch
    at(blip(hz([74, 77, 81, 86][k]), 1.0, .09), tr + .01, .35, -.3 + k * .2, 'sfx')
    at(slash(.6, .16), tr - .16, .3, -.6 + k * .4, 'sfx')                      # the card's flight
    # the trap fires once as a preview
    fx = [ice_crack(.6, .6), clang(.8, .8, 520), fire_burst(.7, .7), zap(.5, .7)][k]
    at(fx, tr + .03, .45, -.3 + k * .2, 'sfx')
at(riser(.55, 300, 6000, .9), 5.5 - .42, .55, 0, 'sfx')
at(whoosh(.25, 1.0, 600, 7000, 0, 0), 5.5, .6, 0, 'sfx')

# ================================================================== the groove (3.75 - 12.66)
G0, G1 = 3.75, 12.65625
def groove_bar(bar):
    return 3.75 + (bar - 2) * 4 * B

kick_times = []
for bar in range(2, 7):
    t0 = groove_bar(bar)
    for beat in range(4):
        tb = t0 + b(beat)
        if tb >= G1 - .01:
            continue
        # the build bar is half-time (the slams are the drums)
        if bar == 2 and beat % 2 == 1:
            continue
        at(kick(1.0), tb, .95, 0, 'music'); kick_times.append(tb)
        if bar >= 3 and beat in (1, 3):
            at(clap(.8), tb, .5, .1, 'music'); at(snare(.6), tb, .35, -.1, 'music')
        for h8 in range(2):
            at(hat(.5, open_=(h8 == 1 and beat == 3)), tb + b(.5) * h8, .22, .3 if h8 else -.3, 'music')
        if bar >= 4:
            for s16 in (1, 3):
                at(hat(.3), tb + b(.25) * s16, .14, .5, 'music')
    # bass 8ths
    for j, m in enumerate(BASS[bar]):
        tb = t0 + j * b(.5)
        if tb >= G1 - .02:
            continue
        s = lp(supersaw(hz(m), b(.5) * .85, 3, .006) + np.sin(2 * np.pi * phase(hz(m) / 2, int(b(.5) * .85 * SR))) * .9, 700)
        at(s * adsr(len(s), .004, .08, .8, .03), tb, .42, 0, 'music')
    # chip arp 16ths (the game's own voice) from bar 3 on
    if bar >= 3:
        ch = CHORDS[bar]
        for j in range(16):
            tb = t0 + j * b(.25)
            if tb >= G1 - .02:
                continue
            m = ch[[0, 1, 2, 3, 2, 1, 2, 3][j % 8]] + (12 if j >= 8 and bar == 6 else 0)
            at(chip_sq(hz(m), b(.25) * .8, 1.0, .25, tau=.07), tb, .16, (-.35 if j % 2 else .35), 'music')
            at(chip_sq(hz(m + 12), b(.25) * .6, 1.0, .125, tau=.04), tb + b(.75), .05, (.35 if j % 2 else -.35), 'music')   # echo
    # bar-start crash (not on the build)
    if bar >= 3:
        at(crash(.5, 1.6), t0, .25, 0, 'music')

# ================================================================== V. traps (5.625 - 8.44)
COMBO = [5.625, 6.5625, 7.5, 7.96875]
for k, tc in enumerate(COMBO):                       # the combo counter ticks up in pitch
    at(coin(1.0, hz(79 + k * 3)), tc + .06, .28, .5, 'sfx')
t_fr = HIT['frost'][0]
at(ice_crack(1.4, 1.0), t_fr + .02, .9, -.1, 'hit')
at(impact(.7, 1.6, .5), t_fr, .6, 0, 'hit')
for f in (2637, 3520, 4186):
    tt = T(1.2); at(np.sin(2 * np.pi * f * tt) * exp_env(len(tt), .5) * .12, t_fr + .1, .8, .3, 'sfx')
t_sp = HIT['spike'][0]
at(clang(1.0, 1.4, 380), t_sp, 1.0, -.1, 'hit')
at(impact(1.0, 2.0, .9), t_sp, .9, 0, 'hit')
glass = np.zeros(int(1.0 * SR))
for k in range(40):                                     # the ice shatters: a spray of glassy ticks
    i = int((k * .017 + (k % 7) * .003) * SR)
    m = min(len(glass) - i, int(.03 * SR))
    glass[i:i + m] += hp(noise_n(m), 4000) * exp_env(m, .004) * (1 - k / 45)
at(glass, t_sp + .1, .8, .2, 'hit')
t_fl = HIT['flame'][0]
at(fire_burst(1.1, 1.0), t_fl + .08, 1.0, .1, 'hit')
at(whoosh(.35, 1.0, 200, 3000, -.8, .8), t_fl, .6, 0, 'sfx')
at(impact(.8, 1.4, .5), t_fl + .1, .7, 0, 'hit')
t_te = HIT['tesla'][0]
for k, z in enumerate((.05, .15, .25)):
    at(zap(.35, 1.0), t_te + z, .7, -.4 + k * .4, 'hit')
at(impact(.7, 1.2, .6), t_te + .05, .6, 0, 'hit')

# ================================================================== VI. monsters (8.44 - 10.78)
t_rm = HIT['word'][1]
at(growl(55, 1.3, 1.0), t_rm, .9, 0, 'sfx')
at(impact(.9, 2.0, .7), t_rm, .8, 0, 'hit')
MON_FX = [lambda: taiko(1.0, .9, 90, 38),
          lambda: fire_burst(.8, 1.0),
          lambda: lp(noise(.5), 600) * np.sin(2 * np.pi * 7 * T(.5)) * exp_env(int(.5 * SR), .15) * 1.5]
for k, tp in enumerate(HIT['panel']):
    at(whoosh(.2, 1.0, 500, 6000, (-1) ** (k + 1), (-1) ** k), tp - .16, .6, 0, 'sfx')
    at(impact(.8, 1.3, .6), tp, .75, (-.5, 0, .5)[k], 'hit')
    th = tp + b(.5)                                     # the monster strikes an 8th later
    at(MON_FX[k](), th, .8, (-.5, 0, .5)[k], 'hit')
    if k == 0:
        at(growl(60, .6, .8), th - .05, .6, -.5, 'sfx')
    for c in range(5):                                  # the hero pops into gold
        at(coin(.6, hz(84 + c * 2)), th + .08 + c * .035, .12, (-.5, 0, .5)[k], 'sfx')
t_ah = HIT['allhit'][0]
at(impact(1.2, 2.2, 1.0), t_ah, 1.0, 0, 'hit')
at(crash(.8, 2.0), t_ah, .5, 0, 'hit')
at(whoosh(.45, 1.0, 400, 6000, -1, 1), t_ah, .7, 0, 'sfx')

# ================================================================== VII. champion (10.78 - 11.72)
t_bn = HIT['banner'][0]
horn_f = [A1, Bb1]
for k, f in enumerate(horn_f):                          # a war horn, a minor second of dread
    at(braam(f * 2, .42, 1.0, 1400), t_bn + k * b(.5), .55, 0, 'music')
for k in range(8):                                      # snare roll into the smash
    at(snare(.4 + k * .07), t_bn + k * b(.125) * 1.0, .3 + k * .04, -.2 + (k % 2) * .4, 'music')
t_sm = HIT['smash'][0]
at(impact(1.4, 2.6, 1.0), t_sm, 1.1, 0, 'hit')
at(crash(1.0, 2.2), t_sm, .5, 0, 'hit')
for k in range(12):                                     # stone chunks landing
    at(lp(noise(.12), 1800) * exp_env(int(.12 * SR), .03), t_sm + .12 + k * .045 + (k % 3) * .02, .35 * (1 - k / 14), ((k * 37) % 100 - 50) / 60, 'sfx')

# ================================================================== VIII. overdrive (11.72 - 12.66)
t_nv = HIT['nova'][0]
NOVA = 11.953125
at(riser(NOVA - t_nv + .05, 150, 4000, 1.0), t_nv, .75, 0, 'sfx')
at(reverse_crash(NOVA - t_nv, 1.0), t_nv, .6, 0, 'sfx')
at(impact(1.5, 3.0, 1.0), NOVA, 1.2, 0, 'hit')
at(braam(D1 * 2, 1.6, 1.0, 3200), NOVA, 1.0, 0, 'hit')
at(choir([hz(50), hz(57), hz(62), hz(65)], 1.2, 1.0, 'ah'), NOVA, 1.2, 0, 'hit')
at(whoosh(.7, 1.0, 200, 8000, 1, -1), NOVA, .8, 0, 'sfx')
for k in range(4):
    at(coin(.5, hz(88 + k * 3)), NOVA + .2 + k * .05, .12, -.5, 'sfx')

# ================================================================== IX. stop-down (12.66 - 13.125)
t_sd = HIT['stopdown'][0]
at(sub_drop(1.0, 1.0, 60, 26), t_sd, .8, 0, 'late')
at(kick(.7, .6, 70, 35), t_sd, .6, 0, 'late')
at(reverse_crash(13.125 - t_sd - .06, 1.0), t_sd, .3, 0, 'late')
rev_sw = riser(13.125 - t_sd - .06, 100, 1200, 1.0, tone=False)
at(rev_sw, t_sd, .22, 0, 'late')

# ================================================================== X. logo (13.125 - 15)
t_lg = HIT['logo'][0]
at(impact(1.6, 4.0, 1.0), t_lg, 1.25, 0, 'late')
at(braam(D1 * 2, 3.2, 1.0, 3600), t_lg, 1.1, 0, 'late')
at(crash(1.0, 3.5), t_lg, .6, 0, 'late')
n = int(3.6 * SR); tg = T(3.6)
gong = np.zeros(n)
for f, a in [(D3, 1.0), (D3 * 1.504, .5), (D3 * 2.51, .3), (D3 * 3.98, .16), (D3 * .5, .55)]:
    gong += np.sin(2 * np.pi * f * tg + .3 * np.sin(2 * np.pi * f * 2.756 * tg)) * a
at(gong * np.exp(-tg / 1.3) / 2.6, t_lg, .8, 0, 'late')
at(choir([hz(50), hz(57), hz(62), hz(65), hz(69)], 1.87, 1.0, 'ah'), t_lg, 1.1, 0, 'late')
for k, m in enumerate([62, 65, 69, 74, 77, 81]):     # the chiptune fanfare, up the D minor chord
    at(chip_sq(hz(m), .12, 1.0, .25, tau=.12), t_lg + .05 + k * .05, .2, -.3 + k * .12, 'late')
at(chip_sq(hz(86), .9, 1.0, .5, vib=.01, tau=.4), t_lg + .35, .16, 0, 'late')
t_cta = HIT['cta'][0]
at(blip(hz(86), 1.0, .08), t_cta, .3, 0, 'late')
at(blip(hz(93), 1.0, .12), t_cta + .08, .25, 0, 'late')
at(riser(.3, 2000, 9000, .6, tone=False), t_cta - .3, .25, 0, 'late')
t_rg = HIT['ring'][0]
for f, a in [(hz(74), .5), (hz(81), .35), (hz(86), .25)]:
    tt = T(1.6); at(np.sin(2 * np.pi * f * tt) * exp_env(len(tt), .45) * a, t_rg, .5, 0, 'late')
at(sub_drop(.6, 1.4, 60, 30), t_rg, .5, 0, 'late')
for k, m in enumerate([93, 98, 105]):                  # 14.53: the glint across HEROES
    at(chip_sq(hz(m), .1, 1.0, .5, tau=.08), 14.53 + k * .06, .1, -.4 + k * .4, 'late')

# ================================================================== mix
# sidechain: the music ducks under every big hit
duck_hits = [(t, 1.0) for t in (HIT['impact'] + HIT['room'] + [t_sp, t_fl, t_rm, t_ah, t_sm, NOVA, t_lg])]
duck_hits += [(t, .35) for t in kick_times]
dk = duck_env(N, duck_hits, depth=.55, release=.16)
# audio hit-stops: the music gasps for the frozen frames
gate = np.ones(N)
for t0, d in [(t_sp + 1 / 60, 6 / 60), (t_sm, 5 / 60)]:
    i0, i1 = int(t0 * SR), int((t0 + d) * SR)
    gate[i0:i1] = .12
    gate[i1:i1 + 800] = np.linspace(.12, 1, min(800, N - i1))
# the stop-down cuts everything that came before it (tails included) to a whisper
i_sd = int(t_sd * SR)
cut = np.ones(N); cut[i_sd:i_sd + 3000] = np.linspace(1, .05, 3000); cut[i_sd + 3000:] = .05
cut[int(t_lg * SR):] = 0
for k in ('music', 'sfx', 'hit'):
    for arr in BUS[k]:
        arr *= cut
# four frames of true silence before the logo
sil0, sil1 = int((13.125 - 4 / 60) * SR), int(13.125 * SR)
for arr in BUS['late']:
    arr[sil0 - 600:sil0] *= np.linspace(1, 0, 600)
    arr[sil0:sil1] = 0

def mixdown(keys, gains):
    L = sum(BUS[k][0] * g_ for k, g_ in zip(keys, gains)); R = sum(BUS[k][1] * g_ for k, g_ in zip(keys, gains))
    return L, R
L, R = mixdown(('music', 'sfx', 'hit', 'late'), (.75, .9, 1.0, 1.0))
# reverb on the mids and highs only (no low-end mud), silenced in the pre-logo gap
sendL, sendR = hp(L, 280), hp(R, 280)
wl, wr = reverb(sendL, sendR, wet=1.0, dur=2.2)
wl -= sendL; wr -= sendR
gapmask = np.ones(N); gapmask[sil0:sil1] = 0
L = L + wl * .2 * gapmask; R = R + wr * .2 * gapmask
L, R = hp(L, 30), hp(R, 30)
# low shelf: the synth kit is sub-heavy; keep the weight but give phones and laptops the mids
L = L - lp(L, 95) * .62; R = R - lp(R, 95) * .62
# a touch of presence where the chip lead and the callouts live
L = L + bp(L, 1800, 5000) * .35; R = R + bp(R, 1800, 5000) * .35
# loudness: normalise to -11 dBFS RMS, then a soft knee on the peaks
M = int(CUES['dur'] * SR)
rms = np.sqrt(np.mean(np.concatenate([L[:M], R[:M]]) ** 2))
g_ = 10 ** ((-11.0 - 20 * np.log10(rms)) / 20)
def soft(x, k=.72):
    a = np.abs(x)
    return np.where(a < k, x, np.sign(x) * (k + (1 - k) * np.tanh((a - k) / (1 - k))))
L, R = soft(L * g_) * .97, soft(R * g_) * .97
L, R = L[:M].copy(), R[:M].copy()
tail = int(.35 * SR)                                  # ring out, but land on silence exactly at 15.0
L[-tail:] *= np.linspace(1, 0, tail) ** 2; R[-tail:] *= np.linspace(1, 0, tail) ** 2
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'trailer.wav')
write_wav(out, L, R)
print('wrote', out, f'{M / SR:.2f}s', 'peak', float(max(np.abs(L).max(), np.abs(R).max())))
